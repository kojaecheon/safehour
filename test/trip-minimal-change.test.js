// AX-307 재검토: 최소 변경 재계획 (docs/business-rules.md '전체 일정 확정과 변화 대응'의 재계획 규칙 1~5, '하루 일정 생성'의 하루 한도, '숙소와 병원' 개정, '사용자 편집')
//
// 확정 일정은 바뀐 것이 없으면 그대로 둔다. 게이트를 여전히 통과하고 외출에 여전히 맞는 정거장은 제자리에 둔다.
// 통과하지 못한 정거장만 대체 → 체류 축소 → 제외 → 외출 취소 순으로 고친다. 오늘은 지금(now) 이후만 다시 짠다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON } from '../src/domain/states.js';
import { alternativesFor } from '../src/engine/alternatives.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { AIRPORT_TRAVEL, at, byLodging, contentIdsOf, mins, park, plus, stopsOf, tripPool, tripStay } from './trip-fixtures.js';

const TODAY = '2026-10-06';
const PROC = { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' };
const visit = (start) => ({ id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: TODAY, start, source: 'USER' });
const withVisit = (start, overrides = {}, items = {}) => tripStay(items, { appointments: [PROC, visit(start)], ...overrides });

function plan(s, opts = {}) {
  return planTrip({
    stay: s,
    candidatesByLodging: byLodging(opts.pool ?? tripPool('en')),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: at(TODAY, '07:00'),
    ...opts,
  });
}

/** 오늘만 재계획 — 다른 날짜의 배치는 usedContentIds (T15a 방식) */
function replanToday(s, previousDays, opts = {}) {
  const used = Object.entries(previousDays)
    .filter(([date]) => date !== TODAY)
    .flatMap(([, d]) => contentIdsOf(d));
  return plan(s, { dates: [TODAY], previous: previousDays, usedContentIds: used, ...opts }).days[TODAY];
}

const PER_DAY = { RELAXED: 3, NORMAL: 5 };
const assertDailyLimits = (day, pace, tag = '') => {
  assert.ok(day.outings.flatMap((o) => o.stops).length <= PER_DAY[pace], `${tag} 환자 하루 한도`);
  assert.ok(day.guardianOutings.flatMap((o) => o.stops).length <= PER_DAY[pace], `${tag} 보호자 하루 한도`);
};

describe('1 — 오늘은 지금 이후만 다시 짠다', () => {
  test('오늘을 처음 만드는 시각이 12:40 이어도 식당이 통과하면 점심·저녁 칸을 채운다', () => {
    const day = plan(tripStay(), { now: at(TODAY, '12:40'), dates: [TODAY] }).days[TODAY];
    for (const o of [...day.outings, ...day.guardianOutings]) assert.ok(mins(o.departAt) >= mins('12:40'), `${o.id} 는 지금 이후 출발`);
    assert.equal(day.mealSlots.find((m) => m.slot === 'LUNCH').status, 'FILLED');
    assert.equal(day.mealSlots.find((m) => m.slot === 'DINNER').status, 'FILLED');
  });

  test('교체해 고정한 저녁 식당은 통과하는 한 재계획(11:00, 교통 5분)에도 남는다', () => {
    const s = withVisit('13:00');
    const base = plan(s);
    const day = base.days[TODAY];
    const dinnerOuting = day.outings.find((o) => o.stops.some((x) => x.isMeal && mins(x.arriveAt) >= mins('17:30')));
    const dinner = dinnerOuting.stops.find((x) => x.isMeal);
    const [choice] = alternativesFor({
      stay: s, date: TODAY, day, outingId: dinnerOuting.id, stopId: dinner.id,
      candidatesByLodging: byLodging(tripPool('en')), airportTravel: AIRPORT_TRAVEL,
      usedContentIds: Object.entries(base.days).filter(([d]) => d !== TODAY).flatMap(([, d]) => contentIdsOf(d)),
      now: at(TODAY, '07:00'),
    });
    assert.ok(choice, '교체 후보가 있다');
    const swapped = { ...day, outings: day.outings.map((o) => (o.id === dinnerOuting.id ? choice.outingPreview : o)) };
    swapped.mealSlots = day.mealSlots.map((m) => (m.stopId === dinner.id ? { ...m, stopId: choice.stop.id } : m));
    const edits = { [TODAY]: { pinned: [choice.stop.contentId], deleted: [dinner.contentId], clearedMeals: [] } };
    const after = replanToday(s, { ...base.days, [TODAY]: swapped }, {
      now: at(TODAY, '11:00'), edits, events: [{ type: 'TRAFFIC_SURGE', extraMin: 5 }],
    });
    const kept = stopsOf(after).find((x) => x.contentId === choice.stop.contentId);
    assert.ok(kept, '고정한 저녁 식당이 남는다');
    assert.equal(kept.pinned, true);
    assert.equal(after.mealSlots.find((m) => m.slot === 'DINNER').stopId, kept.id);
  });
});

describe('교체 후 재계획 — 편집 기록만 보낸다(권장 흐름)', () => {
  test('교체를 편집 기록(고정·삭제)으로 보내면 고정 장소가 같은 자리에 들어가고 미리보기와 같으며 변경됨이 생기지 않는다', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const pool = tripPool('en', 120);
    const base = plan(s, { pool });
    const day = base.days[TODAY];
    const outing = day.outings.find((o) => o.stops.some((x) => !x.isMeal));
    const target = outing.stops.find((x) => !x.isMeal);
    const used = Object.entries(base.days).filter(([d]) => d !== TODAY).flatMap(([, d]) => contentIdsOf(d));
    const [choice] = alternativesFor({
      stay: s, date: TODAY, day, outingId: outing.id, stopId: target.id,
      candidatesByLodging: byLodging(pool), airportTravel: AIRPORT_TRAVEL, usedContentIds: used, now: at(TODAY, '07:00'),
    });
    const edits = { [TODAY]: { pinned: [choice.stop.contentId], deleted: [target.contentId], clearedMeals: [] } };
    const after = replanToday(s, base.days, { pool, edits });
    const same = after.outings.find((o) => o.id === outing.id);
    assert.deepEqual(same.stops.map((x) => [x.contentId, x.arriveAt]), choice.outingPreview.stops.map((x) => [x.contentId, x.arriveAt]));
    assert.equal(same.stops.find((x) => x.contentId === choice.stop.contentId).pinned, true);
    assert.equal(after.delta, undefined, '사용자 편집은 변경됨으로 알리지 않는다');
  });
});

