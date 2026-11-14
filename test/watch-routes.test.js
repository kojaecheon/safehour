// 서버 알림 라우트 처리기 (lib/server/watch/handlers.js, context.js, app/api/watch/*, app/api/push/config,
// app/api/cron/watch-arm, vercel.json)
//
// 처리기는 createWatchHandlers({ env, now, ctx }) 로 만들고 Request 를 직접 넣는다. ctx 는 testCtx() 라 저장소는
// 메모리, 예약과 푸시는 호출을 쌓는 기록기다. 외부 호출은 없다(createWatchCtx 시험은 가짜 fetch 를 넣는다).
// 시계는 testCtx 기본값 2026-11-20 12:00 KST(03:00Z)에서 시작하고 ctx.clock 으로만 움직인다.
// 마감 14:30 KST 의 보낼 시각은 14:40(05:40Z), 늦은 한도는 15:30(06:30Z)이다.
// 결과(outcome, counts)를 보려고 이 파일이 도는 동안 process.stdout.write 를 가로채 기록 줄만 모은다(테스트 실행기도 같은
// stdout 에 보고를 쓰므로 기록 줄이 아닌 출력은 그대로 내보낸다). 처리기가 기록 줄 말고 아무것도 내지 않는지(stdout·stderr·
// console 전체)는 실행기가 없는 별도 프로세스(test/watch-routes-child.js)로 본다('처리기 출력' 시험).

import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SESSION_COOKIE, createSessionToken, deriveAccountKey } from '../src/auth/session.js';
import { createWatchHandlers } from '../lib/server/watch/handlers.js';
import { createWatchCtx } from '../lib/server/watch/context.js';
import { watchConfig } from '../lib/server/watch/config.js';
import { KvError } from '../lib/server/watch/kv.js';
import { ownerHashOf, watchKeyOf } from '../lib/server/watch/keys.js';
import { readSub, readWatch } from '../lib/server/watch/records.js';
import { MAX_BODY_BYTES } from '../lib/server/watch/requests.js';
import { SESSION_SECRET } from './itinerary-fixtures.js';
import { IDS, SECRET, streamedBody, subscriptionFixture, testCtx } from './watch-fixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const EXPIRES_ON = '2026-11-25';
const WATCH_KEY = watchKeyOf(IDS.watchId, SECRET);
const UNKNOWN_WATCH_ID = 'UNKNOWNwatchIdFixture0';
const SECOND_WATCH_ID = 'SECONDwatchIdFixture_0';
const WRONG_TOKEN = 'WRONGtokenFixture_0123456789-abcdefghijklmn';
const WRONG_SUB_ID = 'WRONGsubIdFixture_0123';
const CRON_SECRET = 'cron-secret-for-route-tests-0123456789';
const BEARER = { authorization: `Bearer ${CRON_SECRET}` };

function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const priv = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: priv.d };
}

const VAPID = vapidPair();
const STORE_KEY = randomBytes(32).toString('base64url');

/** 메모리 모드, 데모 로그인. 켜는 스위치 '1' 이라 enabled */
const ENV = Object.freeze({
  SAFEHOUR_SERVER_PUSH: '1',
  SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
  SAFEHOUR_STORE_MODE: 'memory',
  SAFEHOUR_SESSION_SECRET: SESSION_SECRET,
  SAFEHOUR_VAPID_PUBLIC_KEY: VAPID.publicKey,
  SAFEHOUR_VAPID_PRIVATE_KEY: VAPID.privateKey,
  SAFEHOUR_VAPID_SUBJECT: 'mailto:ops@example.com',
  SAFEHOUR_PUSH_STORE_KEY: STORE_KEY,
  SAFEHOUR_WATCH_OWNER_SECRET: SECRET,
  CRON_SECRET,
});

const QSTASH_CURRENT = 'sig-current-value-for-route-test';
const QSTASH_NEXT = 'sig-next-value-for-route-test';
const BASE_URL = 'https://app.example.test';

/** Upstash·QStash 를 쓰는 운영형 묶음. 저장소는 주입한 ctx 를 쓰므로 실제로 부르지 않는다 */
const QSTASH_ENV = Object.freeze({
  ...without(ENV, 'SAFEHOUR_STORE_MODE'),
  UPSTASH_REDIS_REST_URL: 'https://store.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'store-token-value-for-route-test',
  QSTASH_TOKEN: 'qstash-token-value-for-route-test',
  QSTASH_CURRENT_SIGNING_KEY: QSTASH_CURRENT,
  QSTASH_NEXT_SIGNING_KEY: QSTASH_NEXT,
  SAFEHOUR_PUBLIC_BASE_URL: BASE_URL,
});

// 데모 로그인은 운영에도 켜 둔다. 운영 배포에서는 시험 장치가 꺼져 서버 알림 경로가 데모 세션을 받지 않는다
const PROD_DEMO_ENV = Object.freeze({ ...QSTASH_ENV, VERCEL_ENV: 'production' });
const PREVIEW_DEMO_ENV = Object.freeze({ ...QSTASH_ENV, VERCEL_ENV: 'preview' });
const PREVIEW_NO_DEMO_ENV = Object.freeze(without(PREVIEW_DEMO_ENV, 'SAFEHOUR_ALLOW_DEMO_LOGIN'));

const OFF_ENV = Object.freeze(without(ENV, 'SAFEHOUR_SERVER_PUSH'));
const KILLED_ENV = Object.freeze({ ...ENV, SAFEHOUR_KILL_SERVER_PUSH: ' ON ' });
const NO_LOGIN_ENV = Object.freeze({ ...ENV, SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN: '1' });

function without(env, ...names) {
  const copy = { ...env };
  for (const name of names) delete copy[name];
  return copy;
}

function setup({ env = ENV, at } = {}) {
  const ctx = testCtx(at ? { at } : undefined);
  return { ctx, h: createWatchHandlers({ env, now: ctx.now, ctx }) };
}

/** 같은 ctx 를 쓰는 다른 환경의 처리기 */
const handlersFor = (ctx, env) => createWatchHandlers({ env, now: ctx.now, ctx });

function cookieFor(ctx, subject, provider = 'demo') {
  return `${SESSION_COOKIE}=${createSessionToken({ provider, subject }, SESSION_SECRET, ctx.now())}`;
}

const accountKeyOf = (subject, provider = 'demo') => deriveAccountKey({ provider, subject }, SESSION_SECRET);

/** 데모 로그인이 누구에게나 주는 신원(app/api/auth/login/route.js) */
const DEMO_SUBJECT = 'demo-user';

/** 예약 업체가 처음 n번은 실패하게 한다. 실패한 호출도 calls 에 남긴다 */
function failFirst(scheduler, n) {
  const original = scheduler.schedule;
  let left = n;
  scheduler.schedule = async (args) => {
    if (left > 0) {
      left -= 1;
      scheduler.calls.push(args);
      return { ok: false };
    }
    return original(args);
  };
}

function call(method, path, body, { cookie, headers = {} } = {}) {
  const h = new Headers(headers);
  if (body !== undefined) h.set('content-type', 'application/json');
  if (cookie) h.set('cookie', cookie);
  const init = { method, headers: h };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(`http://localhost${path}`, init);
}

async function json(res) {
  return JSON.parse(await res.text());
}

/** 상태와 본문을 함께 본다 */
async function expectStatus(res, status) {
  const text = await res.text();
  assert.equal(res.status, status, text);
  return JSON.parse(text);
}

const registerBody = (watchId = IDS.watchId, extra = {}) => ({ watchId, writeToken: IDS.writeToken, expiresOn: EXPIRES_ON, ...extra });
const deadlinesBody = (days, extra = {}) => ({
  watchId: IDS.watchId,
  writeToken: IDS.writeToken,
  expiresOn: EXPIRES_ON,
  days,
  ...extra,
});
const backBody = (extra = {}) => ({ watchId: IDS.watchId, writeToken: IDS.writeToken, date: TODAY, by: '14:30', ...extra });
const subscribeBody = (subscription, extra = {}) => ({
  watchId: IDS.watchId,
  subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
  lang: 'ko',
  ...extra,
});
const dueBody = (date = TODAY, time = '14:30') => ({ k: WATCH_KEY, d: date, t: time });

// 이 파일이 도는 동안 기록 줄만 모은다. 다른 출력(테스트 실행기 보고)은 그대로 내보낸다
const captured = [];
before(() => {
  const original = process.stdout.write.bind(process.stdout);
  mock.method(process.stdout, 'write', (chunk, ...rest) => {
    const text = String(chunk);
    if (text.startsWith('{"evt":"watch"')) {
      captured.push(text);
      return true;
    }
    return original(chunk, ...rest);
  });
});
after(() => mock.restoreAll());

