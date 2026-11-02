// AX-308 — 판정 운영 로그 (ADR-0002 확장 · spec 4.21 · 규칙 35)
//
// 계약
//   - 일정 생성·재계획·교체 후보 조회 한 번마다 로그 한 줄
//   - 남기는 것: 엔진 버전, 요청 날짜 수, 상태별 날짜 수, 사유 코드 집합, 출처 종류별 개수(SELF/HOSPITAL/기본값), 언어
//     (+ 줄을 구분하는 evt·route·outcome, 실패 분류 코드, 처리 시간)
//   - 남기지 않는 것: 좌표, 날짜, 장소 이름, 주소, 조건 값, 계정 키, 병원 정보
//   - 사유 코드는 닫힌 enum 을 통과한 값뿐이다. 로그가 실패해도 응답은 정상이다
//
// 마지막 항목들이 이 파일의 핵심이다. 필드를 늘릴 때 이 테스트가 먼저 막는다.

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { OUTCOME, buildDecisionLogEntry, logDecision } from '../lib/server/decision-log.js';
import { createItineraryHandlers } from '../lib/server/itinerary-service.js';
import { REASON } from '../src/domain/states.js';
import { ITINERARY_ENGINE_VERSION } from '../src/engine/tripPlan.js';
import { SET } from './stay-fixtures.js';
import { at, body, fakeEnrich, fakeForecast, fakeLoader, period, planStay, postJson } from './itinerary-fixtures.js';

const originalWrite = process.stdout.write;
afterEach(() => {
  process.stdout.write = originalWrite;
});

/** stdout 을 가로채 판정 로그 줄만 모은다 */
function captureDecisionLogs() {
  const lines = [];
  process.stdout.write = (chunk, ...rest) => {
    const text = typeof chunk === 'string' ? chunk : String(chunk);
    if (text.includes('"evt":"decision"')) {
      for (const line of text.split('\n')) if (line.trim()) lines.push(line.trim());
      return true;
    }
    return originalWrite.call(process.stdout, chunk, ...rest);
  };
  return lines;
}

describe('로그 조립 — 허용 목록', () => {
  const days = {
    '2026-10-02': {
      date: '2026-10-02',
      dayState: 'TOGETHER',
      reasons: [REASON.WEATHER_BLOCKED, '홍길동 때문에'],
      effective: {
        outing: { value: 'ALLOWED', provenance: [{ periodId: 'P1', source: 'SELF', defaulted: false }] },
        walkLimit: { value: { kind: 'SET', value: 15 }, provenance: [{ periodId: 'P1', source: 'SELF', defaulted: true }] },
        avoidUv: { value: { kind: 'SET', value: true }, provenance: [{ periodId: 'H-9', source: 'HOSPITAL', defaulted: false }] },
      },
      outings: [{ stops: [{ title: '국립중앙박물관', address: '서울 용산구', lat: 37.5238, lng: 126.9804 }] }],
      lodgingId: 'L1',
    },
    '2026-10-03': { date: '2026-10-03', dayState: 'NO_TOURISM', reasons: [REASON.OUTING_FORBIDDEN], effective: {} },
    '2026-10-04': { date: '2026-10-04', dayState: 'STANDBY', reasons: [REASON.NO_CANDIDATE, REASON.WEATHER_BLOCKED] },
  };

  test('정해진 필드만 담는다', () => {
    const entry = buildDecisionLogEntry({
      route: 'itinerary.plan',
      outcome: OUTCOME.DECIDED,
      days,
      requestedDateCount: 3,
      lang: 'ja',
      elapsedMs: 12.4,
    });
    assert.deepEqual(entry, {
      evt: 'decision',
      route: 'itinerary.plan',
      outcome: 'DECIDED',
      engine: ITINERARY_ENGINE_VERSION,
      lang: 'ja',
      dateCount: 3,
      dayStates: { NO_TOURISM: 1, STANDBY: 1, SPLIT_NEARBY: 0, TOGETHER: 1 },
      reasons: [REASON.NO_CANDIDATE, REASON.OUTING_FORBIDDEN, REASON.WEATHER_BLOCKED],
      provenance: { SELF: 1, HOSPITAL: 1, DEFAULTED: 1 },
      ms: 12,
    });
  });

  test('날짜·장소·좌표·자유 문자열은 들어가지 않는다', () => {
    const text = JSON.stringify(buildDecisionLogEntry({ route: 'itinerary.plan', outcome: OUTCOME.DECIDED, days, requestedDateCount: 3, lang: 'en' }));
    for (const marker of ['2026-10-0', '국립중앙박물관', '서울 용산구', '37.5238', '126.9804', '홍길동', 'P1', 'H-9', 'L1']) {
      assert.equal(text.includes(marker), false, `${marker} 가 로그에 있다`);
    }
  });

  test('모르는 언어·경로·결과는 닫힌 값으로 접힌다', () => {
    const entry = buildDecisionLogEntry({ route: '/api/x?lat=37.1', outcome: 'WHATEVER', lang: '홍길동', requestedDateCount: -2 });
    assert.equal(entry.route, 'itinerary.plan');
    assert.equal(entry.outcome, 'DECIDED');
    assert.equal(entry.lang, 'unknown');
    assert.equal(entry.dateCount, 0);
  });

  test('우리 오류 코드만 남고 외부 오류 원문은 남지 않는다', () => {
    const ours = buildDecisionLogEntry({ route: 'itinerary.plan', outcome: OUTCOME.FAILED, errorCode: 'SAFEHOUR_EXTERNAL_API' });
    assert.equal(ours.errorCode, 'SAFEHOUR_EXTERNAL_API');
    const foreign = buildDecisionLogEntry({
      route: 'itinerary.plan',
      outcome: OUTCOME.FAILED,
      errorCode: 'fetch failed https://apis.data.go.kr/x?serviceKey=secret',
    });
    assert.equal('errorCode' in foreign, false);
  });

  test('일정 목록은 배열이어도 된다(교체 후보는 그날 하루)', () => {
    const entry = buildDecisionLogEntry({
      route: 'itinerary.alternatives',
      outcome: OUTCOME.DECIDED,
      days: [days['2026-10-02']],
      requestedDateCount: 1,
      lang: 'en',
    });
    assert.equal(entry.route, 'itinerary.alternatives');
    assert.deepEqual(entry.dayStates, { NO_TOURISM: 0, STANDBY: 0, SPLIT_NEARBY: 0, TOGETHER: 1 });
  });
});

