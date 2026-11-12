// 최소 변경 재계획 (AX-307 · docs/business-rules.md '전체 일정 확정과 변화 대응'의 재계획 규칙 1~5, '하루 일정 생성'의 하루 한도, '사용자 편집', '숙소와 병원' 개정)
//
// 확정 일정은 바뀐 것이 없으면 그대로 둔다. 외출마다:
//   1. 지금 입력으로 다시 만든 창에서 그 외출의 마감을 찾는다(병원에서 끝나는 외출은 같은 병원 일정의 창).
//   2. 도착 시각이 지난 정거장(오늘)은 건드리지 않는다. 이미 출발한 외출은 출발 시각을 옮기지 않는다
//      (시작된 정거장이 없어 새 시간표가 더 늦게 출발해도 저장된 출발 시각을 둔다).
//   3. 남은 정거장 중 게이트를 여전히 통과하는 것은 제자리에 둔다.
//      통과하지 못한 정거장만 같은 종류(식사 칸 식당 / 일반 정거장)의 다른 후보로 대체한다.
//      사용자가 지운 정거장은 대체하지 않는다(고정한 장소로 바꾼 교체만 그 자리에 넣는다). 비운 식사 칸은 채우지 않는다.
//   4. 외출이 맞지 않으면(복귀 계산·보행 누적·이동 한도) 남은 정거장의 체류를 5분씩(15분까지) 줄이고,
//      그래도 안 되면 일반 정거장부터 뒤에서 빼고, 남은 것이 없으면 외출을 취소한다.
//      단, 이미 출발한 외출은 시작된 정거장이 없어도 취소하지 않는다. 정거장 0개로 남기고 복귀 마감과 여유를
//      다시 계산한다(밖에 있는 사람의 복귀 마감을 지우지 않는다. 여유가 음수면 tripPlan.js 경우 2 가 즉시 복귀를 켠다).
//      지금 창의 마감이 출발보다 일러 당겨졌으면(overdueSafe) 정거장 0개 환자 외출의 마감은 출발 시각이다(findings 13).
//   5. 외출·하루 정거장 한도(식사 정거장 포함)를 넘지 않는다.
// 판정은 planDay 와 같은 함수(rolePool·evaluateOuting·selectBest)로 한다. 바꾼 것마다 사유를 기록한다(전후 비교 사유).

import { REASON } from '../domain/states.js';
import { DEFAULTS } from '../stay/defaults.js';
import { toMinutes } from '../stay/time.js';
import {
  assembleOuting,
  chainedAppointmentIds,
  computeBlocks,
  failReasons,
  guardianBounds,
  kindPool,
  locateGuardian,
  locatePatient,
  manualEvaluation,
  mealSlotOf,
  occupancyEnd,
  outingMeta,
  passesGate,
  recFromStop,
  returnPointOf,
  selectBestAccepted,
  settledAt,
} from './dayContext.js';
import { evaluateOuting } from './outingBuilder.js';

const MIN_STAY = DEFAULTS.minStopStayMin;
const SHRINK_STEP_MIN = 5;

function startedAt(stop, nowMin) {
  return nowMin !== null && toMinutes(stop.arriveAt) <= nowMin;
}

/** evaluateOuting 실패 → 사유 코드 (시간 부족은 SLA_INSUFFICIENT) */
function failureReason(failure) {
  return failure && failure !== 'TIME' ? failure : REASON.SLA_INSUFFICIENT;
}

/**
 * @typedef {object} RepairLog  재계획이 바꾼 것 — 전후 비교에 쓴다
 * @property {Set<string>} reasons       바꾼 원인 사유
 * @property {Array<{from: string, to: string}>} replacements  같은 자리 대체
 * @property {Set<string>} userDriven    사용자 편집(삭제·교체·비움·한도 조정)으로 빠지거나 들어온 정거장 id
 * @property {Set<string>} clearedSlots  식당을 지워 비운 식사 칸
 * @property {Map<string, string[]>} slotReasons  식당이 빠진 식사 칸 → 사유
 */
export function newRepairLog() {
  return { reasons: new Set(), replacements: [], userDriven: new Set(), clearedSlots: new Set(), slotReasons: new Map() };
}

