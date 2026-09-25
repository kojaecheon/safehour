// ②층 부품 — 시안 보드(/design-board) 견본의 계산된 모양을 잰다 (설계서 5장)
//
// - 모양은 부품이 정한다. 화면이 아니라 시안 보드의 견본을 재므로 화면 배치가 바뀌어도 흔들리지 않는다.
// - 색은 getComputedStyle 이 돌려주는 rgb() 문자열로 비교한다. 토큰 값: --accent rgb(10, 92, 255) ·
//   --accent-strong rgb(0, 70, 209) · --surface-alt rgb(243, 244, 245) · --pressed rgb(247, 248, 249) ·
//   --pressed-weak rgb(238, 239, 241) · --ink rgb(26, 28, 32) · --ink-soft rgb(85, 93, 109) ·
//   --ink-subtle(= --line-input) rgb(134, 139, 148) · --selected rgb(42, 48, 56) · --emergency rgb(200, 16, 46)
// - 눌림 색은 150ms 전환이 있어 expect.poll 로 기다린다. 재기 전에 포인터를 치워 호버 색이 섞이지 않게 한다.

import { test, expect } from './fixtures.js';

/** 요소의 계산된 스타일 몇 가지를 { 속성: 값 } 으로 */
async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

/** 호버가 남지 않게 포인터를 화면 구석으로 */
async function pointerAway(page) {
  await page.mouse.move(0, 0);
}

