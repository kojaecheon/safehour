import { CONTENT_TYPE, canonicalContentType } from "./content-types.js";
import { deriveSignals } from "./signals.js";

// 유형 코드 정규화는 content-types.js 가 소유한다(공식 문서 근거 포함). 기존 import 경로를 위해 다시 내보낸다.
export { canonicalContentType };

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

/** 표시 언어 (spec 4.17) */
const DISPLAY_LANGS = new Set(["ko", "en", "ja", "zh"]);

function joinedAddress(item) {
  return [item?.addr1, item?.addr2].map(compactText).filter(Boolean).join(" ");
}

function idOf(item) {
  return item ? String(item.contentid) : null;
}

function typeOf(item) {
  return item ? String(item.contenttypeid ?? "") || null : null;
}

/**
 * 표시 언어 사슬 (spec 4.8 출처와 언어)
 *   ko            국문
 *   en            영문 → 국문
 *   ja · zh       그 언어 → 영문 → 국문
 * 국문으로 떨어지면 선택 언어가 ko 가 아닌 한 '번역 필요'다. 영문 대체는 번역 필요가 아니다.
 */
function resolveDisplay({ lang, korean, barrierFree, localized }) {
  const chain = [];
  if (lang !== "ko") {
    if (lang !== "en" && localized[lang]) chain.push([lang, localized[lang]]);
    if (localized.en) chain.push(["en", localized.en]);
  }
  chain.push(["ko", korean], ["ko", barrierFree]);
  if (lang === "ko") chain.push(["en", localized.en]);

  for (const [displayLang, item] of chain) {
    const title = compactText(item?.title);
    if (title) {
      return {
        lang: displayLang,
        title,
        address: joinedAddress(item) || joinedAddress(korean) || joinedAddress(barrierFree),
        needsTranslation: displayLang === "ko" && lang !== "ko",
      };
    }
  }
  // 제목이 어디에도 없으면 국문 폴백으로 본다(기존 동작과 같다).
  return {
    lang: "ko",
    title: "",
    address: joinedAddress(korean) || joinedAddress(barrierFree),
    needsTranslation: false,
  };
}

function classificationOf(item) {
  const read = (value) => compactText(value) || null;
  return {
    lclsSystm1: read(item?.lclsSystm1),
    lclsSystm2: read(item?.lclsSystm2),
    lclsSystm3: read(item?.lclsSystm3),
  };
}

/** 신호 입력은 언어와 무관한 국문 원문에서만 가져온다 (signals.js 머리말) */
function signalInputsOf({ koreanTitle, contentTypeId, classification, menu }) {
  return { title: koreanTitle ?? "", contentTypeId, classification, menu };
}

/**
 * TourAPI 원문과 자체 태그를 섞지 않고 SafeHour 엔진 후보로 정규화한다.
 *
 * @param {object} input
 * @param {object} [input.korean]            KorService2 목록 항목 (정규화 기준)
 * @param {object} [input.english]           EngService2 목록 항목 (매칭된 경우)
 * @param {object} [input.japanese]          JpnService2 목록 항목 (매칭된 경우)
 * @param {object} [input.chineseSimplified] ChsService2 목록 항목 (매칭된 경우)
 * @param {object} [input.barrierFree]       KorWithService2 목록 항목
 * @param {object} [input.barrierFreeDetail] detailWithTour2 항목
 * @param {{schedule: object, menu: object}|null} [input.intro] 국문 detailIntro2 원문 부분집합
 * @param {"ko"|"en"|"ja"|"zh"} [input.lang] 표시 언어. 기본 en (기존 동작)
 */
