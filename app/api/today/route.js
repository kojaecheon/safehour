// POST /api/today — 오늘의 회복 상태 (AX-217)
//
// **판정을 새로 만들지 않는다.** 연결 게이트 → 기존 `gateHospitalCondition` 순으로
// 같은 함수를 호출한다. 홈과 결과 화면이 다른 답을 내면 그것이 이 제품에서
// 가장 위험한 결함이다 (정의 §9-5).
//
// 후보 조회를 하지 않으므로 공공 API 호출이 **0건**이다. 홈을 여러 번 열어도
// 호출량이 늘지 않는다.

import { gateDecisionPayload, planToCondition } from '@/src/recovery/plan.js';
import { gateHospitalCondition } from '@/src/engine/safetyGate.js';
import { STATE } from '@/src/domain/states.js';
import { currentSession } from '@/lib/server/auth-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // 판정용 축약본만 받는다. 병원 안내문(채널 B)이 섞여 오면 검증에서 거부된다 (정의 §2).
  const payload = body?.payload ?? null;
  const now = new Date();

  // 1단계 — 연결 게이트
  const connection = gateDecisionPayload(payload, { now });
  if (!connection.pass) {
    return Response.json({
      ok: true,
      state: connection.state,
      reasons: connection.reasons,
      outingAllowed: false,
      expired: connection.expired,
    });
  }

  // 2단계 — 기존 안전 게이트. 후보 없이 조건만 본다
  const gate = gateHospitalCondition(planToCondition(payload), { now });

  return Response.json({
    ok: true,
    state: gate.pass ? STATE.TOGETHER : gate.state,
    reasons: gate.reasons ?? [],
    // "가능" 은 게이트를 통과했다는 뜻이지 추천이 있다는 뜻이 아니다.
    // 실제 후보는 외출 플랜에서 판정한다.
    outingAllowed: gate.pass,
    expired: false,
  });
}
