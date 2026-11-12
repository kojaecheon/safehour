// 클라이언트 요청 만들기 ↔ 서버 라우트 이음매 (docs/contracts.md '`POST /api/place`'·'`POST /api/itinerary/intro`')
//
// 왜 따로 두나: 두 경로는 지금까지 양쪽이 각자의 리터럴로만 테스트됐다.
//   - 클라이언트: components/trip/viewModel.js 의 요청 만들기 → test/trip-view.test.js (서버 없음)
//   - 서버: app/api/place/route.js → test/place-api.test.js (클라이언트 없음)
// 서버는 엄격하다 — /api/place 는 언어별 (식별자, 유형 코드) 쌍이 짝으로 와야 하고 아니면 400 이다.
// 그런데 화면은 실패를 삼킨다(app/place/[candidateId]/page.js 는 200 이 아니면 안내 문구로 바꾸고,
// components/trip/IntroArea.js 는 오류를 삼킨다). 두 모양이 어긋나도 lint·단위 테스트·빌드·E2E 가 모두 초록이다.
//
// 그래서 여기서는 **진짜 일정 라우트 응답의 Stop·DayPlan** 을 **진짜 클라이언트 요청 만들기** 에 넣고,
// 그 본문을 **진짜 라우트 핸들러** 에 그대로 넘긴다 (test/trip-sync-fixtures.js 가 plan·alternatives 에 쓰는 방식).
// 서버 검증을 느슨하게 해서 통과시키지 않는다 — 어긋나면 클라이언트를 고친다.
//
// 실제 외부 API 를 부르지 않는다. globalThis.fetch 를 fixture 응답으로 바꾼다.

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { introRequestFor, placeDetailRequest } from '../components/trip/viewModel.js';
import { kstClock } from '../src/engine/tripPlan.js';
import { addDays } from '../src/stay/time.js';
import { HOME, SESSION_SECRET, period, postJson, stopsOf } from './itinerary-fixtures.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-seam-'));
const ENV_NAMES = [
  'SAFEHOUR_DATA_ROOT',
  'TOUR_API_KEY',
  'KMA_API_KEY',
  'SAFEHOUR_SESSION_SECRET',
  'SAFEHOUR_AI_INTRO',
  'GEMINI_API_KEY',
];
const savedEnv = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'seam-tour-key';
process.env.KMA_API_KEY = 'seam-kma-key';

let planPost;
let placePost;
let introPost;
let sanitizeIntroRequest;
let TOUR_API_PATHS;
const originalFetch = globalThis.fetch;
let calls = [];

// ── 실제 시계 기준 체류 (라우트는 서버 시계를 쓴다): 오늘 입국, 오늘+4 출국, 오늘+3 수술 ──
const TODAY = kstClock(Date.now()).date;
const D = (n) => addDays(TODAY, n);
const ymd = (date) => date.replaceAll('-', '');

/** 관심사·강도를 허용 목록 값으로 채운다 — 이음매에서 그대로 살아남아야 한다 */
function seamStay() {
  return {
    arrival: { date: D(0), time: '00:30', airport: 'ICN' },
    departure: { date: D(4), time: '23:00', airport: 'ICN' },
    hasCompanion: false,
    interests: ['CAFE', 'SHOPPING'],
    pace: 'NORMAL',
    lodgings: [{ id: 'L1', lat: HOME.lat, lng: HOME.lng, checkIn: D(0), checkOut: D(4) }],
    hospitals: [{ id: 'H1', lat: 37.52, lng: 127.03 }],
    appointments: [{ id: 'A1', hospitalId: 'H1', type: 'PROCEDURE', date: D(3), start: '09:00' }],
    periods: [period({}, { startDate: D(3), endDate: D(4) })],
    consent: { sensitive: true },
  };
}

