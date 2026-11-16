// 서버 알림 환자 쪽 화면 테스트 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 11, D16)
//
// - 보호자 링크 동의 화면의 서버 알림 항목, 외출 카드와 복귀 시트의 '돌아왔어요'·되돌리기, 설정의 '서버 알림' 절,
//   내 정보 지우기의 서버 삭제 대기를 본다. 다른 탭이 마지막 계정 키를 바꾸면 보이던 링크 결과가 사라지는 것도 본다.
// - e2e 서버는 서버 알림 스위치가 꺼진 채 돈다. 첫 시험만 실제 서버의 꺼진 스위치를 보고, 나머지는 stubServerPush 대역으로
//   켜진 서버를 흉내 낸다(응답 모양은 docs/contracts.md '서버 알림' 그대로).
// - 지켜보기 레코드는 seedGuardianWatch 로 기기에 심는다. 같은 탭은 storage 이벤트를 받지 않으므로 심은 뒤 이동한다.
// - 시각이 필요한 곳은 setClock/advanceClock 으로 서버와 브라우저를 함께 옮긴다. 오전 10시 기본 체류는 숙소로 돌아오는 외출
//   둘이 같은 복귀 마감을 나눠 갖는다(다르게 정한 것 25를 본다). 오전 8시 오늘 진료 체류는 병원으로 돌아오는 외출이 먼저 있다.
// - 오프라인: context.setOffline(true) 여도 route 대역은 계속 응답하므로 대역의 offline 도 함께 켠다.
// - 모든 시험에서 화면에 '안전합니다'가 없다.

import { test, expect } from './fixtures.js';
import { isClampedOverdueOuting } from '../src/domain/states.js';
import {
  GUARDIAN_CONSENT_LABEL,
  HOSPITAL_NAME,
  LODGING_NAME,
  WATCH_FIXTURE,
  acknowledgeGuide,
  advanceClock,
  createGuardianLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectTouchTargets,
  fireDemoEvent,
  kstDate,
  kstMinutes,
  linkDemoPlan,
  readRecord,
  seedGuardianWatch,
  setClock,
  startTrip,
  stubServerPush,
} from './helpers.js';

const PIN = '482915';
const WATCH_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const WRITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const PUSH_TITLE = '서버 알림 (선택)';
const PUSH_LABEL = '서버 알림 사용: 앱이 닫혀 있어도 보호자에게 알림을 보내요';
const HINT = '돌아왔다면 눌러 주세요. 누르지 않으면 마감 뒤 보호자에게 서버 알림이 갈 수 있어요.';
const QUEUED = '아직 전달하지 못했어요. 다시 보낼게요.';
const SENT = '보호자에게 전달했어요.';
const OFFLINE_TITLE = '인터넷 연결 없음, 저장된 일정만 보여 줘요';
const CLEAR_NOTE_PUSH = "서버 알림을 켜 두면 날짜별 복귀 마감 시각과 '돌아왔어요' 기록이 서버에 저장됩니다.";
const PENDING_DELETE_KEY = 'safehour.v2.device.pendingServerDelete';
const LAST_ACCOUNT_KEY = 'safehour.v2.device.lastAccountKey';

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const byDepart = (a, b) => minutesOf(a.departAt) - minutesOf(b.departAt);

/** 켜진 지켜보기 레코드(아직 올린 적 없음). 출국일은 buildStay 기본값(4일 뒤)이다 */
function onRecord(overrides = {}) {
  return {
    ...WATCH_FIXTURE,
    expiresOn: kstDate(4),
    lastUploaded: {},
    uploadPending: true,
    backQueue: [],
    confirmed: [],
    state: 'ON',
    ...overrides,
  };
}

/** 그날 환자 외출 중 같은 복귀 마감을 나눠 갖는 둘(먼저 출발한 것, 나중 출발한 것) */
function sharedDeadlinePair(day) {
  const outings = [...(day?.outings ?? [])].filter((o) => o.departAt && o.returnBy).sort(byDepart);
  for (let i = outings.length - 1; i > 0; i -= 1) {
    const earlier = outings.slice(0, i).find((o) => o.returnBy === outings[i].returnBy);
    if (earlier) return { earlier, later: outings[i] };
  }
  return null;
}

/** 그날 가장 늦게 출발하는 환자 외출(같은 마감의 나중 외출이 없어 '돌아왔어요'가 있다) */
function latestOuting(day) {
  const outings = [...(day?.outings ?? [])].filter((o) => o.departAt && o.returnBy).sort(byDepart);
  return outings[outings.length - 1] ?? null;
}

