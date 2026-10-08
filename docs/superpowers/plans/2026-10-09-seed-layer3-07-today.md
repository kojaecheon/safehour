# SEED ③층 7/15 오늘 화면(`/today`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 화면을 설계서 6.2 7번 배치로 바꾼다. 회색 바탕 위 흰 블록에 매일 확인, 날짜·상태, 다음 외출, 바로가기 목록을 놓는다.

**Architecture:** 판정·게이트·동기화(`useTrip`, `todayFocus`, `DailyCheckCard`의 조건)는 그대로 두고 표시만 바꾼다. 6번(하루 일정)에서 만든 부품을 그대로 쓴다.
- 쓰는 부품: 알림 상자 `TripNotice`, 변경됨 안내 상자 `.trip-changed`, 고칠 곳 점선 상자 `.trip-fix`.
- 새로 만드는 부품: 세 화면에 복제된 '갱신 실패' 블록을 `UpdateFailedNotice` 하나로 묶는다.

새 화면 테스트는 `e2e/screen-today.spec.js`이고, 태스크 셋이 한 묶음씩 더한다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(층), 4.6(눌림), 5.1(버튼), 5.5(흰 블록·목록 행), 5.6(Callout·변경됨 알림), 5.9(아이콘)
- 6.1, 6.2 7번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`의 '6번(하루 일정)에서 7번(오늘)으로' 절(git 제외)

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
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, 타임라인 선, '오늘' 표시, 키보드 초점 링에만 쓴다.
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 상태 이름·사유 문장·병기 언어를 바꾸지 않는다.
  - 복귀 마감의 두 언어 문장(시각·이유·예상 귀가·추정 표시)을 바꾸지 않는다.
  - 즉시 복귀 배너(2px 먹색 테두리)와 데모 표시 배지를 바꾸지 않는다.
  - 매일 확인 전 길찾기와 편집을 막는 동작을 바꾸지 않는다.
- **표시만 바꾼다:** 다음은 그대로 둔다.
  - 매일 확인 카드의 자리(맨 위 고정)와 조건, 두 버튼의 동작, 누른 뒤 초점 이동(`.today-date`).
  - 알림 문구, 변경됨 시트, 즉시 복귀 시트, 다시 만들기 시트.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/core-flow.spec.js`('그대로예요'·'바뀌었어요'·'오늘 조건이 그대로인가요?' 제목).
  - `e2e/accessibility.spec.js`(매일 확인 키보드, `.today-date` 초점).
  - `e2e/hospital-link.spec.js`(`.today-date` 안 데모 배지), `e2e/offline.spec.js`(보기 전용 버튼 막힘), `e2e/privacy.spec.js`('개인정보와 면책 안내' 링크).
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 125건이고 Task 1 뒤 131 → Task 2 뒤 134 → Task 3 뒤 137건이 된다.
  - `e2e/demo-events.spec.js` 한 건과 Task 2의 다음 외출 테스트는 시간대에 따라 건너뛸 수 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **일정 갱신이 실패한 오늘:** 실패 알림이 회색 바탕 위가 아니라 흰 블록 안에 보여야 한다(! 아이콘, 굵은 제목, 다시 시도 버튼 포함). 같은 부품이 /trip과 하루 일정에서도 보인다(Task 1).
2. **320px 영어, 매일 확인 전:** 확인 카드, 목록 행, 상태 배너에 가로 스크롤이 없어야 한다(Task 1).
3. **외출이 끝난 저녁, 외출이 없는 날, 입력이 필요한 날:** 내용 없는 빈 흰 블록이 생기면 안 된다(Task 1의 빈 블록 테스트와 Task 3의 입력 필요 테스트).
4. **확인하지 않은 병원 안내:** 안내 블록의 회색 버튼이 흰 면 위에서 버튼으로 보여야 한다. 회색 상자 안 회색 버튼처럼 보이면 안 된다(Task 3).
5. **데모 사건 뒤 오늘:** 변경됨 알림이 하루 일정과 같은 누르는 안내 상자로 보여야 하고(화살표, 왼쪽 정렬), 즉시 복귀 배너는 2px 먹색 그대로여야 한다(Task 3).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕과 블록 순서 | 6.2 7번 '날짜·상태 / 매일 확인 / 다음 외출 / 바로가기 목록' | `main`에 `is-basement`. 블록 순서는 아래와 같다. 각 블록은 내용이 있을 때만 그린다. 개인정보 링크는 블록 밖 회색 바탕 위 맺음 줄이다. | 매일 확인은 '맨 위 고정'이 제품 규칙(규칙 32)이라 설계서 표기 순서보다 앞에 둔다. 표시만 바꾸는 계획이다 |
| 매일 확인 블록 | 6.2 7번 | 대기 색 카드(2px 테두리, 모서리 24, 대기 색 면)를 흰 블록으로 바꾼다. '확인 필요'는 대기 색 글자 + 시계 아이콘 그대로, 요약 목록은 회색 면 모서리 10. '제한 항목 n개 보기'는 코발트 테두리 버튼에서 먹색 펼침 행(44px)으로 | 흰 블록 안 카드는 겹면이다. 상태는 아래 상태 배너(STANDBY + 사유)와 '확인 필요' 표시가 함께 알린다. 코발트 쓰임 제한 |
| 다음 외출 블록 | 6.2 7번 | 카드(테두리·그림자·모서리 24)를 없앤다. 블록 자체가 구역이다. 복귀 마감은 왼쪽 4px 먹색 띠를 없앤 안내 상자(회색 면, 모서리 10, 안쪽 14/16)이고 깃발 아이콘과 큰 시각은 그대로. 외출 끝·외출 없음은 상자 없는 제목·문장 | 5.6 띠 상자 → 옅은 면 + 아이콘. 블록 안 카드는 겹면이다 |
| 바로가기 목록 | 6.2 7번 | '오늘 전체 일정'(코발트 큰 버튼)과 '내일 일정'(회색 큰 버튼)을 목록 행 두 줄로(앞 일정 아이콘, 뒤 화살표) | 코발트 채움은 화면당 주 버튼 하나다. 매일 확인 전에는 '그대로예요'가 주 버튼이다 |
| 갱신 실패 | 넘김 메모(세 화면 복제) | `components/trip/UpdateFailedNotice.js`로 묶어 /today, /trip, /trip/[날짜]가 함께 쓴다. 제목 줄은 굵게. /today와 하루 일정에서는 흰 블록 안 | 같은 블록 세 벌은 중복이다. 회색 바탕 위 회색 알림을 막는다 |
| 알림 자리 | 넘김 메모(상자/글자 통일 여부) | /today는 지금처럼 상자(info 아이콘), 하루 일정은 글자만(plain) 그대로 | /today 알림은 확인 완료·보기 전용 같은 화면 전체 결과이고, 하루 일정 알림은 편집 바로 옆 짧은 결과다. 동작을 바꾸지 않는다 |
| 변경됨 알림 | 넘김 메모 | 하루 일정과 같은 마크업(`.trip-changed` 단독, 글자 칸, 화살표) | 섞인 모양(.btn 눌림 축소)이 사라진다 |
| 입력 필요 | 5.6 | `.today-callout` → 하루 일정과 같은 고칠 곳 점선 상자(`.trip-fix`), 상태 블록 안 | 같은 뜻은 같은 모양 |
| 병원 안내 미확인, 보호자 링크 다시 보내기, 동반 보호자 다시 만들기 | 5.5 흰 블록 | 테두리 상자(`.today-callout`)를 없애고 각자 흰 블록 구역(`.today-section`)으로. '나중에'(조용한 버튼)는 회색 버튼 | 회색 Callout 안에 회색 버튼을 두면 버튼이 보이지 않는다. 흰 블록 위 회색 버튼은 보인다 |
| 즉시 복귀 배너 | 안전 지시 | 그대로(2px 먹색, 모서리 12, 6번에서 바뀜) | 안전 지시의 강한 모양 |
| 상태 배너 아래 여백 | 4.5 | 상태 블록 안에서 상태 배너의 바깥 아래 여백(16px)을 0으로. 하루 일정 상태 블록도 같이 | 블록 안 간격은 grid gap(12px)이 맡는다 |

