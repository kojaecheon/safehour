// AX-305: 선택 언어 관광 데이터와 폴백 (docs/business-rules.md '장소 후보와 필터'·'전체 일정 확정과 변화 대응', docs/platform/ITINERARY_RULES.md '출처와 언어',
// 테스트 이름의 규칙 27 은 옛 설계서 번호다)
//
// 계약:
//   - 국문(KorService2)과 무장애(KorWithService2)는 항상 조회한다.
//   - lang 이 en·ja·zh 이면 그 언어 서비스(EngService2·JpnService2·ChsService2)를 하나 더한다.
//     lang 이 ko 이면 다른 언어를 조회하지 않는다.
//   - 선택 언어 서비스가 실패하면(키 미신청 포함) 영문으로 대체한다.
//     영문도 없으면 국문을 보여주고 '번역 필요'를 표시한다.
//   - 언어 간 매칭은 같은 contentId 이거나 같은 유형·20m 이내일 때만 한다.
//   - 판정 입력은 언어와 무관하다: 같은 입력이면 언어가 달라도 후보 contentId 와 신호가 같다.
//   - 목록은 (기준점, 반경, 언어) 조합마다 한 번만 조회한다.
//
// 실제 호출은 없다. fetch 를 스텁으로 바꾼다.

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ORIGIN, foreignItem, koItem, stubTourServices } from './tour-api-fixtures.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-languages-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let loadSafeHourCandidates;
let createCandidateLoader;
let candidateQueryKey;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ loadSafeHourCandidates, createCandidateLoader, candidateQueryKey } = await import(
    '../src/tour-api/candidate-service.js'
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

const KOREAN = [
  koItem(101, '테스트 박물관', { contenttypeid: '14', lclsSystm1: 'VE', lclsSystm2: 'VE07', lclsSystm3: 'VE070100' }),
  koItem(102, '테스트 한식당', {
    contenttypeid: '39',
    mapx: '127.0600',
    mapy: '37.5120',
    lclsSystm1: 'FD',
    lclsSystm2: 'FD01',
    lclsSystm3: 'FD010100',
  }),
];

// 외국어 항목은 contentId 가 다르다 — 같은 유형(국문 체계로 정규화)·20m 이내 좌표로만 연결된다.
const JAPANESE = [
  foreignItem(901, 'テスト博物館', { contenttypeid: '78' }),
  foreignItem(902, 'テスト韓国料理', { contenttypeid: '82', mapx: '127.0600', mapy: '37.5120' }),
];
const CHINESE = [foreignItem(801, '测试博物馆', { contenttypeid: '78' })];
const ENGLISH = [
  foreignItem(701, 'Test Museum', { contenttypeid: '78' }),
  foreignItem(702, 'Test Korean Restaurant', { contenttypeid: '82', mapx: '127.0600', mapy: '37.5120' }),
];

const byId = (result) => new Map(result.candidates.map((c) => [c.id, c]));

describe('선택 언어별 조회 서비스', () => {
  test('ja 이면 국문·무장애·일문만 조회하고 영문은 조회하지 않는다', async () => {
    const state = stubTourServices({ korean: KOREAN, japanese: JAPANESE, english: ENGLISH });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ja', useCache: false, scheduleDetailLimit: 0 });

    assert.equal(state.byService['korean.locationBasedList2'], 1);
    assert.equal(state.byService['barrierFree.locationBasedList2'], 1);
    assert.equal(state.byService['japanese.locationBasedList2'], 1);
    assert.equal(state.byService['english.locationBasedList2'], undefined, '일문이 성공했는데 영문을 조회했다');

    const museum = byId(result).get('101');
    assert.equal(museum.title, 'テスト博物館');
    assert.equal(museum.stop.lang, 'ja');
    assert.equal(museum.stop.sourceIds.ja, '901');
    assert.equal(museum.stop.contentTypeIds.ja, '78');
    assert.equal(museum.stop.contentTypeIds.canonical, '14');
    assert.deepEqual(museum.stop.ko, { title: '테스트 박물관', address: '서울특별시 강남구 테스트로 1' });
    assert.ok(museum.source.includes('TourAPI:JpnService2'));
    assert.equal(result.diagnostics.language.requested, 'ja');
    assert.equal(result.diagnostics.language.service, 'japanese');
    assert.equal(result.diagnostics.language.fallback, null);
  });

  test('zh 이면 중문 간체 서비스를 조회한다', async () => {
    const state = stubTourServices({ korean: KOREAN, chinese: CHINESE });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'zh', useCache: false, scheduleDetailLimit: 0 });

    assert.equal(state.byService['chineseSimplified.locationBasedList2'], 1);
    assert.equal(byId(result).get('101').title, '测试博物馆');
    assert.equal(byId(result).get('101').stop.sourceIds.zh, '801');
    // 중문에 짝이 없는 식당은 국문 + 번역 필요
    const restaurant = byId(result).get('102');
    assert.equal(restaurant.stop.lang, 'ko');
    assert.equal(restaurant.needsTranslation, true);
  });

  test('ko 이면 다른 언어를 조회하지 않는다', async () => {
    const state = stubTourServices({ korean: KOREAN });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ko', useCache: false, scheduleDetailLimit: 0 });

    assert.deepEqual(Object.keys(state.byService).sort(), [
      'barrierFree.locationBasedList2',
      'korean.locationBasedList2',
    ]);
    assert.ok(result.candidates.every((c) => c.stop.lang === 'ko' && c.needsTranslation === false));
  });

  test('en 이면 영문 서비스를 조회한다', async () => {
    const state = stubTourServices({ korean: KOREAN, english: ENGLISH });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'en', useCache: false, scheduleDetailLimit: 0 });

    assert.equal(state.byService['english.locationBasedList2'], 1);
    assert.equal(byId(result).get('102').title, 'Test Korean Restaurant');
    assert.equal(byId(result).get('102').stop.contentTypeIds.en, '82');
  });

  test('lang 을 주지 않으면 기존처럼 영문을 조회한다', async () => {
    const state = stubTourServices({ korean: KOREAN, english: ENGLISH });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, useCache: false, scheduleDetailLimit: 0 });

    assert.equal(state.byService['english.locationBasedList2'], 1);
    assert.equal(byId(result).get('101').titleLanguage, 'en');
  });
});

