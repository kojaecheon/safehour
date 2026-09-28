# SEED ③층 3/15 — 체류 설정 화면(`/onboarding`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체류 설정 5단계를 설계서 6.2 3번 배치로 바꾼다: 흰 바탕 한 장, 단계 표시 → 26px 단계 제목 → Field 묶음 → 하단 고정 [이전 3][다음 7]. 코발트는 주 버튼('다음'·'저장')에만 남긴다. 입력 오류는 설계서 5.2의 긴급 빨강 + 아이콘으로 바꾼다.

**Architecture:** 동작·검증 규칙(`components/onboarding/draft.js`)은 그대로 두고 표시만 바꾼다.
- `app/styles/onboarding.css`: 체류 설정 절을 ②층 부품 모양(Select Box·Chip·Callout·Action Button)과 같은 토큰으로 다시 쓴다.
- JSX: 조금만 고친다. 하단 바 클래스, 삭제·검색 버튼 변형, 면책 상자·오류 문장·오류 요약의 아이콘 칸이다.
- `Icon`: 오류용 `alert`를 하나 더한다.
- 태스크 셋이 새 화면 테스트 `e2e/screen-onboarding.spec.js`에 한 묶음씩 더한다.
  1. 단계 머리와 하단 바
  2. 입력 묶음
  3. 오류 표시

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 6.1(규칙), 6.2 3번 행
- 5.1(버튼 — 채운 강조 버튼 화면당 하나), 5.2(입력·오류), 5.3(Chip·Select Box), 5.6(Callout), 5.9(아이콘), 5.10
- ②층 계획 `docs/superpowers/plans/2026-09-26-seed-layer2-components.md` 끝 '③층으로 넘기는 것': 1(독립 조용한 버튼), 3(zh '上一步' 줄바꿈), 9(`.onboarding-chip` 코발트·`:focus-within`)
- 시작 화면 계획 Ruling 8: 면책 상자 아이콘

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 수정하지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색·새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만, 4개 언어 모두 둔다. 이 계획은 새 문구를 만들지 않는다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1이다(WCAG 2.1 AA).
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘(또는 모양)으로 보인다.
  - 320–1280px에서 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 이 화면에서는 하단 바의 주 버튼('다음' 또는 '저장') 하나와 키보드 초점 링에만 쓴다.
