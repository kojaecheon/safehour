// 데모 병원 연동 A/B/C (AX-322 · 시나리오 5(옛 작업 설계서의 화면 테스트 번호), docs/business-rules.md '병원 연동'·'날짜별 합성'·'날짜 분류'·'매일 확인', docs/contracts.md '`POST /api/plan/link`')
//
// - 코드 연결은 로그인 + 민감정보 동의 뒤에만 된다. 데모 지침에는 '병원 연동 데모' 배지가 늘 붙는다(docs/business-rules.md '병원 연동').
// - A: 정상 지침 — 병원 발행 기간이 합성에 참여하고, 확인하지 않은 중요 안내가 있으면 오늘이 STANDBY 로 덧씌워진다.
// - B: 외출 불가 기간 — 외출 없는 날(REST_DAY → NO_TOURISM)은 오류가 아니라 정상 결과다.
// - C: 이미 만료된 지침 — 기간은 저장되지만 적용하지 않는다. 경계일 이후는 HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED.
// - 병원 안내문 원문은 번역·요약하지 않고, 일정 요청에 실리지 않는다.

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, acknowledgeGuide, evidenceShot, expectTodayGateBanner, kstDate, linkDemoPlan, readRecord, setClock, startTrip } from './helpers.js';

const DEMO_BADGE = '병원 연동 데모';

async function coverageOf(page, date) {
  return (await readRecord(page, 'tripPlan'))?.days?.[date]?.coverage;
}

