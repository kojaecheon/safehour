'use client';

// 기기 저장소의 보기 전용 신호를 화면에서 읽는 훅 (AX-304 · docs/platform/IA_AND_FLOWS.md '보기 전용 상태')
//
//   const { readOnly, reason, sessionChecked } = useStoreStatus();
//
// - 저장소(lib/store)의 getStatus() 스냅샷을 그대로 준다. 바뀌지 않았으면 같은 객체다.
// - 서버 렌더와 하이드레이션 중에는 '세션 확인 전·보기 전용' 고정값을 준다 — 배너가 깜빡이지 않게
//   화면은 `sessionChecked` 가 false 이면 보기 전용 안내를 그리지 않는다(오프라인은 예외).
// - 세션 확인(refreshSession)은 앱 셸(AppShell)이 한 번 한다. 화면이 따로 부르지 않는다.
// - 쓰기 동작(생성·편집·연동·공유)은 `readOnly` 가 true 이면 막는다. 저장소도 READ_ONLY 로 거절한다.

import { useSyncExternalStore } from 'react';
import { READ_ONLY_REASON, getStore } from '@/lib/store/index.js';

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

function subscribe(onChange) {
  return getStore().subscribe('status', onChange);
}

function getSnapshot() {
  return getStore().getStatus();
}

function getServerSnapshot() {
  return SERVER_STATUS;
}

/** @returns {import('@/lib/store/store.js').StoreStatus} */
export default function useStoreStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 보기 전용 안내를 지금 그려야 하는가.
 * 세션을 아직 묻지 않았으면 그리지 않는다(깜빡임 방지). 오프라인은 묻지 않아도 확실하므로 그린다.
 */
export function shouldShowReadOnly(status) {
  if (!status?.readOnly) return false;
  return status.sessionChecked === true || status.reason === READ_ONLY_REASON.OFFLINE;
}
