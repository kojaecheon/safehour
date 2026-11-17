// 서버 알림 보호자 쪽 화면 테스트 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 8, ADR-0012)
//
// - 받은 일정 화면(/g)의 '앱이 닫혀 있어도 받기' 항목, 복귀 확인 표시, 오늘 함께 있음, 아이폰 안내, 붙여넣기, 내 정보 지우기,
//   빌드한 서비스 워커의 준비 확인 답과 푸시 수신을 본다.
// - 서버는 stubServerPush 대역(docs/contracts.md '서버 알림' 응답 모양), 브라우저 푸시는 stubPushApi 대역이다. 대역은
//   PushManager.prototype 과 Notification 만 바꾸고 실행기(lib/notify/guardianPush.js)는 진짜 pushManager 호출 자리를 탄다.
//   서비스 워커는 빌드한 진짜 public/sw.js 다.
// - 환자와 보호자는 같은 데모 계정이다(openCopyWithWatch: 동의 화면에서 서버 알림을 켜고 링크를 만든 뒤 같은 기기에서 연다).
// - 상태 조회는 2분 간격 아래면 건너뛰므로 다시 묻게 하려면 advanceClock 으로 3분 보낸 뒤 /g 를 다시 연다. 그래서 시계를 쓰는
//   시험은 오늘(KST) 오전 10시로 맞추고 시작한다(오전 10시 기본 체류는 오늘 숙소 복귀 마감이 있다).
// - 화면 문구는 src/i18n 사전에서 읽는다(문구가 바뀌어도 시험이 따라간다).
// - 모든 시험에서 화면에 '안전합니다'가 없고, 요청 URL 에 watchId·subId·writeToken 이 없다(식별 값은 본문으로만 간다).

import crypto from 'node:crypto';
import fs from 'node:fs';
import { test, expect, expectGuardClean, guardContext } from './fixtures.js';
import { translate } from '../src/i18n/index.js';
import {
  SERVER_PUSH_OPTION_LABEL,
  STUB_AUTH,
  STUB_P256DH,
  STUB_PUSH_ENDPOINT,
  STUB_VAPID_KEY,
  STUB_VAPID_KEY_NEXT,
  advanceClock,
  createGuardianLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectTouchTargets,
  kstDate,
  kstMinutes,
  openCopyWithWatch,
  pushCalls,
  readRecord,
  seedGuardianPush,
  setClock,
  startTrip,
  stubPushApi,
  stubServerPush,
} from './helpers.js';

const ko = (key, vars) => translate(key, 'ko', vars);

const CONFIG = '/api/push/config';
const SUBSCRIBE = '/api/watch/subscribe';
const STATUS = '/api/watch/status';
const MUTE = '/api/watch/mute';
const PIN = '246813';
const MINUTE = 60_000;
const PENDING_DELETE_KEY = 'safehour.v2.device.pendingServerDelete';
/** docs/security.md: '이 기기에서 내 정보 지우기'가 남기는 세 키(언어, 로그아웃 미전송 표시, 서버 삭제 대기) */
const KEPT_AFTER_CLEAR = Object.freeze([
  'safehour.v2.device.lang',
  'safehour.v2.device.logoutPending',
  'safehour.v2.device.pendingServerDelete',
]);
/** 받은 일정 화면의 로그인 주소(받은 일정으로 돌아온다) */
const LOGIN_HREF = '/login?returnTo=%2Fg';
const SW_VERSION = /const SW_VERSION = '([^']+)'/.exec(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))[1];

const item = (page) => page.locator('section.guardian-push-item');
const itemHeading = (page) => item(page).getByRole('heading', { name: ko('guardian.pushTitle') });
const pushSwitch = (page) => page.getByRole('switch', { name: ko('guardian.pushTitle') });
const deviceSwitch = (page) => page.getByRole('switch', { name: ko('guardian.alertsToggle') });
const muteSwitch = (page) => page.getByRole('switch', { name: ko('guardian.muteTitle') });
const loginLinks = (page) => page.getByRole('link', { name: ko('common.readOnlyLogin') });

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endpointHash = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('base64url');
const subscribeOps = (calls) => calls.filter((call) => call.op === 'subscribe');

/** 컨텍스트의 모든 요청 URL 을 모은다(서비스 워커 요청 포함) */
function trackRequests(context) {
  const urls = [];
  context.on('request', (request) => urls.push(request.url()));
  return urls;
}

/** 대역이 받은 본문의 식별 값(watchId, subId, writeToken)과 대역이 내준 subId */
function idsOf(stub, extra = []) {
  const ids = new Set(extra);
  for (const call of [...stub.calls, ...stub.blocked]) {
    for (const field of ['watchId', 'subId', 'writeToken']) {
      if (typeof call.body?.[field] === 'string') ids.add(call.body[field]);
    }
  }
  for (const subId of stub.subIds) ids.add(subId);
  return [...ids].filter((id) => typeof id === 'string' && id.length >= 16);
}

