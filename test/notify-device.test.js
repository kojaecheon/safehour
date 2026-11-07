// 기기 알림 한 장·세션 유지·서비스 워커 등록 (AX-319 · spec 4.13 · 4.18 · 규칙 47)
//
//   - 설정에서 켰고 권한이 이미 '허용'일 때만 기기 알림을 낸다. 권한을 요청하지 않는다(설정 화면 몫).
//   - 서비스 워커가 있으면 showNotification, 없으면 생성자. 알림에 실리는 값은 허용 목록뿐이다(규칙 47).
//   - 세션 유지: 초점·보임은 1분에 한 번, 온라인 복귀는 바로 refreshSession.
//   - 서비스 워커는 사이트 전체 범위로 load 뒤에 등록한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deliverToDevice, notificationClickPath, notificationOpenUrl } from '../lib/notify/device.js';
import { planNotifications } from '../lib/notify/schedule.js';
import { attachSessionUpkeep, createSessionUpkeep } from '../components/pwa/sessionUpkeep.js';
import { registerServiceWorker } from '../components/pwa/registerServiceWorker.js';

const DATE = '2026-09-20';
const kst = (time) => Date.parse(`${DATE}T${time}:00+09:00`);

const PLAN = {
  date: DATE,
  effective: { medication: { value: { kind: 'SET', value: [{ time: '13:00', atLodging: false }] }, provenance: [] } },
  blocks: [{ kind: 'APPOINTMENT', start: '15:40', end: '17:00', appointmentId: 'appt-서울미래성형외과' }],
  outings: [
    {
      id: 'o1',
      departAt: '10:00',
      returnBy: '12:00',
      returnPlace: 'LODGING',
      deadlineReason: 'MEDICATION',
      stops: [{ title: '서울미래성형외과 옆 카페', address: '강남구 테헤란로 1' }],
    },
  ],
  guardianOutings: [],
};
const ITEMS = planNotifications(PLAN, { nowMs: kst('06:00') });

function fakeStore({ notifications = true, lang = 'ko' } = {}) {
  return { readPrefs: () => ({ notifications, lang, dailyCheck: {} }), readLang: () => lang };
}

