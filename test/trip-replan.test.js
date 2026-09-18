// AX-307 — 재계획·전후 비교·데모 사건·즉시 복귀 (spec 4.9, 5.2 DayDelta)
//
// spec 10장 규칙 13, 30(재계획), 31, 50, 55 와 '시작된 정거장 보존'을 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON, STATE } from '../src/domain/states.js';
import { SilentReplanError, computeDayDelta } from '../src/engine/dayDelta.js';
import { foldDemoEvents } from '../src/engine/tripEvents.js';
import { applyImmediateReturn, planTrip } from '../src/engine/tripPlan.js';
import { hospitalPeriod } from './stay-fixtures.js';
import {
  AIRPORT_TRAVEL,
  at,
  byLodging,
  contentIdsOf,
  mins,
  park,
  plus,
  requiredMin,
  stay,
  stopsOf,
  tripPool,
  tripStay,
  withoutDelta,
} from './trip-fixtures.js';

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

/** 오늘만 재계획 — 다른 날짜의 배치는 usedContentIds 로 싣는다 (T15a 가 하는 방식) */
function replanToday(s, base, opts = {}) {
  const used = Object.entries(base.days)
    .filter(([date]) => date !== TODAY)
    .flatMap(([, d]) => contentIdsOf(d));
  return plan(s, { dates: [TODAY], previous: base.days, usedContentIds: used, ...opts }).days[TODAY];
}

/** 그 날짜만 재계획 — 다른 날짜의 배치는 usedContentIds 로 싣는다 */
function replanOnly(s, base, date, opts = {}) {
  const used = Object.entries(base.days)
    .filter(([d]) => d !== date)
    .flatMap(([, d]) => contentIdsOf(d));
  return plan(s, { dates: [date], previous: base.days, usedContentIds: used, ...opts }).days[date];
}

/** 관심사 NATURE 실외 공원 8곳 (7000번대) */
const parks = () =>
  Array.from({ length: 8 }, (_, i) =>
    park(String(7000 + i), { title: `테스트 공원 ${i}`, north: Number((0.5 + i * 0.2).toFixed(2)) * (i % 2 ? -1 : 1), east: 0.3 }),
  );
const isPark = (id) => id.startsWith('70') && id.length === 4;

/** 정거장이 2곳 이상인 첫 환자 외출 */
const multiStopOuting = (day) => day.outings.find((o) => o.stops.length >= 2);
const patientStops = (day) => day.outings.flatMap((o) => o.stops);

describe('foldDemoEvents — 누적 규칙 (spec 4.9 사건 표)', () => {
  test('TRAFFIC_SURGE 는 누적 상한 120, APPOINTMENT 는 누적 ±240', () => {
    const f = foldDemoEvents([
      { type: 'TRAFFIC_SURGE', extraMin: 100 },
      { type: 'TRAFFIC_SURGE', extraMin: 100 },
      { type: 'APPOINTMENT', deltaMin: 200 },
      { type: 'APPOINTMENT', deltaMin: 200 },
      { type: 'CLOSURE', closedIds: ['2', '1', '2'] },
      { type: 'WEATHER' },
    ]);
    assert.equal(f.extraBufferMin, 120);
    assert.equal(f.appointmentDeltaMin, 240);
    assert.deepEqual(f.closedContentIds, ['1', '2']);
    assert.equal(f.weatherUnsafe, true);
    assert.equal(f.patientRecalled, false);
    assert.equal(foldDemoEvents([{ type: 'APPOINTMENT', deltaMin: -300 }]).appointmentDeltaMin, -240);
    assert.equal(foldDemoEvents([{ type: 'TRAFFIC_SURGE', extraMin: 1 }]).extraBufferMin, 5);
  });

  test('모르는 사건은 조용히 넘기지 않는다', () => {
    assert.throws(() => foldDemoEvents([{ type: 'EARTHQUAKE' }]), TypeError);
    assert.throws(() => foldDemoEvents([{ type: 'TRAFFIC_SURGE', extraMin: 'x' }]), TypeError);
  });
});

