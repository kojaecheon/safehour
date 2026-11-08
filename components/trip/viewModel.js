// 오늘·일정·장소 화면의 표시 모델 (AX-317 · docs/business-rules.md, docs/platform/IA_AND_FLOWS.md)
//
// 저장된 DayPlan 을 화면이 그릴 모양으로 바꾸는 **순수 함수** 모음이다. 판정을 새로 만들지 않는다 —
// 엔진·동기화 모듈(lib/trip)이 만든 값을 고르고 늘어놓기만 한다. 테스트는 test/trip-view.test.js.
//
//   timelineEntries    하루 타임라인 항목 (블록·외출·정거장·식사 칸·복귀·휴식) — components/ui/DayTimeline 이 그린다
//   returnPlaceOf      타임라인·오늘 화면의 복귀 장소, returnTargetOf 에서 읽는다(시트와 같은 돌아갈 곳)
//   guardianTabInfo    보호자 탭 잠금 사유, 합성된 escortRequired / guardianMustStay 에서 읽는다 (docs/business-rules.md '하루 일정 생성')
//   deltaSummary       전후 비교 요약 줄 (docs/business-rules.md '전체 일정 확정과 변화 대응')
//   todayFocus         오늘 화면의 지금·다음 외출과 다음 정거장
//   tripDateRows       전체 일정 날짜 줄 · needsInputFix 입력 필요 날짜의 고칠 곳
//   introRequestFor    AI 소개 요청, 허용 목록(이름·유형·시각·관심사·강도)만 (docs/business-rules.md 'AI 소개 문장') · introCacheKey
//   placeDetailRequest 장소 상세 요청(Stop 형식, docs/contracts.md '`POST /api/place`') · findPlaceStop · stopBadges
//   canEditDay / stopEditable  편집 가능 여부 (docs/business-rules.md '사용자 편집')
//   returnTargetOf / overdueOutingOf  복귀 시트의 돌아갈 곳과 여유가 음수인 외출 (마감 지남 설계서 4.2·4.3)
//   returnNoteKeyOf    복귀 시트 맺음말 키, 숙소만 한국어 복귀 카드를 안내한다 (findings 11)
//   updateFailedBodyKey 일정 갱신 실패 안내 본문 키, 관광공사 실패 분류(upstream)에 따라 고른다 (docs/contracts.md 일정 502)
//   dayActionKey       상태 상자의 행동 줄, 사유별로 하나 (사용성 점검 2026-11-08 A1·A2) · outingDayNote 외출 있는 날 고정 줄(A3)
//   deadlineCopyOf     복귀 마감 이름·시각·이유 키, 하루 활동 종료(DAY_END)는 '오늘 활동 종료'로 나눈다 (A4)
//
// Next 밖(node --test)에서도 읽히도록 상대 경로만 쓴다. React·브라우저 API 를 쓰지 않는다.
// 문구 키는 화면에서 쓰는 키를 그대로 적는다(test/i18n.test.js 가 키 모양 문자열로 사용 여부를 확인한다).

import { effectiveRows } from '../conditions/summary.js';
import { safeStayDates } from '../../lib/trip/affected.js';
import { canonicalJson } from '../../lib/store/fingerprint.js';
import { declaredReturnHospitalId, returnHospitalOf } from '../../src/engine/returnTarget.js';
import { REASON, RETURN_NOW_CAUSES, STATE, isOverdueClampedDay } from '../../src/domain/states.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { appointmentsOnDate } from '../../src/stay/stay.js';
import { toMinutes } from '../../src/stay/time.js';

/** 외출 마감 이유 → 문구 키 (docs/business-rules.md '하루 일정 생성'의 마감 후보 표). 복귀 안내라 안전 문구다 */
export const DEADLINE_REASON_KEY = Object.freeze({
  RETURN_TIME: 'trip.deadlineRETURN_TIME',
  MEDICATION: 'trip.deadlineMEDICATION',
  APPOINTMENT: 'trip.deadlineAPPOINTMENT',
  DAY_END: 'trip.deadlineDAY_END',
  DEPARTURE: 'trip.deadlineDEPARTURE',
  PATIENT_SCHEDULE: 'trip.deadlinePATIENT_SCHEDULE',
});

/**
 * 상태 상자의 사유별 행동 줄 (사용성 점검 2026-11-08 A1·A2 · docs/business-rules.md '날짜 분류'·'오늘 게이트 덧씌우기').
 * 병원과 무관한 사유(시각·입력 누락·확인 대기)에 '병원 연락'·'병원 인근 대기'를 쓰지 않으려고 고른다.
 * 판정을 새로 만들지 않는다. 엔진이 적은 상태·사유를 읽어 문구만 고른다.
 */
export const DAY_ACTION_KEY = Object.freeze({
  TIME_SHORT: 'common.actionTimeShort',
  TIME_SHORT_DAY: 'common.actionTimeShortDay',
  TRAVEL_DAY: 'common.actionTravelDay',
  NO_CANDIDATE: 'common.actionNoCandidate',
  NEEDS_INPUT: 'common.actionNeedsInput',
  NEEDS_INPUT_OTHER: 'common.actionNeedsInputOther',
  DAILY_CHECK: 'common.actionDailyCheck',
  DAILY_CHECK_ELSEWHERE: 'common.actionDailyCheckElsewhere',
  HOSPITAL_GUIDE: 'common.actionHospitalGuide',
});

/**
 * 이 사유가 하나라도 있으면 상태 기본 행동 줄(src/domain/states.js STATE_MESSAGE 의 action, 예: '병원 연락 또는 숙소 대기')을 그대로 둔다.
 * 병원 지침 사유(외출 제한·상충·복귀 요청·지침 철회·만료·외출 늦음)와, 병원 안내를 먼저 따르라는 사유(주의 상태·서비스 중단·동행 필요)다.
 */
