// GET /api/health — 배포 확인과 운영 스위치 상태 점검 (D09-RG007)
//
// 배포 직후·kill switch 발동 후에 실제로 반영됐는지 확인할 수단이 필요하다.
// 비밀정보는 담지 않는다 — 키의 존재 여부만 boolean 으로 알린다 (D07-POL009).
// 관광공사 자체 호출 카운터(오늘 operation별 사용/한도, 경고 값)도 알린다. 키·URL·매개변수는 없다.

import { runtimeFlagsSnapshot } from '../../../lib/server/runtime-flags.js';
import { readTourApiUsage } from '../../../lib/server/tour-api-usage.js';
import { resolveKmaServiceKey } from '../../../src/adapters/weather.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tourApiUsageOrNull() {
  try {
    return await readTourApiUsage();
  } catch {
    // 관광 모듈을 못 불러와도 헬스 응답은 나가야 한다(배포 확인 경로)
    return null;
  }
}

export async function GET() {
  const tourApiUsage = await tourApiUsageOrNull();
  return Response.json({
    ok: true,
    service: 'safehour',
    checkedAt: new Date().toISOString(),
    // 키 값은 절대 노출하지 않는다. 설정 여부만 확인한다.
    config: {
      tourApiKeyConfigured: Boolean(process.env.TOUR_API_KEY?.trim()),
      // 기상은 전용 키가 없으면 TOUR_API_KEY 로 폴백한다 (공공데이터포털은 계정당
      // 인증키가 하나이고 서비스별 활용신청만 하면 같은 키로 호출된다).
      // 실제 호출에 쓰이는 키 기준으로 판단해야 "미설정"으로 오독되지 않는다 — 일정 API 와 같은 규칙
      // (resolveKmaServiceKey): KMA_API_KEY 가 공백뿐이거나 off 면 기상 조회를 끈 것이므로 미설정이다.
      weatherApiKeyConfigured: Boolean(resolveKmaServiceKey(process.env)),
      // KMA_API_KEY 에 값(끄는 값 포함)이 있으면 그 변수가 정한다. 없거나 빈 값이면 TOUR_API_KEY 다.
      weatherKeySource: process.env.KMA_API_KEY ? 'KMA_API_KEY' : 'TOUR_API_KEY',
    },
    flags: runtimeFlagsSnapshot(),
    // { scope: 'instance', date, dailyLimit, warningAt, counterReadable, operations: { '서비스.오퍼레이션': { used, limit, state } } }
    // scope: 응답한 인스턴스의 카운터다. 제공처에 남은 한도가 아니다
    tourApiUsage,
  });
}
