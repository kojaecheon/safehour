// 보호자 스냅샷 PIN 암호화 · 링크 형식 (AX-313 · docs/security.md '보호자 링크', docs/business-rules.md '보호자'. 테스트 이름의 규칙 번호(37, 38)는 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import {
  GUARDIAN_ERROR,
  GUARDIAN_PATH,
  GuardianError,
  PBKDF2_ITERATIONS,
  PIN_LENGTH,
  PLAINTEXT_FORMAT,
  buildGuardianLink,
  buildGuardianSnapshot,
  decryptSnapshot,
  encryptSnapshot,
  isGuardianFragment,
  isValidPin,
  measureGuardianLink,
  PIN_LOCKOUT_KEY_PREFIX,
  fragmentFromPasted,
  normalizeGuardianSnapshot,
  parseGuardianLink,
  pinLockoutKey,
} from '../src/guardian/index.js';
import { fromBase64Url, toBase64Url } from '../src/guardian/crypto.js';
import { FORBIDDEN_MARK, makeGuardianStay, makeTripPlan } from './guardian-fixtures.js';

const PIN = '042917';
const ORIGIN = 'https://safehour.example';

function snapshot() {
  return buildGuardianSnapshot({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), now: '2026-10-01T09:30:00+09:00', lang: 'en' });
}

function decode(fragment) {
  return new Uint8Array(Buffer.from(fragment, 'base64url'));
}

function hasCode(code) {
  return (err) => err instanceof GuardianError && err.code === code;
}

/** 테스트 쪽에서 문서화된 형식(PBKDF2-SHA256 → AES-GCM 256, salt 16 | iv 12 | ct+tag)을 그대로 구현한 키 유도 */
async function testKey(pin, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 모듈을 거치지 않고 평문 바이트를 암호문으로 만든다 */
async function sealPlaintext(plaintext, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await testKey(pin, salt), plaintext));
  return Buffer.concat([salt, iv, ct]).toString('base64url');
}

/** 모듈을 거치지 않고 암호문을 평문 바이트로 푼다 */
async function openPlaintext(fragment, pin) {
  const bytes = decode(fragment);
  const key = await testKey(pin, bytes.slice(0, 16));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28)));
}

async function withoutGlobal(name, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value: undefined, writable: true, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(globalThis, name, saved);
  }
}

describe('PIN 형식 — 정확히 6자리 숫자', () => {
  test('6자리 ASCII 숫자 문자열만 받는다(앞자리 0 포함)', () => {
    assert.equal(PIN_LENGTH, 6);
    for (const ok of ['000000', '123456', '042917', '999999']) assert.equal(isValidPin(ok), true, ok);
    for (const bad of ['12345', '1234567', 'abcdef', '12 456', '12345a', ' 123456', '123456\n', '１２３４５６', '١٢٣٤٥٦', '', null, undefined, 123456, ['123456']]) {
      assert.equal(isValidPin(bad), false, JSON.stringify(bad));
    }
  });

  test('형식이 틀린 PIN 은 암호화·복호화 모두 INVALID_PIN', async () => {
    const s = snapshot();
    const fragment = await encryptSnapshot(s, PIN);
    for (const bad of ['12345', '1234567', 'abcdef', 123456]) {
      await assert.rejects(encryptSnapshot(s, bad), hasCode(GUARDIAN_ERROR.INVALID_PIN));
      await assert.rejects(decryptSnapshot(fragment, bad), hasCode(GUARDIAN_ERROR.INVALID_PIN));
    }
  });
});

