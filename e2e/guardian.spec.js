// 보호자 링크 만들기와 PIN 으로 열기 (AX-322 · spec 12.3 시나리오 6, 4.11, 5.4, 규칙 37·38)
//
// - 환자 기기: 공유 동의 + 6자리 PIN → 링크 `<origin>/g#<암호문>`. 암호문은 # 뒤에만 있다.
// - 보호자 기기(새 브라우저 컨텍스트 — 다른 휴대폰): 로그인하지 않은 채 링크를 열면 암호문을 탭 저장소에
//   잠시 두고, 로그인 왕복 뒤에 이어서 PIN 을 묻는다. 가져오면 임시 보관을 지운다.
// - 틀린 PIN 은 남은 횟수를 알려 주고, 5번 연속 틀리면 그 기기에서 1시간 잠긴다.
// - 암호문(# 뒤)은 어떤 요청의 경로·본문·헤더에도 실리지 않는다 — 두 컨텍스트의 모든 요청을 본다.
// - 스냅샷에는 식이·복약·보행·자외선·열·물·병원 정보가 없다 — 링크를 실제로 풀어 확인한다.

import { test, expect, expectGuardClean, guardContext } from './fixtures.js';
import { HOSPITAL_NAME, HOSPITAL_PHONE, createGuardianLink, evidenceShot, readRecord, startTrip } from './helpers.js';
import { decryptSnapshot } from '../src/guardian/index.js';

const PIN = '482915';
const PENDING_KEY = 'safehour.v2.tab.pendingGuardianLink';

/** 요청 하나를 문자열로 — 경로·본문·헤더 모두 */
async function requestText(request) {
  const headers = await request.allHeaders().catch(() => ({}));
  return [request.url(), request.postData() ?? '', JSON.stringify(headers)].join('\n');
}

function watchRequests(target, sink) {
  target.on('request', (request) => {
    sink.push(requestText(request));
  });
}

/** 보호자 기기 — 로그인하지 않은 새 컨텍스트 */
async function guardianDevice(browser, testInfo) {
  const { baseURL, viewport, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, permissions: [] });
  const record = await guardContext(context);
  return { context, record, page: await context.newPage() };
}

async function loginRoundTrip(page, link) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: '로그인하면 링크를 열 수 있어요' })).toBeVisible();
  // 로그인 왕복 동안 암호문을 탭 저장소에만 잠시 둔다
  await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), PENDING_KEY)).not.toBeNull();
  await page.getByRole('link', { name: '로그인하고 열기' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fg/);
  await page.getByRole('link', { name: '데모 계정으로 둘러보기' }).click();
  await expect(page).toHaveURL(/\/g$/);
  await expect(page.getByRole('heading', { name: 'PIN 입력' })).toBeVisible();
}

async function enterPin(page, pin) {
  const input = page.getByLabel('환자에게 받은 PIN (숫자 6자리)');
  await input.fill(pin);
  await page.getByRole('button', { name: '열기', exact: true }).click();
}

