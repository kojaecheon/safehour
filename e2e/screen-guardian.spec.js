// ③층 보호자(/guardian, /g): SEED 화면 배치 (설계서 6.2 13번)
//
// 색은 getComputedStyle 의 rgb() 로 비교한다: --surface-alt rgb(243, 244, 245), --ink rgb(26, 28, 32),
// --emergency rgb(200, 16, 46), --state-standby-bg rgb(255, 244, 217), 흰 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { selfItems, startTrip } from './helpers.js';

const PIN = '246810';
const CONSENT = '위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

async function createLink(page) {
  await page.getByLabel(CONSENT).check();
  await page.getByLabel('PIN (숫자 6자리)').fill(PIN);
  await page.getByLabel('PIN 확인 (한 번 더)').fill(PIN);
  await page.getByRole('button', { name: '링크 만들기' }).click();
  return page.getByLabel('링크', { exact: true }).inputValue();
}

test.describe('③층 보호자 링크 만들기', () => {
  test('흰 바탕 한 장: 카드 없음, 담기는 것·담기지 않는 것은 서로 다른 앞 아이콘 목록, 두 안내는 띠 없는 회색 Callout', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    const main = page.locator('main.guardian-page');
    await expect(main).not.toHaveClass(/is-basement/);
    await expect(main.locator('.card')).toHaveCount(0);

    const inItems = main.locator('.guardian-list-in > li');
    const outItems = main.locator('.guardian-list-out > li');
    await expect(inItems).toHaveCount(5);
    await expect(outItems).toHaveCount(3);
    const inIcon = await inItems.first().locator('.guardian-list-icon svg').innerHTML();
    const outIcon = await outItems.first().locator('.guardian-list-icon svg').innerHTML();
    expect(inIcon).not.toBe(outIcon);
    expect(await styles(inItems.first(), ['list-style-type', 'font-size'])).toEqual({ 'list-style-type': 'none', 'font-size': '16px' });

    const notes = main.locator('section[aria-labelledby="guardian-consent-title"] .guardian-note');
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) {
      expect(await styles(note, ['background-color', 'border-left-width', 'border-top-left-radius', 'padding-top'])).toEqual({
        'background-color': 'rgb(243, 244, 245)',
        'border-left-width': '0px',
        'border-top-left-radius': '10px',
        'padding-top': '14px',
      });
    }
    // 동의 섹션과 PIN 섹션 사이 구역선 하나
    const pinSection = main.locator('section[aria-labelledby="guardian-pin-title"]');
    expect(await styles(pinSection, ['border-top-width', 'padding-top'])).toEqual({ 'border-top-width': '1px', 'padding-top': '24px' });
  });

  test('링크 만들기는 하단 고정 바(흰 면, 윗선 1px)에서 하단 내비 바로 위에 서고, 끝까지 내리면 마지막 PIN 칸이 바에 가리지 않는다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    const bar = page.locator('.guardian-bar.sticky-return.is-flow');
    await expect(bar.getByRole('button', { name: '링크 만들기' })).toBeVisible();
    expect(await styles(bar, ['position', 'background-color', 'border-top-width'])).toEqual({
      position: 'fixed',
      'background-color': 'rgb(255, 255, 255)',
      'border-top-width': '1px',
    });
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())).toBe(0);
    // 하단 내비 65px(윗선 포함) + 고정 바 몫 152px
    expect((await styles(page.locator('main.guardian-page'), ['padding-bottom']))['padding-bottom']).toBe('217px');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = await page.getByLabel('PIN 확인 (한 번 더)').boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual((await bar.boundingBox()).y);
  });

  test('오류: 동의 없이 누르면 경고 아이콘 + 굵은 긴급 빨강 문장(띠 없음), PIN 오류도 같은 모양', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const consentError = page.getByRole('alert').filter({ hasText: '동의해야 링크를 만들 수 있어요.' });
    await expect(consentError.locator('svg')).toHaveCount(1);
    await expect
      .poll(async () => styles(consentError, ['color', 'font-weight', 'border-left-width', 'font-size']))
      .toEqual({
        color: 'rgb(200, 16, 46)',
        'font-weight': '700',
        'border-left-width': '0px',
        'font-size': '16px',
      });

    await page.getByLabel(CONSENT).check();
    await page.getByLabel('PIN (숫자 6자리)').fill('12');
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const pinError = page.getByRole('alert').filter({ hasText: 'PIN은 숫자 6자리로 넣어 주세요.' });
    await expect(pinError.locator('svg')).toHaveCount(1);
    await expect.poll(async () => (await styles(pinError, ['color']))['color']).toBe('rgb(200, 16, 46)');
    await expect(page.getByLabel('PIN (숫자 6자리)')).toHaveAttribute('aria-invalid', 'true');
  });

  test('보기 전용(로그인 만료)이면 만들 수 없는 이유가 바 안 버튼 위에 보이고 버튼이 막힌다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await context.clearCookies();
    await page.goto('/guardian');
    const bar = page.locator('.guardian-bar');
    const note = bar.getByText('보기 전용 상태에서는 링크를 만들 수 없어요.', { exact: false });
    const button = bar.getByRole('button', { name: '링크 만들기' });
    await expect(note).toBeVisible();
    await expect(button).toBeDisabled();
    expect((await note.boundingBox()).y).toBeLessThan((await button.boundingBox()).y);
  });

  test('320px 日本語 보기 전용: 바 안 이유 문장과 버튼이 넘치지 않고 가로 스크롤이 없다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/settings' });
    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await context.clearCookies();
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/guardian');
    const bar = page.locator('.guardian-bar');
    await expect(bar.locator('.guardian-bar-note')).toBeVisible();
    await expect(bar.locator('button[type="submit"]')).toBeDisabled();
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('360px 日本語 보기 전용: 끝까지 내려도, Tab 으로 PIN 확인 칸에 가도 고정 바에 가리지 않는다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/settings' });
    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await context.clearCookies();
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto('/guardian');
    const bar = page.locator('.guardian-bar');
    await expect(bar.locator('.guardian-bar-note')).toBeVisible();
    // 보기 전용에서도 PIN 칸은 막혀 있지 않다(만들기 버튼만 막힌다)
    const pin2 = page.locator('form.guardian-form input.guardian-pin').nth(1);
    await expect(pin2).toBeEnabled();

    // 끝까지 내리면 마지막 PIN 칸 아래에 바와 16px 이상 틈이 남는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(async () => {
        const field = await pin2.boundingBox();
        return (await bar.boundingBox()).y - (field.y + field.height);
      })
      .toBeGreaterThanOrEqual(16);

    // 칸 아래 끝이 바 위 끝보다 20px 아래(바에 반쯤 가린 자리)에 오게 맞추고 초점을 옮기면, scroll-padding 이 칸을 바 위로 끌어올린다.
    // 맨 위에서 focus() 하면 브라우저가 칸을 화면 가운데로 옮겨 scroll-padding 을 확인하지 못한다
    await page.evaluate(
      ({ barTop }) => {
        const field = document.querySelectorAll('form.guardian-form input.guardian-pin')[1];
        window.scrollTo(0, window.scrollY + field.getBoundingClientRect().bottom - (barTop + 20));
      },
      { barTop: (await bar.boundingBox()).y },
    );
    const hidden = await pin2.boundingBox();
    expect(hidden.y + hidden.height).toBeGreaterThan((await bar.boundingBox()).y);
    await pin2.focus();
    await expect
      .poll(async () => {
        const field = await pin2.boundingBox();
        return (await bar.boundingBox()).y - (field.y + field.height);
      })
      .toBeGreaterThanOrEqual(0);
  });

  test('보낸 뒤 일정이 바뀌면 다시 보내기 안내는 회색 Callout(코발트 면·띠 없음)', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    // 깨진 지문 = 무엇을 보냈는지 알 수 없음 → 다시 보내기 안내(components/guardian/share.js isGuardianResendNeeded)
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('safehour.v2.') && k.endsWith('.stay') && !k.includes('.device.'));
      const record = JSON.parse(localStorage.getItem(key));
      record.data.guardianShare = { lastSentAt: new Date().toISOString(), planFingerprint: 'stale' };
      localStorage.setItem(key, JSON.stringify(record));
    });
    await page.reload();
    const resend = page.locator('section.guardian-resend');
    await expect(resend.getByRole('heading', { name: '보호자 링크 다시 보내기' })).toBeVisible();
    await expect
      .poll(async () => styles(resend, ['background-color', 'border-left-width', 'border-top-left-radius']))
      .toEqual({
        'background-color': 'rgb(243, 244, 245)',
        'border-left-width': '0px',
        'border-top-left-radius': '10px',
      });
  });

  test('링크 결과: 카드 없음, 고정 바는 사라지고 링크 복사가 화면의 주 버튼 하나다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await createLink(page);
    await expect(page.getByRole('heading', { name: '보호자에게 보낼 링크' })).toBeVisible();
    await expect(page.locator('.sticky-return')).toHaveCount(0);
    await expect(page.locator('main .card')).toHaveCount(0);
    // 주 버튼은 변형 클래스가 없는 .btn 이다(components/ui/Button.js VARIANT_CLASS)
    const primary = page.locator('main .btn:not(.btn-secondary):not(.btn-quiet):not(.btn-critical)');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/링크 복사/);
  });
});

