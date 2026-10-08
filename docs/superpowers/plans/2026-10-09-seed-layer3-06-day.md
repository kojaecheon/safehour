# SEED ③층 6/15 하루 일정 화면(`/trip/[날짜]`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하루 일정 화면을 설계서 6.2 6번 배치로 바꾼다. 회색 바탕 위 흰 블록에 날짜 칩 줄, 상태, 환자·보호자 전환과 타임라인, 소개, 도구를 놓는다.

**Architecture:** 판정·일정·편집 규칙(`components/trip/viewModel.js`, `useTrip`)은 그대로 두고 표시만 바꾼다. ②층에서 이미 SEED 모양이 된 부품(날짜 칩, 상태 배너, 전환, 타임라인, 장소 카드, 식사 칸)은 그대로 쓰고, 화면 배치와 화면 고유 상자만 손본다. 넘겨받은 항목도 함께 처리한다.
- 알림 상자(`.trip-notice`)를 Callout 모양으로 바꾼다. /trip, /today, 교체·다시 만들기 시트의 실패 알림도 같은 클래스라 함께 바뀐다(의도한 것이다).
- 정거장의 조용한 버튼을 작은 회색 버튼으로 바꾼다.
- 병원 표시가 있는 날짜 칩의 폭을 맞춘다. /trip 목록에서 행이 6px 밀리던 문제다.

새 화면 테스트는 `e2e/screen-day.spec.js`이고, 태스크 셋이 한 묶음씩 더한다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(층), 4.6(눌림), 5.1(버튼), 5.3(날짜 칩·Segmented), 5.5(흰 블록·목록 행), 5.6(Callout·변경됨 알림·출처 영역), 5.9(아이콘)
- 6.1, 6.2 6번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외), ②층 계획 끝 '③층으로 넘기는 것' 1·5

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 주 버튼, 링크, 타임라인 선, '오늘' 표시, 키보드 초점 링에만 쓴다.
- **채운 강조 버튼:** 화면당 하나다. '즉시 복귀' 버튼(먹색 채움)은 안전 지시라 그대로 둔다.
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 상태 이름·사유 문장·병기 언어, 즉시 복귀 지시와 그 강한 모양(2px 먹색 테두리), 출처 표시(병원 발행·본인 체크·기본값 적용), 데모 표시(점선 대기 색)를 바꾸지 않는다.
  - 하루 소개는 판정 영역과 떨어진 별도 영역으로 둔다(정해진 문장은 인용 모양, AI 소개는 SourceArea ai).
