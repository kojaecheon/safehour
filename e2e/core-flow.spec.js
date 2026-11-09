// 핵심 흐름 (AX-322 · spec 12.3 시나리오 1·2, 3.2 기본 흐름)
//
//   1. 로그인(데모) → 체류 설정 → 민감정보 동의 → 본인 체크 → 전체 일정 → 오늘  — 화면으로 처음부터 끝까지
//   2. 매일 확인 전 제한(STANDBY + DAILY_CHECK_PENDING, 길찾기·편집 막힘)과 확인 후 해제 (규칙 32·49)
//
// 12.4 에 따라 의도적으로 다시 썼다 — 퇴역한 단일 외출 흐름(/plan·/result)과 '수기 입력 없음' 단언은
// 본인 체크 재도입(ADR-0005)과 하루 일정 엔진(ADR-0006)으로 뜻을 잃었다.

import { test, expect } from './fixtures.js';
import {
  HOSPITAL_NAME,
  HOSPITAL_PHONE,
  LODGING_NAME,
  evidenceShot,
  expectNoHorizontalScroll,
  expectTodayGateBanner,
  firstDayWithStops,
  kstDate,
  readRecord,
  startTrip,
  stopsOf,
  waitForTripPlan,
} from './helpers.js';

/** 본인 체크 한 항목에 답한다 (fieldset legend = 질문) */
async function answer(page, question, option) {
  await page.getByRole('group', { name: question, exact: true }).getByRole('radio', { name: option, exact: true }).check();
}

