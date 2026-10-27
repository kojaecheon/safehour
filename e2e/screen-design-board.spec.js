// ③층 시안 보드(/design-board): 화면 시안이 지금 화면과 같은 배치인지 (설계서 6.2 15번)
import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

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

  test('보드를 여는 동안 /api/ 요청이 0건이다', async ({ page }) => {
    // 사용자 데이터가 있는 상태에서 열어도 시안 보드는 서버를 부르지 않는다(고정 데모 값만 쓴다)
    await startTrip(page);
    const apiCalls = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) apiCalls.push(`${request.method()} ${pathname}`);
    });
    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '디자인 시안 보드', level: 1 })).toBeVisible();
    // 대비 판정이 끝나야 브라우저 쪽 효과가 다 돌았다는 뜻이다
    await expect(page.locator('[data-verdict]').first()).toBeVisible();
    await expect(page.locator('[data-verdict="measuring"]')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(apiCalls).toEqual([]);
  });

  // 매일 확인은 규칙 32 의 관문이다. 오늘 시안은 확인을 마친 모습이라, 확인 전 모습은 부품 견본에서 본다
  test('부품 견본에 매일 확인 카드(확인 전)가 하나 있고 두 답 버튼이 있다', async ({ page }) => {
    await page.goto('/design-board');
    const sample = page.locator('#designBoard-c-dailycheck');
    await expect(sample.getByRole('heading', { name: '매일 확인 카드 (확인 전)', level: 3 })).toBeVisible();
    // 견본 제목(h3) 아래 카드 제목은 h4 다: h2 로 두면 h3 아래에서 제목 단계가 뒤집힌다
    await expect(sample.getByRole('heading', { name: '오늘 조건이 그대로인가요?', level: 4 })).toBeVisible();
    await expect(sample.locator('.today-check')).toHaveCount(1);
    await expect(sample.locator('.today-check-flag')).toContainText('확인 필요');
    await expect(sample.getByRole('button', { name: '그대로예요' })).toHaveCount(1);
    await expect(sample.getByRole('button', { name: '바뀌었어요' })).toHaveCount(1);
    // 보드 전체에서도 하나다: 화면 시안(오늘)은 확인을 마친 모습이라 확인 카드를 그리지 않는다
    await expect(page.locator('.today-check')).toHaveCount(1);
  });
});

test.describe('③층 시안 보드 화면 시안 (장소·카드·긴급·보호자)', () => {
  for (const route of ['/place/[candidateId]', '/cards']) {
    test(`${route} 시안은 회색 바탕 위 흰 블록이다`, async ({ page }) => {
      await page.goto('/design-board');
      const phone = phoneFor(page, route);
      await expect(phone.locator('.is-basement')).toHaveCount(1);
      expect(await phone.locator('.is-basement > .ui-block').count()).toBeGreaterThanOrEqual(2);
      // 클래스 이름만으로는 CSS 가 빠져도 통과한다. 실제 면 색을 잰다: 회색 바탕(--layer-basement) 위 흰 블록(--layer-default)
      const basement = await phone.locator('.is-basement').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(basement).toBe('rgb(243, 244, 245)');
      const block = await phone.locator('.is-basement > .ui-block').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(block).toBe('rgb(255, 255, 255)');
    });
  }

  test('긴급 시안: 119 는 긴급 빨강 채움 버튼, 1330 은 회색 버튼, 지금 CSS 에 없는 옛 클래스가 없다', async ({ page }) => {
    await page.goto('/design-board');
    const phone = phoneFor(page, '/emergency');
    await expect(phone.locator('.emergency-call.btn-critical')).toHaveCount(1);
    await expect(phone.locator('.emergency-call.btn-secondary')).toHaveCount(1);
    await expect(phone.locator('.is-urgent, .is-secondary, .emergency-call-icon, .emergency-call-text')).toHaveCount(0);
  });

  test('보호자 열기 시안: PIN 입력은 카드 없이, 열기는 시안 속 바 안, 하단 긴급 바', async ({ page }) => {
    await page.goto('/design-board');
    const phone = phoneFor(page, '/g');
    await expect(phone.locator('.card')).toHaveCount(0);
    await expect(phone.locator('.designBoard-bar .btn')).toHaveCount(1);
    await expect(phone.locator('.ui-emergency-bar')).toHaveCount(1);
  });
});
