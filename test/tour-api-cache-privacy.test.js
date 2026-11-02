// 응답 캐시 파일에 사용자 기준점 좌표가 남지 않는다 (spec §4.19 — 서버는 체류 정보를 저장하지 않는다)
//
// 캐시 파일명은 요청 파라미터의 해시라 좌표를 되돌릴 수 없지만, 파일 본문에 파라미터를
// 그대로 쓰면 숙소 좌표가 15분간 서버 디스크에 남는다. 본문에는 가린 값만 쓴다.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-cache-privacy-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key-do-not-log';

let callTourApi;
let TOUR_API_PATHS;

before(async () => {
  ({ callTourApi } = await import('../src/tour-api/client.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

function okFetch() {
  return async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { items: { item: [] }, totalCount: 0 },
        },
      }),
  });
}

test('캐시 파일 본문에 기준점 좌표가 없고, 같은 요청은 캐시에서 다시 읽힌다', async () => {
  const parameters = { mapX: '127.0276123', mapY: '37.4979456', radius: '10000', numOfRows: '100', pageNo: '1' };
  const first = await callTourApi({
    serviceName: 'korean',
    operation: 'locationBasedList2',
    parameters,
    fetchImpl: okFetch(),
  });
  assert.equal(first.meta.fromCache, false);

  const files = fs.readdirSync(TOUR_API_PATHS.cache).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, 1);
  const body = fs.readFileSync(path.join(TOUR_API_PATHS.cache, files[0]), 'utf8');
  assert.equal(body.includes('127.0276123'), false);
  assert.equal(body.includes('37.4979456'), false);
  assert.match(body, /REDACTED/);

  let calls = 0;
  const second = await callTourApi({
    serviceName: 'korean',
    operation: 'locationBasedList2',
    parameters,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('캐시에서 읽혀야 한다');
    },
  });
  assert.equal(calls, 0);
  assert.equal(second.meta.fromCache, true);
});
