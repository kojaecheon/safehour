// 날짜별 전후 비교 (AX-307 · docs/business-rules.md '전체 일정 확정과 변화 대응')
//
// 재계획 전(before)과 후(after) DayPlan 을 비교해 사용자가 볼 변화를 기록한다.
//   removed   빠진 곳          before 에만 있는 정거장 (대체로 짝지어진 것은 빼고)
//   added     들어온 곳        after 에만 있는 정거장 (대체로 짝지어진 것은 빼고)
//   replaced  대체된 곳        같은 역할·같은 종류(식사/일반)이고 시간이 겹치거나 같은 외출인 빠진 곳→들어온 곳
//   shortened 줄어든 곳        양쪽에 있고 체류가 줄어든 정거장
//   cancelledOutings           정거장이 모두 빠진(대체도 없는) before 외출. 같은 외출(같은 id·출발 시각)이 after 에
//                              정거장 0개로 남아 있으면(이미 출발한 외출, dayRepair.js) 취소가 아니다: 빠진 곳·새 마감으로 보인다
//   newDeadlines               마감(returnBy·복귀 장소)이 바뀌었거나 새로 생긴 외출, 복귀 여유가 음수가 된 외출,
//                              또는 정거장을 모두 비우고 남은 외출(늦지 않아도)
//   stateChanged / before / after, reasons, hasVisibleChange, seen=false
// 정거장 id 는 `${date}:${role}:${contentId}` 로 결정적이므로 같은 장소는 같은 id 다.
//
// **알림만 하는 재계산 금지** (기존 원칙, docs/business-rules.md '전체 일정 확정과 변화 대응'): 바뀌어야 하는 정거장(requiredStopIds)이 있는데
// 그 정거장이 after 에 그대로 있거나 hasVisibleChange 가 false 이면 SilentReplanError 를 던진다.
// 바뀌어야 하는 정거장이 있으면 userEditOnly 로 변화를 숨기지 않는다: 그 정거장이 빠진 것 자체가 원인 있는 변화다(findings 15).
// 대체 없이 모두 빠지면 빠진 곳·취소된 외출로 하루를 비운 것을 적는다.

import { REASON } from '../domain/states.js';
import { toMinutes } from '../stay/time.js';

export class SilentReplanError extends Error {
  /**
   * @param {string} date
   * @param {string[]} stopIds  바뀌어야 했는데 바뀌지 않은 정거장
   */
  constructor(date, stopIds) {
    super(`변화가 필요한데 전후 비교가 비었습니다 (${date})`);
    this.name = 'SilentReplanError';
    this.code = 'SAFEHOUR_SILENT_REPLAN';
    this.date = date;
    this.stopIds = [...stopIds];
  }
}

function uniq(list) {
  return [...new Set(list)];
}

function entriesOf(day) {
  const out = [];
  for (const [role, list] of [
    ['P', day?.outings ?? []],
    ['G', day?.guardianOutings ?? []],
  ]) {
    for (const outing of list) {
      for (const stop of outing.stops ?? []) out.push({ role, outingId: outing.id, stop });
    }
  }
  return out;
}

function overlaps(a, b) {
  return toMinutes(a.arriveAt) < toMinutes(b.leaveAt) && toMinutes(b.arriveAt) < toMinutes(a.leaveAt);
}

/**
 * @typedef {object} DayDelta  docs/business-rules.md '전체 일정 확정과 변화 대응'
 * @property {boolean} stateChanged
 * @property {string} before  dayState
 * @property {string} after   dayState
 * @property {string[]} removed
 * @property {string[]} added
 * @property {Array<{from: string, to: string}>} replaced
 * @property {string[]} shortened
 * @property {string[]} cancelledOutings
 * @property {Array<{outingId: string, returnBy: string}>} newDeadlines
 * @property {string[]} reasons
 * @property {boolean} hasVisibleChange
 * @property {boolean} seen
 */