- **표시만 바꾼다:** 편집(바꾸기·빼기·식사 칸 비우기·다시 만들기)의 조건과 막는 이유, 시트, 초점 이동 규칙은 그대로 둔다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/editing.spec.js`: `.trip-page [role="status"]` 알림 문구, '바꾸기'·'빼기'·'식사 칸 비우기'·'이 날짜 다시 만들기'.
  - `e2e/accessibility.spec.js`: /trip/[date] 환자·보호자 탭, 빠진 장소 펼침, 시트, 확대.
  - `e2e/core-flow.spec.js`, `e2e/demo-events.spec.js`, `e2e/design-board-components.spec.js`(`.tabs` 모양).
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 115건이고 Task 1 뒤 119 → Task 2 뒤 122 → Task 3 뒤 124건이 된다.
  - `e2e/demo-events.spec.js` 한 건은 시간대에 따라 건너뛸 수 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **매일 확인 전인 오늘:** 알림 상자와 확인 링크가 회색 블록 위에서도 상자 모양으로 보여야 한다(Task 1 알림 테스트).
2. **320px 영어:** 전환 칸('Patient'·'Companion'), 정거장 버튼, 긴 사유 문장에 가로 스크롤이 없어야 한다(Task 1).
3. **병원 일정이 있는 날:** 날짜 칩 폭이 다른 날과 같아야 한다. 칩 줄과 /trip 목록이 모두 그렇다(Task 1).
4. **입력이 필요한 날(동의 없음):** 고칠 곳 상자가 점선 Callout으로 보이고 버튼이 그 안에 있어야 한다(Task 2).
5. **동행 보호자가 없는 날의 보호자 탭:** 잠금 상자가 Callout 모양으로 사유와 함께 보여야 한다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕과 블록 | 6.2 6번 회색 | `main`에 `is-basement`. 블록은 날짜 칩 줄 / 상태(상태 배너·변경됨·즉시 복귀·알림·고칠 곳) / 타임라인(전환·알림 자리·두 패널) / 소개 / 도구(다시 만들기·적용 조건·빠진 장소·데모·출처 문장) | 구역이 여럿인 화면이다(6.1) |
| 날짜 칩 줄 | 5.3 가로 스크롤, 좌우 16 | 블록의 좌우 안쪽 여백을 0으로 두고, 줄 자체에 좌우 16px과 `scroll-padding`을 준다. 칩이 화면 끝까지 흐른다 | 칩이 흰 블록 안쪽 여백에서 잘려 보이지 않게 한다 |
| 날짜 칩 폭 | 넘김(5번) | 상태·병원 표시 원판 둘을 4px 겹친다(아이콘끼리는 겹치지 않는다). 모든 칩이 60px다 | 원판 24 + 24 − 4 = 44, 안쪽 6 × 2, 테두리 2 × 2 → 60. 아이콘 크기는 그대로다(5.9 하한) |
| 날짜 칩 눌림 색 | ②층 넘김 5 | 바꾸지 않는다(SEED `--pressed-weak` + 축소) | SEED 자기 값이다. 축소가 눌림을 함께 알린다 |
| 알림 상자 `.trip-notice` | 5.6 일반 안내 상자 | 왼쪽 코발트 띠를 없애고 회색 면, 모서리 10, 안쪽 14/16. 실패 알림은 대기 색 면 + 1px 대기 선 | 코발트 쓰임 제한. /trip 다시 만들기 알림도 같은 상자다 |
| 변경됨 알림 | 5.6 Callout · actionable | 회색 버튼 + 코발트 점 → 누르는 안내 상자(회색 면, 모서리 10, 앞 먹색 점, 뒤 화살표) | 설계서가 정한 모양이다. 코발트 점을 없앤다 |
| 고칠 곳·보호자 잠금 상자 | 5.6 Callout | 모서리 16 → 10, 안쪽 14/16. 점선(입력 필요)과 분할 색(보호자)은 그대로 | 뜻을 가르는 선·색은 유지한다 |
| 즉시 복귀 배너 | 안전 지시 | 2px 먹색 테두리 유지, 모서리 16 → 12 | 안전 지시의 강한 모양은 지킨다 |
| 정거장 버튼 | ②층 넘김 1 | '빼기'·'식사 칸 비우기'를 조용한 버튼 → 작은 회색 버튼 | 바탕 없는 글자는 버튼으로 보이지 않는다 |
| 하루 소개(정해진 문장) | 5.6 출처 영역 | 바깥 테두리를 없애고 두 줄 왼쪽 띠만 남긴 인용 모양, 자기 흰 블록 | 판정 영역과 떨어진 별도 영역이다. AI 소개(SourceArea ai)도 자기 블록에 든다 |
| 적용 조건·빠진 장소 | 5.5 목록 행 | 카드 테두리를 없애고 도구 블록 안에서 1px 선으로 나눈 펼침 행 | 흰 블록 안 카드는 겹면이다 |
| 데모 사건 패널 | 데모 표시 유지 | 2px 대기 색 점선 유지, 모서리 16 → 12. '되돌리기' 조용한 버튼은 작은 회색 버튼 | 데모를 실제처럼 보이지 않게 하는 표시는 지킨다 |
| 다시 만들기 | 5.1 | 회색 큰 버튼을 그대로 둔다 | 시트를 여는 행동이다(/trip 과 같다) |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `components/trip/DayScreen.js` | 하루 일정 본문 | 블록 감싸기(T1), 변경됨 알림·정거장 버튼(T2) |
| `components/trip/IntroArea.js` | 하루 소개 | 자기 블록(T3) |
| `components/EventPanel.js` | 데모 사건 패널 | 되돌리기 버튼 변형(T3) |
| `app/styles/trip.css` | 전체 일정·하루 일정 배치 | 알림 상자·블록(T1), 상태 상자들(T2), 소개·근거·데모(T3) |
| `app/styles/ui.css` | 공용 부품 | 날짜 칩 표시 원판 겹치기(T1) |
| `e2e/screen-day.spec.js` | **새** ③층 하루 일정 모양 테스트 | T1이 만들고 T2·T3이 더한다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T3) |

---

### Task 1: 회색 바탕·흰 블록·날짜 칩 줄·날짜 칩 폭·알림 상자

**Files:**
- Create: `e2e/screen-day.spec.js`
- Modify: `components/trip/DayScreen.js`(맨 아래 `return (` 안의 `<main>`, `if (!today)` 분기의 `<main>`, `let body;` 아래 세 빈 상태 분기, 날짜 본문 `body = ( <> … </> )`)
- Modify: `app/styles/trip.css`
  - 머리 공통 절의 `.trip-notice`·`.trip-notice p`·`.trip-notice.is-error` 세 규칙
  - `/* ── 하루 일정 (/trip/[date]) ── */` 절 바로 아래에 블록 규칙 추가
- Modify: `app/styles/ui.css`(`.ui-date-marks` 규칙)

**Interfaces:**
- Consumes:
  - `startTrip(page, stayOptions, { path, confirmToday })`, `kstDate(offset)`: `e2e/helpers.js`
  - `.ui-block`, `main.page.is-basement`(위 여백 0, 회색 면): 4번 화면에서 정함
- Produces:
  - 블록 클래스 `trip-strip`(날짜 칩 줄), `trip-status-block`(상태), `trip-timeline-block`(전환·타임라인), `trip-tools-block`(도구). Task 2·3이 이 블록 안 요소를 다룬다.
  - 테스트 도우미 `styles`, `gapBetween`

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-day.spec.js`)**

