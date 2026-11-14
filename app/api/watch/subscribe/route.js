// POST /api/watch/subscribe: 보호자 구독, DELETE /api/watch/subscribe: 구독 해지 (ADR-0012 · 계획 작업 8 계약 표)
//
// POST
//   요청  { watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang: "ko"|"en"|"ja"|"zh" }
//         보호자 로그인 세션은 설정에 따른다(SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN 이 '1' 이 아니면 필요)
//         p256dh 는 65바이트, auth 는 16바이트, endpoint 는 2048자 이하이고 알려진 푸시 서비스의 https 주소만
//   응답  200 { ok: true, subId }
//   오류  503 SAFEHOUR_SERVER_PUSH_OFF          서버 알림이 꺼져 있음
//         401 SAFEHOUR_AUTH_REQUIRED            세션이 필요한데 없음(운영 배포의 데모 세션은 없는 것으로 본다)
//         400 SAFEHOUR_BAD_REQUEST              본문·필드 형식(`field`)·허용 목록 밖 endpoint
//         404 SAFEHOUR_WATCH_NOT_FOUND          모르는 id
//         429 SAFEHOUR_RATE_LIMITED             횟수 제한
//         503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
// DELETE
//   요청  { watchId, subId }. 세션이 필요 없다
//   응답  200 { ok: true }
//   오류  503 SAFEHOUR_SERVER_PUSH_OFF  저장소 설정이 없음(스위치·차단 스위치와 무관하게 동작한다)
//         400, 404(모르는 id, 틀린 subId), 503 UNAVAILABLE 은 위와 같다
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createWatchHandlers();

export const POST = handlers.subscribe;
export const DELETE = handlers.unsubscribe;
