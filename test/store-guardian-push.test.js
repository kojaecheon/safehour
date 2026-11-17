// 기기 저장소의 보호자 구독 기록 guardianPush 와 서버 삭제 대기의 구독 해지 항목
// (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 2, '공용 모양', 다르게 정한 것 6, 정한 값 7·11·13)
//
// 이 파일이 고정하는 것
//   - guardianPush 는 계정 이름공간 레코드 { subs, status, gone } 이고 허용 목록 필드만 남는다. endpoint 원문, p256dh, auth 는
//     들어와도 버린다(주소는 SHA-256 해시만)
//   - 세 목록은 틀린 항목만 버리고, 같은 watchId 는 나중 것 하나, 10개 상한이다
//   - writeGuardianPush·updateGuardianPush 는 쓰기 가능할 때만. 읽기는 보기 전용에서도 된다. updateGuardianPush 는 지금 저장된
//     기록을 정규화해 updater 에 주고, 기다리는 사이 더해진 구독을 덮지 않는다. updater 가 던지거나 약속·평범하지 않은 객체를
//     돌려주면 INVALID 이고 쓰지 않는다
//   - 쓰기 불변식: 구독 기록을 바꾸는 모든 쓰기에서 기록 원문에 있던 (watchId, subId) 가 쓴 기록의 subs 에 없고 그 watchId 가
//     gone 에도 없으면 서버 삭제 대기로 간다(빠뜨린 updater, null, 통째로 쓰기, 깨진 구독, 새 POST 로 바뀐 옛 subId)
//   - 끄기(retireGuardianPushSub)는 기록에서 빼고 { watchId, subId } 를 대기에 넣어 DELETE /api/watch/subscribe 를 스스로 보낸다.
//     200·404·400 은 빼고 연결 실패·429·503 은 남긴다. 결과의 queued 가 거짓이면 대기 상한에 밀려 버려졌다
//   - 서버 삭제 대기는 두 종류를 함께 두고 지켜보기 삭제는 watchId, 구독 해지는 (watchId, subId) 로 겹침을 없애며 합쳐 10개다.
//     넘으면 가장 오래된 구독 해지부터, 그다음 가장 오래된 지켜보기 삭제를 버린다. A-2 항목만 있는 저장소도 그대로다
//   - 지우기 경로: 끄기, 내 정보 지우기(모든 계정), 사본 수명 정리(앱 열기와 사본 삭제). 구독은 자기 체류가 아니라 사본의 수명을
//     따른다: 자기 체류의 자동 삭제와 체류 삭제는 보호자 구독을 건드리지 않는다
//   - 지우기 경로는 구독의 다른 필드가 깨졌어도 watchId·subId 가 맞으면 대기에 넣는다. 저장 공간이 꽉 차도 식별 값을 잃지 않는다
//   - guardianPushElsewhere 는 다른 계정 이름공간에 구독이 있는지만 불리언으로 돌려준다
//
// 저장소는 메모리, 시계와 fetch 는 주입한다. 외부 호출은 없다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHash } from 'node:crypto';

import { GUARDIAN_PUSH_MAX, normalizeGuardianPush } from '../lib/store/guardianPush.js';
import { PENDING_DELETE_MAX, normalizePendingDelete } from '../lib/store/guardianWatch.js';
import {
  DEVICE_KEY,
  RECORD,
  SCHEMA_VERSION,
  STORE_ERROR,
  STORE_PREFIX,
  TOPICS,
  accountRecordKey,
  createMemoryStorage,
  createStore,
} from '../lib/store/index.js';
import { PUSH_PATHS, readConfigData } from '../src/guardian/pushRequests.js';
import { WATCH_PATHS } from '../src/guardian/watchRequests.js';
import { makeStay } from './stay-fixtures.js';

const ACCOUNT_A = 'acct_guardian_push_a_0001';
const ACCOUNT_B = 'acct_guardian_push_b_0002';
const HOUR = 3600_000;
/** 2026-10-02 12:00 KST: 테스트 체류(10-01 ~ 10-08) 중간 */
const T0 = Date.parse('2026-10-02T12:00:00+09:00');

/** 테스트 전용 구독 endpoint(기록에 남으면 안 되는 원문)와 두 키 */
const ENDPOINT = 'https://push.example.test/send/endpoint-original-0001';
const P256DH = createECDH('prime256v1').generateKeys().toString('base64url');
const AUTH = 'AAECAwQFBgcICQoLDA0ODw';
/** 서버 VAPID 공개키 모양(P-256 비압축 점 65바이트, 채움 없는 base64url) */
const VAPID_KEY = createECDH('prime256v1').generateKeys().toString('base64url');
const ENDPOINT_HASH = createHash('sha256').update(ENDPOINT).digest('base64url');

const watchIdOf = (n) => `W${String(n).padStart(21, '0')}`;
const subIdOf = (n) => `S${String(n).padStart(21, '0')}`;
const writeTokenOf = (n) => `T${String(n).padStart(42, '0')}`;

/** 형식에 맞는 구독 기록 항목 하나 */
function sub(n, overrides = {}) {
  return { watchId: watchIdOf(n), subId: subIdOf(n), lang: 'ko', endpointHash: ENDPOINT_HASH, vapidKey: VAPID_KEY, ...overrides };
}

function statusOf(n, overrides = {}) {
  return { watchId: watchIdOf(n), date: '2026-10-02', confirmed: ['14:30'], muted: false, active: true, atMs: T0, ...overrides };
}

const unsub = (n) => ({ watchId: watchIdOf(n), subId: subIdOf(n) });
const unwatch = (n) => ({ watchId: watchIdOf(n), writeToken: writeTokenOf(n) });

