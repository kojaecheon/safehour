// 체류 모델 — 검증과 날짜 도우미 (AX-302 · spec 4.1–4.3, 5.1 Stay, 6장 PlanStay)
//
// 기기 저장 모델(`Stay`)과 서버 요청 모델(`PlanStay`)을 같은 함수로 다룬다.
// 둘의 차이(이름·주소 유무, 좌표 위치, 동의 표현)는 규칙에 영향을 주지 않는다.

import { validateConditionPeriod } from './conditions.js';
import { DEFAULTS } from './defaults.js';
import { VALIDATION_ISSUE, validationResult } from './errorCodes.js';
import { addDays, diffDays, eachDate, isClockTime, isDateString, parseInstantMs, toMinutes } from './time.js';

/**
 * @typedef {object} Address  spec 5.1
 * @property {string} roadAddress
 * @property {string} [jibunAddress]
 * @property {string} [buildingName]
 * @property {number} lat
 * @property {number} lng
 * @property {'JUSO'|'DEMO'} source
 */

/**
 * @typedef {object} LodgingSegment  spec 5.1 (PlanStay 는 address 대신 lat·lng, name 없음)
 * @property {string} id
 * @property {string} [name]  최대 40자
 * @property {Address} [address]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string} checkIn   "YYYY-MM-DD"
 * @property {string} checkOut  "YYYY-MM-DD" (그날 밤은 묵지 않음)
 */

/**
 * @typedef {object} Hospital  spec 5.1 (PlanStay 는 {id, lat, lng})
 * @property {string} id
 * @property {string} [name]  최대 40자
 * @property {Address} [address]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string} [phone]
 * @property {string} [linkedPlanId]
 */

/**
 * @typedef {object} Appointment  spec 5.1
 * @property {string} id
 * @property {string} hospitalId
 * @property {'PROCEDURE'|'VISIT'} type
 * @property {string} date   "YYYY-MM-DD"
 * @property {string} start  "HH:MM"
 * @property {string} [end]  "HH:MM"
 * @property {'USER'|'HOSPITAL'} [source]
 */

/**
 * @typedef {object} Stay  spec 5.1 (PlanStay 도 같은 규칙 필드를 가진다)
 * @property {2} [schemaVersion]
 * @property {{date: string, time: string, airport: 'ICN'|'GMP'}} arrival
 * @property {{date: string, time: string, airport: 'ICN'|'GMP'}} departure
 * @property {boolean} hasCompanion
 * @property {Array<'SHOPPING'|'KBEAUTY'|'PALACE_HISTORY'|'CAFE'|'EXHIBITION'|'FOOD'|'NATURE'|'FESTIVAL'>} interests
 * @property {'RELAXED'|'NORMAL'} pace
 * @property {LodgingSegment[]} lodgings
 * @property {Hospital[]} hospitals
 * @property {Appointment[]} appointments
 * @property {import('./conditions.js').ConditionPeriod[]} [periods]
 * @property {{sensitive: ({version: string, agreedAt: string} | null | boolean)}} [consent]
 *   Stay 는 {version, agreedAt}|null, PlanStay 는 boolean
 */

export const AIRPORTS = Object.freeze(['ICN', 'GMP']);
export const PACES = Object.freeze(['RELAXED', 'NORMAL']);
export const INTERESTS = Object.freeze([
  'SHOPPING',
  'KBEAUTY',
  'PALACE_HISTORY',
  'CAFE',
  'EXHIBITION',
  'FOOD',
  'NATURE',
  'FESTIVAL',
]);
export const APPOINTMENT_TYPES = Object.freeze(['PROCEDURE', 'VISIT']);
export const APPOINTMENT_SOURCES = Object.freeze(['USER', 'HOSPITAL']);
export const NAME_MAX_LENGTH = 40;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function blankOrBad(value) {
  return value === undefined || value === null || value === '' ? VALIDATION_ISSUE.REQUIRED : VALIDATION_ISSUE.INVALID_VALUE;
}

