// 예약 어댑터 (docs/superpowers/plans/2026-11-14-server-push-foundation.md 작업 4)
//
// 계약
//   - QStash 발행: 주소, 인증, 지연(유닉스 초, 올림), 중복 제거 id, 재시도 횟수, 보호 우회 전달 헤더
//   - 취소: DELETE, 2xx·404 는 true, 그 밖과 예외는 false
//   - 서명 검증: HS256 JWT, 지금 키 또는 다음 키, iss·exp·nbf·body·sub 경로를 모두 본다
//   - schedule·cancel·verifyQstashSignature 는 던지지 않고, 결과에 토큰·주소·본문이 섞이지 않는다
//
// 외부 호출은 없다. fetch 는 가짜이고 JWT 는 테스트 안에서 createHmac 으로 직접 만든다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import {
  DUE_PATH,
  createMemoryScheduler,
  createQstashScheduler,
  sharedMemoryScheduler,
  verifyQstashSignature,
} from '../lib/server/watch/scheduler.js';

const QSTASH_URL = 'https://qstash.example';
const TOKEN = 'qtok-secret-value';
const BASE_URL = 'https://app.example';
const BYPASS = 'bypass-secret-value';
const CURRENT_KEY = 'sig_current_key_value';
const NEXT_KEY = 'sig_next_key_value';
const NOW_MS = 1_800_000_000_000;
const NOW_SEC = NOW_MS / 1000;

/** 부른 내용을 모으는 가짜 fetch */
function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetchImpl };
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function scheduler(fetchImpl, extra = {}) {
  return createQstashScheduler({ url: QSTASH_URL, token: TOKEN, baseUrl: BASE_URL, fetchImpl, ...extra });
}

const BODY = { watchKey: 'k'.repeat(43), date: '2026-11-20', time: '18:00' };
const NOT_BEFORE_MS = 1_800_000_123_456;

// ── JWT 만들기 ──

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function bodyHash(rawBody, { padded = true } = {}) {
  const hash = createHash('sha256').update(rawBody).digest('base64url');
  // 문서 예시 값은 끝에 '=' 이 붙어 있다. 검증은 양쪽 '=' 을 떼고 비교하므로 붙여서도 시험한다
  return padded ? hash + '=' : hash;
}

function makeJwt({ key = CURRENT_KEY, header = { alg: 'HS256', typ: 'JWT' }, claims = {}, rawBody = RAW_BODY } = {}) {
  const payload = {
    iss: 'Upstash',
    sub: `${BASE_URL}${DUE_PATH}`,
    exp: NOW_SEC + 300,
    nbf: NOW_SEC,
    iat: NOW_SEC,
    jti: 'jwt_1',
    body: bodyHash(rawBody),
    ...claims,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', key).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

const RAW_BODY = JSON.stringify(BODY);

function verify(signature, overrides = {}) {
  return verifyQstashSignature({
    signature,
    rawBody: RAW_BODY,
    currentKey: CURRENT_KEY,
    nextKey: NEXT_KEY,
    nowMs: NOW_MS,
    ...overrides,
  });
}

// ── 발행 ──

test('발행 요청의 주소와 헤더', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  const result = await scheduler(fetchImpl).schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'dedup_1' });

  assert.deepEqual(result, { ok: true, messageId: 'msg_1' });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://qstash.example/v2/publish/https://app.example/api/watch/due');
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('upstash-not-before'), String(Math.ceil(NOT_BEFORE_MS / 1000)));
  assert.equal(headers.get('upstash-not-before'), '1800000124');
  assert.equal(headers.get('upstash-deduplication-id'), 'dedup_1');
  assert.equal(headers.get('upstash-retries'), '3');
  assert.equal(init.body, JSON.stringify(BODY));
  assert.ok(init.signal instanceof AbortSignal, '제한시간 신호를 건다');
});

test('발행 주소는 끝의 / 가 있어도 한 번만 이어 붙인다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  await createQstashScheduler({ url: `${QSTASH_URL}/`, token: TOKEN, baseUrl: `${BASE_URL}/`, fetchImpl })
    .schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'dedup_1' });
  assert.equal(calls[0].url, 'https://qstash.example/v2/publish/https://app.example/api/watch/due');
});

