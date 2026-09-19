// 조건 화면 — 본인 체크 입력 폼 ↔ 조건 기간 변환 (AX-315 · spec 4.4, 5.1, 규칙 6·7·13-1)
//
// 화면 폼 상태를 ConditionPeriod(SELF)로 바꾸는 순수 함수를 고정한다.
//   - 필수 항목(outing·returnTime)은 '모르겠음'이 없고, 비어 있으면 저장하지 않는다(규칙 6)
//   - 동행 필수=예 이면 guardianMustStay 는 폼 값과 무관하게 SET(true)로 보낸다(spec 4.4)
//   - 병원 복귀는 hospitalId 를 싣는다. 병원이 하나면 자동으로 고른다(규칙 13-1)
//   - 외출 불가면 복귀 시각을 묻지도 싣지도 않는다
//   - 복약 시각의 '숙소에서 복용'은 기본 예

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyPeriodForm,
  formToPeriod,
  makeSelfPeriodId,
  periodToForm,
  returnHospitalId,
  validatePeriodForm,
} from '../components/conditions/periodFormModel.js';
import { NO_RESTRICTION_ITEMS, YES_NO_KEYS, getItem, validateConditionPeriod } from '../src/stay/conditions.js';
import { VALIDATION_ISSUE } from '../src/stay/errorCodes.js';

const ONE_HOSPITAL = [{ id: 'H1', name: '테스트 병원' }];
const TWO_HOSPITALS = [
  { id: 'H1', name: '테스트 병원 1' },
  { id: 'H2', name: '테스트 병원 2' },
];

/** 모든 항목에 답한 폼 — 필요한 것만 덮어쓴다 */
function answeredForm(overrides = {}) {
  const form = emptyPeriodForm({ startDate: '2026-10-03', endDate: '2026-10-05' });
  form.outing = 'ALLOWED';
  form.returnTime = { ...form.returnTime, answer: 'YES', time: '18:00', place: 'LODGING' };
  form.walkLimit = { answer: 'YES', minutes: '20' };
  form.travelLimit = { answer: 'NO', minutes: '' };
  for (const key of YES_NO_KEYS) form.yesNo[key] = 'NO';
  form.mealRestriction = { answer: 'NO', mode: 'ALL_DAY', until: '' };
  form.medication = { answer: 'NO', times: [{ time: '', atLodging: true }] };
  return { ...form, ...overrides };
}

describe('빈 폼', () => {
  test('모든 항목이 아직 고르지 않은 상태이고 날짜를 받는다', () => {
    const form = emptyPeriodForm({ startDate: '2026-10-03', endDate: '2026-10-04' });
    assert.equal(form.startDate, '2026-10-03');
    assert.equal(form.endDate, '2026-10-04');
    assert.equal(form.noRestriction, false);
    assert.equal(form.outing, null);
    assert.equal(form.returnTime.answer, null);
    assert.equal(form.returnTime.place, 'LODGING', '복귀 장소 기본값은 숙소');
    for (const key of YES_NO_KEYS) assert.equal(form.yesNo[key], null, key);
    assert.equal(form.walkLimit.answer, null);
    assert.equal(form.mealRestriction.answer, null);
    assert.equal(form.medication.answer, null);
  });

  test("복약 시각 첫 줄의 '숙소에서 복용'은 기본 예다", () => {
    const form = emptyPeriodForm();
    assert.equal(form.medication.times.length, 1);
    assert.equal(form.medication.times[0].atLodging, true);
  });

  test('자유 서술 칸이 없다 — 폼의 모든 문자열 값은 날짜·시각·분·id 뿐이다', () => {
    const form = emptyPeriodForm();
    const keys = JSON.stringify(form);
    assert.doesNotMatch(keys, /note|memo|comment|text|free/i);
  });
});

