// 병원 지침 계약 v2: 검증·게이트웨이·변환·확인 기록·재확인 (AX-311 · docs/business-rules.md '병원 연동'·'날짜별 합성', docs/contracts.md '`POST /api/plan/link`',
// src/recovery/AGENTS.md '항상 지켜야 하는 것'. 테스트 이름의 spec 번호와 규칙 번호(11, 12, 48, 56, 57)는 옛 설계서 번호다)
//
// 여기가 깨지면 다음이 벌어진다.
//   - 깨진 지침이나 v1 지침으로 일정을 만든다
//   - 병원이 보낸 진단명·시술기록이 앱으로 새어 든다
//   - 만료 시각에 맞춰 기간이 잘려, 날짜별 적용 판정이 두 곳에서 어긋난다
//   - 병원 복귀 기간이 엉뚱한 병원(또는 병원 없음)으로 복귀를 계산한다
//   - 안내문 내용이 바뀌었는데 예전 확인이 그대로 남는다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_CATEGORIES,
  INSTRUCTION_CATEGORIES,
  PLAN_STATUS,
  PLAN_VERSION,
  acknowledgementKey,
  planStatus,
  stripAcknowledged,
  unconfirmedCritical,
  unconfirmedInstructions,
  validatePlan,
} from '../src/recovery/plan.js';
import { planToStayParts, recheckLinkedPlan, toLinkedPlan } from '../src/recovery/link.js';
import { demoAdapter, minimizePlan, normalizeLinkCode, redeemPlan } from '../src/recovery/gateway.js';
import { DEMO_FIXTURES, demoPlanExpired, demoPlanRestricted, demoPlanStandard } from '../src/recovery/fixtures.js';
import { REASON, STATE } from '../src/domain/states.js';
import { classifyDate } from '../src/stay/coverage.js';
import { validateConditionPeriod } from '../src/stay/conditions.js';
import { validateStay } from '../src/stay/stay.js';
import { overlayTodayGate } from '../src/stay/todayGate.js';
import { addDays, kstInstantMs } from '../src/stay/time.js';

const NOW = new Date('2026-08-14T10:00:00+09:00');
const NOW_MS = NOW.getTime();
/** NOW 의 KST 날짜 */
const D0 = '2026-08-14';
const d = (n) => addDays(D0, n);
const HOSPITAL_ID = 'H-LINKED';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const NONE = () => ({ kind: 'NONE' });
const YES = () => ({ kind: 'SET', value: true });

/** 모든 항목이 '아니오'인 병원 발행 항목 — 필요한 것만 덮어쓴다 */
function hospitalItems(overrides = {}) {
  const { diet, ...rest } = overrides;
  return {
    outing: 'ALLOWED',
    returnTime: { kind: 'NOT_SET' },
    walkLimit: NONE(),
    travelLimit: NONE(),
    avoidUv: NONE(),
    avoidHeat: NONE(),
    avoidWater: NONE(),
    escortRequired: NONE(),
    guardianMustStay: NONE(),
    mealRestriction: NONE(),
    diet: { spicy: NONE(), alcohol: NONE(), hard: NONE(), hot: NONE(), raw: NONE(), ...(diet ?? {}) },
    medication: NONE(),
    ...rest,
  };
}

/** 예전 v1 지침 모양: 더 이상 받지 않는다 (docs/business-rules.md '병원 연동') */
function legacyV1Plan() {
  return {
    schemaVersion: 1,
    planId: 'OLD-PLAN',
    version: 1,
    issuedAt: '2026-08-14T08:00:00+09:00',
    expiresAt: '2026-08-17T10:00:00+09:00',
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
      returnBy: '2026-08-14T15:00:00+09:00',
      medicationTimes: ['09:00'],
      nextVisitAt: null,
    },
    instructions: [
      { id: 'a-1', category: 'activity', lang: 'ko', text: '(테스트) 활동 안내', updatedAt: '2026-08-14T08:00:00+09:00' },
    ],
  };
}

/** 체류 — 경계일(PROCEDURE)을 정할 수 있게 만든다. 이름·주소는 가상의 자리표시자다 */
function stayWith({ hospital, appointments = [], periods = [], boundary = d(1), arrival = d(-2), departure = d(7) }) {
  return {
    schemaVersion: 2,
    arrival: { date: arrival, time: '10:00', airport: 'ICN' },
    departure: { date: departure, time: '18:00', airport: 'ICN' },
    hasCompanion: true,
    interests: ['CAFE'],
    pace: 'RELAXED',
    lodgings: [
      {
        id: 'L1',
        name: '테스트 숙소',
        address: { roadAddress: '테스트로 1', lat: 37.5, lng: 127.03, source: 'DEMO' },
        checkIn: arrival,
        checkOut: departure,
      },
    ],
    hospitals: [hospital],
    appointments: [
      { id: 'U1', hospitalId: hospital.id, type: 'PROCEDURE', date: boundary, start: '09:30', source: 'USER' },
      ...appointments,
    ],
    periods,
    linkedPlans: [],
    consent: { sensitive: { version: 'consent-v1', agreedAt: '2026-08-10T09:00:00+09:00' } },
    guardianShare: null,
    createdAt: '2026-08-10T09:00:00+09:00',
    updatedAt: '2026-08-10T09:00:00+09:00',
  };
}

function linkedStay(plan, opts = {}) {
  const parts = planToStayParts(plan, HOSPITAL_ID);
  return {
    parts,
    stay: stayWith({ hospital: parts.hospital, appointments: parts.appointments, periods: parts.periods, ...opts }),
  };
}

