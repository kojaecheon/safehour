// 서버 알림 네 레코드 읽기·쓰기 (lib/server/watch/records.js)
//
// 시계는 testCtx 기본값 2026-11-20 12:00 KST(03:00Z)에서 시작한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  kstToday,
  dayExpiryUnix,
  watchExpiryUnix,
  capExpiresOn,
  DAY_FIELD,
  readWatch,
  writeWatch,
  findWatch,
  findWritableWatch,
  touchExpiry,
  readDay,
  readDays,
  replaceDays,
  setDayField,
  claimDayField,
  claimAndReadDay,
  markSentAndReadDay,
  clearDayField,
  clearArmedAndReadSubExists,
  clearArmedAndReadDay,
  readSub,
  writeSub,
  deleteSub,
  addOwnerWatch,
  ownerWatchKeys,
  indexMembers,
  dropIndexMember,
  deleteWatchData,
} from '../lib/server/watch/records.js';
import { watchKeyOf, ownerHashOf, writeHashOf } from '../lib/server/watch/keys.js';
import { IDS, SECRET, testCtx, subscriptionFixture } from './watch-fixtures.js';

const TODAY = '2026-11-20';

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

function watchRecord(overrides = {}) {
  return {
    ownerHash: ownerHashOf(IDS.accountKey, SECRET),
    writeHash: writeHashOf(IDS.writeToken),
    expiresOn: '2026-11-25',
    registrations: 0,
    ...overrides,
  };
}

async function seedWatch(ctx, overrides = {}) {
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  const record = watchRecord(overrides);
  assert.equal(await writeWatch(ctx, watchKey, record), true);
  return { watchKey, record };
}

test('만료 계산: 날짜 기록은 날짜 끝 + 1일, 지켜보기는 출국일 끝 + 7일이다', () => {
  assert.equal(dayExpiryUnix('2026-11-20'), Date.parse('2026-11-21T15:00:00Z') / 1000);
  assert.equal(watchExpiryUnix('2026-11-20'), Date.parse('2026-11-27T15:00:00Z') / 1000);
  // 달과 해가 바뀌어도 맞다
  assert.equal(dayExpiryUnix('2026-12-31'), Date.parse('2027-01-01T15:00:00Z') / 1000);
});

test('capExpiresOn 은 오늘 + 46일을 넘기지 않는다', () => {
  assert.equal(capExpiresOn('2027-12-31', '2026-11-20'), '2027-01-05');
  assert.equal(capExpiresOn('2026-11-25', '2026-11-20'), '2026-11-25');
  assert.equal(capExpiresOn('2027-01-05', '2026-11-20'), '2027-01-05');
  assert.equal(capExpiresOn('2027-01-06', '2026-11-20'), '2027-01-05');
});

test('kstToday 는 KST 날짜다', () => {
  assert.equal(kstToday(Date.parse('2026-11-20T15:30:00Z')), '2026-11-21');
  assert.equal(kstToday(Date.parse('2026-11-20T14:59:59Z')), '2026-11-20');
  assert.equal(kstToday(Date.parse('2026-11-20T15:00:00Z')), '2026-11-21');
});

test('DAY_FIELD 이름', () => {
  assert.equal(DAY_FIELD.deadlines, 'dl');
  assert.equal(DAY_FIELD.muted, 'm');
  assert.equal(DAY_FIELD.confirmed('14:30'), 'c:14:30');
  assert.equal(DAY_FIELD.armed('14:30'), 'a:14:30');
  assert.equal(DAY_FIELD.pushed('14:30'), 'p:14:30');
  assert.equal(DAY_FIELD.closed('14:30'), 'k:14:30');
});

test('writeWatch onlyIfAbsent 는 이미 있으면 false 이고 덮어쓰지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey, record } = await seedWatch(ctx);
  const other = watchRecord({ writeHash: writeHashOf('x'.repeat(43)), registrations: 3 });
  assert.equal(await writeWatch(ctx, watchKey, other, { onlyIfAbsent: true }), false);
  assert.deepEqual(await readWatch(ctx, watchKey), record);
  // 없을 때는 쓴다
  const freshKey = watchKeyOf('ANOTHERwatchId_0123-ab', SECRET);
  assert.equal(await writeWatch(ctx, freshKey, other, { onlyIfAbsent: true }), true);
  assert.deepEqual(await readWatch(ctx, freshKey), other);
  // onlyIfAbsent 없이는 덮어쓴다
  assert.equal(await writeWatch(ctx, watchKey, other), true);
  assert.deepEqual(await readWatch(ctx, watchKey), other);
});

