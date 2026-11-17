// 보호자 서버 알림 요청 모양 (src/guardian/pushRequests.js · docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 1)
//
// 이 파일이 고정하는 것
//   - 구독 본문은 toJSON 모양에서 endpoint 와 두 키만 싣고 expirationTime·모르는 필드를 버린다(허용 목록)
//   - 형식 규칙(endpoint https 1~2048자, p256dh 65바이트 0x04, auth 16바이트, lang 네 언어, subId 22자)이 서버 허용 목록과 같다
//   - 해지·상태 조회·함께 있음 본문의 키, 상태 조회는 subId 가 없으면 키가 없다, on 은 불리언만
//   - 형식이 틀리면 TypeError 이고 메시지에 값(식별 값, endpoint, 키)이 없다
//   - 응답 읽기는 계약 모양일 때만 값이고 아니면 null 이다
//   - 세 경로가 docs/contracts.md 의 계약 표와 라우트 파일에 있다
//
// 외부 호출은 없다. 서버 모듈은 비교를 위해서만 불러온다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_LANGS } from '../lib/server/itinerary-request.js';
import { SUB_ID_RE as SERVER_SUB_ID_RE } from '../lib/server/watch/keys.js';
import { normalizeMute, normalizeStatus, normalizeSubscribe, normalizeUnsubscribe } from '../lib/server/watch/requests.js';
import { toBase64Url } from '../src/guardian/crypto.js';
import * as guardian from '../src/guardian/index.js';
import {
  MAX_ENDPOINT_CHARS,
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
import { LANGS } from '../src/i18n/index.js';
import { IDS } from './watch-fixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCH_ID = IDS.watchId;
/** 형식에 맞는 고정 구독 id(테스트 전용, 22자) */
const SUB_ID = 'SUBidFixture_0123456-a';
/** 허용 목록 안의 테스트 주소(실제 구독 주소가 아니다) */
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/fixture-guardian';

/** n 바이트 키. 첫 바이트를 정할 수 있다 */
function keyOf(n, first = 0x04, fill = 0x2a) {
  const bytes = new Uint8Array(n).fill(fill);
  bytes[0] = first;
  return toBase64Url(bytes);
}

const P256DH = keyOf(65);
const AUTH = keyOf(16, 0x11);

/** PushSubscription.toJSON() 모양 */
function subscriptionJson(overrides = {}) {
  return { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH }, ...overrides };
}

/** TypeError 이고 메시지에 금지한 값이 하나도 없다. 메시지는 '함수: 필드 ...' 로 시작한다 */
function throwsWithout(fn, field, values) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof TypeError, String(error));
    assert.ok(error.message.includes(`: ${field} `), `${error.message} 에 ${field} 가 없다`);
    for (const value of values) assert.ok(!error.message.includes(value), '메시지에 값이 있다');
    return true;
  });
}

