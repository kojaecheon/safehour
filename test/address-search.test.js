// POST /api/address/search — 도로명주소 검색 프록시 계약 (AX-310 · spec 6장)
//
// 계약
//   - 로그인 세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED
//   - 검색어 2–60자(앞뒤 공백 제거). 아니면 400 SAFEHOUR_BAD_REQUEST, 외부 호출 없음
//   - 키(JUSO_API_KEY·JUSO_COORD_API_KEY) 중 하나라도 없으면 503 SAFEHOUR_ADDRESS_UNAVAILABLE
//     단, 데모 로그인 모드면 고정 데모 주소(source: "DEMO")
//   - 검색 API → 결과별 좌표 API → UTM-K → WGS84, 최대 10건, `{ ok, results: Address[] }`
//   - 외부 실패는 502 SAFEHOUR_EXTERNAL_API
//   - 키·검색어·전체 조회 URL 을 로그에 남기지 않는다
//
// 실제 API 는 부르지 않는다. 모든 외부 호출은 가짜 fetch 가 받는다.

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';
import {
  COORDS_BY_ROAD,
  EXPECTED_FIRST,
  FAKE_COORD_KEY,
  FAKE_SEARCH_KEY,
  SEARCH_ITEMS,
  coordResponse,
  searchResponse,
} from './juso-fixtures.js';

const SECRET = 'k'.repeat(48);
const SEARCH_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const COORD_URL = 'https://business.juso.go.kr/addrlink/addrCoordApi.do';
const ADDRESS_KEYS = ['roadAddress', 'jibunAddress', 'buildingName', 'lat', 'lng', 'source'];
const KEYWORD = '예시로 10';

const ENV_NAMES = ['SAFEHOUR_SESSION_SECRET', 'JUSO_API_KEY', 'JUSO_COORD_API_KEY', 'SAFEHOUR_ALLOW_DEMO_LOGIN'];
const savedEnv = {};
const originalFetch = globalThis.fetch;

let POST;