/**
 * 외출 하나를 고친다. 고칠 수 없으면(출발 전이고 남길 정거장도 없음) null: 외출 취소.
 * 이미 출발한 외출은 시작된 정거장도 남길 정거장도 없으면 정거장 0개 외출로 돌려준다(취소하지 않는다).
 * @param {object} p
 * @param {object} p.loc  locatePatient / locateGuardian 결과(없으면 null — 이 외출을 둘 창이 없다)
 * @param {number|null} p.nowMin  오늘이면 지금(분), 아니면 null
 * @param {number} p.nextDepart   같은 역할 다음 외출의 출발(복귀 계산 마감의 상한)
 * @param {number} p.budget       이 외출에 둘 수 있는 정거장 수(하루 남은 한도)
 * @param {Set<string>} p.taken   그날 이미 쓴 장소(대체 후보에서 뺀다) — 대체하면 더한다
 * @param {Set<string>} p.pinnedLeft  아직 넣지 않은 고정 장소(교체로 지운 자리에만 넣는다)
 */
export function repairOuting({ context, role, outing, loc, nowMin, nextDepart, budget, dayRef, taken, pinnedLeft, rankCategories, emptyReasons, log, mealServed, soft = null }) {
  const departMin = toMinutes(outing.departAt);
  const departed = nowMin !== null && departMin <= nowMin;
  const frozen = outing.stops.filter((s) => startedAt(s, nowMin));
  let pending = outing.stops.filter((s) => !startedAt(s, nowMin));
  const original = new Map(outing.stops.map((s) => [String(s.contentId), s]));
  const exact = new Set(frozen.map((s) => String(s.contentId)));
  const slotOf = (s) => (s.isMeal ? mealSlotOf(dayRef, s) : null);
  const { deleted, cleared } = context.edits;
  const noteMeals = (stops, items = []) =>
    stops.forEach((s, i) => {
      const slot = s.isMeal ? items[i]?.meal?.name ?? slotOf(original.get(String(s.contentId)) ?? s) : null;
      if (slot) mealServed.set(slot, s.id);
    });
  const noteLostMeal = (slot, reasons) => {
    if (slot && !log.slotReasons.has(slot)) log.slotReasons.set(slot, [...reasons]);
  };

  if (emptyReasons.length > 0) {
    // 환자 호출·위험 신호·즉시 복귀: 남은 정거장과 출발 전 외출을 비운다
    for (const s of pending) {
      emptyReasons.forEach((r) => log.reasons.add(r));
      noteLostMeal(slotOf(s), emptyReasons);
    }
    pending = [];
    if (frozen.length === 0 && !departed) return null;
  }

  if (!loc) {
    // 이 외출을 둘 창이 더는 없다(역할이 막힘·조건 바뀜). 시작된 정거장만 남기고 복귀 시각은 다시 계산한다
    for (const s of pending) {
      const reasons = failReasons(context, role, s, s.isMeal ? context.meals[slotOf(s)] ?? null : null);
      reasons.forEach((r) => log.reasons.add(r));
      noteLostMeal(slotOf(s), reasons);
    }
    if (frozen.length === 0 && !departed) return null;
    const deadline = {
      deadlineMin: toMinutes(outing.returnBy),
      returnPlace: outing.returnPlace,
      returnPoint: returnPointOf(context, outing),
      deadlineReason: outing.deadlineReason,
    };
    noteMeals(frozen);
    if (!deadline.returnPoint) return { ...outing, stops: frozen };
    return assembleOuting(manualEvaluation(context, role, outing, frozen, deadline.returnPoint), outingMeta(context, role, { id: outing.id, deadline }), { original, exact });
  }

  const ctx = context.ctx[role];
  const isPinned = (x) => x.pinned === true || context.edits.pinned.has(String(x.contentId));
  const holdsPinned =
    pending.some(isPinned) || (pinnedLeft.size > 0 && pending.some((x) => deleted.has(String(x.contentId))));
  // 단계적으로 맞춘다 — 먼저 다른 역할의 외출(보호자)과 다음 외출을 건드리지 않는 범위(soft), 그다음 다음 외출 출발 전,
  // 이미 출발한 외출은 마지막으로 외출 자체의 마감만(시작된 정거장을 지키려고)
  // 병원에서 끝나는 외출(LATE)은 마감이 출발 시각을 정한다 — 다음 외출은 병원 일정 블록 뒤이므로 마감만 쓴다
  const bounded = loc.align === 'LATE' ? loc.deadline.deadlineMin : Math.min(loc.deadline.deadlineMin, nextDepart);
  const variants = [
    ...(soft && !departed ? [{ startMin: Math.max(loc.startMin, soft.startMin ?? -Infinity), returnBy: soft.returnBy ?? Infinity, sla: bounded }] : []),
    { startMin: loc.startMin, returnBy: Infinity, sla: bounded },
    // 이미 출발한 외출(시작된 정거장을 지키려고)과 고정한 장소를 든 외출(고정 장소를 잃지 않으려고)은 마지막으로 외출 자체의
    // 마감까지 쓴다 — 다음 외출은 뒤에서 옮기거나(settledAt) 줄인다
    ...((departed || holdsPinned) && bounded !== loc.deadline.deadlineMin
      ? [{ startMin: loc.startMin, returnBy: Infinity, sla: loc.deadline.deadlineMin }]
      : []),
  ];
  const planOf = (v) => (seq) => ({
    seq,
    startMin: v.startMin,
    slaDeadlineMin: v.sla,
    returnPoint: loc.deadline.returnPoint,
    mustLeaveByMin: null,
    align: loc.align,
  });
  const prefixOk = (ev) =>
    !departed ||
    (ev.departMin === departMin &&
      frozen.every((s, i) => ev.items[i].arriveMin === toMinutes(s.arriveAt) && ev.items[i].leaveMin === toMinutes(s.leaveAt))) ||
    (frozen.length === 0 && ev.departMin > departMin);
  const acceptOf = (v) => (ev) => prefixOk(ev) && ev.returnArriveMin <= v.returnBy;

  // 1) 남은 정거장 분류: 그대로 / 사용자가 지움(교체 자리) / 비운 식사 칸 / 통과하지 못함(대체 자리)
  let seq = frozen.map((s) => ({ rec: recFromStop(s), stayMin: s.stayMin, meal: null }));
  const holes = [];
  for (const s of pending) {
    const id = String(s.contentId);
    const slot = slotOf(s);
    const meal = slot ? context.meals[slot] : null;
    if (deleted.has(id)) {
      log.userDriven.add(s.id);
      if (slot) log.clearedSlots.add(slot);
      holes.push({ index: seq.length, isMeal: Boolean(meal), meal, slot, swap: true, from: s.id });
      continue;
    }
    if (slot && cleared.has(slot)) {
      log.userDriven.add(s.id);
      continue;
    }
    const rec = context.recById.get(id);
    if (rec && passesGate(context, role, s) && (!s.isMeal || meal?.allowed)) {
      seq.push({ rec, stayMin: s.stayMin, meal });
      continue;
    }
    const reasons = failReasons(context, role, s, meal);
    reasons.forEach((r) => log.reasons.add(r));
    holes.push({ index: seq.length, isMeal: Boolean(meal), meal, slot, swap: false, from: s.id, reasons });
  }

  // 2) 빈 자리: 통과하지 못한 자리는 같은 종류 다른 후보로, 교체로 지운 자리는 고정한 장소로만
  let inserted = 0;
  const cap = Math.min(context.paceLimits.perOuting, budget);
  for (const h of holes) {
    if (h.isMeal && (!h.meal?.allowed || cleared.has(h.slot))) continue;
    if (seq.length >= cap) continue;
    let pool = kindPool(context, role, h.isMeal).filter((r) => !taken.has(r.contentId));
    if (h.swap) pool = pool.filter((r) => pinnedLeft.has(r.contentId));
    const rank = { usedCategories: new Set([...rankCategories, ...seq.map((item) => item.rec.category)]) };
    let best = null;
    for (const v of pool.length > 0 ? variants : []) {
      best = selectBestAccepted(ctx, planOf(v)(seq), h.index + inserted, pool, h.meal, rank, acceptOf(v));
      if (best) break;
    }
    if (!best) continue;
    seq = best.seq;
    inserted += 1;
    taken.add(best.rec.contentId);
    pinnedLeft.delete(best.rec.contentId);
    const to = `${context.date}:${role}:${best.rec.contentId}`;
    if (h.swap) {
      log.userDriven.add(to);
      if (h.slot) log.clearedSlots.delete(h.slot);
    } else {
      log.replacements.push({ from: h.from, to });
    }
  }
  for (const h of holes) {
    if (!h.swap && h.isMeal && !seq.some((item) => item.meal?.name === h.slot)) noteLostMeal(h.slot, h.reasons);
  }

  // 3) 한도: 외출·하루 남은 한도를 넘으면 일반 정거장부터 뒤에서 뺀다(강도 변경 등 사용자 입력 몫)
  // 뺄 순서: 일반 정거장 → 식사 정거장 → 고정한 장소(각각 뒤에서부터)
  const removable = (items) => {
    const idx = items.map((item, i) => i).filter((i) => i >= frozen.length).reverse();
    const pinnedRec = (i) => items[i].rec.pinned === true;
    return [
      ...idx.filter((i) => !pinnedRec(i) && !items[i].meal),
      ...idx.filter((i) => !pinnedRec(i) && items[i].meal),
      ...idx.filter((i) => pinnedRec(i)),
    ];
  };
  while (seq.length > Math.max(cap, frozen.length)) {
    const [i] = removable(seq);
    log.userDriven.add(`${context.date}:${role}:${seq[i].rec.contentId}`);
    seq = seq.filter((_, j) => j !== i);
  }

  // 4) 검증 → 체류 축소 → 정거장 빼기 → 취소
  let firstFailure = null;
  const attempt = (items) => {
    for (const v of variants) {
      const r = evaluateOuting(ctx, planOf(v)(items));
      if (r.ok && acceptOf(v)(r)) return r;
      if (!firstFailure && v === variants.at(-1)) firstFailure = r.ok ? 'TIME' : r.failure;
    }
    return null;
  };
  let ev = null;
  let current = seq;
  while (!ev && current.length > 0) {
    const maxCut = Math.max(0, ...current.slice(frozen.length).map((item) => item.stayMin - MIN_STAY));
    for (let cut = 0; !ev; cut += SHRINK_STEP_MIN) {
      const bounded = Math.min(cut, maxCut);
      ev = attempt(current.map((item, i) => (i < frozen.length ? item : { ...item, stayMin: Math.max(MIN_STAY, item.stayMin - bounded) })));
      if (bounded === maxCut) break;
    }
    if (ev) break;
    const [i] = removable(current);
    if (i === undefined) break;
    if (current[i].meal) noteLostMeal(current[i].meal.name, [failureReason(firstFailure)]);
    current = current.filter((_, j) => j !== i);
  }
  if (firstFailure) log.reasons.add(failureReason(firstFailure));

  const meta = outingMeta(context, role, { id: outing.id, deadline: loc.deadline });
  let repaired;
  if (ev) repaired = assembleOuting(ev, meta, { original, exact });
  if (!ev && (frozen.length > 0 || departed)) {
    // 시작된 정거장만(이동 중이었으면 정거장 0개로) 남긴다.
    // 정거장 0개 환자 외출의 마감이 출발보다 이른 창에서 당겨졌으면(overdueSafe 의 pulled) 마감을 출발 시각에 고정한다.
    // 지금으로 두면 이동한 시간만큼 여유가 늘어 약 40분 뒤에는 늦은 환자의 여유가 0 이상이 된다(findings 13).
    // 마감이 출발 뒤에 남아 있는 창(휴무로 비웠지만 바로 돌아가면 맞출 수 있음)은 그 마감 그대로다
    const pin = role === 'P' && departed && frozen.length === 0 && loc.deadline.pulled === true;
    const zeroMeta = pin ? outingMeta(context, role, { id: outing.id, deadline: { ...loc.deadline, deadlineMin: departMin } }) : meta;
    repaired = assembleOuting(manualEvaluation(context, role, outing, frozen, loc.deadline.returnPoint), zeroMeta, { original, exact });
  }
  if (!repaired) return null;
  // 이미 출발한 외출의 출발 시각은 옮기지 않는다. 시작된 정거장이 없으면 새 시간표가 더 늦게 출발할 수 있다
  // (식사 칸 시작에 맞춤 등, prefixOk). 정거장 시각과 여유는 새 시간표 그대로 두고(복귀 도착은 같다) 출발 시각만 저장된 값으로 둔다
  if (departed && repaired.departAt !== outing.departAt) repaired = { ...repaired, departAt: outing.departAt };
  if (repaired.slackMin < 0) log.reasons.add(REASON.SLA_INSUFFICIENT);
  noteMeals(repaired.stops, ev ? ev.items : []);
  return repaired;
}

