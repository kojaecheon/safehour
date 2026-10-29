// 공용 부품으로 모은 것 (SEED ③층 마지막 일괄 점검, Task 3)
//
// 화면마다 복제돼 있던 모양을 공용 클래스 하나가 맡는지 본다.
//   - 안내 상자(SEED Callout, 설계서 5.6): .ui-callout. 회색 면(--surface-alt rgb(243, 244, 245)) · 모서리 10 · 안쪽 14/16
//   - 3:7 하단 바(설계서 6.1): .ui-bar-split
//   - 설정 언어 행의 눌림: 목록 행(ListItem, 설계서 5.5)과 같은 모양
//   - 답 칩(ja·zh) 글자: 낱말 경계에서만 줄을 바꾸고, 고른 칩의 체크 표시는 줄지 않는다
//   - 답 칩 체크 표시(모든 언어, 운영자 결정 2026-10-30): 16px 그대로, 글자와 한 줄에 들지 않으면 글자 위 줄
//   - 오류 요약(운영자 결정 2026-10-30): .ui-error-summary. 흰 면 · 1px 긴급 빨강(rgb(200, 16, 46)) 테두리 · 모서리 10 · 안쪽 14/16
// 기능 클래스(.settings-disclosure 등)는 마크업에 그대로 남는다. 다른 spec 의 로케이터가 쓴다.

import { test, expect } from './fixtures.js';
import { DEMO_PLAN_LABEL, loginDemo, startTrip, styles } from './helpers.js';

const CALLOUT_FACE = {
  'background-color': 'rgb(243, 244, 245)',
  'border-top-left-radius': '10px',
  'padding-top': '14px',
  'padding-left': '16px',
};

async function expectSharedCallout(callout, where) {
  await expect(callout, `${where}: 안내 상자가 보여야 한다`).toBeVisible();
  await expect(callout, `${where}: 공용 Callout 클래스`).toHaveClass(/(^|\s)ui-callout(\s|$)/);
  expect(await styles(callout, Object.keys(CALLOUT_FACE)), `${where}: Callout 면`).toEqual(CALLOUT_FACE);
}

