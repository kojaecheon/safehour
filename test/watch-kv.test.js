// 서버 알림 저장소 어댑터 (lib/server/watch/kv.js): 메모리 구현과 Upstash REST 구현
//
// Upstash 쪽은 가짜 fetch 만 쓴다. 외부 호출 0건.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KvError, createMemoryKv, sharedMemoryKv, createUpstashKv, hashFromFlat } from '../lib/server/watch/kv.js';
import { fixedClock, IDS, SECRET } from './watch-fixtures.js';

function memory(at = '2026-11-20T03:00:00Z') {
  const clock = fixedClock(at);
  return { clock, kv: createMemoryKv({ now: clock.now }) };
}

test('고정 값: 식별 값과 비밀의 길이가 형식에 맞는다', () => {
  assert.equal(IDS.watchId.length, 22);
  assert.equal(IDS.writeToken.length, 43);
  assert.equal(IDS.accountKey.length, 43);
  assert.equal(IDS.otherAccountKey.length, 43);
  assert.equal(SECRET.length, 48);
});

test('메모리: SET NX 는 처음만 OK 이고 두 번째는 null 이다', async () => {
  const { kv } = memory();
  assert.deepEqual(await kv.exec([['SET', 'k', 'a', 'NX']]), ['OK']);
  assert.deepEqual(await kv.exec([['SET', 'k', 'b', 'NX']]), [null]);
  assert.deepEqual(await kv.exec([['GET', 'k']]), ['a']);
  assert.deepEqual(await kv.exec([['SET', 'k', 'c']]), ['OK']);
  assert.deepEqual(await kv.exec([['GET', 'k']]), ['c']);
});

test('메모리: EXAT 가 지나면 GET 이 null 이고 EXISTS 가 0 이다', async () => {
  const { kv, clock } = memory();
  const exat = Math.floor(clock.now() / 1000) + 600;
  await kv.exec([['SET', 'k', 'v', 'EXAT', exat]]);
  assert.deepEqual(await kv.exec([['GET', 'k'], ['EXISTS', 'k']]), ['v', 1]);
  clock.advanceMin(9);
  assert.deepEqual(await kv.exec([['EXISTS', 'k']]), [1]);
  clock.advanceMin(1);
  assert.deepEqual(await kv.exec([['GET', 'k'], ['EXISTS', 'k']]), [null, 0]);
  // 만료된 키에는 NX 가 다시 성공한다
  assert.deepEqual(await kv.exec([['SET', 'k', 'w', 'NX']]), ['OK']);
});

test('메모리: EXPIRE·EXPIREAT 는 해시와 집합에도 걸리고, 없는 키는 0 이다', async () => {
  const { kv, clock } = memory();
  const nowSec = Math.floor(clock.now() / 1000);
  assert.deepEqual(
    await kv.exec([
      ['HSET', 'h', 'f', 'v'],
      ['SADD', 's', 'a'],
      ['EXPIRE', 'h', 60],
      ['EXPIREAT', 's', nowSec + 120],
      ['EXPIRE', 'none', 60],
    ]),
    [1, 1, 1, 1, 0],
  );
  clock.advanceMin(1);
  assert.deepEqual(await kv.exec([['HGETALL', 'h'], ['SMEMBERS', 's']]), [[], ['a']]);
  clock.advanceMin(1);
  assert.deepEqual(await kv.exec([['SMEMBERS', 's']]), [[]]);
});

test('메모리: HSETNX 는 처음 1, 다음 0 이고 값은 처음 것이다', async () => {
  const { kv } = memory();
  assert.deepEqual(await kv.exec([['HSETNX', 'h', 'p:14:30', 'first']]), [1]);
  assert.deepEqual(await kv.exec([['HSETNX', 'h', 'p:14:30', 'second']]), [0]);
  const [flat] = await kv.exec([['HGETALL', 'h']]);
  assert.equal(hashFromFlat(flat)['p:14:30'], 'first');
});

test('메모리: HGETALL 은 평면 배열이고 hashFromFlat 이 객체로 바꾼다', async () => {
  const { kv } = memory();
  const [added] = await kv.exec([['HSET', 'h', 'dl', '["14:30"]', 'm', '1']]);
  assert.equal(added, 2);
  const [flat, missing] = await kv.exec([['HGETALL', 'h'], ['HGETALL', 'none']]);
  assert.ok(Array.isArray(flat));
  assert.equal(flat.length, 4);
  assert.deepEqual({ ...hashFromFlat(flat) }, { dl: '["14:30"]', m: '1' });
  assert.deepEqual(missing, []);
  // 필드 이름이 __proto__ 여도 객체 원형이 바뀌지 않는다
  const odd = hashFromFlat(['__proto__', 'x', 'a', 'b']);
  assert.equal(odd.a, 'b');
  assert.equal(Object.getPrototypeOf(odd), null);
  assert.deepEqual(hashFromFlat(null), Object.create(null));
});

