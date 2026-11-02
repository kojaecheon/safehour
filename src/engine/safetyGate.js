// SafeHour 후보 안전 게이트: 후보 하나가 그날 조건에 걸리는지 판정하는 한곳
//
// 핵심 원칙
//   1. 병원 조건이 최상위다. 앱은 이를 완화·재해석하지 않는다.
//   2. 앱은 의료 판단을 하지 않는다. 증상 해석·회복일차 기반 활동 허가를 생성하지 않는다.
//   3. 선호·인기 점수는 금지조건을 상쇄할 수 없다.
//
// 하루 일정 엔진(dayPlan.rolePool)이 재계획·교체 후보까지 모두 이 함수로 판정한다.
// 후보는 stopCandidate.toGateInput 이, 조건은 stopCandidate.patientGateCondition·guardianGateCondition 이 옮겨 온다.

import { REASON } from '../domain/states.js';

/**
 * 후보 게이트가 읽는 조건. 합성된 조건(ConditionLimits)에서 옮겨 온 값이고, 보호자는 빈 객체다.
 * @typedef {object} GateCondition
 * @property {boolean} [fasting]     하루 종일 금식
 * @property {boolean} [indoorOnly]  실내만 허용
 * @property {boolean} [avoidUv]     자외선 피하기
 * @property {number}  [maxWalkMin]  후보 하나의 보행 부담 한도(분)
 * @property {boolean} [avoidHeat]   열 피하기
 * @property {boolean} [avoidWater]  물 피하기
 * @property {{spicy?: boolean, alcohol?: boolean, hard?: boolean, hot?: boolean, raw?: boolean}} [diet]
 */

/**
 * 후보 단위 게이트: 금지조건에 걸리는 후보를 제외
 * @param {object} candidate  { id, title, indoor, hasFood, uvExposed, walkMin, congestion, openNow, dataFresh,
 *                              tourismEligible, medical?, heatExposure?, waterActivity?,
 *                              food?: { isFoodPlace, isCafe, isBar, spicy, raw } }
 *   하루 일정 엔진은 src/engine/stopCandidate.js 가 관광 후보를 이 모양으로 옮긴다.
 * @param {GateCondition} condition
 * @param {object} ctx        { weather }
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
