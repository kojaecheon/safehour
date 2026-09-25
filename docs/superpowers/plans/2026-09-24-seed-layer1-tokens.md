# SEED ①층 — 토큰 교체 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/globals.css` `:root`의 회색·글자·간격·모서리·그림자·움직임 토큰을 SEED 값으로 바꾸고 새 토큰을 더해, 화면 구조를 건드리지 않고 앱 전체를 SEED 쪽으로 한 번에 옮긴다.

**Architecture:** 토큰 **이름은 유지하고 값만** 바꾼다(모서리는 새 토큰을 더하기만 — 옮기는 건 ②층). 토큰 값과 WCAG 대비를 `node --test` 단위 테스트로 고정하고, 시안 보드의 대비 목록(`CONTRAST_GROUPS`)을 그 테스트가 그대로 불러와 보드와 테스트가 같은 짝을 검사하게 한다. 기존 화면 테스트의 캡처(`evidenceShot`)로 전후를 비교한다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · `node --test` · Playwright(e2e, 360px, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md` (특히 4장 토큰 설계, 4.7 안전 하한 표, 7장 관문)

## Global Constraints

- 새 패키지 설치 금지. `package.json`·`package-lock.json`을 수정하지 않는다.
- 글꼴은 시스템 글꼴만. 빌드·실행 중 내려받지 않는다.
- 토큰 정본은 `app/globals.css` `:root` 한 곳. 기능별 스타일(`app/styles/*.css`)에 hex 색을 쓰지 않는다.
- 문구는 `src/i18n/messages/`에만, 4개 언어(ko·en·ja·zh) 모두.
- 대비: 글자 4.5:1 이상, UI 경계·아이콘 3:1 이상(WCAG 2.1 AA). 본문 16px 이상, 터치 44px 이상.
- 이 층에서는 **화면 바탕을 바꾸지 않는다**(회색 바탕은 ③층). 카드 그림자는 없애지 않고 SEED s1로 줄인다(설계서 4.5).
- 판정·저장·API 코드는 건드리지 않는다.
- 커밋은 로컬에만. push·병합·배포 금지. 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 관문: `npm run lint` · `npm test` · `npm run build` · `npm run e2e` 모두 exit 0. e2e는 빌드 결과를 띄우므로 **build 뒤에** 돌린다.
- 전후 캡처는 저장소 밖에 둔다(커밋하지 않는다). 명령마다 먼저
  `export SEED_EVIDENCE=/private/tmp/claude-501/-Users-macddiwoo-Documents-Claude-Projects-Safehour--claude-worktrees-mystifying-mclaren-a495e5/d5596f4f-5a2a-4a1c-b778-8cd5b1b82940/scratchpad/seed-l1` 를 실행한다(셸 상태가 명령 사이에 이어지지 않는다).
- 화면 테스트 수: 지금 62건. 이 계획은 기존 테스트에 단언만 더하므로 건수는 그대로다.

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/globals.css` | 토큰 정본(`:root`, 27–172행)과 전역 규칙 | 토큰 값 교체·추가, 초점 링 두께 |
| `test/design-tokens.test.js` | 토큰 값·대비 계약 | **새로 만든다** |
| `app/design-board/demoData.js` | 시안 보드 고정 데이터 — 대비 짝·간격·모서리 목록 | 새 짝·새 토큰 목록 추가 |
| `app/design-board/DesignBoard.js` | 시안 보드 — 대비를 브라우저에서 계산해 통과/미달 표시 | 판정에 `data-verdict` 붙이기 |
| `src/i18n/messages/designBoard.js` | 시안 보드 문구 | 새 대비 묶음 이름 |
| `e2e/design-board.spec.js` | 시안 보드 화면 테스트 | '미달 0개' 단언 추가 |
| `docs/platform/DESIGN_SYSTEM.md` | 디자인 시스템 문서 — 2장 토큰·대비표 | 새 값으로 갱신 |

---

### Task 1: 토큰 계약 테스트와 `:root` 값 교체

**Files:**
- Create: `test/design-tokens.test.js`
- Modify: `app/globals.css:27-172` (`:root`), `app/globals.css:407-410` (`:focus-visible`)
- Modify: `app/design-board/demoData.js:8-63` (`CONTRAST_GROUPS`)
- Modify: `src/i18n/messages/designBoard.js` (새 묶음 이름 1개)

**Interfaces:**
- Consumes: 없음
- Produces: 새 토큰 이름 — ②·③층 계획이 이 이름을 쓴다.
  `--layer-basement` `--layer-default` `--layer-floating` `--pressed` `--pressed-weak` `--pressed-transparent`
  `--ink-subtle` `--selected` `--selected-pressed` `--line-section` `--line-contrast` `--overlay`
  `--lh-display` `--lh-title-1` `--lh-title-2` `--lh-title-3` `--lh-body` `--lh-article` `--lh-caption`
  `--space-0-5` `--space-1-5` `--space-14` `--gap-component` `--gap-text` `--gap-nav-to-title` `--gap-screen-bottom` `--gap-section`
  `--radius-6` `--radius-8` `--radius-10` `--radius-12` `--radius-16` `--radius-20` `--radius-24` `--radius-full`
  `--ease-color` `--ease-press` `--focus-width`

- [ ] **Step 1: 바꾸기 전 화면 캡처를 남긴다**

값을 바꾸기 전에 기존 e2e가 남기는 캡처 23장을 받아 둔다(Task 3에서 전후 비교에 쓴다).

```bash
export SEED_EVIDENCE=/private/tmp/claude-501/-Users-macddiwoo-Documents-Claude-Projects-Safehour--claude-worktrees-mystifying-mclaren-a495e5/d5596f4f-5a2a-4a1c-b778-8cd5b1b82940/scratchpad/seed-l1
mkdir -p "$SEED_EVIDENCE/before"
npm run build
E2E_EVIDENCE_DIR="$SEED_EVIDENCE/before" npm run e2e
ls "$SEED_EVIDENCE/before" | wc -l
```

Expected: e2e `62 passed`, 캡처 파일 23개 안팎(`01-start.png` … `23-design-board-320.png`). 실패가 있으면 멈추고 보고한다 — 바꾸기 전 기준선이 깨져 있으면 전후 비교가 의미 없다.

- [ ] **Step 2: 실패하는 토큰 계약 테스트를 쓴다**

`test/design-tokens.test.js`:

```js
// SEED ①층 토큰 계약 (설계서 docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md 4장)
//
// app/globals.css 의 :root 를 읽어 토큰 값과 WCAG 2.1 대비를 고정한다.
// 대비 짝은 시안 보드와 같은 목록(app/design-board/demoData.js CONTRAST_GROUPS)을 불러와 쓴다 —
// 보드가 화면에 보여 주는 판정과 이 테스트의 판정이 같은 짝을 본다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONTRAST_GROUPS } from '../app/design-board/demoData.js';

const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

/** 첫 `:root { … }` 블록 — 중괄호 깊이로 끝을 찾는다 */
function rootBlock(text) {
  const start = text.indexOf(':root {');
  assert.ok(start >= 0, ':root 블록이 없다');
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(':root 블록이 닫히지 않았다');
}

function parseTokens(block) {
  const body = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    map.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return map;
}

const TOKENS = parseTokens(rootBlock(css));

/** var(--x) 를 끝까지 따라가 실제 값을 돌려준다 */
function value(name, seen = new Set()) {
  assert.ok(!seen.has(name), `토큰 순환: ${name}`);
  seen.add(name);
  const raw = TOKENS.get(name);
  if (raw === undefined) return undefined;
  const m = raw.match(/^var\((--[a-z0-9-]+)\)$/i);
  return m ? value(m[1], seen) : raw;
}

function rgb(color) {
  const v = String(color).trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (m) {
    assert.ok(m[4] === undefined || Number(m[4]) === 1, `대비 짝에는 불투명 색만 쓴다: ${color}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  throw new Error(`색으로 읽을 수 없다: ${color}`);
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(rgb(fg)), luminance(rgb(bg))].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe('회색 체계 — SEED 값 (설계서 4.1)', () => {
  test('기존 회색 토큰이 SEED 값으로 바뀌었다', () => {
    assert.equal(value('--ink'), '#1a1c20');
    assert.equal(value('--ink-soft'), '#555d6d');
    assert.equal(value('--surface-alt'), '#f3f4f5');
    assert.equal(value('--line'), 'rgba(0, 0, 0, 0.047)');
    assert.equal(value('--line-strong'), '#dcdee3');
    assert.equal(value('--line-input'), '#868b94');
  });

  test('층·눌림·선택 토큰이 새로 있다', () => {
    const expected = {
      '--layer-basement': '#f3f4f5',
      '--layer-default': '#ffffff',
      '--layer-floating': '#ffffff',
      '--pressed': '#f7f8f9',
      '--pressed-weak': '#eeeff1',
      '--pressed-transparent': 'rgba(0, 0, 0, 0.027)',
      '--ink-subtle': '#868b94',
      '--selected': '#2a3038',
      '--selected-pressed': '#555d6d',
      '--line-section': 'rgba(0, 0, 0, 0.063)',
      '--line-contrast': '#1a1c20',
      '--overlay': 'rgba(0, 0, 0, 0.455)',
    };
    for (const [name, v] of Object.entries(expected)) assert.equal(value(name), v, name);
  });

  test('코발트·분홍·긴급·상태·출처 색은 그대로다 (운영자 결정)', () => {
    const kept = {
      '--bg': '#ffffff',
      '--surface': '#ffffff',
      '--accent': '#0a5cff',
      '--accent-strong': '#0046d1',
      '--accent-soft': '#eaf1ff',
      '--support': '#ff7aa2',
      '--support-soft': '#ffe9f0',
      '--support-ink': '#a3134a',
      '--emergency': '#c8102e',
      '--emergency-strong': '#a50d26',
      '--state-together-bg': '#e6f6ec',
      '--state-together-ink': '#11693a',
      '--state-split-bg': '#f1ecfe',
      '--state-split-ink': '#5b2db0',
      '--state-standby-bg': '#fff4d9',
      '--state-standby-ink': '#7a4a00',
      '--state-no-tourism-bg': '#eef1f6',
      '--state-no-tourism-ink': '#334055',
      '--source-hospital': '#0e6f78',
      '--source-hospital-bg': '#eef7f8',
      '--badge-readonly-bg': '#334055',
    };
    for (const [name, v] of Object.entries(kept)) assert.equal(value(name), v, name);
  });
});

describe('글자 — SEED 단계 (설계서 4.2)', () => {
  test('크기', () => {
    assert.equal(value('--text-display'), '26px');
    assert.equal(value('--text-title-1'), '24px');
    assert.equal(value('--text-title-2'), '20px');
    assert.equal(value('--text-title-3'), '18px');
    assert.equal(value('--text-body'), '16px');
    assert.equal(value('--text-button'), '16px');
    assert.equal(value('--text-caption'), '14px');
    assert.equal(value('--text-korean-card'), '30px', '한국어 카드는 예외로 유지');
  });

  test('줄 높이 — 비율은 SEED 짝에 맞추고 px 짝은 새 토큰', () => {
    assert.equal(value('--leading-tight'), '1.33');
    assert.equal(value('--leading-snug'), '1.375');
    assert.equal(value('--leading-body'), '1.5');
    const px = {
      '--lh-display': '35px',
      '--lh-title-1': '32px',
      '--lh-title-2': '27px',
      '--lh-title-3': '24px',
      '--lh-body': '22px',
      '--lh-article': '24px',
      '--lh-caption': '19px',
    };
    for (const [name, v] of Object.entries(px)) assert.equal(value(name), v, name);
  });

  test('굵기는 400·500·700뿐이고 자간이 없다', () => {
    assert.equal(value('--weight-heavy'), '700');
    assert.equal(value('--tracking-tight'), 'normal');
  });

  test('본문 하한 — 본문·버튼 16px 미만 금지', () => {
    assert.ok(parseFloat(value('--text-body')) >= 16);
    assert.ok(parseFloat(value('--text-button')) >= 16);
  });
});

describe('간격·모서리·그림자·움직임 (설계서 4.3–4.6)', () => {
  test('간격 — 새 단계와 의미 토큰', () => {
    const expected = {
      '--space-0-5': '2px',
      '--space-1-5': '6px',
      '--space-14': '56px',
      '--gap-component': 'var(--space-3)',
      '--gap-text': 'var(--space-1-5)',
      '--gap-nav-to-title': 'var(--space-5)',
      '--gap-screen-bottom': 'var(--space-14)',
      '--gap-section': 'var(--space-2)',
    };
    for (const [name, v] of Object.entries(expected)) assert.equal(TOKENS.get(name), v, name);
    assert.equal(value('--gutter'), '16px');
    assert.equal(value('--tap-min'), '44px');
  });

  test('모서리 — SEED 단계 토큰을 더했고 기존 토큰은 ②층까지 남아 있다', () => {
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
      assert.ok(TOKENS.has(old), `${old} 는 ②층에서 옮긴 뒤 지운다`);
    }
  });

  test('그림자 — 카드는 s1(①층 한정), 떠 있는 것은 s3, 하단 바는 없음', () => {
    assert.equal(value('--shadow-card'), '0 1px 4px 0 rgba(0, 0, 0, 0.078)');
    assert.equal(value('--shadow-float'), '0 4px 16px 0 rgba(0, 0, 0, 0.122)');
    assert.equal(value('--shadow-sheet'), 'none');
  });

  test('움직임·초점', () => {
    assert.equal(value('--duration-fast'), '150ms');
    assert.equal(value('--ease-color'), 'cubic-bezier(0.35, 0, 0.35, 1)');
    assert.equal(value('--ease-press'), 'cubic-bezier(0, 0, 0.15, 1)');
    assert.equal(value('--focus-width'), '2px');
  });

  test('초점 링은 --focus-width 두께의 코발트다', () => {
    const rule = css.match(/^:focus-visible\s*\{([^}]*)\}/m);
    assert.ok(rule, ':focus-visible 규칙이 있다');
    assert.match(rule[1], /outline:\s*var\(--focus-width\)\s+solid\s+var\(--accent\)/);
  });
});

describe('대비 — 시안 보드와 같은 짝 (WCAG 2.1 AA)', () => {
  for (const group of CONTRAST_GROUPS) {
    for (const pair of group.pairs) {
      if (pair.decorative || !pair.fg) continue;
      const min = pair.ui ? 3 : 4.5;
      test(`${pair.fg} / ${pair.bg} ≥ ${min}:1`, () => {
        const fg = value(pair.fg);
        const bg = value(pair.bg);
        assert.ok(fg && bg, `토큰이 없다: ${pair.fg}=${fg}, ${pair.bg}=${bg}`);
        const ratio = contrast(fg, bg);
        assert.ok(ratio >= min, `${pair.fg}(${fg}) / ${pair.bg}(${bg}) = ${ratio.toFixed(2)}:1 < ${min}:1`);
      });
    }
  }

  test('회색 바탕·선택·아이콘 짝이 목록에 들어 있다', () => {
    const all = CONTRAST_GROUPS.flatMap((g) => g.pairs).map((p) => `${p.fg}|${p.bg}`);
    for (const needed of [
      '--ink|--layer-basement',
      '--ink-soft|--layer-basement',
      '--accent|--layer-basement',
      '--on-dark|--selected',
      '--line-input|--layer-basement',
      '--ink-subtle|--bg',
      '--line-contrast|--bg',
    ]) {
      assert.ok(all.includes(needed), `대비 목록에 ${needed} 가 없다`);
    }
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 본다**

Run: `node --test test/design-tokens.test.js`
Expected: FAIL — 첫 실패 예: `'#121826' !== '#1a1c20'`, 그리고 `대비 목록에 --ink|--layer-basement 가 없다`.

- [ ] **Step 4: `:root` 값을 바꾼다 (`app/globals.css`)**

아래를 **정확히 찾아 바꾼다**. 주석의 대비 수치도 새 값에 맞춘다.

4-a. 바탕 (30–33행 — 아래 단계는 줄이 밀리므로 글자로 찾아 바꾼다):

```css
  /* ── 바탕 ── */
  --bg: #ffffff;            /* 페이지 바탕 — 흰색 */
  --surface: #ffffff;       /* 카드 면 */
  --surface-alt: #f3f5f9;   /* 묶음·눌린 면. --ink 16.24:1, --ink-soft 6.90:1 */
```

→

```css
  /* ── 바탕 ── */
  --bg: #ffffff;            /* 페이지 바탕 — 흰색 */
  --surface: #ffffff;       /* 카드 면 */
  --surface-alt: #f3f4f5;   /* SEED bg.neutral-weak — 채운 보조 버튼·선택 칸 바탕. --ink 15.49:1, --ink-soft 6.01:1 */

  /* ── 층 (SEED) — 구역이 여럿인 화면은 회색 바탕 위에 흰 블록을 쌓는다(바탕은 ③층에서 화면별로 켠다) ── */
  --layer-basement: #f3f4f5;          /* SEED bg.layer-basement — 화면 바탕 */
  --layer-default: #ffffff;           /* SEED bg.layer-default — 흰 블록·목록·상단 바 */
  --layer-floating: #ffffff;          /* SEED bg.layer-floating — 시트·대화상자 */
  --pressed: #f7f8f9;                 /* SEED bg.layer-default-pressed — 흰 면 위 눌림 */
  --pressed-weak: #eeeff1;            /* SEED bg.neutral-weak-pressed — 회색 채움 눌림 */
  --pressed-transparent: rgba(0, 0, 0, 0.027); /* SEED bg.transparent-pressed — 바탕 없는 요소의 눌림 */
  --selected: #2a3038;                /* SEED bg.neutral-inverted — '선택됨' 채움. 흰 글자 13.31:1 */
  --selected-pressed: #555d6d;        /* SEED bg.neutral-inverted-pressed */
  --overlay: rgba(0, 0, 0, 0.455);    /* SEED bg.overlay — 시트·대화상자 뒤 */
```

4-b. 글자 (35–37행):

```css
  /* ── 글자 ── */
  --ink: #121826;           /* 본문. 흰 바탕 17.73:1 */
  --ink-soft: #4b5565;      /* 보조 글자. 흰 바탕 7.54:1, --surface-alt 6.90:1, --accent-soft 6.65:1 */
```

→

```css
  /* ── 글자 ── */
  --ink: #1a1c20;           /* SEED fg.neutral — 본문. 흰 바탕 17.06:1, 회색 바탕 15.49:1 */
  --ink-soft: #555d6d;      /* SEED fg.neutral-muted — 보조 글자. 흰 바탕 6.62:1, 회색 바탕 6.01:1, --accent-soft 5.84:1 */
  --ink-subtle: #868b94;    /* SEED fg.neutral-subtle — **아이콘·화살표·비활성 글자 전용**. 흰 바탕 3.42:1 — 글자 기준 미달이라 읽어야 하는 글자에 쓰지 않는다 */
```

4-c. 경계 (40–42행):

```css
  --line: #e3e7ee;          /* 장식용 구분선 (정보 전달 없음) */
  --line-strong: #c9d0dc;   /* 장식용 카드 테두리 (정보 전달 없음) */
  --line-input: #7b8497;    /* 입력 필드·선택지 경계 — 흰 바탕 3.76:1, --surface-alt 3.44:1 (WCAG 1.4.11 ≥3:1) */
```

→

```css
  --line: rgba(0, 0, 0, 0.047);          /* SEED stroke.neutral-subtle — 반복 항목 구분선 (장식) */
  --line-section: rgba(0, 0, 0, 0.063);  /* SEED stroke.neutral-muted — 구역 경계, 화면당 1–2개 (장식) */
  --line-strong: #dcdee3;                /* SEED stroke.neutral-weak — 카드·테두리 버튼 (장식) */
  --line-input: #868b94;                 /* 입력 필드·선택지 경계 — 흰 바탕 3.42:1, 회색 바탕 3.11:1 (WCAG 1.4.11 ≥3:1).
                                            SEED 는 #dcdee3(1.3:1)이라 하한에 맞춰 gray-700 으로 올렸다 (설계서 4.7) */
  --line-contrast: #1a1c20;              /* SEED stroke.neutral-contrast — 입력 초점·고른 칸 테두리 */
```

4-d. 글자 크기·줄 높이·굵기 (113–128행, `--text-display`부터 `--tracking-tight`까지):

```css
  --text-display: 30px;
  --text-title-1: 24px;
  --text-title-2: 20px;
  --text-title-3: 18px;
  --text-body: 16px;
  --text-button: 17px;
  --text-caption: 14px;
  --text-korean-card: 30px; /* 한국어 안내 카드 본문 — 멀리서도 읽힌다 */
  --leading-tight: 1.25;
  --leading-snug: 1.4;
  --leading-body: 1.6;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;
  --weight-heavy: 800;
  --tracking-tight: -0.02em;
```

→

```css
  --text-display: 26px;     /* SEED t10 · screenTitle */
  --text-title-1: 24px;     /* SEED t9 */
  --text-title-2: 20px;     /* SEED t7 */
  --text-title-3: 18px;     /* SEED t6 — 상단 바 제목 */
  --text-body: 16px;        /* SEED t5 — 본문 최소 */
  --text-button: 16px;      /* SEED medium 버튼은 14px — 하한 16px 로 올림 (설계서 4.7). 큰 CTA 는 부품이 18px 을 쓴다 */
  --text-caption: 14px;     /* SEED t4 */
  --text-korean-card: 30px; /* 한국어 안내 카드 본문 — 멀리서도 읽힌다 (SEED 예외) */
  /* 줄 높이 비율 — 어떤 크기에도 쓰이므로 비율로 둔다. SEED 짝(24/32 · 16/22 · 16/24)에 맞췄다 */
  --leading-tight: 1.33;
  --leading-snug: 1.375;
  --leading-body: 1.5;
  /* 줄 높이 px 짝 — 버튼·입력·목록 행처럼 높이가 정확해야 하는 부품용 */
  --lh-display: 35px;
  --lh-title-1: 32px;
  --lh-title-2: 27px;
  --lh-title-3: 24px;
  --lh-body: 22px;
  --lh-article: 24px;
  --lh-caption: 19px;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;
  --weight-heavy: 700;      /* SEED 굵기는 400·500·700 뿐 — 800 을 쓰던 자리는 700 이 된다 */
  --tracking-tight: normal; /* SEED 에는 자간 토큰이 없다 */
```

4-e. 간격 (`--space-12` 다음 줄에 더한다):

```css
  --space-12: 48px;
```

→

```css
  --space-12: 48px;
  --space-0-5: 2px;
  --space-1-5: 6px;
  --space-14: 56px;
  /* 의미 간격 (SEED spacing-y) */
  --gap-component: var(--space-3);        /* 부품 사이 기본 12px */
  --gap-text: var(--space-1-5);           /* 글자 덩어리 사이 6px */
  --gap-nav-to-title: var(--space-5);     /* 상단 바 → 첫 제목 20px */
  --gap-screen-bottom: var(--space-14);   /* 화면 끝 56px */
  --gap-section: var(--space-2);          /* 회색 바탕 위 흰 블록 사이 8px */
```

4-f. 모서리 (`--radius-pill` 다음 줄에 더한다 — 기존 다섯 개는 그대로 둔다):

```css
  --radius-pill: 999px; /* 알약 버튼·긴급 버튼 */
```

→

```css
  --radius-pill: 999px; /* 알약 버튼·긴급 버튼 */
  /* SEED 모서리 단계 — ②층에서 부품마다 이 토큰으로 옮기고, 다 옮기면 위의 다섯 개를 지운다 */
  --radius-6: 6px;       /* r1_5 — 배지 */
  --radius-8: 8px;       /* r2 — 작은 버튼(44px)·상단 바 아이콘 버튼·그림 틀 */
  --radius-10: 10px;     /* r2_5 — 안내 상자·목록 행 눌림 */
  --radius-12: 12px;     /* r3 — 큰 버튼·입력칸·Select Box·날짜 칩 */
  --radius-16: 16px;     /* r4 — 누르는 카드·뼈대 */
  --radius-20: 20px;     /* r5 — 대화상자 */
  --radius-24: 24px;     /* r6 — 시트 위 모서리 */
  --radius-full: 9999px; /* full — 칩·스위치·Segmented Control */
```

4-g. 그림자 (세 줄 교체):

```css
  --shadow-card: 0 1px 2px rgba(18, 24, 38, 0.05), 0 6px 20px -8px rgba(18, 24, 38, 0.14);
  --shadow-float: 0 2px 6px rgba(18, 24, 38, 0.08), 0 12px 32px -8px rgba(18, 24, 38, 0.28);
  --shadow-sheet: 0 -8px 32px -8px rgba(18, 24, 38, 0.25);
```

→

```css
  /* SEED 는 그림자 대신 바탕 층으로 구분한다. 카드 그림자는 ①층에서는 가장 약한 s1 로만 줄이고,
     화면이 회색 바탕 + 흰 블록으로 바뀌는 ③층에서 화면마다 없앤다 (설계서 4.5) */
  --shadow-card: 0 1px 4px 0 rgba(0, 0, 0, 0.078);   /* SEED s1 — ①층 한정 */
  --shadow-float: 0 4px 16px 0 rgba(0, 0, 0, 0.122); /* SEED s3 — 떠 있는 메뉴 */
  --shadow-sheet: none;                               /* 하단 내비·하단 바는 1px 윗선으로 구분한다 */
```

4-h. 움직임 (세 줄 교체, `--focus-width` 추가):

```css
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --duration-fast: 120ms;
  --duration: 200ms;
```

→

```css
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-color: cubic-bezier(0.35, 0, 0.35, 1);   /* SEED 색 전환 */
  --ease-press: cubic-bezier(0, 0, 0.15, 1);      /* SEED 눌림 축소 */
  --duration-fast: 150ms;                         /* SEED 색 전환·눌림 */
  --duration: 200ms;
  --focus-width: 2px;                             /* SEED 초점 링 두께 — 색은 코발트 유지(설계서 4.7) */
```

4-i. 초점 링 (407–410행 — 앞의 교체로 줄이 밀리므로 `^:focus-visible {` 로 찾는다):

```css
:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
```

→

```css
:focus-visible {
  outline: var(--focus-width) solid var(--accent);
  outline-offset: 2px;
}
```

4-j. `--ink` 가 바뀌어 달라진 대비 주석 두 곳을 고친다(값은 그대로):

```css
  --support-soft: #ffe9f0;  /* --support-ink 6.56:1, --ink 15.34:1 */
```
→
```css
  --support-soft: #ffe9f0;  /* --support-ink 6.56:1, --ink 14.76:1 */
```

```css
  --badge-demo-stripe-a: #fff3cc;  /* 데모 띠 무늬 — --ink 16.00:1 */
  --badge-demo-stripe-b: #ffe7a3;  /*                --ink 14.53:1 */
```
→
```css
  --badge-demo-stripe-a: #fff3cc;  /* 데모 띠 무늬 — --ink 15.39:1 */
  --badge-demo-stripe-b: #ffe7a3;  /*                --ink 13.98:1 */
```

- [ ] **Step 5: 시안 보드 대비 목록에 새 짝을 더한다 (`app/design-board/demoData.js`)**

`CONTRAST_GROUPS` 배열의 `groupBase` 묶음 바로 뒤에 새 묶음을 넣는다:

```js
  {
    key: 'designBoard.groupLayer',
    pairs: [
      { fg: '--ink', bg: '--layer-basement' },
      { fg: '--ink-soft', bg: '--layer-basement' },
      { fg: '--accent', bg: '--layer-basement' },
      { fg: '--line-input', bg: '--layer-basement', ui: true },
      { fg: '--on-dark', bg: '--selected' },
      { fg: '--ink-subtle', bg: '--bg', ui: true },
      { fg: '--line-contrast', bg: '--bg', ui: true },
    ],
  },
```

- [ ] **Step 6: 새 묶음 이름을 문구 사전에 더한다 (`src/i18n/messages/designBoard.js`)**

`'designBoard.groupEmergency'` 줄 바로 위에:

```js
  'designBoard.groupLayer': { ko: '층·선택·아이콘 (SEED)', en: 'Layers, selection and icons (SEED)', ja: 'レイヤー・選択・アイコン（SEED）', zh: '层级、选中与图标（SEED）' },
```

- [ ] **Step 7: 테스트가 통과하는지 본다**

Run: `node --test test/design-tokens.test.js`
Expected: PASS — 모든 describe 통과, 실패 0.

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: lint exit 0 · `ℹ fail 0`(1,680건 + 새 테스트) · build exit 0 · e2e `62 passed`.
e2e 접근성(axe) 실패가 나오면 새 회색 값 때문이다 — 실패 메시지의 선택자와 색을 보고 해당 토큰 짝을 Step 2 테스트에 추가한 뒤 값을 고친다. 테스트를 느슨하게 하지 않는다.

- [ ] **Step 9: 커밋**

```bash
git add app/globals.css test/design-tokens.test.js app/design-board/demoData.js src/i18n/messages/designBoard.js
git commit -m "$(cat <<'MSG'
style(design): SEED ①층 — 회색·글자·간격·모서리·그림자 토큰 교체

토큰 이름은 그대로 두고 값만 SEED 로 바꿨다. 화면 구조는 건드리지 않는다.
- 회색: 본문 #1a1c20 · 보조 #555d6d · 구분선 반투명 · 입력 테두리 #868b94(하한)
- 새 토큰: 층(바탕·흰 블록·떠 있는 면)·눌림·선택(#2a3038)·아이콘 전용 회색
- 글자: 큰 제목 26px, 버튼 16px, 굵기 800->700, 자간 없음, px 줄 높이 짝
- 모서리: SEED 단계 토큰 추가(옮기기는 ②층)
- 그림자: 카드는 s1 로만 줄임(없애기는 ③층), 하단 바는 윗선
- 초점 링 2px 코발트
코발트·분홍·상태 4색·긴급 빨강은 값 유지. 토큰 값과 대비를 단위 테스트로 고정했다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 시안 보드 토큰 절·대비 판정 테스트·설계 문서

**Files:**
- Modify: `app/design-board/DesignBoard.js:166-169` (`Swatch` 판정 문단)
- Modify: `app/design-board/demoData.js:76-78` (`SPACING`·`RADII` 목록)
- Modify: `e2e/design-board.spec.js` (첫 테스트에 단언 추가)
- Modify: `docs/platform/DESIGN_SYSTEM.md` (2장 토큰 표·대비표)

**Interfaces:**
- Consumes: Task 1의 새 토큰 이름
- Produces: 시안 보드 판정 문단의 `data-verdict="pass" | "fail" | "decorative" | "measuring"` 속성 — ②층 부품 테스트도 이 보드를 쓴다

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/design-board.spec.js`)**

첫 테스트의 `await expectNoHorizontalScroll(page, '/design-board');` 바로 위에 넣는다:

```js
    // 대비 판정 — 보드가 브라우저에서 토큰 값을 읽어 계산한다. 미달 판정이 하나도 없어야 한다(설계서 4.7)
    const verdicts = page.locator('[data-verdict]');
    await expect(verdicts.first()).toBeVisible();
    await expect(page.locator('[data-verdict="measuring"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict="fail"]')).toHaveCount(0);
    expect(await page.locator('[data-verdict="pass"]').count()).toBeGreaterThanOrEqual(30);
    // SEED 층 짝이 보드에 그려진다
    await expect(page.getByRole('heading', { name: '층·선택·아이콘 (SEED)', level: 3 })).toBeVisible();
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board.spec.js
```

Expected: FAIL — `[data-verdict]` 요소가 없다(`toBeVisible` 시간 초과).

- [ ] **Step 3: 판정 문단에 `data-verdict`를 붙인다 (`app/design-board/DesignBoard.js`)**

`Swatch` 안의 판정 부분을:

```jsx
      {pair.decorative ? (
        <p className="designBoard-verdict">{t('designBoard.decorative')}</p>
      ) : (
        <p className={passed ? 'designBoard-verdict is-pass' : 'designBoard-verdict'}>
```

→

```jsx
      {pair.decorative ? (
        <p className="designBoard-verdict" data-verdict="decorative">{t('designBoard.decorative')}</p>
      ) : (
        <p
          className={passed ? 'designBoard-verdict is-pass' : 'designBoard-verdict'}
          data-verdict={ratio === null ? 'measuring' : passed ? 'pass' : 'fail'}
        >
```

- [ ] **Step 4: 간격·모서리 견본 목록에 새 토큰을 넣는다 (`app/design-board/demoData.js`)**

```js
export const SPACING = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12'];
export const RADII = ['--radius-xs', '--radius-sm', '--radius', '--radius-lg', '--radius-pill'];
```

→

```js
export const SPACING = [
  '--space-0-5', '--space-1', '--space-1-5', '--space-2', '--space-3', '--space-4', '--space-5',
  '--space-6', '--space-8', '--space-10', '--space-12', '--space-14',
];
/** SEED 모서리 단계 — 기존 다섯 개(--radius-xs … --radius-pill)는 ②층에서 옮긴 뒤 지운다 */
export const RADII = ['--radius-6', '--radius-8', '--radius-10', '--radius-12', '--radius-16', '--radius-20', '--radius-24', '--radius-full'];
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/design-board.spec.js
```

Expected: PASS — `2 passed`.

- [ ] **Step 6: 설계 문서를 새 값으로 고친다 (`docs/platform/DESIGN_SYSTEM.md` 2장)**

2.1 색 표에서 아래 행들을 바꾼다(다른 행은 그대로):

```markdown
| 바탕 | `--bg` · `--surface` · `--surface-alt` | `#ffffff` · `#ffffff` · `#f3f5f9` | 페이지 · 카드 면 · 묶음·눌린 면 |
| 글자 | `--ink` · `--ink-soft` | `#121826` · `#4b5565` | 본문 · 보조 글자 |
| 경계 | `--line` · `--line-strong` · `--line-input` | `#e3e7ee` · `#c9d0dc` · `#7b8497` | 장식 구분선 · 장식 카드 테두리 · **입력·선택지 경계(정보 전달)** |
```

→

```markdown
| 바탕 | `--bg` · `--surface` · `--surface-alt` | `#ffffff` · `#ffffff` · `#f3f4f5` | 페이지 · 카드 면 · 채운 보조 버튼·선택 칸(SEED bg.neutral-weak) |
| 층 (SEED) | `--layer-basement` · `--layer-default` · `--layer-floating` | `#f3f4f5` · `#ffffff` · `#ffffff` | 구역이 여럿인 화면의 바탕 · 흰 블록 · 시트·대화상자 |
| 눌림·선택 (SEED) | `--pressed` · `--pressed-weak` · `--pressed-transparent` · `--selected` | `#f7f8f9` · `#eeeff1` · `rgba(0,0,0,.027)` · `#2a3038` | 흰 면 눌림 · 회색 채움 눌림 · 바탕 없는 요소 눌림 · '선택됨' 채움 |
| 글자 | `--ink` · `--ink-soft` · `--ink-subtle` | `#1a1c20` · `#555d6d` · `#868b94` | 본문 · 보조 글자 · **아이콘·화살표·비활성 전용(글자 금지)** |
| 경계 | `--line` · `--line-section` · `--line-strong` · `--line-input` · `--line-contrast` | `rgba(0,0,0,.047)` · `rgba(0,0,0,.063)` · `#dcdee3` · `#868b94` · `#1a1c20` | 반복 구분선 · 구역 경계 · 카드 테두리 · **입력·선택지 경계(정보 전달)** · 초점·고른 칸 |
```

대비 표 머리 문장의 `2026-09-20 위 값으로 계산`을 `2026-09-24 위 값으로 계산`으로 바꾸고, 첫 네 행을 바꾼다:

```markdown
| `--ink` / `--bg` | 17.73:1 | 본문 4.5 |
| `--ink-soft` / `--bg` · `--surface-alt` · `--accent-soft` | 7.54 · 6.90 · 6.65:1 | 본문 4.5 |
| `--ink` / `--surface-alt` | 16.24:1 | 본문 4.5 |
| `--line-input` / `--bg` · `--surface-alt` (UI 경계) | 3.76 · 3.44:1 | UI 3.0 |
```

→

```markdown
| `--ink` / `--bg` · `--layer-basement`(=`--surface-alt`) | 17.06 · 15.49:1 | 본문 4.5 |
| `--ink-soft` / `--bg` · `--layer-basement` · `--accent-soft` | 6.62 · 6.01 · 5.84:1 | 본문 4.5 |
| `--line-input` / `--bg` · `--layer-basement` (UI 경계) | 3.42 · 3.11:1 | UI 3.0 |
| `--ink-subtle` / `--bg` (아이콘·화살표) | 3.42:1 | UI 3.0 — 글자에는 쓰지 않는다 |
| `--on-dark` / `--selected` | 13.31:1 | 본문 4.5 |
| `--accent` / `--layer-basement` | 4.78:1 | 본문 4.5 |
```

같은 표에서 `--ink`가 들어간 세 행의 숫자를 고친다:

```markdown
| `--ink` / 상태 바탕 — 동행 · 근거리 · 대기 · 미추천 | 15.84 · 15.34 · 16.21 · 15.66:1 | 본문 4.5 |
| `--on-dark` / `--ink` · `--badge-readonly-bg` | 17.73 · 10.47:1 | 본문 4.5 |
| `--ink` / `--badge-demo-stripe-a` · `-b` | 16.00 · 14.53:1 | 본문 4.5 |
```
→
```markdown
| `--ink` / 상태 바탕 — 동행 · 근거리 · 대기 · 미추천 | 15.24 · 14.76 · 15.59 · 15.07:1 | 본문 4.5 |
| `--on-dark` / `--ink` · `--badge-readonly-bg` | 17.06 · 10.47:1 | 본문 4.5 |
| `--ink` / `--badge-demo-stripe-a` · `-b` | 15.39 · 13.98:1 | 본문 4.5 |
```

2.2 글자 표를 바꾼다:

```markdown
| `--text-display` | 30px | 큰 제목 |
```
→
```markdown
| `--text-display` | 26px / 35px | 큰 제목 (SEED screenTitle) |
```

```markdown
| `--text-button` | 17px | 버튼 |
```
→
```markdown
| `--text-button` | 16px / 22px | 버튼 (SEED 14px — 하한으로 올림). 큰 CTA 는 18px / 24px |
```

```markdown
| `--leading-tight` · `-snug` · `-body` | 1.25 · 1.4 · 1.6 | 줄 간격 |
| `--weight-regular` · `-medium` · `-bold` · `-heavy` | 400 · 500 · 700 · 800 | 굵기 |
| `--tracking-tight` | -0.02em | 제목 자간 |
```
→
```markdown
| `--leading-tight` · `-snug` · `-body` | 1.33 · 1.375 · 1.5 | 줄 간격 비율 (SEED 짝 24/32 · 16/22 · 16/24) |
| `--lh-display` … `--lh-caption` | 35 · 32 · 27 · 24 · 22 · 24(긴 글) · 19px | 높이가 정확해야 하는 부품의 줄 높이 |
| `--weight-regular` · `-medium` · `-bold` · `-heavy` | 400 · 500 · 700 · 700 | 굵기 (SEED 는 400·500·700 뿐) |
| `--tracking-tight` | normal | 자간 없음 (SEED) |
```

2.3 표의 간격·모서리·그림자·움직임·포커스 행을 바꾼다:

```markdown
| 간격(4px 단위) | `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48px |
| 모서리 | `--radius-xs` 8(배지) · `--radius-sm` 12(입력·칩·작은 버튼) · `--radius` 16(카드·배너) · `--radius-lg` 24(사진 카드·시트) · `--radius-pill` 999(알약·긴급 버튼) |
| 그림자 | `--shadow-card`(카드) · `--shadow-float`(떠 있는 버튼) · `--shadow-sheet`(아래에서 올라오는 시트) |
```
→
```markdown
| 간격(4px 단위) | `--space-0-5` 2 · `-1` 4 · `-1-5` 6 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-14` 56px |
| 의미 간격 (SEED) | `--gap-component` 12 · `--gap-text` 6 · `--gap-nav-to-title` 20 · `--gap-screen-bottom` 56 · `--gap-section` 8px |
| 모서리 (SEED) | `--radius-6` 배지 · `-8` 작은 버튼·아이콘 버튼 · `-10` 안내 상자 · `-12` 큰 버튼·입력 · `-16` 누르는 카드 · `-20` 대화상자 · `-24` 시트 · `-full` 칩·스위치. 기존 `--radius-xs`·`-sm`·`--radius`·`-lg`·`-pill` 은 ②층에서 옮긴 뒤 지운다 |
| 그림자 | `--shadow-card` SEED s1(①층 한정, ③층에서 없앰) · `--shadow-float` SEED s3(떠 있는 메뉴) · `--shadow-sheet` 없음(하단 바는 1px 윗선) |
```

```markdown
| 움직임 | `--ease-out` · `--duration-fast` 120ms · `--duration` 200ms. 움직임은 `prefers-reduced-motion: no-preference`일 때만 켠다 |
| 포커스 | 모든 요소 `:focus-visible` 3px `--accent` 윤곽선. 포인트 면(주 버튼·복귀 버튼·긴급 버튼) 위에서는 `--ink` 윤곽선 |
```
→
```markdown
| 움직임 | `--ease-color`(색 전환) · `--ease-press`(눌림 축소) · `--duration-fast` 150ms · `--duration` 200ms. 움직임은 `prefers-reduced-motion: no-preference`일 때만 켠다 |
| 포커스 | 모든 요소 `:focus-visible` `--focus-width`(2px) `--accent` 윤곽선. SEED 의 연한 파랑(#5e98fe, 2.9:1)은 하한 미달이라 코발트 유지. 포인트 면 위에서는 `--ink` 윤곽선 |
```

문서 머리 `- 기준일:` 줄을 `- 기준일: 2026-09-24 (SEED ①층 토큰 반영)`으로 바꾼다.

- [ ] **Step 7: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0, e2e `62 passed`.

- [ ] **Step 8: 커밋**

```bash
git add app/design-board/DesignBoard.js app/design-board/demoData.js e2e/design-board.spec.js docs/platform/DESIGN_SYSTEM.md
git commit -m "$(cat <<'MSG'
test(design): 시안 보드 대비 판정을 화면 테스트로 묶고 설계 문서를 새 토큰으로 고친다

보드는 토큰 값을 브라우저에서 읽어 대비를 계산한다. 판정마다 data-verdict 를 붙여
'미달 0개'를 화면 테스트가 단언한다 — 토큰이 바뀌어 대비가 깨지면 보드와 테스트가 함께 알려 준다.
간격·모서리 견본에 SEED 단계를 넣고, DESIGN_SYSTEM.md 2장 표를 새 값·새 대비로 고쳤다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: 전후 캡처 비교와 운영자 확인

**Files:** 없음 (확인 단계)

**Interfaces:**
- Consumes: Task 1 Step 1의 `$SEED_EVIDENCE/before/*.png`
- Produces: 운영자 승인 — ②층 계획을 쓰는 조건

- [ ] **Step 1: 바꾼 뒤 캡처를 남긴다**

```bash
export SEED_EVIDENCE=/private/tmp/claude-501/-Users-macddiwoo-Documents-Claude-Projects-Safehour--claude-worktrees-mystifying-mclaren-a495e5/d5596f4f-5a2a-4a1c-b778-8cd5b1b82940/scratchpad/seed-l1
mkdir -p "$SEED_EVIDENCE/after"
npm run build
E2E_EVIDENCE_DIR="$SEED_EVIDENCE/after" npm run e2e
ls "$SEED_EVIDENCE/after" | wc -l
```

Expected: `62 passed`, 캡처 수가 before 와 같다.

- [ ] **Step 2: 전후를 나란히 보여 준다**

`01-start` · `06-today` · `05-trip` · `04-self-check` · `09-delta-sheet` · `22-design-board` 여섯 쌍을 운영자에게 보여 준다
(before/after 파일을 그대로 보내거나 한 장씩 나란히 붙인다). 무엇이 바뀌었는지 한 줄씩 적는다 —
글자색·구분선·제목 크기·버튼 글자·카드 그림자·초점 링.

- [ ] **Step 3: 운영자 확인을 받는다**

승인 전에는 ②층을 시작하지 않는다. 방향을 틀라는 요청이면 이 계획의 토큰 값을 고치고 Task 1 Step 7부터 다시 돈다.

- [ ] **Step 4: 상태 문서에 남긴다**

`docs/tracking/status.md`의 '화면 다듬기 (2026-09-24)' 목록 끝에 한 줄을 더하고 커밋한다:

```markdown
- SEED 적용 ①층(토큰): 회색·글자·간격·모서리·그림자·초점 링을 SEED 값으로 교체 — 설계서 `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
```

```bash
git add docs/tracking/status.md
git commit -m "$(cat <<'MSG'
docs: SEED ①층 토큰 교체를 상태 문서에 남긴다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

## 다음 계획

- **②층 부품 계획**은 이 계획의 Task 3 승인 뒤에 쓴다. 설계서 5장을 따르고, 부품마다 시안 보드 위에서 계산된 스타일(높이·모서리·색·선택 상태)을 재는 화면 테스트를 먼저 쓴다. 기존 모서리 토큰 다섯 개를 지우는 일이 이 계획에 들어간다.
- **③층 화면 계획**은 ②층 승인 뒤에 쓴다. 설계서 6.2 순서로 한 화면씩, 화면마다 회색 바탕·흰 블록 적용과 카드 그림자 제거가 들어간다.
- **②층으로 넘기는 것** (①층 최종 검토에서 나온 것):
  1. 하드코딩 3px 초점 링 12곳을 `--focus-width`로 옮긴다 — globals.css(.radio-option/.toggle-row :focus-within), conditions.css 4곳, guardian.css 1곳, ui.css 2곳, today.css 1곳, onboarding.css 3곳. `.radio-option.selected`가 같은 우선순위로 뒤에 있어 초점 box-shadow를 덮는다 — box-shadow 대신 outline+offset으로 바꿔 선택 표시와 초점 표시를 구분한다.
  2. 채운 면(선택된 DateChip 등) 위 초점 링은 `--ink`로 — 설계서 4.6.
  3. 시트 뒤 가림막 `rgba(18,24,38,.48)`(globals.css)을 `--overlay`로.
  4. 부품을 새 모서리 토큰으로 옮긴 뒤 옛 다섯 개를 지우고, 토큰 테스트의 존재 검사를 `!TOKENS.has(old)`로 뒤집는다.
  5. 큰 버튼 글자 18/24 토큰을 만든다(`--text-button` 주석이 가리키는 값) — 기능 CSS가 새 글자 크기를 직접 쓰지 않게.
  6. h2의 `letter-spacing: -0.01em`(globals.css, ui.css)을 없앤다 — SEED는 자간이 없다.
  7. `#868b94`(`--line-input`·`--ink-subtle`)는 `--pressed-weak` 2.98, `--support-soft`·split 바탕 2.96으로 3:1 미달 — 이 조합을 쓰기 전에 `CONTRAST_GROUPS`에 `--line-input|--pressed-weak`, `--ink-subtle|--surface-alt`, `--ink-subtle|--layer-basement`, `--line-input|--accent-soft`를 더한다.
  8. 시안 보드 `parseColor`가 투명도를 버린다 — 반투명 짝을 더하기 전에 null을 돌려주거나 바탕에 섞어 계산하게 고친다.
  9. 화면 테스트의 `pass ≥ 30`을 `CONTRAST_GROUPS`에서 센 정확한 수로 바꾼다.
  10. `--selected`(#2a3038)와 `--ink`(#1a1c20)는 1.28:1로 가깝다 — 선택된 칩이 '즉시 복귀' 버튼(`.btn-return`)처럼 보이지 않는지 ②층 시안 보드에서 확인한다.
