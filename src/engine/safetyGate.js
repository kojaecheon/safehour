// SafeHour 안전 게이트
//
// 핵심 원칙
//   1. 병원 조건이 최상위다. 앱은 이를 완화·재해석하지 않는다.
//   2. 앱은 의료 판단을 하지 않는다. 증상 해석·회복일차 기반 활동 허가를 생성하지 않는다.
//   3. 선호·인기 점수는 금지조건을 상쇄할 수 없다.
//   4. 조건을 통과하지 못하면 NO_TOURISM 을 정상 결과로 낸다.

import { STATE, REASON } from '../domain/states.js';

/** 병원 조건 최신성 허용 시간 (시간) */
const CONDITION_MAX_AGE_HOURS = 24;

/**
 * @typedef {object} HospitalCondition
 * @property {string} version          병원이 발행한 조건 버전
 * @property {Date}   issuedAt         발행 시각
 * @property {string} issuedBy         입력자 (의료진/코디네이터)
 * @property {boolean} fasting         금식 여부
 * @property {boolean} outingAllowed   외출 허용
 * @property {boolean} escortRequired  필수 동행
 * @property {boolean} avoidUv         자외선 회피
 * @property {boolean} indoorOnly      실내만 허용
 * @property {number}  maxWalkMin      최대 보행 허용(분)
 * @property {number}  maxTravelMin    최대 편도 이동 허용(분)
 * @property {string}  rawText         병원 원문 (앱이 수정 금지)
 */

/**
 * 1~2단계 게이트: 병원 조건 및 현재 입력 검증
 * @returns {{pass:boolean, state?:string, reasons:string[]}}
 */
export function gateHospitalCondition(condition, ctx = {}) {
  const reasons = [];
  const now = ctx.now ?? new Date();

  // 1. 조건 존재
  if (!condition || !condition.version) {
    return { pass: false, state: STATE.NO_TOURISM, reasons: [REASON.NO_HOSPITAL_CONDITION] };
  }

  // 2. 최신성
  const ageHours = (now - new Date(condition.issuedAt)) / 3600000;
  if (ageHours > CONDITION_MAX_AGE_HOURS) {
    reasons.push(REASON.STALE_HOSPITAL_CONDITION);
  }

  // 3. 상충 검사 — 예: 필수동행인데 보호자 분리를 허용
  if (condition.escortRequired && condition.splitAllowed === true) {
    reasons.push(REASON.CONFLICTING_CONDITION);
  }
  if (condition.indoorOnly && condition.outdoorOnly === true) {
    reasons.push(REASON.CONFLICTING_CONDITION);
  }

  // 4. 위험신호 입력 (앱은 해석하지 않고, 입력 사실만으로 차단)
  if (ctx.riskSignalReported) {
    reasons.push(REASON.RISK_SIGNAL);
  }

  // 5. 외출 금지
  if (condition.outingAllowed === false) {
    reasons.push(REASON.OUTING_FORBIDDEN);
  }

  const blocking = [
    REASON.STALE_HOSPITAL_CONDITION,
    REASON.CONFLICTING_CONDITION,
    REASON.RISK_SIGNAL,
    REASON.OUTING_FORBIDDEN,
  ];
  if (reasons.some((r) => blocking.includes(r))) {
    return { pass: false, state: STATE.NO_TOURISM, reasons };
  }

  return { pass: true, reasons };
}

/**
 * 후보 단위 게이트: 금지조건에 걸리는 후보를 제외
 * @param {object} candidate  { id, title, indoor, hasFood, uvExposed, walkMin, congestion, openNow, dataFresh,
 *                              tourismEligible, medical?, heatExposure?, waterActivity?,
 *                              food?: { isFoodPlace, isCafe, isBar, spicy, raw } }
 *   하루 일정 엔진은 src/engine/stopCandidate.js 가 관광 후보를 이 모양으로 옮긴다.
 * @param {HospitalCondition} condition  기존 필드 + (AX-306) avoidHeat?, avoidWater?,
 *                                       diet?: { spicy, alcohol, hard, hot, raw }
 * @param {object} ctx        { weather, now }
 * @returns {{pass:boolean, reasons:string[]}}
 */
