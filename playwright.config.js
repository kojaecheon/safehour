import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 는 외부 API 없이 돈다 — scripts/seed-e2e-cache.mjs 가 TourAPI 캐시를 미리 심고,
 * 일정 엔진·정규화·API 라우트는 실제 코드가 실행된다 (globalSetup 참고).
 *
 * 외부 호출 0건은 두 곳에서 강제한다 (spec 12.3, AX-322).
 *   - 서버: e2e/network-guard.cjs 를 NODE_OPTIONS 로 먼저 불러 루프백 밖 연결을 거부하고 기록한다.
 *   - 브라우저: e2e/fixtures.js 가 127.0.0.1 밖으로 가는 요청을 막고 기록한다.
 *   두 기록 중 하나라도 생기면 그 테스트가 실패한다.
 *
 * 기준 뷰포트는 360px 다. spec 7장·12.3 이 "360px 기준, 320–1280px 가로 스크롤 없음" 을 요구한다.
 */
const PORT = process.env.E2E_PORT ?? '3100';
const DATA_ROOT = path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data');
const GUARD_DIR = path.join(DATA_ROOT, 'guard');
const GUARD_FILE = path.resolve('e2e/network-guard.cjs');
const CLOCK_SHIM_FILE = path.resolve('e2e/clock-shim.cjs');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 캐시·서버를 공유하므로 순차 실행한다
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.js',
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 360, height: 780 },
    // 위치정보 권한을 주지 않는다 — 현재 GPS 를 요구하면 즉시 실패해야 한다 (spec 9.1)
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
    command: `npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    port: Number(PORT),
    // 다른 작업의 서버를 재사용하면 외부 호출 차단기가 걸리지 않는다 — 늘 새로 띄운다
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SAFEHOUR_DATA_ROOT: DATA_ROOT,
      SAFEHOUR_E2E_GUARD_DIR: GUARD_DIR,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${GUARD_FILE} --require ${CLOCK_SHIM_FILE}`.trim(),
      // Next.js 사용 통계 전송도 외부 호출이다
      NEXT_TELEMETRY_DISABLED: '1',
      // 캐시가 적중하므로 실제로 쓰이지 않지만, 키 검사를 통과해야 캐시까지 도달한다
      TOUR_API_KEY: 'e2e-dummy-key',
      // 기상은 판정 보강 정보다. E2E 에서 외부로 나가지 않게 끈다(빈칸이면 관광 키로 대체되므로 공백 한 칸).
      KMA_API_KEY: ' ',
      // 로그인 검증용 — 실제 공급자 자격증명은 두지 않는다 (AX-219).
      SAFEHOUR_SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0123456789',
      SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
    },
  },
});
