// 본인 체크 입력 폼 ↔ 조건 기간(SELF) 변환 — 순수 함수 (AX-315 · spec 4.4, 5.1, 규칙 6·13-1)
//
// 화면(PeriodEditorForm)은 이 모양의 폼 상태만 들고 있고, 저장할 때 여기서 ConditionPeriod 로 바꾼다.
// 검증은 도메인 계약(src/stay/conditions.js validateConditionPeriod)이 한다 — 여기서 규칙을 새로 만들지 않는다.
//
// 폼 상태
//   {
//     startDate, endDate,                       'YYYY-MM-DD' (양끝 포함)
//     noRestriction: boolean,                   제한 없음 기간
//     outing: 'ALLOWED'|'INDOOR_ONLY'|'FORBIDDEN'|null,                       필수, '모르겠음' 없음
//     returnTime: { answer: 'YES'|'NO'|null, time, place: 'LODGING'|'HOSPITAL', hospitalId },  필수(외출 불가면 묻지 않음)
//     walkLimit / travelLimit: { answer: 'YES'|'NO'|'UNKNOWN'|null, minutes: string },
//     yesNo: { [점 표기 키]: 'YES'|'NO'|'UNKNOWN'|null },   자외선·열·물·동행·곁 지킴·식이 5종
//     mealRestriction: { answer, mode: 'ALL_DAY'|'UNTIL', until },
//     medication: { answer, times: Array<{ time, atLodging }> },   '숙소에서 복용' 기본 예
//   }
//
// 답의 뜻 (handoff 4장): 예 = 그 값을 적용, 아니오 = 병원이 그런 안내를 하지 않음(제한 없음),
// 모르겠음 = 가장 엄격한 기본값(합성이 적용하고 '기본값 적용'을 붙인다).
// 자유 서술 칸은 없다. 앱은 값을 해석하지 않는다.
//
// Next 밖(node --test)에서도 읽히도록 상대 경로만 쓴다.
// 파일 이름 주의: macOS 기본 파일 시스템은 대소문자를 가리지 않는다 — 화면 부품(PeriodEditorForm.js)과
// 이름이 겹치지 않게 `…Model.js` 로 둔다.

import {
  CONDITION_SOURCE,
  NO_RESTRICTION_ITEMS,
  OUTING,
  RETURN_PLACE,
  YES_NO_KEYS,
  getItem,
  normalizeConditionPeriod,
  validateConditionPeriod,
  withItem,
} from '../../src/stay/conditions.js';

export const ANSWER = Object.freeze({ YES: 'YES', NO: 'NO', UNKNOWN: 'UNKNOWN' });

/** 예/아니오 항목 — 화면 순서도 이것이다 (spec 4.4 표) */
export const FORM_YES_NO_KEYS = YES_NO_KEYS;

/** 한도 항목 — 분(5–240) */
export const LIMIT_KEYS = Object.freeze(['walkLimit', 'travelLimit']);

function newMedicationRow() {
  return { time: '', atLodging: true };
}

/**
 * 아직 아무것도 고르지 않은 폼.
 * @param {{startDate?: string, endDate?: string}} [dates]
 */
export function emptyPeriodForm({ startDate = '', endDate = '' } = {}) {
  return {
    startDate,
    endDate,
    noRestriction: false,
    outing: null,
    returnTime: { answer: null, time: '', place: RETURN_PLACE.LODGING, hospitalId: '' },
    walkLimit: { answer: null, minutes: '' },
    travelLimit: { answer: null, minutes: '' },
    yesNo: Object.fromEntries(FORM_YES_NO_KEYS.map((key) => [key, null])),
    mealRestriction: { answer: null, mode: 'ALL_DAY', until: '' },
    medication: { answer: null, times: [newMedicationRow()] },
  };
}

/** 복약 시각 한 줄 추가용 — '숙소에서 복용' 기본 예 */
export function emptyMedicationRow() {
  return newMedicationRow();
}

/**
 * 병원 복귀의 병원 id — 고른 값이 있으면 그 값, 등록 병원이 하나면 자동으로 그 병원 (spec 4.4).
 * @param {{place?: string, hospitalId?: string}} returnTime
 * @param {Array<{id: string}>} hospitals
 */
