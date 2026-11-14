// 서버 알림 보호자 쪽 동작 (lib/server/watch/guardian.js)
//
// 시계는 testCtx 기본값 2026-11-20 12:00 KST(03:00Z)에서 시작한다. 시각은 ctx.clock 으로만 움직인다.
// 지켜보기 레코드는 환자 쪽 동작 없이 records.js 의 writeWatch 로 직접 넣는다.
// 출국일 2026-11-25 의 지켜보기는 출국일 끝 + 7일인 2026-12-03 00:00 KST(2026-12-02T15:00Z)에 사라진다.
// 마감 14:30 KST 의 보낼 시각은 14:40(05:40Z)이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { muteToday, subscribeGuardian, unsubscribeGuardian, watchStatus } from '../lib/server/watch/guardian.js';
import { DAY_FIELD, findWatch, readDay, readSub, replaceDays, setDayField, writeWatch } from '../lib/server/watch/records.js';
import { ownerHashOf, watchKeyOf, writeHashOf } from '../lib/server/watch/keys.js';
import { KvError } from '../lib/server/watch/kv.js';
import { DUE_OUTCOME, processDue } from '../lib/server/watch/due.js';
import { armIndexedDates, armPending } from '../lib/server/watch/arm.js';
import { deleteWatch, putDeadlines } from '../lib/server/watch/patient.js';
import { translate } from '../src/i18n/index.js';
import { IDS, SECRET, subscriptionFixture, testCtx } from './watch-fixtures.js';

const TODAY = '2026-11-20';
const YESTERDAY = '2026-11-19';
const TOMORROW = '2026-11-21';
const EXPIRES_ON = '2026-11-25';
/** 지켜보기가 사라지는 순간(출국일 끝 + 7일)과 그 1분 전 */
const WATCH_GONE_AT = '2026-12-02T15:00:00Z';
const WATCH_LAST_MINUTE = '2026-12-02T14:59:00Z';

const UNKNOWN_WATCH_ID = 'UNKNOWNwatchIdFixture0';
const OTHER_WATCH_ID = 'OTHERwatchIdFixture_01';
const WRONG_SUB_ID = 'WRONGsubIdFixture_0123';
const OTHER_ENDPOINT = 'https://updates.push.services.mozilla.com/wpush/v2/fixture';

const NOT_FOUND = Object.freeze({ ok: false, reason: 'NOT_FOUND' });
const BAD_REQUEST = Object.freeze({ ok: false, reason: 'BAD_REQUEST' });
const RATE_LIMITED = Object.freeze({ ok: false, reason: 'RATE_LIMITED' });

/** 지켜보기 레코드 하나를 넣고 저장 키를 돌려준다 */
async function seedWatch(ctx, { watchId = IDS.watchId, expiresOn = EXPIRES_ON } = {}) {
  const watchKey = watchKeyOf(watchId, SECRET);
  const written = await writeWatch(ctx, watchKey, {
    ownerHash: ownerHashOf(IDS.accountKey, SECRET),
    writeHash: writeHashOf(IDS.writeToken),
    expiresOn,
    registrations: 0,
  });
  assert.equal(written, true);
  return watchKey;
}

/** 보호자 기기 하나. endpoint 를 주면 그 주소의 기기다 */
function device({ endpoint = null, lang = 'ko' } = {}) {
  const { subscription } = subscriptionFixture();
  return { subscription: endpoint === null ? subscription : { ...subscription, endpoint }, lang };
}

function subscribe(ctx, dev, watchId = IDS.watchId) {
  return subscribeGuardian(ctx, { watchId, subscription: dev.subscription, lang: dev.lang });
}

/** kv 로 나간 모든 명령을 쌓는다. 저장되는 값은 모두 이 명령의 인자를 거친다 */
function recordKv(ctx) {
  const commands = [];
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      commands.push(...batch.map((c) => [...c]));
      return inner.exec(batch);
    },
  };
  return commands;
}

/** 이후 모든 kv.exec 가 KvError 를 던지게 한다 */
function failKv(ctx) {
  ctx.kv = {
    async exec() {
      throw new KvError('KV_UNAVAILABLE');
    },
  };
}

/** 결과에 식별 값과 구독 원문이 섞이지 않았다 */
function assertNoInternals(result, watchKey, devices = []) {
  const text = JSON.stringify(result);
  const values = [IDS.watchId, watchKey];
  for (const d of devices) values.push(d.subscription.endpoint, d.subscription.p256dh, d.subscription.auth);
  for (const value of values) assert.ok(!text.includes(value), '결과에 내부 값이 섞였다');
}

const sentBody = (ctx, i = 0) => JSON.parse(ctx.push.sent[i].payload);

/** 마감 지남 푸시 중 그 endpoint 로 간 것 */
const overdueTo = (ctx, endpoint, time = '14:30') =>
  ctx.push.sent.filter((s) => s.subscription.endpoint === endpoint && JSON.parse(s.payload).tag === `sh-watch-${TODAY}-${time}`);

/**
 * kv.exec 를 감싼다. match(batch) 가 처음 참인 배치 직전에 race(엇갈려 끼어드는 요청)를 한 번 돌린다.
 * race 는 감싸지 않은 저장소를 쓰는 ctx 를 받는다. 감싼 것을 풀 때 쓰도록 원래 저장소를 돌려준다
 */
