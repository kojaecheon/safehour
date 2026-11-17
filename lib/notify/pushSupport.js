// 보호자 서버 알림 지원 판별 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md 정한 값 24, Task 5)
//
// 이 기기에서 '앱이 닫혀 있어도 받기'를 켤 수 있는지 다섯 가지로 가른다.
//   - 권한이 denied 면 DENIED(설치 여부와 무관하다)
//   - 서비스 워커, PushManager, Notification 이 모두 있으면 READY(macOS Safari 와 16.4 이상 아이폰 홈 화면 앱 포함)
//   - 하나라도 없고 navigator.standalone 이 불리언이면(iOS·iPadOS Safari 계열) 설치 안 됨은 IOS_NEEDS_INSTALL,
//     설치됨은 IOS_TOO_OLD(16.3 이하 홈 화면 앱)
//   - 그 밖은 UNSUPPORTED(인앱 브라우저 포함, 화면 문구가 Safari 로 열라고 안내한다)
//
// 사용자 에이전트 문자열을 읽지 않는다. 위치 같은 기기 값도 읽지 않는다.
// 설치 여부는 화면이 components/pwa/installState.js 의 readInstalled 로 넘긴다. 넘기지 않으면 navigator.standalone 이 참인가로
// 본다(lib/notify 는 components 를 불러올 수 없다). 설치 여부가 갈림을 바꾸는 것은 standalone 이 불리언인 iOS 계열뿐이고, 거기서
// 홈 화면 앱은 navigator.standalone 이 참이라 두 값이 같다.
//
// 순수 함수다. 브라우저 전역은 넘겨받은 창으로만 읽고, 읽다가 던지면 UNSUPPORTED 다.

export const PUSH_SUPPORT = Object.freeze({
  READY: 'READY',
  IOS_NEEDS_INSTALL: 'IOS_NEEDS_INSTALL',
  IOS_TOO_OLD: 'IOS_TOO_OLD',
  UNSUPPORTED: 'UNSUPPORTED',
  DENIED: 'DENIED',
});

/**
 * @param {{ hasServiceWorker?: boolean, hasPushManager?: boolean, hasNotification?: boolean, permission?: string|null,
 *   standaloneKnown?: boolean, installed?: boolean }} [signals]
 * @returns {string} PUSH_SUPPORT 값
 */
export function pushSupport({
  hasServiceWorker = false,
  hasPushManager = false,
  hasNotification = false,
  permission = null,
  standaloneKnown = false,
  installed = false,
} = {}) {
  if (permission === 'denied') return PUSH_SUPPORT.DENIED;
  if (hasServiceWorker === true && hasPushManager === true && hasNotification === true) return PUSH_SUPPORT.READY;
  if (standaloneKnown === true) return installed === true ? PUSH_SUPPORT.IOS_TOO_OLD : PUSH_SUPPORT.IOS_NEEDS_INSTALL;
  return PUSH_SUPPORT.UNSUPPORTED;
}

/**
 * 창에서 지원 신호만 읽어 판별한다.
 * @param {{ navigator?: object, PushManager?: unknown, Notification?: { permission?: string } } | undefined} win
 * @param {{ installed?: boolean }} [options]  installed 를 넘기지 않으면 navigator.standalone === true 로 본다
 * @returns {string} PUSH_SUPPORT 값
 */
export function readPushSupport(win, { installed } = {}) {
  try {
    if (!win) return PUSH_SUPPORT.UNSUPPORTED;
    const nav = win.navigator ?? null;
    const NotificationImpl = typeof win.Notification === 'function' ? win.Notification : null;
    const standalone = nav ? nav.standalone : undefined;
    return pushSupport({
      hasServiceWorker: Boolean(nav) && 'serviceWorker' in nav && Boolean(nav.serviceWorker),
      hasPushManager: typeof win.PushManager === 'function',
      hasNotification: NotificationImpl !== null,
      permission: NotificationImpl ? NotificationImpl.permission ?? null : null,
      standaloneKnown: typeof standalone === 'boolean',
      installed: typeof installed === 'boolean' ? installed : standalone === true,
    });
  } catch {
    return PUSH_SUPPORT.UNSUPPORTED;
  }
}
