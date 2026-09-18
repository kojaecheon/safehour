// 보호자 스냅샷 — 허용 목록 조립 (AX-313 · spec 4.11, 5.4, 규칙 37)
//
// 스냅샷은 **허용 목록으로만** 만든다. 입력 객체를 펼치거나(`...`) 통째로 복사하지 않고,
// spec 5.4 의 필드를 하나씩 골라 형식을 확인한 값만 옮긴다. 그래서 체류·일정에 무엇이 들어 있든
// (조건 항목 세부, 병원 이름·주소·전화, 병원 안내문, 병원 일정, 마감 이유, 이미지, 내부 id)
// 스냅샷에 들어갈 길이 없다.
//
// - 담는 것: 만든 시각, 만료 시각(출국일 23:59 KST), 언어, 날짜별 {동행 필요, 보호자 단독 외출 가능,
//   환자 복귀 마감·장소 이름·주소, 보호자 외출}, 긴급 번호(119, 1330)
// - 날짜는 만든 날(KST)부터 출국일까지 — 지난 날은 보호자에게 쓸모가 없고 링크만 길게 한다
// - 환자 복귀 장소가 병원이면 이름·주소 대신 일반 라벨 '병원' + 주소 null
// - 보호자 외출은 Outing 에서 deadlineReason 을 뺀 것. 정거장은 보호자에게 필요한 것만 남긴다:
//   표시 언어 이름·주소, 한국어 원문(있을 때), 목적지 좌표(목적지 전용 지도 링크), 도착·출발 시각, 유형
//
// 순수 함수 계층이다. 네트워크·저장소·브라우저 API 를 쓰지 않는다.

import { KST_OFFSET_MIN, isClockTime, isDateString, lodgingForDate, parseInstantMs, stayDates } from '../stay/index.js';
import { GUARDIAN_ERROR, GuardianError } from './errors.js';

export const GUARDIAN_SNAPSHOT_VERSION = 1;
/** 긴급 번호 — 스냅샷 입력과 무관하게 항상 이 값이다 (spec 4.11, 4.15) */
export const EMERGENCY_NUMBERS = Object.freeze(['119', '1330']);
/** 병원 복귀 장소의 일반 라벨. 화면이 사용자 언어로 바꿔 보여 준다 */
export const HOSPITAL_RETURN_LABEL = '병원';
/** 스냅샷 언어 (spec 4.17) */
export const GUARDIAN_LANGS = Object.freeze(['ko', 'en', 'ja', 'zh']);
/** 만료 = 출국일의 이 시각(KST) */
const EXPIRES_AT_CLOCK = '23:59';

const RETURN_PLACES = Object.freeze(['LODGING', 'HOSPITAL']);

/**
 * @typedef {object} GuardianStop  spec 5.2 Stop 에서 보호자에게 필요한 것만 남긴 것.
 *   내부 id·이미지·라벨(식이 신호 DIET_ESTIMATED·ORDER_CARD 포함)·이동·보행·실내·식사 표시는 옮기지 않는다
 * @property {string|null} title    표시 언어 이름
 * @property {string|null} address  표시 언어 주소
 * @property {{title: string|null, address: string|null}} [ko]  한국어 원문 — 있을 때만 (이동 카드용)
 * @property {number|null} lat      목적지 좌표 (목적지 전용 지도 링크용)
 * @property {number|null} lng
 * @property {string|null} arriveAt
 * @property {string|null} leaveAt
 * @property {string|null} category
 */

/**
 * @typedef {object} GuardianOuting  spec 5.2 Outing 에서 deadlineReason 을 뺀 것.
 *   id 는 입력 id 를 옮기지 않고 `${date}:G:${순번}` 으로 새로 만든다
 * @property {string} id
 * @property {string|null} departAt
 * @property {string|null} returnBy
 * @property {'LODGING'|'HOSPITAL'|null} returnPlace
 * @property {string|null} latestDepartureAt
 * @property {number|null} slackMin
 * @property {number|null} walkTotalMin
 * @property {number|null} travelTotalMin
 * @property {GuardianStop[]} stops
 */

