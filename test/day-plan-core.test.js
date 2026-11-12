// AX-306 · 하루 일정 엔진: 틀·마감·복귀 계산·날짜 상태·보호자 (docs/business-rules.md '숙소와 병원'·'하루 일정 생성', docs/contracts.md '`POST /api/itinerary/plan`'의 DayPlan)
//
// docs/business-rules.md '체류'·'숙소와 병원'·'날짜 분류'·'하루 일정 생성'의 규칙을 고정한다
// (테스트 이름의 규칙 5, 9, 10, 13-1, 13-2, 14~20, 53 은 옛 설계서 번호다).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createFallbackEstimator } from '../src/adapters/travelTime.js';
import { REASON, STATE } from '../src/domain/states.js';
import { planDay, planStayDay } from '../src/engine/dayPlan.js';
import { guardianGateCondition } from '../src/engine/stopCandidate.js';
import { classifyDate, dayWindow, fromMinutes } from '../src/stay/index.js';
import {
  AIRPORT_TRAVEL,
  CLINIC_POINT,
  HOME,
  SET,
  UNKNOWN,
  allStops,
  cafe,
  mins,
  museum,
  period,
  place,
  restaurant,
  restrictedStay,
  shop,
  stay,
} from './day-plan-fixtures.js';

const taxi = createFallbackEstimator();
const plan = (s, date, opts = {}) => planStayDay(s, date, { airportTravel: AIRPORT_TRAVEL, ...opts });

/** 기본 후보 묶음 — 숙소 1~2km 안의 실내 장소·식당·카페 */
function basics() {
  return [
    museum('301', { title: '테스트 미술관', north: 1.0 }),
    shop('302', { title: '테스트 상가', north: 1.2, east: 0.4 }),
    museum('303', { title: '테스트 기념관', north: -1.1 }),
    restaurant('101', { title: '테스트 한식당', north: 1.3 }),
    restaurant('102', { title: '테스트 국수집', north: -1.3 }),
    cafe('201', { title: '테스트 찻집', north: 0.9, east: 0.5 }),
  ];
}

/** 외출의 복귀 계산식 required (docs/business-rules.md '하루 일정 생성') */
function required(outing, { recovery }) {
  const stays = outing.stops.reduce((s, x) => s + x.stayMin, 0);
  const travel = outing.travelTotalMin;
  return 5 + travel + stays + Math.ceil(travel * 0.25) + 10 + (recovery ? 10 : 0);
}

/** 외출 마지막 구간(복귀) 이동 추정 */
const returnLegMin = (outing) => outing.travelTotalMin - outing.stops.reduce((s, x) => s + x.legIn.min, 0);

/** 외출의 실제 복귀 도착 시각(분) */
function actualReturnMin(outing) {
  const last = outing.stops[outing.stops.length - 1];
  return mins(last.leaveAt) + returnLegMin(outing);
}

function assertSlaHolds(day, { recovery }) {
  for (const outing of [...day.outings, ...day.guardianOutings]) {
    const req = required(outing, { recovery: recovery && day.outings.includes(outing) });
    assert.equal(mins(outing.returnBy) - mins(outing.departAt) - req, outing.slackMin, `${outing.id} slack`);
    assert.ok(outing.slackMin >= 0, `${outing.id} 는 복귀 계산식을 만족해야 한다`);
    assert.equal(outing.latestDepartureAt, fromMinutes(mins(outing.returnBy) - req));
    for (const stop of outing.stops) assert.ok(stop.stayMin >= 15, `${stop.id} 체류 15분 이상`);
  }
}

describe('DayPlan 모양 (spec 5.2)', () => {
  test('필수 필드를 모두 채우고 정거장 id 는 date:role:contentId 다', () => {
    const day = plan(stay(), '2026-10-02', { candidates: basics() });
    for (const key of [
      'date', 'coverage', 'dayState', 'reasons', 'window', 'lodgingId', 'transportMode', 'effective',
      'blocks', 'outings', 'guardianOutings', 'mealSlots', 'excluded', 'warnings', 'returnNow',
    ]) {
      assert.ok(key in day, `${key} 가 있어야 한다`);
    }
    assert.equal(day.date, '2026-10-02');
    assert.equal(day.lodgingId, 'L1');
    assert.equal(day.returnNow, false);
    assert.deepEqual(day.window, { start: '09:00', end: '21:00' });
    assert.deepEqual(day.mealSlots.map((m) => m.slot), ['LUNCH', 'DINNER']);
    assert.ok(day.outings.length > 0);

    const stop = day.outings[0].stops[0];
    assert.equal(stop.id, `2026-10-02:P:${stop.contentId}`);
    for (const key of [
      'candidateId', 'contentId', 'title', 'address', 'lang', 'category', 'isMeal', 'lat', 'lng', 'ko',
      'sourceIds', 'contentTypeIds', 'arriveAt', 'leaveAt', 'stayMin', 'shortened', 'legIn', 'walkBurdenMin',
      'indoor', 'pinned', 'labels',
    ]) {
      assert.ok(key in stop, `Stop.${key} 가 있어야 한다`);
    }
    assert.equal(stop.legIn.estimated, true);
    assert.ok(['WALK', 'TAXI', 'TRANSIT'].includes(stop.legIn.mode));
    assert.ok(stop.labels.includes('HOURS_UNCONFIRMED'), '열려 있다고 단정하지 않는다');
    assert.ok(day.warnings.includes('TRAVEL_TIMES_ESTIMATED'));

    const outing = day.outings[0];
    for (const key of [
      'id', 'departAt', 'returnBy', 'returnPlace', 'deadlineReason', 'latestDepartureAt', 'slackMin',
      'walkTotalMin', 'travelTotalMin', 'stops',
    ]) {
      assert.ok(key in outing, `Outing.${key} 가 있어야 한다`);
    }
  });

  test('시각은 모두 HH:MM 이고 정거장은 시간 순이다', () => {
    const day = plan(stay(), '2026-10-02', { candidates: basics() });
    const hhmm = /^\d{2}:\d{2}$/;
    let last = -1;
    for (const outing of day.outings) {
      assert.match(outing.departAt, hhmm);
      assert.ok(mins(outing.departAt) >= last);
      for (const stop of outing.stops) {
        assert.ok(mins(stop.arriveAt) >= mins(outing.departAt));
        assert.equal(mins(stop.leaveAt) - mins(stop.arriveAt), stop.stayMin);
      }
      last = actualReturnMin(outing);
    }
  });
});

