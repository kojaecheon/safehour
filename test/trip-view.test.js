// AX-317 — 오늘·일정·장소 화면의 표시 모델 (순수 함수)
//
// 화면(app/today, app/trip, app/place)은 저장된 DayPlan 을 이 함수들로 바꿔 그린다.
// 판정을 새로 만들지 않는다 — 엔진이 만든 값을 고르고 늘어놓기만 한다. 이 파일이 고정하는 것:
//   - 하루 타임라인 항목: 블록·외출·정거장·식사 칸·복귀(예상 귀가 → 복귀 마감), 시각 순, 보호자 분리 (spec 4.7, 5.2)
//   - 보호자 탭 잠금 사유: 합성된 escortRequired / guardianMustStay 에서 읽는다 (spec 4.7 · 4.11)
//   - 전후 비교 요약: 대체·빠짐·들어옴·줄어듦·취소·새 마감, 장소 이름 찾기 (spec 4.9)
//   - 오늘 화면의 지금 외출·다음 정거장 (spec 4.6 · 4.7)
//   - 전체 일정 날짜 줄과 입력 필요 날짜의 고칠 곳 (spec 3.1 · 4.5)
//   - AI 소개 요청은 허용 목록(이름·유형·시각·관심사·강도)만 담고 캐시 키가 결정적이다 (spec 4.16 · 규칙 36)
//   - 장소 상세 요청은 Stop 형식이고 지도 링크 입력은 정거장뿐이다 (spec 6장 · 4.14 · 규칙 39)
//   - 편집 가능 여부: 지난 날짜·보기 전용·매일 확인 전 오늘은 막는다 (spec 4.10 · 규칙 32)
//   - 복귀 시트의 돌아갈 곳: 숙소·병원(hospitalId 로만)·정해 둔 장소, 첫 병원으로 추측하지 않는다 (마감 지남 설계서 4.2·4.3)

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEADLINE_REASON_KEY,
  canEditDay,
  dailyCheckSummary,
  deltaSummary,
  demoEventFor,
  findPlaceStop,
  guardianTabInfo,
  introCacheKey,
  introRequestFor,
  isDemoMode,
  needsInputFix,
  overdueOutingOf,
  placeDetailRequest,
  returnNoteKeyOf,
  returnPlaceOf,
  returnTargetOf,
  stopBadges,
  stopEditable,
  timelineEntries,
  todayFocus,
  tripDateRows,
} from '../components/trip/viewModel.js';
import { buildMapLinks } from '../lib/maps.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { AIRPORT_TRAVEL, SET, at, byLodging, tripPool, tripStay } from './trip-fixtures.js';

const DATE = '2026-10-05';

function stop(contentId, o = {}) {
  const role = o.role ?? 'P';
  return {
    id: `${DATE}:${role}:${contentId}`,
    candidateId: String(contentId),
    contentId: String(contentId),
    title: o.title ?? `장소 ${contentId}`,
    address: '서울 테스트로 1',
    lang: 'en',
    category: o.category ?? 'CULTURE',
    isMeal: o.isMeal ?? false,
    lat: 37.5,
    lng: 127.03,
    ko: { title: `장소 ${contentId}`, address: '서울 테스트로 1' },
    sourceIds: { ko: String(contentId), en: `${contentId}1`, barrierFree: '77' },
    contentTypeIds: { canonical: '14', ko: '14', en: '78' },
    arriveAt: o.arriveAt ?? '10:30',
    leaveAt: o.leaveAt ?? '11:15',
    stayMin: o.stayMin ?? 45,
    shortened: false,
    legIn: { min: 10, mode: 'TAXI', estimated: true },
    walkBurdenMin: 10,
    indoor: true,
    pinned: false,
    labels: o.labels ?? ['ESTIMATED'],
  };
}

function outing(id, o = {}) {
  return {
    id: `${DATE}:${o.role ?? 'P'}:${id}`,
    departAt: o.departAt ?? '10:00',
    returnBy: o.returnBy ?? '21:00',
    returnPlace: o.returnPlace ?? 'LODGING',
    deadlineReason: o.deadlineReason ?? 'DAY_END',
    latestDepartureAt: '18:00',
    slackMin: 60,
    walkTotalMin: 20,
    travelTotalMin: 20,
    plannedReturnAt: o.plannedReturnAt ?? '12:30',
    stops: o.stops ?? [],
  };
}

function day(o = {}) {
  return {
    date: DATE,
    coverage: 'RESTRICTED',
    dayState: 'TOGETHER',
    reasons: [],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'L1',
    transportMode: 'TAXI',
    effective: {},
    blocks: [],
    outings: [],
    guardianOutings: [],
    mealSlots: [
      { slot: 'LUNCH', status: 'NOT_APPLICABLE', reasons: [] },
      { slot: 'DINNER', status: 'NOT_APPLICABLE', reasons: [] },
    ],
    excluded: [],
    warnings: [],
    returnNow: false,
    ...o,
  };
}

const STAY = {
  hasCompanion: true,
  interests: ['CAFE', 'PALACE_HISTORY'],
  pace: 'RELAXED',
  arrival: { date: '2026-10-04', time: '10:00', airport: 'ICN' },
  departure: { date: '2026-10-07', time: '18:00', airport: 'ICN' },
  lodgings: [{ id: 'L1', name: '데모 숙소', address: { roadAddress: '데모 주소', lat: 37.5, lng: 127.03 }, checkIn: '2026-10-04', checkOut: '2026-10-07' }],
  hospitals: [{ id: 'H1', name: '데모 의원', address: { roadAddress: '데모 병원 주소', lat: 37.52, lng: 127.03 } }],
  appointments: [{ id: 'A1', hospitalId: 'H1', type: 'VISIT', date: DATE, start: '15:00', source: 'USER' }],
  periods: [],
  linkedPlans: [],
};

const eff = (value, source = 'SELF', defaulted = false) => ({ value, provenance: [{ periodId: 'P1', source, defaulted }] });