test.describe('공용 부품', () => {
  test('안내 상자는 공용 Callout 하나', async ({ page }) => {
    // 로그인 안내(로그인 전 화면)
    await page.goto('/login');
    await expectSharedCallout(page.locator('main .medical-callout'), '로그인 안내');

    // 민감정보 동의 전 체류: 카드 화면의 식단 칸이 늘 '조건 입력 필요' 안내 상자다(시각과 무관)
    await startTrip(page, { consent: false }, { path: '/settings' });
    // 설정 알림 안내: 앞 20px 아이콘 칸
    const disclosure = page.locator('.settings-disclosure');
    await expectSharedCallout(disclosure, '설정 알림 안내');
    await expect(disclosure).toHaveClass(/(^|\s)has-icon(\s|$)/);
    await expect(disclosure.locator(':scope > .ui-callout-icon svg')).toHaveCount(1);

    // 긴급 안내: 아이콘 색만 긴급 빨강(기능 클래스에 남은 차이)
    await page.goto('/emergency');
    const lead = page.locator('.emergency-lead');
    await expectSharedCallout(lead, '긴급 안내');
    await expect(lead.locator(':scope > .ui-callout-icon svg')).toHaveCount(1);

    // 카드 안내(식단 조건 입력 필요)
    await page.goto('/cards');
    await expectSharedCallout(page.locator('#cards-diet .cards-note'), '카드 안내');

    // 두 상자의 면·모서리·안쪽이 같다(같은 규칙 하나가 맡는다)
    await page.goto('/settings');
    const settingsFace = await styles(page.locator('.settings-disclosure'), [...Object.keys(CALLOUT_FACE), 'padding-right', 'padding-bottom']);
    await page.goto('/emergency');
    const emergencyFace = await styles(page.locator('.emergency-lead'), [...Object.keys(CALLOUT_FACE), 'padding-right', 'padding-bottom']);
    expect(emergencyFace).toEqual(settingsFace);
  });

  test('오류 요약은 공용 상자 하나: 체류 설정·조건 편집기·병원 연결 오류가 흰 면 + 1px 긴급 빨강 테두리로 같다', async ({ page }) => {
    const ERROR_FACE = {
      'background-color': 'rgb(255, 255, 255)',
      'border-top-width': '1px',
      'border-top-style': 'solid',
      'border-top-color': 'rgb(200, 16, 46)',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'padding-left': '16px',
    };
    async function expectSharedSummary(box, where) {
      await expect(box, `${where}: 오류 요약이 보여야 한다`).toBeVisible();
      await expect(box, `${where}: 공용 오류 요약 클래스`).toHaveClass(/(^|\s)ui-error-summary(\s|$)/);
      expect(await styles(box, Object.keys(ERROR_FACE)), `${where}: 오류 요약 면`).toEqual(ERROR_FACE);
      // 제목 앞 20px 경고 아이콘만 긴급 빨강
      const icon = box.locator('.ui-error-summary-title svg');
      expect((await icon.boundingBox()).width, `${where}: 경고 아이콘 폭`).toBe(20);
      expect((await styles(icon, ['color'])).color, `${where}: 경고 아이콘 색`).toBe('rgb(200, 16, 46)');
    }

    // 체류 설정: 1단계를 비운 채 다음
    await loginDemo(page, '/onboarding');
    await page.locator('.onboarding-actions button[type="submit"]').click();
    await expectSharedSummary(page.locator('.onboarding-summary'), '체류 설정');

    // 조건 편집기: 비운 채 저장
    await startTrip(page, { periods: [] }, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expectSharedSummary(page.locator('.conditions-error-summary'), '조건 편집기');

    // 병원 연결: 코드를 비운 채 연결
    await page.goto('/link');
    await page.getByRole('button', { name: '회복 지침 연결' }).click();
    await expectSharedSummary(page.locator('.conditions-alert'), '병원 연결 오류');
  });

  test('3:7 하단 바는 공용 클래스', async ({ page }) => {
    const split = /(^|\s)ui-bar-split(\s|$)/;
    const columns = async (bar) => (await styles(bar, ['display', 'column-gap']));

    // 체류 설정(수정)
    await startTrip(page, {}, { path: '/onboarding?edit=1' });
    const onboarding = page.locator('.onboarding-actions');
    await expect(onboarding).toBeVisible();
    await expect(onboarding).toHaveClass(split);
    expect(await columns(onboarding)).toEqual({ display: 'grid', 'column-gap': '8px' });

    // 조건 편집기
    await page.goto('/conditions');
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    const editor = page.locator('.conditions-editor-actions');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveClass(split);
    expect(await columns(editor)).toEqual({ display: 'grid', 'column-gap': '8px' });

    // 병원 고르기
    await page.goto('/link');
    await page.getByRole('button', { name: DEMO_PLAN_LABEL.A }).click();
    await expect(page.getByRole('heading', { name: '어느 병원의 지침인가요?' })).toBeVisible();
    const link = page.locator('.link-bar');
    await expect(link).toHaveClass(split);
    expect(await columns(link)).toEqual({ display: 'grid', 'column-gap': '8px' });
  });

  test('320px ja·zh 답 칩: 고른 칩의 체크 표시는 16px, 중국어 不确定 은 한 줄', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    for (const [code, langName, addPeriod, unknown] of [
      ['ja', '日本語', '本人チェックの期間を追加', 'わからない'],
      ['zh', '中文', '添加本人填写的期间', '不确定'],
    ]) {
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await startTrip(page, {}, { path: '/conditions' });
      await page.getByRole('button', { name: addPeriod }).click();

      // 모르겠음 칩을 고르면 앞에 체크 표시가 나온다. 칩 안 글자에 밀려 줄지 않는다
      const radio = page.getByRole('radio', { name: unknown }).first();
      await radio.check();
      const chip = radio.locator('xpath=ancestor::label[1]');
      await expect(chip, `${code}: 고른 칩`).toHaveClass(/is-selected/);
      const mark = chip.locator('.ui-answer-mark');
      expect((await mark.boundingBox()).width, `${code}: 체크 표시 폭`).toBe(16);

      if (code === 'zh') {
        // 不确定 은 낱말 하나라 둘로 꺾이지 않는다: 글자 높이가 한 줄(줄 높이)이다
        const text = chip.locator('.ui-answer-text');
        const lineHeight = parseFloat((await styles(text, ['line-height']))['line-height']);
        const textBox = await text.boundingBox();
        expect(Math.round(textBox.height), `${code}: ${unknown} 은 한 줄이어야 한다`).toBe(lineHeight);
        // 글자가 알약 밖으로 나가지 않는다
        const chipBox = await chip.boundingBox();
        expect(textBox.x, `${code}: 글자 왼쪽 끝이 칩 안`).toBeGreaterThanOrEqual(chipBox.x);
        expect(textBox.x + textBox.width, `${code}: 글자 오른쪽 끝이 칩 안`).toBeLessThanOrEqual(chipBox.x + chipBox.width);
      }
    }
  });

  test('답 칩 체크 표시는 모든 언어에서 16px: 360px ko 모르겠음은 낱말이 꺾이지 않고, 320px en Allowed 는 체크가 글자 위 줄로 올라간다', async ({ page }) => {
    // 고른 칩의 체크·글자 상자가 칩 테두리 안에 있는지, 체크 폭이 16인지 본다
    async function measure(chip, where) {
      await expect(chip, `${where}: 고른 칩`).toHaveClass(/is-selected/);
      const mark = chip.locator('.ui-answer-mark');
      const text = chip.locator('.ui-answer-text');
      const [chipBox, markBox, textBox] = [await chip.boundingBox(), await mark.boundingBox(), await text.boundingBox()];
      expect(markBox.width, `${where}: 체크 표시 폭`).toBe(16);
      for (const [part, box] of [['체크', markBox], ['글자', textBox]]) {
        expect(box.x, `${where}: ${part} 왼쪽 끝이 칩 안`).toBeGreaterThanOrEqual(chipBox.x);
        expect(box.x + box.width, `${where}: ${part} 오른쪽 끝이 칩 안`).toBeLessThanOrEqual(chipBox.x + chipBox.width);
        expect(box.y, `${where}: ${part} 위 끝이 칩 안`).toBeGreaterThanOrEqual(chipBox.y);
        expect(box.y + box.height, `${where}: ${part} 아래 끝이 칩 안`).toBeLessThanOrEqual(chipBox.y + chipBox.height);
      }
      expect(await chip.evaluate((el) => el.scrollWidth <= el.clientWidth), `${where}: 칩 안에서 넘치지 않는다`).toBe(true);
      // 낱말 하나라 한 줄이다(한 글자가 홀로 다음 줄로 꺾이지 않는다)
      const lineHeight = parseFloat((await styles(text, ['line-height']))['line-height']);
      expect(Math.round(textBox.height), `${where}: 글자는 한 줄`).toBe(lineHeight);
      return { markBox, textBox };
    }

    // 360px ko: 칩 안쪽(66px)에 체크 16 + 사이 4 + '모르겠음'(55px)이 한 줄에 들지 않는다
    await page.setViewportSize({ width: 360, height: 780 });
    await startTrip(page, {}, { path: '/conditions' });
    await page.getByRole('button', { name: '본인 체크 기간 추가' }).click();
    const unknown = page.getByRole('radio', { name: '모르겠음', exact: true }).first();
    await unknown.check();
    await measure(unknown.locator('xpath=ancestor::label[1]'), '360 ko 모르겠음');

    // 320px en: 칩 안쪽(53px)에 'Allowed'(62px)만으로도 꽉 찬다. 체크는 글자 위 줄로 올라간다
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/conditions');
    await page.getByRole('button', { name: 'Add a self-check period' }).click();
    const allowed = page.getByRole('radio', { name: 'Allowed', exact: true }).first();
    await allowed.check();
    const { markBox, textBox } = await measure(allowed.locator('xpath=ancestor::label[1]'), '320 en Allowed');
    expect(markBox.y + markBox.height, '320 en Allowed: 체크는 글자 위 줄').toBeLessThanOrEqual(textBox.y);
  });

  test('설정 언어 행 눌림은 목록 행과 같다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const english = page.getByRole('radio', { name: 'English' });
    const row = page.locator('.settings-radio-rows .radio-option').filter({ has: english });
    // 원과 이름을 함께 담은 묶음 = 라디오의 부모
    const group = english.locator('xpath=..');
    await expect(group).toContainText('English');

    const pressed = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.backgroundColor = 'var(--pressed-transparent)';
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    const rowBox = await row.boundingBox();
    const viewport = page.viewportSize();
    await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
    await page.mouse.down();

    // 눌림 면: 행 자체가 아니라 ::before 면. 화면 끝에서 좌우 6px 안쪽, 모서리 10
    await expect
      .poll(() =>
        row.evaluate((el) => {
          const layer = getComputedStyle(el, '::before');
          return { layer: layer.backgroundColor, radius: layer.borderTopLeftRadius, row: getComputedStyle(el).backgroundColor };
        }),
      )
      .toEqual({ layer: pressed, radius: '10px', row: 'rgba(0, 0, 0, 0)' });
    const inset = await row.evaluate((el) => {
      const layer = getComputedStyle(el, '::before');
      return { left: parseFloat(layer.left), right: parseFloat(layer.right) };
    });
    expect(Math.round(rowBox.x + inset.left), '눌림 면 왼쪽 끝은 화면 끝에서 6px').toBe(6);
    expect(Math.round(viewport.width - (rowBox.x + rowBox.width) + inset.right), '눌림 면 오른쪽 끝은 화면 끝에서 6px').toBe(6);

    // 내용(원·이름 묶음)만 줄어든다. 행과 눌림 면은 그대로다
    await expect.poll(() => group.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
    expect(await row.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await page.mouse.up();
  });
});
