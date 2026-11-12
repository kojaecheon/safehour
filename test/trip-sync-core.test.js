// AX-316: 일정 동기화 순수 계층
// (docs/business-rules.md '매일 확인'·'전체 일정 확정과 변화 대응'(재계획 규칙, 오늘 게이트 덧씌우기)·'사용자 편집',
//  docs/platform/ITINERARY_RULES.md '변화 원천'·'데모 사건', docs/platform/IA_AND_FLOWS.md '동의 철회와 데이터 삭제',
//  docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)', 테스트 이름의 규칙 32·49·54·55 는 옛 설계서 번호다)
//
// 네트워크·저장소 없이 순수 함수만 본다.
//   - PlanStay 허용 목록: 이름·주소·전화·연결 코드를 보내지 않는다
//   - 영향 날짜: 체류 변경 종류마다 그 날짜만(이름·주소 같은 표시 값은 재계획하지 않는다)
//   - 요청 모양: previous·edits·usedContentIds·events
//   - 편집 기록: 교체·삭제·비움·다시 만들기
//   - 오늘 게이트 덧씌우기: 저장된 일정을 바꾸지 않는다(docs/business-rules.md '전체 일정 확정과 변화 대응')
//   - 동의 철회 오프라인 대비: 조건에서 나온 값을 남기지 않는다

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAlternativesBody,
  buildPlanBody,
  buildRelabelBody,
  diffStay,
  immediateReturnCauseFor,
  markConsentWithdrawnLocally,
  normalizeTodayEvents,
  outingInProgress,
  selectTodayView,
  stripConditionData,
  toPlanStay,
  usedContentIdsOutside,
  withClearedMeal,
  withDelete,
  withSwap,
  withoutDates,
} from '../lib/trip/index.js';
import { deepFreeze, hospitalPeriod, makeStay, selfPeriod } from './stay-fixtures.js';
import { overdueOutingOf, returnTargetOf } from '../components/trip/viewModel.js';

const clone = (v) => structuredClone(v);

// ── 하루 일정 모양 (docs/contracts.md '`POST /api/itinerary/plan`') ─────────────────────────────────────────

function stop(date, contentId, arriveAt, leaveAt, o = {}) {
  return {
    id: `${date}:P:${contentId}`,
    candidateId: String(contentId),
    contentId: String(contentId),
    title: `테스트 장소 ${contentId}`,
    address: '테스트로 1',
    lang: 'en',
    category: o.isMeal ? 'FOOD' : 'CULTURE',
    isMeal: o.isMeal === true,
    lat: 37.5,
    lng: 127.03,
    ko: { title: `테스트 장소 ${contentId}`, address: '테스트로 1' },
    sourceIds: { ko: String(contentId) },
    contentTypeIds: { canonical: '14', ko: '14' },
    arriveAt,
    leaveAt,
    stayMin: 45,
    shortened: false,
    legIn: { min: 10, mode: 'TAXI', estimated: true },
    walkBurdenMin: 10,
    indoor: true,
    pinned: false,
    labels: o.labels ?? ['ESTIMATED'],
  };
}

function day(date, o = {}) {
  const stops = o.stops ?? [stop(date, 5001, '10:30', '11:15'), stop(date, 5002, '12:00', '12:45', { isMeal: true, labels: ['ESTIMATED', 'DIET_ESTIMATED', 'ORDER_CARD'] })];
  return {
    date,
    coverage: o.coverage ?? 'RESTRICTED',
    dayState: o.dayState ?? 'TOGETHER',
    reasons: o.reasons ?? [],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'L1',
    transportMode: 'TAXI',
    effective: {
      walkLimit: { value: 15, provenance: [{ periodId: 'P-SELF', source: 'SELF', defaulted: true }] },
      medication: { value: [{ time: '14:00', atLodging: true }], provenance: [{ periodId: 'P-SELF', source: 'SELF', defaulted: false }] },
    },
    blocks: [
      { kind: 'APPOINTMENT', start: '15:00', end: '17:00', appointmentId: 'A9' },
      { kind: 'MEDICATION', start: '14:00', end: '14:15' },
    ],
    outings: stops.length
      ? [
          {
            id: `${date}:P:outing-1`,
            departAt: '10:15',
            returnBy: '14:00',
            returnPlace: 'LODGING',
            deadlineReason: 'MEDICATION',
            latestDepartureAt: '11:00',
            slackMin: 30,
            walkTotalMin: 20,
            travelTotalMin: 30,
            plannedReturnAt: '13:10',
            stops,
          },
        ]
      : [],
    guardianOutings: [],
    mealSlots: [
      { slot: 'LUNCH', status: stops.length ? 'FILLED' : 'NOT_APPLICABLE', ...(stops.length ? { stopId: `${date}:P:5002` } : {}), reasons: [] },
      { slot: 'DINNER', status: 'NONE_AVAILABLE', reasons: ['FASTING_REQUIRED'] },
    ],
    excluded: [{ candidateId: '6001', title: '제외 장소', reasons: ['DIET_RESTRICTED'] }],
    warnings: ['MEDICATION_TIMES_MISSING', 'DEFAULTS_APPLIED', 'TRAVEL_TIMES_ESTIMATED'],
    returnNow: false,
    ...(o.extra ?? {}),
  };
}

