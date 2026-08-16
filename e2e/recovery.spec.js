// 병원 회복 지침 연결 흐름 (AX-214 ~ AX-218)
//
// 이 흐름이 깨지면 제품 정의가 무너진다.
//   - 연결 없이는 외출 판정으로 갈 수 없다
//   - 만료된 지침으로 외출을 추천하지 않는다
//   - 확인하지 않은 중요 안내는 판정을 STANDBY 로 강등한다 (차단이 아니라 강등)
//   - 병원 원문(채널 B)은 화면에만 있고 판정 요청에 실리지 않는다
//   - 데모 계획은 "병원 연동 데모" 를 숨기지 않는다

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { submitPlan } from './helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** 데모 로그인 후 지정한 예시 지침을 연결한다 */
async function connect(page, label) {
  await page.goto('/api/auth/login?provider=demo&returnTo=/link');
  await expect(page).toHaveURL(/\/link/);
  await page.getByRole('button', { name: label }).click();
  await expect(page.getByRole('button', { name: '오늘의 회복 상태 보기' })).toBeVisible();
}

test.describe('병원 연결 (AX-216)', () => {
  test('로그인 없이는 연결할 수 없다', async ({ request }) => {
    const res = await request.post('/api/plan/link', { data: { code: 'DEMO-A' } });
    expect(res.status()).toBe(401);
  });

  test('모르는 코드는 지침을 주지 않는다', async ({ page }) => {
    await page.goto('/api/auth/login?provider=demo&returnTo=/link');
    await page.locator('#link-code').fill('NOPE-999');
    await page.getByRole('button', { name: '회복 지침 연결' }).click();
    await expect(page.locator('.state-banner[role="alert"]')).toContainText(
      '회복 지침을 찾지 못했습니다',
    );
  });

  test('연결하면 발행처와 유효기간이 보이고 데모 표시가 남는다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await expect(page.getByText(/연결됨/)).toBeVisible();
    await expect(page.getByText('유효기간')).toBeVisible();
    // 실제 연동으로 오인되면 허위 제출이다 — 숨기지 않는다
    await expect(page.getByText('병원 연동 데모').first()).toBeVisible();
  });

  test('연결 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await page.goto('/link');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id), '병원 연결 접근성 위반').toEqual([]);
  });
});

test.describe('오늘의 회복 (AX-217)', () => {
  test('연결 전에는 외출로 넘어갈 수 없다', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByText('연결된 병원 지침이 없습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '안전 외출 확인' })).toHaveCount(0);
  });

  test('확인하지 않은 중요 안내가 있으면 대기로 강등된다 — 차단이 아니다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/today');

    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('대기가 필요합니다');
    await expect(banner).toContainText('확인하지 않은 병원 안내 변경이 있습니다');
    // 강등 상태에서는 외출 CTA 대신 안내 확인 CTA 가 나온다 (정의 §5.2)
    await expect(page.getByRole('button', { name: '안전 외출 확인' })).toHaveCount(0);
  });

  test('안내를 확인하면 강등이 풀리고 외출 CTA 가 나온다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/guide');
    await page.getByRole('button', { name: '전체 확인 처리' }).click();

    await page.goto('/today');
    await expect(page.locator('.state-banner').first()).toContainText('함께 짧은 활동이 가능합니다');
    await expect(page.getByRole('button', { name: '안전 외출 확인' })).toBeVisible();
  });

  test('외출 제한 지침은 확인해도 미추천이다', async ({ page }) => {
    await connect(page, '예시 B — 외출 제한');
    await page.goto('/guide');
    await page.getByRole('button', { name: '전체 확인 처리' }).click();

    await page.goto('/today');
    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('지금은 관광을 권하지 않습니다');
    await expect(banner).toContainText('병원이 외출을 제한했습니다');
    await expect(page.getByRole('button', { name: '안전 외출 확인' })).toHaveCount(0);
    await expect(page.getByText('병원에 연락하세요')).toBeVisible();
  });

  test('만료된 지침으로는 외출을 추천하지 않는다', async ({ page }) => {
    await connect(page, '예시 C — 지침 만료');
    await page.goto('/today');
    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('지금은 관광을 권하지 않습니다');
    await expect(banner).toContainText('유효기간이 지났습니다');
  });

  test('병원 원문은 판정 요청에 실리지 않는다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');

    const bodies = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/today') && req.method() === 'POST') {
        bodies.push(req.postData() ?? '');
      }
    });
    await page.goto('/today');
    await expect(page.locator('.state-banner').first()).toBeVisible();

    expect(bodies.length).toBeGreaterThan(0);
    // 채널 B 문장이 서버로 나가면 "단말을 떠나지 않는다" 가 거짓이 된다.
    // (현재 계약은 계획 전체를 보내지만, 안내문은 여기서 걸러져야 한다)
    for (const body of bodies) {
      expect(body, '병원 안내 원문이 판정 요청에 실렸다').not.toContain('항생제');
    }
  });

  test('오늘의 회복 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/today');
    await expect(page.locator('.state-banner').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id), '오늘의 회복 접근성 위반').toEqual([]);
  });
});

