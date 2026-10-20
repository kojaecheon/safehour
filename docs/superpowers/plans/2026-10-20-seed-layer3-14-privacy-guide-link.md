# SEED ③층 14/15 개인정보·병원 회복 안내·병원 연결(`/privacy`, `/guide`, `/link`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세 화면을 설계서 6.2 14번 배치로 바꾼다.
- **바탕:** 흰 바탕 한 장.
- **긴 글:** 16/24(articleBody).
- **넘김 메모(4번 조건 화면):** 병원 연결·안내 화면에 남은 일을 끝낸다.
  - 오류 문장에 아이콘을 붙인다.
  - 연결 해제 확인을 AlertDialog로 바꾼다.
  - 카드 모양을 걷어 낸다.

**Architecture:** 고지 문구·병원 원문 출력(요약·번역 금지)·확인 기록·연결·해제의 동작과 문구는 그대로 두고 표시만 바꾼다.
- **카드:** `.card`를 걷어 내고 구역은 간격으로 나눈다. 구역선은 화면당 1~2개다.
- **/link의 병원 고르기:** 흐름을 끝내는 '이 병원으로 연결'은 하단 고정 바 [취소 3][연결 7]에 둔다.
- **/link의 연결 해제:** ②층 `AlertDialog`(critical)로 묻는다(조건 화면 기간 삭제와 같다).

