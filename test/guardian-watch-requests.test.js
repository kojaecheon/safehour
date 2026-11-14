// 서버 알림 요청 모양 (src/guardian/watchRequests.js · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3)
//
// 이 파일이 고정하는 것
//   - 형식 정규식과 한도가 서버(lib/server/watch/keys.js·limits.js)와 같다
//   - 새 식별 값은 주입한 난수로 만든 22자·43자 base64url 이다
//   - 본문은 허용 목록 필드만 싣는다. undo 는 true 일 때만 싣는다
//   - 형식이 틀리면 TypeError 이고 메시지에 값이 없다
//   - 응답 분류(200, 404, 401, 429, 400, 503 OFF, 503 그 밖, 500, 네트워크)
//   - 클라이언트 모듈(요청 모듈, 기기 저장소, 올릴 상태 계산)은 서버 전용 모듈을 불러오지 않는다
//   - 기기 저장소(lib/store)는 lib/trip 에 닿지 않는다
//
// 외부 호출은 없다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WATCH_ID_RE as SERVER_WATCH_ID_RE, WRITE_TOKEN_RE as SERVER_WRITE_TOKEN_RE } from '../lib/server/watch/keys.js';
import { WATCH_LIMITS } from '../lib/server/watch/limits.js';
import {
  WATCH_ID_RE,
  WATCH_KIND,
  WATCH_PATHS,
  WATCH_UPLOAD_MAX_DAYS,
  WATCH_UPLOAD_MAX_PER_DAY,
  WRITE_TOKEN_RE,
  backRequest,
  classifyWatchResponse,
  configRequest,
  deadlinesRequest,
  newWatchIds,
  registerRequest,
  removeAllRequest,
  removeRequest,
} from '../src/guardian/watchRequests.js';
import { addDays } from '../src/stay/time.js';
import { IDS } from './watch-fixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDENTS = Object.freeze({ watchId: IDS.watchId, writeToken: IDS.writeToken });
const DATE = '2026-11-20';

/** 날짜 n개 (DATE 부터) */
function datesFrom(n) {
  return Array.from({ length: n }, (_, i) => addDays(DATE, i));
}

/** 시각 n개 (09:00 부터 1시간 간격, 넘으면 분을 바꾼다) */
function timesOf(n) {
  return Array.from({ length: n }, (_, i) => `${String(9 + (i % 12)).padStart(2, '0')}:${String(Math.floor(i / 12) * 5).padStart(2, '0')}`);
}

/** TypeError 이고 메시지에 금지한 값이 하나도 없다 */
function throwsWithout(fn, values) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof TypeError, String(error));
    for (const value of values) assert.ok(!error.message.includes(value), '메시지에 값이 있다');
    return true;
  });
}

describe('형식과 한도', () => {
  test('형식과 한도가 서버와 같다', () => {
    assert.equal(WATCH_ID_RE.source, SERVER_WATCH_ID_RE.source);
    assert.equal(WATCH_ID_RE.flags, SERVER_WATCH_ID_RE.flags);
    assert.equal(WRITE_TOKEN_RE.source, SERVER_WRITE_TOKEN_RE.source);
    assert.equal(WRITE_TOKEN_RE.flags, SERVER_WRITE_TOKEN_RE.flags);
    assert.equal(WATCH_UPLOAD_MAX_DAYS, WATCH_LIMITS.maxDays);
    assert.equal(WATCH_UPLOAD_MAX_PER_DAY, WATCH_LIMITS.maxDeadlinesPerDay);
  });

  test('newWatchIds 는 22자·43자 base64url 이고 주입한 난수를 쓴다', () => {
    const asked = [];
    let seed = 0;
    const randomBytes = (n) => {
      asked.push(n);
      seed += 1;
      return Uint8Array.from({ length: n }, (_, i) => (i * 37 + seed * 101) & 0xff);
    };
    const ids = newWatchIds({ randomBytes });
    assert.deepEqual(asked, [16, 32]);
    assert.match(ids.watchId, WATCH_ID_RE);
    assert.match(ids.writeToken, WRITE_TOKEN_RE);
    assert.equal(ids.watchId, Buffer.from(Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 101) & 0xff)).toString('base64url'));
    assert.equal(ids.writeToken, Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 202) & 0xff)).toString('base64url'));
    assert.deepEqual(Object.keys(ids).sort(), ['watchId', 'writeToken']);

    // 주입하지 않으면 WebCrypto 난수다. 두 번 만들면 다르다
    const a = newWatchIds();
    const b = newWatchIds();
    assert.match(a.watchId, WATCH_ID_RE);
    assert.match(a.writeToken, WRITE_TOKEN_RE);
    assert.notEqual(a.watchId, b.watchId);
    assert.notEqual(a.writeToken, b.writeToken);

    // 길이가 틀린 난수는 받지 않는다
    assert.throws(() => newWatchIds({ randomBytes: (n) => new Uint8Array(n - 1) }), TypeError);
  });
});

