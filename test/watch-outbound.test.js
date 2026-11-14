// 서버 알림 보내는 쪽: 문구(text.js), 보호자 푸시(notify.js), 예약 걸기(arm.js), 예약 처리 판정표(due.js)
//
// 시계는 testCtx 기본값 2026-11-20 12:00 KST(03:00Z)에서 시작한다. 시각은 늘 ctx.clock 으로만 움직인다.
// 마감 14:30 KST 기준: 보낼 시각 14:40(05:40Z), 늦은 한도 15:30(06:30Z).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUSH_KIND, PUSH_TEXT_KEY, pushPayload } from '../lib/server/watch/text.js';
import { pushToGuardian, pushToSubscription } from '../lib/server/watch/notify.js';
import {
  EARLY_TOLERANCE_MS,
  armIndexedDates,
  armPending,
  cancelMessages,
  fireAtMs,
  lateLimitMs,
} from '../lib/server/watch/arm.js';
import { DUE_OUTCOME, processDue } from '../lib/server/watch/due.js';
import {
  DAY_FIELD,
  claimDayField,
  indexMembers,
  readDay,
  readSub,
  replaceDays,
  setDayField,
  writeSub,
  writeWatch,
} from '../lib/server/watch/records.js';
import { dedupIdOf, newSubId, ownerHashOf, topicOf, watchKeyOf, writeHashOf } from '../lib/server/watch/keys.js';
import { countRate, hitRate, peekRate } from '../lib/server/watch/limits.js';
import { KvError } from '../lib/server/watch/kv.js';
import { safety } from '../src/i18n/messages/notifications.js';
import { translate } from '../src/i18n/index.js';
import { NOTIFY_TITLE_KEY } from '../lib/notify/text.js';
import { IDS, SECRET, subscriptionFixture, testCtx } from './watch-fixtures.js';

const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const LANGS = ['ko', 'en', 'ja', 'zh'];
const REVIEWS = [
  { ja: false, zh: false },
  { ja: true, zh: true },
];
const NEW_KEYS = [
  'notifications.serverCompanionOverdue',
  'notifications.serverCompanionConfirmed',
  'notifications.serverDeviceChanged',
];
const OTHER_WATCH_ID = 'OTHERwatchIdFixture_01';

/**
 * 지켜보기 레코드, 날짜 기록, 구독을 records.js 로 넣는다.
 * sub 가 null 이면 구독을 넣지 않는다. deadlines 가 null 이면 날짜 기록을 넣지 않는다.
 */
async function seed(ctx, { watchId = IDS.watchId, date = TODAY, deadlines = ['14:30'], sub = { lang: 'ko' } } = {}) {
  const watchKey = watchKeyOf(watchId, SECRET);
  const expiresOn = '2026-11-25';
  const written = await writeWatch(ctx, watchKey, {
    ownerHash: ownerHashOf(IDS.accountKey, SECRET),
    writeHash: writeHashOf(IDS.writeToken),
    expiresOn,
    registrations: 0,
  });
  assert.equal(written, true);
  if (deadlines) await replaceDays(ctx, watchKey, [{ date, deadlines }]);
  let fixture = null;
  if (sub) {
    fixture = subscriptionFixture();
    await writeSub(ctx, watchKey, { subId: newSubId(), ...fixture.subscription, lang: sub.lang }, expiresOn);
  }
  return { watchKey, fixture };
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

/** kv.exec 를 감싼다. before(batch, inner) 를 그 배치보다 먼저 실행한다(엇갈림 재현용) */
function beforeExec(ctx, before) {
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      await before(batch, inner);
      return inner.exec(batch);
    },
  };
  return inner;
}

const hasCommand = (batch, name) => batch.some((cmd) => String(cmd[0]).toUpperCase() === name);
/** 횟수 제한 계수기(sh:<ns>:r:…)를 읽는 배치. watchKey 는 base64url 이라 ':r:' 가 들어가지 않는다 */
const isRateRead = (batch) => batch.some((c) => c[0] === 'GET' && String(c[1]).includes(':r:'));
const isClaim = (batch, time = '14:30') => batch.some((c) => c[0] === 'HSETNX' && c[2] === DAY_FIELD.pushed(time));
const sentBody = (ctx, i = 0) => JSON.parse(ctx.push.sent[i].payload);
const due = (watchKey, time = '14:30', date = TODAY) => ({ watchKey, date, time });

// ---- 문구 ----

