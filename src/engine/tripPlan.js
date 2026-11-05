// 체류 전체 일정 조립과 재계획 (AX-307 · spec 4.9, 4.10 엔진 쪽, 6장 POST /api/itinerary/plan)
//
// 순수·결정적 함수다. 시계·난수를 읽지 않는다 — 현재 시각(now)은 입력이다.
// 판정은 하루 일정 엔진(planStayDay → planDay) 한 경로로만 한다. 이 모듈은 날짜를 순회하고,
// 체류 중 1회 규칙·재계획 규칙·데모 사건·전후 비교·즉시 복귀·표시만 다시 쓰기를 맡는다.
//
// 날짜별 처리
//   지난 날짜(< 오늘)   previous 가 있으면 그대로 돌려준다(재계획 규칙 2, 규칙 30). 없으면 새로 만든다.
//   previous 가 있음    최소 변경(dayRepair.js): 확정 일정을 지금 입력으로 다시 판정해(게이트 1단계부터) 통과하고 맞는
//                      정거장은 제자리에 두고, 통과하지 못한 정거장만 대체 → 체류 축소 → 제외 → 외출 취소 순으로 고친다.
//                      오늘은 도착 시각이 지난 정거장과 이미 출발한 외출의 출발 시각을 건드리지 않는다.
//   previous 가 없음    새로 만든다. 오늘이면 지금(now) 이후만 짠다. 고칠 외출이 없는 날(외출 0개, 환자 외출이 새로 가능)과
//                      다시 만들기(regenerate)도 새로 만든다 — 오늘은 이미 출발한 외출만 이어 받고 그 뒤부터.
//   합친 하루도 외출·하루 정거장 한도(식사 포함)를 지킨다. 비운 식사 칸은 다시 채우지 않는다.
//   병원 일정마다 병원에서 끝나는 외출은 하나다 — 병원 일정이 옮겨지면 그 외출의 마감만 옮긴다(새 외출을 더하지 않는다).
//
// 결정성·멱등(규칙 28·55): 오늘 사건은 받은 목록 전체를 접어 한 번에 적용하므로(tripEvents.js) 같은 사건을 다시 보내도
// 결과가 같다. 고친 결과는 다시 고쳐도 그대로인 고정점이다. 변화가 없으면 전후 비교를 새로 만들지 않고 저장된 것을 둔다.
// 사용자 편집(삭제·교체·비움)으로 생긴 변화는 '변경됨'으로 알리지 않는다. 보이는 변화에는 늘 원인 사유가 있다.

import { REASON, RETURN_NOW_CAUSES, STATE } from '../domain/states.js';
import { HOSPITAL_PERIOD_STATUS, hospitalPeriodStatus, periodAppliesOnDate, periodCoversDate } from '../stay/coverage.js';
import { hasSensitiveConsent, isStayDate, lodgingForDate, pointOf, stayDates } from '../stay/stay.js';
import { createFallbackEstimator, createTransitEstimator } from '../adapters/travelTime.js';
import { KST_OFFSET_MIN, fromMinutes, isDateString, parseInstantMs, toMinutes } from '../stay/time.js';
import { SilentReplanError, computeDayDelta } from './dayDelta.js';
import {
  MEAL_SLOT_NAMES,
  assembleOuting,
  blocksToPlan,
  buildDayContext,
  candidatesFrom,
  manualEvaluation,
  mealSlotOf,
  occupancyEnd,
  outingMeta,
  passesGate,
  patientDeadlineAt,
} from './dayContext.js';
import { planDay, planStayDay } from './dayPlan.js';
import { newRepairLog, repairDay } from './dayRepair.js';
import { LABEL_ORDER, WARNING_ORDER } from './displayOrder.js';
import { checkOutingSla } from './slaCalculator.js';
import { foldDemoEvents, shiftAppointmentsOnDate } from './tripEvents.js';

export { SilentReplanError };

/** 일정 규칙 버전 — 게이트 순서·버퍼·순위·재계획 규칙이 바뀌면 올린다 */
export const ITINERARY_ENGINE_VERSION = '2.0.0';

/** 기기가 재계획 없이 바로 반영하는 즉시 복귀 원인(applyImmediateReturn 입력). OUTING_OVERDUE 는 재계획 결과로만 정해지므로 뺀다 */
const IMMEDIATE_RETURN_CAUSES = Object.freeze(RETURN_NOW_CAUSES.filter((r) => r !== REASON.OUTING_OVERDUE));
/** 풀리면 남은 시간을 다시 짜는 원인 — 날짜 사유에 남아 있다가 사라지면 풀린 것이다 */
const LIFTABLE_CAUSES = Object.freeze([
  REASON.PATIENT_RECALLED,
  REASON.RISK_SIGNAL,
  REASON.PLAN_REVOKED,
  REASON.PLAN_EXPIRED,
  REASON.OUTING_OVERDUE,
  REASON.APPOINTMENT_DELAYED,
  REASON.CLOSED,
  REASON.WEATHER_BLOCKED,
  REASON.SLA_INSUFFICIENT,
]);

function uniq(list) {
  return [...new Set(list)];
}

/**
 * now(ISO8601 문자열·ms·Date) → KST 날짜와 자정부터의 분. 시계를 읽지 않는다 — now 가 없으면 TypeError.
 * 시간대 표기가 없는 ISO 문자열은 KST 로 읽는다(stay/time.js parseInstantMs).
 * @returns {{date: string, minutes: number, ms: number}}
 */
export function kstClock(now) {
  let ms = null;
  if (typeof now === 'number' && Number.isFinite(now)) ms = now;
  else if (now instanceof Date && Number.isFinite(now.getTime())) ms = now.getTime();
  else if (typeof now === 'string') ms = parseInstantMs(now);
  if (ms === null) throw new TypeError('now 가 필요합니다 (ISO8601 또는 ms) — 엔진은 시계를 읽지 않습니다');
  const shifted = new Date(ms + KST_OFFSET_MIN * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    ms,
  };
}

