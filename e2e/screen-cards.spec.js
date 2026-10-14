// ③층 한국어 카드(/cards): SEED 화면 배치 (설계서 6.2 9번)
//
// 회색 바탕 위 흰 블록: 첫 블록(안내·날짜·바로가기 칩) / 식이 / 이동 / 복귀 / 병원.
// 칩은 바로가기 링크다(카드 네 장이 늘 모두 보인다: 오프라인 안전 테스트). 모양만 SEED 칩.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --state-standby-bg rgb(255, 244, 217).

import { test, expect } from './fixtures.js';
import { loginDemo, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 한국어 카드, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 첫 블록(칩 줄)이 상단 바 바로 아래, 카드 묶음 네 블록, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    const main = page.locator('main.cards-page');
    await expect(main.locator('.cards-jump')).toBeVisible();
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const top = main.locator(':scope > .cards-top-block');
    await expect(top.locator('.cards-jump')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await top.boundingBox())).toBe(0);
    const sections = main.locator(':scope > .ui-block.cards-section');
    await expect(sections).toHaveCount(4);
    expect(gapBetween(await top.boundingBox(), await sections.first().boundingBox())).toBe(8);
    // 카드 네 장이 늘 모두 보인다(바로가기 칩은 탭이 아니다)
    await expect(page.getByText('이 숙소로 가 주세요')).toBeVisible();
  });

  test('바로가기 칩: 44px 회색 알약, 테두리 없음, 16px', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    const chips = page.locator('.cards-jump a');
    await expect(chips).toHaveCount(4);
    for (const chip of await chips.all()) {
      await expect
        .poll(() => styles(chip, ['background-color', 'border-top-width', 'font-size']))
        .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-width': '0px', 'font-size': '16px' });
      expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('바로가기를 누르면 그 카드 제목이 상단 바에 가리지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    await page.locator('.cards-jump').getByRole('link', { name: '이동 카드' }).click();
    await expect(page).toHaveURL(/#cards-move$/);
    const heading = page.locator('#cards-move-title');
    await expect(heading).toBeVisible();
    await expect
      .poll(async () => {
        const bar = await page.locator('.top-bar').boundingBox();
        const box = await heading.boundingBox();
        return Math.round(box.y) >= Math.round(bar.y + bar.height);
      })
      .toBe(true);
  });

  test('매일 확인 전: 이동 카드 위 안내는 대기 색 안내 상자(모서리 10 · 안쪽 14, 아이콘)', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards', confirmToday: false });
    const pending = page.locator('#cards-move .cards-pending');
    await expect(pending).toBeVisible();
    expect(await styles(pending, ['border-top-left-radius', 'padding-top', 'background-color'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(255, 244, 217)',
    });
    await expect(pending.locator('svg')).toHaveCount(1);
  });

  test('체류가 없으면 빈 상태가 흰 블록 안에 보인다', async ({ page }) => {
    await loginDemo(page, '/cards');
    const empty = page.locator('main.cards-page > .ui-block .ui-empty');
    await expect(empty).toBeVisible();
  });

  test('320px English: 한국어 카드 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { path: '/cards' });
    await expect(page.locator('.cards-jump')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
