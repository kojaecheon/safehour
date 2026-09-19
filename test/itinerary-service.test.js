// AX-308 — 일정 API 동작 (spec 4.8 후보 조회, 4.9 기상, 4.1 공항 이동, 6장, 규칙 46·54)
//
// 외부 데이터(관광공사·기상청)는 가짜 의존성으로 대신한다. 실제 호출 0건.
//   - 후보는 숙소 기준점·반경 10km·언어 조합마다 한 번만 조회한다
//   - 상세(메뉴·운영) 보강은 일정에 들어간 후보와 식사 칸을 채울 수 있는 식당(메뉴 모름)에만 한다
//   - 기상은 오늘~모레, 숙소 좌표로 조회한다. 실패하면 '확인 불가'이고 판정에 반영하지 않는다
//   - 공항 이동은 서버가 고정 공항 좌표와 기존 택시 추정기로 계산한다
//   - 현재 위치류 필드·PlanStay 밖 필드는 엔진·후보 조회·응답 어디에도 가지 않는다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { AIRPORT_POINTS, airportTravelMinutes } from '../lib/server/airports.js';
import { CANDIDATE_RADIUS_M, createItineraryHandlers } from '../lib/server/itinerary-service.js';
import { createFallbackEstimator } from '../src/adapters/travelTime.js';
import { SilentReplanError, planTrip } from '../src/engine/tripPlan.js';
import { alternativesFor as realAlternatives } from '../src/engine/alternatives.js';
import { museum, place } from './day-plan-fixtures.js';
import { SET } from './stay-fixtures.js';
import { park } from './trip-fixtures.js';
import {
  HOME,
  at,
  body,
  fakeEnrich,
  fakeForecast,
  fakeLoader,
  period,
  planStay,
  postJson,
  stopsOf,
  tripPool,
} from './itinerary-fixtures.js';


const NOW = at('2026-10-02', '08:00'); // 10-02 은 체류 둘째 날(자유일)

function setup({ pool, forecast = fakeForecast(), enrich = fakeEnrich(), now = NOW, engine, env = { KMA_API_KEY: 'kma-test' } } = {}) {
  const loader = fakeLoader(pool);
  const handlers = createItineraryHandlers({
    clock: () => new Date(now),
    loadCandidates: loader.load,
    enrichIntros: enrich.enrich,
    fetchForecast: forecast.fetchForecast,
    env,
    killSwitch: () => false,
    ...(engine ? { engine } : {}),
  });
  return { handlers, loader, forecast, enrich };
}

const plan = (h, payload) => h.plan(postJson('/api/itinerary/plan', payload));

describe('일정 생성 응답 계약', () => {
  test('{ ok, engineVersion, days, diagnostics:{candidateCount, travelTimeSource, weather} }', async () => {
    const { handlers } = setup();
    const res = await plan(handlers, { lang: 'en', stay: planStay() });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['days', 'diagnostics', 'engineVersion', 'ok']);
    assert.equal(data.ok, true);
    assert.equal(data.engineVersion, '2.0.0');
    assert.equal(Object.keys(data.days).length, 10);
    assert.deepEqual(Object.keys(data.diagnostics).sort(), ['candidateCount', 'travelTimeSource', 'weather']);
    assert.equal(data.diagnostics.candidateCount, 60);
    assert.equal(data.diagnostics.travelTimeSource, 'fallback');
    assert.deepEqual(Object.keys(data.diagnostics.weather).sort(), ['byDate', 'source']);
    assert.ok(Object.values(data.days).some((d) => stopsOf(d).length > 0));
  });

  test('같은 입력은 같은 결과다(결정적)', async () => {
    const a = await body(await plan(setup().handlers, { lang: 'en', stay: planStay() }));
    const b = await body(await plan(setup().handlers, { lang: 'en', stay: planStay() }));
    assert.deepEqual(a, b);
  });

  test('dates 가 있으면 그 날짜만 돌려준다(체류 밖 날짜는 무시)', async () => {
    const data = await body(await plan(setup().handlers, { lang: 'en', stay: planStay(), dates: ['2026-10-05', '2026-11-30'] }));
    assert.deepEqual(Object.keys(data.days), ['2026-10-05']);
  });
});

