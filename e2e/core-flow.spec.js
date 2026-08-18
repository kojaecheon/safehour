// AX-004 — 핵심 흐름 E2E (D09-AC018, QA033–QA040)
//
// 검증 대상: 입력 → 판정 결과 → 휴무 이벤트로 대체 → 즉시 복귀 안내가
// 360px 화면에서 끊김 없이 동작하고, 현재 GPS 를 한 번도 요구하지 않는다.

import { test, expect } from '@playwright/test';
import { connectPlan, submitPlan, assertNoHorizontalScroll } from './helpers.js';

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

// D03-NAV004(입력 유지)는 AX-221 로 대상이 사라졌다 — 조건이 사용자 입력이
// 아니라 병원 발행값이므로 뒤로가기로 잃을 입력이 없다. 대신 지켜야 할 것은
// **사용자가 병원 조건을 고칠 수 없다** 는 것이다.
test.describe('병원 조건은 읽기 전용 (AX-221)', () => {
  test('조건을 고치는 입력 수단이 화면에 없다', async ({ page }) => {
    await connectPlan(page);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: '병원이 정한 조건' })).toBeVisible();

    // 예전 수기 입력 필드가 하나라도 남아 있으면 "병원이 정한 조건" 이 거짓이 된다
    for (const id of ['#anchor-label', '#max-walk', '#max-travel', '#issued-at', '#return-by']) {
      await expect(page.locator(id), `${id} 가 아직 편집 가능하다`).toHaveCount(0);
    }
    await expect(page.locator('input[name="outing"]')).toHaveCount(0);
  });

  test('결과에서 돌아와도 병원 조건이 그대로다', async ({ page }) => {
    await watchGeolocation(page);
    await submitPlan(page);

    await page.getByRole('button', { name: '조건 입력으로 돌아가기' }).click();
    await page.waitForURL('**/plan');

    await expect(page.getByText('보행 20분 이내')).toBeVisible();
    await expect(page.getByText('편도 이동 30분 이내')).toBeVisible();
    await assertNoGpsRequest(page);
  });
});

test.describe('안전 게이트 (QA033–QA040)', () => {
  test('병원이 외출을 제한하면 관광을 추천하지 않는다', async ({ page }) => {
    await watchGeolocation(page);
    await submitPlan(page, { outingAllowed: false });

    await expect(page.locator('.state-banner').first()).toContainText('관광을 권하지 않습니다');
    await expect(page.getByText('병원이 외출을 제한했습니다')).toBeVisible();
    await expect(page.locator('.course-card')).toHaveCount(0);
    await assertNoGpsRequest(page);
  });

  test('지침을 연결하지 않으면 판정 자체를 하지 않는다', async ({ page }) => {
    await page.goto('/plan');

    await expect(page.getByText('병원 지침을 먼저 연결하세요')).toBeVisible();
    await expect(page.getByRole('button', { name: '안전 판정으로 추천 받기' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/plan/);
  });
});

/**
 * 하단 고정 복귀 CTA 는 회복기 환자가 "지금 돌아가야 한다" 를 눌러야 하는 버튼이다.
 * 무엇에도 가려서는 안 된다.
 *
 * 실제 있었던 결함: `.sticky-return` 이 `position: fixed` 인데 z-index 가 없었다.
 * 탭 순서 때문에 DOM 상 main 앞쪽에 두는데, 뒤따르는 카드 제목이 골드 규칙선 때문에
 * `position: relative` 라 DOM 순서상 이 바 위에 그려졌다. 카드 제목이 고정 바와
 * 겹치는 스크롤 위치에서 제목이 클릭을 가로채 버튼이 눌리지 않았다. CI 에서만 났다.
 *
 * 스크롤 운에 기대면 이 결함을 놓친다. 그래서 카드 제목을 **하나씩 고정 바 위치로
 * 끌어와** 겹침을 강제로 만든 뒤, 그 지점의 최상위 요소가 버튼인지 확인한다.
 */
test.describe('즉시 복귀 버튼은 가려지지 않는다', () => {
  test('카드 제목이 고정 바와 겹쳐도 버튼이 최상위다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    const button = page.getByRole('button', { name: '즉시 복귀 안내' });
    await expect(button).toBeVisible();

    const headings = page.locator('.card > h2, .card > h3');
    const count = await headings.count();
    expect(count, '겹칠 후보 제목이 없으면 이 검사는 의미가 없다').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      // 제목을 고정 바가 있는 높이로 끌어와 겹침을 만든다
      await headings.nth(i).evaluate((heading) => {
        const bar = document.querySelector('.sticky-return');
        const barTop = bar.getBoundingClientRect().top;
        const headingTop = heading.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, headingTop - barTop));
      });

      const covering = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + 6, r.top + 6],
          [r.right - 6, r.bottom - 6],
        ]
          .map(([x, y]) => document.elementFromPoint(x, y))
          .filter((hit) => hit !== el && !el.contains(hit))
          .map((hit) => `${hit?.tagName}#${hit?.id || ''}.${hit?.className || ''}`);
      });

      const label = await headings.nth(i).innerText();
      expect(covering, `"${label}" 과 겹칠 때 버튼이 가려졌다`).toEqual([]);
    }

    // 가려짐 검사와 실제 클릭 가능성은 다른 실패 모드다 — 둘 다 본다
    await button.click();
    await expect(page.locator('.sheet').getByText('지금 복귀하세요')).toBeVisible();
  });
});
