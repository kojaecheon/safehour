// 보호자 구독 실행기 (lib/notify/guardianPush.js · docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 5,
// 다르게 정한 것 2·3, 정한 값 4·5·7·8·9·10·11·12·13·14·16·27)
//
// 이 파일이 고정하는 것
//   - 켜기(turnOn)는 첫 await 전에 권한 요청을 시작하고, 설정, 준비 확인, 브라우저 구독 고르기, POST, 기록 순서다.
//     권한 답은 줄 밖에서 기다린다(열린 권한 창이 끄기·다시 맞추기·상태 조회를 막지 않는다)
//   - 준비 확인 답이 없으면 update 뒤 다시 묻고, 그래도 없으면 SW_NOT_READY 이며 브라우저 구독을 만들지 않는다
//   - 브라우저 구독은 기기에 하나다: 이 계정 기록과 맞거나 다른 계정이 쓰면 다시 쓰고, 아니면 unsubscribe 뒤 새로 만든다
//   - 결과마다 기록 변화가 정해져 있다(404 는 gone, 해지 없음). POST 가 실패하면 방금 만든 구독은 다른 구독이 없을 때만 지운다
//   - 끄기는 늘 서버 삭제 대기를 거친다. 대기 상한에 밀려 버려졌으면(queued 거짓) 한 번 직접 보낸다
//   - 저절로 구독하지 않는다: VAPID 키가 바뀌거나 브라우저 구독이 없으면 renewNeeded, MOVED 도 버튼으로만 다시 받는다.
//     MOVED 인 구독은 언어·해시가 바뀌어도 다시 POST 하지 않고 다시 켜기도 건너뛴다. 다시 맞추기는 다시 POST 전에 상태를 먼저
//     묻고(다른 휴대폰이 가져갔으면 보내지 않는다), 조회가 실패하면 그 지켜보기는 이번에 보내지 않는다
//   - 다시 받기는 있는 브라우저 구독을 지우고 새로 구독해 POST 한다(주소 만료 MOVED). 이 계정의 다른 구독은 다시 맞추기가 새 주소로 보낸다.
//     이 기기의 다른 계정이 그 구독을 쓰면 지우지 않고 켜기처럼 고른다(그 계정의 구독을 깨지 않는다)
//   - 다시 POST 앞의 상태 조회가 2분 안에 실패했으면 그 지켜보기는 묻지도 보내지도 않는다(429 되풀이 없음)
//   - 브라우저 푸시 호출(등록, 구독 읽기, 구독 지우기)은 하나에 BROWSER_PUSH_TIMEOUT_MS, 구독은 BROWSER_SUBSCRIBE_TIMEOUT_MS 까지이고,
//     넘기면 그 호출의 실패다
//   - 줄의 일은 잠금 안에서 시작할 때 store.recheckAccount 를 부른다(다른 탭의 계정 바뀜)
//   - 기록하지 못한 구독의 해지가 대기 상한에 밀리면 한 번 직접 보낸다(끄기, 다시 맞추기, 계정이 바뀜, 기록 쓰기 실패)
//   - 같은 기기의 두 탭은 Web Locks 로 차례를 지킨다: 함께 다시 맞춰도 POST 는 하나이고 기록은 서버의 지금 구독이다. 잠금은 정해진
//     시간까지만 붙잡고, 일이 실패해도 풀리고, 잠금이 없거나 요청이 실패하면 탭 안 줄로만 지킨다
//   - 기다린 뒤에는 계정과 쓰기 가능을 다시 본다. 다른 계정의 기록에 쓰지 않고, 앞 계정 구독은 해지 대기로 넘긴다
//   - 설정 꺼짐, 사본에 watchId 없음, 보기 전용이면 정해진 요청 말고는 0건이다
//   - 상태 조회는 2분 간격, 마감 60초 전과 마감 + 11분 타이머, 404 는 gone
//   - console 을 부르지 않고 요청 본문은 pushRequests 허용 목록 그대로다. URL 에 식별 값이 없다
//
// 저장소는 메모리, fetch·타이머·navigator·Notification·MessageChannel 은 가짜다. SHA-256 은 node:crypto webcrypto 다.
// 시각은 +09:00 오프셋으로 만든다(시간대 무관). 타이머는 테스트가 직접 부른다(Node 18 에서 멈추지 않는다). 외부 호출 0건.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHash, webcrypto } from 'node:crypto';

import {
  BROWSER_PUSH_TIMEOUT_MS,
  BROWSER_SUBSCRIBE_TIMEOUT_MS,
  CONFIG_TTL_MS,
  DEVICE_LOCK_HOLD_MS,
  DEVICE_LOCK_NAME,
  FORGET_TIMEOUT_MS,
  IDLE_STATE,
  PUSH_RESULT,
  STATUS_MIN_GAP_MS,
  STATUS_POLL_MS,
  SW_INFO_TIMEOUT_MS,
  SW_INFO_TYPE,
  SW_UPDATE_TIMEOUT_MS,
  createGuardianPush,
} from '../lib/notify/guardianPush.js';
import { DEVICE_KEY, RECORD, SCHEMA_VERSION, accountRecordKey, createMemoryStorage, createStore } from '../lib/store/index.js';
import { PUSH_PATHS } from '../src/guardian/pushRequests.js';
import { WATCH_PATHS } from '../src/guardian/watchRequests.js';

const ACCOUNT_A = 'acct_guardian_runner_a_0001';
const ACCOUNT_B = 'acct_guardian_runner_b_0002';
const HOUR = 3600_000;
const DATE = '2026-10-02';
const kst = (hhmm, date = DATE) => Date.parse(`${date}T${hhmm}:00+09:00`);
/** 2026-10-02 12:00 KST */
const T0 = kst('12:00');

const watchIdOf = (n) => `W${String(n).padStart(21, '0')}`;
const subIdOf = (n) => `S${String(n).padStart(21, '0')}`;
const writeTokenOf = (n) => `T${String(n).padStart(42, '0')}`;
const W1 = watchIdOf(1);
const W2 = watchIdOf(2);

/** 서버 VAPID 공개키(지금 것과 옛 것) */
const VAPID = createECDH('prime256v1').generateKeys().toString('base64url');
const VAPID_OLD = createECDH('prime256v1').generateKeys().toString('base64url');
/** 브라우저 구독의 두 키(모든 가짜 구독이 같은 값을 쓴다) */
const P256DH = createECDH('prime256v1').generateKeys().toString('base64url');
const AUTH = 'AAECAwQFBgcICQoLDA0ODw';
const E_OLD = 'https://push.example.test/send/old-0001';
const E_EXISTING = 'https://push.example.test/send/existing-0002';
const freshEndpoint = (n) => `https://push.example.test/send/new-${n}`;
const hashOf = (endpoint) => createHash('sha256').update(endpoint).digest('base64url');

const CONFIG_ON = Object.freeze({ enabled: true, vapidPublicKey: VAPID, guardianLoginRequired: true });
const CONFIG_OFF = Object.freeze({ enabled: false, vapidPublicKey: null, guardianLoginRequired: true });

/** 이 계정 구독 기록 항목 하나. subId 는 watchId 에서 만든다 */
function subRecord(watchId, overrides = {}) {
  return { watchId, subId: `S${watchId.slice(1)}`, lang: 'ko', endpointHash: hashOf(E_EXISTING), vapidKey: VAPID, ...overrides };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function putRaw(storage, key, data) {
  storage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
}

function readRaw(storage, key) {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw).data;
}

