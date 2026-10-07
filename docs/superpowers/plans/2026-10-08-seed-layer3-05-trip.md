# SEED ③층 5/15 일정 화면(`/trip`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전체 일정의 날짜 목록을 설계서 6.2 5번 배치로 바꾼다. 흰 바탕 한 장이고, 날짜마다 목록 행 하나(날짜 · 상태 · 장소 수 · 화살표)다.

**Architecture:** 판정·일정 규칙과 행 자료(`tripDateRows`)는 그대로 두고 표시만 바꾼다.
- 날짜 행은 카드 테두리·모서리·면을 없애고 행 사이 1px 선으로 나눈다. 끝에 화살표를 둔다.
- 행 전체를 그 날짜로 가는 마우스 누름 자리로 만든다. 이미 있는 제목 링크(키보드·스크린리더에서 숨긴 링크)를 행 크기로 늘리는 방식이다. 키보드·스크린리더는 지금처럼 날짜 칩 링크 하나만 만난다.
- 날짜 칩(②층 `DateChip`)은 그대로 둔다. 상태 아이콘, '오늘' 테두리, 병원 일정 표시가 한 자리에 모여 있고, 6번 하루 일정 화면의 날짜 칩 줄과 같은 부품이다.

새 화면 테스트는 `e2e/screen-trip.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`. 이 계획이 따르는 절은 아래와 같다.
- 5.3: 날짜 칩
- 5.4: 배지 모양(모서리 6)
- 5.5: 목록 행·구분선
- 4.6: 눌림·호버
- 6.1, 6.2 5번 행

넘김 메모는 `.superpowers/sdd/_tools/carry-over.md`(git 제외)에 있다.

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
- **코발트(`--accent`):** 주 버튼, 링크, '오늘' 표시, 키보드 초점 링에만 쓴다. 이 화면의 '변경됨' 표시는 코발트를 쓰지 않는다.
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **표시만 바꾼다:**
  - 날짜 분류, 상태, 사유, 고칠 곳(`needsInputFix`), 다시 만들기 규칙은 그대로다.
  - 상태 이름·사유 문장·병기 언어(`lang`)도 그대로 둔다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/core-flow.spec.js`: '일정' 내비 → '전체 일정' 제목, 화면에 '동행 가능'.
  - `e2e/accessibility.spec.js`: `/trip` axe, 200% 확대, 터치 대상.
  - `e2e/design-board.spec.js`: `/trip` 경로.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 110건 → 이 계획 뒤 112건이다.
  - `e2e/demo-events.spec.js` 한 건은 시간대에 따라 건너뛸 수 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms와 경쟁하지 않게).

## 이 계획이 정한 것

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 날짜 행 | 6.2 5번 '목록 행(날짜 · 상태 배지 · 장소 수 · 화살표)' | 카드 테두리·모서리 16·면을 없앤다. 행 사이는 1px `--line`이고, 끝에 화살표 18px(`--ink-subtle`)를 둔다 | 흰 바탕 한 장 화면의 목록 행이다 |
| 날짜 칩 | 5.3 | 행 앞에 그대로 둔다(60×92) | 상태 아이콘·'오늘' 테두리(허용된 코발트)·병원 표시가 한 자리에 있다. 스크린리더 문장(전체 날짜·오늘·상태·병원 일정)과 키보드 링크도 그대로다 |
| 행 누름 자리 | 5.5 행 전체가 누르는 대상 | 숨긴 제목 링크를 행 크기로 늘린다(`::after`). 날짜 칩과 고칠 곳 링크는 그 위에 둔다. 눌림·호버는 행 면 `--pressed-transparent` | 마우스로 행 어디를 눌러도 그 날짜로 간다. 키보드 순서와 읽히는 이름은 바뀌지 않는다 |
| 지난 날 | 없음 | 회색 카드 면을 없애고 날짜 제목만 `--ink-soft`로 둔다 | 순서와 '오늘' 표시가 지난 날을 알린다. 회색 면은 눌린 행처럼 보인다 |
| '변경됨'·'즉시 복귀' 표시 | 5.4 배지 모양 | 모서리 8 → 6, 위아래 4 · 좌우 8, 14/19 굵게. '변경됨'은 코발트 면을 회색 면 + 3:1 테두리로 바꾼다. '즉시 복귀'는 먹색 채움을 그대로 둔다 | 코발트 쓰임 제한. '즉시 복귀'는 안전 지시라 눈에 띄는 모양을 유지한다 |
| 알림 상자(`.trip-notice`) | 5.6 | **이 계획에서 하지 않는다** | 하루 일정 화면(6번)과 함께 쓰는 상자라 6번에서 다룬다 |
| 다시 만들기 버튼 | 5.1 | 회색 큰 버튼을 그대로 둔다 | 시트를 여는 행동이라 이동 행이 아니다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/trip/page.js` | 전체 일정 | 행에 `data-date`, 제목 링크 클래스, 화살표, `Icon` import |
| `app/styles/trip.css` | 전체 일정·하루 일정 배치 | `/* ── 날짜 목록 (/trip) ── */` 절(`.trip-days`부터 `.trip-return-tag`까지) |
| `e2e/screen-trip.spec.js` | **새** ③층 일정 화면 모양 테스트 | 만든다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄 |

