// 체류 설정 초안 도우미 (AX-314 · spec 4.1–4.3, 5.1, 10장 규칙 1–3)
//
// 화면이 쓰는 순수 함수만 검증한다. 규칙 자체는 validateStay(test/stay-validate.test.js)가 정본이고,
// 여기서는 초안이 그 규칙에 그대로 닿는지, 결과가 필드별 문구·단계로 옮겨지는지를 본다.
// 이름·주소는 모두 가상의 자리표시자다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  NAME_MAX_LENGTH,
  STEPS,
  addAppointment,
  addLodging,
  draftFromStay,
  draftIssues,
  emptyDraft,
  estimatedEnd,
  fieldDomId,
  fieldLabelParts,
  firstStepWithIssues,
  hospitalRemovalBlock,
  issueMessage,
  issuesFor,
  newId,
  nightsOf,
  normalizeKeyword,
  pickAddress,
  prefillLodgingDates,
  searchErrorKey,
  stayFromDraft,
  stepOfField,
  uncoveredNights,
} from '../components/onboarding/draft.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { validateStay } from '../src/stay/index.js';

const DEMO_ADDRESS = Object.freeze({ roadAddress: '테스트로 1', lat: 37.5, lng: 127.0, source: 'DEMO' });

/** 규칙을 모두 통과하는 초안 */
function validDraft() {
  const draft = emptyDraft();
  return {
    ...draft,
    arrival: { date: '2026-10-01', time: '10:30', airport: 'ICN' },
    departure: { date: '2026-10-10', time: '18:00', airport: 'GMP' },
    lodgings: [{ ...draft.lodgings[0], name: '가상 숙소', address: DEMO_ADDRESS, checkIn: '2026-10-01', checkOut: '2026-10-10' }],
    hospitals: [{ ...draft.hospitals[0], name: '가상 의원', address: DEMO_ADDRESS, phone: '' }],
    appointments: [{ ...draft.appointments[0], type: 'PROCEDURE', date: '2026-10-03', start: '09:00', end: '' }],
    hasCompanion: false,
    interests: ['FOOD', 'CAFE'],
    pace: 'RELAXED',
  };
}

