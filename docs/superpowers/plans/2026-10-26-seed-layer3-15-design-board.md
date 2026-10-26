# SEED ③층 15/15 시안 보드(`/design-board`) 화면 시안 다시 만들기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시안 보드의 '화면 시안' 8개(`app/design-board/ScreenPreviews.js`)를 ③층 1~14번에서 승인된 지금 화면과 같은 배치로 다시 그린다. 설계서 6.2 15번 '새 토큰·부품 견본으로 다시 만든다(내비 비노출 유지)'의 남은 몫이다. 토큰·글자·부품 견본(`DesignBoard.js`)은 ②층과 각 화면 작업에서 이미 고쳤다.

**Architecture:**
- **실제 부품 재사용:** 화면 페이지는 기기 저장소를 읽으므로 시안에서 부르지 않는다. 지금처럼 실제 부품(`components/ui`, `components/trip`, `components/cards`, `components/guardian` 등)과 데모 데이터(`screenData.js`)를 쓴다.
- **배치만 옮겨 적기:** 페이지가 부품을 늘어놓는 배치만 실제 페이지와 같은 클래스·같은 문구 키로 옮겨 적는다. 바탕은 `is-basement` + `.ui-block`, 흰 한 장, 목록 행, 하단 바 등을 그대로 따른다.
- **화면 틀:** 지금 앱의 셸을 따른다.
  - 내비가 있는 화면은 다섯째 칸 '긴급'이 긴급 버튼이므로, 떠 있는 긴급 버튼을 지운다.
  - 내비가 없는 /g는 하단 긴급 바를 그린다.
- **하단 바:** 시안 안에서 `.sticky-return` 클래스를 쓰지 않는다. 보드 페이지 자체가 `:has(.sticky-return)` 규칙에 걸려 아래 여백 152px·scroll-padding 184px을 받던 문제를 없앤다.

