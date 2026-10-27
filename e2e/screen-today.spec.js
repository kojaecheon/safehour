// ③층 오늘(/today): SEED 화면 배치 (설계서 6.2 7번)
//
// 회색 바탕 위 흰 블록: 갱신 실패(있을 때만) / 매일 확인 / 날짜·상태 / 병원 안내 / 다음 외출 / 바로가기 목록 / 보호자·동반 안내.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음, 오늘 매일 확인 마침).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --state-standby-bg rgb(255, 244, 217), --state-standby-ink rgb(122, 74, 0), --ink rgb(26, 28, 32).

import { test, expect } from './fixtures.js';
import { buildStay, fireDemoEvent, gapBetween, kstDate, linkDemoPlan, openDemoToday, startTrip, styles } from './helpers.js';

/**
 * 다음 재계획을 실패시킨다: 일정 API 를 503 으로 막고, 다른 탭에서 체류를 바꾼 것처럼 storage 이벤트를 보낸다
 * (같은 탭의 localStorage 쓰기는 이벤트가 나지 않는다). 출국을 하루 늦춰 영향 날짜가 생기게 한다.
 */
async function failNextSync(page) {
  await page.route('**/api/itinerary/plan', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }),
  );
  await page.evaluate(async (stay) => {
    const { accountKey } = await (await fetch('/api/auth/session', { cache: 'no-store' })).json();
    const key = `safehour.v2.${accountKey}.stay`;
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ schemaVersion: 2, data: stay });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
  }, buildStay({ departure: 5 }));
}