function dayContentIds(day) {
  return [...(day?.outings ?? []), ...(day?.guardianOutings ?? [])].flatMap((o) => (o.stops ?? []).map((s) => String(s.contentId)));
}

function stopSignature(day) {
  return JSON.stringify(
    [...(day?.outings ?? []), ...(day?.guardianOutings ?? [])].map((o) => o.stops.map((s) => [s.id, s.arriveAt])),
  );
}

function started(stop, nowMin) {
  return toMinutes(stop.arriveAt) <= nowMin;
}

/** 오늘을 덮는 유효한(철회·만료 아님) 병원 지침이 있는가 — returnNow 해제 조건 (spec 4.9) */
function hospitalPlanCoversDate(stay, date) {
  const consent = hasSensitiveConsent(stay);
  return (stay.periods ?? []).some((p) => p?.source === 'HOSPITAL' && periodAppliesOnDate(p, date, { consent }));
}

/**
 * 외출 중 지침 철회·만료 (spec 4.9 즉시 복귀, 규칙 13).
 * previous 오늘 일정에서 환자가 외출 중이고(출발했고 아직 돌아오지 않음), 그 일정이 쓴 병원 기간
 * (effective 출처)이 지금 철회·만료됐으면 원인을 돌려준다.
 * @returns {'PLAN_REVOKED'|'PLAN_EXPIRED'|null}
 */
function planLostDuringOuting(prevDay, stay, date, nowMin) {
  if (!prevDay) return null;
  const out = (prevDay.outings ?? []).some((o) => toMinutes(o.departAt) <= nowMin && nowMin < occupancyEnd(o));
  if (!out) return null;
  const used = new Set(
    Object.values(prevDay.effective ?? {})
      .flatMap((entry) => entry?.provenance ?? [])
      .filter((p) => p?.source === 'HOSPITAL')
      .map((p) => p.periodId),
  );
  let cause = null;
  for (const period of stay.periods ?? []) {
    if (period?.source !== 'HOSPITAL' || !used.has(period.id) || !periodCoversDate(period, date)) continue;
    const status = hospitalPeriodStatus(period, date);
    if (status === HOSPITAL_PERIOD_STATUS.REVOKED) return REASON.PLAN_REVOKED;
    if (status === HOSPITAL_PERIOD_STATUS.EXPIRED) cause = REASON.PLAN_EXPIRED;
  }
  return cause;
}

/**
 * 외출 중 재계획으로 이미 늦은 환자 외출 (설계서 2026-11-06 overdue-return 4.3, 경우 2).
 * 이전 오늘 일정(prevDay)의 환자 외출 중 이미 출발했고
 *   - 지금 외출 중(planLostDuringOuting 과 같은 기준: 출발 <= 지금 < occupancyEnd)이거나
 *   - 이전 일정이 이 원인(OUTING_OVERDUE)으로 즉시 복귀 중이고 그 외출의 여유가 음수였던
 * 외출을 고른다. 그중 다시 계산한 하루(day)에 같은 id 로 남아 있고 여유가 음수인 첫 외출의 id 를 돌려준다.
 * 같은 외출인지는 출발 시각까지 본다: 외출 id 는 출발 순서로 다시 매겨지고, 이미 출발한 외출의 출발 시각은 바뀌지 않는다.
 * 여유가 음수라는 것은 남은 정거장을 줄이고도 마감을 맞출 수 없다는 뜻이다(dayContext.js overdueSafe).
 * 시간이 그냥 흘러서는 켜지지 않는다: 외출 중이면 마감 전이고, 입력이 같으면 여유도 같다.
 *
 * 유지·해제(heldSlack): 이미 이 원인으로 즉시 복귀 중인 외출은 day 의 여유로 보지 않는다. overdueSafe 가 마감을 그때
 * 시각으로 당겨 두어 다음 재계획부터는 '돌아온 외출'로 고정되고 여유도 다시 계산되지 않기 때문이다. 대신 heldSlack 이
 * 저장된 외출을 지금 입력으로 다시 잰 여유를 쓴다(지금 시각을 쓰지 않으므로 시간만 흘러서는 바뀌지 않는다).
 * heldSlack 이 null 을 돌려주면 그 외출의 출발 시각을 둘 창이 없다는 뜻이다(옮긴 블록이 출발을 덮음): 아직 늦다.
 * @param {{prevDay: object|null, day: object|null, nowMin: number, heldSlack?: ((outing: object) => number|null)|null}} args
 * @returns {string|null}
 */
export function overdueOutingId({ prevDay, day, nowMin, heldSlack = null }) {
  if (!prevDay || !day || !Number.isFinite(nowMin)) return null;
  const held = prevDay.returnNow === true && (prevDay.reasons ?? []).includes(REASON.OUTING_OVERDUE);
  const watched = (prevDay.outings ?? []).filter(
    (o) => toMinutes(o.departAt) <= nowMin && (nowMin < occupancyEnd(o) || (held && o.slackMin < 0)),
  );
  for (const o of watched) {
    const now = (day.outings ?? []).find((x) => x.id === o.id && x.departAt === o.departAt);
    if (!now) continue;
    const slack = held && o.slackMin < 0 && heldSlack ? heldSlack(o) : now.slackMin;
    if (slack === null || slack < 0) return o.id;
  }
  return null;
}

/**
 * 오늘 returnNow 의 원인 (spec 4.9, 규칙 13·55).
 * - 환자 호출 사건이 오늘 사건 목록에 있다 → PATIENT_RECALLED (사건 초기화로 목록에서 빠지면 풀린다)
 * - 이전에 철회·만료로 켜졌다 → 유효한 지침이 다시 오늘을 덮기 전까지 유지
 * - 외출 중 철회·만료가 지금 감지됐다
 * - 외출 중이던 환자 외출이 다시 계산한 하루(probeDay)에서 여유가 음수다 → OUTING_OVERDUE (경우 2, overdueOutingId)
 *   이미 이 원인으로 즉시 복귀 중이면 heldSlack 으로 다시 잰 여유가 음수인 동안 유지한다
 */