describe('폴백 사슬 (선택 언어 → 영문 → 국문 + 번역 필요)', () => {
  test('일문 서비스가 실패하면(키 미신청 포함) 영문으로 대체한다', async () => {
    const state = stubTourServices({ korean: KOREAN, japanese: null, english: ENGLISH });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ja', useCache: false, scheduleDetailLimit: 0 });

    assert.equal(state.byService['japanese.locationBasedList2'], 1);
    assert.equal(state.byService['english.locationBasedList2'], 1);
    const museum = byId(result).get('101');
    assert.equal(museum.title, 'Test Museum');
    assert.equal(museum.stop.lang, 'en');
    assert.equal(museum.needsTranslation, false);
    assert.equal(result.diagnostics.degraded.japanese, true);
    assert.equal(result.diagnostics.language.service, 'english');
    assert.equal(result.diagnostics.language.fallback, 'ENGLISH');
  });

  test('중문 서비스가 실패하고 영문도 실패하면 국문 + 번역 필요, 후보는 유지된다', async () => {
    stubTourServices({ korean: KOREAN, chinese: null, english: null });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'zh', useCache: false, scheduleDetailLimit: 0 });

    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every((c) => c.stop.lang === 'ko' && c.needsTranslation === true));
    assert.equal(result.diagnostics.degraded.chineseSimplified, true);
    assert.equal(result.diagnostics.degraded.english, true);
    assert.equal(result.diagnostics.language.service, null);
    assert.equal(result.diagnostics.language.fallback, 'KOREAN');
  });

  test('국문이 실패하면 언어와 무관하게 안전한 미추천(예외)이다', async () => {
    stubTourServices({ korean: null, japanese: JAPANESE });

    await assert.rejects(() =>
      loadSafeHourCandidates({ origin: ORIGIN, lang: 'ja', useCache: false, scheduleDetailLimit: 0 }),
    );
  });

  test('유형이 다르면 20m 안이어도 연결하지 않는다 — 제목 유사도로도 연결하지 않는다', async () => {
    stubTourServices({
      korean: KOREAN,
      japanese: [foreignItem(903, '테스트 박물관', { contenttypeid: '79' })], // 쇼핑(79) ≠ 문화시설(14)
    });

    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ja', useCache: false, scheduleDetailLimit: 0 });

    const museum = byId(result).get('101');
    assert.equal(museum.stop.sourceIds.ja, null);
    assert.equal(museum.needsTranslation, true);
  });
});

