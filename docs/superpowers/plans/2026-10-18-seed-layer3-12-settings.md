# SEED ③층 12/15 설정(`/settings`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면을 설계서 6.2 12번 배치로 바꾼다. 회색 바탕 위 흰 블록 네 개를 놓는다.
- **언어:** Radio 행
- **알림:** Switch 행 + 안내
- **민감정보 동의:** 철회 확인의 확인 버튼만 긴급 빨강
- **내 정보:** 지우기 확인은 긴급 빨강(critical)

함께 회색 화면들의 끝 여백을 하나로 맞춘다(9·11번에서 넘긴 일).

**Architecture:** 언어 바꾸기, 알림 권한 요청 시점, 동의 철회·내 정보 지우기의 동작과 문구, 보기 전용 처리는 그대로 두고 표시만 바꾼다.
- **카드 블록:** 섹션 카드(`.card`)를 흰 블록(`.ui-block`)으로 바꾼다.
- **언어 선택:** 카드형 라디오를 설정 화면 안에서만 설계서 5.3의 'Radio 행 in List' 모양으로 바꾼다(원 24px, 고르면 `--selected` 채움 + 흰 점 10px, 행 전체가 누름 자리).
- **알림 켜기:** 체크 상자를 ②층 스위치(`.ui-switch`, `role="switch"`)로 바꾼다.
- **두 확인 버튼:** 동의 철회 시트와 내 정보 지우기의 확인 버튼만 `btn-critical`로 바꾼다.

