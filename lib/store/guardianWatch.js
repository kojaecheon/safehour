// 서버 알림 기기 상태의 모양: 계정 레코드 guardianWatch 와 기기 키 pendingServerDelete
// (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md '공용 모양', Task 5, D3·D4)
//
//   guardianWatch (safehour.v2.<계정 키>.guardianWatch)
//     { watchId, writeToken, expiresOn, lastUploaded: { [date]: string[] }, uploadPending, backQueue, confirmed,
//       state: 'ON'|'REPLACED' }
//     backQueue: Array<{ date, by, undo, atMs?, departAt? }>  atMs 는 누른 시각, departAt 은 누른 외출의 출발 시각(HH:MM)
//                (둘 다 기기에만 둔다. 요청 본문에 싣지 않는다)
//     confirmed: Array<{ date, by, atMs, departAt? }>  서버가 recorded: true 로 받은 확인과 그 누른 시각·누른 외출의 출발 시각
//                (계획 다르게 정한 것 25)
//   pendingServerDelete (safehour.v2.device.pendingServerDelete)
//     Array<{ watchId, writeToken } | { watchId, subId }>  합쳐 최대 10개, 지켜보기 삭제는 watchId, 구독 해지는 (watchId, subId) 가
//     겹치지 않는다. 넘으면 가장 오래된 구독 해지부터, 그다음 가장 오래된 지켜보기 삭제를 버린다
//     writeToken 항목은 지운 지켜보기(A-2), subId 항목은 기록에서 빠진 보호자 구독(A-3,
//     docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md 정한 값 13)
//
// - 허용 목록 필드만 새로 만들어 담는다. 장소·좌표·조건 값은 들어갈 자리가 없다
// - 레코드는 형식이 틀리면 null 이다(일부만 살리지 않는다). 마지막으로 올린 시각을 일부만 살리면 지난 마감이
//   서버에서 지워질 수 있어, 차라리 레코드가 없는 것으로 보고 서버의 마지막 상태를 그대로 둔다
// - 대기열, 보낸 확인, 삭제 대기는 틀린 항목만 버리고 상한을 넘으면 오래된 것(앞)부터 버린다(삭제 대기는 종류 차례가 먼저다).
//   confirmed 가 없거나 목록이 아니면 빈 목록이다(이 필드가 생기기 전에 쓴 레코드도 읽힌다)
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않는다.

import { SUB_ID_RE } from '../../src/guardian/pushRequests.js';
import { WATCH_ID_RE, WRITE_TOKEN_RE } from '../../src/guardian/watchRequests.js';
import { isClockTime, isDateString } from '../../src/stay/time.js';

/** '돌아왔어요' 대기열 상한 */
export const BACK_QUEUE_MAX = 20;
/** 보낸 확인(confirmed) 상한 */
export const CONFIRMED_MAX = 20;
/** 서버 삭제 대기 상한. 넘으면 오래된 것부터 버리고 서버 만료에 맡긴다 */
export const PENDING_DELETE_MAX = 10;

