// 서버 알림: 무엇을 올리고 무엇을 누르는가 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 6, D1·D2·D5·D10,
// 다르게 정한 것 2·24)
//
//   buildUploadState   올릴 상태: 날짜별 마감, expiresOn, 다음 lastUploaded, 비교 키
//   isSameUpload       서버가 이미 같은 상태를 받았는가(다시 올릴 필요가 없는가)
//   isHeldOuting       묶인 외출인가(그 외출의 지금 마감은 올리지 않고, '돌아왔어요'는 이미 올린 시각에서 찾는다)
//   backTargetOf       '돌아왔어요'가 확인할 마감 { date, by }
//   undoUntilMs        되돌리기 마감(보낼 시각에서 일찍 온 허용 폭을 뺀 때)
//   applyBackAction    '돌아왔어요'·되돌리기 누름을 대기열에 반영
//   pruneBackQueue     어제보다 앞 날짜를 버리고 상한을 씌운다
//
// 정한 것
//   - 마감 계산은 src/guardian/deadlines.js(patientDeadlineDays) 하나다. 당겨진 외출의 마감은 거기서 빠진다(D2).
//   - 올리는 날짜: 오늘부터 상한(min(출국일, 오늘 + 45일)) 사이의 체류 날짜와, 같은 범위의 마지막으로 올린 날짜를 합친 것.
//     더는 체류 날짜가 아닌 올린 날짜(입국이 늦춰짐)는 빈 목록으로 보내 서버가 그 날짜 기록을 지우게 한다.
//     오늘만 예외로, 체류 날짜가 아니어도 고정된 지난 시각을 보낸다.
//   - 출국일이 오늘보다 앞이면(일찍 귀국): 오늘 이후로 올린 날짜가 남아 있으면 expiresOn 을 오늘로 줄이고 오늘의 고정된 지난
//     시각만 보낸다(서버가 오늘 뒤 날짜 기록을 지운다). 남은 것이 없으면 할 일이 없다(null).
//   - 오늘 지난 마감은 고정이다(다르게 정한 것 2·24). 지금 이전 시각은 마지막으로 올린 것만 보내고 새로 더하지 않는다(새로 더하면
//     곧바로 보호자 알림이 간다). 마지막으로 올린 지난 시각은 일정에서 빠졌어도 남긴다(D1, 서버의 확인 표시와 예약을 지킨다).
//   - 묶인 외출(isHeldOuting)이 있는 오늘은 마지막으로 올린 시각을 지금 이후 것까지 모두 남긴다(D1 보강). 당겨진 외출이 입력
//     변경으로 풀려 당겨 둔 지난 마감이 남아도, 원래 마감이 서버에서 빠지지 않는다(그날 일정에서 빠진 외출의 마감도 남는 것이 대가다).
//   - 어제는 올리지 않는다(서버가 오늘 이전 날짜를 버린다). lastUploaded 에는 어제를 남겨 자정 뒤 '돌아왔어요' 대상을 찾는다.
//   - nextLastUploaded 는 서버가 지금 가진 것과 같다: 빈 목록으로 지운 날짜(체류 날짜가 아님)는 남기지 않는다.
//   - 체류의 날짜나 일정의 날짜 목록을 읽지 못하면 올리지 않는다(null). 빈 목록이 서버 기록을 지우기 때문이다.
//   - '돌아왔어요'의 date 는 늘 외출이 속한 날이다. 시계의 오늘이 아니다.
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않고 시계는 nowMs 로 받는다. 날짜·시각은 KST 도우미로만 계산한다.

import { isClampedOverdueOuting } from '../../src/domain/states.js';
import { kstClock } from '../../src/engine/tripPlan.js';
import { patientDeadlineDays } from '../../src/guardian/deadlines.js';
import { WATCH_UPLOAD_MAX_DAYS, WATCH_UPLOAD_MAX_PER_DAY } from '../../src/guardian/watchRequests.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { stayDates } from '../../src/stay/stay.js';
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

/** 마지막으로 올린 기록이 있는 날짜 */
function uploadedDates(lastUploaded) {
  if (!isObject(lastUploaded)) return [];
  return Object.keys(lastUploaded).filter((date) => isDateString(date) && uploadedOn(lastUploaded, date) !== null);
}