function returnNowCauses({ fold, prevDay, stay, date, nowMin, probeDay = null, heldSlack = null }) {
  const causes = [];
  if (fold.patientRecalled) causes.push(REASON.PATIENT_RECALLED);
  if (prevDay?.returnNow === true && !hospitalPlanCoversDate(stay, date)) {
    causes.push(...(prevDay.reasons ?? []).filter((r) => r === REASON.PLAN_REVOKED || r === REASON.PLAN_EXPIRED));
  }
  const lost = planLostDuringOuting(prevDay, stay, date, nowMin);
  if (lost) causes.push(lost);
  if (probeDay && overdueOutingId({ prevDay, day: probeDay, nowMin, heldSlack })) causes.push(REASON.OUTING_OVERDUE);
  return uniq(causes);
}

/**
 * 새로 만든 일정(planDay) — 오늘이면 startMin(지금·이어 받은 외출이 끝난 뒤) 이후만.
 * 이어 받은 외출이 채운 식사 칸은 비운 칸처럼 넘기고, 그 정거장은 다시 쓰지 않는다.
 */
function freshFrom(context, common, startMin, servedSlots, keptIds) {
  if (!context.frame?.window) return planDay(freshInput(context, common, context.frame, common.edits, common.usedContentIds));
  const frame = { ...context.frame, startMin: Math.max(context.frame.startMin, startMin) };
  const edits = { ...common.edits, clearedMeals: uniq([...(common.edits?.clearedMeals ?? []), ...servedSlots]) };
  return planDay(freshInput(context, common, frame, edits, [...common.usedContentIds, ...keptIds]));
}

function freshInput(context, common, frame, edits, usedContentIds) {
  return {
    date: context.date,
    classification: context.classification,
    frame,
    lodging: context.lodging,
    hospitals: context.hospitals,
    appointments: context.appointments,
    hasCompanion: context.stay.hasCompanion === true,
    interests: context.stay.interests ?? [],
    pace: context.stay.pace,
    weather: common.weather,
    edits,
    usedContentIds,
    candidates: common.candidates,
    closedContentIds: common.closedContentIds,
    extraBufferMin: common.extraBufferMin,
    estimators: common.estimators,
  };
}

const hasPatient = (day) => (day?.outings ?? []).length > 0;
const hasGuardian = (day) => (day?.guardianOutings ?? []).length > 0;
/** 고칠 확정 일정이 없다 — 외출이 하나도 없거나, 환자 외출이 없는데 새로 가능해졌다 */
const needsFresh = (day, fresh) => !hasPatient(day) && (!hasGuardian(day) || hasPatient(fresh));

/**
 * 새로 만든다. 오늘이면 이미 출발한 외출은 previous 에서 이어 받아(시작된 정거장 그대로) 고치고,
 * 나머지는 그 외출이 끝난 뒤·지금 이후부터 새로 짠다. 합친 하루도 한도를 지킨다(repairDay 가 남은 한도로 자른다).
 */
function planStructural({ context, common, fresh, prevDay, nowMin, emptyReasons, log, adopt = false }) {
  const departed = (o) => nowMin !== null && toMinutes(o.departAt) <= nowMin;
  // 원인이 풀렸을 때(adopt): 이미 출발한 외출이 원인 없는 하루(fresh)의 같은 외출이면(출발 시각이 같고 시작된 정거장이
  // 그 앞부분) 그 외출의 남은 정거장을 되살린다. 시작된 정거장은 그대로이고 남은 정거장은 repairDay 가 다시 검증한다
  const restore = (o, list) => {
    if (!adopt) return o;
    const started = o.stops.filter((x) => toMinutes(x.arriveAt) <= nowMin);
    const same = list.find(
      (f) =>
        f.departAt === o.departAt &&
        f.returnPlace === o.returnPlace &&
        started.every((x, i) => f.stops[i]?.id === x.id && f.stops[i].arriveAt === x.arriveAt && f.stops[i].leaveAt === x.leaveAt),
    );
    return same ? { ...same, id: o.id, stops: [...started, ...same.stops.slice(started.length)] } : o;
  };
  const keptP = (prevDay?.outings ?? []).filter(departed).map((o) => restore(o, fresh.outings));
  const keptG = (prevDay?.guardianOutings ?? []).filter(departed).map((o) => restore(o, fresh.guardianOutings));
  const kept = [...keptP, ...keptG];
  let planned = fresh;
  if (nowMin !== null) {
    const startMin = Math.max(nowMin, ...kept.map(occupancyEnd));
    const served = keptP.flatMap((o) => o.stops.map((s) => (s.isMeal ? mealSlotOf(prevDay, s) : null))).filter(Boolean);
    planned = freshFrom(context, common, startMin, served, kept.flatMap((o) => o.stops.map((s) => String(s.contentId))));
  }
  const futureP = emptyReasons.length > 0 ? [] : planned.outings;
  const futureG = emptyReasons.length > 0 ? [] : planned.guardianOutings;
  const keptStopIds = new Set(kept.flatMap((o) => o.stops.map((s) => s.id)));
  const dayRef = {
    mealSlots: [
      ...(prevDay?.mealSlots ?? []).filter((m) => keptStopIds.has(m.stopId)),
      ...(adopt ? fresh.mealSlots.filter((m) => keptStopIds.has(m.stopId)) : []),
      ...planned.mealSlots,
    ],
    // 되살린 외출이 병원에서 끝나면 그 병원 일정 블록은 fresh 에 있다(hospitalTargetId 가 복귀 마감과 같은 시작으로 찾는다)
    blocks: [...(prevDay?.blocks ?? []), ...(adopt ? fresh.blocks : []), ...planned.blocks],
  };
  const repaired = repairDay({ context, dayRef, outings: [...keptP, ...futureP], guardianOutings: [...keptG, ...futureG], nowMin, emptyReasons, log });
  return { ...repaired, planned };
}

