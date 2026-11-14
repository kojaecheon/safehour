// 웹 푸시 본문 복호화 (RFC 8291, aes128gcm). src/push/AGENTS.md
//
// 운영 경로는 이 함수를 쓰지 않는다. 테스트와 데모 모드의 가짜 푸시 서비스가 받은 본문을 풀어 볼 때만 쓴다.
// 암호화(encrypt.js)와 같은 키 유도를 쓰고, 레코드는 하나뿐인 본문만 받는다.

import { createDecipheriv, createECDH } from 'node:crypto';

import {
  AUTH_BYTES,
  HEADER_BYTES,
  LAST_RECORD_DELIMITER,
  PRIVATE_KEY_BYTES,
  PUBLIC_KEY_BYTES,
  PUSH_ERROR,
  PushError,
  SALT_BYTES,
  TAG_BYTES,
  decodeBase64UrlBytes,
  deriveContentKeys,
  isUncompressedPoint,
} from './encrypt.js';

function decryptError() {
  return new PushError(PUSH_ERROR.KEY, '푸시 본문을 풀 수 없습니다');
}

/**
 * 구독 쪽 개인키로 푸시 본문을 푼다.
 *
 * @param {object} input
 * @param {Buffer} input.body        암호화된 본문
 * @param {Buffer} input.privateKey  구독 개인키(32바이트)
 * @param {string} input.auth        구독 인증 비밀, 16바이트의 base64url
 * @returns {Buffer}  평문 (구분 바이트와 채움을 뗀 것)
 * @throws {PushError} PUSH_KEY (키·형식이 틀리거나 인증 실패)
 */
export function decryptPushPayload({ body, privateKey, auth }) {
  const authSecret = decodeBase64UrlBytes(auth, AUTH_BYTES);
  if (!authSecret || !Buffer.isBuffer(privateKey) || privateKey.length !== PRIVATE_KEY_BYTES) throw decryptError();
  if (!Buffer.isBuffer(body) || body.length < HEADER_BYTES + 1 + TAG_BYTES) throw decryptError();

  const salt = body.subarray(0, SALT_BYTES);
  const recordSize = body.readUInt32BE(SALT_BYTES);
  const idLength = body.readUInt8(SALT_BYTES + 4);
  if (idLength !== PUBLIC_KEY_BYTES || body.length > recordSize + HEADER_BYTES) throw decryptError();
  const asPublic = body.subarray(SALT_BYTES + 5, HEADER_BYTES);
  if (!isUncompressedPoint(asPublic)) throw decryptError();
  const ciphertext = body.subarray(HEADER_BYTES, body.length - TAG_BYTES);
  const tag = body.subarray(body.length - TAG_BYTES);

  let padded;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey);
    const uaPublic = ecdh.getPublicKey(null, 'uncompressed');
    const sharedSecret = ecdh.computeSecret(asPublic);
    const { cek, nonce } = deriveContentKeys({ sharedSecret, auth: authSecret, uaPublic, asPublic, salt });
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(tag);
    padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw decryptError();
  }

  // 끝의 0 채움을 걷어 내고 마지막 바이트가 구분 바이트 0x02 인지 본다(RFC 8188 2)
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (end < 0 || padded[end] !== LAST_RECORD_DELIMITER) throw decryptError();
  return padded.subarray(0, end);
}
