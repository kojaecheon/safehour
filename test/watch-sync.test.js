// 서버 알림 동기화 실행기 (lib/trip/watchSync.js · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 7, D6·D9·D10·D11)
//
// 이 파일이 고정하는 것
//   - 등록: 레코드가 없으면 새 id, ON 이면 요청 없음, REPLACED 면 같은 watchId 에 새 토큰. 실패하면 레코드를 쓰지 않는다
//   - 요청은 지켜보기 하나에 한 번에 하나다. 도는 중에 온 계기는 끝난 뒤 한 번만 더 돌고, 늘 최신 전체를 보낸다
//   - 올리기 결과: OK(armFailed 가 있으면 60초 뒤 같은 전체를, 같은 상태로는 세 번까지), 404 갈아 끼움,
//     OFF·503·429 는 uploadPending 만 남기고 대기열로, 네트워크는 끝(다음 계기에 다시), 400 은 그 상태를 이번 실행에서 막는다
//   - 보기 전용이면 올리지 않고 '돌아왔어요'는 보낸다(저장소에는 backQueue 만 바뀐다)
//   - '돌아왔어요' 단계: QUEUED, SENDING, SENT(recorded: true 일 때만), FAILED, 되돌리기(UNDO_QUEUED, UNDO_FAILED),
//     새로 고친 뒤 대기열에서 다시 만들기. 자정 뒤에도 외출이 속한 날짜로 보낸다
//   - 응답 사이에 레코드가 지워지거나 다시 등록되면 결과를 쓰지 않는다
//   - 계기: 일정·체류 구독, 온라인·쓰기 가능 복귀, KST 자정 + 1초(다음 자정을 다시 건다). 지켜보기 변경은 비우기를 부르지 않는다.
//     stop() 은 타이머와 구독을 지운다
//   - 끄기(retire)는 진행 중 요청이 끝난 뒤 저장소 retireGuardianWatch 와 서버 삭제 대기를 부르고 { ok, pending } 을 돌려준다.
//     쓰기 가능하지 않거나 옮기지 못하면 ok: false 이고 아무것도 바꾸지 않는다. 서버 지우기(removeAll)
//   - 'open' 계기는 실행기 하나에 한 번. 대기열을 쓰지 못한 누르기·되돌리기는 FAILED·UNDO_FAILED. 되돌리기는 ON 에서만
//
// 저장소는 메모리, 시계·타이머·난수·요청 함수는 주입한다. 가짜 요청 함수는 진짜 요청 모양(src/guardian/watchRequests.js)으로
// 본문을 만들어 쌓는다(모양이 틀리면 그 자리에서 실패한다). 외부 호출과 벽시계는 없다. 시각은 모두 +09:00 오프셋으로 만든다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStorage, createStore } from '../lib/store/index.js';
import { getWatchSync } from '../lib/trip/client.js';
import { BACK_PHASE, createWatchSync } from '../lib/trip/watchSync.js';
import { toBase64Url } from '../src/guardian/crypto.js';
import {
  WATCH_ID_RE,
  WATCH_KIND,
  WATCH_PATHS,
  WRITE_TOKEN_RE,
  backRequest,
  configRequest,
  deadlinesRequest,
  registerRequest,
  removeAllRequest,
} from '../src/guardian/watchRequests.js';
import { makeDayPlan, patientOuting } from './guardian-fixtures.js';
import { makeStay } from './stay-fixtures.js';

const ACCOUNT = 'acct_watch_sync_test_0001';
const HOUR = 3600_000;
/** 형식에 맞는 고정 식별 값 두 벌(테스트 전용) */
const W1 = Object.freeze({ watchId: 'WATCHsyncFixture_01-ab', writeToken: 'WRITEsyncFixture_0123456789-abcdefghijklmno' });
const W2 = Object.freeze({ watchId: 'WATCHsyncFixture_02-cd', writeToken: 'WRITEsyncFixture_9876543210-onmlkjihgfedcba' });

/** KST 날짜·시각 → ms */
const kst = (date, hhmm = '12:00', ss = '00') => Date.parse(`${date}T${hhmm}:${ss}+09:00`);

const TODAY = '2026-10-02';
const BACK = Object.freeze({ date: TODAY, by: '12:30' });

/** 10-02 10:00 출발 12:30 마감, 10-03 14:00 출발 16:00 마감 (체류는 10-01 ~ 10-08) */
function basePlan(extra = {}) {
  return {
    days: {
      '2026-10-02': makeDayPlan('2026-10-02', { outings: [patientOuting({ departAt: '10:00', returnBy: '12:30' })] }),
      '2026-10-03': makeDayPlan('2026-10-03', { outings: [patientOuting({ departAt: '14:00', returnBy: '16:00' })] }),
      ...extra,
    },
  };
}

/** basePlan 에 그날 외출 하나를 더한 일정 */
function planWith(date, returnBy) {
  return basePlan({ [date]: makeDayPlan(date, { outings: [patientOuting({ departAt: '09:00', returnBy })] }) });
}

/** 12:00 KST 10-02 에 basePlan 을 올린 전체 */
const BASE_DAYS = Object.freeze([
  { date: '2026-10-02', deadlines: ['12:30'] },
  { date: '2026-10-03', deadlines: ['16:00'] },
  { date: '2026-10-04', deadlines: [] },
  { date: '2026-10-05', deadlines: [] },
  { date: '2026-10-06', deadlines: [] },
  { date: '2026-10-07', deadlines: [] },
  { date: '2026-10-08', deadlines: [] },
]);
const BASE_UPLOADED = Object.freeze(Object.fromEntries(BASE_DAYS.map(({ date, deadlines }) => [date, deadlines])));

function watchRecord(overrides = {}) {
  return { ...W1, expiresOn: '2026-10-08', lastUploaded: {}, uploadPending: true, backQueue: [], confirmed: [], state: 'ON', ...overrides };
}

const ok = (data = {}) => ({ ok: true, status: 200, data: { ok: true, ...data }, kind: WATCH_KIND.OK });
const STATUS_OF = Object.freeze({ NOT_FOUND: 404, LOGIN_REQUIRED: 401, RATE_LIMITED: 429, OFF: 503, BAD: 400, UNAVAILABLE: 503, NETWORK: 0 });
function failed(kind, status = STATUS_OF[kind]) {
  const errorCode = kind === 'NETWORK' ? 'NETWORK_ERROR' : kind === 'OFF' ? 'SAFEHOUR_SERVER_PUSH_OFF' : `HTTP_${status}`;
  return { ok: false, status, network: kind === 'NETWORK', errorCode, kind };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 마이크로태스크만 돌려 조건을 기다린다(벽시계·타이머 없음) */
async function until(predicate, message = '조건에 닿지 않았다') {
  for (let i = 0; i < 1000 && !predicate(); i += 1) await Promise.resolve();
  assert.ok(predicate(), message);
}

/**
 * 가짜 요청 함수(createWatchApi 모양). 진짜 요청 모양으로 본문을 만들어 calls 에 쌓고, 응답은 reply 로 고른다(없으면 기본값).
 * open·maxOpen 은 동시에 열린 요청 수다.
 */
function fakeApi() {
  const defaults = {
    config: () => ok({ enabled: true, vapidPublicKey: null, guardianLoginRequired: false }),
    register: (input) => ok({ expiresOn: input.expiresOn }),
    deadlines: (input) => ok({ expiresOn: input.expiresOn, armFailed: 0 }),
    back: () => ok({ recorded: true }),
    removeAll: () => ok({ deleted: 1 }),
  };
  const shape = {
    config: () => configRequest(),
    register: (input) => registerRequest(input),
    deadlines: (input) => deadlinesRequest(input),
    back: (input) => backRequest(input),
    removeAll: () => removeAllRequest(),
  };
  const replies = Object.fromEntries(Object.keys(defaults).map((name) => [name, []]));
  const api = {
    calls: [],
    open: 0,
    maxOpen: 0,
    reply(name, ...fns) {
      replies[name].push(...fns);
    },
    setDefault(name, fn) {
      defaults[name] = fn;
    },
    names: () => api.calls.map((c) => c.name),
    bodies: (name) => api.calls.filter((c) => c.name === name).map((c) => c.body),
  };
  for (const name of Object.keys(defaults)) {
    api[name] = async (input) => {
      const request = shape[name](input);
      api.calls.push({ name, method: request.method, path: request.path, body: request.body });
      api.open += 1;
      api.maxOpen = Math.max(api.maxOpen, api.open);
      try {
        const reply = replies[name].shift() ?? defaults[name];
        return await reply(input);
      } finally {
        api.open -= 1;
      }
    };
  }
  return api;
}

/** 가짜 타이머. advanceTo(ms) 가 그때까지 걸린 타이머를 시각 순서로 실행한다 */
function fakeTimers(clock) {
  let seq = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) {
      seq += 1;
      queue.set(seq, { fn, at: clock.now() + ms });
      return seq;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    advanceTo(target) {
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        queue.delete(due[0]);
        clock.set(Math.max(clock.now(), due[1].at));
        due[1].fn();
      }
      clock.set(target);
    },
    pending: () => [...queue.values()].map((t) => t.at).sort((a, b) => a - b),
  };
}

