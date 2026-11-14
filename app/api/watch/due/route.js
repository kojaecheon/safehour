// POST /api/watch/due: 예약 처리, 마감 + 유예 시각에 보호자 푸시를 보낼지 정한다 (ADR-0012 · 계획 작업 8 계약 표)
//
// 부르는 쪽  QStash(Upstash-Signature 헤더, 원문 본문으로 검증) 또는 Authorization: Bearer <CRON_SECRET>
//            (미리보기 시험과 화면 테스트). 둘 다 아니면 401
// 요청  { k: watchKey, d: "YYYY-MM-DD", t: "HH:MM" }  예약을 걸 때 서버가 만든 본문이다
// 응답  200 { ok: true }  처리했거나 건너뛰었다. 저장소 설정이 없으면 할 일이 없어 200
//       503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE  다시 불러야 한다(푸시 서비스 일시 실패, 일찍 온 예약, 저장소 장애).
//                                             QStash 가 다시 부른다
// 오류  401 SAFEHOUR_AUTH_REQUIRED  서명도 Bearer 도 맞지 않음
//       400 SAFEHOUR_BAD_REQUEST    인증 뒤 본문·필드 형식(`field`)
//
// 처리 본체는 lib/server/watch/handlers.js 에 있다.

// 상대 경로 사용: Next 외부(node --test)에서도 이 라우트를 그대로 테스트하기 위함
import { createWatchHandlers } from '../../../../lib/server/watch/handlers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWatchHandlers().due;
