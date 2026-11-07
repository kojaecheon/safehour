// 기기 알림 한 장 내기 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md)
//
// - 사용자가 설정에서 알림을 켰고(prefs.notifications) 권한이 이미 '허용'일 때만 낸다.
//   **권한을 여기서 요청하지 않는다.** 요청은 설정 화면에서 켤 때만 한다(docs/business-rules.md '알림과 카드').
// - 활성 서비스 워커가 있으면 registration.showNotification 으로 낸다(안드로이드 크롬은 생성자를 막는다).
//   없거나 아직 설치 중이면(개발 모드·첫 방문 직후) Notification 생성자로 낸다.
// - 문구는 text.js 의 notificationText 만 쓴다 — 제목·본문에 조건·병원·복약 정보가 없다.
//   알림에 붙는 값은 제목·본문·언어·태그(예약 id)·아이콘·열 화면(/today, 보호자 알림은 /g)뿐이다.
// - 실패는 false 로 돌려준다. 앱 안 배너는 실행기(runtime.js)가 따로 띄운다.
//
// 브라우저 API 는 모두 주입할 수 있다 — node --test 에서 그대로 검증한다.

import { normalizeLang } from '../../src/i18n/index.js';
import { NOTIFY_KIND } from './schedule.js';
import { notificationText } from './text.js';

export const NOTIFICATION_ICON = '/icons/icon-192.png';
export const NOTIFICATION_OPEN_URL = '/today';
export const NOTIFICATION_GUARDIAN_OPEN_URL = '/g';

/** 알림을 눌렀을 때 열 화면: 보호자 알림은 받은 일정(/g), 그 밖은 오늘 일정 */
export function notificationOpenUrl(item) {
  return item?.kind === NOTIFY_KIND.COMPANION_RETURN_PASSED ? NOTIFICATION_GUARDIAN_OPEN_URL : NOTIFICATION_OPEN_URL;
}

/**
 * @param {{id: string, key: string, time: string}} item  planNotifications 의 항목
 * @param {object} env
 * @param {{readPrefs: Function, readLang: Function}} env.store
 * @param {Navigator | undefined} [env.nav]
 * @param {typeof Notification | undefined} [env.NotificationImpl]
 * @returns {Promise<boolean>} 기기 알림을 냈는가
 */
export async function deliverToDevice(
  item,
  { store, nav = globalThis.navigator, NotificationImpl = globalThis.Notification } = {},
) {
  if (store?.readPrefs?.().notifications !== true) return false;
  if (typeof NotificationImpl !== 'function' || NotificationImpl.permission !== 'granted') return false;
  const lang = store.readLang?.() ?? normalizeLang(nav?.language);
  const text = notificationText(item, lang);
  if (!text) return false;
  const options = {
    body: text.body,
    lang: text.lang,
    tag: item.id,
    icon: NOTIFICATION_ICON,
    data: { url: notificationOpenUrl(item) },
  };
  try {
    // 설치 중(아직 활성 전)인 워커로는 낼 수 없다 — 그때는 생성자로 낸다
    const registration = await nav?.serviceWorker?.getRegistration?.();
    if (registration?.active && typeof registration.showNotification === 'function') {
      await registration.showNotification(text.title, options);
      return true;
    }
  } catch {
    // 서비스 워커로 못 냈다 — 생성자로 한 번 더 시도한다
  }
  try {
    new NotificationImpl(text.title, options);
    return true;
  } catch {
    return false;
  }
}
