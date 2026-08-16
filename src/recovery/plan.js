// 회복 지침 (Recovery Plan) — 데이터 계약과 연결 게이트 (AX-213 · AX-215)
//
// 정의: `docs/PRODUCT_DEFINITION.md` §2·§4·§7
//
// 두 채널을 **구조로** 분리한다.
//   - constraints (채널 A): 기계가 읽는 제한조건. 판정 엔진으로 간다. 서버 전송 O
//   - instructions (채널 B): 병원이 쓴 문장. 표시 전용. **판정에 쓰지 않고 서버로 보내지 않는다**
//
// 이 파일에는 의료 해석이 없다. 병원이 확정한 값을 형식만 검증해 그대로 넘긴다.

import { REASON, STATE } from '../domain/states.js';

export const PLAN_VERSION = 1;

/** 채널 B 카드 분류 — 정의 §4.3 */
export const INSTRUCTION_CATEGORIES = [
  'activity',
  'medication',
  'food',
  'lifestyle',
  'escort',
  'emergency',
  'visit',
];

/**
 * 확인하지 않으면 판정을 STANDBY 로 강등시키는 **중요** 분류.
 * 나머지는 확인하지 않아도 외출을 막지 않는다 — 모든 변경을 막으면
 * "확인" 이 형식적 클릭이 되고, 정작 중요한 변경을 놓친다 (정의 §7 개선 2).
 */
export const CRITICAL_CATEGORIES = ['activity', 'escort', 'visit', 'emergency'];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/** `HH:MM` 24시간 표기 */
export function isClockTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * 형식 검증. **값의 의학적 타당성은 검증하지 않는다** — 그것은 병원의 몫이다.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePlan(plan) {
  const errors = [];
  const push = (field) => errors.push(field);

  if (!plan || typeof plan !== 'object') return { valid: false, errors: ['plan'] };
  if (plan.schemaVersion !== PLAN_VERSION) push('schemaVersion');
  if (typeof plan.planId !== 'string' || !plan.planId) push('planId');
  if (!isFiniteNumber(plan.version) || plan.version < 1) push('version');
  if (!isIsoDate(plan.issuedAt)) push('issuedAt');
  if (!isIsoDate(plan.expiresAt)) push('expiresAt');
  if (typeof plan.revoked !== 'boolean') push('revoked');

  if (!plan.issuer || typeof plan.issuer.name !== 'string' || !plan.issuer.name) push('issuer.name');
  if (!plan.issuer || typeof plan.issuer.role !== 'string') push('issuer.role');

  const anchor = plan.anchor;
  if (!anchor || !isFiniteNumber(anchor.lat) || !isFiniteNumber(anchor.lng)) push('anchor');
  else if (anchor.lat < -90 || anchor.lat > 90 || anchor.lng < -180 || anchor.lng > 180) push('anchor');

  const c = plan.constraints;
  if (!c || typeof c !== 'object') {
    push('constraints');
  } else {
    for (const flag of [
      'outingAllowed',
      'indoorOnly',
      'avoidUv',
      'avoidHeat',
      'noWater',
      'escortRequired',
      'splitAllowed',
      'foodRestricted',
    ]) {
      if (typeof c[flag] !== 'boolean') push(`constraints.${flag}`);
    }
    for (const num of ['maxWalkMin', 'maxTravelMin']) {
      if (!isFiniteNumber(c[num]) || c[num] < 0 || c[num] > 240) push(`constraints.${num}`);
    }
    if (!isIsoDate(c.returnBy)) push('constraints.returnBy');
    if (c.nextVisitAt != null && !isIsoDate(c.nextVisitAt)) push('constraints.nextVisitAt');
    if (c.fastingUntil != null && !isClockTime(c.fastingUntil)) push('constraints.fastingUntil');
    if (!Array.isArray(c.medicationTimes) || c.medicationTimes.some((t) => !isClockTime(t))) {
      push('constraints.medicationTimes');
    }
  }

  if (!Array.isArray(plan.instructions)) {
    push('instructions');
  } else {
    plan.instructions.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || !item.id) push(`instructions[${i}].id`);
      if (!INSTRUCTION_CATEGORIES.includes(item?.category)) push(`instructions[${i}].category`);
      if (typeof item?.text !== 'string' || !item.text.trim()) push(`instructions[${i}].text`);
      if (typeof item?.lang !== 'string' || !item.lang) push(`instructions[${i}].lang`);
      if (!isIsoDate(item?.updatedAt)) push(`instructions[${i}].updatedAt`);
    });
  }

  return { valid: errors.length === 0, errors };
}

