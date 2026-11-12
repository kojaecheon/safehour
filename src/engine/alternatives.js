// 교체 후보 (AX-307 · docs/business-rules.md '사용자 편집'의 교체, docs/contracts.md '`POST /api/itinerary/alternatives`')
//
// 정거장 하나를 고르면 같은 자리에 넣을 수 있는 게이트 통과 후보를 최대 5개 돌려준다.
// 각 후보는 그 자리에 넣은 **외출 전체**를 다시 검증한 것이다(복귀 계산, 보행 누적, 이동 한도,
// 식사 칸 시간, 금식 시각) — 판정은 planDay 와 같은 함수(rolePool·evaluateOuting·selectBest)로 한다.
//   - 종류가 같다: 식사 칸 식당 자리에는 식당만(카페 제외), 일반 자리에는 일반 정거장만
//   - 그날 이미 있는 장소(두 역할 모두), 다른 날짜에 배치된 장소(고정한 장소는 예외), 삭제한 장소는 빠진다
//   - 순위는 planDay 와 같다(고정 → 관심사 → 복귀 여유 → 보행 부담 → 같은 날 새 유형 → contentId)
//   - 지난 날짜, 도착 시각이 지난 정거장은 교체할 수 없다(빈 목록)
//   - 오늘 이미 출발한 외출이면 출발 시각과 시작된 정거장의 시각이 그대로인 후보만 낸다
// 결과 정거장은 '고정'(pinned=true)이다: 교체한 장소는 고정으로 표시한다(docs/business-rules.md '사용자 편집').

import { REASON } from '../domain/states.js';
import { DEFAULTS } from '../stay/defaults.js';
import { lodgingForDate } from '../stay/stay.js';
import { toMinutes } from '../stay/time.js';
import {
  assembleOuting,
  buildDayContext,
  candidatesFrom,
  chainedAppointmentIds,
  computeBlocks,
  gateReasons,
  guardianBounds,
  guardianDeadlineAt,
  kindPool,
  mealSlotOf,
  occupancyEnd,
  outingMeta,
  patientDeadlineAt,
  recFromStop,
  selectBestAccepted,
  settledAt,
} from './dayContext.js';
import { foldDemoEvents, shiftAppointmentsOnDate } from './tripEvents.js';
import { kstClock } from './tripPlan.js';

const MAX_ALTERNATIVES = 5;

/**
 * @typedef {object} SwapInput  docs/contracts.md '`POST /api/itinerary/alternatives`' 요청 + 서버가 준비한 외부 데이터
 * @property {object} stay  PlanStay
 * @property {string} date
 * @property {object} day  그 날짜의 DayPlan (기기 저장본)
 * @property {string} outingId  환자(`:P:`) 또는 보호자(`:G:`) 외출 id
 * @property {string} stopId
 * @property {Record<string, object[]> | ((lodgingId: string, date: string) => object[]) | object[]} candidatesByLodging
 * @property {Record<string, {outdoorUnsafe: boolean|null}|null>} [weatherByDate]
 * @property {{airportToLodgingMin?: number, lodgingToAirportMin?: number}} airportTravel
 * @property {string[]} [usedContentIds]  다른 날짜에 배치된 contentId
 * @property {Record<string, {pinned?: string[], deleted?: string[], clearedMeals?: string[]}>} [edits]
 * @property {object[]} [events]  오늘 데모 사건(오늘만 적용)
 * @property {string|number|Date} now
 * @property {{TAXI?: object, TRANSIT?: object}} [estimators]
 */

