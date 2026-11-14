// 서버 알림에 올릴 상태, '돌아왔어요' 대상, 되돌리기 마감, 대기열 규칙 (lib/trip/watchPlan.js · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 6, D1·D2·D5·D10)
//
// 이 파일이 고정하는 것
//   - 오늘부터 출국일까지(앞의 46일) 날짜마다 마감 목록을 올리고 expiresOn 은 출국일이다. 어제는 올리지 않는다
//   - D1: 지난 마감은 일정에서 빠져도 남기고, 지나지 않은 마감은 일정에 없으면 뺀다
//   - D1 보강: 당겨진 외출이 있는 오늘(isOverdueClampedDay)은 마지막으로 올린 시각을 지금 이후 것까지 모두 남긴다
//   - D2: 당겨진 외출의 마감은 새로 올리지 않는다. 다른 즉시 복귀 원인의 날은 실제 마감을 올린다
//   - nextLastUploaded 는 보낸 날짜와 어제만 남긴다(경우 2 의 by 를 자정 뒤에도 찾는다)
//   - 하루 10개 상한: 지난 시각부터 이른 순으로, 그래도 넘으면 늦은 시각부터 뺀다
//   - '돌아왔어요' 대상: 출발 전 없음, 경우 1 은 passedBy, 평소는 returnBy, 경우 2 는 출발 이후 가장 이른 올린 시각
//   - 되돌리기 마감 = 마감 + serverPushGraceMin 분 - serverPushEarlyToleranceSec 초
//
// 시각은 모두 오프셋이 있는 문자열로 만든다. 기기 시간대와 벽시계를 읽지 않는다. 외부 호출은 없다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBackAction,
  backTargetOf,
  buildUploadState,
  isSameUpload,
  pruneBackQueue,
  undoUntilMs,
} from '../lib/trip/watchPlan.js';
import { REASON } from '../src/domain/states.js';
import { WATCH_UPLOAD_MAX_DAYS, WATCH_UPLOAD_MAX_PER_DAY } from '../src/guardian/watchRequests.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import { makeDayPlan, makeGuardianStay, patientOuting } from './guardian-fixtures.js';

// 오늘 2026-11-20, 체류 2026-11-18 ~ 2026-11-24
const at = (iso) => Date.parse(iso);
const NOW = at('2026-11-20T15:00:00+09:00');
const TODAY = '2026-11-20';
const YESTERDAY = '2026-11-19';

function stayOf(arrival = '2026-11-18', departure = '2026-11-24') {
  return makeGuardianStay({
    arrival: { date: arrival, time: '10:00', airport: 'ICN' },
    departure: { date: departure, time: '18:00', airport: 'GMP' },
  });
}

function planOf(days) {
  return { days };
}

/** 즉시 복귀가 켜진 하루 */
function returnNowDay(date, reason, outings) {
  return makeDayPlan(date, { returnNow: true, reasons: [reason], outings });
}

function todayDeadlines(state) {
  return state.days.find((day) => day.date === TODAY)?.deadlines;
}

