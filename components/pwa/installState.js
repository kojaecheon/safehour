// 홈 화면에 설치된 앱으로 열렸는지 가리는 순수 함수 (S5)
//
// 설치된 앱은 두 가지 신호 중 하나를 준다.
//   - display-mode: standalone 미디어 쿼리가 참이다 (안드로이드 크롬·데스크톱·최신 사파리)
//   - navigator.standalone 이 true 다 (iOS 사파리에서 홈 화면에 추가한 앱)
// 화면은 이 함수에 읽은 값만 넘긴다. 기기 값을 직접 읽는 일은 readInstalled 하나가 한다.

/**
 * @param {{ standaloneMatch?: boolean | null, navigatorStandalone?: boolean | null }} [signals]
 * @returns {boolean} 설치된 앱으로 열렸으면 true. 신호가 없으면 false(설치 안 됨)다.
 */
export function isInstalledApp({ standaloneMatch = false, navigatorStandalone = false } = {}) {
  return standaloneMatch === true || navigatorStandalone === true;
}

/**
 * 브라우저에서 두 신호를 읽어 isInstalledApp 에 넘긴다. 읽지 못하면 설치 안 됨으로 본다.
 * 위치 같은 기기 값은 읽지 않는다.
 * @param {{ matchMedia?: Function, navigator?: { standalone?: boolean } } | undefined} [win]
 */
export function readInstalled(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return false;
  let standaloneMatch = false;
  try {
    standaloneMatch = Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);
  } catch {
    standaloneMatch = false;
  }
  return isInstalledApp({ standaloneMatch, navigatorStandalone: win.navigator?.standalone === true });
}