describe('2 — 최소 변경: 통과하고 맞는 정거장은 제자리에 둔다', () => {
  test('진료가 60분 당겨져도(12:00) 병원에 닿거나 돌아올 수 있으면 외출을 취소하지 않는다', () => {
    // 16:00 진료가 15:00 으로 당겨진다. 오전 외출(진행 중)과 병원에서 끝나는 외출 모두 여전히 맞는다
    const s = withVisit('16:00', { pace: 'NORMAL' });
    const base = plan(s);
    assert.ok(base.days[TODAY].outings.some((o) => o.returnPlace === 'HOSPITAL'));
    const after = replanToday(s, base.days, { now: at(TODAY, '12:00'), events: [{ type: 'APPOINTMENT', deltaMin: -60 }] });
    // 환자 외출은 하나도 취소되지 않는다(보호자 외출은 환자 외출 사이 간격이 45분 미만이 되면 취소될 수 있다)
    assert.deepEqual(after.delta.cancelledOutings.filter((id) => id.includes(':P:')), []);
    assert.equal(after.outings.length, base.days[TODAY].outings.length);
    const hospital = after.outings.filter((o) => o.returnPlace === 'HOSPITAL');
    assert.equal(hospital.length, 1);
    assert.equal(hospital[0].returnBy, '15:00');
    assert.ok(after.delta.reasons.includes(REASON.APPOINTMENT_DELAYED));
  });

  test('출발 전 오전 외출의 점심 식당을 지워도(09:30) 외출은 남고, 손대지 않은 정거장은 제자리다(보호자로 옮기지 않는다)', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const base = plan(s);
    const day = base.days[TODAY];
    const lunchOuting = day.outings.find((o) => o.stops.some((x) => x.isMeal && mins(x.arriveAt) < mins('14:00')));
    const lunch = lunchOuting.stops.find((x) => x.isMeal);
    assert.ok(mins(lunchOuting.departAt) > mins('09:30'));
    const edits = { [TODAY]: { pinned: [], deleted: [lunch.contentId], clearedMeals: ['LUNCH'] } };
    const after = replanToday(s, base.days, { now: at(TODAY, '09:30'), edits });
    const same = after.outings.find((o) => o.stops.some((x) => x.id === lunchOuting.stops.find((y) => !y.isMeal)?.id));
    assert.ok(same, '오전 외출이 남는다');
    assert.deepEqual(
      same.stops.map((x) => x.contentId),
      lunchOuting.stops.filter((x) => x.id !== lunch.id).map((x) => x.contentId),
    );
    assert.deepEqual(after.guardianOutings.map((o) => o.stops.map((x) => x.contentId)), day.guardianOutings.map((o) => o.stops.map((x) => x.contentId)));
    assert.equal(after.mealSlots.find((m) => m.slot === 'LUNCH').status, 'CLEARED');
    assert.ok(!contentIdsOf(after).includes(lunch.contentId));
  });

  test('미래 날짜도 통과하지 못한 정거장만 바꾼다 — 나머지 환자·보호자 정거장은 같은 외출 같은 자리', () => {
    const s = tripStay({}, { interests: ['NATURE'], pace: 'NORMAL' });
    const parks = Array.from({ length: 6 }, (_, i) => park(String(7100 + i), { title: `테스트 공원 ${i}`, north: 0.4 + i * 0.3, east: -0.2 }));
    const pool = [...tripPool('en'), ...parks];
    const date = '2026-10-08';
    const base = plan(s, { pool, dates: [date] });
    const before = base.days[date];
    const outdoor = new Set(parks.map((p) => p.stop.contentId));
    assert.ok(contentIdsOf(before).some((id) => outdoor.has(id)));
    const after = plan(s, { pool, dates: [date], previous: base.days, weatherByDate: { [date]: { outdoorUnsafe: true } } }).days[date];
    for (const [role, list] of [['outings', 'P'], ['guardianOutings', 'G']]) {
      void list;
      before[role].forEach((o, i) => {
        o.stops.forEach((x, j) => {
          if (outdoor.has(x.contentId)) return;
          assert.equal(after[role][i]?.stops[j]?.contentId, x.contentId, `${role} ${o.id} #${j} 제자리`);
        });
      });
    }
    assert.ok(after.delta.reasons.includes(REASON.WEATHER_BLOCKED));
  });
});

