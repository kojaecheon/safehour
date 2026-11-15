// 기기 저장소의 서버 알림 레코드와 서버 삭제 대기 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 5, D3·D4·D11)
//
// 이 파일이 고정하는 것
//   - guardianWatch 는 계정 이름공간 레코드다. 형식이 틀리면 읽을 때 null 이다
//   - writeGuardianWatch 는 쓰기 가능할 때만. writeBackQueue 는 보기 전용 예외 하나이고 backQueue 만 바꾼다
//   - writeGuardianWatch 는 같은 watchId 의 저장된 backQueue 를 덮지 않는다(새로 만들 때만 받은 값을 쓴다)
//   - backQueue 20개, 서버 삭제 대기 10개 상한
//   - 서버 삭제 대기: 지켜보기마다 하나씩 동시에 보내고, 200·404·400 은 빼고 네트워크·429·503 은 남긴다. 겹쳐 불러도 요청은 하나
//   - 보내는 동안 들어온 항목은 남은 것이 없을 때까지 같은 호출의 다음 차례로 보낸다(차례는 대기 상한까지, 실패한 항목은
//     같은 호출에서 다시 보내지 않는다)
//   - 대기를 저장소에 쓰지 못해도 쓰기 토큰을 메모리에 남겨 보낸다. 끄기는 레코드를, 내 정보 지우기는 키를 지운 뒤 대기를 쓴다
//   - 끝난 삭제는 대기를 저장소에 다시 쓰지 못해도 이 인스턴스에서 되살아나지 않는다
//   - 지우기 경로: 서버 알림 끄기, 내 정보 지우기, 출국 7일 뒤 자동 삭제, 체류 삭제, 민감정보 동의 철회
//
// 저장소는 메모리, 시계와 fetch 는 주입한다. 외부 호출은 없다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACK_QUEUE_MAX,
  CONFIRMED_MAX,
  PENDING_DELETE_MAX,
  normalizeBackQueue,
  normalizeConfirmed,
  normalizeGuardianWatch,
  normalizePendingDelete,
} from '../lib/store/guardianWatch.js';
import {
  DEVICE_KEY,
  RECORD,
  SCHEMA_VERSION,
  STORE_ERROR,
  STORE_PREFIX,
  accountRecordKey,
  createMemoryStorage,
  createStore,
} from '../lib/store/index.js';
import { WATCH_PATHS } from '../src/guardian/watchRequests.js';
import { makeStay } from './stay-fixtures.js';

const ACCOUNT_A = 'acct_guardian_watch_a_0001';
const ACCOUNT_B = 'acct_guardian_watch_b_0002';
const HOUR = 3600_000;
/** 2026-10-02 12:00 KST: 테스트 체류(10-01 ~ 10-08) 중간 */
const T0 = Date.parse('2026-10-02T12:00:00+09:00');

/** 형식에 맞는 서로 다른 식별 값 (테스트 전용) */
function idsOf(n) {
  return { watchId: `W${String(n).padStart(21, '0')}`, writeToken: `T${String(n).padStart(42, '0')}` };
}