test.describe('시나리오 5 — 데모 병원 연동', () => {
  test('A: 정상 지침을 연결하면 병원 발행 기간이 적용되고, 중요 안내를 확인하기 전에는 오늘이 대기다', async ({ page }) => {
    // 저녁에 데모 지침을 연결하면 외출이 복귀 마감을 못 지켜 "지금 돌아가세요" 시트가 덮는다. 아침으로 고정
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const planBodies = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/itinerary/plan')) planBodies.push(request.postData() ?? '');
    });
    const today = kstDate(0);
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    expect(await coverageOf(page, today)).toBe('NEEDS_INPUT');

    await linkDemoPlan(page, 'A');
    const done = page.locator('.conditions-done');
    await expect(done.getByText(DEMO_BADGE, { exact: true })).toBeVisible();
    await expect(done.getByText('유효', { exact: true })).toBeVisible();
    await expect(done).toContainText('병원 발행 기간 2개를 저장했어요.');
    await expect(done).toContainText('병원 일정 1개를 더했어요.');
    await evidenceShot(page, '12-link-demo-a');

    const stay = await readRecord(page, 'stay');
    expect(stay.linkedPlans.map((lp) => lp.code)).toEqual(['DEMO-A']);
    const hospitalPeriods = stay.periods.filter((p) => p.source === 'HOSPITAL');
    expect(hospitalPeriods).toHaveLength(2);
    // v2 병원 복귀 기간의 hospitalId 는 연결 병원 id 로 채워진다 (docs/contracts.md '`POST /api/plan/link`')
    const hospitalReturn = hospitalPeriods.find((p) => p.items.returnTime?.place === 'HOSPITAL');
    expect(hospitalReturn.items.returnTime.hospitalId).toBe('hosp-e2e-1');
    expect(stay.appointments.some((a) => a.source === 'HOSPITAL' && a.hospitalId === 'hosp-e2e-1')).toBe(true);

    // 조건 화면: 병원 발행 출처와 데모 배지
    await page.goto('/conditions');
    await expect(page.locator('.conditions-period-list').getByText('병원 발행').first()).toBeVisible();
    await expect(page.locator('.conditions-period-list').getByText(DEMO_BADGE, { exact: true }).first()).toBeVisible();

    await expect.poll(() => coverageOf(page, today), { message: '연결 뒤 오늘 재계획' }).toBe('RESTRICTED');

    // 오늘: 병원 기간만 덮는 날은 매일 확인이 없고, 확인하지 않은 중요 안내로 STANDBY (docs/business-rules.md '매일 확인')
    await page.goto('/today');
    await expect(page.locator('.today-date').getByText(DEMO_BADGE, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '오늘 조건이 그대로인가요?' })).toHaveCount(0);
    const storedToday = (await readRecord(page, 'tripPlan')).days[today];
    await expectTodayGateBanner(page, storedToday, '확인하지 않은 병원 안내 변경이 있습니다');
    expect(storedToday.reasons ?? [], '덧씌우기는 저장 일정을 바꾸지 않는다 (규칙 49)').not.toContain('PLAN_UNCONFIRMED_UPDATE');
    await expect(page.getByRole('heading', { name: '확인하지 않은 병원 안내가 있어요' })).toBeVisible();

    // 병원 안내: 원문 그대로(번역·요약 없음), 확인하면 덧씌우기만 풀린다
    await page.goto('/guide');
    await expect(page.getByText('병원 원문 그대로 · 번역하지 않음').first()).toBeVisible();
    await expect(page.getByText('처방된 항생제와 소염제를 식후 30분에 복용하세요.', { exact: false })).toBeVisible();
    await expect(page.getByText(DEMO_BADGE, { exact: true }).first()).toBeVisible();
    await acknowledgeGuide(page);
    await page.goto('/today');
    await expect(page.locator('.state-banner')).not.toContainText('확인하지 않은 병원 안내 변경이 있습니다');
    await expect(page.locator('.today-date').getByText(DEMO_BADGE, { exact: true })).toBeVisible();

    // 병원 안내문·발행처·병원 이름은 일정 요청에 실리지 않는다
    expect(planBodies.length).toBeGreaterThan(0);
    for (const body of planBodies) {
      expect(body).not.toContain('항생제');
      expect(body).not.toContain('(데모)');
      expect(body).not.toContain(HOSPITAL_NAME);
      expect(body).not.toContain('DEMO-A');
    }
  });

  test('B: 외출 불가 지침이면 오늘은 외출이 없는 날이고, 오류가 아니라 정상 결과로 보인다', async ({ page }) => {
    // 저녁에 데모 지침을 연결하면 외출이 복귀 마감을 못 지켜 "지금 돌아가세요" 시트가 덮는다. 아침으로 고정
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const today = kstDate(0);
    await startTrip(page, { periods: [], hasCompanion: true }, { path: '/conditions' });
    await linkDemoPlan(page, 'B');
    await expect(page.locator('.conditions-done').getByText(DEMO_BADGE, { exact: true })).toBeVisible();
    await expect.poll(() => coverageOf(page, today)).toBe('REST_DAY');

    const day = (await readRecord(page, 'tripPlan')).days[today];
    expect(day.outings).toEqual([]);
    expect(day.dayState).toBe('NO_TOURISM');
    await acknowledgeGuide(page);
    await page.goto(`/trip/${today}`);
    const banner = page.locator('.state-banner');
    await expect(banner).toHaveClass(/state-NO_TOURISM/);
    await expect(banner).toContainText('병원이 외출을 제한했습니다');
    await expect(page.locator('main [role="alert"]')).toHaveCount(0); // 오류 알림이 아니다
    // 보호자 탭: 동행 필수, 잠금 표시와 이유 (docs/business-rules.md '하루 일정 생성'의 보호자 단독 외출)
    await page.getByRole('tab', { name: /보호자/ }).click();
    await expect(page.getByText('보호자 단독 외출 없음')).toBeVisible();
    await expect(page.getByText('동행이 필요한 날이라 보호자는 환자와 함께 있어요.', { exact: false })).toBeVisible();
    await evidenceShot(page, '13-link-demo-b-rest-day');
  });

  test('C: 이미 만료된 지침은 저장하되 적용하지 않고, 수술 후 날짜는 새 지침 또는 본인 체크를 안내한다 (규칙 12)', async ({ page }) => {
    // 저녁에 데모 지침을 연결하면 외출이 복귀 마감을 못 지켜 "지금 돌아가세요" 시트가 덮는다. 아침으로 고정
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const today = kstDate(0);
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await linkDemoPlan(page, 'C');
    const done = page.locator('.conditions-done');
    await expect(done.getByText('만료됨', { exact: true })).toBeVisible();
    await expect(done.getByText(DEMO_BADGE, { exact: true })).toBeVisible();
    await expect(done).toContainText('이 지침은 유효기간이 지났어요.');
    await evidenceShot(page, '14-link-demo-c-expired');

    const stay = await readRecord(page, 'stay');
    expect(stay.periods.filter((p) => p.source === 'HOSPITAL').length).toBeGreaterThan(0);

    // 오늘은 늦은 시각이면 외출 창이 없어 사유가 달라질 수 있다 — 만료 규칙은 내일 날짜로 본다
    const date = kstDate(1);
    await expect
      .poll(async () => (await readRecord(page, 'tripPlan')).days[date]?.reasons ?? [])
      .toContain('HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED');
    expect(await coverageOf(page, date)).toBe('NEEDS_INPUT');

    await page.goto(`/trip/${date}`);
    await expect(page.getByText('병원 지침의 유효기간이 지났습니다', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '새 병원 지침 받기 또는 본인 체크 넣기' })).toHaveAttribute('href', '/conditions');
    await page.goto('/conditions');
    await expect(page.locator('.conditions-period-list').getByText(/만료됨/).first()).toBeVisible();
    await expect(page.locator('.conditions-period-list').getByText(DEMO_BADGE, { exact: true }).first()).toBeVisible();
  });

  test('동의 전에는 병원 연동을 열지 않는다', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: '/link' });
    await expect(page.getByText('병원 지침을 연결하려면 먼저 민감정보 처리에 동의해야 해요.')).toBeVisible();
    await expect(page.getByRole('button', { name: '예시 A — 외출 가능' })).toHaveCount(0);
  });
});
