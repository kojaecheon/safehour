// 받은 일정 화면의 순수 도우미 (사용성 점검 D3)
//
// - 같은 시각·같은 장소의 환자 복귀 마감은 한 줄로 합친다(순서 유지)
// - 맨 위 '오늘 환자 복귀 마감' 카드: 오늘(KST) 마감 가운데 아직 지나지 않은 가장 가까운 것,
//   모두 지났으면 가장 늦게 지난 것. 오늘 외출이 없으면 none, 오늘이 사본 범위 밖이면 null
// - 서버 상태 조회의 '복귀 확인'(계획 2026-11-15 A-3 Task 7, 정한 값 15): 줄마다 꼬리표와 안내를 고르는 규칙은
//   returnStatus.js 의 returnRowView 하나다. serverStatus 가 없으면 예전과 같은 꼬리표·안내를 고른다(시안 보드가 기댄다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dedupePatientReturns, orderDaysForView, todayReturnSummary } from '../components/guardian/copyView.js';
import {
  RETURN_HELP,
  RETURN_TAG,
  patientReturnStatus,
  returnRowView,
  serverCheckedAt,
  todayCardTag,
} from '../components/guardian/returnStatus.js';

const HOSPITAL = { by: '17:00', placeName: '병원', placeAddress: null };
const LODGING_21 = { by: '21:00', placeName: '숙소 A', placeAddress: '서울 중구 1' };
const LODGING_15 = { by: '15:00', placeName: '숙소 A', placeAddress: '서울 중구 1' };

function snapshotOf(days) {
  return { days: days.map((d) => ({ escortRequired: false, guardianSoloAllowed: true, guardianOutings: [], ...d })) };
}

// KST 2026-11-06 16:00
const NOW = Date.parse('2026-11-06T07:00:00Z');

describe('dedupePatientReturns', () => {
  test('시각·장소 이름·주소가 모두 같으면 한 줄로 합치고 처음 나온 순서를 지킨다', () => {
    const out = dedupePatientReturns([LODGING_21, HOSPITAL, { ...LODGING_21 }, LODGING_15, { ...HOSPITAL }]);
    assert.deepEqual(out, [LODGING_21, HOSPITAL, LODGING_15]);
  });

  test('시각이 같아도 장소가 다르면 따로 둔다', () => {
    const other = { ...LODGING_21, placeName: '숙소 B' };
    const otherAddress = { ...LODGING_21, placeAddress: '서울 중구 2' };
    assert.equal(dedupePatientReturns([LODGING_21, other, otherAddress]).length, 3);
  });

  test('목록이 아니면 빈 목록', () => {
    assert.deepEqual(dedupePatientReturns(undefined), []);
    assert.deepEqual(dedupePatientReturns(null), []);
  });
});

describe('todayReturnSummary', () => {
  test('아직 지나지 않은 마감 가운데 가장 가까운 것, 개수는 합친 뒤 개수', () => {
    const snapshot = snapshotOf([
      { date: '2026-11-06', patientReturn: [LODGING_21, LODGING_15, HOSPITAL, { ...LODGING_21 }] },
      { date: '2026-11-07', patientReturn: [{ ...HOSPITAL, by: '16:30' }] },
    ]);
    assert.deepEqual(todayReturnSummary(snapshot, NOW), {
      date: '2026-11-06',
      by: '17:00',
      placeName: '병원',
      placeAddress: null,
      status: 'UPCOMING',
      total: 3,
    });
  });

  test('모두 지났으면 가장 늦게 지난 마감', () => {
    const late = Date.parse('2026-11-06T13:30:00Z'); // KST 22:30
    const snapshot = snapshotOf([{ date: '2026-11-06', patientReturn: [LODGING_15, LODGING_21, HOSPITAL] }]);
    const summary = todayReturnSummary(snapshot, late);
    assert.equal(summary.by, '21:00');
    assert.equal(summary.status, 'PASSED');
    assert.equal(summary.total, 3);
  });

  test('오늘 환자 외출이 없으면 none', () => {
    const snapshot = snapshotOf([{ date: '2026-11-06', patientReturn: [] }]);
    assert.deepEqual(todayReturnSummary(snapshot, NOW), { date: '2026-11-06', none: true });
  });

  test('오늘이 사본 날짜 밖이면 null (입국 전·범위 지남)', () => {
    const snapshot = snapshotOf([{ date: '2026-11-08', patientReturn: [HOSPITAL] }]);
    assert.equal(todayReturnSummary(snapshot, NOW), null);
    assert.equal(todayReturnSummary(snapshotOf([]), NOW), null);
  });

  test('KST 기준 오늘: UTC 로는 전날이어도 한국 날짜로 고른다', () => {
    const kstMorning = Date.parse('2026-11-06T16:30:00Z'); // KST 2026-11-07 01:30
    const snapshot = snapshotOf([
      { date: '2026-11-06', patientReturn: [LODGING_21] },
      { date: '2026-11-07', patientReturn: [HOSPITAL] },
    ]);
    assert.equal(todayReturnSummary(snapshot, kstMorning).date, '2026-11-07');
  });

  test('깨진 입력은 null', () => {
    assert.equal(todayReturnSummary(null, NOW), null);
    assert.equal(todayReturnSummary({ days: 'x' }, NOW), null);
    assert.equal(todayReturnSummary(snapshotOf([{ date: '2026-11-06', patientReturn: [HOSPITAL] }]), NaN), null);
  });
});

