// POST /api/itinerary/intro: AI 일정 소개 문장 (AX-309 · docs/business-rules.md 'AI 소개 문장', docs/contracts.md '`POST /api/itinerary/intro`' · ADR-0008)
//
// 요청  { lang, stops: Array<{ title, category, arriveAt }>, interests, pace }
// 응답  200 { ok: true, text, source: "AI" | "TEMPLATE" }
// 오류  401 SAFEHOUR_AUTH_REQUIRED  로그인 세션 없음 (route-guard)
//       400 SAFEHOUR_BAD_REQUEST    본문이 객체가 아님, 지원하지 않는 언어, stops 가 배열이 아님 (`field` 포함)
//
// - AI 는 기본 꺼짐이다. 스위치(SAFEHOUR_AI_INTRO=1)와 키(GEMINI_API_KEY)가 모두 있어야 부른다.
//   꺼짐·실패·시간 초과(3초)·출력 검사 탈락은 모두 200 + 템플릿 문장이다. 실패 사유는 응답에 담지 않는다.
// - 허용 목록 밖 필드(조건·병원·숙소·날짜·계정…)는 읽지 않고 외부로 보내지 않는다(lib/server/ai-intro.js).
// - 서버는 아무것도 저장하지 않는다. 같은 입력의 문장 재사용은 기기 캐시가 한다(docs/business-rules.md 'AI 소개 문장').
// - 로그에는 분류 코드만 남는다. 프롬프트·출력·키·URL 은 남기지 않는다.
// - AI 문장은 소개일 뿐이다. 배치·판정에 쓰지 않는다.

// 상대 경로 사용 — Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { errorResponse, withSession } from '../../../../lib/server/route-guard.js';
import { generateIntro, sanitizeIntroRequest } from '../../../../lib/server/ai-intro.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 기존 오류 코드 (docs/API_CONTRACT.md) — 새로 만들지 않고 그대로 쓴다 */
const BAD_REQUEST = 'SAFEHOUR_BAD_REQUEST';
const BAD_REQUEST_MESSAGE = '요청 본문이 올바르지 않습니다.';

async function intro(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(BAD_REQUEST, BAD_REQUEST_MESSAGE, { field: 'body' });
  }
  const parsed = sanitizeIntroRequest(body);
  if (!parsed.ok) return errorResponse(BAD_REQUEST, BAD_REQUEST_MESSAGE, { field: parsed.field });

  const { text, source } = await generateIntro(parsed.input);
  return Response.json({ ok: true, text, source }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withSession(intro);