function watchRecord(n = 1, overrides = {}) {
  return {
    ...idsOf(n),
    expiresOn: '2026-10-08',
    lastUploaded: { '2026-10-02': ['14:30', '18:00'], '2026-10-03': [] },
    uploadPending: false,
    backQueue: [],
    confirmed: [],
    state: 'ON',
    ...overrides,
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * 받은 요청을 쌓는 가짜 fetch. 로그아웃은 logoutStatus, 지켜보기 삭제는 deleteStatus(watchId) 로 답한다.
 * 상태가 'network' 면 연결 실패, 'hang' 이면 release() 를 부를 때까지 기다린다.
 */
function fakeFetch({ logoutStatus = 200, deleteStatus = () => 200 } = {}) {
  const calls = [];
  const waiting = [];
  const respond = (status, body) => {
    if (status === 'network') throw new TypeError('fetch failed');
    if (status === 503) return json(503, { ok: false, errorCode: body ?? 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' });
    return json(status, status >= 200 && status < 300 ? { ok: true } : { ok: false, errorCode: `CODE_${status}` });
  };
  const fetchImpl = async (url, init = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, body, init });
    if (url === '/api/auth/logout') return respond(fake.logoutStatus);
    if (url === WATCH_PATHS.watch && init.method === 'DELETE') {
      const status = fake.deleteStatus(body?.watchId);
      if (status === 'hang') return new Promise((resolve) => waiting.push(() => resolve(json(200, { ok: true }))));
      if (status === 'off') return respond(503, 'SAFEHOUR_SERVER_PUSH_OFF');
      return respond(status);
    }
    return json(404, { ok: false });
  };
  const fake = {
    calls,
    fetchImpl,
    logoutStatus,
    deleteStatus,
    deletes: () => calls.filter((c) => c.url === WATCH_PATHS.watch && c.method === 'DELETE'),
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
function setup(fakeOptions) {
  const storage = createMemoryStorage();
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

/** 고른 키의 setItem 이 던지는 저장소(쓰기 막힘 흉내) */
function throwingStorage(shouldThrow) {
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
    removeItem: (key) => inner.removeItem(key),
    clear: () => inner.clear(),
  };
}

/** 쓴 글자 수가 capacity 를 넘으면 setItem 이 던지는 저장소(할당량 초과 흉내) */
function quotaStorage() {
  const inner = createMemoryStorage();
  const used = () => {
    let total = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const key = inner.key(i);
      total += key.length + inner.getItem(key).length;
    }
    return total;
  };
  const storage = {
    capacity: Infinity,
    used,
    get length() {
      return inner.length;
    },
    key: (index) => inner.key(index),
    getItem: (key) => inner.getItem(key),
    setItem(key, value) {
      const previous = inner.getItem(key);
      const next = used() - (previous === null ? 0 : key.length + previous.length) + key.length + String(value).length;
      if (next > storage.capacity) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key),
    clear: () => inner.clear(),
  };
  return storage;
}

describe('guardianWatch 레코드', () => {
  test('guardianWatch 는 계정 이름공간 레코드이고 형식이 틀리면 읽을 때 null 이다', () => {
    const { storage, clock, store } = setup();
    assert.equal(RECORD.guardianWatch, 'guardianWatch');
    assert.equal(accountRecordKey(ACCOUNT_A, RECORD.guardianWatch), `safehour.v2.${ACCOUNT_A}.guardianWatch`);
    assert.equal(store.readGuardianWatch(), null);

    assert.deepEqual(store.writeGuardianWatch(watchRecord(1)), { ok: true });
    assert.deepEqual(store.readGuardianWatch(), watchRecord(1));
    assert.equal(store.readGuardianWatch(), store.readGuardianWatch(), '바뀌지 않았으면 같은 참조다');
    assert.ok(Object.isFrozen(store.readGuardianWatch()));

    // 다른 계정은 보지 못한다
    signIn(store, clock, ACCOUNT_B);
    assert.equal(store.readGuardianWatch(), null);
    signIn(store, clock, ACCOUNT_A);
    assert.equal(store.readGuardianWatch().watchId, idsOf(1).watchId);

    const key = accountRecordKey(ACCOUNT_A, RECORD.guardianWatch);
    const broken = [
      'not-an-object',
      [],
      { ...watchRecord(1), watchId: idsOf(1).watchId.slice(1) },
      { ...watchRecord(1), writeToken: 'short' },
      { ...watchRecord(1), expiresOn: '2026-10-32' },
      { ...watchRecord(1), state: 'OFF' },
      { ...watchRecord(1), uploadPending: 'yes' },
      { ...watchRecord(1), lastUploaded: [] },
      { ...watchRecord(1), lastUploaded: { '2026-2-1': ['14:30'] } },
      { ...watchRecord(1), lastUploaded: { '2026-10-02': ['24:00'] } },
      { ...watchRecord(1), lastUploaded: { '2026-10-02': '14:30' } },
      { ...watchRecord(1), backQueue: 'none' },
      { ...watchRecord(1), watchId: undefined },
    ];
    for (const value of broken) {
      putRaw(storage, key, value);
      assert.equal(store.readGuardianWatch(), null, JSON.stringify(value));
      assert.equal(normalizeGuardianWatch(value), null, JSON.stringify(value));
    }
    storage.setItem(key, '{not json');
    assert.equal(store.readGuardianWatch(), null);
  });

  test('정규화는 허용 목록 필드만 남기고 시각을 정렬한다', () => {
    const value = {
      ...watchRecord(1, { lastUploaded: { '2026-10-02': ['18:00', '14:30', '18:00'] } }),
      lat: 37.5,
      conditions: { diet: 'x' },
      backQueue: [{ date: '2026-10-02', by: '14:30', undo: false, place: 'x' }, { date: 'bad', by: '14:30', undo: false }, { date: '2026-10-02', by: '18:00', undo: 'no' }],
      confirmed: [{ date: '2026-10-02', by: '12:00', atMs: T0, place: 'x' }, { date: '2026-10-02', by: '13:00' }],
    };
    // confirmed 가 생기면서 정규화 결과에 confirmed 가 늘 있다(이 시험은 예전에 confirmed 없는 모양을 고정했다).
    // 누른 시각이 없는 confirmed 항목은 버린다
    assert.deepEqual(normalizeGuardianWatch(value), {
      ...idsOf(1),
      expiresOn: '2026-10-08',
      lastUploaded: { '2026-10-02': ['14:30', '18:00'] },
      uploadPending: false,
      backQueue: [{ date: '2026-10-02', by: '14:30', undo: false }],
      confirmed: [{ date: '2026-10-02', by: '12:00', atMs: T0 }],
      state: 'ON',
    });
    assert.deepEqual(Object.keys(normalizeGuardianWatch(value)), ['watchId', 'writeToken', 'expiresOn', 'lastUploaded', 'uploadPending', 'backQueue', 'confirmed', 'state']);
    assert.equal(normalizeGuardianWatch(watchRecord(1, { state: 'REPLACED' })).state, 'REPLACED');
  });

  test('confirmed 와 대기열의 누른 시각: 이 필드가 없던 레코드도 읽히고, 틀린 항목만 버리며 20개를 넘지 않는다', () => {
    // confirmed 가 생기기 전에 쓴 레코드(필드 없음)와 목록이 아닌 값은 빈 목록이다. 레코드 전체를 버리지 않는다
    const legacy = watchRecord(1);
    delete legacy.confirmed;
    assert.deepEqual(normalizeGuardianWatch(legacy).confirmed, []);
    assert.deepEqual(normalizeGuardianWatch({ ...legacy, confirmed: 'x' }).confirmed, []);

    // 대기열 항목은 형식이 맞는 누른 시각만 싣는다(없어도 항목은 남는다)
    assert.deepEqual(normalizeBackQueue([
      { date: '2026-10-02', by: '14:30', undo: false, atMs: T0 },
      { date: '2026-10-02', by: '15:00', undo: false, atMs: -1 },
      { date: '2026-10-02', by: '16:00', undo: true, atMs: 1.5 },
      { date: '2026-10-02', by: '17:00', undo: true, atMs: '1' },
    ]), [
      { date: '2026-10-02', by: '14:30', undo: false, atMs: T0 },
      { date: '2026-10-02', by: '15:00', undo: false },
      { date: '2026-10-02', by: '16:00', undo: true },
      { date: '2026-10-02', by: '17:00', undo: true },
    ]);

    // 같은 (date, by)는 나중 것 하나, 틀린 항목은 버리고 상한을 넘으면 오래된 것(앞)부터 버린다
    assert.deepEqual(normalizeConfirmed([
      { date: '2026-10-02', by: '14:30', atMs: T0 },
      { date: '2026-10-02', by: '14:30', atMs: T0 + 1 },
      { date: '2026-10-02', by: '24:00', atMs: T0 },
      { date: '2026-10-02', by: '15:00', atMs: null },
      null,
    ]), [{ date: '2026-10-02', by: '14:30', atMs: T0 + 1 }]);
    const many = Array.from({ length: CONFIRMED_MAX + 3 }, (_, i) => ({ date: '2026-10-02', by: `1${Math.floor(i / 6)}:${(i % 6)}0`, atMs: T0 + i }));
    assert.equal(CONFIRMED_MAX, 20);
    assert.deepEqual(normalizeConfirmed(many), many.slice(-CONFIRMED_MAX));
    assert.deepEqual(normalizeConfirmed(undefined), []);
  });

  test('대기열 항목과 confirmed 는 누른 외출의 출발(departAt)을 형식이 맞을 때만 싣는다(없어도 항목은 남는다)', () => {
    assert.deepEqual(normalizeBackQueue([
      { date: '2026-10-02', by: '21:00', undo: false, atMs: T0, departAt: '12:41' },
      { date: '2026-10-02', by: '20:00', undo: false, atMs: T0, departAt: '24:00' },
      { date: '2026-10-02', by: '19:00', undo: false, departAt: null },
    ]), [
      { date: '2026-10-02', by: '21:00', undo: false, atMs: T0, departAt: '12:41' },
      { date: '2026-10-02', by: '20:00', undo: false, atMs: T0 },
      { date: '2026-10-02', by: '19:00', undo: false },
    ]);
    assert.deepEqual(normalizeConfirmed([
      { date: '2026-10-02', by: '21:00', atMs: T0, departAt: '12:41' },
      { date: '2026-10-02', by: '20:00', atMs: T0, departAt: 1241 },
    ]), [
      { date: '2026-10-02', by: '21:00', atMs: T0, departAt: '12:41' },
      { date: '2026-10-02', by: '20:00', atMs: T0 },
    ]);
    // 레코드를 읽어도 남는다
    const record = normalizeGuardianWatch(watchRecord(1, {
      backQueue: [{ date: '2026-10-02', by: '21:00', undo: false, atMs: T0, departAt: '12:41' }],
      confirmed: [{ date: '2026-10-02', by: '20:00', atMs: T0, departAt: '10:00' }],
    }));
    assert.equal(record.backQueue[0].departAt, '12:41');
    assert.equal(record.confirmed[0].departAt, '10:00');
  });

  test('writeGuardianWatch 는 쓰기 가능할 때만 되고 null 이면 지운다', () => {
    const { clock, fake, storage, store } = setup();
    const topics = [];
    store.subscribe(RECORD.guardianWatch, (event) => topics.push(event));

    assert.deepEqual(store.writeGuardianWatch(watchRecord(1)), { ok: true });
    assert.deepEqual(topics, [{ topic: 'guardianWatch', accountKey: ACCOUNT_A }]);
    // 같은 값이면 알리지 않는다
    assert.deepEqual(store.writeGuardianWatch(watchRecord(1)), { ok: true });
    assert.equal(topics.length, 1);
    // 형식이 틀리면 쓰지 않는다
    assert.deepEqual(store.writeGuardianWatch({ ...watchRecord(2), watchId: 'x' }), { ok: false, code: STORE_ERROR.INVALID });
    assert.equal(store.readGuardianWatch().watchId, idsOf(1).watchId);
    assert.equal(topics.length, 1);

    // 보기 전용: 오프라인, 세션 만료, 세션 없음
    store.setOnline(false);
    assert.deepEqual(store.writeGuardianWatch(watchRecord(2)), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.deepEqual(store.writeGuardianWatch(null), { ok: false, code: STORE_ERROR.READ_ONLY });
    store.setOnline(true);
    clock.ms += 13 * HOUR;
    assert.deepEqual(store.writeGuardianWatch(watchRecord(2)), { ok: false, code: STORE_ERROR.READ_ONLY });
    const noSession = makeStore({ storage, clock, fake });
    noSession.setSession({ authenticated: false });
    assert.equal(noSession.readGuardianWatch().watchId, idsOf(1).watchId, '보기 전용에서도 읽힌다');
    assert.deepEqual(noSession.writeGuardianWatch(watchRecord(2)), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(store.readGuardianWatch().watchId, idsOf(1).watchId);

    // null 이면 지운다
    signIn(store, clock);
    assert.deepEqual(store.writeGuardianWatch(null), { ok: true });
    assert.equal(store.readGuardianWatch(), null);
    assert.equal(storage.getItem(accountRecordKey(ACCOUNT_A, RECORD.guardianWatch)), null);
    assert.equal(topics.at(-1).topic, 'guardianWatch');
    // 지울 것이 없으면 그대로 성공
    assert.deepEqual(store.writeGuardianWatch(null), { ok: true });
    // 서버 삭제 대기에 넣지 않는다(지켜보기를 끄는 길은 retireGuardianWatch 다)
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(fake.deletes().length, 0);
  });
});

describe('돌아왔어요 대기열 (보기 전용 예외)', () => {
  const queue = [
    { date: '2026-10-02', by: '14:30', undo: false },
    { date: '2026-10-02', by: '18:00', undo: true },
  ];

  test('보기 전용(오프라인, 세션 만료, 세션 없음)에서도 writeBackQueue 는 되고 다른 필드는 그대로다', () => {
    for (const mode of ['offline', 'expired', 'noSession']) {
      const { storage, clock, fake, store } = setup();
      store.writeGuardianWatch(watchRecord(1));
      let target = store;
      if (mode === 'offline') store.setOnline(false);
      if (mode === 'expired') clock.ms += 13 * HOUR;
      if (mode === 'noSession') {
        target = makeStore({ storage, clock, fake });
        target.setSession({ authenticated: false });
      }
      assert.equal(target.getStatus().readOnly, true, mode);
      assert.equal(target.writeGuardianWatch(watchRecord(1, { uploadPending: true })).code, STORE_ERROR.READ_ONLY, mode);

      const topics = [];
      target.subscribe(RECORD.guardianWatch, (event) => topics.push(event.topic));
      // 대기열 항목에 다른 필드를 섞어 넘겨도 대기열만 바뀐다
      const sneaky = queue.map((item) => ({ ...item, lastUploaded: { '2026-10-02': [] }, watchId: idsOf(9).watchId, state: 'REPLACED' }));
      assert.deepEqual(target.writeBackQueue(sneaky), { ok: true }, mode);
      assert.deepEqual(target.readGuardianWatch(), { ...watchRecord(1), backQueue: queue }, mode);
      assert.deepEqual(topics, ['guardianWatch'], mode);

      // 레코드 모양을 흉내 낸 값은 받지 않는다
      const fakeRecord = { ...watchRecord(1), lastUploaded: { '2026-10-02': [] }, backQueue: [] };
      assert.deepEqual(target.writeBackQueue(fakeRecord), { ok: false, code: STORE_ERROR.INVALID }, mode);
      assert.deepEqual(target.readGuardianWatch().lastUploaded, watchRecord(1).lastUploaded, mode);
      assert.deepEqual(target.readGuardianWatch().backQueue, queue, mode);
    }
  });

  test('writeBackQueue 는 레코드나 계정 키가 없으면(로그아웃 보류 포함) 실패한다', async () => {
    const { storage, clock, fake, store } = setup();
    // 레코드 없음
    assert.deepEqual(store.writeBackQueue(queue), { ok: false, code: STORE_ERROR.NO_GUARDIAN_WATCH });
    // 계정 키 없음(이 기기에 로그인한 적 없음)
    const fresh = makeStore({ storage: createMemoryStorage(), clock, fake });
    assert.equal(fresh.getStatus().accountKey, null);
    assert.deepEqual(fresh.writeBackQueue(queue), { ok: false, code: STORE_ERROR.READ_ONLY });
    // 잠긴 인스턴스(서버 렌더링)
    const locked = makeStore({ storage, clock, fake, locked: true });
    assert.deepEqual(locked.writeBackQueue(queue), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(locked.readGuardianWatch(), null);
    // 로그아웃 보류: 오프라인에서 내 정보 지우기
    store.writeGuardianWatch(watchRecord(1));
    fake.logoutStatus = 'network';
    fake.deleteStatus = () => 'network';
    await store.deleteAllMyData();
    assert.equal(store.getStatus().logoutPending, true);
    assert.deepEqual(store.writeBackQueue(queue), { ok: false, code: STORE_ERROR.READ_ONLY });
  });

  test('backQueue 는 20개, 삭제 대기는 10개를 넘지 않는다', async () => {
    assert.equal(BACK_QUEUE_MAX, 20);
    assert.equal(PENDING_DELETE_MAX, 10);
    const { store, fake } = setup({ deleteStatus: () => 503 });
    store.writeGuardianWatch(watchRecord(1));
    const long = Array.from({ length: 25 }, (_, i) => ({ date: '2026-10-02', by: `${String(9 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`, undo: false }));
    assert.deepEqual(store.writeBackQueue(long), { ok: true });
    assert.deepEqual(store.readGuardianWatch().backQueue, long.slice(-20), '오래된 것(앞)부터 버린다');
    assert.deepEqual(normalizeBackQueue(long), long.slice(-20));
    assert.deepEqual(normalizeBackQueue('x'), []);

    // 지켜보기 12개를 차례로 끄면 오래된 2개를 버린다
    for (let n = 1; n <= 12; n += 1) {
      store.writeGuardianWatch(watchRecord(n));
      assert.deepEqual(store.retireGuardianWatch(), { ok: true });
      await store.retryPendingServerDelete();
    }
    const pending = store.readPendingServerDelete();
    assert.equal(pending.length, 10);
    assert.deepEqual(pending, Array.from({ length: 10 }, (_, i) => idsOf(i + 3)));
    assert.ok(fake.deletes().length >= 12);

    // 같은 watchId 는 하나만, 나중 것(새 토큰)을 남긴다
    const renewed = { watchId: idsOf(1).watchId, writeToken: idsOf(99).writeToken };
    assert.deepEqual(normalizePendingDelete([idsOf(1), idsOf(2), renewed, { watchId: 'bad', writeToken: 'bad' }]), [idsOf(2), renewed]);
  });
});

describe('서버 삭제 대기', () => {
  test('retireGuardianWatch: 레코드를 지우고 대기에 넣고 DELETE 를 보낸다. 본문은 watchId, writeToken 뿐이다', async () => {
    const { storage, fake, store } = setup();
    store.writeGuardianWatch(watchRecord(1, { backQueue: [{ date: '2026-10-02', by: '14:30', undo: false }] }));
    const topics = [];
    store.subscribe(RECORD.guardianWatch, (event) => topics.push(event.topic));

    assert.deepEqual(store.retireGuardianWatch(), { ok: true });
    assert.equal(store.readGuardianWatch(), null);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(1)]);
    assert.deepEqual(topics, ['guardianWatch']);

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    const deletes = fake.deletes();
    assert.equal(deletes.length, 1);
    assert.deepEqual(Object.keys(deletes[0].body), ['watchId', 'writeToken']);
    assert.deepEqual(deletes[0].body, idsOf(1));
    assert.equal(deletes[0].url, '/api/watch', '식별 값은 경로·쿼리에 없다');
    assert.equal(deletes[0].init.credentials, 'same-origin');
    assert.ok(deletes[0].init.signal, '시간 한도가 걸려 있다');
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null, '비면 기기 키를 지운다');

    // 레코드가 없으면 할 일이 없다
    assert.deepEqual(store.retireGuardianWatch(), { ok: true });
    // 보기 전용이면 끄지 않는다
    store.writeGuardianWatch(watchRecord(2));
    store.setOnline(false);
    assert.deepEqual(store.retireGuardianWatch(), { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(store.readGuardianWatch().watchId, idsOf(2).watchId);
  });

  test('queueServerDelete: 레코드 없는 지켜보기 한 쌍을 대기에 넣고 DELETE 를 보낸다. 보기 전용이어도 넣는다', async () => {
    const { fake, store } = setup({ deleteStatus: () => 503 });
    store.writeGuardianWatch(watchRecord(1));
    assert.deepEqual(store.queueServerDelete(idsOf(5)), { ok: true });
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(5)]);
    assert.equal(store.readGuardianWatch().watchId, idsOf(1).watchId, '이 계정의 레코드는 건드리지 않는다');
    await store.retryPendingServerDelete();
    assert.deepEqual(fake.deletes()[0].body, idsOf(5));
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(5)], '503 이면 남는다');

    // 삭제는 쓰기 토큰으로 인증하므로 보기 전용(오프라인)이어도 넣는다
    store.setOnline(false);
    assert.deepEqual(store.queueServerDelete(idsOf(6)), { ok: true });
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(5), idsOf(6)]);

    // 식별 값이 틀리면 넣지 않는다
    for (const bad of [null, {}, { watchId: 'bad', writeToken: 'bad' }, { watchId: idsOf(7).watchId }]) {
      assert.deepEqual(store.queueServerDelete(bad), { ok: false, code: STORE_ERROR.INVALID }, JSON.stringify(bad));
    }
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(5), idsOf(6)]);

    // 잠긴 인스턴스(서버 렌더링)는 아무것도 하지 않는다
    const locked = makeStore({ storage: createMemoryStorage(), clock: { ms: T0 }, fake, locked: true });
    assert.deepEqual(locked.queueServerDelete(idsOf(8)), { ok: false, code: STORE_ERROR.READ_ONLY });
  });

  test('삭제 결과: 200·404·400 은 대기에서 빼고, 네트워크·429·503 은 남긴다', async () => {
    const statuses = { 1: 200, 2: 404, 3: 400, 4: 'network', 5: 429, 6: 503, 7: 'off' };
    const byWatchId = new Map(Object.entries(statuses).map(([n, status]) => [idsOf(Number(n)).watchId, status]));
    const { storage, fake, store } = setup({ deleteStatus: (watchId) => byWatchId.get(watchId) });
    putRaw(storage, DEVICE_KEY.pendingServerDelete, Object.keys(statuses).map((n) => idsOf(Number(n))));

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 4 });
    assert.equal(fake.deletes().length, 7);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(4), idsOf(5), idsOf(6), idsOf(7)]);

    // 다음 시도에서 남은 것만 다시 보낸다
    fake.deleteStatus = () => 200;
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(
      fake.deletes().slice(7).map((c) => c.body.watchId),
      [4, 5, 6, 7].map((n) => idsOf(n).watchId),
    );
  });

  test('같은 대기 비우기가 겹쳐 불려도 지켜보기마다 요청은 하나다', async () => {
    const { storage, fake, store } = setup({ deleteStatus: () => 'hang' });
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(1), idsOf(2), idsOf(3)]);

    const first = store.retryPendingServerDelete();
    const second = store.retryPendingServerDelete();
    store.setOnline(true);
    assert.equal(second, first, '이미 도는 중이면 같은 약속이다');
    await new Promise((resolve) => setImmediate(resolve));
    // 지켜보기마다 하나씩, 동시에 보냈다
    assert.deepEqual(fake.deletes().map((c) => c.body.watchId).sort(), [1, 2, 3].map((n) => idsOf(n).watchId));
    fake.release();
    assert.deepEqual(await first, { remaining: 0 });
    assert.equal(fake.deletes().length, 3);

    // 보내는 동안 더해진 항목은 그 차례에 지우지 않고, 같은 호출의 두 번째 차례에서 그 항목만 한 번 보낸다.
    // 거기서 실패해도(503) 같은 호출에서 다시 보내지 않는다
    fake.deleteStatus = () => 'hang';
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(4)]);
    const third = store.retryPendingServerDelete();
    await new Promise((resolve) => setImmediate(resolve));
    store.writeGuardianWatch(watchRecord(5));
    store.retireGuardianWatch();
    assert.equal(store.retryPendingServerDelete(), third, '끈 뒤에 기다리는 약속도 같은 약속이다');
    assert.deepEqual(fake.deletes().slice(3).map((c) => c.body.watchId), [idsOf(4).watchId]);
    fake.deleteStatus = () => 503;
    fake.release();
    assert.deepEqual(await third, { remaining: 1 });
    assert.deepEqual(fake.deletes().slice(3).map((c) => c.body.watchId), [idsOf(4).watchId, idsOf(5).watchId]);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(5)]);
  });

  test('보내는 중에 들어온 삭제는 남은 것이 없을 때까지 같은 호출의 다음 차례로 보낸다(두 번째 차례 중에 들어온 것도)', async () => {
    const hang = new Set([idsOf(1).watchId, idsOf(2).watchId]);
    const { storage, fake, store } = setup({ deleteStatus: (watchId) => (hang.has(watchId) ? 'hang' : 200) });
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(1)]);
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const sent = () => fake.deletes().map((c) => c.body.watchId);

    const running = store.retryPendingServerDelete();
    await tick();
    // 서버 알림 끄기를 기다리는 쪽은 자기 항목(2)이 시도된 뒤에 풀린다
    store.writeGuardianWatch(watchRecord(2));
    store.retireGuardianWatch();
    const awaited = store.retryPendingServerDelete();
    assert.equal(awaited, running);
    fake.release();
    for (let i = 0; i < 20 && sent().length < 2; i += 1) await tick();
    assert.deepEqual(sent(), [idsOf(1).watchId, idsOf(2).watchId]);

    // 두 번째 차례 중에 들어온 항목(3)도 이 호출의 세 번째 차례에서 보낸다. 예전에는 차례가 한 번만 더라 다음 호출로 넘겼고,
    // 그 사이에 끄기를 기다린 쪽(Task 7 retire)은 자기 항목의 시도를 보지 못했다
    store.writeGuardianWatch(watchRecord(3));
    store.retireGuardianWatch();
    fake.release();
    assert.deepEqual(await awaited, { remaining: 0 });
    assert.deepEqual(sent(), [1, 2, 3].map((n) => idsOf(n).watchId));
    assert.deepEqual(store.readPendingServerDelete(), []);
    // 남은 것이 없으니 다음 호출은 보내지 않는다
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.equal(fake.deletes().length, 3);
  });

  test('차례는 대기 상한(10)번까지이고, 실패한 항목은 같은 호출에서 다시 보내지 않는다', async () => {
    assert.equal(PENDING_DELETE_MAX, 10);
    // 삭제를 보낼 때마다(응답 전에) 다른 지켜보기 하나가 꺼져 대기에 들어온다(끝없이 들어오는 경우). 삭제는 모두 503 으로 실패한다
    const { fake, store } = setup();
    let next = 2;
    fake.deleteStatus = () => {
      queueMicrotask(() => {
        store.writeGuardianWatch(watchRecord(next));
        store.retireGuardianWatch();
        next += 1;
      });
      return 503;
    };
    store.writeGuardianWatch(watchRecord(1));
    store.retireGuardianWatch();
    const result = await store.retryPendingServerDelete();
    const sentIds = fake.deletes().map((c) => c.body.watchId);
    // 10차례에 하나씩: 1 ~ 10 을 한 번씩 보냈다. 열 번째 차례 중에 들어온 11 은 다음 호출로 넘긴다
    assert.deepEqual(sentIds, Array.from({ length: 10 }, (_, i) => idsOf(i + 1).watchId));
    assert.equal(new Set(sentIds).size, sentIds.length, '같은 호출에서 같은 항목을 두 번 보내지 않는다');
    // 대기는 10개 상한이라 가장 오래된 1 은 버렸다(서버 TTL 에 맡긴다)
    assert.deepEqual(store.readPendingServerDelete(), Array.from({ length: 10 }, (_, i) => idsOf(i + 2)));
    assert.deepEqual(result, { remaining: 10 });
  });

  test('온라인 복귀와 앱 열기가 대기를 다시 보낸다', async () => {
    const { storage, clock, fake, store } = setup({ deleteStatus: () => 'network' });
    store.writeGuardianWatch(watchRecord(1));
    store.setOnline(false);
    // 오프라인 보기 전용이면 끌 수 없으므로 대기는 직접 심는다
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(1)]);
    assert.equal(fake.deletes().length, 0);

    fake.deleteStatus = () => 200;
    store.setOnline(true);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.equal(fake.deletes().length, 1);

    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(2)]);
    const reopened = makeStore({ storage, clock, fake });
    reopened.onAppOpen();
    assert.deepEqual(await reopened.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(fake.deletes().map((c) => c.body.watchId), [idsOf(1).watchId, idsOf(2).watchId]);

    // 대기가 없으면 보내지 않는다
    reopened.onAppOpen();
    reopened.setOnline(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.deletes().length, 2);
  });
});

