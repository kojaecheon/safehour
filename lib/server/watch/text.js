// 서버 푸시 문구 (ADR-0012 · 계획 작업 5)
//
// 보호자 기기 잠금 화면에 그대로 뜨는 문구다. 규칙은 기기 알림(lib/notify/text.js)과 같다.
// - 본문은 notifications 이름공간의 안전 문구다. 언어는 safetyPair(lang, reviewed).primary 하나뿐이고
//   (ja·zh 는 검수 스위치가 꺼져 있으면 영어), 제목도 같은 언어로 쓴다.
// - 문구에 넣는 값은 마감 시각 {time}("HH:MM") 하나뿐이다. 장소·병원·조건 값은 받을 자리가 없다.
// - 마감 지남 문구는 '확인이 없다'는 사실만 쓴다. 돌아오지 않았다고 단정하지 않는다.
// - payload 는 { title, body, url: '/g', tag } 네 값뿐이다. tag 의 날짜·시각은 암호화된 본문 안에만 있고
//   같은 마감의 확인 알림이 마감 지남 알림을 갈아 끼우는 데 쓴다.
// - 모르는 kind, 형식이 틀린 시각·날짜면 문구를 만들지 않는다(null). 키 이름이 알림으로 새지 않게.
//
// lib/server 아래에서 i18n 을 가져오는 예외 파일이다(test/i18n-languages.test.js 의 허용 목록).
// 표시 문구만 만들고 판정에는 쓰이지 않는다. i18n 입구(safetyPair·translate)만 가져오고 검수 스위치 값은
// 직접 읽지 않는다. 부르는 쪽이 ctx.reviewed 로 넘기고, 넘기지 않으면 safetyPair 의 기본값(이 빌드의 값)을 쓴다.

import { safetyPair, translate } from '../../../src/i18n/index.js';
import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { NOTIFY_TITLE_KEY } from '../../notify/text.js';

export const PUSH_KIND = Object.freeze({
  OVERDUE: 'OVERDUE',
  CONFIRMED: 'CONFIRMED',
  DEVICE_CHANGED: 'DEVICE_CHANGED',
});

export const PUSH_TEXT_KEY = Object.freeze({
  [PUSH_KIND.OVERDUE]: 'notifications.serverCompanionOverdue',
  [PUSH_KIND.CONFIRMED]: 'notifications.serverCompanionConfirmed',
  [PUSH_KIND.DEVICE_CHANGED]: 'notifications.serverDeviceChanged',
});

/** 알림을 누르면 열리는 보호자 화면 */
const GUARDIAN_URL = '/g';
const DEVICE_TAG = 'sh-watch-device';

/**
 * @param {'OVERDUE'|'CONFIRMED'|'DEVICE_CHANGED'} kind
 * @param {{ date?: string, time?: string, lang?: string }} input  date·time 은 DEVICE_CHANGED 에서 쓰지 않는다
 * @param {{ ja: boolean, zh: boolean }} [reviewed]  안전 문구 검수 스위치 (없으면 safetyPair 의 기본값)
 * @returns {string | null}  JSON { title, body, url, tag }
 */
export function pushPayload(kind, { date, time, lang } = {}, reviewed) {
  if (typeof kind !== 'string' || !Object.hasOwn(PUSH_TEXT_KEY, kind)) return null;
  const withTime = kind !== PUSH_KIND.DEVICE_CHANGED;
  if (withTime && (!isClockTime(time) || !isDateString(date))) return null;
  const textLang = safetyPair(lang, reviewed).primary;
  return JSON.stringify({
    title: translate(NOTIFY_TITLE_KEY, textLang),
    body: withTime ? translate(PUSH_TEXT_KEY[kind], textLang, { time }) : translate(PUSH_TEXT_KEY[kind], textLang),
    url: GUARDIAN_URL,
    tag: withTime ? `sh-watch-${date}-${time}` : DEVICE_TAG,
  });
}
