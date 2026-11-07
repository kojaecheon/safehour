// E2E 공통 고정 장치 (AX-322) — 모든 테스트에 자동으로 걸린다
//
//   1. 외부 요청 0건 (spec 12.3)
//      - 브라우저: 127.0.0.1·localhost 밖으로 가는 요청을 막고(abort) 기록한다.
//      - 서버: e2e/network-guard.cjs 가 남긴 외부 연결 기록이 이 테스트 동안 늘지 않았는지 본다.
//   2. 현재 위치 요청 0건 (spec 9.1 · 규칙 46)
//      - navigator.geolocation 의 모든 호출과 위치 권한 조회를 기록한다. 한 번이라도 있으면 실패다.
//   3. 캐시 수명 — 심은 TourAPI 캐시 파일의 시각을 새로 고쳐 긴 실행에서도 외부로 나가지 않게 한다.
//   4. 시계: 테스트 앞뒤로 시계 이동(helpers.js setClock)을 0 으로 되돌려, 쓰지 않는 테스트는 실제 시계를 본다.
//
// 테스트가 browser.newContext() 로 만든 추가 컨텍스트는 guardContext() 로 같은 감시를 건다.

import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { resetClock } from './helpers.js';

const DATA_ROOT = path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data');
export const SERVER_GUARD_DIR = path.join(DATA_ROOT, 'guard');
const SERVER_LOG = path.join(SERVER_GUARD_DIR, 'external.log');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isLocalUrl(raw) {
  try {
    const url = new URL(raw);
    if (!/^(https?|wss?):$/.test(url.protocol)) return true; // data:·blob:·about: 는 네트워크가 아니다
    return LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function readServerExternalLog() {
  try {
    return fs.readFileSync(SERVER_LOG, 'utf8');
  } catch {
    return '';
  }
}

/** 위치정보 호출 기록기 — 페이지 스크립트보다 먼저 심는다 */
function geolocationSpy() {
  const report = (what) => {
    try {
      window.__e2eGeo?.(what);
    } catch {
      // 기록 실패는 무시
    }
  };
  const geo = navigator.geolocation;
  if (geo) {
    for (const method of ['getCurrentPosition', 'watchPosition']) {
      const original = geo[method]?.bind(geo);
      if (!original) continue;
      try {
        Object.defineProperty(geo, method, {
          configurable: true,
          value: (...args) => {
            report(method);
            return original(...args);
          },
        });
      } catch {
        // 덮어쓸 수 없는 환경
      }
    }
  }
  const perms = navigator.permissions;
  if (perms?.query) {
    const query = perms.query.bind(perms);
    perms.query = (desc) => {
      if (desc?.name === 'geolocation') report('permissions.query(geolocation)');
      return query(desc);
    };
  }
}

/**
 * 컨텍스트 하나에 외부 요청·위치정보 감시를 건다.
 * @returns {Promise<{blocked: string[], geolocation: string[]}>}
 */
export async function guardContext(context) {
  const record = { blocked: [], geolocation: [] };
  await context.route(
    (url) => !isLocalUrl(url.href),
    (route) => {
      const url = new URL(route.request().url());
      record.blocked.push(`${url.protocol}//${url.host}${url.pathname}`);
      return route.abort('blockedbyclient');
    },
  );
  // 서비스 워커가 낸 요청처럼 route 를 거치지 않는 요청도 놓치지 않는다
  context.on('request', (request) => {
    if (!isLocalUrl(request.url())) {
      const url = new URL(request.url());
      const entry = `${url.protocol}//${url.host}${url.pathname}`;
      if (!record.blocked.includes(entry)) record.blocked.push(entry);
    }
  });
  await context.exposeBinding('__e2eGeo', (_source, what) => {
    record.geolocation.push(String(what));
  });
  await context.addInitScript(geolocationSpy);
  return record;
}

/** 감시 결과를 확인한다 */
export function expectGuardClean(record, where = '') {
  expect(record.blocked, `${where}브라우저가 외부로 요청했다 (외부 호출 0건 위반)`).toEqual([]);
  expect(record.geolocation, `${where}현재 위치를 요청했다 (spec 9.1 위반)`).toEqual([]);
}

let refreshCache = null;
async function refreshSeed() {
  if (!refreshCache) {
    process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
    refreshCache = (await import('../scripts/seed-e2e-cache.mjs')).refreshE2eCache;
  }
  return refreshCache();
}

export const test = base.extend({
  /** 자동 감시 — 모든 테스트의 기본 컨텍스트 */
  guard: [
    async ({ context }, use) => {
      await resetClock();
      await refreshSeed();
      const serverBefore = readServerExternalLog();
      const record = await guardContext(context);
      await use(record);
      await resetClock();
      expectGuardClean(record);
      const serverAfter = readServerExternalLog();
      expect(serverAfter.slice(serverBefore.length), '서버가 외부로 연결하려 했다 (외부 호출 0건 위반)').toBe('');
    },
    { auto: true },
  ],
});

export { expect };
