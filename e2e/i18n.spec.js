// 4개 언어와 안전 문구 병기 (AX-322 · 시나리오 8(옛 작업 설계서의 화면 테스트 번호), docs/business-rules.md '언어'·'전체 일정 확정과 변화 대응', src/i18n/AGENTS.md)
//
// - 일반 화면 문구는 ja·zh 번역을 그대로 쓴다.
// - 안전 문구(상태·사유·고지·복귀 안내)는 선택 언어 + 한국어. ko 는 ko + en.
//   ja·zh 는 검수 스위치(빌드 시점 공개 환경변수, 기본 꺼짐)가 꺼져 있으면 **en + ko** 로 보인다.
//   이 E2E 빌드는 스위치를 켜지 않는다 — 그래서 일본어·중국어 안전 문구가 화면에 없어야 한다.
// - 판정은 언어와 무관하다 — 같은 입력이면 ja 로 만든 일정과 ko 로 만든 일정의 상태·정거장이 같다.
//
// 12.4 에 따라 의도적으로 다시 썼다 — 예전 E2E 는 ja·zh 를 en 으로 대체한다고 단언했다(ADR-0007 로 변경).

import { test, expect } from './fixtures.js';
import { evidenceShot, kstDate, readRecord, startTrip, stopsOf } from './helpers.js';

const SAFETY = {
  p1: { ko: '① 의료 판단을 하지 않습니다.', en: '① We make no medical judgements.', ja: '① 医療的な判断は行いません。', zh: '① 我们不做医疗判断。' },
  emergencyLead: {
    ko: '몸 상태에 이상이 느껴지면 앱보다 먼저 병원에 연락하세요.',
    en: 'If you feel unwell, contact your hospital before checking the app.',
    ja: '体調に異変を感じたら、アプリより先に病院へ連絡してください。',
    zh: '如感到身体不适，请先联系医院，而不是先看应用。',
  },
};

const UI = {
  ja: { cta: 'はじめる', navToday: '今日', emergency: '緊急連絡', checkTitle: '今日の条件は変わりありませんか？' },
  zh: { cta: '开始使用', navToday: '今天', emergency: '紧急联系', checkTitle: '今天的条件没有变化吗？' },
};

/** 일정 요청을 같은 입력·다른 언어로 다시 보내 날짜별 상태와 정거장을 비교한다 (docs/business-rules.md '전체 일정 확정과 변화 대응') */
async function expectLanguageNeutral(page, planBody, otherLang) {
  const body = JSON.parse(planBody);
  const run = async (lang) => {
    const res = await page.request.post('/api/itinerary/plan', { data: { ...body, lang } });
    expect(res.ok()).toBe(true);
    const days = (await res.json()).days;
    return Object.fromEntries(Object.entries(days).map(([d, day]) => [d, [day.dayState, stopsOf(day).map((s) => s.contentId)]]));
  };
  expect(await run(otherLang)).toEqual(await run(body.lang));
}

