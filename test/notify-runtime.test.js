// 알림 실행기 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md)
//
// 앱이 열려 있는 동안 오늘 일정에서 예약을 만들고, 때가 되면 기기 알림(주입)과 앱 안 배너를 낸다.
//   - 예약은 저장소의 알림 예약(writeNotificationSchedule)에 남긴다. 보기 전용이면 남기지 못해도 알린다.
//   - 늦게 깨어나 여러 알림이 한꺼번에 밀렸으면 가장 최근 것 하나만 낸다. 목표 시각이 지난 알림은 내지 않는다.
//   - 일정이 바뀌면 다시 만들고, 날짜가 바뀌면 새 날짜의 일정으로 다시 만든다.
// 시각·타이머·저장소는 모두 주입한다.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { deliverToDevice } from '../lib/notify/device.js';
import { createNotifier } from '../lib/notify/runtime.js';
import { NOTIFY_KIND, planNotifications } from '../lib/notify/schedule.js';
import { createMemoryStorage, createStore } from '../lib/store/index.js';

const DATE = '2026-09-20';
const NEXT = '2026-09-21';
const kst = (time, date = DATE) => Date.parse(`${date}T${time}:00+09:00`);
const iso = (time, date = DATE) => new Date(kst(time, date)).toISOString();
const ACCOUNT = 'acct_0123456789abcdefXYZ';
const MIN = 60_000;

function plan(date, { returnBy = '18:00', departAt = '15:00', medication = [] } = {}) {
  return {
    date,
    coverage: 'RESTRICTED',
    dayState: 'TOGETHER',
    reasons: [],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'l1',
    transportMode: 'TAXI',
    effective: medication.length ? { medication: { value: { kind: 'SET', value: medication }, provenance: [] } } : {},
    blocks: [],
    outings: [
      {
        id: `${date}:P:outing-1`,
        departAt,
        returnBy,
        returnPlace: 'LODGING',
        deadlineReason: 'RETURN_TIME',
        latestDepartureAt: '17:10',
        slackMin: 10,
        walkTotalMin: 5,
        travelTotalMin: 20,
        plannedReturnAt: '17:40',
        stops: [],
      },
    ],
    guardianOutings: [],
    mealSlots: [],
    excluded: [],
    warnings: [],
    returnNow: false,
  };
}

/** 가짜 타이머 — 예약된 콜백을 직접 돌린다 */
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn, delay) {
      seq += 1;
      pending.set(seq, { fn, delay });
      return seq;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    /** 가장 최근 타이머의 지연 */
    lastDelay() {
      return [...pending.values()].at(-1)?.delay ?? null;
    },
    runAll() {
      const list = [...pending.entries()];
      pending.clear();
      for (const [, { fn }] of list) fn();
    },
  };
}

let clock;
let store;
let timers;
let delivered;
let notifier;

function setup({ plans = { [DATE]: plan(DATE) }, session = true } = {}) {
  clock = kst('06:00');
  store = createStore({ storage: createMemoryStorage(), now: () => clock, timers: null });
  if (session) {
    store.setSession({ authenticated: true, accountKey: ACCOUNT, expiresAt: new Date(clock + 48 * 60 * MIN).toISOString() });
    assert.equal(store.writeTripPlan({ engineVersion: 't', generatedAt: iso('05:00'), lang: 'ko', days: plans }).ok, true);
  }
  timers = fakeTimers();
  delivered = [];
  notifier = createNotifier({
    store,
    now: () => clock,
    timers,
    deliver: (item) => {
      delivered.push(item);
    },
  });
}

afterEach(() => notifier?.stop());

// 마감 지남(RETURN_PASSED)은 Task 3 이 따로 다룬다. 이 파일의 기존 단언은 60·30분 전 알림을 본다
const returnItems = (items) => items.filter((i) => i.kind === NOTIFY_KIND.RETURN);

