// ③층 체류 설정(/onboarding) — SEED 화면 배치 (설계서 6.1 · 6.2 3번)
//
// 흰 바탕 한 장: 단계 표시 → 26px 단계 제목 → Field 묶음 → 하단 고정 [이전 3][다음 7].
// 입력은 필드 id(ob-…)로 채워 언어와 무관하게 같은 흐름을 탄다.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --line-input rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245) · --selected rgb(42, 48, 56) · --accent rgb(10, 92, 255) ·
// --emergency rgb(200, 16, 46) · --support-soft rgb(255, 233, 240) · --line-strong rgb(220, 222, 227).

import { test, expect } from './fixtures.js';
import { kstDate, loginDemo } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

/** '다음'(마지막 단계는 '저장') — 하단 바의 제출 버튼 */
const submit = (page) => page.locator('.onboarding-actions button[type="submit"]').click();

/** 1단계 — 입국 오늘 09:00 인천, 출국 3일 뒤 20:00 김포 */
async function fillTravel(page) {
  await page.fill('#ob-arrival-date', kstDate(0));
  await page.fill('#ob-arrival-time', '09:00');
  await page.check('#ob-arrival-airport');
  await page.fill('#ob-departure-date', kstDate(3));
  await page.fill('#ob-departure-time', '20:00');
  await page.check('#ob-departure-airport-GMP');
}

/** 2단계 — 숙소 이름 + 데모 주소 검색 첫 결과 */
async function fillLodging(page) {
  await page.fill('#ob-lodgings-0-name', '숙소');
  await page.fill('#ob-lodgings-0-address', '명동');
  await page.locator('#ob-lodgings .onboarding-search-row button').click();
  await page.locator('.onboarding-result').first().click();
}

/** 3단계 — 병원 이름 + 데모 주소, 수술·시술 일정 내일 10:00 */
async function fillHospital(page) {
  await page.fill('#ob-hospitals-0-name', '병원');
  await page.fill('#ob-hospitals-0-address', '압구정');
  await page.locator('#ob-hospitals .onboarding-search-row button').click();
  await page.locator('.onboarding-result').first().click();
  await page.check('#ob-appointments-0-type');
  await page.fill('#ob-appointments-0-date', kstDate(1));
  await page.fill('#ob-appointments-0-start', '10:00');
}