/** 확인하지 않은 중요 안내 */
export function unconfirmedCritical(plan) {
  return (plan?.instructions ?? []).filter(
    (item) => CRITICAL_CATEGORIES.includes(item.category) && item.acknowledged !== true,
  );
}

/** 확인하지 않은 안내 전체 (중요 여부 무관) */
export function unconfirmedAll(plan) {
  return (plan?.instructions ?? []).filter((item) => item.acknowledged !== true);
}

/**
 * 판정용 축약본 — **서버로 나가는 유일한 형태** (정의 §2).
 *
 * 채널 B(병원 안내문)의 `text` 와 `lang` 을 떼어낸다. 판정에 필요한 것은
 * "확인했는가" 뿐이고, 문장에는 약물·시술 정황이 담긴다.
 * 안내문이 이 함수를 통과하면 "단말을 떠나지 않는다" 가 거짓이 된다.
 */
export function toDecisionPayload(plan) {
  if (!plan) return null;
  return {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    version: plan.version,
    issuedAt: plan.issuedAt,
    expiresAt: plan.expiresAt,
    revoked: plan.revoked,
    issuer: { role: plan.issuer?.role },
    anchor: plan.anchor,
    constraints: plan.constraints,
    acknowledgements: (plan.instructions ?? []).map((item) => ({
      id: item.id,
      category: item.category,
      acknowledged: item.acknowledged === true,
    })),
  };
}

/** 판정용 축약본의 형식 검증 — 안내문 본문을 요구하지 않는다 */
export function validateDecisionPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { valid: false, errors: ['payload'] };
  if (payload.schemaVersion !== PLAN_VERSION) errors.push('schemaVersion');
  if (typeof payload.planId !== 'string' || !payload.planId) errors.push('planId');
  if (!isFiniteNumber(payload.version) || payload.version < 1) errors.push('version');
  if (!isIsoDate(payload.issuedAt)) errors.push('issuedAt');
  if (!isIsoDate(payload.expiresAt)) errors.push('expiresAt');
  if (typeof payload.revoked !== 'boolean') errors.push('revoked');
  if (typeof payload.issuer?.role !== 'string') errors.push('issuer.role');

  const c = payload.constraints;
  if (!c || typeof c !== 'object') {
    errors.push('constraints');
  } else {
    for (const flag of ['outingAllowed', 'indoorOnly', 'escortRequired', 'splitAllowed']) {
      if (typeof c[flag] !== 'boolean') errors.push(`constraints.${flag}`);
    }
    for (const num of ['maxWalkMin', 'maxTravelMin']) {
      if (!isFiniteNumber(c[num]) || c[num] < 0 || c[num] > 240) errors.push(`constraints.${num}`);
    }
    if (!isIsoDate(c.returnBy)) errors.push('constraints.returnBy');
  }

  if (!Array.isArray(payload.acknowledgements)) {
    errors.push('acknowledgements');
  } else {
    payload.acknowledgements.forEach((item, i) => {
      if (typeof item?.id !== 'string' || !item.id) errors.push(`acknowledgements[${i}].id`);
      if (!INSTRUCTION_CATEGORIES.includes(item?.category)) errors.push(`acknowledgements[${i}].category`);
    });
  }

  // 안내문 본문이 섞여 들어오면 계약 위반이다 — 조용히 통과시키지 않는다
  if (Array.isArray(payload.instructions)) errors.push('instructions:forbidden');

  return { valid: errors.length === 0, errors };
}

/**
 * **연결 게이트** — 기존 안전 게이트 *앞* 단계 (정의 §7).
 *
 * 유효한 병원 계획이 없으면 관광지를 아예 표시하지 않는다.
 * 확인하지 않은 중요 변경은 차단이 아니라 **STANDBY 강등**이다 —
 * 사용자가 읽으면 풀린다.
 *
 * 입력은 판정용 축약본이다. 게이트 구현은 여기 하나뿐이며,
 * 클라이언트가 계획을 들고 있을 때는 `gateRecoveryPlan` 이 변환해서 부른다.
 *
 * @returns {{pass: boolean, state: string, reasons: string[], expired: boolean}}
 */