/** 국문 목록 — 숙소 주변 실내 문화시설·식당 (가상 데이터) */
const KOREAN_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  contentid: String(940001 + i),
  contenttypeid: i % 3 === 2 ? '39' : '14',
  title: i % 3 === 2 ? `이음매 테스트 식당 ${i}` : `이음매 테스트 전시관 ${i}`,
  addr1: `서울특별시 테스트구 이음매로 ${i + 1}`,
  mapx: String(Number((HOME.lng + 0.002 * ((i % 4) - 1.5)).toFixed(6))),
  mapy: String(Number((HOME.lat + 0.002 * (Math.floor(i / 4) - 1)).toFixed(6))),
  modifiedtime: '20260901120000',
  ...(i % 3 === 2 ? { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' } : {}),
}));

/** 일문 목록 — 같은 좌표·대응 유형(14→78, 39→82)이라 20m 좌표 매칭으로 연결된다 */
const JAPANESE_ITEMS = KOREAN_ITEMS.map((item, i) => ({
  ...item,
  contentid: String(950001 + i),
  contenttypeid: item.contenttypeid === '39' ? '82' : '78',
  title: `テスト ${i}`,
  addr1: `1, Test-ro, Seoul`,
}));

function tourBody(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, numOfRows: items.length, pageNo: 1, totalCount: items.length },
    },
  });
}

/** 오늘~모레 매시 맑음 (기상청 단기예보 응답 형식) */
function forecastBody() {
  const item = [];
  for (const date of [D(0), D(1), D(2)]) {
    for (let h = 0; h < 24; h += 1) {
      for (const [category, value] of [['POP', '10'], ['PTY', '0'], ['PCP', '강수없음'], ['TMP', '22']]) {
        item.push({
          baseDate: ymd(D(0)),
          baseTime: '0500',
          category,
          fcstDate: ymd(date),
          fcstTime: `${String(h).padStart(2, '0')}00`,
          fcstValue: value,
          nx: 61,
          ny: 125,
        });
      }
    }
  }
  return JSON.stringify({
    response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { dataType: 'JSON', items: { item } } },
  });
}

/** 목록·상세·기상을 모두 답한다 — 일정 라우트와 장소 라우트가 같은 stub 을 쓴다 */
function stubExternal() {
  calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('getVilageFcst')) return new Response(forecastBody(), { status: 200 });
    if (href.includes('locationBasedList2')) {
      if (href.includes('KorService2')) return new Response(tourBody(KOREAN_ITEMS), { status: 200 });
      if (href.includes('JpnService2')) return new Response(tourBody(JAPANESE_ITEMS), { status: 200 });
      return new Response(tourBody([]), { status: 200 });
    }
    if (href.includes('detailCommon2')) {
      const id = new URL(href).searchParams.get('contentId');
      return new Response(tourBody([{ contentid: id, overview: '개요', addr1: '서울특별시 테스트구' }]), { status: 200 });
    }
    if (href.includes('detailIntro2')) {
      const id = new URL(href).searchParams.get('contentId');
      return new Response(tourBody([{ contentid: id, usetime: '09:00~18:00', restdate: '연중무휴', firstmenu: '비빔밥' }]), {
        status: 200,
      });
    }
    return new Response(tourBody([]), { status: 200 });
  };
}

