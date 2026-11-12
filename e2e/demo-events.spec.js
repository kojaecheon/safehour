// 데모 사건 → 자동 대체와 전후 비교 · 즉시 복귀 (AX-322 · 시나리오 3(옛 작업 설계서의 화면 테스트 번호), docs/business-rules.md '전체 일정 확정과 변화 대응', docs/platform/ITINERARY_RULES.md '데모 사건', docs/platform/IA_AND_FLOWS.md '즉시 복귀')
//
// 데모 사건 패널은 '병원 연동 데모' 모드의 오늘에만 있다. 그래서 체류를 만든 뒤 데모 지침 A 를 연결하고
// 병원 안내를 확인한 다음(확인하지 않은 중요 안내가 있으면 오늘이 STANDBY 로 덧씌워진다) 오늘 화면에서 시연한다.
//
// 사건은 늘 오늘을 **게이트부터 다시 판정**한다 — 알림만 띄우고 예전 일정을 두지 않는다.
// 휴무 사건은 '아직 도착하지 않은 첫 장소'를 닫는다. 오늘 남은 정거장이 없는 시각(늦은 밤)에는 그 사건을 걸 수 없다.

import { test, expect } from './fixtures.js';
import { evidenceShot, fireDemoEvent, kstDate, kstMinutes, openDemoToday, readRecord, setClock, stopsOf } from './helpers.js';

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 공용 openDemoToday(helpers.js)에 이 파일이 함께 보던 데모 표시 확인과 오늘 날짜를 더한다 */
async function openDemoTodayWithLabel(page) {
  const panel = await openDemoToday(page);
  await expect(panel.getByText('병원 연동 데모', { exact: true })).toBeVisible();
  return { today: kstDate(0), panel };
}