function raceBefore(ctx, match, race) {
  const inner = ctx.kv;
  let done = false;
  ctx.kv = {
    async exec(batch) {
      if (!done && match(batch)) {
        done = true;
        await race({ ...ctx, kv: inner });
      }
      return inner.exec(batch);
    },
  };
  return inner;
}
const isClearArmed = (batch) => batch.some((c) => c[0] === 'HDEL' && c.includes(DAY_FIELD.armed('14:30')));

// ---- 구독 ----

test('구독: subId 를 돌려주고 구독을 봉인해 저장한다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const commands = recordKv(ctx);
  const dev = device({ lang: 'ja' });
  const res = await subscribe(ctx, dev);
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res).sort(), ['ok', 'subId']);
  assert.match(res.subId, /^[A-Za-z0-9_-]{22}$/);
  assertNoInternals(res, watchKey, [dev]);

  // 저장소로 나간 명령 어디에도 구독 원문과 watchId 가 없다
  const sent = JSON.stringify(commands);
  for (const value of [dev.subscription.endpoint, dev.subscription.p256dh, dev.subscription.auth, 'fcm.googleapis.com', IDS.watchId]) {
    assert.ok(!sent.includes(value), '원문이 저장소로 나갔다');
  }
  // 저장된 값은 { v, subId, sealed } 이고 sealed 안에도 원문이 보이지 않는다
  const [raw] = await ctx.kv.exec([['GET', ctx.keys.sub(watchKey)]]);
  const stored = JSON.parse(raw);
  assert.deepEqual(Object.keys(stored).sort(), ['sealed', 'subId', 'v']);
  assert.equal(stored.subId, res.subId);
  for (const value of [dev.subscription.endpoint, dev.subscription.p256dh, dev.subscription.auth]) {
    assert.ok(!raw.includes(value));
  }
  // 봉인을 풀면 받은 그대로다
  assert.deepEqual(await readSub(ctx, watchKey), { subId: res.subId, ...dev.subscription, lang: 'ja' });
  // 이전 구독이 없으면 아무것도 보내지 않는다
  assert.equal(ctx.push.sent.length, 0);
});

test('구독: 저장하는 endpoint 는 검사를 통과한 문자열 그대로이고, 표기만 다른 같은 주소는 같은 기기로 본다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const spelled = 'https://FCM.googleapis.com:443/fcm/send/fixture';
  assert.equal((await subscribe(ctx, device({ endpoint: spelled }))).ok, true);
  assert.equal((await readSub(ctx, watchKey)).endpoint, spelled);
  // 정규화하면 같은 주소다. 같은 기기라 바뀜 알림을 보내지 않는다
  const canonical = 'https://fcm.googleapis.com/fcm/send/fixture';
  assert.equal((await subscribe(ctx, device({ endpoint: canonical }))).ok, true);
  assert.equal(ctx.push.sent.length, 0);
  assert.equal((await readSub(ctx, watchKey)).endpoint, canonical);
});

test('구독: 모르는 watchId 는 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const dev = device();
  assert.deepEqual(await subscribe(ctx, dev, UNKNOWN_WATCH_ID), NOT_FOUND);
  assert.equal(await readSub(ctx, watchKeyOf(UNKNOWN_WATCH_ID, SECRET)), null);

  // 형식이 틀린 watchId 는 저장소에 묻지도 않고 같은 NOT_FOUND 다
  const commands = recordKv(ctx);
  for (const watchId of ['short', '', null, undefined, 123, `${IDS.watchId}x`]) {
    assert.deepEqual(await subscribeGuardian(ctx, { watchId, subscription: dev.subscription, lang: 'ko' }), NOT_FOUND);
  }
  assert.equal(commands.length, 0);

  // 만료된 지켜보기도 같은 NOT_FOUND 다
  ctx.clock.set(WATCH_GONE_AT);
  assert.deepEqual(await subscribe(ctx, dev), NOT_FOUND);
  assert.equal(await readSub(ctx, watchKey), null);
  assert.equal(ctx.push.sent.length, 0);
});

test('구독: 허용 목록 밖 endpoint 는 BAD_REQUEST 이고 저장하지 않는다', async () => {
  const bad = [
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com@evil.com/',
    'https://192.0.2.1/fcm/send/x',
    'https://fcm.googleapis.com:8443/fcm/send/x',
    'http://fcm.googleapis.com/fcm/send/x',
    'https://push.apple.com/x',
    `https://fcm.googleapis.com/${'a'.repeat(2048)}`,
    '',
    123,
    null,
  ];
  for (const endpoint of bad) {
    // 횟수 제한(시간당 10회)에 걸리지 않게 경우마다 새 저장소를 쓴다
    const ctx = testCtx();
    const watchKey = await seedWatch(ctx);
    const dev = device();
    const res = await subscribeGuardian(ctx, {
      watchId: IDS.watchId,
      subscription: { ...dev.subscription, endpoint },
      lang: 'ko',
    });
    assert.deepEqual(res, BAD_REQUEST, String(endpoint).slice(0, 60));
    assert.equal(await readSub(ctx, watchKey), null);
  }
});

