// 웹 푸시 본문 암호화 (RFC 8291 'Message Encryption for Web Push', RFC 8188 aes128gcm). src/push/AGENTS.md
//
// Node 표준 암호 기능(`node:crypto`)만 쓴다. 새 라이브러리는 없다(docs/standards.md '의존성').
//
// - 공유 비밀: 임시 P-256 개인키와 구독 공개키(p256dh)의 ECDH
// - ikm   = HKDF-SHA256(ikm=공유 비밀, salt=auth, info='WebPush: info\0' | p256dh | 임시 공개키, 32)
// - cek   = HKDF-SHA256(ikm, salt, 'Content-Encoding: aes128gcm\0', 16)
// - nonce = HKDF-SHA256(ikm, salt, 'Content-Encoding: nonce\0', 12)
// - 평문 끝에 구분 바이트 0x02(마지막 레코드)를 붙여 AES-128-GCM 으로 감싼다. 레코드는 하나뿐이다.
// - 본문 = salt(16) | 레코드 크기 uint32 BE 4096 | 키 길이 65 | 임시 공개키(65) | 암호문+태그(16)
//
// 오류 메시지에는 키·평문 값을 넣지 않는다. 코드만 보고 판단한다.

import { createCipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

/** 본문 상한. 푸시 서비스가 4096바이트까지만 받도록 정해져 있다(RFC 8030 7.2) */
export const MAX_PUSH_BODY_BYTES = 4096;
export const RECORD_SIZE = 4096;
export const SALT_BYTES = 16;
export const AUTH_BYTES = 16;
export const PUBLIC_KEY_BYTES = 65;
export const PRIVATE_KEY_BYTES = 32;
export const TAG_BYTES = 16;
/** 마지막 레코드의 구분 바이트. 0x01 은 중간 레코드라 쓰지 않는다 */
export const LAST_RECORD_DELIMITER = 0x02;
/** salt(16) + 레코드 크기(4) + 키 길이(1) + 임시 공개키(65) */
export const HEADER_BYTES = SALT_BYTES + 4 + 1 + PUBLIC_KEY_BYTES;
/** 본문이 4096바이트를 넘지 않는 가장 긴 평문: 4096 - 86 - 구분 1 - 태그 16 = 3993 */
export const MAX_PLAINTEXT_BYTES = MAX_PUSH_BODY_BYTES - HEADER_BYTES - 1 - TAG_BYTES;

export const PUSH_ERROR = Object.freeze({
  KEY: 'PUSH_KEY',
  PAYLOAD_TOO_LARGE: 'PUSH_PAYLOAD_TOO_LARGE',
  VAPID: 'PUSH_VAPID',
});

/** 푸시 모듈의 오류. 메시지는 고정 문장이고 키·endpoint·응답 원문을 담지 않는다 */
export class PushError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PushError';
    this.code = code;
  }
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * base64url 문자열을 정해진 길이의 바이트로 읽는다. 형식이나 길이가 틀리면 null.
 * Buffer.from 은 틀린 문자를 조용히 건너뛰므로 먼저 문자 집합을 본다.
 */
export function decodeBase64UrlBytes(value, length) {
  if (typeof value !== 'string' || value.length > 200 || !BASE64URL_RE.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === length ? bytes : null;
}

function keyError() {
  return new PushError(PUSH_ERROR.KEY, '구독 키 형식이 올바르지 않습니다');
}

/** 65바이트 비압축 점(0x04 로 시작)인가. 곡선 위에 있는지는 ECDH 계산이 확인한다 */
export function isUncompressedPoint(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length === PUBLIC_KEY_BYTES && bytes[0] === 0x04;
}

/** RFC 8291 3.4 의 키 유도. 암호화와 복호화가 같은 함수를 쓴다 */
export function deriveContentKeys({ sharedSecret, auth, uaPublic, asPublic, salt }) {
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12));
  return { cek, nonce };
}

/**
 * 푸시 본문을 암호화한다.
 *
 * @param {object} input
 * @param {Buffer|string} input.plaintext  문자열이면 UTF-8 로 읽는다. 3993바이트 이하
 * @param {string} input.p256dh  구독 공개키, 65바이트 비압축 점의 base64url
 * @param {string} input.auth    구독 인증 비밀, 16바이트의 base64url
 * @param {Buffer} [input.salt]             시험용. 주지 않으면 매번 새로 뽑는다
 * @param {Buffer} [input.localPrivateKey]  시험용 임시 개인키(32바이트). 주지 않으면 매번 새로 만든다
 * @returns {Buffer}
 * @throws {PushError} PUSH_KEY · PUSH_PAYLOAD_TOO_LARGE
 */
export function encryptPushPayload({ plaintext, p256dh, auth, salt, localPrivateKey }) {
  const uaPublic = decodeBase64UrlBytes(p256dh, PUBLIC_KEY_BYTES);
  const authSecret = decodeBase64UrlBytes(auth, AUTH_BYTES);
  if (!isUncompressedPoint(uaPublic) || !authSecret) throw keyError();

  if (typeof plaintext !== 'string' && !(plaintext instanceof Uint8Array)) {
    throw new TypeError('plaintext 는 문자열이나 바이트여야 합니다');
  }
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : Buffer.from(plaintext);
  if (data.length > MAX_PLAINTEXT_BYTES) {
    throw new PushError(PUSH_ERROR.PAYLOAD_TOO_LARGE, '푸시 본문이 4096바이트를 넘습니다');
  }

  const saltBytes = salt ?? randomBytes(SALT_BYTES);
  if (!Buffer.isBuffer(saltBytes) || saltBytes.length !== SALT_BYTES) throw keyError();

  const ecdh = createECDH('prime256v1');
  let sharedSecret;
  try {
    if (localPrivateKey === undefined) {
      ecdh.generateKeys();
    } else {
      if (!Buffer.isBuffer(localPrivateKey) || localPrivateKey.length !== PRIVATE_KEY_BYTES) throw keyError();
      ecdh.setPrivateKey(localPrivateKey);
    }
    sharedSecret = ecdh.computeSecret(uaPublic);
  } catch {
    // 곡선 밖의 점이나 0 개인키. node:crypto 의 원래 메시지는 버린다
    throw keyError();
  }
  const asPublic = ecdh.getPublicKey(null, 'uncompressed');

  const { cek, nonce } = deriveContentKeys({ sharedSecret, auth: authSecret, uaPublic, asPublic, salt: saltBytes });
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.update(Buffer.of(LAST_RECORD_DELIMITER)), cipher.final()]);

  const header = Buffer.alloc(HEADER_BYTES);
  saltBytes.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
  header.writeUInt8(PUBLIC_KEY_BYTES, SALT_BYTES + 4);
  asPublic.copy(header, SALT_BYTES + 5);
  return Buffer.concat([header, ciphertext, cipher.getAuthTag()]);
}
