# SEED ③층 4/15 조건 화면(`/conditions`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조건 화면을 설계서 6.2 4번 배치로 바꾼다. 회색 바탕 위 흰 블록에 동의 상태, 기간 목록, 날짜별 적용 조건, 동의 철회를 놓는다.

**Architecture:** 판정·저장 규칙은 바꾸지 않고 표시만 바꾼다. 화면은 `main.page.is-basement` 위에 `.ui-block`을 쌓고, 확인은 ②층 `AlertDialog`, 이동은 ②층 `ListItem`을 쓴다. 넘겨받은 공통 항목 세 가지도 함께 처리한다.
- 화면 끝 여백: 모든 화면 공통 여백을 줄인다.
- 하단 바: 시작·체류 설정·조건 편집기가 같은 클래스 `.sticky-return.is-flow`를 쓰게 한다.
- 오류 표시: 체류 설정과 같은 모양으로 맞춘다.

새 화면 테스트 `e2e/screen-conditions.spec.js`를 Task 1이 만들고, Task 2부터 Task 4까지 한 묶음씩 더한다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(그림자·층), 5.1(버튼), 5.2(입력·오류), 5.4(배지 모양), 5.5(목록 행·흰 블록), 5.6(Callout·Alert Dialog·출처 영역)
- 6.1(규칙), 6.2 4번 행
- 넘김: ②층 계획 `docs/superpowers/plans/2026-09-26-seed-layer2-components.md` 끝 '③층으로 넘기는 것' 1·2·7·8·10, 체류 설정 계획 `docs/superpowers/plans/2026-09-29-seed-layer3-03-onboarding.md`의 하단 바·오류 표시·화면 끝 여백

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 두고 4개 언어가 모두 있어야 한다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 문서·주석·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 쉼표, 괄호, 콜론으로 잇는다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘(또는 모양)으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나('본인 체크 기간 추가' 또는 편집기 '저장'), 링크, 키보드 초점 링에만 쓴다. 본인 체크 출처 색(`--source-self` = `--accent-strong`)은 설계서 2장 결정대로 그대로 둔다.
- **채운 강조 버튼:** 화면당 하나다. 되돌릴 수 없는 확인(기간 삭제, 동의 철회)은 `critical`(긴급 빨강)이다(설계서 5.1·5.6).
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 출처 표시(병원 발행·본인 체크·기본값 적용)의 문구·아이콘·테두리 모양(실선/파선)을 지우지 않는다.
  - 안전 문구 병기(`SafetyText`: 두 언어)의 문장·순서를 바꾸지 않는다.