// ───────────────────────────────────────────────────────────────────────────

describe('지침 계약 v2 — 형식 검증 (spec 5.3)', () => {
  test('계약 버전은 2다', () => {
    assert.equal(PLAN_VERSION, 2);
  });

  test('데모 지침 3종이 모두 유효한 v2다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      const plan = make(NOW_MS);
      const { valid, errors } = validatePlan(plan);
      assert.equal(valid, true, `${plan.planId}: ${errors.join(', ')}`);
      assert.equal(plan.schemaVersion, 2);
    }
  });

  test('규칙 48 — v1 지침은 거부한다', () => {
    const { valid, errors } = validatePlan(legacyV1Plan());
    assert.equal(valid, false);
    assert.ok(errors.includes('schemaVersion'));
  });

  test('계약 버전이 없거나 다르면 거부한다', () => {
    for (const schemaVersion of [undefined, 3, '2']) {
      const plan = { ...demoPlanStandard(NOW_MS), schemaVersion };
      assert.equal(validatePlan(plan).valid, false, String(schemaVersion));
    }
  });

  test('필수 필드가 빠지면 지침 전체를 거부한다', () => {
    const base = demoPlanStandard(NOW_MS);
    for (const drop of ['planId', 'version', 'issuedAt', 'expiresAt', 'revoked', 'issuer', 'hospital', 'periods', 'instructions']) {
      const broken = { ...base };
      delete broken[drop];
      assert.equal(validatePlan(broken).valid, false, `${drop} 없이 통과했다`);
    }
  });

  test('선택 필드(updatedAt·demo·appointments·phone)는 없어도 된다', () => {
    const plan = demoPlanStandard(NOW_MS);
    delete plan.updatedAt;
    delete plan.demo;
    delete plan.appointments;
    delete plan.hospital.phone;
    assert.equal(validatePlan(plan).valid, true, validatePlan(plan).errors.join(', '));
  });

  test('버전은 1 이상의 정수다', () => {
    for (const version of [0, -1, 1.5, '3']) {
      assert.equal(validatePlan({ ...demoPlanStandard(NOW_MS), version }).valid, false, String(version));
    }
  });

  test('기간 날짜가 역순이면 지침 전체를 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[1] = { ...plan.periods[1], startDate: d(5), endDate: d(3) };
    const { valid, errors } = validatePlan(plan);
    assert.equal(valid, false);
    assert.ok(errors.includes('periods[1].endDate'), errors.join(', '));
  });

  test('기간 날짜가 달력에 없거나 비어 있으면 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[0] = { ...plan.periods[0], startDate: '2026-02-30' };
    assert.equal(validatePlan(plan).valid, false);
  });

  test('병원 발행 기간에는 모르겠음이 없다 — 값 있음·아니오만 받는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[0].items.walkLimit = { kind: 'UNKNOWN' };
    const { valid, errors } = validatePlan(plan);
    assert.equal(valid, false);
    assert.ok(errors.includes('periods[0].items.walkLimit'));

    const outing = demoPlanStandard(NOW_MS);
    outing.periods[0].items.outing = 'UNKNOWN';
    assert.equal(validatePlan(outing).valid, false);
  });

  test('외출 불가가 아닌 기간에 복귀 시각이 없으면 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    delete plan.periods[0].items.returnTime;
    assert.equal(validatePlan(plan).valid, false);
  });

  test('외출 불가 기간에는 복귀 시각이 없어도 된다', () => {
    const plan = demoPlanRestricted(NOW_MS);
    assert.equal(plan.periods[0].items.outing, 'FORBIDDEN');
    assert.equal('returnTime' in plan.periods[0].items, false);
    assert.equal(validatePlan(plan).valid, true);
  });

  test('원문의 병원 복귀에는 hospitalId 가 없다 — 있으면 계약 위반이다 (발행 병원을 뜻한다)', () => {
    const plan = demoPlanStandard(NOW_MS);
    const hospitalReturn = plan.periods.find((p) => p.items.returnTime?.place === 'HOSPITAL');
    assert.ok(hospitalReturn, '데모 A 에 병원 복귀 기간이 있어야 한다');
    assert.equal('hospitalId' in hospitalReturn.items.returnTime, false);
    hospitalReturn.items.returnTime.hospitalId = 'H-OTHER';
    assert.equal(validatePlan(plan).valid, false);
  });

  test('예/아니오 값이 문자열이면 거부한다 — "false" 는 참이 되어버린다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[0].items.avoidUv = { kind: 'SET', value: 'false' };
    assert.equal(validatePlan(plan).valid, false);
  });

  test('보행·이동 한도는 5–240분이다', () => {
    for (const value of [4, 241, -1, '20']) {
      const plan = demoPlanStandard(NOW_MS);
      plan.periods[0].items.walkLimit = { kind: 'SET', value };
      assert.equal(validatePlan(plan).valid, false, String(value));
    }
  });

  test('복약 시각은 HH:MM 만 받는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[0].items.medication = { kind: 'SET', value: [{ time: '25:00', atLodging: true }] };
    assert.equal(validatePlan(plan).valid, false);
  });

  test('병원 좌표는 대한민국 범위만 받는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.hospital.address = { ...plan.hospital.address, lat: 200 };
    assert.equal(validatePlan(plan).valid, false);
    const abroad = demoPlanStandard(NOW_MS);
    abroad.hospital.address = { ...abroad.hospital.address, lat: 35.68, lng: 139.76 };
    assert.equal(validatePlan(abroad).valid, false);
  });

  test('병원 이름은 40자까지다 — 체류의 병원 모델과 같다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.hospital.name = '가'.repeat(41);
    assert.equal(validatePlan(plan).valid, false);
  });

  test('병원 일정의 유형·날짜·시각을 검사한다', () => {
    const cases = [
      { type: 'SURGERY', date: d(1), start: '10:00' },
      { type: 'VISIT', date: 'tomorrow', start: '10:00' },
      { type: 'VISIT', date: d(1), start: '9:00' },
      { type: 'VISIT', date: d(1), start: '10:00', end: '09:00' },
    ];
    for (const appointment of cases) {
      const plan = { ...demoPlanStandard(NOW_MS), appointments: [appointment] };
      assert.equal(validatePlan(plan).valid, false, JSON.stringify(appointment));
    }
  });

  test('안내 분류가 정의 밖이면 거부한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.instructions[0].category = 'diagnosis';
    assert.equal(validatePlan(plan).valid, false);
  });

  test('안내 id 가 겹치면 거부한다 — 확인 기록 키가 섞인다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.instructions[1] = { ...plan.instructions[1], id: plan.instructions[0].id };
    assert.equal(validatePlan(plan).valid, false);
  });

  test('중요 분류는 정의된 7종의 부분집합이다', () => {
    assert.equal(INSTRUCTION_CATEGORIES.length, 7);
    for (const c of CRITICAL_CATEGORIES) assert.ok(INSTRUCTION_CATEGORIES.includes(c));
  });
});

