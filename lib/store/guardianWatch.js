// 서버 알림 기기 상태의 모양: 계정 레코드 guardianWatch 와 기기 키 pendingServerDelete
// (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md '공용 모양', Task 5, D3·D4)
//
//   guardianWatch (safehour.v2.<계정 키>.guardianWatch)
//     { watchId, writeToken, expiresOn, lastUploaded: { [date]: string[] }, uploadPending, backQueue, confirmed,
//       state: 'ON'|'REPLACED' }
//     backQueue: Array<{ date, by, undo, atMs? }>  atMs 는 누른 시각(기기에만 둔다. 요청 본문에 싣지 않는다)
//     confirmed: Array<{ date, by, atMs }>  서버가 recorded: true 로 받은 확인과 그 누른 시각(계획 다르게 정한 것 25)
//   pendingServerDelete (safehour.v2.device.pendingServerDelete)
//     Array<{ watchId, writeToken }>  최대 10개, watchId 가 겹치지 않는다
//
// - 허용 목록 필드만 새로 만들어 담는다. 장소·좌표·조건 값은 들어갈 자리가 없다
// - 레코드는 형식이 틀리면 null 이다(일부만 살리지 않는다). 마지막으로 올린 시각을 일부만 살리면 지난 마감이
//   서버에서 지워질 수 있어, 차라리 레코드가 없는 것으로 보고 서버의 마지막 상태를 그대로 둔다
// - 대기열, 보낸 확인, 삭제 대기는 틀린 항목만 버리고 상한을 넘으면 오래된 것(앞)부터 버린다.
//   confirmed 가 없거나 목록이 아니면 빈 목록이다(이 필드가 생기기 전에 쓴 레코드도 읽힌다)
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않는다.

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
 * '돌아왔어요' 대기열: { date, by, undo } 와 누른 시각 atMs(있고 형식이 맞을 때만)를 남기고 틀린 항목은 버린다.
 * 20개를 넘으면 오래된 것(앞)부터 버린다.
 * @param {unknown} value
 * @returns {Array<{ date: string, by: string, undo: boolean, atMs?: number }>}
 */
export function normalizeBackQueue(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => isPlainObject(item) && isDateString(item.date) && isClockTime(item.by) && typeof item.undo === 'boolean')
    .map((item) => (isAtMs(item.atMs) ? { date: item.date, by: item.by, undo: item.undo, atMs: item.atMs } : { date: item.date, by: item.by, undo: item.undo }))
    .slice(-BACK_QUEUE_MAX);
}

/**
 * 보낸 확인: { date, by, atMs } 만 남기고 틀린 항목(누른 시각이 없는 것 포함)은 버린다. 같은 (date, by)는 나중 것 하나만,
 * 20개를 넘으면 오래된 것(앞)부터 버린다. 어제보다 앞 날짜는 시계를 아는 쪽(lib/trip/watchPlan.js pruneConfirmed)이 버린다.
 * @param {unknown} value
 * @returns {Array<{ date: string, by: string, atMs: number }>}
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
    newestFirst.push({ date: item.date, by: item.by, atMs: item.atMs });
  }
  return newestFirst.reverse().slice(-CONFIRMED_MAX);
}

/**
 * 서버 삭제 대기: { watchId, writeToken } 만 남긴다. 같은 watchId 는 나중 것(새 토큰) 하나만, 10개를 넘으면 오래된 것부터 버린다.
 * @param {unknown} value
 * @returns {Array<{ watchId: string, writeToken: string }>}
 */
export function normalizePendingDelete(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const newestFirst = [];
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const item = value[i];
    if (!isIds(item) || seen.has(item.watchId)) continue;
    seen.add(item.watchId);
    newestFirst.push({ watchId: item.watchId, writeToken: item.writeToken });
  }
  return newestFirst.reverse().slice(-PENDING_DELETE_MAX);
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
