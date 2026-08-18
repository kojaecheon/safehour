'use client';

// 회복 지침 단말 보관 (AX-214 · 정의 §9.2)
//
// 계획은 **단말을 떠나지 않는다.** 서버는 판정에 필요한 채널 A 만 받아 계산하고 버린다.
// 채널 B(병원 안내문)는 이 파일 밖으로, 특히 네트워크로 나가지 않는다.

import { PLAN_KEY } from './session.js';

export function readPlan() {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writePlan(plan) {
  try {
    sessionStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

/** 안내 확인 표시 — 확인해야 STANDBY 강등이 풀린다 (정의 §7) */
export function acknowledgeInstruction(plan, instructionId) {
  if (!plan) return null;
  const next = {
    ...plan,
    instructions: plan.instructions.map((item) =>
      item.id === instructionId ? { ...item, acknowledged: true } : item,
    ),
  };
  writePlan(next);
  return next;
}

export function acknowledgeAll(plan) {
  if (!plan) return null;
  const next = {
    ...plan,
    instructions: plan.instructions.map((item) => ({ ...item, acknowledged: true })),
  };
  writePlan(next);
  return next;
}
