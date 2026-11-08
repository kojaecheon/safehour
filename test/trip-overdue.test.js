// 복귀 마감이 지난 외출, 경우 2: 외출 중 재계획으로 이미 늦음 (설계서 2026-11-06 overdue-return 4.3, 5절)
//
// 외출 중(출발 시각 <= 지금 < occupancyEnd)이던 환자 외출이 다시 계산한 결과 여유가 음수가 되면
// 사유 OUTING_OVERDUE 로 지금 즉시 복귀와 똑같이 처리한다. 켜짐·유지·해제와 사유 문구를 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON, REASON_TEXT, RETURN_NOW_CAUSES, STATE } from '../src/domain/states.js';
import { occupancyEnd } from '../src/engine/dayContext.js';
import { computeDayDelta } from '../src/engine/dayDelta.js';
import { overdueOutingId, planTrip } from '../src/engine/tripPlan.js';
import { fromMinutes } from '../src/stay/time.js';
import { AIRPORT_TRAVEL, at, byLodging, contentIdsOf, mins, plus, stopsOf, tripPool, tripStay } from './trip-fixtures.js';

const TODAY = '2026-10-06';
const EARLY = at(TODAY, '08:00');

function plan(s, opts = {}) {
  return planTrip({
    stay: s,
    candidatesByLodging: byLodging(opts.pool ?? tripPool('en')),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: EARLY,
    ...opts,
  });
}

/** 오늘만 재계획 (trip-replan.test.js 와 같은 방식) */
function replanToday(s, base, opts = {}) {
  const used = Object.entries(base.days)
    .filter(([date]) => date !== TODAY)
    .flatMap(([, d]) => contentIdsOf(d));
  return plan(s, { dates: [TODAY], previous: base.days, usedContentIds: used, ...opts }).days[TODAY];
}

/** 오늘을 day 로 바꾼 확정 일정 (다음 재계획의 previous) */
const withToday = (base, day) => ({ ...base, days: { ...base.days, [TODAY]: day } });

const patientStopsAfter = (day, hhmm) => day.outings.flatMap((o) => o.stops).filter((s) => mins(s.arriveAt) > mins(hhmm));
const stopsAfter = (day, hhmm) => stopsOf(day).filter((s) => mins(s.arriveAt) > mins(hhmm));
const count = (list, x) => list.filter((y) => y === x).length;

