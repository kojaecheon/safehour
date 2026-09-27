# SEED ②층 — 부품 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공용 부품(`components/ui/*`, `app/globals.css`·`app/styles/ui.css`의 부품 규칙)을 SEED 모양으로 바꾸고, ③층 화면이 가져다 쓸 새 부품(목록 행·흰 블록·스위치·확인 대화상자)을 만들어 시안 보드에서 상태별로 확인할 수 있게 한다.

**Architecture:** 먼저 옛 모서리 토큰을 값 그대로 새 토큰으로 옮기고 지운 뒤(Task 1), 부품 무리마다 한 태스크로 CSS·JS를 바꾼다(Task 2–7). 각 부품 태스크는 시안 보드(`/design-board`)에 견본을 두고, 새 화면 테스트 `e2e/design-board-components.spec.js`가 그 견본의 **계산된 스타일**(높이·모서리·글자·색·눌림 색)을 먼저 실패하게 쓴 다음 CSS를 고친다. 부품 이름과 props는 유지하고 모양만 바꾼다. 화면 배치(회색 바탕 켜기, 목록 행으로 바꾸기, 스위치로 바꾸기 등)는 ③층이다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · `node --test` · Playwright(e2e, 360px, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md` — 4.6(눌림·초점·움직임), 4.7(안전 하한), **5장(부품 설계)**, 7장(관문). ①층 계획 `docs/superpowers/plans/2026-09-24-seed-layer1-tokens.md` 끝의 '②층으로 넘기는 것' 10가지를 이 계획이 모두 담는다(표는 아래 '넘겨받은 것').

## Global Constraints

- 새 패키지 설치 금지. `package.json`·`package-lock.json`을 수정하지 않는다. `npx`로 새 도구를 내려받지 않는다.
- 토큰 정본은 `app/globals.css` `:root` 한 곳. 부품·기능 스타일(`app/styles/*.css`)에 hex 색·새 글자 크기를 쓰지 않는다(카카오 브랜드색처럼 이미 있던 것은 둔다).
- 문구는 `src/i18n/messages/`에만, 4개 언어(ko·en·ja·zh) 모두. 새 키는 반드시 코드에서 쓴다(쓰이지 않는 키는 `npm test`가 막는다).
- 대비: 글자 4.5:1 이상, UI 경계·아이콘 3:1 이상(WCAG 2.1 AA). 본문 16px 이상, 터치 44px 이상. 상태는 색 + 문구 + 아이콘(색 단독 금지).
- 코발트(`--accent`)는 화면당 주 버튼 하나·링크·타임라인 선·'오늘' 표시에만. '선택됨'은 `--selected`(#2a3038) 진한 회색 채움.
- 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만, 눌림과 같은 색. 축소는 `prefers-reduced-motion: no-preference` 안에서만.
- 판정·저장·API·일정 규칙 코드는 건드리지 않는다. 화면 배치(`app/**/page.js`, `components/<기능>/*`)도 이 층에서는 건드리지 않는다 — 예외는 계획에 적힌 파일뿐이다.
- 화면 테스트는 **역할·이름**으로 찾는 기존 단언을 고치지 않는다. 모양이 바뀌어 깨지면 역할·이름이 유지됐는지 먼저 보고 보고한다.
- 문서(`docs/platform/DESIGN_SYSTEM.md`·설계서·상태 문서)는 **Task 8에서 한 번에** 고친다. Task 1–7은 문서를 건드리지 않는다.
- 커밋은 로컬에만. push·병합·배포 금지. 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 관문: `npm run lint` · `npm test` · `npm run build` · `npm run e2e` 모두 exit 0. e2e는 빌드 결과를 띄우므로 **build 뒤에** 돌린다. 지금 e2e 62건 — Task 2–7이 한 건씩 더해 68건이 된다. 시안 보드 테스트만 돌릴 때: `npm run build && npm run e2e -- e2e/design-board.spec.js e2e/design-board-components.spec.js`.
- `e2e/demo-events.spec.js`의 한 건은 오늘 남은 정거장이 없는 시각이면 일부러 건너뛴다(`test.skip`). 실패가 아니다.

## 넘겨받은 것 (①층 계획 끝 '②층으로 넘기는 것')

| # | 내용 | 태스크 |
| --- | --- | --- |
| 1 | 하드코딩 3px 초점 링 12곳 → `--focus-width`, `.radio-option`·`.toggle-row`는 box-shadow 대신 outline | Task 3 |
| 2 | 채운 면(고른 날짜 칩 등) 위 초점 링은 `--ink` | Task 2(버튼·긴급) · Task 3(날짜 칩) |
| 3 | 시트 뒤 가림막 → `--overlay` | Task 6 |
| 4 | 옛 모서리 토큰 5개 옮기고 지우기, 토큰 테스트 뒤집기 | Task 1 |
| 5 | 큰 버튼 글자 18/24 토큰 | Task 1(토큰) · Task 2(사용) |
| 6 | h2·한국어 카드의 `letter-spacing: -0.01em` 없애기 | Task 1 |
| 7 | `#868b94` 조합을 쓰기 전에 `CONTRAST_GROUPS`에 더하기 | Task 1 |
| 8 | 시안 보드 `parseColor`가 투명도를 버림 | Task 1 |
| 9 | 화면 테스트 `pass ≥ 30` → 정확한 수 | Task 1 |
| 10 | `--selected`와 `--ink`가 가까움 — 고른 칩이 '즉시 복귀' 버튼처럼 보이지 않는지 | Task 9(운영자 확인에서 짚는다) |

## 이 계획이 정한 것 (설계서와 다르게 가는 곳 — Task 8이 설계서에 적는다)

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 답 칩(`AnswerInput`)·선택 상자 테두리 | 5.3 `--line-strong` | **`--line-input`** | 선택지 경계는 정보를 전하는 경계라 3:1 이상(설계서 4.7 '입력 테두리', DESIGN_SYSTEM 2.1). `--line-strong`은 흰 바탕 1.35:1 |
| 스위치 끔 트랙 | 5.3 `#b0b3ba` | **`--ink-subtle`**(#868b94) | `#b0b3ba`는 흰 바탕 2.1:1 — 컴포넌트 경계 3:1 미달(1.4.11). 새 hex도 만들지 않는다 |
| 눌림 축소 | 4.6 `scale=(basis−2)/basis` 요소마다 | **두 단계 토큰** `--press-scale-wide` 0.976 · `--press-scale-tight` 0.955 | CSS `calc()`가 길이끼리 나누지 못한다. 넓은 큰 버튼(basis≈82)과 44px 칸(basis 44) 두 값으로 근사 |
| 글자 입력칸 초점 | 4.6 코발트 윤곽선 | **2px `--line-contrast` 테두리**, 윤곽선 없음 | 설계서 5.2의 입력칸 규칙. 진한 테두리(17:1)가 초점 표시다 — 두 표시를 겹치지 않는다 |
| Segmented 미끄러짐 | 5.3 200ms 미끄러짐 | **색 전환 200ms** | 미끄러지는 표시는 칸 위치를 재는 JS가 필요하다. 이 층은 모양만 |
| 상태 배너 테두리 | 5.6 Callout(테두리 없음) | **1px 상태 선 유지** | ③층 회색 바탕(#f3f4f5) 위에서 NO_TOURISM 면(#eef1f6)이 거의 사라진다 |
| 장소 카드 그림 | 5.5 Image Frame 모서리 8 | **그림은 카드 가장자리에 붙인 채**(바깥 모서리 16을 따른다) | 그림을 안쪽으로 들이면 카드 구조가 바뀐다 — ③층 화면 확인에서 다시 본다 |
| 시트 손잡이 | 5.6 즉시 복귀 시트는 '손잡이 없이 닫기 버튼만' | **닫을 수 있는 시트에만 손잡이**. 즉시 복귀 시트는 지금처럼 닫기 버튼도 없이 확인 버튼만 | 즉시 복귀는 확인을 꼭 받아야 하는 안전 지시(`showClose=false`) — 닫기 버튼을 새로 붙이지 않는다 |
| 입력 오류 아이콘 | 5.2 오류 글자 + 아이콘 | **이 층은 글자색만**(`.hint.is-error`) | 오류 문구를 그리는 곳은 화면(③층)이다. 아이콘은 그때 붙인다 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/globals.css` | 토큰(`:root`)과 전역 부품 규칙(버튼·입력·선택·배지·상태 배너·시트·상단 바·탭) | Task 1–7 |
| `app/styles/ui.css` | `ui-` 부품 규칙(내비·긴급·배지 5종·출처·날짜 칩·답 칩·장소 카드·시트 머리·빈 상태) | Task 1–7 |
| `app/styles/*.css` (기능) | 기능 화면 배치 | Task 1(모서리 이름만), Task 3(초점 링 두께만) |
| `components/ui/Button.js` | 버튼 | Task 2 — `critical`·`loading` |
| `components/ui/EmergencyButton.js` | 긴급 버튼 | Task 2 — 원판 없이 아이콘 22px |
| `components/StateBanner.js` | 상태 배너 | Task 4 — 아이콘 20px |
| `components/ui/ListItem.js` | **새** 목록 행·목록 묶음·목록 머리 | Task 5 |
| `components/ui/AlertDialog.js` | **새** 확인 대화상자 | Task 6 |
| `components/ui/Sheet.js` | 시트 | Task 6 — 손잡이 조건, 닫기 아이콘 16 |
| `components/ui/BottomNav.js` · `Icon.js` | 하단 내비·아이콘 | Task 7 — 채운 아이콘 5개 |
| `components/ui/index.js` | 부품 모음 | Task 5·6 — 새 부품 내보내기 |
| `app/design-board/DesignBoard.js` · `demoData.js` · `designBoard.css` | 시안 보드 | Task 1–7 — 견본·대비 짝 |
| `src/i18n/messages/designBoard.js` | 시안 보드 문구 | Task 1–7 |
| `test/design-tokens.test.js` | 토큰 계약 | Task 1 |
| `e2e/design-board.spec.js` | 시안 보드 화면 테스트 | Task 1 — 대비 판정 수 |
| `e2e/design-board-components.spec.js` | **새** 부품 모양 화면 테스트 | Task 2(만듦)–7 |
| `docs/platform/DESIGN_SYSTEM.md` · 설계서 · `docs/tracking/status.md` | 문서 | Task 8 |

---

### Task 1: 옛 모서리 토큰 옮기기·지우기, 부품용 토큰, 시안 보드 대비 정비

**Files:**
- Modify: `test/design-tokens.test.js` (import 줄, 186–204행 모서리 테스트, 끝에 새 describe)
- Modify: `app/globals.css` (`:root` 모서리·글자·움직임 토큰, h2 자간)
- Modify: `app/styles/ui.css` (`.ui-kcard-korean` 자간)
- Modify (이름만 바꿈): `app/globals.css`, `app/styles/*.css`, `components/pwa/NotificationBanner.js` 등 `var(--radius…)`를 쓰는 모든 파일
- Modify: `app/design-board/demoData.js` (모서리 주석, 새 대비 묶음)
- Modify: `app/design-board/DesignBoard.js` (`parseColor`, `Swatch` 판정)
- Modify: `src/i18n/messages/designBoard.js` (키 2개)
- Modify: `e2e/design-board.spec.js` (판정 수)

**Interfaces:**
- Consumes: ①층 토큰
- Produces: 새 토큰 `--text-button-large`(18px) · `--text-title-sheet`(22px) · `--lh-title-sheet`(30px) · `--press-scale-wide`(0.976) · `--press-scale-tight`(0.955). 옛 `--radius-xs`·`--radius-sm`·`--radius`·`--radius-lg`·`--radius-pill`은 **없어진다** — 이후 태스크는 `--radius-6|8|10|12|16|20|24|full`만 쓴다. `CONTRAST_GROUPS`에 `designBoard.groupParts` 묶음(9짝).

- [ ] **Step 1: 실패하는 토큰 테스트를 쓴다 (`test/design-tokens.test.js`)**

1-a. import 줄

```js
import { readFile } from 'node:fs/promises';
```
→
```js
import { readdir, readFile } from 'node:fs/promises';
```

1-b. 모서리 테스트(186–204행 부근, `test('모서리 — SEED 단계 토큰을 더했고 기존 토큰은 ②층까지 남아 있다'`) 전체를

```js
  test('모서리 — SEED 단계 토큰만 있고 옛 토큰은 지웠다', () => {
    const seed = {
      '--radius-6': '6px',
      '--radius-8': '8px',
      '--radius-10': '10px',
      '--radius-12': '12px',
      '--radius-16': '16px',
      '--radius-20': '20px',
      '--radius-24': '24px',
      '--radius-full': '9999px',
    };
    for (const [name, v] of Object.entries(seed)) assert.equal(value(name), v, name);
    for (const old of ['--radius-xs', '--radius-sm', '--radius', '--radius-lg', '--radius-pill']) {
      assert.ok(!TOKENS.has(old), `${old} 가 :root 에 남아 있다`);
    }
  });
```

1-c. 파일 끝에 새 describe를 더한다

```js
/** app/·components/ 아래에서 pattern 에 맞는 파일 URL 목록 */
async function listFiles(dirs, pattern) {
  const root = new URL('../', import.meta.url);
  const out = [];
  for (const dir of dirs) {
    const entries = await readdir(new URL(`${dir}/`, root), { recursive: true });
    for (const rel of entries) if (pattern.test(rel)) out.push(new URL(`${dir}/${rel}`, root));
  }
  return out;
}

describe('②층 준비 — 옛 모서리 토큰 정리와 부품용 토큰', () => {
  test('앱 코드가 옛 모서리 토큰을 부르지 않는다', async () => {
    const offenders = [];
    for (const file of await listFiles(['app', 'components'], /\.(css|js)$/)) {
      const text = await readFile(file, 'utf8');
      if (/var\(--radius(-xs|-sm|-lg|-pill)?\)/.test(text)) offenders.push(file.pathname);
    }
    assert.deepEqual(offenders, []);
  });

  test('부품용 새 토큰', () => {
    assert.equal(value('--text-button-large'), '18px');
    assert.equal(value('--text-title-sheet'), '22px');
    assert.equal(value('--lh-title-sheet'), '30px');
    assert.equal(value('--press-scale-wide'), '0.976');
    assert.equal(value('--press-scale-tight'), '0.955');
  });

  test('제목에 자간을 따로 주지 않는다 (SEED 에는 자간이 없다)', async () => {
    const ui = await readFile(new URL('../app/styles/ui.css', import.meta.url), 'utf8');
    for (const [name, text] of [['globals.css', css], ['ui.css', ui]]) {
      assert.doesNotMatch(text, /letter-spacing:\s*-0\.01em/, `${name} 에 -0.01em 자간이 남아 있다`);
    }
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `node --test test/design-tokens.test.js`
Expected: FAIL — `--radius-xs 가 :root 에 남아 있다`, 옛 토큰을 부르는 파일 목록, `undefined !== '18px'`, `-0.01em 자간이 남아 있다`.

- [ ] **Step 3: 옛 모서리 토큰을 값 그대로 새 이름으로 옮긴다**

값이 같은 새 토큰으로만 바꾼다(8→`-8`, 12→`-12`, 16→`-16`, 24→`-24`, 999→`-full`). 화면 모양은 달라지지 않는다. 부품마다 SEED 단계로 바꾸는 일은 Task 2–7이 한다.

```bash
grep -rlE 'var\(--radius(-xs|-sm|-lg|-pill)?\)' app components | xargs sed -i '' -E \
  -e 's/var\(--radius-xs\)/var(--radius-8)/g' \
  -e 's/var\(--radius-sm\)/var(--radius-12)/g' \
  -e 's/var\(--radius-lg\)/var(--radius-24)/g' \
  -e 's/var\(--radius-pill\)/var(--radius-full)/g' \
  -e 's/var\(--radius\)/var(--radius-16)/g'
grep -rnE 'var\(--radius(-xs|-sm|-lg|-pill)?\)' app components || echo "남은 곳 없음"
```

Expected: `남은 곳 없음`.

- [ ] **Step 4: `:root`를 고친다 (`app/globals.css`)**

4-a. 모서리 — 옛 다섯 줄과 안내 주석을 지운다

```css
  /* ── 모서리 ── */
  --radius-xs: 8px;     /* 배지 */
  --radius-sm: 12px;    /* 입력·칩·작은 버튼 */
  --radius: 16px;       /* 카드·배너 */
  --radius-lg: 24px;    /* 사진 카드·시트 */
  --radius-pill: 999px; /* 알약 버튼·긴급 버튼 */
  /* SEED 모서리 단계 — ②층에서 부품마다 이 토큰으로 옮기고, 다 옮기면 위의 다섯 개를 지운다 */
```
→
```css
  /* ── 모서리 (SEED 단계) — 안쪽 모서리 = 바깥 모서리 − 바깥 안쪽 여백 ── */
```

4-b. 글자 — `--text-button` 줄 바로 아래에 한 줄

```css
  --text-button-large: 18px; /* 큰 CTA(52px 버튼)·긴급 버튼 — 줄 높이는 --lh-title-3(24px) */
```

4-c. 줄 높이 — `--lh-caption: 19px;` 줄 바로 아래에 두 줄

```css
  --text-title-sheet: 22px;  /* 시트 제목 (SEED t8) */
  --lh-title-sheet: 30px;
```

4-d. 움직임 — `--focus-width` 줄 바로 아래에

```css
  /* 눌림 축소 — 2px 만큼 줄어든다: (basis − 2) / basis. CSS 가 길이끼리 나누지 못해 두 단계로 둔다(설계서 4.6) */
  --press-scale-wide: 0.976;  /* 폭이 넓은 큰 버튼·목록 행 (basis ≈ 82px) */
  --press-scale-tight: 0.955; /* 44px 칩·작은 버튼·내비 칸 (basis 44px) */
```

4-e. h2 자간 — `h2 { … }` 규칙에서 `  letter-spacing: -0.01em;` 한 줄을 지운다.

- [ ] **Step 5: 한국어 카드 자간을 지운다 (`app/styles/ui.css`)**

`.ui-kcard-korean { … }` 규칙에서 `  letter-spacing: -0.01em;` 한 줄을 지운다.

- [ ] **Step 6: 시안 보드 — 투명한 색은 '잴 수 없음'으로, 새 대비 묶음**

6-a. `app/design-board/DesignBoard.js`의 `parseColor` 안

```js
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
```
→
```js
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/);
  if (m) {
    // 반투명 색은 뒤 바탕에 따라 대비가 달라 짝으로 잴 수 없다 — 잴 수 없다고 돌려준다(대비 짝에는 불투명 색만 쓴다)
    const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    if (alpha < 1) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return null;
```

6-b. 같은 파일 `Swatch`의 판정 문단 — 값을 읽었는데도 잴 수 없으면 미달로 본다

```jsx
          data-verdict={ratio === null ? 'measuring' : passed ? 'pass' : 'fail'}
        >
          {ratio === null ? (
            t('designBoard.measuring')
```
→
```jsx
          data-verdict={ratio === null ? (values ? 'fail' : 'measuring') : passed ? 'pass' : 'fail'}
        >
          {ratio === null ? (
            t(values ? 'designBoard.unmeasurable' : 'designBoard.measuring')
```

6-c. `app/design-board/demoData.js` — 모서리 주석

```js
/** SEED 모서리 단계 — 기존 다섯 개(--radius-xs … --radius-pill)는 ②층에서 옮긴 뒤 지운다 */
```
→
```js
/** SEED 모서리 단계 */
```

6-d. 같은 파일 `CONTRAST_GROUPS`의 `designBoard.groupLayer` 묶음 바로 뒤에

```js
  {
    // ②층 부품이 쓰는 조합 — 눌린 면·고른 칩·비활성 글자·스위치·긴급 글자
    key: 'designBoard.groupParts',
    pairs: [
      { fg: '--ink', bg: '--pressed' },
      { fg: '--ink', bg: '--pressed-weak' },
      { fg: '--ink-soft', bg: '--pressed' },
      { fg: '--line-input', bg: '--pressed', ui: true },
      { fg: '--line-contrast', bg: '--surface-alt', ui: true },
      // 비활성 버튼 글자 — WCAG 는 비활성을 대비 기준에서 빼지만, 무엇이 적혔는지는 읽혀야 해서 3:1 을 지킨다(설계서 5.1)
      { fg: '--ink-subtle', bg: '--surface-alt', ui: true },
      { fg: '--selected', bg: '--bg', ui: true },
      // 스위치 — 끔 트랙 위 흰 알맹이
      { fg: '--on-dark', bg: '--ink-subtle', ui: true },
      { fg: '--emergency', bg: '--bg' },
    ],
  },
```

6-e. `src/i18n/messages/designBoard.js` — `'designBoard.groupLayer'` 줄 바로 아래에

```js
  'designBoard.groupParts': { ko: '부품 조합 (눌림·선택·비활성)', en: 'Component pairs (pressed, selected, disabled)', ja: '部品の組み合わせ（押下・選択・無効）', zh: '组件组合（按下、选中、停用）' },
  'designBoard.unmeasurable': { ko: '잴 수 없음 — 반투명 색', en: 'Cannot measure — translucent color', ja: '測定できません — 半透明の色', zh: '无法测量 — 半透明颜色' },
```

- [ ] **Step 7: 화면 테스트의 판정 수를 정확히 (`e2e/design-board.spec.js`)**

7-a. import 줄 아래에

```js
import { CONTRAST_GROUPS } from '../app/design-board/demoData.js';
```

7-b. 단언 한 줄

```js
    expect(await page.locator('[data-verdict="pass"]').count()).toBeGreaterThanOrEqual(30);
```
→
```js
    // 잴 짝(장식 제외) 수와 통과 수가 같아야 한다 — 짝이 늘거나 줄면 이 수도 따라간다
    const measured = CONTRAST_GROUPS.flatMap((group) => group.pairs).filter((pair) => pair.fg && !pair.decorative).length;
    await expect(page.locator('[data-verdict="pass"]')).toHaveCount(measured);
```

- [ ] **Step 8: 통과하는지 본다**

Run: `node --test test/design-tokens.test.js`
Expected: PASS — 새 대비 짝 9개(가장 낮은 것 `--line-input`/`--pressed` 3.22 · `--ink-subtle`/`--surface-alt` 3.11)도 통과.

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 62건(시간대에 따라 1건 skip). 화면 모양은 바뀌지 않아야 한다(모서리 값이 같다).

- [ ] **Step 10: 커밋**

```bash
git add -A app components test e2e src
git commit -m "$(cat <<'MSG'
style(design): 옛 모서리 토큰을 값 그대로 옮기고 지운다, ②층 부품용 토큰

- --radius-xs·sm·(기본)·lg·pill 을 같은 값의 SEED 단계(8·12·16·24·full)로 옮기고 :root 에서 지웠다.
  화면 모양은 바뀌지 않는다 — 부품마다 SEED 단계로 바꾸는 일은 다음 커밋들이 한다.
- 큰 CTA 글자(18px)·시트 제목(22/30)·눌림 축소 두 단계 토큰을 더했다.
- h2·한국어 카드의 -0.01em 자간을 없앴다(SEED 에는 자간이 없다).
- 시안 보드: 반투명 색은 '잴 수 없음'(미달)으로 보이고, 부품 조합 대비 9짝을 더했다.
  화면 테스트는 통과 판정 수를 대비 짝 수와 정확히 맞춘다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 버튼 (SEED Action Button) · 긴급 버튼 · 부품 화면 테스트 틀

**Files:**
- Create: `e2e/design-board-components.spec.js`
- Modify: `app/globals.css` (`/* ── 버튼 ──` 부터 `.btn-kakao`·`.btn-google` 규칙 끝까지, 초점 규칙은 그대로; `.app-shell[data-emergency-bar='on']`의 바 높이)
- Modify: `app/styles/ui.css` (`.ui-emergency`·`.ui-emergency:hover`·`.ui-emergency-dot`)
- Modify: `components/ui/Button.js`, `components/ui/EmergencyButton.js`
- Modify: `app/design-board/DesignBoard.js` (`Sub`에 `id`, 모든 `Sub`에 id, 버튼 견본 2개)
- Modify: `src/i18n/messages/designBoard.js` (키 2개)

**Interfaces:**
- Consumes: Task 1 토큰 `--text-button-large`, `--press-scale-wide`, `--press-scale-tight`, `--radius-12`, `--radius-8`
- Produces:
  - `Button` props: `variant` 에 `'critical'` 추가, 새 `loading?: boolean`(누르면 무시, `aria-busy="true"` + `aria-disabled="true"`). 클래스 `.btn-critical`.
  - 시안 보드 `Sub`의 `id` prop과 id 14개: `designBoard-c-button` · `-badge` · `-state` · `-datechip` · `-timeline` · `-place` · `-meal` · `-answer` · `-period` · `-sheet` · `-empty` · `-korean` · `-source` · `-shell`
  - `e2e/design-board-components.spec.js`의 도우미 `styles(locator, props)`·`pointerAway(page)`와 describe `'②층 부품 — 시안 보드에서 잰 모양'` — Task 3–7이 이 describe 안에 테스트를 한 건씩 더한다.

- [ ] **Step 1: 시안 보드 견본 자리를 만든다 (`app/design-board/DesignBoard.js`)**

1-a. `Sub`에 `id`

```jsx
function Sub({ title, note, children, wide = false }) {
  return (
    <div className={wide ? 'designBoard-sub is-wide' : 'designBoard-sub'}>
```
→
```jsx
function Sub({ id, title, note, children, wide = false }) {
  return (
    <div id={id} className={wide ? 'designBoard-sub is-wide' : 'designBoard-sub'}>
```

1-b. 부품 절의 `Sub` 14개에 id를 붙인다 — 제목 키와 id의 짝:

| `title={t('…')}` | `id=` |
| --- | --- |
| `designBoard.cButton` | `designBoard-c-button` |
| `designBoard.cBadge` | `designBoard-c-badge` |
| `designBoard.cState` | `designBoard-c-state` |
| `designBoard.cDateChip` | `designBoard-c-datechip` |
| `designBoard.cTimeline` | `designBoard-c-timeline` |
| `designBoard.cPlace` | `designBoard-c-place` |
| `designBoard.cMeal` | `designBoard-c-meal` |
| `designBoard.cAnswer` | `designBoard-c-answer` |
| `designBoard.cPeriod` | `designBoard-c-period` |
| `designBoard.cSheet` | `designBoard-c-sheet` |
| `designBoard.cEmpty` | `designBoard-c-empty` |
| `designBoard.cKorean` | `designBoard-c-korean` |
| `designBoard.cSource` | `designBoard-c-source` |
| `designBoard.cShell` | `designBoard-c-shell` |

예: `<Sub title={t('designBoard.cButton')}>` → `<Sub id="designBoard-c-button" title={t('designBoard.cButton')}>`

1-c. 버튼 견본 — `<Button disabled>{t('designBoard.btnDisabled')}</Button>` 줄 바로 아래에

```jsx
                <Button variant="critical">{t('designBoard.btnCritical')}</Button>
                <Button loading>{t('designBoard.btnLoading')}</Button>
```

1-d. `src/i18n/messages/designBoard.js` — `'designBoard.btnSmall'` 줄 바로 아래에

```js
  'designBoard.btnCritical': { ko: '되돌릴 수 없는 확인', en: 'Irreversible confirm', ja: '取り消せない確認', zh: '不可撤销的确认' },
  'designBoard.btnLoading': { ko: '처리 중 버튼', en: 'Busy button', ja: '処理中のボタン', zh: '处理中按钮' },
```

- [ ] **Step 2: 실패하는 부품 화면 테스트를 쓴다 (`e2e/design-board-components.spec.js`)**

```js
// ②층 부품 — 시안 보드(/design-board) 견본의 계산된 모양을 잰다 (설계서 5장)
//
// - 모양은 부품이 정한다. 화면이 아니라 시안 보드의 견본을 재므로 화면 배치가 바뀌어도 흔들리지 않는다.
// - 색은 getComputedStyle 이 돌려주는 rgb() 문자열로 비교한다. 토큰 값: --accent rgb(10, 92, 255) ·
//   --accent-strong rgb(0, 70, 209) · --surface-alt rgb(243, 244, 245) · --pressed rgb(247, 248, 249) ·
//   --pressed-weak rgb(238, 239, 241) · --ink rgb(26, 28, 32) · --ink-soft rgb(85, 93, 109) ·
//   --ink-subtle(= --line-input) rgb(134, 139, 148) · --selected rgb(42, 48, 56) · --emergency rgb(200, 16, 46)
// - 눌림 색은 150ms 전환이 있어 expect.poll 로 기다린다. 재기 전에 포인터를 치워 호버 색이 섞이지 않게 한다.

import { test, expect } from './fixtures.js';

/** 요소의 계산된 스타일 몇 가지를 { 속성: 값 } 으로 */
async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

/** 호버가 남지 않게 포인터를 화면 구석으로 */
async function pointerAway(page) {
  await page.mouse.move(0, 0);
}

test.describe('②층 부품 — 시안 보드에서 잰 모양', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-board');
    await expect(page.getByRole('heading', { name: '디자인 시안 보드', level: 1 })).toBeVisible();
  });

  test('버튼 — 크기·모서리·글자, 변형별 면, 눌림은 면 색만 (설계서 5.1)', async ({ page }) => {
    const area = page.locator('#designBoard-c-button');
    await pointerAway(page);

    const primary = area.getByRole('button', { name: '주 버튼' });
    expect(
      await styles(primary, ['min-height', 'border-top-left-radius', 'font-size', 'line-height', 'font-weight', 'background-color']),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'font-size': '18px',
      'line-height': '24px',
      'font-weight': '700',
      'background-color': 'rgb(10, 92, 255)',
    });

    const small = area.getByRole('button', { name: '작은 버튼' }).first();
    expect(await styles(small, ['min-height', 'border-top-left-radius', 'font-size', 'line-height'])).toEqual({
      'min-height': '44px',
      'border-top-left-radius': '8px',
      'font-size': '16px',
      'line-height': '22px',
    });
    expect((await small.boundingBox()).height).toBeGreaterThanOrEqual(44);

    const secondary = area.getByRole('button', { name: '보조 버튼' });
    expect(await styles(secondary, ['background-color', 'color', 'border-top-color'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(26, 28, 32)',
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });

    const quiet = area.getByRole('button', { name: '조용한 버튼' });
    expect(await styles(quiet, ['background-color', 'color', 'text-decoration-line'])).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
      color: 'rgb(26, 28, 32)',
      'text-decoration-line': 'none',
    });

    const critical = area.getByRole('button', { name: '되돌릴 수 없는 확인' });
    expect((await styles(critical, ['background-color']))['background-color']).toBe('rgb(200, 16, 46)');

    const disabled = area.getByRole('button', { name: '비활성 버튼' });
    expect(await styles(disabled, ['background-color', 'color', 'cursor'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      color: 'rgb(134, 139, 148)',
      cursor: 'not-allowed',
    });

    const busy = area.getByRole('button', { name: '처리 중 버튼' });
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');

    // 눌림 — 면 색만 바뀐다
    const bg = (locator) => styles(locator, ['background-color']).then((s) => s['background-color']);
    await primary.hover();
    await page.mouse.down();
    await expect.poll(() => bg(primary)).toBe('rgb(0, 70, 209)');
    await page.mouse.up();
    await secondary.hover();
    await page.mouse.down();
    await expect.poll(() => bg(secondary)).toBe('rgb(238, 239, 241)');
    await page.mouse.up();

    // 긴급 버튼 — 큰 CTA 모양, 그림자 없음
    await pointerAway(page);
    const emergency = page.locator('#designBoard-c-shell .ui-emergency');
    expect(await styles(emergency, ['min-height', 'border-top-left-radius', 'box-shadow', 'font-size'])).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'box-shadow': 'none',
      'font-size': '18px',
    });
  });
});
```

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: FAIL — 첫 단언 `'min-height': '52px'`는 같지만 `border-top-left-radius` `9999px` ≠ `12px`, `font-size` `16px` ≠ `18px`.

- [ ] **Step 4: 버튼 규칙을 바꾼다 (`app/globals.css`)**

`/* ── 버튼 ── 주 버튼은 포인트 색 알약, 보조는 흰 면 + 테두리, 조용한 버튼은 밑줄 글자 */` 줄부터 `.btn-google[aria-disabled='true'] { … }` 규칙 끝(`/* ── 추천 카드 (D08-CMP008) ── */` 바로 위)까지를 통째로 아래로 바꾼다. 순서가 중요하다 — 비활성·처리 중 규칙이 눌림·호버 규칙보다 **뒤**에 있어야 이긴다.

```css
/* ── 버튼 (SEED Action Button) ──
   큰 CTA 52px · 모서리 12 · 18/24 굵게. 작은 버튼 44px · 모서리 8 · 16/22 굵게(SEED 36·40px 은 터치 하한으로 올림).
   채운 강조 버튼(주·critical)은 화면당 하나. 눌림은 면 색만 바꾸고 2px 만큼 줄어든다(설계서 4.6). */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 52px;
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-button-large);
  font-weight: var(--weight-bold);
  font-family: inherit;
  line-height: var(--lh-title-3);
  text-align: center;
  border-radius: var(--radius-12);
  border: 1px solid transparent;
  cursor: pointer;
  background: var(--accent);
  color: var(--accent-ink);
  transition:
    background-color var(--duration-fast) var(--ease-color),
    transform var(--duration-fast) var(--ease-press);
}
.btn:active { background: var(--accent-strong); }
@media (hover: hover) and (pointer: fine) {
  .btn:hover { background: var(--accent-strong); }
}
.btn-small {
  min-height: var(--tap-min);
  width: auto;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-button);
  line-height: var(--lh-body);
  border-radius: var(--radius-8);
}
@media (prefers-reduced-motion: no-preference) {
  .btn:active { transform: scale(var(--press-scale-wide)); }
  .btn-small:active { transform: scale(var(--press-scale-tight)); }
}

