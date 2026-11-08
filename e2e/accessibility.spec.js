// 접근성 — axe WCAG 2.1 AA 위반 0건, 키보드, 200% 확대, 44px 터치 (AX-322 · spec 12.3 시나리오 10, 7장)
//
// 새 화면 전부를 본다: /, /login, /onboarding 단계 5개, /conditions(동의·목록·편집기), /link(대기·병원 고르기),
// /guide, /today, /trip, /trip/[date], /place/[id], /cards, /emergency, /more, /settings, /privacy,
// /guardian(만들기·결과), /g(빈 상태·PIN 입력·사본), /design-board — 그리고 시트(전후 비교·복귀·바꾸기·다시 만들기·동의 철회).
//
// 자동 검사는 접근성의 바닥이지 천장이 아니다. 여기 통과했다고 스크린리더·실기기 검증을 건너뛰지 않는다.

import { test, expect } from './fixtures.js';
import {
  acknowledgeGuide,
  expectNoAxeViolations,
  findEditableStop,
  expectNoHorizontalScroll,
  expectTouchTargets,
  kstDate,
  linkDemoPlan,
  readRecord,
  setClock,
  startTrip,
  stopsOf,
} from './helpers.js';

/** 화면을 열고 로딩 문구가 사라질 때까지 기다린 뒤 axe 로 본다 */
async function scan(page, path, where = path) {
  if (path) await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main').first()).toBeVisible();
  await expectNoAxeViolations(page, where);
}

