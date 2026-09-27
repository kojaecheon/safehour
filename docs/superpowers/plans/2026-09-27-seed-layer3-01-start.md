# SEED ③층 1/15 — 시작 화면(`/`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시작 화면을 설계서 6.2 1번 배치(흰 바탕: 그림 → 26px 제목 → 설명 → 언어 선택 Select Box → 고지 3종 Callout → 하단 바 [긴급][시작하기])로 바꾸고, 320px 네 언어에서 하단 바 두 버튼이 한 줄에 들어가게 한다.

**Architecture:** 마크업은 거의 그대로 두고 `app/styles/onboarding.css`의 시작 화면 규칙을 ②층 부품 모양(Select Box·Callout)과 같은 토큰으로 바꾼다. 하단 바의 긴급 버튼만 `EmergencyButton`에 새 `short` 표시(하단 내비와 같은 짧은 글자, 읽히는 이름은 온전하게)를 더해 쓴다. 새 화면 테스트 `e2e/screen-start.spec.js`가 계산된 모양과 320px 네 언어의 버튼 높이를 먼저 실패하게 잰다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md` — 6.1(규칙), 6.2 1번 행, 5.3(Select Box), 5.6(Callout), 5.10(②층에서 정한 것). ②층 계획 `docs/superpowers/plans/2026-09-26-seed-layer2-components.md` 끝 '③층으로 넘기는 것'.

## Global Constraints

- 새 패키지 설치 금지. `package.json`·`package-lock.json`을 수정하지 않는다. `npx`로 새 도구를 내려받지 않는다.
- 토큰 정본은 `app/globals.css` `:root` 한 곳. 기능 스타일(`app/styles/*.css`)에 hex 색·새 글자 크기를 쓰지 않는다.
- 문구는 `src/i18n/messages/`에만, 4개 언어 모두. 이 계획은 새 문구를 만들지 않는다(기존 `common.navEmergency`·`common.emergency`를 쓴다).
- 대비: 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA). 본문 16px 이상, 터치 44px 이상, 상태는 색 + 문구 + 아이콘. 320–1280px 가로 스크롤 없음.
- 코발트(`--accent`)는 화면당 주 버튼 하나·링크·'오늘' 표시에만. '선택됨'은 진한 테두리 + 체크 + 굵기(설계서 5.3·5.10 — 선택지 테두리는 `--line-input` 3:1).
- 눌림은 면 색만(`--pressed*`), 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만.
- 안전 문구(고지 3종·면책)는 두 언어 병기를 그대로 둔다. 문장·순서·역할을 바꾸지 않는다.
- 화면 테스트는 역할·이름으로 찾는 기존 단언을 고치지 않는다(`e2e/accessibility.spec.js`의 시작 화면 키보드 테스트, `e2e/core-flow.spec.js`의 '시작하기' 링크, `e2e/offline.spec.js`의 '긴급 연락' 이름).
- 커밋은 로컬에만. 한국어 메시지, 끝에 `Co-Authored-By:` 한 줄(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- 관문: `npm run lint` · `npm test` · `npm run build` · `npm run e2e` 모두 exit 0(build 뒤에 e2e). 지금 e2e 68건 → 이 계획 뒤 73건. `e2e/demo-events.spec.js` 한 건은 시간대에 따라 일부러 건너뛴다.

## 이 계획이 정한 것

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 하단 바 두 버튼 폭 | 6.1 보조와 주 버튼을 나란히 두면 3:7 | 긴급은 내용 폭, 시작하기가 남는 폭 | 긴급은 채운 안전 버튼이라 3:7의 '보조'가 아니다. 30% 폭(96px)에는 '긴급 연락'이 들어가지 않는다 |
| 하단 바 긴급 글자 | — | 하단 내비와 같은 짧은 글자(`common.navEmergency`: 긴급·SOS·緊急·紧急), 읽히는 이름은 '긴급 연락' | 320px 영어에서 'Emergency'를 다 적으면 'Get started'가 줄바꿈된다(약 6px 부족). 짧은 글자가 긴 이름에 들어 있지 않은 언어(en)는 '짧은 · 긴' 이름을 함께 읽혀 라벨 규칙(WCAG 2.5.3)을 지킨다 |
| 제목 둘째 줄 | — | 코발트 → 본문 먹색 | 코발트는 주 버튼·링크·'오늘'에만(설계서 2장 결정) |
| 그림 틀 모서리 | 4.4 그림 틀 `--radius-8` | `--radius-8` | 설계서 그대로 |
| 면책 상자(`SafetyNote`) | 5.6 일반 안내 상자 | 회색 면 · 모서리 10 · 왼쪽 띠 없음 | 같은 부품이 `/login`·`/onboarding`에도 나온다 — 그 화면들도 함께 바뀐다(같은 모양이 맞다) |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/styles/onboarding.css` | 시작·로그인·체류 설정 화면 배치 | 공통의 `.onboarding-safety`, 시작 화면 절 전체 |
| `app/page.js` | 시작 화면 | 고지 아이콘 20px, 하단 바 긴급 `short` |
| `components/ui/EmergencyButton.js` | 긴급 버튼 | 새 `short` 표시 |
| `e2e/screen-start.spec.js` | **새** ③층 시작 화면 모양 테스트 | 만든다 |
| `docs/platform/DESIGN_SYSTEM.md` · `docs/tracking/status.md` | 문서 | 한 줄씩 |

---

### Task 1: 시작 화면 — 제목·언어 선택·고지·면책·하단 바

**Files:**
- Create: `e2e/screen-start.spec.js`
- Modify: `app/styles/onboarding.css` (`/* 안전 문구 병기 … */` 절, `/* ── 시작 화면 ── */` 절의 `.onboarding-hero`부터 `.onboarding-footer-note`까지)
- Modify: `app/page.js`, `components/ui/EmergencyButton.js`
- Modify: `docs/platform/DESIGN_SYSTEM.md` (7장 한 문장), `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes: ②층 토큰(`--lh-display`·`--lh-article`·`--lh-body`·`--gap-text`·`--gap-component`·`--radius-8|10|12`·`--pressed`·`--line-input`·`--line-contrast`)
- Produces: `EmergencyButton`의 `short?: boolean` — 보이는 글자를 `common.navEmergency`로, 읽히는 이름은 `common.emergency`(짧은 글자가 들어 있지 않으면 `짧은 · 긴`). ③층 다른 화면의 좁은 바도 쓸 수 있다.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-start.spec.js`)**

```js
// ③층 시작 화면(/) — SEED 화면 배치 (설계서 6.1 · 6.2 1번)
//
// 흰 바탕 한 장: 그림 → 26px 제목 → 설명 → 언어 선택(Select Box) → 고지 3종(Callout) → 하단 바 [긴급][시작하기].
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32) · --line-input rgb(134, 139, 148) ·
// --surface-alt rgb(243, 244, 245).

