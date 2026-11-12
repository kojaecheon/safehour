// 관광 후보 → 하루 일정 판정 입력 (AX-306 · docs/business-rules.md '장소 후보와 필터', docs/contracts.md '`POST /api/itinerary/plan`'의 정거장)
//
// 관광 후보 모듈(src/tour-api, AX-305)이 만든 정규화 후보를 **기존 후보 게이트(gateCandidate)의 입력 모양**으로
// 옮긴다. 판정 자체는 safetyGate.js 한곳에서 한다 — 여기서는 판정하지 않고 값만 옮긴다.
//
// 언어 무관성 (docs/business-rules.md '장소 후보와 필터'·'전체 일정 확정과 변화 대응'·'언어'): 판정에 쓰는 값은 국문 원문에서 나온 신호·유형·분류·좌표뿐이다.
// 표시 언어의 제목·주소는 Stop 표시 필드에만 들어간다.

import { MEDICAL_CUES } from '../tour-api/cues.js';
import { closureOnDate } from '../tour-api/schedule.js';
import { matchCues } from '../tour-api/signals.js';
import { haversineKm } from './slaCalculator.js';

/** 정거장 유형 (Stop.category) — 언어와 무관한 엔진 분류. 유형 다양성 순위와 유형별 일러스트에 쓴다 */
export const STOP_CATEGORY = Object.freeze({
  FOOD: 'FOOD',
  CAFE: 'CAFE',
  SPOT: 'SPOT',
  CULTURE: 'CULTURE',
  FESTIVAL: 'FESTIVAL',
  COURSE: 'COURSE',
  LEISURE: 'LEISURE',
  SHOPPING: 'SHOPPING',
  LODGING: 'LODGING',
  OTHER: 'OTHER',
});

const CATEGORY_BY_TYPE = Object.freeze({
  12: STOP_CATEGORY.SPOT,
  14: STOP_CATEGORY.CULTURE,
  15: STOP_CATEGORY.FESTIVAL,
  25: STOP_CATEGORY.COURSE,
  28: STOP_CATEGORY.LEISURE,
  32: STOP_CATEGORY.LODGING,
  38: STOP_CATEGORY.SHOPPING,
});

function contentIdOf(candidate) {
  return String(candidate?.stop?.contentId ?? candidate?.id ?? '');
}

function canonicalTypeOf(candidate) {
  return String(
    candidate?.stop?.contentTypeIds?.canonical ?? candidate?.sourceMetadata?.contentTypeId ?? '',
  );
}

/**
 * 의료 시설(병원·의원·클리닉 등)인가. 관광 후보 모듈의 단서 목록(MEDICAL_CUES) 한곳을 쓴다.
 * 판정 입력은 분류체계 코드와 **국문 제목**이다(언어 무관).
 * 단서가 있으면 제외 쪽으로 본다: 병원을 정거장으로 두면 병원 알선이 된다(docs/business-rules.md '숙소와 병원').
 *
 * 국문 원문(`stop.ko`)이 있으면 그 제목만 본다 — 제목이 비어 있어도 표시 제목으로 내려가지 않는다.
 * 표시 제목은 선택 언어를 따라 달라지므로, 표시 제목을 보면 같은 후보가 언어마다 다르게 판정된다
 * (MEDICAL_CUES 는 국문 단서와 라틴 문자 단어뿐이라 일문·중문 제목은 애초에 맞지 않는다: docs/business-rules.md '장소 후보와 필터' 위반).
 * 국문 원문이 아예 없는 후보는 언어와 무관한 신호(위의 분류체계 코드)로만 판정한다.
 */
export function isMedicalFacility(candidate) {
  const classification = candidate?.sourceMetadata?.classification ?? {};
  for (const level of ['lclsSystm1', 'lclsSystm2', 'lclsSystm3']) {
    const code = classification[level];
    if (code && (MEDICAL_CUES[level] ?? []).includes(code)) return true;
  }
  const koreanTitle = candidate?.stop?.ko?.title;
  if (typeof koreanTitle !== 'string') return false;
  return matchCues(koreanTitle, MEDICAL_CUES).length > 0;
}

/** 식당(음식점 유형이고 카페·찻집이 아님이 확인됨) — 식사 칸에만 들어간다 */
export function isRestaurant(candidate) {
  return candidate?.signals?.isFoodPlace === true && candidate?.signals?.isCafe === false;
}

/** 카페·전통찻집 — 식사 칸에는 넣지 않고 일반 정거장으로만 쓴다 */
export function isCafe(candidate) {
  return candidate?.signals?.isFoodPlace === true && candidate?.signals?.isCafe === true;
}

/**
 * 일반 정거장(식사 칸이 아닌 자리)에 넣을 수 있는 유형인가.
 * 음식점은 카페로 확인된 것만 일반 정거장이 된다. 식당은 식사 칸에만, 유형을 모르는 음식점은 어디에도 넣지 않는다
 * (카페인지 식당인지 모르는 것을 어느 쪽으로도 단정하지 않는다).
 */