/**
 * 전후 비교를 만든다. 입력은 바꾸지 않는다.
 *
 * @param {object} before  재계획 전 DayPlan
 * @param {object} after   재계획 후 DayPlan
 * @param {object} [opts]
 * @param {string[]} [opts.reasons]          변화를 일으킨 사유(사건 등) — 맨 앞에 둔다
 * @param {string[]} [opts.requiredStopIds]  게이트를 더는 통과하지 못해 반드시 바뀌어야 하는 before 정거장
 * @param {Iterable<string>} [opts.userDrivenIds]  사용자 편집으로 빠지거나 들어온 정거장 — 변화로 세지 않는다
 * @param {Array<{from: string, to: string}>} [opts.replacements]  재계획이 같은 자리에 넣은 대체 짝
 * @param {boolean} [opts.userEditOnly]  이번 변화의 원인이 사용자 편집뿐이다. 보이는 변화로 알리지 않는다.
 *   requiredStopIds 가 있으면 쓰지 않는다(바뀌어야 하는 정거장이 곧 원인이다)
 * @returns {DayDelta}
 * @throws {SilentReplanError} 바뀌어야 하는 정거장이 남아 있거나, 변화가 필요한데 보이는 변화가 없을 때
 */
export function computeDayDelta(before, after, { reasons = [], requiredStopIds = [], userDrivenIds = [], replacements = [], userEditOnly = false } = {}) {
  const beforeEntries = entriesOf(before);
  const afterEntries = entriesOf(after);
  const beforeById = new Map(beforeEntries.map((e) => [e.stop.id, e]));
  const afterById = new Map(afterEntries.map((e) => [e.stop.id, e]));
  // 사용자가 직접 한 편집(삭제·교체·비움)으로 빠지거나 들어온 정거장은 '변경됨'으로 알리지 않는다
  const userDriven = new Set(userDrivenIds);

  const goneEntries = beforeEntries.filter((e) => !afterById.has(e.stop.id));
  const removedEntries = goneEntries.filter((e) => !userDriven.has(e.stop.id));
  const addedEntries = afterEntries.filter((e) => !beforeById.has(e.stop.id) && !userDriven.has(e.stop.id));

  // 대체: 재계획이 같은 자리에 넣은 짝을 먼저 쓰고, 나머지는 같은 역할·같은 종류(식사 칸/일반)이면서
  // 시간이 겹치거나 같은 외출인 것끼리 앞에서부터 짝짓는다
  const paired = new Set();
  const replaced = [];
  const replacedFrom = new Set();
  for (const { from, to } of replacements) {
    if (!removedEntries.some((e) => e.stop.id === from) || !addedEntries.some((e) => e.stop.id === to)) continue;
    if (replacedFrom.has(from) || paired.has(to)) continue;
    paired.add(to);
    replacedFrom.add(from);
    replaced.push({ from, to });
  }
  for (const r of removedEntries) {
    if (replacedFrom.has(r.stop.id)) continue;
    const match = addedEntries.find(
      (a) =>
        !paired.has(a.stop.id) &&
        a.role === r.role &&
        Boolean(a.stop.isMeal) === Boolean(r.stop.isMeal) &&
        (overlaps(a.stop, r.stop) || a.outingId === r.outingId),
    );
    if (!match) continue;
    paired.add(match.stop.id);
    replacedFrom.add(r.stop.id);
    replaced.push({ from: r.stop.id, to: match.stop.id });
  }
  const removed = removedEntries.filter((e) => !replacedFrom.has(e.stop.id)).map((e) => e.stop.id);
  const added = addedEntries.filter((e) => !paired.has(e.stop.id)).map((e) => e.stop.id);
  const removedSet = new Set(removed);

  const shortened = afterEntries
    .filter((e) => beforeById.has(e.stop.id) && e.stop.stayMin < beforeById.get(e.stop.id).stop.stayMin)
    .map((e) => e.stop.id);

  const beforeOutings = [
    ...(before?.outings ?? []).map((o) => ({ role: 'P', outing: o })),
    ...(before?.guardianOutings ?? []).map((o) => ({ role: 'G', outing: o })),
  ];
  const afterOutings = [
    ...(after?.outings ?? []).map((o) => ({ role: 'P', outing: o })),
    ...(after?.guardianOutings ?? []).map((o) => ({ role: 'G', outing: o })),
  ];

  const goneSet = new Set(goneEntries.map((e) => e.stop.id));
  const stillOut = (role, outing) =>
    afterOutings.some((a) => a.role === role && a.outing.id === outing.id && a.outing.departAt === outing.departAt);
  const cancelledOutings = beforeOutings
    .filter(
      ({ role, outing }) =>
        outing.stops.length > 0 &&
        outing.stops.every((s) => goneSet.has(s.id)) &&
        outing.stops.some((s) => removedSet.has(s.id)) &&
        !stillOut(role, outing),
    )
    .map(({ outing }) => outing.id);

  // 새 마감: after 외출마다 짝이 되는 before 외출(같은 정거장·대체 짝, 없으면 같은 id)과 비교한다
  const replacedTo = new Map(replaced.map((r) => [r.to, r.from]));
  const newDeadlines = [];
  for (const { role, outing } of afterOutings) {
    const ids = new Set(outing.stops.map((s) => (beforeById.has(s.id) ? s.id : replacedTo.get(s.id))).filter(Boolean));
    const match =
      beforeOutings.find((b) => b.role === role && b.outing.stops.some((s) => ids.has(s.id)))?.outing ??
      beforeOutings.find((b) => b.role === role && b.outing.id === outing.id)?.outing ??
      null;
    const changed = !match || match.returnBy !== outing.returnBy || match.returnPlace !== outing.returnPlace;
    // 정거장을 모두 비우고 남은 외출(이미 출발한 외출, dayRepair.js)은 늦지 않아도 마감을 늘 싣는다(설계서 4.3)
    const emptied = Boolean(match) && outing.stops.length === 0 && match.stops.length > 0;
    // 새로 마감을 넘기게 된 외출(여유가 음수로 바뀜)도 새 마감으로 알린다 — 이미 음수였으면 새 변화가 아니다
    const newlyOverdue = outing.slackMin < 0 && !(match && match.slackMin < 0);
    if (changed || newlyOverdue || emptied) newDeadlines.push({ outingId: outing.id, returnBy: outing.returnBy });
  }

  // 사유: 넘겨받은 사유 → 빠진·대체된 정거장의 제외 사유 → 줄어든 곳의 시간 부족 → after 에 새로 생긴 사유
  const excludedReasons = new Map((after?.excluded ?? []).map((e) => [String(e.candidateId), e.reasons ?? []]));
  const goneReasons = [...removedEntries]
    .flatMap((e) => excludedReasons.get(String(e.stop.candidateId)) ?? excludedReasons.get(String(e.stop.contentId)) ?? []);
  const beforeReasons = new Set(before?.reasons ?? []);
  const afterReasons = new Set(after?.reasons ?? []);
  let deltaReasons = uniq([
    ...reasons,
    ...goneReasons,
    ...(shortened.length > 0 ? [REASON.SLA_INSUFFICIENT] : []),
    // 날짜 사유의 변화(새로 생긴 사유, 풀린 사유)도 원인이다
    ...[...afterReasons].filter((r) => !beforeReasons.has(r)),
    ...[...beforeReasons].filter((r) => !afterReasons.has(r)),
  ]);

  const stateChanged = before?.dayState !== after?.dayState;
  const returnNowChanged = Boolean(before?.returnNow) !== Boolean(after?.returnNow);
  // 사용자 편집만이 원인이면(사건·게이트 실패·시간 부족 없음) 그 결과(시각·마감 변화 포함)는 '변경됨'이 아니다.
  // 원인 사유가 없는 마감 이동만(정거장·상태 변화 없음)도 알리지 않는다 — 앞선 편집을 맞춘 것이지 새 변화가 아니다
  const stopOrStateChange =
    stateChanged ||
    returnNowChanged ||
    removed.length > 0 ||
    added.length > 0 ||
    replaced.length > 0 ||
    shortened.length > 0 ||
    cancelledOutings.length > 0;
  // 반드시 바뀌어야 하는 정거장(게이트 실패)이 있으면 원인이 사용자 편집만은 아니다(findings 15). 다시 만들기는 닫힌 장소를
  // 고치지 않고 새로 짜서 수리 기록에 사유가 없고, 한도로 자른 기록만 남아 userEditOnly 로 넘어올 수 있다
  const editOnly = userEditOnly && requiredStopIds.length === 0;
  const hasVisibleChange = !editOnly && (stopOrStateChange || (newDeadlines.length > 0 && deltaReasons.length > 0));

  // 보이는 변화에 원인을 찾지 못하면 그날 사유를 쓴다(사유를 지어내지 않는다)
  if (hasVisibleChange && deltaReasons.length === 0) deltaReasons = [...afterReasons];

  const date = after?.date ?? before?.date ?? '';
  const survivors = requiredStopIds.filter((id) => afterById.has(id));
  if (survivors.length > 0) throw new SilentReplanError(date, survivors);
  if (requiredStopIds.length > 0 && !hasVisibleChange) throw new SilentReplanError(date, requiredStopIds);

  return {
    stateChanged,
    before: before?.dayState ?? null,
    after: after?.dayState ?? null,
    removed,
    added,
    replaced,
    shortened,
    cancelledOutings,
    newDeadlines,
    reasons: deltaReasons,
    hasVisibleChange,
    seen: false,
  };
}
