// POST /api/place: 장소 상세 (D04-F009, D09-AC016 · AX-308 · docs/contracts.md '`POST /api/place`', docs/business-rules.md '장소 후보와 필터', docs/platform/ITINERARY_RULES.md '출처와 언어')
//
// 요청  { lang: "ko"|"en"|"ja"|"zh", contentId, sourceIds: { ko?, en?, ja?, zh? }, contentTypeIds: { canonical?, ko?, en?, ja?, zh? } }
//       (정거장 Stop 과 같은 형식. 예전 { candidate: { sourceIds.korean/english, sourceMetadata } } 형식은 받지 않는다)
// 응답  200 { ok: true, details }  (details 는 기존 형식 — overview, overviewLanguage, address, homepage, telephone,
//             operatingSchedule, openNow(null), openNowReason, images, sources, errors, original)
// 오류  401 SAFEHOUR_AUTH_REQUIRED  로그인 세션 없음 (route-guard)
//       400 SAFEHOUR_BAD_REQUEST    본문이 JSON 객체가 아님
//       400 SAFEHOUR_PLACE_INVALID  언어·contentId·식별자 형식, 조회할 수 있는 (식별자, 유형 코드) 쌍이 없음 (`field`)
//       502 SAFEHOUR_EXTERNAL_API   상세 조회 실패
//
// 판정에는 영향을 주지 않는 "보강 조회" 다. 상세가 실패해도 일정은 그대로이며,
// 이 API 는 실패를 숨기지 않고 errors 로 함께 돌려준다 (D06-E010).
// 운영시간 원문을 영업 여부로 해석하지 않는다 (D04-BR012).
// 국문 + 선택 언어 서비스를 조회한다. 선택 언어(ja·zh)가 없거나 실패하면 영문, 그래도 없으면 국문이다(docs/business-rules.md '장소 후보와 필터', docs/platform/ITINERARY_RULES.md '출처와 언어').

// 상대 경로 사용 — Next 외부(node --test)에서 라우트 핸들러를 직접 계약 테스트하기 위함
import { fetchCandidateDetails } from '../../../src/tour-api/detail-service.js';
import { errorResponse, withSession } from '../../../lib/server/route-guard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BAD_REQUEST = 'SAFEHOUR_BAD_REQUEST';
const PLACE_INVALID = 'SAFEHOUR_PLACE_INVALID';
const EXTERNAL_API = 'SAFEHOUR_EXTERNAL_API';

const LANGS = ['ko', 'en', 'ja', 'zh'];
/** Stop 의 언어 키 → 상세 서비스 이름 */
const LOCALE_SERVICE = { ko: 'korean', en: 'english', ja: 'japanese', zh: 'chineseSimplified' };
const ID_RE = /^\d{1,12}$/;

class PlaceRequestError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

/** 숫자 식별자만 통과시킨다. 없으면 null, 형식이 틀리면 거부 (경로 조작 방지) */
function optionalId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const id = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new PlaceRequestError(field, '장소 식별자 형식이 올바르지 않습니다.');
  return id;
}

/**
 * 상세 조회에 필요한 식별자만 뽑는다. 클라이언트가 보낸 나머지 필드는 읽지 않는다.
 * (판정 결과가 아니라 공공 관광 데이터 조회이므로 위조해도 조회 대상만 바뀐다)
 */
function normalizePlaceRequest(body) {
  if (!LANGS.includes(body.lang)) throw new PlaceRequestError('lang', '지원하지 않는 언어입니다.');
  if (optionalId(body.contentId, 'contentId') === null) throw new PlaceRequestError('contentId', '장소 식별자가 필요합니다.');

  const sourceIds = body.sourceIds && typeof body.sourceIds === 'object' ? body.sourceIds : {};
  const contentTypeIds = body.contentTypeIds && typeof body.contentTypeIds === 'object' ? body.contentTypeIds : {};
  const ids = {};
  const types = {};
  for (const [key, service] of Object.entries(LOCALE_SERVICE)) {
    const id = optionalId(sourceIds[key], `sourceIds.${key}`);
    const type = optionalId(contentTypeIds[key], `contentTypeIds.${key}`);
    // 식별자와 유형 코드가 짝으로 있어야 조회한다(소개정보 조회에 유형 코드가 필수)
    if (id && type) {
      ids[service] = id;
      types[service] = type;
    }
  }
  if (Object.keys(ids).length === 0) throw new PlaceRequestError('sourceIds', '조회할 수 있는 장소 식별자가 없습니다.');
  return { lang: body.lang, candidate: { sourceIds: ids, sourceMetadata: { contentTypeIds: types } } };
}

async function place(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(BAD_REQUEST, '요청 본문이 올바르지 않습니다.', { field: 'body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(BAD_REQUEST, '요청 본문이 올바르지 않습니다.', { field: 'body' });
  }

  let target;
  try {
    target = normalizePlaceRequest(body);
  } catch (error) {
    if (error instanceof PlaceRequestError) return errorResponse(PLACE_INVALID, error.message, { field: error.field });
    throw error;
  }

  try {
    const details = await fetchCandidateDetails(target.candidate, { useCache: true, lang: target.lang });
    return Response.json({ ok: true, details }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // 상세는 보강일 뿐이므로 일정을 무너뜨리지 않는다. 화면은 기본 정보만으로 표시한다.
    // 원문에는 조회 URL·키가 섞일 수 있어 분류만 남긴다.
    console.error('[place] detail load failed:', EXTERNAL_API);
    return errorResponse(EXTERNAL_API, '장소 상세 정보를 불러오지 못했습니다. 일정은 그대로 유효합니다.', {}, { status: 502 });
  }
}

export const POST = withSession(place);