describe('지침 상태 — 유효기간 안이고 철회되지 않음 (spec 4.6)', () => {
  test('유효하면 ACTIVE, 만료 시각부터 EXPIRED, 철회면 REVOKED', () => {
    const plan = demoPlanStandard(NOW_MS);
    const expiry = Date.parse(plan.expiresAt);
    assert.equal(planStatus(plan, { now: NOW }), PLAN_STATUS.ACTIVE);
    assert.equal(planStatus(plan, { now: expiry - 1 }), PLAN_STATUS.ACTIVE);
    assert.equal(planStatus(plan, { now: expiry }), PLAN_STATUS.EXPIRED);
    assert.equal(planStatus({ ...plan, revoked: true }, { now: NOW }), PLAN_STATUS.REVOKED);
    assert.equal(planStatus(demoPlanExpired(NOW_MS), { now: NOW }), PLAN_STATUS.EXPIRED);
  });

  test('24시간 한도는 쓰지 않는다 — 받은 지 며칠이 지나도 유효기간 안이면 ACTIVE', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.equal(planStatus(plan, { now: NOW_MS + 3 * 24 * 3600_000 }), PLAN_STATUS.ACTIVE);
  });
});

describe('게이트웨이 — v2 허용 목록 (규칙 48)', () => {
  test('허용 목록 밖 필드를 모든 층에서 잘라낸다', () => {
    const raw = demoPlanStandard(NOW_MS);
    raw.diagnosis = '민감정보-진단';
    raw.patientName = '홍길동';
    raw.patientRecall = true;
    raw.anchor = { lat: 1, lng: 2 };
    raw.issuer.licenseNo = '면허-123';
    raw.hospital.fax = '팩스-번호';
    raw.hospital.address.jibunAddress = '지번-주소';
    raw.periods[0].note = '기간-메모';
    raw.periods[0].id = 'P-RAW';
    raw.periods[0].items.internalRiskScore = 7;
    raw.periods[0].items.returnTime.memo = '복귀-메모';
    raw.periods[0].items.walkLimit.reason = '보행-사유';
    raw.periods[0].items.diet.sugar = { kind: 'SET', value: true };
    raw.periods[0].items.medication.value[0].drugName = '약물-이름';
    raw.periods[1].items.mealRestriction = { kind: 'SET', value: { mode: 'UNTIL', until: '12:00', why: '식사-사유' } };
    raw.appointments[0].doctorName = '의사-이름';
    raw.instructions[0].internalNote = '의료진-메모';

    const min = minimizePlan(raw);
    const json = JSON.stringify(min);
    for (const leaked of [
      '민감정보-진단',
      '홍길동',
      'patientRecall',
      'anchor',
      '면허-123',
      '팩스-번호',
      '지번-주소',
      '기간-메모',
      'P-RAW',
      'internalRiskScore',
      '복귀-메모',
      '보행-사유',
      'sugar',
      '약물-이름',
      '식사-사유',
      '의사-이름',
      '의료진-메모',
    ]) {
      assert.equal(json.includes(leaked), false, `${leaked} 가 남았다`);
    }
    assert.equal(validatePlan(min).valid, true, validatePlan(min).errors.join(', '));
  });

  test('허용 목록 안의 값은 그대로 둔다 — 최소화가 값을 바꾸지 않는다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      const plan = make(NOW_MS);
      assert.deepEqual(minimizePlan(plan), plan);
    }
  });

  test('원문 병원 복귀의 hospitalId 는 목록 밖이라 버린다', () => {
    const raw = demoPlanStandard(NOW_MS);
    const period = raw.periods.find((p) => p.items.returnTime?.place === 'HOSPITAL');
    period.items.returnTime.hospitalId = 'H-OTHER';
    const min = minimizePlan(raw);
    assert.equal(JSON.stringify(min).includes('H-OTHER'), false);
  });

  test('v1 의 anchor·constraints 는 v2 결과에 남지 않는다', () => {
    const min = minimizePlan(legacyV1Plan());
    assert.equal('anchor' in min, false);
    assert.equal('constraints' in min, false);
  });

  test('규칙 48 — v1 지침 코드를 연결하면 거부된다', async () => {
    const adapter = demoAdapter({ OLD: legacyV1Plan });
    const result = await redeemPlan(adapter, 'OLD');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_plan');
    assert.ok(result.errors.includes('schemaVersion'));
    assert.equal('plan' in result, false, '거부한 지침을 돌려주지 않는다');
  });

  test('값 자리에 객체를 끼워 넣어도 목록 밖 내용이 남지 않는다', () => {
    const raw = demoPlanStandard(NOW_MS);
    raw.planId = { secret: '숨은-값' };
    raw.periods[0].items.avoidUv = { kind: 'SET', value: { secret: '숨은-값' } };
    const min = minimizePlan(raw);
    assert.equal(JSON.stringify(min).includes('숨은-값'), false);
    assert.equal(validatePlan(min).valid, false);
  });
});