describe('재계획 규칙 (spec 4.9)', () => {
  test('변화가 없으면 확정 일정을 그대로 쓴다 — 전후 비교도 새로 만들지 않는다', () => {
    const s = tripStay();
    const base = plan(s);
    const again = plan(s, { previous: base.days });
    assert.deepEqual(again.days, base.days);
  });

  test('미래 날짜의 변화는 게이트부터 다시 판정하고 자동 대체한다 (기상)', () => {
    const s = tripStay({}, { interests: ['NATURE'] });
    const pool = [...tripPool('en'), ...parks()];
    const dates = ['2026-10-07', '2026-10-08'];
    const base = plan(s, { pool, dates });
    const date = '2026-10-08';
    const outdoor = contentIdsOf(base.days[date]).filter(isPark);
    assert.ok(outdoor.length > 0, '관심사 일치 실외 장소가 먼저 배치된다');
    const next = plan(s, { pool, dates, previous: base.days, weatherByDate: { [date]: { outdoorUnsafe: true } } });
    const day = next.days[date];
    for (const id of outdoor) assert.ok(!contentIdsOf(day).includes(id));
    assert.equal(day.delta.hasVisibleChange, true);
    assert.equal(day.delta.seen, false);
    assert.ok(day.delta.reasons.includes(REASON.WEATHER_BLOCKED));
    const gone = [...day.delta.removed, ...day.delta.replaced.map((r) => r.from)];
    for (const id of outdoor) assert.ok(gone.some((stopId) => stopId.endsWith(`:${id}`)));
    assert.ok(day.delta.replaced.length > 0, '다른 후보로 대체한다');
    // 영향받지 않은 날짜는 그대로다(전후 비교도 없다)
    assert.deepEqual(next.days['2026-10-07'], base.days['2026-10-07']);
  });
});

describe('규칙 50 — 데모 사건 6종은 오늘에만 효과를 낸다', () => {
  const s = tripStay({}, { pace: 'NORMAL' });
  const base = plan(s);

  test('CLOSURE — 닫힌 장소를 빼고 다른 후보로 대체한다(대체된 자리가 기록된다, 규칙 31)', () => {
    const target = base.days[TODAY].outings[0].stops[0];
    const day = replanToday(s, base, { events: [{ type: 'CLOSURE', closedIds: [target.contentId] }] });
    assert.ok(!contentIdsOf(day).includes(target.contentId));
    assert.equal(day.delta.hasVisibleChange, true);
    assert.ok(day.delta.replaced.some((r) => r.from === target.id), '대체된 자리');
    assert.ok(day.delta.reasons.includes(REASON.CLOSED));
    assert.ok(day.excluded.find((e) => e.candidateId === target.contentId).reasons.includes(REASON.CLOSED));
  });

  test('WEATHER — 실외 장소를 빼고 재계획한다', () => {
    const s2 = tripStay({}, { interests: ['NATURE'] });
    const pool = [...tripPool('en'), ...parks()];
    const b = plan(s2, { pool, dates: [TODAY] });
    const outdoor = contentIdsOf(b.days[TODAY]).filter(isPark);
    assert.ok(outdoor.length > 0);
    const day = plan(s2, { pool, dates: [TODAY], previous: b.days, events: [{ type: 'WEATHER' }] }).days[TODAY];
    assert.equal(contentIdsOf(day).filter(isPark).length, 0);
    assert.ok(day.delta.reasons.includes(REASON.WEATHER_BLOCKED));
    assert.equal(day.delta.hasVisibleChange, true);
  });

  test('TRAFFIC_SURGE — 오늘 모든 외출 복귀 계산에 추가 버퍼(누적)', () => {
    const events = [
      { type: 'TRAFFIC_SURGE', extraMin: 10 },
      { type: 'TRAFFIC_SURGE', extraMin: 15 },
    ];
    const day = replanToday(s, base, { events });
    assert.ok(day.outings.length > 0);
    for (const o of day.outings) {
      const req = requiredMin(o, { recovery: true, extra: 25 });
      assert.equal(mins(o.returnBy) - mins(o.departAt) - req, o.slackMin, `${o.id} 에 25분 버퍼`);
      assert.ok(o.slackMin >= 0);
    }
    for (const o of day.guardianOutings) {
      assert.equal(mins(o.returnBy) - mins(o.departAt) - requiredMin(o, { recovery: false, extra: 25 }), o.slackMin);
    }
    // 오늘만 — 다른 날짜는 버퍼 없음
    assert.deepEqual(replanOnly(s, base, '2026-10-07', { events }), base.days['2026-10-07']);
  });

  test('APPOINTMENT — 오늘 병원 일정 블록을 옮기고 재계획한다(누적 ±240)', () => {
    const withVisit = tripStay({}, {
      pace: 'NORMAL',
      appointments: [
        { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
        { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
      ],
    });
    const b = plan(withVisit);
    const block = (day) => day.blocks.find((x) => x.appointmentId === 'A-VISIT');
    const before = block(b.days[TODAY]);
    const day = replanToday(withVisit, b, { events: [{ type: 'APPOINTMENT', deltaMin: 60 }] });
    assert.equal(mins(block(day).end) - mins(before.end), 60);
    assert.ok(day.reasons.includes(REASON.APPOINTMENT_DELAYED));
    assert.ok(day.delta.hasVisibleChange);
    for (const o of day.outings) {
      if (o.returnPlace === 'HOSPITAL') assert.equal(o.returnBy, '16:00', '마지막 외출은 옮긴 일정 시작에 맞춘다');
    }
    const capped = replanToday(withVisit, b, {
      events: [
        { type: 'APPOINTMENT', deltaMin: 200 },
        { type: 'APPOINTMENT', deltaMin: 200 },
      ],
    });
    assert.equal(mins(block(capped).end) - mins(before.end), 240);
  });

  test('PATIENT_RECALL — 오늘 남은 일정을 비우고 returnNow=true, 사유 PATIENT_RECALLED (규칙 13)', () => {
    const day = replanToday(s, base, { events: [{ type: 'PATIENT_RECALL' }] });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.PATIENT_RECALLED));
    assert.equal(stopsOf(day).length, 0, '시작 전이면 남은 정거장이 모두 비워진다');
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.equal(day.delta.hasVisibleChange, true);
    assert.ok(day.mealSlots.every((m) => m.status !== 'FILLED'));
  });

  test('RISK_SIGNAL — 오늘 남은 환자·보호자 외출을 비우고 NO_TOURISM, 사유 RISK_SIGNAL', () => {
    assert.ok(base.days[TODAY].guardianOutings.length + base.days[TODAY].outings.length > 0);
    const day = replanToday(s, base, { events: [{ type: 'RISK_SIGNAL' }] });
    assert.equal(day.outings.length, 0);
    assert.equal(day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.RISK_SIGNAL));
    assert.equal(day.returnNow, false);
  });

  test('사건은 오늘이 아닌 날짜에 적용되지 않는다', () => {
    const events = [
      { type: 'RISK_SIGNAL' },
      { type: 'PATIENT_RECALL' },
      { type: 'WEATHER' },
      { type: 'TRAFFIC_SURGE', extraMin: 60 },
      { type: 'CLOSURE', closedIds: contentIdsOf(base.days['2026-10-08']) },
    ];
    assert.deepEqual(replanOnly(s, base, '2026-10-08', { events }), base.days['2026-10-08']);
    assert.equal(replanToday(s, base, { events }).dayState, STATE.NO_TOURISM);
  });
});

