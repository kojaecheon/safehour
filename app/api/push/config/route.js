// GET /api/push/config: 서버 알림 켜짐 여부와 VAPID 공개키 (ADR-0012 · 계획 작업 8 계약 표)
//
// 요청  없음. 로그인이 필요 없다(공개키와 스위치 상태만 알린다)
// 응답  200 { ok: true, enabled, vapidPublicKey: string | null, guardianLoginRequired }
//       꺼져 있으면(스위치 꺼짐, 차단 스위치 켜짐, 준비 안 됨) enabled: false, vapidPublicKey: null
//       공개키를 NEXT_PUBLIC_ 으로 굽지 않는 것은 키를 바꾸거나 끌 때 다시 빌드하지 않으려고서다
// 오류  503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createWatchHandlers().pushConfig;
