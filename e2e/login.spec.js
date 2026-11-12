// 로그인 화면과 세션 (AX-322 · docs/security.md '인증'·'기기 저장소와 계정 이름공간', docs/contracts.md '`GET /api/auth/session`')
//
// 자격증명 없이도 검증해야 하는 것들이다.
//   - 설정되지 않은 공급자 버튼은 보이지 않는가('준비 중'으로 남기지 않는다, 운영자 결정 2026-11-08)
//   - 로그인이 **본인 확인이 아니라는 사실**이 화면에 있는가
//   - 세션 API 가 원래 계정 식별자를 흘리지 않고 **불투명 계정 키**만 주는가 (docs/security.md '기기 저장소와 계정 이름공간', docs/contracts.md '`GET /api/auth/session`')
//   - 실패 코드가 기술 사유가 아니라 사람 문구로 나오는가

import { test, expect } from './fixtures.js';
import { loginDemo } from './helpers.js';

test.describe('로그인 화면', () => {
  test('미설정 공급자는 숨기고, 데모만 되면 데모가 유일한 길이다', async ({ page }) => {
    await page.goto('/login');
    // 이 실행 환경에는 공급자 자격증명이 없다. 세션 확인이 끝나 데모 버튼이 그려질 때까지 기다린다
    await expect(page.getByRole('link', { name: '데모 계정으로 둘러보기' })).toBeVisible();
    for (const name of [/Google/, /카카오/]) {
      await expect(page.getByRole('link', { name })).toHaveCount(0);
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(page.getByText('준비 중')).toHaveCount(0);
    // 세션 API 는 공급자 준비 여부를 그대로 알려 준다(화면이 이 값으로 숨긴다)
    const body = await page.evaluate(async () => (await fetch('/api/auth/session', { cache: 'no-store' })).json());
    expect(body.auth.providers.every((p) => p.configured === false)).toBe(true);
    expect(body.auth.demoLogin).toBe(true);
  });

  test('로그인이 본인 확인이 아니라는 것과, 무엇을 받지 않는지를 밝힌다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('로그인은 본인 확인이 아닙니다', { exact: false })).toBeVisible();
    await expect(page.getByText('이름·이메일·프로필은 받지 않습니다', { exact: false })).toBeVisible();
    await expect(page.getByText('병원 연동 코드는 그 뒤 조건 화면에서 연결할 수 있습니다', { exact: false })).toBeVisible();
  });

  test('실패 코드는 기술 사유가 아니라 사람 문구로 나온다', async ({ page }) => {
    await page.goto('/login?error=state_mismatch');
    await expect(page.locator('.state-banner[role="alert"]')).toContainText('다시 시도해 주세요');
    await expect(page.getByText('state_mismatch')).toHaveCount(0);
    await page.goto('/login?error=cancelled');
    await expect(page.locator('.state-banner[role="alert"]')).toContainText('로그인을 취소했습니다');
  });

  test('알 수 없는 공급자와 외부 주소 되돌리기는 막는다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=naver');
    await expect(page).toHaveURL(/\/login\?error=/);
    await page.goto('/api/auth/login?provider=demo&returnTo=https://evil.example/');
    await expect(page).toHaveURL(/127\.0\.0\.1/);
    await page.goto('/api/auth/callback?code=fake&state=fake');
    await expect(page).toHaveURL(/\/login\?error=/);
  });
});

test.describe('세션 API', () => {
  test('로그인 전에는 인증되지 않았다고 답하고 계정 키도 주지 않는다', async ({ request }) => {
    const body = await (await request.get('/api/auth/session')).json();
    expect(body.authenticated).toBe(false);
    expect(body.provider).toBeNull();
    expect(body.accountKey ?? null).toBeNull();
  });

  test('로그인 뒤에도 원래 식별자 대신 불투명 계정 키만 준다', async ({ page }) => {
    await loginDemo(page, '/privacy');
    const body = await page.evaluate(async () => (await fetch('/api/auth/session', { cache: 'no-store' })).json());
    expect(body.authenticated).toBe(true);
    expect(body.provider).toBe('demo');
    expect(Object.keys(body).sort()).toEqual(['accountKey', 'auth', 'authenticated', 'expiresAt', 'ok', 'provider'].sort());
    expect(body.accountKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toContain('demo-user');
    expect(JSON.stringify(body)).not.toContain('subject');
    for (const provider of body.auth.providers) expect(Object.keys(provider).sort()).toEqual(['configured', 'id']);
    expect(JSON.stringify(body)).not.toContain('CLIENT_SECRET');

    // 세션 쿠키는 httpOnly 라 자바스크립트에 보이지 않는다
    expect(await page.evaluate(() => document.cookie)).not.toContain('safehour.session');
  });

  test('로그아웃은 GET 으로 열려 있지 않다', async ({ request }) => {
    // GET 이 허용되면 <img src> 한 줄로 남을 로그아웃시킬 수 있다
    expect((await request.get('/api/auth/logout')).status()).toBe(405);
  });

  test('로그인한 상태로 로그인 화면에 오면 이어가기와 로그아웃을 보여 준다', async ({ page }) => {
    await loginDemo(page, '/privacy');
    await page.goto('/login');
    await expect(page.getByText('로그인되어 있습니다')).toBeVisible();
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect
      .poll(async () => (await page.evaluate(async () => (await fetch('/api/auth/session')).json())).authenticated)
      .toBe(false);
  });
});