describe('규칙 5 — 경계일 전 빈 날짜(FREE)', () => {
  test('병원 조건 없이 일정이 만들어지고 회복기 가산이 없으며 대중교통 추정이다', () => {
    const sauna = place('401', { title: '테스트 찜질방', type: '28', north: 1.1, tags: { indoor: true } });
    const day = plan(stay(), '2026-10-02', { candidates: [...basics(), sauna] });
    assert.equal(day.coverage, 'FREE');
    assert.equal(day.transportMode, 'TRANSIT');
    assert.equal(day.dayState, STATE.TOGETHER);
    assert.ok(day.outings.length > 0);
    assertSlaHolds(day, { recovery: false });
    for (const stop of allStops(day)) assert.ok(['WALK', 'TRANSIT'].includes(stop.legIn.mode));
    // 병원 조건 게이트가 없다 — 열 노출 단서가 있어도 제외 사유가 아니다
    assert.ok(!day.excluded.some((e) => e.candidateId === '401'));
  });

  test('FREE·DECLARED_FREE 날에는 보호자 단독 외출이 없다', () => {
    const free = plan(stay(), '2026-10-02', { candidates: basics() });
    assert.equal(free.guardianOutings.length, 0);
    const declared = stay({
      periods: [period({}, { noRestriction: true, startDate: '2026-10-05', endDate: '2026-10-05' })],
    });
    const day = plan(declared, '2026-10-05', { candidates: basics() });
    assert.equal(day.coverage, 'DECLARED_FREE');
    assert.equal(day.transportMode, 'TRANSIT');
    assert.equal(day.guardianOutings.length, 0);
    assertSlaHolds(day, { recovery: false });
  });

  test('RESTRICTED 날의 환자 외출은 회복기 가산 10분을 더하고 택시 추정이다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    assert.equal(day.coverage, 'RESTRICTED');
    assert.equal(day.transportMode, 'TAXI');
    assert.ok(day.outings.length > 0);
    assertSlaHolds(day, { recovery: true });
    for (const stop of day.outings.flatMap((o) => o.stops)) assert.ok(['WALK', 'TAXI'].includes(stop.legIn.mode));
  });
});

