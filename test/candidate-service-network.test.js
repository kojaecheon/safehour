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

  test('무장애 상세 실패는 성공 건수로 집계되지 않는다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스')],
      english: [],
      barrierFree: [listItem(1, '코엑스')],
      detail: null, // 상세만 장애
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.diagnostics.barrierDetailCount, 0, '실패를 성공으로 셌다');
    assert.equal(result.diagnostics.barrierDetailFailed, 1);
  });

  test('무장애 상세가 성공하면 성공 건수로 집계된다', async () => {
    stubServices({
      korean: [listItem(1, '코엑스')],
      english: [],
      barrierFree: [listItem(1, '코엑스')],
      detail: [{ contentid: '1', wheelchair: '있음' }],
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.diagnostics.barrierDetailCount, 1);
    assert.equal(result.diagnostics.barrierDetailFailed, 0);
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

/**
 * 운영·휴무 조회 (`detailIntro2`) — 끝난 축제·정기 휴무일에 회복기 환자를 보내지 않는다.
 *
 * 목록 조회는 운영시간을 주지 않으므로 상위 후보에 한해 상세를 본다.
 * 닫힘 근거가 명백할 때만 `openNow: false` 가 되고, 그 외에는 null 로 남는다 —
 * "지금 열려 있다" 는 어디서도 만들지 않는다 (SIGNOFF 5.3).
 */
describe('운영·휴무로 닫힌 후보 제외', () => {
  /** detailIntro2 만 따로 응답하는 스텁 */
  function stubWithSchedules(koreanItems, schedulesByContentId) {
    const state = { introCalls: [] };
    globalThis.fetch = async (url) => {
      const target = String(url);
      const ok = (items) => ({ ok: true, status: 200, text: async () => body(items) });

      if (target.includes('detailIntro2')) {
        const id = new URL(target).searchParams.get('contentId');
        state.introCalls.push(id);
        const schedule = schedulesByContentId[id];
        return schedule ? ok([{ contentid: id, ...schedule }]) : ok([]);
      }
      if (target.includes('KorWithService2')) return ok([]);
      if (target.includes('EngService2')) return ok([]);
      if (target.includes('KorService2')) return ok(koreanItems);
      return { ok: false, status: 500, text: async () => '{}' };
    };
    return state;
  }

  test('끝난 축제는 openNow=false 로 내려간다', async () => {
    stubWithSchedules([listItem(1, '지난 축제'), listItem(2, '상시 운영')], {
      1: { eventstartdate: '20260701', eventenddate: '20260731' },
      2: { restdate: '연중무휴' },
    });

    // KST 08-17 (월). 축제는 07-31 에 끝났고, 상시 운영은 연중무휴다.
    const result = await loadSafeHourCandidates({
      origin: ORIGIN,
      useCache: false,
      now: new Date('2026-08-17T01:00:00Z'),
    });

    const byId = new Map(result.candidates.map((c) => [c.title, c]));
    assert.equal(byId.get('지난 축제').openNow, false);
    // 닫힘 근거가 없으면 null 이다 — true 가 아니다
    assert.equal(byId.get('상시 운영').openNow, null);
    assert.equal(result.diagnostics.scheduleClosedCount, 1);
  });

  test('정기 휴무는 주입한 시각의 요일로 판정한다', async () => {
    const schedules = { 1: { restdateculture: '매주 월요일 휴관' } };

    stubWithSchedules([listItem(1, '월요일 휴관 시설')], schedules);
    const onMonday = await loadSafeHourCandidates({
      origin: ORIGIN,
      useCache: false,
      now: new Date('2026-08-17T01:00:00Z'), // KST 월요일
    });
    assert.equal(onMonday.candidates[0].openNow, false);

    stubWithSchedules([listItem(1, '월요일 휴관 시설')], schedules);
    const onTuesday = await loadSafeHourCandidates({
      origin: ORIGIN,
      useCache: false,
      now: new Date('2026-08-18T01:00:00Z'), // KST 화요일
    });
    assert.equal(onTuesday.candidates[0].openNow, null);
  });

  test('상세 조회에 실패해도 후보를 지우지 않는다', async () => {
    globalThis.fetch = async (url) => {
      const target = String(url);
      const ok = (items) => ({ ok: true, status: 200, text: async () => body(items) });
      if (target.includes('detailIntro2')) return { ok: false, status: 500, text: async () => '{}' };
      if (target.includes('KorWithService2')) return ok([]);
      if (target.includes('EngService2')) return ok([]);
      if (target.includes('KorService2')) return ok([listItem(1, '조회 실패')]);
      return { ok: false, status: 500, text: async () => '{}' };
    };

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].openNow, null, '실패는 닫힘이 아니다');
    assert.equal(result.diagnostics.scheduleClosedCount, 0);
  });

  test('상위 몇 건만 조회한다 — 후보 전체를 상세 조회하지 않는다', async () => {
    const many = Array.from({ length: 20 }, (_, i) => listItem(i + 1, `장소${i + 1}`));
    const state = stubWithSchedules(many, {});

    await loadSafeHourCandidates({ origin: ORIGIN, useCache: false, scheduleDetailLimit: 5 });

    assert.equal(state.introCalls.length, 5);
  });
});
