// 서버 라우트 로그인 가드와 새 오류 코드 (AX-302 · spec 6장)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ERROR_CODE,
  ERROR_HTTP_STATUS,
  authRequiredResponse,
  errorResponse,
  requireSession,
  withSession,
} from '../lib/server/route-guard.js';
import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';

const SECRET = 's'.repeat(48);
const ENV = { SAFEHOUR_SESSION_SECRET: SECRET };
const NOW = 1_790_000_000_000;

function requestWith(cookie) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new Request('http://localhost/api/itinerary/plan', { method: 'POST', headers, body: '{}' });
}

function validCookie(nowMs = NOW) {
  const token = createSessionToken({ provider: 'demo', subject: 'subject-1' }, SECRET, nowMs);
  return `other=1; ${SESSION_COOKIE}=${token}`;
}

describe('새 오류 코드 3개', () => {
  test('코드와 HTTP 상태가 한곳에 정의돼 있다', () => {
    assert.deepEqual(ERROR_CODE, {
      AUTH_REQUIRED: 'SAFEHOUR_AUTH_REQUIRED',
      STAY_INVALID: 'SAFEHOUR_STAY_INVALID',
      ADDRESS_UNAVAILABLE: 'SAFEHOUR_ADDRESS_UNAVAILABLE',
    });
    assert.equal(ERROR_HTTP_STATUS.SAFEHOUR_AUTH_REQUIRED, 401);
    assert.equal(ERROR_HTTP_STATUS.SAFEHOUR_STAY_INVALID, 400);
    assert.equal(ERROR_HTTP_STATUS.SAFEHOUR_ADDRESS_UNAVAILABLE, 503);
    assert.ok(Object.isFrozen(ERROR_CODE));
  });

  test('오류 응답은 { ok:false, errorCode, message } 형태이고 상태는 코드에서 정한다', async () => {
    const res = errorResponse(ERROR_CODE.STAY_INVALID, '체류 입력이 올바르지 않습니다.', { fields: ['departure.date'] });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      ok: false,
      errorCode: 'SAFEHOUR_STAY_INVALID',
      message: '체류 입력이 올바르지 않습니다.',
      fields: ['departure.date'],
    });
    const unavailable = errorResponse(ERROR_CODE.ADDRESS_UNAVAILABLE, '주소 검색을 쓸 수 없습니다.');
    assert.equal(unavailable.status, 503);
  });

  test('덧붙이는 값이 ok·errorCode·message 를 덮어쓰지 못한다', async () => {
    const res = errorResponse(ERROR_CODE.STAY_INVALID, '메시지', { ok: true, errorCode: 'X', message: 'Y' });
    assert.deepEqual(await res.json(), { ok: false, errorCode: 'SAFEHOUR_STAY_INVALID', message: '메시지' });
  });
});

describe('로그인 가드', () => {
  test('세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED', async () => {
    const result = requireSession(requestWith(null), { nowMs: NOW, env: ENV });
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
    const body = await result.response.json();
    assert.equal(body.ok, false);
    assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(typeof body.message, 'string');
    assert.ok(body.message.length > 0);
    assert.equal('code' in body, false, '기존 UNAUTHENTICATED 형태를 쓰지 않는다');
  });

  test('서명이 틀리거나 만료된 세션은 통과하지 못한다', () => {
    const forged = `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'x' }, 'z'.repeat(48), NOW)}`;
    assert.equal(requireSession(requestWith(forged), { nowMs: NOW, env: ENV }).ok, false);
    const expiredAt = NOW + 13 * 60 * 60 * 1000;
    assert.equal(requireSession(requestWith(validCookie()), { nowMs: expiredAt, env: ENV }).ok, false);
  });

  test('서명 키가 설정되지 않았으면 모든 요청을 막는다', () => {
    assert.equal(requireSession(requestWith(validCookie()), { nowMs: NOW, env: {} }).ok, false);
  });

  test('유효한 세션은 통과하고 세션을 돌려준다', () => {
    const result = requireSession(requestWith(validCookie()), { nowMs: NOW, env: ENV });
    assert.equal(result.ok, true);
    assert.equal(result.session.provider, 'demo');
    assert.equal(result.session.subject, 'subject-1');
  });

  test('authRequiredResponse 는 가드와 같은 응답을 만든다', async () => {
    const res = authRequiredResponse();
    assert.equal(res.status, 401);
    assert.equal((await res.json()).errorCode, 'SAFEHOUR_AUTH_REQUIRED');
  });

  test('withSession 은 세션이 있을 때만 처리기를 부른다', async () => {
    let calls = 0;
    const handler = withSession(
      async (request, { session }) => {
        calls += 1;
        return Response.json({ ok: true, provider: session.provider });
      },
      { now: () => NOW, env: ENV },
    );
    const denied = await handler(requestWith(null));
    assert.equal(denied.status, 401);
    assert.equal(calls, 0);

    const allowed = await handler(requestWith(validCookie()));
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true, provider: 'demo' });
    assert.equal(calls, 1);
  });
});