describe('암호화·복호화 (규칙 37: 올바른 PIN 으로만 복원)', () => {
  test('올바른 PIN 이면 원래 스냅샷으로 복원된다', async () => {
    const s = snapshot();
    const fragment = await encryptSnapshot(s, PIN);
    assert.deepEqual(await decryptSnapshot(fragment, PIN), s);
  });

  test('틀린 PIN 이면 WRONG_PIN — 다른 오류와 구별된다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    for (const wrong of ['042918', '000000', '240917']) {
      await assert.rejects(decryptSnapshot(fragment, wrong), hasCode(GUARDIAN_ERROR.WRONG_PIN));
    }
  });

  test('암호문은 base64url(salt 16 | iv 12 | ciphertext+tag) 이다 — 모듈 밖 구현으로도 풀린다', async () => {
    const s = snapshot();
    const fragment = await encryptSnapshot(s, PIN);
    assert.match(fragment, /^[A-Za-z0-9_-]+$/);
    const bytes = decode(fragment);
    const size = await measureGuardianLink(s);
    assert.equal(bytes.length, 16 + 12 + size.plaintextBytes + 16);
    assert.equal(bytes.length, size.payloadBytes);
    assert.equal(fragment.length, size.fragmentChars);
    const plaintext = await openPlaintext(fragment, PIN);
    assert.equal(plaintext.length, size.plaintextBytes);
  });

  test('같은 스냅샷·PIN 이어도 매번 다른 salt·iv·암호문이 나온다', async () => {
    const s = snapshot();
    const a = decode(await encryptSnapshot(s, PIN));
    const b = decode(await encryptSnapshot(s, PIN));
    assert.notDeepEqual(a.slice(0, 16), b.slice(0, 16), 'salt');
    assert.notDeepEqual(a.slice(16, 28), b.slice(16, 28), 'iv');
    assert.notDeepEqual(a.slice(28), b.slice(28), 'ciphertext');
  });

  test('암호문에 평문이 드러나지 않는다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    const raw = Buffer.from(decode(fragment)).toString('latin1');
    for (const text of ['"days"', '"patientReturn"', '1330', 'guardianOutings']) {
      assert.equal(raw.includes(text), false, text);
      assert.equal(fragment.includes(text), false, text);
    }
  });

  test('암호문이 변조되면 인증에 실패한다(틀린 PIN 과 구별할 수 없어 WRONG_PIN)', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    const bytes = decode(fragment);
    bytes[bytes.length - 20] ^= 0x01;
    const tampered = Buffer.from(bytes).toString('base64url');
    await assert.rejects(decryptSnapshot(tampered, PIN), hasCode(GUARDIAN_ERROR.WRONG_PIN));
  });

  test('형식이 틀리거나 짧은 암호문은 INVALID_LINK (PIN 오류로 세지 않는 종류)', async () => {
    const tooShort = Buffer.alloc(16 + 12 + 16).toString('base64url');
    for (const bad of ['', '!!!!', 'abc def', 'a', tooShort, 'AAAA=', null, 42]) {
      await assert.rejects(decryptSnapshot(bad, PIN), hasCode(GUARDIAN_ERROR.INVALID_LINK), JSON.stringify(bad));
    }
  });

  test('암호화 전에 허용 목록을 다시 적용한다 — 손으로 넣은 금지 필드는 복원 결과에 없다', async () => {
    const s = snapshot();
    s.hospital = { name: 'FORBIDDEN_HOSPITAL_NAME', phone: 'FORBIDDEN_HOSPITAL_PHONE' };
    s.days[3].guardianOutings[0].deadlineReason = 'MEDICATION';
    s.days[3].medication = [{ time: '13:00' }];
    const restored = await decryptSnapshot(await encryptSnapshot(s, PIN), PIN);
    const json = JSON.stringify(restored);
    assert.equal(json.includes(FORBIDDEN_MARK), false);
    assert.equal(json.includes('deadlineReason'), false);
    assert.equal(json.includes('medication'), false);
  });

  test('스냅샷이 아닌 값은 암호화하지 않는다', async () => {
    await assert.rejects(encryptSnapshot({ v: 1 }, PIN), hasCode(GUARDIAN_ERROR.INVALID_SNAPSHOT));
    await assert.rejects(encryptSnapshot(null, PIN), hasCode(GUARDIAN_ERROR.INVALID_SNAPSHOT));
  });

  test('키 유도 반복 횟수는 모바일 기준 20만 회 이상이다', () => {
    assert.ok(Number.isInteger(PBKDF2_ITERATIONS));
    assert.ok(PBKDF2_ITERATIONS >= 200_000);
  });

  test('오류 메시지에 PIN 이 들어가지 않는다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(decryptSnapshot(fragment, '135790'), (err) => !err.message.includes('135790') && !err.message.includes(fragment));
  });
});

