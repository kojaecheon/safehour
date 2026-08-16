// 개인정보 고지와 단말 데이터 삭제 (AX-210 · AX-211)
//
// SIGNOFF_CHECKLIST 2.4(단말 데이터 삭제 수단)와 2.7(처리방침 고지)이
// "없음" 에서 "있음" 으로 바뀌었음을 코드로 고정한다.
//
// 삭제가 진짜인지는 **저장소가 비었는지**로 확인한다. 화면 문구만 보면
// "지웠다고 말하지만 남아 있는" 상태를 놓친다.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { submitPlan } from './helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function readStorage(page) {
  return page.evaluate(() => ({
    plan: sessionStorage.getItem('safehour.plan'),
    result: sessionStorage.getItem('safehour.result'),
  }));
}

test.describe('개인정보 고지 (AX-211)', () => {
  test('시작 화면에서 고지로 이동할 수 있다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '개인정보와 면책 안내' }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { name: '무엇을 받지 않나요' })).toBeVisible();
  });

  test('결과 화면에서도 고지로 이동할 수 있다', async ({ page }) => {
    await submitPlan(page);
    await page.getByRole('link', { name: '개인정보와 면책 안내' }).click();
    await expect(page).toHaveURL(/\/privacy/);
  });

  test('고지에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await page.goto('/privacy');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, help: v.help })),
      '개인정보 고지 접근성 위반',
    ).toEqual([]);
  });

  test('의료 판단이 아니라는 것과 GPS 미사용이 명시된다', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText('의료진의 판단을 대체하지 않습니다')).toBeVisible();
    await expect(page.getByText(/현재 위치\(GPS\)/).first()).toBeVisible();
    await expect(page.getByText('ⓒ한국관광공사')).toBeVisible();
  });
});

test.describe('개인정보 고지 — 영어', () => {
  test.use({ locale: 'en-US' });

  test('영어 브라우저에서 고지가 영어로 나온다', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'What we never ask for' })).toBeVisible();
    await expect(page.getByText('This is not medical advice')).toBeVisible();
  });
});

test.describe('내 정보 지우기 (AX-210)', () => {
  test('확인을 거쳐야 지워진다', async ({ page }) => {
    await submitPlan(page);
    await expect.poll(async () => (await readStorage(page)).result).not.toBeNull();

    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await expect(page.getByText('되돌릴 수 없습니다')).toBeVisible();

    // 취소하면 아무것도 지워지지 않는다
    await page.getByRole('button', { name: '취소' }).click();
    const afterCancel = await readStorage(page);
    expect(afterCancel.result).not.toBeNull();
  });

  test('지우면 지침과 결과가 실제로 사라지고 시작 화면으로 돌아온다', async ({ page }) => {
    await submitPlan(page);
    const before = await readStorage(page);
    expect(before.plan, '병원 지침이 저장돼 있어야 시나리오가 성립한다').not.toBeNull();
    expect(before.result).not.toBeNull();

    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('button', { name: '지우기' }).click();

    await page.waitForURL((url) => new URL(url).pathname === '/');
    await expect(page.getByText('이 기기에서 입력한 조건과 추천 결과를 지웠습니다')).toBeVisible();

    const after = await readStorage(page);
    expect(after.plan, '병원 지침이 남아 있다').toBeNull();
    expect(after.result, '판정 결과가 남아 있다').toBeNull();
  });

  test('지운 뒤 외출 화면이 다시 연결을 요구한다', async ({ page }) => {
    await submitPlan(page);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: '병원이 정한 조건' })).toBeVisible();

    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('button', { name: '지우기' }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/');

    // 지침이 지워졌으니 판정 화면이 아니라 연결 안내가 나와야 한다
    await page.goto('/plan');
    await expect(page.getByText('병원 지침을 먼저 연결하세요')).toBeVisible();
    await expect(page.getByRole('button', { name: '안전 판정으로 추천 받기' })).toHaveCount(0);
  });

  test('삭제 안내는 한 번만 보인다', async ({ page }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('button', { name: '지우기' }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/');
    await expect(page.getByText('이 기기에서 입력한 조건과 추천 결과를 지웠습니다')).toBeVisible();

    await page.reload();
    await expect(page.getByText('이 기기에서 입력한 조건과 추천 결과를 지웠습니다')).toHaveCount(0);
  });

  test('언어 설정은 지워지지 않는다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('link', { name: 'Plan a safe outing' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete my data from this device' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/');

    // 지운 뒤에도 읽을 수 있어야 한다 — 언어까지 초기화하면 안내를 못 읽는다
    await expect(page.getByRole('link', { name: 'Plan a safe outing' })).toBeVisible();
  });
});