describe('데모 어댑터와 데모 지침 (spec 4.20)', () => {
  const adapter = demoAdapter(DEMO_FIXTURES);

  test('코드로 지침을 찾는다 — 대소문자·공백을 무시한다', async () => {
    for (const code of ['demo-a', ' DEMO-A ', 'Demo-A', 'DEMO - A']) {
      const result = await redeemPlan(adapter, code);
      assert.equal(result.ok, true, code);
      assert.equal(result.plan.planId, 'DEMO-PLAN-A');
      assert.equal(result.plan.schemaVersion, 2);
    }
    assert.equal(normalizeLinkCode(' demo - b '), 'DEMO-B');
  });

  test('모르는 코드는 지침을 주지 않는다', async () => {
    const result = await redeemPlan(adapter, 'NOPE');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown_code');
  });

  test('깨진 지침은 통과시키지 않는다 — 깨진 지침으로 판정하면 안전 사고다', async () => {
    const broken = demoAdapter({ BAD: () => ({ planId: 'x', schemaVersion: 2 }) });
    const result = await redeemPlan(broken, 'BAD');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_plan');
    assert.ok(result.errors.length > 0);
  });

  test('데모 지침에는 데모 표시가 박혀 있다 — 실제 연동처럼 보이면 안 된다', async () => {
    for (const code of ['DEMO-A', 'DEMO-B', 'DEMO-C']) {
      const { plan } = await redeemPlan(adapter, code);
      assert.equal(plan.demo, true, code);
      assert.ok(plan.issuer.name.startsWith('(데모)'), code);
      assert.ok(plan.hospital.name.startsWith('(데모)'), code);
      assert.ok(plan.hospital.address.roadAddress.startsWith('(데모)'), code);
      assert.equal('phone' in plan.hospital, false, '데모 병원에 전화번호를 두지 않는다');
    }
  });

  test('DEMO-A 는 외출 허용 기간을 포함한 정상 지침이다', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.ok(plan.periods.some((p) => p.items.outing === 'ALLOWED'));
    assert.ok(plan.periods.every((p) => p.items.outing !== 'FORBIDDEN'));
    assert.equal(planStatus(plan, { now: NOW }), PLAN_STATUS.ACTIVE);
    // 마지막 기간의 마지막 날 활동 종료보다 늦게 만료된다 — 잘리지 않고 모두 적용된다
    const lastEnd = plan.periods.map((p) => p.endDate).sort().at(-1);
    assert.ok(Date.parse(plan.expiresAt) > kstInstantMs(lastEnd, '21:00'));
  });

  test('DEMO-B 는 외출 불가 기간을 포함한다', () => {
    const plan = demoPlanRestricted(NOW_MS);
    assert.ok(plan.periods.some((p) => p.items.outing === 'FORBIDDEN'));
    assert.equal(planStatus(plan, { now: NOW }), PLAN_STATUS.ACTIVE);
  });

  test('DEMO-C 는 이미 만료된 지침이다', () => {
    assert.equal(planStatus(demoPlanExpired(NOW_MS), { now: NOW }), PLAN_STATUS.EXPIRED);
  });

  test('데모 날짜는 now 기준 상대값이다 (KST 날짜)', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.equal(plan.periods[0].startDate, D0);
    const later = demoPlanStandard(NOW_MS + 2 * 24 * 3600_000);
    assert.equal(later.periods[0].startDate, d(2));
  });

  test('데모 지침에 개인 식별정보가 없다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      const json = JSON.stringify(make(NOW_MS));
      for (const forbidden of ['주민등록', '@', '010-']) {
        assert.equal(json.includes(forbidden), false, `${forbidden} 가 fixture 에 있다`);
      }
    }
  });

  test('데모 지침은 확인 여부를 싣지 않는다 — 확인 기록은 기기의 정본에만 있다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      assert.ok(make(NOW_MS).instructions.every((i) => !('acknowledged' in i)));
    }
  });

  test('데모 지침에는 한 기간 안의 동행 모순이 없다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      assert.deepEqual(planToStayParts(make(NOW_MS), HOSPITAL_ID).conflictingPeriodIds, []);
    }
  });
});

