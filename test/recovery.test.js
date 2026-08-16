// 회복 지침 계약과 연결 게이트 (AX-213 · AX-214 · AX-215)
//
// 여기가 깨지면 다음이 벌어진다.
//   - 깨진 계획으로 외출을 추천한다
//   - 병원이 보낸 진단명·시술기록이 앱으로 새어 든다
//   - 보호자가 환자의 약물·시술 안내를 본다
//   - 복약 시각을 넘겨 외출을 추천한다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_CATEGORIES,
  INSTRUCTION_CATEGORIES,
  effectiveDeadline,
  gateRecoveryPlan,
  isClockTime,
  nextClockOccurrence,
  gateDecisionPayload,
  invalidateForReturn,
  planToCondition,
  toDecisionPayload,
  unconfirmedCritical,
  validateDecisionPayload,
  validatePlan,
} from '../src/recovery/plan.js';
import { companionView, demoAdapter, minimizePlan, redeemPlan } from '../src/recovery/gateway.js';
import { DEMO_FIXTURES, demoPlanExpired, demoPlanRestricted, demoPlanStandard } from '../src/recovery/fixtures.js';
import { REASON, STATE } from '../src/domain/states.js';
import { gateHospitalCondition } from '../src/engine/safetyGate.js';

const NOW = new Date('2026-08-14T10:00:00+09:00');
const NOW_MS = NOW.getTime();

describe('계획 형식 검증', () => {
  test('데모 계획 3종이 모두 유효하다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      const { valid, errors } = validatePlan(make(NOW_MS));
      assert.equal(valid, true, `${errors.join(', ')}`);
    }
  });

  test('필수 필드가 빠지면 거부한다', () => {
    const base = demoPlanStandard(NOW_MS);
    for (const drop of ['planId', 'issuedAt', 'expiresAt', 'issuer', 'anchor', 'constraints']) {
      const broken = { ...base };
      delete broken[drop];
      assert.equal(validatePlan(broken).valid, false, `${drop} 없이 통과했다`);
    }
  });

  test('제한조건의 boolean 이 문자열이면 거부한다 — "false" 는 참이 되어버린다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.outingAllowed = 'false';
    const { valid, errors } = validatePlan(plan);
    assert.equal(valid, false);
    assert.ok(errors.includes('constraints.outingAllowed'));
  });

  test('보행·이동 한도의 범위를 검사한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.maxWalkMin = -1;
    assert.equal(validatePlan(plan).valid, false);
    plan.constraints.maxWalkMin = 999;
    assert.equal(validatePlan(plan).valid, false);
  });

  test('좌표 범위를 벗어나면 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.anchor = { lat: 200, lng: 127 };
    assert.equal(validatePlan(plan).valid, false);
  });

  test('복약 시각은 HH:MM 만 받는다', () => {
    assert.equal(isClockTime('09:00'), true);
    assert.equal(isClockTime('23:59'), true);
    assert.equal(isClockTime('24:00'), false);
    assert.equal(isClockTime('9:00'), false);
    assert.equal(isClockTime('09:60'), false);
    assert.equal(isClockTime(null), false);

    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.medicationTimes = ['09:00', '25:00'];
    assert.equal(validatePlan(plan).valid, false);
  });

  test('안내 분류가 정의 밖이면 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.instructions[0].category = 'diagnosis';
    assert.equal(validatePlan(plan).valid, false);
  });

  test('중요 분류는 정의된 7종의 부분집합이다', () => {
    for (const c of CRITICAL_CATEGORIES) assert.ok(INSTRUCTION_CATEGORIES.includes(c));
  });
});

