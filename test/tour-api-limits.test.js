// AX-006 — TourAPI 호출 한도·카운터·캐시 경계 (D07-POL005, D09-AC017, D06-E006)
//
// 계약:
//   - operation별 일일 카운터. 800번째 호출부터 경고, 1,000회까지만 허용.
//   - 캐시 적중은 외부 호출이 아니므로 카운터를 늘리지 않는다.
//   - 병렬 호출에서도 한도를 넘겨 호출하지 않는다 (검사-증가 사이 경쟁 조건 금지).
//   - 인증키·전체 query URL 은 호출 로그에 남지 않는다 (AGENTS.md 불변조건).

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-limits-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key-do-not-log';

let callTourApi;
let tourApiCounterSummary;
let TOUR_API_PATHS;
let TOUR_API_DAILY_LIMIT;
let TOUR_API_WARNING_AT;

before(async () => {
  // env 설정 후에 모듈을 읽어야 임시 데이터 루트가 반영된다
  ({ callTourApi, tourApiCounterSummary } = await import('../src/tour-api/client.js'));
  ({ TOUR_API_PATHS, TOUR_API_DAILY_LIMIT, TOUR_API_WARNING_AT } = await import(
    '../src/tour-api/config.js'
  ));
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

function counterFile() {
  return path.join(TOUR_API_PATHS.logs, `counter-${kstDate()}.json`);
}

function logFile() {
  return path.join(TOUR_API_PATHS.logs, `calls-${kstDate()}.jsonl`);
}

/** 카운터를 특정 값으로 미리 세팅해 경계 직전 상태를 만든다 */
function seedCounter(operationKey, count) {
  fs.writeFileSync(counterFile(), `${JSON.stringify({ [operationKey]: count })}\n`, 'utf8');
}

function readLogEntries() {
  try {
    return fs
      .readFileSync(logFile(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function okResponse(items = []) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { items: { item: items }, totalCount: items.length },
        },
      }),
  };
}

function countingFetch(response = okResponse()) {
  const state = { calls: 0, urls: [] };
  const impl = async (url) => {
    state.calls += 1;
    state.urls.push(String(url));
    return typeof response === 'function' ? response() : response;
  };
  return { impl, state };
}

const OP = { serviceName: 'korean', operation: 'locationBasedList2' };
const OP_KEY = 'korean.locationBasedList2';

/** 캐시를 매번 우회하도록 파라미터를 다르게 준다 */
function uniqueParams(seed) {
  return { pageNo: String(seed), numOfRows: '10' };
}

beforeEach(() => {
  fs.rmSync(TOUR_API_PATHS.logs, { recursive: true, force: true });
  fs.rmSync(TOUR_API_PATHS.cache, { recursive: true, force: true });
  fs.mkdirSync(TOUR_API_PATHS.logs, { recursive: true });
  fs.mkdirSync(TOUR_API_PATHS.cache, { recursive: true });
});

describe('일일 한도 경계 (D09-AC017)', () => {
  test('799번째 호출은 통과하고 경고가 없다', async () => {
    seedCounter(OP_KEY, TOUR_API_WARNING_AT - 2); // 798
    const { impl, state } = countingFetch();

    await callTourApi({ ...OP, parameters: uniqueParams(1), useCache: false, fetchImpl: impl });

    assert.equal(state.calls, 1);
    const entry = readLogEntries().at(-1);
    assert.equal(entry.dailyCount, 799);
    assert.equal(entry.warning, null);
  });

  test('800번째 호출은 통과하고 DAILY_LIMIT_NEAR 경고를 남긴다', async () => {
    seedCounter(OP_KEY, TOUR_API_WARNING_AT - 1); // 799
    const { impl } = countingFetch();

    await callTourApi({ ...OP, parameters: uniqueParams(2), useCache: false, fetchImpl: impl });

    const entry = readLogEntries().at(-1);
    assert.equal(entry.dailyCount, TOUR_API_WARNING_AT);
    assert.equal(entry.warning, 'DAILY_LIMIT_NEAR');
  });

  test('999번째 호출은 통과한다', async () => {
    seedCounter(OP_KEY, TOUR_API_DAILY_LIMIT - 2); // 998
    const { impl, state } = countingFetch();

    await callTourApi({ ...OP, parameters: uniqueParams(3), useCache: false, fetchImpl: impl });

    assert.equal(state.calls, 1);
    assert.equal(readLogEntries().at(-1).dailyCount, 999);
  });

  test('1,000번째 호출까지 허용하고 1,001번째는 차단한다', async () => {
    seedCounter(OP_KEY, TOUR_API_DAILY_LIMIT - 1); // 999
    const { impl, state } = countingFetch();

    // 1,000번째 — 허용
    await callTourApi({ ...OP, parameters: uniqueParams(4), useCache: false, fetchImpl: impl });
    assert.equal(state.calls, 1);
    assert.equal(readLogEntries().at(-1).dailyCount, TOUR_API_DAILY_LIMIT);

    // 1,001번째 — 차단, 외부 호출이 발생하지 않아야 한다
    await assert.rejects(
      () => callTourApi({ ...OP, parameters: uniqueParams(5), useCache: false, fetchImpl: impl }),
      /일일 한도 초과/,
    );
    assert.equal(state.calls, 1, '차단된 호출이 외부로 나갔다');
  });

  test('한도는 operation별로 독립이다', async () => {
    seedCounter(OP_KEY, TOUR_API_DAILY_LIMIT); // korean.locationBasedList2 소진
    const { impl, state } = countingFetch();

    await assert.rejects(
      () => callTourApi({ ...OP, parameters: uniqueParams(6), useCache: false, fetchImpl: impl }),
      /일일 한도 초과/,
    );

    // 다른 서비스의 같은 operation 은 영향받지 않는다
    await callTourApi({
      serviceName: 'english',
      operation: 'locationBasedList2',
      parameters: uniqueParams(6),
      useCache: false,
      fetchImpl: impl,
    });
    assert.equal(state.calls, 1);
    assert.equal(tourApiCounterSummary().byOperation['english.locationBasedList2'], 1);
  });

  test('병렬 호출이 한도를 넘겨 나가지 않는다 (검사-증가 경쟁 조건)', async () => {
    // 후보 조회는 국문·영문·무장애를 Promise.all 로 동시 호출한다.
    // 999 에서 3건이 동시에 들어오면 1건만 나가야 한다.
    seedCounter(OP_KEY, TOUR_API_DAILY_LIMIT - 1); // 999
    const { impl, state } = countingFetch();

    const results = await Promise.allSettled([
      callTourApi({ ...OP, parameters: uniqueParams(11), useCache: false, fetchImpl: impl }),
      callTourApi({ ...OP, parameters: uniqueParams(12), useCache: false, fetchImpl: impl }),
      callTourApi({ ...OP, parameters: uniqueParams(13), useCache: false, fetchImpl: impl }),
    ]);

    assert.equal(state.calls, 1, `한도를 넘겨 ${state.calls}건이 외부로 나갔다`);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(tourApiCounterSummary().byOperation[OP_KEY], TOUR_API_DAILY_LIMIT);
  });

  test('동시 호출에서 카운터 증가가 유실되지 않는다', async () => {
    const { impl, state } = countingFetch();

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        callTourApi({ ...OP, parameters: uniqueParams(20 + i), useCache: false, fetchImpl: impl }),
      ),
    );

    assert.equal(state.calls, 5);
    assert.equal(tourApiCounterSummary().byOperation[OP_KEY], 5);
  });
});