/** 숙소·병원의 좌표. Stay 는 address 안에, PlanStay 는 최상위에 있다 */
export function pointOf(entity) {
  const source = entity?.address && typeof entity.address === 'object' ? entity.address : entity;
  return { lat: source?.lat, lng: source?.lng };
}

/**
 * 체류 모델을 검증한다 (spec 4.1–4.3, 규칙 1–3).
 *
 * 거부 사유: 입국·출국 형식, 출국 < 입국, 체류 > 45박(조정 가능), 숙소 구간 0개·날짜 역순·겹침,
 * `PROCEDURE` 일정 0개, 등록되지 않은 병원을 가리키는 일정, 조건 기간 형식(있을 때).
 *
 * @param {Stay} stay
 * @param {{maxNights?: number}} [opts]
 * @returns {{ok: boolean, errorCode?: 'SAFEHOUR_STAY_INVALID', fields: string[], issues: Array<{field: string, code: string}>}}
 *   `fields` 는 화면이 표시할 필드 경로(중복 없음), `issues[].code` 는 VALIDATION_ISSUE
 */
export function validateStay(stay, { maxNights = DEFAULTS.stay.maxNights } = {}) {
  const issues = [];
  const push = (field, code) => {
    if (!issues.some((i) => i.field === field && i.code === code)) issues.push({ field, code });
  };
  if (!stay || typeof stay !== 'object') return validationResult([{ field: 'stay', code: VALIDATION_ISSUE.REQUIRED }]);

  // ── 입국·출국 ──
  const endpointOk = (key) => {
    const e = stay[key];
    let ok = true;
    if (!isDateString(e?.date)) {
      push(`${key}.date`, blankOrBad(e?.date));
      ok = false;
    }
    if (!isClockTime(e?.time)) {
      push(`${key}.time`, blankOrBad(e?.time));
      ok = false;
    }
    if (!AIRPORTS.includes(e?.airport)) push(`${key}.airport`, blankOrBad(e?.airport));
    return ok;
  };
  const arrivalOk = endpointOk('arrival');
  const departureOk = endpointOk('departure');
  if (arrivalOk && departureOk) {
    const nights = diffDays(stay.arrival.date, stay.departure.date);
    if (nights < 0) {
      push('departure.date', VALIDATION_ISSUE.DEPARTURE_BEFORE_ARRIVAL);
    } else if (nights === 0 && toMinutes(stay.departure.time) <= toMinutes(stay.arrival.time)) {
      push('departure.time', VALIDATION_ISSUE.DEPARTURE_BEFORE_ARRIVAL);
    }
    if (nights > maxNights) push('departure.date', VALIDATION_ISSUE.STAY_TOO_LONG);
  }

  // ── 동반 보호자·관심사·강도 ──
  if (typeof stay.hasCompanion !== 'boolean') push('hasCompanion', blankOrBad(stay.hasCompanion));
  if (!Array.isArray(stay.interests) || stay.interests.some((t) => !INTERESTS.includes(t))) {
    push('interests', blankOrBad(stay.interests));
  }
  if (!PACES.includes(stay.pace)) push('pace', blankOrBad(stay.pace));

  // ── 숙소 구간 ──
  const checkIds = (list, prefix) => {
    const seen = new Set();
    list.forEach((item, i) => {
      if (!isNonEmptyString(item?.id)) return push(`${prefix}[${i}].id`, VALIDATION_ISSUE.REQUIRED);
      if (seen.has(item.id)) push(`${prefix}[${i}].id`, VALIDATION_ISSUE.DUPLICATE_ID);
      seen.add(item.id);
    });
  };
  const checkName = (item, field) => {
    if (item?.name === undefined) return;
    if (typeof item.name !== 'string' || item.name.trim() === '') push(field, VALIDATION_ISSUE.INVALID_VALUE);
    else if (item.name.length > NAME_MAX_LENGTH) push(field, VALIDATION_ISSUE.NAME_TOO_LONG);
  };
  const checkPoint = (item, prefix) => {
    const { lat, lng } = pointOf(item);
    if (item?.address !== undefined) {
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) push(`${prefix}.address`, VALIDATION_ISSUE.INVALID_VALUE);
      return;
    }
    if (!isFiniteNumber(lat)) push(`${prefix}.lat`, blankOrBad(lat));
    if (!isFiniteNumber(lng)) push(`${prefix}.lng`, blankOrBad(lng));
  };

  const lodgings = stay.lodgings;
  if (!Array.isArray(lodgings)) {
    push('lodgings', VALIDATION_ISSUE.REQUIRED);
  } else if (lodgings.length === 0) {
    push('lodgings', VALIDATION_ISSUE.LODGINGS_EMPTY);
  } else {
    checkIds(lodgings, 'lodgings');
    const dated = [];
    lodgings.forEach((l, i) => {
      const prefix = `lodgings[${i}]`;
      checkName(l, `${prefix}.name`);
      checkPoint(l, prefix);
      const inOk = isDateString(l?.checkIn);
      const outOk = isDateString(l?.checkOut);
      if (!inOk) push(`${prefix}.checkIn`, blankOrBad(l?.checkIn));
      if (!outOk) push(`${prefix}.checkOut`, blankOrBad(l?.checkOut));
      if (inOk && outOk) {
        if (l.checkOut <= l.checkIn) push(`${prefix}.checkOut`, VALIDATION_ISSUE.LODGING_DATES_ORDER);
        else dated.push({ i, checkIn: l.checkIn, checkOut: l.checkOut });
      }
    });
    // [checkIn, checkOut) 구간이 겹치면 거부 — 체크아웃 날짜 = 다음 체크인 날짜는 겹침이 아니다
    for (let a = 0; a < dated.length; a += 1) {
      for (let b = a + 1; b < dated.length; b += 1) {
        const x = dated[a];
        const y = dated[b];
        if (x.checkIn < y.checkOut && y.checkIn < x.checkOut) {
          push(`lodgings[${x.i}]`, VALIDATION_ISSUE.LODGING_OVERLAP);
          push(`lodgings[${y.i}]`, VALIDATION_ISSUE.LODGING_OVERLAP);
        }
      }
    }
  }

  // ── 병원 ──
  const hospitals = Array.isArray(stay.hospitals) ? stay.hospitals : null;
  if (!hospitals) {
    push('hospitals', VALIDATION_ISSUE.REQUIRED);
  } else {
    checkIds(hospitals, 'hospitals');
    hospitals.forEach((h, i) => {
      checkName(h, `hospitals[${i}].name`);
      checkPoint(h, `hospitals[${i}]`);
      if (h?.phone !== undefined && typeof h.phone !== 'string') push(`hospitals[${i}].phone`, VALIDATION_ISSUE.INVALID_VALUE);
    });
  }
  const hospitalIds = new Set((hospitals ?? []).map((h) => h?.id));

  // ── 병원 일정 ──
  const appointments = stay.appointments;
  if (!Array.isArray(appointments)) {
    push('appointments', VALIDATION_ISSUE.REQUIRED);
  } else {
    checkIds(appointments, 'appointments');
    appointments.forEach((a, i) => {
      const prefix = `appointments[${i}]`;
      if (!isNonEmptyString(a?.hospitalId)) push(`${prefix}.hospitalId`, VALIDATION_ISSUE.REQUIRED);
      else if (!hospitalIds.has(a.hospitalId)) push(`${prefix}.hospitalId`, VALIDATION_ISSUE.UNKNOWN_HOSPITAL);
      if (!APPOINTMENT_TYPES.includes(a?.type)) push(`${prefix}.type`, blankOrBad(a?.type));
      if (!isDateString(a?.date)) push(`${prefix}.date`, blankOrBad(a?.date));
      const startOk = isClockTime(a?.start);
      if (!startOk) push(`${prefix}.start`, blankOrBad(a?.start));
      if (a?.end !== undefined && a?.end !== null) {
        if (!isClockTime(a.end)) push(`${prefix}.end`, VALIDATION_ISSUE.INVALID_VALUE);
        else if (startOk && toMinutes(a.end) <= toMinutes(a.start)) {
          push(`${prefix}.end`, VALIDATION_ISSUE.APPOINTMENT_END_BEFORE_START);
        }
      }
      if (a?.source !== undefined && !APPOINTMENT_SOURCES.includes(a.source)) {
        push(`${prefix}.source`, VALIDATION_ISSUE.INVALID_VALUE);
      }
    });
    // 경계일을 빼먹으면 수술 뒤 날짜가 제한 없는 자유일로 만들어진다 (spec 4.3)
    if (!appointments.some((a) => a?.type === 'PROCEDURE' && isDateString(a.date))) {
      push('appointments', VALIDATION_ISSUE.PROCEDURE_REQUIRED);
    }
  }

  // ── 조건 기간 (있을 때) ──
  if (stay.periods !== undefined) {
    if (!Array.isArray(stay.periods)) {
      push('periods', VALIDATION_ISSUE.INVALID_VALUE);
    } else {
      checkIds(stay.periods, 'periods');
      stay.periods.forEach((p, i) => {
        for (const issue of validateConditionPeriod(p, { hospitals: hospitals ?? [] }).issues) {
          push(`periods[${i}].${issue.field}`, issue.code);
        }
      });
    }
  }

  return validationResult(issues);
}