새 화면 테스트는 `e2e/screen-info-pages.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.2(글자 16/24 긴 글), 5.1(critical), 5.4(배지), 5.5(목록), 5.6(Callout, SourceArea 병원 발행은 왼쪽 띠 유지, 확인 대화 Alert Dialog)
- 6.1(흰 바탕 한 장, 하단 고정 바), 6.2 14번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외). '조건(4/15)에서 넘긴 것'의 14번 줄이다.

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`·`src/i18n/legal.js`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구·주석은 그대로 둔다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, '오늘' 표시, 키보드 초점 링에만 쓴다. 채운 강조 버튼(주·critical)은 화면당 하나다.
- **눌림·호버:** 눌림은 면 색(`--pressed*`)을 바꾸고, 버튼·칩·탭은 요소 전체가 조금 줄어든다(설계서 4.6). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 고지·안전 문구는 두 언어 병기를 그대로 둔다.
  - 병원 원문은 '병원 발행' 출처 영역(왼쪽 띠 유지) 안에서 편집·번역 없이(`translate="no"`) 보인다.
  - 데모 지침에는 '병원 연동 데모' 배지가 늘 붙는다.
  - 연결 전 민감정보 동의, 보기 전용 차단을 그대로 둔다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/helpers.js` `linkDemoPlan`:
    - 버튼 '예시 A — 외출 가능' 등을 쓴다.
    - 제목 '어느 병원의 지침인가요?'를 쓴다.
    - `radio`는 병원 이름으로 찾는다.
    - 버튼 '이 병원으로 연결'을 쓴다.
    - 제목 '연결했어요'를 쓴다.
  - `acknowledgeGuide`: 버튼 '전체 확인 처리', 문구 '중요 안내를 모두 확인했어요.'.
  - `e2e/hospital-link.spec.js`, `e2e/privacy.spec.js`, `e2e/accessibility.spec.js`(/privacy·/guide·/link axe, 터치 44px), `e2e/responsive.spec.js`, `e2e/network.spec.js`, `e2e/offline.spec.js`.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 188건이고 Task 1 뒤 191 → Task 2 뒤 196건이 된다.
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.
  - 색 단언은 전환이 있는 요소(버튼 면)에서 `expect.poll`로 쓴다.

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **연결 해제를 실수로 누름:** 확인 대화상자가 떠야 한다. 확인 버튼은 긴급 빨강이고, 취소하면 지침이 그대로 남아야 한다(Task 2).
2. **병원을 고르지 않고 연결:** 경고 아이콘 + 굵은 빨간 문장이 보이고, 하단 고정 바의 버튼은 그대로여야 한다(Task 2).
3. **320px 일본어·중국어 병원 고르기:** 하단 바 [취소][연결]이 한 줄에 들어가고 가로 스크롤이 없어야 한다(Task 2).
4. **긴 고지 글:** 줄 높이 24px, 문단 사이 띠 없이도 항목이 갈려 보여야 한다(Task 1).
5. **연결 완료 뒤:** 화면의 주 버튼은 '조건 보기' 하나여야 한다. 아래 코드 입력의 연결 버튼은 회색이다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕 | 6.2 14번 '흰' | 세 화면 모두 흰 바탕 한 장, `.card` 걷어 냄 | 설계서 그대로 |
| 긴 글 | 4.2, 6.2 14번 '16/24' | /privacy 고지 문단과 /guide 병원 원문은 줄 높이 `--lh-article`(24px) | 설계서 그대로 |
| 개인정보 소개 | 5.6 | 회색 Callout에 앞 20px `info` 아이콘(`.medical-callout.has-icon`) | 로그인·설정과 같은 짝 |
| 개인정보 항목 | 5.6 '왼쪽 띠 제거' | 3px 회색 띠 → 점 목록(`list-style: disc`) | 띠 없이 항목이 갈린다 |
| 개인정보 구역 | 6.1 '구역선 1~2개' | 섹션 사이 32px 간격, 선 없음. '내 정보 지우기' 앞에만 구역선 하나 | 섹션이 열 개 안팎이라 선을 다 두면 많다 |
| 병원 안내 항목 | 5.5, 5.6 | 카드 → 행. 항목 사이 1px `--line`, 위아래 20px. 병원 원문 상자(SourceArea)의 왼쪽 띠는 그대로 | 출처를 가르는 띠는 안전 규칙 |
| 병원 안내 확인 수 | 5.6 Callout | 모서리 12·1px 선·상태 색 글자 → 모서리 10, 선 없음, 안쪽 14/16, 글자 먹색, 아이콘만 상태 색(대기 `--state-standby-ink`, 모두 확인 `--state-together-ink`) | 조건 화면 동의 상태 Callout과 같은 짝 |
| 오류 문장 | 4번 넘김 '아이콘 붙이기' | /guide 저장 실패, /link 병원 고르기 오류에 앞 20px `alert` 아이콘(`.conditions-field-error` 모양은 이미 있음) | 오류 표시 통일 |
| 병원 고르기 버튼 | 6.1 '하단 고정 바, 3:7' | '취소'·'이 병원으로 연결'을 `<div className="conditions-actions link-bar sticky-return is-flow">`에 [취소 3][연결 7] | 체류 설정·조건 편집기와 같다 |
| 연결 해제 | 4번 넘김, 5.6 '확인 대화 Alert Dialog, 되돌릴 수 없으면 critical' | 인라인 확인 묶음 → `AlertDialog`(critical). 제목은 `link.disconnectQuestion`, 확인은 `link.disconnectConfirm`, 취소는 `conditions.cancel`. `.conditions-confirm*` CSS는 지운다 | 조건 화면 기간 삭제와 같은 모양 |
| 연결된 지침 목록 | 4번 조건 화면 결정(목록 행 + 출처 표시) | 청록 카드 → `conditions-period-list is-rows` 행. 머리에 `SourceTag source="hospital"` | 조건 화면 기간 목록과 같은 짝, 출처는 표시가 알린다 |
| 연결 완료 뒤 코드 입력 | 5.1 '채운 강조 버튼 화면당 하나' | 완료 묶음이 보이는 동안 코드 입력의 '회복 지침 연결'은 `secondary` | 주 버튼은 '조건 보기' 하나 |
| 동의 패널(/link) | 4번 넘김 | 카드 모양을 걷어 낸다(조건 화면과 같게) | 흰 바탕 한 장 |
| `.conditions-callout`·`.medical-callout` 합치기 | 4번 넘김 | 이번에는 하지 않는다. 마지막 일괄의 공용 Callout 정리에서 한다 | 승인된 조건 화면까지 건드리는 일이라 Callout 전체 정리와 같이 한다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/privacy/page.js` | 개인정보 고지 | 섹션·소개(T1) |
| `app/styles/privacy.css` | 개인정보 배치 | T1 |
| `app/guide/page.js` | 병원 회복 안내 | 항목·오류 아이콘(T1) |
| `app/link/page.js` | 병원 연결 | 섹션·바·목록·대화상자·오류 아이콘(T2) |
| `app/styles/conditions.css` | 조건·연결·안내 공용 | /guide 절(T1), /link 절·동의 패널·확인 묶음(T2) |
| `e2e/screen-info-pages.spec.js` | **새** 세 화면 모양 테스트 | T1이 만들고 T2가 더한다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T2) |

