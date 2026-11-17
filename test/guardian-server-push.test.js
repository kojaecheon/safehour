// 보호자 링크 동의 화면의 서버 알림 선택 항목 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 8, D6·D12·D14)
//
// 화면(components/guardian/GuardianCreate.js)이 쓰는 순수 규칙(components/guardian/serverPush.js)과 문구를 고정한다.
//   - 항목은 스위치가 켜져 있고 출국일이 오늘 이후일 때만 보인다(꺼져 있으면 화면은 예전과 같다)
//   - 처음 체크 상태는 ON 일 때만 켜짐(다르게 정한 것 20), REPLACED 는 꺼짐에서 시작해 체크하면 다시 등록한다
//   - 체크를 끄고 만들면 있는 지켜보기를 끄고, 항목이 숨어 있으면 건드리지 않는다
//   - 등록 실패는 링크를 막지 않고 이유별 결과 줄 하나를 보인다
//   - 끄기 실패는 링크를 막지 않고 끄지 못했다는 줄을, 서버 삭제가 남으면 알림이 갈 수 있다는 줄을 보인다(작업 7 검토 반영).
//     모두 껐으면 껐다는 줄을 보인다(화면 검토 M10)
//   - 링크 만들기 순서(submitWithServerPush, 화면 검토 M9): 등록이 스냅샷보다 먼저이고 등록한 id 를 싣는다. 숨은 항목은 켜진
//     지켜보기의 id 만 싣고 요청하지 않는다. 끄기 실패·등록 실패는 링크를 막지 않는다(id 없음). 비우기는 링크를 만든 뒤에 건다
//   - 기다리는 동안 계정이 바뀌면 공유 기록을 쓰지 않고 던진다(A-2 마지막 검토, 앞 계정의 사본이 바뀐 계정의 저장소에 쓰이지 않게)
//   - 첫 기다림 전에 읽은 계정 키를 켜기·끄기에 넘긴다. 줄 선 일이 시작될 때 계정이 바뀌었으면 바뀐 계정의 지켜보기를 켜거나
//     끄지 않는다(A-3 검토, 실제 저장소와 실행기로 확인)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVER_PUSH_ACTION,
  SERVER_PUSH_CONSENT_KEYS,
  SUBMIT_ACCOUNT_CHANGED,
  applyServerPush,
  serverPushInitialChecked,
  serverPushOptionVisible,
  serverPushResultKeys,
  serverPushRetireKeys,
  serverPushSubmitPlan,
  submitWithServerPush,
} from '../components/guardian/serverPush.js';
import { createMemoryStorage, createStore } from '../lib/store/index.js';
import { createWatchSync } from '../lib/trip/watchSync.js';
import { WATCH_KIND, WATCH_PATHS } from '../src/guardian/watchRequests.js';
import { messages as guardianMessages, safety as guardianSafety } from '../src/i18n/messages/guardian.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';
import { makeDayPlan, patientOuting } from './guardian-fixtures.js';
import { makeStay } from './stay-fixtures.js';

const WATCH_ID = 'AAAAAAAAAAAAAAAAAAAAAA';

const NEW_KEYS = [
  'guardian.serverPushTitle',
  'guardian.serverPushCheck',
  'guardian.serverPushIntro',
  ...SERVER_PUSH_CONSENT_KEYS,
  'guardian.serverPushOn',
  'guardian.serverPushNotOn',
  'guardian.serverPushLogin',
  'guardian.serverPushLimit',
  'guardian.serverPushOffNow',
  'guardian.serverPushUnavailable',
];

describe('서버 알림 항목을 보이는 조건', () => {
  test('항목은 스위치가 켜져 있고 출국일이 오늘 이후일 때만 보인다', () => {
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-20', today: '2026-11-20' }), true);
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-25', today: '2026-11-20' }), true);
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-19', today: '2026-11-20' }), false);
    assert.equal(serverPushOptionVisible({ enabled: false, departureDate: '2026-11-25', today: '2026-11-20' }), false);
  });

  test('스위치를 아직 읽지 못했거나(enabled 가 true 가 아님) 날짜가 틀리면 숨는다', () => {
    assert.equal(serverPushOptionVisible({ enabled: undefined, departureDate: '2026-11-25', today: '2026-11-20' }), false);
    assert.equal(serverPushOptionVisible({ enabled: 'true', departureDate: '2026-11-25', today: '2026-11-20' }), false);
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: null, today: '2026-11-20' }), false);
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-25', today: null }), false);
    assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-2-1', today: '2026-11-20' }), false);
    assert.equal(serverPushOptionVisible(), false);
  });
});

