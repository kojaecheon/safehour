// 날짜별 환자 복귀 마감 공용 계산과 당겨진 외출 판정 (서버 알림 A-2 Task 2 · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md D2·D8)
//
// 이 파일이 고정하는 것
//   - 당겨진 외출은 OUTING_OVERDUE 즉시 복귀 날의 여유 음수 외출뿐이다(다른 즉시 복귀 원인의 날은 실제 마감이다)
//   - 환자 복귀 목록은 저장 순서 그대로이고 시각이 아닌 returnBy 와 보호자 외출은 들어오지 않는다
//   - 날짜별 마감은 fromDate(입국일보다 앞이면 입국일)부터 출국일까지, 당겨진 마감을 빼고 중복 없이 정렬한다
//   - 당겨진 외출이 없는 날의 마감은 보호자 스냅샷의 patientReturn[].by 와 같다(스냅샷은 당겨진 외출도 담는다)
//
// 외부 호출은 없다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { REASON, isClampedOverdueOuting } from '../src/domain/states.js';
import { buildGuardianSnapshot, patientDeadlineDays, patientReturnsOf } from '../src/guardian/index.js';
import { guardianOuting, makeDayPlan, makeGuardianStay, makeTripPlan, patientOuting } from './guardian-fixtures.js';

/** 즉시 복귀가 켜진 하루 */
function returnNowDay(date, reason, outings) {
  return makeDayPlan(date, { returnNow: true, reasons: [reason], outings });
}

describe('isClampedOverdueOuting', () => {
  test('OUTING_OVERDUE 즉시 복귀 날의 여유 음수 외출만 참이다', () => {
    const day = returnNowDay('2026-10-04', REASON.OUTING_OVERDUE, []);
    assert.equal(isClampedOverdueOuting(day, patientOuting({ slackMin: -20 })), true);
    assert.equal(isClampedOverdueOuting(day, patientOuting({ slackMin: 5 })), false);
    assert.equal(isClampedOverdueOuting(day, patientOuting({ slackMin: 0 })), false);
    // 사유가 있어도 즉시 복귀가 꺼진 날은 당겨지지 않았다
    const notReturnNow = makeDayPlan('2026-10-04', { returnNow: false, reasons: [REASON.OUTING_OVERDUE] });
    assert.equal(isClampedOverdueOuting(notReturnNow, patientOuting({ slackMin: -20 })), false);
  });

  test('PATIENT_RECALLED·PLAN_REVOKED·PLAN_EXPIRED 날의 여유 음수 외출은 거짓이다', () => {
    for (const reason of [REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED]) {
      const day = returnNowDay('2026-10-04', reason, []);
      assert.equal(isClampedOverdueOuting(day, patientOuting({ slackMin: -20 })), false, reason);
    }
  });

  test('slackMin 이 숫자가 아니면 거짓이다', () => {
    const day = returnNowDay('2026-10-04', REASON.OUTING_OVERDUE, []);
    for (const slackMin of [null, undefined, '-20', Number.NaN]) {
      assert.equal(isClampedOverdueOuting(day, patientOuting({ slackMin })), false, String(slackMin));
    }
    assert.equal(isClampedOverdueOuting(day, null), false);
    assert.equal(isClampedOverdueOuting(null, patientOuting({ slackMin: -20 })), false);
  });
});

describe('patientReturnsOf', () => {
  test('저장 순서 그대로, 시각이 아닌 returnBy 는 뺀다', () => {
    const day = makeDayPlan('2026-10-04', {
      outings: [
        patientOuting({ returnBy: '17:20', returnPlace: 'HOSPITAL' }),
        patientOuting({ returnBy: '24:00' }),
        patientOuting({ returnBy: null }),
        null,
        'not-an-outing',
        patientOuting({ returnBy: '12:30', returnPlace: 'LODGING' }),
        patientOuting({ returnBy: '09:05', returnPlace: 7 }),
      ],
      guardianOutings: [guardianOuting('2026-10-04', { returnBy: '15:30' })],
    });
    assert.deepEqual(patientReturnsOf(day), [
      { by: '17:20', returnPlace: 'HOSPITAL', clamped: false },
      { by: '12:30', returnPlace: 'LODGING', clamped: false },
      { by: '09:05', returnPlace: null, clamped: false },
    ]);
    assert.deepEqual(patientReturnsOf(undefined), []);
    assert.deepEqual(patientReturnsOf(null), []);
    assert.deepEqual(patientReturnsOf(makeDayPlan('2026-10-04', { outings: 'x' })), []);
  });

  test('당겨진 외출은 clamped: true 다', () => {
    const day = returnNowDay('2026-10-04', REASON.OUTING_OVERDUE, [
      patientOuting({ departAt: '10:00', returnBy: '12:30', slackMin: 15 }),
      patientOuting({ departAt: '13:00', returnBy: '14:45', slackMin: -20 }),
    ]);
    assert.deepEqual(patientReturnsOf(day), [
      { by: '12:30', returnPlace: 'LODGING', clamped: false },
      { by: '14:45', returnPlace: 'LODGING', clamped: true },
    ]);
  });
});