- **선택 표시:** '선택됨'은 진한 테두리 또는 `--selected` 채움 + 체크 + 굵기로 보인다(설계서 5.3·5.10 — 선택지 테두리는 `--line-input` 3:1).
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 문구:** 면책 상자 두 개(`onboarding.deletionNotice` 삭제 안내, `onboarding.appointmentNotice` 일정 안내)는 두 언어 병기를 그대로 둔다. 문장·순서·`role="note"`를 바꾸지 않는다.
- **표시만 바꾼다:**
  - 검증·저장·단계 이동 규칙(`draft.js`, `OnboardingForm.js`의 `next`·`save`·`goTo`)은 바꾸지 않는다.
  - 주소 검색은 사용자 검색어 결과만 보인다(병원 목록·추천 없음). 현재 위치를 쓰지 않는다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/accessibility.spec.js`: 체류 설정 5단계 axe와 오류 요약 상태. 라벨로 채운다.
  - `e2e/core-flow.spec.js`: 시작 → 로그인 → 체류 설정 흐름.
  - `e2e/editing.spec.js`: 수정 흐름.
  - `e2e/responsive.spec.js`: `/onboarding?edit=1` 200% 글자.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다. e2e는 build 뒤에 돌린다.
  - e2e는 지금 80건 → Task 1 뒤 83건 → Task 2 뒤 87건 → Task 3 뒤 89건이 된다.
  - `e2e/demo-events.spec.js` 한 건은 시간대에 따라 일부러 건너뛴다.

## 이 계획이 정한 것

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 단계 표시 | 6.2 3번 '단계 표시' | 지금 단계는 `--selected` 채움 + 흰 숫자(40px), 지난 단계는 흰 원 + 먹색 체크로 둔다. 코발트와 번짐 그림자를 없앤다 | 코발트는 주 버튼에만 쓴다. 체크·채움·실선·파선 모양이 서로 달라 색 단독이 아니다 |
| 하단 바 | 6.1 흐름을 끝내는 버튼은 하단 고정 바, 3:7 | `.sticky-return`로 하단 긴급 바 바로 위에 고정한다. 3:7, 사이 8px, '이전' 좌우 여백 12px | 320px zh에서 '上一步'가 30% 칸(84px)에 한 줄로 들어가게 한다(②층 넘김 3) |
| 긴급 자리 | 6.1 긴급은 늘 바닥 | 하단 긴급 바는 맨 아래 그대로, 이전/다음 바는 그 위 | 버튼 셋을 한 줄에 나란히 두지 않는다(5.1) |
| 초점 가림 | — | 이 화면에서만 `html`의 `scroll-padding-bottom`을 160px로 둔다 | 두 고정 바(약 146px)가 키보드 초점이 간 입력칸을 덮지 않게 한다 |
| 입력 묶음 | 6.2 'Field 묶음' | 그림자 카드를 벗겨 흰 바탕 그대로 둔다. 묶음 사이 32px, 묶음 이름(18/24 굵게)이 머리다. 병원이 보낸 일정(읽기만)만 회색 면 상자로 둔다 | 흰 바탕 한 장 화면(6.1)에 카드가 겹겹이면 구역이 여럿으로 보인다. 읽기만 하는 일정은 입력 묶음과 달라 보여야 한다 |
| 삭제 버튼 | ②층 넘김 1 | 조용한 버튼 → 작은 회색 버튼(`secondary` · `small`) | 바탕 없는 글자는 버튼으로 보이지 않는다(②층 운영자 확인에서 정함) |
| 주소 검색 버튼 | 5.1 채운 강조 버튼은 화면당 하나 | 작은 주 버튼 → 작은 회색 버튼 | 그대로 두면 '다음'과 함께 코발트 버튼이 둘이 된다 |
| 고른 주소 | 5.3 Select Box 고른 칸 | 코발트 테두리·왼쪽 띠·옅은 파란 면을 흰 면 + 2px 진한 테두리로 바꾼다. 캡션은 먹색 | 코발트 쓰임을 줄이고, 고른 것은 진한 테두리로 보인다 |
| 박 수 | — | 코발트 알약 → 굵은 먹색 글자 한 줄 | 누르는 것이 아닌데 44px 알약이라 버튼처럼 보였다 |
| 관심사 칩 | 5.3 Chip outlineWeak, ②층 넘김 9 | 답 칩과 같은 모양이다. 고르면 진한 테두리 + 회색 면 + 체크 + 굵게. 링은 키보드 초점에만 뜬다(`:has(input:focus-visible)`) | 코발트 선택 표시를 없앤다. 마우스로 눌러도 링이 뜨던 문제를 고친다 |
| 면책 상자 아이콘 | 5.6 Callout 아이콘, 시작 화면 Ruling 8 | `SafetyNote` 앞에 `info` 20px 먹색을 둔다. 시작 화면 면책 상자에도 나온다 | 같은 부품이다 |
| 예상 종료 상자 | 5.6 판정·추정 출처는 Callout 모양, 점선 유지 | 모서리 12 → 10 | 점선·회색 면·'추정' 배지는 그대로 둔다(출처 구분) |
| 입력 오류 | 5.2 오류는 2px 긴급 빨강 + 문장 아이콘 | 이 화면만 덮던 분홍(`--support-ink`) 오류 테두리를 지워 공통 규칙(긴급 빨강)을 따른다. 문장은 20px `alert` 아이콘 + 16/22 굵은 긴급 빨강, 왼쪽 띠 없음 | 5.10에서 오류 아이콘은 ③층에서 붙이기로 했다. 글자는 16px(SEED 14px)이다. 다음 단계로 못 가는 이유라 본문 하한을 지킨다 |
| 라디오 오류 | — | 라디오 점에 그려지던 네모 그림자를 없애고, 선택지 칸 테두리를 빨강으로 | 분홍 덮기 규칙이 라디오에도 걸려 네모가 그려지던 버그다 |
| 오류 요약 | 5.6 Callout | 분홍 면은 유지한다. 테두리 2px → 1px, 모서리 16 → 10, 안쪽 14/16, 제목 16px 굵게 + `alert` 아이콘, 항목 이름은 먹색 | 요약은 입력칸으로 옮겨 가는 목록이다. 오류 문장(빨강)과 다른 분홍 면으로 둔다 |
| 저장 실패·검색 실패 문장 | — | 왼쪽 띠를 지우고 굵은 긴급 빨강으로 | 오류 문장 모양을 하나로 맞춘다 |
| 새 아이콘 | 5.9 새로 그리는 것은 내비 채움만 | `alert`(원 + 느낌표) 하나를 더한다 | 오류 표시에 맞는 아이콘이 없다. `close`는 '닫기'로 읽힌다 |
| 강제 색상 모드 | ②층 넘김 6, 시작 화면 Ruling 8 | 이 계획에서 하지 않는다 | 스위치·날짜 칩·전환·안내 상자를 함께 보는 일괄 작업이 낫다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/styles/onboarding.css` | 시작·로그인·체류 설정 화면 배치 | 머리 주석, 시작 하단 바 규칙 선택자, 체류 설정 절 전체(Task 1–3이 나눠 고친다) |
| `components/onboarding/OnboardingForm.js` | 체류 설정 본체 | 하단 바 클래스(Task 1) |
| `components/onboarding/LodgingStep.js` · `HospitalStep.js` | 숙소·병원 단계 | 삭제 버튼 변형(Task 2) |
| `components/onboarding/AddressSearch.js` | 주소 검색 | 검색 버튼 변형(Task 2) |
| `components/onboarding/Fields.js` | 입력 칸 묶음 | `SafetyNote` 아이콘(Task 2), `FieldErrors` 아이콘(Task 3) |
| `components/onboarding/ErrorSummary.js` | 오류 요약 | 제목 아이콘(Task 3) |
| `components/ui/Icon.js` | 아이콘 | 새 `alert`(Task 3) |
| `app/globals.css` | 공용 부품 모양 | 라디오 선택지 오류 테두리(Task 3) |
| `e2e/screen-onboarding.spec.js` | **새** ③층 체류 설정 모양 테스트 | Task 1이 만들고 Task 2·3이 한 묶음씩 더한다 |
| `docs/platform/DESIGN_SYSTEM.md` · `docs/tracking/status.md` | 문서 | 한 줄씩(Task 3) |

---

### Task 1: 단계 머리와 하단 고정 바

**Files:**
- Create: `e2e/screen-onboarding.spec.js`
- Modify: `components/onboarding/OnboardingForm.js` (`<div className="onboarding-actions">` 한 줄)
- Modify: `app/styles/onboarding.css`
  - 머리 주석의 체류 설정 줄
  - 시작 화면 제목 규칙의 선택자
  - `.onboarding-cta.sticky-return` 규칙
  - `.onboarding-page`부터 `.onboarding-lead`까지
  - `/* 이전 / 다음 · 저장 */`의 `.onboarding-actions` 두 규칙