describe('처음 체크 상태 (다르게 정한 것 20)', () => {
  test('처음 체크 상태는 ON 일 때만 켜짐이다', () => {
    assert.equal(serverPushInitialChecked('ON'), true);
    assert.equal(serverPushInitialChecked('REPLACED'), false);
    assert.equal(serverPushInitialChecked('NONE'), false);
    assert.equal(serverPushInitialChecked(null), false);
    assert.equal(serverPushInitialChecked(undefined), false);
  });
});

describe('링크를 만들 때 지켜보기에 할 일', () => {
  test('항목이 보이고 체크가 켜져 있으면 등록한다(ON·REPLACED·없음 모두, 실을 id 는 등록 결과에서 온다)', () => {
    for (const state of ['ON', 'REPLACED', 'NONE']) {
      const watchId = state === 'ON' ? WATCH_ID : null;
      assert.deepEqual(serverPushSubmitPlan({ visible: true, checked: true, state, watchId }), {
        action: SERVER_PUSH_ACTION.REGISTER,
        watchId: null,
      });
    }
  });

  test('항목이 보이고 체크가 꺼져 있으면 있는 지켜보기(ON·REPLACED)를 끄고, 없으면 그대로 둔다. 어느 쪽도 id 를 싣지 않는다', () => {
    assert.deepEqual(serverPushSubmitPlan({ visible: true, checked: false, state: 'ON', watchId: WATCH_ID }), {
      action: SERVER_PUSH_ACTION.RETIRE,
      watchId: null,
    });
    assert.deepEqual(serverPushSubmitPlan({ visible: true, checked: false, state: 'REPLACED', watchId: null }), {
      action: SERVER_PUSH_ACTION.RETIRE,
      watchId: null,
    });
    assert.deepEqual(serverPushSubmitPlan({ visible: true, checked: false, state: 'NONE', watchId: null }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: null,
    });
  });

  test('항목이 숨어 있으면 건드리지 않고, 켜진 지켜보기의 id 만 그대로 싣는다', () => {
    assert.deepEqual(serverPushSubmitPlan({ visible: false, checked: true, state: 'ON', watchId: WATCH_ID }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: WATCH_ID,
    });
    assert.deepEqual(serverPushSubmitPlan({ visible: false, checked: false, state: 'ON', watchId: WATCH_ID }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: WATCH_ID,
    });
    assert.deepEqual(serverPushSubmitPlan({ visible: false, checked: false, state: 'REPLACED', watchId: null }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: null,
    });
    assert.deepEqual(serverPushSubmitPlan({ visible: false, checked: false, state: 'NONE', watchId: null }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: null,
    });
  });

  test('스위치가 꺼진 기기(지켜보기 없음)에서는 아무것도 하지 않고 id 도 싣지 않는다', () => {
    assert.deepEqual(serverPushSubmitPlan({ visible: false, checked: false, state: 'NONE', watchId: null }), {
      action: SERVER_PUSH_ACTION.KEEP,
      watchId: null,
    });
  });
});

