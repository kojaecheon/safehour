// E2E 전역 준비 — TourAPI 캐시를 심고 외부 호출 기록을 비운다 (AX-322).
//
// 캐시를 심어두면 실제 호출 경로(callTourApi)가 캐시에 적중해 외부로 나가지 않는다.
// 일정 엔진·정규화·API 라우트는 실제 코드가 그대로 실행된다.
//
// 데이터 루트 전체를 지우지 않는다 — Playwright 는 webServer 를 globalSetup 보다 먼저 띄우고,
// 서버의 외부 호출 차단기(e2e/network-guard.cjs)가 루트 아래 guard/ 에 'ready' 표식을 남긴다.
// 이전 실행의 캐시·호출 로그·외부 호출 기록만 지운다.

import fs from 'node:fs';
import path from 'node:path';

export default async function globalSetup() {
  const dataRoot = path.resolve(process.env.SAFEHOUR_DATA_ROOT ?? '.e2e-data');
  fs.mkdirSync(dataRoot, { recursive: true });
  for (const sub of ['.cache', 'logs']) fs.rmSync(path.join(dataRoot, sub), { recursive: true, force: true });
  fs.rmSync(path.join(dataRoot, 'guard', 'external.log'), { force: true });
  // 중단된 실행이 남긴 시계 이동량을 지운다. e2e/clock-shim.cjs 는 파일이 없으면 이동량 0 으로 읽는다
  fs.rmSync(path.join(dataRoot, 'guard', 'clock-offset'), { force: true });
  // 차단기 표식은 이번 실행의 것만 남긴다 — 서버는 globalSetup 보다 먼저 떠서 방금 표식을 남겼다
  const guardDir = path.join(dataRoot, 'guard');
  for (const name of fs.existsSync(guardDir) ? fs.readdirSync(guardDir) : []) {
    if (!name.startsWith('ready-') && !name.startsWith('clock-ready-')) continue;
    const file = path.join(guardDir, name);
    if (Date.now() - fs.statSync(file).mtimeMs > 10 * 60_000) fs.rmSync(file, { force: true });
  }

  // config.js 는 모듈 로드 시점에 경로를 고정하므로 그 전에 환경변수를 세운다
  process.env.SAFEHOUR_DATA_ROOT = dataRoot;
  process.env.TOUR_API_KEY = 'e2e-dummy-key';

  const { seedE2eCache, E2E_ANCHORS, E2E_ITEMS_WITHIN_3KM } = await import('../scripts/seed-e2e-cache.mjs');
  const files = seedE2eCache();
  console.log(
    `[e2e] TourAPI 캐시 ${files.length}건 시드 완료 — 기준점 ${E2E_ANCHORS.length}곳, 기준점마다 3km 안 ${E2E_ITEMS_WITHIN_3KM}곳 (${dataRoot})`,
  );
}
