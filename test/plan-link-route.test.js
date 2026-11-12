// POST /api/plan/link: 로그인 가드·오류 형태·v2 지침 반환 (AX-311 · docs/contracts.md '`POST /api/plan/link`', docs/business-rules.md '병원 연동'. 테스트 이름의 spec 번호와 규칙 번호(12)는 옛 설계서 번호다)
//
// 라우트 핸들러를 직접 부른다(상대 경로 import). 외부 호출은 없다 — 데모 어댑터만 쓴다.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../app/api/plan/link/route.js';
import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';
import { PLAN_LINK_ERROR } from '../src/recovery/gateway.js';
import { PLAN_STATUS, planStatus, validatePlan } from '../src/recovery/plan.js';

const SECRET = 's'.repeat(48);
let savedSecret;

before(() => {
  savedSecret = process.env.SAFEHOUR_SESSION_SECRET;
  process.env.SAFEHOUR_SESSION_SECRET = SECRET;
});

after(() => {
  if (savedSecret === undefined) delete process.env.SAFEHOUR_SESSION_SECRET;
  else process.env.SAFEHOUR_SESSION_SECRET = savedSecret;
});

function sessionCookie() {
  const token = createSessionToken({ provider: 'demo', subject: 'subject-1' }, SECRET, Date.now());
  return `${SESSION_COOKIE}=${token}`;
}

function linkRequest(body, { loggedIn = true, raw = false } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (loggedIn) headers.set('cookie', sessionCookie());
  return new Request('http://localhost/api/plan/link', {
    method: 'POST',
    headers,
    body: raw ? body : JSON.stringify(body),
  });
}

describe('로그인 가드 (spec 6장)', () => {
  test('세션이 없으면 401 { ok:false, errorCode: SAFEHOUR_AUTH_REQUIRED, message }', async () => {
    const res = await POST(linkRequest({ code: 'DEMO-A' }, { loggedIn: false }));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(typeof body.message, 'string');
    assert.ok(body.message.length > 0);
    assert.equal('code' in body, false, "기존 code: 'UNAUTHENTICATED' 형태를 쓰지 않는다");
    assert.equal('plan' in body, false);
  });
});

describe('v2 지침 반환 (spec 4.20)', () => {
  test('데모 코드를 연결하면 v2 지침과 데모 표시를 돌려준다', async () => {
    const res = await POST(linkRequest({ code: 'demo-a' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.plan.schemaVersion, 2);
    assert.equal(body.plan.planId, 'DEMO-PLAN-A');
    assert.equal(body.plan.demo, true);
    assert.equal(validatePlan(body.plan).valid, true);
    assert.equal('constraints' in body.plan, false);
    assert.equal('anchor' in body.plan, false);
  });

  test('세 데모 코드가 모두 연결된다 — 만료된 DEMO-C 도 기간을 담아 돌려준다 (규칙 12)', async () => {
    for (const code of ['DEMO-A', 'DEMO-B', 'DEMO-C']) {
      const res = await POST(linkRequest({ code }));
      assert.equal(res.status, 200, code);
      const { plan } = await res.json();
      assert.ok(plan.periods.length > 0, code);
    }
    const { plan } = await (await POST(linkRequest({ code: 'DEMO-C' }))).json();
    assert.equal(planStatus(plan), PLAN_STATUS.EXPIRED);
  });
});

describe('오류는 모두 errorCode 키를 쓴다', () => {
  const cases = [
    { name: '모르는 코드', request: () => linkRequest({ code: 'NOPE-SECRET-999' }), status: 404, errorCode: PLAN_LINK_ERROR.UNKNOWN_CODE },
    { name: '코드 없음', request: () => linkRequest({}), status: 400, errorCode: PLAN_LINK_ERROR.CODE_REQUIRED },
    { name: '빈 코드', request: () => linkRequest({ code: '   ' }), status: 400, errorCode: PLAN_LINK_ERROR.CODE_REQUIRED },
    { name: '읽을 수 없는 본문', request: () => linkRequest('{', { raw: true }), status: 400, errorCode: PLAN_LINK_ERROR.BAD_REQUEST },
    { name: '객체가 아닌 본문', request: () => linkRequest(null), status: 400, errorCode: PLAN_LINK_ERROR.BAD_REQUEST },
  ];

  for (const c of cases) {
    test(`${c.name} → ${c.status} ${c.errorCode}`, async () => {
      const res = await POST(c.request());
      assert.equal(res.status, c.status);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.errorCode, c.errorCode);
      assert.equal(typeof body.message, 'string');
      assert.equal('code' in body, false);
      assert.equal('plan' in body, false);
    });
  }

  test('오류 코드는 SAFEHOUR_ 접두사를 쓴다', () => {
    for (const code of Object.values(PLAN_LINK_ERROR)) assert.match(code, /^SAFEHOUR_[A-Z_]+$/);
  });

  test('오류 응답에 입력한 코드를 되돌려 싣지 않는다', async () => {
    const res = await POST(linkRequest({ code: 'NOPE-SECRET-999' }));
    assert.equal(JSON.stringify(await res.json()).includes('NOPE-SECRET-999'), false);
  });
});