test.describe('③층 오늘, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 날짜·상태 블록이 상단 바 바로 아래, 블록 사이 8px', async ({ page }) => {
    await startTrip(page);
    await expect(page.locator('.state-banner')).toBeVisible();
    await expect(page.locator('.today-syncing')).toHaveCount(0);

    const main = page.locator('main.today-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    // 날짜·상태와 바로가기는 늘 있다. 다음 외출 블록은 KST 자정 근처에 빠질 수 있다
    expect(await blocks.count()).toBeGreaterThanOrEqual(2);
    await expect(blocks.first()).toHaveClass(/today-status-block/);
    const status = main.locator(':scope > .today-status-block');
    await expect(status.locator('.today-date')).toHaveCount(1);
    await expect(status.locator('.state-banner')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
  });

  test('바로가기 목록: 오늘 전체 일정·내일 일정은 화살표 목록 행이고 코발트 채움이 없다', async ({ page }) => {
    await startTrip(page);
    const block = page.locator('main.today-page > .today-links-block');
    const full = block.getByRole('link', { name: '오늘 전체 일정', exact: true });
    const next = block.getByRole('link', { name: '내일 일정', exact: true });
    await expect(full).toHaveAttribute('href', `/trip/${kstDate(0)}`);
    await expect(next).toHaveAttribute('href', `/trip/${kstDate(1)}`);
    for (const row of [full, next]) {
      await expect(row).toHaveClass(/ui-list-item/);
      await expect(row.locator('.ui-list-item-trailing svg')).toHaveCount(1);
      await expect.poll(async () => (await styles(row, ['background-color']))['background-color']).toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('갱신 실패: 흰 블록 안의 대기 색 알림 상자, ! 아이콘, 굵은 제목, 다시 시도', async ({ page }) => {
    await startTrip(page);
    await expect(page.locator('.state-banner')).toBeVisible();
    await failNextSync(page);
    const alert = page.getByRole('alert').filter({ hasText: '일정을 새로 고치지 못했어요' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main.today-page > .today-sync-block').getByRole('alert')).toHaveCount(1);
    await expect(alert.locator('.trip-notice-icon svg')).toHaveCount(1);
    await expect
      .poll(() => styles(alert, ['background-color']))
      .toEqual({ 'background-color': 'rgb(255, 244, 217)' });
    expect((await styles(alert.locator('.trip-notice-title'), ['font-weight']))['font-weight']).toBe('700');
    await expect(alert.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  for (const confirmToday of [true, false]) {
    test(`빈 흰 블록이 없다: ${confirmToday ? '확인 마친 오늘' : '매일 확인 전 오늘'}`, async ({ page }) => {
      await startTrip(page, {}, { confirmToday });
      await expect(page.locator('.state-banner')).toBeVisible();
      const texts = await page
        .locator('main.today-page > .ui-block')
        .evaluateAll((els) => els.map((el) => el.innerText.trim().length));
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.every((n) => n > 0), `빈 블록: ${JSON.stringify(texts)}`).toBe(true);
    });
  }

  test('320px English, 매일 확인 전: 오늘 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { confirmToday: false });
    await expect(page.locator('.today-check')).toBeVisible();
    // 제한 항목을 펼친 상태에서도 넘치지 않아야 한다
    const more = page.locator('.today-check-more');
    await more.locator(':scope > summary').click();
    await expect(more).toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('③층 오늘, 매일 확인과 다음 외출', () => {
  test('매일 확인 블록: 카드 테두리·면 없이 흰 블록, 확인 필요는 대기 색 글자 + 아이콘, 요약은 회색 면 모서리 10', async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    const check = page.locator('main.today-page > .today-check-block .today-check');
    await expect(check).toBeVisible();
    await expect
      .poll(() => styles(check, ['border-top-width', 'background-color']))
      .toEqual({ 'border-top-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    const flag = check.locator('.today-check-flag');
    expect((await styles(flag, ['color']))['color']).toBe('rgb(122, 74, 0)');
    await expect(flag.locator('svg')).toHaveCount(1);
    expect(await styles(check.locator('.today-check-list').first(), ['background-color', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'border-top-left-radius': '10px',
    });
    // 매일 확인 전에는 '그대로예요'가 화면의 주 버튼(코발트 채움 rgb(10, 92, 255))이다
    const same = check.getByRole('button', { name: '그대로예요' });
    await expect.poll(async () => (await styles(same, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
  });

  test('제한 항목 펼치기: 코발트·테두리 없는 먹색 펼침 행, 높이 44 이상', async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    const summary = page.locator('.today-check-more > summary');
    await expect(summary).toBeVisible();
    await expect
      .poll(() => styles(summary, ['color', 'border-top-width', 'background-color']))
      .toEqual({ color: 'rgb(26, 28, 32)', 'border-top-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('다음 외출 블록: 카드 없이 블록, 복귀 마감은 왼쪽 띠 없는 회색 안내 상자(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page);
    const block = page.locator('main.today-page > .today-outing-block');
    await expect(block).toBeVisible();
    if ((await block.locator('.today-focus').count()) === 0) {
      // 오늘 남은 외출이 없는 시각: 외출 끝 구역이 상자 없이 블록 안에 놓인다
      await expect(block.locator('.today-outing-empty')).toHaveCount(1);
      expect((await styles(block.locator('.today-outing-empty'), ['border-top-width']))['border-top-width']).toBe('0px');
      return;
    }
    expect(await styles(block.locator('.today-focus'), ['border-top-width', 'box-shadow'])).toEqual({
      'border-top-width': '0px',
      'box-shadow': 'none',
    });
    expect(
      await styles(block.locator('.today-deadline'), ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top']),
    ).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'background-color': 'rgb(243, 244, 245)',
      'padding-top': '14px',
    });
    await expect(block.locator('.today-deadline-main svg')).toHaveCount(1);
  });
});

test.describe('③층 오늘, 상태 블록과 안내 구역', () => {
  test('확인하지 않은 병원 안내: 자기 흰 블록, 회색 버튼이 흰 면 위에 보인다', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/today');
    const section = page.getByRole('region', { name: '확인하지 않은 병원 안내가 있어요' });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section).toHaveClass(/ui-block/);
    await expect(section).toHaveClass(/today-section/);
    await expect(page.locator('main.today-page > .today-status-block + .today-section')).toHaveCount(1);
    expect((await styles(section, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    const button = section.getByRole('link', { name: '병원 안내 확인하기' });
    await expect.poll(async () => (await styles(button, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });

  test('입력이 필요한 오늘: 고칠 곳은 하루 일정과 같은 점선 상자(모서리 10 · 안쪽 14), 상태 블록 안', async ({ page }) => {
    await startTrip(page, { consent: false });
    const fix = page.locator('main.today-page > .today-status-block .trip-fix');
    await expect(fix).toBeVisible();
    expect(await styles(fix, ['border-top-style', 'border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-style': 'dashed',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    await expect(fix.getByRole('heading', { name: '오늘 일정을 만들려면 입력이 필요해요' })).toBeVisible();
    await expect(fix.getByRole('link').or(fix.getByRole('button'))).toHaveCount(1);
    // 고칠 곳이 있어도 빈 흰 블록은 없다(다음 외출 블록 조건 포함)
    const texts = await page
      .locator('main.today-page > .ui-block')
      .evaluateAll((els) => els.map((el) => el.innerText.trim().length));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((n) => n > 0), `빈 블록: ${JSON.stringify(texts)}`).toBe(true);
  });

  test('데모 사건 뒤 오늘: 변경됨은 하루 일정과 같은 누르는 안내 상자, 즉시 복귀 배너는 2px 먹색', async ({ page }) => {
    const panel = await openDemoToday(page);
    await fireDemoEvent(panel, /환자 호출/);
    const returnSheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(returnSheet).toBeVisible();
    await returnSheet.getByRole('button', { name: '확인했어요' }).click();
    await expect(returnSheet).toHaveCount(0);

    await page.goto('/today');
    // 즉시 복귀 시트는 새로 불러올 때마다 다시 열린다(닫은 기록이 메모리에만 있다). 닫고 나서 배너를 본다
    const reopened = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(reopened).toBeVisible();
    await reopened.getByRole('button', { name: '확인했어요' }).click();
    await expect(reopened).toHaveCount(0);
    const status = page.locator('main.today-page > .today-status-block');
    const changed = status.locator('button.trip-changed');
    await expect(changed).toHaveCount(1);
    await expect(changed).not.toHaveClass(/btn/);
    await expect(changed.locator('.trip-changed-text')).toHaveCount(1);
    await expect(changed.locator('svg')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect
      .poll(() => styles(changed, ['background-color', 'border-top-left-radius', 'justify-content']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-left-radius': '10px', 'justify-content': 'flex-start' });
    const banner = status.locator('.trip-return-banner');
    await expect
      .poll(() => styles(banner, ['border-top-style', 'border-top-width', 'border-top-color']))
      .toEqual({ 'border-top-style': 'solid', 'border-top-width': '2px', 'border-top-color': 'rgb(26, 28, 32)' });
  });

  test('복귀 마감 안내 상자(시안 보드 견본, 시각과 무관): 왼쪽 띠 없는 회색 면 · 모서리 10 · 안쪽 14, 깃발 아이콘', async ({ page }) => {
    await page.goto('/design-board');
    const deadline = page.locator('.today-deadline').first();
    // 견본은 시안 틀(overflow: hidden)의 첫 화면 아래에 있다. 틀 안을 굴려 실제로 보이게 한 뒤 본다
    await deadline.scrollIntoViewIfNeeded();
    await expect(deadline).toBeVisible();
    expect(await styles(deadline, ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top'])).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'background-color': 'rgb(243, 244, 245)',
      'padding-top': '14px',
    });
    await expect(deadline.locator('.today-deadline-main svg')).toHaveCount(1);
  });
});