describe('시작된 정거장 보존 (재계획 규칙 2)', () => {
  const s = tripStay({}, { pace: 'NORMAL' });
  const base = plan(s);
  const outing = multiStopOuting(base.days[TODAY]);
  const [first, second] = outing.stops;
  const now = at(TODAY, plus(first.arriveAt, 1));

  test('도착 시각이 지난 정거장은 닫혀도 건드리지 않는다', () => {
    const day = replanToday(s, base, { now, events: [{ type: 'CLOSURE', closedIds: [first.contentId] }] });
    const kept = stopsOf(day).find((x) => x.id === first.id);
    assert.deepEqual(kept, first);
    assert.equal(day.outings.find((o) => o.id === outing.id).departAt, outing.departAt);
  });

  test('외출 중 아직 도착하지 않은 정거장이 닫히면 그 자리를 대체하고, 시작된 정거장은 그대로다', () => {
    const day = replanToday(s, base, { now, events: [{ type: 'CLOSURE', closedIds: [second.contentId] }] });
    const same = day.outings.find((o) => o.id === outing.id);
    assert.equal(same.departAt, outing.departAt);
    assert.deepEqual(same.stops[0], first);
    assert.ok(!contentIdsOf(day).includes(second.contentId));
    assert.equal(day.delta.hasVisibleChange, true);
    assert.ok([...day.delta.removed, ...day.delta.replaced.map((r) => r.from)].includes(second.id));
    assert.ok(same.slackMin >= 0);
    assert.ok(mins(same.plannedReturnAt) <= mins(same.returnBy));
  });

  test('외출 중 재계획을 다시 해도(같은 사건, 같은 시각) 결과가 같다', () => {
    const events = [{ type: 'CLOSURE', closedIds: [second.contentId] }];
    const first1 = plan(s, { now, events, previous: base.days });
    const again = plan(s, { now, events, previous: first1.days });
    assert.deepEqual(again.days, first1.days);
  });

  test('지난 외출은 그대로 남고 이후만 다시 짠다', () => {
    const last = base.days[TODAY].outings.at(-1);
    const late = at(TODAY, plus(last.stops.at(-1).arriveAt, 1));
    const day = replanToday(s, base, { now: late, events: [{ type: 'CLOSURE', closedIds: contentIdsOf(base.days[TODAY]) }] });
    for (const o of base.days[TODAY].outings) {
      const startedStops = o.stops.filter((x) => mins(x.arriveAt) <= mins(plus(last.stops.at(-1).arriveAt, 1)));
      for (const x of startedStops) assert.deepEqual(stopsOf(day).find((y) => y.id === x.id), x);
    }
  });
});

