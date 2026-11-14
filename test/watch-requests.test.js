// 서버 알림 요청 본문 허용 목록과 기록 한 줄 (lib/server/watch/requests.js, lib/server/watch/log.js)
//
// 이 파일이 고정하는 것
//   - 경로마다 정해진 필드만 새 객체에 담고, 허용 목록 밖 필드는 조용히 버린다
//   - 형식이 틀리면 입력 경로(field)만 알리고 값은 담지 않는다
//   - '__proto__'·'constructor' 키가 결과와 Object 원형을 건드리지 못한다
//   - 본문은 16KB 까지, JSON 객체만 받는다
//   - 기록은 정해진 필드와 닫힌 목록의 값만 남긴다
//
// 외부 호출은 없다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';

import {
  MAX_BODY_BYTES,
  normalizeBack,
  normalizeDeadlines,
  normalizeDue,
  normalizeMute,
  normalizeRegister,
  normalizeRemove,
  normalizeStatus,
  normalizeSubscribe,
  normalizeUnsubscribe,
  readJsonBody,
} from '../lib/server/watch/requests.js';
import { WATCH_ROUTE, buildWatchLogEntry, logWatch } from '../lib/server/watch/log.js';
import { DUE_OUTCOME } from '../lib/server/watch/due.js';
import { addDays } from '../src/stay/time.js';
import { IDS } from './watch-fixtures.js';

const SUB_ID = 'SUBidFixture_0123456-a';
const WATCH_KEY = 'K'.repeat(43);

const REGISTER = Object.freeze({ watchId: IDS.watchId, writeToken: IDS.writeToken, expiresOn: '2026-11-25' });

function deadlinesBody(days, extra = {}) {
  return { watchId: IDS.watchId, writeToken: IDS.writeToken, expiresOn: '2026-11-25', days, ...extra };
}

function subscribeBody({ p256dh, auth, endpoint = 'https://fcm.googleapis.com/fcm/send/fixture', lang = 'ko' } = {}) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    watchId: IDS.watchId,
    subscription: {
      endpoint,
      keys: {
        p256dh: p256dh ?? ecdh.getPublicKey().toString('base64url'),
        auth: auth ?? randomBytes(16).toString('base64url'),
      },
    },
    lang,
  };
}

function request(body, headers = {}) {
  return new Request('http://localhost/api/watch', { method: 'POST', headers, body });
}