describe('3 — 하루 정거장 한도는 합친 하루에도 지켜진다', () => {
  test('NORMAL, 진료 16:00, 10:40 휴무 사건 → 환자 5곳 이하', () => {
    const s = withVisit('16:00', { pace: 'NORMAL' });
    const base = plan(s);
    const closed = base.days[TODAY].outings.flatMap((o) => o.stops).slice(0, 3).map((x) => x.contentId);
    const after = replanToday(s, base.days, { now: at(TODAY, '10:40'), events: [{ type: 'CLOSURE', closedIds: closed }] });
    assertDailyLimits(after, 'NORMAL');
  });

  test('RELAXED, 진료 12:00, 60분 당김 → 하루 중 어느 시각에도 환자 3곳 이하', () => {
    const s = withVisit('12:00');
    const base = plan(s);
    for (let m = 8 * 60; m <= 20 * 60; m += 37) {
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const after = replanToday(s, base.days, { now: at(TODAY, t), events: [{ type: 'APPOINTMENT', deltaMin: -60 }] });
      assertDailyLimits(after, 'RELAXED', t);
    }
  });
});

describe('4 — 비운 식사 칸은 자동으로 다시 채우지 않는다', () => {
  test('진행 중인 외출의 점심 식당을 지우고 칸을 비우면 LUNCH 는 CLEARED 로 남는다', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const base = plan(s);
    const day = base.days[TODAY];
    const outing = day.outings.find((o) => o.stops.some((x) => x.isMeal && mins(x.arriveAt) < mins('14:00')));
    const lunch = outing.stops.find((x) => x.isMeal);
    const now = at(TODAY, plus(outing.departAt, 1));
    const edits = { [TODAY]: { pinned: [], deleted: [lunch.contentId], clearedMeals: ['LUNCH'] } };
    const after = replanToday(s, base.days, { now, edits });
    assert.equal(after.mealSlots.find((m) => m.slot === 'LUNCH').status, 'CLEARED');
    const lunchWindow = [mins('11:30'), mins('13:30')];
    for (const x of after.outings.flatMap((o) => o.stops)) {
      if (x.isMeal) assert.ok(!(mins(x.arriveAt) >= lunchWindow[0] && mins(x.arriveAt) <= lunchWindow[1]), '점심 칸에 식당이 없다');
    }
  });
});