describe('실패 호출과 카운터', () => {
  test('HTTP 오류도 실제 호출이므로 카운터에 반영된다', async () => {
    const impl = async () => ({ ok: false, status: 500, text: async () => '{}' });

    await assert.rejects(() =>
      callTourApi({ ...OP, parameters: uniqueParams(30), useCache: false, fetchImpl: impl }),
    );

    assert.equal(tourApiCounterSummary().byOperation[OP_KEY], 1);
    const entry = readLogEntries().at(-1);
    assert.equal(entry.ok, false);
    assert.ok(entry.error);
  });

  test('HTTP 200 이지만 resultCode 가 정상이 아니면 실패로 다룬다', async () => {
    const impl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          response: { header: { resultCode: '22', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS' } },
        }),
    });

    await assert.rejects(
      () => callTourApi({ ...OP, parameters: uniqueParams(31), useCache: false, fetchImpl: impl }),
      /TourAPI 오류 22/,
    );
    assert.equal(readLogEntries().at(-1).ok, false);
  });

  test('JSON 이 아닌 응답은 안전하게 실패한다', async () => {
    const impl = async () => ({ ok: true, status: 200, text: async () => '<html>error</html>' });

    await assert.rejects(
      () => callTourApi({ ...OP, parameters: uniqueParams(32), useCache: false, fetchImpl: impl }),
      /JSON이 아닌 응답/,
    );
  });
});