function fakeNotification(permission = 'granted') {
  const made = [];
  let requested = 0;
  function FakeNotification(title, options) {
    made.push({ title, options, instance: this });
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = async () => {
    requested += 1;
    return 'granted';
  };
  return { FakeNotification, made, requested: () => requested };
}

function fakeNav({ registration = null, language = 'en-US' } = {}) {
  return {
    language,
    serviceWorker: registration === undefined ? undefined : { getRegistration: async () => registration ?? undefined },
  };
}

function fakeRegistration({ active = true } = {}) {
  const shown = [];
  return {
    shown,
    active: active ? { state: 'activated' } : null,
    showNotification: async (title, options) => {
      shown.push({ title, options });
    },
  };
}

describe('기기 알림 한 장 (deliverToDevice)', () => {
  test('설정에서 꺼 두었으면 내지 않는다', async () => {
    const { FakeNotification, made } = fakeNotification();
    const reg = fakeRegistration();
    const ok = await deliverToDevice(ITEMS[0], { store: fakeStore({ notifications: false }), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification });
    assert.equal(ok, false);
    assert.equal(made.length + reg.shown.length, 0);
  });

  test("권한이 '허용'이 아니면 내지 않고, 권한을 요청하지도 않는다", async () => {
    for (const permission of ['default', 'denied']) {
      const { FakeNotification, made, requested } = fakeNotification(permission);
      const ok = await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav(), NotificationImpl: FakeNotification });
      assert.equal(ok, false, permission);
      assert.equal(made.length, 0);
      assert.equal(requested(), 0, '권한 요청은 설정 화면에서만 한다');
    }
  });

  test('Notification 을 지원하지 않는 브라우저는 조용히 넘긴다', async () => {
    assert.equal(await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav(), NotificationImpl: undefined }), false);
  });

  test('서비스 워커가 있으면 showNotification 으로 낸다 — 실리는 값은 허용 목록뿐', async () => {
    const { FakeNotification, made } = fakeNotification();
    const reg = fakeRegistration();
    const ok = await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification });
    assert.equal(ok, true);
    assert.equal(made.length, 0);
    assert.equal(reg.shown.length, 1);
    const { title, options } = reg.shown[0];
    assert.equal(title, 'SafeHour 알림');
    assert.equal(options.body, '12:00까지 숙소로 돌아갈 시간이에요');
    assert.deepEqual(Object.keys(options).sort(), ['body', 'data', 'icon', 'lang', 'tag']);
    assert.deepEqual(options.data, { url: '/today' });
    assert.equal(options.tag, ITEMS[0].id);
  });

  test('보호자 알림은 /g 로, 그 밖은 /today 로 연다', async () => {
    assert.equal(notificationOpenUrl({ kind: 'COMPANION_RETURN_PASSED' }), '/g');
    for (const kind of ['RETURN', 'RETURN_PASSED', 'LEAVE', 'AT_LODGING', 'AWAY', undefined]) {
      assert.equal(notificationOpenUrl({ kind }), '/today');
    }
    assert.equal(notificationOpenUrl(null), '/today');
    const reg = fakeRegistration();
    const { FakeNotification } = fakeNotification();
    const guardian = {
      id: `${DATE}:COMPANION_RETURN_PASSED:15:30:0`,
      kind: 'COMPANION_RETURN_PASSED',
      key: 'notifications.companionReturnPassed',
      time: '15:30',
    };
    await deliverToDevice(guardian, { store: fakeStore(), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification });
    assert.deepEqual(reg.shown[0].options.data, { url: '/g' });
  });

  test('서비스 워커가 없으면 생성자로 낸다', async () => {
    const { FakeNotification, made } = fakeNotification();
    const ok = await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav({ registration: undefined }), NotificationImpl: FakeNotification });
    assert.equal(ok, true);
    assert.equal(made.length, 1);
  });

  test('서비스 워커가 없을 때 생성자 알림을 누르면 허용 목록 화면으로 이동한다', async () => {
    const { FakeNotification, made } = fakeNotification();
    const calls = [];
    const win = {
      location: { origin: 'https://safehour.example', assign: (href) => calls.push(['assign', href]) },
      focus: () => calls.push(['focus']),
    };
    await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav({ registration: null }), NotificationImpl: FakeNotification, win });
    const { instance } = made[0];
    assert.equal(typeof instance.onclick, 'function');
    instance.close = () => calls.push(['close']);
    instance.onclick();
    assert.deepEqual(calls, [['focus'], ['assign', 'https://safehour.example/today'], ['close']]);
  });

  test('보호자 알림을 누르면 /g 로 이동하고, window 가 없으면 onclick 을 달지 않는다', async () => {
    const guardian = planNotifications(null, {
      nowMs: kst('06:00'),
      companionDay: { date: DATE, patientReturn: [{ by: '12:00' }] },
    })[0];
    const a = fakeNotification();
    const assigned = [];
    const win = { location: { origin: 'https://safehour.example', assign: (h) => assigned.push(h) }, focus() {} };
    await deliverToDevice(guardian, { store: fakeStore(), nav: fakeNav({ registration: null }), NotificationImpl: a.FakeNotification, win });
    a.made[0].instance.close = () => {};
    a.made[0].instance.onclick();
    assert.deepEqual(assigned, ['https://safehour.example/g']);

    const b = fakeNotification();
    const ok = await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav({ registration: null }), NotificationImpl: b.FakeNotification, win: null });
    assert.equal(ok, true);
    assert.equal(b.made[0].instance.onclick, undefined);
  });

  test('서비스 워커가 아직 설치 중이면 생성자로 낸다', async () => {
    const { FakeNotification, made } = fakeNotification();
    const reg = fakeRegistration({ active: false });
    const ok = await deliverToDevice(ITEMS[0], { store: fakeStore(), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification });
    assert.equal(ok, true);
    assert.equal(reg.shown.length, 0);
    assert.equal(made.length, 1);
  });

  test('언어: 기기에 저장한 선택, 없으면 브라우저 언어 — ja 는 검수 전이라 영어 본문', async () => {
    const { FakeNotification, made } = fakeNotification();
    const store = { readPrefs: () => ({ notifications: true }), readLang: () => null };
    await deliverToDevice(ITEMS[0], { store, nav: fakeNav({ registration: undefined, language: 'ja-JP' }), NotificationImpl: FakeNotification });
    assert.equal(made[0].options.lang, 'en');
    assert.equal(made[0].options.body, 'Time to head back to your lodging by 12:00');
  });

  test('규칙 47 — 모든 예약 항목의 실제 알림 값에 병원·장소·복약 정보가 없다', async () => {
    const reg = fakeRegistration();
    const { FakeNotification } = fakeNotification();
    for (const lang of ['ko', 'en', 'ja', 'zh']) {
      for (const item of ITEMS) {
        await deliverToDevice(item, { store: fakeStore({ lang }), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification });
      }
    }
    assert.equal(reg.shown.length, ITEMS.length * 4);
    for (const { title, options } of reg.shown) {
      const blob = JSON.stringify({ title, options });
      for (const secret of ['서울미래성형외과', '카페', '테헤란로', 'appt-', '병원', 'hospital', '약', 'medic', 'MEDICATION', '복용']) {
        assert.ok(!blob.includes(secret), `${secret}: ${blob}`);
      }
    }
  });
});

