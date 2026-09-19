// AX-002 · AX-308 — 내부 API 계약 테스트: 일정 API (spec 6장)
//
// 단일 외출 API(POST /api/recommend·/api/recalculate·/api/today)는 퇴역했다. 이 파일이 그 계약 테스트를 대신한다.
//
// 계약
//   - 응답 본문은 항상 { ok: boolean, ... } 이며, 실패 시 { ok:false, errorCode, message, ... }
//   - 로그인 세션이 없으면 401 { ok:false, errorCode:'SAFEHOUR_AUTH_REQUIRED', message } — 외부 호출 없음
//   - 400 입력 무효(SAFEHOUR_BAD_REQUEST + field, SAFEHOUR_STAY_INVALID + fields·issues) — 외부 호출 없음
//   - plan: { ok, engineVersion, days: Record<date, DayPlan>, diagnostics: { candidateCount, travelTimeSource, weather } }
//   - alternatives: { ok, alternatives: Array<{ stop, outingPreview }> } (최대 5)
//   - 관광 후보는 실제 호출 경로(callTourApi, 캐시 사용)로 조회한다 — E2E 캐시 시드가 같은 경로로 적중한다
//   - 현재 위치류 필드는 버린다. 외부로 나가는 좌표는 사용자가 고른 숙소 좌표뿐이다
//
// 실제 외부 API 를 부르지 않는다. globalThis.fetch 를 fixture 응답으로 바꾼다.

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { kstClock } from '../src/engine/tripPlan.js';
import { addDays } from '../src/stay/time.js';
import { HOME, SESSION_SECRET, body, period, postJson, stopsOf } from './itinerary-fixtures.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-api-contract-'));
const ENV_NAMES = ['SAFEHOUR_DATA_ROOT', 'TOUR_API_KEY', 'KMA_API_KEY', 'SAFEHOUR_SESSION_SECRET', 'SAFEHOUR_KILL_RECOMMENDATION'];
const savedEnv = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'contract-tour-key';
process.env.KMA_API_KEY = 'contract-kma-key';

let planPost;
let alternativesPost;
let TOUR_API_PATHS;
const originalFetch = globalThis.fetch;
let calls = [];

// ── 실제 시계 기준 체류: 오늘 입국, 오늘+4 출국, 오늘+3 수술 ─────────────────
const TODAY = kstClock(Date.now()).date;
const D = (n) => addDays(TODAY, n);
const ymd = (date) => date.replaceAll('-', '');

function contractStay() {
  return {
    arrival: { date: D(0), time: '00:30', airport: 'ICN' },
    departure: { date: D(4), time: '23:00', airport: 'ICN' },
    hasCompanion: false,
    interests: [],
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
  contentid: String(930001 + i),
  contenttypeid: i % 3 === 2 ? '39' : '14',
  title: i % 3 === 2 ? `계약 테스트 식당 ${i}` : `계약 테스트 전시관 ${i}`,
  addr1: `서울특별시 테스트구 계약로 ${i + 1}`,
  mapx: String(Number((HOME.lng + 0.002 * ((i % 4) - 1.5)).toFixed(6))),
  mapy: String(Number((HOME.lat + 0.002 * (Math.floor(i / 4) - 1)).toFixed(6))),
  modifiedtime: '20260901120000',
  ...(i % 3 === 2 ? { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' } : {}),
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
        item.push({ baseDate: ymd(D(0)), baseTime: '0500', category, fcstDate: ymd(date), fcstTime: `${String(h).padStart(2, '0')}00`, fcstValue: value, nx: 61, ny: 125 });
      }
    }
  }
  return JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { dataType: 'JSON', items: { item } } } });
}

function stubExternal() {
  calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('getVilageFcst')) return new Response(forecastBody(), { status: 200 });
    if (href.includes('locationBasedList2')) {
      return new Response(tourBody(href.includes('KorService2') ? KOREAN_ITEMS : []), { status: 200 });
    }
    if (href.includes('detailIntro2')) {
      const id = new URL(href).searchParams.get('contentId');
      return new Response(tourBody([{ contentid: id, usetime: '09:00~18:00', restdate: '연중무휴', firstmenu: '비빔밥' }]), { status: 200 });
    }
    return new Response(tourBody([]), { status: 200 });
  };
}