/** 모든 시험의 끝: '안전합니다'가 없고, 요청 URL 에 식별 값이 없다 */
async function expectClean(page, urls, ids) {
  await expect(page.locator('body')).not.toContainText('안전합니다');
  const leaks = urls.filter((url) => ids.some((id) => url.includes(id)));
  expect(leaks, '식별 값이 요청 URL 에 실렸다').toEqual([]);
}

async function readPendingDelete(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw).data;
  }, PENDING_DELETE_KEY);
}

const subsOf = async (page) => (await readRecord(page, 'guardianPush'))?.subs ?? [];

/** 오늘 오전 10시로 시계를 맞추고 대역 둘을 건 뒤 서버 알림을 켠 사본을 연다 */
async function openWithPush(page, { server = {}, push = {} } = {}) {
  await setClock(page, { kst: `${kstDate(0)}T10:00` });
  const stub = await stubServerPush(page, server);
  await stubPushApi(page, push);
  const urls = trackRequests(page.context());
  const opened = await openCopyWithWatch(page, { pin: PIN });
  return { stub, urls, ...opened };
}

/** 켜기 스위치를 눌러 받는 중(ON)이 될 때까지. 마지막 구독 요청을 돌려준다 */
async function turnOnPush(page, stub) {
  const before = stub.sent('POST', SUBSCRIBE).length;
  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toBeChecked();
  await expect(item(page)).toContainText(ko('guardian.pushOn'));
  expect(stub.sent('POST', SUBSCRIBE)).toHaveLength(before + 1);
  return stub.sent('POST', SUBSCRIBE).at(-1);
}

/** 접근성 위반 0, 누르는 곳 44px 이상, 320px 에서 가로 스크롤 없음 */
async function expectAccessible(page, where) {
  await expectNoAxeViolations(page, where);
  await expectTouchTargets(page, where);
  const size = page.viewportSize();
  await page.setViewportSize({ width: 320, height: size.height });
  try {
    await expectNoHorizontalScroll(page, `${where} 320px`);
  } finally {
    await page.setViewportSize(size);
  }
}

