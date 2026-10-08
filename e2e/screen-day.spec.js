// ③층 하루 일정(/trip/[날짜]): SEED 화면 배치 (설계서 6.2 6번)
//
// 회색 바탕 위 흰 블록: 날짜 칩 줄 / 상태 / 전환·타임라인 / 소개 / 도구.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음, 어제·모레 병원 일정).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245).

import { test, expect } from './fixtures.js';
import { kstDate, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 하루 일정, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 날짜 칩 줄 / 상태 / 전환·타임라인 / 도구, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    await expect(page.locator('.state-banner')).toBeVisible();

    const main = page.locator('main.trip-day');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(4);
    await expect(blocks.first().locator('.ui-date-strip')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);

    await expect(main.locator(':scope > .trip-status-block .state-banner')).toHaveCount(1);
    await expect(main.locator(':scope > .trip-timeline-block [role="tablist"]')).toHaveCount(1);
    await expect(main.locator(':scope > .trip-tools-block').getByRole('button', { name: '이 날짜 다시 만들기' })).toHaveCount(1);
  });

  test('날짜 칩은 병원 표시가 있어도 모두 60px (칩 줄과 전체 일정 목록)', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const strip = page.locator('.ui-date-strip a.ui-date-chip');
    await expect(strip).not.toHaveCount(0);
    await expect(page.locator('.ui-date-strip .ui-date-appt')).not.toHaveCount(0);
    const widths = await strip.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect([...new Set(widths)]).toEqual([60]);

    await page.goto('/trip');
    await expect(page.locator('.trip-day-row').first()).toBeVisible();
    const listWidths = await page
      .locator('.trip-day-row a.ui-date-chip')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect([...new Set(listWidths)]).toEqual([60]);
  });

  test('알림 상자(매일 확인 전인 오늘): 왼쪽 띠 없는 회색 면 · 모서리 10 · 안쪽 14', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(0)}`, confirmToday: false });
    const notice = page.locator('.trip-notice').first();
    await expect(notice).toBeVisible();
    await expect
      .poll(() => styles(notice, ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top']))
      .toEqual({
        'border-left-width': '0px',
        'border-top-left-radius': '10px',
        'background-color': 'rgb(243, 244, 245)',
        'padding-top': '14px',
      });
  });

  test('320px English: 하루 일정에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { path: `/trip/${kstDate(1)}` });
    await expect(page.locator('.state-banner')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('tab', { name: /Companion/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('③층 하루 일정, 상태 상자와 정거장 버튼', () => {
  test('정거장 버튼: 바꾸기·빼기가 모두 작은 회색 버튼', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const actions = page.locator('.trip-stop-actions').first();
    await expect(actions).toBeVisible();
    for (const button of await actions.locator('button').all()) {
      await expect
        .poll(() => styles(button, ['background-color', 'min-height', 'border-top-left-radius']))
        .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'min-height': '44px', 'border-top-left-radius': '8px' });
    }
  });

  test('입력이 필요한 날: 고칠 곳 상자는 점선 Callout(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: `/trip/${kstDate(1)}` });
    const fix = page.locator('.trip-fix');
    await expect(fix).toBeVisible();
    expect(await styles(fix, ['border-top-style', 'border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-style': 'dashed',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
  });

  test('동행 보호자가 없는 날의 보호자 탭: 잠금 상자는 Callout(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, { hasCompanion: false }, { path: `/trip/${kstDate(1)}` });
    await page.getByRole('tab', { name: /보호자/ }).click();
    const lock = page.locator('.trip-guardian-lock');
    await expect(lock).toBeVisible();
    expect(await styles(lock, ['border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
  });
});

test.describe('③층 하루 일정, 소개와 도구', () => {
  test('적용 조건·빠진 장소: 카드 없이 도구 블록 안에서 1px 선으로 나눈 펼침 행', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const facts = page.locator('.trip-tools-block .trip-facts');
    await expect(facts.first()).toBeVisible();
    for (const row of await facts.all()) {
      expect(await styles(row, ['border-left-width', 'border-top-left-radius', 'border-top-width'])).toEqual({
        'border-left-width': '0px',
        'border-top-left-radius': '0px',
        'border-top-width': '1px',
      });
    }
  });

  test('하루 소개(정해진 문장): 자기 흰 블록 안의 인용 모양(두 줄 왼쪽 띠, 바깥 테두리 없음)', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const intro = page.locator('.trip-intro-block .trip-intro, .trip-intro-block .ui-source').first();
    await expect(intro).toBeVisible({ timeout: 15_000 });
    const isTemplate = await intro.evaluate((el) => el.classList.contains('trip-intro'));
    if (isTemplate) {
      expect(await styles(intro, ['border-left-style', 'border-top-width'])).toEqual({
        'border-left-style': 'double',
        'border-top-width': '0px',
      });
    }
    expect((await styles(page.locator('.trip-intro-block'), ['background-color']))['background-color']).toBe(
      'rgb(255, 255, 255)',
    );
  });
});
