// 상태 상자의 사유별 행동 줄과 하루 활동 종료 이름 (사용성 점검 2026-11-08 A1·A2·A3·A4)
//
// 이 파일이 고정하는 것 (components/trip/viewModel.js dayActionKey · outingDayNote · deadlineCopyOf):
//   - 병원과 무관한 사유(오늘 남은 시간 부족, 조건 입력 필요, 매일 확인 대기, 병원 안내 미확인)에는
//     '병원 연락 또는 숙소 대기'·'병원 인근 대기 후 재확인' 대신 사유별 행동 줄 하나를 고른다.
//   - 입국·출국 이동 날, 다른 날의 시간 부족, 후보 없음 STANDBY 도 각자의 줄이다.
//   - 병원 지침 사유(외출 제한, 복귀 요청, 지침 철회·만료, 외출 늦음 등)는 상태 기본 행동 줄을 그대로 둔다(null).
//   - 외출이 있는 날만 상태 상자 아래 고정 줄을 둔다.
//   - 마감 이유가 하루 활동 종료(DAY_END)면 '오늘 활동 종료'로 부르고, 병원이 정한 마감은 '복귀 마감'이다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DAY_ACTION_KEY, DEADLINE_REASON_KEY, dayActionKey, deadlineCopyOf, deltaSummary, outingDayNote } from '../components/trip/viewModel.js';
import { REASON, STATE } from '../src/domain/states.js';
import { overlayTodayGate } from '../src/stay/todayGate.js';
import { UI_TEXT, SAFETY_KEYS } from '../src/i18n/messages/index.js';

const OUTING = { id: 'P1', departAt: '10:00', returnBy: '13:00', deadlineReason: 'RETURN_TIME', stops: [{ id: 's1', contentId: '1' }] };

function day(overrides = {}) {
  return { date: '2026-11-08', coverage: 'RESTRICTED', dayState: STATE.TOGETHER, reasons: [], outings: [OUTING], guardianOutings: [], ...overrides };
}

