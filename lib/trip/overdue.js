// 복귀 마감이 지난 외출의 시트 신호 (마감 지남 설계서 4.2 경우 1)
//
// 표시 신호만 고르는 순수 함수다. 저장 일정을 바꾸지 않고, returnNow 를 켜지 않고, 장소를 다시 판정하지 않는다.
// 즉시 복귀 판정(엔진 returnNowCauses)과 별개다. 그날이 이미 returnNow 이면 기존 즉시 복귀 시트가 우선이라 고르지 않는다.
// 시각은 KST 절대 시각(kstInstantMs)으로 비교한다. 오프셋 없는 문자열을 직접 읽지 않는다.

import { kstClock } from '../../src/engine/tripPlan.js';
import { kstInstantMs } from '../../src/stay/time.js';

const MIN_MS = 60 * 1000;

function deadlineMs(date, returnBy) {
  if (typeof returnBy !== 'string') return null;
  try {
    const ms = kstInstantMs(date, returnBy);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/** 오늘(KST) 저장 일정이고 즉시 복귀 중이 아닐 때의 환자 외출 `{ id, returnBy, start }` 목록. 아니면 null */
function watchedOutings(day, nowMs, graceMin) {
  if (!day || typeof day !== 'object' || typeof day.date !== 'string') return null;
  if (!Number.isFinite(nowMs) || !Number.isFinite(graceMin) || graceMin <= 0) return null;
  if (day.returnNow === true) return null;
  if (kstClock(nowMs).date !== day.date) return null;
  const out = [];
  for (const o of Array.isArray(day.outings) ? day.outings : []) {
    if (!o || typeof o.id !== 'string' || o.id === '') continue;
    const start = deadlineMs(day.date, o.returnBy);
    if (start !== null) out.push({ id: o.id, returnBy: o.returnBy, start });
  }
  return out;
}

/**
 * 지금 마감 지남 시트를 띄울 외출 `{ date, outingId, returnBy }` 또는 null.
 * `returnBy <= 지금 < returnBy + graceMin분` 이고 닫지 않은 환자 외출 중 마감이 가장 늦은 것이다.
 * 마감이 같으면 나중에 출발한 외출이다(외출 목록은 출발 순서다).
 * @param {{ day: object|null, nowMs: number, dismissed?: Iterable<string>, graceMin: number }} args
 */
export function selectOverdueReturn({ day, nowMs, dismissed = [], graceMin }) {
  const outings = watchedOutings(day, nowMs, graceMin);
  if (!outings) return null;
  const closed = dismissed instanceof Set ? dismissed : new Set(dismissed ?? []);
  let best = null;
  for (const o of outings) {
    if (closed.has(o.id)) continue;
    if (nowMs < o.start || nowMs >= o.start + graceMin * MIN_MS) continue;
    // 마감이 같으면 나중에 출발한 외출(목록 뒤쪽)
    if (!best || o.start >= best.start) best = o;
  }
  return best ? { date: day.date, outingId: best.id, returnBy: best.returnBy } : null;
}

/**
 * 시트를 닫을 때 함께 닫을 외출 id: 지금 창 안에 있고 마감이 `returnBy` 와 같거나 이른 환자 외출 전부.
 * 같은 마감(예: 두 외출 모두 활동 종료 21:00)의 시트를 연달아 두 번 띄우지 않기 위해서다.
 * 닫은 시트보다 마감이 늦은 외출은 넣지 않는다(그 외출은 제 마감에 따로 한 번 뜬다).
 * @param {{ day: object|null, nowMs: number, graceMin: number, returnBy: string }} args
 * @returns {string[]}
 */
export function overdueIdsThrough({ day, nowMs, graceMin, returnBy }) {
  const outings = watchedOutings(day, nowMs, graceMin);
  const limit = outings ? deadlineMs(day.date, returnBy) : null;
  if (limit === null) return [];
  return outings.filter((o) => o.start <= limit && nowMs >= o.start && nowMs < o.start + graceMin * MIN_MS).map((o) => o.id);
}

/**
 * 지금 이후 가장 가까운 경계(어느 외출의 마감 또는 창 안 외출의 만료) ms. 남은 경계가 없으면 null.
 * 실행기가 이 시각에 신호를 다시 계산한다.
 * @param {{ day: object|null, nowMs: number, graceMin: number }} args
 */
export function nextOverdueWakeMs({ day, nowMs, graceMin }) {
  const outings = watchedOutings(day, nowMs, graceMin);
  if (!outings) return null;
  let next = null;
  for (const o of outings) {
    for (const edge of [o.start, o.start + graceMin * MIN_MS]) {
      if (edge > nowMs && (next === null || edge < next)) next = edge;
    }
  }
  return next;
}
