// 일정 API 요청 정규화 (AX-308 · docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)'·'`POST /api/itinerary/plan`'·'공통', docs/platform/ITINERARY_RULES.md '데모 사건')
//
// 원칙
//   - 허용 목록만 통과시킨다. 목록 밖 필드(이름·주소·전화·병원 안내문·연결 코드·현재 위치류·계정 정보)는
//     읽지 않고 새 객체에 옮기지 않는다. 엔진·로그·응답 어디로도 흘러가지 않는다(docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)'·'공통').
//   - 좌표는 대한민국 범위만 받는다. 기준점은 사용자가 고른 숙소·병원 고정 좌표뿐이다(docs/security.md '위치 정보').
//   - 형식이 틀리면 엔진까지 내려가지 않고 400 으로 막는다. 오류에는 필드 경로와 코드만 담고 입력값은 담지 않는다.
//   - 요청의 `now` 는 쓰지 않는다. 현재 시각은 서버 시계(KST)가 정한다.
//
// 상대 경로 사용 — Next 외부(node --test)에서도 이 모듈을 그대로 테스트하기 위함

import { REASON, STATE } from '../../src/domain/states.js';
import { LABEL_ORDER, WARNING_ORDER } from '../../src/engine/displayOrder.js';
import { DEMO_EVENT_LIMITS, DEMO_EVENT_TYPES } from '../../src/engine/tripEvents.js';
import { COVERAGE } from '../../src/stay/coverage.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { ITEM_KEYS } from '../../src/stay/conditions.js';
import { ERROR_CODE, VALIDATION_ISSUE, validationResult } from '../../src/stay/errorCodes.js';
import { hasSensitiveConsent, validateStay } from '../../src/stay/stay.js';
import { isClockTime, isDateString } from '../../src/stay/time.js';

export const BAD_REQUEST = 'SAFEHOUR_BAD_REQUEST';

/** 관광 데이터 언어 (docs/business-rules.md '언어') */
export const PLAN_LANGS = Object.freeze(['ko', 'en', 'ja', 'zh']);

/** 대한민국 범위(경계 제외) — 기존 기준점 검사·관광 후보 모듈과 같은 범위다 */
const KOREA = Object.freeze({ latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 });

const MAX_DATES = DEFAULTS.stay.maxNights + 1;
const MAX_EVENTS = 50;
const MAX_USED_IDS = 2000;
const MAX_EDIT_IDS = 100;
const MAX_OUTINGS = 12;
const MAX_STOPS = 12;
const MAX_EXCLUDED = 1000;
const MAX_LIST = 100;
/** 엔진이 만드는 id(`${date}:${role}:${contentId}`, `${date}:P:outing-1`) */
const ID_RE = /^[A-Za-z0-9:._-]{1,120}$/;
const CONTENT_ID_RE = /^\d{1,12}$/;

const REASONS = new Set(Object.values(REASON));
const DAY_STATES = new Set(Object.values(STATE));
const COVERAGES = new Set(Object.values(COVERAGE));
// 경고·표시 라벨의 정본은 src/engine/displayOrder.js 하나다. 여기에 사본을 두면,
// 엔진에만 값을 더했을 때 서버가 previous 일정에서 그 값을 조용히 걸러 낸다(재계획 때 사라진다).
const WARNINGS = new Set(WARNING_ORDER);
const LABELS = new Set(LABEL_ORDER);
const DEADLINE_REASONS = new Set(['RETURN_TIME', 'MEDICATION', 'APPOINTMENT', 'DAY_END', 'DEPARTURE', 'PATIENT_SCHEDULE']);
const MEAL_SLOTS = new Set(['LUNCH', 'DINNER']);
const MEAL_STATUS = new Set(['FILLED', 'NONE_AVAILABLE', 'CLEARED', 'NOT_APPLICABLE']);
const ANSWER_OBJECT_KEYS = ['kind', 'value', 'time', 'place', 'hospitalId', 'mode', 'until', 'atLodging'];
const DIET_KEYS = ['spicy', 'alcohol', 'hard', 'hot', 'raw'];
const ITEM_TOP_KEYS = [
  'outing',
  'returnTime',
  'walkLimit',
  'travelLimit',
  'avoidUv',
  'avoidHeat',
  'avoidWater',
  'escortRequired',
  'guardianMustStay',
  'mealRestriction',
  'medication',
];

