// 일정 동기화 실행기 (AX-316 · spec 4.1, 4.6, 4.9, 4.10, 4.11, 4.19, 4.20, 규칙 13·32·49·51·55)
//
//   const sync = createTripSync({ store, api });
//   sync.start();        // 저장소 구독(체류·일정·설정·보기 전용 상태), 자정 재확인
//   sync.openOnce();     // 앱을 처음 열 때 한 번 — 이후 화면으로 돌아오면 sync.resume()
//   sync.getState();     // 신호 { syncing, lastSyncAt, updateFailed, dailyCheckPending, immediateReturn, … }
//   sync.todayView();    // 오늘 표시용 일정(오늘 게이트 덧씌우기 — 저장값은 그대로)
//
// 원칙
//   - 모든 API 작업은 한 줄 대기열로 차례대로 한다. 요청의 previous 는 늘 가장 최근 저장 일정이다.
//   - 저장소 변경(체류)은 날짜별 입력 서명으로 영향 날짜만 모아 재계획한다(affected.js). 요청하지 않은 날짜의
//     배치는 usedContentIds 로, 편집 기록은 전체를, 오늘을 재계획하면 오늘 사건 전체를 함께 보낸다.
//   - 실패(네트워크·API)하면 저장 일정을 그대로 두고 updateFailed 를 켠다. 실패한 날짜는 다시 시도할 때
//     (retry·앱 열기·다시 쓸 수 있게 됨) 다시 판정한다.
//   - 보기 전용(세션 없음·만료·오프라인)이면 API 를 부르지 않고 저장하지 않는다. 쓸 수 있게 되면 앱 열기를 이어서 한다.
//   - 요청 도중 계정이 바뀌거나 체류가 지워졌으면 응답을 저장하지 않는다.
//
// 저장소(lib/store createStore 모양)·API(api.js)·시계·언어·타이머는 주입한다.

import { REASON } from '../../src/domain/states.js';
import { applyImmediateReturn, kstClock } from '../../src/engine/tripPlan.js';
import { recheckLinkedPlan } from '../../src/recovery/link.js';
import { classifyDate } from '../../src/stay/coverage.js';
import { appointmentEnd } from '../../src/stay/dayFrame.js';
import { appointmentsOnDate, isStayDate, validateStay } from '../../src/stay/stay.js';
import { addDays, kstInstantMs, toMinutes } from '../../src/stay/time.js';
import { applyLinkedPlan } from '../../components/conditions/linkPlan.js';
import { isGuardianResendNeeded } from '../../components/guardian/share.js';
import { canonicalJson } from '../store/fingerprint.js';
import { diffStay, safeStayDates } from './affected.js';
import { selectDayView, selectTodayGates, selectTodayView } from './display.js';
import { MEAL_SLOTS, findStop, withClearedMeal, withDelete, withSwap, withoutDates } from './edits.js';
import { immediateReturnCauseFor, markConsentWithdrawnLocally, stripConditionData } from './local.js';
import { buildAlternativesBody, buildPlanBody, buildRelabelBody, dayContentIds, normalizeTodayEvents } from './requests.js';

/** 실패 사유 — 동작 결과 `{ ok: false, code }` */
export const TRIP_ERROR = Object.freeze({
  /** 보기 전용 — API·쓰기 없음 */
  READ_ONLY: 'READ_ONLY',
  NO_STAY: 'NO_STAY',
  NO_TRIP_PLAN: 'NO_TRIP_PLAN',
  NOT_IN_STAY: 'NOT_IN_STAY',
  /** 지난 날짜는 편집할 수 없다 (spec 4.10) */
  PAST_DATE: 'PAST_DATE',
  /** 매일 확인 전인 오늘은 편집할 수 없다 (spec 4.10) */
  DAILY_CHECK_PENDING: 'DAILY_CHECK_PENDING',
  NOT_FOUND: 'NOT_FOUND',
  /** 이미 도착한 정거장은 바꾸지 않는다 (재계획 규칙 2) */
  STOP_STARTED: 'STOP_STARTED',
  INVALID: 'INVALID',
  /** 네트워크·API 실패 — errorCode 에 서버 오류 코드 */
  UPDATE_FAILED: 'UPDATE_FAILED',
  /** 고른 후보를 넣을 수 없었다(그사이 판정이 바뀜) — 아무것도 저장하지 않았다 */
  SWAP_NOT_PLACED: 'SWAP_NOT_PLACED',
  /** 기기 저장 실패·요청 중 계정 변경 */
  STORE_FAILED: 'STORE_FAILED',
});

/** 기상 단기예보 범위: 오늘~모레 (spec 4.9 변화 원천 4) */
export const WEATHER_DAYS_AHEAD = 2;
/** 화면으로 돌아올 때 재확인 최소 간격 — 탭을 오가도 API 를 몰아서 부르지 않는다 */
export const RESUME_INTERVAL_MS = 2 * 60 * 1000;

const RETURN_CAUSES = Object.freeze([REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED]);
const MAX_TIMER_MS = 2 ** 31 - 1;
const CONTENT_ID_RE = /^\d{1,12}$/;

const INITIAL_STATE = Object.freeze({
  /** KST 오늘 */
  today: null,
  /** 대기열에 API 작업이 있다 */
  syncing: false,
  /** 마지막으로 서버 일정을 저장한 시각(ISO) */
  lastSyncAt: null,
  /** 마지막 동기화가 실패했다 — 저장 일정은 그대로다 */
  updateFailed: false,
  /** 실패한 요청의 서버 오류 코드(예: SAFEHOUR_AUTH_REQUIRED, NETWORK_ERROR) */
  lastErrorCode: null,
  /** 오늘 매일 확인이 남았다 (spec 4.6) */
  dailyCheckPending: false,
  /** 확인하지 않은 병원 중요 안내가 있다 (규칙 56) */
  unconfirmedHospitalUpdate: false,
  /** 즉시 복귀 — `{ date, cause }`. 오늘 저장 일정이 returnNow 인 동안 (시트를 닫으면 null, 새 원인이면 다시) */
  immediateReturn: null,
  /** 보호자 링크를 다시 보내야 한다 (spec 4.11) */
  guardianResendNeeded: false,
  /** 동반 보호자를 켰지만 환자 외출이 있는 날에는 보호자 외출이 더해지지 않았다 — '다시 만들기'를 권한다 */
  companionChangeNeedsRegenerate: false,
});

