// 복귀 마감이 지난 외출의 시트 신호 (설계서 4.2 경우 1)
//
// selectOverdueReturn 은 표시 신호만 고른다. 저장 일정을 바꾸지 않고, returnNow 를 켜지 않고, 장소를 다시 판정하지 않는다.
// 이 파일이 고정하는 것:
//   - 마감 직후부터 graceMin 분 전까지만 고른다(KST 절대 시각 기준)
//   - 닫은 외출, 즉시 복귀(returnNow) 중인 날, 오늘(KST)이 아닌 날은 고르지 않는다
//   - 두 외출이 모두 창 안이면 마감이 늦은 쪽, returnBy 가 깨진 외출은 건너뛴다
//   - nextOverdueWakeMs: 다음 마감, 표시 중이면 만료, 남은 경계가 없으면 null
//   - overdueKeysThrough: 닫을 때 함께 닫는 외출은 창 안이고 마감이 같거나 이른 것뿐
//   - 닫은 기억은 `${outingId}@${returnBy}` 키다. 전체 재계획이 외출 id 를 다시 매겨도 다른 외출을 막지 않는다

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { nextOverdueWakeMs, overdueDismissKey, overdueKeysThrough, selectOverdueReturn } from '../lib/trip/overdue.js';
import { kstInstantMs } from '../src/stay/time.js';

const DATE = '2026-10-05';
const MIN = 60_000;
const GRACE = 60;
const at = (time, date = DATE) => kstInstantMs(date, time);

function outing(id, returnBy, o = {}) {
  return { id: `${DATE}:P:${id}`, departAt: '10:00', returnBy, returnPlace: 'LODGING', slackMin: 30, stops: [], ...o };
}

function day(outings, o = {}) {
  return { date: DATE, returnNow: false, reasons: [], outings, guardianOutings: [], ...o };
}

describe('selectOverdueReturn', () => {
  const d = day([outing('1', '13:00')]);

  test('마감 직후 그 외출을 고른다', () => {
    assert.deepEqual(selectOverdueReturn({ day: d, nowMs: at('13:00'), dismissed: [], graceMin: GRACE }), {
      date: DATE,
      outingId: `${DATE}:P:1`,
      returnBy: '13:00',
    });
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:00') - 1, dismissed: [], graceMin: GRACE }), null, '마감 전');
  });

  test('graceMin 분이 지나면 null', () => {
    assert.ok(selectOverdueReturn({ day: d, nowMs: at('13:59') + 59_000, dismissed: [], graceMin: GRACE }));
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('14:00'), dismissed: [], graceMin: GRACE }), null);
  });

  test('닫은 외출이면 null (배열·Set 모두), 키는 외출 id 와 마감 시각', () => {
    assert.equal(overdueDismissKey(`${DATE}:P:1`, '13:00'), `${DATE}:P:1@13:00`);
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05'), dismissed: [`${DATE}:P:1@13:00`], graceMin: GRACE }), null);
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05'), dismissed: new Set([`${DATE}:P:1@13:00`]), graceMin: GRACE }), null);
  });

  test('같은 외출 id 라도 마감 시각이 다르면 닫은 것으로 보지 않는다 (전체 재계획의 id 재사용)', () => {
    // 재계획 전 P:1 은 12:30 마감이었고 그때 닫았다. 지금 P:1 은 13:00 마감인 다른 외출이다
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05'), dismissed: [`${DATE}:P:1@12:30`], graceMin: GRACE }).outingId, `${DATE}:P:1`);
    // 예전 형식(외출 id 만)의 기억은 더 이상 맞지 않는다. 오늘 하루치 값이라 받아들인다
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05'), dismissed: [`${DATE}:P:1`], graceMin: GRACE }).outingId, `${DATE}:P:1`);
  });

  test('그날이 즉시 복귀(returnNow) 중이면 null, 기존 시트가 우선이다', () => {
    const recalled = day([outing('1', '13:00')], { returnNow: true, reasons: ['PATIENT_RECALLED'] });
    assert.equal(selectOverdueReturn({ day: recalled, nowMs: at('13:05'), dismissed: [], graceMin: GRACE }), null);
  });

  test('두 외출이 모두 창 안이면 마감이 늦은 쪽', () => {
    const two = day([outing('1', '13:00'), outing('2', '13:30', { departAt: '13:10' })]);
    assert.equal(selectOverdueReturn({ day: two, nowMs: at('13:40'), dismissed: [], graceMin: GRACE }).outingId, `${DATE}:P:2`);
    // 늦은 쪽을 닫으면 아직 창 안의 이른 쪽
    assert.equal(
      selectOverdueReturn({ day: two, nowMs: at('13:40'), dismissed: [`${DATE}:P:2@13:30`], graceMin: GRACE }).outingId,
      `${DATE}:P:1`,
    );
  });

  test('마감이 같으면 나중에 출발한 외출', () => {
    const tie = day([outing('1', '21:00'), outing('2', '21:00', { departAt: '15:00' })]);
    assert.equal(selectOverdueReturn({ day: tie, nowMs: at('21:05'), dismissed: [], graceMin: GRACE }).outingId, `${DATE}:P:2`);
  });

  test('날짜가 오늘(KST)이 아니면 null', () => {
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05', '2026-10-06'), dismissed: [], graceMin: GRACE }), null);
    // UTC 로는 같은 날이어도 KST 로 다음 날이면 오늘이 아니다
    assert.equal(selectOverdueReturn({ day: day([outing('1', '23:50')]), nowMs: at('00:10', '2026-10-06'), dismissed: [], graceMin: GRACE }), null);
  });

  test('returnBy 가 깨진 외출은 건너뛰고 다른 외출을 본다', () => {
    const broken = day([outing('x', '25:99'), outing('y', null), outing('1', '13:00')]);
    assert.equal(selectOverdueReturn({ day: broken, nowMs: at('13:05'), dismissed: [], graceMin: GRACE }).outingId, `${DATE}:P:1`);
  });

  test('보호자 외출은 보지 않는다', () => {
    const g = day([], { guardianOutings: [outing('g', '13:00', { id: `${DATE}:G:g` })] });
    assert.equal(selectOverdueReturn({ day: g, nowMs: at('13:05'), dismissed: [], graceMin: GRACE }), null);
  });

  test('입력이 없거나 graceMin 이 잘못되면 null', () => {
    assert.equal(selectOverdueReturn({ day: null, nowMs: at('13:05'), dismissed: [], graceMin: GRACE }), null);
    assert.equal(selectOverdueReturn({ day: d, nowMs: at('13:05'), dismissed: [], graceMin: 0 }), null);
    assert.equal(selectOverdueReturn({ day: d, nowMs: Number.NaN, dismissed: [], graceMin: GRACE }), null);
  });

  test('일정 객체를 바꾸지 않는다', () => {
    const frozen = Object.freeze(day(Object.freeze([Object.freeze(outing('1', '13:00'))])));
    assert.ok(selectOverdueReturn({ day: frozen, nowMs: at('13:05'), dismissed: [], graceMin: GRACE }));
  });
});

