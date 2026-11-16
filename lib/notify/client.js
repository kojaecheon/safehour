// 브라우저 기본 알림 실행기 (AX-319 · lib/notify/AGENTS.md)
//
// 화면은 getNotifier() 로 하나뿐인 실행기를 받는다. 서버 렌더링 중에는 null 이다.
// 기본 저장소(getStore)의 오늘 일정으로 예약하고, 기기 알림은 deliverToDevice 가 낸다.
// 시작(start)은 알림 배너(components/pwa/NotificationBanner.js)가 마운트될 때 한다 — 여러 번 불러도 한 번이다.
//
// 보호자 서버 알림 구독 실행기(getGuardianPush, docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 5)도
// 여기서 하나만 만든다. 서버 렌더링 중에는 null 이고, 시작은 같은 알림 배너가 한다.

import { getStore } from '../store/index.js';
import { deliverToDevice } from './device.js';
import { createGuardianPush } from './guardianPush.js';
import { createNotifier } from './runtime.js';

let browserNotifier = null;
let browserGuardianPush = null;

/** @returns {ReturnType<typeof createNotifier> | null} */
export function getNotifier() {
  if (typeof window === 'undefined') return null;
  browserNotifier ??= createNotifier({
    store: getStore(),
    deliver: (item, { sharedWatchTag } = {}) => deliverToDevice(item, { store: getStore(), sharedWatchTag }),
  });
  return browserNotifier;
}

/** @returns {ReturnType<typeof createGuardianPush> | null} */
export function getGuardianPush() {
  if (typeof window === 'undefined') return null;
  browserGuardianPush ??= createGuardianPush({
    store: getStore(),
    fetchImpl: (...args) => window.fetch(...args),
    now: () => Date.now(),
    timers: {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
    },
    win: window,
    nav: window.navigator,
    NotificationImpl: typeof window.Notification === 'function' ? window.Notification : undefined,
    subtle: window.crypto?.subtle ?? null,
  });
  return browserGuardianPush;
}
