// 세션 — 서명 쿠키. 서버 DB 를 두지 않는다 (AX-219 · ADR-0004)
//
// 로그인을 넣으면서도 "서버는 사용자 데이터를 저장하지 않는다" 를 지키는 방법이다.
// 사용자 신원은 **서명된 쿠키 안에** 있고 서버에는 세션 테이블이 없다.
//
// 담는 것: 공급자 + 안정 식별자 + 발급/만료 시각. 그게 전부다.
// 담지 않는 것: 이메일, 이름, 프로필 사진, 액세스 토큰, 리프레시 토큰.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'safehour.session';
export const OAUTH_COOKIE = 'safehour.oauth';

/** 12시간. 회복기 사용자가 하루에 여러 번 열어도 재로그인이 잦지 않을 길이 */
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;
/** 인가 왕복은 몇 분이면 끝난다 — 길게 열어둘 이유가 없다 */
export const OAUTH_MAX_AGE_SEC = 10 * 60;

const SESSION_VERSION = 1;

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sessionSecret(env = process.env) {
  const secret = env.SAFEHOUR_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

/**
 * 세션 토큰을 만든다.
 * @param {{provider: string, subject: string}} identity
 * @param {number} nowMs 호출부가 시각을 주입한다 — 테스트가 시간에 흔들리지 않게 한다
 */
export function createSessionToken(identity, secret, nowMs, maxAgeSec = SESSION_MAX_AGE_SEC) {
  if (!secret) throw new Error('세션 서명 키가 없습니다.');
  if (!identity?.provider || !identity?.subject) {
    throw new Error('세션에는 공급자와 식별자가 모두 필요합니다.');
  }
  const iat = Math.floor(nowMs / 1000);
  const payload = {
    v: SESSION_VERSION,
    p: identity.provider,
    s: identity.subject,
    iat,
    exp: iat + maxAgeSec,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * 세션 토큰을 검증한다. 위조·만료·버전 불일치는 모두 null 이다 —
 * 왜 실패했는지 호출부에 알려주지 않는다 (탐색 단서를 주지 않기 위해).
 */
export function readSessionToken(token, secret, nowMs) {
  if (!secret || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!signature) return null;
  if (!safeEqual(signature, sign(payloadB64, secret))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (payload?.v !== SESSION_VERSION) return null;
  if (typeof payload.p !== 'string' || typeof payload.s !== 'string') return null;
  if (typeof payload.exp !== 'number') return null;
  if (Math.floor(nowMs / 1000) >= payload.exp) return null;

  return { provider: payload.p, subject: payload.s, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** CSRF 방어용 state 와 PKCE code_verifier */
export function randomToken(bytes = 32) {
  return base64url(randomBytes(bytes));
}

/** 인가 왕복 동안 들고 있어야 하는 값 — 쿠키에 서명해서 넣는다 */
export function createOAuthToken(data, secret, nowMs) {
  if (!secret) throw new Error('세션 서명 키가 없습니다.');
  const payload = {
    v: SESSION_VERSION,
    st: data.state,
    cv: data.codeVerifier,
    pr: data.provider,
    rt: data.returnTo,
    exp: Math.floor(nowMs / 1000) + OAUTH_MAX_AGE_SEC,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function readOAuthToken(token, secret, nowMs) {
  if (!secret || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), sign(payloadB64, secret))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload?.v !== SESSION_VERSION) return null;
  if (typeof payload.st !== 'string' || typeof payload.pr !== 'string') return null;
  if (typeof payload.exp !== 'number' || Math.floor(nowMs / 1000) >= payload.exp) return null;

  return {
    state: payload.st,
    codeVerifier: payload.cv,
    provider: payload.pr,
    returnTo: payload.rt,
  };
}

/** 콜백에서 받은 state 가 쿠키의 state 와 같은가 (타이밍 안전 비교) */
export function stateMatches(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  if (received.length === 0 || expected.length === 0) return false;
  return safeEqual(received, expected);
}

/** Set-Cookie 값 조립. 운영에서는 Secure 를 붙인다 */
export function cookieHeader(name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader(name, { secure } = {}) {
  return cookieHeader(name, '', { maxAge: 0, secure });
}