---

### Task 1: 날짜 목록을 SEED 목록 행으로

**Files:**
- Create: `e2e/screen-trip.spec.js`
- Modify: `app/trip/page.js` (import 한 줄, `<li>` 한 줄, 제목 `<Link>` 한 줄, 정보 `</div>` 뒤 화살표, 머리 주석 한 줄)
- Modify: `app/styles/trip.css` (`/* ── 날짜 목록 (/trip) ── */` 주석부터 `.trip-return-tag { … }` 규칙 끝까지)
- Modify: `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes:
  - `startTrip(page, stayOptions, { path })`: 로그인 → 체류 심기 → 이동 → 일정 저장까지 기다린다(`e2e/helpers.js`).
  - `DateChip` 링크 클래스 `ui-date-chip`
  - `needsInputFix(day).href`: `/conditions` 또는 체류 설정 주소
- Produces: 날짜 행 `<li class="trip-day-row" data-date="YYYY-MM-DD">`, 행 크기로 늘린 제목 링크 `.trip-day-link`, 화살표 `.trip-day-chevron`

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-trip.spec.js`)**

```js
// ③층 전체 일정(/trip): SEED 화면 배치 (설계서 6.2 5번)
//
// 흰 바탕 한 장, 날짜마다 목록 행 하나: [날짜 칩][날짜 · 상태 · 장소 수 · 사유][화살표]. 행 사이 1px 선.
// 행 전체가 그 날짜로 가는 마우스 누름 자리이고, 키보드·스크린리더는 날짜 칩 링크 하나만 만난다.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음).

import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

test.describe('③층 전체 일정, 날짜 목록 행', () => {
  test('카드 없는 목록 행: 테두리·모서리·면 없음, 행 사이 1px 선, 끝에 화살표, 날짜 칩은 그대로', async ({ page }) => {
    await startTrip(page, {}, { path: '/trip' });
    const rows = page.locator('.trip-day-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(3);

    // 지난 날(어제)을 포함해 어느 행도 카드 면이 없다
    for (const row of await rows.all()) {
      await expect
        .poll(() => styles(row, ['border-left-width', 'border-top-left-radius', 'background-color']))
        .toEqual({ 'border-left-width': '0px', 'border-top-left-radius': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
      await expect(row.locator('.trip-day-chevron svg')).toHaveCount(1);
      await expect(row.locator('a.ui-date-chip')).toHaveCount(1);
    }
    await expect(page.locator('.trip-day-row.is-past')).not.toHaveCount(0);

    // 둘째 행부터 위에 1px 선
    expect(await styles(rows.nth(1), ['border-top-width', 'border-top-style'])).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'solid',
    });
  });

  test('행의 빈 자리를 누르면 그 날짜로 가고, 입력 필요 행의 고칠 곳 링크는 따로 눌린다', async ({ page }) => {
    await startTrip(page, { consent: false }, { path: '/trip' });

    // 화살표 자리(행 링크를 늘린 누름 자리 위)를 마우스로 누르면 그 날짜 화면으로 간다
    const row = page.locator('.trip-day-row').nth(1);
    const date = await row.getAttribute('data-date');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const box = await row.locator('.trip-day-chevron').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(new RegExp(`/trip/${date}$`));

    // 고칠 곳 링크는 행 누름 자리에 덮이지 않고 제 주소로 간다
    await page.goBack();
    await expect(page.locator('.trip-day-row').first()).toBeVisible();
    const fix = page.locator('.trip-day-fix a').first();
    const href = await fix.getAttribute('href');
    await fix.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-trip.spec.js
```

