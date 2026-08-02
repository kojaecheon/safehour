// E2E 공통 헬퍼 — 여러 스펙이 같은 흐름을 반복해서 쓴다.

import { expect } from '@playwright/test';

/**
 * 병원 조건을 채우고 판정 결과까지 진행한다.
 * 외출 허용은 기본값이 없으므로 반드시 명시적으로 선택해야 제출된다.
 */
export async function submitPlan(page, { outingAllowed = true } = {}) {
  await page.goto('/plan');
  await page.getByRole('button', { name: '방금 받음' }).click();
  await expect(page.locator('#issued-at')).not.toHaveValue('');
  await page
    .getByText(outingAllowed ? '외출이 허용되었습니다' : '외출이 허용되지 않았습니다')
    .click();
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