/**
 * 요청 형식 오류. 라우트가 `{ ok:false, errorCode, message, ...extra }` 로 바꾼다.
 * field 는 입력 경로(값이 아니다).
 */
export class RequestError extends Error {
  constructor(errorCode, field, extra = {}) {
    super(`${errorCode}: ${field}`);
    this.name = 'RequestError';
    this.errorCode = errorCode;
    this.field = field;
    this.extra = extra;
  }
}

const bad = (field) => new RequestError(BAD_REQUEST, field);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 값을 그대로 옮긴다(검증은 validateStay 가 한다). 없으면 키를 만들지 않는다 */
function copyKeys(source, keys) {
  const out = {};
  if (!isPlainObject(source)) return out;
  for (const key of keys) if (hasOwn(source, key) && source[key] !== undefined) out[key] = source[key];
  return out;
}

function copyArray(value, mapper) {
  return Array.isArray(value) ? value.slice(0, MAX_LIST).map(mapper) : value;
}

// ── PlanStay ─────────────────────────────────────────────────────────────

/** Answer<T>·returnTime 같은 항목 값 — 정해진 하위 키만(JSON 원시값·정해진 모양) */
function cleanAnswer(value, depth = 0) {
  if (value === null || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 120) : value;
  if (depth > 3) return null;
  if (Array.isArray(value)) return value.slice(0, 24).map((v) => cleanAnswer(v, depth + 1));
  const out = {};
  for (const key of ANSWER_OBJECT_KEYS) {
    if (hasOwn(value, key) && value[key] !== undefined) out[key] = cleanAnswer(value[key], depth + 1);
  }
  return out;
}

function cleanItems(items) {
  if (!isPlainObject(items)) return items;
  const out = {};
  for (const key of ITEM_TOP_KEYS) if (hasOwn(items, key) && items[key] !== undefined) out[key] = cleanAnswer(items[key]);
  if (hasOwn(items, 'diet')) {
    out.diet = isPlainObject(items.diet)
      ? Object.fromEntries(DIET_KEYS.filter((k) => hasOwn(items.diet, k)).map((k) => [k, cleanAnswer(items.diet[k])]))
      : items.diet;
  }
  return out;
}

/**
 * 요청 본문의 stay 를 PlanStay 허용 목록(docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)')으로 옮긴다. 검증하지 않는다(validatePlanStay).
 * ```text
 * PlanStay { arrival, departure, hasCompanion, interests, pace,
 *   lodgings: [{ id, lat, lng, checkIn, checkOut }], hospitals: [{ id, lat, lng }],
 *   appointments: [{ id, hospitalId, type, date, start, end? }],
 *   periods: [{ id, source, startDate, endDate, noRestriction?, items, expiresAt?, revoked? }],
 *   consent: { sensitive: boolean } }
 * ```
 * 동의는 true 또는 기기 저장 형태({version, agreedAt})만 참으로 읽고 boolean 으로 바꾼다.
 * @param {unknown} raw
 * @returns {object|null}  객체가 아니면 null
 */
export function normalizePlanStay(raw) {
  if (!isPlainObject(raw)) return null;
  const endpoint = (e) => (isPlainObject(e) ? copyKeys(e, ['date', 'time', 'airport']) : e);
  return {
    arrival: endpoint(raw.arrival),
    departure: endpoint(raw.departure),
    hasCompanion: raw.hasCompanion,
    interests: Array.isArray(raw.interests) ? raw.interests.slice(0, 16) : raw.interests,
    pace: raw.pace,
    lodgings: copyArray(raw.lodgings, (l) => copyKeys(l, ['id', 'lat', 'lng', 'checkIn', 'checkOut'])),
    hospitals: copyArray(raw.hospitals, (h) => copyKeys(h, ['id', 'lat', 'lng'])),
    appointments: copyArray(raw.appointments, (a) => copyKeys(a, ['id', 'hospitalId', 'type', 'date', 'start', 'end'])),
    periods: copyArray(raw.periods ?? [], (p) => {
      const out = copyKeys(p, ['id', 'source', 'startDate', 'endDate', 'noRestriction', 'expiresAt', 'revoked']);
      if (isPlainObject(p) && hasOwn(p, 'items')) out.items = cleanItems(p.items);
      return out;
    }),
    consent: { sensitive: hasSensitiveConsent({ consent: { sensitive: raw.consent?.sensitive } }) },
  };
}

