// 서버 알림 키 유도, 구독 봉인, 횟수 제한 (lib/server/watch/keys.js · seal.js · limits.js)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  WATCH_ID_RE,
  WRITE_TOKEN_RE,
  SUB_ID_RE,
  WATCH_KEY_RE,
  watchKeyOf,
  ownerHashOf,
  writeHashOf,
  tokenMatches,
  idMatches,
  rateKeyOf,
  dedupIdOf,
  topicOf,
  newSubId,
  redisKeys,
} from '../lib/server/watch/keys.js';
import { sealJson, openJson } from '../lib/server/watch/seal.js';
import { WATCH_LIMITS, hitRate } from '../lib/server/watch/limits.js';
import { IDS, SECRET, SEAL_KEY, testCtx } from './watch-fixtures.js';

const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;

test('형식 정규식: 고정 값은 맞고 길이·문자가 틀리면 아니다', () => {
  assert.ok(WATCH_ID_RE.test(IDS.watchId));
  assert.ok(WRITE_TOKEN_RE.test(IDS.writeToken));
  assert.ok(SUB_ID_RE.test(newSubId()));
  assert.ok(WATCH_KEY_RE.test(watchKeyOf(IDS.watchId, SECRET)));
  assert.ok(!WATCH_ID_RE.test(`${IDS.watchId}a`));
  assert.ok(!WATCH_ID_RE.test(IDS.watchId.slice(1)));
  assert.ok(!WATCH_ID_RE.test(`${IDS.watchId.slice(1)}=`));
  assert.ok(!WRITE_TOKEN_RE.test(`${IDS.writeToken.slice(1)}/`));
  assert.ok(!WATCH_ID_RE.test(`${IDS.watchId}\n`));
});

test('같은 입력은 같은 키, 문맥이 다르면 다른 값이다', () => {
  const x = IDS.writeToken;
  assert.equal(watchKeyOf(x, SECRET), watchKeyOf(x, SECRET));
  assert.notEqual(watchKeyOf(x, SECRET), ownerHashOf(x, SECRET));
  assert.notEqual(watchKeyOf(x, SECRET), rateKeyOf({ bucket: x, subject: '' }, SECRET));
  for (const v of [watchKeyOf(x, SECRET), ownerHashOf(x, SECRET), writeHashOf(x)]) {
    assert.match(v, B64URL_43);
    assert.ok(!v.includes(x));
  }
  const slot = { watchKey: watchKeyOf(IDS.watchId, SECRET), date: '2026-11-20', time: '14:30' };
  assert.match(dedupIdOf(slot, SECRET), B64URL_43);
  assert.notEqual(dedupIdOf(slot, SECRET), topicOf(slot, SECRET));
  assert.notEqual(dedupIdOf(slot, SECRET).slice(0, 32), topicOf(slot, SECRET));
  assert.notEqual(dedupIdOf(slot, SECRET), dedupIdOf({ ...slot, time: '14:31' }, SECRET));
});

test('비밀이 다르면 키도 다르다', () => {
  const other = `${SECRET}x`;
  assert.notEqual(watchKeyOf(IDS.watchId, SECRET), watchKeyOf(IDS.watchId, other));
  assert.notEqual(ownerHashOf(IDS.accountKey, SECRET), ownerHashOf(IDS.accountKey, other));
  assert.notEqual(rateKeyOf({ bucket: 'create', subject: 'a' }, SECRET), rateKeyOf({ bucket: 'create', subject: 'a' }, other));
  const slot = { watchKey: 'K', date: '2026-11-20', time: '14:30' };
  assert.notEqual(dedupIdOf(slot, SECRET), dedupIdOf(slot, other));
  assert.notEqual(topicOf(slot, SECRET), topicOf(slot, other));
});

test('값 경계가 섞이지 않는다', () => {
  assert.notEqual(rateKeyOf({ bucket: 'ab', subject: 'c' }, SECRET), rateKeyOf({ bucket: 'a', subject: 'bc' }, SECRET));
  assert.notEqual(
    dedupIdOf({ watchKey: 'ab', date: 'c', time: 'd' }, SECRET),
    dedupIdOf({ watchKey: 'a', date: 'bc', time: 'd' }, SECRET),
  );
  assert.notEqual(
    topicOf({ watchKey: 'a', date: 'bc', time: 'd' }, SECRET),
    topicOf({ watchKey: 'a', date: 'b', time: 'cd' }, SECRET),
  );
});