블록 순서는 다음과 같다.
1. 동기화(갱신 실패·새로 고치는 중)
2. 매일 확인
3. 날짜·상태
4. 병원 안내 미확인
5. 다음 외출
6. 바로가기 목록
7. 보호자 링크 다시 보내기
8. 동반 보호자 다시 만들기

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/today/page.js` | 오늘 화면 | 블록 감싸기·바로가기 목록(T1), 외출 블록 안(T2), 상태 블록 안·구역 블록(T3) |
| `components/trip/UpdateFailedNotice.js` | **새** 갱신 실패 알림 | T1 |
| `components/trip/DayScreen.js` | 하루 일정 | 갱신 실패를 새 부품으로(T1) |
| `app/trip/page.js` | 전체 일정 | 갱신 실패를 새 부품으로(T1) |
| `components/trip/DailyCheckCard.js` | 매일 확인 카드 | 바꾸지 않는다(CSS만) |
| `app/styles/today.css` | 오늘 배치 | T1·T2·T3 |
| `app/styles/trip.css` | 일정 공용 | 알림 제목 굵게·상태 배너 여백(T1) |
| `e2e/helpers.js` | e2e 도우미 | 데모 사건 도우미 옮김(T3) |
| `e2e/screen-today.spec.js` | **새** ③층 오늘 모양 테스트 | T1이 만들고 T2·T3이 더한다 |
| `e2e/screen-day.spec.js` | 하루 일정 테스트 | 데모 도우미를 helpers 로(T3, 단언은 그대로) |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T3) |

---

### Task 1: 회색 바탕·흰 블록 틀, 갱신 실패 부품, 바로가기 목록

**Files:**
- Create: `components/trip/UpdateFailedNotice.js`
- Create: `e2e/screen-today.spec.js`
- Modify: `app/today/page.js`(`return (`의 `<main>`, `let body;` 아래 다섯 빈 상태 분기와 불러오는 중, 날짜 본문 `body = ( <> … </> )`)
- Modify: `components/trip/DayScreen.js`(`trip.updateFailed` 블록 한 곳)
- Modify: `app/trip/page.js`(`trip.updateFailed` 블록 한 곳)
- Modify: `app/styles/today.css`(`.today-page` 아래에 블록 규칙 추가)
- Modify: `app/styles/trip.css`(`.trip-notice` 무리 아래에 `.trip-notice-title`, 하루 일정 절의 상태 블록 규칙에 상태 배너 여백)

**Interfaces:**
- Consumes:
  - `TripNotice`(`components/trip/TripNotice.js`): `error`, `role`, `as`, `slot`, `plain` 속성.
  - `ListGroup`, `ListItem`, `Icon`(`@/components/ui/index.js`), `.ui-block`, `main.page.is-basement`.
  - `startTrip`, `kstDate`, `buildStay`(`e2e/helpers.js`).
- Produces:
  - `UpdateFailedNotice({ readOnly: boolean, onRetry: () => void })`.
  - 블록 클래스 `today-sync-block`, `today-check-block`, `today-status-block`, `today-outing-block`, `today-links-block`.
  - 테스트 도우미 `styles`, `gapBetween`, `failNextSync(page)`.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-today.spec.js`)**