test('문구: 넣는 값은 {time} 하나이고 자리표시자가 남지 않는다', () => {
  for (const kind of [PUSH_KIND.OVERDUE, PUSH_KIND.CONFIRMED]) {
    for (const lang of LANGS) {
      const raw = safety[PUSH_TEXT_KEY[kind]][lang];
      assert.deepEqual(
        [...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
        ['time'],
        `${kind}.${lang}`,
      );
      for (const reviewed of REVIEWS) {
        const p = JSON.parse(pushPayload(kind, { date: TODAY, time: '14:30', lang }, reviewed));
        assert.ok(p.body.includes('14:30'), `${kind}.${lang}: ${p.body}`);
        for (const text of [p.title, p.body]) {
          assert.ok(!/\{\w+\}/.test(text), `자리표시자가 남았다: ${text}`);
          // 날짜는 tag 에만 들어가고 보이는 문구에는 들어가지 않는다
          assert.ok(!text.includes(TODAY), text);
        }
      }
    }
  }
});

test('문구: 끼어든 다른 값은 문구에 쓰이지 않는다', () => {
  const input = { date: TODAY, time: '14:30', lang: 'ko', place: '가상장소', name: '홍길동' };
  const p = pushPayload(PUSH_KIND.OVERDUE, input, REVIEWS[0]);
  assert.ok(!p.includes('가상장소') && !p.includes('홍길동'));
});

test('문구: ja·zh 는 검수 전이면 영어로, 검수 뒤면 그 언어로 나간다', () => {
  for (const lang of ['ja', 'zh']) {
    for (const kind of Object.values(PUSH_KIND)) {
      const key = PUSH_TEXT_KEY[kind];
      const off = JSON.parse(pushPayload(kind, { date: TODAY, time: '14:30', lang }, { ja: false, zh: false }));
      assert.equal(off.body, translate(key, 'en', { time: '14:30' }));
      assert.equal(off.title, translate(NOTIFY_TITLE_KEY, 'en'));
      const on = JSON.parse(pushPayload(kind, { date: TODAY, time: '14:30', lang }, { ja: true, zh: true }));
      assert.equal(on.body, translate(key, lang, { time: '14:30' }));
      assert.equal(on.title, translate(NOTIFY_TITLE_KEY, lang));
      assert.notEqual(on.body, off.body);
    }
  }
  // ko·en 은 검수 스위치와 무관하다
  const ko = JSON.parse(pushPayload(PUSH_KIND.CONFIRMED, { date: TODAY, time: '14:30', lang: 'ko' }, REVIEWS[0]));
  assert.equal(ko.body, '일행이 14:30 마감 뒤 복귀를 확인했어요');
  assert.equal(ko.title, translate(NOTIFY_TITLE_KEY, 'ko'));
  // 모르는 언어는 기본 언어(ko)로 본다
  const unknown = JSON.parse(pushPayload(PUSH_KIND.CONFIRMED, { date: TODAY, time: '14:30', lang: 'fr' }, REVIEWS[0]));
  assert.equal(unknown.body, ko.body);
});

test('문구: 새 키 셋 모두 4개 언어 값이 있고 serverDeviceChanged 에는 자리표시자가 없다', () => {
  assert.deepEqual(Object.values(PUSH_TEXT_KEY).sort(), [...NEW_KEYS].sort());
  for (const key of NEW_KEYS) {
    for (const lang of LANGS) {
      const text = safety[key]?.[lang];
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${key}.${lang}`);
      // 새로 쓰는 문구에는 엠대시·엔대시를 쓰지 않는다
      assert.ok(!/[\u2013\u2014]/.test(text), `${key}.${lang}`);
    }
  }
  for (const lang of LANGS) {
    assert.ok(!/\{\w+\}/.test(safety['notifications.serverDeviceChanged'][lang]), lang);
    for (const reviewed of REVIEWS) {
      const p = JSON.parse(pushPayload(PUSH_KIND.DEVICE_CHANGED, { lang }, reviewed));
      assert.ok(!/\{\w+\}/.test(p.body));
    }
  }
});

test('문구: payload 는 title·body·url·tag 뿐이고 url 은 /g 다', () => {
  for (const kind of Object.values(PUSH_KIND)) {
    const p = JSON.parse(pushPayload(kind, { date: TODAY, time: '14:30', lang: 'en' }, REVIEWS[0]));
    assert.deepEqual(Object.keys(p).sort(), ['body', 'tag', 'title', 'url']);
    assert.equal(p.url, '/g');
  }
  const overdue = JSON.parse(pushPayload(PUSH_KIND.OVERDUE, { date: TODAY, time: '14:30', lang: 'en' }, REVIEWS[0]));
  const confirmed = JSON.parse(pushPayload(PUSH_KIND.CONFIRMED, { date: TODAY, time: '14:30', lang: 'en' }, REVIEWS[0]));
  const device = JSON.parse(pushPayload(PUSH_KIND.DEVICE_CHANGED, { lang: 'en' }, REVIEWS[0]));
  // 확인 알림이 같은 마감의 마감 지남 알림을 갈아 끼운다
  assert.equal(overdue.tag, 'sh-watch-2026-11-20-14:30');
  assert.equal(confirmed.tag, overdue.tag);
  assert.equal(device.tag, 'sh-watch-device');
});

test('문구: 모르는 kind, 형식이 틀린 시각은 null 이다', () => {
  const ok = { date: TODAY, time: '14:30', lang: 'ko' };
  assert.equal(pushPayload('UNKNOWN', ok, REVIEWS[0]), null);
  assert.equal(pushPayload(undefined, ok, REVIEWS[0]), null);
  assert.equal(pushPayload('__proto__', ok, REVIEWS[0]), null);
  for (const time of ['25:00', '14:3', '1430', '', null, undefined, '14:30 ']) {
    assert.equal(pushPayload(PUSH_KIND.OVERDUE, { ...ok, time }, REVIEWS[0]), null, String(time));
    assert.equal(pushPayload(PUSH_KIND.CONFIRMED, { ...ok, time }, REVIEWS[0]), null, String(time));
  }
  // tag 에 들어가는 날짜도 형식이 틀리면 만들지 않는다
  for (const date of ['2026-13-01', '20261120', '', null]) {
    assert.equal(pushPayload(PUSH_KIND.OVERDUE, { ...ok, date }, REVIEWS[0]), null, String(date));
  }
  // 기기 바뀜 알림은 시각·날짜를 쓰지 않는다
  assert.notEqual(pushPayload(PUSH_KIND.DEVICE_CHANGED, { lang: 'ko' }, REVIEWS[0]), null);
  assert.notEqual(pushPayload(PUSH_KIND.DEVICE_CHANGED, { time: 'x', date: 'y', lang: 'ko' }, REVIEWS[0]), null);
});

test('문구: 마감 지남 문구는 "확인이 없어요"라고 쓰고 단정하지 않는다', () => {
  const p = JSON.parse(pushPayload(PUSH_KIND.OVERDUE, { date: TODAY, time: '14:30', lang: 'ko' }, REVIEWS[0]));
  assert.ok(p.body.includes('복귀 확인이 없어요'), p.body);
  assert.ok(!p.body.includes('돌아오지 않'), p.body);
  const en = JSON.parse(pushPayload(PUSH_KIND.OVERDUE, { date: TODAY, time: '14:30', lang: 'en' }, REVIEWS[0]));
  assert.ok(en.body.includes("no confirmation yet that they're back"), en.body);
  assert.ok(!/did not return|didn't return|has not returned|hasn't returned|not back/i.test(en.body), en.body);
});

test('문구: 영어 서버 푸시 문구는 숙소 체크인과 겹치는 check-in 을 쓰지 않고, 안전 여부를 말하지 않는다', () => {
  for (const key of NEW_KEYS) {
    const en = safety[key].en;
    assert.ok(!/check.?in/i.test(en), `${key}: ${en}`);
    assert.ok(!/\bsafe|\bunsafe/i.test(en), `${key}: ${en}`);
  }
  // 복귀 확인 문구는 '확인했다'는 사실만 쓴다
  assert.equal(
    translate(PUSH_TEXT_KEY[PUSH_KIND.CONFIRMED], 'en', { time: '14:30' }),
    "Your companion confirmed they're back after the 14:30 return time",
  );
});

// ---- 보호자 푸시 ----

test('pushToGuardian: 구독이 없으면 NO_SUB 이고 보내지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { sub: null });
  const r = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
  assert.deepEqual(r, { outcome: 'NO_SUB' });
  assert.equal(ctx.push.sent.length, 0);
});

test('pushToGuardian: 보낸 payload 의 언어는 구독의 lang 을 따른다', async () => {
  const key = PUSH_TEXT_KEY[PUSH_KIND.OVERDUE];
  const input = { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' };

  const en = testCtx();
  const seeded = await seed(en, { sub: { lang: 'en' } });
  assert.deepEqual(await pushToGuardian(en, seeded.watchKey, input), { outcome: 'SENT', statusClass: '2xx' });
  assert.equal(sentBody(en).body, translate(key, 'en', { time: '14:30' }));
  // 구독 원문 중 보내는 데 필요한 세 값만 넘긴다(lang·subId 는 넘기지 않는다)
  assert.deepEqual(en.push.sent[0].subscription, seeded.fixture.subscription);

  const ja = testCtx();
  const jaSeed = await seed(ja, { sub: { lang: 'ja' } });
  await pushToGuardian(ja, jaSeed.watchKey, input);
  assert.equal(sentBody(ja).body, translate(key, 'en', { time: '14:30' }), '검수 전 ja 는 영어');
  ja.reviewed = { ja: true, zh: false };
  await pushToGuardian(ja, jaSeed.watchKey, input);
  assert.equal(sentBody(ja, 1).body, translate(key, 'ja', { time: '14:30' }));
  assert.equal(sentBody(ja, 1).title, translate(NOTIFY_TITLE_KEY, 'ja'));
});

test('pushToGuardian: GONE 이면 구독을 지운다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.push.outcome = 'GONE';
  const r = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
  assert.deepEqual(r, { outcome: 'GONE', statusClass: '404/410' });
  assert.equal(await readSub(ctx, watchKey), null);
});

test('pushToGuardian: GONE 을 받는 사이 새로 구독했으면 새 구독은 지우지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  const fresh = { subId: newSubId(), ...subscriptionFixture().subscription, lang: 'en' };
  const send = ctx.push.send.bind(ctx.push);
  ctx.push.send = async (input) => {
    // 첫 구독으로 보내는 동안 보호자가 새 기기로 구독한다
    await writeSub(ctx, watchKey, fresh, '2026-11-25');
    ctx.push.outcome = 'GONE';
    return send(input);
  };
  const r = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
  assert.equal(r.outcome, 'GONE');
  assert.equal((await readSub(ctx, watchKey))?.subId, fresh.subId);
});

test('pushToGuardian: RETRY·REJECTED 는 구독을 지우지 않는다', async () => {
  for (const outcome of ['RETRY', 'REJECTED']) {
    const ctx = testCtx();
    const { watchKey } = await seed(ctx);
    ctx.push.outcome = outcome;
    const r = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
    assert.equal(r.outcome, outcome);
    assert.notEqual(await readSub(ctx, watchKey), null, outcome);
  }
});

test('pushToGuardian: 하루 20건을 넘으면 CAPPED 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  const input = { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' };
  for (let i = 0; i < 20; i += 1) assert.equal((await pushToGuardian(ctx, watchKey, input)).outcome, 'SENT', `${i + 1}번째`);
  assert.deepEqual(await pushToGuardian(ctx, watchKey, input), { outcome: 'CAPPED' });
  assert.equal(ctx.push.sent.length, 20);
});

test('pushToGuardian: 구독이 없으면 횟수를 쓰지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { sub: null });
  const input = { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' };
  for (let i = 0; i < 25; i += 1) await pushToGuardian(ctx, watchKey, input);
  // 구독이 생기면 바로 보낼 수 있다
  await writeSub(ctx, watchKey, { subId: newSubId(), ...subscriptionFixture().subscription, lang: 'ko' }, '2026-11-25');
  assert.equal((await pushToGuardian(ctx, watchKey, input)).outcome, 'SENT');
});

test('pushToGuardian: topic 은 32자이고 날짜·시각이 그대로 들어 있지 않다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
  await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '18:00' });
  const [first, second] = ctx.push.sent.map((s) => s.topic);
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(first, topicOf({ watchKey, date: TODAY, time: '14:30' }, SECRET));
  for (const raw of [TODAY, '20261120', '14:30', '1430', watchKey.slice(0, 16)]) assert.ok(!first.includes(raw), raw);
  assert.notEqual(first, second, '마감마다 Topic 이 다르다');
});

test('pushToGuardian: 기기 바뀜 알림과 모르는 kind 는 보내지 않고 REJECTED 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  assert.equal((await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.DEVICE_CHANGED })).outcome, 'REJECTED');
  assert.equal((await pushToGuardian(ctx, watchKey, { kind: 'X', date: TODAY, time: '14:30' })).outcome, 'REJECTED');
  assert.equal((await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '25:00' })).outcome, 'REJECTED');
  assert.equal(ctx.push.sent.length, 0);
});

test('pushToGuardian: 푸시 어댑터가 던지면 RETRY 이고 구독을 지우지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.push.send = async () => {
    throw new Error('어댑터 실패');
  };
  const r = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' });
  assert.deepEqual(r, { outcome: 'RETRY', statusClass: 'network' });
  assert.notEqual(await readSub(ctx, watchKey), null);
});

test('pushToGuardian: 저장소 장애는 KvError 를 그대로 던진다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  failKvWhen(ctx, () => true);
  await assert.rejects(pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '14:30' }), KvError);
});

test('pushToSubscription: 기기 바뀜 알림은 횟수 제한·Topic 이 없고 GONE 이어도 아무것도 지우지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey, fixture } = await seed(ctx, { sub: { lang: 'en' } });
  const sub = await readSub(ctx, watchKey);
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(await pushToSubscription(ctx, sub, { kind: PUSH_KIND.DEVICE_CHANGED }), {
      outcome: 'SENT',
      statusClass: '2xx',
    });
  }
  assert.equal(ctx.push.sent.length, 25);
  assert.equal(ctx.push.sent[0].topic, undefined);
  assert.deepEqual(ctx.push.sent[0].subscription, fixture.subscription);
  const body = sentBody(ctx);
  assert.equal(body.body, translate('notifications.serverDeviceChanged', 'en'));
  assert.equal(body.tag, 'sh-watch-device');
  ctx.push.outcome = 'GONE';
  assert.equal((await pushToSubscription(ctx, sub, { kind: PUSH_KIND.DEVICE_CHANGED })).outcome, 'GONE');
  assert.notEqual(await readSub(ctx, watchKey), null, '지금 구독은 남는다');
});

test('pushToSubscription: 기기 바뀜이 아닌 kind, 구독이 없으면 보내지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  const sub = await readSub(ctx, watchKey);
  assert.equal((await pushToSubscription(ctx, sub, { kind: PUSH_KIND.OVERDUE })).outcome, 'REJECTED');
  assert.deepEqual(await pushToSubscription(ctx, null, { kind: PUSH_KIND.DEVICE_CHANGED }), { outcome: 'NO_SUB' });
  assert.equal(ctx.push.sent.length, 0);
  ctx.push.send = () => {
    throw new Error('어댑터 실패');
  };
  assert.deepEqual(await pushToSubscription(ctx, sub, { kind: PUSH_KIND.DEVICE_CHANGED }), {
    outcome: 'RETRY',
    statusClass: 'network',
  });
});

// ---- 예약 걸기 ----

test('fireAtMs·lateLimitMs 는 마감 + 10분, 마감 + 60분이다', () => {
  assert.equal(fireAtMs(TODAY, '14:30'), Date.parse('2026-11-20T05:40:00Z'));
  assert.equal(lateLimitMs(TODAY, '14:30'), Date.parse('2026-11-20T06:30:00Z'));
  assert.equal(fireAtMs(TODAY, '23:55'), Date.parse('2026-11-20T15:05:00Z'));
});

test('armPending: 마감 + 10분에 예약을 걸고 메시지 id 를 기록한다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 1, failed: 0 });
  assert.equal(ctx.scheduler.calls.length, 1);
  const [call] = ctx.scheduler.calls;
  assert.equal(call.notBeforeMs, Date.parse('2026-11-20T05:40:00Z'));
  assert.deepEqual(call.body, { k: watchKey, d: TODAY, t: '14:30' });
  // 중복 제거 id 는 마감마다 같은 머리 + 예약마다 다른 꼬리
  const head = dedupIdOf({ watchKey, date: TODAY, time: '14:30' }, SECRET);
  assert.ok(call.dedupId.startsWith(`${head}.`), call.dedupId);
  assert.match(call.dedupId, /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{8}$/);
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, { '14:30': 'm1' });
});

test('armPending: 이미 건 시각은 다시 걸지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await armPending(ctx, watchKey, [TODAY]);
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 0 });
  // 같은 날짜가 두 번 들어와도 한 번만 건다
  const other = testCtx();
  const seeded = await seed(other);
  assert.deepEqual(await armPending(other, seeded.watchKey, [TODAY, TODAY]), { armed: 1, failed: 0 });
  assert.equal(ctx.scheduler.calls.length, 1);
  assert.equal(other.scheduler.calls.length, 1);
});

test('armPending: 보냈거나(p: s) 보내는 중인(p: 1) 시각은 걸지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { deadlines: ['14:30', '16:00', '18:00'] });
  await setDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('14:30'), 's');
  assert.equal(await claimDayField(ctx, watchKey, TODAY, DAY_FIELD.pushed('16:00')), true);
  const day = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual([day.pushed, day.claimed], [['14:30'], ['16:00']]);
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 1, failed: 0 });
  assert.deepEqual(
    ctx.scheduler.calls.map((c) => c.body.t),
    ['18:00'],
  );
});

test('armPending: 보낼 시각이 지났어도 늦은 한도 안이면 지금으로 건다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:45:00Z'); // 14:45 KST
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 1, failed: 0 });
  assert.equal(ctx.scheduler.calls[0].notBeforeMs, ctx.now());
});

test('armPending: 마감 + 60분이 지났으면 걸지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T06:30:00Z'); // 15:30 KST, 늦은 한도와 같은 순간
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 0 });
  assert.equal(ctx.scheduler.calls.length, 0);
  // 한도 1분 전이면 건다
  ctx.clock.set('2026-11-20T06:29:00Z');
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 1, failed: 0 });
});

test('armPending: 예약 실패는 failed 로 세고 기록하지 않아 다음에 다시 건다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.scheduler.fail = true;
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 1 });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, {});
  ctx.scheduler.fail = false;
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 1, failed: 0 });
  assert.equal(ctx.scheduler.calls.length, 2);
});

test('armPending: 예약 어댑터가 던지거나 messageId 가 없으면 실패로 센다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { deadlines: ['14:30', '18:00'] });
  ctx.scheduler.schedule = async () => {
    throw new Error('어댑터 실패');
  };
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 2 });
  ctx.scheduler.schedule = async () => ({ ok: true });
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 2 });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, {});
});

test('armPending: 빠졌다 다시 들어온 마감은 중복 제거 id 가 달라 새 예약이 삼켜지지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await armPending(ctx, watchKey, [TODAY]);
  const { removedMessageIds } = await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['18:00'] }]);
  assert.deepEqual(removedMessageIds, ['m1']);
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  await armPending(ctx, watchKey, [TODAY]);
  const ids = ctx.scheduler.calls.filter((c) => c.body.t === '14:30').map((c) => c.dedupId);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(ids[0].split('.')[0], ids[1].split('.')[0]);
});

test('armPending: 자정 경계, 23:55 마감은 다음 날 00:05 에 건다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { deadlines: ['23:55'] });
  await armPending(ctx, watchKey, [TODAY]);
  assert.equal(ctx.scheduler.calls[0].notBeforeMs, Date.parse('2026-11-20T15:05:00Z'));
  // 예약이 실패한 채 자정을 넘겨도 어제 날짜로 다시 걸 수 있다(하루 1회 예약이 어제를 넣는 이유)
  const late = testCtx();
  const seeded = await seed(late, { deadlines: ['23:55'] });
  late.clock.set('2026-11-20T15:02:00Z'); // 11-21 00:02 KST
  assert.deepEqual(await armPending(late, seeded.watchKey, [TODAY]), { armed: 1, failed: 0 });
  assert.equal(late.scheduler.calls[0].notBeforeMs, Date.parse('2026-11-20T15:05:00Z'));
});

test('armPending: 날짜 기록이 없는 날짜는 건너뛴다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  assert.deepEqual(await armPending(ctx, watchKey, [TOMORROW, '2026-11-22']), { armed: 0, failed: 0 });
  assert.deepEqual(await armPending(ctx, watchKey, []), { armed: 0, failed: 0 });
});

test('armPending: 저장소 장애는 KvError 를 그대로 던진다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  failKvWhen(ctx, () => true);
  await assert.rejects(armPending(ctx, watchKey, [TODAY]), KvError);
  // 예약은 걸었는데 기록에서 실패해도 던진다
  const other = testCtx();
  const seeded = await seed(other);
  failKvWhen(other, (batch) => hasCommand(batch, 'HSET'));
  await assert.rejects(armPending(other, seeded.watchKey, [TODAY]), KvError);
});

test('armIndexedDates: 색인의 지켜보기를 돌며 걸고, 날짜 기록이 없는 항목은 색인에서 뺀다', async () => {
  const ctx = testCtx();
  const a = await seed(ctx, { deadlines: ['14:30', '18:00'] });
  await replaceDays(ctx, a.watchKey, [{ date: TOMORROW, deadlines: ['10:00'] }]);
  // 날짜 기록이 사라졌는데 색인에 남은 항목
  const ghost = watchKeyOf(OTHER_WATCH_ID, SECRET);
  await ctx.kv.exec([['SADD', ctx.keys.index(TODAY), ghost]]);
  assert.ok((await indexMembers(ctx, TODAY)).includes(ghost));

  const r = await armIndexedDates(ctx, [TODAY, TOMORROW]);
  assert.deepEqual(r, { watches: 1, armed: 3, failed: 0 });
  assert.deepEqual(
    ctx.scheduler.calls.map((c) => `${c.body.d} ${c.body.t}`).sort(),
    ['2026-11-20 14:30', '2026-11-20 18:00', '2026-11-21 10:00'],
  );
  assert.ok(ctx.scheduler.calls.every((c) => c.body.k === a.watchKey));
  assert.deepEqual(await indexMembers(ctx, TODAY), [a.watchKey]);
  // 다시 돌려도 더 걸지 않는다
  assert.deepEqual(await armIndexedDates(ctx, [TODAY, TOMORROW]), { watches: 1, armed: 0, failed: 0 });
});

test('armIndexedDates: 한 지켜보기의 실패가 나머지를 막지 않고, KvError 는 던진다', async () => {
  const ctx = testCtx();
  const a = await seed(ctx);
  const b = await seed(ctx, { watchId: OTHER_WATCH_ID, deadlines: ['16:00'] });
  const inner = ctx.scheduler.schedule;
  ctx.scheduler.schedule = async (args) => {
    if (args.body.k === a.watchKey) throw new Error('어댑터 실패');
    return inner(args);
  };
  assert.deepEqual(await armIndexedDates(ctx, [TODAY]), { watches: 2, armed: 1, failed: 1 });
  assert.equal((await readDay(ctx, b.watchKey, TODAY)).armed['16:00'], 'm1');

  failKvWhen(ctx, (batch) => hasCommand(batch, 'SMEMBERS'));
  await assert.rejects(armIndexedDates(ctx, [TODAY]), KvError);
});

test('armIndexedDates: 한 지켜보기의 저장소 쓰기가 KvError 가 아닌 오류로 던져도 failed 로 세고 다른 지켜보기는 건다', async () => {
  const ctx = testCtx();
  const a = await seed(ctx);
  const b = await seed(ctx, { watchId: OTHER_WATCH_ID, deadlines: ['16:00'] });
  const aDay = ctx.keys.day(a.watchKey, TODAY);
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      // a 의 걸림 표시를 쓰는 배치만 예상 못 한 오류로 실패한다(예약은 이미 걸린 뒤다)
      if (batch.some((c) => c[0] === 'HSET' && c[1] === aDay)) throw new Error('예상 못 한 오류');
      return inner.exec(batch);
    },
  };
  assert.deepEqual(await armIndexedDates(ctx, [TODAY]), { watches: 2, armed: 1, failed: 1 });
  assert.deepEqual((await readDay(ctx, a.watchKey, TODAY)).armed, {});
  assert.deepEqual(Object.keys((await readDay(ctx, b.watchKey, TODAY)).armed), ['16:00']);
});

test('armIndexedDates: 지켜보기 레코드가 없거나 출국일 뒤 날짜면 걸지 않고 색인에서 뺀다', async () => {
  // 지켜보기 레코드가 먼저 사라지고 날짜 기록과 색인만 남은 경우
  const gone = testCtx();
  const g = await seed(gone, { deadlines: ['14:30'] });
  await gone.kv.exec([['DEL', gone.keys.watch(g.watchKey)]]);
  assert.deepEqual(await armIndexedDates(gone, [TODAY]), { watches: 0, armed: 0, failed: 0 });
  assert.equal(gone.scheduler.calls.length, 0);
  assert.deepEqual(await indexMembers(gone, TODAY), []);

  // 출국일(2026-11-25) 뒤 날짜의 기록. 출국일 당일은 건다
  const after = testCtx();
  const w = await seed(after, { deadlines: null });
  await replaceDays(after, w.watchKey, [
    { date: '2026-11-25', deadlines: ['09:00'] },
    { date: '2026-11-26', deadlines: ['09:00'] },
  ]);
  after.clock.set('2026-11-24T15:30:00Z'); // 2026-11-25 00:30 KST
  assert.deepEqual(await armIndexedDates(after, ['2026-11-25', '2026-11-26']), { watches: 1, armed: 1, failed: 0 });
  assert.deepEqual(
    after.scheduler.calls.map((c) => c.body.d),
    ['2026-11-25'],
  );
  assert.deepEqual(await indexMembers(after, '2026-11-26'), []);
  assert.deepEqual(await indexMembers(after, '2026-11-25'), [w.watchKey]);
});

test('armIndexedDates: 지켜보기 레코드는 한 번 부를 때 watchKey 마다 한 번만 읽는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await replaceDays(ctx, watchKey, [{ date: TOMORROW, deadlines: ['10:00'] }]);
  const watchReads = [];
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      for (const c of batch) if (c[0] === 'GET' && c[1] === ctx.keys.watch(watchKey)) watchReads.push(c);
      return inner.exec(batch);
    },
  };
  assert.deepEqual(await armIndexedDates(ctx, [TODAY, TOMORROW]), { watches: 1, armed: 2, failed: 0 });
  assert.equal(watchReads.length, 1);
});

test('cancelMessages 는 예약 업체가 실패해도 던지지 않는다', async () => {
  const ctx = testCtx();
  const seen = [];
  ctx.scheduler.cancel = async (id) => {
    seen.push(id);
    if (id === 'm1') throw new Error('어댑터 실패');
    return false;
  };
  assert.equal(await cancelMessages(ctx, ['m1', 'm2', 'm2']), undefined);
  assert.deepEqual(seen.sort(), ['m1', 'm2']);
  ctx.scheduler.cancel = () => {
    throw new Error('동기 실패');
  };
  assert.equal(await cancelMessages(ctx, ['m3']), undefined);
  assert.equal(await cancelMessages(ctx, []), undefined);
  assert.equal(await cancelMessages(ctx, null), undefined);
  // 기본 기록기로는 그대로 취소된다
  const plain = testCtx();
  await cancelMessages(plain, ['m7', 'm8']);
  assert.deepEqual(plain.scheduler.cancelled.sort(), ['m7', 'm8']);
});

// ---- 예약 처리 ----

test('processDue: 확인이 없으면 한 번 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z'); // 14:40 KST
  const r = await processDue(ctx, due(watchKey));
  assert.deepEqual(r, { outcome: DUE_OUTCOME.SENT, retry: false, statusClass: '2xx' });
  assert.equal(ctx.push.sent.length, 1);
  const body = sentBody(ctx);
  assert.equal(body.body, translate(PUSH_TEXT_KEY[PUSH_KIND.OVERDUE], 'ko', { time: '14:30' }));
  assert.equal(body.tag, 'sh-watch-2026-11-20-14:30');
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).pushed, ['14:30']);
  // 결과에 식별 값·날짜·시각이 없다
  const blob = JSON.stringify(r);
  for (const raw of [watchKey, TODAY, '14:30']) assert.ok(!blob.includes(raw), raw);
});

test('processDue: 같은 예약이 두 번 와도 한 번만 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: DUE_OUTCOME.SKIP_DUP, retry: false });
  assert.equal(ctx.push.sent.length, 1);
});

test('processDue: 동시에 두 번 불러도 한 번만 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  const results = await Promise.all([processDue(ctx, due(watchKey)), processDue(ctx, due(watchKey))]);
  assert.deepEqual(results.map((r) => r.outcome).sort(), ['SENT', 'SKIP_DUP']);
  assert.ok(results.every((r) => r.retry === false));
  assert.equal(ctx.push.sent.length, 1);
});

test('processDue: 판정표의 건너뛰기', async () => {
  const cases = [
    {
      expect: 'SKIP_OFF',
      async prepare(ctx) {
        const { watchKey } = await seed(ctx);
        ctx.enabled = false;
        return due(watchKey);
      },
    },
    {
      expect: 'SKIP_NO_WATCH',
      async prepare() {
        return due(watchKeyOf(OTHER_WATCH_ID, SECRET));
      },
    },
    {
      expect: 'SKIP_NO_WATCH',
      async prepare() {
        return due('형식이-틀린-키');
      },
    },
    {
      expect: 'SKIP_CHANGED', // 마감이 빠짐
      async prepare(ctx) {
        const { watchKey } = await seed(ctx, { deadlines: ['18:00'] });
        return due(watchKey);
      },
    },
    {
      expect: 'SKIP_CHANGED', // 날짜 기록이 없음
      async prepare(ctx) {
        const { watchKey } = await seed(ctx, { deadlines: null });
        return due(watchKey);
      },
    },
    {
      expect: 'SKIP_CHANGED', // 형식이 틀린 시각
      async prepare(ctx) {
        const { watchKey } = await seed(ctx);
        return due(watchKey, '25:00');
      },
    },
    {
      expect: 'SKIP_CONFIRMED',
      async prepare(ctx) {
        const { watchKey } = await seed(ctx);
        await setDayField(ctx, watchKey, TODAY, DAY_FIELD.confirmed('14:30'), '1');
        await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1'); // 위 줄이 먼저다
        return due(watchKey);
      },
    },
    {
      expect: 'SKIP_MUTED',
      async prepare(ctx) {
        const { watchKey } = await seed(ctx);
        await setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1');
        return due(watchKey);
      },
    },
    {
      expect: 'SKIP_EARLY',
      at: '2026-11-20T05:39:00Z', // 14:39:00 KST
      async prepare(ctx) {
        return due((await seed(ctx)).watchKey);
      },
    },
    {
      expect: 'SKIP_LATE',
      at: '2026-11-20T06:30:00Z', // 15:30 KST
      async prepare(ctx) {
        return due((await seed(ctx)).watchKey);
      },
    },
    {
      expect: 'SKIP_NO_SUB',
      async prepare(ctx) {
        return due((await seed(ctx, { sub: null })).watchKey);
      },
    },
  ];
  for (const c of cases) {
    const ctx = testCtx();
    const input = await c.prepare(ctx);
    ctx.clock.set(c.at ?? '2026-11-20T05:40:00Z');
    const r = await processDue(ctx, input);
    // 일찍 온 예약만 다시 부르게 한다(걸림 표시가 남아 다른 경로가 다시 걸지 않기 때문이다)
    assert.deepEqual(r, { outcome: c.expect, retry: c.expect === 'SKIP_EARLY' }, c.expect);
    assert.equal(ctx.push.sent.length, 0, c.expect);
    // 권리를 얻기 전에 멈췄으므로 보냄 표시가 남지 않는다
    if (input.watchKey.length === 43) {
      const day = await readDay(ctx, input.watchKey, TODAY);
      assert.deepEqual(day?.pushed ?? [], [], c.expect);
      assert.deepEqual(day?.claimed ?? [], [], c.expect);
    }
  }
});

test('processDue: 일찍 온 예약은 retry 가 참이고 걸림 표시를 남긴다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await armPending(ctx, watchKey, [TODAY]);
  ctx.clock.set('2026-11-20T05:39:00Z'); // 14:39:00 KST, 보낼 시각 1분 전
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_EARLY', retry: true });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, { '14:30': 'm1' });
  // 예약 업체가 다시 부르면 보낸다
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
});

test('processDue: 마감 + 9분 30초부터는 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:39:29Z');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_EARLY', retry: true });
  assert.equal(fireAtMs(TODAY, '14:30') - EARLY_TOLERANCE_MS, Date.parse('2026-11-20T05:39:30Z'));
  ctx.clock.set('2026-11-20T05:39:30Z');
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
  // 늦은 한도 1초 전까지 보낸다
  const late = testCtx();
  const seeded = await seed(late);
  late.clock.set('2026-11-20T06:29:59Z');
  assert.equal((await processDue(late, due(seeded.watchKey))).outcome, 'SENT');
});

test('processDue: 자정 경계, 어제 23:55 마감은 다음 날 00:05 에 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { deadlines: ['23:55'] });
  ctx.clock.set('2026-11-20T15:05:00Z'); // 11-21 00:05 KST
  assert.deepEqual(await processDue(ctx, due(watchKey, '23:55')), { outcome: 'SENT', retry: false, statusClass: '2xx' });
  assert.equal(sentBody(ctx).tag, 'sh-watch-2026-11-20-23:55');
});

test('processDue: 푸시 서비스가 RETRY 면 권리를 돌려놓고 retry 가 참이다. 다시 부르면 보낸다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  ctx.push.outcome = 'RETRY';
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'RETRY', retry: true, statusClass: '5xx' });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).pushed, []);
  ctx.push.outcome = 'SENT';
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
  assert.equal(ctx.push.sent.length, 2);
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SKIP_DUP');
});

test('processDue: GONE 이면 구독을 지우고 다시 부르지 않게 한다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  ctx.push.outcome = 'GONE';
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SUB_GONE', retry: false, statusClass: '404/410' });
  assert.equal(await readSub(ctx, watchKey), null);
  assert.equal(ctx.push.sent.length, 1);
});

test('processDue: REJECTED 는 다시 부르지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  ctx.push.outcome = 'REJECTED';
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SEND_REJECTED', retry: false, statusClass: '4xx' });
  assert.notEqual(await readSub(ctx, watchKey), null);
});

test('processDue: 하루 한도를 넘으면 SKIP_CAP 이고 다시 부르지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  for (let i = 0; i < 20; i += 1) await hitRate(ctx, 'push', watchKey);
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CAP', retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('processDue: 권리를 얻은 뒤 구독이 사라지면 SKIP_NO_SUB 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  const inner = ctx.kv;
  ctx.kv = {
    async exec(batch) {
      const out = await inner.exec(batch);
      if (hasCommand(batch, 'HSETNX')) await inner.exec([['DEL', ctx.keys.sub(watchKey)]]);
      return out;
    },
  };
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_NO_SUB', retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('processDue: 다시 올린 뒤 빠진 마감의 예약이 늦게 와도 보내지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { deadlines: ['14:30', '18:00'] });
  await armPending(ctx, watchKey, [TODAY]);
  const { removedMessageIds } = await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['18:00'] }]);
  assert.deepEqual(removedMessageIds, ['m1']);
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CHANGED', retry: false });
  assert.equal(ctx.push.sent.length, 0);
});

test('processDue: 저장소 장애는 KvError 를 던지고, 권리를 얻은 뒤였으면 권리를 돌려놓는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  failKvWhen(ctx, () => true);
  await assert.rejects(processDue(ctx, due(watchKey)), KvError);

  // 권리(HSETNX)를 얻은 뒤 횟수 보기(계수기 GET)에서 저장소가 실패: 던지고, 권리는 돌려놓아 다시 부르면 보낸다
  const after = testCtx();
  const seeded = await seed(after);
  after.clock.set('2026-11-20T05:40:00Z');
  const inner = after.kv;
  let failOnce = true;
  after.kv = {
    async exec(batch) {
      if (failOnce && isRateRead(batch)) {
        failOnce = false;
        throw new KvError('KV_UNAVAILABLE');
      }
      return inner.exec(batch);
    },
  };
  await assert.rejects(processDue(after, due(seeded.watchKey)), KvError);
  assert.equal(after.push.sent.length, 0);
  assert.deepEqual((await readDay(after, seeded.watchKey, TODAY)).pushed, []);
  assert.deepEqual((await readDay(after, seeded.watchKey, TODAY)).claimed, []);
  assert.equal((await processDue(after, due(seeded.watchKey))).outcome, 'SENT');
});

test('processDue: 푸시 어댑터가 던지면 RETRY 로 보고 권리를 돌려놓는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  ctx.push.send = async () => {
    throw new Error('어댑터 실패');
  };
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'RETRY', retry: true, statusClass: 'network' });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).pushed, []);
});

test('processDue: 출국일 뒤 날짜의 예약은 SKIP_CHANGED 이고, 출국일 당일은 보낸다', async () => {
  // seed 의 출국일은 2026-11-25 다
  const ctx = testCtx();
  const { watchKey } = await seed(ctx, { date: '2026-11-26' });
  ctx.clock.set('2026-11-26T05:40:00Z');
  assert.deepEqual(await processDue(ctx, due(watchKey, '14:30', '2026-11-26')), { outcome: 'SKIP_CHANGED', retry: false });
  assert.equal(ctx.push.sent.length, 0);
  assert.deepEqual((await readDay(ctx, watchKey, '2026-11-26')).claimed, []);

  const last = testCtx();
  const seeded = await seed(last, { date: '2026-11-25' });
  last.clock.set('2026-11-25T05:40:00Z');
  assert.equal((await processDue(last, due(seeded.watchKey, '14:30', '2026-11-25'))).outcome, 'SENT');
});

test('processDue: 앞에서 읽은 뒤 권리를 얻기 전에 확인이 들어오면 보내지 않고 권리를 돌려놓는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  await armPending(ctx, watchKey, [TODAY]);
  ctx.clock.set('2026-11-20T05:40:00Z');
  const dayKey = ctx.keys.day(watchKey, TODAY);
  beforeExec(ctx, async (batch, inner) => {
    // 환자의 '돌아왔어요'가 첫 읽기와 권리 얻기 사이에 c: 를 쓴다
    if (isClaim(batch)) await inner.exec([['HSET', dayKey, DAY_FIELD.confirmed('14:30'), '1']]);
  });
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CONFIRMED', retry: false });
  assert.equal(ctx.push.sent.length, 0);
  const day = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual(day.confirmed, ['14:30']);
  assert.deepEqual([day.pushed, day.claimed], [[], []], 'p: 가 남지 않는다');
});

test('processDue: 권리를 얻는 사이 함께 있음이 켜지거나 마감이 빠지면 권리를 돌려놓고 걸림 표시를 지운다', async () => {
  const cases = [
    { expect: 'SKIP_MUTED', field: DAY_FIELD.muted, value: '1' },
    { expect: 'SKIP_CHANGED', field: DAY_FIELD.deadlines, value: JSON.stringify(['18:00']) },
  ];
  for (const c of cases) {
    const ctx = testCtx();
    const { watchKey } = await seed(ctx);
    await armPending(ctx, watchKey, [TODAY]);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const dayKey = ctx.keys.day(watchKey, TODAY);
    beforeExec(ctx, async (batch, inner) => {
      if (isClaim(batch)) await inner.exec([['HSET', dayKey, c.field, c.value]]);
    });
    assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: c.expect, retry: false }, c.expect);
    assert.equal(ctx.push.sent.length, 0, c.expect);
    const day = await readDay(ctx, watchKey, TODAY);
    assert.deepEqual([day.pushed, day.claimed, day.armed], [[], [], {}], c.expect);
  }
});

test('processDue: 날짜 기록이 지워진 뒤 권리를 얻으면 만든 기록을 지우고 SKIP_CHANGED 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  const dayKey = ctx.keys.day(watchKey, TODAY);
  beforeExec(ctx, async (batch, inner) => {
    // 빈 목록 업로드가 첫 읽기와 권리 얻기 사이에 날짜 기록을 지운다
    if (isClaim(batch)) await inner.exec([['DEL', dayKey]]);
  });
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CHANGED', retry: false });
  assert.equal(await readDay(ctx, watchKey, TODAY), null, 'p: 하나짜리 기록이 남지 않는다');
});

test('processDue: SKIP_CHANGED(빠진 마감)·SKIP_MUTED·SKIP_NO_SUB·SUB_GONE 은 걸림 표시를 지워 다시 걸 수 있게 한다', async () => {
  const subGoneAfterClaim = (ctx, watchKey) => {
    const inner = ctx.kv;
    ctx.kv = {
      async exec(batch) {
        const out = await inner.exec(batch);
        if (isClaim(batch)) await inner.exec([['DEL', ctx.keys.sub(watchKey)]]);
        return out;
      },
    };
  };
  const cases = [
    {
      name: 'SKIP_CHANGED',
      async prepare(ctx, watchKey) {
        // 걸림 표시만 남고 마감은 빠진 상태(하루 1회 예약과 업로드가 엇갈린 경우)
        await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['18:00'] }]);
        await setDayField(ctx, watchKey, TODAY, DAY_FIELD.armed('14:30'), 'm1');
      },
    },
    { name: 'SKIP_MUTED', prepare: (ctx, watchKey) => setDayField(ctx, watchKey, TODAY, DAY_FIELD.muted, '1') },
    { name: 'SKIP_NO_SUB', prepare: (ctx, watchKey) => ctx.kv.exec([['DEL', ctx.keys.sub(watchKey)]]) },
    { name: 'SKIP_NO_SUB', prepare: (ctx, watchKey) => subGoneAfterClaim(ctx, watchKey) },
    {
      name: 'SUB_GONE',
      prepare(ctx) {
        ctx.push.outcome = 'GONE';
      },
    },
  ];
  for (const c of cases) {
    const ctx = testCtx();
    const { watchKey } = await seed(ctx);
    await armPending(ctx, watchKey, [TODAY]);
    assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, { '14:30': 'm1' });
    await c.prepare(ctx, watchKey);
    ctx.clock.set('2026-11-20T05:40:00Z');
    assert.equal((await processDue(ctx, due(watchKey))).outcome, c.name);
    const day = await readDay(ctx, watchKey, TODAY);
    assert.equal(Object.hasOwn(day.armed, '14:30'), false, c.name);
    assert.deepEqual([day.pushed, day.claimed], [[], []], c.name);
  }
});

test('processDue: 보내지 못한 RETRY·SKIP_CAP·SEND_REJECTED 는 보냄 표시를 남기지 않고 걸림 표시는 남긴다', async () => {
  const cases = [
    {
      name: 'RETRY',
      retry: true,
      prepare(ctx) {
        ctx.push.outcome = 'RETRY';
      },
    },
    {
      name: 'SEND_REJECTED',
      retry: false,
      prepare(ctx) {
        ctx.push.outcome = 'REJECTED';
      },
    },
    {
      name: 'SKIP_CAP',
      retry: false,
      async prepare(ctx, watchKey) {
        for (let i = 0; i < 20; i += 1) await countRate(ctx, 'push', watchKey);
      },
    },
  ];
  for (const c of cases) {
    const ctx = testCtx();
    const { watchKey } = await seed(ctx);
    await armPending(ctx, watchKey, [TODAY]);
    await c.prepare(ctx, watchKey);
    ctx.clock.set('2026-11-20T05:40:00Z');
    const r = await processDue(ctx, due(watchKey));
    assert.equal(r.outcome, c.name);
    assert.equal(r.retry, c.retry, c.name);
    const day = await readDay(ctx, watchKey, TODAY);
    assert.deepEqual([day.pushed, day.claimed], [[], []], c.name);
    assert.deepEqual(day.armed, { '14:30': 'm1' }, c.name);
  }
});

test('processDue: 하루 1회 예약과 업로드가 엇갈려 남은 걸림 표시는 SKIP_CHANGED 가 지우고, 마감을 다시 넣으면 다시 건다', async () => {
  // 검토 시나리오 S6
  const ctx = testCtx({ at: '2026-11-19T15:30:00Z' }); // 11-20 00:30 KST
  const { watchKey } = await seed(ctx);
  const inner = ctx.scheduler.schedule;
  ctx.scheduler.schedule = async (args) => {
    // 예약 업체 왕복 중에 환자 앱이 14:30 을 뺀 목록을 올린다. 아직 a: 가 없어 취소할 id 가 없다
    const res = await inner(args);
    const { removedMessageIds } = await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['18:00'] }]);
    assert.deepEqual(removedMessageIds, []);
    return res;
  };
  await armIndexedDates(ctx, [TODAY]);
  ctx.scheduler.schedule = inner;
  const raced = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual(raced.deadlines, ['18:00']);
  assert.deepEqual(raced.armed, { '14:30': 'm1' }, '빠진 마감에 걸림 표시가 남았다');

  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CHANGED', retry: false });
  assert.deepEqual((await readDay(ctx, watchKey, TODAY)).armed, {});

  ctx.clock.set('2026-11-20T05:42:00Z');
  await replaceDays(ctx, watchKey, [{ date: TODAY, deadlines: ['14:30', '18:00'] }]);
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 2, failed: 0 });
  const rearmed = ctx.scheduler.calls.filter((c) => c.body.t === '14:30');
  assert.equal(rearmed.length, 2);
  assert.equal(rearmed[1].notBeforeMs, ctx.now());
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
});

test('하루 푸시 한도: RETRY 는 한도를 쓰지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  ctx.push.outcome = 'RETRY';
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'RETRY', retry: true, statusClass: '5xx' }, `${i + 1}번째`);
  }
  assert.equal(await peekRate(ctx, 'push', watchKey), true);
  ctx.push.outcome = 'SENT';
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SENT');
  assert.equal(ctx.push.sent.length, 26);
});

test('하루 푸시 한도: SENT 20건 뒤의 다음 푸시는 SKIP_CAP 이고 보내지 않는다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  const input = { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '18:00' };
  for (let i = 0; i < 20; i += 1) assert.equal((await pushToGuardian(ctx, watchKey, input)).outcome, 'SENT');
  assert.equal(await peekRate(ctx, 'push', watchKey), false);
  ctx.clock.set('2026-11-20T05:40:00Z');
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SKIP_CAP', retry: false });
  assert.equal(ctx.push.sent.length, 20);
});

test('하루 푸시 한도: 보낸 뒤 세기가 실패해도 SENT 이고 p: 는 s 다', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  failKvWhen(ctx, (batch) => hasCommand(batch, 'INCR'));
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SENT', retry: false, statusClass: '2xx' });
  assert.equal(ctx.push.sent.length, 1);
  const day = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual([day.pushed, day.claimed], [['14:30'], []]);
  // pushToGuardian 도 세기 실패로 던지지 않는다
  assert.equal(
    (await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date: TODAY, time: '18:00' })).outcome,
    'SENT',
  );
});

test('processDue: 보낸 뒤 보냄 표시를 쓰지 못해도 SENT 다(이미 나갔다)', async () => {
  const ctx = testCtx();
  const { watchKey } = await seed(ctx);
  ctx.clock.set('2026-11-20T05:40:00Z');
  failKvWhen(ctx, (batch) => batch.some((c) => c[0] === 'HSET' && c[2] === DAY_FIELD.pushed('14:30')));
  assert.deepEqual(await processDue(ctx, due(watchKey)), { outcome: 'SENT', retry: false, statusClass: '2xx' });
  // 's' 를 쓰지 못해 보내는 중으로 남는다. 다시 걸지 않고, 다시 와도 보내지 않는다
  const day = await readDay(ctx, watchKey, TODAY);
  assert.deepEqual([day.pushed, day.claimed], [[], ['14:30']]);
  assert.deepEqual(await armPending(ctx, watchKey, [TODAY]), { armed: 0, failed: 0 });
  assert.equal((await processDue(ctx, due(watchKey))).outcome, 'SKIP_DUP');
  assert.equal(ctx.push.sent.length, 1);
});

test('DUE_OUTCOME 은 판정표의 결과 목록이다', () => {
  assert.deepEqual(Object.keys(DUE_OUTCOME).sort(), [
    'RETRY',
    'SEND_REJECTED',
    'SENT',
    'SKIP_CAP',
    'SKIP_CHANGED',
    'SKIP_CONFIRMED',
    'SKIP_DUP',
    'SKIP_EARLY',
    'SKIP_LATE',
    'SKIP_MUTED',
    'SKIP_NO_SUB',
    'SKIP_NO_WATCH',
    'SKIP_OFF',
    'SUB_GONE',
  ]);
  for (const [k, v] of Object.entries(DUE_OUTCOME)) assert.equal(k, v);
  assert.ok(Object.isFrozen(DUE_OUTCOME));
});
