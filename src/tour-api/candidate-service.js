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

async function fetchBarrierDetails(items, detailLimit, useCache) {
  const selected = items.slice(0, detailLimit);
  const entries = await Promise.all(
    selected.map(async (item) => {
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
    }),
  );

  return new Map(entries);
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

  const [koreanResult, englishResult, barrierResult] = await Promise.all([
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
  const barrierDetails = await fetchBarrierDetails(
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
      barrierDetailCount: barrierDetails.size,
    },
  };
}
