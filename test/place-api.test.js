// AX-005 · AX-308: 장소 상세 API 계약 (D03-SCR006, D04-F009, D09-AC016 · docs/contracts.md '`POST /api/place`', docs/business-rules.md '장소 후보와 필터', docs/platform/ITINERARY_RULES.md '출처와 언어')
//
// 계약:
//   - 로그인 세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED, 외부 호출 없음
//   - 요청은 정거장(Stop)과 같은 형식 { lang, contentId, sourceIds, contentTypeIds } 이다.
//     예전 { candidate: { sourceIds.korean/english, sourceMetadata } } 형식은 받지 않는다
//   - 식별자·언어 형식이 틀리면 외부 호출 전에 400 SAFEHOUR_PLACE_INVALID
//   - 국문 + 선택 언어 서비스를 조회한다. 선택 언어(ja·zh)가 없거나 실패하면 영문, 그래도 없으면 국문이고 언어를 표기한다
//   - 상세는 보강 조회다. 실패해도 일정 판정에 영향을 주지 않는다. 운영시간 원문을 영업 여부로 해석하지 않는다

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SESSION_SECRET, postJson } from './itinerary-fixtures.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-place-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let placePost;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;
const originalSecret = process.env.SAFEHOUR_SESSION_SECRET;

before(async () => {
  ({ POST: placePost } = await import('../app/api/place/route.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.SAFEHOUR_SESSION_SECRET;
  else process.env.SAFEHOUR_SESSION_SECRET = originalSecret;
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.SAFEHOUR_SESSION_SECRET = SESSION_SECRET;
  // 상세 API 는 캐시를 쓰므로(운영과 동일) 테스트 간 캐시도 비워 격리한다
  for (const dir of [TOUR_API_PATHS.logs, TOUR_API_PATHS.cache]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const request = (payload, opts) => placePost(postJson('/api/place', payload, opts));

/** 정거장과 같은 형식 — 국문 126508(12), 영문 264500(76), 일문 1265082(76), 중문 1265083(76) */
const PLACE = {
  lang: 'en',
  contentId: '126508',
  sourceIds: { ko: '126508', en: '264500', ja: '1265082', zh: '1265083' },
  contentTypeIds: { canonical: '12', ko: '12', en: '76', ja: '76', zh: '76' },
};

const SERVICE = { KorService2: 'korean', EngService2: 'english', JpnService2: 'japanese', ChsService2: 'chinese' };

function successBody(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, totalCount: items.length },
    },
  });
}

/** 서비스·오퍼레이션별 응답 스텁. failFor 에 걸리면 HTTP 500 */
function stubFetch({ failFor = [], ...locales } = {}) {
  const state = { calls: [] };
  globalThis.fetch = async (url) => {
    const target = String(url);
    state.calls.push(target);
    if (failFor.some((p) => target.includes(p))) {
      return { ok: false, status: 500, text: async () => '{}' };
    }
    const service = Object.entries(SERVICE).find(([key]) => target.includes(key))?.[1];
    const locale = locales[service] ?? {};
    for (const [op, key] of [
      ['detailCommon2', 'common'],
      ['detailIntro2', 'intro'],
      ['detailImage2', 'images'],
    ]) {
      if (target.includes(op)) return { ok: true, status: 200, text: async () => successBody(locale[key] ?? []) };
    }
    return { ok: true, status: 200, text: async () => successBody([]) };
  };
  return state;
}

const services = (calls) => [...new Set(calls.map((c) => Object.entries(SERVICE).find(([k]) => c.includes(k))?.[1]))].sort();

describe('로그인 가드', () => {
  test('세션이 없으면 401 SAFEHOUR_AUTH_REQUIRED 이고 외부 호출이 없다', async () => {
    const state = stubFetch();
    const res = await request(PLACE, { cookie: false });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.deepEqual(Object.keys(data).sort(), ['errorCode', 'message', 'ok']);
    assert.equal(data.ok, false);
    assert.equal(data.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
    assert.equal(state.calls.length, 0);
  });
});

describe('입력 검증 (외부 호출 전 차단)', () => {
  test('본문이 JSON 이 아니면 400 SAFEHOUR_BAD_REQUEST', async () => {
    const res = await request('{{');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, 'SAFEHOUR_BAD_REQUEST');
  });

  test('예전 { candidate } 형식은 받지 않는다', async () => {
    const state = stubFetch();
    const res = await request({
      candidate: {
        sourceIds: { korean: '126508', english: '264500' },
        sourceMetadata: { contentTypeIds: { korean: '12', english: '76' } },
      },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, 'SAFEHOUR_PLACE_INVALID');
    assert.equal(state.calls.length, 0);
  });

  test('언어·contentId·식별자 형식이 틀리면 400 SAFEHOUR_PLACE_INVALID (경로 조작 방지)', async () => {
    const state = stubFetch();
    const cases = [
      { ...PLACE, lang: 'fr' },
      { ...PLACE, contentId: undefined },
      { ...PLACE, contentId: '../../etc/passwd' },
      { ...PLACE, sourceIds: { ko: '../../etc/passwd' }, contentTypeIds: { ko: '12' } },
      { ...PLACE, sourceIds: {}, contentTypeIds: {} },
      { ...PLACE, sourceIds: { ko: '126508' }, contentTypeIds: {} }, // 유형 코드 없이는 소개정보를 부를 수 없다
    ];
    for (const payload of cases) {
      const res = await request(payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      const data = await res.json();
      assert.equal(data.errorCode, 'SAFEHOUR_PLACE_INVALID');
    }
    assert.equal(state.calls.length, 0);
  });

  test('클라이언트가 보낸 임의 필드는 조회에 쓰이지 않는다', async () => {
    const state = stubFetch({ korean: { common: [{ contentid: '126508', overview: '개요' }] } });
    await request({ ...PLACE, lang: 'ko', maliciousServiceKey: 'leak', overview: '위조된 개요', currentLocation: { lat: 37.1 } });
    const joined = state.calls.join(' ');
    assert.equal(joined.includes('leak'), false);
    assert.equal(joined.includes('%EC%9C%84%EC%A1%B0'), false);
    assert.equal(joined.includes('37.1'), false);
  });
});

describe('선택 언어 서비스와 대체 (spec 4.8)', () => {
  test('ko 는 국문만 부른다', async () => {
    const state = stubFetch({ korean: { common: [{ contentid: '126508', overview: '국문 개요' }] } });
    const { details } = await (await request({ ...PLACE, lang: 'ko' })).json();
    assert.deepEqual(services(state.calls), ['korean']);
    assert.equal(details.overview, '국문 개요');
    assert.equal(details.overviewLanguage, 'ko');
  });

  test('en 은 국문+영문을 부르고 영문을 우선한다', async () => {
    const state = stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요', addr1: '서울 강남구' }] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });
    const res = await request(PLACE);
    const { ok, details } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(ok, true);
    assert.deepEqual(services(state.calls), ['english', 'korean']);
    assert.equal(details.overview, 'English overview');
    assert.equal(details.overviewLanguage, 'en');
  });

  test('ja 는 국문+일문을 부르고 일문을 우선한다 — 영문은 부르지 않는다', async () => {
    const state = stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      japanese: { common: [{ contentid: '1265082', overview: '日本語の概要', addr1: 'ソウル江南区' }] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });
    const { details } = await (await request({ ...PLACE, lang: 'ja' })).json();
    assert.deepEqual(services(state.calls), ['japanese', 'korean']);
    assert.equal(details.overview, '日本語の概要');
    assert.equal(details.overviewLanguage, 'ja');
    assert.equal(details.address, 'ソウル江南区');
    assert.ok(details.sources.includes('TourAPI:JpnService2'));
  });

  test('zh 는 중문 간체를 우선한다', async () => {
    stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      chinese: { common: [{ contentid: '1265083', overview: '中文概要' }] },
    });
    const { details } = await (await request({ ...PLACE, lang: 'zh' })).json();
    assert.equal(details.overview, '中文概要');
    assert.equal(details.overviewLanguage, 'zh');
  });

  test('일문 서비스가 실패하면(키 미신청 포함) 영문으로 대체한다', async () => {
    const state = stubFetch({
      failFor: ['JpnService2'],
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });
    const res = await request({ ...PLACE, lang: 'ja' });
    const { details } = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(services(state.calls), ['english', 'japanese', 'korean']);
    assert.equal(details.overview, 'English overview');
    assert.equal(details.overviewLanguage, 'en');
    assert.ok(details.errors.some((e) => e.operation === 'detailCommon2'), '일문 실패가 기록되지 않았다');
  });

  test('중문 원본이 없으면 영문으로, 영문도 없으면 국문으로 대체한다', async () => {
    stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });
    const noZh = { ...PLACE, lang: 'zh', sourceIds: { ko: '126508', en: '264500' }, contentTypeIds: { canonical: '12', ko: '12', en: '76' } };
    assert.equal((await (await request(noZh)).json()).details.overviewLanguage, 'en');

    // 앞 요청이 국문 상세를 캐시했으므로 다른 장소로 확인한다
    const state = stubFetch({ korean: { common: [{ contentid: '126509', overview: '국문 개요' }] } });
    const koOnly = { ...PLACE, lang: 'zh', contentId: '126509', sourceIds: { ko: '126509' }, contentTypeIds: { canonical: '12', ko: '12' } };
    const { details } = await (await request(koOnly)).json();
    assert.deepEqual(services(state.calls), ['korean']);
    assert.equal(details.overview, '국문 개요');
    assert.equal(details.overviewLanguage, 'ko');
  });

  test('선택 언어 서비스가 응답했지만 그 장소 개요가 비었으면 영문으로 대체한다', async () => {
    stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      japanese: { common: [] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });
    const { details } = await (await request({ ...PLACE, lang: 'ja' })).json();
    assert.equal(details.overviewLanguage, 'en');
  });
});