/** 주입한 난수: 부를 때마다 다음 바이트 값으로 채운다 */
function countingBytes() {
  let n = 0;
  return (size) => {
    n += 1;
    return new Uint8Array(size).fill(n);
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function signIn(store, clock) {
  store.setOnline(true);
  store.setSession({ authenticated: true, accountKey: ACCOUNT, expiresAt: new Date(clock.now() + 7 * 24 * HOUR).toISOString() });
}

/** 세션 없음(보기 전용). 읽는 계정은 마지막 로그인 계정 그대로다 */
function signOut(store) {
  store.setSession({ authenticated: false });
}

/**
 * 로그인한 메모리 저장소 + 체류·일정(+ 지켜보기 레코드) + 실행기.
 * 실행기에는 writeGuardianWatch·writeBackQueue 를 기록하는 저장소를 넘긴다(writes, queueWrites).
 * 저장소의 fetch 는 서버 삭제 대기의 DELETE 본문을 deletes 에 쌓고 deleteReply 로 답한다(기본 200).
 */
function harness({ at = kst(TODAY, '12:00'), record = null, plan = basePlan(), stay = makeStay(), deleteReply = () => json(200, { ok: true }) } = {}) {
  const clock = { ms: at, now: () => clock.ms, set: (value) => (clock.ms = value) };
  const deletes = [];
  const storeFetch = async (url, init = {}) => {
    if (url === WATCH_PATHS.watch && init.method === 'DELETE') {
      deletes.push(JSON.parse(init.body));
      return deleteReply();
    }
    return json(200, { ok: true });
  };
  const store = createStore({ storage: createMemoryStorage(), now: clock.now, fetchImpl: storeFetch });
  signIn(store, clock);
  assert.equal(store.writeStay(stay).ok, true);
  if (plan) assert.equal(store.writeTripPlan(plan).ok, true);
  if (record) assert.equal(store.writeGuardianWatch(record).ok, true);
  const writes = [];
  const queueWrites = [];
  const watched = {
    ...store,
    writeGuardianWatch(next) {
      writes.push(next === null ? null : JSON.parse(JSON.stringify(next)));
      return store.writeGuardianWatch(next);
    },
    writeBackQueue(queue, options) {
      queueWrites.push(JSON.parse(JSON.stringify(queue)));
      return store.writeBackQueue(queue, options);
    },
  };
  const timers = fakeTimers(clock);
  const api = fakeApi();
  const sync = createWatchSync({ store: watched, api, now: clock.now, timers, randomBytes: countingBytes() });
  return { clock, store, api, timers, sync, deletes, writes, queueWrites };
}

const phaseOf = (sync, target = BACK) => sync.backStatus(target)?.phase ?? null;
/** 하네스 기본 시각(10-02 12:00)에 누른 대기열 항목. 누른 시각(atMs)은 기기에만 두고 요청 본문에는 싣지 않는다 */
const AT_NOON = kst(TODAY, '12:00');

// ── 등록 (ensureRegistered, D6·다르게 정한 것 12) ─────────────────────────────

describe('등록', () => {
  test('등록: 레코드가 없으면 새 id 로 등록하고 ON, uploadPending: true 를 쓴 뒤 올린다', async () => {
    const h = harness();
    const result = await h.sync.ensureRegistered({ stay: h.store.readStay() });
    await h.sync.idle();

    // 주입한 난수로 만든 id: 첫 16바이트는 1, 다음 32바이트는 2
    const expected = { watchId: toBase64Url(new Uint8Array(16).fill(1)), writeToken: toBase64Url(new Uint8Array(32).fill(2)) };
    assert.deepEqual(result, { ok: true, watchId: expected.watchId });
    assert.match(expected.watchId, WATCH_ID_RE);
    assert.match(expected.writeToken, WRITE_TOKEN_RE);
    assert.deepEqual(h.api.names(), ['register', 'deadlines']);
    assert.deepEqual(h.api.calls[0].body, { ...expected, expiresOn: '2026-10-08' });

    // 먼저 ON, uploadPending: true 로 쓰고, 그다음 올린 결과를 쓴다
    assert.deepEqual(h.writes[0], { ...expected, expiresOn: '2026-10-08', lastUploaded: {}, uploadPending: true, backQueue: [], confirmed: [], state: 'ON' });
    assert.deepEqual(h.api.calls[1].body, { ...expected, expiresOn: '2026-10-08', days: BASE_DAYS });
    assert.deepEqual(h.store.readGuardianWatch(), {
      ...expected,
      expiresOn: '2026-10-08',
      lastUploaded: BASE_UPLOADED,
      uploadPending: false,
      backQueue: [],
      confirmed: [],
      state: 'ON',
    });
  });

  test('등록: ON 이면 요청 없이 같은 watchId 를 돌려준다', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    const result = await h.sync.ensureRegistered({ stay: h.store.readStay() });
    await h.sync.idle();
    assert.deepEqual(result, { ok: true, watchId: W1.watchId });
    assert.deepEqual(h.api.calls, []);
    assert.deepEqual(h.writes, []);
  });

  test('등록: REPLACED 면 같은 watchId 에 새 토큰으로 다시 등록한다', async () => {
    const lastUploaded = { '2026-10-02': ['12:30'] };
    const h = harness({ record: watchRecord({ state: 'REPLACED', uploadPending: false, lastUploaded }) });
    const result = await h.sync.ensureRegistered({ stay: h.store.readStay() });
    await h.sync.idle();

    assert.deepEqual(result, { ok: true, watchId: W1.watchId });
    const body = h.api.calls[0].body;
    assert.equal(h.api.calls[0].name, 'register');
    assert.equal(body.watchId, W1.watchId);
    assert.notEqual(body.writeToken, W1.writeToken);
    assert.match(body.writeToken, WRITE_TOKEN_RE);
    assert.equal(body.expiresOn, '2026-10-08');
    // 마지막으로 올린 것은 그대로 두고(서버의 지난 마감 확인을 위해) 켠 뒤 새 토큰으로 올린다
    assert.deepEqual(h.writes[0], { ...W1, writeToken: body.writeToken, expiresOn: '2026-10-08', lastUploaded, uploadPending: true, backQueue: [], confirmed: [], state: 'ON' });
    assert.deepEqual(h.api.names(), ['register', 'deadlines']);
    assert.equal(h.api.calls[1].body.writeToken, body.writeToken);
    assert.equal(h.store.readGuardianWatch().state, 'ON');
    assert.equal(h.store.readGuardianWatch().writeToken, body.writeToken);
  });

  test('등록 실패 이유: 401 LOGIN_REQUIRED, 429 RATE_LIMITED, 503 OFF, 그 밖·네트워크 UNAVAILABLE, 레코드를 쓰지 않는다', async () => {
    const cases = [
      [failed('LOGIN_REQUIRED'), 'LOGIN_REQUIRED'],
      [failed('RATE_LIMITED'), 'RATE_LIMITED'],
      [failed('OFF'), 'OFF'],
      [failed('UNAVAILABLE'), 'UNAVAILABLE'],
      [failed('UNAVAILABLE', 500), 'UNAVAILABLE'],
      [failed('BAD'), 'UNAVAILABLE'],
      [failed('NOT_FOUND'), 'UNAVAILABLE'],
      [failed('NETWORK'), 'UNAVAILABLE'],
    ];
    for (const [reply, reason] of cases) {
      const h = harness();
      h.api.reply('register', () => reply);
      const result = await h.sync.ensureRegistered({ stay: h.store.readStay() });
      await h.sync.idle();
      assert.deepEqual(result, { ok: false, reason }, reply.kind);
      assert.equal(h.store.readGuardianWatch(), null, reply.kind);
      assert.deepEqual(h.writes, [], reply.kind);
      assert.deepEqual(h.api.names(), ['register'], reply.kind);
    }
  });

  test('등록: 출국일이 오늘보다 앞이거나 보기 전용이면 요청하지 않는다', async () => {
    const past = harness({ at: kst('2026-10-09', '09:00') });
    assert.deepEqual(await past.sync.ensureRegistered({ stay: past.store.readStay() }), { ok: false, reason: 'UNAVAILABLE' });
    // 출국일 당일은 된다
    const sameDay = harness({ at: kst('2026-10-08', '09:00') });
    assert.equal((await sameDay.sync.ensureRegistered({ stay: sameDay.store.readStay() })).ok, true);

    const noSession = harness();
    signOut(noSession.store);
    assert.deepEqual(await noSession.sync.ensureRegistered({ stay: noSession.store.readStay() }), { ok: false, reason: 'LOGIN_REQUIRED' });
    const offline = harness();
    offline.store.setOnline(false);
    assert.deepEqual(await offline.sync.ensureRegistered({ stay: offline.store.readStay() }), { ok: false, reason: 'UNAVAILABLE' });
    for (const h of [past, noSession, offline]) {
      assert.deepEqual(h.api.calls, []);
      assert.equal(h.store.readGuardianWatch(), null);
    }
  });

  test('등록: REPLACED 다시 등록이 404 면 레코드를 지우고(다음에 새 id) UNAVAILABLE, 그 밖 실패는 레코드를 그대로 둔다', async () => {
    const gone = harness({ record: watchRecord({ state: 'REPLACED' }) });
    gone.api.reply('register', () => failed('NOT_FOUND'));
    assert.deepEqual(await gone.sync.ensureRegistered({ stay: gone.store.readStay() }), { ok: false, reason: 'UNAVAILABLE' });
    assert.equal(gone.store.readGuardianWatch(), null);
    assert.deepEqual(gone.deletes, [], '서버 삭제 대기를 만들지 않는다(예전 토큰은 이미 통하지 않는다)');
    // 다음 등록은 새 id 다
    const next = await gone.sync.ensureRegistered({ stay: gone.store.readStay() });
    assert.equal(next.ok, true);
    assert.notEqual(next.watchId, W1.watchId);

    const limited = harness({ record: watchRecord({ state: 'REPLACED' }) });
    limited.api.reply('register', () => failed('RATE_LIMITED'));
    assert.deepEqual(await limited.sync.ensureRegistered({ stay: limited.store.readStay() }), { ok: false, reason: 'RATE_LIMITED' });
    assert.equal(limited.store.readGuardianWatch().state, 'REPLACED');
    assert.equal(limited.store.readGuardianWatch().writeToken, W1.writeToken);
  });

  test('등록: 응답 사이에 다른 계정으로 바뀌면 그 계정에 레코드를 쓰지 않는다', async () => {
    const h = harness();
    const gate = deferred();
    h.api.reply('register', async () => {
      await gate.promise;
      return ok({});
    });
    const pending = h.sync.ensureRegistered({ stay: h.store.readStay() });
    await until(() => h.api.open === 1);
    h.store.setSession({ authenticated: true, accountKey: 'acct_watch_sync_test_0002', expiresAt: new Date(h.clock.now() + HOUR).toISOString() });
    assert.equal(h.store.readGuardianWatch(), null, '바뀐 계정에도 레코드가 없다');
    gate.resolve();
    assert.deepEqual(await pending, { ok: false, reason: 'UNAVAILABLE' });
    assert.equal(h.store.readGuardianWatch(), null, '다른 계정으로 만든 지켜보기를 이 계정에 쓰지 않는다');
    assert.deepEqual(h.writes, []);
  });

  test('등록: 응답 사이에 레코드가 바뀌면 같은 계정의 켜진 지켜보기만 돌려준다(다른 계정의 id 는 돌려주지 않는다)', async () => {
    const otherAccount = harness();
    const gate = deferred();
    otherAccount.api.reply('register', async () => {
      await gate.promise;
      return ok({});
    });
    const pending = otherAccount.sync.ensureRegistered({ stay: otherAccount.store.readStay() });
    await until(() => otherAccount.api.open === 1);
    otherAccount.store.setSession({
      authenticated: true,
      accountKey: 'acct_watch_sync_test_0002',
      expiresAt: new Date(otherAccount.clock.now() + HOUR).toISOString(),
    });
    assert.equal(otherAccount.store.writeGuardianWatch(watchRecord({ ...W2 })).ok, true);
    gate.resolve();
    assert.deepEqual(await pending, { ok: false, reason: 'UNAVAILABLE' }, '다른 계정의 켜진 지켜보기 id 를 링크에 싣지 않는다');
    assert.equal(otherAccount.store.readGuardianWatch().watchId, W2.watchId, '그 계정의 레코드는 그대로다');

    // 같은 계정의 다른 탭이 먼저 켰으면 그 id 를 돌려준다
    const sameAccount = harness();
    const sameGate = deferred();
    sameAccount.api.reply('register', async () => {
      await sameGate.promise;
      return ok({});
    });
    const same = sameAccount.sync.ensureRegistered({ stay: sameAccount.store.readStay() });
    await until(() => sameAccount.api.open === 1);
    assert.equal(sameAccount.store.writeGuardianWatch(watchRecord({ ...W2 })).ok, true);
    sameGate.resolve();
    assert.deepEqual(await same, { ok: true, watchId: W2.watchId });
    assert.equal(sameAccount.store.readGuardianWatch().writeToken, W2.writeToken, '다른 탭의 결과를 덮지 않는다');
  });
});

// ── 올리기 (D1·D9, 다르게 정한 것 9) ─────────────────────────────────────

describe('올리기', () => {
  test('일정이 바뀌면 올리고, 같으면 올리지 않는다', async () => {
    const h = harness({ record: watchRecord() });
    h.sync.start();
    await h.sync.kick('open');
    assert.deepEqual(h.api.bodies('deadlines'), [{ ...W1, expiresOn: '2026-10-08', days: BASE_DAYS }]);
    assert.equal(h.store.readGuardianWatch().uploadPending, false);
    assert.deepEqual(h.store.readGuardianWatch().lastUploaded, BASE_UPLOADED);

    await h.sync.kick('resume');
    assert.equal(h.api.bodies('deadlines').length, 1, '같은 상태는 다시 올리지 않는다');

    // 일정 구독: 10-04 에 15:00 마감이 생긴다
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 2);
    assert.deepEqual(h.api.bodies('deadlines')[1].days.find((d) => d.date === '2026-10-04'), { date: '2026-10-04', deadlines: ['15:00'] });

    // 체류 구독: 출국일이 하루 늘면 expiresOn 이 바뀌어 다시 올린다
    assert.equal(h.store.updateStay((stay) => ({ ...stay, departure: { ...stay.departure, date: '2026-10-09' } })).ok, true);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 3);
    assert.equal(h.api.bodies('deadlines')[2].expiresOn, '2026-10-09');
    assert.equal(h.store.readGuardianWatch().expiresOn, '2026-10-09');
    h.sync.stop();
  });

  test('요청은 하나씩: 올리는 중에 일정이 또 바뀌면 끝난 뒤 최신 전체를 한 번 더 올린다', async () => {
    const h = harness({ record: watchRecord() });
    h.sync.start();
    const gate = deferred();
    h.api.reply('deadlines', async (input) => {
      await gate.promise;
      return ok({ expiresOn: input.expiresOn, armFailed: 0 });
    });
    const first = h.sync.kick('open');
    await until(() => h.api.open === 1);

    // 도는 중에 계기가 여러 번 온다: 일정 두 번(구독), 직접 한 번
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:30')).ok, true);
    const again = h.sync.kick('resume');
    assert.equal(again, first, '도는 중의 kick 은 같은 실행을 기다린다');
    assert.equal(h.api.calls.length, 1, '앞 요청이 끝나기 전에는 보내지 않는다');

    gate.resolve();
    await again;
    await h.sync.idle();
    const bodies = h.api.bodies('deadlines');
    assert.equal(bodies.length, 2, '끝난 뒤 한 번만 더');
    assert.equal(h.api.maxOpen, 1, '동시에 열린 요청은 하나');
    assert.deepEqual(bodies[0].days, BASE_DAYS);
    assert.deepEqual(bodies[1].days.find((d) => d.date === '2026-10-04'), { date: '2026-10-04', deadlines: ['15:30'] }, '두 번째는 최신 전체');
    assert.deepEqual(h.store.readGuardianWatch().lastUploaded['2026-10-04'], ['15:30']);
    h.sync.stop();
  });

  test('armFailed > 0 이면 60초 뒤 같은 전체를 다시 올리고, 같은 상태로는 세 번까지', async () => {
    const h = harness({ record: watchRecord() });
    h.sync.start();
    h.api.setDefault('deadlines', (input) => ok({ expiresOn: input.expiresOn, armFailed: 2 }));
    await h.sync.kick('open');
    assert.equal(h.api.bodies('deadlines').length, 1);
    const record = h.store.readGuardianWatch();
    assert.equal(record.uploadPending, true, '걸지 못한 마감이 있으면 서버가 다 걸었는지 모른다');
    assert.deepEqual(record.lastUploaded, BASE_UPLOADED, '받아들인 목록은 쓴다');

    const midnight = kst('2026-10-03', '00:00') + 1000;
    for (let retry = 1; retry <= 3; retry += 1) {
      assert.deepEqual(h.timers.pending(), [h.clock.now() + 60_000, midnight], `재시도 ${retry} 예약`);
      h.timers.advanceTo(h.clock.now() + 60_000);
      await h.sync.idle();
      assert.equal(h.api.bodies('deadlines').length, 1 + retry);
    }
    const bodies = h.api.bodies('deadlines');
    assert.ok(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0])), '같은 전체');
    assert.deepEqual(h.timers.pending(), [midnight], '같은 상태로는 세 번까지');
    h.timers.advanceTo(h.clock.now() + 10 * 60_000);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 4);

    // 다 걸리면 uploadPending 이 풀리고 같은 상태를 더 올리지 않는다
    h.api.setDefault('deadlines', (input) => ok({ expiresOn: input.expiresOn, armFailed: 0 }));
    await h.sync.kick('resume');
    assert.equal(h.api.bodies('deadlines').length, 5, 'uploadPending 이면 계기마다 다시 올린다');
    assert.equal(h.store.readGuardianWatch().uploadPending, false);
    await h.sync.kick('resume');
    assert.equal(h.api.bodies('deadlines').length, 5);
    h.sync.stop();
  });

  test('404 면 REPLACED 를 쓰고 더 올리지 않으며 대기열의 확인은 FAILED 다', async () => {
    const queue = [
      { date: TODAY, by: '12:30', undo: false },
      { date: TODAY, by: '11:00', undo: true },
    ];
    const h = harness({ record: watchRecord({ backQueue: queue }) });
    h.api.reply('deadlines', () => failed('NOT_FOUND'));
    await h.sync.kick('open');
    assert.deepEqual(h.api.names(), ['deadlines'], "'돌아왔어요'를 보내지 않는다");
    const record = h.store.readGuardianWatch();
    assert.equal(record.state, 'REPLACED');
    assert.deepEqual(record.backQueue, []);
    assert.deepEqual(record.lastUploaded, {}, '올린 결과로 보지 않는다');
    assert.equal(phaseOf(h.sync), BACK_PHASE.FAILED);
    assert.equal(phaseOf(h.sync, { date: TODAY, by: '11:00' }), BACK_PHASE.UNDO_FAILED);

    // 갈아 끼운 뒤에는 계기가 와도 올리지 않는다
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    await h.sync.kick('plan');
    assert.deepEqual(h.api.names(), ['deadlines']);
  });

  test('503 OFF 는 uploadPending 을 남기고 화면 단계를 바꾸지 않는다, 네트워크는 다음 계기에 다시 보낸다', async () => {
    for (const kind of ['OFF', 'UNAVAILABLE', 'RATE_LIMITED']) {
      const h = harness({ record: watchRecord({ uploadPending: false, backQueue: [{ ...BACK, undo: false }] }) });
      h.api.reply('deadlines', () => failed(kind));
      await h.sync.kick('open');
      const record = h.store.readGuardianWatch();
      assert.equal(record.uploadPending, true, kind);
      assert.deepEqual(record.lastUploaded, {}, kind);
      assert.equal(record.state, 'ON', kind);
      // 대기열은 그대로 이어서 보낸다(올리기 실패를 화면에 보이지 않는다, D9)
      assert.deepEqual(h.api.names(), ['deadlines', 'back'], kind);
      assert.equal(phaseOf(h.sync), BACK_PHASE.SENT, kind);
      assert.equal(phaseOf(h.sync, { date: TODAY, by: '18:00' }), null, kind);
    }

    const h = harness({ record: watchRecord({ uploadPending: false, backQueue: [{ ...BACK, undo: false }] }) });
    h.api.reply('deadlines', () => failed('NETWORK'));
    await h.sync.kick('open');
    assert.equal(h.store.readGuardianWatch().uploadPending, true);
    assert.deepEqual(h.api.names(), ['deadlines'], '연결이 없으면 대기열도 보내지 않고 끝');
    assert.equal(phaseOf(h.sync), BACK_PHASE.QUEUED);
    // 바뀐 것이 없어도 다음 계기에 다시 보낸다
    await h.sync.kick('resume');
    assert.deepEqual(h.api.names(), ['deadlines', 'deadlines', 'back']);
    assert.equal(h.store.readGuardianWatch().uploadPending, false);
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENT);
  });

  test('400 이면 uploadPending 을 남기고 그 상태는 이번 실행에서 다시 보내지 않는다(상태가 바뀌면 보낸다)', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false }) });
    h.api.reply('deadlines', () => failed('BAD'));
    await h.sync.kick('open');
    assert.equal(h.store.readGuardianWatch().uploadPending, true);
    await h.sync.kick('resume');
    assert.equal(h.api.bodies('deadlines').length, 1, '같은 상태는 막힌다');
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    await h.sync.kick('plan');
    assert.equal(h.api.bodies('deadlines').length, 2, '다른 상태는 보낸다');
    assert.equal(h.store.readGuardianWatch().uploadPending, false);
  });

  test('보기 전용이면 올리지 않고, 쓰기 가능으로 돌아오면 올린다', async () => {
    const h = harness({ record: watchRecord() });
    h.sync.start();
    signOut(h.store);
    await h.sync.kick('open');
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, false, '보기 전용에서는 일정도 바뀌지 않는다');
    await h.sync.idle();
    assert.deepEqual(h.api.calls, []);
    assert.deepEqual(h.writes, []);

    signIn(h.store, h.clock);
    await h.sync.idle();
    assert.deepEqual(h.api.names(), ['deadlines']);
    assert.equal(h.store.readGuardianWatch().uploadPending, false);
    h.sync.stop();
  });

  test('일정이나 체류를 읽지 못하면 올리지 않는다(빈 목록이 서버 기록을 지우지 않게)', async () => {
    const h = harness({ record: watchRecord(), plan: null });
    await h.sync.kick('open');
    assert.deepEqual(h.api.calls, []);
    assert.equal(h.store.readGuardianWatch().uploadPending, true);
  });
});

