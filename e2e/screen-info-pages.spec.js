// ③층 개인정보·병원 회복 안내·병원 연결(/privacy, /guide, /link): SEED 화면 배치 (설계서 6.2 14번)
// 색: --surface-alt rgb(243, 244, 245), --ink rgb(26, 28, 32), --emergency rgb(200, 16, 46),
//     --state-standby-bg rgb(255, 244, 217), --state-standby-ink rgb(122, 74, 0)
import { test, expect } from './fixtures.js';
import { linkDemoPlan, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 개인정보 고지', () => {
  test('흰 바탕 한 장: 카드 없음, 소개는 info 아이콘 회색 Callout, 고지 글은 16/24, 항목은 띠 없는 점 목록', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.locator('main.privacy-page');
    await expect(main.locator('.card')).toHaveCount(0);
    const intro = main.locator('.privacy-intro');
    await expect(intro.locator('.medical-callout-icon svg')).toHaveCount(1);
    expect((await styles(intro, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const firstLine = main.locator('.privacy-section .settings-pair-primary').first();
    expect(await styles(firstLine, ['font-size', 'line-height'])).toEqual({ 'font-size': '16px', 'line-height': '24px' });
    const item = main.locator('.privacy-items > li').first();
    expect(await styles(item, ['border-left-width', 'list-style-type'])).toEqual({ 'border-left-width': '0px', 'list-style-type': 'disc' });
    // 섹션 사이 32px, 선 없음
    const sections = main.locator('section.privacy-section');
    expect(gapBetween(await sections.nth(0).boundingBox(), await sections.nth(1).boundingBox())).toBe(32);
    expect((await styles(sections.nth(1), ['border-top-width']))['border-top-width']).toBe('0px');
  });
});

test.describe('③층 병원 회복 안내', () => {
  test('카드 없는 행: 항목 사이 1px 선, 병원 원문 상자는 왼쪽 띠 그대로, 원문은 16/24', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/guide');
    const items = page.locator('.conditions-guide-item');
    await expect(items.first()).toBeVisible();
    await expect(page.locator('main .card')).toHaveCount(0);
    expect(await styles(items.nth(1), ['border-top-width', 'box-shadow'])).toEqual({ 'border-top-width': '1px', 'box-shadow': 'none' });
    const source = items.first().locator('.ui-source');
    expect(Number.parseFloat((await styles(source, ['border-left-width']))['border-left-width'])).toBeGreaterThan(1);
    expect((await styles(items.first().locator('.conditions-guide-text'), ['line-height']))['line-height']).toBe('24px');
  });

  test('확인 수 안내는 Callout(모서리 10, 선 없음, 글자 먹색, 아이콘만 대기 색)', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/guide');
    const count = page.locator('.conditions-guide-count.is-pending');
    await expect(count).toBeVisible();
    expect(await styles(count, ['border-top-left-radius', 'border-top-width', 'color', 'padding-top', 'background-color'])).toEqual({
      'border-top-left-radius': '10px',
      'border-top-width': '0px',
      color: 'rgb(26, 28, 32)',
      'padding-top': '14px',
      'background-color': 'rgb(255, 244, 217)',
    });
    expect((await styles(count.locator('svg'), ['color']))['color']).toBe('rgb(122, 74, 0)');
  });
});

test.describe('③층 병원 연결', () => {
  async function openChoose(page) {
    await startTrip(page, {}, { path: '/link' });
    await page.getByRole('button', { name: '예시 A — 외출 가능' }).click();
    await expect(page.getByRole('heading', { name: '어느 병원의 지침인가요?' })).toBeVisible();
  }

  test('흰 바탕 한 장: 코드 입력·연동 없이 둘러보기에 카드 없음, 두 섹션 사이 구역선', async ({ page }) => {
    await startTrip(page, {}, { path: '/link' });
    await expect(page.locator('main .card')).toHaveCount(0);
    const demo = page.locator('section.conditions-demo');
    expect(await styles(demo, ['border-top-width', 'padding-top'])).toEqual({ 'border-top-width': '1px', 'padding-top': '24px' });
  });

  test('병원 고르기: [취소][이 병원으로 연결]이 하단 고정 바에 3:7, 하단 내비 바로 위', async ({ page }) => {
    await openChoose(page);
    const bar = page.locator('.link-bar.sticky-return.is-flow');
    const cancel = bar.getByRole('button', { name: '취소' });
    const confirm = bar.getByRole('button', { name: '이 병원으로 연결' });
    await expect(confirm).toBeVisible();
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())).toBe(0);
    const c = await cancel.boundingBox();
    const k = await confirm.boundingBox();
    expect(Math.abs(c.y - k.y)).toBeLessThanOrEqual(1);
    expect(k.width).toBeGreaterThan(c.width * 2);
  });

  test('병원을 고르지 않고 연결하면 경고 아이콘 + 굵은 긴급 빨강 문장', async ({ page }) => {
    await openChoose(page);
    await page.getByRole('button', { name: '이 병원으로 연결' }).click();
    const error = page.getByRole('alert').filter({ hasText: '연결할 병원을 골라 주세요.' });
    await expect(error.locator('svg')).toHaveCount(1);
    expect(await styles(error, ['color', 'font-weight'])).toEqual({ color: 'rgb(200, 16, 46)', 'font-weight': '700' });
  });

  test('연결 뒤: 주 버튼은 조건 보기 하나, 연결된 지침은 카드 없는 행 + 병원 발행 출처 표시', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    const primary = page.locator('main .btn:not(.btn-secondary):not(.btn-quiet):not(.btn-critical)');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/조건 보기/);
    const row = page.locator('.conditions-period-list.is-rows > .conditions-period').first();
    expect(await styles(row, ['border-left-width', 'background-color'])).toEqual({ 'border-left-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    await expect(row.locator('.ui-source-tag')).toHaveCount(1);
  });

  test('연결 해제는 확인 대화상자: 확인 버튼 긴급 빨강, 취소하면 그대로, 확인하면 목록에서 사라진다', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.getByRole('button', { name: '연결 해제' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: '해제하기' });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '연결된 지침' })).toBeVisible();
    await page.getByRole('button', { name: '연결 해제' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '해제하기' }).click();
    await expect(page.getByRole('heading', { name: '연결된 지침' })).toHaveCount(0);
  });
});
