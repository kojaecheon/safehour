// 인증 라우트 공통 헬퍼 (AX-219)
//
// 라우트 4개가 같은 판단을 반복하지 않도록 한곳에 모은다.

import { PROVIDERS, callbackUrl, demoLoginEnabled, providerConfigured } from '@/src/auth/config.js';
import {
  SESSION_COOKIE,
  clearCookieHeader,
  cookieHeader,
  createSessionToken,
  readSessionToken,
  sessionSecret,
  SESSION_MAX_AGE_SEC,
} from '@/src/auth/session.js';
import { secureCookies } from '@/src/auth/cookies.js';

export { secureCookies };

/** 요청 쿠키 헤더에서 이름 하나를 꺼낸다 */
export function readCookie(request, name) {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** 현재 로그인 상태. 없으면 null */
export function currentSession(request, nowMs = Date.now(), env = process.env) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  return readSessionToken(readCookie(request, SESSION_COOKIE), secret, nowMs);
}

export function sessionCookie(identity, request, nowMs = Date.now(), env = process.env) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error('세션 서명 키가 없습니다.');
  const token = createSessionToken(identity, secret, nowMs);
  return cookieHeader(SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE_SEC,
    secure: secureCookies(request, env),
  });
}

export function clearSessionCookie(request, env = process.env) {
  return clearCookieHeader(SESSION_COOKIE, { secure: secureCookies(request, env) });
}

/**
 * 로그인이 성립할 수 있는 상태인가.
 * 서명 키·콜백 주소가 없으면 어떤 공급자도 쓸 수 없다.
 */
export function authReadiness(env = process.env) {
  const secretReady = Boolean(sessionSecret(env));
  const callback = callbackUrl(env);
  return {
    ready: secretReady && Boolean(callback),
    sessionSecretConfigured: secretReady,
    callbackConfigured: Boolean(callback),
    demoLogin: demoLoginEnabled(env),
    providers: Object.keys(PROVIDERS).map((id) => ({
      id,
      configured: secretReady && Boolean(callback) && providerConfigured(id, env),
    })),
  };
}

/**
 * 오류를 사용자 화면으로 되돌린다 — 실패 사유는 코드로만 전달한다.
 *
 * **상대 경로**를 돌려준다. 절대 URL 을 만들면 요청 호스트(`127.0.0.1`)와 다른
 * 호스트(`localhost`)로 튈 수 있고, 그러면 방금 심은 쿠키가 따라가지 않는다.
 */
export function redirectWithError(code) {
  return `/login?error=${encodeURIComponent(code)}`;
}
