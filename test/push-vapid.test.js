// VAPID 서명 (RFC 8292). src/push/AGENTS.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';

import { PushError, createVapidSigner, isValidVapidSubject } from '../src/push/index.js';

const NOW = Date.UTC(2026, 10, 14, 3, 0, 0);
const HOUR = 3_600_000;
const SUBJECT = 'mailto:ops@safehour.example';

function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.of(0x04), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { publicKeyObject: publicKey, publicKey: raw.toString('base64url'), privateKey: jwk.d };
}

const KEYS = makeKeys();

function signer(overrides = {}) {
  return createVapidSigner({ publicKey: KEYS.publicKey, privateKey: KEYS.privateKey, subject: SUBJECT, ...overrides });
}

function parseHeader(value) {
  const m = /^vapid t=([^,\s]+), k=([A-Za-z0-9_-]+)$/.exec(value);
  assert.ok(m, 'vapid t=..., k=... 형식');
  const [h, p, s] = m[1].split('.');
  return {
    jwt: m[1],
    k: m[2],
    parts: [h, p, s],
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')),
    claims: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')),
  };
}

test('Authorization 은 "vapid t=<JWT>, k=<공개키>" 이고 JWT 는 공개키로 검증된다', () => {
  const parsed = parseHeader(signer().authorizationFor('https://fcm.googleapis.com/fcm/send/abc', NOW));
  assert.equal(parsed.k, KEYS.publicKey);
  assert.equal(parsed.parts.length, 3);
  assert.ok(parsed.parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)));
  const [h, p, s] = parsed.parts;
  const sig = Buffer.from(s, 'base64url');
  assert.equal(sig.length, 64);
  assert.equal(verify('sha256', Buffer.from(`${h}.${p}`), { key: KEYS.publicKeyObject, dsaEncoding: 'ieee-p1363' }, sig), true);
  assert.deepEqual(parsed.header, { typ: 'JWT', alg: 'ES256' });

  const other = makeKeys();
  assert.equal(verify('sha256', Buffer.from(`${h}.${p}`), { key: other.publicKeyObject, dsaEncoding: 'ieee-p1363' }, sig), false);
});

test('aud 는 endpoint 의 출처, sub 는 연락처, exp 는 지금 + 12시간이다', () => {
  const { claims } = parseHeader(signer().authorizationFor('https://fcm.googleapis.com/fcm/send/abc?x=1', NOW));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: Math.floor(NOW / 1000) + 43200, sub: SUBJECT });
});

test('같은 출처는 11시간 동안 같은 JWT 를 다시 쓰고, 그 뒤에는 새로 만든다', () => {
  const s = signer();
  const first = parseHeader(s.authorizationFor('https://web.push.apple.com/a', NOW)).jwt;
  assert.equal(parseHeader(s.authorizationFor('https://web.push.apple.com/b', NOW + 10 * HOUR + 59 * 60_000)).jwt, first);
  const later = parseHeader(s.authorizationFor('https://web.push.apple.com/c', NOW + 11 * HOUR + 60_000));
  assert.notEqual(later.jwt, first);
  assert.equal(later.claims.exp, Math.floor((NOW + 11 * HOUR + 60_000) / 1000) + 43200);
});

test('출처가 다르면 JWT 도 다르다', () => {
  const s = signer();
  const a = parseHeader(s.authorizationFor('https://fcm.googleapis.com/fcm/send/abc', NOW));
  const b = parseHeader(s.authorizationFor('https://updates.push.services.mozilla.com/wpush/v2/abc', NOW));
  assert.notEqual(a.jwt, b.jwt);
  assert.equal(a.claims.aud, 'https://fcm.googleapis.com');
  assert.equal(b.claims.aud, 'https://updates.push.services.mozilla.com');
});

test('키 형식이 틀리거나 연락처가 mailto:·https: 가 아니면 PUSH_VAPID', () => {
  const pub = Buffer.from(KEYS.publicKey, 'base64url');
  const compressed = Buffer.from(pub);
  compressed[0] = 0x02;
  const other = makeKeys();
  const bad = [
    { publicKey: pub.subarray(0, 64).toString('base64url') },
    { publicKey: compressed.toString('base64url') },
    { publicKey: undefined },
    { privateKey: Buffer.from(KEYS.privateKey, 'base64url').subarray(0, 31).toString('base64url') },
    { privateKey: 'not base64url!' },
    { privateKey: other.privateKey },
    { subject: 'ops@safehour.example' },
    { subject: 'http://safehour.example' },
    { subject: '' },
    { subject: undefined },
  ];
  for (const overrides of bad) {
    let caught;
    try {
      signer(overrides);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof PushError && caught.code === 'PUSH_VAPID', JSON.stringify(overrides));
    assert.equal(caught.message.includes(KEYS.privateKey), false);
    assert.equal(caught.message.includes(KEYS.publicKey), false);
  }

  assert.equal(isValidVapidSubject('mailto:ops@safehour.example'), true);
  assert.equal(isValidVapidSubject('https://safehour.example/contact'), true);
  assert.equal(isValidVapidSubject('http://safehour.example'), false);
  assert.equal(isValidVapidSubject('ops@safehour.example'), false);
  assert.equal(isValidVapidSubject(null), false);
});

test('endpoint 가 URL 이 아니면 PUSH_VAPID 이고 메시지에 주소가 없다', () => {
  assert.throws(
    () => signer().authorizationFor('not a url secret-endpoint', NOW),
    (err) => err instanceof PushError && err.code === 'PUSH_VAPID' && !err.message.includes('secret-endpoint'),
  );
});
