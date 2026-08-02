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
      weatherApiKeyConfigured: Boolean(process.env.KMA_API_KEY?.trim()),
    },
    flags: runtimeFlagsSnapshot(),
  });
}