test('구독: 형식이 틀린 구독은 이전 구독을 바꾸지 않고 이전 기기에 아무것도 보내지 않는다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const first = await subscribe(ctx, device());
  const other = device({ endpoint: OTHER_ENDPOINT });
  const cases = [
    { subscription: { ...other.subscription, endpoint: 'https://fcm.googleapis.com.evil.com/x' }, lang: 'ko' },
    { subscription: { ...other.subscription, p256dh: undefined }, lang: 'ko' },
    { subscription: { ...other.subscription, auth: '' }, lang: 'ko' },
    { subscription: other.subscription, lang: undefined },
    { subscription: null, lang: 'ko' },
  ];
  for (const input of cases) {
    assert.deepEqual(await subscribeGuardian(ctx, { watchId: IDS.watchId, ...input }), BAD_REQUEST);
  }
  assert.equal((await readSub(ctx, watchKey)).subId, first.subId);
  assert.equal(ctx.push.sent.length, 0);
});

test('구독: 가짜 푸시 출처는 ctx.testOrigin 과 같을 때만 받는다', async () => {
  const fake = 'http://127.0.0.1:4010/push/fixture';
  const off = testCtx();
  await seedWatch(off);
  assert.deepEqual(await subscribe(off, device({ endpoint: fake })), BAD_REQUEST);

  const on = testCtx();
  on.testOrigin = 'http://127.0.0.1:4010';
  const watchKey = await seedWatch(on);
  assert.equal((await subscribe(on, device({ endpoint: fake }))).ok, true);
  assert.equal((await readSub(on, watchKey)).endpoint, fake);
  // 출처가 다르면 데모 모드여도 받지 않는다
  assert.deepEqual(await subscribe(on, device({ endpoint: 'http://127.0.0.1:4011/push/fixture' })), BAD_REQUEST);
});

test('구독: 다른 기기가 구독하면 이전 기기에 "기기가 바뀌었어요"를 한 번 보낸다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const a = device({ lang: 'en' });
  const b = device({ endpoint: OTHER_ENDPOINT, lang: 'ko' });
  const first = await subscribe(ctx, a);
  const second = await subscribe(ctx, b);
  assert.equal(second.ok, true);
  assert.notEqual(second.subId, first.subId);
  assertNoInternals(second, watchKey, [a, b]);

  assert.equal(ctx.push.sent.length, 1);
  assert.deepEqual(ctx.push.sent[0].subscription, a.subscription);
  assert.equal(ctx.push.sent[0].subscription.endpoint, a.subscription.endpoint);
  // 문구는 이전 기기의 언어로 나간다. Topic 은 없다
  const body = sentBody(ctx);
  assert.equal(body.body, translate('notifications.serverDeviceChanged', 'en'));
  assert.equal(body.tag, 'sh-watch-device');
  assert.equal(ctx.push.sent[0].topic, undefined);

  // 지금 구독은 새 기기 것 하나뿐이다
  assert.deepEqual(await readSub(ctx, watchKey), { subId: second.subId, ...b.subscription, lang: 'ko' });
});

test('구독: 같은 기기가 다시 구독하면 바뀜 알림을 보내지 않는다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const a = device();
  const first = await subscribe(ctx, a);
  // 같은 endpoint 에 키가 바뀌어 다시 구독해도 같은 기기다
  const renewed = { ...device(), subscription: { ...device().subscription, endpoint: a.subscription.endpoint } };
  const second = await subscribe(ctx, renewed);
  assert.equal(second.ok, true);
  assert.notEqual(second.subId, first.subId);
  assert.equal(ctx.push.sent.length, 0);
  // 새 키로 바뀌고 이전 subId 는 더 쓰이지 않는다
  assert.deepEqual(await readSub(ctx, watchKey), { subId: second.subId, ...renewed.subscription, lang: 'ko' });
  assert.equal((await watchStatus(ctx, { watchId: IDS.watchId, subId: first.subId })).subscriptionActive, false);
});

test('구독: 이전 기기 알림이 실패해도 새 구독은 성공한다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await subscribe(ctx, device());
  for (const outcome of ['RETRY', 'GONE', 'REJECTED']) {
    ctx.push.outcome = outcome;
    const dev = device({ endpoint: `${OTHER_ENDPOINT}-${outcome}` });
    const res = await subscribe(ctx, dev);
    assert.equal(res.ok, true, outcome);
    assert.equal((await readSub(ctx, watchKey)).subId, res.subId);
  }
  assert.equal(ctx.push.sent.length, 3);
  // 어댑터가 던져도 같다
  ctx.push.send = async () => {
    throw new Error('어댑터 실패');
  };
  const last = await subscribe(ctx, device());
  assert.equal(last.ok, true);
  assert.equal((await readSub(ctx, watchKey)).subId, last.subId);
});

test('구독: 시간당 10회를 넘으면 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await seedWatch(ctx, { watchId: OTHER_WATCH_ID });
  const dev = device();
  let last = null;
  for (let i = 0; i < 10; i += 1) {
    last = await subscribe(ctx, dev);
    assert.equal(last.ok, true, `${i + 1}번째`);
  }
  assert.deepEqual(await subscribe(ctx, dev), RATE_LIMITED);
  // 막힌 요청은 구독을 바꾸지 않는다
  assert.equal((await readSub(ctx, watchKey)).subId, last.subId);
  // 다른 지켜보기는 따로 센다
  assert.equal((await subscribe(ctx, dev, OTHER_WATCH_ID)).ok, true);
  // 다음 창에는 다시 받는다
  ctx.clock.advanceMin(60);
  assert.equal((await subscribe(ctx, dev)).ok, true);
});

