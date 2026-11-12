// 보호자 링크 PIN 잠금 (AX-313 · docs/security.md '보호자 링크', docs/platform/ITINERARY_RULES.md '조정 가능한 기본값')
//
// PIN 이 5회 연속 틀리면 그 기기에서 그 링크를 1시간 잠근다(조정 가능: DEFAULTS.guardianPin).
// - 저장소는 인자로 주입받는다(Web Storage 모양: getItem·setItem·removeItem, 동기·비동기 모두).
//   이 모듈은 어떤 브라우저 저장소도 직접 쓰지 않는다.
// - 기록 키는 암호문 자체가 아니라 **암호문의 SHA-256** 이다. 기록 값에도 암호문을 담지 않는다.
// - 잠긴 동안의 시도는 세지 않고 잠금을 늘리지도 않는다. 잠금이 끝나면 처음부터 다시 센다.
// - 성공하면 기록을 지운다.
// - 기기 저장소는 사용자가 지울 수 있다. 이 잠금은 화면에서의 추측을 늦추는 장치이지 암호학적 보호가 아니다.

import { DEFAULTS } from '../stay/index.js';
import { sha256Hex } from './crypto.js';

export const PIN_LOCKOUT_KEY_PREFIX = 'safehour.guardianPinLock.';

/**
 * 잠금 기록 키 = 접두어 + SHA-256(암호문)
 * @param {string} fragment
 * @param {string} [keyPrefix]
 * @returns {Promise<string>}
 */
export async function pinLockoutKey(fragment, keyPrefix = PIN_LOCKOUT_KEY_PREFIX) {
  if (typeof fragment !== 'string' || fragment === '') throw new TypeError('pinLockoutKey: 암호문이 필요합니다');
  return `${keyPrefix}${await sha256Hex(fragment)}`;
}

/**
 * @typedef {object} PinLockStatus
 * @property {boolean} locked
 * @property {number} failures           연속 오류 횟수
 * @property {number} remainingAttempts  잠기기 전까지 남은 횟수
 * @property {number|null} lockedUntil   잠금이 풀리는 시각(ms), 잠기지 않았으면 null
 */

/**
 * @param {{getItem: Function, setItem: Function, removeItem: Function}} storage
 * @param {{maxAttempts?: number, lockMs?: number, now?: () => number, keyPrefix?: string}} [options]
 */
export function createPinLockout(
  storage,
  {
    maxAttempts = DEFAULTS.guardianPin.maxAttempts,
    lockMs = DEFAULTS.guardianPin.lockMin * 60 * 1000,
    now = Date.now,
    keyPrefix = PIN_LOCKOUT_KEY_PREFIX,
  } = {},
) {
  if (!storage || ['getItem', 'setItem', 'removeItem'].some((m) => typeof storage[m] !== 'function')) {
    throw new TypeError('createPinLockout: getItem·setItem·removeItem 이 있는 저장소가 필요합니다');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('createPinLockout: maxAttempts 는 1 이상의 정수여야 합니다');
  if (typeof lockMs !== 'number' || !Number.isFinite(lockMs) || lockMs <= 0) throw new TypeError('createPinLockout: lockMs 는 양수여야 합니다');
  if (typeof now !== 'function') throw new TypeError('createPinLockout: now 는 함수여야 합니다');

  function currentMs() {
    const t = now();
    if (typeof t !== 'number' || !Number.isFinite(t)) throw new TypeError('createPinLockout: now() 가 시각(ms)을 돌려주지 않습니다');
    return t;
  }

  async function read(key) {
    const raw = await storage.getItem(key);
    if (typeof raw !== 'string') return null;
    try {
      const record = JSON.parse(raw);
      const failures = record?.failures;
      const lockedUntil = record?.lockedUntil ?? null;
      if (!Number.isInteger(failures) || failures < 0) return null;
      if (lockedUntil !== null && (typeof lockedUntil !== 'number' || !Number.isFinite(lockedUntil))) return null;
      return { failures, lockedUntil };
    } catch {
      return null;
    }
  }

  function statusOf(record) {
    if (record?.lockedUntil !== null && record?.lockedUntil !== undefined) {
      return { locked: true, failures: Math.max(record.failures, maxAttempts), remainingAttempts: 0, lockedUntil: record.lockedUntil };
    }
    const failures = Math.min(record?.failures ?? 0, maxAttempts);
    return { locked: false, failures, remainingAttempts: maxAttempts - failures, lockedUntil: null };
  }

  /** 기록을 읽고, 잠금 시간이 지났으면 지운 뒤 처음 상태를 돌려준다 */
  async function load(key) {
    const record = await read(key);
    if (record?.lockedUntil !== null && record?.lockedUntil !== undefined && currentMs() >= record.lockedUntil) {
      await storage.removeItem(key);
      return null;
    }
    return record;
  }

  return Object.freeze({
    maxAttempts,
    lockMs,

    /** @param {string} fragment @returns {Promise<PinLockStatus>} */
    async status(fragment) {
      return statusOf(await load(await pinLockoutKey(fragment, keyPrefix)));
    },

    /** PIN 이 틀렸을 때 부른다. 잠긴 동안에는 아무것도 바꾸지 않는다. @returns {Promise<PinLockStatus>} */
    async recordFailure(fragment) {
      const key = await pinLockoutKey(fragment, keyPrefix);
      const record = await load(key);
      const current = statusOf(record);
      if (current.locked) return current;
      const failures = current.failures + 1;
      const next = { failures, lockedUntil: failures >= maxAttempts ? currentMs() + lockMs : null };
      await storage.setItem(key, JSON.stringify(next));
      return statusOf(next);
    },

    /** PIN 이 맞았을 때 부른다 — 기록을 지운다 */
    async recordSuccess(fragment) {
      await storage.removeItem(await pinLockoutKey(fragment, keyPrefix));
    },
  });
}
