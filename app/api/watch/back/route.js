// POST /api/watch/back: 돌아왔어요(마감 확인)와 되돌리기 (ADR-0012 · 계획 작업 8 계약 표)
//
// 요청  { watchId, writeToken, date: "YYYY-MM-DD", by: "HH:MM", undo?: boolean }
//       로그인 세션이 필요 없다(보기 전용 상태에서도 확인을 보낼 수 있어야 한다). writeToken 이 맞아야 한다
// 응답  200 { ok: true, recorded }
//       오늘·어제(KST) 날짜의 그날 마감 목록에 있는 시각만 기록한다. 아니면 recorded: false
// 오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//       400 SAFEHOUR_BAD_REQUEST              본문·필드 형식(`field`)
//       404 SAFEHOUR_WATCH_NOT_FOUND          모르는 id, 틀린 토큰(같은 응답)
//       429 SAFEHOUR_RATE_LIMITED             횟수 제한
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWatchHandlers().back;