describe('로그 실패가 응답을 막지 않는다', () => {
  test('stdout 이 터져도 예외가 새어나오지 않는다', () => {
    process.stdout.write = () => {
      throw new Error('EPIPE');
    };
    assert.doesNotThrow(() => logDecision({ route: 'itinerary.plan', outcome: OUTCOME.DECIDED, days: {} }));
  });

  test('조립할 수 없는 입력이 와도 예외를 던지지 않는다', () => {
    assert.doesNotThrow(() => logDecision({}));
    assert.doesNotThrow(() => logDecision({ days: 'not-an-object' }));
    assert.doesNotThrow(() => logDecision(null));
  });
});

// ── 라우트 통합: 개인정보를 잔뜩 담은 요청 (규칙 35) ───────────────────────────
const ACCOUNT_KEY = 'Zx9_accountKeyLike_0123456789abcdefghijklmnopq'; // 43자 base64url 모양
const MARKERS = {
  lodgingLat: '37.4979123',
  lodgingLng: '127.0276456',
  gpsLat: '37.1111111',
  lodgingName: '홍길동 게스트하우스',
  address: '서울특별시 강남구 가상대로 123',
  hospitalName: '가상 미래 성형외과',
  phone: '010-1234-5678',
  code: 'DEMO-LINK-XY',
  instruction: '붓기가 빠질 때까지 사우나 금지',
  walkValue: '187.25', // 조건 값(보행 한도) — 처리 시간(ms, 정수)과 겹치지 않는 값
  date: '2026-10-0', // 날짜 접두사
  accountKey: ACCOUNT_KEY,
};

function piiLadenBody() {
  const s = planStay({
    periods: [
      period({ walkLimit: SET(187.25), diet: { spicy: SET(true) } }, { startDate: '2026-10-04', endDate: '2026-10-10' }),
    ],
  });
  return {
    lang: 'ja',
    accountKey: ACCOUNT_KEY,
    currentLocation: { lat: Number(MARKERS.gpsLat), lng: 127.2 },
    now: '2026-10-02T10:00:00+09:00',
    stay: {
      ...s,
      accountKey: ACCOUNT_KEY,
      lodgings: s.lodgings.map((l) => ({
        ...l,
        lat: Number(MARKERS.lodgingLat),
        lng: Number(MARKERS.lodgingLng),
        name: MARKERS.lodgingName,
        address: { roadAddress: MARKERS.address, lat: Number(MARKERS.lodgingLat), lng: Number(MARKERS.lodgingLng), source: 'JUSO' },
      })),
      hospitals: s.hospitals.map((h) => ({ ...h, name: MARKERS.hospitalName, phone: MARKERS.phone })),
      linkedPlans: [{ code: MARKERS.code, plan: { instructions: [{ id: 'i', text: MARKERS.instruction }] } }],
    },
  };
}

