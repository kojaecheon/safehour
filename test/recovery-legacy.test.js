// 퇴역 예정 v1 단일 외출 경로 — 호환 계층 (AX-213 · AX-215 · AX-220 → AX-311 에서 분리)
//
// v1 지침은 더 이상 받지 않는다(AX-311, 규칙 48). 그래도 예전 화면(`/today`·`/plan`·`/result`)과
// `/api/today` 는 일정 화면(AX-317)·일정 API(AX-308)가 대체할 때까지 남는다.
// 그동안 이 경로가 **안전한 방향으로만** 동작하는지 고정한다.
//   - 깨진·만료·철회 지침으로 외출을 통과시키지 않는다
//   - v2 지침은 이 경로에서 판정하지 않는다(NO_HOSPITAL_PLAN) — 판정이 두 벌이 되지 않게
//   - 병원 안내문(채널 B)은 판정용 축약본에 실리지 않는다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_CATEGORIES,
  effectiveDeadline,
  gateDecisionPayload,
  gateRecoveryPlan,
  invalidateForReturn,
  nextClockOccurrence,
  planToCondition,
  toDecisionPayload,
  unconfirmedAll,
  validateDecisionPayload,
} from '../src/recovery/plan.js';
import { demoPlanStandard } from '../src/recovery/fixtures.js';
import { REASON, STATE } from '../src/domain/states.js';
import { gateHospitalCondition } from '../src/engine/safetyGate.js';

const NOW = new Date('2026-08-14T10:00:00+09:00');
const NOW_MS = NOW.getTime();
const HOUR = 3600_000;
const iso = (offsetMs) => new Date(NOW_MS + offsetMs).toISOString();

/** 예전 화면이 세션에 들고 있을 수 있는 v1 모양. 문장은 가짜 자리표시자다 */
function legacyPlan(overrides = {}) {
  const { constraints, ...rest } = overrides;
  return {
    schemaVersion: 1,
    planId: 'LEGACY-PLAN',
    version: 3,
    issuedAt: iso(-2 * HOUR),
    updatedAt: iso(-2 * HOUR),
    expiresAt: iso(72 * HOUR),
    revoked: false,
    demo: true,
    issuer: { name: '(테스트) 발행처', role: 'medical_staff' },
    anchor: { lat: 37.5105, lng: 127.059, label: '병원' },
    constraints: {
      outingAllowed: true,
      indoorOnly: false,
      maxWalkMin: 20,
      maxTravelMin: 30,
      avoidUv: true,
      avoidHeat: true,
      noWater: true,
      escortRequired: false,
      splitAllowed: true,
      foodRestricted: true,
      fastingUntil: null,
      returnBy: iso(5 * HOUR),
      medicationTimes: ['09:00', '15:00', '21:00'],
      nextVisitAt: iso(30 * HOUR),
      ...(constraints ?? {}),
    },
    instructions: [
      { id: 'act-1', category: 'activity', lang: 'ko', text: '(테스트) 활동 문장', updatedAt: iso(-2 * HOUR), acknowledged: false },
      { id: 'med-1', category: 'medication', lang: 'ko', text: '(테스트) 복약 문장', updatedAt: iso(-2 * HOUR), acknowledged: false },
      { id: 'emg-1', category: 'emergency', lang: 'ko', text: '(테스트) 응급 문장', updatedAt: iso(-2 * HOUR), acknowledged: false },
    ],
    ...rest,
  };
}

const restricted = () =>
  legacyPlan({
    constraints: { outingAllowed: false, indoorOnly: true, escortRequired: true, splitAllowed: false, maxWalkMin: 5, maxTravelMin: 10 },
  });

const acked = (plan) => ({ ...plan, instructions: plan.instructions.map((i) => ({ ...i, acknowledged: true })) });

