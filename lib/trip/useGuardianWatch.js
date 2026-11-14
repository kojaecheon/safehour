'use client';

// 이 기기의 지켜보기 레코드 훅 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 7)
//
//   const record = useWatchRecord();                 저장된 guardianWatch 레코드(없으면 null)
//   const { state, watchId } = useGuardianWatch();   'ON' | 'REPLACED' | 'NONE'. watchId 는 ON 일 때만
//
// 기기 저장소만 읽는다. 동기화 실행기(lib/trip/client.js)를 불러오지 않아서, 레코드가 있는지만 보는 화면
// (내 정보 지우기 안내, 보호자 화면)이 일정·서버 알림 실행기를 함께 싣지 않는다. 다른 서버 알림 훅은 lib/trip/useWatch.js 다.
// 서버 렌더링·하이드레이션 중에는 레코드가 없는 것(null, NONE)으로 그린다.

import { useMemo, useSyncExternalStore } from 'react';
import { getStore } from '../store/index.js';

const NONE = Object.freeze({ state: 'NONE', watchId: null });
const serverNull = () => null;

/** 지켜보기 레코드 구독. 계정이 바뀌면(status) 다시 읽는다. 저장소는 바뀌지 않으면 같은 참조를 준다 */
function subscribeWatch(onChange) {
  const store = getStore();
  const offWatch = store.subscribe('guardianWatch', onChange);
  const offStatus = store.subscribe('status', onChange);
  return () => {
    offWatch();
    offStatus();
  };
}

const readWatch = () => getStore().readGuardianWatch();

/** 저장된 지켜보기 레코드(없으면 null) */
export function useWatchRecord() {
  return useSyncExternalStore(subscribeWatch, readWatch, serverNull);
}

/**
 * 이 기기의 지켜보기 상태. watchId 는 켜진(ON) 것만 준다(보호자 링크에 실을 수 있는 것은 그것뿐이다).
 * @returns {{ state: 'ON'|'REPLACED'|'NONE', watchId: string|null }}
 */
export function useGuardianWatch() {
  const record = useWatchRecord();
  const state = record?.state === 'ON' || record?.state === 'REPLACED' ? record.state : null;
  const watchId = state === 'ON' ? record.watchId : null;
  return useMemo(() => (state ? { state, watchId } : NONE), [state, watchId]);
}