describe('캐시 경계 (D06-E006)', () => {
  test('캐시 적중은 외부 호출도 카운터 증가도 일으키지 않는다', async () => {
    const { impl, state } = countingFetch();
    const params = uniqueParams(40);

    const first = await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    assert.equal(first.meta.fromCache, false);

    const second = await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    assert.equal(second.meta.fromCache, true);

    assert.equal(state.calls, 1);
    assert.equal(tourApiCounterSummary().byOperation[OP_KEY], 1);
  });

  test('한도가 소진돼도 유효한 캐시는 계속 제공된다', async () => {
    const { impl, state } = countingFetch();
    const params = uniqueParams(41);

    await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    seedCounter(OP_KEY, TOUR_API_DAILY_LIMIT);

    const cached = await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    assert.equal(cached.meta.fromCache, true);
    assert.equal(state.calls, 1);
  });

  test('TTL 이 지난 캐시는 사용하지 않고 다시 호출한다', async () => {
    const { impl, state } = countingFetch();
    const params = uniqueParams(42);

    await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });

    // 캐시 파일을 1시간 전으로 되돌려 실제 stale 상황을 만든다 (기본 TTL 15분)
    const cacheFile = path.join(TOUR_API_PATHS.cache, fs.readdirSync(TOUR_API_PATHS.cache)[0]);
    const anHourAgo = new Date(Date.now() - 3600_000);
    fs.utimesSync(cacheFile, anHourAgo, anHourAgo);

    const refetched = await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });

    assert.equal(state.calls, 2);
    assert.equal(refetched.meta.fromCache, false);
  });

  test('손상된 캐시 파일은 무시하고 정상 호출한다', async () => {
    const { impl, state } = countingFetch();
    const params = uniqueParams(43);

    await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    const cacheFiles = fs.readdirSync(TOUR_API_PATHS.cache);
    fs.writeFileSync(path.join(TOUR_API_PATHS.cache, cacheFiles[0]), '{broken', 'utf8');

    const result = await callTourApi({ ...OP, parameters: params, useCache: true, fetchImpl: impl });
    assert.equal(result.meta.fromCache, false);
    assert.equal(state.calls, 2);
  });
});

