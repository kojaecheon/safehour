// 서버 알림 요청 보내기와 결과 판정 (src/guardian/watchSend.js · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md 다르게 정한 것 22)
//
// 이 파일이 고정하는 것
//   - 결과 규칙: 2xx 이면서 data.ok === true 일 때만 OK. 2xx 인데 본문이 계약 모양이 아니면(중간 장비의 HTML 등) UNAVAILABLE
//   - 신호를 무시하고 끝나지 않는 fetchImpl 도, 끝나지 않는 본문 읽기도 시간 한도에서 NETWORK 로 끝난다
//   - createWatchApi({ timeoutMs }) 가 한도를 그대로 넘긴다. 주지 않으면 기본 15초다. 끝나면 타이머를 지운다
//   - lib/trip/watchApi.js 의 다시 내보내기가 같은 함수·값이다
//
// 외부 호출은 없다. 가짜 fetch 만 쓴다. 시간 한도는 몇 밀리초로 짧게 준다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { NETWORK_ERROR as TRIP_NETWORK_ERROR } from '../lib/trip/api.js';
import * as watchApi from '../lib/trip/watchApi.js';
import { WATCH_KIND, backRequest, configRequest, newWatchIds } from '../src/guardian/watchRequests.js';
import {
  CLIENT_INVALID,
  NETWORK_ERROR,
  WATCH_API_TIMEOUT_MS,
  clientInvalidResult,
  sendWatchRequest,
  watchResultOf,
} from '../src/guardian/watchSend.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** 신호를 무시하고 끝나지 않는 fetch. 받은 init 을 쌓는다 */
function ignoringFetch() {
  const inits = [];
  const fetchImpl = (path, init) => {
    inits.push(init);
    return new Promise(() => {});
  };
  return { inits, fetchImpl };
}

