// 시안 보드 경계 (app/design-board)
//
// 시안 보드는 고정 데모 데이터만 쓰고 기기 저장소를 읽지 않는다. 저장소·알림 런타임·체류 훅을
// import 하는 순간 사용자 데이터가 시안 화면에 섞인다. 이 테스트가 import 줄을 정적으로 읽어 막는다.
// 시안 보드가 그리는 components/guardian 표시 부품 두 개도 같은 기준으로 검사한다.
// 정적 import 줄만 본다. require(...), 동적 import(...), `export ... from` 재수출, 그 두 부품 말고 다른
// 컴포넌트를 거치는 간접 저장소 사용은 잡지 못한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BOARD_DIR = join(ROOT, 'app', 'design-board');
const BOARD_RENDERED = [
  join(ROOT, 'components', 'guardian', 'GuardianCopyView.js'),
  join(ROOT, 'components', 'guardian', 'AlertsToggleView.js'),
];

// 가져오면 안 되는 모듈 경로 조각 (경로를 정규화한 뒤 포함 여부로 본다)
const FORBIDDEN_SPECIFIERS = [
  'lib/store',
  'lib/trip/useTrip',
  'lib/trip/runtime',
  'lib/notify/runtime',
  'lib/notify/device',
];
// import 절에 이름이 나오면 안 되는 저장소 훅
const FORBIDDEN_NAMES = ['usePrefs', 'useStoreStatus', 'getStore'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 주석을 지우고 import 문(여러 줄 포함)을 { clause, specifier } 로 돌려준다. */
function parseImports(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = [];
  const re = /import\s+(?:((?:(?!['"])[\s\S])*?)\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) found.push({ clause: m[1] ?? '', specifier: m[2] });
  return found;
}

function violations(file) {
  const rel = relative(ROOT, file);
  const bad = [];
  for (const { clause, specifier } of parseImports(readFileSync(file, 'utf8'))) {
    const spec = specifier.replace(/^(\.\.?\/)+/, '').replace(/^@\//, '');
    if (FORBIDDEN_SPECIFIERS.some((f) => spec === f || spec.startsWith(`${f}/`) || spec.startsWith(`${f}.`))) {
      bad.push(`${rel}: 금지된 import '${specifier}'`);
    }
    for (const name of FORBIDDEN_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(clause)) bad.push(`${rel}: 금지된 이름 '${name}' (from '${specifier}')`);
    }
  }
  return bad;
}

describe('시안 보드 경계: 기기 저장소를 읽지 않는다', () => {
  test('app/design-board 아래 모든 파일이 저장소·알림 런타임·체류 훅을 import 하지 않는다', () => {
    const files = walk(BOARD_DIR);
    assert.ok(files.length > 0, 'app/design-board 에서 .js 파일을 찾지 못했다');
    const bad = files.flatMap(violations);
    assert.deepEqual(bad, [], `시안 보드가 사용자 데이터 경로를 가져온다:\n${bad.join('\n')}`);
  });

  test('시안 보드가 그리는 components/guardian 표시 부품도 저장소를 import 하지 않는다', () => {
    const bad = BOARD_RENDERED.flatMap(violations);
    assert.deepEqual(bad, [], `시안 보드가 그리는 표시 부품이 저장소 경로를 가져온다:\n${bad.join('\n')}`);
  });

  test('검사기 자체: 금지된 import 를 실제로 잡는다', () => {
    const sample = [
      "import { usePrefs } from '@/lib/store/hooks.js';",
      "import {\n  a,\n  getStore,\n} from '../../lib/store/index.js';",
      "import x from '@/lib/notify/device.js';",
      "// import y from '@/lib/store/x.js';",
    ].join('\n');
    const imports = parseImports(sample);
    assert.equal(imports.length, 3);
    assert.ok(imports.every((i) => FORBIDDEN_SPECIFIERS.some((f) => i.specifier.includes(f))));
    assert.ok(imports.some((i) => /\bgetStore\b/.test(i.clause)));
  });

  test('검사기 자체: from 없는 부작용 import 뒤에 다른 import 가 와도 금지 경로를 잃지 않는다', () => {
    const sample = "import '@/lib/store/init.js';\nimport React from 'react';";
    const imports = parseImports(sample);
    assert.deepEqual(imports.map((i) => i.specifier), ['@/lib/store/init.js', 'react']);
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    const file = join(dir, 'x.js');
    writeFileSync(file, sample);
    assert.ok(violations(file).length > 0, '부작용 저장소 import 를 잡아야 한다');
  });
});