function handlers(overrides = {}) {
  const loader = fakeLoader();
  const enrich = fakeEnrich();
  const forecast = fakeForecast((d) => d === '2026-10-03');
  return createItineraryHandlers({
    clock: () => new Date(at('2026-10-02', '08:00')),
    loadCandidates: loader.load,
    enrichIntros: enrich.enrich,
    fetchForecast: forecast.fetchForecast,
    env: { KMA_API_KEY: 'kma-secret-key' },
    killSwitch: () => false,
    ...overrides,
  });
}

function assertClean(line) {
  for (const [name, marker] of Object.entries(MARKERS)) {
    assert.equal(line.includes(marker), false, `${name}(${marker}) 가 로그로 샜다: ${line}`);
  }
  assert.equal(line.includes('kma-secret-key'), false);
}

describe('라우트 통합 — 개인정보 0건 (규칙 35)', () => {
  test('일정 생성 요청의 좌표·날짜·이름·주소·조건 값·계정 키가 로그에 없다', async () => {
    const lines = captureDecisionLogs();
    const res = await handlers().plan(postJson('/api/itinerary/plan', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1, '판정 로그가 정확히 한 줄이 아니다');
    assertClean(lines[0]);
    const entry = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(entry).sort(), ['dateCount', 'dayStates', 'engine', 'evt', 'lang', 'ms', 'outcome', 'provenance', 'reasons', 'route']);
    assert.equal(entry.route, 'itinerary.plan');
    assert.equal(entry.outcome, 'DECIDED');
    assert.equal(entry.lang, 'ja');
    assert.equal(entry.dateCount, 10);
    assert.equal(Object.values(entry.dayStates).reduce((a, b) => a + b, 0), 10);
    assert.ok(entry.provenance.SELF > 0);
    assert.ok(entry.reasons.every((r) => Object.values(REASON).includes(r)));
  });

  test('교체 후보 요청도 한 줄이고 개인정보가 없다', async () => {
    const h = handlers();
    const planned = await body(await h.plan(postJson('/api/itinerary/plan', piiLadenBody())));
    const day = Object.values(planned.days).find((d) => d.date >= '2026-10-03' && d.outings.length > 0);
    const outing = day.outings[0];

    const lines = captureDecisionLogs();
    const res = await h.alternatives(
      postJson('/api/itinerary/alternatives', {
        ...piiLadenBody(),
        date: day.date,
        outingId: outing.id,
        stopId: outing.stops.at(-1).id,
        day,
      }),
    );
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1);
    assertClean(lines[0]);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.route, 'itinerary.alternatives');
    assert.equal(entry.dateCount, 1);
  });

  test('중단 스위치로 멈춘 요청도 감사 증적을 남긴다', async () => {
    const lines = captureDecisionLogs();
    const res = await handlers({ killSwitch: () => true }).plan(postJson('/api/itinerary/plan', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 200);
    assert.equal(lines.length, 1);
    assertClean(lines[0]);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.outcome, 'PAUSED');
    assert.deepEqual(entry.reasons, [REASON.SERVICE_PAUSED]);
    assert.equal(entry.dayStates.NO_TOURISM, 10);
  });

  test('외부 API 실패도 한 줄이고 오류 원문·키가 없다', async () => {
    const lines = captureDecisionLogs();
    const res = await handlers({
      loadCandidates: async () => {
        throw new Error('fetch failed https://apis.data.go.kr/x?serviceKey=kma-secret-key&mapX=127.0276456');
      },
    }).plan(postJson('/api/itinerary/plan', piiLadenBody()));
    process.stdout.write = originalWrite;

    assert.equal(res.status, 502);
    assert.equal(lines.length, 1);
    assertClean(lines[0]);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.outcome, 'FAILED');
    assert.equal(entry.errorCode, 'SAFEHOUR_EXTERNAL_API');
  });

  test('입력 검증 실패는 판정 로그를 남기지 않는다', async () => {
    const lines = captureDecisionLogs();
    const res = await handlers().plan(postJson('/api/itinerary/plan', { lang: 'en', stay: null }));
    process.stdout.write = originalWrite;
    assert.equal(res.status, 400);
    assert.equal(lines.length, 0);
  });
});