test('notBeforeMs 가 초 경계에 딱 맞으면 그 초를 그대로 쓴다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  await scheduler(fetchImpl).schedule({ body: BODY, notBeforeMs: 1_800_000_000_000, dedupId: 'd' });
  assert.equal(new Headers(calls[0].init.headers).get('upstash-not-before'), '1800000000');
});

test('보호 우회 값이 있으면 전달 헤더를 붙이고, 없으면 붙이지 않는다', async () => {
  const withBypass = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  await scheduler(withBypass.fetchImpl, { protectionBypass: BYPASS })
    .schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' });
  const h1 = new Headers(withBypass.calls[0].init.headers);
  assert.equal(h1.get('upstash-forward-x-vercel-protection-bypass'), BYPASS);

  const without = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  await scheduler(without.fetchImpl).schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' });
  const h2 = new Headers(without.calls[0].init.headers);
  assert.equal(h2.get('upstash-forward-x-vercel-protection-bypass'), null);
  for (const [name] of h2) assert.ok(!name.startsWith('upstash-forward-'), `전달 헤더가 없다: ${name}`);
});

test('발행 실패(HTTP 500, 예외, messageId 없음)는 { ok: false } 이고 던지지 않는다', async () => {
  const cases = [
    () => jsonResponse(500, { error: 'boom' }),
    () => {
      throw new Error('network down');
    },
    () => jsonResponse(200, {}),
    () => jsonResponse(200, { messageId: '' }),
    () => jsonResponse(200, { messageId: 42 }),
    () => new Response('not json', { status: 200 }),
  ];
  for (const respond of cases) {
    const { fetchImpl } = fakeFetch(respond);
    const result = await scheduler(fetchImpl).schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' });
    assert.deepEqual(result, { ok: false });
  }
});

test('발행 입력이 틀리면 부르지 않고 { ok: false } 다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  const s = scheduler(fetchImpl);
  for (const input of [
    undefined,
    { body: null, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' },
    { body: BODY, notBeforeMs: Number.NaN, dedupId: 'd' },
    { body: BODY, notBeforeMs: '1', dedupId: 'd' },
    { body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: '' },
    { body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 7 },
  ]) {
    assert.deepEqual(await s.schedule(input), { ok: false });
  }
  assert.equal(calls.length, 0);
});

test('설정이 비어 있으면 부르지 않고 { ok: false }, 취소는 false 다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, { messageId: 'msg_1' }));
  const s = createQstashScheduler({ url: '', token: '', baseUrl: '', fetchImpl });
  assert.deepEqual(await s.schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' }), { ok: false });
  assert.equal(await s.cancel('msg_1'), false);
  assert.equal(calls.length, 0);
});

test('제한시간이 지나면 { ok: false } 다', async () => {
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const result = await scheduler(fetchImpl, { timeoutMs: 20 }).schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd' });
  assert.deepEqual(result, { ok: false });
});

// ── 취소 ──

test('취소는 DELETE 를 보내고 2xx·404 는 true, 500·예외는 false 다', async () => {
  const ok = fakeFetch(() => jsonResponse(202, { cancelled: 1 }));
  assert.equal(await scheduler(ok.fetchImpl).cancel('msg_1'), true);
  assert.equal(ok.calls[0].url, 'https://qstash.example/v2/messages/msg_1');
  assert.equal(ok.calls[0].init.method, 'DELETE');
  assert.equal(new Headers(ok.calls[0].init.headers).get('authorization'), `Bearer ${TOKEN}`);
  assert.ok(ok.calls[0].init.signal instanceof AbortSignal);

  const ok200 = fakeFetch(() => new Response(null, { status: 200 }));
  assert.equal(await scheduler(ok200.fetchImpl).cancel('msg_1'), true);

  const missing = fakeFetch(() => jsonResponse(404, { error: 'message not found' }));
  assert.equal(await scheduler(missing.fetchImpl).cancel('msg_1'), true);

  const failed = fakeFetch(() => jsonResponse(500, { error: 'boom' }));
  assert.equal(await scheduler(failed.fetchImpl).cancel('msg_1'), false);

  const forbidden = fakeFetch(() => jsonResponse(401, { error: 'unauthorized' }));
  assert.equal(await scheduler(forbidden.fetchImpl).cancel('msg_1'), false);

  const thrown = fakeFetch(() => {
    throw new Error('network down');
  });
  assert.equal(await scheduler(thrown.fetchImpl).cancel('msg_1'), false);
});

