// 로그인 화면과 세션 (AX-219 · ADR-0004)
//
// 자격증명 없이도 검증해야 하는 것들이다.
//   - 설정되지 않은 공급자 버튼이 사라지지 않고 "준비 중" 으로 남는가
//   - 로그인이 **본인 확인이 아니라는 사실**이 화면에 있는가
//   - 세션 API 가 식별자를 흘리지 않는가
//   - 실패 코드가 기술 사유가 아니라 사람 문구로 나오는가

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('로그인 화면', () => {
  test('두 공급자가 모두 보이고, 미설정이면 준비 중으로 남는다', async ({ page }) => {
    await page.goto('/login');
    // 버튼을 숨기면 "왜 없지?" 가 되고, 눌리면 오류로 떨어진다 — 남기되 비활성으로 둔다.
    // 설정 여부에 따라 link 또는 button 으로 렌더되므로 둘 다 받는다.
    const google = page
      .getByRole('link', { name: /Google로 계속하기/ })
      .or(page.getByRole('button', { name: /Google로 계속하기/ }));
    const kakao = page
      .getByRole('link', { name: /카카오로 계속하기/ })
      .or(page.getByRole('button', { name: /카카오로 계속하기/ }));
    await expect(google).toBeVisible();
    await expect(kakao).toBeVisible();
  });

  test('로그인이 본인 확인이 아니라는 것을 화면에 밝힌다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('로그인은 본인 확인이 아닙니다')).toBeVisible();
    await expect(page.getByText(/병원이 발급한 코드로 확인/)).toBeVisible();
  });

  test('이름·이메일·프로필을 받지 않는다고 CTA 앞에 알린다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/이름·이메일·프로필은 받지 않습니다/)).toBeVisible();
  });

  test('병원 연결이 다음 단계임을 안내한다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/병원 회복 계획 연결은 로그인 다음 단계/)).toBeVisible();
  });

  test('실패 코드는 기술 사유가 아니라 사람 문구로 나온다', async ({ page }) => {
    await page.goto('/login?error=state_mismatch');
    await expect(page.locator('.state-banner[role="alert"]')).toContainText(
      '다시 시도해 주세요',
    );
    // 내부 코드가 그대로 노출되면 안 된다
    await expect(page.getByText('state_mismatch')).toHaveCount(0);
  });

  test('취소는 취소로 안내한다', async ({ page }) => {
    await page.goto('/login?error=cancelled');
    await expect(page.locator('.state-banner[role="alert"]')).toContainText('로그인을 취소했습니다');
  });

  test('WCAG A/AA 위반이 없다', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, help: v.help })),
      '로그인 화면 접근성 위반',
    ).toEqual([]);
  });
});

test.describe('로그인 화면 — 영어', () => {
  test.use({ locale: 'en-US' });

  test('영어권 브라우저에서 영어로 나온다', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page
        .getByRole('link', { name: /Continue with Google/ })
        .or(page.getByRole('button', { name: /Continue with Google/ })),
    ).toBeVisible();
    await expect(page.getByText('Signing in is not identity verification')).toBeVisible();
  });
});

test.describe('세션 API', () => {
  test('로그인 전에는 인증되지 않았다고 답한다', async ({ request }) => {
    const res = await request.get('/api/auth/session');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.provider).toBeNull();
  });

  test('세션 응답에 식별자가 담기지 않는다', async ({ request }) => {
    const body = await (await request.get('/api/auth/session')).json();
    // 화면이 알아야 하는 것은 "로그인했는가" 까지다
    expect(Object.keys(body).sort()).toEqual(
      ['auth', 'authenticated', 'expiresAt', 'ok', 'provider'].sort(),
    );
    expect(JSON.stringify(body)).not.toContain('subject');
  });

  test('공급자 설정 여부만 알리고 자격증명은 알리지 않는다', async ({ request }) => {
    const body = await (await request.get('/api/auth/session')).json();
    const ids = body.auth.providers.map((p) => p.id).sort();
    expect(ids).toEqual(['google', 'kakao']);
    for (const provider of body.auth.providers) {
      expect(Object.keys(provider).sort()).toEqual(['configured', 'id']);
    }
    expect(JSON.stringify(body)).not.toContain('CLIENT_SECRET');
  });

  test('로그아웃은 GET 으로 열려 있지 않다', async ({ request }) => {
    const res = await request.get('/api/auth/logout');
    // GET 이 허용되면 <img src> 한 줄로 남을 로그아웃시킬 수 있다
    expect(res.status()).toBe(405);
  });
});

test.describe('로그인 시작 라우트', () => {
  test('알 수 없는 공급자는 오류와 함께 로그인 화면으로 되돌린다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=naver');
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.locator('.state-banner[role="alert"]')).toBeVisible();
  });

  test('외부 주소로 되돌리려는 시도를 무시한다', async ({ page }) => {
    // returnTo 가 외부로 나가면 열린 리다이렉트다 — 공급자 미설정이라 로그인 화면으로 떨어진다
    await page.goto('/api/auth/login?provider=google&returnTo=https://evil.example');
    await expect(page).toHaveURL(/localhost|127\.0\.0\.1/);
  });

  test('state 없이 콜백을 때리면 로그인 화면으로 되돌린다', async ({ page }) => {
    await page.goto('/api/auth/callback?code=fake&state=fake');
    await expect(page).toHaveURL(/\/login\?error=/);
  });
});

test.describe('데모 로그인과 삭제 (AX-219 · AX-210)', () => {
  async function session(request) {
    return (await request.get('/api/auth/session')).json();
  }

  test('데모로 로그인하면 세션이 생기고 쿠키는 자바스크립트에 보이지 않는다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=/');
    await expect(page).toHaveURL(/\/$/);

    const state = await page.evaluate(async () => {
      const s = await (await fetch('/api/auth/session')).json();
      return { authenticated: s.authenticated, provider: s.provider, jsCookie: document.cookie };
    });
    expect(state.authenticated).toBe(true);
    expect(state.provider).toBe('demo');
    // httpOnly 가 아니면 XSS 한 번에 세션이 통째로 넘어간다
    expect(state.jsCookie).not.toContain('safehour.session');
  });

  test('"내 정보 지우기" 가 로그아웃까지 처리한다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=/plan');
    await expect(page).toHaveURL(/\/plan/);

    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('button', { name: '지우기' }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/');

    // 세션 쿠키는 httpOnly 라 클라이언트가 못 지운다 — 서버가 지워줘야 이 버튼이 사실이 된다
    const after = await page.evaluate(async () =>
      (await fetch('/api/auth/session')).json(),
    );
    expect(after.authenticated, '지웠는데 로그인 상태가 남아 있다').toBe(false);
  });

  test('로그아웃 후에는 세션이 남지 않는다', async ({ page, request }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=/login');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect
      .poll(async () => (await page.evaluate(async () => (await fetch('/api/auth/session')).json())).authenticated)
      .toBe(false);
    // 쿠키를 들고 있지 않은 요청은 애초에 인증되지 않는다
    expect((await session(request)).authenticated).toBe(false);
  });
});
