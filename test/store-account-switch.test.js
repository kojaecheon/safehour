// 다른 탭에서 계정이 바뀔 때 (lib/store/store.js attachWindow·recheckAccount·refreshSession, lib/trip/watchSync.js · A-3 검토 I1, e4617eb 검토)
//
// 이 파일이 고정하는 것
//   - 세션 쿠키는 브라우저에 하나다. 다른 탭이 다른 계정으로 로그인해 마지막 계정 키(lastAccountKey)가 바뀌면, 이 탭은 메모리의
//     세션(앞 계정)을 버리고 새 계정의 보기 전용(세션을 확인하기 전과 같은 상태)이 되며, 1분 조절 없이 곧바로 세션을 다시 묻는다
//   - 이 탭의 세션이 아직 없을 때(첫 확인 중)도, 버린 뒤 다시 묻는 중에 또 바뀌어도 같다. 다른 탭이 '내 정보 지우기'로 마지막
//     계정 키를 지워도 버린다
//   - 그동안 실행기는 앞 계정 것으로 보고 보내지 않는다. 줄 선 서버 지우기·등록은 아무것도 보내지 않고(계정 키를 넘기지 않아도
//     보기 전용이라 보내지 않는다), 마감 올리기도 나가지 않는다. 응답을 기다리던 올리기가 404 여도 앞 계정의 지켜보기를 갈아
//     끼움(REPLACED)으로 바꾸지 않는다
//   - 바뀌기 전에 보낸 세션 확인의 응답(앞 계정)과 늦은 실패는 반영하지 않는다. 같은 계정 키가 다시 쓰인 것은 전환이 아니다
//   - storage 이벤트를 받지 못한 탭(뒤로·앞으로 캐시, 얼었던 탭)도 다시 보일 때, 세션 응답을 반영하기 전에, 실행기가 일을 시작할 때
//     다시 대조한다. 다시 묻기가 답을 받지 못하면 한 번만 더 묻는다
//
// 탭 둘은 같은 메모리 저장소를 나눠 쓰는 저장소 인스턴스 둘이고, 브라우저 쿠키는 변수 하나가 대신한다(가짜 fetch 와 가짜 요청 함수가
// 보낸 때의 그 값을 기록한다. 로그아웃 요청은 쿠키를 지운다). storage 이벤트는 바꾼 탭이 아닌 다른 탭에만 오므로 탭 1에만 보낸다.
// 외부 호출과 벽시계는 없다. 계정 키와 식별 값은 형식만 맞춘 테스트 값이다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEVICE_KEY, STORE_ERROR, accountRecordKey, createMemoryStorage, createStore } from '../lib/store/index.js';
import { SESSION_RECHECK_RETRY_MS } from '../lib/store/store.js';
import { createWatchSync } from '../lib/trip/watchSync.js';
import { WATCH_KIND } from '../src/guardian/watchRequests.js';
import { makeDayPlan, patientOuting } from './guardian-fixtures.js';
import { makeStay } from './stay-fixtures.js';

const A = 'acct_tab_switch_test_A01';
const B = 'acct_tab_switch_test_B02';
const TODAY = '2026-10-02';
const HOUR = 3600_000;
const WA = Object.freeze({ watchId: 'WATCHtabFixtureA_01-ab', writeToken: 'WRITEtabFixtureA_0123456789-abcdefghijklmno' });
const SESSION_URL = '/api/auth/session';
const LOGOUT_URL = '/api/auth/logout';
const UNAVAILABLE = Object.freeze({ ok: false, reason: WATCH_KIND.UNAVAILABLE });
const LOGIN_REQUIRED = Object.freeze({ ok: false, reason: WATCH_KIND.LOGIN_REQUIRED });
/** 다른 탭의 마감 올리기가 소유자가 다른 쿠키로 받은 것과 같은 404 */
const NOT_FOUND = Object.freeze({ ok: false, status: 404, network: false, errorCode: 'WATCH_NOT_FOUND', kind: WATCH_KIND.NOT_FOUND });

async function until(predicate) {
  for (let i = 0; i < 1000 && !predicate(); i += 1) await Promise.resolve();
  assert.ok(predicate(), '조건에 닿지 않았다');
}