describe('상세 조회 결과', () => {
  test('운영시간 원문이 있어도 영업 여부를 단정하지 않는다 (D04-BR012)', async () => {
    stubFetch({
      korean: {
        common: [{ contentid: '126508', overview: '개요' }],
        intro: [{ contentid: '126508', usetime: '09:00~18:00', restdate: '매주 월요일' }],
      },
    });
    const { details } = await (await request({ ...PLACE, lang: 'ko' })).json();
    assert.equal(details.openNow, null);
    assert.equal(details.openNowReason, 'UNVERIFIED_SCHEDULE_TEXT');
    assert.ok(details.operatingSchedule.usetime);
  });

  test('이미지의 저작권 구분 코드를 함께 반환한다 (D07-POL004)', async () => {
    stubFetch({
      korean: {
        common: [{ contentid: '126508', overview: '개요' }],
        images: [
          { originimgurl: 'https://img/1.jpg', imgname: '전경', cpyrhtDivCd: 'Type1' },
          { originimgurl: 'https://img/2.jpg', cpyrhtDivCd: 'Type3' },
        ],
      },
    });
    const { details } = await (await request({ ...PLACE, lang: 'ko' })).json();
    assert.equal(details.images.length, 2);
    assert.equal(details.images[0].copyrightDivisionCode, 'Type1');
    assert.equal(details.images[1].copyrightDivisionCode, 'Type3');
  });

  test('일부 오퍼레이션이 실패해도 200 으로 남은 정보를 돌려주고 실패를 기록한다', async () => {
    stubFetch({ failFor: ['detailIntro2'], korean: { common: [{ contentid: '126508', overview: '국문 개요' }] } });
    const res = await request({ ...PLACE, lang: 'ko' });
    const { ok, details } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(ok, true);
    assert.equal(details.overview, '국문 개요', '부분 실패가 살아있는 정보까지 지웠다');
    assert.ok(details.errors.length > 0, '실패가 errors 에 기록되지 않았다');
  });

  test('영문 식별자만 있어도 조회한다', async () => {
    stubFetch({ english: { common: [{ contentid: '264500', overview: 'Only english' }] } });
    const res = await request({
      lang: 'en',
      contentId: '264500',
      sourceIds: { en: '264500' },
      contentTypeIds: { canonical: '12', en: '76' },
    });
    const { details } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(details.overview, 'Only english');
  });
});
