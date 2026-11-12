// 외부 호출 0건 장치와 API 경계 (AX-322 · 외부 호출 0건: docs/standards.md '테스트', docs/engineering-notes.md '화면 테스트가 외부를 부르지 않게 하는 방법', 로그인 가드: docs/contracts.md '공통', 퇴역 경로: docs/platform/IA_AND_FLOWS.md '퇴역하는 화면')
//
// 이 파일은 **검사 장치 자체가 살아 있는지**를 먼저 확인한다. 차단기가 꺼져 있으면 다른 모든 테스트의
// '외부 호출 0건' 단언이 조용히 참이 되어 버린다.
//   - 서버: e2e/network-guard.cjs 가 NODE_OPTIONS 로 실려 루프백 밖 연결을 막고 기록한다(ready 표식으로 확인).
//   - 브라우저: e2e/fixtures.js 의 감시가 127.0.0.1 밖 요청을 막고 기록한다(일부러 한 번 내보내 확인).

import fs from 'node:fs';
import { test, expect, SERVER_GUARD_DIR, guardContext, isLocalUrl, readServerExternalLog } from './fixtures.js';
import { kstDate, startTrip } from './helpers.js';

test.describe('외부 호출 0건 장치', () => {
  test('서버에 외부 호출 차단기가 실려 있고, 이번 실행에서 외부로 나간 기록이 없다', async () => {
    const ready = fs.readdirSync(SERVER_GUARD_DIR).filter((name) => name.startsWith('ready-'));
    expect(ready.length, 'E2E 서버가 network-guard.cjs 를 싣지 않았다 (NODE_OPTIONS 확인)').toBeGreaterThan(0);
    expect(readServerExternalLog(), '서버가 외부로 연결하려 했다').toBe('');
  });

  test('서버에 시계 이동기가 실려 있다 (쓰지 않는 테스트에는 영향이 없다)', async () => {
    const ready = fs.readdirSync(SERVER_GUARD_DIR).filter((name) => name.startsWith('clock-ready-'));
    expect(ready.length, 'E2E 서버가 clock-shim.cjs 를 싣지 않았다 (NODE_OPTIONS 확인)').toBeGreaterThan(0);
  });

  test('브라우저 감시는 127.0.0.1 밖 요청을 막고 기록한다', async ({ browser }, testInfo) => {
    const { baseURL, viewport, locale, timezoneId } = testInfo.project.use;
    const context = await browser.newContext({ baseURL, viewport, locale, timezoneId });
    const record = await guardContext(context);
    const page = await context.newPage();
    try {
      await page.goto('/privacy');
      const failed = await page.evaluate(async () => {
        try {
          await fetch('https://apis.data.go.kr/e2e-probe', { mode: 'no-cors' });
          return false;
        } catch {
          return true;
        }
      });
      expect(failed, '외부 요청이 막히지 않았다').toBe(true);
      expect(record.blocked).toContain('https://apis.data.go.kr/e2e-probe');
    } finally {
      await context.close();
    }
    expect(isLocalUrl('http://127.0.0.1:3100/today')).toBe(true);
    expect(isLocalUrl('https://tong.visitkorea.or.kr/image.jpg')).toBe(false);
  });
});

test.describe('내부 API 경계', () => {
  test('일정·장소·연동 API 는 로그인 세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED 다', async ({ request }) => {
    for (const path of ['/api/itinerary/plan', '/api/itinerary/alternatives', '/api/itinerary/intro', '/api/address/search', '/api/place', '/api/plan/link']) {
      const res = await request.post(path, { data: {} });
      expect(res.status(), `${path} 상태`).toBe(401);
      const body = await res.json();
      expect(body, `${path} 본문`).toMatchObject({ ok: false, errorCode: 'SAFEHOUR_AUTH_REQUIRED' });
    }
  });

  test('퇴역한 단일 외출 API 는 없다', async ({ request }) => {
    for (const path of ['/api/recommend', '/api/recalculate', '/api/today']) {
      expect((await request.post(path, { data: {} })).status(), `${path}`).toBe(404);
    }
  });

  test('퇴역한 /plan·/result 는 오늘로 보낸다', async ({ page }) => {
    await startTrip(page);
    for (const path of ['/plan', '/result']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/today$/);
    }
  });

  test('판정 응답은 중간 캐시에 남지 않고, 위치 권한은 브라우저 수준에서도 막혀 있다', async ({ request, browser }, testInfo) => {
    const res = await request.get('/api/health');
    expect(res.headers()['cache-control']).toContain('no-store');
    expect(res.headers()['permissions-policy']).toContain('geolocation=()');

    // 일부러 위치를 물어보는 검사이므로 감시가 걸리지 않은 별도 컨텍스트에서 한다
    const { baseURL, viewport, locale, timezoneId } = testInfo.project.use;
    const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, permissions: [] });
    try {
      const probe = await context.newPage();
      await probe.goto('/today');
      const denied = await probe.evaluate(
        () =>
          new Promise((resolve) => {
            if (!navigator.geolocation) return resolve('no-geolocation');
            navigator.geolocation.getCurrentPosition(
              () => resolve('granted'),
              (error) => resolve(`error:${error.code}`),
              { timeout: 2000 },
            );
          }),
      );
      expect(denied, 'Permissions-Policy 가 있어도 브라우저가 현재 위치를 내줬다').not.toBe('granted');
    } finally {
      await context.close();
    }
  });

  test('일정 API 요청에는 PlanStay 허용 목록 밖 필드가 실리지 않는다 (규칙 54)', async ({ page }) => {
    const bodies = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/itinerary/plan') && request.method() === 'POST') bodies.push(JSON.parse(request.postData()));
    });
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(Object.keys(body.stay).sort()).toEqual(
        ['appointments', 'arrival', 'consent', 'departure', 'hasCompanion', 'hospitals', 'interests', 'lodgings', 'pace', 'periods'].sort(),
      );
      for (const lodging of body.stay.lodgings) expect(Object.keys(lodging).sort()).toEqual(['checkIn', 'checkOut', 'id', 'lat', 'lng']);
      for (const hospital of body.stay.hospitals) expect(Object.keys(hospital).sort()).toEqual(['id', 'lat', 'lng']);
      expect(body.stay.consent).toEqual({ sensitive: true });
    }
  });
});

test.describe('현재 위치 요청 0건 (규칙 46)', () => {
  test('모든 화면을 돌아도 위치 요청이 한 번도 없다', async ({ page, guard }) => {
    const { tripPlan } = await startTrip(page);
    const date = kstDate(1);
    const stop = Object.values(tripPlan.days).flatMap((d) => d.outings.flatMap((o) => o.stops))[0];
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
      stop ? `/place/${stop.candidateId}` : '/today',
      '/cards',
      '/emergency',
      '/more',
      '/settings',
      '/privacy',
      '/guardian',
      '/g',
      '/design-board',
    ];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(guard.geolocation, '현재 위치를 요청한 화면이 있다').toEqual([]);
    expect(guard.blocked, '외부로 나간 요청이 있다').toEqual([]);
  });
});
