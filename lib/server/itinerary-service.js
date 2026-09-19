// 일정 API 처리 (AX-308 · spec 4.8, 4.9, 4.21, 6장)
//
// POST /api/itinerary/plan, POST /api/itinerary/alternatives 의 본체다. 라우트 파일은 로그인 가드로 감싸기만 한다.
//
// 흐름
//   1. 요청 정규화 (itinerary-request.js) — PlanStay 허용 목록, 대한민국 좌표, 데모 사건 검증. 실패는 400
//   2. 추천 중단 스위치(SAFEHOUR_KILL_RECOMMENDATION) — 켜지면 외부 호출·판정 없이 요청 날짜 전부
//      정거장 0개 + NO_TOURISM + SERVICE_PAUSED (규칙 34)
//   3. 관광 후보 — 그날 숙소 기준점 × 반경 10km × 언어 조합마다 한 번 조회(요청 하나 안에서 메모).
//      반경은 엔진이 날짜 분류에 따라 자른다(제한일 3km·자유일 10km). 실패하면 502 — 빈 후보로 일정을 만들면
//      확정 일정이 외부 장애 때문에 지워지므로 만들지 않는다
//   4. 기상 단기예보 — 오늘~모레 날짜만, 그날 숙소 좌표로. 실패·키 없음은 '확인 불가'이고 판정에 반영하지 않는다
//   5. 공항 이동 — 고정 공항 좌표와 공항 이동 전용 추정(직선×1.3, 60km/h, +15분)으로 서버가 계산(airports.js).
//      도심 구간(숙소↔장소·병원)은 엔진의 기존 추정기 그대로다
//   6. 엔진(planTrip / alternativesFor) — 현재 시각은 서버 시계. 상세(메뉴·운영) 보강은 일정에 들어간 후보,
//      식사 칸을 채울 수 있는 '메뉴 모름' 식당 몇 곳, 교체 후보에만 하고 다시 판정한다(spec 4.8 호출 방식)
//   7. 판정 운영 로그 한 줄(decision-log.js, 규칙 35)
//
// 서버는 아무것도 저장하지 않는다. 조건 값은 계산 뒤 버리고 로그에도 남기지 않는다(spec 4.19).
// 오류 로그에는 분류 코드만 남긴다 — 날짜·좌표·외부 오류 원문(URL·키가 섞일 수 있음)은 남기지 않는다.
//
// 상대 경로 사용 — Next 외부(node --test)에서도 이 모듈을 그대로 테스트하기 위함

import { REASON, STATE } from '../../src/domain/states.js';
import { fetchKmaShortTermForecast, resolveKmaServiceKey } from '../../src/adapters/weather.js';
import { alternativesFor } from '../../src/engine/alternatives.js';
import { computeDayDelta } from '../../src/engine/dayDelta.js';
import { haversineKm } from '../../src/engine/slaCalculator.js';
import { ITINERARY_ENGINE_VERSION, kstClock, planTrip } from '../../src/engine/tripPlan.js';
import { classifyDate } from '../../src/stay/coverage.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { isStayDate, lodgingForDate, stayDates } from '../../src/stay/stay.js';
import { addDays } from '../../src/stay/time.js';
import { ORIGIN_KIND, createCandidateLoader, loadSafeHourCandidates } from '../../src/tour-api/candidate-service.js';
import { enrichCandidateIntros } from '../../src/tour-api/detail-service.js';
import { LOG_ROUTE, OUTCOME, logDecision } from './decision-log.js';
import { airportTravelMinutes } from './airports.js';
import { BAD_REQUEST, RequestError, normalizeAlternativesRequest, normalizePlanRequest } from './itinerary-request.js';
import { ERROR_CODE, errorResponse } from './route-guard.js';
import { isRecommendationKilled } from './runtime-flags.js';

