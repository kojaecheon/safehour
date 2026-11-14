// PUT /api/watch/deadlines: 날짜별 복귀 마감 올리기와 출국일 갱신 (ADR-0012 · 계획 작업 8 계약 표)
//
// 요청  { watchId, writeToken, expiresOn: "YYYY-MM-DD", days: [{ date: "YYYY-MM-DD", deadlines: ["HH:MM"] }] }
//       - writeToken 이 맞아야 한다. 로그인 세션이 있으면 그 계정이 소유자여야 한다
//       - days 는 46개 이하, 날짜가 겹치면 400, 날짜당 시각 10개 이하(중복은 없애고 정렬)
//       - 클라이언트는 지켜보기 하나에 업로드를 한 번에 하나만 보내고, 늘 가장 최근 상태 전체를 보낸다
// 응답  200 { ok: true, expiresOn, armFailed }
//       armFailed: 예약 업체 실패로 걸지 못한 마감 수. 0보다 크면 잠시 뒤 같은 전체를 다시 올린다
// 오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//       400 SAFEHOUR_BAD_REQUEST              본문·필드 형식(`field`)·지난 출국일
//       404 SAFEHOUR_WATCH_NOT_FOUND          모르는 id, 틀린 토큰, 소유자가 다른 세션(모두 같은 응답)
//       429 SAFEHOUR_RATE_LIMITED             횟수 제한
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = createWatchHandlers().deadlines;