function inKorea(lat, lng) {
  return lat > KOREA.latMin && lat < KOREA.latMax && lng > KOREA.lngMin && lng < KOREA.lngMax;
}

/**
 * validateStay(docs/business-rules.md '체류'·'숙소와 병원'·'조건 기간') + 대한민국 좌표 범위(docs/contracts.md '공통'). 범위 밖이면 OUT_OF_RANGE.
 * @returns {{ok: boolean, errorCode?: string, fields: string[], issues: Array<{field: string, code: string}>}}
 */
export function validatePlanStay(stay) {
  const base = validateStay(stay);
  const issues = [...base.issues];
  const checkRange = (list, prefix) => {
    (Array.isArray(list) ? list : []).forEach((item, i) => {
      const { lat, lng } = item ?? {};
      if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (inKorea(lat, lng)) return;
      if (!(lat > KOREA.latMin && lat < KOREA.latMax)) issues.push({ field: `${prefix}[${i}].lat`, code: VALIDATION_ISSUE.OUT_OF_RANGE });
      if (!(lng > KOREA.lngMin && lng < KOREA.lngMax)) issues.push({ field: `${prefix}[${i}].lng`, code: VALIDATION_ISSUE.OUT_OF_RANGE });
    });
  };
  checkRange(stay?.lodgings, 'lodgings');
  checkRange(stay?.hospitals, 'hospitals');
  return validationResult(issues);
}

function planStayOrThrow(raw) {
  const stay = normalizePlanStay(raw);
  const result = stay ? validatePlanStay(stay) : validationResult([{ field: 'stay', code: VALIDATION_ISSUE.REQUIRED }]);
  if (!result.ok) {
    throw new RequestError(ERROR_CODE.STAY_INVALID, 'stay', { fields: result.fields, issues: result.issues });
  }
  return stay;
}

// ── 공통 필드 ────────────────────────────────────────────────────────────

/** 관광 데이터 언어. 네 가지 밖이면 400 */
export function normalizeLang(value, field = 'lang') {
  if (typeof value !== 'string' || !PLAN_LANGS.includes(value)) throw bad(field);
  return value;
}

function contentId(value, field) {
  const id = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
  if (typeof id !== 'string' || !CONTENT_ID_RE.test(id)) throw bad(field);
  return id;
}

function contentIds(value, field, max) {
  if (!Array.isArray(value) || value.length > max) throw bad(field);
  return value.map((v) => contentId(v, field));
}

function dateList(value, field) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > MAX_DATES || !value.every(isDateString)) throw bad(field);
  return [...value];
}

function usedIds(value) {
  if (value === undefined || value === null) return [];
  return contentIds(value, 'usedContentIds', MAX_USED_IDS);
}

/** TripPlan.edits — Record<date, {pinned, deleted, clearedMeals}> */
function editsOf(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw bad('edits');
  const entries = Object.entries(value);
  if (entries.length > MAX_DATES) throw bad('edits');
  const out = {};
  for (const [date, record] of entries) {
    if (!isDateString(date)) throw bad('edits');
    if (!isPlainObject(record)) throw bad(`edits.${date}`);
    const entry = {};
    for (const key of ['pinned', 'deleted']) {
      if (record[key] === undefined) continue;
      entry[key] = contentIds(record[key], `edits.${date}.${key}`, MAX_EDIT_IDS);
    }
    if (record.clearedMeals !== undefined) {
      const meals = record.clearedMeals;
      if (!Array.isArray(meals) || meals.length > 2 || !meals.every((m) => MEAL_SLOTS.has(m))) throw bad(`edits.${date}.clearedMeals`);
      entry.clearedMeals = [...meals];
    }
    out[date] = entry;
  }
  return out;
}

function integerIn(value, min, max, field) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw bad(field);
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) throw bad(field);
  return rounded;
}

/**
 * 데모 사건 목록(docs/platform/ITINERARY_RULES.md '데모 사건')을 검증·정리한다. 엔진(foldDemoEvents)에 넘기기 전에 부른다.
 * 모르는 유형, 범위 밖 매개변수는 400(SAFEHOUR_BAD_REQUEST, field=`events[i].…`).
 * @returns {Array<object>}
 */
