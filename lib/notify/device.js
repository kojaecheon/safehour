// 기기 알림 한 장 내기 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md)
//
// - 사용자가 설정에서 알림을 켰고(prefs.notifications) 권한이 이미 '허용'일 때만 낸다.
//   **권한을 여기서 요청하지 않는다.** 요청은 설정 화면이나 보호자 화면(/g)의 알림 스위치를 켤 때만 한다(permission.js).
// - 활성 서비스 워커가 있으면 registration.showNotification 으로 낸다(안드로이드 크롬은 생성자를 막는다).
//   없거나 아직 설치 중이면(개발 모드·첫 방문 직후) Notification 생성자로 낸다.
// - 문구는 text.js 의 notificationText 만 쓴다 — 제목·본문에 조건·병원·복약 정보가 없다.
//   알림에 붙는 값은 제목·본문·언어·태그(notificationTagOf)·아이콘·열 화면(/today, 보호자 알림은 /g)뿐이다.
//   열 화면은 data.url 로 붙고, 알림을 누르면 서비스 워커(public/sw.js)가 허용 목록(/today, /g) 안에서 그 화면을 연다.
//   서비스 워커 없이 생성자로 낸 알림은 onclick 으로 같은 허용 목록(notificationClickPath) 안에서 창을 옮긴다.
// - 태그: 보호자 마감 지남(COMPANION_RETURN_PASSED)은 서버 푸시(lib/server/watch/text.js pushPayload)와 같은
//   `sh-watch-<날짜>-<HH:MM>`(notificationTagOf)을 쓸 수 있다. 그러면 같은 마감의 두 알림이 알림 칸에서 한 줄이 된다.
//   그 밖은 예약 id 다. 서비스 워커로 낼 때 이 태그 알림이 이미 알림 칸에 떠 있으면 내지 않는다(보던 알림을 덮어
//   다시 울리지 않게). 설정·권한·문구 확인 말고 기기 알림을 내지 않는 길은 이것 하나다. 예약과 늦은 알림 창은
//   결정 15대로 그대로다(서버 푸시 A-3 계획 다르게 정한 것 17).
// - 마감 태그는 날짜·시각뿐이라 환자를 가리지 못한다. 그래서 서버 푸시와 같은 태그는 실행기가 mayShareWatchTag 로 정해
//   넘긴 sharedWatchTag 가 참일 때만 쓴다: 예약을 만든 사본과 다른 watchId 를 가진 사본에 같은 날짜·시각 마감이 있으면
//   거짓이다. 거짓이거나 넘기지 않으면(직접 부르는 쪽의 기본값) 예약 id 태그로 내고 떠 있는지 묻지 않는다. 다른 환자의
//   푸시를 갈아 끼우지도, 그 환자의 다음 푸시(마감 지남, 복귀 확인)에 갈아 끼워지지도 않는다. 환자 알림은 늘 예약 id 다.
//   남는 틈: 서버 쪽에서만 생기는 것으로, 서버 태그에 환자가 없어 구독한 두 환자의 같은 분 마감 푸시는 알림 칸에서
//   서로 갈아 끼운다. 기기 알림이 공유 태그로 나가 다른 환자의 푸시 때문에 건너뛰거나 갈아 끼워질 수 있는 때는 셋이다.
//   앞 계정의 구독(이 계정에서 사본을 읽을 수 없다)이 같은 시각 푸시를 보낼 때, 다른 환자 사본이 23:59 에 지워진 뒤
//   늦게 깬 23:5x 타이머가 돌 때, 다른 환자가 링크를 보낸 뒤 일정을 바꿔 서버 마감만 이 시각이 됐을 때다(판단 근거가
//   사본에 담긴 마감이다). 앱 안 배너는 그대로 뜬다.
// - 떠 있는지 묻기(getNotifications)는 TAG_CHECK_TIMEOUT_MS 안에 답이 없으면 떠 있지 않은 것으로 보고 낸다.
// - 실패는 false 로 돌려준다. 같은 태그가 떠 있어 내지 않았을 때도 false 다. 앱 안 배너는 실행기(runtime.js)가 따로 띄운다.
//
// 브라우저 API 는 모두 주입할 수 있다 — node --test 에서 그대로 검증한다.

import { kstClock } from '../../src/engine/tripPlan.js';
import { normalizeLang } from '../../src/i18n/index.js';
import { isClockTime } from '../../src/stay/time.js';
import { NOTIFY_KIND } from './schedule.js';
import { notificationText } from './text.js';

export const NOTIFICATION_ICON = '/icons/icon-192.png';
export const NOTIFICATION_OPEN_URL = '/today';
export const NOTIFICATION_GUARDIAN_OPEN_URL = '/g';

/** 알림을 눌렀을 때 열 화면: 보호자 알림은 받은 일정(/g), 그 밖은 오늘 일정 */
export function notificationOpenUrl(item) {
  return item?.kind === NOTIFY_KIND.COMPANION_RETURN_PASSED ? NOTIFICATION_GUARDIAN_OPEN_URL : NOTIFICATION_OPEN_URL;
}

