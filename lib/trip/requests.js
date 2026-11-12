// 일정 API 요청 본문 (AX-316 · docs/contracts.md '`POST /api/itinerary/plan`'·'`POST /api/itinerary/alternatives`', docs/platform/ITINERARY_RULES.md '데모 사건', docs/business-rules.md '하루 일정 생성'·'전체 일정 확정과 변화 대응')
//
// 같은 사건 목록을 다시 보내도 효과가 두 번 더해지지 않는다. 오늘 사건은 받은 목록 전체를 처음부터 접어 한 번에 적용한다
// (접는 쪽은 src/engine/tripEvents.js foldDemoEvents, 이 파일은 목록 전체를 실어 보낸다).
//
//   buildPlanBody       생성·재계획. 요청 날짜의 저장 일정만 previous, 나머지 날짜의 배치는 usedContentIds,
//                       편집 기록은 전체(다른 날짜의 고정 장소를 피하게), 오늘을 재계획하면 오늘 사건 **전체**
//   buildRelabelBody    언어 변경 — relabelOnly + 저장 일정만(재판정·편집·사건 없음)
//   buildAlternativesBody  교체 후보 — 그 날짜의 하루·편집 기록·다른 날짜의 배치
//
// stay 는 기기 체류를 받아 PlanStay 허용 목록으로 바꿔 싣는다(이름·주소·전화·연결 코드 없음).
// 순수 함수다. 입력을 바꾸지 않는다(저장 일정 객체는 그대로 참조해 싣는다 — 직렬화만 한다).

import { DEMO_EVENT_LIMITS, DEMO_EVENT_TYPES } from '../../src/engine/tripEvents.js';
import { toPlanStay } from './planStay.js';

/** 서버가 받는 contentId 모양 (lib/server/itinerary-request.js) */
const CONTENT_ID_RE = /^\d{1,12}$/;
/** 서버가 받는 사건 수 상한 */
export const MAX_TODAY_EVENTS = 50;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function contentIdOf(value) {
  const id = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
  return typeof id === 'string' && CONTENT_ID_RE.test(id) ? id : null;
}

function clampInt(value, min, max) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

/**
 * 오늘 데모 사건을 서버 계약 모양으로 정리한다 (docs/platform/ITINERARY_RULES.md '데모 사건').
 * 모르는 유형·쓸 수 없는 매개변수의 사건은 버리고(서버는 400 으로 거부한다), 범위 밖 숫자는 범위로 자른다.
 * 계약 밖 필드는 싣지 않는다. 서버 상한(50개)을 넘으면 앞의 50개만.
 * @param {unknown} events
 * @returns {Array<object>}
 */
export function normalizeTodayEvents(events) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const event of events) {
    const type = event?.type;
    if (!DEMO_EVENT_TYPES.includes(type)) continue;
    if (type === 'CLOSURE') {
      const ids = Array.isArray(event.closedIds) ? [...new Set(event.closedIds.map(contentIdOf).filter(Boolean))] : [];
      if (ids.length === 0) continue;
      out.push({ type, closedIds: ids.slice(0, DEMO_EVENT_LIMITS.closedIdsMax) });
    } else if (type === 'TRAFFIC_SURGE') {
      const extraMin = clampInt(event.extraMin, DEMO_EVENT_LIMITS.surgeMinPerEvent, DEMO_EVENT_LIMITS.surgeMaxPerEvent);
      if (extraMin === null) continue;
      out.push({ type, extraMin });
    } else if (type === 'APPOINTMENT') {
      const deltaMin = clampInt(event.deltaMin, -DEMO_EVENT_LIMITS.appointmentAbsMax, DEMO_EVENT_LIMITS.appointmentAbsMax);
      if (deltaMin === null) continue;
      out.push({ type, deltaMin });
    } else {
      out.push({ type });
    }
  }
  return out.slice(0, MAX_TODAY_EVENTS);
}

/** 하루 일정의 모든 정거장(환자·보호자) contentId */
export function dayContentIds(day) {
  return [...(day?.outings ?? []), ...(day?.guardianOutings ?? [])].flatMap((o) => (o?.stops ?? []).map((s) => s?.contentId));
}

