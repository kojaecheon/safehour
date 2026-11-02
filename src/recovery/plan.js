// 병원 지침 계약 v2 — 형식 검증과 지침 상태 (AX-311 · spec 4.20, 5.3 · ADR-0011)
//
// 정의: `docs/PRODUCT_DEFINITION.md` §2·§4, `docs/decisions/0011-recovery-plan-v2-freshness.md`
//
// ```text
// RecoveryPlan {
//   schemaVersion: 2, planId, version (≥1), issuedAt, updatedAt?, expiresAt, revoked: boolean, demo?: boolean,
//   issuer: { name, role },
//   hospital: { name, address: { roadAddress, lat, lng }, phone? },
//   periods: Array<{ startDate, endDate, items: ConditionItems /* SET|NONE 만 */ }>,
//   appointments?: Array<{ type: "PROCEDURE" | "VISIT", date, start, end? }>,
//   instructions: Array<{ id, category, text, lang, updatedAt, acknowledged? }>   // 채널 B
// }
// ```
//
// 두 채널을 **구조로** 분리한다.
//   - periods·appointments (채널 A): 기계가 읽는 값. `HOSPITAL` 조건 기간이 되어 날짜별 합성에 참여한다
//   - instructions (채널 B): 병원이 쓴 문장. 표시 전용. 판정에 쓰지 않고 번역하지 않는다 (`instructions.js`)
//
// - 형식이 하나라도 어긋나면 **지침 전체를 거부한다.** 기간의 날짜가 역순이어도 전체를 거부한다.
// - v1 은 받지 않는다(규칙 48). 실제 연동 병원이 없고 데모 지침만 있기 때문이다.
// - 기간이 `expiresAt` 을 넘어도 거부하거나 잘라내지 않는다. 적용 여부는 날짜마다 합성 규칙이 판정한다(spec 4.5).
// - 환자 호출 필드는 없다. 호출은 데모 사건(`PATIENT_RECALL`)으로만 다룬다(spec 4.20).
// - 원문 `returnTime` 의 `place: "HOSPITAL"` 은 `hospitalId` 가 없고 **발행 병원**을 뜻한다.
//   연결 병원 id 로 채우는 일은 변환(`link.js`)이 한다(규칙 57).
//
// 이 파일에는 의료 해석이 없다. 병원이 확정한 값을 형식만 검증해 그대로 넘긴다.

import { CONDITION_SOURCE, validateConditionPeriod } from '../stay/conditions.js';
import { HOSPITAL_PERIOD_STATUS } from '../stay/coverage.js';
import { APPOINTMENT_TYPES, NAME_MAX_LENGTH } from '../stay/stay.js';
import { isClockTime, isDateString, parseInstantMs, toMinutes } from '../stay/time.js';
import { instructionErrors } from './instructions.js';

export {
  CRITICAL_CATEGORIES,
  INSTRUCTION_CATEGORIES,
  acknowledgementKey,
  stripAcknowledged,
  unconfirmedCritical,
  unconfirmedInstructions,
} from './instructions.js';

export const PLAN_VERSION = 2;

/** 지침 전체의 상태 — 조건 기간의 병원 상태와 같은 값을 쓴다 */
export const PLAN_STATUS = HOSPITAL_PERIOD_STATUS;

/**
 * 대한민국 범위(경계 제외). 일정 API 의 좌표 범위 검사(`lib/server/itinerary-request.js` inKorea)와 같은 범위다 (spec 6장).
 */
const KOREA_BOUNDS = Object.freeze({ latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 });

/**
 * 원문 병원 복귀를 공통 조건 검증에 넘길 때 쓰는 자리표시자.
 * 원문에는 hospitalId 가 없고 발행 병원을 뜻하므로, 형식 검증만 통과시키고 결과에는 남기지 않는다.
 */
