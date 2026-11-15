// 보호자 서버 알림 요청 모양: 구독, 해지, 상태 조회, 오늘 함께 있음, 응답 읽기
// (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 1 · docs/contracts.md '서버 알림')
//
// 환자 쪽 요청 모양(./watchRequests.js)과 같은 규칙을 따르는 순수 모듈이다. 보내기는 ./watchSend.js 의 sendWatchRequest 다.
// 클라이언트는 lib/server 를 불러올 수 없어 서버 허용 목록(lib/server/watch/requests.js normalizeSubscribe 등)과 같은 형식 규칙을
// 여기 따로 둔다(허용 목록은 양쪽에 둔다). 같은지는 test/guardian-push-requests.test.js 가, 진짜 처리기를 통과하는지는
// test/watch-client-seam.test.js 가 본다.
//
// - 본문은 허용 목록 필드만 새로 만들어 담는다. 받은 객체를 펼치지 않는다. PushSubscription.toJSON() 의 expirationTime 과
//   그 밖의 필드는 싣지 않는다
// - 형식이 틀리면 TypeError 다. 메시지는 함수 이름과 필드 이름만 담고 값(식별 값, endpoint, 키)을 담지 않는다
// - 식별 값(watchId, subId)과 구독은 본문으로만 보낸다. 경로·쿼리에 싣지 않는다
// - endpoint 는 https: 이고 1~2048자다. 푸시 서비스 호스트 허용 목록은 서버가 본다(밖이면 field 없는 400)
// - p256dh 는 65바이트 비압축 점(첫 바이트 0x04), auth 는 16바이트다. 서버처럼 끝의 '=' 채움을 받아들이고, 본문에는 채움 없는
//   base64url 로 다시 적어 싣는다
// - 응답 읽기(read*)는 계약 모양일 때만 정해진 키로 새 객체를 만들고, 아니면 null 이다. 던지지 않는다
//
// 순수 함수다. 네트워크·저장소·브라우저 API 를 쓰지 않는다.

import { LANGS } from '../i18n/index.js';
import { isClockTime, isDateString } from '../stay/time.js';
import { fromBase64Url, toBase64Url } from './crypto.js';
import { WATCH_ID_RE, WATCH_UPLOAD_MAX_PER_DAY } from './watchRequests.js';

export const PUSH_PATHS = Object.freeze({
  subscribe: '/api/watch/subscribe',
  status: '/api/watch/status',
  mute: '/api/watch/mute',
});

/** 구독 id: 16바이트 base64url (서버 lib/server/watch/keys.js SUB_ID_RE 와 같다) */
export const SUB_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** endpoint 문자열 상한 (서버 lib/server/watch/requests.js 와 같다) */
export const MAX_ENDPOINT_CHARS = 2048;

/** 서버 decodedKey 와 같은 모양: base64url, 끝에 '=' 채움 0~2개 */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;
/** VAPID 공개키도 P-256 비압축 점(65바이트, 첫 바이트 0x04)이다 */
const VAPID_KEY_BYTES = 65;
const UNCOMPRESSED_POINT = 0x04;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);
const isSubId = (value) => typeof value === 'string' && SUB_ID_RE.test(value);

/** 고정 문장의 형식 오류. 함수 이름과 필드 이름만 담고 값은 담지 않는다(./watchRequests.js 와 같은 문장) */
function invalid(fn, field) {
  return new TypeError(`${fn}: ${field} 형식이 올바르지 않습니다`);
}

/**
 * base64url 키를 풀어 정확히 length 바이트(firstByte 가 있으면 첫 바이트까지)면 채움 없는 base64url 로 다시 적어 돌려준다.
 * 아니면 null. 서버 decodedKey 와 같은 판정이다.
 */
function canonicalKey(value, length, firstByte = null) {
  if (typeof value !== 'string' || !BASE64URL.test(value)) return null;
  const text = value.replace(/=+$/, '');
  if (text.length % 4 === 1) return null;
  let bytes;
  try {
    bytes = fromBase64Url(text);
  } catch {
    return null;
  }
  if (bytes.length !== length) return null;
  if (firstByte !== null && bytes[0] !== firstByte) return null;
  return toBase64Url(bytes);
}

/** https: 주소이고 1~2048자인가 */
function isHttpsEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_CHARS) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * POST /api/watch/subscribe: { watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang }
 * @param {{ watchId: string, subscription: { endpoint: string, keys: { p256dh: string, auth: string } }, lang: string }} input
 *   subscription 은 PushSubscription.toJSON() 모양이다
 */