function fail(code, extra) {
  return extra ? { ok: false, code, ...extra } : { ok: false, code };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameState(a, b) {
  return Object.keys(b).every((key) => Object.is(a[key], b[key]) || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/**
 * @param {object} options
 * @param {ReturnType<import('../store/store.js').createStore>} options.store
 * @param {ReturnType<import('./api.js').createTripApi>} options.api
 * @param {() => number} [options.now]
 * @param {() => string} [options.getLang]  관광 데이터 언어 — 화면 언어와 같은 결정 순서(기기 선택 → 브라우저)
 * @param {{setTimeout: Function, clearTimeout: Function} | null} [options.timers]  자정(KST) 재확인
 * @param {number} [options.resumeIntervalMs]
 */
export function createTripSync({ store, api, now = () => Date.now(), getLang, timers = null, resumeIntervalMs = RESUME_INTERVAL_MS } = {}) {
  const langOf = () => {
    const lang = typeof getLang === 'function' ? getLang() : store.readLang();
    return typeof lang === 'string' && lang ? lang : 'ko';
  };
  const clockNow = () => kstClock(now());
  const nowIso = () => new Date(now()).toISOString();

  // ── 신호 ─────────────────────────────────────────────────────────
  let state = Object.freeze({ ...INITIAL_STATE });
  const listeners = new Set();

  function setState(patch) {
    const next = { ...state, ...patch };
    if (sameState(state, next)) return;
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener(state);
  }

  function getState() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // ── 대기열 ───────────────────────────────────────────────────────
  let chain = Promise.resolve();
  let tracked = 0;

  function enqueue(task, { track = true } = {}) {
    if (track) {
      tracked += 1;
      setState({ syncing: true });
    }
    const run = chain.then(async () => {
      try {
        return await task();
      } catch (error) {
        console.error('[trip-sync] 작업 실패:', error?.name ?? 'Error');
        const result = fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: 'CLIENT_ERROR' });
        settle(result);
        return result;
      }
    });
    chain = run.then(
      () => {},
      () => {},
    );
    return run.finally(() => {
      if (!track) return;
      tracked -= 1;
      if (tracked === 0) setState({ syncing: false });
    });
  }

  let guardianPromise = Promise.resolve();

  /** 대기열과 보호자 판단이 모두 끝날 때까지 기다린다 */
  async function idle() {
    for (;;) {
      const c = chain;
      const g = guardianPromise;
      await c;
      await g;
      if (c === chain && g === guardianPromise) return;
    }
  }

  // ── 할 일 ────────────────────────────────────────────────────────
  /** 다시 판정할 날짜 */
  const pending = new Set();
  /** 실패해서 다시 시도할 날짜 */
  const dirty = new Set();
  /** 동의 철회로 영향받은 날짜 — 재계획 실패 시 기기에서 먼저 반영 */
  const withdrawnDates = new Set();
  /** 동의 철회 뒤 지난 날짜의 조건 값을 지워야 한다 */
  let stripPast = false;
  /** 동반 보호자를 켰다 — 재계획 뒤 보호자 외출이 빠진 날짜를 찾는다 */
  let companionCheck = false;
  /** 다시 만들기를 권하는 날짜 */
  const companionDates = new Set();
  /** '바뀌었어요'를 누른 날짜 — 재계획이 성공하면 확인 완료로 */
  let dailyCheckChange = null;
  /** 즉시 복귀 시트를 닫은 원인 `${date}:${cause}` */
  let dismissedReturn = null;
  let flushQueued = null;
  let openInFlight = null;
  let lastOpenAt = null;
  let lastReadOnly = null;
  let started = false;
  let unsubscribers = [];
  let midnightTimer = null;
  /** 이전 체류(비교 기준) — 계정이 바뀌면 새로 잡는다 */
  let baseline = { accountKey: undefined, stay: undefined };

  function isReadOnly() {
    return store.getStatus().readOnly === true;
  }

  function resetWork() {
    pending.clear();
    dirty.clear();
    withdrawnDates.clear();
    stripPast = false;
    companionCheck = false;
    companionDates.clear();
    dailyCheckChange = null;
    dismissedReturn = null;
  }

  /** 동기화 결과를 신호로 — 실패가 하나라도 있으면 updateFailed, 서버와 맞춘 것이 있으면 풀린다 */
  function settle(...results) {
    const failure = results.find((r) => r?.ok === false && (r.code === TRIP_ERROR.UPDATE_FAILED || r.code === TRIP_ERROR.STORE_FAILED));
    if (failure) {
      setState({ updateFailed: true, lastErrorCode: failure.errorCode ?? failure.code });
    } else if (results.some((r) => r?.synced === true)) {
      setState({ updateFailed: false, lastErrorCode: null });
    }
  }

  // ── 파생 신호 ────────────────────────────────────────────────────

  function refreshDerived() {
    const { date: today } = clockNow();
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    const gates = selectTodayGates({ stay, prefs: store.readPrefs(), today });
    const day = tripPlan?.days?.[today];
    let immediateReturn = null;
    if (day?.returnNow === true) {
      const cause = (day.reasons ?? []).find((r) => RETURN_CAUSES.includes(r)) ?? null;
      if (dismissedReturn !== `${today}:${cause}`) immediateReturn = { date: today, cause };
    }
    for (const d of [...companionDates]) if (d < today) companionDates.delete(d);
    setState({ today, ...gates, immediateReturn, companionChangeNeedsRegenerate: companionDates.size > 0 });
  }

  let guardianInputs = null;
  let guardianSeq = 0;

  function recomputeGuardian() {
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    if (guardianInputs && guardianInputs[0] === stay && guardianInputs[1] === tripPlan) return;
    guardianInputs = [stay, tripPlan];
    const seq = ++guardianSeq;
    guardianPromise = isGuardianResendNeeded({ stay, tripPlan, share: stay?.guardianShare ?? null }).then(
      (needed) => {
        if (seq === guardianSeq) setState({ guardianResendNeeded: needed === true });
      },
      () => {
        if (seq === guardianSeq) setState({ guardianResendNeeded: false });
      },
    );
  }

  // ── 저장 ─────────────────────────────────────────────────────────

  /**
   * 서버가 준 날짜별 일정을 저장 일정에 합친다. 체류 밖 날짜는 버린다.
   * 요청을 보낸 계정이 아니거나 보기 전용·체류 없음이면 저장하지 않는다.
   */
  function commitDays({ accountKey, days, engineVersion, edits, lang, generatedAt }) {
    const status = store.getStatus();
    if (status.readOnly) return fail(TRIP_ERROR.READ_ONLY);
    if (status.accountKey !== accountKey) return fail(TRIP_ERROR.STORE_FAILED, { errorCode: 'ACCOUNT_CHANGED' });
    const stay = store.readStay();
    if (!stay) return fail(TRIP_ERROR.NO_STAY);
    const allowed = new Set(safeStayDates(stay));
    const current = store.readTripPlan();
    const merged = {};
    for (const [date, day] of Object.entries({ ...(current?.days ?? {}), ...(days ?? {}) })) {
      if (allowed.has(date) && isPlainObject(day)) merged[date] = day;
    }
    const nextEdits = Object.fromEntries(Object.entries(edits ?? current?.edits ?? {}).filter(([date]) => allowed.has(date)));
    const written = store.writeTripPlan({
      engineVersion: engineVersion ?? current?.engineVersion ?? null,
      generatedAt: generatedAt ?? current?.generatedAt ?? nowIso(),
      lang: lang ?? current?.lang ?? langOf(),
      days: merged,
      edits: nextEdits,
    });
    if (!written.ok) return fail(written.code === 'READ_ONLY' ? TRIP_ERROR.READ_ONLY : TRIP_ERROR.STORE_FAILED, { errorCode: written.code });
    setState({ lastSyncAt: nowIso() });
    return { ok: true, synced: true };
  }

  /** 저장 일정의 days 를 고쳐 쓴다(기기 변환). 보기 전용이면 쓰지 않는다 */
  function rewriteDays(mapper) {
    const tripPlan = store.readTripPlan();
    if (!tripPlan || isReadOnly()) return;
    const days = mapper(tripPlan.days ?? {});
    if (days !== tripPlan.days) store.writeTripPlan({ ...tripPlan, days });
  }

  // ── API ──────────────────────────────────────────────────────────

  function readEvents() {
    return store.readTodayEvents();
  }

  /** 일정 요청 — 저장하지 않는다 */
  async function requestPlan({ stay, tripPlan, dates, withoutPrevious, edits }) {
    const accountKey = store.getStatus().accountKey;
    const body = buildPlanBody({
      stay,
      tripPlan,
      dates,
      withoutPrevious,
      edits,
      lang: langOf(),
      today: clockNow().date,
      events: readEvents(),
      nowIso: nowIso(),
    });
    const res = await api.plan(body);
    if (!res.ok) return fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: res.errorCode });
    if (!isPlainObject(res.data?.days)) return fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: 'BAD_RESPONSE' });
    return { ok: true, accountKey, days: res.data.days, engineVersion: res.data.engineVersion };
  }

  /** 날짜들을 재계획하고 저장한다 */
  async function replanDates(dates, { edits, withoutPrevious } = {}) {
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    if (!stay) return fail(TRIP_ERROR.NO_STAY);
    const res = await requestPlan({ stay, tripPlan, dates, withoutPrevious, edits });
    if (!res.ok) return res;
    const written = commitDays({ accountKey: res.accountKey, days: res.days, engineVersion: res.engineVersion, edits });
    return written.ok ? { ...written, dates } : written;
  }

  /** 처음 생성 — 체류 전체를 한 번 만들고 확정 일정으로 저장한다 (spec 4.9) */
  async function generateInitial(stay) {
    const lang = langOf();
    const res = await requestPlan({ stay, tripPlan: null, dates: undefined });
    if (!res.ok) return res;
    if (store.readTripPlan()) return { ok: true }; // 그사이 다른 탭이 만들었다
    const status = store.getStatus();
    if (status.readOnly) return fail(TRIP_ERROR.READ_ONLY);
    if (status.accountKey !== res.accountKey || !store.readStay()) return fail(TRIP_ERROR.STORE_FAILED, { errorCode: 'ACCOUNT_CHANGED' });
    const allowed = new Set(safeStayDates(store.readStay()));
    const days = Object.fromEntries(Object.entries(res.days).filter(([date]) => allowed.has(date)));
    const written = store.writeTripPlan({ engineVersion: res.engineVersion ?? null, generatedAt: nowIso(), lang, days, edits: {} });
    if (!written.ok) return fail(TRIP_ERROR.STORE_FAILED, { errorCode: written.code });
    setState({ lastSyncAt: nowIso() });
    return { ok: true, synced: true, generated: true };
  }

  /** 언어 변경 — 오늘 이후 날짜의 표시만 다시 쓴다(relabelOnly, 규칙 51) */
  async function relabel(stay, tripPlan, lang) {
    const { date: today } = clockNow();
    const dates = Object.keys(tripPlan.days ?? {})
      .filter((d) => d >= today && isStayDate(stay, d))
      .sort();
    const accountKey = store.getStatus().accountKey;
    if (dates.length === 0) return commitDays({ accountKey, days: {}, lang });
    const res = await api.plan(buildRelabelBody({ stay, tripPlan, dates, lang, nowIso: nowIso() }));
    if (!res.ok) return fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: res.errorCode });
    if (!isPlainObject(res.data?.days)) return fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: 'BAD_RESPONSE' });
    return commitDays({ accountKey, days: res.data.days, engineVersion: res.data.engineVersion, lang });
  }

  // ── 재계획 묶음 (flush) ───────────────────────────────────────────

  /** 체류 밖 날짜의 일정·편집 기록을 지운다 */
  function pruneOutside(stay) {
    const tripPlan = store.readTripPlan();
    if (!tripPlan) return;
    const allowed = new Set(safeStayDates(stay));
    const outside = (record) => Object.keys(record ?? {}).some((date) => !allowed.has(date));
    if (!outside(tripPlan.days) && !outside(tripPlan.edits)) return;
    const keep = (record) => Object.fromEntries(Object.entries(record ?? {}).filter(([date]) => allowed.has(date)));
    store.writeTripPlan({ ...tripPlan, days: keep(tripPlan.days), edits: keep(tripPlan.edits) });
  }

  /** 동반 보호자를 켠 뒤: 환자 외출이 있고 보호자 외출이 없는데 보호자 단독 외출이 가능한 날짜 */
  function evaluateCompanion(dates) {
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    const { date: today } = clockNow();
    if (stay?.hasCompanion !== true || !tripPlan) return;
    for (const date of dates) {
      if (date < today || !isStayDate(stay, date)) continue;
      const day = tripPlan.days?.[date];
      if (!day || (day.outings ?? []).length === 0 || (day.guardianOutings ?? []).length > 0) continue;
      if (classifyDate(stay, date).guardianSoloAllowed) companionDates.add(date);
    }
  }

  /**
   * 모인 날짜를 재계획한다. 대기열 안에서만 부른다.
   * 순서: (일정 없음 → 처음 생성) → 체류 밖 날짜 정리 → 동의 철회면 지난 날짜 조건 값 삭제 → 언어가 바뀌었으면 표시만 다시 쓰기 → 재계획
   */
  async function flush() {
    if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY); // 할 일은 남겨 둔다
    const stay = store.readStay();
    if (!stay || !validateStay(stay).ok) {
      pending.clear();
      withdrawnDates.clear();
      return { ok: true, dates: [] };
    }
    const { date: today, minutes: nowMin } = clockNow();
    if (!store.readTripPlan()) {
      pending.clear();
      dirty.clear();
      withdrawnDates.clear();
      stripPast = false;
      return generateInitial(stay);
    }
    pruneOutside(stay);
    if (stripPast) {
      stripPast = false;
      rewriteDays((days) => Object.fromEntries(Object.entries(days).map(([d, day]) => [d, d < today ? stripConditionData(day) : day])));
    }

    const results = [];
    const lang = langOf();
    if (store.readTripPlan().lang !== lang) results.push(await relabel(stay, store.readTripPlan(), lang));

    const current = store.readTripPlan();
    const dates = [...new Set([...pending, ...dirty])]
      .filter((d) => isStayDate(stay, d) && (d >= today || !current?.days?.[d]))
      .sort();
    const withdrawn = [...withdrawnDates];
    const companion = companionCheck;
    const confirmDate = dailyCheckChange === today ? today : null;
    pending.clear();
    dirty.clear();
    withdrawnDates.clear();
    companionCheck = false;

    if (dates.length > 0) {
      const outcome = await replanDates(dates);
      results.push(outcome);
      if (!outcome.ok) {
        dates.forEach((d) => dirty.add(d));
        if (companion) companionCheck = true;
        if (withdrawn.length > 0 && store.readStay()) {
          rewriteDays(() => markConsentWithdrawnLocally({ tripPlan: store.readTripPlan(), stay: store.readStay(), dates: withdrawn, today, nowMin }));
        }
        return combine(results, dates);
      }
      if (companion) evaluateCompanion(dates);
    }
    if (confirmDate && store.confirmDailyCheck(confirmDate).ok) dailyCheckChange = null;
    return combine(results, dates);
  }

  function combine(results, dates) {
    const failure = results.find((r) => r?.ok === false);
    if (failure) return { ...failure, dates };
    return { ok: true, synced: results.some((r) => r?.synced === true), dates };
  }

  function scheduleFlush() {
    if (flushQueued) return flushQueued;
    flushQueued = enqueue(async () => {
      flushQueued = null;
      const result = await flush();
      settle(result);
      refreshDerived();
      return result;
    });
    return flushQueued;
  }

  // ── 저장소 구독 ───────────────────────────────────────────────────

  function onStay() {
    const status = store.getStatus();
    const next = store.readStay();
    if (baseline.accountKey !== status.accountKey) {
      resetWork();
      baseline = { accountKey: status.accountKey, stay: next };
      refreshDerived();
      recomputeGuardian();
      if (next && !status.readOnly) scheduleFlush();
      return;
    }
    const prev = baseline.stay;
    if (prev === next) return;
    baseline = { accountKey: status.accountKey, stay: next };
    refreshDerived();
    recomputeGuardian();
    if (!next) {
      resetWork();
      refreshDerived();
      return;
    }
    const diff = diffStay(prev ?? null, next);
    diff.dates.forEach((d) => pending.add(d));
    if (diff.consentWithdrawn) {
      diff.dates.forEach((d) => withdrawnDates.add(d));
      stripPast = true;
    }
    if (diff.companionTurnedOn) companionCheck = true;
    if (diff.companionTurnedOff) {
      companionCheck = false;
      companionDates.clear();
      refreshDerived();
    }
    const { date: today } = clockNow();
    if (dailyCheckChange === today) pending.add(today);
    if (pending.size > 0 || diff.removedDates.length > 0 || !store.readTripPlan()) scheduleFlush();
  }

  function onTripPlan() {
    refreshDerived();
    recomputeGuardian();
  }

  function onPrefs() {
    refreshDerived();
    const tripPlan = store.readTripPlan();
    if (tripPlan && !isReadOnly() && tripPlan.lang !== langOf()) scheduleFlush();
  }

  function onStatus() {
    const status = store.getStatus();
    const was = lastReadOnly;
    lastReadOnly = status.readOnly;
    if (baseline.accountKey !== status.accountKey) onStay();
    refreshDerived();
    // 보기 전용이 풀렸다 — 건너뛴 앱 열기(연동 재확인·기상)와 남은 재계획을 이어서 한다
    if (was === true && status.readOnly === false && started) void appOpen();
  }

  // ── 앱 열기 (spec 4.1 → 4.20 → 4.9 기상 → 4.6) ──────────────────────

  /** 저장된 연결 코드로 지침을 다시 받아 재확인한다. 바뀐 지침은 사본·기간·병원 일정을 한 번에 갱신한다 */
  async function refreshLinkedPlans() {
    const stay = store.readStay();
    const list = stay?.linkedPlans ?? [];
    if (list.length === 0) return { ok: true, changed: [] };
    const clock = clockNow();
    const fetchedAt = nowIso();
    const updates = [];
    let failure = null;
    for (const linked of list) {
      const res = await api.link(linked.code);
      if (!res.ok) {
        failure ??= res.errorCode ?? 'LINK_FAILED';
        continue;
      }
      let check;
      try {
        check = recheckLinkedPlan(linked.plan, res.data?.plan, { now: clock.ms });
      } catch {
        failure ??= 'LINK_INVALID';
        continue;
      }
      if (!check.versionChanged && check.changedPeriods.length === 0) continue;
      updates.push({ code: linked.code, hospitalId: linked.hospitalId, planId: linked.plan?.planId, plan: res.data.plan });
    }
    if (updates.length === 0) return failure ? fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: failure }) : { ok: true, changed: [] };

    // 받는 동안 사용자가 체류를 고쳤을 수 있다 — 지금 체류 위에 합친다. 그사이 지운 연결(동의 철회 등)은 되살리지 않는다
    const latest = store.readStay();
    if (!latest || isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
    let merged = latest;
    const changed = [];
    let cause = null;
    for (const update of updates) {
      if (!(merged.linkedPlans ?? []).some((lp) => lp.code === update.code)) continue;
      let next;
      try {
        next = applyLinkedPlan(merged, { code: update.code, plan: update.plan, hospital: { kind: 'EXISTING', id: update.hospitalId }, fetchedAt }).stay;
      } catch {
        failure ??= 'LINK_MERGE_FAILED';
        continue;
      }
      if (validateStay(merged).ok && !validateStay(next).ok) {
        failure ??= 'LINK_MERGE_INVALID';
        continue;
      }
      cause ??= immediateReturnCauseFor({
        day: store.readTripPlan()?.days?.[clock.date] ?? null,
        periods: next.periods,
        planId: update.planId,
        today: clock.date,
        nowMin: clock.minutes,
      });
      merged = next;
      changed.push(update.code);
    }

    // 외출 중 철회·만료 — 오늘 남은 일정을 먼저 비운다(재계획이 실패해도 즉시 복귀는 반영된다)
    if (cause) {
      const tripPlan = store.readTripPlan();
      const day = tripPlan?.days?.[clock.date];
      if (day) {
        const next = applyImmediateReturn(day, { now: clock.ms, cause, stay: merged });
        store.writeTripPlan({ ...tripPlan, days: { ...tripPlan.days, [clock.date]: next } });
        dismissedReturn = null;
      }
    }
    if (merged !== latest) {
      const written = store.updateStay(() => merged); // 구독(onStay)이 영향 날짜를 모은다
      if (!written.ok) failure ??= written.code ?? 'STORE_FAILED';
    }
    return failure ? fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: failure, changed }) : { ok: true, synced: true, changed };
  }

  /**
   * 저장된 하루가 지금 체류와 맞는가 — 분류·숙소·적용 조건(effective 는 분류 결과를 그대로 복사한 값)·병원 일정 블록.
   * 실행기가 꺼져 있던 동안(다른 화면·새로고침 전) 바뀐 체류나 전에 실패한 재계획을 앱을 열 때 다시 잡는다.
   * 추천 중단(SERVICE_PAUSED) 응답은 비교하지 않는다.
   */
  function dayMatchesStay(stay, date, day) {
    if ((day.reasons ?? []).includes(REASON.SERVICE_PAUSED)) return true;
    const cls = classifyDate(stay, date);
    if (cls.coverage !== day.coverage || (cls.lodgingId ?? null) !== (day.lodgingId ?? null)) return false;
    if (canonicalJson(cls.effective ?? {}) !== canonicalJson(day.effective ?? {})) return false;
    const blocks = (day.blocks ?? []).filter((b) => b?.kind === 'APPOINTMENT');
    const appointments = appointmentsOnDate(stay, date);
    if (blocks.length !== appointments.length) return false;
    return appointments.every((a) => {
      const block = blocks.find((b) => b.appointmentId === a.id);
      if (!block) return false;
      const endMin = Math.min(appointmentEnd(a).endMin, 24 * 60 - 1);
      return toMinutes(block.start) <= toMinutes(a.start) && toMinutes(block.end) >= endMin;
    });
  }

  /** 오늘 이후 날짜 중 저장 일정이 없거나 지금 체류와 어긋난 날짜 */
  function staleDates(stay, tripPlan, today) {
    return safeStayDates(stay).filter((date) => {
      if (date < today) return false;
      const day = tripPlan.days?.[date];
      if (!day) return true;
      try {
        return !dayMatchesStay(stay, date, day);
      } catch {
        return true;
      }
    });
  }

  async function runAppOpen() {
    const opened = store.onAppOpen(); // 1. 자동 삭제가 먼저다 (spec 4.1 · 규칙 42)
    lastOpenAt = now();
    refreshDerived();
    const autoDeleted = opened?.activeAccountDeleted === true;
    if (isReadOnly()) return { ok: true, readOnly: true, autoDeleted };
    if (!store.readStay()) return { ok: true, autoDeleted };

    const linked = await refreshLinkedPlans(); // 2. 연동 지침 재확인 (spec 4.20)

    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    if (stay && tripPlan && validateStay(stay).ok) {
      // 3. 기상: 오늘~모레 (서버가 예보를 반영한다 — 실제 변화만 전후 비교를 만든다) + 어긋난 날짜
      const { date: today } = clockNow();
      for (let i = 0; i <= WEATHER_DAYS_AHEAD; i += 1) {
        const date = addDays(today, i);
        if (isStayDate(stay, date)) pending.add(date);
      }
      staleDates(stay, tripPlan, today).forEach((d) => pending.add(d));
    }
    const replanned = await flush();
    settle(linked, replanned);
    refreshDerived(); // 4. 매일 확인 신호 (spec 4.6)
    recomputeGuardian();
    return {
      ok: linked.ok !== false && replanned.ok !== false,
      autoDeleted,
      linked: linked.changed ?? [],
      replanned: replanned.dates ?? [],
      ...(linked.ok === false ? { errorCode: linked.errorCode } : replanned.ok === false ? { errorCode: replanned.errorCode ?? replanned.code } : {}),
    };
  }

  /** 앱 열기 순서 전체 — 진행 중이면 같은 약속을 돌려준다 */
  function appOpen() {
    if (openInFlight) return openInFlight;
    openInFlight = enqueue(runAppOpen).finally(() => {
      openInFlight = null;
    });
    return openInFlight;
  }

  /** 앱을 처음 열 때 한 번 */
  function openOnce() {
    if (lastOpenAt !== null || openInFlight) return openInFlight ?? Promise.resolve({ ok: true, skipped: true });
    return appOpen();
  }

  /** 화면으로 돌아올 때 — 짧은 간격 안이면 기기 쪽 확인(자동 삭제·신호)만 */
  function resume({ force = false } = {}) {
    if (!force && lastOpenAt !== null && now() - lastOpenAt < resumeIntervalMs) {
      store.onAppOpen();
      refreshDerived();
      return Promise.resolve({ ok: true, throttled: true });
    }
    return appOpen();
  }

  function scheduleMidnight() {
    if (!timers || !started) return;
    if (midnightTimer !== null) timers.clearTimeout(midnightTimer);
    const { date } = clockNow();
    const wait = kstInstantMs(addDays(date, 1), '00:00') + 1000 - now();
    midnightTimer = timers.setTimeout(() => {
      midnightTimer = null;
      void resume({ force: true });
      scheduleMidnight();
    }, Math.min(Math.max(wait, 1000), MAX_TIMER_MS));
  }

  // ── 시작·정지 ────────────────────────────────────────────────────

  function start() {
    if (started) return stop;
    started = true;
    const status = store.getStatus();
    baseline = { accountKey: status.accountKey, stay: store.readStay() };
    lastReadOnly = status.readOnly;
    unsubscribers = [
      store.subscribe('stay', onStay),
      store.subscribe('tripPlan', onTripPlan),
      store.subscribe('prefs', onPrefs),
      store.subscribe('status', onStatus),
    ];
    refreshDerived();
    recomputeGuardian();
    scheduleMidnight();
    return stop;
  }

  function stop() {
    started = false;
    for (const off of unsubscribers) off();
    unsubscribers = [];
    if (midnightTimer !== null && timers) timers.clearTimeout(midnightTimer);
    midnightTimer = null;
  }

  // ── 매일 확인 (spec 4.6) ─────────────────────────────────────────

  /** '그대로예요' — 오늘을 확인 완료로. 재계획하지 않는다 */
  function confirmDailyCheck() {
    if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
    const { date: today } = clockNow();
    const result = store.confirmDailyCheck(today);
    if (result.ok && dailyCheckChange === today) dailyCheckChange = null;
    refreshDerived();
    return result;
  }

  /** '바뀌었어요' — 화면은 조건 편집으로 간다. 저장하면 오늘과 고친 기간의 날짜를 재계획한 뒤 확인 완료가 된다 */
  function dailyCheckChanged() {
    if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
    dailyCheckChange = clockNow().date;
    return { ok: true };
  }

  /** '바뀌었어요' 뒤 편집을 저장하지 않고 끝냈을 때(바꿀 것이 없었다) — 오늘을 재계획하고 확인 완료로 */
  function completeDailyCheckChange() {
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    const { date: today } = clockNow();
    dailyCheckChange = today;
    pending.add(today);
    return scheduleFlush();
  }

  // ── 편집 (spec 4.10) ─────────────────────────────────────────────

  function guardDate(date) {
    if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
    const stay = store.readStay();
    if (!stay) return fail(TRIP_ERROR.NO_STAY);
    const tripPlan = store.readTripPlan();
    if (!tripPlan) return fail(TRIP_ERROR.NO_TRIP_PLAN);
    const clock = clockNow();
    if (!isStayDate(stay, date)) return fail(TRIP_ERROR.NOT_IN_STAY);
    if (date < clock.date) return fail(TRIP_ERROR.PAST_DATE);
    if (date === clock.date && selectTodayGates({ stay, prefs: store.readPrefs(), today: clock.date }).dailyCheckPending) {
      return fail(TRIP_ERROR.DAILY_CHECK_PENDING);
    }
    return { ok: true, stay, tripPlan, clock };
  }

  /** 먼저 빠르게 거르고, 대기열 차례가 오면 다시 거른 뒤 실행한다 */
  function editTask(date, run, options) {
    const first = guardDate(date);
    if (!first.ok) return Promise.resolve(first);
    return enqueue(async () => {
      const ctx = guardDate(date);
      if (!ctx.ok) return ctx;
      return run(ctx);
    }, options);
  }

  function stopStarted(stop, clock, date) {
    return date === clock.date && toMinutes(stop.arriveAt) <= clock.minutes;
  }

  /** 편집 기록과 함께 그 날짜를 재계획하고, 성공했을 때만 일정·편집 기록을 저장한다 */
  async function replanWithEdits({ date, dates = [date], edits, withoutPrevious, check }) {
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    const res = await requestPlan({ stay, tripPlan, dates, withoutPrevious, edits });
    if (!res.ok) {
      settle(res);
      return res;
    }
    if (check && !check(res.days)) return fail(TRIP_ERROR.SWAP_NOT_PLACED);
    const written = commitDays({ accountKey: res.accountKey, days: res.days, engineVersion: res.engineVersion, edits });
    settle(written);
    refreshDerived();
    return written.ok ? { ok: true, days: Object.fromEntries(dates.map((d) => [d, store.readTripPlan()?.days?.[d] ?? null])) } : written;
  }

  /** 교체 후보 (최대 5개) — 저장하지 않는다 */
  function alternatives(date, outingId, stopId) {
    return editTask(
      date,
      async ({ stay, tripPlan, clock }) => {
        const found = findStop(tripPlan.days?.[date], stopId);
        if (!found || found.outing.id !== outingId) return fail(TRIP_ERROR.NOT_FOUND);
        if (stopStarted(found.stop, clock, date)) return fail(TRIP_ERROR.STOP_STARTED);
        const res = await api.alternatives(
          buildAlternativesBody({ stay, tripPlan, date, outingId, stopId, lang: langOf(), today: clock.date, events: readEvents(), nowIso: nowIso() }),
        );
        if (!res.ok) return fail(TRIP_ERROR.UPDATE_FAILED, { errorCode: res.errorCode });
        return {
          ok: true,
          alternatives: Array.isArray(res.data?.alternatives) ? res.data.alternatives : [],
          ...(res.data?.servicePaused ? { servicePaused: true } : {}),
        };
      },
      { track: false },
    );
  }

  /**
   * 교체 — 고른 후보(alternatives 의 항목 `{ stop }` 또는 contentId)를 옛 정거장 자리에 넣는다.
   * 요청: edits {pinned:[새], deleted:[옛]} + 교체 전 하루(previous). 고른 장소가 들어가지 못하면 저장하지 않는다.
   */
  function applySwap(date, stopId, alternative) {
    return editTask(date, async ({ tripPlan, clock }) => {
      const found = findStop(tripPlan.days?.[date], stopId);
      if (!found) return fail(TRIP_ERROR.NOT_FOUND);
      if (stopStarted(found.stop, clock, date)) return fail(TRIP_ERROR.STOP_STARTED);
      const raw = alternative?.stop?.contentId ?? alternative?.contentId ?? alternative;
      const to = typeof raw === 'number' ? String(raw) : raw;
      if (typeof to !== 'string' || !CONTENT_ID_RE.test(to)) return fail(TRIP_ERROR.INVALID);
      const edits = withSwap(tripPlan.edits, date, { fromContentId: found.stop.contentId, toContentId: to });
      return replanWithEdits({ date, edits, check: (days) => dayContentIds(days?.[date]).map(String).includes(to) });
    });
  }

  /** 정거장 삭제 — 식사 칸 식당이면 그 칸을 비움으로 */
  function deleteStop(date, stopId) {
    return editTask(date, async ({ tripPlan, clock }) => {
      const found = findStop(tripPlan.days?.[date], stopId);
      if (!found) return fail(TRIP_ERROR.NOT_FOUND);
      if (stopStarted(found.stop, clock, date)) return fail(TRIP_ERROR.STOP_STARTED);
      const edits = withDelete(tripPlan.edits, date, { contentId: found.stop.contentId, slot: found.slot });
      return replanWithEdits({ date, edits });
    });
  }

  /** 식사 칸 비움 — 자동으로 다시 채우지 않는다 */
  function clearMeal(date, slot) {
    if (!MEAL_SLOTS.includes(slot)) return Promise.resolve(isReadOnly() ? fail(TRIP_ERROR.READ_ONLY) : fail(TRIP_ERROR.INVALID));
    return editTask(date, async ({ tripPlan }) => replanWithEdits({ date, edits: withClearedMeal(tripPlan.edits, date, slot) }));
  }

  /**
   * 다시 만들기 — 'DAY'(이 날짜) 또는 'FROM_TODAY'(오늘 이후 전체). 범위의 편집 기록을 지우고 새로 만든다.
   * 일정 API 에는 다시 만들기 스위치가 없으므로 previous 를 빼고 보낸다(새로 만든다). 단, 오늘 이미 출발한 외출이 있거나
   * 즉시 복귀 중이면 오늘은 previous 를 보낸다 — 시작된 정거장과 복귀 상태를 지키기 위해서다(재계획 규칙 2, spec 4.9).
   */
  function regenerate(scope, date) {
    if (scope !== 'DAY' && scope !== 'FROM_TODAY') return Promise.resolve(isReadOnly() ? fail(TRIP_ERROR.READ_ONLY) : fail(TRIP_ERROR.INVALID));
    const run = async ({ stay, tripPlan, clock }) => {
      const dates = scope === 'DAY' ? [date] : safeStayDates(stay).filter((d) => d >= clock.date);
      if (dates.length === 0) return { ok: true, days: {} };
      const todayDay = tripPlan.days?.[clock.date];
      const keepToday =
        dates.includes(clock.date) &&
        todayDay &&
        (todayDay.returnNow === true ||
          [...(todayDay.outings ?? []), ...(todayDay.guardianOutings ?? [])].some((o) => toMinutes(o.departAt) <= clock.minutes));
      const withoutPrevious = dates.filter((d) => !(keepToday && d === clock.date));
      const result = await replanWithEdits({ date: dates[0], dates, edits: withoutDates(tripPlan.edits, dates), withoutPrevious });
      if (result.ok) {
        dates.forEach((d) => companionDates.delete(d));
        refreshDerived();
      }
      return result;
    };
    if (scope === 'DAY') return editTask(date, run);
    // 오늘 이후 전체: 오늘이 체류 안이면 오늘 편집 규칙(매일 확인)을 따른다
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    const today = clockNow().date;
    const stay = store.readStay();
    if (stay && isStayDate(stay, today)) return editTask(today, run);
    return enqueue(async () => {
      if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
      const s = store.readStay();
      const t = store.readTripPlan();
      if (!s) return fail(TRIP_ERROR.NO_STAY);
      if (!t) return fail(TRIP_ERROR.NO_TRIP_PLAN);
      return run({ stay: s, tripPlan: t, clock: clockNow() });
    });
  }

  // ── 데모 사건 (spec 4.9 DemoEvent, 규칙 50·55) ─────────────────────

  async function replanToday() {
    const stay = store.readStay();
    const tripPlan = store.readTripPlan();
    const { date: today } = clockNow();
    if (!stay || !tripPlan || !isStayDate(stay, today) || !validateStay(stay).ok) return { ok: true };
    const result = await replanDates([today]);
    if (!result.ok) dirty.add(today);
    settle(result);
    refreshDerived();
    return result;
  }

  /** 데모 사건 추가 → 저장(누적) 후 오늘을 재계획한다. 요청에는 오늘 사건 **전체**가 실린다 */
  function addDemoEvent(event) {
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    const [clean] = normalizeTodayEvents([event]);
    if (!clean) return Promise.resolve(fail(TRIP_ERROR.INVALID));
    return enqueue(async () => {
      if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
      const written = store.appendTodayEvent(clean);
      if (!written.ok) return fail(written.code === 'READ_ONLY' ? TRIP_ERROR.READ_ONLY : TRIP_ERROR.STORE_FAILED);
      dismissedReturn = null;
      return replanToday();
    });
  }

  /** 데모 패널 '사건 초기화' — 사건을 지우고 오늘을 재계획한다 */
  function resetDemoEvents() {
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    return enqueue(async () => {
      if (isReadOnly()) return fail(TRIP_ERROR.READ_ONLY);
      const cleared = store.clearTodayEvents();
      if (!cleared.ok) return fail(TRIP_ERROR.STORE_FAILED);
      dismissedReturn = null;
      return replanToday();
    });
  }

  // ── 기타 동작 ────────────────────────────────────────────────────

  /** '변경됨'을 봤다 — delta.seen = true */
  function markDeltaSeen(date) {
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    return enqueue(
      async () => {
        const tripPlan = store.readTripPlan();
        const day = tripPlan?.days?.[date];
        if (!day?.delta || day.delta.seen === true) return { ok: true };
        const written = store.writeTripPlan({ ...tripPlan, days: { ...tripPlan.days, [date]: { ...day, delta: { ...day.delta, seen: true } } } });
        return written.ok ? { ok: true } : fail(TRIP_ERROR.STORE_FAILED, { errorCode: written.code });
      },
      { track: false },
    );
  }

  /** 즉시 복귀 시트를 닫았다 — 저장 일정의 returnNow 는 그대로다(해제 조건은 spec 4.9) */
  function dismissImmediateReturn() {
    const current = state.immediateReturn;
    if (current) dismissedReturn = `${current.date}:${current.cause}`;
    refreshDerived();
  }

  /** '다시 만들기' 안내를 닫았다 */
  function dismissCompanionNotice() {
    companionDates.clear();
    refreshDerived();
  }

  /** 실패한 날짜를 다시 시도한다(일정이 없으면 처음 생성) */
  function retry() {
    if (isReadOnly()) return Promise.resolve(fail(TRIP_ERROR.READ_ONLY));
    dirty.forEach((d) => pending.add(d));
    return scheduleFlush();
  }

  // ── 표시 ─────────────────────────────────────────────────────────

  let viewMemo = null;

  /** 오늘 표시용 일정 `{ date, stored, day, gates }` — 같은 입력이면 같은 객체 */
  function todayView() {
    const today = clockNow().date;
    const tripPlan = store.readTripPlan();
    const stay = store.readStay();
    const prefs = store.readPrefs();
    if (viewMemo && viewMemo.today === today && viewMemo.tripPlan === tripPlan && viewMemo.stay === stay && viewMemo.prefs === prefs) {
      return viewMemo.value;
    }
    const value = Object.freeze(selectTodayView({ tripPlan, stay, prefs, today }));
    viewMemo = { today, tripPlan, stay, prefs, value };
    return value;
  }

  /** 날짜 하나의 표시용 일정 — 오늘만 덧씌운다 */
  function dayView(date) {
    const today = clockNow().date;
    if (date === today) return todayView().day;
    return selectDayView({ tripPlan: store.readTripPlan(), stay: store.readStay(), prefs: store.readPrefs(), today, date });
  }

  return Object.freeze({
    start,
    stop,
    idle,
    getState,
    subscribe,
    appOpen,
    openOnce,
    resume,
    refresh: () => appOpen(),
    retry,
    confirmDailyCheck,
    dailyCheckChanged,
    completeDailyCheckChange,
    alternatives,
    applySwap,
    deleteStop,
    clearMeal,
    regenerate,
    addDemoEvent,
    resetDemoEvents,
    markDeltaSeen,
    dismissImmediateReturn,
    dismissCompanionNotice,
    todayView,
    dayView,
  });
}
