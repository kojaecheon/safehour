// 체류 전체 일정 조립과 재계획 (AX-307 · spec 4.9, 4.10 엔진 쪽, 6장 POST /api/itinerary/plan)
//
// 순수·결정적 함수다. 시계·난수를 읽지 않는다 — 현재 시각(now)은 입력이다.
// 판정은 하루 일정 엔진(planStayDay → planDay) 한 경로로만 한다. 이 모듈은 날짜를 순회하고,
// 체류 중 1회 규칙·재계획 규칙·데모 사건·전후 비교·즉시 복귀·표시만 다시 쓰기를 맡는다.
//
// 날짜별 처리
//   지난 날짜(< 오늘)   previous 가 있으면 그대로 돌려준다(재계획 규칙 2, 규칙 30). 없으면 새로 만든다.
//   오늘               새 일정(게이트 1단계부터, 오늘 사건 적용)을 만들고, 이미 출발한 외출은 previous 에서 이어 받는다.
//                      도착 시각이 지난 정거장은 건드리지 않는다. 출발한 외출의 남은 정거장은 다시 검증해
//                      통과하지 못하면 자동 대체 → 체류 축소 → 제외 순으로 고친다(재계획 규칙 5).
//                      새 일정 중 출발 시각이 지난 외출과, 이어 받은 외출과 겹치는 외출은 쓰지 않는다.
//   미래 날짜           새 일정. previous 가 있으면 전후 비교를 붙인다.
//
// 결정성·멱등(규칙 28·55): 새 일정은 previous 와 무관하게 입력만으로 정해진다. 오늘 사건은 받은 목록 전체를
// 접어 한 번에 적용하므로(tripEvents.js), 같은 사건을 다시 보내도 결과가 같다. 이어 받은 외출은 자기 자신을
// 다시 검증해도 그대로인 고정점이다. 변화가 없으면 전후 비교를 새로 만들지 않고 저장된 것을 둔다.

import { REASON, STATE } from '../domain/states.js';
import { HOSPITAL_PERIOD_STATUS, hospitalPeriodStatus, periodAppliesOnDate, periodCoversDate } from '../stay/coverage.js';
import { DEFAULTS } from '../stay/defaults.js';
import { hasSensitiveConsent, isStayDate, lodgingForDate, stayDates } from '../stay/stay.js';
import { KST_OFFSET_MIN, isDateString, parseInstantMs, toMinutes } from '../stay/time.js';
import { SilentReplanError, computeDayDelta } from './dayDelta.js';
import {
  MEAL_SLOT_NAMES,
  assembleOuting,
  blocksToPlan,
  buildDayContext,
  candidatesFrom,
  chainedAppointmentIds,
  computeBlocks,
  guardianDeadlineAt,
  kindPool,
  manualEvaluation,
  mealSlotOf,
  occupancyEnd,
  outingMeta,
  passesGate,
  patientDeadlineAt,
  recFromStop,
  selectBestAccepted,
} from './dayContext.js';
import { planStayDay } from './dayPlan.js';
import { evaluateOuting } from './outingBuilder.js';
import { foldDemoEvents, shiftAppointmentsOnDate } from './tripEvents.js';

export { SilentReplanError };

/** 일정 규칙 버전 — 게이트 순서·버퍼·순위·재계획 규칙이 바뀌면 올린다 */
export const ITINERARY_ENGINE_VERSION = '2.0.0';

const MIN_STAY = DEFAULTS.minStopStayMin;
const SHRINK_STEP_MIN = 5;
const WARNING_ORDER = Object.freeze(['MEDICATION_TIMES_MISSING', 'DEFAULTS_APPLIED', 'TRAVEL_TIMES_ESTIMATED']);
const LABEL_ORDER = Object.freeze(['ESTIMATED', 'HOURS_UNCONFIRMED', 'NEEDS_TRANSLATION', 'DIET_ESTIMATED', 'ORDER_CARD']);
const IMMEDIATE_RETURN_CAUSES = Object.freeze([REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED]);

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
 * 오늘 returnNow 의 원인 (spec 4.9, 규칙 13·55).
 * - 환자 호출 사건이 오늘 사건 목록에 있다 → PATIENT_RECALLED (사건 초기화로 목록에서 빠지면 풀린다)
 * - 이전에 철회·만료로 켜졌다 → 유효한 지침이 다시 오늘을 덮기 전까지 유지
 * - 외출 중 철회·만료가 지금 감지됐다
 */