describe('buildUploadState', () => {
  test('오늘부터 출국일까지 날짜마다 목록, expiresOn 은 출국일이다', () => {
    const tripPlan = planOf({
      '2026-11-19': makeDayPlan('2026-11-19', { outings: [patientOuting({ returnBy: '11:00' })] }),
      '2026-11-21': makeDayPlan('2026-11-21', { outings: [patientOuting({ departAt: '10:00', returnBy: '12:30' })] }),
    });
    const state = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: {}, nowMs: NOW });
    assert.equal(state.expiresOn, '2026-11-24');
    assert.deepEqual(state.days, [
      { date: '2026-11-20', deadlines: [] },
      { date: '2026-11-21', deadlines: ['12:30'] },
      { date: '2026-11-22', deadlines: [] },
      { date: '2026-11-23', deadlines: [] },
      { date: '2026-11-24', deadlines: [] },
    ]);
    assert.equal(state.key, JSON.stringify({ expiresOn: '2026-11-24', days: state.days }));
    assert.deepEqual(state.nextLastUploaded, {
      '2026-11-20': [],
      '2026-11-21': ['12:30'],
      '2026-11-22': [],
      '2026-11-23': [],
      '2026-11-24': [],
    });
    assert.equal(Object.hasOwn(state.nextLastUploaded, YESTERDAY), false, '어제 기록이 없으면 만들지 않는다');

    // lastUploaded 가 없어도 같다
    assert.deepEqual(buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: undefined, nowMs: NOW }), state);
    assert.deepEqual(buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: null, nowMs: NOW }), state);

    // 입국 전이면 입국일부터다
    const early = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: {}, nowMs: at('2026-11-15T09:00:00+09:00') });
    assert.deepEqual(early.days.map((day) => day.date), ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    assert.deepEqual(early.days[1], { date: '2026-11-19', deadlines: ['11:00'] });
  });

  test('지난 마감은 일정에서 빠져도 남기고 지나지 않은 마감은 뺀다 (D1)', () => {
    // 오늘 일정 외출 16:00 출발 18:00 마감, lastUploaded 오늘 ['14:30', '17:00']
    const tripPlan = planOf({ [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '16:00', returnBy: '18:00' })] }) });
    const state = buildUploadState({
      stay: stayOf(),
      tripPlan,
      lastUploaded: { [TODAY]: ['14:30', '17:00'], '2026-11-21': ['09:00'] },
      nowMs: NOW,
    });
    assert.deepEqual(todayDeadlines(state), ['14:30', '18:00']);
    // 내일 이후는 지난 시각이 없다
    assert.deepEqual(state.days.find((day) => day.date === '2026-11-21').deadlines, []);
    assert.deepEqual(state.nextLastUploaded[TODAY], ['14:30', '18:00']);

    // 지금과 같은 시각은 지난 것이다
    const boundary = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: { [TODAY]: ['15:00', '15:01'] }, nowMs: NOW });
    assert.deepEqual(todayDeadlines(boundary), ['15:00', '18:00']);
  });

  test('경우 2: 당겨진 외출의 마감은 올리지 않고, 이미 올린 원래 마감은 남긴다 (D2)', () => {
    // 오늘 day: returnNow true, reasons ['OUTING_OVERDUE'], 외출 13:00 출발 returnBy '14:45' slackMin -20
    const day = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [patientOuting({ departAt: '13:00', returnBy: '14:45', slackMin: -20 })]);
    const state = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded: { [TODAY]: ['14:30'] }, nowMs: NOW });
    assert.deepEqual(todayDeadlines(state), ['14:30']);
    assert.ok(!todayDeadlines(state).includes('14:45'));
  });

  test('환자 호출 날의 여유 음수 외출은 실제 마감을 올린다', () => {
    for (const reason of [REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED]) {
      const day = returnNowDay(TODAY, reason, [patientOuting({ departAt: '13:00', returnBy: '14:45', slackMin: -20 })]);
      const state = buildUploadState({
        stay: stayOf(),
        tripPlan: planOf({ [TODAY]: day }),
        lastUploaded: { [TODAY]: ['14:30', '16:30'] },
        nowMs: NOW,
      });
      // 당겨진 날이 아니라 지나지 않은 '16:30' 은 일정에 없으면 빠진다
      assert.deepEqual(todayDeadlines(state), ['14:30', '14:45'], reason);
    }
  });

  test('자정: 00:05 에는 어제를 보내지 않고 nextLastUploaded 에 어제 23:55 를 남긴다', () => {
    const state = buildUploadState({
      stay: stayOf(),
      tripPlan: planOf({}),
      lastUploaded: { '2026-11-20': ['23:55'] },
      nowMs: at('2026-11-21T00:05:00+09:00'),
    });
    assert.ok(!state.days.some((day) => day.date === '2026-11-20'));
    assert.equal(state.days[0].date, '2026-11-21');
    assert.deepEqual(state.nextLastUploaded['2026-11-20'], ['23:55']);
  });

  test('그제 이전 날짜는 nextLastUploaded 에서 버린다', () => {
    const state = buildUploadState({
      stay: stayOf(),
      tripPlan: planOf({}),
      lastUploaded: { '2026-11-18': ['10:00'], [YESTERDAY]: ['11:00'], [TODAY]: ['12:00'], '2026-12-01': ['09:00'] },
      nowMs: NOW,
    });
    assert.deepEqual(Object.keys(state.nextLastUploaded).sort(), [YESTERDAY, TODAY, '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    assert.deepEqual(state.nextLastUploaded[YESTERDAY], ['11:00']);
    assert.deepEqual(state.nextLastUploaded[TODAY], ['12:00']);
    assert.ok(!state.days.some((day) => day.date === YESTERDAY), '어제는 보내지 않는다');
  });

  test('하루 10개를 넘으면 지난 시각부터 이른 순으로 뺀다', () => {
    assert.equal(WATCH_UPLOAD_MAX_PER_DAY, 10);
    const outingsAt = (times) => times.map((returnBy) => patientOuting({ departAt: '15:05', returnBy }));
    const future = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    const past = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const mixed = buildUploadState({
      stay: stayOf(),
      tripPlan: planOf({ [TODAY]: makeDayPlan(TODAY, { outings: outingsAt(future) }) }),
      lastUploaded: { [TODAY]: past },
      nowMs: NOW,
    });
    assert.deepEqual(todayDeadlines(mixed), ['10:00', '10:30', '11:00', '11:30', ...future]);

    // 지난 시각이 모자라면 그다음은 늦은 시각부터 뺀다
    const many = ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];
    const onlyFuture = buildUploadState({
      stay: stayOf(),
      tripPlan: planOf({ [TODAY]: makeDayPlan(TODAY, { outings: outingsAt(many) }) }),
      lastUploaded: { [TODAY]: ['14:00'] },
      nowMs: NOW,
    });
    assert.deepEqual(todayDeadlines(onlyFuture), many.slice(0, 10));
    for (const day of [...mixed.days, ...onlyFuture.days]) assert.ok(day.deadlines.length <= WATCH_UPLOAD_MAX_PER_DAY);
  });

  test('46일을 넘는 남은 체류는 앞의 46일만 보낸다', () => {
    assert.equal(WATCH_UPLOAD_MAX_DAYS, 46);
    const state = buildUploadState({ stay: stayOf('2026-11-18', '2027-01-31'), tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW });
    assert.equal(state.days.length, 46);
    assert.equal(state.days[0].date, TODAY);
    assert.equal(state.days.at(-1).date, '2027-01-04');
    assert.equal(state.expiresOn, '2027-01-31', '출국일은 그대로 보낸다(서버가 상한을 씌운다)');
    assert.equal(Object.hasOwn(state.nextLastUploaded, '2027-01-05'), false);
  });

  test('출국일이 오늘보다 앞이면 null', () => {
    assert.equal(buildUploadState({ stay: stayOf('2026-11-15', YESTERDAY), tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW }), null);
    // 출국일이 오늘이면 오늘 하루를 보낸다
    const lastDay = buildUploadState({ stay: stayOf('2026-11-15', TODAY), tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW });
    assert.deepEqual(lastDay.days, [{ date: TODAY, deadlines: [] }]);
    // 출국일이 없거나 체류를 읽을 수 없으면 null
    assert.equal(buildUploadState({ stay: { ...stayOf(), departure: null }, tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(buildUploadState({ stay: { ...stayOf(), arrival: { date: 'x' } }, tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(buildUploadState({ stay: null, tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW }), null);
  });
});

describe('isSameUpload', () => {
  test('isSameUpload: 같으면 참, uploadPending 이나 expiresOn 이나 목록 하나가 다르면 거짓, 자정에 하루 빠진 것은 같다', () => {
    const tripPlan = planOf({ '2026-11-21': makeDayPlan('2026-11-21', { outings: [patientOuting({ returnBy: '12:30' })] }) });
    const state = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: {}, nowMs: NOW });
    const record = {
      watchId: 'AbCdEfGhIjKlMnOpQrSt_-',
      writeToken: 'T'.repeat(43),
      expiresOn: '2026-11-24',
      lastUploaded: state.nextLastUploaded,
      uploadPending: false,
      backQueue: [],
      state: 'ON',
    };
    assert.equal(isSameUpload(record, state), true);
    assert.equal(isSameUpload({ ...record, uploadPending: true }, state), false);
    assert.equal(isSameUpload({ ...record, expiresOn: '2026-11-25' }, state), false);
    assert.equal(isSameUpload({ ...record, lastUploaded: { ...record.lastUploaded, '2026-11-21': [] } }, state), false);
    assert.equal(isSameUpload({ ...record, lastUploaded: { ...record.lastUploaded, '2026-11-22': ['10:00'] } }, state), false);
    const { '2026-11-23': _missing, ...withoutDay } = record.lastUploaded;
    assert.equal(isSameUpload({ ...record, lastUploaded: withoutDay }, state), false, '올린 적 없는 날짜가 있으면 다르다');
    assert.equal(isSameUpload(null, state), false);
    assert.equal(isSameUpload(record, null), false);

    // 자정이 지나 보낼 날짜가 하루 줄어든 것만으로는 같다
    const afterMidnight = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: record.lastUploaded, nowMs: at('2026-11-21T00:00:01+09:00') });
    assert.equal(afterMidnight.days[0].date, '2026-11-21');
    assert.equal(isSameUpload(record, afterMidnight), true);
  });
});

describe('backTargetOf', () => {
  test('backTargetOf: 출발 전 null, 경우 1 은 passedBy(외출을 못 찾아도), 평소는 returnBy, 날짜는 외출의 날', () => {
    const day = makeDayPlan(TODAY, {
      outings: [
        patientOuting({ id: 'o1', departAt: '13:00', returnBy: '16:00' }),
        patientOuting({ id: 'o2', departAt: '16:30', returnBy: '18:00' }),
        patientOuting({ id: 'o3', departAt: '15:00', returnBy: '17:00' }),
      ],
    });
    const [o1, o2, o3] = day.outings;
    assert.equal(backTargetOf({ day, outing: o2, lastUploaded: {}, nowMs: NOW }), null, '출발 전');
    assert.deepEqual(backTargetOf({ day, outing: o1, lastUploaded: {}, nowMs: NOW }), { date: TODAY, by: '16:00' });
    assert.deepEqual(backTargetOf({ day, outing: o3, lastUploaded: {}, nowMs: NOW }), { date: TODAY, by: '17:00' }, '출발 시각이 지금이면 출발했다');

    // 경우 1: 시트의 지난 마감. 외출을 못 찾아도, 외출의 지금 마감과 달라도 passedBy 다
    assert.deepEqual(backTargetOf({ day, outing: null, lastUploaded: {}, nowMs: NOW, passedBy: '14:30' }), { date: TODAY, by: '14:30' });
    assert.deepEqual(backTargetOf({ day, outing: o1, lastUploaded: {}, nowMs: NOW, passedBy: '14:30' }), { date: TODAY, by: '14:30' });
    // 시각이 아닌 passedBy 는 없는 것과 같다
    assert.deepEqual(backTargetOf({ day, outing: o1, lastUploaded: {}, nowMs: NOW, passedBy: '24:00' }), { date: TODAY, by: '16:00' });

    // 날짜는 시계의 오늘이 아니라 외출이 속한 날이다
    const late = makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '22:00', returnBy: '23:55' })] });
    assert.deepEqual(
      backTargetOf({ day: late, outing: late.outings[0], lastUploaded: {}, nowMs: at('2026-11-21T00:05:00+09:00') }),
      { date: TODAY, by: '23:55' },
    );

    // 하루나 외출이 없거나 시각이 아니면 null
    assert.equal(backTargetOf({ day: null, outing: o1, lastUploaded: {}, nowMs: NOW, passedBy: '14:30' }), null);
    assert.equal(backTargetOf({ day, outing: null, lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(backTargetOf({ day, outing: { ...o1, departAt: '25:00' }, lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(backTargetOf({ day, outing: { ...o1, returnBy: null }, lastUploaded: {}, nowMs: NOW }), null);
  });

  test('backTargetOf 경우 2: 출발 이후 가장 이른 올린 시각(미래여도), 다른 외출의 지금 마감은 뺀다, 없으면 null', () => {
    const day = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [
      patientOuting({ id: 'o1', departAt: '09:00', returnBy: '11:00', slackMin: 10 }),
      patientOuting({ id: 'o2', departAt: '13:00', returnBy: '15:00', slackMin: -20 }),
      patientOuting({ id: 'o3', departAt: '15:30', returnBy: '16:00', slackMin: 30 }),
    ]);
    const clamped = day.outings[1];
    const target = (times, nowMs = NOW) => backTargetOf({ day, outing: clamped, lastUploaded: { [TODAY]: times }, nowMs });

    // 출발(13:00) 이전 시각은 이 외출의 마감이 아니다
    assert.deepEqual(target(['11:00', '14:30', '16:30']), { date: TODAY, by: '14:30' });
    // 원래 마감이 아직 미래여도 그 시각이다
    assert.deepEqual(target(['11:00', '16:30', '19:00']), { date: TODAY, by: '16:30' });
    // 같은 날 다른 외출(당겨지지 않은)의 지금 마감은 뺀다
    assert.deepEqual(target(['11:00', '16:00', '16:30']), { date: TODAY, by: '16:30' });
    // 당겨진 외출 자신의 지금 마감(15:00)은 다른 외출의 마감이 아니라 빼지 않는다
    assert.deepEqual(target(['15:00']), { date: TODAY, by: '15:00' });
    // 없으면 null
    assert.equal(target(['11:00', '16:00']), null);
    assert.equal(target([]), null);
    assert.equal(backTargetOf({ day, outing: clamped, lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(backTargetOf({ day, outing: clamped, lastUploaded: null, nowMs: NOW }), null);

    // 다른 당겨진 외출의 마감은 실제 마감이 아니라 빼지 않는다
    const twoClamped = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [
      patientOuting({ id: 'a', departAt: '12:00', returnBy: '14:00', slackMin: -5 }),
      patientOuting({ id: 'b', departAt: '13:00', returnBy: '15:00', slackMin: -20 }),
    ]);
    assert.deepEqual(
      backTargetOf({ day: twoClamped, outing: twoClamped.outings[1], lastUploaded: { [TODAY]: ['14:00', '14:30'] }, nowMs: NOW }),
      { date: TODAY, by: '14:00' },
    );

    // 자정 뒤에도 외출이 속한 날의 올린 시각에서 찾는다
    const afterMidnight = backTargetOf({
      day,
      outing: clamped,
      lastUploaded: { [TODAY]: ['23:55'], '2026-11-21': ['13:30'] },
      nowMs: at('2026-11-21T00:05:00+09:00'),
    });
    assert.deepEqual(afterMidnight, { date: TODAY, by: '23:55' });
  });

  test('경우 2: 원래 마감이 아직 미래여도 당겨진 날에는 올린 시각을 모두 남긴다 (D1 보강)', () => {
    // 13:00 에 나가 원래 16:30 까지 돌아와야 하는 외출이 늦을 것 같아 마감이 지금으로 당겨졌다
    const outings = [
      patientOuting({ id: 'o1', departAt: '13:00', returnBy: '15:00', slackMin: -20 }),
      patientOuting({ id: 'o2', departAt: '17:00', returnBy: '19:00', slackMin: 30 }),
    ];
    // 12:30 은 앞 외출의 지난 마감, 16:30 은 이 외출의 원래 마감, 20:00 은 일정에서 빠진 외출의 마감이다
    const lastUploaded = { [TODAY]: ['12:30', '16:30', '20:00'], '2026-11-21': ['10:00'] };
    const day = returnNowDay(TODAY, REASON.OUTING_OVERDUE, outings);
    const state = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded, nowMs: NOW });
    // 원래 마감 16:30(미래)과 일정에서 빠진 외출의 마감 20:00(미래)도 남는다. 당겨진 15:00 은 올리지 않는다
    assert.deepEqual(todayDeadlines(state), ['12:30', '16:30', '19:00', '20:00']);
    // 다음 날은 당겨진 날이 아니라 지나지 않은 시각은 일정에 없으면 빠진다
    assert.deepEqual(state.days.find((d) => d.date === '2026-11-21').deadlines, []);
    // '돌아왔어요' 대상은 서버에 남아 있는 원래 마감이다
    const target = backTargetOf({ day, outing: outings[0], lastUploaded: state.nextLastUploaded, nowMs: NOW });
    assert.deepEqual(target, { date: TODAY, by: '16:30' });
    assert.ok(todayDeadlines(state).includes(target.by));

    // 같은 일정이 당겨진 날이 아니면 지나지 않은 올린 시각은 빠진다
    const plain = makeDayPlan(TODAY, { outings });
    const plainState = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: plain }), lastUploaded, nowMs: NOW });
    assert.deepEqual(todayDeadlines(plainState), ['12:30', '15:00', '19:00']);
  });
});

