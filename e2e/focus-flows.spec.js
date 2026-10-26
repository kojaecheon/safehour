// 초점·스크롤·하단 바 여백 흐름 (SEED ③층 마지막 일괄 점검, Task 2)
//
// 화면 하나의 배치가 아니라 '흐름 뒤에 남는 것'을 본다.
//   - 프로그램이 초점을 옮긴 제목의 링은 키보드 초점에만 있다(마우스로 진행하면 링이 없다)
//   - 확인 대화상자가 닫힌 뒤 초점은 body 로 떨어지지 않는다
//   - '새 링크 만들기'가 동의 제목을 고정 상단 바 밑에 가리지 않는다
//   - 체류 설정 하단 바에 보기 전용 문장이 들어가도 마지막 입력칸이 바에 가리지 않는다

import { test, expect } from './fixtures.js';
import { linkDemoPlan, startTrip } from './helpers.js';

const outlineStyleOf = (locator) => () => locator.evaluate((el) => getComputedStyle(el).outlineStyle);

/** 두 프레임을 기다린다: 닫힘·언마운트 효과와 requestAnimationFrame 으로 미룬 초점·스크롤이 끝난 뒤를 본다 */
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** 지금 초점이 가 있는 요소 (body 이거나 main 밖이면 insideMain 이 false) */
const activeOf = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName ?? null,
      id: el?.id ?? '',
      insideMain: Boolean(el?.closest('main')),
    };
  });

/** 대화상자 확인 뒤 초점이 body 로 떨어지지 않고 main 안, 기대한 요소에 있다 */
async function expectFocusLandsOn(page, target, where) {
  await settle(page);
  const active = await activeOf(page);
  expect(active.tag, `${where}: 초점이 body 로 떨어졌다`).not.toBe('BODY');
  expect(active.insideMain, `${where}: 초점이 main 밖이다 (${active.tag}#${active.id})`).toBe(true);
  await expect(target, `${where}: 초점이 기대한 요소에 있어야 한다`).toBeFocused();
}

test.describe('프로그램 초점 제목의 링', () => {
  test('조건 화면 프로그램 초점 제목은 마우스 흐름에서 링이 없다', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const add = page.getByRole('button', { name: '본인 체크 기간 추가' });
    const editorHeading = page.locator('#conditions-editor-heading');
    const periodsHeading = page.locator('#conditions-periods-heading');

    // 마우스: 기간 추가 → 편집 제목으로 프로그램 초점
    await add.click();
    await expect(editorHeading).toBeFocused();
    expect(await editorHeading.evaluate((el) => el.matches(':focus-visible')), '마우스로 진행했으면 :focus-visible 이 아니다').toBe(false);
    await expect.poll(outlineStyleOf(editorHeading)).toBe('none');

    // 마우스: 취소 → 조건 기간 제목으로 프로그램 초점
    await page.locator('.conditions-editor-actions').getByRole('button', { name: '취소' }).click();
    await expect(periodsHeading).toBeFocused();
    expect(await periodsHeading.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    await expect.poll(outlineStyleOf(periodsHeading)).toBe('none');

    // 키보드: 같은 흐름이면 링이 있다(키보드 사용자의 위치 표시를 지우지 않는다)
    await add.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(add).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editorHeading).toBeFocused();
    expect(await editorHeading.evaluate((el) => el.matches(':focus-visible')), '키보드로 진행했으면 :focus-visible 이다').toBe(true);
    await expect.poll(outlineStyleOf(editorHeading)).toBe('solid');
  });
});