describe('경우 2: 외출 중 재계획으로 이미 늦으면 즉시 복귀 (OUTING_OVERDUE)', () => {
  // 오늘 15:00 병원 일정 (trip-replan.test.js 'APPOINTMENT' 테스트의 withVisit)
  const withVisit = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(withVisit);
  const outing = base.days[TODAY].outings.find((o) => o.returnPlace === 'HOSPITAL');
  assert.ok(outing, '병원으로 돌아가는 외출이 있어야 한다');
  // 첫 정거장 도착 + 1분: 외출 중이다
  const T = plus(outing.stops[0].arriveAt, 1);
  const now = at(TODAY, T);
  assert.ok(mins(outing.departAt) <= mins(T) && mins(T) < occupancyEnd(outing), 'T 에는 외출 중이다');
  assert.ok(stopsAfter(base.days[TODAY], T).length > 0, 'T 뒤에 비울 정거장이 있어야 한다');
  // 병원 일정을 지금보다 30분 앞으로 당긴다
  const events = [{ type: 'APPOINTMENT', deltaMin: -(mins('15:00') - mins(T) + 30) }];
  const overdue = replanToday(withVisit, base, { now, events });

  test('외출 중 병원 일정이 지금보다 앞당겨지면 즉시 복귀: OUTING_OVERDUE, 남은 정거장 비움', () => {
    const day = overdue;
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.equal(stopsAfter(day, T).length, 0, '도착 시각이 지금 뒤인 환자·보호자 정거장이 없다');
    const same = day.outings.find((o) => o.id === outing.id);
    assert.ok(same, '외출 중인 그 외출은 남는다');
    assert.equal(same.departAt, outing.departAt);
    assert.deepEqual(same.stops[0], outing.stops[0], '시작된 정거장은 그대로다');
    assert.ok(same.slackMin < 0);
    assert.equal(day.delta.hasVisibleChange, true);
    assert.ok(day.delta.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(overdueOutingId({ prevDay: base.days[TODAY], day, nowMin: mins(T) }), outing.id);
  });

  test('시간이 그냥 흘러 마감이 지난 뒤의 재계획은 경우 2를 켜지 않는다', () => {
    const day = replanToday(withVisit, base, { now: at(TODAY, plus(outing.returnBy, 30)) });
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
  });

  test('외출 중이어도 바뀐 것이 없으면 켜지 않는다', () => {
    const day = replanToday(withVisit, base, { now });
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(overdueOutingId({ prevDay: base.days[TODAY], day, nowMin: mins(T) }), null);
  });

  test('바뀐 일정이 그대로면 외출 시간이 지나도 유지한다', () => {
    const kept = overdue.outings.find((o) => o.id === outing.id);
    // 즉시 복귀한 그 외출의 끝 + 60분, 원래 마감(병원 일정) + 60분 모두
    for (const later of [fromMinutes(occupancyEnd(kept) + 60), fromMinutes(occupancyEnd(outing) + 60)]) {
      const day = replanToday(withVisit, withToday(base, overdue), { now: at(TODAY, later), events });
      assert.equal(day.returnNow, true, later);
      assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE), later);
      assert.equal(day.dayState, STATE.NO_TOURISM, later);
      assert.equal(stopsAfter(day, later).length, 0, `${later} 남은 시간을 다시 짜지 않는다`);
    }
  });

  test('사건을 초기화하면 풀리고 지금 이후를 다시 짠다', () => {
    const day = replanToday(withVisit, withToday(base, overdue), { now, events: [] });
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.notEqual(day.dayState, STATE.NO_TOURISM);
    assert.ok(patientStopsAfter(day, T).length > 0, '지금 뒤 환자 정거장이 다시 생긴다');
    // 병원으로 돌아가는 그 외출도 원래 마감(병원 일정)과 여유로 돌아간다
    assert.deepEqual(day.outings, base.days[TODAY].outings, '환자 일정은 바뀌기 전으로 돌아간다');
    assert.ok(day.delta.reasons.includes(REASON.OUTING_OVERDUE), '풀린 원인이 전후 비교에 남는다');
  });

  test('원인을 가리지 않는다: 교통 지연 사건으로 이미 늦어도 켜진다', () => {
    const day = replanToday(withVisit, base, { now, events: [{ type: 'TRAFFIC_SURGE', extraMin: 60 }] });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.ok(day.outings.find((o) => o.id === outing.id).slackMin < 0);
    assert.equal(stopsAfter(day, T).length, 0);
  });

  test('환자 호출과 겹쳐도 사유가 중복되지 않는다', () => {
    const day = replanToday(withVisit, base, { now, events: [...events, { type: 'PATIENT_RECALL' }] });
    assert.equal(day.returnNow, true);
    assert.equal(count(day.reasons, REASON.OUTING_OVERDUE), 1);
    assert.equal(count(day.reasons, REASON.PATIENT_RECALLED), 1);
  });

  // 해제는 저장된 외출을 지금 입력으로 다시 확인해 정한다. 즉시 복귀한 외출은 마감이 '지금'으로 당겨져
  // 저장되므로, 새로 짠 하루에 똑같은 외출이 있어야만 풀리는 방식이면 아래 두 경우에 풀리지 않는다.
  describe('되돌리면 풀린다: 앞선 사건이 있던 하루 (병원 복귀 외출)', () => {
    const surge = { type: 'TRAFFIC_SURGE', extraMin: 20 };
    const SURGE_AT = '13:00';
    const before = replanToday(withVisit, base, { now: at(TODAY, SURGE_AT), events: [surge] });
    const hosp = before.outings.find((o) => o.returnPlace === 'HOSPITAL');
    assert.ok(hosp && mins(SURGE_AT) < mins(hosp.departAt), '교통 지연은 그 외출 출발 전에 들어온다');
    const at2 = plus(hosp.stops[0].arriveAt, 1);
    const appt = { type: 'APPOINTMENT', deltaMin: -(mins('15:00') - mins(at2) + 30) };
    const held = replanToday(withVisit, withToday(base, before), { now: at(TODAY, at2), events: [surge, appt] });

    test('전제: 교통 지연 뒤 외출 중 병원 일정이 앞당겨지면 켜진다', () => {
      assert.equal(held.returnNow, true);
      assert.ok(held.reasons.includes(REASON.OUTING_OVERDUE));
      assert.ok(held.outings.find((o) => o.id === hosp.id).slackMin < 0);
    });

    test('사건을 모두 초기화하면 그 자리와 10분 뒤 모두 풀린다', () => {
      for (const t of [at2, plus(at2, 10)]) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: [] });
        assert.equal(day.returnNow, false, t);
        assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE), t);
        assert.notEqual(day.dayState, STATE.NO_TOURISM, t);
      }
    });

    test('병원 일정만 되돌려도 풀린다', () => {
      const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, at2), events: [surge] });
      assert.equal(day.returnNow, false);
      assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    });

    test('바뀐 일정이 그대로면 원래 마감이 지나도 유지한다', () => {
      for (const t of [plus(at2, 42), plus(hosp.returnBy, 90)]) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: [surge, appt] });
        assert.equal(day.returnNow, true, t);
        assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE), t);
        assert.equal(stopsAfter(day, t).length, 0, t);
      }
    });
  });

  describe('되돌리면 풀린다: 외출 끝(occupancyEnd)이 지난 뒤 (숙소 복귀 외출)', () => {
    // 아침에 첫 외출의 첫 정거장이 휴무로 빠져 출발이 늦어진 하루
    const first = base.days[TODAY].outings[0].stops[0].contentId;
    const closure = { type: 'CLOSURE', closedIds: [first] };
    const before = replanToday(withVisit, base, { now: EARLY, events: [closure] });
    const lodging = before.outings[0];
    assert.equal(lodging.returnPlace, 'LODGING');
    const at2 = plus(lodging.stops[0].arriveAt, 1);
    // 병원 일정을 그 외출 출발 전으로 당긴다
    const appt = { type: 'APPOINTMENT', deltaMin: -240 };
    assert.ok(mins('15:00') - 240 < mins(lodging.departAt));
    const held = replanToday(withVisit, withToday(base, before), { now: at(TODAY, at2), events: [closure, appt] });
    const kept = held.outings.find((o) => o.id === lodging.id);

    test('전제: 외출 중 병원 일정이 출발 전으로 당겨지면 켜진다', () => {
      assert.equal(held.returnNow, true);
      assert.ok(held.reasons.includes(REASON.OUTING_OVERDUE));
      assert.ok(kept && kept.slackMin < 0);
    });

    test('외출 끝이 지난 뒤 사건을 모두, 또는 병원 일정만 되돌려도 풀린다', () => {
      for (const t of [fromMinutes(occupancyEnd(kept) + 5), plus(lodging.stops[0].leaveAt, 45)]) {
        assert.ok(mins(t) > occupancyEnd(kept), t);
        for (const evs of [[], [closure]]) {
          const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: evs });
          assert.equal(day.returnNow, false, `${t} ${evs.length}`);
          assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE), `${t} ${evs.length}`);
          assert.ok(patientStopsAfter(day, t).length > 0, `${t} ${evs.length} 지금 뒤를 다시 짠다`);
        }
      }
    });

    test('바뀐 일정이 그대로면 외출 끝이 지나도 유지한다', () => {
      for (const t of [fromMinutes(occupancyEnd(kept) + 5), '16:00']) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: [closure, appt] });
        assert.equal(day.returnNow, true, t);
        assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE), t);
      }
    });
  });
});