/** 걸린 약속이 모두 끝날 때까지(일어나지 않아야 하는 일을 확인할 때) */
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 한 번 놓을 때까지 기다리는 문. open() 뒤에는 바로 지난다. open(값)이면 그 값으로 지난다 */
function gate() {
  let open;
  const wait = new Promise((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** 기다림만 모으는 타이머. run(ms) 는 그 길이로 건 것만 부른다 */
function fakeTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    setTimeout(fn, ms) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    count(ms) {
      return [...pending.values()].filter((t) => t.ms === ms).length;
    },
    run(ms) {
      for (const [id, t] of [...pending]) {
        if (t.ms !== ms) continue;
        pending.delete(id);
        t.fn();
      }
    },
  };
}

/** 창 하나. 사건마다 건 함수를 모으고, 문서의 보임 상태를 바꿀 수 있다 */
function fakeWindow() {
  const listeners = new Map();
  const add = (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  const remove = (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
  const document = {
    visibilityState: 'visible',
    addEventListener: (type, fn) => add(`document:${type}`, fn),
    removeEventListener: (type, fn) => remove(`document:${type}`, fn),
  };
  return {
    win: { navigator: { onLine: true }, document, addEventListener: add, removeEventListener: remove },
    document,
    fire(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    count() {
      return [...listeners.values()].reduce((sum, list) => sum + list.length, 0);
    },
  };
}

/**
 * 탭 둘, 쿠키 하나. 탭 2(다른 탭)가 앞서 A 로 로그인해 체류·일정을 써 두었다. aWatch 면 A 의 지켜보기가 켜져 있다(올리지 않은 상태).
 * 탭 1은 A 로 로그인해 있다. fresh 면 방금 연 탭이라 세션을 아직 확인하지 않았다(보기 전용, 마지막 계정 A 를 읽는다).
 * 탭 1의 실행기는 화면처럼 시작해 둔다(상태 구독: 쓰기 가능으로 돌아오면 비운다). timers 는 탭 1 저장소에 넣는다.
 */
function twoTabs({ aWatch = true, fresh = false, timers = null } = {}) {
  const shared = createMemoryStorage();
  const clock = { ms: Date.parse(`${TODAY}T12:00:00+09:00`) };
  const now = () => clock.ms;
  const expiresAt = new Date(now() + 7 * 24 * HOUR).toISOString();
  const sessionBody = (accountKey) => ({ ok: true, authenticated: true, accountKey, expiresAt });
  const signedOut = { ok: true, authenticated: false, provider: null, expiresAt: null, accountKey: null };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const browser = { cookie: A };
  /** 세션 확인: 보낸 때의 쿠키. holdSessions 를 부르면 하나씩 붙잡는다. open() 은 그 쿠키로, open('network') 는 연결 오류, open(503) 은 그 상태로 답한다 */
  const sessionChecks = [];
  let sessionGate = null;
  /** 로그아웃 요청: holdLogouts 를 부르면 하나씩 붙잡는다. open() 은 닿아 쿠키를 지우고, open('network') 는 연결 오류다 */
  const logoutRequests = [];
  let logoutGate = null;
  const fetchImpl = async (url) => {
    if (url === LOGOUT_URL) {
      const held = logoutGate ? gate() : null;
      if (held) logoutRequests.push(held.open);
      const outcome = held ? await held.wait : undefined;
      if (outcome === 'network') throw new TypeError('fetch failed');
      browser.cookie = null;
      return json({ ok: true });
    }
    if (url === SESSION_URL) {
      const cookie = browser.cookie;
      const held = sessionGate ? gate() : null;
      sessionChecks.push({ cookie, open: held ? held.open : () => {} });
      const outcome = held ? await held.wait : undefined;
      if (outcome === 'network') throw new TypeError('fetch failed');
      if (typeof outcome === 'number') return json({ ok: false }, outcome);
      return json(cookie === null ? signedOut : sessionBody(cookie));
    }
    return json({ ok: true });
  };

  const tab2 = createStore({ storage: shared, now, fetchImpl });
  tab2.setSession(sessionBody(A));
  const plan = { days: { [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '10:00', returnBy: '12:30' })] }) } };
  assert.equal(tab2.writeStay(makeStay()).ok, true);
  assert.equal(tab2.writeTripPlan(plan).ok, true);
  if (aWatch) {
    const record = { ...WA, expiresOn: '2026-10-08', lastUploaded: {}, uploadPending: true, backQueue: [], confirmed: [], state: 'ON' };
    assert.equal(tab2.writeGuardianWatch(record).ok, true);
  }

  const tab1 = createStore({ storage: shared, now, fetchImpl, timers });
  const window1 = fakeWindow();
  const detach = tab1.attachWindow(window1.win);
  if (!fresh) tab1.setSession(sessionBody(A));

  /** 요청 함수: 보낸 때의 쿠키와 함께 쌓는다. 마감 올리기는 놓을 때까지 붙잡고, 놓을 때의 결과를 돌려준다 */
  const sent = [];
  const reply = (data) => ({ ok: true, status: 200, data: { ok: true, ...data }, kind: WATCH_KIND.OK });
  let upload = gate();
  let uploadResult = null;
  const api = {
    config: async () => reply({ enabled: true }),
    register: async (input) => {
      sent.push(['register', browser.cookie]);
      return reply({ expiresOn: input.expiresOn });
    },
    deadlines: async (input) => {
      sent.push(['deadlines', browser.cookie]);
      await upload.wait;
      return uploadResult ?? reply({ expiresOn: input.expiresOn, armFailed: 0 });
    },
    back: async () => {
      sent.push(['back', browser.cookie]);
      return reply({ recorded: true });
    },
    removeAll: async () => {
      sent.push(['removeAll', browser.cookie]);
      return reply({ deleted: 3 });
    },
  };
  const runner = createWatchSync({ store: tab1, api, now, randomBytes: (n) => new Uint8Array(n).fill(7) });
  runner.start();

  /** 탭 1에 storage 사건 하나 */
  const storageEvent = (key, storageArea = shared) => window1.fire('storage', { key, storageArea });

  return {
    shared,
    tab1,
    tab2,
    runner,
    sent,
    sessionChecks,
    window1,
    detach,
    /** 탭 1이 보낸 세션 확인의 쿠키들 */
    checkedCookies() {
      return sessionChecks.map((c) => c.cookie);
    },
    /** 세션 확인을 하나씩 붙잡는다(각 확인의 open 으로 놓는다) */
    holdSessions() {
      sessionGate = true;
    },
    logoutRequests,
    /** 로그아웃 요청을 하나씩 붙잡는다(logoutRequests 의 함수로 놓는다) */
    holdLogouts() {
      logoutGate = true;
    },
    /** 붙잡힌 마감 올리기를 놓는다. result 를 주면 그 결과로 답한다 */
    releaseUpload(result = null) {
      uploadResult = result;
      upload.open();
    },
    /**
     * 다른 탭이 그 계정으로 로그인했다: 쿠키가 바뀌고 다른 탭이 마지막 계정 키를 쓰고, 탭 1이 storage 이벤트를 받는다.
     * event: false 면 탭 1은 사건을 받지 못한다(뒤로·앞으로 캐시에 있었거나 얼어 있었다, 또는 사건이 아직 오지 않았다)
     */
    otherTabLogsIn(accountKey, { event = true } = {}) {
      browser.cookie = accountKey;
      tab2.setSession(sessionBody(accountKey));
      if (event) storageEvent(DEVICE_KEY.lastAccountKey);
    },
    /** 같은 키를 다시 쓴 것처럼, 또는 늦게 온 것처럼 사건만 보낸다. storageArea 를 주면 그 저장 영역의 사건이다 */
    storageEventOnly: storageEvent,
    /** 뒤로·앞으로 캐시에서 돌아왔다 */
    pageshow() {
      window1.fire('pageshow', { persisted: true });
    },
    /** 문서의 보임 상태가 바뀌었다 */
    setVisibility(state) {
      window1.document.visibilityState = state;
      window1.fire('document:visibilitychange');
    },
    /** 저장소에 남은 그 계정의 지켜보기 레코드(원문) */
    rawWatch(accountKey) {
      const raw = shared.getItem(accountRecordKey(accountKey, 'guardianWatch'));
      return raw === null ? null : JSON.parse(raw).data;
    },
  };
}


