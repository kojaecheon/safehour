// 웹 푸시 본문 암호화 (RFC 8291, aes128gcm). src/push/AGENTS.md
//
// 시험 벡터는 RFC 8291 부록 A 그대로다. 이 테스트를 지우거나 값을 바꾸지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';

import { MAX_PUSH_BODY_BYTES, PushError, decryptPushPayload, encryptPushPayload } from '../src/push/index.js';

const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const b = (s) => Buffer.from(s, 'base64url');

test('RFC 8291 부록 A 시험 벡터와 본문이 바이트 단위로 같다', () => {
  const body = encryptPushPayload({
    plaintext: b(V.plaintext), p256dh: V.uaPublic, auth: V.auth, salt: b(V.salt), localPrivateKey: b(V.asPrivate),
  });
  assert.equal(body.toString('base64url'), V.body);
});

test('시험 벡터 본문을 구독 개인키로 풀면 원문이 나온다', () => {
  assert.equal(decryptPushPayload({ body: b(V.body), privateKey: b(V.uaPrivate), auth: V.auth }).toString('utf8'),
    'When I grow up, I want to be a watermelon');
});

test('salt와 임시 키를 주지 않으면 매번 다른 본문이 나오고, 풀면 같은 원문이다', () => {
  const text = '{"title":"t","body":"b"}';
  const one = encryptPushPayload({ plaintext: text, p256dh: V.uaPublic, auth: V.auth });
  const two = encryptPushPayload({ plaintext: text, p256dh: V.uaPublic, auth: V.auth });
  assert.notEqual(one.toString('base64url'), two.toString('base64url'));
  assert.notDeepEqual(one.subarray(0, 16), two.subarray(0, 16));
  assert.notDeepEqual(one.subarray(21, 86), two.subarray(21, 86));
  for (const body of [one, two]) {
    assert.equal(decryptPushPayload({ body, privateKey: b(V.uaPrivate), auth: V.auth }).toString('utf8'), text);
  }
});

test('평문 3993바이트는 4096바이트 본문이 되고, 3994바이트는 PUSH_PAYLOAD_TOO_LARGE', () => {
  assert.equal(MAX_PUSH_BODY_BYTES, 4096);
  const fit = Buffer.alloc(3993, 0x61);
  const body = encryptPushPayload({ plaintext: fit, p256dh: V.uaPublic, auth: V.auth });
  assert.equal(body.length, 4096);
  assert.deepEqual(decryptPushPayload({ body, privateKey: b(V.uaPrivate), auth: V.auth }), fit);
  assert.throws(
    () => encryptPushPayload({ plaintext: Buffer.alloc(3994, 0x61), p256dh: V.uaPublic, auth: V.auth }),
    (err) => err instanceof PushError && err.code === 'PUSH_PAYLOAD_TOO_LARGE',
  );
});

test('p256dh가 65바이트 비압축 점이 아니거나 auth가 16바이트가 아니면 PUSH_KEY', () => {
  const pub = b(V.uaPublic);
  const compressed = Buffer.from(pub);
  compressed[0] = 0x03;
  const notOnCurve = Buffer.from(pub);
  notOnCurve[64] ^= 0x01;
  const cases = [
    { p256dh: pub.subarray(0, 64).toString('base64url'), auth: V.auth },
    { p256dh: compressed.toString('base64url'), auth: V.auth },
    { p256dh: notOnCurve.toString('base64url'), auth: V.auth },
    { p256dh: V.uaPublic, auth: b(V.auth).subarray(0, 15).toString('base64url') },
    { p256dh: 'not base64url!', auth: V.auth },
    { p256dh: undefined, auth: V.auth },
    { p256dh: V.uaPublic, auth: 42 },
  ];
  for (const keys of cases) {
    assert.throws(
      () => encryptPushPayload({ plaintext: 'x', ...keys }),
      (err) => err instanceof PushError && err.code === 'PUSH_KEY',
      JSON.stringify(keys),
    );
  }
});

test('주입한 salt나 임시 키의 길이가 틀리면 PUSH_KEY', () => {
  assert.throws(
    () => encryptPushPayload({ plaintext: 'x', p256dh: V.uaPublic, auth: V.auth, salt: Buffer.alloc(15) }),
    (err) => err instanceof PushError && err.code === 'PUSH_KEY',
  );
  assert.throws(
    () => encryptPushPayload({ plaintext: 'x', p256dh: V.uaPublic, auth: V.auth, localPrivateKey: Buffer.alloc(31, 1) }),
    (err) => err instanceof PushError && err.code === 'PUSH_KEY',
  );
});

test('오류 메시지에 키 값이 없다', () => {
  const bad = Buffer.from(b(V.uaPublic));
  bad[0] = 0x03;
  const badKey = bad.toString('base64url');
  const shortAuth = b(V.auth).subarray(0, 15).toString('base64url');
  const errors = [];
  for (const args of [
    { plaintext: 'x', p256dh: badKey, auth: V.auth },
    { plaintext: 'x', p256dh: V.uaPublic, auth: shortAuth },
    { plaintext: Buffer.alloc(5000), p256dh: V.uaPublic, auth: V.auth },
  ]) {
    try {
      encryptPushPayload(args);
    } catch (err) {
      errors.push(err);
    }
  }
  assert.equal(errors.length, 3);
  for (const err of errors) {
    for (const secret of [V.uaPublic, V.auth, badKey, shortAuth]) {
      assert.equal(err.message.includes(secret), false);
      assert.equal(String(err.stack).includes(secret), false);
    }
  }
});

test('복호화: 틀린 auth나 망가진 본문은 PUSH_KEY 로 실패한다', () => {
  const other = createECDH('prime256v1');
  other.generateKeys();
  const wrongAuth = Buffer.alloc(16, 7).toString('base64url');
  assert.throws(
    () => decryptPushPayload({ body: b(V.body), privateKey: b(V.uaPrivate), auth: wrongAuth }),
    (err) => err instanceof PushError && err.code === 'PUSH_KEY',
  );
  assert.throws(
    () => decryptPushPayload({ body: b(V.body), privateKey: other.getPrivateKey(), auth: V.auth }),
    (err) => err instanceof PushError && err.code === 'PUSH_KEY',
  );
  assert.throws(
    () => decryptPushPayload({ body: b(V.body).subarray(0, 40), privateKey: b(V.uaPrivate), auth: V.auth }),
    (err) => err instanceof PushError && err.code === 'PUSH_KEY',
  );
});
