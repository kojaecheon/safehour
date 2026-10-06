// ③층 조건(/conditions): SEED 화면 배치 (설계서 6.1, 6.2 4번)
//
// 회색 바탕 위 흰 블록: 안내·동의 상태 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 동의 있음, 체류 전체를 덮는 본인 체크 기간 하나).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32), --layer-basement rgb(243, 244, 245),
// --emergency rgb(200, 16, 46), --state-together-ink rgb(17, 105, 58), --line-strong rgb(220, 222, 227),
// --accent rgb(10, 92, 255).

import { test, expect } from './fixtures.js';
import { readRecord, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 조건 화면, 회색 바탕과 블록', () => {
  test('상단 바 바로 아래부터 흰 블록을 8px 틈으로 쌓고, 화면 끝 여백은 내비 위 56px 안팎', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const main = page.locator('main.conditions-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');

    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(5);
    expect((await styles(blocks.first(), ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);

    // 화면 끝까지 내리면 마지막 블록과 하단 내비 사이가 블록 틈 8px + 화면 끝 56px 안팎이다(예전에는 160px 안팎)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gap = gapBetween(await blocks.last().boundingBox(), await page.locator('.ui-bottom-nav').boundingBox());
    expect(gap).toBeGreaterThanOrEqual(56);
    expect(gap).toBeLessThanOrEqual(72);
  });

  test('동의 상태는 초록 안내 상자(먹색 글자, 초록 체크 20px, 모서리 10), 체류 정보 고치기는 화살표 행', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const status = page.locator('.conditions-consent-status');
    expect(await styles(status, ['border-top-left-radius', 'padding-top', 'color'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      color: 'rgb(26, 28, 32)',
    });
    const check = status.locator('svg');
    expect((await check.boundingBox()).width).toBe(20);
    expect((await styles(check, ['color'])).color).toBe('rgb(17, 105, 58)');

    const edit = page.getByRole('link', { name: '체류 정보 고치기' });
    await expect(edit).toHaveClass(/ui-list-item/);
    await expect(edit).toHaveAttribute('href', '/onboarding');
  });

  test('날짜별 적용 조건: 흰 블록 안 판정 상자(점선, 회색 면, 모서리 10), 분류 배지 모서리 6, 출처 표시 그대로', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const section = page.locator('section.ui-block', { has: page.getByRole('heading', { name: '날짜별 적용 조건' }) });
    expect((await styles(section, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');

    const day = section.locator('.conditions-day');
    expect(
      await styles(day, ['border-top-style', 'border-top-left-radius', 'padding-top', 'background-color']),
    ).toEqual({
      'border-top-style': 'dotted',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(243, 244, 245)',
    });
    expect(
      (await styles(day.locator('.conditions-coverage').first(), ['border-top-left-radius']))['border-top-left-radius'],
    ).toBe('6px');
    await expect(day.locator('.ui-source-tag').first()).toBeVisible();
    expect((await readRecord(page, 'stay')).periods).toHaveLength(1);
  });
});

test.describe('③층 조건 화면, 조건 기간 목록', () => {
  test('기간은 카드 테두리 없는 목록 행, 출처 표시는 그대로, 병원 지침 연결은 화살표 목록 행', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const row = page.locator('.conditions-period').first();
    expect(await styles(row, ['border-left-width', 'border-top-left-radius', 'background-color'])).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    await expect(row.locator('.ui-source-tag-self')).toHaveCount(1);

    // 채운 코발트 버튼은 '본인 체크 기간 추가' 하나, 병원 지침 연결은 목록 행 링크
    const add = page.getByRole('button', { name: '본인 체크 기간 추가' });
    expect((await styles(add, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
    const link = page.getByRole('link', { name: '병원 지침 연결' });
    await expect(link).toHaveClass(/ui-list-item/);
    await expect(link).toHaveAttribute('href', '/link');
  });

  test('기간 삭제는 확인 대화상자(빨간 확인): 취소하면 남고, 삭제하기면 지운다', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const trigger = page.locator('.conditions-period').first().getByRole('button', { name: '삭제', exact: true });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' });
    await expect(dialog).toBeVisible();
    expect(
      (await styles(dialog.getByRole('button', { name: '삭제하기' }), ['background-color']))['background-color'],
    ).toBe('rgb(200, 16, 46)');

    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await readRecord(page, 'stay')).periods).toHaveLength(1);

    await trigger.click();
    await page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' }).getByRole('button', { name: '삭제하기' }).click();
    await expect(page.getByText('기간을 삭제했어요.')).toBeVisible();
    expect((await readRecord(page, 'stay')).periods).toEqual([]);
  });
});
