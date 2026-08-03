// GET /api/health — 배포 확인과 운영 스위치 상태 점검 (D09-RG007)
//
// 배포 직후·kill switch 발동 후에 실제로 반영됐는지 확인할 수단이 필요하다.
// 비밀정보는 담지 않는다 — 키의 존재 여부만 boolean 으로 알린다 (D07-POL009).

import { runtimeFlagsSnapshot } from '../../../lib/server/runtime-flags.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'safehour',
    checkedAt: new Date().toISOString(),
    // 키 값은 절대 노출하지 않는다. 설정 여부만 확인한다.
    config: {
      tourApiKeyConfigured: Boolean(process.env.TOUR_API_KEY?.trim()),
      // 기상은 전용 키가 없으면 TOUR_API_KEY 로 폴백한다 (공공데이터포털은 계정당
      // 인증키가 하나이고 서비스별 활용신청만 하면 같은 키로 호출된다).
      // 실제 호출에 쓰이는 키 기준으로 판단해야 "미설정"으로 오독되지 않는다.
      weatherApiKeyConfigured: Boolean(
        process.env.KMA_API_KEY?.trim() || process.env.TOUR_API_KEY?.trim(),
      ),
      weatherKeySource: process.env.KMA_API_KEY?.trim() ? 'KMA_API_KEY' : 'TOUR_API_KEY',
    },
    flags: runtimeFlagsSnapshot(),
  });
}