before(async () => {
  for (const name of ENV_NAMES) savedEnv[name] = process.env[name];
  ({ POST } = await import('../app/api/address/search/route.js'));
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
  process.env.JUSO_API_KEY = FAKE_SEARCH_KEY;
  process.env.JUSO_COORD_API_KEY = FAKE_COORD_KEY;
  delete process.env.SAFEHOUR_ALLOW_DEMO_LOGIN;
  // 실수로 실제 네트워크에 나가지 않도록 기본 fetch 는 실패시킨다
  globalThis.fetch = async () => {
    throw new Error('테스트에서 실제 네트워크 호출 금지');
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function sessionCookie() {
  const token = createSessionToken({ provider: 'demo', subject: 'subject-1' }, SECRET, Date.now());
  return `${SESSION_COOKIE}=${token}`;
}

function request(body, { cookie = sessionCookie() } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new Request('http://localhost/api/address/search', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * 가짜 fetch. 검색·좌표 API 를 URL 로 구분하고, 본문(form)을 기록한다.
 * @param {{search?: (params) => any, coord?: (params) => any}} handlers  응답 객체 또는 Response
 */
function installFakeFetch({ search, coord } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const params = new URLSearchParams(typeof init.body === 'string' ? init.body : String(init.body ?? ''));
    calls.push({ url: String(url), method: init.method, params });
    const target = String(url);
    let reply;
    if (target === SEARCH_URL) {
      reply = search ? await search(params) : searchResponse();
    } else if (target === COORD_URL) {
      reply = coord
        ? await coord(params)
        : (() => {
            const item = SEARCH_ITEMS.find((it) => it.rnMgtSn === params.get('rnMgtSn'));
            return coordResponse(item ?? {}, COORDS_BY_ROAD[params.get('rnMgtSn')] ?? {});
          })();
    } else {
      throw new Error(`예상하지 못한 호출: ${target}`);
    }
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply), {
      status: 200,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    });
  };
  return calls;
}

/** console 출력을 모두 모은다 */
function captureConsole() {
  const lines = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const originals = {};
  for (const m of methods) {
    originals[m] = console[m];
    console[m] = (...args) => {
      lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message} ${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  }
  return {
    lines,
    restore() {
      for (const m of methods) console[m] = originals[m];
    },
  };
}

async function bodyOf(res) {
  return res.json();
}

describe('로그인 가드', () => {
  test('세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED, 외부 호출 없음', async () => {
    const calls = installFakeFetch();
    const res = await POST(request({ keyword: KEYWORD, lang: 'ko' }, { cookie: null }));
    assert.equal(res.status, 401);
    const body = await bodyOf(res);
    assert.equal(body.ok, false);
    assert.equal(body.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(calls.length, 0);
  });

  test('위조한 세션도 401', async () => {
    const calls = installFakeFetch();
    const forged = `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject: 'x' }, 'z'.repeat(48), Date.now())}`;
    const res = await POST(request({ keyword: KEYWORD }, { cookie: forged }));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });

  test('데모 모드에서도 세션은 필요하다', async () => {
    delete process.env.JUSO_API_KEY;
    process.env.SAFEHOUR_ALLOW_DEMO_LOGIN = '1';
    const res = await POST(request({ keyword: '데모' }, { cookie: null }));
    assert.equal(res.status, 401);
  });
});

describe('검색어 검증 — 외부 호출 전에 거부', () => {
  const BAD = [
    ['JSON 이 아닌 본문', 'not-json'],
    ['객체가 아닌 본문', 'null'],
    ['배열 본문', '[]'],
    ['검색어 없음', { lang: 'ko' }],
    ['문자열이 아닌 검색어', { keyword: 12345 }],
    ['1자', { keyword: '강' }],
    ['공백 제거 후 1자', { keyword: '   강   ' }],
    ['공백만', { keyword: '     ' }],
    ['61자', { keyword: '가'.repeat(61) }],
    ['특수문자 %', { keyword: '강남 100%' }],
    ['특수문자 <', { keyword: '<script>강남' }],
    ['특수문자 =', { keyword: '강남=1' }],
    ['SQL 예약어', { keyword: '강남 union select' }],
    ['SQL 예약어(대소문자)', { keyword: "x' OR '1" }],
    ['제어문자', { keyword: '강남\u0000역' }],
  ];

  for (const [name, body] of BAD) {
    test(`${name} → 400 SAFEHOUR_BAD_REQUEST`, async () => {
      const calls = installFakeFetch();
      const res = await POST(request(body));
      assert.equal(res.status, 400);
      const data = await bodyOf(res);
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, 'SAFEHOUR_BAD_REQUEST');
      assert.equal(typeof data.message, 'string');
      assert.equal(calls.length, 0, '외부 API 를 부르지 않는다');
    });
  }

  test('앞뒤 공백을 지운 2자와 60자는 통과한다', async () => {
    for (const keyword of ['  강남  ', '가'.repeat(60)]) {
      const calls = installFakeFetch({ search: () => searchResponse([]) });
      const res = await POST(request({ keyword, lang: 'ko' }));
      assert.equal(res.status, 200, keyword);
      assert.equal(calls[0].params.get('keyword'), keyword.trim());
    }
  });

  test('단어 안에 든 or 는 예약어로 보지 않는다 (예: Oryu-ro)', async () => {
    const calls = installFakeFetch({ search: () => searchResponse([]) });
    const res = await POST(request({ keyword: 'Oryu-ro 5' }));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
  });
});

describe('키가 없을 때', () => {
  for (const missing of ['JUSO_API_KEY', 'JUSO_COORD_API_KEY']) {
    test(`${missing} 가 없으면 503 SAFEHOUR_ADDRESS_UNAVAILABLE`, async () => {
      delete process.env[missing];
      const calls = installFakeFetch();
      const res = await POST(request({ keyword: KEYWORD, lang: 'ko' }));
      assert.equal(res.status, 503);
      const data = await bodyOf(res);
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, 'SAFEHOUR_ADDRESS_UNAVAILABLE');
      assert.equal(calls.length, 0);
    });
  }

  test('공백뿐인 키는 없는 키다', async () => {
    process.env.JUSO_COORD_API_KEY = '   ';
    const res = await POST(request({ keyword: KEYWORD }));
    assert.equal(res.status, 503);
  });

  test('데모 로그인 스위치가 "1" 이 아니면 데모 주소를 주지 않는다', async () => {
    delete process.env.JUSO_API_KEY;
    process.env.SAFEHOUR_ALLOW_DEMO_LOGIN = 'true';
    const res = await POST(request({ keyword: '데모' }));
    assert.equal(res.status, 503);
  });
});

describe('데모 로그인 모드 — 고정 데모 주소', () => {
  beforeEach(() => {
    delete process.env.JUSO_API_KEY;
    delete process.env.JUSO_COORD_API_KEY;
    process.env.SAFEHOUR_ALLOW_DEMO_LOGIN = '1';
  });

  test('외부 호출 없이 source "DEMO" 주소만 돌려준다', async () => {
    const calls = installFakeFetch();
    const res = await POST(request({ keyword: '데모', lang: 'en' }));
    assert.equal(res.status, 200);
    const data = await bodyOf(res);
    assert.deepEqual(Object.keys(data).sort(), ['ok', 'results']);
    assert.equal(data.ok, true);
    assert.ok(data.results.length >= 2 && data.results.length <= 10);
    for (const address of data.results) {
      assert.equal(address.source, 'DEMO');
      assert.ok(Object.keys(address).every((k) => ADDRESS_KEYS.includes(k)));
      assert.match(address.roadAddress, /데모/, '실제 주소처럼 보이지 않게 데모임을 표시한다');
      assert.match(address.buildingName, /^데모 /);
      assert.ok(address.lat > 33 && address.lat < 39 && address.lng > 124 && address.lng < 132);
    }
    assert.equal(calls.length, 0);
  });

  test('검색어로 느슨하게 거른다', async () => {
    const gangnam = await bodyOf(await POST(request({ keyword: '강남역 근처' })));
    assert.ok(gangnam.results.length >= 1);
    assert.ok(gangnam.results.some((a) => a.buildingName.includes('강남역')));
    assert.ok(gangnam.results.every((a) => /강남/.test(`${a.buildingName} ${a.roadAddress}`)));

    const english = await bodyOf(await POST(request({ keyword: 'sinsa' })));
    assert.ok(english.results.some((a) => a.buildingName.includes('신사동')));

    const none = await bodyOf(await POST(request({ keyword: '없는검색어' })));
    assert.deepEqual(none.results, []);
  });

  test('데모 모드라도 키가 모두 있으면 실제 API 경로를 쓴다', async () => {
    process.env.JUSO_API_KEY = FAKE_SEARCH_KEY;
    process.env.JUSO_COORD_API_KEY = FAKE_COORD_KEY;
    const calls = installFakeFetch();
    const data = await bodyOf(await POST(request({ keyword: KEYWORD })));
    assert.ok(calls.length > 0);
    assert.ok(data.results.every((a) => a.source === 'JUSO'));
  });
});

describe('검색 성공 — 검색 API → 좌표 API → 위경도', () => {
  test('주소를 Address 로 바꾸고, 좌표가 없는 결과는 뺀다', async () => {
    const calls = installFakeFetch();
    const res = await POST(request({ keyword: KEYWORD, lang: 'ko' }));
    assert.equal(res.status, 200);
    const data = await bodyOf(res);
    assert.deepEqual(Object.keys(data).sort(), ['ok', 'results']);
    assert.equal(data.ok, true);
    assert.equal(data.results.length, 2, '좌표가 없는 세 번째 결과는 빠진다');

    const [first, second] = data.results;
    assert.equal(first.roadAddress, '서울특별시 가상구 예시로 10 (예시동)');
    assert.equal(first.jibunAddress, '서울특별시 가상구 예시동 100-1');
    assert.equal(first.buildingName, '예시빌딩');
    assert.equal(first.source, 'JUSO');
    assert.ok(Math.abs(first.lat - EXPECTED_FIRST.lat) < 1e-6);
    assert.ok(Math.abs(first.lng - EXPECTED_FIRST.lng) < 1e-6);

    // 비어 있는 선택 필드는 싣지 않는다
    assert.deepEqual(Object.keys(second), ['roadAddress', 'lat', 'lng', 'source']);
    assert.ok(Math.abs(second.lat - 38) < 1e-6);
    assert.ok(Math.abs(second.lng - 127.5) < 1e-6);

    for (const address of data.results) {
      assert.ok(Object.keys(address).every((k) => ADDRESS_KEYS.includes(k)), '코드·영문주소 등 계약 밖 필드는 없다');
    }

    // 호출 모양 — 공식 문서의 요청변수
    const searchCalls = calls.filter((c) => c.url === SEARCH_URL);
    const coordCalls = calls.filter((c) => c.url === COORD_URL);
    assert.equal(searchCalls.length, 1);
    assert.equal(coordCalls.length, 3);
    const s = searchCalls[0];
    assert.equal(s.method, 'POST');
    assert.equal(s.params.get('confmKey'), FAKE_SEARCH_KEY);
    assert.equal(s.params.get('keyword'), KEYWORD);
    assert.equal(s.params.get('currentPage'), '1');
    assert.equal(s.params.get('countPerPage'), '10');
    assert.equal(s.params.get('resultType'), 'json');
    const c = coordCalls.find((call) => call.params.get('rnMgtSn') === '110000000001');
    assert.equal(c.method, 'POST');
    assert.equal(c.params.get('confmKey'), FAKE_COORD_KEY, '좌표 API 는 좌표 키를 쓴다');
    assert.equal(c.params.get('admCd'), '1100000001');
    assert.equal(c.params.get('udrtYn'), '0');
    assert.equal(c.params.get('buldMnnm'), '10');
    assert.equal(c.params.get('buldSlno'), '0');
    assert.equal(c.params.get('resultType'), 'json');
    assert.equal(c.params.get('keyword'), null, '좌표 API 에 검색어를 보내지 않는다');
  });

  test('키와 검색어는 URL 이 아니라 본문으로 보낸다', async () => {
    const calls = installFakeFetch();
    await POST(request({ keyword: KEYWORD }));
    for (const call of calls) {
      assert.equal(new URL(call.url).search, '', 'URL 에 조회 문자열이 없다');
      assert.ok(!call.url.includes(FAKE_SEARCH_KEY) && !call.url.includes(FAKE_COORD_KEY));
    }
  });

  test('요청 본문의 다른 필드는 외부로 보내지 않는다', async () => {
    const calls = installFakeFetch({ search: () => searchResponse([]) });
    await POST(request({ keyword: KEYWORD, lang: 'ko', lat: 37.5, lng: 127, currentLocation: 'x', confmKey: 'evil' }));
    const sent = [...calls[0].params.keys()].sort();
    assert.deepEqual(sent, ['confmKey', 'countPerPage', 'currentPage', 'keyword', 'resultType']);
    assert.equal(calls[0].params.get('confmKey'), FAKE_SEARCH_KEY);
  });

  test('결과는 최대 10건이다', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...SEARCH_ITEMS[0],
      roadAddr: `서울특별시 가상구 예시로 ${i + 1}`,
      buldMnnm: String(i + 1),
    }));
    const calls = installFakeFetch({
      search: () => searchResponse(many),
      coord: (params) =>
        coordResponse({ ...SEARCH_ITEMS[0], buldMnnm: params.get('buldMnnm') }, COORDS_BY_ROAD['110000000001']),
    });
    const data = await bodyOf(await POST(request({ keyword: KEYWORD })));
    assert.equal(data.results.length, 10);
    assert.ok(calls.filter((c) => c.url === COORD_URL).length <= 10, '10건을 넘는 좌표 조회를 하지 않는다');
  });

  test('좌표가 대한민국 범위 밖이면 그 결과를 뺀다', async () => {
    installFakeFetch({
      search: () => searchResponse([SEARCH_ITEMS[0]]),
      coord: () => coordResponse(SEARCH_ITEMS[0], { entX: '0', entY: '0' }),
    });
    const data = await bodyOf(await POST(request({ keyword: KEYWORD })));
    assert.deepEqual(data.results, []);
  });

  test('lang 이 달라도 결과는 같다 (도로명주소는 한국어 원문 그대로)', async () => {
    installFakeFetch();
    const ko = await bodyOf(await POST(request({ keyword: KEYWORD, lang: 'ko' })));
    installFakeFetch();
    const ja = await bodyOf(await POST(request({ keyword: KEYWORD, lang: 'ja' })));
    installFakeFetch();
    const odd = await bodyOf(await POST(request({ keyword: KEYWORD, lang: 42 })));
    assert.deepEqual(ja, ko);
    assert.deepEqual(odd, ko);
  });
});