describe('5 — 병원에서 끝나는 외출은 병원 일정마다 하나 (spec 4.3 개정)', () => {
  test('병원으로 가는 외출 중에 진료가 늦춰지면 새 외출을 더하지 않고 새 마감을 기록한다', () => {
    const s = withVisit('13:00', { pace: 'NORMAL' });
    const base = plan(s);
    const toHospital = base.days[TODAY].outings.find((o) => o.returnPlace === 'HOSPITAL');
    assert.ok(toHospital, '병원에서 끝나는 외출이 있다');
    for (const delta of [90, 120]) {
      const now = at(TODAY, plus(toHospital.stops.at(-1).arriveAt, 1));
      const after = replanToday(s, base.days, { now, events: [{ type: 'APPOINTMENT', deltaMin: delta }] });
      const hospitalOutings = after.outings.filter((o) => o.returnPlace === 'HOSPITAL');
      assert.equal(hospitalOutings.length, 1, `+${delta}: 병원에서 끝나는 외출은 하나`);
      assert.equal(hospitalOutings[0].id, toHospital.id);
      const newStart = plus('13:00', delta);
      assert.equal(hospitalOutings[0].returnBy, newStart);
      assert.ok(after.delta.newDeadlines.some((d) => d.outingId === toHospital.id && d.returnBy === newStart));
      const between = after.outings.filter((o) => mins(o.departAt) > mins(toHospital.departAt) && mins(o.departAt) < mins(newStart));
      assert.deepEqual(between, [], '옮긴 진료 전에 새 외출이 없다');
      assertDailyLimits(after, 'NORMAL', `+${delta}`);
    }
  });
});

describe('6 — 보이는 변화에는 사유가 있다', () => {
  test('사건·시각 조합마다 hasVisibleChange=true 인 전후 비교는 사유가 비지 않는다', () => {
    const s = withVisit('15:00', { pace: 'NORMAL' });
    const base = plan(s);
    const ids = base.days[TODAY].outings.flatMap((o) => o.stops.map((x) => x.contentId));
    const eventSets = [
      [{ type: 'TRAFFIC_SURGE', extraMin: 90 }],
      [{ type: 'CLOSURE', closedIds: ids.slice(0, 2) }],
      [{ type: 'APPOINTMENT', deltaMin: -120 }],
      [{ type: 'WEATHER' }, { type: 'TRAFFIC_SURGE', extraMin: 120 }],
    ];
    for (let m = 8 * 60 + 11; m <= 20 * 60; m += 53) {
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      for (const events of eventSets) {
        const d = replanToday(s, base.days, { now: at(TODAY, t), events }).delta;
        if (d?.hasVisibleChange) assert.ok(d.reasons.length > 0, `${t} ${JSON.stringify(events)}`);
      }
    }
  });
});
