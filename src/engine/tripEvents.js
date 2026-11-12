// 데모 사건 누적 (AX-307 · docs/platform/ITINERARY_RULES.md '데모 사건')
//
// 오늘 들어온 데모 사건은 기기에 누적 저장되고, 오늘을 재계획할 때마다 **모두 다시** 온다(docs/platform/ITINERARY_RULES.md '데모 사건').
// 그래서 사건의 효과는 이전 결과에 더하지 않고, 받은 목록 전체를 처음부터 접어 한 번에 정한다.
// 같은 목록이면 같은 효과다 — 다시 보내도 버퍼가 두 번 더해지지 않는다.
//
// | type           | 매개변수                               | 효과(오늘만)                                   |
// | CLOSURE        | closedIds: contentId[] (1–20)          | 해당 장소를 닫힘으로 본다                       |
// | WEATHER        | 없음                                   | 실외 부적합으로 본다                            |
// | TRAFFIC_SURGE  | extraMin 5–120, 누적 상한 120          | 모든 외출 복귀 계산에 추가 버퍼                  |
// | APPOINTMENT    | deltaMin ±240, 누적(매번 ±240 으로 자름) | 오늘 병원 일정을 그만큼 옮긴다                  |
// | PATIENT_RECALL | 없음                                   | 오늘 남은 일정 비움, returnNow, PATIENT_RECALLED |
// | RISK_SIGNAL    | 없음                                   | 오늘 남은 환자·보호자 외출 비움, NO_TOURISM       |
//
// 누적 방식: 사건마다 범위로 자르고, 누적값도 사건마다 상한으로 자른다. 순서가 같으면 결과가 같다
// (퇴역한 단일 외출 재계산 API 의 누적 규칙을 그대로 옮긴 것이다 — 그 API 는 AX-308 에서 지웠다).

import { fromMinutes, isClockTime, toMinutes } from '../stay/time.js';

export const DEMO_EVENT_TYPES = Object.freeze([
  'CLOSURE',
  'WEATHER',
  'TRAFFIC_SURGE',
  'APPOINTMENT',
  'PATIENT_RECALL',
  'RISK_SIGNAL',
]);

export const DEMO_EVENT_LIMITS = Object.freeze({
  closedIdsMax: 20,
  surgeMinPerEvent: 5,
  surgeMaxPerEvent: 120,
  surgeTotalMax: 120,
  appointmentAbsMax: 240,
});

const DAY_LAST_MIN = 24 * 60 - 1;

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

function finiteNumber(value, name) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new TypeError(`${name} 는 숫자여야 합니다`);
  return Math.round(n);
}

/**
 * @typedef {{type: 'CLOSURE', closedIds: string[]} | {type: 'WEATHER'} | {type: 'TRAFFIC_SURGE', extraMin: number}
 *   | {type: 'APPOINTMENT', deltaMin: number} | {type: 'PATIENT_RECALL'} | {type: 'RISK_SIGNAL'}} DemoEvent
 */

/**
 * @typedef {object} FoldedEvents  오늘 사건 목록 전체의 효과
 * @property {string[]} closedContentIds  닫힘으로 볼 contentId (정렬, 중복 없음)
 * @property {boolean} weatherUnsafe      실외 부적합
 * @property {number} extraBufferMin      복귀 계산 추가 버퍼(0–120)
 * @property {number} appointmentDeltaMin 오늘 병원 일정 이동(분, ±240)
 * @property {boolean} patientRecalled
 * @property {boolean} riskSignal
 */

/**
 * 오늘 사건 목록을 접는다. 모르는 유형이나 숫자가 아닌 매개변수는 조용히 넘기지 않고 TypeError.
 * (서버 경로가 먼저 검증한다 — 엔진은 잘못된 입력을 느슨하게 읽지 않는다.)
 * @param {DemoEvent[]} [events]
 * @returns {FoldedEvents}
 */
export function foldDemoEvents(events = []) {
  if (!Array.isArray(events)) throw new TypeError('events 는 배열이어야 합니다');
  const closed = new Set();
  let weatherUnsafe = false;
  let extraBufferMin = 0;
  let appointmentDeltaMin = 0;
  let patientRecalled = false;
  let riskSignal = false;

  for (const event of events) {
    switch (event?.type) {
      case 'CLOSURE': {
        const ids = Array.isArray(event.closedIds) ? event.closedIds : [];
        for (const id of ids.slice(0, DEMO_EVENT_LIMITS.closedIdsMax)) {
          if (id !== null && id !== undefined && String(id) !== '') closed.add(String(id));
        }
        break;
      }
      case 'WEATHER':
        weatherUnsafe = true;
        break;
      case 'TRAFFIC_SURGE': {
        const extra = clamp(
          finiteNumber(event.extraMin, 'TRAFFIC_SURGE.extraMin'),
          DEMO_EVENT_LIMITS.surgeMinPerEvent,
          DEMO_EVENT_LIMITS.surgeMaxPerEvent,
        );
        extraBufferMin = Math.min(extraBufferMin + extra, DEMO_EVENT_LIMITS.surgeTotalMax);
        break;
      }
      case 'APPOINTMENT': {
        const max = DEMO_EVENT_LIMITS.appointmentAbsMax;
        const delta = clamp(finiteNumber(event.deltaMin, 'APPOINTMENT.deltaMin'), -max, max);
        appointmentDeltaMin = clamp(appointmentDeltaMin + delta, -max, max);
        break;
      }
      case 'PATIENT_RECALL':
        patientRecalled = true;
        break;
      case 'RISK_SIGNAL':
        riskSignal = true;
        break;
      default:
        throw new TypeError(`지원하지 않는 데모 사건입니다: ${String(event?.type)}`);
    }
  }

  return {
    closedContentIds: [...closed].sort(),
    weatherUnsafe,
    extraBufferMin,
    appointmentDeltaMin,
    patientRecalled,
    riskSignal,
  };
}

function shiftOne(appointment, deltaMin) {
  const start = clamp(toMinutes(appointment.start) + deltaMin, 0, DAY_LAST_MIN);
  const shifted = { ...appointment, start: fromMinutes(start) };
  if (isClockTime(appointment.end)) {
    const end = Math.min(toMinutes(appointment.end) + deltaMin, DAY_LAST_MIN);
    // 하루 끝에 걸려 길이가 없어지면 종료를 비워 '예상 종료'(유형별 기본 길이)로 본다
    if (end > start) shifted.end = fromMinutes(end);
    else delete shifted.end;
  }
  return shifted;
}

/**
 * 날짜 D의 병원 일정을 deltaMin 만큼 옮긴 체류 사본 (APPOINTMENT 사건). 입력은 바꾸지 않는다.
 * 하루 밖으로 나가는 시각은 00:00–23:59 로 자른다. 날짜는 바뀌지 않으므로 수술 후 경계일도 그대로다.
 * @param {object} stay  Stay 또는 PlanStay
 * @param {string} date
 * @param {number} deltaMin
 */
export function shiftAppointmentsOnDate(stay, date, deltaMin) {
  if (!deltaMin) return stay;
  return {
    ...stay,
    appointments: (stay.appointments ?? []).map((a) =>
      a?.date === date && isClockTime(a.start) ? shiftOne(a, deltaMin) : a,
    ),
  };
}