test('구독: 구독의 만료는 지켜보기와 같다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const res = await subscribe(ctx, device());
  ctx.clock.set(WATCH_LAST_MINUTE);
  assert.equal((await readSub(ctx, watchKey)).subId, res.subId);
  assert.notEqual(await findWatch(ctx, IDS.watchId), null);
  ctx.clock.set(WATCH_GONE_AT);
  assert.equal(await findWatch(ctx, IDS.watchId), null);
  assert.equal(await readSub(ctx, watchKey), null);

  // 출국일이 다른 지켜보기는 그 출국일을 따른다(2026-11-21 끝 + 7일 = 2026-11-29 00:00 KST)
  const short = testCtx();
  const shortKey = await seedWatch(short, { expiresOn: '2026-11-21' });
  await subscribe(short, device());
  short.clock.set('2026-11-28T14:59:00Z');
  assert.notEqual(await readSub(short, shortKey), null);
  short.clock.set('2026-11-28T15:00:00Z');
  assert.equal(await readSub(short, shortKey), null);
});

test('구독: 구독이 없어 건너뛴 마감은 늦은 한도 안에 구독하면 다시 걸리고, 그때 예약 처리가 보낸다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await armPending(ctx, watchKey, [TODAY]);
  const due = { watchKey, date: TODAY, time: '14:30' };
  ctx.clock.set('2026-11-20T05:40:00Z'); // 14:40 KST
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SKIP_NO_SUB);
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, {});

  ctx.clock.set('2026-11-20T05:50:00Z'); // 14:50 KST, 늦은 한도(15:30) 안
  const before = ctx.scheduler.calls.length;
  assert.equal((await subscribe(ctx, device())).ok, true);
  const calls = ctx.scheduler.calls.slice(before);
  assert.deepEqual(
    calls.map((c) => c.body),
    [{ k: watchKey, d: TODAY, t: '14:30' }],
  );
  assert.equal(calls[0].notBeforeMs, ctx.now(), '보낼 시각이 지났으므로 지금 건다');
  assert.equal(Object.keys((await readDay(ctx, watchKey, TODAY)).armed).length, 1);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
  assert.equal(ctx.push.sent.length, 1);
});

