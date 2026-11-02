// GET /api/auth/session 라우트 — 불투명 계정 키 (AX-312 · spec 6장 · 4.19)
//
// 순수 함수(sessionView) 테스트만으로는 **실제 라우트가 무엇을 내보내는지** 고정되지 않는다.
// 라우트 파일은 Next 별칭(`@/`)을 쓰므로, 이 테스트 프로세스에서만 별칭을 저장소 루트로
// 풀어 주는 해석 훅을 걸고 라우트를 그대로 불러온다(node --test 는 파일마다 별도 프로세스다).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  createSessionToken,
  deriveAccountKey,
} from '../src/auth/session.js';

const ROOT = new URL('../', import.meta.url).href;
const SECRET = 'r'.repeat(48);
const RAW_SUBJECT = 'raw-provider-subject-4242';

function installAliasHook() {
  if (typeof nodeModule.registerHooks === 'function') {
    nodeModule.registerHooks({
      resolve(specifier, context, next) {
        return next(specifier.startsWith('@/') ? ROOT + specifier.slice(2) : specifier, context);
      },
    });
    return;
  }
  // Node 20 — 비동기 훅
  const source = `export async function resolve(s, c, n) {
    return n(s.startsWith('@/') ? ${JSON.stringify(ROOT)} + s.slice(2) : s, c);
  }`;
  nodeModule.register(`data:text/javascript,${encodeURIComponent(source)}`);
}

function requestWith(cookie) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new Request('http://localhost/api/auth/session', { headers });
}

let GET;

before(async () => {
  process.env.SAFEHOUR_SESSION_SECRET = SECRET;
  installAliasHook();
  ({ GET } = await import(`${ROOT}app/api/auth/session/route.js`));
});

describe('GET /api/auth/session — 계정 키', () => {
  test('로그인 상태면 불투명 계정 키를 돌려주고 원래 식별자는 싣지 않는다', async () => {
    const identity = { provider: 'google', subject: RAW_SUBJECT };
    const token = createSessionToken(identity, SECRET, Date.now());
    const res = await GET(requestWith(`${SESSION_COOKIE}=${token}`));
    const text = await res.text();
    const body = JSON.parse(text);

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.authenticated, true);
    assert.equal(body.provider, 'google');
    assert.equal(body.accountKey, deriveAccountKey(identity, SECRET));
    // 기존 필드 유지
    assert.ok(body.expiresAt);
    assert.ok(body.auth);
    // 원래 식별자는 응답 어디에도 없다
    assert.equal(text.includes(RAW_SUBJECT), false, '응답 본문에 원래 식별자가 실렸다');
    assert.equal(text.includes(Buffer.from(RAW_SUBJECT).toString('base64url')), false);
    assert.equal('subject' in body, false);
    assert.equal('sub' in body, false);
  });

  test('계정 키가 담긴 응답은 캐시에 남지 않는다', async () => {
    const token = createSessionToken({ provider: 'kakao', subject: '777' }, SECRET, Date.now());
    const res = await GET(requestWith(`${SESSION_COOKIE}=${token}`));
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  });

  test('다시 로그인해도 같은 계정은 같은 키다', async () => {
    const identity = { provider: 'kakao', subject: '31337' };
    const first = await (await GET(requestWith(`${SESSION_COOKIE}=${createSessionToken(identity, SECRET, Date.now() - 3_600_000)}`))).json();
    const second = await (await GET(requestWith(`${SESSION_COOKIE}=${createSessionToken(identity, SECRET, Date.now())}`))).json();
    assert.equal(first.accountKey, second.accountKey);
  });

  test('로그인 전이면 계정 키가 없다', async () => {
    const body = await (await GET(requestWith(null))).json();
    assert.equal(body.authenticated, false);
    assert.equal(body.accountKey, null);
    assert.equal(body.provider, null);
  });

  test('세션 12시간이 지나면 로그인으로 보지 않고 계정 키도 주지 않는다 (기존 규칙 유지)', async () => {
    const issued = Date.now() - (SESSION_MAX_AGE_SEC + 60) * 1000;
    const token = createSessionToken({ provider: 'google', subject: RAW_SUBJECT }, SECRET, issued);
    const body = await (await GET(requestWith(`${SESSION_COOKIE}=${token}`))).json();
    assert.equal(body.authenticated, false);
    assert.equal(body.accountKey, null);
  });

  test('위조한 쿠키로는 남의 계정 키를 받을 수 없다', async () => {
    const token = createSessionToken({ provider: 'google', subject: 'attacker' }, SECRET, Date.now());
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, p: 'google', s: 'victim', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    const body = await (await GET(requestWith(`${SESSION_COOKIE}=${forged}.${signature}`))).json();
    assert.equal(body.authenticated, false);
    assert.equal(body.accountKey, null);
  });
});