describe('요청 모양', () => {
  test('요청 모양은 허용 목록 필드만 싣는다', () => {
    const register = registerRequest({ ...IDENTS, expiresOn: '2026-11-25', extra: 1, lat: 37.5 });
    assert.deepEqual(register, {
      method: 'POST',
      path: WATCH_PATHS.watch,
      body: { watchId: IDS.watchId, writeToken: IDS.writeToken, expiresOn: '2026-11-25' },
    });
    assert.deepEqual(Object.keys(register.body), ['watchId', 'writeToken', 'expiresOn']);

    const deadlines = deadlinesRequest({
      ...IDENTS,
      expiresOn: '2026-11-25',
      days: [{ date: DATE, deadlines: ['14:30'], hospital: 'x', returnPlace: 'LODGING' }],
      accountKey: IDS.accountKey,
    });
    assert.equal(deadlines.method, 'PUT');
    assert.equal(deadlines.path, WATCH_PATHS.deadlines);
    assert.deepEqual(Object.keys(deadlines.body), ['watchId', 'writeToken', 'expiresOn', 'days']);
    assert.deepEqual(deadlines.body.days, [{ date: DATE, deadlines: ['14:30'] }]);

    const back = backRequest({ ...IDENTS, date: DATE, by: '14:30', outingId: 'o1', place: 'x' });
    assert.deepEqual(back, {
      method: 'POST',
      path: WATCH_PATHS.back,
      body: { watchId: IDS.watchId, writeToken: IDS.writeToken, date: DATE, by: '14:30' },
    });

    assert.deepEqual(removeRequest({ ...IDENTS, all: true, expiresOn: '2026-11-25' }), {
      method: 'DELETE',
      path: WATCH_PATHS.watch,
      body: { watchId: IDS.watchId, writeToken: IDS.writeToken },
    });
    assert.deepEqual(removeAllRequest(), { method: 'DELETE', path: WATCH_PATHS.watch, body: { all: true } });
    assert.deepEqual(configRequest(), { method: 'GET', path: WATCH_PATHS.config, body: null });
  });

  test('경로에 식별 값이나 질의가 없다', () => {
    for (const path of Object.values(WATCH_PATHS)) {
      assert.match(path, /^\/api\/[a-z/]+$/);
    }
    const requests = [
      registerRequest({ ...IDENTS, expiresOn: '2026-11-25' }),
      deadlinesRequest({ ...IDENTS, expiresOn: '2026-11-25', days: [] }),
      backRequest({ ...IDENTS, date: DATE, by: '14:30' }),
      removeRequest(IDENTS),
    ];
    for (const request of requests) {
      assert.ok(Object.values(WATCH_PATHS).includes(request.path));
      assert.ok(!request.path.includes(IDS.watchId));
    }
  });

  test('backRequest 는 undo 가 true 일 때만 undo 를 싣는다', () => {
    const base = { ...IDENTS, date: DATE, by: '23:55' };
    assert.equal(backRequest({ ...base, undo: true }).body.undo, true);
    assert.ok(!Object.hasOwn(backRequest({ ...base, undo: false }).body, 'undo'));
    assert.ok(!Object.hasOwn(backRequest(base).body, 'undo'));
    // 불리언이 아니면 확인으로 잘못 보내지 않고 던진다
    for (const undo of ['true', 1, null]) {
      assert.throws(() => backRequest({ ...base, undo }), TypeError, String(undo));
    }
  });

  test('형식이 틀리면 TypeError: watchId 21자, 시각 24:00, 날짜 2026-2-1, days 47개, 하루 11개, 날짜 중복', () => {
    const short = IDS.watchId.slice(1);
    throwsWithout(() => registerRequest({ watchId: short, writeToken: IDS.writeToken, expiresOn: '2026-11-25' }), [short]);
    throwsWithout(() => registerRequest({ watchId: `${IDS.watchId}a`, writeToken: IDS.writeToken, expiresOn: '2026-11-25' }), [IDS.watchId]);
    throwsWithout(() => removeRequest({ watchId: IDS.watchId, writeToken: IDS.writeToken.slice(1) }), [IDS.watchId]);
    throwsWithout(() => backRequest({ watchId: 'WATCHidFixture_0123+ab', writeToken: IDS.writeToken, date: DATE, by: '14:30' }), []);
    throwsWithout(() => backRequest({ ...IDENTS, date: DATE, by: '24:00' }), ['24:00', IDS.watchId, IDS.writeToken]);
    throwsWithout(() => backRequest({ ...IDENTS, date: '2026-2-1', by: '14:30' }), ['2026-2-1', IDS.watchId]);
    throwsWithout(() => registerRequest({ ...IDENTS, expiresOn: '2026-2-1' }), ['2026-2-1']);
    throwsWithout(() => registerRequest(undefined), []);
    throwsWithout(() => removeRequest(null), []);

    const day = (date, deadlines = ['14:30']) => ({ date, deadlines });
    const upload = (days) => () => deadlinesRequest({ ...IDENTS, expiresOn: '2027-01-31', days });
    throwsWithout(upload(datesFrom(47).map((date) => day(date))), [DATE]);
    throwsWithout(upload([day(DATE, timesOf(11))]), [DATE, '09:00']);
    throwsWithout(upload([day(DATE), day('2026-11-21'), day(DATE)]), [DATE]);
    throwsWithout(upload([day('2026-2-1')]), ['2026-2-1']);
    throwsWithout(upload([day(DATE, ['24:00'])]), ['24:00']);
    throwsWithout(upload([day(DATE, '14:30')]), ['14:30']);
    throwsWithout(upload([{ date: DATE }]), [DATE]);
    throwsWithout(upload(null), []);
    throwsWithout(() => deadlinesRequest({ ...IDENTS, expiresOn: '2026-11-31', days: [] }), ['2026-11-31']);

    // 경계값은 통과한다
    const edge = deadlinesRequest({
      ...IDENTS,
      expiresOn: '2027-01-31',
      days: datesFrom(WATCH_UPLOAD_MAX_DAYS).map((date) => day(date, timesOf(WATCH_UPLOAD_MAX_PER_DAY))),
    });
    assert.equal(edge.body.days.length, 46);
    assert.ok(edge.body.days.every((d) => d.deadlines.length === 10));
  });

  test('deadlinesRequest 는 시각을 정렬하고 중복을 없앤다', () => {
    const input = { ...IDENTS, expiresOn: '2026-11-25', days: [{ date: DATE, deadlines: ['18:00', '09:30', '18:00', '12:00'] }] };
    const request = deadlinesRequest(input);
    assert.deepEqual(request.body.days, [{ date: DATE, deadlines: ['09:30', '12:00', '18:00'] }]);
    // 입력을 고치지 않는다
    assert.deepEqual(input.days[0].deadlines, ['18:00', '09:30', '18:00', '12:00']);
    assert.notEqual(request.body.days[0].deadlines, input.days[0].deadlines);
    // 중복을 없앤 뒤 10개면 보낸다(서버도 중복을 없앤 목록을 받는다)
    const withDuplicate = [...timesOf(10), '09:00'];
    assert.equal(withDuplicate.length, 11);
    const ok = deadlinesRequest({ ...IDENTS, expiresOn: '2026-11-25', days: [{ date: DATE, deadlines: withDuplicate }] });
    assert.equal(ok.body.days[0].deadlines.length, 10);
  });
});

