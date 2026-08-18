// POST /api/auth/logout — 로그아웃 (AX-219)
//
// 세션은 서명 쿠키뿐이므로 지우면 끝난다 (서버에 세션 테이블이 없다).
// GET 을 열어두지 않는다 — 이미지 태그 한 줄로 남을 로그아웃시킬 수 있기 때문이다.

import { clearSessionCookie } from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', clearSessionCookie(request));
  return new Response(JSON.stringify({ ok: true, authenticated: false }), { status: 200, headers });
}
