// 서비스 워커 (AX-319 · spec 4.18)
//
// public/sw.js 를 가짜 서비스 워커 환경(vm)에서 실제로 돌려 확인한다.
//   - API 응답(/api/**)은 가로채지도 캐시에 넣지도 않는다 — 어떤 흐름 뒤에도 캐시 키에 /api/ 가 없다.
//   - 보기 전용 화면은 네트워크 우선 + 캐시 사본, 목록 밖 화면은 캐시하지 않는다.
//   - 오프라인에서 캐시에 없는 화면은 캐시한 셸 화면으로 보낸다.
//   - 캐시 이름에 판이 붙고, 새 워커가 켜지면 옛 판을 지운다.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'http://localhost:3304';

// ── 가짜 캐시 저장소 ────────────────────────────────────────────────

function keyOf(input) {
  const url = typeof input === 'string' ? input : input.url;
  return new URL(url, ORIGIN).href;
}

class FakeCache {
  constructor() {
    this.map = new Map();
  }
  async match(input) {
    const hit = this.map.get(keyOf(input));
    return hit ? hit.clone() : undefined;
  }
  async put(input, response) {
    this.map.set(keyOf(input), response.clone());
  }
  async delete(input) {
    return this.map.delete(keyOf(input));
  }
  async keys() {
    return [...this.map.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage {
  constructor() {
    this.stores = new Map();
  }
  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name) {
    return this.stores.delete(name);
  }
  async has(name) {
    return this.stores.has(name);
  }
  allUrls() {
    return [...this.stores.values()].flatMap((c) => [...c.map.keys()]);
  }
}

// ── 가짜 네트워크 ───────────────────────────────────────────────────

const HTML = (assets) =>
  `<!doctype html><html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"></head><body>` +
  `<script src="/_next/static/chunks/main-abc.js" async></script>` +
  `<script>self.__next_f.push([1,"I:[\\"/_next/static/chunks/page-${assets}.js\\"]"])</script></body></html>`;

function htmlResponse(body, headers = {}) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
}

function makeNetwork() {
  const state = { online: true, calls: [], routes: new Map(), responses: [] };
  state.routes.set('/today', () => htmlResponse(HTML('today')));
  state.routes.set('/privacy', () => htmlResponse(HTML('privacy')));
  state.routes.set('/emergency', () => htmlResponse(HTML('emergency')));
  state.routes.set('/trip/2026-09-20', () => htmlResponse(HTML('trip-date')));
  state.routes.set('/settings', () => htmlResponse(HTML('settings')));
  state.routes.set('/nostore', () => htmlResponse(HTML('nostore'), { 'Cache-Control': 'private, no-cache, no-store' }));
  state.routes.set('/api/today', () => Response.json({ ok: true, conditions: { walkLimit: 15 } }));
  state.routes.set('/api/auth/session', () => Response.json({ authenticated: true }));
  state.routes.set('/api/auth/login', () => new Response(null, { status: 302, headers: { Location: '/login' } }));
  state.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN);
    state.calls.push(url.pathname + url.search);
    if (!state.online) throw new TypeError('Failed to fetch');
    const handler = state.routes.get(url.pathname);
    let response;
    if (handler) response = handler();
    else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
      response = new Response(`asset ${url.pathname}`, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    } else {
      response = new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    }
    state.responses.push({ path: url.pathname, response });
    return response;
  };
  return state;
}

// ── 가짜 서비스 워커 전역 ───────────────────────────────────────────

function loadWorker({ caches = new FakeCacheStorage(), network = makeNetwork() } = {}) {
  const handlers = {};
  const calls = { skipWaiting: 0, claim: 0, openWindow: [] };
  const self = {
    location: new URL('/sw.js', ORIGIN),
    addEventListener(type, fn) {
      handlers[type] = fn;
    },
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
      matchAll: async () => [],
      openWindow: async (url) => {
        calls.openWindow.push(url);
      },
    },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: network.fetch,
    Request,
    Response,
    Headers,
    URL,
    console,
    setTimeout: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    clearTimeout,
  });
  vm.runInContext(SOURCE, context, { filename: 'public/sw.js' });
  return { context, handlers, caches, network, calls };
}

async function settle(waits) {
  let seen = -1;
  while (seen !== waits.length) {
    seen = waits.length;
    await Promise.allSettled([...waits]);
  }
}