// ── '돌아왔어요'와 되돌리기 (D10, 다르게 정한 것 10·16) ─────────────────────────

describe("'돌아왔어요'", () => {
  test('오프라인에서 누르면 QUEUED 이고 대기열에 남으며, 온라인이 되면 올리기 다음에 보낸다', async () => {
    const h = harness({ record: watchRecord() });
    h.sync.start();
    h.store.setOnline(false);
    h.sync.pressBack(BACK);
    await h.sync.idle();
    assert.deepEqual(h.api.calls, []);
    assert.equal(phaseOf(h.sync), BACK_PHASE.QUEUED);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, [{ ...BACK, undo: false, atMs: AT_NOON }]);

    h.store.setOnline(true);
    await h.sync.idle();
    assert.deepEqual(h.api.names(), ['deadlines', 'back']);
    assert.equal(h.api.maxOpen, 1);
    assert.deepEqual(h.api.bodies('back'), [{ ...W1, date: TODAY, by: '12:30' }], 'undo 는 되돌리기일 때만 싣는다');
    assert.deepEqual(h.sync.backStatus(BACK), { phase: BACK_PHASE.SENT, undoUntilMs: kst(TODAY, '12:39', '30') });
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);
    h.sync.stop();
  });

  test('recorded: true 전에는 SENT 가 아니다, recorded: false·400·404 는 FAILED', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    const gate = deferred();
    h.api.reply('back', async () => {
      await gate.promise;
      return ok({ recorded: true });
    });
    h.sync.pressBack(BACK);
    await until(() => h.api.open === 1);
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENDING);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, [{ ...BACK, undo: false, atMs: AT_NOON }], '응답 전에는 대기열에 남는다');
    gate.resolve();
    await h.sync.idle();
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENT);

    for (const [reply, label] of [
      [ok({ recorded: false }), 'recorded: false'],
      [failed('BAD'), '400'],
    ]) {
      const one = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
      one.api.reply('back', () => reply);
      one.sync.pressBack(BACK);
      await one.sync.idle();
      assert.equal(phaseOf(one.sync), BACK_PHASE.FAILED, label);
      assert.deepEqual(one.store.readGuardianWatch().backQueue, [], label);
      assert.equal(one.store.readGuardianWatch().state, 'ON', label);
    }

    // 400 은 그 항목만 빼고 다음 항목을 이어서 보낸다
    const next = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    next.api.reply('back', () => failed('BAD'));
    next.store.setOnline(false);
    next.sync.pressBack({ date: TODAY, by: '11:00' });
    next.sync.pressBack(BACK);
    next.store.setOnline(true);
    await next.sync.kick('online');
    assert.deepEqual(next.api.bodies('back').map((b) => b.by), ['11:00', '12:30']);
    assert.equal(phaseOf(next.sync, { date: TODAY, by: '11:00' }), BACK_PHASE.FAILED);
    assert.equal(phaseOf(next.sync), BACK_PHASE.SENT);

    // 404: 남은 대기를 모두 빼고 FAILED, 쓰기 가능하면 REPLACED
    const gone = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    gone.api.reply('back', () => failed('NOT_FOUND'));
    gone.store.setOnline(false);
    gone.sync.pressBack(BACK);
    gone.sync.pressBack({ date: TODAY, by: '18:00' });
    gone.store.setOnline(true);
    await gone.sync.kick('online');
    assert.deepEqual(gone.api.names(), ['back']);
    assert.equal(phaseOf(gone.sync), BACK_PHASE.FAILED);
    assert.equal(phaseOf(gone.sync, { date: TODAY, by: '18:00' }), BACK_PHASE.FAILED);
    assert.equal(gone.store.readGuardianWatch().state, 'REPLACED');
    assert.deepEqual(gone.store.readGuardianWatch().backQueue, []);
  });

  test('보기 전용(세션 만료)에서 404 를 받으면 FAILED 이고, 쓰기 가능해지면 요청 없이 REPLACED 를 쓴다', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    h.sync.start();
    signOut(h.store);
    h.api.reply('back', () => failed('NOT_FOUND'));
    h.sync.pressBack(BACK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync), BACK_PHASE.FAILED);
    assert.equal(h.store.readGuardianWatch().state, 'ON', '보기 전용에서는 대기열 말고 쓰지 않는다');
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);

    signIn(h.store, h.clock);
    await h.sync.idle();
    assert.equal(h.store.readGuardianWatch().state, 'REPLACED');
    assert.deepEqual(h.api.names(), ['back'], '갈아 끼운 지켜보기에 올리지 않는다');
    h.sync.stop();
  });

  test('보기 전용(세션 만료)에서도 누를 수 있고 저장소에는 backQueue 만 바뀐다', async () => {
    const lastUploaded = { [TODAY]: ['12:30'], '2026-10-03': ['16:00'] };
    const h = harness({ record: watchRecord({ uploadPending: true, lastUploaded }) });
    signOut(h.store);
    const before = h.store.readGuardianWatch();
    const gate = deferred();
    h.api.reply('back', async () => {
      await gate.promise;
      return ok({ recorded: true });
    });
    h.sync.pressBack(BACK);
    await until(() => h.api.open === 1);
    const queued = h.store.readGuardianWatch();
    assert.deepEqual({ ...queued, backQueue: before.backQueue }, before, 'backQueue 말고는 그대로');
    assert.deepEqual(queued.backQueue, [{ ...BACK, undo: false, atMs: AT_NOON }]);

    gate.resolve();
    await h.sync.idle();
    assert.deepEqual(h.api.names(), ['back'], '보기 전용에서는 마감을 올리지 않는다(uploadPending 이어도)');
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENT);
    // 보낸 확인은 confirmed 에 누른 시각과 함께 남는다(다르게 정한 것 25. 예전에는 레코드 전체가 before 와 같았다)
    assert.deepEqual(h.store.readGuardianWatch(), { ...before, confirmed: [{ ...BACK, atMs: AT_NOON }] }, '보낸 뒤 대기열이 비고 다른 필드는 그대로');
    assert.deepEqual(h.writes, [], 'writeGuardianWatch 를 부르지 않는다');
    assert.deepEqual(h.queueWrites, [[{ ...BACK, undo: false, atMs: AT_NOON }], []]);
  });

  test('자정: 23:58 에 오프라인으로 누른 23:55 확인을 00:05 에 어제 날짜로 보낸다', async () => {
    const plan = basePlan({ [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '22:00', returnBy: '23:55' })] }) });
    const h = harness({
      at: kst(TODAY, '23:58'),
      plan,
      record: watchRecord({ uploadPending: false, lastUploaded: { [TODAY]: ['23:55'] } }),
    });
    h.sync.start();
    h.store.setOnline(false);
    const target = { date: TODAY, by: '23:55' };
    h.sync.pressBack(target);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync, target), BACK_PHASE.QUEUED);

    h.clock.set(kst('2026-10-03', '00:05'));
    h.store.setOnline(true);
    await h.sync.idle();
    assert.deepEqual(h.api.names(), ['deadlines', 'back']);
    const upload = h.api.bodies('deadlines')[0];
    assert.equal(upload.days[0].date, '2026-10-03', '어제는 올리지 않는다');
    assert.ok(upload.days.every((d) => d.date >= '2026-10-03'));
    assert.deepEqual(h.api.bodies('back'), [{ ...W1, date: TODAY, by: '23:55' }], '외출이 속한 날(어제)로 보낸다');
    assert.deepEqual(h.store.readGuardianWatch().lastUploaded[TODAY], ['23:55'], 'lastUploaded 에 어제를 남긴다');
    assert.deepEqual(h.sync.backStatus(target), { phase: BACK_PHASE.SENT, undoUntilMs: kst('2026-10-03', '00:04', '30') });
    h.sync.stop();
  });

  test('되돌리기: 대기 중이면 요청 없이 사라지고, SENT 뒤면 undo: true 를 보낸다, recorded: false 는 UNDO_FAILED', async () => {
    // 대기 중인 확인을 되돌리면 둘 다 사라진다(요청 없음)
    const queued = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    queued.store.setOnline(false);
    queued.sync.pressBack(BACK);
    await queued.sync.idle();
    queued.sync.undoBack(BACK);
    assert.equal(queued.sync.backStatus(BACK), null);
    assert.deepEqual(queued.store.readGuardianWatch().backQueue, []);
    queued.store.setOnline(true);
    await queued.sync.kick('online');
    assert.deepEqual(queued.api.calls, []);

    // SENT 뒤 되돌리기
    const sent = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    sent.sync.pressBack(BACK);
    await sent.sync.idle();
    assert.equal(phaseOf(sent.sync), BACK_PHASE.SENT);
    const gate = deferred();
    sent.api.reply('back', async () => {
      await gate.promise;
      return ok({ recorded: true });
    });
    sent.sync.undoBack(BACK);
    assert.ok([BACK_PHASE.UNDO_QUEUED, BACK_PHASE.SENDING].includes(phaseOf(sent.sync)));
    await until(() => sent.api.open === 1);
    assert.equal(phaseOf(sent.sync), BACK_PHASE.SENDING);
    sent.sync.undoBack(BACK);
    sent.sync.pressBack(BACK);
    assert.deepEqual(sent.store.readGuardianWatch().backQueue, [{ ...BACK, undo: true, atMs: AT_NOON }], '보내는 중에는 누름을 받지 않는다');
    gate.resolve();
    await sent.sync.idle();
    assert.deepEqual(sent.api.bodies('back'), [
      { ...W1, date: TODAY, by: '12:30' },
      { ...W1, date: TODAY, by: '12:30', undo: true },
    ]);
    assert.equal(sent.sync.backStatus(BACK), null, '되돌린 뒤에는 누르기 전과 같다');
    assert.deepEqual(sent.store.readGuardianWatch().backQueue, []);

    // 되돌리기가 받아들여지지 않으면 UNDO_FAILED
    const late = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    late.sync.pressBack(BACK);
    await late.sync.idle();
    late.api.reply('back', () => ok({ recorded: false }));
    late.sync.undoBack(BACK);
    await late.sync.idle();
    assert.equal(phaseOf(late.sync), BACK_PHASE.UNDO_FAILED);
    assert.deepEqual(late.store.readGuardianWatch().backQueue, []);

    // 누르지 않은 마감에는 되돌리기가 없다
    const none = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    none.sync.undoBack(BACK);
    await none.sync.idle();
    assert.deepEqual(none.api.calls, []);
    assert.deepEqual(none.store.readGuardianWatch().backQueue, []);
  });

  test('새로 고친 뒤(새 실행기) 대기열에서 QUEUED·UNDO_QUEUED 를 다시 만든다', async () => {
    const queue = [
      { date: TODAY, by: '12:30', undo: false },
      { date: TODAY, by: '11:00', undo: true },
    ];
    const h = harness({ record: watchRecord({ backQueue: queue }) });
    assert.deepEqual(h.sync.backStatus(BACK), { phase: BACK_PHASE.QUEUED, undoUntilMs: kst(TODAY, '12:39', '30') });
    assert.equal(phaseOf(h.sync, { date: TODAY, by: '11:00' }), BACK_PHASE.UNDO_QUEUED);
    assert.equal(h.sync.backStatus({ date: TODAY, by: '18:00' }), null);
    assert.equal(h.sync.backStatus({ date: 'x', by: '12:30' }), null);
    // 다른 실행기(같은 저장소)도 같은 단계를 본다
    const other = createWatchSync({ store: h.store, api: fakeApi(), now: h.clock.now });
    assert.equal(phaseOf(other), BACK_PHASE.QUEUED);
  });

  test('누르기는 켜진 지켜보기에서만 대기열에 들어간다', async () => {
    const replaced = harness({ record: watchRecord({ state: 'REPLACED' }) });
    replaced.sync.pressBack(BACK);
    await replaced.sync.idle();
    assert.deepEqual(replaced.store.readGuardianWatch().backQueue, []);
    assert.deepEqual(replaced.api.calls, []);
    const none = harness();
    none.sync.pressBack(BACK);
    await none.sync.idle();
    assert.equal(none.sync.backStatus(BACK), null);
    assert.deepEqual(none.api.calls, []);
  });

  test('되돌리기도 켜진 지켜보기에서만 된다(REPLACED 면 단계와 대기열을 그대로 둔다)', async () => {
    const sent = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    sent.sync.pressBack(BACK);
    await sent.sync.idle();
    assert.equal(phaseOf(sent.sync), BACK_PHASE.SENT);
    assert.equal(sent.store.writeGuardianWatch({ ...sent.store.readGuardianWatch(), state: 'REPLACED' }).ok, true);
    sent.sync.undoBack(BACK);
    await sent.sync.idle();
    assert.equal(phaseOf(sent.sync), BACK_PHASE.SENT);
    assert.deepEqual(sent.store.readGuardianWatch().backQueue, []);
    assert.deepEqual(sent.api.names(), ['back'], '되돌리기를 보내지 않는다');

    // 새로 고친 뒤 대기열에서 다시 만든 QUEUED 도 REPLACED 면 건드리지 않는다
    const queue = [{ ...BACK, undo: false }];
    const queued = harness({ record: watchRecord({ state: 'REPLACED', backQueue: queue }) });
    assert.equal(phaseOf(queued.sync), BACK_PHASE.QUEUED);
    queued.sync.undoBack(BACK);
    await queued.sync.idle();
    assert.deepEqual(queued.store.readGuardianWatch().backQueue, queue);
    assert.deepEqual(queued.queueWrites, []);
    assert.deepEqual(queued.api.calls, []);
  });

  test('대기열을 저장소에 쓰지 못하면 누르기는 FAILED, 되돌리기는 UNDO_FAILED 다', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    let failWrites = true;
    const store = {
      ...h.store,
      writeBackQueue: (queue) => (failWrites ? { ok: false, error: 'WRITE_FAILED' } : h.store.writeBackQueue(queue)),
    };
    const sync = createWatchSync({ store, api: h.api, now: h.clock.now });

    sync.pressBack(BACK);
    await sync.idle();
    assert.equal(phaseOf(sync), BACK_PHASE.FAILED);
    assert.deepEqual(h.api.calls, [], '대기열에 없으니 보내지 않는다');
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);

    // 실패 뒤 다시 누를 수 있다
    failWrites = false;
    sync.pressBack(BACK);
    await sync.idle();
    assert.equal(phaseOf(sync), BACK_PHASE.SENT);

    failWrites = true;
    sync.undoBack(BACK);
    await sync.idle();
    assert.equal(phaseOf(sync), BACK_PHASE.UNDO_FAILED);
    assert.deepEqual(h.api.bodies('back'), [{ ...W1, date: TODAY, by: '12:30' }], '되돌리기를 보내지 않는다');
  });
});