describe('초안 → 체류 (spec 5.1)', () => {
  test('빈 초안은 결정적이다 — 서버·브라우저 렌더가 같은 id 를 쓴다', () => {
    assert.deepEqual(emptyDraft(), emptyDraft());
    const d = emptyDraft();
    assert.equal(d.appointments[0].hospitalId, d.hospitals[0].id);
    // 숨은 기본값 없음: 공항·동반·강도·일정 유형은 사용자가 고른다
    assert.equal(d.arrival.airport, null);
    assert.equal(d.hasCompanion, null);
    assert.equal(d.pace, null);
    assert.equal(d.appointments[0].type, null);
  });

  test('새 체류: schemaVersion 2, 일정 출처 USER, 동의 없음, 빈 조건·연동', () => {
    const stay = stayFromDraft(validDraft());
    assert.equal(stay.schemaVersion, 2);
    assert.deepEqual(stay.consent, { sensitive: null });
    assert.deepEqual(stay.periods, []);
    assert.deepEqual(stay.linkedPlans, []);
    assert.equal(stay.guardianShare, null);
    assert.ok(stay.appointments.every((a) => a.source === 'USER'));
    assert.equal(validateStay(stay).ok, true);
  });

  test('빈 선택 필드는 저장 모델에 남기지 않는다 (종료 시각·전화)', () => {
    const stay = stayFromDraft(validDraft());
    assert.equal('end' in stay.appointments[0], false);
    assert.equal('phone' in stay.hospitals[0], false);
    const withEnd = validDraft();
    withEnd.appointments[0].end = '12:00';
    withEnd.hospitals[0].phone = ' 02-000-0000 ';
    const stay2 = stayFromDraft(withEnd);
    assert.equal(stay2.appointments[0].end, '12:00');
    assert.equal(stay2.hospitals[0].phone, '02-000-0000');
  });

  test('관심사는 정해진 순서로 저장한다', () => {
    const draft = validDraft();
    draft.interests = ['FESTIVAL', 'SHOPPING'];
    assert.deepEqual(stayFromDraft(draft).interests, ['SHOPPING', 'FESTIVAL']);
  });

  test('수정: 이 화면이 다루지 않는 기록을 그대로 둔다', () => {
    const previous = {
      ...stayFromDraft(validDraft()),
      periods: [{ id: 'P1' }],
      linkedPlans: [{ code: 'DEMO-A' }],
      consent: { sensitive: { version: 'v1', agreedAt: '2026-09-19T00:00:00+09:00' } },
      guardianShare: { lastSentAt: 'x', planFingerprint: 'y' },
      createdAt: '2026-09-18T00:00:00.000Z',
    };
    const draft = draftFromStay(previous);
    draft.hasCompanion = true;
    const next = stayFromDraft(draft, previous);
    assert.equal(next.hasCompanion, true);
    assert.deepEqual(next.periods, previous.periods);
    assert.deepEqual(next.linkedPlans, previous.linkedPlans);
    assert.deepEqual(next.consent, previous.consent);
    assert.deepEqual(next.guardianShare, previous.guardianShare);
    assert.equal(next.createdAt, previous.createdAt);
  });

  test('저장 → 초안 → 저장이 같은 체류를 만든다 (병원 연동 일정·연동 병원 포함)', () => {
    const stay = stayFromDraft(validDraft());
    stay.hospitals[0].linkedPlanId = 'plan-1';
    stay.appointments.push({ id: 'A-H', hospitalId: stay.hospitals[0].id, type: 'VISIT', date: '2026-10-05', start: '14:00', source: 'HOSPITAL' });
    const again = stayFromDraft(draftFromStay(stay), stay);
    assert.deepEqual(again, stay);
    assert.equal(again.appointments[1].source, 'HOSPITAL');
  });

  test('모자란 목록은 빈 항목 하나로 채운다', () => {
    const d = draftFromStay({ lodgings: [], hospitals: [], appointments: [] });
    assert.equal(d.lodgings.length, 1);
    assert.equal(d.hospitals.length, 1);
    assert.equal(d.appointments.length, 1);
    assert.equal(d.appointments[0].hospitalId, d.hospitals[0].id);
  });
});