새 화면 테스트는 `e2e/screen-settings.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(층), 4.6(눌림), 5.1(critical), 5.3(언어 Radio 행, 알림 Switch), 5.5(흰 블록·목록 행), 5.6(Callout)
- 6.1(화면 끝 56px), 6.2 12번 행과 4번 행(운영자 결정: 동의 철회 버튼은 회색, 확인 버튼만 critical)
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외)

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구·주석은 그대로 둔다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, '오늘' 표시, 키보드 초점 링에만 쓴다. 채운 강조 버튼(주·critical)은 화면당 하나다. 두 확인 버튼은 동시에 보이지 않는다(시트가 열리면 나머지는 `inert`).
- **눌림·호버:** 눌림은 면 색(`--pressed*`)을 바꾸고, 버튼·칩·탭은 요소 전체가 조금 줄어든다(설계서 4.6). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다. 색 자체가 상태인 요소(스위치, 고른 라디오)는 눌러도 색을 바꾸지 않는다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 알림 권한은 사용자가 켤 때만 요청한다.
  - '앱이 완전히 닫혀 있으면 알림을 받지 못할 수 있습니다' 안내(두 언어 병기)는 늘 보인다.
  - 동의 철회 효과 목록(두 언어 병기)을 바꾸지 않는다.
  - 내 정보 지우기의 한 번 확인을 바꾸지 않는다.
  - 보기 전용이면 알림·동의 철회를 막는다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/accessibility.spec.js`: '동의 철회' 버튼 → `dialog` '민감정보 동의를 철회할까요?' + axe.
  - `e2e/i18n.spec.js`: `radio` '日本語' check.
  - `e2e/privacy.spec.js`: `radio` 'English' check, 'Delete my data from this device' → 'Cancel' → 'Delete'(exact) → 'Go to the start screen'.
  - `e2e/screen-more.spec.js`, `e2e/screen-conditions.spec.js`(끝 여백 56 이상).
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 167건이고 Task 1 뒤 172 → Task 2 뒤 174건이 된다.
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **키보드로 언어 바꾸기:** 방향키로 라디오를 옮기면 고른 원이 따라오고 행에 초점 링이 보여야 한다(Task 1).
2. **보기 전용(로그인 만료·오프라인):** 스위치가 꺼진 회색 트랙으로 막히고 안내 문장이 보여야 한다. `offline.spec` 흐름으로 확인한다(Task 1, 리뷰에서 확인).
3. **320px 영어:** 'Get return, medicine and hospital alerts' 같은 긴 스위치 라벨과 안내가 줄을 바꾸고 가로 스크롤이 없어야 한다(Task 1).
4. **동의 철회 시트:** 확인 버튼이 긴급 빨강이고, 시트 뒤 언어·알림·내 정보 블록은 눌리지 않아야 한다(Task 2).
5. **내 정보 지우기 확인:** '지우기'가 긴급 빨강이고 '취소'는 회색이어야 한다. 취소하면 처음 버튼으로 돌아와야 한다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕과 블록 | 6.2 12번 | `main`에 `is-basement`. 네 섹션의 `.card`를 `.ui-block`으로 | 구역이 여럿인 화면이다 |
| 언어 | 5.3 'Radio 행 in List: 원 24px, 1px 테두리, 고르면 `--selected` 채움 + 흰 점 10px, 행 전체가 누르는 대상' | 설정 화면 안(`.settings-radio-rows`)에서만 다음처럼 바꾼다. 다른 화면의 카드형 라디오는 그대로다. | 설계서 그대로. 행 끝에 원을 두는 것은 목록 행의 뒤 칸(suffix) 자리다 |
| ↳ 행 | 같은 행 | 카드형 칸을 1px 선으로 나눈 행으로. 이름은 왼쪽, 원은 오른쪽. 고른 행은 이름이 굵게 | 같은 이유 |
| ↳ 원 | 같은 행 | 테두리 `--line-input`(3:1) | 같은 이유 |
| 알림 | 5.3 'Switch' | 체크 상자에 `ui-switch`와 `role="switch"`를 단다. 라벨 줄 전체(52px)가 누름 자리 | 바로 적용되는 설정은 스위치(SEED 규칙). 설계서 7장이 역할 변경(checkbox → switch)을 예고했다 |
| 알림 안내 | 5.6 | 왼쪽 4px 띠 상자 → Callout(회색 면, 모서리 10, 안쪽 14/16, 앞 20px `info` 아이콘), 두 언어 병기 그대로 | 띠 상자는 옅은 면 + 아이콘 |
| 동의 철회 | 6.2 4번 운영자 결정(철회 버튼은 회색, 확인 버튼만 critical) | 철회 버튼은 회색 그대로. 시트의 확인 버튼(`settings.consentConfirm`)을 `critical`로. 시트(역할 `dialog`)는 그대로 | 조건 화면과 같은 결정. 시트를 AlertDialog로 바꾸면 역할이 `alertdialog`가 되어 기존 접근성 테스트의 `dialog` 단언이 깨지고, 두 언어 효과 목록이 들어갈 자리가 없다 |
| 내 정보 지우기 | 6.2 12번 '데이터 지우기(critical)' | 처음 버튼은 회색 그대로, 확인 단계의 '지우기'를 `btn btn-critical btn-small`로. `ClearSessionButton`은 /privacy·하단 고지에서도 쓰므로 그곳 확인 버튼도 함께 빨강이 된다 | 같은 되돌릴 수 없는 동작은 같은 모양 |
| 회색 화면 끝 여백 | 9·11번 넘김, 6.1 화면 끝 56px | `main.page.is-basement > .ui-block:last-child { margin-bottom: 0 }`을 `app/styles/ui.css`에 둔다. 마지막 자식이 블록인 회색 화면(설정·조건 등)은 끝이 56px + 하단 내비로 맞는다. 마지막 자식이 맺음 글인 화면(오늘·장소·카드)은 블록과 맺음 글 사이 8px이 그대로다 | /more만 따로 0이던 것을 공통 규칙으로 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/settings/page.js` | 설정 화면 | 바탕(T1) |
| `components/settings/SettingsScreen.js` | 설정 본문 | 블록·라디오 행·스위치·안내(T1), 시트 확인 버튼(T2) |
| `components/ClearSessionButton.js` | 내 정보 지우기 | 확인 버튼(T2) |
| `app/styles/settings.css` | 설정 배치 | T1·T2 |
| `app/styles/ui.css` | 공용 | 회색 화면 끝 여백 규칙(T1) |
| `e2e/screen-settings.spec.js` | **새** 설정 모양 테스트 | T1이 만들고 T2가 더한다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T2) |

---

### Task 1: 회색 바탕·블록, 언어 Radio 행, 알림 Switch·안내 Callout, 회색 화면 끝 여백

**Files:**
- Create: `e2e/screen-settings.spec.js`
- Modify: `app/settings/page.js`(`<main>` 한 줄)
- Modify: `components/settings/SettingsScreen.js`(네 섹션 `className`, 언어 `div.radio-group`, 알림 체크 상자, 알림 안내)
- Modify: `app/styles/settings.css`(`/* ── /settings (AX-318) ── */` 절)
- Modify: `app/styles/ui.css`(바탕 층 절의 `.ui-block > :last-child` 규칙 근처)

**Interfaces:**
- Consumes:
  - `startTrip`(`e2e/helpers.js`).
  - `.ui-block`, `main.page.is-basement`, `.ui-switch`, `Icon`.
- Produces:
  - 클래스 `settings-radio-rows`, `settings-disclosure-icon`.
  - 테스트 도우미 `styles`, `gapBetween`.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-settings.spec.js`)**