describe('링크를 만든 뒤 결과 줄', () => {
  test('결과 줄: 성공, 이유별 실패, 체크하지 않음', () => {
    assert.deepEqual(serverPushResultKeys(null), []);
    assert.deepEqual(serverPushResultKeys(undefined), []);
    assert.deepEqual(serverPushResultKeys({ ok: true }), ['guardian.serverPushOn']);
    assert.deepEqual(serverPushResultKeys({ ok: false, reason: 'LOGIN_REQUIRED' }), ['guardian.serverPushNotOn', 'guardian.serverPushLogin']);
    assert.deepEqual(serverPushResultKeys({ ok: false, reason: 'RATE_LIMITED' }), ['guardian.serverPushNotOn', 'guardian.serverPushLimit']);
    assert.deepEqual(serverPushResultKeys({ ok: false, reason: 'OFF' }), ['guardian.serverPushNotOn', 'guardian.serverPushOffNow']);
    assert.deepEqual(serverPushResultKeys({ ok: false, reason: 'UNAVAILABLE' }), ['guardian.serverPushNotOn', 'guardian.serverPushUnavailable']);
  });

  test('모르는 이유는 UNAVAILABLE 줄이다', () => {
    assert.deepEqual(serverPushResultKeys({ ok: false, reason: 'NETWORK' }), ['guardian.serverPushNotOn', 'guardian.serverPushUnavailable']);
    assert.deepEqual(serverPushResultKeys({ ok: false }), ['guardian.serverPushNotOn', 'guardian.serverPushUnavailable']);
  });

  // 예전에는 다 지웠으면 줄이 없었다. 체크를 끈 뒤 아무 줄도 없어 결과를 알 수 없었다(화면 검토 M10)
  test('끄기 결과 줄: 다 지웠으면 껐다는 줄, 서버 삭제가 남으면 알림이 갈 수 있다는 줄, 끄지 못했으면 그 줄(꺼졌다고 쓰지 않는다)', () => {
    assert.deepEqual(serverPushRetireKeys(null), []);
    assert.deepEqual(serverPushRetireKeys(undefined), []);
    assert.deepEqual(serverPushRetireKeys({ ok: true, pending: false }), ['guardian.serverPushTurnedOff']);
    assert.deepEqual(serverPushRetireKeys({ ok: true, pending: true }), ['guardian.serverPushTurnOffPending']);
    assert.deepEqual(serverPushRetireKeys({ ok: false, reason: 'LOGIN_REQUIRED' }), ['guardian.serverPushTurnOffFailed']);
    assert.deepEqual(serverPushRetireKeys({ ok: false, reason: 'UNAVAILABLE' }), ['guardian.serverPushTurnOffFailed']);
    assert.deepEqual(serverPushRetireKeys({ ok: false }), ['guardian.serverPushTurnOffFailed']);
  });

  test('모양이 틀린 끄기 결과는 끄지 못한 것으로 본다', () => {
    assert.deepEqual(serverPushRetireKeys({}), ['guardian.serverPushTurnOffFailed']);
    assert.deepEqual(serverPushRetireKeys({ ok: true }), ['guardian.serverPushTurnOffFailed']);
    assert.deepEqual(serverPushRetireKeys('done'), ['guardian.serverPushTurnOffFailed']);
  });
});

