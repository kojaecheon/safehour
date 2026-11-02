// 반응형 — 320·360·1280px 에서 가로 스크롤이 없다 (AX-322 · spec 12.3 시나리오 9, 7장 반응형)
//
// 320px 는 WCAG 1.4.10(reflow) 기준 폭이다(1280px 를 400% 확대한 것과 같다).
// 현재 위치 요청 0건은 모든 테스트에 걸린 감시(e2e/fixtures.js)가 확인한다 — 여기서도 마지막에 다시 본다.

import { test, expect } from './fixtures.js';
import { evidenceShot, expectNoHorizontalScroll, kstDate, startTrip, stopsOf } from './helpers.js';

const WIDTHS = [320, 360, 1280];

test.describe('시나리오 9 — 가로 스크롤 없음과 위치 요청 0건', () => {
  test('모든 화면이 320·360·1280px 에서 가로 스크롤 없이 들어온다', async ({ page, guard }) => {
    const { tripPlan } = await startTrip(page, { hasCompanion: true }, { confirmToday: false });
    const date = kstDate(1);
    const stop = Object.values(tripPlan.days).flatMap((day) => stopsOf(day))[0];
    const paths = [
      '/',
      '/login',
      '/onboarding?edit=1',
      '/conditions',
      '/link',
      '/guide',
      '/today',
      '/trip',
      `/trip/${date}`,
      stop ? `/place/${stop.candidateId}` : '/trip',
      '/cards',
      '/emergency',
      '/more',
      '/settings',
      '/privacy',
      '/guardian',
      '/g',
      '/design-board',
    ];

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 780 });
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main').first()).toBeVisible();
        await expectNoHorizontalScroll(page, `${path} @${width}px`);
      }
      if (width === 320) await evidenceShot(page, '23-design-board-320');
    }

    expect(guard.geolocation, '현재 위치를 요청한 화면이 있다').toEqual([]);
  });

  test('시트를 연 상태에서도 가로 스크롤이 없다', async ({ page }) => {
    const date = kstDate(1);
    await startTrip(page, {}, { path: `/trip/${date}` });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 780 });
      await page.reload();
      await page.getByRole('button', { name: '이 날짜 다시 만들기' }).click();
      await expect(page.getByRole('dialog', { name: '일정을 다시 만들까요?' })).toBeVisible();
      await expectNoHorizontalScroll(page, `다시 만들기 시트 @${width}px`);
      await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    }
  });
});