/** 후보 조회 반경 — 숙소마다 가장 넓은 반경(자유일 10km)으로 한 번 조회한다 (spec 4.8, 11장) */
export const CANDIDATE_RADIUS_M = DEFAULTS.searchRadiusM.free;
/** 기상 단기예보 적용 범위: 오늘~모레 (spec 4.9 변화 원천 4) */
export const WEATHER_DAYS_AHEAD = 2;
/** 이동 시간은 외부 지도 API 없이 추정한다(엔진 기본 추정기) */
export const TRAVEL_TIME_SOURCE = 'fallback';

/** 상세 보강 — 다시 판정하는 횟수, 요청 하나의 보강 상한, 한 번에 확인하는 '메뉴 모름' 식당 수 */
const ENRICH_ROUNDS = 2;
const ENRICH_BUDGET = 60;
const MENU_PROBES_PER_ROUND = 6;

const EXTERNAL_API = 'SAFEHOUR_EXTERNAL_API';
const RECALCULATION_FAILED = 'SAFEHOUR_RECALCULATION_FAILED';

const MESSAGE = Object.freeze({
  BODY: '요청 본문이 올바르지 않습니다.',
  STAY: '체류 입력이 올바르지 않습니다.',
  EXTERNAL: '관광정보를 불러오지 못했습니다. 일정을 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.',
  ENGINE: '변화를 반영한 일정 계산에 실패했습니다. 안전을 위해 기존 일정을 그대로 믿지 마시고 잠시 후 다시 시도해 주세요.',
});

const NO_STORE = { 'Cache-Control': 'no-store' };

function ok(payload) {
  return Response.json({ ok: true, ...payload }, { headers: NO_STORE });
}

function requestErrorResponse(error) {
  if (error.errorCode === ERROR_CODE.STAY_INVALID) {
    return errorResponse(ERROR_CODE.STAY_INVALID, MESSAGE.STAY, { fields: error.extra.fields, issues: error.extra.issues });
  }
  return errorResponse(BAD_REQUEST, MESSAGE.BODY, { field: error.field });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new RequestError(BAD_REQUEST, 'body');
  }
}

function requestedDates(stay, dates) {
  const all = stayDates(stay);
  if (!dates) return all;
  const wanted = new Set(dates);
  return all.filter((d) => wanted.has(d));
}

// ── 추천 중단 스위치 (규칙 34) ────────────────────────────────────────────

/**
 * 정거장 없는 NO_TOURISM + SERVICE_PAUSED 하루. 외부 호출·판정을 하지 않는다.
 * 즉시 복귀(returnNow)는 더 안전한 쪽으로만 유지한다 — 오늘 이미 켜져 있거나 오늘 환자 호출 사건이 있으면 켠 채로 둔다.
 */
function pausedDay(stay, date, { prevDay = null, returnNow = false } = {}) {
  let classification = null;
  try {
    classification = classifyDate(stay, date);
  } catch {
    classification = null;
  }
  const day = {
    date,
    coverage: classification?.coverage ?? 'NEEDS_INPUT',
    dayState: STATE.NO_TOURISM,
    reasons: [REASON.SERVICE_PAUSED],
    window: null,
    lodgingId: lodgingForDate(stay, date)?.id ?? null,
    transportMode: classification?.transportMode === 'TRANSIT' ? 'TRANSIT' : 'TAXI',
    effective: {},
    blocks: [],
    outings: [],
    guardianOutings: [],
    mealSlots: ['LUNCH', 'DINNER'].map((slot) => ({ slot, status: 'NOT_APPLICABLE', reasons: [REASON.SERVICE_PAUSED] })),
    excluded: [],
    warnings: [],
    returnNow,
  };
  if (prevDay) {
    try {
      const delta = computeDayDelta(prevDay, day, { reasons: [REASON.SERVICE_PAUSED] });
      if (delta.hasVisibleChange) day.delta = delta;
    } catch {
      // 비교를 못 만들어도 중단 응답은 나가야 한다
    }
  }
  return day;
}

function pausedDays(stay, dates, { previous = {}, events = [], today }) {
  const recall = events.some((e) => e.type === 'PATIENT_RECALL');
  return Object.fromEntries(
    dates.map((date) => {
      const prevDay = previous[date] ?? null;
      const returnNow = date === today && (prevDay?.returnNow === true || recall);
      return [date, pausedDay(stay, date, { prevDay, returnNow })];
    }),
  );
}

