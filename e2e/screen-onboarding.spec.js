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

/** 4단계 — 동반 보호자 없음 → 5단계(관심사·강도)로 간다 */
async function fillCompanion(page) {
  await page.check('#ob-hasCompanion-no');
}

/** 1–4단계를 채우고 5단계(마지막)로 간다 */
async function goToLastStep(page) {
  await fillTravel(page);
  await submit(page);
  await fillLodging(page);
  await submit(page);
  await fillHospital(page);
  await submit(page);
  await fillCompanion(page);
  await submit(page);
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

  test('320px en — 두 줄 저장 버튼이어도 초점이 간 마지막 강도 선택지가 두 고정 바에 가려지지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await loginDemo(page, '/onboarding');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await goToLastStep(page);

    // 'Save and set conditions' 는 320px en 에서 두 줄이라 바가 77px 이 아니라 ≈99px 이다
    const bar = page.locator('.onboarding-actions');
    const saveButton = bar.getByRole('button', { name: 'Save and set conditions' });
    const barBox = await bar.boundingBox();
    expect(barBox.height).toBeGreaterThan(60);

    // 키보드로 마지막 강도(NORMAL)에 초점을 옮긴다 — 실제로 화면에 뜨고 저장 버튼을 가리지 않는다
    const normalInput = page.locator('#ob-pace-NORMAL');
    await normalInput.focus();
    await expect(normalInput).toBeFocused();
    const label = page.locator('label[for="ob-pace-NORMAL"]');
    await expect(label).toBeInViewport();

    // 실제 회귀 지점: scroll-padding-bottom 이 지금 실제로 뜬 두 고정 바(이 바 + 긴급 바)의 합친 높이를
    // 덮어야 한다. main.page 의 기본 하단 여백(--nav-offset + 152px ≈ 221px)이 넉넉해 이 화면의 최종
    // 스크롤 위치에서는 어떤 scroll-padding-bottom 값이든 이미 마지막 선택지가 가려지지 않는다 — 그래서
    // 키보드 초점만으로는 160px 이던 예전 값의 결함이 재현되지 않는다(실측으로도 확인했다). 의도한 결함은
    // "두 고정 바를 가릴 만큼 스크롤 여백이 좁다"이므로, 그 값 자체를 지금 뜬 바들의 실제 높이와 비교한다
    const emergencyBox = await page.locator('.ui-emergency-bar').boundingBox();
    const scrollPaddingBottom = parseFloat(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom),
    );
    expect(scrollPaddingBottom).toBeGreaterThanOrEqual(Math.round(barBox.height + emergencyBox.height));
  });
});