describe('연결 게이트 (v1 호환)', () => {
  test('계획이 없거나 깨졌으면 관광지를 표시하지 않는다', () => {
    for (const plan of [null, { planId: 'x' }]) {
      const gate = gateRecoveryPlan(plan, { now: NOW });
      assert.equal(gate.pass, false);
      assert.equal(gate.state, STATE.NO_TOURISM);
      assert.deepEqual(gate.reasons, [REASON.NO_HOSPITAL_PLAN]);
    }
  });

  test('v2 지침은 이 경로에서 판정하지 않는다 — 판정이 두 벌이 되지 않게', () => {
    const v2 = acked(demoPlanStandard(NOW_MS));
    const gate = gateRecoveryPlan(v2, { now: NOW });
    assert.equal(gate.pass, false);
    assert.deepEqual(gate.reasons, [REASON.NO_HOSPITAL_PLAN]);
    assert.equal(gate.expired, false);
    assert.equal(validateDecisionPayload(toDecisionPayload(v2)).valid, false);
    assert.equal(gateDecisionPayload(toDecisionPayload(v2), { now: NOW }).pass, false);
  });

  test('만료·철회는 차단하고 expired 를 알린다', () => {
    const expired = gateRecoveryPlan(acked(legacyPlan({ expiresAt: iso(-HOUR) })), { now: NOW });
    assert.deepEqual(expired.reasons, [REASON.PLAN_EXPIRED]);
    assert.equal(expired.expired, true);
    const revoked = gateRecoveryPlan(acked(legacyPlan({ revoked: true })), { now: NOW });
    assert.deepEqual(revoked.reasons, [REASON.PLAN_REVOKED]);
    assert.equal(revoked.expired, true);
  });

  test('만료 경계 — 직전은 통과, 그 시각은 차단', () => {
    const plan = acked(legacyPlan());
    const expiry = new Date(plan.expiresAt);
    assert.equal(gateRecoveryPlan(plan, { now: new Date(expiry.getTime() - 1) }).pass, true);
    assert.equal(gateRecoveryPlan(plan, { now: expiry }).pass, false);
  });

  test('확인하지 않은 중요 안내는 STANDBY 강등, 확인하면 풀린다', () => {
    const gate = gateRecoveryPlan(legacyPlan(), { now: NOW });
    assert.equal(gate.state, STATE.STANDBY);
    assert.deepEqual(gate.reasons, [REASON.PLAN_UNCONFIRMED_UPDATE]);
    assert.equal(gate.expired, false);
    assert.equal(gateRecoveryPlan(acked(legacyPlan()), { now: NOW }).pass, true);
  });

  test('중요하지 않은 분류는 확인하지 않아도 막지 않는다', () => {
    const plan = legacyPlan();
    const partial = {
      ...plan,
      instructions: plan.instructions.map((i) => ({ ...i, acknowledged: CRITICAL_CATEGORIES.includes(i.category) })),
    };
    assert.equal(gateRecoveryPlan(partial, { now: NOW }).pass, true);
    assert.equal(unconfirmedAll(partial).length, 1);
  });
});

describe('판정용 축약본 — 채널 B 가 서버로 나가지 않는다 (v1 호환)', () => {
  test('안내문 본문·언어·발행처 이름을 떼어낸다', () => {
    const payload = toDecisionPayload(legacyPlan());
    const json = JSON.stringify(payload);
    assert.equal(json.includes('(테스트)'), false);
    assert.equal(json.includes('instructions'), false);
    assert.deepEqual(Object.keys(payload.issuer), ['role']);
    for (const item of payload.acknowledgements) {
      assert.deepEqual(Object.keys(item).sort(), ['acknowledged', 'category', 'id']);
    }
  });

  test('축약본만으로 게이트가 같은 답을 낸다', () => {
    for (const p of [legacyPlan(), acked(legacyPlan()), legacyPlan({ expiresAt: iso(-HOUR) })]) {
      assert.deepEqual(gateDecisionPayload(toDecisionPayload(p), { now: NOW }), gateRecoveryPlan(p, { now: NOW }));
    }
  });

  test('안내문이 섞여 오면 계약 위반으로 거부한다', () => {
    const payload = toDecisionPayload(legacyPlan());
    payload.instructions = [{ id: 'x', category: 'food', lang: 'ko', text: '샜다' }];
    const { valid, errors } = validateDecisionPayload(payload);
    assert.equal(valid, false);
    assert.ok(errors.includes('instructions:forbidden'));
    assert.equal(gateDecisionPayload(payload, { now: NOW }).pass, false);
  });
});

