import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  closureOnDate,
  openNowFromSchedule,
  readClosure,
  readClosureOnDate,
} from '../src/tour-api/schedule.js';

// KST 기준 요일이 판정의 축이다. 실행 시간대와 무관해야 하므로 절대 시각으로 고정한다.
const MON = new Date('2026-08-17T01:00:00Z'); // KST 08-17 (월)
const TUE = new Date('2026-08-18T01:00:00Z'); // KST 08-18 (화)
const KST_MIDNIGHT = new Date('2026-08-16T15:00:00Z'); // KST 08-17 00:00 (월)

describe('운영·휴무 원문에서 닫힘 근거만 읽는다', () => {
  test('영업 중이라고 단정하지 않는다 — 근거가 없으면 null', () => {
    // 실데이터. 이런 문장에서 "지금 열려 있다" 를 추정하면 SIGNOFF 5.3 위반이다.
    const messy = {
      opentime: '10:30~22:00<br>※ 일부 영업시간이 다른 매장이 있음<br>※ 행사로 인해 영업시간이 변경되는 경우가 있음',
      restdateshopping: '연중무휴',
    };
    assert.equal(openNowFromSchedule(messy, MON), null);
    assert.equal(readClosure(messy, MON).closed, false);
    assert.equal(readClosure(messy, MON).reason, 'ALWAYS_OPEN');
  });

  test('운영시간 텍스트만으로는 절대 닫혔다고 하지 않는다', () => {
    // 22시 마감이라고 적혀 있어도 "지금 몇 시인가" 로 판정하지 않는다.
    assert.equal(openNowFromSchedule({ opentime: '10:00-22:00' }, MON), null);
  });

  test('운영 정보가 없으면 SCHEDULE_NOT_PROVIDED', () => {
    assert.equal(readClosure({}, MON).reason, 'SCHEDULE_NOT_PROVIDED');
    assert.equal(readClosure(null, MON).reason, 'SCHEDULE_NOT_PROVIDED');
    assert.equal(openNowFromSchedule(undefined, MON), null);
  });
});

describe('행사 기간 — 구조화 필드라 해석 여지가 없다', () => {
  test('끝난 행사는 닫힘이다', () => {
    const r = readClosure({ eventstartdate: '20260701', eventenddate: '20260731' }, MON);
    assert.equal(r.closed, true);
    assert.equal(r.reason, 'EVENT_ENDED');
    assert.equal(r.evidence.field, 'eventenddate');
  });

  test('아직 시작하지 않은 행사도 닫힘이다', () => {
    const r = readClosure({ eventstartdate: '20260901', eventenddate: '20260910' }, MON);
    assert.equal(r.closed, true);
    assert.equal(r.reason, 'EVENT_NOT_STARTED');
  });

  test('기간 안이면 닫힘이 아니다 — 경계일 포함', () => {
    assert.equal(readClosure({ eventstartdate: '20260817', eventenddate: '20260817' }, MON).closed, false);
    assert.equal(readClosure({ eventstartdate: '20260801', eventenddate: '20260831' }, MON).closed, false);
  });

  test('날짜 형식이 아니면 무시한다 — 깨진 값으로 후보를 지우지 않는다', () => {
    assert.equal(readClosure({ eventenddate: '상시' }, MON).closed, false);
    assert.equal(readClosure({ eventenddate: '2026-07-31' }, MON).closed, false);
    assert.equal(readClosure({ eventenddate: '' }, MON).closed, false);
  });

  test('KST 자정 직후에도 그날 날짜로 읽는다', () => {
    // UTC 로 읽으면 하루 전이 돼 그날 시작하는 행사를 "아직 시작 안 함" 으로 지운다.
    assert.equal(readClosure({ eventstartdate: '20260817', eventenddate: '20260817' }, KST_MIDNIGHT).closed, false);
  });
});