describe('변환 — (지침, 연결 병원 id) → 병원·일정·기간', () => {
  test('병원·일정·기간을 체류 모델 모양으로 만든다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const { hospital, appointments, periods } = planToStayParts(plan, HOSPITAL_ID);

    assert.deepEqual(hospital, {
      id: HOSPITAL_ID,
      name: plan.hospital.name,
      address: { ...plan.hospital.address, source: 'DEMO' },
      linkedPlanId: plan.planId,
    });

    assert.equal(appointments.length, plan.appointments.length);
    for (const [i, a] of appointments.entries()) {
      assert.equal(a.source, 'HOSPITAL');
      assert.equal(a.hospitalId, HOSPITAL_ID);
      assert.equal(a.type, plan.appointments[i].type);
      assert.equal(a.date, plan.appointments[i].date);
      assert.equal(a.start, plan.appointments[i].start);
    }

    assert.equal(periods.length, plan.periods.length);
    for (const p of periods) {
      assert.equal(p.source, 'HOSPITAL');
      assert.equal(p.planId, plan.planId);
      assert.equal(p.planVersion, plan.version);
      assert.equal(p.hospitalId, HOSPITAL_ID);
      assert.equal(p.expiresAt, plan.expiresAt);
      assert.equal(p.revoked, plan.revoked);
      assert.equal(validateConditionPeriod(p, { hospitals: [hospital] }).ok, true, JSON.stringify(p));
    }
  });

  test('규칙 57 — 병원 복귀 기간의 hospitalId 가 연결 병원 id 로 채워진다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const index = plan.periods.findIndex((p) => p.items.returnTime?.place === 'HOSPITAL');
    const { periods } = planToStayParts(plan, HOSPITAL_ID);
    assert.deepEqual(periods[index].items.returnTime, {
      kind: 'SET',
      time: plan.periods[index].items.returnTime.time,
      place: 'HOSPITAL',
      hospitalId: HOSPITAL_ID,
    });
    // 같은 지침을 다른 병원에 연결하면 그 병원으로 채워진다
    const other = planToStayParts(plan, 'H-EXISTING').periods[index];
    assert.equal(other.items.returnTime.hospitalId, 'H-EXISTING');
  });

  test('숙소 복귀에는 hospitalId 를 붙이지 않는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const index = plan.periods.findIndex((p) => p.items.returnTime?.place === 'LODGING');
    const { periods } = planToStayParts(plan, HOSPITAL_ID);
    assert.equal('hospitalId' in periods[index].items.returnTime, false);
  });

  test('연결 병원이 정해지기 전에는 변환하지 않는다', () => {
    for (const id of [undefined, null, '', '   ', 7]) {
      assert.throws(() => planToStayParts(demoPlanStandard(NOW_MS), id), TypeError, String(id));
    }
  });

  test('형식이 틀린 지침(v1 포함)은 변환하지 않는다', () => {
    assert.throws(() => planToStayParts(legacyV1Plan(), HOSPITAL_ID), TypeError);
    assert.throws(() => planToStayParts(null, HOSPITAL_ID), TypeError);
  });

  test('기간을 만료 시각에 맞춰 잘라내지 않는다 — 날짜 범위를 그대로 저장한다', () => {
    const plan = demoPlanStandard(NOW_MS);
    // 두 번째 기간 도중에 만료되게 한다
    plan.expiresAt = new Date(kstInstantMs(d(4), '12:00')).toISOString();
    const { periods } = planToStayParts(plan, HOSPITAL_ID);
    for (const [i, p] of periods.entries()) {
      assert.equal(p.startDate, plan.periods[i].startDate);
      assert.equal(p.endDate, plan.periods[i].endDate);
      assert.equal(p.expiresAt, plan.expiresAt);
    }
  });

  test('철회된 지침도 기간을 저장하고 철회 사실을 싣는다', () => {
    const plan = { ...demoPlanStandard(NOW_MS), revoked: true };
    const { periods } = planToStayParts(plan, HOSPITAL_ID);
    assert.equal(periods.length, plan.periods.length);
    assert.ok(periods.every((p) => p.revoked === true));
  });

  test('일정이 없는 지침은 빈 일정 목록이 된다', () => {
    const plan = demoPlanStandard(NOW_MS);
    delete plan.appointments;
    assert.deepEqual(planToStayParts(plan, HOSPITAL_ID).appointments, []);
  });

  test('id 는 결정적이고 겹치지 않는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const a = planToStayParts(plan, HOSPITAL_ID);
    const b = planToStayParts(plan, HOSPITAL_ID);
    assert.deepEqual(a, b);
    const ids = [...a.periods.map((p) => p.id), ...a.appointments.map((x) => x.id)];
    assert.equal(new Set(ids).size, ids.length);
  });

  test('입력 지침을 바꾸지 않고, 결과가 입력과 객체를 공유하지 않는다', () => {
    const plan = deepFreeze(demoPlanStandard(NOW_MS));
    const { periods, hospital } = planToStayParts(plan, HOSPITAL_ID);
    periods[0].items.walkLimit.value = 999;
    hospital.address.lat = 0;
    assert.notEqual(plan.periods[0].items.walkLimit.value, 999);
  });

  test('변환 결과로 만든 체류가 체류 검증을 통과한다', () => {
    for (const make of [demoPlanStandard, demoPlanRestricted, demoPlanExpired]) {
      const { stay } = linkedStay(make(NOW_MS));
      const result = validateStay(stay);
      assert.equal(result.ok, true, `${make.name}: ${result.fields.join(', ')}`);
    }
  });

  test('채널 B — 안내문은 변환 결과(판정 입력)에 실리지 않고, 바꿔도 결과가 같다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const parts = planToStayParts(plan, HOSPITAL_ID);
    const json = JSON.stringify(parts);
    for (const item of plan.instructions) assert.equal(json.includes(item.text), false);

    const edited = demoPlanStandard(NOW_MS);
    edited.instructions = edited.instructions.map((i) => ({ ...i, text: '(테스트) 바뀐 문장' }));
    assert.deepEqual(planToStayParts(edited, HOSPITAL_ID), parts);
  });
});

