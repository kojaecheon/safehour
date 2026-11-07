// 복귀 마감이 지난 외출 화면 테스트 (마감 지남 설계서 2026-11-06 overdue-return 4.1~4.3, 5절)
//
// - 환자 경우 1: 시간이 흘러 외출의 복귀 마감이 지나면 "복귀 마감 시각이 지났어요" 시트가 뜬다.
//   저장 일정은 그대로고(returnNow 아님), 확인한 뒤에는 새로 고쳐도 다시 뜨지 않는다.
// - 환자 경우 2: 외출 중 병원 일정이 앞당겨져 마감을 맞출 수 없으면 남은 일정을 비우고 "지금 돌아가세요" 시트에 새 사유가 보인다.
// - 보호자: 받은 일정 화면에서 지난 마감은 "마감 지남"(안내·119·긴급 안내), 아직인 마감은 "예정", 맨 위에 알림 스위치.
//   화면을 연 채 다음 마감이 지나면 1분 안에 표시가 바뀐다.
//
// 시각이 필요한 곳은 setClock/advanceClock 으로 서버와 브라우저를 함께 옮긴다(오늘 시각에 따라 건너뛰지 않는다).
// 시계는 멈추지 않고 실제 속도로 흐른다. 마감 경계는 2~3분 여유를 두고 잡는다.
// 시드는 오늘 오전 8시 기준이다: 외출1(09:38 출발, 병원 복귀 11:00), 외출2·3(숙소 복귀 21:00).

import { test, expect, expectGuardClean, guardContext } from './fixtures.js';
import { returnHospitalOf } from '../src/engine/returnTarget.js';
import { shiftAppointmentsOnDate } from '../src/engine/tripEvents.js';
import {
  LODGING_NAME,
  HOSPITAL_NAME,
  acknowledgeGuide,
  advanceClock,
  createGuardianLink,
  evidenceShot,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  fireDemoEvent,
  kstDate,
  kstMinutes,
  linkDemoPlan,
  readRecord,
  setClock,
  startTrip,
  stopsOf,
} from './helpers.js';

const PIN = '482915';
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 보호자 기기: 로그인하지 않은 새 컨텍스트 (guardian.spec.js 와 같은 방식) */
async function guardianDevice(browser, testInfo) {
  const { baseURL, viewport, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, locale, timezoneId, permissions: [] });
  const record = await guardContext(context);
  return { context, record, page: await context.newPage() };
}

async function openGuardianCopy(page, link) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: '로그인하면 링크를 열 수 있어요' })).toBeVisible();
  await page.getByRole('link', { name: '로그인하고 열기' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fg/);
  await page.getByRole('link', { name: '데모 계정으로 둘러보기' }).click();
  await expect(page).toHaveURL(/\/g$/);
  await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
}