/**
 * @typedef {object} GuardianSnapshot  spec 5.4
 * @property {1} v
 * @property {string} createdAt  ISO8601 (KST 표기)
 * @property {string} expiresAt  출국일 23:59 KST
 * @property {'ko'|'en'|'ja'|'zh'} lang
 * @property {Array<{date: string, escortRequired: boolean, guardianSoloAllowed: boolean,
 *   patientReturn: Array<{by: string, placeName: string|null, placeAddress: string|null}>,
 *   guardianOutings: GuardianOuting[]}>} days
 * @property {['119', '1330']} emergency
 */

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function listOf(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function str(value) {
  return typeof value === 'string' ? value : null;
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clock(value) {
  return isClockTime(value) ? value : null;
}

function oneOf(value, allowed) {
  return allowed.includes(value) ? value : null;
}

/**
 * 시각 입력 → ms. 없으면 지금. Date·ms·ISO8601 문자열(시간대 표기가 없으면 KST)을 받는다.
 * @param {Date|number|string|undefined} value
 * @returns {number}
 */
export function toInstantMs(value, name = 'now') {
  let ms = null;
  if (value === undefined) ms = Date.now();
  else if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'number') ms = value;
  else if (typeof value === 'string') ms = parseInstantMs(value);
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw new TypeError(`${name}: 시각 형식이 올바르지 않습니다`);
  return ms;
}

function kstShift(ms) {
  return new Date(ms + KST_OFFSET_MIN * 60 * 1000).toISOString();
}

/** ms → "YYYY-MM-DDTHH:MM:SS+09:00" (초 단위) */
function toKstIso(ms) {
  return `${kstShift(ms).slice(0, 19)}+09:00`;
}

/** ms → KST 날짜 "YYYY-MM-DD" */
function kstDate(ms) {
  return kstShift(ms).slice(0, 10);
}

function copyStop(stop) {
  const out = { title: str(stop.title), address: str(stop.address) };
  if (isObject(stop.ko)) {
    const ko = { title: str(stop.ko.title), address: str(stop.ko.address) };
    if (ko.title !== null || ko.address !== null) out.ko = ko;
  }
  out.lat = num(stop.lat);
  out.lng = num(stop.lng);
  out.arriveAt = clock(stop.arriveAt);
  out.leaveAt = clock(stop.leaveAt);
  out.category = str(stop.category);
  return out;
}

/** 보호자 외출 — deadlineReason 을 옮기지 않는다. id 는 날짜·순번으로 새로 만든다 */
function copyGuardianOutings(outings, date) {
  return listOf(outings).map((o, index) => ({
    id: `${date}:G:${index + 1}`,
    departAt: clock(o.departAt),
    returnBy: clock(o.returnBy),
    returnPlace: oneOf(o.returnPlace, RETURN_PLACES),
    latestDepartureAt: clock(o.latestDepartureAt),
    slackMin: num(o.slackMin),
    walkTotalMin: num(o.walkTotalMin),
    travelTotalMin: num(o.travelTotalMin),
    stops: listOf(o.stops).map(copyStop),
  }));
}

/** 환자 복귀 항목. 복귀 시각이 없으면 항목을 만들지 않는다. 병원 라벨이면 주소는 언제나 null */
function copyPatientReturns(entries) {
  return listOf(entries)
    .filter((e) => isClockTime(e.by))
    .map((e) => {
      const placeName = str(e.placeName);
      return { by: e.by, placeName, placeAddress: placeName === HOSPITAL_RETURN_LABEL ? null : str(e.placeAddress) };
    });
}

/** 하루의 두 표시를 한 규칙으로 맞춘다: 동행이 필요하면 단독 외출은 불가, 단독 외출이 불가하면 보호자 외출 없음 */
function finishDay({ date, escortRequired, guardianSoloAllowed, patientReturn, guardianOutings }) {
  const soloAllowed = guardianSoloAllowed && !escortRequired;
  return {
    date,
    escortRequired,
    guardianSoloAllowed: soloAllowed,
    patientReturn: copyPatientReturns(patientReturn),
    guardianOutings: soloAllowed ? copyGuardianOutings(guardianOutings, date) : [],
  };
}

/**
 * 예/아니오 제한 항목의 값을 하루 일정의 합성 결과(`DayPlan.effective`)에서 읽는다.
 * - 'NONE'(아니오) → 제한 없음
 * - 'SET'(예), 알 수 없는 값 → 제한
 * - 항목 자체가 없음: 적용 기간이 없는 `FREE` 날이면 제한 없음, 그 밖(`NEEDS_INPUT`, 일정 없음 등)은 제한
 *   — 모르는 것을 허용으로 바꾸지 않는다(spec 9.1, 4.4 '모르겠음' 기본값과 같은 방향)
 */
function restrictionFlag(dayPlan, key) {
  const entry = isObject(dayPlan?.effective) ? dayPlan.effective[key] : undefined;
  if (entry === undefined) return dayPlan?.coverage !== 'FREE';
  return entry?.value?.kind !== 'NONE';
}

function lodgingOf(stay, date, dayPlan) {
  const lodgings = listOf(stay.lodgings);
  const byId = typeof dayPlan?.lodgingId === 'string' ? lodgings.find((l) => l.id === dayPlan.lodgingId) : undefined;
  return byId ?? lodgingForDate(stay, date);
}

/** 환자 외출의 복귀 장소 → 이름·주소. 숙소가 아니면(병원, 알 수 없는 값) 일반 라벨만 담는다 */
function returnPlaceOf(returnPlace, lodging) {
  if (returnPlace === 'LODGING') {
    return { placeName: str(lodging?.name), placeAddress: isObject(lodging?.address) ? str(lodging.address.roadAddress) : null };
  }
  return { placeName: HOSPITAL_RETURN_LABEL, placeAddress: null };
}

function buildDay(stay, date, dayPlan) {
  const escortRequired = restrictionFlag(dayPlan, 'escortRequired');
  const guardianMustStay = restrictionFlag(dayPlan, 'guardianMustStay');
  const lodging = lodgingOf(stay, date, dayPlan);
  return finishDay({
    date,
    escortRequired,
    // spec 4.7 보호자 일정 조건 중 조건 쪽 세 가지: 동반 보호자 있음, 곁을 지킬 필요 없음, 동행 필수 아님
    guardianSoloAllowed: stay.hasCompanion === true && !escortRequired && !guardianMustStay,
    patientReturn: listOf(dayPlan?.outings).map((o) => ({ by: o.returnBy, ...returnPlaceOf(o.returnPlace, lodging) })),
    guardianOutings: dayPlan?.guardianOutings,
  });
}

/**
 * 체류와 전체 일정으로 보호자 스냅샷을 만든다 (spec 4.11, 5.4).
 *
 * - 날짜: 만든 날(`now` 의 KST 날짜)부터 출국일까지의 체류 날짜. 입국 전에 만들면 입국일부터다.
 *   일정이 없는 날짜도 담고, 모르는 조건은 엄격한 값으로 둔다.
 * - 환자 복귀: 그날 환자 외출마다 {복귀 마감, 장소 이름, 장소 주소}. 숙소면 그날 숙소 이름·도로명주소,
 *   병원이면 '병원' + null.
 * - 보호자 외출: 단독 외출이 가능한 날에만 옮긴다.
 *
 * @param {object} args
 * @param {import('../stay/stay.js').Stay} args.stay
 * @param {{lang?: string, days: Record<string, object>}} args.tripPlan  spec 5.1 TripPlan
 * @param {Date|number|string} [args.now]  만든 시각. 없으면 지금
 * @param {'ko'|'en'|'ja'|'zh'} [args.lang]  없으면 tripPlan.lang
 * @returns {GuardianSnapshot}
 */
export function buildGuardianSnapshot({ stay, tripPlan, now, lang } = {}) {
  if (!isObject(stay) || !isDateString(stay.arrival?.date) || !isDateString(stay.departure?.date)) {
    throw new TypeError('buildGuardianSnapshot: 체류(입국·출국 날짜)가 필요합니다');
  }
  if (stay.departure.date < stay.arrival.date) throw new TypeError('buildGuardianSnapshot: 출국일이 입국일보다 빠릅니다');
  if (!isObject(tripPlan) || !isObject(tripPlan.days)) throw new TypeError('buildGuardianSnapshot: 전체 일정(days)이 필요합니다');
  const snapshotLang = lang ?? tripPlan.lang;
  if (!GUARDIAN_LANGS.includes(snapshotLang)) throw new TypeError('buildGuardianSnapshot: 지원하지 않는 언어입니다');
  const createdMs = toInstantMs(now, 'now');
  const firstDate = kstDate(createdMs);

  const days = stayDates(stay)
    .filter((date) => date >= firstDate)
    .map((date) => {
      const dayPlan = Object.hasOwn(tripPlan.days, date) && isObject(tripPlan.days[date]) ? tripPlan.days[date] : undefined;
      return buildDay(stay, date, dayPlan);
    });

  return {
    v: GUARDIAN_SNAPSHOT_VERSION,
    createdAt: toKstIso(createdMs),
    expiresAt: `${stay.departure.date}T${EXPIRES_AT_CLOCK}:00+09:00`,
    lang: snapshotLang,
    days,
    emergency: [...EMERGENCY_NUMBERS],
  };
}

/**
 * 스냅샷 모양의 값에 허용 목록을 다시 적용한다. 암호화 직전과 복호화 직후에 쓴다 —
 * 손으로 만든 스냅샷이나 다른 곳에서 만든 링크에 섞인 필드도 들어오지 못한다.
 * 만든 날(createdAt 의 KST 날짜)보다 이른 날짜는 버린다. 만든 스냅샷은 정규화해도 그대로다.
 *
 * @param {unknown} snapshot
 * @returns {GuardianSnapshot}
 * @throws {GuardianError} INVALID_SNAPSHOT — 버전·시각·언어·날짜 형식이 틀림
 */
export function normalizeGuardianSnapshot(snapshot) {
  const invalid = (field) => new GuardianError(GUARDIAN_ERROR.INVALID_SNAPSHOT, `보호자 스냅샷 형식이 올바르지 않습니다 (${field})`);
  if (!isObject(snapshot)) throw invalid('snapshot');
  if (snapshot.v !== GUARDIAN_SNAPSHOT_VERSION) throw invalid('v');
  const createdMs = typeof snapshot.createdAt === 'string' ? parseInstantMs(snapshot.createdAt) : null;
  if (createdMs === null) throw invalid('createdAt');
  if (typeof snapshot.expiresAt !== 'string' || parseInstantMs(snapshot.expiresAt) === null) throw invalid('expiresAt');
  if (!GUARDIAN_LANGS.includes(snapshot.lang)) throw invalid('lang');
  if (!Array.isArray(snapshot.days)) throw invalid('days');

  const firstDate = kstDate(createdMs);
  snapshot.days.forEach((d, index) => {
    if (!isObject(d) || !isDateString(d.date)) throw invalid(`days[${index}].date`);
  });
  const days = snapshot.days
    .filter((d) => d.date >= firstDate)
    .map((d) =>
      finishDay({
        date: d.date,
        // 불리언이 아니면 엄격한 쪽으로 읽는다
        escortRequired: d.escortRequired !== false,
        guardianSoloAllowed: d.guardianSoloAllowed === true,
        patientReturn: d.patientReturn,
        guardianOutings: d.guardianOutings,
      }),
    );

  return {
    v: GUARDIAN_SNAPSHOT_VERSION,
    createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
    lang: snapshot.lang,
    days,
    emergency: [...EMERGENCY_NUMBERS],
  };
}

/**
 * 만료됐는가 (spec 4.11: 만료 시각이 지나면 표시하지 않고 삭제한다).
 * 만료 시각 **그 순간부터** 만료다. 만료 시각을 읽을 수 없으면 만료로 본다(보여 주지 않는 쪽).
 * @param {{expiresAt?: string} | null | undefined} snapshot
 * @param {Date|number|string} [now]  없으면 지금
 * @returns {boolean}
 * @throws {TypeError} now 형식이 틀림
 */
export function isSnapshotExpired(snapshot, now) {
  const nowMs = toInstantMs(now, 'now');
  const expiresMs = typeof snapshot?.expiresAt === 'string' ? parseInstantMs(snapshot.expiresAt) : null;
  if (expiresMs === null) return true;
  return nowMs >= expiresMs;
}