test('메모리: HDEL 로 마지막 필드가 빠지면 키도 사라진다', async () => {
  const { kv } = memory();
  await kv.exec([['HSET', 'h', 'a', '1', 'b', '2']]);
  assert.deepEqual(await kv.exec([['HDEL', 'h', 'a', 'zz']]), [1]);
  assert.deepEqual(await kv.exec([['HDEL', 'h', 'b'], ['EXISTS', 'h']]), [1, 0]);
});

test('메모리: 집합과 INCR, DEL', async () => {
  const { kv } = memory();
  assert.deepEqual(
    await kv.exec([
      ['SADD', 's', 'a', 'b', 'a'],
      ['SREM', 's', 'b', 'c'],
      ['SMEMBERS', 's'],
      ['SMEMBERS', 'none'],
      ['INCR', 'n'],
      ['INCR', 'n'],
      ['DEL', 's', 'n', 'none'],
      ['EXISTS', 's'],
    ]),
    [2, 1, ['a'], [], 1, 2, 2, 0],
  );
});

test('메모리: 모르는 명령은 KV_COMMAND 를 던진다', async () => {
  const { kv } = memory();
  await assert.rejects(kv.exec([['KEYS', '*']]), (err) => err instanceof KvError && err.code === 'KV_COMMAND');
  // 형이 다른 키에 쓰는 명령도 KV_COMMAND 다
  await kv.exec([['SET', 's', 'v']]);
  await assert.rejects(kv.exec([['SADD', 's', 'a']]), (err) => err instanceof KvError && err.code === 'KV_COMMAND');
  await assert.rejects(kv.exec([['HSET', 'h', 'only-field']]), (err) => err.code === 'KV_COMMAND');
});

test('메모리: 인자 형식이 틀린 명령이 섞이면 배치 전체를 실행하지 않는다', async () => {
  const { kv } = memory();
  const bad = [
    ['GET'],
    ['GET', 'a', 'b'],
    ['SET', 'k'],
    ['SET', 'k', 'v', 'EX', 10],
    ['SET', 'k', 'v', 'EXAT'],
    ['SET', 'k', 'v', 'EXAT', 'soon'],
    ['EXPIRE', 'k'],
    ['EXPIRE', 'k', '1.5'],
    ['EXPIREAT', 'k', 'x'],
    ['INCR', 'a', 'b'],
    ['HSET', 'h', 'f'],
    ['HSET', 'h', 'f', 'v', 'g'],
    ['HSETNX', 'h', 'f'],
    ['HDEL', 'h'],
    ['HGETALL'],
    ['SADD', 's'],
    ['SREM', 's'],
    ['SMEMBERS'],
    ['DEL'],
    ['EXISTS'],
    [],
  ];
  for (const cmd of bad) {
    await assert.rejects(
      kv.exec([['SET', 'first', 'v'], ['SADD', 'set', 'm'], cmd]),
      (err) => err instanceof KvError && err.code === 'KV_COMMAND',
      JSON.stringify(cmd),
    );
    assert.deepEqual(await kv.exec([['EXISTS', 'first'], ['EXISTS', 'set']]), [0, 0], `${JSON.stringify(cmd)} 앞 명령이 실행됐다`);
  }
});

test('메모리: 실행 중 오류는 나머지 명령을 모두 실행한 뒤 KV_COMMAND 를 던진다', async () => {
  const { kv } = memory();
  await kv.exec([['SET', 'str', 'abc'], ['SADD', 'set', 'm']]);
  await assert.rejects(
    kv.exec([
      ['SET', 'before', '1'],
      ['INCR', 'str'],
      ['HSET', 'set', 'f', 'v'],
      ['SET', 'after', '2'],
    ]),
    (err) => err instanceof KvError && err.code === 'KV_COMMAND',
  );
  assert.deepEqual(await kv.exec([['GET', 'before'], ['GET', 'after'], ['GET', 'str'], ['SMEMBERS', 'set']]), ['1', '2', 'abc', ['m']]);
});