/** 체류 날짜 목록 (입국일~출국일, 양끝 포함) */
export function stayDates(stay) {
  return eachDate(stay.arrival.date, stay.departure.date);
}

/** 입국일~출국일 안의 날짜인가 */
export function isStayDate(stay, date) {
  const a = stay?.arrival?.date;
  const d = stay?.departure?.date;
  return isDateString(date) && isDateString(a) && isDateString(d) && a <= date && date <= d;
}

/** 체류 박 수 */
export function stayNights(stay) {
  return diffDays(stay.arrival.date, stay.departure.date);
}

/**
 * 날짜 D의 숙소 (spec 4.2): D일 밤을 묵는 숙소(체크인 ≤ D < 체크아웃).
 * 출국일의 숙소는 전날 밤 숙소다(짐이 있는 곳). 없으면 null.
 * @param {Stay} stay
 * @param {string} date
 * @returns {LodgingSegment|null}
 */
export function lodgingForDate(stay, date) {
  const night = date === stay?.departure?.date ? addDays(date, -1) : date;
  const matches = (stay?.lodgings ?? [])
    .filter((l) => isDateString(l?.checkIn) && isDateString(l?.checkOut) && l.checkIn <= night && night < l.checkOut)
    .sort((x, y) => (x.checkIn === y.checkIn ? String(x.id).localeCompare(String(y.id)) : x.checkIn < y.checkIn ? -1 : 1));
  return matches[0] ?? null;
}

