import {
  callTourApi,
  extractTourItems,
  tourTotalCount,
} from "./client.js";
import { TOUR_LANG_SERVICE, resolveTourLang } from "./config.js";
import {
  matchTourItems,
  normalizeTourCandidate,
} from "./mapper.js";
import { dedupeSamePlace } from "./dedupe.js";
import { fetchKoreanIntro } from "./intro.js";
import { openNowFromSchedule } from "./schedule.js";

export const ORIGIN_KIND = Object.freeze({
  USER_SELECTED_FIXED: "USER_SELECTED_FIXED",
});

export function validateCandidateQuery({ origin, radiusMeters }) {
  if (origin?.kind !== ORIGIN_KIND.USER_SELECTED_FIXED) {
    throw new Error(
      "MVP는 사용자가 선택한 병원·숙소 고정 좌표만 허용합니다.",
    );
  }

  const lat = Number(origin.lat);
  const lng = Number(origin.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat <= 33 ||
    lat >= 39 ||
    lng <= 124 ||
    lng >= 132
  ) {
    throw new Error("대한민국 범위의 유효한 고정 좌표가 필요합니다.");
  }

  const radius = Number(radiusMeters);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 20_000) {
    throw new Error("TourAPI 위치기반 조회 반경은 1~20,000m여야 합니다.");
  }

  return {
    origin: { kind: origin.kind, lat, lng },
    radiusMeters: radius,
  };
}

