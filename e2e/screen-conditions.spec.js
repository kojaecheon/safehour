// ③층 조건(/conditions): SEED 화면 배치 (설계서 6.1, 6.2 4번)
//
// 회색 바탕 위 흰 블록: 안내·동의 상태 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 동의 있음, 체류 전체를 덮는 본인 체크 기간 하나).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32), --layer-basement rgb(243, 244, 245),
// --emergency rgb(200, 16, 46), --state-together-ink rgb(17, 105, 58), --line-strong rgb(220, 222, 227),
// --accent rgb(10, 92, 255).

import { test, expect } from './fixtures.js';
import { gapBetween, readRecord, selfItems, startTrip, styles } from './helpers.js';

// 버튼 면 색은 150ms 전환 중에 읽으면 중간값이 나오므로 목표 색에 닿을 때까지 기다린다
const backgroundOf = (locator) => async () => (await styles(locator, ['background-color']))['background-color'];

test.describe('③층 조건 화면, 회색 바탕과 블록', () => {
  test('상단 바 바로 아래부터 흰 블록을 8px 틈으로 쌓고, 화면 끝 여백은 내비 위 56px 안팎', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const main = page.locator('main.conditions-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');

    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(5);
    expect((await styles(blocks.first(), ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);

    // 화면 끝까지 내리면 마지막 블록과 하단 내비 사이가 화면 끝 56px 안팎이다(회색 화면의 마지막 블록 아래 틈 0, 하단 내비 윗선 포함)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gap = gapBetween(await blocks.last().boundingBox(), await page.locator('.ui-bottom-nav').boundingBox());
    expect(gap).toBeGreaterThanOrEqual(56);
    expect(gap).toBeLessThanOrEqual(57);
  });

  test('동의 상태는 초록 안내 상자(먹색 글자, 초록 체크 20px, 모서리 10), 체류 정보 고치기는 화살표 행', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const status = page.locator('.conditions-consent-status');
    expect(await styles(status, ['border-top-left-radius', 'padding-top', 'color'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      color: 'rgb(26, 28, 32)',
    });
    const check = status.locator('svg');
    expect((await check.boundingBox()).width).toBe(20);
    expect((await styles(check, ['color'])).color).toBe('rgb(17, 105, 58)');

    const edit = page.getByRole('link', { name: '체류 정보 고치기' });
    await expect(edit).toHaveClass(/ui-list-item/);
    await expect(edit).toHaveAttribute('href', '/onboarding');
  });

  test('날짜별 적용 조건: 흰 블록 안 판정 상자(점선, 회색 면, 모서리 10), 분류 배지 모서리 6, 출처 표시 그대로', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const section = page.locator('section.ui-block', { has: page.getByRole('heading', { name: '날짜별 적용 조건' }) });
    expect((await styles(section, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');

    const day = section.locator('.conditions-day');
    expect(
      await styles(day, ['border-top-style', 'border-top-left-radius', 'padding-top', 'background-color']),
    ).toEqual({
      'border-top-style': 'dotted',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(243, 244, 245)',
    });
    expect(
      (await styles(day.locator('.conditions-coverage').first(), ['border-top-left-radius']))['border-top-left-radius'],
    ).toBe('6px');
    await expect(day.locator('.ui-source-tag').first()).toBeVisible();
    expect((await readRecord(page, 'stay')).periods).toHaveLength(1);
  });

  test('날짜별 판정 상자 안의 복약 시각 미입력 안내는 흰 면: 같은 회색이면 상자 모양이 사라진다', async ({ page }) => {
    // 복약 답이 '모르겠음'이면 합성 결과에 MEDICATION_TIMES_MISSING 경고가 붙는다
    await startTrip(page, { items: selfItems({ medication: { kind: 'UNKNOWN' } }) }, { path: '/conditions' });
    const day = page.locator('.conditions-day');
    const callout = day.locator('.conditions-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('복약 시각 미입력');
    expect((await styles(callout, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    expect((await styles(day, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });
});

test.describe('③층 조건 화면, 조건 기간 목록', () => {
  test('기간은 카드 테두리 없는 목록 행, 출처 표시는 그대로, 병원 지침 연결은 화살표 목록 행', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const row = page.locator('.conditions-period').first();
    expect(await styles(row, ['border-left-width', 'border-top-left-radius', 'background-color'])).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    await expect(row.locator('.ui-source-tag-self')).toHaveCount(1);
    // 출처를 가르는 모양은 이제 출처 표시의 테두리 하나다: 본인 체크는 파선
    const selfTag = row.locator('.ui-source-tag-self');
    await expect(selfTag).toContainText('본인 체크');
    expect((await styles(selfTag, ['border-top-style']))['border-top-style']).toBe('dashed');

    // 채운 코발트 버튼은 '본인 체크 기간 추가' 하나, 병원 지침 연결은 목록 행 링크
    const add = page.getByRole('button', { name: '본인 체크 기간 추가' });
    await expect.poll(backgroundOf(add)).toBe('rgb(10, 92, 255)');
    const link = page.getByRole('link', { name: '병원 지침 연결' });
    await expect(link).toHaveClass(/ui-list-item/);
    await expect(link).toHaveAttribute('href', '/link');
  });

  test('기간 삭제는 확인 대화상자(빨간 확인): 취소하면 남고, 삭제하기면 지운다', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const trigger = page.locator('.conditions-period').first().getByRole('button', { name: '삭제', exact: true });
    const rowRange = (await page.locator('.conditions-period').first().locator('h3').innerText()).trim();
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' });
    await expect(dialog).toBeVisible();
    // 어느 기간을 지우는지 대화상자 안에서도 보인다(행 제목과 같은 날짜 범위 문구)
    expect(rowRange.length).toBeGreaterThan(0);
    await expect(dialog).toContainText(rowRange);
    await expect.poll(backgroundOf(dialog.getByRole('button', { name: '삭제하기' }))).toBe('rgb(200, 16, 46)');

    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await readRecord(page, 'stay')).periods).toHaveLength(1);

    await trigger.click();
    await page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' }).getByRole('button', { name: '삭제하기' }).click();
    await expect(page.getByText('기간을 삭제했어요.')).toBeVisible();
    expect((await readRecord(page, 'stay')).periods).toEqual([]);
  });

  test('병원 연결 화면과 조건 화면의 병원 지침은 모두 목록 행, 출처는 출처 표시가 알린다', async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.goto('/link');
    await page.getByRole('button', { name: '예시 A — 외출 가능' }).click();
    await page.getByRole('radio', { name: /데모 성형외과 E2E/ }).check();
    await page.getByRole('button', { name: '이 병원으로 연결' }).click();
    await expect(page.getByRole('heading', { name: '연결했어요' })).toBeVisible();

    // /link 의 연결된 지침도 카드 없는 목록 행이고, 출처는 출처 표시가 알린다(③층 14번)
    await page.goto('/link');
    const linkRow = page.locator('.conditions-period-list.is-rows > .conditions-period').first();
    expect((await styles(linkRow, ['border-left-width']))['border-left-width']).toBe('0px');
    await expect(linkRow.locator('.ui-source-tag-hospital')).toHaveCount(1);

    // 같은 기간이 조건 화면에서도 목록 행이다
    await page.goto('/conditions');
    const row = page.locator('.conditions-period-HOSPITAL').first();
    expect((await styles(row, ['border-left-width']))['border-left-width']).toBe('0px');
    await expect(row.locator('.ui-source-tag-hospital')).toHaveCount(1);
    // 병원 발행은 실선 테두리(본인 체크의 파선과 모양으로 갈린다)
    const hospitalTag = row.locator('.ui-source-tag-hospital');
    await expect(hospitalTag).toContainText('병원 발행');
    expect((await styles(hospitalTag, ['border-top-style']))['border-top-style']).toBe('solid');
  });
});

test.describe('③층 조건 화면, 동의와 동의 철회', () => {
  test('동의 전: 동의 패널이 흰 블록과 한 면(카드 테두리 없음), 거부 안내 상자는 왼쪽 띠 없는 회색 면', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: '/conditions' });
    const panel = page.locator('.conditions-consent');
    expect(await styles(panel, ['border-top-width', 'box-shadow', 'padding-left'])).toEqual({
      'border-top-width': '0px',
      'box-shadow': 'none',
      'padding-left': '0px',
    });

    await page.getByRole('button', { name: '동의하지 않습니다' }).click();
    const callout = page.locator('.conditions-callout').first();
    expect(
      await styles(callout, ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top']),
    ).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'background-color': 'rgb(243, 244, 245)',
      'padding-top': '14px',
    });

    // 병원 연결 화면(/link)의 동의 패널도 카드 테두리 없이 흰 바탕과 한 면이다(③층 14번)
    await page.goto('/link');
    expect((await styles(page.locator('.conditions-consent'), ['border-top-width']))['border-top-width']).toBe('0px');
  });

  test('동의 철회: 회색 버튼 → 확인 대화상자(초점 가둠, Escape, 초점 복귀, 취소) → 철회하기(빨간 확인)', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const trigger = page.getByRole('button', { name: '동의 철회', exact: true });
    await expect.poll(backgroundOf(trigger)).toBe('rgb(243, 244, 245)');

    // 열면 초점이 대화상자 안으로 가고, Tab 을 눌러도 밖으로 나가지 않는다
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: '민감정보 동의 철회' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // Escape 로 닫히고 초점은 '동의 철회' 버튼으로 돌아온다
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // 취소는 아무것도 지우지 않는다
    await trigger.click();
    await page.getByRole('alertdialog', { name: '민감정보 동의 철회' }).getByRole('button', { name: '취소' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect((await readRecord(page, 'stay')).consent.sensitive).not.toBeNull();

    // 철회하기(빨간 확인)를 누르면 동의가 지워지고 동의 패널이 다시 나온다
    await trigger.click();
    const confirm = page.getByRole('alertdialog', { name: '민감정보 동의 철회' }).getByRole('button', { name: '철회하기' });
    await expect.poll(backgroundOf(confirm)).toBe('rgb(200, 16, 46)');
    await confirm.click();
    await expect(page.getByRole('heading', { name: '민감정보 처리 동의' })).toBeVisible();
    expect((await readRecord(page, 'stay')).consent.sensitive).toBeNull();
  });

  test('동의 철회 뒤: 완료 문구가 동의 제목 바로 위 알림 자리에 공용 안내 상자(앞 체크 아이콘)로 보이고, 다시 동의하면 사라진다', async ({ page }) => {
    const DONE = '동의를 철회했어요. 본인 체크 기간과 병원 지침 사본을 지웠어요.';
    await startTrip(page, {}, { path: '/conditions' });
    await page.getByRole('button', { name: '동의 철회', exact: true }).click();
    await page.getByRole('alertdialog', { name: '민감정보 동의 철회' }).getByRole('button', { name: '철회하기' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    const heading = page.getByRole('heading', { name: '민감정보 처리 동의' });
    await expect(heading).toBeVisible();
    // 철회 블록은 통째로 사라진다
    await expect(page.getByRole('button', { name: '동의 철회', exact: true })).toHaveCount(0);

    // 완료 문구는 맨 위 흰 블록(동의 요청 블록)의 알림 자리(role=status)에 보인다. 초점이 가는 동의 제목 바로 위라
    // 철회한 그 화면에서 함께 보인다(긴 동의 문구 아래로 밀려 화면 밖에 있지 않다)
    const firstBlock = page.locator('main.conditions-page > .ui-block').first();
    const status = firstBlock.getByRole('status').filter({ hasText: DONE });
    await expect(status).toHaveText(DONE);
    await expect(status).toBeVisible();
    await expect(status).toBeInViewport();
    const statusBox = await status.boundingBox();
    expect(Math.round(statusBox.y + statusBox.height), '완료 문구는 동의 제목 위').toBeLessThanOrEqual(
      Math.round((await heading.boundingBox()).y),
    );

    // 모양: 공용 안내 상자(회색 면, 모서리 10, 안쪽 14/16, 먹색 보통 글자) + 앞 20px 아이콘 칸
    const callout = status.locator('.ui-callout');
    await expect(callout).toHaveClass(/(^|\s)has-icon(\s|$)/);
    expect(
      await styles(callout, ['background-color', 'border-top-left-radius', 'padding-top', 'padding-left', 'color', 'font-weight']),
    ).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'padding-left': '16px',
      color: 'rgb(26, 28, 32)',
      'font-weight': '400',
    });
    expect((await callout.locator(':scope > .ui-callout-icon svg').boundingBox()).width).toBe(20);

    // 다시 동의하면 완료 문구는 사라지고 동의 상태 안내만 남는다
    await page.getByRole('button', { name: '동의합니다' }).click();
    await expect(page.locator('.conditions-consent-status')).toBeVisible();
    await expect(page.getByText(DONE)).toHaveCount(0);
  });
});

test.describe('③층 조건 화면, 편집기', () => {
  test('[취소 3][저장 7] 하단 고정 바가 하단 내비 바로 위에 선다', async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();

    const bar = page.locator('.conditions-editor-actions');
    expect(await styles(bar, ['position', 'background-color', 'border-top-width', 'border-top-color'])).toEqual({
      position: 'fixed',
      'background-color': 'rgb(255, 255, 255)',
      'border-top-width': '1px',
      'border-top-color': 'rgb(220, 222, 227)',
    });
    // 바 bottom = --nav-offset(내비 윗선 1px 포함)이라 바와 내비 사이 틈이 0이다
    expect(
      Math.abs(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())),
    ).toBeLessThanOrEqual(0);

    const cancel = await bar.getByRole('button', { name: '취소' }).boundingBox();
    const save = await bar.getByRole('button', { name: '저장', exact: true }).boundingBox();
    expect(cancel.width / (cancel.width + save.width)).toBeCloseTo(0.3, 2);
    expect(Math.round(save.height)).toBe(52);
  });

  test('360px 일본어: 취소 칸은 글자 길이만큼 자라 キャンセル 이 한 줄(52px)에 들어간다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.getByRole('button', { name: '日本語', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '本人チェックの期間を追加' }).click();

    const bar = page.locator('.conditions-editor-actions');
    const cancel = bar.getByRole('button', { name: 'キャンセル' });
    await expect(cancel).toBeVisible();
    expect(Math.round((await cancel.boundingBox()).height)).toBe(52);
    const save = bar.getByRole('button', { name: '保存する', exact: true });
    expect(Math.round((await save.boundingBox()).height)).toBe(52);
  });

  test('오류: 문장은 경고 아이콘 + 빨강, 요약은 1px 빨간 테두리 안내 상자, 따라오는 입력은 회색 선으로 묶는다', async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();

    const summary = page.locator('.conditions-error-summary');
    await expect(summary).toBeVisible();
    expect(
      await styles(summary, ['border-left-width', 'border-top-left-radius', 'border-top-color', 'padding-top']),
    ).toEqual({
      'border-left-width': '1px',
      'border-top-left-radius': '10px',
      'border-top-color': 'rgb(200, 16, 46)',
      'padding-top': '14px',
    });
    expect((await summary.locator('.conditions-error-summary-title svg').boundingBox()).width).toBe(20);

    const error = page.locator('.conditions-field-error').first();
    expect(await styles(error, ['color', 'font-size', 'font-weight'])).toEqual({
      color: 'rgb(200, 16, 46)',
      'font-size': '16px',
      'font-weight': '700',
    });
    expect((await error.locator('svg').boundingBox()).width).toBe(20);

    // '예'를 고르면 따라오는 입력 묶음의 왼쪽 선은 회색(코발트 아님)
    await page
      .getByRole('group', { name: '걷는 시간 제한이 있나요?' })
      .getByRole('radio', { name: '예', exact: true })
      .check();
    expect(
      (await styles(page.locator('.conditions-subfield').first(), ['border-left-color']))['border-left-color'],
    ).toBe('rgb(220, 222, 227)');
  });

  test('저장 실패: 이유가 경고 아이콘과 함께 저장 버튼 곁(하단 바 안 맨 앞)에 보이고, 바가 커진 만큼 화면 끝을 더 비운다', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    await page.getByRole('button', { name: '고치기' }).first().click();
    await expect(page.locator('#conditions-editor-heading')).toBeVisible();
    const main = page.locator('main.conditions-page');
    const paddingOf = async () => parseFloat((await styles(main, ['padding-bottom']))['padding-bottom']);
    const before = await paddingOf();

    // 기기 저장을 강제로 실패시킨다(환경 결함 주입). .stay 레코드 쓰기만 막아 writePeriods() 가 STORAGE_FAILED 를 돌려주게 한다
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (key.endsWith('.stay')) throw new Error('e2e-forced-storage-failure');
        return original.call(this, key, value);
      };
    });
    const bar = page.locator('.conditions-editor-actions');
    const save = bar.getByRole('button', { name: '저장', exact: true });
    await save.click();

    // 편집기는 열린 채이고, 실패 문장은 바 안 맨 앞 <p> 다(맨 위 안내 자리에는 뜨지 않는다)
    const error = bar.locator(':scope > p');
    await expect(error).toHaveText('저장하지 못했어요. 다시 시도해 주세요.');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toBeVisible();
    await expect(error).toBeInViewport();
    await expect(page.locator('#conditions-editor-heading')).toBeVisible();
    await expect(page.locator('.conditions-notice')).toHaveText('');

    // 모양은 체류 설정의 저장 실패와 같다: 20px 경고 아이콘 + 16px 굵은 긴급 빨강, 버튼 줄 위
    expect(await styles(error, ['color', 'font-size', 'font-weight'])).toEqual({
      color: 'rgb(200, 16, 46)',
      'font-size': '16px',
      'font-weight': '700',
    });
    await expect(error.locator('svg')).toHaveCount(1);
    expect((await error.locator('svg').boundingBox()).width).toBe(20);
    const errorBox = await error.boundingBox();
    expect(Math.round(errorBox.y + errorBox.height)).toBeLessThanOrEqual(Math.round((await save.boundingBox()).y));

    // 바에 문장이 들어가면 공용 규칙이 문장 네 줄 몫(4 × 22px)을 더 비운다: 전역 :has(.sticky-return) 규칙을 이긴 계산 값
    await expect.poll(paddingOf).toBe(before + 88);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe('272px');
  });

  // 운영자 결정(2026-11-08): 외출·복귀 다음 항목은 묶음으로 접고, 묶음마다 '제한 없음' 버튼을 둔다.
  // 첫 기간을 저장하면 오늘 화면으로 가서 '첫 일정을 만들었어요'를 한 번 보인다
  test("묶음은 접혀 있고 '제한 없음'이 묶음을 '아니오'로 채운다. 첫 저장은 오늘 화면으로 간다", async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();

    // 외출·복귀는 늘 보이고 '모르겠음'이 없다
    await expect(page.getByRole('group', { name: '외출이 허용되나요?' })).toBeVisible();
    await expect(page.getByRole('group', { name: '외출이 허용되나요?' }).getByRole('radio', { name: '모르겠음' })).toHaveCount(0);
    const toggles = page.locator('.conditions-group-toggle');
    await expect(toggles).toHaveCount(5);
    for (const toggle of await toggles.all()) {
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    const noneButtons = page.locator('.conditions-group-none');
    await expect(noneButtons).toHaveCount(5);
    for (const button of await noneButtons.all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('group', { name: '자외선을 피해야 하나요?' })).toHaveCount(0);

    // '피해야 할 환경' 묶음: 제한 없음 → 3개 중 3개 답함, 펼치면 모두 '아니오'
    const exposure = page.locator('.conditions-group').filter({ has: page.locator('.conditions-group-toggle', { hasText: '피해야 할 환경' }) });
    await expect(exposure.locator('.conditions-group-count')).toHaveText('3개 중 0개 답함');
    await exposure.locator('.conditions-group-none').click();
    await expect(exposure.locator('.conditions-group-count')).toHaveText('3개 중 3개 답함');
    await exposure.locator('.conditions-group-toggle').click();
    await expect(exposure.locator('.conditions-group-toggle')).toHaveAttribute('aria-expanded', 'true');
    for (const q of ['자외선을 피해야 하나요?', '사우나·찜질 등 열을 피해야 하나요?', '수영·온천 등 물에 들어가면 안 되나요?']) {
      await expect(page.getByRole('group', { name: q }).getByRole('radio', { name: '아니오', exact: true })).toBeChecked();
    }
    // 외출·복귀를 고르지 않으면 묶음을 다 채워도 저장되지 않는다
    for (const button of await noneButtons.all()) await button.click();
    // 묶음 안에서 하나를 '모르겠음'으로 바꿀 수 있다(가장 엄격한 기본값 뜻 그대로)
    await page.getByRole('group', { name: '사우나·찜질 등 열을 피해야 하나요?' }).getByRole('radio', { name: '모르겠음', exact: true }).check();
    await expect(page.getByText('가장 엄격한 기본값을 적용해요').first()).toBeVisible();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    const summary = page.locator('.conditions-error-summary');
    await expect(summary).toBeVisible();
    await expect(summary.locator('li')).toHaveCount(2);

    await page.getByRole('group', { name: '외출이 허용되나요?' }).getByRole('radio', { name: '허용', exact: true }).check();
    await page
      .getByRole('group', { name: '몇 시까지 돌아와야 하는지 병원이 정했나요?' })
      .getByRole('radio', { name: '아니오', exact: true })
      .check();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator('.trip-notice, [role="status"]').filter({ hasText: '첫 일정을 만들었어요.' }).first()).toBeVisible();
    const period = (await readRecord(page, 'stay')).periods[0];
    expect(period.items.avoidHeat).toEqual({ kind: 'UNKNOWN' });
    expect(period.items.avoidUv).toEqual({ kind: 'NONE' });
    // 새로 고쳐도 다시 뜨지 않는다
    await page.reload();
    await expect(page.getByText('첫 일정을 만들었어요.')).toHaveCount(0);

    // 두 번째 기간은 지금처럼 조건 화면에 남는다
    await page.goto('/conditions');
    await page.getByRole('button', { name: '고치기' }).first().click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('기간을 저장했어요.')).toBeVisible();
    await expect(page).toHaveURL(/\/conditions$/);
  });

  test('편집 중에는 체류 정보 고치기 행이 없다: 고정 바 뒤에 와 Tab 순서가 거꾸로 가고, 누르면 입력이 사라진다', async ({ page }) => {
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await expect(page.getByRole('link', { name: '체류 정보 고치기' })).toHaveCount(1);
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await expect(page.locator('.conditions-editor-actions')).toBeVisible();
    await expect(page.getByRole('link', { name: '체류 정보 고치기' })).toHaveCount(0);
  });
});

test.describe('③층 병원 연결 화면, 연결 오류 상자', () => {
  test('코드를 비우고 연결하면 1px 빨간 테두리 안내 상자 + 제목 앞 20px 경고 아이콘', async ({ page }) => {
    await startTrip(page, {}, { path: '/link' });
    await page.getByRole('button', { name: '회복 지침 연결' }).click();

    const alert = page.locator('.conditions-alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('연결하지 못했습니다');
    await expect(alert).toContainText('연결 코드를 입력해 주세요.');
    expect(await styles(alert, ['border-left-width', 'border-top-width', 'border-top-color'])).toEqual({
      'border-left-width': '1px',
      'border-top-width': '1px',
      'border-top-color': 'rgb(200, 16, 46)',
    });
    expect((await alert.locator('.conditions-alert-title svg').boundingBox()).width).toBe(20);
  });
});