```js
// ③층 오늘(/today): SEED 화면 배치 (설계서 6.2 7번)
//
// 회색 바탕 위 흰 블록: 동기화 / 매일 확인 / 날짜·상태 / 병원 안내 / 다음 외출 / 바로가기 목록 / 보호자·동반 안내.
// 체류는 e2e 도우미 startTrip 으로 심는다(기본: 어제 입국 → 4일 뒤 출국, 동의 있음, 오늘 매일 확인 마침).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245),
// --state-standby-bg rgb(255, 244, 217), --state-standby-ink rgb(122, 74, 0), --ink rgb(26, 28, 32).

import { test, expect } from './fixtures.js';
import { buildStay, kstDate, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

/**
 * 다음 재계획을 실패시킨다: 일정 API 를 503 으로 막고, 다른 탭에서 체류를 바꾼 것처럼 storage 이벤트를 보낸다
 * (같은 탭의 localStorage 쓰기는 이벤트가 나지 않는다). 출국을 하루 늦춰 영향 날짜가 생기게 한다.
 */
async function failNextSync(page) {
  await page.route('**/api/itinerary/plan', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }),
  );
  await page.evaluate(async (stay) => {
    const { accountKey } = await (await fetch('/api/auth/session', { cache: 'no-store' })).json();
    const key = `safehour.v2.${accountKey}.stay`;
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ schemaVersion: 2, data: stay });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
  }, buildStay({ departure: 5 }));
}

test.describe('③층 오늘, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 날짜·상태 블록이 상단 바 바로 아래, 블록 사이 8px', async ({ page }) => {
    await startTrip(page);
    await expect(page.locator('.state-banner')).toBeVisible();
    await expect(page.locator('.today-syncing')).toHaveCount(0);

    const main = page.locator('main.today-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(3);
    const status = main.locator(':scope > .today-status-block');
    await expect(status.locator('.today-date')).toHaveCount(1);
    await expect(status.locator('.state-banner')).toHaveCount(1);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await blocks.first().boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
  });

  test('바로가기 목록: 오늘 전체 일정·내일 일정은 화살표 목록 행이고 코발트 채움이 없다', async ({ page }) => {
    await startTrip(page);
    const block = page.locator('main.today-page > .today-links-block');
    const full = block.getByRole('link', { name: '오늘 전체 일정', exact: true });
    const next = block.getByRole('link', { name: '내일 일정', exact: true });
    await expect(full).toHaveAttribute('href', `/trip/${kstDate(0)}`);
    await expect(next).toHaveAttribute('href', `/trip/${kstDate(1)}`);
    for (const row of [full, next]) {
      await expect(row).toHaveClass(/ui-list-item/);
      await expect(row.locator('.ui-list-item-trailing svg')).toHaveCount(1);
      await expect.poll(async () => (await styles(row, ['background-color']))['background-color']).toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('갱신 실패: 흰 블록 안의 대기 색 알림 상자, ! 아이콘, 굵은 제목, 다시 시도', async ({ page }) => {
    await startTrip(page);
    await expect(page.locator('.state-banner')).toBeVisible();
    await failNextSync(page);
    const alert = page.getByRole('alert').filter({ hasText: '일정을 새로 고치지 못했어요' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main.today-page > .today-sync-block').getByRole('alert')).toHaveCount(1);
    await expect(alert.locator('.trip-notice-icon svg')).toHaveCount(1);
    await expect
      .poll(() => styles(alert, ['background-color']))
      .toEqual({ 'background-color': 'rgb(255, 244, 217)' });
    expect((await styles(alert.locator('.trip-notice-title'), ['font-weight']))['font-weight']).toBe('700');
    await expect(alert.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  for (const confirmToday of [true, false]) {
    test(`빈 흰 블록이 없다: ${confirmToday ? '확인 마친 오늘' : '매일 확인 전 오늘'}`, async ({ page }) => {
      await startTrip(page, {}, { confirmToday });
      await expect(page.locator('.state-banner')).toBeVisible();
      const texts = await page
        .locator('main.today-page > .ui-block')
        .evaluateAll((els) => els.map((el) => el.innerText.trim().length));
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.every((n) => n > 0), `빈 블록: ${JSON.stringify(texts)}`).toBe(true);
    });
  }

  test('320px English, 매일 확인 전: 오늘 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, { hasCompanion: true }, { confirmToday: false });
    await expect(page.locator('.today-check')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js
```

Expected:
- 앞의 다섯 건은 FAIL이어야 한다.
  - 첫 건: 바탕이 흰색이다.
  - 둘째 건: `.today-links-block`이 없다.
  - 셋째 건: `.today-sync-block`이 없다.
  - 넷째·다섯째 건: `.ui-block`이 없어 `texts.length`가 0이다.
- 여섯째 건(320px)은 지금도 통과할 수 있다(회귀 가드).

- [ ] **Step 3: 갱신 실패 부품 (`components/trip/UpdateFailedNotice.js`)**

```jsx
'use client';

// 일정 갱신 실패 알림 (/today · /trip · /trip/[날짜] 공용)
//
// 저장한 일정을 그대로 보여 주고 있다는 것과 다시 시도를 함께 알린다. 대기 색 알림 상자(TripNotice error, ! 아이콘).
// 보기 전용(로그인 만료·오프라인)이면 다시 시도 버튼을 숨긴다. 화면이 회색 바탕이면 부르는 쪽이 흰 블록 안에 둔다.

import { useLang } from '../LanguageProvider.js';
import { Button } from '../ui/index.js';
import TripNotice from './TripNotice.js';

/**
 * @param {object} props
 * @param {boolean} props.readOnly
 * @param {() => void} props.onRetry
 */
export default function UpdateFailedNotice({ readOnly, onRetry }) {
  const { t } = useLang();
  return (
    <TripNotice error role="alert">
      <p className="trip-notice-title">{t('today.updateFailedTitle')}</p>
      <p>{t('today.updateFailedBody')}</p>
      {!readOnly && (
        <Button variant="secondary" size="small" onClick={onRetry}>
          {t('today.retry')}
        </Button>
      )}
    </TripNotice>
  );
}
```

3-a. `components/trip/DayScreen.js`의 `{trip.updateFailed && ( <div className="ui-block"> <TripNotice error role="alert"> … </TripNotice> </div> )}`에서 안쪽 `TripNotice` 묶음을 `<UpdateFailedNotice readOnly={trip.readOnly} onRetry={() => trip.retry()} />`로 바꾼다. 바깥 `div.ui-block`은 둔다. 가져오기를 더하고, `TripNotice`가 다른 곳에서 쓰이는지 확인해 남은 쓰임이 있으면 가져오기를 둔다.

