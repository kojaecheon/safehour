// 푸시 endpoint 검증. src/push/AGENTS.md
//
// 구독의 endpoint 는 브라우저가 준 값이지만 서버가 그 주소로 요청을 보내므로, 아무 주소나 받으면
// 서버를 다른 곳을 찌르는 도구로 쓸 수 있다. 그래서 알려진 푸시 서비스 호스트의 https 주소만 받는다.
//
// - 문자열, 2048자 이하, https:, 사용자 정보 없음, 포트 없음(또는 443)
// - 호스트가 PUSH_HOST_RULES 중 하나에 맞음. '*.' 는 한 단계 이상 하위 도메인만 맞는다(맨몸 push.apple.com 은 아니다)
// - testOrigin 이 주어지고 URL 의 출처가 그것과 정확히 같으면 다른 조건 없이 통과한다(데모 모드 전용, 넘기는 쪽이 책임진다)
//
// 실패 결과에는 이유를 담지 않는다. 기록에 주소가 섞여 나가지 않게 하려는 것이다.

/** 받는 푸시 서비스 호스트. 더할 때는 그 브라우저의 공식 푸시 서비스 호스트인지 확인한다 */
export const PUSH_HOST_RULES = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '*.push.apple.com',
  '*.notify.windows.com',
]);

export const MAX_ENDPOINT_CHARS = 2048;

const LABELS_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

function hostAllowed(hostname) {
  for (const rule of PUSH_HOST_RULES) {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1);
      if (hostname.endsWith(suffix)) {
        const prefix = hostname.slice(0, -suffix.length);
        if (prefix.length > 0 && LABELS_RE.test(prefix)) return true;
      }
    } else if (hostname === rule) {
      return true;
    }
  }
  return false;
}

/**
 * endpoint 를 검사하고 URL 과 VAPID aud 로 쓸 출처를 돌려준다.
 *
 * @param {unknown} value
 * @param {{ testOrigin?: string|null }} [options]
 * @returns {{ ok: true, url: URL, audience: string } | { ok: false }}
 */
export function parsePushEndpoint(value, { testOrigin } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_CHARS) return { ok: false };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false };
  }
  if (
    typeof testOrigin === 'string' &&
    testOrigin.length > 0 &&
    testOrigin !== 'null' &&
    url.origin === testOrigin &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username === '' &&
    url.password === ''
  ) {
    return { ok: true, url, audience: url.origin };
  }
  if (url.protocol !== 'https:') return { ok: false };
  if (url.username !== '' || url.password !== '') return { ok: false };
  if (url.port !== '' && url.port !== '443') return { ok: false };
  if (!hostAllowed(url.hostname)) return { ok: false };
  return { ok: true, url, audience: url.origin };
}
