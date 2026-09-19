// AX-308 — 일정 API 요청 정규화 (spec 6장 PlanStay 허용 목록, 규칙 46·54)
//
// 계약
//   - PlanStay 허용 목록 밖 필드(이름·주소·전화·병원 안내문·연결 코드·현재 위치류)는 버린다(규칙 54, 46 서버 쪽)
//   - 좌표는 대한민국 범위만 받는다 — 밖이면 SAFEHOUR_STAY_INVALID(OUT_OF_RANGE), 외부 호출까지 내려가지 않는다
//   - 체류 검증(validateStay) 실패는 SAFEHOUR_STAY_INVALID + fields·issues(값 없이 경로·코드만)
//   - 데모 사건은 엔진에 넘기기 전에 검증한다 — 모르는 유형·잘못된 매개변수는 SAFEHOUR_BAD_REQUEST
//   - 기기가 보낸 일정(previous·day)은 DayPlan 필드만 남긴다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_LANGS,
  RequestError,
  normalizeAlternativesRequest,
  normalizeDayPlan,
  normalizeDemoEvents,
  normalizePlanRequest,
  normalizePlanStay,
} from '../lib/server/itinerary-request.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { AIRPORT_TRAVEL, at, byLodging, tripPool, tripStay } from './trip-fixtures.js';
import { planStay } from './itinerary-fixtures.js';

const PII = {
  lodgingName: '테스트 호텔 강남점',
  road: '서울특별시 가상구 가상로 77',
  hospitalName: '가상 성형외과의원',
  phone: '02-0000-1234',
  code: 'LINK-CODE-9Z',
  instruction: '수술 부위를 문지르지 마세요',
  gpsLat: 37.1234567,
  gpsLng: 127.7654321,
};

/** 허용 목록 밖 필드를 잔뜩 붙인 체류 */
function stuffedStay() {
  const s = planStay();
  return {
    ...s,
    schemaVersion: 2,
    currentLocation: { lat: PII.gpsLat, lng: PII.gpsLng },
    lastKnownPosition: { latitude: PII.gpsLat, longitude: PII.gpsLng },
    linkedPlans: [{ code: PII.code, hospitalId: 'H1', plan: { instructions: [{ id: 'i1', text: PII.instruction }] } }],
    guardianShare: { lastSentAt: '2026-10-01T10:00:00+09:00', planFingerprint: 'fp' },
    createdAt: '2026-09-30T09:00:00+09:00',
    lodgings: s.lodgings.map((l) => ({
      ...l,
      name: PII.lodgingName,
      address: { roadAddress: PII.road, lat: l.lat, lng: l.lng, source: 'JUSO' },
      phone: PII.phone,
      gps: { lat: PII.gpsLat, lng: PII.gpsLng },
    })),
    hospitals: s.hospitals.map((h) => ({
      ...h,
      name: PII.hospitalName,
      phone: PII.phone,
      address: { roadAddress: PII.road, lat: h.lat, lng: h.lng, source: 'JUSO' },
      linkedPlanId: PII.code,
    })),
    appointments: s.appointments.map((a) => ({ ...a, source: 'USER', note: PII.instruction })),
    periods: s.periods.map((p) => ({
      ...p,
      planId: PII.code,
      planVersion: 3,
      hospitalId: 'H1',
      memo: PII.instruction,
      items: { ...p.items, freeText: PII.instruction, diet: { ...p.items.diet, note: PII.instruction } },
    })),
    consent: { sensitive: { version: 'consent-v1', agreedAt: '2026-09-30T09:00:00+09:00' }, guardian: true },
  };
}

function thrown(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('예외가 나지 않았다');
}