/* 보조 (SEED neutralWeak) — 회색 채움. 흰 바탕 + 테두리를 대신한다 */
.btn-secondary {
  background: var(--surface-alt);
  color: var(--ink);
}
.btn-secondary:active { background: var(--pressed-weak); }
@media (hover: hover) and (pointer: fine) {
  .btn-secondary:hover { background: var(--pressed-weak); }
}
/* 조용한 버튼 (SEED ghost) — 바탕 없는 글자 버튼. 문장 속 글자 링크는 .link-button(밑줄)을 쓴다 */
.btn-quiet {
  background: transparent;
  color: var(--ink);
}
.btn-quiet:active { background: var(--pressed-transparent); }
@media (hover: hover) and (pointer: fine) {
  .btn-quiet:hover { background: var(--pressed-transparent); }
}
/* 되돌릴 수 없는 확인(동의 철회·데이터 지우기) — 긴급 빨강 채움. 화면당 하나 */
.btn-critical {
  background: var(--emergency);
  color: var(--emergency-ink);
}
.btn-critical:active { background: var(--emergency-strong); }
@media (hover: hover) and (pointer: fine) {
  .btn-critical:hover { background: var(--emergency-strong); }
}
/* 즉시 복귀 — 안전 지시. 긴급(빨강)과 구분되는 짙은 먹색 */
.btn-return {
  background: var(--ink);
  color: var(--on-dark); /* --ink 위 17.06:1 */
}
.btn-return:active { background: var(--state-no-tourism-ink); }
@media (hover: hover) and (pointer: fine) {
  .btn-return:hover { background: var(--state-no-tourism-ink); }
}

/* 소셜 로그인 — 공급자 브랜드 규정을 따르되 톤을 최대한 낮춘다 (AX-219).
   카카오 노랑 위 어두운 글자는 14.3:1, 구글 흰 버튼은 테두리 3.42:1 로 경계가 보인다. */