/** setImmediate 몇 바퀴(webcrypto 의 digest 는 마이크로태스크만으로 끝나지 않는다) */
async function settle(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function until(check, message = '조건이 오지 않았다') {
  for (let i = 0; i < 500; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

// ── 가짜 서버 ────────────────────────────────────────────────────────

const ROUTES = Object.freeze(['config', 'subscribe', 'unsubscribe', 'status', 'mute', 'watchDelete']);

function routeOf(url, method) {
  if (url === WATCH_PATHS.config && method === 'GET') return 'config';
  if (url === PUSH_PATHS.subscribe && method === 'POST') return 'subscribe';
  if (url === PUSH_PATHS.subscribe && method === 'DELETE') return 'unsubscribe';
  if (url === PUSH_PATHS.status && method === 'POST') return 'status';
  if (url === PUSH_PATHS.mute && method === 'POST') return 'mute';
  if (url === WATCH_PATHS.watch && method === 'DELETE') return 'watchDelete';
  return null;
}

/**
 * 경로별로 답하는 가짜 서버. reply[경로](body) 는 Response, 상태 숫자, 'network'(연결 실패), 'off'(서버 알림 꺼짐 503),
 * 'hang'(release() 까지 기다렸다가 그때의 reply 로 답한다. reply 도 'hang' 이면 기본 답), 'hold'(도착한 때 기본 답으로 처리하고
 * 응답만 deliver(i) 까지 붙잡는다: 두 탭의 응답 순서를 고른다) 가운데 하나를 돌려준다. current 는 지켜보기마다 서버의 지금 구독 subId 다.
 * once(경로, 값) 은 다음 한 번만 그 값으로 답한다.
 */
function fakeServer({ events, config = CONFIG_ON }) {
  const calls = [];
  const waiting = [];
  const held = [];
  const current = new Map();
  const onceQueue = new Map(ROUTES.map((route) => [route, []]));
  let subSeq = 100;
  const defaults = {
    config: () => json(200, { ok: true, ...server.config }),
    subscribe: (body) => {
      subSeq += 1;
      if (body?.watchId) current.set(body.watchId, subIdOf(subSeq));
      return json(200, { ok: true, subId: subIdOf(subSeq) });
    },
    unsubscribe: (body) => {
      // 서버는 지금 구독의 subId 일 때만 지운다
      if (body?.watchId && current.get(body.watchId) === body.subId) current.delete(body.watchId);
      return 200;
    },
    status: () => json(200, { ok: true, date: DATE, confirmed: ['14:30'], muted: false, subscriptionActive: true }),
    mute: (body) => json(200, { ok: true, muted: body.on }),
    watchDelete: () => 200,
  };
  const toResponse = (value) => {
    if (value instanceof Response) return value;
    if (value === 'network') throw new TypeError('fetch failed');
    if (value === 'off') return json(503, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' });
    if (value === 503) return json(503, { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' });
    if (value >= 200 && value < 300) return json(value, { ok: true });
    return json(value, { ok: false, errorCode: `CODE_${value}` });
  };
  const server = {
    calls,
    config,
    reply: { ...defaults },
    once(route, value) {
      onceQueue.get(route).push(value);
    },
    of: (route) => calls.filter((call) => call.route === route),
    routes: () => calls.filter((call) => call.route !== null).map((call) => call.route),
    release: () => waiting.splice(0).forEach((fn) => fn()),
    current,
    held,
    maxHeld: 0,
    deliver: (index = 0) => held.splice(index, 1)[0].deliver(),
    get hanging() {
      return waiting.length;
    },
    async fetchImpl(url, init = {}) {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      const route = routeOf(url, method);
      calls.push({ url, method, body, route });
      if (route === null) return json(404, { ok: false });
      events.push(`${method} ${route}`);
      const queued = onceQueue.get(route);
      const value = queued.length > 0 ? queued.shift() : server.reply[route](body);
      if (value === 'hold') {
        const response = toResponse(defaults[route](body));
        return new Promise((resolve) => {
          held.push({ route, body, deliver: () => resolve(response) });
          server.maxHeld = Math.max(server.maxHeld, held.length);
        });
      }
      if (value === 'hang') {
        return new Promise((resolve, reject) =>
          waiting.push(() => {
            try {
              const later = server.reply[route](body);
              resolve(toResponse(later === 'hang' ? defaults[route](body) : later));
            } catch (error) {
              reject(error);
            }
          }),
        );
      }
      return toResponse(value);
    },
  };
  return server;
}

// ── 가짜 브라우저 ────────────────────────────────────────────────────

class FakeMessageChannel {
  constructor() {
    const port1 = {
      onmessage: null,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    this.port1 = port1;
    this.port2 = {
      postMessage(data) {
        queueMicrotask(() => {
          if (!port1.closed) port1.onmessage?.({ data });
        });
      },
    };
  }
}

function listenerBag() {
  const map = new Map();
  return {
    addEventListener(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      map.get(type)?.delete(fn);
    },
    dispatch(type, event = { type }) {
      for (const fn of [...(map.get(type) ?? [])]) fn(event);
    },
    count: (type) => map.get(type)?.size ?? 0,
  };
}

/**
 * 가짜 서비스 워커 등록·pushManager·창. existing 은 이미 있는 브라우저 구독 { endpoint, key }(key 가 null 이면 키를 읽을 수 없다).
 * answer 가 거짓이면 워커가 준비 확인에 답하지 않는다(push 처리기가 없는 옛 워커).
 */
function fakeBrowser({ events, existing = null, answer = true }) {
  let endpointSeq = 0;
  const browser = { answer, current: null, subscribeOptions: [], subscribeThrows: false, unsubscribeBehavior: 'ok', onUpdate: null };
  const makeSub = (endpoint, key) => {
    const sub = {
      endpoint,
      options: { userVisibleOnly: true, applicationServerKey: key ? Uint8Array.from(Buffer.from(key, 'base64url')).buffer : null },
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } }),
      async unsubscribe() {
        events.push('unsubscribe');
        if (browser.unsubscribeBehavior === 'throw') throw new Error('unsubscribe failed');
        if (browser.unsubscribeBehavior === 'hang') return new Promise(() => {});
        if (browser.current === sub) browser.current = null;
        return true;
      },
    };
    return sub;
  };
  browser.makeSub = makeSub;
  if (existing) browser.current = makeSub(existing.endpoint, existing.key);
  const pushManager = {
    async getSubscription() {
      events.push('getSubscription');
      return browser.current;
    },
    async subscribe(options) {
      events.push('subscribe');
      browser.subscribeOptions.push(options);
      if (browser.subscribeThrows) throw new Error('subscribe failed');
      endpointSeq += 1;
      browser.current = makeSub(freshEndpoint(endpointSeq), Buffer.from(options.applicationServerKey).toString('base64url'));
      return browser.current;
    },
  };
  const worker = {
    postMessage(message, ports) {
      events.push('swInfo');
      if (browser.answer && message?.type === 'SAFEHOUR_SW_INFO') ports[0].postMessage({ type: 'SAFEHOUR_SW_INFO', version: 'test', push: true });
    },
  };
  const registration = {
    active: worker,
    installing: null,
    waiting: null,
    pushManager,
    async update() {
      events.push('update');
      browser.onUpdate?.();
    },
  };
  const serviceWorker = {
    ...listenerBag(),
    getRegistration: async () => registration,
  };
  const nav = { serviceWorker, language: 'ko-KR' };
  const doc = { visibilityState: 'visible', ...listenerBag() };
  const win = { ...listenerBag(), navigator: nav, document: doc, PushManager: function PushManager() {}, MessageChannel: FakeMessageChannel };
  return Object.assign(browser, { registration, serviceWorker, nav, doc, win, pushManager });
}

function fakeNotification({ events, permission = 'granted' }) {
  function Notification() {}
  Notification.permission = permission;
  Notification.answer = 'granted';
  Notification.requestPermission = () => {
    events.push('requestPermission');
    return Promise.resolve().then(() => {
      Notification.permission = Notification.answer;
      return Notification.answer;
    });
  };
  return Notification;
}

/** 주입 타이머. 테스트가 fire(지연) 로 직접 부른다 */
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn, ms) {
      seq += 1;
      pending.set(seq, { fn, ms });
      return seq;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    delays: () => [...pending.values()].map((timer) => timer.ms),
    has: (ms) => [...pending.values()].some((timer) => timer.ms === ms),
    fire(ms) {
      for (const [id, timer] of pending) {
        if (timer.ms === ms) {
          pending.delete(id);
          timer.fn();
          return true;
        }
      }
      return false;
    },
  };
}

/** 약속이 끝날 때까지 짧은 타이머(준비 확인·갱신 한도)를 하나씩 부른다 */
async function drive(promise, timers, maxDelay = SW_UPDATE_TIMEOUT_MS) {
  let done = false;
  let value;
  promise.then((result) => {
    done = true;
    value = result;
  });
  for (let i = 0; i < 100 && !done; i += 1) {
    await settle(5);
    if (done) break;
    const next = [...timers.pending.entries()].filter(([, timer]) => timer.ms <= maxDelay).sort((a, b) => a[1].ms - b[1].ms)[0];
    if (next) {
      timers.pending.delete(next[0]);
      next[1].fn();
    }
  }
  assert.ok(done, '끝나지 않았다');
  return value;
}

function signIn(store, clock, accountKey = ACCOUNT_A) {
  store.setOnline(true);
  store.setSession({ authenticated: true, accountKey, expiresAt: new Date(clock.ms + 12 * HOUR).toISOString() });
}

/** 보호자 사본 하나. 앞 것일수록 최근에 가져왔다 */
function copyOf({ watchId = W1, deadlines = ['18:00'] } = {}, index = 0) {
  return {
    snapshot: { days: [{ date: DATE, patientReturn: deadlines.map((by) => ({ by })) }], ...(watchId ? { watchId } : {}) },
    importedAt: new Date(T0 - (index + 1) * 60_000).toISOString(),
    expiresAt: '2026-10-08T23:59:00+09:00',
  };
}

/**
 * 로그인한 저장소, 사본, 기기 알림 스위치, 구독 기록, 가짜 브라우저와 실행기
 * @param {object} [options]
 */
function setup({
  config = CONFIG_ON,
  permission = 'granted',
  copies = [{ watchId: W1 }],
  subs = null,
  mainOn = true,
  existing = null,
  answer = true,
  storage = createMemoryStorage(),
} = {}) {
  const events = [];
  const clock = { ms: T0 };
  const server = fakeServer({ events, config });
  const store = createStore({ storage, now: () => clock.ms, fetchImpl: (...args) => server.fetchImpl(...args) });
  signIn(store, clock);
  copies.forEach((copy, index) => assert.equal(store.writeGuardianCopy(`copy${index + 1}`, copyOf(copy, index)).ok, true));
  if (mainOn) assert.equal(store.writePrefs({ notifications: true }).ok, true);
  if (subs) assert.equal(store.writeGuardianPush({ subs, status: [], gone: [] }).ok, true);
  const browser = fakeBrowser({ events, existing, answer });
  const NotificationImpl = fakeNotification({ events, permission });
  const timers = fakeTimers();
  const make = () =>
    createGuardianPush({
      store,
      fetchImpl: (...args) => server.fetchImpl(...args),
      now: () => clock.ms,
      timers,
      win: browser.win,
      nav: browser.nav,
      NotificationImpl,
      subtle: webcrypto.subtle,
    });
  const runner = make();
  return { events, clock, server, storage, store, browser, NotificationImpl, timers, runner, make };
}

const SERVER_EVENTS = new Set(['GET config', 'POST subscribe', 'DELETE unsubscribe', 'POST status', 'POST mute']);
const pick = (events, names) => events.filter((event) => names.includes(event));

/** 권한 창을 열어 둔다(requestPermission 이 답을 기다린다). 돌려준 함수로 답한다 */
function holdPermission(t) {
  let answer = null;
  t.NotificationImpl.requestPermission = () => {
    t.events.push('requestPermission');
    return new Promise((resolve) => {
      answer = (value) => {
        t.NotificationImpl.permission = value;
        resolve(value);
      };
    });
  };
  return (value) => answer(value);
}

/**
 * Web Locks 가짜: 이름마다 한 번에 콜백 하나. 콜백의 약속이 끝나면(성공이든 실패든) 다음 차례다. 탭이 닫히는 것은 흉내 내지 않는다.
 * request(name, callback) 과 request(name, options, callback) 을 받는다.
 */
function fakeLocks() {
  const tails = new Map();
  const locks = {
    held: 0,
    grants: 0,
    names: new Set(),
    request(name, ...rest) {
      const callback = rest[rest.length - 1];
      locks.names.add(name);
      const previous = tails.get(name) ?? Promise.resolve();
      let next;
      tails.set(name, new Promise((resolve) => (next = resolve)));
      return previous.then(async () => {
        locks.held += 1;
        locks.grants += 1;
        try {
          return await callback({ name, mode: 'exclusive' });
        } finally {
          locks.held -= 1;
          next();
        }
      });
    },
  };
  return locks;
}

/** 실행기 하나를 더 만든다(같은 가짜 브라우저·서버·시계·타이머). store 와 locks 를 고른다 */
function runnerFor(t, { store = t.store, locks = undefined } = {}) {
  return createGuardianPush({
    store,
    fetchImpl: (...args) => t.server.fetchImpl(...args),
    now: () => t.clock.ms,
    timers: t.timers,
    win: t.browser.win,
    nav: t.browser.nav,
    NotificationImpl: t.NotificationImpl,
    subtle: webcrypto.subtle,
    locks,
  });
}

/** 같은 기기의 두 탭: 저장 영역, 브라우저, 서버, 시계, 타이머, Web Locks 는 함께 쓰고 저장소와 실행기는 탭마다 따로다 */
function twoTabs(options = {}) {
  const t = setup(options);
  const locks = fakeLocks();
  const store2 = createStore({ storage: t.storage, now: () => t.clock.ms, fetchImpl: (...args) => t.server.fetchImpl(...args) });
  signIn(store2, t.clock);
  return {
    ...t,
    locks,
    tab1: { store: t.store, runner: runnerFor(t, { locks }) },
    tab2: { store: store2, runner: runnerFor(t, { store: store2, locks }) },
  };
}

/** 붙잡은 응답을 늦게 온 것부터 하나씩 보낸다(두 탭의 응답이 거꾸로 닿는 경우). done 이 끝날 때까지 */
async function deliverLatestFirst(server, done) {
  let finished = false;
  done.then(() => {
    finished = true;
  });
  await settle(60);
  for (let i = 0; i < 50 && !finished; i += 1) {
    if (server.held.length > 0) server.deliver(server.held.length - 1);
    await settle(30);
  }
  assert.ok(finished, '끝나지 않았다');
}

/** 지켜보기 삭제 10개로 꽉 찬 서버 삭제 대기 */
const fullOfWatchDeletes = () => Array.from({ length: 10 }, (_, i) => ({ watchId: watchIdOf(30 + i), writeToken: writeTokenOf(30 + i) }));

/** 상태 조회가 subscriptionActive 거짓이라 한 상태 항목(MOVED) */
const movedStatus = (watchId) => ({ watchId, date: DATE, confirmed: [], muted: false, active: false, atMs: T0 });

// ── 켜기 ─────────────────────────────────────────────────────────────

describe('turnOn', () => {
  test('turnOn: 권한 요청이 첫 await 전에 시작되고 subscribe({ userVisibleOnly: true, applicationServerKey }) 다음 POST 다', async () => {
    const t = setup({ permission: 'default', mainOn: false });
    const pending = t.runner.turnOn(W1);
    assert.deepEqual(t.events, ['requestPermission'], '부른 자리에서 곧바로 권한을 묻는다(사용자 동작 안)');
    assert.equal(t.runner.getState(W1).busy, true);
    assert.equal(await pending, PUSH_RESULT.ON);

    assert.deepEqual(pick(t.events, ['requestPermission', 'GET config', 'swInfo', 'getSubscription', 'subscribe', 'POST subscribe']), [
      'requestPermission',
      'GET config',
      'swInfo',
      'getSubscription',
      'subscribe',
      'POST subscribe',
    ]);
    const [options] = t.browser.subscribeOptions;
    assert.deepEqual(Object.keys(options).sort(), ['applicationServerKey', 'userVisibleOnly']);
    assert.equal(options.userVisibleOnly, true);
    assert.equal(Buffer.from(options.applicationServerKey).toString('base64url'), VAPID);
    assert.deepEqual(t.server.of('subscribe')[0].body, {
      watchId: W1,
      subscription: { endpoint: freshEndpoint(1), keys: { p256dh: P256DH, auth: AUTH } },
      lang: 'ko',
    });
    assert.deepEqual(t.store.readGuardianPush(), {
      subs: [{ watchId: W1, subId: subIdOf(101), lang: 'ko', endpointHash: hashOf(freshEndpoint(1)), vapidKey: VAPID }],
      status: [],
      gone: [],
    });
    assert.equal(t.store.readPrefs().notifications, true, '기기 알림 스위치도 켠다(다르게 정한 것 2)');
    const state = t.runner.getState(W1);
    assert.equal(state.busy, false);
    assert.equal(state.lastResult, PUSH_RESULT.ON);
    assert.deepEqual(state.sub, { subId: subIdOf(101), lang: 'ko' });

    // 권한을 거절하면 서버에 아무것도 보내지 않는다
    const denied = setup({ permission: 'default', mainOn: false });
    denied.NotificationImpl.answer = 'denied';
    assert.equal(await denied.runner.turnOn(W1), PUSH_RESULT.DENIED);
    assert.deepEqual(denied.server.calls, []);
    assert.equal(denied.store.readPrefs().notifications, false);
    // 이미 거절돼 있으면 묻지도 않는다
    const blocked = setup({ permission: 'denied' });
    assert.equal(await blocked.runner.turnOn(W1), PUSH_RESULT.DENIED);
    assert.deepEqual(blocked.events, []);
  });

  test('준비 확인 답이 없으면 update 뒤 다시 묻고 그래도 없으면 SW_NOT_READY 이며 subscribe 를 부르지 않는다', async () => {
    assert.equal(SW_INFO_TIMEOUT_MS, 2_000);
    assert.equal(SW_UPDATE_TIMEOUT_MS, 5_000);
    assert.equal(SW_INFO_TYPE, 'SAFEHOUR_SW_INFO');
    const t = setup({ answer: false });
    assert.equal(await drive(t.runner.turnOn(W1), t.timers), PUSH_RESULT.SW_NOT_READY);
    assert.deepEqual(pick(t.events, ['swInfo', 'update']), ['swInfo', 'update', 'swInfo']);
    assert.ok(!t.events.includes('subscribe') && !t.events.includes('getSubscription'), '브라우저 구독을 만들지 않는다');
    assert.deepEqual(t.server.of('subscribe'), []);
    assert.equal(t.runner.getState(W1).swReady, false);
    assert.equal(t.store.readGuardianPush(), null);

    // update 가 새 워커를 깔면 컨트롤러 교체를 기다렸다가 다시 묻는다
    const u = setup({ answer: false });
    u.browser.onUpdate = () => {
      u.browser.registration.installing = {};
      queueMicrotask(() => {
        u.browser.answer = true;
        u.browser.registration.installing = null;
        u.browser.serviceWorker.dispatch('controllerchange');
      });
    };
    assert.equal(await drive(u.runner.turnOn(W1), u.timers), PUSH_RESULT.ON);
    assert.deepEqual(pick(u.events, ['swInfo', 'update', 'subscribe']), ['swInfo', 'update', 'swInfo', 'subscribe']);
    assert.equal(u.runner.getState(W1).swReady, true);
    assert.equal(u.browser.serviceWorker.count('controllerchange'), 0, '기다린 뒤 리스너를 뗀다');
  });

  test('prepare 는 설정과 준비 확인을 미리 해 두고 켜기는 다시 기다리지 않는다', async () => {
    const t = setup();
    await t.runner.prepare(W1);
    assert.deepEqual(t.runner.getState(W1).config, CONFIG_ON);
    assert.equal(t.runner.getState(W1).swReady, true);
    assert.deepEqual(pick(t.events, ['GET config', 'swInfo']), ['GET config', 'swInfo']);
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(t.events, ['GET config', 'swInfo']), ['GET config', 'swInfo'], '10분 안의 설정과 확인한 워커를 쓴다');
    assert.equal(CONFIG_TTL_MS, 10 * 60_000);
    t.clock.ms += CONFIG_TTL_MS;
    await t.runner.prepare(W1);
    assert.equal(t.server.of('config').length, 2, '10분이 지나면 다시 읽는다');
  });

  test('기록에 없는 키의 브라우저 구독이 남아 있으면 unsubscribe 뒤 새로 구독하고, 다른 계정이 쓰는 구독은 다시 쓴다', async () => {
    // 이 기기에 모르는 키의 구독이 남아 있다: 지우고 새로 만든다(키가 다른 구독 위에 subscribe 를 부르면 브라우저가 던진다)
    const stray = setup({ existing: { endpoint: E_OLD, key: VAPID_OLD } });
    assert.equal(await stray.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(stray.events, ['getSubscription', 'unsubscribe', 'subscribe']), ['getSubscription', 'unsubscribe', 'subscribe']);
    assert.equal(stray.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));

    // 다른 계정이 이 기기 구독을 쓰고 있고 키가 같다: 그대로 다시 쓴다
    const shared = setup({ existing: { endpoint: E_EXISTING, key: VAPID } });
    putRaw(shared.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), { subs: [subRecord(W2)], status: [], gone: [] });
    assert.equal(shared.store.guardianPushElsewhere(), true);
    assert.equal(await shared.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(shared.events, ['getSubscription', 'unsubscribe', 'subscribe']), ['getSubscription']);
    assert.equal(shared.server.of('subscribe')[0].body.subscription.endpoint, E_EXISTING);
    assert.equal(shared.store.readGuardianPush().subs[0].endpointHash, hashOf(E_EXISTING));

    // 다른 계정이 쓰더라도 브라우저 구독의 키가 설정과 다르면 다시 쓰지 않는다(옛 키로는 푸시가 닿지 않는다)
    const oldKey = setup({ existing: { endpoint: E_OLD, key: VAPID_OLD } });
    putRaw(oldKey.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), { subs: [subRecord(W2)], status: [], gone: [] });
    assert.equal(await oldKey.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(oldKey.events, ['getSubscription', 'unsubscribe', 'subscribe']), ['getSubscription', 'unsubscribe', 'subscribe']);

    // 이 계정의 다른 지켜보기 구독과 해시·키가 같다: 다시 쓴다
    const own = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await own.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(own.events, ['getSubscription', 'unsubscribe', 'subscribe']), ['getSubscription']);
    assert.deepEqual(
      own.store.readGuardianPush().subs.map((item) => item.watchId),
      [W2, W1],
    );
  });

  test('turnOn 결과: 401, 429, 503 OFF, 404(gone), 네트워크, subscribe 예외(FAILED)마다 기록 변화가 정해진 대로다', async () => {
    const unchanged = [
      [401, PUSH_RESULT.LOGIN_REQUIRED],
      [429, PUSH_RESULT.RATE_LIMITED],
      ['off', PUSH_RESULT.OFF],
      [503, PUSH_RESULT.UNAVAILABLE],
      [400, PUSH_RESULT.FAILED],
      ['network', PUSH_RESULT.NETWORK],
      [json(200, { ok: true }), PUSH_RESULT.UNAVAILABLE],
    ];
    for (const [reply, result] of unchanged) {
      const t = setup();
      t.server.once('subscribe', reply);
      assert.equal(await t.runner.turnOn(W1), result, String(reply));
      assert.equal(t.store.readGuardianPush(), null, `${String(reply)}: 기록을 바꾸지 않는다`);
      assert.equal(t.runner.getState(W1).lastResult, result);
      await t.store.retryPendingServerDelete();
      assert.deepEqual(t.server.of('unsubscribe'), [], '서버에 만든 구독이 없으니 해지도 없다');
    }

    // 503 OFF: 설정 기억을 버린다(다음 켜기는 설정을 다시 읽는다)
    const off = setup();
    off.server.once('subscribe', 'off');
    assert.equal(await off.runner.turnOn(W1), PUSH_RESULT.OFF);
    off.server.config = CONFIG_OFF;
    assert.equal(await off.runner.turnOn(W1), PUSH_RESULT.OFF);
    assert.equal(off.server.of('config').length, 2);
    assert.equal(off.server.of('subscribe').length, 1);
    assert.equal(off.runner.getState(W1).config.enabled, false);

    // 404: 지켜보기가 없어졌다. gone 에 넣고 해지는 보내지 않으며 다시 켜기는 요청 없이 GONE
    const gone = setup();
    gone.server.once('subscribe', 404);
    assert.equal(await gone.runner.turnOn(W1), PUSH_RESULT.GONE);
    assert.deepEqual(gone.store.readGuardianPush(), { subs: [], status: [], gone: [W1] });
    assert.equal(gone.runner.getState(W1).gone, true);
    const before = gone.server.calls.length;
    assert.equal(await gone.runner.turnOn(W1), PUSH_RESULT.GONE);
    assert.equal(gone.server.calls.length, before);
    await gone.store.retryPendingServerDelete();
    assert.deepEqual(gone.server.of('unsubscribe'), []);

    // 브라우저 구독 호출이 던지면 FAILED 이고 POST 가 없다
    const thrown = setup();
    thrown.browser.subscribeThrows = true;
    assert.equal(await thrown.runner.turnOn(W1), PUSH_RESULT.FAILED);
    assert.deepEqual(thrown.server.of('subscribe'), []);
    assert.equal(thrown.store.readGuardianPush(), null);

    // 설정을 못 읽으면 켜지 않는다
    const offline = setup();
    offline.server.reply.config = () => 'network';
    assert.equal(await offline.runner.turnOn(W1), PUSH_RESULT.NETWORK);
    assert.ok(!offline.events.includes('subscribe'));
    // 사본에 없는 지켜보기는 켤 수 없다
    assert.equal(await setup().runner.turnOn(W2), PUSH_RESULT.UNAVAILABLE);
  });

  test('같은 지켜보기의 켜기를 두 번 눌러도 같은 약속이고 권한 요청과 POST 는 한 번이다', async () => {
    const t = setup({ permission: 'default', mainOn: false });
    const first = t.runner.turnOn(W1);
    const second = t.runner.turnOn(W1);
    assert.equal(second, first);
    assert.equal(t.runner.takeOver(W1), first, '같은 지켜보기의 동작이 도는 중이면 그 약속이다');
    assert.equal(t.runner.turnOff(W1), first, '켜기가 도는 동안 끄기도 그 약속이다(화면은 busy 로 스위치를 잠근다)');
    assert.equal(t.runner.mute(W1, true), first);
    assert.equal(t.runner.getState(W1).busy, true);
    assert.equal(await first, PUSH_RESULT.ON);
    await t.runner.idle();
    assert.equal(pick(t.events, ['requestPermission']).length, 1);
    assert.equal(t.server.of('subscribe').length, 1);
    assert.equal(pick(t.events, ['subscribe']).length, 1);
    assert.deepEqual(t.store.readPendingServerDelete(), [], '두 번째 POST 가 subId 를 바꿔 해지를 남기지 않는다');
  });

  test('권한 창이 열려 있는 동안 끄기·다시 맞추기·상태 조회는 그 답을 기다리지 않는다', async () => {
    const t = setup({ permission: 'default', copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    const answer = holdPermission(t);
    const on = t.runner.turnOn(W1);
    assert.deepEqual(t.events, ['requestPermission']);
    let reconciled = false;
    t.runner.reconcile().then(() => {
      reconciled = true;
    });
    await until(() => reconciled, '다시 맞추기가 열린 권한 창 뒤에서 기다린다');
    let status = 'waiting';
    t.runner.refreshStatus(W2, { force: true }).then((kind) => {
      status = kind;
    });
    await until(() => status !== 'waiting', '상태 조회가 열린 권한 창 뒤에서 기다린다');
    assert.equal(status, 'OK');
    let off = null;
    t.runner.turnOff(W2).then((result) => {
      off = result;
    });
    await until(() => off !== null, '끄기가 열린 권한 창 뒤에서 기다린다');
    assert.equal(off, PUSH_RESULT.OFF_DONE);
    assert.equal(t.runner.getState(W1).busy, true, '답을 기다리는 동안 켜기는 busy 다');
    assert.deepEqual(t.server.of('subscribe'), []);

    answer('granted');
    assert.equal(await on, PUSH_RESULT.ON);
    assert.equal(t.server.of('subscribe').length, 1);
    assert.equal(t.runner.getState(W1).busy, false);
  });

  test('gone 인 지켜보기는 켜기가 권한도 묻지 않고 GONE 이다', async () => {
    const t = setup({ permission: 'default', mainOn: false });
    assert.equal(t.store.writeGuardianPush({ subs: [], status: [], gone: [W1] }).ok, true);
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.GONE);
    await t.runner.idle();
    assert.deepEqual(t.events, []);
    assert.notEqual(t.store.readPrefs().notifications, true, '기기 알림 스위치도 켜지 않는다');
  });

  test('다시 받기는 권한이 granted 일 때만이고 권한을 묻지 않는다', async () => {
    const t = setup({ permission: 'default', subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.DENIED);
    await t.runner.idle();
    assert.deepEqual(t.events, []);
    assert.deepEqual(t.server.routes(), []);
    assert.equal(t.runner.getState(W1).lastResult, PUSH_RESULT.DENIED);
  });

  test('권한 창이 열린 사이 계정이 바뀌면 새 계정의 기기 알림 스위치를 켜지 않고 구독하지 않는다', async () => {
    const t = setup({ permission: 'default', mainOn: false });
    const answer = holdPermission(t);
    const on = t.runner.turnOn(W1);
    signIn(t.store, t.clock, ACCOUNT_B);
    answer('granted');
    assert.equal(await on, PUSH_RESULT.UNAVAILABLE);
    await t.runner.idle();
    assert.notEqual(t.store.readPrefs().notifications, true, 'B 계정 기기 알림 스위치를 켜지 않는다');
    assert.deepEqual(t.server.routes(), []);
    assert.ok(!t.events.includes('subscribe'));
    assert.equal(t.store.readGuardianPush(), null);
  });

  test('POST 는 받아들여졌는데 기록을 쓰지 못하면 받은 구독을 해지 대기로 넘기고, 대기 상한에 밀리면 한 번 직접 보낸다', async () => {
    for (const full of [false, true]) {
      const t = setup();
      const watches = fullOfWatchDeletes();
      if (full) putRaw(t.storage, DEVICE_KEY.pendingServerDelete, watches);
      t.server.reply.watchDelete = () => 503;
      t.server.reply.unsubscribe = () => 503;
      const pushKey = accountRecordKey(ACCOUNT_A, RECORD.guardianPush);
      const setItem = t.storage.setItem.bind(t.storage);
      t.storage.setItem = (key, value) => {
        if (key === pushKey) throw new Error('quota exceeded');
        return setItem(key, value);
      };
      assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.FAILED, `full=${full}`);
      await t.runner.idle();
      assert.equal(t.store.readGuardianPush(), null);
      const item = { watchId: W1, subId: subIdOf(101) };
      if (full) {
        assert.deepEqual(t.server.of('unsubscribe').map((call) => call.body), [item], '대기에 남지 못해 한 번 직접 보낸다');
        assert.deepEqual(t.store.readPendingServerDelete(), watches);
      } else {
        assert.deepEqual(t.store.readPendingServerDelete(), [item], '받은 구독을 해지 대기로 넘긴다');
      }
    }
  });

  test('POST 가 실패하면 방금 만든 브라우저 구독을 다른 구독이 없을 때만 unsubscribe 한다', async () => {
    const alone = setup();
    alone.server.once('subscribe', 503);
    assert.equal(await alone.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(pick(alone.events, ['subscribe', 'POST subscribe', 'unsubscribe']), ['subscribe', 'POST subscribe', 'unsubscribe']);
    assert.equal(alone.browser.current, null);

    // 이 계정에 다른 구독이 있다(옛 키라 새 구독을 만들었다): 새 구독을 남긴다
    const other = setup({
      copies: [{ watchId: W1 }, { watchId: W2 }],
      subs: [subRecord(W2, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) })],
      existing: { endpoint: E_OLD, key: VAPID_OLD },
    });
    other.server.once('subscribe', 503);
    assert.equal(await other.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(pick(other.events, ['getSubscription', 'unsubscribe', 'subscribe', 'POST subscribe']), [
      'getSubscription',
      'unsubscribe',
      'subscribe',
      'POST subscribe',
    ]);
    assert.equal(other.browser.current.endpoint, freshEndpoint(1));

    // 다른 계정이 쓰는 구독을 다시 썼으면(만들지 않았으면) 지우지 않는다
    const reused = setup({ existing: { endpoint: E_EXISTING, key: VAPID } });
    putRaw(reused.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), { subs: [subRecord(W2)], status: [], gone: [] });
    reused.server.once('subscribe', 503);
    assert.equal(await reused.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.ok(!reused.events.includes('unsubscribe'));
  });
});

