// POST /api/itinerary/plan — 체류 일정 생성·재계획·표시만 다시 쓰기 (AX-308 · spec 4.9, 6장)
//
// 요청  { lang: "ko"|"en"|"ja"|"zh", stay: PlanStay, dates?: date[], previous?: Record<date, DayPlan>,
//         edits?: TripPlan.edits, usedContentIds?: contentId[], events?: DemoEvent[], relabelOnly?: boolean, now }
//       - PlanStay 허용 목록 밖 필드(이름·주소·전화·연결 코드·현재 위치류)는 버린다. `now` 는 쓰지 않는다(서버 시계, KST)
// 응답  200 { ok: true, engineVersion, days: Record<date, DayPlan>,
//             diagnostics: { candidateCount, travelTimeSource: "fallback", weather: { source, byDate } } }
//       추천 중단 스위치가 켜지면 200 + 요청 날짜 전부 정거장 0개·NO_TOURISM·SERVICE_PAUSED, `servicePaused: true`
// 오류  401 SAFEHOUR_AUTH_REQUIRED        로그인 세션 없음 (route-guard)
//       400 SAFEHOUR_BAD_REQUEST          본문·lang·dates·previous·edits·usedContentIds·events 형식 (`field`)
//       400 SAFEHOUR_STAY_INVALID         체류 검증·대한민국 좌표 범위 (`fields`, `issues`)
//       502 SAFEHOUR_EXTERNAL_API         관광 후보 조회 실패 — 일정을 만들지 않는다
//       500 SAFEHOUR_RECALCULATION_FAILED 엔진 실패(변화가 필요한데 전후 비교가 빔 포함)
//
// 처리 본체는 lib/server/itinerary-service.js 에 있다.

// 상대 경로 사용 — Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { withSession } from '../../../../lib/server/route-guard.js';
import { createItineraryHandlers } from '../../../../lib/server/itinerary-service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withSession(createItineraryHandlers().plan);