```js
// ③층 설정(/settings): SEED 화면 배치 (설계서 6.2 12번)
//
// 회색 바탕 위 흰 블록 네 개: 언어(Radio 행) / 알림(Switch 행 + 안내) / 민감정보 동의 / 내 정보(지우기).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --selected rgb(42, 48, 56), --line-input rgb(134, 139, 148), --emergency rgb(200, 16, 46).

import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

test.describe('③층 설정, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록 네 개, 첫 블록이 상단 바 바로 아래, 블록 사이 8px, 마지막 블록 아래 틈 0', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const main = page.locator('main.settings-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    await expect(blocks).toHaveCount(4);
    await expect(main.locator('.card')).toHaveCount(0);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
    expect((await styles(blocks.last(), ['margin-bottom']))['margin-bottom']).toBe('0px');
  });

  test('언어 Radio 행: 칸 테두리 없이 선으로 나눈 행, 원 24px, 고른 원은 --selected 채움', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const rows = page.locator('.settings-radio-rows .radio-option');
    await expect(rows).toHaveCount(4);
    expect(await styles(rows.first(), ['border-top-left-radius', 'border-left-width'])).toEqual({
      'border-top-left-radius': '0px',
      'border-left-width': '0px',
    });
    expect((await rows.first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    const korean = page.getByRole('radio', { name: '한국어' });
    await expect(korean).toBeChecked();
    expect((await korean.boundingBox()).width).toBe(24);
    await expect.poll(async () => (await styles(korean, ['background-color']))['background-color']).toBe('rgb(42, 48, 56)');
    const english = page.getByRole('radio', { name: 'English' });
    expect(await styles(english, ['border-top-color', 'border-top-width'])).toEqual({
      'border-top-color': 'rgb(134, 139, 148)',
      'border-top-width': '1px',
    });
  });

  test('알림: 스위치(52×32, role=switch)와 띠 없는 안내 Callout(아이콘 · 모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const sw = page.getByRole('switch', { name: /복귀·복약·병원 일정 알림 받기/ });
    await expect(sw).toBeVisible();
    const box = await sw.boundingBox();
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([52, 32]);
    const note = page.locator('.settings-disclosure');
    expect(
      await styles(note, ['border-left-width', 'border-top-left-radius', 'padding-top', 'background-color']),
    ).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
      'background-color': 'rgb(243, 244, 245)',
    });
    await expect(note.locator('.settings-disclosure-icon svg')).toHaveCount(1);
  });

  test('키보드로 언어를 고르면 행에 초점 링이 보인다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const korean = page.getByRole('radio', { name: '한국어' });
    await korean.focus();
    await page.keyboard.press('ArrowDown');
    const english = page.getByRole('radio', { name: 'English' });
    await expect(english).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const row = page.locator('.settings-radio-rows .radio-option').filter({ has: page.getByRole('radio', { name: 'English' }) });
    await expect.poll(async () => (await styles(row, ['outline-style']))['outline-style']).toBe('solid');
  });

  test('320px English: 설정에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/settings' });
    await expect(page.getByRole('switch')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

(키보드 테스트에서 'English'를 고르면 화면 언어가 영어로 바뀐다. 그 뒤 라디오 이름은 언어 이름 그대로(`LANG_NAMES`)라 찾는 이름은 같다.)

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-settings.spec.js
```

