// 날짜 분류(coverage)·NEEDS_INPUT 사유·병원 기간 적용·매일 확인 대상 (AX-302 · docs/business-rules.md '날짜별 합성'·'날짜 분류'·'매일 확인'·'병원 연동')
//
// 날짜 D에 적용되는 기간
//   - 민감정보 동의가 유효할 때의 SELF 기간
//   - 철회되지 않았고 expiresAt 이 D의 활동 종료 시각보다 늦은 HOSPITAL 기간
//     (하루 도중에 만료되는 지침은 그날을 덮지 않는다 — 보수적 처리)
//
// 경계일 전 날짜의 FREE 일정은 병원 조건 게이트를 거치지 않는다.
// **이것은 "병원 조건이 없으면 추천하지 않는다" 원칙의 의도된 변경이다** (docs/business-rules.md '날짜 분류', docs/platform/PRODUCT_DEFINITION_V3.md '바뀌는 것 (이번 결정)').

import { REASON } from '../domain/states.js';
import { NO_RESTRICTION_LIMITS, composeConditions, flattenEffective } from './compose.js';
import { CONDITION_SOURCE, OUTING, hospitalPeriodConflict } from './conditions.js';
import { DEFAULTS } from './defaults.js';
import { hasSensitiveConsent, isStayDate, lodgingForDate, postProcedureBoundary, stayDates } from './stay.js';
import { isDateString, kstInstantMs, parseInstantMs } from './time.js';

export const COVERAGE = Object.freeze({
  FREE: 'FREE',
  DECLARED_FREE: 'DECLARED_FREE',
  RESTRICTED: 'RESTRICTED',
  REST_DAY: 'REST_DAY',
  NEEDS_INPUT: 'NEEDS_INPUT',
});

export const HOSPITAL_PERIOD_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

/**
 * @typedef {object} DateClassification
 * @property {string} date
 * @property {'FREE'|'DECLARED_FREE'|'RESTRICTED'|'REST_DAY'|'NEEDS_INPUT'} coverage
 * @property {string[]} reasons  REASON 코드. NEEDS_INPUT 사유, REST_DAY 의 OUTING_FORBIDDEN,
 *   CONFLICTING_CONDITION(docs/business-rules.md '날짜별 합성'), ESCORT_REQUIRED(docs/business-rules.md '하루 일정 생성')
 * @property {string|null} lodgingId  그날 숙소 (`DayPlan.lodgingId`)
 * @property {string[]} appliedPeriodIds  적용된 기간 id (id 순)
 * @property {import('./compose.js').EffectiveConditions} effective
 *   `DayPlan.effective`. 적용 기간이 없으면(FREE·NEEDS_INPUT) 빈 객체
 * @property {import('./compose.js').ConditionLimits | null} limits
 *   엔진 입력. FREE 는 NO_RESTRICTION_LIMITS, NEEDS_INPUT 은 null(일정 없음)
 * @property {Array<'MEDICATION_TIMES_MISSING'|'DEFAULTS_APPLIED'>} warnings
 * @property {boolean} blocked  한 병원 기간 안의 모순으로 날짜가 막힘(docs/business-rules.md '날짜별 합성'), 환자·보호자 외출 없음
 * @property {boolean} patientOutingAllowed  날짜 단위로 환자 외출을 만들 수 있는가 (구간 판정은 엔진)
 * @property {boolean} guardianSoloAllowed   날짜 단위로 보호자 단독 외출이 가능한가
 *   (동반 보호자 있음 + 합성 guardianMustStay=아니오 + 동행 필수 아님 + RESTRICTED/REST_DAY + 막힘 없음).
 *   '환자가 쉬는 구간' 조건은 엔진이 구간마다 판정한다
 * @property {boolean|null} escortRequired  합성 동행 필수. NEEDS_INPUT 은 알 수 없으므로 null
 * @property {'TAXI'|'TRANSIT'} transportMode  FREE·DECLARED_FREE 는 TRANSIT, 그 밖은 TAXI
 * @property {boolean} recoveryBuffer  회복기 가산 버퍼 적용 여부 (RESTRICTED 날의 환자만)
 */

/** 기간의 날짜 범위(양끝 포함)가 D를 덮는가 — 적용 여부와는 별개 */
export function periodCoversDate(period, date) {
  return (
    isDateString(period?.startDate) &&
    isDateString(period?.endDate) &&
    isDateString(date) &&
    period.startDate <= date &&
    date <= period.endDate
  );
}

/**
 * 병원 기간의 날짜 D 기준 상태 (docs/business-rules.md '날짜별 합성').
 * - 철회됨 → REVOKED
 * - `expiresAt` 이 D의 활동 종료 시각(KST, 기본 21:00)보다 늦지 않으면 → EXPIRED
 *   (읽을 수 없는 expiresAt 도 EXPIRED — 적용하지 않는 쪽으로)
 * - 그 밖 → ACTIVE
 * 병원 지침 최신성은 "유효기간 안이고 철회되지 않음"이다. 24시간 한도는 쓰지 않는다 (docs/business-rules.md '매일 확인').
 *
 * @param {import('./conditions.js').ConditionPeriod} period
 * @param {string} date
 * @param {{activityEnd?: string}} [opts]  "HH:MM". 기본 DEFAULTS.activityHours.end.
 *   출국일 마감보다 늦은 기본 활동 종료를 쓰므로 더 보수적이다
 * @returns {'ACTIVE'|'EXPIRED'|'REVOKED'}
 */
