// 강제 색상 모드(Windows 고대비): 면 색이나 그림자로만 보이던 부품이 사라지지 않는다
//
// 강제 색상에서는 브라우저가 배경색을 시스템 색(Canvas)으로 바꾸고 그림자를 지운다.
// 테두리 없이 면으로만 그린 부품(스위치 트랙, 고른 라디오 원, 고른 칩)은 통째로 사라지거나 고른 상태가 안 보인다.
// Playwright 의 forcedColors 에뮬레이션을 켜고, 계산된 스타일로 '보이는 경계와 면'을 단언한다.
//
// 시스템 색의 실제 rgb 는 브라우저와 운영체제가 정한다(Chromium 에뮬레이션에서 Highlight 는 알파 0.8 로도 나온다).
// 그래서 rgb 를 상수로 박지 않고, 페이지 안에서 시스템 색 키워드를 탐침 요소로 풀어 읽은 값과 같은지 본다.

import { test, expect } from './fixtures.js';
import { accountKeyOf, kstDate, startTrip, styles } from './helpers.js';

/**
 * 강제 색상이 켜져 있는지 확인하고, 시스템 색 키워드를 이 브라우저가 계산하는 값으로 풀어 돌려준다.
 * 탐침 요소의 color 로 읽는다(시스템 색 키워드는 강제 색상에서도 작성자 값 그대로 계산된다).
 */