Expected:
- 앞의 세 건은 FAIL이어야 한다.
  - 첫 건: 바탕이 흰색이고 `.card`가 있다.
  - 둘째 건: `.settings-radio-rows`가 없다.
  - 셋째 건: `switch` 역할이 없다.
- 넷째(키보드)·다섯째(320px) 건은 지금도 통과할 수 있다(회귀 가드). 넷째 건이 실패하면 그 이유를 보고서에 적는다.

- [ ] **Step 3: 마크업 (`app/settings/page.js`, `components/settings/SettingsScreen.js`)**

3-a. `app/settings/page.js`의 `<main className="page settings-page">`를 `<main className="page settings-page is-basement">`로 바꾼다.

3-b. `SettingsScreen.js`.
- 머리 주석 끝에 한 줄을 더한다: `// - SEED ③층(설계서 6.2 12번): 회색 바탕 위 흰 블록. 언어(Radio 행) / 알림(Switch 행 + 안내) / 민감정보 동의 / 내 정보.`
- 네 섹션의 `className="card settings-section"`을 `className="ui-block settings-section"`으로 바꾼다. 언어·알림·동의 섹션과 맨 아래 내 정보 섹션 모두 바꾼다.
- 언어의 `<div className="radio-group">`을 `<div className="radio-group settings-radio-rows">`로 바꾼다.
- 알림 체크 상자에 두 속성을 더한다.

```jsx
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          checked={on}
          disabled={readOnly || busy || prefs === null}
          onChange={onChange}
        />
```

- 알림 안내를 아이콘 칸이 있는 Callout으로 바꾼다. `Icon`을 `../ui/index.js` 가져오기에 더한다.

```jsx
      <div className="settings-disclosure" role="note">
        <span className="settings-disclosure-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <PairText k={DISCLOSURE_KEY} />
      </div>
```

- [ ] **Step 4: 모양 (`app/styles/settings.css`, `app/styles/ui.css`)**

4-a. `app/styles/settings.css`의 `/* ── /settings (AX-318) ── */` 제목 줄 바로 아래에 더한다.

```css
/* 설정 (설계서 6.2 12번): 회색 바탕 위 흰 블록. 언어 Radio 행(설계서 5.3) · 알림 Switch 행 + 안내 Callout */

/* 언어 Radio 행 in List: 선으로 나눈 행, 이름 왼쪽 · 원 오른쪽, 원 24px · 1px 테두리, 고르면 --selected 채움 + 흰 점 10px.
   행 전체가 누름 자리. 다른 화면의 카드형 라디오(.radio-option)는 그대로 둔다 */
.settings-radio-rows {
  gap: 0;
}
.settings-radio-rows .radio-option {
  flex-direction: row-reverse;
  justify-content: space-between;
  align-items: center;
  min-height: var(--tap-min);
  padding: var(--space-3) 0;
  border: 0;
  border-radius: 0;
  background: none;
}
.settings-radio-rows .radio-option + .radio-option {
  border-top: 1px solid var(--line);
}
.settings-radio-rows .radio-option.selected {
  box-shadow: none;
  font-weight: var(--weight-bold);
}
.settings-radio-rows .radio-option input {
  appearance: none;
  -webkit-appearance: none;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: 0;
  border: 1px solid var(--line-input);
  border-radius: var(--radius-full);
  background: var(--surface);
}
.settings-radio-rows .radio-option input:checked {
  border-color: var(--selected);
  background: var(--selected);
}
.settings-radio-rows .radio-option input:checked::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--on-dark);
}
```