describe('예약 만들기와 저장', () => {
  beforeEach(() => setup());

  test('시작하면 오늘 일정으로 예약을 만들고 저장소 알림 예약에 남긴다', () => {
    notifier.start();
    const items = notifier.getItems();
    assert.deepEqual(
      returnItems(items).map((i) => i.at),
      [iso('17:00'), iso('17:30')],
    );
    assert.deepEqual(store.readNotificationSchedule(), items);
  });

  test('같은 예약이면 다시 쓰지 않는다 (불필요한 저장·알림 없음)', () => {
    notifier.start();
    let writes = 0;
    const off = store.subscribe('notificationSchedule', () => {
      writes += 1;
    });
    notifier.refresh();
    notifier.refresh();
    off();
    assert.equal(writes, 0);
  });

  test('다음 알림까지 기다리되 한 번에 최대 1분만 기다린다 (백그라운드 타이머 지연 대비)', () => {
    notifier.start();
    assert.equal(timers.lastDelay(), MIN);
    clock = kst('16:59') + 30_000;
    notifier.refresh();
    assert.equal(timers.lastDelay(), 30_000);
  });

  test('일정이 바뀌면 예약을 다시 만든다', () => {
    notifier.start();
    store.writeTripPlan({ engineVersion: 't', generatedAt: iso('06:00'), lang: 'ko', days: { [DATE]: plan(DATE, { returnBy: '19:00', departAt: '16:00' }) } });
    assert.deepEqual(
      returnItems(notifier.getItems()).map((i) => i.at),
      [iso('18:00'), iso('18:30')],
    );
    assert.deepEqual(store.readNotificationSchedule(), notifier.getItems());
  });

  test('오늘 일정이 없으면 예약이 비고 알림도 없다', () => {
    setup({ plans: { [NEXT]: plan(NEXT) } });
    notifier.start();
    assert.deepEqual(notifier.getItems(), []);
    clock = kst('17:00');
    notifier.tick();
    assert.deepEqual(delivered, []);
  });
});

describe('알림 내기', () => {
  beforeEach(() => setup());

  test('때가 되면 기기 알림과 앱 안 배너를 낸다 — 한 번만', () => {
    notifier.start();
    let changes = 0;
    notifier.subscribe(() => {
      changes += 1;
    });
    clock = kst('16:59');
    timers.runAll();
    assert.deepEqual(delivered, []);
    assert.equal(notifier.getBanner(), null);

    clock = kst('17:00');
    timers.runAll();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].at, iso('17:00'));
    assert.equal(delivered[0].kind, NOTIFY_KIND.RETURN);
    assert.equal(notifier.getBanner()?.id, delivered[0].id);
    assert.ok(changes >= 1);

    notifier.tick();
    notifier.refresh();
    assert.equal(delivered.length, 1, '같은 알림을 다시 내지 않는다');
  });

  test('늦게 깨어나 밀린 알림이 여럿이면 가장 최근 것 하나만 낸다', () => {
    notifier.start();
    clock = kst('17:40');
    notifier.tick();
    assert.deepEqual(
      delivered.map((i) => i.at),
      [iso('17:30')],
    );
    clock = kst('17:41');
    notifier.tick();
    assert.equal(delivered.length, 1);
  });

  test('목표 시각이 지난 알림은 내지 않는다', () => {
    notifier.start();
    clock = kst('18:05');
    notifier.tick();
    assert.deepEqual(returnItems(delivered), []);
    assert.notEqual(notifier.getBanner()?.kind, NOTIFY_KIND.RETURN);
    // 마감 지남 알림은 마감(18:00) 뒤 60분 안이므로 늦게라도 한 번 낸다
    const passed = delivered.filter((i) => i.kind === NOTIFY_KIND.RETURN_PASSED);
    assert.equal(passed.length, 1);
    assert.equal(notifier.getBanner()?.id, passed[0].id);
    notifier.tick();
    notifier.refresh();
    assert.equal(delivered.filter((i) => i.kind === NOTIFY_KIND.RETURN_PASSED).length, 1);
  });

  test('배너는 닫을 수 있고, 목표 시각이 지나면 스스로 사라진다', () => {
    notifier.start();
    clock = kst('17:00');
    notifier.tick();
    assert.ok(notifier.getBanner());
    notifier.dismiss();
    assert.equal(notifier.getBanner(), null);

    clock = kst('17:30');
    notifier.tick();
    assert.equal(notifier.getBanner()?.at, iso('17:30'));
    clock = kst('18:00');
    notifier.tick();
    assert.notEqual(notifier.getBanner()?.kind, NOTIFY_KIND.RETURN);
  });

  test('기기 알림이 실패해도 배너와 다음 예약은 계속된다', () => {
    setup();
    const failing = createNotifier({
      store,
      now: () => clock,
      timers,
      deliver: () => {
        throw new Error('no permission');
      },
    });
    failing.start();
    clock = kst('17:00');
    assert.doesNotThrow(() => failing.tick());
    assert.equal(failing.getBanner()?.at, iso('17:00'));
    assert.ok(timers.pending.size >= 1);
    failing.stop();
  });

  test('보기 전용(오프라인)이어도 이 기기의 마지막 계정 사본으로 알린다 — 저장은 못 해도 된다', () => {
    store.setOnline(false);
    assert.equal(store.getStatus().readOnly, true);
    notifier.start();
    assert.equal(returnItems(notifier.getItems()).length, 2);
    clock = kst('17:30');
    notifier.tick();
    assert.equal(delivered.length, 1);
  });

  test('날짜가 바뀌면 새 날짜의 일정으로 다시 만든다', () => {
    setup({ plans: { [DATE]: plan(DATE), [NEXT]: plan(NEXT, { medication: [{ time: '09:00', atLodging: true }] }) } });
    notifier.start();
    clock = kst('00:05', NEXT);
    notifier.tick();
    assert.deepEqual(
      notifier.getItems().filter((i) => i.kind !== NOTIFY_KIND.RETURN_PASSED).map((i) => i.at),
      [iso('08:50', NEXT), iso('17:00', NEXT), iso('17:30', NEXT)],
    );
    clock = kst('08:50', NEXT);
    notifier.tick();
    assert.equal(delivered.at(-1).kind, NOTIFY_KIND.AT_LODGING);
  });

  test('멈추면 타이머와 구독을 정리한다', () => {
    notifier.start();
    notifier.stop();
    assert.equal(timers.pending.size, 0);
    store.writeTripPlan({ engineVersion: 't', generatedAt: iso('06:00'), lang: 'ko', days: { [DATE]: plan(DATE, { returnBy: '20:00', departAt: '16:00' }) } });
    assert.deepEqual(
      returnItems(notifier.getItems()).map((i) => i.at),
      [iso('17:00'), iso('17:30')],
      '멈춘 뒤에는 다시 만들지 않는다',
    );
  });

  test('start 는 여러 번 불러도 한 번만 시작한다', () => {
    notifier.start();
    notifier.start();
    assert.equal(timers.pending.size, 1);
  });
});

