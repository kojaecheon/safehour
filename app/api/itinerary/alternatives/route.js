// POST /api/itinerary/alternatives: 정거장 교체 후보 (AX-308 · docs/business-rules.md '사용자 편집', docs/contracts.md '`POST /api/itinerary/alternatives`')
//
// 요청  { lang, stay: PlanStay, date, outingId, stopId, day: DayPlan, usedContentIds?, now }
//       + 선택: edits?(그 날짜 편집 기록), events?(오늘 데모 사건) — plan 과 같은 형식
// 응답  200 { ok: true, alternatives: Array<{ stop, outingPreview }> }  (최대 5개, 모두 게이트와 외출 재검증 통과)
//       추천 중단 스위치가 켜지면 200 { ok: true, alternatives: [], servicePaused: true, days: { [date]: DayPlan(SERVICE_PAUSED) } }
// 오류  401 SAFEHOUR_AUTH_REQUIRED · 400 SAFEHOUR_BAD_REQUEST(`field`) · 400 SAFEHOUR_STAY_INVALID
//       502 SAFEHOUR_EXTERNAL_API · 500 SAFEHOUR_RECALCULATION_FAILED
//
// 처리 본체는 lib/server/itinerary-service.js 에 있다.

// 상대 경로 사용 — Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { withSession } from '../../../../lib/server/route-guard.js';
import { createItineraryHandlers } from '../../../../lib/server/itinerary-service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withSession(createItineraryHandlers().alternatives);
