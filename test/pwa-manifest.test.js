// 앱 설치: 매니페스트와 아이콘 (AX-319 · docs/platform/IA_AND_FLOWS.md '보기 전용 상태')
//
// 설치 기본 조건(이름·시작 주소·standalone·192/512 아이콘)과 디자인 토큰 색을 고정한다.
// 아이콘은 scripts/generate-pwa-icons.mjs 가 만든 PNG 다 — 파일 머리(IHDR)에서 실제 크기를 읽는다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import manifest from '../app/manifest.js';

const root = (path) => new URL(`../${path}`, import.meta.url);

/** PNG 파일의 가로·세로 (IHDR) */
function pngSize(path) {
  const buf = readFileSync(root(`public${path}`));
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', `${path} 는 PNG 가 아니다`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** globals.css :root 토큰 값 */
function token(name) {
  const css = readFileSync(root('app/globals.css'), 'utf8');
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
}

const m = manifest();

describe('매니페스트 — 설치 기본 조건', () => {
  test('이름·시작 주소·범위·표시 방식', () => {
    assert.equal(m.name, 'SafeHour');
    assert.equal(m.short_name, 'SafeHour');
    assert.ok(m.short_name.length <= 12);
    assert.equal(m.start_url, '/today');
    assert.equal(m.scope, '/');
    assert.ok(m.start_url.startsWith(m.scope));
    assert.equal(m.display, 'standalone');
    assert.equal(m.id, '/');
  });

  test('192·512 PNG 아이콘과 마스크형 아이콘이 있고, 적힌 크기와 파일 크기가 같다', () => {
    const png = m.icons.filter((i) => i.type === 'image/png');
    const sizes = new Set(png.filter((i) => i.purpose.split(' ').includes('any')).map((i) => i.sizes));
    assert.ok(sizes.has('192x192') && sizes.has('512x512'));
    assert.ok(png.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
    for (const icon of png) {
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.deepEqual(pngSize(icon.src), { width: w, height: h }, icon.src);
    }
    for (const icon of m.icons) assert.ok(existsSync(root(`public${icon.src}`)), icon.src);
  });

  test('애플 터치 아이콘은 180×180', () => {
    assert.deepEqual(pngSize('/icons/apple-touch-icon.png'), { width: 180, height: 180 });
  });

  test('색은 디자인 토큰과 같다 — 바탕·테마는 흰 바탕(--bg), 레이아웃 주소창 색과도 같다', () => {
    assert.equal(m.background_color, token('bg'));
    assert.equal(m.theme_color, token('bg'));
    const layout = readFileSync(root('app/layout.js'), 'utf8');
    assert.match(layout, new RegExp(`themeColor:\\s*'${m.theme_color}'`, 'i'));
  });

  test('아이콘 SVG 의 색은 토큰(포인트·보조색) 값이다', () => {
    const svg = readFileSync(root('public/icons/icon.svg'), 'utf8').toLowerCase();
    assert.ok(svg.includes(token('accent')), 'accent');
    assert.ok(svg.includes(token('support')), 'support');
  });
});

describe('서비스 워커와 짝이 맞는다', () => {
  test('서비스 워커가 미리 받는 파일이 모두 있다 (매니페스트 주소 포함)', () => {
    const sw = readFileSync(root('public/sw.js'), 'utf8');
    const list = /const PRECACHE_ASSETS = \[([\s\S]*?)\];/.exec(sw)[1];
    const paths = [...list.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.ok(paths.includes('/manifest.webmanifest'));
    for (const p of paths.filter((x) => x.startsWith('/icons/'))) assert.ok(existsSync(root(`public${p}`)), p);
    for (const icon of m.icons) assert.ok(paths.includes(icon.src), `${icon.src} 를 미리 받지 않는다`);
  });
});