function summarizeMatches(matches) {
  const matched = matches.filter((match) => match.localized);
  return {
    totalPrimary: matches.length,
    matched: matched.length,
    byStrategy: matched.reduce((counts, match) => {
      counts[match.matchStrategy] = (counts[match.matchStrategy] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

async function fetchLocationList({
  serviceName,
  origin,
  radiusMeters,
  numOfRows,
  useCache,
}) {
  return callTourApi({
    serviceName,
    operation: "locationBasedList2",
    parameters: {
      mapX: String(origin.lng),
      mapY: String(origin.lat),
      radius: String(radiusMeters),
      arrange: "E",
      numOfRows: String(numOfRows),
      pageNo: "1",
    },
    useCache,
  });
}

/** 조회 실패 표식 — "데이터 없음(null)"과 구분한다 */
const FAILED = Symbol("barrier-detail-failed");

async function fetchBarrierDetails(items, detailLimit, useCache) {
  const selected = items.slice(0, detailLimit);
  const entries = await Promise.all(
    selected.map(async (item) => {
      try {
        const result = await callTourApi({
          serviceName: "barrierFree",
          operation: "detailWithTour2",
          parameters: {
            contentId: String(item.contentid),
            numOfRows: "10",
            pageNo: "1",
          },
          useCache,
        });

        return [String(item.contentid), extractTourItems(result)[0] ?? null];
      } catch {
        // 무장애 상세는 보강 신호다. 실패해도 후보 자체를 잃지 않는다.
        // 신호가 없으면 보행부담 보정을 적용하지 않을 뿐이다 (D04-BR012).
        return [String(item.contentid), FAILED];
      }
    }),
  );

  // 조회 실패와 "조회했으나 데이터 없음"을 구분한다. 실패를 성공처럼 세면
  // 증빙 문서의 barrierDetailCount 가 실제보다 부풀려진다.
  const details = new Map(
    entries.filter(([, value]) => value !== FAILED),
  );
  const failedIds = entries
    .filter(([, value]) => value === FAILED)
    .map(([contentId]) => contentId);

  return { details, failedIds };
}

/**
 * 추천 후보의 국문 소개정보(운영·휴무 + 식당 메뉴 원문)를 조회한다.
 *
 * 목록 조회(`locationBasedList2`)는 운영시간을 주지 않는다. 끝난 축제나 정기 휴무일에
 * 회복기 환자를 보내지 않으려면 상세를 따로 봐야 한다. 전체가 아니라 **가까운 순으로
 * 상위 몇 건만** 본다 — 실제로 추천될 수 있는 범위다. 같은 호출에 메뉴 원문도 들어 있어
 * 식이 신호에 함께 싣는다(추가 호출 없음). 나머지 후보는 detail-service.js 의
 * enrichCandidateIntros 로 필요할 때만 보강한다.
 *
 * 조회 실패는 닫힘이 아니다. 실패하면 그 후보의 openNow 는 null 로 남는다.
 */
async function fetchIntros(items, limit, useCache) {
  const selected = items.slice(0, limit);
  const entries = await Promise.all(
    selected.map(async (item) => {
      try {
        const intro = await fetchKoreanIntro({
          contentId: item.contentid,
          contentTypeId: item.contenttypeid,
          useCache,
        });
        return [String(item.contentid), intro];
      } catch {
        // 상세 조회 실패로 후보를 지우지 않는다 (D06-E005 안전한 미추천의 반대 방향)
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}

/**
 * 운영·휴무 원문에서 읽은 닫힘을 태그에 실어 보낸다.
 * **닫힘만 덮어쓴다** — "열려 있다" 는 어디서도 만들지 않는다.
 */
function withScheduleClosure(tags, schedule, koreanId, closedIds, now) {
  if (!schedule) return tags;
  if (openNowFromSchedule(schedule, now) !== false) return tags;
  closedIds.add(koreanId);
  return { ...tags, openNow: false };
}

/** 외국어 목록 서비스 — 매칭·진단 순서 */
const LOCALIZED_SERVICES = Object.freeze(["english", "japanese", "chineseSimplified"]);

/**
 * 실시간 TourAPI 응답을 SafeHour 엔진 후보로 바꾸는 정상 서비스 경로.
 *
 * 조회 서비스 (spec 4.8 출처와 언어)
 *   - 국문(KorService2)과 무장애(KorWithService2)는 항상 조회한다.
 *   - lang 이 en·ja·zh 이면 그 언어 서비스를 하나 더한다. ko 이면 더하지 않는다.
 *   - 일문·중문 서비스가 실패하면(키 미신청 포함) 영문으로 대체한다.
 *     영문도 없으면 국문을 보여주고 '번역 필요'를 표시한다.
 *   - 4개 언어를 모두 조회하지 않는다 — 호출량 때문에 버린 대안이다(handoff 4장).
 *
 * lang 을 주지 않으면 기존 경로다: 영문을 조회하고 중복 제거에서 영문 원문을 우선한다.
 * lang 을 주면 판정 입력이 언어와 무관해진다: 신호는 국문 원문으로만 만들고, 중복 제거도
 * 국문 제목·사진·순서로만 고른다(spec 4.17, 규칙 27).
 *
 * @param {object} options
 * @param {"ko"|"en"|"ja"|"zh"} [options.lang] 관광 데이터 표시 언어
 */
export async function loadSafeHourCandidates({
  origin,
  radiusMeters = 3_000,
  numOfRows = 100,
  barrierDetailLimit = 3,
  scheduleDetailLimit = 5,
  now = new Date(),
  tagsByKoreanContentId = {},
  useCache = true,
  lang,
}) {
  const query = validateCandidateQuery({ origin, radiusMeters });
  const boundedRows = Math.min(Math.max(Number(numOfRows) || 1, 1), 1_000);
  const tourLang = resolveTourLang(lang);
  const displayLang = tourLang ?? "en";
  const selectedService = TOUR_LANG_SERVICE[displayLang] ?? null;

  const queried = [];
  const list = (serviceName) => {
    queried.push(serviceName);
    return fetchLocationList({
      serviceName,
      ...query,
      numOfRows: boundedRows,
      useCache,
    });
  };

  // 국문 관광정보는 후보의 근간이므로 실패하면 안전한 미추천으로 간다 (D06-E005).
  // 외국어·무장애는 보강 데이터이므로 실패해도 국문 후보로 서비스를 계속한다
  // (D02-S001 대체 흐름: 번역 원문이 없으면 국문 폴백과 번역 필요 상태를 표시).
  const [koreanSettled, barrierSettled, selectedSettled] = await Promise.allSettled([
    list("korean"),
    list("barrierFree"),
    selectedService ? list(selectedService) : Promise.resolve(null),
  ]);

  if (koreanSettled.status === "rejected") throw koreanSettled.reason;

  const koreanResult = koreanSettled.value;
  const barrierResult =
    barrierSettled.status === "fulfilled" ? barrierSettled.value : null;
  const degraded = {
    english: false,
    barrierFree: barrierSettled.status === "rejected",
  };

  // 선택 언어 → 영문 → 국문 폴백
  const localizedResults = {};
  let usedService = null;
  let fallback = null;
  if (selectedService) {
    if (selectedSettled.status === "fulfilled") {
      localizedResults[selectedService] = selectedSettled.value;
      usedService = selectedService;
    } else {
      degraded[selectedService] = true;
      if (selectedService !== "english") {
        try {
          localizedResults.english = await list("english");
          usedService = "english";
          fallback = "ENGLISH";
        } catch {
          degraded.english = true;
          fallback = "KOREAN";
        }
      } else {
        fallback = "KOREAN";
      }
    }
  }

  const koreanItems = extractTourItems(koreanResult);
  const barrierItems = extractTourItems(barrierResult);
  const localizedItems = Object.fromEntries(
    LOCALIZED_SERVICES.map((serviceName) => [
      serviceName,
      extractTourItems(localizedResults[serviceName] ?? null),
    ]),
  );

  // 언어 간 매칭은 같은 contentId 이거나 같은 유형·20m 이내일 때만 한다 (mapper.js)
  const localizedMatches = Object.fromEntries(
    LOCALIZED_SERVICES.map((serviceName) => [
      serviceName,
      matchTourItems(koreanItems, localizedItems[serviceName]),
    ]),
  );
  const barrierMatches = matchTourItems(koreanItems, barrierItems);

  const byKoreanId = (matches) =>
    new Map(
      matches.map((match) => [String(match.primary.contentid), match.localized]),
    );
  const localizedByKoreanId = Object.fromEntries(
    LOCALIZED_SERVICES.map((serviceName) => [
      serviceName,
      byKoreanId(localizedMatches[serviceName]),
    ]),
  );
  const barrierByKoreanId = byKoreanId(barrierMatches);

  const matchedBarrierItems = barrierMatches
    .map((match) => match.localized)
    .filter(Boolean);
  const { details: barrierDetails, failedIds: barrierDetailFailedIds } =
    await fetchBarrierDetails(
      matchedBarrierItems,
      Math.max(0, Number(barrierDetailLimit) || 0),
      useCache,
    );

  const intros = await fetchIntros(
    koreanItems,
    Math.max(0, Number(scheduleDetailLimit) || 0),
    useCache,
  );
  const closedIds = new Set();

  const rawCandidates = koreanItems.map((korean) => {
    const koreanId = String(korean.contentid);
    const barrierFree = barrierByKoreanId.get(koreanId);
    const intro = intros.get(koreanId) ?? null;

    return normalizeTourCandidate({
      korean,
      english: localizedByKoreanId.english.get(koreanId),
      japanese: localizedByKoreanId.japanese.get(koreanId),
      chineseSimplified: localizedByKoreanId.chineseSimplified.get(koreanId),
      barrierFree,
      barrierFreeDetail: barrierFree
        ? barrierDetails.get(String(barrierFree.contentid))
        : null,
      intro,
      tags: withScheduleClosure(
        tagsByKoreanContentId[koreanId] ?? {},
        intro?.schedule,
        koreanId,
        closedIds,
        now,
      ),
      now,
      lang: displayLang,
    });
  });

  // 같은 장소가 contentId 를 달리해 두 번 등록된 경우를 합친다.
  // 추천은 3건뿐이라 중복 하나가 선택지를 실질 하나 줄인다.
  const { candidates, merged: mergedDuplicates } = dedupeSamePlace(rawCandidates, {
    languageNeutral: tourLang !== null,
  });

  const localizedQueried = LOCALIZED_SERVICES.filter(
    (serviceName) => serviceName !== "english" && queried.includes(serviceName),
  );
  const perService = (fn) =>
    Object.fromEntries(localizedQueried.map((serviceName) => [serviceName, fn(serviceName)]));

  return {
    origin: query.origin,
    radiusMeters: query.radiusMeters,
    candidates,
    diagnostics: {
      // 폴백이 일어났으면 화면이 불확실성을 표시할 수 있게 남긴다
      degraded,
      language: {
        requested: displayLang,
        service: usedService,
        fallback,
        queried: [...queried],
      },
      totals: {
        korean: tourTotalCount(koreanResult),
        english: tourTotalCount(localizedResults.english ?? null),
        barrierFree: tourTotalCount(barrierResult),
        ...perService((serviceName) => tourTotalCount(localizedResults[serviceName])),
      },
      received: {
        korean: koreanItems.length,
        english: localizedItems.english.length,
        barrierFree: barrierItems.length,
        ...perService((serviceName) => localizedItems[serviceName].length),
      },
      matching: {
        english: summarizeMatches(localizedMatches.english),
        barrierFree: summarizeMatches(barrierMatches),
        ...perService((serviceName) => summarizeMatches(localizedMatches[serviceName])),
      },
      // 조회에 성공한 건수만 센다 (실패는 barrierDetailFailed 로 분리)
      duplicatesMerged: mergedDuplicates.length,
      duplicates: mergedDuplicates,
      scheduleCount: intros.size,
      scheduleClosedCount: closedIds.size,
      barrierDetailCount: barrierDetails.size,
      barrierDetailFailed: barrierDetailFailedIds.length,
    },
  };
}

/**
 * (기준점, 반경, 언어) 조합 키. 같은 조합은 목록을 한 번만 조회한다 (spec 4.8 호출 방식).
 * 기준점 검증을 먼저 한다 — 허용하지 않는 좌표는 키도 만들지 않는다.
 * 키는 메모리 안에서만 쓴다. 좌표가 들어 있으므로 로그에 남기지 않는다.
 */
export function candidateQueryKey({ origin, radiusMeters = 3_000, lang } = {}) {
  const query = validateCandidateQuery({ origin, radiusMeters });
  return JSON.stringify([
    query.origin.lat,
    query.origin.lng,
    query.radiusMeters,
    resolveTourLang(lang) ?? "default",
  ]);
}

/**
 * 체류 전체 일정용 후보 로더. 날짜마다 같은 숙소·반경을 요청해도 목록 조회는 한 번이다.
 * 실패도 기억한다 — 같은 요청 안에서 재시도로 호출량을 늘리지 않고, 날짜마다 결과가
 * 달라지지 않게 한다. 로더는 요청(일정 생성) 하나마다 새로 만든다.
 *
 * @param {object} [defaults] loadSafeHourCandidates 에 넘길 공통 옵션 (useCache, now 등)
 * @param {Function} [defaults.loader] 테스트 주입용 (기본 loadSafeHourCandidates)
 */
export function createCandidateLoader({ loader = loadSafeHourCandidates, ...defaults } = {}) {
  const memo = new Map();
  return {
    load(query = {}) {
      const options = { ...defaults, ...query };
      let key;
      try {
        key = candidateQueryKey(options);
      } catch (error) {
        return Promise.reject(error);
      }
      if (!memo.has(key)) memo.set(key, loader(options));
      return memo.get(key);
    },
    get size() {
      return memo.size;
    },
  };
}