describe('다른 탭의 계정 전환: 이 탭의 세션 (실제 저장소 둘)', () => {
  test('다른 탭이 B 로 로그인하면 A 세션을 버리고 B 의 보기 전용(세션 확인 전과 같은 상태)이 되며, 1분 조절 없이 곧바로 다시 묻는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    assert.equal(h.tab1.getStatus().accountKey, A);
    assert.equal(h.tab1.getStatus().readOnly, false);

    h.otherTabLogsIn(B);
    const status = h.tab1.getStatus();
    assert.equal(status.accountKey, B, '이 탭이 아직 A 라고 보면 A 이름공간에 쓰고 서버 요청을 A 것으로 보낸다');
    assert.equal(status.readOnly, true);
    assert.equal(status.authenticated, false);
    assert.equal(status.sessionChecked, false, '세션을 다시 확인하기 전이라 보기 전용 안내를 띄우지 않는다');
    assert.equal(h.tab1.writeStay(makeStay({ pace: 'NORMAL' })).code, STORE_ERROR.READ_ONLY);
    assert.deepEqual(
      h.sessionChecks.map((c) => c.cookie),
      [B],
      '포커스나 1분 조절(sessionUpkeep)을 기다리지 않고 저장소가 곧바로 세션을 다시 물었다',
    );

    h.sessionChecks[0].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.equal(h.tab1.getStatus().readOnly, false);
    assert.equal(h.tab1.readLastAccountKey(), B);
    assert.ok(h.shared.getItem(accountRecordKey(A, 'stay')), 'A 의 기기 데이터는 그대로다');
  });

  test('마지막 계정 키가 그대로인 이벤트(같은 키를 다시 씀)와 다른 키의 변경은 전환이 아니다: 세션을 두고 다시 묻지 않는다', () => {
    const h = twoTabs();
    const before = h.tab1.getStatus();
    h.storageEventOnly(DEVICE_KEY.lastAccountKey);
    h.storageEventOnly(DEVICE_KEY.lang);
    assert.equal(h.tab1.getStatus(), before, '상태가 그대로다(같은 참조)');
    assert.equal(h.tab1.getStatus().readOnly, false);
    assert.deepEqual(h.sessionChecks, []);
  });

  test('바뀌기 전에 보낸 세션 확인의 응답(A)은 늦게 와도 반영하지 않는다(A 로 쓰기를 열거나 마지막 계정 키를 A 로 되돌리지 않는다)', async () => {
    const h = twoTabs();
    h.holdSessions();
    const stale = h.tab1.refreshSession(); // 화면 복귀 등으로 A 쿠키일 때 보냈다
    h.otherTabLogsIn(B);
    assert.deepEqual(
      h.sessionChecks.map((c) => c.cookie),
      [A, B],
    );

    h.sessionChecks[1].open(); // 새 확인(B)이 먼저 답한다
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);

    h.sessionChecks[0].open(); // 앞 쿠키의 응답이 늦게 온다
    await stale;
    const status = h.tab1.getStatus();
    assert.equal(status.accountKey, B, '늦게 온 A 응답으로 A 쓰기를 열면 A 이름공간에 쓰고 요청은 B 쿠키로 나간다');
    assert.equal(status.readOnly, false);
    assert.equal(h.tab1.readLastAccountKey(), B, '마지막 계정 키를 A 로 되돌리면 다른 탭이 다시 전환을 본다');
  });
});