function watchRecord(n) {
  return {
    ...unwatch(n),
    expiresOn: '2026-10-08',
    lastUploaded: { '2026-10-02': ['18:00'] },
    uploadPending: false,
    backQueue: [],
    confirmed: [],
    state: 'ON',
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * 받은 요청을 쌓는 가짜 fetch. 로그아웃은 logoutStatus, 지켜보기 삭제와 구독 해지는 deleteStatus(body, path) 로 답한다.
 * 상태가 'network' 면 연결 실패, 'off' 면 서버 알림 꺼짐 503, 'hang' 이면 release() 를 부를 때까지 기다렸다가 200 이다.
 */
function fakeFetch({ logoutStatus = 200, deleteStatus = () => 200 } = {}) {
  const calls = [];
  const waiting = [];
  const respond = (status, code) => {
    if (status === 'network') throw new TypeError('fetch failed');
    if (status === 'off') return json(503, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' });
    if (status === 503) return json(503, { ok: false, errorCode: code ?? 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' });
    return json(status, status >= 200 && status < 300 ? { ok: true } : { ok: false, errorCode: `CODE_${status}` });
  };
  const fetchImpl = async (url, init = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, body, init });
    if (url === '/api/auth/logout') return respond(fake.logoutStatus);
    if ((url === WATCH_PATHS.watch || url === PUSH_PATHS.subscribe) && init.method === 'DELETE') {
      const status = fake.deleteStatus(body, url);
      if (status === 'hang') return new Promise((resolve) => waiting.push(() => resolve(json(200, { ok: true }))));
      return respond(status);
    }
    return json(404, { ok: false });
  };
  const fake = {
    calls,
    fetchImpl,
    logoutStatus,
    deleteStatus,
    unsubscribes: () => calls.filter((c) => c.url === PUSH_PATHS.subscribe && c.method === 'DELETE'),
    watchDeletes: () => calls.filter((c) => c.url === WATCH_PATHS.watch && c.method === 'DELETE'),
    release: () => waiting.splice(0).forEach((fn) => fn()),
  };
  return fake;
}

function makeStore({ storage, clock, fake, locked = false }) {
  return createStore({ storage, now: () => clock.ms, fetchImpl: (...args) => fake.fetchImpl(...args), locked });
}

function signIn(store, clock, accountKey = ACCOUNT_A) {
  store.setOnline(true);
  store.setSession({ authenticated: true, accountKey, expiresAt: new Date(clock.ms + 12 * HOUR).toISOString() });
}

/** 메모리 저장소 + 로그인한 저장소 */
function setup(fakeOptions, storage = createMemoryStorage()) {
  const clock = { ms: T0 };
  const fake = fakeFetch(fakeOptions);
  const store = makeStore({ storage, clock, fake });
  signIn(store, clock);
  return { storage, clock, fake, store };
}

function storageKeys(storage) {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k.startsWith(STORE_PREFIX));
}

function putRaw(storage, key, data) {
  storage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
}

/** 고른 키의 setItem 이 던지는 저장소(쓰기 막힘 흉내). removeToo 면 그 키의 removeItem 도 던진다 */
function throwingStorage(shouldThrow, { removeToo = false } = {}) {
  const inner = createMemoryStorage();
  return {
    get length() {
      return inner.length;
    },
    key: (index) => inner.key(index),
    getItem: (key) => inner.getItem(key),
    setItem(key, value) {
      if (shouldThrow(key)) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem(key) {
      if (removeToo && shouldThrow(key)) throw new Error('SecurityError');
      inner.removeItem(key);
    },
    clear: () => inner.clear(),
  };
}

/**
 * 담을 수 있는 글자 수(키 + 값의 합)에 한도가 있는 저장소(저장 공간이 꽉 찬 기기 흉내). limit 이 null 이면 한도가 없다.
 * 한도를 넘는 setItem 은 던진다. 같은 키의 값을 줄이는 쓰기와 지우기는 된다
 */
function quotaStorage() {
  const inner = createMemoryStorage();
  const used = () =>
    Array.from({ length: inner.length }, (_, i) => inner.key(i)).reduce((sum, key) => sum + key.length + inner.getItem(key).length, 0);
  const storage = {
    limit: null,
    used,
    get length() {
      return inner.length;
    },
    key: (index) => inner.key(index),
    getItem: (key) => inner.getItem(key),
    setItem(key, value) {
      const before = inner.getItem(key);
      const after = used() - (before === null ? 0 : key.length + before.length) + key.length + String(value).length;
      if (storage.limit !== null && after > storage.limit) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key),
    clear: () => inner.clear(),
  };
  return storage;
}

/** 저장소에 실제로 들어간 서버 삭제 대기(메모리 몫은 보지 않는다). 없으면 null */
function storedPending(storage) {
  const raw = storage.getItem(DEVICE_KEY.pendingServerDelete);
  return raw === null ? null : JSON.parse(raw).data;
}

const record = (overrides = {}) => ({ subs: [sub(1)], status: [], gone: [], ...overrides });

/** 보호자 사본 하나: 서버 알림 지켜보기 id 를 담은 스냅샷(맨 끝 키)과 만료 시각(기본: 2026-10-20 끝, KST) */
const copyOf = (n, expiresAt = '2026-10-20T23:59:00+09:00') => ({ snapshot: { watchId: watchIdOf(n) }, expiresAt });

const pushKeyOf = (accountKey) => accountRecordKey(accountKey, RECORD.guardianPush);
const bySubId = (a, b) => a.subId.localeCompare(b.subId);
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('guardianPush 기록', () => {
  test('normalizeGuardianPush 는 틀린 항목을 버리고 같은 watchId 는 나중 것 하나, 10개 상한이다', () => {
    assert.equal(GUARDIAN_PUSH_MAX, 10);
    for (const bad of [null, undefined, 'x', 1, [], [sub(1)]]) assert.equal(normalizeGuardianPush(bad), null, JSON.stringify(bad));
    assert.deepEqual(normalizeGuardianPush({}), { subs: [], status: [], gone: [] }, '목록이 없으면 빈 목록이다');
    assert.deepEqual(normalizeGuardianPush({ subs: 'x', status: {}, gone: 1 }), { subs: [], status: [], gone: [] });

    // 구독: 틀린 항목은 버리고, 같은 watchId 는 나중 것(새 subId)
    const renewed = sub(1, { subId: subIdOf(91), lang: 'ja' });
    const badSubs = [
      null,
      sub(3, { watchId: 'short' }),
      sub(3, { subId: 'S'.repeat(21) }),
      sub(3, { lang: 'fr' }),
      sub(3, { endpointHash: 'H'.repeat(42) }),
      sub(3, { endpointHash: `${ENDPOINT_HASH}=` }),
      sub(3, { vapidKey: `A${VAPID_KEY.slice(1)}` }), // 첫 바이트가 0x04 가 아님
      sub(3, { vapidKey: `${VAPID_KEY}=` }), // 채움이 붙은 모양
      sub(3, { vapidKey: VAPID_KEY.slice(0, 86) }),
      { watchId: watchIdOf(3), subId: subIdOf(3), lang: 'ko', endpointHash: ENDPOINT_HASH }, // vapidKey 없음
    ];
    assert.deepEqual(normalizeGuardianPush({ subs: [sub(1), sub(2), ...badSubs, renewed] }).subs, [sub(2), renewed]);
    const many = Array.from({ length: 12 }, (_, i) => sub(i + 1));
    assert.deepEqual(normalizeGuardianPush({ subs: many }).subs, many.slice(-10), '오래된 것(앞)부터 버린다');

    // 상태: confirmed 가 하나라도 틀리거나 10개를 넘으면 항목을 통째로 버린다. active 는 불리언 또는 null
    const later = statusOf(1, { confirmed: ['14:30', '18:00'], muted: true, active: null, atMs: T0 + 1 });
    const badStatus = [
      statusOf(4, { date: '2026-02-30' }),
      statusOf(4, { confirmed: ['14:30', '25:00'] }),
      statusOf(4, { confirmed: Array.from({ length: 11 }, (_, i) => `1${i % 10}:00`) }),
      statusOf(4, { confirmed: '14:30' }),
      statusOf(4, { muted: 'no' }),
      statusOf(4, { active: 'yes' }),
      statusOf(4, { atMs: -1 }),
      statusOf(4, { atMs: 1.5 }),
      statusOf(4, { watchId: 'bad' }),
    ];
    assert.deepEqual(normalizeGuardianPush({ status: [statusOf(1), statusOf(2), ...badStatus, later] }).status, [statusOf(2), later]);
    const manyStatus = Array.from({ length: 12 }, (_, i) => statusOf(i + 1));
    assert.deepEqual(normalizeGuardianPush({ status: manyStatus }).status, manyStatus.slice(-10));

    // gone: watchId 형식만, 겹치지 않게(나중 자리), 10개
    assert.deepEqual(normalizeGuardianPush({ gone: [watchIdOf(1), 'bad', null, watchIdOf(2), watchIdOf(1)] }).gone, [watchIdOf(2), watchIdOf(1)]);
    const manyGone = Array.from({ length: 12 }, (_, i) => watchIdOf(i + 1));
    assert.deepEqual(normalizeGuardianPush({ gone: manyGone }).gone, manyGone.slice(-10));
  });

  test('VAPID 키 판정은 설정 읽기(readConfigData)가 돌려주는 모양을 받는다', () => {
    for (let i = 0; i < 32; i += 1) {
      const key = createECDH('prime256v1').generateKeys().toString('base64url');
      const config = readConfigData({ enabled: true, vapidPublicKey: key, guardianLoginRequired: true });
      assert.equal(config.vapidPublicKey, key);
      assert.equal(normalizeGuardianPush({ subs: [sub(1, { vapidKey: config.vapidPublicKey })] }).subs.length, 1, key);
    }
  });

  test('normalizeGuardianPush 는 endpoint 원문, p256dh, auth 같은 모르는 필드를 남기지 않는다', () => {
    const leaky = {
      subs: [{ ...sub(1), endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH }, p256dh: P256DH, auth: AUTH, expirationTime: null }],
      status: [{ ...statusOf(1), endpoint: ENDPOINT, note: 'x' }],
      gone: [],
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
      subscription: { endpoint: ENDPOINT },
    };
    const normalized = normalizeGuardianPush(leaky);
    assert.deepEqual(Object.keys(normalized), ['subs', 'status', 'gone']);
    assert.deepEqual(Object.keys(normalized.subs[0]), ['watchId', 'subId', 'lang', 'endpointHash', 'vapidKey']);
    assert.deepEqual(Object.keys(normalized.status[0]), ['watchId', 'date', 'confirmed', 'muted', 'active', 'atMs']);

    // 저장소를 거쳐도 원문과 두 키는 기기에 남지 않는다
    const { storage, store } = setup();
    assert.deepEqual(store.writeGuardianPush(leaky), { ok: true });
    const raw = storage.getItem(accountRecordKey(ACCOUNT_A, RECORD.guardianPush));
    for (const secret of [ENDPOINT, 'push.example.test', P256DH, AUTH, '"endpoint"', '"keys"', '"p256dh"', '"auth"', '"expirationTime"', '"note"']) {
      assert.ok(!raw.includes(secret), secret);
    }
    assert.ok(raw.includes(ENDPOINT_HASH), '주소는 해시만 둔다');
    assert.deepEqual(store.readGuardianPush(), normalized);
    assert.ok(Object.isFrozen(store.readGuardianPush().subs[0]));
    assert.equal(store.readGuardianPush(), store.readGuardianPush(), '바뀌지 않았으면 같은 참조다');
  });

  test('writeGuardianPush 는 보기 전용에서 READ_ONLY 다', () => {
    assert.ok(TOPICS.includes(RECORD.guardianPush), '구독 주제다');
    const { storage, clock, fake, store } = setup();
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(`${event.topic}:${event.accountKey}`));
    assert.equal(store.readGuardianPush(), null);
    assert.deepEqual(store.writeGuardianPush(record()), { ok: true });
    assert.deepEqual(topics, [`guardianPush:${ACCOUNT_A}`]);
    assert.deepEqual(store.writeGuardianPush(record()), { ok: true });
    assert.equal(topics.length, 1, '저장된 것과 같으면 쓰지도 알리지도 않는다');
    for (const bad of [null, 'x', [record()]]) {
      assert.deepEqual(store.writeGuardianPush(bad), { ok: false, code: STORE_ERROR.INVALID }, JSON.stringify(bad));
    }

    const next = record({ subs: [sub(1), sub(2)] });
    // 오프라인
    store.setOnline(false);
    assert.deepEqual(store.writeGuardianPush(next), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(store.readGuardianPush(), normalizeGuardianPush(record()), '보기 전용에서도 읽힌다');
    // 세션 만료
    store.setOnline(true);
    clock.ms += 13 * HOUR;
    assert.equal(store.getStatus().reason, 'SESSION_EXPIRED');
    assert.deepEqual(store.writeGuardianPush(next), { ok: false, code: STORE_ERROR.READ_ONLY });
    // 세션 없음
    store.setSession(null);
    assert.equal(store.getStatus().reason, 'NO_SESSION');
    assert.deepEqual(store.writeGuardianPush(next), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(store.readGuardianPush().subs, [sub(1)], '마지막 로그인 계정의 기록이 그대로다');
    assert.equal(topics.length, 1);

    // 잠긴 인스턴스(서버 렌더링)는 읽지도 쓰지도 않는다
    const locked = makeStore({ storage, clock, fake, locked: true });
    assert.equal(locked.readGuardianPush(), null);
    assert.deepEqual(locked.writeGuardianPush(record()), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(locked.updateGuardianPush(() => record()), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(locked.guardianPushElsewhere(), false);
  });

  test('updateGuardianPush 는 지금 저장된 기록으로 고친다: 앞서 읽은 뒤 더해진 구독을 덮지 않는다', async () => {
    const { storage, store } = setup();
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    const stale = store.readGuardianPush(); // 상태 조회가 네트워크를 기다리기 전에 읽은 기록
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] })); // 기다리는 사이 다른 쪽이 구독을 더했다

    let seen = 'unset';
    const result = store.updateGuardianPush((current) => {
      seen = current;
      return { ...current, status: [statusOf(1)] };
    });
    assert.deepEqual(seen.subs, [sub(1), sub(2)], 'updater 는 앞서 읽은 값이 아니라 지금 기록을 받는다');
    assert.ok(Object.isFrozen(seen) && Object.isFrozen(seen.subs[0]), '얼린 값을 받는다');
    assert.notDeepEqual(seen.subs, stale.subs);
    const expected = { subs: [sub(1), sub(2)], status: [statusOf(1)], gone: [] };
    assert.deepEqual(result, { ok: true, record: expected });
    assert.deepEqual(store.readGuardianPush(), expected, '더해진 구독이 남는다');

    // 허용 목록은 writeGuardianPush 와 같다
    store.updateGuardianPush((current) => ({
      ...current,
      endpoint: ENDPOINT,
      subs: current.subs.map((item) => ({ ...item, endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } })),
    }));
    for (const secret of [ENDPOINT, P256DH, AUTH]) assert.ok(!storage.getItem(pushKeyOf(ACCOUNT_A)).includes(secret), secret);
    assert.deepEqual(store.readGuardianPush(), expected);

    // null 을 돌려주면 기록을 지운다. 기록에 있던 구독은 불변식대로 서버 삭제 대기에 들어간다(예전에는 넣지 않았다: 검토 m1).
    // 없을 때는 null 을 받고, 지울 것이 없으면 알리지 않는다
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(event.topic));
    assert.deepEqual(store.updateGuardianPush(() => null), { ok: true, record: null });
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    assert.equal(store.readGuardianPush(), null);
    assert.deepEqual(topics, ['guardianPush']);
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1), unsub(2)]);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(
      store.updateGuardianPush((current) => {
        seen = current;
        return null;
      }),
      { ok: true, record: null },
    );
    assert.equal(seen, null);
    assert.equal(topics.length, 1);

    // 돌려준 값이 객체도 null 도 아니거나 updater 가 함수가 아니면 INVALID
    for (const bad of [undefined, 'x', 1, [record()]]) {
      assert.deepEqual(store.updateGuardianPush(() => bad), { ok: false, code: STORE_ERROR.INVALID }, String(bad));
    }
    assert.deepEqual(store.updateGuardianPush(record()), { ok: false, code: STORE_ERROR.INVALID });
    assert.equal(store.readGuardianPush(), null);

    // 보기 전용이면 READ_ONLY 이고 updater 를 부르지 않는다
    assert.deepEqual(store.updateGuardianPush(() => record()), { ok: true, record: normalizeGuardianPush(record()) });
    store.setOnline(false);
    let called = false;
    const blocked = store.updateGuardianPush(() => {
      called = true;
      return null;
    });
    assert.deepEqual(blocked, { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(called, false);
    assert.deepEqual(store.readGuardianPush().subs, [sub(1)]);
  });

  test('updateGuardianPush 는 쓰거나 지우지 못하면 STORAGE_FAILED 다', () => {
    let blocked = false;
    const storage = throwingStorage((key) => blocked && key === pushKeyOf(ACCOUNT_A), { removeToo: true });
    const { store } = setup({}, storage);
    store.writeGuardianPush(record());
    blocked = true;
    assert.deepEqual(store.updateGuardianPush((current) => ({ ...current, gone: [watchIdOf(9)] })), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.deepEqual(store.updateGuardianPush(() => null), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.deepEqual(store.readGuardianPush(), normalizeGuardianPush(record()));
  });
});