test.describe('③층 체류 설정 — 세로가 짧은 화면', () => {
  test('400×256 확대 화면 — 하단 바 고정이 풀리고 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await loginDemo(page, '/onboarding');
    expect((await styles(page.locator('.onboarding-actions'), ['position']))['position']).toBe('static');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(568);

    await page.goto('/');
    expect((await styles(page.locator('.onboarding-cta'), ['position']))['position']).toBe('static');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(568);
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

  test('입국·출국 묶음 사이 — 안쪽 마지막 선택지 여백이 밖으로 겹치지 않고 32px', async ({ page }) => {
    await loginDemo(page, '/onboarding');

    // fieldset 은 자기 블록 서식 문맥이라 안쪽 마지막 .onboarding-choice 의 16px 여백이 밖으로 합쳐지지 않는다.
    // 눈에 보이는 간격은 입국 묶음의 '마지막 라디오 칸(도착 공항 두 번째 선택지)' 아래 끝부터
    // 출국 묶음의 legend 위 끝까지다 — fieldset 박스 테두리끼리의 간격(32px, 위 테스트)과는 다른 지점이다
    const lastArrivalOption = page.locator('label[for="ob-arrival-airport-GMP"]');
    const departureLegend = page.locator('fieldset.onboarding-card').nth(1).locator('.onboarding-group-title');
    expect(gapBetween(await lastArrivalOption.boundingBox(), await departureLegend.boundingBox())).toBe(32);
  });
});

test.describe('③층 체류 설정 — 저장 버튼 곁 이유', () => {
  test('보기 전용 — 5단계에서 이유가 저장 버튼 곁(하단 바 안)에 보인다', async ({ page }) => {
    // 브리프는 "로그인하지 않고" 5단계까지 채워 가는 흐름을 요구하지만, 숙소·병원 주소 검색
    // (app/api/address/search/route.js 의 withSession)이 세션을 요구한다 — 로그인 없이는
    // 401 이라 결과가 없고 fillLodging/fillHospital 이 끝없이 기다린다(주소 없이는 lodgings/hospitals
    // 필수 검증도 통과하지 못해 2·3단계를 벗어날 수 없다). "주소 검색은 로그인 없이도 데모 결과가
    // 나온다"는 브리프의 전제가 이 코드베이스와 맞지 않아, 로그인 없는 시나리오는 infeasible 이다.
    // 같은 보기 전용 코드 경로(useStoreStatus → shouldShowReadOnly → status.readOnly)를 OFFLINE
    // 사유로 5단계에서 재현해 검증한다 — 로그인 상태로 주소 검색까지 마친 뒤 오프라인으로 전환한다.
    // shouldShowReadOnly() 는 reason === OFFLINE 이면 sessionChecked 와 무관하게 true 이므로
    // (components/ui/useStoreStatus.js), 화면이 그리는 조건·배치는 로그인 없음(NO_SESSION)일 때와 같다.
    await loginDemo(page, '/onboarding');
    await goToLastStep(page);
    await page.context().setOffline(true);

    // #ob-readonly 는 이제 .onboarding-actions 안에 있고, 뷰포트 안에서 저장 버튼보다 위에 보인다
    const readonly = page.locator('.onboarding-actions #ob-readonly');
    await expect(readonly).toHaveCount(1);
    await expect(readonly).toBeInViewport();

    const saveButton = page.locator('.onboarding-actions button[type="submit"]');
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute('aria-describedby', 'ob-readonly');

    const readonlyBox = await readonly.boundingBox();
    const saveBox = await saveButton.boundingBox();
    expect(Math.round(readonlyBox.y + readonlyBox.height)).toBeLessThanOrEqual(Math.round(saveBox.y));
  });

  test('저장 실패 — 이유가 아이콘과 함께 저장 버튼 곁(하단 바 안)에 보인다', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await goToLastStep(page);
    await page.check('#ob-pace'); // 이동 강도(필수) — 느긋하게

    // 기기 저장을 강제로 실패시킨다(환경 결함 주입 — draft.js·검증·저장 로직은 그대로 둔다).
    // .stay 레코드 쓰기만 막아 store.writeStay() 가 STORE_ERROR.STORAGE_FAILED 를 돌려주게 한다
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (key.endsWith('.stay')) throw new Error('e2e-forced-storage-failure');
        return original.call(this, key, value);
      };
    });

    await submit(page);

    const error = page.locator('.onboarding-actions .onboarding-save-error');
    await expect(error).toBeVisible();
    await expect(error).toBeInViewport();
    await expect(error.locator('svg')).toHaveCount(1);
    expect((await error.locator('svg').boundingBox()).width).toBe(20);

    const saveButton = page.locator('.onboarding-actions button[type="submit"]');
    const errorBox = await error.boundingBox();
    const saveBox = await saveButton.boundingBox();
    expect(Math.round(errorBox.y + errorBox.height)).toBeLessThanOrEqual(Math.round(saveBox.y));
  });

  test('저장 실패 뒤 1단계로 돌아가도 "다음"이 바 전체 폭 — 문장은 <p> 라 버튼 수만 센다', async ({ page }) => {
    // saveState 는 goTo() 로 리셋되지 않는다(바꾸지 않는 기존 동작) — 저장 실패 문장이 1단계까지도 바 안에
    // 남는다. .onboarding-actions > .btn:only-child 였다면 <p> 형제가 생긴 순간 더 이상 "버튼 하나뿐"이
    // 아니게 되어 '다음'이 3fr 칸(≈30%)으로 줄어드는 회귀가 있었다 — :only-of-type 으로 고쳤다(버튼 수만 센다)
    await loginDemo(page, '/onboarding');
    await goToLastStep(page);
    await page.check('#ob-pace');

    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (key.endsWith('.stay')) throw new Error('e2e-forced-storage-failure');
        return original.call(this, key, value);
      };
    });

    await submit(page);
    const bar = page.locator('.onboarding-actions');
    await expect(bar.locator('.onboarding-save-error')).toBeVisible();

    // 5단계(마지막, index 4)에서 1단계(index 0)까지 '이전'을 네 번 눌러 되돌아간다
    for (let i = 0; i < 4; i += 1) {
      await bar.getByRole('button', { name: '이전' }).click();
    }

    // 저장 실패 문장은 그대로 바 안에 남는다(기존 동작 — 이 수정에서 바꾸지 않는다)
    await expect(bar.locator('.onboarding-save-error')).toBeVisible();
    await expect(bar.getByRole('button', { name: '이전' })).toHaveCount(0);

    const barBox = await bar.boundingBox();
    const next = bar.getByRole('button', { name: '다음' });
    expect(Math.round((await next.boundingBox()).width)).toBe(Math.round(barBox.width - 32));
  });
});

