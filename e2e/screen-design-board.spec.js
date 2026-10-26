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
      // 클래스 이름만으로는 CSS 가 빠져도 통과한다. 실제 면 색을 잰다: 회색 바탕(--layer-basement) 위 흰 블록(--layer-default)
      const basement = await phone.locator('.is-basement').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(basement).toBe('rgb(243, 244, 245)');
      const block = await phone.locator('.is-basement > .ui-block').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(block).toBe('rgb(255, 255, 255)');
    });
  }

  // 매일 확인은 규칙 32 의 관문이다. 오늘 시안은 확인을 마친 모습이라, 확인 전 모습은 부품 견본에서 본다
  test('부품 견본에 매일 확인 카드(확인 전)가 하나 있고 두 답 버튼이 있다', async ({ page }) => {
    await page.goto('/design-board');
    const sample = page.locator('#designBoard-c-dailycheck');
    await expect(sample.getByRole('heading', { name: '매일 확인 카드 (확인 전)', level: 3 })).toBeVisible();
    await expect(sample.locator('.today-check')).toHaveCount(1);
    await expect(sample.locator('.today-check-flag')).toContainText('확인 필요');
    await expect(sample.getByRole('button', { name: '그대로예요' })).toHaveCount(1);
    await expect(sample.getByRole('button', { name: '바뀌었어요' })).toHaveCount(1);
    // 보드 전체에서도 하나다: 화면 시안(오늘)은 확인을 마친 모습이라 확인 카드를 그리지 않는다
    await expect(page.locator('.today-check')).toHaveCount(1);
  });
});
