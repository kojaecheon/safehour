// AX-307 — 재계획·전후 비교·데모 사건·즉시 복귀 (spec 4.9, 5.2 DayDelta)
//
// spec 10장 규칙 13, 30(재계획), 31, 50, 55 와 '시작된 정거장 보존'을 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createFallbackEstimator } from '../src/adapters/travelTime.js';
import { REASON, STATE } from '../src/domain/states.js';
import { SilentReplanError, computeDayDelta } from '../src/engine/dayDelta.js';
import { foldDemoEvents } from '../src/engine/tripEvents.js';
import { applyImmediateReturn, planTrip, regenerate } from '../src/engine/tripPlan.js';
import { CLINIC_POINT } from './day-plan-fixtures.js';
import { hospitalPeriod } from './stay-fixtures.js';
import {
  AIRPORT_TRAVEL,
  at,
  byLodging,
  contentIdsOf,
  mins,
  park,
  period,
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
    // 최소 변경은 그날·다른 날짜의 정거장을 옮기지 않으므로 남는 후보가 있어야 대체할 수 있다
    const pool = tripPool('en', 120);
    const wide = plan(s, { pool });
    const target = wide.days[TODAY].outings[0].stops[0];
    const day = replanToday(s, wide, { pool, events: [{ type: 'CLOSURE', closedIds: [target.contentId] }] });
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

  test('applyImmediateReturn — 체류를 주면 비운 외출의 예상 귀가·이동 합계를 남은 정거장으로 다시 계산한다', () => {
    const day = applyImmediateReturn(base.days[TODAY], { now, cause: 'PLAN_REVOKED', stay: linked() });
    const cutOuting = day.outings.find((o) => o.id === outing.id);
    assert.deepEqual(cutOuting.stops, [first]);
    assert.ok(mins(cutOuting.plannedReturnAt) < mins(outing.plannedReturnAt), '남은 정거장에서 바로 돌아온다');
    assert.ok(cutOuting.travelTotalMin < outing.travelTotalMin);
    const back = cutOuting.travelTotalMin - first.legIn.min;
    assert.equal(mins(cutOuting.plannedReturnAt), mins(first.leaveAt) + back);
    assert.equal(mins(cutOuting.returnBy) - mins(cutOuting.departAt) - requiredMin(cutOuting, { recovery: true }), cutOuting.slackMin);
  });
});