describe('dayActionKey: 사유별 행동 줄', () => {
  test('오늘 늦은 저녁(출발 가능 시간 부족)은 시간 부족 줄이다', () => {
    const late = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.DEPARTURE_WINDOW_TOO_SHORT] });
    assert.equal(dayActionKey(late, { isToday: true }), DAY_ACTION_KEY.TIME_SHORT);
  });

  test('오늘 남은 외출이 시간 때문에 없어진 날(SLA_INSUFFICIENT)도 시간 부족 줄이다', () => {
    const short = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.SLA_INSUFFICIENT] });
    assert.equal(dayActionKey(short, { isToday: true }), DAY_ACTION_KEY.TIME_SHORT);
  });

  test('오늘이 아닌 날의 시간 부족은 날짜를 말하지 않는 시간 부족 줄이다', () => {
    for (const reason of [REASON.DEPARTURE_WINDOW_TOO_SHORT, REASON.SLA_INSUFFICIENT]) {
      const other = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [reason] });
      assert.equal(dayActionKey(other, { isToday: false }), DAY_ACTION_KEY.TIME_SHORT_DAY, reason);
    }
  });

  test('입국·출국 창 밖(OUTSIDE_STAY_WINDOW)은 이동 날 줄이다. 오늘이어도 같다', () => {
    const travel = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.OUTSIDE_STAY_WINDOW] });
    assert.equal(dayActionKey(travel, { isToday: true }), DAY_ACTION_KEY.TRAVEL_DAY);
    assert.equal(dayActionKey(travel, { isToday: false }), DAY_ACTION_KEY.TRAVEL_DAY);
  });

  test('후보 없음 STANDBY 는 장소를 아직 찾지 못했다는 줄이다. 오늘이 아니어도 같다', () => {
    const none = day({ dayState: STATE.STANDBY, outings: [], reasons: [REASON.NO_CANDIDATE] });
    assert.equal(dayActionKey(none, { isToday: true }), DAY_ACTION_KEY.NO_CANDIDATE);
    assert.equal(dayActionKey(none, { isToday: false }), DAY_ACTION_KEY.NO_CANDIDATE);
    // 병원 사유가 함께 있으면 병원 줄이 이긴다
    assert.equal(dayActionKey({ ...none, reasons: [REASON.RISK_SIGNAL, REASON.NO_CANDIDATE] }, { isToday: true }), null);
    // 매일 확인 대기가 덧씌워지면 확인 줄이 먼저다
    assert.equal(dayActionKey(overlayTodayGate(none, { dailyCheckPending: true }), { isToday: true }), DAY_ACTION_KEY.DAILY_CHECK);
  });

  test('조건 입력 필요(NEEDS_INPUT)는 조건 입력 줄이다. 오늘이 아니어도 같다', () => {
    for (const reason of [REASON.CONDITION_INPUT_REQUIRED, REASON.SENSITIVE_CONSENT_REQUIRED]) {
      const needs = day({ coverage: 'NEEDS_INPUT', dayState: STATE.NO_TOURISM, outings: [], reasons: [reason] });
      assert.equal(dayActionKey(needs, { isToday: true }), DAY_ACTION_KEY.NEEDS_INPUT, reason);
      assert.equal(dayActionKey(needs, { isToday: false }), DAY_ACTION_KEY.NEEDS_INPUT, reason);
    }
  });

  test('숙소 없음·병원 지침 만료로 입력이 필요한 날은 조건이 아닌 입력 줄이다', () => {
    for (const reason of [REASON.LODGING_REQUIRED, REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED]) {
      const needs = day({ coverage: 'NEEDS_INPUT', dayState: STATE.NO_TOURISM, outings: [], reasons: [reason] });
      assert.equal(dayActionKey(needs, { isToday: true }), DAY_ACTION_KEY.NEEDS_INPUT_OTHER, reason);
    }
  });

  test('매일 확인 대기(덧씌운 STANDBY)는 매일 확인 줄이다. 하루 일정 화면은 오늘 화면으로 안내한다', () => {
    const shown = overlayTodayGate(day(), { dailyCheckPending: true });
    assert.equal(shown.dayState, STATE.STANDBY);
    assert.equal(dayActionKey(shown, { isToday: true, screen: 'today' }), DAY_ACTION_KEY.DAILY_CHECK);
    assert.equal(dayActionKey(shown, { isToday: true, screen: 'day' }), DAY_ACTION_KEY.DAILY_CHECK_ELSEWHERE);
  });

  test('확인하지 않은 병원 중요 안내(덧씌운 STANDBY)는 병원 안내 확인 줄이다', () => {
    const shown = overlayTodayGate(day(), { unconfirmedHospitalUpdate: true });
    assert.equal(dayActionKey(shown, { isToday: true }), DAY_ACTION_KEY.HOSPITAL_GUIDE);
  });

  test('둘 다 대기면 병원 안내 확인이 먼저다(바뀐 안내를 읽기 전에 그대로예요를 누르지 않게)', () => {
    const shown = overlayTodayGate(day(), { dailyCheckPending: true, unconfirmedHospitalUpdate: true });
    assert.equal(dayActionKey(shown, { isToday: true }), DAY_ACTION_KEY.HOSPITAL_GUIDE);
    assert.equal(dayActionKey(shown, { isToday: true, screen: 'day' }), DAY_ACTION_KEY.HOSPITAL_GUIDE);
  });

  test('외출이 없는 날에 덧씌운 확인 대기는 확인 줄을 고르지 않는다(확인해도 외출이 열리지 않는다)', () => {
    const late = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.DEPARTURE_WINDOW_TOO_SHORT] });
    const shown = overlayTodayGate(late, { dailyCheckPending: true });
    assert.equal(shown.dayState, STATE.NO_TOURISM);
    assert.equal(dayActionKey(shown, { isToday: true }), DAY_ACTION_KEY.TIME_SHORT);
    const rest = day({ coverage: 'REST_DAY', dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.OUTING_FORBIDDEN] });
    assert.equal(dayActionKey(overlayTodayGate(rest, { dailyCheckPending: true }), { isToday: true }), null);
  });

  test('병원 지침 사유는 상태 기본 줄(병원 연락 또는 숙소 대기)을 그대로 둔다', () => {
    const hospital = [
      REASON.OUTING_FORBIDDEN,
      REASON.CONFLICTING_CONDITION,
      REASON.RISK_SIGNAL,
      REASON.PATIENT_RECALLED,
      REASON.PLAN_REVOKED,
      REASON.PLAN_EXPIRED,
      REASON.ESCORT_REQUIRED,
      REASON.SERVICE_PAUSED,
    ];
    for (const reason of hospital) {
      // 시간 부족 사유가 함께 있어도 병원 사유가 이긴다
      const d = day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [reason, REASON.DEPARTURE_WINDOW_TOO_SHORT] });
      assert.equal(dayActionKey(d, { isToday: true }), null, reason);
    }
  });

  test('외출 늦음(OUTING_OVERDUE) 즉시 복귀는 상태 기본 줄이다', () => {
    const overdue = day({ dayState: STATE.NO_TOURISM, returnNow: true, reasons: [REASON.OUTING_OVERDUE, REASON.SLA_INSUFFICIENT] });
    assert.equal(dayActionKey(overdue, { isToday: true }), null);
    // returnNow 만 켜져 있어도 같다
    assert.equal(dayActionKey(day({ dayState: STATE.NO_TOURISM, returnNow: true, reasons: [REASON.SLA_INSUFFICIENT] }), { isToday: true }), null);
  });

  test('외출이 있는 보통 날과 보호자만 나가는 날, 동행 필요 미충족 날은 상태 기본 줄이다', () => {
    assert.equal(dayActionKey(day(), { isToday: true }), null);
    assert.equal(dayActionKey(day({ dayState: STATE.SPLIT_NEARBY, outings: [], guardianOutings: [OUTING] }), { isToday: true }), null);
    assert.equal(dayActionKey(day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.ESCORT_REQUIRED] }), { isToday: true }), null);
    assert.equal(dayActionKey(day({ dayState: STATE.NO_TOURISM, outings: [], reasons: [REASON.WEATHER_BLOCKED] }), { isToday: true }), null);
    assert.equal(dayActionKey(null), null);
  });
});