function prepare(input) {
  const {
    stay,
    date,
    day,
    outingId,
    stopId,
    candidatesByLodging,
    candidates,
    weatherByDate = {},
    airportTravel = {},
    usedContentIds = [],
    edits = {},
    events = [],
    now,
    estimators = {},
  } = input ?? {};
  const clock = kstClock(now);
  if (!stay || !day) throw new TypeError('stay 와 day 가 필요합니다');
  const role = (day.outings ?? []).some((o) => o.id === outingId)
    ? 'P'
    : (day.guardianOutings ?? []).some((o) => o.id === outingId)
      ? 'G'
      : null;
  if (!role) throw new RangeError('외출을 찾을 수 없습니다');
  const outing = (role === 'P' ? day.outings : day.guardianOutings).find((o) => o.id === outingId);
  const index = outing.stops.findIndex((s) => s.id === stopId);
  if (index < 0) throw new RangeError('정거장을 찾을 수 없습니다');
  const stop = outing.stops[index];

  if (date < clock.date) return { blocked: 'PAST_DATE' };
  const isToday = date === clock.date;
  if (isToday && toMinutes(stop.arriveAt) <= clock.minutes) return { blocked: 'STOP_STARTED' };

  const fold = foldDemoEvents(isToday ? events ?? [] : []);
  const shifted = isToday ? shiftAppointmentsOnDate(stay, date, fold.appointmentDeltaMin) : stay;
  const context = buildDayContext({
    stay: shifted,
    date,
    airportTravel,
    candidates: candidatesFrom(candidates ?? candidatesByLodging, lodgingForDate(stay, date)?.id ?? null, date),
    weather: isToday && fold.weatherUnsafe ? { outdoorUnsafe: true } : weatherByDate?.[date] ?? null,
    edits: edits?.[date] ?? {},
    usedContentIds,
    closedContentIds: fold.closedContentIds,
    extraBufferMin: fold.extraBufferMin,
    estimators,
  });

  const departMin = toMinutes(outing.departAt);
  const inProgress = isToday && departMin <= clock.minutes;
  const blocks = computeBlocks(context, chainedAppointmentIds(context, day.outings ?? []));
  const others = [...(day.outings ?? []), ...(day.guardianOutings ?? [])].filter((o) => o.id !== outing.id);
  const deadline =
    role === 'P'
      ? context.patientAllowed
        ? patientDeadlineAt(context, departMin, outing.returnPlace)
        : null
      : context.guardianAllowed
        ? guardianDeadlineAt(
            context,
            departMin,
            (day.outings ?? []).map((o) => [toMinutes(o.departAt), occupancyEnd(o)]),
            blocks,
          )
        : null;
  if (!deadline) return { blocked: 'NO_WINDOW' };

  // 같은 역할의 다음 외출 출발이 복귀 계산식의 마감이다(planDay 의 창 나누기와 같은 뜻).
  // 보호자 외출은 환자 일정에 맞춰 짜인 것이다 — 환자 정거장을 바꾸면 그날을 편집 기록(고정)과 함께 다시 계획해
  // 보호자 외출을 다시 맞춘다(T15a). 보호자 교체 후보는 guardianDeadlineAt 이 환자가 숙소에 있는 구간으로 묶는다
  const sameRoleOutings = role === 'P' ? day.outings ?? [] : day.guardianOutings ?? [];
  const nextDepart = Math.min(
    Infinity,
    ...sameRoleOutings.filter((o) => o.id !== outing.id).map((o) => toMinutes(o.departAt)).filter((m) => m > departMin),
  );
  let startMin = departMin;
  let align = 'EARLY';
  if (deadline.returnPlace === 'HOSPITAL' && !inProgress) {
    // 병원에서 끝나는 외출은 마감에 맞춰 거꾸로 짠다 — 앞 외출 복귀·앞 블록 끝·창 시작(오늘이면 지금) 이후
    align = 'LATE';
    startMin = Math.max(
      context.frame.startMin,
      ...others.filter((o) => toMinutes(o.departAt) < departMin).map(settledAt),
      ...blocks.filter((b) => b.endMin <= departMin).map((b) => b.endMin),
      isToday ? clock.minutes : -Infinity,
    );
  }
  // 비었거나 비운 식사 칸 시간은 다른 정거장으로 채우지 않는다 — 칸 앞 외출은 칸 시작까지 모든 정거장을 떠난다
  let mustLeaveByMin = null;
  const lastLeave = toMinutes(outing.stops.at(-1).leaveAt);
  for (const m of day.mealSlots ?? []) {
    if (m.status !== 'NONE_AVAILABLE' && m.status !== 'CLEARED') continue;
    const slotStart = toMinutes(DEFAULTS.mealSlots[m.slot].start);
    if (lastLeave <= slotStart && departMin < slotStart) mustLeaveByMin = Math.min(mustLeaveByMin ?? Infinity, slotStart);
  }

  const startedStops = inProgress ? outing.stops.filter((s) => toMinutes(s.arriveAt) <= clock.minutes) : [];
  const startedIds = new Set(startedStops.map((s) => s.id));
  const seq = outing.stops
    .filter((_, i) => i !== index)
    .map((s) => {
      const isStarted = startedIds.has(s.id);
      const slot = s.isMeal && !isStarted ? mealSlotOf(day, s) : null;
      return {
        rec: isStarted ? recFromStop(s) : context.recById.get(String(s.contentId)) ?? recFromStop(s),
        stayMin: s.stayMin,
        meal: slot ? context.meals[slot] : null,
      };
    });
  const targetSlot = stop.isMeal ? mealSlotOf(day, stop) : null;
  const meal = targetSlot ? context.meals[targetSlot] : null;
  if (stop.isMeal && !meal?.allowed) return { blocked: 'MEAL_NOT_ALLOWED' };

  const sameRole = (role === 'P' ? day.outings : day.guardianOutings).flatMap((o) => o.stops);
  // 그날 이미 있는 장소는 역할과 상관없이 빠진다 — 보호자는 같은 날 환자가 가는 곳과 다른 곳으로 간다(planDay 와 같다)
  const inDay = new Set([...(day.outings ?? []), ...(day.guardianOutings ?? [])].flatMap((o) => o.stops.map((s) => String(s.contentId))));
  const pool = kindPool(context, role, stop.isMeal).filter((r) => !inDay.has(r.contentId));
  const rank = { usedCategories: new Set(sameRole.filter((s) => s.id !== stop.id).map((s) => s.category)) };
  const planOf = (v) => ({
    seq,
    startMin: v.startMin,
    slaDeadlineMin: align === 'LATE' ? deadline.deadlineMin : Math.min(deadline.deadlineMin, nextDepart),
    returnPoint: deadline.returnPoint,
    mustLeaveByMin,
    align,
  });
  const prefixOk = (ev) =>
    !inProgress ||
    (ev.departMin === departMin &&
      startedStops.every((s, i) => ev.items[i].arriveMin === toMinutes(s.arriveAt) && ev.items[i].leaveMin === toMinutes(s.leaveAt)));
  // 재계획(dayRepair)과 같은 두 단계 — 먼저 보호자 외출을 건드리지 않는 범위, 안 되면 외출 자체의 마감만
  const soft = role === 'P' && !inProgress ? guardianBounds(day.guardianOutings ?? [], outing) : null;
  const variants = [
    ...(soft ? [{ startMin: Math.max(startMin, soft.startMin), returnBy: soft.returnBy }] : []),
    { startMin, returnBy: Infinity },
  ].map((v) => ({ plan: planOf(v), accept: (ev) => prefixOk(ev) && ev.returnArriveMin <= v.returnBy }));
  const original = new Map(outing.stops.filter((s) => s.id !== stop.id).map((s) => [s.contentId, s]));
  const build = (best) => {
    const outingPreview = assembleOuting(best.ev, outingMeta(context, role, { id: outing.id, deadline }), {
      original,
      exact: new Set(startedStops.map((s) => s.contentId)),
      pinnedIds: new Set([best.rec.contentId]),
    });
    return { stop: outingPreview.stops[index], outingPreview };
  };
  return { context, role, stop, index, pool, rank, variants, meal, build, inDay };
}

