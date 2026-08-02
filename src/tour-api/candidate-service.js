import {
  callTourApi,
  extractTourItems,
  tourTotalCount,
} from "./client.js";
import {
  matchTourItems,
  normalizeTourCandidate,
} from "./mapper.js";

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
 * 실시간 TourAPI 응답을 SafeHour 엔진 후보로 바꾸는 정상 서비스 경로.
 */
export async function loadSafeHourCandidates({
  origin,
  radiusMeters = 3_000,
  numOfRows = 100,
  barrierDetailLimit = 3,
  tagsByKoreanContentId = {},
  useCache = true,
}) {
  const query = validateCandidateQuery({ origin, radiusMeters });
  const boundedRows = Math.min(Math.max(Number(numOfRows) || 1, 1), 1_000);

  // 국문 관광정보는 후보의 근간이므로 실패하면 안전한 미추천으로 간다 (D06-E005).
  // 영문·무장애는 보강 데이터이므로 실패해도 국문 후보로 서비스를 계속한다
  // (D02-S001 대체 흐름: 영문이 없으면 국문 폴백과 번역 필요 상태를 표시).
  const [koreanSettled, englishSettled, barrierSettled] = await Promise.allSettled([
    fetchLocationList({
      serviceName: "korean",
      ...query,
      numOfRows: boundedRows,
      useCache,
    }),
    fetchLocationList({
      serviceName: "english",
      ...query,
      numOfRows: boundedRows,
      useCache,
    }),
    fetchLocationList({
      serviceName: "barrierFree",
      ...query,
      numOfRows: boundedRows,
      useCache,
    }),
  ]);

  if (koreanSettled.status === "rejected") throw koreanSettled.reason;

  const koreanResult = koreanSettled.value;
  const englishResult =
    englishSettled.status === "fulfilled" ? englishSettled.value : null;
  const barrierResult =
    barrierSettled.status === "fulfilled" ? barrierSettled.value : null;
  const degraded = {
    english: englishSettled.status === "rejected",
    barrierFree: barrierSettled.status === "rejected",
  };

  const koreanItems = extractTourItems(koreanResult);
  const englishItems = extractTourItems(englishResult);
  const barrierItems = extractTourItems(barrierResult);
  const englishMatches = matchTourItems(koreanItems, englishItems);
  const barrierMatches = matchTourItems(koreanItems, barrierItems);

  const englishByKoreanId = new Map(
    englishMatches.map((match) => [
      String(match.primary.contentid),
      match.localized,
    ]),
  );
  const barrierByKoreanId = new Map(
    barrierMatches.map((match) => [
      String(match.primary.contentid),
      match.localized,
    ]),
  );
  const matchedBarrierItems = barrierMatches
    .map((match) => match.localized)
    .filter(Boolean);
  const { details: barrierDetails, failedIds: barrierDetailFailedIds } =
    await fetchBarrierDetails(
      matchedBarrierItems,
      Math.max(0, Number(barrierDetailLimit) || 0),
      useCache,
    );

  const candidates = koreanItems.map((korean) => {
    const koreanId = String(korean.contentid);
    const english = englishByKoreanId.get(koreanId);
    const barrierFree = barrierByKoreanId.get(koreanId);

    return normalizeTourCandidate({
      korean,
      english,
      barrierFree,
      barrierFreeDetail: barrierFree
        ? barrierDetails.get(String(barrierFree.contentid))
        : null,
      tags: tagsByKoreanContentId[koreanId] ?? {},
    });
  });

  return {
    origin: query.origin,
    radiusMeters: query.radiusMeters,
    candidates,
    diagnostics: {
      // 폴백이 일어났으면 화면이 불확실성을 표시할 수 있게 남긴다
      degraded,
      totals: {
        korean: tourTotalCount(koreanResult),
        english: tourTotalCount(englishResult),
        barrierFree: tourTotalCount(barrierResult),
      },
      received: {
        korean: koreanItems.length,
        english: englishItems.length,
        barrierFree: barrierItems.length,
      },
      matching: {
        english: summarizeMatches(englishMatches),
        barrierFree: summarizeMatches(barrierMatches),
      },
      // 조회에 성공한 건수만 센다 (실패는 barrierDetailFailed 로 분리)
      barrierDetailCount: barrierDetails.size,
      barrierDetailFailed: barrierDetailFailedIds.length,
    },
  };
}