describe('timelineEntries — 하루 타임라인 항목 (spec 4.7 · 5.2)', () => {
  const lunch = stop('5001', { isMeal: true, category: 'FOOD', arriveAt: '11:30', leaveAt: '12:15' });
  const museum = stop('5002', { arriveAt: '10:30', leaveAt: '11:15' });
  const d = day({
    blocks: [{ kind: 'APPOINTMENT', start: '14:20', end: '16:40', appointmentId: 'A1' }, { kind: 'MEDICATION', start: '19:00', end: '19:15' }],
    outings: [
      outing('outing-1', { departAt: '10:10', plannedReturnAt: '12:30', returnBy: '14:20', deadlineReason: 'APPOINTMENT', stops: [museum, lunch] }),
    ],
    mealSlots: [
      { slot: 'LUNCH', status: 'FILLED', stopId: lunch.id, reasons: [] },
      { slot: 'DINNER', status: 'NONE_AVAILABLE', reasons: ['MENU_UNKNOWN'] },
    ],
  });

  test('블록·외출·정거장·식사 칸이 시각 순이고, 외출은 출발 → 정거장 → 복귀 순이다', () => {
    const entries = timelineEntries(d, { role: 'P', stay: STAY });
    assert.deepEqual(
      entries.map((e) => [e.kind, e.time]),
      [
        ['depart', '10:10'],
        ['stop', '10:30'],
        ['meal', '11:30'],
        ['return', '12:30'],
        ['appointment', '14:20'],
        ['meal', '17:30'],
        ['medication', '19:00'],
      ],
    );
  });

  test('복귀 항목은 예상 귀가를 시각으로, 복귀 마감을 끝 시각으로 둔다 — 마감 이유를 함께 준다', () => {
    const ret = timelineEntries(d, { role: 'P', stay: STAY }).find((e) => e.kind === 'return');
    assert.equal(ret.time, '12:30');
    assert.equal(ret.endTime, '14:20');
    assert.equal(ret.returnBy, '14:20');
    assert.equal(ret.plannedReturnAt, '12:30');
    assert.equal(ret.deadlineReason, 'APPOINTMENT');
    assert.deepEqual(ret.place, { kind: 'LODGING', name: '데모 숙소' });
  });

  test('예상 귀가가 없으면 복귀 마감만 시각으로 쓴다', () => {
    const o = { ...outing('o', { stops: [museum] }), plannedReturnAt: undefined };
    const ret = timelineEntries(day({ outings: [o] }), { role: 'P' }).find((e) => e.kind === 'return');
    assert.equal(ret.time, '21:00');
    assert.equal(ret.endTime, undefined);
  });

  test('식사 칸을 채운 식당은 meal 항목이고 식사 칸 이름을 단다. 비었거나 없는 칸은 사유와 함께 따로 선다', () => {
    const entries = timelineEntries(d, { role: 'P', stay: STAY });
    const filled = entries.find((e) => e.kind === 'meal' && e.stop);
    assert.equal(filled.slot, 'LUNCH');
    assert.equal(filled.status, 'FILLED');
    assert.equal(filled.stop.id, lunch.id);
    const empty = entries.find((e) => e.kind === 'meal' && !e.stop);
    assert.equal(empty.slot, 'DINNER');
    assert.equal(empty.status, 'NONE_AVAILABLE');
    assert.deepEqual(empty.reasons, ['MENU_UNKNOWN']);
    assert.equal(empty.endTime, '19:30');
  });

  test('사유 없는 NOT_APPLICABLE(그 시간에 외출 없음)은 칸을 세우지 않는다', () => {
    const entries = timelineEntries(day({ outings: [outing('o', { stops: [museum] })] }), { role: 'P' });
    assert.equal(entries.filter((e) => e.kind === 'meal').length, 0);
  });

  test('NOT_APPLICABLE 식사 칸도 사유와 함께 보인다(CLEARED 포함)', () => {
    const entries = timelineEntries(
      day({
        mealSlots: [
          { slot: 'LUNCH', status: 'CLEARED', reasons: [] },
          { slot: 'DINNER', status: 'NOT_APPLICABLE', reasons: ['FASTING_REQUIRED'] },
        ],
      }),
      { role: 'P' },
    );
    const meals = entries.filter((e) => e.kind === 'meal');
    assert.deepEqual(
      meals.map((m) => [m.slot, m.status, m.reasons]),
      [
        ['LUNCH', 'CLEARED', []],
        ['DINNER', 'NOT_APPLICABLE', ['FASTING_REQUIRED']],
      ],
    );
  });

  test('병원 일정 블록에는 병원 이름을 붙인다(같은 기기의 환자 화면)', () => {
    const appt = timelineEntries(d, { role: 'P', stay: STAY }).find((e) => e.kind === 'appointment');
    assert.equal(appt.endTime, '16:40');
    assert.deepEqual(appt.place, { kind: 'HOSPITAL', name: '데모 의원' });
  });

  test('정거장 항목은 이동 구간(추정)과 정거장 원본을 싣는다', () => {
    const s = timelineEntries(d, { role: 'P' }).find((e) => e.kind === 'stop');
    assert.deepEqual(s.leg, { min: 10, mode: 'TAXI', estimated: true });
    assert.equal(s.stop.id, museum.id);
    assert.equal(s.endTime, '11:15');
    assert.equal(s.outingId, d.outings[0].id);
  });

  test('보호자 탭은 보호자 외출만 — 환자 블록·식사 칸은 넣지 않는다', () => {
    const g = stop('6001', { role: 'G', arriveAt: '15:30', leaveAt: '16:10' });
    const dd = { ...d, guardianOutings: [outing('g-1', { role: 'G', departAt: '15:15', plannedReturnAt: '16:40', returnBy: '17:00', deadlineReason: 'PATIENT_SCHEDULE', stops: [g] })] };
    const entries = timelineEntries(dd, { role: 'G', stay: STAY });
    assert.deepEqual(
      entries.map((e) => e.kind),
      ['depart', 'stop', 'return'],
    );
    assert.equal(entries[2].deadlineReason, 'PATIENT_SCHEDULE');
  });

  test('환자 외출이 없는 날은 활동 시간 전체를 숙소 휴식으로 보인다', () => {
    const entries = timelineEntries(day({ dayState: 'NO_TOURISM', coverage: 'REST_DAY' }), { role: 'P' });
    const rest = entries.find((e) => e.kind === 'rest');
    assert.deepEqual([rest.time, rest.endTime], ['09:00', '21:00']);
  });

  test('일정이 없거나 창이 없으면(입력 필요) 휴식 항목도 없다', () => {
    assert.deepEqual(timelineEntries(null, { role: 'P' }), []);
    const entries = timelineEntries(day({ coverage: 'NEEDS_INPUT', window: null, mealSlots: [] }), { role: 'P' });
    assert.deepEqual(entries, []);
  });

  test('같은 시각이면 복귀가 다음 외출 출발보다 먼저다', () => {
    const a = outing('o1', { departAt: '10:00', plannedReturnAt: '12:22', returnBy: '15:00', stops: [stop('1', { arriveAt: '10:20', leaveAt: '11:00' })] });
    const b = outing('o2', { departAt: '12:22', plannedReturnAt: '14:00', returnBy: '15:00', stops: [stop('2', { arriveAt: '12:40', leaveAt: '13:20' })] });
    const kinds = timelineEntries(day({ outings: [b, a] }), { role: 'P' }).map((e) => `${e.kind}@${e.time}`);
    assert.deepEqual(kinds, ['depart@10:00', 'stop@10:20', 'return@12:22', 'depart@12:22', 'stop@12:40', 'return@14:00']);
  });

  test('오늘 게이트로 막힌 외출(actionable=false)은 항목에도 그대로 실린다', () => {
    const gated = day({ outings: [{ ...outing('o', { stops: [museum] }), actionable: false }] });
    const s = timelineEntries(gated, { role: 'P' }).find((e) => e.kind === 'stop');
    assert.equal(s.actionable, false);
  });

  test('실제 엔진 결과(두 외출, 둘 다 복귀 마감 21:00)도 외출끼리 섞이지 않는다', () => {
    const s = tripStay({ walkLimit: SET(30) }, { hasCompanion: false });
    const r = planTrip({ stay: s, candidatesByLodging: byLodging(tripPool('en')), airportTravel: AIRPORT_TRAVEL, lang: 'en', now: at('2026-09-30', '12:00') });
    const free = r.days['2026-10-01'];
    assert.equal(free.outings.length, 2, '고정 데이터가 두 외출을 만든다');
    const kinds = timelineEntries(free, { role: 'P', stay: s }).map((e) => e.kind);
    const firstReturn = kinds.indexOf('return');
    const secondDepart = kinds.lastIndexOf('depart');
    assert.ok(firstReturn < secondDepart, kinds.join(','));
    const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const times = timelineEntries(free, { role: 'P', stay: s }).map((e) => toMin(e.time));
    assert.deepEqual(times, [...times].sort((x, y) => x - y), '시각 열이 오름차순이다');
  });
});