.btn-kakao {
  background: #fee500;
  color: #191600;
  border-color: #e6cf00;
}
.btn-kakao:active { background: #f2db00; }
.btn-google {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line-input);
}
.btn-google:active { background: var(--surface-alt); }
@media (hover: hover) and (pointer: fine) {
  .btn-kakao:hover { background: #f2db00; }
  .btn-google:hover { background: var(--surface-alt); }
}

/* 비활성 — 투명도 대신 색 교체. 글자는 --ink-subtle(회색 면 위 3.11:1): 무엇이 적혔는지 읽히고 누를 수 없음이 드러난다.
   못 누르는 이유는 버튼 옆 글자로 알린다(설계서 5.1). 눌림·호버보다 뒤에 두어 이긴다 */
.btn:disabled,
.btn[aria-disabled='true'] {
  background: var(--surface-alt);
  color: var(--ink-subtle);
  border-color: transparent;
  cursor: not-allowed;
  transform: none;
}
/* 자격증명이 없는 공급자 — 버튼을 없애지 않고 비활성으로 남긴다 */
.btn-kakao[aria-disabled='true'],
.btn-google[aria-disabled='true'] {
  background: var(--surface-alt);
  color: var(--ink-soft);
  border-color: var(--line-strong);
  cursor: not-allowed;
}
/* 처리 중 — 눌린 색 + 가운데 회전 표시(18px·선 2px). 글자는 자리를 지키되 보이지 않는다(폭이 흔들리지 않게).
   읽히는 이름은 남는다(opacity 는 접근성 트리에서 지우지 않는다) */
.btn[aria-busy='true'] {
  position: relative;
  background: var(--accent-strong);
  color: var(--accent-ink);
  cursor: progress;
  transform: none;
}
.btn[aria-busy='true'] > * { opacity: 0; }
.btn[aria-busy='true']::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
}
@media (prefers-reduced-motion: no-preference) {
  .btn[aria-busy='true']::after { animation: spin 0.9s linear infinite; }
}
.btn-secondary[aria-busy='true'] { background: var(--pressed-weak); color: var(--ink); }
.btn-quiet[aria-busy='true'] { background: var(--pressed-transparent); color: var(--ink); }
.btn-critical[aria-busy='true'] { background: var(--emergency-strong); color: var(--emergency-ink); }
```

`@keyframes spin`은 파일 끝 `.spinner` 규칙에 이미 있다(움직임 허용일 때만). 새로 만들지 않는다.

- [ ] **Step 5: 초점 규칙에 critical 을 더한다 (`app/globals.css`)**

```css
.btn:focus-visible,
.btn-return:focus-visible,
.ui-emergency:focus-visible {
  outline-color: var(--ink);
}
```

은 그대로 둔다 — `.btn`이 `.btn-critical`까지 덮는다. 바꿀 것 없음(확인만).

- [ ] **Step 6: `Button`에 critical·loading (`components/ui/Button.js`)**

6-a. 머리 주석의 사용 예 네 줄

```js
//   <Button>다음</Button>                                 주 버튼 (포인트 색 한 가지)
//   <Button variant="secondary">나중에</Button>           보조 버튼 (흰 바탕 + 테두리)
//   <Button variant="quiet">자세히</Button>               조용한 버튼 (글자 + 밑줄)
```
→
```js
//   <Button>다음</Button>                                 주 버튼 (포인트 색 한 가지, 화면당 하나)
//   <Button variant="secondary">나중에</Button>           보조 버튼 (회색 채움 — SEED neutralWeak)
//   <Button variant="quiet">자세히</Button>               조용한 버튼 (바탕 없는 글자 — SEED ghost)
//   <Button variant="critical">지우기</Button>            되돌릴 수 없는 확인 (긴급 빨강 채움, 화면당 하나)
//   <Button loading>저장</Button>                         처리 중 — 눌린 색 + 회전 표시, 누를 수 없다
```

6-b. `VARIANT_CLASS`

```js
const VARIANT_CLASS = {
  primary: '',
  secondary: 'btn-secondary',
  quiet: 'btn-quiet',
};
```
→
```js
const VARIANT_CLASS = {
  primary: '',
  secondary: 'btn-secondary',
  quiet: 'btn-quiet',
  critical: 'btn-critical',
};
```

6-c. JSDoc과 함수 본문 — `@param {'primary'|'secondary'|'quiet'} [props.variant]` 줄을 `@param {'primary'|'secondary'|'quiet'|'critical'} [props.variant]`로, `@param {boolean} [props.disabled]` 줄 아래에 `* @param {boolean} [props.loading]           처리 중 — 누르면 무시하고 aria-busy 로 알린다`를 더한 뒤, 매개변수 목록의 `disabled = false,` 아래에 `loading = false,`를 더하고, `const content = (` 부터 파일 끝까지를 아래로 바꾼다.

```jsx
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'small' ? 16 : 22} />}
      <span>{children}</span>
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={classes} style={style} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      style={style}
      // 비활성 링크는 포커스를 남겨 둔다(키보드 위치 보존). 진짜 버튼은 disabled 로 막는다.
      // 처리 중에는 포커스를 지키려고 disabled 대신 aria-disabled + 누름 무시로 막는다.
      disabled={href ? undefined : disabled}
      aria-disabled={(href && disabled) || loading ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
      onClick={loading ? undefined : rest.onClick}
    >
      {content}
    </button>
  );
}
```

- [ ] **Step 7: 긴급 버튼 (`app/styles/ui.css`, `components/ui/EmergencyButton.js`)**

7-a. `ui.css`의 `/* 긴급 연락 — 모든 화면 오른쪽 아래에 고정. … */` 주석과 `.ui-emergency { … }`, `.ui-emergency:hover { … }` 두 규칙을 아래로 바꾼다(그 아래 `.app-shell[data-nav='off'] .ui-emergency…` 자리 규칙들은 그대로 둔다).

```css
/* 긴급 연락 — 큰 CTA 모양(52px · 모서리 12 · 18px 굵게, 그림자 없음 — 설계서 5.1).
   하단 긴급 바·시작 화면 하단 바 안(is-docked)과 시안 보드(is-preview)에 놓인다. 자리 규칙은 아래에 따로 있다 */
.ui-emergency {
  position: fixed;
  z-index: 40;
  right: max(var(--gutter), calc(50% - var(--shell-max) / 2 + var(--gutter)));
  bottom: calc(var(--nav-offset) + var(--space-3));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-12);
  background: var(--emergency);
  color: var(--emergency-ink);
  font-size: var(--text-button-large);
  line-height: var(--lh-title-3);
  font-weight: var(--weight-bold);
  white-space: nowrap;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.ui-emergency:active {
  background: var(--emergency-strong);
}
@media (hover: hover) and (pointer: fine) {
  .ui-emergency:hover { background: var(--emergency-strong); }
}
```

7-b. 같은 파일의 `.ui-emergency-dot { … }` 규칙을 지운다.

7-c. `EmergencyButton.js` — 원판 없이 아이콘만. 머리 주석의 `높이 48px.`을 `큰 CTA 모양(52px·모서리 12).`로 바꾸고,

```jsx
      <span className="ui-emergency-dot">
        <Icon name="phone" size={16} strokeWidth={2.4} />
      </span>
```
→
```jsx
      <Icon name="phone" size={22} strokeWidth={2.2} />
```

7-d. 긴급 버튼이 48→52px 로 커져 하단 긴급 바도 69px 이 된다. 바 위에 서는 고정 요소(하단 고정 버튼)가 겹치지 않게
`app/globals.css`의 바 높이를 맞춘다.

```css
/* 하단 긴급 바도 내비와 같은 자리를 차지한다 — 고정 요소와 본문 여백이 같은 값을 쓰게 한다 */
.app-shell[data-emergency-bar='on'] {
  --nav-offset: calc(64px + env(safe-area-inset-bottom));
}
```
→
```css
/* 하단 긴급 바도 내비와 같은 자리를 차지한다 — 고정 요소와 본문 여백이 같은 값을 쓰게 한다.
   바 높이 = 위아래 8 + 긴급 버튼 52 + 윗선 1 = 69px */
.app-shell[data-emergency-bar='on'] {
  --nav-offset: calc(69px + env(safe-area-inset-bottom));
}
```

- [ ] **Step 8: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 3 passed.

- [ ] **Step 9: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 63건. axe가 비활성·처리 중 버튼 대비를 문제 삼으면 값을 바꾸지 말고 멈추고 보고한다.

- [ ] **Step 10: 커밋**

```bash
git add app components e2e src
git commit -m "$(cat <<'MSG'
style(design): 버튼을 SEED Action Button 모양으로 — critical·처리 중 추가

- 큰 CTA 52px·모서리 12·18/24, 작은 버튼 44px·모서리 8·16/22.
- 보조는 회색 채움(neutralWeak), 조용한 버튼은 바탕 없는 글자(ghost).
- 새 critical(긴급 빨강 채움)과 loading(눌린 색 + 회전 표시, aria-busy).
- 눌림은 면 색만 바꾸고 2px 만큼 줄어든다. 호버는 마우스가 있는 기기에서만.
- 비활성 글자는 --ink-subtle(3.11:1). 긴급 버튼도 큰 CTA 모양, 그림자 없음.
- 시안 보드 견본에 id 를 달고, 부품 모양을 재는 화면 테스트를 새로 만들었다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 3: 입력·선택 — 입력칸 · 답 칩 · 선택 상자 · 스위치 · 전환 · 날짜 칩 · 초점 링

**Files:**
- Modify: `app/globals.css` (`/* ── 폼 ── */`부터 `::placeholder`까지; 카드형 초점 규칙부터 `.radio-option.selected`까지; `/* ── 탭 — 알약 모양 묶음 ── */` 절)
- Modify: `app/styles/ui.css` (날짜 칩 `.ui-date-chip`부터 `.ui-date-chip.is-selected .ui-date-week`까지; 답 칩 `.ui-answer-options`부터 `.ui-answer:disabled .ui-answer-option`까지; 스위치 새 절)
- Modify (초점 링 두께만): `app/styles/conditions.css`, `app/styles/guardian.css`, `app/styles/today.css`, `app/styles/onboarding.css`, `app/styles/ui.css`
- Modify: `app/design-board/DesignBoard.js` (상태 2개, 견본 Sub 2개), `src/i18n/messages/designBoard.js` (키 13개)
- Test: `e2e/design-board-components.spec.js` (테스트 1건 추가)

**Interfaces:**
- Consumes: Task 2의 `styles()`·`pointerAway()`·describe, Task 1 토큰
- Produces:
  - 스위치 클래스 `.ui-switch` — `<input type="checkbox" role="switch" className="ui-switch">`를 `.toggle-row` 라벨 안에 둔다(③층 설정 화면이 쓴다). 동의 같은 체크 상자에는 쓰지 않는다.
  - 오류 도움말 클래스 `.hint.is-error`, 입력 오류 표시는 `aria-invalid="true"`.
  - 시안 보드 id `designBoard-c-input` · `designBoard-c-select`, 입력 id `designBoard-input` · `designBoard-input-error`.

- [ ] **Step 1: 시안 보드 견본 (`app/design-board/DesignBoard.js`, `src/i18n/messages/designBoard.js`)**

1-a. `const [sheetOpen, setSheetOpen] = useState(false);` 줄 아래에

```jsx
  const [box, setBox] = useState('A');
  const [switchOn, setSwitchOn] = useState(false);
```

1-b. `<Sub id="designBoard-c-answer" …>…</Sub>` 바로 뒤에 두 Sub

```jsx
            <Sub id="designBoard-c-input" title={t('designBoard.cInput')}>
              <div className="field">
                <label htmlFor="designBoard-input">{t('designBoard.inputLabel')}</label>
                <input
                  id="designBoard-input"
                  type="text"
                  placeholder={t('designBoard.inputPlaceholder')}
                  aria-describedby="designBoard-input-hint"
                />
                <p className="hint" id="designBoard-input-hint">
                  {t('designBoard.inputHint')}
                </p>
              </div>
              <div className="field">
                <label htmlFor="designBoard-input-error">{t('designBoard.inputErrorLabel')}</label>
                <input
                  id="designBoard-input-error"
                  type="text"
                  defaultValue="25:70"
                  aria-invalid="true"
                  aria-describedby="designBoard-input-error-msg"
                />
                <p className="hint is-error" id="designBoard-input-error-msg">
                  {t('designBoard.inputError')}
                </p>
              </div>
            </Sub>

            <Sub id="designBoard-c-select" title={t('designBoard.cSelect')}>
              <div className="radio-group" role="radiogroup" aria-label={t('designBoard.selectLegend')}>
                {[
                  ['A', 'designBoard.selectA', 'designBoard.selectASub'],
                  ['B', 'designBoard.selectB', 'designBoard.selectBSub'],
                ].map(([option, titleKey, subKey]) => (
                  <label key={option} className={box === option ? 'radio-option selected' : 'radio-option'}>
                    <input
                      type="radio"
                      name="designBoard-select"
                      value={option}
                      checked={box === option}
                      onChange={() => setBox(option)}
                    />
                    <span>
                      <strong>{t(titleKey)}</strong>
                      <span className="sub">{t(subKey)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="toggle-row">
                <span className="label">{t('designBoard.switchLabel')}</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="ui-switch"
                  checked={switchOn}
                  onChange={(event) => setSwitchOn(event.target.checked)}
                />
              </label>
            </Sub>
```

1-c. 문구 — `'designBoard.cAnswer'` 줄 바로 위에

```js
  'designBoard.cInput': { ko: '입력칸', en: 'Text input', ja: '入力欄', zh: '输入框' },
  'designBoard.inputLabel': { ko: '숙소 이름', en: 'Lodging name', ja: '宿の名前', zh: '住宿名称' },
  'designBoard.inputPlaceholder': { ko: '예: 데모 호텔 명동', en: 'e.g. Demo Hotel Myeongdong', ja: '例：デモホテル明洞', zh: '例如：演示酒店明洞' },
  'designBoard.inputHint': { ko: '지도에서 고른 이름이 그대로 들어가요.', en: 'The name you picked on the map goes here.', ja: '地図で選んだ名前がそのまま入ります。', zh: '将填入你在地图上选择的名称。' },
  'designBoard.inputErrorLabel': { ko: '복귀 시각', en: 'Return time', ja: '戻る時刻', zh: '返回时间' },
  'designBoard.inputError': { ko: '00:00–23:59 사이로 적어 주세요.', en: 'Enter a time between 00:00 and 23:59.', ja: '00:00〜23:59 の間で入力してください。', zh: '请输入 00:00–23:59 之间的时间。' },
  'designBoard.cSelect': { ko: '설명 붙은 선택 · 스위치', en: 'Select box and switch', ja: '説明付きの選択・スイッチ', zh: '带说明的选项与开关' },
  'designBoard.selectLegend': { ko: '공항', en: 'Airport', ja: '空港', zh: '机场' },
  'designBoard.selectA': { ko: '인천공항', en: 'Incheon Airport', ja: '仁川空港', zh: '仁川机场' },
  'designBoard.selectASub': { ko: '서울 도심까지 차로 약 1시간 (추정)', en: 'About 1 hour to central Seoul by car (estimate)', ja: 'ソウル都心まで車で約1時間（推定）', zh: '驾车至首尔市中心约1小时（估算）' },
  'designBoard.selectB': { ko: '김포공항', en: 'Gimpo Airport', ja: '金浦空港', zh: '金浦机场' },
  'designBoard.selectBSub': { ko: '서울 도심까지 차로 약 40분 (추정)', en: 'About 40 minutes to central Seoul by car (estimate)', ja: 'ソウル都心まで車で約40分（推定）', zh: '驾车至首尔市中心约40分钟（估算）' },
  'designBoard.switchLabel': { ko: '알림 켜기 (견본)', en: 'Turn on alerts (sample)', ja: '通知をオン（見本）', zh: '开启通知（样例）' },
```

- [ ] **Step 2: 실패하는 테스트를 더한다 (`e2e/design-board-components.spec.js`, describe 안 끝)**

```js
  test('입력·선택 — 입력칸·답 칩·선택 상자·스위치·전환·날짜 칩 (설계서 5.2·5.3)', async ({ page }) => {
    await pointerAway(page);

    // 입력칸: 52px · 모서리 12 · 좌우 16 · 3:1 테두리. 초점은 2px 진한 테두리, 윤곽선 없음. 오류는 빨강
    const input = page.locator('#designBoard-input');
    expect(
      await styles(input, ['min-height', 'border-top-left-radius', 'border-top-color', 'font-size', 'padding-left']),
    ).toEqual({
      'min-height': '52px',
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(134, 139, 148)',
      'font-size': '16px',
      'padding-left': '16px',
    });
    await input.focus();
    await expect
      .poll(() => styles(input, ['border-top-color', 'box-shadow', 'outline-style']))
      .toEqual({
        'border-top-color': 'rgb(26, 28, 32)',
        'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
        'outline-style': 'none',
      });
    const invalid = page.locator('#designBoard-input-error');
    expect((await styles(invalid, ['border-top-color']))['border-top-color']).toBe('rgb(200, 16, 46)');

    // 답 칩: 44px 알약 · 16px · 3:1 테두리. 고르면 진한 테두리 + 회색 면 + 굵게 + 체크
    const yes = page.locator('#designBoard-c-answer .ui-answer').first().locator('.ui-answer-option').first();
    expect(await styles(yes, ['min-height', 'border-top-left-radius', 'font-size', 'border-top-color'])).toEqual({
      'min-height': '44px',
      'border-top-left-radius': '9999px',
      'font-size': '16px',
      'border-top-color': 'rgb(134, 139, 148)',
    });
    await yes.click();
    await expect(yes).toHaveClass(/is-selected/);
    await pointerAway(page);
    await expect
      .poll(() => styles(yes, ['background-color', 'border-top-color', 'font-weight']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', 'border-top-color': 'rgb(26, 28, 32)', 'font-weight': '700' });
    await expect(yes.locator('.ui-answer-mark')).toBeVisible();

    // 선택 상자: 모서리 12. 고른 칸은 2px 진한 테두리, 나머지는 3:1 테두리
    const boxes = page.locator('#designBoard-c-select .radio-option');
    await expect(boxes.nth(0)).toHaveClass(/selected/);
    expect(await styles(boxes.nth(0), ['border-top-left-radius', 'border-top-color', 'box-shadow'])).toEqual({
      'border-top-left-radius': '12px',
      'border-top-color': 'rgb(26, 28, 32)',
      'box-shadow': 'rgb(26, 28, 32) 0px 0px 0px 1px inset',
    });
    expect((await styles(boxes.nth(1), ['border-top-color']))['border-top-color']).toBe('rgb(134, 139, 148)');

    // 스위치: 52×32, 끔은 --ink-subtle, 켬은 --selected
    const sw = page.getByRole('switch', { name: '알림 켜기 (견본)' });
    expect(await styles(sw, ['width', 'height', 'background-color'])).toEqual({
      width: '52px',
      height: '32px',
      'background-color': 'rgb(134, 139, 148)',
    });
    await sw.check();
    await pointerAway(page);
    await expect.poll(() => styles(sw, ['background-color']).then((s) => s['background-color'])).toBe('rgb(42, 48, 56)');

    // 전환(Segmented): 회색 알약 통, 고른 칸은 흰 면 + 진한 글자, 안 고른 칸은 보조 글자
    const seg = page.locator('.tabs').first();
    expect(await styles(seg, ['border-top-left-radius', 'background-color'])).toEqual({
      'border-top-left-radius': '9999px',
      'background-color': 'rgb(243, 244, 245)',
    });
    expect(
      await styles(seg.locator('[aria-selected="true"]'), ['min-height', 'background-color', 'color', 'font-weight']),
    ).toEqual({ 'min-height': '44px', 'background-color': 'rgb(255, 255, 255)', color: 'rgb(26, 28, 32)', 'font-weight': '700' });
    expect((await styles(seg.locator('[aria-selected="false"]'), ['color'])).color).toBe('rgb(85, 93, 109)');

    // 날짜 칩: 고른 날 진한 회색 채움 + 흰 글자, '오늘' 코발트 테두리, 나머지 회색 면
    const chips = page.locator('#designBoard-c-datechip .ui-date-chip');
    expect(
      await styles(page.locator('#designBoard-c-datechip .ui-date-chip.is-selected'), [
        'background-color',
        'color',
        'border-top-left-radius',
      ]),
    ).toEqual({ 'background-color': 'rgb(42, 48, 56)', color: 'rgb(255, 255, 255)', 'border-top-left-radius': '12px' });
    expect((await styles(chips.nth(0), ['border-top-color']))['border-top-color']).toBe('rgb(10, 92, 255)');
    expect((await styles(chips.nth(2), ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });
```

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: 새 테스트 FAIL — `'border-top-left-radius': '12px'`인데 입력칸 `min-height` `48px` ≠ `52px`.

