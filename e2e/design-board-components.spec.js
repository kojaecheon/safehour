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
});