test.describe('③층 체류 설정 — 단계 머리와 하단 바', () => {
  test('단계 표시에 코발트가 없고, 단계 제목은 26/35 먹색', async ({ page }) => {
    await loginDemo(page, '/onboarding');

    // 상단 바 20px 아래에서 단계 표시가 시작한다
    const steps = page.locator('.onboarding-steps');
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await steps.boundingBox())).toBe(20);

    // 지금 단계 = SEED '선택됨' 진한 채움 + 흰 숫자, 번짐 그림자 없음. 아직 안 간 단계 = 파선
    const current = page.locator('.onboarding-steps-item.is-current .onboarding-steps-mark');
    expect(await styles(current, ['background-color', 'color', 'box-shadow', 'width'])).toEqual({
      'background-color': 'rgb(42, 48, 56)',
      color: 'rgb(255, 255, 255)',
      'box-shadow': 'none',
      width: '40px',
    });
    expect(
      (await styles(page.locator('.onboarding-steps-item.is-upcoming .onboarding-steps-mark').first(), ['border-top-style']))[
        'border-top-style'
      ],
    ).toBe('dashed');

    // 단계 제목 26/35 굵게 먹색, 설명과 6px
    const title = page.locator('#ob-step-title');
    expect(await styles(title, ['font-size', 'line-height', 'font-weight', 'color'])).toEqual({
      'font-size': '26px',
      'line-height': '35px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect(gapBetween(await title.boundingBox(), await page.locator('.onboarding-lead').boundingBox())).toBe(6);

    // 지난 단계 = 흰 원 + 3:1 테두리 + 먹색 체크
    await fillTravel(page);
    await submit(page);
    await expect(page.locator('#ob-lodgings-0-name')).toBeVisible();
    const done = page.locator('.onboarding-steps-item.is-done .onboarding-steps-mark');
    await expect(done).toHaveCount(1);
    await expect(done.locator('svg')).toHaveCount(1);
    expect(await styles(done, ['background-color', 'border-top-color', 'color'])).toEqual({
      'background-color': 'rgb(255, 255, 255)',
      'border-top-color': 'rgb(134, 139, 148)',
      color: 'rgb(26, 28, 32)',
    });

    // 단계 표시 어디에도 코발트(--accent · --accent-strong)가 없다
    const colors = await page
      .locator('.onboarding-steps-mark')
      .evaluateAll((els) =>
        els.flatMap((el) => {
          const s = getComputedStyle(el);
          return [s.backgroundColor, s.borderTopColor, s.color];
        }),
      );
    expect(colors).not.toContain('rgb(10, 92, 255)');
    expect(colors).not.toContain('rgb(0, 70, 209)');
  });

  test('하단 고정 바 — 긴급 바 바로 위에 [이전 3][다음 7]', async ({ page }) => {
    await loginDemo(page, '/onboarding');

    // 불투명 흰 면 + 1px 윗선, 하단 긴급 바 바로 위(틈 0)에 고정
    const bar = page.locator('.onboarding-actions');
    expect(await styles(bar, ['position', 'background-color', 'border-top-width', 'border-top-color'])).toEqual({
      position: 'fixed',
      'background-color': 'rgb(255, 255, 255)',
      'border-top-width': '1px',
      'border-top-color': 'rgb(220, 222, 227)',
    });
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-emergency-bar').boundingBox())).toBe(0);

    // 두 고정 바가 키보드 초점 칸을 덮지 않게 스크롤 여백을 둔다
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe('160px');

    // 1단계는 '다음' 하나가 바 폭(좌우 여백 16 × 2 를 뺀 폭)을 다 쓴다
    const barBox = await bar.boundingBox();
    expect(Math.round((await bar.getByRole('button', { name: '다음' }).boundingBox()).width)).toBe(Math.round(barBox.width - 32));

    // 2단계부터 [이전 3][다음 7], 둘 다 52px 한 줄
    await fillTravel(page);
    await submit(page);
    const prev = await bar.getByRole('button', { name: '이전' }).boundingBox();
    const next = await bar.getByRole('button', { name: '다음' }).boundingBox();
    expect(prev.width / (prev.width + next.width)).toBeCloseTo(0.3, 2);
    expect(Math.round(prev.height)).toBe(52);
    expect(Math.round(next.height)).toBe(52);
  });

  test('320px zh — 上一步·下一步가 한 줄(52px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: '中文', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
    await loginDemo(page, '/onboarding');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

    await fillTravel(page);
    await submit(page);
    const bar = page.locator('.onboarding-actions');
    for (const name of ['上一步', '下一步']) {
      expect(Math.round((await bar.getByRole('button', { name }).boundingBox()).height)).toBe(52);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('③층 체류 설정 — 입력 묶음', () => {
  test('그림자 카드 없이 흰 바탕, 박 수는 알약이 아니고, 삭제는 작은 회색 버튼', async ({ page }) => {
    await loginDemo(page, '/onboarding');

    // 입국·출국 묶음 = 흰 바탕 그대로(그림자·테두리·안쪽 여백 없음), 묶음 사이 32px
    const groups = page.locator('fieldset.onboarding-card');
    expect(
      await styles(groups.first(), ['box-shadow', 'border-top-width', 'background-color', 'padding-left']),
    ).toEqual({
      'box-shadow': 'none',
      'border-top-width': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
      'padding-left': '0px',
    });
    expect(gapBetween(await groups.nth(0).boundingBox(), await groups.nth(1).boundingBox())).toBe(32);

    // 박 수 = 굵은 먹색 글자 한 줄(코발트 알약 아님)
    await fillTravel(page);
    const tally = page.locator('.onboarding-tally');
    await expect(tally).toHaveText('3박 체류');
    expect(await styles(tally, ['background-color', 'font-weight', 'color'])).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });

    // 숙소 삭제 = 작은 회색 버튼(44px · 모서리 8)
    await submit(page);
    await page.getByRole('button', { name: '숙소 구간 추가' }).click();
    const remove = page.getByRole('button', { name: '숙소 1 삭제' });
    expect(await styles(remove, ['background-color', 'min-height', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'min-height': '44px',
      'border-top-left-radius': '8px',
    });
  });

  test('주소 검색 — 검색은 작은 회색 버튼, 고른 주소는 흰 면 + 진한 테두리', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await fillTravel(page);
    await submit(page);

    await page.fill('#ob-lodgings-0-address', '명동');
    const search = page.getByRole('button', { name: '검색', exact: true });
    expect((await styles(search, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await search.click();
    await page.getByRole('button', { name: /데모 숙소 \(명동 인근\)/ }).click();

    // 고른 주소 = Select Box 고른 칸: 흰 면 + 2px 진한 테두리(1px + 안쪽 1px), 코발트 띠 없음
    const picked = page.locator('.onboarding-picked');
    expect(
      await styles(picked, ['background-color', 'border-top-color', 'border-left-width', 'box-shadow', 'border-top-left-radius']),
    ).toEqual({
      'background-color': 'rgb(255, 255, 255)',
      'border-top-color': 'rgb(26, 28, 32)',
      'border-left-width': '1px',
      'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
      'border-top-left-radius': '12px',
    });
    expect((await styles(picked.locator('.onboarding-picked-caption'), ['color'])).color).toBe('rgb(26, 28, 32)');
  });

  test('관심사 칩 — 고르면 진한 테두리·회색 면·굵게, 링은 키보드 초점에만', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await fillTravel(page);
    await submit(page);
    await fillLodging(page);
    await submit(page);
    await fillHospital(page);
    await submit(page);
    await page.check('#ob-hasCompanion');
    await submit(page);

    // 마우스로 고르면 진한 테두리 + 회색 면 + 굵게, 링은 뜨지 않는다
    // background-color 는 --duration-fast 전환이 걸려 있어(.ui-answer-option 과 같은 값) 클릭 직후 값이
    // 아직 안 옮았을 수 있다 — design-board-components.spec.js 의 답 칩 검사와 같이 poll 로 기다린다
    const cafe = page.locator('label[for="ob-interest-CAFE"]');
    await cafe.click();
    await page.mouse.move(0, 0);
    await expect
      .poll(() => styles(cafe, ['border-top-color', 'background-color', 'font-weight', 'color', 'outline-style']))
      .toEqual({
        'border-top-color': 'rgb(26, 28, 32)',
        'background-color': 'rgb(243, 244, 245)',
        'font-weight': '700',
        color: 'rgb(26, 28, 32)',
        'outline-style': 'none',
      });
    // 안 고른 칩은 3:1 테두리
    expect((await styles(page.locator('label[for="ob-interest-FOOD"]'), ['border-top-color']))['border-top-color']).toBe(
      'rgb(134, 139, 148)',
    );

    // 키보드로 옮기면 다음 칩(전시)에 코발트 링
    await page.keyboard.press('Tab');
    expect(await styles(page.locator('label[for="ob-interest-EXHIBITION"]'), ['outline-style', 'outline-color'])).toEqual({
      'outline-style': 'solid',
      'outline-color': 'rgb(10, 92, 255)',
    });
  });

  test('면책 상자 — 앞에 20px 먹색 안내 아이콘, 두 언어 병기는 그대로', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    const note = page.locator('.onboarding-safety');
    const icon = note.locator('.onboarding-safety-icon');
    await expect(icon.locator('svg')).toHaveCount(1);
    expect((await icon.locator('svg').boundingBox()).width).toBe(20);
    expect((await styles(icon, ['color'])).color).toBe('rgb(26, 28, 32)');
    await expect(note).toHaveAttribute('role', 'note');
    await expect(note.locator('p')).toHaveCount(2);

    // 시작 화면 면책 상자도 같은 부품이다
    await page.goto('/');
    await expect(page.locator('.onboarding-footer-note .onboarding-safety-icon svg')).toHaveCount(1);
  });
});