3-b. `app/trip/page.js`의 `{trip.updateFailed && ( <TripNotice error role="alert"> … </TripNotice> )}`를 `{trip.updateFailed && <UpdateFailedNotice readOnly={trip.readOnly} onRetry={() => trip.retry()} />}`로 바꾼다. 가져오기 정리는 3-a와 같다.

- [ ] **Step 4: 오늘 화면 블록 (`app/today/page.js`)**

4-a. 파일 머리 주석의 `//   - 로그인 만료·오프라인에서는 보기 전용이다 …` 줄 아래에 한 줄을 더한다.

```js
//   - SEED ③층(설계서 6.2 7번): 회색 바탕 위 흰 블록. 동기화 / 매일 확인 / 날짜·상태 / 병원 안내 / 다음 외출 / 바로가기 / 보호자·동반 안내.
```

4-b. 가져오기를 바꾼다. `@/components/ui/index.js`에서 `ListGroup`, `ListItem`을 더 가져오고 `UpdateFailedNotice`를 가져온다. `TripNotice`는 알림 자리에 계속 쓴다.

4-c. 불러오는 중과 다섯 빈 상태 분기(`!stay`, `!trip.tripPlan`, `!inStay`, `!day`)의 `body = ( … );` 각각을 `<div className="ui-block"> … </div>`로 감싼다. 안의 요소·속성은 그대로 둔다. 예:

```jsx
    body = (
      <div className="ui-block">
        <p className="today-loading" role="status">
          {t('today.loading')}
        </p>
      </div>
    );
```

4-d. 날짜 본문 `body = ( <> … </> );`를 아래로 바꾼다. **요소의 조건·속성·문구는 그대로** 두고 묶음만 나눈다. 바뀌는 것은 두 가지다.
- 바로가기 두 버튼(`div.today-links`)이 목록 행이 된다.
- 다음 외출 블록은 내용이 있을 때만 그린다.