// ── 계정과 쓰기 가능 ─────────────────────────────────────────────────

describe('기다린 뒤 계정과 쓰기 가능', () => {
  test('POST 를 기다리는 사이 계정이 바뀌면 새 계정 기록에 쓰지 않고 받은 구독은 해지 대기로 넘긴다', async () => {
    const t = setup();
    t.server.once('subscribe', 'hang');
    const pending = t.runner.turnOn(W1);
    await until(() => t.server.hanging === 1);
    signIn(t.store, t.clock, ACCOUNT_B);
    t.server.release();
    assert.equal(await pending, PUSH_RESULT.UNAVAILABLE);
    assert.equal(t.store.readGuardianPush(), null, 'B 계정에 쓰지 않는다');
    assert.equal(readRaw(t.storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush)), null, 'A 계정에도 쓰지 않는다');
    assert.equal(t.runner.getState(W1).lastResult, null, '다른 계정 화면에 앞 계정 결과를 보이지 않는다');
    await t.store.retryPendingServerDelete();
    assert.deepEqual(
      t.server.of('unsubscribe').map((call) => call.body),
      [{ watchId: W1, subId: subIdOf(101) }],
    );
  });

  test('브라우저 구독을 기다리는 사이 계정이 바뀌면 POST 를 보내지 않고 방금 만든 구독을 지운다', async () => {
    const t = setup();
    const subscribe = t.browser.pushManager.subscribe;
    t.browser.pushManager.subscribe = async (options) => {
      const subscription = await subscribe(options);
      signIn(t.store, t.clock, ACCOUNT_B);
      return subscription;
    };
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(t.server.of('subscribe'), [], '바뀐 계정 아래에서 구독 요청을 보내지 않는다');
    assert.equal(t.store.readGuardianPush(), null, 'B 계정에 쓰지 않는다');
    assert.equal(readRaw(t.storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush)), null, 'A 계정에도 쓰지 않는다');
    assert.equal(t.browser.current, null, '이 기기에 다른 구독이 없어 방금 만든 브라우저 구독을 지운다');
    assert.deepEqual(t.store.readPendingServerDelete(), [], '서버에 닿지 않았으니 해지할 것도 없다');
  });

  test('상태 조회를 기다리는 사이 계정이 바뀌면 상태도 gone 도 새 계정에 쓰지 않는다', async () => {
    for (const reply of [200, 404]) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      t.server.once('status', 'hang');
      if (reply === 404) t.server.reply.status = () => 404;
      const pending = t.runner.refreshStatus(W1, { force: true });
      await until(() => t.server.hanging === 1);
      signIn(t.store, t.clock, ACCOUNT_B);
      t.server.release();
      await pending;
      await t.runner.idle();
      assert.equal(t.store.readGuardianPush(), null, `B 계정에 쓰지 않는다(${reply})`);
      const a = readRaw(t.storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush));
      assert.deepEqual([a.subs.length, a.status, a.gone], [1, [], []], `A 계정 기록도 그대로(${reply})`);
    }
  });

  test('계정이 바뀐 뒤 받은 구독을 넘길 때 대기 상한에 밀리면 한 번 직접 보낸다', async () => {
    const t = setup();
    const watches = fullOfWatchDeletes();
    putRaw(t.storage, DEVICE_KEY.pendingServerDelete, watches);
    t.server.reply.watchDelete = () => 'network';
    t.server.once('subscribe', 'hang');
    const pending = t.runner.turnOn(W1);
    await until(() => t.server.hanging === 1);
    signIn(t.store, t.clock, ACCOUNT_B);
    t.server.release();
    assert.equal(await pending, PUSH_RESULT.UNAVAILABLE);
    await t.runner.idle();
    assert.deepEqual(t.server.of('unsubscribe').map((call) => call.body), [{ watchId: W1, subId: subIdOf(101) }]);
    assert.deepEqual(t.store.readPendingServerDelete(), watches, '대기의 지켜보기 삭제는 그대로');
  });

  test('endpoint 해시를 기다리는 사이 계정이 바뀌면 브라우저 구독을 지우지도 만들지도 않는다', async () => {
    // 기록에 없는 키의 구독이다: 계정이 그대로면 지우고 새로 만든다
    const t = setup({ existing: { endpoint: E_EXISTING, key: VAPID_OLD } });
    const subtle = {
      async digest(algorithm, data) {
        const digest = await webcrypto.subtle.digest(algorithm, data);
        signIn(t.store, t.clock, ACCOUNT_B);
        return digest;
      },
    };
    const runner = createGuardianPush({
      store: t.store,
      fetchImpl: (...args) => t.server.fetchImpl(...args),
      now: () => t.clock.ms,
      timers: t.timers,
      win: t.browser.win,
      nav: t.browser.nav,
      NotificationImpl: t.NotificationImpl,
      subtle,
    });
    assert.equal(await runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(pick(t.events, ['unsubscribe', 'subscribe', 'POST subscribe']), []);
    assert.notEqual(t.browser.current, null, '바뀐 계정이 쓸 수 있는 브라우저 구독을 지우지 않는다');
  });

  test('설정을 기다리는 사이 계정이 바뀌거나 보기 전용이 되면 구독도 POST 도 하지 않는다', async () => {
    const switched = setup();
    switched.server.once('config', 'hang');
    const a = switched.runner.turnOn(W1);
    await until(() => switched.server.hanging === 1);
    signIn(switched.store, switched.clock, ACCOUNT_B);
    switched.server.release();
    assert.equal(await a, PUSH_RESULT.UNAVAILABLE);
    assert.ok(!switched.events.includes('subscribe') && !switched.events.includes('swInfo'));
    assert.deepEqual(switched.server.of('subscribe'), []);

    // 같은 계정이지만 세션이 끝났다(보기 전용): READ_ONLY 이고 요청이 없다
    const expired = setup();
    expired.server.once('config', 'hang');
    const b = expired.runner.turnOn(W1);
    await until(() => expired.server.hanging === 1);
    expired.store.setSession({ authenticated: false });
    expired.server.release();
    assert.equal(await b, PUSH_RESULT.READ_ONLY);
    assert.deepEqual(expired.server.of('subscribe'), []);
    assert.ok(!expired.events.includes('subscribe'));
  });

  test('POST 를 기다리는 사이 세션이 끝나면 READ_ONLY 이고 받은 구독은 해지 대기로 간다', async () => {
    const t = setup();
    t.server.once('subscribe', 'hang');
    const pending = t.runner.turnOn(W1);
    await until(() => t.server.hanging === 1);
    t.store.setSession({ authenticated: false });
    t.server.release();
    assert.equal(await pending, PUSH_RESULT.READ_ONLY);
    assert.equal(t.store.readGuardianPush(), null);
    await t.store.retryPendingServerDelete();
    assert.deepEqual(
      t.server.of('unsubscribe').map((call) => call.body),
      [{ watchId: W1, subId: subIdOf(101) }],
    );
  });

  test('다른 탭이 다른 계정으로 로그인해 저장소가 세션을 버리면 쓰지 않는다', async () => {
    const storage = createMemoryStorage();
    const t = setup({ storage });
    const tabListeners = [];
    t.store.attachWindow({
      navigator: { onLine: true },
      addEventListener: (type, fn) => {
        if (type === 'storage') tabListeners.push(fn);
      },
      removeEventListener() {},
    });
    const tab2 = createStore({ storage, now: () => t.clock.ms, fetchImpl: async () => json(404, { ok: false }) });
    t.server.once('subscribe', 'hang');
    const pending = t.runner.turnOn(W1);
    await until(() => t.server.hanging === 1);
    signIn(tab2, t.clock, ACCOUNT_B);
    for (const fn of tabListeners) fn({ key: DEVICE_KEY.lastAccountKey, storageArea: storage });
    assert.equal(t.store.getStatus().readOnly, true, '저장소가 메모리 세션을 버렸다');
    t.server.release();
    assert.equal(await pending, PUSH_RESULT.UNAVAILABLE);
    assert.equal(readRaw(storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush)), null);
    assert.equal(readRaw(storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush)), null);
    await t.store.retryPendingServerDelete();
    assert.deepEqual(
      t.server.of('unsubscribe').map((call) => call.body),
      [{ watchId: W1, subId: subIdOf(101) }],
    );
  });

  test('보기 전용이면 다시 맞추기와 상태 조회 요청이 0건이다', async () => {
    const t = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD), lang: 'en' })], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.store.setSession({ authenticated: false });
    assert.equal(t.store.getStatus().readOnly, true);
    assert.equal(t.store.getStatus().accountKey, ACCOUNT_A);
    t.runner.start();
    await t.runner.reconcile();
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), null);
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.READ_ONLY);
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.READ_ONLY);
    assert.equal(await t.runner.turnOff(W1), PUSH_RESULT.READ_ONLY);
    assert.equal(await t.runner.renew(), PUSH_RESULT.READ_ONLY);
    assert.equal(await t.runner.mute(W1, true), PUSH_RESULT.READ_ONLY);
    await t.runner.idle();
    assert.deepEqual(t.server.routes(), []);
    assert.deepEqual(t.events, []);
    assert.equal(t.store.readGuardianPush().subs.length, 1);
    t.runner.stop();

    // 권한이 아직 default 여도 보기 전용에서는 권한을 묻지 않는다(구독할 수 없는데 권한 창을 띄우지 않는다)
    const ask = setup({ permission: 'default', mainOn: false });
    ask.store.setSession({ authenticated: false });
    assert.equal(await ask.runner.turnOn(W1), PUSH_RESULT.READ_ONLY);
    await ask.runner.idle();
    assert.deepEqual(ask.events, []);
    assert.equal(ask.store.readPrefs().notifications, false, '기기 알림 스위치도 켜지 않는다');
  });
});