describe('날짜별 적용 — 기간 보존과 규칙 12 (src/stay 합성과 통합)', () => {
  test('DEMO-A 를 연결하면 기간이 병원 발행 출처로 합성에 참여한다', () => {
    const { stay, parts } = linkedStay(demoPlanStandard(NOW_MS));
    const c = classifyDate(stay, d(2));
    assert.equal(c.coverage, 'RESTRICTED');
    assert.deepEqual(c.appliedPeriodIds, [parts.periods[0].id]);
    assert.ok(c.effective.walkLimit.provenance.every((p) => p.source === 'HOSPITAL' && p.defaulted === false));

    // 병원 복귀 기간: 연결 병원 좌표로 복귀를 계산할 수 있다 (docs/business-rules.md '숙소와 병원', docs/contracts.md '`POST /api/plan/link`')
    const visitDay = classifyDate(stay, d(4));
    assert.equal(visitDay.limits.returnTime.place, 'HOSPITAL');
    assert.equal(visitDay.limits.returnTime.hospitalId, HOSPITAL_ID);
  });

  test('DEMO-B 의 외출 불가 기간은 REST_DAY 다', () => {
    const { stay } = linkedStay(demoPlanRestricted(NOW_MS), { boundary: d(-1) });
    const c = classifyDate(stay, D0);
    assert.equal(c.coverage, 'REST_DAY');
    assert.ok(c.reasons.includes(REASON.OUTING_FORBIDDEN));
  });

  test('만료가 기간 도중이면 만료 전 날짜만 적용되고, 경계일 이후 만료 날짜는 입력이 필요하다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.expiresAt = new Date(kstInstantMs(d(4), '12:00')).toISOString();
    const { stay, parts } = linkedStay(plan);
    // 두 번째 기간은 d3–d5 이지만 잘리지 않고 저장된다
    assert.equal(parts.periods[1].endDate, d(5));

    assert.equal(classifyDate(stay, d(3)).coverage, 'RESTRICTED');
    // d4 는 활동 종료(21:00) 전에 만료되므로 덮지 않는다(보수적 처리)
    for (const date of [d(4), d(5)]) {
      const c = classifyDate(stay, date);
      assert.equal(c.coverage, 'NEEDS_INPUT', date);
      assert.deepEqual(c.reasons, [REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED], date);
    }
  });

  test('규칙 12 — 이미 만료된 DEMO-C 를 연결해도 기간은 저장되고 날짜별 규칙이 적용된다', () => {
    const plan = demoPlanExpired(NOW_MS);
    const { stay, parts } = linkedStay(plan, { boundary: d(1) });
    assert.equal(parts.periods.length, plan.periods.length, '기간을 버리지 않는다');
    assert.ok(parts.periods.every((p) => p.expiresAt === plan.expiresAt));

    // 경계일 전 — 만료된 병원 기간만 덮으면 자유일
    assert.equal(classifyDate(stay, D0).coverage, 'FREE');
    // 경계일 이후 — 만료된 병원 기간만 덮으면 입력 필요(만료 사유). 병원 값을 본인 체크로 옮기지 않는다
    for (let n = 1; n <= 5; n += 1) {
      const c = classifyDate(stay, d(n));
      assert.equal(c.coverage, 'NEEDS_INPUT', d(n));
      assert.deepEqual(c.reasons, [REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED], d(n));
    }
    // 기간이 덮지 않는 경계일 이후 날짜는 일반 입력 필요
    assert.deepEqual(classifyDate(stay, d(6)).reasons, [REASON.CONDITION_INPUT_REQUIRED]);
  });
});

