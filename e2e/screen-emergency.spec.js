// ③층 긴급(/emergency): SEED 화면 배치 (설계서 6.2 10번)
//
// 흰 바탕 한 장: 안내 Callout / 119(긴급 빨강 채움 52px) / 1330(회색 채움) + 해외 발신 링크 / 등록한 병원 목록.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --surface-alt rgb(243, 244, 245), --emergency rgb(200, 16, 46),
// --ink rgb(26, 28, 32), 흰 글자 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, HOSPITAL_PHONE, buildStay, loginDemo, seedStay, startTrip, styles } from './helpers.js';

test.describe('③층 긴급, SEED 배치', () => {
  test('안내 Callout: 왼쪽 띠 없는 회색 면 · 모서리 10 · 안쪽 14, 앞 아이콘, 두 언어 문장', async ({ page }) => {
    await page.goto('/emergency');
    const lead = page.locator('.emergency-lead');
    await expect(lead).toHaveAttribute('role', 'note');
    expect(
      await styles(lead, ['border-left-width', 'background-color', 'border-top-left-radius', 'padding-top']),
    ).toEqual({
      'border-left-width': '0px',
      'background-color': 'rgb(243, 244, 245)',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    await expect(lead.locator('.emergency-lead-icon svg')).toHaveCount(1);
    await expect(lead.locator('.settings-pair-primary')).toBeVisible();
    await expect(lead.locator('.settings-pair-secondary')).toBeVisible();
  });

  test('119: 긴급 빨강 채움 52px 버튼, 이름은 짧게, 설명은 버튼 설명으로 읽힌다', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '119 전화 걸기', exact: true });
    await expect(call).toHaveAttribute('href', 'tel:119');
    await expect(call).toHaveAccessibleDescription('화재·구급 — 구급차가 필요할 때');
    await expect
      .poll(() => styles(call, ['background-color', 'color', 'border-top-left-radius']))
      .toEqual({ 'background-color': 'rgb(200, 16, 46)', color: 'rgb(255, 255, 255)', 'border-top-left-radius': '12px' });
    const box = await call.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(52);
    expect(box.height).toBeLessThan(64);
  });

  test('1330: 회색 채움 52px 버튼, 설명, 해외 발신 링크', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '1330 전화 걸기', exact: true });
    await expect(call).toHaveAttribute('href', 'tel:1330');
    await expect(call).toHaveAccessibleDescription(/관광통역안내/);
    await expect
      .poll(() => styles(call, ['background-color', 'color']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', color: 'rgb(26, 28, 32)' });
    expect((await call.boundingBox()).height).toBeGreaterThanOrEqual(52);
    const intl = page.getByRole('link', { name: '+82-2-1330 전화 걸기' });
    await expect(intl).toHaveAttribute('href', 'tel:+82-2-1330');
  });

  test('채운 강조 버튼은 119 하나뿐이다', async ({ page }) => {
    await page.goto('/emergency');
    await expect(page.locator('main .btn-critical')).toHaveCount(1);
    await expect(page.locator('main .btn:not(.btn-secondary):not(.btn-critical):not(.btn-quiet)')).toHaveCount(0);
  });

  test('등록한 병원: 카드 없이 행, 작은 회색 전화 버튼', async ({ page }) => {
    await startTrip(page, {}, { path: '/emergency' });
    const row = page.locator('.emergency-hospital').filter({ hasText: HOSPITAL_NAME });
    await expect(row).toBeVisible();
    expect(await styles(row, ['border-left-width', 'border-top-left-radius'])).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '0px',
    });
    const call = row.getByRole('link', { name: `${HOSPITAL_PHONE} 전화 걸기` });
    await expect(call).toHaveClass(/btn-secondary/);
    await expect(call).toHaveClass(/btn-small/);
    expect((await call.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('로그인 전: 병원 자리에는 등록한 병원이 없다는 안내', async ({ page }) => {
    await page.goto('/emergency');
    await expect(page.getByText('등록한 병원이 없어요.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: '119 전화 걸기', exact: true })).toBeVisible();
  });

  test('320px English: 긴급 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/emergency' });
    await expect(page.getByRole('link', { name: 'Call 119', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('320px 한국어: 공백 없는 긴 병원 이름도 가로 스크롤을 만들지 않는다', async ({ page }) => {
    const longName = '가나다라마바사아자차카타파하가나다라마바사아자차카타파하';
    await page.setViewportSize({ width: 320, height: 720 });
    await loginDemo(page, '/privacy');
    const stay = buildStay();
    stay.hospitals[0].name = longName;
    await seedStay(page, stay, { confirmToday: true });
    await page.goto('/emergency');
    await expect(page.locator('.emergency-hospital-name').filter({ hasText: longName })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('119 키보드 초점: 긴급 빨강 면 위라 링이 먹색 2px 로 구분된다', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '119 전화 걸기', exact: true });
    // 마우스가 아니라 Tab 으로 닿아야 :focus-visible 이 걸린다
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      if (await call.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(call).toBeFocused();
    expect(await call.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await expect
      .poll(() => styles(call, ['outline-color', 'outline-width']))
      .toEqual({ 'outline-color': 'rgb(26, 28, 32)', 'outline-width': '2px' });
  });

  test('1330 키보드 초점: 회색 보조 버튼은 코발트 링이다(먹색 링은 코발트·빨강·먹색 면에만, 설계서 4.6)', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '1330 전화 걸기', exact: true });
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      if (await call.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(call).toBeFocused();
    expect(await call.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await expect
      .poll(() => styles(call, ['outline-color', 'outline-width']))
      .toEqual({ 'outline-color': 'rgb(10, 92, 255)', 'outline-width': '2px' });
  });
});
