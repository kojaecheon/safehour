// 보호자 링크 PIN 잠금 저장소 (AX-320 · spec 4.11, 4.19, 규칙 37·41)
//
// createPinLockout(src/guardian)은 저장소를 주입받는다. 이 모듈이 그 저장소를 만든다.
//   - 키는 기기 저장소 접두사 `safehour.v2.` 아래 기기 구역에 둔다:
//       safehour.v2.device.guardianPinLock.<SHA-256(암호문)>
//     '이 기기에서 내 정보 지우기'는 `safehour.v2.` 아래 영구 키를 언어만 빼고 모두 지우므로 잠금 기록도 함께 지워진다.
//     키·값에는 암호문이 없다(암호문의 SHA-256 만 — src/guardian/lockout.js).
//   - 계정이 아니라 **기기** 단위다(spec: '그 기기에서 그 링크를 1시간 잠근다').
//   - 영구 저장소가 없거나 쓰기가 막히면(사생활 보호 모드·할당량) 이 화면의 메모리에 둔다 —
//     잠금이 저장소 오류로 풀리지 않게 한다. 영구 저장소에 쓰는 데 성공하면 메모리 사본은 지운다
//     (다른 곳에서 영구 기록을 지우면 잠금도 풀린다).
//   - 이 잠금은 화면에서의 추측을 늦추는 장치다. 암호학적 보호가 아니다(화면에 밝힌다).
//
// 순수 모듈이다 — 브라우저 저장소는 호출하는 쪽이 넘긴다.

import { createPinLockout } from '../../src/guardian/index.js';
import { STORE_PREFIX } from '../../lib/store/keys.js';

export const GUARDIAN_PIN_LOCK_PREFIX = `${STORE_PREFIX}device.guardianPinLock.`;

function requireKey(key) {
  if (typeof key !== 'string' || !key.startsWith(GUARDIAN_PIN_LOCK_PREFIX)) {
    throw new TypeError('PIN 잠금 저장소는 잠금 기록 키만 다룹니다');
  }
}

/**
 * Web Storage 모양의 잠금 기록 저장소.
 * @param {Storage | null | undefined} storage  브라우저: localStorage (쓸 수 없으면 null)
 * @returns {{getItem: (key: string) => string|null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void}}
 */
export function createLockoutStorage(storage) {
  /** 영구 저장소에 쓰지 못한 기록 */
  const memory = new Map();

  return Object.freeze({
    getItem(key) {
      requireKey(key);
      if (storage) {
        try {
          const value = storage.getItem(key);
          if (typeof value === 'string') return value;
        } catch {
          // 읽기가 막혀 있으면 메모리 기록만 본다
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      requireKey(key);
      const text = String(value);
      if (storage) {
        try {
          storage.setItem(key, text);
          memory.delete(key);
          return;
        } catch {
          // 아래 메모리 기록으로 대신한다
        }
      }
      memory.set(key, text);
    },
    removeItem(key) {
      requireKey(key);
      memory.delete(key);
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // 지우지 못해도 메모리 기록은 지웠다
      }
    },
  });
}

/**
 * 보호자 링크 PIN 잠금 기록기 — 5회 연속 오류 후 1시간(DEFAULTS.guardianPin).
 * @param {Storage | null | undefined} storage
 * @param {{maxAttempts?: number, lockMs?: number, now?: () => number}} [options]
 */
export function createGuardianLockout(storage, options = {}) {
  return createPinLockout(createLockoutStorage(storage), { ...options, keyPrefix: GUARDIAN_PIN_LOCK_PREFIX });
}