describe('규칙 1–3 이 필드별 문구로 옮겨진다', () => {
  test('규칙 1: 출국이 입국보다 빠르면 출국 날짜 오류 (단계 1)', () => {
    const draft = validDraft();
    draft.departure.date = '2026-09-30';
    const issues = draftIssues(draft);
    const hit = issuesFor(issues, 'departure.date');
    assert.equal(hit.length, 1);
    assert.equal(issueMessage(hit[0]).key, 'onboarding.errDepartureBeforeArrival');
    assert.equal(stepOfField('departure.date'), 0);
    assert.equal(firstStepWithIssues(issues), 0);
  });

  test('규칙 1: 45박 초과면 최대 박 수와 함께 거부', () => {
    const draft = validDraft();
    draft.departure.date = '2026-11-20';
    const hit = issuesFor(draftIssues(draft), 'departure.date');
    assert.equal(hit.length, 1);
    assert.deepEqual(issueMessage(hit[0]), { key: 'onboarding.errStayTooLong', vars: { max: 45 } });
  });

  test('규칙 1: 같은 날 출국 시각이 도착 시각보다 이르면 출발 시각 오류', () => {
    const draft = validDraft();
    draft.departure = { ...draft.departure, date: '2026-10-01', time: '09:00' };
    draft.lodgings[0].checkOut = '2026-10-02';
    const hit = issuesFor(draftIssues(draft), 'departure.time');
    assert.equal(issueMessage(hit[0]).key, 'onboarding.errDepartureBeforeArrival');
  });

  test('규칙 2: 수술·시술 일정이 없으면 병원 단계에서 막힌다', () => {
    const draft = validDraft();
    draft.appointments[0].type = 'VISIT';
    const issues = draftIssues(draft);
    const hit = issuesFor(issues, 'appointments');
    assert.equal(issueMessage(hit[0]).key, 'onboarding.errProcedureRequired');
    assert.equal(stepOfField('appointments'), 2);
    assert.equal(fieldDomId('appointments'), 'ob-appointments');
  });

  test('규칙 3: 숙소 날짜가 겹치면 두 구간 모두 표시되고 체크인 칸을 가리킨다', () => {
    const draft = addLodging(validDraft(), 'lodging-2');
    draft.lodgings[0].checkOut = '2026-10-06';
    draft.lodgings[1] = { ...draft.lodgings[1], name: '가상 숙소 2', address: DEMO_ADDRESS, checkIn: '2026-10-04', checkOut: '2026-10-10' };
    const issues = draftIssues(draft);
    for (const field of ['lodgings[0]', 'lodgings[1]']) {
      const hit = issuesFor(issues, field);
      assert.equal(hit.length, 1, field);
      assert.equal(issueMessage(hit[0]).key, 'onboarding.errLodgingOverlap');
      assert.equal(stepOfField(field), 1);
    }
    assert.equal(fieldDomId('lodgings[1]'), 'ob-lodgings-1-checkIn');
  });

  test('규칙 3: 체크아웃 = 다음 체크인은 겹침이 아니다', () => {
    const base = validDraft();
    base.lodgings[0].checkOut = '2026-10-05';
    const draft = addLodging(base, 'lodging-2');
    draft.lodgings[1] = { ...draft.lodgings[1], name: '가상 숙소 2', address: DEMO_ADDRESS };
    assert.equal(draft.lodgings[1].checkIn, '2026-10-05');
    assert.deepEqual(draftIssues(draft), []);
  });

  test('주소를 고르지 않으면 좌표 문제 대신 주소 칸 하나로 알린다', () => {
    const draft = validDraft();
    draft.lodgings[0].address = null;
    const issues = draftIssues(draft);
    assert.deepEqual(issuesFor(issues, 'lodgings[0].address').length, 1);
    assert.equal(issues.some((i) => /\.(lat|lng)$/.test(i.field)), false);
    assert.equal(issueMessage(issuesFor(issues, 'lodgings[0].address')[0]).key, 'onboarding.errAddress');
    assert.equal(fieldDomId('lodgings[0].address'), 'ob-lodgings-0-address');
  });

  test('빈 초안은 모든 단계에 문제가 있고, 각 문제에 문구가 있다', () => {
    const issues = draftIssues(emptyDraft());
    const steps = new Set(issues.map((i) => stepOfField(i.field)));
    assert.deepEqual([...steps].sort(), [0, 1, 2, 3, 4]);
    for (const issue of issues) {
      const { key } = issueMessage(issue);
      assert.ok(UI_TEXT[key], `${issue.field} ${issue.code} → ${key} 문구 없음`);
      assert.notEqual(key, 'onboarding.errGeneric', `${issue.field} ${issue.code} 가 일반 문구로 떨어졌다`);
      for (const part of fieldLabelParts(issue.field)) assert.ok(UI_TEXT[part.key], `${issue.field} 라벨 ${part.key}`);
      assert.ok(fieldLabelParts(issue.field).length > 0, `${issue.field} 라벨 없음`);
    }
  });

  test('이름 40자 초과, 종료가 시작보다 이름, 병원 없는 일정', () => {
    const draft = validDraft();
    draft.lodgings[0].name = '가'.repeat(NAME_MAX_LENGTH + 1);
    draft.appointments[0].end = '08:00';
    draft.appointments[0].hospitalId = '';
    const issues = draftIssues(draft);
    assert.deepEqual(issueMessage(issuesFor(issues, 'lodgings[0].name')[0]), {
      key: 'onboarding.errNameTooLong',
      vars: { max: 40 },
    });
    assert.equal(issueMessage(issuesFor(issues, 'appointments[0].end')[0]).key, 'onboarding.errEndBeforeStart');
    assert.equal(issueMessage(issuesFor(issues, 'appointments[0].hospitalId')[0]).key, 'onboarding.errAppointmentHospital');
  });

  test('전화번호는 숫자·+·-·괄호·띄어쓰기만', () => {
    const draft = validDraft();
    draft.hospitals[0].phone = '02-123-4567';
    assert.deepEqual(draftIssues(draft), []);
    draft.hospitals[0].phone = 'call me';
    assert.equal(issueMessage(issuesFor(draftIssues(draft), 'hospitals[0].phone')[0]).key, 'onboarding.errPhone');
  });

  test('필드 라벨: 항목 번호 + 칸 이름', () => {
    assert.deepEqual(fieldLabelParts('lodgings[1].checkIn'), [
      { key: 'onboarding.lodgingItem', vars: { n: 2 } },
      { key: 'onboarding.checkIn' },
    ]);
    assert.deepEqual(fieldLabelParts('departure.date'), [{ key: 'onboarding.departureDate' }]);
    assert.deepEqual(fieldLabelParts('lodgings[0]'), [{ key: 'onboarding.lodgingItem', vars: { n: 1 } }]);
  });

  test('단계 이름은 5개이고 순서가 spec 흐름과 같다', () => {
    assert.deepEqual([...STEPS], ['travel', 'lodging', 'hospital', 'companion', 'preferences']);
    assert.equal(stepOfField('hasCompanion'), 3);
    assert.equal(stepOfField('pace'), 4);
    assert.equal(stepOfField('periods[0].items.outing'), 2);
    assert.equal(firstStepWithIssues([]), -1);
  });
});