---

### Task 1: 개인정보(/privacy) 흰 바탕·16/24 긴 글·점 목록, 병원 회복 안내(/guide) 카드 없는 행·Callout·오류 아이콘

**Files:**
- Create: `e2e/screen-info-pages.spec.js`
- Modify: `app/privacy/page.js`, `app/styles/privacy.css`
- Modify: `app/guide/page.js`, `app/styles/conditions.css`(`/* ── 병원 안내 ── */` 절)

**Interfaces:**
- Consumes: `startTrip`, `linkDemoPlan`(`e2e/helpers.js`), `Icon`, `.medical-callout.has-icon`·`.medical-callout-icon`(globals).
- Produces: 테스트 도우미 `styles(locator, props)`, `gapBetween(upper, lower)`(`e2e/screen-settings.spec.js`와 같은 모양).

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-info-pages.spec.js`)**

```js
// ③층 개인정보·병원 회복 안내·병원 연결(/privacy, /guide, /link): SEED 화면 배치 (설계서 6.2 14번)
// 색: --surface-alt rgb(243, 244, 245), --ink rgb(26, 28, 32), --emergency rgb(200, 16, 46),
//     --state-standby-bg rgb(255, 244, 217), --state-standby-ink rgb(122, 74, 0)
import { test, expect } from './fixtures.js';
import { linkDemoPlan, startTrip } from './helpers.js';

async function styles(locator, props) { /* screen-settings 와 같다 */ }
function gapBetween(upper, lower) { return Math.round(lower.y - (upper.y + upper.height)); }