const HOSPITAL_ACTION_REASONS = Object.freeze([
  ...RETURN_NOW_CAUSES,
  REASON.OUTING_FORBIDDEN,
  REASON.CONFLICTING_CONDITION,
  REASON.RISK_SIGNAL,
  REASON.SERVICE_PAUSED,
  REASON.ESCORT_REQUIRED,
]);

/** 입력 필요(NEEDS_INPUT) 사유 중 조건 입력이 아닌 것: 숙소 없음, 병원 지침 만료 */
const NEEDS_OTHER_INPUT = Object.freeze([REASON.LODGING_REQUIRED, REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED]);

/**
 * 상태 상자에 보일 행동 줄 키. null 이면 상태 기본 행동 줄을 쓴다.
 *
 *   병원 지침 사유가 있거나 즉시 복귀 중          → null (기본 줄, NO_TOURISM 이면 '병원 연락 또는 숙소 대기')
 *   NO_TOURISM + 입력 필요(coverage NEEDS_INPUT)   → 조건 입력 줄 (숙소 없음·지침 만료는 입력 줄)
 *   NO_TOURISM + 입국·출국 창 밖(OUTSIDE_STAY_WINDOW) → 이동 날 줄
 *   NO_TOURISM + 시간 부족(DEPARTURE_WINDOW_TOO_SHORT · SLA_INSUFFICIENT) → 오늘이면 '오늘은', 다른 날이면 '이날은' 시간 부족 줄
 *   STANDBY + 오늘 + 확인하지 않은 병원 중요 안내   → 병원 안내 확인 줄 (매일 확인보다 먼저: 바뀐 안내를 읽기 전에 '그대로예요'를 누르면 안 된다)
 *   STANDBY + 오늘 + 매일 확인 대기                 → 매일 확인 줄 (오늘 화면은 '위의 확인 항목', 하루 일정 화면은 '오늘 화면에서')
 *   STANDBY + 후보 없음(NO_CANDIDATE)               → 장소를 아직 찾지 못했다는 줄
 *
 * NO_TOURISM 날에 덧씌운 확인 대기는 고르지 않는다. 확인해도 외출이 열리지 않기 때문이다.
 *
 * @param {object|null} day  표시용 DayPlan (오늘이면 게이트를 덧씌운 값)
 * @param {{ isToday?: boolean, screen?: 'today'|'day' }} [options]
 * @returns {string|null}
 */
export function dayActionKey(day, { isToday = false, screen = 'today' } = {}) {
  if (!isObject(day)) return null;
  const reasons = list(day.reasons);
  if (day.returnNow === true || reasons.some((r) => HOSPITAL_ACTION_REASONS.includes(r))) return null;
  if (day.dayState === STATE.NO_TOURISM) {
    if (day.coverage === 'NEEDS_INPUT') {
      return reasons.some((r) => NEEDS_OTHER_INPUT.includes(r)) ? DAY_ACTION_KEY.NEEDS_INPUT_OTHER : DAY_ACTION_KEY.NEEDS_INPUT;
    }
    if (reasons.includes(REASON.OUTSIDE_STAY_WINDOW)) return DAY_ACTION_KEY.TRAVEL_DAY;
    if (reasons.includes(REASON.DEPARTURE_WINDOW_TOO_SHORT) || reasons.includes(REASON.SLA_INSUFFICIENT)) {
      return isToday ? DAY_ACTION_KEY.TIME_SHORT : DAY_ACTION_KEY.TIME_SHORT_DAY;
    }
    return null;
  }
  if (day.dayState !== STATE.STANDBY) return null;
  if (isToday && reasons.includes(REASON.PLAN_UNCONFIRMED_UPDATE)) return DAY_ACTION_KEY.HOSPITAL_GUIDE;
  if (isToday && reasons.includes(REASON.DAILY_CHECK_PENDING)) {
    return screen === 'day' ? DAY_ACTION_KEY.DAILY_CHECK_ELSEWHERE : DAY_ACTION_KEY.DAILY_CHECK;
  }
  if (reasons.includes(REASON.NO_CANDIDATE)) return DAY_ACTION_KEY.NO_CANDIDATE;
  return null;
}

/**
 * 외출이 있는 날인가. 상태 상자 아래 고정 줄 'common.outingDayNote'를 보일지 정한다 (사용성 점검 A3).
 * 환자 외출이나 보호자 외출이 하나라도 있으면 참이다. 단, 즉시 복귀 중이거나 NO_TOURISM 인 날은 거짓이다:
 * 즉시 복귀(외출 늦음 포함)는 시작된 외출·정거장 0개 외출을 남기지만 '짠 일정'을 안내할 날이 아니다.
 */
export function outingDayNote(day) {
  if (!isObject(day) || day.returnNow === true || day.dayState === STATE.NO_TOURISM) return false;
  return outingsOf(day, 'P').length + outingsOf(day, 'G').length > 0;
}

/**
 * 복귀 마감의 이름·시각·이유 키 (사용성 점검 A4, 이름만 나눈다. 마감 지남 시트가 뜨는 때는 그대로다).
 * 마감 이유가 하루 활동 종료(DAY_END)면 병원이 정한 마감이 아니므로 '오늘 활동 종료'(오늘이 아니면 '활동 종료')로 부르고,
 * 같은 말을 되풀이하는 이유 줄('하루 활동 종료 기준')은 뺀다. 그 밖의 마감은 '복귀 마감'과 이유 줄을 그대로 쓴다.
 * @param {object|null} outing  외출 또는 타임라인 복귀 항목 ({ deadlineReason })
 * @param {{ isToday?: boolean }} [options]
 * @returns {{ dayEnd: boolean, labelKey: string, timeKey: string, reasonKey: string|null }}
 */