새 테스트는 `e2e/screen-design-board.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 6.2 15번 행. 각 시안이 따를 화면 배치는 6.2 4~10·13번 행이다.
- 7장: 시안 보드는 고정 데모 데이터만 쓰고 저장소·세션·서버를 부르지 않는다.
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외)의 '15번' 줄들.

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. `app/styles/designBoard.css`에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 시안은 실제 화면의 문구 키를 그대로 쓴다. 이 계획은 새 문구를 만들지 않는다. 시안 설명(figcaption)은 기존 `designBoard.*` 키를 고쳐 쓰고, 고칠 때는 4개 언어를 모두 고친다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구·주석은 그대로 둔다.
- **시안 원칙(7장):**
  - 데이터는 `screenData.js`·`demoData.js`의 고정 값뿐이다. 저장소·세션·`fetch`를 부르지 않는다.
  - 시안 틀은 `inert`(누르기·초점 없음)다.
  - 보드는 하단 내비에 나오지 않는다.
- **실제 화면 파일은 고치지 않는다:** `app/*/page.js`, `components/**` 표시 코드는 이 계획에서 바꾸지 않는다. 시안이 실제 화면을 따라간다.
- **안전 표시:**
  - 시안에도 '안전합니다'를 쓰지 않는다.
  - 데모 지침에는 '병원 연동 데모' 배지를 붙인다.
  - 상태 4색은 판정 상태에만 쓴다.
- **기존 테스트:** `e2e/design-board.spec.js`·`e2e/design-board-components.spec.js`의 역할·이름 단언을 고치지 않는다. 시안 틀 안 `.sticky-return`·떠 있는 긴급 견본을 전제로 한 단언은 바뀐 틀에 맞게 고칠 수 있다. 고친 줄과 이유를 보고서에 적는다.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 196건이고 Task 1 뒤 201 → Task 2 뒤 205건이 된다.
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **떠 있는 긴급 버튼:** 내비가 있는 시안에는 떠 있는 긴급 버튼이 없어야 한다. 실제 앱처럼 내비 다섯째 칸이 긴급이다(Task 1).
2. **보드 페이지 아래 여백:** 보드 페이지가 시안 속 하단 바 때문에 152px를 더 비우거나 초점 스크롤 여백 184px를 받으면 안 된다(Task 1).
3. **회색 화면 시안:** 오늘·하루 일정·조건·장소·카드는 회색 바탕 위 흰 블록으로 보여야 한다. 실제 화면과 같다(Task 1·2).
4. **지워진 클래스:** 지금 CSS에 없는 클래스(`today-links`, `emergency-call.is-urgent`, `card guardian-pin-card` 등)를 쓰는 견본이 없어야 한다(Task 2).
5. **보호자 열기 시안:** PIN 입력은 카드 없이, 열기 버튼은 바 안, 하단 긴급 바가 보여야 한다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 시안 수와 대상 | 6.2 15번 | 지금 8개(오늘·전체 일정·하루 일정·조건·장소·카드·긴급·보호자 열기) 그대로 | 범위를 늘리지 않는다. 다른 화면은 실제 화면으로 본다 |
| 화면 틀 | 5.8, 셸(`components/ui/AppShell.js`) | `nav`가 있으면 떠 있는 긴급(`.designBoard-phone-sos`)을 그리지 않는다. `nav`가 없으면(/g) 독에 `<div className="ui-emergency-bar"><EmergencyButton preview docked /></div>` | 셸과 같다. 내비가 있으면 다섯째 칸이 긴급이다 |
| 조건 시안 | 6.2 4번 | 기간 편집기(`PeriodEditorForm`) 대신 조건 화면 본 배치를 그린다: 동의 상태 Callout / 기간 목록 행 / 날짜별 적용 조건 / 동의 철회 블록, 회색 바탕 | 6.2 4번 행이 정한 배치다. 편집기는 `.sticky-return`을 그려 보드 페이지 여백을 키운다 |
| 시안 속 하단 바 | 6.1 | 시안은 `.sticky-return`을 쓰지 않는다. 바 모양이 필요하면(보호자 열기의 '열기') `designBoard-bar` 클래스로 흰 면 + 윗선 1px + 안쪽 12/16을 흐름 안에 그린다 | 보드 페이지의 `:has(.sticky-return)` 여백 규칙을 피한다 |
| 각 시안 배치 | 6.2 4~10·13번, 각 화면 계획서 | 실제 페이지 파일의 지금 마크업 구조·클래스를 따른다(아래 Task 단계에 파일 지정) | 시안이 실제 화면과 어긋나지 않게 |
| 시안 설명(figcaption) | 7장 | 바뀐 배치에 맞게 고친다. 기존 `designBoard.*` 설명 키를 4개 언어로 고친다 | 설명이 시안과 맞아야 한다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/design-board/ScreenPreviews.js` | 화면 시안 8개 | 틀(T1), 오늘·전체 일정·하루 일정·조건(T1), 장소·카드·긴급·보호자(T2) |
| `app/design-board/screenData.js` | 시안 데모 데이터 | 필요한 값만 더한다(T1·T2) |
| `app/styles/designBoard.css` | 보드 배치 | 틀·`designBoard-bar`(T1), 필요하면 T2 |
| `src/i18n/messages/designBoard.js` | 시안 설명 | 바뀐 시안 설명(T1·T2) |
| `e2e/screen-design-board.spec.js` | **새** 시안 모양 테스트 | T1이 만들고 T2가 더한다 |
| `e2e/design-board.spec.js` | 기존 보드 테스트 | 바뀐 틀 전제만 고친다(T1) |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T2) |

---

### Task 1: 화면 틀(떠 있는 긴급 없음·/g 긴급 바), 보드 페이지 여백, 오늘·전체 일정·하루 일정·조건 시안

**Files:**
- Create: `e2e/screen-design-board.spec.js`
- Modify: `app/design-board/ScreenPreviews.js`(`Phone`, `TodayScreen`, `TripScreen`, `DayDetailScreen`, `ConditionsScreen`)
- Modify: `app/design-board/screenData.js`(필요한 값만), `app/styles/designBoard.css`, `src/i18n/messages/designBoard.js`(바뀐 설명), `e2e/design-board.spec.js`(바뀐 틀 전제만)

**Interfaces:**
- Consumes: 실제 부품들(`components/ui/index.js`, `components/trip/*`, `components/conditions/*`), `screenData.js`의 `buildDemoTrip`·`DEMO_*`.
- Produces:
  - 테스트 도우미 `phoneFor(page, route)`: `figure.designBoard-screen` 중 figcaption `code`가 route와 같은 것.
  - 클래스 `designBoard-bar`.

- [ ] **Step 1: 실패하는 테스트를 쓴다 (`e2e/screen-design-board.spec.js`)**

```js
// ③층 시안 보드(/design-board): 화면 시안이 지금 화면과 같은 배치인지 (설계서 6.2 15번)
import { test, expect } from './fixtures.js';

function phoneFor(page, route) {
  return page.locator('figure.designBoard-screen').filter({ has: page.locator('code', { hasText: new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) }) });
}

test.describe('③층 시안 보드 화면 시안', () => {
  test('내비가 있는 시안에는 떠 있는 긴급 버튼이 없고, /g 시안은 하단 긴급 바가 있다', async ({ page }) => {
    await page.goto('/design-board');
    const withNav = page.locator('.designBoard-phone').filter({ has: page.locator('.ui-bottom-nav') });
    expect(await withNav.count()).toBeGreaterThanOrEqual(7);
    await expect(withNav.locator('.designBoard-phone-sos')).toHaveCount(0);
    await expect(phoneFor(page, '/g').locator('.ui-emergency-bar .ui-emergency')).toHaveCount(1);
  });

  test('보드 페이지는 시안 속 하단 바 때문에 아래 여백·초점 스크롤 여백을 더 받지 않는다', async ({ page }) => {
    await page.goto('/design-board');
    await expect(page.locator('main .sticky-return')).toHaveCount(0);
    const scrollPadding = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
    expect(scrollPadding).toBe('auto');
  });

  for (const route of ['/today', '/trip/2026-10-06', '/conditions']) {
    test(`${route} 시안은 회색 바탕 위 흰 블록이다`, async ({ page }) => {
      await page.goto('/design-board');
      const phone = route.startsWith('/trip/') ? page.locator('figure.designBoard-screen').filter({ has: page.locator('code', { hasText: /^\/trip\/\d{4}-\d{2}-\d{2}$/ }) }) : phoneFor(page, route);
      await expect(phone.locator('.is-basement')).toHaveCount(1);
      expect(await phone.locator('.is-basement > .ui-block').count()).toBeGreaterThanOrEqual(2);
    });
  }
});
```

`/trip/날짜` 시안의 날짜는 데모 값이라 정규식으로 찾는다(위 반복의 첫 줄). 테스트 이름에 쓴 `/trip/2026-10-06`은 이름일 뿐이다. 실제 데모 날짜가 다르면 이름만 맞춘다.

이 태스크의 새 테스트는 다섯 건이다(위 둘 + 회색 셋).

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-design-board.spec.js
```

Expected: 다섯 건 모두 FAIL이어야 한다.
- 떠 있는 긴급이 있다.
- 조건 편집기 바 때문에 `scroll-padding-bottom`이 184px다.
- 시안에 `is-basement`가 없다.

- [ ] **Step 3: 화면 틀 (`Phone`, `designBoard.css`)**

- `Phone`
  - `nav`가 있으면 `.designBoard-phone-sos`를 그리지 않는다.
  - `nav`가 없으면 독에 `<div className="ui-emergency-bar"><EmergencyButton preview docked /></div>`를 그린다. 셸 `AppShell.js`의 긴급 바와 같다.
  - `.designBoard-phone-sos` CSS가 더 쓰이지 않으면 지운다.
- `Phone`이 받는 자식은 각 시안이 실제 화면의 `<main>` 클래스(`page …`)를 단 요소로 감싸 넘긴다(아래 Step 4). 틀은 바탕을 정하지 않는다.
- `designBoard.css`
  - `.designBoard-bar`: `background: var(--bg); border-top: 1px solid var(--line-strong); padding: var(--space-3) var(--gutter)`.
  - 틀 안 `.ui-emergency-bar`가 `position: fixed`면 틀 독 안에서 흐름으로 둔다. 셸 규칙을 덮어쓰는 범위는 `.designBoard-phone` 안으로 한정한다.
- `e2e/design-board.spec.js`의 '하단 바는 고정이 아니고, 긴급 견본은 자기 틀의 하단 독 밖으로 밀려나지 않는다' 테스트는 고친다. `.designBoard-phone-sos .ui-emergency` 대신 `.designBoard-phone-dock .ui-emergency`를 잰다. 이름 단언은 그대로 둔다.

- [ ] **Step 4: 네 시안을 지금 배치로 (`ScreenPreviews.js`)**

각 시안은 아래 실제 파일의 지금 마크업을 따라 옮긴다. 저장소를 읽는 훅·버튼 동작은 빼고 `screenData.js` 데모 값으로 채운다. 실제 부품을 부를 수 있으면 부른다(`DailyCheckCard`, `StateBanner`, `DayTimeline`, `DateChip`, `TripNotice`, `ListItem` 등). 시안 맨 바깥은 실제 화면의 `<main>`과 같은 클래스를 단 `div`다(예: `className="page today-page is-basement designBoard-phone-page"`).
- **오늘**(`app/today/page.js`, 6.2 7번): 회색, 날짜·상태 블록 / 매일 확인 블록 / 다음 외출 블록 / 바로가기 목록. 옛 `today-links` 두 버튼 배치를 지운다. 복귀 마감 견본이 틀 아래에 잘리지 않게 첫 화면 안에 들어오는 순서를 실제 화면대로 둔다.
- **전체 일정**(`app/trip/page.js`, 6.2 5번): 흰 바탕 목록 행이다. 날짜 칩 · 날짜 · 상태 · 장소 수 · 화살표를 둔다. 실제처럼 행 끝 덮개 링크와 화살표 아이콘을 둔다. 시안은 `inert`라 링크는 눌리지 않는다.
- **하루 일정**(`components/trip/DayScreen.js`, 6.2 6번): 회색, 날짜 칩 줄 블록 / 상태 Callout / 환자·보호자 Segmented / 타임라인 블록 / 소개 블록 / 도구 목록.
- **조건**(`app/conditions/page.js`, 6.2 4번): 회색, 동의 상태 Callout / 기간 목록 블록(`conditions-period-list is-rows`, 출처 표시) / 날짜별 적용 조건 블록 / 동의 철회 블록. `PeriodEditorForm`과 그 import를 지운다. 데모 기간은 `DEMO_PERIODS`를 쓴다.
- 바뀐 시안의 figcaption 설명 키(`designBoard.*`)를 실제 배치에 맞게 4개 언어로 고친다.

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-design-board.spec.js e2e/design-board.spec.js e2e/design-board-components.spec.js e2e/accessibility.spec.js
```

Expected: 모두 PASS(접근성 검사의 `/design-board` axe 포함).

- [ ] **Step 6: 커밋**

```bash
git add app/design-board/ScreenPreviews.js app/design-board/screenData.js app/styles/designBoard.css src/i18n/messages/designBoard.js e2e/screen-design-board.spec.js e2e/design-board.spec.js
git commit -m "$(cat <<'MSG'
style(design-board): 화면 시안 틀을 지금 셸처럼, 오늘·전체 일정·하루 일정·조건 시안을 승인된 배치로

- 내비가 있는 시안에서 떠 있는 긴급 버튼을 지우고 /g 시안은 하단 긴급 바.
- 조건 시안은 편집기 대신 본 배치(회색, 동의 상태·기간 목록 행·날짜별 조건·동의 철회). 보드 페이지가 하단 바 여백을 더 받지 않는다.
- 오늘·하루 일정은 회색 바탕 위 흰 블록, 전체 일정은 목록 행.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 장소·카드·긴급·보호자 열기 시안

**Files:**
- Modify: `app/design-board/ScreenPreviews.js`(`PlaceScreen`, `CardsScreen`, `EmergencyScreen`, `GuardianScreen`)
- Modify: `app/design-board/screenData.js`(필요한 값만), `app/styles/designBoard.css`(필요하면), `src/i18n/messages/designBoard.js`(바뀐 설명)
- Modify: `e2e/screen-design-board.spec.js`(새 테스트), `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes: Task 1의 `phoneFor`, `designBoard-bar`, 바뀐 `Phone`.
- Produces: 없음.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-design-board.spec.js`)**

```js
test.describe('③층 시안 보드 화면 시안 (장소·카드·긴급·보호자)', () => {
  for (const route of ['/place/[candidateId]', '/cards']) {
    test(`${route} 시안은 회색 바탕 위 흰 블록이다`, async ({ page }) => {
      await page.goto('/design-board');
      const phone = phoneFor(page, route);
      await expect(phone.locator('.is-basement')).toHaveCount(1);
      expect(await phone.locator('.is-basement > .ui-block').count()).toBeGreaterThanOrEqual(2);
    });
  }

  test('긴급 시안: 119 는 긴급 빨강 채움 버튼, 1330 은 회색 버튼, 지금 CSS 에 없는 옛 클래스가 없다', async ({ page }) => {
    await page.goto('/design-board');
    const phone = phoneFor(page, '/emergency');
    await expect(phone.locator('.emergency-call.btn-critical')).toHaveCount(1);
    await expect(phone.locator('.emergency-call.btn-secondary')).toHaveCount(1);
    await expect(phone.locator('.is-urgent, .is-secondary, .emergency-call-icon, .emergency-call-text')).toHaveCount(0);
  });

  test('보호자 열기 시안: PIN 입력은 카드 없이, 열기는 시안 속 바 안, 하단 긴급 바', async ({ page }) => {
    await page.goto('/design-board');
    const phone = phoneFor(page, '/g');
    await expect(phone.locator('.card')).toHaveCount(0);
    await expect(phone.locator('.designBoard-bar .btn')).toHaveCount(1);
    await expect(phone.locator('.ui-emergency-bar')).toHaveCount(1);
  });
});
```

route 문자열이 시안 figcaption의 `code`와 다르면(예: `/place/[candidateId]`) 실제 값에 맞춘다. 이 태스크의 새 테스트는 네 건이다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-design-board.spec.js
```

Expected: 새 네 건이 FAIL이어야 한다. Task 1의 다섯 건은 PASS다.

- [ ] **Step 3: 네 시안을 지금 배치로 (`ScreenPreviews.js`)**

Task 1 Step 4와 같은 방식으로 실제 파일을 따른다.
- **장소**(`app/place/[candidateId]/page.js`, 6.2 8번)
  - 회색 바탕이다. 순서는 그림 / 이름·체류·배지 블록 / 지도 버튼 [구글][카카오] 반반 / 출처 블록이다.
  - 옛 `.place-block` 견본이 상자 없이 보이던 것을 실제 블록 구조로 바꾼다.
- **카드**(`components/cards/TodayCards.js`, 6.2 9번)
  - 회색 바탕이다. 안내·날짜·바로가기 칩 블록 / 식이 / 이동 / 복귀 / 병원 카드 블록을 둔다.
  - 카드 틀(`KoreanCard`)은 유지한다(운영자 결정 2026-10-15).
- **긴급**(`app/emergency/page.js`, 6.2 10번)
  - 흰 바탕이다. 순서는 안내 Callout / 119 `btn btn-critical emergency-call` / 1330 `btn btn-secondary emergency-call` + 설명·해외 발신 링크 / 등록한 병원 행이다.
  - 옛 클래스(`is-urgent`·`is-secondary`·`emergency-call-icon`·`emergency-call-text`)를 지운다.
- **보호자 열기**(`components/guardian/GuardianOpen.js`의 `PinForm`, 6.2 13번)
  - 흰 바탕이다. `section.guardian-section guardian-pin-card` 안에 PIN 입력을 두고, '열기' `Button`은 `<div className="designBoard-bar">` 안에 둔다(`.sticky-return` 아님).
  - 그 아래 `GuardianCopyView`는 그대로다.
  - 틀은 `nav` 없이 하단 긴급 바다(Task 1).
- 바뀐 시안의 figcaption 설명 키를 4개 언어로 고친다.

- [ ] **Step 4: 진행 현황 한 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 14/15 …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 15/15 시안 보드: 화면 시안 8개를 승인된 배치로 다시 그림(회색 화면은 회색 바탕 위 흰 블록, 전체 일정은 목록 행, 조건 시안은 본 배치, 긴급 119 긴급 빨강·1330 회색, 보호자 열기는 카드 없는 PIN + 바), 시안 틀은 지금 셸처럼(내비가 있으면 떠 있는 긴급 없음, /g 는 하단 긴급 바), 보드 페이지가 시안 속 하단 바 여백을 받지 않음. 계획서 `docs/superpowers/plans/2026-10-26-seed-layer3-15-design-board.md`
```

- [ ] **Step 5: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 205건이다(시간대에 따라 skip 가능). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 6: 커밋**

```bash
git add app/design-board/ScreenPreviews.js app/design-board/screenData.js app/styles/designBoard.css src/i18n/messages/designBoard.js e2e/screen-design-board.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(design-board): 장소·카드·긴급·보호자 열기 시안을 승인된 배치로

- 장소·카드는 회색 바탕 위 흰 블록, 카드 틀 유지.
- 긴급은 119 긴급 빨강 채움·1330 회색 버튼, 옛 클래스 삭제.
- 보호자 열기는 카드 없는 PIN 입력 + 시안 속 바, 하단 긴급 바.
- 진행 현황 15/15 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 작업 전은 이 계획을 쓰기 직전 빌드에서 시안 8개를 하나씩 찍어 두었다. 작업 후는 Task 2 뒤 커밋에서 같은 방식으로 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 뒤 ③층 마지막 일괄 점검(강제 색상 모드·공용 Callout·3:7 바·목록 행 눌림·남은 작은 지적)으로 넘어간다.