export function returnHospitalId(returnTime, hospitals = []) {
  if (typeof returnTime?.hospitalId === 'string' && returnTime.hospitalId !== '') return returnTime.hospitalId;
  return Array.isArray(hospitals) && hospitals.length === 1 && hospitals[0]?.id ? hospitals[0].id : '';
}

/**
 * 화면 묶음: 외출·복귀(필수, 늘 펼침) 다음에 오는 항목을 묶는다(운영자 결정 2026-11-08).
 * 묶음은 접혀 있고, 맨 위 '제한 없음' 버튼이 그 묶음에서 **아직 답하지 않은** 항목만 '아니오'로 채운다.
 * 이미 고른 답('예'·'모르겠음'·'아니오')은 절대 바꾸지 않는다: 접힌 묶음에서 한 번 눌러 판정이 느슨해지면 안 된다.
 * '모르겠음'의 뜻(가장 엄격한 기본값)은 그대로다. 외출·복귀는 여기 없다: 늘 직접 고른다.
 */
export const ITEM_GROUPS = Object.freeze([
  Object.freeze({ id: 'limits', titleKey: 'conditions.groupLimits', fields: Object.freeze(['walkLimit', 'travelLimit']) }),
  Object.freeze({ id: 'exposure', titleKey: 'conditions.groupExposure', fields: Object.freeze(['avoidUv', 'avoidHeat', 'avoidWater']) }),
  Object.freeze({ id: 'guardian', titleKey: 'conditions.groupGuardian', fields: Object.freeze(['escortRequired', 'guardianMustStay']) }),
  Object.freeze({
    id: 'meal',
    titleKey: 'conditions.groupMeal',
    fields: Object.freeze(['mealRestriction', 'diet.spicy', 'diet.alcohol', 'diet.hard', 'diet.hot', 'diet.raw']),
  }),
  Object.freeze({ id: 'medication', titleKey: 'conditions.groupMedication', fields: Object.freeze(['medication']) }),
]);

/**
 * 폼에서 한 항목의 답('YES'|'NO'|'UNKNOWN'|null).
 * 동행 필수=예 이면 보호자 곁 지킴은 '예'로 고정된 것으로 본다(저장도 '예').
 */
export function formAnswerOf(form, field) {
  if (LIMIT_KEYS.includes(field)) return form?.[field]?.answer ?? null;
  if (field === 'mealRestriction' || field === 'medication') return form?.[field]?.answer ?? null;
  if (field === 'guardianMustStay' && form?.yesNo?.escortRequired === ANSWER.YES) return ANSWER.YES;
  return form?.yesNo?.[field] ?? null;
}

/** 묶음에서 아직 답하지 않은 항목 */
export function unansweredFields(form, fields) {
  return fields.filter((field) => formAnswerOf(form, field) === null);
}

/**
 * 묶음에서 **답하지 않은 항목만** '아니오'(병원이 그런 안내를 하지 않음)로 채운 새 폼.
 * 이미 고른 답('예'·'모르겠음'·'아니오'), 다른 묶음, 외출·복귀는 그대로 둔다. 답하지 않은 항목이 없으면 같은 폼을 돌려준다.
 * 사용자가 버튼을 눌러 직접 고르는 답이다. 앱이 값을 짐작해 넣는 것이 아니다.
 * @param {ReturnType<typeof emptyPeriodForm>} form
 * @param {readonly string[]} fields  ITEM_GROUPS[].fields
 */
export function fillGroupNone(form, fields) {
  const targets = unansweredFields(form, fields);
  if (targets.length === 0) return form;
  const next = { ...form, yesNo: { ...form.yesNo } };
  for (const field of targets) {
    if (LIMIT_KEYS.includes(field) || field === 'mealRestriction' || field === 'medication') {
      next[field] = { ...form[field], answer: ANSWER.NO };
    } else {
      next.yesNo[field] = ANSWER.NO;
    }
  }
  return next;
}

/** 폼의 답 → Answer<true>. 고르지 않았으면 undefined(검증이 REQUIRED 로 막는다) */
function yesNoAnswer(answer) {
  if (answer === ANSWER.YES) return { kind: 'SET', value: true };
  if (answer === ANSWER.NO) return { kind: 'NONE' };
  if (answer === ANSWER.UNKNOWN) return { kind: 'UNKNOWN' };
  return undefined;
}