describe('폼 → 조건 기간 (SELF)', () => {
  test('모두 답하면 검증을 통과하는 SELF 기간이 된다', () => {
    const period = formToPeriod(answeredForm(), { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(period.id, 'S-1');
    assert.equal(period.source, 'SELF');
    assert.equal(period.startDate, '2026-10-03');
    assert.equal(period.endDate, '2026-10-05');
    assert.equal(period.items.outing, 'ALLOWED');
    assert.deepEqual(period.items.returnTime, { kind: 'SET', time: '18:00', place: 'LODGING' });
    assert.deepEqual(period.items.walkLimit, { kind: 'SET', value: 20 });
    assert.deepEqual(period.items.travelLimit, { kind: 'NONE' });
    assert.deepEqual(period.items.diet.spicy, { kind: 'NONE' });
    assert.deepEqual(period.items.medication, { kind: 'NONE' });
    assert.equal(validateConditionPeriod(period, { hospitals: ONE_HOSPITAL }).ok, true);
  });

  test('예 → SET(true), 아니오 → NONE, 모르겠음 → UNKNOWN (예/아니오 항목 전부)', () => {
    const form = answeredForm();
    form.yesNo.avoidUv = 'YES';
    form.yesNo.avoidHeat = 'UNKNOWN';
    form.yesNo['diet.raw'] = 'YES';
    form.yesNo['diet.hot'] = 'UNKNOWN';
    const { items } = formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.deepEqual(items.avoidUv, { kind: 'SET', value: true });
    assert.deepEqual(items.avoidHeat, { kind: 'UNKNOWN' });
    assert.deepEqual(items.avoidWater, { kind: 'NONE' });
    assert.deepEqual(items.diet.raw, { kind: 'SET', value: true });
    assert.deepEqual(items.diet.hot, { kind: 'UNKNOWN' });
  });

  test("보행·이동 한도: 예 → 분(숫자), 모르겠음 → UNKNOWN", () => {
    const form = answeredForm({ walkLimit: { answer: 'UNKNOWN', minutes: '' }, travelLimit: { answer: 'YES', minutes: '30' } });
    const { items } = formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.deepEqual(items.walkLimit, { kind: 'UNKNOWN' });
    assert.deepEqual(items.travelLimit, { kind: 'SET', value: 30 });
  });

  test('식사 제한: 종일 / 그 시각까지', () => {
    const allDay = formToPeriod(answeredForm({ mealRestriction: { answer: 'YES', mode: 'ALL_DAY', until: '10:00' } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.deepEqual(allDay.items.mealRestriction, { kind: 'SET', value: { mode: 'ALL_DAY' } });
    const until = formToPeriod(answeredForm({ mealRestriction: { answer: 'YES', mode: 'UNTIL', until: '12:00' } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.deepEqual(until.items.mealRestriction, { kind: 'SET', value: { mode: 'UNTIL', until: '12:00' } });
  });

  test("복약 시각 목록: 시각마다 '숙소에서 복용'을 싣고, 값이 없으면 예로 본다", () => {
    const form = answeredForm({
      medication: {
        answer: 'YES',
        times: [
          { time: '09:00', atLodging: true },
          { time: '15:00', atLodging: false },
          { time: '21:00' },
        ],
      },
    });
    const { items } = formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.deepEqual(items.medication, {
      kind: 'SET',
      value: [
        { time: '09:00', atLodging: true },
        { time: '15:00', atLodging: false },
        { time: '21:00', atLodging: true },
      ],
    });
  });

  test("복약 '모르겠음'은 UNKNOWN 이다(마감 없이 경고는 합성이 붙인다)", () => {
    const { items } = formToPeriod(answeredForm({ medication: { answer: 'UNKNOWN', times: [] } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.deepEqual(items.medication, { kind: 'UNKNOWN' });
  });
});

describe('동행 필수 → 보호자 곁 지킴 고정 (spec 4.4)', () => {
  test("동행 필수=예 이면 폼의 guardianMustStay 가 '아니오'여도 SET(true)로 보낸다", () => {
    const form = answeredForm();
    form.yesNo.escortRequired = 'YES';
    form.yesNo.guardianMustStay = 'NO';
    const { items } = formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.deepEqual(items.escortRequired, { kind: 'SET', value: true });
    assert.deepEqual(items.guardianMustStay, { kind: 'SET', value: true });
  });

  test("동행 필수=예 이면 guardianMustStay 를 고르지 않았어도 SET(true)이고 검증을 통과한다", () => {
    const form = answeredForm();
    form.yesNo.escortRequired = 'YES';
    form.yesNo.guardianMustStay = null;
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, true);
    assert.deepEqual(result.period.items.guardianMustStay, { kind: 'SET', value: true });
  });

  test('동행 필수가 아니면 폼 값을 그대로 쓴다', () => {
    const form = answeredForm();
    form.yesNo.escortRequired = 'NO';
    form.yesNo.guardianMustStay = 'NO';
    assert.deepEqual(formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL }).items.guardianMustStay, { kind: 'NONE' });
    form.yesNo.escortRequired = 'UNKNOWN';
    form.yesNo.guardianMustStay = 'UNKNOWN';
    assert.deepEqual(formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL }).items.guardianMustStay, { kind: 'UNKNOWN' });
  });
});

describe('복귀 시각과 장소 (spec 4.4, 규칙 13-1)', () => {
  test("'아니오'(병원이 정하지 않음)는 NOT_SET 이다", () => {
    const form = answeredForm({ returnTime: { answer: 'NO', time: '', place: 'LODGING', hospitalId: '' } });
    assert.deepEqual(formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL }).items.returnTime, { kind: 'NOT_SET' });
  });

  test('병원 복귀 — 등록 병원이 하나면 고르지 않아도 그 병원 id 를 싣는다', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '17:00', place: 'HOSPITAL', hospitalId: '' } });
    const period = formToPeriod(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.deepEqual(period.items.returnTime, { kind: 'SET', time: '17:00', place: 'HOSPITAL', hospitalId: 'H1' });
    assert.equal(validateConditionPeriod(period, { hospitals: ONE_HOSPITAL }).ok, true);
  });

  test('병원 복귀 — 병원이 여럿이면 고른 병원 id 를 싣는다', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '17:00', place: 'HOSPITAL', hospitalId: 'H2' } });
    assert.equal(formToPeriod(form, { id: 'S-1', hospitals: TWO_HOSPITALS }).items.returnTime.hospitalId, 'H2');
  });

  test('병원 복귀 — 병원이 여럿인데 고르지 않으면 hospitalId 오류로 저장하지 않는다', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '17:00', place: 'HOSPITAL', hospitalId: '' } });
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: TWO_HOSPITALS });
    assert.equal(result.ok, false);
    assert.equal(result.errors['returnTime.hospitalId'], VALIDATION_ISSUE.HOSPITAL_ID_REQUIRED);
  });

  test('병원 복귀 — 등록되지 않은 병원 id 는 거부한다', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '17:00', place: 'HOSPITAL', hospitalId: 'H9' } });
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: TWO_HOSPITALS });
    assert.equal(result.errors['returnTime.hospitalId'], VALIDATION_ISSUE.UNKNOWN_HOSPITAL);
  });

  test('숙소 복귀에는 hospitalId 가 없다(폼에 남은 값이 있어도)', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '18:00', place: 'LODGING', hospitalId: 'H2' } });
    assert.deepEqual(formToPeriod(form, { id: 'S-1', hospitals: TWO_HOSPITALS }).items.returnTime, {
      kind: 'SET',
      time: '18:00',
      place: 'LODGING',
    });
  });

  test('시각을 넣지 않으면 복귀 시각 오류다', () => {
    const form = answeredForm({ returnTime: { answer: 'YES', time: '', place: 'LODGING', hospitalId: '' } });
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, false);
    assert.equal(result.errors.returnTime, VALIDATION_ISSUE.INVALID_VALUE);
  });

  test('외출 불가면 복귀 시각을 싣지 않고, 답하지 않아도 저장된다', () => {
    const form = answeredForm({ outing: 'FORBIDDEN', returnTime: { answer: null, time: '', place: 'LODGING', hospitalId: '' } });
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, true);
    assert.equal('returnTime' in result.period.items, false);
  });

  test('returnHospitalId: 하나면 자동, 여럿이면 고른 값, 없으면 빈 값', () => {
    assert.equal(returnHospitalId({ place: 'HOSPITAL', hospitalId: '' }, ONE_HOSPITAL), 'H1');
    assert.equal(returnHospitalId({ place: 'HOSPITAL', hospitalId: 'H2' }, TWO_HOSPITALS), 'H2');
    assert.equal(returnHospitalId({ place: 'HOSPITAL', hospitalId: '' }, TWO_HOSPITALS), '');
    assert.equal(returnHospitalId({ place: 'HOSPITAL', hospitalId: '' }, []), '');
  });
});

