// 기기 알림 한 장·세션 유지·서비스 워커 등록 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md, docs/platform/IA_AND_FLOWS.md '보기 전용 상태'. 테스트 이름의 규칙 번호(47)는 옛 설계서 번호다)
//
//   - 설정에서 켰고 권한이 이미 '허용'일 때만 기기 알림을 낸다. 권한을 요청하지 않는다(설정 화면 몫).
//   - 서비스 워커가 있으면 showNotification, 없으면 생성자. 알림에 실리는 값은 허용 목록뿐이다(docs/business-rules.md '알림과 카드').
//   - 세션 유지: 초점·보임은 1분에 한 번, 온라인 복귀는 바로 refreshSession.
//   - 서비스 워커는 사이트 전체 범위로 load 뒤에 등록한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import {
  deliverToDevice,
  mayShareWatchTag,
  NOTIFICATION_CLICK_PATHS,
  notificationClickPath,
  notificationOpenUrl,
  notificationTagOf,
  TAG_CHECK_TIMEOUT_MS,
  watchNotificationTag,
} from '../lib/notify/device.js';
import { NOTIFY_KIND, planNotifications } from '../lib/notify/schedule.js';
import { PUSH_KIND, pushPayload } from '../lib/server/watch/text.js';
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

function fakeRegistration({ active = true, displayed = null } = {}) {
  const shown = [];
  const asked = [];
  const registration = {
    shown,
    asked,
    active: active ? { state: 'activated' } : null,
    showNotification: async (title, options) => {
      shown.push({ title, options });
    },
  };
  // displayed 를 주면 알림 칸에 떠 있는 알림을 흉내 낸다. 브라우저처럼 tag 로 거른다
  if (displayed) {
    registration.getNotifications = async (filter = {}) => {
      asked.push(filter);
      return displayed.filter((n) => !filter.tag || n.tag === filter.tag);
    };
  }
  return registration;
}

/** 가짜 타이머: 걸린 것과 지운 것을 남기고, runAll 로 직접 돌린다 */
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  const cleared = [];
  return {
    pending,
    cleared,
    setTimeout(fn, delay) {
      seq += 1;
      pending.set(seq, { fn, delay });
      return seq;
    },
    clearTimeout(id) {
      cleared.push(id);
      pending.delete(id);
    },
    runAll() {
      const list = [...pending.values()];
      pending.clear();
      for (const { fn } of list) fn();
    },
  };
}