// ── 응답 사이의 변경 ─────────────────────────────────────────────

describe('응답 사이에 레코드가 바뀜', () => {
  test('응답 사이에 레코드가 지워지거나 다시 등록되면 결과를 쓰지 않는다', async () => {
    const replacements = [
      ['다른 watchId 로 다시 등록', watchRecord({ ...W2, lastUploaded: {}, uploadPending: true })],
      ['같은 watchId 에 새 토큰', watchRecord({ writeToken: W2.writeToken, lastUploaded: {}, uploadPending: true })],
      ['지워짐', null],
    ];
    for (const [label, replacement] of replacements) {
      // 올리기
      const up = harness({ record: watchRecord() });
      const gate = deferred();
      up.api.reply('deadlines', async (input) => {
        await gate.promise;
        return ok({ expiresOn: input.expiresOn, armFailed: 0 });
      });
      const run = up.sync.kick('open');
      await until(() => up.api.open === 1);
      assert.equal(up.store.writeGuardianWatch(replacement).ok, true, label);
      const stored = up.store.readGuardianWatch();
      gate.resolve();
      await run;
      await up.sync.idle();
      assert.equal(up.store.readGuardianWatch(), stored, `${label}: 올린 결과를 쓰지 않는다`);
      assert.equal(up.writes.length, 0, label);
      assert.deepEqual(up.api.names(), ['deadlines'], `${label}: 바뀐 레코드로 이어서 보내지 않는다(지켜보기 변경은 계기가 아니다)`);

      // '돌아왔어요'
      const back = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
      const backGate = deferred();
      back.api.reply('back', async () => {
        await backGate.promise;
        return ok({ recorded: true });
      });
      back.sync.pressBack(BACK);
      await until(() => back.api.open === 1);
      assert.equal(back.store.writeGuardianWatch(replacement).ok, true, label);
      const queueWritesBefore = back.queueWrites.length;
      const storedBack = back.store.readGuardianWatch();
      backGate.resolve();
      await back.sync.idle();
      assert.equal(back.queueWrites.length, queueWritesBefore, `${label}: 대기열을 고치지 않는다`);
      assert.equal(back.store.readGuardianWatch(), storedBack, label);
    }
  });
});

