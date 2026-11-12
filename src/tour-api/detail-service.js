import { callTourApi, extractTourItems } from "./client.js";
import { fetchKoreanIntro } from "./intro.js";
import { applyIntro } from "./mapper.js";

const LEGACY_DETAIL_PARAMS = new Set([
  "defaultYN",
  "firstImageYN",
  "areacodeYN",
  "catcodeYN",
  "addrinfoYN",
  "mapinfoYN",
  "overviewYN",
  "subImageYN",
]);

const SCHEDULE_FIELDS = Object.freeze([
  "usetime",
  "usetimeculture",
  "usetimeleports",
  "opentime",
  "opentimefood",
  "opentimeshopping",
  "restdate",
  "restdateculture",
  "restdateleports",
  "restdatefood",
  "restdateshopping",
  "checkintime",
  "checkouttime",
  "eventstartdate",
  "eventenddate",
  "playtime",
  "starttime",
  "endtime",
]);

function compactText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonEmptyFields(source, fieldNames) {
  return Object.fromEntries(
    fieldNames
      .map((fieldName) => [fieldName, compactText(source?.[fieldName])])
      .filter(([, value]) => value),
  );
}

function normalizeImages(images) {
  return images
    .map((image) => ({
      url: compactText(image.originimgurl) || null,
      thumbnailUrl: compactText(image.smallimageurl) || null,
      name: compactText(image.imgname) || null,
      copyrightDivisionCode: compactText(image.cpyrhtDivCd) || null,
      serialNumber: compactText(image.serialnum) || null,
    }))
    .filter((image) => image.url);
}

export function validateDetailRequest(operation, parameters) {
  const legacyParameter = Object.keys(parameters).find((key) =>
    LEGACY_DETAIL_PARAMS.has(key),
  );
  if (legacyParameter) {
    throw new Error(
      `${operation}에서 폐기된 요청 파라미터를 사용할 수 없습니다: ${legacyParameter}`,
    );
  }

  if (!compactText(parameters.contentId)) {
    throw new Error(`${operation}에는 contentId가 필요합니다.`);
  }
  if (
    operation === "detailIntro2" &&
    !compactText(parameters.contentTypeId)
  ) {
    throw new Error("detailIntro2에는 contentTypeId가 필요합니다.");
  }
}

async function fetchDetailOperation({
  serviceName,
  operation,
  parameters,
  useCache,
}) {
  validateDetailRequest(operation, parameters);
  const result = await callTourApi({
    serviceName,
    operation,
    parameters: {
      ...parameters,
      numOfRows: parameters.numOfRows ?? "20",
      pageNo: parameters.pageNo ?? "1",
    },
    useCache,
  });
  return extractTourItems(result);
}

async function fetchLocaleDetails({
  serviceName,
  contentId,
  contentTypeId,
  useCache,
}) {
  const commonParameters = { contentId: String(contentId) };
  const results = await Promise.allSettled([
    fetchDetailOperation({
      serviceName,
      operation: "detailCommon2",
      parameters: commonParameters,
      useCache,
    }),
    fetchDetailOperation({
      serviceName,
      operation: "detailIntro2",
      parameters: {
        ...commonParameters,
        contentTypeId: String(contentTypeId),
      },
      useCache,
    }),
    fetchDetailOperation({
      serviceName,
      operation: "detailImage2",
      parameters: { ...commonParameters, imageYN: "Y" },
      useCache,
    }),
  ]);

  const [common, intro, images] = results;
  const errors = results
    .map((result, index) => {
      if (result.status === "fulfilled") return null;
      return {
        operation: ["detailCommon2", "detailIntro2", "detailImage2"][index],
        message: result.reason?.message ?? "알 수 없는 상세조회 오류",
      };
    })
    .filter(Boolean);

  return {
    serviceName,
    common: common.status === "fulfilled" ? common.value[0] ?? null : null,
    intro: intro.status === "fulfilled" ? intro.value[0] ?? null : null,
    images: images.status === "fulfilled" ? images.value : [],
    errors,
  };
}

/** 상세 서비스 → 표시 언어 코드 */
const SERVICE_LANG = Object.freeze({
  korean: "ko",
  english: "en",
  japanese: "ja",
  chineseSimplified: "zh",
});

const SERVICE_SOURCE = Object.freeze({
  korean: "TourAPI:KorService2",
  english: "TourAPI:EngService2",
  japanese: "TourAPI:JpnService2",
  chineseSimplified: "TourAPI:ChsService2",
});