describe('경우 2: 이동 중(첫 장소 도착 전)인 외출도 즉시 복귀 (findings 10)', () => {
  // 오늘 15:00 병원 일정 (위 describe 와 같은 withVisit). 병원으로 돌아가는 외출이 출발했고 첫 정거장에는 아직 도착하지 않았다
  const withVisit = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(withVisit);
  const outing = base.days[TODAY].outings.find((o) => o.returnPlace === 'HOSPITAL');
  assert.ok(outing && outing.stops.length > 0, '병원으로 돌아가는 외출이 있어야 한다');
  // 출발 + 7분: 출발했고 첫 정거장 도착 전이다
  const T = plus(outing.departAt, 7);
  const now = at(TODAY, T);
  assert.ok(mins(T) < mins(outing.stops[0].arriveAt), 'T 는 첫 정거장 도착 전이다');
  // 병원 일정을 출발 23분 전으로 당긴다 (보고된 재현: 13:33 출발, 13:47 도착, 13:40 에 병원 일정 13:10)
  const events = [{ type: 'APPOINTMENT', deltaMin: -(mins('15:00') - mins(outing.departAt) + 23) }];
  const overdue = replanToday(withVisit, base, { now, events });
  const kept = overdue.outings.find((o) => o.id === outing.id);

  test('이동 중(첫 장소 도착 전)에 병원 일정이 앞당겨지면 즉시 복귀: 외출은 정거장 0개로 남고 OUTING_OVERDUE', () => {
    assert.equal(overdue.returnNow, true);
    assert.ok(overdue.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(overdue.dayState, STATE.NO_TOURISM);
    assert.ok(kept, '이동 중인 그 외출은 취소되지 않고 남는다');
    assert.equal(kept.departAt, outing.departAt);
    assert.equal(kept.stops.length, 0, '남은 정거장은 비운다');
    assert.ok(kept.slackMin < 0);
    assert.equal(kept.returnPlace, outing.returnPlace, '복귀 장소(병원)는 그대로다');
    assert.equal(kept.returnPlace, 'HOSPITAL');
    assert.equal(patientStopsAfter(overdue, T).length, 0, '지금 뒤 환자 정거장이 없다');
    assert.equal(stopsAfter(overdue, T).length, 0);
    assert.ok(overdue.delta.reasons.includes(REASON.OUTING_OVERDUE));
    // 전후 비교: 그 외출은 '취소된 외출'이 아니다(남아 있다). 비운 정거장은 빠진 곳, 당겨진 마감은 새 마감으로 보인다
    assert.ok(!overdue.delta.cancelledOutings.includes(outing.id));
    assert.ok(outing.stops.every((s) => overdue.delta.removed.includes(s.id)));
    assert.ok(overdue.delta.newDeadlines.some((d) => d.outingId === outing.id && d.returnBy === kept.returnBy));
    assert.equal(overdueOutingId({ prevDay: base.days[TODAY], day: overdue, nowMin: mins(T) }), outing.id);
  });

  test('바뀐 일정이 그대로면 60분 뒤에도 유지한다', () => {
    const later = plus(T, 60);
    const day = replanToday(withVisit, withToday(base, overdue), { now: at(TODAY, later), events });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.equal(stopsAfter(day, later).length, 0);
  });

  test('사건을 초기화하면 풀리고 지금 이후를 다시 짠다', () => {
    const day = replanToday(withVisit, withToday(base, overdue), { now, events: [] });
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.notEqual(day.dayState, STATE.NO_TOURISM);
    assert.ok(patientStopsAfter(day, T).length > 0, '지금 뒤 환자 정거장이 다시 생긴다');
  });

  test('마감은 출발 시각에 고정된다: 출발 뒤 언제 켜져도 여유가 같다 (findings 13)', () => {
    const slacks = [1, 7, 13].map((m) => {
      const t = plus(outing.departAt, m);
      const day = replanToday(withVisit, base, { now: at(TODAY, t), events });
      const same = day.outings.find((o) => o.id === outing.id);
      assert.equal(day.returnNow, true, t);
      assert.equal(same.stops.length, 0, t);
      assert.equal(same.returnBy, outing.departAt, `${t} 마감은 출발 시각이다`);
      return same.slackMin;
    });
    assert.ok(slacks[0] < 0);
    assert.deepEqual(slacks, [slacks[0], slacks[0], slacks[0]], '이동한 시간과 상관없이 여유가 같다');
  });

  test('휴무로 정거장을 모두 비운 이동 중 외출은 마감을 출발 시각에 고정하지 않고 켜지지 않는다 (findings 13)', () => {
    const day = replanToday(withVisit, base, { now, events: [{ type: 'CLOSURE', closedIds: outing.stops.map((s) => s.contentId) }] });
    const same = day.outings.find((o) => o.id === outing.id && o.departAt === outing.departAt);
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    assert.equal(same.stops.length, 0, '전제: 대체 장소가 없어 정거장 0개로 남는다');
    assert.equal(same.returnBy, outing.returnBy, '마감은 지금 창 그대로다');
    assert.ok(same.slackMin >= 0);
  });

  describe('첫 이동 구간이 긴 외출: 출발 45분·60분 뒤에 늦어져도 켜진다 (findings 13)', () => {
    // 저장된 일정에서 그 외출의 첫 정거장 도착을 70분 늦춘다(첫 이동 구간이 긴 외출). 출발 45·60분 뒤에도 이동 중이다
    const LONG = 70;
    const shift = (st) => ({ ...st, arriveAt: plus(st.arriveAt, LONG), leaveAt: plus(st.leaveAt, LONG), legIn: { ...st.legIn, min: st.legIn.min + LONG } });
    const longDay = {
      ...base.days[TODAY],
      outings: base.days[TODAY].outings.map((o) => (o.id === outing.id ? { ...o, stops: o.stops.map(shift) } : o)),
    };
    const longBase = withToday(base, longDay);

    for (const m of [45, 60]) {
      const t = plus(outing.departAt, m);
      test(`출발 ${m}분 뒤 병원 일정이 앞당겨지면 켜지고, 그대로면 유지되고, 초기화하면 풀린다`, () => {
        assert.ok(mins(t) < mins(longDay.outings.find((o) => o.id === outing.id).stops[0].arriveAt), '전제: 아직 이동 중이다');
        const day = replanToday(withVisit, longBase, { now: at(TODAY, t), events });
        const same = day.outings.find((o) => o.id === outing.id);
        assert.equal(day.returnNow, true, t);
        assert.ok(day.reasons.includes(REASON.OUTING_OVERDUE), t);
        assert.equal(same.stops.length, 0, t);
        assert.equal(same.returnBy, outing.departAt, t);
        assert.ok(same.slackMin < 0, `${t} 여유가 음수로 남는다`);

        const later = plus(t, 30);
        const kept = replanToday(withVisit, withToday(longBase, day), { now: at(TODAY, later), events });
        assert.equal(kept.returnNow, true, `${later} 유지`);
        assert.ok(kept.outings.find((o) => o.id === outing.id).slackMin < 0, `${later} 유지`);

        const reset = replanToday(withVisit, withToday(longBase, day), { now: at(TODAY, later), events: [] });
        assert.equal(reset.returnNow, false, `${later} 해제`);
        assert.ok(!reset.reasons.includes(REASON.OUTING_OVERDUE), `${later} 해제`);
        assert.ok(reset.outings.every((o) => o.slackMin >= 0), `${later} 해제 뒤 여유는 0 이상이다`);
      });
    }
  });

  test('바뀐 것에 영향받지 않은 이동 중 외출은 취소하지도, 즉시 복귀를 켜지도 않는다', () => {
    const day = replanToday(withVisit, base, { now, events: [{ type: 'TRAFFIC_SURGE', extraMin: 5 }] });
    assert.equal(day.returnNow, false);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE));
    const same = day.outings.find((o) => o.id === outing.id && o.departAt === outing.departAt);
    assert.ok(same, '그 외출은 남는다');
    assert.ok(same.stops.length > 0, '정거장도 남는다');
    assert.ok(same.slackMin >= 0);
  });
});

