# SEED ③층 마지막 일괄 점검 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ③층 1~15번 화면을 진행하며 '마지막 일괄'로 미룬 일을 끝낸다. 대상은 넘김 메모(`.superpowers/sdd/_tools/carry-over.md`)의 '마지막 일괄'·'마무리 일괄' 줄이다.
- 강제 색상 모드에서 사라지는 부품을 보이게 한다.
- 프로그램 초점·대화상자 뒤 초점을 바로잡는다.
- 복제된 안내 상자(Callout)·3:7 하단 바 규칙을 공용 하나로 모은다.
- 남은 작은 지적을 고친다.
- 테스트 도우미와 시안 보드 걸림 테스트를 둔다.

승인된 화면의 겉모습은 바뀌지 않아야 한다. 아래 '이 계획이 정한 것'에 적은 것만 바뀐다.

**Architecture:**
- **강제 색상 모드:** `@media (forced-colors: active)` 규칙을 부품 자리(`app/styles/ui.css`, 필요한 기능 파일)에 더한다. 시스템 색(`CanvasText`, `Highlight`, `ButtonText`, `GrayText`)과 투명 테두리로 경계·고른 상태를 보이게 한다.
- **Callout:** 공용 클래스 `.ui-callout`(+ `.ui-callout-icon`)를 `ui.css`에 두고, 각 기능의 복제 선언을 지운다. 기능 클래스는 여백·색 차이만 남긴다.
- **3:7 하단 바:** 공용 클래스 `.ui-bar-split`로 모은다.
- **겉모습 확인:** 리팩터링(Callout·3:7 바·죽은 CSS)은 전후 화면 캡처의 픽셀 비교로 차이 0을 확인한다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe, `forcedColors` 에뮬레이션)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.6(초점 링), 4.7(안전 하한), 5.3(스위치·라디오), 5.5(목록 행 눌림), 5.6(Callout), 6.1(하단 바)
- 7장(진행 순서와 검증 관문: 강제 색상 모드 점검)
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외)

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다(강제 색상 모드의 시스템 색 키워드는 토큰이 아니다).
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구·주석은 그대로 둔다.
- **겉모습:** 승인된 화면의 보통 색 모드 겉모습은 '이 계획이 정한 것' 표의 항목 말고는 바뀌지 않는다. 리팩터링 태스크는 픽셀 비교로 차이 0을 보인다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 출처 영역의 띠, 데모 배지, 두 언어 병기를 그대로 둔다.
  - 매일 확인 관문을 약하게 하지 않는다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다. 공용 도우미로 옮기는 것(Task 4)은 단언 내용을 바꾸지 않는다.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 206건이다. Task 1 뒤 209 → Task 2 뒤 213 → Task 3 뒤 216 → Task 4 뒤 217건이 된다(단위 테스트는 Task 4에서 1건 늘어 1,737건).
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.
  - 색 단언은 전환이 있는 요소에서 `expect.poll`로 쓴다.

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **고대비(강제 색상) 모드:**
   - 스위치·고른 라디오·고른 날짜 칩·Segmented 고른 칸·현재 내비 칸이 사라지지 않고 상태가 읽혀야 한다(Task 1).
   - 막힌 켬과 켜기 전 끔 스위치도 구분된다(Task 1).
2. **대화상자에서 삭제·해제를 확인한 뒤:** 초점이 화면 맨 위(body)로 떨어지지 않고, 목록 제목 같은 근처 자리로 가야 한다(Task 2).
3. **마우스로 진행한 뒤 프로그램 초점이 간 제목:** 코발트 링이 그려지지 않는다. 키보드로 진행하면 링이 보인다(Task 2).
4. **체류 설정 하단 바에 문장이 들어감:** 320px ja·en에서 바가 커져도 마지막 입력칸이 가리지 않는다(Task 2).
5. **공용 Callout으로 옮긴 뒤:** 모든 화면의 안내 상자 겉모습이 같아야 한다. 픽셀 비교 차이 0(Task 3).

