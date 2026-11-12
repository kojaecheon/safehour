// 일정 지문 (AX-312 · guardianShare.planFingerprint, docs/security.md '기기 저장소와 계정 이름공간', docs/business-rules.md '보호자')
//
// 보호자 링크를 보낸 뒤 환자 일정이 바뀌었는지 판단하는 **단 하나의** 함수다.
// 링크를 만드는 화면(T17)과 변화 감지(T15a)가 같은 함수를 써야 '다시 보내기' 판단이 어긋나지 않는다.
//
// 입력은 보호자 스냅샷에 들어가는 내용만이다(만든 시각처럼 매번 바뀌는 값은 호출부가 빼고 넘긴다).
// 정규화 JSON(객체 키 정렬, 배열 순서 유지, JSON 과 같은 undefined·NaN 규칙) → SHA-256 → 16진수 64자.
// 표준 Web Crypto(`crypto.subtle`)만 쓴다 — 브라우저와 Node 20+ 모두 전역에 있다.

function serialize(input, stack) {
  let value = input;
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') value = value.toJSON();

  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      throw new TypeError('BigInt 는 지문에 넣을 수 없습니다.');
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    default:
      break;
  }

  if (stack.has(value)) throw new TypeError('순환 참조는 지문에 넣을 수 없습니다.');
  stack.add(value);
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((item) => serialize(item, stack) ?? 'null').join(',')}]`;
  } else {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      const encoded = serialize(value[key], stack);
      if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    out = `{${parts.join(',')}}`;
  }
  stack.delete(value);
  return out;
}

/** 키 순서와 무관한 정규화 JSON 문자열 */
export function canonicalJson(value) {
  const text = serialize(value, new Set());
  if (text === undefined) throw new TypeError('지문에 넣을 값이 없습니다.');
  return text;
}

/**
 * 일정 지문 — 정규화 JSON 의 SHA-256 16진수(64자).
 * @param {unknown} snapshotContent 보호자 스냅샷에 담기는 내용
 * @returns {Promise<string>}
 */
export async function planFingerprint(snapshotContent) {
  const text = canonicalJson(snapshotContent);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('이 환경에는 Web Crypto 가 없습니다.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** planFingerprint 결과 형식 */
export const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
