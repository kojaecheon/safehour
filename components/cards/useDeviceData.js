'use client';

// 기기 저장소 읽기 훅 — 카드·긴급·설정 화면용 (AX-318 · spec 4.18)
//
//   const stay = useStay();                    // 체류(없으면 null)
//   const { today } = useTodayTomorrow() ?? {}; // 오늘·내일(KST) 하루 일정
//   const prefs = usePrefs();                  // { lang, notifications, dailyCheck }
//   const received = useHasGuardianCopies();   // 이 기기에 만료 전 보호자 사본이 있는가(오늘·더보기). 만료 시각이 지나면 화면을 연 채로도 false 가 된다
//
// - **읽기만 한다.** 로그인 만료·오프라인에서도 이 기기에 마지막으로 로그인한 계정의 사본을 읽는다
//   (저장소가 보기 전용에서 읽을 계정을 정한다). 네트워크를 쓰지 않는다.
// - 저장소의 read* 는 바뀌지 않았으면 같은 참조를 준다 — useSyncExternalStore 에 그대로 넘긴다.
// - 서버 렌더와 하이드레이션 첫 그림은 null 이다(저장소는 브라우저에만 있다). 화면은 null 을 '불러오는 중'으로 본다.
// - 계정이 바뀌면(로그인·지우기) 저장소가 모든 항목 주제를 다시 알린다.

import { useSyncExternalStore } from 'react';
import { getStore } from '@/lib/store/index.js';
import { guardianExpiryDelay } from '@/components/guardian/expiry.js';

function subscriber(topics) {
  return (onChange) => {
    const store = getStore();
    const offs = topics.map((topic) => store.subscribe(topic, onChange));
    return () => offs.forEach((off) => off());
  };
}

const subscribeStay = subscriber(['stay']);
const subscribeTripPlan = subscriber(['tripPlan']);
const subscribePrefs = subscriber(['prefs']);

/**
 * 보호자 사본 구독. 저장소는 만료 사본을 읽을 때 치우기만 하고 알리지 않으므로(리뷰 M2), 가장 이른 만료 시각 1초 뒤에
 * 한 번 더 알려 다시 읽게 한다. 저장소가 알릴 때마다 타이머를 다시 잡고, 구독을 끊으면 지운다.
 */
function subscribeGuardianCopies(onChange) {
  const store = getStore();
  let timer = null;
  const clear = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clear();
    const delay = guardianExpiryDelay(store.readGuardianCopies(), Date.now());
    if (delay === null) return;
    timer = window.setTimeout(() => {
      timer = null;
      onChange();
      schedule();
    }, delay);
  };
  const off = store.subscribe('guardianCopies', () => {
    schedule();
    onChange();
  });
  schedule();
  return () => {
    off();
    clear();
  };
}

const readStay = () => getStore().readStay();
const readTodayTomorrow = () => getStore().readTodayTomorrow();
const readPrefs = () => getStore().readPrefs();
const readHasGuardianCopies = () => getStore().readGuardianCopies().length > 0;
const serverNull = () => null;
const serverFalse = () => false;

/** 이 기기의 체류 (spec 5.1 Stay) — 없으면 null */
export function useStay() {
  return useSyncExternalStore(subscribeStay, readStay, serverNull);
}

/** 오늘·내일(KST)의 { date, plan } — 첫 그림(서버·하이드레이션)은 null */
export function useTodayTomorrow() {
  return useSyncExternalStore(subscribeTripPlan, readTodayTomorrow, serverNull);
}

/** 설정 { lang, notifications, dailyCheck } — 첫 그림은 null */
export function usePrefs() {
  return useSyncExternalStore(subscribePrefs, readPrefs, serverNull);
}

/**
 * 이 기기(지금 계정)에 만료 전 보호자 사본이 있는가. 읽기만 한다(사본 내용은 꺼내지 않는다).
 * 서버 렌더·하이드레이션 첫 그림은 false(사본 없음)다. 화면은 사본이 없을 때의 모습을 먼저 그리고, 있으면 바꾼다.
 */
export function useHasGuardianCopies() {
  return useSyncExternalStore(subscribeGuardianCopies, readHasGuardianCopies, serverFalse);
}

const subscribeNothing = () => () => {};

/** 하이드레이션이 끝났는가 — 서버·첫 그림은 false, 그 뒤는 true */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