export function hospitalPeriodStatus(period, date, { activityEnd = DEFAULTS.activityHours.end } = {}) {
  if (period?.revoked === true) return HOSPITAL_PERIOD_STATUS.REVOKED;
  const expiresMs = parseInstantMs(period?.expiresAt);
  if (expiresMs === null) return HOSPITAL_PERIOD_STATUS.EXPIRED;
  return expiresMs > kstInstantMs(date, activityEnd) ? HOSPITAL_PERIOD_STATUS.ACTIVE : HOSPITAL_PERIOD_STATUS.EXPIRED;
}

/**
 * 기간이 날짜 D에 적용되는가.
 * @param {import('./conditions.js').ConditionPeriod} period
 * @param {string} date
 * @param {{consent: boolean, activityEnd?: string}} opts  consent = 민감정보 동의 유효 여부
 */
export function periodAppliesOnDate(period, date, { consent, activityEnd } = {}) {
  if (!periodCoversDate(period, date)) return false;
  if (period.source === CONDITION_SOURCE.SELF) return consent === true;
  if (period.source === CONDITION_SOURCE.HOSPITAL) {
    return hospitalPeriodStatus(period, date, { activityEnd }) === HOSPITAL_PERIOD_STATUS.ACTIVE;
  }
  return false;
}

function byId(a, b) {
  const x = String(a.id);
  const y = String(b.id);
  return x === y ? 0 : x < y ? -1 : 1;
}

function needsInputReasons({ lodging, applied, postBoundary, consent, covering, date, activityEnd }) {
  const reasons = [];
  if (!lodging) reasons.push(REASON.LODGING_REQUIRED);
  if (applied.length === 0 && postBoundary) {
    if (!consent) {
      reasons.push(REASON.SENSITIVE_CONSENT_REQUIRED);
    } else {
      const statuses = covering
        .filter((p) => p.source === CONDITION_SOURCE.HOSPITAL)
        .map((p) => hospitalPeriodStatus(p, date, { activityEnd }));
      // 연동 지침이 만료된 날짜만 만료 사유다. 병원 값을 본인 체크로 옮기지 않는다 (docs/business-rules.md '병원 연동')
      reasons.push(
        statuses.includes(HOSPITAL_PERIOD_STATUS.EXPIRED)
          ? REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED
          : REASON.CONDITION_INPUT_REQUIRED,
      );
      if (statuses.includes(HOSPITAL_PERIOD_STATUS.REVOKED)) reasons.push(REASON.PLAN_REVOKED);
    }
  }
  return reasons;
}

/**
 * 날짜 하나를 분류한다 (docs/business-rules.md '숙소와 병원'·'날짜별 합성'·'날짜 분류'·'하루 일정 생성').
 *
 * | 분류 | 조건 |
 * | FREE | D < 경계일이고 적용 기간 없음 |
 * | DECLARED_FREE | 적용 기간이 모두 제한 없음 기간 |
 * | RESTRICTED | 적용 기간이 있고 합성 outing ≠ FORBIDDEN |
 * | REST_DAY | 합성 outing = FORBIDDEN |
 * | NEEDS_INPUT | 숙소 없음, 또는 D ≥ 경계일인데 적용 기간 없음 |
 *
 * NEEDS_INPUT 사유: 숙소 없음 LODGING_REQUIRED(다른 사유와 함께 올 수 있음), 그리고 조건 쪽은
 * 동의 없음 SENSITIVE_CONSENT_REQUIRED > 만료된 병원 기간만 덮음 HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED >
 * 그 밖 CONDITION_INPUT_REQUIRED. 철회된 병원 기간이 덮었으면 PLAN_REVOKED 를 덧붙인다.
 * PROCEDURE 일정이 없으면(경계일 없음) 모든 날짜를 경계일 이후로 본다.
 *
 * @param {import('./stay.js').Stay} stay  Stay 또는 PlanStay
 * @param {string} date  체류 날짜여야 한다. 아니면 RangeError
 * @param {{activityEnd?: string}} [opts]
 * @returns {DateClassification}
 */