describe('이미 출발한 외출은 옮기지 않는다 (fix round 1 M4·M5)', () => {
  const withVisit = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(withVisit);
  const first = base.days[TODAY].outings[0];

  test('출발 뒤 첫 장소 도착 전에 첫 장소가 휴무가 되어도 출발 시각은 그대로다', () => {
    const T = plus(first.departAt, 2);
    assert.ok(mins(T) < mins(first.stops[0].arriveAt));
    const day = replanToday(withVisit, base, { now: at(TODAY, T), events: [{ type: 'CLOSURE', closedIds: [first.stops[0].contentId] }] });
    const same = day.outings.find((o) => o.id === first.id);
    assert.ok(same, '그 외출은 남는다');
    assert.equal(same.departAt, first.departAt, '출발 시각을 늦추지 않는다');
    assert.ok(!day.outings.some((o) => o.id !== first.id && mins(o.departAt) <= mins(T) && mins(T) < occupancyEnd(o)), '겹치는 외출이 없다');
  });

  test('정거장을 모두 비우고 남은 외출은 늦지 않아도 전후 비교에 마감을 싣는다', () => {
    const before = base.days[TODAY];
    const after = { ...before, outings: before.outings.map((o) => (o.id === first.id ? { ...o, stops: [] } : o)) };
    assert.ok(first.slackMin >= 0);
    const delta = computeDayDelta(before, after, { reasons: [REASON.CLOSED] });
    assert.ok(delta.newDeadlines.some((d) => d.outingId === first.id && d.returnBy === first.returnBy));
    assert.ok(!delta.cancelledOutings.includes(first.id));
  });
});