describe('필수 항목과 필드별 오류 (규칙 6)', () => {
  test('외출 허용 여부를 고르지 않으면 저장하지 않는다', () => {
    const result = validatePeriodForm(answeredForm({ outing: null }), { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, false);
    assert.equal(result.errors.outing, VALIDATION_ISSUE.REQUIRED);
  });

  test('외출이 불가가 아니면 복귀 시각을 고르지 않았을 때 저장하지 않는다', () => {
    const form = answeredForm({ returnTime: { answer: null, time: '', place: 'LODGING', hospitalId: '' } });
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, false);
    assert.equal(result.errors.returnTime, VALIDATION_ISSUE.REQUIRED);
  });

  test("필수 항목에 '모르겠음'이 들어와도 저장하지 않는다", () => {
    const form = answeredForm({ returnTime: { answer: 'UNKNOWN', time: '', place: 'LODGING', hospitalId: '' } });
    assert.equal(
      validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL }).errors.returnTime,
      VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED,
    );
    assert.equal(
      validatePeriodForm(answeredForm({ outing: 'UNKNOWN' }), { id: 'S-1', hospitals: ONE_HOSPITAL }).errors.outing,
      VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED,
    );
  });

  test('답하지 않은 항목은 항목 키(점 표기)로 오류를 준다', () => {
    const form = answeredForm();
    form.yesNo['diet.spicy'] = null;
    form.yesNo.avoidUv = null;
    const result = validatePeriodForm(form, { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, false);
    assert.equal(result.errors['diet.spicy'], VALIDATION_ISSUE.REQUIRED);
    assert.equal(result.errors.avoidUv, VALIDATION_ISSUE.REQUIRED);
    assert.equal(result.period, null, '실패하면 저장할 기간을 주지 않는다');
  });

  test('보행 한도 범위(5–240분) 밖이면 오류, 비어 있으면 형식 오류', () => {
    const out = validatePeriodForm(answeredForm({ walkLimit: { answer: 'YES', minutes: '300' } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.equal(out.errors.walkLimit, VALIDATION_ISSUE.OUT_OF_RANGE);
    const blank = validatePeriodForm(answeredForm({ walkLimit: { answer: 'YES', minutes: '' } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.equal(blank.errors.walkLimit, VALIDATION_ISSUE.INVALID_VALUE);
  });

  test('복약 시각이 빈 줄이면 오류다', () => {
    const result = validatePeriodForm(answeredForm({ medication: { answer: 'YES', times: [{ time: '', atLodging: true }] } }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.equal(result.errors.medication, VALIDATION_ISSUE.INVALID_VALUE);
  });

  test('날짜가 없거나 역순이면 날짜 필드 오류다', () => {
    const noStart = validatePeriodForm(answeredForm({ startDate: '' }), { id: 'S-1', hospitals: ONE_HOSPITAL });
    assert.equal(noStart.errors.startDate, VALIDATION_ISSUE.REQUIRED);
    const reversed = validatePeriodForm(answeredForm({ startDate: '2026-10-06', endDate: '2026-10-03' }), {
      id: 'S-1',
      hospitals: ONE_HOSPITAL,
    });
    assert.equal(reversed.errors.endDate, VALIDATION_ISSUE.PERIOD_DATES_ORDER);
  });
});

describe('제한 없음 기간 (noRestriction)', () => {
  test('항목 답과 무관하게 모든 항목이 아니오·복귀 정하지 않음인 기간이 된다', () => {
    const form = emptyPeriodForm({ startDate: '2026-10-01', endDate: '2026-10-02' });
    form.noRestriction = true;
    const result = validatePeriodForm(form, { id: 'S-2', hospitals: ONE_HOSPITAL });
    assert.equal(result.ok, true);
    assert.equal(result.period.noRestriction, true);
    assert.deepEqual(result.period.items, structuredClone(NO_RESTRICTION_ITEMS));
  });
});

describe('기간 → 폼 (편집)', () => {
  test('저장한 기간을 폼으로 되돌리면 같은 기간이 다시 나온다', () => {
    const form = answeredForm();
    form.outing = 'INDOOR_ONLY';
    form.returnTime = { answer: 'YES', time: '17:00', place: 'HOSPITAL', hospitalId: 'H2' };
    form.walkLimit = { answer: 'UNKNOWN', minutes: '' };
    form.yesNo.escortRequired = 'YES';
    form.yesNo['diet.alcohol'] = 'YES';
    form.mealRestriction = { answer: 'YES', mode: 'UNTIL', until: '11:00' };
    form.medication = { answer: 'YES', times: [{ time: '09:00', atLodging: false }] };
    const first = validatePeriodForm(form, { id: 'S-3', hospitals: TWO_HOSPITALS });
    assert.equal(first.ok, true);
    const again = validatePeriodForm(periodToForm(first.period), { id: 'S-3', hospitals: TWO_HOSPITALS });
    assert.deepEqual(again.period, first.period);
  });

  test('제한 없음 기간은 제한 없음 표시로 돌아온다', () => {
    const form = periodToForm({
      id: 'S-4',
      source: 'SELF',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      noRestriction: true,
      items: NO_RESTRICTION_ITEMS,
    });
    assert.equal(form.noRestriction, true);
    assert.equal(form.startDate, '2026-10-01');
  });

  test('모든 예/아니오 항목이 되돌아온다', () => {
    const form = answeredForm();
    for (const key of YES_NO_KEYS) form.yesNo[key] = 'UNKNOWN';
    const { period } = validatePeriodForm(form, { id: 'S-5', hospitals: ONE_HOSPITAL });
    const back = periodToForm(period);
    for (const key of YES_NO_KEYS) {
      assert.equal(back.yesNo[key], 'UNKNOWN', `${key}: ${JSON.stringify(getItem(period.items, key))}`);
    }
  });
});

describe('본인 체크 기간 id', () => {
  test('기존 id 와 겹치지 않는 S- 로 시작하는 id', () => {
    const id = makeSelfPeriodId(['S-a'], 1000, () => 0.5);
    assert.match(id, /^S-[A-Za-z0-9_-]+$/);
    assert.notEqual(id, 'S-a');
    const clash = makeSelfPeriodId([id], 1000, () => 0.5);
    assert.notEqual(clash, id);
  });
});