describe('guardianTabInfo — 보호자 탭 잠금 사유 (spec 4.7 · 4.11)', () => {
  test('보호자 외출이 있으면 잠그지 않는다', () => {
    const info = guardianTabInfo(day({ guardianOutings: [outing('g', { role: 'G' })] }), STAY);
    assert.deepEqual([info.locked, info.reason], [false, null]);
  });

  test('합성 escortRequired=예 이면 잠금 + ESCORT_REQUIRED, 출처와 기본값 여부를 함께 준다', () => {
    const info = guardianTabInfo(day({ effective: { escortRequired: eff({ kind: 'SET', value: true }, 'SELF', true) } }), STAY);
    assert.equal(info.locked, true);
    assert.equal(info.reason, 'ESCORT_REQUIRED');
    assert.deepEqual(info.sources, ['SELF']);
    assert.equal(info.defaulted, true);
  });

  test('escortRequired 가 guardianMustStay 보다 먼저다', () => {
    const info = guardianTabInfo(
      day({ effective: { escortRequired: eff({ kind: 'SET', value: true }, 'HOSPITAL'), guardianMustStay: eff({ kind: 'SET', value: true }) } }),
      STAY,
    );
    assert.equal(info.reason, 'ESCORT_REQUIRED');
    assert.deepEqual(info.sources, ['HOSPITAL']);
  });

  test('곁을 지켜야 하면 잠금 + GUARDIAN_MUST_STAY', () => {
    const info = guardianTabInfo(day({ effective: { escortRequired: eff({ kind: 'NONE' }), guardianMustStay: eff({ kind: 'SET', value: true }) } }), STAY);
    assert.deepEqual([info.locked, info.reason], [true, 'GUARDIAN_MUST_STAY']);
  });

  test('동반 보호자가 없으면 NO_COMPANION (잠금 아님)', () => {
    const info = guardianTabInfo(day(), { ...STAY, hasCompanion: false });
    assert.deepEqual([info.locked, info.reason], [false, 'NO_COMPANION']);
  });

  test('자유일은 보호자가 환자와 함께 다닌다(WITH_PATIENT)', () => {
    assert.equal(guardianTabInfo(day({ coverage: 'FREE' }), STAY).reason, 'WITH_PATIENT');
    assert.equal(guardianTabInfo(day({ coverage: 'DECLARED_FREE' }), STAY).reason, 'WITH_PATIENT');
  });

  test('입력 필요 날짜는 NEEDS_INPUT, 그 밖은 NO_OUTING', () => {
    assert.equal(guardianTabInfo(day({ coverage: 'NEEDS_INPUT' }), STAY).reason, 'NEEDS_INPUT');
    assert.equal(guardianTabInfo(day({ effective: { escortRequired: eff({ kind: 'NONE' }) } }), STAY).reason, 'NO_OUTING');
    assert.equal(guardianTabInfo(null, STAY).reason, 'NO_OUTING');
  });
});

