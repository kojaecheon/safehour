// 조건 기간 — 검증과 정규화 (AX-302 · spec 4.4, 5.1 ConditionPeriod)
//
// 앱은 입력값을 해석하지 않는다. 정해진 항목의 형식만 검증하고 그대로 적용한다.
// 자유 서술 칸은 계약에 없다. 의료적 타당성은 검증하지 않는다(병원·환자의 몫).

import { VALIDATION_ISSUE, validationResult } from './errorCodes.js';
import { isClockTime, isDateString, parseInstantMs } from './time.js';

/**
 * @typedef {{kind: 'SET', value: T} | {kind: 'NONE'} | {kind: 'UNKNOWN'}} Answer
 * @template T
 */

/**
 * @typedef {object} ConditionItems  spec 5.1
 * @property {'ALLOWED'|'INDOOR_ONLY'|'FORBIDDEN'} outing  필수
 * @property {{kind: 'SET', time: string, place: 'LODGING'} | {kind: 'SET', time: string, place: 'HOSPITAL', hospitalId: string} | {kind: 'NOT_SET'}} returnTime
 *   outing≠FORBIDDEN 이면 필수
 * @property {Answer<number>} walkLimit   외출 1회 누적(분, 5–240)
 * @property {Answer<number>} travelLimit 구간당(분, 5–240)
 * @property {Answer<true>} avoidUv
 * @property {Answer<true>} avoidHeat
 * @property {Answer<true>} avoidWater
 * @property {Answer<true>} escortRequired
 * @property {Answer<true>} guardianMustStay  기존 splitAllowed 의 반대 의미
 * @property {Answer<{mode: 'UNTIL', until: string} | {mode: 'ALL_DAY'}>} mealRestriction
 * @property {{spicy: Answer<true>, alcohol: Answer<true>, hard: Answer<true>, hot: Answer<true>, raw: Answer<true>}} diet
 * @property {Answer<Array<{time: string, atLodging: boolean}>>} medication
 */

/**
 * @typedef {object} ConditionPeriod  spec 5.1
 * @property {string} id
 * @property {'SELF'|'HOSPITAL'} source
 * @property {string} startDate  포함
 * @property {string} endDate    포함
 * @property {boolean} [noRestriction]  SELF 전용
 * @property {ConditionItems} items
 * @property {string} [planId]       HOSPITAL 전용
 * @property {number} [planVersion]  HOSPITAL 전용
 * @property {string} [hospitalId]   HOSPITAL 전용
 * @property {string} [expiresAt]    HOSPITAL 전용 (ISO8601)
 * @property {boolean} [revoked]     HOSPITAL 전용
 */

export const CONDITION_SOURCE = Object.freeze({ SELF: 'SELF', HOSPITAL: 'HOSPITAL' });
export const OUTING = Object.freeze({ ALLOWED: 'ALLOWED', INDOOR_ONLY: 'INDOOR_ONLY', FORBIDDEN: 'FORBIDDEN' });
export const RETURN_PLACE = Object.freeze({ LODGING: 'LODGING', HOSPITAL: 'HOSPITAL' });

/** spec 4.4 표의 항목 키 (점 표기). `DayPlan.effective` 의 키도 이것이다 */
export const ITEM_KEYS = Object.freeze([
  'outing',
  'returnTime',
  'walkLimit',
  'travelLimit',
  'avoidUv',
  'avoidHeat',
  'avoidWater',
  'escortRequired',
  'guardianMustStay',
  'mealRestriction',
  'diet.spicy',
  'diet.alcohol',
  'diet.hard',
  'diet.hot',
  'diet.raw',
  'medication',
]);

/** Answer<T> 로 답하는 항목 — outing·returnTime 을 뺀 14개 */
export const ANSWER_KEYS = Object.freeze(ITEM_KEYS.filter((k) => k !== 'outing' && k !== 'returnTime'));