test.describe('시나리오 3 — 데모 사건', () => {
  test('휴무 사건은 그 장소를 자동으로 대체하고 전후 비교 시트로 보여 준다', async ({ page }) => {
    // 하루 중 언제 돌려도 오늘 남은 정거장이 있게 오늘 오전 10시로 서버·브라우저 시계를 함께 맞춘다
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const { today, panel } = await openDemoTodayWithLabel(page);
    const before = (await readRecord(page, 'tripPlan')).days[today];
    const now = kstMinutes();
    const next = stopsOf(before)
      .filter((s) => minutesOf(s.arriveAt) > now + 2)
      .sort((a, b) => minutesOf(a.arriveAt) - minutesOf(b.arriveAt))[0];
    expect(next, '오전 10시 기준으로 오늘 남은 정거장이 있어야 휴무 사건을 걸 수 있다').toBeTruthy();

    await fireDemoEvent(panel, /다음 장소 휴무/);
    await expect(page.getByText('데모 사건을 반영해 오늘 일정을 다시 판정했어요.')).toBeVisible();
    await expect(panel.getByRole('listitem').filter({ hasText: '장소 휴무' })).toBeVisible();

    // 저장된 오늘: 닫힌 장소가 빠지고, 전후 비교가 기록된다 (docs/business-rules.md '전체 일정 확정과 변화 대응': 변화가 필요한데 비교가 비면 실패)
    const after = (await readRecord(page, 'tripPlan')).days[today];
    expect(stopsOf(after).map((s) => s.contentId)).not.toContain(next.contentId);
    expect(after.delta?.hasVisibleChange).toBe(true);
    const touched = [...(after.delta.removed ?? []), ...(after.delta.replaced ?? []).map((r) => r.from)];
    expect(touched).toContain(next.id);
    expect((await readRecord(page, 'todayEvents'))?.events?.[0]).toMatchObject({ type: 'CLOSURE', closedIds: [next.contentId] });

    // '변경됨' → 전후 비교 시트
    await page.getByRole('button', { name: '변경됨 — 무엇이 바뀌었는지 보기' }).click();
    const sheet = page.getByRole('dialog', { name: '무엇이 바뀌었나요' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('변화를 반영해 일정을 이미 다시 짰어요');
    await expect(sheet).toContainText(next.title);
    if ((after.delta.replaced ?? []).length > 0) await expect(sheet.getByText('대체', { exact: true }).first()).toBeVisible();
    await evidenceShot(page, '09-delta-sheet', { fullPage: false });
    await sheet.getByRole('button', { name: '확인', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    // 본 것으로 기록된다
    await expect.poll(async () => (await readRecord(page, 'tripPlan')).days[today].delta?.seen).toBe(true);
    await expect(page.getByRole('button', { name: '변경됨 — 무엇이 바뀌었는지 보기' })).toHaveCount(0);
  });

  test('환자 호출은 오늘 남은 일정을 비우고 복귀 시트를 자동으로 연다. 뒤로 가기는 시트만 닫는다. 초기화하면 풀린다', async ({ page }) => {
    // 저녁에 지침을 연결하면 복귀 시트가 먼저 덮으므로 오늘 오전 10시로 서버·브라우저 시계를 맞춘다
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const { today, panel } = await openDemoTodayWithLabel(page);
    const url = page.url();

    await fireDemoEvent(panel, /환자 호출/);
    // 복귀 시트 자동 열림 (끌 수 없다 — AX-220)
    const sheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Go back now'); // 안전 문구 병기 (ko + en)
    await expect(sheet).toContainText('환자 또는 병원이 복귀를 요청했습니다');
    await expect(sheet.getByRole('link', { name: '119에 전화하기' })).toHaveAttribute('href', 'tel:119');
    await evidenceShot(page, '10-return-sheet', { fullPage: false });

    const stored = (await readRecord(page, 'tripPlan')).days[today];
    expect(stored.returnNow).toBe(true);
    expect(stored.reasons).toContain('PATIENT_RECALLED');
    const nowMin = kstMinutes();
    for (const stop of stopsOf(stored)) expect(minutesOf(stop.arriveAt), '남은 정거장이 비워져야 한다').toBeLessThanOrEqual(nowMin + 1);

    // 뒤로 가기(안드로이드 뒤로)는 시트만 닫고 화면을 떠나지 않는다 (ADR-0001 · AX-011)
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('heading', { name: '지금 돌아가세요' })).toBeVisible(); // 화면의 복귀 배너는 남는다
    await expect(page.getByRole('button', { name: '복귀 안내 다시 보기' })).toBeVisible();

    // 새로 고쳐도 returnNow 는 유지되고(docs/platform/ITINERARY_RULES.md '데모 사건': 오늘 사건은 누적 저장하고 매번 다시 보낸다), 앱을 다시 열면 시트가 다시 자동으로 열린다
    // 같은 사건 목록을 다시 보내도 효과가 두 번 더해지지 않는다(접는 쪽은 src/engine/tripEvents.js foldDemoEvents. 이 테스트는 유지되는 것만 본다)
    await page.reload();
    const reopened = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(reopened).toBeVisible();
    await reopened.getByRole('button', { name: '확인했어요' }).click();
    await expect(reopened).toHaveCount(0);

    // 사건 초기화 → 오늘을 다시 판정, 즉시 복귀가 풀린다
    const resetPanel = page.getByRole('region', { name: '변화 시연 (병원 연동 데모)' });
    await fireDemoEvent(resetPanel, '사건 초기화');
    await expect(page.getByText('데모 사건을 지우고 오늘 일정을 다시 판정했어요.')).toBeVisible();
    await expect.poll(async () => (await readRecord(page, 'tripPlan')).days[today].returnNow).toBe(false);
    await expect(page.getByRole('button', { name: '복귀 안내 다시 보기' })).toHaveCount(0);
    expect((await readRecord(page, 'todayEvents'))?.events ?? []).toEqual([]);
  });

  test('위험 신호는 오늘을 관광 미추천(NO_TOURISM)으로 만든다 — 오류 스타일이 아니다', async ({ page }) => {
    // 저녁에 지침을 연결하면 복귀 시트가 먼저 덮으므로 오늘 오전 10시로 서버·브라우저 시계를 맞춘다
    await setClock(page, { kst: `${kstDate(0)}T10:00` });
    const { today, panel } = await openDemoTodayWithLabel(page);
    await fireDemoEvent(panel, /위험 신호 입력/);
    await expect(page.getByText('데모 사건을 반영해 오늘 일정을 다시 판정했어요.')).toBeVisible();
    const stored = (await readRecord(page, 'tripPlan')).days[today];
    expect(stored.dayState).toBe('NO_TOURISM');
    expect(stored.reasons).toContain('RISK_SIGNAL');
    const banner = page.locator('.state-banner');
    await expect(banner).toHaveClass(/state-NO_TOURISM/);
    await expect(page.locator('main [role="alert"]').filter({ hasText: '관광 미추천' })).toHaveCount(0);
  });
});
