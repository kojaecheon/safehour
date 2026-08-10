// AX-008 — 판정 결과 운영 로그 (ADR-0002 선택지 B, D07 4절 감사 증적)
//
// 계약:
//   - 판정·kill switch·실패 세 경로 모두 로그 한 줄을 남긴다
//   - 로그에 나가는 사유 코드는 닫힌 enum(REASON)을 통과한 값뿐이다
//   - 개인정보를 잔뜩 담은 요청을 넣어도 그 값이 로그에 하나도 나타나지 않는다
//   - 로그가 실패해도 판정 응답은 정상이다
//
// 마지막 항목이 이 파일의 핵심이다. 필드를 늘릴 때 이 테스트가 먼저 막는다.

import { describe, test, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-decision-log-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let recommendPost;
let recalculatePost;
let buildDecisionLogEntry;
let conditionAgeBucket;
let OUTCOME;
let logDecision;
let REASON;
let TOUR_API_PATHS;

const ORIGINAL_KILL = process.env.SAFEHOUR_KILL_RECOMMENDATION;
const originalFetch = globalThis.fetch;
const originalWrite = process.stdout.write;

before(async () => {
  // env 설정 후에 모듈을 읽어야 임시 데이터 루트가 반영된다
  ({ POST: recommendPost } = await import('../app/api/recommend/route.js'));
  ({ POST: recalculatePost } = await import('../app/api/recalculate/route.js'));
  ({ buildDecisionLogEntry, conditionAgeBucket, OUTCOME, logDecision } = await import(
    '../lib/server/decision-log.js'
  ));
  ({ REASON } = await import('../src/domain/states.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalWrite;
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.SAFEHOUR_KILL_RECOMMENDATION;
  // 추천 경로는 캐시를 쓰므로(운영과 동일), 비우지 않으면 앞 테스트가 채운 캐시가
  // 다음 테스트의 외부 호출을 대신해 실패 경로를 탈 수 없다
  for (const dir of [TOUR_API_PATHS.logs, TOUR_API_PATHS.cache]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
});

afterEach(() => {
  process.stdout.write = originalWrite;
  globalThis.fetch = originalFetch;
  if (ORIGINAL_KILL === undefined) delete process.env.SAFEHOUR_KILL_RECOMMENDATION;
  else process.env.SAFEHOUR_KILL_RECOMMENDATION = ORIGINAL_KILL;
});

/** stdout 을 가로채 판정 로그 줄만 모은다 */
function captureDecisionLogs() {
  const lines = [];
  process.stdout.write = (chunk, ...rest) => {
    const text = typeof chunk === 'string' ? chunk : String(chunk);
    if (text.includes('"evt":"decision"')) {
      for (const line of text.split('\n')) {
        if (line.trim()) lines.push(line.trim());
      }
      return true;
    }
    return originalWrite.call(process.stdout, chunk, ...rest);
  };
  return lines;
}

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ── 개인정보를 최대한 담은 요청 ──────────────────────────────────────────
// 아래 값들이 로그에 단 하나도 나타나지 않아야 한다. 실제 서비스는 이름·연락처를
// 받지 않지만, "받게 되더라도 로그로 새지 않는다"를 고정하려고 일부러 섞는다.
const PII_MARKERS = [
  '37.4979', // 좌표 (강남역)
  '127.0276',
  '홍길동', // 이름
  '010-1234-5678', // 연락처
  'M1234567', // 여권번호
  '쌍꺼풀 절개', // 시술명
  '눈 주위가 붓고 열감이 있음', // 증상 원문
  'test-service-key', // 인증키
  '강남 스타 성형외과', // 병원명
];

function piiLadenBody(overrides = {}) {
  const issuedAt = new Date(Date.now() - 30 * 60_000).toISOString();
  return {
    origin: { kind: 'USER_SELECTED_FIXED', lat: 37.4979, lng: 127.0276 },
    returnBy: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    roles: { hasCompanion: true, companionSeparateAllowed: true, patientResting: false },
    condition: {
      version: 'v1',
      issuedAt,
      outingAllowed: true,
      fasting: false,
      indoorOnly: false,
      escortRequired: false,
      maxWalkMinutes: 20,
      maxTravelMinutes: 20,
      // 스키마에 없는 값이지만, 클라이언트가 실수로 붙여 보낼 수 있다
      patientName: '홍길동',
      patientPhone: '010-1234-5678',
      passportNo: 'M1234567',
      procedure: '쌍꺼풀 절개',
      symptomNote: '눈 주위가 붓고 열감이 있음',
      hospitalName: '강남 스타 성형외과',
    },
    ...overrides,
  };
}

/** 외부 호출 없이 후보 조회가 성공하도록 TourAPI 응답을 흉내낸다 */
function stubTourApi() {
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('getUltraSrtNcst')) {
      return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [] } } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { totalCount: 0, items: '' },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
}

describe('로그 조립 — allowlist (ADR-0002)', () => {
  test('엔진이 반환한 알 수 없는 필드는 로그에 실리지 않는다', () => {
    const entry = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.DECIDED,
      decision: {
        state: 'TOGETHER',
        reasons: [REASON.FASTING_REQUIRED],
        course: [{ id: 'c1', title: '국립중앙박물관' }],
        excluded: [{ id: 'c2', title: '한강공원', reasons: [REASON.CLOSED] }],
        // 엔진이 나중에 이런 것을 반환해도 로그가 따라 커지면 안 된다
        debugOrigin: { lat: 37.4979, lng: 127.0276 },
        rawCondition: { patientName: '홍길동' },
      },
    });

    const serialized = JSON.stringify(entry);
    assert.equal(serialized.includes('홍길동'), false, '엔진의 새 필드가 로그로 샜다');
    assert.equal(serialized.includes('37.4979'), false, '좌표가 로그로 샜다');
    assert.equal(serialized.includes('국립중앙박물관'), false, '추천 장소 이름이 로그로 샜다');
    assert.equal(serialized.includes('한강공원'), false, '제외 장소 이름이 로그로 샜다');
    assert.equal(entry.courseCount, 1);
    assert.equal(entry.excludedCount, 1);
    assert.deepEqual(entry.excludedReasons, [REASON.CLOSED]);
  });

  test('닫힌 enum 밖의 사유 코드는 버린다', () => {
    const entry = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.DECIDED,
      decision: {
        state: 'NO_TOURISM',
        reasons: [REASON.OUTING_FORBIDDEN, '환자 이름 홍길동 때문에 제외', 42, null],
        course: [],
        excluded: [],
      },
    });

    assert.deepEqual(entry.reasons, [REASON.OUTING_FORBIDDEN], '자유 문자열이 로그에 남았다');
  });

  test('제외 사유는 중복 없이 정렬되어 모인다', () => {
    const entry = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.DECIDED,
      decision: {
        state: 'STANDBY',
        reasons: [],
        course: [],
        excluded: [
          { id: 'a', reasons: [REASON.CLOSED, REASON.SLA_INSUFFICIENT] },
          { id: 'b', reasons: [REASON.CLOSED] },
        ],
      },
    });

    assert.deepEqual(entry.excludedReasons, [REASON.CLOSED, REASON.SLA_INSUFFICIENT]);
  });

  test('우리 오류코드만 남고 외부 오류 원문은 남지 않는다', () => {
    const withOurs = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.FAILED,
      errorCode: 'SAFEHOUR_EXTERNAL_API',
    });
    assert.equal(withOurs.errorCode, 'SAFEHOUR_EXTERNAL_API');

    const withForeign = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.FAILED,
      errorCode: 'fetch failed https://apis.data.go.kr/...?serviceKey=test-service-key',
    });
    assert.equal('errorCode' in withForeign, false, '외부 오류 원문이 로그에 남았다');
  });

  test('알 수 없는 트리거는 UNKNOWN 으로 접힌다', () => {
    const entry = buildDecisionLogEntry({
      route: 'recalculate',
      outcome: OUTCOME.DECIDED,
      trigger: '홍길동이 취소함',
    });
    assert.equal(entry.trigger, 'UNKNOWN');
  });

  test('판정 규칙 버전이 항상 붙는다', () => {
    const entry = buildDecisionLogEntry({ route: 'recommend', outcome: OUTCOME.DECIDED });
    assert.match(entry.engine, /^\d+\.\d+\.\d+$/);
  });
});