test('writeWatch 는 네 필드만 저장한다', async () => {
  const ctx = testCtx();
  const commands = recordKv(ctx);
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  await writeWatch(ctx, watchKey, { ...watchRecord(), watchId: IDS.watchId, extra: 'x' });
  const set = commands.find((c) => c[0] === 'SET');
  assert.deepEqual(Object.keys(JSON.parse(set[2])).sort(), ['expiresOn', 'ownerHash', 'registrations', 'writeHash']);
  assert.deepEqual(Object.keys(await readWatch(ctx, watchKey)).sort(), ['expiresOn', 'ownerHash', 'registrations', 'writeHash']);
});

test('지켜보기는 만료 시각이 지나면 읽히지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx, { expiresOn: '2026-11-20' });
  // 출국일 끝 + 7일 = 2026-11-28 00:00 KST = 2026-11-27T15:00Z
  ctx.clock.set('2026-11-27T14:59:00Z');
  assert.ok(await readWatch(ctx, watchKey));
  ctx.clock.set('2026-11-27T15:00:00Z');
  assert.equal(await readWatch(ctx, watchKey), null);
  assert.equal(await findWatch(ctx, IDS.watchId), null);
});

test('findWatch 는 형식이 틀린 id 를 저장소에 묻지 않고 null 이다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  const commands = recordKv(ctx);
  assert.deepEqual(await findWatch(ctx, IDS.watchId), { watchKey, watch: watchRecord() });
  const before = commands.length;
  for (const bad of ['short', `${IDS.watchId}x`, null, 42, `${IDS.watchId.slice(1)}/`]) {
    assert.equal(await findWatch(ctx, bad), null);
  }
  assert.equal(commands.length, before);
  assert.equal(await findWatch(ctx, 'UNKNOWNwatchId_0123-ab'), null);
});

test('findWritableWatch 는 토큰이 틀리면 null 이다', async () => {
  const ctx = testCtx();
  const { watchKey, record } = await seedWatch(ctx);
  assert.deepEqual(await findWritableWatch(ctx, IDS.watchId, IDS.writeToken), { watchKey, watch: record });
  assert.equal(await findWritableWatch(ctx, IDS.watchId, `${IDS.writeToken.slice(0, -1)}Z`), null);
  assert.equal(await findWritableWatch(ctx, IDS.watchId, 'short'), null);
  assert.equal(await findWritableWatch(ctx, IDS.watchId, null), null);
  assert.equal(await findWritableWatch(ctx, 'UNKNOWNwatchId_0123-ab', IDS.writeToken), null);
});

test('touchExpiry 는 구독 키의 만료를 지켜보기와 맞춘다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx, { expiresOn: '2026-11-21' });
  const { subscription } = subscriptionFixture();
  await writeSub(ctx, watchKey, { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ko' }, '2026-11-21');
  // 출국일을 늘린다
  await writeWatch(ctx, watchKey, watchRecord({ expiresOn: '2026-11-30' }));
  await touchExpiry(ctx, watchKey, '2026-11-30');
  // 이전 만료(2026-11-28T15:00Z)를 지나도 둘 다 남는다
  ctx.clock.set('2026-11-29T00:00:00Z');
  assert.ok(await readWatch(ctx, watchKey));
  assert.ok(await readSub(ctx, watchKey));
  // 새 만료(2026-12-07 15:00Z)에 둘 다 사라진다
  ctx.clock.set('2026-12-07T15:00:00Z');
  assert.equal(await readWatch(ctx, watchKey), null);
  assert.equal(await readSub(ctx, watchKey), null);
});

test('replaceDays: 새 날짜는 마감을 저장하고 색인에 넣는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  const out = await replaceDays(ctx, watchKey, [
    { date: TODAY, deadlines: ['14:30', '18:00'] },
    { date: '2026-11-21', deadlines: ['20:00'] },
  ]);
  assert.deepEqual(out, { removedMessageIds: [], changed: 2 });
  assert.deepEqual(await readDay(ctx, watchKey, TODAY), {
    deadlines: ['14:30', '18:00'],
    confirmed: [],
    armed: {},
    pushed: [],
    claimed: [],
    closed: [],
    muted: false,
  });
  assert.deepEqual(await indexMembers(ctx, TODAY), [watchKey]);
  assert.deepEqual(await indexMembers(ctx, '2026-11-21'), [watchKey]);
  assert.deepEqual(await indexMembers(ctx, '2026-11-22'), []);
  const days = await readDays(ctx, watchKey, [TODAY, '2026-11-21', '2026-11-22']);
  assert.deepEqual(days.get('2026-11-21').deadlines, ['20:00']);
  assert.equal(days.get('2026-11-22'), null);
  assert.equal(days.size, 3);
});