Expected: 두 건 모두 FAIL이어야 한다.
- 첫 건: 행 테두리가 `1px`이고 모서리가 `16px`다.
- 둘째 건: `data-date`가 없다(`null`).

- [ ] **Step 3: 행 마크업 (`app/trip/page.js`)**

3-a. import 줄을 바꾼다.

```js
import { Button, DateChip, EmptyState, TopBar } from '@/components/ui/index.js';
```

위 줄을 아래로 바꾼다.

```js
import { Button, DateChip, EmptyState, Icon, TopBar } from '@/components/ui/index.js';
```

3-b. 머리 주석의 `//   - 일정은 기기 저장소의 확정 일정만 읽는다. …` 줄 아래에 한 줄을 더한다.

```js
//   - SEED ③층(설계서 6.2 5번): 흰 바탕 한 장, 날짜마다 목록 행 [날짜 칩][날짜 · 상태 · 장소 수 · 사유][화살표].
```

3-c. 날짜 행 `<li>`에 날짜를 단다.

```jsx
            <li key={row.date} className={row.isPast ? 'trip-day-row is-past' : 'trip-day-row'}>
```

위 줄을 아래로 바꾼다.

```jsx
            <li key={row.date} data-date={row.date} className={row.isPast ? 'trip-day-row is-past' : 'trip-day-row'}>
```

3-d. 제목 링크에 클래스를 단다. 주석도 바꾼다(행 전체로 늘린다는 뜻).

```jsx
                  {/* 날짜 칩과 같은 곳으로 가는 마우스용 넓은 누름 자리 — 키보드·스크린리더는 날짜 칩 링크 하나만 만난다 */}
                  <Link href={`/trip/${row.date}`} tabIndex={-1} aria-hidden="true">
```

위 두 줄을 아래로 바꾼다.

```jsx
                  {/* 날짜 칩과 같은 곳으로 가는 마우스 누름 자리, CSS 로 행 전체로 늘린다. 키보드·스크린리더는 날짜 칩 링크 하나만 만난다 */}
                  <Link className="trip-day-link" href={`/trip/${row.date}`} tabIndex={-1} aria-hidden="true">
```

3-e. 정보 묶음 `<div className="trip-day-info"> … </div>`가 끝나는 줄 바로 뒤, `</li>` 바로 앞에 화살표를 더한다.

```jsx
              <span className="trip-day-chevron" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
```

- [ ] **Step 4: 행 배치 (`app/styles/trip.css`)**

`/* ── 날짜 목록 (/trip) ── */` 주석부터 `.trip-return-tag { … }` 규칙 끝까지를 모두 아래로 바꾼다. 범위에는 `.trip-days`, `.trip-day-row`, `.trip-day-row.is-past`, `.trip-day-info`, `.trip-day-title`, `.trip-day-meta`, `.trip-state-text`, 상태 네 색, `.trip-day-count`, 사유 목록 규칙, 두 표시 규칙이 든다. 뒤의 `/* ── 하루 일정 (/trip/[date]) ── */`부터는 그대로 둔다.

사유 목록 규칙(`.trip-day-reasons, .trip-delta-reasons, .trip-facts-warnings`)은 하루 일정 화면도 쓰므로 그대로 옮겨 둔다.

