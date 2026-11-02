// 설치·오프라인·알림 부품 모음 (AX-319 · spec 4.13 · 4.18)
//
//   PwaRuntime          app/layout.js 가 한 번 단다 — 서비스 워커 등록, 세션 유지, 알림 배너
//   NotificationBanner  앱 안 알림 배너. PwaRuntime 이 이미 달고 있으니 화면이 다시 달지 않는다
//   예약 계산·기기 알림은 lib/notify 에 있다.

export { default as PwaRuntime } from './PwaRuntime.js';
export { default as NotificationBanner } from './NotificationBanner.js';
export { SERVICE_WORKER_SCOPE, SERVICE_WORKER_URL, registerServiceWorker } from './registerServiceWorker.js';
export { SESSION_UPKEEP_MIN_INTERVAL_MS, attachSessionUpkeep, createSessionUpkeep } from './sessionUpkeep.js';