- [ ] **Step 4: 입력칸 (`app/globals.css`)**

`/* ── 폼 ── */` 줄부터 `::placeholder { color: var(--ink-soft); }` 줄까지를 아래로 바꾼다.

```css
/* ── 입력 (SEED Text Input) ──
   높이 52 · 모서리 12 · 좌우 16 · 16/22. 테두리는 3:1 이상(--line-input — SEED #dcdee3 을 하한으로 올림).
   초점은 테두리를 2px 진한 선(--line-contrast)으로 바꿔 알린다 — 코발트 윤곽선과 겹쳐 그리지 않는다(설계서 5.2).
   오류(aria-invalid)는 2px 긴급 빨강, 비활성·읽기 전용은 회색 면 */
.field { margin-bottom: var(--space-4); }
.field > label {
  display: block;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-bold);
  color: var(--ink);
  margin-bottom: var(--space-2);
}
.field .hint,
.hint {
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  color: var(--ink-soft);
  margin-top: var(--space-2);
}
/* 오류 도움말 — 흰 바탕 5.88:1. 아이콘은 오류를 그리는 화면이 붙인다 */
.hint.is-error {
  color: var(--emergency);
}

input[type='text'],
input[type='number'],
input[type='datetime-local'],
input[type='date'],
input[type='time'],
input[type='tel'],
input[type='search'],
input[type='email'],
input[type='password'],
select,
textarea {
  width: 100%;
  min-height: 52px;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-family: inherit;
  border: 1px solid var(--line-input);
  border-radius: var(--radius-12);
  background: var(--surface);
  color: var(--ink);
  transition:
    border-color var(--duration-fast) var(--ease-color),
    box-shadow var(--duration-fast) var(--ease-color);
}
/* 체크 상자·라디오·슬라이더는 글자 입력칸이 아니다 — 아래 세 규칙에서 뺀다 */
:is(input, select, textarea):not([type='checkbox'], [type='radio'], [type='range']):focus {
  border-color: var(--line-contrast);
  box-shadow: inset 0 0 0 1px var(--line-contrast);
  outline: none;
}
:is(input, select, textarea):not([type='checkbox'], [type='radio'], [type='range'])[aria-invalid='true'] {
  border-color: var(--emergency);
  box-shadow: inset 0 0 0 1px var(--emergency);
}
:is(input, select, textarea):not([type='checkbox'], [type='radio'], [type='range']):disabled,
input[readonly] {
  background: var(--surface-alt);
}
::placeholder { color: var(--ink-soft); }
```

- [ ] **Step 5: 선택 상자·토글 줄·카드형 초점 (`app/globals.css`)**

`/* 카드형 라디오·토글은 내부 22~28px 입력이 아니라 카드 전체로 포커스를 표시한다 */` 줄부터 `.radio-option.selected { … }` 규칙 끝까지를 아래로 바꾼다.

```css
/* 카드형 라디오·토글은 안쪽 입력이 아니라 칸 전체로 초점을 보인다 — 키보드 초점일 때만(:focus-visible).
   안쪽 입력의 링은 지워 두 링이 겹치지 않게 한다 */
.radio-option:has(input:focus-visible),
.toggle-row:has(input:focus-visible) {
  outline: var(--focus-width) solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-12);
}
.radio-option input:focus-visible,
.toggle-row input:focus-visible {
  outline: none;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 52px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--line);
}
.toggle-row:last-child { border-bottom: none; }
.toggle-row .label { font-size: var(--text-body); font-weight: var(--weight-medium); }
.toggle-row .sub {
  display: block;
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  color: var(--ink-soft);
  font-weight: var(--weight-regular);
}
/* 체크 상자(동의 등) — 스위치(.ui-switch)는 app/styles/ui.css 가 따로 그린다 */
.toggle-row input[type='checkbox']:not(.ui-switch) {
  width: 28px;
  height: 28px;
  accent-color: var(--selected);
  flex-shrink: 0;
}

/* ── 설명 붙은 선택 (SEED Select Box) ── 모서리 12 · 좌우 16. 테두리는 선택지 경계라 3:1 이상(--line-input).
   고르면 2px 진한 테두리(1px 선 + 안쪽 1px) + 채운 라디오 — 색 단독이 아니다 */
.radio-group { display: flex; flex-direction: column; gap: var(--space-2); }
.radio-option {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  border: 1px solid var(--line-input);
  border-radius: var(--radius-12);
  padding: 14px var(--space-4);
  min-height: 52px;
  background: var(--surface);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.radio-option:active { background: var(--pressed); }
@media (hover: hover) and (pointer: fine) {
  .radio-option:hover { background: var(--pressed); }
}
.radio-option input {
  width: 22px;
  height: 22px;
  margin-top: 1px;
  accent-color: var(--selected);
  flex-shrink: 0;
}
.radio-option .sub {
  display: block;
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  color: var(--ink-soft);
}
.radio-option.selected {
  border-color: var(--line-contrast);
  box-shadow: inset 0 0 0 1px var(--line-contrast);
}
```

- [ ] **Step 6: 전환 (`app/globals.css`)**

`/* ── 탭 — 알약 모양 묶음 ── */` 줄부터 `.tabs button[aria-selected='true'] { … }` 규칙 끝까지를 아래로 바꾼다.

```css
/* ── 전환 (SEED Segmented Control) — 환자/보호자 ──
   통: 회색 알약 + 4px 안쪽 여백. 칸: 44px 알약 · 16/22 굵게. 고른 칸은 흰 면 + 1px 선 + 진한 글자,
   안 고른 칸은 보조 글자. 면·선·글자색이 함께 바뀐다(색 단독 금지) */
.tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  margin-bottom: var(--space-4);
  background: var(--surface-alt);
  border-radius: var(--radius-full);
}
.tabs button {
  flex: 1;
  min-height: var(--tap-min);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: none;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-family: inherit;
  font-weight: var(--weight-bold);
  color: var(--ink-soft);
  cursor: pointer;
  transition:
    background-color var(--duration) var(--ease-color),
    color var(--duration) var(--ease-color);
}
.tabs button[aria-selected='true'] {
  background: var(--surface);
  border-color: var(--line-section);
  color: var(--ink);
}
```

- [ ] **Step 7: 날짜 칩 (`app/styles/ui.css`)**

`.ui-date-chip {` 규칙부터 `.ui-date-chip.is-selected .ui-date-week { … }` 규칙 끝까지를 아래로 바꾼다(`.ui-date-strip` 두 규칙은 그대로).

```css
/* 날짜 칩 (SEED Chip Tabs 방식) — 모서리 12 · 60×92. 고른 날 = 진한 회색 채움 + 흰 글자, 나머지 = 회색 면.
   오늘 = 코발트 2px 테두리 + '오늘' 글자(허용된 코발트 쓰임). 상태 아이콘은 흰 원판 위 상태 색이라 어느 면에서도 산다 */
.ui-date-chip {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-0-5);
  min-width: 60px;
  min-height: 92px;
  padding: var(--space-2) 6px;
  border: 2px solid transparent;
  border-radius: var(--radius-12);
  background: var(--surface-alt);
  color: var(--ink);
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-color),
    transform var(--duration-fast) var(--ease-press);
}
.ui-date-chip:active { background: var(--pressed-weak); }
@media (hover: hover) and (pointer: fine) {
  .ui-date-chip:hover { background: var(--pressed-weak); }
}
@media (prefers-reduced-motion: no-preference) {
  .ui-date-chip:active { transform: scale(var(--press-scale-tight)); }
}
.ui-date-week {
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  color: var(--ink-soft);
  line-height: var(--lh-caption);
}
.ui-date-day {
  font-size: var(--text-title-2);
  font-weight: var(--weight-bold);
  line-height: var(--lh-title-2);
  font-variant-numeric: tabular-nums;
}
.ui-date-marks {
  display: inline-flex;
  align-items: center;
  gap: var(--space-0-5);
  margin-top: var(--space-0-5);
}
/* 상태 아이콘은 흰 원판 위 상태 색 — 고른 칩(진한 면)에서도 상태 색이 살아 있다 */
.ui-date-state {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--surface);
  border: 1px solid currentColor;
}
.ui-date-state-TOGETHER { color: var(--state-together-ink); }
.ui-date-state-SPLIT_NEARBY { color: var(--state-split-ink); }
.ui-date-state-STANDBY { color: var(--state-standby-ink); }
.ui-date-state-NO_TOURISM { color: var(--state-no-tourism-ink); }
.ui-date-appt {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--source-hospital);
  border: 1px solid currentColor;
}
/* 오늘: '오늘' 글자 + 코발트 2px 테두리 */
.ui-date-chip.is-today {
  border-color: var(--accent);
}
.ui-date-chip.is-today .ui-date-week {
  color: var(--accent-strong);
  font-weight: var(--weight-bold);
}
/* 선택: 진한 회색 채움 + 흰 글자(13.31:1). 고른 칩은 눌러도 색을 바꾸지 않는다. 짙은 면이라 초점 링은 먹색 */
.ui-date-chip.is-selected,
.ui-date-chip.is-selected:active {
  background: var(--selected);
  color: var(--on-dark);
}
@media (hover: hover) and (pointer: fine) {
  .ui-date-chip.is-selected:hover { background: var(--selected); }
}
.ui-date-chip.is-selected .ui-date-week {
  color: var(--on-dark);
}
.ui-date-chip.is-selected:focus-visible {
  outline-color: var(--ink);
}
```

- [ ] **Step 8: 답 칩과 스위치 (`app/styles/ui.css`)**

8-a. `.ui-answer-options {` 규칙부터 `.ui-answer:disabled .ui-answer-option { … }` 규칙 끝까지를 아래로 바꾼다(`.ui-answer-explain`부터는 그대로).

```css
.ui-answer-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: var(--space-2);
}
/* 답 칩 (SEED Chip · outlineWeak) — 44px 알약 · 16px(SEED 14px 을 하한으로 올림).
   테두리는 선택지 경계라 3:1 이상(--line-input — SEED 의 옅은 선은 1.35:1, 설계서 4.7) */
.ui-answer-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line-input);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  line-height: var(--lh-body);
  text-align: center;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-color),
    transform var(--duration-fast) var(--ease-press);
}
/* 라디오는 칸 전체를 덮는 투명 입력 — 키보드(방향키)·스크린리더는 표준 라디오로 다룬다 */
.ui-answer-option input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.ui-answer-option:active { background: var(--pressed); }
@media (hover: hover) and (pointer: fine) {
  .ui-answer-option:hover { background: var(--pressed); }
}
@media (prefers-reduced-motion: no-preference) {
  .ui-answer-option:active { transform: scale(var(--press-scale-tight)); }
}
/* 키보드 초점일 때만 칩 전체에 링 */
.ui-answer-option:has(input:focus-visible) {
  outline: var(--focus-width) solid var(--accent);
  outline-offset: 2px;
}
/* 체크 표시 — 고른 칩에서만 글자 앞에 나온다 */
.ui-answer-mark {
  display: none;
  pointer-events: none;
}
/* 선택: 진한 테두리 + 회색 면 + 체크 아이콘 + 굵은 글자 (색 단독 금지). 고른 칩은 눌러도 색을 바꾸지 않는다 */
.ui-answer-option.is-selected,
.ui-answer-option.is-selected:active {
  border-color: var(--line-contrast);
  background: var(--surface-alt);
  color: var(--ink);
  font-weight: var(--weight-bold);
}
@media (hover: hover) and (pointer: fine) {
  .ui-answer-option.is-selected:hover { background: var(--surface-alt); }
}
.ui-answer-option.is-selected .ui-answer-mark {
  display: inline-grid;
}
.ui-answer:disabled .ui-answer-option {
  background: var(--surface-alt);
  color: var(--ink-soft);
  border-color: var(--line-strong);
  cursor: not-allowed;
  transform: none;
}
/* 병원이 정한 값(비활성)도 무엇을 골랐는지는 또렷해야 한다 — 3:1 테두리 + 진한 글자 + 체크 */
.ui-answer:disabled .ui-answer-option.is-selected {
  border-color: var(--line-input);
  color: var(--ink);
}
```

8-b. 같은 파일에서 `/* ───────────────────────── 조건 기간 편집기 틀 ───────────────────────── */` 줄 바로 위에 스위치 절을 더한다.

```css
/* ───────────────────────── 스위치 (SEED Switch) ─────────────────────────
 * 바로 적용되는 켬/끔 설정에만 쓴다(동의는 체크 상자). <input type="checkbox" role="switch" class="ui-switch">
 * 를 .toggle-row 라벨 안에 둔다 — 라벨 줄 전체(52px)가 누르는 대상이라 트랙이 32px 여도 44px 하한을 지킨다.
 * 트랙 52×32 · 알맹이 26. 끔 트랙은 --ink-subtle(흰 바탕 3.42:1 — SEED #b0b3ba 는 2.1:1 이라 하한으로 올림).
 * 켬은 --selected 채움 + 알맹이가 오른쪽으로 — 색과 위치가 함께 바뀐다. 눌러도 색을 바꾸지 않는다. */
.ui-switch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  flex: none;
  width: 52px;
  height: 32px;
  margin: 0;
  border-radius: var(--radius-full);
  background: var(--ink-subtle);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.ui-switch::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--on-dark);
  transition: transform var(--duration) var(--ease-press);
}
.ui-switch:checked {
  background: var(--selected);
}
.ui-switch:checked::before {
  transform: translateX(20px);
}
.ui-switch:disabled {
  background: var(--line-strong);
  cursor: not-allowed;
}
```

- [ ] **Step 9: 하드코딩 3px 초점 링을 `--focus-width`로 (넘겨받은 것 1)**

```bash
sed -i '' -E 's/outline: 3px solid var\(--accent\);/outline: var(--focus-width) solid var(--accent);/' \
  app/styles/conditions.css app/styles/guardian.css app/styles/today.css app/styles/onboarding.css app/styles/ui.css
grep -rnE '3px solid var\(--accent\)|0 0 0 3px var\(--accent\)' app || echo "남은 곳 없음"
```

Expected: `남은 곳 없음`.

- [ ] **Step 10: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 4 passed.

- [ ] **Step 11: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 64건. 조건 입력·온보딩 화면 테스트는 역할·이름으로 찾으므로 그대로 통과해야 한다. 깨지면 테스트를 모양에 맞추지 말고 멈추고 보고한다.

- [ ] **Step 12: 커밋**

```bash
git add app e2e src
git commit -m "$(cat <<'MSG'
style(design): 입력·선택 부품을 SEED 모양으로 — 입력칸·답 칩·선택 상자·스위치·전환·날짜 칩

- 입력칸 52px·모서리 12. 초점은 2px 진한 테두리, 오류는 2px 긴급 빨강(aria-invalid).
- 답 칩은 44px 알약. 고르면 진한 테두리 + 회색 면 + 체크 + 굵게(코발트 대신).
  테두리는 선택지 경계라 3:1(--line-input)을 지킨다 — SEED 의 옅은 선은 1.35:1.
- 선택 상자는 모서리 12, 고르면 2px 진한 테두리. 새 스위치(.ui-switch)는 끔 트랙을 3:1 로 올렸다.
- 환자/보호자 전환은 Segmented Control 모양, 날짜 칩은 고른 날 진한 회색 채움·'오늘' 코발트 테두리.
- 하드코딩 3px 초점 링을 --focus-width 로 옮기고, 카드형 라디오·토글은 키보드 초점일 때만 칸 전체에 링.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 배지·안내 — 배지 5종 · 출처 표시 · 상태 배너 · 안내 상자 · 보기 전용 배너 · 빈 상태

**Files:**
- Modify: `app/globals.css` (`/* ── 의료 경계 콜아웃 (D08-CMP002) ── */` 절, `/* ── 상태 배너 (D08-CMP006) … */` 절의 `.state-banner…` 규칙들, `/* ── 배지 — 기본형 … */` 주석과 `.badge` 규칙)
- Modify: `app/styles/ui.css` (보기 전용 배너 두 규칙, 배지 5종 절, `.ui-source` 모서리, `.ui-source-tag`, 빈 상태 절)
- Modify: `components/StateBanner.js` (아이콘 20px)
- Modify: `app/design-board/DesignBoard.js` (안내 상자 Sub), `src/i18n/messages/designBoard.js` (키 2개)
- Test: `e2e/design-board-components.spec.js` (테스트 1건 추가)

**Interfaces:**
- Consumes: Task 2의 `styles()`·`pointerAway()`·describe, Task 2의 Sub id(`designBoard-c-badge`·`-state`·`-source`·`-empty`)
- Produces: 시안 보드 id `designBoard-c-callout`. `.medical-callout`은 왼쪽 띠 없는 회색 면(아이콘은 ③층에서 화면이 붙인다).

- [ ] **Step 1: 시안 보드 견본**

1-a. `DesignBoard.js` — `<Sub id="designBoard-c-state" …>…</Sub>` 바로 뒤에

```jsx
            <Sub id="designBoard-c-callout" title={t('designBoard.cCallout')}>
              <div className="medical-callout" role="note">
                {t('designBoard.calloutBody')}
              </div>
            </Sub>
```

1-b. `designBoard.js` — `'designBoard.cDateChip'` 줄 바로 위에

```js
  'designBoard.cCallout': { ko: '안내 상자', en: 'Callout', ja: '案内ボックス', zh: '提示框' },
  'designBoard.calloutBody': {
    ko: 'SafeHour는 의료진의 판단을 대신하지 않습니다. 몸 상태에 이상이 느껴지면 바로 병원에 연락하세요.',
    en: 'SafeHour does not replace your medical team. If you feel unwell, contact your hospital right away.',
    ja: 'SafeHourは医療者の判断に代わるものではありません。体調に異変を感じたら、すぐに病院へ連絡してください。',
    zh: 'SafeHour 不能替代医护人员的判断。如感到身体不适，请立即联系医院。',
  },
