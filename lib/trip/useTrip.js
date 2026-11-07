'use client';

// 오늘·일정 화면용 React 훅 (AX-316 · spec 4.6, 4.9, 4.10, 4.11, 4.18)
//
//   const trip = useTrip();
//   trip.today.day            오늘 표시용 일정(매일 확인·병원 중요 안내 대기면 STANDBY 덧씌움 — 저장값은 그대로, 규칙 49)
//   trip.dailyCheckPending    → trip.confirmDailyCheck() ('그대로예요') / trip.dailyCheckChanged() ('바뀌었어요' → 조건 편집)
//   trip.immediateReturn      { date, cause } 이면 즉시 복귀 시트를 자동으로 연다. 뒤로가기는 trip.dismissImmediateReturn()
//   trip.overdueReturn        { date, outingId, returnBy } 이면 마감 지남 시트(일정 유지)를 연다. 닫기는 trip.dismissOverdueReturn()
//   trip.updateFailed         '업데이트 실패' — trip.retry()
//   trip.applySwap(date, stopId, alternative) 등 편집 동작은 `{ ok } | { ok: false, code }` 를 돌려준다(TRIP_ERROR)
//
// - 실행기는 브라우저에 하나다(getTripSync). 첫 마운트에서 저장소 구독을 시작하고 앱 열기 순서를 한 번 실행한다.
//   화면이 다시 보이면(visibilitychange·pageshow) resume() — 짧은 간격 안이면 기기 쪽 확인만 한다.
// - 서버 렌더·하이드레이션 중에는 빈 값(일정 없음·신호 꺼짐)을 준다. 저장소 값은 마운트 뒤에 그린다.
// - 보기 전용이면 편집 동작이 READ_ONLY 로 거절된다(버튼은 trip.readOnly 로 끈다).

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { READ_ONLY_REASON, getStore } from '../store/index.js';
import { getTripSync } from './client.js';
import { selectDayView, selectTodayView } from './display.js';
import { TRIP_ERROR } from './runtime.js';

const SERVER_STATE = Object.freeze({
  today: null,
  syncing: false,
  lastSyncAt: null,
  updateFailed: false,
  lastErrorCode: null,
  dailyCheckPending: false,
  unconfirmedHospitalUpdate: false,
  immediateReturn: null,
  overdueReturn: null,
  guardianResendNeeded: false,
  companionChangeNeedsRegenerate: false,
});

const SERVER_STATUS = Object.freeze({
  sessionChecked: false,
  authenticated: false,
  online: true,
  readOnly: true,
  reason: READ_ONLY_REASON.NO_SESSION,
  accountKey: null,
  persistent: false,
  logoutPending: false,
});

const EMPTY_LIST = Object.freeze([]);
const EMPTY_TODAY = Object.freeze({
  date: null,
  stored: null,
  day: null,
  gates: Object.freeze({ dailyCheckPending: false, unconfirmedHospitalUpdate: false }),
});

const READ_ONLY = Object.freeze({ ok: false, code: TRIP_ERROR.READ_ONLY });
const refuse = () => Promise.resolve(READ_ONLY);
const refuseSync = () => READ_ONLY;
const noop = () => {};

const noopSubscribe = () => noop;
const serverNull = () => null;
const serverState = () => SERVER_STATE;
const serverStatus = () => SERVER_STATUS;
const serverList = () => EMPTY_LIST;

const subscribers = new Map();
/** 저장소 주제 구독 함수 — 같은 주제면 같은 함수(useSyncExternalStore 가 다시 구독하지 않게) */
function topic(name) {
  if (!subscribers.has(name)) subscribers.set(name, (onChange) => getStore().subscribe(name, onChange));
  return subscribers.get(name);
}

const readStatus = () => getStore().getStatus();
const readStay = () => getStore().readStay();
const readTripPlan = () => getStore().readTripPlan();
const readPrefs = () => getStore().readPrefs();
const readTodayEvents = () => getStore().readTodayEvents();

let lifecycleAttached = false;

/** 화면으로 돌아올 때 재확인 — 문서에 한 번만 건다 */
function attachLifecycle(sync) {
  if (lifecycleAttached || typeof document === 'undefined') return;
  lifecycleAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync.resume();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void sync.resume();
  });
}