test.describe('③층 개인정보 고지', () => {
  test('흰 바탕 한 장: 카드 없음, 소개는 info 아이콘 회색 Callout, 고지 글은 16/24, 항목은 띠 없는 점 목록', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.locator('main.privacy-page');
    await expect(main.locator('.card')).toHaveCount(0);
    const intro = main.locator('.privacy-intro');
    await expect(intro.locator('.medical-callout-icon svg')).toHaveCount(1);
    expect((await styles(intro, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const firstLine = main.locator('.privacy-section .settings-pair-primary').first();
    expect(await styles(firstLine, ['font-size', 'line-height'])).toEqual({ 'font-size': '16px', 'line-height': '24px' });
    const item = main.locator('.privacy-items > li').first();
    expect(await styles(item, ['border-left-width', 'list-style-type'])).toEqual({ 'border-left-width': '0px', 'list-style-type': 'disc' });
    // 섹션 사이 32px, 선 없음
    const sections = main.locator('section.privacy-section');
    expect(gapBetween(await sections.nth(0).boundingBox(), await sections.nth(1).boundingBox())).toBe(32);
    expect((await styles(sections.nth(1), ['border-top-width']))['border-top-width']).toBe('0px');
  });
});

test.describe('③층 병원 회복 안내', () => {
  test('카드 없는 행: 항목 사이 1px 선, 병원 원문 상자는 왼쪽 띠 그대로, 원문은 16/24', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/guide');
    const items = page.locator('.conditions-guide-item');
    await expect(items.first()).toBeVisible();
    await expect(page.locator('main .card')).toHaveCount(0);
    expect((await styles(items.nth(1), ['border-top-width', 'box-shadow']))).toEqual({ 'border-top-width': '1px', 'box-shadow': 'none' });
    const source = items.first().locator('.ui-source');
    expect(Number.parseFloat((await styles(source, ['border-left-width']))['border-left-width'])).toBeGreaterThan(1);
    expect((await styles(items.first().locator('.conditions-guide-text'), ['line-height']))['line-height']).toBe('24px');
  });

  test('확인 수 안내는 Callout(모서리 10, 선 없음, 글자 먹색, 아이콘만 대기 색)', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/guide');
    const count = page.locator('.conditions-guide-count.is-pending');
    await expect(count).toBeVisible();
    expect(await styles(count, ['border-top-left-radius', 'border-top-width', 'color', 'padding-top', 'background-color'])).toEqual({
      'border-top-left-radius': '10px', 'border-top-width': '0px', color: 'rgb(26, 28, 32)', 'padding-top': '14px', 'background-color': 'rgb(255, 244, 217)',
    });
    expect((await styles(count.locator('svg'), ['color']))['color']).toBe('rgb(122, 74, 0)');
  });
});
```

`--state-standby-ink`의 rgb 값이 다르면 `app/globals.css` 값으로 바꾼다. `.ui-source`가 SourceArea의 실제 클래스가 아니면 `components/ui/SourceArea.js`에서 확인해 맞춘다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-info-pages.spec.js
```

Expected: 새 세 건이 FAIL이어야 한다(카드·띠·22px 줄 높이·모서리 12다).

- [ ] **Step 3: 개인정보 (`app/privacy/page.js`, `app/styles/privacy.css`)**

- `page.js`
  - 소개 `div.medical-callout.privacy-intro`에 `has-icon`을 더하고, 맨 앞에 `<span className="medical-callout-icon" aria-hidden="true"><Icon name="info" size={20} /></span>`을 둔다. `Icon`은 `@/components/ui/index.js`에서 가져온다.
  - 두 `section.card privacy-section`의 `card`를 지운다.
  - 맨 끝 `ClearSessionButton`을 `<div className="privacy-clear">`로 감싼다.
- `privacy.css`
  - `.privacy-page`: `display: flex; flex-direction: column; gap: var(--space-8)`.
  - `.privacy-page .settings-pair-primary, .privacy-page .settings-pair-secondary`: `line-height: var(--lh-article)`.
  - `.privacy-items`: `list-style: disc; padding-left: var(--space-5)`. `.privacy-items > li`는 띠·왼쪽 안쪽 여백을 지운다.
  - `.privacy-clear`: `border-top: 1px solid var(--line-section); padding-top: var(--space-6)`.
  - 소개 상자 `margin-bottom`은 0이다(간격은 `gap`이 맡는다).

- [ ] **Step 4: 병원 회복 안내 (`app/guide/page.js`, `app/styles/conditions.css` 병원 안내 절)**

- `page.js`
  - 항목 `li`의 `className="card conditions-guide-item"` → `conditions-guide-item`.
  - 저장 실패 `<p className="conditions-field-error" role="alert">`에 앞 `<Icon name="alert" size={20} />`을 넣고 글자는 `<span>`으로 감싼다.
  - 여러 지침이면 `PlanGuide` 섹션이 이어진다. 두 번째부터 구역선을 둔다(CSS).
