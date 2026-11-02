// 브라우저 기본 알림 실행기 (AX-319 · spec 4.13)
//
// 화면은 getNotifier() 로 하나뿐인 실행기를 받는다. 서버 렌더링 중에는 null 이다.
// 기본 저장소(getStore)의 오늘 일정으로 예약하고, 기기 알림은 deliverToDevice 가 낸다.
// 시작(start)은 알림 배너(components/pwa/NotificationBanner.js)가 마운트될 때 한다 — 여러 번 불러도 한 번이다.

import { getStore } from '../store/index.js';
import { deliverToDevice } from './device.js';
import { createNotifier } from './runtime.js';

let browserNotifier = null;

/** @returns {ReturnType<typeof createNotifier> | null} */
export function getNotifier() {
  if (typeof window === 'undefined') return null;
  browserNotifier ??= createNotifier({
    store: getStore(),
    deliver: (item) => deliverToDevice(item, { store: getStore() }),
  });
  return browserNotifier;
}
