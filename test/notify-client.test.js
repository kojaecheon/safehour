// 브라우저 기본 알림 실행기 (lib/notify/client.js · lib/notify/AGENTS.md)
//
// 실행기가 정한 보호자 마감 지남의 tag 방식(sharedWatchTag)이 client.js 를 지나 deliverToDevice 까지 가는지 본다.
//   - 환자가 하나면 서버 푸시와 같은 tag 로 내고, 그 tag 가 떠 있으면 내지 않는다.
//   - 같은 마감의 다른 환자 사본이 있으면 예약 id tag 로 내고 떠 있는지 묻지 않는다.
// client.js 는 브라우저 전역(window, navigator, Notification)과 기본 저장소(getStore)를 쓴다. 전역은 가짜로 두고,
// 시계(Date.now)는 고정 epoch 로 바꾼다. node --test 는 파일마다 따로 돌아 다른 테스트 파일에 번지지 않는다.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getNotifier } from '../lib/notify/client.js';
import { createMemoryStorage, getStore } from '../lib/store/index.js';

const DATE = '2026-09-20';
const kst = (time) => Date.parse(`${DATE}T${time}:00+09:00`);
const iso = (time, date = DATE) => new Date(Date.parse(`${date}T${time}:00+09:00`)).toISOString();
const ACCOUNT = 'acct_0123456789abcdefXYZ';
const W_A = 'A'.repeat(22);
const W_B = 'B'.repeat(22);

let clock = kst('06:00');
const displayed = new Set();
const asked = [];
const shown = [];
const fetched = [];
const saved = {};

const registration = {
  active: { state: 'activated' },
  getNotifications: async ({ tag } = {}) => {
    asked.push(tag);
    return displayed.has(tag) ? [{ tag }] : [];
  },
  showNotification: async (title, options) => {
    shown.push(options.tag);
  },
};

/** 실행기와 deliverToDevice 의 비동기 단계가 끝나기를 기다린다 */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** 받은 보호자 사본 (watchId 가 있으면 스냅샷 끝에 붙는다, src/guardian/snapshot.js) */
function copy(by, importedAt, watchId = null) {
  return {
    snapshot: { days: [{ date: DATE, patientReturn: [{ by, placeName: '숙소', placeAddress: null }] }], ...(watchId ? { watchId } : {}) },
    importedAt,
    expiresAt: iso('23:00', '2026-09-30'),
  };
}

before(() => {
  for (const name of ['window', 'navigator', 'Notification', 'fetch']) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  }
  saved.now = Date.now;
  Date.now = () => clock;
  const win = {
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    navigator: { onLine: true, language: 'ko', serviceWorker: { getRegistration: async () => registration } },
    // 저장소의 세션 만료 타이머가 테스트 프로세스를 붙잡지 않게 한다
    setTimeout: (...args) => {
      const timer = setTimeout(...args);
      timer.unref?.();
      return timer;
    },
    clearTimeout: (timer) => clearTimeout(timer),
    addEventListener() {},
    removeEventListener() {},
    location: { origin: 'https://safehour.example', pathname: '/g', assign() {} },
  };
  function NoConstructor() {
    throw new Error('서비스 워커 경로에서는 생성자를 부르지 않는다');
  }
  NoConstructor.permission = 'granted';
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  define('window', win);
  define('navigator', win.navigator);
  define('Notification', NoConstructor);
  define('fetch', async (...args) => {
    fetched.push(args);
    throw new Error('외부 호출 없음');
  });

  const store = getStore();
  store.setSession({ authenticated: true, accountKey: ACCOUNT, expiresAt: new Date(clock + 48 * 3600 * 1000).toISOString() });
  assert.equal(store.writePrefs({ notifications: true }).ok, true);
});

after(() => {
  getNotifier()?.stop();
  Date.now = saved.now;
  for (const [name, descriptor] of Object.entries(saved)) {
    if (name === 'now') continue;
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

describe('client.js 가 실행기의 tag 방식을 deliverToDevice 에 넘긴다', () => {
  test('환자가 하나: 서버 푸시와 같은 tag 가 떠 있으면 다시 울리지 않는다', async () => {
    const store = getStore();
    assert.equal(store.writeGuardianCopy('one', copy('18:00', iso('05:30'), W_A)).ok, true);
    const tag = `sh-watch-${DATE}-18:00`;
    displayed.add(tag);
    clock = kst('18:15');
    const notifier = getNotifier();
    notifier.start();
    await settle();
    notifier.stop();
    assert.equal(notifier.getBanner()?.kind, 'COMPANION_RETURN_PASSED');
    assert.deepEqual(asked, [tag]);
    assert.deepEqual(shown, []);
  });

  test('같은 마감의 다른 환자 사본이 있으면 예약 id tag 로 내고 떠 있는지 묻지 않는다', async () => {
    asked.length = 0;
    shown.length = 0;
    const store = getStore();
    assert.equal(store.writeGuardianCopy('two-b', copy('19:00', iso('06:00'), W_B)).ok, true);
    assert.equal(store.writeGuardianCopy('two-a', copy('19:00', iso('06:30'), W_A)).ok, true);
    const tag = `sh-watch-${DATE}-19:00`;
    // B 환자의 서버 푸시가 같은 마감 tag 로 떠 있다
    displayed.add(tag);
    clock = kst('19:15');
    const notifier = getNotifier();
    notifier.start();
    await settle();
    notifier.stop();
    const banner = notifier.getBanner();
    assert.equal(banner?.kind, 'COMPANION_RETURN_PASSED');
    assert.equal(banner?.time, '19:00');
    assert.deepEqual(asked, []);
    assert.deepEqual(shown, [banner.id]);
    assert.notEqual(banner.id, tag);
    assert.deepEqual(fetched, [], '외부 호출이 없다');
  });
});
