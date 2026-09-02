// 인증 계약 (AX-219 · ADR-0004)
//
// 로그인은 안전 기능이다. 아래가 깨지면 남의 계획을 볼 수 있게 된다.
//   - 서명 위조·만료·버전 불일치 세션은 통과하지 못한다
//   - state 불일치는 인가를 거부한다 (CSRF)
//   - 되돌아갈 경로는 같은 출처의 절대 경로만 허용한다 (열린 리다이렉트)
//   - 토큰 교환 결과에서 **식별자 외에는 아무것도 새어 나가지 않는다**

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_IDS,
  callbackUrl,
  demoLoginEnabled,
  isProviderId,
  providerConfigured,
  safeReturnTo,
} from '../src/auth/config.js';
import {
  OAUTH_MAX_AGE_SEC,
  SESSION_MAX_AGE_SEC,
  clearCookieHeader,
  cookieHeader,
  createOAuthToken,
  createSessionToken,
  randomToken,
  readOAuthToken,
  readSessionToken,
  sessionSecret,
  stateMatches,
} from '../src/auth/session.js';
import { authorizeUrl, codeChallenge, exchangeCodeForIdentity, readIdTokenSubject } from '../src/auth/oauth.js';
import { secureCookies } from '../src/auth/cookies.js';

const SECRET = 'x'.repeat(48);
const NOW = 1_760_000_000_000; // 고정 시각 — 테스트가 실제 시계에 흔들리지 않게

describe('세션 토큰', () => {
  test('서명한 토큰을 다시 읽을 수 있다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    const session = readSessionToken(token, SECRET, NOW);
    assert.equal(session.provider, 'google');
    assert.equal(session.subject, 'sub-1');
  });

  test('페이로드를 건드리면 거부한다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, p: 'google', s: 'victim', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    assert.equal(readSessionToken(`${forged}.${signature}`, SECRET, NOW), null);
    assert.ok(payload);
  });

  test('다른 키로 서명한 토큰을 거부한다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, 'y'.repeat(48), NOW);
    assert.equal(readSessionToken(token, SECRET, NOW), null);
  });

  test('만료된 토큰을 거부한다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    const afterExpiry = NOW + (SESSION_MAX_AGE_SEC + 1) * 1000;
    assert.equal(readSessionToken(token, SECRET, afterExpiry), null);
  });

  test('만료 직전은 통과하고 만료 시점은 거부한다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    assert.ok(readSessionToken(token, SECRET, NOW + (SESSION_MAX_AGE_SEC - 1) * 1000));
    assert.equal(readSessionToken(token, SECRET, NOW + SESSION_MAX_AGE_SEC * 1000), null);
  });

  test('형식이 깨진 값은 예외 없이 null 이다', () => {
    for (const bad of ['', '.', 'abc', 'a.b.c', null, undefined, 42, 'nosignature.']) {
      assert.equal(readSessionToken(bad, SECRET, NOW), null);
    }
  });

  test('키가 없으면 어떤 토큰도 통과하지 못한다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    assert.equal(readSessionToken(token, null, NOW), null);
  });

  test('공급자나 식별자가 없으면 발급하지 않는다', () => {
    assert.throws(() => createSessionToken({ provider: 'google' }, SECRET, NOW));
    assert.throws(() => createSessionToken({ subject: 'x' }, SECRET, NOW));
  });

  test('세션에 이메일·이름·토큰이 담기지 않는다', () => {
    const token = createSessionToken({ provider: 'google', subject: 'sub-1' }, SECRET, NOW);
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    assert.deepEqual(Object.keys(decoded).sort(), ['exp', 'iat', 'p', 's', 'v']);
  });

  test('짧은 서명 키는 키 없음으로 취급한다', () => {
    assert.equal(sessionSecret({ SAFEHOUR_SESSION_SECRET: 'short' }), null);
    assert.equal(sessionSecret({ SAFEHOUR_SESSION_SECRET: SECRET }), SECRET);
    assert.equal(sessionSecret({}), null);
  });
});