/** 선택 언어 → 추가로 부르는 상세 서비스 (ko 는 국문만) — candidate-service.js 의 목록 조회와 같은 규칙 */
const DETAIL_LANG_SERVICE = Object.freeze({
  ko: null,
  en: "english",
  ja: "japanese",
  zh: "chineseSimplified",
});

/**
 * 표시 우선순위. lang 이 없으면 기존 동작(영문 → 국문)이다.
 * 선택 언어(ja·zh) → 영문 → 국문 (docs/business-rules.md '장소 후보와 필터', docs/platform/ITINERARY_RULES.md '출처와 언어': 선택 언어가 없거나 실패하면 영문, 영문도 없으면 국문)
 */
function preferenceOrder(lang) {
  switch (lang) {
    case "ko":
      return ["korean"];
    case "ja":
      return ["japanese", "english", "korean"];
    case "zh":
      return ["chineseSimplified", "english", "korean"];
    default:
      return ["english", "korean"];
  }
}

/**
 * 상세 API 원문은 손대지 않고, 화면용 필드는 별도로 생성한다.
 *
 * 필드마다 우선순위(preferenceOrder)의 첫 원문을 쓴다. 개요는 비어 있지 않은 첫 원문이고
 * `overviewLanguage` 에 그 언어를 적는다(개요가 없으면 "ko").
 * @param {{korean?: object, english?: object, japanese?: object, chineseSimplified?: object, lang?: "ko"|"en"|"ja"|"zh"}} locales
 */
export function normalizeCandidateDetails({ korean = null, english = null, japanese = null, chineseSimplified = null, lang } = {}) {
  const locales = { korean, english, japanese, chineseSimplified };
  const chain = preferenceOrder(lang)
    .map((name) => [name, locales[name]])
    .filter(([, locale]) => locale);
  const first = (pick) => chain.map(([name, locale]) => [name, pick(locale)]).find(([, value]) => value);

  const preferredCommon = first((l) => l.common)?.[1] ?? null;
  const preferredIntro = first((l) => l.intro)?.[1] ?? null;
  const preferredImages = first((l) => (l.images?.length > 0 ? l.images : null))?.[1] ?? [];
  const overviewSource = first((l) => compactText(l.common?.overview));
  const schedule = nonEmptyFields(preferredIntro, SCHEDULE_FIELDS);
  const fetched = Object.keys(SERVICE_LANG).filter((name) => locales[name]);

  const original = (locale) =>
    locale ? { common: locale.common, intro: locale.intro, images: locale.images } : null;

  return {
    overview: overviewSource?.[1] || null,
    overviewLanguage: overviewSource ? SERVICE_LANG[overviewSource[0]] : "ko",
    address:
      [preferredCommon?.addr1, preferredCommon?.addr2]
        .map(compactText)
        .filter(Boolean)
        .join(" ") || null,
    homepage: compactText(preferredCommon?.homepage) || null,
    telephone: compactText(preferredCommon?.tel) || null,
    operatingSchedule: schedule,
    openNow: null,
    openNowReason:
      Object.keys(schedule).length > 0
        ? "UNVERIFIED_SCHEDULE_TEXT"
        : "SCHEDULE_NOT_PROVIDED",
    images: normalizeImages(preferredImages),
    sources: fetched.map((name) => SERVICE_SOURCE[name]),
    errors: fetched.flatMap((name) => locales[name].errors ?? []),
    original: {
      korean: original(korean),
      english: original(english),
      japanese: original(japanese),
      chineseSimplified: original(chineseSimplified),
    },
  };
}

/** 선택 언어 상세를 쓸 수 있는가 — 기본 정보(detailCommon2) 항목이 있어야 한다. 없거나 실패면 영문으로 대체 */
function usableLocale(locale) {
  return Boolean(locale?.common);
}

/**
 * 장소 상세 (국문 + 선택 언어 서비스).
 *
 * candidate: `{ sourceIds: { korean, english, japanese?, chineseSimplified? },
 *               sourceMetadata: { contentTypeIds: { korean, english, japanese?, chineseSimplified? } } }`
 * 식별자와 유형 코드가 모두 있는 서비스만 부른다(추측한 ID 로 부르지 않는다).
 *
 * - lang 없음: 기존 동작 — 국문·영문을 함께 부르고 영문을 우선한다
 * - ko: 국문만. en: 국문·영문
 * - ja·zh: 국문·선택 언어. 선택 언어 식별자가 없거나 기본 정보를 못 받으면(실패·키 미신청·항목 없음) 영문을 더 부른다.
 *   영문도 없으면 국문을 보여주고 overviewLanguage 로 알린다(docs/business-rules.md '장소 후보와 필터')
 * @param {object} candidate
 * @param {{useCache?: boolean, lang?: "ko"|"en"|"ja"|"zh"}} [options]
 */
