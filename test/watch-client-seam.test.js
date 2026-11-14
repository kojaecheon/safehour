// 서버 알림 클라이언트·서버 이음매 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3, D16 ·
// docs/standards.md '클라이언트와 서버가 주고받는 요청 모양은 양쪽을 이은 테스트로 묶는다')
//
// 진짜 요청 모양(src/guardian/watchRequests.js)과 진짜 sendWatchRequest(lib/trip/watchApi.js)를 진짜 처리기
// createWatchHandlers({ env: watchRouteEnv(), now: ctx.now, ctx: testCtx() })에 잇는다. 서버 검증은 느슨하게 하지 않는다.
// fetchImpl 어댑터는 받은 (경로, init)을 그대로 Request 로 만들어 메서드·경로에 맞는 처리기에 넣는다(쿠키만 더한다).
// 저장소는 메모리, 예약과 푸시는 기록기라 외부 호출이 없다. 시계는 testCtx 기본값 2026-11-20 12:00 KST 에서 ctx.clock 으로만 움직인다.
// 처리기가 쓰는 기록 줄('{"evt":"watch"' 로 시작)은 이 파일이 도는 동안 걸러 낸다(테스트 실행기 보고는 그대로 내보낸다).

import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { createWatchHandlers } from '../lib/server/watch/handlers.js';
import { watchKeyOf } from '../lib/server/watch/keys.js';
import { readDay } from '../lib/server/watch/records.js';
import { CLIENT_INVALID, WATCH_API_TIMEOUT_MS, createWatchApi, sendWatchRequest } from '../lib/trip/watchApi.js';
import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';
import {
  WATCH_KIND,
  WATCH_PATHS,
  WATCH_UPLOAD_MAX_DAYS,
  WATCH_UPLOAD_MAX_PER_DAY,
  backRequest,
  configRequest,
  deadlinesRequest,
  newWatchIds,
  registerRequest,
  removeAllRequest,
  removeRequest,
} from '../src/guardian/watchRequests.js';
import { addDays, eachDate } from '../src/stay/time.js';
import { testCtx, watchRouteEnv } from './watch-fixtures.js';

const BASE = 'http://localhost';
const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const EXPIRES_ON = '2026-11-25';

// 처리기의 기록 줄만 걸러 낸다
before(() => {
  const original = process.stdout.write.bind(process.stdout);
  mock.method(process.stdout, 'write', (chunk, ...rest) => {
    if (String(chunk).startsWith('{"evt":"watch"')) return true;
    return original(chunk, ...rest);
  });
});
after(() => mock.restoreAll());

/**
 * 진짜 처리기에 이은 요청 함수. session 이 false 면 쿠키 없이 보낸다.
 * @returns {{ ctx: object, api: object, fetchImpl: Function, seen: Array<{ path: string, init: object }> }}
 */
function connect({ at, session = true } = {}) {
  const ctx = testCtx(at ? { at } : undefined);
  const env = watchRouteEnv();
  const h = createWatchHandlers({ env, now: ctx.now, ctx });
  const routes = new Map([
    [`GET ${WATCH_PATHS.config}`, h.pushConfig],
    [`POST ${WATCH_PATHS.watch}`, h.register],
    [`DELETE ${WATCH_PATHS.watch}`, h.remove],
    [`PUT ${WATCH_PATHS.deadlines}`, h.deadlines],
    [`POST ${WATCH_PATHS.back}`, h.back],
  ]);
  const cookie = session
    ? `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'patient-seam' }, env.SAFEHOUR_SESSION_SECRET, ctx.now())}`
    : null;
  const seen = [];
  const fetchImpl = async (path, init) => {
    seen.push({ path, init });
    const route = routes.get(`${init.method} ${path}`);
    // 처리기가 없는 메서드·경로는 연결 실패로 드러난다(kind NETWORK)
    if (!route) throw new Error('처리기가 없는 경로');
    return route(new Request(BASE + path, { ...init, headers: { ...init.headers, ...(cookie ? { cookie } : {}) } }));
  };
  return { ctx, api: createWatchApi({ fetchImpl }), fetchImpl, seen };
}

/** 결과 종류와 상태를 함께 본다 */
function expectKind(result, kind, status) {
  assert.equal(result.kind, kind, JSON.stringify({ status: result.status, errorCode: result.errorCode }));
  if (status !== undefined) assert.equal(result.status, status);
  assert.equal(result.ok, kind === WATCH_KIND.OK);
}

