// 받은 일정 화면의 '앱이 닫혀 있어도 받기' 항목 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7,
// 다르게 정한 것 1·2, 정한 값 5·9·10·12·15·16·25·27·28)
//
// 화면(components/guardian/GuardianPushItem.js)이 쓰는 순수 규칙(components/guardian/guardianPushView.js)과 문구를 고정한다.
//   - 항목이 보이는 조건: 사본에 watchId 가 있고, 서버 알림 스위치가 켜졌거나 이 기기에 그 watchId 의 구독이 있을 때
//   - 상태 표(계획 Task 7)의 상태마다 줄 키와 버튼이 정해져 있다. HIDDEN 말고는 동의 문장, 법률 검토 줄, 도착 비보장, 위치 줄이 늘 있다
//   - 실행기의 결과(PUSH_RESULT)는 모두 결과 줄 문구가 있다. 새 결과가 생기면 이 테스트가 먼저 실패한다
//   - 기기 알림 스위치가 꺼져 있어도 켤 수 있다(켜면 둘 다 켠다). 꺼진 기기 스위치 아래의 구독은 켜진 것으로 그리지 않는다
//   - 실행기가 일하는 중(busy)이면 두 스위치를 잠근다. 보기 전용이면 스위치를 잠그고 로그인 길(오프라인이면 연결 안내)을 준다
//   - 표시 부품은 저장소를 읽지 않는다. 실행기 훅을 부르는 곳은 GuardianPushItem.js 하나다
//   - 결과 줄은 지금 상태에 맞을 때만 보인다(검토 I1): 실행기의 lastResult 는 다시 맞추기·상태 조회 뒤에도 남는다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IOS_STEP_KEYS,
  PUSH_ACTION,
  PUSH_CONSENT_KEYS,
  PUSH_ITEM_STATE,
  PUSH_RESULT_LINE,
  PUSH_SAFETY_KEYS,
  PUSH_USER_ACTION,
  actionForResult,
  guardianPushViewModel,
  pushLineSegments,
  resultFitsState,
  switchControlProps,
} from '../components/guardian/guardianPushView.js';
import { confirmedFor } from '../components/guardian/returnStatus.js';
import { IDLE_STATE, PUSH_RESULT } from '../lib/notify/guardianPush.js';
import { PUSH_SUPPORT } from '../lib/notify/pushSupport.js';
import { messages as guardianMessages, safety as guardianSafety } from '../src/i18n/messages/guardian.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';
import { messages as todayMessages } from '../src/i18n/messages/today.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WATCH = 'AAAAAAAAAAAAAAAAAAAAAA';
const SUB = Object.freeze({ subId: 'BBBBBBBBBBBBBBBBBBBBBB', lang: 'ko' });
const CONFIG_ON = Object.freeze({ enabled: true, vapidPublicKey: 'BPub', guardianLoginRequired: true });
const CONFIG_OFF = Object.freeze({ enabled: false, vapidPublicKey: null, guardianLoginRequired: true });
const TODAY = '2026-11-16';

const ALWAYS = ['guardian.pushConsentStored', 'conditions.consentLegalReview', 'guardian.pushNoGuarantee', 'guardian.pushLocation'];

/** 실행기 상태(공용 모양). 기본은 지원됨, 설정 켜짐, 워커 준비됨, 구독 없음 */
function stateOf(over = {}) {
  return { ...IDLE_STATE, support: PUSH_SUPPORT.READY, config: CONFIG_ON, swReady: true, ...over };
}

function view(over = {}, opts = {}) {
  return guardianPushViewModel({ state: stateOf(over), watchId: WATCH, mainOn: true, writable: true, today: TODAY, ...opts });
}

/** 항목에 보이는 모든 문구 키(상태 줄, 결과 줄, 동의 줄, 안전 줄) */
function shownKeys(model) {
  return [...model.lines, ...(model.result ? [model.result.key] : []), ...model.consentLines, ...model.safetyLines];
}

