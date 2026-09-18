// 외출 하나를 짜고 검증한다 (AX-306 · spec 4.7)
//
// 외출 = 출발지(그날 숙소) → 정거장 1곳 이상 → 복귀 장소.
// 검증은 외출 단위다.
//   - 복귀 계산식: checkOutingSla (slaCalculator.js 한곳)
//   - 보행 누적: Σ정거장 보행 부담 + Σ도보 구간 ≤ walkLimit (walkLimit 이 있는 날만)
//   - 이동 한도: 출발·정거장 사이·복귀 모든 구간 ≤ travelLimit (travelLimit 이 있는 날만)
//   - 식사 제한 UNTIL: 그 시각 전에는 식음 정거장에 도착하지 않는다
//   - 식사 정거장: 식사 칸 시간에 도착한다
// 체류를 줄여 맞출 수 있지만 정거장당 15분 미만으로는 줄이지 않는다(5분 단위, 기존 shrinkToFit 과 같다).
//
// 순위 (spec 4.7): 게이트를 통과한 후보만 대상이다.
//   고정(사용자가 고른 장소) → 관심사 일치 → 복귀 여유 큰 순 → 보행 부담 작은 순 → 같은 날 새 유형 → contentId
// 인기·광고·제휴·제목은 쓰지 않는다. 같은 입력이면 같은 결과다.

import { REASON } from '../domain/states.js';
import { DEFAULTS } from '../stay/defaults.js';
import { BUFFER, checkOutingSla } from './slaCalculator.js';

const MIN_STAY = DEFAULTS.minStopStayMin;
const SHRINK_STEP_MIN = 5;
/** 줄이면 풀릴 수 있는 시간 부족 (보고할 때는 SLA_INSUFFICIENT) */
const TIME = 'TIME';

/** 원하는 체류부터 5분씩 줄여 15분까지 */
function stayOptions(desired) {
  if (desired <= MIN_STAY) return [desired];
  const options = [];
  for (let s = desired; s >= MIN_STAY; s -= SHRINK_STEP_MIN) options.push(s);
  return options;
}

/**
 * 외출을 시간표로 펼치고 검증한다.
 *
 * @param {object} ctx
 * @param {{lat:number,lng:number}} ctx.lodgingPoint  출발지
 * @param {(from, to) => {min: number, mode: string}} ctx.estimate
 * @param {boolean} ctx.recovery          회복기 가산
 * @param {number}  ctx.extraBufferMin    추가 버퍼
 * @param {number|null} ctx.walkLimitMin
 * @param {number|null} ctx.travelLimitMin
 * @param {number|null} ctx.fastingUntilMin  이 시각 전에는 식음 정거장 도착 불가
 * @param {object} plan
 * @param {Array<{rec: object, stayMin: number, meal: object|null}>} plan.seq
 * @param {number} plan.startMin        이 시각보다 일찍 출발하지 않는다
 * @param {number} plan.slaDeadlineMin  복귀 계산식의 마감
 * @param {{lat:number,lng:number}} plan.returnPoint
 * @param {number|null} [plan.mustLeaveByMin]  모든 정거장을 이 시각까지 떠난다(비운 식사 칸 보호)
 * @param {'EARLY'|'LATE'} [plan.align]  EARLY: 창 시작에 출발(식사 칸이 있으면 칸 시작에 맞춤).
 *   LATE: 복귀 계산식을 딱 만족하는 가장 늦은 출발 — 병원에서 끝나는 외출을 마감에 맞춰 거꾸로 짤 때 쓴다
 */