```

- [ ] **Step 2: 실패하는 테스트를 더한다 (describe 안 끝)**

```js
  test('배지·안내 — 배지 모양, 상태 배너, 안내 상자, 출처 영역, 빈 상태 (설계서 5.4·5.6)', async ({ page }) => {
    await pointerAway(page);

    // 배지 5종: 14/19 · 모서리 6 · 좌우 8 · 높이 28px 안팎
    const area = page.locator('#designBoard-c-badge');
    const badges = area.locator('.ui-badge');
    await expect(badges).toHaveCount(5);
    for (const badge of await badges.all()) {
      expect(await styles(badge, ['font-size', 'line-height', 'border-top-left-radius', 'padding-left'])).toEqual({
        'font-size': '14px',
        'line-height': '19px',
        'border-top-left-radius': '6px',
        'padding-left': '8px',
      });
      const { height } = await badge.boundingBox();
      expect(height).toBeGreaterThanOrEqual(26);
      expect(height).toBeLessThanOrEqual(30);
    }
    expect(await styles(area.locator('.ui-badge-estimate'), ['background-color', 'border-top-color'])).toEqual({
      'background-color': 'rgb(243, 244, 245)',
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });
    expect(await styles(area.locator('.ui-badge-hoursUnconfirmed'), ['border-top-style', 'border-top-color'])).toEqual({
      'border-top-style': 'dotted',
      'border-top-color': 'rgb(134, 139, 148)',
    });
    expect(await styles(area.locator('.ui-badge-readOnly'), ['background-color', 'font-weight'])).toEqual({
      'background-color': 'rgb(51, 64, 85)',
      'font-weight': '700',
    });
    expect(await styles(area.locator('.ui-source-tag').first(), ['border-top-left-radius', 'font-size'])).toEqual({
      'border-top-left-radius': '6px',
      'font-size': '14px',
    });

    // 상태 배너 (Callout): 모서리 10 · 안쪽 14 · 라벨 16px · 아이콘 20px
    const banner = page.locator('#designBoard-c-state .state-banner').first();
    expect(await styles(banner, ['border-top-left-radius', 'padding-top'])).toEqual({
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    expect((await styles(banner.locator('.state-label'), ['font-size']))['font-size']).toBe('16px');
    expect((await banner.locator('.state-icon svg').boundingBox()).width).toBe(20);

    // 안내 상자: 왼쪽 띠 없는 회색 면 · 모서리 10 · 16px
    const callout = page.locator('#designBoard-c-callout .medical-callout');
    expect(
      await styles(callout, ['border-top-left-radius', 'border-left-width', 'background-color', 'font-size']),
    ).toEqual({
      'border-top-left-radius': '10px',
      'border-left-width': '0px',
      'background-color': 'rgb(243, 244, 245)',
      'font-size': '16px',
    });

    // 출처 영역: 모서리 10, 병원 발행은 왼쪽 띠를 지킨다
    expect(
      await styles(page.locator('#designBoard-c-source .ui-source-hospital'), ['border-top-left-radius', 'border-left-width']),
    ).toEqual({ 'border-top-left-radius': '10px', 'border-left-width': '6px' });

    // 빈 상태 (Result Section): 바탕 없이 가운데
    expect(
      (await styles(page.locator('#designBoard-c-empty .ui-empty'), ['background-color']))['background-color'],
    ).toBe('rgba(0, 0, 0, 0)');
  });
```

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: 새 테스트 FAIL — 배지 `line-height`가 `19px`가 아니다(지금 `18.2px`).

- [ ] **Step 4: 안내 상자·상태 배너·배지 기본형 (`app/globals.css`)**

4-a. `/* ── 의료 경계 콜아웃 (D08-CMP002) ── */` 주석과 `.medical-callout { … }` 규칙을

```css
/* ── 일반 안내 상자 (SEED Callout · neutral, D08-CMP002) — 왼쪽 띠 없이 옅은 면 · 모서리 10 · 16px(안전 문구) ── */
.medical-callout {
  background: var(--surface-alt);
  border-radius: var(--radius-10);
  padding: 14px var(--space-4);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink);
  margin-bottom: var(--space-4);
}
```

4-b. `/* ── 상태 배너 (D08-CMP006) — 색 + 문구 + 아이콘 ── */` 줄부터 `.state-banner .state-reasons { … }` 규칙 끝까지를(아래 `.state-NO_TOURISM` 등 네 줄은 그대로)

```css
/* ── 상태 배너 (SEED Callout, D08-CMP006) — 색 + 문구 + 아이콘 ──
   모서리 10 · 안쪽 14 · 아이콘 20px · 라벨 16px(안전 문구 — SEED 14px 을 하한으로 올림).
   1px 상태 선은 남긴다 — ③층 회색 바탕 위에서도 NO_TOURISM 의 옅은 면이 사라지지 않게 */
.state-banner {
  border-radius: var(--radius-10);
  padding: 14px;
  margin-bottom: var(--space-4);
  border: 1px solid;
}
.state-banner .state-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  line-height: var(--lh-body);
  margin-bottom: var(--space-1-5);
}
/* 아이콘은 원판 없이 상태 글자색 그대로 20px — 16px 글자와 짝을 맞춘다(상태 면 위 6:1 이상) */
.state-banner .state-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
}
.state-banner h2 {
  font-size: var(--text-title-2);
  line-height: var(--lh-title-2);
  margin-bottom: var(--space-1);
}
/* opacity 감산 금지 — 상태 배경 위에서 4.5:1 을 넘지 못한다. 병기 줄은 굵기로만 낮춘다 */
.state-banner p {
  font-size: var(--text-body);
  color: inherit;
}
.state-banner .state-secondary {
  font-weight: var(--weight-medium);
}
.state-banner .state-action {
  margin-top: var(--space-2);
  font-weight: var(--weight-bold);
}
.state-banner .state-reasons {
  margin-top: var(--space-2);
  padding-left: var(--space-5);
  font-size: var(--text-body);
}
```

4-c. `/* ── 배지 — 기본형. 5종 배지(components/ui/Badge.js)는 아이콘·테두리 모양이 더해진다 ── */` 주석과 `.badge { … }` 규칙을(아래 `.badge-estimate`·`.badge-lang`·`.badge-demo`·`.badge-hospital`은 그대로)

```css
/* ── 배지 (SEED Badge) — 14/19 · 모서리 6 · 좌우 8 · 높이 28px 안팎(SEED 11–12px 은 하한으로 올림 — 배지 5종은 안전 정보다).
   5종(components/ui/Badge.js)은 면·테두리 모양·아이콘·문구가 서로 다르다 ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--lh-caption);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-6);
  border: 1px solid transparent;
  color: var(--ink-soft);
  background: var(--surface-alt);
  white-space: nowrap;
}
```

- [ ] **Step 5: 부품 쪽 (`app/styles/ui.css`)**

5-a. 보기 전용 배너(SEED Page Banner) — `.ui-readonly { … }`와 `.ui-readonly-title { … }`를

```css
/* 보기 전용 배너 (SEED Page Banner) — 화면 폭 맨 위, 화면당 하나, 위아래 10 · 좌우 16, 16px(안전 문구) */
.ui-readonly {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: 10px var(--gutter);
  background: var(--surface-alt);
  border-bottom: 1px solid var(--line-strong);
}
```
```css
.ui-readonly-title {
  display: block;
  color: var(--ink);
  font-weight: var(--weight-bold);
  line-height: var(--lh-body);
}
```

5-b. 배지 5종 — `/* ───────────────────────── 배지 5종 ───────────────────────── */` 줄부터 `.ui-badge-readOnly { … }` 규칙 끝까지를

```css
/* ───────────────────────── 배지 5종 ───────────────────────── */
/* 모양이 서로 다르다: 회색 면(추정) · 분홍 면(기본값) · 점선 테두리 흰 면(운영 확인) · 띠 무늬(데모) · 짙은 면 굵게(보기 전용).
   아이콘도 다섯 가지가 다르다(Badge.js) — 색만으로 구분하지 않는다 */
.ui-badge-estimate {
  background: var(--surface-alt);
  color: var(--ink-soft);
}
.ui-badge-defaulted {
  background: var(--support-soft);
  color: var(--support-ink);
}
.ui-badge-hoursUnconfirmed {
  border-style: dotted;
  border-color: var(--line-input);
  background: var(--surface);
  color: var(--ink-soft);
}
.ui-badge-demo {
  border-color: var(--state-standby-ink);
  color: var(--ink);
  background: repeating-linear-gradient(
    -45deg,
    var(--badge-demo-stripe-a) 0 6px,
    var(--badge-demo-stripe-b) 6px 12px
  );
}
.ui-badge-readOnly {
  background: var(--badge-readonly-bg);
  color: var(--on-dark);
  font-weight: var(--weight-bold);
}
```

5-c. 출처 영역 — `.ui-source { … }` 규칙의 `border-radius: var(--radius-16);`을 `border-radius: var(--radius-10);`으로. 그리고 `.ui-source-tag { … }` 규칙을

```css
.ui-source-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-6);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--lh-caption);
  white-space: nowrap;
  background: var(--surface);
}
```

(출처별 테두리 모양 규칙 `.ui-source-tag-hospital` … `-ai` 다섯 줄은 그대로 — 파선·실선으로 출처를 가른다.)

5-d. 빈 상태 — `/* ───────────────────────── 빈 상태 ───────────────────────── */` 줄부터 `.ui-empty-action { … }` 규칙 끝까지를

```css
/* ───────────────────────── 빈 상태 (SEED Result Section) ─────────────────────────
 * 바탕 없이 가운데 — 그림 → 제목 → 설명 → 버튼. 오류가 아니므로 빨강·경고를 쓰지 않고, 코발트도 쓰지 않는다 */
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-1-5);
  padding: var(--space-8) var(--space-4);
}
.ui-empty-art {
  display: inline-grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-alt);
  color: var(--ink-soft);
}
.ui-empty-title {
  font-size: var(--text-title-3);
  line-height: var(--lh-title-3);
  color: var(--ink);
  margin: 0;
}
.ui-empty-action {
  margin-top: var(--space-3);
  width: 100%;
  max-width: 320px;
}
```

- [ ] **Step 6: 상태 배너 아이콘 20px (`components/StateBanner.js`)**

```jsx
          <Icon name={STATE_ICON[state]} size={18} strokeWidth={2.2} />
```
→
```jsx
          <Icon name={STATE_ICON[state]} size={20} strokeWidth={2.2} />
```

그리고 `app/globals.css`에 남아 있는 `.state-banner .state-icon .ui-icon { color: var(--surface); }` 규칙(원판 위 흰 선)은 4-b에서 이미 빠졌는지 확인한다 — 남아 있으면 지운다.

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 5 passed.

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 65건.

- [ ] **Step 9: 커밋**

```bash
git add app components e2e src
git commit -m "$(cat <<'MSG'
style(design): 배지·안내 부품을 SEED 모양으로 — 배지·상태 배너·안내 상자·빈 상태

- 배지는 14/19·모서리 6·좌우 8(높이 28 안팎). 5종은 면·점선·띠 무늬·짙은 면과 아이콘으로 계속 갈린다.
- 상태 배너는 Callout 모양(모서리 10·안쪽 14·아이콘 20·라벨 16). 1px 상태 선은 회색 바탕 대비로 남겼다.
- 일반 안내 상자는 왼쪽 띠를 없앤 회색 면. 출처 영역은 모서리 10, 병원·관광공사 띠는 그대로.
- 보기 전용 배너는 Page Banner 여백, 빈 상태는 바탕 없는 가운데 정렬.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 그릇 — 회색 바탕 층 · 흰 블록 · 목록 행(새 부품) · 장소 카드

**Files:**
- Create: `components/ui/ListItem.js`
- Modify: `components/ui/index.js` (내보내기 한 줄)
- Modify: `app/styles/ui.css` (`.ui-place` 규칙, 파일 끝에 새 절)
- Modify: `app/design-board/DesignBoard.js` (import, 견본 Sub), `app/styles/designBoard.css` (견본 틀), `src/i18n/messages/designBoard.js` (키 7개)
- Test: `e2e/design-board-components.spec.js` (테스트 1건 추가)

**Interfaces:**
- Consumes: Task 2의 `styles()`·`pointerAway()`·describe, Task 1 토큰(`--radius-10`·`--radius-16`·`--press-scale-wide`·`--gap-section`)
- Produces (③층이 쓴다):
  - `ListItem({ title, titleLang?, description?, leading?, trailing?, href?, onClick? })` — `trailing="chevron"`이면 오른쪽 화살표. `href`면 링크, `onClick`이면 버튼, 둘 다 없으면 누를 수 없는 행.
  - `ListGroup({ label?, children })` — `<ul class="ui-list">`, 자식은 `<li>`.
  - `ListHeader({ as = 'h2', id?, children })` — 목록 머리 14/19 굵게.
  - 클래스 `main.page.is-basement`(회색 바탕 + 그 안에서 `--shadow-card: none`), `.ui-block`(흰 블록, 화면 폭 꽉, 8px 틈).
  - 시안 보드 id `designBoard-c-list`.

- [ ] **Step 1: 시안 보드 견본**

1-a. `DesignBoard.js` import 목록의 `KoreanCard,` 줄 아래에

```js
  ListGroup,
  ListHeader,
  ListItem,
```

1-b. `<Sub id="designBoard-c-place" …>…</Sub>` 바로 뒤에

```jsx
            <Sub id="designBoard-c-list" title={t('designBoard.cList')} wide>
              <div className="designBoard-basement">
                <section className="ui-block" aria-labelledby="designBoard-list-h">
                  <ListHeader as="h4" id="designBoard-list-h">
                    {t('designBoard.listHeader')}
                  </ListHeader>
                  <ListGroup>
                    <li>
                      <ListItem
                        title={t('designBoard.listTitle')}
                        description={t('designBoard.listDesc')}
                        leading={<Icon name="navTrip" size={22} />}
                        trailing="chevron"
                        href="#designBoard-c-list"
                      />
                    </li>
                    <li>
                      <ListItem
                        title={t('designBoard.listTitle2')}
                        leading={<Icon name="globe" size={22} />}
                        trailing={<span lang="ko">{LANG_NAMES.ko}</span>}
                        onClick={() => {}}
                      />
                    </li>
                    <li>
                      <ListItem title={t('designBoard.listTitle3')} />
                    </li>
                  </ListGroup>
                </section>
                <section className="ui-block">
                  <p>{t('designBoard.blockBody')}</p>
                </section>
              </div>
            </Sub>
```

1-c. `app/styles/designBoard.css` 끝에

```css
/* 회색 바탕 견본 — 흰 블록(.ui-block)의 음수 여백이 이 틀 안에서 끝나게 좌우 여백을 준다 */
.designBoard-basement {
  padding: var(--space-2) var(--gutter) 0;
  background: var(--layer-basement);
  border-radius: var(--radius-16);
  overflow: hidden;
}
```

1-d. `designBoard.js` — `'designBoard.cMeal'` 줄 바로 위에

```js
  'designBoard.cList': { ko: '목록 행 · 흰 블록', en: 'List rows and blocks', ja: 'リスト行・白いブロック', zh: '列表行与白色区块' },
  'designBoard.listHeader': { ko: '도구', en: 'Tools', ja: 'ツール', zh: '工具' },
  'designBoard.listTitle': { ko: '전체 일정', en: 'Full schedule', ja: '全体の日程', zh: '全部行程' },
  'designBoard.listDesc': { ko: '날짜별 상태와 장소 수', en: 'Status and number of places by date', ja: '日付ごとの状態と場所の数', zh: '按日期显示状态与地点数' },
  'designBoard.listTitle2': { ko: '언어', en: 'Language', ja: '言語', zh: '语言' },
  'designBoard.listTitle3': { ko: '이 기기에만 저장돼요', en: 'Saved on this device only', ja: 'この端末にだけ保存されます', zh: '仅保存在此设备上' },
  'designBoard.blockBody': {
    ko: '구역이 여럿인 화면은 회색 바탕 위에 흰 블록을 쌓아요.',
    en: 'Screens with several sections stack white blocks on a gray background.',
    ja: '区切りが多い画面は、灰色の背景に白いブロックを重ねます。',
    zh: '分区较多的页面在灰色底上叠放白色区块。',
  },
```

- [ ] **Step 2: 실패하는 테스트를 더한다 (describe 안 끝)**

```js
  test('그릇 — 목록 행 높이·눌림, 흰 블록, 회색 바탕 층, 장소 카드 (설계서 5.5)', async ({ page }) => {
    await pointerAway(page);
    const list = page.locator('#designBoard-c-list');
    const rows = list.locator('.ui-list-item');
    await expect(rows).toHaveCount(3);

    // 제목만이면 46px, 설명까지 66px 안팎. 설명은 14px 보조 글자
    expect(Math.round((await rows.nth(2).boundingBox()).height)).toBe(46);
    const withDesc = (await rows.nth(0).boundingBox()).height;
    expect(withDesc).toBeGreaterThanOrEqual(62);
    expect(withDesc).toBeLessThanOrEqual(70);
    expect(await styles(rows.nth(0).locator('.ui-list-item-desc'), ['font-size', 'color'])).toEqual({
      'font-size': '14px',
      color: 'rgb(85, 93, 109)',
    });

    // 눌림: 바탕이 좌우 6px 안으로 들어온 모서리 10 면
    const row = rows.nth(1);
    const before = (property) => row.evaluate((el, p) => getComputedStyle(el, '::before').getPropertyValue(p), property);
    await row.hover();
    await page.mouse.down();
    await expect.poll(() => before('background-color')).toBe('rgba(0, 0, 0, 0.027)');
    expect([await before('left'), await before('right'), await before('border-top-left-radius')]).toEqual([
      '6px',
      '6px',
      '10px',
    ]);
    await page.mouse.up();
    await pointerAway(page);

    // 흰 블록: 흰 면, 모서리·그림자 없음
    expect(
      await styles(list.locator('.ui-block').first(), ['background-color', 'box-shadow', 'border-top-left-radius']),
    ).toEqual({ 'background-color': 'rgb(255, 255, 255)', 'box-shadow': 'none', 'border-top-left-radius': '0px' });

    // 회색 바탕 층: main.page.is-basement 는 회색 면이고 그 안에서 카드 그림자를 끈다
    const main = page.locator('main.page');
    await main.evaluate((el) => el.classList.add('is-basement'));
    expect(
      await main.evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el).getPropertyValue('--shadow-card').trim(),
      ]),
    ).toEqual(['rgb(243, 244, 245)', 'none']);
    await main.evaluate((el) => el.classList.remove('is-basement'));

    // 장소 카드: 모서리 16 · 그림자 없음 · 1px 카드 테두리
    expect(
      await styles(page.locator('#designBoard-c-place .ui-place').first(), [
        'border-top-left-radius',
        'box-shadow',
        'border-top-color',
      ]),
    ).toEqual({ 'border-top-left-radius': '16px', 'box-shadow': 'none', 'border-top-color': 'rgb(220, 222, 227)' });
  });
```

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: 빌드가 먼저 실패한다 — `ListGroup`·`ListHeader`·`ListItem`을 `@/components/ui/index.js`에서 찾지 못한다(`Export ListGroup doesn't exist`). 이것이 이 태스크의 RED다.