test.describe('③층 체류 설정 — 오류 표시', () => {
  test('입력칸은 2px 긴급 빨강, 라디오는 선택지 칸 테두리, 문장은 빨강 + 경고 아이콘', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await submit(page);
    await expect(page.locator('.onboarding-summary')).toBeVisible();

    // 입력칸 = 공통 오류 규칙(설계서 5.2): 긴급 빨강 1px + 안쪽 1px
    // border-color·box-shadow 는 --duration-fast(150ms) 전환이 걸려 있어(globals.css) submit 직후
    // aria-invalid 가 막 붙은 값이 아직 안 옮았을 수 있다 — design-board-components.spec.js 와 같이 poll 로 기다린다
    await expect
      .poll(() => styles(page.locator('#ob-arrival-date'), ['border-top-color', 'box-shadow']))
      .toEqual({
        'border-top-color': 'rgb(200, 16, 46)',
        'box-shadow': 'rgb(200, 16, 46) 0px 0px 0px 1px inset',
      });
    // 라디오 점에는 네모 그림자가 없고, 선택지 칸 테두리가 빨갛다
    expect((await styles(page.locator('#ob-arrival-airport'), ['box-shadow']))['box-shadow']).toBe('none');
    expect((await styles(page.locator('label[for="ob-arrival-airport"]'), ['border-top-color']))['border-top-color']).toBe(
      'rgb(200, 16, 46)',
    );

    // 오류 문장 = 왼쪽 띠 없이 16px 굵은 긴급 빨강 + 20px 경고 아이콘
    const error = page.locator('#ob-arrival-date-error');
    expect((await styles(error, ['border-left-width']))['border-left-width']).toBe('0px');
    const line = error.locator('p').first();
    expect(await styles(line, ['color', 'font-size', 'font-weight'])).toEqual({
      color: 'rgb(200, 16, 46)',
      'font-size': '16px',
      'font-weight': '700',
    });
    expect((await line.locator('svg').boundingBox()).width).toBe(20);
  });

  test('오류 요약 — 안내 상자 모양, 제목 16px 굵게 + 경고 아이콘, 항목 이름은 먹색', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await submit(page);

    const summary = page.locator('.onboarding-summary');
    await expect(summary).toBeFocused();
    expect(
      await styles(summary, ['border-top-left-radius', 'padding-top', 'border-top-width', 'background-color']),
    ).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'border-top-width': '1px',
      'background-color': 'rgb(255, 233, 240)',
    });
    const title = summary.locator('.onboarding-summary-title');
    expect(await styles(title, ['font-size', 'font-weight', 'color'])).toEqual({
      'font-size': '16px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect((await title.locator('svg').boundingBox()).width).toBe(20);
    expect((await styles(summary.locator('a strong').first(), ['color'])).color).toBe('rgb(26, 28, 32)');
  });
});