export function deadlineCopyOf(outing, { isToday = false } = {}) {
  const reason = outing?.deadlineReason ?? null;
  if (reason === 'DAY_END') {
    return {
      dayEnd: true,
      labelKey: isToday ? 'common.tlDayEndToday' : 'common.tlDayEnd',
      timeKey: isToday ? 'return.dayEnd' : 'trip.dayEndAt',
      reasonKey: null,
    };
  }
  return { dayEnd: false, labelKey: 'common.tlReturn', timeKey: 'return.deadline', reasonKey: DEADLINE_REASON_KEY[reason] ?? null };
}

/** 데모 사건 6종, 패널 순서 (docs/platform/ITINERARY_RULES.md '데모 사건') */
export const DEMO_EVENT_TYPES = Object.freeze(['CLOSURE', 'WEATHER', 'TRAFFIC_SURGE', 'APPOINTMENT', 'PATIENT_RECALL', 'RISK_SIGNAL']);

/** 데모 사건 매개변수, 시연용 고정값 (docs/platform/ITINERARY_RULES.md '데모 사건' 표의 범위 안) */
const DEMO_TRAFFIC_EXTRA_MIN = 20;
const DEMO_APPOINTMENT_DELTA_MIN = -60;

const LABEL_BADGE = Object.freeze({ ESTIMATED: 'estimate', HOURS_UNCONFIRMED: 'hoursUnconfirmed' });
const SOURCE_ID_KEYS = Object.freeze(['ko', 'en', 'ja', 'zh', 'barrierFree']);
const CONTENT_TYPE_KEYS = Object.freeze(['canonical', 'ko', 'en', 'ja', 'zh']);
const FREE_COVERAGE = Object.freeze(['FREE', 'DECLARED_FREE']);

