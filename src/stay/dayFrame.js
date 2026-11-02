// 하루의 틀 — 활동 창, 입국일 시작·출국일 마감, 병원 일정 블록, 복약 마감 (AX-302 · spec 4.1·4.3·4.7)
//
// 이동 추정은 **인자로 받는다**. 이 계층은 이동시간을 추정하지 않는다(엔진·어댑터 몫).
// 이동 추정이 필요한데 없으면 0분으로 가정하지 않고 TypeError 를 낸다 — 창이 넓어지는 쪽으로 틀리지 않게.
// 이동 추정의 소수점은 올린다(보수적).

import { REASON } from '../domain/states.js';
import { DEFAULTS } from './defaults.js';
import { isStayDate, pointOf } from './stay.js';
import { fromMinutes, isClockTime, toMinutes } from './time.js';

function travelMinutes(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name}: 이동 추정(분)이 필요합니다`);
  }
  return Math.ceil(value);
}

/**
 * 입국일 일정 시작 시각(입국일 자정부터의 분, 24시간을 넘을 수 있음).
 * = 도착 시각 + 입국 수속 90분 + 공항→그날 숙소 이동 추정 (spec 4.1, 규칙 14)
 * @param {import('./stay.js').Stay} stay
 * @param {number} airportToLodgingMin
 */
export function arrivalDayStartMin(stay, airportToLodgingMin) {
  return (
    toMinutes(stay.arrival.time) +
    DEFAULTS.airport.arrivalProcessingMin +
    travelMinutes(airportToLodgingMin, 'airportToLodgingMin')
  );
}

/**
 * 출국일 일정 마감 시각(출국일 자정부터의 분, 음수일 수 있음).
 * = 출발 시각 − 공항 도착 여유 3시간 − 그날 숙소→공항 이동 추정 − 여유 30분 (spec 4.1, 규칙 15)
 * @param {import('./stay.js').Stay} stay
 * @param {number} lodgingToAirportMin
 */
export function departureDayCutoffMin(stay, lodgingToAirportMin) {
  return (
    toMinutes(stay.departure.time) -
    DEFAULTS.airport.departureArrivalLeadMin -
    travelMinutes(lodgingToAirportMin, 'lodgingToAirportMin') -
    DEFAULTS.airport.departureSlackMin
  );
}

/**
 * 날짜의 활동 창 (spec 4.1·4.7): 활동 시간 09:00–21:00 을 입국일 시작·출국일 마감으로 자른다.
 * 창이 없거나 체류 밖이면 `window: null` + `OUTSIDE_STAY_WINDOW`.
 *
 * @param {import('./stay.js').Stay} stay
 * @param {string} date
 * @param {{airportToLodgingMin?: number, lodgingToAirportMin?: number}} [travel]
 *   입국일이면 airportToLodgingMin, 출국일이면 lodgingToAirportMin 이 반드시 있어야 한다
 * @returns {{window: {start: string, end: string} | null, startMin: number|null, endMin: number|null,
 *            endReason: 'DAY_END'|'DEPARTURE'|null, reasons: string[]}}
 *   endReason 은 창 끝이 외출 마감이 될 때의 `Outing.deadlineReason` 이다
 */
export function dayWindow(stay, date, { airportToLodgingMin, lodgingToAirportMin } = {}) {
  if (!isStayDate(stay, date)) {
    return { window: null, startMin: null, endMin: null, endReason: null, reasons: [REASON.OUTSIDE_STAY_WINDOW] };
  }
  let startMin = toMinutes(DEFAULTS.activityHours.start);
  let endMin = toMinutes(DEFAULTS.activityHours.end);
  let endReason = 'DAY_END';

  if (date === stay.arrival.date) {
    startMin = Math.max(startMin, arrivalDayStartMin(stay, airportToLodgingMin));
  }
  if (date === stay.departure.date) {
    const cutoff = departureDayCutoffMin(stay, lodgingToAirportMin);
    if (cutoff <= endMin) {
      endMin = cutoff;
      endReason = 'DEPARTURE';
    }
  }

  if (startMin >= endMin) {
    return { window: null, startMin, endMin, endReason, reasons: [REASON.OUTSIDE_STAY_WINDOW] };
  }
  return { window: { start: fromMinutes(startMin), end: fromMinutes(endMin) }, startMin, endMin, endReason, reasons: [] };
}

/**
 * 병원 일정의 종료. 종료 시각이 없으면 PROCEDURE 240분, VISIT 90분으로 보고 '예상 종료'로 표시한다 (spec 4.3).
 * @param {import('./stay.js').Appointment} appointment
 * @returns {{end: string, endMin: number, estimated: boolean}}  endMin 은 24시간을 넘을 수 있다(end 는 23:59 로 자름)
 */
export function appointmentEnd(appointment) {
  if (isClockTime(appointment?.end)) {
    return { end: appointment.end, endMin: toMinutes(appointment.end), estimated: false };
  }
  const duration = DEFAULTS.appointmentDurationMin[appointment?.type];
  if (duration === undefined) throw new TypeError(`병원 일정 유형을 알 수 없습니다: ${String(appointment?.type)}`);
  const endMin = toMinutes(appointment.start) + duration;
  return { end: fromMinutes(endMin), endMin, estimated: true };
}

/**
 * 병원 일정 블록의 범위(분). 이 구간에는 외출을 만들지 않는다 (spec 4.3).
 *
 * - 기본: [시작 − 숙소→병원 이동 − 도착 여유 10분, 종료 + 병원→숙소 이동]
 * - 직전 외출이 이 병원에서 끝나면(`precededByOuting`): 블록은 **일정 시작 시각**부터다.
 *   숙소→병원 이동은 블록에 넣지 않고(외출의 마지막 구간이 대신함), 도착 여유는 복귀 계산식에서 한 번만 더한다.
 *   45분 최소 창은 이렇게 정한 블록 시작까지로 계산한다(엔진 몫).
 *
 * @param {import('./stay.js').Appointment} appointment
 * @param {{lodgingToHospitalMin?: number, hospitalToLodgingMin: number, precededByOuting?: boolean}} travel
 * @returns {{startMin: number, endMin: number}}
 */
export function appointmentBlockMinutes(appointment, { lodgingToHospitalMin, hospitalToLodgingMin, precededByOuting = false } = {}) {
  const start = toMinutes(appointment.start);
  const startMin = precededByOuting
    ? start
    : start - travelMinutes(lodgingToHospitalMin, 'lodgingToHospitalMin') - DEFAULTS.buffers.arrivalMarginMin;
  const endMin = appointmentEnd(appointment).endMin + travelMinutes(hospitalToLodgingMin, 'hospitalToLodgingMin');
  return { startMin, endMin };
}

/**
 * `DayPlan.blocks` 원소 모양의 병원 일정 블록 (spec 5.2).
 * @returns {{kind: 'APPOINTMENT', start: string, end: string, appointmentId: string}}
 */
export function appointmentBlock(appointment, travel) {
  const { startMin, endMin } = appointmentBlockMinutes(appointment, travel);
  return { kind: 'APPOINTMENT', start: fromMinutes(startMin), end: fromMinutes(endMin), appointmentId: appointment.id };
}

function atLodgingDoses(medication) {
  // '숙소에서 복용'의 기본은 예다 — 값이 false 로 명시된 경우만 숙소 밖 복용으로 본다
  return (Array.isArray(medication) ? medication : [])
    .filter((m) => m && isClockTime(m.time) && m.atLodging !== false)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

/**
 * '숙소에서 복용' 복약 시각이 만드는 마감 (규칙 16).
 * 그 전 외출은 이 시각까지 숙소로 돌아와야 하고, 마감 이유는 `MEDICATION`, 사유는 `MEDICATION_WINDOW` 다.
 * '숙소 밖 복용'은 마감을 만들지 않는다. 복약 '모르겠음'은 합성 결과가 [] 라 마감이 없다(규칙 17).
 * @param {Array<{time: string, atLodging: boolean}>} medication  `ConditionLimits.medication`
 * @returns {Array<{time: string, deadlineReason: 'MEDICATION', reason: 'MEDICATION_WINDOW'}>}
 */
export function medicationDeadlines(medication) {
  return atLodgingDoses(medication).map((m) => ({
    time: m.time,
    deadlineReason: 'MEDICATION',
    reason: REASON.MEDICATION_WINDOW,
  }));
}

/**
 * '숙소에서 복용' 복약 블록: 복약 시각부터 15분(조정 가능)이 지나야 다음 외출을 시작한다 (spec 4.7).
 * @returns {Array<{kind: 'MEDICATION', start: string, end: string}>}
 */
export function medicationBlocks(medication) {
  return atLodgingDoses(medication).map((m) => ({
    kind: 'MEDICATION',
    start: m.time,
    end: fromMinutes(toMinutes(m.time) + DEFAULTS.medicationGapMin),
  }));
}

/**
 * 복귀 장소와 좌표 (규칙 13-1). `returnTime` 장소가 병원이면 그 `hospitalId` 병원의 좌표, 아니면 그날 숙소 좌표.
 * 찾을 수 없으면 추측하지 않고 RangeError.
 * @param {{place?: 'LODGING'|'HOSPITAL', hospitalId?: string} | null} returnTime  `ConditionLimits.returnTime`
 * @param {{lodging: import('./stay.js').LodgingSegment | null, hospitals: import('./stay.js').Hospital[]}} ctx
 * @returns {{place: 'LODGING', lodgingId: string, lat: number, lng: number} | {place: 'HOSPITAL', hospitalId: string, lat: number, lng: number}}
 */
export function resolveReturnPlace(returnTime, { lodging, hospitals } = {}) {
  if (returnTime?.place === 'HOSPITAL') {
    const id = returnTime.hospitalId;
    const hospital = typeof id === 'string' && id ? (hospitals ?? []).find((h) => h?.id === id) : null;
    if (!hospital) throw new RangeError('복귀할 병원을 찾을 수 없습니다');
    const { lat, lng } = pointOf(hospital);
    return { place: 'HOSPITAL', hospitalId: id, lat, lng };
  }
  if (!lodging) throw new RangeError('복귀할 숙소가 없습니다');
  const { lat, lng } = pointOf(lodging);
  return { place: 'LODGING', lodgingId: lodging.id, lat, lng };
}