// ── 보호자 사본과 이미 낸 마감 지남 알림 ─────────────────────────────

const COMPANION = NOTIFY_KIND.COMPANION_RETURN_PASSED;
const companionItems = (items) => items.filter((i) => i.kind === COMPANION);

function copyOf(days, importedAt, expiresAt = iso('23:00', '2026-09-30')) {
  return { snapshot: { days }, importedAt, expiresAt };
}
const day = (date, ...bys) => ({ date, patientReturn: bys.map((by) => ({ by, placeName: '숙소', placeAddress: null })) });

/** 환자 일정 없이 보호자 사본만 있는 기기 */
function setupGuardian(copies) {
  setup({ plans: { [NEXT]: plan(NEXT) } });
  for (const [id, copy] of Object.entries(copies)) assert.equal(store.writeGuardianCopy(id, copy).ok, true);
}

describe('보호자 사본 마감 알림', () => {
  test('가장 최근에 가져온 사본의 오늘 마감만 예약한다', () => {
    setupGuardian({
      old: copyOf([day(DATE, '15:00')], iso('05:00')),
      latest: copyOf([day(DATE, '17:00'), day(NEXT, '12:00')], iso('05:30')),
    });
    notifier.start();
    assert.deepEqual(
      companionItems(notifier.getItems()).map((i) => i.at),
      [iso('17:00')],
    );
  });

  test('최신 사본이 만료되어 사라지면 예약도 없다', () => {
    setupGuardian({ latest: copyOf([day(DATE, '17:00')], iso('05:30'), iso('07:00')) });
    notifier.start();
    assert.equal(companionItems(notifier.getItems()).length, 1);
    clock = kst('07:00');
    notifier.refresh();
    assert.deepEqual(companionItems(notifier.getItems()), []);
  });

  test('KST 가 아닌 시간대에서도 KST 날짜의 사본 하루만 쓴다', () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      setupGuardian({ latest: copyOf([day(DATE, '17:00'), day(NEXT, '12:00')], iso('05:30')) });
      clock = Date.parse('2026-09-20T15:30:00Z'); // KST 2026-09-21 00:30
      notifier.start();
      assert.deepEqual(
        companionItems(notifier.getItems()).map((i) => i.at),
        [iso('12:00', NEXT)],
      );
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  test('마감 뒤 60분 안에 시작하면 한 번 내고 기억한다', () => {
    setupGuardian({ latest: copyOf([day(DATE, '17:00')], iso('05:30')) });
    const marks = [];
    const wrapped = {
      ...store,
      markOverdueNotified: (date, id) => {
        marks.push([date, id]);
        return store.markOverdueNotified(date, id);
      },
    };
    notifier = createNotifier({ store: wrapped, now: () => clock, timers, deliver: (item) => delivered.push(item) });
    clock = kst('17:20');
    notifier.start();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].kind, COMPANION);
    assert.equal(notifier.getBanner()?.id, delivered[0].id);
    assert.deepEqual(marks, [[DATE, delivered[0].id]]);
    assert.deepEqual(store.readOverdueSeen(DATE).notified, [delivered[0].id]);
    notifier.stop();

    const again = createNotifier({ store, now: () => clock, timers, deliver: (item) => delivered.push(item) });
    again.start();
    assert.equal(delivered.length, 1, '다시 열어도 이미 낸 알림은 내지 않는다');
    assert.deepEqual(companionItems(again.getItems()), []);
    again.stop();
  });

  test('마감 지남 알림이 한꺼번에 밀리면 하나만 내고, 밀린 것까지 모두 기억한다', () => {
    setupGuardian({ latest: copyOf([day(DATE, '17:00', '17:10')], iso('05:30')) });
    clock = kst('17:20');
    notifier.start();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].at, iso('17:10'));
    const ids = companionItems(
      planNotifications(null, { nowMs: clock, companionDay: day(DATE, '17:00', '17:10') }),
    ).map((i) => i.id);
    assert.equal(ids.length, 2);
    assert.deepEqual([...store.readOverdueSeen(DATE).notified].sort(), [...ids].sort());
    notifier.stop();

    const again = createNotifier({ store, now: () => clock, timers, deliver: (item) => delivered.push(item) });
    again.start();
    assert.equal(delivered.length, 1, '다시 열어도 밀렸던 앞 알림이 늦게 나오지 않는다');
    again.stop();
  });

  test('마감 뒤 60분이 지났으면 내지 않는다', () => {
    setupGuardian({ latest: copyOf([day(DATE, '17:00')], iso('05:30')) });
    clock = kst('18:01');
    notifier.start();
    assert.deepEqual(delivered, []);
  });

  test('기억 쓰기가 실패해도 같은 실행 안에서는 한 번만 낸다', () => {
    setupGuardian({ latest: copyOf([day(DATE, '17:00')], iso('05:30')) });
    notifier = createNotifier({
      store: { ...store, markOverdueNotified: () => ({ ok: false }) },
      now: () => clock,
      timers,
      deliver: (item) => delivered.push(item),
    });
    clock = kst('17:05');
    notifier.start();
    notifier.tick();
    notifier.refresh();
    clock = kst('17:10');
    notifier.tick();
    notifier.refresh();
    assert.equal(delivered.length, 1);
  });

  test('guardianCopies 가 바뀌면 다시 예약한다', () => {
    setupGuardian({});
    notifier.start();
    assert.deepEqual(companionItems(notifier.getItems()), []);
    assert.equal(store.writeGuardianCopy('latest', copyOf([day(DATE, '17:00')], iso('05:30'))).ok, true);
    assert.deepEqual(
      companionItems(notifier.getItems()).map((i) => i.at),
      [iso('17:00')],
    );
  });
});

