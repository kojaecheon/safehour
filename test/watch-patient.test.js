// 서버 알림 환자 쪽 동작 (lib/server/watch/patient.js)
//
// 시계는 testCtx 기본값 2026-11-20 12:00 KST(03:00Z)에서 시작한다. 시각은 늘 ctx.clock 으로만 움직인다.
// 마감 14:30 KST 기준: 보낼 시각 14:40(05:40Z), 늦은 한도 15:30(06:30Z).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteOwnedWatches,
  deleteWatch,
  markBack,
  putDeadlines,
  registerWatch,
} from '../lib/server/watch/patient.js';
import {
  DAY_FIELD,
  addOwnerWatch,
  indexMembers,
  ownerWatchKeys,
  readDay,
  readSub,
  readWatch,
  watchExpiryUnix,
  writeSub,
} from '../lib/server/watch/records.js';
import { newSubId, ownerHashOf, rateKeyOf, watchKeyOf, writeHashOf } from '../lib/server/watch/keys.js';
import { KvError } from '../lib/server/watch/kv.js';
import { DUE_OUTCOME, processDue } from '../lib/server/watch/due.js';
import { EARLY_TOLERANCE_MS, fireAtMs } from '../lib/server/watch/arm.js';
import { WATCH_LIMITS, hitRate } from '../lib/server/watch/limits.js';
import { translate } from '../src/i18n/index.js';
import { IDS, SECRET, subscriptionFixture, testCtx } from './watch-fixtures.js';

const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const YESTERDAY = '2026-11-19';
const EXPIRES_ON = '2026-11-25';
const WATCH_KEY = watchKeyOf(IDS.watchId, SECRET);
const NOT_FOUND = Object.freeze({ ok: false, reason: 'NOT_FOUND' });
const RATE_LIMITED = Object.freeze({ ok: false, reason: 'RATE_LIMITED' });
const BAD_REQUEST = Object.freeze({ ok: false, reason: 'BAD_REQUEST' });

/** 형식에 맞는 다른 식별 값. watchId 22자, writeToken 43자 */
const otherWatchId = (n) => `watch${n}`.padEnd(22, '0');
const otherToken = (n) => `token${n}`.padEnd(43, '0');

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

/** kv.exec 를 감싼다. hook(batch) 가 참을 돌려주면 그 배치에서 KvError 를 던진다 */
function failKvWhen(ctx, hook) {
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      if (hook(batch)) throw new KvError('KV_UNAVAILABLE');
      return inner.exec(batch);
    },
  };
}

/** 지금까지 쓴 모든 키를 명령에서 모아 형별로 돌려준다 */
function writtenKeys(commands) {
  const byType = { string: new Set(), hash: new Set(), set: new Set() };
  for (const [name, key] of commands) {
    if (name === 'SET' || name === 'INCR') byType.string.add(key);
    else if (name === 'HSET' || name === 'HSETNX') byType.hash.add(key);
    else if (name === 'SADD') byType.set.add(key);
  }
  return byType;
}

/** watchKey 가 남아 있는 키 이름이나 집합 원소를 모두 찾는다 */
async function leftovers(ctx, commands, watchKey) {
  const found = [];
  const { string, hash, set } = writtenKeys(commands);
  for (const key of [...string, ...hash, ...set]) {
    const [exists] = await ctx.kv.exec([['EXISTS', key]]);
    if (exists && key.includes(watchKey)) found.push(key);
  }
  for (const key of set) {
    const [members] = await ctx.kv.exec([['SMEMBERS', key]]);
    if (members.includes(watchKey)) found.push(`${key} 원소`);
  }
  return found;
}

function register(ctx, overrides = {}) {
  return registerWatch(ctx, {
    accountKey: IDS.accountKey,
    watchId: IDS.watchId,
    writeToken: IDS.writeToken,
    expiresOn: EXPIRES_ON,
    ...overrides,
  });
}

function deadlines(ctx, days, overrides = {}) {
  return putDeadlines(ctx, {
    watchId: IDS.watchId,
    writeToken: IDS.writeToken,
    expiresOn: EXPIRES_ON,
    days,
    ...overrides,
  });
}

function back(ctx, overrides = {}) {
  return markBack(ctx, {
    watchId: IDS.watchId,
    writeToken: IDS.writeToken,
    date: TODAY,
    by: '14:30',
    ...overrides,
  });
}

/** 보호자 구독을 넣는다 */
async function subscribe(ctx, { watchKey = WATCH_KEY, lang = 'ko', expiresOn = EXPIRES_ON } = {}) {
  const { subscription } = subscriptionFixture();
  await writeSub(ctx, watchKey, { subId: newSubId(), ...subscription, lang }, expiresOn);
}

/** 등록하고 오늘 14:30 마감을 올리고 보호자 구독을 넣는다 */
async function seedFlow(ctx, { times = ['14:30'], sub = true } = {}) {
  assert.deepEqual(await register(ctx), { ok: true, expiresOn: EXPIRES_ON });
  if (sub) await subscribe(ctx);
  assert.deepEqual(await deadlines(ctx, [{ date: TODAY, deadlines: times }]), {
    ok: true,
    expiresOn: EXPIRES_ON,
    armFailed: 0,
  });
}

const at = (ctx, kst) => ctx.clock.set(`${kst}+09:00`);
const due = (time = '14:30', date = TODAY) => ({ watchKey: WATCH_KEY, date, time });
const sentBody = (ctx, i) => JSON.parse(ctx.push.sent[i].payload).body;

// ---- 등록 ----

test('등록: 새 id 는 레코드를 만들고 원래 토큰은 저장되지 않는다', async () => {
  const ctx = testCtx();
  const commands = recordKv(ctx);
  const results = [];
  results.push(await register(ctx));
  assert.deepEqual(results[0], { ok: true, expiresOn: EXPIRES_ON });
  assert.deepEqual(await readWatch(ctx, WATCH_KEY), {
    ownerHash: ownerHashOf(IDS.accountKey, SECRET),
    writeHash: writeHashOf(IDS.writeToken),
    expiresOn: EXPIRES_ON,
    registrations: 0,
  });
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.accountKey, SECRET)), [WATCH_KEY]);

  // 마감 올리기, 돌아왔어요, 다시 등록까지 거친 뒤 저장소로 나간 모든 명령(키 이름과 값)을 훑는다
  await subscribe(ctx);
  results.push(await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }], { accountKey: IDS.accountKey }));
  results.push(await back(ctx));
  results.push(await register(ctx));
  assert.ok(results.every((r) => r.ok === true));
  const stored = JSON.stringify(commands);
  for (const raw of [IDS.watchId, IDS.writeToken, IDS.accountKey]) {
    assert.ok(!stored.includes(raw), `저장소로 원래 값이 나갔다: ${raw.slice(0, 5)}`);
  }
  // 결과에도 식별 값과 저장 키가 없다
  const out = JSON.stringify(results);
  for (const raw of [IDS.watchId, IDS.writeToken, IDS.accountKey, WATCH_KEY]) assert.ok(!out.includes(raw));
});

test('등록: 출국일은 오늘 + 46일로 깎인다', async () => {
  const ctx = testCtx();
  assert.deepEqual(await register(ctx, { expiresOn: '2027-12-31' }), { ok: true, expiresOn: '2027-01-05' });
  assert.equal((await readWatch(ctx, WATCH_KEY)).expiresOn, '2027-01-05');
});

test('등록: 지난 출국일은 BAD_REQUEST 다', async () => {
  const ctx = testCtx();
  assert.deepEqual(await register(ctx, { expiresOn: YESTERDAY }), BAD_REQUEST);
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  // 오늘 출국은 받는다
  assert.deepEqual(await register(ctx, { expiresOn: TODAY }), { ok: true, expiresOn: TODAY });
});

