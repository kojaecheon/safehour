# SEED ③층 2/15 — 로그인 화면(`/login`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 화면을 설계서 6.2 2번 배치로 바꾼다. 흰 바탕 한 장에 26px 제목 → 설명 → 로그인 수단(전체 폭 버튼 목록, 데모는 회색 채움) → 안내 Callout 순서다. 320px 네 언어에서 공급자 이름이 쪼개지지 않게 한다.

**Architecture:** 마크업 변경은 네 군데다. 자물쇠 원판을 지우고, 데모 버튼과 설명을 한 묶음으로 싸고, 로그인된 상태의 카드 클래스를 벗기고, 안내 상자에 아이콘 칸을 둔다. 모양은 `app/styles/onboarding.css` 로그인 절과 `app/globals.css`(소셜 버튼·안내 상자)에서 ②층 토큰으로 맞춘다. 안내 상자 아이콘은 공용 클래스 `.medical-callout.has-icon`과 새 `info` 아이콘으로 만든다. 체류 설정의 면책 상자, 개인정보 소개도 뒤에 같은 방식을 쓸 수 있다. 새 화면 테스트 `e2e/screen-login.spec.js`가 계산된 모양, 320px 네 언어의 이름 줄 높이, 로그인된 상태를 먼저 실패하게 잰다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`. 이 계획이 따르는 절은 아래와 같다.
- 6.1 규칙
- 6.2 2번 행
- 5.1 버튼(비활성)
- 5.6 안내 상자
- 5.9 아이콘
- 5.10 ②층에서 정한 것

앞 화면 계획 `docs/superpowers/plans/2026-09-27-seed-layer3-01-start.md`의 Ruling 8도 따른다. 면책 상자 아이콘은 ③층 3번에서 이 계획의 `has-icon`을 쓴다.

## Global Constraints

- 새 패키지 설치 금지. `package.json`·`package-lock.json`을 수정하지 않는다. `npx`로 새 도구를 내려받지 않는다.
- 토큰 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 카카오 브랜드 hex는 원래대로 `app/globals.css`에 둔다.
- 문구는 `src/i18n/messages/`에만, 4개 언어 모두 둔다. 이 계획은 새 문구를 만들지 않는다.
- 대비는 WCAG 2.1 AA를 따른다. 글자는 4.5:1, UI 경계와 아이콘은 3:1이다.
- 본문은 16px 이상, 터치 대상은 44px 이상이다. 상태는 색 + 문구 + 아이콘으로 보인다. 320–1280px에서 가로 스크롤이 없어야 한다.
- 코발트(`--accent`)는 화면당 주 버튼 하나, 링크, '오늘' 표시에만 쓴다. 이 화면에서는 로그인된 상태의 '계속하기' 하나뿐이다.
- 비활성은 회색 면 + `--ink-subtle` 글자이고, 투명도로 흐리게 하지 않는다. 못 누르는 이유는 글자로 알린다('준비 중').
- 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 둔다.
- 로그인의 안전 문구는 문장, 순서, `role="note"`를 바꾸지 않는다. '본인 확인이 아니다'와 '이름·이메일·프로필은 받지 않는다'가 여기에 든다.
- 공급자 순서도 바꾸지 않는다. Google → 카카오 → 데모다(ADR-0004).
- 기존 화면 테스트의 역할·이름 단언은 고치지 않는다.
  - `e2e/login.spec.js`: 공급자 버튼 이름, `aria-disabled`, '준비 중', 안전 문구, 오류 배너, 로그아웃.
  - `e2e/core-flow.spec.js`·`e2e/guardian.spec.js`: '데모 계정으로 둘러보기' 링크.
  - `e2e/accessibility.spec.js`: `/login` axe 검사.
- 커밋은 로컬에만 한다. 메시지는 한국어로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- 관문: `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다. e2e는 build 뒤에 돌린다.
  - e2e는 지금 74건이고 이 계획 뒤 80건이 된다.
  - `e2e/demo-events.spec.js` 한 건은 시간대에 따라 일부러 건너뛴다.