describe('연결 게이트', () => {
  const acked = (plan) => ({
    ...plan,
    instructions: plan.instructions.map((i) => ({ ...i, acknowledged: true })),
  });

  test('계획이 없으면 관광지를 표시하지 않는다', () => {
    const gate = gateRecoveryPlan(null, { now: NOW });
    assert.equal(gate.pass, false);
    assert.equal(gate.state, STATE.NO_TOURISM);
    assert.deepEqual(gate.reasons, [REASON.NO_HOSPITAL_PLAN]);
  });

  test('깨진 계획은 없는 것과 같이 취급한다', () => {
    const gate = gateRecoveryPlan({ planId: 'x' }, { now: NOW });
    assert.equal(gate.pass, false);
    assert.deepEqual(gate.reasons, [REASON.NO_HOSPITAL_PLAN]);
  });

  test('만료된 계획은 차단하고 expired 를 알린다 — 외출 중이면 즉시 복귀로 전환해야 한다', () => {
    const gate = gateRecoveryPlan(acked(demoPlanExpired(NOW_MS)), { now: NOW });
    assert.equal(gate.pass, false);
    assert.deepEqual(gate.reasons, [REASON.PLAN_EXPIRED]);
    assert.equal(gate.expired, true);
  });

  test('철회된 계획도 차단한다', () => {
    const plan = { ...acked(demoPlanStandard(NOW_MS)), revoked: true };
    const gate = gateRecoveryPlan(plan, { now: NOW });
    assert.deepEqual(gate.reasons, [REASON.PLAN_REVOKED]);
    assert.equal(gate.expired, true);
  });

  test('만료 경계 — 만료 시각 직전은 통과, 그 시각은 차단', () => {
    const plan = acked(demoPlanStandard(NOW_MS));
    const expiry = new Date(plan.expiresAt);
    assert.equal(gateRecoveryPlan(plan, { now: new Date(expiry.getTime() - 1) }).pass, true);
    assert.equal(gateRecoveryPlan(plan, { now: expiry }).pass, false);
  });

  test('확인하지 않은 중요 안내는 차단이 아니라 STANDBY 강등이다', () => {
    const gate = gateRecoveryPlan(demoPlanStandard(NOW_MS), { now: NOW });
    assert.equal(gate.pass, false);
    assert.equal(gate.state, STATE.STANDBY, '차단해버리면 사용자가 풀 방법이 없다');
    assert.deepEqual(gate.reasons, [REASON.PLAN_UNCONFIRMED_UPDATE]);
    assert.equal(gate.expired, false);
  });

  test('확인하면 강등이 풀린다', () => {
    assert.equal(gateRecoveryPlan(acked(demoPlanStandard(NOW_MS)), { now: NOW }).pass, true);
  });

  test('중요하지 않은 분류는 확인하지 않아도 막지 않는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const partial = {
      ...plan,
      instructions: plan.instructions.map((i) => ({
        ...i,
        acknowledged: CRITICAL_CATEGORIES.includes(i.category),
      })),
    };
    assert.equal(unconfirmedCritical(partial).length, 0);
    assert.equal(gateRecoveryPlan(partial, { now: NOW }).pass, true);
  });
});

describe('채널 A → 엔진 조건 매핑', () => {
  test('제한조건을 완화하지 않고 그대로 옮긴다', () => {
    const plan = demoPlanRestricted(NOW_MS);
    const condition = planToCondition(plan);
    assert.equal(condition.outingAllowed, false);
    assert.equal(condition.indoorOnly, true);
    assert.equal(condition.escortRequired, true);
    assert.equal(condition.maxWalkMin, 5);
    assert.equal(condition.maxTravelMin, 10);
  });

  test('금식 종료 시각이 있으면 식음 활동을 막는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.foodRestricted = false;
    plan.constraints.fastingUntil = '14:00';
    assert.equal(planToCondition(plan).fasting, true);
  });

  test('조건 버전이 계획 버전을 따라간다 — 병원이 고치면 새 조건이다', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.equal(planToCondition(plan).version, `${plan.planId}#${plan.version}`);
  });

  test('매핑된 조건이 기존 안전 게이트를 그대로 통과한다 — 판정이 두 벌이 아니다', () => {
    const ok = gateHospitalCondition(planToCondition(demoPlanStandard(NOW_MS)), { now: NOW });
    assert.equal(ok.pass, true);

    const blocked = gateHospitalCondition(planToCondition(demoPlanRestricted(NOW_MS)), { now: NOW });
    assert.equal(blocked.pass, false);
    assert.equal(blocked.state, STATE.NO_TOURISM);
    assert.ok(blocked.reasons.includes(REASON.OUTING_FORBIDDEN));
  });
});

describe('가장 이른 마감', () => {
  test('복약 시각이 복귀 시각보다 이르면 복약이 마감이다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.returnBy = new Date(NOW_MS + 8 * 3600_000).toISOString();
    plan.constraints.medicationTimes = ['15:00'];
    plan.constraints.nextVisitAt = null;

    const deadline = effectiveDeadline(plan, NOW);
    assert.equal(deadline.source, 'medication');
    assert.ok(deadline.at < new Date(plan.constraints.returnBy));
  });

  test('복귀 시각이 가장 이르면 복귀가 마감이다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.returnBy = new Date(NOW_MS + 30 * 60_000).toISOString();
    plan.constraints.medicationTimes = ['23:00'];
    plan.constraints.nextVisitAt = null;
    assert.equal(effectiveDeadline(plan, NOW).source, 'returnBy');
  });

  test('다음 진료가 가장 이르면 진료가 마감이다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.constraints.returnBy = new Date(NOW_MS + 8 * 3600_000).toISOString();
    plan.constraints.medicationTimes = [];
    plan.constraints.nextVisitAt = new Date(NOW_MS + 2 * 3600_000).toISOString();
    assert.equal(effectiveDeadline(plan, NOW).source, 'visit');
  });

  test('지난 복약 시각은 다음 날로 넘긴다 — 이미 지난 시각을 마감으로 쓰지 않는다', () => {
    const at = nextClockOccurrence('09:00', NOW); // NOW 는 10:00
    assert.ok(at > NOW);
    assert.equal(at.getHours(), 9);
  });
});