/**
 * 하루 조립 — 날짜 단위 값(분류·합성·제외·경고)은 전체 하루 새 일정에서, 외출·식사 칸·블록·상태는 고친 결과에서.
 * @param {object} source  식사 칸 기록의 출처(최소 변경이면 previous, 새로 만들었으면 새 일정)
 */
function assembleDay({ context, fresh, date, repaired, source, structural, nowMin, emptyReasons, log }) {
  const renumber = (list, role) =>
    list
      .slice()
      .sort((a, b) => toMinutes(a.departAt) - toMinutes(b.departAt))
      .map((o, i) => ({ ...o, id: `${date}:${role}:outing-${i + 1}` }));
  const outings = renumber(repaired.outings, 'P');
  const guardianOutings = renumber(repaired.guardianOutings, 'G');
  const placed = new Set([...outings, ...guardianOutings].flatMap((o) => o.stops.map((s) => String(s.contentId))));

  const mealSlots = MEAL_SLOT_NAMES.map((slot) => {
    const f = fresh.mealSlots.find((m) => m.slot === slot) ?? { slot, status: 'NOT_APPLICABLE', reasons: [] };
    const src = source?.mealSlots?.find((m) => m.slot === slot) ?? null;
    const meal = context.meals[slot];
    const past = nowMin !== null && meal.latestMin < nowMin;
    if (repaired.mealServed.has(slot)) return { slot, status: 'FILLED', stopId: repaired.mealServed.get(slot), reasons: [] };
    if (context.edits.cleared.has(slot) || log.clearedSlots.has(slot)) return { slot, status: 'CLEARED', reasons: [] };
    if (emptyReasons.length > 0) return past && src && src.status !== 'FILLED' ? src : { slot, status: 'NOT_APPLICABLE', reasons: [...emptyReasons] };
    if (!context.patientAllowed) return f;
    if (!meal.allowed) return { slot, status: 'NOT_APPLICABLE', reasons: [REASON.FASTING_REQUIRED] };
    if (log.slotReasons.has(slot)) return { slot, status: 'NONE_AVAILABLE', reasons: log.slotReasons.get(slot) };
    if (src && src.status !== 'FILLED') return src;
    if (src) return past ? { slot, status: 'NOT_APPLICABLE', reasons: [] } : { slot, status: 'NONE_AVAILABLE', reasons: [REASON.NO_CANDIDATE] };
    return f;
  });

  const anyFresh = hasPatient(fresh) || hasGuardian(fresh);
  const anyNow = outings.length + guardianOutings.length > 0;
  let dayState = fresh.dayState;
  let reasons = [...fresh.reasons];
  if (outings.length > 0) dayState = STATE.TOGETHER;
  else if (guardianOutings.length > 0) dayState = STATE.SPLIT_NEARBY;
  else if (emptyReasons.length > 0) dayState = STATE.NO_TOURISM;
  else if (anyFresh) {
    // 새 일정에는 외출이 있지만 지금은 하나도 없다 — 시간이 지났거나(오늘) 고칠 수 없어 취소됐다
    const planned = repaired.planned;
    if (structural && planned && !hasPatient(planned) && !hasGuardian(planned)) {
      dayState = planned.dayState;
      reasons.push(...planned.reasons.filter((r) => r === REASON.NO_CANDIDATE || r === REASON.DEPARTURE_WINDOW_TOO_SHORT));
      if (!reasons.includes(REASON.NO_CANDIDATE)) reasons.push(REASON.DEPARTURE_WINDOW_TOO_SHORT);
    } else {
      dayState = STATE.STANDBY;
      reasons.push(...(log.reasons.size > 0 ? log.reasons : [REASON.NO_CANDIDATE]));
    }
  }
  if (anyNow && !anyFresh) reasons = reasons.filter((r) => r !== REASON.NO_CANDIDATE && r !== REASON.DEPARTURE_WINDOW_TOO_SHORT);
  if ([...outings, ...guardianOutings].some((o) => o.slackMin < 0)) reasons.push(REASON.SLA_INSUFFICIENT);

  const warnings = new Set(fresh.warnings);
  if (anyNow) warnings.add('TRAVEL_TIMES_ESTIMATED');
  return {
    ...fresh,
    dayState,
    reasons: uniq(reasons),
    blocks: blocksToPlan(repaired.blocks),
    outings,
    guardianOutings,
    mealSlots,
    excluded: fresh.excluded.filter((e) => !placed.has(String(e.candidateId))),
    warnings: WARNING_ORDER.filter((w) => warnings.has(w)),
  };
}

/** previous 정거장 중 지금 게이트를 통과하지 못해 반드시 바뀌어야 하는 것 (규칙 31 확인용). 사용자가 지운 것은 뺀다 */
function requiredStopIds(prevDay, context, nowMin, emptyAll) {
  const out = [];
  for (const [role, list] of [
    ['P', prevDay.outings ?? []],
    ['G', prevDay.guardianOutings ?? []],
  ]) {
    for (const outing of list) {
      for (const stop of outing.stops) {
        if (nowMin !== null && started(stop, nowMin)) continue;
        if (context.edits.deleted.has(String(stop.contentId))) continue;
        const slot = stop.isMeal ? mealSlotOf(prevDay, stop) : null;
        if (slot && context.edits.cleared.has(slot)) continue;
        if (emptyAll || !passesGate(context, role, stop)) out.push(stop.id);
      }
    }
  }
  return out;
}

