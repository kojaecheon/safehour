// E2E 전역 준비 — 데이터 루트를 비우고 TourAPI 캐시를 심는다.
//
// 캐시를 심어두면 실제 호출 경로(callTourApi)가 캐시에 적중해 외부로 나가지 않는다.
// 판정 엔진·정규화·API 라우트는 실제 코드가 그대로 실행된다.

import fs from 'node:fs';
import path from 'node:path';

export default async function globalSetup() {
  const dataRoot = path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data');

  // 이전 실행의 카운터·로그·캐시를 지워 결과가 실행 순서에 좌우되지 않게 한다
  fs.rmSync(dataRoot, { recursive: true, force: true });
  fs.mkdirSync(dataRoot, { recursive: true });

  // config.js 는 모듈 로드 시점에 경로를 고정하므로 그 전에 환경변수를 세운다
  process.env.SAFEHOUR_DATA_ROOT = dataRoot;
  process.env.TOUR_API_KEY = process.env.TOUR_API_KEY || 'e2e-dummy-key';

  const { seedE2eCache } = await import('../scripts/seed-e2e-cache.mjs');
  const files = seedE2eCache();
  console.log(`[e2e] TourAPI 캐시 ${files.length}건 시드 완료 (${dataRoot})`);
}