describe('평문 형식 — 첫 바이트 표지 + (압축된) 정규 JSON', () => {
  test('표지 값: 0x00 = 그대로의 JSON, 0x01 = deflate-raw JSON', () => {
    assert.equal(PLAINTEXT_FORMAT.RAW_JSON, 0x00);
    assert.equal(PLAINTEXT_FORMAT.DEFLATE_RAW_JSON, 0x01);
  });

  test('압축을 쓸 수 있으면 평문은 0x01 + deflate-raw(정규 JSON) 이다 — zlib 로도 풀린다', async () => {
    const s = snapshot();
    const plaintext = await openPlaintext(await encryptSnapshot(s, PIN), PIN);
    assert.equal(plaintext[0], 0x01);
    const json = inflateRawSync(plaintext.subarray(1)).toString('utf8');
    assert.equal(json, JSON.stringify(normalizeGuardianSnapshot(s)));
    assert.ok(plaintext.length < Buffer.byteLength(json) / 3, '압축돼야 한다');
  });

  test('CompressionStream 이 없으면 0x00 + 그대로의 JSON 으로 암호화하고, 풀 때 둘 다 읽는다', async () => {
    const s = snapshot();
    const fragment = await withoutGlobal('CompressionStream', () => encryptSnapshot(s, PIN));
    const plaintext = await openPlaintext(fragment, PIN);
    assert.equal(plaintext[0], 0x00);
    assert.equal(Buffer.from(plaintext.subarray(1)).toString('utf8'), JSON.stringify(normalizeGuardianSnapshot(s)));
    assert.deepEqual(await decryptSnapshot(fragment, PIN), s);
    const size = await withoutGlobal('CompressionStream', () => measureGuardianLink(s));
    assert.equal(size.format, 'RAW_JSON');
    assert.equal(fragment.length, size.fragmentChars);
  });

  test('다른 구현(zlib)이 만든 0x01 평문도 풀고, 허용 목록을 다시 적용한다', async () => {
    const s = snapshot();
    const tampered = { ...s, hospital: { name: 'FORBIDDEN_HOSPITAL_NAME' } };
    const plaintext = Buffer.concat([Buffer.from([0x01]), deflateRawSync(Buffer.from(JSON.stringify(tampered)))]);
    const restored = await decryptSnapshot(await sealPlaintext(plaintext, PIN), PIN);
    assert.deepEqual(restored, s);
    assert.equal(JSON.stringify(restored).includes(FORBIDDEN_MARK), false);
  });

  test('모르는 표지는 UNSUPPORTED_FORMAT', async () => {
    const plaintext = Buffer.concat([Buffer.from([0x02]), Buffer.from(JSON.stringify(snapshot()))]);
    await assert.rejects(decryptSnapshot(await sealPlaintext(plaintext, PIN), PIN), hasCode(GUARDIAN_ERROR.UNSUPPORTED_FORMAT));
  });

  test('압축 해제 기능이 없는 환경에서 0x01 평문은 UNSUPPORTED_FORMAT', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(
      withoutGlobal('DecompressionStream', () => decryptSnapshot(fragment, PIN)),
      hasCode(GUARDIAN_ERROR.UNSUPPORTED_FORMAT),
    );
  });

  test('비어 있거나 깨진 평문, 지나치게 커지는 압축은 INVALID_SNAPSHOT', async () => {
    const cases = [
      Buffer.from([0x01]),
      Buffer.from([0x01, 0xff, 0xfe, 0xfd]),
      Buffer.concat([Buffer.from([0x00]), Buffer.from('{not json')]),
      Buffer.concat([Buffer.from([0x01]), deflateRawSync(Buffer.alloc(6 * 1024 * 1024, 0x20))]),
    ];
    for (const plaintext of cases) {
      await assert.rejects(decryptSnapshot(await sealPlaintext(plaintext, PIN), PIN), hasCode(GUARDIAN_ERROR.INVALID_SNAPSHOT));
    }
  });
});