describe('게이트웨이 최소화', () => {
  test('허용 목록 밖의 필드를 잘라낸다 — 진단명·시술기록이 새지 않는다', () => {
    const raw = {
      ...demoPlanStandard(NOW_MS),
      diagnosis: '민감정보',
      procedureHistory: ['시술1', '시술2'],
      patientName: '홍길동',
      constraints: { ...demoPlanStandard(NOW_MS).constraints, internalRiskScore: 7 },
    };
    const min = minimizePlan(raw);
    const json = JSON.stringify(min);

    assert.equal('diagnosis' in min, false);
    assert.equal('procedureHistory' in min, false);
    assert.equal('patientName' in min, false);
    assert.equal('internalRiskScore' in min.constraints, false);
    assert.equal(json.includes('홍길동'), false);
    assert.equal(json.includes('민감정보'), false);
  });

  test('안내 항목에도 허용 목록을 적용한다', () => {
    const raw = demoPlanStandard(NOW_MS);
    raw.instructions[0].internalNote = '의료진 메모';
    const min = minimizePlan(raw);
    assert.equal('internalNote' in min.instructions[0], false);
  });

  test('최소화 후에도 계획이 유효하다', () => {
    assert.equal(validatePlan(minimizePlan(demoPlanStandard(NOW_MS))).valid, true);
  });
});

describe('보호자 축약', () => {
  const plan = demoPlanStandard(NOW_MS);

  test('병원 안내문을 통째로 뺀다 — 약물·시술 정황이 문장에 담긴다', () => {
    const view = companionView(plan);
    assert.deepEqual(view.instructions, []);
    assert.equal(JSON.stringify(view).includes('항생제'), false);
    assert.equal(JSON.stringify(view).includes('맵고 짠'), false);
  });

  test('보호자가 알아야 하는 것만 남긴다', () => {
    const view = companionView(plan);
    assert.deepEqual(Object.keys(view.constraints).sort(), [
      'escortRequired',
      'maxTravelMin',
      'maxWalkMin',
      'outingAllowed',
      'returnBy',
      'splitAllowed',
    ]);
  });

  test('복약 시각은 기본으로 공유하지 않는다', () => {
    assert.equal('medicationTimes' in companionView(plan).constraints, false);
  });

  test('동의한 범위만 더한다', () => {
    const withSchedule = companionView(plan, { shareSchedule: true });
    assert.ok('nextVisitAt' in withSchedule.constraints);

    const withInstructions = companionView(plan, { shareInstructions: true });
    // 동의해도 응급 대응만 — 약물·음식 안내는 여전히 빠진다
    assert.ok(withInstructions.instructions.every((i) => i.category === 'emergency'));
  });

  test('계획이 없으면 null 이다', () => {
    assert.equal(companionView(null), null);
  });
});

describe('데모 어댑터', () => {
  const adapter = demoAdapter(DEMO_FIXTURES);

  test('코드로 계획을 찾는다 — 대소문자·공백을 무시한다', async () => {
    for (const code of ['demo-a', ' DEMO-A ', 'Demo-A']) {
      const result = await redeemPlan(adapter, code);
      assert.equal(result.ok, true, code);
      assert.equal(result.plan.planId, 'DEMO-PLAN-A');
    }
  });

  test('모르는 코드는 계획을 주지 않는다', async () => {
    const result = await redeemPlan(adapter, 'NOPE');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown_code');
  });

  test('깨진 계획은 통과시키지 않는다 — 깨진 계획으로 판정하면 안전 사고다', async () => {
    const broken = demoAdapter({ BAD: () => ({ planId: 'x', schemaVersion: 1 }) });
    const result = await redeemPlan(broken, 'BAD');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_plan');
    assert.ok(result.errors.length > 0);
  });

  test('데모 계획에는 demo 표시가 박혀 있다 — 실제 연동으로 오인되면 허위 제출이다', async () => {
    const result = await redeemPlan(adapter, 'DEMO-A');
    assert.equal(result.plan.demo, true);
  });

  test('데모 fixture 에 개인 식별정보가 없다', () => {
    const json = JSON.stringify(demoPlanStandard(NOW_MS));
    for (const forbidden of ['주민등록', '@', '010-']) {
      assert.equal(json.includes(forbidden), false, `${forbidden} 가 fixture 에 있다`);
    }
  });
});