test.describe('시나리오 10 — axe WCAG 2.1 AA 위반 0건', () => {
  test('로그인 전 화면: 시작·로그인·개인정보·긴급·보호자 열기(빈 상태)·시안 보드', async ({ page }) => {
    for (const path of ['/', '/login', '/privacy', '/emergency', '/g', '/design-board', '/today', '/conditions']) {
      await scan(page, path);
    }
  });

  test('체류 설정 5단계', async ({ page }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=%2Fonboarding');
    await expect(page).toHaveURL(/\/onboarding$/);
    await scan(page, null, '체류 설정 1/5 입국·출국');
    // 오류 요약 상태도 본다
    await page.getByRole('button', { name: '다음' }).click();
    await expect(page.getByText(/확인이 필요한 항목/)).toBeVisible();
    await scan(page, null, '체류 설정 1/5 오류 요약');
    await page.getByLabel('입국 날짜').fill(kstDate(0));
    await page.getByLabel('도착 시각').fill('09:00');
    await page.getByRole('group', { name: '도착 공항' }).getByLabel('인천국제공항 (ICN)').check();
    await page.getByLabel('출국 날짜').fill(kstDate(3));
    await page.getByLabel('출발 시각').fill('20:00');
    await page.getByRole('group', { name: '출발 공항' }).getByLabel('김포국제공항 (GMP)').check();
    await page.getByRole('button', { name: '다음' }).click();
    await page.getByLabel('숙소 이름').fill('숙소');
    await page.getByLabel('주소 검색').fill('명동');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('button', { name: /데모 숙소 \(명동 인근\)/ })).toBeVisible();
    await scan(page, null, '체류 설정 2/5 숙소 (검색 결과)');
    await page.getByRole('button', { name: /데모 숙소 \(명동 인근\)/ }).click();
    await page.getByRole('button', { name: '다음' }).click();
    await scan(page, null, '체류 설정 3/5 병원과 일정');
    await page.getByLabel('병원 이름').fill('병원');
    await page.getByLabel('주소 검색').fill('압구정');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: /데모 의원 \(압구정동\)/ }).click();
    await page.getByRole('group', { name: '일정 유형' }).getByLabel(/수술·시술/).check();
    await page.getByLabel('날짜', { exact: true }).fill(kstDate(1));
    await page.getByLabel('시작 시각').fill('10:00');
    await page.getByRole('button', { name: '다음' }).click();
    await scan(page, null, '체류 설정 4/5 동반 보호자');
    await page.getByRole('radio', { name: /있음/ }).check();
    await page.getByRole('button', { name: '다음' }).click();
    await scan(page, null, '체류 설정 5/5 관심사와 강도');
  });

  test('조건·병원 연결·병원 안내 — 동의 전, 목록, 편집기, 병원 고르기', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: '/conditions' });
    await scan(page, null, '/conditions (동의 전)');
    await page.getByRole('button', { name: '동의하지 않습니다' }).click();
    await scan(page, null, '/conditions (동의 거부 안내)');
    await page.getByRole('button', { name: '동의 다시 보기' }).click();
    await page.getByRole('button', { name: '동의합니다' }).click();
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await page.getByRole('group', { name: '걷는 시간 제한이 있나요?' }).getByRole('radio', { name: '예', exact: true }).check();
    await scan(page, null, '/conditions (본인 체크 편집기)');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했어요. 아래 항목을 확인해 주세요.')).toBeVisible();
    await scan(page, null, '/conditions (편집기 오류 요약)');
    await page.getByRole('button', { name: '취소' }).click();

    await scan(page, '/link', '/link (대기)');
    await page.getByRole('button', { name: '예시 A — 외출 가능' }).click();
    await expect(page.getByRole('heading', { name: '어느 병원의 지침인가요?' })).toBeVisible();
    await scan(page, null, '/link (병원 고르기)');
    await page.getByRole('radio', { name: /데모 성형외과 E2E/ }).check();
    await page.getByRole('button', { name: '이 병원으로 연결' }).click();
    await expect(page.getByRole('heading', { name: '연결했어요' })).toBeVisible();
    await scan(page, null, '/link (연결 완료)');
    await scan(page, '/guide', '/guide (확인 전)');
    await scan(page, '/conditions', '/conditions (병원 발행 + 동의)');
  });

  test('일정 화면: 오늘(매일 확인)·전체·하루·장소·카드·긴급·더보기·설정·보호자', async ({ page }) => {
    const date = kstDate(1);
    const { tripPlan } = await startTrip(page, { hasCompanion: true }, { confirmToday: false });
    await scan(page, '/today', '/today (매일 확인 전)');
    await page.getByRole('button', { name: '그대로예요' }).click();
    await scan(page, null, '/today (확인 후)');
    await scan(page, '/trip');
    await scan(page, `/trip/${date}`, '/trip/[date] 환자 탭');
    await page.getByRole('tab', { name: /보호자/ }).click();
    await scan(page, null, '/trip/[date] 보호자 탭');
    await page.getByText(/빠진 장소와 사유/).click();
    await scan(page, null, '/trip/[date] 빠진 장소 펼침');
    const stop = stopsOf(tripPlan.days[date])[0];
    await scan(page, `/place/${stop.candidateId}`, '/place/[id]');
    for (const path of ['/cards', '/emergency', '/more', '/settings', '/privacy', '/guardian']) await scan(page, path);

    // 동의 철회 시트
    await page.goto('/settings');
    await page.getByRole('button', { name: '동의 철회' }).click();
    await expect(page.getByRole('dialog', { name: '민감정보 동의를 철회할까요?' })).toBeVisible();
    await expectNoAxeViolations(page, '동의 철회 시트');
  });

  test('보호자 링크 결과·PIN 입력·사본 보기', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await page.getByRole('button', { name: '링크 만들기' }).click();
    await expect(page.getByText('동의해야 링크를 만들 수 있어요.')).toBeVisible();
    await scan(page, null, '/guardian (오류)');
    await page.getByLabel('위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)').check();
    await page.getByLabel('PIN (숫자 6자리)').fill('135790');
    await page.getByLabel('PIN 확인 (한 번 더)').fill('135790');
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const link = await page.getByLabel('링크', { exact: true }).inputValue();
    await scan(page, null, '/guardian (링크 결과)');
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'PIN 입력' })).toBeVisible();
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill('000000');
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByText('PIN이 맞지 않아요', { exact: false })).toBeVisible();
    await scan(page, null, '/g (PIN 입력 · 오류)');
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill('135790');
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
    await scan(page, null, '/g (사본 보기)');
  });

  test('시트: 바꾸기·다시 만들기·복귀·전후 비교 — 열린 상태로 검사', async ({ page }) => {
    // 저녁에 데모 지침을 연결하면 외출이 복귀 마감을 못 지켜 "지금 돌아가세요" 시트가 덮는다. 아침으로 고정
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const { tripPlan } = await startTrip(page);
    const editable = findEditableStop(tripPlan);
    expect(editable, '오늘 이후에 식사가 아닌 정거장이 있어야 한다').toBeTruthy();
    const { date, stop: target } = editable;

    // 바꾸기 · 다시 만들기
    await page.goto(`/trip/${date}`);
    await page.getByRole('button', { name: `바꾸기 — ${target.title}` }).click();
    const swap = page.getByRole('dialog', { name: '다른 장소로 바꾸기' });
    await expect(swap.getByRole('button', { name: /^이 장소로 바꾸기/ }).first()).toBeVisible();
    await expectNoAxeViolations(page, '바꾸기 시트');
    await swap.getByRole('button', { name: '닫기' }).click();
    await expect(swap).toHaveCount(0);

    await page.getByRole('button', { name: '이 날짜 다시 만들기' }).click();
    await expect(page.getByRole('dialog', { name: '일정을 다시 만들까요?' })).toBeVisible();
    await expectNoAxeViolations(page, '다시 만들기 시트');
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();

    // 복귀 시트 · 전후 비교 시트 (오늘, 데모 사건)
    await linkDemoPlan(page, 'A');
    await acknowledgeGuide(page);
    const today = kstDate(0);
    await expect.poll(async () => JSON.stringify((await readRecord(page, 'tripPlan')).days[today].effective).includes('HOSPITAL')).toBe(true);
    await page.goto(`/trip/${today}`);
    await scan(page, null, '/trip/[오늘] 데모 사건 패널');

    const recall = page.getByRole('button', { name: /환자 호출/ });
    await expect(recall).not.toHaveAttribute('aria-disabled', 'true');
    await recall.click();
    const returnSheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(returnSheet).toBeVisible();
    await expectNoAxeViolations(page, '복귀 시트');
    await returnSheet.getByRole('button', { name: '확인했어요' }).click();
    await expect(returnSheet).toHaveCount(0);
    const changed = page.getByRole('button', { name: '변경됨 — 무엇이 바뀌었는지 보기' });
    if (await changed.count()) {
      await changed.click();
      await expect(page.getByRole('dialog', { name: '무엇이 바뀌었나요' })).toBeVisible();
      await expectNoAxeViolations(page, '전후 비교 시트');
      await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    }
  });
});

