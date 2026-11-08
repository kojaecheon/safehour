// TourAPI 호출 실패 분류 (운영 관측)
//
// 계약:
//   - callTourApi 가 던지는 오류는 `upstream` 에 닫힌 목록(SELF_LIMIT·QUOTA·AUTH·UPSTREAM_ERROR·PARSE·NETWORK) 중
//     하나를 싣는다. 운영자는 이 값으로 '자체 한도 / 제공처 한도 / 키 문제 / 제공처 장애'를 구분한다.
//   - 메시지와 분류 어디에도 인증키·요청 URL 이 들어가지 않는다.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-upstream-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
const KEY = 'upstream-test-key-do-not-log';
process.env.TOUR_API_KEY = KEY;

let callTourApi;
let classifyTourApiResponse;
let tourApiUpstreamClass;
let TOUR_API_UPSTREAM;
let TOUR_API_PATHS;
let TOUR_API_DAILY_LIMIT;

before(async () => {
  ({ callTourApi, classifyTourApiResponse, tourApiUpstreamClass, TOUR_API_UPSTREAM } = await import(
    '../src/tour-api/client.js'
  ));
  ({ TOUR_API_PATHS, TOUR_API_DAILY_LIMIT } = await import('../src/tour-api/config.js'));
});

after(() => {
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

const OP = { serviceName: 'korean', operation: 'locationBasedList2' };
let seq = 0;
const params = () => ({ mapX: '127.0', mapY: '37.5', radius: '1000', pageNo: String((seq += 1)) });

function jsonResponse(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
}
function textResponse(status, text) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => text });
}

async function failure(fetchImpl) {
  try {
    await callTourApi({ ...OP, parameters: params(), useCache: false, fetchImpl });
  } catch (error) {
    return error;
  }
  assert.fail('호출이 실패해야 한다');
}