describe('즉시 복귀가 풀린 뒤: 마감이 당겨진 외출은 다시 잰다 (findings 9)', () => {
  const withVisit = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(withVisit);
  const baseDay = base.days[TODAY];
  const span = (o) => [mins(o.departAt), occupancyEnd(o)];
  const overlaps = (a, b) => span(a)[0] < span(b)[1] && span(b)[0] < span(a)[1];

  /** 이미 출발한 외출(departAt)이 하나뿐이고 다른 환자 외출과 겹치지 않으며 여유를 다시 쟀다 */
  function assertRemeasured(day, departAt, label) {
    assert.equal(day.returnNow, false, label);
    assert.ok(!day.reasons.includes(REASON.OUTING_OVERDUE), label);
    assert.ok(!day.reasons.includes(REASON.SLA_INSUFFICIENT), `${label} 시간 부족 사유가 남지 않는다`);
    const same = day.outings.filter((o) => o.departAt === departAt);
    assert.equal(same.length, 1, `${label} 그 출발 시각의 외출은 하나다`);
    const [kept] = same;
    assert.ok(kept.slackMin >= 0, `${label} 여유를 지금 창으로 다시 잰다`);
    for (const o of day.outings) {
      if (o !== kept) assert.ok(!overlaps(o, kept), `${label} ${o.departAt} 외출이 다시 잰 외출과 겹치지 않는다`);
    }
    return kept;
  }

  describe('병원 복귀 외출: 교통 지연으로 체류가 줄어든 뒤 병원 일정이 앞당겨진 하루', () => {
    const surge = { type: 'TRAFFIC_SURGE', extraMin: 20 };
    const before = replanToday(withVisit, base, { now: at(TODAY, '13:00'), events: [surge] });
    const hosp = before.outings.find((o) => o.returnPlace === 'HOSPITAL');
    const at2 = plus(hosp.stops[0].arriveAt, 1);
    const appt = { type: 'APPOINTMENT', deltaMin: -(mins('15:00') - mins(at2) + 30) };
    const held = replanToday(withVisit, withToday(base, before), { now: at(TODAY, at2), events: [surge, appt] });
    const clamped = held.outings.find((o) => o.id === hosp.id);

    test('전제: 마감이 지금으로 당겨지고 정거장은 아직 머무는 중이다', () => {
      assert.equal(held.returnNow, true);
      assert.ok(mins(clamped.returnBy) < mins(clamped.stops.at(-1).leaveAt));
      assert.ok(clamped.slackMin < 0);
    });

    test('사건을 모두 초기화하면 그 외출을 다시 재고 겹치는 외출을 더하지 않는다 (그 자리, 10분 뒤)', () => {
      for (const t of [at2, plus(at2, 10)]) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: [] });
        const kept = assertRemeasured(day, hosp.departAt, t);
        assert.equal(kept.returnPlace, 'HOSPITAL', t);
        assert.equal(kept.returnBy, '15:00', `${t} 마감은 원래 병원 일정이다`);
        assert.deepEqual(kept.stops[0], clamped.stops[0], `${t} 머무는 중인 정거장은 그대로다`);
        assert.ok(patientStopsAfter(day, t).length > 0, `${t} 지금 뒤를 다시 짠다`);
      }
    });

    test('오후 중간에 풀려도 보호자 저녁 외출이 다시 생긴다', () => {
      const evening = baseDay.guardianOutings.filter((g) => mins(g.departAt) > mins('15:00'));
      assert.ok(evening.length > 0, '전제: 처음 일정에 보호자 저녁 외출이 있다');
      const t = plus(at2, 10);
      const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: [] });
      assert.ok(day.guardianOutings.some((g) => mins(g.departAt) > mins('15:00')), '보호자 저녁 외출이 있다');
      for (const g of day.guardianOutings) {
        for (const o of day.outings) assert.ok(!overlaps(g, o) || mins(g.departAt) < mins(t), `${g.departAt} 보호자 외출이 환자 외출과 겹치지 않는다`);
      }
    });
  });

  describe('숙소 복귀 외출: 첫 정거장 휴무로 출발이 늦어진 뒤 병원 일정이 출발 전으로 당겨진 하루', () => {
    const first = baseDay.outings[0].stops[0].contentId;
    const closure = { type: 'CLOSURE', closedIds: [first] };
    const before = replanToday(withVisit, base, { now: EARLY, events: [closure] });
    const lodging = before.outings[0];
    const at2 = plus(lodging.stops[0].arriveAt, 1);
    const appt = { type: 'APPOINTMENT', deltaMin: -240 };
    const held = replanToday(withVisit, withToday(base, before), { now: at(TODAY, at2), events: [closure, appt] });
    const clamped = held.outings.find((o) => o.id === lodging.id);

    test('전제: 마감이 출발 시각으로 당겨지고 비운 정거장이 있다', () => {
      assert.equal(held.returnNow, true);
      assert.ok(mins(clamped.returnBy) < mins(clamped.stops.at(-1).leaveAt));
      assert.ok(clamped.stops.length < lodging.stops.length);
    });

    test('머무는 중에 풀리면 다시 재고, 바뀌기 전 일정의 남은 정거장을 되살린다', () => {
      const t = plus(at2, 20);
      for (const evs of [[], [closure]]) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: evs });
        const kept = assertRemeasured(day, lodging.departAt, `${t} ${evs.length}`);
        assert.deepEqual(kept.stops[0], clamped.stops[0], '머무는 중인 정거장은 그대로다');
        const rest = kept.stops.slice(clamped.stops.length);
        assert.ok(rest.length > 0, `${evs.length} 남은 정거장이 돌아온다`);
        assert.ok(rest.every((s) => mins(s.arriveAt) > mins(t)), `${evs.length} 돌아온 정거장은 지금 뒤에 도착한다`);
        // 사건을 모두 초기화하면 바뀌기 전 일정의 남은 정거장 그대로다(사건이 남아 있으면 원인 없는 하루의 정거장이 온다)
        if (evs.length === 0) assert.deepEqual(rest.map((s) => s.contentId), lodging.stops.slice(clamped.stops.length).map((s) => s.contentId));
      }
    });

    test('돌아온 뒤에 풀려도 겹치는 외출이 없고 다음 재계획도 풀린 채다', () => {
      const t = fromMinutes(occupancyEnd(clamped) + 5);
      for (const evs of [[], [closure]]) {
        const day = replanToday(withVisit, withToday(base, held), { now: at(TODAY, t), events: evs });
        const kept = assertRemeasured(day, lodging.departAt, `${t} ${evs.length}`);
        assert.deepEqual(kept.stops, clamped.stops, '돌아온 외출의 정거장은 기록 그대로다');
        const next = replanToday(withVisit, withToday(base, day), { now: at(TODAY, plus(t, 30)), events: evs });
        assertRemeasured(next, lodging.departAt, `다음 ${evs.length}`);
      }
    });
  });

  test('보통의 해제(환자 호출 초기화)는 환자 일정이 그대로이고 보호자 저녁 외출도 돌아온다', () => {
    const recalled = replanToday(withVisit, base, { now: at(TODAY, '13:40'), events: [{ type: 'PATIENT_RECALL' }] });
    const day = replanToday(withVisit, withToday(base, recalled), { now: at(TODAY, '13:58'), events: [] });
    assert.equal(day.returnNow, false);
    assert.deepEqual(day.outings, baseDay.outings, '환자 일정은 바뀌기 전으로 돌아간다');
    assert.ok(day.guardianOutings.some((g) => mins(g.departAt) > mins('15:00')), '보호자 저녁 외출이 있다');
  });
});

test('RETURN_NOW_CAUSES 와 사유 문구', () => {
  assert.deepEqual(RETURN_NOW_CAUSES, [REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED, REASON.OUTING_OVERDUE]);
  assert.ok(Object.isFrozen(RETURN_NOW_CAUSES));
  assert.equal(REASON.OUTING_OVERDUE, 'OUTING_OVERDUE');
  assert.deepEqual(REASON_TEXT[REASON.OUTING_OVERDUE], {
    ko: '일정이 바뀌어 지금 외출이 복귀 마감을 맞출 수 없습니다',
    en: 'A change means this outing can no longer make its return time',
    ja: '予定が変わり、今の外出は帰着期限に間に合いません',
    zh: '日程变更，本次外出已无法按时返回',
  });
});
