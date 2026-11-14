// 푸시 한 건 보내기와 결과 분류 (RFC 8030 'Generic Event Delivery Using HTTP Push'). src/push/AGENTS.md
//
// - POST, 리디렉트를 따라가지 않는다(redirect: 'manual'), timeoutMs 뒤에 끊는다
// - 헤더: Authorization(VAPID), Content-Encoding: aes128gcm, Content-Type, TTL, Urgency, 형식에 맞을 때만 Topic
// - 네트워크는 주입한 fetchImpl 로만 나간다
//
// 이 함수는 던지지 않는다. 결과는 { outcome, statusClass } 두 값뿐이고, 응답 본문과 주소는 담지 않는다.
//   2xx         SENT     '2xx'
//   404·410     GONE     '404/410'  구독이 사라졌다. 부르는 쪽이 구독을 지운다
//   429         RETRY    '4xx'
//   5xx         RETRY    '5xx'
//   예외·시간 초과 RETRY  'network'
//   그 밖(3xx 포함) REJECTED '4xx'
//   endpoint 검증 실패·키 형식 오류·본문 초과는 fetch 없이 REJECTED '4xx'

import { encryptPushPayload } from './encrypt.js';
import { parsePushEndpoint } from './endpoint.js';

export const PUSH_OUTCOME = Object.freeze({
  SENT: 'SENT',
  GONE: 'GONE',
  RETRY: 'RETRY',
  REJECTED: 'REJECTED',
});

const TOPIC_RE = /^[A-Za-z0-9_-]{1,32}$/;
const URGENCIES = new Set(['very-low', 'low', 'normal', 'high']);

const result = (outcome, statusClass) => ({ outcome, statusClass });
const REJECTED = () => result(PUSH_OUTCOME.REJECTED, '4xx');

function classify(status) {
  if (status >= 200 && status < 300) return result(PUSH_OUTCOME.SENT, '2xx');
  if (status === 404 || status === 410) return result(PUSH_OUTCOME.GONE, '404/410');
  if (status === 429) return result(PUSH_OUTCOME.RETRY, '4xx');
  if (status >= 500 && status < 600) return result(PUSH_OUTCOME.RETRY, '5xx');
  return REJECTED();
}

/**
 * 푸시 한 건을 보낸다.
 *
 * @param {object} input
 * @param {{ endpoint: string, p256dh: string, auth: string }} input.subscription
 * @param {string|Buffer} input.payload  암호화 전 본문(3993바이트 이하)
 * @param {{ authorizationFor(endpointUrl: string, nowMs: number): string }} input.signer  createVapidSigner 결과
 * @param {string} [input.topic]       /^[A-Za-z0-9_-]{1,32}$/ 에 맞을 때만 Topic 헤더로 싣는다
 * @param {number} [input.ttlSec=3600]
 * @param {'very-low'|'low'|'normal'|'high'} [input.urgency='high']
 * @param {typeof fetch} [input.fetchImpl=globalThis.fetch]
 * @param {number} input.nowMs         VAPID JWT 시각. 부르는 쪽의 시계에서 받는다
 * @param {number} [input.timeoutMs=5000]
 * @param {string|null} [input.testOrigin]  데모 모드에서만 넘기는 가짜 푸시 서비스 출처
 * @returns {Promise<{ outcome: 'SENT'|'GONE'|'RETRY'|'REJECTED', statusClass: '2xx'|'404/410'|'4xx'|'5xx'|'network' }>}
 */
export async function sendPush(input) {
  let request;
  try {
    // 인자가 없거나 객체가 아니어도 던지지 않는다(약속: 결과만 돌려준다)
    const {
      subscription,
      payload,
      signer,
      topic,
      ttlSec = 3600,
      urgency = 'high',
      fetchImpl = globalThis.fetch,
      nowMs,
      timeoutMs = 5000,
      testOrigin,
    } = input ?? {};
    const parsed = parsePushEndpoint(subscription?.endpoint, { testOrigin });
    if (!parsed.ok) return REJECTED();
    const body = encryptPushPayload({ plaintext: payload, p256dh: subscription.p256dh, auth: subscription.auth });
    const headers = {
      Authorization: signer.authorizationFor(parsed.url.href, nowMs),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(Number.isFinite(ttlSec) && ttlSec > 0 ? Math.floor(ttlSec) : 0),
      Urgency: URGENCIES.has(urgency) ? urgency : 'high',
    };
    if (typeof topic === 'string' && TOPIC_RE.test(topic)) headers.Topic = topic;
    // 시간 한도가 틀린 값이면 부르는 쪽 설정 실수다. 네트워크 실패(RETRY)로 보면 끝없이 다시 부르므로 REJECTED 로 둔다
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return REJECTED();
    if (typeof fetchImpl !== 'function') return REJECTED();
    request = { url: parsed.url.href, headers, body, fetchImpl, timeoutMs };
  } catch {
    // 키 형식 오류(PUSH_KEY), 본문 초과(PUSH_PAYLOAD_TOO_LARGE), 서명 실패(PUSH_VAPID). 원래 메시지는 버린다
    return REJECTED();
  }

  // AbortSignal.timeout 의 타이머는 이벤트 루프를 붙잡지 않아(unref) Node 22 테스트 실행기가 기다리던 약속을 취소한다.
  // 붙잡는 타이머로 끊고, 응답 헤더를 받으면 지운다(본문은 읽지 않는다)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('시간 한도를 넘었습니다.', 'TimeoutError')), request.timeoutMs);
  let response;
  try {
    response = await request.fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return result(PUSH_OUTCOME.RETRY, 'network');
  } finally {
    clearTimeout(timer);
  }

  // 응답 본문은 읽지 않는다. 연결을 놓아 주려고 버리기만 한다
  try {
    await response?.body?.cancel?.();
  } catch {
    // 무시한다
  }
  const status = Number(response?.status);
  return Number.isInteger(status) ? classify(status) : result(PUSH_OUTCOME.RETRY, 'network');
}
