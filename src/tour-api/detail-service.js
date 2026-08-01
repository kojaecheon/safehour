import { callTourApi, extractTourItems } from "./client.js";

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

/**
 * 상세 API 원문은 손대지 않고, 화면용 필드는 별도로 생성한다.
 */
export function normalizeCandidateDetails({ korean, english }) {
  const preferredCommon = english?.common ?? korean?.common ?? null;
  const preferredIntro = english?.intro ?? korean?.intro ?? null;
  const preferredImages =
    english?.images?.length > 0 ? english.images : korean?.images ?? [];
  const schedule = nonEmptyFields(preferredIntro, SCHEDULE_FIELDS);

  return {
    overview: compactText(preferredCommon?.overview) || null,
    overviewLanguage: english?.common?.overview ? "en" : "ko",
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
    sources: [korean && "TourAPI:KorService2", english && "TourAPI:EngService2"].filter(
      Boolean,
    ),
    errors: [...(korean?.errors ?? []), ...(english?.errors ?? [])],
    original: {
      korean: korean
        ? {
            common: korean.common,
            intro: korean.intro,
            images: korean.images,
          }
        : null,
      english: english
        ? {
            common: english.common,
            intro: english.intro,
            images: english.images,
          }
        : null,
    },
  };
}

export async function fetchCandidateDetails(candidate, { useCache = true } = {}) {
  const koreanId = candidate.sourceIds?.korean;
  const englishId = candidate.sourceIds?.english;
  const contentTypes = candidate.sourceMetadata?.contentTypeIds ?? {};

  const [korean, english] = await Promise.all([
    koreanId && contentTypes.korean
      ? fetchLocaleDetails({
          serviceName: "korean",
          contentId: koreanId,
          contentTypeId: contentTypes.korean,
          useCache,
        })
      : null,
    englishId && contentTypes.english
      ? fetchLocaleDetails({
          serviceName: "english",
          contentId: englishId,
          contentTypeId: contentTypes.english,
          useCache,
        })
      : null,
  ]);

  return normalizeCandidateDetails({ korean, english });
}

/**
 * 호출량 절약을 위해 판정이 끝난 상위 추천에만 상세 API를 연결한다.
 */
export async function enrichRecommendedCourse(
  course,
  { limit = 3, useCache = true } = {},
) {
  const selected = course.slice(0, Math.max(0, Number(limit) || 0));
  const enriched = await Promise.all(
    selected.map(async (candidate) => ({
      ...candidate,
      details: await fetchCandidateDetails(candidate, { useCache }),
    })),
  );

  return [...enriched, ...course.slice(selected.length)];
}