```jsx
    const outingNow = Boolean(focus && focus.phase !== 'DONE' && focus.outing);
    const outingDone = focus?.phase === 'DONE';
    const outingNone = !focus && nowMin !== null && !fix && !stored?.returnNow;
    const hasOutingBlock = outingNow || outingDone || outingNone || Boolean(focus?.nextAppointment);
    body = (
      <>
        {trip.dailyCheckPending && (
          <div className="ui-block today-check-block">
            <DailyCheckCard day={stored} stay={stay} readOnly={trip.readOnly} onSame={confirmSame} onChanged={changed} />
          </div>
        )}

        <div className="ui-block today-status-block">
          <p className="today-date" tabIndex={-1} ref={dateRef}>
            <span>{formatDate(today, locale)}</span>
            {/* 연결된 지침이 데모면 늘 밝힌다 — 데모를 실제 연동처럼 보이지 않게 (spec 4.20 · 9.1) */}
            {isDemoMode(stay) && <Badge kind="demo" label={t('link.demoBadge')} />}
          </p>

          <StateBanner state={day.dayState} reasons={day.reasons ?? []} live />

          <TripNotice slot role="status">
            {notice ? t(notice) : ''}
          </TripNotice>

          {delta?.unseen && (
            <button type="button" className="btn btn-secondary trip-changed" onClick={() => setSheet('delta')}>
              <span className="trip-changed-dot" aria-hidden="true" />
              {t('trip.changedCta')}
            </button>
          )}

          {stored?.returnNow && !trip.immediateReturn && (
            <section className="trip-return-banner" aria-labelledby="today-return-h">
              <h2 id="today-return-h" lang={returnTitle.primary.lang}>
                {returnTitle.primary.text}
              </h2>
              <p className="trip-pair-secondary" lang={returnTitle.secondary.lang}>
                {returnTitle.secondary.text}
              </p>
              <button type="button" className="btn btn-return" onClick={() => setSheet('return')}>
                {t('return.reopen')}
              </button>
            </section>
          )}

          {trip.unconfirmedHospitalUpdate && (
            <section className="today-callout" aria-labelledby="today-hospital-h">
              <h2 id="today-hospital-h">
                <Icon name="hospital" size={20} /> {t('today.unconfirmedTitle')}
              </h2>
              <p>{t('today.unconfirmedBody')}</p>
              <Button href="/guide" variant="secondary">
                {t('today.unconfirmedCta')}
              </Button>
            </section>
          )}

          {fix && (
            <section className="today-callout" aria-labelledby="today-fix-h">
              <h2 id="today-fix-h">{t('today.needsInputTitle')}</h2>
              <Button href={trip.readOnly ? undefined : fix.href} disabled={trip.readOnly}>
                {t(fix.key)}
              </Button>
            </section>
          )}
        </div>

        {hasOutingBlock && (
          <div className="ui-block today-outing-block">
            {outingNow && (
              <section className="today-focus" aria-labelledby="today-focus-h">
                <h2 id="today-focus-h">{focus.phase === 'OUT' ? t('today.nextOutTitle') : t('today.nextNextTitle')}</h2>
                <p className="today-focus-depart">{t('today.departAt', { time: focus.outing.departAt })}</p>
                <Deadline outing={focus.outing} day={day} stay={stay} />
                {focus.stop && (
                  <div className="today-next-stop">
                    <h3>{t('today.nextStop')}</h3>
                    <CourseCard stop={focus.stop} variant="compact" headingLevel={4} />
                    <MapLinks stop={focus.stop} disabled={gated || focus.outing.actionable === false} disabledKey={trip.dailyCheckPending ? 'today.gatedMaps' : 'today.gatedHospital'} showNote />
                  </div>
                )}
              </section>
            )}
            {outingDone && (
              <section className="today-callout" aria-labelledby="today-done-h">
                <h2 id="today-done-h">{t('today.nextDoneTitle')}</h2>
              </section>
            )}
            {outingNone && (
              <section className="today-callout" aria-labelledby="today-none-h">
                <h2 id="today-none-h">{t('today.noOutingTitle')}</h2>
                <p>{t('today.noOutingBody')}</p>
              </section>
            )}
            {focus?.nextAppointment && (
              <p className="today-appointment">
                <Icon name="hospital" size={18} /> {t('today.appointmentLine', { start: focus.nextAppointment.start, end: focus.nextAppointment.end })}
              </p>
            )}
          </div>
        )}

        <div className="ui-block today-links-block">
          <ListGroup>
            <li>
              <ListItem title={t('today.fullDay')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${today}`} />
            </li>
            {hasTomorrow && (
              <li>
                <ListItem title={t('today.tomorrow')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${tomorrow}`} />
              </li>
            )}
          </ListGroup>
        </div>

        {trip.guardianResendNeeded && (
          <section className="ui-block today-callout" aria-labelledby="today-guardian-h">
            <h2 id="today-guardian-h">{t('today.guardianResendTitle')}</h2>
            <p>{t('today.guardianResendBody')}</p>
            <Button href={trip.readOnly ? undefined : '/guardian'} variant="secondary" disabled={trip.readOnly}>
              {t('today.guardianResendCta')}
            </Button>
          </section>
        )}

        {trip.companionChangeNeedsRegenerate && (
          <section className="ui-block today-callout" aria-labelledby="today-companion-h">
            <h2 id="today-companion-h">{t('today.companionTitle')}</h2>
            <p>{t('today.companionBody')}</p>
            <div className="today-callout-actions">
              <Button variant="secondary" disabled={trip.readOnly || trip.dailyCheckPending} onClick={() => setSheet('regenerate')}>
                {t('today.companionCta')}
              </Button>
              <Button variant="quiet" onClick={() => trip.dismissCompanionNotice()}>
                {t('today.companionDismiss')}
              </Button>
            </div>
            {trip.dailyCheckPending && <p className="trip-map-note">{t('trip.editGated')}</p>}
          </section>
        )}
      </>
    );
```

이 태스크에서는 몇 가지를 그대로 둔다(Task 2·3에서 바꾼다).
- 상태 블록 안의 병원 안내 미확인·입력 필요 구역과 외출 블록 안의 외출 끝·외출 없음 구역은 지금 모양(`today-callout`)이다.
- 보호자·동반 구역은 `ui-block today-callout`으로 각자 흰 블록이 되지만 안쪽 모양은 그대로다.
- 변경됨 버튼도 지금 마크업 그대로다.

4-e. 맨 아래 `return (`의 `<main>` 안을 아래로 바꾼다. 갱신 실패와 새로 고치는 중 줄은 흰 블록 하나에 담는다. 개인정보 맺음 줄은 그대로 둔다.

```jsx
      <main className="page today-page is-basement">
        {(trip.updateFailed || (trip.syncing && trip.tripPlan)) && (
          <div className="ui-block today-sync-block">
            {trip.updateFailed && <UpdateFailedNotice readOnly={trip.readOnly} onRetry={() => trip.retry()} />}
            {trip.syncing && trip.tripPlan && (
              <p className="today-syncing" role="status">
                {t('today.syncing')}
              </p>
            )}
          </div>
        )}
        {body}
        <p className="trip-footer">
          <Link className="trip-inline-link" href="/privacy">
            {t('today.privacyLink')}
          </Link>
        </p>
      </main>
```

- [ ] **Step 5: 블록 배치와 알림 제목 (`app/styles/today.css`, `app/styles/trip.css`)**

5-a. `app/styles/today.css`의 `.today-page > * { min-width: 0; }` 규칙 바로 아래에 더한다.

```css
/* 오늘 (설계서 6.2 7번): 회색 바탕 위 흰 블록. 블록 틈(8px)이 간격을 주므로 화면 공통 세로 간격을 끈다 */
.today-page.is-basement {
  gap: 0;
}
.today-sync-block,
.today-status-block,
.today-outing-block {
  display: grid;
  gap: var(--space-3);
}
/* 개인정보 맺음 줄: 회색 바탕 위 글자 링크라 위 선을 두지 않는다 */
.today-page.is-basement > .trip-footer {
  border-top: 0;
  padding-top: 0;
}
```

5-b. `app/styles/trip.css`의 `.trip-notice-body` 규칙 바로 아래에 더한다.

```css
/* 알림 상자 제목 줄(갱신 실패 등): 굵게 */
.trip-notice-title {
  font-weight: var(--weight-bold);
}
```

5-c. `app/styles/trip.css` 하루 일정 절의 `.trip-status-block, .trip-timeline-block, .trip-tools-block { … }` 규칙 바로 아래에 더한다.

```css
/* 상태 블록 안 상태 배너: 바깥 아래 여백(16px) 대신 블록의 grid 간격(12px)을 쓴다 (오늘 화면도 같다) */
.trip-status-block > .state-banner,
.today-status-block > .state-banner {
  margin-bottom: 0;
}
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js e2e/screen-day.spec.js e2e/screen-trip.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/hospital-link.spec.js e2e/offline.spec.js e2e/privacy.spec.js
```

Expected: PASS. `screen-today` 6건과 나머지 파일이 모두 통과해야 한다. 기존 단언이 깨지면 단언을 고치지 말고 멈추고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add components/trip/UpdateFailedNotice.js components/trip/DayScreen.js app/trip/page.js app/today/page.js app/styles/today.css app/styles/trip.css e2e/screen-today.spec.js
git commit -m "$(cat <<'MSG'
style(today): 오늘을 회색 바탕 위 흰 블록으로, 바로가기 목록 행, 갱신 실패 부품 공용화

- 오늘을 회색 바탕 위 흰 블록으로: 동기화 / 매일 확인 / 날짜·상태 / 다음 외출 / 바로가기 / 보호자·동반 안내.
- 다음 외출 블록은 내용이 있을 때만 그린다(빈 흰 블록 없음).
- '오늘 전체 일정'·'내일 일정'을 코발트·회색 큰 버튼에서 화살표 목록 행으로.
- 갱신 실패 알림을 UpdateFailedNotice 하나로 묶어 /today·/trip·/trip/[날짜]가 함께 쓴다(제목 굵게).
- 상태 블록 안 상태 배너의 바깥 아래 여백을 없앤다(하루 일정도 같이).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 매일 확인 블록과 다음 외출 블록 안쪽

**Files:**
- Modify: `e2e/screen-today.spec.js`(파일 끝에 묶음 하나)
- Modify: `app/today/page.js`(외출 끝·외출 없음 구역의 `className` 두 곳)
- Modify: `app/styles/today.css`
  - 매일 확인: `.today-check`, `.today-check-list`, `.today-check-more > summary` 규칙
  - 다음 외출: `.today-focus`, `.today-deadline` 규칙
  - 새 `.today-outing-empty` 규칙

**Interfaces:**
- Consumes:
  - Task 1의 `styles`.
  - 블록 `today-check-block`, `today-outing-block`.
- Produces: 외출 끝·외출 없음 구역 클래스 `today-outing-empty`.

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-today.spec.js` 끝)**

```js
test.describe('③층 오늘, 매일 확인과 다음 외출', () => {
  test('매일 확인 블록: 카드 테두리·면 없이 흰 블록, 확인 필요는 대기 색 글자 + 아이콘, 요약은 회색 면 모서리 10', async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    const check = page.locator('main.today-page > .today-check-block .today-check');
    await expect(check).toBeVisible();
    await expect
      .poll(() => styles(check, ['border-top-width', 'background-color']))
      .toEqual({ 'border-top-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    const flag = check.locator('.today-check-flag');
    expect((await styles(flag, ['color']))['color']).toBe('rgb(122, 74, 0)');
    await expect(flag.locator('svg')).toHaveCount(1);
    expect(await styles(check.locator('.today-check-list').first(), ['background-color', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'border-top-left-radius': '10px',
    });
    // 매일 확인 전에는 '그대로예요'가 화면의 주 버튼(코발트 채움 rgb(10, 92, 255))이다
    const same = check.getByRole('button', { name: '그대로예요' });
    await expect.poll(async () => (await styles(same, ['background-color']))['background-color']).toBe('rgb(10, 92, 255)');
  });

  test('제한 항목 펼치기: 코발트·테두리 없는 먹색 펼침 행, 높이 44 이상', async ({ page }) => {
    await startTrip(page, {}, { confirmToday: false });
    const summary = page.locator('.today-check-more > summary');
    await expect(summary).toBeVisible();
    await expect
      .poll(() => styles(summary, ['color', 'border-top-width', 'background-color']))
      .toEqual({ color: 'rgb(26, 28, 32)', 'border-top-width': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
    expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('다음 외출 블록: 카드 없이 블록, 복귀 마감은 왼쪽 띠 없는 회색 안내 상자(모서리 10 · 안쪽 14)', async ({ page }) => {
    await startTrip(page);
    const block = page.locator('main.today-page > .today-outing-block');
    await expect(block).toBeVisible();
    test.skip((await block.locator('.today-focus').count()) === 0, '오늘 남은 외출이 없는 시각이다');
    expect(await styles(block.locator('.today-focus'), ['border-top-width', 'box-shadow'])).toEqual({
      'border-top-width': '0px',
      'box-shadow': 'none',
    });
    expect(
      await styles(block.locator('.today-deadline'), ['border-left-width', 'border-top-left-radius', 'background-color', 'padding-top']),
    ).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '10px',
      'background-color': 'rgb(243, 244, 245)',
      'padding-top': '14px',
    });
    await expect(block.locator('.today-deadline-main svg')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js
```

Expected: 새 세 건이 FAIL이고(시각에 따라 셋째 건은 skip) Task 1의 여섯 건은 PASS여야 한다.
- 첫 건: 카드 테두리가 2px이고 면이 대기 색이다.
- 둘째 건: 펼침 글자가 코발트이고 테두리가 1px이다.
- 셋째 건: 카드 테두리가 1px이고 복귀 마감 띠가 4px이다.

- [ ] **Step 3: 외출 끝·외출 없음 구역 (`app/today/page.js`)**

다음 외출 블록 안의 두 구역 `className="today-callout"`(제목 `today.nextDoneTitle` 구역과 `today.noOutingTitle` 구역)을 `className="today-outing-empty"`로 바꾼다. `aria-labelledby`와 내용은 그대로 둔다.

- [ ] **Step 4: 매일 확인·다음 외출 모양 (`app/styles/today.css`)**

4-a. `.today-check { … }` 규칙(과 그 위 주석)을 아래로 바꾼다. `.today-check h2`, `.today-check-flag`부터 `.today-check-companion`까지는 그대로 둔다.

```css
/* 매일 확인 (설계서 6.2 7번 매일 확인 블록): 흰 블록이 카드를 대신한다.
   '확인 필요'는 대기 색 글자 + 시계 아이콘, 아래 상태 배너(STANDBY + 사유)가 함께 알린다 */
.today-check {
  color: var(--ink);
}
```

4-b. `.today-check-list { … }` 규칙을 아래로 바꾼다.

```css
.today-check-list {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-4) 0 var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
```

4-c. `.today-check-more > summary { … }` 규칙(과 그 위 주석)을 아래로 바꾼다. `::-webkit-details-marker`, `::after`, `[open]`, `:focus-visible` 규칙은 그대로 둔다.

```css
/* 제한 항목 펼치기: 확인 카드가 조건 감사표가 되지 않게 접어 둔다. 먹색 펼침 행(44px), 문구 + 화살표 */
.today-check-more > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  cursor: pointer;
  list-style: none;
}
```

4-d. `.today-focus { … }` 규칙(과 그 위 주석 `/* 다음 외출과 복귀 마감 */`)을 아래로 바꾼다. `.today-focus h2`는 그대로 둔다.

```css
/* 다음 외출과 복귀 마감 (설계서 6.2 7번 다음 외출 블록): 흰 블록 자체가 구역이라 카드를 두지 않는다 */
.today-focus {
  min-width: 0;
}
```

4-e. `.today-deadline { … }` 규칙을 아래로 바꾼다.

```css
/* 복귀 마감 (SEED Callout, 설계서 5.6): 왼쪽 띠 없이 회색 면, 모서리 10, 안쪽 14/16. 깃발 아이콘과 큰 시각이 뜻을 전한다 */
.today-deadline {
  margin: var(--space-4) 0;
  padding: 14px var(--space-4);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
```

4-f. `.today-next-stop > * + * { … }` 규칙 바로 아래에 더한다.

```css
/* 외출 끝·외출 없음: 상자 없이 블록 안 제목과 문장 */
.today-outing-empty h2 {
  font-size: var(--text-title-3);
}
.today-outing-empty p {
  margin-top: var(--space-2);
  font-size: var(--text-body);
}
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js e2e/core-flow.spec.js e2e/accessibility.spec.js e2e/offline.spec.js
```

Expected: PASS(`screen-today` 9건, 시각에 따라 1건 skip). 매일 확인 키보드 테스트(`accessibility.spec.js`)가 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add app/today/page.js app/styles/today.css e2e/screen-today.spec.js
git commit -m "$(cat <<'MSG'
style(today): 매일 확인과 다음 외출을 흰 블록 안 SEED 모양으로

- 매일 확인: 대기 색 카드를 흰 블록으로, '확인 필요'는 대기 색 글자 + 아이콘 그대로, 요약은 회색 면 모서리 10.
- 제한 항목 펼치기를 코발트 테두리 버튼에서 먹색 펼침 행으로.
- 다음 외출: 카드(테두리·그림자) 제거, 복귀 마감은 왼쪽 띠 없는 회색 안내 상자.
- 외출 끝·외출 없음은 상자 없는 제목과 문장.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 상태 블록 안쪽(변경됨·입력 필요), 안내 구역 블록, 진행 현황

**Files:**
- Modify: `e2e/helpers.js`(데모 사건 도우미 두 개 추가)
- Modify: `e2e/screen-day.spec.js`(지역 도우미 `openDemoToday`·`fire`를 helpers 것으로 바꾼다. 단언은 그대로)
- Modify: `e2e/screen-today.spec.js`(파일 끝에 묶음 하나)
- Modify: `app/today/page.js`(변경됨 버튼, 입력 필요 구역, 병원 안내 미확인 구역 위치, 보호자·동반 구역 클래스, '나중에' 버튼)
- Modify: `app/styles/today.css`(`.today-callout` 무리 → `.today-section` 무리)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`, 블록 구조(`today-status-block`).
  - `linkDemoPlan`, `acknowledgeGuide`, `readRecord`(`e2e/helpers.js`).
- Produces:
  - `openDemoToday(page) → Promise<Locator>`(데모 사건 패널 region).
  - `fireDemoEvent(panel, name) → Promise<void>`.
  - 이 둘은 `e2e/helpers.js`에서 내보낸다.

- [ ] **Step 1: 데모 사건 도우미를 helpers 로 옮긴다 (`e2e/helpers.js`)**

`e2e/screen-day.spec.js` 안의 지역 도우미 `openDemoToday`와 `fire`(안전 표시 회귀 가드 묶음 위)를 `e2e/helpers.js` 끝 '병원 연동(데모)' 절로 옮기고 `export`한다. `fire`는 `fireDemoEvent`로 이름을 바꾼다. 본문은 그대로 둔다. `screen-day.spec.js`는 helpers에서 가져오도록 바꾸고, 다른 줄은 고치지 않는다. `e2e/demo-events.spec.js`의 자기 도우미는 건드리지 않는다.

- [ ] **Step 2: 실패하는 테스트를 더한다 (`e2e/screen-today.spec.js` 끝)**

가져오기 줄을 `import { buildStay, fireDemoEvent, kstDate, linkDemoPlan, openDemoToday, startTrip } from './helpers.js';`로 바꾼다.

```js
test.describe('③층 오늘, 상태 블록과 안내 구역', () => {
  test('확인하지 않은 병원 안내: 자기 흰 블록, 회색 버튼이 흰 면 위에 보인다', async ({ page }) => {
    await startTrip(page);
    await linkDemoPlan(page, 'A');
    await page.goto('/today');
    const section = page.getByRole('region', { name: '확인하지 않은 병원 안내가 있어요' });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section).toHaveClass(/ui-block/);
    await expect(section).toHaveClass(/today-section/);
    expect((await styles(section, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    const button = section.getByRole('link', { name: '병원 안내 확인하기' });
    await expect.poll(async () => (await styles(button, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });

  test('입력이 필요한 오늘: 고칠 곳은 하루 일정과 같은 점선 상자(모서리 10 · 안쪽 14), 상태 블록 안', async ({ page }) => {
    await startTrip(page, { consent: false });
    const fix = page.locator('main.today-page > .today-status-block .trip-fix');
    await expect(fix).toBeVisible();
    expect(await styles(fix, ['border-top-style', 'border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-style': 'dashed',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    await expect(fix.getByRole('heading', { name: '오늘 일정을 만들려면 입력이 필요해요' })).toBeVisible();
    await expect(fix.getByRole('link').or(fix.getByRole('button'))).toHaveCount(1);
  });

  test('데모 사건 뒤 오늘: 변경됨은 하루 일정과 같은 누르는 안내 상자, 즉시 복귀 배너는 2px 먹색', async ({ page }) => {
    const panel = await openDemoToday(page);
    await fireDemoEvent(panel, /환자 호출/);
    const returnSheet = page.getByRole('dialog', { name: '지금 돌아가세요' });
    await expect(returnSheet).toBeVisible();
    await returnSheet.getByRole('button', { name: '확인했어요' }).click();
    await expect(returnSheet).toHaveCount(0);

    await page.goto('/today');
    const status = page.locator('main.today-page > .today-status-block');
    const changed = status.locator('button.trip-changed');
    await expect(changed).toHaveCount(1);
    await expect(changed).not.toHaveClass(/btn/);
    await expect(changed.locator('.trip-changed-text')).toHaveCount(1);
    await expect(changed.locator('svg')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect
      .poll(() => styles(changed, ['background-color', 'border-top-left-radius', 'justify-content']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-left-radius': '10px', 'justify-content': 'flex-start' });
    const banner = status.locator('.trip-return-banner');
    await expect
      .poll(() => styles(banner, ['border-top-style', 'border-top-width', 'border-top-color']))
      .toEqual({ 'border-top-style': 'solid', 'border-top-width': '2px', 'border-top-color': 'rgb(26, 28, 32)' });
  });
});
```

사건 이름과 시트 이름, 확인 버튼 이름은 Step 1에서 옮긴 하루 일정 회귀 가드 테스트가 쓰는 값과 같다. /today 로 돌아왔을 때 즉시 복귀 시트가 다시 열리면(앱 셸의 TripRuntime 이 연다) '확인했어요'로 닫고 이어 간다.

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js e2e/screen-day.spec.js
```

Expected: 새 세 건이 FAIL이고 앞의 건과 `screen-day`는 PASS여야 한다.
- 첫 건: 병원 안내가 상태 블록 안의 테두리 상자다.
- 둘째 건: `.trip-fix`가 없다.
- 셋째 건: 변경됨에 `btn` 클래스가 있다.

- [ ] **Step 4: 상태 블록 안쪽과 안내 구역 (`app/today/page.js`)**

4-a. 변경됨 버튼을 하루 일정과 같은 마크업으로 바꾼다.

```jsx
          {/* 변경됨 알림 (SEED Callout · actionable, 설계서 5.6): 누르면 전후 비교 시트 */}
          {delta?.unseen && (
            <button type="button" className="trip-changed" onClick={() => setSheet('delta')}>
              <span className="trip-changed-dot" aria-hidden="true" />
              <span className="trip-changed-text">{t('trip.changedCta')}</span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}
```

4-b. 입력 필요 구역의 `className="today-callout"`을 `className="trip-fix"`로 바꾼다. 상태 블록 안에 그대로 두고, 제목·버튼은 그대로 둔다.

4-c. 병원 안내 미확인 구역(`aria-labelledby="today-hospital-h"`)을 상태 블록 밖으로 옮긴다. 자리는 상태 블록 바로 다음, 다음 외출 블록 앞이다. `className`은 `"ui-block today-section"`이다. 안의 제목(병원 아이콘)·문장·버튼은 그대로 둔다.

4-d. 보호자 링크 다시 보내기·동반 보호자 다시 만들기 구역의 `className="ui-block today-callout"`을 `"ui-block today-section"`으로, 동반 구역 안 `className="today-callout-actions"`를 `"today-section-actions"`로 바꾼다. '나중에' 버튼의 `variant="quiet"`를 `variant="secondary"`로 바꾼다. 문구·동작·막힘 조건은 그대로 둔다.

- [ ] **Step 5: 안내 구역 모양 (`app/styles/today.css`)**

`/* 안내 묶음 — … */` 주석과 `.today-callout`, `.today-callout h2`, `.today-callout p`, `.today-callout-actions`, `.today-callout-actions > .btn` 다섯 규칙을 아래로 바꾼다. 그 아래 `.today-appointment`부터는 그대로 둔다. `.today-links` 규칙은 시안 보드 견본이 아직 쓰므로 지우지 않는다.

```css
/* 안내 구역 (설계서 5.5 흰 블록): 병원 안내 미확인·보호자 링크 다시 보내기·동반 보호자 다시 만들기.
   테두리 상자 없이 흰 블록 하나가 구역이다. 회색 버튼이 흰 면 위에서 버튼으로 보인다 */
.today-section h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-title-3);
  margin-bottom: var(--space-2);
}
.today-section p {
  font-size: var(--text-body);
  margin-bottom: var(--space-3);
}
.today-section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.today-section-actions > .btn {
  flex: 1 1 140px;
}
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-today.spec.js e2e/screen-day.spec.js e2e/demo-events.spec.js e2e/hospital-link.spec.js e2e/accessibility.spec.js e2e/design-board.spec.js
```

Expected: PASS(`screen-today` 12건, 시각에 따라 1건 skip).

- [ ] **Step 7: 진행 현황 한 줄**

`docs/tracking/status.md`의 `- SEED 적용 ③층 6/15 하루 일정 화면: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 7/15 오늘 화면: 회색 바탕 위 흰 블록(동기화 / 매일 확인 / 날짜·상태 / 병원 안내 / 다음 외출 / 바로가기 / 보호자·동반 안내), 매일 확인은 카드 대신 흰 블록(확인 필요 표시 유지), 복귀 마감은 띠 없는 안내 상자, 바로가기는 목록 행, 변경됨·입력 필요는 하루 일정과 같은 모양, 갱신 실패 알림을 세 화면 공용 부품으로. 계획서 `docs/superpowers/plans/2026-10-09-seed-layer3-07-today.md`
```

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 137건이다(시간대에 따라 1~2건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 9: 커밋**

```bash
git add e2e/helpers.js e2e/screen-day.spec.js e2e/screen-today.spec.js app/today/page.js app/styles/today.css docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(today): 변경됨·입력 필요를 하루 일정과 같게, 안내 구역을 흰 블록으로

- 변경됨 알림을 하루 일정과 같은 누르는 안내 상자 마크업으로(섞인 .btn 모양 제거).
- 입력 필요는 하루 일정과 같은 고칠 곳 점선 상자.
- 병원 안내 미확인·보호자 링크·동반 보호자 안내는 테두리 상자 대신 각자 흰 블록, '나중에'는 회색 버튼.
- 데모 사건 e2e 도우미를 helpers 로 옮겨 하루 일정·오늘 테스트가 함께 쓴다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 4: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 3 뒤 커밋(작업 후)을 각각 빌드한다. 끝나면 브랜치로 돌아온다.
  - 도구: `.superpowers/sdd/_tools/today-shots.mjs`
  - 찍기 전에 e2e 캐시 시각을 새로 고친다(수명 15분).
  - 장면: 360px·320px × 네 언어의 확인 마친 오늘. 360 ko와 320 en은 매일 확인 전도 찍는다. 360 ko는 갱신 실패도 찍는다.
  - 각 장면을 전체·맨 위·맨 아래로 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 8번(장소)을 시작하지 않는다.
