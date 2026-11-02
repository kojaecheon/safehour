// POST /api/plan/link — 병원 지침 연결, 계약 v2 (AX-214 · AX-216 → AX-311 · spec 4.20, 6장)
//
// 게이트웨이를 통해 코드를 v2 지침으로 바꾼다. 지금은 데모 어댑터 하나뿐이며,
// FHIR·병원 전용 API 는 같은 자리에 어댑터로 붙는다 (정의 §3·§10).
// v1 지침은 받지 않는다 — 형식이 v2 가 아니면 지침 전체를 거부한다(규칙 48).
//
// **로그인이 필요하다.** 코드만으로 열어두면 코드가 유출됐을 때 누구나 그 지침을 본다.
// 세션이 없으면 401 { ok: false, errorCode: 'SAFEHOUR_AUTH_REQUIRED', message } (spec 6장).
// 모든 오류 응답은 `errorCode` 키를 쓴다(기존 `code` 키 형태를 대체).
//
// 지침 본문은 응답으로만 나가고 서버에 남지 않는다. 로그에 코드·지침·안내문을 남기지 않는다.

// 상대 경로 사용 — Next 외부(node --test)에서 라우트 핸들러를 직접 계약 테스트하기 위함
import { DEMO_FIXTURES } from '../../../../src/recovery/fixtures.js';
import { PLAN_LINK_ERROR, PLAN_LINK_ERROR_STATUS, demoAdapter, redeemPlan } from '../../../../src/recovery/gateway.js';
import { errorResponse, withSession } from '../../../../lib/server/route-guard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const adapter = demoAdapter(DEMO_FIXTURES);

function fail(errorCode, message) {
  return errorResponse(errorCode, message, {}, { status: PLAN_LINK_ERROR_STATUS[errorCode] });
}

export const POST = withSession(async (request) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(PLAN_LINK_ERROR.BAD_REQUEST, '요청을 읽지 못했습니다.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(PLAN_LINK_ERROR.BAD_REQUEST, '요청 본문이 올바르지 않습니다.');
  }

  const code = body.code;
  if (typeof code !== 'string' || code.trim() === '') {
    return fail(PLAN_LINK_ERROR.CODE_REQUIRED, '연결 코드를 입력해 주세요.');
  }

  const result = await redeemPlan(adapter, code);
  if (!result.ok) {
    return result.reason === 'unknown_code'
      ? fail(PLAN_LINK_ERROR.UNKNOWN_CODE, '이 코드로 연결된 회복 지침을 찾지 못했습니다.')
      : fail(PLAN_LINK_ERROR.INVALID_PLAN, '회복 지침 형식이 올바르지 않아 연결하지 않았습니다.');
  }

  return Response.json({ ok: true, plan: result.plan });
});
