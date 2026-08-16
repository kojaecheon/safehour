// 다국어 흐름 (AX-209)
//
// 대상 사용자는 한국어를 읽지 못하는 외국인 환자다. 그러므로 다음 두 가지가
// 회귀하면 제품이 목적을 잃는다.
//   1. 영어권 브라우저로 들어오면 **아무 조작 없이** 영어로 보인다
//   2. 안전 판정 문구는 언어를 바꿔도 사라지지 않고, 두 언어로 함께 보인다

import { test, expect } from '@playwright/test';
import { assertNoHorizontalScroll } from './helpers.js';

/**
 * 병원 지침을 연결하고 안내 확인까지 마친다.
 * 연결은 비동기라 **"연결됨" 화면이 뜰 때까지 기다려야** 한다 — 기다리지 않고
 * 이동하면 지침이 저장되기 전이라 다음 화면이 미연결 상태로 뜬다.
 */
async function connectPlanEn(page, { outingAllowed = true, ack = true } = {}) {
  await page.goto('/api/auth/login?provider=demo&returnTo=/link');
  await expect(page).toHaveURL(/\/link/);
  await page
    .getByRole('button', {
      name: outingAllowed ? 'Sample A — outing allowed' : 'Sample B — outing restricted',
    })
    .click();
  await expect(page.getByRole('button', { name: 'See today’s status' })).toBeVisible();

  if (ack) {
    await page.goto('/guide');
    await page.getByRole('button', { name: 'Mark all as read' }).click();
  }
}

/** 영어 브라우저에서 병원 지침을 연결하고 판정까지 진행한다 (AX-221) */
async function submitPlanEn(page, { outingAllowed = true } = {}) {
  await connectPlanEn(page, { outingAllowed });
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Run the safety check' }).click();
  await page.waitForURL('**/result');
}

test.describe('영어권 브라우저', () => {
  test.use({ locale: 'en-US' });

  test('조작 없이 영어로 시작한다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Plan a safe outing' })).toBeVisible();
    await expect(page.getByText('Before you start')).toBeVisible();
    // 스크린리더가 올바른 음성으로 읽으려면 문서 언어가 실제로 바뀌어야 한다 (WCAG 3.1.1)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('병원 연결 화면 전체가 영어다', async ({ page }) => {
    await page.goto('/link');
    await expect(page.getByText('Connection code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sample A — outing allowed' })).toBeVisible();
    // 한국어 문구가 남아 있으면 안 된다
    await expect(page.getByText('연결 코드')).toHaveCount(0);
  });

  test('외출 계획 확인 화면 전체가 영어다', async ({ page }) => {
    await connectPlanEn(page);
    await page.goto('/plan');

    await expect(page.getByRole('heading', { name: 'Conditions set by your hospital' })).toBeVisible();
    await expect(page.getByText('Avoid sun')).toBeVisible();
    await expect(page.getByText('병원이 정한 조건')).toHaveCount(0);
  });

  test('지침 미연결 안내도 영어로 나온다', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.getByText('Connect your hospital plan first')).toBeVisible();
  });

  test('추천 결과와 변화 대응이 영어로 동작한다', async ({ page }) => {
    await submitPlanEn(page);

    await expect(page.getByText('Be back by')).toBeVisible();
    const cards = page.locator('.course-card');
    await expect(cards.first()).toBeVisible();

    // 변화 이벤트 → 재판정 → 델타 시트까지 영어여야 한다
    await page.getByRole('button', { name: /Top place closes/ }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.getByText('already applied')).toBeVisible();
    await page.locator('.sheet').getByRole('button', { name: 'OK' }).click();

    // 시트를 닫아도 변화 요약이 남는다 (ADR-0001 보완 조건 5)
    await expect(page.getByText(/Latest change: Place closed/)).toBeVisible();
    await assertNoHorizontalScroll(page, '영어 결과 화면');
  });

  test('미추천 결과의 안전 문구가 영어로 나온다', async ({ page }) => {
    await submitPlanEn(page, { outingAllowed: false });

    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('Tourism is not recommended right now');
    await expect(banner).toContainText('Hospital restricted outings');
    await expect(page.locator('.course-card')).toHaveCount(0);
  });

  test('즉시 복귀 지시가 영어로 나온다', async ({ page }) => {
    await submitPlanEn(page);
    await page.getByRole('button', { name: 'Return now' }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.getByText('Head to the point below')).toBeVisible();
  });
});

test.describe('언어 전환', () => {
  test.use({ locale: 'ko-KR' });

  test('한국어에서 English 로 바꾸면 화면이 즉시 바뀐다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: '안심 코스 만들기' })).toBeVisible();

    await page.getByRole('button', { name: 'English' }).click();

    await expect(page.getByRole('link', { name: 'Plan a safe outing' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('선택한 언어가 화면을 옮겨도 유지된다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('link', { name: 'Plan a safe outing' }).click();

    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText('No hospital plan is connected')).toBeVisible();
  });

  test('안전 판정 배너는 항상 두 언어를 함께 보여준다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=/link');
    await page.getByRole('button', { name: '예시 B — 외출 제한' }).click();
    // 연결이 끝나야 지침이 저장된다
    await expect(page.getByRole('button', { name: '오늘의 회복 상태 보기' })).toBeVisible();

    await page.goto('/guide');
    await page.getByRole('button', { name: '전체 확인 처리' }).click();
    await page.goto('/plan');
    await page.getByRole('button', { name: '안전 판정으로 추천 받기' }).click();
    await page.waitForURL('**/result');

    // 한국어 화면에서도 영문이 병기된다 — 언어를 못 바꾼 사용자를 위한 안전장치
    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('지금은 관광을 권하지 않습니다');
    await expect(banner).toContainText('Tourism is not recommended right now');

    // 언어를 바꾸면 주·보조가 뒤집힌다
    await page.getByRole('button', { name: 'English' }).click();
    await expect(banner).toContainText('Tourism is not recommended right now');
    await expect(banner).toContainText('지금은 관광을 권하지 않습니다');
  });

  test('언어 전환 버튼이 44px 터치 대상을 지킨다', async ({ page }) => {
    await page.goto('/');
    for (const name of ['한국어', 'English']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box.height, `${name} 버튼 높이`).toBeGreaterThanOrEqual(44);
    }
    await assertNoHorizontalScroll(page, '언어 전환이 있는 시작 화면');
  });
});