test('메모리: exec 는 결과를 명령 순서대로 돌려준다', async () => {
  const { kv } = memory();
  const out = await kv.exec([
    ['SET', 'a', '1'],
    ['GET', 'a'],
    ['INCR', 'a'],
    ['GET', 'a'],
    ['HSET', 'h', 'x', 'y'],
    ['HGETALL', 'h'],
    ['GET', 'none'],
  ]);
  assert.deepEqual(out, ['OK', '1', 2, '2', 1, ['x', 'y'], null]);
  assert.deepEqual(await kv.exec([]), []);
});

test('메모리: sharedMemoryKv 는 마지막으로 부른 쪽의 시계를 쓴다', async () => {
  const first = fixedClock('2026-11-20T03:00:00Z');
  const kv = sharedMemoryKv({ now: first.now });
  const exat = Math.floor(first.now() / 1000) + 600;
  await kv.exec([['SET', 'shared-clock', 'v', 'EXAT', exat]]);
  const later = fixedClock('2026-11-20T03:20:00Z');
  assert.equal(sharedMemoryKv({ now: later.now }), kv);
  // 처음 시계는 그대로지만 새 시계로는 만료가 지났다
  assert.deepEqual(await kv.exec([['GET', 'shared-clock']]), [null]);
});

test('메모리: sharedMemoryKv 는 프로세스에 하나다', async () => {
  const clock = fixedClock('2026-11-20T03:00:00Z');
  const a = sharedMemoryKv({ now: clock.now });
  const b = sharedMemoryKv({ now: clock.now });
  assert.equal(a, b);
  await a.exec([['SET', 'shared-test', 'v']]);
  assert.deepEqual(await b.exec([['GET', 'shared-test'], ['DEL', 'shared-test']]), ['v', 1]);
});

// ---- Upstash REST ----

const URL_BASE = 'https://upstash.example/';
const TOKEN = 'tok';

function fakeFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    return responder({ url, init, n: calls.length });
  };
  return { calls, fetchImpl };
}

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function upstash(responder) {
  const fake = fakeFetch(responder);
  return { ...fake, kv: createUpstashKv({ url: URL_BASE, token: TOKEN, fetchImpl: fake.fetchImpl }) };
}

test('Upstash: 명령 하나는 기본 주소로, 여러 개는 /multi-exec 로 보낸다', async () => {
  const { kv, calls } = upstash(({ n }) =>
    n === 1 ? jsonResponse(200, { result: 'OK' }) : jsonResponse(200, [{ result: 'OK' }, { result: 'v' }]),
  );
  await kv.exec([['SET', 'k', 'v', 'EXAT', 123]]);
  await kv.exec([['SET', 'k', 'v'], ['GET', 'k']]);
  assert.equal(calls.length, 2);

  assert.equal(calls[0].url, 'https://upstash.example');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.ok(calls[0].init.signal);
  assert.deepEqual(calls[0].body, ['SET', 'k', 'v', 'EXAT', 123]);

  assert.equal(calls[1].url, 'https://upstash.example/multi-exec');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[1].body, [['SET', 'k', 'v'], ['GET', 'k']]);
});

test('Upstash: 빈 배치는 요청을 보내지 않는다', async () => {
  const { kv, calls } = upstash(() => jsonResponse(200, { result: 'OK' }));
  assert.deepEqual(await kv.exec([]), []);
  assert.equal(calls.length, 0);
});

test('Upstash: 응답의 result 를 순서대로 돌려준다', async () => {
  const { kv } = upstash(({ n }) =>
    n === 1
      ? jsonResponse(200, { result: 7 })
      : jsonResponse(200, [{ result: 'OK' }, { result: null }, { result: ['f', 'v'] }, { result: 1 }]),
  );
  assert.deepEqual(await kv.exec([['INCR', 'n']]), [7]);
  assert.deepEqual(
    await kv.exec([['SET', 'a', '1'], ['GET', 'b'], ['HGETALL', 'h'], ['HSETNX', 'h', 'x', '1']]),
    ['OK', null, ['f', 'v'], 1],
  );
});

test('Upstash: HGETALL 이 객체나 null 로 와도 평면 배열로 맞춘다', async () => {
  const { kv } = upstash(() => jsonResponse(200, [{ result: { dl: '[]', m: '1' } }, { result: null }, { result: null }]));
  const [flat, empty, members] = await kv.exec([['HGETALL', 'h'], ['HGETALL', 'none'], ['SMEMBERS', 'none']]);
  assert.deepEqual({ ...hashFromFlat(flat) }, { dl: '[]', m: '1' });
  assert.deepEqual(empty, []);
  assert.deepEqual(members, []);
});