describe('정기 휴무 요일 — 오늘과 정확히 맞을 때만', () => {
  test('해당 요일이면 닫힘', () => {
    const r = readClosure({ restdateculture: '매주 월요일 휴관' }, MON);
    assert.equal(r.closed, true);
    assert.equal(r.reason, 'WEEKLY_CLOSURE');
  });

  test('다른 요일이면 닫힘이 아니다', () => {
    assert.equal(readClosure({ restdateculture: '매주 월요일 휴관' }, TUE).closed, false);
  });

  test('요일 나열도 읽는다', () => {
    assert.equal(readClosure({ restdate: '매주 월·화 휴무' }, MON).closed, true);
    assert.equal(readClosure({ restdate: '토~일 휴무' }, MON).closed, false);
  });

  /**
   * 요일 글자는 다른 뜻으로도 쓰인다. "월 2회 휴무" 는 매달 두 번이지 월요일이 아니다.
   * 이걸 월요일로 읽으면 멀쩡한 후보가 매주 월요일마다 사라진다.
   */
  test('"월 2회 휴무" 를 월요일로 읽지 않는다', () => {
    assert.equal(readClosure({ restdate: '월 2회 휴무' }, MON).closed, false);
    assert.equal(readClosure({ restdate: '월 1회 정기휴무' }, MON).closed, false);
  });

  test('주기가 불규칙하면 손대지 않는다', () => {
    assert.equal(readClosure({ restdate: '격주 월요일 휴무' }, MON).closed, false);
    assert.equal(readClosure({ restdate: '부정기 휴무' }, MON).closed, false);
    assert.equal(readClosure({ restdate: '공휴일 휴무' }, MON).closed, false);
  });

  test('휴무를 뜻하는 말이 없으면 요일이 보여도 넘긴다', () => {
    assert.equal(readClosure({ restdate: '월요일 단축운영' }, MON).closed, false);
  });

  test('연중무휴가 있으면 요일을 보지 않는다', () => {
    assert.equal(readClosure({ restdate: '연중무휴 (월요일 단축)' }, MON).closed, false);
    assert.equal(readClosure({ restdateshopping: 'N/A (Open all year around)' }, MON).reason, 'ALWAYS_OPEN');
  });

  test('HTML 조각이 섞여도 읽는다', () => {
    assert.equal(readClosure({ restdate: '매주 <br>월요일<br> 휴관' }, MON).closed, true);
  });
});

describe('openNow 매핑', () => {
  test('닫힘 근거가 있으면 false, 없으면 null — true 는 나오지 않는다', () => {
    assert.equal(openNowFromSchedule({ restdate: '매주 월요일 휴무' }, MON), false);
    assert.equal(openNowFromSchedule({ restdate: '연중무휴' }, MON), null);
    assert.equal(openNowFromSchedule({ opentime: '10:00-22:00' }, MON), null);

    const values = [
      { restdate: '매주 월요일 휴무' },
      { restdate: '연중무휴' },
      {},
      { eventenddate: '20260731' },
    ].map((s) => openNowFromSchedule(s, MON));
    assert.equal(values.includes(true), false, 'openNow 는 true 를 만들지 않는다');
  });
});

/**
 * AX-305 — 일정 날짜 기준 휴무 (spec 4.8 휴무 게이트, 규칙 26)
 *
 * 전체 일정은 입국~출국의 여러 날짜를 한 번에 만든다. 목록은 기준점·반경마다 한 번만
 * 조회하므로, 같은 운영 원문으로 **임의 날짜**의 닫힘을 판정할 수 있어야 한다.
 * 원칙은 그대로다 — 닫힘 근거만 읽고, 열려 있다고 단정하지 않는다.
 */