**Interfaces:**
- Consumes: ②층 토큰 `--selected`·`--on-dark`·`--pressed`·`--lh-article`·`--gap-text`·`--line-strong`·`--bg`, 전역 `.sticky-return`(고정, `bottom: var(--nav-offset)`), 앱 셸 하단 긴급 바(`.ui-emergency-bar`, 높이 69px)
- Produces: `e2e/screen-onboarding.spec.js`의 공용 도우미
  - `styles(locator, props)`
  - `gapBetween(upper, lower)`
  - `submit(page)`: 하단 바의 제출 버튼을 누른다
  - `fillTravel(page)`: 1단계를 채운다
  - Task 2·3이 이 파일 끝에 `test.describe` 묶음을 더한다.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-onboarding.spec.js`)**

```js
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

    // 두 고정 바가 키보드 초점 칸을 덮지 않게 스크롤 여백을 둔다
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe('160px');

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
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js
```

Expected: 세 건 모두 FAIL.
- 첫 테스트: 지금 단계 `background-color`가 `rgb(10, 92, 255)`(코발트)다. 그 앞의 20px 단언도 16px이라 먼저 실패할 수 있다.
- 둘째 테스트: `position`이 `static`이다.
- 셋째 테스트: '上一步' 높이가 `52`가 아니다(줄바꿈으로 74px 안팎).

- [ ] **Step 3: 하단 바 클래스 (`components/onboarding/OnboardingForm.js`)**

```jsx
          <div className="onboarding-actions">
```

위 줄을 아래로 바꾼다.

```jsx
          {/* 하단 고정 바(설계서 6.1) — 하단 긴급 바 바로 위에 선다. [이전 3][다음 7] */}
          <div className="onboarding-actions sticky-return">
```

- [ ] **Step 4: 화면 배치 (`app/styles/onboarding.css`)**

4-a. 머리 주석의 체류 설정 줄을 바꾼다.

```css
 *   - 체류 설정(/onboarding): 단계 표시 → 단계 제목 → 오류 요약 → 카드형 입력 → 이전/다음
```

위 줄을 아래로 바꾼다.

```css
 *   - 체류 설정(/onboarding): 단계 표시 → 단계 제목 → 오류 요약 → 입력 묶음 → 하단 고정 [이전 3][다음 7]
