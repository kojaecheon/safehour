// AX-305: 관광공사 호출 경고·차단 값을 환경변수로 조정 (docs/operations.md '환경변수')
//
// 계약:
//   - 기본값은 operation별 800회 경고, 1,000회 차단(기존)이다.
//   - TOUR_API_WARNING_AT, TOUR_API_DAILY_LIMIT 로 바꿀 수 있다.
//   - 잘못된 값(숫자 아님, 0 이하, 소수)은 기본값으로 돌아간다 — 차단이 사라지지 않는다.
//   - 경고 값이 차단 값보다 크면 차단 값으로 맞춘다.
//
// 이 파일은 모듈을 읽기 전에 환경변수를 정해, 실제 클라이언트가 조정된 값으로
// 경고·차단하는지도 확인한다 (node --test 는 파일마다 별도 프로세스다).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-thresholds-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';
process.env.TOUR_API_DAILY_LIMIT = '5';
process.env.TOUR_API_WARNING_AT = '3';

let config;
let callTourApi;

before(async () => {
  config = await import('../src/tour-api/config.js');
  ({ callTourApi } = await import('../src/tour-api/client.js'));
});

after(() => {
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

function kstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function readLogEntries() {
  const file = path.join(config.TOUR_API_PATHS.logs, `calls-${kstDate()}.jsonl`);
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const okFetch = async () => ({
  ok: true,
  status: 200,
  text: async () =>
    JSON.stringify({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: '' } } }),
});

describe('호출 한도 값 해석', () => {
  test('환경변수가 없으면 기존 기본값 800 / 1,000', () => {
    const t = config.resolveCallThresholds({});
    assert.equal(t.warningAt, 800);
    assert.equal(t.dailyLimit, 1_000);
    assert.deepEqual(t.issues, []);
  });

  test('정수 값을 받는다', () => {
    const t = config.resolveCallThresholds({ TOUR_API_WARNING_AT: '4000', TOUR_API_DAILY_LIMIT: '5000' });
    assert.equal(t.warningAt, 4_000);
    assert.equal(t.dailyLimit, 5_000);
  });

  test('잘못된 값은 기본값으로 돌아간다 — 차단이 무력화되지 않는다', () => {
    for (const bad of ['', 'abc', '0', '-1', '1.5', 'Infinity', '1e3']) {
      const t = config.resolveCallThresholds({ TOUR_API_DAILY_LIMIT: bad, TOUR_API_WARNING_AT: bad });
      assert.equal(t.dailyLimit, 1_000, `차단 값 ${JSON.stringify(bad)}`);
      assert.equal(t.warningAt, 800, `경고 값 ${JSON.stringify(bad)}`);
      if (bad !== '') assert.ok(t.issues.includes('TOUR_API_DAILY_LIMIT_INVALID'));
    }
  });

  test('경고 값이 차단 값보다 크면 차단 값으로 맞춘다', () => {
    const t = config.resolveCallThresholds({ TOUR_API_DAILY_LIMIT: '500' });
    assert.equal(t.dailyLimit, 500);
    assert.equal(t.warningAt, 500);
    assert.ok(t.issues.includes('TOUR_API_WARNING_AT_ABOVE_LIMIT'));
  });
});

describe('조정된 값으로 실제 경고·차단한다', () => {
  test('모듈 상수가 환경변수 값을 따른다', () => {
    assert.equal(config.TOUR_API_DAILY_LIMIT, 5);
    assert.equal(config.TOUR_API_WARNING_AT, 3);
  });

  test('3번째 호출에 경고, 5번째까지 허용, 6번째는 호출 전에 차단', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return okFetch();
    };
    for (let i = 1; i <= 5; i += 1) {
      await callTourApi({
        serviceName: 'korean',
        operation: 'locationBasedList2',
        parameters: { pageNo: String(i) },
        useCache: false,
        fetchImpl,
      });
    }
    const warnings = readLogEntries().map((entry) => entry.warning);
    assert.deepEqual(warnings, [null, null, 'DAILY_LIMIT_NEAR', 'DAILY_LIMIT_NEAR', 'DAILY_LIMIT_NEAR']);

    await assert.rejects(
      () =>
        callTourApi({
          serviceName: 'korean',
          operation: 'locationBasedList2',
          parameters: { pageNo: '6' },
          useCache: false,
          fetchImpl,
        }),
      /일일 한도 초과/,
    );
    assert.equal(calls, 5, '차단된 호출이 외부로 나갔다');
  });
});