describe('조건 신선도 — 발행시각 원값을 남기지 않는다', () => {
  const now = new Date('2026-08-11T12:00:00Z');

  test('경과 시간에 따라 구간으로 접힌다', () => {
    const cases = [
      ['2026-08-11T11:30:00Z', 'FRESH'],
      ['2026-08-11T08:00:00Z', 'RECENT'],
      ['2026-08-11T00:00:00Z', 'AGING'],
      ['2026-08-09T12:00:00Z', 'STALE'],
      ['2026-08-11T13:00:00Z', 'FUTURE'],
    ];
    for (const [issuedAt, expected] of cases) {
      assert.equal(conditionAgeBucket(issuedAt, now), expected, `${issuedAt} 구간이 어긋난다`);
    }
  });

  test('잘못된 시각은 UNKNOWN 이며 예외를 던지지 않는다', () => {
    assert.equal(conditionAgeBucket(undefined, now), 'UNKNOWN');
    assert.equal(conditionAgeBucket('어제쯤', now), 'UNKNOWN');
    assert.equal(conditionAgeBucket(null, now), 'UNKNOWN');
  });

  test('로그에 issuedAt 원값이 들어가지 않는다', () => {
    const issuedAt = '2026-08-11T11:30:00Z';
    const entry = buildDecisionLogEntry({
      route: 'recommend',
      outcome: OUTCOME.DECIDED,
      conditionIssuedAt: issuedAt,
      now,
    });
    assert.equal(JSON.stringify(entry).includes('11:30'), false, '발행시각 원값이 로그에 남았다');
    assert.equal(entry.conditionAge, 'FRESH');
  });
});