describe('행동 줄 문구', () => {
  test('모든 행동 줄과 고정 줄은 4개 언어 안전 문구다', () => {
    for (const key of [...Object.values(DAY_ACTION_KEY), 'common.outingDayNote']) {
      assert.ok(UI_TEXT[key], key);
      assert.ok(SAFETY_KEYS.has(key), `${key} 는 안전 문구`);
      for (const lang of ['ko', 'en', 'ja', 'zh']) assert.ok(UI_TEXT[key][lang]?.trim(), `${key}.${lang}`);
    }
  });

  test('병원과 무관한 사유의 줄은 병원 연락·병원 인근 대기를 말하지 않는다', () => {
    for (const key of Object.values(DAY_ACTION_KEY).filter((k) => k !== DAY_ACTION_KEY.HOSPITAL_GUIDE)) {
      assert.doesNotMatch(UI_TEXT[key].ko, /병원/, key);
      assert.doesNotMatch(UI_TEXT[key].en, /hospital/i, key);
    }
  });

  test('운영자가 정한 한국어 문장 그대로다', () => {
    assert.equal(UI_TEXT[DAY_ACTION_KEY.TIME_SHORT].ko, '오늘은 남은 시간이 적어 외출 일정을 만들지 않았어요. 내일 일정은 그대로예요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.NEEDS_INPUT].ko, '아직 조건을 입력하지 않아 일정을 만들지 않았어요. 조건을 입력하면 일정이 생겨요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.DAILY_CHECK].ko, '오늘 일정은 매일 확인을 마치면 열려요. 위의 확인 항목을 눌러 주세요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.HOSPITAL_GUIDE].ko, '병원 안내를 먼저 확인해 주세요. 확인하면 오늘 일정이 열려요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.TRAVEL_DAY].ko, '입국·출국 이동이 있는 날이라 외출 일정을 만들지 않았어요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.TRAVEL_DAY].en, 'No outing plan on this day because of arrival or departure travel.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.TIME_SHORT_DAY].ko, '이날은 남은 시간이 적어 외출 일정을 만들지 않았어요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.TIME_SHORT_DAY].en, 'No outing plan on this day because too little time is left.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.NO_CANDIDATE].ko, '조건에 맞는 장소를 아직 찾지 못했어요. 잠시 뒤 다시 확인해 주세요.');
    assert.equal(UI_TEXT[DAY_ACTION_KEY.NO_CANDIDATE].en, 'No place that fits your conditions was found yet. Please check again later.');
    assert.equal(UI_TEXT['common.outingDayNote'].ko, '입력한 조건 안에서 짠 일정이에요. 몸 상태는 병원 안내를 따르세요.');
  });
});

