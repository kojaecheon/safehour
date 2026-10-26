// ③층 시안 보드(/design-board): 화면 시안이 지금 화면과 같은 배치인지 (설계서 6.2 15번)
import { test, expect } from './fixtures.js';

function phoneFor(page, route) {
  return page.locator('figure.designBoard-screen').filter({ has: page.locator('code', { hasText: new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) }) });
}

test.describe('③층 시안 보드 화면 시안', () => {
  test('내비가 있는 시안에는 떠 있는 긴급 버튼이 없고, /g 시안은 하단 긴급 바가 있다', async ({ page }) => {
    await page.goto('/design-board');
    const withNav = page.locator('.designBoard-phone').filter({ has: page.locator('.ui-bottom-nav') });
    expect(await withNav.count()).toBeGreaterThanOrEqual(7);
    await expect(withNav.locator('.designBoard-phone-sos')).toHaveCount(0);
    await expect(phoneFor(page, '/g').locator('.ui-emergency-bar .ui-emergency')).toHaveCount(1);
  });

  test('보드 페이지는 시안 속 하단 바 때문에 아래 여백·초점 스크롤 여백을 더 받지 않는다', async ({ page }) => {
    await page.goto('/design-board');
    await expect(page.locator('main .sticky-return')).toHaveCount(0);
    const scrollPadding = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
    expect(scrollPadding).toBe('auto');
  });

  for (const route of ['/today', '/trip/2026-10-06', '/conditions']) {
    test(`${route} 시안은 회색 바탕 위 흰 블록이다`, async ({ page }) => {
      await page.goto('/design-board');
      const phone = route.startsWith('/trip/') ? page.locator('figure.designBoard-screen').filter({ has: page.locator('code', { hasText: /^\/trip\/\d{4}-\d{2}-\d{2}$/ }) }) : phoneFor(page, route);
      await expect(phone.locator('.is-basement')).toHaveCount(1);
      expect(await phone.locator('.is-basement > .ui-block').count()).toBeGreaterThanOrEqual(2);
    });
  }
});