test('Upstash: HTTP 500 과 fetch 예외는 KV_UNAVAILABLE, 응답 안의 error 는 KV_COMMAND 다', async () => {
  const isCode = (code) => (err) => err instanceof KvError && err.code === code;

  await assert.rejects(upstash(() => jsonResponse(500, { error: 'boom' })).kv.exec([['GET', 'k']]), isCode('KV_UNAVAILABLE'));
  await assert.rejects(upstash(() => jsonResponse(401, { error: 'WRONGPASS' })).kv.exec([['GET', 'k']]), isCode('KV_UNAVAILABLE'));
  await assert.rejects(
    upstash(() => {
      throw new TypeError('fetch failed https://upstash.example tok');
    }).kv.exec([['GET', 'k']]),
    isCode('KV_UNAVAILABLE'),
  );
  await assert.rejects(upstash(() => new Response('not json', { status: 200 })).kv.exec([['GET', 'k']]), isCode('KV_UNAVAILABLE'));

  // 단일 명령의 error, 400 의 error, 트랜잭션 안 한 줄의 error, 트랜잭션 전체 폐기
  await assert.rejects(upstash(() => jsonResponse(200, { error: 'ERR x' })).kv.exec([['GET', 'k']]), isCode('KV_COMMAND'));
  await assert.rejects(upstash(() => jsonResponse(400, { error: 'ERR syntax' })).kv.exec([['GET', 'k']]), isCode('KV_COMMAND'));
  await assert.rejects(
    upstash(() => jsonResponse(200, [{ result: 'OK' }, { error: 'ERR value is not an int' }])).kv.exec([
      ['SET', 'a', 'x'],
      ['INCR', 'a'],
    ]),
    isCode('KV_COMMAND'),
  );
  await assert.rejects(
    upstash(() => jsonResponse(400, { error: 'ERR discarded' })).kv.exec([
      ['SET', 'a', 'x'],
      ['GET', 'a'],
    ]),
    isCode('KV_COMMAND'),
  );
  // 결과 수가 명령 수와 다르면 믿지 않는다
  await assert.rejects(
    upstash(() => jsonResponse(200, [{ result: 'OK' }])).kv.exec([
      ['SET', 'a', 'x'],
      ['GET', 'a'],
    ]),
    isCode('KV_UNAVAILABLE'),
  );
});

test('Upstash: 실패 응답의 본문은 읽지 않고 놓는다', async () => {
  let cancelled = 0;
  let read = false;
  const markRead = async () => {
    read = true;
    return {};
  };
  const response = (status, cancel) => ({
    ok: false,
    status,
    json: markRead,
    text: markRead,
    body: { cancel },
  });
  const { kv } = upstash(() =>
    response(503, async () => {
      cancelled += 1;
    }),
  );
  await assert.rejects(kv.exec([['GET', 'k']]), (err) => err.code === 'KV_UNAVAILABLE');
  assert.equal(cancelled, 1);
  assert.equal(read, false);
  // 놓기가 실패해도 같은 오류다
  const failing = upstash(() =>
    response(401, async () => {
      throw new Error('cancel failed');
    }),
  );
  await assert.rejects(failing.kv.exec([['GET', 'k']]), (err) => err.code === 'KV_UNAVAILABLE');
  assert.equal(read, false);
});

test('Upstash: 시간 초과는 KV_UNAVAILABLE 이다', async () => {
  const kv = createUpstashKv({
    url: URL_BASE,
    token: TOKEN,
    timeoutMs: 20,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      }),
  });
  await assert.rejects(kv.exec([['GET', 'k']]), (err) => err instanceof KvError && err.code === 'KV_UNAVAILABLE');
});

test('Upstash: 오류 메시지와 속성에 주소·토큰·명령이 없다', async () => {
  const cases = [
    () => jsonResponse(500, { error: 'tok upstash.example SET' }),
    () => jsonResponse(200, { error: 'ERR SET tok' }),
    () => {
      throw new Error('connect https://upstash.example Bearer tok');
    },
  ];
  for (const responder of cases) {
    const { kv } = upstash(responder);
    try {
      await kv.exec([['SET', 'secret-key', 'secret-value']]);
      assert.fail('던져야 한다');
    } catch (err) {
      assert.ok(err instanceof KvError);
      const text = `${err.message} ${JSON.stringify(err)} ${String(err.cause ?? '')}`;
      for (const banned of ['tok', 'upstash.example', 'SET', 'secret-key', 'secret-value']) {
        assert.ok(!text.includes(banned), `${banned} 가 오류에 들어 있다`);
      }
      assert.deepEqual(Object.keys(err).sort(), ['code', 'name']);
    }
  }
});