/** 지금부터 쌓이는 기록 줄을 돌려주는 함수 */
function captureLogs() {
  const start = captured.length;
  return () => captured.slice(start);
}

const logsOf = (lines) => lines.map((line) => JSON.parse(line));

/** 등록하고 마감을 올린다(오늘 14:30·18:00, 내일 14:30) */
async function seedPatient(h, ctx, { cookie = cookieFor(ctx, 'patient-1') } = {}) {
  await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie })), 200);
  await expectStatus(
    await h.deadlines(
      call(
        'PUT',
        '/api/watch/deadlines',
        deadlinesBody([
          { date: TODAY, deadlines: ['18:00', '14:30'] },
          { date: TOMORROW, deadlines: ['14:30'] },
        ]),
      ),
    ),
    200,
  );
  return cookie;
}

/** 보호자를 구독시키고 subId 를 돌려준다 */
async function seedGuardian(h, ctx) {
  const { subscription } = subscriptionFixture();
  const body = await expectStatus(
    await h.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: cookieFor(ctx, 'guardian-1') })),
    200,
  );
  return { subId: body.subId, subscription };
}

/** 쓰기 경로 여섯 개를 유효한 본문과 세션으로 부른다 */
function writeCalls(ctx) {
  const patient = cookieFor(ctx, 'patient-1');
  const guardian = cookieFor(ctx, 'guardian-1');
  const { subscription } = subscriptionFixture();
  return [
    ['register', () => call('POST', '/api/watch', registerBody(), { cookie: patient })],
    ['deadlines', () => call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30'] }]))],
    ['back', () => call('POST', '/api/watch/back', backBody())],
    ['subscribe', () => call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: guardian })],
    ['status', () => call('POST', '/api/watch/status', { watchId: IDS.watchId }, { cookie: guardian })],
    ['mute', () => call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }, { cookie: guardian })],
  ];
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

/** QStash 가 보내는 모양의 HS256 JWT (https://upstash.com/docs/qstash/features/security) */
function qstashJwt(rawBody, nowMs, { key = QSTASH_CURRENT, sub = `${BASE_URL}/api/watch/due` } = {}) {
  const nowSec = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: 'Upstash',
      sub,
      exp: nowSec + 300,
      nbf: nowSec,
      iat: nowSec,
      jti: 'jwt_route_1',
      body: createHash('sha256').update(rawBody).digest('base64url'),
    }),
  );
  const signature = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** kv.exec 가 늘 던지게 바꾼다 */
function breakKv(ctx, error = new KvError('KV_UNAVAILABLE')) {
  ctx.kv = {
    async exec() {
      throw error;
    },
  };
}

describe('스위치', () => {
  test('스위치가 꺼져 있으면 쓰기 경로 여섯 개(등록, 마감, 돌아왔어요, 구독, 상태, 함께 있음)가 모두 503 SAFEHOUR_SERVER_PUSH_OFF 다', async () => {
    const { ctx, h } = setup({ env: OFF_ENV });
    for (const [name, make] of writeCalls(ctx)) {
      const body = await expectStatus(await h[name](make()), 503);
      assert.deepEqual(body, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF', message: '서버 알림이 꺼져 있습니다.' }, name);
    }
    // 아무것도 쓰지 않았다
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
    // 켜는 스위치는 정확히 '1' 일 때만 켜진다
    const loose = handlersFor(ctx, { ...ENV, SAFEHOUR_SERVER_PUSH: 'true' });
    assert.equal((await loose.back(call('POST', '/api/watch/back', backBody()))).status, 503);
  });

  test('차단 스위치가 켜져도 쓰기 경로는 503 이다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const killed = handlersFor(ctx, KILLED_ENV);
    for (const [name, make] of writeCalls(ctx)) {
      const body = await expectStatus(await killed[name](make()), 503);
      assert.equal(body.errorCode, 'SAFEHOUR_SERVER_PUSH_OFF', name);
    }
  });

  test('스위치가 꺼져 있어도 DELETE /api/watch 와 DELETE /api/watch/subscribe 는 동작한다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const { subId } = await seedGuardian(h, ctx);

    const off = handlersFor(ctx, OFF_ENV);
    assert.deepEqual(
      await expectStatus(await off.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })), 200),
      { ok: true },
    );
    assert.equal(await readSub(ctx, WATCH_KEY), null);

    const killed = handlersFor(ctx, KILLED_ENV);
    assert.deepEqual(
      await expectStatus(
        await killed.remove(call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken })),
        200,
      ),
      { ok: true },
    );
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
    // 건 예약도 취소했다
    assert.ok(ctx.scheduler.cancelled.length > 0);

    // 저장소 설정이 없으면 지울 곳이 없어 503 OFF 다(주입한 ctx 없이 설정만으로 판단)
    const noStore = createWatchHandlers({ env: without(OFF_ENV, 'SAFEHOUR_STORE_MODE'), now: ctx.now });
    for (const res of [
      await noStore.remove(call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken })),
      await noStore.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })),
    ]) {
      assert.equal((await expectStatus(res, 503)).errorCode, 'SAFEHOUR_SERVER_PUSH_OFF');
    }
  });

  test('GET /api/push/config: 켜져 있으면 공개키를, 꺼져 있으면 null 을 준다. 개인키는 어디에도 없다', async () => {
    const on = createWatchHandlers({ env: ENV });
    const onRes = await on.pushConfig(call('GET', '/api/push/config'));
    const onText = await onRes.text();
    assert.equal(onRes.status, 200);
    assert.deepEqual(JSON.parse(onText), {
      ok: true,
      enabled: true,
      vapidPublicKey: VAPID.publicKey,
      guardianLoginRequired: true,
    });
    for (const secret of [VAPID.privateKey, STORE_KEY, SECRET, CRON_SECRET, SESSION_SECRET]) {
      assert.equal(onText.includes(secret), false);
    }

    for (const env of [OFF_ENV, KILLED_ENV, without(ENV, 'SAFEHOUR_VAPID_PRIVATE_KEY')]) {
      const res = await createWatchHandlers({ env }).pushConfig(call('GET', '/api/push/config'));
      const text = await res.text();
      assert.deepEqual(JSON.parse(text), { ok: true, enabled: false, vapidPublicKey: null, guardianLoginRequired: true });
      assert.equal(text.includes(VAPID.privateKey), false);
    }

    const noLogin = await json(await createWatchHandlers({ env: NO_LOGIN_ENV }).pushConfig(call('GET', '/api/push/config')));
    assert.equal(noLogin.guardianLoginRequired, false);
  });
});