describe('다른 탭의 계정 전환: 이 탭의 실행기는 B 쿠키로 A 의 일을 보내지 않는다 (실제 저장소 둘·실행기)', () => {
  test('서버 지우기: A 화면에서 누른 뒤 줄 서 있다가 전환을 만나면 보내지 않는다. 보기 전용인 동안은 키 없이 눌러도 보내지 않는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    void h.runner.kick('plan');
    await until(() => h.sent.length === 1); // A 의 마감 올리기가 A 쿠키로 나가 붙잡혀 있다
    const queued = h.runner.removeAll({ accountKey: A });
    h.otherTabLogsIn(B);
    const unkeyed = h.runner.removeAll();
    h.releaseUpload();

    assert.deepEqual(await queued, UNAVAILABLE);
    assert.deepEqual(await unkeyed, LOGIN_REQUIRED, '보기 전용이라 보내지 않는다');
    await h.runner.idle();
    assert.deepEqual(h.sent, [['deadlines', A]], 'DELETE { all: true } 가 B 쿠키로 나가면 B 의 지켜보기가 모두 지워진다');
    assert.equal(h.rawWatch(A)?.state, 'ON', 'A 의 기기 레코드도 그대로다');

    h.sessionChecks[0].open(); // B 로 쓰기 가능해진다(B 에는 지켜보기가 없다)
    await until(() => h.tab1.getStatus().authenticated);
    await h.runner.idle();
    assert.deepEqual(h.sent, [['deadlines', A]]);
  });

  test('등록: 줄 선 등록이 전환을 만나면 보내지 않고 A 이름공간에 B 소유 지켜보기를 쓰지 않는다. 보기 전용인 동안은 키 없이도 보내지 않는다', async () => {
    const h = twoTabs({ aWatch: false });
    h.holdSessions();
    const stay = h.tab1.readStay();
    const queued = h.runner.ensureRegistered({ stay, accountKey: A });
    h.otherTabLogsIn(B);
    const unkeyed = h.runner.ensureRegistered({ stay });

    assert.deepEqual(await queued, UNAVAILABLE);
    assert.deepEqual(await unkeyed, LOGIN_REQUIRED);
    await h.runner.idle();
    assert.deepEqual(h.sent, [], 'POST /api/watch 가 B 쿠키로 나가면 B 소유 지켜보기가 생긴다');
    assert.equal(h.rawWatch(A), null, 'A 이름공간에 지켜보기가 생기지 않는다');
    assert.equal(h.rawWatch(B), null);
    assert.deepEqual(h.tab1.readPendingServerDelete(), []);
  });

  test('뒤에서 도는 올리기: 전환 뒤에는 마감 올리기가 나가지 않고, 응답을 기다리던 올리기가 404 여도 A 의 지켜보기를 갈아 끼움으로 바꾸지 않는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    void h.runner.kick('plan');
    await until(() => h.sent.length === 1);
    h.otherTabLogsIn(B);
    // 소유자가 다른 쿠키로 받은 것과 같은 404
    h.releaseUpload({ ok: false, status: 404, network: false, errorCode: 'WATCH_NOT_FOUND', kind: WATCH_KIND.NOT_FOUND });
    await h.runner.idle();
    void h.runner.kick('resume'); // 가려진 탭의 화면 복귀·자정·일정 변경 계기
    await h.runner.idle();
    assert.deepEqual(h.sent, [['deadlines', A]], '전환 뒤에 마감 올리기가 B 쿠키로 나가면 소유자가 달라 404 를 받는다');
    assert.equal(h.rawWatch(A)?.state, 'ON', 'A 의 켜진 지켜보기를 갈아 끼움으로 바꾸지 않는다');

    // B 로 확인이 끝난 뒤 A 가 다시 로그인하면, A 의 지켜보기는 켜진 그대로 A 쿠키로 다시 올린다
    h.sessionChecks[0].open();
    await until(() => h.tab1.getStatus().authenticated);
    h.releaseUpload(null); // 다음 올리기는 받아들여진다
    h.otherTabLogsIn(A);
    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated && h.tab1.getStatus().accountKey === A);
    await h.runner.idle();
    assert.deepEqual(h.sent, [
      ['deadlines', A],
      ['deadlines', A],
    ]);
    assert.equal(h.tab1.readGuardianWatch()?.state, 'ON');
    assert.equal(h.tab1.readGuardianWatch()?.uploadPending, false);
  });
});