describe('인가 왕복 쿠키', () => {
  test('state·verifier·복귀 경로를 왕복시킨다', () => {
    const token = createOAuthToken(
      { state: 'st-1', codeVerifier: 'cv-1', provider: 'kakao', returnTo: '/plan' },
      SECRET,
      NOW,
    );
    const pending = readOAuthToken(token, SECRET, NOW);
    assert.equal(pending.state, 'st-1');
    assert.equal(pending.codeVerifier, 'cv-1');
    assert.equal(pending.provider, 'kakao');
    assert.equal(pending.returnTo, '/plan');
  });

  test('인가 쿠키도 만료된다', () => {
    const token = createOAuthToken(
      { state: 'st-1', codeVerifier: 'cv-1', provider: 'kakao', returnTo: '/' },
      SECRET,
      NOW,
    );
    assert.equal(readOAuthToken(token, SECRET, NOW + (OAUTH_MAX_AGE_SEC + 1) * 1000), null);
  });

  test('state 비교는 정확히 같을 때만 참이다', () => {
    assert.equal(stateMatches('abc', 'abc'), true);
    assert.equal(stateMatches('abc', 'abd'), false);
    assert.equal(stateMatches('abc', 'abcd'), false);
    assert.equal(stateMatches('', ''), false);
    assert.equal(stateMatches(null, 'abc'), false);
    assert.equal(stateMatches('abc', undefined), false);
  });

  test('무작위 토큰은 매번 다르다', () => {
    const values = new Set(Array.from({ length: 50 }, () => randomToken()));
    assert.equal(values.size, 50);
  });
});

describe('열린 리다이렉트 방어', () => {
  test('같은 출처의 절대 경로만 허용한다', () => {
    assert.equal(safeReturnTo('/plan'), '/plan');
    assert.equal(safeReturnTo('/result?x=1'), '/result?x=1');
  });

  test('외부 주소와 프로토콜 상대 URL 을 막는다', () => {
    assert.equal(safeReturnTo('//evil.example'), '/');
    assert.equal(safeReturnTo('https://evil.example'), '/');
    assert.equal(safeReturnTo('http://evil.example'), '/');
    assert.equal(safeReturnTo('/\\evil.example'), '/');
    assert.equal(safeReturnTo('plan'), '/');
    assert.equal(safeReturnTo(null), '/');
    assert.equal(safeReturnTo(undefined, '/login'), '/login');
  });
});

describe('공급자 설정', () => {
  test('구글과 카카오 두 곳을 지원한다', () => {
    assert.deepEqual(PROVIDER_IDS.sort(), ['google', 'kakao']);
    assert.equal(isProviderId('google'), true);
    assert.equal(isProviderId('naver'), false);
    assert.equal(isProviderId(null), false);
  });

  test('자격증명이 둘 다 있어야 설정된 것으로 본다', () => {
    assert.equal(providerConfigured('google', { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), true);
    assert.equal(providerConfigured('google', { GOOGLE_CLIENT_ID: 'a' }), false);
    assert.equal(providerConfigured('google', { GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: 'b' }), false);
    assert.equal(providerConfigured('kakao', {}), false);
  });

  test('데모 로그인은 명시적으로 켜야만 동작한다', () => {
    assert.equal(demoLoginEnabled({}), false);
    assert.equal(demoLoginEnabled({ SAFEHOUR_ALLOW_DEMO_LOGIN: '0' }), false);
    assert.equal(demoLoginEnabled({ SAFEHOUR_ALLOW_DEMO_LOGIN: 'true' }), false);
    assert.equal(demoLoginEnabled({ SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }), true);
  });

  test('콜백 주소는 설정값으로만 만든다 — 요청 헤더를 쓰지 않는다', () => {
    assert.equal(callbackUrl({ SAFEHOUR_BASE_URL: 'https://safehour.vercel.app' }), 'https://safehour.vercel.app/api/auth/callback');
    assert.equal(callbackUrl({ SAFEHOUR_BASE_URL: 'https://safehour.vercel.app/' }), 'https://safehour.vercel.app/api/auth/callback');
    assert.equal(callbackUrl({}), null);
  });
});

describe('인가 URL', () => {
  const base = {
    clientId: 'client-1',
    redirectUri: 'https://safehour.vercel.app/api/auth/callback',
    state: 'st-1',
    verifier: 'verifier-1',
  };

  test('PKCE S256 을 붙인다', () => {
    const url = new URL(authorizeUrl({ ...base, provider: 'google' }));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), codeChallenge('verifier-1'));
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('state'), 'st-1');
  });

  test('구글에는 openid 만 요청한다 — 이메일·프로필을 받지 않는다', () => {
    const url = new URL(authorizeUrl({ ...base, provider: 'google' }));
    assert.equal(url.searchParams.get('scope'), 'openid');
  });

  test('카카오에는 선택 동의 항목을 요청하지 않는다', () => {
    const url = new URL(authorizeUrl({ ...base, provider: 'kakao' }));
    assert.equal(url.searchParams.get('scope'), null);
  });

  test('알 수 없는 공급자는 거부한다', () => {
    assert.throws(() => authorizeUrl({ ...base, provider: 'naver' }));
  });
});