before(async () => {
  ({ POST: planPost } = await import('../app/api/itinerary/plan/route.js'));
  ({ POST: placePost } = await import('../app/api/place/route.js'));
  ({ POST: introPost } = await import('../app/api/itinerary/intro/route.js'));
  ({ sanitizeIntroRequest } = await import('../lib/server/ai-intro.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

beforeEach(() => {
  process.env.SAFEHOUR_SESSION_SECRET = SESSION_SECRET;
  process.env.KMA_API_KEY = 'seam-kma-key';
  // AI 는 꺼진 상태가 기본이다. 소개 문장은 템플릿이어야 하고 외부 호출이 없어야 한다 (docs/business-rules.md 'AI 소개 문장')
  delete process.env.SAFEHOUR_AI_INTRO;
  delete process.env.GEMINI_API_KEY;
  for (const dir of [TOUR_API_PATHS.logs, TOUR_API_PATHS.cache]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  stubExternal();
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

/** 본문을 한 번만 읽는다 — 상태 코드가 틀리면 본문을 그대로 보여준다 */
async function jsonOf(res, expectedStatus = 200) {
  const text = await res.text();
  assert.equal(res.status, expectedStatus, text);
  return JSON.parse(text);
}

/** 진짜 일정 라우트 응답 — 정거장이 있는 첫 날짜 */
async function planDays(lang) {
  const res = await planPost(postJson('/api/itinerary/plan', { lang, stay: seamStay() }));
  const data = await jsonOf(res);
  assert.equal(data.ok, true);
  const entry = Object.entries(data.days)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .find(([, day]) => stopsOf(day).length > 0);
  assert.ok(entry, '정거장이 있는 날짜가 있어야 한다');
  return { date: entry[0], day: entry[1] };
}

describe('POST /api/place — 클라이언트가 만든 본문을 서버가 그대로 받는다', () => {
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    test(`${lang}: 일정 라우트의 Stop → placeDetailRequest → 장소 라우트 200`, async () => {
      const { day } = await planDays(lang);
      const stop = stopsOf(day)[0];
      const request = placeDetailRequest(stop, lang);

      // 클라이언트가 보내는 것은 계약에 적힌 네 필드뿐이다 (docs/contracts.md '`POST /api/place`')
      assert.deepEqual(Object.keys(request).sort(), ['contentId', 'contentTypeIds', 'lang', 'sourceIds']);
      // 서버가 요구하는 (식별자, 유형 코드) 짝이 실제로 들어 있다
      const paired = ['ko', 'en', 'ja', 'zh'].filter((k) => request.sourceIds[k] && request.contentTypeIds[k]);
      assert.ok(paired.length > 0, `짝이 맞는 식별자가 없다: ${JSON.stringify(request)}`);

      calls = [];
      const data = await jsonOf(await placePost(postJson('/api/place', request)));
      assert.equal(data.ok, true);
      assert.ok(data.details && typeof data.details === 'object');
      assert.ok(calls.some((c) => c.includes('detailCommon2')), '상세를 실제로 조회한다');
    });
  }

  test('ja: 일문 항목이 매칭되면 일문 서비스도 함께 조회한다', async () => {
    const { day } = await planDays('ja');
    const stop = stopsOf(day).find((s) => s.sourceIds?.ja);
    assert.ok(stop, '일문 식별자가 붙은 정거장이 있어야 한다');
    const request = placeDetailRequest(stop, 'ja');
    assert.ok(request.contentTypeIds.ja, '일문 식별자에는 일문 유형 코드가 짝으로 있어야 한다');

    calls = [];
    await jsonOf(await placePost(postJson('/api/place', request)));
    assert.ok(calls.some((c) => c.includes('KorService2')));
    assert.ok(calls.some((c) => c.includes('JpnService2')));
  });
});

describe('POST /api/itinerary/intro — 클라이언트가 만든 본문을 서버가 그대로 받는다', () => {
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    test(`${lang}: 일정 라우트의 DayPlan → introRequestFor → 소개 라우트 200 + 템플릿`, async () => {
      const { day } = await planDays(lang);
      const stay = seamStay();
      const request = introRequestFor(day, stay, lang);
      assert.ok(request, '환자 정거장이 있으면 소개 요청을 만든다');
      assert.deepEqual(Object.keys(request).sort(), ['interests', 'lang', 'pace', 'stops']);

      // 서버의 허용 목록을 지나도 정거장·관심사·강도가 하나도 깎이지 않는다
      const parsed = sanitizeIntroRequest(request);
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.input.stops, request.stops, '이름·유형·도착 시각이 그대로 남아야 한다');
      assert.deepEqual(parsed.input.interests, stay.interests);
      assert.equal(parsed.input.pace, stay.pace);

      calls = [];
      const data = await jsonOf(await introPost(postJson('/api/itinerary/intro', request)));
      assert.deepEqual(Object.keys(data).sort(), ['ok', 'source', 'text']);
      assert.equal(data.ok, true);
      assert.equal(data.source, 'TEMPLATE', 'AI 가 꺼져 있으면 템플릿이다');
      assert.ok(data.text.includes(request.stops[0].title), '서버가 클라이언트의 장소 이름을 받았다');
      assert.equal(calls.length, 0, '소개 문장은 외부를 부르지 않는다');
    });
  }
});
