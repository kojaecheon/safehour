// 체류 설정 초안 ↔ 기기 저장 모델 (AX-314 · docs/business-rules.md '체류'·'숙소와 병원', src/stay/stay.js @typedef Stay)
//
// 순수 함수만 둔다(React·브라우저 API 없음). 화면(app/onboarding)과 테스트가 함께 쓴다.
//
//   초안(draft)  — 입력 칸과 1:1. 빈 칸은 '' 또는 null 로 둔다(숨은 기본값을 넣지 않는다).
//                  예외(운영자 결정 2026-11-08, 판정을 느슨하게 하지 않는 기본 선택만): 공항은 인천(ICN),
//                  이동 강도는 느긋하게(RELAXED, 덜 움직이는 쪽)를 미리 골라 둔다. 화면에서 바꿀 수 있다.
//   선택 칸      : 숙소 이름(비우면 저장하지 않고 화면은 '숙소'로 부른다), 출발 시각(비우면 src/stay/defaults.js DEPARTURE_TIME_UNSET).
//   체류(Stay)   : src/stay/stay.js @typedef Stay. stayFromDraft() 가 만들고, 검증은 도메인의 validateStay() 하나만 쓴다.
//
// 원칙
//   - 판정·검증 규칙을 여기서 다시 만들지 않는다. 체류 거부 조건(출국<입국·45박 초과, 수술·시술 없음, 숙소 겹침, docs/business-rules.md '체류')은
//     validateStay() 의 결과를 필드별 문구로 옮길 뿐이다. 더하는 것은 전화번호 모양 검사 하나다.
//   - 수정 때는 이 화면이 다루지 않는 기록(조건 기간·연동 지침·동의·보호자 공유·만든 시각)을 그대로 둔다.
//   - 병원 연동으로 받은 일정(source "HOSPITAL")은 고치거나 지우지 않는다.
//   - 주소는 사용자가 검색해 고른 결과만 받는다. 허용 필드만 남긴다(src/stay/stay.js @typedef Address).

import { DEFAULTS, DEPARTURE_TIME_UNSET } from '../../src/stay/defaults.js';
import { VALIDATION_ISSUE } from '../../src/stay/errorCodes.js';
import { AIRPORTS, APPOINTMENT_TYPES, INTERESTS, NAME_MAX_LENGTH, PACES, validateStay } from '../../src/stay/stay.js';
import { appointmentEnd } from '../../src/stay/dayFrame.js';
import { addDays, diffDays, isClockTime, isDateString } from '../../src/stay/time.js';

/** 단계 순서 — 입·출국 → 숙소 → 병원·일정 → 동반 보호자 → 관심사·강도 */
export const STEPS = Object.freeze(['travel', 'lodging', 'hospital', 'companion', 'preferences']);

/** 단계 이름 문구 키 */
export const STEP_LABEL_KEY = Object.freeze({
  travel: 'onboarding.stepTravel',
  lodging: 'onboarding.stepLodging',
  hospital: 'onboarding.stepHospital',
  companion: 'onboarding.stepCompanion',
  preferences: 'onboarding.stepPreferences',
});

/** 병원 전화(선택): 숫자·+·-·괄호·띄어쓰기만. 긴급 연락 화면의 전화 걸기 링크가 된다(docs/platform/IA_AND_FLOWS.md '고정 요소') */
export const PHONE_MAX_LENGTH = 20;
export const PHONE_PATTERN = /^[0-9+\-() ]{3,20}$/;

/** 주소 검색어 길이: 서버 계약(docs/contracts.md '`POST /api/address/search`')과 같다. 서버가 최종 판단한다 */
export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 60;

export { NAME_MAX_LENGTH };

// 출발 시각을 비웠을 때 저장하는 시각(DEPARTURE_TIME_UNSET, 00:00)은 판정에 쓰이는 숫자라 src/stay/defaults.js 가 정본이다.

/** 미리 골라 두는 공항·이동 강도 (운영자 결정 2026-11-08). 판정을 느슨하게 하지 않는다 */
export const DEFAULT_AIRPORT = 'ICN';
export const DEFAULT_PACE = 'RELAXED';

let idCounter = 0;

/**
 * 새 항목 id. 저장소 id 형식([A-Za-z0-9_-])을 지킨다.
 * @param {string} prefix
 * @param {() => string} [random] 테스트용
 */
