// 푸시 한 건 보내기와 결과 분류. src/push/AGENTS.md
// 가짜 fetchImpl 만 쓴다. 실제 네트워크 호출은 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, generateKeyPairSync, randomBytes } from 'node:crypto';

import { PUSH_OUTCOME, createVapidSigner, decryptPushPayload, sendPush } from '../src/push/index.js';

const NOW = Date.UTC(2026, 10, 14, 3, 0, 0);
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/sub-token-abc';

function makeSigner() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.of(0x04), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  return createVapidSigner({ publicKey, privateKey: jwk.d, subject: 'mailto:ops@safehour.example' });
}

function makeSubscription(endpoint = ENDPOINT) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16).toString('base64url');
  return {
    subscription: { endpoint, p256dh: ecdh.getPublicKey('base64url', 'uncompressed'), auth },
    privateKey: ecdh.getPrivateKey(),
  };
}

function fakeFetch(respond = () => new Response(null, { status: 201 })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetchImpl };
}

const SIGNER = makeSigner();
const PAYLOAD = JSON.stringify({ title: '알림', body: '복귀 확인' });

function send(overrides = {}) {
  const { subscription } = overrides.subscription ? overrides : makeSubscription();
  return sendPush({ subscription, payload: PAYLOAD, signer: SIGNER, nowMs: NOW, ...overrides });
}

test('요청은 POST, 리디렉트를 따라가지 않고, 헤더가 정해진 대로다', async () => {
  const { subscription, privateKey } = makeSubscription();
  const { calls, fetchImpl } = fakeFetch();
  const result = await sendPush({ subscription, payload: PAYLOAD, signer: SIGNER, topic: 'abcDEF_-123', fetchImpl, nowMs: NOW });
  assert.deepEqual(result, { outcome: PUSH_OUTCOME.SENT, statusClass: '2xx' });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  assert.ok(init.signal instanceof AbortSignal);
  const headers = new Headers(init.headers);
  assert.ok(headers.get('Authorization').startsWith('vapid t='));
  assert.equal(headers.get('Content-Encoding'), 'aes128gcm');
  assert.equal(headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(headers.get('TTL'), '3600');
  assert.equal(headers.get('Urgency'), 'high');
  assert.equal(headers.get('Topic'), 'abcDEF_-123');
  const body = Buffer.from(init.body);
  assert.equal(decryptPushPayload({ body, privateKey, auth: subscription.auth }).toString('utf8'), PAYLOAD);
});

test('ttlSec 와 urgency 를 주면 그 값이 헤더에 실린다', async () => {
  const { calls, fetchImpl } = fakeFetch();
  await send({ fetchImpl, ttlSec: 600, urgency: 'normal' });
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('TTL'), '600');
  assert.equal(headers.get('Urgency'), 'normal');
});

test('topic 이 형식에 맞지 않으면 Topic 헤더를 넣지 않는다', async () => {
  for (const topic of ['a b', 'a'.repeat(33), '', 'a.b', undefined, 42]) {
    const { calls, fetchImpl } = fakeFetch();
    const result = await send({ fetchImpl, topic });
    assert.equal(result.outcome, PUSH_OUTCOME.SENT);
    assert.equal(new Headers(calls[0].init.headers).has('Topic'), false, String(topic));
  }
  const { calls, fetchImpl } = fakeFetch();
  await send({ fetchImpl, topic: 'a'.repeat(32) });
  assert.equal(new Headers(calls[0].init.headers).get('Topic'), 'a'.repeat(32));
});

test('응답 상태를 결과로 나눈다', async () => {
  const table = [
    [200, 'SENT', '2xx'],
    [201, 'SENT', '2xx'],
    [202, 'SENT', '2xx'],
    [404, 'GONE', '404/410'],
    [410, 'GONE', '404/410'],
    [429, 'RETRY', '4xx'],
    [500, 'RETRY', '5xx'],
    [503, 'RETRY', '5xx'],
    [400, 'REJECTED', '4xx'],
    [403, 'REJECTED', '4xx'],
    [413, 'REJECTED', '4xx'],
    [301, 'REJECTED', '4xx'],
  ];
  for (const [status, outcome, statusClass] of table) {
    const { fetchImpl } = fakeFetch(() => new Response(status >= 300 && status < 400 ? null : 'service text', {
      status,
      headers: status === 301 ? { Location: 'https://evil.example/' } : {},
    }));
    assert.deepEqual(await send({ fetchImpl }), { outcome, statusClass }, String(status));
  }
});