/** 날짜 하나 */
function planDate({ stay, date, clock, prevDay, dayEdits, usedContentIds, fold, weatherByDate, airportTravel, candidatesByLodging, estimators, forceFresh }) {
  if (prevDay && date < clock.date) return prevDay; // 지난 날짜는 건드리지 않는다

  const isToday = date === clock.date;
  const nowMin = isToday ? clock.minutes : null;
  const shifted = isToday ? shiftAppointmentsOnDate(stay, date, fold.appointmentDeltaMin) : stay;
  const common = {
    airportTravel,
    candidates: candidatesFrom(candidatesByLodging, lodgingForDate(stay, date)?.id ?? null, date),
    weather: isToday && fold.weatherUnsafe ? { outdoorUnsafe: true } : weatherByDate?.[date] ?? null,
    edits: dayEdits,
    usedContentIds,
    closedContentIds: isToday ? fold.closedContentIds : [],
    extraBufferMin: isToday ? fold.extraBufferMin : 0,
    estimators,
  };
  const fresh = planStayDay(shifted, date, common);
  if (!isToday && !prevDay) return fresh;

  const context = buildDayContext({ stay: shifted, date, ...common });
  const appointmentMoved = isToday && fold.appointmentDeltaMin !== 0 && context.apptEvents.length > 0;

  // 원인 표시: 사건·예보가 계속되는 동안 그 원인이 일정을 바꿨으면 날짜 사유에 남긴다 — 원인이 풀린 것을 알아채는 데 쓴다
  const markerActive = {
    [REASON.CLOSED]: isToday && fold.closedContentIds.length > 0,
    [REASON.WEATHER_BLOCKED]: common.weather?.outdoorUnsafe === true,
    [REASON.SLA_INSUFFICIENT]: isToday && fold.extraBufferMin > 0,
  };
  const markersFor = (lg) =>
    Object.keys(markerActive).filter((r) => markerActive[r] && (lg.reasons.has(r) || (prevDay?.reasons ?? []).includes(r)));
  const carry = (from) => {
    const to = newRepairLog();
    from.reasons.forEach((r) => to.reasons.add(r));
    from.userDriven.forEach((id) => to.userDriven.add(id));
    from.clearedSlots.forEach((x) => to.clearedSlots.add(x));
    return to;
  };

  /** 즉시 복귀 원인(causes)으로 하루를 만든다 */
  const attempt = (causes) => {
    const emptyReasons = isToday ? [...(fold.riskSignal ? [REASON.RISK_SIGNAL] : []), ...causes] : [];
    const eventReasons = [...emptyReasons, ...(appointmentMoved ? [REASON.APPOINTMENT_DELAYED] : [])];
    const buildDay = (isStructural, result, lg) => {
      let d = assembleDay({
        context,
        fresh,
        date,
        repaired: result,
        source: isStructural ? result.planned : prevDay,
        structural: isStructural,
        nowMin,
        emptyReasons,
        log: lg,
      });
      if (isToday && emptyReasons.length > 0) d = { ...d, dayState: STATE.NO_TOURISM };
      d = { ...d, reasons: uniq([...eventReasons, ...markersFor(lg), ...d.reasons]) };
      if (isToday) d = { ...d, returnNow: causes.length > 0 };
      return d;
    };

    // 최소 변경: 확정 일정이 있으면 고친다. 고칠 것이 없으면(외출이 없음) 새로 만든다(오늘은 지금 이후)
    let log = newRepairLog();
    let structural = forceFresh || !prevDay || needsFresh(prevDay, fresh);
    let repaired = null;
    if (!structural) {
      repaired = repairDay({
        context,
        dayRef: prevDay,
        outings: prevDay.outings,
        guardianOutings: prevDay.guardianOutings,
        nowMin,
        emptyReasons,
        log,
      });
      if (emptyReasons.length === 0 && needsFresh(repaired, fresh)) {
        // 고친 결과 외출이 하나도 남지 않았다. 새로 만든다(같은 입력이면 다음 재계획도 같은 결과)
        log = carry(log);
        structural = true;
      }
    }
    if (structural) repaired = planStructural({ context, common, fresh, prevDay, nowMin, emptyReasons, log });
    return { emptyReasons, eventReasons, buildDay, log, structural, day: buildDay(structural, repaired, log) };
  };

  // 경우 2 유지·해제: 이 원인으로 즉시 복귀 중인 외출을 지금 입력으로 다시 잰 여유. 출발 시각이 든 창의 마감
  // (alternatives.js 와 같은 규칙)에 저장된 정거장(모두 이미 시작됨)을 그대로 두고 복귀 계산식을 다시 쓴다.
  // 지금 시각을 쓰지 않으므로 시간만 흘러서는 값이 바뀌지 않는다. 병원은 저장된 마감(당겨진 시각)이 아니라 출발 시각이 든
  // 창의 병원 일정으로 찾는다. 출발 시각을 둘 창이 없으면(옮긴 블록이 출발을 덮음, 환자 외출이 막힘) null 이다
  const heldSlack = (o) => {
    const at = context.patientAllowed && o.stops.length > 0 ? patientDeadlineAt(context, toMinutes(o.departAt), o.returnPlace) : null;
    if (!at) return null;
    return assembleOuting(manualEvaluation(context, 'P', o, o.stops, at.returnPoint), outingMeta(context, 'P', { id: o.id, deadline: at })).slackMin;
  };

  let pass = attempt(isToday ? returnNowCauses({ fold, prevDay, stay, date, nowMin }) : []);
  if (isToday && prevDay) {
    // 경우 2: 다시 계산한 하루(probeDay)에서 외출 중이던 외출이 이미 늦었으면 그 원인으로 한 번 더 만든다
    const causes = returnNowCauses({ fold, prevDay, stay, date, nowMin, probeDay: pass.day, heldSlack });
    if (causes.includes(REASON.OUTING_OVERDUE)) pass = attempt(causes);
  }
  const { emptyReasons, eventReasons, buildDay, structural } = pass;
  let { log, day } = pass;

  // 원인이 풀렸다(사건 초기화, 유효한 지침이 다시 덮음, 예보가 풀림). 그 원인으로 비우거나 줄인 남은 시간을
  // 지금 이후로 다시 짠다. 이미 출발한 외출과 도착한 정거장은 그대로다(spec 4.9 returnNow 해제·사건 초기화)
  let lifted = [];
  if (!structural && prevDay && emptyReasons.length === 0) {
    lifted = LIFTABLE_CAUSES.filter((r) => (prevDay.reasons ?? []).includes(r) && !day.reasons.includes(r));
    if (lifted.length > 0) {
      log = carry(log);
      day = buildDay(true, planStructural({ context, common, fresh, prevDay, nowMin, emptyReasons, log, adopt: true }), log);
    }
  }
  if (!prevDay) return day;

  const delta = computeDayDelta(prevDay, day, {
    reasons: [...eventReasons, ...lifted, ...log.reasons],
    requiredStopIds: requiredStopIds(prevDay, context, nowMin, emptyReasons.length > 0),
    userDrivenIds: log.userDriven,
    replacements: log.replacements,
    // 사용자 편집(삭제·교체·비움)만이 원인일 때만 '변경됨'을 만들지 않는다 — 원인이 풀린 재계획은 사용자 편집이 아니다
    userEditOnly: eventReasons.length === 0 && lifted.length === 0 && log.reasons.size === 0 && log.userDriven.size > 0,
  });
  if (delta.hasVisibleChange) day = { ...day, delta };
  else if (prevDay.delta) day = { ...day, delta: prevDay.delta };
  if (prevDay.intro && stopSignature(prevDay) === stopSignature(day)) day = { ...day, intro: prevDay.intro };
  return day;
}

