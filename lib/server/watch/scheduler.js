// 예약 어댑터: 마감 + 유예 시각에 예약 처리 경로(/api/watch/due)를 한 번 깨운다
// (docs/superpowers/specs/2026-11-09-server-push-design.md 4.2 '예약 걸기 규칙', 11.1 'Upstash QStash')
//
// 하는 일: 예약 걸기(schedule), 예약 취소(cancel), 예약 처리 요청의 서명 검증(verifyQstashSignature).
// 하지 않는 일: 무엇을 언제 걸지 정하는 것. 그 판단은 보내는 쪽(작업 5)이 하고, 이 모듈은 받은 대로 건다.
// 예약 방식을 나중에 바꿀 수 있도록(Vercel 매분 Cron 등) 이 어댑터 뒤에 둔다.
//
// ── QStash 형식 (공식 문서 확인: 2026-11-14) ──
//   발행: POST <QSTASH_URL>/v2/publish/<목적지 주소>
//     - 목적지 주소는 인코딩하지 않고 그대로 잇는다. 프로토콜(https://)을 반드시 붙인다
//       (https://upstash.com/docs/qstash/howto/publishing 의 예시 'https://qstash.upstash.io/v2/publish/https://example.com')
//     - 인증 `Authorization: Bearer <토큰>` (https://upstash.com/docs/qstash/api/publish)
//     - `Upstash-Not-Before`: 유닉스 초(UTC). `Upstash-Delay` 보다 우선한다
//       (https://upstash.com/docs/qstash/features/delay, 무료 등급 최대 지연 7일)
//     - `Upstash-Deduplication-Id`: 10분 안에 같은 id 로 온 발행은 무시된다. 그래서 보조 장치일 뿐이다
//     - `Upstash-Retries`: 처음 1번 + 재시도 횟수. 없으면 기본 3
//     - `Upstash-Forward-<이름>`: 접두사를 떼고 목적지에 그 이름으로 전달한다
//     - 응답 200 JSON 의 `messageId`(중복 제거된 경우 예전 메시지 id), `deduplicated`
//       (위 세 항목 모두 https://upstash.com/docs/qstash/api/publish)
//   취소: DELETE <QSTASH_URL>/v2/messages/<messageId>
//     - 202 `{ cancelled: 1 }` 성공, 404 메시지 없음
//       (https://upstash.com/docs/qstash/api-reference/messages/cancel-a-message.md)
//     - 이 모듈은 2xx 전부와 404 를 true 로 본다(이미 실행됐거나 지워진 예약은 지울 것이 없다)
//   서명: `Upstash-Signature` 헤더의 JWT
//     - HMAC SHA256 으로 서명. 클레임 iss(늘 'Upstash'), sub(목적지 주소), exp·nbf·iat(유닉스 초), jti,
//       body(원본 본문 SHA-256 을 RFC 4648 5절 url 안전 base64 로. 문서 예시 값은 끝에 '=' 이 붙어 있다)
//       (https://upstash.com/docs/qstash/features/security)
//     - 원본 본문 그대로 검증한다. JSON 을 읽어 다시 직렬화하면 어긋난다. 지금 키와 다음 키를 함께 쓴다
//       (https://upstash.com/docs/qstash/howto/signature)
//     - body 는 양쪽 끝 '=' 을 떼고 비교하고, 지금 키가 실패하면 다음 키로 다시 본다
//       (공식 SDK 구현 https://github.com/upstash/qstash-js/blob/main/src/receiver.ts)
//     - 이 모듈은 공식 SDK 보다 좁게 받는다: 머리의 alg 가 HS256 일 때만, 서명은 timingSafeEqual 로 비교,
//       nbf 는 60초까지 시계 차이를 허용(SDK 기본은 0초), sub 는 경로만 본다(호스트는 배포마다 달라서).
//
// ── Vercel 배포 보호 우회 ──
//   미리보기 배포는 보호가 걸려 있어 QStash 요청이 막힌다. 헤더 `x-vercel-protection-bypass: <비밀>` 이면 통과한다
//   (https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation,
//    갱신 2026-09-16). QStash 에는 `Upstash-Forward-x-vercel-protection-bypass` 로 실어 보낸다.
//
// ── 새지 않게 ──
//   schedule·cancel·verifyQstashSignature 는 던지지 않는다. 결과에는 ok 와(성공한 발행이면) messageId 만 담는다.
//   오류 객체와 응답 본문은 읽지 않는다(주소·토큰이 섞일 수 있다). 이 모듈은 아무것도 기록하지 않는다.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { withTimeout } from './timeout.js';