test('replaceDays: 같은 목록을 다시 올리면 changed 가 0 이고 확인·예약·보냄 표시가 그대로다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('18:00'), 'm7');
  assert.equal(await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('18:00')), true);
  await markSentAndReadDay(ctx, watchKey, TODAY, '14:30');
  const before = await readDay(ctx, watchKey, TODAY);

  const commands = recordKv(ctx);
  assert.deepEqual(await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]), {
    removedMessageIds: [],
    changed: 0,
  });
  assert.ok(commands.every((c) => c[0] === 'HGETALL'), '쓰기 명령이 없다');
  assert.deepEqual(await readDay(ctx, watchKey, TODAY), before);
  assert.deepEqual(before.confirmed, ['14:30']);
  assert.deepEqual(before.armed, { '18:00': 'm7' });
  assert.deepEqual(before.pushed, ['14:30']);
  assert.deepEqual(before.claimed, ['18:00']);
});

test('replaceDays: 빠진 시각의 표시를 지우고 그 예약 메시지 id 를 돌려준다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'));
  await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.closed('14:30'));
  await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('18:00'));
  // 16:00 은 마감 목록에 없고 보내는 중(p: 1) 표시만 남아 있다(예약 처리가 권리를 얻은 뒤 마감이 빠진 경우). 이것도 지운다
  await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('16:00'));
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).claimed, ['14:30', '16:00', '18:00']);

  const out = await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['18:00'] }]);
  assert.deepEqual(out, { removedMessageIds: ['m1'], changed: 1 });
  const day = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual(day.deadlines, ['18:00']);
  assert.deepEqual(day.confirmed, []);
  assert.deepEqual(day.armed, {});
  assert.deepEqual(day.pushed, []);
  assert.deepEqual(day.claimed, ['18:00']);
  assert.deepEqual(day.closed, []);
  // 보냄(s) 표시도 빠지면 지운다
  await markSentAndReadDay(ctx, watchKey, TODAY, '18:00');
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['20:00'] }]);
  const later = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual([later.pushed, later.claimed], [[], []]);
});

test('replaceDays: 빈 목록이면 날짜 기록과 색인 항목을 지운다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm9');
  assert.deepEqual(await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: [] }]), {
    removedMessageIds: ['m9'],
    changed: 1,
  });
  assert.equal(await readDay(ctx, watchKey, TODAY), null);
  assert.deepEqual(await indexMembers(ctx, TODAY), []);
  // 없던 날짜에 빈 목록은 아무것도 바꾸지 않는다
  assert.deepEqual(await replaceDays(ctx, watchKey, [{ date: '2026-11-22', deadlines: [] }]), {
    removedMessageIds: [],
    changed: 0,
  });
});

test('replaceDays: m 표시는 남는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['15:00', '19:00'] }]);
  const day = await readDay(ctx, watchKey, TODAY);
  assert.equal(day.muted, true);
  assert.deepEqual(day.deadlines, ['15:00', '19:00']);
  await clearDayField(ctx, watchKey, TODAY, DAY_FIELD.muted);
  assert.equal((await readDay(ctx, watchKey, TODAY)).muted, false);
});

test('claimDayField 는 처음만 true 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  const [a, b] = await Promise.all([
    claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30')),
    claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30')),
  ]);
  assert.deepEqual([a, b].sort(), [false, true]);
  assert.equal(await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30')), false);
  // 돌려놓으면 다시 얻을 수 있다
  await clearDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'));
  assert.equal(await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30')), true);
});