/** 예/아니오 항목 — '예'가 제한이다 */
export const YES_NO_KEYS = Object.freeze([
  'avoidUv',
  'avoidHeat',
  'avoidWater',
  'escortRequired',
  'guardianMustStay',
  'diet.spicy',
  'diet.alcohol',
  'diet.hard',
  'diet.hot',
  'diet.raw',
]);

const LIMIT_KEYS = ['walkLimit', 'travelLimit'];
const LIMIT_RANGE = { min: 5, max: 240 };
/** 식이 5항목 (items.diet 의 키) */
export const DIET_KEYS = Object.freeze(['spicy', 'alcohol', 'hard', 'hot', 'raw']);

const NONE = () => ({ kind: 'NONE' });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * 제한 없음 기간(`noRestriction`)과 같은 항목.
 * "모든 항목이 '아니오'이고 복귀 시각이 '병원이 정하지 않음'" (spec 4.4)
 * @type {ConditionItems}
 */
export const NO_RESTRICTION_ITEMS = deepFreeze({
  outing: OUTING.ALLOWED,
  returnTime: { kind: 'NOT_SET' },
  walkLimit: NONE(),
  travelLimit: NONE(),
  avoidUv: NONE(),
  avoidHeat: NONE(),
  avoidWater: NONE(),
  escortRequired: NONE(),
  guardianMustStay: NONE(),
  mealRestriction: NONE(),
  diet: { spicy: NONE(), alcohol: NONE(), hard: NONE(), hot: NONE(), raw: NONE() },
  medication: NONE(),
});

/** 점 표기 키로 항목 값을 읽는다 */
export function getItem(items, key) {
  if (!items || typeof items !== 'object') return undefined;
  if (key.startsWith('diet.')) return items.diet?.[key.slice(5)];
  return items[key];
}

