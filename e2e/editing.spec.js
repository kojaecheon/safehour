// 일정 편집: 교체·삭제·식사 칸 비우기·다시 만들기 (AX-322 · 시나리오 4(옛 작업 설계서의 화면 테스트 번호), docs/business-rules.md '사용자 편집'·'전체 일정 확정과 변화 대응')
// 지도 길찾기는 목적지 이름·좌표만 (docs/business-rules.md '알림과 카드': 숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다)
//
// 편집은 시각에 영향을 받지 않도록 **내일** 일정에서 한다(오늘은 이미 지난 정거장을 바꾸지 않는다).

import { test, expect } from './fixtures.js';
import { DEMO_CLINIC, DEMO_LODGING, evidenceShot, findEditableStop, kstDate, readRecord, startTrip, stopsOf } from './helpers.js';

async function dayOf(page, date) {
  return (await readRecord(page, 'tripPlan')).days[date];
}

/** 편집이 끝났다는 안내가 뜰 때까지 기다린다 */
async function expectNotice(page, text) {
  await expect(page.locator('.trip-page [role="status"]').filter({ hasText: text })).toBeVisible();
}

test.describe('시나리오 4 — 교체·삭제·다시 만들기', () => {
  test('바꾸기는 후보 최대 5곳을 보여 주고, 고른 장소를 직접 고름(고정)으로 넣는다', async ({ page }) => {
    const { tripPlan } = await startTrip(page);
    const editable = findEditableStop(tripPlan);
    expect(editable, '오늘 이후에 식사가 아닌 정거장이 있어야 한다').toBeTruthy();
    const { date, stop: target } = editable;
    await page.goto(`/trip/${date}`);

    await page.getByRole('button', { name: `바꾸기 — ${target.title}` }).click();
    const sheet = page.getByRole('dialog', { name: '다른 장소로 바꾸기' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(`지금 장소: ${target.title}`);
    const picks = sheet.getByRole('button', { name: /^이 장소로 바꾸기/ });
    await expect(picks.first()).toBeVisible();
    const count = await picks.count();
    expect(count, '교체 후보는 1–5곳 (규칙 33)').toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(5);
    await evidenceShot(page, '11-swap-sheet', { fullPage: false });

    const chosenTitle = (await picks.first().innerText()).split('—').pop().trim();
    await picks.first().click();
    await expect(sheet).toHaveCount(0);
    await expectNotice(page, '장소를 바꿨어요');

    const after = await dayOf(page, date);
    const swapped = stopsOf(after).find((s) => s.title === chosenTitle);
    expect(swapped, '고른 장소가 일정에 들어가야 한다').toBeTruthy();
    expect(swapped.pinned).toBe(true);
    expect(stopsOf(after).map((s) => s.contentId)).not.toContain(target.contentId);
    expect((await readRecord(page, 'tripPlan')).edits[date].pinned).toContain(swapped.contentId);
    await expect(page.getByText('직접 고름').first()).toBeVisible();
    // 바꾼 외출은 복귀 계산을 다시 통과했다
    for (const outing of after.outings) expect(outing.plannedReturnAt <= outing.returnBy).toBe(true);
  });

  test('빼기는 외출 시각을 다시 계산하고, 뺀 장소는 다시 자동 배치되지 않는다', async ({ page }) => {
    const { tripPlan } = await startTrip(page);
    const editable = findEditableStop(tripPlan);
    expect(editable, '오늘 이후에 식사가 아닌 정거장이 있어야 한다').toBeTruthy();
    const { date, stop: target } = editable;
    await page.goto(`/trip/${date}`);
    const before = await dayOf(page, date);

    await page.getByRole('button', { name: `빼기 — ${target.title}` }).click();
    await expectNotice(page, '장소를 뺐어요. 외출 시각을 다시 계산했어요.');
    let after = await dayOf(page, date);
    expect(stopsOf(after).map((s) => s.contentId)).not.toContain(target.contentId);
    expect((await readRecord(page, 'tripPlan')).edits[date].deleted).toContain(target.contentId);

    // 조건을 고쳐 재계획이 일어나도 뺀 장소는 돌아오지 않는다 (docs/business-rules.md '전체 일정 확정과 변화 대응'의 재계획 규칙 2~4)
    await page.goto('/conditions');
    await page.getByRole('button', { name: '고치기' }).first().click();
    await page.locator('.conditions-group-toggle').filter({ hasText: '식사와 식이' }).click();
    await page
      .getByRole('group', { name: '뜨거운 음식을 피해야 하나요?', exact: true })
      .getByRole('radio', { name: '아니오', exact: true })
      .check();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('기간을 저장했어요.')).toBeVisible();
    expect(before.effective['diet.hot'].value.kind).toBe('SET');
    await expect
      .poll(async () => (await dayOf(page, date)).effective['diet.hot'].value.kind, { message: '조건 변경 뒤 재계획' })
      .toBe('NONE');
    after = await dayOf(page, date);
    expect(stopsOf(after).map((s) => s.contentId)).not.toContain(target.contentId);
    expect((await readRecord(page, 'tripPlan')).edits[date].deleted).toContain(target.contentId);
  });

  test('식사 칸을 비우면 비움으로 남고 자동으로 다시 채우지 않는다', async ({ page }) => {
    const { tripPlan } = await startTrip(page);
    const editable = findEditableStop(tripPlan, { meal: true });
    expect(editable, '오늘 이후에 식사 정거장이 있어야 한다').toBeTruthy();
    const { date, stop: meal } = editable;
    await page.goto(`/trip/${date}`);

    await page.getByRole('button', { name: `식사 칸 비우기 — ${meal.title}` }).click();
    await expectNotice(page, '식사 칸을 비웠어요. 자동으로 다시 채우지 않아요.');
    const after = await dayOf(page, date);
    expect(after.mealSlots.some((m) => m.status === 'CLEARED')).toBe(true);
    expect(stopsOf(after).map((s) => s.contentId)).not.toContain(meal.contentId);
    await expect(page.getByText('비워 둔 식사 칸')).toBeVisible();
  });

  test('다시 만들기는 확인 대화를 거치고, 고정·삭제 기록을 지우고 새로 만든다', async ({ page }) => {
    const { tripPlan } = await startTrip(page);
    const { date, stop: target } = findEditableStop(tripPlan, { meal: true }) ?? findEditableStop(tripPlan);
    await page.goto(`/trip/${date}`);
    await page.getByRole('button', { name: `빼기 — ${target.title}` }).or(page.getByRole('button', { name: `식사 칸 비우기 — ${target.title}` })).click();
    await expectNotice(page, target.isMeal ? '식사 칸을 비웠어요' : '장소를 뺐어요');
    const edited = (await readRecord(page, 'tripPlan')).edits[date];
    expect([...(edited.deleted ?? []), ...(edited.clearedMeals ?? [])].length).toBeGreaterThan(0);

    await page.getByRole('button', { name: '이 날짜 다시 만들기' }).click();
    const sheet = page.getByRole('dialog', { name: '일정을 다시 만들까요?' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('radio', { name: /이 날짜만/ })).toBeChecked();
    await expect(sheet.getByRole('radio', { name: /오늘 이후 전체/ })).toBeVisible();
    // 취소하면 아무것도 바뀌지 않는다
    await sheet.getByRole('button', { name: '취소' }).click();
    await expect(sheet).toHaveCount(0);
    expect((await readRecord(page, 'tripPlan')).edits[date]).toEqual(edited);

    await page.getByRole('button', { name: '이 날짜 다시 만들기' }).click();
    await page.getByRole('dialog', { name: '일정을 다시 만들까요?' }).getByRole('button', { name: '다시 만들기', exact: true }).click();
    await expectNotice(page, '일정을 다시 만들었어요.');
    const edits = (await readRecord(page, 'tripPlan')).edits[date];
    expect(edits?.deleted ?? []).toEqual([]);
    expect(edits?.pinned ?? []).toEqual([]);
    expect(edits?.clearedMeals ?? []).toEqual([]);
  });

  test('지난 날짜는 편집할 수 없다', async ({ page }) => {
    const date = kstDate(-1);
    await startTrip(page, {}, { path: `/trip/${date}` });
    await expect(page.getByText('지난 날짜는 바꿀 수 없어요.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^바꾸기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^빼기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '이 날짜 다시 만들기' })).toBeDisabled();
  });
});

test.describe('지도 길찾기 — 목적지만 (규칙 39)', () => {
  test('지도 링크에는 목적지 이름·좌표만 있고 출발지·숙소·병원 좌표가 없다', async ({ page }) => {
    const { tripPlan } = await startTrip(page);
    const date = findEditableStop(tripPlan, { meal: true })?.date ?? kstDate(1);
    await page.goto(`/trip/${date}`);
    const stops = stopsOf(tripPlan.days[date]);
    expect(stops.length).toBeGreaterThan(0);

    const forbidden = [DEMO_LODGING, DEMO_CLINIC].map((p) => [p.lat, p.lng]);
    const checked = [];
    for (const stop of stops) {
      await page.goto(`/place/${stop.candidateId}`);
      const google = page.getByRole('link', { name: /구글 지도로 열기/ });
      const kakao = page.getByRole('link', { name: /카카오맵으로 열기/ });
      await expect(google).toBeVisible();
      await expect(page.getByText('목적지(이 장소)의 이름과 좌표만 넘겨요.', { exact: false })).toBeVisible();
      const g = new URL(await google.getAttribute('href'));
      const k = await kakao.getAttribute('href');
      expect(g.hostname).toBe('www.google.com');
      expect([...g.searchParams.keys()].sort()).toEqual(['api', 'destination']);
      expect(g.searchParams.has('origin')).toBe(false);
      const [lat, lng] = g.searchParams.get('destination').split(',').map(Number);
      expect(lat).toBeCloseTo(stop.lat, 5);
      expect(lng).toBeCloseTo(stop.lng, 5);
      expect(k.startsWith('https://map.kakao.com/link/to/')).toBe(true);
      const kParts = decodeURIComponent(k.slice('https://map.kakao.com/link/to/'.length)).split(',');
      expect(kParts).toHaveLength(3);
      expect(Number(kParts[1])).toBeCloseTo(stop.lat, 5);
      expect(Number(kParts[2])).toBeCloseTo(stop.lng, 5);
      for (const [flat, flng] of forbidden) {
        expect(Math.abs(lat - flat) + Math.abs(lng - flng), '숙소·병원 좌표가 지도 링크에 들어갔다').toBeGreaterThan(1e-4);
      }
      checked.push(stop.contentId);
    }

    // 어떤 화면의 어떤 지도 링크에도 숙소·병원 좌표가 없다
    for (const path of ['/today', `/trip/${date}`, '/cards', '/emergency']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const hrefs = await page.locator('a[href*="google.com/maps"], a[href*="map.kakao.com"]').evaluateAll((els) => els.map((a) => a.href));
      for (const href of hrefs) {
        expect(href).not.toContain('origin');
        expect(href).not.toContain(String(DEMO_LODGING.lat));
        expect(href).not.toContain(String(DEMO_CLINIC.lat));
      }
    }
    expect(checked.length).toBe(stops.length);
  });
});