test('claimAndReadDay·markSentAndReadDay 는 exec 한 번에 쓰고, 만료를 걸고, 다시 읽는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  const key = ctx.keys.day(watchKey, TODAY);
  const batches = [];
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      batches.push(batch.map((c) => [...c]));
      return inner.exec(batch);
    },
  };

  const first = await claimAndReadDay(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'));
  assert.equal(first.claimed, true);
  assert.deepEqual([first.day.deadlines, first.day.confirmed], [['14:30'], ['14:30']]);
  assert.deepEqual([first.day.pushed, first.day.claimed], [[], ['14:30']]);
  assert.deepEqual(batches[0], [
    ['HSETNX', key, 'p:14:30', '1'],
    ['EXPIREAT', key, dayExpiryUnix(TODAY)],
    ['HGETALL', key],
  ]);
  const second = await claimAndReadDay(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'));
  assert.equal(second.claimed, false);
  assert.deepEqual(second.day.claimed, ['14:30']);

  const sent = await markSentAndReadDay(ctx, watchKey, TODAY, '14:30');
  assert.deepEqual([sent.pushed, sent.claimed, sent.confirmed], [['14:30'], [], ['14:30']]);
  assert.deepEqual(batches[2], [
    ['HSET', key, 'p:14:30', 's'],
    ['EXPIREAT', key, dayExpiryUnix(TODAY)],
    ['HGETALL', key],
  ]);
  assert.equal(batches.length, 3);
  // 's' 가 아닌 값은 모두 보내는 중으로 읽는다
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'), 'x');
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).claimed, ['14:30']);
  // 여러 필드를 HDEL 한 번에 지운다
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm1');
  await clearDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'), DAY_FIELD.armed('14:30'));
  assert.deepEqual(batches.at(-1), [['HDEL', key, 'p:14:30', 'a:14:30']]);
  const cleared = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual([cleared.claimed, cleared.armed], [[], {}]);
});

test('setDayField·claimDayField 는 날짜 기록의 만료를 함께 건다', async () => {
  const ctx = testCtx();
  const commands = recordKv(ctx);
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.closed('14:30'));
  const key = ctx.keys.day(watchKey, TODAY);
  const expireats = commands.filter((c) => c[0] === 'EXPIREAT' && c[1] === key);
  assert.equal(expireats.length, 2);
  for (const c of expireats) assert.equal(c[2], dayExpiryUnix(TODAY));
});

test('자정 경계: 23:55 마감의 날짜 기록은 다음 날 00:05 에도 읽힌다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['23:55'] }]);
  ctx.clock.set('2026-11-20T15:05:00Z'); // 2026-11-21 00:05 KST
  assert.equal(kstToday(ctx.now()), '2026-11-21');
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).deadlines, ['23:55']);
  assert.equal(await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('23:55')), true);
  assert.deepEqual(await indexMembers(ctx, TODAY), [watchKey]);
  // 날짜 끝 + 1일(2026-11-22 00:00 KST)에 사라진다
  ctx.clock.set('2026-11-21T14:59:00Z');
  assert.ok(await readDay(ctx, watchKey, TODAY));
  ctx.clock.set('2026-11-21T15:00:00Z');
  assert.equal(await readDay(ctx, watchKey, TODAY), null);
  assert.deepEqual(await indexMembers(ctx, TODAY), []);
});

test('구독은 봉인되어 저장된다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  const commands = recordKv(ctx);
  const { subscription } = subscriptionFixture();
  const sub = { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ja' };
  await writeSub(ctx, watchKey, sub, '2026-11-25');
  const raw = JSON.stringify(commands);
  for (const secretValue of [subscription.endpoint, subscription.p256dh, subscription.auth, 'fcm.googleapis.com']) {
    assert.ok(!raw.includes(secretValue), '원문이 저장소로 나갔다');
  }
  const set = commands.find((c) => c[0] === 'SET');
  const stored = JSON.parse(set[2]);
  assert.deepEqual(Object.keys(stored).sort(), ['sealed', 'subId', 'v']);
  assert.equal(stored.v, 1);
  assert.equal(stored.subId, sub.subId);
  assert.deepEqual(await readSub(ctx, watchKey), sub);
  await deleteSub(ctx, watchKey);
  assert.equal(await readSub(ctx, watchKey), null);
});

