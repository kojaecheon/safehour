// 서버 알림에 올릴 상태, '돌아왔어요' 대상, 되돌리기 마감, 대기열 규칙 (lib/trip/watchPlan.js · docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 6, D1·D2·D5·D10)
//
// 이 파일이 고정하는 것
//   - 오늘부터 min(출국일, 오늘 + 45일)까지 날짜마다 마감 목록을 올리고 expiresOn 은 출국일이다. 어제는 올리지 않는다
//   - 더는 체류 날짜가 아닌 올린 날짜(입국이 늦춰짐)는 빈 목록으로 보내 지우고, 다음 lastUploaded 에 남기지 않는다.
//     오늘은 체류 날짜가 아니어도 고정된 지난 시각을 보낸다
//   - 출국일이 오늘보다 앞이면(일찍 귀국) 오늘 이후로 올린 날짜가 남았을 때만 expiresOn 을 오늘로, 오늘의 지난 시각만 보낸다
//   - D1: 지난 마감은 일정에서 빠져도 남기고, 지나지 않은 마감은 일정에 없으면 뺀다
//   - 오늘 지난 마감은 고정이다: 올린 적 없는 지난 시각은 새로 올리지 않는다(다르게 정한 것 24)
//   - 오늘 목록 = 고정된 지난 시각 + 묶이지 않은 외출의 지금 마감(지금 이후) + 묶인 외출(isHeldOuting: 당겨진 외출, 당김이 풀린
//     외출, 출발 시각에 고정된 마감, 올린 적 없는 지난 마감)의 원래 마감. 그 밖의 지나지 않은 올린 시각은 남기지 않는다
//   - 원래 마감: 마지막으로 올린 시각 중 출발보다 늦고 다음 외출의 출발보다 이르며 묶이지 않은 다른 외출의 마감이 아닌 가장 이른 것
//   - D2: 당겨진 외출의 마감은 새로 올리지 않는다. 다른 즉시 복귀 원인의 날은 실제 마감을 올린다
//   - nextLastUploaded 는 서버가 가진 것과 같다: 보낸 날짜(지운 날짜 빼고)와 어제만 남긴다(자정 뒤에도 by 를 찾는다)
//   - 체류의 날짜를 읽지 못하면 올리지 않는다. 일정의 날짜를 읽지 못하면 일찍 귀국한 체류의 줄이기만 한다
//   - 하루 10개 상한: 지금 마감을 먼저(그것만 넘으면 이른 10개), 다음 원래 마감, 남은 자리는 최근 지난 시각
//   - '돌아왔어요' 대상: 출발 전 없음, 경우 1 은 passedBy, 평소는 returnBy, 묶인 외출은 원래 마감(업로드와 같은 시각)
//   - 되돌리기 마감 = 마감 + serverPushGraceMin 분 - serverPushEarlyToleranceSec 초
//
// 시각은 모두 오프셋이 있는 문자열로 만든다. 기기 시간대와 벽시계를 읽지 않는다. 외부 호출은 없다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBackAction,
  backTargetOf,
  buildUploadState,
  isHeldOuting,
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
    // 오늘 지난 마감은 고정(다르게 정한 것 24)이라, 실제 마감이 올라가는 것은 지금 이후 마감이거나 이미 올린 지난 마감이다.
    // 고정 규칙 전에는 이 시험이 올린 적 없는 지난 마감(14:45)을 새로 올리는 것을 고정했다. 그 경우는 아래 '묶인 외출' 쪽이다
    for (const reason of [REASON.PATIENT_RECALLED, REASON.PLAN_REVOKED, REASON.PLAN_EXPIRED]) {
      const build = (returnBy, uploaded) => buildUploadState({
        stay: stayOf(),
        tripPlan: planOf({ [TODAY]: returnNowDay(TODAY, reason, [patientOuting({ departAt: '13:00', returnBy, slackMin: -20 })]) }),
        lastUploaded: { [TODAY]: uploaded },
        nowMs: NOW,
      });
      // 당겨진 날이 아니라 지나지 않은 '16:30' 은 일정에 없으면 빠지고, 외출의 실제 마감을 올린다
      assert.deepEqual(todayDeadlines(build('15:45', ['14:30', '16:30'])), ['14:30', '15:45'], reason);
      // 이미 올린 지난 실제 마감도 그대로 올린다
      assert.deepEqual(todayDeadlines(build('14:45', ['14:30', '14:45', '16:30'])), ['14:30', '14:45'], reason);
      // 올린 적 없는 지난 마감(14:45)은 새로 올리지 않는다. 묶인 외출의 원래 마감은 출발(13:00) 뒤 가장 이른 올린 시각 14:30 이고,
      // 원래 마감이 아닌 지나지 않은 16:30 은 남기지 않는다. 예전 규칙(묶인 외출이 있는 날은 올린 시각을 모두 남김)에서는
      // ['14:30', '16:30'] 이었다
      assert.deepEqual(todayDeadlines(build('14:45', ['14:30', '16:30'])), ['14:30'], reason);
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

    // 날짜는 시계의 오늘이 아니라 외출이 속한 날이다(23:55 는 자정 전에 올린 마감이다)
    const late = makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '22:00', returnBy: '23:55' })] });
    const afterMidnight = at('2026-11-21T00:05:00+09:00');
    assert.deepEqual(
      backTargetOf({ day: late, outing: late.outings[0], lastUploaded: { [TODAY]: ['23:55'] }, nowMs: afterMidnight }),
      { date: TODAY, by: '23:55' },
    );
    // 올린 적 없는 지난 마감은 서버에 없어 확인할 수 없다(묶인 외출, 다르게 정한 것 24). 고정 규칙 전에는 { date, by: '23:55' } 였다
    assert.equal(backTargetOf({ day: late, outing: late.outings[0], lastUploaded: {}, nowMs: afterMidnight }), null);

    // 하루나 외출이 없거나 시각이 아니면 null
    assert.equal(backTargetOf({ day: null, outing: o1, lastUploaded: {}, nowMs: NOW, passedBy: '14:30' }), null);
    assert.equal(backTargetOf({ day, outing: null, lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(backTargetOf({ day, outing: { ...o1, departAt: '25:00' }, lastUploaded: {}, nowMs: NOW }), null);
    assert.equal(backTargetOf({ day, outing: { ...o1, returnBy: null }, lastUploaded: {}, nowMs: NOW }), null);
  });

  test('backTargetOf 경우 2: 출발 뒤 다음 외출의 출발 전 가장 이른 올린 시각(미래여도), 다른 외출의 지금 마감은 뺀다, 없으면 null', () => {
    // 다음 외출의 출발(17:00)이 찾는 범위의 끝이다(다르게 정한 것 24). 예전 시험은 다음 외출이 15:30 에 출발했고 그 뒤 시각도
    // 찾았다. 다음 외출의 출발 뒤 시각은 그 외출의 마감일 수 있어 범위를 두었으므로, 시험의 시각이 범위 안에 들도록 o3 을
    // 17:00 출발로 옮기고, '다른 외출의 지금 마감'은 같은 창의 마감(16:00)을 그대로 가진 앞 외출 o1 로 본다
    const day = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [
      patientOuting({ id: 'o1', departAt: '09:00', returnBy: '16:00', slackMin: 10 }),
      patientOuting({ id: 'o2', departAt: '13:00', returnBy: '15:00', slackMin: -20 }),
      patientOuting({ id: 'o3', departAt: '17:00', returnBy: '18:00', slackMin: 30 }),
    ]);
    const clamped = day.outings[1];
    const target = (times, nowMs = NOW) => backTargetOf({ day, outing: clamped, lastUploaded: { [TODAY]: times }, nowMs });

    // 출발(13:00) 이전 시각은 이 외출의 마감이 아니다
    // 출발과 같은 시각(바로 앞 외출이 13:00 에 돌아오는 마감이었고 그 외출은 일정에서 빠졌다)도 아니다
    assert.deepEqual(target(['13:00', '16:30', '19:00']), { date: TODAY, by: '16:30' });
    assert.deepEqual(target(['11:00', '14:30', '16:30']), { date: TODAY, by: '14:30' });
    // 원래 마감이 아직 미래여도 그 시각이다
    assert.deepEqual(target(['11:00', '16:30', '19:00']), { date: TODAY, by: '16:30' });
    // 같은 날 다른 외출(당겨지지 않은)의 지금 마감은 뺀다
    assert.deepEqual(target(['11:00', '16:00', '16:30']), { date: TODAY, by: '16:30' });
    // 당겨진 외출 자신의 지금 마감(15:00)은 다른 외출의 마감이 아니라 빼지 않는다
    assert.deepEqual(target(['15:00']), { date: TODAY, by: '15:00' });
    // 다음 외출의 출발(17:00)과 같거나 늦은 시각은 그 외출의 마감일 수 있어 보지 않는다
    assert.equal(target(['11:00', '17:00', '18:30']), null);
    assert.deepEqual(target(['16:59', '17:00']), { date: TODAY, by: '16:59' });
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

    // 자정 뒤에도 외출이 속한 날의 올린 시각에서 찾는다(다음 외출이 없는 하루라 23:55 까지 범위다)
    const lastOuting = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [day.outings[0], clamped]);
    const afterMidnight = backTargetOf({
      day: lastOuting,
      outing: clamped,
      lastUploaded: { [TODAY]: ['23:55'], '2026-11-21': ['13:30'] },
      nowMs: at('2026-11-21T00:05:00+09:00'),
    });
    assert.deepEqual(afterMidnight, { date: TODAY, by: '23:55' });
  });

  test('경우 2: 원래 마감이 아직 미래여도 남기고, 일정에서 빠진 외출의 지나지 않은 마감은 남기지 않는다', () => {
    // 13:00 에 나가 원래 16:30 까지 돌아와야 하는 외출이 늦을 것 같아 마감이 지금으로 당겨졌다
    const outings = [
      patientOuting({ id: 'o1', departAt: '13:00', returnBy: '15:00', slackMin: -20 }),
      patientOuting({ id: 'o2', departAt: '17:00', returnBy: '19:00', slackMin: 30 }),
    ];
    // 12:30 은 앞 외출의 지난 마감, 16:30 은 이 외출의 원래 마감, 20:00 은 일정에서 빠진 외출의 마감이다
    const lastUploaded = { [TODAY]: ['12:30', '16:30', '20:00'], '2026-11-21': ['10:00'] };
    const day = returnNowDay(TODAY, REASON.OUTING_OVERDUE, outings);
    const state = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded, nowMs: NOW });
    // 원래 마감 16:30(미래, 다음 외출 출발 17:00 전)은 남는다. 당겨진 15:00 은 올리지 않는다.
    // 일정에서 빠진 외출의 마감 20:00(미래)은 원래 마감이 아니라 남기지 않는다(남기면 확인 버튼 없는 거짓 알림이 간다).
    // 예전 규칙(묶인 외출이 있는 날은 올린 시각을 모두 남김)에서는 20:00 도 남았다
    assert.deepEqual(todayDeadlines(state), ['12:30', '16:30', '19:00']);
    // 다음 날은 당겨진 날이 아니라 지나지 않은 시각은 일정에 없으면 빠진다
    assert.deepEqual(state.days.find((d) => d.date === '2026-11-21').deadlines, []);
    // '돌아왔어요' 대상은 서버에 남아 있는 원래 마감이다
    const target = backTargetOf({ day, outing: outings[0], lastUploaded: state.nextLastUploaded, nowMs: NOW });
    assert.deepEqual(target, { date: TODAY, by: '16:30' });
    assert.ok(todayDeadlines(state).includes(target.by));

    // 같은 일정이 당겨진 날이 아니고 묶인 외출도 없으면(14:50, 15:00 마감이 아직 지나지 않음) 지나지 않은 올린 시각은 빠진다.
    // 지금이 15:00 이면 15:00 마감이 지났고 올린 적이 없어 묶인 외출이다(아래 '당김이 풀린 외출' 시험). 그래서 시각을 14:50 으로 옮겼다
    const plain = makeDayPlan(TODAY, { outings });
    const plainNow = at('2026-11-20T14:50:00+09:00');
    const plainState = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: plain }), lastUploaded, nowMs: plainNow });
    assert.deepEqual(todayDeadlines(plainState), ['12:30', '15:00', '19:00']);
  });
});