## 이 계획이 정한 것

| 무엇 | 넘김 메모 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 스위치(강제 색상) | 12번 | `.ui-switch`에 투명 1px 테두리. 강제 색상에서 트랙 테두리 `CanvasText`, 켬 트랙 `Highlight`, 알맹이 `CanvasText`/`HighlightText`, 막힘은 `GrayText` 테두리 + 켬일 때 알맹이 오른쪽 + 트랙 빗금 없이 `GrayText` 채움 | 테두리 없는 면 부품은 강제 색상에서 통째로 사라진다 |
| 고른 라디오 원·점(설정 언어 행) | 12번 | 강제 색상에서 원 테두리 `CanvasText`, 고른 원 `Highlight` 채움, 점 `HighlightText` | 같은 이유 |
| 그 밖의 고른 상태 부품 | 7장 점검 | 날짜 칩 '오늘'·고른 칩, Segmented 고른 칸, 하단 내비 현재 칸, 체크 상자, 선택 상자(Select Box) 고른 칸, 배지·출처 표시를 강제 색상 에뮬레이션으로 점검하고, 면 색으로만 갈리는 것에 테두리(`CanvasText`/`Highlight`)를 준다 | 같은 이유 |
| 프로그램 초점 제목 | 4·14번 | 조건 화면 `h2[tabindex='-1']`의 `:focus` 링을 `:focus-visible`로(14번 /link와 같은 짝) | 코발트는 키보드 초점 링에만 |
| 대화상자 확인 뒤 초점 | 14번 | /link 연결 해제·/conditions 기간 삭제 확인 뒤, 지운 행이 사라지면 초점을 그 목록의 제목(`h2`, `tabIndex={-1}`)으로 옮긴다. 목록이 비면 섹션 제목 또는 코드 입력 | 초점이 body로 떨어지면 화면 읽기 사용자가 처음부터 다시 찾아야 한다 |
| '새 링크 만들기' 뒤 스크롤 | 13번 | 동의 제목에 `scroll-margin-top: calc(56px + env(safe-area-inset-top) + var(--space-3))`(카드 화면 cards.css:69 방식) | 고정 상단 바 밑에 가린다 |
| /link 고르기 오류 다시 누름 | 14번 | 오류 스크롤 효과를 누를 때마다 도는 횟수 상태에 묶는다 | 두 번째부터 스크롤하지 않는다 |
| DailyCheckCard 제목 단계 | 15번 | `headingLevel` prop(기본 2). 시안 보드 견본은 4 | 견본 h3 아래 h2 뒤집힘 |
| 체류 설정 하단 바 문장 | 13번 | 13번 보호자와 같은 규칙: `.app-shell:has(.onboarding-actions > p)`이면 아래 여백·scroll-padding에 문장 네 줄 몫(`4 * var(--lh-body)`)을 더한다(세로 481px 이상). 320px ja·en 보기 전용 테스트로 확인 | 같은 문제·같은 처리 |
| 공용 Callout | 8·14번 | `.ui-callout`(회색 면 `--surface-alt`, 모서리 10, 안쪽 14/16, 16/22 먹색) + `.ui-callout.has-icon`(앞 20px 아이콘 칸, 첫 줄 가운데, 사이 8). 옮길 곳: `medical-callout`, `trip-notice`(일반), `cards-note`, `emergency-lead`, `settings-disclosure`, `guardian-note`, `conditions-callout`. 기능 클래스는 남기되 같은 선언은 지운다. 겉모습 차이 0 | 같은 상자가 일곱 벌 복제돼 있다 |
| 공용 3:7 바 | 14번 | `.ui-bar-split`(`grid-template-columns: minmax(max-content, 3fr) minmax(0, 7fr); gap: var(--space-2)`, 보조 버튼 좌우 안쪽 12). `.onboarding-actions`·`.conditions-editor-actions`·`.link-bar`가 함께 쓰고, 각 기능 규칙의 같은 선언은 지운다. 겉모습 차이 0 | 세 벌 복제 |
| 죽은 CSS | 14번 | `.conditions-period` 카드 기본값·`-SELF`·`-HOSPITAL` 규칙과 248행 주석 삭제(클래스 이름은 마크업에 남긴다) | 쓰는 곳이 없다 |
| /guide 지침 둘일 때 간격 | 14번 | 구역선 위아래 24로 맞춘다(마진 겹침 해소) | 위 32·아래 24 비대칭 |
| 설정 언어 행 눌림 | 12번 | 목록 행(`ListItem`)과 같게: 눌림 면은 좌우 6px 안쪽·모서리 10, 내용만 조금 줄어든다 | 목록 행 눌림 원칙(설계서 5.5) |
| 지도 버튼 세로 배치 | 8번 | 아이콘 위·글자 아래 배치에서 `justify-content: flex-start`로 두 버튼 아이콘 높이를 맞춘다 | 글자 줄 수가 다르면 아이콘이 어긋난다 |
| 답 칩 폭 | 4번 | `AnswerInput` 칩이 320px ja·zh에서 넘치거나 한 글자씩 꺾이지 않게 줄바꿈 단위를 고친다(현재 상태를 캡처로 확인하고 고친다. 이미 문제없으면 테스트만 둔다) | 넘김 메모 |
| 테스트 도우미 | 7번 | spec마다 복제된 `styles`·`gapBetween`을 `e2e/helpers.js`로 옮기고 import로 바꾼다 | 복제 |
| 시안 보드 걸림 테스트 | 15번 | 단위 테스트 하나(`test/design-board-copies.test.js`, `npm test`가 `node --test test/*.test.js`로 찾는다): 원본 파일에 시안이 복사한 클래스 문자열이 남아 있는지 본다 | 원본이 바뀌면 시안 복사본이 조용히 어긋난다 |
| 보류: 하루 일정 입력 필요(`.trip-fix`) 주 버튼 + 매일 확인 '그대로예요' 두 코발트 | 7번 | 고치지 않는다. 운영자에게 마지막 보고에서 묻는다 | 매일 확인 관문의 강조를 낮출지는 제품 결정이다 |
| 보류: /today 새로 고치는 중 줄이 36px 밀어냄 | 7번 | 고치지 않는다. 같이 보고한다 | 자리를 늘 비워 두면 평소 간격이 늘어난다(설계 선택 필요) |