test('봉인 키가 바뀌어 못 푸는 구독은 null 이다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  const { subscription } = subscriptionFixture();
  const sub = { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ko' };
  await writeSub(ctx, watchKey, sub, '2026-11-25');
  const oldKey = ctx.sealKeys[0];
  ctx.sealKeys = [randomBytes(32)];
  assert.equal(await readSub(ctx, watchKey), null);
  // 이전 키를 둘째로 두면 다시 열린다
  ctx.sealKeys = [randomBytes(32), oldKey];
  assert.deepEqual(await readSub(ctx, watchKey), sub);
});

test('ownerWatchKeys 는 사라진 지켜보기를 걸러 내고 집합에서도 뺀다', async () => {
  const ctx = testCtx();
  const ownerHash = ownerHashOf(IDS.accountKey, SECRET);
  const live = watchKeyOf('LIVEwatchIdFixture_0-a', SECRET);
  const gone = watchKeyOf('GONEwatchIdFixture_0-a', SECRET);
  await writeWatch(ctx, live, watchRecord({ expiresOn: '2026-11-30' }));
  await writeWatch(ctx, gone, watchRecord({ expiresOn: '2026-11-20' }));
  await addOwnerWatch(ctx, ownerHash, live);
  await addOwnerWatch(ctx, ownerHash, gone);
  assert.deepEqual((await ownerWatchKeys(ctx, ownerHash)).sort(), [gone, live].sort());

  ctx.clock.set('2026-11-28T00:00:00Z'); // gone 만 만료
  const commands = recordKv(ctx);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHash), [live]);
  assert.ok(commands.some((c) => c[0] === 'SREM' && c[1] === ctx.keys.owner(ownerHash) && c.includes(gone)));
  const [members] = await ctx.kv.exec([['SMEMBERS', ctx.keys.owner(ownerHash)]]);
  assert.deepEqual(members, [live]);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHashOf(IDS.otherAccountKey, SECRET)), []);
});

test('addOwnerWatch 의 소유 집합은 등록 뒤 60일에 사라진다', async () => {
  const ctx = testCtx();
  const ownerHash = ownerHashOf(IDS.accountKey, SECRET);
  const commands = recordKv(ctx);
  await addOwnerWatch(ctx, ownerHash, watchKeyOf(IDS.watchId, SECRET));
  const exp = commands.find((c) => c[0] === 'EXPIREAT');
  assert.equal(exp[1], ctx.keys.owner(ownerHash));
  assert.equal(exp[2], Math.floor(ctx.now() / 1000) + 60 * 86400);
});

test('dropIndexMember 는 그 날짜 색인에서 하나만 뺀다', async () => {
  const ctx = testCtx();
  const a = watchKeyOf('AAAAwatchIdFixture_0-a', SECRET);
  const b = watchKeyOf('BBBBwatchIdFixture_0-a', SECRET);
  await replaceDays(ctx, a, [{ date: TODAY, deadlines: ['14:30'] }]);
  await replaceDays(ctx, b, [{ date: TODAY, deadlines: ['15:30'] }]);
  assert.deepEqual((await indexMembers(ctx, TODAY)).sort(), [a, b].sort());
  await dropIndexMember(ctx, TODAY, a);
  assert.deepEqual(await indexMembers(ctx, TODAY), [b]);
});

