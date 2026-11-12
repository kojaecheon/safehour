// 서비스 워커 등록 (AX-319 · docs/platform/IA_AND_FLOWS.md '보기 전용 상태')
//
// public/sw.js 를 사이트 전체 범위('/')로 등록한다. 운영 빌드에서만 부른다(PwaRuntime) —
// 개발 서버에서 캐시가 끼면 수정한 화면이 안 보이는 혼란이 생긴다.
// 지원하지 않는 브라우저·등록 실패는 조용히 넘긴다(앱은 그대로 온라인에서 동작한다).

export const SERVICE_WORKER_URL = '/sw.js';
export const SERVICE_WORKER_SCOPE = '/';

/**
 * @param {Window} win
 * @returns {() => void} 대기 중인 load 연결 해제
 */
export function registerServiceWorker(win) {
  const container = win?.navigator?.serviceWorker;
  if (!container || typeof container.register !== 'function') return () => {};
  const register = () => {
    container.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE }).catch(() => {});
  };
  // 첫 화면을 그리는 데 방해되지 않게 load 뒤에 등록한다
  if (win.document?.readyState === 'complete') {
    register();
    return () => {};
  }
  win.addEventListener('load', register, { once: true });
  return () => win.removeEventListener('load', register);
}