export function newId(prefix, random) {
  idCounter += 1;
  const noise =
    random?.() ??
    globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ??
    Math.random().toString(36).slice(2, 14);
  return `${prefix}-${String(noise).replace(/[^A-Za-z0-9]/g, '')}${idCounter.toString(36)}`;
}

function str(value) {
  return typeof value === 'string' ? value : '';
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** undefined 값을 가진 키를 뺀다 — 저장 모델에 빈 선택 필드를 남기지 않는다 */
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) if (value !== undefined) out[key] = value;
  return out;
}

// ── 빈 항목 ──────────────────────────────────────────────────────────

export function emptyLodging(id, { checkIn = '', checkOut = '' } = {}) {
  return { id, name: '', address: null, checkIn, checkOut };
}

export function emptyHospital(id) {
  return { id, name: '', address: null, phone: '' };
}

/** 일정 유형은 비워 둔다 — 사용자가 직접 고른다(숨은 기본값 금지) */
export function emptyAppointment(id, hospitalId = '') {
  return { id, hospitalId, type: null, date: '', start: '', end: '', source: 'USER' };
}

/**
 * 새 체류 초안. 첫 항목의 id 는 고정값이다 — 서버 렌더와 브라우저 렌더가 같은 id 를 쓴다.
 */
export function emptyDraft() {
  return {
    arrival: { date: '', time: '', airport: DEFAULT_AIRPORT },
    departure: { date: '', time: '', airport: DEFAULT_AIRPORT },
    lodgings: [emptyLodging('lodging-1')],
    hospitals: [emptyHospital('hospital-1')],
    appointments: [emptyAppointment('appointment-1', 'hospital-1')],
    hasCompanion: null,
    interests: [],
    pace: DEFAULT_PACE,
  };
}

// ── 주소 ────────────────────────────────────────────────────────────

/**
 * 주소 검색 응답 한 건을 저장 모델(src/stay/stay.js @typedef Address)로 좁힌다. 허용 필드 밖은 버린다.
 * 도로명주소·좌표·출처가 없으면 null.
 */
export function pickAddress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { roadAddress, jibunAddress, buildingName, lat, lng, source } = raw;
  if (typeof roadAddress !== 'string' || roadAddress.trim() === '') return null;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (source !== 'JUSO' && source !== 'DEMO') return null;
  return compact({
    roadAddress,
    jibunAddress: typeof jibunAddress === 'string' && jibunAddress.trim() !== '' ? jibunAddress : undefined,
    buildingName: typeof buildingName === 'string' && buildingName.trim() !== '' ? buildingName : undefined,
    lat,
    lng,
    source,
  });
}

/** 저장된 주소는 좌표가 있으면 그대로 둔다(다른 작업이 넣은 주소를 잃지 않게) */
function storedAddress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return isFiniteNumber(raw.lat) && isFiniteNumber(raw.lng) ? { ...raw } : null;
}

/** 검색어 정리 — 서버와 같은 방식(NFC, 공백 한 칸, 앞뒤 공백 제거). 길이가 맞지 않으면 null */
export function normalizeKeyword(raw) {
  if (typeof raw !== 'string') return null;
  const keyword = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = Array.from(keyword).length;
  return length >= KEYWORD_MIN_LENGTH && length <= KEYWORD_MAX_LENGTH ? keyword : null;
}

/**
 * 주소 검색 실패 → 문구 키. 기술 사유를 그대로 보여주지 않는다.
 * @param {number} status HTTP 상태(네트워크 오류는 0)
 * @param {{reason?: string} | null} body
 */
export function searchErrorKey(status, body) {
  if (status === 401) return 'onboarding.searchErrAuth';
  if (status === 503) return 'onboarding.searchErrUnavailable';
  if (status === 400) {
    if (body?.reason === 'KEYWORD_LENGTH') return 'onboarding.searchErrLength';
    if (body?.reason === 'KEYWORD_CHARS') return 'onboarding.searchErrChars';
    return 'onboarding.searchErrRejected';
  }
  return 'onboarding.searchErrFailed';
}

// ── 초안 ↔ 체류 ─────────────────────────────────────────────────────