describe('판정 입력은 언어와 무관하다 (규칙 27)', () => {
  test('lang 이 달라도 후보 contentId 목록·신호·분류가 같다', async () => {
    const snapshots = [];
    for (const lang of ['ko', 'en', 'ja', 'zh']) {
      stubTourServices({ korean: KOREAN, english: ENGLISH, japanese: JAPANESE, chinese: CHINESE });
      const result = await loadSafeHourCandidates({ origin: ORIGIN, lang, useCache: false, scheduleDetailLimit: 0 });
      snapshots.push(
        result.candidates.map((c) => ({
          id: c.id,
          signals: c.signals,
          walkMin: c.walkMin,
          indoor: c.indoor,
          tourismEligible: c.tourismEligible,
        })),
      );
    }
    for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
  });

  test('같은 장소 중복 제거도 언어와 무관하게 같은 contentId 를 남긴다', async () => {
    // 같은 이름·같은 위치 두 건. 영문 짝은 두 번째 항목에만 있다.
    const twins = [
      koItem(201, '테스트 아쿠아리움', { mapx: '127.0587', mapy: '37.5126' }),
      koItem(202, '테스트 아쿠아리움', { mapx: '127.0588', mapy: '37.5126' }),
    ];
    const english = [foreignItem(202, 'Test Aquarium (테스트 아쿠아리움)', { mapx: '127.0588', mapy: '37.5126' })];
    const kept = [];
    for (const lang of ['ko', 'en', 'ja']) {
      stubTourServices({ korean: twins, english, japanese: [] });
      const result = await loadSafeHourCandidates({ origin: ORIGIN, lang, useCache: false, scheduleDetailLimit: 0 });
      kept.push(result.candidates.map((c) => c.id));
    }
    assert.deepEqual(kept, [['201'], ['201'], ['201']]);
  });
});

describe('목록 조회는 (기준점, 반경, 언어) 조합마다 한 번 (spec 4.8 호출 방식)', () => {
  test('같은 조합을 여러 날짜에서 요청해도 목록은 한 번만 조회한다', async () => {
    const state = stubTourServices({ korean: KOREAN, japanese: JAPANESE });
    const loader = createCandidateLoader({ useCache: false, scheduleDetailLimit: 0 });

    const query = { origin: ORIGIN, radiusMeters: 3_000, lang: 'ja' };
    const [a, b, c] = await Promise.all([loader.load(query), loader.load(query), loader.load({ ...query })]);

    assert.equal(state.byService['korean.locationBasedList2'], 1);
    assert.equal(state.byService['japanese.locationBasedList2'], 1);
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(loader.size, 1);
  });

  test('반경이나 기준점이 다르면 따로 조회한다', async () => {
    const state = stubTourServices({ korean: KOREAN, english: ENGLISH });
    const loader = createCandidateLoader({ useCache: false, scheduleDetailLimit: 0 });

    await loader.load({ origin: ORIGIN, radiusMeters: 3_000, lang: 'en' });
    await loader.load({ origin: ORIGIN, radiusMeters: 10_000, lang: 'en' });
    await loader.load({ origin: { ...ORIGIN, lat: 37.5665, lng: 126.978 }, radiusMeters: 3_000, lang: 'en' });

    assert.equal(state.byService['korean.locationBasedList2'], 3);
    assert.equal(loader.size, 3);
  });

  test('조합 키에는 기준점·반경·언어가 들어가고, 잘못된 기준점은 거부한다', () => {
    assert.equal(
      candidateQueryKey({ origin: ORIGIN, radiusMeters: 3_000, lang: 'ja' }),
      candidateQueryKey({ origin: { ...ORIGIN }, radiusMeters: '3000', lang: 'ja' }),
    );
    assert.notEqual(
      candidateQueryKey({ origin: ORIGIN, radiusMeters: 3_000, lang: 'ja' }),
      candidateQueryKey({ origin: ORIGIN, radiusMeters: 3_000, lang: 'zh' }),
    );
    assert.throws(() => candidateQueryKey({ origin: { ...ORIGIN, kind: 'CURRENT_GPS' }, radiusMeters: 3_000 }));
  });

  test('실패한 조회도 한 번만 한다 — 같은 요청 안에서 재시도로 호출을 늘리지 않는다', async () => {
    const state = stubTourServices({ korean: null });
    const loader = createCandidateLoader({ useCache: false, scheduleDetailLimit: 0 });
    const query = { origin: ORIGIN, radiusMeters: 3_000, lang: 'ko' };

    await assert.rejects(() => loader.load(query));
    await assert.rejects(() => loader.load(query));
    assert.equal(state.byService['korean.locationBasedList2'], 1);
  });
});

describe('로그·반환값 안전성', () => {
  test('반환 후보와 진단에 인증키·조회 URL 이 없다', async () => {
    stubTourServices({ korean: KOREAN, japanese: JAPANESE });
    const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ja', useCache: false, scheduleDetailLimit: 0 });
    const text = JSON.stringify(result);
    assert.equal(text.includes('test-service-key'), false);
    assert.equal(text.includes('serviceKey'), false);
    assert.equal(text.includes('apis.data.go.kr'), false);
  });
});