describe('다른 탭의 계정 전환: 세션이 없을 때, 바뀐 것이 겹칠 때, 지울 때 (e4617eb 검토 I1·M3)', () => {
  test('방금 연 탭의 첫 세션 확인(A 쿠키) 중에 다른 탭이 B 로 로그인하면 그 확인을 무르고 곧바로 B 로 묻는다. 늦은 A 응답으로 A 쓰기를 열지 않는다', async () => {
    const h = twoTabs({ fresh: true });
    h.holdSessions();
    h.releaseUpload(NOT_FOUND); // 마감 올리기가 B 쿠키로 나가면 소유자가 달라 404 를 받는다
    assert.equal(h.tab1.getStatus().sessionChecked, false);
    assert.equal(h.tab1.getStatus().accountKey, A, '확인 전에는 마지막 계정 A 를 보기 전용으로 읽는다');

    const first = h.tab1.refreshSession(); // 셸의 첫 확인
    h.otherTabLogsIn(B);
    assert.deepEqual(h.checkedCookies(), [A, B], '세션이 아직 없어도 확인이 나가 있으면 무르고 곧바로 B 로 다시 묻는다');

    h.sessionChecks[0].open(); // 앞 쿠키(A)의 응답이 늦게 온다
    await first;
    await h.runner.idle();
    const status = h.tab1.getStatus();
    assert.equal(status.authenticated, false, 'A 응답을 반영하면 B 쿠키로 A 의 일을 보낸다');
    assert.equal(status.readOnly, true);
    assert.equal(status.accountKey, B);
    assert.equal(h.tab1.readLastAccountKey(), B, '마지막 계정 키를 A 로 되돌려 쓰지 않는다');
    assert.deepEqual(await h.runner.removeAll({ accountKey: A }), UNAVAILABLE);
    assert.deepEqual(h.sent, [], 'A 의 마감 올리기와 전체 삭제가 B 쿠키로 나가지 않는다');
    assert.equal(h.rawWatch(A)?.state, 'ON', 'A 의 켜진 지켜보기를 갈아 끼움으로 바꾸지 않는다');

    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated);
    await h.runner.idle();
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.deepEqual(h.sent, [], 'B 에는 지켜보기가 없다');
  });

  test('A 에서 B, 다시 A 로 응답 한 번 사이에 바뀌면 두 번째 전환도 무른다: B 쿠키로 보낸 확인의 응답을 반영하지 않고 A 로 다시 묻는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    h.otherTabLogsIn(B);
    h.otherTabLogsIn(A);
    assert.deepEqual(h.checkedCookies(), [B, A], '버린 뒤 세션이 없는 동안 온 두 번째 전환도 받는다');

    h.sessionChecks[0].open(); // 쿠키가 B 였을 때 보낸 확인
    await settle();
    assert.equal(h.tab1.getStatus().authenticated, false, 'B 응답을 반영하면 A 쿠키인데 B 이름공간에 쓴다');
    assert.equal(h.tab1.readLastAccountKey(), A);

    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, A);
    assert.equal(h.tab1.getStatus().readOnly, false);
  });

  test('다른 탭이 내 정보 지우기를 하면(마지막 계정 키를 지움) 세션을 버린다. 그 탭의 로그아웃이 서버에 닿아 보류 표시가 지워져도 지운 A 데이터가 되살아나지 않는다', async () => {
    const h = twoTabs();
    await h.tab2.deleteAllMyData(); // 키를 지우고, 로그아웃 보류를 쓰고, 로그아웃이 닿아 보류를 지운다(쿠키도 지워진다)
    assert.equal(h.shared.getItem(accountRecordKey(A, 'stay')), null);
    h.storageEventOnly(DEVICE_KEY.lastAccountKey);
    h.storageEventOnly(DEVICE_KEY.logoutPending);
    h.storageEventOnly(DEVICE_KEY.logoutPending);

    const status = h.tab1.getStatus();
    assert.equal(status.authenticated, false, '앞 세션이 다시 살아나면 쿠키 없이 쓰기가 열린다');
    assert.equal(status.readOnly, true);
    assert.equal(status.accountKey, null);
    assert.equal(h.tab1.writeStay(makeStay()).code, STORE_ERROR.READ_ONLY);
    assert.equal(h.shared.getItem(accountRecordKey(A, 'stay')), null, '지운 체류를 다시 만들지 않는다');

    await until(() => h.tab1.getStatus().sessionChecked);
    assert.deepEqual(h.checkedCookies(), [null], '버린 뒤 곧바로 물었고, 쿠키가 없어 로그인이 아니다');
    assert.equal(h.tab1.getStatus().authenticated, false);
    assert.equal(h.tab1.writeStay(makeStay()).code, STORE_ERROR.READ_ONLY);
  });

  test('다른 탭이 저장소를 통째로 비우면(마지막 계정 키도 지워진다) 세션을 버리고 다시 묻는다', () => {
    const h = twoTabs();
    h.holdSessions();
    h.shared.clear();
    h.storageEventOnly(null);
    assert.equal(h.tab1.getStatus().readOnly, true);
    assert.deepEqual(h.checkedCookies(), [A]);
  });

  test('다른 저장 영역(탭 저장소 등)에서 온 같은 키의 사건으로는 세션을 버리지 않는다', () => {
    const h = twoTabs();
    h.holdSessions();
    h.otherTabLogsIn(B, { event: false });
    h.storageEventOnly(DEVICE_KEY.lastAccountKey, createMemoryStorage());
    assert.equal(h.tab1.getStatus().accountKey, A);
    assert.equal(h.tab1.getStatus().readOnly, false);
    assert.deepEqual(h.checkedCookies(), []);

    h.storageEventOnly(DEVICE_KEY.lastAccountKey); // 이 탭 저장소의 사건
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.deepEqual(h.checkedCookies(), [B]);
  });
});