for (const lang of ['ja', 'zh']) {
  test.describe(`시나리오 8 — ${lang} 브라우저, 검수 스위치 꺼짐`, () => {
    test.use({ locale: lang === 'ja' ? 'ja-JP' : 'zh-CN' });

    test(`시작 화면: 일반 문구는 ${lang}, 안전 고지는 영어 + 한국어`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('link', { name: UI[lang].cta })).toBeVisible();
      await expect(page.getByText(SAFETY.p1.en)).toBeVisible();
      await expect(page.getByText(SAFETY.p1.ko)).toBeVisible();
      await expect(page.getByText(SAFETY.p1[lang])).toHaveCount(0);
      // 병기 줄에는 스크린리더 음성용 lang 이 붙는다
      await expect(page.locator(`[lang="en"]`).filter({ hasText: SAFETY.p1.en }).first()).toBeVisible();
      await expect(page.locator(`[lang="ko"]`).filter({ hasText: SAFETY.p1.ko }).first()).toBeVisible();
      await evidenceShot(page, `19-start-${lang}`);
    });

    test(`오늘·긴급: 화면은 ${lang}, 상태·안내 문구는 영어 + 한국어. 판정은 언어와 무관하다`, async ({ page }) => {
      const planBodies = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/api/itinerary/plan') && request.method() === 'POST') planBodies.push(request.postData());
      });
      const { tripPlan } = await startTrip(page, {}, { confirmToday: false });
      expect(tripPlan.lang).toBe(lang);

      await expect(page.getByRole('link', { name: UI[lang].navToday, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: UI[lang].checkTitle })).toBeVisible();
      const banner = page.locator('.state-banner');
      await expect(banner.locator('h2')).toHaveAttribute('lang', 'en');
      await expect(banner.locator('.state-secondary')).toHaveAttribute('lang', 'ko');
      await expect(banner).toContainText("Please confirm first whether today's conditions are unchanged");
      await expect(banner).not.toContainText(lang === 'ja' ? '今日の条件が変わっていないか' : '请先确认');
      await evidenceShot(page, `20-today-${lang}`);

      await page.goto('/emergency');
      await expect(page.getByRole('heading', { name: UI[lang].emergency, level: 1 })).toBeVisible();
      await expect(page.getByText(SAFETY.emergencyLead.en, { exact: false })).toBeVisible();
      await expect(page.getByText(SAFETY.emergencyLead.ko, { exact: false })).toBeVisible();
      await expect(page.getByText(SAFETY.emergencyLead[lang], { exact: false })).toHaveCount(0);

      // 관광 데이터는 선택 언어 서비스(없으면 영문 → 국문 + 번역 필요)로 보인다
      const stops = Object.values(tripPlan.days).flatMap((d) => stopsOf(d));
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) {
        expect([lang, 'en', 'ko']).toContain(stop.lang);
        if (stop.lang === 'ko') expect(stop.labels).toContain('NEEDS_TRANSLATION');
      }

      expect(planBodies.length).toBeGreaterThan(0);
      await expectLanguageNeutral(page, planBodies[0], 'ko');
    });
  });
}

test.describe('영어 브라우저', () => {
  test.use({ locale: 'en-US' });

  test('조작 없이 영어로 시작하고, 안전 고지는 영어 + 한국어다 (규칙 44)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
    await expect(page.getByText(SAFETY.p1.en)).toBeVisible();
    await expect(page.getByText(SAFETY.p1.ko)).toBeVisible();
  });
});

test.describe('언어 바꾸기 (규칙 51)', () => {
  test('설정에서 언어를 바꾸면 오늘 이후 일정의 표시만 다시 쓰고 정거장·시각·상태는 그대로다', async ({ page }) => {
    const { tripPlan } = await startTrip(page, {}, { path: '/settings' });
    const today = kstDate(0);
    const shape = (plan) =>
      Object.fromEntries(
        Object.values(plan.days)
          .filter((d) => d.date >= today)
          .map((d) => [d.date, [d.dayState, stopsOf(d).map((s) => `${s.contentId}@${s.arriveAt}`)]]),
      );
    const before = shape(tripPlan);

    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('link', { name: '今日', exact: true })).toBeVisible();
    await expect.poll(async () => (await readRecord(page, 'tripPlan')).lang, { message: '표시 다시 쓰기' }).toBe('ja');
    const after = await readRecord(page, 'tripPlan');
    expect(shape(after)).toEqual(before);
    for (const day of Object.values(after.days).filter((d) => d.date >= today)) {
      expect(day.delta?.hasVisibleChange ?? false, '표시만 다시 쓰면 전후 비교가 생기지 않는다').toBe(false);
    }
    // 언어는 '내 정보 지우기' 뒤에도 남는 기기 설정이다
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('safehour.v2.device.lang')).data.lang)).toBe('ja');
  });
});