describe('PlanStay 허용 목록 (규칙 54)', () => {
  test('허용 목록 밖 필드는 모두 버려진다 — 이름·주소·전화·연결 코드·안내문', () => {
    const stay = normalizePlanStay(stuffedStay());
    const text = JSON.stringify(stay);
    for (const [name, value] of Object.entries(PII)) {
      assert.equal(text.includes(String(value)), false, `${name} 가 남았다`);
    }
    assert.deepEqual(Object.keys(stay).sort(), [
      'appointments',
      'arrival',
      'consent',
      'departure',
      'hasCompanion',
      'hospitals',
      'interests',
      'lodgings',
      'pace',
      'periods',
    ]);
    assert.deepEqual(Object.keys(stay.lodgings[0]).sort(), ['checkIn', 'checkOut', 'id', 'lat', 'lng']);
    assert.deepEqual(Object.keys(stay.hospitals[0]).sort(), ['id', 'lat', 'lng']);
    assert.deepEqual(Object.keys(stay.appointments[0]).sort(), ['date', 'hospitalId', 'id', 'start', 'type']);
    assert.deepEqual(Object.keys(stay.periods[0]).sort(), ['endDate', 'id', 'items', 'source', 'startDate']);
    assert.equal('freeText' in stay.periods[0].items, false);
    assert.equal('note' in stay.periods[0].items.diet, false);
    assert.deepEqual(stay.consent, { sensitive: true });
  });

  test('현재 위치류 필드는 어느 깊이에서도 남지 않는다 (규칙 46 서버 쪽)', () => {
    const stay = normalizePlanStay(stuffedStay());
    const text = JSON.stringify(stay);
    for (const key of ['currentLocation', 'lastKnownPosition', 'gps', 'latitude', 'longitude']) {
      assert.equal(text.includes(`"${key}"`), false, `${key} 가 남았다`);
    }
    // 숙소 좌표는 사용자가 고른 고정 좌표 그대로다
    assert.equal(stay.lodgings[0].lat, planStay().lodgings[0].lat);
  });

  test('병원 기간의 만료·철회는 남고, SELF 제한 없음 표시는 남는다', () => {
    const hospital = {
      id: 'HP1',
      source: 'HOSPITAL',
      startDate: '2026-10-04',
      endDate: '2026-10-06',
      items: planStay().periods[0].items,
      expiresAt: '2026-10-20T00:00:00+09:00',
      revoked: false,
      planId: 'plan-x',
    };
    const self = { id: 'S1', source: 'SELF', startDate: '2026-10-07', endDate: '2026-10-08', noRestriction: true, items: {} };
    const stay = normalizePlanStay(planStay({ periods: [hospital, self] }));
    assert.deepEqual(Object.keys(stay.periods[0]).sort(), ['endDate', 'expiresAt', 'id', 'items', 'revoked', 'source', 'startDate']);
    assert.equal(stay.periods[1].noRestriction, true);
  });

  test('동의는 true 이거나 기기 저장 형태({version, agreedAt})일 때만 참이다', () => {
    const consent = (sensitive) => normalizePlanStay(planStay({ consent: { sensitive } })).consent;
    assert.deepEqual(consent(true), { sensitive: true });
    assert.deepEqual(consent({ version: 'v1', agreedAt: '2026-09-30T09:00:00+09:00' }), { sensitive: true });
    assert.deepEqual(consent('yes'), { sensitive: false });
    assert.deepEqual(consent(null), { sensitive: false });
    assert.deepEqual(normalizePlanStay({ ...planStay(), consent: undefined }).consent, { sensitive: false });
  });
});