```js
// ③층 하루 일정(/trip/[날짜]): SEED 화면 배치 (설계서 6.2 6번)
//
// 회색 바탕 위 흰 블록: 날짜 칩 줄 / 상태 / 전환·타임라인 / 소개 / 도구.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음, 어제·모레 병원 일정).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245).

import { test, expect } from './fixtures.js';
import { kstDate, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 하루 일정, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 날짜 칩 줄 / 상태 / 전환·타임라인 / 도구, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    await expect(page.locator('.state-banner')).toBeVisible();

    const main = page.locator('main.trip-day');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(4);
    await expect(blocks.first().locator('.ui-date-strip')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);

    await expect(main.locator(':scope > .trip-status-block .state-banner')).toHaveCount(1);
    await expect(main.locator(':scope > .trip-timeline-block [role="tablist"]')).toHaveCount(1);
    await expect(main.locator(':scope > .trip-tools-block').getByRole('button', { name: '이 날짜 다시 만들기' })).toHaveCount(1);
  });

  test('날짜 칩은 병원 표시가 있어도 모두 60px (칩 줄과 전체 일정 목록)', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const strip = page.locator('.ui-date-strip a.ui-date-chip');
    await expect(strip).not.toHaveCount(0);
    await expect(page.locator('.ui-date-strip .ui-date-appt')).not.toHaveCount(0);
    const widths = await strip.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect([...new Set(widths)]).toEqual([60]);

    await page.goto('/trip');
    await expect(page.locator('.trip-day-row').first()).toBeVisible();
    const listWidths = await page
      .locator('.trip-day-row a.ui-date-chip')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect([...new Set(listWidths)]).toEqual([60]);
  });

  test('알림 상자(매일 확인 전인 오늘): 왼쪽 띠 없는 회색 면 · 모서리 10 · 안쪽 14', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(0)}`, confirmToday: false });
    const notice = page.locator('.trip-notice').first();
    await expect(notice).toBeVisible();
    await expect
      .poll(() => styles(notice, ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top']))
      .toEqual({
        'border-left-width': '0px',
        'border-top-left-radius': '10px',
        'background-color': 'rgb(243, 244, 245)',
        'padding-top': '14px',
      });
  });

  test('320px English: 하루 일정에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { path: `/trip/${kstDate(1)}` });
    await expect(page.locator('.state-banner')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('tab', { name: /Companion/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js
```

Expected: 앞의 세 건이 FAIL이어야 한다.
- 첫 건: 바탕이 흰색이고 `.ui-block`이 없다.
- 둘째 건: 병원 표시가 있는 칩이 66px다.
- 셋째 건: 알림 상자 왼쪽 띠가 4px다.
- 넷째 건(320px)은 지금도 통과할 수 있다(회귀 가드).

- [ ] **Step 3: 블록 감싸기 (`components/trip/DayScreen.js`)**

3-a. 파일 머리 주석의 `//   - 시트는 뒤로 가기로 시트만 닫힌다.` 줄 아래에 한 줄을 더한다.

```js
//   - SEED ③층(설계서 6.2 6번): 회색 바탕 위 흰 블록. 날짜 칩 줄 / 상태 / 전환·타임라인 / 소개 / 도구.
```

3-b. `if (!today) { return ( … ) }` 분기의 `<main>`을 아래로 바꾼다.

```jsx
        <main className="page trip-page trip-day is-basement">
          <div className="ui-block">
            <p className="trip-loading" role="status">
              {t('trip.loading')}
            </p>
          </div>
        </main>
```

3-c. `let body;` 아래 세 빈 상태 분기(`!stay`, `!valid || !inStay`, `!day`)의 `body = ( <EmptyState … /> );` 각각을 `<div className="ui-block">`로 감싼다. 예:

```jsx
    body = (
      <div className="ui-block">
        <EmptyState
          icon="navTrip"
          title={t('today.noStayTitle')}
          body={t('today.noStayBody')}
          action={<Button href="/onboarding">{t('today.noStayAction')}</Button>}
        />
      </div>
    );
```

(나머지 두 분기도 `EmptyState` 속성은 그대로 두고 감싸기만 한다.)

3-d. 날짜 본문 `body = ( <> … </> );` 안을 네 묶음으로 나눈다. 안의 요소·조건·속성은 그대로 두고 감싸기만 한다.
- `<StateBanner …/>`부터 `{fix && ( … )}`까지를 `<div className="ui-block trip-status-block"> … </div>`로 감싼다. 상태 배너, 변경됨, 즉시 복귀, 매일 확인 전 알림, 확인 전 병원 안내 알림, 고칠 곳이 여기에 든다.
- `<div className="tabs" …>`부터 `{['P', 'G'].map(…)}`(두 패널)까지를 `<div className="ui-block trip-timeline-block"> … </div>`로 감싼다. 전환, 알림 자리(`role="status"`), 두 패널이 여기에 든다.
- `<IntroArea … />`는 감싸지 않는다(Task 3에서 자기 블록을 갖는다).
- `<section className="trip-tools" …>`부터 `<p className="trip-footer" …>`까지를 `<div className="ui-block trip-tools-block"> … </div>`로 감싼다. 다시 만들기, 적용 조건, 빠진 장소, 데모 패널, 출처 문장이 여기에 든다.

3-e. 맨 아래 `return (`의 `<main>`과 날짜 칩 줄, 실패 알림을 아래로 바꾼다. 실패 알림은 자기 블록에 든다.

```jsx
      <main className="page trip-page trip-day is-basement">
        {stripDates.length > 0 && (
          <nav className="ui-block trip-strip" aria-label={t('trip.stripLabel')}>
            <ul className="ui-date-strip" role="list">
```

(`<ul>` 안의 `stripDates.map(…)`은 그대로 둔다.)

```jsx
        {trip.updateFailed && (
          <div className="ui-block">
            <div className="trip-notice is-error" role="alert">
              <p>{t('today.updateFailedTitle')}</p>
              <p>{t('today.updateFailedBody')}</p>
              {!trip.readOnly && (
                <Button variant="secondary" size="small" onClick={() => trip.retry()}>
                  {t('today.retry')}
                </Button>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 4: 날짜 칩 표시 원판 (`app/styles/ui.css`)**

`.ui-date-marks { … }` 규칙을 아래로 바꾼다.

```css
/* 상태·병원 표시 원판 둘은 4px 겹쳐 칩 폭 60px 안에 든다(원판 안쪽 여백이 4px 라 아이콘끼리는 겹치지 않는다) */
.ui-date-marks {
  display: inline-flex;
  align-items: center;
  margin-top: var(--space-0-5);
}
.ui-date-marks > * + * {
  margin-left: calc(var(--space-1) * -1);
}
```

- [ ] **Step 5: 알림 상자와 블록 배치 (`app/styles/trip.css`)**

5-a. 머리 공통 절의 `.trip-notice { … }`, `.trip-notice p { … }`, `.trip-notice.is-error { … }` 세 규칙(과 그 위 주석)을 아래로 바꾼다. `.trip-notice-slot:empty` 규칙은 그대로 둔다.

```css
/* 알림 상자 (SEED Callout · neutral, 설계서 5.6): 왼쪽 띠 없이 회색 면 · 모서리 10 · 안쪽 14/16 */
.trip-notice {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink);
}
.trip-notice p {
  color: var(--ink);
}
/* 실패 알림: 오류 빨강 대신 대기 색 면 + 1px 대기 선(판정 상태와 헷갈리지 않게 문구로 밝힌다) */
.trip-notice.is-error {
  border: 1px solid var(--state-standby-line);
  background: var(--state-standby-bg);
}
```

5-b. `/* ── 하루 일정 (/trip/[date]) ── */` 절 제목 줄 바로 아래에 더한다.

```css
/* 하루 일정 (설계서 6.2 6번): 회색 바탕 위 흰 블록. 블록 틈(8px)이 간격을 주므로 화면 공통 세로 간격을 끈다 */
.trip-day.is-basement {
  gap: 0;
}
.trip-status-block,
.trip-timeline-block,
.trip-tools-block {
  display: grid;
  gap: var(--space-3);
}
.trip-timeline-block > .tabs {
  margin-bottom: 0;
}
/* 날짜 칩 줄: 블록 좌우 안쪽 여백을 줄로 옮겨 칩이 화면 끝까지 흐른다 */
.ui-block.trip-strip {
  padding: var(--space-3) 0;
}
.trip-strip .ui-date-strip {
  padding: var(--space-1) var(--gutter) var(--space-2);
  scroll-padding-inline: var(--gutter);
}
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js e2e/screen-trip.spec.js e2e/editing.spec.js e2e/accessibility.spec.js e2e/core-flow.spec.js e2e/demo-events.spec.js
```

Expected: PASS. `screen-day` 4건과 기존 다섯 파일이 모두 통과해야 한다. axe 위반이 나오면 값을 바꾸거나 테스트를 느슨하게 하지 말고 멈추고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add components/trip/DayScreen.js app/styles/trip.css app/styles/ui.css e2e/screen-day.spec.js
git commit -m "$(cat <<'MSG'
style(day): 하루 일정을 회색 바탕 위 흰 블록으로, 날짜 칩 폭 60px, 알림 상자 Callout

- 하루 일정을 회색 바탕 위 흰 블록으로: 날짜 칩 줄 / 상태 / 전환·타임라인 / 도구.
- 날짜 칩 줄은 화면 끝까지 흐른다(블록 좌우 여백을 줄로 옮김).
- 상태·병원 표시 원판을 4px 겹쳐 병원 일정 날 칩도 60px(전체 일정 목록 행이 밀리지 않는다).
- 알림 상자(.trip-notice)는 왼쪽 코발트 띠 없이 회색 면 · 모서리 10, 실패 알림은 대기 색 면 + 1px 선.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 상태 블록의 상자들과 정거장 버튼

**Files:**
- Modify: `e2e/screen-day.spec.js`(파일 끝에 묶음 하나)
- Modify: `components/trip/DayScreen.js`(변경됨 버튼, `StopActions`의 조용한 버튼 두 곳)
- Modify: `app/design-board/ScreenPreviews.js`(하루 일정 미리보기의 변경됨 버튼 한 곳, 같은 마크업으로)
- Modify: `app/styles/trip.css`(하루 일정 절의 `.trip-changed`, `.trip-changed-dot`, `.trip-return-banner`, `.trip-fix`, `.trip-guardian-lock`)

**Interfaces:**
- Consumes: Task 1의 `styles`·`gapBetween`, 블록 구조, `Icon`(DayScreen이 이미 가져온다)
- Produces: 변경됨 알림은 `button.trip-changed`이고, 안에 `.trip-changed-dot`, `.trip-changed-text`, 화살표 아이콘이 있다.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-day.spec.js` 끝)**

```js
test.describe('③층 하루 일정, 상태 상자와 정거장 버튼', () => {
  test('정거장 버튼: 바꾸기·빼기가 모두 작은 회색 버튼', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const actions = page.locator('.trip-stop-actions').first();
    await expect(actions).toBeVisible();
    for (const button of await actions.locator('button').all()) {
      await expect
        .poll(() => styles(button, ['background-color', 'min-height', 'border-top-left-radius']))
        .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'min-height': '44px', 'border-top-left-radius': '8px' });
    }
  });

  test('입력이 필요한 날: 고칠 곳 상자는 점선 Callout(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: `/trip/${kstDate(1)}` });
    const fix = page.locator('.trip-fix');
    await expect(fix).toBeVisible();
    expect(await styles(fix, ['border-top-style', 'border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-style': 'dashed',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
  });

  test('동행 보호자가 없는 날의 보호자 탭: 잠금 상자는 Callout(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, { hasCompanion: false }, { path: `/trip/${kstDate(1)}` });
    await page.getByRole('tab', { name: /보호자/ }).click();
    const lock = page.locator('.trip-guardian-lock');
    await expect(lock).toBeVisible();
    expect(await styles(lock, ['border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js
```

Expected: 새 세 건이 FAIL이고 Task 1의 네 건은 PASS여야 한다.
- 첫 건: '빼기'가 투명하다.
- 둘째·셋째 건: 모서리가 16px다.

- [ ] **Step 3: 변경됨 알림과 정거장 버튼 (`components/trip/DayScreen.js`)**

3-a. 변경됨 버튼을 누르는 안내 상자로 바꾼다.

```jsx
        {delta?.unseen && (
          <button type="button" className="btn btn-secondary trip-changed" onClick={() => setSheet({ kind: 'delta' })}>
            <span className="trip-changed-dot" aria-hidden="true" />
            {t('trip.changedCta')}
          </button>
        )}
```

위 부분을 아래로 바꾼다.

```jsx
        {/* 변경됨 알림 (SEED Callout · actionable, 설계서 5.6): 누르면 전후 비교 시트 */}
        {delta?.unseen && (
          <button type="button" className="trip-changed" onClick={() => setSheet({ kind: 'delta' })}>
            <span className="trip-changed-dot" aria-hidden="true" />
            <span className="trip-changed-text">{t('trip.changedCta')}</span>
            <Icon name="chevronRight" size={18} />
          </button>
        )}
```

3-a2. `app/design-board/ScreenPreviews.js`의 하루 일정 미리보기(`DayDetailScreen` 근처, `className="btn btn-secondary trip-changed"`)도 같은 마크업으로 바꾼다. 미리보기라 `onClick`은 없다. `Icon`이 이미 가져와져 있지 않으면 `@/components/ui/index.js` 가져오기에 더한다.

```jsx
        {delta?.unseen && (
          <button type="button" className="trip-changed">
            <span className="trip-changed-dot" aria-hidden="true" />
            <span className="trip-changed-text">{t('trip.changedCta')}</span>
            <Icon name="chevronRight" size={18} />
          </button>
        )}
```

3-b. `StopActions`의 두 조용한 버튼(`className="btn btn-quiet btn-small"`, '식사 칸 비우기'와 '빼기')을 `className="btn btn-secondary btn-small"`로 바꾼다. 안의 글자·`aria-disabled`·숨긴 글자는 그대로 둔다.

- [ ] **Step 4: 상태 상자들 (`app/styles/trip.css`)**

하루 일정 절의 `.trip-changed { … }`, `.trip-changed-dot { … }`, `.trip-return-banner { … }`, `.trip-fix { … }`, `.trip-guardian-lock { … }` 다섯 규칙을 아래로 바꾼다. 각 규칙에 딸린 하위 규칙(`.trip-return-banner h2`, `.trip-fix h2`, `.trip-guardian-lock p`, `.trip-guardian-lock.is-locked` 등)은 그대로 둔다.

```css
/* 변경됨 알림 (SEED Callout · actionable): 회색 면 · 모서리 10, 앞 먹색 점 · 뒤 화살표. 누르면 전후 비교 시트 */
.trip-changed {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--tap-min);
  padding: 14px var(--space-4);
  border: none;
  border-radius: var(--radius-10);
  background: var(--surface-alt);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.trip-changed-text {
  flex: 1;
  min-width: 0;
}
.trip-changed .ui-icon {
  flex: none;
  color: var(--ink-subtle);
}
.trip-changed:active {
  background: var(--pressed-weak);
}
@media (hover: hover) and (pointer: fine) {
  .trip-changed:hover {
    background: var(--pressed-weak);
  }
}
.trip-changed-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: var(--radius-full);
  background: var(--ink);
}
/* 즉시 복귀 배너: 안전 지시라 2px 먹색 테두리를 지킨다. 모서리만 12 */
.trip-return-banner {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 2px solid var(--ink);
  border-radius: var(--radius-12);
  background: var(--surface);
}
/* 고칠 곳 (Callout 모양, 입력 필요의 점선 유지): 모서리 10 · 안쪽 14/16 */
.trip-fix {
  display: grid;
  gap: var(--space-2);
  padding: 14px var(--space-4);
  border: 1px dashed var(--line-input);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
/* 보호자 잠금·안내 (Callout 모양, 분할 색 유지): 모서리 10 · 안쪽 14/16 */
.trip-guardian-lock {
  display: grid;
  gap: var(--space-2);
  padding: 14px var(--space-4);
  margin-bottom: var(--space-3);
  border: 1px solid var(--state-split-line);
  border-radius: var(--radius-10);
  background: var(--state-split-bg);
}
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js e2e/editing.spec.js e2e/accessibility.spec.js e2e/demo-events.spec.js e2e/design-board.spec.js e2e/design-board-components.spec.js
```

Expected: PASS(`screen-day` 7건 + 기존 다섯 파일). `editing.spec.js`의 '빼기'·'식사 칸 비우기' 흐름이 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add components/trip/DayScreen.js app/design-board/ScreenPreviews.js app/styles/trip.css e2e/screen-day.spec.js
git commit -m "$(cat <<'MSG'
style(day): 상태 블록 상자들과 정거장 버튼을 SEED 모양으로

- 변경됨 알림은 누르는 안내 상자(회색 면, 먹색 점, 화살표). 코발트 점 제거.
- 고칠 곳(점선)·보호자 잠금(분할 색)은 모서리 10 · 안쪽 14/16 Callout, 즉시 복귀는 2px 먹색 테두리 유지 · 모서리 12.
- 정거장의 '빼기'·'식사 칸 비우기'를 작은 회색 버튼으로.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 소개 블록·도구 블록(적용 조건·빠진 장소·데모) + 진행 현황

**Files:**
- Modify: `e2e/screen-day.spec.js`(파일 끝에 묶음 하나)
- Modify: `components/trip/IntroArea.js`(두 `return`)
- Modify: `components/EventPanel.js`('되돌리기' 조용한 버튼 한 곳)
- Modify: `app/styles/trip.css`(`.trip-facts`·`.trip-facts > summary`, `.trip-intro`, `.trip-demo`, `.trip-demo-button` 규칙)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes: Task 1의 `styles`, 블록 구조(`trip-tools-block`)
- Produces: 소개 블록 `div.ui-block.trip-intro-block`

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-day.spec.js` 끝)**

```js
test.describe('③층 하루 일정, 소개와 도구', () => {
  test('적용 조건·빠진 장소: 카드 없이 도구 블록 안에서 1px 선으로 나눈 펼침 행', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const facts = page.locator('.trip-tools-block .trip-facts');
    await expect(facts.first()).toBeVisible();
    for (const row of await facts.all()) {
      expect(await styles(row, ['border-left-width', 'border-top-left-radius', 'border-top-width'])).toEqual({
        'border-left-width': '0px',
        'border-top-left-radius': '0px',
        'border-top-width': '1px',
      });
    }
  });

  test('하루 소개(정해진 문장): 자기 흰 블록 안의 인용 모양(두 줄 왼쪽 띠, 바깥 테두리 없음)', async ({ page }) => {
    await startTrip(page, {}, { path: `/trip/${kstDate(1)}` });
    const intro = page.locator('.trip-intro-block .trip-intro, .trip-intro-block .ui-source').first();
    await expect(intro).toBeVisible({ timeout: 15_000 });
    const isTemplate = await intro.evaluate((el) => el.classList.contains('trip-intro'));
    if (isTemplate) {
      expect(await styles(intro, ['border-left-style', 'border-top-width'])).toEqual({
        'border-left-style': 'double',
        'border-top-width': '0px',
      });
    }
    expect((await styles(page.locator('.trip-intro-block'), ['background-color']))['background-color']).toBe(
      'rgb(255, 255, 255)',
    );
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js
```

Expected: 새 두 건이 FAIL이고 앞의 일곱 건은 PASS여야 한다.
- 첫 건: 근거 상자 모서리가 16px다.
- 둘째 건: `.trip-intro-block`이 없다.

- [ ] **Step 3: 소개 블록 (`components/trip/IntroArea.js`)**

두 `return`을 각각 `<div className="ui-block trip-intro-block"> … </div>`로 감싼다. 안의 `SourceArea`·`section`은 그대로 둔다. 머리 주석에 한 줄을 더한다: `// 하루 일정의 흰 블록 하나를 차지한다(설계서 6.2 6번 소개 블록). 소개가 없으면 블록도 그리지 않는다.`

```jsx
  if (intro.source === 'AI') {
    return (
      <div className="ui-block trip-intro-block">
        <SourceArea source="ai" title={t('trip.introTitle')} note={t('trip.introAiNote')}>
          <p>{intro.text}</p>
        </SourceArea>
      </div>
    );
  }
  return (
    <div className="ui-block trip-intro-block">
      <section className="trip-intro" aria-labelledby={labelId}>
        <p className="trip-intro-head" id={labelId}>
          <Icon name="quote" size={18} />
          <span>{t('trip.introTemplateLabel')}</span>
        </p>
        <p className="trip-intro-text">{intro.text}</p>
      </section>
    </div>
  );
```

- [ ] **Step 4: 데모 패널 버튼 (`components/EventPanel.js`)**

'되돌리기' 버튼의 `className="btn btn-quiet btn-small"`(79행 근처)을 `className="btn btn-secondary btn-small"`로 바꾼다. 글자·속성은 그대로 둔다.

- [ ] **Step 5: 근거·소개·데모 모양 (`app/styles/trip.css`)**

5-a. `.trip-facts { … }`와 `.trip-facts > summary { … }` 두 규칙을 아래로 바꾼다. 뒤의 `.trip-facts-body`부터는 그대로 둔다.

```css
/* 근거, 적용한 조건·빠진 장소 (SEED 목록 행): 도구 블록 안에서 카드 없이 1px 선으로 나눈 펼침 행 */
.trip-facts {
  border: none;
  border-top: 1px solid var(--line);
  border-radius: 0;
  background: none;
  padding: 0;
}
.trip-facts > summary {
  min-height: var(--tap-min);
  padding: var(--space-2) 0;
  gap: var(--space-2);
}
```

5-b. `.trip-intro { … }` 규칙을 아래로 바꾼다.

```css
/* 하루 소개(정해진 문장): 판정 영역과 떨어진 인용 모양. 자기 흰 블록 안에서 바깥 테두리 없이 두 줄 왼쪽 띠만 */
.trip-intro {
  padding: var(--space-1) 0 var(--space-1) var(--space-4);
  border-left: 4px double var(--line-input);
}
```

5-c. `.trip-demo { … }` 규칙의 `border-radius: var(--radius-16);`를 `border-radius: var(--radius-12);`로 바꾼다. 2px 점선 대기 색 테두리는 데모 표시라 그대로 둔다.

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-day.spec.js e2e/accessibility.spec.js e2e/demo-events.spec.js e2e/design-board.spec.js
```

Expected: PASS(`screen-day` 9건 + 기존 세 파일). `accessibility.spec.js`의 '빠진 장소와 사유' 펼침 axe도 여기에 든다.

- [ ] **Step 7: 진행 현황 한 줄**

`docs/tracking/status.md`의 `- SEED 적용 ③층 5/15 일정 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 6/15 하루 일정 화면: 회색 바탕 위 흰 블록(날짜 칩 줄 / 상태 / 전환·타임라인 / 소개 / 도구), 날짜 칩 폭 60px 통일, 알림 상자·변경됨 알림·고칠 곳·보호자 잠금을 Callout 모양으로, 정거장 '빼기' 작은 회색 버튼, 소개는 인용 모양 블록, 근거는 펼침 행. 계획서 `docs/superpowers/plans/2026-10-09-seed-layer3-06-day.md`
```

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 124건이다(시간대에 따라 1건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 9: 커밋**

```bash
git add components/trip/IntroArea.js components/EventPanel.js app/styles/trip.css e2e/screen-day.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(day): 소개 블록과 도구 블록(근거 펼침 행, 데모 패널)을 SEED 모양으로

- 하루 소개는 자기 흰 블록, 정해진 문장은 바깥 테두리 없이 두 줄 왼쪽 띠 인용 모양.
- 적용한 조건·빠진 장소는 카드 없이 도구 블록 안 1px 선 펼침 행.
- 데모 패널은 점선 대기 색 유지 · 모서리 12, '되돌리기'는 작은 회색 버튼.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 4: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 3 뒤 커밋(작업 후)을 각각 빌드한다. `/trip/[날짜]`를 찍고, 끝나면 브랜치로 돌아온다.
  - 360px·320px × ko·en·ja·zh
  - 장면: 내일 환자 탭, 보호자 탭. 360 ko는 오늘과 입력 필요(동의 없음)도 찍는다.
  - 각 장면을 전체·맨 위·맨 아래로 찍는다.
  - 도구: `.superpowers/sdd/_tools/day-shots.mjs`
- [ ] **Step 2: 비교 장면을 보여 준다.** 360px 한국어 환자 탭(맨 위·맨 아래), 보호자 탭, 오늘, 입력 필요, 320px 영어·일본어, 그리고 /trip 목록(날짜 칩 폭)을 보여 준다. 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 7번(오늘)을 시작하지 않는다.