describe('deltaSummary — 전후 비교 요약 (spec 4.9)', () => {
  const kept = stop('5002');
  const incoming = stop('5009', { title: '새 장소' });
  const delta = {
    stateChanged: true,
    before: 'TOGETHER',
    after: 'STANDBY',
    removed: [`${DATE}:P:5003`],
    added: [`${DATE}:G:6009`],
    replaced: [{ from: `${DATE}:P:5001`, to: incoming.id }],
    shortened: [kept.id],
    cancelledOutings: [`${DATE}:P:outing-2`],
    newDeadlines: [{ outingId: `${DATE}:P:outing-1`, returnBy: '15:00' }],
    reasons: ['CLOSED'],
    hasVisibleChange: true,
    seen: false,
  };
  const d = day({
    outings: [outing('outing-1', { stops: [kept, incoming] })],
    guardianOutings: [outing('g', { role: 'G', stops: [stop('6009', { role: 'G', title: '보호자 장소' })] })],
    excluded: [
      { candidateId: '5001', title: '닫힌 장소', reasons: ['CLOSED'] },
      { candidateId: '5003', title: '빠진 장소', reasons: ['WEATHER_BLOCKED'] },
    ],
    delta,
  });

  test('줄마다 종류와 장소 이름(지금 일정 → 제외 목록 순으로 찾음)을 준다', () => {
    const s = deltaSummary(d);
    assert.equal(s.visible, true);
    assert.equal(s.unseen, true);
    assert.deepEqual(s.state, { before: 'TOGETHER', after: 'STANDBY' });
    assert.deepEqual(s.reasons, ['CLOSED']);
    const byKind = Object.fromEntries(s.rows.map((r) => [r.kind, r]));
    assert.equal(byKind.replaced.from.title, '닫힌 장소');
    assert.deepEqual(byKind.replaced.from.reasons, ['CLOSED']);
    assert.equal(byKind.replaced.to.title, '새 장소');
    assert.equal(byKind.removed.title, '빠진 장소');
    assert.deepEqual(byKind.removed.reasons, ['WEATHER_BLOCKED']);
    assert.equal(byKind.added.title, '보호자 장소');
    assert.equal(byKind.added.role, 'G');
    assert.equal(byKind.shortened.title, kept.title);
    assert.equal(byKind.cancelled.outingId, `${DATE}:P:outing-2`);
    assert.equal(byKind.deadline.returnBy, '15:00');
  });

  test('이름을 찾지 못하면 title 은 null — 지어내지 않는다', () => {
    const s = deltaSummary(day({ delta: { ...delta, removed: [`${DATE}:P:9999`], replaced: [], added: [], shortened: [], cancelledOutings: [], newDeadlines: [] } }));
    assert.equal(s.rows[0].title, null);
  });

  test('보이는 변화가 없거나 이미 봤으면 unseen=false', () => {
    assert.equal(deltaSummary(day({ delta: { ...delta, seen: true } })).unseen, false);
    assert.equal(deltaSummary(day({ delta: { ...delta, hasVisibleChange: false } })).unseen, false);
    assert.equal(deltaSummary(day()), null);
    assert.equal(deltaSummary(null), null);
  });

  test('상태가 그대로면 state 는 null', () => {
    assert.equal(deltaSummary(day({ delta: { ...delta, stateChanged: false } })).state, null);
  });
});

describe('todayFocus — 오늘 화면의 지금 외출과 다음 정거장', () => {
  const a = outing('o1', { departAt: '10:00', plannedReturnAt: '12:30', returnBy: '14:00', deadlineReason: 'RETURN_TIME', stops: [stop('1', { arriveAt: '10:20', leaveAt: '11:00' }), stop('2', { arriveAt: '11:30', leaveAt: '12:10' })] });
  const b = outing('o2', { departAt: '17:00', plannedReturnAt: '18:40', stops: [stop('3', { arriveAt: '17:20', leaveAt: '18:00' })] });
  const d = day({ outings: [a, b] });
  const at9 = 9 * 60;

  test('출발 전이면 다음 외출(NEXT)과 첫 정거장', () => {
    const f = todayFocus(d, at9);
    assert.equal(f.phase, 'NEXT');
    assert.equal(f.outing.id, a.id);
    assert.equal(f.stop.contentId, '1');
  });

  test('외출 중이면 OUT — 아직 떠나지 않은 정거장 중 첫 곳', () => {
    const f = todayFocus(d, 11 * 60 + 5);
    assert.equal(f.phase, 'OUT');
    assert.equal(f.stop.contentId, '2');
  });

  test('정거장에 머무는 중이면 그 정거장', () => {
    assert.equal(todayFocus(d, 10 * 60 + 30).stop.contentId, '1');
  });

  test('마지막 정거장을 떠난 뒤 예상 귀가 전이면 OUT 이고 정거장은 없다', () => {
    const f = todayFocus(d, 12 * 60 + 20);
    assert.equal(f.phase, 'OUT');
    assert.equal(f.stop, null);
  });

  test('모든 외출이 끝났으면 DONE, 외출이 없으면 null', () => {
    assert.equal(todayFocus(d, 19 * 60).phase, 'DONE');
    assert.equal(todayFocus(day(), at9), null);
    assert.equal(todayFocus(null, at9), null);
  });

  test('다음 병원 일정 블록을 함께 준다', () => {
    const f = todayFocus(day({ outings: [a], blocks: [{ kind: 'APPOINTMENT', start: '15:00', end: '16:30', appointmentId: 'A1' }] }), at9);
    assert.equal(f.nextAppointment.start, '15:00');
    assert.equal(todayFocus(day({ outings: [a], blocks: [{ kind: 'APPOINTMENT', start: '08:00', end: '08:30' }] }), at9).nextAppointment, null);
  });
});