test.describe('병원 회복 안내 (AX-218)', () => {
  test('병원 원문을 그대로 보여주고 출처를 표시한다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/guide');

    await expect(page.getByText('병원에서 제공한 안내').first()).toBeVisible();
    await expect(page.getByText(/수술 부위에 압박이 가지 않도록/)).toBeVisible();
    await expect(page.getByText(/발행/).first()).toBeVisible();
  });

  test('7종 분류가 모두 나온다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/guide');
    for (const title of ['활동·외출', '복약', '음식·음료', '생활 안내', '동행', '이상 상황 대응', '다음 진료']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('개별 확인이 유지된다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/guide');
    await page.getByRole('button', { name: /확인했습니다/ }).first().click();
    await expect(page.getByText('확인 완료').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText('확인 완료').first()).toBeVisible();
  });

  test('안내 화면에 WCAG A/AA 위반이 없다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    await page.goto('/guide');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id), '병원 안내 접근성 위반').toEqual([]);
  });
});

test.describe('삭제 (AX-210 회귀)', () => {
  test('"내 정보 지우기" 가 병원 지침까지 지운다', async ({ page }) => {
    await connect(page, '예시 A — 외출 가능');
    expect(await page.evaluate(() => sessionStorage.getItem('safehour.plan'))).not.toBeNull();

    await page.getByRole('button', { name: '이 기기에서 내 정보 지우기' }).click();
    await page.getByRole('button', { name: '지우기' }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/');

    // 병원 안내문이 남으면 민감도가 가장 높은 데이터가 남는 것이다
    expect(await page.evaluate(() => sessionStorage.getItem('safehour.plan'))).toBeNull();
  });
});

test.describe('외출 중 지침 무효화 (AX-220)', () => {
  /** 저장된 지침의 유효기간을 과거로 돌리고 탭 복귀를 흉내 낸다 */
  async function expirePlanInBackground(page) {
    await page.evaluate(() => {
      const plan = JSON.parse(sessionStorage.getItem('safehour.plan'));
      plan.expiresAt = new Date(Date.now() - 60_000).toISOString();
      sessionStorage.setItem('safehour.plan', JSON.stringify(plan));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  async function revokePlanInBackground(page) {
    await page.evaluate(() => {
      const plan = JSON.parse(sessionStorage.getItem('safehour.plan'));
      plan.revoked = true;
      sessionStorage.setItem('safehour.plan', JSON.stringify(plan));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  test('외출 중 만료되면 추천이 사라지고 즉시 복귀로 전환된다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    await expirePlanInBackground(page);

    // 추천이 남아 있으면 만료된 지침으로 계속 돌아다니게 된다
    await expect(page.locator('.course-card')).toHaveCount(0);
    const banner = page.locator('.state-banner').first();
    await expect(banner).toContainText('지금은 관광을 권하지 않습니다');
    await expect(banner).toContainText('유효기간이 지났습니다');

    // 복귀 시트가 자동으로 떠야 한다 — 안내만 띄우고 끝내면 안 된다
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
  });

  test('철회도 같은 방식으로 즉시 복귀로 전환된다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    await revokePlanInBackground(page);

    await expect(page.locator('.course-card')).toHaveCount(0);
    await expect(page.locator('.state-banner').first()).toContainText('거둬들였습니다');
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
  });

  test('무효화 뒤에는 변화 이벤트로 추천을 되살릴 수 없다', async ({ page }) => {
    await submitPlan(page);
    await expirePlanInBackground(page);
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
    await page.locator('.sheet').getByRole('button', { name: '확인' }).click();

    // 시연 패널이 남아 있으면 재계산으로 추천이 되살아난다
    await expect(page.getByRole('heading', { name: '실시간 변화 시연' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /1순위 장소 휴무/ })).toHaveCount(0);
  });

  test('무효화 상태가 새로고침 뒤에도 유지된다', async ({ page }) => {
    await submitPlan(page);
    await expirePlanInBackground(page);
    await expect(page.locator('.course-card')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.course-card')).toHaveCount(0);
    await expect(page.locator('.state-banner').first()).toContainText('지금은 관광을 권하지 않습니다');
  });

  test('미확인 안내만으로는 외출을 중단시키지 않는다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    // 확인 상태만 되돌린다 — 만료가 아니므로 추천이 살아 있어야 한다
    await page.evaluate(() => {
      const plan = JSON.parse(sessionStorage.getItem('safehour.plan'));
      plan.instructions = plan.instructions.map((i) => ({ ...i, acknowledged: false }));
      sessionStorage.setItem('safehour.plan', JSON.stringify(plan));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(page.locator('.course-card').first()).toBeVisible();
    await expect(page.getByText('지금 복귀하세요')).toHaveCount(0);
  });
});

test.describe('무효화 진입 경로 (AX-220 회귀)', () => {
  test('이미 만료된 뒤에 결과 화면을 열면 추천이 보이지 않는다', async ({ page }) => {
    await submitPlan(page);
    await expect(page.locator('.course-card').first()).toBeVisible();

    // 화면을 떠난 사이 만료된 상황 — 저장된 추천을 그대로 믿으면 안 된다
    await page.evaluate(() => {
      const plan = JSON.parse(sessionStorage.getItem('safehour.plan'));
      plan.expiresAt = new Date(Date.now() - 60_000).toISOString();
      sessionStorage.setItem('safehour.plan', JSON.stringify(plan));
    });
    await page.goto('/today');
    await page.goto('/result');

    await expect(page.locator('.course-card')).toHaveCount(0);
    await expect(page.locator('.state-banner').first()).toContainText('유효기간이 지났습니다');
    await expect(page.getByText('지금 복귀하세요')).toBeVisible();
  });

  test('철회된 뒤에 열어도 마찬가지다', async ({ page }) => {
    await submitPlan(page);
    await page.evaluate(() => {
      const plan = JSON.parse(sessionStorage.getItem('safehour.plan'));
      plan.revoked = true;
      sessionStorage.setItem('safehour.plan', JSON.stringify(plan));
    });
    await page.goto('/result');

    await expect(page.locator('.course-card')).toHaveCount(0);
    await expect(page.locator('.state-banner').first()).toContainText('거둬들였습니다');
  });
});

/**
 * 병원이 발행한 시각은 한국 벽시계 시각이다. 외국인 이용자의 폰은 고국 시간대로
 * 설정돼 있을 수 있는데, 그 시간대로 렌더하면 **복귀 마감이 다른 시각으로 보인다.**
 * 시차만큼 늦게 돌아오게 만드는 결함이라 라벨이 아니라 값을 고정한다.
 */
test.describe('시각 표시는 단말 시간대를 따르지 않는다', () => {
  const DEADLINE = /복귀 마감 (\d{1,2})\. (\d{1,2})\. (\d{2}:\d{2})/;

  async function readDeadline(page) {
    await page.goto('/api/auth/login?provider=demo&returnTo=/link');
    await page.getByRole('button', { name: '예시 A — 외출 가능' }).click();
    await page.getByRole('button', { name: '오늘의 회복 상태 보기' }).click();
    await expect(page).toHaveURL(/\/today/);
    const text = await page.locator('main').innerText();
    const match = text.match(DEADLINE);
    expect(match, `복귀 마감을 찾지 못했다:\n${text}`).not.toBeNull();
    return match[0];
  }

  test('시차 19시간 단말에서도 같은 복귀 마감을 보여준다', async ({ browser }) => {
    // `browser.newContext` 는 config 의 `use` 를 물려받지 않는다. 로케일을 명시하지 않으면
    // 러너 기본값(CI 는 en-US)으로 열려 화면이 영문으로 나온다 — 한국어 문구로 단언하므로 고정한다.
    const context = (timezoneId) => browser.newContext({ locale: 'ko-KR', timezoneId });

    // 예시 지침은 지금 기준으로 발행되므로 두 컨텍스트를 같은 순간에 열어 비교한다.
    const seoul = await context('Asia/Seoul');
    const honolulu = await context('Pacific/Honolulu'); // KST-19h
    try {
      const [fromSeoul, fromHonolulu] = await Promise.all([
        seoul.newPage().then(readDeadline),
        honolulu.newPage().then(readDeadline),
      ]);
      expect(fromHonolulu).toBe(fromSeoul);
    } finally {
      await seoul.close();
      await honolulu.close();
    }
  });
});