describe('세션 유지 (createSessionUpkeep · attachSessionUpkeep)', () => {
  test('초점·보임은 1분에 한 번, 온라인 복귀는 바로 부른다', () => {
    let clock = 0;
    let calls = 0;
    const trigger = createSessionUpkeep({ refresh: () => (calls += 1), now: () => clock, lastRefreshAt: 0 });
    assert.equal(trigger('focus'), false, '셸이 방금 물었다');
    clock = 30_000;
    assert.equal(trigger('visible'), false);
    clock = 60_000;
    assert.equal(trigger('focus'), true);
    clock = 61_000;
    assert.equal(trigger('visible'), false);
    assert.equal(trigger('online'), true);
    assert.equal(calls, 2);
  });

  test('refresh 가 실패해도 던지지 않는다', async () => {
    const trigger = createSessionUpkeep({ refresh: () => Promise.reject(new Error('offline')) });
    assert.equal(trigger('focus'), true);
    const throwing = createSessionUpkeep({
      refresh: () => {
        throw new Error('x');
      },
    });
    assert.doesNotThrow(() => throwing('online'));
  });

  test('창 이벤트에 연결하고, 가려진 동안은 부르지 않으며, 해제하면 끊긴다', () => {
    const listeners = { win: new Map(), doc: new Map() };
    const add = (map) => (type, fn) => map.set(type, fn);
    const remove = (map) => (type) => map.delete(type);
    const doc = { visibilityState: 'visible', addEventListener: add(listeners.doc), removeEventListener: remove(listeners.doc) };
    const win = { document: doc, addEventListener: add(listeners.win), removeEventListener: remove(listeners.win) };
    const reasons = [];
    let visibleTicks = 0;
    const detach = attachSessionUpkeep(win, (r) => reasons.push(r), () => (visibleTicks += 1));

    listeners.win.get('focus')();
    listeners.doc.get('visibilitychange')();
    listeners.win.get('online')();
    doc.visibilityState = 'hidden';
    listeners.win.get('focus')();
    listeners.doc.get('visibilitychange')();
    assert.deepEqual(reasons, ['focus', 'visible', 'online']);
    assert.equal(visibleTicks, 1, '다시 보일 때 밀린 알림을 확인한다');

    detach();
    assert.equal(listeners.win.size + listeners.doc.size, 0);
  });
});

describe('서비스 워커 등록', () => {
  function fakeWindow(readyState) {
    const registered = [];
    const listeners = new Map();
    return {
      registered,
      listeners,
      document: { readyState },
      navigator: {
        serviceWorker: {
          register: async (url, options) => {
            registered.push({ url, options });
            return {};
          },
        },
      },
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };
  }

  test('load 뒤에 /sw.js 를 사이트 전체 범위로 등록한다', () => {
    const win = fakeWindow('loading');
    registerServiceWorker(win);
    assert.equal(win.registered.length, 0);
    win.listeners.get('load')();
    assert.deepEqual(win.registered, [{ url: '/sw.js', options: { scope: '/' } }]);
  });

  test('이미 로드됐으면 바로 등록한다', () => {
    const win = fakeWindow('complete');
    registerServiceWorker(win);
    assert.equal(win.registered.length, 1);
  });

  test('서비스 워커를 지원하지 않으면 아무것도 하지 않는다', () => {
    assert.doesNotThrow(() => registerServiceWorker({ navigator: {}, document: { readyState: 'complete' } })());
  });

  test('등록 실패는 조용히 넘긴다', async () => {
    const win = fakeWindow('complete');
    win.navigator.serviceWorker.register = async () => {
      throw new Error('SecurityError');
    };
    assert.doesNotThrow(() => registerServiceWorker(win));
    await new Promise((r) => setImmediate(r));
  });
});

describe('알림 누름 목적지 (notificationClickPath)', () => {
  test("허용 목록('/today', '/g')만 그대로, 그 밖은 /today", () => {
    assert.equal(notificationClickPath({ url: '/g' }), '/g');
    assert.equal(notificationClickPath({ url: '/today' }), '/today');
    for (const data of [undefined, null, {}, { url: 42 }, { url: '/settings' }, { url: 'https://evil.example/g' }, { url: '//evil' }, { url: '/g?x=1' }]) {
      assert.equal(notificationClickPath(data), '/today', JSON.stringify(data));
    }
  });
});
