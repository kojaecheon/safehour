// 날짜의 숙소·입국일 시작·출국일 마감·병원 일정 블록 (AX-302 · spec 4.1–4.3)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  appointmentsOnDate,
  lodgingForDate,
  postProcedureBoundary,
  stayDates,
} from '../src/stay/stay.js';
import {
  appointmentBlock,
  appointmentEnd,
  arrivalDayStartMin,
  dayWindow,
  departureDayCutoffMin,
  resolveReturnPlace,
} from '../src/stay/dayFrame.js';
import { addDays, diffDays, eachDate, fromMinutes, kstInstantMs, toMinutes } from '../src/stay/time.js';
import { makePlanStay, makeStay } from './stay-fixtures.js';

const TRAVEL = { airportToLodgingMin: 50, lodgingToAirportMin: 40 };

describe('시각·날짜 도우미', () => {
  test('HH:MM ↔ 분', () => {
    assert.equal(toMinutes('09:30'), 570);
    assert.equal(fromMinutes(570), '09:30');
    assert.equal(fromMinutes(-20), '00:00');
    assert.equal(fromMinutes(1500), '23:59');
    assert.throws(() => toMinutes('24:00'), TypeError);
  });

  test('날짜 계산은 달력 기준이다', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(diffDays('2026-10-01', '2026-11-15'), 45);
    assert.deepEqual(eachDate('2026-10-30', '2026-11-01'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  test('KST 시각을 절대 시각으로 바꾼다', () => {
    assert.equal(kstInstantMs('2026-10-04', '21:00'), Date.parse('2026-10-04T21:00:00+09:00'));
  });
});

describe('체류 날짜와 경계일', () => {
  test('체류 날짜는 입국일부터 출국일까지다', () => {
    const dates = stayDates(makeStay());
    assert.equal(dates[0], '2026-10-01');
    assert.equal(dates.at(-1), '2026-10-08');
    assert.equal(dates.length, 8);
  });

  test('수술 후 경계일은 가장 이른 PROCEDURE 일정의 날짜다 (VISIT 는 무시)', () => {
    const stay = makeStay();
    stay.appointments.push({ id: 'A3', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-05', start: '10:00' });
    assert.equal(postProcedureBoundary(stay), '2026-10-03');
    assert.equal(postProcedureBoundary(makeStay({ appointments: [] })), null);
  });

  test('날짜의 병원 일정은 시작 시각 순이다', () => {
    const stay = makeStay();
    stay.appointments.push({ id: 'A0', hospitalId: 'H1', type: 'VISIT', date: '2026-10-03', start: '08:00' });
    assert.deepEqual(appointmentsOnDate(stay, '2026-10-03').map((a) => a.id), ['A0', 'A2']);
  });
});

describe('날짜 D의 숙소 (spec 4.2)', () => {
  test('D일 밤을 묵는 숙소다 (체크인 ≤ D < 체크아웃)', () => {
    const stay = makeStay();
    assert.equal(lodgingForDate(stay, '2026-10-01').id, 'L1');
    assert.equal(lodgingForDate(stay, '2026-10-04').id, 'L1');
    assert.equal(lodgingForDate(stay, '2026-10-05').id, 'L2');
    assert.equal(lodgingForDate(stay, '2026-10-07').id, 'L2');
  });

  test('출국일의 숙소는 전날 밤 숙소다', () => {
    assert.equal(lodgingForDate(makeStay(), '2026-10-08').id, 'L2');
  });

  test('숙소가 정해지지 않은 날짜는 null 이다', () => {
    const stay = makeStay();
    stay.lodgings = [stay.lodgings[0]];
    assert.equal(lodgingForDate(stay, '2026-10-06'), null);
    assert.equal(lodgingForDate(stay, '2026-10-08'), null);
  });

  test('PlanStay 모양에서도 같다', () => {
    assert.equal(lodgingForDate(makePlanStay(), '2026-10-08').id, 'L2');
  });
});

describe('입국일 시작·출국일 마감 (spec 4.1, 규칙 14·15의 순수 부분)', () => {
  test('입국일 시작 = 도착 + 입국 수속 90분 + 공항→숙소 이동 추정', () => {
    // 10:00 + 90 + 50 = 12:20
    assert.equal(arrivalDayStartMin(makeStay(), 50), toMinutes('12:20'));
    const w = dayWindow(makeStay(), '2026-10-01', TRAVEL);
    assert.deepEqual(w.window, { start: '12:20', end: '21:00' });
    assert.equal(w.endReason, 'DAY_END');
    assert.deepEqual(w.reasons, []);
  });

  test('이동 추정의 소수점은 보수적으로 올린다', () => {
    assert.equal(arrivalDayStartMin(makeStay(), 12.2), toMinutes('11:43'));
    assert.equal(departureDayCutoffMin(makeStay(), 39.1), toMinutes('13:50'));
  });

  test('출국일 마감 = 출발 − 3시간 − 숙소→공항 이동 추정 − 30분', () => {
    // 18:00 − 180 − 40 − 30 = 13:50
    assert.equal(departureDayCutoffMin(makeStay(), 40), toMinutes('13:50'));
    const w = dayWindow(makeStay(), '2026-10-08', TRAVEL);
    assert.deepEqual(w.window, { start: '09:00', end: '13:50' });
    assert.equal(w.endReason, 'DEPARTURE');
  });

  test('체류 중간 날짜는 활동 시간 09:00–21:00 이다', () => {
    const w = dayWindow(makeStay(), '2026-10-04');
    assert.deepEqual(w.window, { start: '09:00', end: '21:00' });
    assert.equal(w.endReason, 'DAY_END');
  });

  test('늦은 도착으로 창이 없으면 OUTSIDE_STAY_WINDOW 다', () => {
    const stay = makeStay({ arrival: { date: '2026-10-01', time: '20:00', airport: 'ICN' } });
    const w = dayWindow(stay, '2026-10-01', TRAVEL);
    assert.equal(w.window, null);
    assert.deepEqual(w.reasons, ['OUTSIDE_STAY_WINDOW']);
  });

  test('이른 출발로 창이 없으면 OUTSIDE_STAY_WINDOW 다', () => {
    const stay = makeStay({ departure: { date: '2026-10-08', time: '11:00', airport: 'ICN' } });
    const w = dayWindow(stay, '2026-10-08', TRAVEL);
    assert.equal(w.window, null);
    assert.deepEqual(w.reasons, ['OUTSIDE_STAY_WINDOW']);
  });

  test('체류 밖 날짜는 OUTSIDE_STAY_WINDOW 다', () => {
    const w = dayWindow(makeStay(), '2026-10-09', TRAVEL);
    assert.equal(w.window, null);
    assert.deepEqual(w.reasons, ['OUTSIDE_STAY_WINDOW']);
  });

  test('입국일·출국일에 이동 추정이 없으면 추측하지 않고 오류를 낸다', () => {
    assert.throws(() => dayWindow(makeStay(), '2026-10-01'), TypeError);
    assert.throws(() => dayWindow(makeStay(), '2026-10-08', { airportToLodgingMin: 30 }), TypeError);
  });

  test('입국일과 출국일이 같으면 두 제한을 모두 적용한다', () => {
    const stay = makeStay({
      arrival: { date: '2026-10-01', time: '06:00', airport: 'ICN' },
      departure: { date: '2026-10-01', time: '23:00', airport: 'ICN' },
    });
    const w = dayWindow(stay, '2026-10-01', { airportToLodgingMin: 30, lodgingToAirportMin: 30 });
    assert.deepEqual(w.window, { start: '09:00', end: '19:00' });
    assert.equal(w.endReason, 'DEPARTURE');
  });
});

describe('병원 일정 예상 종료와 블록 (spec 4.3)', () => {
  test('종료 시각이 없으면 PROCEDURE 240분, VISIT 90분을 예상 종료로 본다', () => {
    assert.deepEqual(appointmentEnd({ type: 'PROCEDURE', start: '09:30' }), { end: '13:30', endMin: 810, estimated: true });
    assert.deepEqual(appointmentEnd({ type: 'VISIT', start: '10:00' }), { end: '11:30', endMin: 690, estimated: true });
    assert.deepEqual(appointmentEnd({ type: 'VISIT', start: '10:00', end: '10:40' }), { end: '10:40', endMin: 640, estimated: false });
  });

  test('블록 = [시작 − 숙소→병원 이동 − 도착 여유 10분, 종료 + 병원→숙소 이동]', () => {
    const block = appointmentBlock(
      { id: 'A2', type: 'PROCEDURE', start: '14:00' },
      { lodgingToHospitalMin: 20, hospitalToLodgingMin: 25 },
    );
    assert.deepEqual(block, { kind: 'APPOINTMENT', start: '13:30', end: '18:25', appointmentId: 'A2' });
  });

  test('직전 외출이 있으면 블록은 일정 시작 시각부터이고 숙소→병원 이동을 넣지 않는다', () => {
    const block = appointmentBlock(
      { id: 'A2', type: 'VISIT', start: '14:00', end: '15:00' },
      { hospitalToLodgingMin: 25, precededByOuting: true },
    );
    assert.deepEqual(block, { kind: 'APPOINTMENT', start: '14:00', end: '15:25', appointmentId: 'A2' });
  });

  test('필요한 이동 추정이 없으면 오류를 낸다', () => {
    assert.throws(() => appointmentBlock({ id: 'A', type: 'VISIT', start: '10:00' }, { hospitalToLodgingMin: 10 }), TypeError);
    assert.throws(() => appointmentBlock({ id: 'A', type: 'VISIT', start: '10:00' }, { lodgingToHospitalMin: 10 }), TypeError);
  });
});

describe('복귀 장소 좌표 (규칙 13-1의 순수 부분)', () => {
  test('숙소 복귀는 그날 숙소 좌표, 병원 복귀는 hospitalId 의 좌표다', () => {
    const stay = makeStay();
    const lodging = lodgingForDate(stay, '2026-10-04');
    assert.deepEqual(resolveReturnPlace(null, { lodging, hospitals: stay.hospitals }), {
      place: 'LODGING',
      lodgingId: 'L1',
      lat: 37.5,
      lng: 127.03,
    });
    assert.deepEqual(
      resolveReturnPlace({ time: '17:00', place: 'HOSPITAL', hospitalId: 'H1' }, { lodging, hospitals: stay.hospitals }),
      { place: 'HOSPITAL', hospitalId: 'H1', lat: 37.52, lng: 127.02 },
    );
  });

  test('병원 id 를 찾지 못하면 추측하지 않고 오류를 낸다', () => {
    const stay = makeStay();
    assert.throws(
      () => resolveReturnPlace({ time: '17:00', place: 'HOSPITAL', hospitalId: 'H9' }, { lodging: stay.lodgings[0], hospitals: stay.hospitals }),
      RangeError,
    );
    assert.throws(
      () => resolveReturnPlace({ time: '17:00', place: 'HOSPITAL' }, { lodging: stay.lodgings[0], hospitals: stay.hospitals }),
      RangeError,
    );
  });
});