describe('일정 날짜 기준 휴무 판정', () => {
  test('정기 휴무 요일이 그 날짜의 요일과 같으면 닫힘', () => {
    // 2026-08-17 은 월요일, 2026-08-18 은 화요일
    const r = readClosureOnDate({ restdateculture: '매주 월요일 휴관' }, '2026-08-17');
    assert.equal(r.closed, true);
    assert.equal(r.reason, 'WEEKLY_CLOSURE');
    assert.equal(readClosureOnDate({ restdateculture: '매주 월요일 휴관' }, '2026-08-18').closed, false);
  });

  test('행사 기간 밖 날짜는 닫힘, 안쪽 날짜(경계 포함)는 닫힘이 아니다', () => {
    const festival = { eventstartdate: '20260820', eventenddate: '20260825' };
    assert.equal(readClosureOnDate(festival, '2026-08-19').reason, 'EVENT_NOT_STARTED');
    assert.equal(readClosureOnDate(festival, '2026-08-26').reason, 'EVENT_ENDED');
    assert.equal(readClosureOnDate(festival, '2026-08-20').closed, false);
    assert.equal(readClosureOnDate(festival, '2026-08-25').closed, false);
  });

  test('YYYYMMDD 형식도 받는다', () => {
    assert.equal(readClosureOnDate({ restdate: '매주 월요일 휴무' }, '20260817').closed, true);
  });

  test('실행 시간대와 무관하게 달력 날짜로 요일을 정한다', () => {
    // KST 로 이미 정해진 일정 날짜다. Date 로 바꿔 UTC 기준 전날이 되면 요일이 어긋난다.
    const results = ['2026-08-17', '2026-08-23'].map((d) => readClosureOnDate({ restdate: '일요일 휴무' }, d).closed);
    assert.deepEqual(results, [false, true]);
  });

  test('존재하지 않는 날짜나 형식이 틀린 값은 오류다 — 조용히 오늘로 바꾸지 않는다', () => {
    assert.throws(() => readClosureOnDate({ restdate: '매주 월요일 휴무' }, '2026-02-30'), RangeError);
    assert.throws(() => readClosureOnDate({ restdate: '매주 월요일 휴무' }, 'tomorrow'), RangeError);
    assert.throws(() => readClosureOnDate({ restdate: '매주 월요일 휴무' }, new Date()), RangeError);
  });

  test('근거가 없으면 닫힘이 아니고, 열렸다는 뜻도 아니다', () => {
    assert.equal(readClosureOnDate({}, '2026-08-17').reason, 'SCHEDULE_NOT_PROVIDED');
    assert.equal(readClosureOnDate({ restdate: '연중무휴' }, '2026-08-17').reason, 'ALWAYS_OPEN');
    assert.equal(readClosureOnDate({ opentime: '10:00~22:00' }, '2026-08-17').reason, 'NO_CLOSURE_EVIDENCE');
  });

  test('"오늘" 판정은 그대로다 — 같은 달력 날짜면 같은 결과', () => {
    const schedule = { restdate: '매주 월요일 휴무' };
    assert.deepEqual(readClosure(schedule, MON), readClosureOnDate(schedule, '2026-08-17'));
    assert.deepEqual(readClosure(schedule, TUE), readClosureOnDate(schedule, '2026-08-18'));
  });

  test('후보에 실린 운영 원문으로 날짜별 닫힘을 판정한다', () => {
    const candidate = { sourceMetadata: { schedule: { restdatefood: '매주 월요일' } } };
    // "휴무" 라는 말이 없으면 요일이 보여도 닫힘으로 읽지 않는다 (기존 규칙)
    assert.equal(closureOnDate(candidate, '2026-08-17').closed, false);

    const closedMonday = { sourceMetadata: { schedule: { restdatefood: '매주 월요일 휴무' } } };
    assert.equal(closureOnDate(closedMonday, '2026-08-17').closed, true);
    assert.equal(closureOnDate(closedMonday, '2026-08-18').closed, false);
  });

  test('운영 원문을 조회하지 않은 후보는 SCHEDULE_NOT_PROVIDED 이다', () => {
    assert.equal(closureOnDate({ sourceMetadata: { schedule: null } }, '2026-08-17').reason, 'SCHEDULE_NOT_PROVIDED');
    assert.equal(closureOnDate({}, '2026-08-17').reason, 'SCHEDULE_NOT_PROVIDED');
  });
});
