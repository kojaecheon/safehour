// SEED ①층 토큰 계약 (설계서 docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md 4장)
//
// app/globals.css 의 :root 를 읽어 토큰 값과 WCAG 2.1 대비를 고정한다.
// 대비 짝은 시안 보드와 같은 목록(app/design-board/demoData.js CONTRAST_GROUPS)을 불러와 쓴다 —
// 보드가 화면에 보여 주는 판정과 이 테스트의 판정이 같은 짝을 본다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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
