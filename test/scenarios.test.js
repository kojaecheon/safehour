// SafeHour 6개 필수 심사 시나리오 + 안전 규칙 테스트
// 실행: npm test   (Node 내장 test runner, 의존성 없음)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { recommend, applyEvent } from '../src/engine/recommend.js';
import { STATE, REASON } from '../src/domain/states.js';
import { createFallbackEstimator } from '../src/adapters/travelTime.js';
import { toGrid, summarize } from '../src/adapters/weather.js';
import { checkSla } from '../src/engine/slaCalculator.js';
import { makeCondition, makePlan, makeCandidates, ROLES } from './fixtures.js';

const travelTime = createFallbackEstimator();

function base(overrides = {}) {
  return {
    condition: makeCondition(),
    plan: makePlan(),
    roles: ROLES.withCompanion,
    candidates: makeCandidates(),
    travelTime,
    ctx: {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────
describe('시나리오 1 · 시술 전 금식', () => {
  test('금식 중이면 식음 후보가 제외된다', () => {
    const r = recommend(base({ condition: makeCondition({ fasting: true }) }));
    const cafeExcluded = r.excluded.find((e) => e.id === 'c-indoor-cafe');
    assert.ok(cafeExcluded, '카페가 제외되어야 함');
    assert.ok(cafeExcluded.reasons.includes(REASON.FASTING_REQUIRED));
    // 금식 시간 자체를 앱이 결정하지 않는다 → 다른 후보는 남을 수 있음
    assert.ok(r.course.length >= 0);
  });
});

describe('시나리오 2 · 수술 당일 외출 금지', () => {
  test('외출 금지면 NO_TOURISM 이고 후보가 0건이다', () => {
    const r = recommend(base({ condition: makeCondition({ outingAllowed: false }) }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.equal(r.course.length, 0);
    assert.ok(r.reasons.includes(REASON.OUTING_FORBIDDEN));
  });
});

describe('시나리오 3 · 공동 초단거리', () => {
  test('조건 충족 시 TOGETHER 이고 근거리 후보만 남는다', () => {
    const r = recommend(base());
    assert.equal(r.state, STATE.TOGETHER);
    assert.ok(r.course.length > 0, '후보가 있어야 함');
    // 먼 고궁은 이동허용·혼잡으로 제외
    assert.ok(!r.course.some((c) => c.id === 'c-far-palace'));
    // 자외선 회피 조건 → 야외 노출 후보 제외
    assert.ok(!r.course.some((c) => c.id === 'c-outdoor-park'));
  });

  test('추천 결과는 plan.maxResults 개수로 제한된다', () => {
    const r = recommend(base({
      condition: makeCondition({ avoidUv: false }),
      plan: makePlan({ maxResults: 2 }),
    }));
    assert.equal(r.course.length, 2);
    assert.ok(r.patientCourse.length <= 2);
    assert.ok(r.companionCourse.length <= 2);
  });

  test('실내 조건이 걸린 상태에서 실내여부 불명 후보는 보수적으로 제외된다', () => {
    // 실내 여부가 판정에 영향을 주는 조건일 때만 제외한다.
    // (uvExposed 가 명시된 후보는 실내여부를 몰라도 판정 가능하므로 제외하지 않음)
    const r = recommend(base({ condition: makeCondition({ indoorOnly: true }) }));
    const unknown = r.excluded.find((e) => e.id === 'c-unknown-indoor');
    assert.ok(unknown, '실내여부 불명은 제외 대상');
    assert.ok(unknown.reasons.includes(REASON.DATA_UNRELIABLE));
  });
});

describe('시나리오 4 · 보호자 근거리 (환자 휴식)', () => {
  test('환자가 휴식이면 SPLIT_NEARBY 로 전환된다', () => {
    const r = recommend(base({ roles: ROLES.companionOnly }));
    assert.equal(r.state, STATE.SPLIT_NEARBY);
    assert.ok(r.course.length > 0);
  });

  test('필수 동행이면 분리가 불가하다', () => {
    const r = recommend(base({
      condition: makeCondition({ escortRequired: true }),
      roles: ROLES.companionOnly,
    }));
    assert.notEqual(r.state, STATE.SPLIT_NEARBY);
  });

  test('필수 동행인데 보호자가 없으면 NO_TOURISM', () => {
    const r = recommend(base({
      condition: makeCondition({ escortRequired: true }),
      roles: ROLES.alone,
    }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.ok(r.reasons.includes(REASON.ESCORT_REQUIRED));
  });
});

describe('시나리오 5 · 실내 저부담', () => {
  test('실내만 허용이면 실외 후보가 전부 제외된다', () => {
    const r = recommend(base({ condition: makeCondition({ indoorOnly: true }) }));
    for (const c of r.course) assert.equal(c.indoor, true);
  });
});

// ─────────────────────────────────────────────
// 시나리오 6 · 실시간 변화로 축소·대체·취소  ← 과제1 증명의 핵심
// ─────────────────────────────────────────────
describe('시나리오 6 · 실시간 변수로 코스가 실제로 바뀐다', () => {
  test('기상 악화 → 실외 후보 제거 (알림만이 아니라 코스 변경)', () => {
    const input = base({ condition: makeCondition({ avoidUv: false }) });
    const before = recommend(input);
    const hadOutdoor = before.course.some((c) => c.indoor === false);

    const d = applyEvent(input, {
      type: 'WEATHER',
      weather: { outdoorUnsafe: true, reasons: ['강수확률 80%'] },
    });

    assert.ok(hadOutdoor, '변경 전에는 실외 후보가 있어야 함');
    assert.ok(d.delta.removed.length > 0, '실외 후보가 실제로 제거되어야 함');
    for (const c of d.result.course) assert.notEqual(c.indoor, false);
  });

  test('교통 급증 → 먼 후보 제거 또는 체류 축소', () => {
    // 복귀창을 타이트하게 두어야 교통 급증이 실제 영향을 준다 (13:00 → 14:30)
    const input = base({ plan: makePlan({ returnBy: new Date('2026-07-28T14:30:00+09:00') }) });
    const d = applyEvent(input, { type: 'TRAFFIC_SURGE', extraMin: 40 });
    assert.ok(d.delta.hasVisibleChange, '알림만이 아니라 실제 변화가 있어야 함');
    assert.ok(
      d.delta.removed.length > 0 || d.delta.shortened.length > 0 || d.delta.stateChanged,
      '축소·제거·상태변경 중 하나가 발생해야 함'
    );
  });

  test('진료 시간 30분 앞당겨짐 → 코스 축소 또는 상태 강등', () => {
    const input = base({ plan: makePlan({ returnBy: new Date('2026-07-28T14:30:00+09:00') }) });
    const d = applyEvent(input, { type: 'APPOINTMENT', deltaMin: -30 });
    assert.ok(d.after.reasons.includes(REASON.APPOINTMENT_DELAYED));
    assert.ok(d.delta.hasVisibleChange, '결과가 실제로 변해야 함');
    // 체류 축소가 일어났다면 얼마나 줄었는지 사용자에게 보여줄 수 있어야 함
    if (d.delta.shortened.length > 0) {
      const s = d.delta.shortened[0];
      assert.ok(s.afterStayMin < s.beforeStayMin);
    }
  });

  test('휴무 발생 → 해당 후보 제거', () => {
    const input = base();
    const before = recommend(input);
    const target = before.course[0].id;
    const d = applyEvent(input, { type: 'CLOSURE', closedIds: [target] });
    assert.ok(d.delta.removed.includes(target));
    assert.ok(d.result.excluded.some((e) => e.id === target && e.reasons.includes(REASON.CLOSED)));
  });

  test('환자 호출 → 즉시 관광 중단 및 복귀', () => {
    const input = base();
    const d = applyEvent(input, { type: 'PATIENT_RECALL' });
    assert.equal(d.result.state, STATE.NO_TOURISM);
    assert.equal(d.result.course.length, 0);
    assert.equal(d.result.returnNow, true);
    assert.ok(d.result.reasons.includes(REASON.PATIENT_RECALLED));
  });

  test('위험신호 입력 → NO_TOURISM (앱은 증상을 해석하지 않음)', () => {
    const input = base();
    const d = applyEvent(input, { type: 'RISK_SIGNAL' });
    assert.equal(d.result.state, STATE.NO_TOURISM);
    assert.ok(d.result.reasons.includes(REASON.RISK_SIGNAL));
  });
});

// ─────────────────────────────────────────────
// 출시 차단 조건 — 하나라도 실패하면 배포 금지
// ─────────────────────────────────────────────
describe('🚨 출시 차단 조건 (안전 규칙)', () => {
  test('병원 조건이 없으면 절대 추천을 생성하지 않는다', () => {
    const r = recommend(base({ condition: null }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.equal(r.course.length, 0);
    assert.ok(r.reasons.includes(REASON.NO_HOSPITAL_CONDITION));
  });

  test('병원 조건이 오래되면 추천을 생성하지 않는다', () => {
    const r = recommend(base({
      condition: makeCondition({ issuedAt: new Date('2026-07-20T08:00:00+09:00') }),
    }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.ok(r.reasons.includes(REASON.STALE_HOSPITAL_CONDITION));
  });

  test('조건이 상충하면 추천을 생성하지 않는다', () => {
    const r = recommend(base({
      condition: makeCondition({ escortRequired: true, splitAllowed: true }),
    }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.ok(r.reasons.includes(REASON.CONFLICTING_CONDITION));
  });

  test('복귀시간이 지났으면 즉시 복귀만 제시한다', () => {
    const r = recommend(base({
      plan: makePlan({ returnBy: new Date('2026-07-28T12:00:00+09:00') }),
    }));
    assert.equal(r.state, STATE.NO_TOURISM);
    assert.equal(r.returnNow, true);
  });

  test('모든 결과에 제외 사유가 포함된다 (심사 요구사항)', () => {
    const r = recommend(base({ condition: makeCondition({ indoorOnly: true }) }));
    assert.ok(Array.isArray(r.excluded));
    assert.ok(r.excluded.length > 0);
    for (const e of r.excluded) {
      assert.ok(e.reasons.length > 0, `${e.id} 에 사유가 있어야 함`);
    }
  });

  test('모든 결과에 감사 로그가 포함된다', () => {
    const r = recommend(base());
    assert.ok(r.decisions.length > 0);
    assert.ok(r.decisions.every((d) => d.step && d.at));
  });

  test('후보 0건도 정상 결과로 처리한다 (억지 추천 금지)', () => {
    const r = recommend(base({ candidates: [] }));
    assert.equal(r.state, STATE.STANDBY);
    assert.ok(r.reasons.includes(REASON.NO_CANDIDATE));
  });
});

// ─────────────────────────────────────────────
describe('복귀 SLA 계산', () => {
  test('출발 마감시각을 산출한다', () => {
    const sla = checkSla({
      now: new Date('2026-07-28T13:00:00+09:00'),
      returnBy: new Date('2026-07-28T16:00:00+09:00'),
      outboundMin: 10, inboundMin: 10, stayMin: 30, isPatient: true,
    });
    assert.equal(sla.ok, true);
    assert.ok(sla.latestDepartureAt instanceof Date);
    assert.ok(sla.slackMin > 0);
  });

  test('환자는 보호자보다 더 보수적으로 계산된다', () => {
    const p = { now: new Date('2026-07-28T13:00:00+09:00'), returnBy: new Date('2026-07-28T14:30:00+09:00'), outboundMin: 15, inboundMin: 15, stayMin: 30 };
    const patient = checkSla({ ...p, isPatient: true });
    const companion = checkSla({ ...p, isPatient: false });
    assert.ok(patient.requiredMin > companion.requiredMin);
  });

  test('시간이 부족하면 실패로 판정한다', () => {
    const sla = checkSla({
      now: new Date('2026-07-28T13:00:00+09:00'),
      returnBy: new Date('2026-07-28T13:30:00+09:00'),
      outboundMin: 15, inboundMin: 15, stayMin: 30, isPatient: true,
    });
    assert.equal(sla.ok, false);
  });
});

describe('어댑터', () => {
  test('이동시간 폴백은 외부 API 없이 동작한다', () => {
    const e = createFallbackEstimator();
    const r = e.estimate({ lat: 37.5172, lng: 127.0286 }, { lat: 37.5250, lng: 127.0400 });
    assert.ok(r.min > 0);
    assert.equal(r.source, 'fallback');
  });

  test('기상청 격자 변환 — 서울 강남 좌표', () => {
    const g = toGrid(37.5172, 127.0286);
    // 서울 지역 격자 대략 nx 60~62, ny 125~128
    assert.ok(g.nx >= 55 && g.nx <= 65, `nx=${g.nx}`);
    assert.ok(g.ny >= 120 && g.ny <= 132, `ny=${g.ny}`);
  });

  test('강수확률 임계 초과 시 실외 부적합', () => {
    assert.equal(summarize({ pop: 80 }).outdoorUnsafe, true);
    assert.equal(summarize({ pop: 10 }).outdoorUnsafe, false);
    assert.equal(summarize({}).unknown, true);
  });
});