- **표시만 바꾼다:** 판정·합성(`classifyStay`), 저장(`getStore()` 호출과 순서), 동의·철회 효과, 검증 규칙은 그대로 둔다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/core-flow.spec.js`: 동의 → 본인 체크 기간 추가·저장, 필수 항목 비우면 저장 안 됨.
  - `e2e/accessibility.spec.js`: `/conditions` 동의 전·거부 안내·편집기·오류 요약·병원 발행 axe.
  - `e2e/hospital-link.spec.js`: `.conditions-period-list` 안의 '병원 발행'·데모 배지·'만료됨'.
  - `e2e/editing.spec.js`, `e2e/responsive.spec.js`, `e2e/screen-start.spec.js`, `e2e/screen-onboarding.spec.js`.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 95건이고 Task 1 뒤 98 → Task 2 뒤 100 → Task 3 뒤 102 → Task 4 뒤 104건이 된다.
  - `e2e/demo-events.spec.js` 한 건은 시간대에 따라 건너뛸 수 있다.

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕 | 6.2 4번 회색 | `main.page.is-basement` + 흰 블록. 회색 바탕 화면은 첫 블록이 상단 바 바로 아래에서 시작한다(`is-basement`의 위 여백 0, 모든 회색 화면 공통) | 상단 바와 첫 블록이 한 흰 면으로 이어진다. 위에 회색 띠가 생기지 않는다 |
| 화면 끝 여백 | 체류 설정 넘김 | `main.page` 아래 여백을 '내비 + 152px'에서 '내비 + 56px'(`--gap-screen-bottom`)로 줄인다. 하단 고정 바가 있는 화면만 152px를 유지한다 | 긴급은 이제 내비 칸·긴급 바 안에 있어 떠 있지 않다. 152px는 떠 있던 긴급 버튼 몫이었다 |
| 동의 상태 | 6.2 '동의 상태 Callout' | 초록 면(긍정 안내)을 유지한다. 글자는 먹색, 체크 아이콘은 초록 20px, 모서리 10, 안쪽 14/16 | 상태 문장은 먹색으로 읽히고, 초록은 아이콘에만 쓴다(로그인 화면과 같다) |
| 기간 목록 | 6.2 '기간 목록 블록(목록 행)' | 카드 테두리를 없애고 흰 블록 안 행으로 바꾼다. 행 사이는 1px 선이다. 지금 테두리는 본인 체크가 코발트 파선 2px, 병원 발행이 청록 띠·면이다. 출처는 행마다 출처 표시(SourceTag: 문구 + 아이콘 + 실선/파선 테두리)가 알린다 | 출처 영역 규칙(5.6 왼쪽 띠)은 병원·관광공사 원문 같은 **내용 영역**에 쓴다. 기간 행은 목록 항목이고, 출처 표시는 그대로 남는다 |
| 삭제·철회 확인 | 5.6 Alert Dialog, ②층 넘김 10 | 행 안 확인 문구 + 코발트 버튼을 확인 대화상자로 바꾼다. 확인 버튼은 긴급 빨강(critical) | 되돌릴 수 없는 확인이다. 대화상자의 초점 가두기·Escape·초점 복귀 테스트를 이 화면에 붙인다(넘김 10) |
| 처리 중 닫힘 | ②층 넘김 8 | 이 화면의 확인은 동기 처리라 `busy`를 쓰지 않는다. 해당 없음 | 기간 삭제·동의 철회는 기기 저장소에 바로 쓴다 |
| 동의 철회 버튼 | 6.2 '동의 철회 블록(critical 버튼)' | 회색 → 긴급 빨강 채움 | 화면에서 채운 빨강은 이것 하나다 |
| 병원 지침 연결·병원 안내 보기·체류 정보 고치기 | 5.5 목록 행, ②층 넘김 1 | 버튼 → 화살표 목록 행(링크, 자기 흰 블록) | 다른 화면으로 가는 이동이라 행이 맞다. 혼자 놓인 조용한 버튼('체류 정보 고치기')이 버튼으로 보이지 않던 문제도 해결된다 |
| 날짜별 판정 상자 | 5.6 판정·추정 출처는 Callout 모양, 점선 유지 | 점선·회색 면을 유지하고 모서리 16 → 10, 안쪽 14/16 | 출처(SafeHour 판정)를 가르는 점선은 그대로 둔다 |
| 이 화면의 배지 모양 | 5.4 배지 모서리 6 | 날짜 분류·'제한 없음'·'동의 문구 법무 검토 전'·'꼭 확인' 배지의 모서리 8 → 6 | 배지 5종과 같은 모양 규칙이다. 색·문구·아이콘은 그대로 둔다 |
| 안내 상자(`.conditions-callout`) | 5.6 일반 안내 상자 | 왼쪽 띠·테두리를 없애고 회색 면, 모서리 10, 안쪽 14/16 | 병원 연결·병원 안내 화면(`/link`·`/guide`)도 같은 상자라 함께 바뀐다(같은 모양이 맞다) |
| 동의 패널(동의 전) | 없음 | 조건 화면에서는 카드를 벗겨 흰 블록과 한 면으로 둔다. 병원 연결 화면에서는 그대로 카드다 | 흰 블록 안 카드는 겹면이 된다. `/link`는 ③층 14번에서 다룬다 |
| 편집기 저장·취소 | 6.1 하단 고정 바 3:7 | 하단 내비 바로 위 고정 바 [취소 3][저장 7] | 항목이 많아 저장까지 스크롤이 길다 |
| 하단 바 공통 클래스 | 체류 설정 넘김 | `.sticky-return.is-flow`(globals.css)를 만든다. 불투명 흰 면 + 1px 윗선, 세로 480px 이하 고정 해제, 초점 가림을 막는 `scroll-padding-bottom`을 담는다. 시작·체류 설정·조건 편집기가 함께 쓴다. '즉시 복귀' 안전 버튼은 `is-flow` 없이 늘 고정이다 | 세 화면이 같은 규칙을 따로 갖지 않게 한다. 13번 보호자도 이 클래스를 쓴다 |
| 오류 표시 | 5.2, 체류 설정 넘김 | 오류 문장은 체류 설정과 같다(20px `alert` + 16/22 굵은 `--emergency`). 오류 요약·연결 오류는 1px 빨간 테두리 안내 상자, 모서리 10, 제목 앞 경고 아이콘. 왼쪽 6px 띠는 없앤다 | 앱 안 오류 모양을 하나로 맞춘다 |
| 따라오는 입력 묶음 | 없음 | 왼쪽 선 `--accent-soft`(옅은 코발트) → `--line-strong`(회색) | 코발트 쓰임을 줄인다 |
| 답 칩 폭 | ②층 넘김 2 | **이 계획에서 하지 않는다** | 측정 결과 320px 편집기의 칩은 79px다. ja·en은 고르기 전에도 두 줄이고, 고를 때 한 줄 더 늘어나는 것은 ja 'わからない'·zh '不确定'이다. 부품(AnswerInput) 수정이라 마무리 일괄 작업에서 다룬다 |
| 날짜 분류 '본인 선언 자유일' 코발트 | 2장 출처 색 유지 | 그대로 둔다 | 본인 체크 출처 색(`--source-self`)이 코발트 계열로 정해져 있다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/conditions/page.js` | 조건 화면 | 회색 바탕 + 블록(T1), 추가 버튼과 이동 행(T2) |
| `app/styles/conditions.css` | 조건·병원 연결·병원 안내 배치 | T1부터 T4까지 범위를 나눠 고친다 |
| `app/styles/ui.css` | 공용 부품 | `is-basement` 위 여백 0(T1) |
| `app/globals.css` | 토큰·공용 모양 | `main.page` 아래 여백(T1), `.sticky-return.is-flow`(T4) |
| `components/conditions/ConsentPanel.js` | 동의 패널·동의 상태 | 동의 상태 아이콘 20(T1), 실패 문장 아이콘(T3) |
| `components/conditions/DayConditions.js` | 날짜별 적용 조건 | 블록 클래스(T1) |
| `components/conditions/ConsentWithdraw.js` | 동의 철회 | 블록 클래스(T1), 빨간 버튼 + 확인 대화상자(T3) |
| `components/conditions/PeriodCard.js` | 기간 행 | 확인 대화상자(T2) |
| `components/conditions/PeriodEditorForm.js` | 본인 체크 편집기 | 하단 바·오류 아이콘·작은 회색 버튼(T4) |
| `app/page.js` · `components/onboarding/OnboardingForm.js` · `app/styles/onboarding.css` | 시작·체류 설정 | 하단 바를 `is-flow`로 옮긴다(T4, 모양은 그대로) |
| `e2e/screen-conditions.spec.js` | **새** ③층 조건 화면 모양 테스트 | T1이 만들고 T2부터 T4까지 더한다 |
| `docs/platform/DESIGN_SYSTEM.md` · `docs/tracking/status.md` | 문서 | 한 줄씩(T4) |

---

### Task 1: 회색 바탕·흰 블록·화면 끝 여백·동의 상태·날짜별 판정 상자

**Files:**
- Create: `e2e/screen-conditions.spec.js`
- Modify: `app/conditions/page.js` (import, `return (` 안의 `<main>` 전체)
- Modify: `components/conditions/DayConditions.js` (`<section className="conditions-section"` 한 줄)
- Modify: `components/conditions/ConsentWithdraw.js` (`<section className="conditions-withdraw"` 한 줄)
- Modify: `components/conditions/ConsentPanel.js` (동의 상태의 `<Icon name="check" size={18} …>` 한 줄)
- Modify: `app/styles/conditions.css`
  - `.conditions-section`, `.conditions-notice:not(:empty)`, `.conditions-withdraw`
  - `.conditions-consent-status` 두 규칙
  - `.conditions-day`
  - 배지 모양 네 규칙: `.conditions-plain-tag`, `.conditions-review-badge`, `.conditions-coverage`, `.conditions-critical-tag`
- Modify: `app/styles/ui.css` (`main.page.is-basement` 규칙)
- Modify: `app/globals.css` (`main.page` 규칙)

**Interfaces:**
- Consumes: ②층 `.ui-block`·`main.page.is-basement`(ui.css), `ListGroup`·`ListItem`(`@/components/ui/index.js`), 토큰 `--layer-basement`·`--gap-screen-bottom`·`--radius-6|10`·`--state-together-bg|ink`
- Produces:
  - 테스트 도우미 `styles(locator, props)`, `gapBetween(upper, lower)` (`e2e/screen-conditions.spec.js`)
  - 블록 구조: `main.conditions-page` 바로 아래 `.ui-block`들. 순서는 [안내·동의] [조건 기간] [날짜별 적용 조건] [동의 철회] [체류 정보 고치기]
  - Task 2는 [조건 기간] 블록 뒤에 [이동 행] 블록을 더한다.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-conditions.spec.js`)**

```js
// ③층 조건(/conditions): SEED 화면 배치 (설계서 6.1, 6.2 4번)
//
// 회색 바탕 위 흰 블록: 안내·동의 상태 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 동의 있음, 체류 전체를 덮는 본인 체크 기간 하나).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --ink rgb(26, 28, 32), --layer-basement rgb(243, 244, 245),
// --emergency rgb(200, 16, 46), --state-together-ink rgb(17, 105, 58), --line-strong rgb(220, 222, 227),
// --accent rgb(10, 92, 255).

