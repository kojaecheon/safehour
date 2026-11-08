// ③층 로그인 화면(/login) — SEED 화면 배치 (설계서 6.1 · 6.2 2번)
//
// 흰 바탕 한 장: 26px 제목 → 설명 → 로그인 수단(전체 폭 버튼 목록, 데모는 회색 채움) → 안내 Callout.
// 이 실행 환경에는 공급자 자격증명이 없다. 켜지지 않은 공급자는 그리지 않고(운영자 결정 2026-11-08),
// 데모가 유일한 길이라 코발트 주 버튼이 된다.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --ink-subtle rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245) · --accent rgb(10, 92, 255) · --state-together-ink rgb(17, 105, 58).

import { test, expect } from './fixtures.js';
import { expectNoAxeViolations, gapBetween, loginDemo, styles } from './helpers.js';

test.describe('③층 로그인 화면 — SEED 배치', () => {
  test('제목·로그인 수단·안내 상자가 SEED 모양이다', async ({ page }) => {
    await page.goto('/login');
    await page.mouse.move(0, 0);
    const demo = page.getByRole('link', { name: '데모 계정으로 둘러보기' });
    await expect(demo).toBeVisible(); // 세션 확인이 끝나 목록이 그려질 때까지

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

    // 켜지지 않은 공급자는 없다(준비 중 버튼 없음)
    await expect(page.locator('.onboarding-login-methods .btn-google, .onboarding-login-methods .btn-kakao')).toHaveCount(0);
    await expect(page.locator('.onboarding-login-methods button[aria-disabled="true"]')).toHaveCount(0);
    // 데모만 되면 데모가 주 버튼 = 코발트 채움 + 흰 글자, 52px
    expect(await styles(demo, ['background-color', 'color', 'min-height'])).toEqual({
      'background-color': 'rgb(10, 92, 255)',
      color: 'rgb(255, 255, 255)',
      'min-height': '52px',
    });

    // 데모 설명은 데모 버튼에 8px 로 붙는다. 데모 버튼은 목록 전체 폭이다
    const d = await demo.boundingBox();
    expect(gapBetween(d, await page.getByText('데모는 시연용입니다', { exact: false }).boundingBox())).toBe(8);
    expect(d.width).toBe((await page.locator('.onboarding-login-methods .onboarding-stack').boundingBox()).width);

    // 안내 상자 = Callout: 회색 면 · 모서리 10 · 왼쪽 띠 없음, 앞에 20px 먹색 아이콘. 문장은 그대로
    const callout = page.locator('.medical-callout');
    expect(
      await styles(callout, ['background-color', 'border-top-left-radius', 'border-left-width']),
    ).toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-left-radius': '10px', 'border-left-width': '0px' });
    const icon = callout.locator('.medical-callout-icon');
    expect((await styles(icon, ['color'])).color).toBe('rgb(26, 28, 32)');
    // 문장은 전역 p 의 옅은 회색이 아니라 상자의 먹색
    expect((await styles(callout.locator('p'), ['color'])).color).toBe('rgb(26, 28, 32)');
    expect((await icon.locator('svg').boundingBox()).width).toBe(20);
    await expect(callout).toHaveAttribute('role', 'note');
    await expect(callout).toHaveText('로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.');
  });

  for (const [code, langName, demoLabel] of [
    ['ko', '한국어', '데모 계정으로 둘러보기'],
    ['en', 'English', 'Explore with a demo account'],
    ['ja', '日本語', 'デモアカウントで見てみる'],
    ['zh', '中文', '使用演示账号体验'],
  ]) {
    test(`320px ${code}: 준비 중 버튼이 없고, 데모 버튼이 보이고 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      const demo = page.getByRole('link', { name: demoLabel });
      await expect(demo).toBeVisible();
      const box = await demo.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      await expect(page.locator('.onboarding-login-methods button[aria-disabled="true"]')).toHaveCount(0);
      await expect(page.locator('.onboarding-login-methods .badge')).toHaveCount(0);
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
