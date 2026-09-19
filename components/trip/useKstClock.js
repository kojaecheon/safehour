'use client';

// 한국 시각(KST) 시계 훅 (AX-317)
//
//   const clock = useKstClock();   // { date: 'YYYY-MM-DD', minutes: 0–1439 } — 서버 렌더·하이드레이션 중에는 null
//
// 오늘 화면의 '지금 외출 중·다음 정거장', 이미 도착한 정거장 편집 막기, 데모 휴무 대상 고르기에 쓴다.
// 분이 바뀔 때만 새 값을 준다(15초마다 확인). 렌더 중에 시계를 읽지 않는다 — 구독하는 동안만 돈다.
// 시간대는 언어·기기와 무관하게 한국 시각이다(체류지 시각, lib/format.js 와 같은 원칙).

import { useSyncExternalStore } from 'react';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const TICK_MS = 15_000;

let snapshot = null;
const listeners = new Set();
let timer = null;

function read() {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  const next = { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
  if (!snapshot || snapshot.date !== next.date || snapshot.minutes !== next.minutes) snapshot = Object.freeze(next);
  return snapshot;
}

function subscribe(onChange) {
  listeners.add(onChange);
  if (timer === null) {
    timer = window.setInterval(() => {
      const before = snapshot;
      if (read() !== before) for (const listener of [...listeners]) listener();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return snapshot ?? read();
}

function getServerSnapshot() {
  return null;
}

/** @returns {{ date: string, minutes: number } | null} */
export default function useKstClock() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
