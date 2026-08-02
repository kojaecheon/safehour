// AX-006 — 상세 조회 부분 실패 시 추천 판정 유지 (D09-QA032, D06-E010, D04-BR012)
//
// 계약:
//   - 상세 API 일부(또는 전부) 실패해도 추천 코스는 유지된다. 상세는 보강일 뿐 판정 근거가 아니다.
//   - 실패는 조용히 삼키지 않고 errors 로 남긴다.
//   - 확인되지 않은 운영시간을 영업 중으로 단정하지 않는다 (openNow=null 유지).
//   - 영문 상세가 실패하면 국문으로 폴백하되 어느 원문인지 표기한다.

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-partial-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let fetchCandidateDetails;
let enrichRecommendedCourse;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ fetchCandidateDetails, enrichRecommendedCourse } = await import(
    '../src/tour-api/detail-service.js'
  ));
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

function detailItem(overrides = {}) {
  return {
    contentid: '126508',
    title: 'Test Place',
    overview: 'An indoor exhibition hall.',
    addr1: '서울특별시 강남구',
    usetime: '09:00~18:00',
    ...overrides,
  };
}

function successBody(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, totalCount: items.length },
    },
  });
}

/**
 * URL 패턴별로 성공/실패를 지정하는 fetch 스텁.
 * failFor: URL 에 포함되면 실패시킬 문자열 배열 (예: ['detailIntro2', 'EngService2'])
 */
function stubFetch({ failFor = [], items = [detailItem()] } = {}) {
  const state = { calls: [] };
  globalThis.fetch = async (url) => {
    const target = String(url);
    state.calls.push(target);
    if (failFor.some((pattern) => target.includes(pattern))) {
      return { ok: false, status: 500, text: async () => '{}' };
    }
    return { ok: true, status: 200, text: async () => successBody(items) };
  };
  return state;
}

const CANDIDATE = {
  id: '126508',
  title: '코엑스',
  sourceIds: { korean: '126508', english: '264500' },
  sourceMetadata: { contentTypeIds: { korean: '12', english: '76' } },
};

describe('상세 조회 부분 실패 (D09-QA032)', () => {
  test('detailIntro2 만 실패해도 개요·이미지는 살아남고 실패는 errors 에 남는다', async () => {
    stubFetch({ failFor: ['detailIntro2'] });

    const details = await fetchCandidateDetails(CANDIDATE, { useCache: false });

    assert.ok(details.overview, '개요가 유실됐다');
    assert.ok(details.errors.length > 0, '실패가 errors 에 기록되지 않았다');
    assert.ok(details.errors.every((e) => e.operation === 'detailIntro2'));
  });

  test('영문 상세가 전부 실패하면 국문으로 폴백하고 언어를 표기한다', async () => {
    stubFetch({ failFor: ['EngService2'] });

    const details = await fetchCandidateDetails(CANDIDATE, { useCache: false });

    assert.equal(details.overviewLanguage, 'ko');
    assert.ok(details.overview, '국문 폴백이 동작하지 않았다');
    assert.ok(details.sources.includes('TourAPI:KorService2'));
  });

  test('국문·영문 상세가 모두 실패해도 예외를 던지지 않는다', async () => {
    stubFetch({ failFor: ['detailCommon2', 'detailIntro2', 'detailImage2'] });

    const details = await fetchCandidateDetails(CANDIDATE, { useCache: false });

    assert.equal(details.overview, null);
    assert.deepEqual(details.images, []);
    assert.ok(details.errors.length >= 6, '양쪽 언어의 실패가 모두 기록되지 않았다');
  });

  test('운영시간 원문이 있어도 영업 여부를 단정하지 않는다 (D04-BR012)', async () => {
    stubFetch({ items: [detailItem({ usetime: '09:00~18:00', restdate: '매주 월요일' })] });

    const details = await fetchCandidateDetails(CANDIDATE, { useCache: false });

    assert.equal(details.openNow, null, 'openNow 를 임의로 판정했다');
    assert.equal(details.openNowReason, 'UNVERIFIED_SCHEDULE_TEXT');
  });
});

describe('추천 코스 보강 실패가 판정을 무너뜨리지 않는다 (QA032 핵심)', () => {
  const course = [
    { ...CANDIDATE, id: 'a', title: '1순위', patient: { ok: true, stayMin: 40 }, sla: { slackMin: 120 } },
    { ...CANDIDATE, id: 'b', title: '2순위', patient: { ok: true, stayMin: 35 }, sla: { slackMin: 100 } },
    { ...CANDIDATE, id: 'c', title: '3순위', patient: { ok: true, stayMin: 30 }, sla: { slackMin: 90 } },
  ];

  test('상세가 전부 실패해도 코스 길이·순서·판정 필드가 보존된다', async () => {
    stubFetch({ failFor: ['detail'] });

    const enriched = await enrichRecommendedCourse(course, { limit: 3, useCache: false });

    assert.equal(enriched.length, 3);
    assert.deepEqual(
      enriched.map((c) => c.id),
      ['a', 'b', 'c'],
      '코스 순서가 바뀌었다',
    );
    // 판정 결과(안전 게이트 산출물)는 상세 실패와 무관하게 유지되어야 한다
    assert.equal(enriched[0].patient.ok, true);
    assert.equal(enriched[0].sla.slackMin, 120);
    assert.ok(enriched[0].details.errors.length > 0);
  });

  test('일부 후보만 실패해도 나머지 후보의 상세는 정상 보강된다', async () => {
    // 2순위(contentId 가 같으므로 호출 순서로 구분 불가) — 대신 전체 성공 대비를 확인한다
    stubFetch({ failFor: ['detailImage2'] });

    const enriched = await enrichRecommendedCourse(course, { limit: 3, useCache: false });

    assert.equal(enriched.length, 3);
    for (const candidate of enriched) {
      assert.ok(candidate.details.overview, '개요 보강이 실패했다');
      assert.deepEqual(candidate.details.images, [], '실패한 이미지가 채워졌다');
    }
  });

  test('limit 를 넘는 후보는 상세 호출 없이 그대로 유지된다', async () => {
    const state = stubFetch();

    const enriched = await enrichRecommendedCourse(course, { limit: 1, useCache: false });

    assert.equal(enriched.length, 3);
    assert.ok(enriched[0].details, '상위 후보가 보강되지 않았다');
    assert.equal(enriched[1].details, undefined, 'limit 밖 후보에 상세를 호출했다');
    // 상위 1건 × (국문 3 + 영문 3) = 6회
    assert.equal(state.calls.length, 6);
  });

  test('호출 한도가 소진돼도 추천 코스는 유지된다', async () => {
    const state = stubFetch();
    // 상세 오퍼레이션 카운터를 한도까지 채운다
    const kst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const counter = {};
    for (const service of ['korean', 'english']) {
      for (const op of ['detailCommon2', 'detailIntro2', 'detailImage2']) {
        counter[`${service}.${op}`] = 1000;
      }
    }
    fs.writeFileSync(
      path.join(TOUR_API_PATHS.logs, `counter-${kst}.json`),
      JSON.stringify(counter),
      'utf8',
    );

    const enriched = await enrichRecommendedCourse(course, { limit: 3, useCache: false });

    assert.equal(enriched.length, 3, '한도 초과가 추천 코스를 삭제했다');
    assert.equal(enriched[0].patient.ok, true);
    assert.equal(state.calls.length, 0, '한도 초과인데 외부 호출이 나갔다');
    assert.ok(enriched[0].details.errors.length > 0, '한도 초과가 errors 에 기록되지 않았다');
  });
});