- [ ] **Step 4: 목록 행 부품 (`components/ui/ListItem.js`)**

```jsx
// 목록 행 (SEED List Item · 설계서 5.5)
//
//   <ListHeader>도구</ListHeader>
//   <ListGroup>
//     <li><ListItem title="전체 일정" description="날짜별 상태" leading={<Icon name="navTrip" size={22} />} trailing="chevron" href="/trip" /></li>
//     <li><ListItem title="언어" trailing={<span>한국어</span>} onClick={open} /></li>
//   </ListGroup>
//
// - 위아래 12 · 좌우 16. 제목 16/22, 설명 14/19 보조 글자(SEED 13px·옅은 회색을 하한으로 올림).
//   제목만이면 46px, 설명까지 66px 안팎 — 터치 44px 이상.
// - href 면 링크, onClick 이면 버튼, 둘 다 없으면 누를 수 없는 행(div).
// - 누르면 바탕이 좌우 6px 안으로 들어온 모서리 10 면으로 바뀌고 내용만 조금 줄어든다.
// - 행 안에서 따로 누를 것은 3개까지. 뒤에 버튼을 두는 행은 행 자체에 href·onClick 을 주지 않는다(누르는 곳이 겹친다).
// - 앞 아이콘은 장식이다(aria-hidden). 뜻은 제목이 전한다.

import Link from 'next/link';
import Icon from './Icon.js';

/** 목록 묶음 — 자식은 <li>. 반복 행 사이에 좌우 16px 들여쓴 1px 선 */
export function ListGroup({ label, children }) {
  return (
    <ul className="ui-list" role="list" aria-label={label}>
      {children}
    </ul>
  );
}

/** 목록 머리 — 14/19 굵게 */
export function ListHeader({ as: Heading = 'h2', id, children }) {
  return (
    <Heading className="ui-list-header" id={id}>
      {children}
    </Heading>
  );
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {string} [props.titleLang]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.leading]            22px 아이콘·그림
 * @param {'chevron'|React.ReactNode} [props.trailing] 'chevron' 이면 오른쪽 화살표
 * @param {string} [props.href]
 * @param {() => void} [props.onClick]
 */
export default function ListItem({ title, titleLang, description, leading, trailing, href, onClick }) {
  const interactive = Boolean(href || onClick);
  const className = interactive ? 'ui-list-item is-interactive' : 'ui-list-item';
  const body = (
    <span className="ui-list-item-inner">
      {leading && (
        <span className="ui-list-item-leading" aria-hidden="true">
          {leading}
        </span>
      )}
      <span className="ui-list-item-text">
        <span className="ui-list-item-title" lang={titleLang}>
          {title}
        </span>
        {description && <span className="ui-list-item-desc">{description}</span>}
      </span>
      {trailing && (
        <span className="ui-list-item-trailing">
          {trailing === 'chevron' ? <Icon name="chevronRight" size={18} /> : trailing}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
```

- [ ] **Step 5: 내보내기 (`components/ui/index.js`)**

`export { default as KoreanCard } from './KoreanCard.js';` 줄 아래에

```js
export { default as ListItem, ListGroup, ListHeader } from './ListItem.js';
```

- [ ] **Step 6: 그릇 규칙 (`app/styles/ui.css`)**

6-a. 장소 카드 — `.ui-place { … }` 규칙을

```css
/* 장소 카드 — 누르는 대상이라 카드로 둔다(SEED: 모서리 16 · 그림자 없음 · 1px 카드 테두리). 그림은 카드 가장자리에 붙는다 */
.ui-place {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-16);
  overflow: hidden;
}
```

6-b. 파일 끝에 새 절

```css
/* ───────────────────────── 바탕 층 · 흰 블록 · 목록 (SEED layer · List) ─────────────────────────
 * 구역이 여럿인 화면: main.page 에 is-basement 를 주면 회색 바탕 위에 흰 블록(.ui-block)을 8px 틈으로 쌓는다.
 * 회색 바탕에서는 카드 그림자가 필요 없다 — 이 범위에서 --shadow-card 를 끈다(설계서 4.5). 화면에 켜는 일은 ③층이다. */
main.page.is-basement {
  background: var(--layer-basement);
  --shadow-card: none;
}
.ui-block {
  margin: 0 calc(var(--gutter) * -1) var(--gap-section);
  padding: var(--space-5) var(--gutter);
  background: var(--layer-default);
}
.ui-block > :last-child {
  margin-bottom: 0;
}
/* 목록 행을 담은 블록은 행이 좌우 여백을 스스로 갖는다 */
.ui-block:has(> .ui-list) {
  padding-left: 0;
  padding-right: 0;
}

.ui-list {
  list-style: none;
}
/* 반복 행 사이 1px 선 — 좌우 16px 들여씀(장식) */
.ui-list > li + li::before {
  content: '';
  display: block;
  height: 1px;
  margin: 0 var(--gutter);
  background: var(--line);
}
.ui-list-header {
  margin: 0;
  padding: var(--space-2) var(--gutter);
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
.ui-list-item {
  position: relative;
  display: block;
  width: 100%;
  padding: var(--space-3) var(--gutter);
  border: 0;
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
}
.ui-list-item.is-interactive {
  cursor: pointer;
}
/* 눌림 — 바탕이 좌우 6px 안으로 들어온 모서리 10 면. 내용만 줄어든다 */
.ui-list-item.is-interactive::before {
  content: '';
  position: absolute;
  inset: 0 6px;
  border-radius: var(--radius-10);
  background: transparent;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.ui-list-item.is-interactive:active::before {
  background: var(--pressed-transparent);
}
@media (hover: hover) and (pointer: fine) {
  .ui-list-item.is-interactive:hover::before { background: var(--pressed-transparent); }
}
.ui-list-item.is-interactive:focus-visible {
  outline-offset: -2px;
}
.ui-list-item-inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 22px;
  transition: transform var(--duration-fast) var(--ease-press);
}
@media (prefers-reduced-motion: no-preference) {
  .ui-list-item.is-interactive:active .ui-list-item-inner { transform: scale(var(--press-scale-wide)); }
}
.ui-list-item-leading {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 22px;
  color: var(--ink);
}
.ui-list-item-text {
  display: grid;
  gap: var(--space-0-5);
  flex: 1;
  min-width: 0;
}
.ui-list-item-title {
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-regular);
  color: var(--ink);
}
.ui-list-item-desc {
  font-size: var(--text-caption);
  line-height: var(--lh-caption);
  color: var(--ink-soft);
}
.ui-list-item-trailing {
  display: inline-flex;
  align-items: center;
  flex: none;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink-soft);
}
/* 화살표는 아이콘이라 --ink-subtle(흰 바탕 3.42:1) — 글자에는 쓰지 않는다 */
.ui-list-item-trailing > .ui-icon {
  color: var(--ink-subtle);
}
```

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 6 passed. 시안 보드 가로 스크롤 없음 단언도 통과해야 한다(흰 블록 음수 여백이 견본 틀 안에서 끝난다).

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 66건.

- [ ] **Step 9: 커밋**

```bash
git add app components e2e src
git commit -m "$(cat <<'MSG'
feat(design): 목록 행·흰 블록·회색 바탕 층 부품, 장소 카드를 SEED 모양으로

- 새 ListItem·ListGroup·ListHeader: 위아래 12·좌우 16, 제목 16/22·설명 14/19,
  누르면 좌우 6px 안으로 들어온 모서리 10 면 + 내용만 축소. ③층 화면들이 목록을 이것으로 바꾼다.
- main.page.is-basement(회색 바탕, 그 안에서 카드 그림자 끔)와 .ui-block(흰 블록, 8px 틈).
- 장소 카드는 모서리 16·그림자 없음·1px 카드 테두리.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 6: 시트·확인 대화상자 (SEED Bottom Sheet · Alert Dialog)

**Files:**
- Create: `components/ui/AlertDialog.js`
- Modify: `components/ui/Sheet.js` (손잡이 조건, 닫기 아이콘 16), `components/ui/index.js` (내보내기)
- Modify: `app/globals.css` (`/* ── 모달 시트 ── */`의 `.sheet-backdrop`·`.sheet` 두 규칙)
- Modify: `app/styles/ui.css` (`/* ── 시트 ── */` 절의 손잡이·머리·닫기 규칙, 파일 끝에 대화상자 절)
- Modify: `app/design-board/DesignBoard.js` (import, 상태, 견본 Sub), `src/i18n/messages/designBoard.js` (키 5개)
- Test: `e2e/design-board-components.spec.js` (테스트 1건 추가)

**Interfaces:**
- Consumes: Task 2의 `Button`(`variant="critical"`, `loading`, `size="small"`), `styles()`·`pointerAway()`·describe, Task 1 토큰(`--text-title-sheet`·`--lh-title-sheet`·`--radius-20`·`--radius-24`), `lib/useModalSheet.js`의 `useModalSheet(onClose) → { sheetRef, requestClose }`
- Produces (③층이 쓴다): `AlertDialog({ title, titleLang?, description?, cancelLabel, confirmLabel, critical?, busy?, onConfirm?({ requestClose }), onClose })`. 시안 보드 id `designBoard-c-dialog`. 시트 뒤 가림막은 `--overlay`(넘겨받은 것 3).

- [ ] **Step 1: 시안 보드 견본**

1-a. `DesignBoard.js` import 목록 맨 앞(`AnswerInput,` 위)에 `AlertDialog,`를 더하고, `const [switchOn, setSwitchOn] = useState(false);` 줄 아래에

```jsx
  const [dialogOpen, setDialogOpen] = useState(false);
```

1-b. `<Sub id="designBoard-c-sheet" …>…</Sub>` 바로 뒤에

```jsx
            <Sub id="designBoard-c-dialog" title={t('designBoard.cDialog')}>
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                {t('designBoard.dialogOpen')}
              </Button>
              {dialogOpen && (
                <AlertDialog
                  title={t('designBoard.dialogTitle')}
                  description={t('designBoard.dialogBody')}
                  cancelLabel={t('designBoard.demoCancel')}
                  confirmLabel={t('designBoard.dialogConfirm')}
                  critical
                  onConfirm={({ requestClose }) => requestClose()}
                  onClose={() => setDialogOpen(false)}
                />
              )}
            </Sub>
```

1-c. `designBoard.js` — `'designBoard.cEmpty'` 줄 바로 위에

```js
  'designBoard.cDialog': { ko: '확인 대화상자', en: 'Confirm dialog', ja: '確認ダイアログ', zh: '确认对话框' },
  'designBoard.dialogOpen': { ko: '대화상자 열기', en: 'Open dialog', ja: 'ダイアログを開く', zh: '打开对话框' },
  'designBoard.dialogTitle': { ko: '이 기기의 기록을 지울까요?', en: 'Delete the records on this device?', ja: 'この端末の記録を消しますか？', zh: '要删除此设备上的记录吗？' },
  'designBoard.dialogBody': { ko: '지운 기록은 되돌릴 수 없어요.', en: "Deleted records can't be restored.", ja: '消した記録は元に戻せません。', zh: '删除的记录无法恢复。' },
  'designBoard.dialogConfirm': { ko: '지우기', en: 'Delete', ja: '消す', zh: '删除' },