before(async () => {
  ({ POST: planPost } = await import('../app/api/itinerary/plan/route.js'));
  ({ POST: alternativesPost } = await import('../app/api/itinerary/alternatives/route.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

beforeEach(() => {
  process.env.SAFEHOUR_SESSION_SECRET = SESSION_SECRET;
  process.env.KMA_API_KEY = 'contract-kma-key';
  delete process.env.SAFEHOUR_KILL_RECOMMENDATION;
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

const DAY_KEYS = [
  'blocks',
  'coverage',
  'date',
  'dayState',
  'effective',
  'excluded',
  'guardianOutings',
  'lodgingId',
  'mealSlots',
  'outings',
  'reasons',
  'returnNow',
  'transportMode',
  'warnings',
  'window',
];
const STOP_KEYS = [
  'address',
  'arriveAt',
  'candidateId',
  'category',
  'contentId',
  'contentTypeIds',
  'id',
  'indoor',
  'isMeal',
  'ko',
  'labels',
  'lang',
  'lat',
  'leaveAt',
  'legIn',
  'lng',
  'pinned',
  'shortened',
  'sourceIds',
  'stayMin',
  'title',
  'walkBurdenMin',
];

describe('로그인 가드 (401 SAFEHOUR_AUTH_REQUIRED)', () => {
  for (const [name, call] of [
    ['plan', () => planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() }, { cookie: false }))],
    ['alternatives', () => alternativesPost(postJson('/api/itinerary/alternatives', { lang: 'en' }, { cookie: false }))],
  ]) {
    test(`${name}: 세션 없음 → 401, 외부 호출 없음`, async () => {
      const res = await call();
      assert.equal(res.status, 401);
      const data = await body(res);
      assert.deepEqual(Object.keys(data).sort(), ['errorCode', 'message', 'ok']);
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, 'SAFEHOUR_AUTH_REQUIRED');
      assert.equal(calls.length, 0);
    });
  }

  test('위조된 세션 쿠키도 401 이다', async () => {
    const res = await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() }, { cookie: 'safehour_session=forged.value' }));
    assert.equal(res.status, 401);
  });
});

describe('POST /api/itinerary/plan — 400 (외부 호출 전 차단)', () => {
  const cases = [
    ['JSON 이 아님', '{{', 'SAFEHOUR_BAD_REQUEST', 'body'],
    ['null 본문', 'null', 'SAFEHOUR_BAD_REQUEST', 'body'],
    ['배열 본문', '[]', 'SAFEHOUR_BAD_REQUEST', 'body'],
    ['lang 없음', { stay: contractStay() }, 'SAFEHOUR_BAD_REQUEST', 'lang'],
    ['dates 형식', { lang: 'en', stay: contractStay(), dates: 'today' }, 'SAFEHOUR_BAD_REQUEST', 'dates'],
    ['모르는 데모 사건', { lang: 'en', stay: contractStay(), events: [{ type: 'EARTHQUAKE' }] }, 'SAFEHOUR_BAD_REQUEST', 'events[0].type'],
    ['데모 사건 매개변수', { lang: 'en', stay: contractStay(), events: [{ type: 'TRAFFIC_SURGE', extraMin: 500 }] }, 'SAFEHOUR_BAD_REQUEST', 'events[0].extraMin'],
    ['previous 형식', { lang: 'en', stay: contractStay(), previous: { [D(1)]: { date: D(1) } } }, 'SAFEHOUR_BAD_REQUEST', `previous.${D(1)}.coverage`],
    ['edits 형식', { lang: 'en', stay: contractStay(), edits: [] }, 'SAFEHOUR_BAD_REQUEST', 'edits'],
  ];
  for (const [name, payload, errorCode, field] of cases) {
    test(`${name} → 400 ${errorCode} (${field})`, async () => {
      const res = await planPost(postJson('/api/itinerary/plan', payload));
      assert.equal(res.status, 400);
      const data = await body(res);
      assert.deepEqual(Object.keys(data).sort(), ['errorCode', 'field', 'message', 'ok']);
      assert.equal(data.ok, false);
      assert.equal(data.errorCode, errorCode);
      assert.equal(data.field, field);
      assert.equal(calls.length, 0);
    });
  }

  test('체류 검증 실패 → 400 SAFEHOUR_STAY_INVALID { fields, issues }', async () => {
    const stay = { ...contractStay(), appointments: [], lodgings: [{ id: 'L1', lat: 48.85, lng: 2.35, checkIn: D(0), checkOut: D(4) }] };
    const res = await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay }));
    assert.equal(res.status, 400);
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['errorCode', 'fields', 'issues', 'message', 'ok']);
    assert.equal(data.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(data.fields.includes('appointments'));
    assert.ok(data.issues.some((i) => i.field === 'lodgings[0].lat' && i.code === 'OUT_OF_RANGE'));
    assert.equal(calls.length, 0);
  });
});

