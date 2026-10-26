// 디자인 시안 보드 (AX-322 · spec 12.3 시나리오 11, 7장)
//
// - 토큰 견본·부품의 상태별 견본·주요 화면 축소 시안이 모두 그려진다.
// - **고정 데모 데이터만 쓴다** — 로그인한 사용자의 체류·일정을 읽지 않고, 일정 API 도 부르지 않는다.
// - 내비에 노출하지 않는다.

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, LODGING_NAME, evidenceShot, expectNoHorizontalScroll, startTrip } from './helpers.js';
import { CONTRAST_GROUPS } from '../app/design-board/demoData.js';

test.describe('시나리오 11 — /design-board', () => {
  test('토큰·부품·화면 시안이 그려지고 사용자 데이터를 읽지 않는다', async ({ page }) => {
    // 사용자 데이터가 있는 상태에서 열어도 시안 보드는 그것을 읽지 않는다
    await startTrip(page);
    const apiCalls = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) apiCalls.push(path);
    });

    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '디자인 시안 보드', level: 1 })).toBeVisible();
    await expect(page.getByText('고정 데모 데이터만 씁니다.', { exact: false })).toBeVisible();

    for (const heading of ['색 토큰과 대비', '글자', '간격·모서리·그림자', '부품과 상태별 견본', '화면 시안']) {
      await expect(page.getByRole('heading', { name: heading, level: 2 }).first()).toBeVisible();
    }
    // 부품 견본: 배지 5종·상태 배너 4상태
    for (const badge of ['추정', '기본값 적용', '운영 확인 필요', '병원 연동 데모', '보기 전용']) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
    }
    for (const state of ['TOGETHER', 'SPLIT_NEARBY', 'STANDBY', 'NO_TOURISM']) {
      await expect(page.locator(`.state-banner.state-${state}`).first()).toBeVisible();
    }
    // 주요 화면 축소 시안 8종
    for (const screen of ['오늘', '전체 일정', '조건', '장소 상세', '한국어 안내 카드', '긴급 연락', '보호자 안내']) {
      await expect(page.getByRole('heading', { name: screen, level: 1 }).first()).toBeVisible();
    }
    // 대비 판정 — 보드가 브라우저에서 토큰 값을 읽어 계산한다. 미달 판정이 하나도 없어야 한다(설계서 4.7)
    const verdicts = page.locator('[data-verdict]');
    await expect(verdicts.first()).toBeVisible();
    await expect(page.locator('[data-verdict="measuring"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict="fail"]')).toHaveCount(0);
    // 잴 짝(장식 제외) 수와 통과 수가 같아야 한다 — 짝이 늘거나 줄면 이 수도 따라간다
    const measured = CONTRAST_GROUPS.flatMap((group) => group.pairs).filter((pair) => pair.fg && !pair.decorative).length;
    await expect(page.locator('[data-verdict="pass"]')).toHaveCount(measured);
    // SEED 층 짝이 보드에 그려진다
    await expect(page.getByRole('heading', { name: '층·선택·아이콘 (SEED)', level: 3 })).toBeVisible();
    await expectNoHorizontalScroll(page, '/design-board');
    await evidenceShot(page, '22-design-board');

    // 사용자 데이터를 읽지 않는다
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(HOSPITAL_NAME);
    expect(body).not.toContain(LODGING_NAME);
    expect(apiCalls.filter((path) => path.startsWith('/api/itinerary'))).toEqual([]);
  });

  test('화면 시안 틀 안: 하단 바는 고정이 아니고, 긴급 견본은 자기 틀의 하단 독 밖으로 밀려나지 않는다', async ({ page }) => {
    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '화면 시안', level: 2 }).first()).toBeVisible();

    // 틀 안의 하단 바(하단 긴급 바 등)가 고정이면 틀의 transform 안에서 독 밖으로 나간다.
    // 시안 안에는 고정 요소가 하나도 없어야 한다(.sticky-return 은 보드 페이지 여백 규칙까지 건드린다)
    const fixed = await page.locator('.designBoard-phone').evaluateAll((frames) =>
      frames.flatMap((frame) =>
        [...frame.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed').map((el) => String(el.className)),
      ),
    );
    expect.soft(fixed).toEqual([]);

    // 내비가 없는 시안(/g)의 하단 긴급 바 안 긴급 버튼은 그 틀의 하단 독 안에 있어야 한다.
    // 내비가 있는 시안은 내비 다섯째 칸이 긴급이라 따로 떠 있는 버튼이 없다
    const result = await page.locator('.designBoard-phone').evaluateAll((frames) => {
      const round = (rect) => ({ top: Math.round(rect.top), bottom: Math.round(rect.bottom) });
      const outside = [];
      let measured = 0;
      frames.forEach((frame, index) => {
        const sos = frame.querySelector('.designBoard-phone-dock .ui-emergency');
        const dock = frame.querySelector('.designBoard-phone-dock');
        if (!sos || !dock) return;
        measured += 1;
        const a = sos.getBoundingClientRect();
        const b = dock.getBoundingClientRect();
        if (a.top < b.top - 1 || a.bottom > b.bottom + 1) outside.push({ index, sos: round(a), dock: round(b) });
      });
      return { measured, outside };
    });
    expect(result.measured).toBeGreaterThan(0);
    expect(result.outside).toEqual([]);
  });

  test('화면 시안 틀 안: 전체 일정 시안의 날짜 칩이 하단 내비 견본 위로 올라오지 않는다', async ({ page }) => {
    await page.goto('/design-board');
    const phone = page.locator('figure.designBoard-screen').filter({ has: page.locator('code', { hasText: /^\/trip$/ }) });
    await expect(phone.locator('.trip-day-row').first()).toBeVisible();
    const today = phone.locator('.ui-bottom-nav a[href="/today"]');
    await today.scrollIntoViewIfNeeded();

    // 틀 안은 inert 라 눌림 대상 검사에서 빠진다. 쌓임 순서만 보려고 검사하는 동안만 inert 를 푼다
    const result = await phone.evaluate((figure) => {
      const screen = figure.querySelector('.designBoard-phone-screen');
      const nav = figure.querySelector('.ui-bottom-nav a[href="/today"]');
      const rect = nav.getBoundingClientRect();
      screen.inert = false;
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      screen.inert = true;
      return { ok: Boolean(top) && (nav === top || nav.contains(top)), top: top ? `${top.tagName}.${top.className}` : null };
    });
    expect(result.ok, `내비 견본 가운데에서 가장 위에 있는 요소: ${result.top}`).toBe(true);
  });

  test('내비에는 나오지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    for (const path of ['/more', '/today', '/settings', '/trip']) {
      await page.goto(path);
      await expect(page.locator('a[href="/design-board"]')).toHaveCount(0);
    }
  });
});
