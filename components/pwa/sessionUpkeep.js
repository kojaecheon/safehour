// 세션 유지: 화면으로 돌아오면 로그인 상태를 다시 묻는다 (AX-319 · docs/platform/IA_AND_FLOWS.md '보기 전용 상태', docs/security.md '인증')
//
// 앱 셸(AppShell)은 처음 한 번만 세션을 묻는다. 설치한 앱은 몇 시간씩 열린 채 백그라운드에 있으므로,
// 창에 다시 초점이 오거나(focus) 화면이 다시 보이면(visibilitychange) 저장소 refreshSession() 을 다시 부른다.
//   - 세션 만료 → 보기 전용 배너, 오프라인에서 돌아옴 → 보기 전용 해제, 보류 중인 로그아웃 재전송은
//     모두 저장소가 판단한다(lib/store). 여기서는 부르는 때만 정한다.
//   - 초점·보임은 minIntervalMs(기본 1분)에 한 번만 부른다. 다시 온라인이 되면(online) 바로 부른다.
//   - 가려진(hidden) 동안은 부르지 않는다.
//
// 브라우저 API 는 주입한다 — node --test 에서 그대로 검증한다.

export const SESSION_UPKEEP_MIN_INTERVAL_MS = 60 * 1000;

/**
 * @param {object} options
 * @param {() => unknown} options.refresh  세션을 다시 묻는 함수 (getStore().refreshSession)
 * @param {() => number} [options.now]
 * @param {number} [options.minIntervalMs]
 * @param {number} [options.lastRefreshAt]  마지막으로 물은 시각 — 셸이 방금 물었으면 그 시각
 * @returns {(reason: 'focus'|'visible'|'online') => boolean}  이번에 불렀는가
 */
export function createSessionUpkeep({
  refresh,
  now = () => Date.now(),
  minIntervalMs = SESSION_UPKEEP_MIN_INTERVAL_MS,
  lastRefreshAt = Number.NEGATIVE_INFINITY,
}) {
  let last = lastRefreshAt;
  return function trigger(reason) {
    const at = now();
    if (reason !== 'online' && at - last < minIntervalMs) return false;
    last = at;
    try {
      const result = refresh();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // 저장소가 오프라인 보기 전용으로 바꿔 둔다
    }
    return true;
  };
}

/**
 * 창·문서 이벤트에 연결한다.
 * @param {Window} win
 * @param {(reason: 'focus'|'visible'|'online') => void} trigger
 * @param {() => void} [onVisible]  다시 보일 때마다(조절 없이) 부를 일 — 밀린 알림 확인
 * @returns {() => void} 연결 해제
 */
export function attachSessionUpkeep(win, trigger, onVisible = () => {}) {
  const doc = win.document;
  const visible = () => doc.visibilityState !== 'hidden';
  const onFocus = () => {
    if (visible()) trigger('focus');
  };
  const onVisibility = () => {
    if (!visible()) return;
    onVisible();
    trigger('visible');
  };
  const onOnline = () => trigger('online');
  win.addEventListener('focus', onFocus);
  win.addEventListener('online', onOnline);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('online', onOnline);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