test('deleteWatchData 는 지켜보기·구독·날짜 기록·색인·소유 집합을 지우고 예약 메시지 id 를 돌려준다', async () => {
  const ctx = testCtx();
  const { watchKey, record } = await seedWatch(ctx, { expiresOn: '2026-11-23' });
  const ownerHash = record.ownerHash;
  const otherKey = watchKeyOf('OTHERwatchIdFixture-ab', SECRET);
  await writeWatch(ctx, otherKey, watchRecord());
  await addOwnerWatch(ctx, ownerHash, watchKey);
  await addOwnerWatch(ctx, ownerHash, otherKey);
  const { subscription } = subscriptionFixture();
  await writeSub(ctx, watchKey, { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'en' }, record.expiresOn);
  // 어제 날짜 기록은 어제 시계로 넣는다
  ctx.clock.set('2026-11-19T03:00:00Z');
  await replaceDays(ctx, watchKey, [{ date: '2026-11-19', deadlines: ['23:55'] }]);
  await setDayField(ctx, watchKey, '2026-11-19', DAY_FIELD.armed('23:55'), 'm0');
  ctx.clock.set('2026-11-20T03:00:00Z');
  await replaceDays(ctx, watchKey, [
    { date: TODAY, deadlines: ['14:30', '18:00'] },
    { date: '2026-11-23', deadlines: ['20:00'] },
  ]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('18:00'), 'm2');
  await setDayField(ctx, watchKey, '2026-11-23', DAY_FIELD.armed('20:00'), 'm3');
  // 다른 지켜보기의 날짜 기록은 남아야 한다
  await replaceDays(ctx, otherKey, [{ date: TODAY, deadlines: ['10:00'] }]);

  const out = await deleteWatchData(ctx, watchKey, record);
  assert.deepEqual(out.messageIds.sort(), ['m0', 'm1', 'm2', 'm3']);
  assert.equal(await readWatch(ctx, watchKey), null);
  assert.equal(await readSub(ctx, watchKey), null);
  for (const date of ['2026-11-19', TODAY, '2026-11-21', '2026-11-23']) {
    assert.equal(await readDay(ctx, watchKey, date), null);
    assert.ok(!(await indexMembers(ctx, date)).includes(watchKey));
  }
  assert.deepEqual(await indexMembers(ctx, TODAY), [otherKey]);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHash), [otherKey]);
  assert.ok(await readDay(ctx, otherKey, TODAY));
});

// ---- 검토 반영 ----

/** 지금까지 쓴 모든 키를 명령에서 모아 형별로 돌려준다. 메모리 저장소 안을 직접 들여다보는 대신 쓴다 */
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

test('deleteWatchData 는 출국일을 줄이기 전에 올린 뒤쪽 날짜 기록도 지운다', async () => {
  const ctx = testCtx();
  const commands = recordKv(ctx);
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  await writeWatch(ctx, watchKey, watchRecord({ expiresOn: '2026-11-30' }));
  await addOwnerWatch(ctx, watchRecord().ownerHash, watchKey);
  const { subscription } = subscriptionFixture();
  await writeSub(ctx, watchKey, { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ko' }, '2026-11-30');
  await replaceDays(ctx, watchKey, [
    { date: TODAY, deadlines: ['14:30'] },
    { date: '2026-11-28', deadlines: ['20:00'] },
  ]);
  await setDayField(ctx, watchKey, '2026-11-28', DAY_FIELD.armed('20:00'), 'm28');
  // 출국일을 11-22 로 줄인다. 11-28 기록은 그대로 남아 있다
  const shortened = watchRecord({ expiresOn: '2026-11-22' });
  await writeWatch(ctx, watchKey, shortened);
  await touchExpiry(ctx, watchKey, '2026-11-22');
  assert.ok(await readDay(ctx, watchKey, '2026-11-28'));
  assert.ok((await leftovers(ctx, commands, watchKey)).length > 0);

  const out = await deleteWatchData(ctx, watchKey, shortened);
  assert.deepEqual(out.messageIds, ['m28']);
  assert.deepEqual(await leftovers(ctx, commands, watchKey), []);
});

test('writeWatch 는 소유 집합에 넣고 그 만료를 늦춰, 연장한 지켜보기보다 먼저 사라지지 않는다', async () => {
  const ctx = testCtx();
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  const ownerHash = watchRecord().ownerHash;
  const expiresOn = capExpiresOn('2027-12-31', TODAY);
  assert.equal(expiresOn, '2027-01-05');
  assert.equal(await writeWatch(ctx, watchKey, watchRecord({ expiresOn }), { onlyIfAbsent: true }), true);
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHash), [watchKey]);

  ctx.clock.set('2026-12-20T03:00:00Z');
  assert.equal(await writeWatch(ctx, watchKey, watchRecord({ expiresOn: '2027-01-20' })), true);

  // 처음 등록 + 60일(2027-01-19)을 지나도 소유 집합이 남아 있다
  ctx.clock.set('2027-01-20T03:00:00Z');
  assert.ok(await readWatch(ctx, watchKey));
  assert.deepEqual(await ownerWatchKeys(ctx, ownerHash), [watchKey]);
});

