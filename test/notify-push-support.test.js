// 보호자 서버 알림 지원 판별 (lib/notify/pushSupport.js · docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md 정한 값 24, Task 5)
//
// 이 파일이 고정하는 것
//   - 사용자 에이전트 문자열을 읽지 않는다. 권한, 서비스 워커·PushManager·Notification 이 있는가, navigator.standalone 이
//     불리언인가(iOS·iPadOS Safari 계열), 설치됐는가만 본다
//   - 권한이 denied 면 DENIED. API 가 모두 있으면 READY(macOS Safari 포함). 하나라도 없고 standalone 이 불리언이면 설치 안 됨은
//     IOS_NEEDS_INSTALL, 설치됨은 IOS_TOO_OLD. 그 밖(인앱 브라우저 포함)은 UNSUPPORTED
//   - readPushSupport 는 창에서 그 신호만 읽는다. 설치 여부는 화면이 넘기고, 넘기지 않으면 navigator.standalone 이 참인가로 본다
//
// 순수 함수다. 브라우저 전역은 가짜 창으로만 넘긴다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { PUSH_SUPPORT, pushSupport, readPushSupport } from '../lib/notify/pushSupport.js';

const ALL = Object.freeze({ hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default' });

/** 가짜 창: 주지 않은 API 는 없다 */
function fakeWin({ serviceWorker = true, pushManager = true, notification = 'default', standalone } = {}) {
  const navigator = {};
  if (serviceWorker) navigator.serviceWorker = { getRegistration: async () => null };
  if (standalone !== undefined) navigator.standalone = standalone;
  const win = { navigator };
  if (pushManager) win.PushManager = function PushManager() {};
  if (notification !== null) {
    const NotificationImpl = function Notification() {};
    NotificationImpl.permission = notification;
    win.Notification = NotificationImpl;
  }
  return win;
}

describe('pushSupport', () => {
  test('아이폰 Safari 탭(standalone 거짓, PushManager 없음)은 IOS_NEEDS_INSTALL', () => {
    assert.equal(
      pushSupport({ hasServiceWorker: true, hasPushManager: false, hasNotification: false, permission: null, standaloneKnown: true, installed: false }),
      PUSH_SUPPORT.IOS_NEEDS_INSTALL,
    );
    assert.equal(readPushSupport(fakeWin({ pushManager: false, notification: null, standalone: false })), PUSH_SUPPORT.IOS_NEEDS_INSTALL);
  });

  test('홈 화면 앱인데 PushManager 가 없으면(iOS 16.3) IOS_TOO_OLD', () => {
    assert.equal(
      pushSupport({ hasServiceWorker: true, hasPushManager: false, hasNotification: false, permission: null, standaloneKnown: true, installed: true }),
      PUSH_SUPPORT.IOS_TOO_OLD,
    );
    // 설치 여부를 넘기지 않으면 navigator.standalone 이 참인가로 본다
    assert.equal(readPushSupport(fakeWin({ pushManager: false, notification: null, standalone: true })), PUSH_SUPPORT.IOS_TOO_OLD);
    // 화면이 넘긴 설치 여부가 앞선다(components/pwa/installState.js readInstalled)
    assert.equal(
      readPushSupport(fakeWin({ pushManager: false, notification: null, standalone: false }), { installed: true }),
      PUSH_SUPPORT.IOS_TOO_OLD,
    );
  });

  test('macOS Safari 처럼 standalone 속성이 있어도 API 가 모두 있으면 READY 다', () => {
    assert.equal(pushSupport({ ...ALL, standaloneKnown: true, installed: false }), PUSH_SUPPORT.READY);
    assert.equal(pushSupport({ ...ALL, standaloneKnown: true, installed: true }), PUSH_SUPPORT.READY);
    assert.equal(readPushSupport(fakeWin({ standalone: false })), PUSH_SUPPORT.READY);
    // 아이폰 홈 화면 앱(16.4 이상)도 API 가 모두 있으면 READY
    assert.equal(readPushSupport(fakeWin({ standalone: true, notification: 'granted' })), PUSH_SUPPORT.READY);
    // 크롬·파이어폭스처럼 standalone 속성이 없어도 READY
    assert.equal(readPushSupport(fakeWin()), PUSH_SUPPORT.READY);
  });

  test('standalone 속성도 PushManager 도 없으면(인앱 브라우저) UNSUPPORTED', () => {
    assert.equal(
      pushSupport({ hasServiceWorker: true, hasPushManager: false, hasNotification: true, permission: 'default', standaloneKnown: false, installed: false }),
      PUSH_SUPPORT.UNSUPPORTED,
    );
    assert.equal(readPushSupport(fakeWin({ pushManager: false })), PUSH_SUPPORT.UNSUPPORTED);
    assert.equal(readPushSupport(fakeWin({ serviceWorker: false })), PUSH_SUPPORT.UNSUPPORTED);
    assert.equal(readPushSupport(fakeWin({ notification: null })), PUSH_SUPPORT.UNSUPPORTED);
    // 창이 없거나(서버 렌더링) 읽다 던지면 UNSUPPORTED
    assert.equal(readPushSupport(undefined), PUSH_SUPPORT.UNSUPPORTED);
    const throwing = {
      get navigator() {
        throw new Error('blocked');
      },
    };
    assert.equal(readPushSupport(throwing), PUSH_SUPPORT.UNSUPPORTED);
    assert.equal(pushSupport(), PUSH_SUPPORT.UNSUPPORTED);
  });

  test('권한이 denied 면 설치 여부와 무관하게 DENIED', () => {
    for (const standaloneKnown of [true, false]) {
      for (const installed of [true, false]) {
        assert.equal(pushSupport({ ...ALL, permission: 'denied', standaloneKnown, installed }), PUSH_SUPPORT.DENIED);
        assert.equal(
          pushSupport({ hasServiceWorker: true, hasPushManager: false, hasNotification: true, permission: 'denied', standaloneKnown, installed }),
          PUSH_SUPPORT.DENIED,
        );
      }
    }
    assert.equal(readPushSupport(fakeWin({ notification: 'denied', standalone: true })), PUSH_SUPPORT.DENIED);
  });

  test('사용자 에이전트를 읽지 않는다', () => {
    const win = fakeWin({ pushManager: false, notification: null, standalone: false });
    Object.defineProperty(win.navigator, 'userAgent', {
      get() {
        throw new Error('userAgent 를 읽었다');
      },
    });
    assert.equal(readPushSupport(win), PUSH_SUPPORT.IOS_NEEDS_INSTALL);
    assert.deepEqual(Object.keys(PUSH_SUPPORT).sort(), ['DENIED', 'IOS_NEEDS_INSTALL', 'IOS_TOO_OLD', 'READY', 'UNSUPPORTED']);
    assert.ok(Object.isFrozen(PUSH_SUPPORT));
  });
});