```

4-b. 시작 화면 제목 규칙의 선택자와 주석을 바꾼다. 규칙 몸통은 그대로 둔다.

```css
/* 화면 제목 (SEED screenTitle 26/35) — 먹색. 코발트는 주 버튼·링크·'오늘'에만. 로그인 제목도 같다 */
.onboarding-hero-title,
.onboarding-login-title {
```

위 부분을 아래로 바꾼다.

```css
/* 화면 제목 (SEED screenTitle 26/35) — 먹색. 코발트는 주 버튼·링크·'오늘'에만. 로그인·체류 설정 단계 제목도 같다 */
.onboarding-hero-title,
.onboarding-login-title,
.onboarding-step-title {
```

4-c. 시작 화면 하단 바 규칙을 체류 설정 하단 바와 함께 쓴다.

```css
/* 하단 바 — 불투명 흰 면 + 1px 윗선(하단 내비와 같은 처리). 그라데이션은 뒤의 언어 칸이 비쳐 보인다 */
.onboarding-cta.sticky-return {
```

위 부분을 아래로 바꾼다.

```css
/* 하단 바(시작 화면·체류 설정) — 불투명 흰 면 + 1px 윗선(하단 내비와 같은 처리). 그라데이션은 뒤의 입력 칸이 비쳐 보인다 */
.onboarding-cta.sticky-return,
.onboarding-actions.sticky-return {
```

4-d. 체류 설정 절의 `.onboarding-page { … }` 규칙부터 `.onboarding-lead { … }` 규칙 끝까지를 모두 아래로 바꾼다. 절 제목 줄 `/* ─── 체류 설정 ─── */`은 그대로 둔다. 바꾸는 범위에는 단계 표시 규칙들과 `.onboarding-step-title` 초점 규칙이 모두 들어간다.

```css
/* SEED ③층 · 설계서 6.2 3번 — 흰 바탕 한 장:
   단계 표시 → 26px 단계 제목 → Field 묶음 → 하단 고정 [이전 3][다음 7].
   상단 바 → 단계 표시 20px 은 main.page 가 준다 */

/* 단계 표시 — 숫자 원 5개. 코발트 없이 모양으로 구분한다:
   체크(지남) · 진한 채움(지금 — SEED '선택됨') · 실선(가 봄) · 파선(아직) */
.onboarding-steps {
  margin-bottom: var(--space-4);
}
.onboarding-steps-count {
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  color: var(--ink-soft);
  margin-bottom: var(--space-2);
}
.onboarding-steps ol {
  list-style: none;
  display: flex;
  gap: var(--space-1);
  align-items: center;
}
.onboarding-steps-item {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}
/* 첫 칸은 앞 연결선이 없으므로 제 폭만 차지한다 — 칸 사이 간격이 고르게 된다 */
.onboarding-steps-item:first-child {
  flex: none;
}
/* 칸 사이 연결선 */
.onboarding-steps-item + .onboarding-steps-item::before {
  content: '';
  flex: 1;
  height: 2px;
  margin-right: var(--space-1);
  background: var(--line-strong);
}
.onboarding-steps-item > button,
.onboarding-steps-item > span {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  font-family: inherit;
  cursor: default;
}
.onboarding-steps-item > button {
  cursor: pointer;
}
.onboarding-steps-mark {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full);
  border: 2px solid var(--line-input);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
}
.onboarding-steps-item.is-upcoming .onboarding-steps-mark {
  border-style: dashed;
  color: var(--ink-soft);
}
.onboarding-steps-item.is-current .onboarding-steps-mark {
  width: 40px;
  height: 40px;
  border-color: var(--selected);
  background: var(--selected);
  color: var(--on-dark);
}
/* 누를 수 있는 칸(지남·가 봄) — 눌림은 면 색만 */
.onboarding-steps-item > button:active .onboarding-steps-mark {
  background: var(--pressed);
}
@media (hover: hover) and (pointer: fine) {
  .onboarding-steps-item > button:hover .onboarding-steps-mark {
    background: var(--pressed);
  }
}

/* 단계 제목 — 크기·굵기·색은 위 화면 제목 규칙(26/35)을 함께 쓴다. h2 기본 아래 여백을 지워 설명과 6px */
.onboarding-step-title {
  margin-bottom: 0;
  /* 초점이 올 때 고정 상단 바에 가리지 않게 */
  scroll-margin-top: 88px;
}
.onboarding-step-title:focus {
  outline: none;
}
.onboarding-step-title:focus-visible {
  outline: var(--focus-width) solid var(--accent);
  outline-offset: 2px;
}
.onboarding-lead {
  margin: var(--gap-text) 0 var(--space-5);
  font-size: var(--text-body);
  line-height: var(--lh-article);
  color: var(--ink-soft);
}
```

4-e. `/* 이전 / 다음 · 저장 */` 주석과 그 아래 `.onboarding-actions { … }`, `.onboarding-actions > .btn:only-child { … }` 두 규칙을 아래로 바꾼다. 뒤의 `.onboarding-readonly`부터는 그대로 둔다.

```css
/* 이전 / 다음 · 저장 — 하단 고정 바(설계서 6.1, 면·윗선은 위 하단 바 규칙). 하단 긴급 바 바로 위에 선다.
   두 버튼은 3:7, 사이 8px. 버튼 셋을 한 줄에 두지 않으려고 긴급은 아래 긴급 바에 그대로 둔다 */
.onboarding-actions {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
  gap: var(--space-2);
}
.onboarding-actions > .btn:only-child {
  grid-column: 1 / -1;
}
/* 30% 칸(320px 에서 84px)에도 '上一步'(zh)가 한 줄로 들어가게 '이전'의 좌우 여백을 12px 로 줄인다 */
.onboarding-actions > .btn-secondary {
  padding-left: var(--space-3);
  padding-right: var(--space-3);
}
/* 두 고정 바(하단 긴급 바 69px + 이 바 77px 안팎)가 키보드 초점이 간 입력 칸을 덮지 않게 */
html:has(.onboarding-actions.sticky-return) {
  scroll-padding-bottom: 160px;
}
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js e2e/screen-start.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/editing.spec.js e2e/responsive.spec.js
```

Expected: PASS. `screen-onboarding` 3건과 기존 다섯 파일이 모두 통과해야 한다. axe 위반이 나오면 값을 바꾸거나 테스트를 느슨하게 하지 말고 멈추고 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add components/onboarding/OnboardingForm.js app/styles/onboarding.css e2e/screen-onboarding.spec.js
git commit -m "$(cat <<'MSG'
style(onboarding): 단계 머리와 하단 고정 바를 SEED 배치로

- 단계 표시에서 코발트를 뺀다: 지금 단계는 --selected 채움 + 흰 숫자, 지난 단계는 흰 원 + 먹색 체크.
- 단계 제목 26/35 먹색(시작·로그인 제목과 같은 규칙), 설명과 6px, 상단 바 아래 20px.
- [이전 3][다음 7]을 하단 긴급 바 바로 위 고정 바로(흰 면 + 1px 윗선, 사이 8px).
  '이전' 좌우 여백 12px — 320px zh '上一步'가 한 줄. 두 고정 바가 초점 칸을 덮지 않게 scroll-padding.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 입력 묶음 — 카드·삭제 버튼·주소 검색·박 수·관심사 칩·면책 상자

**Files:**
- Modify: `e2e/screen-onboarding.spec.js` (도우미 둘, 묶음 하나 추가)
- Modify: `components/onboarding/LodgingStep.js`, `components/onboarding/HospitalStep.js` (삭제 버튼 세 곳)
- Modify: `components/onboarding/AddressSearch.js` (검색 버튼 한 곳)
- Modify: `components/onboarding/Fields.js` (`SafetyNote`, import)
- Modify: `app/styles/onboarding.css`
  - `.onboarding-safety` 규칙
  - `/* 카드 … */` 절에서 `.onboarding-group-title`까지
  - `.onboarding-result` 호버
  - `.onboarding-picked`와 `.onboarding-picked-caption`
  - `.onboarding-estimate` 모서리
  - `.onboarding-tally`
  - 관심사 칩 절

**Interfaces:**
- Consumes:
  - Task 1의 `styles`·`gapBetween`·`submit`·`fillTravel`(같은 테스트 파일)
  - ②층 `Button`의 `variant="secondary"`·`size="small"`, `Icon`의 `info`
  - 답 칩 모양(`app/styles/ui.css` `.ui-answer-option`)과 같은 값
- Produces:
  - `components/onboarding/Fields.js`가 `Icon`을 `../ui/index.js`에서 가져온다. Task 3의 `FieldErrors`도 이 import를 쓴다.
  - 테스트 도우미 `fillLodging(page)`·`fillHospital(page)`

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-onboarding.spec.js`)**

1-a. `fillTravel` 함수 바로 아래에 도우미 둘을 더한다.

```js
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
```

1-b. 파일 끝에 묶음을 더한다.

```js
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
    const cafe = page.locator('label[for="ob-interest-CAFE"]');
    await cafe.click();
    expect(await styles(cafe, ['border-top-color', 'background-color', 'font-weight', 'color', 'outline-style'])).toEqual({
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
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js
```

Expected: 새 묶음 네 건이 FAIL이고, Task 1의 세 건은 PASS여야 한다.
- 첫 건: `box-shadow`가 카드 그림자다.
- 둘째 건: 검색 버튼 면이 `rgb(10, 92, 255)`다.
- 셋째 건: 고른 칩 테두리가 코발트이고 `outline-style`이 `solid`다.
- 넷째 건: 아이콘 `svg`가 0개다.

- [ ] **Step 3: 버튼 변형 (JSX)**

3-a. `components/onboarding/LodgingStep.js`: 숙소 삭제 버튼의 `variant="quiet"`를 `variant="secondary"`로 바꾼다(`size="small"`은 그대로).

```jsx
                <Button variant="secondary" size="small" onClick={() => remove(index)}>
```

3-b. `components/onboarding/HospitalStep.js`: 두 곳의 `variant="quiet"`를 `variant="secondary"`로 바꾼다. `AppointmentCard`의 일정 삭제(`onClick={onRemove}`)와 병원 삭제(`onClick={() => removeHospital(index)}`)다.

```jsx
          <Button variant="secondary" size="small" onClick={onRemove}>
```

```jsx
                  <Button variant="secondary" size="small" onClick={() => removeHospital(index)}>
```

3-c. `components/onboarding/AddressSearch.js`: 검색 버튼에 `variant="secondary"`를 더한다. 채운 강조 버튼은 화면당 '다음' 하나다.

```jsx
        <Button size="small" onClick={() => void run()} disabled={search.phase === 'loading'}>
```

위 줄을 아래로 바꾼다.

```jsx
        <Button variant="secondary" size="small" onClick={() => void run()} disabled={search.phase === 'loading'}>
```

- [ ] **Step 4: 면책 상자 아이콘 (`components/onboarding/Fields.js`)**

4-a. `import { useLang } from '../LanguageProvider.js';` 줄 바로 아래에 더한다.

```js
import { Icon } from '../ui/index.js';
```

4-b. `SafetyNote` 함수 전체를 아래로 바꾼다(위의 JSDoc 주석은 그대로 두고 한 줄을 더한다).

```jsx
/**
 * 안전 문구(고지) 병기 — 주 언어 한 줄 + 병기 언어 한 줄 (spec 4.17).
 * 병기 언어는 useLang().pair() 가 정한다(ja·zh 는 검수 전이면 영어 + 한국어).
 * 앞에 20px 안내 아이콘을 둔다(SEED Callout — 설계서 5.6). 시작 화면 면책 상자도 이 부품이다.
 */
export function SafetyNote({ noticeKey, vars, className = 'onboarding-safety' }) {
  const { pair } = useLang();
  const { primary, secondary } = pair(noticeKey, vars);
  return (
    <div className={className} role="note">
      <span className="onboarding-safety-icon" aria-hidden="true">
        <Icon name="info" size={20} />
      </span>
      <div className="onboarding-safety-text">
        <p lang={primary.lang}>{primary.text}</p>
        <p className="onboarding-secondary" lang={secondary.lang}>
          {secondary.text}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 화면 배치 (`app/styles/onboarding.css`)**

5-a. 공통 절의 안전 문구 병기 주석과 `.onboarding-safety { … }` 규칙을 아래로 바꾼다. 뒤의 `.onboarding-safety p`와 `.onboarding-safety .onboarding-secondary`는 그대로 둔다.

```css
/* 안전 문구 병기 (SEED Callout · neutral) — 왼쪽 띠 없이 회색 면 · 모서리 10, 앞에 20px 안내 아이콘.
   주 언어 한 줄 + 병기 언어 한 줄. 병기 줄도 16px·대비 유지(투명도 감산 금지).
   시작 화면과 체류 설정 단계(여행·병원)가 같은 상자(SafetyNote)를 쓴다 */
.onboarding-safety {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  margin: var(--space-4) 0;
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
/* 아이콘 칸 높이 = 첫 줄 높이(24px) — 아이콘이 첫 줄 가운데에 선다 */
.onboarding-safety-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: var(--lh-article);
  color: var(--ink);
}
```

5-b. `/* 카드 — 숙소 구간·병원·일정·입국/출국 묶음 */` 주석부터 `.onboarding-group-title { … }` 규칙 끝까지를 아래로 바꾼다. 대상은 `.onboarding-card`, `fieldset.onboarding-card`, `.onboarding-card.is-locked`, `.onboarding-card-head`와 그 제목, `.onboarding-card-head .btn-quiet`, `.onboarding-group-title`이다.

```css
/* 입력 묶음 — 숙소 구간·병원·일정·입국/출국. 그림자 카드 없이 흰 바탕 그대로(설계서 6.1 흰 바탕 한 장).
   묶음 사이 32px, 묶음 이름(18/24 굵게)이 머리가 된다 */
.onboarding-card {
  min-width: 0;
  margin: 0 0 var(--space-8);
  padding: 0;
  border: none;
  border-radius: 0;
  background: none;
  box-shadow: none;
  scroll-margin-top: 88px;
}
/* 병원이 보낸 일정(읽기만) — 회색 면 상자로 입력 묶음과 나눈다 */
.onboarding-card.is-locked {
  padding: var(--space-4);
  border-radius: var(--radius-12);
  background: var(--surface-alt);
}
.onboarding-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.onboarding-card-head h3,
.onboarding-card-head h4 {
  font-size: var(--text-title-3);
  line-height: var(--lh-title-3);
  margin: 0;
}
.onboarding-group-title {
  padding: 0;
  margin-bottom: var(--space-3);
  font-size: var(--text-title-3);
  line-height: var(--lh-title-3);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
```

5-c. 검색 결과의 호버 규칙을 바꾼다.

```css
.onboarding-result:hover {
  background: var(--surface-alt);
  border-color: var(--accent);
}
```

위 규칙을 아래로 바꾼다.

```css
/* 눌림·호버는 면 색만(코발트 테두리 없이) */
.onboarding-result:active {
  background: var(--pressed);
}
@media (hover: hover) and (pointer: fine) {
  .onboarding-result:hover {
    background: var(--pressed);
  }
}
```

5-d. `.onboarding-picked { … }`와 `.onboarding-picked-caption { … }` 두 규칙을 아래로 바꾼다.

```css
/* 고른 주소 (SEED Select Box · 고른 칸) — 흰 면 + 2px 진한 테두리. 코발트 띠·면 없이 */
.onboarding-picked {
  display: grid;
  gap: var(--space-1);
  justify-items: start;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line-contrast);
  border-radius: var(--radius-12);
  box-shadow: inset 0 0 0 1px var(--line-contrast);
  background: var(--surface);
}
.onboarding-picked-caption {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
```

5-e. `.onboarding-estimate` 규칙의 `border-radius: var(--radius-12);`를 `border-radius: var(--radius-10);`으로 바꾼다. 그 위 주석 `/* 예상 종료 — '추정' 배지 + 굵은 시각 */`은 아래로 바꾼다.

```css
/* 예상 종료 — 판정·추정 출처(Callout 모양, 모서리 10): 점선 + 회색 면 + '추정' 배지 + 굵은 시각 */
```

5-f. `.onboarding-tally { … }` 규칙을 아래로 바꾼다.

```css
/* 박 수 — 누르는 것이 아니므로 알약·코발트 면 없이 굵은 먹색 한 줄 */
.onboarding-tally {
  margin-bottom: var(--space-3);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
```

5-g. 관심사 칩 절을 바꾼다. 범위는 `/* 관심사 칩 — …` 주석부터 `.onboarding-chip-mark { … }` 바로 앞까지다. `.onboarding-chips`, `.onboarding-chip`, `.onboarding-chip input`, 호버, `:focus-within`, `.is-checked`가 여기에 든다. `.onboarding-chip-mark`는 그대로 둔다.

```css
/* 관심사 칩 (SEED Chip · outlineWeak — 답 칩과 같은 모양) — 44px 알약, 테두리 3:1(--line-input).
   고르면 진한 테두리 + 회색 면 + 체크 아이콘 + 굵게(코발트 없이, 색 단독 금지). 링은 키보드 초점에만 */
.onboarding-chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.onboarding-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  padding: 0 var(--space-4) 0 var(--space-3);
  border: 1px solid var(--line-input);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-color),
    transform var(--duration-fast) var(--ease-press);
}
.onboarding-chip input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.onboarding-chip:active {
  background: var(--pressed);
}
@media (hover: hover) and (pointer: fine) {
  .onboarding-chip:hover {
    background: var(--pressed);
  }
}
@media (prefers-reduced-motion: no-preference) {
  .onboarding-chip:active {
    transform: scale(var(--press-scale-tight));
  }
}
/* 키보드 초점일 때만 칩 전체에 링 — 안쪽 입력은 칩을 덮는 투명 층이라 자체 링을 지워 이중 링을 막는다 */
.onboarding-chip:has(input:focus-visible) {
  outline: var(--focus-width) solid var(--accent);
  outline-offset: 2px;
}
.onboarding-chip input:focus-visible {
  outline: none;
}
/* 고른 칩은 눌러도 색을 바꾸지 않는다(색 자체가 상태) */
.onboarding-chip.is-checked,
.onboarding-chip.is-checked:active {
  border-color: var(--line-contrast);
  background: var(--surface-alt);
  color: var(--ink);
  font-weight: var(--weight-bold);
}
@media (hover: hover) and (pointer: fine) {
  .onboarding-chip.is-checked:hover {
    background: var(--surface-alt);
  }
}
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js e2e/screen-start.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/editing.spec.js e2e/responsive.spec.js
```

Expected: PASS. `screen-onboarding`은 7건이 통과해야 한다. 기존 다섯 파일도 모두 통과해야 하고, 시작 화면 면책 상자 모양 단언이 여기에 든다.

- [ ] **Step 7: 커밋**

```bash
git add components/onboarding/LodgingStep.js components/onboarding/HospitalStep.js components/onboarding/AddressSearch.js components/onboarding/Fields.js app/styles/onboarding.css e2e/screen-onboarding.spec.js
git commit -m "$(cat <<'MSG'
style(onboarding): 입력 묶음을 SEED 모양으로 — 카드·삭제·주소 검색·박 수·관심사 칩·면책 아이콘

- 그림자 카드를 벗겨 흰 바탕 그대로, 묶음 사이 32px(병원이 보낸 일정만 회색 상자).
- 숙소·병원·일정 삭제는 작은 회색 버튼, 주소 검색도 작은 회색 버튼(채운 버튼은 '다음' 하나).
- 고른 주소는 흰 면 + 2px 진한 테두리, 박 수는 굵은 먹색 글자 한 줄 — 코발트 면·띠 제거.
- 관심사 칩은 답 칩과 같은 모양(진한 테두리 + 회색 면 + 체크 + 굵게), 링은 키보드 초점에만.
- 면책 상자(SafetyNote) 앞에 20px 안내 아이콘 — 시작 화면 면책 상자에도 나온다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 오류 표시 — 입력칸·라디오·오류 문장·오류 요약 + 문서

**Files:**
- Modify: `e2e/screen-onboarding.spec.js` (묶음 하나 추가)
- Modify: `components/ui/Icon.js` (`info` 바로 뒤에 `alert`)
- Modify: `components/onboarding/Fields.js` (`FieldErrors`)
- Modify: `components/onboarding/ErrorSummary.js` (import, 제목)
- Modify: `app/globals.css` (`.radio-option.selected` 규칙 바로 뒤)
- Modify: `app/styles/onboarding.css`
  - 머리 주석의 오류 줄
  - `/* 오류 — … */` 절
  - `/* 오류 요약 */` 절의 `.onboarding-summary`·`.onboarding-summary-title`·`.onboarding-summary a strong`
  - `.onboarding-search-status.is-error`
  - `.onboarding-save-error`
- Modify: `docs/platform/DESIGN_SYSTEM.md` (클래스 표 한 행), `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`·`submit`(같은 테스트 파일)
  - Task 2의 `Fields.js` `Icon` import
  - 전역 `:is(input, select, textarea):not([type='checkbox'], [type='radio'], [type='range'])[aria-invalid='true']`(2px 긴급 빨강, `app/globals.css`)
- Produces: `Icon name="alert"`(원 + 느낌표). ③층 4번(조건 화면) 오류 문장도 쓸 수 있다.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-onboarding.spec.js` 끝)**

```js
test.describe('③층 체류 설정 — 오류 표시', () => {
  test('입력칸은 2px 긴급 빨강, 라디오는 선택지 칸 테두리, 문장은 빨강 + 경고 아이콘', async ({ page }) => {
    await loginDemo(page, '/onboarding');
    await submit(page);
    await expect(page.locator('.onboarding-summary')).toBeVisible();

    // 입력칸 = 공통 오류 규칙(설계서 5.2): 긴급 빨강 1px + 안쪽 1px
    expect(await styles(page.locator('#ob-arrival-date'), ['border-top-color', 'box-shadow'])).toEqual({
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
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js
```

Expected: 새 묶음 두 건이 FAIL이고, 앞의 7건은 PASS여야 한다.
- 첫 건: 입력칸 테두리가 `rgb(163, 19, 74)`(`--support-ink`)다.
- 둘째 건: 요약 모서리가 `16px`다.

- [ ] **Step 3: `alert` 아이콘 (`components/ui/Icon.js`)**

`info: ( … ),` 항목 바로 뒤에 더한다.

```js
  // 오류 문장·오류 요약 앞 아이콘 — 원 + 느낌표
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.4v.01" />
    </>
  ),
```

- [ ] **Step 4: 오류 문장과 요약에 아이콘 (JSX)**

4-a. `components/onboarding/Fields.js`의 `FieldErrors` 반환문 안 `<p>`를 아이콘 + 글자로 바꾼다. 함수 위 주석도 한 줄 고친다.

```jsx
/** 필드 오류 문장 묶음 — 문장마다 앞에 20px 경고 아이콘(설계서 5.2). 문제가 없으면 그리지 않는다 */
export function FieldErrors({ id, issues }) {
  const { t } = useLang();
  if (!issues || issues.length === 0) return null;
  return (
    <div id={id} className="onboarding-field-error">
      {issues.map((issue) => {
        const { key, vars } = issueMessage(issue);
        return (
          <p key={`${issue.field}-${issue.code}`}>
            <Icon name="alert" size={20} />
            <span>{t(key, vars)}</span>
          </p>
        );
      })}
    </div>
  );
}
```

4-b. `components/onboarding/ErrorSummary.js`: `import { useLang } from '../LanguageProvider.js';` 줄 바로 아래에 `import { Icon } from '../ui/index.js';`를 더한다. 그리고 제목 `<p>`를 아래로 바꾼다.

```jsx
      <p className="onboarding-summary-title" id={titleId}>
        <Icon name="alert" size={20} />
        <span>{t('onboarding.errorsTitle', { n: issues.length })}</span>
      </p>
```

- [ ] **Step 5: 라디오 선택지 오류 테두리 (`app/globals.css`)**

`.radio-option.selected { … }` 규칙 바로 뒤에 더한다.

```css
/* 고르지 않아 오류인 묶음 — 선택지 칸 테두리를 긴급 빨강으로(라디오 점 자체에는 그리지 않는다).
   글자 입력칸의 오류 규칙(2px 긴급 빨강)은 라디오를 빼므로 여기서 따로 알린다 */
.radio-option:has(input[aria-invalid='true']) {
  border-color: var(--emergency);
}
```

- [ ] **Step 6: 화면 배치 (`app/styles/onboarding.css`)**

6-a. 머리 주석의 오류 줄을 바꾼다.

```css
 *   - 오류는 문장 + 왼쪽 굵은 띠 + 굵은 글자로 보인다(색만으로 알리지 않는다). 글자 색은 --support-ink(7.64:1).
```

위 줄을 아래로 바꾼다.

```css
 *   - 오류는 입력칸 2px 긴급 빨강(globals.css 공통 규칙) + 경고 아이콘 + 굵은 문장으로 보인다(색만으로 알리지 않는다).
 *     글자 색은 --emergency(흰 바탕 5.88:1). 오류 요약만 분홍 면(--support-soft)이다.
```

6-b. `/* 오류 — 문장 + 왼쪽 굵은 띠 + 굵은 글자. … */` 주석부터 `.onboarding-form select[aria-invalid='true']:focus-visible { … }` 규칙 끝까지를 아래로 바꾼다. 이 범위에 입력칸 분홍 덮기 규칙 두 개가 들어 있어 함께 지워진다. 공통 규칙(긴급 빨강, 라디오 제외)이 그 자리를 대신한다.

```css
/* 오류 문장 (설계서 5.2) — 20px 경고 아이콘 + 16/22 굵은 긴급 빨강, 왼쪽 띠 없음.
   16px(SEED 14px) — 다음 단계로 못 가는 이유라 본문 하한을 지킨다. 입력칸 테두리는 globals.css 공통 규칙이 그린다 */
.onboarding-field-error {
  margin-top: var(--space-2);
}
.onboarding-field-error p {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--emergency);
}
/* 20px 아이콘을 22px 첫 줄 가운데에 */
.onboarding-field-error .ui-icon {
  flex: none;
  margin-top: 1px;
}
.onboarding-field-error p + p {
  margin-top: var(--space-1);
}
```

6-c. `/* 오류 요약 */` 절의 `.onboarding-summary { … }`와 `.onboarding-summary-title { … }` 두 규칙을 아래로 바꾼다.

```css
/* 오류 요약 (SEED Callout 모양) — 분홍 면 + 1px 분홍 선 · 모서리 10 · 안쪽 14/16.
   제목 16px 굵게 + 20px 경고 아이콘, 항목 이름은 먹색(오류 문장의 빨강과 겹치지 않게) */
.onboarding-summary {
  margin-bottom: var(--space-5);
  padding: 14px var(--space-4);
  border: 1px solid var(--support-ink);
  border-radius: var(--radius-10);
  background: var(--support-soft);
  scroll-margin-top: 88px;
}
.onboarding-summary-title {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--ink);
  margin-bottom: var(--space-2);
}
.onboarding-summary-title .ui-icon {
  flex: none;
  margin-top: 1px;
  color: var(--support-ink);
}
```

같은 절의 `.onboarding-summary a strong { color: var(--support-ink); }`는 `color: var(--ink);`로 바꾼다.

6-d. `.onboarding-search-status.is-error { … }` 규칙을 아래로 바꾼다.

```css
/* 검색 실패 — 오류 문장과 같은 굵은 긴급 빨강(왼쪽 띠 없음) */
.onboarding-search-status.is-error {
  font-weight: var(--weight-bold);
  color: var(--emergency);
}
```

6-e. `.onboarding-save-error { … }` 규칙을 아래로 바꾼다.

```css
/* 저장 실패 — 오류 문장과 같은 굵은 긴급 빨강(왼쪽 띠 없음) */
.onboarding-save-error {
  margin-top: var(--space-3);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--emergency);
}
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-onboarding.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/editing.spec.js e2e/responsive.spec.js e2e/design-board-components.spec.js
```

Expected: PASS. `screen-onboarding` 9건이 통과해야 한다. `accessibility`의 '체류 설정 1/5 오류 요약' axe도 여기에 들고, 긴급 빨강 글자는 흰 바탕 5.88:1이다.

- [ ] **Step 8: 문서 두 줄**

8-a. `docs/platform/DESIGN_SYSTEM.md` 부품 표에서 `| 클래스 \`.medical-callout\` · \`.has-icon\` | …` 행 바로 아래에 한 행을 더한다.

```markdown
| 입력 오류 표시 | — | 입력칸은 공통 규칙(`aria-invalid` → 2px 긴급 빨강, 체크·라디오 제외). 라디오 묶음은 선택지 칸 테두리가 빨강(`.radio-option:has(input[aria-invalid])`). 오류 문장은 20px `alert` 아이콘(원 + 느낌표) + 16/22 굵은 `--emergency`, 왼쪽 띠 없음 — 체류 설정(`.onboarding-field-error`)이 먼저 쓴다 |
```

8-b. `docs/tracking/status.md`의 `- SEED 적용 ③층 2/15 로그인 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 3/15 체류 설정 화면: 단계 표시 코발트 제거(지금 단계 진한 채움), 단계 제목 26/35, [이전 3][다음 7] 하단 고정 바(320px zh 한 줄), 그림자 카드 제거, 삭제·검색은 작은 회색 버튼, 관심사 칩 SEED 모양, 면책 상자 아이콘, 입력 오류 긴급 빨강 + `alert` 아이콘 — 계획서 `docs/superpowers/plans/2026-09-29-seed-layer3-03-onboarding.md`
```

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 89건이다(시간대에 따라 1건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 10: 커밋**

```bash
git add components/ui/Icon.js components/onboarding/Fields.js components/onboarding/ErrorSummary.js app/globals.css app/styles/onboarding.css e2e/screen-onboarding.spec.js docs/platform/DESIGN_SYSTEM.md docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(onboarding): 입력 오류를 SEED 모양으로 — 긴급 빨강 + 경고 아이콘, 요약은 안내 상자

- 이 화면만 덮던 분홍 오류 테두리를 지워 공통 규칙(2px 긴급 빨강)을 따른다 — 라디오 점에 그려지던 네모도 사라진다.
- 라디오 묶음 오류는 선택지 칸 테두리를 빨강으로.
- 오류 문장은 20px alert 아이콘 + 16/22 굵은 긴급 빨강(왼쪽 띠 없음). 저장·검색 실패 문장도 같은 색.
- 오류 요약은 분홍 안내 상자(모서리 10·1px 선), 제목 16px 굵게 + 경고 아이콘, 항목 이름 먹색.
- 새 아이콘 alert(원 + 느낌표).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 4: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 3 뒤 커밋(작업 후)을 각각 빌드한다. 작업 공간 `evidence/`(git 제외)에 `/onboarding` 5단계를 전체 캡처한다. 끝나면 브랜치로 돌아온다.
  - 360px·320px × ko·en·ja·zh
  - 단계별 장면: 1단계 빈 칸·오류·채움, 2단계 검색 결과·고른 주소, 3단계, 4단계, 5단계(칩 둘 고름)
  - 언어는 브라우저 로캘로 바꾼다.
- [ ] **Step 2: 비교 장면을 보여 준다.**
  - 360px 한국어의 1단계·오류·2단계·3단계·5단계는 전후를 나란히 둔다.
  - 320px zh 4단계(하단 바)와 320px en 2단계를 함께 둔다.
  - 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 4번(조건 화면)을 시작하지 않는다.
