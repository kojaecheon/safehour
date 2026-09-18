// POST /api/address/search — 도로명주소 검색 + 좌표 변환 (AX-310 · spec 4.2–4.3, 6장)
//
// 요청  { keyword: string(앞뒤 공백 제거 후 2–60자), lang }
// 응답  200 { ok: true, results: Address[] }  (최대 10건, Address = spec 5.1)
// 오류  401 SAFEHOUR_AUTH_REQUIRED       로그인 세션 없음 (route-guard)
//       400 SAFEHOUR_BAD_REQUEST         본문·검색어 무효, 외부 API 가 검색어 문제로 거절 (`reason` 포함)
//       503 SAFEHOUR_ADDRESS_UNAVAILABLE 키(JUSO_API_KEY·JUSO_COORD_API_KEY) 미설정
//       502 SAFEHOUR_EXTERNAL_API        외부 API 실패
//
// - 키가 없어도 데모 로그인 모드(SAFEHOUR_ALLOW_DEMO_LOGIN=1)면 고정 데모 주소(source "DEMO")를 준다.
//   키가 모두 있으면 데모 모드여도 실제 API 를 쓴다.
// - 병원 목록·추천을 만들지 않는다. 사용자가 입력한 검색어의 결과만 돌려준다(spec 4.3, 9.1).
// - `lang` 은 결과를 바꾸지 않는다. 도로명주소는 한국어 원문 그대로 돌려준다(한국어 카드·택시 안내에 쓰인다).
// - 허용 목록(keyword, lang) 밖 필드는 읽지 않는다. 외부로 보내는 것은 검색어뿐이다.
// - 로그에는 분류 코드만 남긴다. 키·검색어·전체 조회 URL 은 남기지 않는다(spec 9.1).

// 상대 경로 사용 — Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { ERROR_CODE, errorResponse, withSession } from '../../../../lib/server/route-guard.js';
import { demoLoginEnabled } from '../../../../src/auth/config.js';
import {
  JusoApiError,
  KEYWORD_REJECTION,
  jusoConfigured,
  normalizeAddressKeyword,
  searchRoadAddresses,
} from '../../../../src/adapters/juso.js';
import { searchDemoAddresses } from '../../../../src/adapters/demoAddresses.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 기존 오류 코드 (docs/API_CONTRACT.md) — 새로 만들지 않고 그대로 쓴다 */
const BAD_REQUEST = 'SAFEHOUR_BAD_REQUEST';
const EXTERNAL_API = 'SAFEHOUR_EXTERNAL_API';
const EXTERNAL_API_STATUS = 502;

const MESSAGE = {
  BODY: '요청 본문이 올바르지 않습니다.',
  [KEYWORD_REJECTION.LENGTH]: '검색어는 2자 이상 60자 이하로 입력해 주세요.',
  [KEYWORD_REJECTION.CHARS]: '검색어에 쓸 수 없는 문자나 단어가 있습니다.',
  [KEYWORD_REJECTION.REJECTED]: '검색어를 더 구체적으로 입력해 주세요.',
  UNAVAILABLE: '지금은 주소 검색을 쓸 수 없습니다.',
  EXTERNAL: '주소 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

function ok(results) {
  return Response.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store' } });
}

function badRequest(reason) {
  return errorResponse(BAD_REQUEST, MESSAGE[reason] ?? MESSAGE.BODY, { reason });
}

async function searchAddress(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('BODY');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('BODY');

  const checked = normalizeAddressKeyword(body.keyword);
  if (!checked.ok) return badRequest(checked.reason);

  const env = process.env;
  if (!jusoConfigured(env)) {
    if (demoLoginEnabled(env)) return ok(searchDemoAddresses(checked.keyword));
    return errorResponse(ERROR_CODE.ADDRESS_UNAVAILABLE, MESSAGE.UNAVAILABLE);
  }

  try {
    return ok(await searchRoadAddresses(checked.keyword, { env }));
  } catch (error) {
    if (error instanceof JusoApiError && error.kind === 'INPUT') return badRequest(KEYWORD_REJECTION.REJECTED);
    // 분류 코드만 남긴다. error.message·cause 에는 URL·키·검색어가 섞일 수 있어 쓰지 않는다.
    console.error('[address] search failed:', error instanceof JusoApiError ? error.code : 'UNEXPECTED');
    return errorResponse(EXTERNAL_API, MESSAGE.EXTERNAL, {}, { status: EXTERNAL_API_STATUS });
  }
}

export const POST = withSession(searchAddress);
