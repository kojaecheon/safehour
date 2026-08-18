// AX-102 — 접근성·반응형 자동 검증 (D09-AC019, QA033–QA036)
//
// 자동 검사는 접근성의 바닥이지 천장이 아니다. axe 가 잡을 수 있는 위반은
// 전체의 일부이므로, 여기 통과했다고 스크린리더·실기기 검증을 건너뛰지 않는다.
// (docs/AX_BACKLOG.md AX-102 의 사람 검증 항목 참고)

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { connectPlan, submitPlan, assertNoHorizontalScroll } from './helpers.js';

/** WCAG 2.1 A/AA 규칙만 본다 — 실험적·모범사례 규칙은 게이트로 쓰지 않는다 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page, context) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(violations, `${context} 접근성 위반:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

test.describe('axe 자동 검사 (AC019)', () => {
  test('시작 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await page.goto('/');
    await scan(page, '시작 화면');
  });

  test('외출 계획 확인 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await connectPlan(page);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: '병원이 정한 조건' })).toBeVisible();
    await scan(page, '외출 계획 확인 화면');
  });

  test('지침 미연결 상태에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.getByText('병원 지침을 먼저 연결하세요')).toBeVisible();
    await scan(page, '지침 미연결 상태');
  });

  test('판정 결과 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();
    await scan(page, '판정 결과 화면');
  });

  test('변화 재계산 시트에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await submitPlan(page);
    await page.getByRole('button', { name: /1순위 장소 휴무/ }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await scan(page, '변화 재계산 시트');
  });

  test('즉시 복귀 시트에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await submitPlan(page);
    await page.getByRole('button', { name: '즉시 복귀 안내' }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
    await scan(page, '즉시 복귀 시트');
  });

  test('미추천 결과 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await submitPlan(page, { outingAllowed: false });
    await expect(page.locator('.state-banner').first()).toContainText('관광을 권하지 않습니다');
    await scan(page, '미추천 결과 화면');
  });

  test('장소 상세 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await submitPlan(page);
    await page.getByRole('link', { name: /추천 근거와 원문 보기/ }).first().click();
    await page.waitForURL(/\/place\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await scan(page, '장소 상세 화면');
  });
});

test.describe('키보드 전용 조작 (QA034)', () => {
  test('마우스 없이 외출 판정을 제출할 수 있다', async ({ page }) => {
    await connectPlan(page);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: '지금 상황' })).toBeVisible();

    // 체크박스는 Space 로 조작한다
    const companion = page.locator('#role input[type="checkbox"]').first();
    await companion.focus();
    await page.keyboard.press('Space');
    await expect(companion).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(companion).toBeChecked();

    // 제출 버튼까지 Tab 으로 도달해 Enter 로 제출
    let onSubmit = false;
    for (let i = 0; i < 40 && !onSubmit; i += 1) {
      await page.keyboard.press('Tab');
      onSubmit = await page.evaluate(() =>
        document.activeElement?.textContent?.includes('안전 판정으로 추천 받기'),
      );
    }
    expect(onSubmit, 'Tab 으로 제출 버튼에 도달하지 못했다').toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForURL('**/result');
  });

  test('결과 화면의 코스 탭을 방향키로 전환할 수 있다', async ({ page }) => {
    await submitPlan(page);

    await page.locator('#tab-patient').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-companion')).toBeFocused();
    await expect(page.locator('#tab-companion')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-patient')).toHaveAttribute('aria-selected', 'true');
  });

  test('모달 시트는 Escape 로 닫히고 포커스가 복원된다', async ({ page }) => {
    await submitPlan(page);

    const returnButton = page.getByRole('button', { name: '즉시 복귀 안내' });
    await returnButton.click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(returnButton).toBeFocused();
  });

  test('뒤로가기는 시트만 닫고 페이지를 떠나지 않는다 (ADR-0001)', async ({ page }) => {
    await submitPlan(page);

    await page.getByRole('button', { name: '즉시 복귀 안내' }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();

    // 안드로이드 뒤로가기에 해당한다. 여기서 페이지를 떠나면 안전 지시를 잃는다.
    await page.goBack();

    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page).toHaveURL(/\/result/);
    await expect(page.getByText('복귀 마감')).toBeVisible();
  });

  test('확인 버튼으로 닫으면 히스토리에 잉여 항목이 남지 않는다', async ({ page }) => {
    await submitPlan(page);

    await page.getByRole('button', { name: '즉시 복귀 안내' }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
    await page.locator('.sheet').getByRole('button', { name: '확인' }).click();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

    // 시트가 항목을 남겼다면 이 뒤로가기가 아무 일도 하지 않는다.
    // 정상이라면 결과 화면을 떠나 조건 입력으로 돌아간다.
    await page.goBack();
    await expect(page).toHaveURL(/\/plan/);
  });

  test('겹친 시트는 뒤로가기로 하나씩 닫힌다', async ({ page }) => {
    await submitPlan(page);

    // 환자 호출 → 델타 시트 + 즉시 복귀 시트가 함께 뜬다
    await page.getByRole('button', { name: /환자 호출/ }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(2);

    await page.goBack();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(1);

    await page.goBack();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page).toHaveURL(/\/result/);
  });

  test('모달이 열린 동안 포커스가 시트 밖으로 나가지 않는다', async ({ page }) => {
    await submitPlan(page);
    await page.getByRole('button', { name: '즉시 복귀 안내' }).click();
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();

    // 시트 안 요소 수보다 많이 Tab 을 눌러도 포커스는 시트 안에 머문다
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('.sheet'),
      );
      expect(inside, `${i + 1}번째 Tab 에서 포커스가 시트를 벗어났다`).toBe(true);
    }
  });
});

test.describe('반응형·확대 (AC018, WCAG 1.4.10 / 1.4.4)', () => {
  // 320px 는 WCAG 1.4.10 reflow 기준 폭이다 (1280px 를 400% 확대한 것과 같다)
  for (const width of [320, 360, 430, 768, 1280]) {
    test(`${width}px 에서 결과 화면에 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await submitPlan(page);
      await expect(page.locator('.course-card').first()).toBeVisible();
      await assertNoHorizontalScroll(page, `${width}px 결과 화면`);
    });
  }

  test('텍스트를 200% 확대해도 가로 스크롤이 생기지 않는다', async ({ page }) => {
    await submitPlan(page);
    // 루트 글꼴을 2배로 — 텍스트만 확대하는 WCAG 1.4.4 시나리오
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.locator('.course-card').first()).toBeVisible();
    await assertNoHorizontalScroll(page, '텍스트 200% 확대');
  });

  test('터치 대상이 44px 이상이다', async ({ page }) => {
    await submitPlan(page);

    const targets = page.locator('button:visible, a:visible');
    const count = await targets.count();
    const tooSmall = [];
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      if (!box) continue;
      if (box.height < 44) {
        tooSmall.push(`${(await targets.nth(i).innerText()).slice(0, 20)} (${Math.round(box.height)}px)`);
      }
    }
    expect(tooSmall, `44px 미만 터치 대상: ${tooSmall.join(', ')}`).toEqual([]);
  });
});