/** 지금 쌓인 마이크로태스크를 모두 돌린다 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

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

  test('이미 그 화면(/g)에 있으면 생성자 알림을 눌러도 다시 불러오지 않고 창만 앞으로 가져온다', async () => {
    const guardian = planNotifications(null, {
      nowMs: kst('06:00'),
      companionDay: { date: DATE, patientReturn: [{ by: '12:00' }] },
    })[0];
    const { FakeNotification, made } = fakeNotification();
    const calls = [];
    const win = {
      location: { origin: 'https://safehour.example', pathname: '/g', assign: (href) => calls.push(['assign', href]) },
      focus: () => calls.push(['focus']),
    };
    await deliverToDevice(guardian, { store: fakeStore(), nav: fakeNav({ registration: null }), NotificationImpl: FakeNotification, win });
    made[0].instance.close = () => calls.push(['close']);
    made[0].instance.onclick();
    assert.deepEqual(calls, [['focus'], ['close']]);
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

describe('알림 칸의 tag: 서버 푸시와 한 줄 (계획 A-3 다르게 정한 것 17, R4)', () => {
  /** 보호자 사본 하루의 마감들로 만든 예약 항목 (시계는 고정 epoch) */
  const companionItems = (nowTime, ...bys) =>
    planNotifications(null, { nowMs: kst(nowTime), companionDay: { date: DATE, patientReturn: bys.map((by) => ({ by })) } });
  const TAG_1800 = `sh-watch-${DATE}-18:00`;

  test('notificationTagOf: 보호자 마감 지남은 sh-watch-<날짜>-<HH:MM>, 23:55 마감은 그날 날짜, 다른 종류는 item.id', () => {
    const prevTz = process.env.TZ;
    try {
      // 00:30 KST 는 UTC 로 전날, 23:55 KST 는 UTC+14 지역 시각으로 다음 날이다: 어느 쪽으로도 날짜가 밀리지 않아야 한다
      for (const tz of ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        const items = companionItems('00:00', '00:30', '18:00', '23:55');
        assert.deepEqual(
          items.map(notificationTagOf),
          [`sh-watch-${DATE}-00:30`, TAG_1800, `sh-watch-${DATE}-23:55`],
          tz,
        );
      }
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
    // 환자 기기의 알림(마감 지남 포함)은 예약 id 그대로다
    assert.ok(ITEMS.length >= 4);
    for (const item of ITEMS) assert.equal(notificationTagOf(item), item.id, item.kind);
    // 시각을 읽을 수 없는 보호자 항목은 예약 id 로 둔다(던지지 않는다)
    const [item] = companionItems('06:00', '18:00');
    for (const broken of [{ ...item, at: 'not-a-date' }, { ...item, at: undefined }, { ...item, time: '25:00' }]) {
      assert.equal(notificationTagOf(broken), item.id);
    }
  });

  test('watchNotificationTag 는 서버 pushPayload 의 tag 와 같다', () => {
    for (const [date, time] of [
      [DATE, '18:00'],
      [DATE, '23:55'],
      ['2026-12-31', '00:05'],
    ]) {
      for (const kind of [PUSH_KIND.OVERDUE, PUSH_KIND.CONFIRMED]) {
        for (const lang of ['ko', 'en', 'ja', 'zh']) {
          const serverTag = JSON.parse(pushPayload(kind, { date, time, lang })).tag;
          assert.equal(watchNotificationTag(date, time), serverTag, `${kind} ${date} ${time} ${lang}`);
        }
      }
    }
    // 예약 항목에서 만든 tag 도 같은 마감의 서버 tag 와 같다
    const [item] = companionItems('06:00', '18:00');
    assert.equal(notificationTagOf(item), JSON.parse(pushPayload(PUSH_KIND.OVERDUE, { date: DATE, time: '18:00', lang: 'ko' })).tag);
  });

  /** 서버 푸시와 같은 tag 를 쓰도록 실행기가 정한 경우(sharedWatchTag)의 기기 알림 환경 */
  const sharedEnv = (registration, NotificationImpl) => ({
    store: fakeStore(),
    nav: fakeNav({ registration }),
    NotificationImpl,
    sharedWatchTag: true,
  });

  test('같은 tag 알림이 떠 있으면 기기 알림을 내지 않는다(서비스 워커 경로)', async () => {
    const [item] = companionItems('06:00', '18:00');
    // 18:10 에 온 서버 푸시가 알림 칸에 떠 있다
    const reg = fakeRegistration({ displayed: [{ tag: TAG_1800 }] });
    const { FakeNotification, made } = fakeNotification();
    const ok = await deliverToDevice(item, sharedEnv(reg, FakeNotification));
    assert.equal(ok, false);
    assert.deepEqual(reg.asked, [{ tag: TAG_1800 }]);
    assert.equal(reg.shown.length, 0, '보던 알림을 덮어 다시 울리지 않는다');
    assert.equal(made.length, 0, '생성자로도 내지 않는다');

    // 다른 마감과 기기 바뀜 알림만 떠 있으면 낸다
    const other = fakeRegistration({ displayed: [{ tag: `sh-watch-${DATE}-17:00` }, { tag: 'sh-watch-device' }] });
    const b = fakeNotification();
    assert.equal(await deliverToDevice(item, sharedEnv(other, b.FakeNotification)), true);
    assert.equal(other.shown.length, 1);
    assert.equal(other.shown[0].options.tag, TAG_1800);
    assert.deepEqual(other.shown[0].options.data, { url: '/g' });
    assert.equal(b.made.length, 0);
  });

  test('getNotifications 가 던지면 지금처럼 낸다', async () => {
    const [item] = companionItems('06:00', '18:00');
    const variants = {
      rejects: async () => {
        throw new Error('InvalidStateError');
      },
      throws: () => {
        throw new TypeError('not a function');
      },
      notArray: async () => undefined,
      missing: undefined,
    };
    for (const [name, getNotifications] of Object.entries(variants)) {
      const reg = fakeRegistration();
      if (getNotifications) reg.getNotifications = getNotifications;
      const { FakeNotification, made } = fakeNotification();
      const ok = await deliverToDevice(item, sharedEnv(reg, FakeNotification));
      assert.equal(ok, true, name);
      assert.equal(reg.shown.length, 1, name);
      assert.equal(reg.shown[0].options.tag, TAG_1800, name);
      assert.equal(made.length, 0, `${name}: 서비스 워커로 냈으니 생성자는 부르지 않는다`);
    }
  });

  test('getNotifications 가 tag 로 거르지 않고 다른 마감을 돌려줘도 정확히 같은 tag 만 떠 있는 것으로 본다', async () => {
    const [item] = companionItems('06:00', '18:00');
    const reg = fakeRegistration();
    const asked = [];
    reg.getNotifications = async (filter) => {
      asked.push(filter);
      return [{ tag: `sh-watch-${DATE}-17:00` }, { tag: 'sh-watch-device' }, { tag: `${TAG_1800}x` }];
    };
    const { FakeNotification } = fakeNotification();
    assert.equal(await deliverToDevice(item, sharedEnv(reg, FakeNotification)), true);
    assert.deepEqual(asked, [{ tag: TAG_1800 }]);
    assert.equal(reg.shown.length, 1);
    assert.equal(reg.shown[0].options.tag, TAG_1800);
  });

  test('환자 알림은 sharedWatchTag 와 무관하게 예약 id tag 로 내고, 그 tag 가 떠 있을 때만 내지 않는다', async () => {
    // 환자 알림의 tag 는 예약 id 라 같은 tag 는 같은 알림(같은 날·종류·시각·시점)뿐이다. 내지 않아도 알림 칸의 내용은 같다
    const item = ITEMS.find((i) => i.kind === NOTIFY_KIND.RETURN);
    assert.ok(item);
    for (const sharedWatchTag of [undefined, false, true]) {
      const env = (registration) => ({
        store: fakeStore(),
        nav: fakeNav({ registration }),
        NotificationImpl: fakeNotification().FakeNotification,
        sharedWatchTag,
      });
      const same = fakeRegistration({ displayed: [{ tag: item.id }] });
      assert.equal(await deliverToDevice(item, env(same)), false, String(sharedWatchTag));
      assert.deepEqual(same.asked, [{ tag: item.id }], String(sharedWatchTag));
      assert.equal(same.shown.length, 0, String(sharedWatchTag));
      // 다른 예약 id 나 같은 시각의 지켜보기 tag 가 떠 있으면 낸다
      const others = ITEMS.filter((i) => i.id !== item.id).map((i) => ({ tag: i.id }));
      const other = fakeRegistration({ displayed: [...others, { tag: watchNotificationTag(DATE, item.time) }] });
      assert.equal(await deliverToDevice(item, env(other)), true, String(sharedWatchTag));
      assert.equal(other.shown.length, 1, String(sharedWatchTag));
      assert.equal(other.shown[0].options.tag, item.id, String(sharedWatchTag));
    }
  });

  test('sharedWatchTag 를 넘기지 않거나 거짓이면 보호자 마감 지남을 예약 id tag 로 내고 떠 있는지 묻지 않는다', async () => {
    const [item] = companionItems('06:00', '18:00');
    assert.notEqual(item.id, TAG_1800);
    for (const sharedWatchTag of [undefined, false, 'yes', 1]) {
      // 다른 환자의 서버 푸시(같은 마감 tag)와 이 알림의 예약 id tag 가 모두 떠 있어도 낸다
      const reg = fakeRegistration({ displayed: [{ tag: TAG_1800 }, { tag: item.id }] });
      const { FakeNotification, made } = fakeNotification();
      const env = { store: fakeStore(), nav: fakeNav({ registration: reg }), NotificationImpl: FakeNotification };
      if (sharedWatchTag !== undefined) env.sharedWatchTag = sharedWatchTag;
      assert.equal(await deliverToDevice(item, env), true, String(sharedWatchTag));
      assert.deepEqual(reg.asked, [], String(sharedWatchTag));
      assert.equal(reg.shown.length, 1, String(sharedWatchTag));
      assert.equal(reg.shown[0].options.tag, item.id, `${sharedWatchTag}: 서버 푸시의 tag 를 갈아 끼우지 않는다`);
      assert.deepEqual(reg.shown[0].options.data, { url: '/g' }, String(sharedWatchTag));
      assert.equal(made.length, 0, String(sharedWatchTag));
    }
    // 서비스 워커가 없어 생성자로 낼 때도 같은 tag 를 쓴다
    const a = fakeNotification();
    assert.equal(await deliverToDevice(item, { store: fakeStore(), nav: fakeNav({ registration: null }), NotificationImpl: a.FakeNotification }), true);
    assert.equal(a.made[0].options.tag, item.id);
    const b = fakeNotification();
    assert.equal(await deliverToDevice(item, sharedEnv(null, b.FakeNotification)), true);
    assert.equal(b.made[0].options.tag, TAG_1800);
  });

  test('getNotifications 가 시간 한도 안에 답하지 않으면 떠 있지 않은 것으로 보고 내고, 타이머는 어느 쪽이든 지운다', async () => {
    assert.equal(TAG_CHECK_TIMEOUT_MS, 1000);
    const [item] = companionItems('06:00', '18:00');
    const env = (registration, timers) => ({ ...sharedEnv(registration, fakeNotification().FakeNotification), timers });

    // 끝나지 않는 답: 한도까지 기다렸다가 낸다
    const timers = fakeTimers();
    const stuck = fakeRegistration();
    stuck.getNotifications = () => new Promise(() => {});
    const result = deliverToDevice(item, env(stuck, timers));
    await flush();
    assert.deepEqual(
      [...timers.pending.values()].map((t) => t.delay),
      [TAG_CHECK_TIMEOUT_MS],
    );
    assert.equal(stuck.shown.length, 0, '한도 전에는 내지 않고 기다린다');
    timers.runAll();
    assert.equal(await result, true);
    assert.equal(stuck.shown.length, 1);
    assert.equal(stuck.shown[0].options.tag, TAG_1800);

    // 한도 안에 답하거나 던지면 타이머를 지운다
    const answers = [
      ['떠 있음', async () => [{ tag: TAG_1800 }], false],
      ['없음', async () => [], true],
      ['거절', async () => Promise.reject(new Error('InvalidStateError')), true],
    ];
    for (const [name, getNotifications, expected] of answers) {
      const t = fakeTimers();
      const reg = fakeRegistration();
      reg.getNotifications = getNotifications;
      assert.equal(await deliverToDevice(item, env(reg, t)), expected, name);
      assert.equal(t.pending.size, 0, name);
      assert.equal(t.cleared.length, 1, name);
    }
  });

  test('mayShareWatchTag: 예약을 만든 사본과 다른 watchId 의 사본에 같은 날짜·시각 마감이 있을 때만 공유 tag 를 쓰지 않는다', () => {
    const [item] = companionItems('06:00', '18:00');
    const W_A = 'A'.repeat(22);
    const W_B = 'B'.repeat(22);
    const copy = (bys, watchId = null, date = DATE) => ({
      snapshot: { days: [{ date, patientReturn: bys.map((by) => ({ by })) }], ...(watchId ? { watchId } : {}) },
    });
    // 검토 요청의 네 경우 (copies 는 readGuardianCopies 처럼 가장 최근 사본, 곧 출처가 앞이다)
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['18:00'])], W_A), true, '출처 W_A, 다른 사본 watchId 없음');
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['18:00'], W_B)], W_A), false, '출처 W_A, 다른 사본 W_B');
    assert.equal(mayShareWatchTag(item, [copy(['18:00']), copy(['18:00'], W_B)], null), false, '출처 watchId 없음, 다른 사본 W_B');
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['18:00'], W_A)], W_A), true, '두 사본 모두 W_A');
    // 순서와 무관하다: 판단은 출처 watchId 로 하지 사본 순서로 하지 않는다
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_B), copy(['18:00'], W_A)], W_A), false);
    assert.equal(mayShareWatchTag(item, [copy(['18:00']), copy(['18:00'], W_A)], W_A), true);
    // 출처 사본만 있거나 사본이 없으면(출처가 지워졌어도) 공유 tag 를 쓴다
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A)], W_A), true);
    assert.equal(mayShareWatchTag(item, [copy(['18:00'])], null), true);
    assert.equal(mayShareWatchTag(item, [copy(['18:00']), copy(['18:00'])], null), true, 'watchId 없는 사본은 푸시를 보낼 수 없다');
    assert.equal(mayShareWatchTag(item, [], W_A), true);
    assert.equal(mayShareWatchTag(item, undefined), true);
    // 출처 watchId 를 주지 않으면 watchId 를 가진 모든 사본이 다른 환자다
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A)]), false);
    for (const empty of [undefined, null, '', 0]) {
      assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A)], empty), false, String(empty));
    }
    // 다른 환자 사본의 마감이 다른 시각이거나 다른 날짜면 공유 tag 를 쓴다
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['17:00', '18:30'], W_B)], W_A), true);
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['18:00'], W_B, '2026-09-21')], W_A), true);
    // 다른 환자 사본이 여러 마감 가운데 하나만 같아도 공유 tag 를 쓰지 않는다
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['12:00', '18:00'], W_B)], W_A), false);
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), copy(['18:00'], W_A), copy(['18:00'], W_B)], W_A), false);
    // 모양이 깨진 사본은 마감이 없는 것으로 본다(던지지 않는다). 날짜가 문자열이 아니면 문자열로 바뀌어 같아 보여도 세지 않는다
    const broken = [
      null,
      {},
      { snapshot: null },
      { snapshot: { days: 'x', watchId: W_B } },
      { snapshot: { days: [{ date: [DATE], patientReturn: [{ by: '18:00' }] }], watchId: W_B } },
      { snapshot: { days: [{ date: { toString: () => DATE }, patientReturn: [{ by: '18:00' }] }], watchId: W_B } },
      { snapshot: { days: [null, { date: DATE }, { date: DATE, patientReturn: [null, { by: '25:00' }, { by: 1800 }] }], watchId: W_B } },
      { snapshot: { days: [{ date: DATE, patientReturn: [{ by: '18:00' }] }], watchId: 42 } },
      { snapshot: { days: [{ date: DATE, patientReturn: [{ by: '18:00' }] }], watchId: '' } },
    ];
    assert.equal(mayShareWatchTag(item, [copy(['18:00'], W_A), ...broken], W_A), true);
    // 공유 tag 가 없는 항목(환자 알림, 시각을 읽을 수 없는 보호자 항목)은 거짓이다
    const onlySource = [copy(['12:00', '18:00'], W_A)];
    for (const patientItem of ITEMS) assert.equal(mayShareWatchTag(patientItem, onlySource, W_A), false, patientItem.kind);
    assert.equal(mayShareWatchTag({ ...item, at: 'not-a-date' }, onlySource, W_A), false);
    assert.equal(mayShareWatchTag(null, onlySource, W_A), false);
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

  test('public/sw.js 의 NOTIFICATION_PATHS 와 같은 목록이다', () => {
    const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    const match = source.match(/const NOTIFICATION_PATHS = (\[[^\]]*\])/);
    assert.ok(match, 'public/sw.js 에서 NOTIFICATION_PATHS 를 찾지 못했다');
    const swPaths = JSON.parse(match[1].replace(/'/g, '"'));
    assert.deepEqual(swPaths, [...NOTIFICATION_CLICK_PATHS], '두 목록(public/sw.js, lib/notify/device.js)은 함께 바꿔야 한다');
  });
});
