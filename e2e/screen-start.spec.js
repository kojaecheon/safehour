// ③층 시작 화면(/) — SEED 화면 배치 (설계서 6.1 · 6.2 1번)
//
// 흰 바탕 한 장: 그림 → 26px 제목 → 설명 → 언어 선택(Select Box) → 고지 3종(Callout) → 하단 바 [긴급][시작하기].
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --line-input rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245).

import { test, expect } from './fixtures.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

test.describe('③층 시작 화면 — SEED 배치', () => {
  test('제목·언어 선택·고지·면책이 SEED 모양이다', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(0, 0);

    // 26/35 굵게, 두 줄 모두 먹색(코발트 아님). 그림 틀 모서리 8
    const title = page.locator('#home-title');
    expect(await styles(title, ['font-size', 'line-height', 'font-weight', 'color'])).toEqual({
      'font-size': '26px',
      'line-height': '35px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect((await styles(title.locator('span').nth(1), ['color'])).color).toBe('rgb(26, 28, 32)');
    expect(
      (await styles(page.locator('.onboarding-hero-art'), ['border-top-left-radius']))['border-top-left-radius'],
    ).toBe('8px');

    // 언어 선택 = 선택 상자: 52px · 모서리 12. 고른 언어는 2px 진한 테두리 + 굵게, 흰 면 그대로
    const korean = page.getByRole('button', { name: '한국어', exact: true });
    await expect(korean).toHaveAttribute('aria-pressed', 'true');
    expect(
      await styles(korean, [
        'min-height',
        'border-top-left-radius',
        'border-top-color',
        'box-shadow',
        'background-color',
        'font-weight',
      ]),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(26, 28, 32)',
      'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
      'background-color': 'rgb(255, 255, 255)',
      'font-weight': '700',
    });
    const english = page.getByRole('button', { name: 'English', exact: true });
    expect(await styles(english, ['border-top-color', 'font-weight'])).toEqual({
      'border-top-color': 'rgb(134, 139, 148)',
      'font-weight': '500',
    });

    // 고지 3종 = 안내 상자: 회색 면 · 모서리 10 · 그림자·테두리 없음, 아이콘은 원판 없이 먹색
    const notices = page.locator('.onboarding-notice');
    await expect(notices).toHaveCount(3);
    for (const notice of await notices.all()) {
      expect(
        await styles(notice, ['background-color', 'border-top-left-radius', 'box-shadow', 'border-top-width']),
      ).toEqual({
        'background-color': 'rgb(243, 244, 245)',
        'border-top-left-radius': '10px',
        'box-shadow': 'none',
        'border-top-width': '0px',
      });
    }
    expect(await styles(page.locator('.onboarding-notice-icon').first(), ['background-color', 'color'])).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
      color: 'rgb(26, 28, 32)',
    });
    expect((await page.locator('.onboarding-notice-icon svg').first().boundingBox()).width).toBe(20);

    // 면책 = 안내 상자: 왼쪽 띠 없이 회색 면 · 모서리 10
    expect(
      await styles(page.locator('.onboarding-footer-note'), [
        'background-color',
        'border-left-width',
        'border-top-left-radius',
      ]),
    ).toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-left-width': '0px', 'border-top-left-radius': '10px' });
  });

  test('430px — 언어 선택은 넓은 화면에서도 2×2 이다(설계서 6.2 1번)', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 780 });
    await page.goto('/');

    const grid = page.locator('.onboarding-lang-grid');
    const columns = (await styles(grid, ['grid-template-columns']))['grid-template-columns'];
    expect(columns.trim().split(/\s+/)).toHaveLength(2);

    const japanese = page.getByRole('button', { name: '日本語', exact: true });
    expect(Math.round((await japanese.boundingBox()).height)).toBe(52);
    expect((await styles(japanese, ['padding-left']))['padding-left']).toBe('16px');
  });

  for (const [code, langName, start, short, name] of [
    ['ko', '한국어', '시작하기', '긴급', '긴급 연락'],
    ['en', 'English', 'Get started', 'SOS', 'SOS, Emergency'],
    ['ja', '日本語', 'はじめる', '緊急', '緊急連絡'],
    ['zh', '中文', '开始使用', '紧急', '紧急联系'],
  ]) {
    test(`320px ${code} — 하단 바의 긴급·시작하기가 한 줄(52px)에 들어간다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      const bar = page.locator('.onboarding-cta-row');
      const startLink = bar.getByRole('link', { name: start });
      const emergency = bar.locator('.ui-emergency');
      expect(Math.round((await startLink.boundingBox()).height)).toBe(52);
      expect(Math.round((await emergency.boundingBox()).height)).toBe(52);
      // 보이는 글자는 짧아도 읽히는 이름은 온전하다(짧은 글자가 긴 이름에 없는 언어는 '짧은, 긴')
      await expect(emergency).toHaveText(short);
      await expect(emergency).toHaveAccessibleName(name);
    });
  }
});