// ── 계기와 타이머 ─────────────────────────────────────────────

describe('계기', () => {
  test("'open' 계기는 실행기 하나에 한 번만 받는다(화면마다 다시 불러도 비우지 않는다)", async () => {
    const h = harness({ record: watchRecord() });
    await h.sync.kick('open');
    assert.deepEqual(h.api.names(), ['deadlines']);
    // 올릴 것이 생겨도 두 번째 open 은 비우지 않는다
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    await h.sync.kick('open');
    await h.sync.idle();
    assert.deepEqual(h.api.names(), ['deadlines'], '두 번째 open 은 아무것도 걸지 않는다');
    // 다른 계기는 그대로 받는다
    await h.sync.kick('resume');
    assert.deepEqual(h.api.names(), ['deadlines', 'deadlines']);
    // 새 실행기(새로 고침)는 자기 open 을 한 번 받는다
    assert.equal(h.store.writeTripPlan(planWith('2026-10-05', '15:00')).ok, true);
    const fresh = createWatchSync({ store: h.store, api: h.api, now: h.clock.now });
    await fresh.kick('open');
    assert.deepEqual(h.api.names(), ['deadlines', 'deadlines', 'deadlines']);
  });

  test('자정 타이머와 온라인·쓰기 가능 복귀가 kick 을 부른다', async () => {
    const h = harness({ at: kst(TODAY, '23:00'), record: watchRecord({ uploadPending: false }) });
    // 시작 전에 맞춰 둔다
    await h.sync.kick('open');
    assert.equal(h.api.bodies('deadlines').length, 1);
    const resetPending = () => assert.equal(h.store.writeGuardianWatch({ ...h.store.readGuardianWatch(), uploadPending: true }).ok, true);

    h.sync.start();
    const midnight = kst('2026-10-03', '00:00') + 1000;
    assert.deepEqual(h.timers.pending(), [midnight], 'KST 자정 + 1초');
    resetPending();
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 1, '지켜보기 변경은 비우기를 부르지 않는다(되먹임 없음)');

    h.timers.advanceTo(midnight);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 2);
    assert.equal(h.api.bodies('deadlines')[1].days[0].date, '2026-10-03');
    const next = kst('2026-10-04', '00:00') + 1000;
    assert.deepEqual(h.timers.pending(), [next], '다음 자정을 다시 건다');
    resetPending();
    h.timers.advanceTo(next);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 3);

    // 오프라인 → 온라인
    resetPending();
    h.store.setOnline(false);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 3, '오프라인이 되는 것은 계기가 아니다');
    h.store.setOnline(true);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 4);

    // 보기 전용 → 쓰기 가능
    resetPending();
    signOut(h.store);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 4);
    signIn(h.store, h.clock);
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 5);
    h.sync.stop();
  });

  test('stop() 은 자정·재시도 타이머와 구독을 지운다', async () => {
    const h = harness({ record: watchRecord() });
    h.api.setDefault('deadlines', (input) => ok({ expiresOn: input.expiresOn, armFailed: 1 }));
    h.sync.start();
    await h.sync.kick('open');
    assert.equal(h.timers.pending().length, 2, '자정 타이머와 재시도 타이머');
    h.sync.stop();
    assert.deepEqual(h.timers.pending(), []);

    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    h.timers.advanceTo(kst('2026-10-05', '00:00'));
    await h.sync.idle();
    assert.equal(h.api.bodies('deadlines').length, 1, '멈춘 뒤에는 계기가 없다');
    // 다시 시작할 수 있다
    h.sync.start();
    assert.equal(h.timers.pending().length, 1);
    h.sync.stop();
  });
});