describe('항목이 보이는 조건 (다르게 정한 것 1, 정한 값 12)', () => {
  test('사본에 watchId 가 없으면 HIDDEN 이다', () => {
    for (const watchId of [null, undefined, '', 'short', `${WATCH}x`, 42]) {
      const model = guardianPushViewModel({ state: stateOf({ sub: SUB }), watchId, mainOn: true, writable: true });
      assert.equal(model.itemState, PUSH_ITEM_STATE.HIDDEN, String(watchId));
      assert.deepEqual(shownKeys(model), [], String(watchId));
      assert.equal(model.showSwitch, false);
      assert.deepEqual(model.actions, []);
    }
  });

  test('서버 렌더링·실행기 없음(IDLE_STATE)이면 HIDDEN 이다', () => {
    const model = guardianPushViewModel({ state: IDLE_STATE, watchId: WATCH, mainOn: true, writable: true });
    assert.equal(model.itemState, PUSH_ITEM_STATE.HIDDEN);
    assert.equal(guardianPushViewModel({ state: null, watchId: WATCH, mainOn: true, writable: true }).itemState, PUSH_ITEM_STATE.HIDDEN);
  });

  test('config 꺼짐이고 구독이 없으면 HIDDEN, 구독이 있으면 PAUSED 이고 끄기만 있다', () => {
    assert.equal(view({ config: CONFIG_OFF }).itemState, PUSH_ITEM_STATE.HIDDEN);
    // 설정을 아직 못 읽었고 구독도 없으면 숨긴다
    assert.equal(view({ config: null }).itemState, PUSH_ITEM_STATE.HIDDEN);

    const paused = view({ config: CONFIG_OFF, sub: SUB });
    assert.equal(paused.itemState, PUSH_ITEM_STATE.PAUSED);
    assert.deepEqual(paused.lines, ['guardian.pushPaused']);
    // 끄기만: 스위치는 켜져 있고 누를 수 있으며(누르면 끈다) 다른 버튼과 함께 있음은 없다
    assert.equal(paused.showSwitch, true);
    assert.equal(paused.switchOn, true);
    assert.equal(paused.switchDisabled, false);
    assert.deepEqual(paused.actions, []);
    assert.equal(paused.showMute, false);
  });

  test('설정을 못 읽었어도 구독이 있으면 보이고(끌 수 있다) 함께 있음은 숨긴다', () => {
    const model = view({ config: null, sub: SUB });
    assert.equal(model.itemState, PUSH_ITEM_STATE.ON);
    assert.equal(model.switchOn, true);
    assert.equal(model.switchDisabled, false);
    assert.equal(model.showMute, false);
  });

  test('기기 알림 스위치가 꺼져 있어도 READY 면 AVAILABLE 이다(켜면 둘 다 켠다)', () => {
    // 권한을 아직 묻지 않았어도(default) 지원 판별은 READY 다. 켜면 권한 요청과 기기 알림 켜기를 함께 한다
    const model = view({}, { mainOn: false });
    assert.equal(model.itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.equal(model.showSwitch, true);
    assert.equal(model.switchOn, false);
    assert.equal(model.switchDisabled, false);
    assert.deepEqual(model.lines, ['guardian.pushIntro']);
  });

  test('기기 알림 스위치가 꺼졌는데 구독 기록이 남아 있으면(다시 맞추기가 끄기 전) 켜진 것으로 그리지 않는다', () => {
    const model = view({ sub: SUB }, { mainOn: false });
    assert.equal(model.itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.equal(model.switchOn, false);
    assert.equal(model.showMute, false);
  });
});

describe('상태 표 (계획 Task 7)', () => {
  test('아이폰 두 상태와 UNSUPPORTED, DENIED 는 켜기 스위치가 없다', () => {
    const cases = [
      [PUSH_SUPPORT.IOS_NEEDS_INSTALL, PUSH_ITEM_STATE.IOS_NEEDS_INSTALL],
      [PUSH_SUPPORT.IOS_TOO_OLD, PUSH_ITEM_STATE.IOS_TOO_OLD],
      [PUSH_SUPPORT.UNSUPPORTED, PUSH_ITEM_STATE.UNSUPPORTED],
      [PUSH_SUPPORT.DENIED, PUSH_ITEM_STATE.DENIED],
    ];
    for (const [support, itemState] of cases) {
      // 아이폰 Safari 탭은 서비스 워커 준비 확인을 하지 않는다(swReady null)
      const model = view({ support, swReady: null });
      assert.equal(model.itemState, itemState, support);
      assert.equal(model.showSwitch, false, support);
      assert.deepEqual(model.actions, [], support);
      assert.equal(model.showMute, false, support);
    }
  });

  test('표의 상태마다 줄 키와 버튼이 정해진 대로다', () => {
    const table = [
      [{ support: PUSH_SUPPORT.IOS_NEEDS_INSTALL }, 'IOS_NEEDS_INSTALL', ['guardian.pushIosTitle', ...IOS_STEP_KEYS, 'guardian.pushIosNote'], [], false],
      [{ support: PUSH_SUPPORT.IOS_TOO_OLD }, 'IOS_TOO_OLD', ['guardian.pushIosOld'], [], false],
      [{ support: PUSH_SUPPORT.UNSUPPORTED }, 'UNSUPPORTED', ['guardian.pushUnsupported'], [], false],
      [{ support: PUSH_SUPPORT.DENIED }, 'DENIED', ['guardian.pushDenied'], [], false],
      [{ swReady: false }, 'SW_NOT_READY', ['guardian.pushSwNotReady'], [PUSH_ACTION.RELOAD], false],
      [{}, 'AVAILABLE', ['guardian.pushIntro'], [], true],
      [{ busy: true }, 'WORKING', ['guardian.pushWorking'], [], true],
      [{ sub: SUB }, 'ON', ['guardian.pushOn'], [], true],
      [{ sub: SUB, config: CONFIG_OFF }, 'PAUSED', ['guardian.pushPaused'], [], true],
      [{ sub: SUB, renewNeeded: true }, 'RENEW_NEEDED', ['guardian.pushRenew'], [PUSH_ACTION.RENEW], true],
      [{ sub: SUB, moved: true }, 'MOVED', ['guardian.pushMoved', 'guardian.pushMovedNote'], [PUSH_ACTION.TAKE_OVER], true],
      [{ gone: true }, 'GONE', ['guardian.pushGone', 'guardian.pushOpenAppAlerts'], [], false],
    ];
    for (const [over, itemState, lines, actions, showSwitch] of table) {
      const model = view(over);
      assert.equal(model.itemState, PUSH_ITEM_STATE[itemState], itemState);
      assert.deepEqual(model.lines, lines, itemState);
      assert.deepEqual(model.actions, actions, itemState);
      assert.equal(model.showSwitch, showSwitch, itemState);
    }
  });

  test('스위치: AVAILABLE 은 꺼짐, WORKING 은 꺼짐·잠김, 구독 상태(ON·PAUSED·RENEW_NEEDED·MOVED)는 켜짐이고 누르면 끈다', () => {
    assert.deepEqual(pick(view({})), { switchOn: false, switchDisabled: false });
    assert.deepEqual(pick(view({ busy: true })), { switchOn: false, switchDisabled: true });
    for (const over of [{ sub: SUB }, { sub: SUB, config: CONFIG_OFF }, { sub: SUB, renewNeeded: true }, { sub: SUB, moved: true }]) {
      assert.deepEqual(pick(view(over)), { switchOn: true, switchDisabled: false }, JSON.stringify(over));
    }
    function pick(model) {
      return { switchOn: model.switchOn, switchDisabled: model.switchDisabled };
    }
  });

  test('HIDDEN 말고는 동의 문장, 법률 검토 줄, 도착 비보장, 위치 줄이 늘 있다', () => {
    const overs = [
      { support: PUSH_SUPPORT.IOS_NEEDS_INSTALL },
      { support: PUSH_SUPPORT.IOS_TOO_OLD },
      { support: PUSH_SUPPORT.UNSUPPORTED },
      { support: PUSH_SUPPORT.DENIED },
      { swReady: false },
      {},
      { busy: true },
      { sub: SUB },
      { sub: SUB, config: CONFIG_OFF },
      { sub: SUB, renewNeeded: true },
      { sub: SUB, moved: true },
      { gone: true },
    ];
    for (const over of overs) {
      for (const writable of [true, false]) {
        const model = view(over, { writable });
        assert.notEqual(model.itemState, PUSH_ITEM_STATE.HIDDEN);
        assert.deepEqual(model.consentLines, PUSH_CONSENT_KEYS);
        assert.deepEqual(model.safetyLines, PUSH_SAFETY_KEYS);
        for (const key of ALWAYS) assert.ok(shownKeys(model).includes(key), `${JSON.stringify(over)} ${key}`);
      }
    }
    // 동의 문장은 설계서 5.5 보호자 문구, 법률 검토 줄은 A-2 와 같은 키다(배지 없음)
    assert.deepEqual(PUSH_CONSENT_KEYS, ['guardian.pushConsentStored', 'conditions.consentLegalReview']);
    assert.deepEqual(PUSH_SAFETY_KEYS, ['guardian.pushNoGuarantee', 'guardian.pushLocation']);
  });

  test('GONE 은 구독이 없어도 줄이 보이고 켜기가 없다(정한 값 10)', () => {
    const model = view({ gone: true });
    assert.equal(model.itemState, PUSH_ITEM_STATE.GONE);
    assert.equal(model.showSwitch, false);
    assert.equal(model.showMute, false);
    // 기기 알림 스위치가 꺼져 있으면 '앱이 열려 있을 때 알림은 그대로 받아요'를 말하지 않는다(검토 Minor 1)
    assert.deepEqual(view({ gone: true }, { mainOn: false }).lines, ['guardian.pushGone']);
    assert.ok(!/앱이 열려 있을 때/.test(guardianMessages['guardian.pushGone'].ko));
    // 서버 스위치가 꺼졌고 구독도 없으면 GONE 이어도 숨는다(정한 값 12)
    assert.equal(view({ gone: true, config: CONFIG_OFF }).itemState, PUSH_ITEM_STATE.HIDDEN);
  });

  test('SW_NOT_READY 는 구독이 없을 때만이고, 준비 확인 전(null)은 켤 수 있다', () => {
    assert.equal(view({ swReady: null }).itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.equal(view({ swReady: false, sub: SUB }).itemState, PUSH_ITEM_STATE.ON);
  });

  test('이동(MOVED)이 다시 켜기보다 먼저이고(다시 켜기는 moved 구독을 건너뛴다), 서버 스위치 꺼짐(PAUSED)이 둘보다 먼저다', () => {
    // renewNeeded 는 계정 단위다. 이 지켜보기가 moved 면 다시 켜기 버튼을 보이지 않는다(moved 만 남으면 renew 가 UNAVAILABLE)
    const moved = view({ sub: SUB, renewNeeded: true, moved: true });
    assert.equal(moved.itemState, PUSH_ITEM_STATE.MOVED);
    assert.deepEqual(moved.actions, [PUSH_ACTION.TAKE_OVER]);
    assert.ok(!moved.actions.includes(PUSH_ACTION.RENEW));
    assert.equal(view({ sub: SUB, renewNeeded: true, moved: true, config: CONFIG_OFF }).itemState, PUSH_ITEM_STATE.PAUSED);
  });

  test('아이폰 안내는 제목, 다섯 단계 목록, 메모 순서로 묶인다', () => {
    const segments = pushLineSegments(view({ support: PUSH_SUPPORT.IOS_NEEDS_INSTALL }).lines);
    assert.deepEqual(segments, [
      { kind: 'text', key: 'guardian.pushIosTitle' },
      { kind: 'steps', keys: IOS_STEP_KEYS },
      { kind: 'text', key: 'guardian.pushIosNote' },
    ]);
    assert.equal(IOS_STEP_KEYS.length, 5);
    assert.deepEqual(pushLineSegments(['guardian.pushMoved', 'guardian.pushMovedNote']), [
      { kind: 'text', key: 'guardian.pushMoved' },
      { kind: 'text', key: 'guardian.pushMovedNote' },
    ]);
    assert.deepEqual(pushLineSegments(undefined), []);
  });
});

describe('잠금과 보기 전용 (정한 값 27, 실행기 검토: 켜기가 도는 중의 끄기·함께 있음은 켜기 약속을 돌려준다)', () => {
  test('busy 면 스위치와 함께 있음이 잠기고(포커스를 지키는 잠금), 구독이 있으면 상태 줄은 그대로다', () => {
    const working = view({ busy: true });
    assert.equal(working.itemState, PUSH_ITEM_STATE.WORKING);
    assert.equal(working.switchDisabled, true);
    assert.equal(working.switchLocked, true);

    const off = view({ sub: SUB, busy: true });
    assert.equal(off.itemState, PUSH_ITEM_STATE.ON);
    assert.deepEqual(off.lines, ['guardian.pushOn']);
    assert.equal(off.switchDisabled, true);
    assert.equal(off.switchLocked, true);
    assert.equal(off.showMute, true);
    assert.equal(off.muteDisabled, true);
    assert.equal(off.muteLocked, true);

    const renewing = view({ sub: SUB, renewNeeded: true, busy: true });
    assert.equal(renewing.actionsDisabled, true);
    assert.equal(view({ sub: SUB, renewNeeded: true }).actionsDisabled, false);
  });

  test('보기 전용이면 스위치가 잠기고 로그인 줄과 로그인 버튼이 있다(다시 켜기·다시 받기는 숨긴다)', () => {
    const available = view({}, { writable: false });
    assert.equal(available.itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.equal(available.switchDisabled, true);
    assert.equal(available.switchLocked, false);
    assert.deepEqual(available.lines, ['guardian.pushIntro', 'guardian.pushLogin']);
    assert.deepEqual(available.actions, [PUSH_ACTION.LOGIN]);

    for (const over of [{ sub: SUB }, { sub: SUB, renewNeeded: true }, { sub: SUB, moved: true }, { sub: SUB, config: CONFIG_OFF }]) {
      const model = view(over, { writable: false });
      assert.equal(model.switchDisabled, true, JSON.stringify(over));
      assert.ok(model.lines.includes('settings.readOnlyNote'), JSON.stringify(over));
      assert.deepEqual(model.actions, [PUSH_ACTION.LOGIN], JSON.stringify(over));
      assert.equal(model.showMute, false);
    }
  });

  test('바로 위 기기 알림 스위치가 로그인 버튼을 이미 보이면 항목은 줄만 두고 버튼을 두지 않는다(검토 Minor 2)', () => {
    const available = view({}, { writable: false, loginElsewhere: true });
    assert.deepEqual(available.lines, ['guardian.pushIntro', 'guardian.pushLogin']);
    assert.deepEqual(available.actions, []);
    const moved = view({ sub: SUB, moved: true }, { writable: false, loginElsewhere: true });
    assert.ok(moved.lines.includes('settings.readOnlyNote'));
    assert.deepEqual(moved.actions, []);
    assert.deepEqual(view({ lastResult: PUSH_RESULT.LOGIN_REQUIRED }, { loginElsewhere: true }).actions, []);
  });

  test('오프라인 보기 전용이면 로그인을 권하지 않고 연결 안내만 둔다', () => {
    const model = view({ sub: SUB }, { writable: false, offline: true });
    assert.ok(model.lines.includes('settings.offlineNote'));
    assert.ok(!model.lines.includes('guardian.pushLogin'));
    assert.deepEqual(model.actions, []);
    assert.equal(view({}, { writable: false, offline: true }).actions.length, 0);
  });

  test('보기 전용이어도 아이폰 안내·기간 끝처럼 켤 수 없는 상태는 줄만 그대로다', () => {
    assert.deepEqual(view({ gone: true }, { writable: false }).lines, ['guardian.pushGone', 'guardian.pushOpenAppAlerts']);
    assert.deepEqual(view({ support: PUSH_SUPPORT.IOS_TOO_OLD }, { writable: false }).lines, ['guardian.pushIosOld']);
    assert.deepEqual(view({ support: PUSH_SUPPORT.IOS_TOO_OLD }, { writable: false }).actions, []);
  });
});

describe('오늘 함께 있음 (정한 값 16)', () => {
  test('함께 있음은 ON 이고 쓰기 가능할 때만 보인다', () => {
    assert.equal(view({ sub: SUB }).showMute, true);
    assert.equal(view({ sub: SUB }, { writable: false }).showMute, false);
    assert.equal(view({ sub: SUB, config: CONFIG_OFF }).showMute, false);
    assert.equal(view({ sub: SUB, config: null }).showMute, false);
    assert.equal(view({ sub: SUB, renewNeeded: true }).showMute, false);
    assert.equal(view({ sub: SUB, moved: true }).showMute, false);
    assert.equal(view({}).showMute, false);
  });

  test('함께 있음 켜짐은 오늘(한국 시간) 상태 조회의 muted 만 따른다', () => {
    const status = (date, muted) => ({ date, confirmed: [], muted, active: true, atMs: 1 });
    assert.equal(view({ sub: SUB, status: status(TODAY, true) }).muteOn, true);
    assert.equal(view({ sub: SUB, status: status(TODAY, false) }).muteOn, false);
    // 어제 켠 함께 있음은 자정에 풀렸다
    assert.equal(view({ sub: SUB, status: status('2026-11-15', true) }).muteOn, false);
    assert.equal(view({ sub: SUB, status: null }).muteOn, false);
    assert.equal(view({ sub: SUB, status: status(TODAY, true) }).muteDisabled, false);
  });
});

describe('결과 줄 (정한 값 5, 실행기 결과)', () => {
  test('PUSH_RESULT 의 모든 값에 결과 줄 문구가 있고 그 문구는 네 언어가 있다', () => {
    for (const result of Object.values(PUSH_RESULT)) {
      const key = PUSH_RESULT_LINE[result];
      assert.ok(typeof key === 'string', `${result} 의 결과 줄 문구가 없다`);
      assert.ok(UI_TEXT[key], `${key} 가 사전에 없다`);
      for (const lang of LANGS) assert.ok(UI_TEXT[key][lang]?.trim(), `${key}.${lang}`);
    }
    assert.deepEqual(Object.keys(PUSH_RESULT_LINE).sort(), Object.values(PUSH_RESULT).sort());
  });

  test('결과마다 그 줄을 보이고, 실패는 alert, 나머지는 status 다', () => {
    const alerts = new Set([
      'DENIED',
      'UNSUPPORTED',
      'SW_NOT_READY',
      'FAILED',
      'LOGIN_REQUIRED',
      'RATE_LIMITED',
      'UNAVAILABLE',
      'NETWORK',
      'READ_ONLY',
      'OFF_UNSENT',
      'PERMISSION_LOST',
    ]);
    // 결과마다 그 결과가 맞는 자리에서 본다. ON 은 ON 상태의 줄과 같아 따로 보이지 않는다
    const FITS = {
      MUTE_ON: { sub: SUB, status: { date: TODAY, confirmed: [], muted: true, active: true, atMs: 1 } },
      MUTE_OFF: { sub: SUB },
    };
    for (const result of Object.values(PUSH_RESULT)) {
      const model = view({ lastResult: result, ...(FITS[result] ?? {}) });
      const key = PUSH_RESULT_LINE[result];
      if (result === PUSH_RESULT.ON) {
        assert.equal(model.result, null);
        continue;
      }
      assert.equal(model.result?.key, key, result);
      assert.equal(model.result.alert, alerts.has(result), result);
      assert.equal(model.result.safety, Boolean(guardianSafety[key]), result);
    }
  });

  test('OFF_UNSENT 는 알림이 올 수 있다는 safety 줄이고, 다시 맞추기가 낸 것이어도(구독이 없고 AVAILABLE) 보인다', () => {
    const model = view({ lastResult: PUSH_RESULT.OFF_UNSENT });
    assert.equal(model.itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.deepEqual(model.result, { key: 'guardian.pushOffUnsent', safety: true, alert: true });
    // 서버 스위치가 꺼진 배포에서 구독을 끈 뒤에는 항목이 숨는다(줄도 함께 사라진다)
    assert.equal(view({ lastResult: PUSH_RESULT.OFF_UNSENT, config: CONFIG_OFF }).itemState, PUSH_ITEM_STATE.HIDDEN);
    // 보호자가 끄지 않았어도 나온다(다시 맞추기가 구독을 거둔 뒤 직접 해지가 닿지 않음). '껐다'고 말하지 않고 서버가 보낼 수 있다고 말한다
    const line = guardianSafety['guardian.pushOffUnsent'];
    assert.equal(line.ko, '이 휴대폰의 서버 알림이 꺼졌지만 서버에서 지우지 못했어요. 환자의 일정이 끝날 때까지 서버가 알림을 보낼 수 있어요.');
    assert.ok(!/껐어요|껐습니다/.test(line.ko));
    assert.ok(!/\byou turned\b|^Turned off/i.test(line.en));
    assert.match(line.en, /this phone’s alert address could not be deleted/);
    assert.match(line.en, /may still send alerts until the patient’s schedule ends/);
  });

  test('OFF_PENDING 은 safety 줄이다(연결되면 서버에서 지운다)', () => {
    assert.deepEqual(view({ lastResult: PUSH_RESULT.OFF_PENDING }).result, { key: 'guardian.pushOffPending', safety: true, alert: false });
  });

  test('LOGIN_REQUIRED 결과는 로그인 줄과 로그인 버튼, 오프라인 READ_ONLY 는 연결 안내다', () => {
    const login = view({ lastResult: PUSH_RESULT.LOGIN_REQUIRED });
    assert.equal(login.result.key, 'guardian.pushLogin');
    assert.deepEqual(login.actions, [PUSH_ACTION.LOGIN]);
    assert.equal(view({ lastResult: PUSH_RESULT.READ_ONLY }).result.key, 'settings.readOnlyNote');
    const offline = view({ lastResult: PUSH_RESULT.READ_ONLY }, { offline: true });
    assert.equal(offline.result.key, 'settings.offlineNote');
    assert.deepEqual(offline.actions, []);
  });

  test('모르는 결과 값은 줄을 만들지 않는다', () => {
    assert.equal(view({ lastResult: 'SOMETHING_NEW' }).result, null);
    assert.equal(view({ lastResult: null }).result, null);
  });
});

describe('결과 줄은 지금 상태에 맞을 때만 (검토 I1)', () => {
  const YESTERDAY = '2026-11-15';
  const status = (date, muted) => ({ date, confirmed: [], muted, active: true, atMs: 1 });
  const FAILURES = [
    PUSH_RESULT.DENIED,
    PUSH_RESULT.UNSUPPORTED,
    PUSH_RESULT.SW_NOT_READY,
    PUSH_RESULT.FAILED,
    PUSH_RESULT.LOGIN_REQUIRED,
    PUSH_RESULT.RATE_LIMITED,
    PUSH_RESULT.UNAVAILABLE,
    PUSH_RESULT.NETWORK,
    PUSH_RESULT.READ_ONLY,
    PUSH_RESULT.OFF,
    PUSH_RESULT.GONE,
  ];
  const at = (itemState, extra = {}) => ({
    itemState,
    switchOn: ['ON', 'PAUSED', 'RENEW_NEEDED', 'MOVED'].includes(itemState),
    showMute: false,
    muteOn: false,
    ...extra,
  });

  test('규칙 하나(resultFitsState): ON 은 ON 에서만, 함께 있음 결과는 함께 있음 스위치와 맞을 때만', () => {
    assert.equal(resultFitsState(PUSH_RESULT.ON, at('ON')), true);
    for (const state of ['AVAILABLE', 'MOVED', 'RENEW_NEEDED', 'PAUSED', 'GONE']) assert.equal(resultFitsState(PUSH_RESULT.ON, at(state)), false, state);
    assert.equal(resultFitsState(PUSH_RESULT.MUTE_ON, at('ON', { showMute: true, muteOn: true })), true);
    assert.equal(resultFitsState(PUSH_RESULT.MUTE_ON, at('ON', { showMute: true, muteOn: false })), false);
    assert.equal(resultFitsState(PUSH_RESULT.MUTE_OFF, at('ON', { showMute: true, muteOn: false })), true);
    assert.equal(resultFitsState(PUSH_RESULT.MUTE_OFF, at('ON', { showMute: true, muteOn: true })), false);
    assert.equal(resultFitsState(PUSH_RESULT.MUTE_OFF, at('AVAILABLE')), false);
  });

  test('규칙 하나: 끄기 결과와 권한 잃음은 구독이 없을 때만, 실패는 ON 이 아닐 때만, 모르는 값은 맞지 않는다', () => {
    for (const result of [PUSH_RESULT.OFF_DONE, PUSH_RESULT.OFF_PENDING, PUSH_RESULT.OFF_UNSENT, PUSH_RESULT.PERMISSION_LOST]) {
      assert.equal(resultFitsState(result, at('AVAILABLE')), true, result);
      assert.equal(resultFitsState(result, at('GONE')), true, result);
      for (const state of ['ON', 'PAUSED', 'RENEW_NEEDED', 'MOVED']) assert.equal(resultFitsState(result, at(state)), false, `${result} ${state}`);
    }
    for (const result of FAILURES) {
      assert.equal(resultFitsState(result, at('ON')), false, result);
      for (const state of ['AVAILABLE', 'MOVED', 'RENEW_NEEDED', 'PAUSED', 'SW_NOT_READY']) assert.equal(resultFitsState(result, at(state)), true, `${result} ${state}`);
    }
    assert.equal(resultFitsState('SOMETHING_NEW', at('AVAILABLE')), false);
    assert.equal(resultFitsState(null, at('AVAILABLE')), false);
  });

  test('검토 경우 A: 켠 뒤 기기 알림 스위치를 끄면 받는 중 줄이 남지 않는다(다시 맞추기 전과 뒤)', () => {
    const before = view({ sub: SUB, lastResult: PUSH_RESULT.ON }, { mainOn: false });
    assert.equal(before.itemState, PUSH_ITEM_STATE.AVAILABLE);
    assert.equal(before.switchOn, false);
    assert.equal(before.result, null);
    assert.ok(!before.lines.includes('guardian.pushOn'));
    const after = view({ lastResult: PUSH_RESULT.ON }, { mainOn: false });
    assert.equal(after.result, null);
    assert.equal(view({ lastResult: PUSH_RESULT.ON }).result, null);
  });

  test('검토 경우 B: 상태 조회가 다른 기기를 알리면(MOVED) 받는 중 줄이 없다. 다시 켜기·쉼도 같다', () => {
    for (const over of [{ moved: true }, { renewNeeded: true }, { config: CONFIG_OFF }]) {
      const model = view({ sub: SUB, lastResult: PUSH_RESULT.ON, ...over });
      assert.notEqual(model.itemState, PUSH_ITEM_STATE.ON);
      assert.equal(model.result, null, JSON.stringify(over));
    }
  });

  test('자정이 지나 함께 있음이 풀리면 어제의 MUTE_ON 줄이 남지 않는다', () => {
    const next = view({ sub: SUB, lastResult: PUSH_RESULT.MUTE_ON, status: status(YESTERDAY, true) });
    assert.equal(next.showMute, true);
    assert.equal(next.muteOn, false);
    assert.equal(next.result, null);
    assert.equal(view({ sub: SUB, lastResult: PUSH_RESULT.MUTE_ON, status: status(TODAY, true) }).result.key, 'guardian.muteOn');
    assert.equal(view({ sub: SUB, lastResult: PUSH_RESULT.MUTE_OFF, status: status(TODAY, false) }).result.key, 'guardian.muteOff');
    assert.equal(view({ sub: SUB, lastResult: PUSH_RESULT.MUTE_OFF, status: status(TODAY, true) }).result, null);
    // 함께 있음이 없는 자리(켤 수 있음)에는 함께 있음 결과가 없다
    assert.equal(view({ lastResult: PUSH_RESULT.MUTE_ON }).result, null);
  });

  test('끈 뒤에 다른 탭이 다시 켜면 끄기 결과 줄이 받는 중 옆에 남지 않는다', () => {
    for (const result of [PUSH_RESULT.OFF_DONE, PUSH_RESULT.OFF_PENDING, PUSH_RESULT.OFF_UNSENT, PUSH_RESULT.PERMISSION_LOST]) {
      assert.equal(view({ sub: SUB, lastResult: result }).result, null, result);
      assert.equal(view({ lastResult: result }).result?.key, PUSH_RESULT_LINE[result], result);
    }
  });

  test('켜기 실패 뒤에 다른 탭이 켜면(ON) 실패 줄이 없고, 다시 받기·다시 켜기의 실패는 보인다', () => {
    for (const result of FAILURES) {
      assert.equal(view({ sub: SUB, lastResult: result }).result, null, result);
      assert.equal(view({ sub: SUB, moved: true, lastResult: result }).result?.key, PUSH_RESULT_LINE[result], result);
    }
  });

  test('상태 줄과 같은 결과 줄은 한 번만 보인다(검토 M10)', () => {
    assert.equal(view({ swReady: false, lastResult: PUSH_RESULT.SW_NOT_READY }).result, null);
    assert.deepEqual(view({ swReady: false, lastResult: PUSH_RESULT.SW_NOT_READY }).lines, ['guardian.pushSwNotReady']);
    assert.equal(view({ support: PUSH_SUPPORT.DENIED, lastResult: PUSH_RESULT.DENIED }).result, null);
    assert.equal(view({ support: PUSH_SUPPORT.UNSUPPORTED, lastResult: PUSH_RESULT.UNSUPPORTED }).result, null);
    assert.equal(view({ sub: SUB, config: CONFIG_OFF, lastResult: PUSH_RESULT.OFF }).result, null);
    assert.equal(view({ gone: true, lastResult: PUSH_RESULT.GONE }).result, null);
    assert.equal(view({ lastResult: PUSH_RESULT.LOGIN_REQUIRED }, { writable: false }).result, null);
    // 같은 결과라도 상태 줄과 다르면 보인다
    assert.equal(view({ lastResult: PUSH_RESULT.SW_NOT_READY }).result.key, 'guardian.pushSwNotReady');
  });
});

describe('화면이 시작한 동작의 실패 (검토 뒤 보강: 함께 있음 바꾸기, 끄기)', () => {
  const MUTE_FAILURES = [
    PUSH_RESULT.FAILED,
    PUSH_RESULT.LOGIN_REQUIRED,
    PUSH_RESULT.RATE_LIMITED,
    PUSH_RESULT.UNAVAILABLE,
    PUSH_RESULT.NETWORK,
    PUSH_RESULT.READ_ONLY,
    PUSH_RESULT.OFF,
  ];
  const OFF_FAILURES = [PUSH_RESULT.FAILED, PUSH_RESULT.READ_ONLY, PUSH_RESULT.UNAVAILABLE];
  const ON_TODAY = Object.freeze({ date: TODAY, confirmed: [], muted: false, active: true, atMs: 1 });
  const MUTE_FAILED = { key: 'guardian.muteFailed', safety: false, alert: true };
  const OFF_FAILED = { key: 'guardian.pushOffFailed', safety: false, alert: true };

  test('actionForResult: 끝난 동작이 돌려받은 결과가 지금 lastResult 와 같을 때만 그 동작이다', () => {
    const done = (kind, result) => ({ kind, done: true, result });
    assert.equal(actionForResult(null, PUSH_RESULT.NETWORK), null);
    assert.equal(actionForResult(undefined, PUSH_RESULT.NETWORK), null);
    assert.equal(actionForResult({ kind: 'mute', done: false, result: null }, PUSH_RESULT.NETWORK), null, '끝나기 전');
    assert.equal(actionForResult({ kind: 'mute', done: false, result: PUSH_RESULT.NETWORK }, PUSH_RESULT.NETWORK), null, '끝나지 않은 기록은 결과가 같아도 아니다');
    assert.equal(actionForResult(done('mute', PUSH_RESULT.NETWORK), PUSH_RESULT.GONE), null, '그 뒤 조회가 다른 결과를 남김');
    assert.equal(actionForResult(done('mute', PUSH_RESULT.NETWORK), null), null);
    assert.equal(actionForResult(done('mute', PUSH_RESULT.NETWORK), undefined), null);
    assert.equal(actionForResult(done('reload', PUSH_RESULT.NETWORK), PUSH_RESULT.NETWORK), null, '모르는 동작');
    for (const kind of Object.values(PUSH_USER_ACTION)) {
      assert.equal(actionForResult(done(kind, PUSH_RESULT.NETWORK), PUSH_RESULT.NETWORK), kind, kind);
    }
    assert.deepEqual(Object.values(PUSH_USER_ACTION), ['on', 'off', 'mute', 'renew', 'takeOver']);
  });

  test('받는 중에 함께 있음 바꾸기가 실패하면 그 동작의 문구(alert)다', () => {
    for (const lastResult of MUTE_FAILURES) {
      const model = view({ sub: SUB, status: ON_TODAY, lastResult }, { lastAction: PUSH_USER_ACTION.MUTE });
      assert.equal(model.itemState, PUSH_ITEM_STATE.ON, lastResult);
      assert.deepEqual(model.result, MUTE_FAILED, lastResult);
      assert.equal(resultFitsState(lastResult, { itemState: 'ON', switchOn: true, showMute: true, muteOn: false, lastAction: 'mute' }), true, lastResult);
    }
  });

  test('함께 있음 바꾸기 실패가 로그인 필요면 로그인 버튼도 둔다(다른 곳에 없을 때만)', () => {
    const lastResult = PUSH_RESULT.LOGIN_REQUIRED;
    assert.deepEqual(view({ sub: SUB, status: ON_TODAY, lastResult }, { lastAction: 'mute' }).actions, [PUSH_ACTION.LOGIN]);
    assert.deepEqual(view({ sub: SUB, status: ON_TODAY, lastResult }, { lastAction: 'mute', loginElsewhere: true }).actions, []);
  });

  test('같은 실패라도 동작 기록이 없으면(다시 맞추기·조회의 결과) 받는 중에는 줄이 없다', () => {
    for (const lastResult of MUTE_FAILURES) {
      for (const lastAction of [null, undefined, PUSH_USER_ACTION.ON, PUSH_USER_ACTION.RENEW, PUSH_USER_ACTION.TAKE_OVER]) {
        const model = view({ sub: SUB, status: ON_TODAY, lastResult }, { lastAction });
        assert.equal(model.result, null, `${lastResult} ${lastAction}`);
      }
    }
  });

  test('함께 있음 바꾸기의 성공 결과는 앞의 규칙 그대로다', () => {
    const muted = { ...ON_TODAY, muted: true };
    assert.equal(view({ sub: SUB, status: muted, lastResult: PUSH_RESULT.MUTE_ON }, { lastAction: 'mute' }).result.key, 'guardian.muteOn');
    assert.equal(view({ sub: SUB, status: ON_TODAY, lastResult: PUSH_RESULT.MUTE_OFF }, { lastAction: 'mute' }).result.key, 'guardian.muteOff');
  });

  test('함께 있음 바꾸기 뒤 받는 중이 아니게 됐으면 앞의 규칙 그대로다(기간 끝, 다른 기기)', () => {
    assert.equal(view({ gone: true, lastResult: PUSH_RESULT.GONE }, { lastAction: 'mute' }).result, null);
    assert.deepEqual(view({ gone: true, lastResult: PUSH_RESULT.GONE }, { lastAction: 'mute' }).lines, ['guardian.pushGone', 'guardian.pushOpenAppAlerts']);
    assert.equal(view({ sub: SUB, moved: true, lastResult: PUSH_RESULT.NETWORK }, { lastAction: 'mute' }).result.key, 'guardian.pushNetwork');
  });

  test('구독이 남은 채 끄기가 실패하면 그 동작의 문구(alert)다. 받는 중, 쉼, 다시 켜기, 다른 기기 모두', () => {
    const states = [
      [PUSH_ITEM_STATE.ON, {}],
      [PUSH_ITEM_STATE.PAUSED, { config: CONFIG_OFF }],
      [PUSH_ITEM_STATE.RENEW_NEEDED, { renewNeeded: true }],
      [PUSH_ITEM_STATE.MOVED, { moved: true }],
    ];
    for (const [itemState, over] of states) {
      for (const lastResult of OFF_FAILURES) {
        const model = view({ sub: SUB, ...over, lastResult }, { lastAction: PUSH_USER_ACTION.OFF });
        assert.equal(model.itemState, itemState, `${itemState} ${lastResult}`);
        assert.equal(model.switchOn, true);
        assert.deepEqual(model.result, OFF_FAILED, `${itemState} ${lastResult}`);
      }
    }
  });

  test('보기 전용에서 끄기가 막혔으면 끄기 실패 줄과 보기 전용 줄이 함께 있다', () => {
    const model = view({ sub: SUB, lastResult: PUSH_RESULT.READ_ONLY }, { lastAction: 'off', writable: false });
    assert.deepEqual(model.result, OFF_FAILED);
    assert.ok(model.lines.includes('settings.readOnlyNote'));
    const offline = view({ sub: SUB, lastResult: PUSH_RESULT.READ_ONLY }, { lastAction: 'off', writable: false, offline: true });
    assert.deepEqual(offline.result, OFF_FAILED);
    assert.ok(offline.lines.includes('settings.offlineNote'));
  });

  test('끄기가 끝나 구독이 없으면 끄기 결과 줄 그대로다. 구독이 없는데 실패면 앞의 규칙(켜기 기준 문구)이다', () => {
    assert.equal(view({ lastResult: PUSH_RESULT.OFF_DONE }, { lastAction: 'off' }).result.key, 'guardian.pushOffDone');
    assert.equal(view({ lastResult: PUSH_RESULT.OFF_UNSENT }, { lastAction: 'off' }).result.key, 'guardian.pushOffUnsent');
    assert.equal(view({ lastResult: PUSH_RESULT.FAILED }, { lastAction: 'off' }).result.key, 'guardian.pushFailed');
  });

  test('켜기·다시 켜기·다시 받기의 실패는 앞의 규칙 그대로다(받는 중이 아니면 켜기 기준 문구)', () => {
    for (const lastAction of [PUSH_USER_ACTION.ON, PUSH_USER_ACTION.RENEW, PUSH_USER_ACTION.TAKE_OVER]) {
      assert.equal(view({ lastResult: PUSH_RESULT.NETWORK }, { lastAction }).result.key, 'guardian.pushNetwork', lastAction);
      assert.equal(view({ sub: SUB, renewNeeded: true, lastResult: PUSH_RESULT.UNAVAILABLE }, { lastAction }).result.key, 'guardian.pushUnavailable', lastAction);
      assert.equal(view({ sub: SUB, lastResult: PUSH_RESULT.NETWORK }, { lastAction }).result, null, lastAction);
    }
  });

  test('성공이나 끄기 결과에는 동작별 문구를 쓰지 않는다', () => {
    for (const lastResult of [PUSH_RESULT.ON, PUSH_RESULT.MUTE_ON, PUSH_RESULT.MUTE_OFF, PUSH_RESULT.OFF_DONE, PUSH_RESULT.PERMISSION_LOST]) {
      for (const lastAction of ['mute', 'off']) {
        const model = view({ sub: SUB, status: ON_TODAY, lastResult }, { lastAction });
        assert.ok(!['guardian.muteFailed', 'guardian.pushOffFailed'].includes(model.result?.key), `${lastResult} ${lastAction}`);
      }
    }
  });

  test('화면은 다섯 동작을 기록하고, 계정·지켜보기가 바뀌면 지우고, 끝난 결과와 맞을 때만 넘긴다', () => {
    const item = readFileSync(join(ROOT, 'components/guardian/GuardianPushItem.js'), 'utf8');
    assert.match(item, /if \(on\) start\(PUSH_USER_ACTION\.ON, turnOn\);/);
    assert.match(item, /else start\(PUSH_USER_ACTION\.OFF, turnOff\);/);
    assert.match(item, /start\(PUSH_USER_ACTION\.RENEW, renew\)/);
    assert.match(item, /start\(PUSH_USER_ACTION\.TAKE_OVER, takeOver\)/);
    assert.match(item, /onMute=\{\(on\) => start\(PUSH_USER_ACTION\.MUTE, \(\) => mute\(on\)\)\}/);
    assert.match(item, /const scope = JSON\.stringify\(\[status\.accountKey \?\? null, watchId \?\? null\]\);/);
    assert.match(item, /if \(started\.scope !== scope\) setStarted\(\{ scope, record: null \}\);/);
    assert.match(item, /current\.record === entry \? \{ scope: current\.scope, record: \{ \.\.\.entry, done: true, result \} \} : current/);
    assert.match(item, /lastAction: actionForResult\(record, state\.lastResult\),/);
    assert.doesNotMatch(item, /void (turnOn|turnOff|renew|takeOver|mute)\(/);
  });
});

describe('스위치 잠금 (검토 M2·M3·M17, 포커스를 지키는 잠금)', () => {
  test('잠금이면 disabled 대신 aria-disabled 이고 누름을 막는다. 막힘이면 disabled 다', () => {
    assert.deepEqual(switchControlProps({ disabled: true, locked: true }), { disabled: false, ariaDisabled: 'true', blockClick: true, ignore: true });
    assert.deepEqual(switchControlProps({ disabled: false, locked: true }), { disabled: false, ariaDisabled: 'true', blockClick: true, ignore: true });
    assert.deepEqual(switchControlProps({ disabled: true, locked: false }), { disabled: true, ariaDisabled: undefined, blockClick: false, ignore: true });
    assert.deepEqual(switchControlProps({ disabled: false, locked: false }), { disabled: false, ariaDisabled: undefined, blockClick: false, ignore: false });
  });

  test('부품은 두 스위치 모두 모델의 잠금을 넘기고 그 값으로 그린다', () => {
    const source = readFileSync(join(ROOT, 'components/guardian/GuardianPushItemView.js'), 'utf8');
    assert.match(source, /locked=\{model\.switchLocked\}/);
    assert.match(source, /locked=\{model\.muteLocked\}/);
    const row = source.slice(source.indexOf('function SwitchRow('), source.indexOf('\n}\n', source.indexOf('function SwitchRow(')));
    assert.match(row, /switchControlProps\(\{ disabled, locked \}\)/);
    assert.match(row, /disabled=\{control\.disabled\}/);
    assert.match(row, /aria-disabled=\{control\.ariaDisabled\}/);
    assert.match(row, /if \(control\.blockClick\) event\.preventDefault\(\);/);
    assert.match(row, /if \(control\.ignore\) return;/);
    assert.doesNotMatch(row, /disabled=\{disabled/);
  });

  test('safety 결과 줄은 두 언어로 그린다(검토 M12)', () => {
    const source = readFileSync(join(ROOT, 'components/guardian/GuardianPushItemView.js'), 'utf8');
    const block = (name) => source.slice(source.indexOf(`function ${name}(`), source.indexOf('\n}\n', source.indexOf(`function ${name}(`)));
    assert.match(block('ResultLine'), /if \(result\.safety\) return <SafetyPair messageKey=\{result\.key\} \/>;/);
    const pair = block('SafetyPair');
    assert.match(pair, /text\.primary\.text/);
    assert.match(pair, /text\.secondary\.text/);
  });

  test('누른 부품이 사라지면 포커스를 항목 이름으로 옮길 자리가 있다(검토 Minor 3, 동작 확인은 e2e)', () => {
    const source = readFileSync(join(ROOT, 'components/guardian/GuardianPushItemView.js'), 'utf8');
    assert.match(source, /<h3 id=\{titleId\} ref=\{headingRef\} tabIndex=\{-1\} className="guardian-push-heading">/);
    assert.match(source, /inputRef=\{switchRef\}/);
    assert.match(source, /if \(!focused \|\| focused\.isConnected\) return;/);
    assert.match(source, /if \(active && active !== document\.body\) return;/);
    assert.match(source, /\(headingRef\.current \?\? switchRef\.current\)\?\.focus\(\);/);
  });

  test('보기 전용 로그인 버튼은 기기 알림 스위치와 같은 기준으로 한 번만(검토 Minor 2)', () => {
    const item = readFileSync(join(ROOT, 'components/guardian/GuardianPushItem.js'), 'utf8');
    assert.match(item, /loginElsewhere: shouldShowReadOnly\(status\) && status\.reason !== READ_ONLY_REASON\.OFFLINE,/);
    const toggle = readFileSync(join(ROOT, 'components/guardian/AlertsToggleView.js'), 'utf8');
    assert.match(toggle, /\{showReadOnly && !offline && \(/);
  });
});

describe('복귀 확인 (정한 값 15)', () => {
  const STATUS = Object.freeze({ date: '2026-11-16', confirmed: ['18:00', '21:30'], muted: false, active: true, atMs: 1 });

  test('confirmedFor 는 조회 날짜가 줄 날짜와 다르면 거짓이다', () => {
    assert.equal(confirmedFor({ date: '2026-11-16', by: '18:00' }, STATUS), true);
    assert.equal(confirmedFor({ date: '2026-11-15', by: '18:00' }, STATUS), false);
    assert.equal(confirmedFor({ date: '2026-11-17', by: '18:00' }, STATUS), false);
  });

  test('confirmedFor 는 그 마감이 confirmed 에 있을 때만 참이고 깨진 입력은 거짓이다', () => {
    assert.equal(confirmedFor({ date: '2026-11-16', by: '19:00' }, STATUS), false);
    assert.equal(confirmedFor({ date: '2026-11-16', by: '18:00' }, null), false);
    assert.equal(confirmedFor({ date: '2026-11-16', by: '18:00' }, undefined), false);
    assert.equal(confirmedFor({ date: '2026-11-16', by: '18:00' }, { ...STATUS, confirmed: 'x' }), false);
    assert.equal(confirmedFor({ date: '2026-11-16', by: '18:00' }, { ...STATUS, date: 'bad' }), false);
    assert.equal(confirmedFor(null, STATUS), false);
    assert.equal(confirmedFor({ date: '2026-11-16' }, STATUS), false);
  });
});

describe('문구 (Global Constraints, 정한 값 25)', () => {
  const MESSAGE_KEYS = [
    'guardian.pushTitle',
    'guardian.pushIntro',
    'guardian.pushConsentStored',
    'guardian.pushWorking',
    'guardian.pushOn',
    'guardian.pushOffDone',
    'guardian.pushPaused',
    'guardian.pushUnsupported',
    'guardian.pushIosTitle',
    ...IOS_STEP_KEYS,
    'guardian.pushIosNote',
    'guardian.pushIosOld',
    'guardian.pushDenied',
    'guardian.pushSwNotReady',
    'guardian.pushReload',
    'guardian.pushRenew',
    'guardian.pushRenewButton',
    'guardian.pushMoved',
    'guardian.pushMovedNote',
    'guardian.pushMovedButton',
    'guardian.pushGone',
    'guardian.pushOpenAppAlerts',
    'guardian.pushLogin',
    'guardian.pushLimit',
    'guardian.pushUnavailable',
    'guardian.pushNetwork',
    'guardian.pushFailed',
    'guardian.pushPermissionLost',
    'guardian.muteTitle',
    'guardian.muteHelp',
    'guardian.muteMidnight',
    'guardian.muteOn',
    'guardian.muteOff',
    'guardian.muteFailed',
    'guardian.pushOffFailed',
    'guardian.confirmedTag',
    'guardian.statusAsOf',
  ];
  // 계획의 safety 넷과 실행기 결과 OFF_UNSENT 의 줄(알림이 올 수 있다는 문장)
  const SAFETY_KEYS = [
    'guardian.pushNoGuarantee',
    'guardian.pushLocation',
    'guardian.confirmedHelp',
    'guardian.pushOffPending',
    'guardian.pushOffUnsent',
  ];

  test('새 문구는 네 언어가 있고 safety 키(넷과 OFF_UNSENT 줄)는 safety 블록에 있으며 어느 언어에도 안전합니다가 없다', () => {
    for (const key of MESSAGE_KEYS) {
      assert.ok(guardianMessages[key], `${key} 는 messages 에 있다`);
      assert.equal(guardianSafety[key], undefined, `${key} 는 safety 가 아니다`);
    }
    for (const key of SAFETY_KEYS) {
      assert.ok(guardianSafety[key], `${key} 는 safety 에 있다`);
      assert.equal(guardianMessages[key], undefined, `${key} 는 messages 가 아니다`);
    }
    for (const key of [...MESSAGE_KEYS, ...SAFETY_KEYS]) {
      const entry = guardianMessages[key] ?? guardianSafety[key];
      for (const lang of LANGS) {
        assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
        assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
        assert.ok(!/[\u2013\u2014]/.test(entry[lang]), `${key}.${lang} 에 엠대시·엔대시가 없다`);
      }
      assert.ok(!/안전합니다|안전해요|안전하다/.test(entry.ko), `${key}.ko`);
      assert.ok(!/\bsafe\b/i.test(entry.en), `${key}.en`);
      assert.ok(!/安全/.test(entry.ja) && !/安全/.test(entry.zh), `${key}.ja·zh`);
    }
  });

  test('계획의 한국어·영어 문구 그대로다(대표 몇 줄)', () => {
    assert.equal(guardianMessages['guardian.pushTitle'].ko, '앱이 닫혀 있어도 받기');
    assert.equal(guardianMessages['guardian.pushTitle'].en, 'Get alerts even when the app is closed');
    assert.equal(
      guardianSafety['guardian.confirmedHelp'].ko,
      "환자가 '돌아왔어요'를 눌렀어요. 앱은 위치를 모르기 때문에 실제로 돌아왔는지는 알 수 없어요. 걱정되면 환자에게 직접 연락해 주세요.",
    );
    assert.equal(guardianSafety['guardian.pushLocation'].ko, '앱은 위치를 모릅니다. 환자가 누른 확인만 전달합니다.');
    assert.equal(guardianMessages['guardian.statusAsOf'].ko, '{time}에 서버에서 확인한 내용이에요.');
    assert.equal(guardianMessages['guardian.muteTitle'].en, 'Together today');
  });

  test('아이폰 4단계의 받은 일정 보기는 today.receivedAction 과 같은 말이고, 5단계는 항목 이름과 같은 말이다', () => {
    for (const lang of LANGS) {
      const step4 = guardianMessages['guardian.pushIosStep4'][lang];
      const step5 = guardianMessages['guardian.pushIosStep5'][lang];
      assert.ok(step4.includes(todayMessages['today.receivedAction'][lang]), `step4.${lang}`);
      assert.ok(step5.includes(guardianMessages['guardian.pushTitle'][lang]), `step5.${lang}`);
    }
  });

  test('복귀 확인 꼬리표는 누른 사실만 말한다(검토 I2): 영어·일본어·중국어는 돌아왔다고 단정하지 않는다', () => {
    const tag = guardianMessages['guardian.confirmedTag'];
    assert.equal(tag.ko, '복귀 확인');
    assert.equal(tag.en, 'Tapped “I’m back”');
    assert.equal(tag.ja, '「戻りました」の連絡あり');
    assert.equal(tag.zh, '已点“我已返回”');
    assert.doesNotMatch(tag.en, /confirmed/i);
  });

  test('새 영어 문구는 기존 /g 줄처럼 the patient 라고 쓰고, 새 일본어 문구는 患者さん, 새 중국어 문구는 点按과 通知接收地址를 쓴다', () => {
    for (const key of [...MESSAGE_KEYS, ...SAFETY_KEYS]) {
      const entry = guardianMessages[key] ?? guardianSafety[key];
      assert.doesNotMatch(entry.en, /companion/i, `${key}.en`);
      assert.doesNotMatch(entry.ja, /患者(?!さん)/, `${key}.ja`);
      assert.doesNotMatch(entry.zh, /点击|提醒地址/, `${key}.zh`);
    }
    assert.equal(guardianMessages['guardian.muteTitle'].ja, '今日は同行中');
    assert.equal(guardianMessages['guardian.muteTitle'].zh, '今天陪同中');
    // 함께 있음 바꾸기 실패는 스위치가 안 보일 때도 읽히도록 스위치 이름을 담는다. 약속 없이 다시 시도만 권한다
    for (const lang of LANGS) {
      assert.ok(guardianMessages['guardian.muteFailed'][lang].includes(guardianMessages['guardian.muteTitle'][lang]), `muteFailed.${lang}`);
    }
    assert.equal(guardianMessages['guardian.muteFailed'].ko, '오늘 함께 있음을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    assert.equal(guardianMessages['guardian.pushOffFailed'].ko, '끄지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    assert.equal(guardianSafety['guardian.pushLocation'].zh, '应用无法获知任何人的位置，只转达患者点按的确认。');
  });

  test('복귀 확인 안내는 환자가 누른 것만 말하고 돌아왔다고 단정하지 않는다', () => {
    const help = guardianSafety['guardian.confirmedHelp'];
    assert.match(help.ko, /알 수 없어요/);
    assert.match(help.en, /cannot tell/);
    // 줄에서 연락 안내가 빠지므로 안내가 직접 연락을 권한다
    assert.match(help.ko, /직접 연락해 주세요/);
    assert.match(help.en, /contact the patient directly/);
    // 꼬리표 혼자 쓰이지 않게 안내 키가 safety 에 있다(두 언어 병기)
    assert.ok(guardianSafety['guardian.confirmedHelp']);
  });
});

describe('부품 경계 (components/AGENTS.md, 시안 보드 경계와 같은 기준)', () => {
  const dir = join(ROOT, 'components');
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const importsOf = (source) => [...source.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g)].map((m) => ({ clause: m[1] ?? '', spec: m[2] }));

  test('표시 부품과 표시 규칙은 저장소·실행기 훅을 불러오지 않는다', () => {
    for (const rel of ['components/guardian/GuardianPushItemView.js', 'components/guardian/guardianPushView.js']) {
      for (const { clause, spec } of importsOf(read(rel))) {
        assert.ok(!/lib\/store/.test(spec), `${rel}: ${spec}`);
        assert.ok(!/useGuardianPush|lib\/notify\/client/.test(spec), `${rel}: ${spec}`);
        assert.ok(!/\b(usePrefs|useStoreStatus|getStore|useGuardianPush|getGuardianPush)\b/.test(clause), `${rel}: ${clause}`);
      }
    }
  });

  test('실행기 훅(useGuardianPush)을 부르는 화면 파일은 GuardianPushItem.js 하나다', () => {
    const files = [];
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.js')) files.push(p);
      }
    };
    walk(dir);
    walk(join(ROOT, 'app'));
    const users = files
      .filter((file) => /\buseGuardianPush\b/.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
      .map((file) => file.slice(ROOT.length + 1));
    assert.deepEqual(users, ['components/guardian/GuardianPushItem.js']);
  });
});
