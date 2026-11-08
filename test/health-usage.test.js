// GET /api/health: 관광공사 자체 호출 카운터 요약
//
// 계약:
//   - 오늘(KST) operation별 사용 횟수와 차단 값(used/limit), 경고 값(warningAt), 차단 값(dailyLimit)을 알린다.
//   - 카운터 파일만 읽는다. 키·URL·매개변수는 응답에 없다.
//   - 카운터가 손상돼도 헬스 응답은 200 이고 counterReadable: false 다.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTourApiUsage } from '../lib/server/tour-api-usage.js';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-health-usage-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'health-usage-secret-key';
process.env.TOUR_API_DAILY_LIMIT = '1000';
process.env.TOUR_API_WARNING_AT = '800';

let healthGet;
let TOUR_API_PATHS;

before(async () => {
  ({ GET: healthGet } = await import('../app/api/health/route.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

function counterFile() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
  return path.join(TOUR_API_PATHS.logs, `counter-${day}.json`);
}

describe('헬스 응답의 tourApiUsage', () => {
  test('오늘 카운터를 operation별 used/limit 와 경고 값으로 알린다', async () => {
    fs.writeFileSync(
      counterFile(),
      JSON.stringify({ 'korean.locationBasedList2': 812, 'english.locationBasedList2': 3, 'korean.detailIntro2': 1000 }),
      'utf8',
    );
    const res = await healthGet();
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.equal(raw.includes('health-usage-secret-key'), false, '인증키가 응답에 노출됐다');
    assert.equal(raw.includes('apis.data.go.kr'), false, 'URL 이 응답에 노출됐다');
    const { tourApiUsage } = JSON.parse(raw);
    assert.equal(tourApiUsage.dailyLimit, 1000);
    assert.equal(tourApiUsage.warningAt, 800);
    assert.equal(tourApiUsage.counterReadable, true);
    assert.match(tourApiUsage.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(tourApiUsage.operations, {
      'english.locationBasedList2': { used: 3, limit: 1000, state: 'OK' },
      'korean.detailIntro2': { used: 1000, limit: 1000, state: 'BLOCKED' },
      'korean.locationBasedList2': { used: 812, limit: 1000, state: 'WARNING' },
    });
  });

  test('카운터가 없으면(새 날) operations 는 비어 있다', async () => {
    fs.rmSync(counterFile(), { force: true });
    const { tourApiUsage } = await (await healthGet()).json();
    assert.equal(tourApiUsage.counterReadable, true);
    assert.deepEqual(tourApiUsage.operations, {});
  });

  test('카운터가 손상되면 200 에 counterReadable: false, 파일 경로는 싣지 않는다', async () => {
    fs.writeFileSync(counterFile(), '{broken', 'utf8');
    const res = await healthGet();
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.equal(raw.includes(DATA_ROOT), false);
    const { tourApiUsage } = JSON.parse(raw);
    assert.equal(tourApiUsage.counterReadable, false);
    assert.deepEqual(tourApiUsage.operations, {});
    fs.rmSync(counterFile(), { force: true });
  });
});

describe('buildTourApiUsage', () => {
  test("'서비스.오퍼레이션' 모양이 아닌 이름과 숫자가 아닌 값은 내보내지 않는다", () => {
    const usage = buildTourApiUsage({
      summary: () => ({
        date: '2026-11-08',
        byOperation: { 'korean.locationBasedList2': 5, 'https://x?serviceKey=k': 9, 'korean.detail2': 'many' },
      }),
      dailyLimit: 10,
      warningAt: 8,
    });
    assert.deepEqual(usage.operations, {
      'korean.detail2': { used: 0, limit: 10, state: 'OK' },
      'korean.locationBasedList2': { used: 5, limit: 10, state: 'OK' },
    });
  });
});