describe('환자와 보호자 흐름', () => {
  test('POST /api/watch 는 세션이 없으면 401 이다', async () => {
    const { ctx, h } = setup();
    const expired = `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'patient-1' }, SESSION_SECRET, ctx.now() - 13 * 3600 * 1000)}`;
    const forged = `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'patient-1' }, 'x'.repeat(48), ctx.now())}`;
    for (const cookie of [undefined, expired, forged]) {
      const body = await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie })), 401);
      assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    }
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
    // 내 정보 전체 삭제도 세션이 필요하다
    const all = await expectStatus(await h.remove(call('DELETE', '/api/watch', { all: true })), 401);
    assert.equal(all.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
  });

  test('환자 흐름: 등록 → 마감 올리기 → 돌아왔어요 → 삭제', async () => {
    const { ctx, h } = setup();
    const patient = cookieFor(ctx, 'patient-1');

    // 등록: 허용 목록 밖 필드는 버리고 응답은 상한을 씌운 출국일뿐이다
    const registered = await expectStatus(
      await h.register(call('POST', '/api/watch', registerBody(IDS.watchId, { lat: 37.5, hospital: '병원' }), { cookie: patient })),
      200,
    );
    assert.deepEqual(registered, { ok: true, expiresOn: EXPIRES_ON });
    const watch = await readWatch(ctx, WATCH_KEY);
    assert.equal(watch.ownerHash, ownerHashOf(accountKeyOf('patient-1'), SECRET));

    // 마감 올리기: 세션 없이 쓰기 토큰만으로, 오늘·내일 마감에 예약을 건다
    const uploaded = await expectStatus(
      await h.deadlines(
        call(
          'PUT',
          '/api/watch/deadlines',
          deadlinesBody([
            { date: TODAY, deadlines: ['18:00', '14:30', '18:00'] },
            { date: TOMORROW, deadlines: ['14:30'] },
          ]),
        ),
      ),
      200,
    );
    assert.deepEqual(uploaded, { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
    assert.deepEqual(
      ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`),
      [`${TODAY} 14:30`, `${TODAY} 18:00`, `${TOMORROW} 14:30`],
    );
    // 같은 계정의 세션이 있어도 된다. 다른 계정의 세션이면 404 다
    await expectStatus(
      await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30', '18:00'] }]), { cookie: patient })),
      200,
    );
    const other = await expectStatus(
      await h.deadlines(
        call('PUT', '/api/watch/deadlines', deadlinesBody([]), { cookie: cookieFor(ctx, 'patient-2') }),
      ),
      404,
    );
    assert.equal(other.errorCode, 'SAFEHOUR_WATCH_NOT_FOUND');

    // 돌아왔어요: 세션 없이 된다. 목록에 없는 시각은 recorded false
    assert.deepEqual(await expectStatus(await h.back(call('POST', '/api/watch/back', backBody())), 200), { ok: true, recorded: true });
    assert.deepEqual(await expectStatus(await h.back(call('POST', '/api/watch/back', backBody({ by: '09:00' }))), 200), {
      ok: true,
      recorded: false,
    });
    assert.deepEqual(await expectStatus(await h.back(call('POST', '/api/watch/back', backBody({ undo: true }))), 200), {
      ok: true,
      recorded: true,
    });

    // 삭제: 지켜보기가 사라지고 건 예약을 취소한다
    const armedIds = ['m1', 'm2', 'm3'];
    assert.deepEqual(
      await expectStatus(await h.remove(call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken })), 200),
      { ok: true },
    );
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
    assert.deepEqual([...ctx.scheduler.cancelled].sort(), armedIds);
    // 지운 뒤에는 찾지 못한다
    await expectStatus(await h.back(call('POST', '/api/watch/back', backBody())), 404);
  });

  test('마감 올리기: 예약 업체가 N번 실패해도 200 이고 armFailed 와 기록의 failed 가 N 이다', async () => {
    const lines = captureLogs();
    const { ctx, h } = setup();
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie: cookieFor(ctx, 'patient-1') })), 200);
    // 오늘 14:30·18:00, 내일 14:30 셋 가운데 앞의 둘이 실패한다
    failFirst(ctx.scheduler, 2);
    const days = [
      { date: TODAY, deadlines: ['14:30', '18:00'] },
      { date: TOMORROW, deadlines: ['14:30'] },
    ];
    const body = await expectStatus(await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody(days))), 200);
    assert.deepEqual(body, { ok: true, expiresOn: EXPIRES_ON, armFailed: 2 });
    // 같은 전체를 다시 올리면 걸지 못한 둘만 다시 걸고 0 이다(이미 건 것은 다시 걸지 않는다)
    const again = await expectStatus(await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody(days))), 200);
    assert.deepEqual(again, { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
    assert.deepEqual(
      ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`),
      [`${TODAY} 14:30`, `${TODAY} 18:00`, `${TOMORROW} 14:30`, `${TODAY} 14:30`, `${TODAY} 18:00`],
    );
    // 기록의 failed 는 응답의 armFailed 와 같다
    const logs = logsOf(lines()).filter((l) => l.route === 'watch.deadlines');
    assert.deepEqual(
      logs.map((l) => l.counts),
      [{ failed: 2 }, { failed: 0 }],
    );
  });

  test('DELETE /api/watch { all: true }: 그 계정의 지켜보기만 지운다', async () => {
    const { ctx, h } = setup();
    const patient = cookieFor(ctx, 'patient-1');
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie: patient })), 200);
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(SECOND_WATCH_ID), { cookie: patient })), 200);
    const otherWatchId = 'OTHERownerWatchFixture';
    await expectStatus(
      await h.register(call('POST', '/api/watch', registerBody(otherWatchId), { cookie: cookieFor(ctx, 'patient-2') })),
      200,
    );
    const body = await expectStatus(await h.remove(call('DELETE', '/api/watch', { all: true }, { cookie: patient })), 200);
    assert.deepEqual(body, { ok: true, deleted: 2 });
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
    assert.notEqual(await readWatch(ctx, watchKeyOf(otherWatchId, SECRET)), null);
  });

  test('보호자 흐름: 구독 → 상태 → 함께 있음 → 해지', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const guardian = cookieFor(ctx, 'guardian-1');
    const { subscription } = subscriptionFixture();

    const subscribed = await expectStatus(
      await h.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription, { name: '보호자' }), { cookie: guardian })),
      200,
    );
    assert.deepEqual(Object.keys(subscribed).sort(), ['ok', 'subId']);
    assert.match(subscribed.subId, /^[A-Za-z0-9_-]{22}$/);
    const { subId } = subscribed;
    assert.equal((await readSub(ctx, WATCH_KEY)).endpoint, subscription.endpoint);

    const status = (body) => h.status(call('POST', '/api/watch/status', body, { cookie: guardian }));
    assert.deepEqual(await expectStatus(await status({ watchId: IDS.watchId, subId }), 200), {
      ok: true,
      date: TODAY,
      confirmed: [],
      muted: false,
      subscriptionActive: true,
    });

    await expectStatus(await h.back(call('POST', '/api/watch/back', backBody())), 200);
    const mute = (on) => h.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on }, { cookie: guardian }));
    assert.deepEqual(await expectStatus(await mute(true), 200), { ok: true, muted: true });
    assert.deepEqual(await expectStatus(await status({ watchId: IDS.watchId }), 200), {
      ok: true,
      date: TODAY,
      confirmed: ['14:30'],
      muted: true,
      subscriptionActive: false,
    });
    assert.deepEqual(await expectStatus(await mute(false), 200), { ok: true, muted: false });

    assert.deepEqual(
      await expectStatus(await h.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })), 200),
      { ok: true },
    );
    assert.equal(await readSub(ctx, WATCH_KEY), null);
    assert.equal((await expectStatus(await status({ watchId: IDS.watchId, subId }), 200)).subscriptionActive, false);
  });

  test('모르는 id, 틀린 토큰, 남의 id 재등록은 바이트까지 같은 404 다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const { subId } = await seedGuardian(h, ctx);
    const guardian = cookieFor(ctx, 'guardian-1');

    const responses = [
      await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([], { watchId: UNKNOWN_WATCH_ID }))),
      await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([], { writeToken: WRONG_TOKEN }))),
      await h.register(call('POST', '/api/watch', registerBody(), { cookie: cookieFor(ctx, 'patient-2') })),
      await h.back(call('POST', '/api/watch/back', backBody({ writeToken: WRONG_TOKEN }))),
      await h.remove(call('DELETE', '/api/watch', { watchId: UNKNOWN_WATCH_ID, writeToken: IDS.writeToken })),
      await h.status(call('POST', '/api/watch/status', { watchId: UNKNOWN_WATCH_ID }, { cookie: guardian })),
      await h.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }, { cookie: guardian })),
      await h.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId: WRONG_SUB_ID })),
      await h.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: UNKNOWN_WATCH_ID, subId })),
    ];
    const texts = [];
    for (const res of responses) {
      assert.equal(res.status, 404);
      assert.equal(res.headers.get('content-type'), responses[0].headers.get('content-type'));
      texts.push(await res.text());
    }
    assert.equal(new Set(texts).size, 1, texts.join('\n'));
    assert.deepEqual(JSON.parse(texts[0]), {
      ok: false,
      errorCode: 'SAFEHOUR_WATCH_NOT_FOUND',
      message: '서버 알림 정보를 찾을 수 없습니다.',
    });
    // 남의 재등록은 레코드를 바꾸지 않았다
    assert.equal((await readWatch(ctx, WATCH_KEY)).ownerHash, ownerHashOf(accountKeyOf('patient-1'), SECRET));
  });

  test('보호자 경로는 설정에 따라 세션을 요구한다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const { subscription } = subscriptionFixture();
    const subscribe = (handlers) => handlers.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription)));

    // 기본: 세션이 없으면 401
    assert.equal((await expectStatus(await subscribe(h), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal((await h.status(call('POST', '/api/watch/status', { watchId: IDS.watchId }))).status, 401);
    assert.equal(
      (await h.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }))).status,
      401,
    );
    assert.equal(await readSub(ctx, WATCH_KEY), null);

    // SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN=1: 세션 없이 통과
    const open = handlersFor(ctx, NO_LOGIN_ENV);
    const { subId } = await expectStatus(await subscribe(open), 200);
    await expectStatus(await open.status(call('POST', '/api/watch/status', { watchId: IDS.watchId, subId })), 200);
    await expectStatus(await open.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: false })), 200);

    // 해지는 늘 세션 없이 된다(기본 설정에서도)
    await expectStatus(await h.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })), 200);
  });

  test('횟수 제한은 429 SAFEHOUR_RATE_LIMITED 다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const guardian = cookieFor(ctx, 'guardian-1');
    let last;
    for (let i = 0; i < 121; i += 1) last = await h.status(call('POST', '/api/watch/status', { watchId: IDS.watchId }, { cookie: guardian }));
    assert.deepEqual(await expectStatus(last, 429), {
      ok: false,
      errorCode: 'SAFEHOUR_RATE_LIMITED',
      message: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
    });
    // 같은 계정의 다시 등록 한도(5회)를 넘어도 429 다(처음 등록은 seedPatient 가 했다)
    const patient = cookieFor(ctx, 'patient-1');
    const statuses = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await h.register(call('POST', '/api/watch', registerBody(), { cookie: patient }))).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  });

  test('로그인 없는 보호자 설정이면 보호자 경로의 횟수 제한이 더 엄격하다(결정 22)', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const open = handlersFor(ctx, NO_LOGIN_ENV);
    const { subscription } = subscriptionFixture();
    const subscribe = () => open.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription)));
    const statuses = async (n, make) => {
      const out = [];
      for (let i = 0; i < n; i += 1) out.push((await make()).status);
      return out;
    };
    // 구독: 하루 3회
    const subscribed = await statuses(4, subscribe);
    assert.deepEqual(subscribed, [200, 200, 200, 429]);
    const { subId } = await readSub(ctx, WATCH_KEY);
    // 상태 조회: 시간당 30회
    const status = () => open.status(call('POST', '/api/watch/status', { watchId: IDS.watchId, subId }));
    assert.deepEqual(new Set(await statuses(30, status)), new Set([200]));
    assert.equal((await expectStatus(await status(), 429)).errorCode, 'SAFEHOUR_RATE_LIMITED');
    // 함께 있음: 시간당 10회
    const mute = () => open.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: false }));
    assert.deepEqual(new Set(await statuses(10, mute)), new Set([200]));
    await expectStatus(await mute(), 429);
    // 로그인을 요구하는 기본 설정의 한도(구독 시간당 10, 상태 시간당 120)는 그대로다
    const guardian = cookieFor(ctx, 'guardian-1');
    const signedSubscribe = () =>
      h.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: guardian }));
    assert.deepEqual(new Set(await statuses(10, signedSubscribe)), new Set([200]));
    await expectStatus(await signedSubscribe(), 429);
    const signedStatus = () => h.status(call('POST', '/api/watch/status', { watchId: IDS.watchId }, { cookie: guardian }));
    assert.deepEqual(new Set(await statuses(31, signedStatus)), new Set([200]));
  });

  test('본문이 16KB 를 넘거나 JSON 이 아니면 400 이다', async () => {
    const { ctx, h } = setup();
    const patient = cookieFor(ctx, 'patient-1');
    const bodies = ['{not json', '[1,2]', '', JSON.stringify({ ...registerBody(), pad: 'a'.repeat(16384) })];
    for (const body of bodies) {
      const res = await expectStatus(await h.register(call('POST', '/api/watch', body, { cookie: patient })), 400);
      assert.deepEqual(res, { ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.', field: 'body' });
    }
    // 필드 형식은 field 로 알린다
    const field = await expectStatus(
      await h.register(call('POST', '/api/watch', registerBody(IDS.watchId.slice(1)), { cookie: patient })),
      400,
    );
    assert.equal(field.field, 'watchId');
    const days = await expectStatus(
      await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['25:00'] }]))),
      400,
    );
    assert.equal(days.field, 'days[0].deadlines');
    // 지난 출국일은 서비스가 거절한다
    const past = await expectStatus(
      await h.register(call('POST', '/api/watch', registerBody(IDS.watchId, { expiresOn: '2026-11-19' }), { cookie: patient })),
      400,
    );
    assert.equal(past.errorCode, 'SAFEHOUR_BAD_REQUEST');
    // 삭제 경로도 같다
    assert.equal((await h.remove(call('DELETE', '/api/watch', '{not json'))).status, 400);
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
  });

  test('허용 목록 밖 endpoint 는 400 이다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const guardian = cookieFor(ctx, 'guardian-1');
    const { subscription } = subscriptionFixture();
    const hostile = [
      'https://fcm.googleapis.com.evil.com/fcm/send/x',
      'https://evil.com/fcm.googleapis.com',
      'https://fcm.googleapis.com@evil.com/',
      'https://127.0.0.1/push',
      'https://fcm.googleapis.com:8443/fcm/send/x',
      'http://fcm.googleapis.com/fcm/send/x',
    ];
    for (const endpoint of hostile) {
      const res = await h.subscribe(call('POST', '/api/watch/subscribe', subscribeBody({ ...subscription, endpoint }), { cookie: guardian }));
      const text = await res.text();
      assert.equal(res.status, 400, endpoint);
      assert.equal(JSON.parse(text).errorCode, 'SAFEHOUR_BAD_REQUEST');
      assert.equal(text.includes('evil'), false);
    }
    assert.equal(await readSub(ctx, WATCH_KEY), null);
  });

  test('저장소가 실패하면 503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE 이고 응답·기록에 내부 값이 없다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    const { subId, subscription } = await seedGuardian(h, ctx);
    const patient = cookieFor(ctx, 'patient-1');
    const guardian = cookieFor(ctx, 'guardian-1');
    const calls = () => [
      ['register', call('POST', '/api/watch', registerBody(), { cookie: patient })],
      ['remove', call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken })],
      ['remove', call('DELETE', '/api/watch', { all: true }, { cookie: patient })],
      ['deadlines', call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30'] }]))],
      ['back', call('POST', '/api/watch/back', backBody())],
      ['subscribe', call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: guardian })],
      ['unsubscribe', call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })],
      ['status', call('POST', '/api/watch/status', { watchId: IDS.watchId, subId }, { cookie: guardian })],
      ['mute', call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: true }, { cookie: guardian })],
      ['due', call('POST', '/api/watch/due', dueBody(), { headers: BEARER })],
      ['cronArm', call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })],
    ];
    ctx.clock.set('2026-11-20T05:40:00Z');
    const lines = captureLogs();
    // 저장소 오류 객체와, 메시지에 주소·토큰이 섞인 예상 못 한 오류 둘 다
    for (const error of [new KvError('KV_UNAVAILABLE'), new Error('https://store.example.test token=leak-token HGETALL sh:dev:d')]) {
      breakKv(ctx, error);
      for (const [name, req] of calls()) {
        const res = await h[name](req);
        const text = await res.text();
        assert.equal(res.status, 503, name);
        const body = JSON.parse(text);
        assert.deepEqual(Object.keys(body).sort(), ['errorCode', 'message', 'ok'], name);
        assert.deepEqual(body, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE', message: '서버 알림을 잠시 쓸 수 없습니다.' });
      }
    }
    const logs = logsOf(lines());
    assert.equal(logs.length, calls().length * 2);
    for (const log of logs) {
      assert.equal(log.errorCode, 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE');
      assert.equal(log.outcome, 'FAILED');
    }
    const all = lines().join('');
    for (const leak of ['store.example', 'leak-token', 'HGETALL', 'sh:dev', 'KV_', IDS.watchId, IDS.writeToken, subId, WATCH_KEY]) {
      assert.equal(all.includes(leak), false, leak);
    }
  });
});

