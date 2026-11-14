// 서버 알림: 무엇을 올리고 무엇을 누르는가 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 6, D1·D2·D5·D10)
//
//   buildUploadState   올릴 상태: 오늘부터 출국일까지(앞의 46일) 날짜별 마감, expiresOn, 다음 lastUploaded, 비교 키
//   isSameUpload       서버가 이미 같은 상태를 받았는가(다시 올릴 필요가 없는가)
//   backTargetOf       '돌아왔어요'가 확인할 마감 { date, by }
//   undoUntilMs        되돌리기 마감(보낼 시각에서 일찍 온 허용 폭을 뺀 때)
//   applyBackAction    '돌아왔어요'·되돌리기 누름을 대기열에 반영
//   pruneBackQueue     어제보다 앞 날짜를 버리고 상한을 씌운다
//
// 정한 것
//   - 마감 계산은 src/guardian/deadlines.js(patientDeadlineDays) 하나다. 당겨진 외출의 마감은 거기서 빠진다(D2).
//   - D1: 이미 지난 마감은 일정에서 빠졌어도 마지막으로 올린 시각을 남긴다. 서버의 확인 표시와 예약이 사라지지 않게 한다.
//   - D1 보강: 당겨진 외출이 있는 오늘(isOverdueClampedDay)은 마지막으로 올린 시각을 지금 이후 것까지 모두 남긴다.
//     늦을 것 같아 당겨진 외출의 원래 마감이 아직 미래여도 서버 예약이 남는다(그날 일정에서 빠진 외출의 마감도 남는 것이 대가다).
//   - 어제는 올리지 않는다(서버가 오늘 이전 날짜를 버린다). lastUploaded 에는 어제를 남겨 자정 뒤 경우 2 의 by 를 찾는다.
//   - '돌아왔어요'의 date 는 늘 외출이 속한 날이다. 시계의 오늘이 아니다.
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않고 시계는 nowMs 로 받는다. 날짜·시각은 KST 도우미로만 계산한다.

import { isClampedOverdueOuting, isOverdueClampedDay } from '../../src/domain/states.js';
import { kstClock } from '../../src/engine/tripPlan.js';
import { patientDeadlineDays } from '../../src/guardian/deadlines.js';
import { WATCH_UPLOAD_MAX_DAYS, WATCH_UPLOAD_MAX_PER_DAY } from '../../src/guardian/watchRequests.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { addDays, isClockTime, isDateString, kstInstantMs } from '../../src/stay/time.js';
import { normalizeBackQueue } from '../store/guardianWatch.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 마지막으로 올린 그 날짜의 시각(중복 없이 정렬). 기록이 없으면 null */
function uploadedOn(lastUploaded, date) {
  if (!isObject(lastUploaded) || !Object.hasOwn(lastUploaded, date) || !Array.isArray(lastUploaded[date])) return null;
  return [...new Set(lastUploaded[date].filter((time) => isClockTime(time)))].sort();
}

function dayPlanOf(tripPlan, date) {
  const days = isObject(tripPlan?.days) ? tripPlan.days : {};
  return Object.hasOwn(days, date) && isObject(days[date]) ? days[date] : null;
}

/** 하루 10개 상한: 지난 시각을 이른 순으로 빼고, 그래도 넘으면 늦은 시각부터 뺀다. times 는 정렬돼 있다 */
function capPerDay(times, date, nowMs) {
  const out = [...times];
  while (out.length > WATCH_UPLOAD_MAX_PER_DAY) {
    const earliestPast = out.findIndex((time) => kstInstantMs(date, time) <= nowMs);
    out.splice(earliestPast >= 0 ? earliestPast : out.length - 1, 1);
  }
  return out;
}

/**
 * 올릴 상태. 출국일이 없거나 오늘보다 앞이면, 또는 체류의 날짜를 읽을 수 없으면 null.
 * @param {object} args
 * @param {object} args.stay  Stay
 * @param {object|null} args.tripPlan  TripPlan
 * @param {Record<string, string[]>|null|undefined} args.lastUploaded  마지막으로 서버가 받아들인 날짜별 마감(어제 포함)
 * @param {number} args.nowMs
 * @returns {{ expiresOn: string, days: Array<{ date: string, deadlines: string[] }>,
 *   nextLastUploaded: Record<string, string[]>, key: string } | null}
 */
export function buildUploadState({ stay, tripPlan, lastUploaded, nowMs } = {}) {
  const today = kstClock(nowMs).date;
  const yesterday = addDays(today, -1);
  const expiresOn = stay?.departure?.date;
  if (!isDateString(expiresOn) || expiresOn < today) return null;
  const computed = patientDeadlineDays({ stay, tripPlan, fromDate: today });
  // 출국일이 오늘 이후면 적어도 출국일 하루가 있다. 비었으면 체류를 읽지 못한 것이라 올리지 않는다
  if (computed.length === 0) return null;

  const clampedToday = isOverdueClampedDay(dayPlanOf(tripPlan, today));
  const days = computed.slice(0, WATCH_UPLOAD_MAX_DAYS).map(({ date, deadlines }) => {
    const previous = uploadedOn(lastUploaded, date) ?? [];
    // D1: 지난 시각은 남긴다(내일 이후에는 지난 시각이 없다). D1 보강: 당겨진 오늘은 지금 이후 시각까지 모두 남긴다
    const kept = date === today && clampedToday ? previous : previous.filter((time) => kstInstantMs(date, time) <= nowMs);
    const merged = [...new Set([...deadlines, ...kept])].sort();
    return { date, deadlines: capPerDay(merged, date, nowMs) };
  });

  const nextLastUploaded = Object.fromEntries(days.map(({ date, deadlines }) => [date, deadlines]));
  const yesterdayTimes = uploadedOn(lastUploaded, yesterday);
  if (yesterdayTimes !== null) nextLastUploaded[yesterday] = yesterdayTimes;

  return { expiresOn, days, nextLastUploaded, key: JSON.stringify({ expiresOn, days }) };
}

