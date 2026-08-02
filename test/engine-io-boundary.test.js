// AX-006 — 웹 레이어 입력 경계 (적대적 검증으로 확정된 결함 회귀)
//
// 계약:
//   - 후보 0건은 정상 결과(STANDBY)다. 이 상태에서도 안전 이벤트 재판정이 막히면 안 된다.
//     환자 호출·위험신호는 후보 유무와 무관하게 즉시 반영되어야 한다 (D04-BR011).
//   - 국내 범위를 벗어난 좌표는 사용자 입력 오류이지 외부 API 장애가 아니다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestError,
  normalizeCandidates,
  normalizeOrigin,
  buildEngineInput,
  normalizeCondition,
  normalizeRoles,
  normalizeReturnBy,
} from '../lib/server/engine-io.js';
import { applyEvent } from '../src/engine/recommend.js';

describe('후보 0건에서도 안전 이벤트 재판정이 가능하다', () => {
  test('빈 후보 배열은 400 이 아니라 정상 입력으로 통과한다', () => {
    assert.deepEqual(normalizeCandidates([]), []);
  });

  test('배열이 아닌 값은 여전히 거부한다', () => {
    assert.throws(() => normalizeCandidates(null), BadRequestError);
    assert.throws(() => normalizeCandidates('후보'), BadRequestError);
    assert.throws(() => normalizeCandidates({ 0: 'a' }), BadRequestError);
  });

  test('상한을 넘는 후보 목록은 거부한다', () => {
    assert.throws(() => normalizeCandidates(new Array(1001).fill({})), BadRequestError);
  });

  test('후보 0건(STANDBY) 상태에서 환자 호출이 즉시 복귀로 반영된다', () => {
    const now = new Date();
    const engineInput = buildEngineInput({
      origin: normalizeOrigin({ lat: 37.5105, lng: 127.059 }),
      returnBy: normalizeReturnBy(new Date(now.getTime() + 4 * 3600000).toISOString()),
      condition: normalizeCondition({
        version: 'v1',
        issuedAt: now.toISOString(),
        outingAllowed: true,
      }),
      roles: normalizeRoles({ hasCompanion: true }),
      candidates: normalizeCandidates([]),
    });

    const recalc = applyEvent(engineInput, { type: 'PATIENT_RECALL' });

    assert.equal(recalc.before.state, 'STANDBY', '후보 0건은 STANDBY 여야 한다');
    assert.equal(recalc.after.state, 'NO_TOURISM');
    assert.equal(recalc.result.returnNow, true, '환자 호출이 즉시 복귀로 이어지지 않았다');
    assert.equal(recalc.delta.stateChanged, true);
  });

  test('후보 0건 상태에서 위험신호도 반영된다', () => {
    const now = new Date();
    const engineInput = buildEngineInput({
      origin: normalizeOrigin({ lat: 37.5105, lng: 127.059 }),
      returnBy: normalizeReturnBy(new Date(now.getTime() + 4 * 3600000).toISOString()),
      condition: normalizeCondition({
        version: 'v1',
        issuedAt: now.toISOString(),
        outingAllowed: true,
      }),
      roles: normalizeRoles({ hasCompanion: true }),
      candidates: normalizeCandidates([]),
    });

    const recalc = applyEvent(engineInput, { type: 'RISK_SIGNAL' });

    assert.equal(recalc.after.state, 'NO_TOURISM');
    assert.ok(recalc.after.reasons.includes('RISK_SIGNAL'));
  });
});

describe('기준점 좌표 범위는 입력 검증 단계에서 판정한다', () => {
  test('대한민국 범위를 벗어난 좌표는 입력 오류로 거부한다', () => {
    // 파리 — 외부 API 를 호출해서 실패하는 게 아니라 입력 단계에서 걸러야 한다
    assert.throws(() => normalizeOrigin({ lat: 48.85, lng: 2.35 }), BadRequestError);
    // 적도 부근 (0,0) — 빈 입력이 숫자 0 으로 변환된 전형적 사고
    assert.throws(() => normalizeOrigin({ lat: 0, lng: 0 }), BadRequestError);
  });

  test('국내 좌표는 통과한다', () => {
    assert.doesNotThrow(() => normalizeOrigin({ lat: 37.5105, lng: 127.059 })); // 서울
    assert.doesNotThrow(() => normalizeOrigin({ lat: 33.51, lng: 126.52 })); // 제주
  });

  test('숫자가 아닌 좌표는 여전히 거부한다', () => {
    assert.throws(() => normalizeOrigin({ lat: 'abc', lng: 127 }), BadRequestError);
    assert.throws(() => normalizeOrigin(null), BadRequestError);
  });
});
