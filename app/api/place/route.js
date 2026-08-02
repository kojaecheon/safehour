// POST /api/place — SCR006 장소 상세 (D04-F009, D09-AC016)
//
// 판정에는 영향을 주지 않는 "보강 조회" 다. 상세가 실패해도 추천 결과는 그대로이며,
// 이 API 는 실패를 숨기지 않고 errors 로 함께 돌려준다 (D06-E010).
// 운영시간 원문을 영업 여부로 해석하지 않는다 (D04-BR012).

import { fetchCandidateDetails } from '../../../src/tour-api/detail-service.js';
import { BadRequestError } from '../../../lib/server/engine-io.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 상세 조회에 필요한 식별자만 뽑는다. 클라이언트가 보낸 나머지 필드는 신뢰하지 않는다.
 * (판정 결과가 아니라 공공 관광 데이터 조회이므로 위조해도 조회 대상만 바뀐다)
 */
function normalizePlaceRequest(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new BadRequestError('장소 정보가 필요합니다.');
  }

  const asId = (value) => {
    if (value == null) return null;
    const id = String(value).trim();
    return /^\d{1,12}$/.test(id) ? id : null;
  };

  const koreanId = asId(candidate.sourceIds?.korean);
  const englishId = asId(candidate.sourceIds?.english);
  if (!koreanId && !englishId) {
    throw new BadRequestError('조회할 수 있는 장소 식별자가 없습니다.');
  }

  const contentTypes = candidate.sourceMetadata?.contentTypeIds ?? {};
  return {
    sourceIds: { korean: koreanId, english: englishId },
    sourceMetadata: {
      contentTypeIds: {
        korean: asId(contentTypes.korean),
        english: asId(contentTypes.english),
      },
    },
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, errorCode: 'SAFEHOUR_BAD_REQUEST', message: '요청 본문이 올바르지 않습니다.' },
      { status: 400 },
    );
  }

  let target;
  try {
    target = normalizePlaceRequest(body.candidate);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return Response.json(
        { ok: false, errorCode: 'SAFEHOUR_PLACE_INVALID', message: error.message },
        { status: 400 },
      );
    }
    throw error;
  }

  try {
    const details = await fetchCandidateDetails(target, { useCache: true });
    return Response.json({ ok: true, details });
  } catch (error) {
    // 상세는 보강일 뿐이므로 추천을 무너뜨리지 않는다. 화면은 기본 정보만으로 표시한다.
    console.error('[place] detail load failed:', error.message);
    return Response.json(
      {
        ok: false,
        errorCode: 'SAFEHOUR_EXTERNAL_API',
        message: '장소 상세 정보를 불러오지 못했습니다. 추천 결과는 그대로 유효합니다.',
      },
      { status: 502 },
    );
  }
}