describe('tripDateRows · needsInputFix — 전체 일정 날짜 줄 (spec 3.1 · 4.5)', () => {
  test('체류 날짜마다 한 줄 — 상태·분류·병원 일정·변경됨·정거장 수·오늘·지난 날', () => {
    const days = {
      '2026-10-04': day({ date: '2026-10-04', coverage: 'FREE', outings: [outing('o', { stops: [stop('1'), stop('2')] })] }),
      [DATE]: day({ delta: { hasVisibleChange: true, seen: false, removed: [], added: [], replaced: [], shortened: [], cancelledOutings: [], newDeadlines: [], reasons: [] } }),
      '2026-10-06': day({ date: '2026-10-06', coverage: 'NEEDS_INPUT', dayState: 'NO_TOURISM', reasons: ['CONDITION_INPUT_REQUIRED'], window: null }),
    };
    const rows = tripDateRows({ stay: STAY, days, today: DATE });
    assert.deepEqual(
      rows.map((r) => r.date),
      ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
    );
    const [first, today, needs, missing] = rows;
    assert.equal(first.isPast, true);
    assert.equal(first.stopCount, 2);
    assert.equal(first.coverage, 'FREE');
    assert.equal(today.isToday, true);
    assert.equal(today.hasAppointment, true, '체류의 병원 일정으로도 표시한다');
    assert.equal(today.changed, true);
    assert.deepEqual(needs.fix, { href: '/conditions', key: 'trip.fixConditions' });
    assert.equal(missing.day, null);
    assert.equal(missing.state, null);
  });

  test('입력 필요 사유별 고칠 곳', () => {
    const fix = (reasons) => needsInputFix(day({ coverage: 'NEEDS_INPUT', reasons }));
    assert.deepEqual(fix(['LODGING_REQUIRED']), { href: '/onboarding?edit=1&returnTo=%2Ftrip', key: 'trip.fixLodging' });
    assert.deepEqual(fix(['SENSITIVE_CONSENT_REQUIRED']), { href: '/conditions', key: 'trip.fixConsent' });
    assert.deepEqual(fix(['HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED']), { href: '/conditions', key: 'trip.fixExpired' });
    assert.deepEqual(fix(['CONDITION_INPUT_REQUIRED']), { href: '/conditions', key: 'trip.fixConditions' });
    assert.equal(needsInputFix(day()), null);
    assert.equal(needsInputFix(null), null);
  });

  test('체류가 없거나 날짜가 틀리면 빈 목록', () => {
    assert.deepEqual(tripDateRows({ stay: null, days: {}, today: DATE }), []);
    assert.deepEqual(tripDateRows({ stay: { arrival: { date: 'x' }, departure: { date: 'y' } }, days: {}, today: DATE }), []);
  });
});

describe('introRequestFor · introCacheKey — AI 소개 요청 (spec 4.16 · 규칙 36)', () => {
  const d = day({
    outings: [
      outing('o2', { departAt: '17:00', stops: [stop('3', { title: '저녁 식당', category: 'FOOD', isMeal: true, arriveAt: '17:30' })] }),
      outing('o1', { stops: [stop('1', { title: '궁궐', category: 'CULTURE', arriveAt: '10:30' })] }),
    ],
    guardianOutings: [outing('g', { role: 'G', stops: [stop('9', { role: 'G', title: '보호자만' })] })],
  });

  test('환자 정거장의 이름·유형·도착 시각만, 도착 순으로 — 관심사·강도를 더한다', () => {
    const req = introRequestFor(d, STAY, 'ja');
    assert.deepEqual(req, {
      lang: 'ja',
      stops: [
        { title: '궁궐', category: 'CULTURE', arriveAt: '10:30' },
        { title: '저녁 식당', category: 'FOOD', arriveAt: '17:30' },
      ],
      interests: ['CAFE', 'PALACE_HISTORY'],
      pace: 'RELAXED',
    });
  });

  test('조건·병원·숙소·날짜·주소·좌표는 요청에 없다', () => {
    const text = JSON.stringify(introRequestFor(d, STAY, 'ko'));
    for (const banned of ['데모 숙소', '데모 의원', DATE, '서울 테스트로', 'effective', 'lat', 'lng', 'hospital', 'lodging']) {
      assert.ok(!text.includes(banned), banned);
    }
  });

  test('정거장이 없으면 요청하지 않는다(null)', () => {
    assert.equal(introRequestFor(day(), STAY, 'ko'), null);
    assert.equal(introRequestFor(null, STAY, 'ko'), null);
  });

  test('캐시 키는 같은 입력이면 같고, 입력이 다르면 다르며, 저장소 키 형식을 지킨다', () => {
    const a = introRequestFor(d, STAY, 'ko');
    const k1 = introCacheKey(a);
    assert.equal(k1, introCacheKey(JSON.parse(JSON.stringify(a))));
    assert.notEqual(k1, introCacheKey({ ...a, lang: 'en' }));
    assert.notEqual(k1, introCacheKey({ ...a, stops: a.stops.slice(0, 1) }));
    assert.match(k1, /^[A-Za-z0-9_:.-]{1,256}$/);
    assert.ok(k1.startsWith('intro:'));
  });
});

describe('placeDetailRequest · findPlaceStop · stopBadges — 장소 상세 (spec 6장 · 4.8 · 4.14)', () => {
  const s = stop('5002', { labels: ['ESTIMATED', 'HOURS_UNCONFIRMED', 'NEEDS_TRANSLATION', 'DIET_ESTIMATED', 'ORDER_CARD'] });

  test('상세 요청은 Stop 과 같은 형식 — lang, contentId, sourceIds, contentTypeIds 만', () => {
    const req = placeDetailRequest(s, 'zh');
    assert.deepEqual(req, {
      lang: 'zh',
      contentId: '5002',
      sourceIds: { ko: '5002', en: '50021', barrierFree: '77' },
      contentTypeIds: { canonical: '14', ko: '14', en: '78' },
    });
    assert.deepEqual(Object.keys(req).sort(), ['contentId', 'contentTypeIds', 'lang', 'sourceIds']);
  });

  test('정거장 id 가 있으면 그 정거장, 없으면 날짜 → 전체 순으로 candidateId 를 찾는다', () => {
    const other = { ...stop('5002'), id: `2026-10-06:P:5002` };
    const plan = {
      days: {
        [DATE]: day({ outings: [outing('o', { stops: [s] })] }),
        '2026-10-06': day({ date: '2026-10-06', outings: [outing('o', { stops: [other] })] }),
      },
    };
    assert.equal(findPlaceStop(plan, '5002', { stopId: other.id }).stop.id, other.id);
    assert.equal(findPlaceStop(plan, '5002', { date: '2026-10-06' }).date, '2026-10-06');
    const found = findPlaceStop(plan, '5002');
    assert.equal(found.date, DATE);
    assert.equal(found.role, 'P');
    assert.equal(findPlaceStop(plan, '404'), null);
    assert.equal(findPlaceStop(null, '5002'), null);
  });

  test('라벨 → 배지 5종 중 추정·운영 확인 필요, 나머지는 따로 표시', () => {
    assert.deepEqual(stopBadges(s), {
      badges: ['estimate', 'hoursUnconfirmed'],
      needsTranslation: true,
      dietEstimated: true,
      orderCard: true,
    });
    assert.deepEqual(stopBadges(stop('1', { labels: [] })), { badges: [], needsTranslation: false, dietEstimated: false, orderCard: false });
  });

  test('지도 링크는 정거장의 이름·좌표만 — 숙소·병원 모양이면 만들지 않는다 (규칙 39)', () => {
    const links = buildMapLinks(s);
    assert.ok(links.google.includes('destination=37.5%2C127.03'));
    assert.ok(!links.google.includes('origin'));
    assert.equal(buildMapLinks(STAY.lodgings[0]), null);
  });
});

