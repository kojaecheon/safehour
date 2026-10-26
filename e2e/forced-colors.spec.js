// 강제 색상 모드(Windows 고대비): 면 색이나 그림자로만 보이던 부품이 사라지지 않는다
//
// 강제 색상에서는 브라우저가 배경색을 시스템 색(Canvas)으로 바꾸고 그림자를 지운다.
// 테두리 없이 면으로만 그린 부품(스위치 트랙, 고른 라디오 원, 고른 칩)은 통째로 사라지거나 고른 상태가 안 보인다.
// Playwright 의 forcedColors 에뮬레이션을 켜고, 계산된 스타일로 '보이는 경계와 면'을 단언한다.
//
// 시스템 색의 실제 rgb 는 브라우저가 정한다. 아래 값은 강제 색상 에뮬레이션(Chromium)에서 읽은 값이다.
// Playwright 를 올려 값이 달라지면 이 상수만 고친다. Highlight 는 에뮬레이션에서 알파 0.8 로 계산된다.

import { test, expect } from './fixtures.js';
import { accountKeyOf, kstDate, startTrip } from './helpers.js';

// 강제 색상 에뮬레이션(Chromium) 값
const CANVAS = 'rgb(255, 255, 255)';
const CANVAS_TEXT = 'rgb(0, 0, 0)';
const HIGHLIGHT = 'rgba(5, 0, 73, 0.8)';
const HIGHLIGHT_TEXT = 'rgb(255, 255, 255)';
const GRAY_TEXT = 'rgb(96, 0, 0)';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const BORDER = ['border-top-width', 'border-top-style', 'border-top-color'];

// 스위치 알맹이(::before)의 색과 위치
const thumbOf = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el, '::before');
    return { background: cs.backgroundColor, transform: cs.transform };
  });

// 눈에 보이는 가장자리 두께: 테두리와 윤곽선 중 실제로 그려지는 쪽의 큰 값
const edgeWidthOf = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const border = cs.borderTopStyle === 'none' ? 0 : parseFloat(cs.borderTopWidth);
    const outline = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth);
    return Math.max(border, outline);
  });

test.describe('강제 색상 모드', () => {
  test('스위치: 트랙에 테두리가 있고, 켠 막힘과 끈 막힘이 트랙 면과 알맹이 위치로 갈린다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: '/settings' });
    const sw = page.getByRole('switch', { name: /복귀·복약·병원 일정 알림 받기/ });
    await expect(sw).toBeVisible();

    // 쓸 수 있는 스위치: 끔 트랙도 테두리가 보이고, 알맹이는 글자색이다
    await expect.poll(() => styles(sw, BORDER)).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': CANVAS_TEXT,
    });
    await expect.poll(() => thumbOf(sw)).toEqual({ background: CANVAS_TEXT, transform: 'none' });

    // 알림을 켠 채 보기 전용으로 만든다(쿠키를 지우면 서버 세션이 사라진다)
    const key = await accountKeyOf(page);
    const setNotifications = (value) =>
      page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(`safehour.v2.${key}.prefs`, JSON.stringify({ schemaVersion: 2, data: { notifications: value } }));
        },
        { key, value },
      );
    await setNotifications(true);
    await page.context().clearCookies();
    await page.goto('/settings');
    await expect(sw).toBeDisabled();
    await expect(sw).toBeChecked();

    // 켠 막힘: GrayText 테두리 + GrayText 로 채운 트랙 + 알맹이는 오른쪽(20px)
    await expect.poll(() => styles(sw, BORDER)).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': GRAY_TEXT,
    });
    await expect.poll(async () => (await styles(sw, ['background-color']))['background-color']).toBe(GRAY_TEXT);
    await expect.poll(() => thumbOf(sw)).toEqual({ background: CANVAS, transform: 'matrix(1, 0, 0, 1, 20, 0)' });

    // 끈 막힘: GrayText 테두리 + 빈 트랙 + 알맹이는 왼쪽
    await setNotifications(false);
    await page.goto('/settings');
    await expect(sw).toBeDisabled();
    await expect(sw).not.toBeChecked();
    await expect.poll(() => styles(sw, BORDER)).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': GRAY_TEXT,
    });
    await expect.poll(async () => (await styles(sw, ['background-color']))['background-color']).toBe(CANVAS);
    await expect.poll(() => thumbOf(sw)).toEqual({ background: GRAY_TEXT, transform: 'none' });
  });

  test('설정 언어 행: 고른 라디오 원은 Highlight 채움과 테두리, 점은 HighlightText 다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: '/settings' });

    const korean = page.getByRole('radio', { name: '한국어' });
    await expect(korean).toBeChecked();
    await expect.poll(() => styles(korean, [...BORDER, 'background-color'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': CANVAS_TEXT,
      'background-color': HIGHLIGHT,
    });
    await expect
      .poll(() => korean.evaluate((el) => getComputedStyle(el, '::before').backgroundColor))
      .toBe(HIGHLIGHT_TEXT);

    // 고르지 않은 원은 빈 원이다: 같은 테두리에 면은 Canvas
    const english = page.getByRole('radio', { name: 'English' });
    await expect.poll(() => styles(english, [...BORDER, 'background-color'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': CANVAS_TEXT,
      'background-color': CANVAS,
    });
  });

  test('고른 상태 부품: 고른 날짜 칩·Segmented 고른 칸·내비 현재 칸이 테두리와 Highlight 면으로 갈린다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });

    const bgOf = async (locator) => (await styles(locator, ['background-color']))['background-color'];
    const parts = [
      {
        name: '날짜 칩',
        selected: page.locator('.ui-date-strip a.ui-date-chip.is-selected'),
        plain: page.locator('.ui-date-strip a.ui-date-chip:not(.is-selected):not(.is-today)').first(),
      },
      {
        name: 'Segmented',
        selected: page.locator('.tabs [role="tab"][aria-selected="true"]'),
        plain: page.locator('.tabs [role="tab"][aria-selected="false"]'),
      },
      {
        name: '하단 내비',
        selected: page.locator('.ui-bottom-nav a[aria-current="page"]'),
        plain: page.locator('.ui-bottom-nav a:not([aria-current]):not(.is-emergency)').first(),
      },
    ];
    for (const { name, selected, plain } of parts) {
      await expect(selected, `${name}: 고른 칸이 하나`).toHaveCount(1);
      // 보이는 경계: 테두리나 윤곽선이 1px 이상
      expect(await edgeWidthOf(selected), `${name}: 고른 칸의 경계 두께`).toBeGreaterThanOrEqual(1);
      // 면 색: 고른 칸만 Highlight, 고르지 않은 칸은 Highlight 가 아니다
      await expect.poll(() => bgOf(selected), `${name}: 고른 칸의 면`).toBe(HIGHLIGHT);
      expect(await bgOf(plain), `${name}: 고르지 않은 칸의 면`).not.toBe(HIGHLIGHT);
    }

    // 오늘 칩은 고르지 않은 칩보다 테두리가 굵다(강제 색상에서는 투명 테두리도 보여서 '오늘'이 묻히지 않게)
    const today = page.locator('.ui-date-strip a.ui-date-chip.is-today');
    await expect(today).toHaveCount(1);
    const plainChip = page.locator('.ui-date-strip a.ui-date-chip:not(.is-selected):not(.is-today)').first();
    expect(await edgeWidthOf(today)).toBeGreaterThan(await edgeWidthOf(plainChip));
  });
});