describe('규칙 55 — 사건은 오늘 재계획마다 다시 적용되고, 같은 누적 사건이면 같은 결과다', () => {
  const s = tripStay({}, { pace: 'NORMAL' });
  const base = plan(s);
  const target = base.days[TODAY].outings[0].stops[0].contentId;
  const e1 = { type: 'CLOSURE', closedIds: [target] };
  const e2 = { type: 'TRAFFIC_SURGE', extraMin: 20 };

  test('같은 사건을 다시 보내도 결과가 같다(버퍼가 두 번 더해지지 않는다)', () => {
    const p1 = plan(s, { previous: base.days, events: [e1, e2] });
    const p2 = plan(s, { previous: p1.days, events: [e1, e2] });
    assert.deepEqual(p2.days, p1.days);
  });

  test('하나씩 누적해 보낸 결과와 한 번에 보낸 결과가 같다(시작 전)', () => {
    const stepwise = plan(s, { previous: plan(s, { previous: base.days, events: [e1] }).days, events: [e1, e2] });
    const direct = plan(s, { previous: base.days, events: [e1, e2] });
    assert.deepEqual(withoutDelta(stepwise.days[TODAY]), withoutDelta(direct.days[TODAY]));
  });

  test('returnNow 는 환자 호출이 남아 있는 동안 유지되고, 사건 초기화로 풀린다', () => {
    const recalled = plan(s, { previous: base.days, events: [{ type: 'PATIENT_RECALL' }] });
    assert.equal(recalled.days[TODAY].returnNow, true);
    const again = plan(s, { previous: recalled.days, events: [{ type: 'PATIENT_RECALL' }, e2] });
    assert.equal(again.days[TODAY].returnNow, true);
    assert.equal(stopsOf(again.days[TODAY]).length, 0);
    const reset = plan(s, { previous: again.days, events: [] });
    assert.equal(reset.days[TODAY].returnNow, false);
    assert.deepEqual(withoutDelta(reset.days[TODAY]), withoutDelta(base.days[TODAY]), '초기화하면 오늘을 다시 짠다');
  });
});