describe('카운터 파일 무결성', () => {
  test('손상된 카운터로는 한도 차단이 무력화되지 않는다', async () => {
    // 부분 기록으로 잘린 파일 — 한도를 소진한 상태였는지 알 수 없다
    fs.writeFileSync(counterFile(), '{"korean.locationBasedList2": 1000,', 'utf8');
    const { impl, state } = countingFetch();

    await assert.rejects(
      () => callTourApi({ ...OP, parameters: uniqueParams(60), useCache: false, fetchImpl: impl }),
      /카운터/,
      '카운터를 신뢰할 수 없는데 외부 호출을 허용했다',
    );
    assert.equal(state.calls, 0);
  });

  test('손상된 카운터를 0 으로 덮어써 다른 operation 카운트를 지우지 않는다', async () => {
    fs.writeFileSync(counterFile(), '{"korean.locationBasedList2": 1000,', 'utf8');
    const { impl } = countingFetch();

    await assert.rejects(() =>
      callTourApi({ ...OP, parameters: uniqueParams(61), useCache: false, fetchImpl: impl }),
    );

    // 복구를 빌미로 파일을 통째로 재작성하면 살아있던 다른 카운트가 사라진다
    const raw = fs.readFileSync(counterFile(), 'utf8');
    assert.equal(raw.startsWith('{"korean.locationBasedList2": 1000,'), true, '손상 파일을 덮어썼다');
  });

  test('카운터 파일이 없으면 새 날로 보고 정상 진행한다', async () => {
    fs.rmSync(counterFile(), { force: true });
    const { impl, state } = countingFetch();

    await callTourApi({ ...OP, parameters: uniqueParams(62), useCache: false, fetchImpl: impl });

    assert.equal(state.calls, 1);
    assert.equal(tourApiCounterSummary().byOperation[OP_KEY], 1);
  });

  test('카운터 쓰기는 원자적이라 중간 상태가 남지 않는다', async () => {
    const { impl } = countingFetch();
    await callTourApi({ ...OP, parameters: uniqueParams(63), useCache: false, fetchImpl: impl });

    // 임시 파일이 남아 다음 읽기를 오염시키면 안 된다
    const strays = fs
      .readdirSync(TOUR_API_PATHS.logs)
      .filter((f) => f.includes('.tmp') || f.endsWith('~'));
    assert.deepEqual(strays, [], `임시 파일이 남았다: ${strays.join(', ')}`);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(counterFile(), 'utf8')));
  });
});