const ISSUING_HOSPITAL = '__issuing_hospital__';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toMs(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

function hospitalErrors(hospital, push) {
  if (!isPlainObject(hospital)) return push('hospital');
  if (!isNonEmptyString(hospital.name) || hospital.name.length > NAME_MAX_LENGTH) push('hospital.name');
  const address = hospital.address;
  if (!isPlainObject(address)) {
    push('hospital.address');
  } else {
    if (!isNonEmptyString(address.roadAddress)) push('hospital.address.roadAddress');
    const { lat, lng } = address;
    const inKorea =
      isFiniteNumber(lat) &&
      isFiniteNumber(lng) &&
      lat > KOREA_BOUNDS.latMin &&
      lat < KOREA_BOUNDS.latMax &&
      lng > KOREA_BOUNDS.lngMin &&
      lng < KOREA_BOUNDS.lngMax;
    if (!inKorea) push('hospital.address.latLng');
  }
  if (hospital.phone != null && typeof hospital.phone !== 'string') push('hospital.phone');
}

/**
 * 기간 하나 — 날짜(역순 거부)와 항목(SET·NONE 만)을 조건 기간 공통 검증으로 본다 (spec 4.4 병원 발행 기간).
 */
function periodErrors(period, i, plan, push) {
  const at = `periods[${i}]`;
  if (!isPlainObject(period)) return push(at);

  let items = period.items;
  const returnTime = isPlainObject(items) ? items.returnTime : undefined;
  if (isPlainObject(returnTime)) {
    // v2 원문에는 hospitalId 가 없다 — 있으면 발행 병원이 아닌 다른 병원을 가리키려는 것이므로 계약 위반이다
    if (Object.prototype.hasOwnProperty.call(returnTime, 'hospitalId')) push(`${at}.items.returnTime.hospitalId`);
    else if (returnTime.place === 'HOSPITAL') items = { ...items, returnTime: { ...returnTime, hospitalId: ISSUING_HOSPITAL } };
  }

  const result = validateConditionPeriod({
    id: at,
    source: CONDITION_SOURCE.HOSPITAL,
    startDate: period.startDate,
    endDate: period.endDate,
    items,
    expiresAt: plan.expiresAt,
    revoked: plan.revoked,
  });
  for (const issue of result.issues) {
    // 유효기간·철회는 지침 머리에서 따로 본다
    if (issue.field === 'expiresAt' || issue.field === 'revoked') continue;
    push(`${at}.${issue.field}`);
  }
}

function appointmentErrors(appointments, push) {
  if (appointments == null) return;
  if (!Array.isArray(appointments)) return push('appointments');
  appointments.forEach((a, i) => {
    const at = `appointments[${i}]`;
    if (!isPlainObject(a)) return push(at);
    if (!APPOINTMENT_TYPES.includes(a.type)) push(`${at}.type`);
    if (!isDateString(a.date)) push(`${at}.date`);
    const startOk = isClockTime(a.start);
    if (!startOk) push(`${at}.start`);
    if (a.end != null) {
      if (!isClockTime(a.end)) push(`${at}.end`);
      else if (startOk && toMinutes(a.end) <= toMinutes(a.start)) push(`${at}.end`);
    }
  });
}

/**
 * v2 형식 검증. **값의 의학적 타당성은 검증하지 않는다** — 그것은 병원의 몫이다.
 * 목록 밖 필드는 여기서 보지 않는다(게이트웨이 `minimizePlan` 이 버린다).
 * @param {unknown} plan
 * @returns {{valid: boolean, errors: string[]}}  errors 는 필드 경로뿐이다(값을 담지 않는다)
 */
export function validatePlan(plan) {
  const errors = [];
  const push = (field) => {
    if (!errors.includes(field)) errors.push(field);
  };
  if (!isPlainObject(plan)) return { valid: false, errors: ['plan'] };

  if (plan.schemaVersion !== PLAN_VERSION) push('schemaVersion');
  if (!isNonEmptyString(plan.planId)) push('planId');
  if (!Number.isInteger(plan.version) || plan.version < 1) push('version');
  if (parseInstantMs(plan.issuedAt) === null) push('issuedAt');
  if (plan.updatedAt != null && parseInstantMs(plan.updatedAt) === null) push('updatedAt');
  if (parseInstantMs(plan.expiresAt) === null) push('expiresAt');
  if (typeof plan.revoked !== 'boolean') push('revoked');
  if (plan.demo != null && typeof plan.demo !== 'boolean') push('demo');

  if (!isPlainObject(plan.issuer)) {
    push('issuer');
  } else {
    if (!isNonEmptyString(plan.issuer.name)) push('issuer.name');
    if (typeof plan.issuer.role !== 'string') push('issuer.role');
  }

  hospitalErrors(plan.hospital, push);

  if (!Array.isArray(plan.periods)) push('periods');
  else plan.periods.forEach((period, i) => periodErrors(period, i, plan, push));

  appointmentErrors(plan.appointments, push);

  for (const field of instructionErrors(plan.instructions)) push(field);

  return { valid: errors.length === 0, errors };
}

/**
 * 지침 전체의 지금 상태 — "유효기간 안이고 철회되지 않음" 이 최신성이다 (spec 4.6). 24시간 한도는 없다.
 * 날짜별 적용은 이 값이 아니라 `hospitalPeriodStatus`(날짜의 활동 종료 시각 기준)가 정한다.
 * @param {{revoked?: boolean, expiresAt?: string}} plan
 * @param {{now?: Date|number}} [opts]
 * @returns {'ACTIVE'|'EXPIRED'|'REVOKED'}
 */
export function planStatus(plan, { now = Date.now() } = {}) {
  if (plan?.revoked === true) return PLAN_STATUS.REVOKED;
  const expiresMs = parseInstantMs(plan?.expiresAt);
  if (expiresMs === null || expiresMs <= toMs(now)) return PLAN_STATUS.EXPIRED;
  return PLAN_STATUS.ACTIVE;
}