describe('outingDayNote: 외출 있는 날의 고정 줄', () => {
  test('환자 외출이나 보호자 외출이 있으면 보인다', () => {
    assert.equal(outingDayNote(day()), true);
    assert.equal(outingDayNote(day({ outings: [], guardianOutings: [OUTING] })), true);
  });

  test('외출이 없는 날은 보이지 않는다', () => {
    assert.equal(outingDayNote(day({ dayState: STATE.NO_TOURISM, outings: [] })), false);
    assert.equal(outingDayNote(null), false);
  });

  test('즉시 복귀 날은 시작된 외출이 남아 있어도 보이지 않는다', () => {
    const started = { ...OUTING, stops: [] };
    assert.equal(outingDayNote(day({ dayState: STATE.NO_TOURISM, returnNow: true, outings: [started], reasons: [REASON.OUTING_OVERDUE] })), false);
    assert.equal(outingDayNote(day({ dayState: STATE.NO_TOURISM, returnNow: true, outings: [OUTING], reasons: [REASON.PATIENT_RECALLED] })), false);
    // returnNow 표시만 있어도 같다
    assert.equal(outingDayNote(day({ returnNow: true })), false);
  });
});

describe('deadlineCopyOf: 하루 활동 종료와 복귀 마감의 이름', () => {
  test('하루 활동 종료(DAY_END)는 오늘이면 오늘 활동 종료, 다른 날은 활동 종료이고 이유 줄을 되풀이하지 않는다', () => {
    assert.deepEqual(deadlineCopyOf({ deadlineReason: 'DAY_END' }, { isToday: true }), {
      dayEnd: true,
      labelKey: 'common.tlDayEndToday',
      timeKey: 'return.dayEnd',
      reasonKey: null,
    });
    assert.deepEqual(deadlineCopyOf({ deadlineReason: 'DAY_END' }), {
      dayEnd: true,
      labelKey: 'common.tlDayEnd',
      timeKey: 'trip.dayEndAt',
      reasonKey: null,
    });
    assert.equal(UI_TEXT['return.dayEnd'].ko, '오늘 활동 종료 {time}');
    assert.equal(UI_TEXT['common.tlDayEndToday'].ko, '오늘 활동 종료');
  });

  test('병원이 정한 마감과 그 밖의 마감은 복귀 마감과 이유 줄을 그대로 쓴다', () => {
    for (const reason of ['RETURN_TIME', 'MEDICATION', 'APPOINTMENT', 'DEPARTURE', 'PATIENT_SCHEDULE']) {
      for (const isToday of [true, false]) {
        assert.deepEqual(
          deadlineCopyOf({ deadlineReason: reason }, { isToday }),
          { dayEnd: false, labelKey: 'common.tlReturn', timeKey: 'return.deadline', reasonKey: DEADLINE_REASON_KEY[reason] },
          `${reason} ${isToday}`,
        );
      }
    }
    assert.equal(deadlineCopyOf({}).reasonKey, null);
    assert.equal(deadlineCopyOf(null).labelKey, 'common.tlReturn');
  });
});

describe('전후 비교의 새 마감 줄도 같은 이름 규칙을 쓴다', () => {
  test('새 마감 줄에 지금 일정의 마감 이유를 싣는다', () => {
    const d = day({
      outings: [{ ...OUTING, id: '2026-11-08:P:1', deadlineReason: 'DAY_END', returnBy: '21:00' }],
      delta: { newDeadlines: [{ outingId: '2026-11-08:P:1', returnBy: '21:00' }, { outingId: 'gone', returnBy: '15:00' }], hasVisibleChange: true },
    });
    const rows = deltaSummary(d).rows.filter((r) => r.kind === 'deadline');
    assert.equal(rows[0].deadlineReason, 'DAY_END');
    assert.equal(deadlineCopyOf(rows[0], { isToday: true }).timeKey, 'return.dayEnd');
    assert.equal(rows[1].deadlineReason, null);
    assert.equal(deadlineCopyOf(rows[1], { isToday: true }).timeKey, 'return.deadline');
  });
});