describe('링크 만들기 순서 (submitWithServerPush, 화면 검토 M9)', () => {
  const STAY = Object.freeze({ departure: { date: '2026-11-25' } });

  /** 가짜 실행기: 부른 순서를 log 에 남긴다. 결과는 바꿔 끼운다 */
  function fakeSync({ register = () => ({ ok: true, watchId: WATCH_ID }), retire = () => ({ ok: true, pending: false }) } = {}) {
    const log = [];
    return {
      log,
      ensureRegistered: async (input) => {
        log.push(['ensureRegistered', input]);
        return register();
      },
      retire: async () => {
        log.push(['retire']);
        return retire();
      },
      kick: (reason) => {
        log.push(['kick', reason]);
        return Promise.resolve();
      },
    };
  }

  function linkMaker(log) {
    return async (watchId) => {
      log.push(['makeLink', watchId]);
      return { link: 'L', watchId };
    };
  }

  test('등록이 스냅샷보다 먼저이고 등록한 id 를 싣는다. 비우기는 링크를 만든 뒤에 건다', async () => {
    for (const state of ['ON', 'REPLACED', 'NONE']) {
      const sync = fakeSync();
      const made = await submitWithServerPush({
        option: { visible: true, checked: true, state, watchId: state === 'ON' ? 'OLD_ID_IS_NOT_USED_HERE' : null },
        stay: STAY,
        sync,
        makeLink: linkMaker(sync.log),
      });
      assert.deepEqual(sync.log, [['ensureRegistered', { stay: STAY }], ['makeLink', WATCH_ID], ['kick', 'register']], state);
      // saved 는 공유 기록 결과다(saveLink 를 넘기지 않으면 null, 계정 확인과 함께 더했다)
      assert.deepEqual(made, { link: { link: 'L', watchId: WATCH_ID }, saved: null, serverPush: { ok: true }, serverPushRetire: null });
    }
  });

  test('숨은 항목은 요청하지 않고, 켜진(ON) 지켜보기면 그 id 를, 아니면 null 을 싣는다', async () => {
    for (const [state, watchId, expected] of [
      ['ON', WATCH_ID, WATCH_ID],
      ['REPLACED', null, null],
      ['NONE', null, null],
    ]) {
      for (const checked of [true, false]) {
        const sync = fakeSync();
        const made = await submitWithServerPush({ option: { visible: false, checked, state, watchId }, stay: STAY, sync, makeLink: linkMaker(sync.log) });
        assert.deepEqual(sync.log, [['makeLink', expected], ['kick', 'register']], `${state} ${checked}`);
        assert.equal(made.serverPush, null);
        assert.equal(made.serverPushRetire, null);
      }
    }
    // 실행기가 없어도(서버 렌더링 등) 같은 id 로 링크를 만든다
    const log = [];
    const made = await submitWithServerPush({ option: { visible: false, checked: false, state: 'ON', watchId: WATCH_ID }, stay: STAY, sync: null, makeLink: linkMaker(log) });
    assert.deepEqual(log, [['makeLink', WATCH_ID]]);
    assert.equal(made.link.watchId, WATCH_ID);
  });

  test('체크를 끄면 끈 뒤 id 없이 링크를 만들고, 끄기가 실패하거나 던져도 링크는 만든다(id 없음, 끄지 못한 결과)', async () => {
    const done = fakeSync();
    const off = await submitWithServerPush({ option: { visible: true, checked: false, state: 'ON', watchId: WATCH_ID }, stay: STAY, sync: done, makeLink: linkMaker(done.log) });
    assert.deepEqual(done.log, [['retire'], ['makeLink', null], ['kick', 'register']]);
    assert.deepEqual(off.serverPushRetire, { ok: true, pending: false });
    assert.deepEqual(serverPushRetireKeys(off.serverPushRetire), ['guardian.serverPushTurnedOff']);

    for (const [label, retire] of [
      ['ok: false', () => ({ ok: false, reason: 'LOGIN_REQUIRED' })],
      ['던짐', () => {
        throw new Error('boom');
      }],
      ['빈 결과', () => null],
    ]) {
      const sync = fakeSync({ retire });
      const made = await submitWithServerPush({ option: { visible: true, checked: false, state: 'REPLACED', watchId: null }, stay: STAY, sync, makeLink: linkMaker(sync.log) });
      assert.deepEqual(sync.log, [['retire'], ['makeLink', null], ['kick', 'register']], label);
      assert.equal(made.link.watchId, null, label);
      assert.deepEqual(serverPushRetireKeys(made.serverPushRetire), ['guardian.serverPushTurnOffFailed'], label);
    }
    // 실행기가 없으면 끄지 못한 것이다
    const none = await applyServerPush({ action: SERVER_PUSH_ACTION.RETIRE, watchId: null }, { stay: STAY, sync: null });
    assert.deepEqual(none, { watchId: null, serverPush: null, serverPushRetire: { ok: false } });
  });

  test('등록이 실패하거나 던져도 링크는 만든다(id 없음, 이유 하나)', async () => {
    for (const [label, register, reason] of [
      ['로그인 필요', () => ({ ok: false, reason: 'LOGIN_REQUIRED' }), 'LOGIN_REQUIRED'],
      ['한도', () => ({ ok: false, reason: 'RATE_LIMITED' }), 'RATE_LIMITED'],
      ['이유 없음', () => ({ ok: false }), 'UNAVAILABLE'],
      ['던짐', () => {
        throw new Error('boom');
      }, 'UNAVAILABLE'],
    ]) {
      const sync = fakeSync({ register });
      const made = await submitWithServerPush({ option: { visible: true, checked: true, state: 'NONE', watchId: null }, stay: STAY, sync, makeLink: linkMaker(sync.log) });
      assert.deepEqual(sync.log, [['ensureRegistered', { stay: STAY }], ['makeLink', null], ['kick', 'register']], label);
      assert.deepEqual(made.serverPush, { ok: false, reason }, label);
      assert.equal(made.serverPushRetire, null, label);
    }
    const none = await applyServerPush({ action: SERVER_PUSH_ACTION.REGISTER, watchId: null }, { stay: STAY, sync: null });
    assert.deepEqual(none, { watchId: null, serverPush: { ok: false, reason: 'UNAVAILABLE' }, serverPushRetire: null });
  });

  test('링크를 만들지 못하면(makeLink 가 던짐) 그대로 던지고 비우기를 걸지 않는다', async () => {
    const sync = fakeSync();
    await assert.rejects(
      submitWithServerPush({
        option: { visible: true, checked: true, state: 'NONE', watchId: null },
        stay: STAY,
        sync,
        makeLink: async () => {
          throw Object.assign(new Error('crypto'), { code: 'CRYPTO_UNAVAILABLE' });
        },
      }),
      /crypto/,
    );
    assert.deepEqual(sync.log, [['ensureRegistered', { stay: STAY }]]);
  });

  test('공유 기록은 링크를 만든 뒤 한 번 쓰고 그 결과를 saved 로 돌려준다(계정이 그대로면)', async () => {
    const sync = fakeSync();
    const made = await submitWithServerPush({
      option: { visible: true, checked: true, state: 'NONE', watchId: null },
      stay: STAY,
      sync,
      makeLink: linkMaker(sync.log),
      saveLink: (link) => {
        sync.log.push(['saveLink', link.watchId]);
        return { ok: true };
      },
      readAccountKey: () => 'acct_a',
    });
    // 첫 기다림 전에 읽은 계정 키를 등록에 넘긴다(A-3 검토: 줄 서 있던 등록이 시작될 때 계정이 다르면 실행기가 등록하지 않는다)
    assert.deepEqual(sync.log, [
      ['ensureRegistered', { stay: STAY, accountKey: 'acct_a' }],
      ['makeLink', WATCH_ID],
      ['saveLink', WATCH_ID],
      ['kick', 'register'],
    ]);
    assert.deepEqual(made.saved, { ok: true });
  });

  test('계정 키를 받으면 실행기의 켜기·끄기에 넘기고, 받지 않으면 넘기지 않는다', async () => {
    const seen = [];
    const sync = {
      ensureRegistered: async (input) => {
        seen.push(['ensureRegistered', input]);
        return { ok: true, watchId: WATCH_ID };
      },
      retire: async (input) => {
        seen.push(['retire', input]);
        return { ok: true, pending: false };
      },
    };
    const register = { action: SERVER_PUSH_ACTION.REGISTER, watchId: null };
    const retire = { action: SERVER_PUSH_ACTION.RETIRE, watchId: null };
    await applyServerPush(register, { stay: STAY, sync, accountKey: 'acct_a' });
    await applyServerPush(retire, { stay: STAY, sync, accountKey: 'acct_a' });
    await applyServerPush(register, { stay: STAY, sync });
    await applyServerPush(retire, { stay: STAY, sync });
    assert.deepEqual(seen, [
      ['ensureRegistered', { stay: STAY, accountKey: 'acct_a' }],
      ['retire', { accountKey: 'acct_a' }],
      ['ensureRegistered', { stay: STAY }],
      ['retire', {}],
    ]);
  });

  test('등록·끄기·링크를 기다리는 동안 계정이 바뀌면 기록하지 않고 SUBMIT_ACCOUNT_CHANGED 를 던진다(값 없는 메시지, 비우기 없음)', async () => {
    const cases = [
      ['등록 중', { visible: true, checked: true, state: 'NONE', watchId: null }, 'ensureRegistered'],
      ['끄기 중', { visible: true, checked: false, state: 'ON', watchId: WATCH_ID }, 'retire'],
      ['링크 만드는 중(숨은 항목)', { visible: false, checked: false, state: 'ON', watchId: WATCH_ID }, 'makeLink'],
    ];
    for (const [label, option, switchAt] of cases) {
      let account = 'acct_a';
      const sync = fakeSync();
      const switching = {
        ...sync,
        ensureRegistered: async (input) => {
          const result = await sync.ensureRegistered(input);
          if (switchAt === 'ensureRegistered') account = 'acct_b';
          return result;
        },
        retire: async () => {
          const result = await sync.retire();
          if (switchAt === 'retire') account = 'acct_b';
          return result;
        },
      };
      const saves = [];
      const error = await submitWithServerPush({
        option,
        stay: STAY,
        sync: switching,
        makeLink: async (watchId) => {
          sync.log.push(['makeLink', watchId]);
          if (switchAt === 'makeLink') account = 'acct_b';
          return { link: 'L', watchId };
        },
        saveLink: (link) => saves.push(link),
        readAccountKey: () => account,
      }).then(
        () => null,
        (err) => err,
      );
      assert.ok(error, label);
      assert.equal(error.code, SUBMIT_ACCOUNT_CHANGED, label);
      assert.equal(error.message, 'submitWithServerPush: accountKey', label);
      assert.deepEqual(saves, [], `${label}: 바뀐 계정의 저장소에 쓰지 않는다`);
      assert.ok(!sync.log.some(([name]) => name === 'kick'), `${label}: 비우기를 걸지 않는다`);
    }
  });

  test('계정 키는 첫 기다림 전에 한 번, 기록 직전에 한 번 읽는다(같은 계정으로 돌아와 있으면 기록한다)', async () => {
    const reads = [];
    let account = 'acct_a';
    const sync = fakeSync({
      register: () => {
        reads.push('register');
        account = 'acct_b';
        return { ok: true, watchId: WATCH_ID };
      },
    });
    const made = await submitWithServerPush({
      option: { visible: true, checked: true, state: 'NONE', watchId: null },
      stay: STAY,
      sync,
      makeLink: async (watchId) => {
        account = 'acct_a';
        return { link: 'L', watchId };
      },
      saveLink: () => ({ ok: true }),
      readAccountKey: () => {
        reads.push(account);
        return account;
      },
    });
    assert.deepEqual(reads, ['acct_a', 'register', 'acct_a']);
    assert.deepEqual(made.saved, { ok: true });
  });
});