test.describe('②층 부품 — 시안 보드에서 잰 모양', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '디자인 시안 보드', level: 1 })).toBeVisible();
  });

  test('버튼 — 크기·모서리·글자, 변형별 면, 눌림은 면 색만 (설계서 5.1)', async ({ page }) => {
    const area = page.locator('#designBoard-c-button');
    await pointerAway(page);

    const primary = area.getByRole('button', { name: '주 버튼' });
    expect(
      await styles(primary, ['min-height', 'border-top-left-radius', 'font-size', 'line-height', 'font-weight', 'background-color']),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'font-size': '18px',
      'line-height': '24px',
      'font-weight': '700',
      'background-color': 'rgb(10, 92, 255)',
    });

    const small = area.getByRole('button', { name: '작은 버튼' }).first();
    expect(await styles(small, ['min-height', 'border-top-left-radius', 'font-size', 'line-height'])).toEqual({
      'min-height': '44px',
      'border-top-left-radius': '8px',
      'font-size': '16px',
      'line-height': '22px',
    });
    expect((await small.boundingBox()).height).toBeGreaterThanOrEqual(44);

    const secondary = area.getByRole('button', { name: '보조 버튼' });
    expect(await styles(secondary, ['background-color', 'color', 'border-top-color'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(26, 28, 32)',
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });

    const quiet = area.getByRole('button', { name: '조용한 버튼' });
    expect(await styles(quiet, ['background-color', 'color', 'text-decoration-line'])).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
      color: 'rgb(26, 28, 32)',
      'text-decoration-line': 'none',
    });

    const critical = area.getByRole('button', { name: '되돌릴 수 없는 확인' });
    expect((await styles(critical, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');

    const disabled = area.getByRole('button', { name: '비활성 버튼' });
    expect(await styles(disabled, ['background-color', 'color', 'cursor'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(134, 139, 148)',
      cursor: 'not-allowed',
    });

    const busy = area.getByRole('button', { name: '처리 중 버튼' });
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');

    // 눌림 — 면 색만 바뀐다
    const bg = (locator) => styles(locator, ['background-color']).then((s) => s['background-color']);
    await primary.hover();
    await page.mouse.down();
    await expect.poll(() => bg(primary)).toBe('rgb(0, 70, 209)');
    await page.mouse.up();
    await secondary.hover();
    await page.mouse.down();
    await expect.poll(() => bg(secondary)).toBe('rgb(238, 239, 241)');
    await page.mouse.up();

    // 긴급 버튼 — 큰 CTA 모양, 그림자 없음
    await pointerAway(page);
    const emergency = page.locator('#designBoard-c-shell .ui-emergency');
    expect(await styles(emergency, ['min-height', 'border-top-left-radius', 'box-shadow', 'font-size'])).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'box-shadow': 'none',
      'font-size': '18px',
    });
  });

  test('입력·선택 — 입력칸·답 칩·선택 상자·스위치·전환·날짜 칩 (설계서 5.2·5.3)', async ({ page }) => {
    await pointerAway(page);

    // 입력칸: 52px · 모서리 12 · 좌우 16 · 3:1 테두리. 초점은 2px 진한 테두리, 윤곽선 없음. 오류는 빨강
    const input = page.locator('#designBoard-input');
    expect(
      await styles(input, ['min-height', 'border-top-left-radius', 'border-top-color', 'font-size', 'padding-left']),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(134, 139, 148)',
      'font-size': '16px',
      'padding-left': '16px',
    });
    await input.focus();
    await expect
      .poll(() => styles(input, ['border-top-color', 'box-shadow', 'outline-style']))
      .toEqual({
        'border-top-color': 'rgb(26, 28, 32)',
        'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
        'outline-style': 'none',
      });
    const invalid = page.locator('#designBoard-input-error');
    expect((await styles(invalid, ['border-top-color']))['border-top-color']).toBe('rgb(200, 16, 46)');

    // 답 칩: 44px 알약 · 16px · 3:1 테두리. 고르면 진한 테두리 + 회색 면 + 굵게 + 체크
    const yes = page.locator('#designBoard-c-answer .ui-answer').first().locator('.ui-answer-option').first();
    expect(await styles(yes, ['min-height', 'border-top-left-radius', 'font-size', 'border-top-color'])).toEqual({
      'min-height': '44px',
      'border-top-left-radius': '9999px',
      'font-size': '16px',
      'border-top-color': 'rgb(134, 139, 148)',
    });
    await yes.click();
    await expect(yes).toHaveClass(/is-selected/);
    await pointerAway(page);
    await expect
      .poll(() => styles(yes, ['background-color', 'border-top-color', 'font-weight']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-color': 'rgb(26, 28, 32)', 'font-weight': '700' });
    await expect(yes.locator('.ui-answer-mark')).toBeVisible();

    // 선택 상자: 모서리 12. 고른 칸은 2px 진한 테두리, 나머지는 3:1 테두리
    const boxes = page.locator('#designBoard-c-select .radio-option');
    await expect(boxes.nth(0)).toHaveClass(/selected/);
    expect(await styles(boxes.nth(0), ['border-top-left-radius', 'border-top-color', 'box-shadow'])).toEqual({
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(26, 28, 32)',
      'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
    });
    expect((await styles(boxes.nth(1), ['border-top-color']))['border-top-color']).toBe('rgb(134, 139, 148)');

    // 스위치: 52×32, 끔은 --ink-subtle, 켬은 --selected
    const sw = page.getByRole('switch', { name: '알림 켜기 (견본)' });
    expect(await styles(sw, ['width', 'height', 'background-color'])).toEqual({
      width: '52px',
      height: '32px',
      'background-color': 'rgb(134, 139, 148)',
    });
    await sw.check();
    await pointerAway(page);
    await expect.poll(() => styles(sw, ['background-color']).then((s) => s['background-color'])).toBe('rgb(42, 48, 56)');

    // 전환(Segmented): 회색 알약 통, 고른 칸은 흰 면 + 진한 글자, 안 고른 칸은 보조 글자
    const seg = page.locator('.tabs').first();
    expect(await styles(seg, ['border-top-left-radius', 'background-color'])).toEqual({
      'border-top-left-radius': '9999px',
      'background-color': 'rgb(243, 244, 245)',
    });
    expect(
      await styles(seg.locator('[aria-selected="true"]'), ['min-height', 'background-color', 'color', 'font-weight']),
    ).toEqual({ 'min-height': '44px', 'background-color': 'rgb(255, 255, 255)', color: 'rgb(26, 28, 32)', 'font-weight': '700' });
    expect((await styles(seg.locator('[aria-selected="false"]'), ['color'])).color).toBe('rgb(85, 93, 109)');

    // 날짜 칩: 고른 날 진한 회색 채움 + 흰 글자, '오늘' 코발트 테두리, 나머지 회색 면
    const chips = page.locator('#designBoard-c-datechip .ui-date-chip');
    expect(
      await styles(page.locator('#designBoard-c-datechip .ui-date-chip.is-selected'), [
        'background-color',
        'color',
        'border-top-left-radius',
      ]),
    ).toEqual({ 'background-color': 'rgb(42, 48, 56)', color: 'rgb(255, 255, 255)', 'border-top-left-radius': '12px' });
    expect((await styles(chips.nth(0), ['border-top-color']))['border-top-color']).toBe('rgb(10, 92, 255)');
    expect((await styles(chips.nth(2), ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });

  test('배지·안내 — 배지 모양, 상태 배너, 안내 상자, 출처 영역, 빈 상태 (설계서 5.4·5.6)', async ({ page }) => {
    await pointerAway(page);

    // 배지 5종: 14/19 · 모서리 6 · 좌우 8 · 높이 28px 안팎
    const area = page.locator('#designBoard-c-badge');
    const badges = area.locator('.ui-badge');
    await expect(badges).toHaveCount(5);
    for (const badge of await badges.all()) {
      expect(await styles(badge, ['font-size', 'line-height', 'border-top-left-radius', 'padding-left'])).toEqual({
        'font-size': '14px',
        'line-height': '19px',
        'border-top-left-radius': '6px',
        'padding-left': '8px',
      });
      const { height } = await badge.boundingBox();
      expect(height).toBeGreaterThanOrEqual(26);
      expect(height).toBeLessThanOrEqual(30);
    }
    expect(await styles(area.locator('.ui-badge-estimate'), ['background-color', 'border-top-color'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });
    expect(await styles(area.locator('.ui-badge-hoursUnconfirmed'), ['border-top-style', 'border-top-color'])).toEqual({
      'border-top-style': 'dotted',
      'border-top-color': 'rgb(134, 139, 148)',
    });
    expect(await styles(area.locator('.ui-badge-readOnly'), ['background-color', 'font-weight'])).toEqual({
      'background-color': 'rgb(51, 64, 85)',
      'font-weight': '700',
    });
    expect(await styles(area.locator('.ui-source-tag').first(), ['border-top-left-radius', 'font-size'])).toEqual({
      'border-top-left-radius': '6px',
      'font-size': '14px',
    });

    // 상태 배너 (Callout): 모서리 10 · 안쪽 14 · 라벨 16px · 아이콘 20px
    const banner = page.locator('#designBoard-c-state .state-banner').first();
    expect(await styles(banner, ['border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    expect((await styles(banner.locator('.state-label'), ['font-size']))['font-size']).toBe('16px');
    expect((await banner.locator('.state-icon svg').boundingBox()).width).toBe(20);

    // 안내 상자: 왼쪽 띠 없는 회색 면 · 모서리 10 · 16px
    const callout = page.locator('#designBoard-c-callout .medical-callout');
    expect(
      await styles(callout, ['border-top-left-radius', 'border-left-width', 'background-color', 'font-size']),
    ).toEqual({
      'border-top-left-radius': '10px',
      'border-left-width': '0px',
      'background-color': 'rgb(243, 244, 245)',
      'font-size': '16px',
    });

    // 출처 영역: 모서리 10, 병원 발행은 왼쪽 띠를 지킨다
    expect(
      await styles(page.locator('#designBoard-c-source .ui-source-hospital'), ['border-top-left-radius', 'border-left-width']),
    ).toEqual({ 'border-top-left-radius': '10px', 'border-left-width': '6px' });

    // 빈 상태 (Result Section): 바탕 없이 가운데
    expect(
      (await styles(page.locator('#designBoard-c-empty .ui-empty'), ['background-color']))['background-color'],
    ).toBe('rgba(0, 0, 0, 0)');
  });
});
