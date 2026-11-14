// 서버 알림 요청 모양: 형식, 한도, 경로, 본문 허용 목록, 응답 분류, 새 식별 값
// (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3 · docs/contracts.md '서버 알림')
//
// 기기 저장소의 서버 삭제 대기(lib/store)와 요청 함수(lib/trip/watchApi.js)가 함께 쓰는 순수 모듈이다.
// 클라이언트는 lib/server 를 불러올 수 없어 형식 정규식과 한도를 여기 따로 둔다. 서버 값(lib/server/watch/keys.js·limits.js)과
// 같은지는 test/guardian-watch-requests.test.js 가 묶고, 실제 처리기를 통과하는지는 test/watch-client-seam.test.js 가 본다.
//
// - 본문은 허용 목록 필드만 새로 만들어 담는다. 받은 객체를 펼치지 않는다
// - 형식이 틀리면 TypeError 다. 메시지는 고정 문장이고 식별 값·날짜·시각을 담지 않는다
// - 식별 값(watchId, writeToken)은 본문으로만 보낸다. 경로·쿼리에 싣지 않는다
// - 마감 올리기는 한도(46일, 하루 10개)를 넘으면 던진다. 한도에 맞게 깎는 것은 부르는 쪽(lib/trip/watchPlan.js)이 한다
//
// 순수 함수다. 네트워크·저장소를 쓰지 않는다. 난수는 주입할 수 있고, 주입하지 않으면 WebCrypto 를 쓴다.

import { ERROR_CODE, isClockTime, isDateString } from '../stay/index.js';
import { toBase64Url } from './crypto.js';

/** 지켜보기 id: 16바이트 base64url (서버 lib/server/watch/keys.js 와 같다) */
export const WATCH_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** 쓰기 토큰: 32바이트 base64url (서버 lib/server/watch/keys.js 와 같다) */
export const WRITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** 한 번에 올리는 날짜 수 상한 (서버 WATCH_LIMITS.maxDays) */
export const WATCH_UPLOAD_MAX_DAYS = 46;
/** 하루 마감 수 상한 (서버 WATCH_LIMITS.maxDeadlinesPerDay) */
export const WATCH_UPLOAD_MAX_PER_DAY = 10;

const WATCH_ID_BYTES = 16;
const WRITE_TOKEN_BYTES = 32;

export const WATCH_PATHS = Object.freeze({
  config: '/api/push/config',
  watch: '/api/watch',
  deadlines: '/api/watch/deadlines',
  back: '/api/watch/back',
});

/** 요청 결과 종류 (계획 '공용 모양') */
export const WATCH_KIND = Object.freeze({
  OK: 'OK',
  /** 404: 모르는 id, 틀린 토큰, 만료, 다른 기기에서 갈아 끼움(모두 같은 응답) */
  NOT_FOUND: 'NOT_FOUND',
  /** 401: 로그인 세션이 없다 */
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  /** 429 */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 503 SAFEHOUR_SERVER_PUSH_OFF: 서버 알림이 꺼져 있다 */
  OFF: 'OFF',
  /** 400 */
  BAD: 'BAD',
  /** 그 밖의 503, 5xx, 모르는 상태 */
  UNAVAILABLE: 'UNAVAILABLE',
  /** 연결 실패, 시간 초과 */
  NETWORK: 'NETWORK',
});

const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);
const isWriteToken = (value) => typeof value === 'string' && WRITE_TOKEN_RE.test(value);

/** 고정 문장의 형식 오류. 함수 이름과 필드 이름만 담고 값은 담지 않는다 */
function invalid(fn, field) {
  return new TypeError(`${fn}: ${field} 형식이 올바르지 않습니다`);
}

function authOf(input, fn) {
  if (!isWatchId(input?.watchId)) throw invalid(fn, 'watchId');
  if (!isWriteToken(input?.writeToken)) throw invalid(fn, 'writeToken');
  return { watchId: input.watchId, writeToken: input.writeToken };
}

function defaultRandomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * 새 지켜보기 id(16바이트)와 쓰기 토큰(32바이트). 둘 다 채움 없는 base64url 이다.
 * @param {{ randomBytes?: (n: number) => Uint8Array }} [options]
 * @returns {{ watchId: string, writeToken: string }}
 * @throws {TypeError} 주입한 난수의 길이가 틀림
 */
export function newWatchIds({ randomBytes = defaultRandomBytes } = {}) {
  const watchId = toBase64Url(randomBytes(WATCH_ID_BYTES));
  const writeToken = toBase64Url(randomBytes(WRITE_TOKEN_BYTES));
  if (!isWatchId(watchId)) throw invalid('newWatchIds', 'watchId');
  if (!isWriteToken(writeToken)) throw invalid('newWatchIds', 'writeToken');
  return { watchId, writeToken };
}

