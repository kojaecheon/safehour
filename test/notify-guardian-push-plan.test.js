// 보호자 구독 다시 맞추기와 상태 조회 시각 (lib/notify/guardianPushPlan.js · docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md
// 정한 값 8·14, Task 5)
//
// 이 파일이 고정하는 것
//   - 살아 있는 사본에 없는 watchId 의 구독은 끈다(retire). 기기 알림 스위치가 꺼졌거나 권한이 granted 가 아니면 모두 끈다
//   - 브라우저 구독의 endpoint 해시가 기록과 다르면(키는 같음) 다시 POST 한다. 언어가 바뀌어도 다시 POST 한다
//   - 설정의 VAPID 키가 기록과 다르거나, 기록이 있는데 브라우저 구독이 없으면 renewNeeded 이고 다시 POST 하지 않는다
//     (저절로 구독하지 않는다, 결정 19)
//   - 설정 키를 모르면(설정 꺼짐, 못 읽음) 끄기만 정하고 다시 POST·renewNeeded 를 정하지 않는다
//   - MOVED(상태의 active 거짓)인 구독은 언어·해시가 바뀌어도 다시 POST 하지 않고 renewNeeded 에서도 뺀다(끄기는 그대로)
//   - statusTimes 는 오늘 남은 마감마다 60초 전과 마감 + (유예 + 1)분이고, 지난 시각은 뺀다
//
// 순수 함수다. 시각은 +09:00 오프셋으로 만든다(시간대 무관).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS_BEFORE_MS,
  liveWatchIdsOf,
  movedWatchIdsOf,
  planReconcile,
  statusTimes,
  todayDeadlinesOf,
} from '../lib/notify/guardianPushPlan.js';
import { DEFAULTS } from '../src/stay/defaults.js';

const W1 = 'W000000000000000000001';
const W2 = 'W000000000000000000002';
const W3 = 'W000000000000000000003';
const KEY = `B${'k'.repeat(85)}A`;
const NEW_KEY = `B${'n'.repeat(85)}A`;
const HASH = 'h'.repeat(43);
const OTHER_HASH = 'o'.repeat(43);

const sub = (watchId, overrides = {}) => ({ watchId, subId: `S${watchId.slice(1)}`, lang: 'ko', endpointHash: HASH, vapidKey: KEY, ...overrides });
const recordOf = (subs, gone = []) => ({ subs, status: [], gone });
const base = (overrides = {}) => ({
  record: recordOf([sub(W1), sub(W2)]),
  liveWatchIds: [W1, W2],
  mainOn: true,
  permission: 'granted',
  browser: { endpointHash: HASH },
  configKey: KEY,
  lang: 'ko',
  ...overrides,
});