export function normalizeDemoEvents(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_EVENTS) throw bad('events');
  return value.map((event, i) => {
    const at = `events[${i}]`;
    const type = event?.type;
    if (!DEMO_EVENT_TYPES.includes(type)) throw bad(`${at}.type`);
    switch (type) {
      case 'CLOSURE': {
        const ids = event.closedIds;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > DEMO_EVENT_LIMITS.closedIdsMax) throw bad(`${at}.closedIds`);
        return { type, closedIds: ids.map((id) => contentId(id, `${at}.closedIds`)) };
      }
      case 'TRAFFIC_SURGE':
        return {
          type,
          extraMin: integerIn(event.extraMin, DEMO_EVENT_LIMITS.surgeMinPerEvent, DEMO_EVENT_LIMITS.surgeMaxPerEvent, `${at}.extraMin`),
        };
      case 'APPOINTMENT':
        return {
          type,
          deltaMin: integerIn(event.deltaMin, -DEMO_EVENT_LIMITS.appointmentAbsMax, DEMO_EVENT_LIMITS.appointmentAbsMax, `${at}.deltaMin`),
        };
      default:
        return { type };
    }
  });
}

// ── DayPlan (docs/contracts.md '`POST /api/itinerary/plan`') ──────────────────────────────

function str(value, field, { max = 200, nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length > max) throw bad(field);
  return value;
}

function id(value, field) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw bad(field);
  return value;
}

function clock(value, field) {
  if (!isClockTime(value)) throw bad(field);
  return value;
}

function num(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(field);
  return value;
}

function bool(value, field) {
  if (typeof value !== 'boolean') throw bad(field);
  return value;
}

function oneOf(value, set, field) {
  if (!set.has(value)) throw bad(field);
  return value;
}

function list(value, field, max) {
  if (!Array.isArray(value) || value.length > max) throw bad(field);
  return value;
}

/** 사유 코드는 닫힌 집합만 남긴다 — 자유 문자열은 조용히 버린다 */
function reasons(value, field) {
  return list(value ?? [], field, MAX_LIST).filter((r) => REASONS.has(r));
}

function stringIds(value, field) {
  return list(value ?? [], field, MAX_LIST).map((v, i) => id(v, `${field}[${i}]`));
}

function idMap(value, field, keys) {
  if (!isPlainObject(value)) throw bad(field);
  const out = {};
  for (const key of keys) {
    const v = value[key];
    if (v === undefined || v === null || v === '') continue;
    out[key] = str(v, `${field}.${key}`, { max: 20 });
  }
  return out;
}

function stopOf(raw, field) {
  if (!isPlainObject(raw)) throw bad(field);
  const lat = num(raw.lat, `${field}.lat`);
  const lng = num(raw.lng, `${field}.lng`);
  if (!inKorea(lat, lng)) throw bad(`${field}.lat`);
  const legIn = raw.legIn;
  if (!isPlainObject(legIn)) throw bad(`${field}.legIn`);
  const stop = {
    id: id(raw.id, `${field}.id`),
    candidateId: str(raw.candidateId, `${field}.candidateId`, { max: 40 }),
    contentId: str(raw.contentId, `${field}.contentId`, { max: 40 }),
    title: str(raw.title, `${field}.title`, { max: 300 }),
    address: str(raw.address, `${field}.address`, { max: 400, nullable: true }),
    lang: str(raw.lang, `${field}.lang`, { max: 5 }),
    category: str(raw.category, `${field}.category`, { max: 40, nullable: true }),
    isMeal: bool(raw.isMeal, `${field}.isMeal`),
    lat,
    lng,
    ko:
      raw.ko === null || raw.ko === undefined
        ? null
        : isPlainObject(raw.ko)
          ? {
              title: str(raw.ko.title, `${field}.ko.title`, { max: 300 }),
              address: str(raw.ko.address, `${field}.ko.address`, { max: 400, nullable: true }),
            }
          : (() => {
              throw bad(`${field}.ko`);
            })(),
    sourceIds: idMap(raw.sourceIds, `${field}.sourceIds`, ['ko', 'en', 'ja', 'zh', 'barrierFree']),
    contentTypeIds: idMap(raw.contentTypeIds, `${field}.contentTypeIds`, ['canonical', 'ko', 'en', 'ja', 'zh']),
    arriveAt: clock(raw.arriveAt, `${field}.arriveAt`),
    leaveAt: clock(raw.leaveAt, `${field}.leaveAt`),
    stayMin: num(raw.stayMin, `${field}.stayMin`),
    shortened: bool(raw.shortened, `${field}.shortened`),
    legIn: {
      min: num(legIn.min, `${field}.legIn.min`),
      mode: oneOf(legIn.mode, new Set(['WALK', 'TAXI', 'TRANSIT']), `${field}.legIn.mode`),
      estimated: true,
    },
    walkBurdenMin: num(raw.walkBurdenMin, `${field}.walkBurdenMin`),
    indoor: raw.indoor === true || raw.indoor === false ? raw.indoor : raw.indoor === null ? null : (() => { throw bad(`${field}.indoor`); })(),
    pinned: bool(raw.pinned, `${field}.pinned`),
    labels: list(raw.labels ?? [], `${field}.labels`, 10).filter((l) => LABELS.has(l)),
  };
  if (raw.image !== undefined && raw.image !== null) {
    if (!isPlainObject(raw.image)) throw bad(`${field}.image`);
    stop.image = {
      url: str(raw.image.url, `${field}.image.url`, { max: 1000 }),
      copyrightType: str(raw.image.copyrightType ?? null, `${field}.image.copyrightType`, { max: 20, nullable: true }),
    };
  }
  return stop;
}

