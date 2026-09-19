// AX-105 · AX-308 — 운영 kill switch (D06-E014, D07-POL006, D09-RG007 · spec 4.21 · 규칙 34)
//
// 계약:
//   - 켜지면 판정도 외부 호출도 하지 않고 즉시 미추천으로 응답한다.
//     일정 생성·재계획·교체 후보 조회는 요청 날짜 전부를 정거장 없이 NO_TOURISM + SERVICE_PAUSED 로 돌려준다.
//   - 오류가 아니라 정상 결과(NO_TOURISM)로 표시된다. 사용자는 이유를 안다.
//   - 스위치는 더 안전한 쪽으로만 움직인다 — 추천을 켜는 경로는 없다.
//   - 헬스 엔드포인트는 키 값을 노출하지 않는다.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isRecommendationKilled,
  killSwitchDecision,
  runtimeFlagsSnapshot,
} from '../lib/server/runtime-flags.js';
import { GET as healthGet } from '../app/api/health/route.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { AIRPORT_TRAVEL } from './day-plan-fixtures.js';
import { SESSION_SECRET, at, body, planStay, postJson, tripPool } from './itinerary-fixtures.js';

// 일정 라우트가 불러오는 관광 모듈이 임시 데이터 루트를 쓰게 한다(실제 호출·카운터 없음)
process.env.SAFEHOUR_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-kill-switch-'));
const ORIGINAL_FETCH = globalThis.fetch;

const ORIGINAL = process.env.SAFEHOUR_KILL_RECOMMENDATION;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SAFEHOUR_KILL_RECOMMENDATION;
  else process.env.SAFEHOUR_KILL_RECOMMENDATION = ORIGINAL;
});

beforeEach(() => {
  delete process.env.SAFEHOUR_KILL_RECOMMENDATION;
});

describe('스위치 해석', () => {
  test('설정하지 않으면 꺼진 상태다', () => {
    assert.equal(isRecommendationKilled(), false);
  });

  test('1 · true · on 은 켜짐으로 읽는다', () => {
    for (const value of ['1', 'true', 'TRUE', 'on', ' on ']) {
      process.env.SAFEHOUR_KILL_RECOMMENDATION = value;
      assert.equal(isRecommendationKilled(), true, `"${value}" 를 켜짐으로 읽지 못했다`);
    }
  });

  test('문자열 false·0·빈 값은 꺼짐으로 읽는다', () => {
    // 'false' 를 truthy 로 읽어 서비스를 멈추는 사고를 막는다
    for (const value of ['false', '0', '', 'no', 'off']) {
      process.env.SAFEHOUR_KILL_RECOMMENDATION = value;
      assert.equal(isRecommendationKilled(), false, `"${value}" 를 꺼짐으로 읽지 못했다`);
    }
  });
});

describe('중단 판정', () => {
  test('미추천 상태이며 코스가 비어 있다', () => {
    const decision = killSwitchDecision();
    assert.equal(decision.state, 'NO_TOURISM');
    assert.deepEqual(decision.course, []);
    assert.deepEqual(decision.patientCourse, []);
    assert.deepEqual(decision.companionCourse, []);
  });

  test('사용자가 이유를 알 수 있도록 reason 을 남긴다', () => {
    assert.ok(killSwitchDecision().reasons.includes('SERVICE_PAUSED'));
  });

  test('감사 로그에 중단 사실이 기록된다', () => {
    const step = killSwitchDecision().decisions[0];
    assert.equal(step.step, 'killSwitch');
    assert.equal(step.result, 'blocked');
  });

  test('즉시 복귀를 임의로 발동하지 않는다', () => {
    // 서비스 점검은 환자 호출이 아니다. 복귀를 강요할 근거가 없다.
    assert.equal(killSwitchDecision().returnNow, false);
  });
});

