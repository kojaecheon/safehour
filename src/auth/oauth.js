// OAuth 2.0 인가 코드 흐름 (AX-219 · ADR-0004)
//
//   - PKCE(S256) 를 두 공급자 모두에 적용한다
//   - state 로 CSRF 를 막고, 쿠키의 state 와 타이밍 안전 비교한다
//   - 토큰 교환은 서버에서만 하고, 식별자를 꺼낸 뒤 토큰을 버린다
//   - fetch 를 주입받아 테스트가 네트워크로 나가지 않게 한다

import { createHash } from 'node:crypto';
import { PROVIDERS } from './config.js';

/** PKCE code_challenge = BASE64URL(SHA256(verifier)) */
export function codeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** 인가 요청 URL 을 만든다 */
export function authorizeUrl({ provider, clientId, redirectUri, state, verifier }) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`알 수 없는 로그인 공급자: ${provider}`);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
  });
  if (spec.scope) params.set('scope', spec.scope);

  return `${spec.authorizeUrl}?${params.toString()}`;
}

/**
 * JWT 페이로드만 읽는다.
 * 서명 검증을 생략하는 이유: 인가 코드 흐름에서 id_token 을 **토큰 엔드포인트로부터 TLS 로
 * 직접** 받았고 클라이언트 인증까지 거쳤다 (OIDC Core 3.1.3.7). 이 토큰을 다른 곳에서
 * 받아오게 되면 그때는 반드시 서명을 검증해야 한다.
 */
export function readIdTokenSubject(idToken) {
  if (typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * 인가 코드를 토큰으로 바꾸고 **안정 식별자만** 돌려준다.
 * 액세스 토큰·리프레시 토큰·이메일은 이 함수 밖으로 나가지 않는다.
 */
export async function exchangeCodeForIdentity({
  provider,
  code,
  codeVerifier,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = fetch,
}) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`알 수 없는 로그인 공급자: ${provider}`);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetchImpl(spec.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    // 공급자 응답 본문에는 코드·클라이언트 정보가 섞일 수 있어 로그에 남기지 않는다
    throw new Error(`토큰 교환 실패 (HTTP ${tokenRes.status})`);
  }

  const token = await tokenRes.json();

  if (spec.identity === 'id_token') {
    const subject = readIdTokenSubject(token.id_token);
    if (!subject) throw new Error('식별자를 확인하지 못했습니다.');
    return { provider, subject };
  }

  // 카카오 — 회원번호만 읽는다
  const userRes = await fetchImpl(spec.userInfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  });
  if (!userRes.ok) throw new Error(`사용자 조회 실패 (HTTP ${userRes.status})`);

  const user = await userRes.json();
  const id = user?.id;
  if (id === undefined || id === null || id === '') {
    throw new Error('식별자를 확인하지 못했습니다.');
  }
  return { provider, subject: String(id) };
}
