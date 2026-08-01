const CONTENT_TYPE = Object.freeze({
  TOURIST_SPOT: "12",
  CULTURAL_FACILITY: "14",
  COURSE: "25",
  LEISURE: "28",
  LODGING: "32",
  SHOPPING: "38",
  FOOD: "39",
  FESTIVAL: "15",
});

// 영문 TourAPI는 국문과 다른 콘텐츠 유형 코드를 사용한다.
// 내부 판정에서는 국문 코드 체계로 정규화한 뒤 비교한다.
const ENGLISH_CONTENT_TYPE_TO_CANONICAL = Object.freeze({
  "75": CONTENT_TYPE.LEISURE,
  "76": CONTENT_TYPE.TOURIST_SPOT,
  "77": CONTENT_TYPE.COURSE,
  "78": CONTENT_TYPE.CULTURAL_FACILITY,
  "79": CONTENT_TYPE.SHOPPING,
  "80": CONTENT_TYPE.LODGING,
  "82": CONTENT_TYPE.FOOD,
  "85": CONTENT_TYPE.FESTIVAL,
});

const HEURISTICS = Object.freeze({
  [CONTENT_TYPE.TOURIST_SPOT]: {
    indoor: null,
    hasFood: false,
    walkMin: 25,
    stayMin: 45,
  },
  [CONTENT_TYPE.CULTURAL_FACILITY]: {
    indoor: true,
    hasFood: false,
    walkMin: 15,
    stayMin: 45,
  },
  [CONTENT_TYPE.COURSE]: {
    indoor: null,
    hasFood: false,
    walkMin: 35,
    stayMin: 60,
  },
  [CONTENT_TYPE.LEISURE]: {
    indoor: null,
    hasFood: false,
    walkMin: 35,
    stayMin: 60,
  },
  [CONTENT_TYPE.LODGING]: {
    indoor: true,
    hasFood: false,
    walkMin: 10,
    stayMin: 30,
  },
  [CONTENT_TYPE.SHOPPING]: {
    indoor: true,
    hasFood: false,
    walkMin: 15,
    stayMin: 40,
  },
  [CONTENT_TYPE.FOOD]: {
    indoor: true,
    hasFood: true,
    walkMin: 10,
    stayMin: 45,
  },
  [CONTENT_TYPE.FESTIVAL]: {
    indoor: null,
    hasFood: false,
    walkMin: 30,
    stayMin: 60,
  },
});