describe('일정 API 차단 (규칙 34)', () => {
  // 실제 라우트를 부른다 — 로그인 가드 → 요청 정규화 → 스위치. 외부 호출이 한 건도 없어야 한다.
  let calls;
  beforeEach(() => {
    process.env.SAFEHOUR_SESSION_SECRET = SESSION_SECRET;
    calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      throw new Error('테스트에서 실제 네트워크 호출 금지');
    };
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('스위치가 켜지면 일정 생성은 요청 날짜 전부 정거장 0개·NO_TOURISM·SERVICE_PAUSED 다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const { POST } = await import('../app/api/itinerary/plan/route.js');
    const res = await POST(postJson('/api/itinerary/plan', { lang: 'en', stay: planStay() }));
    assert.equal(res.status, 200);
    const data = await body(res);
    assert.equal(data.ok, true);
    assert.equal(data.servicePaused, true);
    assert.equal(Object.keys(data.days).length, 10);
    for (const day of Object.values(data.days)) {
      assert.equal(day.dayState, 'NO_TOURISM');
      assert.deepEqual(day.reasons, ['SERVICE_PAUSED']);
      assert.deepEqual(day.outings, []);
      assert.deepEqual(day.guardianOutings, []);
      assert.ok(day.mealSlots.every((m) => m.status !== 'FILLED'));
    }
    assert.equal(data.diagnostics.candidateCount, 0);
    assert.equal(calls.length, 0, '중단 중에 외부 호출이 있었다');
  });

  test('dates 로 고른 날짜만, 체류 밖 날짜는 빼고 돌려준다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = 'true';
    const { POST } = await import('../app/api/itinerary/plan/route.js');
    const data = await body(
      await POST(postJson('/api/itinerary/plan', { lang: 'en', stay: planStay(), dates: ['2026-10-03', '2026-12-01'] })),
    );
    assert.deepEqual(Object.keys(data.days), ['2026-10-03']);
  });

  test('저장된 일정이 있으면 빠진 정거장을 전후 비교로 알린다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const trip = planTrip({
      stay: planStay(),
      candidatesByLodging: { L1: tripPool('en', 60) },
      airportTravel: AIRPORT_TRAVEL,
      now: at('2026-09-30', '10:00'),
    });
    const date = Object.keys(trip.days).find((d) => trip.days[d].outings.length > 0);
    const { POST } = await import('../app/api/itinerary/plan/route.js');
    const data = await body(
      await POST(postJson('/api/itinerary/plan', { lang: 'en', stay: planStay(), dates: [date], previous: { [date]: trip.days[date] } })),
    );
    const day = data.days[date];
    assert.deepEqual(day.outings, []);
    assert.equal(day.delta.hasVisibleChange, true);
    assert.ok(day.delta.reasons.includes('SERVICE_PAUSED'));
  });

  test('교체 후보도 빈 목록과 그날 SERVICE_PAUSED 일정을 돌려준다', async () => {
    const trip = planTrip({
      stay: planStay(),
      candidatesByLodging: { L1: tripPool('en', 60) },
      airportTravel: AIRPORT_TRAVEL,
      now: at('2026-09-30', '10:00'),
    });
    const day = Object.values(trip.days).find((d) => d.outings.length > 0);
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const { POST } = await import('../app/api/itinerary/alternatives/route.js');
    const res = await POST(
      postJson('/api/itinerary/alternatives', {
        lang: 'en',
        stay: planStay(),
        date: day.date,
        outingId: day.outings[0].id,
        stopId: day.outings[0].stops[0].id,
        day,
      }),
    );
    assert.equal(res.status, 200);
    const data = await body(res);
    assert.deepEqual(data.alternatives, []);
    assert.equal(data.servicePaused, true);
    assert.deepEqual(Object.keys(data.days), [day.date]);
    assert.equal(data.days[day.date].dayState, 'NO_TOURISM');
    assert.deepEqual(data.days[day.date].reasons, ['SERVICE_PAUSED']);
    assert.equal(calls.length, 0);
  });

  test('중단 중에도 로그인 가드와 입력 검증은 그대로다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const { POST } = await import('../app/api/itinerary/plan/route.js');
    const noSession = await POST(postJson('/api/itinerary/plan', { lang: 'en', stay: planStay() }, { cookie: false }));
    assert.equal(noSession.status, 401);
    const bad = await POST(postJson('/api/itinerary/plan', { lang: 'en', stay: { ...planStay(), lodgings: [] } }));
    assert.equal(bad.status, 400);
    assert.equal((await body(bad)).errorCode, 'SAFEHOUR_STAY_INVALID');
  });
});

describe('헬스 엔드포인트 (RG007)', () => {
  test('스위치 상태를 노출한다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';
    const data = await (await healthGet()).json();
    assert.equal(data.ok, true);
    assert.equal(data.flags.recommendationKilled, true);
  });

  test('키 값을 노출하지 않고 설정 여부만 알린다', async () => {
    process.env.TOUR_API_KEY = 'super-secret-key-value';
    const res = await healthGet();
    const raw = await res.text();

    assert.equal(raw.includes('super-secret-key-value'), false, '인증키가 응답에 노출됐다');
    assert.equal(JSON.parse(raw).config.tourApiKeyConfigured, true);
  });

  test('스냅샷은 스위치 상태만 담는다', () => {
    assert.deepEqual(Object.keys(runtimeFlagsSnapshot()), ['recommendationKilled']);
  });
});