test.describe('시나리오 6 — 보호자 링크', () => {
  test('링크를 만들고, 새 기기에서 로그인 왕복 뒤 PIN 으로 연다. 틀린 PIN 은 횟수를 센다. 암호문은 어떤 요청에도 없다', async ({
    page,
    context,
    browser,
  }, testInfo) => {
    const patientRequests = [];
    watchRequests(context, patientRequests);
    await startTrip(page, { hasCompanion: true });
    const link = await createGuardianLink(page, { pin: PIN, open: true, verify: true });
    const fragment = link.split('#')[1];
    await evidenceShot(page, '15-guardian-create');
    expect((await readRecord(page, 'stay')).guardianShare?.lastSentAt).toBeTruthy();

    // 스냅샷 내용 (규칙 37) — 실제로 풀어 본다
    const snapshot = await decryptSnapshot(fragment, PIN);
    const text = JSON.stringify(snapshot);
    expect(snapshot.emergency).toEqual(['119', '1330']);
    expect(snapshot.days.length).toBeGreaterThan(0);
    expect(snapshot.days.length).toBeLessThanOrEqual(7); // 만든 날부터 7일만 담는다(findings 2)
    for (const forbidden of [HOSPITAL_NAME, HOSPITAL_PHONE, 'diet', 'medication', 'walkLimit', 'avoidUv', 'avoidHeat', 'avoidWater', 'deadlineReason', 'appointment', 'hospitalId']) {
      expect(text, `보호자 스냅샷에 '${forbidden}' 이 들어 있다`).not.toContain(forbidden);
    }
    await expect(decryptSnapshot(fragment, '000000')).rejects.toThrow();

    // ── 보호자 기기 ──
    const guardian = await guardianDevice(browser, testInfo);
    const guardianRequests = [];
    watchRequests(guardian.context, guardianRequests);
    try {
      await loginRoundTrip(guardian.page, link);

      // 틀린 PIN — 남은 횟수 안내
      await enterPin(guardian.page, '000000');
      await expect(guardian.page.getByRole('alert').filter({ hasText: 'PIN이 맞지 않아요' })).toContainText('4번 더 틀리면');
      await enterPin(guardian.page, '111111');
      await expect(guardian.page.getByRole('alert').filter({ hasText: 'PIN이 맞지 않아요' })).toContainText('3번 더 틀리면');

      // 맞는 PIN — 사본을 저장해 보여 준다
      await enterPin(guardian.page, PIN);
      await expect(guardian.page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
      await expect(guardian.page.getByText(/기준$/).first()).toBeVisible(); // 'O월 O일 O시 기준' — 자동 갱신되지 않는 사본
      await expect(guardian.page.getByText(/^담긴 일정: /)).toBeVisible(); // 기준 시각 옆의 담긴 날짜 범위
      await expect(guardian.page.getByText('이 안내는 받은 시점의 사본이라 자동으로 바뀌지 않아요.', { exact: false })).toBeVisible();
      await expect(guardian.page.getByRole('link', { name: /119/ }).first()).toHaveAttribute('href', 'tel:119');
      await expect(guardian.page.locator('main')).not.toContainText(HOSPITAL_NAME);
      await expect(guardian.page.locator('main')).not.toContainText(HOSPITAL_PHONE);
      await evidenceShot(guardian.page, '16-guardian-open');

      // 가져온 뒤: 임시 보관을 지우고 주소창에서 암호문을 지운다
      expect(await guardian.page.evaluate((k) => sessionStorage.getItem(k), PENDING_KEY)).toBeNull();
      expect(new URL(guardian.page.url()).hash).toBe('');
      expect(Object.keys((await readRecord(guardian.page, 'guardianCopies')) ?? {})).toHaveLength(1);

      // 암호문은 어떤 요청의 경로·본문·헤더에도 실리지 않는다 (규칙 38)
      for (const entry of [...patientRequests, ...guardianRequests]) {
        expect(await entry, '요청에 보호자 링크 암호문이 실렸다').not.toContain(fragment);
        expect(await entry).not.toContain(fragment.slice(0, 32));
      }
      expect(guardianRequests.length).toBeGreaterThan(0);
      expectGuardClean(guardian.record, '보호자 기기: ');
    } finally {
      await guardian.context.close();
    }
  });

  test('PIN 을 5번 연속 틀리면 그 기기에서 링크가 잠긴다', async ({ page, browser }, testInfo) => {
    await startTrip(page, { hasCompanion: true });
    const link = await createGuardianLink(page, { pin: PIN, open: true, verify: true });
    const guardian = await guardianDevice(browser, testInfo);
    try {
      await loginRoundTrip(guardian.page, link);
      for (const pin of ['000001', '000002', '000003', '000004']) {
        await enterPin(guardian.page, pin);
        await expect(guardian.page.getByRole('alert').filter({ hasText: 'PIN이 맞지 않아요' })).toBeVisible();
      }
      await enterPin(guardian.page, '000005');
      await expect(guardian.page.getByRole('alert').filter({ hasText: '이 기기에서 이 링크가 잠겼어요' })).toBeVisible();
      await expect(guardian.page.getByLabel('환자에게 받은 PIN (숫자 6자리)')).toBeDisabled();
      // 맞는 PIN 도 이제 받지 않는다 — 새로 고쳐도 잠금이 유지된다
      await guardian.page.reload();
      await expect(guardian.page.getByLabel('환자에게 받은 PIN (숫자 6자리)')).toBeDisabled();
      expectGuardClean(guardian.record, '보호자 기기: ');
    } finally {
      await guardian.context.close();
    }
  });
});