describe('주소 검색 (spec 6장 — 사용자 검색어로만)', () => {
  test('응답 한 건을 허용 필드로 좁힌다', () => {
    const raw = { ...DEMO_ADDRESS, buildingName: '가상 건물', jibunAddress: '', extra: 'x', admCd: '1' };
    assert.deepEqual(pickAddress(raw), { roadAddress: '테스트로 1', buildingName: '가상 건물', lat: 37.5, lng: 127.0, source: 'DEMO' });
  });

  test('좌표·출처·도로명주소가 없으면 버린다', () => {
    assert.equal(pickAddress({ ...DEMO_ADDRESS, lat: '37.5' }), null);
    assert.equal(pickAddress({ ...DEMO_ADDRESS, source: 'GPS' }), null);
    assert.equal(pickAddress({ ...DEMO_ADDRESS, roadAddress: ' ' }), null);
    assert.equal(pickAddress(null), null);
    assert.equal(pickAddress([DEMO_ADDRESS]), null);
  });

  test('검색어 정리와 길이 (2–60자)', () => {
    assert.equal(normalizeKeyword('  강남   역 '), '강남 역');
    assert.equal(normalizeKeyword('가'), null);
    assert.equal(normalizeKeyword('가'.repeat(61)), null);
    assert.equal(normalizeKeyword('가'.repeat(60)), '가'.repeat(60));
    assert.equal(normalizeKeyword(undefined), null);
  });

  test('실패 코드 → 사람 문구 키', () => {
    assert.equal(searchErrorKey(401, null), 'onboarding.searchErrAuth');
    assert.equal(searchErrorKey(503, { errorCode: 'SAFEHOUR_ADDRESS_UNAVAILABLE' }), 'onboarding.searchErrUnavailable');
    assert.equal(searchErrorKey(400, { reason: 'KEYWORD_LENGTH' }), 'onboarding.searchErrLength');
    assert.equal(searchErrorKey(400, { reason: 'KEYWORD_CHARS' }), 'onboarding.searchErrChars');
    assert.equal(searchErrorKey(400, { reason: 'KEYWORD_REJECTED' }), 'onboarding.searchErrRejected');
    assert.equal(searchErrorKey(502, null), 'onboarding.searchErrFailed');
    assert.equal(searchErrorKey(0, null), 'onboarding.searchErrFailed');
    for (const key of [401, 503, 502].map((s) => searchErrorKey(s, null))) assert.ok(UI_TEXT[key], key);
  });
});

