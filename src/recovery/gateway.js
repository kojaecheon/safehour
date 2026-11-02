// SafeHour 연동 게이트웨이 — 지침 계약 v2 (AX-214 → AX-311 · spec 4.20, 5.3)
//
// 정의: `docs/PRODUCT_DEFINITION.md` §3
//
// 게이트웨이의 책임
//   1. **최소화** — 병원이 보낸 것 중 v2 계약 필드만 통과시킨다(허용 목록).
//      진단명·시술기록·전체 약물목록·환자 호출 같은 필드가 섞여 와도 여기서 잘린다. 모든 층에 적용한다.
//   2. **검증** — 최소화한 결과가 v2 형식이 아니면 지침 전체를 거부한다. v1 은 받지 않는다(규칙 48).
//   3. **어댑터** — 병원마다 다른 인터페이스를 공통 계약으로 흡수한다.
//
// 지금은 데모 어댑터 하나뿐이다. FHIR·병원 전용 API 는 같은 자리에 어댑터로 붙는다.
// 보호자용 축약은 게이트웨이가 아니라 보호자 스냅샷(spec 5.4)이 맡는다 — v1 `companionView` 는 없앴다.

import { validatePlan } from './plan.js';

/** `/api/plan/link` 오류 코드 — 모든 오류 응답은 `errorCode` 키를 쓴다 (spec 6장) */
export const PLAN_LINK_ERROR = Object.freeze({
  /** 본문을 읽을 수 없거나 객체가 아님 (기존 코드) */
  BAD_REQUEST: 'SAFEHOUR_BAD_REQUEST',
  /** 연결 코드가 비어 있음 */
  CODE_REQUIRED: 'SAFEHOUR_PLAN_CODE_REQUIRED',
  /** 코드에 해당하는 지침이 없음 */
  UNKNOWN_CODE: 'SAFEHOUR_PLAN_UNKNOWN_CODE',
  /** 지침 형식이 v2 가 아님(v1 포함) — 지침 전체를 거부했다 */
  INVALID_PLAN: 'SAFEHOUR_PLAN_INVALID',
});

export const PLAN_LINK_ERROR_STATUS = Object.freeze({
  [PLAN_LINK_ERROR.BAD_REQUEST]: 400,
  [PLAN_LINK_ERROR.CODE_REQUIRED]: 400,
  [PLAN_LINK_ERROR.UNKNOWN_CODE]: 404,
  [PLAN_LINK_ERROR.INVALID_PLAN]: 422,
});

// ── 허용 목록 (spec 5.3) — 새 필드를 통과시키려면 여기에 명시적으로 추가해야 한다 ──

const PLAN_SCALAR_KEYS = ['schemaVersion', 'planId', 'version', 'issuedAt', 'updatedAt', 'expiresAt', 'revoked', 'demo'];
const ISSUER_KEYS = ['name', 'role'];
const HOSPITAL_SCALAR_KEYS = ['name', 'phone'];
const ADDRESS_KEYS = ['roadAddress', 'lat', 'lng'];
const PERIOD_SCALAR_KEYS = ['startDate', 'endDate'];
const APPOINTMENT_KEYS = ['type', 'date', 'start', 'end'];
const INSTRUCTION_KEYS = ['id', 'category', 'lang', 'text', 'updatedAt', 'acknowledged'];
const RETURN_TIME_KEYS = ['kind', 'time', 'place'];
const MEAL_VALUE_KEYS = ['mode', 'until'];
const MEDICATION_ENTRY_KEYS = ['time', 'atLodging'];
/** Answer<스칼라> 항목 — 값은 숫자 또는 true */
const SCALAR_ANSWER_KEYS = ['walkLimit', 'travelLimit', 'avoidUv', 'avoidHeat', 'avoidWater', 'escortRequired', 'guardianMustStay'];
const DIET_KEYS = ['spicy', 'alcohol', 'hard', 'hot', 'raw'];

