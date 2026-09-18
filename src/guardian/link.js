// 보호자 링크 조립·해석 (AX-313 · spec 4.11, 5.4, 규칙 38)
//
// 링크 = <origin>/g#<암호문>
// 암호문은 # 뒤(URL 조각)에만 둔다. 브라우저는 조각을 서버 요청에 싣지 않으므로 서버는 암호문을 받지도, 저장하지도 않는다.
// 해석도 # 뒤만 읽는다 — 경로·쿼리에 실린 값은 암호문으로 받아들이지 않는다.

import { isGuardianFragment } from './crypto.js';

export const GUARDIAN_PATH = '/g';
const WEB_PROTOCOLS = Object.freeze(['https:', 'http:']);

/**
 * 보호자 링크를 만든다.
 * @param {string} origin  예: `window.location.origin`. 경로·쿼리·해시·계정 정보가 있으면 거부한다(끝의 / 는 정리)
 * @param {string} fragment  encryptSnapshot 결과
 * @returns {string}  `${origin}/g#${fragment}`
 * @throws {TypeError}
 */
export function buildGuardianLink(origin, fragment) {
  if (!isGuardianFragment(fragment)) throw new TypeError('buildGuardianLink: 암호문 형식이 올바르지 않습니다');
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
  return `${url.origin}${GUARDIAN_PATH}#${fragment}`;
}

/**
 * 보호자 링크 또는 `location.hash` 에서 암호문을 꺼낸다.
 * - 절대 URL: http(s) 이고 경로가 `/g`(또는 `/g/`)일 때 # 뒤만 읽는다. 쿼리(예: 메신저가 붙인 utm)는 무시한다.
 * - `#...` 문자열: # 뒤를 읽는다.
 * - 그 밖(경로·쿼리에 암호문, # 없음, 형식이 틀린 암호문)은 null.
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
  return isGuardianFragment(fragment) ? fragment : null;
}