// ── 끄기 ─────────────────────────────────────────────────────────────

describe('turnOff', () => {
  test('turnOff: 대기에 남으면 OFF_PENDING, 마지막 구독이면 브라우저 unsubscribe, 다른 계정에 구독이 있으면 하지 않는다', async () => {
    const pending = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    pending.server.reply.unsubscribe = () => 503;
    assert.equal(await pending.runner.turnOff(W1), PUSH_RESULT.OFF_PENDING);
    assert.deepEqual(pending.store.readPendingServerDelete(), [{ watchId: W1, subId: subRecord(W1).subId }]);
    assert.deepEqual(pending.store.readGuardianPush().subs, []);
    assert.ok(pending.events.includes('unsubscribe'), '이 기기의 마지막 구독이라 브라우저 구독도 지운다');
    assert.equal(pending.browser.current, null);
    assert.equal(pending.runner.getState(W1).lastResult, PUSH_RESULT.OFF_PENDING);

    const done = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await done.runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
    assert.deepEqual(
      done.server.of('unsubscribe').map((call) => call.body),
      [{ watchId: W1, subId: subRecord(W1).subId }],
    );
    assert.deepEqual(done.store.readPendingServerDelete(), []);

    // 다른 계정에 구독이 있다: 브라우저 구독은 그대로
    const shared = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    putRaw(shared.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), { subs: [subRecord(W2)], status: [], gone: [] });
    assert.equal(await shared.runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
    assert.ok(!shared.events.includes('unsubscribe'));
    assert.notEqual(shared.browser.current, null);

    // 이 계정에 다른 구독이 남아도 그대로
    const two = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W1), subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await two.runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
    assert.ok(!two.events.includes('unsubscribe'));
  });

  test('대기 상한에 밀려 해지가 버려지면(queued 거짓) 한 번 직접 보내 200·404 는 OFF_DONE, 그 밖은 OFF_UNSENT', async () => {
    for (const [reply, result] of [
      [200, PUSH_RESULT.OFF_DONE],
      [404, PUSH_RESULT.OFF_DONE],
      [503, PUSH_RESULT.OFF_UNSENT],
      ['network', PUSH_RESULT.OFF_UNSENT],
      [429, PUSH_RESULT.OFF_UNSENT],
    ]) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      const watches = Array.from({ length: 10 }, (_, i) => ({ watchId: watchIdOf(30 + i), writeToken: writeTokenOf(30 + i) }));
      putRaw(t.storage, DEVICE_KEY.pendingServerDelete, watches);
      t.server.reply.watchDelete = () => 503;
      t.server.reply.unsubscribe = () => reply;
      assert.equal(await t.runner.turnOff(W1), result, String(reply));
      assert.deepEqual(
        t.server.of('unsubscribe').map((call) => call.body),
        [{ watchId: W1, subId: subRecord(W1).subId }],
        '직접 한 번 보낸다',
      );
      assert.deepEqual(t.store.readPendingServerDelete(), watches, '대기의 지켜보기 삭제는 그대로');
      assert.deepEqual(t.store.readGuardianPush().subs, []);
    }
  });
});

// ── 다시 맞추기 ──────────────────────────────────────────────────────