describe('본문 허용 목록', () => {
  test('허용 목록 밖 필드는 버린다', () => {
    const result = normalizeRegister({ ...REGISTER, lat: 37.5, hospital: 'x' });
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value).sort(), ['expiresOn', 'watchId', 'writeToken']);

    const deadlines = normalizeDeadlines(
      deadlinesBody([{ date: '2026-11-20', deadlines: ['14:30'], place: '숙소', lat: 37.5 }], { lng: 127 }),
    );
    assert.equal(deadlines.ok, true);
    assert.deepEqual(Object.keys(deadlines.value).sort(), ['days', 'expiresOn', 'watchId', 'writeToken']);
    assert.deepEqual(deadlines.value.days, [{ date: '2026-11-20', deadlines: ['14:30'] }]);

    const subscribe = normalizeSubscribe({ ...subscribeBody(), name: '보호자', phone: '010' });
    assert.equal(subscribe.ok, true);
    assert.deepEqual(Object.keys(subscribe.value).sort(), ['lang', 'subscription', 'watchId']);
    assert.deepEqual(Object.keys(subscribe.value.subscription).sort(), ['auth', 'endpoint', 'p256dh']);

    const back = normalizeBack({ ...REGISTER, date: '2026-11-20', by: '14:30', place: 'x' });
    assert.deepEqual(Object.keys(back.value).sort(), ['by', 'date', 'undo', 'watchId', 'writeToken']);
    assert.equal(back.value.undo, false);
  });

  test('결과는 받은 객체를 그대로 넘기지 않는다', () => {
    const days = [{ date: '2026-11-20', deadlines: ['14:30'] }];
    const body = deadlinesBody(days);
    const result = normalizeDeadlines(body);
    assert.notEqual(result.value.days, days);
    assert.notEqual(result.value.days[0], days[0]);
    assert.notEqual(result.value.days[0].deadlines, days[0].deadlines);
  });

  test('형식이 틀리면 field 를 알려 준다', () => {
    assert.deepEqual(normalizeRegister({ ...REGISTER, watchId: IDS.watchId.slice(1) }), { ok: false, field: 'watchId' });
    assert.deepEqual(normalizeRegister({ ...REGISTER, expiresOn: '2026-13-01' }), { ok: false, field: 'expiresOn' });
    assert.deepEqual(normalizeRegister({ ...REGISTER, writeToken: 'short' }), { ok: false, field: 'writeToken' });
    assert.deepEqual(normalizeBack({ ...REGISTER, date: '2026-11-20', by: '25:00' }), { ok: false, field: 'by' });
    assert.deepEqual(normalizeBack({ ...REGISTER, date: '2026-11-20', by: '14:30', undo: 'yes' }), { ok: false, field: 'undo' });
    assert.deepEqual(normalizeUnsubscribe({ watchId: IDS.watchId, subId: 'x' }), { ok: false, field: 'subId' });
    assert.deepEqual(normalizeMute({ watchId: IDS.watchId, subId: SUB_ID, on: 'true' }), { ok: false, field: 'on' });
    assert.deepEqual(normalizeStatus({ watchId: IDS.watchId, subId: 12 }), { ok: false, field: 'subId' });
    assert.deepEqual(normalizeDue({ k: WATCH_KEY, d: '2026-11-20', t: '1430' }), { ok: false, field: 't' });
    assert.deepEqual(normalizeSubscribe(subscribeBody({ lang: 'fr' })), { ok: false, field: 'lang' });
    // 오류 결과에는 입력값이 없다
    const failed = normalizeRegister({ ...REGISTER, expiresOn: 'leak-2026' });
    assert.equal(JSON.stringify(failed).includes('leak'), false);
  });

  test('경로마다 정해진 결과 모양', () => {
    assert.deepEqual(normalizeStatus({ watchId: IDS.watchId }), { ok: true, value: { watchId: IDS.watchId, subId: null } });
    assert.deepEqual(normalizeStatus({ watchId: IDS.watchId, subId: SUB_ID }).value, { watchId: IDS.watchId, subId: SUB_ID });
    assert.deepEqual(normalizeMute({ watchId: IDS.watchId, subId: SUB_ID, on: true }).value, {
      watchId: IDS.watchId,
      subId: SUB_ID,
      on: true,
    });
    assert.deepEqual(normalizeUnsubscribe({ watchId: IDS.watchId, subId: SUB_ID }).value, { watchId: IDS.watchId, subId: SUB_ID });
    assert.deepEqual(normalizeDue({ k: WATCH_KEY, d: '2026-11-20', t: '14:30', extra: 1 }).value, {
      watchKey: WATCH_KEY,
      date: '2026-11-20',
      time: '14:30',
    });
    assert.deepEqual(normalizeBack({ ...REGISTER, date: '2026-11-20', by: '14:30', undo: true }).value.undo, true);
  });

  test('삭제: { all: true } 는 다른 필드를 읽지 않고, 아니면 watchId·writeToken 이 필요하다', () => {
    assert.deepEqual(normalizeRemove({ all: true, watchId: 'x' }), { ok: true, value: { all: true } });
    assert.deepEqual(normalizeRemove({ watchId: IDS.watchId, writeToken: IDS.writeToken, lat: 1 }), {
      ok: true,
      value: { all: false, watchId: IDS.watchId, writeToken: IDS.writeToken },
    });
    assert.deepEqual(normalizeRemove({ all: 'true' }), { ok: false, field: 'all' });
    assert.deepEqual(normalizeRemove({}), { ok: false, field: 'watchId' });
  });

  test('days: 47개, 겹친 날짜, 날짜당 11개, "25:00" 은 거절한다', () => {
    const many = Array.from({ length: 47 }, (_, i) => ({ date: addDays('2026-11-20', i), deadlines: [] }));
    assert.deepEqual(normalizeDeadlines(deadlinesBody(many)), { ok: false, field: 'days' });
    const overlapping = [
      { date: '2026-11-20', deadlines: ['14:30'] },
      { date: '2026-11-20', deadlines: ['18:00'] },
    ];
    assert.deepEqual(normalizeDeadlines(deadlinesBody(overlapping)), { ok: false, field: 'days[1].date' });
    const eleven = Array.from({ length: 11 }, (_, i) => `1${i % 10}:00`);
    assert.deepEqual(normalizeDeadlines(deadlinesBody([{ date: '2026-11-20', deadlines: eleven }])), {
      ok: false,
      field: 'days[0].deadlines',
    });
    assert.deepEqual(normalizeDeadlines(deadlinesBody([{ date: '2026-11-20', deadlines: ['25:00'] }])), {
      ok: false,
      field: 'days[0].deadlines',
    });
    assert.deepEqual(normalizeDeadlines(deadlinesBody('2026-11-20')), { ok: false, field: 'days' });
    assert.deepEqual(normalizeDeadlines(deadlinesBody(['2026-11-20'])), { ok: false, field: 'days[0]' });
    assert.deepEqual(normalizeDeadlines(deadlinesBody([{ date: '2026-02-30', deadlines: [] }])), {
      ok: false,
      field: 'days[0].date',
    });
    // 46개와 날짜당 10개는 받는다
    assert.equal(normalizeDeadlines(deadlinesBody(many.slice(0, 46))).ok, true);
    const ten = Array.from({ length: 10 }, (_, i) => `1${i}:00`);
    assert.equal(normalizeDeadlines(deadlinesBody([{ date: '2026-11-20', deadlines: ten }])).ok, true);
  });

  test('days: 시각 중복을 없애고 정렬한다', () => {
    const result = normalizeDeadlines(deadlinesBody([{ date: '2026-11-20', deadlines: ['18:00', '14:30', '18:00'] }]));
    assert.deepEqual(result.value.days, [{ date: '2026-11-20', deadlines: ['14:30', '18:00'] }]);
  });

  test('days: __proto__·constructor 키가 결과를 오염시키지 않는다', () => {
    const json =
      `{"watchId":"${IDS.watchId}","writeToken":"${IDS.writeToken}","expiresOn":"2026-11-25",` +
      '"days":[{"date":"2026-11-20","deadlines":[],"__proto__":{"x":1},"constructor":{"prototype":{"y":2}}}],' +
      '"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}}}';
    const result = normalizeDeadlines(JSON.parse(json));
    assert.equal(result.ok, true);
    assert.equal(result.value.polluted, undefined);
    assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
    assert.deepEqual(Object.keys(result.value).sort(), ['days', 'expiresOn', 'watchId', 'writeToken']);
    assert.deepEqual(result.value.days, [{ date: '2026-11-20', deadlines: [] }]);
    assert.equal(result.value.days[0].x, undefined);
    assert.equal(Object.getPrototypeOf(result.value.days[0]), Object.prototype);
    assert.equal(({}).polluted, undefined);
    assert.equal(({}).polluted2, undefined);
    assert.equal(({}).x, undefined);

    // 원형에서 오는 값은 필드로 읽지 않는다
    const inherited = Object.create({ watchId: IDS.watchId, writeToken: IDS.writeToken, expiresOn: '2026-11-25' });
    assert.deepEqual(normalizeRegister(inherited), { ok: false, field: 'watchId' });
  });

  test('구독 키: p256dh 65바이트·auth 16바이트만 받는다', () => {
    const ok = normalizeSubscribe(subscribeBody());
    assert.equal(ok.ok, true);
    assert.equal(Buffer.from(ok.value.subscription.p256dh, 'base64url').length, 65);
    assert.equal(Buffer.from(ok.value.subscription.auth, 'base64url').length, 16);

    const compressed = Buffer.concat([Buffer.from([0x02]), randomBytes(32)]).toString('base64url');
    const notUncompressed = Buffer.concat([Buffer.from([0x05]), randomBytes(64)]).toString('base64url');
    const short = Buffer.concat([Buffer.from([0x04]), randomBytes(63)]).toString('base64url');
    for (const p256dh of [compressed, notUncompressed, short, 'not base64!', '']) {
      assert.deepEqual(normalizeSubscribe(subscribeBody({ p256dh })), { ok: false, field: 'subscription.keys.p256dh' });
    }
    for (const auth of [randomBytes(15).toString('base64url'), randomBytes(17).toString('base64url'), '@@@@']) {
      assert.deepEqual(normalizeSubscribe(subscribeBody({ auth })), { ok: false, field: 'subscription.keys.auth' });
    }
    // 채움(=)이 붙은 값은 채움 없이 다시 적는다
    const padded = randomBytes(16).toString('base64');
    const paddedOk = normalizeSubscribe(subscribeBody({ auth: padded.replace(/\+/g, '-').replace(/\//g, '_') }));
    assert.equal(paddedOk.ok, true);
    assert.equal(paddedOk.value.subscription.auth.includes('='), false);
    // endpoint 는 문자열 2048자까지(호스트 검사는 서비스가 한다)
    assert.equal(normalizeSubscribe(subscribeBody({ endpoint: `https://fcm.googleapis.com/${'a'.repeat(2020)}` })).ok, true);
    assert.deepEqual(normalizeSubscribe(subscribeBody({ endpoint: `https://fcm.googleapis.com/${'a'.repeat(2030)}` })), {
      ok: false,
      field: 'subscription.endpoint',
    });
    assert.deepEqual(normalizeSubscribe({ ...subscribeBody(), subscription: { endpoint: 'https://x' } }), {
      ok: false,
      field: 'subscription.keys',
    });
  });

  test('readJsonBody: 16KB 를 넘거나 JSON 이 아니거나 배열이면 실패다', async () => {
    const fits = JSON.stringify({ pad: 'a'.repeat(MAX_BODY_BYTES - 10) });
    assert.equal(Buffer.byteLength(fits), MAX_BODY_BYTES);
    const read = await readJsonBody(request(fits));
    assert.equal(read.ok, true);
    assert.equal(read.raw, fits);

    assert.deepEqual(await readJsonBody(request(JSON.stringify({ pad: 'a'.repeat(MAX_BODY_BYTES) }))), { ok: false });
    // 글자 수가 아니라 UTF-8 바이트로 잰다(한글 한 글자 3바이트)
    assert.deepEqual(await readJsonBody(request(JSON.stringify({ pad: '가'.repeat(6000) }))), { ok: false });
    // 길이를 크게 알리면 읽기 전에 거른다
    assert.deepEqual(await readJsonBody(request('{}', { 'content-length': String(MAX_BODY_BYTES + 1) })), { ok: false });
    assert.deepEqual(await readJsonBody(request('{not json')), { ok: false });
    assert.deepEqual(await readJsonBody(request('[1,2]')), { ok: false });
    assert.deepEqual(await readJsonBody(request('"text"')), { ok: false });
    assert.deepEqual(await readJsonBody(request('null')), { ok: false });
    assert.deepEqual(await readJsonBody(request('')), { ok: false });
  });
});

describe('기록 한 줄', () => {
  test('기록: 정해진 필드만 나가고 닫힌 목록 밖 값은 버린다', () => {
    const entry = buildWatchLogEntry({
      route: 'watch.back',
      outcome: 'OK',
      watchId: 'x',
      date: '2026-11-20',
      counts: { armed: 2, endpoint: 'h' },
    });
    assert.deepEqual(Object.keys(entry).sort(), ['counts', 'evt', 'outcome', 'route']);
    assert.deepEqual(entry, { evt: 'watch', route: 'watch.back', outcome: 'OK', counts: { armed: 2 } });

    const full = buildWatchLogEntry({
      route: WATCH_ROUTE.DUE,
      outcome: DUE_OUTCOME.SENT,
      errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE',
      elapsedMs: 12.6,
      counts: { watches: 3, armed: 1, failed: 0, deleted: 2, push: '2xx' },
    });
    assert.deepEqual(full, {
      evt: 'watch',
      route: 'watch.due',
      outcome: 'SENT',
      errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE',
      ms: 13,
      counts: { watches: 3, armed: 1, failed: 0, deleted: 2, push: '2xx' },
    });

    // 형식이 틀린 값은 버린다
    const dirty = buildWatchLogEntry({
      route: WATCH_ROUTE.CRON,
      outcome: 'OK',
      errorCode: 'Upstash token abc',
      elapsedMs: -1,
      counts: { armed: -1, failed: 1.5, deleted: '2', watches: Number.NaN, push: 'https://fcm.googleapis.com' },
    });
    assert.deepEqual(dirty, { evt: 'watch', route: 'watch.cron', outcome: 'OK' });
    assert.deepEqual(buildWatchLogEntry({ route: 'watch.due', outcome: 'OK', counts: ['armed'] }), {
      evt: 'watch',
      route: 'watch.due',
      outcome: 'OK',
    });
  });

  test('기록: 모르는 route·outcome 은 정해진 값으로 바뀐다', () => {
    assert.deepEqual(buildWatchLogEntry({ route: '/api/watch?id=x', outcome: 'sent to fcm' }), {
      evt: 'watch',
      route: 'watch.unknown',
      outcome: 'FAILED',
    });
    assert.deepEqual(buildWatchLogEntry(), { evt: 'watch', route: 'watch.unknown', outcome: 'FAILED' });
    // 판정표의 값과 처리기의 값은 그대로 남는다
    for (const outcome of [...Object.values(DUE_OUTCOME), 'OK', 'REJECTED', 'NOT_FOUND', 'LIMITED', 'OFF', 'FAILED']) {
      assert.equal(buildWatchLogEntry({ route: 'watch.due', outcome }).outcome, outcome);
    }
    assert.deepEqual(Object.values(WATCH_ROUTE).sort(), [
      'push.config',
      'watch.back',
      'watch.cron',
      'watch.deadlines',
      'watch.due',
      'watch.mute',
      'watch.register',
      'watch.remove',
      'watch.status',
      'watch.subscribe',
      'watch.unsubscribe',
    ]);
  });

  test('logWatch 는 한 줄을 쓰고, 쓰기가 실패해도 던지지 않는다', (t) => {
    const lines = [];
    t.mock.method(process.stdout, 'write', (chunk) => {
      lines.push(String(chunk));
      return true;
    });
    logWatch({ route: 'watch.status', outcome: 'OK', watchId: IDS.watchId });
    assert.equal(lines.length, 1);
    assert.ok(lines[0].endsWith('\n'));
    assert.deepEqual(JSON.parse(lines[0]), { evt: 'watch', route: 'watch.status', outcome: 'OK' });
    process.stdout.write.mock.mockImplementation(() => {
      throw new Error('closed');
    });
    assert.doesNotThrow(() => logWatch({ route: 'watch.status', outcome: 'OK' }));
  });
});