test.describe('서버 알림 보호자 쪽 (A-3)', () => {
  test('사본에 watchId 가 없으면 항목이 없고 /api/push/config 와 /api/watch* 요청이 0건이다', async ({ page }) => {
    const stub = await stubServerPush(page);
    await stubPushApi(page);
    const urls = trackRequests(page.context());
    // 서버 알림 항목을 켜지 않고 링크를 만든다(사본에 watchId 가 없다)
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await expect(page.getByLabel(SERVER_PUSH_OPTION_LABEL)).not.toBeChecked();
    const link = await createGuardianLink(page, { pin: PIN });
    const from = stub.calls.length;
    await page.goto(link);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: ko('guardian.copyTitle') })).toBeVisible();
    const copy = Object.values(await readRecord(page, 'guardianCopies'))[0];
    expect(copy.snapshot.watchId).toBeUndefined();
    await page.goto('/g');
    await expect(page.getByRole('heading', { name: ko('guardian.copyTitle') })).toBeVisible();
    await expect(deviceSwitch(page)).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expect(item(page)).toHaveCount(0);
    expect(stub.calls.slice(from).map((c) => `${c.method} ${c.path}`)).toEqual([]);
    expect(stub.blocked).toEqual([]);
    expect(await pushCalls(page)).toEqual([]);
    await expectClean(page, urls, idsOf(stub));
  });

  test('서버 스위치 꺼짐이고 구독이 없으면 항목이 없고 구독·상태·함께 있음 요청이 0건이다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    // 켜진 동안은 켤 수 있음(AVAILABLE)이다
    await expect(pushSwitch(page)).toBeVisible();
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.pushIntro'));

    stub.set({ enabled: false });
    // 상태 조회 간격(2분)을 넘겨 둔다: 묻는다면 이번에 물을 것이다
    await advanceClock(page, 3 * MINUTE);
    const from = stub.calls.length;
    await page.goto('/g');
    await expect(page.getByRole('heading', { name: ko('guardian.copyTitle') })).toBeVisible();
    await expect.poll(() => stub.calls.slice(from).some((c) => c.method === 'GET' && c.path === CONFIG)).toBe(true);
    await page.waitForLoadState('networkidle');

    await expect(item(page)).toHaveCount(0);
    expect(stub.calls.slice(from).filter((c) => [SUBSCRIBE, STATUS, MUTE].includes(c.path))).toEqual([]);
    expect(subscribeOps(await pushCalls(page))).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('켜기: 본문이 { watchId, subscription: { endpoint, keys }, lang } 그대로(expirationTime 없음), 기록 subs 1건, 받아요 줄과 도착 비보장 줄', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await expect(item(page)).toContainText(ko('guardian.pushConsentStored'));
    await expect(deviceSwitch(page)).not.toBeChecked();

    const post = await turnOnPush(page, stub);
    expect(Object.keys(post.body).sort()).toEqual(['lang', 'subscription', 'watchId']);
    expect(post.body).toEqual({
      watchId,
      subscription: { endpoint: STUB_PUSH_ENDPOINT, keys: { p256dh: STUB_P256DH, auth: STUB_AUTH } },
      lang: 'ko',
    });

    // 기록: 주소는 해시만, 키는 VAPID 공개키만 둔다
    expect(await subsOf(page)).toEqual([
      { watchId, subId: stub.subIds[0], lang: 'ko', endpointHash: endpointHash(STUB_PUSH_ENDPOINT), vapidKey: STUB_VAPID_KEY },
    ]);
    const raw = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.endsWith('.guardianPush'))
        .map((key) => localStorage.getItem(key))
        .join('\n'),
    );
    for (const secret of [STUB_PUSH_ENDPOINT, STUB_P256DH, STUB_AUTH]) expect(raw).not.toContain(secret);

    // 받아요 줄은 한 번(상태 줄과 결과 줄이 같으면 하나), 도착 비보장·위치 줄은 늘
    await expect(item(page).getByText(ko('guardian.pushOn'), { exact: true })).toHaveCount(1);
    await expect(item(page)).toContainText(ko('guardian.pushNoGuarantee'));
    await expect(item(page)).toContainText(ko('guardian.pushLocation'));
    // 권한이 이미 있으면 묻지 않고 기기 알림 스위치도 켠다
    await expect(deviceSwitch(page)).toBeChecked();
    const calls = await pushCalls(page);
    expect(subscribeOps(calls)).toEqual([{ op: 'subscribe', userVisibleOnly: true, key: STUB_VAPID_KEY }]);
    expect(calls.some((call) => call.op === 'requestPermission')).toBe(false);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('기기 알림 스위치가 꺼진 채 켜기를 누르면 두 스위치가 함께 켜진다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { push: { permission: 'default' } });
    await expect(deviceSwitch(page)).not.toBeChecked();
    await expect(pushSwitch(page)).not.toBeChecked();

    await turnOnPush(page, stub);
    await expect(deviceSwitch(page)).toBeChecked();
    const ops = (await pushCalls(page)).map((call) => call.op);
    expect(ops.filter((op) => op === 'requestPermission')).toHaveLength(1);
    expect(ops.indexOf('requestPermission')).toBeLessThan(ops.indexOf('subscribe'));
    expect((await readRecord(page, 'prefs')).notifications).toBe(true);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('끄기는 DELETE { watchId, subId } 이고, 오프라인이면 대기에 남았다가 연결되면 보낸다', async ({ page, context }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await turnOnPush(page, stub);
    const [first] = stub.subIds;

    await pushSwitch(page).click();
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.pushOffDone'));
    expect(stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toEqual([{ watchId, subId: first }]);
    expect(await subsOf(page)).toEqual([]);
    // 이 기기의 마지막 구독이라 브라우저 구독도 지운다
    expect((await pushCalls(page)).filter((call) => call.op === 'unsubscribe')).toHaveLength(1);
    expect(((await readPendingDelete(page)) ?? []).filter((entry) => entry.subId)).toEqual([]);

    // 다시 켜면 새 브라우저 구독, 새 subId 다
    const again = await turnOnPush(page, stub);
    const second = stub.subIds[1];
    expect(again.body.subscription.endpoint).toBe(`${STUB_PUSH_ENDPOINT}-2`);
    expect(second).not.toBe(first);

    // 연결이 끊긴 채 끄면 이 휴대폰에서는 꺼지고 해지는 대기에 남는다
    stub.set({ offline: true });
    await pushSwitch(page).click();
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.pushOffPending'));
    expect(await readPendingDelete(page)).toContainEqual({ watchId, subId: second });
    expect(stub.sent('DELETE', SUBSCRIBE)).toHaveLength(1);
    expect(stub.blocked.filter((c) => c.method === 'DELETE' && c.path === SUBSCRIBE).map((c) => c.body)).toContainEqual({
      watchId,
      subId: second,
    });

    // 연결이 돌아오면 대기의 해지를 보내고 대기가 빈다
    stub.set({ offline: false });
    await context.setOffline(true);
    await context.setOffline(false);
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).length).toBe(2);
    expect(stub.sent('DELETE', SUBSCRIBE)[1].body).toEqual({ watchId, subId: second });
    await expect.poll(async () => ((await readPendingDelete(page)) ?? []).filter((entry) => entry.subId)).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('기기 알림 스위치를 끄면 서버 구독도 해지한다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await turnOnPush(page, stub);
    const [subId] = stub.subIds;

    await deviceSwitch(page).click();
    await expect(deviceSwitch(page)).not.toBeChecked();
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toEqual([{ watchId, subId }]);
    await expect.poll(() => subsOf(page)).toEqual([]);
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect.poll(async () => (await pushCalls(page)).filter((call) => call.op === 'unsubscribe').length).toBe(1);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('상태 조회에 확인된 마감은 복귀 확인 꼬리표와 확인 시각이 있고 마감 지남이 없으며 긴급 절은 그대로다', async ({ page }) => {
    const { stub, urls, watchId, copy } = await openWithPush(page);
    const today = kstDate(0);
    const todayDay = copy.snapshot.days.find((day) => day.date === today);
    // 오늘의 마지막 복귀 마감: 지나면 맨 위 카드도 이 마감을 보인다(앞으로 올 마감이 없다)
    const by = [...new Set(todayDay.patientReturn.map((entry) => entry.by))].sort().at(-1);
    expect(minutesOf(by)).toBeGreaterThan(10 * 60);

    // 마감 5분 뒤, 확인이 없다: 줄과 카드에 마감 지남
    await advanceClock(page, (minutesOf(by) + 5 - kstMinutes()) * MINUTE);
    await page.goto('/g');
    const article = page.locator(`article[aria-labelledby="guardian-day-${today}"]`);
    const row = article.locator('li.guardian-return').filter({ hasText: ko('guardian.returnBy', { time: by }) }).first();
    const card = page.locator('button.guardian-today');
    await expect(row).toContainText(ko('guardian.overdueTag'));
    await expect(row).toContainText(ko('guardian.overdueHelp'));
    await expect(row.locator('a[href="tel:119"]')).toBeVisible();
    await expect(card).toContainText(ko('guardian.overdueTag'));

    // 서버가 그 마감을 확인으로 받았다: 상태 조회(GuardianOpen 의 serverStatus)가 줄과 카드에 닿는다
    stub.set({ status: { confirmed: [by] } });
    await advanceClock(page, 3 * MINUTE);
    const asked = stub.sent('POST', STATUS).length;
    await page.goto('/g');
    await expect.poll(() => stub.sent('POST', STATUS).length).toBeGreaterThan(asked);
    expect(stub.sent('POST', STATUS).at(-1).body).toEqual({ watchId });
    await expect(row).toContainText(ko('guardian.confirmedTag'));
    await expect(row).toContainText(ko('guardian.confirmedHelp'));
    await expect(row.getByText(ko('guardian.overdueTag'))).toHaveCount(0);
    await expect(row.getByText(ko('guardian.overdueHelp'))).toHaveCount(0);
    await expect(row.locator('a[href^="tel:"]')).toHaveCount(0);
    const asOf = new RegExp(`^${escapeRe(ko('guardian.statusAsOf', { time: '00:00' })).replace('00:00', '\\d{2}:\\d{2}')}$`);
    await expect(article.locator('.guardian-status-asof')).toHaveText(asOf);
    await expect(card).toContainText(ko('guardian.confirmedTag'));
    await expect(card).not.toContainText(ko('guardian.overdueTag'));
    // 긴급 절(119·1330)은 상태 조회와 무관하게 그대로다
    const emergency = page.locator('section.guardian-emergency');
    await expect(emergency.locator('a[href="tel:119"]')).toBeVisible();
    await expect(emergency.locator('a[href="tel:1330"]')).toBeVisible();
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('subscriptionActive 거짓이면 다시 받기 버튼이 있고 누르면 브라우저 구독을 새로 만들어 구독 요청이 다시 간다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await turnOnPush(page, stub);
    const [first] = stub.subIds;

    stub.set({ status: { subscriptionActive: false } });
    await advanceClock(page, 3 * MINUTE);
    await page.goto('/g');
    await expect(item(page)).toContainText(ko('guardian.pushMoved'));
    await expect(item(page)).toContainText(ko('guardian.pushMovedNote'));
    const takeOver = item(page).getByRole('button', { name: ko('guardian.pushMovedButton'), exact: true });
    await expect(takeOver).toBeVisible();
    // 다시 켜기 버튼은 없고 끄기(스위치)는 있다
    await expect(item(page).getByRole('button', { name: ko('guardian.pushRenewButton'), exact: true })).toHaveCount(0);
    await expect(pushSwitch(page)).toBeChecked();
    expect(stub.sent('POST', STATUS).at(-1).body).toEqual({ watchId, subId: first });
    // 저절로 다시 구독하지 않는다
    expect(stub.sent('POST', SUBSCRIBE)).toHaveLength(1);

    stub.set({ status: { subscriptionActive: true } });
    const before = (await pushCalls(page)).length;
    await takeOver.click();
    await expect(item(page)).toContainText(ko('guardian.pushOn'));
    await expect(item(page)).not.toContainText(ko('guardian.pushMoved'));
    // 누른 버튼이 사라지면 포커스는 항목의 켜기 스위치로 간다
    await expect(pushSwitch(page)).toBeFocused();
    // MOVED 는 주소 만료일 수 있어 이 브라우저 구독을 다시 쓰지 않는다: 지우고 새로 구독해 POST 한다(다시 켜기와 같다)
    const ops = (await pushCalls(page)).slice(before);
    expect(ops).toEqual([
      { op: 'unsubscribe', endpoint: STUB_PUSH_ENDPOINT },
      { op: 'subscribe', userVisibleOnly: true, key: STUB_VAPID_KEY },
    ]);
    const posts = stub.sent('POST', SUBSCRIBE);
    expect(posts).toHaveLength(2);
    expect(posts[1].body.subscription.endpoint).toBe(`${STUB_PUSH_ENDPOINT}-2`);
    await expect
      .poll(() => subsOf(page))
      .toEqual([
        {
          watchId,
          subId: stub.subIds[1],
          lang: 'ko',
          endpointHash: endpointHash(`${STUB_PUSH_ENDPOINT}-2`),
          vapidKey: STUB_VAPID_KEY,
        },
      ]);
    // 옛 subId 는 해지 대기를 거쳐 서버로 간다
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toContainEqual({ watchId, subId: first });
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('상태 조회 404 면 기간 끝 줄이 보이고 켜기가 없다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { server: { status: 404 } });
    await expect(itemHeading(page)).toBeVisible();
    await expect(item(page)).toContainText(ko('guardian.pushGone'));
    // 기기 알림 스위치가 꺼져 있으면 '앱이 열려 있을 때 알림은 그대로 받아요'를 말하지 않는다
    await expect(deviceSwitch(page)).not.toBeChecked();
    await expect(item(page)).not.toContainText(ko('guardian.pushOpenAppAlerts'));
    await expect(pushSwitch(page)).toHaveCount(0);
    expect(stub.sent('POST', STATUS).length).toBeGreaterThan(0);
    expect((await readRecord(page, 'guardianPush')).gone).toEqual([watchId]);
    expect(stub.sent('POST', SUBSCRIBE)).toEqual([]);
    expect(subscribeOps(await pushCalls(page))).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('설정의 VAPID 키가 바뀌면 다시 켜기가 보이고 누르면 unsubscribe, subscribe, POST 순서다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await turnOnPush(page, stub);
    const [first] = stub.subIds;

    stub.set({ vapidPublicKey: STUB_VAPID_KEY_NEXT });
    await page.goto('/g');
    await expect(item(page)).toContainText(ko('guardian.pushRenew'));
    const renew = item(page).getByRole('button', { name: ko('guardian.pushRenewButton'), exact: true });
    await expect(renew).toBeVisible();
    await expect(pushSwitch(page)).toBeChecked();
    // 저절로 구독하지 않는다
    expect(stub.sent('POST', SUBSCRIBE)).toHaveLength(1);
    expect(subscribeOps(await pushCalls(page))).toHaveLength(1);

    const before = (await pushCalls(page)).length;
    await renew.click();
    await expect(item(page)).toContainText(ko('guardian.pushOn'));
    await expect(renew).toHaveCount(0);
    await expect(pushSwitch(page)).toBeFocused();
    const ops = (await pushCalls(page)).slice(before);
    expect(ops.map((call) => call.op)).toEqual(['unsubscribe', 'subscribe']);
    expect(ops[1]).toEqual({ op: 'subscribe', userVisibleOnly: true, key: STUB_VAPID_KEY_NEXT });
    const posts = stub.sent('POST', SUBSCRIBE);
    expect(posts).toHaveLength(2);
    expect(posts[1].body.subscription.endpoint).toBe(`${STUB_PUSH_ENDPOINT}-2`);
    expect(await subsOf(page)).toEqual([
      {
        watchId,
        subId: stub.subIds[1],
        lang: 'ko',
        endpointHash: endpointHash(`${STUB_PUSH_ENDPOINT}-2`),
        vapidKey: STUB_VAPID_KEY_NEXT,
      },
    ]);
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toContainEqual({ watchId, subId: first });
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('서버 스위치 꺼짐에 구독이 있으면 쉬고 있어요 줄과 끄기만 있고 끄면 해지가 간다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await deviceSwitch(page).click();
    await expect(deviceSwitch(page)).toBeChecked();

    const seededSubId = 'e2eSeededSubId00000001';
    stub.set({ enabled: false });
    await seedGuardianPush(page, {
      subs: [{ watchId, subId: seededSubId, lang: 'ko', endpointHash: endpointHash(STUB_PUSH_ENDPOINT), vapidKey: STUB_VAPID_KEY }],
      status: [],
      gone: [],
    });
    await advanceClock(page, 3 * MINUTE);
    const from = stub.calls.length;
    await page.goto('/g');
    await expect(item(page)).toContainText(ko('guardian.pushPaused'));
    await expect(pushSwitch(page)).toBeChecked();
    await expect(muteSwitch(page)).toHaveCount(0);
    await expect(item(page).getByRole('button')).toHaveCount(0);
    await expect(item(page).getByRole('link')).toHaveCount(0);
    await expect.poll(() => stub.calls.slice(from).some((c) => c.path === CONFIG)).toBe(true);
    await page.waitForLoadState('networkidle');
    expect(stub.calls.slice(from).filter((c) => [SUBSCRIBE, STATUS, MUTE].includes(c.path))).toEqual([]);

    // 끄기는 스위치와 무관하게 해지를 보낸다. 구독이 없고 스위치가 꺼졌으니 항목이 사라진다
    await pushSwitch(page).click();
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toEqual([{ watchId, subId: seededSubId }]);
    await expect(item(page)).toHaveCount(0);
    expect(await subsOf(page)).toEqual([]);
    expect(subscribeOps(await pushCalls(page))).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId, seededSubId]));
  });

  test('아이폰 Safari 탭 흉내: 홈 화면 추가 다섯 단계가 보이고 켜기 스위치가 없다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { push: { ios: 'tab' } });
    await expect(itemHeading(page)).toBeVisible();
    await expect(pushSwitch(page)).toHaveCount(0);
    await expect(item(page)).toContainText(ko('guardian.pushIosTitle'));
    await expect(item(page).locator('ol.guardian-push-steps > li')).toHaveText(
      [1, 2, 3, 4, 5].map((step) => ko(`guardian.pushIosStep${step}`)),
    );
    await expect(item(page)).toContainText(ko('guardian.pushIosNote'));
    expect(stub.sent('POST', SUBSCRIBE)).toEqual([]);
    expect(await pushCalls(page)).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('아이폰 옛 버전 흉내: iOS 16.4 안내가 보인다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { push: { ios: 'old' } });
    await expect(itemHeading(page)).toBeVisible();
    await expect(item(page)).toContainText(ko('guardian.pushIosOld'));
    await expect(item(page).locator('ol.guardian-push-steps')).toHaveCount(0);
    await expect(pushSwitch(page)).toHaveCount(0);
    expect(stub.sent('POST', SUBSCRIBE)).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('오늘 함께 있음: POST mute { on: true } 다음 줄이 바뀌고 자정 안내가 있다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await turnOnPush(page, stub);
    const [subId] = stub.subIds;
    await expect(muteSwitch(page)).toBeVisible();
    await expect(muteSwitch(page)).not.toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.muteHelp'));
    await expect(item(page)).toContainText(ko('guardian.muteMidnight'));

    await muteSwitch(page).click();
    await expect(muteSwitch(page)).toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.muteOn'));
    expect(stub.sent('POST', MUTE).map((c) => c.body)).toEqual([{ watchId, subId, on: true }]);

    await muteSwitch(page).click();
    await expect(muteSwitch(page)).not.toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.muteOff'));
    await expect(item(page)).not.toContainText(ko('guardian.muteOn'));
    expect(stub.sent('POST', MUTE).map((c) => c.body)).toEqual([
      { watchId, subId, on: true },
      { watchId, subId, on: false },
    ]);
    // 받는 중은 그대로다
    await expect(pushSwitch(page)).toBeChecked();
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('붙여넣기: 사본 없는 /g 에서 링크 전체를 붙여 넣으면 PIN 흐름으로 열리고 주소에 # 이 없으며 붙여 넣은 글이 어떤 요청에도 없다', async ({ page, context }) => {
    const stub = await stubServerPush(page);
    await stubPushApi(page);
    const urls = trackRequests(context);
    const requests = [];
    context.on('request', (request) => {
      requests.push({ url: request.url(), postData: request.postData() ?? '', headers: JSON.stringify(request.headers()) });
    });
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await page.getByLabel(SERVER_PUSH_OPTION_LABEL).check();
    const link = await createGuardianLink(page, { pin: PIN });
    const fragment = link.split('#')[1];
    expect(fragment.length).toBeGreaterThan(32);

    await page.goto('/g');
    const field = page.getByLabel(ko('guardian.pasteLabel'));
    await expect(field).toBeVisible();
    await field.fill(`보호자 링크예요 ${link} PIN은 따로 보낼게요`);
    await page.getByRole('button', { name: ko('guardian.pasteOpen'), exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PIN 입력' })).toBeVisible();
    expect(page.url()).not.toContain('#');
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: ko('guardian.copyTitle') })).toBeVisible();
    expect(page.url()).not.toContain('#');
    // 서버 알림 항목까지 뜬 뒤(설정·상태 조회가 나간 뒤) 본다
    await expect(item(page)).toBeVisible();
    await page.waitForLoadState('networkidle');

    for (const part of [fragment, fragment.slice(0, 32), 'PIN은 따로 보낼게요']) {
      const hits = requests.filter((r) => r.url.includes(part) || r.postData.includes(part) || r.headers.includes(part));
      expect(hits.map((r) => r.url), `붙여 넣은 글(${part.slice(0, 8)}...)이 요청에 실렸다`).toEqual([]);
    }
    await expectClean(page, urls, idsOf(stub));
  });

  test('내 정보 지우기: 해지 요청이 가고 브라우저 unsubscribe 가 불리며 남는 키는 셋이다', async ({ page }) => {
    // 지켜보기 삭제는 503 이라 대기에 남고, 구독 해지는 200 이라 대기에서 빠진다
    const { stub, urls, watchId } = await openWithPush(page, { server: { remove: 503 } });
    await turnOnPush(page, stub);
    const [subId] = stub.subIds;
    await page.evaluate(() => {
      localStorage.setItem('safehour.v2.device.lang', JSON.stringify({ schemaVersion: 2, data: { lang: 'ko' } }));
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('group', { name: '이 기기에서 내 정보 지우기' }).getByRole('button', { name: '지우기', exact: true }).click();
    await expect.poll(() => stub.sent('DELETE', SUBSCRIBE).map((c) => c.body)).toEqual([{ watchId, subId }]);
    await expect.poll(async () => (await pushCalls(page)).filter((call) => call.op === 'unsubscribe').length).toBe(1);
    await expect.poll(() => stub.sent('DELETE', '/api/watch').length).toBeGreaterThan(0);
    await expect.poll(async () => ((await readPendingDelete(page)) ?? []).filter((entry) => 'subId' in entry)).toEqual([]);

    const keys = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('safehour.v2.'))
        .sort(),
    );
    for (const key of keys) expect(KEPT_AFTER_CLEAR, `지운 뒤 남은 키 ${key}`).toContain(key);
    expect(keys).toContain('safehour.v2.device.lang');
    expect(keys).toContain(PENDING_DELETE_KEY);
    // 남은 대기는 환자 지켜보기 삭제 하나다(503)
    expect(await readPendingDelete(page)).toEqual([{ watchId, writeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('빌드한 서비스 워커가 SAFEHOUR_SW_INFO 에 push: true 로 답한다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    const info = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const channel = new MessageChannel();
      const reply = new Promise((resolve) => {
        channel.port1.onmessage = (event) => resolve(event.data);
      });
      registration.active.postMessage({ type: 'SAFEHOUR_SW_INFO' }, [channel.port2]);
      return reply;
    });
    expect(info).toEqual({ type: 'SAFEHOUR_SW_INFO', version: SW_VERSION, push: true });
    const served = await (await page.request.get('/sw.js')).text();
    expect(served).toContain(`const SW_VERSION = '${SW_VERSION}'`);
    // 준비 확인이 통과해 켤 수 있음(AVAILABLE)이다(준비 안 됨 줄과 새로 고침 버튼이 없다)
    await expect(pushSwitch(page)).toBeEnabled();
    await expect(item(page)).not.toContainText(ko('guardian.pushSwNotReady'));
    await expect(item(page).getByRole('button', { name: ko('guardian.pushReload') })).toHaveCount(0);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('권한을 거절하면 켜기 스위치가 사라지고 차단 줄이 보이며 포커스가 항목 제목으로 간다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { push: { permission: 'default', answer: 'denied' } });
    await pushSwitch(page).click();
    await expect(itemHeading(page)).toBeVisible();
    await expect(pushSwitch(page)).toHaveCount(0);
    await expect(item(page)).toContainText(ko('guardian.pushDenied'));
    await expect(item(page).getByText(ko('guardian.pushDenied'), { exact: true })).toHaveCount(1);
    await expect(itemHeading(page)).toBeFocused();
    expect((await pushCalls(page)).map((call) => call.op)).toEqual(['requestPermission']);
    expect(stub.sent('POST', SUBSCRIBE)).toEqual([]);
    await expect(deviceSwitch(page)).not.toBeChecked();
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('보기 전용(세션 없음): 켜기 스위치가 막히고 로그인 줄이 있으며 화면의 로그인 버튼은 하나다', async ({ page, context }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await context.clearCookies();
    await page.goto('/g');
    await expect(item(page)).toContainText(ko('guardian.pushLogin'));
    await expect(pushSwitch(page)).toBeDisabled();
    await expect(pushSwitch(page)).not.toBeChecked();
    // 로그인 버튼은 바로 위 기기 알림 스위치의 것 하나다(받은 일정으로 돌아온다)
    await expect(loginLinks(page)).toHaveCount(1);
    await expect(loginLinks(page)).toHaveAttribute('href', LOGIN_HREF);
    await expect(item(page).getByRole('link')).toHaveCount(0);
    await pushSwitch(page).click({ force: true });
    expect(stub.sent('POST', SUBSCRIBE)).toEqual([]);
    expect(subscribeOps(await pushCalls(page))).toEqual([]);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('세션이 있는데 구독이 401 이면 항목에 로그인 줄과 로그인 버튼(받은 일정으로 돌아옴)이 하나 있다', async ({ page }) => {
    const { stub, urls, watchId } = await openWithPush(page, { server: { subscribe: 401 } });
    await pushSwitch(page).click();
    await expect(item(page).getByRole('alert')).toContainText(ko('guardian.pushLogin'));
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect(loginLinks(page)).toHaveCount(1);
    await expect(item(page).getByRole('link', { name: ko('common.readOnlyLogin') })).toHaveAttribute('href', LOGIN_HREF);
    expect(stub.sent('POST', SUBSCRIBE)).toHaveLength(1);
    expect(await subsOf(page)).toEqual([]);
    // 받아들여지지 않은 브라우저 구독은 이 기기의 다른 구독이 쓰지 않으므로 지운다
    expect((await pushCalls(page)).map((call) => call.op)).toEqual(['subscribe', 'unsubscribe']);
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });

  test('새 부품: 접근성 위반 0, 320px 가로 스크롤 없음, 누르는 곳 44px 이상', async ({ page, context }) => {
    const { stub, urls, watchId } = await openWithPush(page);
    await expect(pushSwitch(page)).toBeVisible();
    await expectAccessible(page, '켤 수 있음(AVAILABLE)');

    // 같은 계정·같은 사본을 아이폰 Safari 탭처럼 연다. 구독 기록이 생기기 전에 본다: 기록이 있으면 지원 판별보다
    // 구독 상태(이 브라우저에 구독이 없으니 다시 켜기)가 먼저다
    const ios = await context.newPage();
    await stubPushApi(ios, { ios: 'tab' });
    await ios.goto('/g');
    await expect(item(ios)).toContainText(ko('guardian.pushIosTitle'));
    await expect(item(ios).locator('ol.guardian-push-steps > li')).toHaveCount(5);
    await expectAccessible(ios, '아이폰 홈 화면 추가 안내(IOS_NEEDS_INSTALL)');
    await expectClean(ios, urls, idsOf(stub, [watchId]));
    await ios.close();

    await turnOnPush(page, stub);
    await muteSwitch(page).click();
    await expect(muteSwitch(page)).toBeChecked();
    await expect(item(page)).toContainText(ko('guardian.muteOn'));
    await expectAccessible(page, '받는 중(ON), 오늘 함께 있음 켬');
    await expectClean(page, urls, idsOf(stub, [watchId]));
  });
});

test.describe('서버 알림 보호자 쪽: 서비스 워커 푸시 수신', () => {
  // 기본 헤드리스 셸은 알림 권한을 줘도 Notification.permission 이 denied 라 showNotification 이 실패한다(실측).
  // 새 헤드리스 크롬(channel 'chromium')은 권한이 붙고 ServiceWorker.deliverPushMessage 로 받은 푸시가 알림이 된다.
  // channel 은 describe 안에서 바꿀 수 없어(작업자를 새로 띄운다) 이 시험만 새 헤드리스 크롬을 따로 띄우고 같은 감시를 건다.
  test('CDP 로 보낸 푸시가 tag 와 함께 알림 하나로 뜬다', async ({ playwright }) => {
    const { baseURL, viewport, locale, timezoneId } = test.info().project.use;
    const origin = new URL(baseURL).origin;
    const browser = await playwright.chromium.launch({ channel: 'chromium' });
    try {
      const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, permissions: [] });
      const guard = await guardContext(context);
      await context.grantPermissions(['notifications'], { origin });
      const page = await context.newPage();
      const stub = await stubServerPush(page);
      const urls = trackRequests(context);
      const { watchId } = await openCopyWithWatch(page, { pin: PIN });
      expect(await page.evaluate(() => Notification.permission)).toBe('granted');

      const cdp = await context.newCDPSession(page);
      const registrations = [];
      cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => registrations.push(...event.registrations));
      await cdp.send('ServiceWorker.enable');
      const live = () => registrations.filter((r) => !r.isDeleted && r.scopeURL.startsWith(origin));
      await expect.poll(() => live().length).toBeGreaterThan(0);
      const { registrationId } = live()[0];

      const notifications = () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return (await registration.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data }));
        });
      const tag = `sh-watch-${kstDate(0)}-18:00`;
      const title = 'SafeHour';
      const send = (body) =>
        cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify({ title, body, url: '/g', tag }) });

      const firstBody = '18:00 복귀 마감이 지났어요. 아직 복귀 확인이 없어요.';
      await send(firstBody);
      await expect.poll(notifications).toEqual([{ title, body: firstBody, tag, data: { url: '/g' } }]);
      // 같은 마감의 다음 푸시는 알림 하나를 바꾼다
      const secondBody = '18:00 복귀 마감 다시 알림';
      await send(secondBody);
      await expect.poll(notifications).toEqual([{ title, body: secondBody, tag, data: { url: '/g' } }]);
      await expectClean(page, urls, idsOf(stub, [watchId]));
      expectGuardClean(guard, '새 헤드리스 크롬: ');
    } finally {
      await browser.close();
    }
  });
});