function sameTimes(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((time, i) => time === b[i]);
}

/**
 * 서버가 이미 이 상태를 받았는가. 올리지 못함 표시가 없고, 출국일이 같고, 보낼 날짜마다 마지막으로 올린 목록이 같을 때만 참.
 * 보낼 날짜만 비교하므로 자정이 지나 보낼 날짜가 하루 줄어든 것만으로는 다르지 않다.
 * @param {object|null} record  guardianWatch 레코드
 * @param {object|null} state  buildUploadState 결과
 */
export function isSameUpload(record, state) {
  if (!isObject(record) || !isObject(state) || !Array.isArray(state.days)) return false;
  if (record.uploadPending !== false) return false;
  if (record.expiresOn !== state.expiresOn) return false;
  return state.days.every(({ date, deadlines }) => sameTimes(uploadedOn(record.lastUploaded, date), deadlines));
}

/**
 * '돌아왔어요'가 확인할 마감. 없으면 null(버튼을 두지 않는다).
 *   - passedBy(마감 지남 시트의 지난 마감, 경우 1)가 시각이면 외출 없이도 그 시각이다. 재계획으로 외출이 바뀌어도 남는 값이다.
 *   - 외출이 아직 출발 전이면 null.
 *   - 당겨진 외출이 아니면 그 외출의 returnBy.
 *   - 당겨진 외출(경우 2)이면 그 날짜에 마지막으로 올린 시각 중 출발 이후이고, 같은 날 다른 외출(당겨지지 않은)의 지금 마감이
 *     아닌 가장 이른 시각. 원래 마감은 지났을 수도, 아직 미래일 수도 있다.
 * @param {object} args
 * @param {object|null} args.day  외출이 속한 DayPlan
 * @param {object|null} args.outing  그날의 환자 외출
 * @param {Record<string, string[]>|null} args.lastUploaded
 * @param {number} args.nowMs
 * @param {string|null} [args.passedBy]
 * @returns {{ date: string, by: string } | null}
 */
export function backTargetOf({ day, outing, lastUploaded, nowMs, passedBy = null } = {}) {
  if (!isObject(day) || !isDateString(day.date)) return null;
  const date = day.date;
  if (isClockTime(passedBy)) return { date, by: passedBy };
  if (!isObject(outing) || !isClockTime(outing.departAt)) return null;
  if (kstInstantMs(date, outing.departAt) > nowMs) return null;
  if (!isClampedOverdueOuting(day, outing)) return isClockTime(outing.returnBy) ? { date, by: outing.returnBy } : null;

  const outings = Array.isArray(day.outings) ? day.outings : [];
  const otherDeadlines = new Set(
    outings
      .filter((other) => isObject(other) && other !== outing && !isClampedOverdueOuting(day, other) && isClockTime(other.returnBy))
      .map((other) => other.returnBy),
  );
  const by = (uploadedOn(lastUploaded, date) ?? []).find((time) => time >= outing.departAt && !otherDeadlines.has(time));
  return by ? { date, by } : null;
}

/**
 * 되돌리기 마감: 보낼 시각(마감 + serverPushGraceMin 분)에서 일찍 온 허용 폭(serverPushEarlyToleranceSec 초)을 뺀 때.
 * @param {{ date: string, by: string }} target
 * @returns {number} ms
 */
export function undoUntilMs({ date, by }) {
  const { serverPushGraceMin, serverPushEarlyToleranceSec } = DEFAULTS.notifications;
  return kstInstantMs(date, by) + serverPushGraceMin * 60_000 - serverPushEarlyToleranceSec * 1000;
}

/**
 * 누름을 대기열에 반영한다. 같은 (date, by)는 마지막 동작 하나만 남기고 새 항목은 뒤에 붙는다.
 * 대기 중인 확인(undo: false)을 되돌리면 둘 다 사라진다(보낼 것이 없다). 받은 대기열은 바꾸지 않는다.
 * @param {Array<{ date: string, by: string, undo: boolean }>} queue
 * @param {{ date: string, by: string, undo: boolean }} action
 * @throws {TypeError} 동작 모양이 틀림
 */
export function applyBackAction(queue, { date, by, undo } = {}) {
  if (!isDateString(date) || !isClockTime(by) || typeof undo !== 'boolean') {
    throw new TypeError('applyBackAction: 동작 형식이 올바르지 않습니다');
  }
  const current = normalizeBackQueue(queue);
  const same = (item) => item.date === date && item.by === by;
  const pending = current.find(same);
  const rest = current.filter((item) => !same(item));
  if (undo && pending && pending.undo === false) return rest;
  return [...rest, { date, by, undo }];
}

/**
 * 어제(KST)보다 앞 날짜와 틀린 항목을 버리고, 상한(20)을 넘으면 오래된 것(앞)부터 버린다.
 * @param {Array<{ date: string, by: string, undo: boolean }>} queue
 * @param {number} nowMs
 */
export function pruneBackQueue(queue, nowMs) {
  const yesterday = addDays(kstClock(nowMs).date, -1);
  const recent = Array.isArray(queue) ? queue.filter((item) => isDateString(item?.date) && item.date >= yesterday) : [];
  return normalizeBackQueue(recent);
}
