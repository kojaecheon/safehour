// 서버 알림 키 유도, 형식 정규식, Redis 키 이름 (ADR-0012 · 계획 작업 2)
//
// 저장소에는 원래 식별 값을 그대로 두지 않는다. watchId·계정 키·횟수 제한 주체·중복 제거 id·푸시 Topic 은
// 모두 SAFEHOUR_WATCH_OWNER_SECRET 으로 만든 HMAC 이고, 쓰기 토큰은 SHA-256 해시만 둔다.
// HMAC 입력은 '<문맥>\n' + 값들을 '\n' 으로 이은 것이다. 문맥이 달라 같은 값도 용도마다 다른 결과가 나온다.
// 형식 검증을 거친 값(base64url, 날짜, 시각)에는 '\n' 이 없으므로 값 경계가 섞이지 않는다.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WATCH_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const WRITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const SUB_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const WATCH_KEY_RE = /^[A-Za-z0-9_-]{43}$/;

const CONTEXT = Object.freeze({
  watch: 'watch/v1',
  owner: 'watch-owner/v1',
  rate: 'rate/v1',
  dedup: 'dedup/v1',
  topic: 'topic/v1',
});

function hmac(secret, context, values) {
  return createHmac('sha256', secret).update(`${context}\n${values.map(String).join('\n')}`).digest();
}

/** watchId → 저장 키 (43자) */
export function watchKeyOf(watchId, secret) {
  return hmac(secret, CONTEXT.watch, [watchId]).toString('base64url');
}

/** 계정 키 → 소유자 해시 (43자) */
export function ownerHashOf(accountKey, secret) {
  return hmac(secret, CONTEXT.owner, [accountKey]).toString('base64url');
}

/** 쓰기 토큰 → 저장할 해시 (43자). 토큰 자체가 32바이트 무작위 값이라 비밀 없이 SHA-256 으로 충분하다 */
export function writeHashOf(writeToken) {
  return createHash('sha256').update(String(writeToken)).digest('base64url');
}

/** 두 식별 문자열이 같은가. 길이를 먼저 보고 timingSafeEqual 로 비교한다. 던지지 않는다 */
export function idMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** 받은 쓰기 토큰이 저장된 해시와 맞는가. 던지지 않는다 */
export function tokenMatches(writeToken, writeHash) {
  if (typeof writeToken !== 'string' || typeof writeHash !== 'string') return false;
  return idMatches(writeHashOf(writeToken), writeHash);
}

/** 횟수 제한 키. 주체(계정 키, watchKey 등)가 키 이름에 그대로 들어가지 않는다. 항목·주체가 빈 문자열이면 던진다 */
export function rateKeyOf({ bucket, subject }, secret) {
  if (typeof bucket !== 'string' || bucket === '' || typeof subject !== 'string' || subject === '') {
    throw new TypeError('횟수 제한 항목과 주체는 빈 문자열이 아니어야 합니다.');
  }
  return hmac(secret, CONTEXT.rate, [bucket, subject]).toString('base64url');
}

/** 예약 중복 제거 id (43자) */
export function dedupIdOf({ watchKey, date, time }, secret) {
  return hmac(secret, CONTEXT.dedup, [watchKey, date, time]).toString('base64url');
}

/** 푸시 Topic (32자). 날짜·시각이 푸시 서비스에 그대로 보이지 않게 HMAC 앞 24바이트만 쓴다 */
export function topicOf({ watchKey, date, time }, secret) {
  return hmac(secret, CONTEXT.topic, [watchKey, date, time]).subarray(0, 24).toString('base64url');
}

/** 새 구독 id (22자) */
export function newSubId() {
  return randomBytes(16).toString('base64url');
}

const NAMESPACES = new Set(['prod', 'prev', 'dev']);

/** Redis 키 이름. ns 는 'prod'·'prev'·'dev' 중 하나 */
export function redisKeys(ns) {
  if (!NAMESPACES.has(ns)) throw new TypeError('저장소 이름공간이 올바르지 않습니다.');
  const p = `sh:${ns}`;
  return Object.freeze({
    watch: (wk) => `${p}:w:${wk}`,
    sub: (wk) => `${p}:s:${wk}`,
    day: (wk, date) => `${p}:d:${wk}:${date}`,
    owner: (oh) => `${p}:o:${oh}`,
    index: (date) => `${p}:x:${date}`,
    rate: (rk, window) => `${p}:r:${rk}:${window}`,
  });
}