```

- [ ] **Step 2: 실패하는 테스트를 더한다 (describe 안 끝)**

```js
  test('시트·대화상자 — 시트 모양, 대화상자는 바깥을 눌러도 닫히지 않는다 (설계서 5.6)', async ({ page }) => {
    await pointerAway(page);

    // 시트: 뒤 --overlay, 위 모서리 24, 그림자 없음, 제목 22/30 굵게, 닫기는 44px 누르는 곳
    await page.locator('#designBoard-c-sheet').getByRole('button', { name: '시트 열기' }).click();
    const backdrop = page.locator('.sheet-backdrop');
    await expect(backdrop).toBeVisible();
    expect((await styles(backdrop, ['background-color']))['background-color']).toBe('rgba(0, 0, 0, 0.455)');
    const sheet = page.locator('.sheet');
    expect(await styles(sheet, ['border-top-left-radius', 'box-shadow'])).toEqual({
      'border-top-left-radius': '24px',
      'box-shadow': 'none',
    });
    expect(await styles(sheet.locator('.ui-sheet-head h2'), ['font-size', 'line-height', 'font-weight'])).toEqual({
      'font-size': '22px',
      'line-height': '30px',
      'font-weight': '700',
    });
    await expect(sheet.locator('.ui-sheet-grabber')).toBeVisible();
    const close = sheet.getByRole('button', { name: '닫기' });
    const closeBox = await close.boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(backdrop).toHaveCount(0);

    // 대화상자: 272px · 모서리 20, 되돌릴 수 없는 확인은 긴급 빨강, 바깥을 눌러도 닫히지 않고 Escape 로 닫힌다
    await page.locator('#designBoard-c-dialog').getByRole('button', { name: '대화상자 열기' }).click();
    const dialog = page.getByRole('alertdialog', { name: '이 기기의 기록을 지울까요?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await pointerAway(page); // 대화상자가 방금 누른 자리 위에 뜰 수 있다 — 버튼 호버 색이 섞이지 않게
    expect(await styles(dialog, ['border-top-left-radius', 'max-width'])).toEqual({
      'border-top-left-radius': '20px',
      'max-width': '272px',
    });
    expect(
      (await styles(dialog.getByRole('button', { name: '지우기' }), ['background-color']))['background-color'],
    ).toBe('rgb(200, 16, 46)');
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
```

- [ ] **Step 3: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: 빌드가 먼저 실패한다 — `AlertDialog`를 `@/components/ui/index.js`에서 찾지 못한다.

- [ ] **Step 4: 확인 대화상자 부품 (`components/ui/AlertDialog.js`)**

```jsx
'use client';

// 확인 대화상자 (SEED Alert Dialog · 설계서 5.6) — 다시 만들기·동의 철회·데이터 지우기처럼 한 번 더 묻는 자리
//
//   {open && (
//     <AlertDialog title={제목} description={설명} cancelLabel={취소 문구} confirmLabel={확인 문구}
//                  critical onConfirm={({ requestClose }) => { 지우기(); requestClose(); }}
//                  onClose={() => setOpen(false)} />
//   )}
//
// - 가운데 뜨는 272px 상자 · 모서리 20 · 제목 20/27 굵게 · 설명 16/22. 버튼은 둘(취소 · 확인)까지.
// - 되돌릴 수 없으면 critical — 확인 버튼이 긴급 빨강 채움이 된다. busy 면 확인 버튼이 처리 중 모양이 된다.
// - 바깥을 눌러도 닫히지 않는다(실수로 닫혀 확인을 건너뛰지 않게). Escape·취소·뒤로 가기는 닫는다.
// - role="alertdialog" + aria-modal. 열리면 대화상자로 포커스, Tab 가두기, 닫히면 이전 포커스로 —
//   접근성·뒤로 가기는 시트와 같은 lib/useModalSheet.js 한 경로를 쓴다(닫기는 늘 requestClose).
// - 열려 있을 때만 그린다(마운트 = 열림).

import { useId } from 'react';
import { useModalSheet } from '@/lib/useModalSheet.js';
import Button from './Button.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.titleLang]
 * @param {string} [props.description]
 * @param {string} props.cancelLabel
 * @param {string} props.confirmLabel
 * @param {boolean} [props.critical]     되돌릴 수 없는 확인 — 확인 버튼을 긴급 빨강으로
 * @param {boolean} [props.busy]         확인 처리 중
 * @param {(api: { requestClose: () => void }) => void} [props.onConfirm]
 * @param {() => void} props.onClose     실제로 닫는 함수(부모 상태 끄기)
 */
export default function AlertDialog({
  title,
  titleLang,
  description,
  cancelLabel,
  confirmLabel,
  critical = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { sheetRef, requestClose } = useModalSheet(onClose);

  return (
    <div className="ui-dialog-backdrop">
      <div
        className="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={sheetRef}
        tabIndex={-1}
      >
        <h2 id={titleId} className="ui-dialog-title" lang={titleLang}>
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="ui-dialog-desc">
            {description}
          </p>
        )}
        <div className="ui-dialog-actions">
          <Button variant="secondary" size="small" onClick={requestClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={critical ? 'critical' : 'primary'}
            size="small"
            loading={busy}
            onClick={() => onConfirm?.({ requestClose })}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 내보내기 (`components/ui/index.js`)**

`export { default as AnswerInput } from './AnswerInput.js';` 줄 **위에**

```js
export { default as AlertDialog } from './AlertDialog.js';
```

- [ ] **Step 6: 시트 (`components/ui/Sheet.js`)**

```jsx
        <div className="ui-sheet-grabber" aria-hidden="true" />
```
→
```jsx
        {/* 손잡이는 닫을 수 있는 시트에만 — 확인을 꼭 받는 시트(showClose=false)가 끌어 내려 닫힐 것처럼 보이지 않게 */}
        {showClose && <div className="ui-sheet-grabber" aria-hidden="true" />}
```

그리고 닫기 버튼 안 `<Icon name="close" size={20} />`을 `<Icon name="close" size={16} />`으로.

- [ ] **Step 7: 시트 틀 (`app/globals.css`)**

`/* ── 모달 시트 ── */` 줄과 `.sheet-backdrop { … }`, `.sheet { … }` 두 규칙을 아래로 바꾼다(그 아래 `.sheet > h2:first-child`와 움직임 규칙은 그대로).

```css
/* ── 모달 시트 (SEED Bottom Sheet) ── 최대 480 · 위 모서리 24 · 뒤 --overlay · 최대 높이 90% · 그림자 없음 */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
}
.sheet {
  width: 100%;
  max-width: var(--shell-max);
  background: var(--layer-floating);
  border-radius: var(--radius-24) var(--radius-24) 0 0;
  padding: var(--space-3) var(--gutter) calc(var(--space-6) + env(safe-area-inset-bottom));
  max-height: 90dvh;
  overflow-y: auto;
}
```

- [ ] **Step 8: 시트 머리와 대화상자 (`app/styles/ui.css`)**

8-a. `/* ───────────────────────── 시트 ───────────────────────── */` 줄부터 `.ui-sheet-close { … }` 규칙 끝까지를 아래로 바꾼다(`.ui-sheet-foot`은 그대로).

```css
/* ───────────────────────── 시트 머리 (SEED Bottom Sheet) ─────────────────────────
 * 손잡이 36×4 는 닫을 수 있는 시트에만(Sheet.js). 즉시 복귀처럼 확인을 꼭 받는 시트에는 손잡이·닫기가 없다.
 * 제목 22/30 굵게, 머리 아래 선 없음. 닫기는 28px 원이 보이고 누르는 곳은 44px */
.ui-sheet-grabber {
  width: 36px;
  height: 4px;
  margin: 0 auto var(--space-3);
  border-radius: var(--radius-full);
  background: var(--line-strong);
}
.ui-sheet-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.ui-sheet-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-top: var(--space-2);
  font-size: var(--text-title-sheet);
  line-height: var(--lh-title-sheet);
  font-weight: var(--weight-bold);
}
.ui-sheet-close {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: none;
  margin: 0 calc(var(--space-2) * -1) 0 0;
  border: none;
  background: none;
  color: var(--ink);
  cursor: pointer;
}
.ui-sheet-close::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-alt);
  transition: background-color var(--duration-fast) var(--ease-color);
}
.ui-sheet-close:active::before {
  background: var(--pressed-weak);
}
@media (hover: hover) and (pointer: fine) {
  .ui-sheet-close:hover::before { background: var(--pressed-weak); }
}
.ui-sheet-close > .ui-icon {
  position: relative;
}
```

8-b. 파일 끝에

```css
/* ───────────────────────── 확인 대화상자 (SEED Alert Dialog) ─────────────────────────
 * 가운데 272px · 모서리 20 · 제목 20/27 굵게 · 설명 16/22 보조 글자 · 버튼 둘 반반. 시트(50)보다 위(60) */
.ui-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--gutter);
  background: var(--overlay);
}
.ui-dialog {
  width: 100%;
  max-width: 272px;
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-radius: var(--radius-20);
  background: var(--layer-floating);
}
.ui-dialog-title {
  margin: 0;
  font-size: var(--text-title-2);
  line-height: var(--lh-title-2);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
.ui-dialog-desc {
  margin-top: var(--space-1-5);
  font-size: var(--text-body);
  line-height: var(--lh-body);
  color: var(--ink-soft);
}
.ui-dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
.ui-dialog-actions > .btn {
  width: 100%;
}
```

- [ ] **Step 9: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 7 passed.

- [ ] **Step 10: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 67건. 즉시 복귀 시트·전후 비교 시트를 여는 기존 화면 테스트(역할 `dialog`·버튼 이름)는 그대로 통과해야 한다.

- [ ] **Step 11: 커밋**

```bash
git add app components e2e src
git commit -m "$(cat <<'MSG'
feat(design): 시트를 SEED Bottom Sheet 모양으로, 확인 대화상자 부품 추가

- 시트: 뒤 가림막 --overlay, 위 모서리 24, 그림자 없음, 제목 22/30, 머리 아래 선 없음.
  손잡이는 닫을 수 있는 시트에만 — 즉시 복귀 시트는 지금처럼 확인 버튼만 남는다.
  닫기는 28px 원이 보이고 누르는 곳은 44px.
- 새 AlertDialog(272px·모서리 20·버튼 둘, critical 이면 긴급 빨강). 바깥을 눌러도 닫히지 않고
  Escape·취소·뒤로 가기는 시트와 같은 한 경로(useModalSheet)로 닫힌다. ③층의 다시 만들기·
  동의 철회·데이터 지우기 확인이 이것을 쓴다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: 상단 바 · 언어 선택 · 하단 내비 · 채운 아이콘

**Files:**
- Modify: `app/globals.css` (`/* ── 상단 바 ── */` 절, `.lang-trigger` 두 규칙, `.lang-list button.selected`)
- Modify: `app/styles/ui.css` (`.ui-bottom-nav {`부터 `.ui-bottom-nav a:hover .ui-nav-pill { … }`까지)
- Modify: `components/ui/BottomNav.js` (아이콘), `components/ui/Icon.js` (채운 아이콘 5개)
- Test: `e2e/design-board-components.spec.js` (테스트 1건 추가)

**Interfaces:**
- Consumes: Task 2의 `styles()`·`pointerAway()`·describe와 id `designBoard-c-shell`
- Produces: 아이콘 이름 `navTodayFill` · `navTripFill` · `navConditionsFill` · `navMoreFill` · `phoneFill`(이름이 `Fill`로 끝나면 채운 모양). 클래스 `.ui-nav-icon`(옛 `.ui-nav-pill`은 없어진다).

- [ ] **Step 1: 실패하는 테스트를 더한다 (describe 안 끝)**

```js
  test('상단 바·하단 내비 — 56px 선 없는 바, 글자 언어 버튼, 채운 아이콘 현재 칸 (설계서 5.7·5.8·5.9)', async ({ page }) => {
    await pointerAway(page);

    // 상단 바: 높이 56 · 아래 선 없음 · 제목 18/24 굵게 · 언어 선택은 테두리 없는 16px 글자 버튼
    const bar = page.locator('header.top-bar').first();
    expect(Math.round((await bar.boundingBox()).height)).toBe(56);
    expect(await styles(bar, ['border-bottom-width', 'background-color'])).toEqual({
      'border-bottom-width': '0px',
      'background-color': 'rgb(255, 255, 255)',
    });
    expect(await styles(bar.locator('.brand'), ['font-size', 'line-height', 'font-weight'])).toEqual({
      'font-size': '18px',
      'line-height': '24px',
      'font-weight': '700',
    });
    expect(await styles(bar.locator('.lang-trigger'), ['border-top-width', 'font-size', 'min-height'])).toEqual({
      'border-top-width': '0px',
      'font-size': '16px',
      'min-height': '44px',
    });

    // 하단 내비: 현재 칸은 채운 아이콘 + 진한 글자 700, 다른 칸은 선 아이콘 + 보조 글자 500
    const nav = page.locator('#designBoard-c-shell .ui-bottom-nav');
    const current = nav.getByRole('link', { name: '일정' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    expect(await styles(current, ['color', 'font-weight'])).toEqual({ color: 'rgb(26, 28, 32)', 'font-weight': '700' });
    const other = nav.getByRole('link', { name: '오늘' });
    expect(await styles(other, ['color', 'font-weight'])).toEqual({ color: 'rgb(85, 93, 109)', 'font-weight': '500' });
    expect(await current.locator('svg [fill="currentColor"]').count()).toBeGreaterThan(0);
    expect(await other.locator('svg [fill="currentColor"]').count()).toBe(0);

    // 긴급 칸: 빨간 알약 없이 긴급 빨강 아이콘 + 글자
    const emergency = nav.getByRole('link', { name: '긴급 연락' });
    expect((await styles(emergency, ['color'])).color).toBe('rgb(200, 16, 46)');
    await expect(emergency.locator('.ui-nav-pill')).toHaveCount(0);
  });
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js
```

Expected: 새 테스트 FAIL — 상단 바 높이 `60` ≠ `56`.

- [ ] **Step 3: 상단 바 (`app/globals.css`)**

`/* ── 상단 바 ── */` 줄부터 `.top-bar .back:hover { background: var(--surface-alt); }` 줄까지를 아래로 바꾼다.

```css
/* ── 상단 바 (SEED Top Navigation) ──
   높이 56 + 위 안전 영역 · 흰 면 · 스크롤해도 선 없음 · 제목 18/24 굵게 한 줄 말줄임(전체 이름은 DOM 에 남는다).
   아이콘 버튼 44×44 · 모서리 8 · 누르면 투명 눌림. 양 끝 버튼은 가장자리에서 6px */
.top-bar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 6px 0;
  background: var(--layer-default);
  position: sticky;
  top: 0;
  z-index: 10;
}
/* 뒤로 가기가 없으면 제목이 본문 여백(16px)에 맞게 10px 더 들어간다 */
.top-bar .brand {
  font-family: inherit;
  font-weight: var(--weight-bold);
  font-size: var(--text-title-3);
  line-height: var(--lh-title-3);
  color: var(--ink);
  margin: 0;
  padding-left: 10px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-bar .back + .brand {
  padding-left: 0;
}
.top-bar .back {
  width: var(--tap-min);
  height: var(--tap-min);
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-8);
  cursor: pointer;
  color: var(--ink);
  flex: none;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.top-bar .back:active { background: var(--pressed-transparent); }
@media (hover: hover) and (pointer: fine) {
  .top-bar .back:hover { background: var(--pressed-transparent); }
}
/* 상단 바 버튼의 초점 링은 안쪽 −2px — 바 가장자리에서 잘리지 않게(설계서 4.6) */
.top-bar .back:focus-visible {
  outline-offset: -2px;
}
```

- [ ] **Step 4: 언어 선택 (`app/globals.css`)**

4-a. `.lang-trigger { … }`와 `.lang-trigger:hover { … }` 두 규칙을

```css
/* 글자 버튼(SEED) — 테두리 알약을 없앴다. 높이 44 · 좌우 10 · 16/22 · 500, 지구 아이콘 + 언어 이름 + 펼침 표시 */
.lang-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap-min);
  min-width: var(--tap-min);
  padding: 0 10px;
  font-size: var(--text-body);
  line-height: var(--lh-body);
  font-weight: var(--weight-medium);
  font-family: inherit;
  color: var(--ink);
  background: none;
  border: none;
  border-radius: var(--radius-8);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--duration-fast) var(--ease-color);
}
.lang-trigger:active { background: var(--pressed-transparent); }
@media (hover: hover) and (pointer: fine) {
  .lang-trigger:hover { background: var(--pressed-transparent); }
}
.lang-trigger:focus-visible {
  outline-offset: -2px;
}
```

4-b. 선택된 언어 — `.lang-list button.selected { … }` 규칙과 그 위 주석을

```css
/* 선택된 언어: 체크 아이콘 + 굵기 + 회색 면 (색 단독 금지 · '선택'은 코발트가 아니라 중립색) */
.lang-list button.selected {
  background: var(--surface-alt);
  color: var(--ink);
  font-weight: var(--weight-bold);
}
```

- [ ] **Step 5: 하단 내비 (`app/styles/ui.css`)**

`.ui-bottom-nav {` 규칙부터 `.ui-bottom-nav a:hover .ui-nav-pill { … }` 규칙 끝까지를 아래로 바꾼다(위의 `.ui-emergency-bar`와 아래 `/* 시안 보드용 미리보기 … */` 규칙들은 그대로).

```css
.ui-bottom-nav {
  position: fixed;
  z-index: 30;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--shell-max);
  background: var(--layer-default);
  border-top: 1px solid var(--line-strong);
  padding-bottom: env(safe-area-inset-bottom);
}
.ui-bottom-nav ul {
  display: grid;
  /* 5칸 — 오늘·일정·조건·더보기·긴급. 320px 에서 칸당 64px 이라 문구가 짧아야 한다(common.navEmergency) */
  grid-template-columns: repeat(5, minmax(0, 1fr));
  list-style: none;
  height: var(--nav-height);
}
/* 칸 (SEED Bottom Navigation) — 선 아이콘 24px + 보조 글자 500.
   현재 칸은 채운 아이콘 + 진한 글자 700 — 모양·굵기·색이 함께 바뀐다(색 단독 금지). aria-current 로 스크린리더에도 알린다 */
.ui-bottom-nav a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-0-5);
  height: 100%;
  min-height: var(--tap-min);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--lh-caption);
  color: var(--ink-soft);
  text-align: center;
  transition: transform var(--duration-fast) var(--ease-press);
}
@media (prefers-reduced-motion: no-preference) {
  .ui-bottom-nav a:active { transform: scale(var(--press-scale-tight)); }
}
.ui-bottom-nav a[aria-current='page'] {
  color: var(--ink);
  font-weight: var(--weight-bold);
}
/* 긴급 칸 — 긴급 빨강 아이콘 + 글자로 다른 칸과 가른다(흰 바탕 5.88:1). 판정 상태 색과 섞이지 않는다 */
.ui-bottom-nav a.is-emergency {
  color: var(--emergency);
}
.ui-bottom-nav a.is-emergency[aria-current='page'] {
  color: var(--emergency-strong);
}
.ui-nav-icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
}
```

- [ ] **Step 6: 하단 내비 부품 (`components/ui/BottomNav.js`)**

6-a. 머리 주석 한 줄

```js
// - 현재 화면은 aria-current="page" + 포인트 색 + 굵기 + 알약 바탕 + 윗줄로 표시한다(색 단독 금지).
```
→
```js
// - 현재 화면은 aria-current="page" + 채운 아이콘 + 진한 글자 + 굵기로 표시한다(색 단독 금지 · SEED Bottom Navigation).
```

6-b. 아이콘 자리

```jsx
              <span className="ui-nav-pill">
                <Icon name={item.icon} size={22} />
              </span>
```
→
```jsx
              {/* 현재 칸은 채운 아이콘 — 선 아이콘과 모양이 달라 색 없이도 구분된다 */}
              <span className="ui-nav-icon">
                <Icon name={active === item.href ? `${item.icon}Fill` : item.icon} size={24} />
              </span>
```

- [ ] **Step 7: 채운 아이콘 (`components/ui/Icon.js`)**

7-a. 머리 주석 `// - 선 색은 currentColor — 글자 색을 따라가므로 대비는 글자 대비와 같다.` 줄 아래에

```js
// - 이름이 Fill 로 끝나면 채운 모양이다(하단 내비 현재 칸 — SEED 는 현재 칸을 채운 아이콘으로 보인다).
```

7-b. `phone: ( … ),` 항목 바로 뒤에

```jsx
  phoneFill: (
    <path
      fill="currentColor"
      d="M6.6 3.5h2.6l1.6 4.2-2.1 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.1 4.2 1.6v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"
    />
  ),
```

7-c. `navMore: ( … ),` 항목 바로 뒤에

```jsx
  navTodayFill: (
    <>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  navTripFill: (
    <>
      <path d="M8 3v3.5M16 3v3.5" />
      <path stroke="none" fill="currentColor" d="M6 4.5h12a3 3 0 0 1 3 3v2H3v-2a3 3 0 0 1 3-3Z" />
      <path stroke="none" fill="currentColor" d="M3 11h18v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />
    </>
  ),
  navConditionsFill: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2.5" fill="currentColor" />
      <circle cx="9" cy="12" r="2.5" fill="currentColor" />
      <circle cx="17" cy="17.5" r="2.5" fill="currentColor" />
    </>
  ),
  navMoreFill: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
    </>
  ),
```

- [ ] **Step 8: 옛 클래스가 남지 않았는지 본다**

```bash
grep -rn "ui-nav-pill" app components || echo "남은 곳 없음"
```

Expected: `남은 곳 없음`. 남은 곳이 있으면(시안 보드 화면 시안 등) 그 자리의 `ui-nav-pill`을 `ui-nav-icon`으로 바꾼다.

- [ ] **Step 9: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board-components.spec.js e2e/design-board.spec.js
```

Expected: PASS — 8 passed.

- [ ] **Step 10: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e 68건. 320px 가로 스크롤 없음(`responsive.spec.js`)이 상단 바 언어 버튼 글자가 14→16px 로 커져도 통과해야 한다 — 실패하면 멈추고 보고한다.

- [ ] **Step 11: 커밋**

```bash
git add app components e2e
git commit -m "$(cat <<'MSG'
style(design): 상단 바·하단 내비를 SEED 모양으로 — 선 없는 56px 바, 채운 아이콘 현재 칸

- 상단 바: 높이 56, 아래 선 없음, 제목 18/24 굵게, 뒤로 가기 44×44·모서리 8·투명 눌림.
- 언어 선택은 테두리 알약 대신 16px 글자 버튼. 고른 언어는 코발트 대신 회색 면 + 체크 + 굵게.
- 하단 내비: 알약 바탕·윗줄을 없애고 현재 칸은 채운 아이콘 + 진한 글자 700.
  긴급 칸은 빨간 알약 대신 긴급 빨강 아이콘 + 글자. 채운 아이콘 5개를 새로 그렸다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: 문서 — 디자인 시스템·설계서·상태

**Files:**
- Modify: `docs/platform/DESIGN_SYSTEM.md` (머리 기준일, 2.1 대비표, 2.2 글자표, 2.3 표, 3장 부품표, 5장 배지표, 7장, 8장)
- Modify: `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md` (5.9 뒤에 5.10 새 절)
- Modify: `docs/tracking/status.md` (한 줄)

**Interfaces:**
- Consumes: Task 1–7에서 실제로 들어간 값 — 문서 숫자는 코드와 같아야 한다. 적기 전에 `app/globals.css`·`app/styles/ui.css`에서 한 번 더 확인한다.
- Produces: 없음

- [ ] **Step 1: `DESIGN_SYSTEM.md` 머리**

`- 기준일: 2026-09-24 (SEED ①층 토큰 반영)` → `- 기준일: 2026-09-26 (SEED ②층 부품 반영)`

- [ ] **Step 2: 2.1 대비표 — `| \`--accent\` / \`--layer-basement\` | 4.78:1 | 본문 4.5 |` 행 바로 아래에**

```markdown
| `--ink` / `--pressed` · `--pressed-weak` (눌린 면 위 글자) | 16.05 · 14.83:1 | 본문 4.5 |
| `--ink-soft` / `--pressed` | 6.22:1 | 본문 4.5 |
| `--line-input` / `--pressed` (눌린 칩 테두리) | 3.22:1 | UI 3.0 |
| `--line-contrast` / `--surface-alt` (고른 칩 테두리) | 15.49:1 | UI 3.0 |
| `--ink-subtle` / `--surface-alt` (비활성 버튼 글자 — WCAG 예외지만 읽히도록 3:1) | 3.11:1 | UI 3.0 |
| `--selected` / `--bg` (고른 면·켠 스위치) | 13.31:1 | UI 3.0 |
| `--on-dark` / `--ink-subtle` (끈 스위치의 알맹이) | 3.42:1 | UI 3.0 |
| `--emergency` / `--bg` (긴급 칸 글자·입력 오류 도움말) | 5.88:1 | 본문 4.5 |
```

- [ ] **Step 3: 2.2 글자표**

`| \`--text-button\` | 16px / 22px | 버튼 (SEED 14px — 하한으로 올림). 큰 CTA 는 18px / 24px |` 행을 아래 세 행으로 바꾼다.

```markdown
| `--text-button` | 16px / 22px | 작은 버튼(44px) (SEED 14px — 하한으로 올림) |
| `--text-button-large` | 18px / 24px | 큰 CTA(52px 버튼)·긴급 버튼 |
| `--text-title-sheet` | 22px / 30px | 시트 제목 (SEED t8) |
```

- [ ] **Step 4: 2.3 표 — 네 행을 바꾼다 (첫 칸으로 찾는다)**

```markdown
| 모서리 (SEED) | `--radius-6` 배지 · `-8` 작은 버튼·아이콘 버튼 · `-10` 안내 상자·목록 행 눌림 · `-12` 큰 버튼·입력·선택 상자·날짜 칩 · `-16` 누르는 카드 · `-20` 대화상자 · `-24` 시트 · `-full` 칩·스위치·전환. 옛 `--radius-xs`·`-sm`·`--radius`·`-lg`·`-pill`은 ②층에서 옮기고 지웠다 |
| 그림자 | `--shadow-card` SEED s1 — 회색 바탕(`main.page.is-basement`) 안에서는 `none` · `--shadow-float` SEED s3(떠 있는 메뉴) · `--shadow-sheet` 없음(하단 바는 1px 윗선) |
| 움직임 | `--ease-out`(시트 애니메이션 등 기존 전환) · `--ease-color`(색 전환) · `--ease-press`(눌림 축소) · `--duration-fast` 150ms · `--duration` 200ms · `--press-scale-wide` 0.976 · `--press-scale-tight` 0.955(눌리면 2px 만큼 줄어든다 — 넓은 큰 버튼·목록 행 / 44px 칸). 눌림은 면 색만 바꾸고(`--pressed*`), 호버는 `(hover: hover) and (pointer: fine)`에서만 눌림과 같은 색. 축소는 `prefers-reduced-motion: no-preference`일 때만 |
| 포커스 | 모든 요소 `:focus-visible`은 `--focus-width`(2px) 코발트 윤곽선, 바깥 2px 띄움(상단 바 버튼·목록 행은 안쪽 −2px). 카드형 라디오·토글·답 칩은 안쪽 입력이 키보드 초점을 받을 때만(`:has(input:focus-visible)`) 칸 전체에 링. 글자 입력칸은 윤곽선 대신 2px `--line-contrast` 테두리. 짙은 면(주·critical·즉시 복귀 버튼, 긴급, 고른 날짜 칩) 위 링은 `--ink`. SEED 연한 파랑(#5e98fe, 2.9:1)은 하한 미달이라 코발트 유지 |
```

- [ ] **Step 5: 3장 부품표**

5-a. 여섯 행을 바꾼다(첫 칸으로 찾는다).

```markdown
| `Button` | `variant`(`primary`·`secondary`·`quiet`·`critical`), `size`(`normal`·`small`), `block`, `href`, `icon`, `disabled`, `loading`, `type` | SEED Action Button. 큰 CTA 52px·모서리 12·18/24, 작은 44px·모서리 8·16/22. 보조 = 회색 채움, 조용한 = 바탕 없는 글자, critical = 긴급 빨강(되돌릴 수 없는 확인). 채운 강조 버튼은 화면당 하나. `loading`은 눌린 색 + 회전 표시(`aria-busy`). `href`면 링크, 비활성 링크는 `aria-disabled` 버튼. 비활성은 투명도가 아니라 회색 면 + `--ink-subtle` 글자 |
| `Badge` | `kind`(5장), `label?` | 14/19·모서리 6·높이 28 안팎. 아이콘 + 면·테두리 모양 + 문구. `label`로 문구만 바꿀 수 있고 뜻이 다른 배지를 만들지 않는다 |
| `StateBanner` | `state`, `reasons`, `live?` | SEED Callout 모양(모서리 10·안쪽 14·아이콘 20·라벨 16, 1px 상태 선). 상태 라벨 + 아이콘 + 안전 문구 두 언어 병기 + 사유 목록. `live`면 갱신을 `aria-live="polite"`로 알린다 |
| `DateChip` | `date`, `state?`, `isToday?`, `selected?`, `hasAppointment?`, `href?`·`onClick?` | 60×92px·모서리 12. 고른 날 `--selected` 채움 + 흰 글자, '오늘'은 코발트 2px 테두리 + '오늘' 글자, 나머지 회색 면. 요일·날짜·상태 아이콘·병원 표시. 스크린리더에는 전체 날짜·오늘·상태·병원 일정을 한 문장으로 읽힌다 |
| `AnswerInput` | `legend`, `value`(`YES`·`NO`·`UNKNOWN`·`null`), `onChange`, `disallowUnknown?`, `hint?`, `disabled?`, `showMeaning?` | 예/아니오/모르겠음 — 44px 알약 칩(테두리 `--line-input` 3:1). 고르면 진한 테두리 + 회색 면 + 체크 + 굵게. `fieldset`+`legend`+표준 라디오. 고른 뒤 '아니오'(제한 없음)와 '모르겠음'(가장 엄격한 기본값)의 뜻을 한 줄로 보인다. 필수 항목은 '모르겠음' 없음 |
| `Sheet` | `title`, `onClose`, `showClose?`, `children`, `footer` | SEED Bottom Sheet — 위 모서리 24, 제목 22/30, 뒤 `--overlay`, 손잡이는 닫을 수 있는 시트에만. 열리면 포커스 이동·배경 잠금·Tab 가두기, 닫히면 이전 포커스로. Escape·닫기·확인·뒤로 가기 모두 `requestClose` 한 경로로 닫힌다(`lib/useModalSheet.js`). `showClose=false`는 즉시 복귀처럼 확인을 꼭 받는 안전 지시용(손잡이·닫기 없음) |
```

5-b. `PlaceCard` 행 끝의 `사진 위 글자는 흰 알약 위 |`를 `사진 위 글자는 흰 알약 위. 모서리 16·그림자 없음·1px \`--line-strong\` 테두리 |`로 바꾼다.

5-c. `TopBar`·`Icon` 두 행을 바꾼다.

```markdown
| `TopBar` | `title`, `titleLang?`, `backHref?`·`onBack?`, `backLabel?`, `as?`, `actions?` | SEED Top Navigation — 높이 56·선 없음, 제목(기본 h1) 18/24 굵게·좁으면 말줄임, 뒤로 가기 44×44·모서리 8, 언어 선택(8장) |
| `Icon` | `name`, `size?`, `strokeWidth?` | 인라인 SVG 선 아이콘(`ICON_NAMES`). 이름이 `Fill`로 끝나면 채운 모양(하단 내비 현재 칸). 상태 아이콘은 `STATE_ICON` |
```

5-d. `| \`EmptyState\` |` 행 바로 아래에 세 행을 더한다.

```markdown
| `AlertDialog` | `title`, `titleLang?`, `description?`, `cancelLabel`, `confirmLabel`, `critical?`, `busy?`, `onConfirm({ requestClose })`, `onClose` | SEED Alert Dialog — 272px·모서리 20, 버튼 둘(취소·확인), 되돌릴 수 없으면 `critical`. 바깥을 눌러도 닫히지 않는다. `role="alertdialog"`, 포커스 가두기·복원·뒤로 가기는 `lib/useModalSheet.js` |
| `ListItem` · `ListGroup` · `ListHeader` | `title`, `titleLang?`, `description?`, `leading?`, `trailing?`(`'chevron'`·노드), `href?`·`onClick?` / `label?` / `as?`, `id?` | SEED List Item — 위아래 12·좌우 16, 제목 16/22·설명 14/19 `--ink-soft`(한 줄 46·두 줄 66px). 누르면 좌우 6px 안으로 들어온 모서리 10 면. 반복 행 사이 1px 선 16px 들여씀. 행 안에서 따로 누를 것은 3개까지 |
| 클래스 `.ui-switch` · `.ui-block` · `main.page.is-basement` · `.hint.is-error` | — | 스위치(바로 적용되는 켬/끔, `role="switch"`, `.toggle-row` 라벨 안 — 끔 트랙 `--ink-subtle`), 흰 블록(화면 폭·8px 틈), 회색 바탕 층(그 안에서 카드 그림자 끔), 입력 오류 도움말(긴급 빨강, 입력은 `aria-invalid`) |
```

- [ ] **Step 6: 5장 배지표 — 세 행의 '모양' 칸**

```markdown
| `estimate` | 추정 / Estimate | 테두리 없는 회색 면, 물결(≈) 아이콘 | SafeHour가 추정한 값 — 이동·체류·보행 시간, 식이 판단, 예상 귀가 |
| `defaulted` | 기본값 적용 / Default applied | 분홍 면(테두리 없음), 방패 아이콘 | '모르겠음'에 가장 엄격한 기본값을 넣은 항목 |
| `hoursUnconfirmed` | 운영 확인 필요 / Check opening hours | 점선 테두리(`--line-input`), 흰 면, 물음표 시계 | 운영 여부를 단정할 수 없는 장소(열려 있다고 쓰지 않는다) |
```

(첫 칸 `estimate`·`defaulted`·`hoursUnconfirmed` 행을 찾아 통째로 바꾼다. `demo`·`readOnly` 행은 그대로.)

- [ ] **Step 7: 7장·8장 문장**

7-a. `현재 탭은 \`aria-current="page"\` + 포인트 색 + 굵기 + 알약 바탕 + 윗줄.` → `현재 탭은 \`aria-current="page"\` + 채운 아이콘 + \`--ink\` 글자 + 굵기(SEED Bottom Navigation — 알약 바탕·윗줄 없음). 긴급 칸은 긴급 빨강 아이콘 + 글자.`

7-b. `긴급 빨강 + 전화 아이콘 + '긴급 연락', 높이 48px.` → `긴급 빨강 채움 + 전화 아이콘 + '긴급 연락', 큰 CTA 모양(52px·모서리 12).`

7-c. `지구본 + 현재 언어 이름만 보이는 작은 버튼이고` → `지구본 + 현재 언어 이름을 적은 글자 버튼(테두리 없음·16px·높이 44)이고`

7-d. `선택된 언어는 체크 아이콘 + 굵기 + \`aria-pressed\`.` → `선택된 언어는 체크 아이콘 + 굵기 + 회색 면 + \`aria-pressed\`.`

- [ ] **Step 8: 설계서에 ②층에서 정한 것 (`docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`)**

`## 6. ③ 화면 배치 설계` 줄 바로 위에

```markdown
### 5.10 ②층 구현에서 정한 것 (2026-09-26)

②층 계획(`docs/superpowers/plans/2026-09-26-seed-layer2-components.md`)을 만들며 위 절과 다르게 간 곳이다.
안전 하한(4.7)과 부딪히면 하한을 따랐다.

| 무엇 | 위 절 | 실제 | 이유 |
| --- | --- | --- | --- |
| 답 칩·선택 상자 테두리 | 5.3 `--line-strong` | `--line-input` | 선택지 경계는 3:1 이상(4.7 입력 테두리). `--line-strong`은 흰 바탕 1.35:1 |
| 스위치 끔 트랙 | 5.3 `#b0b3ba` | `--ink-subtle` | `#b0b3ba`는 2.1:1 — 컴포넌트 경계 3:1 미달 |
| 눌림 축소 | 4.6 요소마다 `(basis−2)/basis` | `--press-scale-wide` 0.976 · `--press-scale-tight` 0.955 | CSS가 길이끼리 나누지 못해 두 단계로 근사 |
| 글자 입력칸 초점 | 4.6 코발트 윤곽선 | 2px `--line-contrast` 테두리만 | 5.2 입력칸 규칙과 두 표시가 겹치지 않게 |
| Segmented 미끄러짐 | 5.3 200ms 미끄러짐 | 색 전환 200ms | 미끄러지는 표시는 칸 위치를 재는 JS가 필요 |
| 상태 배너 | 5.6 Callout(테두리 없음) | 1px 상태 선 유지 | 회색 바탕 위에서 NO_TOURISM 면이 사라지지 않게 |
| 장소 카드 그림 | 5.5 Image Frame 모서리 8 | 카드 가장자리에 붙인 채 | 카드 구조를 바꾸지 않는다 — ③층 화면 확인에서 다시 본다 |
| 시트 손잡이 | 5.6 즉시 복귀는 손잡이 없이 닫기만 | 손잡이는 닫을 수 있는 시트에만, 즉시 복귀는 확인 버튼만(닫기 없음) | 즉시 복귀는 확인을 꼭 받는 안전 지시 — 닫기 버튼을 새로 붙이지 않는다 |
| 입력 오류 아이콘 | 5.2 글자 + 아이콘 | ②층은 글자색(`.hint.is-error`)만 | 오류 문구를 그리는 화면(③층)에서 붙인다 |
```

- [ ] **Step 9: 상태 문서 (`docs/tracking/status.md`)**

`- SEED 적용 ①층(토큰): …` 줄 바로 아래에

```markdown
- SEED 적용 ②층(부품): 버튼·입력·선택·배지·안내·시트·상단 바·하단 내비를 SEED 모양으로, 목록 행·흰 블록·스위치·확인 대화상자 부품 추가 — 계획서 `docs/superpowers/plans/2026-09-26-seed-layer2-components.md`
```

- [ ] **Step 10: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0(문서만 바뀌었으니 Task 7과 같은 결과), e2e 68건.

- [ ] **Step 11: 커밋**

```bash
git add docs/platform/DESIGN_SYSTEM.md docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md docs/tracking/status.md
git commit -m "$(cat <<'MSG'
docs: SEED ②층 부품을 디자인 시스템 문서·설계서·상태 문서에 반영한다

- DESIGN_SYSTEM.md: 새 토큰·대비 8짝·부품표(버튼 critical·loading, 새 AlertDialog·ListItem,
  스위치·흰 블록·회색 바탕 층 클래스), 배지 모양, 하단 내비·언어 선택 문장.
- 설계서 5.10: ②층에서 안전 하한 때문에 설계와 다르게 간 곳과 이유.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음 (확인 단계)

**Interfaces:**
- Consumes: 이 계획을 시작할 때의 커밋(작업 전)과 Task 8 뒤 커밋(작업 후)
- Produces: 운영자 승인 — ③층 계획을 쓰는 조건

- [ ] **Step 1: 작업 전·후 캡처를 연달아 만든다**

작업 공간 `.superpowers/sdd/2026-09-26-seed-layer2-components/evidence/`(git 제외)에 `before`(이 계획 시작 커밋을 잠시 `git checkout --detach`)와 `after`(브랜치 끝)를 `E2E_EVIDENCE_DIR=… npm run e2e`로 만든다. 두 번 모두 `npm run build`를 먼저 한다. 끝나면 반드시 브랜치로 돌아온다.

- [ ] **Step 2: 시안 보드 부품 절과 주요 화면을 나란히 보여 준다**

`22-design-board`(부품 절), `01-start`, `05-trip`, `06-today`, `09-delta-sheet`, `04-self-check`를 전후로 붙여 보여 준다. 한 줄씩 무엇이 바뀌었는지 적는다. **넘겨받은 것 10**: 고른 날짜 칩(`--selected` #2a3038)과 '즉시 복귀' 버튼(`--ink` #1a1c20)이 헷갈리지 않는지 운영자에게 따로 짚어 묻는다.

- [ ] **Step 3: 운영자 확인을 받는다**

승인 전에는 ③층을 시작하지 않는다. 고칠 곳을 말하면 해당 태스크 모양을 고치고 관문을 다시 돈다.

---

## 다음 계획

- **③층 화면 계획**은 이 계획의 Task 9 승인 뒤에 쓴다. 설계서 6.2 순서로 한 화면씩 — 화면마다 `main.page.is-basement` 켜기(회색 화면), 목록을 `ListItem`으로, 설정 알림을 `.ui-switch`로, 확인을 `AlertDialog`로, 흐름을 끝내는 버튼을 하단 고정 바로 옮기고 360px 전후 캡처로 확인받는다.
- 한 화면에서만 쓰는 모양은 ③층에서 그 화면의 기능 스타일 파일에 토큰으로 만든다: `/cards`의 카드 종류 Chip Tabs(설계서 5.3), 설정 언어의 Radio 행(5.3), 누르는 '변경됨' 알림(Callout actionable, 5.6), 입력 오류 아이콘(5.2), 로그인·개인정보 안내 상자의 아이콘(5.6), 필수/선택 표시(5.2).
- **③층으로 넘기는 것** (②층 최종 검토에서 나온 것):
  1. 독립 조용한 버튼(숙소·병원 삭제, '나중에', 보호자 새 링크, 하루 화면·이벤트 작은 버튼)이 버튼으로 보이지 않는다 — Task 9 운영자 결정에 따라 작은 보조 버튼 또는 `.link-button`으로 바꾼다.
  2. 답 칩을 고르면 체크가 글자 폭을 먹어 ja·zh 320px 에서 줄이 늘어난다(44→62·84px) — 체크를 겹쳐 그리거나 칸 폭을 조정한다.
  3. zh 320px 에서 온보딩 '上一步' 버튼이 줄바꿈되어 두 버튼이 74px 이 된다.
  4. 추정 배지는 테두리가 없어 회색 면(추정 영역·지난 날짜 행·③층 회색 화면) 위에서 칩 모양이 사라진다 — 회색 면 위 배지 모양을 정한다.
  5. 날짜 칩 눌림 색이 쉬는 색과 1.04:1 — 축소만 남는다.
  6. 강제 색상 모드(Windows 고대비)에서 스위치·고른 날짜 칩·전환이 배경에 기대어 사라진다 — `@media (forced-colors: active)` 대체를 스위치를 화면에 넣기 전에 만든다.
  7. `.medical-callout`(회색 면)은 회색 바탕 화면에서는 흰 블록(`.ui-block`) 안에만 둔다.
  8. `AlertDialog`는 `busy` 중에도 취소·Escape 로 닫힌다 — 실제 확인 흐름에 붙일 때 막는다.
  9. `.onboarding-chip`은 아직 코발트로 선택을 보이고 `:focus-within` 링이 마우스 클릭에도 뜬다.
  10. `AlertDialog`의 취소 닫기·Tab 가두기·포커스 복원, 언어 목록 고른 항목 모양을 재는 화면 테스트를 실제 흐름에 붙일 때 더한다.