test('구독: 자정을 넘겨 구독해도 어제 늦은 마감을 다시 건다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['23:55'] }]);
  ctx.clock.set('2026-11-20T15:20:00Z'); // 2026-11-21 00:20 KST
  assert.equal((await subscribe(ctx, device())).ok, true);
  assert.deepEqual(
    ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`),
    [`${TODAY} 23:55`],
  );
});

test('구독: 다시 걸기가 실패해도 구독은 성공한다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  // 예약 업체가 던진다
  ctx.scheduler.schedule = async () => {
    throw new Error('어댑터 실패');
  };
  const first = await subscribe(ctx, device());
  assert.equal(first.ok, true);
  assert.equal((await readSub(ctx, watchKey)).subId, first.subId);
  // 날짜 기록을 읽는 저장소가 실패한다
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      if (batch.some((c) => c[0] === 'HGETALL')) throw new KvError('KV_UNAVAILABLE');
      return inner.exec(batch);
    },
  };
  const second = await subscribe(ctx, device());
  assert.deepEqual(Object.keys(second).sort(), ['ok', 'subId']);
  assert.equal(second.ok, true);
  assert.equal((await readSub(ctx, watchKey)).subId, second.subId);
});

test('구독: 마감 지남 푸시를 보내는 사이 새 기기로 다시 구독해도, 그 마감은 새 기기로 한 번 나간다(검토 N2)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const old = device();
  await subscribe(ctx, old); // 오늘 14:30 을 건다
  const fresh = device({ endpoint: OTHER_ENDPOINT });
  ctx.clock.set('2026-11-20T05:40:00Z');
  const send = ctx.push.send;
  let resub = null;
  ctx.push.send = async (input) => {
    if (resub === null) {
      resub = 'pending';
      // 옛 기기로 보내는 중에 새 기기가 구독한다. 다시 걸기는 걸림(a:)과 보내는 중(p:)을 보고 건너뛴다
      resub = await subscribe(ctx, fresh);
      ctx.push.sent.push(input);
      return { outcome: 'GONE', statusClass: '404/410' };
    }
    return send(input);
  };
  const due = { watchKey, date: TODAY, time: '14:30' };
  assert.deepEqual(await processDue(ctx, due), { outcome: DUE_OUTCOME.RETRY, retry: true, statusClass: '404/410' });
  assert.equal(resub.ok, true);
  assert.equal((await readSub(ctx, watchKey)).subId, resub.subId, '새 구독은 지우지 않는다');
  assert.equal(ctx.scheduler.calls.length, 1, '다시 걸기는 건너뛰었다');
  // 예약 업체가 다시 부른다
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
  assert.equal(overdueTo(ctx, OTHER_ENDPOINT).length, 1);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SKIP_DUP);
  assert.equal(overdueTo(ctx, OTHER_ENDPOINT).length, 1);
});

test('구독: 구독 없음으로 걸림을 지우기 직전에 구독하면, 예약 처리가 다시 불려 한 번 보낸다(검토 N3)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await armPending(ctx, watchKey, [TODAY]);
  ctx.clock.set('2026-11-20T05:40:00Z');
  const dev = device();
  let sub = null;
  const inner = raceBefore(ctx, isClearArmed, async (plain) => {
    // 구독을 쓴 뒤 다시 걸기가 날짜 기록을 읽는다. 아직 남은 a: 를 보고 건너뛴다
    sub = await subscribe(plain, dev);
  });
  const due = { watchKey, date: TODAY, time: '14:30' };
  assert.deepEqual(await processDue(ctx, due), { outcome: DUE_OUTCOME.SKIP_NO_SUB, retry: true });
  ctx.kv = inner;
  assert.equal(sub.ok, true);
  assert.equal(ctx.scheduler.calls.length, 1);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
  assert.equal(overdueTo(ctx, dev.subscription.endpoint).length, 1);

  // 걸림을 지운 뒤에 구독하면 다시 걸기가 건다(예약 처리는 다시 부르지 않는다)
  const later = testCtx();
  const laterKey = await seedWatch(later);
  await replaceDays(later, laterKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await armPending(later, laterKey, [TODAY]);
  later.clock.set('2026-11-20T05:40:00Z');
  assert.deepEqual(await processDue(later, { ...due, watchKey: laterKey }), { outcome: DUE_OUTCOME.SKIP_NO_SUB, retry: false });
  assert.equal((await subscribe(later, device())).ok, true);
  assert.equal(later.scheduler.calls.length, 2);
});

test('구독: 구독과 지켜보기 삭제가 겹치면 봉인한 구독을 남기지 않고 NOT_FOUND 다(검토 N7)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const subKey = ctx.keys.sub(watchKey);
  let removed = null;
  // 구독이 지켜보기를 찾은 뒤, 구독을 쓰기 직전에 환자가 지켜보기를 지운다
  const inner = raceBefore(
    ctx,
    (batch) => batch[0][0] === 'SET' && batch[0][1] === subKey,
    async (plain) => {
      removed = await deleteWatch(plain, { watchId: IDS.watchId, writeToken: IDS.writeToken });
    },
  );
  assert.deepEqual(await subscribe(ctx, device()), NOT_FOUND);
  ctx.kv = inner;
  assert.deepEqual(removed, { ok: true });
  assert.deepEqual(await ctx.kv.exec([['GET', subKey], ['GET', ctx.keys.watch(watchKey)]]), [null, null]);
  assert.equal(ctx.push.sent.length, 0);
});

test('구독: 구독과 출국일 연장이 겹쳐도 구독은 늘어난 출국일까지 남는다(검토 E4)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx, { expiresOn: '2026-11-21' });
  const subKey = ctx.keys.sub(watchKey);
  let extended = null;
  // 구독이 옛 출국일(11-21)을 읽은 뒤, 구독을 쓰기 직전에 환자 앱이 출국일을 12-20 으로 늘린다
  const inner = raceBefore(
    ctx,
    (batch) => batch[0][0] === 'SET' && batch[0][1] === subKey,
    async (plain) => {
      extended = await putDeadlines(plain, {
        watchId: IDS.watchId,
        writeToken: IDS.writeToken,
        expiresOn: '2026-12-20',
        days: [],
      });
    },
  );
  assert.equal((await subscribe(ctx, device())).ok, true);
  ctx.kv = inner;
  assert.deepEqual(extended, { ok: true, expiresOn: '2026-12-20', armFailed: 0 });
  // 옛 출국일의 만료(11-29 00:00 KST)를 지나도 구독이 남는다
  ctx.clock.set('2026-11-30T03:00:00Z');
  assert.notEqual(await findWatch(ctx, IDS.watchId), null);
  assert.notEqual(await readSub(ctx, watchKey), null);
});

// ---- 구독 해지 ----

test('구독 해지: subId 가 맞으면 지우고, 틀리면 NOT_FOUND 이고 남는다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const res = await subscribe(ctx, device());
  for (const subId of [WRONG_SUB_ID, undefined, null, '', 123, `${res.subId}x`]) {
    assert.deepEqual(await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId }), NOT_FOUND);
  }
  assert.deepEqual(await unsubscribeGuardian(ctx, { watchId: UNKNOWN_WATCH_ID, subId: res.subId }), NOT_FOUND);
  assert.equal((await readSub(ctx, watchKey)).subId, res.subId);

  const done = await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: res.subId });
  assert.deepEqual(done, { ok: true });
  assert.equal(await readSub(ctx, watchKey), null);
  // 이미 지운 구독은 NOT_FOUND 다
  assert.deepEqual(await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: res.subId }), NOT_FOUND);
  // 지켜보기와 날짜 기록은 남는다
  assert.notEqual(await findWatch(ctx, IDS.watchId), null);
  assert.equal(ctx.push.sent.length, 0);
});

test('구독 해지: 바뀐 이전 기기의 subId 로는 지금 구독을 지우지 못한다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const old = await subscribe(ctx, device());
  const current = await subscribe(ctx, device({ endpoint: OTHER_ENDPOINT }));
  assert.deepEqual(await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: old.subId }), NOT_FOUND);
  assert.equal((await readSub(ctx, watchKey)).subId, current.subId);
});

test('구독 해지: ctx.enabled 가 거짓이어도 동작한다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const res = await subscribe(ctx, device());
  ctx.enabled = false;
  assert.deepEqual(await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: res.subId }), { ok: true });
  assert.equal(await readSub(ctx, watchKey), null);
});

// ---- 상태 ----

test('상태: 오늘 확인된 마감과 함께 있음 여부만 돌려준다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  // 날짜 기록이 없으면 빈 목록과 거짓이다
  assert.deepEqual(await watchStatus(ctx, { watchId: IDS.watchId }), {
    ok: true,
    date: TODAY,
    confirmed: [],
    muted: false,
    subscriptionActive: false,
  });

  await replaceDays(ctx, watchKey, [
    { date: TODAY, deadlines: ['09:00', '14:30', '18:00'] },
    { date: TOMORROW, deadlines: ['11:00'] },
  ]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('18:00'), '1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('09:00'), '1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
  await setDayField(ctx, watchKey, TOMORROW, DAY_FIELD.confirmed('11:00'), '1');

  const status = await watchStatus(ctx, { watchId: IDS.watchId });
  assert.deepEqual(Object.keys(status).sort(), ['confirmed', 'date', 'muted', 'ok', 'subscriptionActive']);
  assert.deepEqual(status, {
    ok: true,
    date: TODAY,
    confirmed: ['09:00', '18:00'],
    muted: true,
    subscriptionActive: false,
  });
  // 확인되지 않은 마감, 다른 날짜, 내부 값은 나가지 않는다
  const text = JSON.stringify(status);
  for (const value of ['14:30', '11:00', TOMORROW]) assert.ok(!text.includes(value), value);
  assertNoInternals(status, watchKey);
});

test('상태: 어제 확인은 오늘 상태에 섞이지 않는다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  // 어제 기록은 오늘 낮에도 살아 있다(만료는 날짜 끝 + 1일)
  await replaceDays(ctx, watchKey, [{ date: YESTERDAY, deadlines: ['23:55'] }]);
  await setDayField(ctx, watchKey, YESTERDAY, DAY_FIELD.confirmed('23:55'), '1');
  await setDayField(ctx, watchKey, YESTERDAY, DAY_FIELD.muted, '1');
  assert.ok(await readDay(ctx, watchKey, YESTERDAY));

  const status = await watchStatus(ctx, { watchId: IDS.watchId });
  assert.deepEqual(status, { ok: true, date: TODAY, confirmed: [], muted: false, subscriptionActive: false });
  assert.ok(!JSON.stringify(status).includes(YESTERDAY));

  // 자정을 넘기면 오늘이 어제가 되고, 새 날짜만 본다
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  ctx.clock.set('2026-11-20T15:05:00Z'); // 2026-11-21 00:05 KST
  assert.deepEqual(await watchStatus(ctx, { watchId: IDS.watchId }), {
    ok: true,
    date: TOMORROW,
    confirmed: [],
    muted: false,
    subscriptionActive: false,
  });
});

test('상태: subId 가 지금 구독과 같을 때만 subscriptionActive 가 참이다', async () => {
  const ctx = testCtx();
  await seedWatch(ctx);
  const active = async (subId) => (await watchStatus(ctx, { watchId: IDS.watchId, subId })).subscriptionActive;
  // 구독이 없으면 무엇을 주어도 거짓이다
  assert.equal(await active(WRONG_SUB_ID), false);

  const a = await subscribe(ctx, device());
  assert.equal(await active(a.subId), true);
  for (const subId of [undefined, null, '', WRONG_SUB_ID, 123, a.subId.toLowerCase(), `${a.subId}x`]) {
    assert.equal(await active(subId), false, String(subId));
  }

  const b = await subscribe(ctx, device({ endpoint: OTHER_ENDPOINT }));
  assert.equal(await active(a.subId), false);
  assert.equal(await active(b.subId), true);

  await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: b.subId });
  assert.equal(await active(b.subId), false);
});

test('상태: 모르는 id 와 만료된 지켜보기는 같은 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  await seedWatch(ctx);
  const res = await subscribe(ctx, device());
  assert.deepEqual(await watchStatus(ctx, { watchId: UNKNOWN_WATCH_ID, subId: res.subId }), NOT_FOUND);
  assert.deepEqual(await watchStatus(ctx, { watchId: 'short' }), NOT_FOUND);
  ctx.clock.set(WATCH_GONE_AT);
  assert.deepEqual(await watchStatus(ctx, { watchId: IDS.watchId, subId: res.subId }), NOT_FOUND);
});

test('상태: 시간당 120회를 넘으면 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  await seedWatch(ctx);
  for (let i = 0; i < 120; i += 1) assert.equal((await watchStatus(ctx, { watchId: IDS.watchId })).ok, true);
  assert.deepEqual(await watchStatus(ctx, { watchId: IDS.watchId }), RATE_LIMITED);
  ctx.clock.advanceMin(60);
  assert.equal((await watchStatus(ctx, { watchId: IDS.watchId })).ok, true);
});

// ---- 오늘 함께 있음 ----

test('함께 있음: 켜면 그날 예약 처리가 보내지 않고, 끄면 다시 보낸다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const { subId } = await subscribe(ctx, device());

  const on = await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });
  assert.deepEqual(on, { ok: true, muted: true });
  assert.equal((await readDay(ctx, watchKey, TODAY)).muted, true);
  assert.equal((await watchStatus(ctx, { watchId: IDS.watchId, subId })).muted, true);

  ctx.clock.set('2026-11-20T05:40:00Z');
  const due = { watchKey, date: TODAY, time: '14:30' };
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SKIP_MUTED);
  assert.equal(ctx.push.sent.length, 0);

  const off = await muteToday(ctx, { watchId: IDS.watchId, subId, on: false });
  assert.deepEqual(off, { ok: true, muted: false });
  assert.equal((await readDay(ctx, watchKey, TODAY)).muted, false);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
  assert.equal(ctx.push.sent.length, 1);
});

test('함께 있음: 켠 동안 건너뛴 오늘 마감은 끄면 다시 걸리고, 예약 처리가 그 예약으로 보낸다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  const { subId } = await subscribe(ctx, device());
  // 구독이 오늘 마감 둘을 걸었다
  assert.equal(ctx.scheduler.calls.length, 2);
  await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });
  const due = { watchKey, date: TODAY, time: '14:30' };
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SKIP_MUTED);
  assert.deepEqual(Object.keys((await readDay(ctx, watchKey, TODAY)).armed), ['18:00']);
  // 켜기는 다시 걸지 않는다
  await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });
  assert.equal(ctx.scheduler.calls.length, 2);

  ctx.clock.set('2026-11-20T05:45:00Z');
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId, on: false }), { ok: true, muted: false });
  // 걸림 표시가 남은 18:00 은 다시 걸지 않고, 지워진 14:30 만 지금으로 건다
  assert.equal(ctx.scheduler.calls.length, 3);
  const rearmed = ctx.scheduler.calls[2];
  assert.deepEqual(rearmed.body, { k: watchKey, d: TODAY, t: '14:30' });
  assert.equal(rearmed.notBeforeMs, ctx.now());
  assert.deepEqual(Object.keys((await readDay(ctx, watchKey, TODAY)).armed).sort(), ['14:30', '18:00']);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
});

test('함께 있음: 함께 있음으로 걸림을 지우기 직전에 끄면, 예약 처리가 다시 불려 한 번 보낸다(검토 N4)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const dev = device();
  const { subId } = await subscribe(ctx, dev); // 오늘 14:30 을 건다
  await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });
  ctx.clock.set('2026-11-20T05:40:00Z');
  let off = null;
  const inner = raceBefore(ctx, isClearArmed, async (plain) => {
    // m 을 지운 뒤 다시 걸기가 날짜 기록을 읽는다. 아직 남은 a: 를 보고 건너뛴다
    off = await muteToday(plain, { watchId: IDS.watchId, subId, on: false });
  });
  const due = { watchKey, date: TODAY, time: '14:30' };
  assert.deepEqual(await processDue(ctx, due), { outcome: DUE_OUTCOME.SKIP_MUTED, retry: true });
  ctx.kv = inner;
  assert.deepEqual(off, { ok: true, muted: false });
  assert.equal(ctx.scheduler.calls.length, 1, '다시 걸기는 건너뛰었다');
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SENT);
  assert.equal(overdueTo(ctx, dev.subscription.endpoint).length, 1);
  assert.equal((await processDue(ctx, due)).outcome, DUE_OUTCOME.SKIP_DUP);
});

test('함께 있음: 켠 동안은 업로드·하루 1회 예약·다시 구독이 오늘 마감을 걸지 않고, 끄면 걸어 보낸다(검토 B2)', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const first = await subscribe(ctx, device());
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId: first.subId, on: true }), { ok: true, muted: true });

  const upload = (deadlines) =>
    putDeadlines(ctx, {
      watchId: IDS.watchId,
      writeToken: IDS.writeToken,
      expiresOn: EXPIRES_ON,
      days: [{ date: TODAY, deadlines }],
    });
  for (const deadlines of [['14:30'], ['14:30', '18:00'], ['15:00'], ['14:30'], ['14:30', '16:00']]) {
    assert.deepEqual(await upload(deadlines), { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 }, deadlines.join(','));
  }
  assert.deepEqual(await armIndexedDates(ctx, [TODAY]), { watches: 1, armed: 0, failed: 0 });
  const again = await subscribe(ctx, device({ endpoint: OTHER_ENDPOINT }));
  assert.equal(again.ok, true);
  assert.equal(ctx.scheduler.calls.length, 0, '함께 있음인 날은 예약 업체에 발행하지 않는다');
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, {});

  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId: again.subId, on: false }), { ok: true, muted: false });
  assert.deepEqual(
    ctx.scheduler.calls.map((c) => c.body.t),
    ['14:30', '16:00'],
  );
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.equal((await processDue(ctx, { watchKey, date: TODAY, time: '14:30' })).outcome, DUE_OUTCOME.SENT);
  assert.equal(overdueTo(ctx, OTHER_ENDPOINT).length, 1);
});

test('함께 있음: 끈 뒤 다시 걸기가 실패해도 응답은 같다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const { subId } = await subscribe(ctx, device());
  await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      if (batch.some((c) => c[0] === 'HGETALL')) throw new KvError('KV_UNAVAILABLE');
      return inner.exec(batch);
    },
  };
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId, on: false }), { ok: true, muted: false });
  ctx.kv = inner;
  assert.equal((await readDay(ctx, watchKey, TODAY)).muted, false);
});

test('함께 있음: 날짜가 바뀌면 풀린다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const { subId } = await subscribe(ctx, device());
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId, on: true }), { ok: true, muted: true });
  // 마감 목록이 없는 날에 켜도 그날 기록에만 남고, 날짜 색인에는 들어가지 않는다
  assert.deepEqual(await ctx.kv.exec([['SMEMBERS', ctx.keys.index(TODAY)]]), [[]]);

  ctx.clock.set('2026-11-20T15:00:00Z'); // 2026-11-21 00:00 KST
  const status = await watchStatus(ctx, { watchId: IDS.watchId, subId });
  assert.equal(status.date, TOMORROW);
  assert.equal(status.muted, false);

  // 다음 날 마감은 다시 보낸다
  await replaceDays(ctx, watchKey, [{ date: TOMORROW, deadlines: ['14:30'] }]);
  ctx.clock.set('2026-11-21T05:40:00Z');
  assert.equal((await processDue(ctx, { watchKey, date: TOMORROW, time: '14:30' })).outcome, DUE_OUTCOME.SENT);
});

test('함께 있음: subId 가 틀리면 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  // 구독이 없으면 어떤 subId 도 맞지 않는다
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }), NOT_FOUND);

  const old = await subscribe(ctx, device());
  const current = await subscribe(ctx, device({ endpoint: OTHER_ENDPOINT }));
  for (const subId of [old.subId, WRONG_SUB_ID, undefined, null, '', 123]) {
    assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId, on: true }), NOT_FOUND, String(subId));
  }
  assert.deepEqual(await muteToday(ctx, { watchId: UNKNOWN_WATCH_ID, subId: current.subId, on: true }), NOT_FOUND);
  assert.equal(await readDay(ctx, watchKey, TODAY), null, '아무것도 쓰지 않았다');

  // on 이 불리언이 아니면 BAD_REQUEST 이고 아무것도 쓰지 않는다
  for (const on of [undefined, 'true', 1, null]) {
    assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId: current.subId, on }), BAD_REQUEST);
  }
  assert.equal(await readDay(ctx, watchKey, TODAY), null);

  ctx.clock.set(WATCH_GONE_AT);
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId: current.subId, on: true }), NOT_FOUND);
});

test('함께 있음: 마감을 다시 올려도 유지된다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const { subId } = await subscribe(ctx, device());
  await muteToday(ctx, { watchId: IDS.watchId, subId, on: true });

  const muted = async () => (await watchStatus(ctx, { watchId: IDS.watchId, subId })).muted;
  // 같은 목록, 바뀐 목록, 빈 목록, 다시 채운 목록 모두 유지한다
  for (const deadlines of [['14:30'], ['14:30', '18:00'], [], ['16:00']]) {
    await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines }]);
    assert.equal(await muted(), true, deadlines.join(','));
  }
  ctx.clock.set('2026-11-20T07:10:00Z'); // 16:10 KST
  assert.equal((await processDue(ctx, { watchKey, date: TODAY, time: '16:00' })).outcome, DUE_OUTCOME.SKIP_MUTED);
});

test('함께 있음: 시간당 30회를 넘으면 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  const watchKey = await seedWatch(ctx);
  const { subId } = await subscribe(ctx, device());
  for (let i = 0; i < 30; i += 1) {
    assert.equal((await muteToday(ctx, { watchId: IDS.watchId, subId, on: i % 2 === 0 })).ok, true);
  }
  // 마지막(30번째)은 끄기였다. 막힌 켜기는 쓰지 않는다
  assert.deepEqual(await muteToday(ctx, { watchId: IDS.watchId, subId, on: true }), RATE_LIMITED);
  assert.equal((await readDay(ctx, watchKey, TODAY))?.muted ?? false, false);
});

// ---- 공통 ----

test('찾지 못한 경우는 네 동작 모두 바이트까지 같은 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  await seedWatch(ctx);
  const dev = device();
  const { subId } = await subscribe(ctx, dev);
  const results = [
    await subscribe(ctx, dev, UNKNOWN_WATCH_ID),
    await unsubscribeGuardian(ctx, { watchId: UNKNOWN_WATCH_ID, subId }),
    await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId: WRONG_SUB_ID }),
    await unsubscribeGuardian(ctx, { watchId: IDS.watchId }),
    await watchStatus(ctx, { watchId: UNKNOWN_WATCH_ID }),
    await muteToday(ctx, { watchId: UNKNOWN_WATCH_ID, subId, on: true }),
    await muteToday(ctx, { watchId: IDS.watchId, subId: WRONG_SUB_ID, on: true }),
    await muteToday(ctx, { watchId: IDS.watchId, on: true }),
  ];
  ctx.clock.set(WATCH_GONE_AT);
  results.push(
    await subscribe(ctx, dev),
    await unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId }),
    await watchStatus(ctx, { watchId: IDS.watchId, subId }),
    await muteToday(ctx, { watchId: IDS.watchId, subId, on: true }),
  );
  const expected = JSON.stringify(NOT_FOUND);
  for (const res of results) assert.equal(JSON.stringify(res), expected);
});

test('저장소 장애는 KvError 를 그대로 던진다', async () => {
  const calls = [
    (ctx, dev) => subscribe(ctx, dev),
    (ctx, dev, subId) => unsubscribeGuardian(ctx, { watchId: IDS.watchId, subId }),
    (ctx, dev, subId) => watchStatus(ctx, { watchId: IDS.watchId, subId }),
    (ctx, dev, subId) => muteToday(ctx, { watchId: IDS.watchId, subId, on: true }),
  ];
  for (const call of calls) {
    const ctx = testCtx();
    await seedWatch(ctx);
    const dev = device();
    const { subId } = await subscribe(ctx, dev);
    failKv(ctx);
    await assert.rejects(call(ctx, dev, subId), KvError);
  }
});

test('시계는 ctx.now 로만 읽는다', () => {
  const source = readFileSync(new URL('../lib/server/watch/guardian.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now\s*\(/.test(source));
  assert.ok(!/new Date\s*\(\s*\)/.test(source));
});