test.describe('확인 대화상자 뒤 초점', () => {
  test('연결 해제 확인 뒤 초점은 body 가 아니다 (조건 화면 기간 삭제도 같다)', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await linkDemoPlan(page, 'B');
    const disconnect = page.getByRole('button', { name: '연결 해제' });
    await expect(disconnect).toHaveCount(2);

    // 지침이 둘 남은 채 하나를 해제하면 목록이 남는다: 초점은 목록 제목으로
    await disconnect.first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: '해제하기' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(disconnect).toHaveCount(1);
    await expectFocusLandsOn(page, page.locator('#link-list-heading'), '연결 해제(목록이 남음)');

    // 마지막 지침을 해제하면 목록 제목도 사라진다: 초점은 코드 입력칸으로
    await disconnect.click();
    await page.getByRole('alertdialog').getByRole('button', { name: '해제하기' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '연결된 지침' })).toHaveCount(0);
    await expectFocusLandsOn(page, page.getByLabel('연결 코드'), '연결 해제(목록이 비워짐)');

    // 조건 화면: 기간 삭제 확인 뒤에는 조건 기간 제목으로 (마지막 기간이라 목록은 비지만 제목은 남는다)
    await page.goto('/conditions');
    const row = page.locator('.conditions-period').first();
    await row.getByRole('button', { name: '삭제', exact: true }).click();
    await page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' }).getByRole('button', { name: '삭제하기' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('기간을 삭제했어요.')).toBeVisible();
    await expectFocusLandsOn(page, page.locator('#conditions-periods-heading'), '기간 삭제');
  });
});

test.describe('보호자 링크 만들기 뒤 스크롤', () => {
  test('새 링크 만들기 뒤 동의 제목이 고정 상단 바 밑에 가리지 않는다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await page.getByLabel('위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)').check();
    await page.getByLabel('PIN (숫자 6자리)').fill('246810');
    await page.getByLabel('PIN 확인 (한 번 더)').fill('246810');
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const newLink = page.getByRole('button', { name: '새 링크 만들기' });
    await expect(newLink).toBeVisible();
    await newLink.click();

    // 스크롤과 초점은 다음 프레임에 일어난다
    const heading = page.locator('#guardian-consent-title');
    await expect(heading).toBeFocused();
    await settle(page);

    const topBar = await page.locator('.top-bar').boundingBox();
    const box = await heading.boundingBox();
    const viewportHeight = page.viewportSize().height;
    expect(box.y, `동의 제목이 상단 바(아래 끝 ${topBar.y + topBar.height}) 밑에 가렸다`).toBeGreaterThanOrEqual(topBar.y + topBar.height);
    expect(box.y, '동의 제목이 화면 안에 있어야 한다').toBeLessThan(viewportHeight);
  });
});

test.describe('체류 설정 하단 바 여백', () => {
  test('체류 설정 하단 바에 보기 전용 문장이 들어가도 마지막 입력칸이 가리지 않는다(320px ja)', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: '日本語', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await startTrip(page);

    // 서버 세션이 사라지면 보기 전용이다. 체류 수정 화면(?edit=1)을 보기 전용으로 열고 마지막 단계까지 간다
    await context.clearCookies();
    await page.goto('/onboarding?edit=1');
    const submit = page.locator('.onboarding-actions button[type="submit"]');
    for (let i = 0; i < 4; i += 1) {
      await expect(submit).toBeEnabled();
      await submit.click();
    }
    const readonly = page.locator('.onboarding-actions > .onboarding-readonly');
    await expect(readonly).toBeVisible();
    await expect(submit).toBeDisabled();

    // 문장이 들어가 바가 77~99px 보다 커졌다(ja 320px 에서 문장 3줄)
    const bar = page.locator('.onboarding-actions');
    expect((await bar.boundingBox()).height).toBeGreaterThan(130);

    // 끝까지 내리면 마지막 입력칸(마지막 강도 선택지)이 바에 가리지 않는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastField = page.locator('.onboarding-step input').last().locator('xpath=ancestor::label[1]');
    const field = await lastField.boundingBox();
    const barBox = await bar.boundingBox();
    expect(field.y + field.height, `마지막 입력칸(아래 끝 ${field.y + field.height})이 바(위 끝 ${barBox.y})에 가렸다`).toBeLessThanOrEqual(barBox.y);

    // 키보드 초점이 간 칸도 바에 가리지 않게 scroll-padding 이 바와 긴급 바를 덮는다(전역 규칙을 이긴 계산 값)
    const emergency = await page.locator('.ui-emergency-bar').boundingBox();
    const scrollPaddingBottom = parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom));
    expect(scrollPaddingBottom).toBeGreaterThanOrEqual(Math.round(barBox.height + emergency.height));
  });
});