describe('데모 세션', () => {
  test('운영 배포에서는 데모 세션을 세션이 없는 것으로 본다: 데모 신원을 함께 쓰는 두 사람이 서로의 지켜보기를 가로채거나 지우지 못한다', async () => {
    const { ctx } = setup();
    const cfg = watchConfig(PROD_DEMO_ENV);
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.demo, true);
    assert.equal(cfg.testHooks, false);
    const prod = handlersFor(ctx, PROD_DEMO_ENV);
    // 데모 로그인은 누가 눌러도 이 신원이다. 환자와 보호자가 둘 다 데모로 들어온 상황
    const demo = cookieFor(ctx, DEMO_SUBJECT);

    // 데모 세션으로는 등록하지 못한다
    const denied = await expectStatus(await prod.register(call('POST', '/api/watch', registerBody(), { cookie: demo })), 401);
    assert.equal(denied.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(await readWatch(ctx, WATCH_KEY), null);

    // 미리보기에서 데모 신원으로 만든 지켜보기가 남아 있어도, 운영의 다른 데모 사용자가 자기 토큰으로 다시 등록하거나
    // 전체 삭제로 지우지 못한다
    await expectStatus(await handlersFor(ctx, PREVIEW_DEMO_ENV).register(call('POST', '/api/watch', registerBody(), { cookie: demo })), 200);
    const owner = ownerHashOf(accountKeyOf(DEMO_SUBJECT), SECRET);
    assert.equal((await readWatch(ctx, WATCH_KEY)).ownerHash, owner);
    const takeover = { watchId: IDS.watchId, writeToken: WRONG_TOKEN, expiresOn: EXPIRES_ON };
    assert.equal((await expectStatus(await prod.register(call('POST', '/api/watch', takeover, { cookie: demo })), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal((await expectStatus(await prod.remove(call('DELETE', '/api/watch', { all: true }, { cookie: demo })), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal((await readWatch(ctx, WATCH_KEY)).ownerHash, owner);
    // 환자의 쓰기 토큰은 계속 통하고, 남이 자기 토큰으로 지우려 하면 404 다
    await expectStatus(await prod.back(call('POST', '/api/watch/back', backBody())), 200);
    await expectStatus(await prod.remove(call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: WRONG_TOKEN })), 404);
    assert.notEqual(await readWatch(ctx, WATCH_KEY), null);

    // 실제 소셜 로그인 세션은 운영에서도 등록하고 전체 삭제할 수 있다
    const patient = cookieFor(ctx, 'google-patient-1', 'google');
    await expectStatus(await prod.register(call('POST', '/api/watch', registerBody(SECOND_WATCH_ID), { cookie: patient })), 200);
    const secondKey = watchKeyOf(SECOND_WATCH_ID, SECRET);
    assert.equal((await readWatch(ctx, secondKey)).ownerHash, ownerHashOf(accountKeyOf('google-patient-1', 'google'), SECRET));
    // 마감 올리기에 데모 세션이 실려 와도 계정 없이 쓰기 토큰만 본다(데모 계정을 소유자로 대조하면 404 였을 것이다)
    const upload = { ...deadlinesBody([{ date: TODAY, deadlines: ['14:30'] }]), watchId: SECOND_WATCH_ID };
    await expectStatus(await prod.deadlines(call('PUT', '/api/watch/deadlines', upload, { cookie: demo })), 200);
    // 다른 실제 계정의 세션이면 소유자가 달라 404 다(세션을 보는 길은 그대로다)
    await expectStatus(await prod.deadlines(call('PUT', '/api/watch/deadlines', upload, { cookie: cookieFor(ctx, 'kakao-2', 'kakao') })), 404);

    // 보호자 경로도 로그인을 요구하는 설정이면 데모 세션은 401 이다
    const { subscription } = subscriptionFixture();
    const guardianCalls = [
      () => prod.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: demo })),
      () => prod.status(call('POST', '/api/watch/status', { watchId: IDS.watchId }, { cookie: demo })),
      () => prod.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }, { cookie: demo })),
    ];
    for (const make of guardianCalls) assert.equal((await expectStatus(await make(), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(await readSub(ctx, WATCH_KEY), null);
    // 보호자 로그인을 요구하지 않는 설정이면 세션 없이 된다(데모 세션은 아무 일도 하지 않는다)
    const open = handlersFor(ctx, { ...PROD_DEMO_ENV, SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN: '1' });
    await expectStatus(await open.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: demo })), 200);

    // 데모 로그인이 꺼진 미리보기에서도 남은 데모 쿠키는 받지 않는다
    const noDemo = handlersFor(ctx, PREVIEW_NO_DEMO_ENV);
    assert.equal(watchConfig(PREVIEW_NO_DEMO_ENV).testHooks, false);
    await expectStatus(await noDemo.register(call('POST', '/api/watch', registerBody(), { cookie: demo })), 401);
    await expectStatus(await noDemo.remove(call('DELETE', '/api/watch', { all: true }, { cookie: demo })), 401);
    assert.equal((await readWatch(ctx, WATCH_KEY)).ownerHash, owner);
  });

  test('미리보기(시험 장치 켜짐)에서는 데모 세션이 그대로 통한다', async () => {
    const { ctx } = setup();
    assert.equal(watchConfig(PREVIEW_DEMO_ENV).testHooks, true);
    const preview = handlersFor(ctx, PREVIEW_DEMO_ENV);
    const demo = cookieFor(ctx, DEMO_SUBJECT);
    await expectStatus(await preview.register(call('POST', '/api/watch', registerBody(), { cookie: demo })), 200);
    assert.equal((await readWatch(ctx, WATCH_KEY)).ownerHash, ownerHashOf(accountKeyOf(DEMO_SUBJECT), SECRET));
    // 데모 세션의 계정으로 소유자를 대조한다
    await expectStatus(
      await preview.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30'] }]), { cookie: demo })),
      200,
    );
    const { subscription } = subscriptionFixture();
    await expectStatus(await preview.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: demo })), 200);
    assert.deepEqual(await expectStatus(await preview.remove(call('DELETE', '/api/watch', { all: true }, { cookie: demo })), 200), {
      ok: true,
      deleted: 1,
    });
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
  });
});