import { test, expect } from './fixtures.js';
import { readRecord, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

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

    // 화면 끝까지 내리면 마지막 블록과 하단 내비 사이가 블록 틈 8px + 화면 끝 56px 안팎이다(예전에는 160px 안팎)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gap = gapBetween(await blocks.last().boundingBox(), await page.locator('.ui-bottom-nav').boundingBox());
    expect(gap).toBeGreaterThanOrEqual(56);
    expect(gap).toBeLessThanOrEqual(72);
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
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js
```

Expected: 세 건 모두 FAIL이어야 한다.
- 첫 건: 바탕이 흰색이고 `.ui-block`이 없다.
- 둘째 건: 동의 상태 모서리가 `12px`다.
- 셋째 건: `section.ui-block`이 없다.

- [ ] **Step 3: 화면 구조 (`app/conditions/page.js`)**

3-a. import 줄을 바꾼다.

```js
import { Button, EmptyState, TopBar, useStoreStatus } from '@/components/ui/index.js';
```

위 줄을 아래로 바꾼다.

```js
import { Button, EmptyState, ListGroup, ListItem, TopBar, useStoreStatus } from '@/components/ui/index.js';
```

3-b. 파일 머리 주석의 `//   - 보기 전용(로그인 만료·오프라인)에서는 동의·입력·삭제를 모두 막는다.` 줄 아래에 한 줄을 더한다.

```js
//   - SEED ③층(설계서 6.2 4번): 회색 바탕 위 흰 블록. 안내·동의 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.
```

3-c. `return (` 안의 `<main className="page conditions-page">` 부터 `</main>` 까지를 아래로 바꾼다. 안의 조건·처리 함수·문구 키는 그대로이고, 블록 감싸기와 클래스만 바뀐다.
- 편집기·기간 목록 섹션은 `ui-block` 클래스를 더 받는다.
- 맨 끝 조용한 버튼은 목록 행이 된다.
- 기간 목록의 버튼 세 개는 Task 2가 고친다. 여기서는 그대로 둔다.

```jsx
      <main className="page conditions-page is-basement">
        {!hydrated ? (
          <div className="ui-block">
            <p className="conditions-hint">{t('conditions.loading')}</p>
          </div>
        ) : !stay ? (
          <div className="ui-block">
            <EmptyState
              icon="navConditions"
              title={t('conditions.noStayTitle')}
              body={t('conditions.noStayBody')}
              action={<Button href="/onboarding">{t('conditions.noStayAction')}</Button>}
            />
          </div>
        ) : (
          <>
            <div className="ui-block">
              <p className="conditions-lead">{t('conditions.lead')}</p>

              <ConsentPanel consent={stay.consent} readOnly={readOnly} />

              <div role="status" className={notice?.error ? 'conditions-notice is-error' : 'conditions-notice'}>
                {notice ? t(notice.key) : ''}
              </div>
            </div>

            {consented && editing && (
              <section className="ui-block conditions-section" aria-labelledby="conditions-editor-heading">
                <h2 id="conditions-editor-heading" tabIndex={-1} ref={editorHeadingRef}>
                  {editing.period ? t('conditions.editorEdit') : t('conditions.editorNew')}
                </h2>
                <PeriodEditorForm
                  stay={stay}
                  period={editing.period}
                  periodId={editing.id}
                  readOnly={readOnly}
                  onSave={save}
                  onCancel={closeEditor}
                />
              </section>
            )}

            {consented && !editing && (
              <section className="ui-block conditions-section" aria-labelledby="conditions-periods-heading">
                <h2 id="conditions-periods-heading" tabIndex={-1} ref={periodsHeadingRef}>
                  {t('conditions.periodsTitle')}
                </h2>
                <p className="conditions-section-lead">{t('conditions.periodsLead')}</p>
                {periods.length === 0 ? (
                  <EmptyState
                    icon="selfCheck"
                    headingLevel={3}
                    title={t('conditions.periodsEmpty')}
                    body={t('conditions.periodsEmptyBody')}
                  />
                ) : (
                  <ul className="conditions-period-list">
                    {periods.map((period) => (
                      <PeriodCard
                        key={period.id}
                        period={period}
                        stay={stay}
                        byDate={classification.byDate}
                        nowMs={nowMs}
                        readOnly={readOnly}
                        onEdit={(p) => {
                          setNotice(null);
                          setEditing({ period: p, id: p.id });
                        }}
                        onDelete={remove}
                      />
                    ))}
                  </ul>
                )}
                <div className="conditions-actions">
                  <Button icon="plus" onClick={startNew} disabled={readOnly}>
                    {t('conditions.addPeriod')}
                  </Button>
                  <Button variant="secondary" icon="hospital" href="/link">
                    {t('conditions.linkHospital')}
                  </Button>
                  {hasLinkedPlans && (
                    <Button variant="secondary" href="/guide">
                      {t('conditions.openGuide')}
                    </Button>
                  )}
                </div>
                {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
              </section>
            )}

            {!editing && (
              <DayConditions
                stay={stay}
                byDate={classification.byDate}
                error={classification.error}
                nowMs={nowMs}
              />
            )}

            {consented && !editing && <ConsentWithdraw />}

            {/* 다른 화면으로 가는 이동이라 버튼이 아니라 화살표 목록 행(설계서 5.5) */}
            <div className="ui-block">
              <ListGroup>
                <li>
                  <ListItem title={t('conditions.editStay')} trailing="chevron" href="/onboarding" />
                </li>
              </ListGroup>
            </div>
          </>
        )}
      </main>
```

- [ ] **Step 4: 블록 클래스 (부품 두 개 + 동의 상태 아이콘)**

4-a. `components/conditions/DayConditions.js`:

```jsx
    <section className="conditions-section" aria-labelledby={headingId}>
```

위 줄을 아래로 바꾼다.

```jsx
    <section className="ui-block conditions-section" aria-labelledby={headingId}>
```

4-b. `components/conditions/ConsentWithdraw.js`:

```jsx
    <section className="conditions-withdraw" aria-labelledby={headingId}>
```

위 줄을 아래로 바꾼다.

```jsx
    <section className="ui-block conditions-withdraw" aria-labelledby={headingId}>
```

4-c. `components/conditions/ConsentPanel.js`의 동의 상태 아이콘을 20px로 바꾼다(16px 글자의 짝은 20px 아이콘, 설계서 5.6).

```jsx
        <Icon name="check" size={18} strokeWidth={2.4} />
```

위 줄을 아래로 바꾼다.

```jsx
        <Icon name="check" size={20} strokeWidth={2.4} />
```

- [ ] **Step 5: 공용 여백 (`app/styles/ui.css`, `app/globals.css`)**

5-a. `app/styles/ui.css`의 `main.page.is-basement { … }` 규칙을 아래로 바꾼다.

```css
main.page.is-basement {
  background: var(--layer-basement);
  --shadow-card: none;
  /* 첫 흰 블록이 상단 바 바로 아래에서 시작한다. 상단 바와 첫 블록이 한 흰 면으로 이어진다 */
  padding-top: 0;
}
```

5-b. `app/globals.css`의 `main.page { … }` 규칙을 아래로 바꾼다.

```css
main.page {
  flex: 1;
  /* 아래 여백: 하단 내비(또는 하단 긴급 바) 높이 + 화면 끝 56px(SEED screen-bottom).
     긴급은 내비 칸·긴급 바 안에 있어 떠 있지 않다 */
  padding: var(--space-5) var(--gutter) calc(var(--nav-offset) + var(--gap-screen-bottom));
}
/* 하단 고정 바(.sticky-return)가 있는 화면은 바 높이(77~99px)만큼 더 비운다 */
.app-shell:has(.sticky-return) main.page {
  padding-bottom: calc(var(--nav-offset) + 152px);
}
```

- [ ] **Step 6: 조건 화면 배치 (`app/styles/conditions.css`)**

6-a. `.conditions-section { … }` 규칙을 아래로 바꾼다. 흰 블록이면 블록 틈(8px)이 간격을 준다. 블록이 아닌 병원 연결·병원 안내 화면은 지금처럼 32px다.

```css
.conditions-section {
  min-width: 0;
}
.conditions-section:not(.ui-block) {
  margin-bottom: var(--space-8);
}
```

6-b. `.conditions-notice:not(:empty) { margin-bottom: var(--space-4); }` 규칙을 아래로 바꾼다(안내·동의 블록의 마지막 줄이 된다).

```css
.conditions-notice:not(:empty) {
  margin-top: var(--space-3);
}
```

6-c. `.conditions-withdraw { margin-bottom: var(--space-8); }` 규칙을 아래로 바꾼다.

```css
.conditions-withdraw:not(.ui-block) {
  margin-bottom: var(--space-8);
}
```

6-d. `.conditions-consent-status { … }`와 `.conditions-consent-status .ui-icon { … }` 두 규칙을 아래로 바꾼다.

```css
/* 동의 상태 (SEED Callout · 긍정): 초록 면, 글자는 먹색, 체크 아이콘만 초록 20px. 모서리 10 · 안쪽 14/16 */
.conditions-consent-status {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--state-together-bg);
  color: var(--ink);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-medium);
}
.conditions-consent-status .ui-icon {
  flex: none;
  margin-top: 1px;
  color: var(--state-together-ink);
}
```

6-e. `.conditions-day { … }` 규칙을 아래로 바꾼다.

```css
/* 날짜별 합성 결과 = SafeHour 판정 출처(설계서 5.6): 점선 테두리 + 회색 면 유지, Callout 모양(모서리 10 · 안쪽 14/16) */
.conditions-day {
  border: 1px dotted var(--source-estimate);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
  padding: 14px var(--space-4);
}
```

6-f. 배지 모양 네 규칙의 모서리를 `var(--radius-8)`에서 `var(--radius-6)`으로 바꾼다(설계서 5.4). 대상은 `.conditions-plain-tag`, `.conditions-review-badge`, `.conditions-coverage`, `.conditions-critical-tag`이고, 각 규칙의 `border-radius: var(--radius-8);` 한 줄만 바뀐다. `.conditions-coverage` 바로 위 주석은 아래로 바꾼다.

```css
/* 날짜 분류 — 색 + 아이콘 + 문구. 입력 필요는 오류 색이 아니다 */
```

위 줄을 아래로 바꾼다.

```css
/* 날짜 분류: 색 + 아이콘 + 문구, 배지 모양(모서리 6). 입력 필요는 오류 색이 아니다 */
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/hospital-link.spec.js e2e/editing.spec.js e2e/responsive.spec.js e2e/screen-start.spec.js e2e/screen-onboarding.spec.js
```

Expected: PASS. `screen-conditions` 3건과 기존 일곱 파일이 모두 통과해야 한다. axe 위반이 나오면 값을 바꾸거나 테스트를 느슨하게 하지 말고 멈추고 보고한다.

- [ ] **Step 8: 커밋**

```bash
git add app/conditions/page.js components/conditions/DayConditions.js components/conditions/ConsentWithdraw.js components/conditions/ConsentPanel.js app/styles/conditions.css app/styles/ui.css app/globals.css e2e/screen-conditions.spec.js
git commit -m "$(cat <<'MSG'
style(conditions): 회색 바탕 위 흰 블록으로, 화면 끝 여백 56px

- 조건 화면을 회색 바탕(is-basement) 위 흰 블록으로: 안내·동의 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.
- 회색 바탕 화면은 첫 블록이 상단 바 바로 아래에서 시작한다(위 여백 0).
- 모든 화면의 끝 여백을 내비 + 152px 에서 내비 + 56px 로. 하단 고정 바가 있는 화면만 152px 유지.
- 동의 상태는 초록 안내 상자(먹색 글자, 초록 체크 20px, 모서리 10), 날짜별 판정 상자는 모서리 10.
- 이 화면 배지(날짜 분류 등) 모서리 6, 체류 정보 고치기는 화살표 목록 행.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 조건 기간 목록: 목록 행, 삭제 확인 대화상자, 이동 행

**Files:**
- Modify: `e2e/screen-conditions.spec.js` (파일 끝에 묶음 하나)
- Modify: `components/conditions/PeriodCard.js` (import, 상태·효과, 행동 부분)
- Modify: `app/conditions/page.js` (기간 목록 섹션의 `conditions-actions`, 그 뒤에 이동 행 블록, import 에 `Icon`)
- Modify: `app/styles/conditions.css` (`/* ─── 기간 목록 ─── */` 절의 `.conditions-period-list`부터 `.conditions-period-HOSPITAL`까지)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`·`gapBetween`, 블록 구조
  - ②층 `AlertDialog({ title, description?, cancelLabel, confirmLabel, critical, busy?, onConfirm({ requestClose }), onClose })`. 열려 있을 때만 그린다.
- Produces: 기간 삭제 확인은 `role="alertdialog"`이고 이름은 `conditions.deleteQuestion`이다(ko '이 기간을 삭제할까요?').

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-conditions.spec.js` 끝)**

```js
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

    // 채운 코발트 버튼은 '본인 체크 기간 추가' 하나, 병원 지침 연결은 목록 행 링크
    const add = page.getByRole('button', { name: '본인 체크 기간 추가' });
    expect((await styles(add, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
    const link = page.getByRole('link', { name: '병원 지침 연결' });
    await expect(link).toHaveClass(/ui-list-item/);
    await expect(link).toHaveAttribute('href', '/link');
  });

  test('기간 삭제는 확인 대화상자(빨간 확인): 취소하면 남고, 삭제하기면 지운다', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const trigger = page.locator('.conditions-period').first().getByRole('button', { name: '삭제', exact: true });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' });
    await expect(dialog).toBeVisible();
    expect(
      (await styles(dialog.getByRole('button', { name: '삭제하기' }), ['background-color']))['background-color'],
    ).toBe('rgb(200, 16, 46)');

    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await readRecord(page, 'stay')).periods).toHaveLength(1);

    await trigger.click();
    await page.getByRole('alertdialog', { name: '이 기간을 삭제할까요?' }).getByRole('button', { name: '삭제하기' }).click();
    await expect(page.getByText('기간을 삭제했어요.')).toBeVisible();
    expect((await readRecord(page, 'stay')).periods).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js
```

Expected: 새 두 건이 FAIL이고 Task 1의 세 건은 PASS여야 한다.
- 첫 건: 본인 체크 행 테두리가 파선 2px라 `border-left-width`가 `2px`다.
- 둘째 건: `alertdialog`가 없다(행 안 확인 문구).

- [ ] **Step 3: 기간 행의 삭제 확인을 대화상자로 (`components/conditions/PeriodCard.js`)**

3-a. import 두 줄을 바꾼다.

```js
import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, Button, SourceTag } from '@/components/ui/index.js';
```

위 세 줄을 아래로 바꾼다.

```js
import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { AlertDialog, Badge, Button, SourceTag } from '@/components/ui/index.js';
```

3-b. 머리 주석의 `// - 본인 체크 기간: 고치기 / 삭제(한 번 더 묻는다). 보기 전용이면 막는다.` 줄을 아래로 바꾼다.