describe('backQueue 덮어쓰기 막기', () => {
  test('writeGuardianWatch 는 같은 watchId 의 저장된 backQueue 를 덮지 않는다(대기열은 writeBackQueue 로만)', () => {
    const { store } = setup();
    store.writeGuardianWatch(watchRecord(1));
    // 올리기를 보내기 전에 읽은 레코드
    const older = store.readGuardianWatch();
    // 그 사이 '돌아왔어요'를 눌렀다
    const queue = [{ date: '2026-10-02', by: '14:30', undo: false }];
    assert.deepEqual(store.writeBackQueue(queue), { ok: true });
    // 앞서 읽은 레코드로 올리기 결과를 쓴다
    assert.deepEqual(store.writeGuardianWatch({ ...older, uploadPending: true, lastUploaded: { '2026-10-02': ['18:00'] } }), { ok: true });
    const current = store.readGuardianWatch();
    assert.deepEqual(current.backQueue, queue);
    assert.equal(current.uploadPending, true);
    assert.deepEqual(current.lastUploaded, { '2026-10-02': ['18:00'] });
    // 다른 backQueue 를 넘겨도 저장된 것이 남는다
    store.writeGuardianWatch({ ...older, backQueue: [{ date: '2026-10-02', by: '18:00', undo: true }] });
    assert.deepEqual(store.readGuardianWatch().backQueue, queue);

    // 새로 만들 때(다른 watchId, 레코드 없음)만 받은 backQueue 를 쓴다
    store.writeGuardianWatch(watchRecord(2, { backQueue: [] }));
    assert.deepEqual(store.readGuardianWatch().backQueue, []);
    store.writeGuardianWatch(null);
    store.writeGuardianWatch(watchRecord(3, { backQueue: queue }));
    assert.deepEqual(store.readGuardianWatch().backQueue, queue);
  });

  test('confirmed 도 writeBackQueue 로만 바뀌고, 같은 watchId 다시 쓰기(다시 등록)에는 남고 다른 watchId 면 비어서 시작한다', () => {
    const { storage, clock, fake, store } = setup();
    store.writeGuardianWatch(watchRecord(1));
    const older = store.readGuardianWatch();
    const confirmed = [{ date: '2026-10-02', by: '14:30', atMs: T0 }];
    const queue = [{ date: '2026-10-02', by: '18:00', undo: true, atMs: T0 + 1 }];

    // 대기열과 confirmed 를 한 번에 쓴다. confirmed 를 넘기지 않으면 저장된 값 그대로다
    assert.deepEqual(store.writeBackQueue(queue, { confirmed }), { ok: true });
    assert.deepEqual(store.readGuardianWatch().confirmed, confirmed);
    assert.deepEqual(store.readGuardianWatch().backQueue, queue);
    assert.deepEqual(store.writeBackQueue([]), { ok: true });
    assert.deepEqual(store.readGuardianWatch().confirmed, confirmed);
    assert.deepEqual(store.writeBackQueue([], { confirmed: 'x' }), { ok: false, code: STORE_ERROR.INVALID });

    // 보기 전용(세션 없음)에서도 대기열처럼 쓴다
    const noSession = makeStore({ storage, clock, fake });
    noSession.setSession({ authenticated: false });
    assert.deepEqual(noSession.writeBackQueue([], { confirmed: [] }), { ok: true });
    assert.deepEqual(store.readGuardianWatch().confirmed, []);
    assert.deepEqual(store.writeBackQueue([], { confirmed }), { ok: true });

    // 앞서 읽은 레코드로 쓰거나, 같은 watchId 에 새 토큰으로 다시 등록해도(REPLACED 에서 켬) 저장된 confirmed 가 남는다
    store.writeGuardianWatch({ ...older, uploadPending: true, confirmed: [] });
    assert.deepEqual(store.readGuardianWatch().confirmed, confirmed);
    store.writeGuardianWatch({ ...older, state: 'REPLACED' });
    store.writeGuardianWatch({ ...older, writeToken: idsOf(7).writeToken, state: 'ON', backQueue: [], confirmed: [] });
    assert.equal(store.readGuardianWatch().writeToken, idsOf(7).writeToken);
    assert.deepEqual(store.readGuardianWatch().confirmed, confirmed);

    // 다른 watchId 는 받은 값(새 등록은 빈 목록)으로 시작한다
    store.writeGuardianWatch(watchRecord(2, { confirmed: [] }));
    assert.deepEqual(store.readGuardianWatch().confirmed, []);
  });
});