const WATCH_STATES = Object.freeze(['ON', 'REPLACED']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIds(value) {
  return isPlainObject(value) && typeof value.watchId === 'string' && WATCH_ID_RE.test(value.watchId)
    && typeof value.writeToken === 'string' && WRITE_TOKEN_RE.test(value.writeToken);
}

/** 날짜별 시각 목록. 하나라도 틀리면 null. 시각은 정렬하고 중복을 없앤다 */
function normalizeLastUploaded(value) {
  if (!isPlainObject(value)) return null;
  const out = {};
  for (const date of Object.keys(value).sort()) {
    const times = value[date];
    if (!isDateString(date) || !Array.isArray(times) || !times.every((t) => isClockTime(t))) return null;
    out[date] = [...new Set(times)].sort();
  }
  return out;
}

/** 누른 시각(ms): 0 이상의 정수 */
function isAtMs(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * '돌아왔어요' 대기열: { date, by, undo } 와 누른 시각 atMs, 누른 외출의 출발 시각 departAt(각각 있고 형식이 맞을 때만)를 남기고
 * 틀린 항목은 버린다. 20개를 넘으면 오래된 것(앞)부터 버린다.
 * @param {unknown} value
 * @returns {Array<{ date: string, by: string, undo: boolean, atMs?: number, departAt?: string }>}
 */
export function normalizeBackQueue(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => isPlainObject(item) && isDateString(item.date) && isClockTime(item.by) && typeof item.undo === 'boolean')
    .map((item) => {
      const out = { date: item.date, by: item.by, undo: item.undo };
      if (isAtMs(item.atMs)) out.atMs = item.atMs;
      if (isClockTime(item.departAt)) out.departAt = item.departAt;
      return out;
    })
    .slice(-BACK_QUEUE_MAX);
}

/**
 * 보낸 확인: { date, by, atMs } 와 누른 외출의 출발 시각 departAt(있고 형식이 맞을 때만)를 남기고 틀린 항목(누른 시각이 없는 것
 * 포함)은 버린다. 같은 (date, by)는 나중 것 하나만, 20개를 넘으면 오래된 것(앞)부터 버린다. 어제보다 앞 날짜는 시계를 아는 쪽
 * (lib/trip/watchPlan.js pruneConfirmed)이 버린다.
 * @param {unknown} value
 * @returns {Array<{ date: string, by: string, atMs: number, departAt?: string }>}
 */
export function normalizeConfirmed(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const newestFirst = [];
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const item = value[i];
    if (!isPlainObject(item) || !isDateString(item.date) || !isClockTime(item.by) || !isAtMs(item.atMs)) continue;
    const key = `${item.date} ${item.by}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { date: item.date, by: item.by, atMs: item.atMs };
    if (isClockTime(item.departAt)) entry.departAt = item.departAt;
    newestFirst.push(entry);
  }
  return newestFirst.reverse().slice(-CONFIRMED_MAX);
}

/**
 * 서버 삭제 대기 항목 하나를 허용 목록 모양으로 새로 만든다. 쓰기 토큰이 맞으면 { watchId, writeToken }(subId 가 함께 있어도
 * 이쪽이다. 이 종류만 있던 때와 같게 읽힌다), 아니고 subId 가 맞으면 { watchId, subId }, 둘 다 아니면 null.
 */
function pendingItemOf(item) {
  if (isIds(item)) return { watchId: item.watchId, writeToken: item.writeToken };
  if (isPlainObject(item) && typeof item.watchId === 'string' && WATCH_ID_RE.test(item.watchId)
    && typeof item.subId === 'string' && SUB_ID_RE.test(item.subId)) {
    return { watchId: item.watchId, subId: item.subId };
  }
  return null;
}

/**
 * 서버 삭제 대기: { watchId, writeToken }(지운 지켜보기)과 { watchId, subId }(기록에서 빠진 보호자 구독)만 남긴다. 지켜보기 삭제는 같은
 * watchId 면 나중 것(새 토큰) 하나만, 구독 해지는 같은 (watchId, subId) 면 하나만 남긴다(같은 지켜보기라도 subId 가 다르면 서버의
 * 다른 구독이다: 다른 계정, 다시 켠 구독). 합쳐 10개를 넘으면 가장 오래된 구독 해지부터, 구독 해지가 없으면 가장 오래된 지켜보기
 * 삭제를 버린다(배열 자리와 무관하다. 서버에 남은 마감이 구독보다 무겁다, guardian-ui 계획 정한 값 13). 남은 항목은 순서를 지킨다.
 * @param {unknown} value
 * @returns {Array<{ watchId: string, writeToken: string } | { watchId: string, subId: string }>}
 */
export function normalizePendingDelete(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const newestFirst = [];
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const item = pendingItemOf(value[i]);
    if (item === null) continue;
    const key = item.writeToken === undefined ? `s:${item.watchId}:${item.subId}` : `w:${item.watchId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    newestFirst.push(item);
  }
  const ordered = newestFirst.reverse();
  const excess = ordered.length - PENDING_DELETE_MAX;
  if (excess <= 0) return ordered;
  let dropSubs = Math.min(excess, ordered.filter((item) => item.writeToken === undefined).length);
  let dropWatches = excess - dropSubs;
  return ordered.filter((item) => {
    if (item.writeToken === undefined && dropSubs > 0) {
      dropSubs -= 1;
      return false;
    }
    if (item.writeToken !== undefined && dropWatches > 0) {
      dropWatches -= 1;
      return false;
    }
    return true;
  });
}

/**
 * guardianWatch 레코드. 형식이 틀리면 null.
 * @param {unknown} value
 * @returns {{ watchId: string, writeToken: string, expiresOn: string, lastUploaded: Record<string, string[]>,
 *   uploadPending: boolean, backQueue: Array<{ date: string, by: string, undo: boolean, atMs?: number }>,
 *   confirmed: Array<{ date: string, by: string, atMs: number }>, state: 'ON'|'REPLACED' } | null}
 */
export function normalizeGuardianWatch(value) {
  if (!isIds(value)) return null;
  if (!isDateString(value.expiresOn)) return null;
  if (typeof value.uploadPending !== 'boolean') return null;
  if (!WATCH_STATES.includes(value.state)) return null;
  if (!Array.isArray(value.backQueue)) return null;
  const lastUploaded = normalizeLastUploaded(value.lastUploaded);
  if (lastUploaded === null) return null;
  return {
    watchId: value.watchId,
    writeToken: value.writeToken,
    expiresOn: value.expiresOn,
    lastUploaded,
    uploadPending: value.uploadPending,
    backQueue: normalizeBackQueue(value.backQueue),
    confirmed: normalizeConfirmed(value.confirmed),
    state: value.state,
  };
}