describe('후보 조회 — 숙소 기준점·10km·언어마다 한 번 (spec 4.8)', () => {
  test('숙소 하나면 한 번, 사용자가 고른 숙소 좌표와 반경 10km·선택 언어로 조회한다', async () => {
    const { handlers, loader } = setup();
    await plan(handlers, { lang: 'ja', stay: planStay() });
    assert.equal(CANDIDATE_RADIUS_M, 10000);
    assert.equal(loader.calls.length, 1);
    const q = loader.calls[0];
    assert.deepEqual(q.origin, { kind: 'USER_SELECTED_FIXED', lat: HOME.lat, lng: HOME.lng });
    assert.equal(q.radiusMeters, 10000);
    assert.equal(q.lang, 'ja');
    assert.equal(q.useCache, true);
  });

  test('숙소가 둘이면 두 번, 같은 좌표면 한 번이다', async () => {
    const two = planStay({
      lodgings: [
        { id: 'L1', lat: HOME.lat, lng: HOME.lng, checkIn: '2026-10-01', checkOut: '2026-10-05' },
        { id: 'L2', lat: 37.55, lng: 126.99, checkIn: '2026-10-05', checkOut: '2026-10-10' },
      ],
    });
    const a = setup();
    const data = await body(await plan(a.handlers, { lang: 'en', stay: two }));
    assert.equal(a.loader.calls.length, 2);
    assert.equal(data.days['2026-10-06'].lodgingId, 'L2');

    const same = planStay({
      lodgings: [
        { id: 'L1', lat: HOME.lat, lng: HOME.lng, checkIn: '2026-10-01', checkOut: '2026-10-05' },
        { id: 'L2', lat: HOME.lat, lng: HOME.lng, checkIn: '2026-10-05', checkOut: '2026-10-10' },
      ],
    });
    const b = setup();
    await plan(b.handlers, { lang: 'en', stay: same });
    assert.equal(b.loader.calls.length, 1);
  });

  test('요청 날짜의 숙소만 조회한다', async () => {
    const two = planStay({
      lodgings: [
        { id: 'L1', lat: HOME.lat, lng: HOME.lng, checkIn: '2026-10-01', checkOut: '2026-10-05' },
        { id: 'L2', lat: 37.55, lng: 126.99, checkIn: '2026-10-05', checkOut: '2026-10-10' },
      ],
    });
    const { handlers, loader } = setup();
    await plan(handlers, { lang: 'en', stay: two, dates: ['2026-10-07'] });
    assert.equal(loader.calls.length, 1);
    assert.equal(loader.calls[0].origin.lat, 37.55);
  });

  test('후보 조회가 실패하면 502 SAFEHOUR_EXTERNAL_API — 빈 후보로 일정을 만들지 않는다', async () => {
    const handlers = createItineraryHandlers({
      clock: () => new Date(NOW),
      loadCandidates: async () => {
        throw new Error('TourAPI 오류 30: SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
      },
      enrichIntros: fakeEnrich().enrich,
      fetchForecast: fakeForecast().fetchForecast,
      env: {},
      killSwitch: () => false,
    });
    const res = await plan(handlers, { lang: 'en', stay: planStay() });
    assert.equal(res.status, 502);
    const data = await body(res);
    assert.equal(data.ok, false);
    assert.equal(data.errorCode, 'SAFEHOUR_EXTERNAL_API');
    assert.equal(JSON.stringify(data).includes('SERVICE_KEY'), false);
  });
});

describe('상세(메뉴·운영) 보강 — 필요한 후보에만 (spec 4.8 호출 방식)', () => {
  test('일정에 들어간 후보만 보강하고, 전체 후보를 보강하지 않는다', async () => {
    const { handlers, enrich } = setup();
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay() }));
    const placed = new Set(
      Object.values(data.days)
        .filter((d) => d.date >= '2026-10-02')
        .flatMap((d) => stopsOf(d).map((s) => s.contentId)),
    );
    assert.ok(enrich.requested.length > 0, '배치된 후보를 보강하지 않았다');
    assert.ok(enrich.requested.length < 60, '전체 후보를 보강했다');
    assert.equal(new Set(enrich.requested).size, enrich.requested.length, '같은 후보를 두 번 보강했다');
    // 첫 배치 기준으로 골랐으므로 최종 배치와 조금 다를 수 있다 — 그래도 모두 한 번은 배치된 후보이거나 식당이다
    const pool = new Map(tripPool('en', 60).map((c) => [c.id, c]));
    for (const id of enrich.requested) {
      assert.ok(placed.has(id) || pool.get(id)?.signals.isFoodPlace, `필요 없는 후보를 보강했다: ${id}`);
    }
  });

  test('매운 음식 제한일에 메뉴를 모르는 식당만 있으면, 식당 몇 곳의 메뉴를 확인해 식사 칸을 채운다', async () => {
    const food = (id, north, east) =>
      place(id, {
        title: `테스트 식당 ${id}`,
        type: '39',
        lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' },
        north,
        east,
      });
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => museum(String(7000 + i), { title: `테스트 전시관 ${i}`, north: 0.3 + i * 0.05, east: 0.2 })),
      ...Array.from({ length: 30 }, (_, i) => food(String(8000 + i), -0.3 - i * 0.05, 0.1)),
    ];
    const stay = planStay({
      periods: [period({ diet: { spicy: SET(true) } }, { startDate: '2026-10-04', endDate: '2026-10-10' })],
    });
    const before = planTrip({
      stay,
      candidatesByLodging: { L1: pool },
      airportTravel: airportTravelMinutes(stay),
      now: NOW,
    });
    const filled = (days) =>
      Object.values(days)
        .filter((d) => d.date >= '2026-10-04')
        .flatMap((d) => d.mealSlots)
        .filter((m) => m.status === 'FILLED').length;
    assert.equal(filled(before.days), 0, '보강 전에는 메뉴를 모르는 식당이 모두 빠져야 한다');

    const { handlers, enrich } = setup({ pool });
    const data = await body(await plan(handlers, { lang: 'en', stay }));
    assert.ok(filled(data.days) > 0, '메뉴 확인 후에도 식사 칸이 비었다');
    const restaurants = enrich.requested.filter((id) => id.startsWith('80'));
    assert.ok(restaurants.length > 0 && restaurants.length <= 12, `식당 확인 수: ${restaurants.length}`);
  });
});

