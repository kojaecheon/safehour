// AX-316 — 일정 동기화 테스트용 가짜 서버·메모리 저장소 (실제 네트워크 호출 0건)
//
// 가짜 서버는 실제 일정 API 처리기(lib/server/itinerary-service.js)를 그대로 쓰고, 외부 데이터(관광공사·기상청)만
// 가짜 의존성으로 바꾼다. 그래서 요청이 서버의 허용 목록·형식 검사(400)를 실제로 통과하는지까지 확인된다.
// 병원 연동(/api/plan/link)은 코드 → 지침 지도로 흉내 낸다.
// 이름·주소·좌표·코드는 모두 지어낸 것이다. 실제 장소·의료기관·사람을 가리키지 않는다.

import { createItineraryHandlers } from '../lib/server/itinerary-service.js';
import { createMemoryStorage, createStore } from '../lib/store/index.js';
import { fakeEnrich, fakeForecast, fakeLoader } from './itinerary-fixtures.js';
import { tripPool } from './trip-fixtures.js';

export { stay, period, CLINIC_POINT, HOME } from './day-plan-fixtures.js';
export { SET, NONE, UNKNOWN, items } from './stay-fixtures.js';

/** 계정 키 형식(base64url 16자 이상)만 맞춘 가짜 값 */
export const ACCOUNT = 'acct_trip_sync_test_0001';

/** KST 날짜·시각 → ms */
export const kst = (date, hhmm = '08:00') => Date.parse(`${date}T${hhmm}:00+09:00`);

/** 조작 가능한 시계 */
export function createClock(ms) {
  const clock = { ms, now: () => clock.ms, set: (value) => (clock.ms = value) };
  return clock;
}

/** 로그인·온라인 상태의 메모리 저장소 */
export function signedInStore(clock, { online = true } = {}) {
  const store = createStore({ storage: createMemoryStorage(), now: clock.now, fetchImpl: async () => ({ ok: false }) });
  store.setOnline(online);
  store.setSession({ authenticated: true, accountKey: ACCOUNT, expiresAt: new Date(clock.now() + 12 * 3600_000).toISOString() });
  return store;
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * 가짜 서버. fetchImpl(url, init) 을 runtime 의 API 클라이언트에 넘긴다. 후보는 요청 언어로 정규화한 같은 묶음이다.
 * - calls: 받은 요청 `{ path, body }` (본문은 JSON 으로 다시 읽은 값)
 * - links: Map<code, plan | () => plan> — /api/plan/link 응답
 * - offline = true → 네트워크 오류(TypeError)
 * - failPlan = n → 다음 n 번의 일정 요청을 502 로 실패
 * - failPlanUpstream = 'QUOTA' 등 → 그 502 본문에 관광공사 실패 분류(upstream)를 싣는다
 */
export function createFakeServer({ clock, pool = (query) => tripPool(query?.lang ?? 'en', 60), forecast = fakeForecast() } = {}) {
  const loader = fakeLoader(pool);
  const handlers = createItineraryHandlers({
    clock: () => new Date(clock.now()),
    loadCandidates: loader.load,
    enrichIntros: fakeEnrich().enrich,
    fetchForecast: forecast.fetchForecast,
    env: { KMA_API_KEY: 'kma-test' },
    killSwitch: () => false,
    log: () => {},
  });
  const server = {
    calls: [],
    links: new Map(),
    offline: false,
    failPlan: 0,
    failPlanUpstream: null,
    forecast,
    get planCalls() {
      return server.calls.filter((c) => c.path === '/api/itinerary/plan');
    },
    get linkCalls() {
      return server.calls.filter((c) => c.path === '/api/plan/link');
    },
    async fetchImpl(url, init = {}) {
      const path = String(url);
      const text = typeof init.body === 'string' ? init.body : '';
      server.calls.push({ path, body: text ? JSON.parse(text) : null, raw: text });
      if (server.offline) throw new TypeError('Failed to fetch');
      const request = () =>
        new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
      if (path === '/api/itinerary/plan') {
        if (server.failPlan > 0) {
          server.failPlan -= 1;
          return jsonResponse(502, {
            ok: false,
            errorCode: 'SAFEHOUR_EXTERNAL_API',
            message: 'x',
            ...(server.failPlanUpstream ? { upstream: server.failPlanUpstream } : {}),
          });
        }
        return handlers.plan(request());
      }
      if (path === '/api/itinerary/alternatives') return handlers.alternatives(request());
      if (path === '/api/plan/link') {
        const code = JSON.parse(text).code;
        const entry = server.links.get(code);
        if (!entry) return jsonResponse(404, { ok: false, errorCode: 'SAFEHOUR_PLAN_UNKNOWN_CODE', message: 'x' });
        return jsonResponse(200, { ok: true, plan: typeof entry === 'function' ? entry() : entry });
      }
      return jsonResponse(404, { ok: false, errorCode: 'NOT_FOUND' });
    },
  };
  server.fetchImpl = server.fetchImpl.bind(server);
  return server;
}

/** 저장소 쓰기·API 호출 순서를 남기는 저장소 감시 — 원본 함수를 감싼다 */
export function spyStore(store, log) {
  const wrapped = { ...store };
  for (const name of ['onAppOpen', 'writeTripPlan', 'writeStay', 'updateStay', 'confirmDailyCheck', 'writeEdits', 'appendTodayEvent', 'clearTodayEvents']) {
    wrapped[name] = (...args) => {
      log.push(`store.${name}`);
      return store[name](...args);
    };
  }
  return Object.freeze(wrapped);
}

/** 모든 정거장 */
export const stopsOf = (day) => [...(day?.outings ?? []), ...(day?.guardianOutings ?? [])].flatMap((o) => o.stops);
export const contentIdsOf = (day) => stopsOf(day).map((s) => String(s.contentId));

/** "HH:MM" → 분 */
export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
