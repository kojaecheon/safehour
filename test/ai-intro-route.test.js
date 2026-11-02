// POST /api/itinerary/intro — 라우트 계약 (AX-309 · spec 4.16, 6장 · 규칙 36)
//
// 계약
//   - 로그인 세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED, 외부 호출 없음
//   - 요청 { lang, stops: [{ title, category, arriveAt }], interests, pace } 밖의 필드는 무시, 외부로 보내지 않음
//   - 응답 200 { ok: true, text, source: "AI" | "TEMPLATE" } — 다른 키 없음(실패 사유를 드러내지 않는다)
//   - 본문·언어·정거장 형식이 틀리면 400 SAFEHOUR_BAD_REQUEST, 외부 호출 없음
//   - 프롬프트·출력·키·URL 을 로그에 남기지 않는다
//
// 실제 Gemini 를 부르지 않는다. 모든 외부 호출은 가짜 fetch 가 받는다.

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';
import { templates as TEMPLATES } from '../src/i18n/messages/aiIntro.js';

const SECRET = 'i'.repeat(48);
const FAKE_KEY = 'fake-gemini-key-route-91ab';
const ENV_NAMES = ['SAFEHOUR_SESSION_SECRET', 'SAFEHOUR_AI_INTRO', 'GEMINI_API_KEY', 'GEMINI_MODEL'];
const savedEnv = {};
const originalFetch = globalThis.fetch;

let POST;
let calls;
let logs;
const originalConsole = {};

before(async () => {
  for (const name of ENV_NAMES) savedEnv[name] = process.env[name];
  ({ POST } = await import('../app/api/itinerary/intro/route.js'));
});

after(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  process.env.SAFEHOUR_SESSION_SECRET = SECRET;
  delete process.env.SAFEHOUR_AI_INTRO;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  calls = [];
  // 실수로 실제 네트워크에 나가지 않도록 기본 fetch 는 기록만 하고 실패시킨다
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    throw new Error('테스트에서 실제 네트워크 호출 금지');
  };
  logs = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    originalConsole[m] = console[m];
    console[m] = (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [m, fn] of Object.entries(originalConsole)) console[m] = fn;
});

function turnOn() {
  process.env.SAFEHOUR_AI_INTRO = '1';
  process.env.GEMINI_API_KEY = FAKE_KEY;
}

