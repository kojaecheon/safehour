'use client';

// 기기 저장소의 체류를 화면에서 읽는 훅 (AX-315)
//
//   const stay = useStay();          // 없으면 null. 저장소가 바뀌면 다시 그린다
//   const hydrated = useHydrated();  // 서버 렌더·하이드레이션 중에는 false — 빈 상태가 깜빡이지 않게 한다
//
// 읽기만 한다. 쓰기는 화면이 getStore().writePeriods / updateStay / … 로 하고, 재계획은 저장소를 구독하는
// 동기화 작업(AX-316)이 맡는다 — 조건 화면은 일정 API 를 부르지 않는다.

import { useState, useSyncExternalStore } from 'react';
import { getStore } from '@/lib/store/index.js';

function subscribeStay(onChange) {
  return getStore().subscribe('stay', onChange);
}

function readStay() {
  return getStore().readStay();
}

function serverStay() {
  return null;
}

export default function useStay() {
  return useSyncExternalStore(subscribeStay, readStay, serverStay);
}

function noSubscription() {
  return () => {};
}

export function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** 화면을 처음 그린 시각(ms) — 렌더 중에 Date.now() 를 부르지 않게 한 번만 읽는다 */
export function useNowMs() {
  const [now] = useState(() => Date.now());
  return now;
}