const UNKNOWN_HEURISTIC = Object.freeze({
  indoor: null,
  hasFood: false,
  walkMin: 30,
  stayMin: 45,
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecentModifiedTime(modifiedTime, now, maxAgeDays = 730) {
  if (!/^\d{14}$/.test(String(modifiedTime ?? ""))) return false;

  const value = String(modifiedTime);
  const modifiedAt = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(
      6,
      8,
    )}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`,
  );

  if (Number.isNaN(modifiedAt.getTime())) return false;
  return now.getTime() - modifiedAt.getTime() <= maxAgeDays * 86_400_000;
}

function accessibilitySignals(detail = {}) {
  const source = detail ?? {};
  const keys = [
    "route",
    "exit",
    "elevator",
    "wheelchair",
    "restroom",
    "parking",
  ];

  return keys.filter((key) => compactText(source[key])).map((key) => key);
}

function adjustWalkMinutes(baseWalkMin, signals) {
  if (signals.length === 0) return baseWalkMin;

  // 접근성 정보는 이동 가능성의 근거이지 실제 보행시간 측정값이 아니므로
  // 최대 20%까지만 보수적으로 부담 추정치를 낮춘다.
  const discountRatio = Math.min(0.2, signals.length * 0.04);
  return Math.max(5, Math.ceil(baseWalkMin * (1 - discountRatio)));
}

function haversineMeters(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitude1 = toRadians(a.lat);
  const latitude2 = toRadians(b.lat);

  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

function itemCoordinate(item) {
  const lat = finiteNumber(item?.mapy);
  const lng = finiteNumber(item?.mapx);
  return lat === null || lng === null ? null : { lat, lng };
}

export function canonicalContentType(contentTypeId) {
  const value = String(contentTypeId ?? "");
  return ENGLISH_CONTENT_TYPE_TO_CANONICAL[value] ?? value;
}

/**
 * 같은 언어권이 아닌 TourAPI 목록을 안전하게 연결한다.
 * ID 일치가 최우선이며, 좌표 매칭은 같은 콘텐츠 유형이면서 20m 이내일 때만 허용한다.
 */
export function matchTourItems(primaryItems, localizedItems) {
  const unusedLocalized = new Set(localizedItems);

  return primaryItems.map((primary) => {
    let localized = localizedItems.find(
      (item) => String(item.contentid) === String(primary.contentid),
    );
    let strategy = localized ? "contentId" : null;

    if (!localized) {
      const primaryCoordinate = itemCoordinate(primary);
      if (primaryCoordinate) {
        let nearest = null;

        for (const item of unusedLocalized) {
          if (
            canonicalContentType(item.contenttypeid) !==
            canonicalContentType(primary.contenttypeid)
          ) {
            continue;
          }

          const localizedCoordinate = itemCoordinate(item);
          if (!localizedCoordinate) continue;

          const distanceMeters = haversineMeters(
            primaryCoordinate,
            localizedCoordinate,
          );
          if (distanceMeters <= 20 && (!nearest || distanceMeters < nearest.distanceMeters)) {
            nearest = { item, distanceMeters };
          }
        }

        if (nearest) {
          localized = nearest.item;
          strategy = "coordinate20m";
        }
      }
    }

    if (localized) unusedLocalized.delete(localized);

    return {
      primary,
      localized: localized ?? null,
      matchStrategy: strategy,
    };
  });
}

/**
 * TourAPI 원문과 자체 태그를 섞지 않고 SafeHour 엔진 후보로 정규화한다.
 */
export function normalizeTourCandidate({
  korean,
  english,
  barrierFree,
  barrierFreeDetail,
  tags = {},
  now = new Date(),
}) {
  // 국문 항목을 정규화 기준으로 삼아 상세조회·폴백 연결키를 안정적으로 유지한다.
  // 국문이 없을 때만 영문 또는 무장애 항목을 기준으로 사용한다.
  const source = korean ?? english ?? barrierFree;
  if (!source) throw new Error("정규화할 TourAPI 원본이 없습니다.");

  const sourceContentTypeId = String(source.contenttypeid ?? "");
  const contentTypeId = canonicalContentType(sourceContentTypeId);
  const heuristic = HEURISTICS[contentTypeId] ?? UNKNOWN_HEURISTIC;
  const signals = accessibilitySignals(barrierFreeDetail);
  const lat = finiteNumber(source.mapy);
  const lng = finiteNumber(source.mapx);

  const title = compactText(english?.title) || compactText(korean?.title) || compactText(
    barrierFree?.title,
  );

  const indoor = tags.indoor ?? heuristic.indoor;
  const baseWalkMin = tags.walkMin ?? heuristic.walkMin;

  return {
    id: String(source.contentid),
    sourceIds: {
      korean: korean ? String(korean.contentid) : null,
      english: english ? String(english.contentid) : null,
      barrierFree: barrierFree ? String(barrierFree.contentid) : null,
    },
    title,
    titleLanguage: compactText(english?.title) ? "en" : "ko",
    needsTranslation: !compactText(english?.title) && Boolean(title),
    tourismEligible: contentTypeId !== CONTENT_TYPE.LODGING,
    lat,
    lng,
    indoor,
    hasFood: tags.hasFood ?? heuristic.hasFood,
    uvExposed: tags.uvExposed ?? (indoor === true ? false : null),
    walkMin: adjustWalkMinutes(baseWalkMin, signals),
    walkEstimateConfidence: tags.walkMin ? "verified" : "heuristic",
    stayMin: tags.stayMin ?? heuristic.stayMin,
    congestion: tags.congestion ?? null,
    openNow: tags.openNow ?? null,
    dataFresh: isRecentModifiedTime(source.modifiedtime, now),
    source: [
      korean && "TourAPI:KorService2",
      english && "TourAPI:EngService2",
      barrierFree && "TourAPI:KorWithService2",
    ].filter(Boolean),
    attribution: {
      imageUrl: compactText(source.firstimage) || null,
      thumbnailUrl: compactText(source.firstimage2) || null,
      copyrightDivisionCode: compactText(source.cpyrhtDivCd) || null,
    },
    sourceMetadata: {
      contentTypeId,
      sourceContentTypeId,
      contentTypeIds: {
        canonical: contentTypeId,
        korean: korean ? String(korean.contenttypeid ?? "") || null : null,
        english: english ? String(english.contenttypeid ?? "") || null : null,
        barrierFree: barrierFree
          ? String(barrierFree.contenttypeid ?? "") || null
          : null,
      },
      category: {
        primary: compactText(source.cat1) || null,
        secondary: compactText(source.cat2) || null,
        tertiary: compactText(source.cat3) || null,
      },
      address: [source.addr1, source.addr2].map(compactText).filter(Boolean).join(" "),
      modifiedTime: compactText(source.modifiedtime) || null,
      accessibilitySignals: signals,
    },
    customTags: { ...tags },
  };
}