test.describe('③층 보호자 링크 열기', () => {
  async function openOwnLink(page, stayOptions = { hasCompanion: true }) {
    await startTrip(page, stayOptions, { path: '/guardian' });
    const link = await createLink(page);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'PIN 입력' })).toBeVisible();
  }

  test('PIN 입력: 카드 없음, 열기는 하단 고정 바에서 하단 긴급 바 바로 위에 선다', async ({ page }) => {
    await openOwnLink(page);
    await expect(page.locator('main .card')).toHaveCount(0);
    const bar = page.locator('.guardian-bar.sticky-return.is-flow');
    await expect(bar.getByRole('button', { name: '열기', exact: true })).toBeVisible();
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-emergency-bar').boundingBox())).toBe(0);
    // 하단 긴급 바 69px + 고정 바 몫 152px
    expect((await styles(page.locator('main.guardian-page'), ['padding-bottom']))['padding-bottom']).toBe('221px');
  });

  test('틀린 PIN 은 경고 아이콘 + 굵은 긴급 빨강 문장(띠 없음)', async ({ page }) => {
    await openOwnLink(page);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill('000000');
    await page.getByRole('button', { name: '열기', exact: true }).click();
    const error = page.getByRole('alert').filter({ hasText: 'PIN이 맞지 않아요' });
    await expect(error.locator('svg')).toHaveCount(1);
    await expect.poll(async () => styles(error, ['color', 'border-left-width'])).toEqual({ color: 'rgb(200, 16, 46)', 'border-left-width': '0px' });
  });

  test('사본: 기준 시각은 먹색, 자동 갱신 안내는 회색 Callout, 119·1330 은 회색 52px 버튼(119 아이콘만 긴급 빨강), 복귀 마감 시각은 먹색', async ({ page }) => {
    await openOwnLink(page);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
    await expect(page.locator('main .card')).toHaveCount(0);

    const asOf = page.locator('.guardian-asof');
    expect(await styles(asOf, ['background-color', 'border-top-width'])).toEqual({ 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-width': '0px' });
    expect((await styles(page.locator('.guardian-asof-time'), ['color']))['color']).toBe('rgb(26, 28, 32)');
    expect((await styles(asOf.locator('.guardian-note'), ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await expect(asOf.locator('.guardian-note-icon svg')).toHaveCount(1);

    const call119 = page.getByRole('link', { name: /119/ });
    const call1330 = page.getByRole('link', { name: /1330/ });
    for (const call of [call119, call1330]) {
      expect(Math.round((await call.boundingBox()).height)).toBe(52);
      await expect.poll(async () => (await styles(call, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    }
    expect((await styles(call119.locator('svg'), ['color']))['color']).toBe('rgb(200, 16, 46)');
    expect((await styles(call1330.locator('svg'), ['color']))['color']).toBe('rgb(26, 28, 32)');

    const returnTime = page.locator('.guardian-return-time').first();
    await expect(returnTime).toBeVisible();
    expect((await styles(returnTime, ['color']))['color']).toBe('rgb(26, 28, 32)');
    expect((await styles(page.locator('.guardian-return').first(), ['border-top-left-radius']))['border-top-left-radius']).toBe('10px');
  });

  test('동행이 필요한 날: 동행 안내는 띠 없는 분홍 Callout, 두 언어가 함께 보인다', async ({ page }) => {
    await openOwnLink(page, { hasCompanion: true, items: selfItems({ escortRequired: { kind: 'SET', value: true } }) });
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    const escort = page.locator('.guardian-escort').first();
    await expect(escort).toBeVisible();
    expect(await styles(escort, ['background-color', 'border-left-width', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(255, 233, 240)', 'border-left-width': '0px', 'border-top-left-radius': '10px',
    });
    await expect(escort.locator('p')).toHaveCount(2);
  });
});
