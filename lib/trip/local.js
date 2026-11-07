// 기기에서 바로 하는 일정 변환 (AX-316 · docs/platform/IA_AND_FLOWS.md '즉시 복귀'·'동의 철회와 데이터 삭제')
//
//   outingInProgress          오늘 환자가 외출 중인가(출발했고 아직 돌아오지 않음)
//   immediateReturnCauseFor   외출 중에 그 외출이 쓴 병원 지침 기간이 철회·만료됐는가 → 원인 사유
//                             (엔진 tripPlan.js 의 planLostDuringOuting 과 같은 기준 — 재계획이 뒤집지 않는다)
//   stripConditionData        하루 일정에서 조건(건강 정보)에서 나온 값을 지운다. 정거장·시각은 그대로
//   markConsentWithdrawnLocally  동의 철회를 재계획하지 못했을 때(오프라인·오류) 기기에서 먼저 반영한다
//
// 순수 함수다. 입력을 바꾸지 않는다.

import { REASON, RETURN_NOW_CAUSES, STATE } from '../../src/domain/states.js';
import { occupancyEnd } from '../../src/engine/dayContext.js';
import { HOSPITAL_PERIOD_STATUS, classifyDate, hospitalPeriodStatus, periodCoversDate } from '../../src/stay/coverage.js';
import { isStayDate } from '../../src/stay/stay.js';
import { toMinutes } from '../../src/stay/time.js';
import { MEAL_SLOTS } from './edits.js';

/** 조건 항목에서 나온 사유 — 동의를 철회하면 남기지 않는다 */
export const CONDITION_REASONS = Object.freeze([
  REASON.CONFLICTING_CONDITION,
  REASON.FASTING_REQUIRED,
  REASON.OUTING_FORBIDDEN,
  REASON.ESCORT_REQUIRED,
  REASON.UV_EXPOSURE,
  REASON.INDOOR_ONLY_REQUIRED,
  REASON.WALK_LIMIT_EXCEEDED,
  REASON.TRAVEL_LIMIT_EXCEEDED,
  REASON.MEDICATION_WINDOW,
  REASON.HEAT_EXPOSURE,
  REASON.WATER_ACTIVITY,
  REASON.DIET_RESTRICTED,
  REASON.MENU_UNKNOWN,
]);
/** 조건에서 나온 경고 (TRAVEL_TIMES_ESTIMATED 는 조건과 무관) */
const CONDITION_WARNINGS = Object.freeze(['MEDICATION_TIMES_MISSING', 'DEFAULTS_APPLIED']);
/** 식이 조건에서 나온 정거장 표시 */
const DIET_LABELS = Object.freeze(['DIET_ESTIMATED', 'ORDER_CARD']);

const keepReasons = (list) => (Array.isArray(list) ? list.filter((r) => !CONDITION_REASONS.includes(r)) : []);

function uniq(list) {
  return [...new Set(list)];
}

/** 오늘 환자 외출 중인가 — 출발 시각 ≤ 지금 < 돌아오는 시각(병원 복귀면 마감) */
export function outingInProgress(day, nowMin) {
  if (!Number.isFinite(nowMin)) return false;
  return (day?.outings ?? []).some((o) => toMinutes(o.departAt) <= nowMin && nowMin < occupancyEnd(o));
}

/**
 * 외출 중 지침 철회·만료 (docs/platform/IA_AND_FLOWS.md '즉시 복귀').
 * 오늘 저장 일정이 그 지침(planId)의 병원 기간을 적용 조건 출처로 썼고, 환자가 외출 중이며,
 * 새 기간(periods)의 오늘 상태가 철회·만료면 원인을 돌려준다. 이미 즉시 복귀 중이면 null.
 * @param {{day: object|null, periods: object[], planId: string, today: string, nowMin: number}} args
 * @returns {'PLAN_REVOKED'|'PLAN_EXPIRED'|null}
 */
export function immediateReturnCauseFor({ day, periods, planId, today, nowMin }) {
  if (!day || day.date !== today || day.returnNow === true) return null;
  if (!outingInProgress(day, nowMin)) return null;
  const used = new Set(
    Object.values(day.effective ?? {})
      .flatMap((entry) => entry?.provenance ?? [])
      .filter((p) => p?.source === 'HOSPITAL')
      .map((p) => p.periodId),
  );
  let cause = null;
  for (const period of periods ?? []) {
    if (period?.source !== 'HOSPITAL' || period.planId !== planId || !used.has(period.id) || !periodCoversDate(period, today)) continue;
    const status = hospitalPeriodStatus(period, today);
    if (status === HOSPITAL_PERIOD_STATUS.REVOKED) return REASON.PLAN_REVOKED;
    if (status === HOSPITAL_PERIOD_STATUS.EXPIRED) cause = REASON.PLAN_EXPIRED;
  }
  return cause;
}