test('등록: 형식이 틀린 값은 BAD_REQUEST 이고 저장하지 않는다', async () => {
  const ctx = testCtx();
  for (const overrides of [
    { watchId: 'short' },
    { writeToken: 'short' },
    { expiresOn: '2026-13-01' },
    { expiresOn: undefined },
  ]) {
    assert.deepEqual(await register(ctx, overrides), BAD_REQUEST);
  }
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  assert.deepEqual(await register(ctx, { accountKey: '' }), BAD_REQUEST);
});

test('등록: 같은 계정이 다시 등록하면 토큰이 바뀌고 이전 토큰은 통하지 않는다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const newToken = otherToken(2);
  assert.deepEqual(await register(ctx, { writeToken: newToken, expiresOn: '2026-11-28' }), {
    ok: true,
    expiresOn: '2026-11-28',
  });
  const watch = await readWatch(ctx, WATCH_KEY);
  assert.equal(watch.registrations, 1);
  assert.equal(watch.writeHash, writeHashOf(newToken));
  assert.equal(watch.expiresOn, '2026-11-28');
  assert.deepEqual(await deadlines(ctx, [], { expiresOn: '2026-11-28' }), NOT_FOUND);
  assert.deepEqual(await deadlines(ctx, [], { writeToken: newToken, expiresOn: '2026-11-28' }), {
    ok: true,
    expiresOn: '2026-11-28',
    armFailed: 0,
  });
});

test('등록: 다시 등록하면 구독의 만료도 새 출국일에 맞춘다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await subscribe(ctx);
  await register(ctx, { expiresOn: '2026-11-30' });
  // 처음 출국일의 만료(11-25 끝 + 7일)를 지나도 구독이 남는다
  ctx.clock.set(new Date(watchExpiryUnix(EXPIRES_ON) * 1000 + 60_000).toISOString());
  assert.ok(await readWatch(ctx, WATCH_KEY));
  assert.ok(await readSub(ctx, WATCH_KEY));
});

test('등록: 다시 등록하며 출국일을 줄이면 새 출국일 뒤 날짜 기록과 예약을 지운다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await deadlines(ctx, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: TOMORROW, deadlines: ['10:00'] },
  ]);
  const tomorrowArmed = (await readDay(ctx, WATCH_KEY, TOMORROW)).armed['10:00'];
  assert.deepEqual(await register(ctx, { expiresOn: TODAY }), { ok: true, expiresOn: TODAY });
  assert.equal(await readDay(ctx, WATCH_KEY, TOMORROW), null);
  assert.deepEqual(await indexMembers(ctx, TOMORROW), []);
  assert.deepEqual(ctx.scheduler.cancelled, [tomorrowArmed]);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).deadlines, ['14:30']);
  // 출국일을 늘리는 다시 등록은 아무것도 지우지 않는다
  await register(ctx, { expiresOn: EXPIRES_ON });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).deadlines, ['14:30']);
  assert.equal(ctx.scheduler.cancelled.length, 1);
});

test('등록: 다른 계정이 같은 id 를 등록하면 NOT_FOUND 이고 레코드가 바뀌지 않는다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const before = await readWatch(ctx, WATCH_KEY);
  const commands = recordKv(ctx);
  assert.deepEqual(
    await register(ctx, { accountKey: IDS.otherAccountKey, writeToken: otherToken(9), expiresOn: '2026-12-01' }),
    NOT_FOUND,
  );
  assert.deepEqual(await readWatch(ctx, WATCH_KEY), before);
  // 지켜보기 키에 쓰는 명령이 하나도 나가지 않았다
  const watchKeyName = ctx.keys.watch(WATCH_KEY);
  assert.ok(!commands.some(([name, key]) => name !== 'GET' && key === watchKeyName));
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.otherAccountKey, SECRET)), []);
  // 원래 토큰은 그대로 통한다
  assert.equal((await deadlines(ctx, [])).ok, true);
});

test('등록: 다시 등록은 5회까지이고 6번째는 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  assert.equal((await register(ctx)).ok, true);
  for (let i = 1; i <= 5; i += 1) {
    assert.deepEqual(await register(ctx, { writeToken: otherToken(i) }), { ok: true, expiresOn: EXPIRES_ON }, `${i}번째`);
  }
  assert.equal((await readWatch(ctx, WATCH_KEY)).registrations, 5);
  assert.deepEqual(await register(ctx, { writeToken: otherToken(6) }), RATE_LIMITED);
  // 막힌 등록은 토큰을 바꾸지 않는다
  assert.equal((await readWatch(ctx, WATCH_KEY)).writeHash, writeHashOf(otherToken(5)));
});

test('등록: 한 계정의 살아 있는 지켜보기는 3개까지다', async () => {
  const ctx = testCtx();
  for (let i = 1; i <= 3; i += 1) {
    assert.equal((await register(ctx, { watchId: otherWatchId(i), writeToken: otherToken(i) })).ok, true);
  }
  assert.deepEqual(await register(ctx, { watchId: otherWatchId(4), writeToken: otherToken(4) }), RATE_LIMITED);
  assert.equal(await readWatch(ctx, watchKeyOf(otherWatchId(4), SECRET)), null);
  // 이미 가진 지켜보기를 다시 등록하는 것은 개수에 걸리지 않는다
  assert.equal((await register(ctx, { watchId: otherWatchId(1), writeToken: otherToken(1) })).ok, true);
  // 다른 계정은 따로 센다
  assert.equal(
    (await register(ctx, { accountKey: IDS.otherAccountKey, watchId: otherWatchId(5), writeToken: otherToken(5) })).ok,
    true,
  );
  // 하나를 지우면 다시 만들 수 있다
  assert.deepEqual(await deleteWatch(ctx, { watchId: otherWatchId(2), writeToken: otherToken(2) }), { ok: true });
  assert.equal((await register(ctx, { watchId: otherWatchId(4), writeToken: otherToken(4) })).ok, true);
});

test('등록: 시간당 10회를 넘으면 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  // 횟수 제한을 먼저 센다. 거절된 요청도 센다
  for (let i = 0; i < 10; i += 1) assert.deepEqual(await register(ctx, { expiresOn: YESTERDAY }), BAD_REQUEST);
  assert.deepEqual(await register(ctx), RATE_LIMITED);
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  // 계정마다 센다
  assert.equal(
    (await register(ctx, { accountKey: IDS.otherAccountKey, watchId: otherWatchId(1), writeToken: otherToken(1) })).ok,
    true,
  );
  ctx.clock.advanceMin(61);
  assert.equal((await register(ctx)).ok, true);
});