/**
 * 수술 후 경계일 = 가장 이른 `PROCEDURE` 일정의 날짜 (spec 4.3). 없으면 null.
 * null 이면 분류는 모든 날짜를 경계일 이후로 본다(자유일로 새지 않게).
 */
export function postProcedureBoundary(stay) {
  const dates = (stay?.appointments ?? [])
    .filter((a) => a?.type === 'PROCEDURE' && isDateString(a.date))
    .map((a) => a.date)
    .sort();
  return dates[0] ?? null;
}

/** 날짜의 병원 일정 — 시작 시각 순(같으면 id 순) */
export function appointmentsOnDate(stay, date) {
  return (stay?.appointments ?? [])
    .filter((a) => a?.date === date && isClockTime(a.start))
    .sort((x, y) => toMinutes(x.start) - toMinutes(y.start) || String(x.id).localeCompare(String(y.id)));
}

/**
 * 민감정보 동의가 유효한가.
 * Stay: `consent.sensitive` = {version, agreedAt} | null, PlanStay: boolean
 */
export function hasSensitiveConsent(stay) {
  const s = stay?.consent?.sensitive;
  if (s === true) return true;
  if (!s || typeof s !== 'object') return false;
  return s.version !== undefined && s.version !== null && s.version !== '' && parseInstantMs(s.agreedAt) !== null;
}