/** fetch 이벤트를 보낸다. 가로채지 않으면 response 가 undefined */
async function dispatchFetch(worker, path, { mode = 'no-cors', method = 'GET', headers = {} } = {}) {
  const request = new Request(new URL(path, ORIGIN), { method, headers });
  Object.defineProperty(request, 'mode', { value: mode });
  const waits = [];
  let responded = null;
  const event = {
    request,
    respondWith(promise) {
      responded = Promise.resolve(promise);
    },
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    },
  };
  worker.handlers.fetch(event);
  const response = responded ? await responded : undefined;
  await settle(waits);
  return { intercepted: responded !== null, response };
}

async function dispatchLifecycle(worker, type) {
  const waits = [];
  worker.handlers[type]({
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    },
  });
  await settle(waits);
}

function apiKeys(caches) {
  return caches.allUrls().filter((url) => new URL(url).pathname.startsWith('/api'));
}

describe('판정 도우미', () => {
  const { context } = loadWorker();

  test('API 경로 판별', () => {
    for (const p of ['/api', '/api/', '/api/today', '/api/auth/session', '/api/itinerary/intro']) {
      assert.equal(context.isApiPath(p), true, p);
    }
    for (const p of ['/', '/apix', '/today', '/_next/static/chunks/api.js', '/privacy']) {
      assert.equal(context.isApiPath(p), false, p);
    }
  });

  test('보기 전용 화면 목록 (spec 4.18): 긴급·카드·오늘·일정·보호자 사본·고지', () => {
    const route = (p) => context.readOnlyRoute(new URL(p, ORIGIN));
    for (const p of ['/emergency', '/cards', '/today', '/trip', '/g', '/privacy', '/trip/2026-09-20']) {
      assert.equal(route(p), p, p);
    }
    assert.equal(route('/today/'), '/today');
    assert.equal(route('/g?x=1#pin'), '/g', '검색어·조각은 키에 넣지 않는다');
    for (const p of ['/', '/login', '/settings', '/conditions', '/onboarding', '/guardian', '/api/today', '/trip/tomorrow']) {
      assert.equal(route(p), null, p);
    }
    assert.equal(context.readOnlyRoute(new URL('https://evil.example/today')), null);
  });

  test('정적 파일은 /_next/static 과 아이콘·매니페스트만', () => {
    const asset = (p) => context.isStaticAsset(new URL(p, ORIGIN));
    assert.equal(asset('/_next/static/chunks/main.js'), true);
    assert.equal(asset('/icons/icon-192.png'), true);
    assert.equal(asset('/manifest.webmanifest'), true);
    for (const p of ['/api/place', '/_next/image?url=x', '/today', '/sw.js']) assert.equal(asset(p), false, p);
  });

  test('no-store·리다이렉트·다른 출처·API 주소 응답은 캐시하지 않는다', () => {
    const ok = htmlResponse('x');
    assert.equal(context.isCacheableResponse(ok, { html: true }), true);
    assert.equal(context.isCacheableResponse(htmlResponse('x', { 'Cache-Control': 'no-store' }), { html: true }), false);
    assert.equal(context.isCacheableResponse(new Response('x', { status: 404 })), false);
    assert.equal(context.isCacheableResponse(new Response('{}', { headers: { 'Content-Type': 'application/json' } }), { html: true }), false);
    const redirected = htmlResponse('x');
    Object.defineProperty(redirected, 'redirected', { value: true });
    assert.equal(context.isCacheableResponse(redirected, { html: true }), false);
    const fromApi = htmlResponse('x');
    Object.defineProperty(fromApi, 'url', { value: `${ORIGIN}/api/today` });
    assert.equal(context.isCacheableResponse(fromApi, { html: true }), false);
    const opaque = htmlResponse('x');
    Object.defineProperty(opaque, 'type', { value: 'opaque' });
    assert.equal(context.isCacheableResponse(opaque), false);
  });

  test('HTML 에서 정적 파일 경로를 뽑는다 (스크립트·스타일·RSC 조각)', () => {
    // vm 안의 배열은 다른 realm 이라 펼쳐서 비교한다
    assert.deepEqual([...context.staticAssetsIn(HTML('x'))].sort(), [
      '/_next/static/chunks/app.css',
      '/_next/static/chunks/main-abc.js',
      '/_next/static/chunks/page-x.js',
    ]);
  });
});

