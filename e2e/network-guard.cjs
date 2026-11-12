// E2E 서버 쪽 외부 호출 차단기 (AX-322 · 외부 호출 0건: docs/standards.md '테스트', docs/engineering-notes.md '화면 테스트가 외부를 부르지 않게 하는 방법')
//
// playwright.config.js 가 E2E 서버(next start)를 `NODE_OPTIONS=--require <이 파일>` 로 띄운다.
// 서버가 루프백(127.0.0.1·localhost·::1) 밖으로 연결하려 하면
//   1. 대상 호스트(경로·검색어 없이 호스트:포트만 — 키가 섞일 수 있는 URL 전체는 남기지 않는다)를
//      SAFEHOUR_E2E_GUARD_DIR/external.log 에 한 줄 남기고
//   2. 연결을 거부한다(오류를 던진다) — 실제 요청은 나가지 않는다.
// e2e/fixtures.js 가 테스트마다 이 기록이 비어 있는지 확인한다. 한 줄이라도 있으면 그 테스트가 실패한다.
//
// 두 겹으로 막는다: 전역 fetch(관광공사·기상·주소·AI 호출이 모두 이것을 쓴다)와 net 소켓 연결(그 밖의 모든 TCP).
// 서버가 이 파일을 실제로 불러왔는지는 ready 표식으로 확인한다(e2e/network.spec.js).

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const GUARD_DIR = process.env.SAFEHOUR_E2E_GUARD_DIR;

if (GUARD_DIR) {
  const LOG = path.join(GUARD_DIR, 'external.log');
  const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1', '0.0.0.0']);

  fs.mkdirSync(GUARD_DIR, { recursive: true });
  fs.writeFileSync(path.join(GUARD_DIR, `ready-${process.pid}`), `${new Date().toISOString()}\n`, 'utf8');

  const record = (kind, target) => {
    try {
      fs.appendFileSync(LOG, `${new Date().toISOString()} ${kind} ${target}\n`, 'utf8');
    } catch {
      // 기록 실패는 차단을 막지 않는다
    }
  };

  const isLoopback = (host) => {
    if (host === undefined || host === null || host === '') return true; // 호스트 없음 = localhost
    return LOOPBACK.has(String(host).toLowerCase()) || /^127\./.test(String(host));
  };

  // ── 전역 fetch ──
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === 'function') {
    globalThis.fetch = function guardedFetch(input, init) {
      let url;
      try {
        url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url);
      } catch {
        return originalFetch.call(this, input, init);
      }
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !isLoopback(url.hostname)) {
        record('fetch', `${url.protocol}//${url.host}`);
        return Promise.reject(new TypeError(`E2E network guard: blocked external request to ${url.host}`));
      }
      return originalFetch.call(this, input, init);
    };
  }

  // ── TCP 연결 ──
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    let options = args[0];
    if (Array.isArray(options)) options = options[0]; // 내부 normalized 인자
    let host;
    let port;
    let ipc = false;
    if (options && typeof options === 'object') {
      if (options.path) ipc = true;
      host = options.host ?? options.hostname;
      port = options.port;
    } else if (typeof options === 'number' || (typeof options === 'string' && /^\d+$/.test(options))) {
      port = options;
      host = typeof args[1] === 'string' ? args[1] : undefined;
    } else if (typeof options === 'string') {
      ipc = true; // 유닉스 소켓 경로
    }
    if (!ipc && !isLoopback(host)) {
      record('socket', `${host}:${port ?? ''}`);
      throw new Error(`E2E network guard: blocked socket connection to ${host}`);
    }
    return originalConnect.apply(this, args);
  };
}