export function normalizeTourCandidate({
  korean,
  english,
  japanese,
  chineseSimplified,
  barrierFree,
  barrierFreeDetail,
  intro = null,
  tags = {},
  now = new Date(),
  lang = "en",
}) {
  // 국문 항목을 정규화 기준으로 삼아 상세조회·폴백 연결키를 안정적으로 유지한다.
  // 국문이 없을 때만 외국어 또는 무장애 항목을 기준으로 사용한다.
  const source = korean ?? english ?? japanese ?? chineseSimplified ?? barrierFree;
  if (!source) throw new Error("정규화할 TourAPI 원본이 없습니다.");

  // 알 수 없는 값은 기존 동작(영문 우선)으로 둔다.
  const displayLang = DISPLAY_LANGS.has(lang) ? lang : "en";
  const localized = { en: english, ja: japanese, zh: chineseSimplified };

  const sourceContentTypeId = String(source.contenttypeid ?? "");
  const contentTypeId = canonicalContentType(sourceContentTypeId);
  const heuristic = HEURISTICS[contentTypeId] ?? UNKNOWN_HEURISTIC;
  const signals = accessibilitySignals(barrierFreeDetail);
  const lat = finiteNumber(source.mapy);
  const lng = finiteNumber(source.mapx);

  const display = resolveDisplay({ lang: displayLang, korean, barrierFree, localized });

  const indoor = tags.indoor ?? heuristic.indoor;
  const baseWalkMin = tags.walkMin ?? heuristic.walkMin;

  // 국문 원문 — 무장애 서비스도 국문이다. 둘 다 없으면 한국어 원문이 없다.
  const koreanOriginal = korean ?? barrierFree ?? null;
  const ko = koreanOriginal
    ? { title: compactText(koreanOriginal.title), address: joinedAddress(koreanOriginal) }
    : null;

  const classification = classificationOf(korean ?? barrierFree ?? source);
  const schedule = intro?.schedule ? { ...intro.schedule } : null;
  const menu = intro?.menu ? { ...intro.menu } : null;
  const imageUrl = compactText(source.firstimage) || null;
  const copyrightType = compactText(source.cpyrhtDivCd) || null;

  return {
    id: String(source.contentid),
    sourceIds: {
      korean: idOf(korean),
      english: idOf(english),
      barrierFree: idOf(barrierFree),
    },
    title: display.title,
    titleLanguage: display.lang,
    needsTranslation: display.needsTranslation,
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
      japanese && "TourAPI:JpnService2",
      chineseSimplified && "TourAPI:ChsService2",
      barrierFree && "TourAPI:KorWithService2",
    ].filter(Boolean),
    attribution: {
      imageUrl,
      thumbnailUrl: compactText(source.firstimage2) || null,
      copyrightDivisionCode: copyrightType,
    },
    // 정거장(spec 5.2 Stop)에 옮겨 담을 관광공사 원본 정보. 표시 언어 제목·주소와
    // 한국어 원문, 언어별 원본 ID·유형 코드를 함께 둔다. 추정값은 들어가지 않는다.
    stop: {
      contentId: String(source.contentid),
      title: display.title,
      address: display.address,
      lang: display.lang,
      lat,
      lng,
      ko,
      sourceIds: {
        ko: idOf(korean),
        en: idOf(english),
        ja: idOf(japanese),
        zh: idOf(chineseSimplified),
        barrierFree: idOf(barrierFree),
      },
      contentTypeIds: {
        canonical: contentTypeId,
        ko: typeOf(korean),
        en: typeOf(english),
        ja: typeOf(japanese),
        zh: typeOf(chineseSimplified),
      },
      image: imageUrl ? { url: imageUrl, copyrightType } : null,
    },
    sourceMetadata: {
      contentTypeId,
      sourceContentTypeId,
      contentTypeIds: {
        canonical: contentTypeId,
        korean: typeOf(korean),
        english: typeOf(english),
        barrierFree: typeOf(barrierFree),
      },
      category: {
        primary: compactText(source.cat1) || null,
        secondary: compactText(source.cat2) || null,
        tertiary: compactText(source.cat3) || null,
      },
      // 신분류체계 원문 코드 (cues.js 머리말)
      classification,
      address: joinedAddress(source),
      modifiedTime: compactText(source.modifiedtime) || null,
      accessibilitySignals: signals,
      // 국문 detailIntro2 원문 부분집합. null 이면 조회하지 않았다.
      schedule,
      menu,
    },
    // SafeHour 추정 신호 — 원문과 분리한다. 판정은 엔진이 한다(signals.js).
    signals: deriveSignals(
      signalInputsOf({ koreanTitle: ko?.title, contentTypeId, classification, menu }),
    ),
    customTags: { ...tags },
  };
}

/**
 * 국문 소개정보(운영·메뉴 원문)를 후보에 싣고 신호를 다시 계산한다. 원래 후보는 바꾸지 않는다.
 * 오늘 기준 openNow 는 바꾸지 않는다 — 일정 날짜의 닫힘은 schedule.js 의 closureOnDate 로 본다.
 * @param {object} candidate normalizeTourCandidate 결과
 * @param {{schedule?: object, menu?: object}} intro intro.js extractIntro 결과
 */
export function applyIntro(candidate, intro) {
  const schedule = { ...(intro?.schedule ?? {}) };
  const menu = { ...(intro?.menu ?? {}) };
  const sourceMetadata = { ...candidate.sourceMetadata, schedule, menu };
  return {
    ...candidate,
    sourceMetadata,
    signals: deriveSignals(
      signalInputsOf({
        koreanTitle: candidate.stop?.ko?.title,
        contentTypeId: sourceMetadata.contentTypeId,
        classification: sourceMetadata.classification,
        menu,
      }),
    ),
  };
}