test.describe('복귀 마감이 지난 외출', () => {
  test('환자: 외출 마감이 지나면 "복귀 마감 시각이 지났어요" 시트가 뜨고, 확인 뒤 새로 고쳐도 다시 뜨지 않으며 일정은 그대로다', async ({ page }) => {
    const today = kstDate(0);
    // 오전 10시에 로그인한다: 세션은 12시간이라 저녁 마감까지 보내도 만료되지 않아 닫은 기록이 저장된다
    await setClock(page, { kst: `${today}T10:00` });
    const { tripPlan } = await startTrip(page);
    const before = tripPlan.days[today];
    // 숙소로 돌아오는 환자 외출 중 마감이 가장 늦은 것
    const lodging = before.outings.filter((o) => o.returnPlace === 'LODGING' && o.returnBy).sort((a, b) => minutesOf(a.returnBy) - minutesOf(b.returnBy));
    expect(lodging.length, '오늘 숙소로 돌아오는 환자 외출이 있어야 한다').toBeGreaterThan(0);
    const target = lodging[lodging.length - 1];
    const deadline = minutesOf(target.returnBy);
    const stopCountBefore = stopsOf(before).length;

    // 마감 3분 전: 시트가 없다 (같은 날 안이라 서버와 브라우저 시계를 함께 옮긴다)
    await advanceClock(page, (deadline - 3 - kstMinutes()) * 60_000);
    await page.goto(`/trip/${today}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 4분 흘러 마감이 지나면 시트가 자동으로 뜬다 (타이머는 1분 안에 돈다)
    await advanceClock(page, 4 * 60_000, { run: true });
    const sheet = page.getByRole('dialog', { name: '복귀 마감 시각이 지났어요' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('아직 밖이라면 아래 장소로 바로 이동하세요. 이미 돌아왔다면 아래 버튼을 눌러 닫으세요.');
    await expect(sheet).toContainText(LODGING_NAME);
    await expect(sheet.getByRole('link', { name: '119에 전화하기' })).toHaveAttribute('href', 'tel:119');
    await expect(sheet.getByRole('link', { name: '긴급 연락처 모두 보기' })).toHaveAttribute('href', '/emergency');
    await expect(sheet).not.toContainText('안전합니다');
    await evidenceShot(page, 'overdue-01-patient-passed-sheet', { fullPage: false });
    await expectNoAxeViolations(page, '마감 지남 시트');
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalScroll(page, '마감 지남 시트 320px');
    await page.setViewportSize({ width: 360, height: 780 });

    // 저장 일정은 그대로: 정거장 수 같음, returnNow 아님, 사유 추가 없음, '복귀 안내 다시 보기' 없음
    const shown = (await readRecord(page, 'tripPlan')).days[today];
    expect(stopsOf(shown).length).toBe(stopCountBefore);
    expect(shown.returnNow).not.toBe(true);
    expect(shown.reasons ?? []).not.toContain('OUTING_OVERDUE');
    await expect(page.getByRole('button', { name: '복귀 안내 다시 보기' })).toHaveCount(0);

    // 확인했어요를 누르면 시트가 닫히고, 새로 고쳐도 다시 뜨지 않는다
    await sheet.getByRole('button', { name: '확인했어요' }).click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    // 실행기가 켜진 뒤의 화면을 기다린다: 저장 일정을 읽고 오늘 일정의 마감 시각이 그려진 때
    await expect.poll(async () => (await readRecord(page, 'tripPlan'))?.days?.[today]?.outings?.length ?? 0).toBeGreaterThan(0);
    await expect(page.locator('main').getByText(target.returnBy).first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // 앱이 한 번 더 확인할 시간을 준다(1분 틱) 그래도 다시 뜨지 않는다
    await advanceClock(page, 60_000, { run: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '복귀 마감 시각이 지났어요' })).toHaveCount(0);
    const after = (await readRecord(page, 'tripPlan')).days[today];
    expect(stopsOf(after).length).toBe(stopCountBefore);
    expect(after.returnNow).not.toBe(true);
  });

  test('환자: 외출 중 병원 일정이 지금보다 앞당겨지면 남은 일정을 비우고 "지금 돌아가세요" 시트에 새 사유가 보인다', async ({ page }) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T08:00` });
    // 오늘 병원 일정(11:00)이 있는 체류: 병원으로 돌아오는 외출 1이 09:38 에 출발한다
    await startTrip(page, { visit: 0 });
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
    // 첫 정거장 도착 1분 뒤: 외출 중이다 (같은 날 안에서만 옮긴다)
    const inProgress = minutesOf(outing.stops[0].arriveAt) + 1;
    await advanceClock(page, (inProgress - kstMinutes()) * 60_000);
    await page.goto(`/trip/${today}`);
    const panel = page.getByRole('region', { name: '변화 시연 (병원 연동 데모)' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 병원 일정을 60분 앞당기는 데모 사건: 병원 복귀 마감을 맞출 수 없다
    await fireDemoEvent(panel, /병원 일정/);
    const sheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('일정이 바뀌어 지금 외출이 복귀 마감을 맞출 수 없습니다');
    const placeBlock = sheet.locator('.trip-return-place');
    await expect(placeBlock).toBeVisible();
    // 돌아갈 곳은 엔진이 다시 정해 저장한 외출의 returnPlace 를 따른다
    const stored = (await readRecord(page, 'tripPlan')).days[today];
    expect(stored.returnNow).toBe(true);
    expect(stored.reasons).toContain('OUTING_OVERDUE');
    const nowMin = kstMinutes();
    for (const stop of stopsOf(stored)) expect(minutesOf(stop.arriveAt), '남은 정거장이 비워져야 한다').toBeLessThanOrEqual(nowMin + 1);
    const returning = stored.outings.find((o) => minutesOf(o.departAt) <= nowMin && nowMin < minutesOf(o.occupancyEnd ?? o.returnBy)) ?? stored.outings[0];
    // 시드의 외출 1은 병원으로 돌아온다: 숙소가 되면 아래 '아래 장소로' 문구 경로가 시험되지 않으므로 크게 실패시킨다
    expect(returning.returnPlace, '외출 중이던 외출은 병원으로 돌아와야 한다').toBe('HOSPITAL');
    await expect(sheet).toContainText('오늘 남은 일정을 비웠어요. 아래 장소로 이동하세요.');
    // 엔진이 쓰는 규칙 그대로: 적힌 병원 id 가 체류 병원 목록에 있으면 병원 이름, 없으면 '정해 둔 장소'
    // (데모 사건이 옮긴 병원 일정을 엔진과 같은 함수로 반영한 체류로 찾는다)
    const shiftedStay = shiftAppointmentsOnDate(await readRecord(page, 'stay'), today, -60);
    if (returnHospitalOf(returning, { stay: shiftedStay, day: stored })) await expect(placeBlock).toContainText(HOSPITAL_NAME);
    else await expect(placeBlock).toContainText('정해 둔 장소');
    await expect(sheet).not.toContainText('안전합니다');
    await evidenceShot(page, 'overdue-02-patient-return-now-sheet', { fullPage: false });
    await expectNoAxeViolations(page, '지금 돌아가세요 시트(OUTING_OVERDUE)');
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalScroll(page, '지금 돌아가세요 시트 320px');
    await page.setViewportSize({ width: 360, height: 780 });

    await sheet.getByRole('button', { name: '확인했어요' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: '복귀 안내 다시 보기' })).toBeVisible();
  });

  test('보호자: 받은 일정 화면에서 지난 마감에 "마감 지남"과 119 버튼, 아직인 마감에 "예정", 맨 위에 알림 스위치. 열어 둔 채 마감이 지나면 바뀐다', async ({
    page,
    browser,
  }, testInfo) => {
    const today = kstDate(0);
    await setClock(page, { kst: `${today}T08:00` });
    const { tripPlan } = await startTrip(page, { hasCompanion: true, visit: 0 });
    const link = await createGuardianLink(page, { pin: PIN, open: true, verify: true });
    // 사본의 오늘 마감은 환자 외출 마감을 시각별로 모은 것이다 (같은 시각은 하나로 보일 수 있다)
    const bys = [...new Set(tripPlan.days[today].outings.map((o) => o.returnBy).filter(Boolean))].sort();
    expect(bys.length, '오늘 환자 복귀 마감이 둘 이상이어야 지남·예정을 함께 볼 수 있다').toBeGreaterThanOrEqual(2);
    const [first, ...rest] = bys;
    const second = rest[0];

    const guardian = await guardianDevice(browser, testInfo);
    try {
      // 첫 마감 뒤, 둘째 마감 전 (둘째 마감 10분 전이 첫 마감보다 늦도록 첫 마감 + 1분과의 중간쯤으로)
      const at = Math.max(minutesOf(first) + 1, Math.min(minutesOf(second) - 10, minutesOf(first) + 30));
      expect(at).toBeLessThan(minutesOf(second) - 3);
      await setClock(guardian.page, { kst: `${today}T${hhmm(at)}` });
      await openGuardianCopy(guardian.page, link);
      const g = guardian.page;

      // 맨 위 알림 스위치: 안내문 바로 아래, 긴급 연락보다 앞
      const toggle = g.getByRole('switch', { name: '복귀 마감 알림 받기' });
      await expect(toggle).toBeVisible();
      await expect(toggle).not.toBeChecked();
      await expect(g.getByText('이 휴대폰에서 앱이 완전히 닫혀 있으면 알림이 오지 않을 수 있어요.')).toBeVisible();
      const toggleBox = await toggle.boundingBox();
      const emergencyBox = await g.getByRole('heading', { name: /긴급/ }).first().boundingBox();
      const firstDayBox = await g.locator('.guardian-day').first().boundingBox();
      expect(toggleBox.y).toBeLessThan(emergencyBox.y);
      expect(toggleBox.y).toBeLessThan(firstDayBox.y);

      const rows = g.locator('.guardian-return');
      const passedRow = rows.filter({ hasText: first });
      const upcomingRow = rows.filter({ hasText: second });
      await expect(passedRow.first()).toContainText('마감 지남');
      await expect(passedRow.first()).toContainText('함께 있지 않다면 환자에게 연락해 돌아왔는지 확인해 주세요.');
      await expect(passedRow.first().locator('a[href="tel:119"]')).toBeVisible();
      await expect(passedRow.first().locator('a[href="/emergency"]')).toBeVisible();
      await expect(upcomingRow.first()).toContainText('예정');
      await expect(upcomingRow.first()).not.toContainText('마감 지남');
      await expect(g.locator('main')).not.toContainText('안전합니다');
      await evidenceShot(g, 'overdue-03-guardian-copy', { fullPage: false });
      await expectNoAxeViolations(g, '보호자 받은 일정(마감 지남·예정)');
      await g.setViewportSize({ width: 320, height: 700 });
      await expectNoHorizontalScroll(g, '보호자 받은 일정 320px');
      await g.setViewportSize({ width: 360, height: 780 });

      // 열어 둔 채 둘째 마감이 지나면 1분 안에 바뀐다: 마감 3분 전까지 보낸 뒤 아직 예정, 4분 더 흘러 마감 지남
      await advanceClock(g, (minutesOf(second) - 3 - kstMinutes()) * 60_000);
      await expect(upcomingRow.first()).toContainText('예정');
      await advanceClock(g, 4 * 60_000, { run: true });
      await expect(upcomingRow.first()).toContainText('마감 지남');
      await expect(upcomingRow.first()).not.toContainText('예정');
      await expect(upcomingRow.first().locator('a[href="tel:119"]')).toBeVisible();
      expectGuardClean(guardian.record, '보호자 기기: ');
    } finally {
      await guardian.context.close();
    }
  });

  test('디자인 보드: 보호자 사본 미리보기의 스위치가 오류 없이 그려진다', async ({ page }) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    const response = await page.goto('/design-board');
    expect(response?.ok()).toBe(true);
    await expect.poll(() => page.getByRole('switch', { name: '복귀 마감 알림 받기' }).count()).toBeGreaterThan(0);
    expect(errors, '디자인 보드 콘솔 오류').toEqual([]);
  });
});