/**
 * 교체 후보 (docs/business-rules.md '사용자 편집'). 최대 5개, 순위 순. 교체할 수 없으면(지난 날짜·도착한 정거장·창 없음) 빈 배열.
 * @param {SwapInput} input
 * @returns {Array<{stop: object, outingPreview: object}>}
 * @throws {RangeError} 외출·정거장을 찾을 수 없음
 */
export function alternativesFor(input) {
  const s = prepare(input);
  if (s.blocked) return [];
  const limit = Math.min(MAX_ALTERNATIVES, Math.max(0, Number(input.limit ?? MAX_ALTERNATIVES)));
  // 고정한 장소가 먼저, 그다음 보호자 외출을 건드리지 않는 후보, 그다음 외출 자체만 맞는 후보 — 각 단계 안에서는 planDay 순위
  const out = [];
  const chosen = new Set();
  for (const group of [s.pool.filter((r) => r.pinned), s.pool.filter((r) => !r.pinned)]) {
    for (const v of s.variants) {
      let pool = group.filter((r) => !chosen.has(r.contentId));
      while (out.length < limit && pool.length > 0) {
        const best = selectBestAccepted(s.context.ctx[s.role], v.plan, s.index, pool, s.meal, s.rank, v.accept);
        if (!best) break;
        out.push(s.build(best));
        chosen.add(best.rec.contentId);
        pool = pool.filter((r) => r.contentId !== best.rec.contentId);
      }
    }
  }
  return out;
}

/**
 * 고른 후보를 넣은 외출 전체를 다시 검증한다 (docs/business-rules.md '사용자 편집': 통과하지 못하면 넣을 수 없고 이유를 보여준다).
 * @param {SwapInput & {contentId: string}} input
 * @returns {{ok: true, stop: object, outingPreview: object} | {ok: false, reasons: string[], blocked?: string}}
 */
export function previewSwap({ contentId, ...input }) {
  const s = prepare(input);
  if (s.blocked) return { ok: false, reasons: [], blocked: s.blocked };
  const id = String(contentId ?? '');
  const rec = s.pool.find((r) => r.contentId === id);
  if (!rec) {
    const gate = gateReasons(s.context, s.role, id);
    if (gate.length > 0) return { ok: false, reasons: gate };
    const outOfRadius = s.context.pools[s.role]?.outOfRadius.has(id);
    return { ok: false, reasons: [outOfRadius ? REASON.TRAVEL_LIMIT_EXCEEDED : REASON.NO_CANDIDATE] };
  }
  const failures = new Map();
  let best = null;
  for (const v of s.variants) {
    best = selectBestAccepted(s.context.ctx[s.role], v.plan, s.index, [rec], s.meal, s.rank, v.accept, failures);
    if (best) break;
  }
  if (!best) return { ok: false, reasons: [failures.get(id) ?? REASON.SLA_INSUFFICIENT] };
  return { ok: true, ...s.build(best) };
}
