'use client';

// 기기 저장소 읽기 훅 — 카드·긴급·설정 화면용 (AX-318 · spec 4.18)
//
//   const stay = useStay();                    // 체류(없으면 null)
//   const { today } = useTodayTomorrow() ?? {}; // 오늘·내일(KST) 하루 일정
//   const prefs = usePrefs();                  // { lang, notifications, dailyCheck }
//
// - **읽기만 한다.** 로그인 만료·오프라인에서도 이 기기에 마지막으로 로그인한 계정의 사본을 읽는다
//   (저장소가 보기 전용에서 읽을 계정을 정한다). 네트워크를 쓰지 않는다.
// - 저장소의 read* 는 바뀌지 않았으면 같은 참조를 준다 — useSyncExternalStore 에 그대로 넘긴다.
// - 서버 렌더와 하이드레이션 첫 그림은 null 이다(저장소는 브라우저에만 있다). 화면은 null 을 '불러오는 중'으로 본다.
// - 계정이 바뀌면(로그인·지우기) 저장소가 모든 항목 주제를 다시 알린다.

import { useSyncExternalStore } from 'react';
import { getStore } from '@/lib/store/index.js';

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

const readStay = () => getStore().readStay();
const readTodayTomorrow = () => getStore().readTodayTomorrow();
const readPrefs = () => getStore().readPrefs();
const serverNull = () => null;

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

const subscribeNothing = () => () => {};

/** 하이드레이션이 끝났는가 — 서버·첫 그림은 false, 그 뒤는 true */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
