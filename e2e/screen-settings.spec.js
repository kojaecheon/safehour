// ③층 설정(/settings): SEED 화면 배치 (설계서 6.2 12번)
//
// 회색 바탕 위 흰 블록 네 개: 언어(Radio 행) / 알림(Switch 행 + 안내) / 민감정보 동의 / 내 정보(지우기).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --selected rgb(42, 48, 56), --line-input rgb(134, 139, 148), --emergency rgb(200, 16, 46).

import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 설정, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록 네 개, 첫 블록이 상단 바 바로 아래, 블록 사이 8px, 마지막 블록 아래 틈 0', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const main = page.locator('main.settings-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    await expect(blocks).toHaveCount(4);
    await expect(main.locator('.card')).toHaveCount(0);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
    expect((await styles(blocks.last(), ['margin-bottom']))['margin-bottom']).toBe('0px');
    // 화면 끝까지 내리면 마지막 블록과 하단 내비 사이가 화면 끝 여백 56px 이다(블록 틈 8px 은 더하지 않는다)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(gapBetween(await blocks.last().boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())).toBeGreaterThanOrEqual(56);
  });

  test('언어 Radio 행: 칸 테두리 없이 선으로 나눈 행, 원 24px, 고른 원은 --selected 채움', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const rows = page.locator('.settings-radio-rows .radio-option');
    await expect(rows).toHaveCount(4);
    expect(await styles(rows.first(), ['border-top-left-radius', 'border-left-width'])).toEqual({
      'border-top-left-radius': '0px',
      'border-left-width': '0px',
    });
    expect((await rows.first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    const korean = page.getByRole('radio', { name: '한국어' });
    await expect(korean).toBeChecked();
    expect((await korean.boundingBox()).width).toBe(24);
    await expect.poll(async () => (await styles(korean, ['background-color']))['background-color']).toBe('rgb(42, 48, 56)');
    const english = page.getByRole('radio', { name: 'English' });
    expect(await styles(english, ['border-top-color', 'border-top-width'])).toEqual({
      'border-top-color': 'rgb(134, 139, 148)',
      'border-top-width': '1px',
    });
  });

  test('알림: 스위치(52×32, role=switch)와 띠 없는 안내 Callout(아이콘 · 모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const sw = page.getByRole('switch', { name: /복귀·복약·병원 일정 알림 받기/ });
    await expect(sw).toBeVisible();
    const box = await sw.boundingBox();
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([52, 32]);
    const note = page.locator('.settings-disclosure');
    expect(
      await styles(note, ['border-left-width', 'border-top-left-radius', 'padding-top', 'background-color']),
    ).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(243, 244, 245)',
    });
    await expect(note.locator('.settings-disclosure-icon svg')).toHaveCount(1);
  });

  test('키보드로 언어를 고르면 행에 초점 링이 보인다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const korean = page.getByRole('radio', { name: '한국어' });
    await korean.focus();
    await page.keyboard.press('ArrowDown');
    const english = page.getByRole('radio', { name: 'English' });
    await expect(english).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const row = page.locator('.settings-radio-rows .radio-option').filter({ has: page.getByRole('radio', { name: 'English' }) });
    await expect.poll(async () => (await styles(row, ['outline-style']))['outline-style']).toBe('solid');
  });

  test('320px English: 설정에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/settings' });
    await expect(page.getByRole('switch')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
