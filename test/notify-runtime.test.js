// 알림 실행기 (AX-319 · spec 4.13)
//
// 앱이 열려 있는 동안 오늘 일정에서 예약을 만들고, 때가 되면 기기 알림(주입)과 앱 안 배너를 낸다.
//   - 예약은 저장소의 알림 예약(writeNotificationSchedule)에 남긴다. 보기 전용이면 남기지 못해도 알린다.
//   - 늦게 깨어나 여러 알림이 한꺼번에 밀렸으면 가장 최근 것 하나만 낸다. 목표 시각이 지난 알림은 내지 않는다.
//   - 일정이 바뀌면 다시 만들고, 날짜가 바뀌면 새 날짜의 일정으로 다시 만든다.
// 시각·타이머·저장소는 모두 주입한다.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createNotifier } from '../lib/notify/runtime.js';
import { NOTIFY_KIND } from '../lib/notify/schedule.js';
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