describe('reconcile', () => {
  test('renew 는 unsubscribe 를 subscribe 보다 먼저 부르고 모든 구독을 다시 POST 한다', async () => {
    const oldSub = (watchId) => subRecord(watchId, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) });
    const t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [oldSub(W1), oldSub(W2)], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    await t.runner.reconcile();
    assert.equal(t.runner.getState(W1).renewNeeded, true);
    t.events.length = 0;

    const pending = t.runner.renew();
    assert.equal(t.runner.getState(W1).busy, true);
    assert.equal(t.runner.getState(W2).busy, true);
    assert.equal(await pending, PUSH_RESULT.ON);
    assert.deepEqual(pick(t.events, ['requestPermission', 'getSubscription', 'unsubscribe', 'subscribe', 'POST subscribe']), [
      'getSubscription',
      'unsubscribe',
      'subscribe',
      'POST subscribe',
      'POST subscribe',
    ]);
    assert.deepEqual(
      t.server.of('subscribe').map((call) => [call.body.watchId, call.body.subscription.endpoint]),
      [
        [W1, freshEndpoint(1)],
        [W2, freshEndpoint(1)],
      ],
    );
    assert.deepEqual(t.store.readGuardianPush().subs, [
      { watchId: W1, subId: subIdOf(101), lang: 'ko', endpointHash: hashOf(freshEndpoint(1)), vapidKey: VAPID },
      { watchId: W2, subId: subIdOf(102), lang: 'ko', endpointHash: hashOf(freshEndpoint(1)), vapidKey: VAPID },
    ]);
    const state = t.runner.getState(W1);
    assert.equal(state.renewNeeded, false);
    assert.equal(state.busy, false);
    assert.equal(state.lastResult, PUSH_RESULT.ON);
    // 옛 subId 는 불변식대로 해지 대기로 가서 나간다(서버는 404 로 끝낸다)
    await t.store.retryPendingServerDelete();
    assert.deepEqual(
      t.server
        .of('unsubscribe')
        .map((call) => call.body.subId)
        .sort(),
      [subRecord(W1).subId, subRecord(W2).subId].sort(),
    );

    // 권한이 granted 가 아니면 다시 켜지 않는다
    const lost = setup({ subs: [oldSub(W1)], existing: { endpoint: E_OLD, key: VAPID_OLD }, permission: 'default' });
    assert.equal(await lost.runner.renew(), PUSH_RESULT.DENIED);
    assert.ok(!lost.events.includes('subscribe'));
  });

  test('다시 켜기가 바로 막혀도(보기 전용, 권한, 지원) 대상 지켜보기마다 결과를 남기고 알린다', async () => {
    const oldSub = (watchId) => subRecord(watchId, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) });
    const blocked = async (options, block, expected) => {
      const t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], existing: { endpoint: E_OLD, key: VAPID_OLD }, ...options });
      // W2 는 moved 라 다시 켜기 대상이 아니다(다시 받기로만 푼다)
      assert.equal(t.store.writeGuardianPush({ subs: [oldSub(W1), oldSub(W2)], status: [movedStatus(W2)], gone: [] }).ok, true);
      block?.(t);
      let seen = null;
      t.runner.subscribe(() => {
        seen = t.runner.getState(W1).lastResult;
      });
      assert.equal(await t.runner.renew(), expected);
      assert.equal(t.runner.getState(W1).lastResult, expected);
      assert.equal(seen, expected, '구독자에게 알린다');
      assert.equal(t.runner.getState(W1).busy, false);
      assert.equal(t.runner.getState(W2).lastResult, null, '대상이 아닌 지켜보기에는 남기지 않는다');
      await t.runner.idle();
      assert.deepEqual(t.server.routes(), []);
      assert.deepEqual(pick(t.events, ['requestPermission', 'getSubscription', 'subscribe', 'unsubscribe']), []);
    };
    await blocked({}, (t) => t.store.setSession({ authenticated: false }), PUSH_RESULT.READ_ONLY);
    await blocked({ permission: 'default' }, null, PUSH_RESULT.DENIED);
    await blocked({ permission: 'denied' }, null, PUSH_RESULT.DENIED);
    await blocked(
      {},
      (t) => {
        t.browser.win.PushManager = undefined;
      },
      PUSH_RESULT.UNSUPPORTED,
    );

    // 구독이 없으면 대상이 없어 남기지 않는다
    const empty = setup({ copies: [{ watchId: W1 }], permission: 'default' });
    assert.equal(await empty.runner.renew(), PUSH_RESULT.DENIED);
    assert.equal(empty.runner.getState(W1).lastResult, null, '구독이 없으면 대상이 없다');
  });

  test('VAPID 키가 다르면 subscribe 를 부르지 않고 renewNeeded 다', async () => {
    const t = setup({ subs: [subRecord(W1, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) })], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    t.runner.start();
    await t.runner.idle();
    await t.runner.reconcile();
    assert.equal(t.runner.getState(W1).renewNeeded, true);
    assert.ok(!t.events.includes('subscribe') && !t.events.includes('unsubscribe'), '저절로 구독하지 않는다(결정 19)');
    assert.deepEqual(t.server.of('subscribe'), []);
    assert.equal(t.store.readGuardianPush().subs.length, 1);
    t.runner.stop();

    // 기록이 있는데 브라우저 구독이 없다: renewNeeded
    const missing = setup({ subs: [subRecord(W1)], existing: null });
    await missing.runner.reconcile();
    assert.equal(missing.runner.getState(W1).renewNeeded, true);
    assert.ok(!missing.events.includes('subscribe'));
    assert.deepEqual(missing.server.of('subscribe'), []);

    // 서비스 워커 등록을 모르면 판단하지 않는다(앱 첫 실행에 등록 전일 수 있다)
    const unknown = setup({ subs: [subRecord(W1)], existing: null });
    unknown.browser.serviceWorker.getRegistration = async () => undefined;
    await unknown.runner.reconcile();
    assert.equal(unknown.runner.getState(W1).renewNeeded, false);
  });

  test('endpoint 해시가 다르면 같은 브라우저 구독으로 다시 POST 하고 한 실행에 한 번만 시도한다', async () => {
    const t = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.once('subscribe', 503);
    await t.runner.reconcile();
    assert.deepEqual(pick(t.events, ['subscribe', 'unsubscribe']), [], '같은 브라우저 구독이다');
    assert.deepEqual(t.server.of('subscribe')[0].body.subscription.endpoint, E_EXISTING);
    assert.equal(t.store.readGuardianPush().subs[0].endpointHash, hashOf(E_OLD), '실패하면 기록은 그대로');
    await t.runner.reconcile();
    assert.equal(t.server.of('subscribe').length, 1, '429·503 에서 되풀이하지 않는다');

    // 앱을 다시 열면(새 실행기) 다시 시도하고, 받아들여지면 해시와 subId 를 고친다. 옛 subId 는 해지 대기로 간다
    const again = t.make();
    await again.reconcile();
    assert.equal(t.server.of('subscribe').length, 2);
    assert.deepEqual(t.store.readGuardianPush().subs, [
      { watchId: W1, subId: subIdOf(101), lang: 'ko', endpointHash: hashOf(E_EXISTING), vapidKey: VAPID },
    ]);
    await t.store.retryPendingServerDelete();
    assert.deepEqual(
      t.server.of('unsubscribe').map((call) => call.body),
      [{ watchId: W1, subId: subRecord(W1).subId }],
    );
    await again.reconcile();
    assert.equal(t.server.of('subscribe').length, 2, '맞춘 뒤에는 할 일이 없다');
  });

  test('언어가 바뀌면 다음 다시 맞추기가 같은 구독으로 다시 POST 한다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    await t.runner.idle();
    assert.deepEqual(t.server.of('subscribe'), []);
    assert.equal(t.store.writeLang('en').ok, true);
    await until(() => t.server.of('subscribe').length === 1);
    await t.runner.idle();
    assert.equal(t.server.of('subscribe')[0].body.lang, 'en');
    assert.equal(t.store.readGuardianPush().subs[0].lang, 'en');
    assert.ok(!t.events.includes('subscribe'));
    t.runner.stop();
  });

  test('다시 POST 전에 상태를 먼저 묻고, 다른 휴대폰이 가져갔으면(subscriptionActive 거짓) 다시 POST 하지 않는다(정한 값 9)', async () => {
    // 휴대폰 2 가 다시 받기로 W1 을 가져갔다. 그 뒤 이 휴대폰(1)의 언어가 바뀌고 앱을 연다. 다시 맞추기가 상태 조회보다 먼저 다시
    // POST 하면 서버가 휴대폰 2 의 구독을 바꾸고 휴대폰 2 에 '기기가 바뀌었어요'를 보낸다
    const lang = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    lang.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: false });
    assert.equal(lang.store.writeLang('en').ok, true);
    lang.runner.start();
    await settle(80);
    await lang.runner.idle();
    assert.deepEqual(
      lang.server.routes().filter((route) => route === 'subscribe' || route === 'status'),
      ['status'],
      '상태가 먼저이고 다시 POST 는 없다',
    );
    assert.deepEqual(lang.server.of('status')[0].body, { watchId: W1, subId: subRecord(W1).subId });
    assert.equal(lang.runner.getState(W1).moved, true);
    assert.equal(lang.store.readGuardianPush().subs[0].lang, 'ko', '기록은 그대로');
    lang.runner.stop();

    // 다른 계정이 다시 켜기로 브라우저 구독을 갈아 끼워 주소 해시가 바뀐 경우도 같다
    const hash = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })], existing: { endpoint: E_EXISTING, key: VAPID } });
    hash.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: false });
    await hash.runner.reconcile();
    assert.deepEqual(hash.server.routes().filter((route) => route === 'subscribe' || route === 'status'), ['status']);
    assert.equal(hash.runner.getState(W1).moved, true);
    assert.equal(hash.store.readGuardianPush().subs[0].endpointHash, hashOf(E_OLD));
    // moved 가 된 뒤의 다시 맞추기는 묻지도 보내지도 않는다
    await hash.runner.reconcile();
    assert.equal(hash.server.of('status').length, 1);
    assert.deepEqual(hash.server.of('subscribe'), []);
  });

  test('다시 POST 앞의 상태 조회가 실패하면 이번에는 보내지 않고, 다음 다시 맞추기가 다시 묻는다', async () => {
    for (const reply of ['network', 503, 429, 401, 'off']) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      assert.equal(t.store.writeLang('en').ok, true);
      t.server.once('status', reply);
      await t.runner.reconcile();
      assert.equal(t.server.of('status').length, 1, String(reply));
      assert.deepEqual(t.server.of('subscribe'), [], `조회가 실패하면 다시 POST 하지 않는다(${reply})`);
      assert.equal(t.store.readGuardianPush().subs[0].lang, 'ko');
      assert.equal(t.runner.getState(W1).lastResult, null, `바탕 길은 실패 결과를 남기지 않는다(${reply})`);
      // 시도로 세지 않았다: 2분(STATUS_MIN_GAP_MS) 뒤의 다시 맞추기가 다시 묻고, 활성이면 보낸다
      t.clock.ms += STATUS_MIN_GAP_MS;
      await t.runner.reconcile();
      assert.deepEqual(
        t.server.routes().filter((route) => route === 'subscribe' || route === 'status'),
        ['status', 'status', 'subscribe'],
        String(reply),
      );
      assert.equal(t.store.readGuardianPush().subs[0].lang, 'en');
    }

    // 404 는 지켜보기가 없어진 것이다: gone 이고 다시 POST 하지 않으며 해지도 보내지 않는다
    const gone = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(gone.store.writeLang('en').ok, true);
    gone.server.once('status', 404);
    await gone.runner.reconcile();
    assert.deepEqual(gone.server.of('subscribe'), []);
    assert.deepEqual(gone.store.readGuardianPush(), { subs: [], status: [], gone: [W1] });
    assert.equal(gone.runner.getState(W1).lastResult, PUSH_RESULT.GONE);
    await gone.store.retryPendingServerDelete();
    assert.deepEqual(gone.server.of('unsubscribe'), []);
  });

  test('다시 POST 앞의 상태 조회가 실패했으면 2분 안의 다시 맞추기는 묻지도 보내지도 않고, 2분이 지나면 다시 묻는다(429 되풀이 없음)', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.status = () => 429;
    assert.equal(t.store.writeLang('en').ok, true);
    await t.runner.reconcile();
    assert.equal(t.server.of('status').length, 1, '첫 다시 맞추기는 묻는다');
    // 화면 복귀, 온라인 복귀, 저장소 알림이 2분 안에 다섯 번 다시 맞춘다
    for (let i = 0; i < 5; i += 1) {
      t.clock.ms += 20_000;
      await t.runner.reconcile();
    }
    assert.equal(t.server.of('status').length, 1, '2분 안에는 다시 묻지 않는다');
    assert.deepEqual(t.server.of('subscribe'), []);
    assert.equal(t.store.readGuardianPush().subs[0].lang, 'ko');
    // 2분이 지나면 다시 묻고, 활성이면 보낸다
    t.clock.ms = T0 + STATUS_MIN_GAP_MS;
    t.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: true });
    await t.runner.reconcile();
    assert.deepEqual(t.server.routes().filter((route) => route === 'subscribe' || route === 'status'), ['status', 'status', 'subscribe']);
    assert.equal(t.store.readGuardianPush().subs[0].lang, 'en');

    // 성공한 조회는 막지 않는다: 2분 안이어도 다시 POST 앞에서 다시 묻는다(다른 휴대폰이 그새 가져갔을 수 있다)
    const ok = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await ok.runner.refreshStatus(W1, { force: true }), 'OK');
    assert.equal(ok.store.writeLang('en').ok, true);
    ok.clock.ms += 1_000;
    await ok.runner.reconcile();
    assert.deepEqual(ok.server.routes().filter((route) => route === 'subscribe' || route === 'status'), ['status', 'status', 'subscribe']);
  });

  test('다시 POST 앞의 상태가 활성이면 다시 POST 한다: 상태, 그다음 구독 순서이고 언어 바뀜이 서버에 닿는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(t.store.writeLang('en').ok, true);
    await t.runner.reconcile();
    assert.deepEqual(t.server.routes().filter((route) => route === 'subscribe' || route === 'status'), ['status', 'subscribe']);
    assert.deepEqual(t.server.of('status')[0].body, { watchId: W1, subId: subRecord(W1).subId });
    assert.equal(t.server.of('subscribe')[0].body.lang, 'en');
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, E_EXISTING, '같은 브라우저 구독이다');
    assert.deepEqual(t.store.readGuardianPush().subs, [
      { watchId: W1, subId: subIdOf(101), lang: 'en', endpointHash: hashOf(E_EXISTING), vapidKey: VAPID },
    ]);
    assert.equal(t.runner.getState(W1).moved, false);
    // 앱 열기의 상태 조회는 방금 물었으니 건너뛴다(2분 간격)
    assert.equal(await t.runner.refreshStatus(W1), null);
    assert.equal(t.server.of('status').length, 1);
  });

  test('사본에 watchId 가 없으면 config 도 부르지 않는다', async () => {
    const t = setup({ copies: [{ watchId: null }] });
    t.runner.start();
    await t.runner.idle();
    await t.runner.prepare(W1);
    await t.runner.prepare(undefined);
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), null);
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    await t.runner.reconcile();
    assert.deepEqual(t.server.routes(), []);
    assert.deepEqual(t.events, []);
    t.runner.stop();
  });

  test('config 를 못 읽으면 구독 기록을 바꾸지 않는다', async () => {
    for (const reply of ['network', 503, json(200, { ok: true, enabled: true, vapidPublicKey: 'not-a-key', guardianLoginRequired: true })]) {
      const t = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD), lang: 'en' })], existing: { endpoint: E_EXISTING, key: VAPID } });
      t.server.reply.config = () => reply;
      const before = t.store.readGuardianPush();
      await t.runner.reconcile();
      await t.runner.refreshStatus(W1, { force: true });
      assert.equal(t.store.readGuardianPush(), before, String(reply));
      assert.deepEqual(
        t.server.routes().filter((route) => route !== 'config'),
        [],
      );
      const state = t.runner.getState(W1);
      assert.equal(state.config, null);
      assert.equal(state.renewNeeded, false);
    }
  });

  test('config 꺼짐이면 구독·상태·함께 있음 요청이 0건이다', async () => {
    const t = setup({ config: CONFIG_OFF, subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    await t.runner.idle();
    await t.runner.prepare(W1);
    await t.runner.reconcile();
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), null);
    assert.equal(await t.runner.mute(W1, true), PUSH_RESULT.OFF);
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.OFF);
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.OFF);
    assert.equal(await t.runner.renew(), PUSH_RESULT.OFF);
    assert.deepEqual(t.server.routes(), ['config'], '설정 읽기 하나뿐이다');
    assert.deepEqual(
      pick(t.events, ['requestPermission', 'swInfo', 'update', 'getSubscription', 'subscribe', 'unsubscribe']),
      [],
      '꺼짐이면 푸시 API 와 서비스 워커도 건드리지 않는다',
    );
    const state = t.runner.getState(W1);
    assert.equal(state.config.enabled, false);
    assert.equal(state.renewNeeded, false);
    assert.equal(t.store.readGuardianPush().subs.length, 1, 'PAUSED: 구독 기록은 그대로');
    // 끄기는 스위치와 무관하게 해지를 보낸다
    assert.equal(await t.runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
    assert.deepEqual(t.server.routes(), ['config', 'unsubscribe']);
    t.runner.stop();
  });

  test('기기 알림 스위치를 끄면 모두 끄고, 권한이 사라졌으면 PERMISSION_LOST 를 한 번 둔다', async () => {
    const t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W1), subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    await t.runner.idle();
    const configReads = t.server.of('config').length;
    assert.equal(t.store.writePrefs({ notifications: false }).ok, true);
    await until(() => t.store.readGuardianPush().subs.length === 0);
    await t.runner.idle();
    await t.store.retryPendingServerDelete();
    assert.equal(t.server.of('unsubscribe').length, 2);
    assert.ok(t.events.includes('unsubscribe'), '마지막 구독이라 브라우저 구독도 지운다');
    assert.equal(t.runner.getState(W1).lastResult, null, '스위치를 끈 것은 권한을 잃은 것이 아니다');
    assert.equal(t.server.of('config').length, configReads, '끄기만 할 때는 설정을 읽지 않는다');
    t.runner.stop();

    const lost = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    lost.NotificationImpl.permission = 'denied';
    await lost.runner.reconcile();
    assert.deepEqual(lost.store.readGuardianPush().subs, []);
    assert.equal(lost.runner.getState(W1).lastResult, PUSH_RESULT.PERMISSION_LOST);
    assert.ok(!lost.events.includes('subscribe'));
  });

  test('다시 맞추기가 끄는 구독도 대기 상한에 밀리면(queued 거짓) 해지를 한 번 직접 보내고, 닿지 않으면 OFF_UNSENT', async () => {
    for (const [reply, result] of [
      [200, null],
      [404, null],
      [503, PUSH_RESULT.OFF_UNSENT],
      ['network', PUSH_RESULT.OFF_UNSENT],
    ]) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      const watches = fullOfWatchDeletes();
      putRaw(t.storage, DEVICE_KEY.pendingServerDelete, watches);
      t.server.reply.watchDelete = () => 503;
      t.server.reply.unsubscribe = () => reply;
      let seen = 'none';
      t.runner.subscribe(() => {
        seen = t.runner.getState(W1).lastResult;
      });
      assert.equal(t.store.writePrefs({ notifications: false }).ok, true);
      await t.runner.reconcile();
      await t.runner.idle();
      assert.deepEqual(t.store.readGuardianPush().subs, []);
      assert.deepEqual(
        t.server.of('unsubscribe').map((call) => call.body),
        [{ watchId: W1, subId: subRecord(W1).subId }],
        '대기에 들어가지 못한 해지를 직접 한 번 보낸다',
      );
      assert.deepEqual(t.store.readPendingServerDelete(), watches, '대기의 지켜보기 삭제는 그대로');
      assert.equal(t.runner.getState(W1).lastResult, result, String(reply));
      assert.equal(seen, result, `화면 구독자가 마지막으로 본 결과(${reply})`);
    }

    // 권한을 잃어 끈 것이면 직접 해지가 닿지 않아도 권한 안내를 남긴다(권한 없이는 남은 서버 구독이 알림을 띄우지 못한다)
    const lost = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    putRaw(lost.storage, DEVICE_KEY.pendingServerDelete, fullOfWatchDeletes());
    lost.server.reply.watchDelete = () => 503;
    lost.server.reply.unsubscribe = () => 503;
    lost.NotificationImpl.permission = 'denied';
    await lost.runner.reconcile();
    assert.equal(lost.server.of('unsubscribe').length, 1);
    assert.equal(lost.runner.getState(W1).lastResult, PUSH_RESULT.PERMISSION_LOST);
  });

  test('다시 맞추기가 이 계정의 마지막 구독을 꺼도 다른 계정이 쓰는 브라우저 구독은 지우지 않는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    putRaw(t.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), { subs: [subRecord(W2)], status: [], gone: [] });
    assert.equal(t.store.writePrefs({ notifications: false }).ok, true);
    await t.runner.reconcile();
    await t.runner.idle();
    assert.deepEqual(t.store.readGuardianPush().subs, []);
    assert.ok(!t.events.includes('unsubscribe'), '다른 계정이 쓰는 브라우저 구독이다');
    assert.notEqual(t.browser.current, null);
  });

  test('moved 이면 언어·해시가 바뀌어도 다시 POST 하지 않는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: false });
    t.runner.start();
    await t.runner.idle();
    assert.equal(t.runner.getState(W1).moved, true);
    // 언어가 바뀐다(저장소 알림으로 다시 맞추기가 돈다)
    assert.equal(t.store.writeLang('en').ok, true);
    await settle(60);
    await t.runner.idle();
    // 브라우저 구독의 endpoint 가 바뀐다
    t.browser.current = t.browser.makeSub(E_OLD, VAPID);
    await t.runner.reconcile();
    assert.deepEqual(t.server.of('subscribe'), [], '다른 휴대폰의 구독을 되찾지 않는다(서버가 그 휴대폰에 기기 바뀜을 보낸다)');
    const state = t.runner.getState(W1);
    assert.equal(state.moved, true, 'moved 는 다시 받기로만 푼다');
    assert.equal(state.renewNeeded, false);
    t.runner.stop();

    // 다시 켜기도 moved 를 건너뛴다
    const oldSub = (watchId) => subRecord(watchId, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) });
    const r = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [oldSub(W1), oldSub(W2)], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    assert.equal(r.store.writeGuardianPush({ subs: [oldSub(W1), oldSub(W2)], status: [movedStatus(W1)], gone: [] }).ok, true);
    await r.runner.reconcile();
    assert.equal(r.runner.getState(W2).renewNeeded, true);
    assert.equal(await r.runner.renew(), PUSH_RESULT.ON);
    assert.deepEqual(r.server.of('subscribe').map((call) => call.body.watchId), [W2]);
    assert.equal(r.runner.getState(W1).moved, true);
    assert.equal(r.runner.getState(W1).lastResult, null);
    assert.equal(r.runner.getState(W2).renewNeeded, false);

    // moved 만 남으면 다시 켜기는 브라우저를 건드리지 않는다
    const m = setup({ subs: [oldSub(W1)], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    assert.equal(m.store.writeGuardianPush({ subs: [oldSub(W1)], status: [movedStatus(W1)], gone: [] }).ok, true);
    assert.equal(await m.runner.renew(), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(pick(m.events, ['getSubscription', 'subscribe', 'unsubscribe']), []);
    assert.deepEqual(m.server.routes(), []);
  });

  test('다시 맞추기가 설정을 기다리는 사이 계정이 바뀌면 브라우저 구독을 읽지도 다시 POST 하지도 않는다', async () => {
    const t = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.once('config', 'hang');
    const reconciling = t.runner.reconcile();
    await until(() => t.server.hanging === 1);
    signIn(t.store, t.clock, ACCOUNT_B);
    t.server.release();
    await reconciling;
    await t.runner.idle();
    assert.deepEqual(pick(t.events, ['getSubscription', 'subscribe', 'unsubscribe']), []);
    assert.deepEqual(t.server.of('subscribe'), []);
  });

  test('줄에서 기다리는 사이 사본이 지워지면 켜기는 UNAVAILABLE 이고 구독하지 않는다', async () => {
    const t = setup({
      copies: [{ watchId: W1 }, { watchId: W2 }],
      subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })],
      existing: { endpoint: E_EXISTING, key: VAPID },
    });
    t.server.once('subscribe', 'hang');
    const reconciling = t.runner.reconcile();
    await until(() => t.server.hanging === 1);
    const on = t.runner.turnOn(W2);
    assert.equal(t.store.removeGuardianCopy('copy2').ok, true);
    t.server.release();
    await reconciling;
    assert.equal(await on, PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(t.server.of('subscribe').map((call) => call.body.watchId), [W1], '다시 맞추기의 POST 하나뿐이다');
  });

  test('reconcile 을 겹쳐 불러도 요청은 한 차례다', async () => {
    const t = setup({ subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })], existing: { endpoint: E_EXISTING, key: VAPID } });
    const a = t.runner.reconcile();
    const b = t.runner.reconcile();
    const c = t.runner.reconcile();
    assert.equal(a, b);
    assert.equal(b, c);
    await a;
    assert.equal(t.server.of('config').length, 1);
    assert.equal(t.server.of('subscribe').length, 1);
    // 도는 중에 다시 불러도 같은 실행의 시도는 되풀이하지 않는다
    const d = t.runner.reconcile();
    const e = t.runner.reconcile();
    assert.equal(d, e);
    await d;
    assert.equal(t.server.of('subscribe').length, 1);
  });

  test('켜기·끄기는 다시 맞추기와 한 줄에서 하나씩 돈다(겹침 잠금)', async () => {
    const t = setup({
      copies: [{ watchId: W1 }, { watchId: W2 }],
      subs: [subRecord(W1, { endpointHash: hashOf(E_OLD) })],
      existing: { endpoint: E_EXISTING, key: VAPID },
    });
    t.server.once('subscribe', 'hang');
    const rec = t.runner.reconcile();
    await until(() => t.server.hanging === 1);
    const on = t.runner.turnOn(W2);
    await settle();
    assert.equal(t.server.of('subscribe').length, 1, '켜기는 다시 맞추기 뒤에 줄 선다');
    assert.equal(pick(t.events, ['getSubscription']).length, 1, '켜기는 아직 브라우저 구독을 읽지 않았다');
    t.server.release();
    await rec;
    assert.equal(await on, PUSH_RESULT.ON);
    assert.ok(!t.events.includes('unsubscribe'), '다시 맞춘 구독을 켜기가 지우지 않는다');
    assert.ok(!t.events.includes('subscribe'));
    assert.deepEqual(
      t.server.of('subscribe').map((call) => [call.body.watchId, call.body.subscription.endpoint]),
      [
        [W1, E_EXISTING],
        [W2, E_EXISTING],
      ],
    );
    assert.deepEqual(
      t.store.readGuardianPush().subs.map((item) => [item.watchId, item.endpointHash]),
      [
        [W1, hashOf(E_EXISTING)],
        [W2, hashOf(E_EXISTING)],
      ],
    );
  });
});