describe('규칙 13 — 외출 중 지침 철회·만료는 즉시 복귀', () => {
  const linked = (overrides = {}) =>
    stay({
      pace: 'NORMAL',
      periods: [hospitalPeriod({ id: 'P-HOSP', startDate: '2026-10-04', endDate: '2026-10-10', ...overrides })],
    });
  const base = plan(linked());
  const outing = base.days[TODAY].outings[0];
  const [first] = outing.stops;
  assert.ok(outing.stops.length >= 2, '첫 외출에 정거장이 2곳 이상');
  const now = at(TODAY, plus(first.arriveAt, 1));

  test('외출 중 철회되면 남은 정거장을 비우고 returnNow=true, 사유 PLAN_REVOKED — 시작된 정거장은 남는다', () => {
    const day = replanToday(linked({ revoked: true }), base, { now });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.PLAN_REVOKED));
    assert.deepEqual(patientStops(day), [first]);
    for (const x of stopsOf(day)) assert.ok(mins(x.arriveAt) <= mins(first.arriveAt) + 1, '남은 것은 시작된 정거장뿐');
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.equal(day.delta.hasVisibleChange, true);
  });

  test('외출 중 만료되면 사유 PLAN_EXPIRED', () => {
    const day = replanToday(linked({ expiresAt: '2026-10-06T10:00:00+09:00' }), base, { now });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.PLAN_EXPIRED));
  });

  test('외출 중이 아니면(시작 전) 즉시 복귀가 아니라 보통 재계획이다', () => {
    const day = replanToday(linked({ revoked: true }), base, { now: EARLY });
    assert.equal(day.returnNow, false);
    assert.equal(day.coverage, 'NEEDS_INPUT');
  });

  test('returnNow 는 유효한 지침이 다시 오늘을 덮을 때만 풀린다', () => {
    const revoked = plan(linked({ revoked: true }), { previous: base.days, now, dates: [TODAY] });
    const later = at(TODAY, plus(first.arriveAt, 30));
    const still = plan(linked({ revoked: true }), { previous: revoked.days, now: later, dates: [TODAY] });
    assert.equal(still.days[TODAY].returnNow, true, '다른 재계획에도 유지');
    const relinked = stay({
      pace: 'NORMAL',
      periods: [
        hospitalPeriod({ id: 'P-HOSP', startDate: '2026-10-04', endDate: '2026-10-10', revoked: true }),
        hospitalPeriod({ id: 'P-HOSP-2', planVersion: 2, startDate: '2026-10-06', endDate: '2026-10-10' }),
      ],
    });
    const released = plan(relinked, { previous: still.days, now: later, dates: [TODAY] });
    assert.equal(released.days[TODAY].returnNow, false);
  });

  test('applyImmediateReturn — 외출 중 만료·철회를 기기에서 바로 반영하는 변환', () => {
    const day = applyImmediateReturn(base.days[TODAY], { now, cause: 'PLAN_EXPIRED' });
    assert.equal(day.returnNow, true);
    assert.ok(day.reasons.includes(REASON.PLAN_EXPIRED));
    assert.deepEqual(patientStops(day), [first]);
    assert.equal(day.delta.hasVisibleChange, true);
    assert.equal(base.days[TODAY].returnNow, false, '입력을 바꾸지 않는다');
    assert.throws(() => applyImmediateReturn(base.days[TODAY], { now, cause: 'WHATEVER' }), RangeError);
    assert.throws(() => applyImmediateReturn(base.days['2026-10-07'], { now, cause: 'PLAN_REVOKED' }), RangeError);
  });
});

describe('규칙 31 — 알림만 하는 재계산 금지', () => {
  const s = tripStay();
  const base = plan(s);
  const day = base.days[TODAY];

  test('정거장이 바뀌면 hasVisibleChange=true 이고 빠진 곳·들어온 곳·대체된 곳이 겹치지 않게 기록된다', () => {
    const target = day.outings[0].stops[0];
    const after = replanToday(s, base, { events: [{ type: 'CLOSURE', closedIds: [target.contentId] }] });
    const d = after.delta;
    assert.equal(d.hasVisibleChange, true);
    assert.equal(d.before, day.dayState);
    assert.equal(d.after, after.dayState);
    const from = d.replaced.map((r) => r.from);
    const to = d.replaced.map((r) => r.to);
    for (const id of from) assert.ok(!d.removed.includes(id));
    for (const id of to) assert.ok(!d.added.includes(id));
  });

  test('변화가 필요한데 전후 비교가 비면 SilentReplanError', () => {
    const stopId = day.outings[0].stops[0].id;
    assert.throws(() => computeDayDelta(day, structuredClone(day), { requiredStopIds: [stopId] }), SilentReplanError);
  });

  test('변화가 필요 없으면 빈 전후 비교는 정상이다', () => {
    const d = computeDayDelta(day, structuredClone(day));
    assert.equal(d.hasVisibleChange, false);
    assert.deepEqual([d.removed, d.added, d.replaced, d.shortened, d.cancelledOutings, d.newDeadlines], [[], [], [], [], [], []]);
  });

  test('외출이 통째로 빠지면 취소된 외출로 기록된다', () => {
    const after = structuredClone(day);
    after.outings = after.outings.slice(1);
    const d = computeDayDelta(day, after);
    assert.deepEqual(d.cancelledOutings, [day.outings[0].id]);
    assert.equal(d.hasVisibleChange, true);
  });
});

