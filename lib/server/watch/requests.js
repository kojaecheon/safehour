// 서버 알림 요청 본문 읽기와 허용 목록 (ADR-0012 · 계획 작업 8 '정한 값')
//
// 원칙
//   - 본문은 16KB(MAX_BODY_BYTES)까지만 읽는다. 스트림을 바이트 단위로 세며 읽다가 넘는 순간 멈춘다.
//     UTF-8 JSON 객체가 아니면 실패다.
//   - 경로마다 정해진 필드만 읽고, 결과 객체는 그 키만 새로 만들어 담는다. 받은 객체(와 그 안의 배열·객체)를
//     그대로 넘기지 않는다. 허용 목록 밖 필드(좌표, 병원, 이름 등)는 조용히 버린다.
//   - 필드는 자기 소유 속성만 읽는다. '__proto__'·'constructor' 같은 키가 결과나 원형을 건드리지 못한다.
//   - 형식이 틀리면 { ok: false, field } 이다. field 는 입력 경로이고 값은 담지 않는다.
//   - 여기서는 형식만 본다. 지난 날짜·출국일 범위·endpoint 호스트 허용 목록은 서비스 함수가 본다.
//
// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM'(src/stay/time.js 의 isDateString·isClockTime).

import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { PLAN_LANGS } from '../itinerary-request.js';
import { SUB_ID_RE, WATCH_ID_RE, WATCH_KEY_RE, WRITE_TOKEN_RE } from './keys.js';
import { WATCH_LIMITS } from './limits.js';

/** 요청 본문 상한(바이트) */
export const MAX_BODY_BYTES = 16384;