function returnNowCauses({ fold, prevDay, stay, date, nowMin }) {
  const causes = [];
  if (fold.patientRecalled) causes.push(REASON.PATIENT_RECALLED);
  if (prevDay?.returnNow === true && !hospitalPlanCoversDate(stay, date)) {
    causes.push(...(prevDay.reasons ?? []).filter((r) => r === REASON.PLAN_REVOKED || r === REASON.PLAN_EXPIRED));
  }
  const lost = planLostDuringOuting(prevDay, stay, date, nowMin);
  if (lost) causes.push(lost);
  return uniq(causes);
}

/**
 * 이미 출발한 외출을 지금 입력으로 다시 검증하고 고친다 (재계획 규칙 2·5).
 * - 도착 시각이 지난 정거장은 저장된 그대로다(시각·표시 모두).
 * - 남은 정거장 중 게이트를 통과하지 못한 것은 같은 자리에 다른 후보로 대체한다.
 * - 외출이 맞지 않으면 남은 정거장의 체류를 5분씩(15분까지) 줄이고, 그래도 안 되면 뒤에서부터 뺀다.
 * - 시작된 정거장이 없고 남은 정거장도 못 두면 외출을 취소한다(null).
 * - 시작된 정거장만으로도 새 마감을 못 지키면 그 정거장들은 그대로 두고 새 마감과 음수 여유를 보여준다(overdue).
 */
function repairStartedOuting({ context, role, outing, deadline, nowMin, prevDay, taken, rankCategories, emptyAll, book }) {
  const departMin = toMinutes(outing.departAt);
  const startedStops = outing.stops.filter((s) => started(s, nowMin));
  const pending = outing.stops.filter((s) => !started(s, nowMin));
  const original = new Map(outing.stops.map((s) => [s.contentId, s]));
  const exact = new Set(startedStops.map((s) => s.contentId));
  const slotOf = (s) => (s.isMeal ? mealSlotOf(prevDay, s) : null);
  const noteServedMeals = (stops, items = []) => {
    stops.forEach((s, i) => {
      if (!s.isMeal) return;
      const slot = items[i]?.meal?.name ?? slotOf(original.get(s.contentId) ?? s);
      if (slot) book.mealServed.set(slot, s.id);
    });
  };

  if (!deadline) {
    // 이 역할의 외출을 오늘 더는 만들 수 없다(조건이 바뀜) — 시작된 정거장만 남긴다. 외출의 시각·마감은 저장값이다
    if (startedStops.length === 0) return null;
    noteServedMeals(startedStops);
    return { ...outing, stops: startedStops };
  }

  const ctx = context.ctx[role];
  const plan = (seq) => ({
    seq,
    startMin: departMin,
    slaDeadlineMin: deadline.deadlineMin,
    returnPoint: deadline.returnPoint,
    mustLeaveByMin: null,
    align: 'EARLY',
  });
  // 이미 출발했으므로 출발 시각과 시작된 정거장의 시각이 그대로여야 한다
  const prefixOk = (ev) =>
    ev.departMin === departMin &&
    startedStops.every((s, i) => ev.items[i].arriveMin === toMinutes(s.arriveAt) && ev.items[i].leaveMin === toMinutes(s.leaveAt));
  const attempt = (items) => {
    const ev = evaluateOuting(ctx, plan(items));
    return ev.ok && prefixOk(ev) ? ev : null;
  };

  let seq = startedStops.map((s) => ({ rec: recFromStop(s), stayMin: s.stayMin, meal: null }));
  const failing = [];
  for (const s of emptyAll ? [] : pending) {
    const slot = slotOf(s);
    const meal = slot ? context.meals[slot] : null;
    const rec = context.recById.get(String(s.contentId));
    const valid = Boolean(rec) && passesGate(context, role, s) && (!s.isMeal || Boolean(meal?.allowed));
    if (valid) seq.push({ rec, stayMin: s.stayMin, meal });
    else failing.push({ index: seq.length, stop: s, meal });
  }

  // 1) 통과하지 못한 자리에 대체 후보 — 같은 종류(식사 칸 식당 / 일반 정거장), 오늘 다른 곳에 없는 것
  let inserted = 0;
  for (const f of failing) {
    if (f.stop.isMeal && !f.meal?.allowed) continue;
    const inSeq = new Set(seq.map((item) => item.rec.contentId));
    const pool = kindPool(context, role, f.stop.isMeal).filter((r) => !taken.has(r.contentId) && !inSeq.has(r.contentId));
    const rank = { usedCategories: new Set([...rankCategories, ...seq.map((item) => item.rec.category)]) };
    const best = selectBestAccepted(ctx, plan(seq), f.index + inserted, pool, f.meal, rank, prefixOk);
    if (!best) continue;
    seq = best.seq;
    taken.add(best.rec.contentId);
    inserted += 1;
  }

  // 2) 그대로 되면 끝. 3) 남은 정거장의 체류를 줄이고, 그래도 안 되면 뒤에서부터 뺀다
  const nStarted = startedStops.length;
  let ev = null;
  let items = seq;
  for (let keep = seq.length - nStarted; keep >= 0 && !ev; keep -= 1) {
    if (nStarted + keep === 0) break;
    const base = seq.slice(0, nStarted + keep);
    const maxCut = Math.max(0, ...base.slice(nStarted).map((item) => item.stayMin - MIN_STAY));
    for (let cut = 0; !ev; cut += SHRINK_STEP_MIN) {
      const bounded = Math.min(cut, maxCut);
      items = base.map((item, i) => (i < nStarted ? item : { ...item, stayMin: Math.max(MIN_STAY, item.stayMin - bounded) }));
      ev = attempt(items);
      if (bounded === maxCut) break;
    }
  }

  const meta = outingMeta(context, role, { id: outing.id, deadline });
  let repaired;
  if (ev) {
    repaired = assembleOuting(ev, meta, { original, exact });
  } else if (nStarted > 0) {
    repaired = assembleOuting(manualEvaluation(context, role, outing, startedStops, deadline.returnPoint), meta, {
      original,
      exact,
    });
  } else {
    return null;
  }
  noteServedMeals(repaired.stops, ev ? ev.items : []);
  return repaired;
}