describe('묶인 외출과 오늘 지난 마감 고정 (다르게 정한 것 24)', () => {
  test('isHeldOuting: 당겨진 외출이거나, 출발했고 마감도 지났는데 그 마감을 올린 적 없는 외출', () => {
    const outing = (o) => patientOuting({ departAt: '13:00', returnBy: '14:30', slackMin: 5, ...o });
    const plain = (o) => makeDayPlan(TODAY, { outings: [outing(o)] });
    const held = (day, uploaded) => isHeldOuting({ day, outing: day.outings[0], lastUploaded: { [TODAY]: uploaded }, nowMs: NOW });

    // 당겨진 외출은 올린 시각과 상관없이 묶여 있다
    const clamped = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [outing({ slackMin: -20 })]);
    assert.equal(held(clamped, ['14:30']), true);
    // 지난 마감을 올린 적이 없으면 묶여 있고, 올렸으면 묶이지 않았다
    assert.equal(held(plain(), []), true);
    assert.equal(held(plain(), ['12:00', '16:30']), true);
    assert.equal(held(plain(), ['14:30']), false);
    // 마감이 지금이면 지난 것이다
    assert.equal(held(plain({ returnBy: '15:00' }), []), true);
    // 마감이 아직이거나 출발 전이면 묶이지 않았다
    assert.equal(held(plain({ returnBy: '15:01' }), []), false);
    assert.equal(held(plain({ departAt: '15:30', returnBy: '17:00' }), []), false);
    // 날짜는 외출이 속한 날의 올린 시각으로 본다(자정 뒤 어제 외출)
    assert.equal(
      isHeldOuting({ day: plain(), outing: plain().outings[0], lastUploaded: { [TODAY]: ['14:30'] }, nowMs: at('2026-11-21T00:05:00+09:00') }),
      false,
    );
    // 모양이 틀리면 묶이지 않았다
    assert.equal(held(plain({ returnBy: null }), []), false);
    assert.equal(isHeldOuting({ day: { ...plain(), date: undefined }, outing: outing(), lastUploaded: {}, nowMs: NOW }), false);
    assert.equal(isHeldOuting({ day: plain(), outing: null, lastUploaded: {}, nowMs: NOW }), false);
    assert.equal(isHeldOuting(), false);
  });

  test('당김이 풀린 외출: 당겨 둔 지난 마감을 새로 올리지 않고 원래 마감을 남기며, 돌아왔어요는 원래 마감이다', () => {
    // 13:00 에 나가 16:30 마감을 올렸고, 늦을 것 같아 마감이 14:30 으로 당겨졌다가 15:00 에 입력이 바뀌어 당김이 풀렸다.
    // 외출은 당겨 둔 14:30 을 그대로 갖고 있다
    const lastUploaded = { [TODAY]: ['12:00', '16:30'] };
    const stay = stayOf();
    const clampedDay = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [patientOuting({ departAt: '13:00', returnBy: '14:30', slackMin: -20 })]);
    const releasedDay = makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '13:00', returnBy: '14:30', slackMin: 5 })] });

    for (const [name, day] of [['당겨진 동안', clampedDay], ['풀린 뒤', releasedDay]]) {
      const state = buildUploadState({ stay, tripPlan: planOf({ [TODAY]: day }), lastUploaded, nowMs: NOW });
      // 14:30 을 새로 올리면 곧바로 보호자 알림이 가고, 16:30 이 빠지면 알림을 놓친다
      assert.deepEqual(todayDeadlines(state), ['12:00', '16:30'], name);
      assert.equal(isHeldOuting({ day, outing: day.outings[0], lastUploaded, nowMs: NOW }), true, name);
      assert.deepEqual(backTargetOf({ day, outing: day.outings[0], lastUploaded, nowMs: NOW }), { date: TODAY, by: '16:30' }, name);
      assert.deepEqual(backTargetOf({ day, outing: day.outings[0], lastUploaded: state.nextLastUploaded, nowMs: NOW }), { date: TODAY, by: '16:30' }, name);
    }
  });

  test('처음 등록이 외출 마감 뒤면 지난 마감을 올리지 않고 돌아왔어요 대상도 없다', () => {
    // 15:00 에 처음 등록: 13:00 에 나가 14:30 까지 돌아올 외출이 있다(올린 적 없음). 17:00 외출의 19:00 마감은 올린다
    const day = makeDayPlan(TODAY, {
      outings: [
        patientOuting({ id: 'o1', departAt: '13:00', returnBy: '14:30' }),
        patientOuting({ id: 'o2', departAt: '17:00', returnBy: '19:00' }),
      ],
    });
    for (const lastUploaded of [{}, undefined, null]) {
      const state = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded, nowMs: NOW });
      assert.deepEqual(todayDeadlines(state), ['19:00'], String(lastUploaded));
      assert.equal(backTargetOf({ day, outing: day.outings[0], lastUploaded, nowMs: NOW }), null, String(lastUploaded));
      assert.equal(backTargetOf({ day, outing: day.outings[0], lastUploaded: state.nextLastUploaded, nowMs: NOW }), null);
    }
    // 마감 전에 등록했다면 그 마감을 올린다
    const early = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded: {}, nowMs: at('2026-11-20T14:00:00+09:00') });
    assert.deepEqual(todayDeadlines(early), ['14:30', '19:00']);
  });
});