export function evaluateOuting(ctx, plan) {
  const { seq, startMin, slaDeadlineMin, returnPoint, mustLeaveByMin = null, align = 'EARLY' } = plan;
  const fail = (failure) => ({ ok: false, failure });

  const legs = [];
  let prev = ctx.lodgingPoint;
  for (const item of seq) {
    legs.push(ctx.estimate(prev, item.rec.point));
    prev = item.rec.point;
  }
  const back = ctx.estimate(prev, returnPoint);
  if (ctx.travelLimitMin !== null && [...legs, back].some((leg) => leg.min > ctx.travelLimitMin)) {
    return fail(REASON.TRAVEL_LIMIT_EXCEEDED);
  }

  const slaInput = {
    deadlineMin: slaDeadlineMin,
    legsMin: [...legs.map((l) => l.min), back.min],
    staysMin: seq.map((item) => item.stayMin),
    recoveryBuffer: ctx.recovery,
    extraBufferMin: ctx.extraBufferMin,
  };

  // 출발 시각 기준 도착·출발 오프셋 (호출·대기 뒤 이동)
  const arriveOffset = [];
  let offset = BUFFER.hailingMin;
  for (let i = 0; i < seq.length; i += 1) {
    arriveOffset.push(offset + legs[i].min);
    offset = arriveOffset[i] + seq[i].stayMin;
  }
  const lastLeaveOffset = offset;
  const mealIndex = seq.findIndex((item) => item.meal);

  let departMin;
  if (align === 'LATE') {
    // 마감에 맞춰 거꾸로 짠다: 복귀 계산식을 딱 만족하는 가장 늦은 출발.
    // 식사 칸·칸 보호 때문에 더 늦출 수 없으면 그만큼 앞당긴다. 창 시작보다 이르면 맞지 않는다
    departMin = checkOutingSla({ ...slaInput, departMin: 0 }).latestDepartMin;
    if (mealIndex >= 0) departMin = Math.min(departMin, seq[mealIndex].meal.latestMin - arriveOffset[mealIndex]);
    if (mustLeaveByMin !== null) departMin = Math.min(departMin, mustLeaveByMin - lastLeaveOffset);
    if (departMin < startMin) return fail(TIME);
  } else {
    // 창 시작에 출발한다. 식사 정거장이 있으면 식사 칸 시작에 도착하도록 늦춘다
    departMin = startMin;
    if (mealIndex >= 0) departMin = Math.max(startMin, seq[mealIndex].meal.startMin - arriveOffset[mealIndex]);
  }

  const items = [];
  let walkTotal = 0;
  for (let i = 0; i < seq.length; i += 1) {
    const { rec, stayMin, meal } = seq[i];
    const arriveMin = departMin + arriveOffset[i];
    if (meal && (arriveMin < meal.startMin || arriveMin > meal.latestMin)) return fail(TIME);
    if (rec.hasFood && ctx.fastingUntilMin !== null && arriveMin < ctx.fastingUntilMin) {
      return fail(REASON.FASTING_REQUIRED);
    }
    const leaveMin = arriveMin + stayMin;
    if (mustLeaveByMin !== null && leaveMin > mustLeaveByMin) return fail(TIME);
    walkTotal += rec.walkMin + (legs[i].mode === 'walk' ? legs[i].min : 0);
    items.push({ rec, stayMin, meal, arriveMin, leaveMin, leg: legs[i] });
  }
  walkTotal += back.mode === 'walk' ? back.min : 0;
  if (ctx.walkLimitMin !== null && walkTotal > ctx.walkLimitMin) return fail(REASON.WALK_LIMIT_EXCEEDED);

  const sla = checkOutingSla({ ...slaInput, departMin });
  if (!sla.ok) return fail(TIME);

  return {
    ok: true,
    departMin,
    items,
    back,
    walkTotal,
    sla,
    // 순위용 복귀 여유: 거꾸로 짠 외출은 여유가 출발 앞쪽(창 시작까지)에 남는다
    rankSlackMin: align === 'LATE' ? departMin - startMin + sla.slackMin : sla.slackMin,
    travelTotalMin: sla.travelMin,
    returnArriveMin: departMin + lastLeaveOffset + back.min,
  };
}

/** 한 후보를 index 자리에 넣어 본다. 시간이 모자라면 그 정거장의 체류를 줄인다 */
function tryInsert(ctx, plan, index, rec, meal) {
  let failure = null;
  for (const stayMin of stayOptions(rec.stayMin)) {
    const seq = plan.seq.slice();
    seq.splice(index, 0, { rec, stayMin, meal });
    const ev = evaluateOuting(ctx, { ...plan, seq });
    if (ev.ok) return { ok: true, ev, seq };
    failure = ev.failure;
    if (failure !== TIME) break;
  }
  return { ok: false, failure: failure === TIME ? REASON.SLA_INSUFFICIENT : failure };
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (typeof a[i] === 'string') return a[i] < b[i] ? -1 : 1;
    return a[i] - b[i];
  }
  return 0;
}