describe('링크 형식 (규칙 38: 암호문은 # 뒤에만)', () => {
  test('링크 = <origin>/g#<암호문>', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    const link = buildGuardianLink(ORIGIN, fragment);
    assert.equal(link, `${ORIGIN}/g#${fragment}`);
    assert.equal(GUARDIAN_PATH, '/g');
  });

  test('서버로 가는 부분(경로·쿼리)에는 암호문이 없다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    const url = new URL(buildGuardianLink(ORIGIN, fragment));
    assert.equal(url.pathname, '/g');
    assert.equal(url.search, '');
    assert.equal(url.hash, `#${fragment}`);
    const requestTarget = `${url.origin}${url.pathname}${url.search}`;
    assert.equal(requestTarget.includes(fragment), false);
    assert.equal(requestTarget.includes(fragment.slice(0, 16)), false);
    assert.equal(link(fragment).indexOf(fragment), link(fragment).indexOf('#') + 1);
  });

  test('origin 끝의 / 는 정리하고, 경로·쿼리·해시·계정이 붙은 origin 은 거부한다', () => {
    const fragment = 'A'.repeat(80);
    assert.equal(buildGuardianLink(`${ORIGIN}/`, fragment), `${ORIGIN}/g#${fragment}`);
    assert.equal(buildGuardianLink('http://localhost:3000', fragment), `http://localhost:3000/g#${fragment}`);
    for (const bad of [`${ORIGIN}/app`, `${ORIGIN}?x=1`, `${ORIGIN}#x`, 'https://user:pw@safehour.example', 'ftp://safehour.example', 'safehour.example', '', null]) {
      assert.throws(() => buildGuardianLink(bad, fragment), TypeError, String(bad));
    }
  });

  test('암호문 형식이 아니면 링크를 만들지 않는다', () => {
    for (const bad of ['', 'abc/def', 'a+b', 'has=pad', 'x', null, `${'A'.repeat(80)}#more`]) {
      assert.throws(() => buildGuardianLink(ORIGIN, bad), TypeError, String(bad));
    }
  });

  test('링크 해석은 # 뒤의 암호문만 돌려준다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    assert.equal(isGuardianFragment(fragment), true);
    assert.equal(parseGuardianLink(buildGuardianLink(ORIGIN, fragment)), fragment);
    assert.equal(parseGuardianLink(`${ORIGIN}/g/#${fragment}`), fragment);
    assert.equal(parseGuardianLink(`${ORIGIN}/g?utm_source=chat#${fragment}`), fragment);
    assert.equal(parseGuardianLink(`#${fragment}`), fragment);
    assert.deepEqual(await decryptSnapshot(parseGuardianLink(buildGuardianLink(ORIGIN, fragment)), PIN), snapshot());
  });

  test('암호문이 경로·쿼리에 있거나 # 이 없으면 읽지 않는다(null)', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    for (const bad of [
      `${ORIGIN}/g?c=${fragment}`,
      `${ORIGIN}/g/${fragment}`,
      `${ORIGIN}/g`,
      `${ORIGIN}/g#`,
      `${ORIGIN}/guardian#${fragment}`,
      `${ORIGIN}/#${fragment}`,
      `javascript:alert(1)#${fragment}`,
      `#${fragment}!`,
      '#abc',
      fragment,
      '',
      null,
      undefined,
    ]) {
      assert.equal(parseGuardianLink(bad), null, String(bad).slice(0, 60));
    }
  });

  test('끝 글자만 달라 같은 바이트로 풀리는 글(나머지 2 는 16가지, 나머지 3 은 4가지) 가운데 정규 끝 하나만 받는다', () => {
    // atob 는 남는 비트를 버린다. PIN 잠금 키는 암호문 글마다 따로라, 받아들이면 같은 링크의 잠금 횟수가 글자 바꿈마다 새로 시작된다
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (const [bytes, rest, count] of [
      [121, 2, 16],
      [122, 3, 4],
    ]) {
      for (let round = 0; round < 25; round += 1) {
        const fragment = toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
        assert.equal(fragment.length % 4, rest);
        const same = [...alphabet]
          .map((ch) => `${fragment.slice(0, -1)}${ch}`)
          .filter((variant) => isGuardianFragment(variant) && toBase64Url(fromBase64Url(variant)) === fragment);
        assert.equal(same.length, count, `나머지 ${rest}`);
        for (const variant of same) {
          const expected = variant === fragment ? fragment : null;
          assert.equal(parseGuardianLink(`#${variant}`), expected, `#암호문 나머지 ${rest}`);
          assert.equal(parseGuardianLink(`${ORIGIN}/g#${variant}`), expected, `링크 나머지 ${rest}`);
          assert.equal(parseGuardianLink(`${ORIGIN}/g/?utm_source=chat#${variant}`), expected, `쿼리 붙은 링크 나머지 ${rest}`);
          // 붙여넣기도 같은 검사다(링크 전체, 문장 속 링크, # 없는 암호문)
          assert.equal(fragmentFromPasted(`${ORIGIN}/g#${variant}`), expected);
          assert.equal(fragmentFromPasted(`보호자 링크 ${ORIGIN}/g#${variant} 입니다`), expected);
          assert.equal(fragmentFromPasted(variant), expected);
        }
      }
    }
  });

  test('빌더가 만든 링크는 길이 나머지와 상관없이 모두 받고, 잠금 키는 암호문 글 그대로의 SHA-256 이다', async () => {
    const rests = new Set();
    for (let i = 0; i < 300; i += 1) {
      const fragment = toBase64Url(crypto.getRandomValues(new Uint8Array(60 + (i % 97))));
      rests.add(fragment.length % 4);
      assert.equal(parseGuardianLink(buildGuardianLink(ORIGIN, fragment)), fragment);
      assert.equal(parseGuardianLink(`#${fragment}`), fragment);
      if (i % 30 === 0) {
        const parsed = parseGuardianLink(buildGuardianLink(ORIGIN, fragment));
        assert.equal(
          await pinLockoutKey(parsed),
          `${PIN_LOCKOUT_KEY_PREFIX}${createHash('sha256').update(fragment).digest('hex')}`,
        );
      }
    }
    assert.deepEqual([...rests].sort(), [0, 2, 3]);
    // 실제 암호문도 같다
    const real = await encryptSnapshot(snapshot(), PIN);
    assert.equal(parseGuardianLink(buildGuardianLink(ORIGIN, real)), real);
  });
});

function link(fragment) {
  return buildGuardianLink(ORIGIN, fragment);
}
