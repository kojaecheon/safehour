// GET /api/cron/watch-arm: 하루 1회 예약, 어제·오늘·내일의 걸리지 않은 마감에 예약을 건다 (ADR-0012 · 계획 작업 8 계약 표)
//
// 부르는 쪽  Vercel Cron(vercel.json 의 crons, 15:10 UTC = 00:10 KST, 운영 배포에서만 돈다).
//            Authorization: Bearer <CRON_SECRET> 이 필요하다. 미리보기에서는 같은 헤더로 직접 부른다
// 요청  없음
// 응답  200 { ok: true, armed, failed }
//       서버 알림이 꺼져 있으면 인증 없이 200 { ok: true, skipped: 'OFF' }
// 오류  401 SAFEHOUR_AUTH_REQUIRED            Bearer 가 맞지 않음
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  저장소 장애 등 예상 못 한 실패
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 마감을 하나씩 걸고 예약 업체 호출 한 번이 몇 초 걸릴 수 있다. Vercel 은 시간 초과한 예약 실행을 다시 부르지 않으므로 넉넉히 둔다
export const maxDuration = 60;

export const GET = createWatchHandlers().cronArm;