/** 알림을 눌렀을 때 열 수 있는 화면. public/sw.js 의 NOTIFICATION_PATHS 와 같아야 한다(서비스 워커 스크립트라 가져오지 못한다) */
export const NOTIFICATION_CLICK_PATHS = Object.freeze([NOTIFICATION_OPEN_URL, NOTIFICATION_GUARDIAN_OPEN_URL]);

/** 알림 data 에서 열 경로를 고른다. 허용 목록과 정확히 같은 문자열만 쓰고, 그 밖은 /today (public/sw.js notificationTargetPath 와 같다) */
export function notificationClickPath(data) {
  const url = data && typeof data.url === 'string' ? data.url : null;
  return url && NOTIFICATION_CLICK_PATHS.includes(url) ? url : NOTIFICATION_OPEN_URL;
}

/** 지켜보기 마감 알림의 태그. 서버 푸시 본문의 tag(lib/server/watch/text.js pushPayload)와 같은 모양이다 */
export function watchNotificationTag(date, time) {
  return `sh-watch-${date}-${time}`;
}

/**
 * 알림 칸 태그. 보호자 마감 지남은 마감의 KST 날짜와 시각으로 서버 푸시와 같은 태그를 쓰고, 그 밖은 예약 id 다.
 * at 은 ISO 절대 시각(planNotifications 가 toISOString 으로 만든다)이라 Date.parse 가 시간대와 무관하다.
 * 시각을 읽을 수 없으면 예약 id 로 둔다.
 */
export function notificationTagOf(item) {
  if (item?.kind !== NOTIFY_KIND.COMPANION_RETURN_PASSED || !isClockTime(item.time)) return item?.id;
  const atMs = typeof item.at === 'string' ? Date.parse(item.at) : Number.NaN;
  if (!Number.isFinite(atMs)) return item.id;
  return watchNotificationTag(kstClock(atMs).date, item.time);
}

/** 사본 하나의 days 에 이 태그의 환자 복귀 마감이 있는가 (모양이 깨진 사본은 없는 것으로 본다) */
function copyHasWatchTag(copy, tag) {
  const days = copy?.snapshot?.days;
  if (!Array.isArray(days)) return false;
  return days.some(
    (d) =>
      typeof d?.date === 'string' &&
      Array.isArray(d.patientReturn) &&
      d.patientReturn.some((r) => isClockTime(r?.by) && watchNotificationTag(d.date, r.by) === tag),
  );
}

/** 사본의 지켜보기 id (형식은 스냅샷이 확인했다, src/guardian/snapshot.js). 없으면 null */
function copyWatchId(copy) {
  const watchId = copy?.snapshot?.watchId;
  return typeof watchId === 'string' && watchId !== '' ? watchId : null;
}

/**
 * 보호자 마감 지남 기기 알림이 서버 푸시와 같은 태그(notificationTagOf)를 써도 되는가 (deliverToDevice 의 sharedWatchTag).
 * 알림의 출처는 실행기가 예약을 만든 사본(그때 가장 최근 사본)이고 sourceWatchId 는 그 사본의 watchId 다(없으면 null).
 * 이 기기에 같은 태그로 서버 푸시를 보낼 수 있는 다른 환자는 출처와 다른 watchId 를 가진 사본뿐이다(구독은 watchId 에
 * 묶인다). 그런 사본에 같은 날짜·시각 마감이 있으면 태그로 환자를 가릴 수 없어 거짓이다. watchId 가 없는 사본은 푸시를
 * 보낼 수 없어 세지 않는다(링크를 다시 받은 같은 환자의 옛 사본 등). 출처와 같은 watchId 의 사본도 세지 않는다.
 * 공유 태그가 없는 항목(다른 종류, 시각을 읽을 수 없는 항목)은 거짓이다.
 * @param {object} item  planNotifications 의 항목
 * @param {Array<{snapshot?: {days?: unknown, watchId?: string}}>} copies  이 계정의 보호자 사본(store.readGuardianCopies)
 * @param {string | null} [sourceWatchId]  예약을 만든 사본의 watchId
 */
export function mayShareWatchTag(item, copies, sourceWatchId = null) {
  if (item?.kind !== NOTIFY_KIND.COMPANION_RETURN_PASSED) return false;
  const tag = notificationTagOf(item);
  if (tag === item.id) return false;
  const source = typeof sourceWatchId === 'string' && sourceWatchId !== '' ? sourceWatchId : null;
  const list = Array.isArray(copies) ? copies : [];
  return !list.some((copy) => {
    const watchId = copyWatchId(copy);
    return watchId !== null && watchId !== source && copyHasWatchTag(copy, tag);
  });
}