function minutesValue(minutes) {
  if (typeof minutes === 'number') return minutes;
  if (typeof minutes !== 'string' || minutes.trim() === '') return null;
  const n = Number(minutes);
  return Number.isFinite(n) ? n : null;
}

function limitAnswer(field) {
  if (field?.answer === ANSWER.YES) return { kind: 'SET', value: minutesValue(field.minutes) };
  return yesNoAnswer(field?.answer);
}

function mealAnswer(field) {
  if (field?.answer !== ANSWER.YES) return yesNoAnswer(field?.answer);
  return field.mode === 'UNTIL'
    ? { kind: 'SET', value: { mode: 'UNTIL', until: field.until ?? '' } }
    : { kind: 'SET', value: { mode: 'ALL_DAY' } };
}

function medicationAnswer(field) {
  if (field?.answer !== ANSWER.YES) return yesNoAnswer(field?.answer);
  const times = Array.isArray(field.times) ? field.times : [];
  return {
    kind: 'SET',
    // '숙소에서 복용'은 기본 예 — 값이 없으면 예로 본다 (spec 4.4)
    value: times.map((row) => ({ time: row?.time ?? '', atLodging: row?.atLodging !== false })),
  };
}

function returnTimeAnswer(field, hospitals) {
  if (field?.answer === ANSWER.NO) return { kind: 'NOT_SET' };
  if (field?.answer === ANSWER.UNKNOWN) return { kind: 'UNKNOWN' };
  if (field?.answer !== ANSWER.YES) return undefined;
  if (field.place === RETURN_PLACE.HOSPITAL) {
    const hospitalId = returnHospitalId(field, hospitals);
    return {
      kind: 'SET',
      time: field.time ?? '',
      place: RETURN_PLACE.HOSPITAL,
      ...(hospitalId ? { hospitalId } : {}),
    };
  }
  return { kind: 'SET', time: field.time ?? '', place: RETURN_PLACE.LODGING };
}

/**
 * 폼 → 조건 기간(SELF). 검증하지 않는다 — validatePeriodForm 을 쓴다.
 *
 * - 제한 없음이면 항목은 NO_RESTRICTION_ITEMS 다(spec 4.4).
 * - 외출 불가면 복귀 시각을 싣지 않는다(묻지 않는 항목).
 * - 동행 필수=예 이면 guardianMustStay 는 폼 값과 무관하게 SET(true)다(spec 4.4).
 *
 * @param {ReturnType<typeof emptyPeriodForm>} form
 * @param {{id: string, hospitals?: Array<{id: string}>}} opts
 * @returns {import('../../src/stay/conditions.js').ConditionPeriod}
 */
export function formToPeriod(form, { id, hospitals = [] } = {}) {
  const base = {
    id,
    source: CONDITION_SOURCE.SELF,
    startDate: form?.startDate ?? '',
    endDate: form?.endDate ?? '',
  };
  if (form?.noRestriction === true) {
    return { ...base, noRestriction: true, items: structuredClone(NO_RESTRICTION_ITEMS) };
  }

  let items = { diet: {} };
  const set = (key, value) => {
    if (value !== undefined) items = withItem(items, key, value);
  };

  // 'UNKNOWN' 은 화면이 만들지 않지만, 들어오면 검증이 UNKNOWN_NOT_ALLOWED 로 막도록 그대로 싣는다
  if (Object.values(OUTING).includes(form?.outing) || form?.outing === ANSWER.UNKNOWN) set('outing', form.outing);
  if (form?.outing !== OUTING.FORBIDDEN) set('returnTime', returnTimeAnswer(form?.returnTime, hospitals));
  for (const key of LIMIT_KEYS) set(key, limitAnswer(form?.[key]));
  for (const key of FORM_YES_NO_KEYS) set(key, yesNoAnswer(form?.yesNo?.[key]));
  if (form?.yesNo?.escortRequired === ANSWER.YES) set('guardianMustStay', { kind: 'SET', value: true });
  set('mealRestriction', mealAnswer(form?.mealRestriction));
  set('medication', medicationAnswer(form?.medication));

  return { ...base, items };
}

