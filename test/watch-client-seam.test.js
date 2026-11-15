// 서버 알림 클라이언트·서버 이음매 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3, D16 ·
// docs/standards.md '클라이언트와 서버가 주고받는 요청 모양은 양쪽을 이은 테스트로 묶는다')
//
// 보호자 경로(구독·해지·상태 조회·함께 있음)는 docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 1 의 묶음이다.
//
// 진짜 요청 모양(src/guardian/watchRequests.js, 보호자는 src/guardian/pushRequests.js)과 진짜 sendWatchRequest(src/guardian/watchSend.js, lib/trip/watchApi.js 가 다시 내보냄)를 진짜 처리기
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
  PUSH_PATHS,
  SUB_ID_RE,
  muteRequest,
  readConfigData,
  readMuteData,
  readStatusData,
  readSubscribeData,
  statusRequest,
  subscribeRequest,
  unsubscribeRequest,
} from '../src/guardian/pushRequests.js';
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
import { subscriptionFixture, testCtx, watchRouteEnv } from './watch-fixtures.js';

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
 * 진짜 처리기에 이은 요청 함수. session 이 false 면 쿠키 없이 보낸다. env 를 주면 그 환경변수로 처리기를 만든다.
 * ctx 를 주면 그 서버(메모리 저장소·시계)를 함께 쓴다: 환자 연결과 보호자 연결, 스위치가 꺼진 처리기가 같은 저장소를 본다.
 * subject 는 세션 쿠키의 신원이다(환자 'patient-seam', 보호자는 다른 값).
 * @returns {{ ctx: object, env: object, api: object, fetchImpl: Function, seen: Array<{ path: string, init: object }> }}
 */