/** 같은 시각이면: 복귀 → 블록 → 출발 → 정거장·식사 칸 → 휴식 */
const RANK = Object.freeze({ return: 0, appointment: 1, medication: 1, depart: 2, stop: 3, meal: 3, rest: 4 });

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function minutesOf(hhmm) {
  try {
    return toMinutes(hhmm);
  } catch {
    return Number.NaN;
  }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function outingsOf(day, role) {
  return list(role === 'G' ? day?.guardianOutings : day?.outings).filter(isObject);
}

function byDepart(a, b) {
  return minutesOf(a.departAt) - minutesOf(b.departAt) || String(a.id).localeCompare(String(b.id));
}

function stopsIn(outing) {
  return list(outing?.stops).filter(isObject);
}

/** 그날 숙소 `{ name, address }` — 없으면 null */
export function lodgingOf(day, stay) {
  const lodging = list(stay?.lodgings).find((l) => l?.id === day?.lodgingId);
  if (!lodging) return null;
  return { name: lodging.name ?? null, address: lodging.address?.roadAddress ?? null };
}

function hospitalName(stay, hospitalId) {
  return list(stay?.hospitals).find((h) => h?.id === hospitalId)?.name ?? null;
}

function appointmentHospitalId(stay, appointmentId) {
  return list(stay?.appointments).find((a) => a?.id === appointmentId)?.hospitalId ?? null;
}

/**
 * 타임라인·오늘 화면의 복귀 장소 `{ kind: 'LODGING'|'HOSPITAL', name }`.
 * 돌아갈 곳은 복귀 시트와 같은 한 규칙(returnTargetOf: 엔진의 적힌 hospitalId 규칙과 한 병원 대비책)에서 읽는다.
 * 같은 외출을 타임라인과 시트가 다른 병원으로 보이지 않게 하려는 것이다.
 * 모양은 그대로다: 시트가 '정해 둔 장소'(PLANNED)로 보이는 병원 외출은 여기서 이름 없는 병원(name null)이다.
 * 저장된 외출의 returnPlace 가 병원이라는 것은 사실이라 화면은 일반 라벨('병원')을 쓰고, 병원 이름은 추측하지 않는다.
 * 이름을 모르면 name 은 null, 화면은 일반 라벨('숙소'·'병원')을 쓴다.
 * @param {object|null} outing
 * @param {object|null} day
 * @param {object|null} stay
 * @returns {{ kind: 'LODGING'|'HOSPITAL', name: string|null }}
 */
export function returnPlaceOf(outing, day, stay) {
  const target = returnTargetOf({ day, stay, outing });
  if (target.kind === 'LODGING') return { kind: 'LODGING', name: target.name };
  return { kind: 'HOSPITAL', name: target.kind === 'HOSPITAL' ? target.name : null };
}

/** 그날 병원 일정이 모두 한 병원이면 그 병원, 아니면 null (둘 중에서 고르지 않는다) */
function soleHospitalOfDay(day, stay) {
  const ids = new Set(list(stay?.appointments).filter((a) => a?.date === day?.date).map((a) => a?.hospitalId));
  if (ids.size !== 1) return null;
  const [id] = ids;
  if (typeof id !== 'string' || id === '') return null;
  return list(stay?.hospitals).find((h) => h?.id === id) ?? null;
}

/**
 * 복귀 시트의 돌아갈 곳 `{ kind: 'LODGING'|'HOSPITAL'|'PLANNED', name, address }` (마감 지남 설계서 4.2·4.3).
 * 외출이 없거나 숙소 외출이면 그날 숙소(못 찾으면 name·address 가 null 인 LODGING). 병원 외출이면
 * returnHospitalOf(엔진과 같은 규칙, hospitalId 로만)로 찾은 병원 이름·도로명주소다.
 * 경우 2 에서는 엔진이 마감을 지금으로 당겨(overdueSafe) 그 시각에 시작하는 병원 일정이 없을 수 있다. 그렇게
 * 적힌 hospitalId 가 하나도 없고 마감 이유가 병원 일정(deadlineReason 'APPOINTMENT')일 때만 그날 병원 일정이 모두 한 병원이면 그 병원을 쓴다. 그 밖에는 PLANNED('정해 둔 장소')이고 추측하지 않는다.
 * 저장된 외출의 returnPlace 를 그대로 따른다. 장소를 다시 판정하지 않는다.
 * 타임라인(returnPlaceOf)도 이 함수에서 읽는다. 돌아갈 곳을 찾는 규칙은 여기 하나다.
 * @param {{ day: object|null, stay: object|null, outing?: object|null }} args
 */
export function returnTargetOf({ day, stay, outing = null }) {
  if (outing?.returnPlace !== 'HOSPITAL') {
    const lodging = lodgingOf(day, stay);
    return { kind: 'LODGING', name: lodging?.name ?? null, address: lodging?.address ?? null };
  }
  if (!isObject(stay) || !isObject(day)) return { kind: 'PLANNED', name: null, address: null };
  // 적힌 hospitalId 가 있으면 그 병원만 본다(목록에 없으면 PLANNED). 대비책은 아무것도 적히지 않았을 때만 쓴다
  // 대비책은 병원 일정 때문에 당긴 마감(deadlineReason 'APPOINTMENT')일 때만 쓴다
  let hospital = null;
  if (declaredReturnHospitalId(outing, { stay, day }) !== null) hospital = returnHospitalOf(outing, { stay, day });
  else if (outing.deadlineReason === 'APPOINTMENT') hospital = soleHospitalOfDay(day, stay);
  if (!hospital) return { kind: 'PLANNED', name: null, address: null };
  return { kind: 'HOSPITAL', name: hospital.name ?? null, address: hospital.address?.roadAddress ?? null };
}

/**
 * 복귀 시트 맺음말 문구 키. 한국어 복귀 카드(/cards)는 숙소 카드라 숙소일 때만 'return.note'(카드 안내)이고,
 * 병원·정해 둔 장소는 카드를 말하지 않는 'return.notePlace'(위의 장소 정보를 보여 주라는 안내와 119)다.
 * @param {{ kind: 'LODGING'|'HOSPITAL'|'PLANNED' }|null} place  returnTargetOf 의 결과
 * @returns {'return.note'|'return.notePlace'}
 */
export function returnNoteKeyOf(place) {
  return place?.kind === 'LODGING' ? 'return.note' : 'return.notePlace';
}

/**
 * 외출의 예상 귀가(plannedReturnAt). 정거장이 0개인 외출은 null 이다: 이동 중(첫 정거장 도착 전)에 남은 정거장을
 * 비운 외출이라(엔진 dayRepair.js) 엔진의 예상 귀가는 숙소 기준 계산값이고 지금보다 이를 수 있다. 그때는 복귀 마감만 보인다.
 * @returns {string|null}
 */
export function plannedReturnOf(outing) {
  if (stopsIn(outing).length === 0) return null;
  return typeof outing?.plannedReturnAt === 'string' && outing.plannedReturnAt ? outing.plannedReturnAt : null;
}

/** 저장된 하루에서 여유(slackMin)가 음수인 첫 환자 외출, 즉시 복귀 원인 OUTING_OVERDUE 의 외출. 없으면 null */
export function overdueOutingOf(day) {
  return outingsOf(day, 'P').find((o) => typeof o.slackMin === 'number' && o.slackMin < 0) ?? null;
}

/**
 * 하루 타임라인 항목 (docs/business-rules.md '하루 일정 생성').
 *
 *   블록        { kind: 'appointment'|'medication', time: start, endTime: end, place? }       — 환자 탭만
 *   외출        depart → stop / meal(식사 칸을 채운 식당) … → return
 *   복귀        { kind: 'return', time: 예상 귀가(plannedReturnAt), endTime: 복귀 마감(returnBy), deadlineReason, place }
 *               정렬도 예상 귀가로 한다 — 복귀 마감이 모두 활동 종료(21:00)인 두 외출이 섞이지 않게
 *   식사 칸     채우지 못한 칸(NONE_AVAILABLE · CLEARED · 사유가 있는 NOT_APPLICABLE)은 칸 시간에 사유와 함께 따로 선다 — 환자 탭만
 *   휴식        환자 외출이 없는 날은 활동 시간 전체 { kind: 'rest' }
 *
 * @param {object|null} day  DayPlan (오늘이면 게이트를 덧씌운 표시용 — 외출의 actionable=false 가 항목에 실린다)
 * @param {{ role?: 'P'|'G', stay?: object|null }} [options]
 * @returns {Array<object>}
 */
export function timelineEntries(day, { role = 'P', stay = null } = {}) {
  if (!isObject(day)) return [];
  const entries = [];
  const push = (entry) => entries.push({ ...entry, sortMin: minutesOf(entry.time), seq: entries.length });

  if (role === 'P') {
    list(day.blocks).forEach((block, i) => {
      if (!isObject(block) || (block.kind !== 'APPOINTMENT' && block.kind !== 'MEDICATION')) return;
      const appointment = block.kind === 'APPOINTMENT';
      const hospitalId = appointment ? appointmentHospitalId(stay, block.appointmentId) : null;
      push({
        id: `block:${i}:${block.start}`,
        kind: appointment ? 'appointment' : 'medication',
        time: block.start,
        endTime: block.end,
        ...(appointment ? { appointmentId: block.appointmentId ?? null, place: { kind: 'HOSPITAL', name: hospitalName(stay, hospitalId) } } : {}),
      });
    });
  }

  const mealByStop = new Map(list(day.mealSlots).filter((m) => m?.status === 'FILLED' && m.stopId).map((m) => [m.stopId, m]));
  const shownMealStops = new Set();
  const outings = [...outingsOf(day, role)].sort(byDepart);
  for (const outing of outings) {
    const actionable = outing.actionable !== false;
    push({ id: `${outing.id}:depart`, kind: 'depart', time: outing.departAt, outingId: outing.id, place: { kind: 'LODGING', name: lodgingOf(day, stay)?.name ?? null } });
    for (const stop of stopsIn(outing)) {
      const meal = stop.isMeal ? mealByStop.get(stop.id) : null;
      if (meal) shownMealStops.add(stop.id);
      push({
        id: stop.id,
        kind: stop.isMeal ? 'meal' : 'stop',
        time: stop.arriveAt,
        endTime: stop.leaveAt,
        outingId: outing.id,
        stop,
        leg: stop.legIn ?? null,
        actionable,
        ...(stop.isMeal ? { slot: meal?.slot ?? null, status: 'FILLED', reasons: meal?.reasons ?? [] } : {}),
      });
    }
    const planned = plannedReturnOf(outing);
    const entry = {
      id: `${outing.id}:return`,
      kind: 'return',
      time: planned ?? outing.returnBy,
      outingId: outing.id,
      returnBy: outing.returnBy,
      plannedReturnAt: planned,
      deadlineReason: outing.deadlineReason ?? null,
      place: returnPlaceOf(outing, day, stay),
      actionable,
    };
    if (planned && planned !== outing.returnBy) entry.endTime = outing.returnBy;
    push(entry);
  }

  if (role === 'P') {
    for (const meal of list(day.mealSlots)) {
      if (!isObject(meal) || !DEFAULTS.mealSlots[meal.slot]) continue;
      if (meal.status === 'FILLED' && shownMealStops.has(meal.stopId)) continue;
      if (meal.status === 'FILLED') continue; // 채웠다는데 정거장이 없다 — 지어내지 않는다
      // 사유 없는 '해당 없음'은 그 시간에 외출이 없다는 뜻일 뿐이다 — 칸을 세우지 않는다
      if (meal.status === 'NOT_APPLICABLE' && list(meal.reasons).length === 0) continue;
      const slot = DEFAULTS.mealSlots[meal.slot];
      push({ id: `meal:${meal.slot}`, kind: 'meal', time: slot.start, endTime: slot.end, slot: meal.slot, status: meal.status, reasons: list(meal.reasons) });
    }
    if (outings.length === 0 && isObject(day.window) && day.window.start && day.window.end) {
      push({ id: 'rest', kind: 'rest', time: day.window.start, endTime: day.window.end });
    }
  }

  return entries
    .sort((a, b) => a.sortMin - b.sortMin || RANK[a.kind] - RANK[b.kind] || a.seq - b.seq)
    .map(({ sortMin, seq, ...entry }) => {
      void sortMin;
      void seq;
      return entry;
    });
}

function isYes(entry) {
  const value = entry?.value;
  if (value === true) return true;
  return value?.kind === 'SET' && value.value !== false;
}

function provenanceInfo(entry) {
  const provenance = list(entry?.provenance);
  return {
    sources: ['HOSPITAL', 'SELF'].filter((source) => provenance.some((p) => p?.source === source)),
    defaulted: provenance.some((p) => p?.defaulted === true),
  };
}

/**
 * 보호자 탭 안내 (docs/business-rules.md '하루 일정 생성'의 보호자 단독 외출, '보호자').
 * @returns {{ locked: boolean, reason: null|'NO_COMPANION'|'NEEDS_INPUT'|'ESCORT_REQUIRED'|'GUARDIAN_MUST_STAY'|'WITH_PATIENT'|'NO_OUTING',
 *             sources: Array<'HOSPITAL'|'SELF'>, defaulted: boolean }}
 *   locked 이면 잠금 표시와 함께 사유를 보여준다(동행 필수·곁 지키기). 출처는 합성 값의 출처다.
 */
export function guardianTabInfo(day, stay) {
  const none = { sources: [], defaulted: false };
  if (outingsOf(day, 'G').length > 0) return { locked: false, reason: null, ...none };
  if (stay && stay.hasCompanion !== true) return { locked: false, reason: 'NO_COMPANION', ...none };
  if (!isObject(day)) return { locked: false, reason: 'NO_OUTING', ...none };
  if (day.coverage === 'NEEDS_INPUT') return { locked: false, reason: 'NEEDS_INPUT', ...none };
  const effective = isObject(day.effective) ? day.effective : {};
  if (isYes(effective.escortRequired)) return { locked: true, reason: 'ESCORT_REQUIRED', ...provenanceInfo(effective.escortRequired) };
  if (isYes(effective.guardianMustStay)) return { locked: true, reason: 'GUARDIAN_MUST_STAY', ...provenanceInfo(effective.guardianMustStay) };
  if (FREE_COVERAGE.includes(day.coverage)) return { locked: false, reason: 'WITH_PATIENT', ...none };
  return { locked: false, reason: 'NO_OUTING', ...none };
}

function allStops(day) {
  return [...outingsOf(day, 'P'), ...outingsOf(day, 'G')].flatMap(stopsIn);
}

/** 정거장 id `${date}:${role}:${contentId}` 의 역할·contentId */
function parseStopId(stopId) {
  const parts = String(stopId ?? '').split(':');
  return { role: parts[1] === 'G' ? 'G' : 'P', contentId: parts[parts.length - 1] ?? '' };
}

/**
 * 전후 비교 요약 (docs/business-rules.md '전체 일정 확정과 변화 대응').
 * 장소 이름은 지금 일정의 정거장 → 제외 목록(빠진 곳의 제외 사유) 순으로 찾는다. 못 찾으면 null(지어내지 않는다).
 * @returns {null | { visible: boolean, unseen: boolean, state: {before, after}|null, reasons: string[], rows: object[] }}
 */
export function deltaSummary(day) {
  const delta = day?.delta;
  if (!isObject(delta)) return null;
  const stops = new Map(allStops(day).map((s) => [s.id, s]));
  const excluded = new Map(list(day.excluded).map((e) => [String(e?.candidateId), e]));
  const deadlineReasons = new Map([...outingsOf(day, 'P'), ...outingsOf(day, 'G')].map((o) => [o.id, o.deadlineReason ?? null]));
  const place = (stopId) => {
    const { role, contentId } = parseStopId(stopId);
    const stop = stops.get(stopId);
    const gone = excluded.get(contentId);
    return { id: stopId, role, title: stop?.title ?? gone?.title ?? null, reasons: stop ? [] : list(gone?.reasons) };
  };
  const rows = [
    ...list(delta.replaced).map((r) => ({ kind: 'replaced', from: place(r?.from), to: place(r?.to) })),
    ...list(delta.removed).map((id) => ({ kind: 'removed', ...place(id) })),
    ...list(delta.added).map((id) => ({ kind: 'added', ...place(id) })),
    ...list(delta.shortened).map((id) => ({ kind: 'shortened', ...place(id), stayMin: stops.get(id)?.stayMin ?? null })),
    ...list(delta.cancelledOutings).map((outingId) => ({ kind: 'cancelled', outingId, role: parseStopId(outingId).role })),
    ...list(delta.newDeadlines).map((d) => ({
      kind: 'deadline',
      outingId: d?.outingId,
      returnBy: d?.returnBy,
      // 마감 이름(하루 활동 종료면 '오늘 활동 종료')을 고르려고 지금 일정의 그 외출에서 이유를 읽는다
      deadlineReason: deadlineReasons.get(d?.outingId) ?? null,
      role: parseStopId(d?.outingId).role,
    })),
  ];
  const visible = delta.hasVisibleChange === true;
  return {
    visible,
    unseen: visible && delta.seen !== true,
    state: delta.stateChanged ? { before: delta.before ?? null, after: delta.after ?? null } : null,
    reasons: list(delta.reasons),
    rows,
  };
}

/** 지금 이후(진행 중 포함) 가장 가까운 병원 일정 블록 — 없으면 null */
export function nextAppointmentBlock(day, nowMin) {
  return (
    list(day?.blocks)
      .filter((b) => b?.kind === 'APPOINTMENT' && minutesOf(b.end) > nowMin)
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))[0] ?? null
  );
}