describe('구독 요청 (subscribeRequest)', () => {
  test('subscribeRequest 는 toJSON 모양에서 endpoint 와 두 키만 싣고 expirationTime 을 버린다', () => {
    const request = subscribeRequest({
      watchId: WATCH_ID,
      subscription: { ...subscriptionJson({ expirationTime: 1_800_000_000_000 }), extra: 'x', keys: { p256dh: P256DH, auth: AUTH, other: 'y' } },
      lang: 'ja',
      endpoint: ENDPOINT,
      lat: 37.5,
    });
    assert.deepEqual(request, {
      method: 'POST',
      path: '/api/watch/subscribe',
      body: { watchId: WATCH_ID, subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }, lang: 'ja' },
    });
    assert.deepEqual(Object.keys(request.body), ['watchId', 'subscription', 'lang']);
    assert.deepEqual(Object.keys(request.body.subscription), ['endpoint', 'keys']);
    assert.deepEqual(Object.keys(request.body.subscription.keys), ['p256dh', 'auth']);

    // 서버 허용 목록을 통과하고 같은 값으로 읽힌다
    const server = normalizeSubscribe(JSON.parse(JSON.stringify(request.body)));
    assert.deepEqual(server, { ok: true, value: { watchId: WATCH_ID, subscription: { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH }, lang: 'ja' } });
  });

  test('끝의 = 채움은 서버처럼 받아들이고 본문에는 채움 없는 base64url 로 싣는다', () => {
    const padded = subscriptionJson({ keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` } });
    const { body } = subscribeRequest({ watchId: WATCH_ID, subscription: padded, lang: 'ko' });
    assert.equal(body.subscription.keys.p256dh, P256DH);
    assert.equal(body.subscription.keys.auth, AUTH);
    assert.equal(normalizeSubscribe({ watchId: WATCH_ID, subscription: { endpoint: ENDPOINT, keys: padded.keys }, lang: 'ko' }).ok, true);
  });

  test('subscribeRequest 는 http endpoint, 2048자 초과, 65바이트가 아닌 p256dh, 16바이트가 아닌 auth, 모르는 lang 을 던지고 메시지에 값이 없다', () => {
    const long = `${ENDPOINT}/${'a'.repeat(MAX_ENDPOINT_CHARS - ENDPOINT.length)}`;
    assert.equal(long.length, MAX_ENDPOINT_CHARS + 1);
    const cases = [
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: 'http://fcm.googleapis.com/fcm/send/fixture-guardian' }) }],
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: 'ftp://fcm.googleapis.com/x' }) }],
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: 'not a url' }) }],
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: '' }) }],
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: long }) }],
      ['subscription.endpoint', { subscription: subscriptionJson({ endpoint: undefined }) }],
      ['subscription.keys.p256dh', { subscription: subscriptionJson({ keys: { p256dh: keyOf(64), auth: AUTH } }) }],
      ['subscription.keys.p256dh', { subscription: subscriptionJson({ keys: { p256dh: keyOf(66), auth: AUTH } }) }],
      ['subscription.keys.p256dh', { subscription: subscriptionJson({ keys: { p256dh: keyOf(65, 0x03), auth: AUTH } }) }],
      ['subscription.keys.p256dh', { subscription: subscriptionJson({ keys: { p256dh: `${P256DH.slice(0, -1)}+`, auth: AUTH } }) }],
      ['subscription.keys.p256dh', { subscription: subscriptionJson({ keys: { p256dh: `${P256DH}===`, auth: AUTH } }) }],
      ['subscription.keys.auth', { subscription: subscriptionJson({ keys: { p256dh: P256DH, auth: keyOf(15, 0x11) } }) }],
      ['subscription.keys.auth', { subscription: subscriptionJson({ keys: { p256dh: P256DH, auth: keyOf(17, 0x11) } }) }],
      ['subscription.keys.auth', { subscription: subscriptionJson({ keys: { p256dh: P256DH, auth: 16 } }) }],
      ['subscription.keys', { subscription: subscriptionJson({ keys: null }) }],
      ['subscription', { subscription: null }],
      ['subscription', { subscription: [ENDPOINT] }],
      ['lang', { lang: 'fr' }],
      ['lang', { lang: undefined }],
      ['watchId', { watchId: 'short' }],
    ];
    for (const [field, override] of cases) {
      const input = { watchId: WATCH_ID, subscription: subscriptionJson(), lang: 'en', ...override };
      throwsWithout(() => subscribeRequest(input), field, [WATCH_ID, ENDPOINT, P256DH, AUTH, 'fixture-guardian']);
    }
    throwsWithout(() => subscribeRequest(undefined), 'watchId', []);

    // 2048자는 된다(서버 상한과 같다)
    const max = `${ENDPOINT}/${'a'.repeat(MAX_ENDPOINT_CHARS - ENDPOINT.length - 1)}`;
    assert.equal(max.length, MAX_ENDPOINT_CHARS);
    assert.equal(subscribeRequest({ watchId: WATCH_ID, subscription: subscriptionJson({ endpoint: max }), lang: 'zh' }).body.subscription.endpoint, max);
  });

  test('키 길이·첫 바이트·채움·언어·endpoint 길이의 판정이 서버 허용 목록과 같다', () => {
    const keyCases = [
      { p256dh: P256DH, auth: AUTH },
      { p256dh: keyOf(64), auth: AUTH },
      { p256dh: keyOf(66), auth: AUTH },
      { p256dh: keyOf(65, 0x03), auth: AUTH },
      { p256dh: `${P256DH}=`, auth: `${AUTH}==` },
      { p256dh: `${P256DH}==`, auth: `${AUTH}=` },
      { p256dh: `${P256DH}===`, auth: AUTH },
      { p256dh: P256DH, auth: keyOf(15, 0x11) },
      { p256dh: P256DH, auth: keyOf(17, 0x11) },
      { p256dh: P256DH, auth: `${AUTH.slice(0, 21)}` },
    ];
    const endpoints = [ENDPOINT, `${ENDPOINT}/${'a'.repeat(MAX_ENDPOINT_CHARS - ENDPOINT.length - 1)}`, `${ENDPOINT}/${'a'.repeat(MAX_ENDPOINT_CHARS - ENDPOINT.length)}`];
    const langs = [...LANGS, 'fr', 'KO', ''];
    const accepts = (body) => {
      try {
        subscribeRequest(body);
        return true;
      } catch {
        return false;
      }
    };
    for (const keys of keyCases) {
      for (const endpoint of endpoints) {
        for (const lang of langs) {
          const body = { watchId: WATCH_ID, subscription: { endpoint, keys }, lang };
          assert.equal(accepts(body), normalizeSubscribe(body).ok, JSON.stringify({ keys: Object.values(keys).map((k) => k.length), endpoint: endpoint.length, lang }));
        }
      }
    }
  });

  test('형식이 서버와 같다: SUB_ID_RE, endpoint 상한, 네 언어', () => {
    assert.equal(SUB_ID_RE.source, SERVER_SUB_ID_RE.source);
    assert.equal(SUB_ID_RE.flags, SERVER_SUB_ID_RE.flags);
    assert.equal(MAX_ENDPOINT_CHARS, 2048);
    assert.deepEqual([...LANGS], [...PLAN_LANGS]);
  });
});

describe('해지·상태 조회·함께 있음 요청', () => {
  test('unsubscribeRequest 는 DELETE /api/watch/subscribe 이고 본문 키가 watchId, subId 둘뿐이다', () => {
    const request = unsubscribeRequest({ watchId: WATCH_ID, subId: SUB_ID, endpoint: ENDPOINT });
    assert.deepEqual(request, { method: 'DELETE', path: '/api/watch/subscribe', body: { watchId: WATCH_ID, subId: SUB_ID } });
    assert.deepEqual(Object.keys(request.body), ['watchId', 'subId']);
    assert.deepEqual(normalizeUnsubscribe(request.body), { ok: true, value: { watchId: WATCH_ID, subId: SUB_ID } });
    throwsWithout(() => unsubscribeRequest({ watchId: WATCH_ID, subId: 'short' }), 'subId', [WATCH_ID]);
    throwsWithout(() => unsubscribeRequest({ watchId: WATCH_ID }), 'subId', [WATCH_ID]);
    throwsWithout(() => unsubscribeRequest({ watchId: 'x', subId: SUB_ID }), 'watchId', [SUB_ID]);
    throwsWithout(() => unsubscribeRequest(null), 'watchId', []);
  });

  test('statusRequest 는 subId 가 없으면 본문에 subId 키가 없다', () => {
    for (const input of [{ watchId: WATCH_ID }, { watchId: WATCH_ID, subId: null }, { watchId: WATCH_ID, subId: undefined }]) {
      const request = statusRequest(input);
      assert.deepEqual(request, { method: 'POST', path: '/api/watch/status', body: { watchId: WATCH_ID } });
      assert.equal(Object.hasOwn(request.body, 'subId'), false);
      assert.deepEqual(normalizeStatus(request.body), { ok: true, value: { watchId: WATCH_ID, subId: null } });
    }
    const withSub = statusRequest({ watchId: WATCH_ID, subId: SUB_ID, date: '2026-11-20' });
    assert.deepEqual(withSub.body, { watchId: WATCH_ID, subId: SUB_ID });
    assert.deepEqual(normalizeStatus(withSub.body), { ok: true, value: { watchId: WATCH_ID, subId: SUB_ID } });
    throwsWithout(() => statusRequest({ watchId: WATCH_ID, subId: 'bad' }), 'subId', [WATCH_ID]);
    throwsWithout(() => statusRequest({ watchId: WATCH_ID, subId: '' }), 'subId', [WATCH_ID]);
    throwsWithout(() => statusRequest({ subId: SUB_ID }), 'watchId', [SUB_ID]);
  });

  test('muteRequest 의 on 은 불리언만 받는다', () => {
    for (const on of [true, false]) {
      const request = muteRequest({ watchId: WATCH_ID, subId: SUB_ID, on });
      assert.deepEqual(request, { method: 'POST', path: '/api/watch/mute', body: { watchId: WATCH_ID, subId: SUB_ID, on } });
      assert.deepEqual(normalizeMute(request.body), { ok: true, value: { watchId: WATCH_ID, subId: SUB_ID, on } });
    }
    for (const on of ['true', 1, 0, null, undefined]) {
      throwsWithout(() => muteRequest({ watchId: WATCH_ID, subId: SUB_ID, on }), 'on', [WATCH_ID, SUB_ID]);
    }
    throwsWithout(() => muteRequest({ watchId: WATCH_ID, on: true }), 'subId', [WATCH_ID]);
    throwsWithout(() => muteRequest({ watchId: 'x', subId: SUB_ID, on: true }), 'watchId', [SUB_ID]);
  });
});

describe('응답 읽기', () => {
  test('readStatusData 는 날짜 형식이 틀리거나 confirmed 에 HH:MM 이 아닌 값이 있으면 null', () => {
    const good = { ok: true, date: '2026-11-20', confirmed: ['14:30', '18:00'], muted: false, subscriptionActive: true, extra: 'x' };
    assert.deepEqual(readStatusData(good), { date: '2026-11-20', confirmed: ['14:30', '18:00'], muted: false, subscriptionActive: true });
    assert.notEqual(readStatusData(good).confirmed, good.confirmed, '배열을 새로 만든다');
    assert.deepEqual(readStatusData({ ...good, confirmed: [] }).confirmed, []);
    const ten = Array.from({ length: 10 }, (_, i) => `${String(10 + i)}:00`);
    assert.deepEqual(readStatusData({ ...good, confirmed: ten }).confirmed, ten);

    const bad = [
      { ...good, date: '2026-2-1' },
      { ...good, date: '2026-11-20T00:00:00+09:00' },
      { ...good, date: undefined },
      { ...good, confirmed: ['24:00'] },
      { ...good, confirmed: ['9:00'] },
      { ...good, confirmed: [1430] },
      { ...good, confirmed: '14:30' },
      { ...good, confirmed: [...ten, '23:00'] },
      { ...good, muted: 'false' },
      { ...good, subscriptionActive: null },
      { date: good.date, confirmed: good.confirmed, muted: false },
    ];
    for (const data of bad) assert.equal(readStatusData(data), null, JSON.stringify(data));
    for (const data of [null, undefined, 'x', [good]]) assert.equal(readStatusData(data), null);
  });

  test('readSubscribeData 는 22자 base64url subId 만 받는다', () => {
    assert.deepEqual(readSubscribeData({ ok: true, subId: SUB_ID, endpoint: ENDPOINT }), { subId: SUB_ID });
    for (const subId of [SUB_ID.slice(1), `${SUB_ID}x`, `${SUB_ID.slice(1)}+`, `${SUB_ID.slice(1)}=`, 12, null, undefined]) {
      assert.equal(readSubscribeData({ ok: true, subId }), null, String(subId));
    }
    for (const data of [null, undefined, SUB_ID, [SUB_ID]]) assert.equal(readSubscribeData(data), null);
  });

  test('readMuteData 는 불리언 muted 만 받는다', () => {
    assert.deepEqual(readMuteData({ ok: true, muted: true }), { muted: true });
    assert.deepEqual(readMuteData({ ok: true, muted: false }), { muted: false });
    for (const muted of ['true', 1, null, undefined]) assert.equal(readMuteData({ ok: true, muted }), null);
    assert.equal(readMuteData(null), null);
  });

  test('readConfigData 는 켜짐·꺼짐 모양만 받고, 켜졌는데 VAPID 공개키가 65바이트 비압축 점이 아니면 null', () => {
    const vapid = keyOf(65, 0x04, 0x33);
    assert.deepEqual(readConfigData({ ok: true, enabled: true, vapidPublicKey: vapid, guardianLoginRequired: true }), {
      enabled: true,
      vapidPublicKey: vapid,
      guardianLoginRequired: true,
    });
    assert.deepEqual(readConfigData({ ok: true, enabled: false, vapidPublicKey: null, guardianLoginRequired: false }), {
      enabled: false,
      vapidPublicKey: null,
      guardianLoginRequired: false,
    });
    assert.equal(readConfigData({ enabled: true, vapidPublicKey: `${vapid}=`, guardianLoginRequired: true }).vapidPublicKey, vapid, '채움을 떼어 적는다');
    const bad = [
      { enabled: true, vapidPublicKey: null, guardianLoginRequired: true },
      { enabled: true, vapidPublicKey: keyOf(64), guardianLoginRequired: true },
      { enabled: true, vapidPublicKey: keyOf(65, 0x02), guardianLoginRequired: true },
      { enabled: false, vapidPublicKey: 'not-a-key', guardianLoginRequired: true },
      { enabled: 'true', vapidPublicKey: vapid, guardianLoginRequired: true },
      { enabled: true, vapidPublicKey: vapid },
      { enabled: true, guardianLoginRequired: true },
    ];
    for (const data of bad) assert.equal(readConfigData(data), null, JSON.stringify(data));
    for (const data of [null, undefined, 'x']) assert.equal(readConfigData(data), null);
  });
});

describe('경로', () => {
  test('PUSH_PATHS 세 경로는 docs/contracts.md 와 같다', async () => {
    assert.deepEqual({ ...PUSH_PATHS }, { subscribe: '/api/watch/subscribe', status: '/api/watch/status', mute: '/api/watch/mute' });
    const contracts = readFileSync(join(ROOT, 'docs/contracts.md'), 'utf8');
    const requests = [
      subscribeRequest({ watchId: WATCH_ID, subscription: subscriptionJson(), lang: 'ko' }),
      unsubscribeRequest({ watchId: WATCH_ID, subId: SUB_ID }),
      statusRequest({ watchId: WATCH_ID }),
      muteRequest({ watchId: WATCH_ID, subId: SUB_ID, on: true }),
    ];
    for (const request of requests) {
      // 계약 표의 줄과 라우트 파일이 내보내는 메서드
      assert.ok(contracts.includes(`| \`${request.method} ${request.path}\` |`), `${request.method} ${request.path}`);
      const route = await import(`../app${request.path}/route.js`);
      assert.equal(typeof route[request.method], 'function', `${request.method} ${request.path}`);
      // 식별 값은 본문으로만 간다
      assert.ok(!request.path.includes(WATCH_ID) && !request.path.includes(SUB_ID));
    }
  });

  test('공개 진입점(src/guardian/index.js)이 같은 함수를 다시 내보낸다', () => {
    assert.equal(guardian.subscribeRequest, subscribeRequest);
    assert.equal(guardian.unsubscribeRequest, unsubscribeRequest);
    assert.equal(guardian.statusRequest, statusRequest);
    assert.equal(guardian.muteRequest, muteRequest);
    assert.equal(guardian.readSubscribeData, readSubscribeData);
    assert.equal(guardian.readStatusData, readStatusData);
    assert.equal(guardian.readMuteData, readMuteData);
    assert.equal(guardian.readConfigData, readConfigData);
    assert.equal(guardian.PUSH_PATHS, PUSH_PATHS);
    assert.equal(guardian.SUB_ID_RE, SUB_ID_RE);
    assert.equal(guardian.MAX_ENDPOINT_CHARS, MAX_ENDPOINT_CHARS);
  });
});