4-b. 같은 파일의 `.settings-disclosure { … }` 규칙을 아래로 바꾼다.

```css
/* 알림 안내 (SEED Callout, 설계서 5.6): 띠 없이 회색 면 · 모서리 10 · 안쪽 14/16, 앞 20px info 아이콘. 두 언어 병기 */
.settings-disclosure {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-2);
  align-items: start;
  margin-top: var(--space-4);
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
  line-height: var(--lh-body);
}
.settings-disclosure-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: var(--lh-body);
  color: var(--ink);
}
```

4-c. `app/styles/ui.css`의 `.ui-block > :last-child { margin-bottom: 0; }` 규칙 바로 아래에 더한다.

```css
/* 회색 화면의 마지막 흰 블록 아래에는 8px 틈을 두지 않는다: 화면 끝 여백은 main 의 아래 안쪽 여백(56px + 하단 내비)이 맡는다(설계서 6.1).
   마지막 자식이 맺음 글인 화면은 블록과 맺음 글 사이 8px 이 그대로다 */
main.page.is-basement > .ui-block:last-child {
  margin-bottom: 0;
}
```

4-d. `app/styles/settings.css`의 /more 규칙(`.more-page.is-basement > nav > .ui-block:last-child { margin-bottom: 0; }`)은 nav 안 블록이라 4-c가 덮지 못하므로 그대로 둔다.

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-settings.spec.js e2e/i18n.spec.js e2e/privacy.spec.js e2e/accessibility.spec.js e2e/screen-conditions.spec.js e2e/screen-more.spec.js e2e/offline.spec.js
```

Expected: PASS(`screen-settings` 5건과 기존 파일). axe 위반이 나오면 값을 느슨하게 하지 말고 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add app/settings/page.js components/settings/SettingsScreen.js app/styles/settings.css app/styles/ui.css e2e/screen-settings.spec.js
git commit -m "$(cat <<'MSG'
style(settings): 설정을 회색 바탕 위 흰 블록으로, 언어 Radio 행, 알림 스위치·안내 Callout, 회색 화면 끝 여백

- 네 섹션 카드를 흰 블록으로.
- 언어는 선으로 나눈 Radio 행(이름 왼쪽 · 24px 원 오른쪽, 고르면 --selected 채움 + 흰 점).
- 알림 켜기는 스위치(role=switch), 안내는 띠 없는 회색 Callout + info 아이콘(두 언어 병기 유지).
- 회색 화면의 마지막 흰 블록 아래 8px 틈을 없애 화면 끝 여백을 하나로.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 두 확인 버튼을 긴급 빨강(critical)으로, 진행 현황

**Files:**
- Modify: `e2e/screen-settings.spec.js`(파일 끝에 묶음 하나)
- Modify: `components/settings/SettingsScreen.js`(동의 철회 시트 확인 버튼)
- Modify: `components/ClearSessionButton.js`(확인 단계 '지우기' 버튼)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes: Task 1의 `styles`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-settings.spec.js` 끝)**