/**
 * 넣을 수 있는 후보 중 순위가 가장 높은 것.
 * @param {object} rank  { usedCategories: Set<string> }
 * @param {Map<string,string>} failures  넣지 못한 후보의 마지막 사유(고정 장소 보고용)
 */
function selectBest(ctx, plan, index, recs, meal, rank, failures) {
  let best = null;
  for (const rec of recs) {
    const tried = tryInsert(ctx, plan, index, rec, meal);
    if (!tried.ok) {
      failures.set(rec.contentId, tried.failure);
      continue;
    }
    const key = [
      rec.pinned ? 0 : 1,
      rec.interest ? 0 : 1,
      -tried.ev.rankSlackMin,
      rec.walkMin,
      rank.usedCategories.has(rec.category) ? 1 : 0,
      rec.contentId,
    ];
    if (!best || compareKeys(key, best.key) < 0) best = { key, rec, ev: tried.ev, seq: tried.seq };
  }
  return best;
}

function categoriesOf(rank, seq) {
  return new Set([...rank.usedCategories, ...seq.map((item) => item.rec.category)]);
}

function available(pool, usedToday, seq) {
  const inSeq = new Set(seq.map((item) => item.rec.contentId));
  return pool.filter((rec) => !usedToday.has(rec.contentId) && !inSeq.has(rec.contentId));
}

/**
 * 식사 칸이 없는 외출 — 창 시작에 출발해 정거장을 앞에서부터 채운다.
 * @returns {object|null} evaluateOuting 결과(정거장 1곳 이상) 또는 null
 */
export function buildForwardOuting(ctx, { startMin, slaDeadlineMin, returnPoint, mustLeaveByMin = null, align = 'EARLY', allowance, pool, usedToday, rank, failures }) {
  let plan = { seq: [], startMin, slaDeadlineMin, returnPoint, mustLeaveByMin, align };
  let ev = null;
  while (plan.seq.length < allowance) {
    const best = selectBest(
      ctx,
      plan,
      plan.seq.length,
      available(pool, usedToday, plan.seq),
      null,
      { usedCategories: categoriesOf(rank, plan.seq) },
      failures,
    );
    if (!best) break;
    plan = { ...plan, seq: best.seq };
    ev = best.ev;
  }
  return ev;
}

/**
 * 식사 칸 외출 — 식당 1곳을 식사 칸 시간에 두고, 남은 자리를 식사 앞·뒤에 번갈아 채운다.
 * @param {{name: string, startMin: number, latestMin: number}} meal  식사 칸(도착 허용 범위)
 * @param {number} allowance  식사 외 정거장 수 한도
 * @returns {{ev: object|null, mealFailures: Map<string,string>}}
 */
export function buildMealOuting(ctx, { startMin, slaDeadlineMin, returnPoint, align = 'EARLY', meal, allowance, mealPool, pool, usedToday, rank, failures }) {
  const mealFailures = new Map();
  let plan = { seq: [], startMin, slaDeadlineMin, returnPoint, mustLeaveByMin: null, align };
  const chosen = selectBest(
    ctx,
    plan,
    0,
    available(mealPool, usedToday, []),
    meal,
    { usedCategories: new Set(rank.usedCategories) },
    mealFailures,
  );
  for (const [id, reason] of mealFailures) failures.set(id, reason);
  if (!chosen) return { ev: null, mealFailures };

  plan = { ...plan, seq: chosen.seq };
  let ev = chosen.ev;
  for (let added = 0; added < allowance; added += 1) {
    const mealIndex = plan.seq.findIndex((item) => item.meal);
    // 앞·뒤를 번갈아 먼저 시도한다 (앞 → 뒤 → 앞 …)
    const positions = added % 2 === 0 ? [mealIndex, plan.seq.length] : [plan.seq.length, mealIndex];
    let best = null;
    for (const index of positions) {
      best = selectBest(
        ctx,
        plan,
        index,
        available(pool, usedToday, plan.seq),
        null,
        { usedCategories: categoriesOf(rank, plan.seq) },
        failures,
      );
      if (best) break;
    }
    if (!best) break;
    plan = { ...plan, seq: best.seq };
    ev = best.ev;
  }
  return { ev, mealFailures };
}
