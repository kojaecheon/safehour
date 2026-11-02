// 병원 연동 화면의 순수 함수 — 체류에 지침 합치기, 일정 중복 건너뛰기, 안내 확인 (AX-315 · spec 4.20, 5.1, 규칙 12·56·57)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledgeAllMap,
  applyLinkedPlan,
  guideEntries,
  linkErrorKey,
  linkHospitalId,
  mergeAppointments,
  planState,
} from '../components/conditions/linkPlan.js';
import { demoPlanExpired, demoPlanRestricted, demoPlanStandard } from '../src/recovery/fixtures.js';
import { unconfirmedCritical } from '../src/recovery/instructions.js';
import { validateStay } from '../src/stay/stay.js';
import { makeStay } from './stay-fixtures.js';

// KST 2026-10-02 09:00 — 데모 지침 기간은 10-02~10-04, 10-05~10-07, 내원 10-03 10:00
const NOW = Date.parse('2026-10-02T00:00:00Z');
const FETCHED_AT = new Date(NOW).toISOString();

function stayWith(overrides = {}) {
  return makeStay({
    hospitals: [
      { id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 1', lat: 37.52, lng: 127.02, source: 'DEMO' } },
    ],
    ...overrides,
  });
}

describe('병원 일정 합치기 — 같은 날짜·시각·유형은 건너뜀 (spec 4.20)', () => {
  const existing = [
    { id: 'A1', hospitalId: 'H1', type: 'VISIT', date: '2026-10-03', start: '10:00', source: 'USER' },
    { id: 'A2', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-03', start: '09:30', source: 'USER' },
  ];

  test('같은 날짜·시각·유형이 이미 있으면 더하지 않는다', () => {
    const incoming = [{ id: 'P:A1', hospitalId: 'H1', type: 'VISIT', date: '2026-10-03', start: '10:00', end: '10:30', source: 'HOSPITAL' }];
    const result = mergeAppointments(existing, incoming);
    assert.equal(result.appointments.length, 2);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.skipped.map((a) => a.id), ['P:A1']);
  });

  test('유형·시각·날짜 중 하나라도 다르면 더한다', () => {
    const incoming = [
      { id: 'P:A1', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-03', start: '10:00', source: 'HOSPITAL' },
      { id: 'P:A2', hospitalId: 'H1', type: 'VISIT', date: '2026-10-03', start: '10:30', source: 'HOSPITAL' },
      { id: 'P:A3', hospitalId: 'H1', type: 'VISIT', date: '2026-10-04', start: '10:00', source: 'HOSPITAL' },
    ];
    const result = mergeAppointments(existing, incoming);
    assert.deepEqual(result.added.map((a) => a.id), ['P:A1', 'P:A2', 'P:A3']);
    assert.equal(result.appointments.length, 5);
  });

  test('받은 목록 안의 중복도 한 번만 더한다', () => {
    const twin = { hospitalId: 'H1', type: 'VISIT', date: '2026-10-05', start: '11:00', source: 'HOSPITAL' };
    const result = mergeAppointments(existing, [{ ...twin, id: 'P:A1' }, { ...twin, id: 'P:A2' }]);
    assert.deepEqual(result.added.map((a) => a.id), ['P:A1']);
    assert.deepEqual(result.skipped.map((a) => a.id), ['P:A2']);
  });

  test('입력 배열을 바꾸지 않는다', () => {
    const before = structuredClone(existing);
    mergeAppointments(existing, [{ id: 'X', hospitalId: 'H1', type: 'VISIT', date: '2026-10-09', start: '09:00' }]);
    assert.deepEqual(existing, before);
  });
});

describe('지침을 체류에 합치기 — 기존 병원에 연결', () => {
  const plan = demoPlanStandard(NOW);

  test('기간은 잘라내지 않은 HOSPITAL 기간이고, 병원 복귀에는 연결 병원 id 가 채워진다(규칙 57)', () => {
    const { stay } = applyLinkedPlan(stayWith(), { code: 'demo-a', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const hospitalPeriods = stay.periods.filter((p) => p.source === 'HOSPITAL');
    assert.equal(hospitalPeriods.length, plan.periods.length);
    for (const p of hospitalPeriods) {
      assert.equal(p.hospitalId, 'H1');
      assert.equal(p.planId, plan.planId);
      assert.equal(p.expiresAt, plan.expiresAt);
      assert.equal(p.revoked, false);
    }
    const hospitalReturn = hospitalPeriods.find((p) => p.items.returnTime?.place === 'HOSPITAL');
    assert.equal(hospitalReturn.items.returnTime.hospitalId, 'H1');
  });

  test('기존 병원에 연결 표시(linkedPlanId)만 더하고 사용자가 넣은 이름·주소는 그대로 둔다', () => {
    const before = stayWith();
    const { stay } = applyLinkedPlan(before, { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.equal(stay.hospitals.length, 1);
    assert.equal(stay.hospitals[0].linkedPlanId, plan.planId);
    assert.equal(stay.hospitals[0].name, before.hospitals[0].name);
    assert.deepEqual(stay.hospitals[0].address, before.hospitals[0].address);
  });

  test('지침의 병원 일정은 연결 병원 일정으로 더하되, 같은 날짜·시각·유형은 건너뛴다', () => {
    const base = stayWith();
    base.appointments = [
      ...base.appointments,
      { id: 'A9', hospitalId: 'H1', type: 'VISIT', date: '2026-10-03', start: '10:00', source: 'USER' },
    ];
    const result = applyLinkedPlan(base, { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.equal(result.addedAppointments.length, 0);
    assert.equal(result.skippedAppointments.length, 1);
    assert.equal(result.stay.appointments.length, base.appointments.length);

    const fresh = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.equal(fresh.addedAppointments.length, 1);
    const added = fresh.stay.appointments.find((a) => a.source === 'HOSPITAL');
    assert.equal(added.hospitalId, 'H1');
    assert.equal(added.date, '2026-10-03');
  });

  test('연결 사본을 저장한다 — 코드는 정규화, 확인 기록은 비어 있고, 안내문의 acknowledged 는 버린다', () => {
    const withAck = structuredClone(plan);
    withAck.instructions[0].acknowledged = true;
    const { stay } = applyLinkedPlan(stayWith(), { code: ' demo-a ', plan: withAck, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.equal(stay.linkedPlans.length, 1);
    const [linked] = stay.linkedPlans;
    assert.equal(linked.code, 'DEMO-A');
    assert.equal(linked.hospitalId, 'H1');
    assert.equal(linked.fetchedAt, FETCHED_AT);
    assert.deepEqual(linked.acknowledged, {});
    assert.equal(linked.plan.instructions.some((i) => 'acknowledged' in i), false);
    assert.equal(unconfirmedCritical(linked.plan, linked.acknowledged).length > 0, true);
  });

  test('결과 체류는 체류 검증을 통과한다', () => {
    const { stay } = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const result = validateStay(stay);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test('없는 병원 id 로 연결하면 거부한다', () => {
    assert.throws(() =>
      applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H9' }, fetchedAt: FETCHED_AT }),
    );
  });

  test('입력 체류를 바꾸지 않는다', () => {
    const base = stayWith();
    const before = structuredClone(base);
    applyLinkedPlan(base, { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.deepEqual(base, before);
  });
});

describe('지침을 체류에 합치기 — 새 병원으로 추가', () => {
  const plan = demoPlanStandard(NOW);

  test('지침의 병원을 결정적 id 로 추가하고, 기간·일정·복귀가 그 id 를 가리킨다', () => {
    const { stay, hospitalId } = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'NEW' }, fetchedAt: FETCHED_AT });
    assert.equal(hospitalId, linkHospitalId(plan.planId));
    const added = stay.hospitals.find((h) => h.id === hospitalId);
    assert.equal(added.name, plan.hospital.name);
    assert.equal(added.linkedPlanId, plan.planId);
    assert.equal(added.address.source, 'DEMO');
    for (const p of stay.periods) assert.equal(p.hospitalId, hospitalId);
    const hospitalReturn = stay.periods.find((p) => p.items.returnTime?.place === 'HOSPITAL');
    assert.equal(hospitalReturn.items.returnTime.hospitalId, hospitalId);
    assert.equal(stay.linkedPlans[0].hospitalId, hospitalId);
    assert.equal(validateStay(stay).ok, true);
  });

  test('linkHospitalId 는 id 로 쓸 수 있는 글자만 쓴다', () => {
    assert.match(linkHospitalId('DEMO-PLAN-A'), /^[A-Za-z0-9_-]+$/);
    assert.match(linkHospitalId('a b/c'), /^[A-Za-z0-9_-]+$/);
  });
});

describe('다시 연결 — 같은 코드·같은 지침은 교체한다', () => {
  test('두 번 연결해도 기간·일정·사본·병원이 늘어나지 않는다', () => {
    const plan = demoPlanStandard(NOW);
    const first = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'NEW' }, fetchedAt: FETCHED_AT });
    const second = applyLinkedPlan(first.stay, { code: 'DEMO-A', plan, hospital: { kind: 'NEW' }, fetchedAt: FETCHED_AT });
    assert.equal(second.stay.periods.length, first.stay.periods.length);
    assert.equal(second.stay.appointments.length, first.stay.appointments.length);
    assert.equal(second.stay.linkedPlans.length, 1);
    assert.equal(second.stay.hospitals.length, first.stay.hospitals.length);
    assert.equal(validateStay(second.stay).ok, true);
  });

  test('다른 코드가 같은 지침(planId)을 가리키면 이전 사본을 교체한다', () => {
    const plan = demoPlanStandard(NOW);
    const first = applyLinkedPlan(stayWith(), { code: 'DEMO', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const second = applyLinkedPlan(first.stay, { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.deepEqual(second.stay.linkedPlans.map((l) => l.code), ['DEMO-A']);
    assert.equal(validateStay(second.stay).ok, true);
  });

  test('이전 확인 기록 중 지금 안내문(id@updatedAt)과 같은 것만 이어받는다 (규칙 56)', () => {
    const plan = demoPlanStandard(NOW);
    const first = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const acked = structuredClone(first.stay);
    acked.linkedPlans[0].acknowledged = acknowledgeAllMap(plan, {});
    const changed = structuredClone(plan);
    changed.instructions[0].updatedAt = new Date(NOW + 1000).toISOString();
    const second = applyLinkedPlan(acked, { code: 'DEMO-A', plan: changed, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const keys = Object.keys(second.stay.linkedPlans[0].acknowledged);
    assert.equal(keys.length, plan.instructions.length - 1);
    assert.equal(keys.includes(`${plan.instructions[0].id}@${plan.instructions[0].updatedAt}`), false);
  });

  test('다른 병원으로 다시 연결하면 이전 병원의 연결 표시를 지운다', () => {
    const plan = demoPlanStandard(NOW);
    const first = applyLinkedPlan(stayWith(), { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    const second = applyLinkedPlan(first.stay, { code: 'DEMO-A', plan, hospital: { kind: 'NEW' }, fetchedAt: FETCHED_AT });
    assert.equal(second.stay.hospitals.find((h) => h.id === 'H1').linkedPlanId, undefined);
    assert.equal(second.stay.hospitals.filter((h) => h.linkedPlanId === plan.planId).length, 1);
    assert.equal(validateStay(second.stay).ok, true);
  });
});

describe('만료·제한 지침도 그대로 저장한다 (규칙 12)', () => {
  test('DEMO-C(만료)도 기간을 저장하고 상태는 EXPIRED 다', () => {
    const plan = demoPlanExpired(NOW);
    const { stay } = applyLinkedPlan(stayWith(), { code: 'DEMO-C', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.equal(stay.periods.length, plan.periods.length);
    assert.equal(planState(plan, NOW), 'EXPIRED');
  });

  test('DEMO-B(외출 불가 기간 포함)는 동행 모순 없이 합쳐진다', () => {
    const plan = demoPlanRestricted(NOW);
    const result = applyLinkedPlan(stayWith(), { code: 'DEMO-B', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: FETCHED_AT });
    assert.deepEqual(result.conflictingPeriodIds, []);
    assert.equal(validateStay(result.stay).ok, true);
  });

  test('planState: 철회 > 만료 > 유효', () => {
    const plan = demoPlanStandard(NOW);
    assert.equal(planState(plan, NOW), 'ACTIVE');
    assert.equal(planState({ ...plan, revoked: true }, NOW), 'REVOKED');
    assert.equal(planState({ ...plan, expiresAt: 'bad' }, NOW), 'EXPIRED');
  });
});

describe('병원 안내 확인 (채널 B · 규칙 56)', () => {
  const plan = demoPlanStandard(NOW);

  test('guideEntries: 분류 순서로 묶고 확인 키는 id@updatedAt, 원문은 바꾸지 않는다', () => {
    const entries = guideEntries(plan, {});
    assert.equal(entries.length, plan.instructions.length);
    assert.equal(entries[0].instruction.category, 'activity');
    for (const entry of entries) {
      assert.equal(entry.key, `${entry.instruction.id}@${entry.instruction.updatedAt}`);
      const original = plan.instructions.find((i) => i.id === entry.instruction.id);
      assert.equal(entry.instruction.text, original.text);
      assert.equal(entry.instruction.lang, original.lang);
      assert.equal(entry.acknowledged, false);
    }
    assert.equal(entries.filter((e) => e.critical).length, unconfirmedCritical(plan, {}).length);
  });

  test('확인 기록은 같은 updatedAt 일 때만 확인으로 본다', () => {
    const [first] = plan.instructions;
    const entries = guideEntries(plan, { [`${first.id}@${first.updatedAt}`]: true, [`${first.id}@old`]: true });
    assert.equal(entries.find((e) => e.instruction.id === first.id).acknowledged, true);
    const stale = guideEntries(plan, { [`${first.id}@old`]: true });
    assert.equal(stale.find((e) => e.instruction.id === first.id).acknowledged, false);
  });

  test('acknowledgeAllMap: 지금 안내문 전부를 id@updatedAt 키로 확인하고, 사라진 키는 남기지 않는다', () => {
    const map = acknowledgeAllMap(plan, { 'gone@x': true });
    assert.deepEqual(Object.keys(map).sort(), plan.instructions.map((i) => `${i.id}@${i.updatedAt}`).sort());
    assert.equal(unconfirmedCritical(plan, map).length, 0);
  });
});

describe('연결 오류 문구', () => {
  test('errorCode 마다 문구 키가 있고, 로그인 필요는 로그인 문구다', () => {
    assert.equal(linkErrorKey('SAFEHOUR_AUTH_REQUIRED'), 'link.errLogin');
    assert.equal(linkErrorKey('SAFEHOUR_PLAN_UNKNOWN_CODE'), 'link.errUnknown');
    assert.equal(linkErrorKey('SAFEHOUR_PLAN_INVALID'), 'link.errInvalid');
    assert.equal(linkErrorKey('SAFEHOUR_PLAN_CODE_REQUIRED'), 'link.errRequired');
    assert.equal(linkErrorKey('SOMETHING_ELSE'), 'link.errInvalid');
  });
});