describe('빈 결과', () => {
  test('검색 결과가 없으면 200 과 빈 목록, 좌표 API 는 부르지 않는다', async () => {
    for (const items of [[], null]) {
      const calls = installFakeFetch({ search: () => searchResponse(items) });
      const res = await POST(request({ keyword: KEYWORD }));
      assert.equal(res.status, 200);
      assert.deepEqual(await bodyOf(res), { ok: true, results: [] });
      assert.equal(calls.filter((c) => c.url === COORD_URL).length, 0);
    }
  });
});

describe('외부 실패', () => {
  const FAILURES = [
    ['검색 API HTTP 500', { search: () => new Response('oops', { status: 500 }) }],
    ['검색 API 가 JSON 이 아님', { search: () => new Response('<html>error</html>', { status: 200 }) }],
    ['검색 API 응답 모양이 다름', { search: () => ({ unexpected: true }) }],
    ['승인되지 않은 키 (E0001)', { search: () => searchResponse([], { errorCode: 'E0001', errorMessage: '승인되지 않은 KEY 입니다.' }) }],
    ['시스템 오류 (-999)', { search: () => searchResponse([], { errorCode: '-999', errorMessage: '시스템에러' }) }],
    ['네트워크 오류', { search: () => { throw new TypeError('fetch failed'); } }],
    ['시간 초과', { search: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } }],
    ['좌표 API 키 오류', { coord: () => coordResponse({}, {}, { errorCode: 'E0001', errorMessage: '승인되지 않은 KEY 입니다.' }) }],
    ['좌표 API 과다 호출 (E0007)', { coord: () => coordResponse({}, {}, { errorCode: 'E0007', errorMessage: '짧은 시간동안 다량의 주소검색 요청이 있습니다.' }) }],
    ['좌표 API HTTP 503', { coord: () => new Response('', { status: 503 }) }],
  ];

  for (const [name, handlers] of FAILURES) {
    test(`${name} → 502 SAFEHOUR_EXTERNAL_API`, async () => {
      installFakeFetch(handlers);
      const consoleCapture = captureConsole();
      let res;
      try {
        res = await POST(request({ keyword: KEYWORD }));
      } finally {
        consoleCapture.restore();
      }
      assert.equal(res.status, 502);
      const data = await bodyOf(res);
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, 'SAFEHOUR_EXTERNAL_API');
      assert.equal('results' in data, false);
    });
  }

  test('검색어 문제로 거절되면(E0006 등) 400 SAFEHOUR_BAD_REQUEST', async () => {
    for (const code of ['E0006', 'E0008', 'E0009', 'E0010', 'E0013', 'E0015']) {
      installFakeFetch({ search: () => searchResponse([], { errorCode: code, errorMessage: '입력 오류' }) });
      const res = await POST(request({ keyword: KEYWORD }));
      assert.equal(res.status, 400, code);
      assert.equal((await bodyOf(res)).errorCode, 'SAFEHOUR_BAD_REQUEST');
    }
  });
});

