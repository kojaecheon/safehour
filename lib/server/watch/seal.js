// 구독 봉인 (ADR-0012 · 계획 작업 2)
//
// 보호자 구독(endpoint, p256dh, auth, lang)은 저장소에 원문으로 두지 않는다. AES-256-GCM 으로 감싸
// 'v1.' + base64url(iv 12바이트 | 암호문 | 태그 16바이트) 문자열로 저장한다.
// 여는 쪽은 키 목록([현재, 이전?])을 차례로 시도한다. 키를 바꾼 뒤에도 이전 키로 봉인한 구독이 열린다.
// openJson 은 던지지 않는다. 못 열면 null 이고, 그 구독은 없는 것으로 다룬다.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1.';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const B64URL = /^[A-Za-z0-9_-]+$/;

function isKey(key) {
  return Buffer.isBuffer(key) && key.length === 32;
}

/** 값 → 봉인 문자열. key 는 32바이트 Buffer */
export function sealJson(value, key) {
  if (!isKey(key)) throw new TypeError('봉인 키는 32바이트여야 합니다.');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

/** 봉인 문자열 → 객체. 형식이 틀리거나 어느 키로도 열리지 않거나 객체가 아니면 null */
export function openJson(sealed, keys) {
  if (typeof sealed !== 'string' || !sealed.startsWith(PREFIX) || !Array.isArray(keys)) return null;
  const text = sealed.slice(PREFIX.length);
  if (!B64URL.test(text)) return null;
  const raw = Buffer.from(text, 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  for (const key of keys) {
    if (!isKey(key)) continue;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      const value = JSON.parse(plain);
      return value !== null && typeof value === 'object' ? value : null;
    } catch {
      // 다음 키를 시도한다
    }
  }
  return null;
}