- `conditions.css` 병원 안내 절
  - `.conditions-guide-count`: 모서리 `--radius-10`, 테두리 없음, 안쪽 `14px var(--space-4)`, `gap: var(--space-2)`, 글자 `--ink`, 바탕은 지금 상태 색 면 그대로.
  - `.conditions-guide-count .ui-icon`: `margin-top: 1px`, 색은 상태 글자 색(`--state-together-ink`, `.is-pending`이면 `--state-standby-ink`).
  - `.conditions-guide-item`: `padding: var(--space-5) 0`. `.conditions-guide-item + .conditions-guide-item`: `border-top: 1px solid var(--line)`.
  - `.conditions-guide-text`: `line-height: var(--lh-article)`.
  - `.conditions-guide-plan + .conditions-guide-plan`: `border-top: 1px solid var(--line-section); padding-top: var(--space-6); margin-top: var(--space-6)`.

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-info-pages.spec.js e2e/privacy.spec.js e2e/hospital-link.spec.js e2e/accessibility.spec.js
```

Expected: 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
git add app/privacy/page.js app/styles/privacy.css app/guide/page.js app/styles/conditions.css e2e/screen-info-pages.spec.js
git commit -m "$(cat <<'MSG'
style(privacy,guide): 개인정보·병원 회복 안내를 흰 바탕 한 장으로, 긴 글 16/24, 점 목록, 카드 없는 안내 행

- 개인정보: 카드를 걷어 내고 섹션 사이 32px, 소개는 info 아이콘 Callout, 항목은 띠 없는 점 목록.
- 병원 안내: 항목 카드를 행으로(사이 1px 선), 병원 원문 상자 띠는 그대로, 원문 16/24.
- 확인 수 안내는 Callout(글자 먹색, 아이콘만 상태 색), 저장 실패 문장에 경고 아이콘.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 병원 연결(/link) 흰 바탕, 병원 고르기 하단 고정 바, 연결 목록 행, 연결 해제 AlertDialog

**Files:**
- Modify: `app/link/page.js`
- Modify: `app/styles/conditions.css`(동의 패널 규칙, `.conditions-confirm*`, 기간 목록 주석, `/* ── 병원 연결 ── */` 절)
- Modify: `e2e/screen-info-pages.spec.js`(새 `describe`)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes: Task 1의 `styles`·`gapBetween`. `AlertDialog`, `SourceTag`(`@/components/ui/index.js`). `AlertDialog` 사용법은 `components/conditions/PeriodCard.js` 117~131행과 같다.
- Produces: 클래스 `link-bar`, `link-section`.

- [ ] **Step 1: 실패하는 화면 테스트를 더한다 (`e2e/screen-info-pages.spec.js`)**

```js
test.describe('③층 병원 연결', () => {
  async function openChoose(page) {
    await startTrip(page, {}, { path: '/link' });
    await page.getByRole('button', { name: '예시 A — 외출 가능' }).click();
    await expect(page.getByRole('heading', { name: '어느 병원의 지침인가요?' })).toBeVisible();
  }

  test('흰 바탕 한 장: 코드 입력·연동 없이 둘러보기에 카드 없음, 두 섹션 사이 구역선', async ({ page }) => {
    await startTrip(page, {}, { path: '/link' });
    await expect(page.locator('main .card')).toHaveCount(0);
    const demo = page.locator('section.conditions-demo');
    expect((await styles(demo, ['border-top-width', 'padding-top']))).toEqual({ 'border-top-width': '1px', 'padding-top': '24px' });
  });

  test('병원 고르기: [취소][이 병원으로 연결]이 하단 고정 바에 3:7, 하단 내비 바로 위', async ({ page }) => {
    await openChoose(page);
    const bar = page.locator('.link-bar.sticky-return.is-flow');
    const cancel = bar.getByRole('button', { name: '취소' });
    const confirm = bar.getByRole('button', { name: '이 병원으로 연결' });
    await expect(confirm).toBeVisible();
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())).toBe(0);
    const c = await cancel.boundingBox();
    const k = await confirm.boundingBox();
    expect(Math.abs(c.y - k.y)).toBeLessThanOrEqual(1);
    expect(k.width).toBeGreaterThan(c.width * 2);
  });

  test('병원을 고르지 않고 연결하면 경고 아이콘 + 굵은 긴급 빨강 문장', async ({ page }) => {
    await openChoose(page);
    await page.getByRole('button', { name: '이 병원으로 연결' }).click();
    const error = page.getByRole('alert').filter({ hasText: '연결할 병원을 골라 주세요.' });
    await expect(error.locator('svg')).toHaveCount(1);
    expect(await styles(error, ['color', 'font-weight'])).toEqual({ color: 'rgb(200, 16, 46)', 'font-weight': '700' });
  });

  test('연결 뒤: 주 버튼은 조건 보기 하나, 연결된 지침은 카드 없는 행 + 병원 발행 출처 표시', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    const primary = page.locator('main .btn:not(.btn-secondary):not(.btn-quiet):not(.btn-critical)');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/조건 보기/);
    const row = page.locator('.conditions-period-list.is-rows > .conditions-period').first();
    expect((await styles(row, ['border-left-width', 'background-color']))).toEqual({ 'border-left-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    await expect(row.locator('.ui-source-tag')).toHaveCount(1);
  });

  test('연결 해제는 확인 대화상자: 확인 버튼 긴급 빨강, 취소하면 그대로, 확인하면 목록에서 사라진다', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.getByRole('button', { name: '연결 해제' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: '해제하기' });
    await expect.poll(async () => (await styles(confirm, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '연결된 지침' })).toBeVisible();
    await page.getByRole('button', { name: '연결 해제' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '해제하기' }).click();
    await expect(page.getByRole('heading', { name: '연결된 지침' })).toHaveCount(0);
  });
});
```

`linkDemoPlan`도 helpers에서 가져온다. 출처 표시의 실제 클래스(`.ui-source-tag`)와 버튼 이름('연결 해제'·'해제하기'·'취소')은 `components/ui/SourceTag.js`·`src/i18n/messages/`로 확인하고 다르면 실제 값에 맞춘다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-info-pages.spec.js
```

