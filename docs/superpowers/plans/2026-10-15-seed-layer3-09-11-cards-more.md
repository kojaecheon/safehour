# SEED ③층 9/15 한국어 카드(`/cards`) + 11/15 더보기(`/more`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 작은 화면 두 개를 설계서 6.2 9번·11번 배치로 바꾼다. 운영자 결정(2026-10-06)에 따라 작은 화면은 묶어서 한 번에 확인받는다.
- **/cards:** 회색 바탕 위에 칩 줄 블록과 한국어 카드 블록을 놓는다.
- **/more:** 회색 바탕 위에 목록 묶음 두 개(도구·정보)를 놓고, 목록 행에 화살표를 붙인다.

**Architecture:** 카드 내용(`cardModel`, 고정 문구), 오프라인 읽기, 메뉴 목적지는 그대로 두고 표시만 바꾼다.
- /cards는 섹션마다 흰 블록이 된다. 위의 바로가기 칩은 SEED 칩 모양이 된다.
- /more는 ②층 목록 행 부품(`ListGroup`·`ListHeader`·`ListItem`)으로 다시 그린다.

새 화면 테스트는 `e2e/screen-cards.spec.js`와 `e2e/screen-more.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(층), 4.6(눌림), 5.3(칩: 카드 종류 선택 Chip Tabs), 5.5(흰 블록·목록 행), 5.6(Callout)
- 6.1, 6.2 9번·11번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외)

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 새 문구는 /more 목록 머리 두 개(도구·정보)뿐이고, 네 언어를 모두 채운다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, 타임라인 선, '오늘' 표시, 키보드 초점 링에만 쓴다.
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 카드의 한국어 문장은 고정 문구이고, AI를 쓰지 않는다.
  - 복귀·병원 카드는 주소 글자만 보이고 좌표·지도 링크를 두지 않는다.
  - 매일 확인 전 안전 문구 병기와 한국어 원문 없음 경고(대기 색 점선)를 지킨다.
  - 보기 전용·오프라인에서도 카드가 모두 보인다.
- **표시만 바꾼다:** 다음은 그대로 둔다.
  - 카드 내용과 순서(식이 → 이동 → 복귀 → 병원).
  - `#cards-diet` 같은 바로가기 주소(장소 상세·복귀 시트가 쓴다).
  - /more 메뉴의 목적지·이름·설명.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/offline.spec.js`: /cards에서 '한국어 안내 카드' 제목, '이 숙소로 가 주세요', 병원 이름이 바로 보여야 한다.
  - `e2e/privacy.spec.js`: /more에서 '개인정보와 면책 안내' 링크.
  - `e2e/design-board.spec.js`: /more에 시안 보드 링크가 없어야 한다.
  - `e2e/accessibility.spec.js`, `e2e/responsive.spec.js`, `e2e/network.spec.js`.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 149건이고 Task 1 뒤 155 → Task 2 뒤 158건이 된다.
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다(demo-events 한 건, 장소 상세 오늘 정거장 한 건).
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **바로가기 칩을 누른 직후:** 그 카드 제목이 고정 상단 바에 가리지 않아야 한다(Task 1).
2. **매일 확인 전:** 이동 카드 위 안전 문구가 대기 색 안내 상자(아이콘 + 병기 문구)로 보여야 한다(Task 1).
3. **체류가 없는 사람이 /cards를 열 때:** 빈 상태가 회색 바탕 위가 아니라 흰 블록 안에 보여야 한다(Task 1).
4. **320px 영어:** 칩 네 개와 카드에 가로 스크롤이 없어야 한다(Task 1). /more 목록 행도 같다(Task 2).
5. **/more 목록 행:** 설명까지 두 줄이어도 행 전체가 누름 자리이고 화살표가 보여야 한다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| /cards 칩 줄 | 5.3 '카드 종류 선택 Chip Tabs · neutralSolid, 고른 칩 `--selected`' | 칩은 지금처럼 **바로가기 링크**로 두고 모양만 SEED 칩으로 바꾼다. 44px 알약, 회색 채움(`--surface-alt`), 16px. 고른 상태 표시는 두지 않는다 | 탭처럼 한 장만 보이게 하면 오프라인에서 '이 숙소로 가 주세요'·병원 카드가 바로 보이지 않는다. 기존 오프라인 안전 테스트가 이를 요구한다. 네 장을 모두 보이는 쪽이 안전하다. 운영자가 원하면 탭 전환은 따로 한다 |
| /cards 블록 | 6.2 9번 | `main`에 `is-basement`. 첫 블록(안내 문장·날짜·칩 줄·체류 밖 안내)과 카드 묶음 네 블록(식이·이동·복귀·병원). 불러오는 중·빈 상태는 흰 블록 안 | 구역이 여럿인 화면이다 |
| 한국어 카드 틀 | ②층 KoreanCard | 그대로(벚꽃 윗띠·테두리). 회색 바탕에서는 그림자가 꺼진다 | 직원·기사에게 보여 주는 '카드' 자체라 틀을 지킨다 |
| 안내 상자 | 5.6 Callout | `.cards-note`·`.cards-pending`을 모서리 10, 안쪽 14/16으로. 매일 확인 전 상자는 대기 색 면·선·아이콘 그대로. 한국어 원문 없음 점선 경고는 모서리만 10 | 같은 뜻은 같은 모양 |
| 바로가기 위치 | 사람 기대 | 카드 묶음 블록의 `scroll-margin-top`을 고정 상단 바 높이만큼 준다 | 지금은 바로가기로 가면 제목이 상단 바 밑에 가려진다 |
| /more 묶음 | 6.2 11번 '목록 묶음 두 개(도구 · 정보), 목록 행 + 화살표' | 도구: 한국어 안내 카드·보호자 링크·조건·체류 수정·설정. 정보: 개인정보와 면책 안내. 각 묶음은 흰 블록 하나, 머리(`ListHeader`) + 목록 행(앞 아이콘 22 · 제목 · 설명 · 화살표) | 설정은 쓰는 기능이라 도구에 둔다. 정보에는 고지만 남는다 |
| /more 새 문구 | 11번 묶음 이름 | `settings.moreGroupTools`(도구·Tools·ツール·工具), `settings.moreGroupInfo`(정보·Information·情報·信息) | 묶음 이름 없이는 두 묶음을 나눈 뜻이 전해지지 않는다 |
| 옛 /more 카드 규칙 | 정리 | `app/styles/settings.css`의 `.settings-menu*` 규칙을 지운다(/more만 썼다) | 쓰지 않는 규칙 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/cards/page.js` | /cards | 바탕·첫 블록(T1) |
| `components/cards/TodayCards.js` | 카드 본문 | 섹션 블록·빈 상태 블록(T1) |
| `app/styles/cards.css` | 카드 배치 | 칩·블록·안내 상자(T1) |
| `e2e/screen-cards.spec.js` | **새** 카드 모양 테스트 | T1 |
| `app/more/page.js` | /more | 목록 묶음(T2) |
| `src/i18n/messages/settings.js` | 문구 | 묶음 이름 두 개(T2) |
| `app/styles/settings.css` | 설정·더보기 | `.settings-menu*` 삭제, 바탕(T2) |
| `e2e/screen-more.spec.js` | **새** 더보기 모양 테스트 | T2 |
| `docs/tracking/status.md` | 진행 현황 | 두 줄(T2) |

