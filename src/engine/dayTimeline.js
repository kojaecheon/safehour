// 하루의 고정 블록과 외출 마감 후보 (AX-306 · docs/business-rules.md '숙소와 병원'·'하루 일정 생성')
//
// 마감 후보와 기록할 이유 (docs/business-rules.md '하루 일정 생성'의 마감 후보 표)
//   합성된 returnTime(그 장소로 복귀)            RETURN_TIME   — 이후 그날 환자 외출 없음
//   다음 '숙소에서 복용' 복약 시각(숙소로 복귀)   MEDICATION    — 복약 후 15분 뒤부터 다음 외출
//   다음 병원 일정의 시작 시각(그 병원으로 복귀)  APPOINTMENT   — 블록이 끝난 뒤부터 다음 외출
//   활동 종료                                 DAY_END
//   출국일 마감                               DEPARTURE
//
// 외출 창 = 앞 블록이 끝난 때부터 다음 마감 후보까지. 창의 마감은 구조상 창 시작 뒤 가장 이른 마감 후보다.
// 병원 일정 블록의 시작은 직전 외출이 있는지에 따라 달라진다(docs/business-rules.md '숙소와 병원'). 그 결정은 외출을 만든 뒤 엔진이 한다.

import { DEFAULTS } from '../stay/defaults.js';
import { appointmentBlockMinutes, medicationDeadlines, resolveReturnPlace } from '../stay/dayFrame.js';
import { pointOf } from '../stay/stay.js';
import { toMinutes } from '../stay/time.js';

/** 같은 시각의 마감 후보를 고르는 결정적 순서 (docs/business-rules.md '하루 일정 생성'의 마감 후보 표 순서) */
const KIND_ORDER = Object.freeze({ RETURN_TIME: 0, MEDICATION: 1, APPOINTMENT: 2, DAY_END: 3, DEPARTURE: 3 });

/**
 * 병원 일정 → 마감 후보. 블록 범위(직전 외출이 없을 때·있을 때)를 함께 계산한다.
 * @param {Array} appointments  그날 병원 일정 (appointmentsOnDate)
 * @param {{lodgingPoint: {lat:number,lng:number}, hospitals: Array, estimate: Function}} ctx
 */
export function appointmentEvents(appointments, { lodgingPoint, hospitals, estimate }) {
  return (appointments ?? []).map((appointment) => {
    const hospital = (hospitals ?? []).find((h) => h?.id === appointment.hospitalId);
    if (!hospital) throw new RangeError('병원 일정의 병원을 찾을 수 없습니다');
    const point = pointOf(hospital);
    const travel = {
      lodgingToHospitalMin: estimate(lodgingPoint, point).min,
      hospitalToLodgingMin: estimate(point, lodgingPoint).min,
    };
    const standalone = appointmentBlockMinutes(appointment, travel);
    const chained = appointmentBlockMinutes(appointment, { ...travel, precededByOuting: true });
    return {
      kind: 'APPOINTMENT',
      deadlineMin: toMinutes(appointment.start),
      place: 'HOSPITAL',
      point,
      appointmentId: appointment.id,
      standaloneStartMin: standalone.startMin,
      chainedStartMin: chained.startMin,
      blockEndMin: standalone.endMin,
      terminal: false,
    };
  });
}

/**
 * 환자의 마감 후보 목록 — 시각 순(같으면 표 순서, 다음 병원 일정 id 순).
 * @param {object} p
 * @param {import('../stay/compose.js').ConditionLimits} p.limits
 * @param {{endMin: number, endReason: 'DAY_END'|'DEPARTURE'}} p.frame
 * @param {Array} p.appointmentEvts  appointmentEvents 결과
 * @param {object} p.lodging  그날 숙소 (resolveReturnPlace 가 읽는 모양)
 * @param {Array} p.hospitals
 */