describe('오늘 재계획 성질 — 시각·사건 조합 스윕 (재계획 규칙 2, 규칙 55)', () => {
  const visitDay = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(visitDay, { now: at(TODAY, '07:00') });
  const day0 = base.days[TODAY];
  const all = stopsOf(day0);
  const times = [];
  for (let m = 8 * 60 + 5; m <= 21 * 60; m += 41) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const occ = (o) => [mins(o.departAt), o.returnPlace === 'HOSPITAL' ? mins(o.returnBy) : mins(o.plannedReturnAt)];

  test('변화가 없으면 하루 중 어느 시각에 다시 계산해도 오늘 일정이 그대로다', () => {
    for (const t of times) {
      const day = plan(visitDay, { now: at(TODAY, t), previous: base.days, dates: [TODAY] }).days[TODAY];
      assert.deepEqual(day, day0, t);
    }
  });

  test('새 일정이 이미 다녀온 장소를 다시 고르면 그 정거장만 같은 종류의 다른 후보로 바꾼다(외출을 통째로 버리지 않는다)', () => {
    // 오전 외출 중(점심 식당 도착 전) 진료가 90분 당겨져 새 일정의 구조가 바뀐다. 새 일정의 저녁 외출이
    // 이미 오전 외출에 든 식당을 고르더라도 저녁 식사 칸은 다른 식당으로 채워져야 한다.
    const t = plus(day0.outings[0].stops[0].arriveAt, 1);
    const events = [{ type: 'APPOINTMENT', deltaMin: -90 }];
    const d = plan(visitDay, { now: at(TODAY, t), previous: base.days, dates: [TODAY], events }).days[TODAY];
    const dinner = d.mealSlots.find((m) => m.slot === 'DINNER');
    assert.equal(dinner.status, 'FILLED');
    const kept = d.outings.find((o) => o.id === day0.outings[0].id);
    assert.ok(!kept.stops.some((x) => x.id === dinner.stopId), '저녁 식당은 오전 외출의 장소가 아니다');
    const ids = stopsOf(d).map((x) => x.contentId);
    assert.equal(new Set(ids).size, ids.length, '같은 날 같은 장소는 한 번');
  });

  test('사건 조합마다 시작된 정거장은 그대로이고, 같은 사건을 다시 보내면 결과가 같다', () => {
    const eventSets = [
      [{ type: 'CLOSURE', closedIds: all.slice(0, 4).map((s) => s.contentId) }],
      [{ type: 'APPOINTMENT', deltaMin: -90 }],
      [{ type: 'APPOINTMENT', deltaMin: 120 }, { type: 'TRAFFIC_SURGE', extraMin: 40 }],
      [{ type: 'WEATHER' }, { type: 'TRAFFIC_SURGE', extraMin: 120 }],
      [{ type: 'PATIENT_RECALL' }],
    ];
    for (const t of times) {
      const m = mins(t);
      for (const events of eventSets) {
        const tag = `${t} ${JSON.stringify(events)}`;
        const input = { now: at(TODAY, t), dates: [TODAY], events };
        const r1 = plan(visitDay, { ...input, previous: base.days });
        const d = r1.days[TODAY];
        const stops = stopsOf(d);
        for (const x of all.filter((s) => mins(s.arriveAt) <= m)) assert.deepEqual(stops.find((y) => y.id === x.id), x, `${tag} ${x.id}`);
        for (const o of [...d.outings, ...d.guardianOutings]) {
          if (o.slackMin < 0) {
            assert.ok(o.stops.every((x) => mins(x.arriveAt) <= m), `${tag} 여유 음수는 시작된 정거장만 남은 외출뿐`);
            assert.ok(d.reasons.includes(REASON.SLA_INSUFFICIENT));
          } else if (o.stops.some((x) => mins(x.arriveAt) > m)) {
            assert.ok(mins(o.plannedReturnAt) <= mins(o.returnBy), `${tag} ${o.id}`);
          }
        }
        for (const g of d.guardianOutings) {
          for (const p of d.outings) {
            const [a, b] = occ(g);
            const [c, e] = occ(p);
            if (a > m || c > m) assert.ok(!(a < e && c < b), `${tag} 보호자 외출은 환자 외출과 겹치지 않는다`);
          }
        }
        // 채운 식사 칸은 그날 환자 외출의 식당 정거장을 가리키고, 식당 정거장마다 칸이 하나다
        const mealStops = d.outings.flatMap((o) => o.stops).filter((x) => x.isMeal).map((x) => x.id);
        const filled = d.mealSlots.filter((x) => x.status === 'FILLED').map((x) => x.stopId);
        assert.deepEqual([...filled].sort(), [...mealStops].sort(), `${tag} 식사 칸`);
        const r2 = plan(visitDay, { ...input, previous: { ...base.days, ...r1.days } });
        assert.deepEqual(r2.days, r1.days, `${tag} 멱등`);
      }
    }
  });
});