```js
// - 본인 체크 기간: 고치기 / 삭제(확인 대화상자로 한 번 더 묻는다, 확인은 긴급 빨강). 보기 전용이면 막는다.
```

3-c. 함수 본문 앞부분에서 아래 줄들을 지운다.

```js
  const questionId = useId();
  const confirmRef = useRef(null);
```

```js
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
```

3-d. `{!isHospital && ( … )}` 행동 블록 전체를 아래로 바꾼다. `</li>` 바로 앞이다.

```jsx
      {!isHospital && (
        <div className="conditions-actions is-inline conditions-period-actions">
          <Button variant="secondary" size="small" disabled={readOnly} onClick={() => onEdit?.(period)}>
            {t('conditions.editPeriod')}
          </Button>
          <Button variant="secondary" size="small" disabled={readOnly} onClick={() => setConfirming(true)}>
            {t('conditions.deletePeriod')}
          </Button>
        </div>
      )}

      {/* 되돌릴 수 없는 확인이라 대화상자로 묻는다(설계서 5.6). 초점 가두기·Escape·초점 복귀는 AlertDialog 가 한다 */}
      {confirming && (
        <AlertDialog
          title={t('conditions.deleteQuestion')}
          cancelLabel={t('conditions.cancel')}
          confirmLabel={t('conditions.deleteConfirm')}
          critical
          onConfirm={({ requestClose }) => {
            requestClose();
            onDelete?.(period);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
```