export async function fetchCandidateDetails(candidate, { useCache = true, lang } = {}) {
  const ids = candidate?.sourceIds ?? {};
  const contentTypes = candidate?.sourceMetadata?.contentTypeIds ?? {};
  const fetchLocale = (serviceName) => {
    const contentId = ids[serviceName];
    const contentTypeId = contentTypes[serviceName];
    return contentId && contentTypeId
      ? fetchLocaleDetails({ serviceName, contentId, contentTypeId, useCache })
      : Promise.resolve(null);
  };

  if (lang === undefined || lang === null) {
    const [korean, english] = await Promise.all([fetchLocale("korean"), fetchLocale("english")]);
    return normalizeCandidateDetails({ korean, english });
  }

  // 지원하지 않는 값은 en 으로 본다(docs/business-rules.md '언어': 그 외 전부 영어). ko 는 null, 국문만 부른다
  const selected = Object.prototype.hasOwnProperty.call(DETAIL_LANG_SERVICE, lang) ? DETAIL_LANG_SERVICE[lang] : "english";
  const [korean, primary] = await Promise.all([
    fetchLocale("korean"),
    selected ? fetchLocale(selected) : Promise.resolve(null),
  ]);
  const locales = { korean };
  if (selected) locales[selected] = primary;
  if (selected && selected !== "english" && !usableLocale(primary)) {
    locales.english = await fetchLocale("english");
  }
  return normalizeCandidateDetails({ ...locales, lang: SERVICE_LANG[selected ?? "korean"] });
}

/** 국문 소개정보를 이미 실은 후보인가 — 다시 부르지 않는다 */
function hasIntro(candidate) {
  const metadata = candidate?.sourceMetadata ?? {};
  return (
    metadata.schedule !== null &&
    metadata.schedule !== undefined &&
    metadata.menu !== null &&
    metadata.menu !== undefined
  );
}

/**
 * 요청받은 후보에만 국문 소개정보(detailIntro2)를 붙인다 — 식당 메뉴와 운영·휴무 원문 (AX-305).
 *
 * docs/platform/ITINERARY_RULES.md '호출 방식': 상세(메뉴 포함) 보강은 일정에 들어갈 후보와 교체 후보에만 한다.
 * 그래서 후보를 고르는 쪽(엔진·일정 조립)이 대상을 골라 넘긴다. 이 함수는 넘겨받은 것만 부른다.
 *
 *   - 대표메뉴(firstmenu)·취급메뉴(treatmenu) 원문은 sourceMetadata.menu 에,
 *     운영·휴무 원문은 sourceMetadata.schedule 에 싣고, 신호(signals)를 다시 계산한다.
 *   - 이미 실린 후보는 부르지 않는다(skipped).
 *   - 실패한 후보는 그대로 돌려준다. 메뉴는 모르는 상태(null)로 남고 id 가 failed 에 남는다.
 *   - 순서와 개수는 바뀌지 않는다.
 *
 * @param {object[]} candidates normalizeTourCandidate 결과 중 보강할 것
 * @param {{useCache?: boolean}} [options]
 * @returns {Promise<{candidates: object[], diagnostics: {requested: number, fetched: number, skipped: number, failed: string[]}}>}
 */
export async function enrichCandidateIntros(candidates, { useCache = true } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const outcomes = await Promise.all(
    list.map(async (candidate) => {
      if (hasIntro(candidate)) return { candidate, status: "skipped" };

      const contentId = candidate?.stop?.sourceIds?.ko ?? candidate?.sourceIds?.korean ?? null;
      const contentTypeId =
        candidate?.stop?.contentTypeIds?.ko ?? candidate?.sourceMetadata?.contentTypeIds?.korean ?? null;
      // 국문 원본이 없으면 국문 소개정보를 부를 수 없다. 추측한 ID로 부르지 않는다.
      if (!contentId || !contentTypeId) return { candidate, status: "failed" };

      try {
        const intro = await fetchKoreanIntro({ contentId, contentTypeId, useCache });
        return { candidate: applyIntro(candidate, intro), status: "fetched" };
      } catch {
        return { candidate, status: "failed" };
      }
    }),
  );

  return {
    candidates: outcomes.map((outcome) => outcome.candidate),
    diagnostics: {
      requested: list.length,
      fetched: outcomes.filter((outcome) => outcome.status === "fetched").length,
      skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
      failed: outcomes
        .filter((outcome) => outcome.status === "failed")
        .map((outcome) => String(outcome.candidate?.id ?? "")),
    },
  };
}