describe('라우트 통합 — 개인정보 0건 (D07-POL008)', () => {
  test('추천 요청의 개인정보가 로그에 하나도 나타나지 않는다', async () => {
    stubTourApi();
    const lines = captureDecisionLogs();

    const res = await recommendPost(jsonRequest('http://test/api/recommend', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1, '판정 로그가 정확히 한 줄이 아니다');

    const logged = lines[0];
    for (const marker of PII_MARKERS) {
      assert.equal(logged.includes(marker), false, `개인정보가 로그로 샜다: ${marker}`);
    }

    const entry = JSON.parse(logged);
    assert.equal(entry.evt, 'decision');
    assert.equal(entry.route, 'recommend');
    assert.equal(entry.outcome, 'DECIDED');
    assert.equal(entry.conditionAge, 'FRESH');
    assert.equal(typeof entry.state, 'string');
    assert.equal(Number.isFinite(entry.ms), true);
    assert.equal('session' in entry, false, 'session 식별자가 로그에 있다');
    assert.equal('origin' in entry, false, '기준점이 로그에 있다');
  });

  test('재계산 요청도 개인정보를 남기지 않고 변화량만 남긴다', async () => {
    stubTourApi();
    const recRes = await recommendPost(jsonRequest('http://test/api/recommend', piiLadenBody()));
    const { recalcPayload } = await recRes.json();

    const lines = captureDecisionLogs();
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload,
        event: { type: 'CLOSURE', closedIds: ['c1'] },
      }),
    );
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1);

    const logged = lines[0];
    for (const marker of PII_MARKERS) {
      assert.equal(logged.includes(marker), false, `개인정보가 재계산 로그로 샜다: ${marker}`);
    }

    const entry = JSON.parse(logged);
    assert.equal(entry.route, 'recalculate');
    assert.equal(entry.trigger, 'CLOSURE');
    assert.equal(typeof entry.visibleChange, 'boolean');
    assert.equal(Number.isFinite(entry.removedCount), true);
  });

  test('kill switch 로 중단된 요청도 감사 증적을 남긴다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const lines = captureDecisionLogs();

    const res = await recommendPost(jsonRequest('http://test/api/recommend', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1, 'kill switch 경로가 로그를 남기지 않았다');

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.outcome, 'PAUSED');
    assert.deepEqual(entry.reasons, [REASON.SERVICE_PAUSED]);
    for (const marker of PII_MARKERS) {
      assert.equal(lines[0].includes(marker), false, `개인정보가 kill switch 로그로 샜다: ${marker}`);
    }
  });

  test('외부 API 실패도 안전한 미추천으로 기록된다', async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch failed https://apis.data.go.kr/x?serviceKey=test-service-key');
    };
    const lines = captureDecisionLogs();

    const res = await recommendPost(jsonRequest('http://test/api/recommend', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 502);
    assert.equal(lines.length, 1);

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.outcome, 'FAILED');
    assert.equal(entry.errorCode, 'SAFEHOUR_EXTERNAL_API');
    assert.equal(lines[0].includes('serviceKey'), false, '인증키 파라미터가 로그로 샜다');
    assert.equal(lines[0].includes('test-service-key'), false, '인증키 값이 로그로 샜다');
  });

  test('입력 검증 실패는 판정 로그를 남기지 않는다', async () => {
    const lines = captureDecisionLogs();
    const res = await recommendPost(jsonRequest('http://test/api/recommend', { origin: null }));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 400);
    assert.equal(lines.length, 0, '판정하지 않은 요청이 판정 로그를 남겼다');
  });

  test('객체가 아닌 본문은 500 이 아니라 400 으로 막힌다', async () => {
    for (const raw of ['null', '"hello"', '42']) {
      const rec = await recommendPost(jsonRequest('http://test/api/recommend', raw));
      assert.equal(rec.status, 400, `추천: ${raw} 가 400 이 아니다`);
      assert.equal((await rec.json()).errorCode, 'SAFEHOUR_BAD_REQUEST');

      const recalc = await recalculatePost(jsonRequest('http://test/api/recalculate', raw));
      assert.equal(recalc.status, 400, `재계산: ${raw} 가 400 이 아니다`);
    }
  });
});

describe('로그 실패가 판정을 막지 않는다', () => {
  test('stdout 이 터져도 예외가 새어나오지 않는다', () => {
    process.stdout.write = () => {
      throw new Error('EPIPE');
    };
    assert.doesNotThrow(() =>
      logDecision({ route: 'recommend', outcome: OUTCOME.DECIDED, decision: { state: 'TOGETHER' } }),
    );
  });

  test('조립할 수 없는 입력이 와도 예외를 던지지 않는다', () => {
    assert.doesNotThrow(() => logDecision({}));
    assert.doesNotThrow(() => logDecision({ route: 'recommend', decision: 'not-an-object' }));
  });
});
