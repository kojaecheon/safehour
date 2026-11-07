/* SafeHour 서비스 워커 (AX-319 · spec 4.18 · 4.13)
 *
 * 하는 일
 *   1. 앱 셸과 보기 전용 화면(긴급 연락·한국어 카드·오늘/내일 일정·보호자 사본 보기·개인정보 고지)을
 *      오프라인에서 연다. 화면 HTML 은 네트워크 우선이고, 네트워크가 없으면 캐시한 사본을 준다.
 *   2. 화면이 쓰는 정적 파일(/_next/static — 파일 이름에 해시가 있어 바뀌지 않는다)과 아이콘·매니페스트를 캐시한다.
 *   3. 기기 알림을 누르면 앱(오늘 화면)을 연다.
 *
 * 하지 않는 일 — 바꾸지 말 것
 *   - **API 응답(/api/**)은 가로채지도, 캐시에 넣지도 않는다.** 판정·일정·조건 데이터는 API 로만 오간다.
 *     test/pwa-sw.test.js 가 이 파일을 실제로 돌려 확인한다.
 *   - 보기 전용 화면 목록 밖의 화면 HTML·RSC 데이터·다른 출처의 응답은 캐시하지 않는다.
 *   - 서버가 `Cache-Control: no-store` 라고 한 응답은 캐시하지 않는다.
 *   - 알림 예약·발송은 여기서 하지 않는다(서비스 워커는 수시로 잠든다). 앱이 연 동안 lib/notify 가 한다.
 *
 * 캐시 이름에는 판(SW_VERSION)이 붙는다. 이 파일을 고치면 판을 올린다 — 새 워커가 켜질 때 옛 판을 지운다.
 * 등록은 운영 빌드에서만 한다(components/pwa/PwaRuntime.js).
 */

'use strict';

const SW_VERSION = '2026-09-19.1';
const CACHE_PREFIX = 'safehour-';
const PAGE_CACHE = `${CACHE_PREFIX}pages-${SW_VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${SW_VERSION}`;
const CURRENT_CACHES = [PAGE_CACHE, ASSET_CACHE];

/** 보기 전용 화면 — 오프라인에서도 연다 (spec 4.18). 설치 때 미리 받아 둔다(없는 화면은 건너뛴다) */
const READ_ONLY_ROUTES = ['/today', '/trip', '/emergency', '/cards', '/g', '/privacy'];
/** 보기 전용 동적 경로 — 한 번 열었던 날짜만 오프라인에서 열린다 */
const READ_ONLY_PATTERNS = [/^\/trip\/\d{4}-\d{2}-\d{2}$/];
/** 오프라인에서 캐시에 없는 화면을 열면 이 순서로 캐시한 셸 화면으로 보낸다 */
const OFFLINE_FALLBACK_ROUTES = ['/today', '/emergency', '/privacy'];
/** 설치 때 받아 두는 파일 — 해시가 없어 캐시 사본을 보여 주며 뒤에서 새로 받는다 */
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
/** 정적 파일 캐시의 최대 항목 수 — 넘치면 오래된 것부터 지운다(배포가 쌓여도 커지지 않게) */
const ASSET_CACHE_MAX = 200;
/** 캐시 사본이 있는 화면은 네트워크를 이만큼만 기다린다(느린 연결에서도 긴급 화면이 열리게) */
const NETWORK_TIMEOUT_MS = 6000;
/** 알림을 누르면 여는 기본 화면 */
const NOTIFICATION_URL = '/today';
/** 알림 data.url 로 열어도 되는 화면 (이 목록 밖이면 기본 화면을 연다) */
const NOTIFICATION_PATHS = ['/today', '/g'];

// ── 판정 도우미 (test/pwa-sw.test.js 가 직접 부른다) ─────────────────────

/** 알림을 누르면 열 경로. data.url 이 허용 목록에 있으면 그 경로, 아니면 기본 화면 */
function notificationTargetPath(data) {
  const url = data && typeof data.url === 'string' ? data.url : null;
  return url && NOTIFICATION_PATHS.includes(url) ? url : NOTIFICATION_URL;
}

/** API 경로인가 — 이 경로는 절대 캐시하지 않는다 */
function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

/** 보기 전용 화면이면 캐시 키(경로), 아니면 null. 검색어·조각(#)은 키에 넣지 않는다 */
function readOnlyRoute(url) {
  if (!sameOrigin(url) || isApiPath(url.pathname)) return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  if (READ_ONLY_ROUTES.includes(path)) return path;
  if (READ_ONLY_PATTERNS.some((re) => re.test(path))) return path;
  return null;
}

/** 캐시해도 되는 정적 파일인가 — /_next/static 과 미리 받는 아이콘·매니페스트만 */
function isStaticAsset(url) {
  if (!sameOrigin(url) || isApiPath(url.pathname)) return false;
  return url.pathname.startsWith('/_next/static/') || PRECACHE_ASSETS.includes(url.pathname);
}

/** 응답을 캐시에 넣어도 되는가 */
function isCacheableResponse(response, { html = false } = {}) {
  if (!response || response.status !== 200 || response.redirected) return false;
  if (response.type !== 'basic' && response.type !== 'default') return false;
  if (response.url) {
    try {
      const url = new URL(response.url);
      if (!sameOrigin(url) || isApiPath(url.pathname)) return false;
    } catch {
      return false;
    }
  }
  if (/no-store/i.test(response.headers.get('Cache-Control') || '')) return false;
  if (html && !/text\/html/i.test(response.headers.get('Content-Type') || '')) return false;
  return true;
}