describe('nextOverdueWakeMs', () => {
  const two = day([outing('1', '13:00'), outing('2', '17:00', { departAt: '15:00' })]);

  test('다음 마감 시각', () => {
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('12:00'), graceMin: GRACE }), at('13:00'));
  });

  test('표시 중이면 만료 시각', () => {
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('13:10'), graceMin: GRACE }), at('14:00'));
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('14:00'), graceMin: GRACE }), at('17:00'));
  });

  test('남은 경계가 없으면 null', () => {
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('18:00'), graceMin: GRACE }), null);
    assert.equal(nextOverdueWakeMs({ day: day([]), nowMs: at('12:00'), graceMin: GRACE }), null);
    assert.equal(nextOverdueWakeMs({ day: null, nowMs: at('12:00'), graceMin: GRACE }), null);
  });

  test('오늘(KST)이 아니거나 즉시 복귀 중이면 null', () => {
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('12:00', '2026-10-04'), graceMin: GRACE }), null);
    assert.equal(nextOverdueWakeMs({ day: { ...two, returnNow: true }, nowMs: at('12:00'), graceMin: GRACE }), null);
  });

  test('깨진 returnBy 는 건너뛴다', () => {
    assert.equal(nextOverdueWakeMs({ day: day([outing('x', 'nope'), outing('1', '13:00')]), nowMs: at('12:00'), graceMin: GRACE }), at('13:00'));
  });

  test('분 단위', () => {
    assert.equal(nextOverdueWakeMs({ day: two, nowMs: at('12:59'), graceMin: GRACE }) - at('12:59'), MIN);
  });
});

describe('overdueKeysThrough: 시트를 닫을 때 함께 닫는 외출(닫은 기억 키)', () => {
  test('창 안이고 마감이 같거나 이른 외출만', () => {
    const d = day([outing('1', '13:00'), outing('2', '13:30', { departAt: '13:10' }), outing('3', '13:30', { departAt: '13:15' }), outing('4', '17:00', { departAt: '15:00' })]);
    assert.deepEqual(overdueKeysThrough({ day: d, nowMs: at('13:40'), graceMin: GRACE, returnBy: '13:30' }), [`${DATE}:P:1@13:00`, `${DATE}:P:2@13:30`, `${DATE}:P:3@13:30`]);
    // 이른 쪽만 닫으면 늦은 쪽은 남는다
    assert.deepEqual(overdueKeysThrough({ day: d, nowMs: at('13:10'), graceMin: GRACE, returnBy: '13:00' }), [`${DATE}:P:1@13:00`]);
    // 창이 지난 외출은 넣지 않는다
    assert.deepEqual(overdueKeysThrough({ day: d, nowMs: at('14:10'), graceMin: GRACE, returnBy: '13:30' }), [`${DATE}:P:2@13:30`, `${DATE}:P:3@13:30`]);
  });

  test('입력이 깨졌거나 즉시 복귀 중이면 빈 목록', () => {
    const d = day([outing('1', '13:00')]);
    assert.deepEqual(overdueKeysThrough({ day: d, nowMs: at('13:10'), graceMin: GRACE, returnBy: 'nope' }), []);
    assert.deepEqual(overdueKeysThrough({ day: null, nowMs: at('13:10'), graceMin: GRACE, returnBy: '13:00' }), []);
    assert.deepEqual(overdueKeysThrough({ day: { ...d, returnNow: true }, nowMs: at('13:10'), graceMin: GRACE, returnBy: '13:00' }), []);
  });
});