/** 저장된 체류 → 초안. 모자란 항목은 빈 항목 하나로 채운다 */
export function draftFromStay(stay) {
  if (!stay || typeof stay !== 'object') return emptyDraft();
  const endpoint = (e) => ({
    date: str(e?.date),
    // 비워 두고 저장한 출발 시각은 다시 빈 칸으로 보여 준다(저장된 00:00 을 사용자가 고른 값처럼 보이지 않게)
    time: e?.timeUnset === true ? '' : str(e?.time),
    airport: AIRPORTS.includes(e?.airport) ? e.airport : null,
  });
  const lodgings = list(stay.lodgings).map((l, i) => ({
    id: str(l?.id) || `lodging-${i + 1}`,
    name: str(l?.name),
    address: storedAddress(l?.address),
    checkIn: str(l?.checkIn),
    checkOut: str(l?.checkOut),
  }));
  const hospitals = list(stay.hospitals).map((h, i) => {
    const hospital = {
      id: str(h?.id) || `hospital-${i + 1}`,
      name: str(h?.name),
      address: storedAddress(h?.address),
      phone: str(h?.phone),
    };
    if (typeof h?.linkedPlanId === 'string' && h.linkedPlanId !== '') hospital.linkedPlanId = h.linkedPlanId;
    return hospital;
  });
  const appointments = list(stay.appointments).map((a, i) => ({
    id: str(a?.id) || `appointment-${i + 1}`,
    hospitalId: str(a?.hospitalId),
    type: APPOINTMENT_TYPES.includes(a?.type) ? a.type : null,
    date: str(a?.date),
    start: str(a?.start),
    end: str(a?.end),
    source: a?.source === 'HOSPITAL' ? 'HOSPITAL' : 'USER',
  }));
  if (lodgings.length === 0) lodgings.push(emptyLodging('lodging-1'));
  if (hospitals.length === 0) hospitals.push(emptyHospital('hospital-1'));
  if (appointments.length === 0) appointments.push(emptyAppointment('appointment-1', hospitals[0].id));
  return {
    arrival: endpoint(stay.arrival),
    departure: endpoint(stay.departure),
    lodgings,
    hospitals,
    appointments,
    hasCompanion: typeof stay.hasCompanion === 'boolean' ? stay.hasCompanion : null,
    interests: INTERESTS.filter((tag) => list(stay.interests).includes(tag)),
    pace: PACES.includes(stay.pace) ? stay.pace : null,
  };
}

/** 출국 칸 → 저장 모델. 출발 시각이 비면 가장 이른 시각과 timeUnset 표시를 남긴다 */
function departureOf(departure) {
  const time = str(departure.time);
  if (time.trim() !== '') return { date: departure.date, time, airport: departure.airport };
  return { date: departure.date, time: DEPARTURE_TIME_UNSET, airport: departure.airport, timeUnset: true };
}

/**
 * 초안 → 기기 저장 체류(src/stay/stay.js @typedef Stay). 저장 시각(createdAt·updatedAt)은 저장소가 채운다.
 *
 * @param {ReturnType<typeof emptyDraft>} draft
 * @param {object | null} [previous] 수정 중인 기존 체류 — 이 화면이 다루지 않는 기록을 그대로 둔다
 */
export function stayFromDraft(draft, previous = null) {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  return {
    ...base,
    schemaVersion: 2,
    arrival: { date: draft.arrival.date, time: draft.arrival.time, airport: draft.arrival.airport },
    departure: departureOf(draft.departure),
    hasCompanion: draft.hasCompanion,
    interests: INTERESTS.filter((tag) => draft.interests.includes(tag)),
    pace: draft.pace,
    lodgings: draft.lodgings.map((l) =>
      compact({
        id: l.id,
        // 숙소 이름은 선택이다. 비우면 저장하지 않는다(화면은 '숙소'로 부른다)
        name: l.name.trim() === '' ? undefined : l.name.trim(),
        address: l.address ?? undefined,
        checkIn: l.checkIn,
        checkOut: l.checkOut,
      }),
    ),
    hospitals: draft.hospitals.map((h) =>
      compact({
        id: h.id,
        name: h.name.trim(),
        address: h.address ?? undefined,
        phone: h.phone.trim() === '' ? undefined : h.phone.trim(),
        linkedPlanId: h.linkedPlanId,
      }),
    ),
    appointments: draft.appointments.map((a) =>
      compact({
        id: a.id,
        hospitalId: a.hospitalId,
        type: a.type,
        date: a.date,
        start: a.start,
        end: a.end === '' ? undefined : a.end,
        source: a.source === 'HOSPITAL' ? 'HOSPITAL' : 'USER',
      }),
    ),
    periods: Array.isArray(base.periods) ? base.periods : [],
    linkedPlans: Array.isArray(base.linkedPlans) ? base.linkedPlans : [],
    consent: base.consent && typeof base.consent === 'object' ? base.consent : { sensitive: null },
    guardianShare: base.guardianShare ?? null,
  };
}