describe('라우트와 이은 요청', () => {
  test('요청 모양의 메서드·경로마다 라우트 파일이 처리기를 내보낸다', async () => {
    const ids = newWatchIds();
    const requests = [
      configRequest(),
      registerRequest({ ...ids, expiresOn: EXPIRES_ON }),
      deadlinesRequest({ ...ids, expiresOn: EXPIRES_ON, days: [] }),
      backRequest({ ...ids, date: TODAY, by: '14:30' }),
      removeRequest(ids),
      removeAllRequest(),
    ];
    for (const request of requests) {
      const route = await import(`../app${request.path}/route.js`);
      assert.equal(typeof route[request.method], 'function', `${request.method} ${request.path}`);
    }
  });

  test('config 는 켜짐을 읽는다', async () => {
    const { api, seen } = connect();
    const result = await api.config();
    expectKind(result, WATCH_KIND.OK, 200);
    assert.equal(result.data.enabled, true);
    assert.equal(typeof result.data.vapidPublicKey, 'string');
    assert.equal(result.data.guardianLoginRequired, true);
    assert.equal(seen[0].init.method, 'GET');
    assert.ok(!Object.hasOwn(seen[0].init, 'body'));
  });

  test('등록, 마감 올리기, 돌아왔어요, 되돌리기가 서버에서 통과한다', async () => {
    const { ctx, api, seen } = connect();
    const ids = newWatchIds();

    const registered = await api.register({ ...ids, expiresOn: EXPIRES_ON });
    expectKind(registered, WATCH_KIND.OK, 200);
    assert.equal(registered.data.expiresOn, EXPIRES_ON);

    const uploaded = await api.deadlines({
      ...ids,
      expiresOn: EXPIRES_ON,
      days: [
        { date: TODAY, deadlines: ['18:00', '14:30', '18:00'] },
        { date: TOMORROW, deadlines: ['14:30'] },
      ],
    });
    expectKind(uploaded, WATCH_KIND.OK, 200);
    assert.equal(typeof uploaded.data.armFailed, 'number');
    assert.equal(uploaded.data.armFailed, 0);
    // 오늘 14:30·18:00, 내일 14:30 이 서버에 올라가 예약이 걸렸다
    assert.equal(ctx.scheduler.calls.length, 3);

    const back = await api.back({ ...ids, date: TODAY, by: '14:30' });
    expectKind(back, WATCH_KIND.OK, 200);
    assert.equal(back.data.recorded, true);

    const undo = await api.back({ ...ids, date: TODAY, by: '14:30', undo: true });
    expectKind(undo, WATCH_KIND.OK, 200);
    assert.equal(undo.data.recorded, true);

    // 식별 값은 본문으로만 갔다
    for (const { path } of seen) {
      assert.ok(Object.values(WATCH_PATHS).includes(path), path);
      assert.ok(!path.includes(ids.watchId) && !path.includes(ids.writeToken));
    }
  });

  test('46일, 하루 10개의 경계값 업로드가 200 이다', async () => {
    const { ctx, api } = connect();
    const ids = newWatchIds();
    const expiresOn = addDays(TODAY, WATCH_UPLOAD_MAX_DAYS - 1);
    const dates = eachDate(TODAY, expiresOn);
    assert.equal(dates.length, 46);
    const times = Array.from({ length: WATCH_UPLOAD_MAX_PER_DAY }, (_, i) => `${String(12 + i).padStart(2, '0')}:30`);

    expectKind(await api.register({ ...ids, expiresOn }), WATCH_KIND.OK, 200);
    const uploaded = await api.deadlines({ ...ids, expiresOn, days: dates.map((date) => ({ date, deadlines: times })) });
    expectKind(uploaded, WATCH_KIND.OK, 200);
    assert.equal(uploaded.data.expiresOn, expiresOn);
    assert.equal(typeof uploaded.data.armFailed, 'number');
    // 마지막 날의 열 개 시각까지 서버가 받았다
    const lastDay = await readDay(ctx, watchKeyOf(ids.watchId, ctx.secret), dates[dates.length - 1]);
    assert.deepEqual(lastDay.deadlines, times);
    const back = await api.back({ ...ids, date: TODAY, by: times[times.length - 1] });
    assert.equal(back.data.recorded, true);
  });

  test('세션 없이 등록하면 kind 가 LOGIN_REQUIRED 다', async () => {
    const { api } = connect({ session: false });
    const result = await api.register({ ...newWatchIds(), expiresOn: EXPIRES_ON });
    expectKind(result, WATCH_KIND.LOGIN_REQUIRED, 401);
    assert.equal(result.network, false);
    assert.equal(result.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
  });

  test('같은 watchId 를 새 토큰으로 다시 등록하면 예전 토큰의 올리기·돌아왔어요는 NOT_FOUND 다', async () => {
    const { api } = connect();
    const old = newWatchIds();
    const days = [{ date: TODAY, deadlines: ['14:30'] }];
    expectKind(await api.register({ ...old, expiresOn: EXPIRES_ON }), WATCH_KIND.OK);
    expectKind(await api.deadlines({ ...old, expiresOn: EXPIRES_ON, days }), WATCH_KIND.OK);

    const renewed = { watchId: old.watchId, writeToken: newWatchIds().writeToken };
    expectKind(await api.register({ ...renewed, expiresOn: EXPIRES_ON }), WATCH_KIND.OK, 200);

    const staleUpload = await api.deadlines({ ...old, expiresOn: EXPIRES_ON, days });
    expectKind(staleUpload, WATCH_KIND.NOT_FOUND, 404);
    assert.equal(staleUpload.errorCode, 'SAFEHOUR_WATCH_NOT_FOUND');
    expectKind(await api.back({ ...old, date: TODAY, by: '14:30' }), WATCH_KIND.NOT_FOUND, 404);

    expectKind(await api.deadlines({ ...renewed, expiresOn: EXPIRES_ON, days }), WATCH_KIND.OK, 200);
    const back = await api.back({ ...renewed, date: TODAY, by: '14:30' });
    expectKind(back, WATCH_KIND.OK, 200);
    assert.equal(back.data.recorded, true);
  });

  test('자정: 어제 23:55 를 올린 뒤 00:05 에 어제 날짜로 돌아왔어요를 보내면 recorded: true 다', async () => {
    // 2026-11-20 23:50 KST 에 올린다
    const { ctx, api } = connect({ at: '2026-11-20T14:50:00Z' });
    const ids = newWatchIds();
    expectKind(await api.register({ ...ids, expiresOn: EXPIRES_ON }), WATCH_KIND.OK);
    expectKind(
      await api.deadlines({
        ...ids,
        expiresOn: EXPIRES_ON,
        days: [
          { date: TODAY, deadlines: ['23:55'] },
          { date: TOMORROW, deadlines: [] },
        ],
      }),
      WATCH_KIND.OK,
    );

    // 2026-11-21 00:05 KST. 자정 뒤 올리기는 어제를 보내지 않는다. 서버의 어제 기록은 그대로 남는다
    ctx.clock.set('2026-11-20T15:05:00Z');
    expectKind(
      await api.deadlines({ ...ids, expiresOn: EXPIRES_ON, days: [{ date: TOMORROW, deadlines: ['14:30'] }] }),
      WATCH_KIND.OK,
    );
    const back = await api.back({ ...ids, date: TODAY, by: '23:55' });
    expectKind(back, WATCH_KIND.OK, 200);
    assert.equal(back.data.recorded, true);

    // 되돌리기 마감(00:04:30)이 지났으므로 되돌리기는 기록되지 않는다
    const undo = await api.back({ ...ids, date: TODAY, by: '23:55', undo: true });
    expectKind(undo, WATCH_KIND.OK, 200);
    assert.equal(undo.data.recorded, false);
  });

  test('토큰 삭제와 { all: true } 삭제가 서버에서 통과하고, 지운 뒤 올리기는 NOT_FOUND 다', async () => {
    const { api, fetchImpl } = connect();
    const days = [{ date: TODAY, deadlines: ['14:30'] }];

    const one = newWatchIds();
    expectKind(await api.register({ ...one, expiresOn: EXPIRES_ON }), WATCH_KIND.OK);
    expectKind(await sendWatchRequest(removeRequest(one), { fetchImpl }), WATCH_KIND.OK, 200);
    expectKind(await api.deadlines({ ...one, expiresOn: EXPIRES_ON, days }), WATCH_KIND.NOT_FOUND, 404);
    // 이미 지운 것을 다시 지우면 404 다(삭제 대기가 비워도 되는 결과)
    expectKind(await sendWatchRequest(removeRequest(one), { fetchImpl }), WATCH_KIND.NOT_FOUND, 404);

    const two = newWatchIds();
    const three = newWatchIds();
    expectKind(await api.register({ ...two, expiresOn: EXPIRES_ON }), WATCH_KIND.OK);
    expectKind(await api.register({ ...three, expiresOn: EXPIRES_ON }), WATCH_KIND.OK);
    const removed = await api.removeAll();
    expectKind(removed, WATCH_KIND.OK, 200);
    assert.equal(removed.data.deleted, 2);
    expectKind(await api.deadlines({ ...two, expiresOn: EXPIRES_ON, days }), WATCH_KIND.NOT_FOUND, 404);
    expectKind(await api.back({ ...three, date: TODAY, by: '14:30' }), WATCH_KIND.NOT_FOUND, 404);
  });
});

describe('sendWatchRequest', () => {
  /** 받은 요청을 쌓고 정한 응답을 돌려주는 가짜 fetch */
  function fakeFetch(respond) {
    const calls = [];
    const fetchImpl = async (path, init) => {
      calls.push({ path, init });
      return respond(path, init);
    };
    return { calls, fetchImpl };
  }

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  test('같은 출처 자격 증명, 캐시 없음, 본문이 있을 때만 JSON 머리글과 본문을 싣는다', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, { ok: true, recorded: true }));
    const ids = newWatchIds();
    const result = await sendWatchRequest(backRequest({ ...ids, date: TODAY, by: '14:30' }), { fetchImpl });
    assert.deepEqual(result, { ok: true, status: 200, data: { ok: true, recorded: true }, kind: WATCH_KIND.OK });
    const [{ path, init }] = calls;
    assert.equal(path, WATCH_PATHS.back);
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { watchId: ids.watchId, writeToken: ids.writeToken, date: TODAY, by: '14:30' });
    assert.ok(init.signal);

    await sendWatchRequest(configRequest(), { fetchImpl });
    const get = calls[1].init;
    assert.equal(get.method, 'GET');
    assert.ok(!Object.hasOwn(get, 'body'));
    assert.ok(!Object.hasOwn(get.headers, 'Content-Type'));
    assert.equal(WATCH_API_TIMEOUT_MS, 15_000);
  });

  test('연결 실패와 시간 초과는 NETWORK 다', async () => {
    const failing = await sendWatchRequest(configRequest(), {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    assert.deepEqual(failing, { ok: false, status: 0, network: true, errorCode: 'NETWORK_ERROR', kind: WATCH_KIND.NETWORK });

    const hanging = (path, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const timedOut = await sendWatchRequest(configRequest(), { fetchImpl: hanging, timeoutMs: 5 });
    assert.equal(timedOut.kind, WATCH_KIND.NETWORK);
    assert.equal(timedOut.network, true);
  });

  test('오류 응답은 상태와 오류 코드로 분류하고, 2xx 인데 본문이 계약 모양이 아니면 UNAVAILABLE 이다', async () => {
    const cases = [
      [json(503, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' }), WATCH_KIND.OFF, 'SAFEHOUR_SERVER_PUSH_OFF'],
      [json(503, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' }), WATCH_KIND.UNAVAILABLE, 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE'],
      [json(429, { ok: false, errorCode: 'SAFEHOUR_RATE_LIMITED' }), WATCH_KIND.RATE_LIMITED, 'SAFEHOUR_RATE_LIMITED'],
      [new Response('<html>bad gateway</html>', { status: 502 }), WATCH_KIND.UNAVAILABLE, 'HTTP_502'],
      [json(200, { ok: false }), WATCH_KIND.UNAVAILABLE, 'HTTP_200'],
      [new Response('not json', { status: 200 }), WATCH_KIND.UNAVAILABLE, 'HTTP_200'],
    ];
    for (const [response, kind, errorCode] of cases) {
      const result = await sendWatchRequest(configRequest(), { fetchImpl: async () => response });
      assert.equal(result.ok, false);
      assert.equal(result.network, false);
      assert.equal(result.kind, kind, errorCode);
      assert.equal(result.errorCode, errorCode);
    }
  });

  test('요청 모양이 틀리면 보내지 않고 CLIENT_INVALID 다', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, { ok: true }));
    const api = createWatchApi({ fetchImpl });
    const expected = { ok: false, status: 0, network: false, errorCode: CLIENT_INVALID, kind: WATCH_KIND.BAD };
    assert.deepEqual(await api.register({ watchId: 'short', writeToken: 'x', expiresOn: EXPIRES_ON }), expected);
    assert.deepEqual(await api.deadlines({ ...newWatchIds(), expiresOn: EXPIRES_ON, days: [{ date: TODAY, deadlines: ['24:00'] }] }), expected);
    assert.deepEqual(await api.back({ ...newWatchIds(), date: '2026-2-1', by: '14:30' }), expected);
    assert.deepEqual(await api.back(undefined), expected);
    assert.deepEqual(await sendWatchRequest(null, { fetchImpl }), expected);
    assert.equal(calls.length, 0);
  });
});