test('topicOf 는 32자 base64url 이다', () => {
  const t = topicOf({ watchKey: watchKeyOf(IDS.watchId, SECRET), date: '2026-11-20', time: '14:30' }, SECRET);
  assert.match(t, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!t.includes('2026') && !t.includes('14:30'));
});

test('newSubId 는 22자 base64url 이고 매번 다르다', () => {
  const a = newSubId();
  const b = newSubId();
  assert.match(a, SUB_ID_RE);
  assert.notEqual(a, b);
});

test('tokenMatches 는 맞는 토큰만 참이고 길이가 달라도 던지지 않는다', () => {
  const hash = writeHashOf(IDS.writeToken);
  assert.equal(tokenMatches(IDS.writeToken, hash), true);
  assert.equal(tokenMatches(`${IDS.writeToken.slice(0, -1)}A`, hash), false);
  assert.equal(tokenMatches('short', hash), false);
  assert.equal(tokenMatches(IDS.writeToken, 'short'), false);
  assert.equal(tokenMatches(IDS.writeToken, ''), false);
  assert.equal(tokenMatches(null, hash), false);
  assert.equal(tokenMatches(IDS.writeToken, undefined), false);
  assert.equal(tokenMatches(42, hash), false);
});

test('idMatches 는 같은 문자열만 참이고 길이가 다르거나 문자열이 아니면 거짓이다', () => {
  assert.equal(idMatches('abc', 'abc'), true);
  assert.equal(idMatches('abc', 'abd'), false);
  assert.equal(idMatches('abc', 'abcd'), false);
  assert.equal(idMatches('', ''), false);
  assert.equal(idMatches(null, 'abc'), false);
  assert.equal(idMatches('abc', 42), false);
  // 바이트 길이가 같아도 문자 수가 다른 경우를 던지지 않고 거짓으로 본다
  assert.equal(idMatches('é', 'ab'), false);
});

test('redisKeys 는 환경 이름을 접두사에 넣는다', () => {
  const k = redisKeys('prev');
  assert.equal(k.day('K', '2026-11-20'), 'sh:prev:d:K:2026-11-20');
  assert.equal(k.watch('K'), 'sh:prev:w:K');
  assert.equal(k.sub('K'), 'sh:prev:s:K');
  assert.equal(k.owner('O'), 'sh:prev:o:O');
  assert.equal(k.index('2026-11-20'), 'sh:prev:x:2026-11-20');
  assert.equal(k.rate('R', 12), 'sh:prev:r:R:12');
  assert.equal(redisKeys('prod').watch('K'), 'sh:prod:w:K');
  assert.equal(redisKeys('dev').watch('K'), 'sh:dev:w:K');
  assert.throws(() => redisKeys('staging'), TypeError);
});

test('봉인을 풀면 원래 값이고, 한 글자라도 바뀌면 null 이다', () => {
  const value = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'P', auth: 'A', lang: 'ko' };
  const sealed = sealJson(value, SEAL_KEY);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes('fcm.googleapis') && !sealed.includes('send'));
  assert.deepEqual(openJson(sealed, [SEAL_KEY]), value);
  // 같은 값도 봉인할 때마다 다르다(iv 가 무작위)
  assert.notEqual(sealJson(value, SEAL_KEY), sealed);
  const body = sealed.slice(3);
  // 마지막 글자는 버려지는 비트를 품을 수 있어 빼고, 바이트 단위 변경으로 iv·암호문·태그 끝까지 본다
  for (const i of [0, 5, Math.floor(body.length / 2), body.length - 2]) {
    const ch = body[i] === 'A' ? 'B' : 'A';
    const tampered = `v1.${body.slice(0, i)}${ch}${body.slice(i + 1)}`;
    assert.equal(openJson(tampered, [SEAL_KEY]), null);
  }
  const raw = Buffer.from(body, 'base64url');
  for (const i of [0, 11, 12, raw.length - 17, raw.length - 16, raw.length - 1]) {
    const copy = Buffer.from(raw);
    copy[i] ^= 0x01;
    assert.equal(openJson(`v1.${copy.toString('base64url')}`, [SEAL_KEY]), null);
  }
});