describe('토큰 교환', () => {
  test('구글은 id_token 의 sub 만 가져온다', async () => {
    const idToken = [
      Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: 'google-123', email: 'leak@example.com' })).toString('base64url'),
      'signature',
    ].join('.');

    const identity = await exchangeCodeForIdentity({
      provider: 'google',
      code: 'c',
      codeVerifier: 'v',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://x/api/auth/callback',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ id_token: idToken, access_token: 'at', refresh_token: 'rt' }),
      }),
    });

    assert.deepEqual(identity, { provider: 'google', subject: 'google-123' });
    // 이메일·토큰이 결과에 섞여 나오지 않는다
    assert.equal(JSON.stringify(identity).includes('leak@example.com'), false);
    assert.equal(JSON.stringify(identity).includes('rt'), false);
  });

  test('카카오는 회원번호만 가져온다', async () => {
    const identity = await exchangeCodeForIdentity({
      provider: 'kakao',
      code: 'c',
      codeVerifier: 'v',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://x/api/auth/callback',
      fetchImpl: async (url) =>
        String(url).includes('kapi.kakao.com')
          ? {
              ok: true,
              json: async () => ({ id: 987654, kakao_account: { email: 'leak@example.com' } }),
            }
          : { ok: true, json: async () => ({ access_token: 'at' }) },
    });

    assert.deepEqual(identity, { provider: 'kakao', subject: '987654' });
    assert.equal(JSON.stringify(identity).includes('leak@example.com'), false);
  });

  test('토큰 엔드포인트 실패는 예외로 올린다 — 응답 본문을 흘리지 않는다', async () => {
    await assert.rejects(
      exchangeCodeForIdentity({
        provider: 'google',
        code: 'c',
        codeVerifier: 'v',
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'https://x',
        fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'bad' }) }),
      }),
      (err) => err.message.includes('401') && !err.message.includes('bad'),
    );
  });

  test('식별자가 없으면 로그인시키지 않는다', async () => {
    await assert.rejects(
      exchangeCodeForIdentity({
        provider: 'google',
        code: 'c',
        codeVerifier: 'v',
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'https://x',
        fetchImpl: async () => ({ ok: true, json: async () => ({ id_token: 'not-a-jwt' }) }),
      }),
    );
  });

  test('망가진 id_token 은 null 이다', () => {
    assert.equal(readIdTokenSubject('a.b'), null);
    assert.equal(readIdTokenSubject('a.!!!.c'), null);
    assert.equal(readIdTokenSubject(null), null);
    assert.equal(
      readIdTokenSubject(
        ['x', Buffer.from(JSON.stringify({ email: 'a' })).toString('base64url'), 'y'].join('.'),
      ),
      null,
    );
  });
});

describe('쿠키 헤더', () => {
  test('HttpOnly·SameSite 를 항상 붙인다', () => {
    const header = cookieHeader('safehour.session', 'v', { maxAge: 100, secure: false });
    assert.ok(header.includes('HttpOnly'));
    assert.ok(header.includes('SameSite=Lax'));
    assert.ok(header.includes('Path=/'));
    assert.equal(header.includes('Secure'), false);
  });

  test('운영에서는 Secure 를 붙인다', () => {
    assert.ok(cookieHeader('n', 'v', { maxAge: 1, secure: true }).includes('Secure'));
  });

  test('삭제 쿠키는 Max-Age 0 이다', () => {
    assert.ok(clearCookieHeader('safehour.session', { secure: true }).includes('Max-Age=0'));
  });
});

