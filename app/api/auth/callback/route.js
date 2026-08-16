// GET /api/auth/callback?code&state — 인가 코드 수신 (AX-219)
//
// state 를 쿠키와 대조해 CSRF 를 막고, 코드를 식별자로 바꿔 세션 쿠키를 발급한다.
// 실패 사유는 코드로만 알린다 — 공급자 응답 본문을 화면·로그에 흘리지 않는다.

import { PROVIDERS, callbackUrl, safeReturnTo } from '@/src/auth/config.js';
import { exchangeCodeForIdentity } from '@/src/auth/oauth.js';
import {
  OAUTH_COOKIE,
  clearCookieHeader,
  readOAuthToken,
  sessionSecret,
  stateMatches,
} from '@/src/auth/session.js';
import {
  readCookie,
  redirectWithError,
  sessionCookie,
  secureCookies,
} from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const secret = sessionSecret();
  const clearOAuth = clearCookieHeader(OAUTH_COOKIE, { secure: secureCookies(request) });

  const fail = (code) => {
    const headers = new Headers({ Location: redirectWithError(code) });
    headers.append('Set-Cookie', clearOAuth);
    return new Response(null, { status: 303, headers });
  };

  if (!secret) return fail('not_configured');

  // 사용자가 공급자 화면에서 취소한 경우
  if (url.searchParams.get('error')) return fail('cancelled');

  const pending = readOAuthToken(readCookie(request, OAUTH_COOKIE), secret, Date.now());
  if (!pending) return fail('expired');

  if (!stateMatches(url.searchParams.get('state') ?? '', pending.state)) {
    return fail('state_mismatch');
  }

  const code = url.searchParams.get('code');
  if (!code) return fail('missing_code');

  const spec = PROVIDERS[pending.provider];
  const redirectUri = callbackUrl();
  if (!spec || !redirectUri) return fail('not_configured');

  let identity;
  try {
    identity = await exchangeCodeForIdentity({
      provider: pending.provider,
      code,
      codeVerifier: pending.codeVerifier,
      clientId: process.env[spec.clientIdEnv],
      clientSecret: process.env[spec.clientSecretEnv],
      redirectUri,
    });
  } catch {
    // 예외 메시지에 코드·클라이언트 정보가 섞일 수 있어 그대로 흘리지 않는다
    return fail('exchange_failed');
  }

  const headers = new Headers({ Location: safeReturnTo(pending.returnTo, '/') });
  headers.append('Set-Cookie', sessionCookie(identity, request));
  headers.append('Set-Cookie', clearOAuth);
  return new Response(null, { status: 303, headers });
}