// ── 검증 ────────────────────────────────────────────────────────────

/**
 * 좌표 필드 문제는 주소 필드 하나로 모은다(사용자는 좌표를 직접 넣지 않는다). 중복은 뺀다.
 * @param {Array<{field: string, code: string}>} issues
 */
export function normalizeIssues(issues) {
  const out = [];
  for (const issue of issues) {
    const field = issue.field.replace(/\.(lat|lng)$/, '.address');
    const code = field.endsWith('.address') ? VALIDATION_ISSUE.REQUIRED : issue.code;
    if (!out.some((o) => o.field === field && o.code === code)) out.push({ field, code });
  }
  return out;
}

/**
 * 초안의 모든 문제. 규칙은 validateStay() 가 정하고, 전화번호 모양만 더한다.
 * @returns {Array<{field: string, code: string}>}
 */
export function draftIssues(draft, previous = null) {
  let { issues } = validateStay(stayFromDraft(draft, previous));
  // 출발 시각을 비운 당일 출국(입국일 = 출국일)은 출발이 도착보다 앞선다는 오류 대신 '입력 필요'로 알린다
  if (str(draft.departure.time).trim() === '') {
    issues = issues.map((issue) =>
      issue.field === 'departure.time' && issue.code === VALIDATION_ISSUE.DEPARTURE_BEFORE_ARRIVAL
        ? { field: 'departure.time', code: VALIDATION_ISSUE.REQUIRED }
        : issue,
    );
  }
  const extra = [];
  draft.hospitals.forEach((h, i) => {
    const phone = h.phone.trim();
    if (phone !== '' && !PHONE_PATTERN.test(phone)) {
      extra.push({ field: `hospitals[${i}].phone`, code: VALIDATION_ISSUE.INVALID_VALUE });
    }
  });
  return normalizeIssues([...issues, ...extra]);
}