/** endpoint 문자열 상한. 호스트 검사는 서비스가 src/push/endpoint.js 로 한다 */
const MAX_ENDPOINT_CHARS = 2048;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 자기 소유 속성만 읽는다. 원형에서 오는 값(constructor 등)은 없는 것으로 본다 */
function own(obj, key) {
  return isPlainObject(obj) && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

const ok = (value) => ({ ok: true, value });
const bad = (field) => ({ ok: false, field });

const matches = (re) => (value) => typeof value === 'string' && re.test(value);
const isWatchId = matches(WATCH_ID_RE);
const isWriteToken = matches(WRITE_TOKEN_RE);
const isSubId = matches(SUB_ID_RE);
const isWatchKey = matches(WATCH_KEY_RE);

/** base64url 을 풀어 정확히 length 바이트면 채움 없는 base64url 로 다시 적어 돌려준다. 아니면 null */
function decodedKey(value, length, firstByte = null) {
  if (typeof value !== 'string' || !BASE64URL.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== length) return null;
  if (firstByte !== null && bytes[0] !== firstByte) return null;
  return bytes.toString('base64url');
}

/** 잘못된 UTF-8 은 실패로 보고, 맨 앞 BOM 도 떼지 않는다. 그래서 raw 의 UTF-8 바이트가 받은 바이트와 정확히 같다 */
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** 남은 본문은 받지 않는다. 취소 결과는 기다리지 않는다(이미 잠긴 스트림이면 거절되는 약속을 삼킨다) */
function cancelQuietly(target) {
  try {
    target?.cancel?.()?.catch?.(() => {});
  } catch {
    // 취소 실패는 응답에 영향이 없다
  }
}

/**
 * 본문 스트림을 바이트를 세며 읽는다. MAX_BODY_BYTES 를 넘는 순간 스트림을 취소하고 null 이다.
 * Content-Length 는 믿지 않는다(없거나 틀릴 수 있다). 본문이 없으면 빈 바이트다.
 * @returns {Promise<Buffer|null>}
 */
async function readCappedBytes(request) {
  const stream = request?.body;
  if (stream === null) return Buffer.alloc(0);
  if (typeof stream?.getReader !== 'function') return null;
  let reader;
  try {
    reader = stream.getReader();
  } catch {
    // 이미 읽었거나 잠긴 본문
    return null;
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ArrayBuffer.isView(value)) {
        cancelQuietly(reader);
        return null;
      }
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        cancelQuietly(reader);
        return null;
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch {
    cancelQuietly(reader);
    return null;
  }
  return Buffer.concat(chunks, total);
}

/**
 * 본문을 읽는다. UTF-8 바이트 길이가 MAX_BODY_BYTES 를 넘거나, UTF-8 이 아니거나, JSON 이 아니거나, 객체가 아니면 실패다.
 * 상한을 넘는 본문은 끝까지 읽지 않는다(인증 전에 본문을 읽는 예약 처리 경로도 같다).
 * raw 는 서명 검증용 원문이다(예약 처리 경로). 받은 바이트를 그대로 푼 문자열이다.
 * @param {Request} request
 * @returns {Promise<{ ok: true, body: object, raw: string } | { ok: false }>}
 */
export async function readJsonBody(request) {
  // 길이를 미리 크게 알리면 읽지 않고 거른다. 알리지 않았거나 작게 알려도 읽으면서 센다
  const declared = Number(request?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    cancelQuietly(request?.body);
    return { ok: false };
  }
  const bytes = await readCappedBytes(request);
  if (bytes === null) return { ok: false };
  let raw;
  try {
    raw = UTF8.decode(bytes);
  } catch {
    return { ok: false };
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!isPlainObject(body)) return { ok: false };
  return { ok: true, body, raw };
}

/** watchId 와 writeToken 두 값. 둘 다 맞으면 객체, 아니면 { field } */
function readWriteAuth(body) {
  const watchId = own(body, 'watchId');
  if (!isWatchId(watchId)) return { field: 'watchId' };
  const writeToken = own(body, 'writeToken');
  if (!isWriteToken(writeToken)) return { field: 'writeToken' };
  return { watchId, writeToken };
}

/** 지켜보기 등록: { watchId, writeToken, expiresOn } */
export function normalizeRegister(body) {
  const auth = readWriteAuth(body);
  if (auth.field) return bad(auth.field);
  const expiresOn = own(body, 'expiresOn');
  if (!isDateString(expiresOn)) return bad('expiresOn');
  return ok({ watchId: auth.watchId, writeToken: auth.writeToken, expiresOn });
}

/** 날짜 하나의 마감 목록. 길이 상한을 넘거나 형식이 틀리면 null. 중복을 없애 정렬한 새 배열 */
function readDeadlines(value) {
  if (!Array.isArray(value) || value.length > WATCH_LIMITS.maxDeadlinesPerDay) return null;
  if (!value.every(isClockTime)) return null;
  return [...new Set(value)].sort();
}

/**
 * 마감 올리기: { watchId, writeToken, expiresOn, days: [{ date, deadlines: ["HH:MM"] }] }
 * days 는 maxDays 개 이하, 날짜가 겹치면 거절, deadlines 는 maxDeadlinesPerDay 개 이하이고 중복을 없애 정렬한다.
 * 항목은 date·deadlines 두 값만 읽는다.
 */
export function normalizeDeadlines(body) {
  const auth = readWriteAuth(body);
  if (auth.field) return bad(auth.field);
  const expiresOn = own(body, 'expiresOn');
  if (!isDateString(expiresOn)) return bad('expiresOn');
  const rawDays = own(body, 'days');
  if (!Array.isArray(rawDays) || rawDays.length > WATCH_LIMITS.maxDays) return bad('days');
  const days = [];
  const seen = new Set();
  for (let i = 0; i < rawDays.length; i += 1) {
    const item = rawDays[i];
    if (!isPlainObject(item)) return bad(`days[${i}]`);
    const date = own(item, 'date');
    if (!isDateString(date) || seen.has(date)) return bad(`days[${i}].date`);
    seen.add(date);
    const deadlines = readDeadlines(own(item, 'deadlines'));
    if (!deadlines) return bad(`days[${i}].deadlines`);
    days.push({ date, deadlines });
  }
  return ok({ watchId: auth.watchId, writeToken: auth.writeToken, expiresOn, days });
}

/** 돌아왔어요: { watchId, writeToken, date, by, undo? }. undo 는 없으면 false */
export function normalizeBack(body) {
  const auth = readWriteAuth(body);
  if (auth.field) return bad(auth.field);
  const date = own(body, 'date');
  if (!isDateString(date)) return bad('date');
  const by = own(body, 'by');
  if (!isClockTime(by)) return bad('by');
  const undo = own(body, 'undo');
  if (undo !== undefined && typeof undo !== 'boolean') return bad('undo');
  return ok({ watchId: auth.watchId, writeToken: auth.writeToken, date, by, undo: undo === true });
}

/**
 * 지켜보기 삭제: { watchId, writeToken } 또는 { all: true }(세션 필요, 처리기가 본다).
 * all 이 true 면 다른 필드는 읽지 않는다.
 */
export function normalizeRemove(body) {
  const all = own(body, 'all');
  if (all !== undefined && typeof all !== 'boolean') return bad('all');
  if (all === true) return ok({ all: true });
  const auth = readWriteAuth(body);
  if (auth.field) return bad(auth.field);
  return ok({ all: false, watchId: auth.watchId, writeToken: auth.writeToken });
}

/**
 * 보호자 구독: { watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang }
 * p256dh 는 65바이트 비압축 점(첫 바이트 0x04), auth 는 16바이트. 결과는 채움 없는 base64url 로 다시 적는다.
 */
export function normalizeSubscribe(body) {
  const watchId = own(body, 'watchId');
  if (!isWatchId(watchId)) return bad('watchId');
  const subscription = own(body, 'subscription');
  if (!isPlainObject(subscription)) return bad('subscription');
  const endpoint = own(subscription, 'endpoint');
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_CHARS) {
    return bad('subscription.endpoint');
  }
  const keys = own(subscription, 'keys');
  if (!isPlainObject(keys)) return bad('subscription.keys');
  const p256dh = decodedKey(own(keys, 'p256dh'), P256DH_BYTES, 0x04);
  if (!p256dh) return bad('subscription.keys.p256dh');
  const auth = decodedKey(own(keys, 'auth'), AUTH_BYTES);
  if (!auth) return bad('subscription.keys.auth');
  const lang = own(body, 'lang');
  if (!PLAN_LANGS.includes(lang)) return bad('lang');
  return ok({ watchId, subscription: { endpoint, p256dh, auth }, lang });
}