describe('편집 가능 여부 (spec 4.10 · 규칙 32)', () => {
  const base = { date: DATE, today: DATE, readOnly: false, dailyCheckPending: false, day: day({ outings: [outing('o', { stops: [stop('1')] })] }) };

  test('지난 날짜·보기 전용·매일 확인 전 오늘·일정 없음·입력 필요는 막는다', () => {
    assert.deepEqual(canEditDay(base), { allowed: true, reasonKey: null });
    assert.deepEqual(canEditDay({ ...base, today: '2026-10-06' }), { allowed: false, reasonKey: 'trip.editPast' });
    assert.deepEqual(canEditDay({ ...base, readOnly: true }), { allowed: false, reasonKey: 'trip.editReadOnly' });
    assert.deepEqual(canEditDay({ ...base, dailyCheckPending: true }), { allowed: false, reasonKey: 'trip.editGated' });
    assert.deepEqual(canEditDay({ ...base, day: null }), { allowed: false, reasonKey: 'trip.editNoPlan' });
    assert.deepEqual(canEditDay({ ...base, day: day({ coverage: 'NEEDS_INPUT' }) }), { allowed: false, reasonKey: 'trip.editNoPlan' });
  });

  test('미래 날짜의 매일 확인 대기는 막지 않는다', () => {
    assert.equal(canEditDay({ ...base, today: '2026-10-04', dailyCheckPending: true }).allowed, true);
  });

  test('오늘 이미 도착한 정거장은 바꾸지 않는다(재계획 규칙 2)', () => {
    const s = stop('1', { arriveAt: '10:30' });
    assert.equal(stopEditable(s, { date: DATE, today: DATE, nowMin: 10 * 60 + 29 }), true);
    assert.equal(stopEditable(s, { date: DATE, today: DATE, nowMin: 10 * 60 + 30 }), false);
    assert.equal(stopEditable(s, { date: '2026-10-06', today: DATE, nowMin: 23 * 60 }), true);
  });
});

describe('dailyCheckSummary · isDemoMode · demoEventFor · 마감 이유', () => {
  test('매일 확인 카드 요약 — 외출·복귀는 늘, 나머지는 제한(예·값)만, 제한 없음은 개수로', () => {
    const summary = dailyCheckSummary({
      outing: eff('ALLOWED'),
      returnTime: eff({ kind: 'SET', time: '18:00', place: 'LODGING' }),
      walkLimit: eff({ kind: 'SET', value: 15 }, 'SELF', true),
      avoidUv: eff({ kind: 'NONE' }),
      'diet.spicy': eff({ kind: 'SET', value: true }),
      medication: eff({ kind: 'NONE' }),
    });
    assert.deepEqual(
      summary.main.map((r) => r.key),
      ['outing', 'returnTime'],
    );
    assert.deepEqual(
      summary.restrictions.map((r) => [r.key, r.defaulted]),
      [
        ['walkLimit', true],
        ['diet.spicy', false],
      ],
    );
    assert.equal(summary.noneCount, 2);
    assert.deepEqual(dailyCheckSummary(null), { main: [], restrictions: [], noneCount: 0 });
  });

  test('데모 모드는 연결된 지침이 데모일 때만', () => {
    assert.equal(isDemoMode({ linkedPlans: [{ plan: { demo: true } }] }), true);
    assert.equal(isDemoMode({ linkedPlans: [{ plan: { demo: false } }] }), false);
    assert.equal(isDemoMode({ linkedPlans: [] }), false);
    assert.equal(isDemoMode(null), false);
  });

  test('데모 사건 — 휴무는 아직 도착하지 않은 첫 환자 정거장, 나머지는 정해진 값', () => {
    const d = day({ outings: [outing('o', { stops: [stop('1', { arriveAt: '10:00' }), stop('2', { arriveAt: '11:00' })] })] });
    assert.deepEqual(demoEventFor('CLOSURE', d, 10 * 60 + 5), { type: 'CLOSURE', closedIds: ['2'] });
    assert.equal(demoEventFor('CLOSURE', d, 12 * 60), null);
    assert.equal(demoEventFor('CLOSURE', day(), 0), null);
    assert.deepEqual(demoEventFor('TRAFFIC_SURGE', d, 0), { type: 'TRAFFIC_SURGE', extraMin: 20 });
    assert.deepEqual(demoEventFor('APPOINTMENT', d, 0), { type: 'APPOINTMENT', deltaMin: -60 });
    for (const type of ['WEATHER', 'PATIENT_RECALL', 'RISK_SIGNAL']) assert.deepEqual(demoEventFor(type, d, 0), { type });
    assert.equal(demoEventFor('NOPE', d, 0), null);
  });

  test('마감 이유 6종 모두 문구 키가 있다', () => {
    assert.deepEqual(Object.keys(DEADLINE_REASON_KEY).sort(), ['APPOINTMENT', 'DAY_END', 'DEPARTURE', 'MEDICATION', 'PATIENT_SCHEDULE', 'RETURN_TIME']);
  });
});