- [ ] **Step 4: 추가 버튼과 이동 행 (`app/conditions/page.js`)**

4-a. import 줄에 `Icon`을 더한다.

```js
import { Button, EmptyState, Icon, ListGroup, ListItem, TopBar, useStoreStatus } from '@/components/ui/index.js';
```

4-b. 기간 목록 섹션 안의 `<div className="conditions-actions"> … </div>`(버튼 세 개)와 그 뒤 `readOnly` 안내 줄, `</section>`까지를 아래로 바꾼다.
- 섹션 안에는 주 버튼 하나만 남긴다.
- 병원 지침 연결과 병원 안내 보기는 섹션 뒤 자기 흰 블록의 화살표 행이 된다.

```jsx
                <div className="conditions-actions">
                  <Button icon="plus" onClick={startNew} disabled={readOnly}>
                    {t('conditions.addPeriod')}
                  </Button>
                </div>
                {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
              </section>
            )}

            {/* 병원 지침 연결·병원 안내 보기: 다른 화면으로 가는 이동이라 화살표 목록 행(설계서 5.5) */}
            {consented && !editing && (
              <div className="ui-block">
                <ListGroup>
                  <li>
                    <ListItem
                      title={t('conditions.linkHospital')}
                      leading={<Icon name="hospital" size={22} />}
                      trailing="chevron"
                      href="/link"
                    />
                  </li>
                  {hasLinkedPlans && (
                    <li>
                      <ListItem
                        title={t('conditions.openGuide')}
                        leading={<Icon name="quote" size={22} />}
                        trailing="chevron"
                        href="/guide"
                      />
                    </li>
                  )}
                </ListGroup>
              </div>
            )}
```

(위 블록이 기존 `</section>` 과 `)}` 를 대신한다. 바로 뒤의 `{!editing && ( <DayConditions …` 는 그대로 둔다.)

- [ ] **Step 5: 기간 행 배치 (`app/styles/conditions.css`)**

`/* ─── 기간 목록 ─── */` 절에서 `.conditions-period-list`, `.conditions-period`, `.conditions-period-SELF`, `.conditions-period-HOSPITAL` 네 규칙을 아래로 바꾼다. 절 제목 줄과 뒤의 `.conditions-period-head`부터는 그대로 둔다.

```css
/* 기간 목록 (SEED 목록 행): 카드 테두리 없이 흰 블록 안의 행, 행 사이 1px 선.
   출처는 행마다 출처 표시(SourceTag: 문구 + 아이콘 + 실선/파선 테두리)가 알린다 */
.conditions-period-list {
  list-style: none;
  padding: 0;
}
.conditions-period {
  padding: var(--space-4) 0;
  min-width: 0;
}
.conditions-period + .conditions-period {
  border-top: 1px solid var(--line);
}
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/hospital-link.spec.js e2e/editing.spec.js
```

Expected: PASS(`screen-conditions` 5건 + 기존 네 파일).

- [ ] **Step 7: 커밋**

```bash
git add components/conditions/PeriodCard.js app/conditions/page.js app/styles/conditions.css e2e/screen-conditions.spec.js
git commit -m "$(cat <<'MSG'
style(conditions): 기간 목록을 목록 행으로, 삭제는 확인 대화상자

- 기간은 카드 테두리(코발트 파선, 청록 띠) 없이 흰 블록 안 행으로. 출처 표시(문구, 아이콘, 실선/파선)는 그대로.
- 기간 삭제 확인을 행 안 문구에서 확인 대화상자로, 확인 버튼은 긴급 빨강.
- 기간 블록에는 주 버튼(본인 체크 기간 추가)만 두고, 병원 지침 연결·병원 안내 보기는 화살표 목록 행으로.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 동의 패널·안내 상자·동의 철회(빨간 버튼 + 확인 대화상자)

**Files:**
- Modify: `e2e/screen-conditions.spec.js` (파일 끝에 묶음 하나)
- Modify: `components/conditions/ConsentWithdraw.js` (import, 상태·효과, 본문 행동 부분, 실패 문장)
- Modify: `components/conditions/ConsentPanel.js` (실패 문장)
- Modify: `app/styles/conditions.css` (`.conditions-callout`, 동의 절 끝에 동의 패널 규칙 하나, `.conditions-confirm`·`.conditions-confirm-question` 삭제)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`, 블록 구조
  - ②층 `AlertDialog`
  - `Icon name="alert"`(체류 설정 계획에서 더함)
