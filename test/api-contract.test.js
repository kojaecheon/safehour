// AX-002 — 내부 API 계약 테스트 (D04 API007–009, D09 AC001–003)
//
// 계약:
//   - 응답 본문은 항상 { ok: boolean, ... } 이며, 실패 시 { ok:false, errorCode, message }
//   - HTTP 상태: 400 입력 무효 / 502 외부 API 실패 / 500 판정 엔진 실패
//   - 판정은 stateless — 허용되지 않은 ctx 키·필드는 무시되고 되돌아오지 않는다
//   - 기준점은 항상 USER_SELECTED_FIXED 로 강제된다 (현재 GPS 금지, D07-BAN002)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as recalculatePost } from '../app/api/recalculate/route.js';
import { POST as recommendPost } from '../app/api/recommend/route.js';

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const NOW = Date.now();
const iso = (offsetMin) => new Date(NOW + offsetMin * 60000).toISOString();

/** 게이트를 통과하는 최소 후보 */
function passingCandidate(id, title) {
  return {
    id,
    title,
    lat: 37.511,
    lng: 127.06,
    indoor: true,
    walkMin: 10,
    stayMin: 40,
    openNow: true,
    tourismEligible: true,
    dataFresh: true,
  };
}

function validRecalcPayload(overrides = {}) {
  return {
    origin: { lat: 37.5105, lng: 127.059, label: '병원' },
    returnBy: iso(240),
    condition: {
      version: 'contract-1',
      issuedAt: iso(-10),
      issuedBy: 'medical_staff',
      outingAllowed: true,
    },
    roles: { hasCompanion: true, patientResting: false, companionSeparateAllowed: false },
    candidates: [passingCandidate('c1', '실내 전시관'), passingCandidate('c2', '박물관')],
    ctx: {},
    ...overrides,
  };
}

describe('POST /api/recalculate 계약', () => {
  test('유효 payload + CLOSURE → 200, 응답 구조 계약 준수', async () => {
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload: validRecalcPayload(),
        event: { type: 'CLOSURE', closedIds: ['c1'] },
      }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.displayLimit, 3);
    for (const key of ['event', 'before', 'after', 'delta', 'result']) {
      assert.ok(key in data.recalc, `recalc.${key} 누락`);
    }
    assert.ok(Array.isArray(data.nextRecalcPayload.candidates));
    // CLOSURE 가 payload 에 반영됨
    assert.equal(data.nextRecalcPayload.candidates.find((c) => c.id === 'c1').openNow, false);
    // 기준점은 항상 고정 좌표로 강제
    assert.equal(data.nextRecalcPayload.origin.kind, 'USER_SELECTED_FIXED');
  });

  test('본문이 JSON 이 아니면 400 SAFEHOUR_BAD_REQUEST', async () => {
    const res = await recalculatePost(jsonRequest('http://test/api/recalculate', 'not-json{'));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.errorCode, 'SAFEHOUR_BAD_REQUEST');
    assert.ok(data.message);
  });

  test('후보 0건은 정상 결과이므로 재판정을 허용한다', async () => {
    // 후보 0건은 STANDBY 라는 정상 결과다. 400 으로 막으면 그 상태에서
    // 환자 호출·위험신호가 들어와도 재판정이 불가능해진다 (D04-BR011).
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload: validRecalcPayload({ candidates: [] }),
        event: { type: 'PATIENT_RECALL' },
      }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.recalc.result.state, 'NO_TOURISM');
    assert.equal(data.recalc.result.returnNow, true);
  });

  test('후보 목록이 배열이 아니면 400 SAFEHOUR_RECALCULATION_INVALID', async () => {
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload: validRecalcPayload({ candidates: null }),
        event: { type: 'WEATHER' },
      }),
    );
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.errorCode, 'SAFEHOUR_RECALCULATION_INVALID');
  });

  test('지원하지 않는 이벤트는 400 SAFEHOUR_RECALCULATION_INVALID', async () => {
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload: validRecalcPayload(),
        event: { type: 'HACK_EVENT' },
      }),
    );
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.errorCode, 'SAFEHOUR_RECALCULATION_INVALID');
  });

  test('허용되지 않은 ctx 키·GPS 류 필드는 무시되고 응답에 되돌아오지 않는다', async () => {
    const res = await recalculatePost(
      jsonRequest('http://test/api/recalculate', {
        recalcPayload: validRecalcPayload({
          ctx: { malicious: true, appointmentDelayedMin: -30 },
          origin: { lat: 37.5105, lng: 127.059, label: '병원', currentGpsLat: 37.0 },
        }),
        event: { type: 'WEATHER' },
      }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal('malicious' in data.nextRecalcPayload.ctx, false);
    assert.equal('currentGpsLat' in data.nextRecalcPayload.origin, false);
    assert.equal(data.nextRecalcPayload.ctx.appointmentDelayedMin, -30);
  });

  test('진료 변경 반복 주입 시 판정과 저장 payload 가 같은 누적 총량을 쓴다', async () => {
    const first = await (
      await recalculatePost(
        jsonRequest('http://test/api/recalculate', {
          recalcPayload: validRecalcPayload(),
          event: { type: 'APPOINTMENT', deltaMin: -60 },
        }),
      )
    ).json();
    assert.equal(first.nextRecalcPayload.ctx.appointmentDelayedMin, -60);

    const second = await (
      await recalculatePost(
        jsonRequest('http://test/api/recalculate', {
          recalcPayload: first.nextRecalcPayload,
          event: { type: 'APPOINTMENT', deltaMin: -60 },
        }),
      )
    ).json();
    assert.equal(second.nextRecalcPayload.ctx.appointmentDelayedMin, -120);
    assert.equal(second.recalc.event.deltaMin, -120);
  });
});

describe('POST /api/recommend 계약 (입력 검증 경로)', () => {
  test('본문이 JSON 이 아니면 400 SAFEHOUR_BAD_REQUEST', async () => {
    const res = await recommendPost(jsonRequest('http://test/api/recommend', '{{'));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.errorCode, 'SAFEHOUR_BAD_REQUEST');
  });

  test('병원 조건이 없으면 400 SAFEHOUR_CONDITION_INVALID', async () => {
    const res = await recommendPost(
      jsonRequest('http://test/api/recommend', {
        origin: { lat: 37.5105, lng: 127.059 },
        returnBy: iso(240),
      }),
    );
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.errorCode, 'SAFEHOUR_CONDITION_INVALID');
  });

  test('복귀 시각이 무효면 400 SAFEHOUR_CONDITION_INVALID', async () => {
    const res = await recommendPost(
      jsonRequest('http://test/api/recommend', {
        origin: { lat: 37.5105, lng: 127.059 },
        returnBy: 'not-a-date',
        condition: { version: 'v', issuedAt: iso(-5), outingAllowed: true },
      }),
    );
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.errorCode, 'SAFEHOUR_CONDITION_INVALID');
  });

  test('기준점 좌표가 무효면 400 SAFEHOUR_CONDITION_INVALID', async () => {
    const res = await recommendPost(
      jsonRequest('http://test/api/recommend', {
        origin: { lat: 'abc', lng: 127.059 },
        returnBy: iso(240),
        condition: { version: 'v', issuedAt: iso(-5), outingAllowed: true },
      }),
    );
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.errorCode, 'SAFEHOUR_CONDITION_INVALID');
  });
});
