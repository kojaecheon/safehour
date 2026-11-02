// ③층 장소 상세(/place/[id]): SEED 화면 배치 (설계서 6.2 8번)
//
// 회색 바탕 위 흰 블록: 그림·이름·체류·배지 / 지도 / 이 장소의 일정(SafeHour 추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.
// 장소는 e2e 도우미 findEditableStop 으로 고른다(요일 휴무로 어떤 날은 식사 칸만 있다).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245), 흰 면 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { findEditableStop, gapBetween, kstDate, startTrip, stopsOf, styles } from './helpers.js';

/** 장소 상세 주소 (components/CourseCard.js placeHref 와 같다) */
const placeHrefOf = (stop) =>
  `/place/${encodeURIComponent(String(stop.candidateId ?? stop.contentId))}?stop=${encodeURIComponent(String(stop.id))}`;

/** 체류를 심고, 오늘 이후 식사(meal=true) 또는 식사 아닌(meal=false) 첫 정거장의 장소 상세를 연다 */
async function openPlace(page, { meal = false } = {}) {
  const { tripPlan } = await startTrip(page, {}, { path: '/trip' });
  const found = findEditableStop(tripPlan, { meal });
  expect(found, meal ? '식사 정거장이 있어야 한다' : '식사 아닌 정거장이 있어야 한다').not.toBeNull();
  await page.goto(placeHrefOf(found.stop));
  await expect(page.locator('main .ui-source').first()).toBeVisible();
  return found;
}