describe('도우미', () => {
  test('예상 종료: 수술·시술 240분, 진료 90분 (spec 4.3)', () => {
    assert.deepEqual(estimatedEnd('PROCEDURE', '09:00'), { end: '13:00', durationMin: 240, nextDay: false });
    assert.deepEqual(estimatedEnd('VISIT', '14:30'), { end: '16:00', durationMin: 90, nextDay: false });
    assert.equal(estimatedEnd('PROCEDURE', '22:00').nextDay, true);
    assert.equal(estimatedEnd(null, '09:00'), null);
    assert.equal(estimatedEnd('VISIT', ''), null);
  });

  test('박 수와 숙소가 없는 밤', () => {
    const draft = validDraft();
    assert.equal(nightsOf(draft), 9);
    assert.deepEqual(uncoveredNights(draft), []);
    draft.lodgings[0].checkOut = '2026-10-08';
    assert.deepEqual(uncoveredNights(draft), ['2026-10-08', '2026-10-09']);
    draft.departure.date = '2026-09-01';
    assert.equal(nightsOf(draft), null);
    assert.deepEqual(uncoveredNights(draft), []);
  });

  test('첫 숙소 날짜 제안은 비어 있을 때만 채운다', () => {
    const draft = validDraft();
    draft.lodgings[0].checkIn = '';
    draft.lodgings[0].checkOut = '';
    const filled = prefillLodgingDates(draft);
    assert.equal(filled.lodgings[0].checkIn, '2026-10-01');
    assert.equal(filled.lodgings[0].checkOut, '2026-10-10');
    const kept = validDraft();
    kept.lodgings[0].checkOut = '2026-10-04';
    assert.equal(prefillLodgingDates(kept), kept);
  });

  test('숙소·일정 추가', () => {
    const draft = validDraft();
    draft.lodgings[0].checkOut = '2026-10-04';
    const more = addLodging(draft, 'lodging-2');
    assert.deepEqual(more.lodgings[1], { id: 'lodging-2', name: '', address: null, checkIn: '2026-10-04', checkOut: '2026-10-10' });
    const appt = addAppointment(draft, 'appointment-2');
    assert.equal(appt.appointments[1].hospitalId, draft.hospitals[0].id);
    assert.equal(appt.appointments[1].type, null);
    assert.equal(appt.appointments[1].source, 'USER');
  });

  test('병원 삭제 막기: 연동·일정·조건 기간', () => {
    const draft = validDraft();
    const hid = draft.hospitals[0].id;
    assert.equal(hospitalRemovalBlock(draft, [], hid), 'APPOINTMENTS');
    const free = { ...draft, appointments: [] };
    assert.equal(hospitalRemovalBlock(free, [], hid), null);
    assert.equal(hospitalRemovalBlock(free, [{ hospitalId: hid }], hid), 'PERIODS');
    assert.equal(hospitalRemovalBlock(free, [{ items: { returnTime: { kind: 'SET', place: 'HOSPITAL', hospitalId: hid } } }], hid), 'PERIODS');
    const linked = { ...free, hospitals: [{ ...free.hospitals[0], linkedPlanId: 'plan-1' }] };
    assert.equal(hospitalRemovalBlock(linked, [], hid), 'LINKED');
  });

  test('새 id 는 저장소 id 형식을 지키고 겹치지 않는다', () => {
    const a = newId('lodging');
    const b = newId('lodging');
    assert.notEqual(a, b);
    for (const id of [a, b, newId('x', () => 'a-b.c')]) assert.match(id, /^[A-Za-z0-9_-]{1,128}$/);
  });
});