describe('오늘 목록 좁히기와 하루 10개 상한 (다르게 정한 것 24, 재검토 반영)', () => {
  /** 올린 뒤 서버가 가진 것으로 다음 상태를 만든다(서버 모형: 보낸 목록이 그 날짜 목록을 통째로 바꾼다) */
  const recordAfter = (state) => ({
    watchId: 'AbCdEfGhIjKlMnOpQrSt_-',
    writeToken: 'T'.repeat(43),
    expiresOn: state.expiresOn,
    lastUploaded: state.nextLastUploaded,
    uploadPending: false,
    backQueue: [],
    state: 'ON',
  });

  test('출발 시각에 고정된 마감(정거장 0개 외출)은 당겨진 외출이다: 당김이 풀려도 원래 마감을 남기고 앞 외출의 마감을 확인하지 않는다', () => {
    // A 는 13:00 까지 돌아오는 마감을 올렸고 돌아왔다. B 는 13:00 에 나가 17:00 마감을 올렸다가, 늦어 마감이 출발 시각(13:00)에
    // 고정됐다(src/engine/dayRepair.js). 그 뒤 당김이 풀려도 B 는 13:00 을 그대로 갖는다(A 의 올린 마감과 같은 시각이다)
    const a = patientOuting({ id: 'a', departAt: '11:00', returnBy: '13:00' });
    const b = patientOuting({ id: 'b', departAt: '13:00', returnBy: '13:00', slackMin: -30 });
    const lastUploaded = { [TODAY]: ['13:00', '17:00'] };
    const clampedDay = returnNowDay(TODAY, REASON.OUTING_OVERDUE, [a, b]);
    const releasedDay = makeDayPlan(TODAY, { outings: [a, b] });
    for (const [name, day] of [['당겨진 동안', clampedDay], ['풀린 뒤', releasedDay]]) {
      const state = buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: day }), lastUploaded, nowMs: NOW });
      assert.equal(isHeldOuting({ day, outing: b, lastUploaded, nowMs: NOW }), true, name);
      assert.equal(isHeldOuting({ day, outing: a, lastUploaded, nowMs: NOW }), false, name);
      // 원래 마감 17:00 이 남는다. 예전에는 풀린 뒤 ['13:00'] 이었고 B 의 '돌아왔어요'가 A 의 13:00 을 확인했다
      assert.deepEqual(todayDeadlines(state), ['13:00', '17:00'], name);
      assert.deepEqual(backTargetOf({ day, outing: b, lastUploaded, nowMs: NOW }), { date: TODAY, by: '17:00' }, name);
      assert.deepEqual(backTargetOf({ day, outing: a, lastUploaded, nowMs: NOW }), { date: TODAY, by: '13:00' }, name);
    }
    // 출발 전이면 출발 시각과 같은 마감은 아직 묶인 것이 아니다(지금 마감으로 올린다)
    const notYet = makeDayPlan(TODAY, { outings: [patientOuting({ id: 'c', departAt: '16:00', returnBy: '16:00', slackMin: -5 })] });
    assert.equal(isHeldOuting({ day: notYet, outing: notYet.outings[0], lastUploaded: {}, nowMs: NOW }), false);

    // 마감이 예상 귀가보다 이른 외출(isPulledDeadlineOuting)도 당김이 풀린 날에 묶인 외출이다
    const pulled = makeDayPlan(TODAY, {
      outings: [patientOuting({ id: 'p', departAt: '13:00', returnBy: '14:00', plannedReturnAt: '16:10', slackMin: -20 })],
    });
    const pulledUploaded = { [TODAY]: ['12:00', '16:30'] };
    assert.equal(isHeldOuting({ day: pulled, outing: pulled.outings[0], lastUploaded: pulledUploaded, nowMs: NOW }), true);
    assert.deepEqual(
      todayDeadlines(buildUploadState({ stay: stayOf(), tripPlan: planOf({ [TODAY]: pulled }), lastUploaded: pulledUploaded, nowMs: NOW })),
      ['12:00', '16:30'],
    );
  });

  test('늦게 등록한 뒤 저녁 외출의 마감이 바뀌면 예전 마감은 다음 올리기에서 빠진다(다음 외출의 출발이 찾는 범위의 끝)', () => {
    // 15:00 에 처음 등록: 아침 외출(10:00 출발, 12:00 마감)은 올린 적이 없어 묶여 있다. 저녁 외출은 17:00 출발 18:00 마감
    const morning = patientOuting({ id: 'z', departAt: '10:00', returnBy: '12:00' });
    const evening = (returnBy) => patientOuting({ id: 'e', departAt: '17:00', returnBy });
    const tripOf = (outings) => planOf({ [TODAY]: makeDayPlan(TODAY, { outings }) });
    const first = buildUploadState({ stay: stayOf(), tripPlan: tripOf([morning, evening('18:00')]), lastUploaded: {}, nowMs: NOW });
    assert.deepEqual(todayDeadlines(first), ['18:00']);

    // 16:30 재계획으로 저녁 마감이 17:30 으로 당겨졌다. 18:00 은 다음 외출(17:00 출발)의 출발 뒤라 아침 외출의 원래 마감이 아니다
    const replanned = tripOf([morning, evening('17:30')]);
    const at1630 = at('2026-11-20T16:30:00+09:00');
    const second = buildUploadState({ stay: stayOf(), tripPlan: replanned, lastUploaded: first.nextLastUploaded, nowMs: at1630 });
    assert.deepEqual(todayDeadlines(second), ['17:30'], '예전에는 [17:30, 18:00] 이었다(18:00 은 확인할 버튼 없는 거짓 알림)');
    assert.equal(isSameUpload(recordAfter(first), second), false);
    const day = replanned.days[TODAY];
    assert.equal(isHeldOuting({ day, outing: morning, lastUploaded: second.nextLastUploaded, nowMs: at1630 }), true);
    assert.equal(backTargetOf({ day, outing: morning, lastUploaded: second.nextLastUploaded, nowMs: at1630 }), null);
    assert.deepEqual(
      backTargetOf({ day, outing: day.outings[1], lastUploaded: second.nextLastUploaded, nowMs: at('2026-11-20T17:20:00+09:00') }),
      { date: TODAY, by: '17:30' },
    );
    // 올린 뒤에는 같은 상태다
    assert.equal(isSameUpload(recordAfter(second), buildUploadState({ stay: stayOf(), tripPlan: replanned, lastUploaded: second.nextLastUploaded, nowMs: at1630 })), true);

    // 알고 남기는 것: 저녁 외출이 아예 빠지면 다음 외출이 없어 범위 끝이 없다. 지난 마감을 올린 적 없는 아침 외출은 그 뒤에 올린
    // 18:00 을 원래 마감으로 본다. 기록만으로는 당김이 풀린 외출(원래 마감을 잃으면 알림을 놓친다)과 구별할 수 없어 남기고,
    // 아침 외출의 '돌아왔어요'가 그 시각을 확인한다
    const removed = tripOf([morning]);
    const at1600 = at('2026-11-20T16:00:00+09:00');
    const third = buildUploadState({ stay: stayOf(), tripPlan: removed, lastUploaded: first.nextLastUploaded, nowMs: at1600 });
    assert.deepEqual(todayDeadlines(third), ['18:00']);
    assert.deepEqual(backTargetOf({ day: removed.days[TODAY], outing: morning, lastUploaded: third.nextLastUploaded, nowMs: at1600 }), { date: TODAY, by: '18:00' });
  });

  test('묶인 외출이 있는 날의 하루 10개 상한은 지금 마감을 먼저 지키고, 다음은 원래 마감, 남은 자리는 최근 지난 시각이다', () => {
    // 14:00 에 나간 외출의 마감이 당겨졌다(원래 15:20, 다음 외출은 15:30 출발). 지금 마감은 30분마다 나가는 외출의 것이다
    const clamped = patientOuting({ id: 'c', departAt: '14:00', returnBy: '14:40', slackMin: -10 });
    const liveOutings = (n) => Array.from({ length: n }, (_, i) => {
      const departMin = 15 * 60 + 30 + i * 30;
      const clock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      return patientOuting({ id: `l${i}`, departAt: clock(departMin), returnBy: clock(departMin + 20) });
    });
    const past = ['09:00', '09:30', '10:00', '10:30', '11:00'];
    // 21:30 은 일정에서 빠진 외출의 마감이다(다음 외출의 출발 뒤라 원래 마감이 아니다)
    const lastUploaded = { [TODAY]: [...past, '15:20', '21:30'] };
    const build = (n) => {
      const outings = [clamped, ...liveOutings(n)];
      const tripPlan = planOf({ [TODAY]: returnNowDay(TODAY, REASON.OUTING_OVERDUE, outings) });
      return { live: outings.slice(1).map((o) => o.returnBy), state: buildUploadState({ stay: stayOf(), tripPlan, lastUploaded, nowMs: NOW }), tripPlan };
    };

    // 지금 마감 9개 + 원래 마감 = 10: 지난 시각은 모두 빠진다
    const nine = build(9);
    assert.deepEqual(todayDeadlines(nine.state), ['15:20', ...nine.live]);
    // 지금 마감 8개 + 원래 마감 + 가장 최근 지난 시각
    const eight = build(8);
    assert.deepEqual(todayDeadlines(eight.state), ['11:00', '15:20', ...eight.live]);
    // 지금 마감만 10개: 원래 마감과 지난 시각이 빠진다
    const ten = build(10);
    assert.deepEqual(todayDeadlines(ten.state), ten.live);
    // 지금 마감만 11개: 이른 10개
    const eleven = build(11);
    assert.deepEqual(todayDeadlines(eleven.state), eleven.live.slice(0, 10));

    for (const { live, state, tripPlan } of [nine, eight, ten, eleven]) {
      const sent = todayDeadlines(state);
      assert.equal(sent.length, WATCH_UPLOAD_MAX_PER_DAY);
      assert.ok(!sent.includes('21:30'));
      // 지금 마감이 빠졌으면 그보다 낮은 시각(원래 마감, 지난 시각)은 남지 않는다
      if (live.some((time) => !sent.includes(time))) assert.ok(sent.every((time) => live.includes(time)));
      // 올린 뒤 다시 만들어도 같다(같은 업로드를 되풀이하지 않는다)
      assert.equal(isSameUpload(recordAfter(state), buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: state.nextLastUploaded, nowMs: NOW })), true);
    }
    // 원래 마감이 남은 동안 '돌아왔어요'는 그 시각이다
    const nineDay = nine.tripPlan.days[TODAY];
    assert.deepEqual(backTargetOf({ day: nineDay, outing: nineDay.outings[0], lastUploaded: nine.state.nextLastUploaded, nowMs: NOW }), { date: TODAY, by: '15:20' });
  });

  test('출국일을 줄여도 오늘 이후면 줄인 날까지만 보내고, 그 뒤 날짜는 남기지 않는다(서버가 expiresOn 으로 지운다)', () => {
    const outingDays = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
    const tripPlan = planOf(Object.fromEntries(outingDays.map((date) => [date, makeDayPlan(date, { outings: [patientOuting({ departAt: '13:00', returnBy: '16:00' })] })])));
    const before = buildUploadState({ stay: stayOf(), tripPlan, lastUploaded: {}, nowMs: at('2026-11-20T10:00:00+09:00') });
    assert.deepEqual(before.days.map((day) => day.date), [TODAY, ...outingDays]);

    const shortened = stayOf('2026-11-18', '2026-11-22');
    const state = buildUploadState({ stay: shortened, tripPlan, lastUploaded: before.nextLastUploaded, nowMs: NOW });
    assert.equal(state.expiresOn, '2026-11-22');
    assert.deepEqual(state.days, [
      { date: TODAY, deadlines: [] },
      { date: '2026-11-21', deadlines: ['16:00'] },
      { date: '2026-11-22', deadlines: ['16:00'] },
    ]);
    assert.deepEqual(Object.keys(state.nextLastUploaded).sort(), [TODAY, '2026-11-21', '2026-11-22']);
    assert.equal(isSameUpload(recordAfter(before), state), false, '출국일이 달라 다시 올린다');
    assert.equal(isSameUpload(recordAfter(state), buildUploadState({ stay: shortened, tripPlan, lastUploaded: state.nextLastUploaded, nowMs: NOW })), true);

    // 출국일을 오늘로 줄이면 오늘 하루만 보낸다
    const today = buildUploadState({ stay: stayOf('2026-11-18', TODAY), tripPlan, lastUploaded: before.nextLastUploaded, nowMs: NOW });
    assert.equal(today.expiresOn, TODAY);
    assert.deepEqual(today.days, [{ date: TODAY, deadlines: [] }]);
    assert.deepEqual(Object.keys(today.nextLastUploaded), [TODAY]);
  });
});

