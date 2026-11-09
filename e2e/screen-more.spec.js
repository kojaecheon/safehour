// ③층 더보기(/more): SEED 화면 배치 (설계서 6.2 11번)
//
// 회색 바탕 위 흰 블록 두 개: 도구(한국어 안내 카드·보호자 링크·조건·체류 수정·설정) / 정보(개인정보와 면책 안내).
// 각 블록은 목록 머리 + 목록 행(앞 아이콘 · 제목 · 설명 · 화살표).
// 이 기기에 보호자 사본이 있으면 도구 맨 위에 '받은 일정 (보호자)'(/g)가 붙어 6행이 된다(usability 2026-11-08 D1).

import { test, expect } from './fixtures.js';
import { expectNoAxeViolations, gapBetween, importGuardianCopy, startTrip, styles } from './helpers.js';

test.describe('③층 더보기, 목록 묶음 두 개', () => {
  test('회색 바탕 위 흰 블록 두 개: 도구(5행) · 정보(2행), 첫 블록이 상단 바 바로 아래, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    const main = page.locator('main.more-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator('.ui-block');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0).getByRole('heading', { name: '도구' })).toBeVisible();
    await expect(blocks.nth(1).getByRole('heading', { name: '정보' })).toBeVisible();
    await expect(blocks.nth(0).locator('.ui-list > li')).toHaveCount(5);
    await expect(blocks.nth(1).locator('.ui-list > li')).toHaveCount(2);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.nth(0).boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
  });

  test('목록 행: 목적지 그대로, 행 전체가 링크, 화살표, 높이 44 이상', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    const expected = [
      ['한국어 안내 카드', '/cards'],
      ['보호자 링크', '/guardian'],
      ['조건', '/conditions'],
      ['도움말', '/help'],
      ['개인정보와 면책 안내', '/privacy'],
    ];
    for (const [name, href] of expected) {
      const row = page.locator('main.more-page').getByRole('link', { name: new RegExp(name) });
      await expect(row).toHaveAttribute('href', href);
      await expect(row).toHaveClass(/ui-list-item/);
      await expect(row.locator('.ui-list-item-trailing svg')).toHaveCount(1);
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('main.more-page a[href="/onboarding?edit=1"]')).toHaveCount(1);
    await expect(page.locator('main.more-page a[href="/settings"]')).toHaveCount(1);

    // 행마다 앞 아이콘(장식, 22px)과 제목, 그 아래 설명이 있다
    const rows = [
      ['/cards', '한국어 안내 카드', '식당·택시에서 보여 줄 한국어 문장'],
      ['/guardian', '보호자 링크', '일정 사본을 PIN으로 잠가 보호자에게 보내요'],
      ['/conditions', '조건', '본인 체크 기간과 병원 연동'],
      ['/onboarding?edit=1', '체류 정보 수정', '입국·출국, 숙소, 병원과 병원 일정'],
      ['/settings', '설정', '언어·알림·동의 철회·내 정보 지우기'],
      ['/help', '도움말', '앱이 하는 일, 홈 화면에 추가하기, 자주 묻는 질문'],
      ['/privacy', '개인정보와 면책 안내', '무엇을 받고 어디에 남기는지'],
    ];
    for (const [href, title, description] of rows) {
      const row = page.locator(`main.more-page a[href="${href}"]`);
      const leading = row.locator('.ui-list-item-leading');
      await expect(leading, `${title}: 앞 아이콘 칸은 보조기술에 읽히지 않는 장식이다`).toHaveAttribute('aria-hidden', 'true');
      await expect(leading.locator('svg'), `${title}: 앞 아이콘`).toHaveCount(1);
      expect((await leading.locator('svg').boundingBox()).width, `${title}: 앞 아이콘 크기`).toBe(22);
      await expect(row.locator('.ui-list-item-title'), `${title}: 제목`).toHaveText(title);
      const desc = row.locator('.ui-list-item-desc');
      await expect(desc, `${title}: 설명`).toHaveText(description);
      // 설명은 제목 아래, 보조 글자 14/19
      expect((await desc.boundingBox()).y, `${title}: 설명은 제목 아래`).toBeGreaterThan(
        (await row.locator('.ui-list-item-title').boundingBox()).y,
      );
      expect(await styles(desc, ['font-size', 'line-height']), `${title}: 설명 글자`).toEqual({
        'font-size': '14px',
        'line-height': '19px',
      });
    }
  });

  test('하이드레이션 전(서버 그림)에는 흰 블록 두 개만 자리를 잡고 행은 숨긴다: 사본이 있는 기기에서 행이 뒤늦게 끼어 밀리지 않게 (리뷰 M3)', async ({ browser }, testInfo) => {
    const { baseURL, viewport, locale, timezoneId } = testInfo.project.use;
    const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/more');
      const nav = page.locator('main.more-page > nav');
      await expect(nav).toHaveClass(/more-menu-pending/);
      const blocks = nav.locator('.ui-block');
      await expect(blocks).toHaveCount(2);
      expect((await styles(blocks.nth(0), ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
      await expect(blocks.nth(0).locator('.ui-list > li')).toHaveCount(5);
      await expect(blocks.nth(0).locator('.ui-list')).toBeHidden();
      await expect(blocks.nth(0).getByRole('heading', { name: '도구' })).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('보호자 사본이 있으면 도구 맨 위에 받은 일정(/g) 행, 누르면 받은 일정 화면', async ({ page }) => {
    await importGuardianCopy(page);
    await page.goto('/more');
    const tools = page.locator('main.more-page .ui-block').nth(0);
    await expect(tools.locator('.ui-list > li')).toHaveCount(6);
    const first = tools.locator('.ui-list > li').first().getByRole('link');
    await expect(first).toHaveAttribute('href', '/g');
    await expect(first.locator('.ui-list-item-title')).toHaveText('받은 일정 (보호자)');
    await expect(first.locator('.ui-list-item-desc')).toHaveText('환자에게 받은 일정을 다시 열어요');
    expect((await first.boundingBox()).height).toBeGreaterThanOrEqual(44);
    // 나머지 도구 행은 예전 순서 그대로다
    await expect(tools.locator('.ui-list > li').nth(1).getByRole('link')).toHaveAttribute('href', '/cards');
    await expect(page.locator('main.more-page .ui-block').nth(1).locator('.ui-list > li')).toHaveCount(2);
    await expectNoAxeViolations(page, '/more (받은 일정 있음)');

    await first.click();
    await expect(page).toHaveURL(/\/g$/);
    await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
  });

  test('320px English: 더보기에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/more' });
    await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('설치 안내 상자: 설치되지 않은 브라우저에서는 도움말 설치 안내로 잇고, 설치된 앱(standalone)에서는 보이지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    const callout = page.locator('main.more-page .more-install');
    await expect(callout).toBeVisible();
    const link = callout.getByRole('link', { name: '설치 방법 보기' });
    await expect(link).toHaveAttribute('href', '/help#install');
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    // 안내 상자는 목록 블록(.ui-block) 수를 늘리지 않는다
    await expect(page.locator('main.more-page .ui-block')).toHaveCount(2);
    await expectNoAxeViolations(page, '/more 설치 안내 상자');

    // iOS 홈 화면 앱은 navigator.standalone 이 true 다
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    });
    await page.goto('/more');
    await expect(page.locator('main.more-page .ui-block').first()).toBeVisible();
    await expect(page.locator('main.more-page .more-install')).toHaveCount(0);
  });
});