function connect({ at, session = true, env = watchRouteEnv(), ctx = testCtx(at ? { at } : undefined), subject = 'patient-seam' } = {}) {
  const h = createWatchHandlers({ env, now: ctx.now, ctx });
  const routes = new Map([
    [`GET ${WATCH_PATHS.config}`, h.pushConfig],
    [`POST ${WATCH_PATHS.watch}`, h.register],
    [`DELETE ${WATCH_PATHS.watch}`, h.remove],
    [`PUT ${WATCH_PATHS.deadlines}`, h.deadlines],
    [`POST ${WATCH_PATHS.back}`, h.back],
    [`POST ${PUSH_PATHS.subscribe}`, h.subscribe],
    [`DELETE ${PUSH_PATHS.subscribe}`, h.unsubscribe],
    [`POST ${PUSH_PATHS.status}`, h.status],
    [`POST ${PUSH_PATHS.mute}`, h.mute],
  ]);
  const cookie = session
    ? `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject }, env.SAFEHOUR_SESSION_SECRET, ctx.now())}`
    : null;
  const seen = [];
  const fetchImpl = async (path, init) => {
    seen.push({ path, init });
    const route = routes.get(`${init.method} ${path}`);
    // 처리기가 없는 메서드·경로는 연결 실패로 드러난다(kind NETWORK)
    if (!route) throw new Error('처리기가 없는 경로');
    return route(new Request(BASE + path, { ...init, headers: { ...init.headers, ...(cookie ? { cookie } : {}) } }));
  };
  return { ctx, env, api: createWatchApi({ fetchImpl }), fetchImpl, seen };
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

  test('스위치가 꺼진 서버: 등록은 503 OFF, config 는 꺼짐을 읽는다', async () => {
    const { SAFEHOUR_SERVER_PUSH: _on, ...offEnv } = watchRouteEnv();
    assert.equal(Object.hasOwn(offEnv, 'SAFEHOUR_SERVER_PUSH'), false);
    const { ctx, api } = connect({ env: offEnv });
    const ids = newWatchIds();

    const registered = await api.register({ ...ids, expiresOn: EXPIRES_ON });
    expectKind(registered, WATCH_KIND.OFF, 503);
    assert.equal(registered.network, false);
    assert.equal(registered.errorCode, 'SAFEHOUR_SERVER_PUSH_OFF');
    const uploaded = await api.deadlines({ ...ids, expiresOn: EXPIRES_ON, days: [{ date: TODAY, deadlines: ['14:30'] }] });
    expectKind(uploaded, WATCH_KIND.OFF, 503);
    expectKind(await api.back({ ...ids, date: TODAY, by: '14:30' }), WATCH_KIND.OFF, 503);
    assert.equal(ctx.scheduler.calls.length, 0);

    const config = await api.config();
    expectKind(config, WATCH_KIND.OK, 200);
    assert.equal(config.data.enabled, false);
    assert.equal(config.data.vapidPublicKey, null);
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

// ── 보호자 경로 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 1) ─────────────────
// 진짜 보호자 요청 모양(src/guardian/pushRequests.js)을 진짜 sendWatchRequest 로 진짜 처리기에 보내고, 응답은 진짜 읽기 함수로 읽는다.
// 환자 연결이 등록한 지켜보기를 같은 서버(ctx)에 이은 보호자 연결이 구독한다.

describe('보호자 경로와 이은 요청', () => {
  const OTHER_SUB_ID = 'OTHERsubIdFixture_01-x';

  /** PushSubscription.toJSON() 모양의 구독(실제 P-256 키, 허용 목록 안의 테스트 주소) */
  function pushSubscriptionJson() {
    const { subscription } = subscriptionFixture();
    return { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } };
  }

  /** 환자가 등록한 지켜보기 하나와 같은 서버에 이은 보호자 연결. send 는 보호자 쪽 진짜 sendWatchRequest 다 */
  async function watched() {
    const patient = connect();
    const ids = newWatchIds();
    expectKind(await patient.api.register({ ...ids, expiresOn: EXPIRES_ON }), WATCH_KIND.OK, 200);
    const guardian = connect({ ctx: patient.ctx, env: patient.env, subject: 'guardian-seam' });
    const send = (request) => sendWatchRequest(request, { fetchImpl: guardian.fetchImpl });
    const subscribe = async (subscription = pushSubscriptionJson()) => {
      const result = await send(subscribeRequest({ watchId: ids.watchId, subscription, lang: 'ja' }));
      expectKind(result, WATCH_KIND.OK, 200);
      return readSubscribeData(result.data)?.subId ?? null;
    };
    return { patient, guardian, ids, send, subscribe };
  }

  test('보호자 구독: 진짜 subscribeRequest 본문이 처리기를 통과해 { ok, subId } 이고 subId 가 SUB_ID_RE 에 맞는다', async () => {
    const { guardian, ids, send } = await watched();
    const subscription = pushSubscriptionJson();
    const result = await send(subscribeRequest({ watchId: ids.watchId, subscription, lang: 'ja' }));
    expectKind(result, WATCH_KIND.OK, 200);
    assert.deepEqual(Object.keys(result.data).sort(), ['ok', 'subId']);
    const read = readSubscribeData(result.data);
    assert.ok(read, '읽기 함수가 응답을 받는다');
    assert.match(read.subId, SUB_ID_RE);

    // 식별 값·구독은 본문으로만 갔다
    const [{ path, init }] = guardian.seen;
    assert.equal(path, PUSH_PATHS.subscribe);
    assert.equal(init.method, 'POST');
    for (const value of [ids.watchId, read.subId, subscription.endpoint, subscription.keys.p256dh]) assert.ok(!path.includes(value));
    assert.deepEqual(Object.keys(JSON.parse(init.body)), ['watchId', 'subscription', 'lang']);
  });

  test('같은 기기 다시 구독은 새 subId 이고, 예전 subId 의 해지는 NOT_FOUND 다', async () => {
    const { patient, ids, send, subscribe } = await watched();
    const subscription = pushSubscriptionJson();
    const first = await subscribe(subscription);
    const second = await subscribe(subscription);
    assert.match(first, SUB_ID_RE);
    assert.match(second, SUB_ID_RE);
    assert.notEqual(first, second);
    assert.equal(patient.ctx.push.sent.length, 0, '같은 기기라 기기 바뀜 알림을 보내지 않는다');

    const stale = await send(unsubscribeRequest({ watchId: ids.watchId, subId: first }));
    expectKind(stale, WATCH_KIND.NOT_FOUND, 404);
    assert.equal(stale.errorCode, 'SAFEHOUR_WATCH_NOT_FOUND');
    expectKind(await send(unsubscribeRequest({ watchId: ids.watchId, subId: second })), WATCH_KIND.OK, 200);
    // 이미 지운 구독을 다시 지우면 404 다(서버 삭제 대기가 비워도 되는 결과)
    expectKind(await send(unsubscribeRequest({ watchId: ids.watchId, subId: second })), WATCH_KIND.NOT_FOUND, 404);
  });

  test('상태 조회: 지금 subId 면 subscriptionActive 참, 다른 subId 면 거짓', async () => {
    const { patient, guardian, ids, send, subscribe } = await watched();
    // 환자가 오늘 14:30 을 올리고 '돌아왔어요'를 눌렀다
    expectKind(await patient.api.deadlines({ ...ids, expiresOn: EXPIRES_ON, days: [{ date: TODAY, deadlines: ['14:30'] }] }), WATCH_KIND.OK);
    assert.equal((await patient.api.back({ ...ids, date: TODAY, by: '14:30' })).data.recorded, true);
    const subId = await subscribe();

    const active = await send(statusRequest({ watchId: ids.watchId, subId }));
    expectKind(active, WATCH_KIND.OK, 200);
    assert.deepEqual(readStatusData(active.data), { date: TODAY, confirmed: ['14:30'], muted: false, subscriptionActive: true });

    const other = await send(statusRequest({ watchId: ids.watchId, subId: OTHER_SUB_ID }));
    expectKind(other, WATCH_KIND.OK, 200);
    assert.equal(readStatusData(other.data).subscriptionActive, false);

    const before = guardian.seen.length;
    const none = await send(statusRequest({ watchId: ids.watchId }));
    expectKind(none, WATCH_KIND.OK, 200);
    assert.equal(readStatusData(none.data).subscriptionActive, false);
    assert.deepEqual(JSON.parse(guardian.seen[before].init.body), { watchId: ids.watchId }, 'subId 키 없이 보냈다');
  });

  test('함께 있음을 켠 뒤 상태 조회의 muted 가 참이다', async () => {
    const { ids, send, subscribe } = await watched();
    const subId = await subscribe();

    const on = await send(muteRequest({ watchId: ids.watchId, subId, on: true }));
    expectKind(on, WATCH_KIND.OK, 200);
    assert.deepEqual(readMuteData(on.data), { muted: true });
    assert.equal(readStatusData((await send(statusRequest({ watchId: ids.watchId, subId }))).data).muted, true);

    const off = await send(muteRequest({ watchId: ids.watchId, subId, on: false }));
    expectKind(off, WATCH_KIND.OK, 200);
    assert.deepEqual(readMuteData(off.data), { muted: false });
    assert.equal(readStatusData((await send(statusRequest({ watchId: ids.watchId, subId }))).data).muted, false);

    // 지금 구독이 아닌 subId 로는 바꾸지 못한다
    expectKind(await send(muteRequest({ watchId: ids.watchId, subId: OTHER_SUB_ID, on: true })), WATCH_KIND.NOT_FOUND, 404);
  });

  test('서버 스위치가 꺼진 처리기에서도 해지는 OK 다', async () => {
    const { patient, ids, subscribe } = await watched();
    const subId = await subscribe();
    const { SAFEHOUR_SERVER_PUSH: _on, ...offEnv } = patient.env;
    const off = connect({ ctx: patient.ctx, env: offEnv, subject: 'guardian-seam' });
    const sendOff = (request) => sendWatchRequest(request, { fetchImpl: off.fetchImpl });

    const config = await off.api.config();
    expectKind(config, WATCH_KIND.OK, 200);
    assert.deepEqual(readConfigData(config.data), { enabled: false, vapidPublicKey: null, guardianLoginRequired: true });
    // 구독·상태 조회·함께 있음은 꺼짐이다
    expectKind(await sendOff(subscribeRequest({ watchId: ids.watchId, subscription: pushSubscriptionJson(), lang: 'ko' })), WATCH_KIND.OFF, 503);
    expectKind(await sendOff(statusRequest({ watchId: ids.watchId, subId })), WATCH_KIND.OFF, 503);
    expectKind(await sendOff(muteRequest({ watchId: ids.watchId, subId, on: true })), WATCH_KIND.OFF, 503);
    // 해지는 스위치와 무관하게 된다
    expectKind(await sendOff(unsubscribeRequest({ watchId: ids.watchId, subId })), WATCH_KIND.OK, 200);
    expectKind(await sendOff(unsubscribeRequest({ watchId: ids.watchId, subId })), WATCH_KIND.NOT_FOUND, 404);
  });

  test('세션 없는 구독은 LOGIN_REQUIRED 다(guardianLoginRequired 기본값)', async () => {
    const { patient, guardian, ids, subscribe } = await watched();
    const config = await guardian.api.config();
    expectKind(config, WATCH_KIND.OK, 200);
    assert.deepEqual(readConfigData(config.data), {
      enabled: true,
      vapidPublicKey: patient.env.SAFEHOUR_VAPID_PUBLIC_KEY,
      guardianLoginRequired: true,
    });

    const anonymous = connect({ ctx: patient.ctx, env: patient.env, session: false });
    const sendAnonymous = (request) => sendWatchRequest(request, { fetchImpl: anonymous.fetchImpl });
    const denied = await sendAnonymous(subscribeRequest({ watchId: ids.watchId, subscription: pushSubscriptionJson(), lang: 'en' }));
    expectKind(denied, WATCH_KIND.LOGIN_REQUIRED, 401);
    assert.equal(denied.errorCode, 'SAFEHOUR_AUTH_REQUIRED');

    // 상태 조회와 함께 있음도 세션이 필요하고, 해지는 세션 없이 된다
    const subId = await subscribe();
    expectKind(await sendAnonymous(statusRequest({ watchId: ids.watchId, subId })), WATCH_KIND.LOGIN_REQUIRED, 401);
    expectKind(await sendAnonymous(muteRequest({ watchId: ids.watchId, subId, on: true })), WATCH_KIND.LOGIN_REQUIRED, 401);
    expectKind(await sendAnonymous(unsubscribeRequest({ watchId: ids.watchId, subId })), WATCH_KIND.OK, 200);
  });

  test('환자 다시 등록(같은 watchId, 새 토큰) 뒤에도 보호자 subscriptionActive 가 참이다', async () => {
    const { patient, ids, send, subscribe } = await watched();
    const subId = await subscribe();
    const renewed = { watchId: ids.watchId, writeToken: newWatchIds().writeToken };
    expectKind(await patient.api.register({ ...renewed, expiresOn: EXPIRES_ON }), WATCH_KIND.OK, 200);

    const status = await send(statusRequest({ watchId: ids.watchId, subId }));
    expectKind(status, WATCH_KIND.OK, 200);
    assert.equal(readStatusData(status.data).subscriptionActive, true);
    expectKind(await send(muteRequest({ watchId: ids.watchId, subId, on: true })), WATCH_KIND.OK, 200);
  });

  test('환자가 지켜보기를 끄면 보호자 상태 조회는 NOT_FOUND 다', async () => {
    const { patient, ids, send, subscribe } = await watched();
    const subId = await subscribe();
    expectKind(await sendWatchRequest(removeRequest(ids), { fetchImpl: patient.fetchImpl }), WATCH_KIND.OK, 200);

    const status = await send(statusRequest({ watchId: ids.watchId, subId }));
    expectKind(status, WATCH_KIND.NOT_FOUND, 404);
    assert.equal(status.errorCode, 'SAFEHOUR_WATCH_NOT_FOUND');
    expectKind(await send(statusRequest({ watchId: ids.watchId })), WATCH_KIND.NOT_FOUND, 404);
    expectKind(await send(muteRequest({ watchId: ids.watchId, subId, on: true })), WATCH_KIND.NOT_FOUND, 404);
    expectKind(await send(subscribeRequest({ watchId: ids.watchId, subscription: pushSubscriptionJson(), lang: 'ko' })), WATCH_KIND.NOT_FOUND, 404);
    // 서버가 구독을 지켜보기와 함께 지웠다(해지도 404 라 삭제 대기에서 빠진다)
    expectKind(await send(unsubscribeRequest({ watchId: ids.watchId, subId })), WATCH_KIND.NOT_FOUND, 404);
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