// ── 같은 마감을 가진 외출과 덮는 확인 (다르게 정한 것 25) ─────────────────────

describe('같은 마감의 나중 외출을 덮는 확인', () => {
  // 10-02: B 는 12:41 출발(13:47 귀가 예정), C 는 17:17 출발. 둘 다 21:00 마감
  const B_OUT = { id: 'b', departAt: '12:41', returnBy: '21:00', slackMin: 300 };
  const C_OUT = { id: 'c', departAt: '17:17', returnBy: '21:00', slackMin: 120 };
  const planB = () => basePlan({ [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting(B_OUT)] }) });
  const planBC = () => basePlan({ [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting(B_OUT), patientOuting(C_OUT)] }) });
  const DUSK = Object.freeze({ date: TODAY, by: '21:00' });
  const backBodies = (h) => h.api.bodies('back');

  test('재계획으로 C 가 생기면 B 에서 보낸 확인을 되돌리고 메모리 단계를 비운다(C 의 버튼이 전달했어요를 물려받지 않는다)', async () => {
    const h = harness({ at: kst(TODAY, '14:00'), plan: planB(), record: watchRecord() });
    h.sync.start();
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.SENT);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, [{ ...DUSK, atMs: kst(TODAY, '14:00') }]);

    // 15:00 재계획: C 가 생긴다. 되돌리기를 보내는 동안 단계는 SENT 가 아니다
    h.clock.set(kst(TODAY, '15:00'));
    const gate = deferred();
    h.api.reply('back', async () => {
      await gate.promise;
      return ok({ recorded: true });
    });
    assert.equal(h.store.writeTripPlan(planBC()).ok, true);
    await until(() => h.api.open === 1);
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.SENDING);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, [{ ...DUSK, undo: true, atMs: kst(TODAY, '15:00') }]);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, [], '되돌리기를 넣을 때 confirmed 에서 뺀다');
    gate.resolve();
    await h.sync.idle();
    assert.deepEqual(backBodies(h), [{ ...W1, ...DUSK }, { ...W1, ...DUSK, undo: true }]);
    assert.equal(phaseOf(h.sync, DUSK), null, '되돌린 뒤 C 의 카드는 누르기 전과 같다');
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);

    // 다음 비우기는 아무것도 다시 보내지 않는다
    await h.sync.kick('resume');
    assert.equal(backBodies(h).length, 2);
    h.sync.stop();
  });

  test('되돌리기를 보내지 못하면(연결 없음) 되돌리기 대기로 남고 SENT 를 보이지 않는다', async () => {
    const h = harness({ at: kst(TODAY, '14:00'), plan: planB(), record: watchRecord() });
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.SENT);
    h.clock.set(kst(TODAY, '15:00'));
    assert.equal(h.store.writeTripPlan(planBC()).ok, true);
    h.api.reply('back', () => failed('NETWORK'));
    await h.sync.kick('plan');
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.UNDO_QUEUED);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, []);
    // 다음 계기에 보낸다
    await h.sync.kick('online');
    assert.deepEqual(backBodies(h).at(-1), { ...W1, ...DUSK, undo: true });
    assert.equal(phaseOf(h.sync, DUSK), null);
  });

  test('C 가 출발한 뒤 C 에서 누른 확인은 되돌리지 않는다', async () => {
    const h = harness({ at: kst(TODAY, '19:00'), plan: planBC(), record: watchRecord() });
    h.sync.start();
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.SENT);
    // 일정이 다시 바뀌어도(같은 외출) 그대로다
    h.clock.set(kst(TODAY, '19:30'));
    assert.equal(h.store.writeTripPlan(planBC()).ok, true);
    await h.sync.kick('plan');
    assert.deepEqual(backBodies(h), [{ ...W1, ...DUSK }]);
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.SENT);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, [{ ...DUSK, atMs: kst(TODAY, '19:00') }]);
    h.sync.stop();
  });

  test('오프라인에서 누른 B 의 확인은 C 가 생기면 요청 없이 사라진다', async () => {
    const h = harness({ at: kst(TODAY, '14:00'), plan: planB(), record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    h.store.setOnline(false);
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync, DUSK), BACK_PHASE.QUEUED);
    // 연결되기 전에 C 가 생겼다(다른 탭의 재계획)
    h.clock.set(kst(TODAY, '15:00'));
    h.store.setOnline(true);
    assert.equal(h.store.writeTripPlan(planBC()).ok, true);
    await h.sync.kick('online');
    assert.deepEqual(backBodies(h), [], '대기 중인 확인과 되돌리기가 함께 사라져 보낼 것이 없다');
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, []);
    assert.equal(phaseOf(h.sync, DUSK), null);
  });

  test('보기 전용(세션 없음)에서도 덮는 확인을 되돌린다(대기열 보내기와 같다)', async () => {
    const confirmed = [{ ...DUSK, atMs: kst(TODAY, '14:00') }];
    const h = harness({ at: kst(TODAY, '15:00'), plan: planBC(), record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED, confirmed }) });
    signOut(h.store);
    await h.sync.kick('resume');
    assert.deepEqual(h.api.names(), ['back']);
    assert.deepEqual(backBodies(h), [{ ...W1, ...DUSK, undo: true }]);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, []);
    assert.deepEqual(h.writes, [], 'writeGuardianWatch 를 부르지 않는다');
  });

  test('되돌리기 마감이 지났으면 아무것도 넣지 않는다', async () => {
    const confirmed = [{ ...DUSK, atMs: kst(TODAY, '14:00') }];
    const h = harness({ at: kst(TODAY, '21:09', '30'), plan: planBC(), record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED, confirmed }) });
    await h.sync.kick('resume');
    assert.deepEqual(backBodies(h), []);
    assert.deepEqual(h.store.readGuardianWatch().confirmed, confirmed);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);
  });

  test('덮는 확인을 저장소에 쓰지 못하면 그대로 두고 이번에는 대기열을 보내지 않는다(다음 비우기에서 다시)', async () => {
    const pending = [{ ...DUSK, undo: false, atMs: kst(TODAY, '14:00') }];
    const h = harness({ at: kst(TODAY, '15:00'), plan: planBC(), record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED, backQueue: pending }) });
    let failWrites = true;
    const store = { ...h.store, writeBackQueue: (...args) => (failWrites ? { ok: false, code: 'STORAGE_FAILED' } : h.store.writeBackQueue(...args)) };
    const sync = createWatchSync({ store, api: h.api, now: h.clock.now });
    await sync.kick('resume');
    assert.deepEqual(h.api.bodies('back'), [], '덮는 확인을 보내지 않는다');
    assert.deepEqual(h.store.readGuardianWatch().backQueue, pending);
    failWrites = false;
    await sync.kick('resume');
    assert.deepEqual(h.api.bodies('back'), []);
    assert.deepEqual(h.store.readGuardianWatch().backQueue, []);
  });

  test('요청 본문은 { watchId, writeToken, date, by, undo } 그대로다(누른 시각을 싣지 않는다)', async () => {
    const h = harness({ at: kst(TODAY, '14:00'), plan: planB(), record: watchRecord() });
    const inputs = [];
    const back = h.api.back;
    h.api.back = (input) => {
      inputs.push(input);
      return back(input);
    };
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    h.clock.set(kst(TODAY, '15:00'));
    assert.equal(h.store.writeTripPlan(planBC()).ok, true);
    await h.sync.kick('plan');
    assert.deepEqual(inputs, [{ ...W1, ...DUSK, undo: false }, { ...W1, ...DUSK, undo: true }]);
    assert.deepEqual(inputs.map((input) => Object.keys(input).sort()), [
      ['by', 'date', 'undo', 'watchId', 'writeToken'],
      ['by', 'date', 'undo', 'watchId', 'writeToken'],
    ]);
    assert.deepEqual(backBodies(h), [{ ...W1, ...DUSK }, { ...W1, ...DUSK, undo: true }]);
  });

  test('confirmed 는 같은 watchId 다시 등록(REPLACED 에서 켬)에는 남고, 새 watchId 면 비어서 시작한다', async () => {
    const confirmed = [{ ...DUSK, atMs: kst(TODAY, '14:00') }];
    const replaced = harness({ at: kst(TODAY, '14:30'), plan: planB(), record: watchRecord({ state: 'REPLACED', confirmed }) });
    assert.equal((await replaced.sync.ensureRegistered({ stay: replaced.store.readStay() })).ok, true);
    await replaced.sync.idle();
    assert.equal(replaced.store.readGuardianWatch().state, 'ON');
    assert.notEqual(replaced.store.readGuardianWatch().writeToken, W1.writeToken);
    assert.deepEqual(replaced.store.readGuardianWatch().confirmed, confirmed);
    // 다시 켠 뒤 C 가 생기면 남은 확인을 새 토큰으로 되돌린다
    replaced.clock.set(kst(TODAY, '15:00'));
    assert.equal(replaced.store.writeTripPlan(planBC()).ok, true);
    await replaced.sync.kick('plan');
    const [undo] = replaced.api.bodies('back');
    assert.deepEqual({ ...undo, writeToken: 'x' }, { ...W1, ...DUSK, undo: true, writeToken: 'x' });
    assert.equal(undo.writeToken, replaced.store.readGuardianWatch().writeToken);

    // 끈 뒤 새로 켜면(새 watchId) 빈 목록이다
    const fresh = harness({ at: kst(TODAY, '14:30'), plan: planB(), record: watchRecord({ confirmed }) });
    assert.equal((await fresh.sync.retire()).ok, true);
    const next = await fresh.sync.ensureRegistered({ stay: fresh.store.readStay() });
    await fresh.sync.idle();
    assert.notEqual(next.watchId, W1.watchId);
    assert.deepEqual(fresh.store.readGuardianWatch().confirmed, []);
  });

  test('확인을 보낼 때 confirmed 의 어제보다 앞 날짜를 버린다', async () => {
    const old = [{ date: '2026-09-30', by: '21:00', atMs: kst('2026-09-30', '14:00') }, { date: '2026-10-01', by: '21:00', atMs: kst('2026-10-01', '14:00') }];
    const h = harness({ at: kst(TODAY, '14:00'), plan: planB(), record: watchRecord({ confirmed: old }) });
    h.sync.pressBack(DUSK);
    await h.sync.idle();
    assert.deepEqual(h.store.readGuardianWatch().confirmed, [old[1], { ...DUSK, atMs: kst(TODAY, '14:00') }]);
  });
});

