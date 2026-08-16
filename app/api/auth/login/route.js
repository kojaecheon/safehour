// GET /api/auth/login?provider=google|kakao&returnTo=/path — 인가 요청 시작 (AX-219)
//
// state·PKCE verifier 를 만들어 서명 쿠키에 넣고 공급자로 보낸다.
// 데모 로그인은 명시적으로 켰을 때만 동작한다 (심사 시연용).

import { PROVIDERS, demoLoginEnabled, isProviderId, callbackUrl, providerConfigured, safeReturnTo } from '@/src/auth/config.js';
import { authorizeUrl } from '@/src/auth/oauth.js';
import {
  OAUTH_COOKIE,
  OAUTH_MAX_AGE_SEC,
  cookieHeader,
  createOAuthToken,
  randomToken,
  sessionSecret,
} from '@/src/auth/session.js';
import { redirectWithError, sessionCookie, secureCookies } from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 같은 출처를 유지하기 위해 상대 경로로 되돌린다 */
function redirect(location) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function GET(request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'), '/');

  const secret = sessionSecret();
  if (!secret) {
    return redirect(redirectWithError('not_configured'));
  }

  // ── 데모 로그인 — 자격증명 없이 전체 흐름을 보여주기 위한 경로 ──
  if (provider === 'demo') {
    if (!demoLoginEnabled()) {
      return redirect(redirectWithError('demo_disabled'));
    }
    const headers = new Headers({ Location: returnTo });
    headers.append('Set-Cookie', sessionCookie({ provider: 'demo', subject: 'demo-user' }, request));
    return new Response(null, { status: 303, headers });
  }

  if (!isProviderId(provider)) {
    return redirect(redirectWithError('unknown_provider'));
  }
  if (!providerConfigured(provider)) {
    return redirect(redirectWithError('provider_not_configured'));
  }

  const redirectUri = callbackUrl();
  if (!redirectUri) {
    return redirect(redirectWithError('not_configured'));
  }

  const state = randomToken();
  const verifier = randomToken(48);
  const target = authorizeUrl({
    provider,
    clientId: process.env[PROVIDERS[provider].clientIdEnv],
    redirectUri,
    state,
    verifier,
  });

  const headers = new Headers({ Location: target });
  headers.append(
    'Set-Cookie',
    cookieHeader(
      OAUTH_COOKIE,
      createOAuthToken({ state, codeVerifier: verifier, provider, returnTo }, secret, Date.now()),
      { maxAge: OAUTH_MAX_AGE_SEC, secure: secureCookies(request) },
    ),
  );
  return new Response(null, { status: 303, headers });
}
