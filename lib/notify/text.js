// 알림 문구 — 예약 항목을 제목·본문으로 바꾼다 (AX-319 · spec 4.13 · 4.17 · 규칙 47)
//
// - 본문은 notifications 이름공간의 안전 문구다. 선택 언어가 ja·zh 이고 검수 스위치가 꺼져 있으면
//   영어로 나간다(safetyPair — 병기 규칙은 그 함수 하나에만 있다). 기기 알림은 한 줄이라 주 언어만 쓴다.
// - 문구에 넣는 값은 예약 항목의 `time`("HH:MM") 하나뿐이다. 항목에 다른 필드가 끼어 있어도 읽지 않는다.
// - 모르는 문구 키·형식이 틀린 시각이면 문구를 만들지 않는다(null) — 키 이름이 알림으로 새지 않게.
//
// 상대 경로 사용 — Next 밖(node --test)에서도 이 모듈을 그대로 테스트한다.

import { SAFETY_COPY_REVIEWED, safetyPair, translate } from '../../src/i18n/index.js';
import { NOTIFY_TEXT_KEY } from './schedule.js';

export const NOTIFY_TITLE_KEY = 'notifications.title';

const TEXT_KEYS = new Set(Object.values(NOTIFY_TEXT_KEY));
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @param {{key: string, time: string} | null} item  planNotifications 의 항목
 * @param {string} lang  선택 언어
 * @param {{ja: boolean, zh: boolean}} [reviewed]  안전 문구 검수 스위치 (기본: 이 빌드의 값)
 * @returns {{title: string, body: string, lang: 'ko'|'en'|'ja'|'zh'} | null}  lang 은 본문의 언어
 */
export function notificationText(item, lang, reviewed = SAFETY_COPY_REVIEWED) {
  if (!item || !TEXT_KEYS.has(item.key) || typeof item.time !== 'string' || !TIME_RE.test(item.time)) return null;
  const bodyLang = safetyPair(lang, reviewed).primary;
  return {
    // 알림 한 장은 한 언어로 — 제목도 본문 언어를 따른다
    title: translate(NOTIFY_TITLE_KEY, bodyLang),
    body: translate(item.key, bodyLang, { time: item.time }),
    lang: bodyLang,
  };
}