// ── 상태 조회와 함께 있음 ─────────────────────────────────────────────

describe('상태 조회', () => {
  test('상태 조회: subscriptionActive 거짓이면 moved 이고 저절로 구독하지 않는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: ['14:30'], muted: false, subscriptionActive: false });
    t.runner.start();
    await t.runner.idle();
    assert.deepEqual(t.server.of('status')[0].body, { watchId: W1, subId: subRecord(W1).subId });
    const state = t.runner.getState(W1);
    assert.equal(state.moved, true);
    assert.deepEqual(state.status, { date: DATE, confirmed: ['14:30'], muted: false, active: false, atMs: T0 });
    await t.runner.reconcile();
    assert.ok(!t.events.includes('subscribe') && !t.events.includes('unsubscribe'));
    assert.deepEqual(t.server.of('subscribe'), []);
    t.runner.stop();

    // '이 휴대폰에서 다시 받기'(takeOver): 권한을 묻지 않고, 브라우저 구독을 새로 만들어 POST 한다
    t.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: true });
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.ON);
    assert.ok(!t.events.includes('requestPermission'));
    assert.equal(t.server.of('subscribe').length, 1);
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));
    const after = t.runner.getState(W1);
    assert.equal(after.moved, false);
    assert.equal(after.sub.subId, subIdOf(101));
  });

  test('다시 받기는 있는 브라우저 구독을 지우고 새로 구독해 POST 한다(MOVED 가 주소 만료일 수 있다, 이 기기의 계정이 하나일 때)', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(t.store.writeGuardianPush({ subs: [subRecord(W1)], status: [movedStatus(W1)], gone: [] }).ok, true);
    assert.equal(t.store.guardianPushElsewhere(), false, '다른 계정이 브라우저 구독을 쓰지 않는다');
    assert.equal(t.runner.getState(W1).moved, true);
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.ON);
    assert.deepEqual(
      pick(t.events, ['requestPermission', 'getSubscription', 'unsubscribe', 'subscribe', 'POST subscribe']),
      ['getSubscription', 'unsubscribe', 'subscribe', 'POST subscribe'],
      '구독을 고르지 않고 지운 뒤 새로 만든다',
    );
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));
    assert.equal(t.browser.current.endpoint, freshEndpoint(1));
    assert.deepEqual(t.store.readGuardianPush().subs, [
      { watchId: W1, subId: subIdOf(101), lang: 'ko', endpointHash: hashOf(freshEndpoint(1)), vapidKey: VAPID },
    ]);
    assert.equal(t.runner.getState(W1).moved, false);
    // 앞 subId 는 해지 대기로 간다(저장소 불변식)
    await t.store.retryPendingServerDelete();
    assert.deepEqual(t.server.of('unsubscribe').map((call) => call.body), [{ watchId: W1, subId: subRecord(W1).subId }]);
  });

  test('다시 받기 뒤 이 계정의 다른 구독은 다시 맞추기가 상태를 먼저 묻고 새 주소로 다시 POST 한다(앞서 다시 POST 한 것도)', async () => {
    const t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W1), subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    // 언어가 바뀌어 두 구독을 한 번씩 다시 POST 했다(이 실행기의 시도 기록에 남는다)
    assert.equal(t.store.writeLang('en').ok, true);
    await t.runner.reconcile();
    assert.equal(t.server.of('subscribe').length, 2);
    const record = t.store.readGuardianPush();
    assert.equal(t.store.writeGuardianPush({ ...record, status: [movedStatus(W1)] }).ok, true);
    const before = t.server.routes().length;
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.ON);
    await t.runner.idle();
    assert.deepEqual(
      t.server.routes().slice(before).filter((route) => route === 'subscribe' || route === 'status'),
      ['subscribe', 'status', 'subscribe'],
      '다시 받기 POST, 그다음 W2 상태 조회와 다시 POST',
    );
    const [take, repost] = t.server.of('subscribe').slice(2);
    assert.deepEqual([take.body.watchId, take.body.subscription.endpoint], [W1, freshEndpoint(1)]);
    assert.deepEqual([repost.body.watchId, repost.body.subscription.endpoint, repost.body.lang], [W2, freshEndpoint(1), 'en']);
    assert.deepEqual(t.store.readGuardianPush().subs.map((sub) => [sub.watchId, sub.endpointHash]), [
      [W1, hashOf(freshEndpoint(1))],
      [W2, hashOf(freshEndpoint(1))],
    ]);
  });

  test('다른 계정이 같은 브라우저 구독을 쓰면 다시 받기는 그 구독을 지우지 않고 다시 써 POST 하고, 그 계정의 구독은 그대로 맞다', async () => {
    // 지우면 B 가 다시 맞추기 전에 온 B 의 푸시를 푸시 서비스가 410 으로 돌려 서버가 B 의 구독을 지운다(B 는 알림을 잃고 MOVED)
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    const bRecord = { subs: [subRecord(W2)], status: [], gone: [] };
    putRaw(t.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), bRecord);
    assert.equal(t.store.guardianPushElsewhere(), true);
    assert.equal(t.store.writeGuardianPush({ subs: [subRecord(W1)], status: [movedStatus(W1)], gone: [] }).ok, true);
    assert.equal(await t.runner.takeOver(W1), PUSH_RESULT.ON);
    await t.runner.idle();
    assert.deepEqual(pick(t.events, ['unsubscribe', 'subscribe', 'POST subscribe']), ['POST subscribe'], '브라우저 구독을 지우지도 새로 만들지도 않는다');
    assert.equal(t.browser.current.endpoint, E_EXISTING);
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, E_EXISTING);
    assert.equal(t.runner.getState(W1).moved, false);
    assert.deepEqual(readRaw(t.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush)), bRecord, '다른 계정 기록은 건드리지 않는다');

    // B 로 바꿔 다시 맞춰도 주소가 같아 묻지도 보내지도 않는다(B 의 구독은 그대로 맞다)
    signIn(t.store, t.clock, ACCOUNT_B);
    assert.equal(t.store.writeGuardianCopy('copyB', copyOf({ watchId: W2 })).ok, true);
    assert.equal(t.store.writePrefs({ notifications: true }).ok, true);
    await t.runner.reconcile();
    assert.deepEqual(t.server.routes().filter((route) => route === 'subscribe' || route === 'status'), ['subscribe']);
    assert.deepEqual(t.store.readGuardianPush().subs, bRecord.subs);
    const b = t.runner.getState(W2);
    assert.equal(b.renewNeeded, false);
    assert.equal(b.moved, false);

    // 함께 쓰는 구독의 키가 설정과 다르면 켜기처럼 갈아 끼운다(그 구독은 어느 계정도 쓸 수 없다)
    const key = setup({ subs: [subRecord(W1, { vapidKey: VAPID_OLD })], existing: { endpoint: E_EXISTING, key: VAPID_OLD } });
    putRaw(key.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush), bRecord);
    assert.equal(key.store.writeGuardianPush({ subs: [subRecord(W1, { vapidKey: VAPID_OLD })], status: [movedStatus(W1)], gone: [] }).ok, true);
    assert.equal(await key.runner.takeOver(W1), PUSH_RESULT.ON);
    assert.deepEqual(pick(key.events, ['unsubscribe', 'subscribe', 'POST subscribe']), ['unsubscribe', 'subscribe', 'POST subscribe']);
    assert.equal(key.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));
  });

  test('함께 있음 404 가 틀린 subId(다른 기기가 가져감)이면 GONE 이 아니고 moved 다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.mute = () => 404;
    t.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: false, subscriptionActive: false });
    assert.equal(await t.runner.mute(W1, true), PUSH_RESULT.FAILED);
    assert.equal(t.server.of('status').length, 1, '상태를 다시 물어 가린다');
    const state = t.runner.getState(W1);
    assert.equal(state.gone, false);
    assert.equal(state.moved, true);
    assert.deepEqual(t.store.readGuardianPush().gone, []);
    assert.equal(t.store.readGuardianPush().subs.length, 1);
  });

  test('마감 타이머는 앞 조회와 2분 미만이어도 상태를 묻는다(force)', async () => {
    const t = setup({ copies: [{ watchId: W1, deadlines: ['12:02'] }], subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    await t.runner.idle();
    assert.equal(t.server.of('status').length, 1);
    assert.ok(t.timers.has(60_000), '마감 60초 전(12:01) 타이머');
    t.clock.ms = kst('12:01');
    assert.ok(t.timers.fire(60_000));
    await t.runner.idle();
    assert.equal(t.server.of('status').length, 2, '앞 조회 1분 뒤라도 마감 타이머는 묻는다');
    t.runner.stop();
  });

  test('실행기 자신의 기록 쓰기는 다시 맞추기를 부르지 않는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    await t.runner.idle();
    const reads = pick(t.events, ['getSubscription']).length;
    t.clock.ms += 60_000;
    const before = t.store.readGuardianPush();
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), 'OK');
    assert.notEqual(t.store.readGuardianPush(), before, '상태 기록을 실제로 썼다(atMs 가 바뀜)');
    await settle(20);
    await t.runner.idle();
    assert.equal(pick(t.events, ['getSubscription']).length, reads, '상태 기록 쓰기로 다시 맞추기가 돌지 않는다');
    // 다른 곳의 쓰기(언어 바꾸기)는 다시 맞춘다
    assert.equal(t.store.writeLang('en').ok, true);
    await settle(20);
    await t.runner.idle();
    assert.ok(pick(t.events, ['getSubscription']).length > reads);
    t.runner.stop();
  });

  test('상태 조회 404 면 gone 에 넣고 구독 기록에서 빼며 해지 요청은 보내지 않는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.once('status', 404);
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), 'NOT_FOUND');
    assert.deepEqual(t.store.readGuardianPush(), { subs: [], status: [], gone: [W1] });
    const state = t.runner.getState(W1);
    assert.equal(state.gone, true);
    assert.equal(state.sub, null);
    await t.store.retryPendingServerDelete();
    assert.deepEqual(t.server.of('unsubscribe'), []);
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), null, 'gone 이면 더 묻지 않는다');
    assert.equal(t.server.of('status').length, 1);
  });

  test('상태 조회는 앞 조회와 2분 미만이면 건너뛰고 force 면 보낸다', async () => {
    assert.equal(STATUS_MIN_GAP_MS, 2 * 60_000);
    const t = setup();
    assert.equal(await t.runner.refreshStatus(W1), 'OK');
    assert.deepEqual(t.server.of('status')[0].body, { watchId: W1 }, '구독이 없으면 subId 없이 묻는다');
    assert.deepEqual(t.runner.getState(W1).status, { date: DATE, confirmed: ['14:30'], muted: false, active: null, atMs: T0 });
    t.clock.ms += 60_000;
    assert.equal(await t.runner.refreshStatus(W1), null);
    assert.equal(t.server.of('status').length, 1);
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), 'OK');
    assert.equal(t.server.of('status').length, 2);
    t.clock.ms += STATUS_MIN_GAP_MS;
    assert.equal(await t.runner.refreshStatus(W1), 'OK');
    assert.equal(t.server.of('status').length, 3);
    // 실패한 조회도 간격을 센다(화면 복귀마다 되풀이하지 않는다)
    t.clock.ms += STATUS_MIN_GAP_MS;
    t.server.once('status', 'network');
    assert.equal(await t.runner.refreshStatus(W1), 'NETWORK');
    assert.equal(await t.runner.refreshStatus(W1), null);
    assert.equal(t.server.of('status').length, 4);
    // 겹쳐 부르면 같은 약속이다
    t.clock.ms += STATUS_MIN_GAP_MS;
    const a = t.runner.refreshStatus(W1);
    const b = t.runner.refreshStatus(W1, { force: true });
    assert.equal(a, b);
    await a;
    assert.equal(t.server.of('status').length, 5);
  });

  test('마감 60초 전과 마감 + 11분에 상태 조회 타이머가 걸린다', async () => {
    const t = setup({ copies: [{ watchId: W1, deadlines: ['14:30'] }] });
    t.runner.start();
    await t.runner.idle();
    assert.equal(t.server.of('status').length, 1, '앱 열기');
    assert.ok(t.timers.has(kst('14:29') - T0), '마감 60초 전');
    t.clock.ms = kst('14:29');
    assert.ok(t.timers.fire(kst('14:29') - T0));
    await until(() => t.server.of('status').length === 2);
    await t.runner.idle();
    assert.ok(t.timers.has(12 * 60_000), '마감 + 11분');
    t.clock.ms = kst('14:41');
    assert.ok(t.timers.fire(12 * 60_000));
    await until(() => t.server.of('status').length === 3);
    await t.runner.idle();
    const midnight = kst('00:00', '2026-10-03') + 1_000;
    assert.ok(t.timers.has(midnight - kst('14:41')), '남은 마감이 없으면 KST 자정 + 1초');

    // 화면이 보이는 동안 5분마다(poll), 멈추면 타이머를 지운다
    assert.equal(STATUS_POLL_MS, 5 * 60_000);
    const stopPoll = t.runner.poll(W1);
    assert.ok(t.timers.has(STATUS_POLL_MS));
    t.clock.ms += STATUS_POLL_MS;
    assert.ok(t.timers.fire(STATUS_POLL_MS));
    await until(() => t.server.of('status').length === 4);
    await t.runner.idle();
    stopPoll();
    assert.ok(!t.timers.has(STATUS_POLL_MS));

    t.runner.stop();
    assert.deepEqual(t.timers.delays(), [], '멈추면 타이머가 남지 않는다');
    assert.equal(t.browser.doc.count('visibilitychange'), 0);
    assert.equal(t.browser.win.count('online'), 0);
  });

  test('화면 복귀와 온라인 복귀에 다시 맞추고 상태를 묻는다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.runner.start();
    t.runner.start();
    await t.runner.idle();
    assert.equal(t.server.of('status').length, 1, 'start 는 여러 번 불러도 한 번이다');
    t.clock.ms += STATUS_MIN_GAP_MS;
    t.browser.doc.visibilityState = 'visible';
    t.browser.doc.dispatch('visibilitychange');
    await until(() => t.server.of('status').length === 2);
    t.clock.ms += STATUS_MIN_GAP_MS;
    t.browser.win.dispatch('online');
    await until(() => t.server.of('status').length === 3);
    await t.runner.idle();
    t.runner.stop();
  });

  test('함께 있음: 결과로 오늘 상태의 muted 를 고치고, 404 면 상태를 다시 물어 gone 을 가린다', async () => {
    const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(await t.runner.refreshStatus(W1, { force: true }), 'OK');
    assert.equal(await t.runner.mute(W1, true), PUSH_RESULT.MUTE_ON);
    assert.deepEqual(t.server.of('mute')[0].body, { watchId: W1, subId: subRecord(W1).subId, on: true });
    assert.equal(t.runner.getState(W1).status.muted, true);
    assert.equal(t.runner.getState(W1).lastResult, PUSH_RESULT.MUTE_ON);
    assert.equal(await t.runner.mute(W1, false), PUSH_RESULT.MUTE_OFF);
    assert.equal(t.runner.getState(W1).status.muted, false);
    assert.equal(t.server.of('status').length, 1);

    // 오늘 상태가 없으면 상태를 한 번 묻는다
    const fresh = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    fresh.server.reply.status = () => json(200, { ok: true, date: DATE, confirmed: [], muted: true, subscriptionActive: true });
    assert.equal(await fresh.runner.mute(W1, true), PUSH_RESULT.MUTE_ON);
    assert.equal(fresh.server.of('status').length, 1);
    assert.equal(fresh.runner.getState(W1).status.muted, true);

    // 404: 틀린 subId 와 지켜보기 없음이 같다. 상태를 다시 물어 가린다
    t.server.once('mute', 404);
    t.server.once('status', 404);
    assert.equal(await t.runner.mute(W1, true), PUSH_RESULT.GONE);
    assert.equal(t.runner.getState(W1).gone, true);

    // 구독이 없으면 보내지 않는다
    const none = setup();
    assert.equal(await none.runner.mute(W1, true), PUSH_RESULT.UNAVAILABLE);
    assert.deepEqual(none.server.routes(), []);
  });
});

