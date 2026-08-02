// AX-004 — 핵심 흐름 E2E (D09-AC018, QA033–QA040)
//
// 검증 대상: 입력 → 판정 결과 → 휴무 이벤트로 대체 → 즉시 복귀 안내가
// 360px 화면에서 끊김 없이 동작하고, 현재 GPS 를 한 번도 요구하지 않는다.

import { test, expect } from '@playwright/test';
import { submitPlan, assertNoHorizontalScroll } from './helpers.js';

/** 현재 GPS 요청을 감시한다 — 한 번이라도 호출되면 D07-BAN002 위반이다 */
async function watchGeolocation(page) {
  await page.addInitScript(() => {
    window.__gpsCalls = [];
    const geo = navigator.geolocation;
    if (!geo) return;
    for (const method of ['getCurrentPosition', 'watchPosition']) {
      const original = geo[method]?.bind(geo);
      if (!original) continue;
      geo[method] = (...args) => {
        window.__gpsCalls.push(method);
        return original(...args);
      };
    }
  });
}

async function assertNoGpsRequest(page) {
  const calls = await page.evaluate(() => window.__gpsCalls ?? []);
  expect(calls, '현재 GPS 를 요청했다 (D07-BAN002 위반)').toEqual([]);
}

test.describe('핵심 흐름 (AC018)', () => {
  test.beforeEach(async ({ page }) => {
    await watchGeolocation(page);
  });

  test('입력 → 추천 → 휴무 대체 → 즉시 복귀가 끊기지 않는다', async ({ page }) => {
    // ── 1. 시작 화면 ──
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertNoHorizontalScroll(page, '시작 화면');

    // ── 2. 조건 입력 → 판정 ──
    await submitPlan(page);

    // ── 3. 판정 결과 ──
    const banner = page.locator('.state-banner').first();
    await expect(banner).toBeVisible();
    // 복귀 정보는 모든 결과 화면에 항상 보인다
    await expect(page.getByText('복귀 마감')).toBeVisible();
    // 추천은 상위 3개만 노출한다 (엔진은 최대 5개 산출)
    const cards = page.locator('.course-card');
    await expect(cards).toHaveCount(3);
    // 이동시간이 폴백 추정이면 반드시 표시한다 (D06-E011)
    await expect(page.locator('.badge-estimate').first()).toBeVisible();
    await assertNoHorizontalScroll(page, '결과 화면');

    const firstTitle = await cards.first().locator('h3').innerText();

    // ── 4. 휴무 이벤트 → 재판정 ──
    await page.getByRole('button', { name: /1순위 장소 휴무/ }).click();

    // 재판정 결과는 시트가 뜨기 전에 이미 적용된다 (D07-BAN008)
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('이미 적용했습니다')).toBeVisible();
    await expect(sheet.getByText('제거')).toBeVisible();

    await sheet.getByRole('button', { name: '확인' }).click();
    await expect(sheet).not.toBeVisible();

    // 휴무 처리된 1순위가 코스에서 빠졌다
    await expect(cards.first().locator('h3')).not.toHaveText(firstTitle);
    // 시트를 닫아도 변화 요약이 남는다 (AC010·AC012 증빙)
    await expect(page.getByText(/마지막 변화: 장소 휴무/)).toBeVisible();
    await assertNoHorizontalScroll(page, '재판정 후 결과 화면');

    // ── 5. 즉시 복귀 안내 ──
    await page.getByRole('button', { name: '즉시 복귀 안내' }).click();
    const returnSheet = page.locator('.sheet');
    await expect(returnSheet.getByText('지금 복귀하세요')).toBeVisible();
    await expect(returnSheet.getByText('복귀 마감')).toBeVisible();
    await returnSheet.getByRole('button', { name: '확인' }).click();

    // ── 6. 전 구간에서 현재 GPS 를 요구하지 않았다 ──
    await assertNoGpsRequest(page);
  });

  test('환자 호출은 모든 추천을 무효화하고 즉시 복귀로 전환한다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    await page.getByRole('button', { name: /환자 호출/ }).click();

    // 상태 배너가 미추천으로 바뀌고 코스가 사라진다
    await expect(page.locator('.state-banner').first()).toContainText('관광을 권하지 않습니다');
    await expect(page.locator('.course-card')).toHaveCount(0);

    // 즉시 복귀 안내가 자동으로 뜬다
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();

    await assertNoGpsRequest(page);
  });

  test('차단 판정에서는 장소 상세로 우회할 수 없다 (ADR-0001)', async ({ page }) => {
    await submitPlan(page);

    // 상세 진입 경로를 먼저 확보한다
    const detailLink = page.getByRole('link', { name: /추천 근거와 원문 보기/ }).first();
    const href = await detailLink.getAttribute('href');
    expect(href).toMatch(/^\/place\//);

    // 환자 호출로 차단 상태를 만든 뒤 상세 URL 로 직접 진입한다
    await page.getByRole('button', { name: /환자 호출/ }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();

    await page.goto(href);
    await expect(page.getByText('지금은 관광을 권하지 않습니다')).toBeVisible();
    // 관광 원문이 노출되면 안 된다
    await expect(page.getByText('관광정보 원문')).toHaveCount(0);
  });
});

test.describe('입력 유지 (D03-NAV004)', () => {
  test('결과에서 돌아와도 입력한 조건이 남는다', async ({ page }) => {
    await watchGeolocation(page);
    await page.goto('/plan');

    await page.getByRole('button', { name: '방금 받음' }).click();
    await page.getByText('외출이 허용되었습니다').click();
    await page.locator('#anchor-label').fill('테스트 병원');
    await page.locator('#max-walk').fill('12');

    await page.getByRole('button', { name: '안전 판정으로 추천 받기' }).click();
    await page.waitForURL('**/result');

    // 결과에서 조건 입력으로 돌아간다
    await page.getByRole('button', { name: '조건 입력으로 돌아가기' }).click();
    await page.waitForURL('**/plan');

    await expect(page.locator('#anchor-label')).toHaveValue('테스트 병원');
    await expect(page.locator('#max-walk')).toHaveValue('12');
    await expect(page.locator('#issued-at')).not.toHaveValue('');
    await expect(page.getByText(/이전에 입력한 조건을 복원했습니다/)).toBeVisible();
  });
});

test.describe('안전 게이트 (QA033–QA040)', () => {
  test('외출이 허용되지 않으면 관광을 추천하지 않는다', async ({ page }) => {
    await watchGeolocation(page);
    await page.goto('/plan');

    await page.getByRole('button', { name: '방금 받음' }).click();
    await page.getByText('외출이 허용되지 않았습니다').click();
    await page.getByRole('button', { name: '안전 판정으로 추천 받기' }).click();
    await page.waitForURL('**/result');

    await expect(page.locator('.state-banner').first()).toContainText('관광을 권하지 않습니다');
    await expect(page.getByText('병원이 외출을 제한했습니다')).toBeVisible();
    await expect(page.locator('.course-card')).toHaveCount(0);
    await assertNoGpsRequest(page);
  });

  test('외출 허용을 선택하지 않으면 제출이 막힌다', async ({ page }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '방금 받음' }).click();
    await page.getByRole('button', { name: '안전 판정으로 추천 받기' }).click();

    // Next 의 라우트 안내자도 role=alert 라 화면 배너로 좁힌다
    await expect(page.locator('.state-banner[role="alert"]')).toContainText(
      '외출 허용 여부를 선택해 주세요',
    );
    await expect(page).toHaveURL(/\/plan/);
  });
});
