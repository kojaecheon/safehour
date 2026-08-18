// POST /api/plan/link — 병원 회복 지침 연결 (AX-214 · AX-216)
//
// 게이트웨이를 통해 코드를 계획으로 바꾼다. 지금은 데모 어댑터 하나뿐이며,
// FHIR·병원 전용 API 는 같은 자리에 어댑터로 붙는다 (정의 §3·§10).
//
// **로그인이 필요하다.** 코드만으로 열어두면 코드가 유출됐을 때 누구나 그 계획을 본다.

import { DEMO_FIXTURES } from '@/src/recovery/fixtures.js';
import { demoAdapter, redeemPlan } from '@/src/recovery/gateway.js';
import { currentSession } from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const adapter = demoAdapter(DEMO_FIXTURES);

export async function POST(request) {
  const session = currentSession(request);
  if (!session) {
    return Response.json(
      { ok: false, code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: 'BAD_REQUEST', message: '요청을 읽지 못했습니다.' }, { status: 400 });
  }

  const code = body?.code;
  if (typeof code !== 'string' || code.trim() === '') {
    return Response.json({ ok: false, code: 'CODE_REQUIRED', message: '연결 코드를 입력해 주세요.' }, { status: 400 });
  }

  const result = await redeemPlan(adapter, code);
  if (!result.ok) {
    const status = result.reason === 'unknown_code' ? 404 : 422;
    return Response.json(
      {
        ok: false,
        code: result.reason === 'unknown_code' ? 'UNKNOWN_CODE' : 'INVALID_PLAN',
        message:
          result.reason === 'unknown_code'
            ? '이 코드로 연결된 회복 지침을 찾지 못했습니다.'
            : '회복 지침 형식이 올바르지 않아 연결하지 않았습니다.',
      },
      { status },
    );
  }

  // 계획 본문은 응답으로만 나가고 서버에 남지 않는다 (정의 §9.2)
  return Response.json({ ok: true, plan: result.plan });
}
