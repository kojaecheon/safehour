// 다른 탭에서 계정이 바뀔 때 (lib/store/store.js attachWindow·refreshSession, lib/trip/watchSync.js · A-3 검토 I1)
//
// 이 파일이 고정하는 것
//   - 세션 쿠키는 브라우저에 하나다. 다른 탭이 다른 계정으로 로그인해 마지막 계정 키(lastAccountKey)가 바뀌면, 이 탭은 메모리의
//     세션(앞 계정)을 버리고 새 계정의 보기 전용(세션을 확인하기 전과 같은 상태)이 되며, 1분 조절 없이 곧바로 세션을 다시 묻는다
//   - 그동안 실행기는 앞 계정 것으로 보고 보내지 않는다. 줄 선 서버 지우기·등록은 아무것도 보내지 않고(계정 키를 넘기지 않아도
//     보기 전용이라 보내지 않는다), 마감 올리기도 나가지 않는다. 응답을 기다리던 올리기가 404 여도 앞 계정의 지켜보기를 갈아
//     끼움(REPLACED)으로 바꾸지 않는다
//   - 바뀌기 전에 보낸 세션 확인의 응답(앞 계정)은 반영하지 않는다. 같은 계정 키가 다시 쓰인 것은 전환이 아니다
//
// 탭 둘은 같은 메모리 저장소를 나눠 쓰는 저장소 인스턴스 둘이고, 브라우저 쿠키는 변수 하나가 대신한다(가짜 fetch 와 가짜 요청 함수가
// 보낸 때의 그 값을 기록한다). storage 이벤트는 바꾼 탭이 아닌 다른 탭에만 오므로 탭 1에만 보낸다.
// 외부 호출과 벽시계는 없다. 계정 키와 식별 값은 형식만 맞춘 테스트 값이다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEVICE_KEY, STORE_ERROR, accountRecordKey, createMemoryStorage, createStore } from '../lib/store/index.js';
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
const UNAVAILABLE = Object.freeze({ ok: false, reason: WATCH_KIND.UNAVAILABLE });
const LOGIN_REQUIRED = Object.freeze({ ok: false, reason: WATCH_KIND.LOGIN_REQUIRED });

async function until(predicate) {
  for (let i = 0; i < 1000 && !predicate(); i += 1) await Promise.resolve();
  assert.ok(predicate(), '조건에 닿지 않았다');
}

/** 한 번 놓을 때까지 기다리는 문. open() 뒤에는 바로 지난다 */
function gate() {
  let open;
  const wait = new Promise((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/**
 * 탭 둘, 쿠키 하나. 탭 1은 A 로 로그인했고 체류·일정이 있다. aWatch 면 A 의 지켜보기가 켜져 있다(올리지 않은 상태).
 * 탭 1의 실행기는 화면처럼 시작해 둔다(상태 구독: 쓰기 가능으로 돌아오면 비운다).
 */
function twoTabs({ aWatch = true } = {}) {
  const shared = createMemoryStorage();
  const clock = { ms: Date.parse(`${TODAY}T12:00:00+09:00`) };
  const now = () => clock.ms;
  const expiresAt = new Date(now() + 7 * 24 * HOUR).toISOString();
  const sessionBody = (accountKey) => ({ ok: true, authenticated: true, accountKey, expiresAt });
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  const browser = { cookie: A };
  /** 세션 확인: 보낸 때의 쿠키. holdSessions 를 부르면 하나씩 붙잡는다 */
  const sessionChecks = [];
  let sessionGate = null;
  const fetchImpl = async (url) => {
    if (url === SESSION_URL) {
      const cookie = browser.cookie;
      const held = sessionGate ? gate() : null;
      sessionChecks.push({ cookie, open: held ? held.open : () => {} });
      if (held) await held.wait;
      return json(sessionBody(cookie));
    }
    return json({ ok: true });
  };

  const tab1 = createStore({ storage: shared, now, fetchImpl });
  const tab2 = createStore({ storage: shared, now, fetchImpl });
  const storageListeners = [];
  tab1.attachWindow({
    navigator: { onLine: true },
    addEventListener: (type, fn) => {
      if (type === 'storage') storageListeners.push(fn);
    },
    removeEventListener() {},
  });
  tab1.setSession(sessionBody(A));
  const plan = { days: { [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '10:00', returnBy: '12:30' })] }) } };
  assert.equal(tab1.writeStay(makeStay()).ok, true);
  assert.equal(tab1.writeTripPlan(plan).ok, true);
  if (aWatch) {
    const record = { ...WA, expiresOn: '2026-10-08', lastUploaded: {}, uploadPending: true, backQueue: [], confirmed: [], state: 'ON' };
    assert.equal(tab1.writeGuardianWatch(record).ok, true);
  }

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

  return {
    shared,
    tab1,
    tab2,
    runner,
    sent,
    sessionChecks,
    /** 세션 확인을 하나씩 붙잡는다(각 확인의 open 으로 놓는다) */
    holdSessions() {
      sessionGate = true;
    },
    /** 붙잡힌 마감 올리기를 놓는다. result 를 주면 그 결과로 답한다 */
    releaseUpload(result = null) {
      uploadResult = result;
      upload.open();
    },
    /** 다른 탭이 그 계정으로 로그인했다: 쿠키가 바뀌고 다른 탭이 마지막 계정 키를 쓰고, 탭 1이 storage 이벤트를 받는다 */
    otherTabLogsIn(accountKey) {
      browser.cookie = accountKey;
      tab2.setSession(sessionBody(accountKey));
      for (const fn of storageListeners) fn({ key: DEVICE_KEY.lastAccountKey, storageArea: shared });
    },
    /** 같은 키를 다시 쓴 것처럼 이벤트만 보낸다 */
    storageEventOnly(key) {
      for (const fn of storageListeners) fn({ key, storageArea: shared });
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