describe('링크 만들기 중 계정 전환 (실제 저장소·실행기, A-3 검토)', () => {
  // 같은 기기의 A·B 두 계정. A 의 마감 올리기가 도는 동안 A 가 만들기를 누르고(켜기·끄기가 그 뒤에 줄 선다), 다른 탭에서 B 가
  // 로그인한 것을 이 탭이 받아들인 뒤에 줄 선 일이 시작된다. 식별 값은 형식만 맞춘 테스트 값이다
  const A = 'acct_server_push_test_A01';
  const B = 'acct_server_push_test_B02';
  const TODAY = '2026-10-02';
  const WA = Object.freeze({ watchId: 'WATCHpushFixtureA_01ab', writeToken: 'WRITEpushFixtureA_0123456789-abcdefghijklmn' });
  const WB = Object.freeze({ watchId: 'WATCHpushFixtureB_02cd', writeToken: 'WRITEpushFixtureB_9876543210-onmlkjihgfedcb' });

  async function until(predicate) {
    for (let i = 0; i < 1000 && !predicate(); i += 1) await Promise.resolve();
    assert.ok(predicate(), '조건에 닿지 않았다');
  }

  /** 두 계정 모두 체류·일정이 있고 A 는 지켜보기가 켜져 있다(B 는 bWatch 일 때만). 마지막 로그인은 A 다 */
  function twoAccounts({ bWatch }) {
    const clock = { ms: Date.parse(`${TODAY}T12:00:00+09:00`), now: () => clock.ms };
    const deletes = [];
    const store = createStore({
      storage: createMemoryStorage(),
      now: clock.now,
      fetchImpl: async (url, init = {}) => {
        if (url === WATCH_PATHS.watch && init.method === 'DELETE') deletes.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    store.setOnline(true);
    const login = (accountKey) =>
      store.setSession({ authenticated: true, accountKey, expiresAt: new Date(clock.now() + 7 * 24 * 3600_000).toISOString() });
    const plan = { days: { [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '10:00', returnBy: '12:30' })] }) } };
    for (const [accountKey, ids] of [
      [B, bWatch ? WB : null],
      [A, WA],
    ]) {
      login(accountKey);
      assert.equal(store.writeStay(makeStay()).ok, true);
      assert.equal(store.writeTripPlan(plan).ok, true);
      if (ids) {
        const record = { ...ids, expiresOn: '2026-10-08', lastUploaded: {}, uploadPending: true, backQueue: [], confirmed: [], state: 'ON' };
        assert.equal(store.writeGuardianWatch(record).ok, true);
      }
    }
    const reply = (data) => ({ ok: true, status: 200, data: { ok: true, ...data }, kind: WATCH_KIND.OK });
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const calls = [];
    const api = {
      config: async () => reply({ enabled: true }),
      register: async (input) => {
        calls.push(['register', input.watchId]);
        return reply({ expiresOn: input.expiresOn });
      },
      deadlines: async (input) => {
        calls.push(['deadlines', input.watchId]);
        await held;
        return reply({ expiresOn: input.expiresOn, armFailed: 0 });
      },
      back: async () => reply({ recorded: true }),
      removeAll: async () => reply({ deleted: 0 }),
    };
    const runner = createWatchSync({ store, api, now: clock.now, randomBytes: (n) => new Uint8Array(n).fill(7) });
    const kicks = [];
    const sync = {
      ...runner,
      kick: (reason) => {
        kicks.push(reason);
        return runner.kick(reason);
      },
    };
    return { store, runner, sync, calls, deletes, kicks, login, release };
  }

  /** A 의 마감 올리기를 붙잡아 둔 채 만들기를 누르고, B 로 바꾼 뒤 올리기를 놓는다. submitWithServerPush 가 던진 오류를 돌려준다 */
  async function submitWhileSwitching(h, option) {
    void h.runner.kick('plan');
    await until(() => h.calls.length === 1);
    const submitting = submitWithServerPush({
      option,
      stay: h.store.readStay(),
      sync: h.sync,
      makeLink: async (watchId) => ({ link: 'L', watchId }),
      saveLink: () => ({ ok: true }),
      readAccountKey: () => h.store.getStatus().accountKey,
    }).then(
      () => null,
      (err) => err,
    );
    h.login(B);
    h.release();
    const error = await submitting;
    await h.runner.idle();
    await h.store.retryPendingServerDelete();
    return error;
  }

  test('끄기: 줄 선 끄기가 시작될 때 B 로 바뀌었으면 B 의 지켜보기를 끄지 않고 DELETE 도 보내지 않는다', async () => {
    const h = twoAccounts({ bWatch: true });
    const error = await submitWhileSwitching(h, { visible: true, checked: false, state: 'ON', watchId: WA.watchId });
    assert.equal(error?.code, SUBMIT_ACCOUNT_CHANGED);
    assert.equal(h.store.readGuardianWatch()?.watchId, WB.watchId, 'B 의 지켜보기는 켜진 그대로다');
    assert.equal(h.store.readGuardianWatch()?.state, 'ON');
    assert.deepEqual(h.deletes, [], 'B 의 지켜보기에 DELETE 를 보내지 않는다');
    assert.deepEqual(h.store.readPendingServerDelete(), []);
    assert.deepEqual(h.kicks, [], '링크 만들기는 비우기를 걸지 않는다');
    h.login(A);
    assert.equal(h.store.readGuardianWatch()?.watchId, WA.watchId, 'A 의 지켜보기도 그대로다(일반 실패 줄을 보고 다시 만든다)');
  });

  test('켜기: 줄 선 등록이 시작될 때 B 로 바뀌었으면 B 로 등록하지 않고 B 의 마감도 올리지 않는다(B 는 동의하지 않았다)', async () => {
    const h = twoAccounts({ bWatch: false });
    const error = await submitWhileSwitching(h, { visible: true, checked: true, state: 'ON', watchId: WA.watchId });
    assert.equal(error?.code, SUBMIT_ACCOUNT_CHANGED);
    assert.deepEqual(h.calls, [['deadlines', WA.watchId]], 'A 의 올리기 하나뿐이다(등록도 B 의 올리기도 없다)');
    assert.equal(h.store.readGuardianWatch(), null, 'B 에게 지켜보기가 생기지 않는다');
    assert.deepEqual(h.deletes, []);
    assert.deepEqual(h.store.readPendingServerDelete(), []);
    assert.deepEqual(h.kicks, [], '링크 만들기는 비우기를 걸지 않는다');
    h.login(A);
    assert.equal(h.store.readGuardianWatch()?.watchId, WA.watchId);
  });
});