describe('구독 끄기와 서버 삭제 대기', () => {
  test('retireGuardianPushSub 는 기록에서 빼고 { watchId, subId } 를 대기에 넣어 DELETE /api/watch/subscribe 를 보낸다', async () => {
    const { storage, fake, store } = setup();
    store.writeGuardianPush({ subs: [sub(1), sub(2)], status: [statusOf(1)], gone: [watchIdOf(9)] });
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(event.topic));

    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    assert.deepEqual(store.readGuardianPush(), { subs: [sub(2)], status: [statusOf(1)], gone: [watchIdOf(9)] }, '오늘 상태와 gone 은 그대로다');
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1)]);
    assert.deepEqual(topics, ['guardianPush']);

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    const calls = fake.unsubscribes();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/watch/subscribe', '식별 값은 경로·쿼리에 없다');
    assert.deepEqual(Object.keys(calls[0].body), ['watchId', 'subId']);
    assert.deepEqual(calls[0].body, unsub(1));
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.ok(calls[0].init.signal, '시간 한도가 걸려 있다');
    assert.equal(fake.watchDeletes().length, 0);
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null, '비면 기기 키를 지운다');

    // 그 watchId 의 구독이 없으면 할 일이 없다(보낼 것이 남지 않아 queued 는 참). watchId 형식이 틀리면 INVALID
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(5)), { ok: true, queued: true });
    for (const bad of [undefined, null, 'bad', 7]) {
      assert.deepEqual(store.retireGuardianPushSub(bad), { ok: false, code: STORE_ERROR.INVALID }, String(bad));
    }
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(fake.unsubscribes().length, 1);

    // 보기 전용이면 끄지 않는다(화면의 끄기도 쓰기 가능할 때만이다)
    store.setOnline(false);
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(2)), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(store.readGuardianPush().subs, [sub(2)]);
    assert.deepEqual(store.readPendingServerDelete(), []);
  });

  test('retireGuardianPushSub 는 기다리지 않아도 해지를 스스로 보낸다', async () => {
    const { fake, store } = setup({ deleteStatus: () => 'hang' });
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1)], '끄기가 보냈다(retryPendingServerDelete 를 부르지 않았다)');
    fake.release();
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 }, '도는 약속을 함께 기다린다');
    assert.equal(fake.unsubscribes().length, 1, '다시 보내지 않는다');
  });

  test('쓰기 토큰과 subId 를 함께 가진 항목은 DELETE /api/watch 로 보내고, 끝난 뒤 저장소에 남아도 되살아나지 않는다', async () => {
    let blocked = false;
    const storage = throwingStorage((key) => blocked && key === DEVICE_KEY.pendingServerDelete, { removeToo: true });
    const { fake, store } = setup({}, storage);
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [{ ...unwatch(1), subId: subIdOf(1) }]);
    blocked = true; // 끝난 뒤 대기를 다시 쓰지도 지우지도 못한다
    assert.deepEqual(store.readPendingServerDelete(), [unwatch(1)]);

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(fake.watchDeletes().map((c) => c.body), [unwatch(1)]);
    assert.deepEqual(Object.keys(fake.watchDeletes()[0].body), ['watchId', 'writeToken']);
    assert.equal(fake.unsubscribes().length, 0, '구독 해지 경로로 보내지 않는다');
    assert.notEqual(storage.getItem(DEVICE_KEY.pendingServerDelete), null, '저장소에는 예전 목록이 남아 있다');
    assert.deepEqual(store.readPendingServerDelete(), [], '끝난 항목은 저장소 원문에서도 종류까지 맞춰 빠진다');
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.equal(fake.watchDeletes().length, 1, '다시 보내지 않는다');
  });

  test('기록을 쓰지 못하면 끄기는 STORAGE_FAILED 이고 대기에 넣지도 보내지도 않는다', async () => {
    let blocked = false;
    const storage = throwingStorage((key) => blocked && key === accountRecordKey(ACCOUNT_A, RECORD.guardianPush));
    const { fake, store } = setup({}, storage);
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    blocked = true;
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(1)), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.deepEqual(store.readGuardianPush().subs, [sub(1), sub(2)], '기록에 subId 가 남아 다시 끌 수 있다');
    assert.deepEqual(store.readPendingServerDelete(), []);
    await store.retryPendingServerDelete();
    assert.equal(fake.unsubscribes().length, 0);
  });

  test('해지가 200·404·400 이면 대기에서 빠지고 연결 실패·429·503 이면 남는다', async () => {
    const statuses = { 1: 200, 2: 404, 3: 400, 4: 'network', 5: 429, 6: 503, 7: 'off' };
    const bySubId = new Map(Object.entries(statuses).map(([n, status]) => [subIdOf(Number(n)), status]));
    const { fake, store } = setup({ deleteStatus: (body) => bySubId.get(body.subId) });
    store.writeGuardianPush(record({ subs: Object.keys(statuses).map((n) => sub(Number(n))) }));
    for (const n of Object.keys(statuses)) assert.deepEqual(store.retireGuardianPushSub(watchIdOf(Number(n))), { ok: true, queued: true });

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 4 });
    assert.equal(fake.unsubscribes().length, 7, '항목마다 하나씩');
    assert.deepEqual(store.readPendingServerDelete(), [4, 5, 6, 7].map(unsub));
    assert.deepEqual(store.readGuardianPush().subs, [], '기록에서는 바로 빠진다');

    // 다음 시도(온라인 복귀·앱 열기)에서 남은 것만 다시 보낸다
    fake.deleteStatus = () => 200;
    store.setOnline(false);
    store.setOnline(true);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(
      fake.unsubscribes().slice(7).map((c) => c.body.subId),
      [4, 5, 6, 7].map(subIdOf),
    );
  });

  test('구독 해지는 (watchId, subId) 로 겹침을 없앤다: 해지가 도는 동안 같은 지켜보기를 새 subId 로 켜고 끄면 둘 다 대기에 있다', async () => {
    let first = true;
    const { fake, store } = setup({
      deleteStatus: () => {
        if (!first) return 200;
        first = false;
        return 'hang';
      },
    });
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    store.retireGuardianPushSub(watchIdOf(1));
    const running = store.retryPendingServerDelete();
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1)]);

    // 해지가 도는 동안 같은 지켜보기를 새 subId 로 다시 켜고 다시 끈다: 서버의 다른 구독이라 둘 다 남는다(앞 해지가 실패해도 잃지 않는다)
    const renewed = { watchId: watchIdOf(1), subId: subIdOf(2) };
    store.writeGuardianPush(record({ subs: [sub(1, { subId: subIdOf(2) })] }));
    store.retireGuardianPushSub(watchIdOf(1));
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1), renewed]);

    fake.release();
    assert.deepEqual(await running, { remaining: 0 }, '끝난 기억은 subId 까지 본다: 앞 해지만 빠지고 새 subId 항목은 다음 차례로 나간다');
    assert.deepEqual(fake.unsubscribes().map((c) => c.body.subId), [subIdOf(1), subIdOf(2)]);
    assert.deepEqual(store.readPendingServerDelete(), []);
  });

  test('normalizePendingDelete 는 두 종류를 함께 두고 지켜보기 삭제는 watchId, 구독 해지는 (watchId, subId) 로 겹침을 없애며 합쳐 10개다', async () => {
    assert.equal(PENDING_DELETE_MAX, 10);
    const renewedWatch = { watchId: watchIdOf(1), writeToken: writeTokenOf(91) };
    const otherSub = { watchId: watchIdOf(1), subId: subIdOf(91) };
    const bad = [
      null,
      { watchId: 'bad', subId: subIdOf(3) },
      { watchId: watchIdOf(3), subId: 'bad' },
      { watchId: watchIdOf(3), writeToken: 'bad' },
      { watchId: watchIdOf(3) },
      { subId: subIdOf(3) },
    ];
    assert.deepEqual(
      normalizePendingDelete([unwatch(1), unsub(1), unwatch(2), ...bad, otherSub, renewedWatch, unsub(1)]),
      [unwatch(2), otherSub, renewedWatch, unsub(1)],
      '지켜보기 삭제는 같은 watchId 면 나중 것(새 토큰), 구독 해지는 같은 (watchId, subId) 만 하나(나중 자리)이고 subId 가 다르면 둘 다 남는다',
    );
    // 허용 목록 필드만: 쓰기 토큰이 맞으면 그 종류로 읽고(subId 를 버린다), 모르는 필드는 남기지 않는다
    assert.deepEqual(normalizePendingDelete([{ ...unwatch(4), subId: subIdOf(4), endpoint: ENDPOINT }]), [unwatch(4)]);
    assert.deepEqual(normalizePendingDelete([{ ...unsub(5), lang: 'ko', endpointHash: ENDPOINT_HASH }]), [unsub(5)]);
    assert.deepEqual(normalizePendingDelete([{ ...unsub(6), writeToken: 'bad' }]), [unsub(6)]);
    // 합쳐 10개를 넘으면 배열 자리와 무관하게 가장 오래된 구독 해지부터 버리고, 남은 항목은 순서를 지킨다
    const mixed = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? unwatch(i + 1) : unsub(i + 1)));
    assert.deepEqual(normalizePendingDelete(mixed), mixed.filter((_, i) => ![1, 3, 5, 7].includes(i)));
    // 구독 해지가 모자라면 그다음 가장 오래된 지켜보기 삭제를 버린다
    const laterWatches = Array.from({ length: 9 }, (_, i) => unwatch(i + 4));
    assert.deepEqual(normalizePendingDelete([unwatch(1), unwatch(2), unsub(3), ...laterWatches]), [unwatch(2), ...laterWatches]);
    // A-2 항목만 있는 대기는 예전처럼 오래된 것(앞)부터 버린다
    const a2Only = Array.from({ length: 12 }, (_, i) => unwatch(i + 1));
    assert.deepEqual(normalizePendingDelete(a2Only), a2Only.slice(-10));

    // 저장소: 섞인 대기의 각 항목을 제 경로로 보낸다. 쓰기 토큰 항목이 끝나도 같은 watchId 의 해지 항목은 남는다
    const { storage, fake, store } = setup({ deleteStatus: (body, url) => (url === WATCH_PATHS.watch ? 200 : 503) });
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [unwatch(1), unsub(1), unsub(2)]);
    assert.deepEqual(store.readPendingServerDelete(), [unwatch(1), unsub(1), unsub(2)]);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 2 });
    assert.deepEqual(fake.watchDeletes().map((c) => c.body), [unwatch(1)]);
    assert.deepEqual(fake.unsubscribes().map((c) => c.body).sort((a, b) => a.subId.localeCompare(b.subId)), [unsub(1), unsub(2)]);
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1), unsub(2)]);

    // 끄기 12번이면 대기에는 나중 10개만
    const capped = setup({ deleteStatus: () => 503 });
    for (let n = 1; n <= 12; n += 1) {
      capped.store.writeGuardianPush(record({ subs: [sub(n)] }));
      capped.store.retireGuardianPushSub(watchIdOf(n));
      await capped.store.retryPendingServerDelete();
    }
    assert.deepEqual(capped.store.readPendingServerDelete(), Array.from({ length: 10 }, (_, i) => unsub(i + 3)));
  });

  test('상한 차례: 구독 해지는 대기에 있던 지켜보기 삭제를 밀어내지 않는다', async () => {
    // 내 정보 지우기: 앞서 실패해 대기에 있던 지켜보기 삭제 하나 + 구독 10개
    const all = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    putRaw(all.storage, DEVICE_KEY.pendingServerDelete, [unwatch(30)]);
    all.store.writeGuardianPush(record({ subs: Array.from({ length: 10 }, (_, i) => sub(i + 1)) }));
    await all.store.deleteAllMyData();
    assert.deepEqual(all.store.readPendingServerDelete(), [unwatch(30), ...Array.from({ length: 9 }, (_, i) => unsub(i + 2))]);

    // 실패한 지켜보기 삭제 10개 + 끄기 하나: 지켜보기 삭제는 모두 남고 구독 해지가 버려진다
    const watches = Array.from({ length: 10 }, (_, i) => unwatch(i + 1));
    const ten = setup({ deleteStatus: () => 503 });
    putRaw(ten.storage, DEVICE_KEY.pendingServerDelete, watches);
    ten.store.writeGuardianPush(record({ subs: [sub(20)] }));
    assert.deepEqual(ten.store.retireGuardianPushSub(watchIdOf(20)), { ok: true, queued: false }, '화면이 상한에 밀린 것을 안다');
    assert.deepEqual(ten.store.readPendingServerDelete(), watches);
    assert.deepEqual(ten.store.readGuardianPush().subs, [], '기록에서는 빠진다');
    await ten.store.retryPendingServerDelete();
    assert.equal(ten.fake.unsubscribes().length, 0);

    // A-2 항목만 12개 있던 저장소는 예전과 같다(나중 10개)
    const old = setup({ deleteStatus: () => 503 });
    putRaw(old.storage, DEVICE_KEY.pendingServerDelete, Array.from({ length: 12 }, (_, i) => unwatch(i + 1)));
    assert.deepEqual(old.store.readPendingServerDelete(), Array.from({ length: 10 }, (_, i) => unwatch(i + 3)));
  });

  test('A-2 대기 항목만 있는 저장소는 그대로 읽히고 그대로 보낸다', async () => {
    const { storage, fake, store } = setup();
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [unwatch(1), unwatch(2)]);
    assert.deepEqual(store.readPendingServerDelete(), [unwatch(1), unwatch(2)]);
    assert.equal(store.readGuardianPush(), null);
    assert.equal(store.guardianPushElsewhere(), false);

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    const deletes = fake.watchDeletes();
    assert.deepEqual(deletes.map((c) => c.body), [unwatch(1), unwatch(2)]);
    for (const call of deletes) assert.deepEqual(Object.keys(call.body), ['watchId', 'writeToken']);
    assert.equal(fake.unsubscribes().length, 0, '해지 요청은 없다');
    assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null);
  });
});