// ── PlanStay 허용 목록 (docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)') ───────────────────────────

describe('PlanStay — 이름·주소·전화·연결 코드를 보내지 않는다', () => {
  const device = makeStay({
    hospitals: [{ id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 9', jibunAddress: '테스트동 1', lat: 37.52, lng: 127.02, source: 'DEMO' }, phone: '02-000-0000', linkedPlanId: 'demo-plan' }],
    periods: [selfPeriod(), hospitalPeriod()],
    linkedPlans: [{ code: 'DEMO-A', hospitalId: 'H1', plan: { planId: 'demo-plan' }, fetchedAt: '2026-10-01T10:00:00+09:00', acknowledged: {} }],
    guardianShare: { lastSentAt: '2026-10-01T10:00:00+09:00', planFingerprint: 'a'.repeat(64) },
  });

  test('허용 목록의 키만 남고 좌표는 최상위로 옮긴다', () => {
    const ps = toPlanStay(deepFreeze(clone(device)));
    assert.deepEqual(Object.keys(ps).sort(), ['appointments', 'arrival', 'consent', 'departure', 'hasCompanion', 'hospitals', 'interests', 'lodgings', 'pace', 'periods']);
    assert.deepEqual(ps.lodgings[0], { id: 'L1', lat: 37.5, lng: 127.03, checkIn: '2026-10-01', checkOut: '2026-10-05' });
    assert.deepEqual(ps.hospitals[0], { id: 'H1', lat: 37.52, lng: 127.02 });
    assert.deepEqual(Object.keys(ps.appointments[0]).sort(), ['date', 'hospitalId', 'id', 'start', 'type']);
    assert.deepEqual(ps.consent, { sensitive: true });
    const hosp = ps.periods.find((p) => p.source === 'HOSPITAL');
    assert.deepEqual(Object.keys(hosp).sort(), ['endDate', 'expiresAt', 'id', 'items', 'revoked', 'source', 'startDate']);
  });

  test('직렬화한 본문에 이름·주소·전화·코드·보호자 공유 기록이 없다', () => {
    const text = JSON.stringify(toPlanStay(device));
    for (const secret of ['테스트 숙소', '테스트 병원', '테스트로', '테스트동', '02-000-0000', 'DEMO-A', 'demo-plan', 'aaaaaaaa', 'consent-v1', 'roadAddress', 'name', 'phone']) {
      assert.equal(text.includes(secret), false, `본문에 ${secret} 가 있다`);
    }
  });

  test('동의가 없으면 sensitive=false', () => {
    assert.deepEqual(toPlanStay(makeStay({ consent: { sensitive: null } })).consent, { sensitive: false });
  });
});

// ── 영향 날짜 (docs/platform/ITINERARY_RULES.md '변화 원천' 표의 1·2번 행, docs/business-rules.md '전체 일정 확정과 변화 대응'의 재계획 규칙 2~4) ─────────────────────────

describe('영향 날짜 — 체류 변경 종류마다 영향받는 날짜만', () => {
  // makeStay: 10-01~10-08, L1 10-01~10-05, L2 10-05~10-08, A1 VISIT 10-02, A2 PROCEDURE 10-03 → 경계일 10-03
  const base = () => makeStay();
  const diff = (a, b) => diffStay(a, b);

  test('바뀐 것이 없거나 표시 값(이름·주소 글자·전화·연동 사본·보호자 공유·수정 시각)만 바뀌면 재계획하지 않는다', () => {
    const a = base();
    const b = clone(a);
    b.lodgings[0].name = '다른 이름';
    b.lodgings[0].address.roadAddress = '다른 길 2';
    b.hospitals[0].phone = '02-111-1111';
    b.hospitals[0].name = '다른 병원 이름';
    b.guardianShare = { lastSentAt: '2026-10-02T10:00:00+09:00', planFingerprint: 'b'.repeat(64) };
    b.linkedPlans = [];
    b.updatedAt = '2026-10-02T10:00:00+09:00';
    assert.deepEqual(diff(a, b).dates, []);
    assert.deepEqual(diff(a, clone(a)).dates, []);
  });

  test('입국 시각·공항 → 입국일만', () => {
    const b = base();
    b.arrival = { ...b.arrival, time: '14:00' };
    assert.deepEqual(diff(base(), b).dates, ['2026-10-01']);
    const c = base();
    c.departure = { ...c.departure, airport: 'ICN' };
    assert.deepEqual(diff(base(), c).dates, ['2026-10-08']);
  });

  test('출국일을 늘리면 새 날짜와 예전 출국일, 줄이면 빠진 날짜를 따로 알린다', () => {
    const longer = base();
    longer.departure = { ...longer.departure, date: '2026-10-10' };
    longer.lodgings[1].checkOut = '2026-10-10';
    assert.deepEqual(diff(base(), longer).dates, ['2026-10-08', '2026-10-09', '2026-10-10']);
    assert.deepEqual(diff(base(), longer).removedDates, []);

    const shorter = base();
    shorter.departure = { ...shorter.departure, date: '2026-10-07' };
    const d = diff(base(), shorter);
    assert.deepEqual(d.removedDates, ['2026-10-08']);
    assert.deepEqual(d.dates, ['2026-10-07']); // 새 출국일(전날 밤 숙소·출국 마감)
  });

  test('숙소 구간 날짜를 바꾸면 그 숙소가 달라진 날짜만', () => {
    const b = base();
    b.lodgings[0].checkOut = '2026-10-04';
    b.lodgings[1].checkIn = '2026-10-04';
    assert.deepEqual(diff(base(), b).dates, ['2026-10-04']);
  });

  test('숙소 좌표를 바꾸면 그 숙소를 쓰는 날짜만(출국일은 전날 밤 숙소)', () => {
    const b = base();
    b.lodgings[1].address = { ...b.lodgings[1].address, lat: 37.53 };
    assert.deepEqual(diff(base(), b).dates, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  });

  test('병원 좌표 → 그 병원 일정이 있는 날짜와 그 병원으로 복귀하는 기간의 날짜', () => {
    const b = base();
    b.hospitals[0].address = { ...b.hospitals[0].address, lng: 127.05 };
    assert.deepEqual(diff(base(), b).dates, ['2026-10-02', '2026-10-03']);

    const withReturn = makeStay({
      periods: [selfPeriod({ id: 'P-R', startDate: '2026-10-05', endDate: '2026-10-06', items: { returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL', hospitalId: 'H1' } } })],
    });
    const moved = clone(withReturn);
    moved.hospitals[0].address.lat = 37.55;
    assert.deepEqual(diff(withReturn, moved).dates, ['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']);
  });

  test('병원 일정: 시각을 바꾸면 그 날짜, 날짜를 옮기면 예전·새 날짜', () => {
    const b = base();
    b.appointments[0].start = '15:00';
    assert.deepEqual(diff(base(), b).dates, ['2026-10-02']);
    const c = base();
    c.appointments[0].date = '2026-10-06';
    assert.deepEqual(diff(base(), c).dates, ['2026-10-02', '2026-10-06']);
    const d = base();
    d.appointments.push({ id: 'A3', hospitalId: 'H1', type: 'VISIT', date: '2026-10-07', start: '11:00', end: '12:00', source: 'USER' });
    assert.deepEqual(diff(base(), d).dates, ['2026-10-07']);
  });

  test('수술 후 경계일이 바뀌면 경계 사이 날짜의 분류가 바뀐다', () => {
    const b = base();
    b.appointments[1].date = '2026-10-05'; // 경계일 10-03 → 10-05
    assert.deepEqual(diff(base(), b).dates, ['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  test('본인 체크 기간 추가·수정·삭제 → 덮는 날짜(전·후 범위의 합)', () => {
    const withP = makeStay({ periods: [selfPeriod({ startDate: '2026-10-04', endDate: '2026-10-05' })] });
    assert.deepEqual(diff(base(), withP).dates, ['2026-10-04', '2026-10-05']);
    const edited = clone(withP);
    edited.periods[0].items.walkLimit = { kind: 'SET', value: 20 };
    assert.deepEqual(diff(withP, edited).dates, ['2026-10-04', '2026-10-05']);
    const widened = clone(withP);
    widened.periods[0].endDate = '2026-10-07';
    assert.deepEqual(diff(withP, widened).dates, ['2026-10-06', '2026-10-07']);
    assert.deepEqual(diff(withP, base()).dates, ['2026-10-04', '2026-10-05']);
  });

  test('병원 기간(HOSPITAL) 철회·만료 변경 → 그 기간의 날짜', () => {
    const a = makeStay({ periods: [hospitalPeriod({ startDate: '2026-10-05', endDate: '2026-10-06' })] });
    const revoked = clone(a);
    revoked.periods[0].revoked = true;
    assert.deepEqual(diff(a, revoked).dates, ['2026-10-05', '2026-10-06']);
    const expired = clone(a);
    expired.periods[0].expiresAt = '2026-10-05T12:00:00+09:00';
    assert.deepEqual(diff(a, expired).dates, ['2026-10-05', '2026-10-06']);
    const bumped = clone(a);
    bumped.periods[0].planVersion = 7; // 판정에 쓰지 않는 값
    assert.deepEqual(diff(a, bumped).dates, []);
  });

  test('동반 보호자·관심사·강도 → 모든 날짜, 보호자 켜짐·꺼짐 표시', () => {
    const all = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
    const off = makeStay({ hasCompanion: false });
    const on = diff(off, base());
    assert.deepEqual(on.dates, all);
    assert.equal(on.companionTurnedOn, true);
    assert.equal(on.companionTurnedOff, false);
    assert.equal(diff(base(), off).companionTurnedOff, true);
    const b = base();
    b.pace = 'NORMAL';
    assert.deepEqual(diff(base(), b).dates, all);
    const c = base();
    c.interests = ['FOOD'];
    assert.deepEqual(diff(base(), c).dates, all);
    assert.equal(diff(base(), c).companionTurnedOn, false);
  });

  test('동의 철회 → 기간이 덮던 날짜와 경계일 이후 날짜, 철회 표시', () => {
    const a = makeStay({ periods: [selfPeriod({ startDate: '2026-10-01', endDate: '2026-10-01' })] });
    const withdrawn = { ...clone(a), periods: [], linkedPlans: [], consent: { sensitive: null } };
    const d = diff(a, withdrawn);
    assert.equal(d.consentWithdrawn, true);
    // 10-01(기간이 덮던 경계일 전 날짜) + 경계일(10-03) 이후. 10-02 는 경계일 전 빈 날짜라 그대로 FREE
    assert.deepEqual(d.dates, ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  });

  test('이전 체류가 없으면(처음 저장) 모든 날짜', () => {
    const d = diffStay(null, base());
    assert.equal(d.dates.length, 8);
  });
});

// ── 요청 모양 (docs/contracts.md '`POST /api/itinerary/plan`', docs/business-rules.md '하루 일정 생성', docs/platform/ITINERARY_RULES.md '데모 사건') ───────────────────────────────────

describe('일정 요청 — previous·edits·usedContentIds·events', () => {
  const tripPlan = {
    engineVersion: '2.0.0',
    generatedAt: '2026-10-01T09:00:00+09:00',
    lang: 'en',
    days: { '2026-10-02': day('2026-10-02'), '2026-10-03': day('2026-10-03', { stops: [stop('2026-10-03', 5010, '10:30', '11:15')] }), '2026-10-04': day('2026-10-04', { stops: [stop('2026-10-04', 5020, '10:30', '11:15')] }) },
    edits: { '2026-10-04': { pinned: ['5020'], deleted: [], clearedMeals: [] } },
  };

  test('요청 날짜만 previous, 나머지 날짜의 배치는 usedContentIds, 편집 기록은 전체', () => {
    const body = buildPlanBody({ stay: makeStay(), tripPlan, dates: ['2026-10-03'], lang: 'en', today: '2026-10-02', events: [], nowIso: '2026-10-02T00:00:00.000Z' });
    assert.deepEqual(Object.keys(body.previous), ['2026-10-03']);
    assert.deepEqual(body.dates, ['2026-10-03']);
    assert.deepEqual(body.usedContentIds.sort(), ['5001', '5002', '5020']);
    assert.deepEqual(body.edits, tripPlan.edits);
    assert.equal('events' in body, false, '오늘이 요청에 없으면 사건을 싣지 않는다');
    assert.equal(body.lang, 'en');
    assert.equal(body.now, '2026-10-02T00:00:00.000Z');
    assert.equal(body.stay.lodgings[0].name, undefined);
  });

  test('오늘을 재계획하면 저장된 사건 전체를 정규화해 싣는다(규칙 55)', () => {
    const events = [{ type: 'TRAFFIC_SURGE', extraMin: 30 }, { type: 'BOGUS' }, { type: 'CLOSURE', closedIds: ['5001', 'x'] }, { type: 'PATIENT_RECALL', note: '버린다' }];
    const body = buildPlanBody({ stay: makeStay(), tripPlan, dates: ['2026-10-02', '2026-10-03'], lang: 'ko', today: '2026-10-02', events, nowIso: 'x' });
    assert.deepEqual(body.events, [{ type: 'TRAFFIC_SURGE', extraMin: 30 }, { type: 'CLOSURE', closedIds: ['5001'] }, { type: 'PATIENT_RECALL' }]);
  });

  test('사건 정규화 — 모르는 유형·빈 매개변수는 버리고 범위 밖 숫자는 범위로 자른다', () => {
    assert.deepEqual(
      normalizeTodayEvents([
        { type: 'TRAFFIC_SURGE', extraMin: 500 },
        { type: 'TRAFFIC_SURGE', extraMin: 1 },
        { type: 'APPOINTMENT', deltaMin: -999 },
        { type: 'APPOINTMENT', deltaMin: 'abc' },
        { type: 'CLOSURE', closedIds: [] },
        { type: 'WEATHER' },
        { type: 'RISK_SIGNAL', extra: 1 },
        null,
      ]),
      [{ type: 'TRAFFIC_SURGE', extraMin: 120 }, { type: 'TRAFFIC_SURGE', extraMin: 5 }, { type: 'APPOINTMENT', deltaMin: -240 }, { type: 'WEATHER' }, { type: 'RISK_SIGNAL' }],
    );
  });

  test('날짜를 주지 않으면(처음 생성) dates·previous 없이 체류 전체', () => {
    const body = buildPlanBody({ stay: makeStay(), tripPlan: null, lang: 'en', today: '2026-09-20', events: [], nowIso: 'x' });
    assert.equal('dates' in body, false);
    assert.equal('previous' in body, false);
    assert.deepEqual(body.edits, {});
    assert.deepEqual(body.usedContentIds, []);
  });

  test('표시만 다시 쓰기: relabelOnly + 저장된 날짜만 previous, 편집·사건 없음(규칙 51)', () => {
    const body = buildRelabelBody({ stay: makeStay(), tripPlan, dates: ['2026-10-03', '2026-10-04'], lang: 'ja', nowIso: 'x' });
    assert.equal(body.relabelOnly, true);
    assert.equal(body.lang, 'ja');
    assert.deepEqual(Object.keys(body.previous), ['2026-10-03', '2026-10-04']);
    assert.equal('edits' in body, false);
    assert.equal('events' in body, false);
  });

  test('교체 후보 요청: 그 날짜의 하루·편집 기록, 다른 날짜의 배치', () => {
    const body = buildAlternativesBody({ stay: makeStay(), tripPlan, date: '2026-10-04', outingId: '2026-10-04:P:outing-1', stopId: '2026-10-04:P:5020', lang: 'en', today: '2026-10-02', events: [{ type: 'WEATHER' }], nowIso: 'x' });
    assert.equal(body.day, tripPlan.days['2026-10-04']);
    assert.deepEqual(body.edits, { '2026-10-04': tripPlan.edits['2026-10-04'] });
    assert.deepEqual(body.usedContentIds.sort(), ['5001', '5002', '5010']);
    assert.equal('events' in body, false);
  });

  test('usedContentIds 는 숫자 contentId 만, 중복 없이', () => {
    const days = { a: { date: 'a', outings: [{ stops: [{ contentId: '1' }, { contentId: 'x1' }] }], guardianOutings: [{ stops: [{ contentId: '1' }] }] } };
    assert.deepEqual(usedContentIdsOutside(days, []), ['1']);
  });
});

// ── 편집 기록 (docs/business-rules.md '사용자 편집', edits 저장은 docs/security.md '기기 저장소와 계정 이름공간') ───────────────────────────────────

describe('편집 기록', () => {
  test('교체: 새 장소는 고정, 옛 장소는 삭제. 입력은 바꾸지 않는다', () => {
    const edits = deepFreeze({ '2026-10-04': { pinned: ['7'], deleted: ['9'], clearedMeals: [] } });
    const next = withSwap(edits, '2026-10-04', { fromContentId: '7', toContentId: '9' });
    assert.deepEqual(next['2026-10-04'], { pinned: ['9'], deleted: ['7'], clearedMeals: [] });
    assert.deepEqual(withSwap({}, '2026-10-05', { fromContentId: '1', toContentId: '2' }), { '2026-10-05': { pinned: ['2'], deleted: ['1'], clearedMeals: [] } });
  });

  test('삭제: 식사 정거장이면 그 칸을 비움으로 남긴다', () => {
    assert.deepEqual(withDelete({}, '2026-10-04', { contentId: '5', slot: 'LUNCH' }), { '2026-10-04': { pinned: [], deleted: ['5'], clearedMeals: ['LUNCH'] } });
    assert.deepEqual(withDelete({ '2026-10-04': { pinned: ['5'] } }, '2026-10-04', { contentId: '5' }), { '2026-10-04': { pinned: [], deleted: ['5'], clearedMeals: [] } });
  });

  test('식사 칸 비움 · 다시 만들기(범위의 기록 삭제)', () => {
    assert.deepEqual(withClearedMeal({}, '2026-10-04', 'DINNER'), { '2026-10-04': { pinned: [], deleted: [], clearedMeals: ['DINNER'] } });
    assert.throws(() => withClearedMeal({}, '2026-10-04', 'BRUNCH'), RangeError);
    const edits = { a: { pinned: ['1'] }, b: { deleted: ['2'] }, c: { clearedMeals: ['LUNCH'] } };
    assert.deepEqual(withoutDates(edits, ['a', 'c']), { b: { deleted: ['2'] } });
  });
});

// ── 오늘 게이트 덧씌우기 (docs/business-rules.md '매일 확인'·'전체 일정 확정과 변화 대응'·'사용자 편집') ──────────────────────

describe('오늘 표시 — 저장된 일정은 그대로, 표시할 때만 덧씌운다', () => {
  const today = '2026-10-05';
  const stayWithSelf = makeStay({ periods: [selfPeriod({ startDate: '2026-10-04', endDate: '2026-10-06' })] });
  const tripPlan = deepFreeze({ engineVersion: '2.0.0', generatedAt: 'x', lang: 'en', days: { [today]: day(today) }, edits: {} });

  test('매일 확인 전: STANDBY + DAILY_CHECK_PENDING, 이동 동작 비활성. 저장값은 바뀌지 않는다(규칙 49)', () => {
    const before = JSON.stringify(tripPlan);
    const view = selectTodayView({ tripPlan, stay: stayWithSelf, prefs: { dailyCheck: {} }, today });
    assert.equal(view.gates.dailyCheckPending, true);
    assert.equal(view.day.dayState, 'STANDBY');
    assert.equal(view.day.reasons[0], 'DAILY_CHECK_PENDING');
    assert.equal(view.day.todayGate.actionsDisabled, true);
    assert.ok(view.day.outings.every((o) => o.actionable === false));
    assert.equal(view.stored, tripPlan.days[today]);
    assert.equal(tripPlan.days[today].dayState, 'TOGETHER');
    assert.equal(JSON.stringify(tripPlan), before);
  });

  test('확인 뒤에는 덧씌우기만 사라진다 — 저장된 하루 그대로', () => {
    const view = selectTodayView({ tripPlan, stay: stayWithSelf, prefs: { dailyCheck: { [today]: 'CONFIRMED' } }, today });
    assert.equal(view.gates.dailyCheckPending, false);
    assert.equal(view.day, tripPlan.days[today]);
  });

  test('확인하지 않은 병원 중요 안내가 있으면 PLAN_UNCONFIRMED_UPDATE', () => {
    const linked = makeStay({
      linkedPlans: [
        {
          code: 'DEMO-A',
          hospitalId: 'H1',
          fetchedAt: '2026-10-01T10:00:00+09:00',
          plan: { instructions: [{ id: 'act-1', category: 'activity', text: 'x', lang: 'ko', updatedAt: '2026-10-01T09:00:00+09:00' }] },
          acknowledged: {},
        },
      ],
    });
    const view = selectTodayView({ tripPlan, stay: linked, prefs: { dailyCheck: {} }, today });
    assert.equal(view.gates.unconfirmedHospitalUpdate, true);
    assert.ok(view.day.reasons.includes('PLAN_UNCONFIRMED_UPDATE'));
    const acked = clone(linked);
    acked.linkedPlans[0].acknowledged = { 'act-1@2026-10-01T09:00:00+09:00': true };
    assert.equal(selectTodayView({ tripPlan, stay: acked, prefs: {}, today }).gates.unconfirmedHospitalUpdate, false);
  });

  test('오늘 일정이 없으면 day 는 null', () => {
    const view = selectTodayView({ tripPlan: null, stay: stayWithSelf, prefs: {}, today });
    assert.equal(view.day, null);
    assert.equal(view.stored, null);
  });
});

// ── 즉시 복귀 판단 (docs/platform/IA_AND_FLOWS.md '즉시 복귀') ─────────────────────────────────

describe('외출 중 지침 철회·만료', () => {
  const date = '2026-10-05';
  const used = day(date, {
    extra: { effective: { outing: { value: 'ALLOWED', provenance: [{ periodId: 'PLAN-X:P1', source: 'HOSPITAL', defaulted: false }] } } },
  });
  const periods = (o) => [{ id: 'PLAN-X:P1', source: 'HOSPITAL', startDate: '2026-10-04', endDate: '2026-10-06', planId: 'PLAN-X', expiresAt: '2026-10-20T00:00:00+09:00', revoked: false, ...o }];

  test('외출 중인가 — 출발했고 아직 돌아오지 않음', () => {
    assert.equal(outingInProgress(used, 10 * 60), false);
    assert.equal(outingInProgress(used, 10 * 60 + 20), true);
    assert.equal(outingInProgress(used, 13 * 60 + 10), false);
  });

  test('그 지침의 기간을 쓴 오늘 외출 중에 철회·만료되면 원인을 준다', () => {
    const args = { day: used, today: date, nowMin: 11 * 60, planId: 'PLAN-X' };
    assert.equal(immediateReturnCauseFor({ ...args, periods: periods({ revoked: true }) }), 'PLAN_REVOKED');
    assert.equal(immediateReturnCauseFor({ ...args, periods: periods({ expiresAt: '2026-10-05T10:00:00+09:00' }) }), 'PLAN_EXPIRED');
    assert.equal(immediateReturnCauseFor({ ...args, periods: periods() }), null);
    assert.equal(immediateReturnCauseFor({ ...args, nowMin: 9 * 60, periods: periods({ revoked: true }) }), null, '외출 전');
    assert.equal(immediateReturnCauseFor({ ...args, planId: 'OTHER', periods: periods({ revoked: true }) }), null, '다른 지침');
    assert.equal(immediateReturnCauseFor({ ...args, day: { ...used, returnNow: true }, periods: periods({ revoked: true }) }), null, '이미 복귀 중');
  });
});

// ── 동의 철회: 오프라인 대비 (docs/platform/IA_AND_FLOWS.md '동의 철회와 데이터 삭제') ────────────────────────────────

describe('동의 철회를 재계획하지 못했을 때 기기에서 먼저 지운다', () => {
  test('조건에서 나온 값(적용 조건·식이 표시·복약 블록·조건 경고·제외 목록·조건 사유)을 지운다. 정거장·시각은 그대로', () => {
    const d = deepFreeze(day('2026-10-02', { reasons: ['FASTING_REQUIRED', 'NO_CANDIDATE'] }));
    const s = stripConditionData(d);
    assert.deepEqual(s.effective, {});
    assert.deepEqual(s.blocks, [{ kind: 'APPOINTMENT', start: '15:00', end: '17:00', appointmentId: 'A9' }]);
    assert.deepEqual(s.warnings, ['TRAVEL_TIMES_ESTIMATED']);
    assert.deepEqual(s.excluded, []);
    assert.deepEqual(s.reasons, ['NO_CANDIDATE']);
    assert.deepEqual(s.mealSlots[1].reasons, []);
    assert.ok(s.outings[0].stops.every((x) => !x.labels.includes('DIET_ESTIMATED') && !x.labels.includes('ORDER_CARD')));
    assert.equal(s.outings[0].stops[0].arriveAt, '10:30');
  });

  test('앞으로의 NEEDS_INPUT 날짜는 외출을 비우고, 지난 날짜는 조건 값만 지운다. 오늘 시작된 정거장은 남긴다', () => {
    // 경계일 10-03. 동의 철회 → 10-03 이후는 NEEDS_INPUT(SENSITIVE_CONSENT_REQUIRED)
    const stay = makeStay({ consent: { sensitive: null }, periods: [] });
    const tripPlan = deepFreeze({
      engineVersion: '2.0.0',
      generatedAt: 'x',
      lang: 'en',
      days: { '2026-10-01': day('2026-10-01'), '2026-10-02': day('2026-10-02', { coverage: 'FREE' }), '2026-10-04': day('2026-10-04'), '2026-10-05': day('2026-10-05') },
      edits: {},
    });
    const days = markConsentWithdrawnLocally({ tripPlan, stay, dates: ['2026-10-04', '2026-10-05'], today: '2026-10-04', nowMin: 11 * 60 });
    const future = days['2026-10-05'];
    assert.equal(future.coverage, 'NEEDS_INPUT');
    assert.equal(future.dayState, 'NO_TOURISM');
    assert.deepEqual(future.reasons, ['SENSITIVE_CONSENT_REQUIRED']);
    assert.deepEqual(future.outings, []);
    assert.deepEqual(future.effective, {});
    assert.equal(JSON.stringify(future).includes('MEDICATION'), false);
    const todayDay = days['2026-10-04'];
    assert.equal(todayDay.coverage, 'NEEDS_INPUT');
    assert.deepEqual(stopsOfDay(todayDay).map((s) => s.contentId), ['5001'], '도착한 정거장은 남는다');
    assert.deepEqual(days['2026-10-01'].effective, {}, '지난 날짜에도 조건 값이 남지 않는다');
    assert.equal(days['2026-10-01'].outings[0].stops.length, 2, '지난 날짜의 정거장은 그대로');
    assert.equal(days['2026-10-02'].coverage, 'FREE');
    for (const d of Object.values(days)) {
      const text = JSON.stringify(d);
      assert.equal(text.includes('DIET_ESTIMATED') || text.includes('MEDICATION_TIMES_MISSING') || text.includes('"walkLimit"'), false);
    }
  });

  // findings 12: 이동 중에 비운 정거장 0개 외출(findings 10)로 즉시 복귀가 켜진 뒤 동의를 철회한 오늘
  function overdueTransitPlan() {
    const base = day('2026-10-04', { reasons: ['OUTING_OVERDUE', 'APPOINTMENT_DELAYED'], extra: { returnNow: true } });
    const transit = {
      ...base.outings[0],
      id: '2026-10-04:P:outing-1',
      departAt: '10:15',
      returnBy: '10:15',
      returnPlace: 'HOSPITAL',
      deadlineReason: 'APPOINTMENT',
      latestDepartureAt: '10:15',
      slackMin: -38,
      plannedReturnAt: '10:53',
      stops: [],
    };
    const later = { ...base.outings[0], id: '2026-10-04:P:outing-2', departAt: '15:00', returnBy: '18:00', slackMin: 20, stops: [stop('2026-10-04', 5009, '15:20', '16:00')] };
    return deepFreeze({
      engineVersion: '2.0.0',
      generatedAt: 'x',
      lang: 'en',
      days: { '2026-10-04': { ...base, outings: [transit, later], mealSlots: base.mealSlots.map((m) => ({ ...m, status: 'NOT_APPLICABLE', stopId: undefined })) } },
      edits: {},
    });
  }

  test('동의 철회 오늘 하루: 이미 출발한 정거장 0개 외출은 복귀 장소·마감·여유·id 와 함께 남아 시트가 그 병원을 찾는다', () => {
    const stay = makeStay({
      consent: { sensitive: null },
      appointments: [{ id: 'A4', hospitalId: 'H1', type: 'VISIT', date: '2026-10-04', start: '10:40', source: 'USER' }],
    });
    const days = markConsentWithdrawnLocally({ tripPlan: overdueTransitPlan(), stay, dates: ['2026-10-04'], today: '2026-10-04', nowMin: 10 * 60 + 22 });
    const t = days['2026-10-04'];
    assert.equal(t.coverage, 'NEEDS_INPUT');
    assert.equal(t.returnNow, true);
    assert.ok(t.reasons.includes('OUTING_OVERDUE'), '즉시 복귀 원인은 남는다');
    assert.equal(t.outings.length, 1, '출발하지 않은 15:00 외출은 빠진다');
    const [kept] = t.outings;
    assert.equal(kept.id, '2026-10-04:P:outing-1');
    assert.deepEqual(kept.stops, []);
    assert.equal(kept.returnPlace, 'HOSPITAL');
    assert.equal(kept.returnBy, '10:15');
    assert.equal(kept.slackMin, -38);
    assert.equal(t.dayState, 'TOGETHER', '환자는 밖에 있다');
    assert.equal(overdueOutingOf(t)?.id, kept.id, '시트가 여유가 음수인 외출을 찾는다');
    assert.deepEqual(returnTargetOf({ day: t, stay, outing: overdueOutingOf(t) }).kind, 'HOSPITAL', '숙소가 아니라 병원을 가리킨다');
  });

  test('동의 철회 오늘 하루: 아직 출발하지 않은 정거장 0개 외출은 여전히 빠진다', () => {
    const stay = makeStay({ consent: { sensitive: null }, periods: [] });
    const days = markConsentWithdrawnLocally({ tripPlan: overdueTransitPlan(), stay, dates: ['2026-10-04'], today: '2026-10-04', nowMin: 10 * 60 });
    assert.deepEqual(days['2026-10-04'].outings, []);
    assert.equal(days['2026-10-04'].dayState, 'NO_TOURISM');
  });
});

function stopsOfDay(d) {
  return [...d.outings, ...d.guardianOutings].flatMap((o) => o.stops);
}

