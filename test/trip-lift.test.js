// AX-307 재검토 2 — 원인이 풀리면 오늘 남은 시간을 다시 짠다 (spec 4.9 returnNow 해제·사건 초기화, 변화 원천 6, 규칙 31)
//
// - 데모 사건 초기화(환자 호출·위험 신호·교통·휴무…)나 유효한 지침이 다시 오늘을 덮으면, 그 원인으로 비우거나 줄인
//   오늘의 남은 시간을 지금(now) 이후로 다시 짠다. 이미 출발한 외출·도착한 정거장은 그대로다.
// - 이것은 사용자 편집이 아니다 — 풀린 원인을 사유로 한 전후 비교가 생긴다.
// - 오늘 사건은 다른 날짜를 바꾸지 않는다. 다른 날짜에 이미 둔 장소를 오늘 대체 후보로 쓰지 않는다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON, STATE } from '../src/domain/states.js';
import { computeDayDelta } from '../src/engine/dayDelta.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { hospitalPeriod } from './stay-fixtures.js';
import { AIRPORT_TRAVEL, at, byLodging, contentIdsOf, mins, plus, stay, stopsOf, tripPool, tripStay, withoutDelta } from './trip-fixtures.js';

const TODAY = '2026-10-06';
const PROC = { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' };
const withVisit = (start, overrides = {}) =>
  tripStay({}, { appointments: [PROC, { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start, source: 'USER' }], ...overrides });

function plan(s, opts = {}) {
  return planTrip({
    stay: s,
    candidatesByLodging: byLodging(opts.pool ?? tripPool('en', 90)),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: at(TODAY, '07:00'),
    ...opts,
  });
}

function replanToday(s, previousDays, opts = {}) {
  const used = Object.entries(previousDays)
    .filter(([date]) => date !== TODAY)
    .flatMap(([, d]) => contentIdsOf(d));
  return plan(s, { dates: [TODAY], previous: previousDays, usedContentIds: used, ...opts }).days[TODAY];
}

/** 원인이 풀린 뒤의 오늘 — 지금 이후 외출·식사 칸이 되살아나고, 풀린 원인이 전후 비교 사유다 */
function assertRestored(day, { now, lifted, frozen }) {
  assert.equal(day.returnNow, false);
  assert.equal(day.dayState, STATE.TOGETHER);
  assert.ok(day.outings.some((o) => mins(o.departAt) > mins(now)), '지금 이후 환자 외출이 있다');
  for (const m of day.mealSlots) {
    assert.ok(m.status !== 'NOT_APPLICABLE' || m.reasons.length > 0, `${m.slot} 는 사유 없이 NOT_APPLICABLE 이 아니다`);
  }
  assert.equal(day.mealSlots.find((m) => m.slot === 'DINNER').status, 'FILLED');
  for (const x of frozen) assert.deepEqual(stopsOf(day).find((y) => y.id === x.id), x, `${x.id} 그대로`);
  assert.equal(day.delta.hasVisibleChange, true, '초기화는 사용자 편집이 아니다');
  assert.ok(day.delta.reasons.includes(lifted), `풀린 원인 ${lifted}`);
  assert.ok(day.delta.added.length > 0);
}

describe('MUST 1·2 — 원인이 풀리면 오늘 남은 시간을 지금 이후로 다시 짠다', () => {
  const s = tripStay({}, { pace: 'NORMAL' });
  const base = plan(s);
  const outing = base.days[TODAY].outings[0];
  const [first] = outing.stops;
  const t1 = plus(first.arriveAt, 1);
  const t2 = plus(first.arriveAt, 16);

  for (const [type, lifted] of [
    ['PATIENT_RECALL', REASON.PATIENT_RECALLED],
    ['RISK_SIGNAL', REASON.RISK_SIGNAL],
  ]) {
    test(`${type} (외출 중) → 사건 초기화: 점심·저녁·보호자 외출이 가능한 만큼 되살아난다`, () => {
      const emptied = replanToday(s, base.days, { now: at(TODAY, t1), events: [{ type }] });
      assert.equal(emptied.dayState, STATE.NO_TOURISM);
      const restored = replanToday(s, { ...base.days, [TODAY]: emptied }, { now: at(TODAY, t2), events: [] });
      assertRestored(restored, { now: t2, lifted, frozen: [first] });
      assert.equal(restored.delta.stateChanged, true);
      if (type === 'PATIENT_RECALL') assert.equal(emptied.returnNow, true);
      // 되살린 결과는 다시 계산해도 그대로다
      const again = replanToday(s, { ...base.days, [TODAY]: restored }, { now: at(TODAY, t2), events: [] });
      assert.deepEqual(again, restored);
    });
  }

  test('외출 중 철회로 즉시 복귀 → 유효한 지침이 다시 오늘을 덮으면 남은 시간을 다시 짠다', () => {
    const linked = (periods) => stay({ pace: 'NORMAL', periods });
    const active = hospitalPeriod({ id: 'P-HOSP', startDate: '2026-10-04', endDate: '2026-10-10' });
    const b = plan(linked([active]));
    const o = b.days[TODAY].outings[0];
    const now1 = plus(o.stops[0].arriveAt, 1);
    const revoked = replanToday(linked([{ ...active, revoked: true }]), b.days, { now: at(TODAY, now1) });
    assert.equal(revoked.returnNow, true);
    const relinked = linked([{ ...active, revoked: true }, hospitalPeriod({ id: 'P-HOSP-2', planVersion: 2, startDate: '2026-10-06', endDate: '2026-10-10' })]);
    const now2 = plus(o.stops[0].arriveAt, 20);
    const restored = replanToday(relinked, { ...b.days, [TODAY]: revoked }, { now: at(TODAY, now2) });
    assertRestored(restored, { now: now2, lifted: REASON.PLAN_REVOKED, frozen: [o.stops[0]] });
  });

  test('교통 급증으로 외출이 취소된 뒤 사건을 초기화하면 다시 짠다(시작 전이면 처음 일정과 같다)', () => {
    const cut = replanToday(s, base.days, { now: at(TODAY, '08:00'), events: [{ type: 'TRAFFIC_SURGE', extraMin: 120 }] });
    assert.ok(cut.delta.hasVisibleChange);
    const reset = replanToday(s, { ...base.days, [TODAY]: cut }, { now: at(TODAY, '08:10'), events: [] });
    assert.deepEqual(withoutDelta(reset).outings, base.days[TODAY].outings);
    assert.deepEqual(withoutDelta(reset).guardianOutings, base.days[TODAY].guardianOutings);
    assert.equal(reset.delta.hasVisibleChange, true);
    assert.ok(reset.delta.reasons.length > 0);
  });

  test('사건이 그대로면 되살리지 않는다(최소 변경) — 휴무 사건을 다시 보내도 같다', () => {
    const closed = replanToday(s, base.days, { now: at(TODAY, '08:00'), events: [{ type: 'CLOSURE', closedIds: [first.contentId] }] });
    const again = replanToday(s, { ...base.days, [TODAY]: closed }, { now: at(TODAY, '09:30'), events: [{ type: 'CLOSURE', closedIds: [first.contentId] }] });
    assert.deepEqual(again.outings, closed.outings);
  });
});

describe('원인이 풀리면 진행 중 외출의 남은 정거장도 되살린다', () => {
  test('병원으로 가는 외출 중 환자 호출 → 초기화: 원인 없는 하루와 같은 외출이면 점심을 포함한 남은 정거장을 되살린다', () => {
    const s = withVisit('13:00', { pace: 'NORMAL' });
    const base = plan(s);
    const toHospital = base.days[TODAY].outings.find((o) => o.returnPlace === 'HOSPITAL' && o.stops.some((x) => x.isMeal));
    assert.ok(toHospital, '점심을 든 병원행 외출이 있다');
    const t1 = plus(toHospital.stops[0].arriveAt, 1);
    const t2 = plus(toHospital.stops[0].arriveAt, 16);
    const hit = replanToday(s, base.days, { now: at(TODAY, t1), events: [{ type: 'PATIENT_RECALL' }] });
    assert.equal(hit.mealSlots.find((m) => m.slot === 'LUNCH').status, 'NOT_APPLICABLE');
    const lifted = replanToday(s, { ...base.days, [TODAY]: hit }, { now: at(TODAY, t2), events: [] });
    const same = lifted.outings.find((o) => o.id === toHospital.id);
    assert.deepEqual(same.stops.map((x) => x.id), toHospital.stops.map((x) => x.id));
    assert.equal(lifted.mealSlots.find((m) => m.slot === 'LUNCH').status, 'FILLED');
    assert.ok(lifted.delta.reasons.includes(REASON.PATIENT_RECALLED));
  });

  test('사건·시각 조합 스윕 — 초기화 뒤 시작된 정거장은 그대로, 보이는 변화에는 사유, 다시 계산해도 같다', () => {
    const s = withVisit('15:00', { pace: 'NORMAL' });
    const base = plan(s);
    for (let m = 8 * 60 + 7; m <= 19 * 60; m += 47) {
      const t1 = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const t2 = plus(t1, 15);
      for (const events of [[{ type: 'PATIENT_RECALL' }], [{ type: 'RISK_SIGNAL' }], [{ type: 'TRAFFIC_SURGE', extraMin: 120 }], [{ type: 'APPOINTMENT', deltaMin: 120 }]]) {
        const tag = `${t1}->${t2} ${events[0].type}`;
        const hit = replanToday(s, base.days, { now: at(TODAY, t1), events });
        const prev = { ...base.days, [TODAY]: hit };
        const day = replanToday(s, prev, { now: at(TODAY, t2), events: [] });
        // 시작된 정거장은 직전 일정(hit) 기준으로 그대로다
        for (const x of stopsOf(hit).filter((y) => mins(y.arriveAt) <= mins(t2))) {
          assert.deepEqual(stopsOf(day).find((y) => y.id === x.id), x, `${tag} ${x.id}`);
        }
        assert.equal(day.returnNow, false);
        if (day.delta && day.delta !== hit.delta && day.delta.hasVisibleChange) assert.ok(day.delta.reasons.length > 0, tag);
        for (const o of [...day.outings, ...day.guardianOutings]) assert.ok(mins(o.returnBy) >= mins(o.departAt), `${tag} ${o.id}`);
        assert.deepEqual(replanToday(s, { ...prev, [TODAY]: day }, { now: at(TODAY, t2), events: [] }), day, `${tag} 멱등`);
      }
    }
  });
});

describe('MUST 3 — 오늘 사건은 다른 날짜를 바꾸지 않는다', () => {
  test('dates 없이 재계획해도 미래 날짜는 그대로이고, 오늘 대체 후보는 다른 날짜의 장소가 아니다', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const pool = tripPool('en', 60);
    const base = plan(s, { pool, now: at(TODAY, '07:00') });
    const todayIds = base.days[TODAY].outings.flatMap((o) => o.stops.map((x) => x.contentId));
    const events = [{ type: 'CLOSURE', closedIds: todayIds.slice(0, 3) }, { type: 'TRAFFIC_SURGE', extraMin: 30 }];
    const result = plan(s, { pool, now: at(TODAY, '08:00'), previous: base.days, events });
    for (const [date, day] of Object.entries(result.days)) {
      if (date > TODAY) assert.deepEqual(day, base.days[date], `${date} 는 바뀌지 않는다`);
    }
    const elsewhere = Object.entries(result.days).filter(([d]) => d !== TODAY).flatMap(([, d]) => contentIdsOf(d));
    for (const id of contentIdsOf(result.days[TODAY])) assert.ok(!elsewhere.includes(id), `${id} 는 다른 날짜의 장소가 아니다`);
  });

  test('사유 없는 마감 이동만으로는 변경됨을 만들지 않는다(NO_CANDIDATE 를 지어내지 않는다)', () => {
    const base = plan(tripStay({}, { pace: 'NORMAL' })).days[TODAY];
    const after = structuredClone(base);
    after.guardianOutings[0].returnBy = plus(after.guardianOutings[0].returnBy, 5);
    const d = computeDayDelta(base, after);
    assert.equal(d.hasVisibleChange, false);
    assert.ok(!d.reasons.includes(REASON.NO_CANDIDATE));
  });
});