describe('규칙 11 — 한 병원 기간 안의 동행 모순', () => {
  function contradictory() {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods[0].items = hospitalItems({
      returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' },
      escortRequired: YES(),
      guardianMustStay: NONE(),
    });
    return plan;
  }

  test('모순은 지침 거부가 아니라 표시다 — 변환 결과가 그 기간을 알린다', () => {
    const plan = contradictory();
    assert.equal(validatePlan(plan).valid, true);
    const { periods, conflictingPeriodIds } = planToStayParts(plan, HOSPITAL_ID);
    assert.deepEqual(conflictingPeriodIds, [periods[0].id]);
  });

  test('그 기간이 덮는 날짜는 CONFLICTING_CONDITION 으로 막힌다', () => {
    const { stay } = linkedStay(contradictory());
    for (const date of [D0, d(1), d(2)]) {
      const c = classifyDate(stay, date);
      assert.equal(c.blocked, true, date);
      assert.ok(c.reasons.includes(REASON.CONFLICTING_CONDITION), date);
      assert.equal(c.patientOutingAllowed, false, date);
    }
    assert.equal(classifyDate(stay, d(3)).blocked, false, '다른 기간 날짜는 막지 않는다');
  });

  test('서로 다른 기간끼리의 차이는 모순이 아니다', () => {
    const plan = demoPlanStandard(NOW_MS);
    plan.periods = [
      { startDate: D0, endDate: d(2), items: hospitalItems({ returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' }, escortRequired: YES(), guardianMustStay: YES() }) },
      { startDate: D0, endDate: d(2), items: hospitalItems({ returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' } }) },
    ];
    assert.deepEqual(planToStayParts(plan, HOSPITAL_ID).conflictingPeriodIds, []);
  });
});

describe('안내문 확인 기록 — `id@updatedAt` 키 (규칙 56)', () => {
  const plan = demoPlanStandard(NOW_MS);
  const allAcked = () => Object.fromEntries(plan.instructions.map((i) => [acknowledgementKey(i), true]));

  test('키는 안내문 id 와 수정 시각이다', () => {
    const item = plan.instructions[0];
    assert.equal(acknowledgementKey(item), `${item.id}@${item.updatedAt}`);
  });

  test('확인 기록이 없으면 중요 안내가 모두 미확인이다', () => {
    const critical = plan.instructions.filter((i) => CRITICAL_CATEGORIES.includes(i.category));
    assert.ok(critical.length > 0);
    assert.deepEqual(unconfirmedCritical(plan, {}).map((i) => i.id), critical.map((i) => i.id));
    assert.deepEqual(unconfirmedCritical(plan).map((i) => i.id), critical.map((i) => i.id));
    assert.equal(unconfirmedInstructions(plan, {}).length, plan.instructions.length);
  });

  test('모두 확인하면 미확인 중요 안내가 없다', () => {
    assert.deepEqual(unconfirmedCritical(plan, allAcked()), []);
    assert.deepEqual(unconfirmedInstructions(plan, allAcked()), []);
  });

  test('중요하지 않은 분류는 확인하지 않아도 중요 목록에 없다', () => {
    const onlyCritical = Object.fromEntries(
      plan.instructions.filter((i) => CRITICAL_CATEGORIES.includes(i.category)).map((i) => [acknowledgementKey(i), true]),
    );
    assert.deepEqual(unconfirmedCritical(plan, onlyCritical), []);
    assert.ok(unconfirmedInstructions(plan, onlyCritical).length > 0);
  });

  test('같은 id 라도 updatedAt 이 바뀌면 확인이 풀리고 PLAN_UNCONFIRMED_UPDATE 가 덧씌워진다', () => {
    const acked = allAcked();
    const next = demoPlanStandard(NOW_MS);
    const target = next.instructions.find((i) => i.category === 'activity');
    target.updatedAt = new Date(NOW_MS + 60_000).toISOString();

    const pending = unconfirmedCritical(next, acked);
    assert.deepEqual(pending.map((i) => i.id), [target.id]);

    const stored = { date: D0, dayState: STATE.TOGETHER, reasons: [], outings: [{ id: 'o1' }], guardianOutings: [] };
    const shown = overlayTodayGate(stored, { unconfirmedHospitalUpdate: pending.length > 0 });
    assert.equal(shown.dayState, STATE.STANDBY);
    assert.deepEqual(shown.reasons, [REASON.PLAN_UNCONFIRMED_UPDATE]);
    assert.equal(stored.dayState, STATE.TOGETHER, '저장된 일정은 바뀌지 않는다');
  });

  test('지침에 실려 온 acknowledged 는 확인으로 치지 않는다 — 정본은 기기의 확인 기록이다', () => {
    const withFlags = demoPlanStandard(NOW_MS);
    withFlags.instructions = withFlags.instructions.map((i) => ({ ...i, acknowledged: true }));
    assert.equal(validatePlan(withFlags).valid, true);
    assert.ok(unconfirmedCritical(withFlags, {}).length > 0);
  });

  test('연결 사본은 안내문의 acknowledged 를 버리고 나머지는 받은 그대로 둔다', () => {
    const received = demoPlanStandard(NOW_MS);
    received.instructions = received.instructions.map((i) => ({ ...i, acknowledged: true }));
    const linked = toLinkedPlan({
      code: ' demo-a ',
      hospitalId: HOSPITAL_ID,
      plan: received,
      fetchedAt: NOW.toISOString(),
    });
    assert.equal(linked.code, 'DEMO-A');
    assert.equal(linked.hospitalId, HOSPITAL_ID);
    assert.equal(linked.fetchedAt, NOW.toISOString());
    assert.deepEqual(linked.acknowledged, {});
    assert.ok(linked.plan.instructions.every((i) => !('acknowledged' in i)));
    assert.deepEqual(linked.plan, stripAcknowledged(received));
    assert.deepEqual(linked.plan.periods, received.periods);
    assert.ok(received.instructions.every((i) => i.acknowledged === true), '받은 지침은 바꾸지 않는다');
  });

  test('다시 받은 사본은 그대로인 안내문의 확인만 이어받는다', () => {
    const acked = allAcked();
    const next = demoPlanStandard(NOW_MS);
    const changed = next.instructions[0];
    changed.updatedAt = new Date(NOW_MS + 60_000).toISOString();
    const linked = toLinkedPlan({ code: 'DEMO-A', hospitalId: HOSPITAL_ID, plan: next, fetchedAt: NOW.toISOString(), acknowledged: acked });
    assert.equal(linked.acknowledged[acknowledgementKey(changed)], undefined);
    assert.equal(Object.keys(linked.acknowledged).length, next.instructions.length - 1);
    assert.ok(Object.values(linked.acknowledged).every((v) => v === true));
  });

  test('연결 사본은 형식이 맞는 지침·병원 id·코드·받은 시각이 있어야 만든다', () => {
    const ok = { code: 'DEMO-A', hospitalId: HOSPITAL_ID, plan: demoPlanStandard(NOW_MS), fetchedAt: NOW.toISOString() };
    assert.throws(() => toLinkedPlan({ ...ok, code: ' ' }), TypeError);
    assert.throws(() => toLinkedPlan({ ...ok, hospitalId: '' }), TypeError);
    assert.throws(() => toLinkedPlan({ ...ok, plan: legacyV1Plan() }), TypeError);
    assert.throws(() => toLinkedPlan({ ...ok, fetchedAt: 'yesterday' }), TypeError);
  });
});

describe('재확인 — 버전 변경·철회·만료 (spec 4.20, 4.6)', () => {
  test('같은 지침이면 변화가 없다', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.deepEqual(recheckLinkedPlan(plan, demoPlanStandard(NOW_MS), { now: NOW }), {
      versionChanged: false,
      revoked: false,
      expired: false,
      changedPeriods: [],
    });
  });

  test('결과에 환자 호출 필드가 없다 — 호출은 데모 사건으로만 다룬다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const result = recheckLinkedPlan(plan, plan, { now: NOW });
    assert.deepEqual(Object.keys(result).sort(), ['changedPeriods', 'expired', 'revoked', 'versionChanged']);
  });

  test('버전이 바뀌면 알리고, 내용이 바뀐 기간만 날짜 범위와 함께 돌려준다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const next = demoPlanStandard(NOW_MS);
    next.version = previous.version + 1;
    next.periods[1] = {
      ...next.periods[1],
      endDate: d(6),
      items: { ...next.periods[1].items, walkLimit: { kind: 'SET', value: 10 } },
    };
    const result = recheckLinkedPlan(previous, next, { now: NOW });
    assert.equal(result.versionChanged, true);
    assert.deepEqual(result.changedPeriods, [
      {
        index: 1,
        before: { startDate: previous.periods[1].startDate, endDate: previous.periods[1].endDate },
        after: { startDate: previous.periods[1].startDate, endDate: d(6) },
      },
    ]);
  });

  test('안내문만 바뀌면 기간 변화는 없다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const next = demoPlanStandard(NOW_MS);
    next.version += 1;
    next.instructions[0].updatedAt = new Date(NOW_MS + 60_000).toISOString();
    const result = recheckLinkedPlan(previous, next, { now: NOW });
    assert.equal(result.versionChanged, true);
    assert.deepEqual(result.changedPeriods, []);
  });

  test('기간이 늘거나 줄면 없는 쪽을 null 로 알린다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const shorter = demoPlanStandard(NOW_MS);
    shorter.periods = shorter.periods.slice(0, 1);
    assert.deepEqual(recheckLinkedPlan(previous, shorter, { now: NOW }).changedPeriods, [
      { index: 1, before: { startDate: previous.periods[1].startDate, endDate: previous.periods[1].endDate }, after: null },
    ]);
    assert.deepEqual(recheckLinkedPlan(shorter, previous, { now: NOW }).changedPeriods, [
      { index: 1, before: null, after: { startDate: previous.periods[1].startDate, endDate: previous.periods[1].endDate } },
    ]);
  });

  test('철회되면 알리고, 모든 기간의 적용이 바뀌므로 모든 기간을 돌려준다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const next = { ...demoPlanStandard(NOW_MS), revoked: true };
    const result = recheckLinkedPlan(previous, next, { now: NOW });
    assert.equal(result.revoked, true);
    assert.deepEqual(result.changedPeriods.map((c) => c.index), [0, 1]);
  });

  test('만료 시각이 바뀌면 모든 기간을 돌려준다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const next = demoPlanStandard(NOW_MS);
    next.expiresAt = new Date(Date.parse(previous.expiresAt) + 24 * 3600_000).toISOString();
    assert.deepEqual(recheckLinkedPlan(previous, next, { now: NOW }).changedPeriods.map((c) => c.index), [0, 1]);
  });

  test('시간이 지나 만료되면 알린다 — 기간 내용은 그대로다', () => {
    const plan = demoPlanStandard(NOW_MS);
    const after = Date.parse(plan.expiresAt);
    const result = recheckLinkedPlan(plan, demoPlanStandard(NOW_MS), { now: after });
    assert.equal(result.expired, true);
    assert.equal(result.revoked, false);
    assert.deepEqual(result.changedPeriods, []);
  });

  test('다른 지침으로 바뀌면 버전 변경이고 모든 기간을 돌려준다', () => {
    const previous = demoPlanStandard(NOW_MS);
    const next = { ...demoPlanStandard(NOW_MS), planId: 'DEMO-PLAN-Z' };
    const result = recheckLinkedPlan(previous, next, { now: NOW });
    assert.equal(result.versionChanged, true);
    assert.deepEqual(result.changedPeriods.map((c) => c.index), [0, 1]);
  });

  test('형식이 틀린 지침으로는 재확인하지 않는다', () => {
    const plan = demoPlanStandard(NOW_MS);
    assert.throws(() => recheckLinkedPlan(plan, legacyV1Plan(), { now: NOW }), TypeError);
    assert.throws(() => recheckLinkedPlan(legacyV1Plan(), plan, { now: NOW }), TypeError);
  });
});