/**
 * 오늘 화면의 초점 — 지금 외출 중(OUT)이면 그 외출, 아니면 다음 외출(NEXT), 다 끝났으면 DONE.
 * 정거장은 아직 떠나지 않은 첫 곳(머무는 중 포함). 환자 외출이 없으면 null.
 * 외출 중 재계획으로 즉시 복귀가 켜진 날(returnNow 이고 사유에 OUTING_OVERDUE)에 여유가 음수인 외출이 이미 출발했으면,
 * 시각과 상관없이 그 외출이 OUT 이다. 밖에 있는 사람에게 '외출을 모두 마쳤어요'를 보이지 않는다.
 * @param {object|null} day  오늘 표시용 DayPlan
 * @param {number} nowMin  KST 자정부터의 분
 */
export function todayFocus(day, nowMin) {
  const outings = [...outingsOf(day, 'P')].sort(byDepart);
  if (outings.length === 0) return null;
  const nextAppointment = nextAppointmentBlock(day, nowMin);
  const endOf = (o) => minutesOf(plannedReturnOf(o) || o.returnBy);
  // 마감을 지금으로 당긴 날(OUTING_OVERDUE)만 붙잡는다. 다른 즉시 복귀 원인의 날에 끝난 여유 음수 외출을 OUT 으로 두지 않는다
  const overdue = isOverdueClampedDay(day) ? overdueOutingOf(day) : null;
  const held = overdue && minutesOf(overdue.departAt) <= nowMin ? overdue : null;
  const current = held ?? outings.find((o) => minutesOf(o.departAt) <= nowMin && nowMin < endOf(o));
  if (current) {
    const stop = stopsIn(current).find((s) => minutesOf(s.leaveAt) > nowMin) ?? null;
    return { phase: 'OUT', outing: current, stop, nextAppointment };
  }
  const next = outings.find((o) => minutesOf(o.departAt) > nowMin);
  if (next) return { phase: 'NEXT', outing: next, stop: stopsIn(next)[0] ?? null, nextAppointment };
  return { phase: 'DONE', outing: null, stop: null, nextAppointment };
}

