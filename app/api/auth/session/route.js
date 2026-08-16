// GET /api/auth/session — 현재 로그인 상태 (AX-219)
//
// 식별자(subject)는 돌려주지 않는다. 화면이 알아야 하는 것은
// "로그인했는가" 와 "어느 공급자로" 까지다.

import { authReadiness, currentSession } from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = currentSession(request);
  return Response.json({
    ok: true,
    authenticated: Boolean(session),
    provider: session?.provider ?? null,
    expiresAt: session ? new Date(session.expiresAt * 1000).toISOString() : null,
    auth: authReadiness(),
  });
}