describe('규칙 9 — 외출 불가(REST_DAY)', () => {
  test('환자 외출 0개, 보호자 조건이 맞으면 SPLIT_NEARBY', () => {
    const s = restrictedStay({ outing: 'FORBIDDEN' });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.equal(day.coverage, 'REST_DAY');
    assert.equal(day.outings.length, 0);
    assert.ok(day.guardianOutings.length > 0);
    assert.equal(day.dayState, STATE.SPLIT_NEARBY);
    assert.ok(day.reasons.includes(REASON.OUTING_FORBIDDEN));
    for (const outing of day.guardianOutings) {
      assert.equal(outing.returnPlace, 'LODGING');
      assert.ok(['PATIENT_SCHEDULE', 'DAY_END'].includes(outing.deadlineReason));
      for (const stop of outing.stops) {
        assert.equal(stop.id, `2026-10-05:G:${stop.contentId}`);
        assert.equal(stop.legIn.mode === 'TRANSIT', false, '보호자 이동은 택시 추정');
      }
    }
    assertSlaHolds(day, { recovery: false });
  });

  test('보호자 외출은 환자 조건 값과 무관하다: 보행·이동 한도, 자외선·열·물, 식이, 금식이 가장 엄격해도 같은 외출이 나온다', () => {
    // docs/business-rules.md '하루 일정 생성': 보호자 외출에는 환자 조건을 적용하지 않는다(guardianGateCondition 은 빈 조건,
    // 조립 단계의 보행·이동 한도와 금식 시각도 보호자에게는 없다). 환자가 쉬는 날(외출 불가)의 보호자 외출을 견준다
    const candidates = basics();
    const lenient = plan(restrictedStay({ outing: 'FORBIDDEN' }), '2026-10-05', { candidates });
    const strict = plan(
      restrictedStay({
        outing: 'FORBIDDEN',
        walkLimit: SET(5),
        travelLimit: SET(5),
        avoidUv: SET(true),
        avoidHeat: SET(true),
        avoidWater: SET(true),
        mealRestriction: SET({ mode: 'ALL_DAY' }),
        diet: { spicy: SET(true), alcohol: SET(true), hard: SET(true), hot: SET(true), raw: SET(true) },
      }),
      '2026-10-05',
      { candidates },
    );
    assert.equal(strict.coverage, 'REST_DAY');
    assert.equal(strict.outings.length, 0);
    assert.ok(lenient.guardianOutings.length > 0, '견줄 보호자 외출이 있어야 한다');
    const shape = (day) =>
      day.guardianOutings.map((o) => ({
        departAt: o.departAt,
        returnBy: o.returnBy,
        stops: o.stops.map((x) => [x.contentId, x.arriveAt, x.leaveAt]),
      }));
    assert.deepEqual(shape(strict), shape(lenient));
    assert.ok(allStops(lenient).length > 0);
    // 게이트에 넘기는 보호자 조건은 비어 있다: 실내 전용·금식(하루 종일)·자외선·열·물·식이가 게이트에서 모두 빠진다
    assert.deepEqual(guardianGateCondition(), {});
    // 같은 조건이 환자에게는 실제로 걸린다(외출이 허용된 날에도 환자 외출이 없다). 그래서 위 비교가 뜻이 있다
    const patientUnderStrict = plan(
      restrictedStay({ walkLimit: SET(5), travelLimit: SET(5), avoidUv: SET(true), mealRestriction: SET({ mode: 'ALL_DAY' }) }),
      '2026-10-05',
      { candidates },
    );
    assert.equal(patientUnderStrict.outings.length, 0);
  });

  test('곁을 지켜야 하면 보호자 외출도 없고 NO_TOURISM', () => {
    const s = restrictedStay({ outing: 'FORBIDDEN', guardianMustStay: SET(true) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.equal(day.outings.length + day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.OUTING_FORBIDDEN));
  });

  test('동행 필수라서 보호자 단독 외출이 잠기면 그 이유를 남긴다', () => {
    const s = restrictedStay({ outing: 'FORBIDDEN', escortRequired: SET(true), guardianMustStay: SET(true) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.equal(day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.ESCORT_REQUIRED));
  });
});

describe('규칙 10 — 동행 필수인데 보호자 없음', () => {
  test('환자 외출 0개, ESCORT_REQUIRED, NO_TOURISM', () => {
    const s = restrictedStay({ escortRequired: SET(true), guardianMustStay: SET(true) }, { hasCompanion: false });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.equal(day.outings.length, 0);
    assert.equal(day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.ESCORT_REQUIRED));
  });

  test('보호자가 있으면 같은 조건에서 환자 외출이 만들어진다', () => {
    const s = restrictedStay({ escortRequired: SET(true), guardianMustStay: SET(true) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(day.outings.length > 0);
    assert.equal(day.dayState, STATE.TOGETHER);
  });
});

describe('규칙 13-1 — 병원 복귀 시각은 그 병원 좌표로 계산한다', () => {
  test('마지막 외출은 병원에서 끝나고 복귀 구간은 병원까지의 추정이다', () => {
    const s = restrictedStay({ returnTime: { kind: 'SET', time: '15:00', place: 'HOSPITAL', hospitalId: 'H1' } });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    const last = day.outings[day.outings.length - 1];
    assert.ok(last, '외출이 있어야 한다');
    assert.equal(last.returnPlace, 'HOSPITAL');
    assert.equal(last.deadlineReason, 'RETURN_TIME');
    assert.equal(last.returnBy, '15:00');
    const lastStop = last.stops[last.stops.length - 1];
    assert.equal(returnLegMin(last), taxi.estimate(lastStop, CLINIC_POINT).min);
    for (const outing of day.outings) assert.ok(mins(outing.returnBy) <= mins('15:00'));
    assertSlaHolds(day, { recovery: true });
  });
});

describe('규칙 13-2 — 다음 고정 블록이 병원 일정인 외출', () => {
  const withVisit = (start) =>
    restrictedStay({}, {
      appointments: [
        { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' },
        { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start },
      ],
    });

  test('그 병원에서 끝나고 마감은 일정 시작, 블록은 일정 시작부터, 도착 여유는 한 번만', () => {
    const day = plan(withVisit('15:00'), '2026-10-05', { candidates: basics() });
    // 병원 일정 바로 앞 외출(마지막 외출)이 그 병원에서 끝난다
    const before = day.outings.find((o) => o.returnPlace === 'HOSPITAL');
    assert.ok(before, '병원 일정 전 외출이 있어야 한다');
    assert.equal(before.deadlineReason, 'APPOINTMENT');
    assert.equal(before.returnBy, '15:00');
    const lastBefore = day.outings.filter((o) => mins(o.departAt) < mins('15:00')).at(-1);
    assert.equal(lastBefore, before, '병원에서 끝나는 외출이 일정 전 마지막 외출이다');
    const lastStop = before.stops[before.stops.length - 1];
    assert.equal(returnLegMin(before), taxi.estimate(lastStop, CLINIC_POINT).min);
    // 도착 여유 10분 한 번 + 회복기 10분 — 블록에 이동·여유를 다시 넣지 않는다
    assertSlaHolds(day, { recovery: true });

    const block = day.blocks.find((b) => b.kind === 'APPOINTMENT');
    assert.equal(block.appointmentId, 'A-VISIT');
    assert.equal(block.start, '15:00');
    const back = taxi.estimate(CLINIC_POINT, HOME).min;
    assert.equal(block.end, fromMinutes(mins('15:00') + 90 + back));
    for (const outing of day.outings) {
      const end = mins(outing.plannedReturnAt);
      const overlaps = mins(outing.departAt) < mins(block.end) && end > mins(block.start);
      assert.ok(!overlaps, `${outing.id} 가 병원 일정 블록 안에 있다`);
    }
  });

  test('직전 외출이 없으면 블록은 시작 − 이동 − 10분부터다 (45분 미만 창)', () => {
    const day = plan(withVisit('09:40'), '2026-10-05', { candidates: basics() });
    const block = day.blocks.find((b) => b.kind === 'APPOINTMENT');
    const to = taxi.estimate(HOME, CLINIC_POINT).min;
    assert.equal(block.start, fromMinutes(mins('09:40') - to - 10));
    assert.ok(!day.outings.some((o) => o.deadlineReason === 'APPOINTMENT'));
  });
});

describe('병원에서 끝나는 창 — 마지막 외출은 마감에 맞춰 거꾸로 짜고, 앞부분은 숙소로 돌아오는 외출', () => {
  const visitAt = (start, items = {}) =>
    restrictedStay(items, {
      appointments: [
        { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' },
        { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start },
      ],
    });
  const lodgingDeadline = (start) => fromMinutes(mins(start) - taxi.estimate(HOME, CLINIC_POINT).min - 10);
  /** 복귀 계산식의 버퍼(교통 변동 25%·도착 여유·회복기) — 계획 도착과 마감 사이에 남는 것은 이것뿐이다 */
  const buffers = (o, recovery = true) => Math.ceil(o.travelTotalMin * 0.25) + 10 + (recovery ? 10 : 0);

  function assertFinalHugsDeadline(day, deadline) {
    const toHospital = day.outings.filter((o) => o.returnPlace === 'HOSPITAL');
    assert.equal(toHospital.length, 1, '병원에서 끝나는 외출은 하나');
    const final = toHospital[0];
    assert.equal(final.returnBy, deadline);
    assert.equal(final.slackMin, 0, '마감에 맞춰 거꾸로 짠다');
    assert.equal(final.departAt, final.latestDepartureAt);
    assert.equal(mins(final.returnBy) - mins(final.plannedReturnAt), buffers(final));
    const lastStop = final.stops[final.stops.length - 1];
    assert.equal(returnLegMin(final), taxi.estimate(lastStop, CLINIC_POINT).min, '병원 좌표로 복귀를 계산한다');
    return final;
  }

  test('15:00 병원 일정: 오전 외출은 점심을 넣고 숙소로, 마지막 외출은 15:00 직전에 병원에 닿는다', () => {
    const day = plan(visitAt('15:00'), '2026-10-05', { candidates: basics() });
    const final = assertFinalHugsDeadline(day, '15:00');

    const morning = day.outings.filter((o) => o.returnPlace === 'LODGING' && mins(o.departAt) < mins('15:00'));
    assert.ok(morning.length >= 1, '앞부분에 숙소로 돌아오는 외출이 있어야 한다');
    for (const o of morning) {
      assert.equal(o.deadlineReason, 'APPOINTMENT');
      assert.equal(o.returnBy, lodgingDeadline('15:00'), '숙소 복귀 마감 = 일정 시작 − 숙소→병원 − 도착 여유');
      assert.ok(mins(o.plannedReturnAt) <= mins(final.departAt), '마지막 외출 출발 전에 숙소로 돌아온다');
    }
    const lunch = day.mealSlots.find((m) => m.slot === 'LUNCH');
    assert.equal(lunch.status, 'FILLED', '병원에서 끝나는 창이라는 이유로 식사 칸을 비우지 않는다');
    assert.ok(morning.some((o) => o.stops.some((x) => x.id === lunch.stopId && x.isMeal)));

    const block = day.blocks.find((b) => b.kind === 'APPOINTMENT');
    assert.equal(block.start, '15:00', '직전 외출이 병원에서 끝나므로 블록은 일정 시작부터');
    assertSlaHolds(day, { recovery: true });
  });

  test('병원 복귀 시각(RETURN_TIME)도 같은 방식이다', () => {
    const s = restrictedStay({ returnTime: { kind: 'SET', time: '15:00', place: 'HOSPITAL', hospitalId: 'H1' } });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    const final = assertFinalHugsDeadline(day, '15:00');
    assert.equal(final.deadlineReason, 'RETURN_TIME');
    const morning = day.outings.filter((o) => o.returnPlace === 'LODGING');
    assert.ok(morning.length >= 1);
    for (const o of morning) {
      assert.equal(o.deadlineReason, 'RETURN_TIME');
      assert.equal(o.returnBy, lodgingDeadline('15:00'));
    }
    assert.equal(day.mealSlots.find((m) => m.slot === 'LUNCH').status, 'FILLED');
    assertSlaHolds(day, { recovery: true });
  });

  test('식사 칸이 일정 바로 앞이면 마지막 외출이 식사를 하고 병원으로 간다', () => {
    const day = plan(visitAt('13:00'), '2026-10-05', { candidates: basics() });
    const final = day.outings.find((o) => o.returnPlace === 'HOSPITAL');
    assert.ok(final);
    const lunch = day.mealSlots.find((m) => m.slot === 'LUNCH');
    assert.equal(lunch.status, 'FILLED');
    assert.ok(final.stops.some((x) => x.id === lunch.stopId && x.isMeal));
    assert.ok(mins(final.returnBy) - mins(final.plannedReturnAt) >= buffers(final));
    assert.ok(mins(final.returnBy) - mins(final.plannedReturnAt) - buffers(final) < 60, '병원에 한참 일찍 닿지 않는다');
    assertSlaHolds(day, { recovery: true });
  });

  test('식사가 없는 날에도 앞부분은 숙소 복귀 외출, 마지막은 마감에 맞춘다', () => {
    const day = plan(visitAt('17:00', { mealRestriction: SET({ mode: 'ALL_DAY' }) }), '2026-10-05', {
      candidates: basics(),
    });
    assertFinalHugsDeadline(day, '17:00');
    assert.ok(day.outings.some((o) => o.returnPlace === 'LODGING' && mins(o.departAt) < mins('17:00')));
    assertSlaHolds(day, { recovery: true });
  });
});

describe('Outing.plannedReturnAt — 계획상 복귀 도착 (returnBy 는 안전 마감)', () => {
  test('모든 외출에 있고, 마지막 정거장 출발 + 복귀 구간이며 returnBy 이하다', () => {
    for (const [s, date] of [
      [restrictedStay(), '2026-10-05'],
      [stay(), '2026-10-02'],
      [restrictedStay({ outing: 'FORBIDDEN' }), '2026-10-05'],
    ]) {
      const day = plan(s, date, { candidates: basics() });
      const all = [...day.outings, ...day.guardianOutings];
      assert.ok(all.length > 0);
      for (const o of all) {
        assert.match(o.plannedReturnAt, /^\d{2}:\d{2}$/);
        assert.equal(mins(o.plannedReturnAt), actualReturnMin(o));
        assert.ok(mins(o.plannedReturnAt) <= mins(o.returnBy));
      }
    }
  });
});

describe('검토 후속 — 체류 하한·병원 블록 안 복귀·쉬는 날 상태', () => {
  test('A. 원하는 체류가 15분보다 짧아도 정거장 체류는 15분이다 (규칙 19)', () => {
    const short = museum('351', { title: '테스트 작은 전시관', north: 1.0, tags: { stayMin: 10 } });
    const day = plan(restrictedStay({}, { hasCompanion: false }), '2026-10-05', { candidates: [short] });
    const stop = day.outings.flatMap((o) => o.stops).find((x) => x.contentId === '351');
    assert.ok(stop, '배치되어야 한다');
    assert.equal(stop.stayMin, 15);
    assert.equal(mins(stop.leaveAt) - mins(stop.arriveAt), 15);
    assertSlaHolds(day, { recovery: true });
  });

  const withVisit = (items, start = '15:00') =>
    restrictedStay(items, {
      appointments: [
        { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' },
        { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start },
      ],
    });

  for (const [label, items] of [
    ['숙소 복약 14:55', { medication: SET([{ time: '14:55', atLodging: true }]) }],
    ['숙소 복귀 시각 14:55', { returnTime: { kind: 'SET', time: '14:55', place: 'LODGING' } }],
  ]) {
    test(`B. ${label} + 15:00 병원 일정: 숙소 복귀 마감이 병원 블록 시작으로 당겨진다`, () => {
      const day = plan(withVisit(items), '2026-10-05', { candidates: basics() });
      const block = day.blocks.find((b) => b.kind === 'APPOINTMENT');
      const blockStart = mins('15:00') - taxi.estimate(HOME, CLINIC_POINT).min - 10;
      assert.equal(block.start, fromMinutes(blockStart), '직전 외출이 병원에서 끝나지 않으므로 블록은 시작 − 이동 − 10분');
      assert.ok(day.outings.length > 0);
      for (const o of day.outings) {
        if (mins(o.departAt) < blockStart) {
          assert.ok(mins(o.returnBy) <= blockStart, `${o.id} returnBy ${o.returnBy} 가 블록 안이다`);
          assert.ok(mins(o.plannedReturnAt) <= blockStart);
        } else {
          assert.ok(mins(o.departAt) >= mins(block.end), `${o.id} 는 블록이 끝난 뒤에 출발해야 한다`);
        }
      }
      const capped = day.outings.find((o) => o.returnBy === fromMinutes(blockStart));
      assert.ok(capped, '블록 시작이 마감인 외출이 있어야 한다');
      assert.equal(capped.deadlineReason, 'APPOINTMENT');
      assert.equal(capped.returnPlace, 'LODGING');
      assertSlaHolds(day, { recovery: true });
    });
  }

  test('C. 쉬는 날 보호자 외출을 하나도 못 만들면 NO_TOURISM (보호자 조건이 맞아도)', () => {
    const s = restrictedStay({ outing: 'FORBIDDEN' });
    const day = plan(s, '2026-10-05', { candidates: [] });
    assert.equal(day.coverage, 'REST_DAY');
    assert.equal(day.outings.length + day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.OUTING_FORBIDDEN));
    assert.ok(day.reasons.includes(REASON.NO_CANDIDATE));
  });
});

describe('규칙 14·15 — 입국일·출국일', () => {
  test('입국일 첫 정거장 도착은 도착 + 90분 + 공항→숙소 추정보다 이르지 않다', () => {
    const s = stay({ arrival: { date: '2026-10-01', time: '09:00', airport: 'ICN' } });
    const day = plan(s, '2026-10-01', { candidates: basics() });
    const earliest = mins('09:00') + 90 + AIRPORT_TRAVEL.airportToLodgingMin;
    assert.equal(day.window.start, fromMinutes(earliest));
    assert.ok(day.outings.length > 0);
    for (const outing of day.outings) {
      assert.ok(mins(outing.departAt) >= earliest);
      for (const stop of outing.stops) assert.ok(mins(stop.arriveAt) >= earliest);
    }
  });

  test('출국일 모든 외출의 returnBy 는 출발 − 3시간 − 숙소→공항 − 30분 이하다', () => {
    const s = stay({
      departure: { date: '2026-10-10', time: '17:00', airport: 'ICN' },
      periods: [period({}, { endDate: '2026-10-10' })],
    });
    const day = plan(s, '2026-10-10', { candidates: basics() });
    const cutoff = mins('17:00') - 180 - AIRPORT_TRAVEL.lodgingToAirportMin - 30;
    assert.equal(day.window.end, fromMinutes(cutoff));
    assert.ok(day.outings.length > 0);
    for (const outing of day.outings) {
      assert.ok(mins(outing.returnBy) <= cutoff);
      assert.equal(outing.returnPlace, 'LODGING');
    }
    assert.equal(day.outings[day.outings.length - 1].deadlineReason, 'DEPARTURE');
    assertSlaHolds(day, { recovery: true });
  });
});

describe('규칙 16·17 — 복약', () => {
  test("'숙소에서 복용' 시각은 그 전 외출의 마감이고 MEDICATION_WINDOW 가 기록된다", () => {
    const s = restrictedStay({ medication: SET([{ time: '13:00', atLodging: true }]) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    const med = day.outings.find((o) => o.deadlineReason === 'MEDICATION');
    assert.ok(med, '복약 전 외출이 있어야 한다');
    assert.equal(med.returnBy, '13:00');
    assert.equal(med.returnPlace, 'LODGING');
    assert.ok(day.reasons.includes(REASON.MEDICATION_WINDOW));
    assert.deepEqual(
      day.blocks.filter((b) => b.kind === 'MEDICATION'),
      [{ kind: 'MEDICATION', start: '13:00', end: '13:15' }],
    );
    for (const outing of day.outings) {
      if (outing === med) continue;
      assert.ok(mins(outing.departAt) >= mins('13:15'), '복약 후 15분이 지나야 다음 외출');
    }
  });

  for (const time of ['13:00', '12:00']) {
    test(`식사 칸 하나에 식당은 하루 한 곳이다 — 복약 ${time}로 창이 나뉘어도`, () => {
      const s = restrictedStay({ medication: SET([{ time, atLodging: true }]) });
      const day = plan(s, '2026-10-05', { candidates: basics() });
      const stops = day.outings.flatMap((o) => o.stops);
      for (const m of day.mealSlots) {
        assert.equal(m.status, 'FILLED', m.slot);
        assert.ok(stops.find((x) => x.id === m.stopId)?.isMeal);
      }
      assert.equal(stops.filter((x) => x.isMeal).length, 2);
      assert.ok(stops.length <= 3, 'RELAXED 하루 3곳');
    });
  }

  test("'숙소 밖 복용'은 마감을 만들지 않는다", () => {
    const s = restrictedStay({ medication: SET([{ time: '13:00', atLodging: false }]) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(!day.outings.some((o) => o.deadlineReason === 'MEDICATION'));
    assert.ok(!day.reasons.includes(REASON.MEDICATION_WINDOW));
  });

  test("복약 '모르겠음'이면 마감 없이 MEDICATION_TIMES_MISSING 경고", () => {
    const s = restrictedStay({ medication: UNKNOWN });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(day.warnings.includes('MEDICATION_TIMES_MISSING'));
    assert.ok(day.warnings.includes('DEFAULTS_APPLIED'));
    assert.ok(!day.outings.some((o) => o.deadlineReason === 'MEDICATION'));
  });
});

describe('규칙 18·19 — 짧은 창과 복귀 계산', () => {
  test('외출 가능 구간이 45분 미만이면 외출이 없다', () => {
    const s = restrictedStay(
      { returnTime: { kind: 'SET', time: '09:40', place: 'LODGING' } },
      { hasCompanion: false },
    );
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.equal(day.outings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.DEPARTURE_WINDOW_TOO_SHORT));
  });

  test('창이 빠듯하면 체류를 줄이되 정거장당 15분 미만으로는 줄이지 않는다', () => {
    const s = restrictedStay(
      { returnTime: { kind: 'SET', time: '10:15', place: 'LODGING' } },
      { hasCompanion: false },
    );
    const day = plan(s, '2026-10-05', { candidates: [museum('301', { title: '테스트 미술관', north: 1.0 })] });
    assert.equal(day.outings.length, 1);
    const stop = day.outings[0].stops[0];
    assert.equal(stop.shortened, true);
    assert.ok(stop.stayMin < 45 && stop.stayMin >= 15);
    assert.equal(day.outings[0].deadlineReason, 'RETURN_TIME');
    assertSlaHolds(day, { recovery: true });
  });

  test('줄여도 맞지 않으면 외출이 없고 STANDBY + NO_CANDIDATE', () => {
    const s = restrictedStay(
      { returnTime: { kind: 'SET', time: '09:50', place: 'LODGING' } },
      { hasCompanion: false },
    );
    const far = museum('309', { title: '테스트 박물관', north: 2.8 });
    const day = plan(s, '2026-10-05', { candidates: [far] });
    assert.equal(day.outings.length, 0);
    assert.equal(day.dayState, STATE.STANDBY);
    assert.ok(day.reasons.includes(REASON.NO_CANDIDATE));
  });

  test('교통 급증 추가 버퍼가 복귀 계산에 더해진다', () => {
    const base = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    const surged = plan(restrictedStay(), '2026-10-05', { candidates: basics(), extraBufferMin: 30 });
    const a = base.outings[0];
    const b = surged.outings.find((o) => o.stops[0].contentId === a.stops[0].contentId && o.departAt === a.departAt);
    if (b) assert.ok(b.slackMin <= a.slackMin - 30 || b.stops.length < a.stops.length);
  });
});

describe('규칙 20 · 보행 누적 — 한도', () => {
  test('travelLimit 이 있으면 출발·사이·복귀 모든 구간이 한도 이하다', () => {
    const s = restrictedStay({ travelLimit: SET(8) });
    const far = museum('309', { title: '테스트 박물관', north: 2.6 });
    const day = plan(s, '2026-10-05', { candidates: [...basics(), far] });
    assert.ok(day.outings.length > 0);
    for (const outing of day.outings) {
      for (const stop of outing.stops) assert.ok(stop.legIn.min <= 8, `${stop.id} 구간 ${stop.legIn.min}분`);
      assert.ok(returnLegMin(outing) <= 8);
    }
    assert.ok(!allStops(day).some((x) => x.contentId === '309'));
  });

  test('walkLimit 은 외출 1회 누적(정거장 보행 부담 + 도보 구간)이다', () => {
    const s = restrictedStay({ walkLimit: SET(20) });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(day.outings.length > 0);
    for (const outing of day.outings) {
      assert.ok(outing.walkTotalMin <= 20, `${outing.id} 보행 ${outing.walkTotalMin}분`);
      const burden = outing.stops.reduce((sum, x) => sum + x.walkBurdenMin, 0);
      const walkLegs = outing.stops.filter((x) => x.legIn.mode === 'WALK').reduce((sum, x) => sum + x.legIn.min, 0);
      assert.ok(outing.walkTotalMin >= burden + walkLegs);
    }
  });

  test('walkLimit 이 없으면 누적 제한 없이 외출당 한도까지 채운다', () => {
    const s = restrictedStay({}, { pace: 'NORMAL' });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(day.outings.some((o) => o.walkTotalMin > 20));
  });
});

describe('규칙 53 — 보호자 외출은 환자가 숙소에 있는 구간에만', () => {
  test('환자 외출·병원 일정 블록과 겹치지 않는다', () => {
    const s = restrictedStay({ returnTime: { kind: 'SET', time: '17:00', place: 'LODGING' } }, {
      appointments: [
        { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' },
        { id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start: '13:00', end: '13:30' },
      ],
    });
    const day = plan(s, '2026-10-05', { candidates: basics() });
    assert.ok(day.guardianOutings.length > 0, '보호자 외출이 있어야 한다');
    const busy = [
      // 병원에서 끝나는 외출은 그 마감까지 환자가 숙소에 없다
      ...day.outings.map((o) => [mins(o.departAt), o.returnPlace === 'HOSPITAL' ? mins(o.returnBy) : actualReturnMin(o)]),
      ...day.blocks.map((b) => [mins(b.start), mins(b.end)]),
    ];
    for (const g of day.guardianOutings) {
      const [gs, ge] = [mins(g.departAt), mins(g.returnBy)];
      for (const [bs, be] of busy) assert.ok(ge <= bs || gs >= be, `${g.id} 가 환자 일정과 겹친다`);
      assert.equal(g.returnPlace, 'LODGING');
      assert.ok(['PATIENT_SCHEDULE', 'DAY_END'].includes(g.deadlineReason));
      for (const stop of g.stops) assert.ok(stop.id.startsWith('2026-10-05:G:'));
    }
    assertSlaHolds(day, { recovery: true });
    const patientPlaces = new Set(day.outings.flatMap((o) => o.stops.map((x) => x.contentId)));
    for (const stop of day.guardianOutings.flatMap((o) => o.stops)) {
      assert.ok(!patientPlaces.has(stop.contentId), '보호자는 같은 날 환자와 다른 곳으로 간다');
    }
  });

  test('환자가 병원에서 기다리는 동안에는 보호자 외출이 없다', () => {
    for (const rt of [
      { returnTime: { kind: 'SET', time: '15:00', place: 'HOSPITAL', hospitalId: 'H1' } },
      {},
    ]) {
      const s = restrictedStay(rt, {
        appointments: [
          { id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' },
          ...(rt.returnTime ? [] : [{ id: 'A-VISIT', hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start: '15:00' }]),
        ],
      });
      const day = plan(s, '2026-10-05', { candidates: basics() });
      const toHospital = day.outings.find((o) => o.returnPlace === 'HOSPITAL');
      assert.ok(toHospital, '병원에서 끝나는 외출이 있어야 한다');
      for (const g of day.guardianOutings) {
        const overlaps = mins(g.departAt) < mins(toHospital.returnBy) && mins(g.returnBy) > mins(toHospital.departAt);
        assert.ok(!overlaps, `${g.id} ${g.departAt}-${g.returnBy} 는 환자가 숙소에 없는 구간이다`);
      }
    }
  });

  test('보호자 반경은 3km 이고 이동은 택시 추정이다', () => {
    const s = restrictedStay({ outing: 'FORBIDDEN' });
    const far = museum('390', { title: '테스트 먼 미술관', north: 3.5 });
    const day = plan(s, '2026-10-05', { candidates: [...basics(), far] });
    assert.ok(!allStops(day).some((x) => x.contentId === '390'));
    for (const stop of allStops(day)) assert.notEqual(stop.legIn.mode, 'TRANSIT');
  });
});

describe('저수준 진입점 planDay', () => {
  test('분류·창·숙소를 직접 넘겨도 같은 결과다', () => {
    const s = restrictedStay();
    const viaStay = plan(s, '2026-10-05', { candidates: basics() });
    const direct = planDay({
      date: '2026-10-05',
      classification: classifyDate(s, '2026-10-05'),
      frame: dayWindow(s, '2026-10-05'),
      lodging: s.lodgings[0],
      hospitals: s.hospitals,
      appointments: [],
      hasCompanion: s.hasCompanion,
      interests: s.interests,
      pace: s.pace,
      candidates: basics(),
    });
    assert.deepEqual(direct, viaStay);
  });

  test('NEEDS_INPUT 날짜는 정거장이 0개이고 NO_TOURISM 이다', () => {
    const day = plan(stay(), '2026-10-05', { candidates: basics() });
    assert.equal(day.coverage, 'NEEDS_INPUT');
    assert.equal(day.outings.length + day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
    assert.ok(day.reasons.includes(REASON.CONDITION_INPUT_REQUIRED));
    assert.ok(day.mealSlots.every((m) => m.status === 'NOT_APPLICABLE'));
  });

  test('한 병원 기간 안의 모순(CONFLICTING_CONDITION)은 환자·보호자 외출 없이 NO_TOURISM', () => {
    const hospitalPeriod = period(
      { escortRequired: SET(true) },
      { id: 'P-H', source: 'HOSPITAL', planId: 'demo', planVersion: 1, hospitalId: 'H1', expiresAt: '2026-10-20T00:00:00+09:00', revoked: false },
    );
    const day = plan(stay({ periods: [hospitalPeriod] }), '2026-10-05', { candidates: basics() });
    assert.ok(day.reasons.includes(REASON.CONFLICTING_CONDITION));
    assert.equal(day.outings.length + day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
  });

  test('입국일 일정 시작이 활동 종료보다 늦으면 OUTSIDE_STAY_WINDOW 이고 외출이 없다', () => {
    const s = stay({ arrival: { date: '2026-10-01', time: '20:00', airport: 'ICN' } });
    const day = plan(s, '2026-10-01', { candidates: basics() });
    assert.equal(day.window, null);
    assert.ok(day.reasons.includes(REASON.OUTSIDE_STAY_WINDOW));
    assert.equal(day.outings.length + day.guardianOutings.length, 0);
    assert.equal(day.dayState, STATE.NO_TOURISM);
  });

  test('후보가 없으면 STANDBY + NO_CANDIDATE', () => {
    const day = plan(restrictedStay({}, { hasCompanion: false }), '2026-10-05', { candidates: [] });
    assert.equal(day.dayState, STATE.STANDBY);
    assert.ok(day.reasons.includes(REASON.NO_CANDIDATE));
  });

  test('입력을 바꾸지 않는다', () => {
    const candidates = basics();
    const snapshot = JSON.stringify(candidates);
    const s = restrictedStay();
    const stayCopy = JSON.stringify(s);
    plan(s, '2026-10-05', { candidates });
    assert.equal(JSON.stringify(candidates), snapshot);
    assert.equal(JSON.stringify(s), stayCopy);
  });
});