describe('returnTargetOf · overdueOutingOf: 복귀 시트의 돌아갈 곳 (마감 지남 설계서 4.2 · 4.3)', () => {
  const H2 = { id: 'H2', name: '둘째 의원', address: { roadAddress: '둘째 병원 주소', lat: 37.53, lng: 127.04 } };
  const PLANNED = { kind: 'PLANNED', name: null, address: null };

  test('외출이 없거나 숙소 외출이면 그날 숙소', () => {
    const d = day();
    assert.deepEqual(returnTargetOf({ day: d, stay: STAY, outing: null }), { kind: 'LODGING', name: '데모 숙소', address: '데모 주소' });
    assert.deepEqual(returnTargetOf({ day: d, stay: STAY, outing: outing('o') }), { kind: 'LODGING', name: '데모 숙소', address: '데모 주소' });
    assert.deepEqual(returnTargetOf({ day: day({ lodgingId: 'NOPE' }), stay: STAY, outing: null }), { kind: 'LODGING', name: null, address: null });
  });

  test('병원 외출은 그 시각에 시작하는 병원 일정의 hospitalId 로 찾은 병원 이름·도로명주소', () => {
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '15:00', deadlineReason: 'APPOINTMENT' });
    assert.deepEqual(returnTargetOf({ day: day(), stay: STAY, outing: o }), { kind: 'HOSPITAL', name: '데모 의원', address: '데모 병원 주소' });
  });

  test('병원 외출은 복귀 시각 조건(RETURN_TIME)의 hospitalId 로도 찾는다', () => {
    const stay = { ...STAY, hospitals: [...STAY.hospitals, H2], appointments: [] };
    const d = day({ effective: { returnTime: eff({ time: '18:00', place: 'HOSPITAL', hospitalId: 'H2' }) } });
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '18:00', deadlineReason: 'RETURN_TIME' });
    assert.deepEqual(returnTargetOf({ day: d, stay, outing: o }), { kind: 'HOSPITAL', name: '둘째 의원', address: '둘째 병원 주소' });
  });

  test('마감이 지금으로 당겨져 일정과 맞지 않아도 그날 병원 일정이 한 병원뿐이면 그 병원', () => {
    // 경우 2: overdueSafe 가 returnBy 를 지금으로 당겨 start === returnBy 일정이 없다
    const stay = { ...STAY, hospitals: [STAY.hospitals[0], H2], appointments: [...STAY.appointments, { id: 'A2', hospitalId: 'H1', type: 'VISIT', date: DATE, start: '18:00', source: 'USER' }, { id: 'A3', hospitalId: 'H2', type: 'VISIT', date: '2026-10-06', start: '10:00', source: 'USER' }] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    assert.deepEqual(returnTargetOf({ day: day(), stay, outing: o }), { kind: 'HOSPITAL', name: '데모 의원', address: '데모 병원 주소' });
  });

  test('마감 이유가 병원 일정이 아니면 적힌 id 가 없을 때 그날 병원이 하나뿐이어도 정해 둔 장소', () => {
    // 위 대비책과 같은 하루지만 deadlineReason 이 APPOINTMENT 가 아니고, 일정·복귀 시각 조건 어디에도 id 가 없다
    const stay = { ...STAY, appointments: [...STAY.appointments, { id: 'A2', hospitalId: 'H1', type: 'VISIT', date: DATE, start: '18:00', source: 'USER' }] };
    for (const deadlineReason of ['RETURN_TIME', 'MEDICATION', 'DAY_END']) {
      const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason });
      assert.deepEqual(returnTargetOf({ day: day(), stay, outing: o }), PLANNED, String(deadlineReason));
    }
  });

  test('적힌 hospitalId 가 병원 목록에 없으면 그날 병원이 하나뿐이어도 정해 둔 장소', () => {
    // 일정(start === returnBy)이 H9 를 적었지만 목록에 없다. 그날 다른 일정은 모두 H1 이어도 H1 으로 대신하지 않는다
    const byAppt = { ...STAY, appointments: [...STAY.appointments, { id: 'A9', hospitalId: 'H9', type: 'VISIT', date: DATE, start: '13:07', source: 'USER' }] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    assert.deepEqual(returnTargetOf({ day: day(), stay: byAppt, outing: o }), PLANNED);
    // 복귀 시각 조건이 H9 를 적은 경우도 같다
    const d = day({ effective: { returnTime: eff({ time: '18:00', place: 'HOSPITAL', hospitalId: 'H9' }) } });
    const r = outing('o', { returnPlace: 'HOSPITAL', returnBy: '18:00', deadlineReason: 'RETURN_TIME' });
    assert.deepEqual(returnTargetOf({ day: d, stay: STAY, outing: r }), PLANNED);
  });

  test('못 찾으면 정해 둔 장소, 그날 병원이 둘이면 고르지 않는다', () => {
    const stay = { ...STAY, hospitals: [STAY.hospitals[0], H2], appointments: [...STAY.appointments, { id: 'A2', hospitalId: 'H2', type: 'VISIT', date: DATE, start: '18:00', source: 'USER' }] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    assert.deepEqual(returnTargetOf({ day: day(), stay, outing: o }), PLANNED);
  });

  test('첫 병원으로 추측하지 않는다: 병원 2곳, 맞는 id 없음', () => {
    const stay = { ...STAY, hospitals: [STAY.hospitals[0], H2], appointments: [] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '15:00', deadlineReason: 'APPOINTMENT' });
    assert.deepEqual(returnTargetOf({ day: day(), stay, outing: o }), PLANNED);
    // 일정의 hospitalId 가 병원 목록에 없으면 정해 둔 장소
    const ghost = { ...STAY, appointments: [{ ...STAY.appointments[0], hospitalId: 'H9' }] };
    assert.deepEqual(returnTargetOf({ day: day(), stay: ghost, outing: o }), PLANNED);
    assert.deepEqual(returnTargetOf({ day: day(), stay: null, outing: o }), PLANNED);
  });

  test('overdueOutingOf: 여유가 음수인 첫 환자 외출, 없으면 null', () => {
    const late = { ...outing('b', { departAt: '13:00' }), slackMin: -5 };
    const later = { ...outing('c', { departAt: '15:00' }), slackMin: -1 };
    assert.equal(overdueOutingOf(day({ outings: [outing('a'), late, later] })), late);
    assert.equal(overdueOutingOf(day({ outings: [outing('a')] })), null);
    assert.equal(overdueOutingOf(day({ guardianOutings: [{ ...outing('g', { role: 'G' }), slackMin: -3 }] })), null);
    assert.equal(overdueOutingOf(null), null);
  });
});