function assertNoSecret(error) {
  assert.ok(!error.message.includes(KEY), '메시지에 키가 없어야 한다');
  assert.ok(!/https?:\/\//.test(error.message), '메시지에 URL 이 없어야 한다');
}

describe('classifyTourApiResponse (가짜 응답 분류)', () => {
  test('성공은 null', () => {
    assert.equal(classifyTourApiResponse({ httpStatus: 200, resultCode: '0000' }), null);
  });

  test('resultCode 22·HTTP 429·한도 초과 문구는 QUOTA', () => {
    assert.equal(classifyTourApiResponse({ httpStatus: 200, resultCode: '22' }), 'QUOTA');
    assert.equal(
      classifyTourApiResponse({ httpStatus: 200, resultCode: '99', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' }),
      'QUOTA',
    );
    assert.equal(classifyTourApiResponse({ httpStatus: 429, parsed: false, bodyText: 'API rate limit exceeded' }), 'QUOTA');
  });

  test('키 오류 코드(20·21·30·31·32·33·12)와 HTTP 401·403 은 AUTH', () => {
    for (const code of ['12', '20', '21', '30', '31', '32', '33']) {
      assert.equal(classifyTourApiResponse({ httpStatus: 200, resultCode: code }), 'AUTH', code);
    }
    assert.equal(classifyTourApiResponse({ httpStatus: 401, parsed: false, bodyText: 'Unauthorized' }), 'AUTH');
    assert.equal(classifyTourApiResponse({ httpStatus: 403, parsed: false, bodyText: 'Forbidden' }), 'AUTH');
  });

  test('게이트웨이 XML 의 returnReasonCode 를 읽는다', () => {
    const xml = (code, msg) =>
      `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>${msg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    assert.equal(classifyTourApiResponse({ httpStatus: 200, parsed: false, bodyText: xml('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') }), 'AUTH');
    assert.equal(
      classifyTourApiResponse({ httpStatus: 200, parsed: false, bodyText: xml('22', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR') }),
      'QUOTA',
    );
    assert.equal(classifyTourApiResponse({ httpStatus: 200, parsed: false, bodyText: xml('99', 'UNKNOWN_ERROR') }), 'PARSE');
  });

  test('HTTP 5xx 와 그 밖의 resultCode 는 UPSTREAM_ERROR, 원인 모를 비JSON 은 PARSE', () => {
    assert.equal(classifyTourApiResponse({ httpStatus: 503, parsed: false, bodyText: '<html>Service Unavailable</html>' }), 'UPSTREAM_ERROR');
    assert.equal(classifyTourApiResponse({ httpStatus: 200, resultCode: '10', resultMsg: 'INVALID_REQUEST_PARAMETER_ERROR' }), 'UPSTREAM_ERROR');
    assert.equal(classifyTourApiResponse({ httpStatus: 200, resultCode: '23' }), 'UPSTREAM_ERROR');
    assert.equal(classifyTourApiResponse({ httpStatus: 200, parsed: false, bodyText: '<html>점검 중</html>' }), 'PARSE');
  });

  test('tourApiUpstreamClass 는 닫힌 목록 밖 값을 null 로 거른다', () => {
    for (const value of Object.values(TOUR_API_UPSTREAM)) assert.equal(tourApiUpstreamClass(value), value);
    assert.equal(tourApiUpstreamClass('https://apis.data.go.kr/?serviceKey=x'), null);
    assert.equal(tourApiUpstreamClass(undefined), null);
    assert.equal(tourApiUpstreamClass({}), null);
  });
});

describe('callTourApi 가 던지는 오류의 upstream', () => {
  test('JSON resultCode 22 → QUOTA, 메시지는 예전 모양 그대로', async () => {
    const error = await failure(
      jsonResponse(200, { response: { header: { resultCode: '22', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } } }),
    );
    assert.equal(error.upstream, 'QUOTA');
    assert.match(error.message, /^TourAPI 오류 22:/);
    assertNoSecret(error);
  });

  test('최상위 resultCode 30 → AUTH', async () => {
    const error = await failure(jsonResponse(200, { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' }));
    assert.equal(error.upstream, 'AUTH');
    assertNoSecret(error);
  });

  test('HTTP 500 JSON → UPSTREAM_ERROR', async () => {
    const error = await failure(jsonResponse(500, { response: { header: { resultCode: '01', resultMsg: 'APPLICATION_ERROR' } } }));
    assert.equal(error.upstream, 'UPSTREAM_ERROR');
  });

  test('HTML 본문 → PARSE', async () => {
    const error = await failure(textResponse(200, '<html><body>maintenance</body></html>'));
    assert.equal(error.upstream, 'PARSE');
    assert.match(error.message, /JSON이 아닌 응답/);
    assertNoSecret(error);
  });

  test('fetch 실패·시간 초과 → NETWORK, 원문 메시지(URL 포함 가능)는 싣지 않는다', async () => {
    const error = await failure(async (url) => {
      throw new TypeError(`fetch failed for ${url}`);
    });
    assert.equal(error.upstream, 'NETWORK');
    assertNoSecret(error);

    const timeout = await failure(async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });
    assert.equal(timeout.upstream, 'NETWORK');
    assert.match(timeout.message, /TimeoutError/);
  });

  test('자체 일일 한도 → SELF_LIMIT (fetch 하지 않는다)', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(),
    );
    const counter = path.join(TOUR_API_PATHS.logs, `counter-${day}.json`);
    const previous = fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8') : null;
    fs.writeFileSync(counter, JSON.stringify({ 'korean.locationBasedList2': TOUR_API_DAILY_LIMIT }), 'utf8');
    let called = false;
    try {
      const error = await failure(async () => {
        called = true;
        return { ok: true, status: 200, text: async () => '{}' };
      });
      assert.equal(error.upstream, 'SELF_LIMIT');
      assert.equal(called, false);
    } finally {
      if (previous === null) fs.rmSync(counter, { force: true });
      else fs.writeFileSync(counter, previous, 'utf8');
    }
  });

  test('호출 기록에는 분류가 남고 키·전체 URL 은 남지 않는다', async () => {
    await failure(jsonResponse(200, { response: { header: { resultCode: '22', resultMsg: 'LIMITED' } } }));
    const files = fs.readdirSync(TOUR_API_PATHS.logs).filter((f) => f.startsWith('calls-'));
    const text = files.map((f) => fs.readFileSync(path.join(TOUR_API_PATHS.logs, f), 'utf8')).join('');
    assert.ok(!text.includes(KEY));
    assert.ok(!text.includes('serviceKey='));
    const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.upstream === 'QUOTA'));
    assert.ok(lines.every((l) => l.upstream === null || Object.values(TOUR_API_UPSTREAM).includes(l.upstream)));
  });
});
