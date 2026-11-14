// VAPID 서명 (RFC 8292 'Voluntary Application Server Identification for Web Push'). src/push/AGENTS.md
//
// - JWT 머리 { typ: 'JWT', alg: 'ES256' }, 클레임 { aud, exp, sub }
// - aud 는 endpoint 의 출처(url.origin), exp 는 지금 + 12시간(초), sub 는 운영 연락처(mailto: 또는 https:)
// - 서명은 P-256 ECDSA SHA-256, r|s 64바이트(ieee-p1363)
// - 헤더: Authorization: vapid t=<JWT>, k=<공개키 base64url>
//
// JWT 는 출처마다 기억해 두고 남은 수명이 1시간을 넘는 동안 다시 쓴다.
// Apple 푸시 서비스는 같은 출처의 토큰을 한 시간에 한 번 넘게 새로 만들지 말라고 한다.
// 키는 호출하는 쪽이 넘긴다. 이 파일은 환경변수를 읽지 않는다.

import { createECDH, createPrivateKey, sign } from 'node:crypto';

import { PRIVATE_KEY_BYTES, PUBLIC_KEY_BYTES, PUSH_ERROR, PushError, decodeBase64UrlBytes, isUncompressedPoint } from './encrypt.js';

const JWT_LIFETIME_SEC = 12 * 60 * 60;
/** 남은 수명이 이보다 짧으면 새로 만든다 */
const JWT_REUSE_MIN_REMAINING_SEC = 60 * 60;
/** 출처별 기억 상한. 허용 호스트는 몇 개뿐이라 넘을 일이 거의 없다 */
const MAX_CACHED_ORIGINS = 64;

const JWT_HEADER = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');

function vapidError(message) {
  return new PushError(PUSH_ERROR.VAPID, message);
}

/** 연락처가 mailto: 또는 https: 로 시작하는가 (RFC 8292 2.1) */
export function isValidVapidSubject(value) {
  return typeof value === 'string' && value.length <= 512 && /^(mailto:|https:)\S+$/.test(value);
}

/**
 * VAPID 서명기를 만든다.
 *
 * @param {object} input
 * @param {string} input.publicKey   65바이트 비압축 점의 base64url
 * @param {string} input.privateKey  32바이트 개인 스칼라의 base64url
 * @param {string} input.subject     mailto: 또는 https: 연락처
 * @returns {{ authorizationFor(endpointUrl: string, nowMs: number): string }}
 * @throws {PushError} PUSH_VAPID (키 형식이 틀리거나 두 키가 짝이 아니거나 연락처가 틀림)
 */
export function createVapidSigner({ publicKey, privateKey, subject }) {
  const pub = decodeBase64UrlBytes(publicKey, PUBLIC_KEY_BYTES);
  const priv = decodeBase64UrlBytes(privateKey, PRIVATE_KEY_BYTES);
  if (!isUncompressedPoint(pub) || !priv) throw vapidError('VAPID 키 형식이 올바르지 않습니다');
  if (!isValidVapidSubject(subject)) throw vapidError('VAPID 연락처는 mailto: 또는 https: 로 시작해야 합니다');

  let keyObject;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    if (!ecdh.getPublicKey(null, 'uncompressed').equals(pub)) throw new Error('mismatch');
    keyObject = createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: pub.subarray(1, 33).toString('base64url'),
        y: pub.subarray(33, 65).toString('base64url'),
        d: priv.toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    throw vapidError('VAPID 공개키와 개인키가 짝이 아닙니다');
  }

  const k = pub.toString('base64url');
  /** @type {Map<string, { header: string, expSec: number }>} */
  const cache = new Map();

  function makeJwt(aud, expSec) {
    const claims = Buffer.from(JSON.stringify({ aud, exp: expSec, sub: subject })).toString('base64url');
    const signingInput = `${JWT_HEADER}.${claims}`;
    const signature = sign('sha256', Buffer.from(signingInput), { key: keyObject, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${signature.toString('base64url')}`;
  }

  return {
    /**
     * endpoint 출처에 맞는 Authorization 헤더 값을 돌려준다.
     * @throws {PushError} PUSH_VAPID (endpoint 가 URL 이 아니거나 시각이 숫자가 아님)
     */
    authorizationFor(endpointUrl, nowMs) {
      let aud;
      try {
        aud = new URL(endpointUrl).origin;
      } catch {
        throw vapidError('푸시 주소 형식이 올바르지 않습니다');
      }
      if (aud === 'null' || !Number.isFinite(nowMs)) throw vapidError('VAPID 서명 입력이 올바르지 않습니다');

      const nowSec = Math.floor(nowMs / 1000);
      const cached = cache.get(aud);
      if (cached && cached.expSec - nowSec > JWT_REUSE_MIN_REMAINING_SEC) return cached.header;

      const expSec = nowSec + JWT_LIFETIME_SEC;
      const header = `vapid t=${makeJwt(aud, expSec)}, k=${k}`;
      if (!cache.has(aud) && cache.size >= MAX_CACHED_ORIGINS) cache.clear();
      cache.set(aud, { header, expSec });
      return header;
    },
  };
}
