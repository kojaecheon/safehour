// AX-305 — 식당 메뉴·운영 원문 보강은 요청받은 후보에만 (spec 4.8 호출 방식)
//
// 계약:
//   - detailIntro2(국문) 한 번으로 운영·휴무 원문과 대표메뉴(firstmenu)·취급메뉴(treatmenu)를 받는다.
//     필드 이름은 공식 문서(국문 음식점 39 / 외국어 음식점 82)로 확인했다.
//   - 호출은 넘겨받은 후보에만 한다. 이미 보강된 후보는 다시 부르지 않는다.
//   - 보강하면 원문은 sourceMetadata 에, 매운·날음식·메뉴 유무 신호는 다시 계산돼 signals 에 들어간다.
//   - 실패는 후보를 지우지 않는다. 메뉴 정보는 모르는 상태(null)로 남고 실패는 진단에 남는다.
//   - 목록 단계에서 상위 몇 건의 운영 원문을 받을 때도 메뉴 원문을 함께 싣는다(추가 호출 없음).

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ORIGIN, koItem, stubTourServices } from './tour-api-fixtures.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-intro-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let loadSafeHourCandidates;
let enrichCandidateIntros;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ loadSafeHourCandidates } = await import('../src/tour-api/candidate-service.js'));
  ({ enrichCandidateIntros } = await import('../src/tour-api/detail-service.js'));
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

const food = (id, title, extra = {}) =>
  koItem(id, title, {
    contenttypeid: '39',
    lclsSystm1: 'FD',
    lclsSystm2: 'FD01',
    lclsSystm3: 'FD010100',
    mapx: String(127.05 + id / 10_000),
    ...extra,
  });

const KOREAN = [food(1, '테스트 갈비집'), food(2, '테스트 국숫집'), food(3, '테스트 분식')];

async function loadList() {
  stubTourServices({ korean: KOREAN });
  const result = await loadSafeHourCandidates({ origin: ORIGIN, lang: 'ko', useCache: false, scheduleDetailLimit: 0 });
  return result.candidates;
}

describe('요청받은 후보만 보강한다', () => {
  test('넘겨받은 후보 수만큼만 detailIntro2 를 부르고 국문 유형 코드를 쓴다', async () => {
    const candidates = await loadList();
    const state = stubTourServices({
      intro: { 1: { firstmenu: '갈비탕', treatmenu: '불고기', restdatefood: '연중무휴' } },
    });

    const { candidates: enriched, diagnostics } = await enrichCandidateIntros([candidates[0]], { useCache: false });

    assert.equal(state.byService['korean.detailIntro2'], 1);
    const url = new URL(state.calls[0]);
    assert.equal(url.searchParams.get('contentId'), '1');
    assert.equal(url.searchParams.get('contentTypeId'), '39');
    assert.equal(enriched.length, 1);
    assert.deepEqual(enriched[0].sourceMetadata.menu, { firstmenu: '갈비탕', treatmenu: '불고기' });
    assert.deepEqual(enriched[0].sourceMetadata.schedule, { restdatefood: '연중무휴' });
    assert.equal(enriched[0].signals.hasMenuInfo, true);
    assert.equal(enriched[0].signals.spicy, false);
    assert.deepEqual(diagnostics, { requested: 1, fetched: 1, skipped: 0, failed: [] });
  });

  test('메뉴 단서가 있으면 신호가 true 로 바뀐다', async () => {
    const candidates = await loadList();
    stubTourServices({ intro: { 3: { firstmenu: '떡볶이', treatmenu: '김밥' } } });

    const { candidates: enriched } = await enrichCandidateIntros([candidates[2]], { useCache: false });

    assert.equal(enriched[0].signals.spicy, true);
    assert.deepEqual(enriched[0].signals.evidence.spicy, [{ field: 'firstmenu', cue: '떡볶이' }]);
  });

  test('메뉴가 비어 있으면 hasMenuInfo=false 이고 판단은 null 로 남는다', async () => {
    const candidates = await loadList();
    stubTourServices({ intro: { 2: { opentimefood: '11:00~21:00' } } });

    const { candidates: enriched } = await enrichCandidateIntros([candidates[1]], { useCache: false });

    assert.equal(enriched[0].signals.hasMenuInfo, false);
    assert.equal(enriched[0].signals.spicy, null);
    assert.equal(enriched[0].signals.raw, null);
  });

  test('이미 보강된 후보는 다시 부르지 않는다', async () => {
    const candidates = await loadList();
    stubTourServices({ intro: { 1: { firstmenu: '갈비탕' } } });
    const first = await enrichCandidateIntros([candidates[0]], { useCache: false });

    const state = stubTourServices({ intro: { 1: { firstmenu: '갈비탕' } } });
    const second = await enrichCandidateIntros(first.candidates, { useCache: false });

    assert.equal(state.calls.length, 0);
    assert.equal(second.diagnostics.skipped, 1);
    assert.deepEqual(second.candidates[0], first.candidates[0]);
  });

  test('조회 실패는 후보를 지우지 않고 메뉴는 모르는 상태로 남는다', async () => {
    const candidates = await loadList();
    stubTourServices({ introFails: true });

    const { candidates: enriched, diagnostics } = await enrichCandidateIntros(candidates, { useCache: false });

    assert.equal(enriched.length, 3);
    assert.deepEqual(enriched.map((c) => c.id), ['1', '2', '3']);
    assert.ok(enriched.every((c) => c.signals.hasMenuInfo === null && c.sourceMetadata.menu === null));
    assert.deepEqual(diagnostics.failed, ['1', '2', '3']);
  });

  test('국문 원본 ID·유형이 없는 후보는 호출하지 않고 진단에 남긴다', async () => {
    const state = stubTourServices({});
    const orphan = { id: 'x', stop: { sourceIds: { ko: null }, contentTypeIds: { ko: null } }, sourceMetadata: {} };

    const { candidates: enriched, diagnostics } = await enrichCandidateIntros([orphan], { useCache: false });

    assert.equal(state.calls.length, 0);
    assert.equal(enriched[0], orphan);
    assert.deepEqual(diagnostics.failed, ['x']);
  });
});

describe('목록 단계 운영 원문 조회도 메뉴를 함께 싣는다', () => {
  test('상위 후보의 detailIntro2 한 번으로 운영·메뉴 원문과 신호를 채운다', async () => {
    const state = stubTourServices({
      korean: KOREAN,
      intro: { 1: { firstmenu: '물회', restdatefood: '매주 월요일 휴무' } },
    });

    const result = await loadSafeHourCandidates({
      origin: ORIGIN,
      lang: 'ko',
      useCache: false,
      scheduleDetailLimit: 1,
      now: new Date('2026-08-18T01:00:00Z'), // 화요일 — 오늘은 닫힘 아님
    });

    assert.equal(state.byService['korean.detailIntro2'], 1);
    const first = result.candidates.find((c) => c.id === '1');
    assert.deepEqual(first.sourceMetadata.menu, { firstmenu: '물회' });
    assert.equal(first.signals.raw, true);
    assert.equal(first.openNow, null, '열려 있다고 단정하지 않는다');
    // 목록은 한 번 받고 날짜별로 다시 판정할 수 있다
    assert.deepEqual(first.sourceMetadata.schedule, { restdatefood: '매주 월요일 휴무' });

    const untouched = result.candidates.find((c) => c.id === '2');
    assert.equal(untouched.sourceMetadata.menu, null);
    assert.equal(untouched.signals.hasMenuInfo, null);
  });
});
