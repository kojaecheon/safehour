// 받은 일정 화면의 순수 도우미 (사용성 점검 D3)
//
// - 같은 시각·같은 장소의 환자 복귀 마감은 한 줄로 합친다(순서 유지)
// - 맨 위 '오늘 환자 복귀 마감' 카드: 오늘(KST) 마감 가운데 아직 지나지 않은 가장 가까운 것,
//   모두 지났으면 가장 늦게 지난 것. 오늘 외출이 없으면 none, 오늘이 사본 범위 밖이면 null

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dedupePatientReturns, orderDaysForView, todayReturnSummary } from '../components/guardian/copyView.js';

const HOSPITAL = { by: '17:00', placeName: '병원', placeAddress: null };
const LODGING_21 = { by: '21:00', placeName: '숙소 A', placeAddress: '서울 중구 1' };
const LODGING_15 = { by: '15:00', placeName: '숙소 A', placeAddress: '서울 중구 1' };

function snapshotOf(days) {
  return { days: days.map((d) => ({ escortRequired: false, guardianSoloAllowed: true, guardianOutings: [], ...d })) };
}

// KST 2026-11-06 16:00
const NOW = Date.parse('2026-11-06T07:00:00Z');

describe('dedupePatientReturns', () => {
  test('시각·장소 이름·주소가 모두 같으면 한 줄로 합치고 처음 나온 순서를 지킨다', () => {
    const out = dedupePatientReturns([LODGING_21, HOSPITAL, { ...LODGING_21 }, LODGING_15, { ...HOSPITAL }]);
    assert.deepEqual(out, [LODGING_21, HOSPITAL, LODGING_15]);
  });

  test('시각이 같아도 장소가 다르면 따로 둔다', () => {
    const other = { ...LODGING_21, placeName: '숙소 B' };
    const otherAddress = { ...LODGING_21, placeAddress: '서울 중구 2' };
    assert.equal(dedupePatientReturns([LODGING_21, other, otherAddress]).length, 3);
  });

  test('목록이 아니면 빈 목록', () => {
    assert.deepEqual(dedupePatientReturns(undefined), []);
    assert.deepEqual(dedupePatientReturns(null), []);
  });
});

describe('todayReturnSummary', () => {
  test('아직 지나지 않은 마감 가운데 가장 가까운 것, 개수는 합친 뒤 개수', () => {
    const snapshot = snapshotOf([
      { date: '2026-11-06', patientReturn: [LODGING_21, LODGING_15, HOSPITAL, { ...LODGING_21 }] },
      { date: '2026-11-07', patientReturn: [{ ...HOSPITAL, by: '16:30' }] },
    ]);
    assert.deepEqual(todayReturnSummary(snapshot, NOW), {
      date: '2026-11-06',
      by: '17:00',
      placeName: '병원',
      placeAddress: null,
      status: 'UPCOMING',
      total: 3,
    });
  });

  test('모두 지났으면 가장 늦게 지난 마감', () => {
    const late = Date.parse('2026-11-06T13:30:00Z'); // KST 22:30
    const snapshot = snapshotOf([{ date: '2026-11-06', patientReturn: [LODGING_15, LODGING_21, HOSPITAL] }]);
    const summary = todayReturnSummary(snapshot, late);
    assert.equal(summary.by, '21:00');
    assert.equal(summary.status, 'PASSED');
    assert.equal(summary.total, 3);
  });

  test('오늘 환자 외출이 없으면 none', () => {
    const snapshot = snapshotOf([{ date: '2026-11-06', patientReturn: [] }]);
    assert.deepEqual(todayReturnSummary(snapshot, NOW), { date: '2026-11-06', none: true });
  });

  test('오늘이 사본 날짜 밖이면 null (입국 전·범위 지남)', () => {
    const snapshot = snapshotOf([{ date: '2026-11-08', patientReturn: [HOSPITAL] }]);
    assert.equal(todayReturnSummary(snapshot, NOW), null);
    assert.equal(todayReturnSummary(snapshotOf([]), NOW), null);
  });

  test('KST 기준 오늘: UTC 로는 전날이어도 한국 날짜로 고른다', () => {
    const kstMorning = Date.parse('2026-11-06T16:30:00Z'); // KST 2026-11-07 01:30
    const snapshot = snapshotOf([
      { date: '2026-11-06', patientReturn: [LODGING_21] },
      { date: '2026-11-07', patientReturn: [HOSPITAL] },
    ]);
    assert.equal(todayReturnSummary(snapshot, kstMorning).date, '2026-11-07');
  });

  test('깨진 입력은 null', () => {
    assert.equal(todayReturnSummary(null, NOW), null);
    assert.equal(todayReturnSummary({ days: 'x' }, NOW), null);
    assert.equal(todayReturnSummary(snapshotOf([{ date: '2026-11-06', patientReturn: [HOSPITAL] }]), NaN), null);
  });
});

describe('todayReturnSummary: 마감은 있는데 시각을 읽을 수 없으면', () => {
  test('카드를 그리지 않는다(null). 아래 줄과 어긋나게 「외출 없음」이라 말하지 않는다', () => {
    const nowMs = Date.UTC(2026, 10, 6, 1, 0); // 2026-11-06 10:00 KST
    const snapshot = { days: [{ date: '2026-11-06', patientReturn: [{ by: 'late', placeName: '숙소', placeAddress: null }] }] };
    assert.equal(todayReturnSummary(snapshot, nowMs), null);
  });
});

describe('orderDaysForView: 받은 일정의 날짜 순서', () => {
  const days = [{ date: '2026-11-05' }, { date: '2026-11-06' }, { date: '2026-11-07' }, { date: '2026-11-08' }];
  test('오늘, 앞으로 올 날짜(원래 순서), 지난 날짜 순이다', () => {
    const out = orderDaysForView(days, '2026-11-06');
    assert.equal(out.todayDay.date, '2026-11-06');
    assert.deepEqual(out.days.map((d) => d.date), ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-05']);
  });
  test('오늘이 범위 밖이면 순서를 바꾸지 않는다', () => {
    const out = orderDaysForView(days, '2026-11-20');
    assert.equal(out.todayDay, null);
    assert.deepEqual(out.days.map((d) => d.date), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
  test('목록이 아니면 빈 목록', () => {
    assert.deepEqual(orderDaysForView(null, '2026-11-06'), { todayDay: null, days: [] });
  });
});