describe('예약 처리와 하루 1회 예약', () => {
  test('예약 처리: 서명도 Bearer 도 없으면 401 이다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    await seedGuardian(h, ctx);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const raw = JSON.stringify(dueBody());
    const attempts = [
      {},
      { authorization: `Bearer ${CRON_SECRET}x` },
      { authorization: `bearer ${CRON_SECRET}` },
      { authorization: CRON_SECRET },
      // 메모리 모드에는 QStash 설정이 없어 서명을 받지 않는다
      { 'upstash-signature': qstashJwt(raw, ctx.now()) },
    ];
    for (const headers of attempts) {
      const body = await expectStatus(await h.due(call('POST', '/api/watch/due', raw, { headers })), 401);
      assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    }
    // CRON_SECRET 이 설정되지 않았으면 Bearer 도 통하지 않는다
    const noCron = handlersFor(ctx, without(ENV, 'CRON_SECRET'));
    assert.equal((await noCron.due(call('POST', '/api/watch/due', raw, { headers: { authorization: 'Bearer ' } }))).status, 401);
    assert.equal(ctx.push.sent.length, 0);
  });

  test('예약 처리: Bearer CRON_SECRET 으로 부르면 처리하고 200 이다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    await seedGuardian(h, ctx);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const lines = captureLogs();
    assert.deepEqual(await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200), { ok: true });
    assert.equal(ctx.push.sent.length, 1);
    // 같은 예약이 다시 와도 한 번만 보낸다
    assert.deepEqual(await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200), { ok: true });
    assert.equal(ctx.push.sent.length, 1);
    const logs = logsOf(lines()).filter((l) => l.route === 'watch.due');
    assert.deepEqual(
      logs.map((l) => [l.outcome, l.counts?.push]),
      [
        ['SENT', '2xx'],
        ['SKIP_DUP', undefined],
      ],
    );
    // 인증 뒤 본문 형식이 틀리면 400 이다
    const bad = await expectStatus(await h.due(call('POST', '/api/watch/due', { k: 'x', d: TODAY, t: '14:30' }, { headers: BEARER })), 400);
    assert.equal(bad.field, 'k');
  });

  test('예약 처리: 스위치가 꺼졌거나 차단 스위치가 켜지면 보낼 때가 된 마감도 보내지 않고 200 SKIP_OFF 다', async () => {
    for (const env of [OFF_ENV, KILLED_ENV]) {
      const { ctx, h } = setup();
      await seedPatient(h, ctx);
      await seedGuardian(h, ctx);
      // 14:30 마감의 보낼 시각(14:40 KST). 켜져 있으면 보내는 때다
      ctx.clock.set('2026-11-20T05:40:00Z');
      const lines = captureLogs();
      const body = await expectStatus(await handlersFor(ctx, env).due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200);
      assert.deepEqual(body, { ok: true });
      assert.equal(ctx.push.sent.length, 0);
      assert.deepEqual(
        logsOf(lines()).map((l) => [l.route, l.outcome, l.errorCode]),
        [['watch.due', 'SKIP_OFF', undefined]],
      );
      // 주입한 ctx 없이 설정만으로 만든 처리기도 같다(createWatchCtx 의 enabled)
      const lines2 = captureLogs();
      const bare = createWatchHandlers({ env, now: ctx.now });
      assert.deepEqual(await expectStatus(await bare.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200), { ok: true });
      assert.deepEqual(logsOf(lines2()).map((l) => l.outcome), ['SKIP_OFF']);
      // 같은 때 켜진 설정이면 보낸다(위 결과가 시각 때문이 아니다)
      await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200);
      assert.equal(ctx.push.sent.length, 1);
    }
  });

  test('예약 처리: 일찍 온 예약(SKIP_EARLY, retry)은 503 이라 예약 업체가 다시 부른다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    await seedGuardian(h, ctx);
    // 14:00 KST. 14:30 마감의 보낼 시각(14:40) - 30초보다 이르다
    ctx.clock.set('2026-11-20T05:00:00Z');
    const lines = captureLogs();
    assert.deepEqual(await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 503), {
      ok: false,
      errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE',
      message: '서버 알림을 잠시 쓸 수 없습니다.',
    });
    assert.equal(ctx.push.sent.length, 0);
    assert.deepEqual(
      logsOf(lines()).map((l) => [l.outcome, l.errorCode]),
      [['SKIP_EARLY', 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE']],
    );
    // 보낼 시각에 다시 오면 보낸다
    ctx.clock.set('2026-11-20T05:40:00Z');
    await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200);
    assert.equal(ctx.push.sent.length, 1);
  });

  test('예약 처리: 인증을 저장소 설정과 본문 형식보다 먼저 본다', async () => {
    // 저장소 설정이 없으면 인증한 호출은 할 일이 없어 200, 인증 없는 호출은 401
    const noStoreEnv = without(ENV, 'SAFEHOUR_STORE_MODE');
    assert.equal(watchConfig(noStoreEnv).store, null);
    const noStore = createWatchHandlers({ env: noStoreEnv });
    assert.deepEqual(await expectStatus(await noStore.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200), {
      ok: true,
    });
    assert.equal((await expectStatus(await noStore.due(call('POST', '/api/watch/due', dueBody())), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');

    // 본문을 읽을 수 없으면 서명도 볼 수 없다. 인증 없이 오면 400 이 아니라 401, Bearer 가 맞으면 400
    const { h } = setup();
    for (const raw of ['{not json', '[1,2]', '']) {
      assert.equal((await expectStatus(await h.due(call('POST', '/api/watch/due', raw)), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED', raw);
      const bad = await expectStatus(await h.due(call('POST', '/api/watch/due', raw, { headers: BEARER })), 400);
      assert.deepEqual(bad, { ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.', field: 'body' });
    }
  });

  test('본문 상한: 상한을 넘는 스트림 본문은 끝까지 읽지 않는다(인증 없는 예약 처리 포함)', async () => {
    const CHUNK = 4096;
    const { ctx, h } = setup();
    const streamed = (path, { headers = {}, cookie } = {}) => {
      const { stream, state } = streamedBody(8 * 1024 * 1024, CHUNK);
      const hdrs = new Headers(headers);
      if (cookie) hdrs.set('cookie', cookie);
      return { state, request: new Request(`http://localhost${path}`, { method: 'POST', headers: hdrs, body: stream, duplex: 'half' }) };
    };
    const readLittle = (state) => {
      assert.ok(state.pulled <= MAX_BODY_BYTES + 2 * CHUNK, `pulled ${state.pulled}`);
      assert.equal(state.cancelled, true);
    };

    // 예약 처리는 인증 전에 본문을 읽지만 상한에서 멈추고 401 이다. Content-Length 를 작게 알려도 같다
    for (const headers of [{}, { 'content-length': '10' }]) {
      const unauth = streamed('/api/watch/due', { headers });
      assert.equal((await expectStatus(await h.due(unauth.request), 401)).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
      readLittle(unauth.state);
    }
    // Bearer 가 맞아도 상한을 넘으면 400 body
    const authed = streamed('/api/watch/due', { headers: BEARER });
    assert.equal((await expectStatus(await h.due(authed.request), 400)).field, 'body');
    readLittle(authed.state);
    // 쓰기 경로도 같다
    const register = streamed('/api/watch', { cookie: cookieFor(ctx, 'patient-1') });
    assert.equal((await expectStatus(await h.register(register.request), 400)).field, 'body');
    readLittle(register.state);
    assert.equal(await readWatch(ctx, WATCH_KEY), null);
  });

  test('예약 처리: QStash 서명으로 부르면 처리하고, 본문을 바꾸면 401 이다', async () => {
    assert.equal(watchConfig(QSTASH_ENV).enabled, true);
    const { ctx, h } = setup({ env: QSTASH_ENV });
    await seedPatient(h, ctx);
    await seedGuardian(h, ctx);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const raw = JSON.stringify(dueBody());
    const signed = (body, signature) => call('POST', '/api/watch/due', body, { headers: { 'upstash-signature': signature } });

    // 본문을 바꾸면(같은 뜻이라도 바이트가 다르면) 서명이 맞지 않는다
    const tampered = JSON.stringify(dueBody(TODAY, '18:00'));
    assert.equal((await h.due(signed(tampered, qstashJwt(raw, ctx.now())))).status, 401);
    const respaced = JSON.stringify(dueBody(), null, 1);
    assert.equal((await h.due(signed(respaced, qstashJwt(raw, ctx.now())))).status, 401);
    // 다른 키, 다른 경로로 만든 서명도 401
    assert.equal((await h.due(signed(raw, qstashJwt(raw, ctx.now(), { key: 'other-key' })))).status, 401);
    assert.equal((await h.due(signed(raw, qstashJwt(raw, ctx.now(), { sub: `${BASE_URL}/api/watch/back` })))).status, 401);
    assert.equal(ctx.push.sent.length, 0);

    assert.deepEqual(await expectStatus(await h.due(signed(raw, qstashJwt(raw, ctx.now()))), 200), { ok: true });
    assert.equal(ctx.push.sent.length, 1);
    // 다음 키로 만든 서명도 받는다
    const raw1800 = JSON.stringify(dueBody(TODAY, '18:00'));
    ctx.clock.set('2026-11-20T09:10:00Z');
    assert.deepEqual(await expectStatus(await h.due(signed(raw1800, qstashJwt(raw1800, ctx.now(), { key: QSTASH_NEXT }))), 200), {
      ok: true,
    });
    assert.equal(ctx.push.sent.length, 2);
  });

  test('예약 처리: 푸시 서비스가 RETRY 면 503 을, 저장소가 실패해도 503 을 돌려준다', async () => {
    const { ctx, h } = setup();
    await seedPatient(h, ctx);
    await seedGuardian(h, ctx);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const lines = captureLogs();

    ctx.push.outcome = 'RETRY';
    const retry = await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 503);
    assert.deepEqual(retry, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE', message: '서버 알림을 잠시 쓸 수 없습니다.' });
    // 다시 부르면 보낸다
    ctx.push.outcome = 'SENT';
    await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 200);
    assert.equal(ctx.push.sent.length, 2);

    breakKv(ctx);
    assert.equal((await expectStatus(await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })), 503)).errorCode,
      'SAFEHOUR_SERVER_PUSH_UNAVAILABLE');

    const logs = logsOf(lines()).filter((l) => l.route === 'watch.due');
    assert.deepEqual(
      logs.map((l) => [l.outcome, l.errorCode, l.counts?.push]),
      [
        ['RETRY', 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE', '5xx'],
        ['SENT', undefined, '2xx'],
        ['FAILED', 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE', undefined],
      ],
    );
  });

  test('하루 1회 예약: 꺼져 있으면 인증 없이 skipped, 켜져 있으면 Bearer 가 필요하다', async () => {
    const { ctx, h } = setup();
    for (const env of [OFF_ENV, KILLED_ENV]) {
      assert.deepEqual(await expectStatus(await handlersFor(ctx, env).cronArm(call('GET', '/api/cron/watch-arm')), 200), {
        ok: true,
        skipped: 'OFF',
      });
    }
    for (const headers of [{}, { authorization: `Bearer ${CRON_SECRET}x` }, { authorization: CRON_SECRET }]) {
      const body = await expectStatus(await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers })), 401);
      assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    }
    assert.deepEqual(await expectStatus(await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })), 200), {
      ok: true,
      armed: 0,
      failed: 0,
    });
  });

  test('하루 1회 예약: 오늘과 내일의 걸리지 않은 마감을 건다', async () => {
    // 2026-11-19 23:00 KST 에 올린다. 예약 업체가 실패해 아무것도 걸리지 않았다
    const { ctx, h } = setup({ at: '2026-11-19T14:00:00Z' });
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie: cookieFor(ctx, 'patient-1') })), 200);
    ctx.scheduler.fail = true;
    await expectStatus(
      await h.deadlines(
        call(
          'PUT',
          '/api/watch/deadlines',
          deadlinesBody([
            { date: '2026-11-19', deadlines: ['23:55'] },
            { date: '2026-11-20', deadlines: ['14:30'] },
            { date: '2026-11-21', deadlines: ['09:00'] },
            { date: '2026-11-22', deadlines: ['10:00'] },
          ]),
        ),
      ),
      200,
    );
    ctx.scheduler.fail = false;
    ctx.scheduler.calls.length = 0;

    // 2026-11-20 00:05 KST: 어제 23:55(늦은 한도 안), 오늘, 내일만 건다. 모레는 걸지 않는다
    ctx.clock.set('2026-11-19T15:05:00Z');
    const lines = captureLogs();
    const body = await expectStatus(await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })), 200);
    assert.deepEqual(body, { ok: true, armed: 3, failed: 0 });
    assert.deepEqual(
      ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`),
      ['2026-11-19 23:55', '2026-11-20 14:30', '2026-11-21 09:00'],
    );
    // 어제 23:55 는 보낼 시각(00:05)이 이미 왔으므로 지금으로 건다
    assert.equal(ctx.scheduler.calls[0].notBeforeMs, ctx.now());
    // 다시 불러도 이미 건 마감은 다시 걸지 않는다
    assert.deepEqual(await expectStatus(await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })), 200), {
      ok: true,
      armed: 0,
      failed: 0,
    });
    const log = logsOf(lines()).find((l) => l.route === 'watch.cron');
    assert.deepEqual(log.counts, { watches: 1, armed: 3, failed: 0 });
  });

  test('하루 1회 예약: 시간 예산 때문에 중간에 멈추면 응답 모양은 같고 기록에만 partial: 1 이 남는다', async () => {
    const { ctx, h } = setup({ at: '2026-11-19T14:00:00Z' });
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(), { cookie: cookieFor(ctx, 'patient-1') })), 200);
    ctx.scheduler.fail = true;
    await expectStatus(
      await h.deadlines(
        call(
          'PUT',
          '/api/watch/deadlines',
          deadlinesBody([
            { date: '2026-11-20', deadlines: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'] },
          ]),
        ),
      ),
      200,
    );
    ctx.scheduler.fail = false;
    // 발행 하나가 10초 걸리는 느린 예약 업체: 0·10·20·30·40초에 시작한 다섯 건을 걸고 50초에 멈춘다
    const original = ctx.scheduler.schedule;
    ctx.scheduler.schedule = async (args) => {
      ctx.clock.set(new Date(ctx.now() + 10_000).toISOString());
      return original(args);
    };
    ctx.clock.set('2026-11-19T15:05:00Z');
    const lines = captureLogs();
    const body = await expectStatus(await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })), 200);
    assert.deepEqual(body, { ok: true, armed: 5, failed: 0 });
    const log = logsOf(lines()).find((l) => l.route === 'watch.cron');
    assert.deepEqual(log.counts, { watches: 1, armed: 5, failed: 0, partial: 1 });
    ctx.scheduler.schedule = original;
  });
});

describe('기록과 계약', () => {
  /** 모든 경로를 한 번씩 성공시키고, 몇 가지 오류도 낸다. 응답 본문을 경로 이름으로 모은다 */
  async function tour() {
    const { ctx, h } = setup();
    const patient = cookieFor(ctx, 'patient-1');
    const guardian = cookieFor(ctx, 'guardian-1');
    const { subscription } = subscriptionFixture();
    const out = {};
    const ok = async (name, res) => {
      out[name] = await expectStatus(res, 200);
      return out[name];
    };

    await ok('pushConfig', await h.pushConfig(call('GET', '/api/push/config')));
    await ok('register', await h.register(call('POST', '/api/watch', registerBody(), { cookie: patient })));
    await ok(
      'deadlines',
      await h.deadlines(
        call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30', '18:00'] }]), { cookie: patient }),
      ),
    );
    const { subId } = await ok(
      'subscribe',
      await h.subscribe(call('POST', '/api/watch/subscribe', subscribeBody(subscription), { cookie: guardian })),
    );
    await ok('status', await h.status(call('POST', '/api/watch/status', { watchId: IDS.watchId, subId }, { cookie: guardian })));
    await ok('mute', await h.mute(call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: false }, { cookie: guardian })));
    ctx.clock.set('2026-11-20T05:40:00Z');
    await ok('due', await h.due(call('POST', '/api/watch/due', dueBody(), { headers: BEARER })));
    await ok('back', await h.back(call('POST', '/api/watch/back', backBody())));
    await ok('cronArm', await h.cronArm(call('GET', '/api/cron/watch-arm', undefined, { headers: BEARER })));
    out.cronSkipped = await expectStatus(await handlersFor(ctx, OFF_ENV).cronArm(call('GET', '/api/cron/watch-arm')), 200);

    // 오류도 몇 가지
    out.notFound = await expectStatus(
      await h.back(call('POST', '/api/watch/back', backBody({ watchId: UNKNOWN_WATCH_ID }))),
      404,
    );
    out.badRequest = await expectStatus(
      await h.subscribe(
        call('POST', '/api/watch/subscribe', subscribeBody({ ...subscription, endpoint: 'https://evil.example/x' }), { cookie: guardian }),
      ),
      400,
    );
    out.fieldError = await expectStatus(
      await h.deadlines(call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['24:00'] }]))),
      400,
    );
    out.authRequired = await expectStatus(await h.register(call('POST', '/api/watch', registerBody())), 401);
    out.off = await expectStatus(await handlersFor(ctx, OFF_ENV).back(call('POST', '/api/watch/back', backBody())), 503);

    await ok('unsubscribe', await h.unsubscribe(call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId })));
    await ok('remove', await h.remove(call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken })));
    await expectStatus(await h.register(call('POST', '/api/watch', registerBody(SECOND_WATCH_ID), { cookie: patient })), 200);
    await ok('removeAll', await h.remove(call('DELETE', '/api/watch', { all: true }, { cookie: patient })));
    return { out, ctx, subId, subscription, patient, guardian };
  }

  test('기록: 어느 경로의 기록에도 watchId·토큰·subId·endpoint·날짜·시각·계정 키가 없다', async () => {
    const lines = captureLogs();
    const { subId, subscription, patient, guardian } = await tour();
    const logs = logsOf(lines());
    // 처리기를 부른 만큼 한 줄씩
    assert.equal(logs.length, 19);
    const routes = new Set(logs.map((l) => l.route));
    for (const route of ['push.config', 'watch.register', 'watch.remove', 'watch.deadlines', 'watch.back', 'watch.subscribe',
      'watch.unsubscribe', 'watch.status', 'watch.mute', 'watch.due', 'watch.cron']) {
      assert.ok(routes.has(route), route);
    }
    for (const log of logs) {
      assert.deepEqual(
        Object.keys(log).filter((k) => !['evt', 'route', 'outcome', 'errorCode', 'ms', 'counts'].includes(k)),
        [],
      );
    }
    const all = lines().join('');
    const forbidden = [
      IDS.watchId,
      SECOND_WATCH_ID,
      UNKNOWN_WATCH_ID,
      IDS.writeToken,
      subId,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      'fcm.googleapis',
      'evil.example',
      '2026-',
      '14:30',
      '18:00',
      accountKeyOf('patient-1'),
      accountKeyOf('guardian-1'),
      ownerHashOf(accountKeyOf('patient-1'), SECRET),
      WATCH_KEY,
      patient.split('=')[1],
      guardian.split('=')[1],
      CRON_SECRET,
      VAPID.privateKey,
      '"lang"',
      '"ko"',
    ];
    for (const value of forbidden) assert.equal(all.includes(value), false, value);
  });

  test('처리기 출력: 모든 경로에서 stdout·stderr·console 로 나가는 것은 기록 줄뿐이고 금지 값이 없다(별도 프로세스)', () => {
    // 테스트 실행기가 없는 프로세스라 stdout·stderr 에 있는 것은 모두 처리기(와 그 안의 console.*)가 낸 것이다
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_OPTIONS;
    const result = spawnSync(process.execPath, [join(ROOT, 'test', 'watch-routes-child.js')], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.output[3]);

    // 성공, 오류, 꺼짐, 운영의 데모 세션, 저장소 장애 두 가지(KvError, 주소·토큰이 섞인 예외)를 모두 지났다
    const failing = [200, ...Array(11).fill(503)];
    assert.deepEqual(report.statuses, [
      // 성공 경로(18:00 예약은 아직 일러 503)
      200, 200, 200, 200, 200, 200, 200, 200, 503, 200, 200,
      // 오류 경로(404, 401, 400 셋, 401, 400, 차단 503·SKIP_OFF 200, 운영 데모 401 셋)
      404, 401, 400, 400, 400, 401, 400, 503, 200, 401, 401, 401,
      // 삭제
      200, 200, 200, 200,
      // 저장소 장애
      ...failing,
      ...failing,
    ]);
    assert.equal(report.pushes, 2);

    // stdout 의 모든 줄이 기록 줄이고, 처리기를 부른 만큼 한 줄씩이다
    const lines = result.stdout.split('\n');
    assert.equal(lines.pop(), '');
    assert.equal(lines.length, report.calls);
    for (const line of lines) {
      const entry = JSON.parse(line);
      assert.equal(entry.evt, 'watch', line);
      assert.deepEqual(
        Object.keys(entry).filter((k) => !['evt', 'route', 'outcome', 'errorCode', 'ms', 'counts'].includes(k)),
        [],
        line,
      );
    }
    // 식별 값, 쿠키, 비밀, 저장소 주소·토큰·명령, 날짜·시각, 언어가 어느 줄에도 없다
    assert.ok(report.forbidden.length > 20);
    for (const value of report.forbidden) assert.equal(result.stdout.includes(value), false, value);
  });

  test('계약: 응답 본문의 키가 표와 같다', async () => {
    const { out } = await tour();
    const keys = (obj) => Object.keys(obj).sort();
    assert.deepEqual(keys(out.pushConfig), ['enabled', 'guardianLoginRequired', 'ok', 'vapidPublicKey']);
    assert.deepEqual(keys(out.register), ['expiresOn', 'ok']);
    assert.deepEqual(keys(out.deadlines), ['armFailed', 'expiresOn', 'ok']);
    // 예약 업체가 모두 받았으면 0 이다(실패 수는 '마감 올리기: 예약 업체가 N번 실패' 시험이 본다)
    assert.equal(out.deadlines.armFailed, 0);
    assert.deepEqual(keys(out.back), ['ok', 'recorded']);
    assert.deepEqual(keys(out.subscribe), ['ok', 'subId']);
    assert.deepEqual(keys(out.unsubscribe), ['ok']);
    assert.deepEqual(keys(out.status), ['confirmed', 'date', 'muted', 'ok', 'subscriptionActive']);
    assert.deepEqual(keys(out.mute), ['muted', 'ok']);
    assert.deepEqual(keys(out.due), ['ok']);
    assert.deepEqual(keys(out.cronArm), ['armed', 'failed', 'ok']);
    assert.deepEqual(out.cronSkipped, { ok: true, skipped: 'OFF' });
    assert.deepEqual(keys(out.remove), ['ok']);
    assert.deepEqual(out.removeAll, { ok: true, deleted: 1 });
    for (const name of ['notFound', 'authRequired', 'off']) assert.deepEqual(keys(out[name]), ['errorCode', 'message', 'ok'], name);
    // 서비스가 거절한 형식(허용 목록 밖 endpoint)에는 field 가 없고, 본문 검증이 거절한 형식에는 있다
    assert.deepEqual(keys(out.badRequest), ['errorCode', 'message', 'ok']);
    assert.deepEqual(keys(out.fieldError), ['errorCode', 'field', 'message', 'ok']);
    assert.equal(out.fieldError.errorCode, 'SAFEHOUR_BAD_REQUEST');
    // 성공 응답은 중간 캐시에 남지 않는다
    const { h } = setup();
    assert.equal((await h.pushConfig(call('GET', '/api/push/config'))).headers.get('cache-control'), 'no-store');
  });
});

describe('조립', () => {
  test('createWatchCtx: 저장소나 소유 비밀이 없으면 null 이고, 검수 스위치는 넣지 않는다', async () => {
    assert.equal(createWatchCtx(watchConfig(without(ENV, 'SAFEHOUR_STORE_MODE'))), null);
    assert.equal(createWatchCtx(watchConfig(without(ENV, 'SAFEHOUR_WATCH_OWNER_SECRET'))), null);
    assert.equal(createWatchCtx(null), null);

    // 메모리 모드: 시험용 푸시 출처로만 보내고, 그 밖은 가짜 fetch 로도 나가지 않는다
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url: String(url), method: init?.method });
      return new Response(null, { status: 201 });
    };
    const memoryEnv = { ...ENV, SAFEHOUR_PUSH_TEST_ORIGIN: 'http://127.0.0.1:9999' };
    const ctx = createWatchCtx(watchConfig(memoryEnv), { now: () => Date.parse('2026-11-20T03:00:00Z'), fetchImpl });
    assert.equal('reviewed' in ctx, false);
    assert.equal(ctx.enabled, true);
    assert.equal(ctx.secret, SECRET);
    assert.equal(ctx.testOrigin, 'http://127.0.0.1:9999');
    assert.equal(ctx.keys.watch('x'), 'sh:dev:w:x');
    const { subscription } = subscriptionFixture();
    const sent = await ctx.push.send({ subscription: { ...subscription, endpoint: 'http://127.0.0.1:9999/push/a' }, payload: '{}' });
    assert.deepEqual(sent, { outcome: 'SENT', statusClass: '2xx' });
    assert.deepEqual(requests, [{ url: 'http://127.0.0.1:9999/push/a', method: 'POST' }]);
    const scheduled = await ctx.scheduler.schedule({ body: { k: 'x' }, notBeforeMs: 1, dedupId: 'd' });
    assert.equal(scheduled.ok, true);
    await ctx.scheduler.cancel(scheduled.messageId);

    // 운영 배포에서는 시험용 출처를 듣지 않는다
    const prod = createWatchCtx(watchConfig({ ...QSTASH_ENV, VERCEL_ENV: 'production', SAFEHOUR_PUSH_TEST_ORIGIN: 'http://127.0.0.1:9999' }), {
      fetchImpl,
    });
    assert.equal(prod.testOrigin, null);
    assert.equal(prod.keys.watch('x'), 'sh:prod:w:x');

    // 꺼져 있거나 차단 스위치가 켜져도 ctx 는 만든다(삭제 경로용). 그때 enabled 는 거짓이다
    for (const [name, env] of [
      ['off', OFF_ENV],
      ['killed', KILLED_ENV],
      ['killed upstash', { ...QSTASH_ENV, SAFEHOUR_KILL_SERVER_PUSH: '1' }],
    ]) {
      const built = createWatchCtx(watchConfig(env), { fetchImpl });
      assert.notEqual(built, null, name);
      assert.equal(built.enabled, false, name);
    }
  });

  test('createWatchCtx: Upstash 와 QStash 는 설정한 주소로 Bearer 를 붙여 부른다', async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url: String(url), auth: init?.headers?.Authorization });
      if (String(url).startsWith('https://store.example.test')) return Response.json({ result: null });
      return Response.json({ messageId: 'msg_1' });
    };
    const ctx = createWatchCtx(watchConfig(QSTASH_ENV), { fetchImpl });
    assert.deepEqual(await ctx.kv.exec([['GET', 'k']]), [null]);
    assert.deepEqual(await ctx.scheduler.schedule({ body: { k: 'x' }, notBeforeMs: 1000, dedupId: 'd' }), {
      ok: true,
      messageId: 'msg_1',
    });
    assert.deepEqual(requests, [
      { url: 'https://store.example.test', auth: 'Bearer store-token-value-for-route-test' },
      { url: `https://qstash.upstash.io/v2/publish/${BASE_URL}/api/watch/due`, auth: 'Bearer qstash-token-value-for-route-test' },
    ]);
    // VAPID 가 없으면 보내지 않고 REJECTED 다
    const noVapid = createWatchCtx(watchConfig(without(QSTASH_ENV, 'SAFEHOUR_VAPID_PRIVATE_KEY')), { fetchImpl });
    const before = requests.length;
    assert.equal((await noVapid.push.send({ subscription: subscriptionFixture().subscription, payload: '{}' })).outcome, 'REJECTED');
    assert.equal(requests.length, before);
  });

  test('라우트 파일이 처리기를 내보낸다', async () => {
    // 예약 업체 발행이 이어지는 경로. 마감 올리기·구독·함께 있음은 최종 검토(2026-11-15)에서 더했다
    const LONG_RUNNING = new Set([
      '../app/api/watch/deadlines/route.js',
      '../app/api/watch/subscribe/route.js',
      '../app/api/watch/mute/route.js',
      '../app/api/watch/due/route.js',
      '../app/api/cron/watch-arm/route.js',
    ]);
    const expected = [
      ['../app/api/push/config/route.js', ['GET']],
      ['../app/api/watch/route.js', ['POST', 'DELETE']],
      ['../app/api/watch/deadlines/route.js', ['PUT']],
      ['../app/api/watch/back/route.js', ['POST']],
      ['../app/api/watch/subscribe/route.js', ['POST', 'DELETE']],
      ['../app/api/watch/status/route.js', ['POST']],
      ['../app/api/watch/mute/route.js', ['POST']],
      ['../app/api/watch/due/route.js', ['POST']],
      ['../app/api/cron/watch-arm/route.js', ['GET']],
    ];
    for (const [path, methods] of expected) {
      const mod = await import(path);
      for (const method of methods) assert.equal(typeof mod[method], 'function', `${path} ${method}`);
      for (const other of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].filter((m) => !methods.includes(m))) {
        assert.equal(mod[other], undefined, `${path} ${other}`);
      }
      assert.equal(mod.runtime, 'nodejs', path);
      assert.equal(mod.dynamic, 'force-dynamic', path);
      // 예약 업체를 부르는 다섯 경로만 실행 시간을 늘린다
      assert.equal(mod.maxDuration, LONG_RUNNING.has(path) ? 60 : undefined, path);
    }
  });

  test('vercel.json 의 예약은 하루 한 번이다', () => {
    const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    assert.equal(config.crons.length, 1);
    assert.deepEqual(config.crons[0], { path: '/api/cron/watch-arm', schedule: '10 15 * * *' });
    // 기존 설정은 그대로다
    assert.equal(config.framework, 'nextjs');
    assert.deepEqual(config.regions, ['icn1']);
  });
});