function dayPlanOf(tripPlan, date) {
  const days = isObject(tripPlan?.days) ? tripPlan.days : {};
  return Object.hasOwn(days, date) && isObject(days[date]) ? days[date] : null;
}

/** 체류 날짜(입국일부터 출국일까지). 읽을 수 없거나 비었으면 null */
function readStayDates(stay) {
  try {
    const dates = stayDates(stay);
    return dates.length > 0 ? dates : null;
  } catch {
    return null;
  }
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
 * 묶인 외출인가: 지금 마감을 서버에 올리지 않고, '돌아왔어요'는 이미 올린 시각에서 대상을 찾는 외출(다르게 정한 것 24).
 *   - 당겨진 외출(isClampedOverdueOuting, 경우 2)이거나
 *   - 이미 출발했고 지금 마감도 지났는데 그 마감이 그 날짜에 마지막으로 올린 시각에 없는 외출. 당겨진 외출이 입력 변경으로
 *     풀려 당겨 둔 지난 마감이 남은 경우와, 지난 외출을 처음 올리는 경우다. 지난 시각을 새로 올리면 곧바로 보호자 알림이 간다.
 * 업로드(buildUploadState)와 '돌아왔어요' 대상(backTargetOf)이 이 함수 하나로 판정한다.
 * @param {object} args
 * @param {object|null} args.day  외출이 속한 DayPlan(date 가 있어야 한다)
 * @param {object|null} args.outing  그날의 환자 외출
 * @param {Record<string, string[]>|null|undefined} args.lastUploaded  마지막으로 올린 날짜별 마감(day.date 의 것을 본다)
 * @param {number} args.nowMs
 * @returns {boolean}
 */
export function isHeldOuting({ day, outing, lastUploaded, nowMs } = {}) {
  if (!isObject(day) || !isDateString(day.date) || !isObject(outing)) return false;
  if (isClampedOverdueOuting(day, outing)) return true;
  if (!isClockTime(outing.departAt) || !isClockTime(outing.returnBy)) return false;
  const passed = (time) => kstInstantMs(day.date, time) <= nowMs;
  return passed(outing.departAt) && passed(outing.returnBy) && !(uploadedOn(lastUploaded, day.date) ?? []).includes(outing.returnBy);
}

/**
 * 오늘이 체류 날짜일 때 오늘 보낼 시각.
 *   - 일정의 마감은 지금 이후이거나 이미 올린 것만(지난 시각을 새로 더하지 않는다). 묶인 외출의 마감은 그래서 빠진다
 *     (당겨진 외출의 마감은 patientDeadlineDays 가 이미 뺐다).
 *   - 마지막으로 올린 지난 시각은 남긴다(D1). 묶인 외출이 있으면 지금 이후 시각까지 모두 남긴다(D1 보강).
 */
function todayDeadlines({ planned, tripPlan, today, lastUploaded, nowMs }) {
  const isPast = (time) => kstInstantMs(today, time) <= nowMs;
  const uploaded = uploadedOn(lastUploaded, today) ?? [];
  const day = dayPlanOf(tripPlan, today);
  const outings = Array.isArray(day?.outings) ? day.outings : [];
  const held = outings.some((outing) => isHeldOuting({ day, outing, lastUploaded, nowMs }));
  const fresh = planned.filter((time) => !isPast(time) || uploaded.includes(time));
  const kept = held ? uploaded : uploaded.filter(isPast);
  return [...new Set([...fresh, ...kept])].sort();
}

/**
 * 올릴 상태. 출국일이 없거나, 체류의 날짜나 일정의 날짜 목록을 읽을 수 없으면 null.
 * 출국일이 오늘보다 앞이면 오늘 이후로 올린 날짜가 남았을 때만 상태가 있고(expiresOn 은 오늘), 아니면 null.
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
  const departure = stay?.departure?.date;
  if (!isDateString(departure)) return null;
  // 체류나 일정의 날짜를 읽지 못하면 올리지 않는다. 빈 목록이 서버의 날짜 기록을 지운다
  const stayDateList = readStayDates(stay);
  if (stayDateList === null || !isObject(tripPlan?.days)) return null;
  const stayDateSet = new Set(stayDateList);
  const uploadedAt = uploadedDates(lastUploaded);
  // 오늘의 고정된 지난 시각: 마지막으로 올린 것 중 지금 이전(D1)
  const frozenToday = (uploadedOn(lastUploaded, today) ?? []).filter((time) => kstInstantMs(today, time) <= nowMs);

  let expiresOn;
  let sends;
  if (departure < today) {
    // 일찍 귀국: 출국일을 오늘로 줄여 서버가 오늘 뒤 날짜 기록을 지우게 하고, 오늘은 고정된 지난 시각만 남긴다
    if (!uploadedAt.some((date) => date >= today)) return null;
    expiresOn = today;
    sends = [{ date: today, deadlines: frozenToday }];
  } else {
    expiresOn = departure;
    const lastDay = addDays(today, WATCH_UPLOAD_MAX_DAYS - 1);
    const cap = departure < lastDay ? departure : lastDay;
    const planned = new Map(
      patientDeadlineDays({ stay, tripPlan, fromDate: today })
        .filter(({ date }) => date <= cap)
        .map(({ date, deadlines }) => [date, deadlines]),
    );
    const dates = [...new Set([...planned.keys(), ...uploadedAt.filter((date) => date >= today && date <= cap)])].sort();
    sends = dates.map((date) => {
      // 더는 체류 날짜가 아닌 올린 날짜: 빈 목록으로 지운다. 오늘은 고정된 지난 시각만 보낸다
      if (!planned.has(date)) return { date, deadlines: date === today ? frozenToday : [] };
      if (date !== today) return { date, deadlines: planned.get(date) };
      return { date, deadlines: todayDeadlines({ planned: planned.get(date), tripPlan, today, lastUploaded, nowMs }) };
    });
  }
  const days = sends.map(({ date, deadlines }) => ({ date, deadlines: capPerDay(deadlines, date, nowMs) }));

  // 서버가 지금 가진 것: 체류 날짜가 아닌 날짜에 보낸 빈 목록은 서버가 그 날짜 기록을 지웠으므로 남기지 않는다
  const nextLastUploaded = Object.fromEntries(
    days.filter(({ date, deadlines }) => deadlines.length > 0 || stayDateSet.has(date)).map(({ date, deadlines }) => [date, deadlines]),
  );
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
 * 지우려고 빈 목록으로 보내는 날짜는 마지막으로 올린 목록이 비어 있을 때만 같다(서버에 그 날짜 기록이 없다). 보내고 나면
 * nextLastUploaded 에서 빠지므로 다음 상태에는 그 날짜가 없고, 같은 상태를 다시 올리지 않는다.
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
 *   - 묶인 외출(isHeldOuting)이 아니면 그 외출의 returnBy.
 *   - 묶인 외출(당겨진 외출, 당김이 풀린 외출, 올린 적 없는 지난 마감)이면 그 날짜에 마지막으로 올린 시각 중 출발보다 늦고,
 *     같은 날 다른 외출(묶이지 않은)의 지금 마감이 아닌 가장 이른 시각. 원래 마감은 지났을 수도, 아직 미래일 수도 있다.
 *     출발과 같은 시각은 이 외출의 마감일 수 없다(돌아오는 마감은 출발보다 늦다). 바로 앞 외출의 마감일 수 있어 뺀다.
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
  const held = (one) => isHeldOuting({ day, outing: one, lastUploaded, nowMs });
  if (!held(outing)) return isClockTime(outing.returnBy) ? { date, by: outing.returnBy } : null;

  const outings = Array.isArray(day.outings) ? day.outings : [];
  const otherDeadlines = new Set(
    outings
      .filter((other) => isObject(other) && other !== outing && !held(other) && isClockTime(other.returnBy))
      .map((other) => other.returnBy),
  );
  const by = (uploadedOn(lastUploaded, date) ?? []).find((time) => time > outing.departAt && !otherDeadlines.has(time));
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