export function isRegularStopType(candidate) {
  if (candidate?.signals?.isFoodPlace === true) return isCafe(candidate);
  return true;
}

/** Stop.category */
export function stopCategory(candidate) {
  if (candidate?.signals?.isFoodPlace === true) {
    return isCafe(candidate) ? STOP_CATEGORY.CAFE : STOP_CATEGORY.FOOD;
  }
  return CATEGORY_BY_TYPE[canonicalTypeOf(candidate)] ?? STOP_CATEGORY.OTHER;
}

/** 숙소 기준 직선거리(km). 좌표가 없으면 null — 좌표 게이트(DATA_UNRELIABLE)가 따로 걸러낸다 */
export function distanceFromKm(origin, candidate) {
  const lat = Number(candidate?.lat);
  const lng = Number(candidate?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return haversineKm({ lat: Number(origin.lat), lng: Number(origin.lng) }, { lat, lng });
}

/**
 * 후보를 gateCandidate 입력 모양으로 옮긴다.
 *
 * - 휴무는 **일정 날짜 기준**으로 다시 읽는다(closureOnDate). 후보의 openNow(목록을 받은 날 기준)는 쓰지 않는다.
 *   닫힘 근거가 있을 때만 openNow=false, 그 밖에는 null — 열려 있다고 단정하지 않는다.
 * - 데모 휴무 사건(closedContentIds)은 닫힘으로 본다.
 * - 실외(indoor=false)로 알려진 장소는 자외선 노출(uvExposed=true)로 본다. 모르는 것은 모르는 채로 둔다.
 *
 * @param {object} candidate  normalizeTourCandidate 결과
 * @param {{date: string, closedContentIds?: Set<string>}} ctx
 */
export function toGateInput(candidate, { date, closedContentIds = new Set() }) {
  const signals = candidate?.signals ?? {};
  const contentId = contentIdOf(candidate);
  const closed = closedContentIds.has(contentId) || closureOnDate(candidate, date).closed === true;
  return {
    id: contentId,
    title: candidate?.title ?? '',
    lat: candidate?.lat,
    lng: candidate?.lng,
    indoor: candidate?.indoor ?? null,
    hasFood: candidate?.hasFood === true || signals.isFoodPlace === true,
    // 실외로 알려진 장소는 자외선 노출로 본다(기존 게이트 입력과 같은 뜻 — 테스트 fixture 의 야외 공원도 true).
    // 관광 후보 모듈은 실내만 false 로 두고 나머지를 null 로 남긴다. 실내 여부를 모르면 null 그대로다
    uvExposed: candidate?.uvExposed ?? (candidate?.indoor === false ? true : null),
    walkMin: candidate?.walkMin,
    congestion: candidate?.congestion ?? null,
    openNow: closed ? false : null,
    dataFresh: candidate?.dataFresh,
    tourismEligible: candidate?.tourismEligible !== false,
    medical: isMedicalFacility(candidate),
    heatExposure: signals.heatExposure === true,
    waterActivity: signals.waterActivity === true,
    food: {
      isFoodPlace: signals.isFoodPlace === true,
      isCafe: signals.isCafe ?? null,
      isBar: signals.isBar ?? null,
      spicy: signals.spicy ?? null,
      raw: signals.raw ?? null,
    },
  };
}

/**
 * 합성된 조건(ConditionLimits)을 gateCandidate 의 조건 모양으로 옮긴다 — 환자용.
 * 금식은 '하루 종일'일 때만 후보 단위로 막는다. `UNTIL` 은 시각에 따라 달라지므로 일정 배치에서 막는다.
 * 이동 한도(구간)와 보행 누적(외출)은 외출 검증에서 본다. 여기서는 후보 하나의 보행 부담이 한도를 넘는지만 본다.
 * @param {import('../stay/compose.js').ConditionLimits} limits
 */
export function patientGateCondition(limits) {
  return {
    fasting: limits.mealRestriction?.mode === 'ALL_DAY',
    indoorOnly: limits.outing === 'INDOOR_ONLY',
    avoidUv: limits.avoidUv === true,
    maxWalkMin: typeof limits.walkLimitMin === 'number' ? limits.walkLimitMin : undefined,
    avoidHeat: limits.avoidHeat === true,
    avoidWater: limits.avoidWater === true,
    diet: { ...limits.diet },
  };
}

/**
 * 보호자 조건: 환자 조건(보행·식이·자외선·열·물·금식·실내 전용)을 적용하지 않는다 (docs/business-rules.md '하루 일정 생성'의 보호자 단독 외출).
 * 관광 활동 아님·의료 시설·휴무·기상·혼잡·데이터 신뢰 게이트는 그대로다.
 */
export function guardianGateCondition() {
  return {};
}