---

### Task 1: 강제 색상 모드

**Files:**
- Modify: `app/styles/ui.css`(스위치·칩·Segmented·내비·체크 상자·선택 상자·배지), `app/styles/settings.css`(언어 Radio 행), 필요한 기능 파일
- Create: `e2e/forced-colors.spec.js`

**Interfaces:**
- Consumes: `startTrip`(`e2e/helpers.js`), Playwright `page.emulateMedia({ forcedColors: 'active' })`.
- Produces: 없음.

- [ ] **Step 1: 실패하는 테스트를 쓴다 (`e2e/forced-colors.spec.js`)**

세 건을 쓴다. 강제 색상 에뮬레이션 뒤 계산된 스타일로 '보이는 경계/면'을 단언한다.

- 테스트 1 '스위치': /settings에서 알림 스위치를 본다. 강제 색상에서 `border-top-width`가 1px 이상이고 `border-top-style`이 `solid`인지 단언한다.
  - 보기 전용(쿠키 지움) 상태에서 켜진 막힌 스위치와 꺼진 막힌 스위치를 각각 만든다(12번 테스트 방식).
  - 둘의 알맹이(`::before`) `transform`이 다른지 본다.
- 테스트 2 '설정 언어 행': 고른 라디오 `input:checked`의 `background-color`가 강제 색상의 `Highlight`로 계산되는 색(에뮬레이션에서 나오는 실제 rgb 값을 처음 실행에서 읽어 단언에 고정)이고 테두리가 1px 이상인지 단언한다.
- 테스트 3 '고른 상태 부품': `/trip/<날짜>`에서 고른 날짜 칩, Segmented 고른 칸, 하단 내비 현재 칸이 강제 색상에서 `outline` 또는 `border` 너비가 1px 이상인지 단언한다(어느 쪽이든 하나).