describe('체류가 줄거나 일찍 귀국한 경우의 남은 날짜', () => {
  // 11-10 에 체류 11-18 ~ 11-24 로 올렸다. 11-18 ~ 11-21 에 13:00 출발 16:00 마감 외출이 있다
  const firstPlan = planOf(Object.fromEntries(
    ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((date) => [
      date,
      makeDayPlan(date, { outings: [patientOuting({ departAt: '13:00', returnBy: '16:00' })] }),
    ]),
  ));
  const first = buildUploadState({ stay: stayOf(), tripPlan: firstPlan, lastUploaded: {}, nowMs: at('2026-11-10T12:00:00+09:00') });
  const recordOf = (state, expiresOn = state.expiresOn) => ({
    watchId: 'AbCdEfGhIjKlMnOpQrSt_-',
    writeToken: 'T'.repeat(43),
    expiresOn,
    lastUploaded: state.nextLastUploaded,
    uploadPending: false,
    backQueue: [],
    state: 'ON',
  });
  const dayOf = (state, date) => state.days.find((day) => day.date === date)?.deadlines;

  test('입국이 11-18 에서 11-20 으로 늦춰지면 11-18·11-19 를 빈 목록으로 보내 지운다 (11-18 에 볼 때)', () => {
    assert.deepEqual(first.days.filter((day) => day.deadlines.length > 0).map((day) => day.date), ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    const record = recordOf(first);
    // 일정에 남은 11-18·11-19 의 하루는 체류 날짜가 아니라 보지 않는다
    const stay = stayOf('2026-11-20', '2026-11-24');
    const nowMs = at('2026-11-18T12:00:00+09:00');
    const state = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: record.lastUploaded, nowMs });
    assert.equal(state.expiresOn, '2026-11-24');
    assert.deepEqual(state.days, [
      { date: '2026-11-18', deadlines: [] },
      { date: '2026-11-19', deadlines: [] },
      { date: '2026-11-20', deadlines: ['16:00'] },
      { date: '2026-11-21', deadlines: ['16:00'] },
      { date: '2026-11-22', deadlines: [] },
      { date: '2026-11-23', deadlines: [] },
      { date: '2026-11-24', deadlines: [] },
    ]);
    // 지운 날짜는 다음 lastUploaded 에 남기지 않는다(서버에 없다). 체류 날짜의 빈 목록은 그대로 남는다
    assert.deepEqual(Object.keys(state.nextLastUploaded).sort(), ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    assert.equal(isSameUpload(record, state), false);

    // 올린 뒤에는 같은 상태로 보고 다시 올리지 않는다. 나중에 같은 상태도 같다
    const after = recordOf(state);
    const again = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: after.lastUploaded, nowMs });
    assert.deepEqual(again.days.map((day) => day.date), ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    assert.equal(isSameUpload(after, again), true);
    const later = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: after.lastUploaded, nowMs: at('2026-11-18T22:00:00+09:00') });
    assert.equal(isSameUpload(after, later), true);

    // 이미 지운 날짜(빈 목록)만 남았으면 서버에 할 일이 없다
    const emptied = { ...after, lastUploaded: { ...after.lastUploaded, '2026-11-19': [] } };
    const withEmpty = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: emptied.lastUploaded, nowMs });
    assert.deepEqual(dayOf(withEmpty, '2026-11-19'), []);
    assert.equal(isSameUpload(emptied, withEmpty), true);
    assert.equal(Object.hasOwn(withEmpty.nextLastUploaded, '2026-11-19'), false);

    // 오늘(11-18)의 마감이 이미 지났으면 오늘은 그 지난 시각을 남긴다(고정, D1). 11-19 는 지운다
    const evening = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: record.lastUploaded, nowMs: at('2026-11-18T17:00:00+09:00') });
    assert.deepEqual(dayOf(evening, '2026-11-18'), ['16:00']);
    assert.deepEqual(dayOf(evening, '2026-11-19'), []);
    assert.deepEqual(evening.nextLastUploaded['2026-11-18'], ['16:00']);
    assert.equal(Object.hasOwn(evening.nextLastUploaded, '2026-11-19'), false);
    assert.equal(isSameUpload(recordOf(evening), buildUploadState({
      stay, tripPlan: firstPlan, lastUploaded: evening.nextLastUploaded, nowMs: at('2026-11-18T17:00:00+09:00'),
    })), true);
  });

  test('입국이 늦춰진 것을 11-19 에 처음 보면 어제(11-18)는 보내지 않고 남기며, 오늘(11-19)은 빈 목록으로 지운다', () => {
    const stay = stayOf('2026-11-20', '2026-11-24');
    const state = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: first.nextLastUploaded, nowMs: at('2026-11-19T12:00:00+09:00') });
    assert.deepEqual(state.days.map((day) => day.date), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    assert.deepEqual(dayOf(state, '2026-11-19'), []);
    assert.deepEqual(dayOf(state, '2026-11-20'), ['16:00']);
    assert.deepEqual(state.nextLastUploaded['2026-11-18'], ['16:00'], '어제는 남긴다');
    assert.equal(Object.hasOwn(state.nextLastUploaded, '2026-11-19'), false);
    assert.equal(isSameUpload(recordOf(first), state), false);
    const again = buildUploadState({ stay, tripPlan: firstPlan, lastUploaded: state.nextLastUploaded, nowMs: at('2026-11-19T12:00:00+09:00') });
    assert.equal(isSameUpload(recordOf(state), again), true);
  });

  test('입국이 오늘보다 뒤로 늦춰져 오늘이 체류 날짜가 아니면 오늘은 고정된 지난 시각만 보낸다', () => {
    // 11-20 15:00. 체류가 11-18 ~ 11-24 에서 11-25 ~ 11-30 으로 바뀌었다. 일정에 남은 오늘 하루(18:00 마감)는 보지 않는다
    const lastUploaded = {
      [YESTERDAY]: ['16:00'],
      [TODAY]: ['14:30', '16:30'],
      '2026-11-21': ['12:30'],
      '2026-11-22': [],
      '2026-11-23': [],
      '2026-11-24': [],
    };
    const stale = planOf({ [TODAY]: makeDayPlan(TODAY, { outings: [patientOuting({ departAt: '16:00', returnBy: '18:00' })] }) });
    const state = buildUploadState({ stay: stayOf('2026-11-25', '2026-11-30'), tripPlan: stale, lastUploaded, nowMs: NOW });
    assert.equal(state.expiresOn, '2026-11-30');
    assert.deepEqual(state.days, [
      { date: TODAY, deadlines: ['14:30'] },
      { date: '2026-11-21', deadlines: [] },
      { date: '2026-11-22', deadlines: [] },
      { date: '2026-11-23', deadlines: [] },
      { date: '2026-11-24', deadlines: [] },
      { date: '2026-11-25', deadlines: [] },
      { date: '2026-11-26', deadlines: [] },
      { date: '2026-11-27', deadlines: [] },
      { date: '2026-11-28', deadlines: [] },
      { date: '2026-11-29', deadlines: [] },
      { date: '2026-11-30', deadlines: [] },
    ]);
    assert.deepEqual(Object.keys(state.nextLastUploaded).sort(), [
      YESTERDAY, TODAY, '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30',
    ]);
    assert.deepEqual(state.nextLastUploaded[TODAY], ['14:30']);
    const after = { ...recordOf(state), lastUploaded: state.nextLastUploaded };
    assert.equal(isSameUpload(after, buildUploadState({ stay: stayOf('2026-11-25', '2026-11-30'), tripPlan: stale, lastUploaded: after.lastUploaded, nowMs: NOW })), true);

    // 오늘 지난 시각이 없으면 오늘도 빈 목록으로 지우고 남기지 않는다
    const morning = buildUploadState({ stay: stayOf('2026-11-25', '2026-11-30'), tripPlan: stale, lastUploaded, nowMs: at('2026-11-20T09:00:00+09:00') });
    assert.deepEqual(dayOf(morning, TODAY), []);
    assert.equal(Object.hasOwn(morning.nextLastUploaded, TODAY), false);
  });

  test('출국일을 어제로 고치면 expiresOn 을 오늘로 줄이고 오늘의 지난 시각만 보낸다', () => {
    const stay = stayOf('2026-11-15', YESTERDAY);
    const lastUploaded = { [YESTERDAY]: ['18:00'], [TODAY]: ['14:30', '16:30'], '2026-11-21': ['10:00'], '2026-11-22': [] };
    const state = buildUploadState({ stay, tripPlan: planOf({}), lastUploaded, nowMs: NOW });
    assert.equal(state.expiresOn, TODAY, '서버가 오늘 뒤 날짜 기록을 지운다');
    assert.deepEqual(state.days, [{ date: TODAY, deadlines: ['14:30'] }]);
    assert.deepEqual(state.nextLastUploaded, { [YESTERDAY]: ['18:00'], [TODAY]: ['14:30'] });
    assert.equal(state.key, JSON.stringify({ expiresOn: TODAY, days: state.days }));
    const before = recordOf(first, '2026-11-24');
    assert.equal(isSameUpload({ ...before, lastUploaded }, state), false);
    // 올린 뒤에는 같은 상태다
    const after = recordOf(state);
    assert.equal(isSameUpload(after, buildUploadState({ stay, tripPlan: planOf({}), lastUploaded: after.lastUploaded, nowMs: NOW })), true);
    // 자정이 지나면 오늘 이후로 올린 날짜가 없어 할 일이 없다
    assert.equal(buildUploadState({ stay, tripPlan: planOf({}), lastUploaded: after.lastUploaded, nowMs: at('2026-11-21T00:05:00+09:00') }), null);

    // 오늘 지난 시각이 없으면 오늘도 지우고, 다음에는 할 일이 없다
    const morning = buildUploadState({ stay, tripPlan: planOf({}), lastUploaded, nowMs: at('2026-11-20T09:00:00+09:00') });
    assert.deepEqual(morning.days, [{ date: TODAY, deadlines: [] }]);
    assert.deepEqual(morning.nextLastUploaded, { [YESTERDAY]: ['18:00'] });
    assert.equal(buildUploadState({ stay, tripPlan: planOf({}), lastUploaded: morning.nextLastUploaded, nowMs: at('2026-11-20T09:00:00+09:00') }), null);

    // 오늘 이후로 올린 날짜가 없으면 null
    assert.equal(buildUploadState({ stay, tripPlan: planOf({}), lastUploaded: { [YESTERDAY]: ['18:00'] }, nowMs: NOW }), null);
    // 체류를 읽을 수 없으면 null
    assert.equal(buildUploadState({ stay: { ...stay, arrival: { date: 'x' } }, tripPlan: planOf({}), lastUploaded, nowMs: NOW }), null);
  });

  test('입국이 46일 범위보다 멀어도 오늘 + 45일까지만 보낸다', () => {
    const state = buildUploadState({ stay: stayOf('2026-12-20', '2027-01-31'), tripPlan: planOf({}), lastUploaded: {}, nowMs: NOW });
    assert.equal(state.days[0].date, '2026-12-20');
    assert.equal(state.days.at(-1).date, '2027-01-04', '서버가 받는 마지막 날(오늘 + 45일)');
    assert.ok(state.days.length <= WATCH_UPLOAD_MAX_DAYS);
  });

  test('일정의 날짜 목록을 읽을 수 없으면 null (빈 목록으로 서버 기록을 지우지 않는다), 일찍 귀국한 체류의 줄이기는 한다', () => {
    const lastUploaded = { [TODAY]: ['12:00', '16:30'], '2026-11-21': ['10:00', '18:00'] };
    const shrunk = buildUploadState({ stay: stayOf('2026-11-15', YESTERDAY), tripPlan: planOf({}), lastUploaded, nowMs: NOW });
    assert.deepEqual(shrunk.days, [{ date: TODAY, deadlines: ['12:00'] }]);
    for (const tripPlan of [null, undefined, {}, { days: null }, { days: [] }, { days: 'x' }]) {
      assert.equal(buildUploadState({ stay: stayOf(), tripPlan, lastUploaded, nowMs: NOW }), null, JSON.stringify(tripPlan));
      // 일찍 귀국은 일정을 보지 않는다: 일정을 읽지 못해도 expiresOn 을 오늘로 줄여 남은 날짜의 예약을 지운다.
      // 예전에는 여기서도 null 이라, 일정 레코드가 깨진 기기에서는 남은 날짜의 보호자 알림이 서버에 남았다
      assert.deepEqual(
        buildUploadState({ stay: stayOf('2026-11-15', YESTERDAY), tripPlan, lastUploaded, nowMs: NOW }),
        shrunk,
        JSON.stringify(tripPlan),
      );
    }
    // 체류를 읽을 수 없으면 일찍 귀국이어도 null
    assert.equal(buildUploadState({ stay: { ...stayOf('2026-11-15', YESTERDAY), arrival: { date: 'x' } }, tripPlan: null, lastUploaded, nowMs: NOW }), null);
    // 빈 일정(날짜 목록은 있음)은 읽은 것이다
    assert.notEqual(buildUploadState({ stay: stayOf(), tripPlan: planOf({}), lastUploaded, nowMs: NOW }), null);
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