describe('patientDeadlineDays', () => {
  test('fromDate 부터 출국일까지 날짜마다 하나, 외출이 없거나 일정이 없는 날은 빈 목록', () => {
    const days = patientDeadlineDays({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), fromDate: '2026-10-04' });
    assert.deepEqual(days, [
      { date: '2026-10-04', deadlines: ['12:30', '17:20'] },
      { date: '2026-10-05', deadlines: [] },
      { date: '2026-10-06', deadlines: ['12:00'] },
      { date: '2026-10-07', deadlines: [] },
      { date: '2026-10-08', deadlines: [] },
    ]);
  });

  test('fromDate 가 입국일보다 앞이면 입국일부터다', () => {
    const days = patientDeadlineDays({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), fromDate: '2026-09-15' });
    assert.deepEqual(
      days.map((d) => d.date),
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
    );
    // 체류 밖 날짜(09-20)의 일정은 들어오지 않는다
    assert.deepEqual(days[0], { date: '2026-10-01', deadlines: ['16:00'] });
    assert.deepEqual(days[1], { date: '2026-10-02', deadlines: [] });
  });

  test('당겨진 외출의 마감은 빼고, 다른 즉시 복귀 원인의 날은 실제 마감을 담는다', () => {
    const tripPlan = makeTripPlan({
      days: {
        '2026-10-04': returnNowDay('2026-10-04', REASON.OUTING_OVERDUE, [
          patientOuting({ departAt: '10:00', returnBy: '12:30', slackMin: 15 }),
          patientOuting({ departAt: '13:00', returnBy: '14:45', slackMin: -20 }),
          patientOuting({ departAt: '16:00', returnBy: '18:00', slackMin: 10 }),
        ]),
        '2026-10-05': returnNowDay('2026-10-05', REASON.PATIENT_RECALLED, [patientOuting({ returnBy: '15:10', slackMin: -20 })]),
        '2026-10-06': returnNowDay('2026-10-06', REASON.PLAN_REVOKED, [patientOuting({ returnBy: '16:10', slackMin: -5 })]),
        '2026-10-07': returnNowDay('2026-10-07', REASON.PLAN_EXPIRED, [patientOuting({ returnBy: '17:10', slackMin: -1 })]),
      },
    });
    const days = patientDeadlineDays({ stay: makeGuardianStay(), tripPlan, fromDate: '2026-10-04' });
    assert.deepEqual(days, [
      { date: '2026-10-04', deadlines: ['12:30', '18:00'] },
      { date: '2026-10-05', deadlines: ['15:10'] },
      { date: '2026-10-06', deadlines: ['16:10'] },
      { date: '2026-10-07', deadlines: ['17:10'] },
      { date: '2026-10-08', deadlines: [] },
    ]);
  });

  test('시각은 중복 없이 정렬한다', () => {
    const tripPlan = makeTripPlan({
      days: {
        '2026-10-08': makeDayPlan('2026-10-08', {
          outings: [
            patientOuting({ returnBy: '17:00' }),
            patientOuting({ returnBy: '09:30' }),
            patientOuting({ returnBy: '17:00', returnPlace: 'HOSPITAL' }),
            patientOuting({ returnBy: '12:00' }),
          ],
        }),
      },
    });
    const days = patientDeadlineDays({ stay: makeGuardianStay(), tripPlan, fromDate: '2026-10-08' });
    assert.deepEqual(days, [{ date: '2026-10-08', deadlines: ['09:30', '12:00', '17:00'] }]);
  });

  test('체류가 깨졌으면 빈 목록이다', () => {
    const tripPlan = makeTripPlan();
    assert.deepEqual(patientDeadlineDays(), []);
    assert.deepEqual(patientDeadlineDays({ stay: null, tripPlan, fromDate: '2026-10-01' }), []);
    assert.deepEqual(patientDeadlineDays({ stay: {}, tripPlan, fromDate: '2026-10-01' }), []);
    const badArrival = makeGuardianStay({ arrival: { date: '2026-10-32', time: '10:00', airport: 'ICN' } });
    assert.deepEqual(patientDeadlineDays({ stay: badArrival, tripPlan, fromDate: '2026-10-01' }), []);
    const noDeparture = makeGuardianStay({ departure: null });
    assert.deepEqual(patientDeadlineDays({ stay: noDeparture, tripPlan, fromDate: '2026-10-01' }), []);
    const reversed = makeGuardianStay({ departure: { date: '2026-09-28', time: '18:00', airport: 'GMP' } });
    assert.deepEqual(patientDeadlineDays({ stay: reversed, tripPlan, fromDate: '2026-09-01' }), []);
  });

  test('일정이 없거나 깨졌으면 날짜마다 빈 목록이다', () => {
    const expected = ['2026-10-07', '2026-10-08'].map((date) => ({ date, deadlines: [] }));
    for (const tripPlan of [undefined, null, {}, { days: null }, { days: { '2026-10-07': 'x' } }]) {
      assert.deepEqual(patientDeadlineDays({ stay: makeGuardianStay(), tripPlan, fromDate: '2026-10-07' }), expected);
    }
  });

  test('fromDate 가 날짜가 아니면 TypeError 이고 메시지에 값이 없다', () => {
    for (const fromDate of [undefined, null, '2026-2-1', 20261001]) {
      assert.throws(
        () => patientDeadlineDays({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), fromDate }),
        (error) => error instanceof TypeError && !error.message.includes(String(fromDate)),
      );
    }
  });

  test('당겨진 외출이 없는 날은 보호자 스냅샷의 patientReturn[].by 와 같다', () => {
    const stay = makeGuardianStay();
    const base = makeTripPlan();
    const tripPlan = makeTripPlan({
      days: {
        ...base.days,
        '2026-10-07': returnNowDay('2026-10-07', REASON.PATIENT_RECALLED, [
          patientOuting({ returnBy: '18:30', slackMin: -10 }),
          patientOuting({ departAt: '08:00', returnBy: '09:40', returnPlace: 'HOSPITAL' }),
        ]),
      },
    });
    const snapshot = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-01T08:00:00+09:00' });
    const deadlineDays = patientDeadlineDays({ stay, tripPlan, fromDate: '2026-10-01' });
    assert.equal(snapshot.days.length, 7);
    for (const day of snapshot.days) {
      const computed = deadlineDays.find((d) => d.date === day.date);
      assert.ok(computed, day.date);
      assert.deepEqual(computed.deadlines, day.patientReturn.map((r) => r.by).sort(), day.date);
    }
  });

  test('보호자 스냅샷은 당겨진 외출의 마감도 담고, 업로드 목록만 뺀다', () => {
    const stay = makeGuardianStay();
    const tripPlan = makeTripPlan({
      days: {
        '2026-10-04': returnNowDay('2026-10-04', REASON.OUTING_OVERDUE, [
          patientOuting({ departAt: '10:00', returnBy: '12:30', slackMin: 15 }),
          patientOuting({ departAt: '13:00', returnBy: '14:45', slackMin: -20 }),
        ]),
      },
    });
    const snapshot = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-04T13:30:00+09:00' });
    const day = snapshot.days.find((d) => d.date === '2026-10-04');
    assert.deepEqual(
      day.patientReturn.map((r) => r.by),
      ['12:30', '14:45'],
    );
    const [computed] = patientDeadlineDays({ stay, tripPlan, fromDate: '2026-10-04' });
    assert.deepEqual(computed, { date: '2026-10-04', deadlines: ['12:30'] });
  });
});