describe('기상 단기예보 — 오늘~모레 (spec 4.9 변화 원천 4, 6장)', () => {
  const mixed = [
    ...Array.from({ length: 30 }, (_, i) => museum(String(6000 + i), { title: `테스트 실내 ${i}`, north: 0.3 + (i % 10) * 0.1, east: (i % 3) * 0.2 })),
    ...Array.from({ length: 30 }, (_, i) => park(String(6100 + i), { title: `테스트 공원 ${i}`, north: -0.3 - (i % 10) * 0.1, east: (i % 3) * 0.2 })),
  ];

  test('오늘~모레 날짜만, 그날 숙소 좌표로, 기상청 키로 조회한다', async () => {
    const { handlers, forecast } = setup({ pool: mixed });
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay() }));
    assert.equal(forecast.calls.length, 1);
    assert.deepEqual(forecast.calls[0].dates, ['2026-10-02', '2026-10-03', '2026-10-04']);
    assert.equal(forecast.calls[0].lat, HOME.lat);
    assert.equal(forecast.calls[0].serviceKey, 'kma-test');
    assert.equal(data.diagnostics.weather.source, 'kma-short-term');
    assert.deepEqual(Object.keys(data.diagnostics.weather.byDate), ['2026-10-02', '2026-10-03', '2026-10-04']);
  });

  test('실외 부적합 예보인 날은 실외 정거장이 없다', async () => {
    const forecast = fakeForecast((d) => d === '2026-10-03');
    const { handlers } = setup({ pool: mixed, forecast });
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay() }));
    assert.deepEqual(data.diagnostics.weather.byDate['2026-10-03'], { outdoorUnsafe: true });
    const rainy = stopsOf(data.days['2026-10-03']);
    assert.ok(rainy.length > 0);
    assert.ok(rainy.every((s) => s.indoor === true), '비 오는 날 실외 정거장이 있다');
  });

  test('예보를 못 받으면 확인 불가이고 판정에 반영하지 않는다(맑음 결과와 같다)', async () => {
    const failing = {
      calls: [],
      fetchForecast: async ({ dates }) => ({
        source: 'kma-short-term',
        byDate: Object.fromEntries(dates.map((d) => [d, { outdoorUnsafe: null }])),
        unknown: true,
        degraded: true,
        error: 'HTTP_500',
      }),
    };
    const unknown = await body(await plan(setup({ pool: mixed, forecast: failing }).handlers, { lang: 'en', stay: planStay() }));
    const clear = await body(await plan(setup({ pool: mixed }).handlers, { lang: 'en', stay: planStay() }));
    assert.deepEqual(unknown.days, clear.days);
    assert.deepEqual(unknown.diagnostics.weather.byDate['2026-10-02'], { outdoorUnsafe: null });
  });

  test('오늘~모레가 요청에 없으면 조회하지 않는다', async () => {
    const { handlers, forecast } = setup();
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay(), dates: ['2026-10-08'] }));
    assert.equal(forecast.calls.length, 0);
    assert.deepEqual(data.diagnostics.weather, { source: 'none', byDate: {} });
  });
});

