// 서버 알림 요청 함수 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3 · docs/contracts.md '서버 알림')
//
//   config()           GET    /api/push/config
//   register(input)    POST   /api/watch             { watchId, writeToken, expiresOn }
//   deadlines(input)   PUT    /api/watch/deadlines   { watchId, writeToken, expiresOn, days }
//   back(input)        POST   /api/watch/back        { watchId, writeToken, date, by, undo? }
//   removeAll()        DELETE /api/watch             { all: true }
// 지켜보기 하나 지우기(DELETE /api/watch { watchId, writeToken })는 기기 저장소의 서버 삭제 대기가 보낸다(lib/store).
// 요청 모양(형식, 한도, 본문 허용 목록)과 결과 종류는 src/guardian/watchRequests.js 가 정한다.
//
// 결과(WatchResult)는 { ok: true, status, data, kind: 'OK' } 또는 { ok: false, status, network, errorCode, kind } 다. 던지지 않는다.
//   - network: 요청이 서버에 닿지 않음(오프라인, 시간 초과). errorCode 'NETWORK_ERROR', kind 'NETWORK'
//   - 요청 모양이 틀리면 보내지 않고 { ok: false, status: 0, network: false, errorCode: 'CLIENT_INVALID', kind: 'BAD' }
//   - 응답이 2xx 이고 본문이 { ok: true } 일 때만 성공이다. 2xx 인데 본문이 계약 모양이 아니면 kind 'UNAVAILABLE'
// 식별 값과 날짜·시각은 본문으로만 보내고, 기록하지 않는다. 응답을 캐시하지 않는다(cache: 'no-store').
//
// 요청 방식은 lib/trip/api.js 의 post 와 같다: 같은 출처 자격 증명, 캐시 없음, 시간 한도는 AbortController.

import {
  WATCH_KIND,
  backRequest,
  classifyWatchResponse,
  configRequest,
  deadlinesRequest,
  registerRequest,
  removeAllRequest,
} from '../../src/guardian/watchRequests.js';
import { NETWORK_ERROR } from './api.js';

/** 서버 알림 요청 시간 한도 */
export const WATCH_API_TIMEOUT_MS = 15_000;
/** 요청 모양이 틀려 보내지 않았을 때의 errorCode */
export const CLIENT_INVALID = 'CLIENT_INVALID';

const clientInvalid = () => ({ ok: false, status: 0, network: false, errorCode: CLIENT_INVALID, kind: WATCH_KIND.BAD });
const networkFailure = () => ({ ok: false, status: 0, network: true, errorCode: NETWORK_ERROR, kind: WATCH_KIND.NETWORK });

/**
 * 요청 모양({ method, path, body }) 하나를 보낸다. 던지지 않는다.
 * @param {{ method: string, path: string, body: object|null }} request
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]  timeoutMs 가 0 이면 한도 없음
 * @returns {Promise<object>} WatchResult
 */
export async function sendWatchRequest(
  request,
  { fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = WATCH_API_TIMEOUT_MS } = {},
) {
  if (!request || typeof request.path !== 'string' || typeof request.method !== 'string') return clientInvalid();
  const hasBody = request.body !== null && request.body !== undefined;
  const controller = typeof AbortController === 'function' && timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    let res;
    try {
      res = await fetchImpl(request.path, {
        method: request.method,
        headers: hasBody ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      return networkFailure();
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const status = Number(res?.status) || 0;
    if (res?.ok && data?.ok === true) return { ok: true, status, data, kind: WATCH_KIND.OK };
    const errorCode = typeof data?.errorCode === 'string' ? data.errorCode : `HTTP_${status}`;
    // 2xx 인데 본문이 계약 모양이 아니면(중간 장비의 응답 등) 서버가 받았는지 모르는 일시 실패로 본다
    const kind = res?.ok ? WATCH_KIND.UNAVAILABLE : classifyWatchResponse({ status, network: false, errorCode });
    return { ok: false, status, network: false, errorCode, kind };
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createWatchApi({ fetchImpl, timeoutMs } = {}) {
  /** 요청 모양을 만들고 보낸다. 모양이 틀리면 보내지 않는다 */
  function send(build) {
    let request;
    try {
      request = build();
    } catch {
      return Promise.resolve(clientInvalid());
    }
    return sendWatchRequest(request, { fetchImpl, timeoutMs });
  }

  return Object.freeze({
    config: () => send(() => configRequest()),
    register: (input) => send(() => registerRequest(input)),
    deadlines: (input) => send(() => deadlinesRequest(input)),
    back: (input) => send(() => backRequest(input)),
    removeAll: () => send(() => removeAllRequest()),
  });
}