test('등록: 동시에 만들어져 NX 가 실패하면 한 번 다시 읽어 다시 등록 규칙을 적용한다', async () => {
  // 같은 계정이 먼저 만든 경우: 다시 등록으로 받는다
  const ctx = testCtx();
  let raced = false;
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      const isCreate = batch.some((c) => c[0] === 'SET' && c.includes('NX'));
      if (isCreate && !raced) {
        raced = true;
        // 이 SET NX 직전에 같은 계정의 다른 요청이 먼저 만들었다
        await registerWatch({ ...ctx, kv: inner }, {
          accountKey: IDS.accountKey,
          watchId: IDS.watchId,
          writeToken: otherToken(1),
          expiresOn: EXPIRES_ON,
        });
      }
      return inner.exec(batch);
    },
  };
  assert.deepEqual(await register(ctx), { ok: true, expiresOn: EXPIRES_ON });
  assert.equal(raced, true);
  const watch = await readWatch(ctx, WATCH_KEY);
  assert.equal(watch.registrations, 1);
  assert.equal(watch.writeHash, writeHashOf(IDS.writeToken));
  // 같은 소유자가 만든 것이라 NX 가 실패해도 소유 집합에서 빼지 않는다
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.accountKey, SECRET)), [WATCH_KEY]);

  // 다른 계정이 먼저 만든 경우: NOT_FOUND 이고 먼저 만든 레코드가 그대로다
  const ctx2 = testCtx();
  let raced2 = false;
  const inner2 = ctx2.kv;
  ctx2.kv = {
    async exec(batch) {
      const isCreate = batch.some((c) => c[0] === 'SET' && c.includes('NX'));
      if (isCreate && !raced2) {
        raced2 = true;
        await registerWatch({ ...ctx2, kv: inner2 }, {
          accountKey: IDS.otherAccountKey,
          watchId: IDS.watchId,
          writeToken: otherToken(2),
          expiresOn: EXPIRES_ON,
        });
      }
      return inner2.exec(batch);
    },
  };
  assert.deepEqual(await register(ctx2), NOT_FOUND);
  assert.deepEqual(await readWatch(ctx2, WATCH_KEY), {
    ownerHash: ownerHashOf(IDS.otherAccountKey, SECRET),
    writeHash: writeHashOf(otherToken(2)),
    expiresOn: EXPIRES_ON,
    registrations: 0,
  });
  // 먼저 넣었던 내 소유 집합 항목은 다시 뺐다(남의 지켜보기다)
  const [mine] = await inner2.exec([['SMEMBERS', ctx2.keys.owner(ownerHashOf(IDS.accountKey, SECRET))]]);
  assert.deepEqual(mine, []);
});

test('등록: 소유 집합에 먼저 넣으므로, 만들기의 응답을 잃어도 내 정보 전체 삭제가 찾아 지운다(검토 E2)', async () => {
  const ctx = testCtx();
  const inner = ctx.kv;
  let lost = false;
  ctx.kv = {
    async exec(batch) {
      const out = await inner.exec(batch);
      // SET NX 는 저장소에서 실행됐는데 응답만 잃었다
      if (!lost && batch.some((c) => c[0] === 'SET' && c.includes('NX'))) {
        lost = true;
        throw new KvError('KV_UNAVAILABLE');
      }
      return out;
    },
  };
  await assert.rejects(register(ctx), KvError);
  ctx.kv = inner;
  assert.ok(await readWatch(ctx, WATCH_KEY));
  await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }]);
  assert.deepEqual(await deleteOwnedWatches(ctx, { accountKey: IDS.accountKey }), { ok: true, deleted: 1 });
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);

  // 첫 단계(소유 집합)에서 실패하면 지켜보기를 만들지 않는다
  const first = testCtx();
  const firstInner = first.kv;
  failKvWhen(first, (batch) => batch.some((c) => c[0] === 'SADD'));
  await assert.rejects(register(first), KvError);
  first.kv = firstInner;
  assert.equal(await readWatch(first, WATCH_KEY), null);
});

test('등록: 동시에 두 번 불러도 레코드는 하나이고 둘 다 성공한다', async () => {
  const ctx = testCtx();
  const results = await Promise.all([register(ctx), register(ctx)]);
  assert.deepEqual(results, [
    { ok: true, expiresOn: EXPIRES_ON },
    { ok: true, expiresOn: EXPIRES_ON },
  ]);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.accountKey, SECRET)), [WATCH_KEY]);
  assert.ok((await readWatch(ctx, WATCH_KEY)).registrations <= 1);
});

// ---- 마감 ----

test('마감: 토큰이 틀리거나 모르는 id 는 같은 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const day = [{ date: TODAY, deadlines: ['14:30'] }];
  const wrongToken = await deadlines(ctx, day, { writeToken: otherToken(1) });
  const unknownId = await deadlines(ctx, day, { watchId: otherWatchId(1) });
  const badToken = await deadlines(ctx, day, { writeToken: 'x' });
  const badId = await deadlines(ctx, day, { watchId: 'x' });
  const otherAccount = await deadlines(ctx, day, { accountKey: IDS.otherAccountKey });
  // 만료된 지켜보기도 같은 모양이다
  const expired = testCtx();
  await register(expired);
  expired.clock.set(new Date(watchExpiryUnix(EXPIRES_ON) * 1000).toISOString());
  const gone = await deadlines(expired, day, { expiresOn: '2026-12-31' });
  for (const result of [wrongToken, unknownId, badToken, badId, otherAccount, gone]) assert.deepEqual(result, NOT_FOUND);
  assert.equal(JSON.stringify(wrongToken), JSON.stringify(gone));
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);
  assert.equal(ctx.scheduler.calls.length, 0);
});

test('마감: 세션 계정이 소유자와 다르면 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const day = [{ date: TODAY, deadlines: ['14:30'] }];
  assert.deepEqual(await deadlines(ctx, day, { accountKey: IDS.otherAccountKey }), NOT_FOUND);
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);
  // 세션이 없으면 토큰만 본다. 소유자 세션이면 통과한다
  assert.equal((await deadlines(ctx, day, { accountKey: null })).ok, true);
  assert.equal((await deadlines(ctx, day, { accountKey: IDS.accountKey })).ok, true);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).deadlines, ['14:30']);
});