---

### Task 1: /cards 회색 바탕·칩 줄·카드 블록

**Files:**
- Create: `e2e/screen-cards.spec.js`
- Modify: `app/cards/page.js`
- Modify: `components/cards/TodayCards.js`(`Section`, 불러오는 중·빈 상태 반환, 본문 반환)
- Modify: `app/styles/cards.css`

**Interfaces:**
- Consumes:
  - `startTrip`, `loginDemo`(`e2e/helpers.js`).
  - `.ui-block`, `main.page.is-basement`.
- Produces:
  - 블록 클래스 `cards-top-block`과 `ui-block cards-section`.
  - 테스트 도우미 `styles`, `gapBetween`.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-cards.spec.js`)**

```js
// ③층 한국어 카드(/cards): SEED 화면 배치 (설계서 6.2 9번)
//
// 회색 바탕 위 흰 블록: 첫 블록(안내·날짜·바로가기 칩) / 식이 / 이동 / 복귀 / 병원.
// 칩은 바로가기 링크다(카드 네 장이 늘 모두 보인다: 오프라인 안전 테스트). 모양만 SEED 칩.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --state-standby-bg rgb(255, 244, 217).

import { test, expect } from './fixtures.js';
import { loginDemo, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 한국어 카드, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 첫 블록(칩 줄)이 상단 바 바로 아래, 카드 묶음 네 블록, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    const main = page.locator('main.cards-page');
    await expect(main.locator('.cards-jump')).toBeVisible();
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const top = main.locator(':scope > .cards-top-block');
    await expect(top.locator('.cards-jump')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await top.boundingBox())).toBe(0);
    const sections = main.locator(':scope > .ui-block.cards-section');
    await expect(sections).toHaveCount(4);
    expect(gapBetween(await top.boundingBox(), await sections.first().boundingBox())).toBe(8);
    // 카드 네 장이 늘 모두 보인다(바로가기 칩은 탭이 아니다)
    await expect(page.getByText('이 숙소로 가 주세요')).toBeVisible();
  });

  test('바로가기 칩: 44px 회색 알약, 테두리 없음, 16px', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    const chips = page.locator('.cards-jump a');
    await expect(chips).toHaveCount(4);
    for (const chip of await chips.all()) {
      await expect
        .poll(() => styles(chip, ['background-color', 'border-top-width', 'font-size']))
        .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-width': '0px', 'font-size': '16px' });
      expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('바로가기를 누르면 그 카드 제목이 상단 바에 가리지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards' });
    await page.locator('.cards-jump').getByRole('link', { name: '병원 카드' }).click();
    await expect(page).toHaveURL(/#cards-hospital$/);
    const heading = page.locator('#cards-hospital-title');
    await expect(heading).toBeVisible();
    await expect
      .poll(async () => {
        const bar = await page.locator('.top-bar').boundingBox();
        const box = await heading.boundingBox();
        return Math.round(box.y) >= Math.round(bar.y + bar.height);
      })
      .toBe(true);
  });

  test('매일 확인 전: 이동 카드 위 안내는 대기 색 안내 상자(모서리 10 · 안쪽 14, 아이콘)', async ({ page }) => {
    await startTrip(page, {}, { path: '/cards', confirmToday: false });
    const pending = page.locator('#cards-move .cards-pending');
    await expect(pending).toBeVisible();
    expect(await styles(pending, ['border-top-left-radius', 'padding-top', 'background-color'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(255, 244, 217)',
    });
    await expect(pending.locator('svg')).toHaveCount(1);
  });

  test('체류가 없으면 빈 상태가 흰 블록 안에 보인다', async ({ page }) => {
    await loginDemo(page, '/cards');
    const empty = page.locator('main.cards-page > .ui-block .ui-empty');
    await expect(empty).toBeVisible();
  });

  test('320px English: 한국어 카드 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { path: '/cards' });
    await expect(page.locator('.cards-jump')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-cards.spec.js
```

Expected:
- 앞의 다섯 건은 FAIL이어야 한다.
  - 첫 건: 바탕이 흰색이다.
  - 둘째 건: 칩에 1px 테두리, 흰 면이다.
  - 셋째 건: 제목이 상단 바에 가려진다.
  - 넷째 건: 모서리가 16px다.
  - 다섯째 건: `.ui-block`이 없다.
- 여섯째 건(320px)은 지금도 통과할 수 있다(회귀 가드).

셋째 건이 지금도 통과하면 보고서에 그대로 적는다(그래도 Step 4의 `scroll-margin-top`은 넣는다).

- [ ] **Step 3: 블록 감싸기 (`app/cards/page.js`, `components/cards/TodayCards.js`)**

3-a. `app/cards/page.js`의 `<main>`을 아래로 바꾼다. 안내 문장은 첫 블록에 들어간다. 그래서 `TodayCards`가 첫 블록의 나머지(날짜·칩 줄·체류 밖 안내)를 같은 블록에 이어 그릴 수 있게, 안내 문장을 `TodayCards`에 넘긴다.

```jsx
      <main className="page cards-page is-basement">
        <TodayCards intro={<p className="cards-intro">{t('cards.intro')}</p>} />
      </main>
```

3-b. `components/cards/TodayCards.js`.
- 머리 주석 끝에 한 줄을 더한다: `// - SEED ③층(설계서 6.2 9번): 회색 바탕 위 흰 블록. 첫 블록(안내·날짜·바로가기 칩) / 식이 / 이동 / 복귀 / 병원. 칩은 바로가기 링크다(카드는 늘 모두 보인다).`
- `export default function TodayCards()`를 `export default function TodayCards({ intro = null })`로 바꾼다.
- `Section`의 `<section className="cards-section" …>`을 `<section className="ui-block cards-section" …>`으로 바꾼다. 나머지 속성(`id`, `aria-labelledby`, `tabIndex`)은 그대로 둔다.
- 불러오는 중 반환을 아래로 바꾼다.

```jsx
    return (
      <div className="ui-block cards-top-block">
        {intro}
        <div className="loading-block">
          <div className="spinner" aria-hidden="true" />
        </div>
      </div>
    );
```

- 빈 상태 반환은 `EmptyState` 속성을 그대로 두고 감싼다.

```jsx
    return (
      <>
        <div className="ui-block cards-top-block">{intro}</div>
        <div className="ui-block">
          <EmptyState
            icon="quote"
            title={t('cards.emptyTitle')}
            body={t('cards.emptyBody')}
            action={<Button href="/onboarding">{t('cards.emptyAction')}</Button>}
          />
        </div>
      </>
    );
```

- 본문 반환의 앞부분(`<p className="cards-date">`부터 `{outsideStay && <Note>…</Note>}`까지)을 첫 블록에 담는다. 네 `Section`은 그대로 둔다.

```jsx
    <>
      <div className="ui-block cards-top-block">
        {intro}
        <p className="cards-date">{t('cards.todayLabel', { date: formatDate(date, locale) })}</p>

        <nav className="cards-jump" aria-label={t('cards.jumpAria')}>
          <ul role="list">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{t(section.key)}</a>
              </li>
            ))}
          </ul>
        </nav>

        {outsideStay && <Note>{t('cards.outsideStay')}</Note>}
      </div>

      {/* 네 Section 은 지금 그대로 */}
```

(마지막 주석은 '이 아래는 바꾸지 않는다'는 표시다. 실제 코드에서는 지금의 네 `Section` 블록을 그대로 두고 주석은 넣지 않는다.)

- [ ] **Step 4: 모양 (`app/styles/cards.css`)**

4-a. `/* ── /cards (AX-318) ── */` 제목 줄 바로 아래에 더한다.

```css
/* 한국어 카드 (설계서 6.2 9번): 회색 바탕 위 흰 블록. 첫 블록(안내·날짜·칩 줄) / 카드 묶음 네 블록 */
.cards-top-block {
  display: grid;
  gap: var(--space-3);
}
.cards-top-block > * {
  margin-bottom: 0;
}
```

4-b. `.cards-jump ul`, `.cards-jump a`, `.cards-jump a:hover` 세 규칙을 아래로 바꾼다.

```css
/* 바로가기 칩 (설계서 5.3 Chip · neutral): 44px 회색 알약, 테두리 없음, 16px. 바로가기 링크라 고른 상태는 없다 */
.cards-jump ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
}
.cards-jump a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  background: var(--surface-alt);
  color: var(--ink);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  text-decoration: none;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.cards-jump a:active {
  background: var(--pressed-weak);
}
@media (hover: hover) and (pointer: fine) {
  .cards-jump a:hover {
    background: var(--pressed-weak);
  }
}
```

4-c. `.cards-section { … }` 규칙을 아래로 바꾼다. `.cards-section:focus`와 `.cards-section-title`은 그대로 둔다.

```css
/* 카드 묶음 블록. 바로가기로 오면 고정 상단 바(최소 56px + 안전 영역) 밑에 제목이 가리지 않게 그만큼 띄운다 */
.cards-section {
  scroll-margin-top: calc(56px + env(safe-area-inset-top));
}
```

4-d. `.cards-note { … }` 규칙을 아래로 바꾼다.

```css
/* 안내 상자 (SEED Callout, 설계서 5.6): 회색 면 · 모서리 10 · 안쪽 14/16 */
.cards-note {
  display: grid;
  gap: var(--space-1);
  justify-items: start;
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
  margin-bottom: var(--space-3);
}
```

4-e. `.cards-fallback`의 `border-radius: var(--radius-12);`를 `border-radius: var(--radius-10);`로 바꾼다. 점선·대기 색은 그대로 둔다.

4-f. `.cards-pending { … }` 규칙을 아래로 바꾼다. 하위 규칙은 그대로 둔다.

```css
/* 매일 확인 전 안내 (Callout 모양, 대기 색 면·선·모래시계 아이콘·병기 문구 유지): 모서리 10 · 안쪽 14/16 */
.cards-pending {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: 14px var(--space-4);
  margin-bottom: var(--space-3);
  border: 1px solid var(--state-standby-line);
  border-radius: var(--radius-10);
  background: var(--state-standby-bg);
  color: var(--state-standby-ink);
}
```

4-g. `.cards-intro`와 `.cards-date`의 `margin-bottom`은 첫 블록 grid 간격이 맡으므로 지운다(4-a의 `> * { margin-bottom: 0 }`로도 덮인다. 둘 중 하나만 남겨도 된다).

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-cards.spec.js e2e/offline.spec.js e2e/accessibility.spec.js e2e/responsive.spec.js e2e/network.spec.js e2e/editing.spec.js
```

Expected: PASS(`screen-cards` 6건과 기존 파일). 오프라인 테스트의 '이 숙소로 가 주세요'·병원 이름 단언이 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add app/cards/page.js components/cards/TodayCards.js app/styles/cards.css e2e/screen-cards.spec.js
git commit -m "$(cat <<'MSG'
style(cards): 한국어 카드를 회색 바탕 위 흰 블록으로, 바로가기 칩 SEED 모양

- 첫 블록(안내·날짜·바로가기 칩)과 카드 묶음 네 블록(식이·이동·복귀·병원). 빈 상태·불러오는 중도 흰 블록 안.
- 바로가기 칩은 44px 회색 알약(테두리 없음). 카드 네 장은 늘 모두 보인다(오프라인 안전).
- 바로가기로 가도 카드 제목이 고정 상단 바에 가리지 않게 scroll-margin-top.
- 안내 상자·매일 확인 전 상자는 모서리 10 · 안쪽 14/16, 한국어 원문 없음 점선 경고는 모서리 10.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: /more 목록 묶음 두 개(도구·정보), 진행 현황

**Files:**
- Create: `e2e/screen-more.spec.js`
- Modify: `app/more/page.js`
- Modify: `src/i18n/messages/settings.js`(`'settings.moreMenuAria'` 줄 아래 두 줄)
- Modify: `app/styles/settings.css`(`/* ── /more (AX-318) ── */` 절)
- Modify: `docs/tracking/status.md`(두 줄)

**Interfaces:**
- Consumes:
  - `ListGroup`, `ListHeader`, `ListItem`, `Icon`, `TopBar`(`@/components/ui/index.js`).
  - `startTrip`(`e2e/helpers.js`).
- Produces: 문구 키 `settings.moreGroupTools`, `settings.moreGroupInfo`

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-more.spec.js`)**

```js
// ③층 더보기(/more): SEED 화면 배치 (설계서 6.2 11번)
//
// 회색 바탕 위 흰 블록 두 개: 도구(한국어 안내 카드·보호자 링크·조건·체류 수정·설정) / 정보(개인정보와 면책 안내).
// 각 블록은 목록 머리 + 목록 행(앞 아이콘 · 제목 · 설명 · 화살표).

import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 더보기, 목록 묶음 두 개', () => {
  test('회색 바탕 위 흰 블록 두 개: 도구(5행) · 정보(1행), 첫 블록이 상단 바 바로 아래, 블록 사이 8px', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    const main = page.locator('main.more-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator('.ui-block');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0).getByRole('heading', { name: '도구' })).toBeVisible();
    await expect(blocks.nth(1).getByRole('heading', { name: '정보' })).toBeVisible();
    await expect(blocks.nth(0).locator('.ui-list > li')).toHaveCount(5);
    await expect(blocks.nth(1).locator('.ui-list > li')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.nth(0).boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
  });

  test('목록 행: 목적지 그대로, 행 전체가 링크, 화살표, 높이 44 이상', async ({ page }) => {
    await startTrip(page, {}, { path: '/more' });
    const expected = [
      ['한국어 안내 카드', '/cards'],
      ['보호자 링크', '/guardian'],
      ['조건', '/conditions'],
      ['개인정보와 면책 안내', '/privacy'],
    ];
    for (const [name, href] of expected) {
      const row = page.locator('main.more-page').getByRole('link', { name: new RegExp(name) });
      await expect(row).toHaveAttribute('href', href);
      await expect(row).toHaveClass(/ui-list-item/);
      await expect(row.locator('.ui-list-item-trailing svg')).toHaveCount(1);
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('main.more-page a[href="/onboarding?edit=1"]')).toHaveCount(1);
    await expect(page.locator('main.more-page a[href="/settings"]')).toHaveCount(1);
  });

  test('320px English: 더보기에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/more' });
    await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

('조건'은 `common.navConditions`의 한국어 값이다. 실제 값이 다르면 그 값으로 맞춘다. 단언 뜻은 바꾸지 않는다.)

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-more.spec.js
```

Expected: 세 건 모두 FAIL이어야 한다.
- 첫 건: `main.more-page`가 없다.
- 둘째 건: 행이 `ui-list-item`이 아니다.
- 셋째 건: 'Tools' 제목이 없다.

- [ ] **Step 3: 문구 (`src/i18n/messages/settings.js`)**

`'settings.moreMenuAria': …` 줄 바로 아래에 두 줄을 더한다.

```js
  'settings.moreGroupTools': { ko: '도구', en: 'Tools', ja: 'ツール', zh: '工具' },
  'settings.moreGroupInfo': { ko: '정보', en: 'Information', ja: '情報', zh: '信息' },
```

- [ ] **Step 4: 목록 묶음 (`app/more/page.js`)**

파일 전체를 아래로 바꾼다. 메뉴 항목(목적지·아이콘·이름·설명 키)은 지금 것을 그대로 쓰고 두 묶음으로 나눈다.

```jsx
'use client';

// /more — 더보기 (AX-318 · spec 3.1)
//
// 하단 내비 네 번째 탭. 카드·보호자·조건·체류 수정·설정·고지로 가는 입구만 모은다.
// 저장소를 읽거나 쓰지 않는다 — 보기 전용·오프라인에서도 그대로 보인다. 쓰기 제한은 각 화면이 한다.
// SEED ③층(설계서 6.2 11번): 회색 바탕 위 흰 블록 두 개(도구 · 정보), 목록 행 + 화살표.

import { useLang } from '@/components/LanguageProvider.js';
import { Icon, ListGroup, ListHeader, ListItem, TopBar } from '@/components/ui/index.js';

/** 메뉴 묶음: 머리 문구 키와 항목(이름·설명 문구 키, 아이콘) */
const GROUPS = Object.freeze([
  {
    id: 'more-tools',
    label: 'settings.moreGroupTools',
    items: [
      { href: '/cards', icon: 'quote', label: 'cards.header', desc: 'settings.moreCardsDesc' },
      { href: '/guardian', icon: 'stateTogether', label: 'settings.moreGuardian', desc: 'settings.moreGuardianDesc' },
      { href: '/conditions', icon: 'navConditions', label: 'common.navConditions', desc: 'settings.moreConditionsDesc' },
      { href: '/onboarding?edit=1', icon: 'navTrip', label: 'settings.moreStay', desc: 'settings.moreStayDesc' },
      { href: '/settings', icon: 'globe', label: 'settings.header', desc: 'settings.moreSettingsDesc' },
    ],
  },
  {
    id: 'more-info',
    label: 'settings.moreGroupInfo',
    items: [{ href: '/privacy', icon: 'lock', label: 'privacy.link', desc: 'settings.morePrivacyDesc' }],
  },
]);

export default function MorePage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('settings.moreHeader')} />
      <main className="page settings-page more-page is-basement">
        <nav aria-label={t('settings.moreMenuAria')}>
          {GROUPS.map((group) => (
            <section key={group.id} className="ui-block" aria-labelledby={`${group.id}-h`}>
              <ListHeader id={`${group.id}-h`}>{t(group.label)}</ListHeader>
              <ListGroup>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <ListItem
                      title={t(item.label)}
                      description={t(item.desc)}
                      leading={<Icon name={item.icon} size={22} />}
                      trailing="chevron"
                      href={item.href}
                    />
                  </li>
                ))}
              </ListGroup>
            </section>
          ))}
        </nav>
      </main>
    </>
  );
}
```

`ListHeader`는 기본 `h2`다. `.ui-block:has(> .ui-list)`는 목록 행이 좌우 여백을 스스로 갖게 블록의 좌우 안쪽 여백을 0으로 둔다. 머리는 자기 좌우 여백(`--gutter`)을 갖는다.

- [ ] **Step 5: 옛 규칙 정리와 바탕 (`app/styles/settings.css`)**

`/* ── /more (AX-318) ── */` 제목 줄과 그 아래 `.settings-menu`부터 `.settings-menu-chevron`까지 규칙 모두를 아래로 바꾼다.

```css
/* ── /more (설계서 6.2 11번): 회색 바탕 위 흰 블록 두 개(도구 · 정보), 목록 행(components/ui ListItem) ── */
.more-page.is-basement > nav > .ui-block:last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 6: 진행 현황 두 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 8/15 장소 상세: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 9/15 한국어 카드: 회색 바탕 위 흰 블록(안내·날짜·바로가기 칩 / 식이 / 이동 / 복귀 / 병원), 바로가기 칩 44px 회색 알약(카드 네 장은 늘 모두 보임, 오프라인 안전), 바로가기 뒤 제목이 상단 바에 가리지 않음, 안내 상자 모서리 10. 계획서 `docs/superpowers/plans/2026-10-15-seed-layer3-09-11-cards-more.md`
- SEED 적용 ③층 11/15 더보기: 회색 바탕 위 목록 묶음 두 개(도구 · 정보), 목록 행(앞 아이콘 · 제목 · 설명 · 화살표), 그림자 카드 메뉴 제거. 같은 계획서
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-more.spec.js e2e/privacy.spec.js e2e/design-board.spec.js e2e/accessibility.spec.js
```

Expected: PASS(`screen-more` 3건과 기존 파일). `privacy.spec.js`의 /more 고지 링크 단언이 그대로 통과해야 한다.

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 158건이다(시간대에 따라 1~2건 skip). 단위 테스트는 1,736건 그대로다. 문구 사전 테스트가 키 수를 세면 새 키 두 개가 네 언어 모두 있는지로 통과해야 한다.

- [ ] **Step 9: 커밋**

```bash
git add app/more/page.js src/i18n/messages/settings.js app/styles/settings.css e2e/screen-more.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(more): 더보기를 회색 바탕 위 목록 묶음 두 개(도구 · 정보)로

- 그림자 카드 메뉴를 목록 행(앞 아이콘 · 제목 · 설명 · 화살표)으로, 묶음은 각자 흰 블록.
- 묶음 이름 문구 두 개(도구·정보, 네 언어).
- 쓰지 않는 .settings-menu 규칙 삭제.
- 진행 현황: 9/15 · 11/15 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 2 뒤 커밋(작업 후)을 각각 빌드한다.
  - /cards와 /more를 360px·320px × 네 언어로 찍는다.
  - /cards는 360 ko에서 매일 확인 전도 찍는다.
  - 찍기 전에 e2e 캐시 시각을 새로 고친다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 칩을 탭(한 장씩 보기)으로 바꿀지도 함께 묻는다. 승인 전에는 ③층 10번(긴급)을 시작하지 않는다.
