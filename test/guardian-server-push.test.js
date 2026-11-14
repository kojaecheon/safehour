// 보호자 링크 동의 화면의 서버 알림 선택 항목 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 8, D6·D12·D14)
//
// 화면(components/guardian/GuardianCreate.js)이 쓰는 순수 규칙(components/guardian/serverPush.js)과 문구를 고정한다.
//   - 항목은 스위치가 켜져 있고 출국일이 오늘 이후일 때만 보인다(꺼져 있으면 화면은 예전과 같다)
//   - 처음 체크 상태는 ON 일 때만 켜짐(다르게 정한 것 20), REPLACED 는 꺼짐에서 시작해 체크하면 다시 등록한다
//   - 체크를 끄고 만들면 있는 지켜보기를 끄고, 항목이 숨어 있으면 건드리지 않는다
//   - 등록 실패는 링크를 막지 않고 이유별 결과 줄 하나를 보인다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVER_PUSH_ACTION,
  SERVER_PUSH_CONSENT_KEYS,
  serverPushInitialChecked,
  serverPushOptionVisible,
  serverPushResultKeys,
  serverPushSubmitPlan,
} from '../components/guardian/serverPush.js';
import { messages as guardianMessages, safety as guardianSafety } from '../src/i18n/messages/guardian.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';

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

  test('보관 기간·저장 위치 빈칸은 확인 결과로 채웠다(다르게 정한 것 19)', () => {
    assert.match(guardianMessages['guardian.serverPushRetention'].ko, /출국 7일 뒤 자동 삭제/);
    assert.match(guardianMessages['guardian.serverPushRetention'].ko, /3일 안에/);
    assert.match(guardianMessages['guardian.serverPushLocation'].ko, /일본 도쿄/);
    assert.match(guardianMessages['guardian.serverPushLocation'].ko, /유럽 또는 미국/);
    assert.equal(guardianMessages['guardian.serverPushLogin'].ko, '서버 알림은 Google 또는 카카오로 로그인해야 켤 수 있어요.');
  });
});