test('이전 키로 봉인한 값도 열린다', () => {
  const oldKey = randomBytes(32);
  const newKey = randomBytes(32);
  const sealed = sealJson({ a: 1 }, oldKey);
  assert.deepEqual(openJson(sealed, [newKey, oldKey]), { a: 1 });
  assert.equal(openJson(sealed, [newKey]), null);
});

test('키가 틀리거나 형식이 아니면 null 이고 던지지 않는다', () => {
  const sealed = sealJson({ a: 1 }, SEAL_KEY);
  for (const bad of ['', 'v1.', 'v2.abc', 42, null, undefined, {}, 'v1.!!!!', `v2.${sealed.slice(3)}`]) {
    assert.equal(openJson(bad, [SEAL_KEY]), null);
  }
  assert.equal(openJson(sealed, [randomBytes(32)]), null);
  assert.equal(openJson(sealed, []), null);
  assert.equal(openJson(sealed, null), null);
  assert.equal(openJson(sealed, [Buffer.alloc(31)]), null);
  // 객체가 아닌 JSON 은 열지 않는다
  assert.equal(openJson(sealJson('text', SEAL_KEY), [SEAL_KEY]), null);
  assert.equal(openJson(sealJson(null, SEAL_KEY), [SEAL_KEY]), null);
});

test('WATCH_LIMITS 는 계획의 값이고 고쳐지지 않는다', () => {
  assert.deepEqual(WATCH_LIMITS.create, { limit: 10, windowSec: 3600 });
  assert.deepEqual(WATCH_LIMITS.push, { limit: 20, windowSec: 86400 });
  assert.equal(WATCH_LIMITS.maxWatchesPerOwner, 3);
  assert.equal(WATCH_LIMITS.maxRegistrations, 5);
  assert.equal(WATCH_LIMITS.maxDays, 46);
  assert.equal(WATCH_LIMITS.maxDeadlinesPerDay, 10);
  assert.ok(Object.isFrozen(WATCH_LIMITS));
});

test('hitRate 는 한도까지 참, 그다음은 거짓이고 창이 바뀌면 다시 참이다', async () => {
  const ctx = testCtx();
  for (let i = 0; i < 10; i += 1) assert.equal(await hitRate(ctx, 'subscribe', 'subject-a'), true, `${i + 1}번째`);
  assert.equal(await hitRate(ctx, 'subscribe', 'subject-a'), false);
  // 다른 주체와 다른 항목은 따로 센다
  assert.equal(await hitRate(ctx, 'subscribe', 'subject-b'), true);
  assert.equal(await hitRate(ctx, 'mute', 'subject-a'), true);
  ctx.clock.advanceMin(61);
  assert.equal(await hitRate(ctx, 'subscribe', 'subject-a'), true);
});

test('hitRate 는 창이 없는 항목이면 던진다', async () => {
  const ctx = testCtx();
  await assert.rejects(hitRate(ctx, 'maxDays', 'x'), TypeError);
  await assert.rejects(hitRate(ctx, 'nope', 'x'), TypeError);
});

test('hitRate 키에 주체가 그대로 들어가지 않는다', async () => {
  const ctx = testCtx();
  const seen = [];
  const inner = ctx.kv;
  ctx.kv = {
    async exec(commands) {
      for (const cmd of commands) seen.push(cmd);
      return inner.exec(commands);
    },
  };
  const subject = IDS.accountKey;
  await hitRate(ctx, 'create', subject);
  assert.equal(seen.length, 2);
  const [incr, expire] = seen;
  assert.equal(incr[0], 'INCR');
  assert.equal(expire[0], 'EXPIRE');
  assert.equal(expire[2], 3600 + 60);
  const window = Math.floor(ctx.now() / (3600 * 1000));
  assert.equal(incr[1], ctx.keys.rate(rateKeyOf({ bucket: 'create', subject }, SECRET), window));
  for (const cmd of seen) assert.ok(!JSON.stringify(cmd).includes(subject));
});
