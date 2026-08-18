'use client';

// 외출 중 지침 무효 감시 (AX-220 · 정의 §7 개선 1)
//
// 이미 나가 있는 사람에게 "만료됐습니다" 만 띄우면 위험하다. 만료·철회를 감지하면
// 즉시 복귀로 전환해야 한다.
//
// 세 시점에 확인한다.
//   1. 화면 진입 — 백그라운드에 있는 동안 만료됐을 수 있다
//   2. 만료 시각 타이머 — 화면을 보고 있는 도중 넘어가는 경우
//   3. 탭 복귀(visibilitychange) — 타이머는 절전 중에 밀릴 수 있다
//
// 판단은 여기서 하지 않는다. `gateRecoveryPlan` 하나가 정본이다.

import { useEffect, useRef } from 'react';
import { readPlan } from './recovery-store.js';
import { gateRecoveryPlan } from '@/src/recovery/plan.js';

/** setTimeout 이 감당하는 최대 지연 — 넘으면 타이머가 즉시 발동해버린다 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function usePlanExpiry(onInvalid) {
  // 콜백을 ref 로 들고 있어야 감시 effect 가 매 렌더마다 재등록되지 않는다.
  // 렌더 중에 ref 를 쓰면 안 되므로 effect 안에서 갱신한다.
  const callbackRef = useRef(onInvalid);
  useEffect(() => {
    callbackRef.current = onInvalid;
  }, [onInvalid]);

  useEffect(() => {
    let timer = null;
    let fired = false;

    const check = () => {
      if (fired) return true;
      const plan = readPlan();
      // 연결된 지침이 없으면 감시할 대상도 없다
      if (!plan) return false;

      const gate = gateRecoveryPlan(plan);
      // 만료·철회만 복귀로 전환한다. 미확인 변경(STANDBY 강등)은 외출을 중단시키지 않는다
      if (!gate.expired) return false;

      fired = true;
      callbackRef.current?.(gate.reasons);
      return true;
    };

    const schedule = () => {
      const plan = readPlan();
      if (!plan) return;
      const ms = new Date(plan.expiresAt).getTime() - Date.now();
      if (ms > 0 && ms < MAX_TIMEOUT_MS) {
        // 경계에서 1초 여유를 둔다 — 시계 오차로 한 번 헛도는 것을 막는다
        timer = window.setTimeout(check, ms + 1000);
      }
    };

    // `visibilityState === 'visible'` 로 좁히지 않는다. 검사는 순수하고 한 번만
    // 발동하므로 숨겨질 때 확인해두면 돌아왔을 때 이미 반영돼 있다.
    // 좁히면 임베드·자동화처럼 항상 hidden 으로 보고하는 환경에서 영영 재검사하지 않는다.
    if (!check()) schedule();
    document.addEventListener('visibilitychange', check);

    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}
