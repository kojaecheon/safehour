// 공모전 제출용 서비스 이미지 캡처 (AX-207)
//
// 기능설명서 3번 항목은 "서비스 대표 이미지 1장 + 상세 이미지 3~5장" 을 요구한다.
// 손으로 찍으면 화면이 바뀔 때마다 다시 찍어야 하고, 어느 시점 화면인지도 알 수 없다.
// 그래서 실제 흐름을 걸어가며 자동으로 찍는다 — 화면이 바뀌면 다시 실행하면 된다.
//
// 사용법
//   node scripts/capture-submission-images.mjs [베이스URL]
//   기본값: http://localhost:3000
//
// 전제
//   - 서버가 떠 있어야 한다
//   - `SAFEHOUR_ALLOW_DEMO_LOGIN=1` 과 `SAFEHOUR_SESSION_SECRET` 이 설정돼 있어야 한다
//   - 실제 추천 화면을 찍으려면 `TOUR_API_KEY` 가 필요하다 (없으면 그 화면은 건너뛴다)
//
// 결과물은 `artifacts/submission-images/` 에 남는다 (Git 제외).

import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const OUT = path.resolve('artifacts/submission-images');

/** 제출 이미지는 인쇄·확대에 견뎌야 하므로 2배 해상도로 찍는다 */
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

const shots = [];

async function shot(page, name, { fullPage = true, note } = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  const { size } = fs.statSync(file);
  shots.push({ name, note, kb: Math.round(size / 1024) });
  console.log(`  ✓ ${name}.png  (${Math.round(size / 1024)} KB)${note ? ` — ${note}` : ''}`);
}

/**
 * 시나리오마다 **새 세션**을 연다.
 * 지침이 이미 연결돼 있으면 `/link` 에 예시 버튼 대신 "연결 해제" 만 뜬다 —
 * 같은 컨텍스트를 재사용하면 다음 시나리오에서 영영 기다리게 된다.
 */
async function newSession(browser, locale = 'ko-KR') {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    locale,
    timezoneId: 'Asia/Seoul',
    // 현재 GPS 를 쓰지 않는 서비스다 — 권한을 주지 않은 상태로 찍는다
    permissions: [],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

/** 데모 로그인 → 지침 연결 → 안내 전체 확인 */
async function connect(page, sampleLabel) {
  await page.goto(`${BASE}/api/auth/login?provider=demo&returnTo=/link`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: sampleLabel }).click();
  await page.getByRole('button', { name: /오늘의 회복 상태 보기|See today/ }).waitFor();
  await page.goto(`${BASE}/guide`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /전체 확인 처리|Mark all as read/ }).click();
}

/** 추천 결과까지 진행. 실API 키가 없으면 false */
async function runPlan(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
  const submit = page.getByRole('button', { name: /안전 판정으로 추천 받기|Run the safety check/ });
  if ((await submit.count()) === 0) return false;
  await submit.click();
  try {
    await page.waitForURL('**/result', { timeout: 30_000 });
    await page.locator('.state-banner').first().waitFor({ timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  console.log(`캡처 대상: ${BASE}\n`);

  const page = await newSession(browser);

  // ── 대표 이미지 — 뷰포트 크기로 (양식 대표 이미지는 세로로 길면 곤란하다) ──
  await connect(page, '예시 A — 외출 가능');
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  await page.locator('.state-banner').first().waitFor();
  await shot(page, '01-대표-오늘의회복', { fullPage: false, note: '대표 이미지' });

  // ── 상세 ──
  await page.goto(`${BASE}/link`, { waitUntil: 'networkidle' });
  await shot(page, '02-병원연결', { note: '병원 발행 지침 연결' });

  await page.goto(`${BASE}/guide`, { waitUntil: 'networkidle' });
  await shot(page, '03-병원안내-읽기전용', { note: '병원 원문과 SafeHour 문구 분리' });

  await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
  await shot(page, '04-외출계획확인', { note: '병원 조건은 읽기 전용' });

  const hasResult = await runPlan(page);
  if (hasResult) {
    await shot(page, '05-판정결과', { note: '추천 3건과 복귀 마감' });

    // 변화 대응 — 시연의 핵심 장면
    const closure = page.getByRole('button', { name: /1순위 장소 휴무/ });
    if ((await closure.count()) > 0) {
      await closure.click();
      await page.locator('.sheet').waitFor();
      await shot(page, '06-변화대응', { fullPage: false, note: '휴무 → 대체 투입' });
      await page.locator('.sheet').getByRole('button', { name: '확인' }).click();
    }
  } else {
    console.log('  ! 추천 결과 화면 건너뜀 — TOUR_API_KEY 가 없거나 응답이 오지 않았다');
  }

  // 미추천 — "안전한 미추천" 이 정상 결과임을 보여주는 장면 (새 세션)
  const blockedPage = await newSession(browser);
  await connect(blockedPage, '예시 B — 외출 제한');
  await blockedPage.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  await blockedPage.locator('.state-banner').first().waitFor();
  await shot(blockedPage, '07-안전한-미추천', { note: '조건 미충족 시 정상 결과' });

  // 영문 — 대상 사용자가 외국인 환자임을 보여주는 장면 (새 세션)
  const enPage = await newSession(browser, 'en-US');
  await connect(enPage, 'Sample A — outing allowed');
  await enPage.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  await enPage.locator('.state-banner').first().waitFor();
  await shot(enPage, '08-영문-오늘의회복', { note: '영어권 브라우저 자동 진입' });

  await browser.close();

  console.log(`\n${shots.length}장 저장: ${OUT}`);
  console.log('기능설명서 3번 항목에 대표 1장 + 상세 3~5장을 골라 넣는다.');
}

main().catch((err) => {
  console.error('캡처 실패:', err.message);
  process.exitCode = 1;
});