- Produces: 동의 철회 확인은 `role="alertdialog"`이고, 이름은 `conditions.withdrawTitle`(ko '민감정보 동의 철회'), 설명은 `conditions.withdrawQuestion`이다.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-conditions.spec.js` 끝)**

```js
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
  });

  test('동의 철회: 빨간 버튼 → 확인 대화상자(초점 가둠, Escape, 초점 복귀, 취소) → 철회하기', async ({ page }) => {
    await startTrip(page, {}, { path: '/conditions' });
    const trigger = page.getByRole('button', { name: '동의 철회', exact: true });
    expect((await styles(trigger, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');

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
    expect((await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    await confirm.click();
    await expect(page.getByRole('heading', { name: '민감정보 처리 동의' })).toBeVisible();
    expect((await readRecord(page, 'stay')).consent.sensitive).toBeNull();
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js
```

Expected: 새 두 건이 FAIL이고 앞의 다섯 건은 PASS여야 한다.
- 첫 건: 동의 패널이 카드다(`border-top-width` 1px).
- 둘째 건: 철회 버튼 면이 회색이다.

- [ ] **Step 3: 동의 철회 (`components/conditions/ConsentWithdraw.js`)**

3-a. import 두 줄을 바꾼다.

```js
import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, useStoreStatus } from '@/components/ui/index.js';
```

위 세 줄을 아래로 바꾼다.

```js
import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { AlertDialog, Button, Icon, useStoreStatus } from '@/components/ui/index.js';
```

3-b. 머리 주석의 `// 되돌릴 수 없으므로 한 번 더 묻는다. 보기 전용이면 막는다.` 줄을 아래로 바꾼다.

```js
// 되돌릴 수 없으므로 확인 대화상자로 한 번 더 묻는다(철회 버튼과 확인 버튼 모두 긴급 빨강). 보기 전용이면 막는다.
```

3-c. 함수 본문에서 아래 줄들을 지운다.

```js
  const questionId = useId();
  const confirmRef = useRef(null);
```

```js
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
```

3-d. `withdraw` 함수를 아래로 바꾼다.

```js
  function withdraw(requestClose) {
    const outcome = getStore().withdrawSensitiveConsent();
    requestClose();
    setResult(outcome.ok ? 'done' : 'failed');
  }
```

3-e. `<SafetyText k={'conditions.withdrawEffect'} … />` 바로 뒤의 `{confirming ? ( … ) : ( … )}` 전체를 아래로 바꾼다.

```jsx
          <div className="conditions-actions">
            <Button
              variant="critical"
              disabled={readOnly}
              onClick={() => {
                setResult(null);
                setConfirming(true);
              }}
            >
              {t('conditions.withdrawAction')}
            </Button>
          </div>
          {confirming && (
            <AlertDialog
              title={t('conditions.withdrawTitle')}
              description={t('conditions.withdrawQuestion')}
              cancelLabel={t('conditions.cancel')}
              confirmLabel={t('conditions.withdrawConfirm')}
              critical
              onConfirm={({ requestClose }) => withdraw(requestClose)}
              onClose={() => setConfirming(false)}
            />
          )}
```

3-f. 실패 문장에 경고 아이콘을 붙인다.

```jsx
        <p className="conditions-field-error" role="alert">
          {t('conditions.withdrawFailed')}
        </p>
```

위 부분을 아래로 바꾼다.

```jsx
        <p className="conditions-field-error" role="alert">
          <Icon name="alert" size={20} />
          <span>{t('conditions.withdrawFailed')}</span>
        </p>
```

- [ ] **Step 4: 동의 실패 문장 (`components/conditions/ConsentPanel.js`)**

```jsx
        <p className="conditions-field-error" role="alert">
          {t('conditions.consentFailed')}
        </p>
```

위 부분을 아래로 바꾼다.

```jsx
        <p className="conditions-field-error" role="alert">
          <Icon name="alert" size={20} />
          <span>{t('conditions.consentFailed')}</span>
        </p>
```

- [ ] **Step 5: 안내 상자와 동의 패널 (`app/styles/conditions.css`)**

5-a. `.conditions-callout { … }` 규칙을 아래로 바꾼다.

```css
/* 일반 안내 상자 (SEED Callout · neutral, 설계서 5.6): 왼쪽 띠·테두리 없이 회색 면 · 모서리 10 · 안쪽 14/16.
   병원 연결·병원 안내 화면도 같은 상자다 */
.conditions-callout {
  background: var(--surface-alt);
  border-radius: var(--radius-10);
  padding: 14px var(--space-4);
  font-size: var(--text-body);
  line-height: var(--leading-body);
  margin-top: var(--space-3);
}
```

5-b. `.conditions-consent-status .ui-icon { … }` 규칙 바로 뒤에 더한다.

```css
/* 조건 화면에서는 동의 패널이 흰 블록 안에 놓인다: 카드 테두리·그림자·안쪽 여백 없이 블록과 한 면.
   병원 연결 화면(/link)은 ③층 14번 전까지 카드 그대로다 */
.conditions-page .conditions-consent {
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: none;
  box-shadow: none;
}
```

5-c. 더는 쓰지 않는 `.conditions-confirm { … }`와 `.conditions-confirm-question { … }` 두 규칙을 지운다(행 안 확인 문구가 대화상자로 바뀌었다). 지우기 전에 `grep -rn "conditions-confirm" app components`로 남은 쓰임이 없는지 본다. 남아 있으면 지우지 말고 보고서에 적는다.

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/hospital-link.spec.js
```

Expected: PASS. `screen-conditions`는 7건이다. 기존 세 파일도 통과해야 하고, 병원 연결 화면 axe가 여기에 든다.

- [ ] **Step 7: 커밋**

```bash
git add components/conditions/ConsentWithdraw.js components/conditions/ConsentPanel.js app/styles/conditions.css e2e/screen-conditions.spec.js
git commit -m "$(cat <<'MSG'
style(conditions): 동의 철회는 빨간 버튼 + 확인 대화상자, 안내 상자는 SEED Callout

- 동의 철회 버튼을 긴급 빨강으로, 확인은 행 안 문구 대신 확인 대화상자(확인 버튼 빨강).
  초점 가두기, Escape, 초점 복귀, 취소를 화면 테스트로 잰다.
- 조건 화면의 동의 패널은 카드를 벗겨 흰 블록과 한 면으로.
- 안내 상자(.conditions-callout)는 왼쪽 띠 없이 회색 면, 모서리 10.
- 동의·철회 실패 문장 앞에 경고 아이콘.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 4: 편집기: 하단 고정 바, 하단 바 공통 클래스, 오류 표시 통일 + 문서

**Files:**
- Modify: `e2e/screen-conditions.spec.js` (파일 끝에 묶음 하나)
- Modify: `components/conditions/PeriodEditorForm.js` (오류 요약 제목, `renderError` 아이콘, `PeriodEditor`의 `actions` 대신 하단 바, 복약 삭제 버튼 변형)
- Modify: `app/globals.css` (`.app-shell[data-emergency-bar='on'] .sticky-return` 규칙 바로 뒤에 `is-flow` 규칙)
- Modify: `app/page.js` (`onboarding-cta sticky-return` 클래스)
- Modify: `components/onboarding/OnboardingForm.js` (`onboarding-actions sticky-return` 클래스)
- Modify: `app/styles/onboarding.css` (하단 바 면·윗선 규칙, `@media (max-height: 480px)` 블록, `html:has(.onboarding-actions.sticky-return)` 규칙)
- Modify: `app/styles/conditions.css` (오류 절, `.conditions-subfield`, 편집기 절 끝에 하단 바 규칙)
- Modify: `docs/platform/DESIGN_SYSTEM.md` (클래스 표 한 행), `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`·`gapBetween`
  - 전역 `.sticky-return`(고정, `bottom: var(--nav-offset)`, 내비가 있으면 그 위)
  - `Icon name="alert"`
- Produces: 흐름 화면 하단 바 클래스 `.sticky-return.is-flow`
  - 담는 것: 불투명 흰 면 + 1px `--line-strong` 윗선, 세로 480px 이하 고정 해제, `html` `scroll-padding-bottom` 184px(짧은 화면 88px)
  - 쓰는 곳: 시작(`.onboarding-cta`), 체류 설정(`.onboarding-actions`), 조건 편집기(`.conditions-editor-actions`). ③층 13번 보호자도 쓴다.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-conditions.spec.js` 끝)**

```js
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
    // 내비 윗선 1px 차이까지 허용한다(바 bottom = --nav-offset)
    expect(
      Math.abs(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())),
    ).toBeLessThanOrEqual(1);

    const cancel = await bar.getByRole('button', { name: '취소' }).boundingBox();
    const save = await bar.getByRole('button', { name: '저장', exact: true }).boundingBox();
    expect(cancel.width / (cancel.width + save.width)).toBeCloseTo(0.3, 2);
    expect(Math.round(save.height)).toBe(52);
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
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js
```

Expected: 새 두 건이 FAIL이고 앞의 일곱 건은 PASS여야 한다.
- 첫 건: `.conditions-editor-actions`가 없다.
- 둘째 건: 요약 왼쪽 테두리가 6px다.

- [ ] **Step 3: 하단 바 공통 클래스 (`app/globals.css`)**

`.app-shell[data-emergency-bar='on'] .sticky-return { … }` 규칙 바로 뒤에 더한다.

```css
/* 흐름 화면 하단 바(시작·체류 설정·조건 편집기·보호자): 불투명 흰 면 + 1px 윗선(하단 내비와 같은 처리).
   '즉시 복귀' 안전 버튼은 is-flow 없이 늘 고정이다 */
.sticky-return.is-flow {
  background: var(--bg);
  border-top: 1px solid var(--line-strong);
}
/* 두 고정 바(하단 내비·긴급 바 64~69px + 이 바 77~99px)가 키보드 초점이 간 칸을 덮지 않게 */
html:has(.sticky-return.is-flow) {
  scroll-padding-bottom: 184px;
}
/* 세로가 짧은 화면(400% 확대 320×256, 가로 휴대폰)에서는 고정을 풀고 흐름 안에 둔다(WCAG 1.4.10).
   긴급 바·하단 내비는 그대로 바닥에 붙는다 */
@media (max-height: 480px) {
  .sticky-return.is-flow {
    position: static;
    transform: none;
    width: auto;
    max-width: none;
    margin-top: var(--space-6);
    padding: var(--space-3) 0;
  }
  html:has(.sticky-return.is-flow) {
    scroll-padding-bottom: 88px;
  }
}
```

- [ ] **Step 4: 시작·체류 설정 하단 바를 공통 클래스로 (모양은 그대로)**

4-a. `app/page.js`: `className="onboarding-cta sticky-return"`을 `className="onboarding-cta sticky-return is-flow"`로 바꾼다.

4-b. `components/onboarding/OnboardingForm.js`: `className="onboarding-actions sticky-return"`을 `className="onboarding-actions sticky-return is-flow"`로 바꾼다.

4-c. `app/styles/onboarding.css`에서 공통 클래스로 옮겨 간 세 덩어리를 지운다. 지운 자리에는 무엇도 남기지 않는다.
- `.onboarding-cta.sticky-return, .onboarding-actions.sticky-return { background: …; border-top: …; }` 규칙과 그 위 주석
- `@media (max-height: 480px) { … }` 블록과 그 위 주석(두 하단 바의 고정 해제와 그 안의 `html:has(...)`)
- `html:has(.onboarding-actions.sticky-return) { scroll-padding-bottom: …; }` 규칙과 그 위 주석

지우기 전에 세 덩어리의 값이 3단계의 공통 규칙과 같은지 확인한다. 다르면 지우지 말고 보고서에 차이를 적는다. `.onboarding-cta-row`, `.onboarding-actions { display: grid … }`, `.onboarding-actions > .btn:only-of-type`, `.onboarding-actions > .btn-secondary` 같은 배치 규칙은 그대로 둔다.

- [ ] **Step 5: 편집기 하단 바·오류 아이콘·작은 회색 버튼 (`components/conditions/PeriodEditorForm.js`)**

5-a. 오류 요약 제목에 경고 아이콘을 붙인다.

```jsx
          <p className="conditions-error-summary-title">{t('conditions.errorSummary')}</p>
```

위 줄을 아래로 바꾼다.

```jsx
          <p className="conditions-error-summary-title">
            <Icon name="alert" size={20} />
            <span>{t('conditions.errorSummary')}</span>
          </p>
```

5-b. `renderError`의 아이콘을 바꾼다(체류 설정과 같은 오류 모양).

```jsx
        <Icon name="close" size={16} strokeWidth={2.4} />
```

위 줄을 아래로 바꾼다.

```jsx
        <Icon name="alert" size={20} />
```

5-c. `<PeriodEditor`에 넘기던 `actions={ … }` 속성(저장·취소 두 버튼)을 지운다. 그리고 `</PeriodEditor>` 바로 뒤, `</form>` 바로 앞에 하단 바를 더한다.

```jsx
      {/* 하단 고정 바(설계서 6.1): 하단 내비 바로 위에 [취소 3][저장 7] */}
      <div className="conditions-editor-actions sticky-return is-flow">
        <Button variant="secondary" onClick={onCancel}>
          {t('conditions.cancel')}
        </Button>
        <Button type="submit" disabled={readOnly}>
          {t('conditions.save')}
        </Button>
      </div>
```

5-d. 복약 시각 행 삭제 버튼의 `variant="quiet"`를 `variant="secondary"`로 바꾼다(`size="small"`은 그대로). 혼자 놓인 조용한 버튼은 버튼으로 보이지 않는다(②층 넘김 1).

- [ ] **Step 6: 편집기·오류 배치 (`app/styles/conditions.css`)**

6-a. `/* 오류 — 빨강 한 가지에 기대지 않고 … */` 주석부터 `.conditions-alert-title, .conditions-error-summary-title { … }` 규칙 끝까지를 아래로 바꾼다. 뒤의 `.conditions-error-summary ul`, `.conditions-error-summary a`는 그대로 둔다.

```css
/* 오류 문장 (설계서 5.2, 체류 설정과 같은 모양): 20px 경고 아이콘 + 16/22 굵은 긴급 빨강, 왼쪽 띠 없음 */
.conditions-field-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  margin-top: var(--space-2);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--emergency);
}
.conditions-field-error .ui-icon {
  flex: none;
  margin-top: 1px;
}
/* 오류 요약·연결 오류 (SEED Callout 모양): 흰 면 + 1px 긴급 빨강 테두리 · 모서리 10 · 안쪽 14/16.
   제목은 먹색 굵게, 앞 경고 아이콘만 빨강 */
.conditions-alert,
.conditions-error-summary {
  border: 1px solid var(--emergency);
  border-radius: var(--radius-10);
  background: var(--surface);
  padding: 14px var(--space-4);
  margin-bottom: var(--space-4);
}
.conditions-alert p,
.conditions-error-summary li {
  color: var(--ink);
}
.conditions-alert-title,
.conditions-error-summary-title {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  font-weight: var(--weight-bold);
  color: var(--ink);
  margin-bottom: var(--space-1);
}
.conditions-alert-title .ui-icon,
.conditions-error-summary-title .ui-icon {
  flex: none;
  margin-top: 1px;
  color: var(--emergency);
}
```

6-b. `.conditions-subfield { … }`의 `border-left: 3px solid var(--accent-soft);`를 `border-left: 3px solid var(--line-strong);`으로 바꾼다. 그 위 주석 `/* 예를 고른 뒤 따라오는 입력(…) — 들여 쓰고 왼쪽 선으로 묶는다 */`는 아래로 바꾼다.

```css
/* 예를 고른 뒤 따라오는 입력(분·시각·장소·복약 시각): 들여 쓰고 회색 왼쪽 선으로 묶는다(코발트 아님) */
```

6-c. 편집기 절(`/* ─── 편집기 ─── */`)의 `.conditions-med-row .field { … }` 규칙 바로 뒤에 더한다.

```css
/* 편집기 하단 바 [취소 3][저장 7] (설계서 6.1): 면·윗선·짧은 화면 처리는 globals.css 의 .sticky-return.is-flow.
   30% 칸에서도 '取消'·'キャンセル'가 한 줄에 들어가게 '취소'의 좌우 여백을 12px 로 줄인다 */
.conditions-editor-actions {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
  gap: var(--space-2);
}
.conditions-editor-actions > .btn-secondary {
  padding-left: var(--space-3);
  padding-right: var(--space-3);
}
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-conditions.spec.js e2e/screen-start.spec.js e2e/screen-onboarding.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/hospital-link.spec.js e2e/editing.spec.js e2e/responsive.spec.js
```

Expected: PASS. `screen-conditions`는 9건이다. 시작·체류 설정 테스트도 통과해야 하고, 여기에는 하단 바의 면·윗선·짧은 화면 고정 해제·초점 여백 단언이 든다.

- [ ] **Step 8: 문서 두 줄**

8-a. `docs/platform/DESIGN_SYSTEM.md` 부품 표에서 `| 입력 오류 표시 | …` 행 바로 아래에 한 행을 더한다.

```markdown
| 클래스 `.sticky-return.is-flow` | 없음 | 흐름 화면 하단 바(시작·체류 설정·조건 편집기·보호자): 불투명 흰 면 + 1px 윗선, 세로 480px 이하에서 고정 해제, `scroll-padding-bottom` 184px. '즉시 복귀' 안전 버튼은 `is-flow` 없이 늘 고정이다. 회색 바탕 화면(`main.page.is-basement`)은 첫 흰 블록이 상단 바 바로 아래에서 시작하고, 모든 화면 끝 여백은 내비 + 56px(하단 고정 바가 있으면 + 152px) |
```

8-b. `docs/tracking/status.md`의 `- SEED 적용 ③층 3/15 체류 설정 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 4/15 조건 화면: 회색 바탕 위 흰 블록, 기간 목록을 목록 행으로, 삭제·동의 철회는 확인 대화상자(빨간 확인), 이동은 화살표 행, 편집기 [취소 3][저장 7] 하단 고정 바, 오류 표시를 체류 설정과 통일, 하단 바 공통 클래스(.sticky-return.is-flow), 화면 끝 여백 56px. 계획서 `docs/superpowers/plans/2026-10-06-seed-layer3-04-conditions.md`
```

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 104건이다(시간대에 따라 1건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 10: 커밋**

```bash
git add components/conditions/PeriodEditorForm.js app/globals.css app/page.js components/onboarding/OnboardingForm.js app/styles/onboarding.css app/styles/conditions.css e2e/screen-conditions.spec.js docs/platform/DESIGN_SYSTEM.md docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(conditions): 편집기 하단 고정 바, 오류 표시 통일, 하단 바 공통 클래스

- 편집기 저장·취소를 하단 내비 위 고정 바 [취소 3][저장 7]로.
- 흐름 화면 하단 바 규칙을 .sticky-return.is-flow 하나로 모은다(시작·체류 설정·조건 편집기, 모양 그대로).
- 오류 문장은 경고 아이콘 + 16/22 굵은 긴급 빨강, 오류 요약·연결 오류는 1px 빨간 테두리 안내 상자.
- 따라오는 입력 묶음 왼쪽 선을 회색으로, 복약 시각 삭제는 작은 회색 버튼.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 5: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 4 뒤 커밋(작업 후)을 각각 빌드한다. 작업 공간 `evidence/`(git 제외)에 캡처하고, 끝나면 브랜치로 돌아온다.
  - `/conditions`를 360px·320px × ko·en·ja·zh로 찍는다.
  - 장면: 동의 전, 목록, 편집기, 병원 연동 뒤(360 ko)
  - 각 장면을 전체·맨 위·맨 아래로 찍는다.
  - 도구: `.superpowers/sdd/_tools/conditions-shots.mjs`
- [ ] **Step 2: 비교 장면을 보여 준다.**
  - 360px 한국어 목록(맨 위·맨 아래), 동의 전, 편집기(맨 아래, 하단 바), 병원 연동 뒤
  - 320px ja·zh 편집기 하단 바
  - 시작·체류 설정 하단 바(공통 클래스로 옮긴 뒤 모양이 같은지)
  - 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 5번(일정 화면)을 시작하지 않는다.
