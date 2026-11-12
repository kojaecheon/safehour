// GET /api/auth/session — 현재 로그인 상태 (AX-219 · AX-312)
//
// 식별자(subject)는 돌려주지 않는다. 화면이 알아야 하는 것은
// "로그인했는가", "어느 공급자로", "언제 만료되나", 그리고 기기 저장 이름공간으로 쓸
// **불투명 계정 키**(서버 비밀값으로 유도, 되돌릴 수 없음: docs/security.md '기기 저장소와 계정 이름공간')까지다.
// 계정 키가 담기므로 응답을 어떤 캐시에도 남기지 않는다.

import { authReadiness, currentSession } from '@/lib/server/auth-server.js';
import { sessionSecret, sessionView } from '@/src/auth/session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = currentSession(request);
  return Response.json(
    {
      ok: true,
      ...sessionView(session, sessionSecret()),
      auth: authReadiness(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