describe('다른 탭의 계정 전환: 늦은 실패와 다시 묻기 (e4617eb 검토 M2)', () => {
  test('버리기 전에 보낸 확인이 늦게 연결 오류로 끝나도, 이미 B 로 확인된 탭을 오프라인 보기 전용으로 돌리지 않는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    const stale = h.tab1.refreshSession(); // A 쿠키
    h.otherTabLogsIn(B);
    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated);

    h.sessionChecks[0].open('network');
    await stale;
    const status = h.tab1.getStatus();
    assert.equal(status.online, true);
    assert.equal(status.readOnly, false);
    assert.equal(status.accountKey, B);
  });

  test('다른 탭이 남긴 로그아웃 보류를 다시 보내는 중에 그 탭이 로그아웃을 끝내고 B 로 로그인하면, 늦은 로그아웃 연결 오류로 B 탭을 오프라인으로 돌리지 않는다', async () => {
    const h = twoTabs();
    h.holdLogouts();
    // 다른 탭의 로그아웃이 닿지 않아 보류 표시가 남았다
    h.shared.setItem(DEVICE_KEY.logoutPending, JSON.stringify({ schemaVersion: 2, data: { since: `${TODAY}T03:00:00.000Z` } }));
    h.storageEventOnly(DEVICE_KEY.logoutPending);
    const stale = h.tab1.refreshSession(); // 보류가 있어 세션을 묻기 전에 로그아웃을 다시 보낸다
    assert.equal(h.logoutRequests.length, 1);

    // 다른 탭의 다시 보낸 로그아웃이 닿아 보류를 지웠고, 그 탭이 B 로 로그인했다
    h.shared.removeItem(DEVICE_KEY.logoutPending);
    h.storageEventOnly(DEVICE_KEY.logoutPending);
    h.otherTabLogsIn(B);
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);

    h.logoutRequests[0]('network');
    await stale;
    const status = h.tab1.getStatus();
    assert.equal(status.online, true, '버리기 전에 보낸 로그아웃의 실패라 반영하지 않는다');
    assert.equal(status.readOnly, false);
    assert.equal(status.accountKey, B);
  });

  test(`버린 뒤 다시 묻기가 실패 응답(503)이면 ${SESSION_RECHECK_RETRY_MS / 1000}초 뒤 한 번 더 묻고, 그 답으로 B 가 된다`, async () => {
    const timers = fakeTimers();
    const h = twoTabs({ timers });
    h.holdSessions();
    h.otherTabLogsIn(B);
    h.sessionChecks[0].open(503);
    await settle();
    assert.equal(h.tab1.getStatus().authenticated, false);
    assert.equal(timers.count(SESSION_RECHECK_RETRY_MS), 1, '한 번 더 묻기를 걸었다');

    timers.run(SESSION_RECHECK_RETRY_MS);
    assert.deepEqual(h.checkedCookies(), [B, B]);
    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.equal(timers.count(SESSION_RECHECK_RETRY_MS), 0);

    h.otherTabLogsIn(A); // 이번 다시 묻기는 답을 받는다
    h.sessionChecks[2].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, A);
    await settle();
    assert.equal(timers.count(SESSION_RECHECK_RETRY_MS), 0, '답을 받았으면 한 번 더 묻지 않는다');
  });

  test('다시 묻기는 한 번뿐이고(또 연결 오류여도 더 걸지 않는다), 그 사이 또 바뀌었으면 앞 버리기의 다시 묻기는 걸지도 묻지도 않는다', async () => {
    const timers = fakeTimers();
    const h = twoTabs({ timers });
    h.holdSessions();
    h.otherTabLogsIn(B);
    h.sessionChecks[0].open('network');
    await settle();
    assert.equal(h.tab1.getStatus().online, false, '연결 오류면 오프라인 보기 전용이다');
    timers.run(SESSION_RECHECK_RETRY_MS);
    h.sessionChecks[1].open('network');
    await settle();
    assert.equal(timers.count(SESSION_RECHECK_RETRY_MS), 0, '두 번째 실패 뒤에는 화면 복귀·온라인 계기에 맡긴다');
    assert.deepEqual(h.checkedCookies(), [B, B]);

    const otherTimers = fakeTimers();
    const other = twoTabs({ timers: otherTimers });
    other.holdSessions();
    other.otherTabLogsIn(B);
    other.sessionChecks[0].open(503);
    await settle();
    assert.equal(otherTimers.count(SESSION_RECHECK_RETRY_MS), 1);
    other.otherTabLogsIn(A); // 다시 묻기 전에 또 바뀌었다: 이 버리기가 곧바로 묻는다
    otherTimers.run(SESSION_RECHECK_RETRY_MS);
    assert.deepEqual(other.checkedCookies(), [B, A], '걸어 둔 다시 묻기는 앞 전환의 것이라 묻지 않는다');

    const lateTimers = fakeTimers();
    const late = twoTabs({ timers: lateTimers });
    late.holdSessions();
    late.otherTabLogsIn(B);
    late.otherTabLogsIn(A); // 앞 버리기의 다시 묻기(B 쿠키)가 답하기 전에 또 바뀌었다
    late.sessionChecks[0].open('network');
    await settle();
    assert.equal(lateTimers.count(SESSION_RECHECK_RETRY_MS), 0, '앞 버리기의 확인이 늦게 실패해도 다시 묻기를 걸지 않는다(새 버리기의 확인이 맡는다)');
    assert.equal(late.tab1.getStatus().online, true);
  });
});

