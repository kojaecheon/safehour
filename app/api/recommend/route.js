// POST /api/recommend — 조건 입력 → 후보 조회 → 안전 판정
//
// 실패 시 동작 (D06): 임의 후보를 만들지 않는다.
// 외부 API 실패는 "안전한 미추천 + 오류 안내"로 응답한다.

import { recommend } from '@/src/engine/recommend.js';
import { loadSafeHourCandidates } from '@/src/tour-api/candidate-service.js';
import { fetchKmaNowcast } from '@/src/adapters/weather.js';
import {
  BadRequestError,
  DISPLAY_LIMIT,
  buildEngineInput,
  normalizeCondition,
  normalizeOrigin,
  normalizeReturnBy,
  normalizeRoles,
} from '@/lib/server/engine-io.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANDIDATE_RADIUS_METERS = 3000;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST', message: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  let origin, condition, roles, returnBy;
  try {
    origin = normalizeOrigin(body.origin);
    condition = normalizeCondition(body.condition);
    roles = normalizeRoles(body.roles);
    returnBy = normalizeReturnBy(body.returnBy);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return Response.json({ ok: false, errorCode: 'SAFEHOUR_CONDITION_INVALID', message: error.message }, { status: 400 });
    }
    throw error;
  }

  // ── 기상 실황 (후보 조회와 병렬) — 실패해도 throw 하지 않는다 ──
  const weatherPromise = fetchKmaNowcast({
    lat: origin.lat,
    lng: origin.lng,
    serviceKey: process.env.KMA_API_KEY?.trim() || process.env.TOUR_API_KEY?.trim(),
  });

  // ── 후보 조회 (TourAPI, 캐시 우선) ──
  let candidateResult;
  try {
    candidateResult = await loadSafeHourCandidates({
      origin: { kind: origin.kind, lat: origin.lat, lng: origin.lng },
      radiusMeters: CANDIDATE_RADIUS_METERS,
      useCache: true,
    });
  } catch (error) {
    // 안전 판정 입력을 확보할 수 없으면 추천하지 않는다 (D06-E005)
    console.error('[recommend] candidate load failed:', error.message);
    return Response.json({
      ok: false,
      errorCode: 'SAFEHOUR_EXTERNAL_API',
      message: '관광정보를 불러오지 못했습니다. 안전을 위해 지금은 추천을 제공하지 않습니다. 잠시 후 다시 시도해 주세요.',
      failSafeState: 'STANDBY',
    });
  }

  // ── 기상 반영 — outdoorUnsafe 확인된 경우에만 판정 입력에 넣는다.
  //    unknown·degraded 는 판정에 쓰지 않고 화면 표기용으로만 전달한다 (D06-E012).
  const weather = await weatherPromise;
  const ctx = weather.outdoorUnsafe
    ? { weather: { outdoorUnsafe: true, summary: weather.reasons.join(' · ') } }
    : {};

  // ── 판정 ──
  const engineInput = buildEngineInput({
    origin,
    returnBy,
    condition,
    roles,
    candidates: candidateResult.candidates,
    ctx,
  });
  const decision = recommend(engineInput);

  return Response.json({
    ok: true,
    displayLimit: DISPLAY_LIMIT,
    decision,
    origin,
    returnBy: returnBy.toISOString(),
    travelTimeSource: 'fallback',
    weather: {
      outdoorUnsafe: Boolean(weather.outdoorUnsafe),
      reasons: weather.reasons ?? [],
      unknown: Boolean(weather.unknown),
      degraded: Boolean(weather.degraded),
      observedAt: weather.observedAt ?? null,
    },
    diagnostics: {
      candidateCount: candidateResult.candidates.length,
      totals: candidateResult.diagnostics.totals,
      matching: {
        english: candidateResult.diagnostics.matching.english.matched,
        barrierFree: candidateResult.diagnostics.matching.barrierFree.matched,
      },
    },
    // 재계산은 stateless — 클라이언트가 이 payload 를 그대로 되돌려 보낸다.
    // 관광 후보는 공공 데이터이며 개인정보를 포함하지 않는다.
    recalcPayload: {
      origin,
      returnBy: returnBy.toISOString(),
      condition: { ...condition, issuedAt: condition.issuedAt.toISOString() },
      roles,
      candidates: candidateResult.candidates,
      // 조회 시점에 확인된 기상 악화는 이후 재계산에도 유지된다
      ctx,
    },
  });
}