export function gateCandidate(candidate, condition, ctx = {}) {
  const reasons = [];

  // 숙박시설 등 관광 활동이 아닌 후보는 가까워도 추천하지 않는다.
  // 의료 시설(병원·의원·클리닉)도 관광 활동이 아니다 — 병원을 정거장으로 두면 병원 알선이 된다 (spec 9.1).
  if (candidate.tourismEligible === false || candidate.medical === true) {
    reasons.push(REASON.NON_TOURISM_ACTIVITY);
  }

  // 열 노출 (spec 4.8, AX-306) — 단서가 있는 장소만. 단서가 없으면 노출 없음으로 본다
  if (condition.avoidHeat && candidate.heatExposure === true) {
    reasons.push(REASON.HEAT_EXPOSURE);
  }

  // 물 활동 (spec 4.8, AX-306)
  if (condition.avoidWater && candidate.waterActivity === true) {
    reasons.push(REASON.WATER_ACTIVITY);
  }

  // 식이 필터 — 식당·카페에만 (spec 4.8). 판정 결과는 추정이다
  for (const reason of dietReasons(candidate.food, condition.diet)) {
    reasons.push(reason);
  }

  // 금식 중 식음 후보 제외 — 금식 시간 자체는 앱이 결정하지 않음
  if (condition.fasting && candidate.hasFood) {
    reasons.push(REASON.FASTING_REQUIRED);
  }

  // 실내만 허용
  if (condition.indoorOnly && candidate.indoor === false) {
    reasons.push(REASON.INDOOR_ONLY_REQUIRED);
  }

  // 자외선 회피 + 실외 노출
  if (condition.avoidUv && candidate.uvExposed) {
    reasons.push(REASON.UV_EXPOSURE);
  }

  // 기상 악화 시 실외 제외
  if (ctx.weather?.outdoorUnsafe && candidate.indoor === false) {
    reasons.push(REASON.WEATHER_BLOCKED);
  }

  // 보행 허용 초과
  if (typeof condition.maxWalkMin === 'number' &&
      typeof candidate.walkMin === 'number' &&
      candidate.walkMin > condition.maxWalkMin) {
    reasons.push(REASON.WALK_LIMIT_EXCEEDED);
  }

  // 혼잡
  if (candidate.congestion === 'high') {
    reasons.push(REASON.CONGESTION_HIGH);
  }

  // 휴무·운영종료
  if (candidate.openNow === false) {
    reasons.push(REASON.CLOSED);
  }

  // 데이터 신뢰 (좌표 이상·최신성 실패)
  if (candidate.dataFresh === false || !isValidCoord(candidate)) {
    reasons.push(REASON.DATA_UNRELIABLE);
  }

  // 실내 여부가 불확실하고 실내 조건이 걸려있으면 보수적으로 제외
  if ((condition.indoorOnly || ctx.weather?.outdoorUnsafe) && candidate.indoor == null) {
    reasons.push(REASON.DATA_UNRELIABLE);
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * 식이 필터 (spec 4.8, 규칙 21–23).
 * - 술: 주점 유형(isBar=true)만 제외 → DIET_RESTRICTED
 * - 매운 음식·날음식: 단서 있음(true) → DIET_RESTRICTED, 판단할 단서 없음(null) → MENU_UNKNOWN.
 *   카페·전통찻집 유형은 '매운 음식·날음식 아님'으로 본다
 * - 뜨거운·딱딱한 음식: 제외하지 않는다(주문 카드로 대응 — 엔진이 라벨을 붙인다)
 * @param {{isFoodPlace?: boolean, isCafe?: boolean|null, isBar?: boolean|null,
 *          spicy?: boolean|null, raw?: boolean|null} | undefined} food  관광 후보 신호(추정)
 * @param {{spicy?: boolean, alcohol?: boolean, raw?: boolean} | undefined} diet  합성된 식이 조건
 * @returns {string[]}
 */
function dietReasons(food, diet) {
  if (!food || food.isFoodPlace !== true || !diet) return [];
  const reasons = new Set();
  if (diet.alcohol && food.isBar === true) reasons.add(REASON.DIET_RESTRICTED);
  for (const key of ['spicy', 'raw']) {
    if (!diet[key] || food.isCafe === true) continue;
    if (food[key] === true) reasons.add(REASON.DIET_RESTRICTED);
    else if (food[key] !== false) reasons.add(REASON.MENU_UNKNOWN);
  }
  return [...reasons];
}

function isValidCoord(c) {
  if (c.lat == null || c.lng == null) return false;
  // 대한민국 대략 범위
  return c.lat > 33 && c.lat < 39 && c.lng > 124 && c.lng < 132;
}

/**
 * 순위화 — 게이트를 통과한 후보만 대상.
 * 선호·인기는 금지조건을 상쇄하지 못하므로 게이트 이후에만 적용된다.
 */
export function rankCandidates(candidates, { preferIndoor = false } = {}) {
  return [...candidates].sort((a, b) => {
    // 1) 복귀 여유 큰 순
    const slackDiff = (b.sla?.slackMin ?? 0) - (a.sla?.slackMin ?? 0);
    if (slackDiff !== 0) return slackDiff;
    // 2) 실내 선호
    if (preferIndoor && a.indoor !== b.indoor) return a.indoor ? -1 : 1;
    // 3) 보행 부담 적은 순
    return (a.walkMin ?? 99) - (b.walkMin ?? 99);
  });
}