describe('비밀정보를 로그에 남기지 않는다', () => {
  // 키·검색어·조회 URL 이 어떤 로그 줄에도, 어떤 응답에도 나오면 안 된다
  const FORBIDDEN = [FAKE_SEARCH_KEY, FAKE_COORD_KEY, KEYWORD, 'business.juso.go.kr', 'addrLinkApi', 'addrCoordApi', 'confmKey'];

  function assertClean(text, where) {
    for (const needle of FORBIDDEN) {
      assert.ok(!text.includes(needle), `${where} 에 "${needle}" 가 있다: ${text}`);
    }
  }

  const SCENARIOS = [
    ['성공', {}, 200],
    ['HTTP 오류', { search: () => new Response('bad gateway', { status: 502 }) }, 502],
    [
      '오류 메시지에 URL·키·검색어가 섞인 네트워크 오류',
      {
        search: (params) => {
          throw new Error(`request to ${SEARCH_URL}?confmKey=${params.get('confmKey')}&keyword=${params.get('keyword')} failed`);
        },
      },
      502,
    ],
    [
      '좌표 API 오류 메시지에 키가 섞임',
      {
        coord: (params) => {
          throw new Error(`connect ECONNREFUSED ${COORD_URL} key=${params.get('confmKey')}`);
        },
      },
      502,
    ],
    ['외부 오류 코드', { search: () => searchResponse([], { errorCode: 'E0001', errorMessage: `KEY ${FAKE_SEARCH_KEY} 오류` }) }, 502],
    ['검색어 거절', { search: () => searchResponse([], { errorCode: 'E0006', errorMessage: `${KEYWORD} 상세히` }) }, 400],
  ];

  for (const [name, handlers, status] of SCENARIOS) {
    test(`${name}: 로그와 응답에 키·검색어·URL 이 없다`, async () => {
      installFakeFetch(handlers);
      const consoleCapture = captureConsole();
      let res;
      try {
        res = await POST(request({ keyword: KEYWORD, lang: 'ko' }));
      } finally {
        consoleCapture.restore();
      }
      assert.equal(res.status, status);
      const text = await res.text();
      if (status !== 200) assertClean(text, '응답');
      for (const line of consoleCapture.lines) assertClean(line, '로그');
      if (status === 502) {
        assert.ok(consoleCapture.lines.length > 0, '외부 실패는 운영 로그 한 줄을 남긴다(분류 코드만)');
      }
    });
  }

  test('성공 응답에는 키·URL 이 없다', async () => {
    installFakeFetch();
    const text = await (await POST(request({ keyword: KEYWORD }))).text();
    for (const needle of [FAKE_SEARCH_KEY, FAKE_COORD_KEY, 'business.juso.go.kr', 'confmKey']) {
      assert.ok(!text.includes(needle), needle);
    }
  });
});