describe('Secure 플래그 판단 (회귀)', () => {
  // NODE_ENV 로 정하면 프로덕션 빌드를 http 로 띄웠을 때 브라우저가 쿠키를 조용히 버린다.
  // 판단 기준은 빌드 모드가 아니라 실제 연결 프로토콜이어야 한다.
  const req = (url, headers = {}) => ({
    url,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  });

  test('https 요청에는 Secure 를 붙인다', () => {
    assert.equal(secureCookies(req('https://safehour.vercel.app/api/auth/login'), {}), true);
  });

  test('http 요청에는 붙이지 않는다 — 로컬 프로덕션 빌드·E2E', () => {
    assert.equal(secureCookies(req('http://127.0.0.1:3100/api/auth/login'), {}), false);
    assert.equal(
      secureCookies(req('http://localhost:3000/api/auth/login'), { NODE_ENV: 'production' }),
      false,
    );
  });

  test('엣지에서 TLS 를 끊는 환경은 x-forwarded-proto 를 따른다', () => {
    assert.equal(
      secureCookies(req('http://internal/api/auth/login', { 'x-forwarded-proto': 'https' }), {}),
      true,
    );
    assert.equal(
      secureCookies(req('http://internal/api/auth/login', { 'x-forwarded-proto': 'https,http' }), {}),
      true,
    );
    assert.equal(
      secureCookies(req('https://internal/api/auth/login', { 'x-forwarded-proto': 'http' }), {}),
      false,
    );
  });

  test('요청이 없으면 배포 주소로 판단한다', () => {
    assert.equal(secureCookies(null, { SAFEHOUR_BASE_URL: 'https://safehour.vercel.app' }), true);
    assert.equal(secureCookies(null, { SAFEHOUR_BASE_URL: 'http://localhost:3000' }), false);
    assert.equal(secureCookies(null, {}), false);
  });
});

// 로그인이 실제로 가능한 조건 — 배포 검증이 판정하는 기준
//
// 배포본에 로그인 수단이 하나도 없어 지침 연결부터 막혔는데, 배포 검증이 그것을
// 보지 않아 13건이 전부 통과한 적이 있다. 지금은 `npm run verify:deploy` 가
// 아래와 같은 복합 조건으로 판정한다. 그 기준을 여기서 고정한다.
//
// 주의: `authReadiness().ready` 만으로는 부족하다. 그것은 "세션 키와 콜백 주소가
// 있다" 는 뜻이고 로그인 **수단**이 있는지는 보지 않는다. 아래 첫 테스트가
// 그 간극을 드러낸다.
describe('로그인 가능 판정 (배포 검증 기준)', () => {
  const SECRET = 'x'.repeat(32);
  const BASE = { SAFEHOUR_SESSION_SECRET: SECRET, SAFEHOUR_BASE_URL: 'https://example.test' };

  /** 배포 검증과 같은 기준 — 기반이 갖춰졌고 로그인 수단이 하나 이상 있어야 한다 */
  function loginUsable(env) {
    const infraReady = Boolean(sessionSecret(env)) && Boolean(callbackUrl(env));
    const methods = PROVIDER_IDS.filter((id) => providerConfigured(id, env));
    if (demoLoginEnabled(env)) methods.push('demo');
    return { infraReady, methods, usable: infraReady && methods.length > 0 };
  }

  test('기반만 갖춰지고 로그인 수단이 없으면 아무도 로그인할 수 없다', () => {
    const { infraReady, usable } = loginUsable({ ...BASE });

    assert.equal(infraReady, true, '세션 키와 콜백이 있으므로 기반은 준비된 상태다');
    assert.equal(usable, false, '기반만으로 로그인 가능하다고 판정하면 배포 사고를 놓친다');
  });

  test('공급자가 있으면 로그인할 수 있다', () => {
    const { usable, methods } = loginUsable({
      ...BASE,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });

    assert.equal(usable, true);
    assert.deepEqual(methods, ['google']);
  });

  test('데모 경로만 열어도 로그인할 수 있다 — 심사 대비 보험이다', () => {
    const { usable, methods } = loginUsable({ ...BASE, SAFEHOUR_ALLOW_DEMO_LOGIN: '1' });

    assert.equal(usable, true, '데모 경로가 열렸는데 로그인 불가로 판정했다');
    assert.deepEqual(methods, ['demo']);
  });

  test('공급자가 있어도 세션 키가 없으면 로그인을 끝낼 수 없다', () => {
    const { usable } = loginUsable({
      SAFEHOUR_BASE_URL: 'https://example.test',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });

    assert.equal(usable, false, '세션 서명 키 없이 로그인이 가능하다고 판정했다');
  });

  test('공급자가 있어도 콜백 주소가 없으면 인가 요청을 보낼 수 없다', () => {
    const { usable } = loginUsable({
      SAFEHOUR_SESSION_SECRET: SECRET,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });

    assert.equal(usable, false, '콜백 주소 없이 로그인이 가능하다고 판정했다');
  });

  test('아무것도 없으면 당연히 불가하고, 무엇이 없는지 셋 다 드러난다', () => {
    const env = {};
    const { infraReady, methods } = loginUsable(env);

    assert.equal(infraReady, false);
    assert.deepEqual(methods, []);
    assert.equal(Boolean(sessionSecret(env)), false);
    assert.equal(Boolean(callbackUrl(env)), false);
  });
});