시스템 색의 실제 rgb는 브라우저가 정한다. 첫 실행에서 읽은 값을 상수로 두고 주석에 '강제 색상 에뮬레이션(Chromium) 값'이라고 적는다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/forced-colors.spec.js
```

Expected: 세 건이 FAIL이어야 한다(테두리 0, 면만 있음).

- [ ] **Step 3: 강제 색상 규칙을 더한다**

'이 계획이 정한 것' 표의 첫 세 줄대로 `@media (forced-colors: active) { … }`를 부품 규칙 바로 아래에 둔다.
- 보통 색 모드에는 투명 테두리 외에는 바뀌는 것이 없어야 한다.
- 투명 테두리로 크기가 1px 바뀌면, `box-sizing`이나 안쪽 여백으로 상쇄해 보통 모드 크기를 지킨다.
- 강제 색상 에뮬레이션으로 주요 화면(/today, /trip/<날짜>, /settings, /conditions, /emergency, /, /onboarding)을 한 번씩 찍어 보고, 사라지는 부품이 더 있으면 같은 방식으로 고친다. 고친 목록을 보고서에 적는다.

- [ ] **Step 4: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/forced-colors.spec.js e2e/screen-settings.spec.js e2e/design-board-components.spec.js e2e/accessibility.spec.js
```

Expected: 모두 PASS. 보통 색 모드의 기존 모양 테스트가 그대로 통과한다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(a11y): 강제 색상 모드에서 스위치·고른 라디오·고른 칩·내비 현재 칸이 보이게" # 본문에 고친 부품 목록, 끝에 Co-Authored-By
```

---

### Task 2: 초점·대화상자·제목 단계·체류 설정 하단 바 여백

**Files:**
- Modify:
  - 조건: `app/styles/conditions.css`, `app/conditions/page.js`, `components/conditions/PeriodCard.js`
  - 병원 연결: `app/link/page.js`
  - 보호자: `app/styles/guardian.css` 또는 `components/guardian/GuardianCreate.js`
  - 하루 일정·시안 보드: `components/trip/DailyCheckCard.js`, `app/design-board/DesignBoard.js`
  - 체류 설정: `app/styles/onboarding.css`
- Create: `e2e/focus-flows.spec.js`

**Interfaces:**
- Consumes: `startTrip`, `linkDemoPlan`.
- Produces: `DailyCheckCard`의 새 prop `headingLevel`(2 | 3 | 4, 기본 2).

- [ ] **Step 1: 실패하는 테스트를 쓴다 (`e2e/focus-flows.spec.js`)** 네 건이다.
  - '조건 화면 프로그램 초점 제목은 마우스 흐름에서 링이 없다': 조건 화면에서 마우스로 기간 편집을 열고 닫는 등 `h2[tabindex='-1']`로 초점이 가는 흐름을 탄다. 그 제목의 `outline-style`이 `none`인지 단언한다.
  - '연결 해제 확인 뒤 초점은 body 가 아니다': `linkDemoPlan` 뒤 연결 해제 → 해제하기. `document.activeElement`가 `body`가 아니고 `main` 안에 있는지 단언한다. 조건 화면 기간 삭제도 같은 테스트 안에서 본다.
  - '새 링크 만들기 뒤 동의 제목이 고정 상단 바 밑에 가리지 않는다': /guardian에서 링크를 만든 뒤 '새 링크 만들기'. 동의 제목 위 끝이 `.top-bar` 아래 끝 이상인지 단언한다.
  - '체류 설정 하단 바에 보기 전용 문장이 들어가도 마지막 입력칸이 가리지 않는다(320px ja)': 체류 수정 화면(`/onboarding?edit=1`)을 보기 전용으로 연다. 끝까지 내린 뒤 마지막 입력칸 아래 끝 ≤ 바 위 끝인지 단언한다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/focus-flows.spec.js
```