// ── 관광 후보 ─────────────────────────────────────────────────────────────

async function loadCandidatesByLodging({ loader, stay, lodgingIds, lang }) {
  const entries = await Promise.all(
    [...new Set(lodgingIds)].sort().map(async (id) => {
      const lodging = (stay.lodgings ?? []).find((l) => l.id === id);
      if (!lodging) return [id, []];
      const result = await loader.load({
        origin: { kind: ORIGIN_KIND.USER_SELECTED_FIXED, lat: lodging.lat, lng: lodging.lng },
        radiusMeters: CANDIDATE_RADIUS_M,
        lang,
      });
      return [id, Array.isArray(result?.candidates) ? result.candidates : []];
    }),
  );
  return Object.fromEntries(entries);
}

function uniqueCandidateCount(byLodging) {
  return new Set(Object.values(byLodging).flatMap((list) => list.map((c) => String(c?.id)))).size;
}

// ── 기상 ──────────────────────────────────────────────────────────────────

/**
 * 오늘~모레 요청 날짜의 기상. 엔진 입력(weatherByDate)에는 부적합(true)·확인된 적합(false)만 넣고,
 * 확인 불가는 넣지 않는다(판정에 반영하지 않음).
 */
async function weatherFor({ fetchForecast, stay, dates, today, now, serviceKey }) {
  const last = addDays(today, WEATHER_DAYS_AHEAD);
  const inRange = dates.filter((d) => d >= today && d <= last);
  if (inRange.length === 0) return { weatherByDate: {}, diagnostics: { source: 'none', byDate: {} } };

  const groups = new Map();
  for (const date of inRange) {
    const lodging = lodgingForDate(stay, date);
    if (!lodging) continue;
    const key = `${lodging.lat},${lodging.lng}`;
    if (!groups.has(key)) groups.set(key, { lat: lodging.lat, lng: lodging.lng, dates: [] });
    groups.get(key).dates.push(date);
  }
  const results = await Promise.all(
    [...groups.values()].map(async (g) => {
      try {
        return { g, forecast: await fetchForecast({ lat: g.lat, lng: g.lng, serviceKey, dates: g.dates, now }) };
      } catch {
        return { g, forecast: null };
      }
    }),
  );

  const byDate = Object.fromEntries(inRange.map((d) => [d, { outdoorUnsafe: null }]));
  let fetched = false;
  for (const { g, forecast } of results) {
    if (forecast && forecast.degraded !== true) fetched = true;
    for (const d of g.dates) {
      const v = forecast?.byDate?.[d]?.outdoorUnsafe;
      byDate[d] = { outdoorUnsafe: v === true || v === false ? v : null };
    }
  }
  const weatherByDate = {};
  for (const [d, v] of Object.entries(byDate)) if (v.outdoorUnsafe !== null) weatherByDate[d] = { outdoorUnsafe: v.outdoorUnsafe };
  return { weatherByDate, diagnostics: { source: fetched ? 'kma-short-term' : 'unavailable', byDate } };
}

// ── 상세 보강 ────────────────────────────────────────────────────────────

/** 국문 소개정보(운영·메뉴)를 이미 실은 후보 — detail-service.js 의 판단과 같다 */
function introLoaded(candidate) {
  const m = candidate?.sourceMetadata ?? {};
  return m.schedule !== null && m.schedule !== undefined && m.menu !== null && m.menu !== undefined;
}

function candidateIndex(byLodging) {
  const index = new Map();
  for (const list of Object.values(byLodging)) for (const c of list) if (!index.has(String(c.id))) index.set(String(c.id), c);
  return index;
}

function withEnriched(byLodging, byId) {
  return Object.fromEntries(
    Object.entries(byLodging).map(([id, list]) => [id, list.map((c) => byId.get(String(c.id)) ?? c)]),
  );
}

