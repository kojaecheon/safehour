// 보호자 스냅샷 평문 형식 — 첫 바이트 표지 + (압축된) 정규 JSON (AX-313)
//
// 암호화하는 평문(바깥 형식 base64url(salt | iv | ciphertext) 의 ciphertext 안쪽)은 다음과 같다.
//
//   평문 = 표지(1바이트) | 본문
//   0x00 RAW_JSON          본문 = UTF-8 정규 JSON
//   0x01 DEFLATE_RAW_JSON  본문 = deflate-raw(RFC 1951)로 압축한 UTF-8 정규 JSON
//
// - 정규 JSON = JSON.stringify(normalizeGuardianSnapshot(snapshot)) — 허용 목록을 거친, 키 순서가 고정된 JSON
// - 압축은 표준 CompressionStream('deflate-raw')만 쓴다(새 라이브러리 없음).
//   Chrome 103+, Safari 16.4+, Firefox 113+, Node 20.12+/21.2+ 가 지원한다.
//   암호화 때 쓸 수 없으면(오래된 환경) 0x00 으로 떨어진다. 복호화는 둘 다 읽는다.
// - 압축 해제는 5 MB 에서 멈춘다(부풀리기 방어). 45박 최악 크기 스냅샷의 JSON 도 이보다 훨씬 작다.

import { GUARDIAN_ERROR, GuardianError } from './errors.js';
import { normalizeGuardianSnapshot } from './snapshot.js';

export const PLAINTEXT_FORMAT = Object.freeze({ RAW_JSON: 0x00, DEFLATE_RAW_JSON: 0x01 });
const FORMAT_NAME = Object.freeze({ [PLAINTEXT_FORMAT.RAW_JSON]: 'RAW_JSON', [PLAINTEXT_FORMAT.DEFLATE_RAW_JSON]: 'DEFLATE_RAW_JSON' });
const MAX_JSON_BYTES = 5 * 1024 * 1024;

/** 변환 스트림에 바이트를 넣고 결과를 모두 읽는다. maxBytes 를 넘으면 RangeError */
async function pump(transform, input, maxBytes) {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const writing = writer.write(input).then(() => writer.close());
  // 쓰기 쪽 오류는 읽기 쪽에서도 드러난다. 처리되지 않은 거부로 남지 않게 한다
  writing.catch(() => {});

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RangeError('변환 결과가 너무 큽니다');
    }
    chunks.push(value);
  }
  await writing;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** deflate-raw 로 압축한다. 이 환경에서 쓸 수 없거나 실패하면 null */
async function tryDeflateRaw(bytes) {
  const Compression = globalThis.CompressionStream;
  if (typeof Compression !== 'function') return null;
  let stream;
  try {
    stream = new Compression('deflate-raw');
  } catch {
    return null;
  }
  try {
    return await pump(stream, bytes, Number.POSITIVE_INFINITY);
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  const Decompression = globalThis.DecompressionStream;
  const unsupported = () => new GuardianError(GUARDIAN_ERROR.UNSUPPORTED_FORMAT, '이 브라우저에서는 보호자 링크를 열 수 없습니다');
  if (typeof Decompression !== 'function') throw unsupported();
  let stream;
  try {
    stream = new Decompression('deflate-raw');
  } catch {
    throw unsupported();
  }
  try {
    return await pump(stream, bytes, MAX_JSON_BYTES);
  } catch {
    throw new GuardianError(GUARDIAN_ERROR.INVALID_SNAPSHOT, '보호자 스냅샷 형식이 올바르지 않습니다');
  }
}

/**
 * 스냅샷 → 평문 바이트(표지 + 본문). 허용 목록을 먼저 다시 적용한다.
 * @param {import('./snapshot.js').GuardianSnapshot} snapshot
 * @returns {Promise<{bytes: Uint8Array, format: 'RAW_JSON'|'DEFLATE_RAW_JSON', jsonBytes: number}>}
 * @throws {GuardianError} INVALID_SNAPSHOT
 */
export async function encodeSnapshotPlaintext(snapshot) {
  const json = new TextEncoder().encode(JSON.stringify(normalizeGuardianSnapshot(snapshot)));
  const compressed = await tryDeflateRaw(json);
  const marker = compressed ? PLAINTEXT_FORMAT.DEFLATE_RAW_JSON : PLAINTEXT_FORMAT.RAW_JSON;
  const body = compressed ?? json;
  const bytes = new Uint8Array(1 + body.length);
  bytes[0] = marker;
  bytes.set(body, 1);
  return { bytes, format: FORMAT_NAME[marker], jsonBytes: json.length };
}

/**
 * 평문 바이트 → JSON 값 (허용 목록 적용 전). 호출하는 쪽이 normalizeGuardianSnapshot 을 적용한다.
 * @param {Uint8Array} bytes
 * @returns {Promise<unknown>}
 * @throws {GuardianError} UNSUPPORTED_FORMAT(모르는 표지, 압축 해제 불가) · INVALID_SNAPSHOT(비었거나 깨짐, 너무 큼)
 */
export async function decodeSnapshotPlaintext(bytes) {
  const invalid = () => new GuardianError(GUARDIAN_ERROR.INVALID_SNAPSHOT, '보호자 스냅샷 형식이 올바르지 않습니다');
  if (!(bytes instanceof Uint8Array) || bytes.length < 2) throw invalid();
  const marker = bytes[0];
  const body = bytes.subarray(1);
  let json;
  if (marker === PLAINTEXT_FORMAT.RAW_JSON) json = body;
  else if (marker === PLAINTEXT_FORMAT.DEFLATE_RAW_JSON) json = await inflateRaw(body);
  else throw new GuardianError(GUARDIAN_ERROR.UNSUPPORTED_FORMAT, '보호자 링크 형식을 알 수 없습니다');
  if (json.length > MAX_JSON_BYTES) throw invalid();
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
  } catch {
    throw invalid();
  }
}