describe('체류 검증과 좌표 범위', () => {
  test('대한민국 밖 좌표는 SAFEHOUR_STAY_INVALID(OUT_OF_RANGE)다', () => {
    for (const point of [
      { lat: 48.85, lng: 2.35 }, // 파리
      { lat: 0, lng: 0 }, // 빈 입력이 0 으로 바뀐 전형적 사고
    ]) {
      const s = planStay();
      s.lodgings[0] = { ...s.lodgings[0], ...point };
      const error = thrown(() => normalizePlanRequest({ lang: 'en', stay: s }));
      assert.ok(error instanceof RequestError);
      assert.equal(error.errorCode, 'SAFEHOUR_STAY_INVALID');
      assert.ok(error.extra.issues.some((i) => i.field === 'lodgings[0].lat' && i.code === 'OUT_OF_RANGE'));
    }
  });

  test('병원 좌표도 범위를 본다. 제주는 통과한다', () => {
    const s = planStay();
    s.hospitals[0] = { ...s.hospitals[0], lat: 35.0, lng: 140.0 };
    const error = thrown(() => normalizePlanRequest({ lang: 'en', stay: s }));
    assert.ok(error.extra.fields.includes('hospitals[0].lng'));

    const jeju = planStay();
    jeju.lodgings[0] = { ...jeju.lodgings[0], lat: 33.51, lng: 126.52 };
    assert.doesNotThrow(() => normalizePlanRequest({ lang: 'en', stay: jeju }));
  });

  test('체류 규칙 위반은 필드 경로와 코드만 담는다 (값을 담지 않는다)', () => {
    const s = planStay({ departure: { date: '2026-09-20', time: '10:00', airport: 'ICN' } });
    const error = thrown(() => normalizePlanRequest({ lang: 'en', stay: s }));
    assert.equal(error.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.ok(error.extra.fields.includes('departure.date'));
    assert.equal(JSON.stringify(error.extra).includes('2026-09-20'), false);
  });

  test('stay 가 없으면 SAFEHOUR_STAY_INVALID 다', () => {
    const error = thrown(() => normalizePlanRequest({ lang: 'en' }));
    assert.equal(error.errorCode, 'SAFEHOUR_STAY_INVALID');
  });
});

describe('요청 필드', () => {
  test('lang 은 ko·en·ja·zh 중 하나여야 한다', () => {
    assert.deepEqual(PLAN_LANGS, ['ko', 'en', 'ja', 'zh']);
    for (const lang of [undefined, '', 'fr', 'JA ', 3]) {
      const error = thrown(() => normalizePlanRequest({ lang, stay: planStay() }));
      assert.equal(error.errorCode, 'SAFEHOUR_BAD_REQUEST');
      assert.equal(error.field, 'lang');
    }
    assert.equal(normalizePlanRequest({ lang: 'zh', stay: planStay() }).lang, 'zh');
  });

  test('dates 는 날짜 문자열 배열이다', () => {
    const bad = [['2026-10-1'], '2026-10-01', [20261001], new Array(47).fill('2026-10-01')];
    for (const dates of bad) {
      const error = thrown(() => normalizePlanRequest({ lang: 'en', stay: planStay(), dates }));
      assert.equal(error.field, 'dates');
    }
    assert.deepEqual(normalizePlanRequest({ lang: 'en', stay: planStay(), dates: ['2026-10-02'] }).dates, ['2026-10-02']);
    assert.equal(normalizePlanRequest({ lang: 'en', stay: planStay() }).dates, undefined);
  });

  test('usedContentIds·edits 는 형식이 틀리면 거부하고, 모르는 키는 버린다', () => {
    const base = { lang: 'en', stay: planStay() };
    assert.equal(thrown(() => normalizePlanRequest({ ...base, usedContentIds: 'x' })).field, 'usedContentIds');
    assert.equal(thrown(() => normalizePlanRequest({ ...base, usedContentIds: ['../x'] })).field, 'usedContentIds');
    assert.equal(thrown(() => normalizePlanRequest({ ...base, edits: { '2026-10-02': { deleted: 'x' } } })).field, 'edits.2026-10-02.deleted');
    assert.equal(thrown(() => normalizePlanRequest({ ...base, edits: { tomorrow: {} } })).field, 'edits');
    assert.equal(
      thrown(() => normalizePlanRequest({ ...base, edits: { '2026-10-02': { clearedMeals: ['BRUNCH'] } } })).field,
      'edits.2026-10-02.clearedMeals',
    );
    const ok = normalizePlanRequest({
      ...base,
      usedContentIds: ['5001', 5002],
      edits: { '2026-10-02': { pinned: ['5003'], deleted: [], clearedMeals: ['LUNCH'], note: 'x' } },
    });
    assert.deepEqual(ok.usedContentIds, ['5001', '5002']);
    assert.deepEqual(ok.edits, { '2026-10-02': { pinned: ['5003'], deleted: [], clearedMeals: ['LUNCH'] } });
  });

  test('relabelOnly 는 true 일 때만 켜진다', () => {
    assert.equal(normalizePlanRequest({ lang: 'en', stay: planStay(), relabelOnly: 'true' }).relabelOnly, false);
    assert.equal(normalizePlanRequest({ lang: 'en', stay: planStay(), relabelOnly: true }).relabelOnly, true);
  });

  test('본문의 현재 위치류 필드·now 는 결과에 없다', () => {
    const out = normalizePlanRequest({
      lang: 'en',
      stay: planStay(),
      now: '2026-10-01T10:00:00+09:00',
      currentLocation: { lat: PII.gpsLat, lng: PII.gpsLng },
      origin: { lat: PII.gpsLat, lng: PII.gpsLng },
      gpsLat: PII.gpsLat,
    });
    assert.deepEqual(Object.keys(out).sort(), ['dates', 'edits', 'events', 'lang', 'previous', 'relabelOnly', 'stay', 'usedContentIds']);
    assert.equal(JSON.stringify(out).includes(String(PII.gpsLat)), false);
  });
});

describe('데모 사건 검증 (엔진에 넘기기 전)', () => {
  const fieldOf = (events) => thrown(() => normalizeDemoEvents(events)).field;

  test('모르는 유형·배열 아님은 거부한다', () => {
    assert.equal(fieldOf('WEATHER'), 'events');
    assert.equal(fieldOf([{ type: 'HACK' }]), 'events[0].type');
    assert.equal(fieldOf([{ type: 'WEATHER' }, null]), 'events[1].type');
  });

  test('매개변수가 범위 밖이면 거부한다', () => {
    assert.equal(fieldOf([{ type: 'CLOSURE' }]), 'events[0].closedIds');
    assert.equal(fieldOf([{ type: 'CLOSURE', closedIds: [] }]), 'events[0].closedIds');
    assert.equal(fieldOf([{ type: 'CLOSURE', closedIds: new Array(21).fill('1') }]), 'events[0].closedIds');
    assert.equal(fieldOf([{ type: 'CLOSURE', closedIds: ['abc'] }]), 'events[0].closedIds');
    assert.equal(fieldOf([{ type: 'TRAFFIC_SURGE', extraMin: 3 }]), 'events[0].extraMin');
    assert.equal(fieldOf([{ type: 'TRAFFIC_SURGE', extraMin: 121 }]), 'events[0].extraMin');
    assert.equal(fieldOf([{ type: 'TRAFFIC_SURGE', extraMin: 'abc' }]), 'events[0].extraMin');
    assert.equal(fieldOf([{ type: 'APPOINTMENT', deltaMin: 241 }]), 'events[0].deltaMin');
    assert.equal(fieldOf([{ type: 'APPOINTMENT' }]), 'events[0].deltaMin');
  });

  test('유효한 사건은 계약 필드만 남긴다', () => {
    const events = normalizeDemoEvents([
      { type: 'CLOSURE', closedIds: ['5001', 5002], note: 'x' },
      { type: 'WEATHER', extra: 1 },
      { type: 'TRAFFIC_SURGE', extraMin: 20 },
      { type: 'APPOINTMENT', deltaMin: -60 },
      { type: 'PATIENT_RECALL' },
      { type: 'RISK_SIGNAL' },
    ]);
    assert.deepEqual(events, [
      { type: 'CLOSURE', closedIds: ['5001', '5002'] },
      { type: 'WEATHER' },
      { type: 'TRAFFIC_SURGE', extraMin: 20 },
      { type: 'APPOINTMENT', deltaMin: -60 },
      { type: 'PATIENT_RECALL' },
      { type: 'RISK_SIGNAL' },
    ]);
  });

  test('사건이 50건을 넘으면 거부한다', () => {
    assert.equal(fieldOf(new Array(51).fill({ type: 'WEATHER' })), 'events');
  });
});

describe('기기가 보낸 일정(DayPlan) 정리', () => {
  const trip = planTrip({
    stay: tripStay(),
    candidatesByLodging: byLodging(tripPool('en', 60)),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: at('2026-09-30', '10:00'),
  });
  // 조건 합성(effective)과 외출이 모두 있는 제한일
  const withOutings = Object.values(trip.days).find((d) => d.outings.length > 0 && d.effective.outing);

  test('엔진이 만든 일정은 그대로 통과한다', () => {
    assert.deepEqual(normalizeDayPlan(structuredClone(withOutings), 'day'), withOutings);
    for (const day of Object.values(trip.days)) assert.deepEqual(normalizeDayPlan(structuredClone(day), 'day'), day);
  });

  test('DayPlan 밖 필드·현재 위치류 필드는 모든 깊이에서 버린다', () => {
    const day = structuredClone(withOutings);
    day.currentLocation = { lat: PII.gpsLat, lng: PII.gpsLng };
    day.outings[0].gps = { lat: PII.gpsLat };
    day.outings[0].stops[0].userPosition = { lat: PII.gpsLat };
    day.outings[0].stops[0].legIn.fromLat = PII.gpsLat;
    day.reasons = [...day.reasons, '홍길동 사유'];
    day.effective.outing.provenance[0].note = PII.instruction;
    const clean = normalizeDayPlan(day, 'day');
    const text = JSON.stringify(clean);
    assert.equal(text.includes(String(PII.gpsLat)), false);
    assert.equal(text.includes('홍길동'), false);
    assert.equal(text.includes(PII.instruction), false);
    assert.deepEqual(clean, withOutings);
  });

  test('시각·숫자 형식이 틀리면 필드 경로와 함께 거부한다', () => {
    const day = structuredClone(withOutings);
    day.outings[0].stops[0].arriveAt = '25:99';
    const error = thrown(() => normalizeDayPlan(day, 'previous.2026-10-01'));
    assert.equal(error.errorCode, 'SAFEHOUR_BAD_REQUEST');
    assert.equal(error.field, 'previous.2026-10-01.outings[0].stops[0].arriveAt');
  });

  test('previous 의 날짜 키와 일정 날짜가 다르면 거부한다', () => {
    const date = withOutings.date;
    const error = thrown(() =>
      normalizePlanRequest({ lang: 'en', stay: planStay(), previous: { '2026-10-09': structuredClone(withOutings) } }),
    );
    assert.equal(error.field, 'previous.2026-10-09.date');
    const ok = normalizePlanRequest({ lang: 'en', stay: planStay(), previous: { [date]: structuredClone(withOutings) } });
    assert.deepEqual(ok.previous[date], withOutings);
  });
});

describe('교체 후보 요청', () => {
  const trip = planTrip({
    stay: tripStay(),
    candidatesByLodging: byLodging(tripPool('en', 60)),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: at('2026-09-30', '10:00'),
  });
  const day = Object.values(trip.days).find((d) => d.outings.length > 0);
  const outing = day.outings[0];

  test('필수 필드를 정리해 돌려준다', () => {
    const out = normalizeAlternativesRequest({
      lang: 'ja',
      stay: planStay(),
      date: day.date,
      outingId: outing.id,
      stopId: outing.stops[0].id,
      day: structuredClone(day),
      usedContentIds: ['5001'],
      currentLocation: { lat: PII.gpsLat },
    });
    assert.deepEqual(Object.keys(out).sort(), ['date', 'day', 'edits', 'events', 'lang', 'outingId', 'stay', 'stopId', 'usedContentIds']);
    assert.equal(out.lang, 'ja');
    assert.deepEqual(out.day, day);
  });

  test('date·outingId·stopId·day 가 없거나 틀리면 거부한다', () => {
    const base = { lang: 'en', stay: planStay(), date: day.date, outingId: outing.id, stopId: outing.stops[0].id, day: structuredClone(day) };
    assert.equal(thrown(() => normalizeAlternativesRequest({ ...base, date: 'x' })).field, 'date');
    assert.equal(thrown(() => normalizeAlternativesRequest({ ...base, outingId: 3 })).field, 'outingId');
    assert.equal(thrown(() => normalizeAlternativesRequest({ ...base, stopId: '' })).field, 'stopId');
    assert.equal(thrown(() => normalizeAlternativesRequest({ ...base, day: null })).field, 'day');
    assert.equal(thrown(() => normalizeAlternativesRequest({ ...base, date: '2026-10-09' })).field, 'day.date');
  });
});