describe('채널 A → 엔진 조건 매핑 (v1 호환)', () => {
  test('제한조건을 완화하지 않고 그대로 옮긴다', () => {
    const condition = planToCondition(restricted());
    assert.equal(condition.outingAllowed, false);
    assert.equal(condition.indoorOnly, true);
    assert.equal(condition.escortRequired, true);
    assert.equal(condition.maxWalkMin, 5);
    assert.equal(condition.maxTravelMin, 10);
    assert.equal(condition.version, 'LEGACY-PLAN#3');
  });

  test('금식 종료 시각이 있으면 식음 활동을 막는다', () => {
    assert.equal(planToCondition(legacyPlan({ constraints: { foodRestricted: false, fastingUntil: '14:00' } })).fasting, true);
  });

  test('매핑된 조건이 기존 안전 게이트를 그대로 통과한다 — 판정이 두 벌이 아니다', () => {
    assert.equal(gateHospitalCondition(planToCondition(legacyPlan()), { now: NOW }).pass, true);
    const blocked = gateHospitalCondition(planToCondition(restricted()), { now: NOW });
    assert.equal(blocked.pass, false);
    assert.ok(blocked.reasons.includes(REASON.OUTING_FORBIDDEN));
  });
});

describe('가장 이른 마감 (v1 호환)', () => {
  test('복약·복귀·진료 중 먼저 오는 것이 마감이다', () => {
    const med = legacyPlan({ constraints: { returnBy: iso(8 * HOUR), medicationTimes: ['15:00'], nextVisitAt: null } });
    assert.equal(effectiveDeadline(med, NOW).source, 'medication');
    const ret = legacyPlan({ constraints: { returnBy: iso(0.5 * HOUR), medicationTimes: ['23:00'], nextVisitAt: null } });
    assert.equal(effectiveDeadline(ret, NOW).source, 'returnBy');
    const visit = legacyPlan({ constraints: { returnBy: iso(8 * HOUR), medicationTimes: [], nextVisitAt: iso(2 * HOUR) } });
    assert.equal(effectiveDeadline(visit, NOW).source, 'visit');
  });

  test('복약 시각은 실행 시간대와 무관하게 KST 로 해석하고, 지난 시각은 다음 날로 넘긴다', () => {
    assert.equal(nextClockOccurrence('09:00', NOW).toISOString(), '2026-08-15T00:00:00.000Z');
    assert.equal(nextClockOccurrence('15:00', NOW).toISOString(), '2026-08-14T06:00:00.000Z');
    assert.equal(nextClockOccurrence('23:59', NOW).toISOString(), '2026-08-14T14:59:00.000Z');
    assert.equal(nextClockOccurrence('00:00', NOW).toISOString(), '2026-08-14T15:00:00.000Z');
    assert.equal(nextClockOccurrence('9:00', NOW), null);
  });
});

describe('외출 중 무효화 (AX-220, v1 호환)', () => {
  const decision = {
    state: 'TOGETHER',
    reasons: [],
    course: [{ id: '1' }, { id: '2' }],
    patientCourse: [{ id: '1' }],
    companionCourse: [{ id: '2' }],
    excluded: [{ id: '9', reasons: ['CLOSED'] }],
    returnNow: false,
    latestDepartureAt: '2026-08-14T12:00:00.000Z',
    returnBy: '2026-08-14T14:00:00.000Z',
  };

  test('추천을 비우고 즉시 복귀를 켜되, 복귀 시각과 제외 사유는 남긴다', () => {
    const next = invalidateForReturn(decision, [REASON.PLAN_EXPIRED, REASON.PLAN_EXPIRED]);
    assert.equal(next.state, STATE.NO_TOURISM);
    assert.deepEqual(next.reasons, [REASON.PLAN_EXPIRED]);
    assert.deepEqual(next.course, []);
    assert.deepEqual(next.patientCourse, []);
    assert.deepEqual(next.companionCourse, []);
    assert.equal(next.returnNow, true);
    assert.equal(next.returnBy, decision.returnBy);
    assert.deepEqual(next.excluded, decision.excluded);
    assert.equal(decision.course.length, 2, '원본을 바꾸지 않는다');
  });
});
