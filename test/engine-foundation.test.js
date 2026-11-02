// AX-306 — 하루 일정 엔진의 기반: 대중교통 추정기, 외출 단위 복귀 계산, 후보 게이트 확장
//
// 판정 경로를 새로 만들지 않고 기존 함수(복귀 계산·gateCandidate·추정기)를 넓힌 것을 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createFallbackEstimator, createTransitEstimator } from '../src/adapters/travelTime.js';
import { REASON } from '../src/domain/states.js';
import { gateCandidate } from '../src/engine/safetyGate.js';
import { BUFFER, checkOutingSla, haversineKm } from '../src/engine/slaCalculator.js';
import { DEFAULTS } from '../src/stay/defaults.js';

const LODGING = { lat: 37.5, lng: 127.03 };
/** 위도 방향으로 km 만큼 떨어진 점 */
const north = (km) => ({ lat: LODGING.lat + km / 111.2, lng: LODGING.lng });

describe('대중교통 추정기 (spec 4.7 이동수단, 11장)', () => {
  const transit = createTransitEstimator();

  test('직선거리 × 1.3 ÷ 20km/h + 대기·환승 10분, 올림', () => {
    const to = north(5);
    const straight = haversineKm(LODGING, to);
    const expected = Math.ceil(((straight * 1.3) / 20) * 60) + 10;
    const r = transit.estimate(LODGING, to);
    assert.equal(r.mode, 'transit');
    assert.equal(r.min, expected);
    assert.equal(r.source, 'fallback');
  });

  test('값은 DEFAULTS.transitEstimate 한곳에서 온다', () => {
    const { detourFactor, speedKmh, waitTransferMin } = DEFAULTS.transitEstimate;
    assert.deepEqual([detourFactor, speedKmh, waitTransferMin], [1.3, 20, 10]);
  });

  test('짧은 거리는 기존 추정기처럼 도보다', () => {
    const to = north(0.5);
    const r = transit.estimate(LODGING, to);
    assert.equal(r.mode, 'walk');
    assert.equal(r.min, createFallbackEstimator().estimate(LODGING, to).min);
  });

  test('같은 입력이면 같은 값 (결정적)', () => {
    const to = north(3.3);
    assert.deepEqual(transit.estimate(LODGING, to), transit.estimate(LODGING, to));
  });

  test('도보 추정기는 외부 API 없이 동작한다', () => {
    const r = createFallbackEstimator().estimate(LODGING, north(1.2));
    assert.ok(r.min > 0);
    assert.equal(r.source, 'fallback');
  });
});

describe('복귀 버퍼는 DEFAULTS 한곳에서 온다', () => {
  test('BUFFER 는 DEFAULTS.buffers 와 같은 값이다', () => {
    assert.equal(BUFFER.hailingMin, DEFAULTS.buffers.hailingMin);
    assert.equal(BUFFER.trafficVariancePct, DEFAULTS.buffers.trafficVariancePct);
    assert.equal(BUFFER.hospitalArrivalMin, DEFAULTS.buffers.arrivalMarginMin);
    assert.equal(BUFFER.patientExtraMin, DEFAULTS.buffers.recoveryExtraMin);
  });
});

describe('외출 단위 복귀 계산 (spec 4.7 복귀 계산식)', () => {
  test('출발 + 호출 5 + Σ이동 + Σ체류 + 25%×Σ이동 + 도착 여유 10 (+회복기 10) ≤ 마감', () => {
    const r = checkOutingSla({
      departMin: 600,
      deadlineMin: 800,
      legsMin: [10, 7, 12],
      staysMin: [45, 30],
      recoveryBuffer: true,
    });
    const travel = 29;
    const required = 5 + travel + 75 + Math.ceil(travel * 0.25) + 10 + 10;
    assert.equal(r.requiredMin, required);
    assert.equal(r.slackMin, 200 - required);
    assert.equal(r.ok, true);
    assert.equal(r.latestDepartMin, 800 - required);
  });

  test('회복기 가산은 요청할 때만 더한다', () => {
    const base = { departMin: 600, deadlineMin: 700, legsMin: [10, 10], staysMin: [30] };
    const withRecovery = checkOutingSla({ ...base, recoveryBuffer: true });
    const without = checkOutingSla({ ...base, recoveryBuffer: false });
    assert.equal(withRecovery.requiredMin - without.requiredMin, DEFAULTS.buffers.recoveryExtraMin);
  });

  test('추가 버퍼(교통 급증)를 더할 수 있다', () => {
    const base = { departMin: 600, deadlineMin: 700, legsMin: [10, 10], staysMin: [30] };
    assert.equal(
      checkOutingSla({ ...base, extraBufferMin: 20 }).requiredMin - checkOutingSla(base).requiredMin,
      20,
    );
  });

  test('시간이 부족하면 실패로 판정한다 (여유가 음수)', () => {
    // 필요 5 + 30 + 30 + 8 + 10 + 10 = 93분 > 가진 30분
    const r = checkOutingSla({ departMin: 780, deadlineMin: 810, legsMin: [15, 15], staysMin: [30], recoveryBuffer: true });
    assert.equal(r.ok, false);
    assert.ok(r.slackMin < 0);
    assert.ok(r.latestDepartMin < 780, '늦어도 출발해야 하는 시각이 이미 지났다');
  });
});