/** GET /api/push/config */
export function configRequest() {
  return { method: 'GET', path: WATCH_PATHS.config, body: null };
}

/** POST /api/watch: { watchId, writeToken, expiresOn } */
export function registerRequest(input) {
  const { watchId, writeToken } = authOf(input, 'registerRequest');
  if (!isDateString(input.expiresOn)) throw invalid('registerRequest', 'expiresOn');
  return { method: 'POST', path: WATCH_PATHS.watch, body: { watchId, writeToken, expiresOn: input.expiresOn } };
}

/**
 * PUT /api/watch/deadlines: { watchId, writeToken, expiresOn, days: [{ date, deadlines }] }
 * days 는 46개 이하이고 날짜가 겹치지 않는다. 날짜마다 시각을 중복 없이 정렬해 싣고, 그 결과가 10개를 넘으면 던진다.
 */
export function deadlinesRequest(input) {
  const fn = 'deadlinesRequest';
  const { watchId, writeToken } = authOf(input, fn);
  if (!isDateString(input.expiresOn)) throw invalid(fn, 'expiresOn');
  const days = input.days;
  if (!Array.isArray(days) || days.length > WATCH_UPLOAD_MAX_DAYS) throw invalid(fn, 'days');
  const seen = new Set();
  const outDays = days.map((day) => {
    const date = day?.date;
    if (!isDateString(date) || seen.has(date)) throw invalid(fn, 'days[].date');
    seen.add(date);
    const list = day.deadlines;
    if (!Array.isArray(list) || !list.every((time) => isClockTime(time))) throw invalid(fn, 'days[].deadlines');
    const deadlines = [...new Set(list)].sort();
    if (deadlines.length > WATCH_UPLOAD_MAX_PER_DAY) throw invalid(fn, 'days[].deadlines');
    return { date, deadlines };
  });
  return {
    method: 'PUT',
    path: WATCH_PATHS.deadlines,
    body: { watchId, writeToken, expiresOn: input.expiresOn, days: outDays },
  };
}

/**
 * POST /api/watch/back: { watchId, writeToken, date, by } 에 되돌리기면 undo: true.
 * undo 는 없거나 불리언이어야 한다. true 일 때만 싣는다.
 */
export function backRequest(input) {
  const fn = 'backRequest';
  const { watchId, writeToken } = authOf(input, fn);
  if (!isDateString(input.date)) throw invalid(fn, 'date');
  if (!isClockTime(input.by)) throw invalid(fn, 'by');
  if (input.undo !== undefined && typeof input.undo !== 'boolean') throw invalid(fn, 'undo');
  const body = { watchId, writeToken, date: input.date, by: input.by };
  if (input.undo === true) body.undo = true;
  return { method: 'POST', path: WATCH_PATHS.back, body };
}

/** DELETE /api/watch: { watchId, writeToken } (지켜보기 하나) */
export function removeRequest(input) {
  const { watchId, writeToken } = authOf(input, 'removeRequest');
  return { method: 'DELETE', path: WATCH_PATHS.watch, body: { watchId, writeToken } };
}

/** DELETE /api/watch: { all: true } (로그인 세션의 지켜보기 전부) */
export function removeAllRequest() {
  return { method: 'DELETE', path: WATCH_PATHS.watch, body: { all: true } };
}

/**
 * 응답 → 결과 종류. 2xx 는 OK 다. 2xx 인데 본문이 계약 모양이 아닌 경우는 요청 함수가 따로 UNAVAILABLE 로 본다.
 * @param {{ status?: number, network?: boolean, errorCode?: string }} response
 * @returns {string} WATCH_KIND 값
 */
export function classifyWatchResponse({ status, network, errorCode } = {}) {
  if (network) return WATCH_KIND.NETWORK;
  const code = Number(status);
  if (Number.isInteger(code) && code >= 200 && code <= 299) return WATCH_KIND.OK;
  if (code === 404) return WATCH_KIND.NOT_FOUND;
  if (code === 401) return WATCH_KIND.LOGIN_REQUIRED;
  if (code === 429) return WATCH_KIND.RATE_LIMITED;
  if (code === 400) return WATCH_KIND.BAD;
  if (code === 503 && errorCode === ERROR_CODE.SERVER_PUSH_OFF) return WATCH_KIND.OFF;
  return WATCH_KIND.UNAVAILABLE;
}
