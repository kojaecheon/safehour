// POST /api/watch/status: 보호자가 보는 오늘 확인 상태 (ADR-0012 · 계획 작업 8 계약 표)
//
// 요청  { watchId, subId? }. 보호자 로그인 세션은 설정에 따른다
// 응답  200 { ok: true, date, confirmed: ["HH:MM"], muted, subscriptionActive }
//       오늘(KST) 날짜 기록의 확인된 마감 시각과 오늘 함께 있음 여부뿐이다. subscriptionActive 는 subId 가
//       지금 구독의 것일 때만 참
// 오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//       401 SAFEHOUR_AUTH_REQUIRED            세션이 필요한데 없음(운영 배포의 데모 세션은 없는 것으로 본다)
//       400 SAFEHOUR_BAD_REQUEST              본문·필드 형식(`field`)
//       404 SAFEHOUR_WATCH_NOT_FOUND          모르는 id
//       429 SAFEHOUR_RATE_LIMITED             횟수 제한
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWatchHandlers().status;