/**
 * 하루의 외출을 최소 변경으로 고친다 (환자 먼저, 보호자는 고친 환자 일정에 맞춘다).
 * @param {object} p
 * @param {object} p.dayRef   고칠 외출이 나온 하루(저장된 DayPlan) — 식사 칸·병원 블록 대응에 쓴다
 * @param {object[]} p.outings  고칠 환자 외출, p.guardianOutings 보호자 외출
 * @param {number|null} p.nowMin
 * @param {string[]} [p.emptyReasons]  비울 원인(환자 호출·위험 신호·즉시 복귀)
 */
export function repairDay({ context, dayRef, outings, guardianOutings, nowMin, emptyReasons = [], log = newRepairLog() }) {
  const mealServed = new Map();
  const all = [...outings, ...guardianOutings];
  const taken = new Set(all.flatMap((o) => o.stops.map((s) => String(s.contentId))));
  const pinnedLeft = new Set([...context.edits.pinned].filter((id) => !taken.has(id)));
  const frameStart = context.frame?.startMin ?? 0;
  const floor = nowMin === null ? frameStart : Math.max(frameStart, nowMin);
  const byDepart = (list) => list.slice().sort((a, b) => toMinutes(a.departAt) - toMinutes(b.departAt));
  const categories = new Set(all.flatMap((o) => o.stops.map((s) => s.category)));
  const done = (o) => nowMin !== null && occupancyEnd(o) <= nowMin && o.stops.every((s) => startedAt(s, nowMin));
  const departed = (o) => nowMin !== null && toMinutes(o.departAt) <= nowMin;

  const run = (role, list, locate, startLower) => {
    const out = [];
    let budget = context.paceLimits.perDay;
    let lower = startLower;
    const sorted = byDepart(list);
    sorted.forEach((outing, i) => {
      if (done(outing)) {
        // 이미 돌아온 외출은 기록이다 — 다시 검증하지 않는다
        out.push(outing);
        budget -= outing.stops.length;
        outing.stops.forEach((s) => {
          const slot = s.isMeal ? mealSlotOf(dayRef, s) : null;
          if (slot) mealServed.set(slot, s.id);
        });
        lower = Math.max(lower, settledAt(outing));
        return;
      }
      const isDeparted = departed(outing);
      const loc = locate(outing, { lower, departed: isDeparted, nowMin });
      const next = sorted[i + 1];
      const soft = role === 'P' ? guardianBounds(guardianOutings, outing) : null;
      const repaired = repairOuting({
        context,
        role,
        outing,
        loc,
        nowMin,
        nextDepart: next ? toMinutes(next.departAt) : Infinity,
        budget: Math.max(0, budget),
        dayRef,
        taken,
        pinnedLeft,
        rankCategories: categories,
        emptyReasons,
        log,
        mealServed,
        soft,
      });
      if (!repaired) return;
      out.push(repaired);
      budget -= repaired.stops.length;
      lower = Math.max(lower, settledAt(repaired));
    });
    return out;
  };

  // 이미 출발한 보호자 외출이 돌아오기 전에는 환자가 나가지 않는다
  const guardianBack = Math.max(floor, ...guardianOutings.filter(departed).map(occupancyEnd));
  const patient = context.patientAllowed || outings.some(departed)
    ? run('P', outings, (o, opts) => (context.patientAllowed ? locatePatient(context, o, { ...opts, dayRef }) : null), guardianBack)
    : run('P', outings, () => null, floor);
  const blocks = computeBlocks(context, chainedAppointmentIds(context, patient));
  const patientBusy = patient.map((o) => [toMinutes(o.departAt), occupancyEnd(o)]);
  const guardian = run(
    'G',
    guardianOutings,
    (o, opts) => (context.guardianAllowed ? locateGuardian(context, o, { ...opts, patientBusy, blocks }) : null),
    floor,
  );

  return { outings: patient, guardianOutings: guardian, blocks: computeBlocks(context, chainedAppointmentIds(context, patient)), mealServed, log };
}
