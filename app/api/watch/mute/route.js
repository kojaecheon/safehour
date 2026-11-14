// POST /api/watch/mute: 오늘 함께 있음 켜기·끄기 (ADR-0012 · 계획 작업 8 계약 표)
//
// 요청  { watchId, subId, on: boolean }. 보호자 로그인 세션은 설정에 따른다. subId 가 지금 구독의 것이어야 한다
// 응답  200 { ok: true, muted }
//       켜면 그날(KST) 마감 지남 알림을 보내지 않는다. 다음 날은 저절로 풀린다
// 오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//       401 SAFEHOUR_AUTH_REQUIRED            세션이 필요한데 없음(운영 배포의 데모 세션은 없는 것으로 본다)
//       400 SAFEHOUR_BAD_REQUEST              본문·필드 형식(`field`)
//       404 SAFEHOUR_WATCH_NOT_FOUND          모르는 id, 틀린 subId(같은 응답)
//       429 SAFEHOUR_RATE_LIMITED             횟수 제한
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 끄면 오늘 마감을 다시 건다(예약 업체 발행). 기본 제한에 걸려 끊기지 않게 넉넉히 둔다
export const maxDuration = 60;

export const POST = createWatchHandlers().mute;
