// AX-105 — 운영 kill switch (D06-E014, D07-POL006, D09-RG007)
//
// 계약:
//   - 켜지면 판정도 외부 호출도 하지 않고 즉시 미추천으로 응답한다.
//   - 오류가 아니라 정상 결과(NO_TOURISM)로 표시된다. 사용자는 이유를 안다.
//   - 스위치는 더 안전한 쪽으로만 움직인다 — 추천을 켜는 경로는 없다.
//   - 헬스 엔드포인트는 키 값을 노출하지 않는다.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRecommendationKilled,
  killSwitchDecision,
  runtimeFlagsSnapshot,
} from '../lib/server/runtime-flags.js';
import { POST as recalculatePost } from '../app/api/recalculate/route.js';
import { GET as healthGet } from '../app/api/health/route.js';

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

describe('재계산 API 차단', () => {
  function request(body) {
    return new Request('http://test/api/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const payload = {
    recalcPayload: {
      origin: { lat: 37.5105, lng: 127.059 },
      returnBy: new Date(Date.now() + 4 * 3600000).toISOString(),
      condition: { version: 'v1', issuedAt: new Date().toISOString(), outingAllowed: true },
      roles: { hasCompanion: true },
      candidates: [{ id: 'a', title: '후보', lat: 37.511, lng: 127.06, openNow: true }],
      ctx: {},
    },
    event: { type: 'WEATHER' },
  };

  test('스위치가 꺼져 있으면 평소대로 재판정한다', async () => {
    const res = await recalculatePost(request(payload));
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.servicePaused, undefined);
  });

  test('스위치가 켜지면 이벤트 종류와 무관하게 미추천으로 응답한다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = '1';

    for (const type of ['WEATHER', 'CLOSURE', 'PATIENT_RECALL']) {
      const res = await recalculatePost(
        request({ ...payload, event: { type, closedIds: ['a'] } }),
      );
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.servicePaused, true);
      assert.equal(data.recalc.result.state, 'NO_TOURISM');
      assert.deepEqual(data.recalc.result.course, []);
      // 다음 요청에도 후보를 실어 보내지 않는다
      assert.deepEqual(data.nextRecalcPayload.candidates, []);
    }
  });

  test('중단 상태에서도 변화가 있었음을 사용자에게 알린다', async () => {
    process.env.SAFEHOUR_KILL_RECOMMENDATION = 'true';
    const res = await recalculatePost(request(payload));
    const data = await res.json();
    // hasVisibleChange=false 면 화면이 갱신되지 않아 코스가 남는 것처럼 보인다
    assert.equal(data.recalc.delta.hasVisibleChange, true);
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