export function gateDecisionPayload(payload, { now = new Date() } = {}) {
  const blocked = (reason, expired = false) => ({
    pass: false,
    state: STATE.NO_TOURISM,
    reasons: [reason],
    expired,
  });

  if (!payload) return blocked(REASON.NO_HOSPITAL_PLAN);
  if (!validateDecisionPayload(payload).valid) return blocked(REASON.NO_HOSPITAL_PLAN);
  if (payload.revoked) return blocked(REASON.PLAN_REVOKED, true);
  if (new Date(payload.expiresAt).getTime() <= now.getTime()) {
    return blocked(REASON.PLAN_EXPIRED, true);
  }

  const unconfirmed = payload.acknowledgements.filter(
    (item) => CRITICAL_CATEGORIES.includes(item.category) && item.acknowledged !== true,
  );
  if (unconfirmed.length > 0) {
    // 차단이 아니라 강등 — 읽으면 풀린다
    return {
      pass: false,
      state: STATE.STANDBY,
      reasons: [REASON.PLAN_UNCONFIRMED_UPDATE],
      expired: false,
    };
  }
  return { pass: true, state: null, reasons: [], expired: false };
}

/** 계획 전체를 들고 있을 때 쓰는 편의 함수. 게이트 판단은 위와 같다. */
export function gateRecoveryPlan(plan, options = {}) {
  if (!plan || !validatePlan(plan).valid) {
    return { pass: false, state: STATE.NO_TOURISM, reasons: [REASON.NO_HOSPITAL_PLAN], expired: false };
  }
  return gateDecisionPayload(toDecisionPayload(plan), options);
}

/**
 * 채널 A → 엔진이 아는 병원 조건으로 옮긴다.
 * **매핑만 한다.** 값을 완화하거나 보충하지 않는다.
 */
export function planToCondition(plan) {
  const c = plan.constraints;
  return {
    version: `${plan.planId}#${plan.version}`,
    issuedAt: plan.issuedAt,
    issuedBy: plan.issuer.role,
    // 금식 종료 시각이 있으면 그때까지는 식음 활동을 막는다
    fasting: c.foodRestricted || Boolean(c.fastingUntil),
    outingAllowed: c.outingAllowed,
    escortRequired: c.escortRequired,
    avoidUv: c.avoidUv,
    indoorOnly: c.indoorOnly,
    splitAllowed: c.splitAllowed,
    maxWalkMin: c.maxWalkMin,
    maxTravelMin: c.maxTravelMin,
  };
}

/** `HH:MM` 을 오늘(또는 내일) 날짜에 붙여 Date 로 만든다 */
export function nextClockOccurrence(clock, now = new Date()) {
  if (!isClockTime(clock)) return null;
  const [h, m] = clock.split(':').map(Number);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

/**
 * 복귀 마감은 **가장 이른 마감**이다.
 * 복귀 시각·복약 시각·다음 내원 중 먼저 오는 것이 외출 창을 자른다 (정의 §2).
 * 어느 것이 마감을 정했는지도 함께 돌려준다 — 화면이 이유를 설명해야 하기 때문이다.
 */
export function effectiveDeadline(plan, now = new Date()) {
  const c = plan.constraints;
  const candidates = [{ at: new Date(c.returnBy), source: 'returnBy' }];

  for (const clock of c.medicationTimes ?? []) {
    const at = nextClockOccurrence(clock, now);
    if (at) candidates.push({ at, source: 'medication' });
  }
  if (c.nextVisitAt) candidates.push({ at: new Date(c.nextVisitAt), source: 'visit' });

  const future = candidates.filter((x) => x.at.getTime() > now.getTime());
  const pool = future.length > 0 ? future : candidates;
  return pool.reduce((earliest, x) => (x.at < earliest.at ? x : earliest));
}

/**
 * 외출 중 지침이 무효가 됐을 때의 판정 결과 (AX-220 · 정의 §7 개선 1).
 *
 * 이미 나가 있는 사람에게 "만료됐습니다" 만 띄우는 것은 위험하다.
 * `PATIENT_RECALL` 과 **같은 모양**으로 추천을 비우고 복귀를 켠다 —
 * 새 판정을 만드는 것이 아니라 안전한 방향으로 무효화만 한다.
 */
export function invalidateForReturn(decision, reasons) {
  return {
    ...decision,
    state: STATE.NO_TOURISM,
    reasons: [...new Set(reasons)],
    course: [],
    patientCourse: [],
    companionCourse: [],
    returnNow: true,
  };
}