describe('문구', () => {
  test('동의 목록은 설계서 5.5 순서의 일곱 줄이다', () => {
    assert.deepEqual(SERVER_PUSH_CONSENT_KEYS, [
      'guardian.serverPushStored',
      'guardian.serverPushNotStored',
      'guardian.serverPushDeadlineKind',
      'guardian.serverPushRetention',
      'guardian.serverPushOffline',
      'guardian.serverPushAlertRule',
      'guardian.serverPushLocation',
    ]);
  });

  test('새 문구 키는 네 언어가 모두 있고 "안전합니다"와 check-in 이 없다', () => {
    for (const key of NEW_KEYS) {
      const entry = guardianMessages[key];
      assert.ok(entry, `${key} 는 messages 에 있다`);
      assert.equal(guardianSafety[key], undefined, `${key} 는 safety 가 아니다`);
      assert.equal(UI_TEXT[key], entry);
      for (const lang of LANGS) {
        assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
        assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
      }
      assert.ok(!/안전합니다|안전해요/.test(entry.ko), `${key}.ko`);
      assert.ok(!/\bsafe\b/i.test(entry.en), `${key}.en`);
      assert.ok(!/check-?in/i.test(entry.en), `${key}.en 에 check-in`);
      assert.ok(!/安全/.test(entry.ja), `${key}.ja`);
      assert.ok(!/安全/.test(entry.zh), `${key}.zh`);
      for (const lang of LANGS) {
        assert.ok(!/[\u2013\u2014]/.test(entry[lang]), `${key}.${lang} 에 대시`);
      }
    }
  });

  test('끄기 결과 줄은 safety 블록의 네 언어 문장이고 꺼졌다고 단정하지 않는다', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const key of ['guardian.serverPushTurnOffFailed', 'guardian.serverPushTurnOffPending', 'guardian.serverPushTurnedOff']) {
      const entry = guardianSafety[key];
      assert.ok(entry, `${key} 는 safety 에 있다`);
      assert.equal(guardianMessages[key], undefined, `${key} 는 messages 가 아니다`);
      for (const lang of LANGS) {
        assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
        assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
        assert.ok(!dashes.test(entry[lang]), `${key}.${lang} 에 대시`);
      }
      assert.ok(!/안전합니다|안전해요/.test(entry.ko), `${key}.ko`);
      assert.ok(!/\bsafe\b/i.test(entry.en), `${key}.en`);
      assert.ok(!/安全/.test(entry.ja) && !/安全/.test(entry.zh), `${key} ja·zh`);
    }
    assert.match(guardianSafety['guardian.serverPushTurnOffFailed'].ko, /끄지 못했어요/);
    assert.match(guardianSafety['guardian.serverPushTurnOffPending'].ko, /알림이 갈 수 있어요/);
    assert.equal(guardianSafety['guardian.serverPushTurnedOff'].ko, '서버 알림을 껐어요.');
  });

  test('보관 기간·저장 위치 빈칸은 확인 결과로 채웠다(다르게 정한 것 19)', () => {
    assert.match(guardianMessages['guardian.serverPushRetention'].ko, /출국 7일 뒤 자동 삭제/);
    assert.match(guardianMessages['guardian.serverPushRetention'].ko, /3일 안에/);
    assert.match(guardianMessages['guardian.serverPushLocation'].ko, /일본 도쿄/);
    assert.match(guardianMessages['guardian.serverPushLocation'].ko, /유럽 또는 미국/);
    assert.equal(guardianMessages['guardian.serverPushLogin'].ko, '서버 알림은 Google 또는 카카오로 로그인해야 켤 수 있어요.');
  });
});