describe('지우기 경로', () => {
  test('deleteAllMyData 는 모든 계정의 구독을 대기로 옮기고 남는 키는 언어, 로그아웃 보류, 서버 삭제 대기 셋뿐이다', async () => {
    const { storage, clock, fake, store } = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    store.writeLang('ja');
    store.writeGuardianPush({ subs: [sub(1), sub(2)], status: [statusOf(1)], gone: [watchIdOf(9)] });
    store.writeGuardianWatch(watchRecord(5));
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianPush(record({ subs: [sub(3)] }));

    const result = await store.deleteAllMyData();
    assert.equal(result.ok, true);
    assert.deepEqual(storageKeys(storage).sort(), [DEVICE_KEY.lang, DEVICE_KEY.logoutPending, DEVICE_KEY.pendingServerDelete].sort());
    const pending = store.readPendingServerDelete();
    const byKind = (kind) => pending.filter((item) => kind in item).map((item) => item.watchId).sort();
    assert.deepEqual(byKind('subId'), [1, 2, 3].map(watchIdOf));
    assert.deepEqual(byKind('writeToken'), [watchIdOf(5)]);
    // 구독마다 해지, 지켜보기마다 삭제를 보냈다(503 이라 남는다)
    assert.deepEqual(fake.unsubscribes().map((c) => c.body.subId).sort(), [1, 2, 3].map(subIdOf));
    assert.deepEqual(fake.watchDeletes().map((c) => c.body), [unwatch(5)]);
    // 대기에는 식별 값 말고 아무것도 없다
    const raw = storage.getItem(DEVICE_KEY.pendingServerDelete);
    for (const leak of [ENDPOINT_HASH, VAPID_KEY, ACCOUNT_A, ACCOUNT_B, '14:30', '"lang"']) assert.ok(!raw.includes(leak), leak);

    // 합쳐 10개를 넘으면 가장 오래된 구독 해지부터 버리고 마감을 담은 지켜보기 삭제는 남긴다
    const full = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    full.store.writeGuardianPush(record({ subs: Array.from({ length: 10 }, (_, i) => sub(i + 1)) }));
    full.store.writeGuardianWatch(watchRecord(20));
    await full.store.deleteAllMyData();
    const kept = full.store.readPendingServerDelete();
    assert.equal(kept.length, 10);
    assert.deepEqual(kept.at(-1), unwatch(20));
    assert.deepEqual(kept.slice(0, 9), Array.from({ length: 9 }, (_, i) => unsub(i + 2)));
  });

  test('두 계정이 같은 지켜보기를 다른 subId 로 구독했으면 내 정보 지우기가 둘 다 대기에 넣는다', async () => {
    const { clock, fake, store } = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianPush(record({ subs: [sub(1, { subId: subIdOf(2) })] }));
    await store.deleteAllMyData();
    const both = [unsub(1), { watchId: watchIdOf(1), subId: subIdOf(2) }];
    assert.deepEqual([...store.readPendingServerDelete()].sort(bySubId), both);
    assert.deepEqual(fake.unsubscribes().map((c) => c.body).sort(bySubId), both);
  });

  test('구독은 사본의 수명을 따른다: 환자이면서 보호자인 계정은 자기 체류가 자동 삭제돼도 친구 사본의 구독을 지킨다', async () => {
    const { storage, clock, fake, store } = setup({ deleteStatus: () => 503 });
    store.writeStay(makeStay()); // 자기 체류: 출국 2026-10-08
    store.writeGuardianCopy('friend', copyOf(2, '2026-10-20T23:59:00+09:00')); // 친구 B 의 사본
    store.writeGuardianPush({ subs: [sub(2)], status: [statusOf(2)], gone: [] });
    const before = storage.getItem(pushKeyOf(ACCOUNT_A));

    // 출국일 + 7일(2026-10-15)에 로그인하지 않은 채 앱을 연다: 자기 체류는 지워지고 친구 사본의 구독은 그대로다
    clock.ms = Date.parse('2026-10-15T08:00:00+09:00');
    const reopened = makeStore({ storage, clock, fake });
    assert.equal(reopened.getStatus().authenticated, false);
    assert.equal(reopened.onAppOpen().autoDeletedAccounts, 1);
    assert.equal(storage.getItem(accountRecordKey(ACCOUNT_A, RECORD.stay)), null);
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before, '구독 기록은 다시 쓰지도 않는다');
    assert.deepEqual(reopened.readPendingServerDelete(), []);
    assert.equal(fake.unsubscribes().length, 0);

    // 친구 사본이 만료된 뒤 앱을 열면 그때 옮긴다. 구독, status, gone 이 모두 비면 기록을 지운다
    clock.ms = Date.parse('2026-10-21T08:00:00+09:00');
    const later = makeStore({ storage, clock, fake });
    assert.equal(later.onAppOpen().expiredGuardianCopies, 1);
    assert.deepEqual(later.readPendingServerDelete(), [unsub(2)]);
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    assert.deepEqual(await later.retryPendingServerDelete(), { remaining: 1 });
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(2)], '앱 열기가 대기를 보낸다');

    // 체류 삭제(새 여행 시작)도 보호자 구독을 건드리지 않는다(보호자 사본처럼 체류 데이터가 아니다)
    const manual = setup({ deleteStatus: () => 503 });
    manual.store.writeStay(makeStay());
    manual.store.writeGuardianCopy('friend', copyOf(4));
    manual.store.writeGuardianPush(record({ subs: [sub(4)] }));
    assert.deepEqual(manual.store.deleteStay(), { ok: true });
    assert.deepEqual(manual.store.readGuardianPush().subs, [sub(4)]);
    assert.deepEqual(manual.store.readPendingServerDelete(), []);
  });

  test('보호자 전용 계정은 사본이 만료되면 앱 열기에서 로그인 없이 구독을 대기로 옮기고 그 지켜보기의 status·gone 을 지운다', async () => {
    const { storage, clock, fake, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianCopy('c1', copyOf(1, '2026-10-08T23:59:00+09:00'));
    store.writeGuardianCopy('c3', copyOf(3, '2026-10-20T23:59:00+09:00'));
    store.writeGuardianCopy('plain', { snapshot: {}, expiresAt: '2026-10-20T23:59:00+09:00' }); // 서버 알림 없이 보낸 링크
    store.writeGuardianPush({
      subs: [sub(1), sub(3), sub(4)], // 4: 어느 사본에도 없는 지켜보기
      status: [statusOf(1), statusOf(3), statusOf(5)],
      gone: [watchIdOf(1), watchIdOf(6)],
    });
    // 지금 읽는 계정은 B 다: 정리는 모든 계정 이름공간에서 돈다
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianPush(record({ subs: [sub(7)] }));

    clock.ms = Date.parse('2026-10-09T08:00:00+09:00'); // c1 만료, c3 는 살아 있다
    const reopened = makeStore({ storage, clock, fake });
    assert.equal(reopened.getStatus().authenticated, false);
    const topics = [];
    reopened.subscribe(RECORD.guardianPush, (event) => topics.push(event.accountKey));
    const result = reopened.onAppOpen();
    assert.equal(result.expiredGuardianCopies, 1);
    assert.equal(result.autoDeletedAccounts, 0);
    assert.deepEqual(reopened.readPendingServerDelete(), [unsub(1), unsub(4), unsub(7)]);
    assert.deepEqual(JSON.parse(storage.getItem(pushKeyOf(ACCOUNT_A))).data, { subs: [sub(3)], status: [statusOf(3)], gone: [] });
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_B)), null);
    assert.ok(topics.includes(ACCOUNT_B), '지금 읽는 계정의 구독 주제를 알린다');
    await reopened.retryPendingServerDelete();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1), unsub(4), unsub(7)]);

    // c3 도 만료되면 남은 구독을 옮기고 기록을 지운다
    clock.ms = Date.parse('2026-10-21T08:00:00+09:00');
    const last = makeStore({ storage, clock, fake });
    last.onAppOpen();
    assert.deepEqual(last.readPendingServerDelete(), [unsub(1), unsub(4), unsub(7), unsub(3)]);
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    await last.retryPendingServerDelete();
  });

  test('살아 있는 사본의 구독은 앱 열기에서 그대로이고 기록을 다시 쓰지 않는다', () => {
    const { storage, fake, store } = setup();
    store.writeGuardianCopy('c1', copyOf(1));
    store.writeGuardianCopy('c1-again', copyOf(1)); // 같은 지켜보기를 담은 사본이 둘
    store.writeGuardianCopy('c2', copyOf(2));
    store.writeGuardianPush({ subs: [sub(1), sub(2)], status: [statusOf(1)], gone: [watchIdOf(2)] });
    const before = storage.getItem(pushKeyOf(ACCOUNT_A));
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(event.topic));
    store.onAppOpen();
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before);
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.deepEqual(topics, []);
    assert.equal(fake.unsubscribes().length, 0);
  });

  test('사본을 지우면 그 사본만 담던 지켜보기의 구독을 바로 대기로 옮기고 보낸다', async () => {
    const { storage, fake, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianCopy('c1', copyOf(1));
    store.writeGuardianCopy('c1-again', copyOf(1));
    store.writeGuardianCopy('c2', copyOf(2));
    store.writeGuardianPush({ subs: [sub(1), sub(2)], status: [statusOf(2)], gone: [] });
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(event.topic));

    // 같은 지켜보기를 담은 사본이 남아 있으면 구독도 남는다
    assert.deepEqual(store.removeGuardianCopy('c1'), { ok: true });
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.deepEqual(store.readGuardianPush().subs, [sub(1), sub(2)]);
    assert.deepEqual(topics, []);

    assert.deepEqual(store.removeGuardianCopy('c2'), { ok: true });
    assert.deepEqual(store.readPendingServerDelete(), [unsub(2)], '다음 앱 열기를 기다리지 않는다');
    assert.deepEqual(store.readGuardianPush(), { subs: [sub(1)], status: [], gone: [] });
    assert.deepEqual(topics, ['guardianPush'], '화면이 다시 읽도록 구독 주제를 알린다');
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(2)], '사본 지우기가 해지를 보낸다');

    // 마지막 사본을 지우면 기록도 지운다
    assert.deepEqual(store.removeGuardianCopy('c1-again'), { ok: true });
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    assert.deepEqual(store.readPendingServerDelete(), [unsub(2), unsub(1)]);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 2 });

    // 보기 전용이면 사본도 구독도 그대로다
    store.writeGuardianCopy('c5', copyOf(5));
    store.writeGuardianPush(record({ subs: [sub(5)] }));
    store.setOnline(false);
    assert.deepEqual(store.removeGuardianCopy('c5'), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(store.readGuardianPush().subs, [sub(5)]);
    assert.equal(store.readPendingServerDelete().length, 2);
  });

  test('사본 지우기의 정리는 아직 지우지 않은 만료 사본을 살아 있는 것으로 보지 않는다', async () => {
    const { clock, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianCopy('c1', copyOf(1, '2026-10-08T23:59:00+09:00'));
    store.writeGuardianCopy('c2', copyOf(2));
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    clock.ms = Date.parse('2026-10-09T08:00:00+09:00'); // c1 은 만료됐지만 앱 열기·사본 읽기 전이라 저장소에 남아 있다
    signIn(store, clock);
    assert.deepEqual(store.removeGuardianCopy('c2'), { ok: true });
    assert.deepEqual([...store.readPendingServerDelete()].sort(bySubId), [unsub(1), unsub(2)]);
    assert.equal(store.readGuardianPush(), null);
    await store.retryPendingServerDelete();
  });

  test('구독 없이 status·gone 만 남은 항목도 그 지켜보기의 사본이 없으면 앱 열기에서 지운다', () => {
    const { fake, store } = setup();
    store.writeGuardianCopy('c1', copyOf(1));
    store.writeGuardianPush({ subs: [], status: [statusOf(1), statusOf(2)], gone: [watchIdOf(3)] });
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(`${event.topic}:${event.accountKey}`));
    store.onAppOpen();
    assert.deepEqual(store.readGuardianPush(), { subs: [], status: [statusOf(1)], gone: [] });
    assert.deepEqual(topics, [`guardianPush:${ACCOUNT_A}`], 'status·gone 만 바뀌어도 화면이 다시 읽도록 주제를 알린다');
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(fake.unsubscribes().length, 0);

    // 남은 status 의 사본도 지우면 기록을 지우고 그때도 알린다
    assert.deepEqual(store.removeGuardianCopy('c1'), { ok: true });
    assert.equal(store.readGuardianPush(), null);
    assert.deepEqual(topics, [`guardianPush:${ACCOUNT_A}`, `guardianPush:${ACCOUNT_A}`]);
    assert.deepEqual(store.readPendingServerDelete(), []);
  });

  test('지우기 경로는 구독의 다른 필드가 깨졌어도 watchId·subId 가 맞으면 대기에 넣는다', async () => {
    const broken = sub(1, { lang: 'fr' });
    // 끄기: 읽기에 보이지 않는 깨진 구독과 같은 watchId 의 다른 subId 를 모두 넣는다
    const off = setup({ deleteStatus: () => 503 });
    putRaw(off.storage, pushKeyOf(ACCOUNT_A), { subs: [broken, sub(2), sub(1, { subId: subIdOf(11) })], status: [], gone: [] });
    assert.deepEqual(off.store.readGuardianPush().subs, [sub(2), sub(1, { subId: subIdOf(11) })]);
    assert.deepEqual(off.store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    assert.deepEqual(off.store.readPendingServerDelete(), [unsub(1), { watchId: watchIdOf(1), subId: subIdOf(11) }]);
    assert.deepEqual(off.store.readGuardianPush().subs, [sub(2)]);
    assert.ok(!off.storage.getItem(pushKeyOf(ACCOUNT_A)).includes('"fr"'), '깨진 항목은 기록에서 빠진다');
    await off.store.retryPendingServerDelete();
    assert.deepEqual(off.fake.unsubscribes().map((c) => c.body).sort(bySubId), [unsub(1), { watchId: watchIdOf(1), subId: subIdOf(11) }]);

    // 내 정보 지우기: 다른 목록이 깨진 기록에서도 넣는다
    const all = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    putRaw(all.storage, pushKeyOf(ACCOUNT_A), { subs: [broken], status: 'x', gone: null, extra: 1 });
    await all.store.deleteAllMyData();
    assert.deepEqual(all.store.readPendingServerDelete(), [unsub(1)]);

    // 다른 계정 구독 판단: 식별 값이 맞으면 세고, watchId 나 subId 형식이 틀리면(서버에서 가리킬 수 없다) 세지 않는다
    const other = setup();
    putRaw(other.storage, pushKeyOf(ACCOUNT_B), { subs: [{ ...broken, subId: 'bad' }, { ...broken, watchId: 'bad' }] });
    assert.equal(other.store.guardianPushElsewhere(), false);
    putRaw(other.storage, pushKeyOf(ACCOUNT_B), { subs: [broken] });
    assert.equal(other.store.guardianPushElsewhere(), true);

    // 사본 수명 정리(앱 열기, 로그인 없이)
    const orphan = setup({ deleteStatus: () => 503 });
    putRaw(orphan.storage, pushKeyOf(ACCOUNT_A), { subs: [broken], status: [], gone: [] });
    const reopened = makeStore({ storage: orphan.storage, clock: orphan.clock, fake: orphan.fake });
    reopened.onAppOpen();
    assert.deepEqual(reopened.readPendingServerDelete(), [unsub(1)]);
    assert.equal(orphan.storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    await reopened.retryPendingServerDelete();
  });

  test('저장 공간이 꽉 찬 기기에서도 기록을 줄인 자리에 대기가 들어가고, 기록을 고치지 못해도 대기는 쓴다', async () => {
    // 사본 수명 정리: 기록을 먼저 줄이고 대기를 쓴다(대기를 먼저 쓰면 자리가 없어 저장소에 들어가지 못한다)
    const full = quotaStorage();
    const lifetime = setup({ deleteStatus: () => 503 }, full);
    lifetime.store.writeGuardianCopy('c2', copyOf(2));
    lifetime.store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    full.limit = full.used();
    const reopened = makeStore({ storage: full, clock: lifetime.clock, fake: lifetime.fake });
    reopened.onAppOpen();
    assert.deepEqual(storedPending(full), [unsub(1)], '대기가 저장소에 들어갔다');
    assert.deepEqual(reopened.readGuardianPush().subs, [sub(2)]);
    await reopened.retryPendingServerDelete();

    // 끄기도 같다
    const fullOff = quotaStorage();
    const off = setup({ deleteStatus: () => 503 }, fullOff);
    off.store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    fullOff.limit = fullOff.used();
    assert.deepEqual(off.store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    assert.deepEqual(storedPending(fullOff), [unsub(1)]);
    await off.store.retryPendingServerDelete();

    // 사본 수명 정리에서 기록을 고치지도 지우지도 못해도 대기는 쓴다. 기록에 남은 구독은 다음 앱 열기에 다시 옮긴다
    let blocked = false;
    const stuck = throwingStorage((key) => blocked && key === pushKeyOf(ACCOUNT_A), { removeToo: true });
    const kept = setup({ deleteStatus: () => 503 }, stuck);
    kept.store.writeGuardianPush(record({ subs: [sub(1)] }));
    blocked = true;
    const again = makeStore({ storage: stuck, clock: kept.clock, fake: kept.fake });
    again.onAppOpen();
    assert.deepEqual(storedPending(stuck), [unsub(1)]);
    assert.deepEqual(again.readGuardianPush().subs, [sub(1)], '기록에도 남는다');
    await again.retryPendingServerDelete();
  });

  test('guardianPushElsewhere 는 다른 계정 이름공간의 구독만 본다', async () => {
    const { clock, store } = setup();
    assert.equal(store.guardianPushElsewhere(), false);
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    assert.equal(store.guardianPushElsewhere(), false, '지금 계정의 구독은 세지 않는다');

    signIn(store, clock, ACCOUNT_B);
    const answer = store.guardianPushElsewhere();
    assert.equal(typeof answer, 'boolean', '값은 돌려주지 않는다');
    assert.equal(answer, true);
    assert.equal(store.readGuardianPush(), null, '다른 계정의 기록은 읽히지 않는다');

    // 다른 계정에 기록이 있어도 구독이 없으면(상태와 gone 만) 거짓
    signIn(store, clock, ACCOUNT_A);
    assert.deepEqual(store.retireGuardianPushSub(watchIdOf(1)), { ok: true, queued: true });
    store.writeGuardianPush({ subs: [], status: [statusOf(1)], gone: [watchIdOf(2)] });
    signIn(store, clock, ACCOUNT_B);
    assert.equal(store.guardianPushElsewhere(), false);
    // 보기 전용이어도 판단한다(읽기만 한다)
    store.writeGuardianPush(record({ subs: [sub(3)] }));
    signIn(store, clock, ACCOUNT_A);
    store.setOnline(false);
    assert.equal(store.guardianPushElsewhere(), true);
    store.setOnline(true);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
  });
});

describe('구독 기록 쓰기의 불변식(기록에서 빠진 subId 는 늘 대기로 간다)', () => {
  const INVALID = { ok: false, code: STORE_ERROR.INVALID };

  test('async updater 의 약속, then 이 있는 객체, 평범하지 않은 객체는 INVALID 이고 아무것도 쓰지 않는다', async () => {
    const { storage, fake, store } = setup();
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    const before = storage.getItem(pushKeyOf(ACCOUNT_A));
    const topics = [];
    store.subscribe(RECORD.guardianPush, (event) => topics.push(event.topic));

    // async updater: 약속을 빈 기록으로 읽으면 구독이 모두 빠진다
    assert.deepEqual(store.updateGuardianPush(async (current) => ({ ...current, subs: [] })), INVALID);
    // 프로토타입은 평범해도 then 이 있으면 약속처럼 다뤄질 값이다
    const thenable = { ...record({ subs: [] }), then: (resolve) => resolve(null) };
    assert.deepEqual(store.updateGuardianPush(() => thenable), INVALID);
    assert.deepEqual(store.writeGuardianPush(thenable), INVALID);
    assert.deepEqual(store.writeGuardianPush(Promise.resolve(record({ subs: [] }))), INVALID);
    // 평범하지 않은 객체: 클래스 인스턴스, Map, Date, 프로토타입을 물려받은 객체
    class PushRecord {
      constructor() {
        this.subs = [];
        this.status = [];
        this.gone = [];
      }
    }
    const odd = [new PushRecord(), new Map(), new Date(T0), Object.assign(Object.create({ inherited: true }), record({ subs: [] }))];
    for (const value of odd) {
      assert.deepEqual(store.updateGuardianPush(() => value), INVALID, value.constructor?.name ?? 'inherited');
      assert.deepEqual(store.writeGuardianPush(value), INVALID, value.constructor?.name ?? 'inherited');
    }

    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before, '쓰지 않았다');
    assert.deepEqual(topics, []);
    assert.deepEqual(store.readPendingServerDelete(), []);
    await tick();
    assert.equal(fake.unsubscribes().length, 0);

    // 프로토타입이 없는 객체는 평범한 객체로 받는다(같은 값이라 쓰지 않는다)
    const same = store.updateGuardianPush((current) => Object.assign(Object.create(null), current));
    assert.deepEqual(same, { ok: true, record: normalizeGuardianPush(record({ subs: [sub(1), sub(2)] })) });
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before);
  });

  test('updater 가 던지면(얼린 기록을 고치려 한 것, 던지는 getter 포함) INVALID 이고 쓰지 않으며 밖으로 던지지 않는다', async () => {
    const { storage, fake, store } = setup();
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    const before = storage.getItem(pushKeyOf(ACCOUNT_A));
    const throwing = [
      () => {
        throw new Error('boom');
      },
      (current) => {
        current.subs.push(sub(2)); // 얼린 값이라 TypeError
        return current;
      },
      (current) => {
        current.gone = [watchIdOf(1)];
        return current;
      },
      () => ({
        get subs() {
          throw new Error('getter');
        },
        status: [],
        gone: [],
      }),
    ];
    for (const updater of throwing) {
      let result;
      assert.doesNotThrow(() => {
        result = store.updateGuardianPush(updater);
      });
      assert.deepEqual(result, INVALID);
    }
    assert.doesNotThrow(() => {
      assert.deepEqual(
        store.writeGuardianPush({
          get subs() {
            throw new Error('getter');
          },
        }),
        INVALID,
      );
    });
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before);
    assert.deepEqual(store.readPendingServerDelete(), []);
    await tick();
    assert.equal(fake.unsubscribes().length, 0);
  });

  test('updater 는 원문이 아니라 정규화한 기록을 받는다', async () => {
    const { storage, store } = setup();
    const raw = {
      subs: [sub(1, { lang: 'vi' }), sub(2), { ...sub(3), endpoint: ENDPOINT }],
      status: [statusOf(2), { watchId: watchIdOf(2) }],
      gone: [watchIdOf(9), 'bad'],
      extra: 'x',
    };
    putRaw(storage, pushKeyOf(ACCOUNT_A), raw);
    let seen = null;
    store.updateGuardianPush((current) => {
      seen = current;
      return current;
    });
    assert.deepEqual(seen, normalizeGuardianPush(raw));
    assert.deepEqual(Object.keys(seen), ['subs', 'status', 'gone']);
    assert.deepEqual(seen.subs, [sub(2), sub(3)], '깨진 구독과 모르는 필드는 보이지 않는다');
    assert.ok(Object.isFrozen(seen) && Object.isFrozen(seen.subs[0]));
    // 그대로 돌려줘도 기록은 정규화한 값으로 다시 쓰이고, 정규화가 버린 깨진 구독은 대기로 간다(아래 m2)
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1)]);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
  });

  test('구독을 빠뜨린 updater, null, 통째로 쓰기는 빠진 subId 를 대기에 넣고 해지를 보낸다', async () => {
    // 펼치기를 잊은 updater: 구독이 모두 빠진다
    const forgot = setup({ deleteStatus: () => 503 });
    forgot.store.writeGuardianPush(record({ subs: [sub(1), sub(2), sub(3)], status: [statusOf(1)] }));
    const result = forgot.store.updateGuardianPush((current) => ({ status: [...current.status, statusOf(2)] }));
    assert.deepEqual(result, { ok: true, record: { subs: [], status: [statusOf(1), statusOf(2)], gone: [] } });
    assert.deepEqual(forgot.store.readPendingServerDelete(), [unsub(1), unsub(2), unsub(3)]);
    await tick();
    assert.deepEqual(forgot.fake.unsubscribes().map((c) => c.body), [unsub(1), unsub(2), unsub(3)], '쓰기가 해지를 보냈다');
    await forgot.store.retryPendingServerDelete();

    // null: 기록을 지우고 구독을 모두 넣는다
    const nulled = setup({ deleteStatus: () => 503 });
    nulled.store.writeGuardianPush({ subs: [sub(4), sub(5)], status: [statusOf(4)], gone: [watchIdOf(9)] });
    assert.deepEqual(nulled.store.updateGuardianPush(() => null), { ok: true, record: null });
    assert.equal(nulled.storage.getItem(pushKeyOf(ACCOUNT_A)), null);
    assert.deepEqual(nulled.store.readPendingServerDelete(), [unsub(4), unsub(5)]);
    await tick();
    assert.deepEqual(nulled.fake.unsubscribes().map((c) => c.body), [unsub(4), unsub(5)]);
    await nulled.store.retryPendingServerDelete();

    // 통째로 쓰기(writeGuardianPush)도 같다: 앞서 읽은 기록으로 덮어 빠진 구독은 서버에서도 꺼진다
    const whole = setup({ deleteStatus: () => 503 });
    whole.store.writeGuardianPush(record({ subs: [sub(6), sub(7)] }));
    assert.deepEqual(whole.store.writeGuardianPush(record({ subs: [sub(7)] })), { ok: true });
    assert.deepEqual(whole.store.readPendingServerDelete(), [unsub(6)]);
    await whole.store.retryPendingServerDelete();
    assert.deepEqual(whole.fake.unsubscribes().map((c) => c.body), [unsub(6)]);

    // 쓰지 못하면 기록이 그대로라 대기에도 넣지 않는다
    let blocked = false;
    const stuckStorage = throwingStorage((key) => blocked && key === pushKeyOf(ACCOUNT_A), { removeToo: true });
    const stuck = setup({ deleteStatus: () => 503 }, stuckStorage);
    stuck.store.writeGuardianPush(record({ subs: [sub(8)] }));
    blocked = true;
    assert.deepEqual(stuck.store.updateGuardianPush(() => null), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.deepEqual(stuck.store.updateGuardianPush((current) => ({ ...current, subs: [] })), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.deepEqual(stuck.store.readPendingServerDelete(), []);
  });

  test('404 로 그 watchId 를 gone 에 넣으며 빼면 대기에 넣지 않는다', async () => {
    const { fake, store } = setup();
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    const result = store.updateGuardianPush((current) => ({
      ...current,
      subs: current.subs.filter((item) => item.watchId !== watchIdOf(1)),
      gone: [...current.gone, watchIdOf(1)],
    }));
    assert.deepEqual(result, { ok: true, record: { subs: [sub(2)], status: [], gone: [watchIdOf(1)] } });
    assert.deepEqual(store.readPendingServerDelete(), []);
    // 통째로 쓰기도 같다
    assert.deepEqual(store.writeGuardianPush({ subs: [], status: [], gone: [watchIdOf(1), watchIdOf(2)] }), { ok: true });
    assert.deepEqual(store.readPendingServerDelete(), []);
    await tick();
    assert.equal(fake.unsubscribes().length, 0);
  });

  test('새 POST 로 같은 지켜보기의 subId 를 바꾸면 옛 subId 가 대기로 가고 서버의 404 로 끝난다', async () => {
    // 서버는 subId 가 지금 구독의 것일 때만 지운다(unsubscribeGuardian): 옛 subId 는 404
    const { fake, store } = setup({ deleteStatus: (body) => (body.subId === subIdOf(1) ? 404 : 200) });
    store.writeGuardianPush(record({ subs: [sub(1), sub(2)] }));
    const renewed = sub(1, { subId: subIdOf(51) });
    const result = store.updateGuardianPush((current) => ({
      ...current,
      subs: current.subs.map((item) => (item.watchId === watchIdOf(1) ? renewed : item)),
    }));
    assert.deepEqual(result.record.subs, [renewed, sub(2)]);
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1)], '옛 subId 만 대기로 간다');
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 }, '404 는 끝난 것으로 보고 대기에서 뺀다');
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1)]);
    assert.deepEqual(store.readGuardianPush().subs, [renewed, sub(2)], '새 구독은 그대로다');
  });

  test('살아 있는 지켜보기의 깨진 구독(모르는 언어)은 정리할 것이 없으면 원문 그대로이고, 다시 쓰는 길에서 빠지면 대기로 간다', async () => {
    const broken = sub(1, { lang: 'vi' }); // 예: 언어가 더 많은 판에서 구독한 뒤 되돌린 기기
    // 앱 열기: 사본이 모두 살아 있고 정리할 것이 없으면 다시 쓰지 않는다
    const { storage, fake, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianCopy('c1', copyOf(1));
    store.writeGuardianCopy('c2', copyOf(2));
    putRaw(storage, pushKeyOf(ACCOUNT_A), { subs: [broken, sub(2)], status: [], gone: [] });
    const before = storage.getItem(pushKeyOf(ACCOUNT_A));
    store.onAppOpen();
    assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before, '원문 그대로 남는다');
    assert.deepEqual(store.readPendingServerDelete(), []);

    // 앱 열기: 다른 지켜보기를 정리하며 기록을 다시 쓰면 정규화가 버린 깨진 구독도 대기로 간다
    putRaw(storage, pushKeyOf(ACCOUNT_A), { subs: [broken, sub(2), sub(3)], status: [], gone: [] }); // 3: 사본이 없다
    store.onAppOpen();
    assert.deepEqual(store.readPendingServerDelete(), [unsub(1), unsub(3)]);
    assert.deepEqual(store.readGuardianPush(), { subs: [sub(2)], status: [], gone: [] });
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1), unsub(3)]);
    await store.retryPendingServerDelete();

    // 다른 지켜보기 끄기, 상태 조회 반영(updateGuardianPush), 통째로 쓰기도 같다
    const paths = {
      retire: (s) => assert.deepEqual(s.retireGuardianPushSub(watchIdOf(2)), { ok: true, queued: true }),
      update: (s) => assert.equal(s.updateGuardianPush((current) => ({ ...current, status: [statusOf(2)] })).ok, true),
      write: (s) => assert.deepEqual(s.writeGuardianPush(record({ subs: [sub(2)] })), { ok: true }),
    };
    for (const [name, run] of Object.entries(paths)) {
      const one = setup({ deleteStatus: () => 503 });
      putRaw(one.storage, pushKeyOf(ACCOUNT_A), { subs: [broken, sub(2)], status: [], gone: [] });
      run(one.store);
      const pending = one.store.readPendingServerDelete();
      assert.ok(pending.some((item) => item.watchId === watchIdOf(1) && item.subId === subIdOf(1)), name);
      assert.ok(!one.storage.getItem(pushKeyOf(ACCOUNT_A)).includes('"vi"'), name);
      await one.store.retryPendingServerDelete();
    }

    // 같은 watchId 의 나중 항목에 밀린 구독, 10개 상한에 밀린 구독도 다시 쓸 때 대기로 간다
    const crowded = setup({ deleteStatus: () => 503 });
    const older = sub(1, { subId: subIdOf(41) });
    putRaw(crowded.storage, pushKeyOf(ACCOUNT_A), { subs: [sub(1), older, ...Array.from({ length: 10 }, (_, i) => sub(i + 2))] });
    crowded.store.updateGuardianPush((current) => ({ ...current, status: [statusOf(2)] }));
    assert.deepEqual(crowded.store.readPendingServerDelete(), [unsub(1), { watchId: watchIdOf(1), subId: subIdOf(41) }]);
    await crowded.store.retryPendingServerDelete();
  });

  test('retireGuardianPushSub 의 queued: 지켜보기 삭제 10개가 대기를 채웠으면 거짓, 구독 해지로 찼으면 가장 오래된 해지를 밀어내고 참', async () => {
    const watches = Array.from({ length: 10 }, (_, i) => unwatch(i + 1));
    const full = setup({ deleteStatus: () => 503 });
    putRaw(full.storage, DEVICE_KEY.pendingServerDelete, watches);
    full.store.writeGuardianPush(record({ subs: [sub(20), sub(21)] }));
    assert.deepEqual(full.store.retireGuardianPushSub(watchIdOf(20)), { ok: true, queued: false });
    assert.deepEqual(full.store.readPendingServerDelete(), watches);
    assert.deepEqual(full.store.readGuardianPush().subs, [sub(21)]);
    await full.store.retryPendingServerDelete();
    assert.equal(full.fake.unsubscribes().length, 0, '버려진 해지는 보내지 않는다');

    // 구독 해지로 찬 대기: 가장 오래된 해지를 밀어내고 새 해지는 남는다
    const olderSubs = Array.from({ length: 10 }, (_, i) => unsub(i + 30));
    const subsFull = setup({ deleteStatus: () => 503 });
    putRaw(subsFull.storage, DEVICE_KEY.pendingServerDelete, olderSubs);
    subsFull.store.writeGuardianPush(record({ subs: [sub(20)] }));
    assert.deepEqual(subsFull.store.retireGuardianPushSub(watchIdOf(20)), { ok: true, queued: true });
    assert.deepEqual(subsFull.store.readPendingServerDelete(), [...olderSubs.slice(1), unsub(20)]);
    await subsFull.store.retryPendingServerDelete();

    // 대기를 저장소에 쓰지 못해도 이 인스턴스의 메모리 대기에 있으면(보낸다) 참
    const memoryStorage = throwingStorage((key) => key === DEVICE_KEY.pendingServerDelete);
    const memory = setup({ deleteStatus: () => 503 }, memoryStorage);
    memory.store.writeGuardianPush(record({ subs: [sub(20)] }));
    assert.deepEqual(memory.store.retireGuardianPushSub(watchIdOf(20)), { ok: true, queued: true });
    assert.equal(memoryStorage.getItem(DEVICE_KEY.pendingServerDelete), null);
    assert.deepEqual(memory.store.readPendingServerDelete(), [unsub(20)]);
    await memory.store.retryPendingServerDelete();
    assert.deepEqual(memory.fake.unsubscribes().map((c) => c.body), [unsub(20)]);
  });

  test('앱 열기가 스스로 해지를 보낸다(다시 보내기를 따로 부르기 전에)', async () => {
    const { storage, clock, fake, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianCopy('c1', copyOf(1, '2026-10-08T23:59:00+09:00'));
    store.writeGuardianPush(record({ subs: [sub(1)] }));
    clock.ms = Date.parse('2026-10-09T08:00:00+09:00');
    const reopened = makeStore({ storage, clock, fake });
    reopened.onAppOpen();
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1)], 'retryPendingServerDelete 를 부르지 않았다');
    assert.deepEqual(reopened.readPendingServerDelete(), [unsub(1)], '503 이라 남는다');

    // 정리할 것이 없어도 지난 실행에서 남은 해지를 앱 열기가 보낸다
    await reopened.retryPendingServerDelete();
    const sentBefore = fake.unsubscribes().length;
    fake.deleteStatus = () => 200;
    const next = makeStore({ storage, clock, fake });
    next.onAppOpen();
    await tick();
    assert.deepEqual(fake.unsubscribes().slice(sentBefore).map((c) => c.body), [unsub(1)]);
    assert.deepEqual(await next.retryPendingServerDelete(), { remaining: 0 });
  });

  test('구독 기록이 객체가 아니면(문자, 목록, 숫자) 앱 열기가 던지지 않고 그대로 둔다', () => {
    for (const bad of ['x', [sub(1)], 7]) {
      const { storage, clock, fake, store } = setup();
      store.writeGuardianCopy('c1', copyOf(1, '2026-10-08T23:59:00+09:00'));
      putRaw(storage, pushKeyOf(ACCOUNT_A), bad);
      const before = storage.getItem(pushKeyOf(ACCOUNT_A));
      clock.ms = Date.parse('2026-10-09T08:00:00+09:00');
      const reopened = makeStore({ storage, clock, fake });
      let opened;
      assert.doesNotThrow(() => {
        opened = reopened.onAppOpen();
      }, JSON.stringify(bad));
      assert.equal(opened.expiredGuardianCopies, 1, '정리는 돌았다');
      assert.equal(storage.getItem(pushKeyOf(ACCOUNT_A)), before, JSON.stringify(bad));
      assert.equal(reopened.readGuardianPush(), null);
      assert.deepEqual(reopened.readPendingServerDelete(), []);
      assert.equal(fake.unsubscribes().length, 0);
    }
  });

  test('queueServerDelete({ watchId, subId }) 는 보기 전용에서도 받아 DELETE /api/watch/subscribe 로 보낸다', async () => {
    const { clock, fake, store } = setup();
    clock.ms += 13 * HOUR; // 세션 만료: 보기 전용
    assert.equal(store.getStatus().readOnly, true);
    assert.deepEqual(store.queueServerDelete(unsub(1)), { ok: true });
    await tick();
    const calls = fake.unsubscribes();
    assert.deepEqual(calls.map((c) => c.body), [unsub(1)]);
    assert.equal(calls[0].url, PUSH_PATHS.subscribe);
    assert.deepEqual(Object.keys(calls[0].body), ['watchId', 'subId']);
    assert.equal(fake.watchDeletes().length, 0, '지켜보기 삭제 경로로 보내지 않는다');
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });

    // 오프라인 보기 전용도 같다. 식별 값이 틀리면 INVALID
    store.setOnline(false);
    assert.deepEqual(store.queueServerDelete(unsub(2)), { ok: true });
    await tick();
    assert.deepEqual(fake.unsubscribes().map((c) => c.body), [unsub(1), unsub(2)]);
    for (const bad of [{ watchId: watchIdOf(3), subId: 'bad' }, { watchId: 'bad', subId: subIdOf(3) }, { subId: subIdOf(3) }]) {
      assert.deepEqual(store.queueServerDelete(bad), INVALID, JSON.stringify(bad));
    }
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
  });
});