/**
 * 입력 필요 날짜를 고칠 곳 (docs/business-rules.md '날짜 분류'의 NEEDS_INPUT 사유).
 * @returns {null | { href: string, key: string }}
 */
export function needsInputFix(day) {
  if (day?.coverage !== 'NEEDS_INPUT') return null;
  const reasons = list(day.reasons);
  if (reasons.includes('LODGING_REQUIRED')) {
    return { href: `/onboarding?edit=1&returnTo=${encodeURIComponent('/trip')}`, key: 'trip.fixLodging' };
  }
  if (reasons.includes('SENSITIVE_CONSENT_REQUIRED')) return { href: '/conditions', key: 'trip.fixConsent' };
  if (reasons.includes('HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED')) return { href: '/conditions', key: 'trip.fixExpired' };
  return { href: '/conditions', key: 'trip.fixConditions' };
}

/**
 * 전체 일정 날짜 줄 — 체류 날짜마다 하나.
 * @param {{ stay: object|null, days: Record<string, object|null>, today: string|null }} args
 *   days 는 표시용 하루(오늘은 게이트를 덧씌운 값)
 */
export function tripDateRows({ stay, days, today }) {
  return safeStayDates(stay).map((date) => {
    const day = isObject(days?.[date]) ? days[date] : null;
    const summary = deltaSummary(day);
    let hasAppointment = list(day?.blocks).some((b) => b?.kind === 'APPOINTMENT');
    try {
      hasAppointment = hasAppointment || appointmentsOnDate(stay, date).length > 0;
    } catch {
      // 형식이 깨진 일정은 표시만 건너뛴다
    }
    return {
      date,
      day,
      state: day?.dayState ?? null,
      coverage: day?.coverage ?? null,
      reasons: list(day?.reasons),
      isToday: date === today,
      isPast: Boolean(today) && date < today,
      hasAppointment,
      changed: summary?.unseen === true,
      stopCount: outingsOf(day, 'P').flatMap(stopsIn).length,
      guardianStopCount: outingsOf(day, 'G').flatMap(stopsIn).length,
      returnNow: day?.returnNow === true,
      fix: needsInputFix(day),
    };
  });
}