/**
 * 판정 → 필요한 후보만 보강 → 다시 판정. 보강할 것이 없거나 바뀐 것이 없으면 멈춘다.
 * @param {{run: Function, pick: Function, byLodging: object, enrich: Function}} args
 *   pick(result, {index, skip}) → 보강할 후보 id(순서대로). skip(id) 가 참인 것은 이미 실었거나 시도한 것
 */
async function refineWithIntros({ run, pick, byLodging, enrich }) {
  let current = byLodging;
  let result = run(current);
  const attempted = new Set();
  let budget = ENRICH_BUDGET;
  for (let round = 0; round < ENRICH_ROUNDS && budget > 0; round += 1) {
    const index = candidateIndex(current);
    const skip = (id) => attempted.has(id) || !index.has(id) || introLoaded(index.get(id));
    const ids = [...new Set(pick(result, { index, skip }))].filter((id) => !skip(id)).slice(0, budget);
    if (ids.length === 0) break;
    ids.forEach((id) => attempted.add(id));
    budget -= ids.length;

    const inputs = ids.map((id) => index.get(id));
    let enriched;
    try {
      enriched = await enrich(inputs, { useCache: true });
    } catch {
      break; // 보강은 보강일 뿐 — 실패하면 지금 판정을 쓴다
    }
    const changed = new Map();
    (enriched?.candidates ?? []).forEach((c, i) => {
      if (c && c !== inputs[i] && String(c.id) === ids[i]) changed.set(ids[i], c);
    });
    if (changed.size === 0) break;
    current = withEnriched(current, changed);
    result = run(current);
  }
  return result;
}

const stopIds = (day) =>
  [...(day?.outings ?? []), ...(day?.guardianOutings ?? [])].flatMap((o) => (o.stops ?? []).map((s) => String(s.contentId)));

/** 일정 보강 대상 — 오늘 이후 배치된 정거장(날짜 순), 그다음 빈 식사 칸이 있는 날의 '메뉴 모름' 식당(숙소에서 가까운 순) */
function planPicker({ stay, today }) {
  return (result, { index, skip }) => {
    const days = Object.values(result.days)
      .filter((d) => d.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const placed = days.flatMap(stopIds);
    const probes = new Map();
    for (const day of days) {
      if (!(day.mealSlots ?? []).some((m) => m.status === 'NONE_AVAILABLE')) continue;
      const lodging = (stay.lodgings ?? []).find((l) => l.id === day.lodgingId);
      for (const e of day.excluded ?? []) {
        const id = String(e.candidateId);
        if (e.reasons?.length !== 1 || e.reasons[0] !== REASON.MENU_UNKNOWN || skip(id) || probes.has(id)) continue;
        const c = index.get(id);
        const km = lodging && c ? haversineKm({ lat: lodging.lat, lng: lodging.lng }, { lat: c.lat, lng: c.lng }) : Infinity;
        probes.set(id, km);
      }
    }
    const nearest = [...probes.entries()]
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, MENU_PROBES_PER_ROUND)
      .map(([id]) => id);
    return [...placed, ...nearest];
  };
}

// ── 처리기 ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ItineraryDeps  테스트용 주입. 기본값은 실제 모듈이다
 * @property {() => Date} [clock]
 * @property {(query: object) => Promise<{candidates: object[]}>} [loadCandidates]
 * @property {(candidates: object[], opts: object) => Promise<{candidates: object[]}>} [enrichIntros]
 * @property {(args: object) => Promise<object>} [fetchForecast]
 * @property {{planTrip: Function, alternativesFor: Function}} [engine]
 * @property {Record<string, string|undefined>} [env]  기본 process.env (호출 때 읽음)
 * @property {() => boolean} [killSwitch]
 * @property {(args: object) => void} [log]
 */

/**
 * 일정 API 처리기 두 개를 만든다. 로그인 가드는 라우트가 씌운다(withSession).
 * @param {ItineraryDeps} [deps]
 * @returns {{plan: (request: Request) => Promise<Response>, alternatives: (request: Request) => Promise<Response>}}
 */