test('취소할 id 가 문자열이 아니거나 비면 부르지 않고 false 다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(202, { cancelled: 1 }));
  const s = scheduler(fetchImpl);
  for (const id of [undefined, null, '', 12, {}]) assert.equal(await s.cancel(id), false);
  assert.equal(calls.length, 0);
});

test('취소 경로의 id 는 경로 조각 하나로 들어간다', async () => {
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(202, { cancelled: 1 }));
  await scheduler(fetchImpl).cancel('../publish/x');
  assert.equal(calls[0].url, 'https://qstash.example/v2/messages/..%2Fpublish%2Fx');
});

// ── 서명 ──

test('서명: 지금 키로 만든 JWT 는 통과한다', () => {
  assert.equal(verify(makeJwt({ key: CURRENT_KEY })), true);
});

test('서명: body 클레임에 끝 = 이 없어도 통과한다', () => {
  assert.equal(verify(makeJwt({ claims: { body: bodyHash(RAW_BODY, { padded: false }) } })), true);
});

test('서명: 다음 키로 만든 JWT 도 통과한다', () => {
  assert.equal(verify(makeJwt({ key: NEXT_KEY })), true);
});

test('서명: 다음 키가 없으면 지금 키만 본다', () => {
  assert.equal(verify(makeJwt({ key: CURRENT_KEY }), { nextKey: undefined }), true);
  assert.equal(verify(makeJwt({ key: NEXT_KEY }), { nextKey: undefined }), false);
  assert.equal(verify(makeJwt({ key: NEXT_KEY }), { nextKey: '' }), false);
});

test('서명: 본문이 한 글자라도 다르면 거짓이다', () => {
  const jwt = makeJwt();
  assert.equal(verify(jwt, { rawBody: RAW_BODY.replace('18:00', '18:01') }), false);
  assert.equal(verify(jwt, { rawBody: RAW_BODY + ' ' }), false);
  assert.equal(verify(jwt, { rawBody: '' }), false);
});

test('서명: 만료됐거나, nbf 가 미래이거나, iss 가 다르거나, 경로가 다르면 거짓이다', () => {
  // 만료
  assert.equal(verify(makeJwt({ claims: { exp: NOW_SEC - 1 } })), false);
  assert.equal(verify(makeJwt({ claims: { exp: NOW_SEC } })), false);
  // nbf: 지금 + 60초까지는 받고 그 뒤는 거절
  assert.equal(verify(makeJwt({ claims: { nbf: NOW_SEC + 60 } })), true);
  assert.equal(verify(makeJwt({ claims: { nbf: NOW_SEC + 61 } })), false);
  // iss
  assert.equal(verify(makeJwt({ claims: { iss: 'upstash' } })), false);
  assert.equal(verify(makeJwt({ claims: { iss: 'Evil' } })), false);
  // sub 경로
  assert.equal(verify(makeJwt({ claims: { sub: `${BASE_URL}/api/other` } })), false);
  assert.equal(verify(makeJwt({ claims: { sub: `${BASE_URL}${DUE_PATH}/x` } })), false);
  assert.equal(verify(makeJwt({ claims: { sub: 'not a url' } })), false);
  assert.equal(verify(makeJwt()), true);
  assert.equal(verify(makeJwt({ claims: { sub: `${BASE_URL}/api/other` } }), { path: '/api/other' }), true);
  // 클레임이 빠지거나 모양이 틀림
  for (const claim of ['iss', 'sub', 'exp', 'nbf', 'body']) {
    assert.equal(verify(makeJwt({ claims: { [claim]: undefined } })), false, `${claim} 없음`);
  }
  assert.equal(verify(makeJwt({ claims: { exp: String(NOW_SEC + 300) } })), false);
  assert.equal(verify(makeJwt({ claims: { body: 42 } })), false);
});