/**
 * 새 일정의 앞으로의 외출이 이어 받은 외출과 장소·식사 칸이 겹칠 때 — 겹치는 정거장을 빼고, 빈 일반 자리는
 * 다른 후보로 대체한 뒤 외출 전체를 다시 검증한다. 맞지 않으면(또는 남은 정거장이 없으면) 쓰지 않는다(null).
 * 새 일정과 이어 받은 외출만으로 정해지므로 같은 입력이면 같은 결과다.
 */
function rebuildFutureOuting({ context, role, outing, fresh, keptIds, servedSlots, taken, overlapsKept, nextDepart, otherRoleNext, rankCategories }) {
  const departMin = toMinutes(outing.departAt);
  const deadline =
    role === 'P'
      ? patientDeadlineAt(context, departMin, outing.returnPlace)
      : {
          deadlineMin: toMinutes(outing.returnBy),
          returnPlace: 'LODGING',
          returnPoint: context.lodgingPoint,
          deadlineReason: outing.deadlineReason,
        };
  if (!deadline || deadline.returnPlace !== outing.returnPlace) return null;
  const ctx = context.ctx[role];
  const plan = (seq) => ({
    seq,
    startMin: departMin,
    slaDeadlineMin: Math.min(deadline.deadlineMin, nextDepart),
    returnPoint: deadline.returnPoint,
    mustLeaveByMin: null,
    align: deadline.returnPlace === 'HOSPITAL' ? 'LATE' : 'EARLY',
  });
  const endOf = (ev) => (deadline.returnPlace === 'HOSPITAL' ? deadline.deadlineMin : ev.returnArriveMin);
  // 이어 받은 외출과 시간이 겹치지 않고, 다른 역할의 다음 외출(환자가 돌아온 뒤 나가는 보호자) 전에 돌아온다
  const accept = (ev) => !overlapsKept(ev.departMin, endOf(ev)) && ev.returnArriveMin <= otherRoleNext;

  let seq = [];
  const holes = [];
  for (const s of outing.stops) {
    const slot = s.isMeal ? mealSlotOf(fresh, s) : null;
    const meal = slot ? context.meals[slot] : null;
    // 이미 채운 식사 칸의 식당은 다시 넣지 않는다(한 칸에 식당은 하루 한 곳)
    if (slot && servedSlots.has(slot)) continue;
    // 이미 간 장소는 같은 종류의 다른 후보로 대체한다
    if (keptIds.has(String(s.contentId))) {
      holes.push({ index: seq.length, isMeal: Boolean(meal), meal });
      continue;
    }
    const rec = context.recById.get(String(s.contentId));
    if (!rec) return null;
    seq.push({ rec, stayMin: s.stayMin, meal });
  }
  let inserted = 0;
  for (const hole of holes) {
    const inSeq = new Set(seq.map((item) => item.rec.contentId));
    const pool = kindPool(context, role, hole.isMeal).filter((r) => !taken.has(r.contentId) && !inSeq.has(r.contentId));
    const rank = { usedCategories: new Set([...rankCategories, ...seq.map((item) => item.rec.category)]) };
    const best = selectBestAccepted(ctx, plan(seq), hole.index + inserted, pool, hole.meal, rank, accept);
    if (!best) continue;
    seq = best.seq;
    taken.add(best.rec.contentId);
    inserted += 1;
  }
  if (seq.length === 0) return null;
  const ev = evaluateOuting(ctx, plan(seq));
  if (!ev.ok || !accept(ev)) return null;
  const rebuilt = assembleOuting(ev, outingMeta(context, role, { id: outing.id, deadline }), {
    original: new Map(outing.stops.map((s) => [s.contentId, s])),
  });
  const meals = new Map();
  ev.items.forEach((item, i) => {
    if (item.meal) meals.set(item.meal.name, rebuilt.stops[i].id);
  });
  return { outing: rebuilt, meals };
}