/** 검증 필드 경로 → 폼 필드 키 ('items.diet.spicy' → 'diet.spicy') */
function formFieldOf(field) {
  return field.startsWith('items.') ? field.slice('items.'.length) : field;
}

/**
 * 폼을 검증한다. 통과하면 저장할(정규화한) 기간을 준다.
 * @param {ReturnType<typeof emptyPeriodForm>} form
 * @param {{id: string, hospitals?: Array<{id: string}>}} opts
 * @returns {{ok: boolean, period: object|null, errors: Record<string, string>}}
 *   errors: 폼 필드 키 → VALIDATION_ISSUE (필드마다 첫 문제 하나)
 */
export function validatePeriodForm(form, { id, hospitals = [] } = {}) {
  const period = formToPeriod(form, { id, hospitals });
  const result = validateConditionPeriod(period, { hospitals });
  if (result.ok) return { ok: true, period: normalizeConditionPeriod(period), errors: {} };
  const errors = {};
  for (const issue of result.issues) {
    const key = formFieldOf(issue.field);
    if (!(key in errors)) errors[key] = issue.code;
  }
  return { ok: false, period: null, errors };
}

function answerOf(value) {
  if (value?.kind === 'SET') return ANSWER.YES;
  if (value?.kind === 'NONE') return ANSWER.NO;
  if (value?.kind === 'UNKNOWN') return ANSWER.UNKNOWN;
  return null;
}

/**
 * 저장된 SELF 기간 → 편집 폼.
 * @param {import('../../src/stay/conditions.js').ConditionPeriod} period
 */
export function periodToForm(period) {
  const form = emptyPeriodForm({ startDate: period?.startDate ?? '', endDate: period?.endDate ?? '' });
  if (period?.noRestriction === true) return { ...form, noRestriction: true };
  const items = period?.items ?? {};

  form.outing = Object.values(OUTING).includes(items.outing) ? items.outing : null;

  const rt = items.returnTime;
  if (rt?.kind === 'NOT_SET') form.returnTime = { ...form.returnTime, answer: ANSWER.NO };
  else if (rt?.kind === 'SET') {
    form.returnTime = {
      answer: ANSWER.YES,
      time: rt.time ?? '',
      place: rt.place === RETURN_PLACE.HOSPITAL ? RETURN_PLACE.HOSPITAL : RETURN_PLACE.LODGING,
      hospitalId: rt.place === RETURN_PLACE.HOSPITAL ? rt.hospitalId ?? '' : '',
    };
  }

  for (const key of LIMIT_KEYS) {
    const value = items[key];
    form[key] = { answer: answerOf(value), minutes: value?.kind === 'SET' ? String(value.value) : '' };
  }
  for (const key of FORM_YES_NO_KEYS) form.yesNo[key] = answerOf(getItem(items, key));

  const meal = items.mealRestriction;
  const until = meal?.kind === 'SET' && meal.value?.mode === 'UNTIL';
  form.mealRestriction = {
    answer: answerOf(meal),
    mode: until ? 'UNTIL' : 'ALL_DAY',
    until: until ? meal.value.until ?? '' : '',
  };

  const med = items.medication;
  form.medication = {
    answer: answerOf(med),
    times:
      med?.kind === 'SET' && Array.isArray(med.value) && med.value.length > 0
        ? med.value.map((row) => ({ time: row.time ?? '', atLodging: row.atLodging !== false }))
        : [newMedicationRow()],
  };
  return form;
}

/**
 * 새 본인 체크 기간 id — `S-` + 시각·난수(base36). 기존 id 와 겹치면 다시 만든다.
 * @param {Iterable<string>} existingIds
 * @param {number} [nowMs]
 * @param {() => number} [random]
 */
export function makeSelfPeriodId(existingIds = [], nowMs = Date.now(), random = Math.random) {
  const taken = new Set(existingIds);
  const stem = `S-${Math.max(0, Math.floor(nowMs)).toString(36)}`;
  let candidate = `${stem}-${Math.floor(random() * 36 ** 4).toString(36)}`;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${stem}-${Math.floor(random() * 36 ** 4).toString(36)}-${n.toString(36)}`;
    n += 1;
  }
  return candidate;
}
