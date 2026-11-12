// 보호자 스냅샷 PIN 암호화 (AX-313 · docs/security.md '보호자 링크')
//
// 표준 브라우저 암호 기능(Web Crypto, `globalThis.crypto.subtle`)만 쓴다. 새 라이브러리는 없다(docs/standards.md '의존성').
// Node 20+ 와 브라우저(보안 컨텍스트: https·localhost)에서 같은 코드로 동작한다.
//
// - 키 유도: PBKDF2-HMAC-SHA-256, 무작위 salt 16바이트, 반복 PBKDF2_ITERATIONS 회 → AES-GCM 256비트 키
// - 인증 암호화: AES-GCM, 무작위 IV 12바이트, 태그 128비트
// - 암호문(링크의 # 뒤) = base64url( salt(16) | iv(12) | ciphertext+tag ), 패딩 없음
// - 평문 = 형식 표지 1바이트 + (deflate-raw 로 압축한) 정규 JSON — encoding.js 참고
//
// 한계: 화면에 밝힌다(docs/security.md '보호자 링크'): 6자리 PIN 은 경우의 수가 100만뿐이라, 암호문을 손에 넣은 사람이
// 기기 밖에서 전수 대입하면 풀 수 있다. 반복 횟수는 그 비용을 키울 뿐이다. 이 암호화는 **우연한 열람을 막는 수준**이며,
// 기기 안의 5회 잠금(lockout.js)은 화면에서의 추측만 늦춘다. PIN 은 링크와 다른 경로로 알려야 한다.

import { decodeSnapshotPlaintext, encodeSnapshotPlaintext } from './encoding.js';
import { GUARDIAN_ERROR, GuardianError } from './errors.js';
import { normalizeGuardianSnapshot } from './snapshot.js';

export const PIN_LENGTH = 6;
const PIN_RE = /^[0-9]{6}$/;

/**
 * PBKDF2 반복 횟수 — 600,000 회.
 *
 * 근거: OWASP Password Storage Cheat Sheet(2023~)의 PBKDF2-HMAC-SHA256 권장값이 600,000 회다.
 * 비용: 데스크톱 Node 에서 키 유도 1회 약 65ms. 저사양 휴대폰 브라우저는 수십 배 느릴 수 있어
 * 1회 약 0.5–1.5초로 본다. 링크를 만들 때 1번, 보호자가 PIN 을 입력할 때마다 1번 유도하므로
 * 이 지연은 받아들일 수 있다(풀린 사본은 기기에 저장되어 다시 풀지 않는다).
 * 20만 회 아래로 낮추지 않는다. 바꾸면 기존 링크를 풀 수 없다(암호문에 반복 횟수를 담지 않는다).
 */
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
const TAG_BITS = 128;
export const TAG_BYTES = TAG_BITS / 8;
const KEY_BITS = 256;
/** 가장 짧은 암호문: salt + iv + 평문 1바이트 이상 + 태그 (평문이 표지만이면 풀어도 INVALID_SNAPSHOT) */
const MIN_PAYLOAD_BYTES = SALT_BYTES + IV_BYTES + 1 + TAG_BYTES;
/** 비정상적으로 긴 입력을 거른다(문자 수). 45박 체류의 스냅샷도 이보다 훨씬 작다 */
const MAX_FRAGMENT_CHARS = 2_000_000;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** 정확히 6자리 ASCII 숫자 문자열인가 (앞자리 0 허용, 숫자형·전각·다른 문자 체계 숫자 거부) */
export function isValidPin(pin) {
  return typeof pin === 'string' && PIN_RE.test(pin);
}

/**
 * 보호자 링크 암호문 형식인가 — base64url 문자만, 패딩 없음, 최소 길이 이상.
 * 복호화하지 않고 모양만 본다.
 */
export function isGuardianFragment(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FRAGMENT_CHARS) return false;
  if (!BASE64URL_RE.test(value) || value.length % 4 === 1) return false;
  return Math.floor((value.length * 3) / 4) >= MIN_PAYLOAD_BYTES;
}