test.describe('키보드만으로 조작', () => {
  test('매일 확인을 키보드로 마친다', async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === '그대로예요');
    }
    expect(reached, 'Tab 으로 "그대로예요"에 닿지 못했다').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByText('오늘 확인을 마쳤어요. 자정까지 유지돼요.')).toBeVisible();
    // 누른 카드가 사라져도 포커스를 잃지 않는다 — 오늘 날짜 줄로 옮긴다
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('today-date'))).toBe(true);
  });

  test('환자/보호자 탭은 방향키로, 시트는 포커스를 가두고 Escape 로 닫혀 포커스를 돌려준다', async ({ page }) => {
    const { tripPlan } = await startTrip(page, { hasCompanion: true });
    const { date, stop: target } = findEditableStop(tripPlan);
    await page.goto(`/trip/${date}`);
    const patientTab = page.getByRole('tab', { name: '환자' });
    await patientTab.focus();
    await page.keyboard.press('ArrowRight');
    const guardianTab = page.getByRole('tab', { name: /보호자/ });
    await expect(guardianTab).toBeFocused();
    await expect(guardianTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(patientTab).toHaveAttribute('aria-selected', 'true');

    const swapButton = page.getByRole('button', { name: `바꾸기 — ${target.title}` });
    await swapButton.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: '다른 장소로 바꾸기' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^이 장소로 바꾸기/ }).first()).toBeVisible();
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
      expect(inside, `${i + 1}번째 Tab 에서 포커스가 시트를 벗어났다`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(swapButton).toBeFocused();
  });

  test('시작 화면에서 키보드로 언어를 고르고 로그인으로 간다', async ({ page }) => {
    await page.goto('/');
    const english = page.getByRole('button', { name: 'English', exact: true });
    let reached = false;
    for (let i = 0; i < 20 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await english.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Space');
    await expect(english).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const start = page.getByRole('link', { name: 'Get started' });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('확대와 터치 대상', () => {
  test('글자를 200% 키워도 주요 화면에 가로 스크롤이 없다 (WCAG 1.4.4)', async ({ page }) => {
    const date = kstDate(1);
    const { tripPlan } = await startTrip(page);
    const stop = stopsOf(tripPlan.days[date])[0];
    for (const path of ['/', '/today', '/trip', `/trip/${date}`, `/place/${stop.candidateId}`, '/conditions', '/cards', '/emergency', '/settings', '/guardian', '/onboarding?edit=1']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expectNoHorizontalScroll(page, `${path} 글자 200%`);
    }
  });

  test('1280px 화면을 200% 확대(640px)해도 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    const date = kstDate(1);
    await startTrip(page);
    for (const path of ['/today', `/trip/${date}`, '/conditions', '/cards']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page, `${path} 640px`);
    }
  });

  test('터치 대상이 44px 이상이다', async ({ page }) => {
    const date = kstDate(1);
    const { tripPlan } = await startTrip(page, { hasCompanion: true }, { confirmToday: false });
    const stop = stopsOf(tripPlan.days[date])[0];
    const paths = ['/today', '/trip', `/trip/${date}`, `/place/${stop.candidateId}`, '/conditions', '/cards', '/emergency', '/more', '/settings', '/guardian', '/privacy', '/link', '/onboarding?edit=1'];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectTouchTargets(page, path);
    }
    await page.goto('/');
    await expectTouchTargets(page, '/');
  });
});