describe('삭제 대기 쓰기 실패', () => {
  test('삭제 대기를 저장소에 쓰지 못해도 쓰기 토큰을 메모리에 남기고 DELETE 를 보낸다', async () => {
    for (const status of [200, 404, 400]) {
      const storage = throwingStorage((key) => key === DEVICE_KEY.pendingServerDelete);
      const clock = { ms: T0 };
      const fake = fakeFetch({ deleteStatus: () => 'network' });
      const store = makeStore({ storage, clock, fake });
      signIn(store, clock);
      store.writeGuardianWatch(watchRecord(1));

      assert.deepEqual(store.retireGuardianWatch(), { ok: true });
      assert.equal(store.readGuardianWatch(), null);
      assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null, '저장소에는 쓰지 못했다');
      assert.deepEqual(store.readPendingServerDelete(), [idsOf(1)], '메모리에 남았다');
      assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 1 });
      assert.ok(fake.deletes().length >= 1);
      for (const call of fake.deletes()) assert.deepEqual(call.body, idsOf(1));

      // 다시 보내 끝나면(200·404·400) 메모리에서도 뺀다
      fake.deleteStatus = () => status;
      assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 }, String(status));
      assert.deepEqual(store.readPendingServerDelete(), [], String(status));
      const count = fake.deletes().length;
      assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
      assert.equal(fake.deletes().length, count, '끝난 것은 다시 보내지 않는다');
    }
  });

  test('서버 알림 끄기: 레코드를 먼저 지우고 대기를 쓴다(저장 공간이 꽉 차도 쓰기 토큰이 저장소에 남는다)', async () => {
    const storage = quotaStorage();
    const clock = { ms: T0 };
    const fake = fakeFetch({ deleteStatus: () => 'network' });
    const store = makeStore({ storage, clock, fake });
    signIn(store, clock);
    store.writeGuardianWatch(watchRecord(1));
    // 지금 쓴 만큼이 끝: 새 키를 하나도 더 쓸 수 없다
    storage.capacity = storage.used();
    assert.throws(() => storage.setItem(DEVICE_KEY.pendingServerDelete, '[]'));

    assert.deepEqual(store.retireGuardianWatch(), { ok: true });
    assert.equal(store.readGuardianWatch(), null);
    // 예전에는 대기를 먼저 쓰려다 실패해 쓰기 토큰이 메모리에만 남았다(새로 고치면 서버 기록을 지울 길이 없다)
    const raw = storage.getItem(DEVICE_KEY.pendingServerDelete);
    assert.ok(raw !== null, '지운 레코드 자리에 대기가 들어갔다');
    assert.deepEqual(JSON.parse(raw).data, [idsOf(1)]);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 1 });
    // 새로 고친 뒤(새 인스턴스)에도 대기가 남아 다시 보낸다
    fake.deleteStatus = () => 200;
    const reopened = makeStore({ storage, clock, fake });
    assert.deepEqual(reopened.readPendingServerDelete(), [idsOf(1)]);
    assert.deepEqual(await reopened.retryPendingServerDelete(), { remaining: 0 });
  });

  test('끝난 삭제는 대기를 저장소에 다시 쓰지 못해도 되살아나지 않는다(이 인스턴스가 끝난 항목을 기억한다)', async () => {
    let blocked = false;
    const storage = throwingStorage((key) => blocked && key === DEVICE_KEY.pendingServerDelete);
    const clock = { ms: T0 };
    const byWatchId = new Map([[idsOf(1).watchId, 200], [idsOf(2).watchId, 503]]);
    const fake = fakeFetch({ deleteStatus: (watchId) => byWatchId.get(watchId) });
    const store = makeStore({ storage, clock, fake });
    signIn(store, clock);
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(1), idsOf(2)]);
    blocked = true;

    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 1 });
    // 저장소에는 예전 목록이 그대로다(쓰지 못했다). 끝난 1 은 읽을 때 빠지고, 남은 2 는 메모리에서도 지킨다
    assert.deepEqual(JSON.parse(storage.getItem(DEVICE_KEY.pendingServerDelete)).data, [idsOf(1), idsOf(2)]);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(2)]);
    // 다음 호출은 남은 2 만 보낸다(예전에는 1 이 되살아나 다시 보냈다)
    await store.retryPendingServerDelete();
    assert.deepEqual(fake.deletes().map((c) => c.body.watchId), [1, 2, 2].map((n) => idsOf(n).watchId));
    // 새 항목은 그대로 대기에 들어간다
    store.writeGuardianWatch(watchRecord(3));
    store.retireGuardianWatch();
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(2), idsOf(3)]);
    await store.retryPendingServerDelete();
    byWatchId.set(idsOf(2).watchId, 200);
    byWatchId.set(idsOf(3).watchId, 200);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(store.readPendingServerDelete(), []);
  });

  test('끝난 삭제 기억은 watchId 와 쓰기 토큰을 함께 본다(같은 watchId 의 새 토큰 항목은 막지 않는다)', async () => {
    for (const blockAfterFirst of [false, true]) {
      let blocked = false;
      const storage = throwingStorage((key) => blocked && key === DEVICE_KEY.pendingServerDelete);
      const clock = { ms: T0 };
      const fake = fakeFetch({ deleteStatus: () => 200 });
      const store = makeStore({ storage, clock, fake });
      signIn(store, clock);
      const first = idsOf(1);
      const second = { watchId: first.watchId, writeToken: idsOf(7).writeToken };

      // W1/T1 을 끄고 지웠다(끝난 항목으로 기억한다)
      store.writeGuardianWatch(watchRecord(1));
      store.retireGuardianWatch();
      assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
      assert.deepEqual(fake.deletes().map((c) => c.body), [first]);
      // 저장소에 끝난 W1/T1 이 남은 경우(대기를 다시 쓰지 못한 기기)도 본다
      if (blockAfterFirst) {
        putRaw(storage, DEVICE_KEY.pendingServerDelete, [first]);
        blocked = true;
        assert.deepEqual(store.readPendingServerDelete(), [], '끝난 W1/T1 은 읽을 때 빠진다');
      }

      // 같은 watchId 에 다른 쓰기 토큰으로 다시 켜고 끈다
      store.writeGuardianWatch({ ...watchRecord(1), writeToken: second.writeToken });
      store.retireGuardianWatch();
      assert.deepEqual(store.readPendingServerDelete(), [second], String(blockAfterFirst));
      assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
      assert.deepEqual(fake.deletes().map((c) => c.body), [first, second], 'DELETE 는 새 토큰으로 나간다');
      assert.deepEqual(store.readPendingServerDelete(), []);
    }
  });

  test('내 정보 지우기: 지켜보기 식별 값을 먼저 모으고, 키를 지운 뒤 대기를 쓴다(저장 공간이 꽉 차도 저장소에 남는다)', async () => {
    const storage = quotaStorage();
    const clock = { ms: T0 };
    const fake = fakeFetch({ logoutStatus: 'network', deleteStatus: () => 'network' });
    const store = makeStore({ storage, clock, fake });
    signIn(store, clock);
    store.writeStay(makeStay());
    store.writeGuardianWatch(watchRecord(1));
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianWatch(watchRecord(2));
    // 지금 쓴 만큼이 끝: 새 키를 하나도 더 쓸 수 없다
    storage.capacity = storage.used();
    assert.throws(() => storage.setItem(DEVICE_KEY.pendingServerDelete, '[]'));

    const result = await store.deleteAllMyData();
    assert.equal(result.ok, true);
    const raw = storage.getItem(DEVICE_KEY.pendingServerDelete);
    assert.ok(raw !== null, '지운 뒤라 대기를 쓸 자리가 있다');
    assert.deepEqual(JSON.parse(raw).data.map((item) => item.watchId).sort(), [idsOf(1).watchId, idsOf(2).watchId]);
    assert.deepEqual(store.readPendingServerDelete().map((item) => item.watchId).sort(), [idsOf(1).watchId, idsOf(2).watchId]);
  });

  test('내 정보 지우기: 대기를 끝내 쓰지 못하면 메모리에 남겨 보내고, 끝나면 뺀다', async () => {
    let blocked = false;
    const storage = throwingStorage((key) => blocked && key === DEVICE_KEY.pendingServerDelete);
    const clock = { ms: T0 };
    const fake = fakeFetch({ logoutStatus: 200, deleteStatus: () => 503 });
    const store = makeStore({ storage, clock, fake });
    signIn(store, clock);
    putRaw(storage, DEVICE_KEY.pendingServerDelete, [idsOf(9)]);
    blocked = true;
    store.writeGuardianWatch(watchRecord(1));
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianWatch(watchRecord(2));

    await store.deleteAllMyData();
    assert.equal(store.readGuardianWatch(), null);
    // 저장소에 있던 대기(9)는 그대로이고, 새로 모은 것(1, 2)은 메모리에 있다
    assert.deepEqual(JSON.parse(storage.getItem(DEVICE_KEY.pendingServerDelete)).data, [idsOf(9)]);
    const expected = [1, 2, 9].map((n) => idsOf(n).watchId);
    assert.deepEqual(store.readPendingServerDelete().map((item) => item.watchId).sort(), expected);
    // 셋 다 DELETE 를 보냈다(503 이라 남는다)
    assert.deepEqual(fake.deletes().map((c) => c.body.watchId).sort(), expected);

    fake.deleteStatus = () => 200;
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.deepEqual(store.readPendingServerDelete(), []);
    assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null, '비면 기기 키를 지운다');
  });
});

