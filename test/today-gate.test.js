// 오늘 게이트 덧씌우기 (AX-302 · docs/business-rules.md '매일 확인'·'전체 일정 확정과 변화 대응'·'사용자 편집', 테스트 이름의 규칙 32·49 는 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { overlayTodayGate } from '../src/stay/todayGate.js';
import { REASON, STATE } from '../src/domain/states.js';
import { deepFreeze } from './stay-fixtures.js';

function storedDay(overrides = {}) {
  return {
    date: '2026-10-04',
    coverage: 'RESTRICTED',
    dayState: STATE.TOGETHER,
    reasons: [],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'L1',
    transportMode: 'TAXI',
    effective: {},
    blocks: [],
    outings: [
      { id: 'o1', departAt: '10:00', returnBy: '12:00', returnPlace: 'LODGING', deadlineReason: 'DAY_END', stops: [{ id: '2026-10-04:P:100' }] },
      { id: 'o2', departAt: '14:00', returnBy: '16:00', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT', stops: [] },
    ],
    guardianOutings: [
      { id: 'g1', departAt: '15:00', returnBy: '16:30', returnPlace: 'LODGING', deadlineReason: 'PATIENT_SCHEDULE', stops: [] },
    ],
    mealSlots: [],
    excluded: [],
    warnings: [],
    returnNow: false,
    ...overrides,
  };
}

describe('규칙 32 — 매일 확인 전', () => {
  test('오늘 상태는 STANDBY + DAILY_CHECK_PENDING 이고 이동 동작이 비활성이다', () => {
    const shown = overlayTodayGate(storedDay(), { dailyCheckPending: true, unconfirmedHospitalUpdate: false });
    assert.equal(shown.dayState, STATE.STANDBY);
    assert.equal(shown.reasons[0], REASON.DAILY_CHECK_PENDING);
    assert.equal(shown.todayGate.actionsDisabled, true);
    assert.deepEqual(shown.todayGate.reasons, [REASON.DAILY_CHECK_PENDING]);
    assert.ok(shown.outings.every((o) => o.actionable === false));
    assert.ok(shown.guardianOutings.every((o) => o.actionable === false));
    // 일정 자체는 그대로 보여준다
    assert.equal(shown.outings.length, 2);
    assert.deepEqual(shown.outings[0].stops, [{ id: '2026-10-04:P:100' }]);
  });

  test('확인하지 않은 병원 중요 안내가 있으면 PLAN_UNCONFIRMED_UPDATE', () => {
    const shown = overlayTodayGate(storedDay(), { dailyCheckPending: false, unconfirmedHospitalUpdate: true });
    assert.equal(shown.dayState, STATE.STANDBY);
    assert.deepEqual(shown.todayGate.reasons, [REASON.PLAN_UNCONFIRMED_UPDATE]);
    assert.equal(shown.reasons[0], REASON.PLAN_UNCONFIRMED_UPDATE);
  });

  test('두 대기가 함께면 두 사유를 모두 담고, 이미 있는 사유는 중복하지 않는다', () => {
    const shown = overlayTodayGate(storedDay({ reasons: [REASON.PLAN_UNCONFIRMED_UPDATE, REASON.NO_CANDIDATE] }), {
      dailyCheckPending: true,
      unconfirmedHospitalUpdate: true,
    });
    assert.deepEqual(shown.reasons, [REASON.DAILY_CHECK_PENDING, REASON.PLAN_UNCONFIRMED_UPDATE, REASON.NO_CANDIDATE]);
  });

  test('덧씌우기는 강등만 한다 — NO_TOURISM 은 STANDBY 로 올리지 않는다', () => {
    const shown = overlayTodayGate(storedDay({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.OUTING_FORBIDDEN] }), {
      dailyCheckPending: true,
    });
    assert.equal(shown.dayState, STATE.NO_TOURISM);
    assert.deepEqual(shown.reasons, [REASON.DAILY_CHECK_PENDING, REASON.OUTING_FORBIDDEN]);
    assert.equal(shown.todayGate.actionsDisabled, true);
  });

  test('SPLIT_NEARBY 도 STANDBY 로 강등된다', () => {
    const shown = overlayTodayGate(storedDay({ dayState: STATE.SPLIT_NEARBY, outings: [] }), { dailyCheckPending: true });
    assert.equal(shown.dayState, STATE.STANDBY);
  });
});

describe('규칙 49 — 저장된 일정을 바꾸지 않는다', () => {
  test('덧씌운 뒤에도 저장본은 그대로다', () => {
    const stored = deepFreeze(storedDay());
    const before = structuredClone(stored);
    const shown = overlayTodayGate(stored, { dailyCheckPending: true, unconfirmedHospitalUpdate: true });
    assert.notEqual(shown, stored);
    assert.deepEqual(stored, before);
    assert.equal(stored.todayGate, undefined);
    assert.equal(stored.outings[0].actionable, undefined);
  });

  test('확인이 끝나면 덧씌우기만 사라지고 저장본과 같다', () => {
    const stored = deepFreeze(storedDay());
    overlayTodayGate(stored, { dailyCheckPending: true });
    const after = overlayTodayGate(stored, { dailyCheckPending: false, unconfirmedHospitalUpdate: false });
    assert.deepEqual(after, storedDay());
    assert.equal(after.todayGate, undefined);
  });

  test('일정이 없으면 그대로 돌려준다', () => {
    assert.equal(overlayTodayGate(null, { dailyCheckPending: true }), null);
    assert.equal(overlayTodayGate(undefined, { dailyCheckPending: true }), undefined);
  });
});