/** 떠 있는지 묻기의 시간 한도. 답이 없으면 떠 있지 않은 것으로 보고 낸다(알림을 잃지 않게) */
export const TAG_CHECK_TIMEOUT_MS = 1000;

/**
 * 같은 태그 알림이 알림 칸에 떠 있는가. getNotifications 가 없거나 던지거나 시간 한도 안에 답하지 않으면
 * 떠 있지 않은 것으로 본다(지금처럼 낸다). 타이머는 어느 쪽으로 끝나든 지운다.
 */
async function isTagDisplayed(registration, tag, timers) {
  if (typeof registration.getNotifications !== 'function') return false;
  let timer = null;
  try {
    const list = await Promise.race([
      registration.getNotifications({ tag }),
      new Promise((resolve) => {
        timer = timers.setTimeout(() => resolve(null), TAG_CHECK_TIMEOUT_MS);
      }),
    ]);
    return Array.isArray(list) && list.some((n) => n?.tag === tag);
  } catch {
    return false;
  } finally {
    if (timer !== null) timers.clearTimeout(timer);
  }
}

/**
 * @param {{id: string, key: string, time: string}} item  planNotifications 의 항목
 * @param {object} env
 * @param {{readPrefs: Function, readLang: Function}} env.store
 * @param {Navigator | undefined} [env.nav]
 * @param {typeof Notification | undefined} [env.NotificationImpl]
 * @param {Window | null | undefined} [env.win]  서비스 워커 없이 낸 알림을 눌렀을 때 창을 움직인다. 없으면 클릭을 다루지 않는다
 * @param {boolean} [env.sharedWatchTag]  보호자 마감 지남을 서버 푸시와 같은 태그로 내고, 그 태그가 떠 있으면 내지 않는다.
 *   실행기가 mayShareWatchTag 로 정한다. 기본 거짓: 예약 id 태그로 내고 떠 있는지 묻지 않는다. 다른 종류에는 쓰지 않는다
 * @param {{setTimeout: Function, clearTimeout: Function}} [env.timers]  떠 있는지 묻기의 시간 한도
 * @returns {Promise<boolean>} 기기 알림을 냈는가 (같은 태그가 이미 떠 있어 내지 않았으면 false)
 */
export async function deliverToDevice(
  item,
  {
    store,
    nav = globalThis.navigator,
    NotificationImpl = globalThis.Notification,
    win = globalThis.window,
    sharedWatchTag = false,
    timers = { setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a) },
  } = {},
) {
  if (store?.readPrefs?.().notifications !== true) return false;
  if (typeof NotificationImpl !== 'function' || NotificationImpl.permission !== 'granted') return false;
  const lang = store.readLang?.() ?? normalizeLang(nav?.language);
  const text = notificationText(item, lang);
  if (!text) return false;
  // 서버 푸시와 같은 태그를 쓸 수 있는 알림인데 실행기가 환자를 가릴 수 있다고 정하지 않았으면 예약 id 태그로 낸다
  const watchTag = notificationTagOf(item);
  const ownTag = watchTag !== item.id && sharedWatchTag !== true;
  const options = {
    body: text.body,
    lang: text.lang,
    tag: ownTag ? item.id : watchTag,
    icon: NOTIFICATION_ICON,
    data: { url: notificationOpenUrl(item) },
  };
  try {
    // 설치 중(아직 활성 전)인 워커로는 낼 수 없다 — 그때는 생성자로 낸다
    const registration = await nav?.serviceWorker?.getRegistration?.();
    if (registration?.active && typeof registration.showNotification === 'function') {
      // 같은 태그(같은 마감의 서버 푸시 등)가 떠 있으면 내지 않는다. 생성자로 넘어가지도 않는다.
      // 예약 id 태그로 바꿔 낸 보호자 알림은 묻지 않는다(그 태그를 쓰는 알림은 이 알림 자신뿐이다)
      if (!ownTag && (await isTagDisplayed(registration, options.tag, timers))) return false;
      await registration.showNotification(text.title, options);
      return true;
    }
  } catch {
    // 서비스 워커로 못 냈다 — 생성자로 한 번 더 시도한다
  }
  try {
    const notification = new NotificationImpl(text.title, options);
    // 서비스 워커의 notificationclick 이 없는 경로: 눌렀을 때 같은 허용 목록 안에서 화면을 연다
    if (win?.location && notification && typeof win.location.assign === 'function') {
      notification.onclick = () => {
        try {
          win.focus?.();
          const path = notificationClickPath(options.data);
          // 이미 그 화면이면 다시 불러오지 않는다(public/sw.js notificationclick 도 같은 경로면 navigate 하지 않는다)
          if (win.location.pathname !== path) {
            // 상대 경로 assign 은 lint 규칙에 걸린다: 절대 URL 로 만든다
            win.location.assign(new URL(path, win.location.origin).href);
          }
          notification.close?.();
        } catch {
          // 이동하지 못해도 알림은 이미 냈다
        }
      };
    }
    return true;
  } catch {
    return false;
  }
}