export function subscribeRequest(input) {
  const fn = 'subscribeRequest';
  if (!isWatchId(input?.watchId)) throw invalid(fn, 'watchId');
  const subscription = input.subscription;
  if (!isPlainObject(subscription)) throw invalid(fn, 'subscription');
  if (!isHttpsEndpoint(subscription.endpoint)) throw invalid(fn, 'subscription.endpoint');
  const keys = subscription.keys;
  if (!isPlainObject(keys)) throw invalid(fn, 'subscription.keys');
  const p256dh = canonicalKey(keys.p256dh, P256DH_BYTES, UNCOMPRESSED_POINT);
  if (!p256dh) throw invalid(fn, 'subscription.keys.p256dh');
  const auth = canonicalKey(keys.auth, AUTH_BYTES);
  if (!auth) throw invalid(fn, 'subscription.keys.auth');
  if (!LANGS.includes(input.lang)) throw invalid(fn, 'lang');
  return {
    method: 'POST',
    path: PUSH_PATHS.subscribe,
    body: { watchId: input.watchId, subscription: { endpoint: subscription.endpoint, keys: { p256dh, auth } }, lang: input.lang },
  };
}

/** DELETE /api/watch/subscribe: { watchId, subId } */
export function unsubscribeRequest(input) {
  const fn = 'unsubscribeRequest';
  if (!isWatchId(input?.watchId)) throw invalid(fn, 'watchId');
  if (!isSubId(input.subId)) throw invalid(fn, 'subId');
  return { method: 'DELETE', path: PUSH_PATHS.subscribe, body: { watchId: input.watchId, subId: input.subId } };
}

/** POST /api/watch/status: { watchId } 또는 { watchId, subId }. subId 가 없거나 null 이면 본문에 키가 없다 */
export function statusRequest(input) {
  const fn = 'statusRequest';
  if (!isWatchId(input?.watchId)) throw invalid(fn, 'watchId');
  const subId = input.subId ?? null;
  if (subId === null) return { method: 'POST', path: PUSH_PATHS.status, body: { watchId: input.watchId } };
  if (!isSubId(subId)) throw invalid(fn, 'subId');
  return { method: 'POST', path: PUSH_PATHS.status, body: { watchId: input.watchId, subId } };
}

/** POST /api/watch/mute: { watchId, subId, on }. on 은 불리언만 받는다 */
export function muteRequest(input) {
  const fn = 'muteRequest';
  if (!isWatchId(input?.watchId)) throw invalid(fn, 'watchId');
  if (!isSubId(input.subId)) throw invalid(fn, 'subId');
  if (typeof input.on !== 'boolean') throw invalid(fn, 'on');
  return { method: 'POST', path: PUSH_PATHS.mute, body: { watchId: input.watchId, subId: input.subId, on: input.on } };
}

/**
 * 구독 응답 본문 → { subId }. subId 가 22자 base64url 이 아니면 null
 * @returns {{ subId: string } | null}
 */
export function readSubscribeData(data) {
  return isPlainObject(data) && isSubId(data.subId) ? { subId: data.subId } : null;
}

/**
 * 상태 조회 응답 본문 → { date, confirmed, muted, subscriptionActive }. date 는 날짜 형식, confirmed 는 HH:MM 문자열 배열
 * (최대 10), muted·subscriptionActive 는 불리언일 때만 값이고 아니면 null
 * @returns {{ date: string, confirmed: string[], muted: boolean, subscriptionActive: boolean } | null}
 */
export function readStatusData(data) {
  if (!isPlainObject(data) || !isDateString(data.date)) return null;
  const { confirmed } = data;
  if (!Array.isArray(confirmed) || confirmed.length > WATCH_UPLOAD_MAX_PER_DAY || !confirmed.every((time) => isClockTime(time))) return null;
  if (typeof data.muted !== 'boolean' || typeof data.subscriptionActive !== 'boolean') return null;
  return { date: data.date, confirmed: [...confirmed], muted: data.muted, subscriptionActive: data.subscriptionActive };
}

/**
 * 오늘 함께 있음 응답 본문 → { muted }. 불리언이 아니면 null
 * @returns {{ muted: boolean } | null}
 */
export function readMuteData(data) {
  return isPlainObject(data) && typeof data.muted === 'boolean' ? { muted: data.muted } : null;
}

/**
 * GET /api/push/config 응답 본문 → { enabled, vapidPublicKey, guardianLoginRequired }.
 * enabled·guardianLoginRequired 는 불리언, vapidPublicKey 는 null 이거나 65바이트 비압축 점(채움 없는 base64url 로 다시 적는다).
 * 켜져 있는데 키가 없거나 틀리면 구독할 수 없으므로 null 이다.
 * @returns {{ enabled: boolean, vapidPublicKey: string|null, guardianLoginRequired: boolean } | null}
 */
export function readConfigData(data) {
  if (!isPlainObject(data)) return null;
  const { enabled, guardianLoginRequired } = data;
  if (typeof enabled !== 'boolean' || typeof guardianLoginRequired !== 'boolean') return null;
  let vapidPublicKey = null;
  if (data.vapidPublicKey !== null) {
    vapidPublicKey = canonicalKey(data.vapidPublicKey, VAPID_KEY_BYTES, UNCOMPRESSED_POINT);
    if (vapidPublicKey === null) return null;
  }
  if (enabled && vapidPublicKey === null) return null;
  return { enabled, vapidPublicKey, guardianLoginRequired };
}