Expected: 새 다섯 건이 FAIL이어야 한다. Task 1의 세 건은 PASS다.

- [ ] **Step 3: 병원 연결 (`app/link/page.js`)**

- 섹션 카드
  - `section.card conditions-done`, `section.card conditions-choose`, 코드 입력 `section.card`, `section.card conditions-demo`에서 `card`를 지운다.
  - 코드 입력 섹션에는 `link-section` 클래스를 단다.
- 완료 묶음이 보이는 동안(`done`이 있을 때) 코드 입력 제출 `Button`에 `variant="secondary"`를 준다. 그 밖에는 그대로 주 버튼이다.
- 병원 고르기
  - 버튼 묶음 `div.conditions-actions`의 순서를 [취소, 이 병원으로 연결]로 바꾼다.
  - 클래스는 `conditions-actions link-bar sticky-return is-flow`다.
  - '취소'는 `variant="secondary"`, '이 병원으로 연결'은 주 버튼 그대로다.
- 고르기 오류 `<p className="conditions-field-error" …>`에 앞 `<Icon name="alert" size={20} />`을 넣고 글자는 `<span>`으로 감싼다.
- 연결된 지침 목록
  - `ul.conditions-period-list` → `ul.conditions-period-list is-rows`.
  - 행 `li`의 클래스 `conditions-period-HOSPITAL`을 지운다.
  - 머리 `conditions-tags` 맨 앞에 `<SourceTag source="hospital" />`를 둔다.
- 연결 해제
  - 행 안 인라인 확인 묶음(`conditions-confirm`)을 지운다.
  - '연결 해제' 버튼은 늘 보인다. 누르면 `setDisconnecting(lp.code)`.
  - 목록 밖(섹션 끝)에 하나 둔다.

```jsx
{disconnecting && (
  <AlertDialog
    title={t('link.disconnectQuestion')}
    cancelLabel={t('conditions.cancel')}
    confirmLabel={t('link.disconnectConfirm')}
    critical
    onConfirm={({ requestClose }) => {
      requestClose();
      disconnect(disconnecting);
    }}
    onClose={() => setDisconnecting(null)}
  />
)}
```