Expected: FAIL이어야 한다. 이미 통과하는 건이 있으면 그 건은 보고서에 적고 남긴다(회귀 방지).

- [ ] **Step 3: 고친다** ('이 계획이 정한 것' 표의 해당 줄대로)
  - **조건 화면 제목:** `.conditions-section h2:focus`를 `:focus { outline: none }`와 `:focus-visible { 링 }`으로 나눈다.
  - **대화상자 확인 뒤 초점:**
    - `app/link/page.js`와 `/conditions`의 삭제 흐름에서, 확인 뒤 지운 행이 없어지면 목록 제목(`h2`, `tabIndex={-1}`, `ref`)으로 `focus()`한다.
    - 목록 제목이 사라진 경우(마지막 지침 해제)는 코드 입력칸으로 옮긴다.
    - `AlertDialog`의 초점 복귀(이전 초점)가 이미 떨어진 노드를 가리킬 때만 이 처리가 돈다.
  - **보호자 동의 제목:** `scroll-margin-top: calc(56px + env(safe-area-inset-top) + var(--space-3))`.
  - **/link 고르기 오류:** 효과를 횟수 상태에 묶는다.
  - **`DailyCheckCard`:** `headingLevel`을 받는다. 시안 보드 견본은 `headingLevel={4}`를 넘긴다.
  - **체류 설정 하단 바 여백:** `onboarding.css`에 13번 보호자와 같은 규칙을 둔다. 선택자 가중치가 전역 규칙을 이기는지 계산된 값으로 확인한다(13번에서 한 번 걸렸다).