function outingOf(raw, field) {
  if (!isPlainObject(raw)) throw bad(field);
  const outing = {
    id: id(raw.id, `${field}.id`),
    departAt: clock(raw.departAt, `${field}.departAt`),
    returnBy: clock(raw.returnBy, `${field}.returnBy`),
    returnPlace: oneOf(raw.returnPlace, new Set(['LODGING', 'HOSPITAL']), `${field}.returnPlace`),
    deadlineReason: oneOf(raw.deadlineReason, DEADLINE_REASONS, `${field}.deadlineReason`),
    latestDepartureAt: clock(raw.latestDepartureAt, `${field}.latestDepartureAt`),
    slackMin: num(raw.slackMin, `${field}.slackMin`),
    walkTotalMin: num(raw.walkTotalMin, `${field}.walkTotalMin`),
    travelTotalMin: num(raw.travelTotalMin, `${field}.travelTotalMin`),
  };
  if (raw.plannedReturnAt !== undefined) outing.plannedReturnAt = clock(raw.plannedReturnAt, `${field}.plannedReturnAt`);
  outing.stops = list(raw.stops, `${field}.stops`, MAX_STOPS).map((s, i) => stopOf(s, `${field}.stops[${i}]`));
  return outing;
}

function effectiveOf(raw, field) {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw bad(field);
  const out = {};
  for (const key of ITEM_KEYS) {
    const entry = raw[key];
    if (entry === undefined) continue;
    if (!isPlainObject(entry)) throw bad(`${field}.${key}`);
    out[key] = {
      value: cleanAnswer(entry.value),
      provenance: list(entry.provenance ?? [], `${field}.${key}.provenance`, 20).map((p, i) => {
        const at = `${field}.${key}.provenance[${i}]`;
        if (!isPlainObject(p)) throw bad(at);
        return {
          periodId: p.periodId === null ? null : str(p.periodId, `${at}.periodId`, { max: 80 }),
          source: p.source === null ? null : oneOf(p.source, new Set(['SELF', 'HOSPITAL']), `${at}.source`),
          defaulted: bool(p.defaulted, `${at}.defaulted`),
        };
      }),
    };
  }
  return out;
}