/** 필드가 속한 단계(0–4) */
export function stepOfField(field) {
  if (/^(arrival|departure)(\.|$)/.test(field)) return 0;
  if (/^lodgings(\[|\.|$)/.test(field)) return 1;
  if (/^(hospitals|appointments|periods)(\[|\.|$)/.test(field)) return 2;
  if (field === 'hasCompanion') return 3;
  if (field === 'interests' || field === 'pace') return 4;
  return 0;
}

/** 문제가 있는 첫 단계. 없으면 -1 */
export function firstStepWithIssues(issues) {
  return issues.length === 0 ? -1 : Math.min(...issues.map((i) => stepOfField(i.field)));
}

/** 필드 경로의 마지막 이름 — 'lodgings[1].checkIn' → 'checkIn', 'lodgings[1]' → 'lodgings[1]' */
function leafOf(field) {
  return field.split('.').pop();
}

/**
 * 문제 → 문구 키와 자리표시자 값.
 * @param {{field: string, code: string}} issue
 * @returns {{key: string, vars?: Record<string, string|number>}}
 */
export function issueMessage({ field, code }) {
  switch (code) {
    case VALIDATION_ISSUE.DEPARTURE_BEFORE_ARRIVAL:
      return { key: 'onboarding.errDepartureBeforeArrival' };
    case VALIDATION_ISSUE.STAY_TOO_LONG:
      return { key: 'onboarding.errStayTooLong', vars: { max: DEFAULTS.stay.maxNights } };
    case VALIDATION_ISSUE.LODGINGS_EMPTY:
      return { key: 'onboarding.errLodgingsEmpty' };
    case VALIDATION_ISSUE.LODGING_DATES_ORDER:
      return { key: 'onboarding.errLodgingOrder' };
    case VALIDATION_ISSUE.LODGING_OVERLAP:
      return { key: 'onboarding.errLodgingOverlap' };
    case VALIDATION_ISSUE.PROCEDURE_REQUIRED:
      return { key: 'onboarding.errProcedureRequired' };
    case VALIDATION_ISSUE.APPOINTMENT_END_BEFORE_START:
      return { key: 'onboarding.errEndBeforeStart' };
    case VALIDATION_ISSUE.NAME_TOO_LONG:
      return { key: 'onboarding.errNameTooLong', vars: { max: NAME_MAX_LENGTH } };
    case VALIDATION_ISSUE.UNKNOWN_HOSPITAL:
      return { key: 'onboarding.errAppointmentHospital' };
    default:
      break;
  }
  if (field.startsWith('periods')) return { key: 'onboarding.errPeriods' };
  const leaf = leafOf(field);
  if (leaf === 'address') return { key: 'onboarding.errAddress' };
  if (leaf === 'name') return { key: 'onboarding.errName' };
  if (leaf === 'phone') return { key: 'onboarding.errPhone' };
  if (leaf === 'hospitalId') return { key: 'onboarding.errAppointmentHospital' };
  if (leaf === 'date' || leaf === 'checkIn' || leaf === 'checkOut') return { key: 'onboarding.errDate' };
  if (leaf === 'time' || leaf === 'start' || leaf === 'end') return { key: 'onboarding.errTime' };
  if (leaf === 'airport' || leaf === 'type' || leaf === 'hasCompanion' || leaf === 'pace') {
    return { key: 'onboarding.errChoose' };
  }
  return { key: 'onboarding.errGeneric' };
}

const ITEM_LABEL_KEY = {
  lodgings: 'onboarding.lodgingItem',
  hospitals: 'onboarding.hospitalItem',
  appointments: 'onboarding.appointmentItem',
};

const LEAF_LABEL_KEY = {
  'arrival.date': 'onboarding.arrivalDate',
  'arrival.time': 'onboarding.arrivalTime',
  'arrival.airport': 'onboarding.arrivalAirport',
  'departure.date': 'onboarding.departureDate',
  'departure.time': 'onboarding.departureTime',
  'departure.airport': 'onboarding.departureAirport',
  'lodgings.name': 'onboarding.lodgingName',
  'lodgings.address': 'onboarding.addressLabel',
  'lodgings.checkIn': 'onboarding.checkIn',
  'lodgings.checkOut': 'onboarding.checkOut',
  'hospitals.name': 'onboarding.hospitalName',
  'hospitals.address': 'onboarding.addressLabel',
  'hospitals.phone': 'onboarding.hospitalPhone',
  'appointments.hospitalId': 'onboarding.appointmentHospital',
  'appointments.type': 'onboarding.appointmentType',
  'appointments.date': 'onboarding.appointmentDate',
  'appointments.start': 'onboarding.appointmentStart',
  'appointments.end': 'onboarding.appointmentEnd',
  lodgings: 'onboarding.stepLodging',
  hospitals: 'onboarding.hospitalsTitle',
  appointments: 'onboarding.appointmentsTitle',
  periods: 'onboarding.stepHospital',
  hasCompanion: 'onboarding.companionLegend',
  interests: 'onboarding.interestsLegend',
  pace: 'onboarding.paceLegend',
};

/**
 * 오류 요약에 붙일 필드 이름 — 문구 키 목록(화면이 ' · ' 로 잇는다).
 * 'lodgings[1].checkIn' → [숙소 2, 체크인 날짜]
 * @returns {Array<{key: string, vars?: Record<string, number>}>}
 */
export function fieldLabelParts(field) {
  const item = /^(lodgings|hospitals|appointments)\[(\d+)\](?:\.(\w+))?$/.exec(field);
  if (item) {
    const [, group, index, leaf] = item;
    const parts = [{ key: ITEM_LABEL_KEY[group], vars: { n: Number(index) + 1 } }];
    const leafKey = leaf ? LEAF_LABEL_KEY[`${group}.${leaf}`] : null;
    if (leafKey) parts.push({ key: leafKey });
    return parts;
  }
  const direct = LEAF_LABEL_KEY[field] ?? LEAF_LABEL_KEY[field.replace(/\[\d+\].*$/, '')];
  return direct ? [{ key: direct }] : [];
}

/**
 * 필드의 입력 칸 id. 오류 요약의 링크가 이 칸으로 초점을 옮긴다.
 * - 'lodgings[1]'(날짜 겹침) → 그 구간의 체크인 칸
 * - 라디오 묶음('arrival.airport') → 첫 선택지
 * - 목록 전체('appointments') → 목록 영역
 */
export function fieldDomId(field) {
  const item = /^(lodgings|hospitals|appointments)\[(\d+)\]$/.exec(field);
  if (item) return item[1] === 'lodgings' ? `ob-lodgings-${item[2]}-checkIn` : `ob-${item[1]}-${item[2]}`;
  return `ob-${field.replace(/\[(\d+)\]/g, '-$1').replace(/\./g, '-')}`;
}

/** 이 필드(정확히 같은 경로)의 문제 */
export function issuesFor(issues, field) {
  return issues.filter((issue) => issue.field === field);
}

// ── 도우미 ──────────────────────────────────────────────────────────

/** 종료 시각이 없을 때의 '예상 종료' (docs/business-rules.md '숙소와 병원': PROCEDURE 240분, VISIT 90분). 계산할 수 없으면 null */
export function estimatedEnd(type, start) {
  if (!APPOINTMENT_TYPES.includes(type) || !isClockTime(start)) return null;
  const { end, endMin } = appointmentEnd({ type, start });
  return { end, durationMin: DEFAULTS.appointmentDurationMin[type], nextDay: endMin >= 24 * 60 };
}

/** 입국일~출국일 박 수. 날짜가 없거나 역순이면 null */
export function nightsOf(draft) {
  const { date: a } = draft.arrival;
  const { date: d } = draft.departure;
  if (!isDateString(a) || !isDateString(d)) return null;
  const nights = diffDays(a, d);
  return nights >= 0 ? nights : null;
}

/**
 * 숙소가 정해지지 않은 밤(입국일~출국 전날). 그 날짜는 일정을 만들지 않는다(docs/business-rules.md '숙소와 병원'의 LODGING_REQUIRED).
 * 체류 길이가 한도를 넘으면 계산하지 않는다(그때는 docs/business-rules.md '체류'의 45박 초과 오류가 먼저다).
 */
export function uncoveredNights(draft, { maxNights = DEFAULTS.stay.maxNights } = {}) {
  const nights = nightsOf(draft);
  if (nights === null || nights === 0 || nights > maxNights) return [];
  const segments = draft.lodgings.filter(
    (l) => isDateString(l.checkIn) && isDateString(l.checkOut) && l.checkIn < l.checkOut,
  );
  const missing = [];
  for (let i = 0; i < nights; i += 1) {
    const night = addDays(draft.arrival.date, i);
    if (!segments.some((l) => l.checkIn <= night && night < l.checkOut)) missing.push(night);
  }
  return missing;
}

/** 숙소 날짜 채우기 — 첫 숙소의 날짜가 비어 있으면 입국일·출국일로 채운다(고칠 수 있는 제안값) */
export function prefillLodgingDates(draft) {
  const [first, ...rest] = draft.lodgings;
  if (rest.length > 0 || !first || first.checkIn !== '' || first.checkOut !== '') return draft;
  const { date: a } = draft.arrival;
  const { date: d } = draft.departure;
  if (!isDateString(a) || !isDateString(d) || a >= d) return draft;
  return { ...draft, lodgings: [{ ...first, checkIn: a, checkOut: d }] };
}

/** 숙소 구간 추가 — 앞 구간의 체크아웃 날짜를 새 구간의 체크인으로 제안한다 */
export function addLodging(draft, id) {
  const last = draft.lodgings[draft.lodgings.length - 1];
  const checkIn = isDateString(last?.checkOut) ? last.checkOut : '';
  const departure = draft.departure.date;
  const checkOut = checkIn !== '' && isDateString(departure) && departure > checkIn ? departure : '';
  return { ...draft, lodgings: [...draft.lodgings, emptyLodging(id, { checkIn, checkOut })] };
}

/** 병원 일정 추가 — 병원이 하나면 그 병원을 미리 고른다 */
export function addAppointment(draft, id) {
  const hospitalId = draft.hospitals.length === 1 ? draft.hospitals[0].id : '';
  return { ...draft, appointments: [...draft.appointments, emptyAppointment(id, hospitalId)] };
}

/**
 * 이 병원을 지울 수 없는 이유. 지울 수 있으면 null.
 *   LINKED       병원 연동 중
 *   APPOINTMENTS 이 병원을 가리키는 일정이 있다
 *   PERIODS      조건 기간(병원 발행 기간·병원 복귀)이 이 병원을 쓴다
 */
export function hospitalRemovalBlock(draft, periods, hospitalId) {
  const hospital = draft.hospitals.find((h) => h.id === hospitalId);
  if (hospital?.linkedPlanId) return 'LINKED';
  if (draft.appointments.some((a) => a.hospitalId === hospitalId)) return 'APPOINTMENTS';
  const used = list(periods).some(
    (p) => p?.hospitalId === hospitalId || p?.items?.returnTime?.hospitalId === hospitalId,
  );
  return used ? 'PERIODS' : null;
}
