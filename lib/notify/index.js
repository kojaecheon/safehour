// 기기 알림, 공개 진입점 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md)
//
//   planNotifications(dayPlan, { nowMs })   하루 일정 → 알림 예약 (순수 함수)
//   notificationText(item, lang)             예약 항목 → { title, body, lang } (조건·병원·복약 정보 없음)
//   createNotifier({ store, deliver })       앱이 연 동안 예약 시각에 기기 알림·앱 안 배너를 낸다
//   deliverToDevice(item, { store })         설정·권한을 확인하고 기기 알림 한 장을 낸다 (권한 요청은 안 한다)
//   getNotifier()                            브라우저 기본 실행기 (서버에서는 null)
//
// 앱 안 배너 부품은 components/pwa/NotificationBanner.js 다.

export {
  NOTIFY_ITEM_FIELDS,
  NOTIFY_KIND,
  NOTIFY_TEXT_KEY,
  SAME_TIME_GRACE_MIN,
  planNotifications,
} from './schedule.js';
export { NOTIFY_TITLE_KEY, notificationText } from './text.js';
export { NOTIFIER_MAX_WAIT_MS, createNotifier } from './runtime.js';
export { NOTIFICATION_ICON, NOTIFICATION_OPEN_URL, deliverToDevice } from './device.js';
export { getNotifier } from './client.js';
