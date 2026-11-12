// 로그인 만료·오프라인에서 긴급·카드·오늘 보기 (AX-322 · 시나리오 7(옛 작업 설계서의 화면 테스트 번호), docs/platform/IA_AND_FLOWS.md '보기 전용 상태', docs/security.md '권한')
//
// - 로그인 만료(서버 세션 없음): 이 기기에 마지막으로 로그인한 계정의 사본을 **보기 전용**으로 보여 준다.
//   '보기 전용 — 로그인이 필요합니다'를 표시하고 확인·편집·연동·공유를 막는다.
// - 오프라인: 서비스 워커가 앱 셸과 보기 전용 화면(오늘·일정·긴급·카드·고지)을 캐시에서 연다.
//   배너 제목은 '인터넷 연결 없음'이고 로그인을 말하지 않는다(사용성 점검 C2). 로그인 링크도 없다.
//   API 응답은 서비스 워커 캐시에 넣지 않는다.
// - 긴급 연락 버튼은 모든 상태에서 보인다.

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, evidenceShot, kstDate, readRecord, startTrip } from './helpers.js';

const READ_ONLY = '보기 전용 — 로그인이 필요합니다';
const OFFLINE_TITLE = '인터넷 연결 없음, 저장된 일정만 보여 줘요';

async function expectEmergencyButton(page) {
  await expect(page.getByRole('link', { name: '긴급 연락' }).first()).toBeVisible();
}

/** 서비스 워커가 이 페이지를 제어하고, 보기 전용 화면을 캐시했을 때까지 기다린다 */
async function waitForServiceWorker(page, paths) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // 제어권을 가진 상태로 한 번씩 열어 네트워크 우선 캐시에 담는다
  for (const path of paths) {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForLoadState('networkidle');
  }
  await expect
    .poll(
      () =>
        page.evaluate(async (paths) => {
          const names = await caches.keys();
          const found = new Set();
          for (const name of names) {
            const cache = await caches.open(name);
            for (const req of await cache.keys()) found.add(new URL(req.url).pathname);
          }
          return paths.every((p) => found.has(p)) && ![...found].some((p) => p.startsWith('/api/'));
        }, paths),
      { message: '보기 전용 화면이 서비스 워커 캐시에 담겨야 하고 API 응답은 없어야 한다' },
    )
    .toBe(true);
}

test.describe('시나리오 7 — 로그인 만료·오프라인', () => {
  test('로그인이 만료되어도 오늘 일정·복귀 마감·카드·긴급 연락을 보기 전용으로 연다 (규칙 40)', async ({ page, context }) => {
    const today = kstDate(0);
    await startTrip(page, {}, { confirmToday: false });
    // 서버 세션이 사라진다 — 쿠키가 만료된 것과 같다
    await context.clearCookies();
    expect((await page.evaluate(async () => (await fetch('/api/auth/session')).json())).authenticated).toBe(false);

    await page.goto('/today');
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    await expect(page.getByText('이 기기에 저장된 사본만 보여 줍니다.', { exact: false })).toBeVisible();
    await expect(page.locator('.state-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: '그대로예요' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '바뀌었어요' })).toBeDisabled();
    await expect(page.getByText('보기 전용이라 지금은 확인할 수 없어요.', { exact: false })).toBeVisible();
    await expectEmergencyButton(page);
    await evidenceShot(page, '17-read-only-today');

    await page.goto(`/trip/${kstDate(1)}`);
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    await expect(page.getByRole('button', { name: /^바꾸기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeDisabled();
    await expect(page.getByText('보기 전용이라 바꿀 수 없어요.', { exact: false })).toBeVisible();

    await page.goto('/cards');
    await expect(page.getByRole('heading', { name: '한국어 안내 카드' })).toBeVisible();
    await expect(page.getByText('이 숙소로 가 주세요')).toBeVisible();
    await expect(page.getByText(HOSPITAL_NAME)).toBeVisible();

    await page.goto('/emergency');
    await expect(page.getByRole('link', { name: '119 전화 걸기' })).toHaveAttribute('href', 'tel:119');
    await expect(page.getByRole('link', { name: /1330 전화 걸기/ }).first()).toBeVisible();

    // 공유·연동도 막힌다
    await page.goto('/guardian');
    await expect(page.getByText('보기 전용 상태에서는 링크를 만들 수 없어요.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: '링크 만들기' })).toBeDisabled();

    // 저장된 일정은 그대로다
    expect((await readRecord(page, 'tripPlan')).days[today]).toBeTruthy();
  });

  test('오프라인에서도 서비스 워커가 오늘·일정·긴급·카드·고지를 연다. API 응답은 캐시하지 않는다', async ({ page, context }) => {
    const today = kstDate(0);
    await startTrip(page, {}, { confirmToday: true });
    const paths = ['/today', `/trip/${today}`, '/emergency', '/cards', '/privacy'];
    await waitForServiceWorker(page, paths);

    await context.setOffline(true);
    try {
      await page.goto('/today');
      const banner = page.locator('.ui-readonly');
      await expect(banner.locator('.ui-readonly-title')).toHaveText(OFFLINE_TITLE);
      await expect(banner.locator('.ui-readonly-title')).not.toContainText('로그인');
      await expect(banner).toContainText('다시 연결되면 로그인 상태를 확인하고, 로그인돼 있으면 편집이 다시 켜지고 일정을 새로 확인해요.');
      await expect(banner.getByRole('link', { name: '로그인하기' })).toHaveCount(0);
      await expect(page.getByText(READ_ONLY)).toHaveCount(0);
      await expect(page.locator('.state-banner')).toBeVisible();
      await expectEmergencyButton(page);
      await evidenceShot(page, '18-offline-today');

      await page.goto(`/trip/${today}`);
      await expect(page.locator('.state-banner')).toBeVisible();
      await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeDisabled();

      await page.goto('/emergency');
      await expect(page.getByRole('link', { name: '119 전화 걸기' })).toBeVisible();

      await page.goto('/cards');
      await expect(page.getByText('이 숙소로 가 주세요')).toBeVisible();

      await page.goto('/privacy');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