describe('API 는 가로채지도, 캐시에 넣지도 않는다', () => {
  let worker;
  beforeEach(() => {
    worker = loadWorker();
  });

  test('API 요청(GET·POST·화면 이동)을 가로채지 않는다', async () => {
    for (const [path, opts] of [
      ['/api/today', {}],
      ['/api/today', { method: 'POST' }],
      ['/api/auth/session', { headers: { Accept: 'application/json' } }],
      ['/api/auth/login', { mode: 'navigate' }],
    ]) {
      const { intercepted } = await dispatchFetch(worker, path, opts);
      assert.equal(intercepted, false, `${opts.method ?? 'GET'} ${path}`);
    }
    assert.deepEqual(apiKeys(worker.caches), []);
    assert.equal(worker.network.calls.filter((c) => c.startsWith('/api')).length, 0, '워커가 API 를 대신 부르지 않는다');
  });

  test('설치·화면 이동·오프라인·정적 파일 흐름을 모두 거친 뒤에도 캐시에 /api/ 가 없다', async () => {
    await dispatchLifecycle(worker, 'install');
    await dispatchLifecycle(worker, 'activate');
    for (const path of ['/today', '/privacy', '/emergency', '/settings', '/trip/2026-09-20']) {
      await dispatchFetch(worker, path, { mode: 'navigate' });
    }
    await dispatchFetch(worker, '/_next/static/chunks/extra.js');
    await dispatchFetch(worker, '/api/today');
    worker.network.online = false;
    await dispatchFetch(worker, '/today', { mode: 'navigate' });
    await dispatchFetch(worker, '/api/today');
    assert.ok(worker.caches.allUrls().length > 0);
    assert.deepEqual(apiKeys(worker.caches), []);
    assert.equal(worker.network.calls.filter((c) => c.startsWith('/api')).length, 0);
  });

  test('활성화 때 혹시 남은 API 항목을 지운다 (방어)', async () => {
    await dispatchLifecycle(worker, 'install');
    const pageCache = [...worker.caches.stores.entries()].find(([name]) => name.includes('pages'))[1];
    await pageCache.put(`${ORIGIN}/api/today`, Response.json({ leaked: true }));
    await dispatchLifecycle(worker, 'activate');
    assert.deepEqual(apiKeys(worker.caches), []);
  });

  test('RSC 데이터 요청(화면 이동이 아닌 같은 경로)은 가로채지 않는다', async () => {
    const { intercepted } = await dispatchFetch(worker, '/today?_rsc=abc', { headers: { RSC: '1' } });
    assert.equal(intercepted, false);
  });
});

describe('설치와 활성화', () => {
  test('설치 때 보기 전용 화면과 아이콘을 받아 두고, 없는 화면은 건너뛰며, 바로 활성화한다', async () => {
    const worker = loadWorker();
    await dispatchLifecycle(worker, 'install');
    const urls = worker.caches.allUrls().map((u) => new URL(u).pathname);
    for (const p of ['/today', '/privacy', '/emergency', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']) {
      assert.ok(urls.includes(p), `${p} 를 받아 두지 않았다`);
    }
    for (const p of ['/cards', '/g', '/trip']) assert.ok(!urls.includes(p), `404 인 ${p} 를 캐시했다`);
    assert.ok(urls.includes('/_next/static/chunks/page-today.js'), '화면이 쓰는 정적 파일도 받아 둔다');
    assert.equal(worker.calls.skipWaiting, 1);
  });

  test('캐시하지 않는 응답(404)의 본문은 버린다 — 읽지 않은 본문이 브라우저 연결을 붙잡아 설치가 멈추지 않게', async () => {
    const worker = loadWorker();
    await dispatchLifecycle(worker, 'install');
    const notFound = worker.network.responses.filter((r) => r.response.status === 404);
    assert.ok(notFound.length >= 3, '없는 화면(/cards·/g·/trip)이 404 로 왔다');
    for (const { path, response } of notFound) assert.equal(response.bodyUsed, true, `${path} 본문을 버리지 않았다`);
  });

  test('오프라인에서 설치해도 실패하지 않는다', async () => {
    const worker = loadWorker();
    worker.network.online = false;
    await dispatchLifecycle(worker, 'install');
    assert.equal(worker.calls.skipWaiting, 1);
  });

  test('캐시 이름에 판이 붙고, 활성화 때 옛 판만 지운다 (다른 캐시는 두고)', async () => {
    const caches = new FakeCacheStorage();
    await caches.open('safehour-pages-old');
    await caches.open('safehour-assets-old');
    await caches.open('someone-else');
    const worker = loadWorker({ caches });
    await dispatchLifecycle(worker, 'install');
    await dispatchLifecycle(worker, 'activate');
    const names = await caches.keys();
    assert.ok(!names.includes('safehour-pages-old') && !names.includes('safehour-assets-old'));
    assert.ok(names.includes('someone-else'));
    const version = /const SW_VERSION = '([^']+)'/.exec(SOURCE)?.[1];
    assert.ok(version, 'SW_VERSION 이 있어야 한다');
    assert.ok(names.every((n) => n === 'someone-else' || n.endsWith(`-${version}`)), names.join(', '));
    assert.ok(names.some((n) => /^safehour-pages-/.test(n)) && names.some((n) => /^safehour-assets-/.test(n)));
    assert.equal(worker.calls.claim, 1);
  });
});