// ── 상태와 그 밖 ─────────────────────────────────────────────────────

describe('상태와 지우기', () => {
  test('getState 는 바뀐 것이 없으면 같은 얼린 객체이고 구독자에게 알린다', async () => {
    assert.deepEqual(IDLE_STATE, {
      support: 'UNSUPPORTED',
      config: null,
      swReady: null,
      sub: null,
      status: null,
      gone: false,
      renewNeeded: false,
      moved: false,
      busy: false,
      lastResult: null,
    });
    assert.ok(Object.isFrozen(IDLE_STATE));
    const t = setup();
    const a = t.runner.getState(W1);
    assert.equal(t.runner.getState(W1), a);
    assert.ok(Object.isFrozen(a));
    assert.deepEqual(Object.keys(a).sort(), Object.keys(IDLE_STATE).sort());
    assert.equal(a.support, 'READY');
    let calls = 0;
    const unsubscribe = t.runner.subscribe(() => {
      calls += 1;
    });
    assert.equal(await t.runner.turnOn(W1), PUSH_RESULT.ON);
    assert.ok(calls > 0);
    const b = t.runner.getState(W1);
    assert.notEqual(b, a);
    assert.ok(Object.isFrozen(b) && Object.isFrozen(b.sub) && Object.isFrozen(b.config));
    assert.equal(t.runner.getState(W1), b);
    unsubscribe();
    // 지원 판별은 주입한 Notification 의 권한을 따른다
    t.NotificationImpl.permission = 'denied';
    assert.equal(t.runner.getState(W1).support, 'DENIED');
  });

  test('forgetBrowser 는 3초 한도 안에서 끝나고 실패해도 던지지 않는다', async () => {
    assert.equal(FORGET_TIMEOUT_MS, 3_000);
    const t = setup({ existing: { endpoint: E_EXISTING, key: VAPID } });
    t.browser.unsubscribeBehavior = 'hang';
    const pending = t.runner.forgetBrowser({ timeoutMs: FORGET_TIMEOUT_MS });
    assert.ok(t.timers.has(FORGET_TIMEOUT_MS), '부른 자리에서 한도를 건다');
    await settle();
    assert.ok(t.timers.fire(FORGET_TIMEOUT_MS));
    assert.equal(await pending, undefined);

    t.browser.unsubscribeBehavior = 'throw';
    assert.equal(await drive(t.runner.forgetBrowser(), t.timers), undefined);
    t.browser.serviceWorker.getRegistration = async () => {
      throw new Error('blocked');
    };
    assert.equal(await drive(t.runner.forgetBrowser(), t.timers), undefined);

    const ok = setup({ existing: { endpoint: E_EXISTING, key: VAPID } });
    await drive(ok.runner.forgetBrowser({ timeoutMs: FORGET_TIMEOUT_MS }), ok.timers);
    assert.equal(ok.browser.current, null);
    assert.deepEqual(ok.timers.delays(), [], '끝나면 한도 타이머를 지운다');
    assert.deepEqual(ok.server.routes(), [], '서버 해지는 저장소의 내 정보 지우기가 맡는다');
  });

  test('어떤 흐름에서도 console 을 부르지 않고 요청 본문은 pushRequests 허용 목록 그대로다', async () => {
    const used = [];
    const names = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
    const original = Object.fromEntries(names.map((name) => [name, console[name]]));
    for (const name of names) console[name] = () => used.push(name);
    const results = [];
    let t;
    try {
      t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], permission: 'default' });
      t.runner.start();
      results.push(await t.runner.turnOn(W1));
      results.push(await t.runner.refreshStatus(W1, { force: true }));
      results.push(await t.runner.mute(W1, true));
      results.push(await t.runner.turnOn(W2));
      t.server.once('subscribe', 'network');
      results.push(await t.runner.renew());
      results.push(await t.runner.takeOver(W1));
      t.server.once('mute', 404);
      results.push(await t.runner.mute(W1, false));
      results.push(await t.runner.turnOff(W1));
      results.push(await t.runner.turnOff(W2));
      await t.runner.forgetBrowser();
      await t.runner.idle();
      await t.store.retryPendingServerDelete();
      t.runner.stop();
    } finally {
      for (const name of names) console[name] = original[name];
    }
    assert.deepEqual(used, []);
    const allowed = new Set([...Object.values(PUSH_RESULT), 'OK', 'NOT_FOUND', 'NETWORK', null]);
    for (const result of results) assert.ok(allowed.has(result), String(result));

    const subIds = new Set();
    for (const call of t.server.calls) {
      assert.ok(!call.url.includes('?'), '쿼리가 없다');
      for (const id of [W1, W2, ...subIds]) assert.ok(!call.url.includes(id), 'URL 에 식별 값이 없다');
      const keys = call.body === null ? null : Object.keys(call.body).sort();
      if (call.route === 'config') assert.equal(call.body, null);
      if (call.route === 'subscribe') {
        assert.deepEqual(keys, ['lang', 'subscription', 'watchId']);
        assert.deepEqual(Object.keys(call.body.subscription).sort(), ['endpoint', 'keys']);
        assert.deepEqual(Object.keys(call.body.subscription.keys).sort(), ['auth', 'p256dh']);
      }
      if (call.route === 'unsubscribe') {
        assert.deepEqual(keys, ['subId', 'watchId']);
        subIds.add(call.body.subId);
      }
      if (call.route === 'status') assert.ok(['subId,watchId', 'watchId'].includes(keys.join(',')));
      if (call.route === 'mute') assert.deepEqual(keys, ['on', 'subId', 'watchId']);
    }
    assert.ok(t.server.routes().includes('subscribe') && t.server.routes().includes('mute') && t.server.routes().includes('status'));
    for (const event of t.events) if (event.includes(' ')) assert.ok(SERVER_EVENTS.has(event), event);
  });
});

// ── 같은 기기의 두 탭 ────────────────────────────────────────────────

