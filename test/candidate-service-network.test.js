// AX-006/AX-009 — 후보 조회의 네트워크 경계 (D06-E005, D02-S001 대체 흐름, D07-BAN002)
//
// 계약:
//   - 국문 관광정보는 후보의 근간이다. 실패하면 안전한 미추천으로 간다 (임의 후보 생성 금지).
//   - 영문·무장애는 보강 데이터다. 실패해도 국문 후보로 서비스가 계속되어야 한다
//     (D02-S001 대체 흐름: "영문 원문이 없으면 국문 폴백과 번역 필요 상태를 표시").
//   - 폴백이 일어났으면 진단에 남겨 화면이 불확실성을 표시할 수 있게 한다.

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-candidates-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let loadSafeHourCandidates;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ loadSafeHourCandidates } = await import('../src/tour-api/candidate-service.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(TOUR_API_PATHS.logs, { recursive: true, force: true });
  fs.mkdirSync(TOUR_API_PATHS.logs, { recursive: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ORIGIN = { kind: 'USER_SELECTED_FIXED', lat: 37.5105, lng: 127.059 };

function listItem(contentid, title, extra = {}) {
  return {
    contentid: String(contentid),
    title,
    mapx: '127.0590',
    mapy: '37.5110',
    contenttypeid: '12',
    ...extra,
  };
}

function body(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, totalCount: items.length },
    },
  });
}

/** 서비스별 응답을 지정하는 fetch 스텁. null 이면 HTTP 500 실패 */
function stubServices({ korean, english, barrierFree, detail = [] } = {}) {
  const state = { calls: [] };
  globalThis.fetch = async (url) => {
    const target = String(url);
    state.calls.push(target);

    const fail = { ok: false, status: 500, text: async () => '{}' };
    const ok = (items) => ({ ok: true, status: 200, text: async () => body(items) });

    if (target.includes('detailWithTour2')) return detail === null ? fail : ok(detail);
    if (target.includes('KorWithService2')) return barrierFree === null ? fail : ok(barrierFree ?? []);
    if (target.includes('EngService2')) return english === null ? fail : ok(english ?? []);
    if (target.includes('KorService2')) return korean === null ? fail : ok(korean ?? []);
    return fail;
  };
  return state;
}

describe('후보 조회 정상 경로', () => {
  test('국문·영문·무장애를 병합해 후보를 만든다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스'), listItem(2, '봉은사')],
      english: [listItem(1, 'COEX')],
      barrierFree: [listItem(1, '코엑스')],
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.candidates.length, 2);
    assert.equal(result.origin.kind, 'USER_SELECTED_FIXED');
    assert.equal(result.diagnostics.received.korean, 2);
    assert.equal(result.diagnostics.received.english, 1);
  });

  test('국문 결과가 비어 있으면 후보 0건이며 오류가 아니다', async () => {
    stubServices({ korean: [], english: [], barrierFree: [] });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.deepEqual(result.candidates, []);
    assert.equal(result.diagnostics.received.korean, 0);
  });
});

describe('부분 실패와 폴백 (D02-S001 대체 흐름)', () => {
  test('영문 조회가 실패해도 국문 후보로 서비스가 계속된다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스'), listItem(2, '봉은사')],
      english: null, // 영문만 장애
      barrierFree: [],
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.candidates.length, 2, '영문 장애가 전체 추천을 막았다');
    assert.equal(result.diagnostics.degraded.english, true, '폴백 사실이 진단에 없다');
    // 국문 폴백이므로 번역 필요 상태여야 한다
    assert.ok(result.candidates.every((c) => c.titleLanguage === 'ko'));
  });

  test('무장애 조회가 실패해도 국문 후보로 서비스가 계속된다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스')],
      english: [listItem(1, 'COEX')],
      barrierFree: null,
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.candidates.length, 1, '무장애 장애가 전체 추천을 막았다');
    assert.equal(result.diagnostics.degraded.barrierFree, true);
  });

  test('무장애 상세 조회가 실패해도 후보는 유지된다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스')],
      english: [],
      barrierFree: [listItem(1, '코엑스')],
      detail: null,
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.candidates.length, 1);
  });

  test('국문 조회가 실패하면 안전한 미추천으로 간다 (임의 후보 생성 금지)', async () => {
    stubServices({ korean: null, english: [listItem(1, 'COEX')], barrierFree: [] });

    await assert.rejects(
      () => loadSafeHourCandidates({ origin: ORIGIN, useCache: false }),
      /TourAPI/,
      '국문 실패인데 후보를 만들어냈다',
    );
  });

  test('모든 조회가 실패하면 예외로 안전 미추천을 유도한다', async () => {
    stubServices({ korean: null, english: null, barrierFree: null });

    await assert.rejects(() => loadSafeHourCandidates({ origin: ORIGIN, useCache: false }));
  });
});

describe('입력 경계 (D07-BAN002)', () => {
  test('현재 GPS 출처 좌표는 호출 전에 거부한다', async () => {
    const state = stubServices({ korean: [listItem(1, '코엑스')] });

    await assert.rejects(() =>
      loadSafeHourCandidates({
        origin: { kind: 'CURRENT_GPS', lat: 37.5105, lng: 127.059 },
        useCache: false,
      }),
    );
    assert.equal(state.calls.length, 0, '거부해야 할 요청이 외부로 나갔다');
  });

  test('국외 좌표는 호출 전에 거부한다', async () => {
    const state = stubServices({ korean: [] });

    await assert.rejects(() =>
      loadSafeHourCandidates({ origin: { ...ORIGIN, lat: 48.85, lng: 2.35 }, useCache: false }),
    );
    assert.equal(state.calls.length, 0);
  });

  test('반경 20,000m 는 허용하고 20,001m 는 거부한다', async () => {
    stubServices({ korean: [], english: [], barrierFree: [] });

    await assert.doesNotReject(() =>
      loadSafeHourCandidates({ origin: ORIGIN, radiusMeters: 20_000, useCache: false }),
    );
    await assert.rejects(() =>
      loadSafeHourCandidates({ origin: ORIGIN, radiusMeters: 20_001, useCache: false }),
    );
  });
});