describe('판정용 축약본 — 채널 B 가 서버로 나가지 않는다', () => {
  test('안내문 본문과 언어를 떼어낸다', () => {
    const payload = toDecisionPayload(demoPlanStandard(NOW_MS));
    const json = JSON.stringify(payload);
    assert.equal(json.includes('항생제'), false);
    assert.equal(json.includes('맵고 짠'), false);
    assert.equal(json.includes('instructions'), false);
    for (const item of payload.acknowledgements) {
      assert.deepEqual(Object.keys(item).sort(), ['acknowledged', 'category', 'id']);
    }
  });

  test('발행처 이름도 보내지 않는다 — 판정에 필요 없다', () => {
    const payload = toDecisionPayload(demoPlanStandard(NOW_MS));
    assert.deepEqual(Object.keys(payload.issuer), ['role']);
  });

  test('축약본만으로 게이트가 같은 답을 낸다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const acked = {
      ...plan,
      instructions: plan.instructions.map((i) => ({ ...i, acknowledged: true })),
    };
    for (const p of [plan, acked, demoPlanExpired(NOW_MS)]) {
      assert.deepEqual(
        gateDecisionPayload(toDecisionPayload(p), { now: NOW }),
        gateRecoveryPlan(p, { now: NOW }),
      );
    }
  });

  test('안내문이 섞여 오면 계약 위반으로 거부한다', () => {
    const payload = toDecisionPayload(demoPlanStandard(NOW_MS));
    payload.instructions = [{ id: 'x', category: 'food', lang: 'ko', text: '샜다' }];
    const { valid, errors } = validateDecisionPayload(payload);
    assert.equal(valid, false);
    assert.ok(errors.includes('instructions:forbidden'));
    assert.equal(gateDecisionPayload(payload, { now: NOW }).pass, false);
  });

  test('축약본으로도 엔진 조건 매핑이 된다', () => {
    const condition = planToCondition(toDecisionPayload(demoPlanRestricted(NOW_MS)));
    assert.equal(condition.outingAllowed, false);
    assert.equal(condition.issuedBy, 'medical_staff');
  });
});

describe('외출 중 무효화 (AX-220)', () => {
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

  test('추천을 비우고 즉시 복귀를 켠다 — PATIENT_RECALL 과 같은 모양', () => {
    const next = invalidateForReturn(decision, [REASON.PLAN_EXPIRED]);
    assert.equal(next.state, STATE.NO_TOURISM);
    assert.deepEqual(next.reasons, [REASON.PLAN_EXPIRED]);
    assert.deepEqual(next.course, []);
    assert.deepEqual(next.patientCourse, []);
    assert.deepEqual(next.companionCourse, []);
    assert.equal(next.returnNow, true);
  });

  test('복귀 안내에 필요한 시각은 남긴다 — 지우면 어디로 언제까지 가는지 모른다', () => {
    const next = invalidateForReturn(decision, [REASON.PLAN_REVOKED]);
    assert.equal(next.returnBy, decision.returnBy);
    assert.equal(next.latestDepartureAt, decision.latestDepartureAt);
  });

  test('제외 사유는 보존한다 — 그 장소들에 대해서는 여전히 사실이다', () => {
    assert.deepEqual(invalidateForReturn(decision, [REASON.PLAN_EXPIRED]).excluded, decision.excluded);
  });

  test('원본을 바꾸지 않는다', () => {
    invalidateForReturn(decision, [REASON.PLAN_EXPIRED]);
    assert.equal(decision.state, 'TOGETHER');
    assert.equal(decision.course.length, 2);
  });

  test('사유가 중복돼도 한 번만 남는다', () => {
    const next = invalidateForReturn(decision, [REASON.PLAN_EXPIRED, REASON.PLAN_EXPIRED]);
    assert.deepEqual(next.reasons, [REASON.PLAN_EXPIRED]);
  });

  test('만료·철회만 expired 로 표시된다 — 미확인 강등은 외출을 중단시키지 않는다', () => {
    const plan = demoPlanStandard(NOW_MS); // 미확인 중요 안내 있음 → STANDBY
    assert.equal(gateRecoveryPlan(plan, { now: NOW }).expired, false);

    const expired = gateRecoveryPlan(demoPlanExpired(NOW_MS), { now: NOW });
    assert.equal(expired.expired, true);

    const revoked = gateRecoveryPlan({ ...demoPlanStandard(NOW_MS), revoked: true }, { now: NOW });
    assert.equal(revoked.expired, true);
  });
});
