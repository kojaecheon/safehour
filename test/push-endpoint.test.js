// 푸시 endpoint 검증 (https, 호스트 허용 목록). src/push/AGENTS.md

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PUSH_HOST_RULES, parsePushEndpoint } from '../src/push/index.js';

const OK = [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/abc',
  'https://api.sandbox.push.apple.com/abc',
  'https://db5p.notify.windows.com/w/?token=abc',
  'https://fcm.googleapis.com:443/fcm/send/abc',
  'https://FCM.GoogleAPIs.com/fcm/send/abc',
];
const BAD = [
  'http://fcm.googleapis.com/fcm/send/abc',
  'https://fcm.googleapis.com.evil.com/x',
  'https://evil.com/fcm.googleapis.com',
  'https://fcm.googleapis.com@evil.com/x',
  'https://user:pw@fcm.googleapis.com/x',
  'https://fcm.googleapis.com:8443/x',
  'https://push.apple.com/x',
  'https://notify.windows.com/x',
  'https://evilpush.apple.com/x',
  'https://web.push.apple.com.evil.com/x',
  'https://127.0.0.1/x',
  'https://[::1]/x',
  'https://xn--fcm-googleapis-com.evil/x',
  'https://fcm.googleapis.com./x',
  'wss://fcm.googleapis.com/x',
  'not a url', '', null, undefined, 42, {}, `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
];

test('허용 호스트의 https 주소만 받는다', () => {
  for (const value of OK) {
    const result = parsePushEndpoint(value);
    assert.equal(result.ok, true, value);
    assert.ok(result.url instanceof URL);
    assert.equal(result.audience, result.url.origin);
    assert.equal(result.audience.startsWith('https://'), true);
  }
  for (const value of BAD) {
    assert.deepEqual(parsePushEndpoint(value), { ok: false }, String(value));
  }
});

test('호스트 규칙은 네 가지이고 바꿀 수 없다', () => {
  assert.equal(Object.isFrozen(PUSH_HOST_RULES), true);
  assert.deepEqual([...PUSH_HOST_RULES].sort(), [
    '*.notify.windows.com',
    '*.push.apple.com',
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
  ]);
});

test('testOrigin 이 주어지면 그 출처만 더 받는다', () => {
  const testOrigin = 'http://127.0.0.1:3199';
  const ok = parsePushEndpoint('http://127.0.0.1:3199/push/abc', { testOrigin });
  assert.equal(ok.ok, true);
  assert.equal(ok.audience, testOrigin);
  assert.equal(parsePushEndpoint('http://127.0.0.1:3200/push/abc', { testOrigin }).ok, false);
  assert.equal(parsePushEndpoint('http://127.0.0.1:3199/push/abc').ok, false);
  assert.equal(parsePushEndpoint('http://127.0.0.1:3199/push/abc', { testOrigin: null }).ok, false);
  // testOrigin 이 있어도 허용 호스트는 그대로 받는다
  assert.equal(parsePushEndpoint('https://fcm.googleapis.com/fcm/send/abc', { testOrigin }).ok, true);
});

test('testOrigin 우회는 http·https 만 받고 사용자 정보와 불투명 출처를 거절한다', () => {
  const origin = 'http://127.0.0.1:3199';
  assert.equal(parsePushEndpoint('http://u:p@127.0.0.1:3199/push/abc', { testOrigin: origin }).ok, false);
  assert.equal(parsePushEndpoint('data:text/plain,hi', { testOrigin: 'null' }).ok, false);
  assert.equal(parsePushEndpoint('javascript:alert(1)', { testOrigin: 'null' }).ok, false);
  assert.equal(parsePushEndpoint('http://127.0.0.1:3199/push/abc', { testOrigin: origin }).ok, true);
});