/** 점 표기 키로 항목 값을 바꾼 **새** items 를 돌려준다 */
export function withItem(items, key, value) {
  if (key.startsWith('diet.')) {
    return { ...items, diet: { ...(items?.diet ?? {}), [key.slice(5)]: value } };
  }
  return { ...items, [key]: value };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isUnknownMarker(value) {
  return value === 'UNKNOWN' || value?.kind === 'UNKNOWN';
}

/**
 * Answer 의 `SET` 값이 그 항목의 형식에 맞는가.
 * @returns {null | string} 문제 코드(VALIDATION_ISSUE) 또는 null
 */
export function setValueIssue(key, value) {
  if (LIMIT_KEYS.includes(key)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return VALIDATION_ISSUE.INVALID_VALUE;
    if (value < LIMIT_RANGE.min || value > LIMIT_RANGE.max) return VALIDATION_ISSUE.OUT_OF_RANGE;
    return null;
  }
  if (YES_NO_KEYS.includes(key)) return value === true ? null : VALIDATION_ISSUE.INVALID_VALUE;
  if (key === 'mealRestriction') {
    if (value?.mode === 'ALL_DAY') return null;
    if (value?.mode === 'UNTIL' && isClockTime(value.until)) return null;
    return VALIDATION_ISSUE.INVALID_VALUE;
  }
  if (key === 'medication') {
    if (!Array.isArray(value) || value.length === 0) return VALIDATION_ISSUE.INVALID_VALUE;
    const ok = value.every((m) => m && isClockTime(m.time) && typeof m.atLodging === 'boolean');
    return ok ? null : VALIDATION_ISSUE.INVALID_VALUE;
  }
  return VALIDATION_ISSUE.INVALID_VALUE;
}

/** 모르겠음이 아닌, 형식에 맞는 답(SET·NONE)인가 */
export function isResolvedAnswer(key, answer) {
  if (answer?.kind === 'NONE') return true;
  return answer?.kind === 'SET' && setValueIssue(key, answer.value) === null;
}

/** `returnTime` 이 형식에 맞는 SET·NOT_SET 인가 (병원이면 hospitalId 포함) */
export function isResolvedReturnTime(returnTime) {
  if (returnTime?.kind === 'NOT_SET') return true;
  if (returnTime?.kind !== 'SET' || !isClockTime(returnTime.time)) return false;
  if (returnTime.place === RETURN_PLACE.LODGING) return true;
  return returnTime.place === RETURN_PLACE.HOSPITAL && isNonEmptyString(returnTime.hospitalId);
}

function checkOuting(outing, push) {
  if (outing === undefined || outing === null || outing === '') return push('items.outing', VALIDATION_ISSUE.REQUIRED);
  if (isUnknownMarker(outing)) return push('items.outing', VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
  if (!Object.values(OUTING).includes(outing)) push('items.outing', VALIDATION_ISSUE.INVALID_VALUE);
}

function checkReturnTime(returnTime, required, hospitalIds, push) {
  if (returnTime === undefined || returnTime === null) {
    if (required) push('items.returnTime', VALIDATION_ISSUE.REQUIRED);
    return;
  }
  if (isUnknownMarker(returnTime)) return push('items.returnTime', VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
  if (returnTime.kind === 'NOT_SET') return;
  if (returnTime.kind !== 'SET' || !isClockTime(returnTime.time)) {
    return push('items.returnTime', VALIDATION_ISSUE.INVALID_VALUE);
  }
  if (returnTime.place === RETURN_PLACE.LODGING) return;
  if (returnTime.place !== RETURN_PLACE.HOSPITAL) return push('items.returnTime', VALIDATION_ISSUE.INVALID_VALUE);
  // 규칙 13-1 — 병원 복귀에는 hospitalId 가 반드시 있다
  if (!isNonEmptyString(returnTime.hospitalId)) {
    return push('items.returnTime.hospitalId', VALIDATION_ISSUE.HOSPITAL_ID_REQUIRED);
  }
  if (hospitalIds && !hospitalIds.has(returnTime.hospitalId)) {
    push('items.returnTime.hospitalId', VALIDATION_ISSUE.UNKNOWN_HOSPITAL);
  }
}

function checkAnswer(key, answer, source, push) {
  const field = `items.${key}`;
  if (answer === undefined || answer === null) return push(field, VALIDATION_ISSUE.REQUIRED);
  if (answer.kind === 'UNKNOWN') {
    // 병원 발행 기간에는 '모르겠음'이 없다
    if (source === CONDITION_SOURCE.HOSPITAL) push(field, VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
    return;
  }
  if (answer.kind === 'NONE') return;
  if (answer.kind !== 'SET') return push(field, VALIDATION_ISSUE.INVALID_VALUE);
  const issue = setValueIssue(key, answer.value);
  if (issue) push(field, issue);
}

/**
 * 조건 기간을 검증한다. 필수 항목이 비어 있거나 형식이 틀리면 저장하지 않는다 (spec 4.4, 규칙 6·13-1).
 *
 * - `outing` 필수, '모르겠음' 불가
 * - `returnTime` 은 outing≠FORBIDDEN 이면 필수, '모르겠음' 불가. 병원이면 `hospitalId` 필수
 * - 나머지 항목은 키가 모두 있어야 하고(답을 고르지 않은 항목이 없어야 함), SELF 만 '모르겠음' 허용
 * - `noRestriction` 은 SELF 만. 그 기간은 항목을 보지 않는다
 * - HOSPITAL 은 `expiresAt`(ISO8601)·`revoked`(boolean) 필수. 이미 만료된 기간도 저장한다(규칙 12)
 * - `escortRequired`=예 와 `guardianMustStay` 의 관계는 여기서 거부하지 않는다.
 *   SELF 는 정규화가 '예'로 고정하고, HOSPITAL 의 모순은 날짜를 막는다(규칙 11).
 *
 * @param {ConditionPeriod} period
 * @param {{hospitals?: Array<{id: string}>}} [opts]  주면 병원 복귀 hospitalId 가 이 안에 있어야 한다
 * @returns {{ok: boolean, errorCode?: 'SAFEHOUR_STAY_INVALID', fields: string[], issues: Array<{field: string, code: string}>}}
 */
export function validateConditionPeriod(period, { hospitals } = {}) {
  const issues = [];
  const push = (field, code) => {
    issues.push({ field, code });
  };
  if (!period || typeof period !== 'object') return validationResult([{ field: 'period', code: VALIDATION_ISSUE.REQUIRED }]);

  if (!isNonEmptyString(period.id)) push('id', VALIDATION_ISSUE.REQUIRED);
  const source = period.source;
  if (!Object.values(CONDITION_SOURCE).includes(source)) push('source', VALIDATION_ISSUE.INVALID_VALUE);

  const startOk = isDateString(period.startDate);
  const endOk = isDateString(period.endDate);
  if (!startOk) push('startDate', VALIDATION_ISSUE.REQUIRED);
  if (!endOk) push('endDate', VALIDATION_ISSUE.REQUIRED);
  if (startOk && endOk && period.startDate > period.endDate) push('endDate', VALIDATION_ISSUE.PERIOD_DATES_ORDER);

  if (period.noRestriction !== undefined && typeof period.noRestriction !== 'boolean') {
    push('noRestriction', VALIDATION_ISSUE.INVALID_VALUE);
  }
  const declaredFree = period.noRestriction === true;
  if (declaredFree && source === CONDITION_SOURCE.HOSPITAL) {
    push('noRestriction', VALIDATION_ISSUE.NO_RESTRICTION_SELF_ONLY);
  }

  if (source === CONDITION_SOURCE.HOSPITAL) {
    if (parseInstantMs(period.expiresAt) === null) push('expiresAt', VALIDATION_ISSUE.REQUIRED);
    if (typeof period.revoked !== 'boolean') push('revoked', VALIDATION_ISSUE.REQUIRED);
  }

  const skipItems = declaredFree && source === CONDITION_SOURCE.SELF;
  if (!skipItems) {
    const items = period.items;
    if (!items || typeof items !== 'object') {
      push('items', VALIDATION_ISSUE.REQUIRED);
    } else {
      const hospitalIds = Array.isArray(hospitals) ? new Set(hospitals.map((h) => h?.id)) : null;
      checkOuting(items.outing, push);
      checkReturnTime(items.returnTime, items.outing !== OUTING.FORBIDDEN, hospitalIds, push);
      for (const key of ANSWER_KEYS) checkAnswer(key, getItem(items, key), source, push);
    }
  }

  return validationResult(issues);
}

/**
 * 저장·합성 전에 기간을 정규화한다. 입력은 바꾸지 않고 새 객체를 돌려준다.
 *
 * - SELF `noRestriction` → 항목을 `NO_RESTRICTION_ITEMS` 로 바꾼다
 * - SELF 에서 `escortRequired`=예 → `guardianMustStay` 를 '예'로 고정한다 (spec 4.4)
 * - HOSPITAL 값은 바꾸지 않는다 (모순은 `hospitalPeriodConflict` 가 날짜를 막는다)
 *
 * @param {ConditionPeriod} period
 * @returns {ConditionPeriod}
 */
export function normalizeConditionPeriod(period) {
  if (period?.source === CONDITION_SOURCE.SELF && period.noRestriction === true) {
    return { ...period, items: structuredClone(NO_RESTRICTION_ITEMS) };
  }
  const items = period?.items;
  if (!items || typeof items !== 'object') return { ...period };
  let next = { ...items, diet: items.diet && typeof items.diet === 'object' ? { ...items.diet } : items.diet };
  if (period.source === CONDITION_SOURCE.SELF && items.escortRequired?.kind === 'SET') {
    next = withItem(next, 'guardianMustStay', { kind: 'SET', value: true });
  }
  return { ...period, items: next };
}

/**
 * 규칙 11 — 한 병원 기간 안에 `escortRequired`=예 와 `guardianMustStay`=아니오(보호자 분리 허용)가
 * 함께 있으면 그 기간이 덮는 날짜를 `CONFLICTING_CONDITION` 으로 막는다.
 * @param {ConditionPeriod} period
 */
export function hospitalPeriodConflict(period) {
  return (
    period?.source === CONDITION_SOURCE.HOSPITAL &&
    period.items?.escortRequired?.kind === 'SET' &&
    period.items?.guardianMustStay?.kind === 'NONE'
  );
}