```css
/* ── 날짜 목록 (/trip): SEED 목록 행, 흰 바탕 한 장(설계서 6.2 5번) ──
   [날짜 칩][날짜 · 상태 · 장소 수 · 사유][화살표]. 카드 테두리 없이 행 사이 1px 선.
   행 전체가 그 날짜로 가는 마우스 누름 자리다(제목 링크를 행 크기로 늘림). 키보드·스크린리더는 날짜 칩 링크 하나만 만난다 */
.trip-days {
  list-style: none;
}
.trip-day-row {
  position: relative;
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3) 0;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.trip-day-row + .trip-day-row {
  border-top: 1px solid var(--line);
}
/* 제목 링크를 행 전체로 늘린다. 날짜 칩과 고칠 곳 링크는 그 위에 두어 제 동작을 지킨다 */
.trip-day-link {
  color: inherit;
  text-decoration: none;
}
.trip-day-link::after {
  content: '';
  position: absolute;
  inset: 0;
}
.trip-day-row .ui-date-chip,
.trip-day-fix a {
  position: relative;
  z-index: 1;
}
/* 눌림·호버는 행 면 색만 바꾼다 */
.trip-day-row:has(.trip-day-link:active) {
  background: var(--pressed-transparent);
}
@media (hover: hover) and (pointer: fine) {
  .trip-day-row:has(.trip-day-link:hover) {
    background: var(--pressed-transparent);
  }
}
.trip-day-chevron {
  flex: none;
  align-self: center;
  display: inline-grid;
  place-items: center;
  color: var(--ink-subtle);
}
.trip-day-info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}
.trip-day-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-title-3);
  line-height: var(--lh-title-3);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
/* 지난 날: 회색 카드 면 대신 날짜 제목만 보조 글자색(순서와 '오늘' 표시가 지난 날을 알린다) */
.trip-day-row.is-past .trip-day-title {
  color: var(--ink-soft);
}
.trip-day-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-body);
}
.trip-state-text {
  font-weight: var(--weight-bold);
}
.trip-state-TOGETHER { color: var(--state-together-ink); }
.trip-state-SPLIT_NEARBY { color: var(--state-split-ink); }
.trip-state-STANDBY { color: var(--state-standby-ink); }
.trip-state-NO_TOURISM { color: var(--state-no-tourism-ink); }
.trip-day-count {
  font-size: var(--text-body);
  color: var(--ink-soft);
}
.trip-day-reasons,
.trip-delta-reasons,
.trip-facts-warnings {
  padding-left: var(--space-5);
  font-size: var(--text-body);
  color: var(--ink);
}
/* '변경됨'·'즉시 복귀' 표시 (설계서 5.4 배지 모양: 모서리 6, 위아래 4 · 좌우 8, 14/19 굵게).
   '변경됨'은 코발트 대신 회색 면 + 3:1 테두리, '즉시 복귀'는 안전 지시라 먹색 채움을 유지한다 */
.trip-changed-tag,
.trip-return-tag {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-6);
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  font-weight: var(--weight-bold);
}
.trip-changed-tag {
  border: 1px solid var(--line-input);
  color: var(--ink);
  background: var(--surface-alt);
}
.trip-return-tag {
  border: 1px solid var(--ink);
  color: var(--on-dark);
  background: var(--ink);
}
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-trip.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/design-board.spec.js e2e/responsive.spec.js
```

Expected: PASS. `screen-trip` 2건과 기존 네 파일이 모두 통과해야 한다. axe 위반이 나오면 값을 바꾸거나 테스트를 느슨하게 하지 말고 멈추고 보고한다.

- [ ] **Step 6: 진행 현황 한 줄**

`docs/tracking/status.md`의 `- SEED 적용 ③층 4/15 조건 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 5/15 일정 화면: 날짜 목록을 카드 없는 목록 행(날짜 칩 · 날짜·상태·장소 수 · 화살표)으로, 행 전체가 그 날짜로 가는 누름 자리, '변경됨' 표시에서 코발트 제거. 계획서 `docs/superpowers/plans/2026-10-08-seed-layer3-05-trip.md`
```

- [ ] **Step 7: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 112건이다(시간대에 따라 1건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 8: 커밋**

```bash
git add app/trip/page.js app/styles/trip.css e2e/screen-trip.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(trip): 전체 일정 날짜 목록을 SEED 목록 행으로

- 날짜 행의 카드 테두리·모서리·면을 없애고 행 사이 1px 선, 끝에 화살표.
- 행 전체가 그 날짜로 가는 마우스 누름 자리(숨긴 제목 링크를 행 크기로). 날짜 칩·고칠 곳 링크는 그 위에서 제 동작.
- 지난 날은 회색 면 대신 날짜 제목만 보조 글자색.
- '변경됨' 표시는 코발트 대신 회색 면 + 3:1 테두리, 두 표시 모두 배지 모양(모서리 6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 1 뒤 커밋(작업 후)을 각각 빌드한다. `/trip`을 찍고, 끝나면 브랜치로 돌아온다.
  - 360px·320px × ko·en·ja·zh
  - 360·320 ko는 입력 필요 장면(동의 없음)도 찍는다.
  - 각 장면을 전체·맨 위·맨 아래로 찍는다.
  - 도구: `.superpowers/sdd/_tools/trip-shots.mjs`
- [ ] **Step 2: 비교 장면을 보여 준다.** 360px 한국어(맨 위·맨 아래), 입력 필요, 320px 영어·일본어를 보여 주고, 무엇이 바뀌었는지 한 줄씩 적는다.
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 6번(하루 일정)을 시작하지 않는다.
