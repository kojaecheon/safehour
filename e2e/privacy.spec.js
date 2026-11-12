// 개인정보 고지와 '이 기기에서 내 정보 지우기' (AX-322 · docs/security.md '기기 저장소와 계정 이름공간', docs/platform/IA_AND_FLOWS.md '동의 철회와 데이터 삭제')
//
// 삭제가 진짜인지는 **저장소가 비었는지**로 확인한다. 화면 문구만 보면 "지웠다고 말하지만 남아 있는" 상태를 놓친다.
// 지우는 것: 모든 계정 이름공간, 보호자 사본, 알림 예약, AI 문장 캐시. 남기는 것: 언어 설정. 그리고 로그아웃한다.

import { test, expect } from './fixtures.js';
import { evidenceShot, readRecord, startTrip } from './helpers.js';

const PIN = '246810';

/** safehour.v2. 아래 남은 키 (언어 설정은 남는다) */
async function remainingKeys(page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage).filter((k) => k.startsWith('safehour.v2.')),
    session: Object.keys(sessionStorage).filter((k) => k.startsWith('safehour.')),
  }));
}

test.describe('개인정보 고지', () => {
  test('무엇을 받고 받지 않는지, 어디에 남기는지가 두 언어로 적혀 있다', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('현재 위치(GPS)를 쓰지 않으며', { exact: false })).toBeVisible();
    await expect(page.getByText('it never uses your live location (GPS)', { exact: false })).toBeVisible();
    await expect(page.getByText('의료진의 판단을 대체하지 않습니다', { exact: false })).toBeVisible();
    await expect(page.getByText('한국관광공사', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '이 기기에서 내 정보 지우기' })).toBeVisible();
  });

  test('시작 화면과 더보기에서 고지로 갈 수 있다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /개인정보와 면책 안내/ }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await startTrip(page, {}, { path: '/more' });
    await page.getByRole('link', { name: /개인정보와 면책 안내/ }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test.describe("규칙 41 — '이 기기에서 내 정보 지우기'", () => {
  test('체류·일정·설정·보호자 사본을 모두 지우고 로그아웃한다. 언어만 남는다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });

    // 보호자 사본도 이 기기에 만들어 둔다 — 지우는 대상이다
    await page.getByLabel('위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)').check();
    await page.getByLabel('PIN (숫자 6자리)').fill(PIN);
    await page.getByLabel('PIN 확인 (한 번 더)').fill(PIN);
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const link = await page.getByLabel('링크', { exact: true }).inputValue();
    await page.goto(link);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();

    // 언어를 골라 둔다 — 지운 뒤에도 남아야 하는 유일한 설정이다
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect((await remainingKeys(page)).local.length).toBeGreaterThan(3);
    expect(await readRecord(page, 'stay')).toBeTruthy();
    expect(Object.keys((await readRecord(page, 'guardianCopies')) ?? {})).toHaveLength(1);

    // 취소하면 아무것도 지워지지 않는다
    const deleteButton = page.getByRole('button', { name: 'Delete my data from this device' });
    await deleteButton.click();
    await expect(page.getByText('This cannot be undone.', { exact: false })).toBeVisible();
    await evidenceShot(page, '21-delete-confirm');
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await readRecord(page, 'stay')).toBeTruthy();

    await deleteButton.click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(/items deleted/)).toBeVisible();
    await expect(page.getByText('You have been signed out.')).toBeVisible();

    const keys = await remainingKeys(page);
    expect(keys.local, '언어 설정 말고는 남지 않는다').toEqual(['safehour.v2.device.lang']);
    expect(keys.session, '탭 저장소에도 남지 않는다').toEqual([]);
    expect(await readRecord(page, 'stay')).toBeNull();
    expect(await readRecord(page, 'tripPlan')).toBeNull();
    expect(await readRecord(page, 'guardianCopies')).toBeNull();

    // 서버 세션도 끝난다 — 쿠키는 httpOnly 라 서버가 지워 줘야 이 버튼이 사실이 된다
    const session = await page.evaluate(async () => (await fetch('/api/auth/session', { cache: 'no-store' })).json());
    expect(session.authenticated, '지웠는데 로그인 상태가 남아 있다').toBe(false);

    // 처음 화면으로 돌아가면 삭제 안내가 한 번만 보인다
    await page.getByRole('button', { name: 'Go to the start screen' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Your entries and results have been deleted from this device.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Your entries and results have been deleted from this device.')).toHaveCount(0);
    // 고른 언어는 남아 있어 안내를 계속 읽을 수 있다
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();

    // 지운 뒤에는 오늘 화면에 일정이 없다
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'No trip details yet' })).toBeVisible();
  });
});
