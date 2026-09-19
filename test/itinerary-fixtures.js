// AX-308 — 일정 API 테스트용 가짜 데이터와 가짜 의존성 (실제 호출 없음)
//
// 체류·후보는 엔진 fixture(day-plan-fixtures.js·trip-fixtures.js)와 같은 가상 좌표를 쓴다.
// 이름·주소·전화·코드는 모두 지어낸 것이다. 실제 장소·의료기관·사람을 가리키지 않는다.

import { SESSION_COOKIE, createSessionToken } from '../src/auth/session.js';
import { applyIntro } from '../src/tour-api/mapper.js';
import { CLINIC_POINT, HOME, period } from './day-plan-fixtures.js';
import { tripPool } from './trip-fixtures.js';

export { HOME, CLINIC_POINT, period, tripPool };
export { at } from './trip-fixtures.js';

export const SESSION_SECRET = 'r'.repeat(48);

/** 로그인 세션 쿠키 */
export function sessionCookie(nowMs = Date.now()) {
  const token = createSessionToken({ provider: 'demo', subject: 'subject-itinerary' }, SESSION_SECRET, nowMs);
  return `${SESSION_COOKIE}=${token}`;
}

/** POST JSON 요청. cookie 가 false 면 세션 없이 */
export function postJson(path, body, { cookie = true } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', typeof cookie === 'string' ? cookie : sessionCookie());
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * PlanStay (spec 6장 허용 목록) — 체류 10-01~10-10, 숙소 L1, 수술 10-04, 10-04~10-10 본인 체크 기간(모두 '아니오').
 * 10-01~10-03 은 자유일, 10-04~10-10 은 제한일.
 */
export function planStay(overrides = {}) {
  return {
    arrival: { date: '2026-10-01', time: '06:00', airport: 'ICN' },
    departure: { date: '2026-10-10', time: '23:00', airport: 'ICN' },
    hasCompanion: true,
    interests: [],
    pace: 'RELAXED',
    lodgings: [{ id: 'L1', lat: HOME.lat, lng: HOME.lng, checkIn: '2026-10-01', checkOut: '2026-10-10' }],
    hospitals: [{ id: 'H1', lat: CLINIC_POINT.lat, lng: CLINIC_POINT.lng }],
    appointments: [{ id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00' }],
    periods: [period({}, { startDate: '2026-10-04', endDate: '2026-10-10' })],
    consent: { sensitive: true },
    ...overrides,
  };
}

/** 가짜 후보 조회 — 호출을 기록하고 같은 후보 묶음을 돌려준다 */
export function fakeLoader(pool = tripPool('en', 60)) {
  const calls = [];
  const load = async (query) => {
    calls.push(query);
    return { candidates: typeof pool === 'function' ? pool(query) : pool, diagnostics: {} };
  };
  return { load, calls };
}

/** 가짜 소개정보 보강 — 요청받은 후보만 기록하고 운영·메뉴 원문을 붙인다 */
export function fakeEnrich(intro = { schedule: { usetime: '09:00~18:00' }, menu: { firstmenu: '비빔밥' } }) {
  const requested = [];
  const enrich = async (candidates) => {
    requested.push(...candidates.map((c) => String(c.id)));
    const list = candidates.map((c) => applyIntro(c, typeof intro === 'function' ? intro(c) : intro));
    return { candidates: list, diagnostics: { requested: list.length, fetched: list.length, skipped: 0, failed: [] } };
  };
  return { enrich, requested };
}

/** 가짜 단기예보 — 날짜별 값을 정해 돌려준다(기본: 모두 맑음) */
export function fakeForecast(byDateValue = () => false) {
  const calls = [];
  const fetchForecast = async (args) => {
    calls.push(args);
    return {
      source: 'kma-short-term',
      byDate: Object.fromEntries(args.dates.map((d) => [d, { outdoorUnsafe: byDateValue(d, args) }])),
      unknown: false,
      degraded: false,
    };
  };
  return { fetchForecast, calls };
}

/** 응답 JSON */
export async function body(res) {
  return JSON.parse(await res.text());
}

/** 모든 외출(환자·보호자)의 정거장 */
export const stopsOf = (day) => [...(day.outings ?? []), ...(day.guardianOutings ?? [])].flatMap((o) => o.stops);