test.describe('③층 장소 상세, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 그림 블록이 상단 바 바로 아래, 카드 테두리 없이 화면 폭, 블록 사이 8px', async ({ page }) => {
    await openPlace(page);
    const main = page.locator('main.place-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(4);
    const hero = blocks.first();
    await expect(hero).toHaveClass(/place-hero/);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await hero.boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
    const card = hero.locator('.ui-place');
    expect(await styles(card, ['border-top-width', 'border-top-left-radius'])).toEqual({
      'border-top-width': '0px',
      'border-top-left-radius': '0px',
    });
    // 그림이 블록(= main 의 바깥 폭) 끝까지 찬다
    expect(Math.round((await hero.locator('.ui-place-media').boundingBox()).width)).toBe(Math.round((await main.boundingBox()).width));
  });

  test('출처 블록: SafeHour 추정과 관광공사 원문은 서로 다른 흰 블록, 출처 영역 테두리는 그대로', async ({ page }) => {
    await openPlace(page);
    const plan = page.locator('main.place-page > .place-plan-block');
    const source = page.locator('main.place-page > .place-source-block');
    await expect(plan.locator('.ui-source-estimate')).toHaveCount(1);
    await expect(plan.locator('.ui-source-tourism')).toHaveCount(0);
    expect(await source.locator('.ui-source-tourism').count()).toBeGreaterThanOrEqual(1);
    await expect(source.locator('.ui-source-estimate')).toHaveCount(0);
    expect((await styles(plan.locator('.ui-source-estimate'), ['border-top-style']))['border-top-style']).toBe('dotted');
    expect((await styles(source.locator('.ui-source-tourism').first(), ['border-left-style']))['border-left-style']).toBe('double');
  });

  test('빈 흰 블록이 없다', async ({ page }) => {
    await openPlace(page);
    // 상세(사진·접근성 등)를 다 불러온 뒤 잰다
    await expect(page.locator('.place-loading')).toHaveCount(0);
    const texts = await page
      .locator('main.place-page > .ui-block')
      .evaluateAll((els) => els.map((el) => el.innerText.trim().length));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((n) => n > 0), `빈 블록: ${JSON.stringify(texts)}`).toBe(true);
  });

  test('320px English: 장소 상세에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openPlace(page);
    await expect(page.locator('.place-loading')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('③층 장소 상세, 지도 버튼과 상태별 블록', () => {
  /** 두 버튼이 한 줄에 같은 폭으로(반반) 놓였는지 */
  async function expectHalves(row) {
    const items = row.locator(':scope > *');
    await expect(items).toHaveCount(2);
    const [a, b] = [await items.nth(0).boundingBox(), await items.nth(1).boundingBox()];
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
  }

  test('지도 버튼 [구글][카카오]: 회색 작은 버튼 반반', async ({ page }) => {
    await openPlace(page);
    const row = page.locator('main.place-page > .place-maps .trip-map-row');
    await expectHalves(row);
    const google = row.getByRole('link', { name: /구글 지도로 열기/ });
    await expect.poll(async () => (await styles(google, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });

  test('320px English: 두 줄 글자여도 지도 버튼은 한 줄 반반', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openPlace(page);
    await expectHalves(page.locator('main.place-page > .place-maps .trip-map-row'));
  });

  for (const [code, langName] of [
    ['ja', '日本語'],
    ['zh', '中文'],
  ]) {
    test(`320px ${code}: 지도 버튼은 반반, 버튼 글자는 두 줄 이내(좁은 지도 구역은 아이콘이 글자 위)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await openPlace(page);
      const row = page.locator('main.place-page > .place-maps .trip-map-row');
      await expectHalves(row);
      // 보이는 글자 칸: components/trip/MapLinks.js 의 아이콘(svg) 다음 span. 숨긴 이름(.visually-hidden)은 뺀다
      const lines = await row
        .locator(':scope > .btn > span:not(.visually-hidden)')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))));
      expect(lines).toHaveLength(2);
      expect(lines.every((n) => n <= 2), `버튼별 글자 줄 수: ${JSON.stringify(lines)}`).toBe(true);
    });
  }

  test('매일 확인 전인 오늘 장소: 막힌 두 버튼도 반반, 막은 이유가 지도 블록 안', async ({ page }) => {
    const { tripPlan } = await startTrip(page, {}, { path: '/trip', confirmToday: false });
    const stop = stopsOf(tripPlan.days[kstDate(0)] ?? { outings: [] })[0];
    test.skip(!stop, '오늘 남은 정거장이 없는 시각이다');
    await page.goto(placeHrefOf(stop));
    const maps = page.locator('main.place-page > .place-maps');
    await expect(maps.getByRole('button', { name: /구글 지도로 열기/ })).toBeDisabled();
    await expectHalves(maps.locator('.trip-map-row'));
    await expect(maps.getByText('매일 확인을 마치면 길찾기를 쓸 수 있어요.')).toBeVisible();
  });

  test('상세 불러오기 실패: 안내 문장은 관광공사 원문 블록 안, 추정 블록은 그대로', async ({ page }) => {
    await page.route('**/api/place', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }));
    await openPlace(page);
    const source = page.locator('main.place-page > .place-source-block');
    await expect(source.getByText('상세 정보를 불러오지 못했어요. 일정 속 정보는 그대로예요.')).toBeVisible();
    await expect(page.locator('main.place-page > .place-plan-block .ui-source-estimate')).toBeVisible();
  });

  test('식사 장소: 주문 카드는 테두리 없는 흰 블록, 회색 버튼이 흰 면 위에 보인다', async ({ page }) => {
    const found = await openPlace(page, { meal: true });
    // 데이터로 건너뛴다(components/trip/viewModel.js stopBadges: labels 에 ORDER_CARD 가 있어야 주문 카드를 그린다)
    test.skip(!(found.stop.labels ?? []).includes('ORDER_CARD'), '이 식사 정거장에는 주문 카드 라벨이 없다');
    const order = page.getByRole('region', { name: '주문할 때 보여 줄 한국어 카드' });
    await expect(order).toHaveCount(1);
    await expect(order).toHaveClass(/ui-block/);
    expect(await styles(order, ['border-top-width', 'background-color'])).toEqual({
      'border-top-width': '0px',
      'background-color': 'rgb(255, 255, 255)',
    });
    const button = order.getByRole('link', { name: '식이 카드 열기' });
    await expect.poll(async () => (await styles(button, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });
});
