import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 는 외부 API 없이 돈다 — scripts/seed-e2e-cache.mjs 가 TourAPI 캐시를 미리 심고,
 * 판정 엔진·정규화·API 라우트는 실제 코드가 실행된다 (globalSetup 참고).
 *
 * 기준 뷰포트는 360px 다. D09-AC018 이 "360px 에서 핵심 흐름이 가로 스크롤 없이
 * 동작한다" 를 요구하므로 데스크톱이 아니라 이 폭이 기본이어야 한다.
 */
const PORT = process.env.E2E_PORT ?? '3100';
const DATA_ROOT = process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 캐시·카운터를 공유하므로 순차 실행한다
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 360, height: 780 },
    // 위치정보 권한을 주지 않는다 — 현재 GPS 를 요구하면 즉시 실패해야 한다 (D07-BAN002)
    permissions: [],
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },

  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } },
    },
  ],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    port: Number(PORT),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SAFEHOUR_DATA_ROOT: DATA_ROOT,
      // 캐시가 적중하므로 실제로 쓰이지 않지만, 키 검사를 통과해야 캐시까지 도달한다
      TOUR_API_KEY: process.env.TOUR_API_KEY || 'e2e-dummy-key',
      // 기상은 판정에 반영되지 않는 보강 정보다. E2E 에서 외부로 나가지 않게 비운다.
      KMA_API_KEY: ' ',
      // 로그인 검증용 — 실제 공급자 자격증명은 두지 않는다 (AX-219).
      // 데모 경로만 열어 "로그인 → 내 정보 지우기 → 로그아웃" 순환을 검증한다.
      SAFEHOUR_SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0123456789',
      SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
    },
  },
});