```js
test.describe('③층 설정, 되돌릴 수 없는 확인', () => {
  test('동의 철회 시트: 확인 버튼만 긴급 빨강, 철회 버튼과 취소는 회색, 시트 뒤 블록은 눌리지 않는다', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const withdraw = page.getByRole('button', { name: '동의 철회' });
    await expect.poll(async () => (await styles(withdraw, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await withdraw.click();
    const sheet = page.getByRole('dialog', { name: '민감정보 동의를 철회할까요?' });
    await expect(sheet).toBeVisible();
    const confirm = sheet.getByRole('button', { name: '철회하기' });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    const cancel = sheet.getByRole('button', { name: '취소' });
    await expect.poll(async () => (await styles(cancel, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await expect(page.locator('section[aria-labelledby="settings-lang-title"]')).toHaveAttribute('inert', '');
    await cancel.click();
    await expect(sheet).toHaveCount(0);
  });

  test('내 정보 지우기: 확인 단계의 지우기만 긴급 빨강, 취소하면 처음 버튼으로', async ({ page }) => {
    await startTrip(page, {}, { path: '/settings' });
    const start = page.getByRole('button', { name: '이 기기에서 내 정보 지우기' });
    await expect.poll(async () => (await styles(start, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await start.click();
    const confirm = page.getByRole('button', { name: '지우기', exact: true });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    const cancel = page.getByRole('button', { name: '취소', exact: true });
    await expect.poll(async () => (await styles(cancel, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    await cancel.click();
    await expect(page.getByRole('button', { name: '이 기기에서 내 정보 지우기' })).toBeVisible();
  });
});
```

(`inert` 속성은 React 19에서 `inert=""`로 그려진다. 다르게 그려지면 실제 값에 맞춘다.)

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-settings.spec.js
```

Expected: 새 두 건이 FAIL이어야 한다(확인 버튼이 코발트·회색이다). Task 1의 다섯 건은 PASS다.

- [ ] **Step 3: 확인 버튼 (`components/settings/SettingsScreen.js`, `components/ClearSessionButton.js`)**

3-a. `SettingsScreen.js` 동의 철회 시트의 `footer`에서 `<Button onClick={() => withdraw(requestClose)}>{t('settings.consentConfirm')}</Button>`을 아래로 바꾼다.

```jsx
              <Button variant="critical" onClick={() => withdraw(requestClose)}>
                {t('settings.consentConfirm')}
              </Button>
```

`ConsentSection` 위 머리 주석의 '동의 철회' 줄 끝에 '(확인 버튼만 긴급 빨강, 운영자 결정 2026-10)'을 덧붙인다.

3-b. `ClearSessionButton.js`의 확인 단계 두 번째 버튼(`onClick={handleClear}`)의 `className="btn btn-secondary btn-small"`을 `className="btn btn-critical btn-small"`로 바꾼다. 취소 버튼과 처음 버튼은 그대로 둔다. 머리 주석의 '되돌릴 수 없으므로 한 번 확인한다.' 줄 끝에 '(확인 버튼은 긴급 빨강)'을 덧붙인다.

- [ ] **Step 4: 진행 현황 한 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 10/15 긴급: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 12/15 설정: 회색 바탕 위 흰 블록 네 개, 언어는 선으로 나눈 Radio 행(24px 원, 고르면 --selected 채움 + 흰 점), 알림은 스위치(role=switch) + 띠 없는 안내 Callout, 동의 철회·내 정보 지우기는 확인 버튼만 긴급 빨강, 회색 화면의 마지막 흰 블록 아래 틈 0(화면 끝 여백 통일). 계획서 `docs/superpowers/plans/2026-10-18-seed-layer3-12-settings.md`
```

- [ ] **Step 5: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 174건이다(시간대에 따라 skip 가능). 단위 테스트는 1,736건 그대로다. `e2e/privacy.spec.js`의 'Delete'(exact) 흐름이 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add components/settings/SettingsScreen.js components/ClearSessionButton.js e2e/screen-settings.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(settings): 동의 철회·내 정보 지우기의 확인 버튼을 긴급 빨강으로

- 동의 철회 시트의 '철회하기'를 critical 로(철회 버튼은 회색, 운영자 결정 2026-10 과 같게).
- 내 정보 지우기 확인 단계의 '지우기'를 critical 로(/privacy·하단 고지에서도 같다).
- 진행 현황 12/15 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전, `git worktree` 임시 폴더, node_modules는 `cp -cR` 복제)과 Task 2 뒤 커밋(작업 후)을 각각 빌드해 /settings를 찍는다.
  - 360px·320px × 네 언어로 찍는다.
  - 360 ko에서는 동의 철회 시트와 지우기 확인 단계도 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 13번(보호자)을 시작하지 않는다.
