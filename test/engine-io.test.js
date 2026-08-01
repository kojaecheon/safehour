// 웹 레이어 입출력 변환 — 정규화, 이벤트 누적 정합성, 상충 조건 전달

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestError,
  normalizeOrigin,
  normalizeCondition,
  normalizeEvent,
  normalizeCtx,
  toCumulativeEvent,
  foldEventIntoPayload,
} from '../lib/server/engine-io.js';
import { gateHospitalCondition } from '../src/engine/safetyGate.js';

const NOW = new Date('2026-08-01T05:00:00Z');

function freshCondition(overrides = {}) {
  return {
    version: 'test-1',
    issuedAt: NOW.toISOString(),
    issuedBy: 'medical_staff',
    outingAllowed: true,
    ...overrides,
  };
}

describe('입력 정규화', () => {
  test('기준점 좌표가 숫자가 아니면 거부한다', () => {
    assert.throws(() => normalizeOrigin({ lat: 'abc', lng: 127 }), BadRequestError);
    assert.throws(() => normalizeOrigin(null), BadRequestError);
  });

  test('조건 버전·발행시각이 없으면 거부한다', () => {
    assert.throws(() => normalizeCondition(freshCondition({ version: '' })), BadRequestError);
    assert.throws(() => normalizeCondition(freshCondition({ issuedAt: 'not-a-date' })), BadRequestError);
  });

  test('splitAllowed=true 는 조건으로 전달되고, escortRequired 와 동시면 엔진이 상충 차단한다', () => {
    const normalized = normalizeCondition(
      freshCondition({ escortRequired: true, splitAllowed: true }),
    );
    assert.equal(normalized.splitAllowed, true);

    const gate = gateHospitalCondition(normalized, { now: new Date(NOW) });
    assert.equal(gate.pass, false);
    assert.ok(gate.reasons.includes('CONFLICTING_CONDITION'));
  });

  test('splitAllowed 가 없으면 조건에 포함되지 않는다', () => {
    const normalized = normalizeCondition(freshCondition());
    assert.equal('splitAllowed' in normalized, false);
  });

  test('지원하지 않는 이벤트 유형은 거부한다', () => {
    assert.throws(() => normalizeEvent({ type: 'HACK' }), BadRequestError);
    assert.throws(() => normalizeEvent({ type: 'CLOSURE', closedIds: [] }), BadRequestError);
  });

  test('수치 이벤트는 허용 범위로 잘린다', () => {
    assert.equal(normalizeEvent({ type: 'TRAFFIC_SURGE', extraMin: 999 }).extraMin, 120);
    assert.equal(normalizeEvent({ type: 'TRAFFIC_SURGE', extraMin: 1 }).extraMin, 5);
    assert.equal(normalizeEvent({ type: 'APPOINTMENT', deltaMin: -999 }).deltaMin, -240);
  });

  test('재계산 ctx 는 허용 키만 통과시킨다', () => {
    const ctx = normalizeCtx({
      appointmentDelayedMin: -60,
      patientRecalled: true,
      malicious: 'x',
      weather: { outdoorUnsafe: true, summary: '강수' },
    });
    assert.deepEqual(Object.keys(ctx).sort(), ['appointmentDelayedMin', 'patientRecalled', 'weather']);
  });
});

describe('이벤트 누적 정합성', () => {
  test('진료 변경은 기존 ctx 에 누적한 총량 이벤트가 된다', () => {
    const e = toCumulativeEvent({ appointmentDelayedMin: -60 }, { type: 'APPOINTMENT', deltaMin: -60 });
    assert.equal(e.deltaMin, -120);
  });

  test('교통 지연 누적은 상한 120분에서 잘린다', () => {
    const e = toCumulativeEvent({ trafficSurgeMin: 110 }, { type: 'TRAFFIC_SURGE', extraMin: 20 });
    assert.equal(e.extraMin, 120);
  });

  test('비수치 이벤트는 그대로 통과한다', () => {
    const e = toCumulativeEvent({ appointmentDelayedMin: -60 }, { type: 'PATIENT_RECALL' });
    assert.deepEqual(e, { type: 'PATIENT_RECALL' });
  });

  test('판정에 쓰는 총량과 payload 에 저장되는 총량이 항상 같다', () => {
    // /api/recalculate 와 동일한 순서: normalize → 누적 변환 → fold
    const ctx = normalizeCtx({ appointmentDelayedMin: -60 });
    const event = toCumulativeEvent(ctx, normalizeEvent({ type: 'APPOINTMENT', deltaMin: -60 }));
    const payload = foldEventIntoPayload({ candidates: [], ctx }, event);
    assert.equal(event.deltaMin, -120);
    assert.equal(payload.ctx.appointmentDelayedMin, -120);
  });
});

describe('이벤트 payload 반영', () => {
  test('휴무 이벤트는 해당 후보의 openNow 만 false 로 바꾼다', () => {
    const payload = foldEventIntoPayload(
      { candidates: [{ id: 'a', openNow: true }, { id: 'b', openNow: true }], ctx: {} },
      { type: 'CLOSURE', closedIds: ['a'] },
    );
    assert.equal(payload.candidates.find((c) => c.id === 'a').openNow, false);
    assert.equal(payload.candidates.find((c) => c.id === 'b').openNow, true);
  });

  test('환자 호출·위험신호는 ctx 플래그로 유지된다', () => {
    const recalled = foldEventIntoPayload({ candidates: [], ctx: {} }, { type: 'PATIENT_RECALL' });
    assert.equal(recalled.ctx.patientRecalled, true);
    const risk = foldEventIntoPayload({ candidates: [], ctx: {} }, { type: 'RISK_SIGNAL' });
    assert.equal(risk.ctx.riskSignalReported, true);
  });

  test('기상 악화는 ctx.weather 로 유지된다', () => {
    const payload = foldEventIntoPayload(
      { candidates: [], ctx: {} },
      { type: 'WEATHER', weather: { outdoorUnsafe: true, summary: '기상 악화' } },
    );
    assert.equal(payload.ctx.weather.outdoorUnsafe, true);
  });
});