/** 옮긴 시계를 오늘 그 분(0시부터 센 분)으로 보낸다 */
async function moveTo(page, minute) {
  await advanceClock(page, (minute - kstMinutes()) * 60_000);
}

const focusCard = (page) => page.locator('.today-focus');
const backButton = (scope) => scope.getByRole('button', { name: '돌아왔어요', exact: true });
const undoButton = (scope) => scope.getByRole('button', { name: '되돌리기', exact: true });

async function expectNoSafeClaim(page) {
  await expect(page.locator('body')).not.toContainText('안전합니다');
}

async function readPendingDelete(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw).data;
  }, PENDING_DELETE_KEY);
}

/** 서비스 워커가 이 페이지를 제어하고 그 경로를 캐시했을 때까지 기다린다 (offline.spec.js 와 같은 방식) */
async function waitForServiceWorker(page, paths) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  for (const path of paths) {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForLoadState('networkidle');
  }
  await expect
    .poll(() =>
      page.evaluate(async (paths) => {
        const found = new Set();
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const req of await cache.keys()) found.add(new URL(req.url).pathname);
        }
        return paths.every((p) => found.has(p)) && ![...found].some((p) => p.startsWith('/api/'));
      }, paths),
    )
    .toBe(true);
}

/** 접근성 위반 0, 누르는 곳 44px 이상, 320px 가로 스크롤 없음 */
async function expectAccessible(page, where) {
  await expectNoAxeViolations(page, where);
  await expectTouchTargets(page, where);
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalScroll(page, `${where} 320px`);
  await page.setViewportSize({ width: 360, height: 780 });
}

