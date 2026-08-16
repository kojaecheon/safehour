// E2E 공통 헬퍼 — 여러 스펙이 같은 흐름을 반복해서 쓴다.

import { expect } from '@playwright/test';

/**
 * 병원 회복 지침을 연결하고 판정 결과까지 진행한다 (AX-221).
 *
 * 조건은 더 이상 사용자가 입력하지 않는다 — 병원이 발행한 것을 그대로 쓴다.
 * 그래서 흐름이 `로그인 → 지침 연결 → 안내 확인 → 판정` 이 된다.
 */
export async function connectPlan(page, { outingAllowed = true } = {}) {
  await page.goto('/api/auth/login?provider=demo&returnTo=/link');
  await expect(page).toHaveURL(/\/link/);
  await page
    .getByRole('button', { name: outingAllowed ? '예시 A — 외출 가능' : '예시 B — 외출 제한' })
    .click();
  await expect(page.getByRole('button', { name: '오늘의 회복 상태 보기' })).toBeVisible();

  // 확인하지 않은 중요 안내가 있으면 판정이 STANDBY 로 강등된다 (정의 §7)
  await page.goto('/guide');
  await page.getByRole('button', { name: '전체 확인 처리' }).click();
}

export async function submitPlan(page, { outingAllowed = true } = {}) {
  await connectPlan(page, { outingAllowed });
  await page.goto('/plan');
  await page.getByRole('button', { name: '안전 판정으로 추천 받기' }).click();
  await page.waitForURL('**/result');
}

/** 지정 폭에서 가로 스크롤이 생기지 않아야 한다 */
export async function assertNoHorizontalScroll(page, where) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    box.scrollWidth,
    `${where}: 가로 스크롤 발생 (${box.scrollWidth} > ${box.clientWidth})`,
  ).toBeLessThanOrEqual(box.clientWidth + 1);
}