export function createItineraryHandlers(deps = {}) {
  const clock = deps.clock ?? (() => new Date());
  const loadCandidates = deps.loadCandidates ?? loadSafeHourCandidates;
  const enrichIntros = deps.enrichIntros ?? enrichCandidateIntros;
  const fetchForecast = deps.fetchForecast ?? fetchKmaShortTermForecast;
  const engine = { planTrip, alternativesFor, ...(deps.engine ?? {}) };
  const envOf = () => deps.env ?? process.env;
  const killSwitch = deps.killSwitch ?? isRecommendationKilled;
  const log = deps.log ?? logDecision;

  const prepare = async ({ stay, lang, lodgingIds, weatherDates, now, today }) => {
    const loader = createCandidateLoader({ loader: loadCandidates, useCache: true, now });
    const byLodging = await loadCandidatesByLodging({ loader, stay, lodgingIds, lang });
    const weather = weatherDates
      ? await weatherFor({ fetchForecast, stay, dates: weatherDates, today, now, serviceKey: resolveKmaServiceKey(envOf()) })
      : { weatherByDate: {}, diagnostics: { source: 'none', byDate: {} } };
    return { byLodging, weather, airportTravel: airportTravelMinutes(stay) };
  };

  async function plan(request) {
    const startedAt = Date.now();
    let input;
    try {
      input = normalizePlanRequest(await readBody(request));
    } catch (error) {
      if (error instanceof RequestError) return requestErrorResponse(error);
      throw error;
    }
    const { lang, stay, previous, relabelOnly } = input;
    const now = clock();
    const today = kstClock(now.getTime()).date;
    const dates = requestedDates(stay, input.dates);
    const done = (outcome, extra) =>
      log({ route: LOG_ROUTE.PLAN, outcome, requestedDateCount: dates.length, lang, elapsedMs: Date.now() - startedAt, ...extra });

    if (killSwitch()) {
      const days = pausedDays(stay, dates, { previous, events: input.events, today });
      done(OUTCOME.PAUSED, { days });
      return ok({
        engineVersion: ITINERARY_ENGINE_VERSION,
        days,
        diagnostics: { candidateCount: 0, travelTimeSource: 'none', weather: { source: 'none', byDate: {} } },
        servicePaused: true,
      });
    }

    // 후보가 필요한 숙소: 표시만 다시 쓰기는 오늘 이후 저장 일정의 숙소, 아니면 요청 날짜(지난 저장 일정 제외)의 숙소
    const lodgingIds = [];
    for (const date of dates) {
      const prev = previous[date]?.date === date ? previous[date] : null;
      if (relabelOnly) {
        if (prev && date >= today) lodgingIds.push(prev.lodgingId ?? lodgingForDate(stay, date)?.id);
      } else if (!(prev && date < today)) {
        lodgingIds.push(lodgingForDate(stay, date)?.id);
      }
    }

    let prepared;
    try {
      prepared = await prepare({
        stay,
        lang,
        lodgingIds: lodgingIds.filter(Boolean),
        weatherDates: relabelOnly ? null : dates,
        now,
        today,
      });
    } catch {
      // 원문(error.message)에는 조회 URL·키가 섞일 수 있어 분류만 남긴다
      console.error('[itinerary.plan] candidate load failed:', EXTERNAL_API);
      done(OUTCOME.FAILED, { errorCode: EXTERNAL_API });
      return errorResponse(EXTERNAL_API, MESSAGE.EXTERNAL, {}, { status: 502 });
    }

    const run = (candidatesByLodging) =>
      engine.planTrip({
        stay,
        candidatesByLodging,
        weatherByDate: prepared.weather.weatherByDate,
        airportTravel: prepared.airportTravel,
        lang,
        now: now.getTime(),
        dates: input.dates,
        previous,
        edits: input.edits,
        usedContentIds: input.usedContentIds,
        events: input.events,
        relabelOnly,
      });

    let result;
    try {
      result = relabelOnly
        ? run(prepared.byLodging)
        : await refineWithIntros({ run, pick: planPicker({ stay, today }), byLodging: prepared.byLodging, enrich: enrichIntros });
    } catch (error) {
      // SilentReplanError(변화가 필요한데 전후 비교가 빔)·엔진 오류 — 메시지에 날짜가 있어 이름만 남긴다
      console.error('[itinerary.plan] engine failed:', error?.name === 'SilentReplanError' ? 'SILENT_REPLAN' : 'ENGINE_ERROR');
      done(OUTCOME.FAILED, { errorCode: RECALCULATION_FAILED });
      return errorResponse(RECALCULATION_FAILED, MESSAGE.ENGINE, {}, { status: 500 });
    }

    done(OUTCOME.DECIDED, { days: result.days });
    return ok({
      engineVersion: result.engineVersion,
      days: result.days,
      diagnostics: {
        candidateCount: uniqueCandidateCount(prepared.byLodging),
        travelTimeSource: TRAVEL_TIME_SOURCE,
        weather: prepared.weather.diagnostics,
      },
    });
  }

  async function alternatives(request) {
    const startedAt = Date.now();
    let input;
    try {
      input = normalizeAlternativesRequest(await readBody(request));
    } catch (error) {
      if (error instanceof RequestError) return requestErrorResponse(error);
      throw error;
    }
    const { lang, stay, date, day, outingId, stopId } = input;
    if (!isStayDate(stay, date)) return errorResponse(BAD_REQUEST, MESSAGE.BODY, { field: 'date' });
    const outing = [...day.outings, ...day.guardianOutings].find((o) => o.id === outingId);
    if (!outing) return errorResponse(BAD_REQUEST, MESSAGE.BODY, { field: 'outingId' });
    if (!outing.stops.some((s) => s.id === stopId)) return errorResponse(BAD_REQUEST, MESSAGE.BODY, { field: 'stopId' });

    const now = clock();
    const today = kstClock(now.getTime()).date;
    const done = (outcome, extra) =>
      log({ route: LOG_ROUTE.ALTERNATIVES, outcome, requestedDateCount: 1, lang, elapsedMs: Date.now() - startedAt, ...extra });

    if (killSwitch()) {
      const days = pausedDays(stay, [date], { previous: { [date]: day }, events: input.events, today });
      done(OUTCOME.PAUSED, { days });
      return ok({ alternatives: [], servicePaused: true, days });
    }

    let prepared;
    try {
      const lodging = lodgingForDate(stay, date);
      prepared = await prepare({ stay, lang, lodgingIds: lodging ? [lodging.id] : [], weatherDates: [date], now, today });
    } catch {
      console.error('[itinerary.alternatives] candidate load failed:', EXTERNAL_API);
      done(OUTCOME.FAILED, { errorCode: EXTERNAL_API, days: [day] });
      return errorResponse(EXTERNAL_API, MESSAGE.EXTERNAL, {}, { status: 502 });
    }

    const run = (candidatesByLodging) =>
      engine.alternativesFor({
        stay,
        date,
        day,
        outingId,
        stopId,
        candidatesByLodging,
        weatherByDate: prepared.weather.weatherByDate,
        airportTravel: prepared.airportTravel,
        usedContentIds: input.usedContentIds,
        edits: input.edits,
        events: input.events,
        now: now.getTime(),
      });

    let list;
    try {
      list = await refineWithIntros({
        run,
        pick: (alts) => alts.map((a) => String(a.stop.contentId)),
        byLodging: prepared.byLodging,
        enrich: enrichIntros,
      });
    } catch (error) {
      if (error instanceof RangeError) return errorResponse(BAD_REQUEST, MESSAGE.BODY, { field: 'stopId' });
      console.error('[itinerary.alternatives] engine failed:', 'ENGINE_ERROR');
      done(OUTCOME.FAILED, { errorCode: RECALCULATION_FAILED, days: [day] });
      return errorResponse(RECALCULATION_FAILED, MESSAGE.ENGINE, {}, { status: 500 });
    }

    done(OUTCOME.DECIDED, { days: [day] });
    return ok({ alternatives: list });
  }

  return { plan, alternatives };
}