describe('로그 안전성 (AGENTS.md 불변조건)', () => {
  test('인증키와 전체 query URL 이 호출 로그에 남지 않는다', async () => {
    const { impl, state } = countingFetch();
    await callTourApi({ ...OP, parameters: uniqueParams(50), useCache: false, fetchImpl: impl });

    // 실제 요청 URL 에는 키가 들어간다
    assert.ok(state.urls[0].includes('serviceKey='));

    // 로그에는 남지 않아야 한다
    const raw = fs.readFileSync(logFile(), 'utf8');
    assert.equal(raw.includes(process.env.TOUR_API_KEY), false, '인증키가 로그에 남았다');
    assert.equal(raw.includes('serviceKey'), false, 'serviceKey 파라미터가 로그에 남았다');

    const entry = readLogEntries().at(-1);
    assert.equal(entry.endpoint.includes('?'), false, 'endpoint 에 query 가 포함됐다');
  });

  test('기준점 좌표가 호출 로그에 남지 않는다 (D07-POL002)', async () => {
    const { impl } = countingFetch();
    // 위치기반 조회가 넘기는 형태 — mapX/mapY 는 사용자가 선택한 고정 기준점이다.
    // 그대로 쌓이면 "언제 어느 좌표를 조회했는지"가 시계열로 남아 위치 이력이 된다.
    await callTourApi({
      ...OP,
      parameters: { ...uniqueParams(52), mapX: '127.0276', mapY: '37.4979', radius: '3000' },
      useCache: false,
      fetchImpl: impl,
    });

    const raw = fs.readFileSync(logFile(), 'utf8');
    assert.equal(raw.includes('127.0276'), false, '경도가 호출 로그에 남았다');
    assert.equal(raw.includes('37.4979'), false, '위도가 호출 로그에 남았다');

    const entry = readLogEntries().at(-1);
    assert.equal(entry.parameters.mapX, 'REDACTED', '좌표가 가려졌다는 사실이 보이지 않는다');
    assert.equal(entry.parameters.mapY, 'REDACTED');
    // 좌표가 아닌 파라미터는 심사 증빙에 필요하므로 그대로 남는다
    assert.equal(entry.parameters.radius, '3000', '좌표가 아닌 파라미터까지 지워졌다');
  });

  test('캐시 파일에도 기준점 좌표가 남지 않는다 (D07-POL002)', async () => {
    const { impl } = countingFetch();
    // 로그만 가리고 캐시에 원본 좌표를 남기면 통제가 반쪽이다 —
    // 두 파일이 같은 데이터 루트에 나란히 쌓인다.
    await callTourApi({
      ...OP,
      parameters: { ...uniqueParams(54), mapX: '127.0276', mapY: '37.4979' },
      useCache: true,
      fetchImpl: impl,
    });

    const files = fs.readdirSync(TOUR_API_PATHS.cache).filter((f) => f.endsWith('.json'));
    assert.ok(files.length > 0, '캐시 파일이 만들어지지 않아 검증할 수 없다');
    const raw = files
      .map((f) => fs.readFileSync(path.join(TOUR_API_PATHS.cache, f), 'utf8'))
      .join('\n');

    assert.equal(raw.includes('127.0276'), false, '경도가 캐시 파일에 남았다');
    assert.equal(raw.includes('37.4979'), false, '위도가 캐시 파일에 남았다');
  });

  test('상세 조회의 contentId 도 로그에 남지 않는다', async () => {
    const { impl } = countingFetch();
    // 좌표를 넘기지 않는 오퍼레이션이지만, 공개 식별자라 그것만으로 장소
    // 좌표를 조회할 수 있고 그 장소는 기준점 반경 3km 의 상위 후보다.
    await callTourApi({
      ...OP,
      parameters: { ...uniqueParams(55), contentId: '2733967' },
      useCache: false,
      fetchImpl: impl,
    });

    const raw = fs.readFileSync(logFile(), 'utf8');
    assert.equal(raw.includes('2733967'), false, 'contentId 가 호출 로그에 남았다');
    assert.equal(readLogEntries().at(-1).parameters.contentId, 'REDACTED');
  });

  test('만료된 캐시는 쌓이지 않고 정리된다', async () => {
    const { impl } = countingFetch();
    // 만료본이 계속 남으면 "언제 어디를 조회했는지"의 시계열이 누적된다.
    // 서버리스에서는 /tmp 라 배포마다 사라지지만, 로컬은 이 정리가 유일한 방어선이다.
    await callTourApi({ ...OP, parameters: uniqueParams(56), useCache: true, fetchImpl: impl });

    const before = fs.readdirSync(TOUR_API_PATHS.cache).filter((f) => f.endsWith('.json'));
    assert.ok(before.length > 0);

    // 기존 캐시 파일을 이틀 전으로 되돌린다
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (const f of before) fs.utimesSync(path.join(TOUR_API_PATHS.cache, f), stale, stale);

    await callTourApi({ ...OP, parameters: uniqueParams(57), useCache: true, fetchImpl: impl });

    const after = fs.readdirSync(TOUR_API_PATHS.cache).filter((f) => f.endsWith('.json'));
    for (const f of before) {
      assert.equal(after.includes(f), false, `만료된 캐시 ${f} 가 남아 있다`);
    }
    assert.equal(after.length, 1, '방금 쓴 캐시만 남아야 한다');
  });

  test('로그 쓰기가 실패해도 호출 결과는 정상 반환된다', async () => {
    const { impl } = countingFetch();
    const original = fs.appendFileSync;
    fs.appendFileSync = () => {
      throw new Error('ENOSPC');
    };
    try {
      // 로그는 관측 수단이다. 여기서 터지면 사용자가 안전 판정을 못 받는다.
      const result = await callTourApi({
        ...OP,
        parameters: uniqueParams(53),
        useCache: false,
        fetchImpl: impl,
      });
      assert.ok(result, '로그 실패가 호출 결과를 삼켰다');
    } finally {
      fs.appendFileSync = original;
    }
  });

  test('반환값에도 인증키가 포함되지 않는다', async () => {
    const { impl } = countingFetch();
    const result = await callTourApi({
      ...OP,
      parameters: uniqueParams(51),
      useCache: false,
      fetchImpl: impl,
    });

    assert.equal(JSON.stringify(result).includes(process.env.TOUR_API_KEY), false);
  });
});
