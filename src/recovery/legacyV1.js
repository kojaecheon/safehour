// 퇴역 예정 — v1 단일 외출 경로 호환 계층 (AX-213 · AX-215 · AX-220 → AX-311 에서 분리)
//
// **새 코드는 이 파일을 쓰지 않는다.** 지침 계약은 v2 다(`plan.js`, spec 5.3). v1 은 받지 않는다(규칙 48).
//
// 이 파일은 예전 화면(`/today`·`/plan`·`/result`·`/guide`)과 `/api/today` 가
// 일정 화면(AX-317)·일정 API(AX-308)로 대체될 때까지만 빌드를 유지하려고 남긴다(AX-321 에서 삭제).
// 동작은 AX-311 이전과 같고, **v1 모양의 계획만** 판정한다.
//   - v2 지침은 이 경로에서 판정하지 않는다 → NO_TOURISM + NO_HOSPITAL_PLAN.
//     v2 기간을 v1 조건 묶음으로 옮기는 변환은 만들지 않는다 — 판정이 두 벌이 되면 결과가 어긋난다.
//   - 채널 B(병원 안내문)는 판정용 축약본에 싣지 않는다.

import { REASON, STATE } from '../domain/states.js';
import { isClockTime } from '../stay/time.js';
import { CRITICAL_CATEGORIES, INSTRUCTION_CATEGORIES } from './instructions.js';

/** 이 경로가 판정하는 유일한 계약 버전 */
const LEGACY_PLAN_VERSION = 1;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/** v1 계획 형식 검증 — 이 파일 안에서만 쓴다 */
function validateLegacyPlan(plan) {
  const errors = [];
  const push = (field) => errors.push(field);

  if (!plan || typeof plan !== 'object') return { valid: false, errors: ['plan'] };
  if (plan.schemaVersion !== LEGACY_PLAN_VERSION) push('schemaVersion');
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

/** 확인하지 않은 안내 전체 — 예전 세션 사본의 `acknowledged` 플래그를 본다 (v1 화면 전용) */
export function unconfirmedAll(plan) {
  return (plan?.instructions ?? []).filter((item) => item.acknowledged !== true);
}

/**
 * 판정용 축약본 — 예전 `/api/today` 로 나가는 유일한 형태 (정의 §2).
 * 채널 B(병원 안내문)의 `text`·`lang` 과 발행처 이름을 떼어낸다.
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
  if (payload.schemaVersion !== LEGACY_PLAN_VERSION) errors.push('schemaVersion');
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
 * 연결 게이트 (정의 §7) — 판정용 축약본을 받는다.
 * 유효한 v1 계획이 없으면 관광지를 표시하지 않는다. 미확인 중요 변경은 STANDBY 강등이다.
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

/** 계획 전체를 들고 있을 때 쓰는 편의 함수. v1 모양이 아니면(v2 포함) NO_HOSPITAL_PLAN 이다 */
export function gateRecoveryPlan(plan, options = {}) {
  if (!plan || !validateLegacyPlan(plan).valid) {
    return { pass: false, state: STATE.NO_TOURISM, reasons: [REASON.NO_HOSPITAL_PLAN], expired: false };
  }
  return gateDecisionPayload(toDecisionPayload(plan), options);
}

/**
 * v1 채널 A → 기존 엔진 병원 조건. **매핑만 한다.** 값을 완화하거나 보충하지 않는다.
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

/** KST 는 서머타임이 없어 고정 오프셋으로 다뤄도 된다. */
const KST_OFFSET_MS = 9 * 3600_000;

/**
 * `HH:MM` 을 다음에 오는 그 시각(KST)으로 바꾼다.
 * 실행 환경의 시간대(서버 UTC, 해외 단말)와 무관하게 한국 벽시계 시각으로 해석한다.
 */
export function nextClockOccurrence(clock, now = new Date()) {
  if (!isClockTime(clock)) return null;
  const [h, m] = clock.split(':').map(Number);

  // now 를 KST 벽시계로 옮겨 "오늘이 KST 로 며칠인지" 를 읽는다.
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const candidate = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), h, m, 0, 0) -
      KST_OFFSET_MS,
  );

  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

/**
 * 복귀 마감은 **가장 이른 마감**이다 — 복귀 시각·복약 시각·다음 내원 중 먼저 오는 것 (정의 §2).
 * v1 모양 계획 전용이다(`plan.constraints` 필요).
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
 * 외출 중 지침이 무효가 됐을 때 (AX-220 · 정의 §7 개선 1).
 * `PATIENT_RECALL` 과 **같은 모양**으로 추천을 비우고 복귀를 켠다 — 안전한 방향으로 무효화만 한다.
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
