// 앱 설치 아이콘 만들기 (AX-319 · spec 4.18)
//
//   node scripts/generate-pwa-icons.mjs
//
// 새 의존성 없이 만든다: 아래 SVG 를 이미 설치된 Playwright 크로미움으로 한 번 그려 PNG 로 저장한다.
// 결과 파일(public/icons/*)은 저장소에 커밋한다 — 빌드·배포 때 이 스크립트를 돌리지 않는다.
// 모양을 바꾸면 이 스크립트를 다시 돌리고 public/sw.js 의 SW_VERSION 을 올린다(캐시한 아이콘 교체).
//
// 모양: 한강 코발트(--accent #0a5cff) 바탕 위 흰 집(숙소로 돌아오기) + 시계 바늘(마감 시각).
//       가운데 점은 벚꽃 분홍(--support #ff7aa2, 장식 전용). 병원·약을 떠올리게 하는 기호는 쓰지 않는다.
// 색은 app/globals.css 토큰 값이다. test/pwa-manifest.test.js 가 토큰과 같은지 확인한다.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

export const ICON_COLORS = Object.freeze({ accent: '#0a5cff', surface: '#ffffff', support: '#ff7aa2' });

/**
 * @param {{ bleed: boolean, scale: number }} shape
 *   bleed — 모서리까지 바탕을 채운다(마스크형·애플 터치 아이콘: 기기가 모양을 자른다)
 *   scale — 무늬 크기. 마스크형은 안전 영역(지름 80%) 안에 들도록 줄인다
 */
function iconSvg({ bleed, scale }) {
  const { accent, surface, support } = ICON_COLORS;
  const background = bleed
    ? `<rect width="512" height="512" fill="${accent}"/>`
    : `<rect width="512" height="512" rx="112" fill="${accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background}
  <g transform="translate(256 262) scale(${scale}) translate(-256 -262)">
    <path d="M256 112 L396 224 V372 Q396 400 368 400 H144 Q116 400 116 372 V224 Z" fill="${surface}" stroke="${surface}" stroke-width="24" stroke-linejoin="round"/>
    <path d="M256 296 V218 M256 296 L318 330" fill="none" stroke="${accent}" stroke-width="28" stroke-linecap="round"/>
    <circle cx="256" cy="296" r="20" fill="${support}"/>
  </g>
</svg>
`;
}

const ANY = iconSvg({ bleed: false, scale: 1 });
const FULL = iconSvg({ bleed: true, scale: 0.8 });

const TARGETS = [
  { file: 'icon-192.png', size: 192, svg: ANY },
  { file: 'icon-512.png', size: 512, svg: ANY },
  { file: 'icon-maskable-512.png', size: 512, svg: FULL },
  { file: 'apple-touch-icon.png', size: 180, svg: FULL },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'icon.svg'), ANY);

  const browser = await chromium.launch();
  try {
    for (const { file, size, svg } of TARGETS) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`,
      );
      await page.waitForFunction(() => document.images[0]?.complete === true);
      await page.screenshot({ path: join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      await page.close();
      console.log(`public/icons/${file} ${size}x${size}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