// 검토 E2 반영으로 바뀌었다: 소유 집합에 먼저 넣고 만든다. 만들지 못하면(남의 지켜보기) 넣었던 항목을 다시 뺀다
test('writeWatch onlyIfAbsent 는 소유 집합에 먼저 넣고, 남의 지켜보기라 실패하면 그 항목을 다시 뺀다', async () => {
  const ctx = testCtx();
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  await writeWatch(ctx, watchKey, watchRecord());
  const otherOwner = ownerHashOf(IDS.otherAccountKey, SECRET);
  const commands = recordKv(ctx);
  assert.equal(await writeWatch(ctx, watchKey, watchRecord({ ownerHash: otherOwner }), { onlyIfAbsent: true }), false);
  assert.deepEqual(
    commands.map((c) => c[0]),
    ['SADD', 'EXPIREAT', 'SET', 'GET', 'SREM'],
  );
  assert.deepEqual(await ownerWatchKeys(ctx, otherOwner), []);
  // 원래 소유자의 집합은 그대로다
  assert.deepEqual(await ownerWatchKeys(ctx, watchRecord().ownerHash), [watchKey]);

  // 같은 소유자의 것이면(동시에 만든 경우) 빼지 않는다
  const same = testCtx();
  await writeWatch(same, watchKey, watchRecord(), { onlyIfAbsent: true });
  assert.equal(await writeWatch(same, watchKey, watchRecord(), { onlyIfAbsent: true }), false);
  assert.deepEqual(await ownerWatchKeys(same, watchRecord().ownerHash), [watchKey]);
});

test('writeWatch 는 덮어쓸 때 같은 exec 에서 구독 키의 만료도 새 출국일에 맞춘다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx, { expiresOn: '2026-11-21' });
  const { subscription } = subscriptionFixture();
  await writeSub(ctx, watchKey, { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ko' }, '2026-11-21');
  const commands = recordKv(ctx);
  await writeWatch(ctx, watchKey, watchRecord({ expiresOn: '2026-11-30' }));
  assert.equal(commands.length, 4, 'exec 한 번에 지켜보기·구독 만료·소유 집합을 쓴다');
  assert.deepEqual(commands[1], ['EXPIREAT', ctx.keys.sub(watchKey), watchExpiryUnix('2026-11-30')]);
  ctx.clock.set('2026-11-29T00:00:00Z');
  assert.ok(await readSub(ctx, watchKey));
  // 구독이 없으면 EXPIREAT 는 아무것도 만들지 않는다
  const bare = testCtx();
  await seedWatch(bare);
  assert.equal(await readSub(bare, watchKey), null);
  const [exists] = await bare.kv.exec([['EXISTS', bare.keys.sub(watchKey)]]);
  assert.equal(exists, 0);
});

test('writeSub 는 같은 exec 에서 지켜보기를 다시 읽어 돌려주고, 출국일이 다르면 구독 만료를 지켜보기에 맞춘다', async () => {
  const ctx = testCtx();
  const sub = { subId: 'SUBidFixture_0123456-a', ...subscriptionFixture().subscription, lang: 'ko' };
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  // 지켜보기가 없으면 null 이고 구독은 지우지 않는다(지울지는 부르는 쪽이 정한다)
  assert.equal(await writeSub(ctx, watchKey, sub, '2026-11-25'), null);
  assert.ok(await readSub(ctx, watchKey));
  // 앞에서 읽은 출국일(11-21)보다 지켜보기가 늘어나 있다(11-30)
  const { record } = await seedWatch(ctx, { expiresOn: '2026-11-30' });
  const commands = recordKv(ctx);
  assert.deepEqual(await writeSub(ctx, watchKey, sub, '2026-11-21'), record);
  assert.deepEqual(commands.slice(0, 2).map((c) => c[0]), ['SET', 'GET']);
  assert.deepEqual(commands[2], ['EXPIREAT', ctx.keys.sub(watchKey), watchExpiryUnix('2026-11-30')]);
  ctx.clock.set('2026-11-30T03:00:00Z');
  assert.ok(await readSub(ctx, watchKey));
});

test('clearArmedAndReadSubExists·clearArmedAndReadDay 는 걸림(과 권리)을 지우는 exec 에서 구독·날짜 기록을 다시 읽는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'), '1');
  const commands = recordKv(ctx);
  assert.equal(await clearArmedAndReadSubExists(ctx, watchKey, TODAY, '14:30'), false);
  assert.deepEqual(commands, [
    ['HDEL', ctx.keys.day(watchKey, TODAY), 'a:14:30'],
    ['EXISTS', ctx.keys.sub(watchKey)],
  ]);
  // 권리는 alsoPushed 일 때만 지운다
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).claimed, ['14:30']);
  await writeSub(ctx, watchKey, { subId: 'SUBidFixture_0123456-a', ...subscriptionFixture().subscription, lang: 'ko' }, '2026-11-25');
  assert.equal(await clearArmedAndReadSubExists(ctx, watchKey, TODAY, '14:30', { alsoPushed: true }), true);
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).claimed, []);

  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm2');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
  const before = commands.length;
  const day = await clearArmedAndReadDay(ctx, watchKey, TODAY, '14:30');
  assert.deepEqual(commands.slice(before), [
    ['HDEL', ctx.keys.day(watchKey, TODAY), 'a:14:30'],
    ['HGETALL', ctx.keys.day(watchKey, TODAY)],
  ]);
  assert.deepEqual([day.deadlines, day.armed, day.muted], [['14:30'], {}, true]);
  // 기록이 통째로 없으면 null
  assert.equal(await clearArmedAndReadDay(ctx, watchKey, '2026-11-22', '14:30', { alsoPushed: true }), null);
});