// ── 서버 푸시와 같은 마감 (결정 15 그대로, 계획 A-3 다르게 정한 것 17) ─────────────────────────────

describe('서버 푸시와 겹치는 마감의 기기 알림', () => {
  const TAG_1800 = `sh-watch-${DATE}-18:00`;

  /**
   * 실행기에 실제 deliverToDevice 를 물린다. 알림 칸(shade)은 브라우저처럼 tag 하나에 알림 하나다:
   * 같은 tag 로 내면 갈아 끼운다. displayed 는 처음부터 떠 있는 알림이고, serverPush 는 서버 푸시가 도착한 것을 흉내 낸다
   */
  function deviceDeliver(displayed = []) {
    const shade = new Map(displayed.map((n) => [n.tag, n.from ?? 'server']));
    const shown = [];
    const asked = [];
    const pending = [];
    const options = [];
    const registration = {
      active: { state: 'activated' },
      getNotifications: async ({ tag } = {}) => {
        asked.push(tag);
        return shade.has(tag) ? [{ tag }] : [];
      },
      showNotification: async (title, opts) => {
        shown.push({ title, options: opts });
        shade.set(opts.tag, 'device');
      },
    };
    function NoConstructor() {
      throw new Error('서비스 워커 경로에서는 생성자를 부르지 않는다');
    }
    NoConstructor.permission = 'granted';
    const env = {
      store: { readPrefs: () => ({ notifications: true }), readLang: () => 'ko' },
      nav: { language: 'ko', serviceWorker: { getRegistration: async () => registration } },
      NotificationImpl: NoConstructor,
      win: null,
    };
    // 실행기가 넘긴 옵션(sharedWatchTag)을 그대로 deliverToDevice 에 준다(lib/notify/client.js 와 같다)
    const deliver = (item, opts) => {
      delivered.push(item);
      options.push(opts);
      const result = deliverToDevice(item, { ...env, ...opts });
      pending.push(result);
      return result;
    };
    return {
      deliver,
      shade,
      shown,
      asked,
      options,
      settle: () => Promise.all(pending),
      serverPush: (tag, from) => shade.set(tag, from),
    };
  }

  /** watchId 를 주면 스냅샷 끝에 붙는다(src/guardian/snapshot.js) */
  function copyWith(days, importedAt, watchId = null) {
    const copy = copyOf(days, importedAt);
    return watchId ? { ...copy, snapshot: { ...copy.snapshot, watchId } } : copy;
  }
  const W_A = 'A'.repeat(22);
  const W_B = 'B'.repeat(22);
  const label = (a, b) => `A=${a ? 'W_A' : '없음'} B=${b ? 'W_B' : '없음'}`;

  test('서버 푸시를 누른 뒤 18:15에 앱을 열면 늦은 기기 알림을 낸다(결정 15)', async () => {
    setupGuardian({ latest: copyOf([day(DATE, '18:00')], iso('05:30')) });
    // 18:10 에 온 서버 푸시를 보호자가 눌러 알림 칸에서 닫혔다
    const device = deviceDeliver([]);
    notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
    clock = kst('18:15');
    notifier.start();
    assert.deepEqual(await device.settle(), [true]);
    assert.deepEqual(device.options, [{ sharedWatchTag: true }]);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].kind, COMPANION);
    assert.equal(device.shown.length, 1);
    assert.equal(device.shown[0].options.tag, TAG_1800, '서버 푸시와 같은 tag 라 알림 칸에는 한 줄이다');
    assert.deepEqual(device.shown[0].options.data, { url: '/g' });
    assert.equal(notifier.getBanner()?.id, delivered[0].id);
  });

  test('서버 푸시가 알림 칸에 떠 있는 채 18:15에 앱을 열면 다시 울리지 않고, 배너와 기억은 그대로다', async () => {
    setupGuardian({ latest: copyOf([day(DATE, '18:00')], iso('05:30')) });
    const device = deviceDeliver([{ tag: TAG_1800 }]);
    notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
    clock = kst('18:15');
    notifier.start();
    assert.deepEqual(await device.settle(), [false]);
    assert.deepEqual(device.options, [{ sharedWatchTag: true }], '사본이 하나면 서버 푸시와 같은 tag 를 쓴다');
    assert.deepEqual(device.asked, [TAG_1800]);
    assert.equal(device.shown.length, 0);
    assert.equal(delivered.length, 1, '실행기는 그대로 내려 했다(예약은 바뀌지 않는다)');
    assert.equal(notifier.getBanner()?.id, delivered[0].id, '앱 안 배너는 그대로 보인다');
    assert.deepEqual(store.readOverdueSeen(DATE).notified, [delivered[0].id]);
  });

  test('앱이 열린 채 18:00에 낸 기기 알림은 다른 환자의 18:10 마감 지남, 18:20 복귀 확인 푸시와 서로 갈아 끼우지 않는다', async () => {
    for (const [watchA, watchB] of [
      [W_A, W_B],
      [null, W_B],
    ]) {
      // 가장 최근 사본 A 가 기기 알림을 만든다. 옛 사본 B 의 환자는 서버 푸시를 받는다
      setupGuardian({
        a: copyWith([day(DATE, '18:00')], iso('05:30'), watchA),
        b: copyWith([day(DATE, '18:00')], iso('05:00'), watchB),
      });
      const device = deviceDeliver([]);
      notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
      clock = kst('17:59');
      notifier.start();
      clock = kst('18:00');
      notifier.tick();
      assert.deepEqual(await device.settle(), [true], label(watchA, watchB));
      assert.deepEqual(device.options, [{ sharedWatchTag: false }], label(watchA, watchB));
      assert.deepEqual(device.asked, [], `${label(watchA, watchB)}: 예약 id tag 로 내니 떠 있는지 묻지 않는다`);
      assert.equal(device.shown[0].options.tag, delivered[0].id, label(watchA, watchB));
      // B 의 서버 푸시가 같은 마감 tag 로 오고, B 가 '돌아왔어요'를 눌러 확인 푸시로 갈아 끼운다
      device.serverPush(TAG_1800, 'B 마감 지남');
      device.serverPush(TAG_1800, 'B 복귀 확인');
      assert.deepEqual(
        [...device.shade.entries()],
        [
          [delivered[0].id, 'device'],
          [TAG_1800, 'B 복귀 확인'],
        ],
        `${label(watchA, watchB)}: A 의 마감 지남이 알림 칸에 남는다. 'B 복귀 확인'이 A 의 알림 자리에 들어가지 않는다`,
      );
      notifier.stop();
    }
  });

  test('같은 환자의 사본뿐이면 18:00 기기 알림을 그 환자의 18:10 서버 푸시가 갈아 끼워 알림 칸에 한 줄이다', async () => {
    for (const [watchA, watchB] of [
      [W_A, null],
      [W_A, W_A],
      [null, null],
    ]) {
      setupGuardian({
        a: copyWith([day(DATE, '18:00')], iso('05:30'), watchA),
        b: copyWith([day(DATE, '18:00')], iso('05:00'), watchB),
      });
      const device = deviceDeliver([]);
      notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
      clock = kst('17:59');
      notifier.start();
      clock = kst('18:00');
      notifier.tick();
      assert.deepEqual(await device.settle(), [true], label(watchA, watchB));
      assert.deepEqual(device.options, [{ sharedWatchTag: true }], label(watchA, watchB));
      assert.equal(device.shown[0].options.tag, TAG_1800, label(watchA, watchB));
      device.serverPush(TAG_1800, 'A 마감 지남');
      assert.deepEqual([...device.shade.entries()], [[TAG_1800, 'A 마감 지남']], label(watchA, watchB));
      notifier.stop();
    }
  });

  test('다른 환자 사본에 같은 마감이 있으면 그 환자의 푸시가 떠 있어도 18:15 늦은 기기 알림을 예약 id tag 로 낸다', async () => {
    for (const [watchA, watchB] of [
      [W_A, W_B],
      [null, W_B],
    ]) {
      setupGuardian({
        a: copyWith([day(DATE, '18:00')], iso('05:30'), watchA),
        b: copyWith([day(DATE, '18:00')], iso('05:00'), watchB),
      });
      // 18:10 에 온 B 의 마감 지남 푸시를, B 가 '돌아왔어요'를 눌러 온 확인 푸시가 같은 tag 로 갈아 끼웠다
      const device = deviceDeliver([{ tag: TAG_1800, from: 'B 복귀 확인' }]);
      notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
      clock = kst('18:15');
      notifier.start();
      assert.deepEqual(await device.settle(), [true], label(watchA, watchB));
      assert.deepEqual(device.options, [{ sharedWatchTag: false }], label(watchA, watchB));
      assert.deepEqual(device.asked, [], label(watchA, watchB));
      assert.equal(delivered.length, 1, label(watchA, watchB));
      assert.equal(delivered[0].kind, COMPANION, label(watchA, watchB));
      assert.equal(device.shown.length, 1, label(watchA, watchB));
      assert.equal(device.shown[0].options.tag, delivered[0].id, label(watchA, watchB));
      assert.deepEqual(device.shown[0].options.data, { url: '/g' }, label(watchA, watchB));
      assert.equal(device.shade.get(TAG_1800), 'B 복귀 확인', `${label(watchA, watchB)}: B 의 '복귀 확인'을 갈아 끼우지 않는다`);
      notifier.stop();
    }
  });

  test('사본이 둘이어도 마감 시각이 다르거나, 같은 환자(같은 watchId)이거나, 다른 사본에 watchId 가 없으면 지금처럼 건너뛴다', async () => {
    for (const [name, a, b] of [
      ['다른 시각', copyWith([day(DATE, '18:00')], iso('05:30'), W_A), copyWith([day(DATE, '17:00')], iso('05:00'), W_B)],
      ['같은 watchId', copyWith([day(DATE, '18:00')], iso('05:30'), W_A), copyWith([day(DATE, '18:00')], iso('05:00'), W_A)],
      ['옛 사본에 watchId 없음', copyWith([day(DATE, '18:00')], iso('05:30'), W_A), copyWith([day(DATE, '18:00')], iso('05:00'))],
      ['둘 다 watchId 없음', copyWith([day(DATE, '18:00')], iso('05:30')), copyWith([day(DATE, '18:00')], iso('05:00'))],
    ]) {
      setupGuardian({ a, b });
      const device = deviceDeliver([{ tag: TAG_1800 }]);
      notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
      clock = kst('18:15');
      notifier.start();
      assert.deepEqual(await device.settle(), [false], name);
      assert.deepEqual(device.options, [{ sharedWatchTag: true }], name);
      assert.deepEqual(device.asked, [TAG_1800], name);
      assert.equal(device.shown.length, 0, name);
      assert.equal(notifier.getBanner()?.id, delivered[0].id, `${name}: 앱 안 배너는 그대로 보인다`);
      notifier.stop();
    }
  });

  test('낼 때 가장 최근 사본이 바뀌어도 예약을 만든 사본의 watchId 로 tag 를 고른다', async () => {
    // 18:00:30 에 새 사본 B 를 가져오면 refresh 가 다시 만들기 전에 A 로 만든 18:00 알림을 먼저 낸다
    for (const [watchA, watchB, shared] of [
      [null, W_B, false], // 출처 A 는 watchId 없음, 새 사본 B 는 다른 환자일 수 있다
      [W_A, null, true], // 출처 A 는 W_A, 새 사본 B 는 푸시를 보낼 수 없다
    ]) {
      setupGuardian({ a: copyWith([day(DATE, '18:00')], iso('05:30'), watchA) });
      const device = deviceDeliver([]);
      notifier = createNotifier({ store, now: () => clock, timers, deliver: device.deliver });
      clock = kst('17:59');
      notifier.start();
      clock = kst('18:00') + 30_000;
      assert.equal(store.writeGuardianCopy('b', copyWith([day(DATE, '18:00')], iso('18:00'), watchB)).ok, true);
      assert.equal(store.readGuardianCopies()[0].id, 'b', '낼 때의 가장 최근 사본은 B 다');
      assert.deepEqual(await device.settle(), [true], label(watchA, watchB));
      assert.deepEqual(device.options, [{ sharedWatchTag: shared }], label(watchA, watchB));
      assert.equal(device.shown[0].options.tag, shared ? TAG_1800 : delivered[0].id, label(watchA, watchB));
      assert.equal(delivered.length, 1, `${label(watchA, watchB)}: B 로 다시 만든 같은 마감은 다시 내지 않는다`);
      notifier.stop();
    }
  });

  test('낼 때 사본 읽기가 던지면 보호자 마감 지남은 예약 id tag 로 내고, 환자 알림은 사본을 읽지 않는다', async () => {
    let failing = false;
    let reads = 0;
    const flaky = (base) => ({
      ...base,
      readGuardianCopies: () => {
        reads += 1;
        if (failing) throw new Error('읽기 실패');
        return base.readGuardianCopies();
      },
    });

    setupGuardian({ a: copyWith([day(DATE, '18:00')], iso('05:30'), W_A) });
    const guardian = deviceDeliver([{ tag: TAG_1800 }]);
    notifier = createNotifier({ store: flaky(store), now: () => clock, timers, deliver: guardian.deliver });
    clock = kst('17:59');
    notifier.start();
    failing = true;
    clock = kst('18:00');
    notifier.tick();
    assert.deepEqual(await guardian.settle(), [true]);
    assert.deepEqual(guardian.options, [{ sharedWatchTag: false }]);
    assert.deepEqual(guardian.asked, []);
    assert.equal(guardian.shown[0].options.tag, delivered[0].id);
    assert.equal(notifier.getBanner()?.id, delivered[0].id);
    notifier.stop();

    // 환자 기기: 복귀 마감 60·30분 전과 마감 지남 모두 사본을 읽지 않고 낸다
    setup();
    failing = false;
    const patient = deviceDeliver([]);
    notifier = createNotifier({ store: flaky(store), now: () => clock, timers, deliver: patient.deliver });
    notifier.start();
    failing = true;
    reads = 0;
    for (const time of ['17:00', '17:30', '18:00']) {
      clock = kst(time);
      notifier.tick();
    }
    assert.deepEqual(await patient.settle(), [true, true, true]);
    assert.deepEqual(
      delivered.map((i) => i.kind),
      [NOTIFY_KIND.RETURN, NOTIFY_KIND.RETURN, NOTIFY_KIND.RETURN_PASSED],
    );
    assert.deepEqual(patient.options, [{ sharedWatchTag: false }, { sharedWatchTag: false }, { sharedWatchTag: false }]);
    assert.equal(reads, 0, '환자 알림을 낼 때는 사본을 읽지 않는다');
    assert.deepEqual(
      patient.shown.map((s) => s.options.tag),
      delivered.map((i) => i.id),
    );
  });

  test('예약 결과는 guardianPush 기록과 무관하게 지금과 같다', () => {
    const WATCH = 'w'.repeat(22);
    // 활성 구독, 두 마감 모두 '복귀 확인', 오늘 함께 있음까지 켠 기록
    const record = {
      subs: [{ watchId: WATCH, subId: 's'.repeat(22), lang: 'ko', endpointHash: 'h'.repeat(43), vapidKey: 'B'.repeat(87) }],
      status: [{ watchId: WATCH, date: DATE, confirmed: ['17:00', '18:00'], muted: true, active: true, atMs: kst('16:00') }],
      gone: [],
    };
    const run = (withRecord) => {
      setupGuardian({ latest: copyOf([day(DATE, '17:00', '18:00')], iso('05:30')) });
      const base = store;
      const runStore = withRecord ? { ...base, readGuardianPush: () => record } : base;
      notifier = createNotifier({ store: runStore, now: () => clock, timers, deliver: (item) => delivered.push(item) });
      const trace = [];
      for (const time of ['06:00', '17:00', '17:30', '18:15', '19:30']) {
        clock = kst(time);
        if (time === '06:00') notifier.start();
        else notifier.tick();
        trace.push({ time, items: notifier.getItems(), banner: notifier.getBanner()?.id ?? null });
      }
      notifier.stop();
      return { trace, delivered: [...delivered], seen: base.readOverdueSeen(DATE).notified, saved: base.readNotificationSchedule() };
    };
    const plain = run(false);
    const withPush = run(true);
    assert.deepEqual(withPush, plain);
    // 비교가 빈 결과끼리가 아니다: 두 마감 모두 기기 알림이 나갔다
    assert.deepEqual(
      plain.delivered.map((i) => [i.kind, i.time]),
      [
        [COMPANION, '17:00'],
        [COMPANION, '18:00'],
      ],
    );
  });
});