/** 화면 HTML 이 쓰는 정적 파일 경로 (/_next/static/…) */
function staticAssetsIn(html) {
  const found = new Set();
  for (const match of String(html).matchAll(/\/_next\/static\/[^"'\\\s<>()]+/g)) {
    const path = match[0].replace(/&amp;/g, '&');
    if (!isApiPath(path)) found.add(path);
  }
  return [...found];
}

// ── 캐시 조작 ───────────────────────────────────────────────────────

async function trimAssets(cache) {
  const keys = await cache.keys();
  const excess = keys.length - ASSET_CACHE_MAX;
  for (let i = 0; i < excess; i += 1) await cache.delete(keys[i]);
}

async function putAsset(cache, path) {
  try {
    const url = new URL(path, self.location.origin);
    if (!isStaticAsset(url)) return;
    const response = await fetch(url.href, { credentials: 'same-origin' });
    if (isCacheableResponse(response)) await cache.put(url.href, response);
    else discard(response);
  } catch {
    // 받지 못한 파일은 다음 방문 때 다시 받는다
  }
}

/** 화면 HTML 과 그 화면이 쓰는 정적 파일을 캐시한다 */
async function storePage(path, response) {
  const html = await response.clone().text();
  const pages = await caches.open(PAGE_CACHE);
  await pages.put(new URL(path, self.location.origin).href, response);
  const assets = await caches.open(ASSET_CACHE);
  for (const assetPath of staticAssetsIn(html)) {
    const key = new URL(assetPath, self.location.origin).href;
    if (!(await assets.match(key))) await putAsset(assets, assetPath);
  }
  await trimAssets(assets);
}

async function precache() {
  const assets = await caches.open(ASSET_CACHE);
  await Promise.all(PRECACHE_ASSETS.map((path) => putAsset(assets, path)));
  await Promise.all(
    READ_ONLY_ROUTES.map(async (path) => {
      try {
        const response = await fetch(path, { credentials: 'same-origin', cache: 'no-cache' });
        if (isCacheableResponse(response, { html: true })) await storePage(path, response);
        else discard(response);
      } catch {
        // 아직 없는 화면·오프라인 — 건너뛴다
      }
    }),
  );
}

/** 혹시 남은 API 항목을 지운다(방어). 정상이라면 늘 0건이다 */
async function purgeApiEntries() {
  for (const name of CURRENT_CACHES) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (isApiPath(new URL(request.url).pathname)) await cache.delete(request);
    }
  }
}

/** 캐시하지 않을 응답의 본문을 버린다 — 읽지 않은 본문이 연결을 붙잡지 않게 */
function discard(response) {
  try {
    response?.body?.cancel?.().catch?.(() => {});
  } catch {
    // 이미 읽었거나 본문이 없다
  }
}

function keepAlive(event, promise) {
  const guarded = promise.catch(() => {});
  try {
    event.waitUntil(guarded);
  } catch {
    // 응답을 이미 돌려준 뒤라 이벤트가 끝났다 — 작업은 그대로 진행된다
  }
}

const TIMED_OUT = 'safehour-network-timeout';

/** ms 뒤에 TIMED_OUT 으로 끝난다(거부하지 않는다 — 진 쪽이 처리 안 된 거부로 남지 않게) */
function timeout(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(TIMED_OUT), ms);
  });
}

// ── 요청 처리 ───────────────────────────────────────────────────────

async function offlineFallback() {
  const pages = await caches.open(PAGE_CACHE);
  for (const path of OFFLINE_FALLBACK_ROUTES) {
    const href = new URL(path, self.location.origin).href;
    if (await pages.match(href)) return Response.redirect(href, 302);
  }
  // 캐시한 화면이 하나도 없다 — 브라우저의 오프라인 화면을 보인다
  return Response.error();
}

async function handleNavigation(event, url) {
  const key = readOnlyRoute(url);
  const pages = await caches.open(PAGE_CACHE);
  const cached = key ? await pages.match(new URL(key, self.location.origin).href) : undefined;

  const network = fetch(event.request).then((response) => {
    if (key && isCacheableResponse(response, { html: true })) keepAlive(event, storePage(key, response.clone()));
    return response;
  });

  try {
    const response = await (cached ? Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]) : network);
    if (response === TIMED_OUT) {
      // 느린 연결 — 캐시 사본을 먼저 보이고, 네트워크 응답은 뒤에서 캐시만 새로 고친다
      keepAlive(event, network.then(discard));
      return cached;
    }
    // 서버 오류면 보기 전용 화면은 캐시 사본이 낫다
    if (cached && response.status >= 500) {
      discard(response);
      return cached;
    }
    return response;
  } catch {
    if (cached) return cached;
    return offlineFallback();
  }
}

async function handleAsset(event, request, url) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  // 해시가 붙은 파일은 바뀌지 않는다 — 캐시에 있으면 네트워크에 묻지 않는다
  if (hit && url.pathname.startsWith('/_next/static/')) return hit;
  const network = fetch(request).then((response) => {
    if (isCacheableResponse(response)) keepAlive(event, cache.put(request, response.clone()).then(() => trimAssets(cache)));
    return response;
  });
  if (hit) {
    // 아이콘·매니페스트 — 캐시 사본을 주고 뒤에서 새로 받는다
    keepAlive(event, network.then(discard));
    return hit;
  }
  return network;
}

// ── 이벤트 ─────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(precache().finally(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name)),
      );
      await purgeApiEntries();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  // API 는 가로채지 않는다 — 브라우저가 그대로 네트워크로 보내고, 어떤 캐시에도 남지 않는다
  if (isApiPath(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event, url));
    return;
  }
  if (isStaticAsset(url)) event.respondWith(handleAsset(event, request, url));
  // 그 밖(RSC 데이터·이미지 프록시 등)은 가로채지 않는다
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const path = notificationTargetPath(event.notification.data);
      const target = new URL(path, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && new URL(client.url).pathname !== path) {
            await client.navigate(target).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