const kst = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+09:00`);

describe('planReconcile', () => {
  test('모든 것이 맞으면 할 일이 없다', () => {
    assert.deepEqual(planReconcile(base()), { retire: [], repost: [], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ record: null })), { retire: [], repost: [], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ record: recordOf([]), browser: null })), { retire: [], repost: [], renewNeeded: false });
  });

  test('endpoint 해시가 다르면 repost, VAPID 키가 다르면 renewNeeded 이고 repost 없음', () => {
    assert.deepEqual(planReconcile(base({ browser: { endpointHash: OTHER_HASH } })), { retire: [], repost: [W1, W2], renewNeeded: false });
    // 한 구독만 해시가 다르면 그것만
    assert.deepEqual(
      planReconcile(base({ record: recordOf([sub(W1), sub(W2, { endpointHash: OTHER_HASH })]) })),
      { retire: [], repost: [W2], renewNeeded: false },
    );
    // 설정의 키가 바뀌었다: 해시가 달라도 다시 POST 하지 않는다(옛 키의 브라우저 구독으로는 푸시가 닿지 않는다)
    assert.deepEqual(planReconcile(base({ configKey: NEW_KEY, browser: { endpointHash: OTHER_HASH } })), {
      retire: [],
      repost: [],
      renewNeeded: true,
    });
    // 한 구독만 옛 키여도 브라우저 구독은 기기에 하나라 다시 켜기다
    assert.deepEqual(planReconcile(base({ record: recordOf([sub(W1), sub(W2, { vapidKey: NEW_KEY })]) })), {
      retire: [],
      repost: [],
      renewNeeded: true,
    });
    // 브라우저 구독의 키를 읽을 수 있고 설정과 다르면 다시 켜기다
    assert.deepEqual(planReconcile(base({ browser: { endpointHash: OTHER_HASH, vapidKey: NEW_KEY } })), {
      retire: [],
      repost: [],
      renewNeeded: true,
    });
    assert.deepEqual(planReconcile(base({ browser: { endpointHash: OTHER_HASH, vapidKey: KEY } })), {
      retire: [],
      repost: [W1, W2],
      renewNeeded: false,
    });
  });

  test('구독 기록이 있는데 브라우저 구독이 없으면 renewNeeded', () => {
    assert.deepEqual(planReconcile(base({ browser: null })), { retire: [], repost: [], renewNeeded: true });
  });

  test('살아 있는 사본에 없는 watchId 는 retire', () => {
    assert.deepEqual(planReconcile(base({ liveWatchIds: [W2] })), { retire: [W1], repost: [], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ liveWatchIds: new Set([W1]) })), { retire: [W2], repost: [], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ liveWatchIds: [] })), { retire: [W1, W2], repost: [], renewNeeded: false });
    // 남은 구독만으로 다시 맞춘다: 끄는 구독은 다시 POST 하지 않고, 남은 구독이 없으면 다시 켜기도 아니다
    assert.deepEqual(planReconcile(base({ liveWatchIds: [W2], browser: { endpointHash: OTHER_HASH } })), {
      retire: [W1],
      repost: [W2],
      renewNeeded: false,
    });
    assert.deepEqual(planReconcile(base({ liveWatchIds: [W3], browser: null })), { retire: [W1, W2], repost: [], renewNeeded: false });
  });

  test('기기 알림 스위치가 꺼졌거나 권한이 granted 가 아니면 전부 retire', () => {
    const all = { retire: [W1, W2], repost: [], renewNeeded: false };
    assert.deepEqual(planReconcile(base({ mainOn: false })), all);
    for (const permission of ['default', 'denied', null, undefined]) {
      assert.deepEqual(planReconcile(base({ permission, browser: null, configKey: NEW_KEY })), all);
    }
  });

  test('언어가 다르면 repost', () => {
    assert.deepEqual(planReconcile(base({ lang: 'en' })), { retire: [], repost: [W1, W2], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ record: recordOf([sub(W1, { lang: 'ja' }), sub(W2)]) })), {
      retire: [],
      repost: [W1],
      renewNeeded: false,
    });
    // 모르는 언어로는 다시 POST 하지 않는다
    assert.deepEqual(planReconcile(base({ lang: 'fr' })), { retire: [], repost: [], renewNeeded: false });
  });

  test('설정 키를 모르면(꺼짐, 못 읽음) 끄기만 정한다', () => {
    assert.deepEqual(planReconcile(base({ configKey: null, browser: { endpointHash: OTHER_HASH }, lang: 'en' })), {
      retire: [],
      repost: [],
      renewNeeded: false,
    });
    assert.deepEqual(planReconcile(base({ configKey: null, browser: null, liveWatchIds: [W1] })), {
      retire: [W2],
      repost: [],
      renewNeeded: false,
    });
  });

  test('moved 이면 언어·해시가 바뀌어도 다시 POST 하지 않는다', () => {
    const movedStatus = (watchId) => ({ watchId, date: '2026-10-02', confirmed: [], muted: false, active: false, atMs: 0 });
    const record = { subs: [sub(W1, { lang: 'en', endpointHash: OTHER_HASH }), sub(W2, { lang: 'en' })], status: [movedStatus(W1)], gone: [] };
    assert.deepEqual(planReconcile(base({ record })), { retire: [], repost: [W2], renewNeeded: false });
    assert.deepEqual(movedWatchIdsOf(record), new Set([W1]));
    // moved 만 남으면 키가 바뀌었거나 브라우저 구독이 없어도 다시 켜기를 띄우지 않는다(다시 켜기가 moved 를 건너뛴다)
    const onlyMoved = { subs: [sub(W1)], status: [movedStatus(W1)], gone: [] };
    assert.deepEqual(planReconcile(base({ record: onlyMoved, configKey: NEW_KEY })), { retire: [], repost: [], renewNeeded: false });
    assert.deepEqual(planReconcile(base({ record: onlyMoved, browser: null })), { retire: [], repost: [], renewNeeded: false });
    // 상태가 활성(참)이거나 모름(null)이면 그대로 다시 POST 한다
    for (const active of [true, null]) {
      const settled = { ...record, status: [{ ...movedStatus(W1), active }] };
      assert.deepEqual(planReconcile(base({ record: settled })), { retire: [], repost: [W1, W2], renewNeeded: false }, String(active));
    }
    // moved 라도 사본에 없거나 스위치가 꺼지면 끈다
    assert.deepEqual(planReconcile(base({ record: onlyMoved, liveWatchIds: [] })).retire, [W1]);
    assert.deepEqual(planReconcile(base({ record: onlyMoved, mainOn: false })).retire, [W1]);
  });

  test('gone 에 든 watchId 는 다시 POST 하지 않는다', () => {
    assert.deepEqual(planReconcile(base({ record: recordOf([sub(W1), sub(W2)], [W2]), browser: { endpointHash: OTHER_HASH } })), {
      retire: [],
      repost: [W1],
      renewNeeded: false,
    });
  });
});

describe('statusTimes', () => {
  const DATE = '2026-10-02';
  const grace = DEFAULTS.notifications.serverPushGraceMin;

  test('statusTimes 는 남은 마감마다 60초 전과 마감 + 11분, 지난 시각은 뺀다', () => {
    assert.equal(grace, 10);
    assert.equal(STATUS_BEFORE_MS, 60_000);
    const nowMs = kst(DATE, '12:00');
    assert.deepEqual(statusTimes({ deadlines: ['18:00', '14:30'], date: DATE, nowMs, graceMin: grace }), [
      kst(DATE, '14:29'),
      kst(DATE, '14:41'),
      kst(DATE, '17:59'),
      kst(DATE, '18:11'),
    ]);
    // 14:35: 14:30 마감은 60초 전이 지났고 + 11분은 남았다
    assert.deepEqual(statusTimes({ deadlines: ['14:30', '18:00'], date: DATE, nowMs: kst(DATE, '14:35'), graceMin: grace }), [
      kst(DATE, '14:41'),
      kst(DATE, '17:59'),
      kst(DATE, '18:11'),
    ]);
    // 지금과 같은 시각은 지난 것으로 본다
    assert.deepEqual(statusTimes({ deadlines: ['14:30'], date: DATE, nowMs: kst(DATE, '14:41'), graceMin: grace }), []);
    // 23:55 마감의 + 11분은 다음 날 00:06 이다(그 날짜의 마감이라 그대로 둔다)
    assert.deepEqual(statusTimes({ deadlines: ['23:55'], date: DATE, nowMs: kst(DATE, '23:56'), graceMin: grace }), [
      Date.parse('2026-10-03T00:06:00+09:00'),
    ]);
  });

  test('statusTimes 는 틀린 시각을 버리고 겹치는 시각은 하나다', () => {
    const nowMs = kst(DATE, '12:00');
    assert.deepEqual(statusTimes({ deadlines: ['14:30', '14:30', '25:00', null, 'x'], date: DATE, nowMs, graceMin: grace }), [
      kst(DATE, '14:29'),
      kst(DATE, '14:41'),
    ]);
    assert.deepEqual(statusTimes({ deadlines: null, date: DATE, nowMs, graceMin: grace }), []);
    assert.deepEqual(statusTimes({ deadlines: ['14:30'], date: 'nope', nowMs, graceMin: grace }), []);
    assert.deepEqual(statusTimes({ deadlines: ['14:30'], date: DATE, nowMs: Number.NaN, graceMin: grace }), []);
    // 유예가 숫자가 아니면 기본값을 쓴다
    assert.deepEqual(statusTimes({ deadlines: ['14:30'], date: DATE, nowMs }), [kst(DATE, '14:29'), kst(DATE, '14:41')]);
  });
});

describe('겹침 입력', () => {
  const copy = (watchId, days = []) => ({ id: `c-${watchId}`, snapshot: { days, ...(watchId ? { watchId } : {}) } });

  test('liveWatchIdsOf 는 형식에 맞는 watchId 만 겹치지 않게 모은다', () => {
    assert.deepEqual(liveWatchIdsOf([copy(W1), copy(W2), copy(W1), copy(null), copy('short'), null, { snapshot: null }]), [W1, W2]);
    assert.deepEqual(liveWatchIdsOf(null), []);
  });

  test('todayDeadlinesOf 는 그 날짜 환자 복귀 마감 시각만 뽑는다', () => {
    const days = [
      { date: '2026-10-02', patientReturn: [{ by: '18:00', placeName: '숙소' }, { by: 'x' }, { by: '14:30' }] },
      { date: '2026-10-03', patientReturn: [{ by: '12:00' }] },
    ];
    assert.deepEqual(todayDeadlinesOf(copy(W1, days), '2026-10-02'), ['18:00', '14:30']);
    assert.deepEqual(todayDeadlinesOf(copy(W1, days), '2026-10-04'), []);
    assert.deepEqual(todayDeadlinesOf(null, '2026-10-02'), []);
  });
});