test('서명: alg 가 none 이거나 조각 수가 틀리거나 값이 문자열이 아니면 거짓이고 던지지 않는다', () => {
  // alg none: 서명 조각을 비워도, HMAC 을 붙여도 거절
  const noneHeader = { alg: 'none', typ: 'JWT' };
  const noneJwt = makeJwt({ header: noneHeader });
  assert.equal(verify(noneJwt), false);
  assert.equal(verify(noneJwt.split('.').slice(0, 2).join('.') + '.'), false);
  assert.equal(verify(makeJwt({ header: { alg: 'HS512', typ: 'JWT' } })), false);
  assert.equal(verify(makeJwt({ header: { typ: 'JWT' } })), false);

  const good = makeJwt();
  const [h, p, s] = good.split('.');
  const malformed = [
    undefined,
    null,
    42,
    {},
    ['a', 'b', 'c'],
    '',
    'abc',
    `${h}.${p}`,
    `${h}.${p}.${s}.extra`,
    `${h}..${s}`,
    `!!!.${p}.${s}`,
    `${b64url('not json')}.${p}.${s}`,
    `${h}.${b64url('not json')}.${s}`,
    `${b64url('null')}.${p}.${s}`,
    `${h}.${b64url('[]')}.${s}`,
    `${h}.${p}.${s}x`,
    `${h}.${p}.${s.slice(0, -2)}`,
  ];
  for (const signature of malformed) {
    assert.doesNotThrow(() => verify(signature));
    assert.equal(verify(signature), false, String(signature));
  }
  // 본문·키가 문자열이 아님
  assert.equal(verify(good, { rawBody: undefined }), false);
  assert.equal(verify(good, { rawBody: BODY }), false);
  assert.equal(verify(good, { currentKey: undefined, nextKey: undefined }), false);
  assert.equal(verify(good, { currentKey: '', nextKey: '' }), false);
  assert.equal(verify(good, { nowMs: Number.NaN }), false);
  assert.doesNotThrow(() => verifyQstashSignature());
  assert.equal(verifyQstashSignature(), false);
});

test('서명: 다른 키로 만든 JWT 는 거짓이다', () => {
  assert.equal(verify(makeJwt({ key: 'some_other_key' })), false);
});

test('서명: 본문은 Buffer 로 받아도 같은 결과다', () => {
  assert.equal(verify(makeJwt(), { rawBody: Buffer.from(RAW_BODY) }), true);
});

// ── 메모리 구현 ──

test('메모리 예약은 메시지를 쌓고 cancel 이 뺀다', async () => {
  const mem = createMemoryScheduler();
  const first = await mem.schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd1' });
  const second = await mem.schedule({ body: { ...BODY, time: '19:00' }, notBeforeMs: NOT_BEFORE_MS + 1, dedupId: 'd2' });
  assert.deepEqual(first, { ok: true, messageId: 'mem-1' });
  assert.deepEqual(second, { ok: true, messageId: 'mem-2' });
  assert.deepEqual(mem.messages, [
    { messageId: 'mem-1', body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd1' },
    { messageId: 'mem-2', body: { ...BODY, time: '19:00' }, notBeforeMs: NOT_BEFORE_MS + 1, dedupId: 'd2' },
  ]);

  assert.equal(await mem.cancel('mem-1'), true);
  assert.deepEqual(mem.messages.map((m) => m.messageId), ['mem-2']);
  // 이미 없는 것도 true (QStash 의 404 와 같게)
  assert.equal(await mem.cancel('mem-1'), true);
  assert.equal(mem.messages.length, 1);

  // 다른 인스턴스와 순번을 나누지 않는다
  const other = createMemoryScheduler();
  assert.deepEqual(await other.schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'd1' }), { ok: true, messageId: 'mem-1' });
});

test('메모리 예약도 입력이 틀리면 { ok: false } 다', async () => {
  const mem = createMemoryScheduler();
  assert.deepEqual(await mem.schedule({ body: BODY, notBeforeMs: 'x', dedupId: 'd' }), { ok: false });
  assert.deepEqual(await mem.schedule(undefined), { ok: false });
  assert.equal(mem.messages.length, 0);
});

test('공용 메모리 예약은 프로세스에 하나이고 globalThis 에 산다', () => {
  assert.equal(sharedMemoryScheduler(), sharedMemoryScheduler());
  assert.notEqual(sharedMemoryScheduler(), createMemoryScheduler());
  assert.equal(globalThis[Symbol.for('safehour.watch.memoryScheduler')], sharedMemoryScheduler());
});

