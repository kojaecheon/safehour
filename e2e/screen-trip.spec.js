// ③층 전체 일정(/trip): SEED 화면 배치 (설계서 6.2 5번)
//
// 흰 바탕 한 장, 날짜마다 목록 행 하나: [날짜 칩][날짜 · 상태 · 장소 수 · 사유][화살표]. 행 사이 1px 선.
// 행 전체가 그 날짜로 가는 마우스 누름 자리이고, 키보드·스크린리더는 날짜 칩 링크 하나만 만난다.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음).

import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

test.describe('③층 전체 일정, 날짜 목록 행', () => {
  test('카드 없는 목록 행: 테두리·모서리·면 없음, 행 사이 1px 선, 끝에 화살표, 날짜 칩은 그대로', async ({ page }) => {
    await startTrip(page, {}, { path: '/trip' });
    const rows = page.locator('.trip-day-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(3);

    // 지난 날(어제)을 포함해 어느 행도 카드 면이 없다
    for (const row of await rows.all()) {
      await expect
        .poll(() => styles(row, ['border-left-width', 'border-top-left-radius', 'background-color']))
        .toEqual({ 'border-left-width': '0px', 'border-top-left-radius': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
      await expect(row.locator('.trip-day-chevron svg')).toHaveCount(1);
      await expect(row.locator('a.ui-date-chip')).toHaveCount(1);
    }
    await expect(page.locator('.trip-day-row.is-past')).not.toHaveCount(0);

    // 둘째 행부터 위에 1px 선
    expect(await styles(rows.nth(1), ['border-top-width', 'border-top-style'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
    });
  });

  test('행의 빈 자리를 누르면 그 날짜로 가고, 입력 필요 행의 고칠 곳 링크는 따로 눌린다', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: '/trip' });

    // 화살표 자리(행 링크를 늘린 누름 자리 위)를 마우스로 누르면 그 날짜 화면으로 간다
    const row = page.locator('.trip-day-row').nth(1);
    const date = await row.getAttribute('data-date');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const box = await row.locator('.trip-day-chevron').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(new RegExp(`/trip/${date}$`));

    // 고칠 곳 링크는 행 누름 자리에 덮이지 않고 제 주소로 간다
    await page.goBack();
    await expect(page.locator('.trip-day-row').first()).toBeVisible();
    const fix = page.locator('.trip-day-fix a').first();
    const href = await fix.getAttribute('href');
    await fix.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });
});
