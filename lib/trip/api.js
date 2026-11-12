// 일정 API 클라이언트 (AX-316 · docs/contracts.md '공통')
//
//   plan(body)          POST /api/itinerary/plan
//   alternatives(body)  POST /api/itinerary/alternatives
//   link(code)          POST /api/plan/link   : 앱을 열 때 저장된 연결 코드로 지침을 다시 받는다(docs/business-rules.md '병원 연동')
//
// 결과는 `{ ok: true, status, data }` 또는 `{ ok: false, status, network, errorCode, upstream? }` 다. 예외를 던지지 않는다.
//   - network: 요청이 서버에 닿지 않음(오프라인·시간 초과) — errorCode 'NETWORK_ERROR'
//   - 서버 오류는 응답의 errorCode(예: SAFEHOUR_AUTH_REQUIRED, SAFEHOUR_EXTERNAL_API)를 그대로 준다
//   - upstream: 관광공사 실패 분류(SAFEHOUR_EXTERNAL_API 일 때). 닫힌 목록 값만 옮기고 나머지는 버린다
// 응답을 캐시하지 않는다(cache: 'no-store'. API 응답은 서비스 워커 캐시에도 넣지 않는다, docs/platform/IA_AND_FLOWS.md '보기 전용 상태').

import { tourApiUpstreamClass } from '../../src/tour-api/upstream.js';

export const TRIP_API_PATHS = Object.freeze({
  plan: '/api/itinerary/plan',
  alternatives: '/api/itinerary/alternatives',
  link: '/api/plan/link',
});

export const NETWORK_ERROR = 'NETWORK_ERROR';

/** 일정 요청 시간 한도 — 관광공사 조회·상세 보강이 길어져도 대기열이 멈추지 않게 */
export const TRIP_API_TIMEOUT_MS = 45_000;

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]  0 이면 한도 없음
 */
export function createTripApi({ fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = TRIP_API_TIMEOUT_MS } = {}) {
  async function post(path, payload) {
    const controller = typeof AbortController === 'function' && timeoutMs > 0 ? new AbortController() : null;
    const timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      let res;
      try {
        res = await fetchImpl(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify(payload),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch {
        return { ok: false, status: 0, network: true, errorCode: NETWORK_ERROR };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const status = Number(res?.status) || 0;
      if (!res?.ok || data?.ok !== true) {
        const upstream = tourApiUpstreamClass(data?.upstream);
        return {
          ok: false,
          status,
          network: false,
          errorCode: typeof data?.errorCode === 'string' ? data.errorCode : `HTTP_${status}`,
          ...(upstream ? { upstream } : {}),
        };
      }
      return { ok: true, status, data };
    } finally {
      if (timer !== null) globalThis.clearTimeout(timer);
    }
  }

  return Object.freeze({
    plan: (body) => post(TRIP_API_PATHS.plan, body),
    alternatives: (body) => post(TRIP_API_PATHS.alternatives, body),
    link: (code) => post(TRIP_API_PATHS.link, { code }),
  });
}
