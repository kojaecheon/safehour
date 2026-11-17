// 보호자 링크 조립·해석 (AX-313 · docs/security.md '보호자 링크')
//
// 링크 = <origin>/g#<암호문>
// 암호문은 # 뒤(URL 조각)에만 둔다. 브라우저는 조각을 서버 요청에 싣지 않으므로 서버는 암호문을 받지도, 저장하지도 않는다.
// 해석도 # 뒤만 읽는다 — 경로·쿼리에 실린 값은 암호문으로 받아들이지 않는다.

import { IV_BYTES, PIN_LENGTH, SALT_BYTES, TAG_BYTES, isGuardianFragment } from './crypto.js';
import { encodeSnapshotPlaintext } from './encoding.js';

export const GUARDIAN_PATH = '/g';
/** 메신저로 보내기 좋은 링크 길이 기준(문자 수 = 바이트 수, ASCII) — 7박 최악 크기 일정이 이 안에 든다 */
export const GUARDIAN_LINK_BUDGET_CHARS = 8 * 1024;
const WEB_PROTOCOLS = Object.freeze(['https:', 'http:']);

/** 검증한 origin 으로 링크의 암호문 앞부분 `${origin}/g#` 을 만든다 */
function linkPrefix(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new TypeError('buildGuardianLink: origin 형식이 올바르지 않습니다');
  }
  if (!WEB_PROTOCOLS.includes(url.protocol)) throw new TypeError('buildGuardianLink: http(s) origin 만 쓸 수 있습니다');
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new TypeError('buildGuardianLink: origin 에는 경로·쿼리·해시·계정 정보를 넣을 수 없습니다');
  }
  // `origin` 문자열에 '?'·'#' 만 붙은 경우(new URL 이 빈 값으로 정리함)도 거부한다
  if (/[?#]/.test(String(origin))) throw new TypeError('buildGuardianLink: origin 에는 쿼리·해시를 넣을 수 없습니다');
  return `${url.origin}${GUARDIAN_PATH}#`;
}

/**
 * 보호자 링크를 만든다.
 * @param {string} origin  예: `window.location.origin`. 경로·쿼리·해시·계정 정보가 있으면 거부한다(끝의 / 는 정리)
 * @param {string} fragment  encryptSnapshot 결과
 * @returns {string}  `${origin}/g#${fragment}`
 * @throws {TypeError}
 */
export function buildGuardianLink(origin, fragment) {
  if (!isGuardianFragment(fragment)) throw new TypeError('buildGuardianLink: 암호문 형식이 올바르지 않습니다');
  return `${linkPrefix(origin)}${fragment}`;
}

/**
 * 스냅샷으로 만들 링크의 크기를 잰다 — 암호화하지 않고 같은 평문 인코딩(허용 목록 → 정규 JSON → 압축)을 거친다.
 * 암호문 길이는 PIN·salt·IV 와 무관하므로 encryptSnapshot 결과와 길이가 같다.
 *
 * @param {import('./snapshot.js').GuardianSnapshot} snapshot
 * @param {{origin?: string}} [options]  origin 을 주면 링크 전체 길이도 잰다
 * @returns {Promise<{format: 'RAW_JSON'|'DEFLATE_RAW_JSON', jsonBytes: number, plaintextBytes: number,
 *   payloadBytes: number, fragmentChars: number, linkChars: number|null}>}
 *   jsonBytes: 정규 JSON(UTF-8), plaintextBytes: 표지 + (압축된) 본문, payloadBytes: salt + iv + 암호문 + 태그,
 *   fragmentChars: # 뒤 base64url 문자 수, linkChars: 링크 전체 문자 수(origin 이 없으면 null)
 */
export async function measureGuardianLink(snapshot, { origin } = {}) {
  const prefix = origin === undefined ? null : linkPrefix(origin);
  const { bytes, format, jsonBytes } = await encodeSnapshotPlaintext(snapshot);
  const payloadBytes = SALT_BYTES + IV_BYTES + bytes.length + TAG_BYTES;
  // 패딩 없는 base64: 3바이트마다 4자, 나머지 1·2바이트는 2·3자
  const fragmentChars = Math.ceil((payloadBytes * 4) / 3);
  return {
    format,
    jsonBytes,
    plaintextBytes: bytes.length,
    payloadBytes,
    fragmentChars,
    linkChars: prefix === null ? null : prefix.length + fragmentChars,
  };
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 암호문 끝이 패딩 없는 정규 base64url 인가. 암호문은 crypto.js toBase64Url(btoa)이 만들어 남는 비트가 0 이다:
 * 길이를 4로 나눈 나머지 2 는 끝 글자 값의 아래 4비트가 0(A·Q·g·w), 나머지 3 은 아래 2비트가 0, 나머지 1 은 길이가 될 수 없다
 */
function hasCanonicalTail(fragment) {
  const rest = fragment.length % 4;
  if (rest === 0) return true;
  if (rest === 1) return false;
  const value = BASE64URL_ALPHABET.indexOf(fragment[fragment.length - 1]);
  return value >= 0 && (value & (rest === 2 ? 0b1111 : 0b11)) === 0;
}

/**
 * 보호자 링크 또는 `location.hash` 에서 암호문을 꺼낸다.
 * - 절대 URL: http(s) 이고 경로가 `/g`(또는 `/g/`)일 때 # 뒤만 읽는다. 쿼리(예: 메신저가 붙인 utm)는 무시한다.
 * - `#...` 문자열: # 뒤를 읽는다.
 * - 그 밖(경로·쿼리에 암호문, # 없음, 형식이 틀린 암호문)은 null.
 * - 끝이 정규 base64url 이 아니면(남는 비트가 0 이 아니면) null. atob 는 남는 비트를 버려 끝 글자만 다른 여러 글이 같은 바이트로
 *   풀리는데, PIN 잠금 키는 암호문 글(SHA-256)마다 따로라 그런 글마다 잠금 횟수가 새로 시작된다. 링크를 만드는 쪽(toBase64Url)은
 *   늘 정규 끝이라 진짜 링크는 모두 받는다. 붙여넣기(fragmentFromPasted)도 같은 검사(hasCanonicalTail)를 쓴다.
 * @param {string} input
 * @returns {string|null}
 */
export function parseGuardianLink(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  let fragment;
  if (text.startsWith('#')) {
    fragment = text.slice(1);
  } else {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!WEB_PROTOCOLS.includes(url.protocol)) return null;
    if (url.pathname !== GUARDIAN_PATH && url.pathname !== `${GUARDIAN_PATH}/`) return null;
    fragment = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  }
  return isGuardianFragment(fragment) && hasCanonicalTail(fragment) ? fragment : null;
}

/** 붙여넣기 칸이 받는 글 길이 상한(UTF-16 단위, 입력란 maxLength 와 같은 값). 7일 최악 크기 링크(6,538자)가 넉넉히 든다 */
export const PASTE_MAX_CHARS = 32_768;
/** 보이지 않는 글자: 줄바꿈 자리 표시(U+00AD), 폭 없는 공백·연결자·방향 표시(U+200B~U+200F), 단어 연결자(U+2060), BOM(U+FEFF) */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
/**
 * 글 속 첫 http(s) 링크 토큰(스킴 대소문자 무시). 보호자 링크는 ASCII 뿐이므로 공백·제어 문자·ASCII 밖 글자
 * (「」·。·，·“” 같은 문장부호와 한중일 글자) 앞에서 끊는다
 */
const FIRST_WEB_LINK_RE = /https?:\/\/[\x21-\x7E]+/i;
/** 링크 토큰 끝에서 떼는 글자: ASCII 문장부호와 WhatsApp 서식 표시(* 굵게, ~ 취소선). 암호문 글자([A-Za-z0-9_-])는 없다 */
const TRAILING_MARKS = new Set([...'.,;:!?\'")]}>*~']);
/** 링크 토큰 바로 앞의 WhatsApp 서식 표시(* 굵게, _ 기울임, ~ 취소선). 이 묶음에 든 '_' 수만큼만 토큰 끝의 '_' 를 뗀다 */
const LEADING_MARKS = new Set(['*', '_', '~']);
/** 토큰 뒤가 줄바꿈과 긴 base64url 덩어리로 이어진다: 링크가 줄바꿈에서 끊겼다(앞 조각은 다른 암호문이거나 잘린 암호문이다) */
const BROKEN_LINK_REST_RE = /^[\r\n]+[A-Za-z0-9_-]{16,}(?:\s|$)/;
/** 끝의 PIN 모양: ASCII 숫자가 아닌 글자 뒤에 PIN 자리 수(crypto.js PIN_LENGTH, ASCII 숫자)만큼의 숫자 */
const PIN_TAIL_RE = new RegExp(`[^0-9][0-9]{${PIN_LENGTH}}$`);
/** 링크와 PIN 사이에 끼어도 암호문 글자로 읽히는 base64url 글자 */
const PIN_JOINERS = new Set(['-', '_']);
/** PIN 앞에서 떼어 보는 이음 글자 수의 상한. 0~3 개를 떼어 보면 앞부분 길이의 나머지 넷을 모두 덮는다 */
const MAX_PIN_JOINERS = 3;

/**
 * 끝에 PIN 이 붙은 암호문으로 보이는가: 끝의 PIN 모양 숫자를 떼어 낸 앞부분, 또는 그 앞부분 끝의 - · _ 를 1~3개 더 떼어 낸 것이
 * 그 자체로 정규 암호문이면 그렇다('링크-PIN', '링크__PIN', 독립 리뷰 3차 I1). 떼는 수는 0개부터 늘리고 - · _ 가 아닌 글자에서
 * 멈춘다: 끝이 - · _ 인 진짜 암호문에 PIN 을 바로 붙인 글은 떼기 전(0개)에 걸린다. 이음 글자가 3개 이상이면 0~3개 가운데
 * 하나가 길이 나머지 0(늘 정규)에 닿으므로 더 긴 이음도 걸린다.
 * 진짜 암호문이 이렇게 보일 확률은 1e-6 아래다. 길이 나머지 0 은 끝 6자가 숫자이고 앞부분 끝이 A·Q·g·w 이거나 - · _ 둘(약 9.2e-7),
 * 나머지 3 은 끝 6자가 숫자(끝은 0·4·8)이고 앞부분 끝이 - · _(약 5.5e-7), 나머지 2 는 끝이 숫자일 수 없어 0 이다
 */
function endsWithPin(fragment) {
  if (!PIN_TAIL_RE.test(fragment)) return false;
  const head = fragment.slice(0, -PIN_LENGTH);
  for (let cut = 0; cut <= MAX_PIN_JOINERS; cut += 1) {
    if (cut > 0 && !PIN_JOINERS.has(head[head.length - cut])) return false;
    const candidate = head.slice(0, head.length - cut);
    if (isGuardianFragment(candidate) && hasCanonicalTail(candidate)) return true;
  }
  return false;
}

/** 붙여넣기에서 받는 암호문: 끝이 정규이고 PIN 이 붙어 보이지 않을 때만. 아니면 null(임시 보관에 넣지 않는다) */
function acceptPasted(fragment) {
  return fragment && hasCanonicalTail(fragment) && !endsWithPin(fragment) ? fragment : null;
}

/**
 * 토큰 바로 앞 서식 표시 묶음에 든 '_' 수. 뒤에서부터 한 번만 훑는다: 정규식 /[*_~]+$/ 는 긴 묶음 뒤에 다른 글자가 오면
 * 시작점마다 묶음 끝까지 다시 읽어 제곱 시간이 걸린다(32,768자에서 1초 넘게)
 */
function leadingItalicCount(before) {
  let count = 0;
  for (let i = before.length - 1; i >= 0 && LEADING_MARKS.has(before[i]); i -= 1) {
    if (before[i] === '_') count += 1;
  }
  return count;
}

/** 링크 토큰 끝의 문장부호·서식 표시를 뗀다. '_' 는 토큰 바로 앞 서식 묶음의 '_' 수만큼만 뗀다(_링크_ 기울임) */
function trimLinkToken(token, before) {
  let italic = leadingItalicCount(before);
  let end = token.length;
  while (end > 0) {
    const ch = token[end - 1];
    if (TRAILING_MARKS.has(ch)) {
      end -= 1;
    } else if (ch === '_' && italic > 0) {
      italic -= 1;
      end -= 1;
    } else {
      break;
    }
  }
  return token.slice(0, end);
}

/**
 * 붙여 넣은 글에서 암호문을 꺼낸다(/g '받은 링크 붙여넣기', 계획 2026-11-15 A-3 Task 6).
 * 홈 화면 앱은 Safari와 저장 공간이 따로라서 보호자가 메신저의 링크를 복사해 붙여 넣는다.
 * 먼저 길이 상한을 넘는 글을 거르고, 보이지 않는 글자를 지우고, 앞뒤 공백을 뺀다. 그다음 순서:
 *   1) 글 안에 공백·줄바꿈이 없을 때만 글 전체를 parseGuardianLink 로(링크 전체, '#암호문').
 *      new URL 은 탭·줄바꿈을 말없이 지운다. 공백을 건너 이어 붙이면 '링크⏎PIN'(카카오톡 한 메시지)이
 *      암호문+PIN 한 덩어리가 되어 PIN 이 늘 틀리고, 다섯 번이면 링크가 잠기고, PIN 이 탭 저장소에 남는다
 *   2) 글 속 첫 http(s) 토큰. 토큰 뒤가 줄바꿈과 긴 base64url 덩어리면(링크가 줄바꿈에서 끊김) null.
 *      끝의 ASCII 문장부호(. , ; : ! ? ' " ) ] } >)와 WhatsApp 서식(* ~, 앞에 _ 가 있을 때의 _)을 떼고 parseGuardianLink 로.
 *      첫 토큰이 보호자 링크가 아니면 null 이다(뒤에 오는 링크는 보지 않는다)
 *   3) 글 전체가 암호문 형식이면 그대로('#' 없는 암호문)
 * 마지막으로 꺼낸 암호문의 끝을 본다(독립 리뷰 2차 I1): 보이는 구분 없이 PIN 을 링크 바로 뒤에 붙여 넣거나 폭 없는 글자가
 * 둘을 갈랐으면(지우면서 이어진다) 암호문+PIN 이 형식 검사를 통과할 수 있다. 그래서
 *   - 끝이 정규 base64url 이 아니면(남는 비트가 0 이 아니면) null
 *   - 끝이 PIN 모양 숫자이고 그 앞부분이 그 자체로 정규 암호문이면 null
 *   - 그 앞부분 끝의 - · _ 를 1~3개 떼어 낸 것이 정규 암호문이어도 null(독립 리뷰 3차 I1). - 와 _ 는 base64url 글자라
 *     '링크-PIN', '링크__PIN' 은 이음 글자가 암호문 안에 남는다. 끝이 - · _ 인 진짜 암호문이 있어 한꺼번에 떼지 않고
 *     0개부터 하나씩 떼어 본다
 * 길이 나머지 0·2·3 어느 암호문에 PIN 을 바로 붙이거나 - · _ 몇 개로 이어도 넷 가운데 하나(나머지 1, 끝 글자, PIN 모양 끝,
 * 이음 글자를 뗀 앞부분)에 걸린다.
 * 알려진 한계: PIN 없이 링크 끝에 붙은 - · _ 가 길이를 나머지 0 으로 맞추면(나머지 3 암호문 뒤 하나, 나머지 2 암호문 뒤 둘 등)
 * 다른 정규 암호문이 되어 떼지 못한다. 그 링크는 PIN 이 맞지 않는다고만 나온다(PIN 은 임시 보관에 닿지 않는다).
 * isGuardianFragment 의 계약(형식만 본다)은 그대로 둔다: 복호화와 잠금이 같은 함수를 쓴다. 정규 끝 검사는 parseGuardianLink(주소의
 * # 뒤, 링크 전체)와 이 함수(# 없는 암호문)가 같은 hasCanonicalTail 로 한다.
 * 경로·쿼리에 실린 값은 parseGuardianLink 처럼 받아들이지 않는다. 글은 기기 밖으로 보내지 않는다(호출하는 화면의 몫).
 * @param {string} text
 * @returns {string|null}
 */
export function fragmentFromPasted(text) {
  if (typeof text !== 'string' || text.length > PASTE_MAX_CHARS) return null;
  const clean = text.replace(INVISIBLE_RE, '').trim();
  if (!/\s/.test(clean)) {
    const whole = parseGuardianLink(clean);
    if (whole) return acceptPasted(whole);
  }
  const token = FIRST_WEB_LINK_RE.exec(clean);
  if (token) {
    if (BROKEN_LINK_REST_RE.test(clean.slice(token.index + token[0].length))) return null;
    return acceptPasted(parseGuardianLink(trimLinkToken(token[0], clean.slice(0, token.index))));
  }
  return isGuardianFragment(clean) ? acceptPasted(clean) : null;
}