async function systemColors(page) {
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), '강제 색상이 켜져 있어야 한다').toBe(true);
  const colors = await page.evaluate(() => {
    const read = (keyword) => {
      const probe = document.createElement('i');
      probe.style.color = keyword;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return Object.fromEntries(['Canvas', 'CanvasText', 'Highlight', 'HighlightText', 'GrayText'].map((k) => [k, read(k)]));
  });
  // 키워드가 풀리지 않아 모두 같은 값이 되면 아래 단언이 아무것도 가르지 못한다
  expect(new Set(Object.values(colors)).size, `시스템 색이 서로 달라야 한다: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4);
  return colors;
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

// 키보드로 초점을 옮겨 온다(Tab 으로 나갔다가 Shift+Tab 으로 돌아와 :focus-visible 이 확실히 켜지게)
async function focusByKeyboard(page, locator) {
  await locator.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((el) => el.matches(':focus-visible')), '키보드 초점이면 :focus-visible 이다').toBe(true);
}

test.describe('강제 색상 모드', () => {
  test('스위치: 트랙에 테두리가 있고, 켠 막힘과 끈 막힘이 트랙 면과 알맹이 위치로 갈린다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: '/settings' });
    const sys = await systemColors(page);
    const sw = page.getByRole('switch', { name: /복귀·복약·병원 일정 알림 받기/ });
    await expect(sw).toBeVisible();

    // 쓸 수 있는 스위치: 끔 트랙도 테두리가 보이고, 알맹이는 글자색이다
    await expect.poll(() => styles(sw, BORDER)).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': sys.CanvasText,
    });
    await expect.poll(() => thumbOf(sw)).toEqual({ background: sys.CanvasText, transform: 'none' });

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
      'border-top-color': sys.GrayText,
    });
    await expect.poll(async () => (await styles(sw, ['background-color']))['background-color']).toBe(sys.GrayText);
    await expect.poll(() => thumbOf(sw)).toEqual({ background: sys.Canvas, transform: 'matrix(1, 0, 0, 1, 20, 0)' });

    // 끈 막힘: GrayText 테두리 + 빈 트랙 + 알맹이는 왼쪽
    await setNotifications(false);
    await page.goto('/settings');
    await expect(sw).toBeDisabled();
    await expect(sw).not.toBeChecked();
    await expect.poll(() => styles(sw, BORDER)).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': sys.GrayText,
    });
    await expect.poll(async () => (await styles(sw, ['background-color']))['background-color']).toBe(sys.Canvas);
    await expect.poll(() => thumbOf(sw)).toEqual({ background: sys.GrayText, transform: 'none' });
  });

  test('설정 언어 행: 고른 라디오 원은 Highlight 채움과 테두리, 점은 HighlightText 다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: '/settings' });
    const sys = await systemColors(page);

    const korean = page.getByRole('radio', { name: '한국어' });
    await expect(korean).toBeChecked();
    await expect.poll(() => styles(korean, [...BORDER, 'background-color'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': sys.CanvasText,
      'background-color': sys.Highlight,
    });
    await expect
      .poll(() => korean.evaluate((el) => getComputedStyle(el, '::before').backgroundColor))
      .toBe(sys.HighlightText);

    // 고르지 않은 원은 빈 원이다: 같은 테두리에 면은 Canvas
    const english = page.getByRole('radio', { name: 'English' });
    await expect.poll(() => styles(english, [...BORDER, 'background-color'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': sys.CanvasText,
      'background-color': sys.Canvas,
    });
  });

  test('고른 상태 부품: 고른 날짜 칩·Segmented 고른 칸·내비 현재 칸이 테두리와 Highlight 면으로 갈리고, 키보드 초점 링은 CanvasText 다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const sys = await systemColors(page);

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
      await expect.poll(() => bgOf(selected), `${name}: 고른 칸의 면`).toBe(sys.Highlight);
      expect(await bgOf(plain), `${name}: 고르지 않은 칸의 면`).not.toBe(sys.Highlight);
    }

    // 고른 칸은 forced-color-adjust: none 이라 작성자 색이 그대로 쓰인다. 초점 링도 시스템 색이어야
    // 어두운 대비 테마(Canvas 가 검정)에서 링이 면과 같은 색으로 묻히지 않는다(WCAG 2.4.7)
    for (const { name, selected } of parts) {
      await focusByKeyboard(page, selected);
      await expect
        .poll(() => styles(selected, ['outline-style', 'outline-color']), `${name}: 키보드 초점 링`)
        .toEqual({ 'outline-style': 'solid', 'outline-color': sys.CanvasText });
    }

    // 오늘 칩은 고르지 않은 칩보다 테두리가 굵다(강제 색상에서는 투명 테두리도 보여서 '오늘'이 묻히지 않게)
    const today = page.locator('.ui-date-strip a.ui-date-chip.is-today');
    await expect(today).toHaveCount(1);
    const plainChip = page.locator('.ui-date-strip a.ui-date-chip:not(.is-selected):not(.is-today)').first();
    expect(await edgeWidthOf(today)).toBeGreaterThan(await edgeWidthOf(plainChip));
  });

  test('글자 입력칸: 키보드 초점이 시스템 색 윤곽선으로 보인다(테두리 색과 안쪽 그림자만으로는 사라진다)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await startTrip(page);
    await page.goto('/onboarding?edit=1');
    const sys = await systemColors(page);
    const date = page.locator('#ob-arrival-date');
    await expect(date).toBeVisible();

    // 초점 전에는 윤곽선이 없다
    expect((await styles(date, ['outline-style']))['outline-style']).toBe('none');
    // 강제 색상은 안쪽 그림자를 지우고 테두리를 시스템 색 하나로 맞춘다: 초점은 윤곽선으로만 남는다.
    // 투명 윤곽선은 시스템 색으로 바뀐다(Chromium 은 초점 윤곽선을 Highlight 로 그린다)
    await focusByKeyboard(page, date);
    await expect.poll(() => styles(date, ['outline-style', 'outline-color'])).toEqual({
      'outline-style': 'solid',
      'outline-color': sys.Highlight,
    });
  });

  test('링크형 비활성 버튼(aria-disabled): 글자와 테두리가 GrayText 라 켜진 버튼과 갈린다', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/login');
    const sys = await systemColors(page);

    // 공급자 설정이 없는 소셜 로그인은 링크 대신 aria-disabled 버튼이다(disabled 속성이 없어 브라우저가 GrayText 로 바꾸지 않는다)
    const disabled = page.locator('.onboarding-login-methods button[aria-disabled="true"]').first();
    await expect(disabled).toBeVisible();
    await expect.poll(() => styles(disabled, ['color', 'border-top-color'])).toEqual({
      color: sys.GrayText,
      'border-top-color': sys.GrayText,
    });
    // 누를 수 있는 데모 로그인은 GrayText 가 아니다
    const demo = page.getByRole('link', { name: '데모 계정으로 둘러보기' });
    expect((await styles(demo, ['color'])).color).not.toBe(sys.GrayText);
  });
});