test('fetch 가 던지거나 시간 초과면 RETRY/network 이고 예외가 새지 않는다', async () => {
  const throwing = async () => {
    throw new Error(`connect ECONNREFUSED ${ENDPOINT}`);
  };
  assert.deepEqual(await send({ fetchImpl: throwing }), { outcome: 'RETRY', statusClass: 'network' });

  const hanging = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  assert.deepEqual(await send({ fetchImpl: hanging, timeoutMs: 20 }), { outcome: 'RETRY', statusClass: 'network' });

  assert.deepEqual(await send({ fetchImpl: () => { throw new TypeError('sync'); } }), { outcome: 'RETRY', statusClass: 'network' });
});

test('허용 목록 밖 endpoint 나 틀린 구독 키는 fetch 를 부르지 않고 REJECTED 다', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const good = makeSubscription().subscription;
  const cases = [
    { ...good, endpoint: 'https://evil.com/fcm.googleapis.com' },
    { ...good, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' },
    { ...good, endpoint: 'http://127.0.0.1:3199/push/abc' },
    { ...good, p256dh: good.p256dh.slice(0, 40) },
    { ...good, auth: 'short' },
    null,
  ];
  for (const subscription of cases) {
    const result = await sendPush({ subscription, payload: PAYLOAD, signer: SIGNER, fetchImpl, nowMs: NOW });
    assert.deepEqual(result, { outcome: 'REJECTED', statusClass: '4xx' });
  }
  const tooLarge = await sendPush({ subscription: good, payload: 'x'.repeat(4000), signer: SIGNER, fetchImpl, nowMs: NOW });
  assert.deepEqual(tooLarge, { outcome: 'REJECTED', statusClass: '4xx' });
  assert.equal(calls.length, 0);
});

test('testOrigin 이 주어지면 그 출처의 가짜 푸시 서비스로 보낸다', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const { subscription } = makeSubscription('http://127.0.0.1:3199/push/abc');
  const result = await sendPush({
    subscription, payload: PAYLOAD, signer: SIGNER, fetchImpl, nowMs: NOW, testOrigin: 'http://127.0.0.1:3199',
  });
  assert.equal(result.outcome, 'SENT');
  assert.equal(calls.length, 1);
});

test('결과 객체에는 outcome 과 statusClass 뿐이다', async () => {
  const responders = [
    () => new Response('ok', { status: 201 }),
    () => new Response('{"reason":"UnsubscribedOrExpired"}', { status: 410 }),
    () => new Response('detail', { status: 500 }),
    () => { throw new Error('boom'); },
  ];
  for (const respond of responders) {
    const { fetchImpl } = fakeFetch(respond);
    const result = await send({ fetchImpl });
    assert.deepEqual(Object.keys(result).sort(), ['outcome', 'statusClass']);
    assert.equal(JSON.stringify(result).includes('fcm.googleapis.com'), false);
  }
  const rejected = await sendPush({ subscription: null, payload: PAYLOAD, signer: SIGNER, nowMs: NOW });
  assert.deepEqual(Object.keys(rejected).sort(), ['outcome', 'statusClass']);
});

test('인자가 없거나 null 이어도 던지지 않고 REJECTED 다', async () => {
  assert.deepEqual(await sendPush(), { outcome: PUSH_OUTCOME.REJECTED, statusClass: '4xx' });
  assert.deepEqual(await sendPush(null), { outcome: PUSH_OUTCOME.REJECTED, statusClass: '4xx' });
});

test('시간 한도가 틀린 값이면 fetch 없이 REJECTED 다(끝없는 재시도를 막는다)', async () => {
  for (const timeoutMs of [-1, 0, null, 1.5, Number.NaN, '5000']) {
    const { calls, fetchImpl } = fakeFetch();
    const result = await send({ fetchImpl, timeoutMs });
    assert.deepEqual(result, { outcome: PUSH_OUTCOME.REJECTED, statusClass: '4xx' }, String(timeoutMs));
    assert.equal(calls.length, 0);
  }
});