test('메모리 예약은 범위 밖 notBeforeMs 를 받지 않는다', async () => {
  const mem = createMemoryScheduler();
  for (const notBeforeMs of [-1500, 1e300]) {
    assert.deepEqual(await mem.schedule({ body: BODY, notBeforeMs, dedupId: 'd' }), { ok: false });
  }
  assert.equal(mem.messages.length, 0);
});

// ── 새지 않음 ──

test('결과와 예외에 토큰·주소가 없다', async () => {
  const secrets = [TOKEN, BYPASS, QSTASH_URL, 'qstash.example', 'app.example', DUE_PATH, 'dedup_secret', BODY.watchKey];
  const responders = [
    () => {
      throw new Error(`fetch failed ${QSTASH_URL}/v2/publish/${BASE_URL}${DUE_PATH} Bearer ${TOKEN} ${BYPASS}`);
    },
    () => jsonResponse(500, { error: `bad token ${TOKEN}` }),
    () => jsonResponse(404, { error: `not found ${QSTASH_URL}` }),
    () => jsonResponse(200, { messageId: 'msg_1', echo: TOKEN }),
  ];
  for (const respond of responders) {
    const { fetchImpl } = fakeFetch(respond);
    const s = scheduler(fetchImpl, { protectionBypass: BYPASS });
    const scheduled = await s.schedule({ body: BODY, notBeforeMs: NOT_BEFORE_MS, dedupId: 'dedup_secret' });
    const cancelled = await s.cancel('msg_1');
    const text = JSON.stringify({ scheduled, cancelled });
    for (const secret of secrets) assert.ok(!text.includes(secret), `결과에 ${secret} 가 없다`);
    // 성공 결과는 messageId 하나만 담는다
    if (scheduled.ok) assert.deepEqual(Object.keys(scheduled).sort(), ['messageId', 'ok']);
  }
  // 서명 검증은 불리언만 돌려준다
  assert.equal(typeof verify('garbage'), 'boolean');
});

test('어댑터 객체의 속성 값에 토큰이 없다(클로저 안에만 있다)', () => {
  const s = scheduler(async () => jsonResponse(200, { messageId: 'msg_1' }), { protectionBypass: BYPASS });
  assert.deepEqual(Object.keys(s).sort(), ['cancel', 'schedule']);
  for (const value of Object.values(s)) assert.equal(typeof value, 'function');
});

test('서명: null·배열·문자열 입력에도 던지지 않고 거짓이다', () => {
  for (const input of [null, undefined, [], 'x', 42]) assert.equal(verifyQstashSignature(input), false);
});

test('서명: exp·nbf 가 무한대이면 거짓이다', () => {
  // JSON 에서 1e400 은 Infinity 가 된다. 키를 가진 쪽만 만들 수 있지만 유한한 값만 받는다
  const tamper = (claimsJson) => {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(claimsJson);
    const sig = createHmac('sha256', CURRENT_KEY).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
  };
  const base = `"iss":"Upstash","sub":"${BASE_URL}${DUE_PATH}","body":"${bodyHash(RAW_BODY)}"`;
  assert.equal(verify(tamper(`{${base},"exp":1e400,"nbf":${NOW_SEC}}`)), false);
  assert.equal(verify(tamper(`{${base},"exp":${NOW_SEC + 300},"nbf":-1e400}`)), false);
  assert.equal(verify(tamper(`{${base},"exp":${NOW_SEC + 300},"nbf":${NOW_SEC}}`)), true);
});

test('서명: sub 는 https 이고 쿼리·조각이 없어야 한다', () => {
  for (const sub of [`http://app.example${DUE_PATH}`, `${BASE_URL}${DUE_PATH}?x=1`, `${BASE_URL}${DUE_PATH}#f`]) {
    assert.equal(verify(makeJwt({ claims: { sub } })), false, sub);
  }
  // 호스트는 보지 않는다(설계상 의도, 본문 해시·이름공간·HSETNX 가 재전송을 막는다)
  assert.equal(verify(makeJwt({ claims: { sub: `https://other.example${DUE_PATH}` } })), true);
});
