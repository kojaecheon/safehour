// ③층 장소 상세(/place/[id]): SEED 화면 배치 (설계서 6.2 8번)
//
// 회색 바탕 위 흰 블록: 그림·이름·체류·배지 / 지도 / 이 장소의 일정(SafeHour 추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.
// 장소는 e2e 도우미 findEditableStop 으로 고른다(요일 휴무로 어떤 날은 식사 칸만 있다).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245), 흰 면 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { findEditableStop, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