function has(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 스칼라 자리 — 객체·배열이 오면 내용을 버린다(검증이 거부한다) */
function scalar(value) {
  return value !== null && typeof value === 'object' ? null : value;
}

/** 스칼라 필드만 고른다 */
function pickScalars(source, keys) {
  const out = {};
  for (const key of keys) if (has(source, key)) out[key] = scalar(source[key]);
  return out;
}

/** 객체 자리 — 객체면 `build` 로 다시 만들고, 아니면 스칼라로 버린다 */
function object(value, build) {
  return isPlainObject(value) ? build(value) : scalar(value);
}

/** 배열 자리 */
function list(value, build) {
  return Array.isArray(value) ? value.map((item) => object(item, build)) : scalar(value);
}

function answer(value, buildValue = scalar) {
  return object(value, (a) => {
    const out = pickScalars(a, ['kind']);
    if (has(a, 'value')) out.value = buildValue(a.value);
    return out;
  });
}

/**
 * 조건 항목(ConditionItems)에서 계약 필드만 남긴다. 키 순서는 이 목록 순서로 고정된다(비교에도 쓴다).
 * @param {unknown} items
 */
export function minimizeConditionItems(items) {
  return object(items, (src) => {
    const out = {};
    if (has(src, 'outing')) out.outing = scalar(src.outing);
    if (has(src, 'returnTime')) out.returnTime = object(src.returnTime, (rt) => pickScalars(rt, RETURN_TIME_KEYS));
    for (const key of SCALAR_ANSWER_KEYS) if (has(src, key)) out[key] = answer(src[key]);
    if (has(src, 'mealRestriction')) {
      out.mealRestriction = answer(src.mealRestriction, (v) => object(v, (m) => pickScalars(m, MEAL_VALUE_KEYS)));
    }
    if (has(src, 'diet')) {
      out.diet = object(src.diet, (diet) => {
        const d = {};
        for (const key of DIET_KEYS) if (has(diet, key)) d[key] = answer(diet[key]);
        return d;
      });
    }
    if (has(src, 'medication')) {
      out.medication = answer(src.medication, (v) => list(v, (m) => pickScalars(m, MEDICATION_ENTRY_KEYS)));
    }
    return out;
  });
}

/**
 * 병원이 보낸 원본에서 **v2 허용 목록에 있는 것만** 남긴다 (모든 층).
 * 원문 병원 복귀의 `hospitalId` 도 목록 밖이다 — 원문은 발행 병원을 뜻하고, 병원 id 는 변환이 채운다(규칙 57).
 * @param {unknown} raw
 */
export function minimizePlan(raw) {
  if (!isPlainObject(raw)) return {};
  const plan = pickScalars(raw, PLAN_SCALAR_KEYS);
  if (has(raw, 'issuer')) plan.issuer = object(raw.issuer, (s) => pickScalars(s, ISSUER_KEYS));
  if (has(raw, 'hospital')) {
    plan.hospital = object(raw.hospital, (h) => {
      const out = pickScalars(h, HOSPITAL_SCALAR_KEYS);
      if (has(h, 'address')) out.address = object(h.address, (a) => pickScalars(a, ADDRESS_KEYS));
      return out;
    });
  }
  if (has(raw, 'periods')) {
    plan.periods = list(raw.periods, (p) => {
      const out = pickScalars(p, PERIOD_SCALAR_KEYS);
      if (has(p, 'items')) out.items = minimizeConditionItems(p.items);
      return out;
    });
  }
  if (has(raw, 'appointments')) plan.appointments = list(raw.appointments, (a) => pickScalars(a, APPOINTMENT_KEYS));
  if (has(raw, 'instructions')) plan.instructions = list(raw.instructions, (i) => pickScalars(i, INSTRUCTION_KEYS));
  return plan;
}

/** 연결 코드 정규화 — 대소문자·공백을 무시한다 */
export function normalizeLinkCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * 데모 어댑터 — 실제 병원 연동이 아니다.
 * 반환값에 `demo: true` 가 박혀 있고 화면이 그것을 상시 표시한다.
 * 공모전 요강의 허위 제출 조항 때문에라도 이 표시는 선택이 아니다 (정의 §9-3).
 * @param {Record<string, () => object>} fixtures  정규화한 코드 → 지침을 만드는 함수
 */
export function demoAdapter(fixtures) {
  return {
    id: 'demo',
    async redeem(code) {
      const key = normalizeLinkCode(code);
      const found = Object.prototype.hasOwnProperty.call(fixtures, key) ? fixtures[key] : null;
      if (!found) return { ok: false, reason: 'unknown_code' };
      return { ok: true, plan: found() };
    },
  };
}

/**
 * 어댑터를 통해 지침을 받아 최소화·검증한다.
 * 검증에 실패하면 **지침을 주지 않는다** — 깨진 지침으로 판정하면 안전 사고다.
 * @returns {Promise<{ok: true, plan: object} | {ok: false, reason: 'unknown_code'|'invalid_plan', errors?: string[]}>}
 */
export async function redeemPlan(adapter, code) {
  const result = await adapter.redeem(code);
  if (!result.ok) return result;

  const plan = minimizePlan(result.plan);
  const { valid, errors } = validatePlan(plan);
  if (!valid) return { ok: false, reason: 'invalid_plan', errors };

  return { ok: true, plan };
}