/** 구독 해지: { watchId, subId } */
export function normalizeUnsubscribe(body) {
  const watchId = own(body, 'watchId');
  if (!isWatchId(watchId)) return bad('watchId');
  const subId = own(body, 'subId');
  if (!isSubId(subId)) return bad('subId');
  return ok({ watchId, subId });
}

/** 상태 조회: { watchId, subId? }. subId 가 없거나 null 이면 null */
export function normalizeStatus(body) {
  const watchId = own(body, 'watchId');
  if (!isWatchId(watchId)) return bad('watchId');
  const subId = own(body, 'subId');
  if (subId !== undefined && subId !== null && !isSubId(subId)) return bad('subId');
  return ok({ watchId, subId: subId ?? null });
}

/** 오늘 함께 있음: { watchId, subId, on } */
export function normalizeMute(body) {
  const watchId = own(body, 'watchId');
  if (!isWatchId(watchId)) return bad('watchId');
  const subId = own(body, 'subId');
  if (!isSubId(subId)) return bad('subId');
  const on = own(body, 'on');
  if (typeof on !== 'boolean') return bad('on');
  return ok({ watchId, subId, on });
}

/** 예약 처리 본문: { k, d, t } → { watchKey, date, time } */
export function normalizeDue(body) {
  const watchKey = own(body, 'k');
  if (!isWatchKey(watchKey)) return bad('k');
  const date = own(body, 'd');
  if (!isDateString(date)) return bad('d');
  const time = own(body, 't');
  if (!isClockTime(time)) return bad('t');
  return ok({ watchKey, date, time });
}