- [ ] **Step 4: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/focus-flows.spec.js e2e/screen-conditions.spec.js e2e/screen-info-pages.spec.js e2e/screen-guardian.spec.js e2e/screen-onboarding.spec.js e2e/screen-design-board.spec.js e2e/accessibility.spec.js
```

- [ ] **Step 5: 커밋** (`fix(a11y): 프로그램 초점 링은 키보드만, 대화상자 뒤 초점, 새 링크 스크롤, 제목 단계, 체류 설정 바 여백`)

---

### Task 3: 공용 Callout·3:7 바, 죽은 CSS, 작은 모양 지적

**Files:**
- Modify:
  - 공용 규칙: `app/styles/ui.css`
  - 각 Callout 복제 자리: `app/globals.css`(medical-callout), `app/styles/trip.css`, `app/styles/cards.css`, `app/styles/emergency.css`, `app/styles/settings.css`, `app/styles/guardian.css`, `app/styles/conditions.css`
  - 마크업에 공용 클래스를 다는 곳: 각 부품·페이지
  - 3:7 바: `app/styles/onboarding.css`, `app/styles/conditions.css`(편집기·link-bar)
  - 지도 버튼·답 칩: `app/styles/place.css`, `components/ui/AnswerInput.js`·`app/styles/ui.css`
- Create: `e2e/shared-parts.spec.js`

**Interfaces:**
- Consumes: 없음.
- Produces: 클래스 `.ui-callout`, `.ui-callout.has-icon`, `.ui-callout-icon`, `.ui-bar-split`.

- [ ] **Step 1: 겉모습 기준 캡처를 만든다(커밋하지 않음)**

이 태스크를 시작할 때의 빌드로 아래 화면을 360px ko로 찍어 작업 폴더(커밋하지 않는 곳)에 둔다.
- 대상 화면: /login, /today, `/trip/<날짜>`, /cards, /emergency, /settings, /guardian, /conditions, /guide, /privacy, `/onboarding?edit=1`의 첫 단계, 조건 편집기.
- 방법은 `.superpowers/sdd/_tools/*-shots.mjs`를 참고한다. 같은 데모 데이터·같은 시각 고정이 어려우면 시각이 섞이는 부분(현재 시각 문구)은 비교에서 가린다.

- [ ] **Step 2: 실패하는 테스트를 쓴다 (`e2e/shared-parts.spec.js`)** 세 건이다.
  - '안내 상자는 공용 Callout 하나': 여러 화면에서 안내 상자가 `.ui-callout` 클래스를 갖는지 단언한다(설정 알림 안내, 긴급 안내, 카드 안내, 로그인 안내). 계산 스타일(면 rgb(243, 244, 245), 모서리 10px, 안쪽 위 14px)이 같은지도 단언한다.
  - '3:7 하단 바는 공용 클래스': 체류 설정·조건 편집기·병원 고르기 바가 `.ui-bar-split`을 가진다.
  - '설정 언어 행 눌림은 목록 행과 같다': 행을 누르고 있는 동안(`mouse.down`) 눌림 면이 좌우 6px 안쪽·모서리 10이고, 원·이름 묶음만 `transform`이 `none`이 아닌지 단언한다(목록 행 테스트 방식, `e2e/screen-more.spec.js`·`screen-trip.spec.js` 참고).

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/shared-parts.spec.js
```

- [ ] **Step 4: 고친다** ('이 계획이 정한 것' 표의 해당 줄대로)
  - **공용 Callout:** `ui.css`에 공용 클래스를 두고, 각 마크업에 `ui-callout`(+ 아이콘이면 `has-icon`, 아이콘 칸 `ui-callout-icon`)을 단다. 기능 CSS의 같은 선언을 지운다. 대기 색·분홍 등 면 색 차이는 기능 클래스에 남긴다.
  - **공용 3:7 바:** 세 바에 `ui-bar-split`을 달고 같은 선언을 지운다.
  - **죽은 CSS:** 삭제한다.
  - **나머지:** /guide 간격, 설정 언어 행 눌림, 지도 버튼 정렬, 답 칩 폭을 고친다.

- [ ] **Step 5: 겉모습 비교**

Step 1과 같은 방법으로 다시 찍는다. 화면별로 Playwright의 이미지 비교(`expect(…).toMatchSnapshot` 같은 임시 spec, 커밋하지 않음)나 간단한 픽셀 비교 스크립트로 차이를 잰다. 의도한 변화만 남아야 한다.
- 의도한 변화: 지도 버튼 아이콘 높이, 320px ja·zh 답 칩, /guide 지침 둘일 때 간격, 설정 언어 행의 눌렀을 때만 보이는 모양.
- 그 밖에 차이가 있으면 고친다.
- 비교 결과(화면별 차이 픽셀 수)를 보고서에 적는다.

- [ ] **Step 6: 관문 일부와 커밋**

```bash
npm run build && npm run e2e -- e2e/shared-parts.spec.js e2e/screen-*.spec.js e2e/accessibility.spec.js e2e/design-board*.spec.js
```

(`refactor(ui): 안내 상자·3:7 하단 바를 공용 클래스로, 죽은 CSS 삭제, 언어 행 눌림·지도 버튼·답 칩·안내 간격`)

---

### Task 4: 테스트 도우미 정리, 시안 보드 걸림 테스트, 남은 테스트 지적

**Files:**
- Modify: `e2e/helpers.js`, `styles`·`gapBetween`을 복제한 `e2e/screen-*.spec.js`들, `e2e/screen-design-board.spec.js`, `e2e/screen-more.spec.js`, `e2e/screen-login.spec.js`, `app/styles/ui.css`(주석 한 줄)
- Create: `test/design-board-copies.test.js`(`node:test`·`node:assert`, 다른 `test/*.test.js`와 같은 모양)

**Interfaces:**
- Produces: `e2e/helpers.js`의 `export async function styles(locator, props)`, `export function gapBetween(upper, lower)`.

- [ ] **Step 1: 시안 보드 걸림 단위 테스트를 쓴다**

`app/design-board/ScreenPreviews.js`가 손으로 복사한 블록마다, 원본 파일에 그 클래스 문자열이 남아 있는지 본다. 최종 검토가 짚은 목록은 다음과 같다.
- `Deadline`
- `StopActions`·`useTimeline`
- `IntroBlock`(`lib/server/ai-intro.js` `templateIntro` 포함)
- `ConsentWithdrawBlock`
- `CardsSection`
- 병원 행
- `GuardianPinSection`

`fs.readFileSync`로 원본을 읽고 `includes`로 본다. 원본 클래스 하나를 지우면 이 테스트가 깨지는 것을 RED로 한 번 보이고 되돌린다.

- [ ] **Step 2: 공용 도우미로 옮긴다**

`styles`·`gapBetween`을 `e2e/helpers.js`로 옮긴다. 복제한 spec들은 import로 바꾼다. 단언은 한 글자도 바꾸지 않는다. 함수 모양이 spec마다 조금 다르면 가장 많이 쓰는 모양으로 맞추고, 다른 곳은 호출을 그대로 둘 수 있게 같은 인자 순서를 지킨다.

- [ ] **Step 3: 남은 테스트 지적**
  - `screen-design-board.spec.js`: 보드를 여는 동안 `/api/` 요청이 0건인지 단언한다(e2e 1건 추가).
  - `screen-more.spec.js`: 행의 앞 아이콘과 설명을 단언한다(9·11번 넘김).
  - `screen-login.spec.js`:
    - 데모 버튼 폭 = 구글 버튼 폭 단언을 더한다.
    - 320px 테스트의 `span.first()`를 역할·이름 기반 로케이터로 바꾼다(2번 넘김).
  - `ui.css` `main.page.is-basement` 규칙 위에 시안 보드 복사본(`designBoard.css`) 상호 참조 주석 한 줄을 둔다.

- [ ] **Step 4: 진행 현황 한 줄 (`docs/tracking/status.md`)**

15/15 줄 아래에 더한다.

```markdown
- SEED 적용 ③층 마지막 일괄: 강제 색상 모드(스위치·고른 라디오·칩·내비 현재 칸), 프로그램 초점 링은 키보드만·대화상자 뒤 초점·제목 단계, 체류 설정 하단 바 문장 여백, 안내 상자·3:7 하단 바를 공용 클래스로(겉모습 차이 0), 죽은 CSS 삭제, 테스트 도우미 공용화, 시안 보드 걸림 테스트. 계획서 `docs/superpowers/plans/2026-10-26-seed-layer3-final-pass.md`
```

- [ ] **Step 5: 전체 관문과 커밋**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 217건, 단위 테스트는 1,737건이다.

(`test: e2e 도우미 공용화, 시안 보드 걸림 테스트, 더보기·로그인 테스트 보강, 진행 현황`)

---

### Task 5: 브랜치 ③층 전체 최종 검토와 운영자 보고 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: ③층 전체(설계서 커밋 이후~HEAD)를 가장 강한 모델로 최종 검토한다.** 남은 지적은 한 번의 수정 묶음으로 처리한다.
- [ ] **Step 2: 강제 색상 모드 캡처(주요 화면)와 Task 3 픽셀 비교 결과를 운영자에게 보여 준다.**
- [ ] **Step 3: 보류 두 가지(입력 필요 + 매일 확인 두 코발트, 새로 고치는 중 줄 밀림)를 운영자에게 묻는다.**
- [ ] **Step 4: SEED 적용 전체 마무리 보고.** 배포·병합은 공모전 주최 측 답을 기다리는 동안 보류다.
