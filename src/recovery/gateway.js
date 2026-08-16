// SafeHour 연동 게이트웨이 (AX-214)
//
// 정의: `docs/PRODUCT_DEFINITION.md` §3
//
// 게이트웨이의 책임
//   1. **최소화** — 병원이 보낸 것 중 제한조건과 안내문만 통과시킨다.
//      진단명·시술기록·전체 약물목록이 섞여 와도 여기서 잘린다.
//   2. **동의 범위 적용** — 보호자에게는 축약된 payload 를 *따로 만들어* 내려보낸다.
//      환자 앱이 받은 뒤 걸러 보여주는 방식은 정보 분리가 아니다.
//   3. **어댑터** — 병원마다 다른 인터페이스를 공통 계약으로 흡수한다.
//
// 지금은 데모 어댑터 하나뿐이다. FHIR·병원 전용 API 는 같은 자리에 어댑터로 붙는다.

import { validatePlan } from './plan.js';

/** 병원이 무엇을 더 보내든 이 목록 밖은 통과하지 못한다 */
const ALLOWED_PLAN_KEYS = [
  'schemaVersion',
  'planId',
  'version',
  'issuedAt',
  'updatedAt',
  'expiresAt',
  'revoked',
  'demo',
  'issuer',
  'anchor',
  'constraints',
  'instructions',
];

const ALLOWED_CONSTRAINT_KEYS = [
  'outingAllowed',
  'indoorOnly',
  'maxWalkMin',
  'maxTravelMin',
  'avoidUv',
  'avoidHeat',
  'noWater',
  'escortRequired',
  'splitAllowed',
  'foodRestricted',
  'fastingUntil',
  'returnBy',
  'medicationTimes',
  'nextVisitAt',
];

const ALLOWED_INSTRUCTION_KEYS = ['id', 'category', 'lang', 'text', 'updatedAt', 'acknowledged'];

const ALLOWED_ISSUER_KEYS = ['name', 'role'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

/**
 * 병원이 보낸 원본에서 **허용 목록에 있는 것만** 남긴다.
 * 새 필드를 통과시키려면 목록에 명시적으로 추가해야 한다 — 조용히 새지 않게.
 */
export function minimizePlan(raw) {
  const plan = pick(raw, ALLOWED_PLAN_KEYS);
  if (plan.issuer) plan.issuer = pick(plan.issuer, ALLOWED_ISSUER_KEYS);
  if (plan.anchor) plan.anchor = pick(plan.anchor, ['lat', 'lng', 'label']);
  if (plan.constraints) plan.constraints = pick(plan.constraints, ALLOWED_CONSTRAINT_KEYS);
  if (Array.isArray(plan.instructions)) {
    plan.instructions = plan.instructions.map((item) => pick(item, ALLOWED_INSTRUCTION_KEYS));
  }
  return plan;
}

/**
 * 보호자용 축약 — 정의 §6.2.
 *
 * **채널 B(병원 안내문)를 통째로 뺀다.** 약물·시술 정황이 문장에 담기기 때문이다.
 * 보호자가 알아야 하는 것은 "함께 있어야 하는가 / 단독 외출이 되는가 / 언제까지인가" 다.
 */
export function companionView(plan, consent = {}) {
  if (!plan?.constraints) return null;
  const c = plan.constraints;

  const view = {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    version: plan.version,
    expiresAt: plan.expiresAt,
    revoked: plan.revoked,
    demo: plan.demo,
    issuer: { name: plan.issuer?.name, role: plan.issuer?.role },
    anchor: plan.anchor,
    constraints: {
      escortRequired: c.escortRequired,
      splitAllowed: c.splitAllowed,
      maxWalkMin: c.maxWalkMin,
      maxTravelMin: c.maxTravelMin,
      returnBy: c.returnBy,
      outingAllowed: c.outingAllowed,
    },
    instructions: [],
  };

  // 환자가 명시적으로 허용한 것만 더한다
  if (consent.shareSchedule) view.constraints.nextVisitAt = c.nextVisitAt ?? null;
  if (consent.shareInstructions) {
    view.instructions = (plan.instructions ?? []).filter((i) => i.category === 'emergency');
  }
  return view;
}

/**
 * 데모 어댑터 — 실제 병원 연동이 아니다.
 * 반환값에 `demo: true` 가 박혀 있고 화면이 그것을 상시 표시한다.
 * 공모전 요강의 허위 제출 조항 때문에라도 이 표시는 선택이 아니다 (정의 §9-3).
 */
export function demoAdapter(fixtures) {
  return {
    id: 'demo',
    /** 코드로 계획을 찾는다. 대소문자·공백은 무시한다 */
    async redeem(code) {
      const key = String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
      const found = fixtures[key];
      if (!found) return { ok: false, reason: 'unknown_code' };
      return { ok: true, plan: found() };
    },
  };
}

/**
 * 어댑터를 통해 계획을 받아 최소화·검증한다.
 * 검증에 실패하면 **계획을 주지 않는다** — 깨진 계획으로 판정하면 안전 사고다.
 */
export async function redeemPlan(adapter, code) {
  const result = await adapter.redeem(code);
  if (!result.ok) return result;

  const plan = minimizePlan(result.plan);
  const { valid, errors } = validatePlan(plan);
  if (!valid) return { ok: false, reason: 'invalid_plan', errors };

  return { ok: true, plan };
}
