// ③층 설정(/settings): SEED 화면 배치 (설계서 6.2 12번)
//
// 회색 바탕 위 흰 블록 네 개: 언어(Radio 행) / 알림(Switch 행 + 안내) / 민감정보 동의 / 내 정보(지우기).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --selected rgb(42, 48, 56), --line-input rgb(134, 139, 148), --emergency rgb(200, 16, 46).

import { test, expect } from './fixtures.js';
import { accountKeyOf, evidenceShot, gapBetween, startTrip, styles } from './helpers.js';

// 스위치 알맹이(::before)의 색과 위치
const thumbOf = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el, '::before');
    return { background: cs.backgroundColor, transform: cs.transform };
  });

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
    // 화면 끝까지 내리면 마지막 블록과 하단 내비 사이가 화면 끝 여백 56px 이다(블록 틈 8px 은 더하지 않는다).
    // 위쪽 한계(57)가 8px 틈이 몰래 돌아오는 것을 막는다(1px 은 반올림 여유)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const endGap = gapBetween(await blocks.last().boundingBox(), await page.locator('.ui-bottom-nav').boundingBox());
    expect(endGap).toBeGreaterThanOrEqual(56);
    expect(endGap).toBeLessThanOrEqual(57);
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
    // 호버하면 눌림 면(::before, 목록 행과 같은 모양)이 --pressed-transparent 를 낸다. 행 자체에는 면을 칠하지 않는다
    const englishRow = rows.filter({ has: english });
    await englishRow.hover();
    await expect
      .poll(() => englishRow.evaluate((el) => getComputedStyle(el, '::before').backgroundColor))
      .toBe('rgba(0, 0, 0, 0.027)');
    expect((await styles(englishRow, ['background-color']))['background-color']).toBe('rgba(0, 0, 0, 0)');
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
    // 초점 링의 모서리는 목록 행 눌림과 같은 10px 이다(전역 규칙의 12px 가 아니다)
    expect((await styles(row, ['border-top-left-radius']))['border-top-left-radius']).toBe('10px');
  });

  test('보기 전용: 막힌 스위치도 켬(--ink-subtle 채움)과 끔(회색 면 + 3:1 테두리)이 면 색과 위치로 갈린다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    // 알림을 켠 상태로 기기 저장소에 둔다(seedStay 가 prefs 를 쓰는 방식 그대로)
    const key = await accountKeyOf(page);
    await page.evaluate((key) => {
      localStorage.setItem(
        `safehour.v2.${key}.prefs`,
        JSON.stringify({ schemaVersion: 2, data: { notifications: true } }),
      );
    }, key);
    // 서버 세션이 사라진다. 기기에는 마지막 계정의 사본만 남아 보기 전용이 된다
    await page.context().clearCookies();
    await page.goto('/settings');
    const sw = page.getByRole('switch', { name: /복귀·복약·병원 일정 알림 받기/ });
    await expect(
      page.locator('section[aria-labelledby="settings-notify-title"]').getByText('보기 전용에서는 바꿀 수 없어요. 로그인하면 바꿀 수 있어요.'),
    ).toBeVisible();
    await expect(sw).toBeDisabled();
    await expect(sw).toBeChecked();
    // 켬·막힘: 흰 바탕 3.42:1 인 --ink-subtle 채움, 알맹이는 흰색이고 오른쪽(20px 이동)
    await expect.poll(async () => (await styles(sw, ['background-color']))['background-color']).toBe('rgb(134, 139, 148)');
    await expect.poll(() => thumbOf(sw)).toEqual({ background: 'rgb(255, 255, 255)', transform: 'matrix(1, 0, 0, 1, 20, 0)' });
    await sw.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await evidenceShot(page, 'settings-readonly-switch-on', { fullPage: false });

    // 끔·막힘: 회색 면 + 3:1 테두리(--line-input) + 회색 알맹이(--ink-subtle), 왼쪽
    await page.evaluate((key) => {
      localStorage.setItem(
        `safehour.v2.${key}.prefs`,
        JSON.stringify({ schemaVersion: 2, data: { notifications: false } }),
      );
    }, key);
    await page.goto('/settings');
    await expect(sw).toBeDisabled();
    await expect(sw).not.toBeChecked();
    await expect
      .poll(async () => (await styles(sw, ['box-shadow']))['box-shadow'])
      .toContain('rgb(134, 139, 148)');
    expect((await styles(sw, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await expect.poll(() => thumbOf(sw)).toEqual({ background: 'rgb(134, 139, 148)', transform: 'none' });
    await sw.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await evidenceShot(page, 'settings-readonly-switch-off', { fullPage: false });
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

test.describe('③층 설정, 되돌릴 수 없는 확인', () => {
  test('동의 철회 시트: 확인 버튼만 긴급 빨강, 철회 버튼과 취소는 회색, 시트 뒤 블록은 눌리지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const withdraw = page.getByRole('button', { name: '동의 철회' });
    await expect.poll(async () => (await styles(withdraw, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await withdraw.click();
    const sheet = page.getByRole('dialog', { name: '민감정보 동의를 철회할까요?' });
    await expect(sheet).toBeVisible();
    const confirm = sheet.getByRole('button', { name: '철회하기' });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    const cancel = sheet.getByRole('button', { name: '취소' });
    await expect.poll(async () => (await styles(cancel, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    // 시트가 열리면 나머지 세 블록은 모두 inert 다(두 확인 버튼을 동시에 누를 수 없다)
    for (const id of ['settings-lang-title', 'settings-notify-title', 'settings-data-title']) {
      await expect(page.locator(`section[aria-labelledby="${id}"]`)).toHaveAttribute('inert', '');
    }
    await cancel.click();
    await expect(sheet).toHaveCount(0);
  });

  test('내 정보 지우기: 확인 단계의 지우기만 긴급 빨강, 취소하면 처음 버튼으로', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const start = page.getByRole('button', { name: '이 기기에서 내 정보 지우기' });
    await expect.poll(async () => (await styles(start, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await start.click();
    const confirm = page.getByRole('button', { name: '지우기', exact: true });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    const cancel = page.getByRole('button', { name: '취소', exact: true });
    await expect.poll(async () => (await styles(cancel, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await cancel.click();
    await expect(page.getByRole('button', { name: '이 기기에서 내 정보 지우기' })).toBeVisible();
  });
});
