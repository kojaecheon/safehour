'use client';

// 보호자 서버 알림 화면 훅 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 5)
//
//   const { state, turnOn, turnOff, renew, takeOver, mute } = useGuardianPush(watchId, { poll });
//
//   - state 는 실행기(getGuardianPush)의 getState(watchId) 다. 바뀐 것이 없으면 같은 얼린 객체라 그대로 그려도 된다.
//     서버 렌더링·하이드레이션 중에는 IDLE_STATE 다.
//   - 마운트하면 실행기를 시작하고(여러 번 불러도 한 번) 그 watchId 의 설정과 서비스 워커 준비를 미리 확인한다.
//   - poll 이 참이면(/g 의 보이는 사본) 상태를 한 번 묻고(2분 간격 안이면 건너뜀), 화면이 보이는 동안 5분마다 묻는다.
//   - turnOn, takeOver, renew 는 버튼 누름 안에서 곧바로 부른다(권한 요청과 구독은 사용자 동작 안에서만 된다).
//     실행기가 없으면(서버 렌더링) UNSUPPORTED 를 돌려준다.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getGuardianPush } from './client.js';
import { IDLE_STATE, PUSH_RESULT } from './guardianPush.js';

const NO_SUBSCRIPTION = () => {};
const serverState = () => IDLE_STATE;
const unsupported = () => Promise.resolve(PUSH_RESULT.UNSUPPORTED);

function subscribeRunner(onChange) {
  return getGuardianPush()?.subscribe(onChange) ?? NO_SUBSCRIPTION;
}

/**
 * @param {string|null|undefined} watchId  보이는 사본의 watchId
 * @param {{ poll?: boolean }} [options]
 */
export function useGuardianPush(watchId, { poll = false } = {}) {
  const state = useSyncExternalStore(
    subscribeRunner,
    () => getGuardianPush()?.getState(watchId) ?? IDLE_STATE,
    serverState,
  );

  useEffect(() => {
    const runner = getGuardianPush();
    if (!runner) return undefined;
    runner.start();
    void runner.prepare(watchId);
    if (!poll) return undefined;
    void runner.refreshStatus(watchId);
    return runner.poll(watchId);
  }, [watchId, poll]);

  const actions = useMemo(
    () => ({
      turnOn: () => getGuardianPush()?.turnOn(watchId) ?? unsupported(),
      turnOff: () => getGuardianPush()?.turnOff(watchId) ?? unsupported(),
      renew: () => getGuardianPush()?.renew() ?? unsupported(),
      takeOver: () => getGuardianPush()?.takeOver(watchId) ?? unsupported(),
      mute: (on) => getGuardianPush()?.mute(watchId, on) ?? unsupported(),
    }),
    [watchId],
  );

  return useMemo(() => ({ state, ...actions }), [state, actions]);
}