// ── 끄기·서버 지우기·설정 ─────────────────────────────────────────

describe('끄기와 서버 지우기', () => {
  test('retire 는 진행 중 요청이 끝난 뒤 저장소 retireGuardianWatch 를 부른다', async () => {
    const h = harness({ record: watchRecord() });
    const gate = deferred();
    h.api.reply('deadlines', async (input) => {
      await gate.promise;
      return ok({ expiresOn: input.expiresOn, armFailed: 0 });
    });
    const run = h.sync.kick('open');
    await until(() => h.api.open === 1);
    const retired = h.sync.retire();
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    assert.notEqual(h.store.readGuardianWatch(), null, '진행 중 요청이 끝나기 전에는 지우지 않는다');
    assert.deepEqual(h.deletes, []);

    gate.resolve();
    await run;
    assert.deepEqual(await retired, { ok: true, pending: false });
    assert.equal(h.store.readGuardianWatch(), null);
    assert.deepEqual(h.deletes, [{ ...W1 }], '서버 삭제 대기를 보내고 끝나기를 기다린다');
    assert.deepEqual(h.store.readPendingServerDelete(), []);
    assert.equal(h.sync.backStatus(BACK), null);
  });

  test('retire: 앞선 요청을 기다리는 동안 보기 전용이 되면 아무것도 바꾸지 않고 ok: false 다', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    h.sync.pressBack(BACK);
    await h.sync.idle();
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENT);
    const gate = deferred();
    h.api.reply('deadlines', async (input) => {
      await gate.promise;
      return ok({ expiresOn: input.expiresOn, armFailed: 0 });
    });
    assert.equal(h.store.writeTripPlan(planWith('2026-10-04', '15:00')).ok, true);
    const run = h.sync.kick('plan');
    await until(() => h.api.open === 1);
    const retired = h.sync.retire();
    signOut(h.store);
    gate.resolve();
    await run;
    assert.deepEqual(await retired, { ok: false, reason: 'LOGIN_REQUIRED' });
    assert.equal(h.store.readGuardianWatch().state, 'ON', '레코드는 켜진 그대로다');
    assert.equal(h.store.readGuardianWatch().watchId, W1.watchId);
    assert.deepEqual(h.deletes, []);
    assert.deepEqual(h.store.readPendingServerDelete(), []);
    assert.equal(phaseOf(h.sync), BACK_PHASE.SENT, '단계를 비우지 않는다');

    const offline = harness({ record: watchRecord() });
    offline.store.setOnline(false);
    assert.deepEqual(await offline.sync.retire(), { ok: false, reason: 'UNAVAILABLE' });
    assert.equal(offline.store.readGuardianWatch().watchId, W1.watchId);
    assert.deepEqual(offline.deletes, []);
  });

  test('retire: 저장소가 옮기지 못하면 ok: false 이고 단계를 그대로 둔다', async () => {
    const h = harness({ record: watchRecord({ uploadPending: false, lastUploaded: BASE_UPLOADED }) });
    const store = { ...h.store, retireGuardianWatch: () => ({ ok: false, error: 'WRITE_FAILED' }) };
    const sync = createWatchSync({ store, api: h.api, now: h.clock.now });
    sync.pressBack(BACK);
    await sync.idle();
    assert.equal(phaseOf(sync), BACK_PHASE.SENT);
    assert.deepEqual(await sync.retire(), { ok: false, reason: 'UNAVAILABLE' });
    assert.equal(phaseOf(sync), BACK_PHASE.SENT);
    assert.equal(h.store.readGuardianWatch().watchId, W1.watchId);
  });

  test('retire: 서버 삭제가 연결 실패로 남으면 pending: true, 지웠거나 레코드가 없으면 pending: false', async () => {
    const h = harness({
      record: watchRecord(),
      deleteReply: () => {
        throw new TypeError('network down');
      },
    });
    assert.deepEqual(await h.sync.retire(), { ok: true, pending: true });
    assert.equal(h.store.readGuardianWatch(), null, '이 기기에서는 껐다');
    assert.deepEqual(h.deletes, [{ ...W1 }], '한 번 보냈다');
    assert.deepEqual(
      h.store.readPendingServerDelete().map((item) => item.watchId),
      [W1.watchId],
      '서버 삭제 대기에 남아 다음 계기에 다시 보낸다',
    );

    const done = harness({ record: watchRecord() });
    assert.deepEqual(await done.sync.retire(), { ok: true, pending: false });
    assert.deepEqual(done.store.readPendingServerDelete(), []);

    const none = harness();
    assert.deepEqual(await none.sync.retire(), { ok: true, pending: false });
    assert.deepEqual(none.deletes, []);
  });

  test('removeAll: OK 면 레코드를 지우고 deleted 를 돌려준다, 401 은 LOGIN_REQUIRED', async () => {
    const h = harness({ record: watchRecord() });
    h.api.reply('removeAll', () => ok({ deleted: 2 }));
    assert.deepEqual(await h.sync.removeAll(), { ok: true, deleted: 2 });
    assert.equal(h.store.readGuardianWatch(), null);
    assert.deepEqual(h.api.calls, [{ name: 'removeAll', method: 'DELETE', path: WATCH_PATHS.watch, body: { all: true } }]);
    assert.deepEqual(h.deletes, [], '서버가 이미 지웠으니 삭제 대기를 만들지 않는다');

    for (const [reply, reason] of [
      [failed('LOGIN_REQUIRED'), 'LOGIN_REQUIRED'],
      [failed('RATE_LIMITED'), 'RATE_LIMITED'],
      [failed('OFF'), 'UNAVAILABLE'],
      [failed('UNAVAILABLE', 500), 'UNAVAILABLE'],
      [failed('NETWORK'), 'UNAVAILABLE'],
    ]) {
      const one = harness({ record: watchRecord() });
      one.api.reply('removeAll', () => reply);
      assert.deepEqual(await one.sync.removeAll(), { ok: false, reason }, reply.kind);
      assert.equal(one.store.readGuardianWatch().watchId, W1.watchId, reply.kind);
    }

    const readOnly = harness({ record: watchRecord() });
    signOut(readOnly.store);
    assert.deepEqual(await readOnly.sync.removeAll(), { ok: false, reason: 'LOGIN_REQUIRED' });
    assert.deepEqual(readOnly.api.calls, []);
  });

  test('removeAll: 응답 사이에 다른 계정으로 바뀌면 그 계정의 레코드를 지우지 않는다', async () => {
    const h = harness({ record: watchRecord() });
    const gate = deferred();
    h.api.reply('removeAll', async () => {
      await gate.promise;
      return ok({ deleted: 1 });
    });
    const pending = h.sync.removeAll();
    await until(() => h.api.open === 1);
    h.store.setSession({ authenticated: true, accountKey: 'acct_watch_sync_test_0002', expiresAt: new Date(h.clock.now() + HOUR).toISOString() });
    assert.equal(h.store.writeGuardianWatch(watchRecord({ ...W2 })).ok, true);
    gate.resolve();
    assert.deepEqual(await pending, { ok: true, deleted: 1 });
    assert.equal(h.store.readGuardianWatch().watchId, W2.watchId, '다른 계정의 레코드는 그대로다');
  });

  test('config: 한 번 읽고 5분 기억한다, 실패는 { enabled: false } 이고 기억하지 않는다', async () => {
    const h = harness();
    h.api.reply('config', () => failed('NETWORK'));
    assert.deepEqual(await h.sync.config(), { enabled: false });
    assert.deepEqual(await h.sync.config(), { enabled: true }, '실패는 기억하지 않는다');
    assert.deepEqual(await h.sync.config(), { enabled: true });
    assert.equal(h.api.calls.length, 2);
    h.clock.set(h.clock.now() + 5 * 60_000);
    h.api.reply('config', () => ok({ enabled: false, vapidPublicKey: null }));
    assert.deepEqual(await h.sync.config(), { enabled: false });
    assert.equal(h.api.calls.length, 3);
    // 겹쳐 불러도 요청은 하나
    h.clock.set(h.clock.now() + 5 * 60_000);
    const [a, b] = await Promise.all([h.sync.config(), h.sync.config()]);
    assert.deepEqual([a, b], [{ enabled: true }, { enabled: true }]);
    assert.equal(h.api.calls.length, 4);
  });

  test('getWatchSync 는 서버 렌더링 중(window 없음) null 이다', () => {
    assert.equal(typeof window, 'undefined');
    assert.equal(getWatchSync(), null);
  });
});
