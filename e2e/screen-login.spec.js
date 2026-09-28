// ③층 로그인 화면(/login) — SEED 화면 배치 (설계서 6.1 · 6.2 2번)
//
// 흰 바탕 한 장: 26px 제목 → 설명 → 로그인 수단(전체 폭 버튼 목록, 데모는 회색 채움) → 안내 Callout.
// 이 실행 환경에는 공급자 자격증명이 없다 — Google·카카오는 '준비 중' 비활성 버튼으로 남는다.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --ink-subtle rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245) · --accent rgb(10, 92, 255) · --state-together-ink rgb(17, 105, 58).

import { test, expect } from './fixtures.js';
import { expectNoAxeViolations, loginDemo } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 로그인 화면 — SEED 배치', () => {
  test('제목·로그인 수단·안내 상자가 SEED 모양이다', async ({ page }) => {
    await page.goto('/login');
    await page.mouse.move(0, 0);
    const google = page.getByRole('button', { name: /Google로 계속하기/ });
    await expect(google).toBeVisible(); // 세션 확인이 끝나 목록이 그려질 때까지

    // 자물쇠 원판(코발트 면)이 없고, 상단 바 20px 아래에 26/35 굵은 먹색 제목
    await expect(page.locator('.onboarding-login-mark')).toHaveCount(0);
    const title = page.locator('#login-title');
    expect(await styles(title, ['font-size', 'line-height', 'font-weight', 'color'])).toEqual({
      'font-size': '26px',
      'line-height': '35px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await title.boundingBox())).toBe(20);

    // 준비 중인 공급자 = 공통 비활성(설계서 5.1): 회색 면 + --ink-subtle 글자, 테두리 없음, 모서리 12
    const kakao = page.getByRole('button', { name: /카카오로 계속하기/ });
    for (const provider of [google, kakao]) {
      expect(
        await styles(provider, ['background-color', 'color', 'border-top-color', 'border-top-left-radius']),
      ).toEqual({
        'background-color': 'rgb(243, 244, 245)',
        color: 'rgb(134, 139, 148)',
        'border-top-color': 'rgba(0, 0, 0, 0)',
        'border-top-left-radius': '12px',
      });
    }
    // 데모 = 회색 채움(neutralWeak) + 먹색 글자 — 비활성과 글자 색으로 갈린다
    const demo = page.getByRole('link', { name: '데모 계정으로 둘러보기' });
    expect(await styles(demo, ['background-color', 'color', 'min-height'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(26, 28, 32)',
      'min-height': '52px',
    });

    // 목록 간격 12, 데모 설명은 데모 버튼에 8px 로 붙는다
    const [g, k, d] = [await google.boundingBox(), await kakao.boundingBox(), await demo.boundingBox()];
    expect(gapBetween(g, k)).toBe(12);
    expect(gapBetween(k, d)).toBe(12);
    expect(gapBetween(d, await page.getByText('데모는 시연용입니다', { exact: false }).boundingBox())).toBe(8);

    // 안내 상자 = Callout: 회색 면 · 모서리 10 · 왼쪽 띠 없음, 앞에 20px 먹색 아이콘. 문장은 그대로
    const callout = page.locator('.medical-callout');
    expect(
      await styles(callout, ['background-color', 'border-top-left-radius', 'border-left-width']),
    ).toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-left-radius': '10px', 'border-left-width': '0px' });
    const icon = callout.locator('.medical-callout-icon');
    expect((await styles(icon, ['color'])).color).toBe('rgb(26, 28, 32)');
    expect((await icon.locator('svg').boundingBox()).width).toBe(20);
    await expect(callout).toHaveAttribute('role', 'note');
    await expect(callout).toHaveText('로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.');
  });

  for (const [code, langName] of [
    ['ko', '한국어'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['zh', '中文'],
  ]) {
    test(`320px ${code} — 공급자 이름이 한 줄로 남고 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      const disabled = page.locator('.onboarding-login-methods button[aria-disabled="true"]');
      await expect(disabled).toHaveCount(2);
      for (const button of await disabled.all()) {
        // 이름은 한 줄(24px). 배지가 옆에 들어가지 않으면 이름 아래로 내려간다
        const label = await button.locator('span').first().boundingBox();
        const badge = await button.locator('.badge').boundingBox();
        expect(Math.round(label.height)).toBe(24);
        expect(badge.x).toBeGreaterThanOrEqual(0);
        expect(badge.x + badge.width).toBeLessThanOrEqual(320);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
  }

  test('로그인된 상태 — 그림자 카드 없이 상태 줄과 [계속하기][로그아웃], 접근성 위반 0', async ({ page }) => {
    await loginDemo(page, '/login');
    const signed = page.locator('.onboarding-login-signed');
    await expect(signed).toBeVisible();
    expect(await styles(signed, ['box-shadow', 'border-top-width', 'background-color'])).toEqual({
      'box-shadow': 'none',
      'border-top-width': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // 상태 글자는 먹색, 초록은 체크 아이콘에만
    const status = page.locator('#login-signed');
    expect((await styles(status, ['color'])).color).toBe('rgb(26, 28, 32)');
    expect((await styles(status.locator('svg'), ['color'])).color).toBe('rgb(17, 105, 58)');
    // 코발트는 주 버튼 하나, 로그아웃은 회색 채움
    const next = page.getByRole('link', { name: '계속하기' });
    const logout = page.getByRole('button', { name: '로그아웃' });
    expect((await styles(next, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
    expect((await styles(logout, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    expect(gapBetween(await next.boundingBox(), await logout.boundingBox())).toBe(12);
    await expectNoAxeViolations(page, '로그인된 /login');
  });
});