`disconnect`는 지금처럼 `setDisconnecting(null)`도 부른다. 보기 전용이면 '연결 해제' 버튼이 이미 막혀 있어 대화상자가 열리지 않는다.

- [ ] **Step 4: 스타일 (`app/styles/conditions.css`)**

- 동의 패널: `.conditions-page.is-basement .conditions-consent { … }`의 선택자를 `.conditions-page .conditions-consent`로 넓힌다. 위 주석의 '/link 동의 패널은 ③층 14번 전까지 카드 그대로' 줄은 지운다.
- `.conditions-confirm`, `.conditions-confirm-question` 규칙을 지운다(쓰는 곳이 없어진다).
- 기간 목록 절 첫 주석 '병원 연결 화면(/link)의 병원 지침 카드: 카드 모양 그대로(③층 14번 전까지)…'를 '병원 연결 화면도 is-rows 행으로 쓴다. 카드 모양(.conditions-period-SELF·HOSPITAL)은 is-rows 가 아닌 목록에만 남는다'로 고친다.
- 병원 연결 절에 더한다.
  - `.link-section + .conditions-demo`: `border-top: 1px solid var(--line-section); padding-top: var(--space-6)`.
  - `.conditions-page > section + section`(카드가 빠진 섹션 사이): `margin-top: var(--space-6)`. 이미 다른 규칙이 간격을 맡으면 그 값에 맞춘다.
  - `.link-bar`: `display: grid; grid-template-columns: minmax(max-content, 3fr) minmax(0, 7fr); gap: var(--space-2)`(`.onboarding-actions`와 같다). `.link-bar > .btn-secondary`는 좌우 안쪽 `var(--space-3)`.

- [ ] **Step 5: 진행 현황 한 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 13/15 보호자: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 14/15 개인정보·병원 회복 안내·병원 연결: 세 화면 흰 바탕 한 장(카드 없음), 고지·병원 원문 16/24, 개인정보 항목은 띠 없는 점 목록, 병원 안내 항목은 선으로 나눈 행(원문 상자 띠는 유지), 확인 수는 Callout, 오류 문장에 경고 아이콘, 병원 고르기는 하단 고정 바 [취소 3][연결 7], 연결된 지침은 목록 행 + 출처 표시, 연결 해제는 확인 대화상자(긴급 빨강). 계획서 `docs/superpowers/plans/2026-10-20-seed-layer3-14-privacy-guide-link.md`
```

- [ ] **Step 6: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 196건이다(시간대에 따라 skip 가능). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 7: 커밋**

```bash
git add app/link/page.js app/styles/conditions.css e2e/screen-info-pages.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(link): 병원 연결을 흰 바탕 한 장으로, 병원 고르기 하단 고정 바, 연결 목록 행, 연결 해제 확인 대화상자

- 섹션 카드를 걷어 내고 코드 입력과 둘러보기 사이 구역선 하나. 동의 패널도 카드 없이.
- 병원 고르기 [취소 3][이 병원으로 연결 7]을 하단 고정 바로, 고르기 오류에 경고 아이콘.
- 연결된 지침은 청록 카드 대신 목록 행 + 병원 발행 출처 표시.
- 연결 해제는 AlertDialog(확인 버튼 긴급 빨강), 인라인 확인 CSS 삭제.
- 연결 완료 뒤 코드 입력 버튼은 회색(주 버튼은 조건 보기 하나).
- 진행 현황 14/15 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.**
  - 작업 전은 이 계획을 쓰기 직전 빌드에서 이미 찍었다(`.superpowers/sdd/_tools/legal-shots.mjs`).
  - 작업 후는 Task 2 뒤 커밋에서 같은 도구로 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 15번(시안 보드)을 시작하지 않는다.
