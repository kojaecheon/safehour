// 서버 알림 요청 보내기와 결과 판정 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md 다르게 정한 것 22)
//
// 요청 모양(src/guardian/watchRequests.js) 하나를 보내고 결과(WatchResult)로 바꾸는 곳은 이 파일 하나다.
// 요청 함수(lib/trip/watchApi.js)와 기기 저장소의 서버 삭제 대기(lib/store)가 함께 쓴다. lib/store 는 lib/trip 을
// 불러올 수 없어 이 자리에 둔다. 공개 진입점(src/guardian/index.js)에서는 내보내지 않는다.
//
// 결과(WatchResult)는 { ok: true, status, data, kind: 'OK' } 또는 { ok: false, status, network, errorCode, kind } 다. 던지지 않는다.
//   - 응답이 2xx 이면서 본문이 { ok: true } 일 때만 성공이다(watchResultOf). 2xx 인데 본문이 계약 모양이 아니면
//     (중간 장비가 돌려준 HTML 등) 서버가 받았는지 모르는 일시 실패로 보고 kind 'UNAVAILABLE' 이다
//   - 요청이 서버에 닿지 않음(오프라인, 시간 초과): network true, errorCode 'NETWORK_ERROR', kind 'NETWORK'
//   - 요청 모양이 틀리면 보내지 않고 { ok: false, status: 0, network: false, errorCode: 'CLIENT_INVALID', kind: 'BAD' }
//
// 시간 한도는 AbortController 와 루프를 붙잡는 setTimeout 으로 걸고 끝나면 지운다(AbortSignal.timeout 을 쓰지 않는다:
// docs/engineering-notes.md 'Node 22'). fetchImpl 이 신호를 무시해도 타이머와 경주해 한도에서 NETWORK 로 끝난다.
// 늦게 온 응답은 버린다.
//
// 식별 값과 날짜·시각은 본문으로만 보낸다. 경로는 요청 모양의 고정 경로 그대로이고, 기록하지 않는다. 응답을 캐시하지 않는다.
// fetch 는 주입한다(기본은 브라우저 fetch). 서버 전용 모듈을 불러오지 않는다.

import { WATCH_KIND, classifyWatchResponse } from './watchRequests.js';

/** 서버 알림 요청 시간 한도 */
export const WATCH_API_TIMEOUT_MS = 15_000;
/** 요청 모양이 틀려 보내지 않았을 때의 errorCode */
export const CLIENT_INVALID = 'CLIENT_INVALID';
/** 요청이 서버에 닿지 않았을 때의 errorCode (lib/trip/api.js NETWORK_ERROR 와 같은 값) */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** 요청 모양이 틀려 보내지 않은 결과 */
export function clientInvalidResult() {
  return { ok: false, status: 0, network: false, errorCode: CLIENT_INVALID, kind: WATCH_KIND.BAD };
}

/**
 * 응답 하나 → WatchResult. 2xx 이면서 data.ok === true 일 때만 OK 다. 던지지 않는다.
 * errorCode 를 주지 않으면 본문의 errorCode, 그것도 없으면 'HTTP_<상태>' 다.
 * @param {{ status?: number, network?: boolean, data?: unknown, errorCode?: string }} response
 * @returns {object} WatchResult
 */
export function watchResultOf({ status, network = false, data = null, errorCode } = {}) {
  if (network) return { ok: false, status: 0, network: true, errorCode: NETWORK_ERROR, kind: WATCH_KIND.NETWORK };
  const code = Number(status) || 0;
  const body = data !== null && typeof data === 'object' ? data : null;
  const resolvedCode = typeof errorCode === 'string' ? errorCode : typeof body?.errorCode === 'string' ? body.errorCode : `HTTP_${code}`;
  const kind = classifyWatchResponse({ status: code, network: false, errorCode: resolvedCode });
  if (kind === WATCH_KIND.OK && body?.ok === true) return { ok: true, status: code, data: body, kind: WATCH_KIND.OK };
  return {
    ok: false,
    status: code,
    network: false,
    errorCode: resolvedCode,
    kind: kind === WATCH_KIND.OK ? WATCH_KIND.UNAVAILABLE : kind,
  };
}

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
  if (!request || typeof request.path !== 'string' || typeof request.method !== 'string') return clientInvalidResult();
  const hasBody = request.body !== null && request.body !== undefined;
  const limited = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const controller = limited && typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  // 한도에 닿으면 신호를 끊고 NETWORK 로 끝낸다. 붙잡는 타이머라 기다리는 동안 이벤트 루프가 비지 않는다
  const expired = limited
    ? new Promise((resolve) => {
        timer = globalThis.setTimeout(() => {
          controller?.abort();
          resolve(watchResultOf({ network: true }));
        }, timeoutMs);
      })
    : null;

  const exchange = (async () => {
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
      return watchResultOf({ network: true });
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return watchResultOf({ status: res?.status, network: false, data });
  })();

  try {
    // 본문 읽기까지 한도 안에서 끝나야 한다. 신호를 무시하는 fetchImpl 도 타이머가 끝낸다
    return expired ? await Promise.race([exchange, expired]) : await exchange;
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
}