function stripOutings(list) {
  return (list ?? []).map((o) => ({
    ...o,
    stops: (o.stops ?? []).map((s) => ({ ...s, labels: (s.labels ?? []).filter((l) => !DIET_LABELS.includes(l)) })),
  }));
}

/**
 * 조건에서 나온 값을 지운 하루 — 적용 조건(effective), 복약 블록, 조건 경고, 식이 표시, 제외 목록, 조건 사유.
 * 정거장·외출·시각·상태는 그대로다.
 */
export function stripConditionData(day) {
  if (!day || typeof day !== 'object') return day;
  const out = {
    ...day,
    reasons: keepReasons(day.reasons),
    effective: {},
    blocks: (day.blocks ?? []).filter((b) => b?.kind !== 'MEDICATION'),
    outings: stripOutings(day.outings),
    guardianOutings: stripOutings(day.guardianOutings),
    mealSlots: (day.mealSlots ?? []).map((m) => ({ ...m, reasons: keepReasons(m.reasons) })),
    excluded: [],
    warnings: (day.warnings ?? []).filter((w) => !CONDITION_WARNINGS.includes(w)),
  };
  if (day.delta) out.delta = { ...day.delta, reasons: keepReasons(day.delta.reasons) };
  return out;
}

/**
 * 기기에서 만드는 NEEDS_INPUT 하루 — 분류(classifyDate)의 사유·숙소를 쓰고 외출을 비운다.
 * 오늘이면 이미 도착한 정거장만 남긴다(재계획 규칙 2 — 외출 중인 사람의 복귀 마감을 지우지 않는다).
 */
function needsInputDay(day, classification, { isToday, nowMin }) {
  const keep = (list) =>
    isToday && Number.isFinite(nowMin)
      ? stripOutings(list)
          .map((o) => ({ ...o, stops: o.stops.filter((s) => toMinutes(s.arriveAt) <= nowMin) }))
          .filter((o) => o.stops.length > 0)
      : [];
  const outings = keep(day.outings);
  const guardianOutings = keep(day.guardianOutings);
  const kept = new Set([...outings, ...guardianOutings].flatMap((o) => o.stops.map((s) => s.id)));
  // 즉시 복귀 원인은 동의 철회로 지우지 않는다
  const returnNow = isToday && day.returnNow === true;
  return {
    date: day.date,
    coverage: 'NEEDS_INPUT',
    dayState: outings.length > 0 ? STATE.TOGETHER : guardianOutings.length > 0 ? STATE.SPLIT_NEARBY : STATE.NO_TOURISM,
    reasons: uniq([...(returnNow ? (day.reasons ?? []).filter((r) => RETURN_NOW_CAUSES.includes(r)) : []), ...classification.reasons]),
    window: day.window ?? null,
    lodgingId: classification.lodgingId,
    transportMode: 'TAXI',
    effective: {},
    blocks: (day.blocks ?? []).filter((b) => b?.kind === 'APPOINTMENT'),
    outings,
    guardianOutings,
    mealSlots: MEAL_SLOTS.map((slot) => {
      const m = (day.mealSlots ?? []).find((x) => x?.slot === slot);
      return m?.status === 'FILLED' && kept.has(m.stopId)
        ? { slot, status: 'FILLED', stopId: m.stopId, reasons: [] }
        : { slot, status: 'NOT_APPLICABLE', reasons: [] };
    }),
    excluded: [],
    warnings: kept.size > 0 ? ['TRAVEL_TIMES_ESTIMATED'] : [],
    returnNow,
  };
}

/**
 * 동의 철회를 재계획하지 못했을 때(docs/platform/IA_AND_FLOWS.md '동의 철회와 데이터 삭제') 기기에서 먼저 반영한 days.
 *   - 영향 날짜 중 오늘 이후이고 지금 체류로 NEEDS_INPUT 인 날짜: 외출을 비운 NEEDS_INPUT 하루(사유는 분류 그대로)
 *   - 나머지 모든 날짜(지난 날짜 포함): 조건에서 나온 값만 지운다
 * 건강 정보에서 나온 값이 기기 일정에 남지 않게 한다. 다음 재계획이 정식 결과로 바꾼다.
 * @param {{tripPlan: object, stay: object, dates: string[], today: string, nowMin: number}} args  stay 는 철회 뒤 체류
 * @returns {Record<string, object>}
 */
export function markConsentWithdrawnLocally({ tripPlan, stay, dates, today, nowMin }) {
  const affected = new Set(dates ?? []);
  const out = {};
  for (const [date, day] of Object.entries(tripPlan?.days ?? {})) {
    if (affected.has(date) && date >= today && isStayDate(stay, date)) {
      const classification = classifyDate(stay, date);
      out[date] =
        classification.coverage === 'NEEDS_INPUT'
          ? needsInputDay(day, classification, { isToday: date === today, nowMin })
          : stripConditionData(day);
    } else {
      out[date] = stripConditionData(day);
    }
  }
  return out;
}
