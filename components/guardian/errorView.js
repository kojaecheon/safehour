// 보호자 링크 오류 → 사용자 문구 키, 한국 시각 도우미, 사본 id (AX-320 · docs/business-rules.md '보호자')
//
// 순수 모듈이다. 오류 메시지·암호문·PIN 을 화면 문구에 옮기지 않는다 — 코드로만 문구를 고른다.
// 시각은 언어와 무관하게 한국 시각(KST)이다(lib/format.js 와 같은 원칙).

import { GUARDIAN_ERROR, GuardianError } from '../../src/guardian/index.js';
import { DEFAULTS, KST_OFFSET_MIN } from '../../src/stay/index.js';

const KST_SHIFT_MS = KST_OFFSET_MIN * 60 * 1000;

function kstIso(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return new Date(ms + KST_SHIFT_MS).toISOString();
}

/** ms → 한국 시각 'HH:MM' (형식이 틀리면 null) */
export function kstClock(ms) {
  return kstIso(ms)?.slice(11, 16) ?? null;
}

/** ms → 한국 날짜 'YYYY-MM-DD' (형식이 틀리면 null) */
export function kstDate(ms) {
  return kstIso(ms)?.slice(0, 10) ?? null;
}

/**
 * 'YYYY-MM-DD' → 화면 날짜 라벨(예: 10월 4일 (일), Sun 4 October). 날짜 자체를 그리므로 시간대를 옮기지 않는다.
 * @param {string} date
 * @param {string} locale  Intl 로케일(useLang().locale)
 */
export function dateLabel(date, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return String(date ?? '');
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(at);
  } catch {
    return date;
  }
}

/**
 * 오류 → { key, vars, locked }. key 는 guardian 이름공간 문구 키다.
 * @param {unknown} error
 * @param {{lockMin?: number}} [options]  잠금 시간(분) — 남은 횟수 안내에 쓴다
 */
export function guardianErrorView(error, { lockMin = DEFAULTS.guardianPin.lockMin } = {}) {
  const code = error instanceof GuardianError ? error.code : null;
  const lockedView = (lockedUntil) => {
    const time = kstClock(lockedUntil);
    return time === null
      ? { key: 'guardian.errLockedLater', vars: { minutes: lockMin }, locked: true }
      : { key: 'guardian.errLocked', vars: { time }, locked: true };
  };
  switch (code) {
    case GUARDIAN_ERROR.WRONG_PIN:
      if (error.remainingAttempts === 0 || (typeof error.lockedUntil === 'number' && Number.isFinite(error.lockedUntil))) {
        return lockedView(error.lockedUntil);
      }
      return { key: 'guardian.errWrongPin', vars: { n: error.remainingAttempts, minutes: lockMin }, locked: false };
    case GUARDIAN_ERROR.LOCKED:
      return lockedView(error.lockedUntil);
    case GUARDIAN_ERROR.EXPIRED:
      return { key: 'guardian.errExpired', vars: undefined, locked: false };
    case GUARDIAN_ERROR.INVALID_LINK:
    case GUARDIAN_ERROR.INVALID_SNAPSHOT:
      return { key: 'guardian.errInvalidLink', vars: undefined, locked: false };
    case GUARDIAN_ERROR.UNSUPPORTED_FORMAT:
      return { key: 'guardian.errUnsupported', vars: undefined, locked: false };
    case GUARDIAN_ERROR.CRYPTO_UNAVAILABLE:
      return { key: 'guardian.errCrypto', vars: undefined, locked: false };
    case GUARDIAN_ERROR.INVALID_PIN:
      return { key: 'guardian.errPinFormat', vars: undefined, locked: false };
    default:
      return { key: 'guardian.errUnknown', vars: undefined, locked: false };
  }
}

/**
 * 가져온 사본의 id — 암호문의 SHA-256(16진수 64자). 같은 링크를 다시 열면 같은 사본을 덮어쓴다.
 * 암호문 자체는 저장 키에 쓰지 않는다.
 * @param {string} fragment
 * @returns {Promise<string>}
 */
export async function copyIdFor(fragment) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new GuardianError(GUARDIAN_ERROR.CRYPTO_UNAVAILABLE, '표준 암호 기능을 쓸 수 없습니다');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(fragment));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