describe('POST /api/itinerary/plan — 200', () => {
  test('응답 키와 DayPlan·Stop 필드가 spec 5.2·6장과 같다', async () => {
    const res = await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay(), now: '1999-01-01T00:00:00Z' }));
    assert.equal(res.status, 200);
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['days', 'diagnostics', 'engineVersion', 'ok']);
    assert.equal(data.ok, true);
    assert.match(data.engineVersion, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(Object.keys(data.days), [D(0), D(1), D(2), D(3), D(4)]);
    for (const day of Object.values(data.days)) {
      assert.deepEqual(Object.keys(day).filter((k) => k !== 'delta' && k !== 'intro').sort(), DAY_KEYS);
    }
    const stops = Object.values(data.days).flatMap(stopsOf);
    assert.ok(stops.length > 0, '정거장이 하나도 없다');
    for (const stop of stops) assert.deepEqual(Object.keys(stop).filter((k) => k !== 'image').sort(), STOP_KEYS);

    assert.deepEqual(Object.keys(data.diagnostics).sort(), ['candidateCount', 'travelTimeSource', 'weather']);
    assert.equal(data.diagnostics.candidateCount, KOREAN_ITEMS.length);
    assert.equal(data.diagnostics.travelTimeSource, 'fallback');
    assert.equal(data.diagnostics.weather.source, 'kma-short-term');
    assert.deepEqual(Object.keys(data.diagnostics.weather.byDate), [D(0), D(1), D(2)]);
  });

  test('후보 목록은 숙소 한 곳에 서비스마다 한 번, 캐시 경로로 조회한다(두 번째 요청은 외부 호출 0건)', async () => {
    await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() }));
    const lists = calls.filter((u) => u.includes('locationBasedList2'));
    assert.equal(lists.length, 3, `목록 호출: ${lists.length}`); // 국문·무장애·영문
    for (const u of lists) {
      const q = new URL(u).searchParams;
      assert.equal(q.get('radius'), '10000');
      assert.equal(q.get('mapY'), String(HOME.lat));
      assert.equal(q.get('mapX'), String(HOME.lng));
    }
    assert.equal(calls.filter((u) => u.includes('getVilageFcst')).length, 1);

    calls = [];
    await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() }));
    assert.equal(calls.filter((u) => u.includes('apis.data.go.kr/B551011')).length, 0, '캐시를 쓰지 않았다');
  });

  test('현재 위치류 필드는 버린다 — 외부로 나가는 좌표는 숙소 좌표뿐이다 (규칙 46)', async () => {
    const res = await planPost(
      postJson('/api/itinerary/plan', {
        lang: 'en',
        stay: { ...contractStay(), currentLocation: { lat: 37.3333333, lng: 127.4444444 } },
        currentLocation: { lat: 37.3333333, lng: 127.4444444 },
        gpsLat: 37.3333333,
      }),
    );
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(calls.join('\n').includes('37.3333333'), false);
    assert.equal(calls.join('\n').includes('127.4444444'), false);
    assert.equal(text.includes('37.3333333'), false);
  });

  test('KMA_API_KEY 를 비우면 기상청을 부르지 않고 확인 불가로 둔다', async () => {
    process.env.KMA_API_KEY = ' ';
    const data = await body(await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() })));
    assert.equal(calls.filter((u) => u.includes('getVilageFcst')).length, 0);
    assert.equal(data.diagnostics.weather.source, 'unavailable');
    assert.ok(Object.values(data.diagnostics.weather.byDate).every((v) => v.outdoorUnsafe === null));
  });

  test('관광 목록 조회가 실패하면 502 SAFEHOUR_EXTERNAL_API', async () => {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes('KorService2')) return new Response('{}', { status: 500 });
      return new Response(tourBody([]), { status: 200 });
    };
    const res = await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() }));
    assert.equal(res.status, 502);
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['errorCode', 'message', 'ok']);
    assert.equal(data.errorCode, 'SAFEHOUR_EXTERNAL_API');
  });
});

describe('POST /api/itinerary/alternatives', () => {
  async function plannedDay() {
    const data = await body(await planPost(postJson('/api/itinerary/plan', { lang: 'en', stay: contractStay() })));
    const day = Object.values(data.days).find((d) => d.date > TODAY && d.outings.length > 0);
    assert.ok(day, '교체할 외출이 있는 날이 없다');
    return day;
  }

  test('200 { ok, alternatives: [{ stop, outingPreview }] } (최대 5)', async () => {
    const day = await plannedDay();
    const outing = day.outings[0];
    const res = await alternativesPost(
      postJson('/api/itinerary/alternatives', {
        lang: 'en',
        stay: contractStay(),
        date: day.date,
        outingId: outing.id,
        stopId: outing.stops[0].id,
        day,
        usedContentIds: [],
        now: '1999-01-01T00:00:00Z',
      }),
    );
    assert.equal(res.status, 200);
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['alternatives', 'ok']);
    assert.ok(Array.isArray(data.alternatives) && data.alternatives.length <= 5);
    for (const alt of data.alternatives) {
      assert.deepEqual(Object.keys(alt).sort(), ['outingPreview', 'stop']);
      assert.deepEqual(Object.keys(alt.stop).filter((k) => k !== 'image').sort(), STOP_KEYS);
    }
  });

  test('필수 필드가 없으면 400 SAFEHOUR_BAD_REQUEST(field)', async () => {
    const day = await plannedDay();
    calls = [];
    const res = await alternativesPost(postJson('/api/itinerary/alternatives', { lang: 'en', stay: contractStay(), date: day.date, day }));
    assert.equal(res.status, 400);
    const data = await body(res);
    assert.equal(data.errorCode, 'SAFEHOUR_BAD_REQUEST');
    assert.equal(data.field, 'outingId');
    assert.equal(calls.length, 0);
  });
});
