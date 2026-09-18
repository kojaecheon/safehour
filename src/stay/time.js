// 날짜·시각 도우미 (AX-302)
//
// 모든 시각은 한국 표준시(KST, UTC+9, 서머타임 없음)다.
// 날짜는 "YYYY-MM-DD", 시각은 "HH:MM" 문자열로 다룬다. 기기 시간대에 흔들리지 않도록
// 날짜 계산은 UTC 달력으로만 하고, 절대 시각이 필요할 때만 KST 오프셋을 더한다.

const DAY_MS = 24 * 60 * 60 * 1000;
export const KST_OFFSET_MIN = 9 * 60;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function dateParts(value) {
  const m = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const back = new Date(utc);
  // 2026-02-30 같은 존재하지 않는 날짜를 거른다
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return { y, mo, d, utc };
}

/** 달력에 있는 "YYYY-MM-DD" 인가 */
export function isDateString(value) {
  return dateParts(value) !== null;
}

/** "HH:MM" 24시간 표기인가 */
export function isClockTime(value) {
  return typeof value === 'string' && CLOCK_RE.test(value);
}

/** "HH:MM" → 자정부터의 분. 형식이 틀리면 TypeError */
export function toMinutes(time) {
  const m = typeof time === 'string' ? CLOCK_RE.exec(time) : null;
  if (!m) throw new TypeError(`시각 형식이 올바르지 않습니다: ${String(time)}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 분 → "HH:MM". 하루 밖 값은 00:00–23:59 로 자른다 */
export function fromMinutes(min) {
  const clamped = Math.min(Math.max(Math.floor(min), 0), 24 * 60 - 1);
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function requireDate(value) {
  const parts = dateParts(value);
  if (!parts) throw new TypeError(`날짜 형식이 올바르지 않습니다: ${String(value)}`);
  return parts;
}

function formatUtcDate(utc) {
  return new Date(utc).toISOString().slice(0, 10);
}

/** 날짜 + n일 */
export function addDays(date, n) {
  return formatUtcDate(requireDate(date).utc + n * DAY_MS);
}

/** to − from (일) */
export function diffDays(from, to) {
  return Math.round((requireDate(to).utc - requireDate(from).utc) / DAY_MS);
}

/** start 부터 end 까지(양끝 포함) 날짜 목록. start > end 이면 빈 배열 */
export function eachDate(start, end) {
  const out = [];
  const last = requireDate(end).utc;
  for (let t = requireDate(start).utc; t <= last; t += DAY_MS) out.push(formatUtcDate(t));
  return out;
}

/** KST 날짜·시각 → 절대 시각(ms) */
export function kstInstantMs(date, time) {
  return requireDate(date).utc + (toMinutes(time) - KST_OFFSET_MIN) * 60 * 1000;
}

/** 시각 문자열에 시간대 표기(Z 또는 ±HH:MM)가 있는가 */
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * ISO8601 문자열 → ms. 읽을 수 없으면 null.
 * 시간대 표기가 없는 날짜·시각은 실행 기기의 시간대가 아니라 **KST** 로 읽는다 —
 * 모든 시각은 KST 기준이라는 명세 규칙을 기기 설정과 무관하게 지키기 위해서다.
 */
export function parseInstantMs(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  const normalized = DATE_TIME.test(text) && !HAS_OFFSET.test(text) ? `${text}+09:00` : text;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}