/**
 * AI 소개 요청 본문 (docs/business-rules.md 'AI 소개 문장', docs/contracts.md '`POST /api/itinerary/intro`').
 * 담는 것: 언어, 그날 환자 정거장의 공개 이름·유형·도착 시각, 관심사, 이동 강도. 그 밖(조건·병원·숙소·날짜·주소·좌표)은 없다.
 * @returns {null | { lang, stops: Array<{title, category, arriveAt}>, interests: string[], pace: string|null }}
 */
export function introRequestFor(day, stay, lang) {
  const stops = outingsOf(day, 'P')
    .flatMap(stopsIn)
    .filter((s) => typeof s.title === 'string' && s.title.trim() !== '')
    .sort((a, b) => minutesOf(a.arriveAt) - minutesOf(b.arriveAt))
    .map((s) => ({ title: s.title, category: s.category ?? null, arriveAt: s.arriveAt ?? null }));
  if (stops.length === 0) return null;
  return {
    lang,
    stops,
    interests: list(stay?.interests).filter((tag) => typeof tag === 'string'),
    pace: typeof stay?.pace === 'string' ? stay.pace : null,
  };
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 33) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** AI 소개 캐시 키 — 같은 요청이면 같은 키 (기기 저장소 키 형식: 영숫자·_:.-, 256자 이하) */
export function introCacheKey(request) {
  const text = canonicalJson(request ?? null);
  const lang = typeof request?.lang === 'string' && /^[a-z]{2}$/.test(request.lang) ? request.lang : 'xx';
  return `intro:v1:${lang}:${fnv1a(text)}${djb2(text)}`;
}

/**
 * 장소 상세 요청 (docs/contracts.md '`POST /api/place`', Stop 과 같은 형식)
 * @returns {{ lang, contentId: string, sourceIds: object, contentTypeIds: object }}
 */
export function placeDetailRequest(stop, lang) {
  const pick = (source, keys) =>
    Object.fromEntries(keys.filter((k) => source?.[k] !== undefined && source[k] !== null && source[k] !== '').map((k) => [k, String(source[k])]));
  return {
    lang,
    contentId: String(stop?.contentId ?? ''),
    sourceIds: pick(stop?.sourceIds, SOURCE_ID_KEYS),
    contentTypeIds: pick(stop?.contentTypeIds, CONTENT_TYPE_KEYS),
  };
}

/**
 * 저장된 일정에서 장소 상세의 정거장을 찾는다.
 * 정거장 id 가 맞으면 그것, 아니면 candidateId 가 같은 정거장 중 날짜 힌트 → 날짜 순 첫 곳.
 * @returns {null | { date: string, day: object, outing: object, role: 'P'|'G', stop: object }}
 */
export function findPlaceStop(tripPlan, candidateId, { stopId = null, date = null } = {}) {
  const days = isObject(tripPlan?.days) ? tripPlan.days : {};
  const matches = [];
  for (const d of Object.keys(days).sort()) {
    const day = days[d];
    for (const role of ['P', 'G']) {
      for (const outing of outingsOf(day, role)) {
        for (const stop of stopsIn(outing)) {
          if (String(stop.candidateId) !== String(candidateId)) continue;
          const found = { date: d, day, outing, role, stop };
          if (stopId && stop.id === stopId) return found;
          matches.push(found);
        }
      }
    }
  }
  return matches.find((m) => m.date === date) ?? matches[0] ?? null;
}

/**
 * 정거장 라벨 → 표시 (docs/business-rules.md '장소 후보와 필터').
 * 배지 5종 중 '추정'·'운영 확인 필요'는 Badge 로, 번역 필요·식이 추정·주문 카드는 화면이 따로 그린다.
 */
export function stopBadges(stop) {
  const labels = list(stop?.labels);
  return {
    badges: labels.map((l) => LABEL_BADGE[l]).filter(Boolean),
    needsTranslation: labels.includes('NEEDS_TRANSLATION'),
    dietEstimated: labels.includes('DIET_ESTIMATED'),
    orderCard: labels.includes('ORDER_CARD'),
  };
}

/**
 * 하루 편집(교체·삭제·비움·다시 만들기)을 할 수 있는가 (docs/business-rules.md '사용자 편집', docs/platform/IA_AND_FLOWS.md '보기 전용 상태').
 * 순서: 보기 전용 → 지난 날짜 → 일정 없음·입력 필요 → 매일 확인 전인 오늘.
 */
export function canEditDay({ date, today, readOnly, dailyCheckPending, day }) {
  if (readOnly) return { allowed: false, reasonKey: 'trip.editReadOnly' };
  if (today && date < today) return { allowed: false, reasonKey: 'trip.editPast' };
  if (!isObject(day) || day.coverage === 'NEEDS_INPUT') return { allowed: false, reasonKey: 'trip.editNoPlan' };
  if (date === today && dailyCheckPending) return { allowed: false, reasonKey: 'trip.editGated' };
  return { allowed: true, reasonKey: null };
}

/** 편집 동작 실패 코드(lib/trip TRIP_ERROR) → 문구 키 */
const EDIT_ERROR_KEY = Object.freeze({
  READ_ONLY: 'trip.editReadOnly',
  PAST_DATE: 'trip.editPast',
  DAILY_CHECK_PENDING: 'trip.editGated',
  NO_STAY: 'trip.editNoPlan',
  NO_TRIP_PLAN: 'trip.editNoPlan',
  NOT_IN_STAY: 'trip.editNoPlan',
  STOP_STARTED: 'trip.errStopStarted',
  SWAP_NOT_PLACED: 'trip.errSwapNotPlaced',
  UPDATE_FAILED: 'trip.errUpdate',
  STORE_FAILED: 'trip.errUpdate',
  NOT_FOUND: 'trip.errNotFound',
});