export function classifyDate(stay, date, { activityEnd = DEFAULTS.activityHours.end } = {}) {
  if (!isStayDate(stay, date)) throw new RangeError(`체류 날짜가 아닙니다: ${String(date)}`);

  const consent = hasSensitiveConsent(stay);
  const lodging = lodgingForDate(stay, date);
  const boundary = postProcedureBoundary(stay);
  const postBoundary = boundary === null || date >= boundary;
  const periods = Array.isArray(stay.periods) ? stay.periods : [];
  const covering = periods.filter((p) => periodCoversDate(p, date));
  const applied = covering.filter((p) => periodAppliesOnDate(p, date, { consent, activityEnd })).sort(byId);

  const base = {
    date,
    lodgingId: lodging?.id ?? null,
    appliedPeriodIds: applied.map((p) => p.id),
  };

  const inputReasons = needsInputReasons({ lodging, applied, postBoundary, consent, covering, date, activityEnd });
  if (inputReasons.length > 0) {
    return {
      ...base,
      coverage: COVERAGE.NEEDS_INPUT,
      reasons: inputReasons,
      effective: {},
      limits: null,
      warnings: [],
      blocked: false,
      patientOutingAllowed: false,
      guardianSoloAllowed: false,
      escortRequired: null,
      transportMode: 'TAXI',
      recoveryBuffer: false,
    };
  }

  if (applied.length === 0) {
    // 경계일 전 빈 날짜, 만료·철회된 병원 기간만 덮었어도 같다 (docs/business-rules.md '날짜별 합성')
    return {
      ...base,
      coverage: COVERAGE.FREE,
      reasons: [],
      effective: {},
      limits: structuredClone(NO_RESTRICTION_LIMITS),
      warnings: [],
      blocked: false,
      patientOutingAllowed: true,
      guardianSoloAllowed: false,
      escortRequired: false,
      transportMode: 'TRANSIT',
      recoveryBuffer: false,
    };
  }

  const { effective, warnings } = composeConditions(applied);
  const limits = flattenEffective(effective);
  const allDeclaredFree = applied.every((p) => p.source === CONDITION_SOURCE.SELF && p.noRestriction === true);
  let coverage = COVERAGE.RESTRICTED;
  if (allDeclaredFree) coverage = COVERAGE.DECLARED_FREE;
  else if (limits.outing === OUTING.FORBIDDEN) coverage = COVERAGE.REST_DAY;

  const blocked = applied.some(hospitalPeriodConflict);
  const escortUnmet = limits.escortRequired && stay.hasCompanion !== true;

  const reasons = [];
  if (coverage === COVERAGE.REST_DAY) reasons.push(REASON.OUTING_FORBIDDEN);
  if (blocked) reasons.push(REASON.CONFLICTING_CONDITION);
  if (coverage === COVERAGE.RESTRICTED && escortUnmet) reasons.push(REASON.ESCORT_REQUIRED);

  const freeLike = coverage === COVERAGE.DECLARED_FREE;
  return {
    ...base,
    coverage,
    reasons,
    effective,
    limits,
    warnings,
    blocked,
    patientOutingAllowed: !blocked && coverage !== COVERAGE.REST_DAY && !escortUnmet,
    guardianSoloAllowed:
      !blocked &&
      stay.hasCompanion === true &&
      (coverage === COVERAGE.RESTRICTED || coverage === COVERAGE.REST_DAY) &&
      !limits.escortRequired &&
      !limits.guardianMustStay,
    escortRequired: limits.escortRequired,
    transportMode: freeLike ? 'TRANSIT' : 'TAXI',
    recoveryBuffer: coverage === COVERAGE.RESTRICTED,
  };
}

/**
 * 체류 전체를 날짜별로 분류한다.
 * @returns {Record<string, DateClassification>}
 */
export function classifyStay(stay, opts) {
  return Object.fromEntries(stayDates(stay).map((date) => [date, classifyDate(stay, date, opts)]));
}

/**
 * 매일 확인 대상인가 (docs/business-rules.md '매일 확인'): 오늘이 체류 기간 안이고, 오늘을 덮는 SELF 기간이 하나 이상.
 * DECLARED_FREE(제한 없음 기간)도 포함한다. HOSPITAL 기간만 덮는 날은 대상이 아니다.
 * 동의가 없으면 SELF 기간이 적용되지 않으므로 대상이 아니다. 미래 날짜는 호출부가 넘기지 않는다.
 * @param {import('./stay.js').Stay} stay
 * @param {string} today  KST 오늘 "YYYY-MM-DD"
 */
export function isDailyCheckTarget(stay, today) {
  if (!isStayDate(stay, today) || !hasSensitiveConsent(stay)) return false;
  return (stay.periods ?? []).some((p) => p?.source === CONDITION_SOURCE.SELF && periodCoversDate(p, today));
}

/**
 * 오늘 매일 확인이 아직 남았는가 — 대상이고, 오늘 날짜에 'CONFIRMED' 기록이 없다.
 * '그대로예요'의 확인은 그날 자정까지만 유효하다(날짜 키).
 * @param {import('./stay.js').Stay} stay
 * @param {string} today
 * @param {Record<string, 'CONFIRMED'>} [dailyCheck]  `Prefs.dailyCheck`
 */
export function isDailyCheckPending(stay, today, dailyCheck = {}) {
  return isDailyCheckTarget(stay, today) && dailyCheck?.[today] !== 'CONFIRMED';
}