function gateInput(overrides = {}) {
  return {
    id: 'x',
    title: 'x',
    lat: 37.51,
    lng: 127.03,
    indoor: true,
    hasFood: false,
    uvExposed: false,
    walkMin: 10,
    congestion: null,
    openNow: null,
    dataFresh: true,
    tourismEligible: true,
    ...overrides,
  };
}

describe('후보 게이트 확장 (spec 4.8)', () => {
  test('열 노출 단서 + avoidHeat → HEAT_EXPOSURE, 아니면 통과', () => {
    const c = gateInput({ heatExposure: true });
    assert.deepEqual(gateCandidate(c, { avoidHeat: true }).reasons, [REASON.HEAT_EXPOSURE]);
    assert.equal(gateCandidate(c, { avoidHeat: false }).pass, true);
  });

  test('물 활동 단서 + avoidWater → WATER_ACTIVITY', () => {
    const c = gateInput({ waterActivity: true });
    assert.deepEqual(gateCandidate(c, { avoidWater: true }).reasons, [REASON.WATER_ACTIVITY]);
    assert.equal(gateCandidate(c, {}).pass, true);
  });

  test('의료 시설은 관광 활동이 아니다 → NON_TOURISM_ACTIVITY', () => {
    const r = gateCandidate(gateInput({ medical: true }), {});
    assert.deepEqual(r.reasons, [REASON.NON_TOURISM_ACTIVITY]);
  });

  describe('식이 필터 — 식당·카페에만', () => {
    const restaurant = (food) =>
      gateInput({ hasFood: true, food: { isFoodPlace: true, isCafe: false, isBar: false, spicy: false, raw: false, ...food } });
    const diet = (d) => ({ diet: { spicy: false, alcohol: false, hard: false, hot: false, raw: false, ...d } });

    test('술 → 주점 유형만 DIET_RESTRICTED', () => {
      assert.deepEqual(gateCandidate(restaurant({ isBar: true }), diet({ alcohol: true })).reasons, [
        REASON.DIET_RESTRICTED,
      ]);
      assert.equal(gateCandidate(restaurant({ isBar: false }), diet({ alcohol: true })).pass, true);
      assert.equal(gateCandidate(restaurant({ isBar: true }), diet({ alcohol: false })).pass, true);
    });

    test('매운 음식: 단서 있음 DIET_RESTRICTED · 근거 없음 MENU_UNKNOWN · 아님 통과', () => {
      assert.deepEqual(gateCandidate(restaurant({ spicy: true }), diet({ spicy: true })).reasons, [
        REASON.DIET_RESTRICTED,
      ]);
      assert.deepEqual(gateCandidate(restaurant({ spicy: null }), diet({ spicy: true })).reasons, [
        REASON.MENU_UNKNOWN,
      ]);
      assert.equal(gateCandidate(restaurant({ spicy: false }), diet({ spicy: true })).pass, true);
    });

    test('날음식도 같은 3상태다', () => {
      assert.deepEqual(gateCandidate(restaurant({ raw: true }), diet({ raw: true })).reasons, [
        REASON.DIET_RESTRICTED,
      ]);
      assert.deepEqual(gateCandidate(restaurant({ raw: null }), diet({ raw: true })).reasons, [
        REASON.MENU_UNKNOWN,
      ]);
    });

    test('카페 유형은 매운·날음식 아님으로 본다', () => {
      const cafe = restaurant({ isCafe: true, spicy: null, raw: null });
      assert.equal(gateCandidate(cafe, diet({ spicy: true, raw: true })).pass, true);
    });

    test('뜨거운·딱딱한 음식은 제외하지 않는다', () => {
      assert.equal(gateCandidate(restaurant({ spicy: null }), diet({ hot: true, hard: true })).pass, true);
    });

    test('식당이 아니면 식이 필터를 적용하지 않는다', () => {
      const museum = gateInput({ food: { isFoodPlace: false, spicy: null, raw: null } });
      assert.equal(gateCandidate(museum, diet({ spicy: true, raw: true, alcohol: true })).pass, true);
    });
  });

  test('기존 판정은 그대로다 (조건 필드가 없으면 새 게이트는 걸리지 않는다)', () => {
    const c = gateInput({ heatExposure: true, waterActivity: true });
    assert.equal(gateCandidate(c, {}).pass, true);
  });
});