describe('지우기 경로 (D11)', () => {
  test('내 정보 지우기: 모든 계정의 지켜보기를 대기로 옮기고 언어, 로그아웃 보류, 서버 삭제 대기 셋만 남긴다', async () => {
    const { storage, clock, fake, store } = setup({ logoutStatus: 500, deleteStatus: () => 503 });
    store.writeLang('ja');
    store.writeStay(makeStay());
    store.writeGuardianWatch(watchRecord(1));
    signIn(store, clock, ACCOUNT_B);
    store.writeGuardianWatch(watchRecord(2));

    const result = await store.deleteAllMyData();
    assert.equal(result.ok, true);
    assert.equal(result.loggedOut, false);
    assert.deepEqual(storageKeys(storage).sort(), [DEVICE_KEY.lang, DEVICE_KEY.logoutPending, DEVICE_KEY.pendingServerDelete].sort());
    assert.deepEqual(
      store.readPendingServerDelete().map((item) => item.watchId).sort(),
      [idsOf(1).watchId, idsOf(2).watchId],
    );
    // 로그아웃을 먼저 보내고, 그다음 지켜보기마다 삭제를 보냈다
    const urls = fake.calls.map((c) => `${c.method} ${c.url}`);
    assert.equal(urls[0], 'POST /api/auth/logout');
    assert.deepEqual(urls.slice(1).sort(), ['DELETE /api/watch', 'DELETE /api/watch']);
    // 대기에는 식별 값 둘 말고 아무것도 없다
    const raw = storage.getItem(DEVICE_KEY.pendingServerDelete);
    assert.ok(!raw.includes('14:30') && !raw.includes(ACCOUNT_A) && !raw.includes(ACCOUNT_B));
  });

  test('내 정보 지우기 중 오프라인이면 대기가 남고 다음 온라인에 보낸다', async () => {
    const { storage, fake, store } = setup({ logoutStatus: 'network', deleteStatus: () => 'network' });
    store.writeGuardianWatch(watchRecord(1));

    const result = await store.deleteAllMyData();
    assert.equal(result.loggedOut, false);
    assert.equal(store.getStatus().online, false);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(1)]);
    assert.equal(store.readGuardianWatch(), null);

    fake.logoutStatus = 200;
    fake.deleteStatus = () => 200;
    store.setOnline(true);
    assert.deepEqual(await store.retryPendingServerDelete(), { remaining: 0 });
    assert.equal(await store.retryPendingLogout(), true);
    assert.equal(storage.getItem(DEVICE_KEY.pendingServerDelete), null);
    assert.deepEqual(storageKeys(storage), []);
  });

  test('출국 7일 뒤 자동 삭제와 deleteStay 가 지켜보기를 대기로 옮긴다(로그인 없이도)', async () => {
    // 자동 삭제: 출국일 2026-10-08 + 7일 = 2026-10-15 (KST) 에 앱을 연다. 로그인하지 않은 채다
    const auto = setup({ deleteStatus: () => 503 });
    auto.store.writeStay(makeStay());
    auto.store.writeGuardianWatch(watchRecord(1));
    auto.clock.ms = Date.parse('2026-10-15T08:00:00+09:00');
    const reopened = makeStore({ storage: auto.storage, clock: auto.clock, fake: auto.fake });
    assert.equal(reopened.getStatus().authenticated, false);
    const opened = reopened.onAppOpen();
    assert.equal(opened.autoDeletedAccounts, 1);
    assert.equal(auto.storage.getItem(accountRecordKey(ACCOUNT_A, RECORD.guardianWatch)), null);
    assert.deepEqual(reopened.readPendingServerDelete(), [idsOf(1)]);
    assert.deepEqual(await reopened.retryPendingServerDelete(), { remaining: 1 });
    assert.equal(auto.fake.deletes().length, 1, '앱 열기가 대기를 보낸다');

    // deleteStay
    const manual = setup({ deleteStatus: () => 503 });
    manual.store.writeStay(makeStay());
    manual.store.writeGuardianWatch(watchRecord(2));
    assert.deepEqual(manual.store.deleteStay(), { ok: true });
    assert.equal(manual.store.readGuardianWatch(), null);
    assert.equal(manual.store.readStay(), null);
    assert.deepEqual(manual.store.readPendingServerDelete(), [idsOf(2)]);
    await manual.store.retryPendingServerDelete();
    assert.equal(manual.fake.deletes().length, 1);
  });

  test('민감정보 동의 철회가 지켜보기를 대기로 옮긴다', async () => {
    const { fake, store } = setup({ deleteStatus: () => 503 });
    store.writeStay(makeStay());
    store.writeGuardianWatch(watchRecord(1));

    // 보기 전용이면 철회도 지켜보기 정리도 하지 않는다
    store.setOnline(false);
    assert.equal(store.withdrawSensitiveConsent().code, STORE_ERROR.READ_ONLY);
    assert.equal(store.readGuardianWatch().watchId, idsOf(1).watchId);
    store.setOnline(true);
    await store.retryPendingServerDelete();
    assert.equal(fake.deletes().length, 0);

    const result = store.withdrawSensitiveConsent();
    assert.equal(result.ok, true);
    assert.equal(store.readConsent().sensitive, null);
    assert.equal(store.readGuardianWatch(), null);
    assert.deepEqual(store.readPendingServerDelete(), [idsOf(1)]);
    await store.retryPendingServerDelete();
    assert.deepEqual(fake.deletes().map((c) => c.body), [idsOf(1)]);
  });
});