function replyWith(text) {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

function sessionCookie() {
  const token = createSessionToken({ provider: 'demo', subject: 'subject-1' }, SECRET, Date.now());
  return `${SESSION_COOKIE}=${token}`;
}

function request(body, { cookie = sessionCookie() } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new Request('http://localhost/api/itinerary/intro', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const BODY = Object.freeze({
  lang: 'ko',
  stops: [
    { title: '경복궁', category: 'CULTURE', arriveAt: '10:30' },
    { title: '북촌한옥마을', category: 'SPOT', arriveAt: '12:00' },
  ],
  interests: ['PALACE_HISTORY'],
  pace: 'RELAXED',
});
const TEMPLATE_KO = '오늘은 경복궁, 북촌한옥마을에 들르는 일정이에요.';

describe('로그인 가드', () => {
  test('세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED, 외부 호출 없음', async () => {
    turnOn();
    replyWith('오늘은 경복궁을 둘러봐요.');
    const res = await POST(request(BODY, { cookie: null }));
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(typeof data.message, 'string');
    assert.equal(calls.length, 0);
  });

  test('위조한 세션도 401', async () => {
    turnOn();
    const forged = `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'x' }, 'z'.repeat(48), Date.now())}`;
    const res = await POST(request(BODY, { cookie: forged }));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });
});

describe('응답 계약 { ok, text, source }', () => {
  test('기본(스위치·키 없음)은 TEMPLATE 이고 외부 호출이 없다', async () => {
    const res = await POST(request(BODY));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { ok: true, text: TEMPLATE_KO, source: 'TEMPLATE' });
    assert.equal(calls.length, 0);
  });

  test('스위치만 켜고 키가 없으면 TEMPLATE', async () => {
    process.env.SAFEHOUR_AI_INTRO = '1';
    const res = await POST(request(BODY));
    assert.deepEqual(await res.json(), { ok: true, text: TEMPLATE_KO, source: 'TEMPLATE' });
    assert.equal(calls.length, 0);
  });

  test('키만 있고 스위치가 꺼져 있으면 TEMPLATE', async () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const res = await POST(request(BODY));
    assert.deepEqual(await res.json(), { ok: true, text: TEMPLATE_KO, source: 'TEMPLATE' });
    assert.equal(calls.length, 0);
  });

  test('둘 다 있고 출력이 검사를 통과하면 AI', async () => {
    turnOn();
    replyWith('오늘은 경복궁과 북촌한옥마을을 천천히 둘러봐요.');
    const res = await POST(request(BODY));
    assert.deepEqual(await res.json(), {
      ok: true,
      text: '오늘은 경복궁과 북촌한옥마을을 천천히 둘러봐요.',
      source: 'AI',
    });
    assert.equal(calls.length, 1);
    assert.equal(new Headers(calls[0].init.headers).get('x-goog-api-key'), FAKE_KEY);
    assert.equal(calls[0].url.includes(FAKE_KEY), false);
  });

  test('금지 표현이 든 출력은 TEMPLATE 으로 바뀌고, 응답에 사유를 드러내지 않는다', async () => {
    turnOn();
    replyWith('수술 후에도 안심하고 걸을 수 있는 경복궁이에요.');
    const res = await POST(request(BODY));
    const data = await res.json();
    assert.deepEqual(data, { ok: true, text: TEMPLATE_KO, source: 'TEMPLATE' });
  });

  test('네트워크 오류도 200 TEMPLATE (사용자에게는 템플릿 문장이 보인다)', async () => {
    turnOn();
    const res = await POST(request({ ...BODY, lang: 'ja', stops: [{ title: '景福宮', category: 'CULTURE', arriveAt: '10:30' }] }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, text: '今日は景福宮に立ち寄る予定です。', source: 'TEMPLATE' });
    assert.equal(calls.length, 1, '재시도하지 않는다');
  });

  test('정거장이 없으면 부르지 않고 언어별 템플릿', async () => {
    turnOn();
    const res = await POST(request({ lang: 'zh', stops: [] }));
    assert.deepEqual(await res.json(), { ok: true, text: TEMPLATES.none.zh, source: 'TEMPLATE' });
    assert.equal(calls.length, 0);
  });
});

describe('입력 최소화 (규칙 36)', () => {
  test('조건·병원·숙소·날짜·계정 필드가 있어도 무시되고 외부로 전달되지 않는다', async () => {
    turnOn();
    replyWith('오늘은 경복궁과 북촌한옥마을을 천천히 둘러봐요.');
    const res = await POST(
      request({
        ...BODY,
        stops: BODY.stops.map((s) => ({ ...s, address: 'LEAK-주소', lat: 37.5796, lng: 126.977, contentId: 'LEAK-cid' })),
        conditions: { diet: { spicy: true }, walkLimitMin: 15, note: 'LEAK-조건' },
        periods: [{ id: 'p', items: { outing: 'YES' }, note: 'LEAK-기간' }],
        hospitals: [{ id: 'h1', name: 'LEAK-병원 이름', lat: 37.5, lng: 127.0 }],
        appointments: [{ id: 'a', type: 'PROCEDURE', date: '2026-10-02', start: '09:00' }],
        lodgings: [{ id: 'l', name: 'LEAK-숙소', address: 'LEAK-숙소 주소' }],
        date: '2026-10-03',
        account: { accountKey: 'LEAK-account', email: 'leak@example.com' },
        procedure: 'LEAK-코 성형',
      }),
    );
    assert.equal((await res.json()).source, 'AI');
    assert.equal(calls.length, 1);
    const wire = `${calls[0].url}\n${[...new Headers(calls[0].init.headers)].join('\n')}\n${calls[0].init.body}`;
    for (const leaked of ['LEAK', '2026-10-0', '37.5796', '126.977', 'example.com', '성형']) {
      assert.equal(wire.includes(leaked), false, `${leaked} 가 외부로 나갔다`);
    }
  });
});

describe('요청 형식 오류 → 400 SAFEHOUR_BAD_REQUEST, 외부 호출 없음', () => {
  const BAD = [
    ['JSON 이 아닌 본문', 'not-json'],
    ['null 본문', 'null'],
    ['배열 본문', '[]'],
    ['언어 없음', { stops: [] }],
    ['지원하지 않는 언어', { lang: 'fr', stops: [] }],
    ['정거장이 배열이 아님', { lang: 'ko', stops: {} }],
    ['정거장 없음', { lang: 'ko' }],
  ];
  for (const [name, body] of BAD) {
    test(name, async () => {
      turnOn();
      const res = await POST(request(body));
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, 'SAFEHOUR_BAD_REQUEST');
      assert.equal(typeof data.message, 'string');
      assert.equal(calls.length, 0);
    });
  }
});

describe('로그', () => {
  test('프롬프트·출력·키·URL·장소 이름을 로그에 남기지 않는다', async () => {
    turnOn();
    for (const output of ['오늘은 경복궁과 북촌한옥마을을 둘러봐요.', '영업 중인 경복궁에 가요.']) {
      replyWith(output);
      await POST(request(BODY));
    }
    globalThis.fetch = async () => {
      throw new Error(`fetch failed https://generativelanguage.googleapis.com key=${FAKE_KEY}`);
    };
    await POST(request(BODY));
    const text = logs.join('\n');
    for (const needle of [FAKE_KEY, 'googleapis', 'generateContent', '경복궁', '북촌', '영업 중', 'Day plan']) {
      assert.equal(text.includes(needle), false, `로그에 남음: ${needle}`);
    }
  });
});