// 병원이 둘인 것은 정상이다 — 사용자가 넣은 병원에 연동 지침(데모)이 더한 병원이 붙는다.
// 즉시 복귀는 숫자가 가장 중요한 순간이므로, 복귀 병원을 '첫 번째 병원'으로 추측해서는 안 된다.
describe('규칙 13-1 — 즉시 복귀 재계산은 합성된 복귀 시각의 병원으로 한다', () => {
  /** 숙소 남동쪽 — H1(북쪽 2.2km)과 반대편이라 복귀 이동 추정이 확실히 다르다 */
  const SECOND_POINT = Object.freeze({ lat: 37.478, lng: 127.056 });
  const hospital = (id, point) => ({
    id,
    name: `테스트 병원 ${id}`,
    address: { roadAddress: `테스트로 ${id}`, lat: point.lat, lng: point.lng, source: 'DEMO' },
  });
  const twoHospitals = () =>
    stay({
      pace: 'NORMAL',
      hospitals: [hospital('H1', CLINIC_POINT), hospital('H2', SECOND_POINT)],
      periods: [
        period(
          { returnTime: { kind: 'SET', time: '16:30', place: 'HOSPITAL', hospitalId: 'H2' } },
          { startDate: '2026-10-04', endDate: '2026-10-10' },
        ),
      ],
    });
  const backMin = (stop, point) =>
    Math.ceil(createFallbackEstimator().estimate({ lat: Number(stop.lat), lng: Number(stop.lng) }, point).min);

  const s = twoHospitals();
  const base = plan(s);
  const day = base.days[TODAY];
  const outing = day.outings.find((o) => o.returnPlace === 'HOSPITAL' && o.deadlineReason === 'RETURN_TIME');
  assert.ok(outing, '병원으로 복귀하는 RETURN_TIME 외출이 있어야 한다');
  assert.ok(outing.stops.length >= 2, '비울 정거장이 남아야 한다');
  assert.equal(day.effective.returnTime.value.hospitalId, 'H2');
  const [first] = outing.stops;
  const now = at(TODAY, plus(first.arriveAt, 1));
  const cutOf = (target) => applyImmediateReturn(day, { now, cause: 'PLAN_REVOKED', stay: target }).outings.find((o) => o.id === outing.id);

  test('두 번째 병원으로 복귀하는 외출은 그 병원 좌표로 다시 계산한다', () => {
    const toSecond = backMin(first, SECOND_POINT);
    const toFirst = backMin(first, CLINIC_POINT);
    assert.notEqual(toSecond, toFirst, 'fixture 의 두 병원은 복귀 추정이 달라야 한다');
    const cut = cutOf(s);
    assert.deepEqual(
      cut.stops.map((x) => x.id),
      [first.id],
    );
    assert.equal(mins(cut.plannedReturnAt), mins(first.leaveAt) + toSecond);
    assert.equal(cut.travelTotalMin, first.legIn.min + toSecond);
  });

  test('복귀 병원을 찾을 수 없으면 추측하지 않고 외출 단위 값을 그대로 둔다', () => {
    const without = { ...s, hospitals: [hospital('H1', CLINIC_POINT)] };
    const cut = cutOf(without);
    assert.deepEqual(
      cut.stops.map((x) => x.id),
      [first.id],
      '정거장은 그대로 비운다',
    );
    assert.equal(cut.plannedReturnAt, outing.plannedReturnAt);
    assert.equal(cut.travelTotalMin, outing.travelTotalMin);
    assert.equal(cut.slackMin, outing.slackMin);
    assert.equal(cut.latestDepartureAt, outing.latestDepartureAt);
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

// findings 14: 해제가 아닌 전체 재계획(다시 만들기 forceFresh, 고칠 외출이 없는 needsFresh)도 해제 흐름처럼 보호자 외출을
// 다시 채운다. 남은 시간 일정은 하루 정거장 한도를 모르고 짜서 환자 외출이 뒤에서 잘리면 보호자 몫이 비던 문제
describe('해제가 아닌 전체 재계획도 하루 정거장 한도 안에서 보호자 외출을 지킨다 (findings 14)', () => {
  const withVisit = tripStay({}, {
    pace: 'NORMAL',
    appointments: [
      { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' },
      { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start: '15:00', source: 'USER' },
    ],
  });
  const base = plan(withVisit);
  const baseDay = base.days[TODAY];
  const used = Object.entries(base.days)
    .filter(([date]) => date !== TODAY)
    .flatMap(([, d]) => contentIdsOf(d));
  // 일정에 없는 장소의 휴무: 오늘 일정에 영향이 없는 사건
  const harmless = [{ type: 'CLOSURE', closedIds: ['NOT-IN-PLAN'] }];
  const evening = (d) => d.guardianOutings.filter((g) => mins(g.departAt) > mins('15:00'));
  const stopCount = (list) => list.reduce((n, o) => n + o.stops.length, 0);

  test('전제: 처음 일정에 보호자 저녁 외출이 있다', () => {
    assert.ok(evening(baseDay).length > 0);
  });

  test('13:00 다시 만들기(사건은 영향 없는 휴무): 환자 일정은 그대로이고 보호자 저녁 외출이 처음 일정대로 남는다', () => {
    const day = regenerate({
      stay: withVisit,
      candidatesByLodging: byLodging(tripPool('en')),
      airportTravel: AIRPORT_TRAVEL,
      lang: 'en',
      now: at(TODAY, '13:00'),
      previous: base.days,
      usedContentIds: used,
      events: harmless,
      scope: 'DAY',
      date: TODAY,
    }).days[TODAY];
    assert.deepEqual(day.outings, baseDay.outings, '환자 일정은 바뀌지 않는다');
    assert.deepEqual(evening(day), evening(baseDay), '보호자 저녁 외출은 처음 일정 그대로다');
    assert.ok(stopCount(day.guardianOutings) <= stopCount(baseDay.guardianOutings), '보호자 하루 정거장 수가 처음 일정을 넘지 않는다');
  });

  // 이 경로는 이어 받는 환자 외출이 없어(needsFresh 는 환자 외출이 없는 하루) 남은 시간 일정이 한도를 다 쓴다. 다시 채우기가
  // 들어가도 이미 출발한 보호자 외출과 지금 이후 보호자 외출이 그대로인지 지킨다
  test('13:00 고칠 외출이 없는 하루를 새로 짤 때(needsFresh): 출발한 보호자 외출은 그대로이고 보호자 저녁 외출이 있다', () => {
    const gOnly = { ...base.days, [TODAY]: { ...baseDay, outings: [], guardianOutings: baseDay.guardianOutings.slice(0, 1), mealSlots: [] } };
    const day = plan(withVisit, { dates: [TODAY], previous: gOnly, usedContentIds: used, now: at(TODAY, '13:00'), events: harmless }).days[TODAY];
    assert.ok(day.outings.length > 0, '전제: 환자 외출을 새로 짰다');
    assert.deepEqual(day.guardianOutings[0], baseDay.guardianOutings[0], '이미 출발한 보호자 외출은 그대로다');
    assert.ok(evening(day).length > 0, '보호자 저녁 외출이 있다');
    const placed = stopsOf(day).map((x) => x.contentId);
    assert.equal(new Set(placed).size, placed.length, '같은 장소를 두 번 쓰지 않는다');
  });
});

// findings 15: 다시 만들기(regenerate, forceFresh)는 닫힌 정거장을 고치지 않고 새로 짜서 수리 기록에 휴무 사유가 남지 않는다.
// 이때 하루 정거장 한도로 새 일정 끝을 자른 기록(사용자 입력 몫)만 남으면 '사용자 편집만이 원인'으로 읽혀, 닫힌 장소가 빠진
// 실제 변화가 보이지 않는 변화로 바뀌고 SilentReplanError 가 났다. 반드시 바뀌어야 하는 정거장이 있으면 사용자 편집만의 변화가 아니다
describe('다시 만들기는 오늘 계획된 장소가 닫혀도 예외 없이 빠진 곳을 전후 비교에 적는다 (findings 15)', () => {
  const s = tripStay({}, { pace: 'NORMAL' });

  /** 오늘만 다시 만들기: 다른 날짜의 배치는 usedContentIds 로 싣는다 */
  function regenerateToday(base, { pool, now, closedIds }) {
    const used = Object.entries(base.days)
      .filter(([date]) => date !== TODAY)
      .flatMap(([, d]) => contentIdsOf(d));
    const input = {
      stay: s,
      candidatesByLodging: byLodging(pool),
      airportTravel: AIRPORT_TRAVEL,
      lang: 'en',
      now,
      previous: base.days,
      usedContentIds: used,
      events: [{ type: 'CLOSURE', closedIds }],
    };
    return {
      regen: regenerate({ ...input, scope: 'DAY', date: TODAY }).days[TODAY],
      server: planTrip({ ...input, dates: [TODAY] }).days[TODAY],
    };
  }

  /** 닫힌 정거장이 모두 빠졌고, 빠진 곳(또는 대체된 곳)으로 전후 비교에 적혔다 */
  function assertClosedStopsReported(day, closedStops) {
    const placed = new Set(stopsOf(day).map((x) => x.id));
    const d = day.delta;
    assert.ok(d, '전후 비교가 있다');
    assert.equal(d.hasVisibleChange, true);
    assert.ok(d.reasons.includes(REASON.CLOSED), '빠진 원인(휴무)을 적는다');
    const reported = new Set([...d.removed, ...d.replaced.map((r) => r.from)]);
    for (const x of closedStops) {
      assert.ok(!placed.has(x.id), `닫힌 정거장 ${x.id} 은 남지 않는다`);
      assert.ok(reported.has(x.id), `닫힌 정거장 ${x.id} 이 빠진 곳으로 적힌다`);
    }
  }

  test('09:30 오늘 첫 환자 외출의 세 곳이 닫히면: 예외 없이 그 세 곳이 빠진 곳으로 적힌다', () => {
    const pool = tripPool('en');
    const base = plan(s, { pool, dates: [TODAY] });
    const closed = base.days[TODAY].outings[0].stops;
    assert.equal(closed.length, 3, '전제: 첫 외출은 세 곳이다');
    const { regen, server } = regenerateToday(base, { pool, now: at(TODAY, '09:30'), closedIds: closed.map((x) => x.contentId) });
    assertClosedStopsReported(regen, closed);
    assertClosedStopsReported(server, closed);
  });

  test('13:00 오늘 계획된 장소가 모두 닫히면: 아직 도착하지 않은 곳은 모두 빠진 곳으로 적힌다', () => {
    const pool = tripPool('en');
    const base = plan(s, { pool, dates: [TODAY] });
    const all = stopsOf(base.days[TODAY]);
    const pending = all.filter((x) => mins(x.arriveAt) > mins('13:00'));
    assert.ok(pending.length > 0, '전제: 13:00 이후 도착할 곳이 있다');
    const { regen } = regenerateToday(base, { pool, now: at(TODAY, '13:00'), closedIds: all.map((x) => x.contentId) });
    assertClosedStopsReported(regen, pending);
  });

  // 이 경우는 수정 전에도 예외가 없었다(3곳 풀이라 한도로 자르는 기록이 없어 userEditOnly 가 거짓). 비운 하루를 어떻게 적는지 지키는 가드다.
  test('대체할 곳이 하나도 없으면(수정 전에도 통과, 기존 동작 가드): 지어낸 정거장 없이 하루를 비운 것으로 적는다(빠진 곳·취소된 외출, 들어온 곳 없음)', () => {
    const pool = tripPool('en', 3);
    const base = plan(s, { pool, dates: [TODAY] });
    const closed = stopsOf(base.days[TODAY]);
    assert.equal(closed.length, 3, '전제: 오늘 계획된 장소는 세 곳뿐이다');
    for (const now of ['09:30', '10:00']) {
      const { regen, server } = regenerateToday(base, { pool, now: at(TODAY, now), closedIds: closed.map((x) => x.contentId) });
      for (const day of [regen, server]) {
        assert.deepEqual(day.outings, []);
        assert.deepEqual(day.guardianOutings, []);
        assert.deepEqual(day.delta.added, []);
        assert.deepEqual(day.delta.replaced, []);
        assert.deepEqual(new Set(day.delta.removed), new Set(closed.map((x) => x.id)));
        assert.deepEqual(day.delta.cancelledOutings, base.days[TODAY].outings.map((o) => o.id));
        assertClosedStopsReported(day, closed);
      }
    }
  });

  test('computeDayDelta: 반드시 바뀌어야 하는 정거장이 빠졌으면 userEditOnly 여도 보이는 변화다. 남았거나 아무것도 바뀌지 않았으면 그대로 예외다', () => {
    const base = plan(s);
    const day = base.days[TODAY];
    const target = day.outings[0].stops[0];
    const after = structuredClone(day);
    after.outings[0].stops = after.outings[0].stops.slice(1);
    const d = computeDayDelta(day, after, { requiredStopIds: [target.id], userEditOnly: true, userDrivenIds: ['X:G:1'] });
    assert.equal(d.hasVisibleChange, true);
    assert.deepEqual(d.removed, [target.id]);
    // 결함은 그대로 예외: 바뀌어야 하는 정거장이 남음, 바뀌어야 하는데 아무것도 바뀌지 않음
    assert.throws(() => computeDayDelta(day, structuredClone(day), { requiredStopIds: [target.id], userEditOnly: true }), SilentReplanError);
    const ghost = `${TODAY}:P:NOT-IN-PLAN`;
    assert.throws(() => computeDayDelta(day, structuredClone(day), { requiredStopIds: [ghost], userEditOnly: true }), SilentReplanError);
    // 원인 없는 사용자 편집만이면 여전히 보이는 변화가 아니다
    assert.equal(computeDayDelta(day, after, { userEditOnly: true, userDrivenIds: [target.id] }).hasVisibleChange, false);
  });
});
