// 디자인 시안 보드 (AX-322 · spec 12.3 시나리오 11, 7장)
//
// - 토큰 견본·부품의 상태별 견본·주요 화면 축소 시안이 모두 그려진다.
// - **고정 데모 데이터만 쓴다** — 로그인한 사용자의 체류·일정을 읽지 않고, 일정 API 도 부르지 않는다.
// - 내비에 노출하지 않는다.

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, LODGING_NAME, evidenceShot, expectNoHorizontalScroll, startTrip } from './helpers.js';

test.describe('시나리오 11 — /design-board', () => {
  test('토큰·부품·화면 시안이 그려지고 사용자 데이터를 읽지 않는다', async ({ page }) => {
    // 사용자 데이터가 있는 상태에서 열어도 시안 보드는 그것을 읽지 않는다
    await startTrip(page);
    const apiCalls = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) apiCalls.push(path);
    });

    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '디자인 시안 보드', level: 1 })).toBeVisible();
    await expect(page.getByText('고정 데모 데이터만 씁니다.', { exact: false })).toBeVisible();

    for (const heading of ['색 토큰과 대비', '글자', '간격·모서리·그림자', '부품과 상태별 견본', '화면 시안']) {
      await expect(page.getByRole('heading', { name: heading, level: 2 }).first()).toBeVisible();
    }
    // 부품 견본: 배지 5종·상태 배너 4상태
    for (const badge of ['추정', '기본값 적용', '운영 확인 필요', '병원 연동 데모', '보기 전용']) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
    }
    for (const state of ['TOGETHER', 'SPLIT_NEARBY', 'STANDBY', 'NO_TOURISM']) {
      await expect(page.locator(`.state-banner.state-${state}`).first()).toBeVisible();
    }
    // 주요 화면 축소 시안 8종
    for (const screen of ['오늘', '전체 일정', '조건', '장소 상세', '한국어 안내 카드', '긴급 연락', '보호자 안내']) {
      await expect(page.getByRole('heading', { name: screen, level: 1 }).first()).toBeVisible();
    }
    await expectNoHorizontalScroll(page, '/design-board');
    await evidenceShot(page, '22-design-board');

    // 사용자 데이터를 읽지 않는다
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(HOSPITAL_NAME);
    expect(body).not.toContain(LODGING_NAME);
    expect(apiCalls.filter((path) => path.startsWith('/api/itinerary'))).toEqual([]);
  });

  test('내비에는 나오지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    for (const path of ['/more', '/today', '/settings', '/trip']) {
      await page.goto(path);
      await expect(page.locator('a[href="/design-board"]')).toHaveCount(0);
    }
  });
});
