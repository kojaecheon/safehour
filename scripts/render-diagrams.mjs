// 흐름도 SVG → PNG 변환 (AX-208 · 기능설명서 2-②)
//
// 기능설명서 양식은 한글(HWP)·워드일 가능성이 높아 SVG 를 그대로 못 넣는 경우가 많다.
// 문서에 붙일 수 있도록 2배 해상도 PNG 를 함께 만든다.
//
//   npm run render:diagrams
//
// 결과: docs/diagrams/*.svg 와 같은 이름의 PNG 가 artifacts/diagrams/ 에 생성된다.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const SRC = path.resolve('docs/diagrams');
const OUT = path.resolve('artifacts/diagrams');
const SCALE = 2;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.svg'));
if (files.length === 0) {
  console.error('docs/diagrams 에 SVG 가 없다.');
  process.exit(1);
}

const browser = await chromium.launch();

for (const file of files) {
  const svg = fs.readFileSync(path.join(SRC, file), 'utf8');
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
  if (!w) {
    console.error(`  ! ${file} — viewBox 를 읽지 못했다`);
    continue;
  }

  const page = await browser.newPage({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: SCALE,
  });
  // 시스템 한글 폰트를 쓰므로 외부 요청이 없다
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>${svg}`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(300);

  const out = path.join(OUT, file.replace(/\.svg$/, '.png'));
  await page.locator('svg').screenshot({ path: out });
  await page.close();

  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`  ✓ ${path.basename(out)}  ${w}×${h} @${SCALE}x  (${kb} KB)`);
}

await browser.close();
console.log(`\n${files.length}개 변환: ${OUT}`);