test('replaceDays: 빈 목록으로 날짜를 지워도 함께 있음 표시는 남는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30'] }]);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
  assert.deepEqual(await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: [] }]), {
    removedMessageIds: [],
    changed: 1,
  });
  assert.deepEqual(await readDay(ctx, watchKey, TODAY), {
    deadlines: [],
    confirmed: [],
    armed: {},
    pushed: [],
    claimed: [],
    closed: [],
    muted: true,
  });
  assert.deepEqual(await indexMembers(ctx, TODAY), []);
  // 남긴 표시에도 날짜 만료가 걸려 있다
  ctx.clock.set('2026-11-21T15:00:00Z');
  assert.equal(await readDay(ctx, watchKey, TODAY), null);
});

test('replaceDays: 마감 없이 함께 있음만 있던 날짜에 빈 목록은 changed 로 세지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seedWatch(ctx);
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
  assert.deepEqual(await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: [] }]), {
    removedMessageIds: [],
    changed: 0,
  });
  assert.equal((await readDay(ctx, watchKey, TODAY)).muted, true);
});

test('형식이 망가진 지켜보기 레코드는 없는 것으로 본다', async () => {
  const ctx = testCtx();
  const watchKey = watchKeyOf(IDS.watchId, SECRET);
  const key = ctx.keys.watch(watchKey);
  const good = watchRecord();
  const broken = [
    { ...good, expiresOn: '2026-02-30' },
    { ...good, expiresOn: '2026-11-25T00:00' },
    { ...good, ownerHash: 'short' },
    { ...good, writeHash: `${good.writeHash.slice(1)}=` },
    { ...good, registrations: -1 },
    { ...good, registrations: '1' },
  ];
  for (const value of broken) {
    await ctx.kv.exec([['SET', key, JSON.stringify(value)]]);
    assert.equal(await readWatch(ctx, watchKey), null, JSON.stringify(value));
    assert.equal(await findWritableWatch(ctx, IDS.watchId, IDS.writeToken), null);
  }
  for (const raw of ['not json', 'null', '[]', '42']) {
    await ctx.kv.exec([['SET', key, raw]]);
    assert.equal(await readWatch(ctx, watchKey), null, raw);
  }
});

test('다른 지켜보기의 키 아래로 옮긴 봉인 구독은 열리지 않는다', async () => {
  const ctx = testCtx();
  const a = watchKeyOf('AAAAwatchIdFixture_0-a', SECRET);
  const b = watchKeyOf('BBBBwatchIdFixture_0-a', SECRET);
  const { subscription } = subscriptionFixture();
  const sub = { subId: 'SUBidFixture_0123456-a', ...subscription, lang: 'ko' };
  await writeSub(ctx, a, sub, '2026-11-25');
  assert.deepEqual(await readSub(ctx, a), sub);
  const [raw] = await ctx.kv.exec([['GET', ctx.keys.sub(a)]]);
  await ctx.kv.exec([['SET', ctx.keys.sub(b), raw]]);
  assert.equal(await readSub(ctx, b), null);
});