function normalizeDates(stay, dates) {
  const all = stayDates(stay);
  if (dates === undefined || dates === null) return all;
  if (!Array.isArray(dates)) throw new TypeError('dates 는 날짜 배열이어야 합니다');
  for (const d of dates) if (!isDateString(d)) throw new RangeError(`날짜 형식이 올바르지 않습니다: ${String(d)}`);
  const wanted = new Set(dates);
  return all.filter((d) => wanted.has(d)); // 체류 밖 날짜는 만들지 않는다
}

function relabelStop(stop, byId) {
  const cand = byId.get(String(stop.contentId));
  if (!cand) return stop;
  const source = cand.stop ?? {};
  const labels = new Set((stop.labels ?? []).filter((l) => l !== 'NEEDS_TRANSLATION'));
  if (cand.needsTranslation === true) labels.add('NEEDS_TRANSLATION');
  const compact = (ids) => Object.fromEntries(Object.entries(ids ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    ...stop,
    title: source.title ?? cand.title ?? stop.title,
    address: source.address ?? stop.address,
    lang: source.lang ?? cand.titleLanguage ?? stop.lang,
    // 선택 언어의 원본 id 를 더한다(장소 상세 조회용). 기존 id 는 지우지 않는다
    sourceIds: { ...(stop.sourceIds ?? {}), ...compact(source.sourceIds) },
    contentTypeIds: { ...(stop.contentTypeIds ?? {}), ...compact(source.contentTypeIds) },
    labels: LABEL_ORDER.filter((l) => labels.has(l)),
  };
}

/**
 * 표시만 다시 쓰기 (spec 4.9 변화 원천 7, 6장 relabelOnly, 규칙 51).
 * 게이트·시각·상태를 다시 판정하지 않는다. 정거장의 제목·주소·표시 언어·'번역 필요' 표시와 언어별 원본 id 만
 * 새 언어 후보(contentId 로 매칭)에서 다시 채운다. ko 원문은 그대로다. 전후 비교를 만들지 않는다.
 */
export function relabelDay(day, candidates) {
  const byId = new Map();
  for (const c of candidates ?? []) {
    const id = String(c?.stop?.contentId ?? c?.id ?? '');
    if (id && !byId.has(id)) byId.set(id, c);
  }
  const outings = (list) => (list ?? []).map((o) => ({ ...o, stops: o.stops.map((s) => relabelStop(s, byId)) }));
  return {
    ...day,
    outings: outings(day.outings),
    guardianOutings: outings(day.guardianOutings),
    excluded: (day.excluded ?? []).map((e) => {
      const cand = byId.get(String(e.candidateId));
      return cand ? { ...e, title: cand.title ?? e.title } : e;
    }),
  };
}

/**
 * @typedef {object} PlanTripInput  spec 6장 POST /api/itinerary/plan 요청 + 서버가 준비한 외부 데이터
 * @property {object} stay  PlanStay(또는 Stay) — validateStay 를 통과한 것
 * @property {Record<string, object[]> | ((lodgingId: string, date: string) => object[])} candidatesByLodging
 *   숙소 id → 관광 후보 모듈(normalizeTourCandidate) 후보 목록. 선택 언어(lang)로 정규화된 것.
 *   반경은 엔진이 날짜 분류에 따라 자른다(제한일 3km·자유일 10km) — 숙소마다 가장 넓은 반경으로 한 번 조회하면 된다
 * @property {Record<string, {outdoorUnsafe: boolean|null}|null>} [weatherByDate]  모르면 비움(판정에 반영 안 함)
 * @property {{airportToLodgingMin?: number, lodgingToAirportMin?: number}} airportTravel  입국일·출국일 창 계산용(분)
 * @property {'ko'|'en'|'ja'|'zh'} [lang]  표시 언어 — 판정에 쓰지 않는다(후보가 이미 그 언어로 정규화돼 있다)
 * @property {string|number|Date} now  현재 시각(ISO8601 또는 ms). 오늘·지난 날짜·시작된 정거장 판정
 * @property {string[]} [dates]  없으면 체류 전체. 체류 밖 날짜는 무시
 * @property {Record<string, object>} [previous]  날짜 → 저장된 DayPlan. 있으면 delta 를 채운다
 * @property {Record<string, {pinned?: string[], deleted?: string[], clearedMeals?: Array<'LUNCH'|'DINNER'>}>} [edits]
 * @property {string[]} [usedContentIds]  요청하지 않은 날짜에 이미 배치된 contentId (규칙 29)
 * @property {object[]} [events]  오늘 데모 사건 전체(누적) — 오늘에만 적용
 * @property {boolean} [relabelOnly]
 * @property {{TAXI?: object, TRANSIT?: object}} [estimators]  동기 이동 추정기 주입(기본: 폴백·대중교통 추정기)
 */

/**
 * 체류 전체(또는 dates) 일정을 만든다 (spec 4.9, 6장).
 * @param {PlanTripInput} input
 * @returns {{engineVersion: string, days: Record<string, object>}}
 * @throws {TypeError} now·stay 가 없음, 잘못된 사건
 * @throws {SilentReplanError} 변화가 필요한데 전후 비교가 빔(엔진 결함 — 규칙 31)
 */
export function planTrip(input) {
  return runPlan(input, { forceFresh: false });
}

function runPlan(input, { forceFresh }) {
  const {
    stay,
    candidatesByLodging = {},
    weatherByDate = {},
    airportTravel = {},
    now,
    dates,
    previous = {},
    edits = {},
    usedContentIds = [],
    events = [],
    relabelOnly = false,
    estimators = {},
  } = input ?? {};
  const clock = kstClock(now);
  if (!stay || typeof stay !== 'object') throw new TypeError('stay 가 필요합니다');
  const requested = normalizeDates(stay, dates);
  const prev = previous ?? {};
  const days = {};

  if (relabelOnly) {
    for (const date of requested) {
      const day = prev[date];
      if (!day) continue;
      days[date] =
        date < clock.date
          ? structuredClone(day)
          : structuredClone(relabelDay(day, candidatesFrom(candidatesByLodging, day.lodgingId ?? lodgingForDate(stay, date)?.id ?? null, date)));
    }
    return { engineVersion: ITINERARY_ENGINE_VERSION, days };
  }

  const fold = foldDemoEvents(events ?? []);
  // 체류 중 1회 규칙(규칙 29): 날짜 D 는 다른 날짜에 이미 둔 장소를 쓰지 않는다 —
  // 요청하지 않은 날짜의 배치(usedContentIds·previous), 다른 요청 날짜의 확정 일정(previous), 이번에 먼저 만든 날짜.
  // 확정 일정을 예약해 두므로 오늘 사건으로 오늘을 고쳐도 다른 날짜의 장소를 가져가지 않는다(변화 원천 6: 오늘만).
  const external = new Set((usedContentIds ?? []).map(String));
  const previousIds = new Map(Object.entries(prev).map(([date, day]) => [date, dayContentIds(day)]));
  const computed = new Map();
  // 고정한 장소는 그 날짜에서만 예외다 — 다른 날짜의 자동 배치는 그 장소를 피한다
  const pinnedByDate = Object.entries(edits ?? {}).map(([date, e]) => [date, (e?.pinned ?? []).map(String)]);

  for (const date of requested) {
    const used = new Set(external);
    for (const [d, ids] of previousIds) if (d !== date) ids.forEach((id) => used.add(id));
    for (const [, ids] of computed) ids.forEach((id) => used.add(id));
    for (const [d, ids] of pinnedByDate) if (d !== date) ids.forEach((id) => used.add(id));
    const day = planDate({
      stay,
      date,
      clock,
      prevDay: prev[date]?.date === date ? prev[date] : null,
      dayEdits: edits?.[date] ?? {},
      usedContentIds: [...used],
      fold,
      weatherByDate,
      airportTravel,
      candidatesByLodging,
      estimators,
      forceFresh,
    });
    days[date] = structuredClone(day);
    computed.set(date, dayContentIds(day));
  }
  return { engineVersion: ITINERARY_ENGINE_VERSION, days };
}

/**
 * 다시 만들기 (spec 4.10): 범위의 고정·삭제·비움 기록을 지우고 새로 만든다. 지난 날짜는 다시 만들 수 없다.
 * 오늘이 범위에 들면 도착 시각이 지난 정거장은 그대로다(재계획 규칙 2).
 * @param {PlanTripInput & {scope: 'DAY'|'FROM_TODAY', date?: string}} input  dates 는 무시한다(범위가 정한다)
 * @returns {{engineVersion: string, days: Record<string, object>, edits: Record<string, object>}}
 *   edits 는 범위의 기록을 지운 새 편집 기록(기기에 저장할 것)
 */
export function regenerate({ scope, date, ...input }) {
  const clock = kstClock(input.now);
  const all = stayDates(input.stay);
  let dates;
  if (scope === 'DAY') {
    if (!isStayDate(input.stay, date)) throw new RangeError(`체류 날짜가 아닙니다: ${String(date)}`);
    if (date < clock.date) throw new RangeError('지난 날짜는 다시 만들 수 없습니다');
    dates = [date];
  } else if (scope === 'FROM_TODAY') {
    dates = all.filter((d) => d >= clock.date);
  } else {
    throw new RangeError(`다시 만들기 범위가 올바르지 않습니다: ${String(scope)}`);
  }
  const cleared = new Set(dates);
  const edits = Object.fromEntries(Object.entries(input.edits ?? {}).filter(([d]) => !cleared.has(d)));
  // 다시 만들기는 확정 일정을 고치지 않고 새로 만든다(오늘은 이미 출발한 외출만 이어 받는다)
  const result = runPlan({ ...input, dates, edits }, { forceFresh: true });
  return { ...result, edits };
}

/**
 * 즉시 복귀 변환 (spec 4.9 즉시 복귀, 규칙 13) — 외출 중 지침 철회·만료(또는 환자 호출)를 기기에서 바로 반영한다.
 * 오늘 남은 정거장(도착 시각이 지나지 않은 것)을 비우고 returnNow=true, 원인 사유를 붙인다.
 * 시작된 정거장은 그대로 둔다. stay(숙소·병원 좌표)를 주면 비운 외출의 예상 귀가·이동·보행 합계·여유를 남은 정거장으로
 * 다시 계산한다(주지 않으면 외출 단위 값은 비우기 전 값 그대로다). 다음 재계획(planTrip)도 returnNow 를 해제 조건까지 유지한다.
 * @param {object} day  오늘 DayPlan
 * @param {{now: string|number|Date, cause: 'PLAN_REVOKED'|'PLAN_EXPIRED'|'PATIENT_RECALLED', stay?: object,
 *          estimators?: {TAXI?: object, TRANSIT?: object}}} opts
 * @returns {object} 새 DayPlan (입력은 바꾸지 않는다). 보이는 변화가 있으면 delta 를 붙인다
 */
/**
 * 병원으로 복귀하는 외출의 병원 (규칙 13-1) — dayContext.returnPointOf 와 같은 순서다.
 * 마감이 병원 일정에서 왔으면 그 일정의 병원, 합성된 복귀 시각(RETURN_TIME)에서 왔으면 그 시각의 `hospitalId` 다.
 * 어느 쪽으로도 찾지 못하면 null 이다 — 첫 번째 병원으로 추측하지 않는다.
 * 병원이 둘 이상인 것은 정상이고(사용자 병원 + 연동 지침이 더한 병원), 즉시 복귀는 숫자가 가장 중요한 순간이다.
 */
function returnHospitalOf(outing, { stay, day }) {
  const appt = (stay.appointments ?? []).find((a) => a?.date === day.date && a.start === outing.returnBy);
  const hospitalId = appt?.hospitalId ?? day.effective?.returnTime?.value?.hospitalId;
  if (typeof hospitalId !== 'string' || hospitalId === '') return null;
  return (stay.hospitals ?? []).find((h) => h?.id === hospitalId) ?? null;
}

/**
 * 비운 외출의 복귀 시각·이동·보행 합계를 남은(시작된) 정거장으로 다시 계산한다 — 저장된 체류(숙소·병원 좌표)가 있을 때.
 * 복귀 마감(returnBy)은 그대로이고, 여유는 추가 버퍼 없이 다시 계산한다.
 */
function recomputeTruncated(outing, original, { stay, day, estimators = {} }) {
  if (!stay || outing.stops.length === 0 || outing.stops.length === original.stops.length) return outing;
  const lodging = (stay.lodgings ?? []).find((l) => l?.id === day.lodgingId);
  const target = outing.returnPlace === 'HOSPITAL' ? returnHospitalOf(outing, { stay, day }) : lodging;
  if (!target) return outing;
  const estimator =
    day.transportMode === 'TRANSIT' ? estimators.TRANSIT ?? createTransitEstimator() : estimators.TAXI ?? createFallbackEstimator();
  const last = outing.stops.at(-1);
  const back = estimator.estimate({ lat: Number(last.lat), lng: Number(last.lng) }, pointOf(target));
  const backMin = Math.ceil(back.min);
  const legs = [...outing.stops.map((x) => x.legIn.min), backMin];
  const sla = checkOutingSla({
    departMin: toMinutes(outing.departAt),
    deadlineMin: toMinutes(outing.returnBy),
    legsMin: legs,
    staysMin: outing.stops.map((x) => x.stayMin),
    recoveryBuffer: day.coverage === 'RESTRICTED' && outing.id.includes(':P:'),
  });
  return {
    ...outing,
    latestDepartureAt: fromMinutes(sla.latestDepartMin),
    slackMin: sla.slackMin,
    travelTotalMin: sla.travelMin,
    walkTotalMin:
      outing.stops.reduce((sum, x) => sum + (Number(x.walkBurdenMin) || 0) + (x.legIn.mode === 'WALK' ? x.legIn.min : 0), 0) +
      (back.mode === 'walk' ? backMin : 0),
    plannedReturnAt: fromMinutes(toMinutes(last.leaveAt) + backMin),
  };
}

export function applyImmediateReturn(day, { now, cause, stay = null, estimators = {} } = {}) {
  if (!IMMEDIATE_RETURN_CAUSES.includes(cause)) throw new RangeError(`즉시 복귀 원인이 올바르지 않습니다: ${String(cause)}`);
  const clock = kstClock(now);
  if (day?.date !== clock.date) throw new RangeError('즉시 복귀는 오늘 일정에만 적용합니다');
  const nowMin = clock.minutes;
  const cut = (list) =>
    (list ?? [])
      .map((o) => recomputeTruncated({ ...o, stops: o.stops.filter((s) => started(s, nowMin)) }, o, { stay, day, estimators }))
      .filter((o) => o.stops.length > 0);
  const outings = cut(day.outings);
  const guardianOutings = cut(day.guardianOutings);
  const kept = new Set([...outings, ...guardianOutings].flatMap((o) => o.stops.map((s) => s.id)));
  const after = {
    ...day,
    dayState: STATE.NO_TOURISM,
    reasons: uniq([cause, ...(day.reasons ?? [])]),
    outings,
    guardianOutings,
    mealSlots: (day.mealSlots ?? []).map((m) =>
      m.status === 'FILLED' && !kept.has(m.stopId) ? { slot: m.slot, status: 'NOT_APPLICABLE', reasons: [cause] } : m,
    ),
    returnNow: true,
  };
  const required = [...(day.outings ?? []), ...(day.guardianOutings ?? [])]
    .flatMap((o) => o.stops)
    .filter((s) => !started(s, nowMin))
    .map((s) => s.id);
  const delta = computeDayDelta(day, after, { reasons: [cause], requiredStopIds: required });
  const result = delta.hasVisibleChange ? { ...after, delta } : after;
  return structuredClone(result);
}