describe('다른 탭의 계정 전환: storage 이벤트를 받지 못한 탭 (e4617eb 검토 M1)', () => {
  test('뒤로·앞으로 캐시에서 돌아오면(pageshow) 마지막 계정 키를 다시 대조해 세션을 버리고 곧바로 묻는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    h.otherTabLogsIn(B, { event: false });
    assert.equal(h.tab1.getStatus().accountKey, A, '사건을 받지 못해 아직 A 다');

    h.pageshow();
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.equal(h.tab1.getStatus().readOnly, true);
    assert.deepEqual(h.checkedCookies(), [B]);
    h.sessionChecks[0].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);
  });

  test('가려졌다 다시 보이면(visibilitychange) 대조한다. 가려진 채로는 대조하지 않는다', () => {
    const h = twoTabs();
    h.holdSessions();
    h.setVisibility('hidden');
    h.otherTabLogsIn(B, { event: false });
    h.setVisibility('hidden');
    assert.equal(h.tab1.getStatus().accountKey, A);
    assert.deepEqual(h.checkedCookies(), []);

    h.setVisibility('visible');
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.deepEqual(h.checkedCookies(), [B]);
  });

  test('마지막 계정 키가 이 탭이 본 그대로면 다시 보여도 세션을 버리지 않는다(로그아웃한 탭이 돌아올 때마다 묻지 않는다)', () => {
    const h = twoTabs();
    h.tab1.setSession({ ok: true, authenticated: false }); // 세션 없음, 마지막 계정은 A 그대로
    const before = h.tab1.getStatus();
    assert.equal(before.sessionChecked, true);
    h.pageshow();
    h.setVisibility('visible');
    assert.equal(h.tab1.getStatus(), before, '상태가 그대로다(보기 전용 안내가 깜박이지 않는다)');
    assert.deepEqual(h.checkedCookies(), []);
  });

  test('실행기는 일을 시작할 때 다시 대조한다: 사건 없이 바뀌었어도 화면 복귀의 비우기가 B 쿠키로 A 의 마감을 올리지 않고, 줄 선 서버 지우기도 보내지 않는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    h.releaseUpload(NOT_FOUND);
    h.otherTabLogsIn(B, { event: false });
    await h.runner.kick('resume');
    assert.deepEqual(h.sent, [], 'B 쿠키로 A 의 마감을 올리면 404 를 받는다');
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.deepEqual(h.checkedCookies(), [B]);
    assert.equal(h.rawWatch(A)?.state, 'ON');
    assert.equal(h.rawWatch(A)?.uploadPending, true);

    const fresh = twoTabs();
    fresh.otherTabLogsIn(B, { event: false });
    assert.deepEqual(await fresh.runner.removeAll({ accountKey: A }), UNAVAILABLE);
    assert.deepEqual(fresh.sent, [], 'DELETE { all: true } 가 B 쿠키로 나가면 B 의 지켜보기가 모두 지워진다');
  });

  test('도는 중에 온 계기로 다시 도는 비우기도 시작할 때 대조한다(첫 올리기가 A 쿠키로 나간 뒤 바뀌었으면 두 번째는 보내지 않는다)', async () => {
    const h = twoTabs();
    h.holdSessions();
    void h.runner.kick('plan');
    await until(() => h.sent.length === 1); // A 쿠키로 나간 올리기가 붙잡혀 있다
    h.otherTabLogsIn(B, { event: false });
    void h.runner.kick('resume'); // 도는 중이라 끝난 뒤 한 번 더 돈다
    h.releaseUpload({ ok: false, status: 503, network: false, errorCode: 'WATCH_UNAVAILABLE', kind: WATCH_KIND.UNAVAILABLE });
    await h.runner.idle();
    assert.deepEqual(h.sent, [['deadlines', A]], '다시 도는 비우기가 B 쿠키로 A 의 마감을 다시 올리지 않는다');
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.deepEqual(h.checkedCookies(), [B]);
  });

  test('이 탭이 세션 응답으로 쓴 마지막 계정 키는 다른 탭의 전환이 아니다: 다시 보여도 버리지 않는다', async () => {
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const expiresAt = new Date(Date.parse(`${TODAY}T12:00:00+09:00`) + HOUR).toISOString();
    let checks = 0;
    const store = createStore({
      storage: createMemoryStorage(), // 마지막 계정 키가 없는 기기
      now: () => Date.parse(`${TODAY}T12:00:00+09:00`),
      fetchImpl: async () => {
        checks += 1;
        return json({ ok: true, authenticated: true, accountKey: A, expiresAt });
      },
    });
    const view = fakeWindow();
    store.attachWindow(view.win);
    await store.refreshSession();
    assert.equal(store.readLastAccountKey(), A);
    const before = store.getStatus();
    view.fire('pageshow', { persisted: true });
    view.fire('document:visibilitychange');
    assert.equal(store.getStatus(), before);
    assert.equal(checks, 1);
  });

  test('앞 쿠키의 세션 응답이 storage 이벤트보다 먼저 와도 반영하지 않는다(응답을 반영하기 전에 대조한다). 늦게 온 사건으로 또 버리지 않는다', async () => {
    const h = twoTabs();
    h.holdSessions();
    const stale = h.tab1.refreshSession(); // A 쿠키
    h.otherTabLogsIn(B, { event: false }); // 사건은 아직 오지 않았다
    h.sessionChecks[0].open();
    await stale;
    assert.equal(h.tab1.getStatus().accountKey, B);
    assert.equal(h.tab1.getStatus().readOnly, true);
    assert.equal(h.tab1.readLastAccountKey(), B, 'A 로 되돌려 쓰면 다른 탭이 전환을 본다');
    assert.deepEqual(h.checkedCookies(), [A, B]);

    h.storageEventOnly(DEVICE_KEY.lastAccountKey); // 사건이 늦게 왔다
    assert.deepEqual(h.checkedCookies(), [A, B]);
    h.sessionChecks[1].open();
    await until(() => h.tab1.getStatus().authenticated);
    assert.equal(h.tab1.getStatus().accountKey, B);
  });

  test('연결을 끊으면 창과 문서에 건 듣기를 모두 뗀다', () => {
    const h = twoTabs();
    assert.ok(h.window1.count() > 0);
    h.detach();
    assert.equal(h.window1.count(), 0);
  });
});

describe('누른 화면의 계정 키 null 도 대조한다 (e4617eb 검토, 살아남은 변이)', () => {
  test('화면을 그린 때 계정이 없었으면(null) 지금 계정이 A 여도 등록·끄기·서버 지우기를 하지 않는다', async () => {
    const h = twoTabs();
    assert.deepEqual(await h.runner.removeAll({ accountKey: null }), UNAVAILABLE);
    assert.deepEqual(await h.runner.retire({ accountKey: null }), UNAVAILABLE);
    assert.deepEqual(await h.runner.ensureRegistered({ stay: h.tab1.readStay(), accountKey: null }), UNAVAILABLE);
    await h.runner.idle();
    assert.deepEqual(h.sent, []);
    assert.equal(h.rawWatch(A)?.state, 'ON');
    assert.deepEqual(h.tab1.readPendingServerDelete(), []);
  });
});