describe('returnNoteKeyOf: 복귀 시트 맺음말 (findings 11)', () => {
  test('숙소면 한국어 복귀 카드 안내(return.note), 병원·정해 둔 장소면 이름·주소 안내(return.notePlace)', () => {
    assert.equal(returnNoteKeyOf({ kind: 'LODGING', name: '데모 숙소', address: '데모 주소' }), 'return.note');
    assert.equal(returnNoteKeyOf({ kind: 'LODGING', name: null, address: null }), 'return.note');
    assert.equal(returnNoteKeyOf({ kind: 'HOSPITAL', name: '데모 의원', address: '데모 병원 주소' }), 'return.notePlace');
    assert.equal(returnNoteKeyOf({ kind: 'PLANNED', name: null, address: null }), 'return.notePlace');
  });

  test('시트가 보이는 장소와 같은 규칙: 병원 외출이면 return.notePlace, 숙소 외출이면 return.note', () => {
    const hospital = outing('o', { returnPlace: 'HOSPITAL', returnBy: '15:00', deadlineReason: 'APPOINTMENT' });
    assert.equal(returnNoteKeyOf(returnTargetOf({ day: day(), stay: STAY, outing: hospital })), 'return.notePlace');
    assert.equal(returnNoteKeyOf(returnTargetOf({ day: day(), stay: STAY, outing: outing('o') })), 'return.note');
  });
});

describe('returnPlaceOf: 타임라인과 복귀 시트가 같은 돌아갈 곳을 보인다 (B7)', () => {
  const H2 = { id: 'H2', name: '둘째 의원', address: { roadAddress: '둘째 병원 주소', lat: 37.53, lng: 127.04 } };
  const TWO = { ...STAY, hospitals: [STAY.hospitals[0], H2] };

  /** 같은 외출을 타임라인(returnPlaceOf · timelineEntries)과 시트(returnTargetOf)로 읽는다 */
  function both(o, d, stay) {
    const dayWith = { ...d, outings: [o] };
    const timeline = returnPlaceOf(o, dayWith, stay);
    const entry = timelineEntries(dayWith, { role: 'P', stay }).find((e) => e.kind === 'return');
    assert.deepEqual(entry.place, timeline, 'timelineEntries 의 복귀 항목은 returnPlaceOf 를 그대로 싣는다');
    return { timeline, sheet: returnTargetOf({ day: dayWith, stay, outing: o }) };
  }

  test('숙소 외출: 둘 다 그날 숙소', () => {
    const { timeline, sheet } = both(outing('o'), day(), STAY);
    assert.deepEqual(timeline, { kind: 'LODGING', name: '데모 숙소' });
    assert.equal(sheet.kind, 'LODGING');
    assert.equal(sheet.name, timeline.name);
  });

  test('병원 외출, 적힌 id(병원 일정 start === returnBy): 둘 다 그 병원', () => {
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '15:00', deadlineReason: 'APPOINTMENT' });
    const { timeline, sheet } = both(o, day(), STAY);
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: '데모 의원' });
    assert.equal(sheet.name, timeline.name);
  });

  test('병원 일정과 복귀 시각 조건이 다른 병원을 적으면 둘 다 엔진 규칙(병원 일정 먼저)을 따른다', () => {
    // 예전 타임라인은 RETURN_TIME 이면 복귀 시각 조건의 H2 를 먼저 봤고, 시트는 병원 일정의 H1 을 봤다
    const stay = { ...TWO, appointments: [{ id: 'A1', hospitalId: 'H1', type: 'VISIT', date: DATE, start: '18:00', source: 'USER' }] };
    const d = day({ effective: { returnTime: eff({ time: '18:00', place: 'HOSPITAL', hospitalId: 'H2' }) } });
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '18:00', deadlineReason: 'RETURN_TIME' });
    const { timeline, sheet } = both(o, d, stay);
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: '데모 의원' });
    assert.equal(sheet.name, '데모 의원');
  });

  test('복귀 시각 조건의 hospitalId 만 적혔으면 둘 다 그 병원', () => {
    const stay = { ...TWO, appointments: [] };
    const d = day({ effective: { returnTime: eff({ time: '18:00', place: 'HOSPITAL', hospitalId: 'H2' }) } });
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '18:00', deadlineReason: 'RETURN_TIME' });
    const { timeline, sheet } = both(o, d, stay);
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: '둘째 의원' });
    assert.equal(sheet.name, '둘째 의원');
  });

  test('적힌 id 가 없으면 시트는 정해 둔 장소, 타임라인은 이름 없는 병원(일반 라벨)', () => {
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'DAY_END' });
    const { timeline, sheet } = both(o, day(), STAY);
    assert.deepEqual(sheet, { kind: 'PLANNED', name: null, address: null });
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: null });
  });

  test('적힌 id 가 병원 목록에 없으면 다른 병원으로 대신하지 않는다', () => {
    const stay = { ...STAY, appointments: [...STAY.appointments, { id: 'A9', hospitalId: 'H9', type: 'VISIT', date: DATE, start: '13:07', source: 'USER' }] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    const { timeline, sheet } = both(o, day(), stay);
    assert.equal(sheet.kind, 'PLANNED');
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: null });
  });

  test('한 병원 대비책: 적힌 id 가 없고 마감 이유가 병원 일정(APPOINTMENT)일 때만 둘 다 그 병원', () => {
    // 경우 2: 마감이 지금으로 당겨져 start === returnBy 일정이 없다. 그날 병원 일정은 모두 H1
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    const { timeline, sheet } = both(o, day(), STAY);
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: '데모 의원' });
    assert.equal(sheet.name, '데모 의원');
    for (const deadlineReason of ['RETURN_TIME', 'MEDICATION', 'DAY_END']) {
      const other = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason });
      const r = both(other, day(), STAY);
      assert.equal(r.sheet.kind, 'PLANNED', deadlineReason);
      assert.deepEqual(r.timeline, { kind: 'HOSPITAL', name: null }, deadlineReason);
    }
  });

  test('그날 병원이 둘이면 대비책도 고르지 않는다', () => {
    const stay = { ...TWO, appointments: [...STAY.appointments, { id: 'A2', hospitalId: 'H2', type: 'VISIT', date: DATE, start: '18:00', source: 'USER' }] };
    const o = outing('o', { returnPlace: 'HOSPITAL', returnBy: '13:07', deadlineReason: 'APPOINTMENT' });
    const { timeline, sheet } = both(o, day(), stay);
    assert.equal(sheet.kind, 'PLANNED');
    assert.deepEqual(timeline, { kind: 'HOSPITAL', name: null });
  });
});