test('마감: 오늘·내일 것만 예약하고 그 뒤 날짜는 저장만 한다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const result = await deadlines(ctx, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: TOMORROW, deadlines: ['10:00', '18:00'] },
    { date: '2026-11-22', deadlines: ['14:30'] },
  ]);
  assert.deepEqual(result, { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
  assert.deepEqual(
    ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`),
    [`${TODAY} 14:30`, `${TOMORROW} 10:00`, `${TOMORROW} 18:00`],
  );
  const later = await readDay(ctx, WATCH_KEY, '2026-11-22');
  assert.deepEqual(later.deadlines, ['14:30']);
  assert.deepEqual(later.armed, {});
  assert.deepEqual(await indexMembers(ctx, '2026-11-22'), [WATCH_KEY]);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).armed, { '14:30': 'm1' });
});

test('마감: 출국일이 오늘이면 내일 것은 예약하지 않는다', async () => {
  const ctx = testCtx();
  await register(ctx, { expiresOn: TODAY });
  await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }, { date: TOMORROW, deadlines: ['10:00'] }], {
    expiresOn: TODAY,
  });
  assert.deepEqual(ctx.scheduler.calls.map((c) => c.body.d), [TODAY]);
  assert.equal(await readDay(ctx, WATCH_KEY, TOMORROW), null);
});

test('마감: 지난 날짜와 출국일 뒤 날짜는 버린다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const result = await deadlines(ctx, [
    { date: YESTERDAY, deadlines: ['14:30'] },
    { date: TODAY, deadlines: ['14:30'] },
    { date: EXPIRES_ON, deadlines: ['09:00'] },
    { date: '2026-11-26', deadlines: ['09:00'] },
  ]);
  assert.deepEqual(result, { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
  assert.equal(await readDay(ctx, WATCH_KEY, YESTERDAY), null);
  assert.equal(await readDay(ctx, WATCH_KEY, '2026-11-26'), null);
  assert.deepEqual(await indexMembers(ctx, YESTERDAY), []);
  assert.deepEqual(await indexMembers(ctx, '2026-11-26'), []);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).deadlines, ['14:30']);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, EXPIRES_ON)).deadlines, ['09:00']);
});

test('마감: 지난 출국일과 형식이 틀린 출국일은 BAD_REQUEST 이고 저장하지 않는다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const day = [{ date: TODAY, deadlines: ['14:30'] }];
  assert.deepEqual(await deadlines(ctx, day, { expiresOn: YESTERDAY }), BAD_REQUEST);
  assert.deepEqual(await deadlines(ctx, day, { expiresOn: '2026-02-30' }), BAD_REQUEST);
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);
  assert.equal((await readWatch(ctx, WATCH_KEY)).expiresOn, EXPIRES_ON);
});

test('마감: 같은 내용을 다시 올려도 예약이 늘지 않는다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const days = [
    { date: TODAY, deadlines: ['14:30', '18:00'] },
    { date: TOMORROW, deadlines: ['10:00'] },
  ];
  await deadlines(ctx, days);
  assert.equal(ctx.scheduler.calls.length, 3);
  await deadlines(ctx, days);
  await deadlines(ctx, days);
  assert.equal(ctx.scheduler.calls.length, 3);
  assert.deepEqual(ctx.scheduler.cancelled, []);
});

test('마감: 빠진 시각의 예약을 취소한다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  const { armed } = await readDay(ctx, WATCH_KEY, TODAY);
  assert.equal(Object.keys(armed).length, 2);
  await deadlines(ctx, [{ date: TODAY, deadlines: ['18:00'] }]);
  assert.deepEqual(ctx.scheduler.cancelled, [armed['14:30']]);
  const after = await readDay(ctx, WATCH_KEY, TODAY);
  assert.deepEqual(after.deadlines, ['18:00']);
  assert.deepEqual(after.armed, { '18:00': armed['18:00'] });
  // 빈 목록으로 그날을 비우면 남은 예약도 취소한다
  await deadlines(ctx, [{ date: TODAY, deadlines: [] }]);
  assert.deepEqual(ctx.scheduler.cancelled, [armed['14:30'], armed['18:00']]);
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);
});

test('마감: 출국일이 늘면 레코드와 만료가 갱신된다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await subscribe(ctx);
  const result = await deadlines(ctx, [{ date: '2026-11-28', deadlines: ['14:30'] }], { expiresOn: '2026-11-30' });
  assert.deepEqual(result, { ok: true, expiresOn: '2026-11-30', armFailed: 0 });
  assert.equal((await readWatch(ctx, WATCH_KEY)).expiresOn, '2026-11-30');
  assert.deepEqual((await readDay(ctx, WATCH_KEY, '2026-11-28')).deadlines, ['14:30']);
  // 처음 출국일의 만료를 지나도 지켜보기와 구독이 남는다
  ctx.clock.set(new Date(watchExpiryUnix(EXPIRES_ON) * 1000 + 60_000).toISOString());
  assert.ok(await readWatch(ctx, WATCH_KEY));
  assert.ok(await readSub(ctx, WATCH_KEY));
  // 늘린 출국일의 만료가 지나면 둘 다 사라진다
  ctx.clock.set(new Date(watchExpiryUnix('2026-11-30') * 1000).toISOString());
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  assert.equal(await readSub(ctx, WATCH_KEY), null);
});

test('마감: 출국일을 늘리는 업로드가 만료 맞추기에서 실패해도, 다시 올리면 구독도 새 출국일까지 남는다(검토 E1)', async () => {
  const ctx = testCtx();
  assert.deepEqual(await register(ctx, { expiresOn: '2026-11-21' }), { ok: true, expiresOn: '2026-11-21' });
  await subscribe(ctx, { expiresOn: '2026-11-21' });
  // touchExpiry 배치(지켜보기·구독 EXPIREAT 둘)만 한 번 실패한다
  const inner = ctx.kv;
  let failed = false;
  ctx.kv = {
    async exec(batch) {
      if (!failed && batch.length === 2 && batch.every((c) => c[0] === 'EXPIREAT')) {
        failed = true;
        throw new KvError('KV_UNAVAILABLE');
      }
      return inner.exec(batch);
    },
  };
  await assert.rejects(deadlines(ctx, [], { expiresOn: '2026-12-20' }), KvError);
  assert.equal(failed, true);
  // 같은 업로드를 다시 올린다. 레코드의 출국일은 이미 바뀌어 있다
  assert.equal((await readWatch(ctx, WATCH_KEY)).expiresOn, '2026-12-20');
  assert.deepEqual(await deadlines(ctx, [{ date: '2026-12-05', deadlines: ['14:30'] }], { expiresOn: '2026-12-20' }), {
    ok: true,
    expiresOn: '2026-12-20',
    armFailed: 0,
  });
  // 옛 만료(11-21 끝 + 7일 = 11-29 00:00 KST)를 지나도 둘 다 남는다
  ctx.clock.set('2026-11-30T03:00:00Z');
  assert.ok(await readWatch(ctx, WATCH_KEY));
  assert.ok(await readSub(ctx, WATCH_KEY));
});

test('마감: 출국일이 같아도 업로드마다 구독 만료를 지켜보기에 다시 맞춘다', async () => {
  const ctx = testCtx();
  await register(ctx, { expiresOn: '2026-12-20' });
  await subscribe(ctx, { expiresOn: '2026-12-20' });
  // 출국일 변경과 겹쳐 옛 만료로 남은 구독을 흉내 낸다
  await ctx.kv.exec([['EXPIREAT', ctx.keys.sub(WATCH_KEY), watchExpiryUnix('2026-11-21')]]);
  assert.equal((await deadlines(ctx, [], { expiresOn: '2026-12-20' })).ok, true);
  ctx.clock.set('2026-11-30T03:00:00Z');
  assert.ok(await readSub(ctx, WATCH_KEY));
});

test('마감: 출국일도 오늘 + 46일로 깎인다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const result = await deadlines(ctx, [{ date: '2027-01-06', deadlines: ['09:00'] }], { expiresOn: '2027-12-31' });
  assert.deepEqual(result, { ok: true, expiresOn: '2027-01-05', armFailed: 0 });
  assert.equal((await readWatch(ctx, WATCH_KEY)).expiresOn, '2027-01-05');
  assert.equal(await readDay(ctx, WATCH_KEY, '2027-01-06'), null);
});

test('마감: 출국일을 줄이면 새 출국일 뒤에 남은 날짜 기록과 예약을 지운다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await subscribe(ctx);
  await deadlines(ctx, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: TOMORROW, deadlines: ['10:00'] },
    { date: '2026-11-23', deadlines: ['09:00'] },
  ]);
  const tomorrowArmed = (await readDay(ctx, WATCH_KEY, TOMORROW)).armed['10:00'];
  assert.ok(tomorrowArmed);
  // 오늘 출국으로 줄인다. 클라이언트는 남은 날짜만 보낸다
  const result = await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }], { expiresOn: TODAY });
  assert.deepEqual(result, { ok: true, expiresOn: TODAY, armFailed: 0 });
  assert.equal(await readDay(ctx, WATCH_KEY, TOMORROW), null);
  assert.equal(await readDay(ctx, WATCH_KEY, '2026-11-23'), null);
  assert.deepEqual(await indexMembers(ctx, TOMORROW), []);
  assert.deepEqual(ctx.scheduler.cancelled, [tomorrowArmed]);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).deadlines, ['14:30']);
  // 취소가 늦어 내일 예약이 와도 보내지 않는다
  at(ctx, '2026-11-21T10:10:00');
  assert.deepEqual(await processDue(ctx, due('10:00', TOMORROW)), { outcome: DUE_OUTCOME.SKIP_CHANGED, retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('마감: 예약 업체가 실패해도 ok 이고 다음 업로드에서 다시 건다', async () => {
  const ctx = testCtx();
  await register(ctx);
  ctx.scheduler.fail = true;
  const days = [{ date: TODAY, deadlines: ['14:30'] }];
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 1 });
  assert.equal(ctx.scheduler.calls.length, 1);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).armed, {});
  // 예약 업체가 던져도 응답은 같다
  ctx.scheduler.schedule = async () => {
    throw new Error('boom');
  };
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 1 });
  // 업체가 돌아오면 같은 내용의 다음 업로드가 건다
  const fresh = testCtx();
  ctx.scheduler = fresh.scheduler;
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
  assert.equal(ctx.scheduler.calls.length, 1);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).armed, { '14:30': 'm1' });
});

test('마감: armFailed 는 평소 0 이고, 예약 업체가 N번 실패하면 N 이다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const days = [
    { date: TODAY, deadlines: ['14:30', '18:00'] },
    { date: TOMORROW, deadlines: ['10:00'] },
  ];
  ctx.scheduler.fail = true;
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 3 });
  // 18:00 만 실패
  ctx.scheduler.fail = false;
  const inner = ctx.scheduler.schedule;
  ctx.scheduler.schedule = async (args) => (args.body.t === '18:00' ? { ok: false } : inner(args));
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 1 });
  ctx.scheduler.schedule = inner;
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
  assert.deepEqual(Object.keys((await readDay(ctx, WATCH_KEY, TODAY)).armed).sort(), ['14:30', '18:00']);
  // 걸 것이 없어도 0 이다
  assert.deepEqual(await deadlines(ctx, days), { ok: true, expiresOn: EXPIRES_ON, armFailed: 0 });
});

test('마감: 토큰이 맞으면 지켜보기마다 시간당 60회, 그다음은 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  await register(ctx);
  for (let i = 0; i < 60; i += 1) assert.equal((await deadlines(ctx, [])).ok, true);
  assert.deepEqual(await deadlines(ctx, []), RATE_LIMITED);
});

test('마감: 틀린 토큰·모르는 id·남의 세션은 따로 시간당 30회까지 NOT_FOUND, 그다음은 RATE_LIMITED 이고 같은 길을 지난다', async () => {
  const ctx = testCtx();
  await register(ctx);
  const cases = [
    { name: '틀린 토큰', overrides: { writeToken: otherToken(1) } },
    { name: '모르는 id', overrides: { watchId: otherWatchId(1) } },
  ];
  const shapes = [];
  for (const c of cases) {
    const commands = recordKv(ctx);
    for (let i = 0; i < 30; i += 1) assert.deepEqual(await deadlines(ctx, [], c.overrides), NOT_FOUND, c.name);
    assert.deepEqual(await deadlines(ctx, [], c.overrides), RATE_LIMITED, c.name);
    // 저장소에 가는 명령의 이름 순서가 같다(조회 한 번, 틀린 쪽 계수기 한 번)
    shapes.push(commands.map((cmd) => cmd[0]).join(','));
  }
  assert.equal(shapes[0], shapes[1]);
  // 남의 세션도 틀린 쪽에 센다
  const other = testCtx();
  await register(other);
  for (let i = 0; i < 30; i += 1) {
    assert.deepEqual(await deadlines(other, [], { accountKey: IDS.otherAccountKey }), NOT_FOUND);
  }
  assert.deepEqual(await deadlines(other, [], { accountKey: IDS.otherAccountKey }), RATE_LIMITED);
  assert.equal((await deadlines(other, [])).ok, true);
});

test('마감: 한 계정이 지켜보기 셋에 마감 목록을 번갈아 올려도 지켜보기마다 하루 예약 발행은 120건까지다(검토 B1)', async () => {
  const ctx = testCtx({ at: '2026-11-20T00:00:00Z' }); // 09:00 KST, 발행 창(UTC 하루)의 시작
  const ids = [otherWatchId(1), otherWatchId(2), otherWatchId(3)];
  for (const [i, watchId] of ids.entries()) {
    assert.equal((await register(ctx, { watchId, writeToken: otherToken(i) })).ok, true);
  }
  const listA = ['20:00', '20:05', '20:10', '20:15', '20:20', '20:25', '20:30', '20:35', '20:40', '20:45'];
  const listB = ['21:00', '21:05', '21:10', '21:15', '21:20', '21:25', '21:30', '21:35', '21:40', '21:45'];
  let failedReported = 0;
  for (let round = 0; round < 60; round += 1) {
    for (const [i, watchId] of ids.entries()) {
      const list = round % 2 ? listA : listB;
      const r = await deadlines(
        ctx,
        [
          { date: TODAY, deadlines: list },
          { date: TOMORROW, deadlines: list },
        ],
        { watchId, writeToken: otherToken(i) },
      );
      assert.equal(r.ok, true);
      failedReported += r.armFailed;
    }
  }
  const perWatch = new Map();
  for (const c of ctx.scheduler.calls) perWatch.set(c.body.k, (perWatch.get(c.body.k) ?? 0) + 1);
  assert.equal(perWatch.size, 3);
  for (const n of perWatch.values()) assert.ok(n <= WATCH_LIMITS.arm.limit, `지켜보기 하나가 ${n}건 발행했다`);
  assert.equal(ctx.scheduler.calls.length, 3 * WATCH_LIMITS.arm.limit);
  // 걸지 못한 마감은 armFailed 로 알린다
  assert.ok(failedReported > 0);
});

test('마감: 쓰기 토큰 없이 61번 틀려도 환자의 진짜 업로드는 막히지 않는다(검토 N8)', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  const results = new Set();
  for (let i = 0; i < 61; i += 1) results.add((await deadlines(ctx, [], { writeToken: otherToken(1) })).reason);
  assert.deepEqual([...results].sort(), ['NOT_FOUND', 'RATE_LIMITED']);
  assert.deepEqual(await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }]), {
    ok: true,
    expiresOn: EXPIRES_ON,
    armFailed: 0,
  });
});

// ---- 돌아왔어요 ----

test('돌아왔어요: 확인하면 그 뒤 예약 처리가 보내지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:20:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, ['14:30']);
  at(ctx, '2026-11-20T14:40:00');
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SKIP_CONFIRMED, retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('돌아왔어요: 두 번 눌러도 같은 결과다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  const first = await back(ctx);
  const second = await back(ctx);
  assert.deepEqual(first, { ok: true, recorded: true });
  assert.deepEqual(second, first);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, ['14:30']);
  assert.equal(ctx.push.sent.length, 0);
});

test('돌아왔어요: 목록에 없는 시각, 내일 날짜, 그제 날짜는 recorded false 다', async () => {
  const ctx = testCtx();
  await register(ctx);
  await deadlines(ctx, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: TOMORROW, deadlines: ['14:30'] },
  ]);
  const NOT_RECORDED = { ok: true, recorded: false };
  assert.deepEqual(await back(ctx, { by: '15:00' }), NOT_RECORDED);
  assert.deepEqual(await back(ctx, { date: TOMORROW }), NOT_RECORDED);
  assert.deepEqual(await back(ctx, { date: '2026-11-18' }), NOT_RECORDED);
  assert.deepEqual(await back(ctx, { date: YESTERDAY }), NOT_RECORDED); // 어제는 받지만 기록이 없다
  assert.deepEqual(await back(ctx, { date: 'nope', by: 'nope' }), NOT_RECORDED);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, []);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TOMORROW)).confirmed, []);
  assert.equal(await readDay(ctx, WATCH_KEY, '2026-11-18'), null);
  assert.equal(await readDay(ctx, WATCH_KEY, YESTERDAY), null);
});

test('돌아왔어요: 자정 경계, 00:05 에 어제 23:55 마감을 확인할 수 있다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx, { times: ['23:55'] });
  at(ctx, '2026-11-21T00:05:00');
  assert.deepEqual(await back(ctx, { date: TODAY, by: '23:55' }), { ok: true, recorded: true });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, ['23:55']);
  assert.deepEqual(await processDue(ctx, due('23:55')), { outcome: DUE_OUTCOME.SKIP_CONFIRMED, retry: false });
  assert.equal(ctx.push.sent.length, 0);
  // 하루가 더 지나면(그제가 되면) 받지 않는다
  at(ctx, '2026-11-22T00:05:00');
  assert.deepEqual(await back(ctx, { date: TODAY, by: '23:55' }), { ok: true, recorded: false });
});

test('돌아왔어요: 되돌리면 예약 처리가 다시 보낸다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:20:00');
  await back(ctx);
  at(ctx, '2026-11-20T14:35:00');
  assert.deepEqual(await back(ctx, { undo: true }), { ok: true, recorded: true });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, []);
  at(ctx, '2026-11-20T14:40:00');
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SENT, retry: false, statusClass: '2xx' });
  assert.equal(ctx.push.sent.length, 1);
});

test('돌아왔어요: 확인한 뒤 일찍 온 예약은 다시 부르게 하므로, 보낼 시각 전에 되돌리면 그 예약이 보낸다(검토 N1)', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:00:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  at(ctx, '2026-11-20T14:30:00'); // 예약이 10분 일찍 왔다
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SKIP_EARLY, retry: true });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).armed, { '14:30': 'm1' });
  at(ctx, '2026-11-20T14:31:00');
  assert.deepEqual(await back(ctx, { undo: true }), { ok: true, recorded: true });
  // 업로드와 하루 1회 예약은 걸림 표시를 보고 다시 걸지 않는다. 예약 업체가 다시 부르는 것으로 나간다
  assert.equal((await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }])).ok, true);
  assert.equal(ctx.scheduler.calls.length, 1);
  at(ctx, '2026-11-20T14:40:00');
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SENT, retry: false, statusClass: '2xx' });
  assert.equal(ctx.push.sent.length, 1);
  assert.equal(sentBody(ctx, 0), translate('notifications.serverCompanionOverdue', 'ko', { time: '14:30' }));
});

test('돌아왔어요: 보낼 시각 - 30초부터는 되돌릴 수 없다(예약 처리가 일찍 온 예약을 받기 시작하는 순간)', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:35:00');
  await back(ctx);
  // 마감 14:30 의 보낼 시각은 14:40:00(05:40:00Z). 경계는 그 30초 전이다
  assert.equal(fireAtMs(TODAY, '14:30') - EARLY_TOLERANCE_MS, Date.parse('2026-11-20T05:39:30.000Z'));
  for (const iso of ['2026-11-20T05:39:30.000Z', '2026-11-20T05:39:59.000Z', '2026-11-20T05:40:00.000Z']) {
    ctx.clock.set(iso);
    assert.deepEqual(await back(ctx, { undo: true }), { ok: true, recorded: false }, iso);
    assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, ['14:30'], iso);
  }
  ctx.clock.set('2026-11-20T05:39:29.999Z'); // 보낼 시각 - 30_001ms
  assert.deepEqual(await back(ctx, { undo: true }), { ok: true, recorded: true });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, []);
});

test('돌아왔어요: 마감 지남 푸시를 보낸 뒤 확인하면 복귀 확인 푸시를 한 번만 보낸다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  assert.equal((await processDue(ctx, due())).outcome, DUE_OUTCOME.SENT);
  at(ctx, '2026-11-20T14:50:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
  assert.equal(sentBody(ctx, 0), translate('notifications.serverCompanionOverdue', 'ko', { time: '14:30' }));
  assert.equal(sentBody(ctx, 1), translate('notifications.serverCompanionConfirmed', 'ko', { time: '14:30' }));
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).closed, ['14:30']);
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
});

test('돌아왔어요: 복귀 확인 푸시가 실패해도 recorded true 이고 다시 보내지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  await processDue(ctx, due());
  ctx.push.outcome = 'RETRY';
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
  ctx.push.outcome = 'SENT';
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
});

test('돌아왔어요: 복귀 확인 푸시 중 저장소가 실패하면 권리를 돌려놓아 다시 누를 때 보낸다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  await processDue(ctx, due());
  const subKey = ctx.keys.sub(WATCH_KEY);
  let failOnce = true;
  failKvWhen(ctx, (batch) => {
    if (failOnce && batch.some((c) => c[0] === 'GET' && c[1] === subKey)) {
      failOnce = false;
      return true;
    }
    return false;
  });
  await assert.rejects(back(ctx), KvError);
  assert.equal(ctx.push.sent.length, 1);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).closed, []);
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
});

test('돌아왔어요: 푸시를 보내지 않은 마감을 확인하면 아무것도 보내지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:35:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  // 마감 지남 푸시 없이 늦게 확인해도 보내지 않는다
  at(ctx, '2026-11-20T15:10:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 0);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).closed, []);
});

test('돌아왔어요: 마감 지남 푸시가 보내는 중(p: 1)일 때 누르면 여기서는 보내지 않고, 예약 처리가 복귀 확인을 한 번 보낸다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  const send = ctx.push.send;
  let inFlight = null;
  ctx.push.send = async (input) => {
    if (inFlight === null) {
      inFlight = {};
      // 마감 지남 푸시가 푸시 서비스로 가는 사이 환자가 '돌아왔어요'를 누른다
      inFlight.result = await back(ctx);
      inFlight.sent = ctx.push.sent.length;
      inFlight.day = await readDay(ctx, WATCH_KEY, TODAY);
    }
    return send(input);
  };
  assert.equal((await processDue(ctx, due())).outcome, DUE_OUTCOME.SENT);
  assert.deepEqual(inFlight.result, { ok: true, recorded: true });
  assert.equal(inFlight.sent, 0, '돌아왔어요는 보내는 중인 마감에 복귀 확인을 보내지 않는다');
  assert.deepEqual([inFlight.day.pushed, inFlight.day.claimed, inFlight.day.closed], [[], ['14:30'], []]);
  // 예약 처리가 's' 를 쓰는 같은 exec 에서 확인을 보고 복귀 확인을 보냈다
  assert.equal(ctx.push.sent.length, 2);
  assert.equal(sentBody(ctx, 0), translate('notifications.serverCompanionOverdue', 'ko', { time: '14:30' }));
  assert.equal(sentBody(ctx, 1), translate('notifications.serverCompanionConfirmed', 'ko', { time: '14:30' }));
  const day = await readDay(ctx, WATCH_KEY, TODAY);
  assert.deepEqual([day.pushed, day.claimed, day.closed], [['14:30'], [], ['14:30']]);
  // 다시 눌러도 더 보내지 않는다
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.equal(ctx.push.sent.length, 2);
});

test('돌아왔어요: 앞에서 읽을 때 보내는 중(p: 1)이었어도 확인을 쓴 뒤 다시 읽어 보냄(s)이면 복귀 확인을 한 번 보낸다(검토 M8)', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  // 마감 지남 푸시를 푸시 서비스로 보내는 중에 멈춰 둔다
  let entered;
  const sending = new Promise((resolve) => {
    entered = resolve;
  });
  let releaseSend;
  const sendGate = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const send = ctx.push.send;
  ctx.push.send = async (input) => {
    if (ctx.push.sent.length === 0) {
      entered();
      await sendGate;
    }
    return send(input);
  };
  // '돌아왔어요'가 확인(c:)을 쓰기 직전: 앞 읽기는 끝났다. 보내기를 풀고 예약 처리가 끝나기를 기다린 뒤 c: 를 쓴다.
  // 예약 처리는 's' 를 쓰는 exec 에서 c: 를 보지 못하므로 복귀 확인은 '돌아왔어요'의 다시 읽기만 보낼 수 있다
  const inner = ctx.kv;
  let duePromise;
  let atConfirm = null;
  ctx.kv = {
    async exec(batch) {
      if (batch.some((c) => c[0] === 'HSET' && c[2] === DAY_FIELD.confirmed('14:30'))) {
        atConfirm = await readDay({ ...ctx, kv: inner }, WATCH_KEY, TODAY);
        releaseSend();
        await duePromise;
      }
      return inner.exec(batch);
    },
  };
  duePromise = processDue(ctx, due());
  await sending;
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  assert.deepEqual(await duePromise, { outcome: DUE_OUTCOME.SENT, retry: false, statusClass: '2xx' });
  // 앞 읽기 때는 보내는 중이었다
  assert.deepEqual([atConfirm.pushed, atConfirm.claimed], [[], ['14:30']]);
  assert.equal(ctx.push.sent.length, 2);
  assert.equal(sentBody(ctx, 0), translate('notifications.serverCompanionOverdue', 'ko', { time: '14:30' }));
  assert.equal(sentBody(ctx, 1), translate('notifications.serverCompanionConfirmed', 'ko', { time: '14:30' }));
  const day = await readDay(ctx, WATCH_KEY, TODAY);
  assert.deepEqual([day.pushed, day.claimed, day.closed], [['14:30'], [], ['14:30']]);
});

test('예약 처리: 보내는 사이 확인이 들어오면 보낸 뒤 복귀 확인을 한 번 보내고, 뒤이은 돌아왔어요는 더 보내지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T14:40:00');
  const inner = ctx.kv;
  const dayKey = ctx.keys.day(WATCH_KEY, TODAY);
  let injected = false;
  ctx.kv = {
    async exec(batch) {
      const marksSent = batch.some((c) => c[0] === 'HSET' && c[2] === DAY_FIELD.pushed('14:30') && c[3] === 's');
      if (marksSent && !injected) {
        // 환자가 쓴 확인(c:)이 's' 를 쓰기 직전에 들어온다. 그 '돌아왔어요'의 다시 읽기는 '1' 을 보았다
        injected = true;
        await inner.exec([['HSET', dayKey, DAY_FIELD.confirmed('14:30'), '1']]);
      }
      return inner.exec(batch);
    },
  };
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SENT, retry: false, statusClass: '2xx' });
  assert.equal(injected, true);
  // 예약 처리가 끝난 시점에 이미 복귀 확인이 나갔다
  assert.equal(ctx.push.sent.length, 2);
  assert.equal(sentBody(ctx, 1), translate('notifications.serverCompanionConfirmed', 'ko', { time: '14:30' }));
  at(ctx, '2026-11-20T14:45:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  const confirmedBodies = ctx.push.sent.filter(
    (_, i) => sentBody(ctx, i) === translate('notifications.serverCompanionConfirmed', 'ko', { time: '14:30' }),
  );
  assert.equal(confirmedBodies.length, 1);
  assert.equal(ctx.push.sent.length, 2);
});

test('돌아왔어요: 마감 지남 푸시가 나가지 못한 결과(NO_SUB·GONE·RETRY·CAPPED·REJECTED)는 p: 를 남기지 않아 뒤이은 확인이 아무것도 보내지 않는다', async () => {
  const pushWindow = () => Math.floor(Date.parse('2026-11-20T05:40:00Z') / (WATCH_LIMITS.push.windowSec * 1000));
  const cases = [
    {
      expect: DUE_OUTCOME.SKIP_NO_SUB,
      prepare(ctx) {
        // 권리를 얻은 직후 구독이 사라진다
        const inner = ctx.kv;
        ctx.kv = {
          async exec(batch) {
            const out = await inner.exec(batch);
            if (batch.some((c) => c[0] === 'HSETNX' && c[2] === DAY_FIELD.pushed('14:30'))) {
              await inner.exec([['DEL', ctx.keys.sub(WATCH_KEY)]]);
            }
            return out;
          },
        };
        return () => {
          ctx.kv = inner;
        };
      },
    },
    {
      expect: DUE_OUTCOME.SUB_GONE,
      prepare(ctx) {
        ctx.push.outcome = 'GONE';
      },
    },
    {
      expect: DUE_OUTCOME.RETRY,
      prepare(ctx) {
        ctx.push.outcome = 'RETRY';
      },
    },
    {
      expect: DUE_OUTCOME.SKIP_CAP,
      async prepare(ctx) {
        for (let i = 0; i < WATCH_LIMITS.push.limit; i += 1) await hitRate(ctx, 'push', WATCH_KEY);
        // 한도 창이 바뀌어 다시 보낼 수 있게 된 상황을 계수기를 지워 만든다
        return () =>
          ctx.kv.exec([['DEL', ctx.keys.rate(rateKeyOf({ bucket: 'push', subject: WATCH_KEY }, SECRET), pushWindow())]]);
      },
    },
    {
      expect: DUE_OUTCOME.SEND_REJECTED,
      prepare(ctx) {
        ctx.push.outcome = 'REJECTED';
      },
    },
  ];
  for (const c of cases) {
    const ctx = testCtx();
    await seedFlow(ctx);
    at(ctx, '2026-11-20T14:40:00');
    const restore = await c.prepare(ctx);
    assert.equal((await processDue(ctx, due())).outcome, c.expect);
    const sentAfterDue = ctx.push.sent.length;
    const day = await readDay(ctx, WATCH_KEY, TODAY);
    assert.deepEqual([day.pushed, day.claimed], [[], []], `${c.expect}: p: 가 남지 않는다`);

    // 푸시를 보낼 수 있는 상태로 돌린다(구독이 다시 생기고 한도가 풀린다)
    if (restore) await restore();
    ctx.push.outcome = 'SENT';
    if (!(await readSub(ctx, WATCH_KEY))) await subscribe(ctx);
    at(ctx, '2026-11-20T14:50:00');
    assert.deepEqual(await back(ctx), { ok: true, recorded: true }, c.expect);
    assert.equal(ctx.push.sent.length, sentAfterDue, `${c.expect}: 복귀 확인을 보내지 않는다`);
    assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).closed, [], c.expect);
  }
});

test('돌아왔어요: 토큰이 틀리면 NOT_FOUND 다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  assert.deepEqual(await back(ctx, { writeToken: otherToken(1) }), NOT_FOUND);
  assert.deepEqual(await back(ctx, { watchId: otherWatchId(1) }), NOT_FOUND);
  assert.deepEqual(await back(ctx, { writeToken: otherToken(1), undo: true }), NOT_FOUND);
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).confirmed, []);
});

test('돌아왔어요: 지켜보기마다 하루 50회를 넘으면 RATE_LIMITED 다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  for (let i = 0; i < 50; i += 1) assert.equal((await back(ctx)).ok, true);
  assert.deepEqual(await back(ctx), RATE_LIMITED);
});

test('돌아왔어요: 쓰기 토큰 없이 50번 눌러도 환자의 진짜 확인은 받아들여지고 마감 지남 푸시가 나가지 않는다(검토 N8)', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  at(ctx, '2026-11-20T13:00:00');
  const outs = [];
  for (let i = 0; i < 50; i += 1) outs.push((await back(ctx, { writeToken: otherToken(1) })).reason);
  // 틀린 쪽은 시간당 30회까지 NOT_FOUND, 그다음은 RATE_LIMITED 다
  assert.deepEqual(outs, [...Array(30).fill('NOT_FOUND'), ...Array(20).fill('RATE_LIMITED')]);
  at(ctx, '2026-11-20T14:20:00');
  assert.deepEqual(await back(ctx), { ok: true, recorded: true });
  at(ctx, '2026-11-20T14:40:00');
  assert.deepEqual(await processDue(ctx, due()), { outcome: DUE_OUTCOME.SKIP_CONFIRMED, retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('돌아왔어요: 모르는 id 와 틀린 토큰은 같은 틀린 쪽 항목에 세고, 맞는 토큰의 횟수를 쓰지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  const unknown = { watchId: otherWatchId(1) };
  for (let i = 0; i < 30; i += 1) assert.deepEqual(await back(ctx, unknown), NOT_FOUND);
  assert.deepEqual(await back(ctx, unknown), RATE_LIMITED);
  for (let i = 0; i < 30; i += 1) assert.deepEqual(await back(ctx, { writeToken: otherToken(1) }), NOT_FOUND);
  assert.deepEqual(await back(ctx, { writeToken: otherToken(1) }), RATE_LIMITED);
  // 틀린 쪽이 넘친 뒤에도 맞는 토큰은 하루 50회를 다 쓴다
  for (let i = 0; i < 50; i += 1) assert.equal((await back(ctx)).ok, true, `${i + 1}번째`);
  assert.deepEqual(await back(ctx), RATE_LIMITED);
  // 형식이 틀린 id 는 저장소에 묻지 않는다(세지도 않는다)
  const commands = recordKv(ctx);
  assert.deepEqual(await back(ctx, { watchId: 'short' }), NOT_FOUND);
  assert.deepEqual(commands, []);
});

// ---- 삭제 ----

test('삭제: 지켜보기·구독·날짜 기록이 모두 사라지고 건 예약을 취소한다', async () => {
  const ctx = testCtx();
  const commands = recordKv(ctx);
  await register(ctx);
  await subscribe(ctx);
  await deadlines(ctx, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: TOMORROW, deadlines: ['10:00'] },
    { date: '2026-11-23', deadlines: ['09:00'] },
  ]);
  await back(ctx);
  assert.ok((await leftovers(ctx, commands, WATCH_KEY)).length > 0);
  assert.deepEqual(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken }), { ok: true });
  assert.deepEqual([...ctx.scheduler.cancelled].sort(), ['m1', 'm2']);
  assert.deepEqual(await leftovers(ctx, commands, WATCH_KEY), []);
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  assert.equal(await readSub(ctx, WATCH_KEY), null);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.accountKey, SECRET)), []);
  // 지운 뒤에는 NOT_FOUND 다
  assert.deepEqual(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken }), NOT_FOUND);
});

test('삭제: 출국일 상한(오늘 + 46일) 날짜의 기록도 지운다(검토 M8)', async () => {
  const ctx = testCtx();
  const last = '2027-01-05'; // 2026-11-20 + 46일
  assert.deepEqual(await register(ctx, { expiresOn: '2027-12-31' }), { ok: true, expiresOn: last });
  await deadlines(ctx, [{ date: last, deadlines: ['09:00'] }], { expiresOn: '2027-12-31' });
  assert.deepEqual((await readDay(ctx, WATCH_KEY, last)).deadlines, ['09:00']);
  assert.ok((await indexMembers(ctx, last)).includes(WATCH_KEY));
  assert.deepEqual(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken }), { ok: true });
  assert.equal(await readDay(ctx, WATCH_KEY, last), null);
  assert.ok(!(await indexMembers(ctx, last)).includes(WATCH_KEY));
});

test('삭제: ctx.enabled 가 거짓이어도 동작한다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  await register(ctx, { watchId: otherWatchId(1), writeToken: otherToken(1) });
  ctx.enabled = false;
  assert.deepEqual(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken }), { ok: true });
  assert.equal(await readWatch(ctx, WATCH_KEY), null);
  assert.deepEqual(ctx.scheduler.cancelled, ['m1']);
  assert.deepEqual(await deleteOwnedWatches(ctx, { accountKey: IDS.accountKey }), { ok: true, deleted: 1 });
  assert.equal(await readWatch(ctx, watchKeyOf(otherWatchId(1), SECRET)), null);
});

test('삭제: 토큰이 틀리면 NOT_FOUND 이고 아무것도 지우지 않는다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  assert.deepEqual(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: otherToken(1) }), NOT_FOUND);
  assert.deepEqual(await deleteWatch(ctx, { watchId: otherWatchId(1), writeToken: IDS.writeToken }), NOT_FOUND);
  assert.deepEqual(await deleteWatch(ctx, {}), NOT_FOUND);
  assert.ok(await readWatch(ctx, WATCH_KEY));
  assert.ok(await readSub(ctx, WATCH_KEY));
  assert.deepEqual((await readDay(ctx, WATCH_KEY, TODAY)).armed, { '14:30': 'm1' });
  assert.deepEqual(ctx.scheduler.cancelled, []);
});

test('내 정보 전체 삭제: 그 계정의 지켜보기만 지운다', async () => {
  const ctx = testCtx();
  const mine = [IDS.watchId, otherWatchId(1)];
  const theirs = otherWatchId(2);
  await register(ctx);
  await register(ctx, { watchId: mine[1], writeToken: otherToken(1) });
  await register(ctx, { accountKey: IDS.otherAccountKey, watchId: theirs, writeToken: otherToken(2) });
  await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }]);
  await deadlines(ctx, [{ date: TODAY, deadlines: ['18:00'] }], { watchId: theirs, writeToken: otherToken(2) });
  const theirKey = watchKeyOf(theirs, SECRET);
  const theirArmed = (await readDay(ctx, theirKey, TODAY)).armed['18:00'];
  // 내 소유 집합에 남의 지켜보기가 섞여 있어도(예전에 내가 쓰던 id 를 남이 다시 등록한 경우) 지우지 않는다
  await addOwnerWatch(ctx, ownerHashOf(IDS.accountKey, SECRET), theirKey);

  assert.deepEqual(await deleteOwnedWatches(ctx, { accountKey: IDS.accountKey }), { ok: true, deleted: 2 });
  for (const id of mine) assert.equal(await readWatch(ctx, watchKeyOf(id, SECRET)), null);
  assert.equal(await readDay(ctx, WATCH_KEY, TODAY), null);
  assert.ok(await readWatch(ctx, theirKey));
  assert.deepEqual((await readDay(ctx, theirKey, TODAY)).deadlines, ['18:00']);
  assert.ok(!ctx.scheduler.cancelled.includes(theirArmed));
  assert.deepEqual(ctx.scheduler.cancelled, ['m1']);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.otherAccountKey, SECRET)), [theirKey]);
  // 지울 것이 없으면 0 이다
  assert.deepEqual(await deleteOwnedWatches(ctx, { accountKey: IDS.accountKey }), { ok: true, deleted: 0 });
});

// ---- 공통 ----

test('저장소 장애는 KvError 그대로 던진다', async () => {
  const ctx = testCtx();
  await seedFlow(ctx);
  failKvWhen(ctx, () => true);
  await assert.rejects(register(ctx), KvError);
  await assert.rejects(deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }]), KvError);
  await assert.rejects(back(ctx), KvError);
  await assert.rejects(deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken }), KvError);
  await assert.rejects(deleteOwnedWatches(ctx, { accountKey: IDS.accountKey }), KvError);
});

test('결과는 정해진 키만 담는다', async () => {
  const ctx = testCtx();
  const keysOf = (r) => Object.keys(r).sort();
  assert.deepEqual(keysOf(await register(ctx)), ['expiresOn', 'ok']);
  assert.deepEqual(keysOf(await deadlines(ctx, [{ date: TODAY, deadlines: ['14:30'] }])), ['armFailed', 'expiresOn', 'ok']);
  assert.deepEqual(keysOf(await back(ctx)), ['ok', 'recorded']);
  assert.deepEqual(keysOf(await back(ctx, { writeToken: otherToken(1) })), ['ok', 'reason']);
  assert.deepEqual(keysOf(await deleteOwnedWatches(ctx, { accountKey: IDS.otherAccountKey })), ['deleted', 'ok']);
  assert.deepEqual(keysOf(await deleteWatch(ctx, { watchId: IDS.watchId, writeToken: IDS.writeToken })), ['ok']);
  // 서비스 함수는 Date.now 를 직접 읽지 않는다
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now 를 불렀다');
  };
  try {
    const other = testCtx();
    await seedFlow(other);
    await back(other);
    await back(other, { undo: true });
    await deleteOwnedWatches(other, { accountKey: IDS.accountKey });
  } finally {
    Date.now = realNow;
  }
});