function deltaOf(raw, field) {
  if (!isPlainObject(raw)) throw bad(field);
  const state = (v, f) => (v === null ? null : oneOf(v, DAY_STATES, f));
  return {
    stateChanged: bool(raw.stateChanged, `${field}.stateChanged`),
    before: state(raw.before, `${field}.before`),
    after: state(raw.after, `${field}.after`),
    removed: stringIds(raw.removed, `${field}.removed`),
    added: stringIds(raw.added, `${field}.added`),
    replaced: list(raw.replaced ?? [], `${field}.replaced`, MAX_LIST).map((r, i) => ({
      from: id(r?.from, `${field}.replaced[${i}].from`),
      to: id(r?.to, `${field}.replaced[${i}].to`),
    })),
    shortened: stringIds(raw.shortened, `${field}.shortened`),
    cancelledOutings: stringIds(raw.cancelledOutings, `${field}.cancelledOutings`),
    newDeadlines: list(raw.newDeadlines ?? [], `${field}.newDeadlines`, MAX_LIST).map((d, i) => ({
      outingId: id(d?.outingId, `${field}.newDeadlines[${i}].outingId`),
      returnBy: clock(d?.returnBy, `${field}.newDeadlines[${i}].returnBy`),
    })),
    reasons: reasons(raw.reasons, `${field}.reasons`),
    hasVisibleChange: bool(raw.hasVisibleChange, `${field}.hasVisibleChange`),
    seen: bool(raw.seen, `${field}.seen`),
  };
}

/**
 * 기기가 보낸 DayPlan(docs/contracts.md '`POST /api/itinerary/plan`')을 정리한다. 계약 필드만 새 객체에 옮기고 형식을 검사한다.
 * 사유·라벨·경고는 닫힌 집합 밖 값을 버린다. 형식이 틀리면 RequestError(field=경로).
 * @param {unknown} raw
 * @param {string} field  오류 경로 접두사 (예: `previous.2026-10-01`)
 */
export function normalizeDayPlan(raw, field) {
  if (!isPlainObject(raw)) throw bad(field);
  const day = {
    date: isDateString(raw.date) ? raw.date : (() => { throw bad(`${field}.date`); })(),
    coverage: oneOf(raw.coverage, COVERAGES, `${field}.coverage`),
    dayState: oneOf(raw.dayState, DAY_STATES, `${field}.dayState`),
    reasons: reasons(raw.reasons, `${field}.reasons`),
    window:
      raw.window === null || raw.window === undefined
        ? null
        : isPlainObject(raw.window)
          ? { start: clock(raw.window.start, `${field}.window.start`), end: clock(raw.window.end, `${field}.window.end`) }
          : (() => { throw bad(`${field}.window`); })(),
    // 숙소·병원 일정 id 는 기기가 만든 값이다 — 엔진 id 형식을 강요하지 않고 길이만 제한한다
    lodgingId: raw.lodgingId === null || raw.lodgingId === undefined ? null : str(raw.lodgingId, `${field}.lodgingId`, { max: 120 }),
    transportMode: oneOf(raw.transportMode, new Set(['TAXI', 'TRANSIT']), `${field}.transportMode`),
    effective: effectiveOf(raw.effective, `${field}.effective`),
    blocks: list(raw.blocks ?? [], `${field}.blocks`, MAX_LIST).map((b, i) => {
      const at = `${field}.blocks[${i}]`;
      if (!isPlainObject(b)) throw bad(at);
      const block = {
        kind: oneOf(b.kind, new Set(['APPOINTMENT', 'MEDICATION']), `${at}.kind`),
        start: clock(b.start, `${at}.start`),
        end: clock(b.end, `${at}.end`),
      };
      if (b.appointmentId !== undefined) block.appointmentId = str(b.appointmentId, `${at}.appointmentId`, { max: 120 });
      return block;
    }),
    outings: list(raw.outings ?? [], `${field}.outings`, MAX_OUTINGS).map((o, i) => outingOf(o, `${field}.outings[${i}]`)),
    guardianOutings: list(raw.guardianOutings ?? [], `${field}.guardianOutings`, MAX_OUTINGS).map((o, i) =>
      outingOf(o, `${field}.guardianOutings[${i}]`),
    ),
    mealSlots: list(raw.mealSlots ?? [], `${field}.mealSlots`, 2).map((m, i) => {
      const at = `${field}.mealSlots[${i}]`;
      if (!isPlainObject(m)) throw bad(at);
      const slot = {
        slot: oneOf(m.slot, MEAL_SLOTS, `${at}.slot`),
        status: oneOf(m.status, MEAL_STATUS, `${at}.status`),
      };
      if (m.stopId !== undefined) slot.stopId = id(m.stopId, `${at}.stopId`);
      slot.reasons = reasons(m.reasons, `${at}.reasons`);
      return slot;
    }),
    excluded: list(raw.excluded ?? [], `${field}.excluded`, MAX_EXCLUDED).map((e, i) => {
      const at = `${field}.excluded[${i}]`;
      if (!isPlainObject(e)) throw bad(at);
      return {
        candidateId: str(e.candidateId, `${at}.candidateId`, { max: 40 }),
        title: str(e.title ?? '', `${at}.title`, { max: 300 }),
        reasons: reasons(e.reasons, `${at}.reasons`),
      };
    }),
    warnings: list(raw.warnings ?? [], `${field}.warnings`, 10).filter((w) => WARNINGS.has(w)),
    returnNow: raw.returnNow === undefined ? false : bool(raw.returnNow, `${field}.returnNow`),
  };
  if (raw.delta !== undefined && raw.delta !== null) day.delta = deltaOf(raw.delta, `${field}.delta`);
  if (raw.intro !== undefined && raw.intro !== null) {
    if (!isPlainObject(raw.intro)) throw bad(`${field}.intro`);
    day.intro = {
      text: str(raw.intro.text, `${field}.intro.text`, { max: 400 }),
      source: oneOf(raw.intro.source, new Set(['AI', 'TEMPLATE']), `${field}.intro.source`),
    };
  }
  return day;
}