/**
 * 오늘 일정 = 이미 출발한 외출(previous 에서 이어 받아 다시 검증) + 새 일정 중 앞으로의 외출.
 * @param {boolean} emptyAll  환자 호출·위험 신호·즉시 복귀 — 남은 정거장과 앞으로의 외출을 모두 비운다
 */
function mergeToday({ context, fresh, prevDay, nowMin, date, emptyAll, emptyReasons }) {
  const isFuture = (o) => toMinutes(o.departAt) > nowMin;
  const freshFutureP = emptyAll ? [] : fresh.outings.filter(isFuture);
  const freshFutureG = emptyAll ? [] : fresh.guardianOutings.filter(isFuture);
  const prevP = (prevDay?.outings ?? []).filter((o) => !isFuture(o));
  const prevG = (prevDay?.guardianOutings ?? []).filter((o) => !isFuture(o));

  if (
    !emptyAll &&
    prevP.length === 0 &&
    prevG.length === 0 &&
    freshFutureP.length === fresh.outings.length &&
    freshFutureG.length === fresh.guardianOutings.length
  ) {
    return fresh; // 출발한 외출이 없고 새 일정이 모두 앞으로의 것이다
  }

  const freshFutureStops = [...freshFutureP, ...freshFutureG].flatMap((o) => o.stops.map((s) => s.contentId));
  const prevStartedStops = [...prevP, ...prevG].flatMap((o) => o.stops.map((s) => s.contentId));
  const taken = new Set([...freshFutureStops, ...prevStartedStops].map(String));
  const book = { mealServed: new Map() };
  const categoriesOf = (list) => new Set(list.flatMap((o) => o.stops.map((s) => s.category)));

  // 이미 돌아온 외출은 기록이다 — 다시 검증하지 않고 그대로 둔다
  const done = (o) => occupancyEnd(o) <= nowMin;
  const keptP = [];
  for (const outing of prevP) {
    if (done(outing)) {
      keptP.push(outing);
      for (const s of outing.stops) {
        const slot = s.isMeal ? mealSlotOf(prevDay, s) : null;
        if (slot) book.mealServed.set(slot, s.id);
      }
      continue;
    }
    const deadline = context.patientAllowed ? patientDeadlineAt(context, toMinutes(outing.departAt), outing.returnPlace) : null;
    const repaired = repairStartedOuting({
      context,
      role: 'P',
      outing,
      deadline,
      nowMin,
      prevDay,
      taken,
      rankCategories: categoriesOf([...prevP, ...freshFutureP]),
      emptyAll,
      book,
    });
    if (repaired) keptP.push(repaired);
  }

  const patientBusy = [...keptP, ...freshFutureP].map((o) => [toMinutes(o.departAt), occupancyEnd(o)]);
  const busyBlocks = computeBlocks(context, chainedAppointmentIds(context, [...keptP, ...freshFutureP]));
  const keptG = [];
  for (const outing of prevG) {
    if (done(outing)) {
      keptG.push(outing);
      continue;
    }
    const deadline = context.guardianAllowed
      ? guardianDeadlineAt(context, toMinutes(outing.departAt), patientBusy, busyBlocks)
      : null;
    const repaired = repairStartedOuting({
      context,
      role: 'G',
      outing,
      deadline,
      nowMin,
      prevDay,
      taken,
      rankCategories: categoriesOf([...prevG, ...freshFutureG]),
      emptyAll,
      book,
    });
    if (repaired) keptG.push(repaired);
  }

  // 새 일정의 앞으로의 외출을 이어 받은 외출에 맞춘다:
  //   - 시간이 겹치면 쓰지 않는다
  //   - 이어 받은 외출에 이미 있는 장소·이미 채운 식사 칸은 빼고, 빈 일반 자리는 다른 후보로 대체해 다시 검증한다
  const kept = [...keptP, ...keptG];
  const keptIds = new Set(kept.flatMap((o) => o.stops.map((s) => String(s.contentId))));
  const occupied = kept.map((o) => [toMinutes(o.departAt), occupancyEnd(o)]);
  const overlapsKept = (start, end) => occupied.some(([a, b]) => start < b && a < end);
  const servedSlots = new Set(book.mealServed.keys());
  const conflict = (s) => keptIds.has(String(s.contentId)) || (s.isMeal && servedSlots.has(mealSlotOf(fresh, s)));
  // 대체 후보에서 뺄 장소: 이어 받은(고친) 외출의 정거장 + 새 일정의 앞으로의 외출 정거장 — 둘 다 같은 입력이면 같다
  const futureTaken = new Set([...keptIds, ...freshFutureStops.map(String)]);
  const futureMeals = new Map(); // 식사 칸 → 앞으로의 외출의 식당 정거장 id
  const fitFuture = (list, role, otherList) => {
    const out = [];
    list.forEach((o, i) => {
      if (overlapsKept(toMinutes(o.departAt), occupancyEnd(o))) return;
      if (!o.stops.some(conflict)) {
        out.push(o);
        for (const s of o.stops) {
          const slot = s.isMeal ? mealSlotOf(fresh, s) : null;
          if (slot) futureMeals.set(slot, s.id);
        }
        return;
      }
      const departMin = toMinutes(o.departAt);
      const rebuilt = rebuildFutureOuting({
        context,
        role,
        outing: o,
        fresh,
        keptIds,
        servedSlots,
        taken: futureTaken,
        overlapsKept,
        nextDepart: list[i + 1] ? toMinutes(list[i + 1].departAt) : Infinity,
        otherRoleNext: Math.min(Infinity, ...otherList.map((x) => toMinutes(x.departAt)).filter((m) => m > departMin)),
        rankCategories: categoriesOf([...kept, ...list]),
      });
      if (!rebuilt) return;
      out.push(rebuilt.outing);
      for (const [slot, stopId] of rebuilt.meals) futureMeals.set(slot, stopId);
    });
    return out;
  };
  const renumber = (list, role) =>
    list
      .slice()
      .sort((a, b) => toMinutes(a.departAt) - toMinutes(b.departAt))
      .map((o, i) => ({ ...o, id: `${date}:${role}:outing-${i + 1}` }));
  const outings = renumber([...keptP, ...fitFuture(freshFutureP, 'P', freshFutureG)], 'P');
  const guardianOutings = renumber([...keptG, ...fitFuture(freshFutureG, 'G', [])], 'G');

  const mergedStopIds = new Set([...outings, ...guardianOutings].flatMap((o) => o.stops.map((s) => s.id)));
  const mealSlots = MEAL_SLOT_NAMES.map((slot) => {
    const f = fresh.mealSlots.find((m) => m.slot === slot) ?? { slot, status: 'NOT_APPLICABLE', reasons: [] };
    const p = prevDay?.mealSlots?.find((m) => m.slot === slot) ?? null;
    if (book.mealServed.has(slot)) return { slot, status: 'FILLED', stopId: book.mealServed.get(slot), reasons: [] };
    if (f.status === 'CLEARED') return f;
    if (!emptyAll && futureMeals.has(slot)) return { slot, status: 'FILLED', stopId: futureMeals.get(slot), reasons: [] };
    // 식사 칸 도착이 이미 불가능한 시각이면 저장된 기록을 둔다(지난 부분은 건드리지 않는다)
    const past = context.meals[slot].latestMin < nowMin;
    if (past && p && (p.status !== 'FILLED' || mergedStopIds.has(p.stopId))) return p;
    if (emptyAll) return { slot, status: 'NOT_APPLICABLE', reasons: [...emptyReasons] };
    if (f.status === 'FILLED') {
      // 새 일정의 식당 외출을 쓰지 못했다(이미 출발한 외출과 겹침) — 앞으로의 칸이면 넣을 식당이 없는 것이다
      return past ? { slot, status: 'NOT_APPLICABLE', reasons: [] } : { slot, status: 'NONE_AVAILABLE', reasons: [REASON.NO_CANDIDATE] };
    }
    return f;
  });

  const anyFresh = fresh.outings.length + fresh.guardianOutings.length > 0;
  const anyMerged = outings.length + guardianOutings.length > 0;
  let dayState = fresh.dayState;
  if (outings.length > 0) dayState = STATE.TOGETHER;
  else if (guardianOutings.length > 0) dayState = STATE.SPLIT_NEARBY;
  else if (anyFresh) dayState = STATE.NO_TOURISM;

  let reasons = [...fresh.reasons];
  if (anyMerged && !anyFresh) {
    reasons = reasons.filter((r) => r !== REASON.NO_CANDIDATE && r !== REASON.DEPARTURE_WINDOW_TOO_SHORT);
  }
  if (!anyMerged && anyFresh && !emptyAll) reasons.push(REASON.DEPARTURE_WINDOW_TOO_SHORT);
  // 시작된 정거장만으로도 새 마감을 못 지키는 외출이 있으면 알린다(여유 음수)
  if ([...outings, ...guardianOutings].some((o) => o.slackMin < 0)) reasons.push(REASON.SLA_INSUFFICIENT);

  const warnings = new Set(fresh.warnings);
  if (anyMerged) warnings.add('TRAVEL_TIMES_ESTIMATED');

  return {
    ...fresh,
    dayState,
    reasons: uniq(reasons),
    blocks: blocksToPlan(computeBlocks(context, chainedAppointmentIds(context, outings))),
    outings,
    guardianOutings,
    mealSlots,
    warnings: WARNING_ORDER.filter((w) => warnings.has(w)),
  };
}

