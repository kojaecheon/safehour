// 체류 모델 검증 (AX-302 · spec 4.1–4.3, 10장 규칙 1–3)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateStay } from '../src/stay/stay.js';
import { ERROR_CODE, VALIDATION_ISSUE } from '../src/stay/errorCodes.js';
import { deepFreeze, makePlanStay, makeStay, selfPeriod } from './stay-fixtures.js';

function issueCodes(result) {
  return result.issues.map((i) => `${i.field}:${i.code}`);
}

describe('체류 검증 — 정상', () => {
  test('올바른 체류는 통과하고 필드 목록이 비어 있다', () => {
    const result = validateStay(makeStay());
    assert.equal(result.ok, true);
    assert.deepEqual(result.fields, []);
    assert.equal(result.errorCode, undefined);
  });

  test('PlanStay 모양(이름·주소 없음, 좌표 평탄, 동의 boolean)도 같은 규칙으로 통과한다', () => {
    assert.equal(validateStay(makePlanStay()).ok, true);
  });

  test('입력을 바꾸지 않는다', () => {
    const stay = deepFreeze(makeStay({ periods: [selfPeriod()] }));
    assert.doesNotThrow(() => validateStay(stay));
  });
});

describe('규칙 1 — 입국·출국 순서와 45박 한도', () => {
  test('출국일이 입국일보다 빠르면 SAFEHOUR_STAY_INVALID 로 거부한다', () => {
    const result = validateStay(
      makeStay({ departure: { date: '2026-09-30', time: '18:00', airport: 'ICN' } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ERROR_CODE.STAY_INVALID);
    assert.equal(result.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(result.fields.includes('departure.date'));
    assert.ok(issueCodes(result).includes(`departure.date:${VALIDATION_ISSUE.DEPARTURE_BEFORE_ARRIVAL}`));
  });

  test('같은 날 출발 시각이 도착 시각보다 이르면 거부한다', () => {
    const result = validateStay(
      makeStay({
        arrival: { date: '2026-10-01', time: '10:00', airport: 'ICN' },
        departure: { date: '2026-10-01', time: '09:00', airport: 'ICN' },
      }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('departure.time'));
  });

  test('45박은 허용하고 46박은 거부한다', () => {
    const base = {
      arrival: { date: '2026-10-01', time: '10:00', airport: 'ICN' },
      lodgings: [
        { id: 'L1', name: '숙소', address: { roadAddress: '테스트로 1', lat: 37.5, lng: 127.0, source: 'DEMO' }, checkIn: '2026-10-01', checkOut: '2026-11-16' },
      ],
    };
    const ok = validateStay(makeStay({ ...base, departure: { date: '2026-11-15', time: '18:00', airport: 'ICN' } }));
    assert.equal(ok.ok, true, JSON.stringify(ok.issues));

    const tooLong = validateStay(makeStay({ ...base, departure: { date: '2026-11-16', time: '18:00', airport: 'ICN' } }));
    assert.equal(tooLong.ok, false);
    assert.equal(tooLong.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(issueCodes(tooLong).includes(`departure.date:${VALIDATION_ISSUE.STAY_TOO_LONG}`));
  });

  test('공항·날짜·시각 형식이 틀리면 해당 필드를 알려준다', () => {
    const result = validateStay(
      makeStay({ arrival: { date: '2026-13-01', time: '25:00', airport: 'NRT' } }),
    );
    assert.equal(result.ok, false);
    for (const field of ['arrival.date', 'arrival.time', 'arrival.airport']) {
      assert.ok(result.fields.includes(field), field);
    }
  });

  test('동반 보호자 여부·이동 강도·관심사 값이 틀리면 거부한다', () => {
    const result = validateStay(makeStay({ hasCompanion: 'yes', pace: 'FAST', interests: ['CASINO'] }));
    assert.equal(result.ok, false);
    for (const field of ['hasCompanion', 'pace', 'interests']) {
      assert.ok(result.fields.includes(field), field);
    }
  });
});

describe('규칙 2 — 수술·시술 일정 1개 이상', () => {
  test('PROCEDURE 일정이 없으면 체류 설정을 완료할 수 없다', () => {
    const stay = makeStay();
    const result = validateStay({ ...stay, appointments: stay.appointments.filter((a) => a.type !== 'PROCEDURE') });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(issueCodes(result).includes(`appointments:${VALIDATION_ISSUE.PROCEDURE_REQUIRED}`));
  });

  test('병원 일정이 하나도 없어도 같은 이유로 거부한다', () => {
    const result = validateStay(makeStay({ appointments: [] }));
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('appointments'));
  });

  test('등록되지 않은 병원을 가리키는 일정은 거부한다', () => {
    const stay = makeStay();
    stay.appointments[1] = { ...stay.appointments[1], hospitalId: 'H-unknown' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('appointments[1].hospitalId'));
  });

  test('종료 시각이 시작 시각보다 이르면 거부한다', () => {
    const stay = makeStay();
    stay.appointments[1] = { ...stay.appointments[1], end: '09:00' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('appointments[1].end'));
  });

  test('일정 유형은 PROCEDURE 또는 VISIT 만 받는다', () => {
    const stay = makeStay();
    stay.appointments[0] = { ...stay.appointments[0], type: 'SURGERY_DETAIL' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('appointments[0].type'));
  });
});

describe('규칙 3 — 숙소 구간', () => {
  test('숙소 구간 날짜가 겹치면 거부한다', () => {
    const stay = makeStay();
    stay.lodgings[1] = { ...stay.lodgings[1], checkIn: '2026-10-04' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(result.issues.some((i) => i.code === VALIDATION_ISSUE.LODGING_OVERLAP));
    assert.ok(result.fields.includes('lodgings[1]'));
  });

  test('체크아웃 날짜와 다음 체크인 날짜가 같으면 겹침이 아니다', () => {
    assert.equal(validateStay(makeStay()).ok, true);
  });

  test('숙소 구간이 하나도 없으면 거부한다', () => {
    const result = validateStay(makeStay({ lodgings: [] }));
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('lodgings'));
  });

  test('체크아웃이 체크인보다 늦지 않으면 거부한다', () => {
    const stay = makeStay();
    stay.lodgings[0] = { ...stay.lodgings[0], checkOut: '2026-10-01' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('lodgings[0].checkOut'));
  });

  test('숙소 이름은 40자까지다', () => {
    const stay = makeStay();
    stay.lodgings[0] = { ...stay.lodgings[0], name: '가'.repeat(41) };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('lodgings[0].name'));
  });

  test('숙소 좌표가 숫자가 아니면 거부한다', () => {
    const stay = makeStay();
    stay.lodgings[0] = { ...stay.lodgings[0], address: { roadAddress: '테스트로 1', lat: 'x', lng: 127, source: 'DEMO' } };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('lodgings[0].address'));
  });

  test('같은 id 를 두 번 쓰면 거부한다', () => {
    const stay = makeStay();
    stay.lodgings[1] = { ...stay.lodgings[1], id: 'L1' };
    const result = validateStay(stay);
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('lodgings[1].id'));
  });
});

describe('체류 안의 조건 기간도 함께 검증한다', () => {
  test('필수 항목이 빠진 기간은 periods[i] 경로로 알려준다', () => {
    const period = selfPeriod();
    delete period.items.outing;
    const result = validateStay(makeStay({ periods: [period] }));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(result.fields.includes('periods[0].items.outing'));
  });

  test('복귀 장소가 병원이면 체류에 등록된 병원을 가리켜야 한다 (규칙 13-1)', () => {
    const period = selfPeriod({
      items: { returnTime: { kind: 'SET', time: '18:00', place: 'HOSPITAL', hospitalId: 'H-unknown' } },
    });
    const result = validateStay(makeStay({ periods: [period] }));
    assert.equal(result.ok, false);
    assert.ok(result.fields.includes('periods[0].items.returnTime.hospitalId'));
  });
});