test.describe('서버 알림 환자 쪽 화면', () => {
  test('스위치가 꺼져 있으면 동의 화면에 서버 알림 항목이 없고 /api/watch 요청이 0건이다', async ({ page }) => {
    // 대역 없이 실제 서버(스위치 꺼짐)를 본다
    const watchRequests = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === '/api/watch' || pathname.startsWith('/api/watch/')) watchRequests.push(`${request.method()} ${pathname}`);
    });
    const isConfig = (response) => new URL(response.url()).pathname === '/api/push/config';
    const guardianConfig = page.waitForResponse(isConfig);
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    expect(await (await guardianConfig).json()).toEqual({
      ok: true,
      enabled: false,
      vapidPublicKey: null,
      guardianLoginRequired: expect.any(Boolean),
    });

    await expect(page.getByRole('heading', { name: '보호자에게 보내는 내용' })).toBeVisible();
    await expect(page.getByText(PUSH_TITLE)).toHaveCount(0);
    await expect(page.getByLabel(PUSH_LABEL)).toHaveCount(0);
    await createGuardianLink(page, { pin: PIN, verify: true });
    await expect(page.locator('.guardian-push-result')).toHaveCount(0);

    // 설정 화면도 예전과 같다(서버 알림 절 없음)
    const settingsConfig = page.waitForResponse(isConfig);
    await page.goto('/settings');
    await settingsConfig;
    await expect(page.getByRole('heading', { name: '내 정보' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '서버 알림', exact: true })).toHaveCount(0);
    await expect(page.locator('.ui-block')).toHaveCount(4);

    expect(watchRequests).toEqual([]);
    expect(await readRecord(page, 'guardianWatch')).toBeNull();
    await expectNoSafeClaim(page);
  });

  test('켜져 있으면 항목은 기본 꺼짐, 켜고 만들면 등록 본문(22자·43자·출국일) 다음 마감 올리기가 가고 레코드가 ON 이다', async ({ page }) => {
    const stub = await stubServerPush(page);
    const { stay } = await startTrip(page, { hasCompanion: true }, { path: '/guardian' });

    await expect(page.getByRole('heading', { name: PUSH_TITLE })).toBeVisible();
    await expect(page.getByText('보관하지 않는 것: 장소, 위치, 몸 상태와 조건, 병원 정보')).toBeVisible();
    const option = page.getByLabel(PUSH_LABEL);
    await expect(option).not.toBeChecked();
    await option.check();
    await createGuardianLink(page, { pin: PIN, verify: true });
    await expect(page.locator('.guardian-push-result')).toContainText('서버 알림을 켰어요.');

    // 등록 본문: 허용 목록 키만, 형식에 맞는 id·토큰, 출국일
    const registers = stub.sent('POST', '/api/watch');
    expect(registers).toHaveLength(1);
    const { body: register } = registers[0];
    expect(Object.keys(register).sort()).toEqual(['expiresOn', 'watchId', 'writeToken']);
    expect(register.watchId).toMatch(WATCH_ID_RE);
    expect(register.writeToken).toMatch(WRITE_TOKEN_RE);
    expect(register.expiresOn).toBe(stay.departure.date);

    // 등록 다음 마감 올리기(같은 id·토큰). 날짜와 시각만 싣는다
    await expect.poll(() => stub.sent('PUT', '/api/watch/deadlines').length).toBeGreaterThan(0);
    const order = stub.calls.filter((c) => c.path.startsWith('/api/watch')).map((c) => `${c.method} ${c.path}`);
    expect(order.slice(0, 2)).toEqual(['POST /api/watch', 'PUT /api/watch/deadlines']);
    const { body: upload } = stub.sent('PUT', '/api/watch/deadlines')[0];
    expect(Object.keys(upload).sort()).toEqual(['days', 'expiresOn', 'watchId', 'writeToken']);
    expect(upload).toMatchObject({ watchId: register.watchId, writeToken: register.writeToken, expiresOn: stay.departure.date });
    expect(upload.days.length).toBeGreaterThan(0);
    for (const day of upload.days) {
      expect(Object.keys(day).sort()).toEqual(['date', 'deadlines']);
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const time of day.deadlines) expect(time).toMatch(/^\d{2}:\d{2}$/);
    }
    const sentText = JSON.stringify(stub.calls.map((c) => c.body));
    for (const value of [LODGING_NAME, HOSPITAL_NAME, '37.', '127.']) expect(sentText).not.toContain(value);

    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.uploadPending).toBe(false);
    const record = await readRecord(page, 'guardianWatch');
    expect(record).toMatchObject({ watchId: register.watchId, writeToken: register.writeToken, expiresOn: stay.departure.date, state: 'ON' });
    await expectNoSafeClaim(page);
  });

  test('다른 탭이 마지막 계정 키를 바꾸면 보이던 링크 결과가 사라지고, 곧바로 세션을 다시 물어 양식부터 새로 시작한다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await createGuardianLink(page, { pin: PIN, verify: true });
    const resultHeading = page.getByRole('heading', { name: '보호자에게 보낼 링크' });
    await expect(resultHeading).toBeVisible();
    const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data.accountKey, LAST_ACCOUNT_KEY);
    let sessionChecks = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/session') sessionChecks += 1;
    });

    // 다른 탭이 다른 계정으로 로그인해 마지막 계정 키를 쓴 것처럼 키만 바꾼다(데모 로그인은 계정이 하나라 쿠키는 그대로다)
    const other = await context.newPage();
    await other.goto('/privacy');
    await other.evaluate(
      ({ key, accountKey }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, data: { accountKey } })),
      { key: LAST_ACCOUNT_KEY, accountKey: 'acct_other_tab_e2e_B0001' },
    );
    await other.close();

    await expect(resultHeading).toHaveCount(0);
    await expect.poll(() => sessionChecks).toBeGreaterThan(0);
    // 쿠키는 그대로라 다시 물은 답으로 이 계정에 돌아온다. 앞의 링크 결과는 다시 나타나지 않고 양식이 처음 상태다
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data.accountKey, LAST_ACCOUNT_KEY)).toBe(before);
    await expect(page.getByLabel(GUARDIAN_CONSENT_LABEL)).toBeVisible();
    await expect(page.getByLabel(GUARDIAN_CONSENT_LABEL)).not.toBeChecked();
    await expect(page.getByLabel('PIN (숫자 6자리)')).toHaveValue('');
    await expect(resultHeading).toHaveCount(0);
    await expectNoSafeClaim(page);
  });

  test('등록이 401 이면 링크는 만들어지고 Google·카카오 로그인 줄이 보이며 레코드가 없다', async ({ page }) => {
    const stub = await stubServerPush(page, { register: 401 });
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });

    await page.getByLabel(PUSH_LABEL).check();
    await createGuardianLink(page, { pin: PIN, verify: true });
    const result = page.locator('.guardian-push-result');
    await expect(result).toContainText('서버 알림은 켜지 못했어요. 링크는 만들었어요.');
    await expect(result).toContainText('서버 알림은 Google 또는 카카오로 로그인해야 켤 수 있어요.');
    expect(stub.sent('POST', '/api/watch')).toHaveLength(1);
    expect(stub.sent('PUT', '/api/watch/deadlines')).toHaveLength(0);
    expect(await readRecord(page, 'guardianWatch')).toBeNull();
    await expectNoSafeClaim(page);
  });

  test('경우 1 시트: 돌아왔어요를 누르면 본문 { date: 오늘, by: 마감 }, "보호자에게 전달했어요"와 되돌리기, 시트는 열린 채, 되돌리기는 undo: true', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    const stub = await stubServerPush(page);
    const { tripPlan } = await startTrip(page);
    await seedGuardianWatch(page, onRecord());
    const lodging = tripPlan.days[today].outings
      .filter((o) => o.returnPlace === 'LODGING' && o.returnBy)
      .sort((a, b) => minutesOf(a.returnBy) - minutesOf(b.returnBy));
    expect(lodging.length, '오늘 숙소로 돌아오는 환자 외출이 있어야 한다').toBeGreaterThan(0);
    const by = lodging[lodging.length - 1].returnBy;

    // 마감 3분 전에 열어 두고 4분 흘려 마감 지남 시트를 띄운다(overdue-return.spec.js 경우 1과 같은 준비)
    await moveTo(page, minutesOf(by) - 3);
    await page.goto(`/trip/${today}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await advanceClock(page, 4 * 60_000, { run: true });
    const sheet = page.getByRole('dialog', { name: '복귀 마감 시각이 지났어요' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(HINT);

    await backButton(sheet).click();
    await expect(sheet).toContainText(SENT);
    await expect(undoButton(sheet)).toBeVisible();
    await expect(sheet).toBeVisible();
    const backs = stub.sent('POST', '/api/watch/back');
    expect(backs).toHaveLength(1);
    expect(backs[0].body).toEqual({ ...WATCH_FIXTURE, date: today, by });
    // 서버가 기록한 확인은 기기에 남는다(누른 시각은 기기에만 있고 본문에는 없다)
    await expect
      .poll(async () => ((await readRecord(page, 'guardianWatch'))?.confirmed ?? []).map((c) => `${c.date} ${c.by}`))
      .toEqual([`${today} ${by}`]);

    await undoButton(sheet).click();
    await expect.poll(() => stub.sent('POST', '/api/watch/back').length).toBe(2);
    expect(stub.sent('POST', '/api/watch/back')[1].body).toEqual({ ...WATCH_FIXTURE, date: today, by, undo: true });
    await expect(backButton(sheet)).toBeVisible();
    await expect(sheet).toContainText(HINT);
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.confirmed).toEqual([]);
    await expectNoSafeClaim(page);
  });

  test('오프라인에서 새로 고쳐도 버튼이 있고, 누르면 대기 줄과 요청 0건·대기열 1건, 온라인이 되면 보내고 "전달했어요"', async ({ page, context }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    const stub = await stubServerPush(page);
    const { tripPlan } = await startTrip(page);
    const pair = sharedDeadlinePair(tripPlan.days[today]);
    expect(pair, '시드에 같은 복귀 마감을 나눠 갖는 외출 둘이 있어야 한다').toBeTruthy();
    const { later } = pair;
    await seedGuardianWatch(page, onRecord());
    await moveTo(page, minutesOf(later.departAt) + 1);
    await waitForServiceWorker(page, ['/today']);
    await expect(backButton(focusCard(page))).toBeVisible();
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.uploadPending).toBe(false);

    stub.set({ offline: true });
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator('.ui-readonly .ui-readonly-title')).toHaveText(OFFLINE_TITLE);
      const card = focusCard(page);
      await expect(card.getByRole('heading', { name: '지금 외출 중' })).toBeVisible();
      // 스위치를 읽지 못했어도(오프라인) 버튼을 숨기지 않는다: 서버에는 그 마감이 남아 있다
      await expect(backButton(card)).toBeVisible();
      expect(stub.blocked.some((c) => c.path === '/api/push/config')).toBe(true);

      await backButton(card).click();
      await expect(card).toContainText(QUEUED);
      await expect(undoButton(card)).toBeVisible();
      expect(stub.sent('POST', '/api/watch/back')).toHaveLength(0);
      expect(stub.blocked.filter((c) => c.path === '/api/watch/back')).toHaveLength(0);
      const queued = await readRecord(page, 'guardianWatch');
      expect(queued.backQueue).toHaveLength(1);
      expect(queued.backQueue[0]).toMatchObject({ date: today, by: later.returnBy, undo: false });

      // 새로 고쳐도 대기열에서 대기 줄을 다시 만든다. 이 흉내에서는 새로 연 페이지가 세션 확인에 실패하기 전에 한 번 보내 보고
      // 연결 없음으로 끝날 수 있다(아래 navigator.onLine 설명). 그래도 서버에 닿은 요청은 없다
      await page.reload();
      await expect(focusCard(page)).toContainText(QUEUED);
      await expect(backButton(focusCard(page))).toHaveCount(0);
      expect(stub.sent('POST', '/api/watch/back')).toHaveLength(0);
    } finally {
      stub.set({ offline: false });
      await context.setOffline(false);
    }
    // Playwright 의 오프라인 흉내에서는 오프라인으로 새로 연 페이지의 navigator.onLine 이 true 라, 다시 연결해도 online 이벤트가
    // 오지 않는다(docs/engineering-notes.md). 실제 브라우저가 연결이 돌아올 때 보내는 online 이벤트를 대신 보낸다
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(focusCard(page)).toContainText(SENT);
    const backs = stub.sent('POST', '/api/watch/back');
    expect(backs).toHaveLength(1);
    expect(backs[0].body).toEqual({ ...WATCH_FIXTURE, date: today, by: later.returnBy });
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.backQueue).toEqual([]);
    const sent = await readRecord(page, 'guardianWatch');
    expect(sent.confirmed.map((c) => `${c.date} ${c.by}`)).toEqual([`${today} ${later.returnBy}`]);
    await expectNoSafeClaim(page);
  });

  test('보기 전용(쿠키 없음)에서도 누를 수 있고 돌아왔어요 요청은 가지만 마감 올리기는 0건이다', async ({ page, context }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    const stub = await stubServerPush(page);
    const { tripPlan } = await startTrip(page);
    const last = latestOuting(tripPlan.days[today]);
    expect(last, '오늘 환자 외출이 있어야 한다').toBeTruthy();
    await seedGuardianWatch(page, onRecord());
    // 서버 세션이 사라진다(screen-guardian.spec.js 와 같은 방식). 심은 레코드는 이 뒤에 처음 읽힌다
    await context.clearCookies();
    await moveTo(page, minutesOf(last.departAt) + 1);
    await page.goto('/today');
    await expect(page.locator('.ui-readonly')).toContainText('보기 전용');

    const card = focusCard(page);
    await expect(backButton(card)).toBeVisible();
    await backButton(card).click();
    await expect(card).toContainText(SENT);
    const backs = stub.sent('POST', '/api/watch/back');
    expect(backs).toHaveLength(1);
    expect(backs[0].body).toEqual({ ...WATCH_FIXTURE, date: today, by: last.returnBy });
    expect(stub.sent('PUT', '/api/watch/deadlines')).toHaveLength(0);
    const record = await readRecord(page, 'guardianWatch');
    expect(record.lastUploaded).toEqual({});
    expect(record.uploadPending).toBe(true);
    expect(record.backQueue).toEqual([]);
    expect(record.confirmed.map((c) => `${c.date} ${c.by}`)).toEqual([`${today} ${last.returnBy}`]);
    await expectNoSafeClaim(page);
  });

  test('경우 2 시트: by 는 이미 올린 원래 마감이고, 당긴 마감은 올리지 않는다', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T08:00` });
    const stub = await stubServerPush(page);
    // 오늘 병원 일정이 있는 체류: 병원으로 돌아오는 외출 1이 먼저 출발한다(overdue-return.spec.js 경우 2와 같은 준비)
    await startTrip(page, { visit: 0 });
    await seedGuardianWatch(page, onRecord());
    await linkDemoPlan(page, 'A');
    await acknowledgeGuide(page);
    await expect
      .poll(async () => JSON.stringify((await readRecord(page, 'tripPlan'))?.days?.[today]?.effective ?? {}).includes('HOSPITAL'), {
        message: '데모 지침 연결 뒤 오늘 재계획',
      })
      .toBe(true);
    const planned = (await readRecord(page, 'tripPlan')).days[today];
    const outing = planned.outings.find((o) => o.returnPlace === 'HOSPITAL' && o.stops.length > 0);
    expect(outing, '병원으로 돌아오는 외출이 있어야 한다').toBeTruthy();
    const originalBy = outing.returnBy;

    // 그 외출의 마감이 서버에 올라갈 때까지(오늘 일정 화면이 실행기를 연다)
    await page.goto(`/trip/${today}`);
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.lastUploaded?.[today] ?? []).toContain(originalBy);

    await moveTo(page, minutesOf(outing.stops[0].arriveAt) + 1);
    await page.goto(`/trip/${today}`);
    const panel = page.getByRole('region', { name: '변화 시연 (병원 연동 데모)' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const uploadsBefore = stub.sent('PUT', '/api/watch/deadlines').length;

    await fireDemoEvent(panel, /병원 일정/);
    const sheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(sheet).toBeVisible();
    const stored = (await readRecord(page, 'tripPlan')).days[today];
    expect(stored.reasons).toContain('OUTING_OVERDUE');
    const held = stored.outings.find((o) => isClampedOverdueOuting(stored, o));
    expect(held, '마감을 지금으로 당긴 외출이 있어야 한다').toBeTruthy();

    await expect(sheet).toContainText(HINT);
    await backButton(sheet).click();
    await expect(sheet).toContainText(SENT);
    const backs = stub.sent('POST', '/api/watch/back');
    expect(backs).toHaveLength(1);
    expect(backs[0].body).toEqual({ ...WATCH_FIXTURE, date: today, by: originalBy });

    // 당긴 외출의 지금 마감은 서버에 올리지 않고 원래 마감을 남긴다(D2)
    for (const { body } of stub.sent('PUT', '/api/watch/deadlines').slice(uploadsBefore)) {
      const todayList = body.days.find((d) => d.date === today)?.deadlines ?? [];
      expect(todayList).toContain(originalBy);
      if (held.returnBy !== originalBy) expect(todayList).not.toContain(held.returnBy);
    }
    expect((await readRecord(page, 'guardianWatch')).lastUploaded[today]).toContain(originalBy);
    await expectNoSafeClaim(page);
  });

  test('오늘 외출 카드: 외출 중이고 ON 이면 버튼이 있고, 출발 전이거나 같은 마감의 나중 외출이 있거나 지켜보기가 없으면 없다', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    await stubServerPush(page);
    const { tripPlan } = await startTrip(page);
    const pair = sharedDeadlinePair(tripPlan.days[today]);
    expect(pair, '시드에 같은 복귀 마감을 나눠 갖는 외출 둘이 있어야 한다').toBeTruthy();
    const { earlier, later } = pair;
    await seedGuardianWatch(page, onRecord());
    const card = focusCard(page);

    // 먼저 출발한 외출: 외출 중이어도 같은 마감의 나중 외출이 있어 버튼이 없다(다르게 정한 것 25)
    await moveTo(page, minutesOf(earlier.departAt) + 1);
    await page.goto('/today');
    await expect(card.getByRole('heading', { name: '지금 외출 중' })).toBeVisible();
    await expect(card).toContainText(`${earlier.departAt} 출발`);
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.uploadPending).toBe(false);
    await expect(backButton(card)).toHaveCount(0);
    await expect(card).not.toContainText(HINT);

    // 나중 외출 출발 5분 전: 다음 외출 카드라 버튼이 없다
    await moveTo(page, minutesOf(later.departAt) - 5);
    await page.goto('/today');
    await expect(card.getByRole('heading', { name: '다음 외출' })).toBeVisible();
    await expect(backButton(card)).toHaveCount(0);

    // 나중 외출 중: 버튼과 안내 줄
    await moveTo(page, minutesOf(later.departAt) + 1);
    await page.goto('/today');
    await expect(card.getByRole('heading', { name: '지금 외출 중' })).toBeVisible();
    await expect(card).toContainText(`${later.departAt} 출발`);
    await expect(backButton(card)).toBeVisible();
    await expect(card).toContainText(HINT);

    // 지켜보기가 없으면 버튼이 없다
    await seedGuardianWatch(page, null);
    await page.reload();
    await expect(card.getByRole('heading', { name: '지금 외출 중' })).toBeVisible();
    await expect(backButton(card)).toHaveCount(0);
    await expect(card).not.toContainText(HINT);
    await expectNoSafeClaim(page);
  });

  test('마감 올리기가 404 면 버튼이 사라지고 설정에 "다른 기기에서 서버 알림을 다시 설정했어요", 다시 켜면 같은 watchId 에 새 토큰', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    const stub = await stubServerPush(page, { deadlines: { status: 404 } });
    const { tripPlan } = await startTrip(page, { hasCompanion: true });
    const last = latestOuting(tripPlan.days[today]);
    expect(last, '오늘 환자 외출이 있어야 한다').toBeTruthy();
    await seedGuardianWatch(page, onRecord());
    await moveTo(page, minutesOf(last.departAt) + 1);
    await page.goto('/today');
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.state).toBe('REPLACED');
    const card = focusCard(page);
    await expect(card.getByRole('heading', { name: '지금 외출 중' })).toBeVisible();
    await expect(backButton(card)).toHaveCount(0);
    await expect(card).not.toContainText(HINT);

    await page.goto('/settings');
    await expect(page.locator('section.settings-push')).toContainText('다른 기기에서 서버 알림을 다시 설정했어요.');

    // 갈아 끼운 뒤 링크를 다시 만들며 켜면: 항목은 꺼진 채 시작하고, 켜면 같은 watchId 에 새 쓰기 토큰으로 다시 등록한다
    stub.set({ deadlines: { status: 200, armFailed: 0 } });
    await page.goto('/guardian');
    await expect(page.getByRole('heading', { name: PUSH_TITLE })).toBeVisible();
    const option = page.getByLabel(PUSH_LABEL);
    await expect(option).not.toBeChecked();
    await option.check();
    await createGuardianLink(page, { pin: PIN, verify: true });
    await expect(page.locator('.guardian-push-result')).toContainText('서버 알림을 켰어요.');
    const registers = stub.sent('POST', '/api/watch');
    expect(registers).toHaveLength(1);
    expect(registers[0].body.watchId).toBe(WATCH_FIXTURE.watchId);
    expect(registers[0].body.writeToken).toMatch(WRITE_TOKEN_RE);
    expect(registers[0].body.writeToken).not.toBe(WATCH_FIXTURE.writeToken);
    await expect.poll(async () => (await readRecord(page, 'guardianWatch'))?.state).toBe('ON');
    expect(await readRecord(page, 'guardianWatch')).toMatchObject({ watchId: WATCH_FIXTURE.watchId, writeToken: registers[0].body.writeToken });
    await expectNoSafeClaim(page);
  });

  test('설정: 끄기는 확인 시트 뒤 토큰 DELETE, 서버에 남은 내 정보 지우기는 { all: true } DELETE', async ({ page, context }) => {
    const stub = await stubServerPush(page);
    await startTrip(page);
    await seedGuardianWatch(page, onRecord());
    await page.goto('/settings');
    const section = page.locator('section.settings-push');
    const langSection = page.locator('section[aria-labelledby="settings-lang-title"]');
    await expect(section.getByRole('heading', { name: '서버 알림', exact: true })).toBeVisible();
    await expect(section).toContainText('서버 알림이 켜져 있어요.');
    await expect(page.getByText(CLEAR_NOTE_PUSH)).toBeVisible();

    // 끄기는 확인 시트를 거친다. 취소하면 요청이 없다
    await section.getByRole('button', { name: '서버 알림 끄기' }).click();
    const turnOff = page.getByRole('dialog', { name: '서버 알림을 끌까요?' });
    await expect(turnOff).toBeVisible();
    await expect(turnOff.getByRole('button', { name: '서버 알림 끄기' })).toBeVisible();
    await expect(turnOff.getByRole('button', { name: '취소' })).toBeVisible();
    await expect(langSection).toHaveAttribute('inert', '');
    await turnOff.getByRole('button', { name: '취소' }).click();
    await expect(turnOff).toHaveCount(0);
    await expect(langSection).not.toHaveAttribute('inert');
    expect(stub.sent('DELETE', '/api/watch')).toHaveLength(0);

    // 시트가 열린 채 다른 탭에서 지켜보기가 사라지면 시트가 닫히고 다른 절이 다시 눌린다
    await section.getByRole('button', { name: '서버 알림 끄기' }).click();
    await expect(turnOff).toBeVisible();
    const other = await context.newPage();
    await other.goto('/privacy');
    await seedGuardianWatch(other, null);
    await expect(turnOff).toHaveCount(0);
    await expect(langSection).not.toHaveAttribute('inert');
    await expect(section).toContainText('서버 알림이 꺼져 있어요.');
    await seedGuardianWatch(other, onRecord());
    await other.close();
    await expect(section).toContainText('서버 알림이 켜져 있어요.');
    expect(stub.sent('DELETE', '/api/watch')).toHaveLength(0);

    // 확인하면 그 지켜보기의 토큰으로 지운다
    await section.getByRole('button', { name: '서버 알림 끄기' }).click();
    await expect(turnOff).toBeVisible();
    await turnOff.getByRole('button', { name: '서버 알림 끄기' }).click();
    await expect(section).toContainText('서버 알림을 껐어요. 보호자에게 링크를 다시 보내면 반영돼요.');
    const deletes = stub.sent('DELETE', '/api/watch');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].body).toEqual({ ...WATCH_FIXTURE });
    expect(await readRecord(page, 'guardianWatch')).toBeNull();
    expect(await readPendingDelete(page)).toBeNull();
    await expect(section.getByRole('button', { name: '서버 알림 끄기' })).toHaveCount(0);

    // 서버에 남은 내 정보 지우기: 확인 시트 뒤 { all: true }
    await section.getByRole('button', { name: '서버에 남은 내 정보 지우기' }).click();
    const removeAll = page.getByRole('dialog', { name: '서버에 남은 내 정보 지우기' });
    await expect(removeAll).toContainText('이 계정으로 서버에 남은 서버 알림 정보');
    await removeAll.getByRole('button', { name: '지우기', exact: true }).click();
    await expect(section).toContainText('서버에서 서버 알림 정보를 지웠어요. (지운 서버 알림 1개)');
    const all = stub.sent('DELETE', '/api/watch');
    expect(all).toHaveLength(2);
    expect(all[1].body).toEqual({ all: true });
    await expect(langSection).not.toHaveAttribute('inert');
    await expectNoSafeClaim(page);
  });

  test('내 정보 지우기를 오프라인에서 하면 서버 삭제 대기가 남고, 연결되면 DELETE 가 나가고 대기가 사라진다', async ({ page, context }) => {
    const stub = await stubServerPush(page);
    await startTrip(page);
    await seedGuardianWatch(page, onRecord());
    await page.goto('/settings');
    await expect(page.locator('section.settings-push')).toContainText('서버 알림이 켜져 있어요.');
    await expect(page.getByText(CLEAR_NOTE_PUSH)).toBeVisible();

    stub.set({ offline: true });
    await context.setOffline(true);
    try {
      await expect(page.getByText('인터넷 연결이 없어 지금은 바꿀 수 없어요.', { exact: false }).first()).toBeVisible();
      await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
      await page.getByRole('group', { name: '이 기기에서 내 정보 지우기' }).getByRole('button', { name: '지우기', exact: true }).click();
      await expect(page.getByText('로그아웃은 인터넷에 연결되면 마무리됩니다.', { exact: false })).toBeVisible();
      expect(await readPendingDelete(page)).toEqual([{ ...WATCH_FIXTURE }]);
      expect(stub.sent('DELETE', '/api/watch')).toHaveLength(0);
      expect(await readRecord(page, 'guardianWatch')).toBeNull();
    } finally {
      stub.set({ offline: false });
      await context.setOffline(false);
    }

    await expect.poll(() => stub.sent('DELETE', '/api/watch').length).toBe(1);
    expect(stub.sent('DELETE', '/api/watch')[0].body).toEqual({ ...WATCH_FIXTURE });
    await expect.poll(() => readPendingDelete(page)).toBeNull();
    await expectNoSafeClaim(page);
  });

  test('새 부품: 접근성 위반 0, 320px 가로 스크롤 없음, 누르는 곳 44px 이상', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T10:00` });
    await stubServerPush(page);
    const { tripPlan } = await startTrip(page, { hasCompanion: true }, { path: '/guardian' });

    // 보호자 링크 동의 화면의 서버 알림 항목
    await expect(page.getByRole('heading', { name: PUSH_TITLE })).toBeVisible();
    await expectAccessible(page, '보호자 링크 서버 알림 항목');

    // 오늘 외출 카드의 돌아왔어요, 누른 뒤 전달 줄과 되돌리기
    const last = latestOuting(tripPlan.days[today]);
    expect(last, '오늘 환자 외출이 있어야 한다').toBeTruthy();
    await seedGuardianWatch(page, onRecord());
    await moveTo(page, minutesOf(last.departAt) + 1);
    await page.goto('/today');
    await expect(backButton(focusCard(page))).toBeVisible();
    await expectAccessible(page, '오늘 외출 카드 돌아왔어요');
    await backButton(focusCard(page)).click();
    await expect(focusCard(page)).toContainText(SENT);
    await expect(undoButton(focusCard(page))).toBeVisible();
    await expectAccessible(page, '오늘 외출 카드 전달 줄과 되돌리기');

    // 설정의 서버 알림 절과 끄기 확인 시트
    await page.goto('/settings');
    const section = page.locator('section.settings-push');
    await expect(section).toContainText('서버 알림이 켜져 있어요.');
    await expectAccessible(page, '설정 서버 알림 절');
    await section.getByRole('button', { name: '서버 알림 끄기' }).click();
    await expect(page.getByRole('dialog', { name: '서버 알림을 끌까요?' })).toBeVisible();
    await expectNoAxeViolations(page, '서버 알림 끄기 확인 시트');
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalScroll(page, '서버 알림 끄기 확인 시트 320px');
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoSafeClaim(page);
  });
});