/** 접힌 본인 체크 묶음을 펼친다 (묶음 머리 버튼 = 묶음 이름) */
async function openGroup(page, name) {
  const toggle = page.locator('.conditions-group-toggle').filter({ hasText: name });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

test.describe('시나리오 1 — 데모 로그인부터 오늘까지', () => {
  test('로그인 → 체류 설정 → 동의 → 본인 체크 → 전체 일정 → 오늘이 끊기지 않는다', async ({ page }) => {
    const planBodies = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/itinerary/plan')) planBodies.push(request.postData() ?? '');
    });
    const arrival = kstDate(-1);
    const departure = kstDate(3);

    // ── 시작 화면 → 로그인 ──
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('① 의료 판단을 하지 않습니다.')).toBeVisible();
    await expectNoHorizontalScroll(page, '시작 화면');
    await evidenceShot(page, '01-start');
    await page.getByRole('link', { name: '시작하기' }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fonboarding/);
    await expect(page.getByText('로그인은 본인 확인이 아닙니다')).toBeVisible();
    await page.getByRole('link', { name: '데모 계정으로 둘러보기' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // ── 체류 설정 1/5: 입국·출국 ──
    await expect(page.getByRole('heading', { name: '입국·출국', level: 2 })).toBeVisible();
    await page.getByLabel('입국 날짜').fill(arrival);
    await page.getByLabel('도착 시각').fill('09:00');
    // 공항은 인천이 미리 골라져 있다 (운영자 결정 2026-11-08)
    await expect(page.getByRole('group', { name: '도착 공항' }).getByLabel('인천국제공항 (ICN)')).toBeChecked();
    await page.getByLabel('출국 날짜').fill(departure);
    await page.getByLabel('출발 시각 (선택)').fill('20:00');
    await expect(page.getByRole('group', { name: '출발 공항' }).getByLabel('인천국제공항 (ICN)')).toBeChecked();
    await expect(page.getByText('4박 체류')).toBeVisible();
    await page.getByRole('button', { name: '다음' }).click();

    // ── 2/5: 숙소 — 도로명주소 검색(키 없음 → 데모 주소) ──
    await expect(page.getByRole('heading', { name: '숙소', level: 2 })).toBeVisible();
    await page.getByLabel('숙소 이름 (선택)').fill(LODGING_NAME);
    await page.getByLabel('주소 검색').fill('강남역');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: /데모 숙소 \(강남역 인근\)/ }).click();
    await expect(page.getByText('고른 주소')).toBeVisible();
    await expect(page.getByText('데모 주소', { exact: true }).first()).toBeVisible();
    // 첫 숙소 날짜는 입·출국 날짜로 미리 채워진다
    await expect(page.getByLabel('체크인 날짜')).toHaveValue(arrival);
    await expect(page.getByLabel('체크아웃 날짜')).toHaveValue(departure);
    await evidenceShot(page, '02-onboarding-lodging');
    await page.getByRole('button', { name: '다음' }).click();

    // ── 3/5: 병원과 일정 — 병원 목록·추천 없이 사용자가 검색한 주소만 ──
    await expect(page.getByRole('heading', { name: '병원과 일정', level: 2 })).toBeVisible();
    await page.getByLabel('병원 이름').fill(HOSPITAL_NAME);
    await page.getByLabel('주소 검색').fill('신사동');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: /데모 의원 \(신사동\)/ }).click();
    await page.getByLabel('병원 전화 (선택)').fill(HOSPITAL_PHONE);
    await page.getByRole('group', { name: '일정 유형' }).getByLabel(/수술·시술/).check();
    await page.getByLabel('날짜', { exact: true }).fill(arrival);
    await page.getByLabel('시작 시각').fill('14:00');
    await expect(page.getByText('예상 종료 18:00')).toBeVisible();
    await page.getByRole('button', { name: '다음' }).click();

    // ── 4/5: 동반 보호자 ──
    await page.getByRole('radio', { name: '없음 — 혼자 머뭅니다' }).check();
    await page.getByRole('button', { name: '다음' }).click();

    // ── 5/5: 관심사와 강도 → 저장 ──
    await page.getByRole('checkbox', { name: '전시' }).check();
    await page.getByRole('checkbox', { name: '음식' }).check();
    // 강도는 느긋하게가 미리 골라져 있다. 이 시나리오는 보통으로 바꾼다
    await expect(page.getByRole('radio', { name: '느긋하게' })).toBeChecked();
    await page.getByRole('radio', { name: '보통' }).check();
    await page.getByRole('button', { name: '저장하고 조건 입력으로' }).click();
    await expect(page).toHaveURL(/\/conditions$/);

    // ── 조건: 민감정보 동의가 먼저 ──
    await expect(page.getByRole('heading', { name: '민감정보 처리 동의' })).toBeVisible();
    // 내부 표시(법무 검토 전 배지·문구 버전)는 내지 않고, 사용자에게 알릴 한 줄만 동의 버튼 옆에 둔다 (2026-11-08 검토 반영)
    await expect(page.getByText('법무 검토', { exact: false })).toHaveCount(0);
    await expect(page.getByText('이 동의 문구는 법률 검토를 거치는 중이에요. 검토가 끝나면 바뀔 수 있어요.')).toBeVisible();
    await expect(page.getByText('문구 버전', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '본인 체크 기간 추가' })).toHaveCount(0);
    await evidenceShot(page, '03-consent');
    await page.getByRole('button', { name: '동의합니다' }).click();
    await expect(page.getByText(/에 동의함$/).first()).toBeVisible();
    await expect(page.getByText('sensitive-2026', { exact: false })).toHaveCount(0);

    // ── 본인 체크 기간 — 정해진 항목만(자유 서술 칸 없음) ──
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await expect(page.getByRole('heading', { name: '본인 체크 기간 추가', level: 2 })).toBeVisible();
    await expect(page.locator('.conditions-form textarea')).toHaveCount(0);
    // 수술 후 경계일(어제)이 이미 지났으니 기본 시작일은 오늘이다 (components/conditions/periodFormModel.js newPeriodDates)
    await expect(page.getByLabel('시작일')).toHaveValue(kstDate(0));
    await page.getByLabel('종료일 (포함)').fill(departure);
    // 필수 항목은 '모르겠음'을 고를 수 없다 (규칙 6)
    await expect(page.getByRole('group', { name: '외출이 허용되나요?' }).getByRole('radio', { name: '모르겠음' })).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: '몇 시까지 돌아와야 하는지 병원이 정했나요?' }).getByRole('radio', { name: '모르겠음' }),
    ).toHaveCount(0);
    await answer(page, '외출이 허용되나요?', '허용');
    await answer(page, '몇 시까지 돌아와야 하는지 병원이 정했나요?', '아니오');
    // 나머지 항목은 묶음으로 접혀 있다. 묶음 버튼 '제한 없음'은 그 묶음을 모두 '아니오'로 채운다
    await expect(page.getByRole('group', { name: '걷는 시간 제한이 있나요?' })).toHaveCount(0);
    for (const name of ['걷기와 이동', '피해야 할 환경', '보호자', '식사와 식이', '복약']) await openGroup(page, name);
    await answer(page, '걷는 시간 제한이 있나요?', '모르겠음');
    await answer(page, '한 번 이동하는 시간 제한이 있나요?', '아니오');
    await answer(page, '자외선을 피해야 하나요?', '아니오');
    await answer(page, '사우나·찜질 등 열을 피해야 하나요?', '예');
    await answer(page, '수영·온천 등 물에 들어가면 안 되나요?', '예');
    await answer(page, '보호자가 꼭 함께 있어야 하나요?', '아니오');
    await answer(page, '환자가 쉬는 동안 보호자가 곁을 지켜야 하나요?', '아니오');
    await answer(page, '식사 제한(금식)이 있나요?', '아니오');
    await answer(page, '매운 음식을 피해야 하나요?', '예');
    await answer(page, '술을 피해야 하나요?', '예');
    await answer(page, '딱딱하거나 질긴 음식을 피해야 하나요?', '아니오');
    await answer(page, '뜨거운 음식을 피해야 하나요?', '예');
    await answer(page, '날음식(회 등)을 피해야 하나요?', '아니오');
    await answer(page, '정해진 복약 시각이 있나요?', '아니오');
    await expect(page.getByText('가장 엄격한 기본값을 적용해요')).toBeVisible();
    await evidenceShot(page, '04-self-check');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    // 첫 기간을 저장하면 오늘 화면으로 가서 한 번 알린다 (운영자 결정 2026-11-08)
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByText('첫 일정을 만들었어요.')).toBeVisible();
    await page.goto('/conditions');
    await expect(page.locator('.conditions-period-list')).toContainText('본인 체크');
    await expect(page.locator('.conditions-period-list')).toContainText('제한일');

    // ── 전체 일정 — 체류 전체를 한 번 만들어 기기에 저장한다 ──
    //   체류를 저장한 순간 한 번(조건 전 — 경계일부터 NEEDS_INPUT), 기간을 저장한 뒤 오늘 이후를 다시 만든다.
    //   지난 날짜(어제)는 재계획하지 않는다 (spec 4.9 재계획 규칙 2 · 규칙 30).
    await waitForTripPlan(page, { minDays: 5 });
    const coverages = async () => {
      const days = (await readRecord(page, 'tripPlan')).days;
      return [-1, 0, 1, 2, 3].map((n) => days[kstDate(n)]?.coverage).join(',');
    };
    await expect
      .poll(coverages, { message: '본인 체크 기간 저장 뒤 재계획' })
      .toBe('NEEDS_INPUT,RESTRICTED,RESTRICTED,RESTRICTED,RESTRICTED');
    const tripPlan = await readRecord(page, 'tripPlan');
    expect(Object.keys(tripPlan.days).sort()).toEqual([kstDate(-1), kstDate(0), kstDate(1), kstDate(2), kstDate(3)]);
    expect(tripPlan.days[kstDate(-1)].reasons).toContain('SENSITIVE_CONSENT_REQUIRED');
    for (const day of Object.values(tripPlan.days).filter((d) => d.date >= kstDate(0))) {
      expect(day.coverage, `${day.date} 분류`).toBe('RESTRICTED');
      expect(day.warnings, `${day.date} 기본값 적용 경고`).toContain('DEFAULTS_APPLIED');
      for (const outing of day.outings) {
        expect(outing.walkTotalMin, '모르겠음 → 외출 1회 보행 15분 이하 (규칙 7)').toBeLessThanOrEqual(15);
        expect(outing.plannedReturnAt <= outing.returnBy, '예상 귀가 ≤ 복귀 마감 (규칙 13-2)').toBe(true);
      }
      // 열·물·주점·매운 단서 장소는 들어가지 않는다 (규칙 21·22·25)
      for (const stop of stopsOf(day)) {
        expect(stop.title).not.toMatch(/찜질|스파|수영장|호프|와인바|이자카야|떡볶이|찌개|의원|호텔/);
      }
    }
    expect(firstDayWithStops(tripPlan), '정거장이 있는 날이 하나 이상 있어야 한다').toBeTruthy();

    // 일정 요청에는 PlanStay 허용 목록만 실린다 — 숙소·병원 이름·전화는 서버로 가지 않는다 (규칙 54)
    expect(planBodies.length).toBeGreaterThan(0);
    for (const body of planBodies) {
      expect(body).not.toContain(HOSPITAL_NAME);
      expect(body).not.toContain(HOSPITAL_PHONE);
      expect(body).not.toContain(LODGING_NAME);
    }

    await page.getByRole('link', { name: '일정', exact: true }).click();
    await expect(page).toHaveURL(/\/trip$/);
    await expect(page.getByRole('heading', { name: '전체 일정' })).toBeVisible();
    await expect(page.locator('.trip-page')).toContainText('동행 가능');
    await expectNoHorizontalScroll(page, '전체 일정');
    await evidenceShot(page, '05-trip');

    // ── 오늘 ──
    await page.getByRole('link', { name: '오늘', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { name: '오늘 조건이 그대로인가요?' })).toBeVisible();
    await expect(page.locator('.state-banner')).toBeVisible();
    await expectNoHorizontalScroll(page, '오늘');
    await evidenceShot(page, '06-today');
  });

  test('필수 항목을 비우면 본인 체크 기간이 저장되지 않는다 (규칙 6)', async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    const summary = page.getByRole('alert').filter({ hasText: '저장하지 못했어요' });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('외출');
    expect((await readRecord(page, 'stay')).periods).toEqual([]);
  });
});