describe('화면 이동 — 네트워크 우선, 오프라인이면 캐시', () => {
  let worker;
  beforeEach(async () => {
    worker = loadWorker();
  });

  test('온라인이면 네트워크 응답을 주고 보기 전용 화면을 캐시한다', async () => {
    const { response } = await dispatchFetch(worker, '/emergency', { mode: 'navigate' });
    assert.equal(await response.text(), HTML('emergency'));
    assert.ok(worker.caches.allUrls().includes(`${ORIGIN}/emergency`));
    assert.ok(worker.caches.allUrls().includes(`${ORIGIN}/_next/static/chunks/page-emergency.js`));
  });

  test('오프라인이면 캐시한 사본을 준다 (긴급·고지·날짜 일정)', async () => {
    for (const p of ['/emergency', '/privacy', '/trip/2026-09-20']) await dispatchFetch(worker, p, { mode: 'navigate' });
    worker.network.online = false;
    for (const p of ['/emergency', '/privacy', '/trip/2026-09-20']) {
      const { response } = await dispatchFetch(worker, p, { mode: 'navigate' });
      assert.equal(response.status, 200, p);
      assert.match(await response.text(), /_next\/static/, p);
    }
  });

  test('목록 밖 화면은 캐시하지 않고, 오프라인이면 캐시한 셸 화면(/today)으로 보낸다', async () => {
    await dispatchFetch(worker, '/today', { mode: 'navigate' });
    await dispatchFetch(worker, '/settings', { mode: 'navigate' });
    assert.ok(!worker.caches.allUrls().includes(`${ORIGIN}/settings`));
    worker.network.online = false;
    const { response } = await dispatchFetch(worker, '/settings', { mode: 'navigate' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `${ORIGIN}/today`);
  });

  test('오늘 화면이 없으면 긴급 화면으로 보낸다', async () => {
    await dispatchFetch(worker, '/emergency', { mode: 'navigate' });
    worker.network.online = false;
    const { response } = await dispatchFetch(worker, '/conditions', { mode: 'navigate' });
    assert.equal(response.headers.get('Location'), `${ORIGIN}/emergency`);
  });

  test('캐시한 화면이 하나도 없으면 브라우저 오프라인 화면(네트워크 오류)', async () => {
    worker.network.online = false;
    const { response } = await dispatchFetch(worker, '/today', { mode: 'navigate' });
    assert.equal(response.type, 'error');
  });

  test('no-store 응답은 보기 전용 경로여도 캐시하지 않는다', async () => {
    worker.network.routes.set('/cards', () => htmlResponse(HTML('cards'), { 'Cache-Control': 'no-store' }));
    await dispatchFetch(worker, '/cards', { mode: 'navigate' });
    assert.ok(!worker.caches.allUrls().includes(`${ORIGIN}/cards`));
  });

  test('서버 오류(5xx)면 보기 전용 화면은 캐시 사본을 준다', async () => {
    await dispatchFetch(worker, '/privacy', { mode: 'navigate' });
    worker.network.routes.set('/privacy', () => new Response('boom', { status: 503, headers: { 'Content-Type': 'text/html' } }));
    const { response } = await dispatchFetch(worker, '/privacy', { mode: 'navigate' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), HTML('privacy'));
  });
});

describe('정적 파일 — 캐시 우선', () => {
  test('한 번 받은 /_next/static 파일은 오프라인에서도 캐시로 준다', async () => {
    const worker = loadWorker();
    const first = await dispatchFetch(worker, '/_next/static/chunks/abc.js');
    assert.equal(first.intercepted, true);
    worker.network.online = false;
    const second = await dispatchFetch(worker, '/_next/static/chunks/abc.js');
    assert.equal(await second.response.text(), 'asset /_next/static/chunks/abc.js');
  });

  test('캐시에 있는 해시 파일은 네트워크에 묻지 않는다', async () => {
    const worker = loadWorker();
    await dispatchFetch(worker, '/_next/static/chunks/abc.js');
    const before = worker.network.calls.length;
    await dispatchFetch(worker, '/_next/static/chunks/abc.js');
    assert.equal(worker.network.calls.length, before);
  });

  test('다른 정적 경로(이미지 프록시 등)는 가로채지 않는다', async () => {
    const worker = loadWorker();
    const { intercepted } = await dispatchFetch(worker, '/_next/image?url=%2Ficons%2Ficon.svg&w=64&q=75');
    assert.equal(intercepted, false);
  });
});

describe('알림 누르기', () => {
  test('열린 창이 없으면 오늘 화면을 연다', async () => {
    const worker = loadWorker();
    let closed = false;
    const waits = [];
    worker.handlers.notificationclick({
      notification: {
        close() {
          closed = true;
        },
      },
      waitUntil(p) {
        waits.push(p);
      },
    });
    await settle(waits);
    assert.equal(closed, true);
    assert.deepEqual(worker.calls.openWindow, [`${ORIGIN}/today`]);
  });

  test('알림 data.url 이 허용 목록(/today, /g)이면 그 화면, 아니면 오늘 화면', () => {
    const { context } = loadWorker();
    assert.equal(context.notificationTargetPath({ url: '/g' }), '/g');
    assert.equal(context.notificationTargetPath({ url: '/today' }), '/today');
    for (const data of [undefined, null, {}, { url: 42 }, { url: '/settings' }, { url: 'https://evil.example/g' }, { url: '//evil.example' }, { url: '/g?x=1' }]) {
      assert.equal(context.notificationTargetPath(data), '/today', JSON.stringify(data));
    }
  });

  async function clickWith(worker, data) {
    const waits = [];
    worker.handlers.notificationclick({
      notification: { data, close() {} },
      waitUntil(p) {
        waits.push(p);
      },
    });
    await settle(waits);
  }

  test('보호자 알림(data.url /g)을 누르면 받은 일정 화면을 연다', async () => {
    const worker = loadWorker();
    await clickWith(worker, { url: '/g' });
    assert.deepEqual(worker.calls.openWindow, [`${ORIGIN}/g`]);
  });

  test('허용 목록 밖의 data.url 은 무시하고 오늘 화면을 연다', async () => {
    const worker = loadWorker();
    await clickWith(worker, { url: 'https://evil.example/' });
    assert.deepEqual(worker.calls.openWindow, [`${ORIGIN}/today`]);
  });

  test('열린 창이 있으면 그 창을 data.url 화면으로 옮긴다, 이미 그 화면이면 옮기지 않는다', async () => {
    for (const [current, expected] of [
      ['/today', [`${ORIGIN}/g`]],
      ['/g', []],
    ]) {
      const worker = loadWorker();
      const navigated = [];
      const client = {
        url: `${ORIGIN}${current}`,
        focus: async () => {},
        navigate: async (url) => {
          navigated.push(url);
        },
      };
      worker.context.self.clients.matchAll = async () => [client];
      await clickWith(worker, { url: '/g' });
      assert.deepEqual(navigated, expected, current);
      assert.deepEqual(worker.calls.openWindow, []);
    }
  });
});

describe('소스 고정 — API 제외가 가로채기보다 앞에 있다', () => {
  test('fetch 처리기는 respondWith 전에 API 경로를 돌려보낸다', () => {
    const handler = SOURCE.slice(SOURCE.indexOf("self.addEventListener('fetch'"));
    const apiGuard = handler.indexOf('if (isApiPath(url.pathname)) return;');
    const firstRespond = handler.indexOf('respondWith');
    assert.ok(apiGuard > 0 && firstRespond > apiGuard);
  });

  test('미리 받는 목록에 API 가 없다', () => {
    const lists = SOURCE.slice(SOURCE.indexOf('const READ_ONLY_ROUTES'), SOURCE.indexOf('const ASSET_CACHE_MAX'));
    assert.ok(!/['"]\/api/.test(lists), lists);
  });
});