/** previous 정거장 중 지금 게이트를 통과하지 못해 반드시 바뀌어야 하는 것 (규칙 31 확인용) */
function requiredStopIds(prevDay, context, dayEdits, nowMin, emptyAll) {
  const deleted = new Set((dayEdits?.deleted ?? []).map(String));
  const out = [];
  for (const [role, list] of [
    ['P', prevDay.outings ?? []],
    ['G', prevDay.guardianOutings ?? []],
  ]) {
    for (const outing of list) {
      for (const stop of outing.stops) {
        if (nowMin !== null && started(stop, nowMin)) continue;
        if (emptyAll || deleted.has(String(stop.contentId)) || !passesGate(context, role, stop)) out.push(stop.id);
      }
    }
  }
  return out;
}

/** 날짜 하나 */
function planDate({ stay, date, clock, prevDay, dayEdits, usedContentIds, fold, weatherByDate, airportTravel, candidatesByLodging, estimators }) {
  if (prevDay && date < clock.date) return prevDay; // 지난 날짜는 건드리지 않는다

  const isToday = date === clock.date;
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
  let day = fresh;
  let eventReasons = [];
  let emptyAll = false;
  if (isToday) {
    const causes = returnNowCauses({ fold, prevDay, stay, date, nowMin: clock.minutes });
    const emptyReasons = [...(fold.riskSignal ? [REASON.RISK_SIGNAL] : []), ...causes];
    emptyAll = emptyReasons.length > 0;
    const appointmentMoved = fold.appointmentDeltaMin !== 0 && context.apptEvents.length > 0;
    eventReasons = [...emptyReasons, ...(appointmentMoved ? [REASON.APPOINTMENT_DELAYED] : [])];
    day = mergeToday({ context, fresh, prevDay, nowMin: clock.minutes, date, emptyAll, emptyReasons });
    if (emptyAll) day = { ...day, dayState: STATE.NO_TOURISM };
    day = { ...day, reasons: uniq([...eventReasons, ...day.reasons]), returnNow: causes.length > 0 };
  }
  if (!prevDay) return day;

  const delta = computeDayDelta(prevDay, day, {
    reasons: eventReasons,
    requiredStopIds: requiredStopIds(prevDay, context, dayEdits, isToday ? clock.minutes : null, emptyAll),
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
  const requestedSet = new Set(requested);
  // 요청하지 않은 날짜의 배치는 그대로 남는다 — 체류 중 1회 규칙에서 이미 쓴 것으로 본다
  const used = new Set((usedContentIds ?? []).map(String));
  for (const [date, day] of Object.entries(prev)) {
    if (!requestedSet.has(date)) for (const id of dayContentIds(day)) used.add(id);
  }
  // 고정한 장소는 그 날짜에서만 예외다 — 다른 날짜의 자동 배치는 그 장소를 피한다
  const pinnedByDate = Object.entries(edits ?? {}).map(([date, e]) => [date, (e?.pinned ?? []).map(String)]);

  for (const date of requested) {
    const pinnedElsewhere = pinnedByDate.filter(([d]) => d !== date).flatMap(([, ids]) => ids);
    const day = planDate({
      stay,
      date,
      clock,
      prevDay: prev[date]?.date === date ? prev[date] : null,
      dayEdits: edits?.[date] ?? {},
      usedContentIds: [...used, ...pinnedElsewhere],
      fold,
      weatherByDate,
      airportTravel,
      candidatesByLodging,
      estimators,
    });
    days[date] = structuredClone(day);
    for (const id of dayContentIds(day)) used.add(id);
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
  const result = planTrip({ ...input, dates, edits });
  return { ...result, edits };
}

/**
 * 즉시 복귀 변환 (spec 4.9 즉시 복귀, 규칙 13) — 외출 중 지침 철회·만료(또는 환자 호출)를 기기에서 바로 반영한다.
 * 오늘 남은 정거장(도착 시각이 지나지 않은 것)을 비우고 returnNow=true, 원인 사유를 붙인다.
 * 시작된 정거장과 그 외출의 시각은 그대로 둔다. 다음 재계획(planTrip)도 returnNow 를 해제 조건까지 유지한다.
 * @param {object} day  오늘 DayPlan
 * @param {{now: string|number|Date, cause: 'PLAN_REVOKED'|'PLAN_EXPIRED'|'PATIENT_RECALLED'}} opts
 * @returns {object} 새 DayPlan (입력은 바꾸지 않는다). 보이는 변화가 있으면 delta 를 붙인다
 */
export function applyImmediateReturn(day, { now, cause } = {}) {
  if (!IMMEDIATE_RETURN_CAUSES.includes(cause)) throw new RangeError(`즉시 복귀 원인이 올바르지 않습니다: ${String(cause)}`);
  const clock = kstClock(now);
  if (day?.date !== clock.date) throw new RangeError('즉시 복귀는 오늘 일정에만 적용합니다');
  const nowMin = clock.minutes;
  const cut = (list) =>
    (list ?? []).map((o) => ({ ...o, stops: o.stops.filter((s) => started(s, nowMin)) })).filter((o) => o.stops.length > 0);
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