/**
 * @returns {{
 *   todayDate: string|null,
 *   syncing: boolean, lastSyncAt: string|null, updateFailed: boolean, lastErrorCode: string|null,
 *   dailyCheckPending: boolean, unconfirmedHospitalUpdate: boolean,
 *   immediateReturn: {date: string, cause: string|null} | null,   cause 는 RETURN_NOW_CAUSES(src/domain/states.js) 중 하나
 *     (PATIENT_RECALLED | PLAN_REVOKED | PLAN_EXPIRED | OUTING_OVERDUE)
 *   overdueReturn: {date: string, outingId: string, returnBy: string} | null,
 *   guardianResendNeeded: boolean, companionChangeNeedsRegenerate: boolean,
 *   status: object, readOnly: boolean,
 *   stay: object|null, tripPlan: object|null, prefs: object|null, todayEvents: object[],
 *   today: {date: string|null, stored: object|null, day: object|null, gates: {dailyCheckPending: boolean, unconfirmedHospitalUpdate: boolean}},
 *   dayView: (date: string) => object|null,
 *   refresh: () => Promise<object>, retry: () => Promise<object>,
 *   confirmDailyCheck: () => object, dailyCheckChanged: () => object, completeDailyCheckChange: () => Promise<object>,
 *   alternatives: (date: string, outingId: string, stopId: string) => Promise<object>,
 *   applySwap: (date: string, stopId: string, alternative: object|string) => Promise<object>,
 *   deleteStop: (date: string, stopId: string) => Promise<object>,
 *   clearMeal: (date: string, slot: 'LUNCH'|'DINNER') => Promise<object>,
 *   regenerate: (scope: 'DAY'|'FROM_TODAY', date?: string) => Promise<object>,
 *   addDemoEvent: (event: object) => Promise<object>, resetDemoEvents: () => Promise<object>,
 *   markDeltaSeen: (date: string) => Promise<object>,
 *   dismissImmediateReturn: () => void, dismissOverdueReturn: () => void, dismissCompanionNotice: () => void,
 * }}
 */
export function useTrip() {
  const sync = getTripSync();
  const state = useSyncExternalStore(sync ? sync.subscribe : noopSubscribe, sync ? sync.getState : serverState, serverState);
  const status = useSyncExternalStore(topic('status'), readStatus, serverStatus);
  const stay = useSyncExternalStore(topic('stay'), readStay, serverNull);
  const tripPlan = useSyncExternalStore(topic('tripPlan'), readTripPlan, serverNull);
  const prefs = useSyncExternalStore(topic('prefs'), readPrefs, serverNull);
  const todayEvents = useSyncExternalStore(topic('todayEvents'), readTodayEvents, serverList);

  useEffect(() => {
    if (!sync) return;
    sync.start();
    void sync.openOnce();
    attachLifecycle(sync);
  }, [sync]);

  const todayDate = state.today;
  const today = useMemo(
    () => (todayDate ? selectTodayView({ tripPlan, stay, prefs, today: todayDate }) : EMPTY_TODAY),
    [tripPlan, stay, prefs, todayDate],
  );
  const dayView = useCallback(
    (date) => {
      if (!todayDate) return null;
      return date === todayDate ? today.day : selectDayView({ tripPlan, stay, prefs, today: todayDate, date });
    },
    [tripPlan, stay, prefs, todayDate, today],
  );

  return {
    todayDate,
    syncing: state.syncing,
    lastSyncAt: state.lastSyncAt,
    updateFailed: state.updateFailed,
    lastErrorCode: state.lastErrorCode,
    dailyCheckPending: state.dailyCheckPending,
    unconfirmedHospitalUpdate: state.unconfirmedHospitalUpdate,
    immediateReturn: state.immediateReturn,
    overdueReturn: state.overdueReturn,
    guardianResendNeeded: state.guardianResendNeeded,
    companionChangeNeedsRegenerate: state.companionChangeNeedsRegenerate,
    status,
    readOnly: status.readOnly,
    stay,
    tripPlan,
    prefs,
    todayEvents,
    today,
    dayView,
    refresh: sync ? sync.refresh : refuse,
    retry: sync ? sync.retry : refuse,
    confirmDailyCheck: sync ? sync.confirmDailyCheck : refuseSync,
    dailyCheckChanged: sync ? sync.dailyCheckChanged : refuseSync,
    completeDailyCheckChange: sync ? sync.completeDailyCheckChange : refuse,
    alternatives: sync ? sync.alternatives : refuse,
    applySwap: sync ? sync.applySwap : refuse,
    deleteStop: sync ? sync.deleteStop : refuse,
    clearMeal: sync ? sync.clearMeal : refuse,
    regenerate: sync ? sync.regenerate : refuse,
    addDemoEvent: sync ? sync.addDemoEvent : refuse,
    resetDemoEvents: sync ? sync.resetDemoEvents : refuse,
    markDeltaSeen: sync ? sync.markDeltaSeen : refuse,
    dismissImmediateReturn: sync ? sync.dismissImmediateReturn : noop,
    dismissOverdueReturn: sync ? sync.dismissOverdueReturn : noop,
    dismissCompanionNotice: sync ? sync.dismissCompanionNotice : noop,
  };
}

export default useTrip;