describe('todayReturnSummary: 마감은 있는데 시각을 읽을 수 없으면', () => {
  test('카드를 그리지 않는다(null). 아래 줄과 어긋나게 「외출 없음」이라 말하지 않는다', () => {
    const nowMs = Date.UTC(2026, 10, 6, 1, 0); // 2026-11-06 10:00 KST
    const snapshot = { days: [{ date: '2026-11-06', patientReturn: [{ by: 'late', placeName: '숙소', placeAddress: null }] }] };
    assert.equal(todayReturnSummary(snapshot, nowMs), null);
  });
});

describe('orderDaysForView: 받은 일정의 날짜 순서', () => {
  const days = [{ date: '2026-11-05' }, { date: '2026-11-06' }, { date: '2026-11-07' }, { date: '2026-11-08' }];
  test('오늘, 앞으로 올 날짜(원래 순서), 지난 날짜 순이다', () => {
    const out = orderDaysForView(days, '2026-11-06');
    assert.equal(out.todayDay.date, '2026-11-06');
    assert.deepEqual(out.days.map((d) => d.date), ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-05']);
  });
  test('오늘이 범위 밖이면 순서를 바꾸지 않는다', () => {
    const out = orderDaysForView(days, '2026-11-20');
    assert.equal(out.todayDay, null);
    assert.deepEqual(out.days.map((d) => d.date), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
  test('목록이 아니면 빈 목록', () => {
    assert.deepEqual(orderDaysForView(null, '2026-11-06'), { todayDay: null, days: [] });
  });
});

describe('서버 상태 조회의 복귀 확인 표시 (계획 2026-11-15 A-3 Task 7, 정한 값 15)', () => {
  const DATE = '2026-11-06';
  const AT = Date.parse('2026-11-06T09:12:00Z'); // KST 18:12
  const SERVER = Object.freeze({ date: DATE, confirmed: ['15:00', '21:00'], muted: false, active: true, atMs: AT });
  const SOURCE = readFileSync(new URL('../components/guardian/GuardianCopyView.js', import.meta.url), 'utf8');

  /** 함수 하나의 본문: `function 이름(` 부터 첫 줄 맨 앞 `}` 까지 */
  function block(name) {
    const start = SOURCE.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `GuardianCopyView.js 에 function ${name}( 이 없다`);
    const end = SOURCE.indexOf('\n}\n', start);
    return SOURCE.slice(start, end + 2);
  }

  test('serverStatus 에 확인된 마감은 복귀 확인 꼬리표와 안내가 있고 마감 지남 꼬리표가 없으며 긴급 절은 그대로다', () => {
    // 지난 마감(15:00, NOW 는 KST 16:00)도, 아직 오지 않은 마감(21:00)도 확인됐으면 복귀 확인이다
    assert.deepEqual(returnRowView({ date: DATE, by: '15:00', nowMs: NOW, serverStatus: SERVER }), {
      tag: RETURN_TAG.CONFIRMED,
      help: RETURN_HELP.CONFIRMED,
    });
    assert.deepEqual(returnRowView({ date: DATE, by: '21:00', nowMs: NOW, serverStatus: SERVER }), {
      tag: RETURN_TAG.CONFIRMED,
      help: RETURN_HELP.CONFIRMED,
    });
    // 확인이 없는 마감은 지금처럼 마감 지남과 연락 안내다
    assert.deepEqual(returnRowView({ date: DATE, by: '10:00', nowMs: NOW, serverStatus: SERVER }), {
      tag: RETURN_TAG.PASSED,
      help: RETURN_HELP.OVERDUE,
    });
    // 조회 날짜가 다른 줄(다른 날)은 확인으로 보지 않는다
    assert.equal(returnRowView({ date: '2026-11-07', by: '15:00', nowMs: NOW, serverStatus: SERVER }).tag, null);
    // 확인 시각 줄: 그날 확인된 줄이 있을 때만, 받은 시각으로
    assert.equal(serverCheckedAt(DATE, [{ by: '15:00' }, { by: '10:00' }], SERVER), AT);
    assert.equal(serverCheckedAt(DATE, [{ by: '10:00' }], SERVER), null);
    assert.equal(serverCheckedAt('2026-11-07', [{ by: '15:00' }], SERVER), null);
    // 오늘 카드도 같은 줄의 값을 다시 보여 준다
    assert.equal(todayCardTag({ date: DATE, by: '15:00', status: 'PASSED' }, SERVER), RETURN_TAG.CONFIRMED);
    assert.equal(todayCardTag({ date: DATE, by: '10:00', status: 'PASSED' }, SERVER), RETURN_TAG.PASSED);

    // 꼬리표는 아이콘과 글자를 함께 쓰고 마감 지남과 다른 클래스다. 안내는 늘 꼬리표와 함께 그린다
    const tag = block('ReturnTag');
    assert.match(tag, /RETURN_TAG\.CONFIRMED[\s\S]*className="guardian-tag is-confirmed"[\s\S]*<Icon name="check"[\s\S]*guardian\.confirmedTag/);
    const rows = block('PatientReturns');
    assert.match(rows, /row\.help === RETURN_HELP\.CONFIRMED && <ConfirmedHelp/);
    assert.match(rows, /row\.help === RETURN_HELP\.OVERDUE && \(/);
    // 긴급 절은 serverStatus 와 무관하다
    const emergency = SOURCE.slice(SOURCE.indexOf('<section className="guardian-emergency"'), SOURCE.indexOf('</section>', SOURCE.indexOf('<section className="guardian-emergency"')));
    assert.ok(emergency.length > 0);
    assert.doesNotMatch(emergency, /serverStatus|confirmed|RETURN_/);
    assert.match(emergency, /EMERGENCY_NUMBERS|numbers\.map/);
  });

  test('serverStatus 가 없으면 지금과 같은 마크업이다', () => {
    // 줄의 꼬리표·안내를 고르는 규칙: serverStatus 가 없으면 예전 규칙(patientReturnStatus, 지난 마감만 연락 안내)과 같다
    const times = [
      Date.parse('2026-11-05T15:30:00Z'), // KST 11-06 00:30
      NOW, // KST 16:00
      Date.parse('2026-11-06T12:00:00Z'), // KST 21:00 정각
      Date.parse('2026-11-06T14:59:00Z'), // KST 23:59
      Date.parse('2026-11-06T15:00:00Z'), // KST 11-07 00:00
    ];
    const rows = [
      ...['00:00', '10:00', '15:00', '16:00', '21:00', '23:59'].map((by) => ({ date: DATE, by })),
      { date: '2026-11-07', by: '09:00' },
      { date: '2026-11-05', by: '20:00' },
      { date: DATE, by: 'late' },
    ];
    for (const serverStatus of [undefined, null]) {
      for (const nowMs of times) {
        for (const row of rows) {
          const status = patientReturnStatus({ ...row, nowMs });
          assert.deepEqual(
            returnRowView({ ...row, nowMs, serverStatus }),
            { tag: status, help: status === 'PASSED' ? RETURN_HELP.OVERDUE : null },
            `${row.date} ${row.by} @${nowMs}`,
          );
          assert.equal(todayCardTag({ ...row, status }, serverStatus), status);
        }
        assert.equal(serverCheckedAt(DATE, rows, serverStatus), null);
      }
    }
    // 마크업: 새 요소는 모두 위 규칙의 값으로만 열린다. 그 값이 예전과 같으면 예전 가지만 그린다
    //   - 꼬리표: PASSED·UPCOMING 가지는 예전 클래스·아이콘 그대로다
    const tag = block('ReturnTag');
    assert.match(tag, /status === 'PASSED'[\s\S]*className="guardian-tag is-passed"[\s\S]*<Icon name="alert" size=\{16\} strokeWidth=\{2\.4\} \/>[\s\S]*guardian\.overdueTag/);
    assert.match(tag, /status === 'UPCOMING'\) return <span className="guardian-tag is-upcoming">\{t\('guardian\.upcomingTag'\)\}<\/span>/);
    //   - 줄: 예전 직접 계산(patientReturnStatus)을 남기지 않는다(판단 길 하나)
    const rowsSource = block('PatientReturns');
    assert.doesNotMatch(rowsSource, /patientReturnStatus\(/);
    assert.match(rowsSource, /returnRowView\(\{ date: day\.date, by: entry\.by, nowMs, serverStatus \}\)/);
    //   - 확인 시각 줄은 값이 있을 때만 붙고, 없으면 목록 하나만 돌려준다
    assert.match(rowsSource, /if \(checkedAt === null\) return list;/);
    //   - 오늘 카드 아래 안내는 카드 꼬리표가 확인일 때만
    assert.match(SOURCE, /\{summary && cardTag === RETURN_TAG\.CONFIRMED && <ConfirmedHelp/);
    //   - 시안 보드는 serverStatus 없이 그린다
    const board = readFileSync(new URL('../app/design-board/ScreenPreviews.js', import.meta.url), 'utf8');
    assert.match(board, /<GuardianCopyView snapshot=\{demo\.guardianSnapshot\} alerts=\{<AlertsToggleView on=\{false\} disabled \/>\} fixedNowMs=\{DEMO_NOW_MS\} \/>/);
  });
});