test.describe('시나리오 2 — 매일 확인 전 제한과 확인 후 해제', () => {
  test('확인 전에는 STANDBY + DAILY_CHECK_PENDING 이고 길찾기·편집이 막힌다. 확인하면 풀린다', async ({ page }) => {
    const { tripPlan } = await startTrip(page, {}, { confirmToday: false });
    const today = kstDate(0);
    const storedBefore = tripPlan.days[today];
    const todayStops = stopsOf(storedBefore);

    // ── 확인 전 (오늘 화면) ──
    await expect(page.getByRole('heading', { name: '오늘 조건이 그대로인가요?' })).toBeVisible();
    await expect(page.getByText('확인 필요').first()).toBeVisible();
    const banner = await expectTodayGateBanner(page, storedBefore, '오늘 조건이 그대로인지 먼저 확인해 주세요');
    // 안전 문구는 두 언어로 (ko → ko + en)
    await expect(banner.locator('.state-secondary')).toHaveAttribute('lang', 'en');
    await evidenceShot(page, '07-daily-check-pending');

    // 저장된 확정 일정은 바꾸지 않는다 — 덧씌우기는 표시 때만 (규칙 49)
    const stored = (await readRecord(page, 'tripPlan')).days[today];
    expect(stored.dayState).toBe(storedBefore.dayState);
    expect(stored.reasons ?? []).not.toContain('DAILY_CHECK_PENDING');

    if (todayStops.length > 0) {
      // 길찾기 비활성 — 링크가 아니라 꺼진 버튼이다
      await page.goto(`/place/${todayStops[0].candidateId}`);
      await expect(page.getByRole('button', { name: /구글 지도로 열기/ })).toBeDisabled();
      await expect(page.getByRole('button', { name: /카카오맵으로 열기/ })).toBeDisabled();
      await expect(page.getByRole('link', { name: /구글 지도로 열기/ })).toHaveCount(0);
      await expect(page.getByText('매일 확인을 마치면 길찾기를 쓸 수 있어요.')).toBeVisible();
    } else {
      test.info().annotations.push({ type: 'note', description: '오늘 남은 정거장이 없어 장소 상세 길찾기 확인을 건너뜀' });
    }

    // 하루 일정: 편집 막힘
    await page.goto(`/trip/${today}`);
    await expect(page.getByText('오늘은 매일 확인 전이라 길찾기와 일정 바꾸기를 멈췄어요.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^바꾸기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeDisabled();
    await expect(page.getByText('매일 확인을 마치면 오늘 일정을 바꿀 수 있어요.')).toBeVisible();
    // 미래 날짜는 매일 확인 대상이 아니다 — 내일은 편집할 수 있다
    await page.goto(`/trip/${kstDate(1)}`);
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeEnabled();

    // ── '그대로예요' ──
    await page.goto('/today');
    await page.getByRole('button', { name: '그대로예요' }).click();
    await expect(page.getByText('오늘 확인을 마쳤어요. 자정까지 유지돼요.')).toBeVisible();
    await expect(page.getByRole('heading', { name: '오늘 조건이 그대로인가요?' })).toHaveCount(0);
    await expect(banner).toHaveClass(new RegExp(`state-${storedBefore.dayState}`));
    await expect(banner).not.toContainText('오늘 조건이 그대로인지 먼저 확인해 주세요');
    expect((await readRecord(page, 'prefs')).dailyCheck[today]).toBe('CONFIRMED');
    await evidenceShot(page, '08-daily-check-done');

    if (todayStops.length > 0) {
      await page.goto(`/place/${todayStops[0].candidateId}`);
      await expect(page.getByRole('link', { name: /구글 지도로 열기/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /카카오맵으로 열기/ })).toBeVisible();
    }
    await page.goto(`/trip/${today}`);
    await expect(page.getByText('오늘은 매일 확인 전이라 길찾기와 일정 바꾸기를 멈췄어요.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeEnabled();
    // 새로 고쳐도 자정까지 유지된다
    await page.reload();
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeEnabled();
  });

  test("'바뀌었어요'는 조건 편집으로 가고, 저장하면 재계획 뒤 확인 완료가 된다", async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    const today = kstDate(0);
    await page.getByRole('button', { name: '바뀌었어요' }).click();
    await expect(page).toHaveURL(/\/conditions$/);

    // 기간을 고친다 — 뜨거운 음식 제한을 푼다
    await page.getByRole('button', { name: '고치기' }).first().click();
    await openGroup(page, '식사와 식이');
    await answer(page, '뜨거운 음식을 피해야 하나요?', '아니오');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('기간을 저장했어요.')).toBeVisible();

    await expect
      .poll(async () => (await readRecord(page, 'prefs'))?.dailyCheck?.[today], { message: '재계획 뒤 확인 완료가 되어야 한다' })
      .toBe('CONFIRMED');
    await page.goto('/today');
    await expect(page.locator('.state-banner')).not.toContainText('오늘 조건이 그대로인지 먼저 확인해 주세요');
    await expect(page.getByRole('heading', { name: '오늘 조건이 그대로인가요?' })).toHaveCount(0);
  });
});