describe('응답 분류', () => {
  test('응답 분류: 200, 404, 401, 429, 400, 503 OFF, 503 UNAVAILABLE, 500, 네트워크', () => {
    assert.equal(classifyWatchResponse({ status: 200 }), WATCH_KIND.OK);
    assert.equal(classifyWatchResponse({ status: 204 }), WATCH_KIND.OK);
    assert.equal(classifyWatchResponse({ status: 404, errorCode: 'SAFEHOUR_WATCH_NOT_FOUND' }), WATCH_KIND.NOT_FOUND);
    assert.equal(classifyWatchResponse({ status: 401, errorCode: 'SAFEHOUR_AUTH_REQUIRED' }), WATCH_KIND.LOGIN_REQUIRED);
    assert.equal(classifyWatchResponse({ status: 429, errorCode: 'SAFEHOUR_RATE_LIMITED' }), WATCH_KIND.RATE_LIMITED);
    assert.equal(classifyWatchResponse({ status: 400, errorCode: 'SAFEHOUR_BAD_REQUEST' }), WATCH_KIND.BAD);
    assert.equal(classifyWatchResponse({ status: 503, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' }), WATCH_KIND.OFF);
    assert.equal(classifyWatchResponse({ status: 503, errorCode: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE' }), WATCH_KIND.UNAVAILABLE);
    assert.equal(classifyWatchResponse({ status: 503 }), WATCH_KIND.UNAVAILABLE);
    assert.equal(classifyWatchResponse({ status: 500, errorCode: 'SAFEHOUR_SERVER_PUSH_OFF' }), WATCH_KIND.UNAVAILABLE);
    assert.equal(classifyWatchResponse({ status: 418 }), WATCH_KIND.UNAVAILABLE);
    assert.equal(classifyWatchResponse({ status: 0, network: true, errorCode: 'NETWORK_ERROR' }), WATCH_KIND.NETWORK);
    assert.equal(classifyWatchResponse({ status: 200, network: true }), WATCH_KIND.NETWORK);
    assert.equal(classifyWatchResponse(), WATCH_KIND.UNAVAILABLE);
    assert.deepEqual(Object.values(WATCH_KIND).sort(), ['BAD', 'LOGIN_REQUIRED', 'NETWORK', 'NOT_FOUND', 'OFF', 'OK', 'RATE_LIMITED', 'UNAVAILABLE']);
  });
});

describe('모듈 경계', () => {
  const STORE_ENTRIES = ['lib/store/store.js', 'lib/store/index.js', 'lib/store/guardianWatch.js'];
  const ENTRIES = [
    'src/guardian/watchRequests.js',
    'src/guardian/watchSend.js',
    'lib/trip/watchApi.js',
    'src/guardian/deadlines.js',
    ...STORE_ENTRIES,
    'lib/trip/watchPlan.js',
  ];
  const FORBIDDEN = /lib\/server\/|src\/auth\/|src\/push\/|^node:|^@\//;

  /** 파일 하나의 import·export 지정자 (여러 줄 import, 부수 효과 import, 동적 import 포함) */
  function specifiersOf(source) {
    const patterns = [
      /^\s*(?:import|export)\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm,
      /^\s*import\s+['"]([^'"]+)['"]/gm,
      /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    return patterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]));
  }

  /** 시작 파일들에서 상대 경로 import 를 끝까지 따라간다. { 파일: 지정자 목록 } */
  function walk(entries) {
    const seen = new Map();
    const queue = entries.map((file) => join(ROOT, file));
    while (queue.length > 0) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      const specifiers = specifiersOf(readFileSync(file, 'utf8'));
      seen.set(file, specifiers);
      for (const specifier of specifiers) {
        if (specifier.startsWith('.')) queue.push(join(dirname(file), specifier));
      }
    }
    return seen;
  }

  /** 지정자가 서버 전용이거나, 상대 경로를 풀어 보니 서버 전용 폴더 안이면 위반이다 */
  function violationsOf(file, specifiers) {
    return specifiers.filter((specifier) => {
      if (FORBIDDEN.test(specifier)) return true;
      return specifier.startsWith('.') && FORBIDDEN.test(join(dirname(file), specifier).slice(ROOT.length + 1));
    });
  }

  test('클라이언트 요청 모듈은 불러오는 모듈을 끝까지 따라가도 서버 전용 모듈을 불러오지 않는다', () => {
    const graph = walk(ENTRIES);
    // 시작 파일과 그 아래 공용 규칙 모듈까지 따라갔다
    for (const file of [...ENTRIES, 'src/guardian/crypto.js', 'src/stay/index.js', 'src/domain/states.js']) {
      assert.ok(graph.has(join(ROOT, file)), file);
    }
    for (const [file, specifiers] of graph) {
      const name = file.slice(ROOT.length + 1);
      if (ENTRIES.includes(name)) assert.ok(specifiers.length > 0, name);
      assert.deepEqual(violationsOf(file, specifiers), [], name);
    }
  });

  test('기기 저장소는 불러오는 모듈을 끝까지 따라가도 lib/trip 에 닿지 않는다', () => {
    const reached = [...walk(STORE_ENTRIES).keys()].map((file) => file.slice(ROOT.length + 1));
    // 저장소가 서버 삭제 대기에 쓰는 요청 모듈까지 따라갔다
    for (const file of [...STORE_ENTRIES, 'src/guardian/watchSend.js', 'src/guardian/watchRequests.js']) {
      assert.ok(reached.includes(file), file);
    }
    assert.deepEqual(reached.filter((file) => file.startsWith('lib/trip/')), []);
    // 반대 방향(lib/trip 이 lib/store 를 부름)은 된다: 검사가 실제로 경로를 풀어 보는지 확인한다
    assert.ok([...walk(['lib/trip/watchPlan.js']).keys()].some((file) => file.slice(ROOT.length + 1).startsWith('lib/store/')));
  });

  test('경계 검사는 여러 줄·부수 효과·동적 import 와 상대 경로로 숨은 서버 전용 모듈을 찾아낸다', () => {
    const sample = [
      "import { a } from '../../lib/server/watch/keys.js';",
      'import {\n  b,\n  c,\n} from "node:crypto";',
      "import '@/src/push/send.js';",
      "export { d } from '../auth/session.js';",
      "const e = await import('../push/vapid.js');",
      "import { f } from './watchRequests.js';",
    ].join('\n');
    const file = join(ROOT, 'src/guardian/sample.js');
    const found = specifiersOf(sample);
    assert.equal(found.length, 6, JSON.stringify(found));
    assert.deepEqual(violationsOf(file, found).sort(), ['../../lib/server/watch/keys.js', '../auth/session.js', '../push/vapid.js', '@/src/push/send.js', 'node:crypto'].sort());
  });

  test('요청 모듈에는 console 출력이 없다', () => {
    for (const file of ENTRIES) {
      assert.ok(!/console\./.test(readFileSync(join(ROOT, file), 'utf8')), `${file}: console 출력이 없어야 한다`);
    }
  });
});