describe('되돌리기 마감과 대기열', () => {
  test('undoUntilMs: 23:55 마감은 다음 날 00:04:30', () => {
    assert.equal(undoUntilMs({ date: '2026-11-20', by: '23:55' }), at('2026-11-21T00:04:30+09:00'));
    assert.equal(undoUntilMs({ date: TODAY, by: '14:30' }), at('2026-11-20T14:39:30+09:00'));
    assert.equal(
      undoUntilMs({ date: TODAY, by: '14:30' }) - at('2026-11-20T14:30:00+09:00'),
      DEFAULTS.notifications.serverPushGraceMin * 60_000 - DEFAULTS.notifications.serverPushEarlyToleranceSec * 1000,
    );
  });

  test('applyBackAction: 같은 (date, by) 는 마지막 동작만, 대기 중 확인을 되돌리면 둘 다 사라진다', () => {
    const confirm = { date: TODAY, by: '14:30', undo: false };
    const undo = { date: TODAY, by: '14:30', undo: true };
    const queued = applyBackAction([], confirm);
    assert.deepEqual(queued, [confirm]);
    // 대기 중인 확인을 되돌리면 둘 다 사라진다(요청 없음)
    assert.deepEqual(applyBackAction(queued, undo), []);
    // 대기에 없는(이미 보낸) 확인을 되돌리면 되돌리기가 대기에 들어간다
    assert.deepEqual(applyBackAction([], undo), [undo]);
    // 같은 (date, by) 는 마지막 동작 하나만, 새 항목은 뒤에 붙는다
    const other = { date: YESTERDAY, by: '23:55', undo: false };
    assert.deepEqual(applyBackAction([undo, other], confirm), [other, confirm]);
    assert.deepEqual(applyBackAction([undo, other], undo), [other, undo]);
    assert.deepEqual(applyBackAction([confirm, other], confirm), [other, confirm]);
    // 시각이 같아도 날짜가 다르면 다른 마감이다
    const sameTimeYesterday = { date: YESTERDAY, by: '14:30', undo: false };
    assert.deepEqual(applyBackAction([sameTimeYesterday], undo), [sameTimeYesterday, undo]);
    // 받은 대기열을 바꾸지 않는다
    const frozen = Object.freeze([Object.freeze({ ...confirm })]);
    assert.deepEqual(applyBackAction(frozen, undo), []);
    assert.deepEqual(frozen, [confirm]);
    // 동작 모양이 틀리면 던진다
    assert.throws(() => applyBackAction([], { date: TODAY, by: '24:00', undo: false }), TypeError);
    assert.throws(() => applyBackAction([], { date: TODAY, by: '14:30' }), TypeError);
  });

  test('pruneBackQueue: 어제보다 앞 날짜를 버리고 20개를 넘지 않는다', () => {
    const queue = [
      { date: '2026-11-18', by: '10:00', undo: false },
      { date: YESTERDAY, by: '23:55', undo: false },
      { date: 'not-a-date', by: '10:00', undo: false },
      { date: TODAY, by: '14:30', undo: true },
    ];
    assert.deepEqual(pruneBackQueue(queue, NOW), [
      { date: YESTERDAY, by: '23:55', undo: false },
      { date: TODAY, by: '14:30', undo: true },
    ]);
    // 자정이 지나면 어제였던 날짜도 그제가 되어 버린다
    assert.deepEqual(pruneBackQueue(queue, at('2026-11-21T00:05:00+09:00')), [{ date: TODAY, by: '14:30', undo: true }]);

    const long = Array.from({ length: 25 }, (_, i) => ({ date: TODAY, by: `${String(10 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`, undo: false }));
    assert.deepEqual(pruneBackQueue([{ date: '2026-11-18', by: '09:00', undo: false }, ...long], NOW), long.slice(-20));
    assert.deepEqual(pruneBackQueue('x', NOW), []);
  });
});