import { test, expect } from './fixtures.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

test.describe('③층 시작 화면 — SEED 배치', () => {
  test('제목·언어 선택·고지·면책이 SEED 모양이다', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(0, 0);

    // 26/35 굵게, 두 줄 모두 먹색(코발트 아님). 그림 틀 모서리 8
    const title = page.locator('#home-title');
    expect(await styles(title, ['font-size', 'line-height', 'font-weight', 'color'])).toEqual({
      'font-size': '26px',
      'line-height': '35px',
      'font-weight': '700',
      color: 'rgb(26, 28, 32)',
    });
    expect((await styles(title.locator('span').nth(1), ['color'])).color).toBe('rgb(26, 28, 32)');
    expect(
      (await styles(page.locator('.onboarding-hero-art'), ['border-top-left-radius']))['border-top-left-radius'],
    ).toBe('8px');

    // 언어 선택 = 선택 상자: 52px · 모서리 12. 고른 언어는 2px 진한 테두리 + 굵게, 흰 면 그대로
    const korean = page.getByRole('button', { name: '한국어', exact: true });
    await expect(korean).toHaveAttribute('aria-pressed', 'true');
    expect(
      await styles(korean, [
        'min-height',
        'border-top-left-radius',
        'border-top-color',
        'box-shadow',
        'background-color',
        'font-weight',
      ]),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(26, 28, 32)',
      'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
      'background-color': 'rgb(255, 255, 255)',
      'font-weight': '700',
    });
    const english = page.getByRole('button', { name: 'English', exact: true });
    expect(await styles(english, ['border-top-color', 'font-weight'])).toEqual({
      'border-top-color': 'rgb(134, 139, 148)',
      'font-weight': '500',
    });

    // 고지 3종 = 안내 상자: 회색 면 · 모서리 10 · 그림자·테두리 없음, 아이콘은 원판 없이 먹색
    const notices = page.locator('.onboarding-notice');
    await expect(notices).toHaveCount(3);
    for (const notice of await notices.all()) {
      expect(
        await styles(notice, ['background-color', 'border-top-left-radius', 'box-shadow', 'border-top-width']),
      ).toEqual({
        'background-color': 'rgb(243, 244, 245)',
        'border-top-left-radius': '10px',
        'box-shadow': 'none',
        'border-top-width': '0px',
      });
    }
    expect(await styles(page.locator('.onboarding-notice-icon').first(), ['background-color', 'color'])).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
      color: 'rgb(26, 28, 32)',
    });

    // 면책 = 안내 상자: 왼쪽 띠 없이 회색 면 · 모서리 10
    expect(
      await styles(page.locator('.onboarding-footer-note'), [
        'background-color',
        'border-left-width',
        'border-top-left-radius',
      ]),
    ).toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-left-width': '0px', 'border-top-left-radius': '10px' });
  });

  for (const [code, langName, start] of [
    ['ko', '한국어', '시작하기'],
    ['en', 'English', 'Get started'],
    ['ja', '日本語', 'はじめる'],
    ['zh', '中文', '开始使用'],
  ]) {
    test(`320px ${code} — 하단 바의 긴급·시작하기가 한 줄(52px)에 들어간다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await page.getByRole('button', { name: langName, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      const bar = page.locator('.onboarding-cta-row');
      const startLink = bar.getByRole('link', { name: start });
      const emergency = bar.locator('.ui-emergency');
      expect(Math.round((await startLink.boundingBox()).height)).toBe(52);
      expect(Math.round((await emergency.boundingBox()).height)).toBe(52);
      if (code === 'ko') {
        // 보이는 글자는 짧아도 읽히는 이름은 온전하다
        await expect(bar.getByRole('link', { name: '긴급 연락' })).toBeVisible();
      }
    });
  }
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-start.spec.js
```

Expected: FAIL — 첫 테스트는 제목 `line-height`가 `35px`가 아니다(지금 `34.58px` 안팎), 영어 320px 테스트는 '시작하기' 높이가 `52`가 아니다(줄바꿈으로 더 크다).

- [ ] **Step 3: 긴급 버튼에 `short` 표시 (`components/ui/EmergencyButton.js`)**

3-a. 머리 주석의 마지막 줄(`//     떠 있으면 언어 선택 칸 같은 누를 수 있는 요소를 덮는다.`) 아래에

```js
//   - `short` 는 좁은 한 줄(시작 화면 하단 바)에서 보이는 글자를 하단 내비와 같은 짧은 이름으로 줄인다('긴급'·'SOS').
//     읽히는 이름은 온전하게 둔다. 짧은 글자가 긴 이름에 들어 있지 않은 언어(en 'SOS')는 '짧은 · 긴' 으로 함께
//     읽혀 보이는 글자와 읽히는 이름이 어긋나지 않게 한다(WCAG 2.5.3).
```

3-b. 함수 본문 전체를

```jsx
export default function EmergencyButton({ current = false, preview = false, docked = false, short = false }) {
  const { t } = useLang();
  const full = t('common.emergency');
  const visible = short ? t('common.navEmergency') : full;
  const spokenName = short ? (full.includes(visible) ? full : `${visible} · ${full}`) : undefined;
  return (
    <Link
      href="/emergency"
      className={`ui-emergency${preview ? ' is-preview' : ''}${docked ? ' is-docked' : ''}`}
      aria-current={current ? 'page' : undefined}
      aria-label={spokenName}
    >
      <Icon name="phone" size={22} strokeWidth={2.2} />
      <span>{visible}</span>
    </Link>
  );
}
```

- [ ] **Step 4: 시작 화면 마크업 두 곳 (`app/page.js`)**

4-a. 고지 아이콘

```jsx
        <Icon name={icon} size={22} />
```
→
```jsx
        <Icon name={icon} size={20} />
```

4-b. 하단 바 긴급

```jsx
            <EmergencyButton docked />
```
→
```jsx
            <EmergencyButton docked short />
```

그리고 하단 바 주석 끝(`바 안에 넣으면 덮는 것이 없고 둘 다 늘 닿는다. 셸은 이 경로에서 떠 있는 버튼을 그리지 않는다. */}`)의 앞 줄에 `            긴급은 하단 내비와 같은 짧은 글자로 보여 320px 에서도 두 버튼이 한 줄에 들어간다(읽히는 이름은 온전하다).`를 더한다.

- [ ] **Step 5: 안전 문구 상자 (`app/styles/onboarding.css`)**

`/* 안전 문구 병기 — 주 언어 한 줄 + 병기 언어 한 줄. 병기 줄도 16px·대비 유지(투명도 감산 금지) */` 주석과 `.onboarding-safety { … }`, `.onboarding-safety p { … }` 두 규칙을 아래로 바꾼다(`.onboarding-safety .onboarding-secondary`는 그대로).

```css
/* 안전 문구 병기 (SEED Callout · neutral) — 왼쪽 띠 없이 회색 면 · 모서리 10.
   주 언어 한 줄 + 병기 언어 한 줄. 병기 줄도 16px·대비 유지(투명도 감산 금지).
   시작·로그인·체류 설정이 같은 상자(SafetyNote)를 쓴다 */
.onboarding-safety {
  margin: var(--space-4) 0;
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
.onboarding-safety p {
  font-size: var(--text-body);
  line-height: var(--lh-article);
  color: var(--ink);
}
```

- [ ] **Step 6: 시작 화면 절 (`app/styles/onboarding.css`)**

`/* ───────────────────────── 시작 화면 ───────────────────────── */` 줄 아래의 `.onboarding-hero {`부터 `.onboarding-footer-note { … }`까지를(아래 `/* ── 로그인 ── */`은 그대로) 통째로 바꾼다.

```css
/* SEED ③층 · 설계서 6.2 1번 — 흰 바탕 한 장:
   그림 → 26px 제목 → 설명 → 언어 선택(Select Box) → 고지 3종(Callout) → 하단 바 [긴급][시작하기].
   상단 바 → 첫 요소 20px 은 main.page 가 준다 */
.onboarding-hero {
  padding-top: 0;
}
.onboarding-hero-art {
  aspect-ratio: 16 / 9;
  margin-bottom: var(--space-5);
  border-radius: var(--radius-8);
  overflow: hidden;
  background: var(--art-sky);
}
.onboarding-art {
  width: 100%;
  height: 100%;
}
/* 화면 제목 (SEED screenTitle 26/35) — 두 줄 모두 먹색. 코발트는 주 버튼·링크·'오늘'에만 */
.onboarding-hero-title {
  font-size: var(--text-display);
  line-height: var(--lh-display);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
.onboarding-hero-title > span {
  display: block;
}
.onboarding-hero-lead {
  margin-top: var(--gap-text);
  font-size: var(--text-body);
  line-height: var(--lh-article);
  color: var(--ink-soft);
}

/* 언어 선택 (SEED Select Box) — 2열(넓으면 4열). 52px · 모서리 12 · 테두리는 선택지 경계라 3:1(--line-input).
   고른 언어: 2px 진한 테두리 + 체크 아이콘 + 굵게 — 코발트 대신 중립, 색 단독이 아니다 */
.onboarding-lang-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.onboarding-lang-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--line-input);
  border-radius: var(--radius-12);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-medium);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.onboarding-lang-option:active {
  background: var(--pressed);
}
@media (hover: hover) and (pointer: fine) {
  .onboarding-lang-option:hover { background: var(--pressed); }
}
.onboarding-lang-option[aria-pressed='true'] {
  border-color: var(--line-contrast);
  box-shadow: inset 0 0 0 1px var(--line-contrast);
  font-weight: var(--weight-bold);
}
.onboarding-lang-check {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
}

/* 고지 3종 (SEED Callout · neutral) — 회색 면 · 모서리 10 · 아이콘 20px(원판 없이 먹색).
   두 언어 병기는 점선 아래 — 안전 문구라 16px·대비를 그대로 둔다 */
.onboarding-notices {
  list-style: none;
  display: grid;
  gap: var(--gap-component);
  margin-top: var(--space-3);
}
.onboarding-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
/* 아이콘 칸 높이 = 제목 첫 줄 높이(22px) — 아이콘이 제목 줄 가운데에 선다 */
.onboarding-notice-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: var(--lh-body);
  color: var(--ink);
}
.onboarding-notice-title {
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink);
}
.onboarding-notice-text p {
  margin-top: var(--space-1);
  font-size: var(--text-body);
  line-height: var(--lh-article);
}
.onboarding-notice-secondary {
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--line-strong);
}
.onboarding-notice-secondary strong {
  font-weight: var(--weight-bold);
}

.onboarding-cta {
  margin-top: var(--space-6);
}
/* 하단 바 — 불투명 흰 면 + 1px 윗선(하단 내비와 같은 처리). 그라데이션은 뒤의 언어 칸이 비쳐 보인다 */
.onboarding-cta.sticky-return {
  background: var(--bg);
  border-top: 1px solid var(--line-strong);
}
/* 하단 바 한 줄 — 긴급(내용 폭, 짧은 글자) + 시작하기(남는 폭). 320px 네 언어에서 둘 다 52px 한 줄이다 */
.onboarding-cta-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.onboarding-cta-row .btn {
  flex: 1;
  min-width: 0;
}
.onboarding-footer-note {
  margin-top: var(--space-5);
}
```

(`@media (min-width: 420px)`의 `.onboarding-lang-grid`·`.onboarding-lang-option` 넓은 화면 규칙은 파일 끝에 그대로 둔다.)

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-start.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/responsive.spec.js e2e/offline.spec.js
```

Expected: PASS — `screen-start` 5건과 기존 네 파일 모두 통과.

- [ ] **Step 8: 문서 두 줄**

8-a. `docs/platform/DESIGN_SYSTEM.md` 7장, `긴급 빨강 채움 + 전화 아이콘 + '긴급 연락', 큰 CTA 모양(52px·모서리 12).` 문장 바로 뒤에 한 문장을 더한다:
`좁은 한 줄(시작 화면 하단 바)에서는 \`EmergencyButton short\`로 하단 내비와 같은 짧은 글자('긴급'·'SOS')를 보이고, 읽히는 이름은 '긴급 연락'으로 둔다(짧은 글자가 들어 있지 않은 언어는 '짧은 · 긴' 이름).`

8-b. `docs/tracking/status.md` — `- SEED 적용 ②층(부품): …` 줄 바로 아래에:
`- SEED 적용 ③층 1/15 시작 화면: 제목 26/35 먹색, 언어 선택 Select Box, 고지 3종·면책 Callout, 하단 바 긴급 짧은 글자(320px 네 언어 한 줄) — 계획서 \`docs/superpowers/plans/2026-09-27-seed-layer3-01-start.md\``

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 73건(시간대에 따라 1건 skip). axe 위반이 나오면 값을 바꾸지 말고 멈추고 보고한다.

- [ ] **Step 10: 커밋**

```bash
git add app/page.js app/styles/onboarding.css components/ui/EmergencyButton.js e2e/screen-start.spec.js docs/platform/DESIGN_SYSTEM.md docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(start): 시작 화면을 SEED 배치로 — 제목·언어 선택·고지·하단 바

- 제목 26/35 굵게 두 줄 모두 먹색(코발트는 주 버튼·링크·'오늘'에만), 그림 틀 모서리 8.
- 언어 선택은 Select Box: 52px·모서리 12, 고른 언어는 2px 진한 테두리 + 체크 + 굵게.
- 고지 3종과 면책은 Callout: 회색 면·모서리 10, 아이콘은 원판 없이 20px. 두 언어 병기는 그대로.
- 하단 바 긴급은 하단 내비와 같은 짧은 글자(읽히는 이름은 온전) — 320px 네 언어에서 두 버튼이 한 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1:** 이 계획을 시작할 때의 커밋(작업 전)과 Task 1 뒤 커밋(작업 후)을 각각 빌드해 `/`을 360px·320px × ko·en·ja·zh로 전체 캡처한다(작업 공간 `evidence/`, git 제외). 언어는 시작 화면의 언어 버튼을 눌러 바꾼다. 끝나면 브랜치로 돌아온다.
- [ ] **Step 2:** 360px 한국어와 320px 영어를 전후로 나란히 보여 주고, 나머지는 한 장에 모아 보여 준다. 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3:** 운영자 확인을 받는다. 승인 전에는 ③층 2번(로그인)을 시작하지 않는다.