describe('공항 이동 — 고정 공항 좌표와 택시 추정기 (spec 4.1)', () => {
  test('공항 좌표는 AIP 기준점이다', () => {
    assert.deepEqual(AIRPORT_POINTS.ICN, { lat: 37.4625, lng: 126.439167 });
    assert.deepEqual(AIRPORT_POINTS.GMP, { lat: 37.556944, lng: 126.7975 });
  });

  test('입국일 시작 = 도착 + 입국 수속 90분 + 인천공항→숙소 추정', async () => {
    const estimate = createFallbackEstimator().estimate(AIRPORT_POINTS.ICN, HOME).min;
    const expectedStart = 6 * 60 + 90 + Math.ceil(estimate);
    const { handlers } = setup({ now: at('2026-09-30', '10:00') });
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay(), dates: ['2026-10-01'] }));
    const window = data.days['2026-10-01'].window;
    const pad = (n) => String(n).padStart(2, '0');
    assert.equal(window.start, `${pad(Math.floor(expectedStart / 60))}:${pad(expectedStart % 60)}`);
  });

  test('김포 출국은 김포 좌표로 계산한다', () => {
    const stay = planStay({ departure: { date: '2026-10-10', time: '23:00', airport: 'GMP' } });
    const t = airportTravelMinutes(stay);
    assert.equal(t.lodgingToAirportMin, Math.ceil(createFallbackEstimator().estimate(HOME, AIRPORT_POINTS.GMP).min));
    assert.ok(t.lodgingToAirportMin < t.airportToLodgingMin, '김포가 인천보다 가깝다');
  });
});

describe('허용 목록 밖·현재 위치 필드는 어디에도 가지 않는다 (규칙 46·54)', () => {
  test('엔진·후보 조회·기상 조회·응답에 이름·주소·전화·코드·현재 위치가 없다', async () => {
    const seen = [];
    const engine = {
      planTrip: (input) => {
        seen.push(input);
        return planTrip(input);
      },
      alternativesFor: realAlternatives,
    };
    const { handlers, loader, forecast } = setup({ engine });
    const s = planStay();
    const payload = {
      lang: 'en',
      currentLocation: { lat: 37.3333333, lng: 127.4444444 },
      gps: { latitude: 37.3333333 },
      stay: {
        ...s,
        currentPosition: { lat: 37.3333333 },
        lodgings: s.lodgings.map((l) => ({ ...l, name: '가상 호텔 명동', address: { roadAddress: '가상로 1' }, phone: '02-111-2222' })),
        hospitals: s.hospitals.map((h) => ({ ...h, name: '가상 병원', phone: '02-333-4444' })),
        linkedPlans: [{ code: 'DEMO-A', plan: {} }],
      },
    };
    const res = await plan(handlers, payload);
    assert.equal(res.status, 200);
    const text = [JSON.stringify(seen), JSON.stringify(loader.calls), JSON.stringify(forecast.calls), await res.text()].join('\n');
    for (const marker of ['37.3333333', '127.4444444', '가상 호텔 명동', '가상로 1', '02-111-2222', '가상 병원', '02-333-4444', 'DEMO-A']) {
      assert.equal(text.includes(marker), false, `${marker} 가 흘러갔다`);
    }
    assert.ok(loader.calls.every((q) => q.origin.lat === HOME.lat && q.origin.lng === HOME.lng));
  });
});

describe('표시만 다시 쓰기 (relabelOnly, 규칙 51)', () => {
  test('previous 의 표시만 새 언어로 바꾸고, 기상·보강을 부르지 않는다', async () => {
    const first = await body(await plan(setup({ pool: tripPool('en', 60) }).handlers, { lang: 'en', stay: planStay() }));
    const { handlers, forecast, enrich } = setup({ pool: tripPool('ja', 60) });
    const res = await plan(handlers, { lang: 'ja', stay: planStay(), previous: first.days, relabelOnly: true });
    const data = await body(res);
    assert.equal(res.status, 200);
    assert.equal(forecast.calls.length, 0);
    assert.equal(enrich.requested.length, 0);
    const date = '2026-10-03';
    const before = stopsOf(first.days[date]);
    const after = stopsOf(data.days[date]);
    assert.deepEqual(
      after.map((s) => [s.contentId, s.arriveAt, s.leaveAt]),
      before.map((s) => [s.contentId, s.arriveAt, s.leaveAt]),
    );
    assert.equal(data.days[date].dayState, first.days[date].dayState);
    assert.equal(data.days[date].delta, undefined);
    assert.ok(after.some((s) => s.lang === 'ja'), '일본어 표시가 하나도 없다');
  });
});

