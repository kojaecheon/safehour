// POST /api/recalculate — 실시간 이벤트 주입 → 재판정 → 전후 델타
//
// 판정은 stateless: 클라이언트가 /api/recommend 응답의 recalcPayload 를
// 그대로 되돌려 보내고, 서버는 이벤트를 적용해 1단계부터 다시 판정한다.
// 알림만 표시하고 코스를 유지하는 동작은 금지된다 (D07-BAN008).

// 상대 경로 사용 — Next 외부(node --test)에서 라우트 핸들러를 직접 계약 테스트하기 위함
import { applyEvent } from '../../../src/engine/recommend.js';
import {
  BadRequestError,
  DISPLAY_LIMIT,
  buildEngineInput,
  foldEventIntoPayload,
  normalizeCandidates,
  normalizeCondition,
  normalizeCtx,
  normalizeEvent,
  normalizeOrigin,
  normalizeReturnBy,
  normalizeRoles,
  toCumulativeEvent,
} from '../../../lib/server/engine-io.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST', message: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  let engineInput, event, nextRecalcPayload;
  try {
    const payload = body.recalcPayload ?? {};
    const origin = normalizeOrigin(payload.origin);
    const condition = normalizeCondition(payload.condition);
    const roles = normalizeRoles(payload.roles);
    const returnBy = normalizeReturnBy(payload.returnBy);
    const candidates = normalizeCandidates(payload.candidates);
    const ctx = normalizeCtx(payload.ctx);
    // 수치 이벤트는 기존 컨텍스트에 누적한 총량으로 변환한다.
    // 엔진 applyEvent 는 ctx 를 "대체"하므로, 판정과 payload 저장이 같은 총량을 쓰게 한다.
    event = toCumulativeEvent(ctx, normalizeEvent(body.event));

    engineInput = buildEngineInput({ origin, returnBy, condition, roles, candidates, ctx });
    nextRecalcPayload = foldEventIntoPayload(
      {
        origin,
        returnBy: returnBy.toISOString(),
        condition: { ...condition, issuedAt: condition.issuedAt.toISOString() },
        roles,
        candidates,
        ctx,
      },
      event,
    );
  } catch (error) {
    if (error instanceof BadRequestError) {
      return Response.json({ ok: false, errorCode: 'SAFEHOUR_RECALCULATION_INVALID', message: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const recalc = applyEvent(engineInput, event);
    return Response.json({
      ok: true,
      displayLimit: DISPLAY_LIMIT,
      recalc: {
        event: recalc.event,
        before: recalc.before,
        after: recalc.after,
        delta: recalc.delta,
        result: recalc.result,
      },
      nextRecalcPayload,
    });
  } catch (error) {
    // 재계산 실패 시 기존 코스를 신뢰하지 않는다 (D06-E013)
    console.error('[recalculate] engine failed:', error.message);
    return Response.json({
      ok: false,
      errorCode: 'SAFEHOUR_RECALCULATION_FAILED',
      message: '변화를 반영한 재계산에 실패했습니다. 안전을 위해 기존 추천을 계속 신뢰하지 마시고, 조건을 다시 입력해 주세요.',
    }, { status: 500 });
  }
}
