// 보호자 구독 다시 맞추기와 상태 조회 시각 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md 정한 값 8·14, Task 5)
//
//   planReconcile(input)   구독 기록과 지금 상태 → { retire, repost, renewNeeded }
//   statusTimes(input)     오늘 남은 마감 → 상태 조회 시각(ms) 목록
//   liveWatchIdsOf(copies) 살아 있는 사본의 watchId (겹침 입력)
//   movedWatchIdsOf(record) 상태 조회가 subscriptionActive 거짓이라 한 watchId (MOVED, 다른 기기가 구독을 가져감)
//   todayDeadlinesOf(copy, date)  그 날짜 환자 복귀 마감 시각 (겹침 입력)
//
// 다시 맞추기 규칙(정한 값 8)
//   - 살아 있는 사본 어디에도 없는 watchId 의 구독: retire
//   - 기기 알림 스위치가 꺼졌거나 권한이 granted 가 아님: 모두 retire
//   - MOVED(상태 조회가 subscriptionActive 거짓이라 한 구독)는 다시 POST 와 renewNeeded 에서 뺀다. 다시 POST 하면 서버가 구독을
//     바꿔 다른 휴대폰에 '기기가 바뀌었어요'를 보내고 구독을 되찾는다. MOVED 는 '이 휴대폰에서 다시 받기'(takeOver)로만 푼다(정한 값 9)
//   - 남은 구독(MOVED 제외)이 없거나 설정의 키를 모르면(설정 꺼짐, 못 읽음) 다시 POST 와 renewNeeded 를 정하지 않는다(끄기만 한다)
//   - 설정의 VAPID 키가 남은 구독 어느 하나의 키와 다르거나, 브라우저 구독의 키를 읽을 수 있고 설정과 다르거나, 브라우저 구독이
//     없음: renewNeeded 이고 다시 POST 하지 않는다. 저절로 구독하지 않는다(결정 19, Safari 는 구독에 사용자 동작이 필요하다).
//     브라우저 구독은 기기에 하나라(정한 값 7) 한 구독이라도 옛 키면 다시 켜기다
//   - 그 밖에 endpoint 해시가 다르거나 언어가 바뀐 구독(gone 이 아닌 것): 같은 브라우저 구독으로 다시 POST
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않는다. 시각은 KST 도우미로만 계산한다.

import { WATCH_ID_RE } from '../../src/guardian/watchRequests.js';
import { LANGS } from '../../src/i18n/index.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { isClockTime, isDateString, kstInstantMs } from '../../src/stay/time.js';

/** 상태 조회: 마감 몇 ms 전에 묻는가 */
export const STATUS_BEFORE_MS = 60_000;

const MINUTE_MS = 60_000;
const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);

/**
 * 상태 조회가 subscriptionActive 거짓이라 한 watchId (MOVED). 구독이 있는지는 보지 않는다.
 * @param {{ status?: Array<{ watchId: string, active: boolean|null }> } | null} record
 * @returns {Set<string>}
 */
export function movedWatchIdsOf(record) {
  const status = Array.isArray(record?.status) ? record.status : [];
  return new Set(status.filter((item) => item?.active === false && isWatchId(item.watchId)).map((item) => item.watchId));
}

/**
 * @param {object} input
 * @param {{ subs?: Array<{ watchId: string, lang: string, endpointHash: string, vapidKey: string }>, gone?: string[],
 *   status?: Array<{ watchId: string, active: boolean|null }> } | null} input.record  status 의 active 거짓은 MOVED 다
 * @param {Iterable<string>} input.liveWatchIds  살아 있는 사본의 watchId
 * @param {boolean} input.mainOn  기기 알림 스위치(prefs.notifications)
 * @param {string|null|undefined} input.permission  Notification.permission
 * @param {{ endpointHash: string, vapidKey?: string } | null} input.browser  브라우저 구독(없으면 null)
 * @param {string|null} input.configKey  설정의 VAPID 공개키(꺼짐이거나 못 읽으면 null)
 * @param {string} input.lang  지금 언어
 * @returns {{ retire: string[], repost: string[], renewNeeded: boolean }}
 */
export function planReconcile({ record, liveWatchIds, mainOn, permission, browser, configKey, lang } = {}) {
  const subs = Array.isArray(record?.subs) ? record.subs : [];
  const live = new Set(liveWatchIds instanceof Set || Array.isArray(liveWatchIds) ? liveWatchIds : []);
  const allOff = mainOn !== true || permission !== 'granted';
  const retire = subs.filter((sub) => allOff || !live.has(sub.watchId)).map((sub) => sub.watchId);
  const moved = movedWatchIdsOf(record);
  const kept = allOff ? [] : subs.filter((sub) => live.has(sub.watchId) && !moved.has(sub.watchId));
  if (kept.length === 0 || typeof configKey !== 'string' || configKey === '') return { retire, repost: [], renewNeeded: false };

  const browserKeyDiffers = typeof browser?.vapidKey === 'string' && browser.vapidKey !== configKey;
  if (!browser || browserKeyDiffers || kept.some((sub) => sub.vapidKey !== configKey)) return { retire, repost: [], renewNeeded: true };

  const gone = new Set(Array.isArray(record?.gone) ? record.gone : []);
  const currentLang = LANGS.includes(lang) ? lang : null;
  const repost = kept
    .filter((sub) => !gone.has(sub.watchId))
    .filter((sub) => sub.endpointHash !== browser.endpointHash || (currentLang !== null && sub.lang !== currentLang))
    .map((sub) => sub.watchId);
  return { retire, repost, renewNeeded: false };
}

/**
 * 오늘 남은 마감마다 마감 60초 전과 마감 + (유예 + 1)분. 지금 이후만, 겹치지 않게, 이른 것부터.
 * @param {{ deadlines: string[], date: string, nowMs: number, graceMin?: number }} input
 *   graceMin 이 숫자가 아니면 DEFAULTS.notifications.serverPushGraceMin
 * @returns {number[]}
 */
export function statusTimes({ deadlines, date, nowMs, graceMin } = {}) {
  if (!Array.isArray(deadlines) || !isDateString(date) || !Number.isFinite(nowMs)) return [];
  const grace = Number.isFinite(graceMin) && graceMin >= 0 ? graceMin : DEFAULTS.notifications.serverPushGraceMin;
  const times = new Set();
  for (const by of deadlines) {
    if (!isClockTime(by)) continue;
    const at = kstInstantMs(date, by);
    for (const time of [at - STATUS_BEFORE_MS, at + (grace + 1) * MINUTE_MS]) {
      if (time > nowMs) times.add(time);
    }
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * 사본 목록 → 형식에 맞는 watchId (겹치지 않게, 처음 나온 차례)
 * @param {Array<{ snapshot?: { watchId?: string } }> | null} copies
 * @returns {string[]}
 */
export function liveWatchIdsOf(copies) {
  if (!Array.isArray(copies)) return [];
  const ids = [];
  for (const copy of copies) {
    const watchId = copy?.snapshot?.watchId;
    if (isWatchId(watchId) && !ids.includes(watchId)) ids.push(watchId);
  }
  return ids;
}

/**
 * 사본 하나의 그 날짜 환자 복귀 마감 시각(HH:MM). 형식이 틀린 것은 뺀다.
 * @returns {string[]}
 */
export function todayDeadlinesOf(copy, date) {
  const days = copy?.snapshot?.days;
  if (!Array.isArray(days)) return [];
  const day = days.find((item) => item?.date === date);
  const returns = Array.isArray(day?.patientReturn) ? day.patientReturn : [];
  return returns.map((item) => item?.by).filter((by) => isClockTime(by));
}