/** @param {string|undefined} code  편집 동작 결과의 code */
export function editErrorKey(code) {
  return EDIT_ERROR_KEY[code] ?? 'trip.errGeneric';
}

/** 정거장을 바꾸거나 뺄 수 있는가 — 오늘 이미 도착 시각이 지난 정거장은 건드리지 않는다(재계획 규칙 2) */
export function stopEditable(stop, { date, today, nowMin }) {
  if (today && date < today) return false;
  if (date === today && Number.isFinite(nowMin) && minutesOf(stop?.arriveAt) <= nowMin) return false;
  return true;
}

/**
 * 매일 확인 카드의 오늘 조건 요약 (docs/business-rules.md '매일 확인').
 * 외출·복귀 시각은 늘 보이고, 나머지는 제한(값 있음)인 항목만, 제한 없음은 개수로 줄인다.
 */
export function dailyCheckSummary(effective) {
  const rows = effectiveRows(effective);
  const main = rows.filter((r) => r.key === 'outing' || r.key === 'returnTime');
  const rest = rows.filter((r) => r.key !== 'outing' && r.key !== 'returnTime');
  return {
    main,
    restrictions: rest.filter((r) => r.value?.kind === 'SET'),
    noneCount: rest.filter((r) => r.value?.kind !== 'SET').length,
  };
}

/**
 * 'YYYY-MM-DD'(한국 달력 날짜) → 화면 날짜. 기기 시간대와 무관하게 같은 날로 보이도록 한국 정오로 읽는다.
 * @param {string} date
 * @param {string} locale  Intl 로케일 (useLang().locale)
 * @param {'long'|'short'} [style]
 */
export function formatDate(date, locale, style = 'long') {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const at = new Date(`${date}T12:00:00+09:00`);
  if (Number.isNaN(at.getTime())) return date;
  const options =
    style === 'short'
      ? { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' }
      : { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' };
  return new Intl.DateTimeFormat(locale, options).format(at);
}

/** '병원 연동 데모' 모드: 연결된 지침 중 데모가 있다 (docs/business-rules.md '병원 연동') */
export function isDemoMode(stay) {
  return list(stay?.linkedPlans).some((lp) => lp?.plan?.demo === true);
}

/**
 * 데모 사건 하나 (docs/platform/ITINERARY_RULES.md '데모 사건'). 휴무는 아직 도착하지 않은 첫 환자 정거장을 닫는다, 없으면 null.
 * @param {string} type
 * @param {object|null} day  오늘 DayPlan
 * @param {number} nowMin
 */
export function demoEventFor(type, day, nowMin) {
  switch (type) {
    case 'CLOSURE': {
      const next = outingsOf(day, 'P')
        .flatMap(stopsIn)
        .filter((s) => minutesOf(s.arriveAt) > nowMin)
        .sort((a, b) => minutesOf(a.arriveAt) - minutesOf(b.arriveAt))[0];
      return next ? { type, closedIds: [String(next.contentId)] } : null;
    }
    case 'TRAFFIC_SURGE':
      return { type, extraMin: DEMO_TRAFFIC_EXTRA_MIN };
    case 'APPOINTMENT':
      return { type, deltaMin: DEMO_APPOINTMENT_DELTA_MIN };
    case 'WEATHER':
    case 'PATIENT_RECALL':
    case 'RISK_SIGNAL':
      return { type };
    default:
      return null;
  }
}

/**
 * 일정 갱신 실패 안내 본문 키. 서버가 502 에 실은 관광공사 실패 분류(lib/trip 의 lastUpstream)로 고른다.
 * 원인을 단정하지 않고 '지금 할 수 있는 일'만 알린다. 분류가 없으면(오프라인·다른 오류) 예전 일반 문구다.
 *   QUOTA                          제공처 하루 한도, 자정(한국 시각) 이후 다시
 *   NETWORK · UPSTREAM_ERROR · PARSE  잠시 뒤 다시
 *   AUTH · SELF_LIMIT              운영자에게 알림 (사용자가 기다려도 풀리지 않는 쪽)
 * @param {string|null|undefined} upstream
 * @returns {string}
 */
export function updateFailedBodyKey(upstream) {
  switch (upstream) {
    case 'QUOTA':
      return 'today.updateFailedQuota';
    case 'NETWORK':
    case 'UPSTREAM_ERROR':
    case 'PARSE':
      return 'today.updateFailedTemporary';
    case 'AUTH':
    case 'SELF_LIMIT':
      return 'today.updateFailedConnection';
    default:
      return 'today.updateFailedBody';
  }
}

/**
 * 첫 조건 기간을 저장하고 넘어온 오늘 화면(/today?welcome=1)에서 '첫 일정을 만들었어요'를 지금 보여도 되는가.
 * 체류만으로 만든 일정이 이미 있으면 저장 직후 그 옛 일정이 먼저 그려진다. 다시 만드는 동기화가 끝나기 전이나
 * 실패한 동안(updateFailed)에는 사실이 아니므로 보이지 않는다(CLAUDE.md 선 5). 실패 뒤 다시 시도가 성공하면 그때 보인다.
 * 첫 기간 저장은 저장소 구독에서 바로 동기화를 대기열에 넣으므로, 화면이 열릴 때 이미 끝나 있으면 곧바로 보여도 된다.
 * @param {{ pending: boolean, hasPlan: boolean, syncing: boolean, updateFailed: boolean }} signal
 * @returns {boolean}
 */
export function welcomeNoticeReady({ pending, hasPlan, syncing, updateFailed }) {
  return Boolean(pending && hasPlan && !syncing && !updateFailed);
}