/** 예약 처리 경로. QStash 가 이 경로를 부르고, 서명의 sub 경로도 이 값이어야 한다 */
export const DUE_PATH = '/api/watch/due';

/** 발행 한 건의 재시도 횟수(문서의 기본값과 같다. 명시해 두어 기본값이 바뀌어도 그대로 간다) */
const PUBLISH_RETRIES = 3;

/** nbf 에 허용하는 시계 차이(초) */
const NBF_SKEW_SEC = 60;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

function trimSlash(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

/** schedule 입력 검사. 맞으면 그대로, 틀리면 null */
function readScheduleInput(input) {
  if (!isPlainObject(input)) return null;
  const { body, notBeforeMs, dedupId } = input;
  if (!isPlainObject(body)) return null;
  if (typeof notBeforeMs !== 'number' || !Number.isFinite(notBeforeMs)) return null;
  if (notBeforeMs < 0 || notBeforeMs > Number.MAX_SAFE_INTEGER) return null;
  if (!nonEmptyString(dedupId)) return null;
  return { body, notBeforeMs, dedupId };
}

/** 응답 본문을 읽지 않고 연결만 놓아 준다 */
function discard(response) {
  try {
    response?.body?.cancel().catch(() => {});
  } catch {
    // 놓아 주기 실패는 결과에 영향이 없다
  }
}

/**
 * QStash 예약 어댑터.
 * @param {{ url: string, token: string, baseUrl: string, protectionBypass?: string|null,
 *           fetchImpl?: typeof fetch, timeoutMs?: number }} config
 */
export function createQstashScheduler({
  url,
  token,
  baseUrl,
  protectionBypass = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
} = {}) {
  const qstashUrl = trimSlash(url);
  const appUrl = trimSlash(baseUrl);
  const ready = qstashUrl !== '' && appUrl !== '' && nonEmptyString(token) && typeof fetchImpl === 'function';

  async function schedule(input) {
    const valid = readScheduleInput(input);
    if (!ready || !valid) return { ok: false };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // 초로 올림한다. 내리면 마감 + 유예보다 최대 1초 일찍 도착할 수 있다
      'Upstash-Not-Before': String(Math.ceil(valid.notBeforeMs / 1000)),
      'Upstash-Deduplication-Id': valid.dedupId,
      'Upstash-Retries': String(PUBLISH_RETRIES),
    };
    if (nonEmptyString(protectionBypass)) headers['Upstash-Forward-x-vercel-protection-bypass'] = protectionBypass;
    try {
      // 응답 본문 읽기까지 timeoutMs 안에 끝나야 한다
      return await withTimeout(timeoutMs, async (signal) => {
        const response = await fetchImpl(`${qstashUrl}/v2/publish/${appUrl}${DUE_PATH}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(valid.body),
          signal,
        });
        if (!response.ok) {
          discard(response);
          return { ok: false };
        }
        const data = await response.json();
        const messageId = isPlainObject(data) ? data.messageId : undefined;
        return nonEmptyString(messageId) ? { ok: true, messageId } : { ok: false };
      });
    } catch {
      // 오류 객체에는 주소·토큰이 섞일 수 있어 읽지 않는다
      return { ok: false };
    }
  }

  async function cancel(messageId) {
    if (!ready || !nonEmptyString(messageId)) return false;
    try {
      return await withTimeout(timeoutMs, async (signal) => {
        const response = await fetchImpl(`${qstashUrl}/v2/messages/${encodeURIComponent(messageId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        discard(response);
        return response.ok || response.status === 404;
      });
    } catch {
      return false;
    }
  }

  return { schedule, cancel };
}

/** 메모리 예약. 테스트와 데모 모드에서 쓴다. messageId 는 'mem-' + 순번 */
export function createMemoryScheduler() {
  const messages = [];
  let seq = 0;
  return {
    messages,
    async schedule(input) {
      const valid = readScheduleInput(input);
      if (!valid) return { ok: false };
      seq += 1;
      const messageId = `mem-${seq}`;
      messages.push({ messageId, body: valid.body, notBeforeMs: valid.notBeforeMs, dedupId: valid.dedupId });
      return { ok: true, messageId };
    },
    async cancel(messageId) {
      const index = messages.findIndex((m) => m.messageId === messageId);
      if (index !== -1) messages.splice(index, 1);
      return true;
    },
  };
}

const SHARED_KEY = Symbol.for('safehour.watch.memoryScheduler');

/**
 * 프로세스에 하나뿐인 메모리 예약.
 * Next 는 라우트마다 모듈을 따로 실을 수 있어 모듈 변수가 아니라 globalThis 에 둔다(공용 메모리 kv 와 같은 방식).
 * 따로 실리면 순번이 다시 1부터 시작해 남아 있는 'mem-1' 로 다른 예약을 지울 수 있다.
 */
export function sharedMemoryScheduler() {
  globalThis[SHARED_KEY] ??= createMemoryScheduler();
  return globalThis[SHARED_KEY];
}

// ── 서명 검증 ──

/** 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** base64url 조각을 JSON 객체로 읽는다. 틀리면 null */
function decodeSegment(segment) {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function signatureMatches(signingInput, signatureSegment, key) {
  if (!nonEmptyString(key)) return false;
  const expected = createHmac('sha256', key).update(signingInput).digest('base64url');
  return safeEqual(signatureSegment, expected);
}

function stripPadding(value) {
  return value.replace(/=+$/, '');
}

// sub 는 QStash 가 부른 전체 주소다. 경로가 같고, https 이고, 쿼리·조각이 없어야 한다.
// 호스트는 보지 않는다(검증하는 쪽은 배포 주소를 모른다). 다른 배포로의 재전송은 본문 해시, 환경별 저장소 이름공간,
// 처리 쪽의 HSETNX 권리가 막는다.
function subPathMatches(sub, path) {
  if (typeof sub !== 'string') return false;
  try {
    const url = new URL(sub);
    return url.protocol === 'https:' && url.search === '' && url.hash === '' && url.pathname === path;
  } catch {
    return false;
  }
}

/**
 * QStash 가 보낸 `Upstash-Signature` 를 검증한다. 던지지 않는다.
 * @param {{ signature: unknown, rawBody: string|Uint8Array, currentKey: string, nextKey?: string,
 *           nowMs: number, path?: string }} input
 * @returns {boolean}
 */
export function verifyQstashSignature(input) {
  try {
    if (!isPlainObject(input)) return false;
    const { signature, rawBody, currentKey, nextKey, nowMs, path = DUE_PATH } = input;
    if (typeof signature !== 'string') return false;
    if (typeof rawBody !== 'string' && !(rawBody instanceof Uint8Array)) return false;
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;

    const segments = signature.split('.');
    if (segments.length !== 3 || !segments.every((s) => BASE64URL.test(s))) return false;
    const [headerSegment, payloadSegment, signatureSegment] = segments;

    // alg 를 먼저 본다. HS256 이 아니면 서명을 계산하지도 않는다
    const header = decodeSegment(headerSegment);
    if (!header || header.alg !== 'HS256') return false;

    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signed =
      signatureMatches(signingInput, signatureSegment, currentKey) ||
      signatureMatches(signingInput, signatureSegment, nextKey);
    if (!signed) return false;

    const claims = decodeSegment(payloadSegment);
    if (!claims) return false;
    if (claims.iss !== 'Upstash') return false;
    if (!Number.isFinite(claims.exp) || !(claims.exp * 1000 > nowMs)) return false;
    if (!Number.isFinite(claims.nbf) || !(claims.nbf * 1000 <= nowMs + NBF_SKEW_SEC * 1000)) return false;
    if (!subPathMatches(claims.sub, path)) return false;
    if (typeof claims.body !== 'string') return false;

    const bodyHash = createHash('sha256').update(rawBody).digest('base64url');
    return safeEqual(stripPadding(claims.body), stripPadding(bodyHash));
  } catch {
    return false;
  }
}
