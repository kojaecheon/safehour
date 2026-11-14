// POST /api/watch: 지켜보기 등록, DELETE /api/watch: 지켜보기 삭제 (ADR-0012 · 계획 작업 8 계약 표)
//
// POST
//   요청  { watchId, writeToken, expiresOn: "YYYY-MM-DD" }. 환자 로그인 세션이 필요하다. 허용 목록 밖 필드는 버린다
//   응답  200 { ok: true, expiresOn }  (출국일 상한을 씌운 값)
//   오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//         401 SAFEHOUR_AUTH_REQUIRED            로그인 세션 없음. 운영 배포에서는 데모 세션도 없는 것으로 본다
//                                               (데모 로그인은 모두 같은 신원이라 소유 확인이 무의미하다)
//         400 SAFEHOUR_BAD_REQUEST              본문(16KB 초과·JSON 아님)·필드 형식(`field`)·지난 출국일
//         404 SAFEHOUR_WATCH_NOT_FOUND          남의 watchId (모르는 id·틀린 토큰과 같은 응답)
//         429 SAFEHOUR_RATE_LIMITED             횟수 제한, 재등록·동시 지켜보기 한도
//         503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
// DELETE
//   요청  { watchId, writeToken } 또는 { all: true }(로그인 세션의 지켜보기 전부)
//   응답  200 { ok: true } 또는 { all: true } 이면 { ok: true, deleted }
//   오류  503 SAFEHOUR_SERVER_PUSH_OFF  저장소 설정이 없음(스위치·차단 스위치와 무관하게 동작한다)
//         401(all 인데 세션 없음, 운영 배포의 데모 세션 포함), 400, 404, 503 UNAVAILABLE 은 위와 같다
//
// 식별 값은 본문으로만 받는다(경로·쿼리에 싣지 않는다). 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createWatchHandlers();

export const POST = handlers.register;
export const DELETE = handlers.remove;