describe('같은 기기의 두 탭(Web Locks)', () => {
  test('두 탭이 같은 언어 바뀜으로 함께 다시 맞춰도 POST 는 하나이고 기록은 서버의 지금 구독이다', async () => {
    const t = twoTabs({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.subscribe = () => 'hold';
    assert.equal(t.tab1.store.writeLang('en').ok, true);
    // 탭 1 은 저장소 알림으로, 탭 2 는 다른 탭의 storage 사건으로 거의 같이 다시 맞춘다
    const both = Promise.all([t.tab1.runner.reconcile(), t.tab2.runner.reconcile()]);
    await deliverLatestFirst(t.server, both);
    assert.equal(t.server.of('subscribe').length, 1, '두 번째 탭은 잠금 안에서 기록을 다시 읽어 이미 맞은 것을 본다');
    assert.equal(t.server.maxHeld, 1, '두 POST 가 겹치지 않는다');
    const record = t.tab2.store.readGuardianPush();
    assert.deepEqual(
      record.subs.map((sub) => [sub.watchId, sub.subId, sub.lang]),
      [[W1, t.server.current.get(W1), 'en']],
      '기록은 하나이고 서버의 지금 구독이다',
    );
    await t.tab1.store.retryPendingServerDelete();
    await t.tab2.store.retryPendingServerDelete();
    assert.equal(t.server.current.get(W1), record.subs[0].subId, '서버의 지금 구독이 지워지지 않는다');
    assert.ok(!t.store.readPendingServerDelete().some((item) => item.subId === record.subs[0].subId));
    assert.ok(!t.timers.has(DEVICE_LOCK_HOLD_MS), '일이 끝나면 붙잡는 시간 타이머도 지운다');
    assert.deepEqual([...t.locks.names], [DEVICE_LOCK_NAME]);
    assert.equal(t.locks.held, 0);
  });

  test('한 탭의 다시 맞추기가 도는 동안 다른 탭의 켜기는 차례를 기다리고, 끝난 기록 위에서 같은 브라우저 구독으로 POST 한다', async () => {
    const t = twoTabs({ subs: [subRecord(W1, { lang: 'en' })], existing: { endpoint: E_EXISTING, key: VAPID } });
    t.server.reply.subscribe = () => 'hold';
    const reconciling = t.tab2.runner.reconcile();
    await until(() => t.server.held.length === 1);
    const on = t.tab1.runner.turnOn(W1);
    assert.equal(t.tab1.runner.getState(W1).busy, true);
    await settle(60);
    assert.equal(t.server.held.length, 1, '켜기는 다른 탭의 다시 맞추기가 끝날 때까지 POST 하지 않는다');
    await deliverLatestFirst(t.server, Promise.all([reconciling, on]));
    assert.equal(await on, PUSH_RESULT.ON);
    assert.equal(t.server.of('subscribe').length, 2);
    assert.equal(t.server.maxHeld, 1);
    assert.ok(!t.events.includes('unsubscribe'), '다른 탭이 쓴 기록의 해시가 맞아 브라우저 구독을 다시 쓴다');
    const record = t.tab1.store.readGuardianPush();
    assert.deepEqual(record.subs.map((sub) => [sub.watchId, sub.subId]), [[W1, t.server.current.get(W1)]]);
    await t.tab1.store.retryPendingServerDelete();
    assert.equal(t.server.current.get(W1), record.subs[0].subId, '덮인 subId 의 해지는 서버의 지금 구독을 지우지 않는다');
  });

  test('잠금은 DEVICE_LOCK_HOLD_MS 까지만 붙잡고, 앞 탭의 일이 실패해도 풀린다', async () => {
    const t = twoTabs({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    // 탭 1 의 끄기가 브라우저 구독 지우기에서 멈춘다(이 기기의 마지막 구독이라 지운다). 호출 한도(BROWSER_PUSH_TIMEOUT_MS) 타이머는
    // 부르지 않는다: 한 일이 여러 번 기다려 붙잡는 시간을 먼저 넘긴 경우다
    t.browser.unsubscribeBehavior = 'hang';
    void t.tab1.runner.turnOff(W1);
    await until(() => t.events.includes('unsubscribe'));
    let status = 'waiting';
    t.tab2.runner.refreshStatus(W1, { force: true }).then((kind) => {
      status = kind;
    });
    await settle(60);
    assert.equal(status, 'waiting', '다른 탭은 차례를 기다린다');
    assert.deepEqual(t.server.of('status'), []);
    assert.ok(t.timers.fire(DEVICE_LOCK_HOLD_MS));
    await until(() => status !== 'waiting', '붙잡는 시간이 지나면 다른 탭이 차례를 받는다');
    assert.equal(status, 'OK');

    // 앞 탭의 일이 던져도(여기서는 저장소가 던짐) 잠금이 풀려 다음 탭이 돈다
    const u = twoTabs({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    const broken = {
      ...u.tab1.store,
      retireGuardianPushSub: () => {
        throw new Error('storage broke');
      },
    };
    const brokenRunner = runnerFor(u, { store: broken, locks: u.locks });
    assert.equal(await brokenRunner.turnOff(W1), PUSH_RESULT.FAILED);
    assert.equal(u.locks.held, 0);
    assert.equal(await u.tab2.runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
  });

  test('Web Locks 가 없거나 잠금 요청이 실패하면 탭 안 줄로만 지키고 던지지 않는다', async () => {
    const variants = [
      ['없음', null],
      ['request 없음', {}],
      [
        '동기 예외',
        {
          request() {
            throw new Error('SecurityError');
          },
        },
      ],
      ['거절', { request: () => Promise.reject(new Error('AbortError')) }],
    ];
    for (const [name, locks] of variants) {
      const t = setup();
      const runner = runnerFor(t, { locks });
      assert.equal(await runner.turnOn(W1), PUSH_RESULT.ON, name);
      assert.equal(await runner.refreshStatus(W1, { force: true }), 'OK', name);
      assert.equal(await runner.turnOff(W1), PUSH_RESULT.OFF_DONE, name);
    }

    // 넘기지 않으면 navigator.locks 를 쓴다
    const t = setup();
    const locks = fakeLocks();
    t.browser.nav.locks = locks;
    const runner = runnerFor(t);
    assert.equal(await runner.turnOn(W1), PUSH_RESULT.ON);
    assert.ok(locks.grants > 0);
    assert.deepEqual([...locks.names], [DEVICE_LOCK_NAME]);
  });

  test('권한 창 기다림은 잠금 밖이다', async () => {
    const t = twoTabs({ permission: 'default', copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W2)], existing: { endpoint: E_EXISTING, key: VAPID } });
    const answer = holdPermission(t);
    const on = t.tab1.runner.turnOn(W1);
    await settle(30);
    assert.equal(t.locks.held, 0, '권한 답을 기다리는 동안 잠금을 잡지 않는다');
    let status = 'waiting';
    t.tab2.runner.refreshStatus(W2, { force: true }).then((kind) => {
      status = kind;
    });
    await until(() => status !== 'waiting', '다른 탭의 상태 조회가 권한 창 뒤에서 기다린다');
    answer('granted');
    assert.equal(await on, PUSH_RESULT.ON);
  });
});

// ── 브라우저 푸시 호출 한도 · 일 시작의 계정 대조 ─────────────────────────

describe('브라우저 푸시 호출 한도', () => {
  /** 끝나지 않는 약속 */
  const never = () => new Promise(() => {});
  /** 가짜 브라우저의 호출 하나를 끝나지 않게 바꾼다(이름은 사건으로 남긴다) */
  function hang(t, call) {
    if (call === 'getRegistration') t.browser.serviceWorker.getRegistration = never;
    if (call === 'unsubscribe') t.browser.unsubscribeBehavior = 'hang';
    if (call === 'getSubscription' || call === 'subscribe') {
      t.browser.pushManager[call] = () => {
        t.events.push(call);
        return never();
      };
    }
  }

  test('한도는 10초이고 subscribe 만 30초다(첫 구독은 느릴 수 있다)', () => {
    assert.equal(BROWSER_PUSH_TIMEOUT_MS, 10_000);
    assert.equal(BROWSER_SUBSCRIBE_TIMEOUT_MS, 30_000);
  });

  test('subscribe 는 BROWSER_SUBSCRIBE_TIMEOUT_MS 까지 기다린다: 10초 타이머가 없고, 그 안에 끝나면 그 구독으로 POST 하고, 넘기면 FAILED', async () => {
    const t = setup();
    const original = t.browser.pushManager.subscribe;
    let finish = null;
    t.browser.pushManager.subscribe = (options) =>
      new Promise((resolve) => {
        finish = () => resolve(original(options));
      });
    const on = t.runner.turnOn(W1);
    await until(() => finish !== null, 'subscribe 를 부르지 않았다');
    await settle(10);
    assert.ok(t.timers.has(BROWSER_SUBSCRIBE_TIMEOUT_MS), 'subscribe 에 30초 한도');
    assert.equal(t.timers.has(BROWSER_PUSH_TIMEOUT_MS), false, 'subscribe 에 10초 한도가 걸리지 않는다');
    assert.equal(t.runner.getState(W1).busy, true);
    finish();
    assert.equal(await on, PUSH_RESULT.ON);
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));
    assert.equal(t.timers.has(BROWSER_SUBSCRIBE_TIMEOUT_MS), false, '끝난 뒤 남은 한도 타이머가 없다');

    const late = setup();
    hang(late, 'subscribe');
    const failed = late.runner.turnOn(W1);
    await until(() => late.timers.has(BROWSER_SUBSCRIBE_TIMEOUT_MS), '30초 한도가 걸리지 않았다');
    assert.equal(late.timers.fire(BROWSER_PUSH_TIMEOUT_MS), false);
    assert.ok(late.timers.fire(BROWSER_SUBSCRIBE_TIMEOUT_MS));
    assert.equal(await failed, PUSH_RESULT.FAILED);
    assert.deepEqual(late.server.of('subscribe'), []);
  });

  test('끄기: 브라우저 호출이 끝나지 않아도 한도 뒤 서버 해지를 보내고 결과는 늘 하던 대로이며 다음 일이 돈다', async () => {
    for (const [call, reply, result] of [
      ['unsubscribe', 200, PUSH_RESULT.OFF_DONE],
      ['unsubscribe', 503, PUSH_RESULT.OFF_PENDING],
      ['getSubscription', 200, PUSH_RESULT.OFF_DONE],
      ['getRegistration', 200, PUSH_RESULT.OFF_DONE],
    ]) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      t.server.reply.unsubscribe = () => reply;
      hang(t, call);
      const off = t.runner.turnOff(W1);
      await settle(30);
      assert.equal(t.runner.getState(W1).busy, true, call);
      assert.ok(t.timers.has(BROWSER_PUSH_TIMEOUT_MS), `${call} 에 한도 타이머가 걸린다`);
      assert.equal(await drive(off, t.timers, BROWSER_PUSH_TIMEOUT_MS), result, `${call} ${reply}`);
      // 서버 해지는 브라우저 호출을 기다린 뒤에도 간다(503 이면 대기 재시도까지 같은 본문)
      const sent = t.server.of('unsubscribe').map((item) => item.body);
      assert.ok(sent.length >= 1, call);
      for (const body of sent) assert.deepEqual(body, { watchId: W1, subId: subRecord(W1).subId }, call);
      assert.equal(t.runner.getState(W1).busy, false, call);
      assert.equal(t.runner.getState(W1).lastResult, result, call);
      // 줄이 풀렸다: 다음 일(상태 조회, 켜기)이 끝난다
      assert.equal(await drive(t.runner.refreshStatus(W1, { force: true }), t.timers, BROWSER_PUSH_TIMEOUT_MS), 'OK', call);
      t.server.reply.unsubscribe = () => 200;
      const on = await drive(t.runner.turnOn(W1), t.timers, BROWSER_PUSH_TIMEOUT_MS);
      assert.ok([PUSH_RESULT.ON, PUSH_RESULT.FAILED, PUSH_RESULT.SW_NOT_READY].includes(on), `${call} ${on}`);
      assert.equal(t.runner.getState(W1).busy, false, call);
    }
  });

  test('켜기: subscribe 나 구독 읽기가 끝나지 않으면 FAILED, 등록 읽기가 끝나지 않으면 SW_NOT_READY 이고 POST 하지 않는다', async () => {
    for (const [call, result] of [
      ['subscribe', PUSH_RESULT.FAILED],
      ['getSubscription', PUSH_RESULT.FAILED],
      ['getRegistration', PUSH_RESULT.SW_NOT_READY],
    ]) {
      const t = setup();
      hang(t, call);
      const limit = call === 'subscribe' ? BROWSER_SUBSCRIBE_TIMEOUT_MS : BROWSER_PUSH_TIMEOUT_MS;
      assert.equal(await drive(t.runner.turnOn(W1), t.timers, limit), result, call);
      assert.deepEqual(t.server.of('subscribe'), [], call);
      assert.equal(t.store.readGuardianPush(), null, call);
      assert.equal(t.runner.getState(W1).busy, false, call);
      assert.equal(t.timers.has(BROWSER_PUSH_TIMEOUT_MS), false, `${call} 끝난 뒤 남은 한도 타이머가 없다`);
      assert.equal(t.timers.has(BROWSER_SUBSCRIBE_TIMEOUT_MS), false, `${call} 끝난 뒤 남은 구독 한도 타이머가 없다`);
    }

    // 키가 다른 구독을 지우는 unsubscribe 가 끝나지 않아도 한도 뒤 새로 구독한다
    const t = setup({ existing: { endpoint: E_EXISTING, key: VAPID_OLD } });
    hang(t, 'unsubscribe');
    assert.equal(await drive(t.runner.turnOn(W1), t.timers, BROWSER_PUSH_TIMEOUT_MS), PUSH_RESULT.ON);
    assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));
  });

  test('다시 맞추기: 구독 읽기나 끄는 쪽의 unsubscribe 가 끝나지 않아도 한도 뒤 끝나고, 읽지 못한 차례는 판단하지 않는다', async () => {
    const read = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(read.store.writeLang('en').ok, true);
    const original = read.browser.pushManager.getSubscription;
    hang(read, 'getSubscription');
    await drive(read.runner.reconcile(), read.timers, BROWSER_PUSH_TIMEOUT_MS);
    assert.deepEqual(read.server.routes().filter((route) => route !== 'config'), [], '브라우저 구독을 모르면 묻지도 보내지도 않는다');
    read.browser.pushManager.getSubscription = original;
    await read.runner.reconcile();
    assert.deepEqual(read.server.routes().filter((route) => route === 'status' || route === 'subscribe'), ['status', 'subscribe']);

    // 사본이 없어진 구독을 끄고 이 기기의 마지막이라 브라우저 구독을 지운다
    const retire = setup({ copies: [], subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    hang(retire, 'unsubscribe');
    await drive(retire.runner.reconcile(), retire.timers, BROWSER_PUSH_TIMEOUT_MS);
    assert.deepEqual(retire.store.readGuardianPush().subs, []);
    await retire.store.retryPendingServerDelete();
    assert.deepEqual(retire.server.of('unsubscribe').map((item) => item.body), [{ watchId: W1, subId: subRecord(W1).subId }]);
  });

  test('다시 켜기·다시 받기: 브라우저 호출이 끝나지 않아도 한도 뒤 끝나고 busy 가 풀린다', async () => {
    const oldSub = (watchId) => subRecord(watchId, { vapidKey: VAPID_OLD, endpointHash: hashOf(E_OLD) });
    const subscribe = setup({ subs: [oldSub(W1)], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    await subscribe.runner.reconcile();
    assert.equal(subscribe.runner.getState(W1).renewNeeded, true);
    hang(subscribe, 'subscribe');
    assert.equal(await drive(subscribe.runner.renew(), subscribe.timers, BROWSER_SUBSCRIBE_TIMEOUT_MS), PUSH_RESULT.FAILED);
    assert.equal(subscribe.runner.getState(W1).busy, false);
    assert.deepEqual(subscribe.server.of('subscribe'), []);

    const unsubscribe = setup({ subs: [oldSub(W1)], existing: { endpoint: E_OLD, key: VAPID_OLD } });
    hang(unsubscribe, 'unsubscribe');
    assert.equal(await drive(unsubscribe.runner.renew(), unsubscribe.timers, BROWSER_PUSH_TIMEOUT_MS), PUSH_RESULT.ON);
    assert.equal(unsubscribe.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1));

    for (const call of ['unsubscribe', 'getSubscription']) {
      const t = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
      assert.equal(t.store.writeGuardianPush({ subs: [subRecord(W1)], status: [movedStatus(W1)], gone: [] }).ok, true);
      hang(t, call);
      assert.equal(await drive(t.runner.takeOver(W1), t.timers, BROWSER_PUSH_TIMEOUT_MS), PUSH_RESULT.ON, call);
      assert.equal(t.server.of('subscribe')[0].body.subscription.endpoint, freshEndpoint(1), call);
      assert.equal(t.runner.getState(W1).busy, false, call);
    }
    const take = setup({ subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    assert.equal(take.store.writeGuardianPush({ subs: [subRecord(W1)], status: [movedStatus(W1)], gone: [] }).ok, true);
    hang(take, 'subscribe');
    assert.equal(await drive(take.runner.takeOver(W1), take.timers, BROWSER_SUBSCRIBE_TIMEOUT_MS), PUSH_RESULT.FAILED);
    assert.deepEqual(take.server.of('subscribe'), []);
    assert.equal(take.runner.getState(W1).moved, true, '받지 못했으면 moved 그대로');
  });
});

describe('일 시작의 계정 대조(recheckAccount)', () => {
  test('줄의 일마다 잠금 안에서 store.recheckAccount 를 한 번 부른다', async () => {
    const t = setup({ copies: [{ watchId: W1 }, { watchId: W2 }], subs: [subRecord(W1)], existing: { endpoint: E_EXISTING, key: VAPID } });
    const locks = fakeLocks();
    const held = [];
    const counting = {
      ...t.store,
      recheckAccount: () => {
        held.push(locks.held);
        return false;
      },
    };
    const runner = runnerFor(t, { store: counting, locks });
    assert.equal(await runner.refreshStatus(W1, { force: true }), 'OK');
    assert.deepEqual(held, [1]);
    await runner.reconcile();
    assert.deepEqual(held, [1, 1]);
    assert.equal(await runner.turnOn(W2), PUSH_RESULT.ON);
    assert.deepEqual(held, [1, 1, 1]);
    assert.equal(await runner.turnOff(W1), PUSH_RESULT.OFF_DONE);
    assert.deepEqual(held, [1, 1, 1, 1], '잠금을 잡은 뒤, 일을 시작하기 전에 부른다');
  });

  test('대조가 계정을 바꾸면 그 일은 요청 없이 멈추고, 대조가 던져도 일은 이어진다', async () => {
    // 대조하면서 다른 계정이 보인다(가짜 저장소가 B 로 바꾼다)
    const t = setup();
    let calls = 0;
    const switching = {
      ...t.store,
      recheckAccount: () => {
        calls += 1;
        signIn(t.store, t.clock, ACCOUNT_B);
        return true;
      },
    };
    const runner = runnerFor(t, { store: switching });
    assert.equal(await runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.equal(calls, 1);
    assert.deepEqual(t.server.routes(), []);
    assert.deepEqual(pick(t.events, ['getSubscription', 'subscribe', 'swInfo']), []);
    assert.equal(readRaw(t.storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush)), null);
    assert.equal(readRaw(t.storage, accountRecordKey(ACCOUNT_B, RECORD.guardianPush)), null);

    // 실제 저장소: 다른 탭이 B 로 로그인했고 이 탭은 storage 사건을 받지 못했다(얼었던 탭). 일을 시작할 때 대조해 세션을 버린다
    const frozen = setup();
    const tab2 = createStore({ storage: frozen.storage, now: () => frozen.clock.ms, fetchImpl: async () => json(404, { ok: false }) });
    signIn(tab2, frozen.clock, ACCOUNT_B);
    assert.equal(frozen.store.getStatus().readOnly, false, '이 탭의 저장소는 아직 모른다');
    assert.equal(await frozen.runner.turnOn(W1), PUSH_RESULT.UNAVAILABLE);
    assert.equal(frozen.store.getStatus().readOnly, true);
    assert.deepEqual(frozen.server.routes(), []);
    assert.equal(readRaw(frozen.storage, accountRecordKey(ACCOUNT_A, RECORD.guardianPush)), null);

    // 대조가 던지면 지금 상태 그대로 본다
    const thrown = setup();
    const throwing = {
      ...thrown.store,
      recheckAccount: () => {
        throw new Error('storage broke');
      },
    };
    assert.equal(await runnerFor(thrown, { store: throwing }).turnOn(W1), PUSH_RESULT.ON);
  });
});