function webCrypto() {
  const c = globalThis.crypto;
  if (!c?.subtle || typeof c.getRandomValues !== 'function') {
    throw new GuardianError(GUARDIAN_ERROR.CRYPTO_UNAVAILABLE, '표준 암호 기능을 쓸 수 없습니다(보안 연결이 필요합니다)');
  }
  return c;
}

function requirePin(pin) {
  if (!isValidPin(pin)) throw new GuardianError(GUARDIAN_ERROR.INVALID_PIN, 'PIN 은 6자리 숫자여야 합니다');
}

const CHUNK = 0x8000;

/** 바이트 → base64url (패딩 없음) */
export function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → 바이트. 형식 검사는 호출하는 쪽(isGuardianFragment)이 먼저 한다 */
export function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(c, pin, salt, usage) {
  const material = await c.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    [usage],
  );
}

/**
 * 스냅샷을 PIN 으로 암호화해 링크의 # 뒤에 담을 암호문을 만든다.
 * 암호화 전에 허용 목록을 다시 적용하고(normalizeGuardianSnapshot), 쓸 수 있으면 deflate-raw 로 압축한다.
 * salt·IV 는 매번 새로 뽑는다.
 *
 * @param {import('./snapshot.js').GuardianSnapshot} snapshot
 * @param {string} pin  정확히 6자리 숫자
 * @returns {Promise<string>}  base64url(salt | iv | ciphertext)
 * @throws {GuardianError} INVALID_PIN · INVALID_SNAPSHOT · CRYPTO_UNAVAILABLE
 */
export async function encryptSnapshot(snapshot, pin) {
  requirePin(pin);
  const { bytes: plaintext } = await encodeSnapshotPlaintext(snapshot);
  const c = webCrypto();
  const salt = c.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(c, pin, salt, 'encrypt');
  const ciphertext = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: TAG_BITS }, key, plaintext));

  const payload = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length);
  payload.set(salt, 0);
  payload.set(iv, SALT_BYTES);
  payload.set(ciphertext, SALT_BYTES + IV_BYTES);
  return toBase64Url(payload);
}

/**
 * 암호문을 PIN 으로 푼다. 푼 뒤에도 허용 목록을 다시 적용한다.
 * 잠금(5회·1시간)은 여기서 세지 않는다 — 화면은 unlockSnapshot(unlock.js)을 쓴다.
 *
 * @param {string} fragment  링크의 # 뒤 (parseGuardianLink 결과)
 * @param {string} pin
 * @returns {Promise<import('./snapshot.js').GuardianSnapshot>}
 * @throws {GuardianError}
 *   INVALID_PIN(형식) · INVALID_LINK(암호문 형식) · WRONG_PIN(인증 실패: PIN 이 틀림 또는 암호문 변조) ·
 *   UNSUPPORTED_FORMAT(모르는 평문 표지, 압축 해제 불가) · INVALID_SNAPSHOT(풀었지만 스냅샷이 아님) · CRYPTO_UNAVAILABLE
 */
export async function decryptSnapshot(fragment, pin) {
  requirePin(pin);
  if (!isGuardianFragment(fragment)) {
    throw new GuardianError(GUARDIAN_ERROR.INVALID_LINK, '보호자 링크 형식이 올바르지 않습니다');
  }
  const bytes = fromBase64Url(fragment);
  if (bytes.length < MIN_PAYLOAD_BYTES) {
    throw new GuardianError(GUARDIAN_ERROR.INVALID_LINK, '보호자 링크 형식이 올바르지 않습니다');
  }
  const c = webCrypto();
  const salt = bytes.slice(0, SALT_BYTES);
  const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = bytes.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(c, pin, salt, 'decrypt');

  let plaintext;
  try {
    plaintext = await c.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: TAG_BITS }, key, ciphertext);
  } catch {
    throw new GuardianError(GUARDIAN_ERROR.WRONG_PIN, 'PIN 이 맞지 않습니다');
  }

  return normalizeGuardianSnapshot(await decodeSnapshotPlaintext(new Uint8Array(plaintext)));
}

/** 문자열의 SHA-256 (소문자 16진수) — 잠금 기록 키에 쓴다 */
export async function sha256Hex(text) {
  const digest = await webCrypto().subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