describe('재계획 실패', () => {
  test('SilentReplanError 는 500 SAFEHOUR_RECALCULATION_FAILED 이고, 로그에 날짜를 남기지 않는다', async () => {
    const engine = {
      planTrip: () => {
        throw new SilentReplanError('2026-10-03', ['2026-10-03:P:5001']);
      },
      alternativesFor: realAlternatives,
    };
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    try {
      const res = await plan(setup({ engine }).handlers, { lang: 'en', stay: planStay() });
      assert.equal(res.status, 500);
      const data = await body(res);
      assert.equal(data.errorCode, 'SAFEHOUR_RECALCULATION_FAILED');
      assert.equal(JSON.stringify(data).includes('2026-10-03'), false);
    } finally {
      console.error = original;
    }
    assert.ok(errors.length > 0);
    assert.equal(errors.join('\n').includes('2026-10-03'), false, '로그에 날짜가 남았다');
    assert.equal(errors.join('\n').includes('5001'), false);
  });
});

describe('교체 후보 (spec 6장, 규칙 33)', () => {
  async function planned() {
    const { handlers } = setup();
    const data = await body(await plan(handlers, { lang: 'en', stay: planStay() }));
    const day = Object.values(data.days).find((d) => d.date >= '2026-10-03' && d.outings.length > 0);
    return { day, outing: day.outings[0] };
  }
  const alternatives = (h, payload) => h.alternatives(postJson('/api/itinerary/alternatives', payload));

  test('{ ok, alternatives: [{ stop, outingPreview }] } 최대 5개, 그 자리 교체 결과다', async () => {
    const { day, outing } = await planned();
    const stop = outing.stops[0];
    const { handlers, enrich } = setup();
    const res = await alternatives(handlers, { lang: 'en', stay: planStay(), date: day.date, outingId: outing.id, stopId: stop.id, day });
    assert.equal(res.status, 200);
    const data = await body(res);
    assert.deepEqual(Object.keys(data).sort(), ['alternatives', 'ok']);
    assert.ok(data.alternatives.length > 0 && data.alternatives.length <= 5);
    for (const alt of data.alternatives) {
      assert.deepEqual(Object.keys(alt).sort(), ['outingPreview', 'stop']);
      assert.notEqual(alt.stop.contentId, stop.contentId);
      assert.equal(alt.stop.pinned, true);
      assert.equal(alt.outingPreview.id, outing.id);
    }
    // 보강은 교체 후보에만 — 한 번에 5개 이하, 그날 이미 있는 장소는 부르지 않는다
    assert.ok(enrich.requested.length > 0 && enrich.requested.length <= 5 * 2);
    const inDay = new Set(stopsOf(day).map((s) => s.contentId));
    assert.ok(enrich.requested.every((id) => !inDay.has(id)));
  });

  test('오늘 닫힘 사건(events)의 장소는 교체 후보에 나오지 않는다', async () => {
    const now = at('2026-10-03', '07:00');
    const { handlers } = setup({ now });
    const first = await body(await plan(handlers, { lang: 'en', stay: planStay(), dates: ['2026-10-03'] }));
    const day = first.days['2026-10-03'];
    const outing = day.outings[0];
    const req = { lang: 'en', stay: planStay(), date: day.date, outingId: outing.id, stopId: outing.stops[0].id, day };
    const open = await body(await alternatives(setup({ now }).handlers, req));
    const closedId = open.alternatives[0].stop.contentId;
    const closed = await body(
      await alternatives(setup({ now }).handlers, { ...req, events: [{ type: 'CLOSURE', closedIds: [closedId] }] }),
    );
    assert.equal(closed.alternatives.some((a) => a.stop.contentId === closedId), false);
  });

  test('외출·정거장을 찾을 수 없으면 400 이다', async () => {
    const { day, outing } = await planned();
    const { handlers } = setup();
    const base = { lang: 'en', stay: planStay(), date: day.date, day };
    const r1 = await alternatives(handlers, { ...base, outingId: 'nope', stopId: outing.stops[0].id });
    assert.equal(r1.status, 400);
    assert.equal((await body(r1)).field, 'outingId');
    const r2 = await alternatives(handlers, { ...base, outingId: outing.id, stopId: 'nope' });
    assert.equal(r2.status, 400);
    assert.equal((await body(r2)).field, 'stopId');
  });

  test('체류 밖 날짜는 400 이다', async () => {
    const { day, outing } = await planned();
    const moved = { ...day, date: '2026-11-01' };
    const res = await alternatives(setup().handlers, {
      lang: 'en',
      stay: planStay(),
      date: '2026-11-01',
      outingId: outing.id,
      stopId: outing.stops[0].id,
      day: moved,
    });
    assert.equal(res.status, 400);
    assert.equal((await body(res)).field, 'date');
  });
});