export function patientEvents({ limits, frame, appointmentEvts, lodging, hospitals }) {
  const lodgingPoint = pointOf(lodging);
  const events = [...appointmentEvts];
  for (const med of medicationDeadlines(limits.medication)) {
    const at = toMinutes(med.time);
    events.push({
      kind: 'MEDICATION',
      deadlineMin: at,
      place: 'LODGING',
      point: lodgingPoint,
      blockEndMin: at + DEFAULTS.medicationGapMin,
      terminal: false,
    });
  }
  if (limits.returnTime) {
    // docs/business-rules.md '숙소와 병원': 병원 복귀면 그 hospitalId 의 좌표. 찾을 수 없으면 추측하지 않고 RangeError
    const target = resolveReturnPlace(limits.returnTime, { lodging, hospitals });
    events.push({
      kind: 'RETURN_TIME',
      deadlineMin: toMinutes(limits.returnTime.time),
      place: target.place,
      point: { lat: target.lat, lng: target.lng },
      terminal: true,
    });
  }
  events.push({
    kind: frame.endReason,
    deadlineMin: frame.endMin,
    place: 'LODGING',
    point: lodgingPoint,
    terminal: true,
  });
  return events.sort(
    (a, b) =>
      a.deadlineMin - b.deadlineMin ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      String(a.appointmentId ?? '').localeCompare(String(b.appointmentId ?? '')),
  );
}

/**
 * 숙소로 돌아오는 창의 마감을 뒤따르는 병원 일정 블록 시작 앞으로 당긴다 (docs/business-rules.md '숙소와 병원'·'하루 일정 생성': 블록 안에는 외출이 없다).
 * 직전 외출이 병원에서 끝나지 않는 병원 일정의 블록은 '시작 − 숙소→병원 − 도착 여유'부터다. 그 시각이 이 창의
 * 마감보다 이르면(예: 15:00 병원 일정 앞의 14:55 숙소 복약·숙소 복귀 시각) 숙소 복귀 마감은 블록 시작이고,
 * 마감 이유는 APPOINTMENT 다. 복귀 장소는 숙소 그대로다.
 */
function capByAppointmentBlock(window, events) {
  let cap = null;
  for (const e of events) {
    if (e.kind !== 'APPOINTMENT' || e.deadlineMin < window.endMin) continue;
    if (e.standaloneStartMin < window.endMin && (!cap || e.standaloneStartMin < cap.standaloneStartMin)) cap = e;
  }
  if (!cap) return window;
  return {
    startMin: window.startMin,
    endMin: cap.standaloneStartMin,
    event: { ...window.event, kind: 'APPOINTMENT', deadlineMin: cap.standaloneStartMin, cappedByAppointmentId: cap.appointmentId },
  };
}

/**
 * 환자 외출 창. 앞 블록이 끝난 뒤부터 다음 마감 후보까지다. 끝나는 마감(RETURN_TIME·DAY_END·DEPARTURE) 뒤로는 없다.
 * 숙소로 돌아오는 창은 뒤따르는 병원 일정 블록 시작을 넘지 않는다(capByAppointmentBlock).
 * 창 길이가 0 이하인 구간은 넣지 않는다(45분 최소 창 판정은 엔진이 한다).
 * @returns {Array<{startMin: number, endMin: number, event: object}>}
 */
export function patientWindows(events, startMin) {
  const windows = [];
  let cursor = startMin;
  for (const event of events) {
    if (event.deadlineMin > cursor) {
      let window = { startMin: cursor, endMin: event.deadlineMin, event };
      if (event.place === 'LODGING') window = capByAppointmentBlock(window, events);
      if (window.endMin > window.startMin) windows.push(window);
    }
    if (event.terminal) break;
    cursor = Math.max(cursor, event.blockEndMin);
  }
  return windows;
}

/**
 * 구간 목록 [start, end) 에서 바쁜 구간들을 뺀 나머지 (시각 순).
 * @param {[number, number]} range
 * @param {Array<[number, number]>} busy
 */
export function freeIntervals([from, to], busy) {
  const sorted = busy.filter(([s, e]) => e > from && s < to).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const free = [];
  let cursor = from;
  for (const [s, e] of sorted) {
    if (s > cursor) free.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (cursor < to) free.push([cursor, to]);
  return free;
}