/**
 * 요청하지 않은 날짜에 이미 배치된 장소 (docs/business-rules.md '하루 일정 생성'). 서버가 받는 숫자 contentId 만, 중복 없이.
 * @param {Record<string, object>} days  저장된 TripPlan.days
 * @param {string[]} dates  요청 날짜
 */
export function usedContentIdsOutside(days, dates) {
  const skip = new Set(dates ?? []);
  const used = new Set();
  for (const [date, day] of Object.entries(days ?? {})) {
    if (skip.has(date)) continue;
    for (const raw of dayContentIds(day)) {
      const id = contentIdOf(raw);
      if (id) used.add(id);
    }
  }
  return [...used];
}

/** 요청 날짜의 저장 일정 — 날짜 키와 day.date 가 같은 것만 */
export function previousFor(days, dates) {
  const out = {};
  for (const date of dates ?? []) {
    const day = hasOwn(days, date) ? days[date] : null;
    if (day && day.date === date) out[date] = day;
  }
  return out;
}

/**
 * POST /api/itinerary/plan 본문 — 생성(dates 없음) 또는 재계획.
 * @param {object} args
 * @param {object} args.stay  기기 체류
 * @param {object|null} args.tripPlan  저장된 일정(없으면 처음 생성)
 * @param {string[]} [args.dates]  없으면 체류 전체
 * @param {string[]} [args.withoutPrevious]  previous 를 싣지 않을 날짜(다시 만들기 — 새로 만든다)
 * @param {Record<string, object>} [args.edits]  보낼 편집 기록(없으면 저장된 기록)
 * @param {string} args.lang
 * @param {string} args.today  KST 오늘 — 오늘이 요청에 들면 사건 전체를 싣는다
 * @param {unknown[]} [args.events]  저장된 오늘 사건
 * @param {string} args.nowIso
 */
export function buildPlanBody({ stay, tripPlan, dates, withoutPrevious = [], edits, lang, today, events = [], nowIso }) {
  const days = tripPlan?.days ?? {};
  const body = { lang, stay: toPlanStay(stay) };
  const whole = dates === undefined || dates === null;
  if (!whole) {
    body.dates = [...dates];
    const skip = new Set(withoutPrevious);
    const previous = previousFor(days, dates.filter((d) => !skip.has(d)));
    if (Object.keys(previous).length > 0) body.previous = previous;
  }
  body.edits = edits ?? tripPlan?.edits ?? {};
  body.usedContentIds = whole ? [] : usedContentIdsOutside(days, dates);
  const todayRequested = whole ? stayCovers(stay, today) : dates.includes(today);
  if (todayRequested) body.events = normalizeTodayEvents(events);
  body.now = nowIso;
  return body;
}

function stayCovers(stay, date) {
  const a = stay?.arrival?.date;
  const d = stay?.departure?.date;
  return typeof date === 'string' && typeof a === 'string' && typeof d === 'string' && a <= date && date <= d;
}

/** POST /api/itinerary/plan 본문: 언어 변경(표시만 다시 쓰기, docs/business-rules.md '전체 일정 확정과 변화 대응') */
export function buildRelabelBody({ stay, tripPlan, dates, lang, nowIso }) {
  return {
    lang,
    stay: toPlanStay(stay),
    dates: [...dates],
    previous: previousFor(tripPlan?.days ?? {}, dates),
    relabelOnly: true,
    now: nowIso,
  };
}

/** POST /api/itinerary/alternatives 본문 (docs/contracts.md '`POST /api/itinerary/alternatives`' + 선택 edits·events) */
export function buildAlternativesBody({ stay, tripPlan, date, outingId, stopId, lang, today, events = [], nowIso }) {
  const days = tripPlan?.days ?? {};
  const body = {
    lang,
    stay: toPlanStay(stay),
    date,
    outingId,
    stopId,
    day: days[date],
    usedContentIds: usedContentIdsOutside(days, [date]),
  };
  const record = tripPlan?.edits?.[date];
  if (record) body.edits = { [date]: record };
  if (date === today) body.events = normalizeTodayEvents(events);
  body.now = nowIso;
  return body;
}
