// E2E 공통 헬퍼 (AX-322) — 날짜·체류 만들기·기기 저장소 심기·접근성·반응형 검사
//
// 체류는 두 길로 만든다.
//   - 시나리오 1(core-flow.spec.js)은 화면으로 처음부터 끝까지 입력한다.
//   - 나머지 시나리오는 같은 모양의 체류를 기기 저장소(localStorage)에 바로 심고 앱을 연다.
//     앱이 여는 순간 일정 동기화(lib/trip)가 전체 일정을 한 번 만들어 저장한다 — 서버 판정은 실제 코드다.
//
// 날짜는 모두 **한국 달력 날짜**(KST)다. 테스트가 언제 돌든 '오늘'을 기준으로 상대 날짜를 쓴다.

import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── 날짜 ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 오늘(KST)에서 n일 뒤의 'YYYY-MM-DD' */
export function kstDate(offsetDays = 0, nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** 지금 KST 분(0–1439) */
export function kstMinutes(nowMs = Date.now()) {
  const d = new Date(nowMs + KST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
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
  // 시트가 떠오르는 애니메이션(투명도 0.6→1) 도중에는 대비가 실제보다 낮게 잰다 — 끝난 뒤의 화면을 본다
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
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
