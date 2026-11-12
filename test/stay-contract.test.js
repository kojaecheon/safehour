// 새 사유 코드와 조정 가능한 기본값 (AX-302 · docs/platform/IA_AND_FLOWS.md '이번에 새로 쓰는 사유 코드', docs/platform/ITINERARY_RULES.md '조정 가능한 기본값')

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { REASON, REASON_TEXT } from '../src/domain/states.js';
import { DEFAULTS, UNKNOWN_DEFAULTS } from '../src/stay/defaults.js';
import * as stayApi from '../src/stay/index.js';

const NEW_REASONS = [
  'OUTSIDE_STAY_WINDOW',
  'LODGING_REQUIRED',
  'CONDITION_INPUT_REQUIRED',
  'SENSITIVE_CONSENT_REQUIRED',
  'HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED',
  'DAILY_CHECK_PENDING',
  'HEAT_EXPOSURE',
  'WATER_ACTIVITY',
  'DIET_RESTRICTED',
  'MENU_UNKNOWN',
];

describe('spec 5.2 새 사유 코드', () => {
  test('10개가 REASON 에 있고 값이 키와 같다', () => {
    for (const code of NEW_REASONS) {
      assert.equal(REASON[code], code, code);
    }
  });

  test('ko·en 문구가 있다 (ja·zh 는 언어 작업 몫)', () => {
    for (const code of NEW_REASONS) {
      assert.ok(REASON_TEXT[code]?.ko, `${code} ko`);
      assert.ok(REASON_TEXT[code]?.en, `${code} en`);
    }
  });

  test('사유 문구는 안전을 단정하지 않는다', () => {
    for (const code of NEW_REASONS) {
      const { ko, en } = REASON_TEXT[code];
      assert.ok(!/안전합니다|안전해요|안심/.test(ko), `${code}: ${ko}`);
      assert.ok(!/\bsafe\b/i.test(en), `${code}: ${en}`);
    }
  });

  test('기존 사유 코드는 그대로다', () => {
    for (const code of ['MEDICATION_WINDOW', 'PLAN_UNCONFIRMED_UPDATE', 'SERVICE_PAUSED']) {
      assert.equal(REASON[code], code);
    }
  });
});

describe('spec 11장 숫자 기본값 — 한 파일', () => {
  test('값이 spec 11장 표와 같다', () => {
    assert.deepEqual(DEFAULTS.unknown, { walkLimitMin: 15, travelLimitMin: 20 });
    assert.deepEqual(DEFAULTS.buffers, {
      recoveryExtraMin: 10,
      arrivalMarginMin: 10,
      hailingMin: 5,
      trafficVariancePct: 0.25,
    });
    assert.equal(DEFAULTS.minOutingWindowMin, 45);
    assert.equal(DEFAULTS.minStopStayMin, 15);
    assert.deepEqual(DEFAULTS.activityHours, { start: '09:00', end: '21:00' });
    assert.deepEqual(DEFAULTS.mealSlots, {
      LUNCH: { start: '11:30', end: '13:30' },
      DINNER: { start: '17:30', end: '19:30' },
    });
    assert.deepEqual(DEFAULTS.stopsPerPace, {
      RELAXED: { perOuting: 2, perDay: 3 },
      NORMAL: { perOuting: 3, perDay: 5 },
    });
    assert.deepEqual(DEFAULTS.searchRadiusM, { restricted: 3000, free: 10000, guardian: 3000 });
    assert.deepEqual(DEFAULTS.transitEstimate, { detourFactor: 1.3, speedKmh: 20, waitTransferMin: 10 });
    assert.deepEqual(DEFAULTS.appointmentDurationMin, { PROCEDURE: 240, VISIT: 90 });
    assert.equal(DEFAULTS.medicationGapMin, 15);
    assert.deepEqual(DEFAULTS.airport, { arrivalProcessingMin: 90, departureArrivalLeadMin: 180, departureSlackMin: 30 });
    assert.deepEqual(DEFAULTS.notifications, {
      returnBeforeMin: [60, 30],
      medicationAtLodgingBeforeMin: 10,
      medicationAwayBeforeMin: 0,
      appointmentBeforeMin: 15,
      returnPassedGraceMin: 60,
    });
    assert.deepEqual(DEFAULTS.stay, { maxNights: 45, deleteAfterDepartureDays: 7 });
    assert.deepEqual(DEFAULTS.guardianPin, { maxAttempts: 5, lockMin: 60 });
    assert.deepEqual(DEFAULTS.ai, { timeoutMs: 3000, maxChars: 200 });
    assert.deepEqual(DEFAULTS.tourApi, { warnAt: 800, dailyLimit: 1000 });
  });

  test('모르겠음 기본값은 가장 엄격한 쪽이다', () => {
    assert.deepEqual(UNKNOWN_DEFAULTS, {
      walkLimitMin: 15,
      travelLimitMin: 20,
      avoidUv: true,
      avoidHeat: true,
      avoidWater: true,
      escortRequired: true,
      guardianMustStay: true,
      mealRestriction: { mode: 'ALL_DAY' },
      diet: { spicy: true, alcohol: true, hard: true, hot: true, raw: true },
      medication: 'NO_DEADLINE_WITH_WARNING',
    });
  });

  test('기본값은 실행 중에 바뀌지 않는다', () => {
    assert.ok(Object.isFrozen(DEFAULTS));
    assert.ok(Object.isFrozen(DEFAULTS.buffers));
    assert.ok(Object.isFrozen(DEFAULTS.notifications.returnBeforeMin));
    assert.ok(Object.isFrozen(UNKNOWN_DEFAULTS.diet));
  });
});

describe('공개 진입점', () => {
  test('src/stay/index.js 가 하위 모듈을 모두 내보낸다', () => {
    for (const name of [
      'validateStay',
      'validateConditionPeriod',
      'normalizeConditionPeriod',
      'composeConditions',
      'flattenEffective',
      'classifyDate',
      'classifyStay',
      'isDailyCheckTarget',
      'isDailyCheckPending',
      'overlayTodayGate',
      'dayWindow',
      'appointmentBlock',
      'lodgingForDate',
      'DEFAULTS',
      'ERROR_CODE',
      'COVERAGE',
    ]) {
      assert.ok(name in stayApi, name);
    }
  });
});