describe('SHOULD 4·5', () => {
  test('고정한 장소를 든 앞 외출은 다음 외출의 옛 출발에 막혀 고정 장소를 잃지 않는다(뒤 외출을 줄이거나 옮긴다)', () => {
    const s = withVisit('15:00', { pace: 'NORMAL' });
    const base = plan(s);
    const morning = base.days[TODAY].outings.find((o) => o.returnPlace === 'LODGING' && o.stops.some((x) => !x.isMeal));
    const pinned = morning.stops.filter((x) => !x.isMeal).at(-1);
    const edits = { [TODAY]: { pinned: [pinned.contentId], deleted: [], clearedMeals: [] } };
    for (const extraMin of [30, 60, 90]) {
      const day = replanToday(s, base.days, { now: at(TODAY, '08:00'), edits, events: [{ type: 'TRAFFIC_SURGE', extraMin }] });
      const kept = stopsOf(day).find((x) => x.contentId === pinned.contentId);
      const fitsAlone = day.outings.some((o) => o.id === morning.id);
      if (fitsAlone) assert.ok(kept, `+${extraMin}: 고정 장소가 남는다`);
    }
  });

  test('이미 출발한 외출의 마감은 출발 시각보다 이르지 않다(옮긴 블록이 출발을 덮어도)', () => {
    const s = withVisit('15:00', { pace: 'NORMAL' });
    const base = plan(s);
    for (const deltaMin of [-120, -60, 60, 90, 120, 150, 180, 240]) {
      for (let m = 9 * 60; m <= 20 * 60; m += 13) {
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const day = replanToday(s, base.days, { now: at(TODAY, t), events: [{ type: 'APPOINTMENT', deltaMin }] });
        for (const o of [...day.outings, ...day.guardianOutings]) {
          assert.ok(mins(o.returnBy) >= mins(o.departAt), `${deltaMin} ${t} ${o.id} ${o.departAt}→${o.returnBy}`);
        }
      }
    }
  });
});