function previousOf(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw bad('previous');
  const entries = Object.entries(value);
  if (entries.length > MAX_DATES) throw bad('previous');
  const out = {};
  for (const [date, day] of entries) {
    if (!isDateString(date)) throw bad('previous');
    const clean = normalizeDayPlan(day, `previous.${date}`);
    if (clean.date !== date) throw bad(`previous.${date}.date`);
    out[date] = clean;
  }
  return out;
}

function requireBody(body) {
  if (!isPlainObject(body)) throw bad('body');
}

/**
 * POST /api/itinerary/plan 요청 (docs/contracts.md '`POST /api/itinerary/plan`').
 * `{ lang, stay: PlanStay, dates?, previous?, edits?, usedContentIds?, events?, relabelOnly?, now }` — now 는 쓰지 않는다.
 * @returns {{lang: string, stay: object, dates: string[]|undefined, previous: object, edits: object,
 *            usedContentIds: string[], events: object[], relabelOnly: boolean}}
 * @throws {RequestError}
 */
export function normalizePlanRequest(body) {
  requireBody(body);
  const lang = normalizeLang(body.lang);
  const stay = planStayOrThrow(body.stay);
  return {
    lang,
    stay,
    dates: dateList(body.dates, 'dates'),
    previous: previousOf(body.previous),
    edits: editsOf(body.edits),
    usedContentIds: usedIds(body.usedContentIds),
    events: normalizeDemoEvents(body.events),
    relabelOnly: body.relabelOnly === true,
  };
}

/**
 * POST /api/itinerary/alternatives 요청 (docs/contracts.md '`POST /api/itinerary/alternatives`').
 * `{ lang, stay: PlanStay, date, outingId, stopId, day: DayPlan, usedContentIds?, now }`
 * + 선택: `edits`(그 날짜 기록만 쓴다)·`events`(오늘 데모 사건) — plan 과 같은 형식. 오늘 닫힘·기상 사건과
 *   사용자가 지운 장소를 교체 후보에서 빼려면 필요하다(spec 표에 없는 확장, 보고함).
 * @throws {RequestError}
 */
export function normalizeAlternativesRequest(body) {
  requireBody(body);
  const lang = normalizeLang(body.lang);
  const stay = planStayOrThrow(body.stay);
  if (!isDateString(body.date)) throw bad('date');
  const outingId = typeof body.outingId === 'string' && ID_RE.test(body.outingId) ? body.outingId : null;
  if (!outingId) throw bad('outingId');
  const stopId = typeof body.stopId === 'string' && ID_RE.test(body.stopId) ? body.stopId : null;
  if (!stopId) throw bad('stopId');
  const day = normalizeDayPlan(body.day, 'day');
  if (day.date !== body.date) throw bad('day.date');
  return {
    lang,
    stay,
    date: body.date,
    outingId,
    stopId,
    day,
    usedContentIds: usedIds(body.usedContentIds),
    edits: editsOf(body.edits),
    events: normalizeDemoEvents(body.events),
  };
}
