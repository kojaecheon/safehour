// 쿠키 보안 속성 판단 (AX-219 · ADR-0004)
//
// 별칭(`@/`) 없이 상대 경로만 쓴다 — 단위 테스트가 Next 빌드 없이 그대로 불러올 수 있어야 한다.

/**
 * Secure 플래그를 붙일지 판단한다.
 *
 * `NODE_ENV === 'production'` 으로 정하면 안 된다 — 프로덕션 빌드를 http 로 띄우는
 * 경우(로컬 `next start`, E2E)에 브라우저가 쿠키를 **조용히 버린다.** 판단 기준은
 * 빌드 모드가 아니라 **실제 연결이 https 인가** 다.
 *
 * Vercel 처럼 엣지에서 TLS 를 끊는 환경에서는 내부 요청이 http 로 보이므로
 * `x-forwarded-proto` 를 먼저 본다.
 */
export function secureCookies(request, env = process.env) {
  if (request) {
    const forwarded = request.headers.get('x-forwarded-proto');
    if (forwarded) return forwarded.split(',')[0].trim() === 'https';
    try {
      return new URL(request.url).protocol === 'https:';
    } catch {
      // URL 을 못 읽으면 아래 배포 주소로 판단한다
    }
  }
  return Boolean(env.SAFEHOUR_BASE_URL?.trim().startsWith('https://'));
}
