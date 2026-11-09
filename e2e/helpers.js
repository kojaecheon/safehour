// E2E 공통 헬퍼 (AX-322) — 날짜·체류 만들기·기기 저장소 심기·접근성·반응형 검사
//
// 체류는 두 길로 만든다.
//   - 시나리오 1(core-flow.spec.js)은 화면으로 처음부터 끝까지 입력한다.
//   - 나머지 시나리오는 같은 모양의 체류를 기기 저장소(localStorage)에 바로 심고 앱을 연다.
//     앱이 여는 순간 일정 동기화(lib/trip)가 전체 일정을 한 번 만들어 저장한다 — 서버 판정은 실제 코드다.
//
// 날짜는 모두 **한국 달력 날짜**(KST)다. 테스트가 언제 돌든 '오늘'을 기준으로 상대 날짜를 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── 날짜 ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 오늘(KST)에서 n일 뒤의 'YYYY-MM-DD'. nowMs 기본값은 시계 이동(setClock)을 반영한 지금이다 */
export function kstDate(offsetDays = 0, nowMs = nowWithClock()) {
  return new Date(nowMs + KST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** 지금 KST 분(0~1439). nowMs 기본값은 시계 이동(setClock)을 반영한 지금이다 */
export function kstMinutes(nowMs = nowWithClock()) {
  const d = new Date(nowMs + KST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// ── 시계 이동 (테스트 전용, 선택 사용) ───────────────────────────────
//
// 일정의 '지금'은 서버가 자기 시계로만 정하고(요청의 now 는 쓰지 않는다), 브라우저도 실제 시계를 읽는다
// (날짜 넘김·매일 확인·알림 예약·lib/trip/runtime.js 타이머). 그래서 한쪽만 옮겨서는 '외출 중 15:31' 같은
// 시각을 만들 수 없다. setClock 은 세 곳을 함께 옮긴다.
//   1. 서버: SAFEHOUR_E2E_GUARD_DIR/clock-offset 에 이동량(ms)을 쓴다. e2e/clock-shim.cjs 가 읽어 서버의 Date 를 옮긴다.
//   2. 브라우저: page.clock 을 심어 앱이 보는 Date 와 타이머를 같은 시각으로 맞춘다.
//   3. 이 파일의 kstDate()·kstMinutes() 기본값도 옮긴 지금을 따른다.
// 이동량은 테스트 러너만 정한다. 요청에 시각을 실어 보내는 길은 만들지 않는다(서버는 여전히 자기 시계만 읽는다).
// e2e/fixtures.js 가 테스트 앞뒤로 이동을 0 으로 되돌리므로 쓰지 않는 테스트는 실제 시계를 본다.
//
// 주의: page.clock 이 심기면 앱의 setTimeout·setInterval 은 가짜 시계 위에서 돈다. 실제 시간을 기다려서는
// 타이머가 원하는 만큼 진행되지 않을 수 있으니, 시간을 보내려면 advanceClock(또는 page.clock.runFor)을 쓴다.
// 같은 날 안(KST)에서 옮기는 것을 전제로 한다: 세션 쿠키·체류 날짜·시드한 일정이 모두 '오늘'을 기준으로 한다.

const CLOCK_OFFSET_FILE = path.join(path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data'), 'guard', 'clock-offset');
const TOUR_CACHE_DIR = path.join(path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data'), '.cache', 'tour-api');
// 서버 shim 의 재확인 간격(250ms)보다 넉넉히 기다려 바뀐 이동량이 적용된 뒤에 다음 동작을 한다
const SHIM_SETTLE_MS = 400;

let clockShiftMs = 0;
const clockInstalled = new WeakSet();

/** 시계 이동을 반영한 지금(ms). 이동이 없으면 Date.now() 와 같다 */
export function nowWithClock() {
  return Date.now() + clockShiftMs;
}

function readServerOffset() {
  try {
    return Number.parseInt(fs.readFileSync(CLOCK_OFFSET_FILE, 'utf8').trim(), 10) || 0;
  } catch {
    return 0; // 파일 없음 = 이동 없음
  }
}

function writeServerOffset(ms) {
  fs.mkdirSync(path.dirname(CLOCK_OFFSET_FILE), { recursive: true });
  fs.writeFileSync(CLOCK_OFFSET_FILE, String(Math.round(ms)), 'utf8');
}

/** 서버가 옮긴 시계로 TourAPI 캐시(수명 15분)를 낡았다고 보지 않게 시드 파일 시각을 옮긴 지금으로 맞춘다 */
function touchSeedCache(atMs) {
  let names = [];
  try {
    names = fs.readdirSync(TOUR_CACHE_DIR);
  } catch {
    return;
  }
  const at = new Date(atMs);
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      fs.utimesSync(path.join(TOUR_CACHE_DIR, name), at, at);
    } catch {
      // 지워진 파일은 건너뛴다
    }
  }
}

async function applyShift(shiftMs) {
  // 같은 날 안에서만 옮긴다: 옮긴 지금의 KST 날짜가 실제 오늘과 다르면 세션 쿠키·체류 날짜·시드 일정 가정이 깨진다
  const realToday = kstDate(0, Date.now());
  const shiftedDay = kstDate(0, Date.now() + shiftMs);
  if (shiftedDay !== realToday) {
    throw new Error(`시계는 실제 오늘(KST ${realToday}) 안에서만 옮길 수 있다 (옮긴 날짜: ${shiftedDay})`);
  }
  await moveServerClock(readServerOffset(), shiftMs);
  clockShiftMs = shiftMs;
}

/**
 * 서버 시계를 prev 에서 next 로 옮기면서 시드 캐시가 서버 시계보다 낡아 보이는 순간을 없앤다.
 *
 * 순서가 중요하다. 캐시 신선도는 '서버의 지금 - 파일 mtime'(15분)이고, 미래 mtime 은 나이 0 으로 읽힌다
 * (src/tour-api/client.js). shim 은 이동량 파일을 250ms 간격으로 읽으므로 쓰고 나서 최대 SHIM_SETTLE_MS 동안
 * 서버는 옛 시계와 새 시계 중 어느 쪽이든 볼 수 있다.
 * 1. 먼저 mtime 을 두 시계 중 늦은 쪽의 지금으로 맞춘다: 어느 시계로 읽어도 미래거나 지금이라 적중한다.
 * 2. 그다음 이동량을 쓰고 shim 이 읽을 때까지 기다린다.
 * 3. 뒤로 옮긴 경우(오전 10:00 고정, 이동 해제 뒤 원래대로 등)에는 그 뒤에 mtime 을 새 시계의 지금으로 다시 맞춘다.
 * 반대로 하면(이동량 먼저, 또는 mtime 을 이른 쪽 시계로 먼저) 수백 ms 동안 캐시가 13시간 낡아 보여,
 * 그 사이 도는 백그라운드 재계획이 캐시를 놓치고 실제 API 를 부른다 (CI 외부 호출 기록의 원인).
 */
async function moveServerClock(prevMs, nextMs) {
  touchSeedCache(Date.now() + Math.max(prevMs, nextMs));
  writeServerOffset(nextMs);
  await new Promise((resolve) => setTimeout(resolve, SHIM_SETTLE_MS));
  if (nextMs < prevMs) touchSeedCache(Date.now() + nextMs);
}

/** 'YYYY-MM-DDTHH:MM'(KST) 을 UTC ms 로 */
function kstToMs(kst) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(kst);
  if (!m) throw new Error(`setClock: kst 는 'YYYY-MM-DDTHH:MM' 모양이어야 한다 (받은 값: ${kst})`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - KST_OFFSET_MS;
}

/**
 * 서버와 브라우저의 '지금'을 KST 로 정한 시각에 맞춘다.
 *
 * - 시계는 멈추지 않는다. 정한 시각은 '옮긴 출발점'이고 그때부터 양쪽 모두 실제 속도로 흐른다.
 *   그러니 '복귀 마감 1분 전'으로 맞추면 60초가 안 돼 저절로 넘어간다. 여유를 2~3분 두거나 advanceClock 으로 보낸다.
 * - 브라우저는 서버보다 약 400ms 늦게 따라온다(서버 shim 이 250ms 간격으로 파일을 읽는다). 초 단위 경계 단언에는 여유를 둔다.
 * - 가장 먼저, page.goto·startTrip 보다 앞서 부른다(이미 이동한 페이지에서 처음 부르면 오류).
 * - 같은 KST 날짜 안(실제 오늘)에서만 옮긴다. 다른 날짜면 오류.
 * - page.clock 이 심기면 앱의 타이머는 가짜 시계 위에서 돈다. 실제 대기 대신 advanceClock 을 쓴다.
 * @param {import('@playwright/test').Page} page
 * @param {{kst: string}} when 'YYYY-MM-DDTHH:MM' (한국 시각): `${kstDate(0)}T10:00`
 */
export async function setClock(page, { kst }) {
  const target = kstToMs(kst);
  if (!clockInstalled.has(page) && page.url() !== 'about:blank') {
    throw new Error(`setClock 은 page.goto·startTrip 보다 먼저 불러야 한다 (현재 주소: ${page.url()})`);
  }
  await applyShift(target - Date.now());
  if (clockInstalled.has(page)) await page.clock.setSystemTime(target);
  else {
    await page.clock.install({ time: target });
    clockInstalled.add(page);
  }
}

/**
 * 서버와 브라우저의 시계를 ms 만큼 함께 앞으로 보낸다. 기본은 page.clock.fastForward 라 밀린 타이머가 한 번만 돈다.
 * 앱의 분 단위 틱이 매번 돌아야 하면 { run: true } (page.clock.runFor, 긴 구간은 느리다). 같은 KST 날짜를 넘으면 오류.
 * @param {import('@playwright/test').Page} page
 * @param {number} ms
 * @param {{run?: boolean}} [options]
 */
export async function advanceClock(page, ms, { run = false } = {}) {
  if (!clockInstalled.has(page)) throw new Error('advanceClock: 먼저 setClock 으로 시계를 정해야 한다');
  await applyShift(clockShiftMs + ms);
  if (run) await page.clock.runFor(ms);
  else await page.clock.fastForward(ms);
}

/**
 * 시계 이동을 없앤다 (e2e/fixtures.js 가 테스트 앞뒤로 부른다). 서버가 옮겨 둔 상태였다면 shim 이 0 을 읽을 때까지
 * 기다린다: 기다리지 않으면 다음 테스트의 로그인이 옮겨진 시각으로 서명돼 곧바로 만료된 세션이 될 수 있다.
 */
export async function resetClock() {
  clockShiftMs = 0;
  const prev = readServerOffset();
  if (prev === 0) return;
  // 캐시 시각을 먼저 지금(두 시계 중 늦은 쪽)으로 올린 뒤 0 을 쓴다. 순서는 moveServerClock 주석 참고
  await moveServerClock(prev, 0);
}

// ── 데모 주소 (src/adapters/demoAddresses.js 와 같은 값 — 시드 기준점과 좌표가 같아야 캐시가 적중한다) ──

export const DEMO_LODGING = Object.freeze({
  roadAddress: '데모 주소 · 서울 강남구 강남역 인근',
  buildingName: '데모 숙소 (강남역 인근)',
  lat: 37.4979,
  lng: 127.0276,
  source: 'DEMO',
});

export const DEMO_LODGING_MYEONGDONG = Object.freeze({
  roadAddress: '데모 주소 · 서울 중구 명동 인근',
  buildingName: '데모 숙소 (명동 인근)',
  lat: 37.5609,
  lng: 126.986,
  source: 'DEMO',
});

export const DEMO_CLINIC = Object.freeze({
  roadAddress: '데모 주소 · 서울 강남구 신사동 일대',
  buildingName: '데모 의원 (신사동)',
  lat: 37.5163,
  lng: 127.0203,
  source: 'DEMO',
});

/** 체류에 넣는 병원 이름·전화 — 보호자 스냅샷·일정 요청에 실리면 안 되는 값이다 */
export const HOSPITAL_NAME = '데모 성형외과 E2E';
export const HOSPITAL_PHONE = '02-0000-0000';
export const LODGING_NAME = '데모 숙소 E2E';

// ── 조건 항목 (spec 5.1 ConditionItems) ─────────────────────────────

const NONE = Object.freeze({ kind: 'NONE' });
const YES = Object.freeze({ kind: 'SET', value: true });
const UNKNOWN = Object.freeze({ kind: 'UNKNOWN' });

/** 본인 체크 — 외출 허용, 복귀 시각 병원이 정하지 않음, 걷기 모르겠음(기본값 15분), 열·물·매운·뜨거운·술 피함 */
export function selfItems(overrides = {}) {
  return {
    outing: 'ALLOWED',
    returnTime: { kind: 'NOT_SET' },
    walkLimit: UNKNOWN,
    travelLimit: NONE,
    avoidUv: NONE,
    avoidHeat: YES,
    avoidWater: YES,
    escortRequired: NONE,
    guardianMustStay: NONE,
    mealRestriction: NONE,
    diet: { spicy: YES, alcohol: YES, hard: NONE, hot: YES, raw: NONE },
    medication: NONE,
    ...overrides,
  };
}

/**
 * 체류(spec 5.1 Stay). 기본: 어제 입국 → 4일 뒤 출국, 강남 데모 숙소, 어제 수술·시술, 이틀 뒤 진료,
 * 체류 전체를 덮는 본인 체크 기간, 민감정보 동의 있음.
 * @param {object} [o]
 */
export function buildStay({
  arrival = -1,
  departure = 4,
  arrivalTime = '09:00',
  departureTime = '20:00',
  hasCompanion = false,
  pace = 'NORMAL',
  interests = [],
  procedure = -1,
  visit = 2,
  consent = true,
  periods,
  items = selfItems(),
  lodgings,
} = {}) {
  const nowIso = new Date().toISOString();
  const appointments = [{ id: 'appt-e2e-1', hospitalId: 'hosp-e2e-1', type: 'PROCEDURE', date: kstDate(procedure), start: '14:00', source: 'USER' }];
  if (visit !== null) {
    appointments.push({ id: 'appt-e2e-2', hospitalId: 'hosp-e2e-1', type: 'VISIT', date: kstDate(visit), start: '11:00', source: 'USER' });
  }
  return {
    schemaVersion: 2,
    arrival: { date: kstDate(arrival), time: arrivalTime, airport: 'ICN' },
    departure: { date: kstDate(departure), time: departureTime, airport: 'ICN' },
    hasCompanion,
    interests,
    pace,
    lodgings: lodgings ?? [
      { id: 'lodg-e2e-1', name: LODGING_NAME, address: { ...DEMO_LODGING }, checkIn: kstDate(arrival), checkOut: kstDate(departure) },
    ],
    hospitals: [{ id: 'hosp-e2e-1', name: HOSPITAL_NAME, address: { ...DEMO_CLINIC }, phone: HOSPITAL_PHONE }],
    appointments,
    periods:
      periods ??
      (consent ? [{ id: 'self-e2e-1', source: 'SELF', startDate: kstDate(arrival), endDate: kstDate(departure), items }] : []),
    linkedPlans: [],
    consent: { sensitive: consent ? { version: 'sensitive-2026-09-draft1', agreedAt: nowIso } : null },
    guardianShare: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// ── 로그인·기기 저장소 ───────────────────────────────────────────────

/** 데모 로그인 — 세션 쿠키를 받고 returnTo 로 간다 */
export async function loginDemo(page, returnTo = '/more') {
  await page.goto(`/api/auth/login?provider=demo&returnTo=${encodeURIComponent(returnTo)}`);
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
}

/** 서버가 준 불투명 계정 키 — 기기 저장소 이름공간 */
export async function accountKeyOf(page) {
  const body = await page.evaluate(async () => (await fetch('/api/auth/session', { cache: 'no-store' })).json());
  expect(body.authenticated, '로그인되어 있어야 한다').toBe(true);
  return body.accountKey;
}

/**
 * 체류를 기기 저장소에 심는다. 로그인한 페이지에서 부른다. 심은 뒤 path 로 이동하면 앱이 일정을 만든다.
 * @param {import('@playwright/test').Page} page
 * @param {object} stay buildStay() 결과
 * @param {{confirmToday?: boolean}} [options] 오늘 매일 확인을 마친 것으로 둔다
 */
export async function seedStay(page, stay, { confirmToday = false } = {}) {
  const key = await accountKeyOf(page);
  const prefs = confirmToday ? { notifications: false, dailyCheck: { [kstDate(0)]: 'CONFIRMED' } } : null;
  await page.evaluate(
    ({ key, stay, prefs }) => {
      localStorage.setItem(`safehour.v2.${key}.stay`, JSON.stringify({ schemaVersion: 2, data: stay }));
      if (prefs) localStorage.setItem(`safehour.v2.${key}.prefs`, JSON.stringify({ schemaVersion: 2, data: prefs }));
    },
    { key, stay, prefs },
  );
  return key;
}

/** 기기에 저장된 계정 항목 하나 (없으면 null) */
export async function readRecord(page, record) {
  return page.evaluate((record) => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('safehour.v2.') && k.endsWith(`.${record}`) && !k.includes('.device.')) {
        try {
          return JSON.parse(localStorage.getItem(k)).data;
        } catch {
          return null;
        }
      }
    }
    return null;
  }, record);
}

/** 전체 일정이 기기에 저장될 때까지 기다린다 */
export async function waitForTripPlan(page, { minDays = 1 } = {}) {
  await expect
    .poll(async () => Object.keys((await readRecord(page, 'tripPlan'))?.days ?? {}).length, {
      message: '전체 일정이 기기에 저장되지 않았다',
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(minDays);
  return readRecord(page, 'tripPlan');
}

/**
 * 로그인 → 체류 심기 → path 로 이동 → 전체 일정 저장까지.
 * @returns {Promise<{stay: object, tripPlan: object}>}
 */
export async function startTrip(page, stayOptions = {}, { path = '/today', confirmToday = true } = {}) {
  await loginDemo(page, '/privacy');
  const stay = buildStay(stayOptions);
  await seedStay(page, stay, { confirmToday });
  await page.goto(path);
  const tripPlan = await waitForTripPlan(page);
  return { stay, tripPlan };
}

/** 오늘 이후 가장 가까운 날짜 중 환자 정거장이 있는 날 */
export function firstDayWithStops(tripPlan, { from = kstDate(0), notToday = false } = {}) {
  return Object.values(tripPlan.days)
    .filter((d) => d.date >= from && (!notToday || d.date !== kstDate(0)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .find((d) => (d.outings ?? []).some((o) => (o.stops ?? []).length > 0));
}

/**
 * 오늘 이후 날짜에서 편집할 정거장 하나를 고른다 — 교체·삭제 테스트용.
 * 식사 정거장은 메뉴 원문이 있는 식당이 드물어 교체 후보가 없을 수 있다(보고한 제품 소견).
 * @param {object} tripPlan
 * @param {{from?: string, meal?: boolean}} [options] meal=true 면 식사 정거장을 고른다
 * @returns {{date: string, day: object, stop: object} | null}
 */
export function findEditableStop(tripPlan, { from = kstDate(1), meal = false } = {}) {
  const days = Object.values(tripPlan.days)
    .filter((d) => d.date >= from)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const day of days) {
    const stop = stopsOf(day).find((s) => Boolean(s.isMeal) === meal);
    if (stop) return { date: day.date, day, stop };
  }
  return null;
}

export function stopsOf(day, role = 'P') {
  return (role === 'P' ? day.outings : day.guardianOutings).flatMap((o) => o.stops ?? []);
}

/**
 * 오늘 게이트 덧씌우기(매일 확인 대기·확인하지 않은 병원 안내) 배너 검사 (규칙 32·49).
 * 덧씌우기는 **강등만** 한다 — 저장된 오늘이 이미 NO_TOURISM 이면(늦은 시각이라 외출 창이 없을 때 등)
 * 그 상태를 그대로 두고 사유만 얹는다(src/stay/todayGate.js). 그래서 저장값에 맞춰 기대값을 정한다.
 * @param {import('@playwright/test').Page} page
 * @param {object} storedDay 저장된 오늘 DayPlan
 * @param {string} reasonText 덧씌운 사유 문구
 */
export async function expectTodayGateBanner(page, storedDay, reasonText) {
  const banner = page.locator('.state-banner');
  await expect(banner).toContainText(reasonText);
  const demoted = ['TOGETHER', 'SPLIT_NEARBY'].includes(storedDay.dayState) ? 'STANDBY' : storedDay.dayState;
  await expect(banner).toHaveClass(new RegExp(`state-${demoted}`));
  return banner;
}

// ── 접근성·반응형 ─────────────────────────────────────────────────

/** WCAG 2.1 A/AA 규칙만 본다 — 실험적·모범사례 규칙은 관문으로 쓰지 않는다 */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** axe 로 WCAG 2.1 AA 위반이 0건인지 본다 */
export async function expectNoAxeViolations(page, where) {
  // 시트가 떠오르는 애니메이션(투명도 0.6→1) 도중에는 대비가 실제보다 낮게 잰다 — 끝난 뒤의 화면을 본다.
  // 끝이 없는 애니메이션(처리 중 버튼·로딩의 회전 표시)은 finished 가 오지 않으므로 기다리지 않는다
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  expect(violations, `${where} 접근성 위반:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

/** 가로 스크롤이 생기지 않아야 한다 */
export async function expectNoHorizontalScroll(page, where) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(
    Math.max(box.scrollWidth, box.bodyScrollWidth),
    `${where}: 가로 스크롤 발생 (${box.scrollWidth} > ${box.clientWidth})`,
  ).toBeLessThanOrEqual(box.clientWidth + 1);
}

/**
 * 보이는 버튼·링크·입력의 터치 대상이 44px 이상인지 본다 (spec 7장).
 * 문장 안의 인라인 링크는 WCAG 2.5.5 예외(inline)라 뺀다.
 */
export async function expectTouchTargets(page, where, min = 44) {
  const small = await page.evaluate((min) => {
    const out = [];
    const nodes = document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], summary',
    );
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest('[aria-hidden="true"], .visually-hidden')) continue;
      // 문장 속 인라인 링크는 예외(WCAG 2.5.5 Inline)
      if (el.tagName === 'A' && style.display === 'inline') continue;
      // 라디오·체크박스는 연결된 label(감싼 것 또는 for=)을 눌러도 켜진다 — label 이 터치 대상이다
      if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
        const labels = [...(el.labels ?? [])];
        if (labels.some((label) => label.getBoundingClientRect().height >= min)) continue;
      }
      if (rect.height < min - 0.5) {
        const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('name') || el.tagName).trim().slice(0, 30);
        out.push(`${text} (${Math.round(rect.width)}×${Math.round(rect.height)})`);
      }
    }
    return out;
  }, min);
  expect(small, `${where}: ${min}px 미만 터치 대상`).toEqual([]);
}


// ── 계산된 모양 재기 ─────────────────────────────────────────────────

/** 요소의 계산된 스타일 몇 가지를 { 속성: 값 } 으로 */
export async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

/** 위 상자 아래 끝과 아래 상자 위 끝 사이 틈(px, 반올림). boundingBox() 결과 두 개를 받는다 */
export function gapBetween(upper, lower) {
  return Math.round(lower.y - (upper.y + upper.height));
}

// ── 증빙 화면 캡처 ─────────────────────────────────────────────────

/**
 * E2E_EVIDENCE_DIR 이 있을 때만 화면을 남긴다(최종 검증 증빙용). 없으면 아무것도 하지 않는다.
 * @param {import('@playwright/test').Page} page
 * @param {string} name 파일 이름(확장자 없이)
 */
export async function evidenceShot(page, name, { fullPage = true } = {}) {
  const dir = process.env.E2E_EVIDENCE_DIR;
  if (!dir) return;
  await page.screenshot({ path: `${dir.replace(/\/$/, '')}/${name}.png`, fullPage, animations: 'disabled' });
}

// ── 병원 연동(데모) ─────────────────────────────────────────────────

export const DEMO_PLAN_LABEL = Object.freeze({
  A: '예시 A — 외출 가능',
  B: '예시 B — 외출 제한',
  C: '예시 C — 지침 만료',
});

/**
 * /link 에서 데모 지침을 받아 체류의 병원(기본: 등록한 병원)에 연결한다.
 * 호출 전에 setClock 으로 시계를 아침(예: 10:00)에 고정해야 한다. 저녁에 오늘 일정에 연결하면 진행 중인 외출이 복귀 마감을 못 지켜
 * OUTING_OVERDUE 가 켜지고 "지금 돌아가세요" 시트가 화면을 덮어 뒤따르는 클릭이 막힌다.
 * @param {'A'|'B'|'C'} which
 */
export async function linkDemoPlan(page, which, { hospitalName = HOSPITAL_NAME } = {}) {
  await page.goto('/link');
  await page.getByRole('button', { name: DEMO_PLAN_LABEL[which] }).click();
  await expect(page.getByRole('heading', { name: '어느 병원의 지침인가요?' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(hospitalName) }).check();
  await page.getByRole('button', { name: '이 병원으로 연결' }).click();
  await expect(page.getByRole('heading', { name: '연결했어요' })).toBeVisible();
}

/** 병원 안내를 모두 확인한다 — 확인하지 않은 중요 안내가 있으면 오늘이 STANDBY 로 덧씌워진다 */
export async function acknowledgeGuide(page) {
  await page.goto('/guide');
  await page.getByRole('button', { name: '전체 확인 처리' }).click();
  await expect(page.getByText('중요 안내를 모두 확인했어요.')).toBeVisible();
}

/**
 * 데모 사건 패널이 있는 오늘 일정(/trip/오늘)을 연다.
 * 데모 지침 A 를 연결하고 병원 안내를 확인한 뒤, 오늘 일정에 병원 발행 출처가 실리면 연다
 * (demo-events·screen-day·screen-today spec 이 함께 쓴다).
 * linkDemoPlan 과 같은 이유로 호출 전에 setClock 으로 시계를 아침(예: 10:00)에 고정해야 한다.
 * @returns {Promise<import('@playwright/test').Locator>} 데모 사건 패널 region
 */
export async function openDemoToday(page) {
  await startTrip(page);
  await linkDemoPlan(page, 'A');
  await acknowledgeGuide(page);
  const today = kstDate(0);
  await expect
    .poll(async () => JSON.stringify((await readRecord(page, 'tripPlan'))?.days?.[today]?.effective ?? {}).includes('HOSPITAL'), {
      message: '데모 지침 연결 뒤 오늘 재계획',
    })
    .toBe(true);
  await page.goto(`/trip/${today}`);
  const panel = page.getByRole('region', { name: '변화 시연 (병원 연동 데모)' });
  await expect(panel).toBeVisible();
  return panel;
}

/** 사건 버튼이 눌릴 수 있을 때까지(동기화 중이 아닐 때) 기다렸다가 누른다 */
export async function fireDemoEvent(panel, name) {
  const button = panel.getByRole('button', { name });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  await button.click();
}

// ── 보호자 링크 ─────────────────────────────────────────────────

export const GUARDIAN_CONSENT_LABEL = '위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)';

/**
 * 보호자 링크를 만들고 링크 글자를 돌려준다.
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.pin 6자리 PIN
 * @param {boolean} [options.open] /guardian 으로 가서 담기는 내용 안내가 보이는지부터 본다(아니면 이미 연 화면에서 시작한다)
 * @param {boolean} [options.verify] 만든 뒤 링크 모양(/g#암호문)과 PIN 따로 보내기 안내를 확인한다
 */
export async function createGuardianLink(page, { pin, open = false, verify = false }) {
  if (open) {
    await page.goto('/guardian');
    await expect(page.getByRole('heading', { name: '보호자에게 보내는 내용' })).toBeVisible();
    await expect(page.getByText('병원 이름·주소·전화, 병원 안내문, 병원 일정')).toBeVisible();
  }
  await page.getByLabel(GUARDIAN_CONSENT_LABEL).check();
  await page.getByLabel('PIN (숫자 6자리)').fill(pin);
  await page.getByLabel('PIN 확인 (한 번 더)').fill(pin);
  await page.getByRole('button', { name: '링크 만들기' }).click();
  const field = page.getByLabel('링크', { exact: true });
  if (!verify) return field.inputValue();
  await expect(field).toBeVisible();
  const link = await field.inputValue();
  expect(link).toMatch(/\/g#[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByText('PIN은 링크와 함께 보내지 말고 따로 알려 주세요.')).toBeVisible();
  return link;
}

/**
 * 보호자 사본을 이 기기에 가져온다: 동반 보호자 체류로 링크를 만들고, 같은 기기에서 링크를 열어 PIN 을 넣는다.
 * 끝나면 /g 의 '받은 일정' 화면이다. 환자와 보호자가 같은 데모 계정이므로 체류도 함께 남아 있다.
 * @param {import('@playwright/test').Page} page
 * @param {{pin?: string}} [options]
 */
export async function importGuardianCopy(page, { pin = '135790' } = {}) {
  await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
  const link = await createGuardianLink(page, { pin });
  await page.goto(link);
  await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(pin);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
  await expect.poll(async () => Object.keys((await readRecord(page, 'guardianCopies')) ?? {}).length).toBe(1);
}

/** 이 계정의 체류와 전체 일정을 기기에서 지운다(보호자 사본은 남는다). 보호자만 쓰는 기기를 흉내 낸다 */
export async function removeStayAndPlan(page) {
  const key = await accountKeyOf(page);
  await page.evaluate((key) => {
    localStorage.removeItem(`safehour.v2.${key}.stay`);
    localStorage.removeItem(`safehour.v2.${key}.tripPlan`);
  }, key);
}