## 이 계획이 정한 것

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 자물쇠 원판 | 6.2 2번 배치에 없음 | 지운다. 제목이 상단 바 20px 아래 첫 요소가 된다 | 코발트 면(`--accent-soft`)은 허용된 코발트 쓰임이 아니다. 배치도 26px 제목으로 시작한다 |
| 준비 중인 공급자 | 5.1 비활성은 회색 면 + `--ink-subtle` | 공급자 전용 비활성 규칙(`--ink-soft` 글자, `--line-strong` 테두리)을 지우고 공통 비활성을 따른다. '준비 중' 배지는 버튼 안에 둔다 | 지금은 누를 수 없는 공급자와 누를 수 있는 데모(회색 채움)가 사실상 테두리 한 줄로만 갈린다. 공통 비활성을 따르면 글자 색(3.1:1 대 16:1)과 '준비 중' 글자로 갈린다 |
| 320px 공급자 이름 | — | 배지가 한 줄에 안 들어가면 다음 줄로 내려간다(`flex-wrap`) | 지금 320px 영어에서는 'Continue / with Google'이 두 줄로 쪼개진다 |
| 구글 버튼 눌림 | 4.6 눌림은 면 색만 | `--surface-alt` → `--pressed` | 흰 면의 눌림 토큰으로 맞춘다(시작 화면 선택 상자와 같다) |
| 안내 상자 아이콘 | 5.6 옅은 바탕 + 아이콘 | 공용 `.medical-callout.has-icon`에 새 `info` 아이콘(원 + i)을 둔다. 20px 먹색이고 글자와 8px 떨어진다 | 5.9는 새 아이콘으로 내비 채움만 정했지만, 안내 상자에 맞는 아이콘이 없다. 자물쇠는 '본인 확인이 아니다' 옆에서 반대 뜻으로 읽힌다. `has-icon`을 붙인 상자에만 적용된다 |
| 로그인된 상태 | — | 그림자 카드(`.onboarding-card`)를 벗겨 흰 바탕 그대로 둔다. 상태 줄(초록 체크 + 먹색 굵은 글자) → [계속하기(주)] → [로그아웃(회색)] 세로 순서다 | 흰 바탕 한 장 화면(6.1)에 카드 한 장만 떠 있으면 구역이 둘로 보인다. 초록은 아이콘에만 쓴다 |
| 계속하기 위치 | 6.1 흐름을 끝내는 버튼은 하단 고정 바 | 제자리(로그인된 상태 묶음 안) | 이 화면의 주 행동은 로그인 수단 목록이다(6.2 2번). 로그인된 상태는 드물게 들르는 갈림길이라 고정 바를 새로 두지 않는다 |
| 데모 설명 | — | 데모 버튼에 8px로 붙인다(목록 간격 12px과 나눈다) | 어느 버튼의 설명인지 보이게 한다 |
| 오류 배너 | 5.6 StateBanner | 그대로 둔다(`state-banner state-STANDBY`, `role="alert"`) | ②층에서 이미 Callout 모양이다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/login/page.js` | 로그인 화면 | 자물쇠 원판 삭제, 데모 묶음, 로그인된 상태 클래스, 안내 상자 아이콘 |
| `app/styles/onboarding.css` | 시작·로그인·체류 설정 화면 배치 | 머리 주석 한 줄, 시작 제목 규칙을 로그인 제목과 공유, 로그인 절 |
| `app/globals.css` | 토큰과 공용 부품 모양 | `.medical-callout.has-icon`·`.medical-callout-icon`, 소셜 버튼 절 |
| `components/ui/Icon.js` | 인라인 SVG 아이콘 | 새 `info` |
| `e2e/screen-login.spec.js` | **새** ③층 로그인 화면 모양 테스트 | 만든다 |
| `docs/platform/DESIGN_SYSTEM.md` · `docs/tracking/status.md` | 문서 | 한 줄씩 |

---

### Task 1: 로그인 화면 — 제목·로그인 수단·안내 상자·로그인된 상태

**Files:**
- Create: `e2e/screen-login.spec.js`
- Modify: `app/login/page.js` (`return (` 안의 `<main>` 부분)
- Modify: `app/styles/onboarding.css` (머리 주석의 `로그인(/login)` 줄, `.onboarding-hero-title` 규칙, `/* ── 로그인 ── */` 절 전체)
- Modify: `app/globals.css` (`.medical-callout` 규칙 바로 뒤, `/* 소셜 로그인 … */` 절, `/* 자격증명이 없는 공급자 … */` 규칙)
- Modify: `components/ui/Icon.js` (`lock` 바로 뒤)
- Modify: `docs/platform/DESIGN_SYSTEM.md` (클래스 표 한 행), `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes: ②층 토큰과 클래스.
  - 토큰: `--text-display`·`--lh-display`·`--lh-body`·`--gap-component`·`--radius-10`·`--pressed`·`--ink-subtle`·`--state-together-ink`.
  - 클래스: `.btn[aria-disabled='true']` 공통 비활성, `.medical-callout`.
- Produces:
  - `Icon name="info"`: 원 + i. 안내 상자 앞 아이콘이다.
  - `.medical-callout.has-icon` > `.medical-callout-icon` + `<p>`: 아이콘 붙은 안내 상자다. ③층 3번(면책 상자)과 14번(개인정보 소개)도 쓸 수 있다.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-login.spec.js`)**

```js
// ③층 로그인 화면(/login) — SEED 화면 배치 (설계서 6.1 · 6.2 2번)
//
// 흰 바탕 한 장: 26px 제목 → 설명 → 로그인 수단(전체 폭 버튼 목록, 데모는 회색 채움) → 안내 Callout.
// 이 실행 환경에는 공급자 자격증명이 없다 — Google·카카오는 '준비 중' 비활성 버튼으로 남는다.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --ink-subtle rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245) · --accent rgb(10, 92, 255) · --state-together-ink rgb(17, 105, 58).

import { test, expect } from './fixtures.js';
import { expectNoAxeViolations, loginDemo } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 로그인 화면 — SEED 배치', () => {
  test('제목·로그인 수단·안내 상자가 SEED 모양이다', async ({ page }) => {
    await page.goto('/login');
    await page.mouse.move(0, 0);
    const google = page.getByRole('button', { name: /Google로 계속하기/ });
    await expect(google).toBeVisible(); // 세션 확인이 끝나 목록이 그려질 때까지

    // 자물쇠 원판(코발트 면)이 없고, 상단 바 20px 아래에 26/35 굵은 먹색 제목
    await expect(page.locator('.onboarding-login-mark')).toHaveCount(0);
    const title = page.locator('#login-title');
    expect(await styles(title, ['font-size', 'line-height', 'font-weight', 'color'])).toEqual({
      'font-size': '26px',
      'line-height': '35px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await title.boundingBox())).toBe(20);

    // 준비 중인 공급자 = 공통 비활성(설계서 5.1): 회색 면 + --ink-subtle 글자, 테두리 없음, 모서리 12
    const kakao = page.getByRole('button', { name: /카카오로 계속하기/ });
    for (const provider of [google, kakao]) {
      expect(
        await styles(provider, ['background-color', 'color', 'border-top-color', 'border-top-left-radius']),
      ).toEqual({
        'background-color': 'rgb(243, 244, 245)',
        color: 'rgb(134, 139, 148)',
        'border-top-color': 'rgba(0, 0, 0, 0)',
        'border-top-left-radius': '12px',
      });
    }
    // 데모 = 회색 채움(neutralWeak) + 먹색 글자 — 비활성과 글자 색으로 갈린다
    const demo = page.getByRole('link', { name: '데모 계정으로 둘러보기' });
    expect(await styles(demo, ['background-color', 'color', 'min-height'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(26, 28, 32)',
      'min-height': '52px',
    });

    // 목록 간격 12, 데모 설명은 데모 버튼에 8px 로 붙는다
    const [g, k, d] = [await google.boundingBox(), await kakao.boundingBox(), await demo.boundingBox()];
    expect(gapBetween(g, k)).toBe(12);
    expect(gapBetween(k, d)).toBe(12);
    expect(gapBetween(d, await page.getByText('데모는 시연용입니다', { exact: false }).boundingBox())).toBe(8);

    // 안내 상자 = Callout: 회색 면 · 모서리 10 · 왼쪽 띠 없음, 앞에 20px 먹색 아이콘. 문장은 그대로
    const callout = page.locator('.medical-callout');
    expect(
      await styles(callout, ['background-color', 'border-top-left-radius', 'border-left-width']),
    ).toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-left-radius': '10px', 'border-left-width': '0px' });
    const icon = callout.locator('.medical-callout-icon');
    expect((await styles(icon, ['color'])).color).toBe('rgb(26, 28, 32)');
    expect((await icon.locator('svg').boundingBox()).width).toBe(20);
    await expect(callout).toHaveAttribute('role', 'note');
    await expect(callout).toHaveText('로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.');
  });

  for (const [code, langName] of [
    ['ko', '한국어'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['zh', '中文'],
  ]) {
    test(`320px ${code} — 공급자 이름이 한 줄로 남고 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      const disabled = page.locator('.onboarding-login-methods button[aria-disabled="true"]');
      await expect(disabled).toHaveCount(2);
      for (const button of await disabled.all()) {
        // 이름은 한 줄(24px). 배지가 옆에 들어가지 않으면 이름 아래로 내려간다
        const label = await button.locator('span').first().boundingBox();
        const badge = await button.locator('.badge').boundingBox();
        expect(Math.round(label.height)).toBe(24);
        expect(badge.x).toBeGreaterThanOrEqual(0);
        expect(badge.x + badge.width).toBeLessThanOrEqual(320);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
  }

  test('로그인된 상태 — 그림자 카드 없이 상태 줄과 [계속하기][로그아웃], 접근성 위반 0', async ({ page }) => {
    await loginDemo(page, '/login');
    const signed = page.locator('.onboarding-login-signed');
    await expect(signed).toBeVisible();
    expect(await styles(signed, ['box-shadow', 'border-top-width', 'background-color'])).toEqual({
      'box-shadow': 'none',
      'border-top-width': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // 상태 글자는 먹색, 초록은 체크 아이콘에만
    const status = page.locator('#login-signed');
    expect((await styles(status, ['color'])).color).toBe('rgb(26, 28, 32)');
    expect((await styles(status.locator('svg'), ['color'])).color).toBe('rgb(17, 105, 58)');
    // 코발트는 주 버튼 하나, 로그아웃은 회색 채움
    const next = page.getByRole('link', { name: '계속하기' });
    const logout = page.getByRole('button', { name: '로그아웃' });
    expect((await styles(next, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
    expect((await styles(logout, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    expect(gapBetween(await next.boundingBox(), await logout.boundingBox())).toBe(12);
    await expectNoAxeViolations(page, '로그인된 /login');
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-login.spec.js
```

Expected: FAIL이 나야 한다.
- 첫 테스트는 `.onboarding-login-mark`가 1개라 실패한다.
- `320px en` 테스트는 'Continue with Google' 이름 줄 높이가 `24`가 아니다(두 줄이라 `48`).
- 로그인된 상태 테스트는 `box-shadow`가 `none`이 아니다(`.onboarding-card` 그림자).
- ko·ja·zh 320px 테스트는 지금도 통과할 수 있다. 이 셋은 바뀐 뒤 깨지지 않는지를 지키는 테스트다.

- [ ] **Step 3: `info` 아이콘 (`components/ui/Icon.js`)**

`lock: ( … ),` 항목 바로 뒤에 더한다.

```js
  // 안내 상자(SEED Callout) 앞 아이콘 — 원 + i
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.01" />
    </>
  ),
```

- [ ] **Step 4: 공용 모양 (`app/globals.css`)**

4-a. `.medical-callout { … }` 규칙 바로 뒤에 더한다.

```css
/* 아이콘이 붙은 안내 상자 — 앞에 20px 아이콘 칸(상태 배너와 같은 짝), 원판 없이 먹색, 글자와 8px.
   아이콘 칸 높이 = 첫 줄 높이(22px) — 아이콘이 첫 줄 가운데에 선다 */
.medical-callout.has-icon {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
}
.medical-callout-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: var(--lh-body);
  color: var(--ink);
}
```

4-b. `/* 소셜 로그인 — …` 주석부터 `.btn-google:hover` 가 든 `@media` 블록 끝까지를 아래로 바꾼다.

```css
/* 소셜 로그인 — 공급자 브랜드 규정을 따르되 톤을 최대한 낮춘다 (AX-219).
   카카오 노랑 위 어두운 글자는 14.3:1, 구글 흰 버튼은 테두리 3.42:1(--line-input)로 경계가 보인다.
   '준비 중' 배지가 이름 옆에 들어가지 않는 폭(320px 영어)에서는 배지가 다음 줄로 내려간다 — 이름이 쪼개지지 않게 */
.btn-kakao,
.btn-google {
  flex-wrap: wrap;
  row-gap: var(--space-1);
}
.btn-kakao {
  background: #fee500;
  color: #191600;
  border-color: #e6cf00;
}
.btn-kakao:active { background: #f2db00; }
.btn-google {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line-input);
}
.btn-google:active { background: var(--pressed); }
@media (hover: hover) and (pointer: fine) {
  .btn-kakao:hover { background: #f2db00; }
  .btn-google:hover { background: var(--pressed); }
}
```

4-c. 아래 규칙을 통째로 지운다. 공통 비활성 `.btn[aria-disabled='true']`(회색 면 + `--ink-subtle` + 테두리 투명)가 대신한다.

```css
/* 자격증명이 없는 공급자 — 버튼을 없애지 않고 비활성으로 남긴다 */
.btn-kakao[aria-disabled='true'],
.btn-google[aria-disabled='true'] {
  background: var(--surface-alt);
  color: var(--ink-soft);
  border-color: var(--line-strong);
  cursor: not-allowed;
}
```

- [ ] **Step 5: 화면 배치 (`app/styles/onboarding.css`)**

5-a. 머리 주석의 로그인 줄을 바꾼다.

```css
 *   - 로그인(/login): 자물쇠 표식 + 제목 → 공급자 버튼 묶음 → 본인 확인 아님 안내
```

위 줄을 아래로 바꾼다.

```css
 *   - 로그인(/login): 제목 → 공급자 버튼 목록(데모는 회색 채움) → 본인 확인 아님 안내(Callout)
```

5-b. 시작 화면 제목 규칙의 선택자에 로그인 제목을 더한다. 규칙 몸통은 그대로 둔다.

```css
/* 화면 제목 (SEED screenTitle 26/35) — 먹색. 코발트는 주 버튼·링크·'오늘'에만. 로그인 제목도 같다 */
.onboarding-hero-title,
.onboarding-login-title {
  font-size: var(--text-display);
  line-height: var(--lh-display);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
```

(기존 주석 `/* 화면 제목 (SEED screenTitle 26/35) — 두 줄 모두 먹색. 코발트는 주 버튼·링크·'오늘'에만 */`을 위 주석으로 바꾼다.)

5-c. `/* ─── 로그인 ─── */` 절 안의 규칙을 모두 아래로 바꾼다. 대상은 `.onboarding-login-hero`부터 `.onboarding-login-signed-title`까지다. 절 제목 줄은 그대로 둔다.

```css
/* SEED ③층 · 설계서 6.2 2번 — 흰 바탕 한 장:
   26px 제목 → 설명 → 로그인 수단(전체 폭 버튼 목록, 데모는 회색 채움) → 안내 Callout.
   상단 바 → 제목 20px 은 main.page 가 준다. 자물쇠 원판(코발트 면)은 두지 않는다 */
.onboarding-login-hero {
  margin-bottom: var(--space-5);
}
/* 제목 줄바꿈은 문구의 \n 을 따른다. h2 기본 아래 여백을 지워 설명과 6px(--gap-text) */
.onboarding-login-title {
  white-space: pre-line;
  margin-bottom: 0;
}
.onboarding-login-methods {
  margin-bottom: var(--space-5);
}
/* 로그인된 상태 — 그림자 카드 없이 흰 바탕 그대로: 상태 줄(초록 체크 + 먹색 굵은 글자) → [계속하기][로그아웃] */
.onboarding-login-signed {
  display: grid;
  gap: var(--gap-component);
  margin-bottom: var(--space-5);
}
.onboarding-login-signed-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink);
}
.onboarding-login-signed-title .ui-icon {
  flex: none;
  color: var(--state-together-ink);
}
```

- [ ] **Step 6: 마크업 (`app/login/page.js`)**

6-a. 히어로에서 자물쇠 원판을 지운다. 아래 네 줄을 지운다.

```jsx
          <span className="onboarding-login-mark" aria-hidden="true">
            <Icon name="lock" size={28} />
          </span>
```

6-b. 로그인된 상태 묶음에서 카드 클래스를 벗긴다.

```jsx
          <section className="onboarding-card onboarding-login-signed" aria-labelledby="login-signed">
```

위 줄을 아래로 바꾼다.

```jsx
          <section className="onboarding-login-signed" aria-labelledby="login-signed">
```

6-c. 데모 버튼과 설명을 한 묶음으로 싼다. `<>`를 `<div className="onboarding-login-demo">`로, `</>`를 `</div>`로 바꾼다. 설명의 `.onboarding-hint`(위 8px)가 버튼에 붙고, 목록 간격 12px은 묶음 바깥에 선다.

```jsx
              {auth?.auth?.demoLogin && (
                // 데모 설명은 데모 버튼에 붙는다(8px) — 목록 간격(12px)과 나눠 어느 버튼의 설명인지 보이게
                <div className="onboarding-login-demo">
                  <a className="btn btn-secondary" href={href('demo')}>
                    {t('login.demo')}
                  </a>
                  <p className="onboarding-hint">{t('login.demoNote')}</p>
                </div>
              )}
```

6-d. 안내 상자에 아이콘 칸을 둔다.

```jsx
        <div className="medical-callout" role="note">
          {t('login.notIdentityCheck')}
        </div>
```

위 부분을 아래로 바꾼다.

```jsx
        <div className="medical-callout has-icon" role="note">
          <span className="medical-callout-icon" aria-hidden="true">
            <Icon name="info" size={20} />
          </span>
          <p>{t('login.notIdentityCheck')}</p>
        </div>
```

6-e. 파일 머리 주석의 `// 로그인 (AX-219 · ADR-0004 · AX-314 새 디자인)` 줄 아래에 한 줄을 더한다.

```js
// SEED ③층(설계서 6.2 2번): 26px 제목 → 로그인 수단 목록(데모는 회색 채움) → 안내 Callout. 자물쇠 원판은 두지 않는다.
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-login.spec.js e2e/login.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/guardian.spec.js e2e/responsive.spec.js e2e/design-board-components.spec.js
```

Expected: PASS. `screen-login` 6건과 기존 여섯 파일이 모두 통과해야 한다. axe 위반이 나오면 값을 바꾸거나 테스트를 느슨하게 하지 말고, 멈추고 보고한다.

- [ ] **Step 8: 문서 두 줄**

8-a. `docs/platform/DESIGN_SYSTEM.md` 부품 표에서 `| 클래스 \`.ui-switch\` · …` 행 바로 아래에 한 행을 더한다.

```markdown
| 클래스 `.medical-callout` · `.has-icon` | — | 일반 안내 상자(SEED Callout · neutral): 회색 면·모서리 10·16/22, 왼쪽 띠 없음, `role="note"`. `.has-icon`이면 앞에 20px 먹색 아이콘 칸(`.medical-callout-icon` — 첫 줄 가운데, 글자와 8px)을 두고 글자는 `<p>`에 넣는다. 기본 아이콘은 `info`(원 + i) |
```

8-b. `docs/tracking/status.md`의 `- SEED 적용 ③층 1/15 시작 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 2/15 로그인 화면: 제목 26/35 먹색(자물쇠 원판 삭제), 준비 중 공급자는 공통 비활성 모양 + 좁은 폭에서 배지 줄바꿈, 데모 설명을 버튼에 붙임, 안내 상자 아이콘(`.medical-callout.has-icon`·`info`), 로그인된 상태 카드 제거 — 계획서 `docs/superpowers/plans/2026-09-28-seed-layer3-02-login.md`
```

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이고, e2e는 80건이다(시간대에 따라 1건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 10: 커밋**

```bash
git add app/login/page.js app/styles/onboarding.css app/globals.css components/ui/Icon.js e2e/screen-login.spec.js docs/platform/DESIGN_SYSTEM.md docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(login): 로그인 화면을 SEED 배치로 — 제목·로그인 수단·안내 상자

- 자물쇠 원판(코발트 면)을 지우고 제목을 26/35 굵은 먹색으로(시작 화면 제목과 같은 규칙).
- 준비 중인 공급자는 공통 비활성(회색 면·--ink-subtle·테두리 없음) — 데모(회색 채움·먹색)와 글자로 갈린다.
  배지가 이름 옆에 안 들어가는 폭(320px 영어)에서는 배지를 다음 줄로 내려 이름이 쪼개지지 않게.
- 데모 설명을 데모 버튼에 8px 로 붙이고, 구글 버튼 눌림을 --pressed 로.
- 안내 상자에 아이콘 칸(.medical-callout.has-icon · 새 info 아이콘 20px). 문장·role 은 그대로.
- 로그인된 상태는 그림자 카드 없이 상태 줄(초록 체크 + 먹색 글자) → [계속하기][로그아웃].

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1:** 이 계획을 시작할 때의 커밋(작업 전)과 Task 1 뒤 커밋(작업 후)을 각각 빌드한다. 작업 공간 `evidence/`(git 제외)에 `/login`을 전체 캡처한다. 끝나면 브랜치로 돌아온다.
  - 360px·320px × ko·en·ja·zh
  - 360px 한국어의 오류 상태(`?error=cancelled`)
  - 로그인된 상태(360px 한국어, 320px 영어)
  - 언어는 브라우저 로캘(`ko-KR`·`en-US`·`ja-JP`·`zh-CN`)로 바꾼다.
- [ ] **Step 2:** 비교 장면을 보여 준다.
  - 360px 한국어는 전후를 나란히 둔다.
  - 320px 네 언어의 첫 화면은 한 장에 모은다.
  - 오류와 로그인된 상태도 한 장에 모은다.
  - 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3:** 운영자 확인을 받는다. 승인 전에는 ③층 3번(체류 설정)을 시작하지 않는다.