describe('watchResultOf: 결과 규칙', () => {
  test('2xx 이면서 data.ok === true 일 때만 OK 다', () => {
    const data = { ok: true, recorded: true };
    assert.deepEqual(watchResultOf({ status: 200, data }), { ok: true, status: 200, data, kind: WATCH_KIND.OK });
    assert.deepEqual(watchResultOf({ status: 204, data: { ok: true } }).kind, WATCH_KIND.OK);
  });

  test('2xx 인데 본문이 { ok: true } 가 아니면 UNAVAILABLE 이다', () => {
    const notOk = [null, undefined, 'ok', [], {}, { ok: false }, { ok: 'true' }, { ok: 1 }];
    for (const data of notOk) {
      assert.deepEqual(
        watchResultOf({ status: 200, data }),
        { ok: false, status: 200, network: false, errorCode: 'HTTP_200', kind: WATCH_KIND.UNAVAILABLE },
        JSON.stringify(data),
      );
    }
    // 본문의 오류 코드는 그대로 옮기지만 2xx 라 분류는 UNAVAILABLE 이다
    const offIn200 = watchResultOf({ status: 200, data: { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' } });
    assert.equal(offIn200.kind, WATCH_KIND.UNAVAILABLE);
    assert.equal(offIn200.errorCode, 'SAFEHOUR_SERVER_PUSH_OFF');
  });

  test('2xx 가 아니면 상태와 오류 코드로 분류하고, data.ok 가 true 여도 성공이 아니다', () => {
    const cases = [
      [{ status: 404, data: { ok: false, errorCode: 'SAFEHOUR_WATCH_NOT_FOUND' } }, WATCH_KIND.NOT_FOUND, 'SAFEHOUR_WATCH_NOT_FOUND'],
      [{ status: 404, data: { ok: true } }, WATCH_KIND.NOT_FOUND, 'HTTP_404'],
      [{ status: 401, data: { ok: false, errorCode: 'SAFEHOUR_AUTH_REQUIRED' } }, WATCH_KIND.LOGIN_REQUIRED, 'SAFEHOUR_AUTH_REQUIRED'],
      [{ status: 429, data: null }, WATCH_KIND.RATE_LIMITED, 'HTTP_429'],
      [{ status: 400, data: { ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST' } }, WATCH_KIND.BAD, 'SAFEHOUR_BAD_REQUEST'],
      [{ status: 503, data: { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' } }, WATCH_KIND.OFF, 'SAFEHOUR_SERVER_PUSH_OFF'],
      [{ status: 503, data: null, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' }, WATCH_KIND.OFF, 'SAFEHOUR_SERVER_PUSH_OFF'],
      [{ status: 503, data: { ok: false, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' } }, WATCH_KIND.UNAVAILABLE, 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE'],
      [{ status: 502, data: null }, WATCH_KIND.UNAVAILABLE, 'HTTP_502'],
      [{}, WATCH_KIND.UNAVAILABLE, 'HTTP_0'],
    ];
    for (const [input, kind, errorCode] of cases) {
      const result = watchResultOf(input);
      assert.deepEqual(result, { ok: false, status: Number(input.status) || 0, network: false, errorCode, kind }, JSON.stringify(input));
    }
    assert.equal(watchResultOf().kind, WATCH_KIND.UNAVAILABLE);
  });

  test('연결 실패는 NETWORK 이고 오류 코드는 일정 API 와 같은 NETWORK_ERROR 다', () => {
    assert.deepEqual(watchResultOf({ network: true, status: 200, data: { ok: true } }), {
      ok: false,
      status: 0,
      network: true,
      errorCode: NETWORK_ERROR,
      kind: WATCH_KIND.NETWORK,
    });
    assert.equal(NETWORK_ERROR, TRIP_NETWORK_ERROR);
    assert.deepEqual(clientInvalidResult(), { ok: false, status: 0, network: false, errorCode: CLIENT_INVALID, kind: WATCH_KIND.BAD });
  });
});

describe('sendWatchRequest', () => {
  test('2xx 로 온 HTML(중간 장비의 로그인 화면 등)은 OK 가 아니라 UNAVAILABLE 이다', async () => {
    const portal = () => new Response('<!doctype html><title>Wi-Fi login</title>', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await sendWatchRequest(backRequest({ ...newWatchIds(), date: '2026-11-20', by: '14:30' }), { fetchImpl: async () => portal() });
    assert.deepEqual(result, { ok: false, status: 200, network: false, errorCode: 'HTTP_200', kind: WATCH_KIND.UNAVAILABLE });
    assert.equal((await sendWatchRequest(configRequest(), { fetchImpl: async () => json(200, { ok: true, enabled: false }) })).kind, WATCH_KIND.OK);
  });

  test('신호를 무시하고 끝나지 않는 fetchImpl 도 한도에서 NETWORK 로 끝나고 신호는 끊긴다', async () => {
    const { inits, fetchImpl } = ignoringFetch();
    const result = await sendWatchRequest(configRequest(), { fetchImpl, timeoutMs: 5 });
    assert.deepEqual(result, { ok: false, status: 0, network: true, errorCode: NETWORK_ERROR, kind: WATCH_KIND.NETWORK });
    assert.equal(inits.length, 1);
    assert.equal(inits[0].signal.aborted, true);
  });

  test('본문 읽기가 끝나지 않아도 한도에서 NETWORK 로 끝난다', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const result = await sendWatchRequest(configRequest(), { fetchImpl, timeoutMs: 5 });
    assert.equal(result.kind, WATCH_KIND.NETWORK);
  });

  test('fetchImpl 이 바로 던져도 던지지 않고 NETWORK 다', async () => {
    const result = await sendWatchRequest(configRequest(), {
      fetchImpl: () => {
        throw new TypeError('fetch failed');
      },
    });
    assert.equal(result.kind, WATCH_KIND.NETWORK);
  });
});

describe('createWatchApi 의 시간 한도', () => {
  test('createWatchApi({ timeoutMs }) 는 한도를 그대로 넘긴다: 끝나지 않는 fetch 가 그 값에서 끝난다', async (t) => {
    const timeouts = t.mock.method(globalThis, 'setTimeout');
    const { fetchImpl } = ignoringFetch();
    const api = watchApi.createWatchApi({ fetchImpl, timeoutMs: 7 });
    const result = await api.config();
    assert.equal(result.kind, WATCH_KIND.NETWORK);
    const delays = timeouts.mock.calls.map((call) => call.arguments[1]);
    assert.ok(delays.includes(7), JSON.stringify(delays));
    assert.ok(!delays.includes(WATCH_API_TIMEOUT_MS), JSON.stringify(delays));
  });

  test('timeoutMs 를 주지 않으면 기본 15초 한도를 걸고, 끝나면 그 타이머를 지운다', async (t) => {
    const timeouts = t.mock.method(globalThis, 'setTimeout');
    const clears = t.mock.method(globalThis, 'clearTimeout');
    const api = watchApi.createWatchApi({ fetchImpl: async () => json(200, { ok: true }) });
    assert.equal((await api.config()).kind, WATCH_KIND.OK);
    const call = timeouts.mock.calls.find((c) => c.arguments[1] === WATCH_API_TIMEOUT_MS);
    assert.ok(call, '기본 한도 타이머');
    assert.ok(clears.mock.calls.some((c) => c.arguments[0] === call.result), '끝난 뒤 타이머를 지운다');
    assert.equal(WATCH_API_TIMEOUT_MS, 15_000);
  });

  test('lib/trip/watchApi.js 는 같은 함수와 값을 다시 내보낸다', () => {
    assert.equal(watchApi.sendWatchRequest, sendWatchRequest);
    assert.equal(watchApi.CLIENT_INVALID, CLIENT_INVALID);
    assert.equal(watchApi.WATCH_API_TIMEOUT_MS, WATCH_API_TIMEOUT_MS);
  });
});
