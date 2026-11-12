// 날짜 분류·NEEDS_INPUT 사유·병원 기간 적용·매일 확인 대상
// (AX-302 · docs/business-rules.md '숙소와 병원'·'날짜별 합성'·'날짜 분류'·'매일 확인'·'하루 일정 생성'·'병원 연동',
//  테스트 이름의 규칙 3·4·5·9·10·11·12 는 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  COVERAGE,
  classifyDate,
  classifyStay,
  hospitalPeriodStatus,
  isDailyCheckPending,
  isDailyCheckTarget,
  periodAppliesOnDate,
} from '../src/stay/coverage.js';
import { NO_RESTRICTION_LIMITS } from '../src/stay/compose.js';
import { REASON } from '../src/domain/states.js';
import { NONE, SET, UNKNOWN, deepFreeze, hospitalPeriod, makePlanStay, makeStay, selfPeriod } from './stay-fixtures.js';

// 경계일 = 2026-10-03 (fixture 의 PROCEDURE 날짜)
const PRE = '2026-10-02';
const POST = '2026-10-04';

describe('FREE — 경계일 전 빈 날짜 (규칙 5의 순수 부분)', () => {
  test('적용 기간이 없으면 제한 없이 만들고 회복기 가산 버퍼가 없다', () => {
    const c = classifyDate(makeStay(), PRE);
    assert.equal(c.coverage, COVERAGE.FREE);
    assert.equal(c.coverage, 'FREE');
    assert.deepEqual(c.reasons, []);
    assert.deepEqual(c.limits, NO_RESTRICTION_LIMITS);
    assert.deepEqual(c.effective, {});
    assert.equal(c.recoveryBuffer, false);
    assert.equal(c.transportMode, 'TRANSIT');
    assert.equal(c.patientOutingAllowed, true);
    assert.equal(c.guardianSoloAllowed, false, '자유일에는 보호자 단독 외출이 없다');
    assert.equal(c.lodgingId, 'L1');
    assert.deepEqual(c.appliedPeriodIds, []);
  });

  test('경계일 전이라도 기간을 넣으면 RESTRICTED 다', () => {
    const stay = makeStay({
      periods: [selfPeriod({ startDate: '2026-10-01', endDate: '2026-10-02', items: { diet: { alcohol: SET(true) } } })],
    });
    const c = classifyDate(stay, PRE);
    assert.equal(c.coverage, 'RESTRICTED');
    assert.equal(c.recoveryBuffer, true);
    assert.equal(c.transportMode, 'TAXI');
    assert.equal(c.limits.diet.alcohol, true);
  });
});

describe('규칙 4 — 경계일 이후 빈 날짜', () => {
  test('적용 기간이 없으면 NEEDS_INPUT + CONDITION_INPUT_REQUIRED', () => {
    for (const date of ['2026-10-03', POST, '2026-10-08']) {
      const c = classifyDate(makeStay(), date);
      assert.equal(c.coverage, 'NEEDS_INPUT', date);
      assert.deepEqual(c.reasons, [REASON.CONDITION_INPUT_REQUIRED], date);
      assert.equal(c.limits, null);
      assert.equal(c.patientOutingAllowed, false);
      assert.equal(c.guardianSoloAllowed, false);
    }
  });

  test('동의가 없으면 SENSITIVE_CONSENT_REQUIRED', () => {
    const stay = makeStay({ consent: { sensitive: null }, periods: [selfPeriod()] });
    const c = classifyDate(stay, POST);
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.SENSITIVE_CONSENT_REQUIRED]);
  });

  test('동의를 거부해도 경계일 전 자유일은 쓸 수 있다', () => {
    const stay = makeStay({ consent: { sensitive: null }, periods: [selfPeriod({ startDate: '2026-10-01' })] });
    assert.equal(classifyDate(stay, PRE).coverage, 'FREE');
  });

  test('PROCEDURE 가 없으면 모든 날짜를 경계일 이후로 본다 (자유일로 새지 않음)', () => {
    const c = classifyDate(makeStay({ appointments: [] }), '2026-10-01');
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.CONDITION_INPUT_REQUIRED]);
  });
});

describe('규칙 3 — 숙소 없는 날짜', () => {
  test('NEEDS_INPUT + LODGING_REQUIRED', () => {
    const stay = makeStay({ periods: [selfPeriod()] });
    stay.lodgings = [stay.lodgings[0]];
    const c = classifyDate(stay, '2026-10-06');
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.LODGING_REQUIRED]);
    assert.equal(c.lodgingId, null);
  });

  test('경계일 전이라도 숙소가 없으면 NEEDS_INPUT 이다', () => {
    const stay = makeStay();
    stay.lodgings = [{ ...stay.lodgings[0], checkIn: '2026-10-02' }, stay.lodgings[1]];
    const c = classifyDate(stay, '2026-10-01');
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.LODGING_REQUIRED]);
  });

  test('숙소도 조건도 없으면 두 사유를 함께 알려준다', () => {
    const stay = makeStay();
    stay.lodgings = [stay.lodgings[0]];
    const c = classifyDate(stay, '2026-10-06');
    assert.deepEqual(c.reasons, [REASON.LODGING_REQUIRED, REASON.CONDITION_INPUT_REQUIRED]);
  });
});

describe('DECLARED_FREE — 제한 없음 기간만 적용', () => {
  const declared = { id: 'P-FREE', source: 'SELF', startDate: POST, endDate: POST, noRestriction: true };

  test('FREE 처럼 만들되 본인 체크 출처를 남긴다', () => {
    const c = classifyDate(makeStay({ periods: [declared] }), POST);
    assert.equal(c.coverage, 'DECLARED_FREE');
    assert.deepEqual(c.reasons, []);
    assert.equal(c.recoveryBuffer, false);
    assert.equal(c.transportMode, 'TRANSIT');
    assert.deepEqual(c.limits, NO_RESTRICTION_LIMITS);
    assert.deepEqual(c.effective.outing, { value: 'ALLOWED', provenance: [{ periodId: 'P-FREE', source: 'SELF', defaulted: false }] });
    assert.equal(c.guardianSoloAllowed, false);
  });

  test('제한 있는 기간이 하나라도 같이 덮으면 RESTRICTED 다', () => {
    const c = classifyDate(makeStay({ periods: [declared, selfPeriod({ items: { avoidUv: SET(true) } })] }), POST);
    assert.equal(c.coverage, 'RESTRICTED');
  });
});

describe('규칙 9 — REST_DAY 와 보호자 단독 외출 가능 여부', () => {
  test('합성 outing=FORBIDDEN 이면 REST_DAY, 환자 외출 없음', () => {
    const stay = makeStay({ periods: [selfPeriod({ items: { outing: 'FORBIDDEN' } })] });
    const c = classifyDate(stay, POST);
    assert.equal(c.coverage, 'REST_DAY');
    assert.ok(c.reasons.includes(REASON.OUTING_FORBIDDEN));
    assert.equal(c.patientOutingAllowed, false);
    assert.equal(c.guardianSoloAllowed, true, '동반 보호자 있음 + 곁 지킴 아니오 + 동행 필수 아님');
  });

  test('곁을 지켜야 하면(모르겠음 기본값 포함) 보호자 단독 외출이 없다', () => {
    for (const guardianMustStay of [SET(true), UNKNOWN]) {
      const stay = makeStay({ periods: [selfPeriod({ items: { outing: 'FORBIDDEN', guardianMustStay } })] });
      assert.equal(classifyDate(stay, POST).guardianSoloAllowed, false);
    }
  });

  test('동반 보호자가 없으면 보호자 단독 외출이 없다', () => {
    const stay = makeStay({ hasCompanion: false, periods: [selfPeriod({ items: { outing: 'FORBIDDEN' } })] });
    assert.equal(classifyDate(stay, POST).guardianSoloAllowed, false);
  });

  test('다른 기간이 허용이어도 FORBIDDEN 이 이긴다', () => {
    const stay = makeStay({
      periods: [selfPeriod({ id: 'P-1' }), hospitalPeriod({ id: 'P-2', items: { outing: 'FORBIDDEN' } })],
    });
    assert.equal(classifyDate(stay, POST).coverage, 'REST_DAY');
  });
});

describe('규칙 10 — 동행 필수인데 동반 보호자 없음', () => {
  test('환자 외출을 만들지 않고 ESCORT_REQUIRED 를 남긴다', () => {
    const stay = makeStay({ hasCompanion: false, periods: [selfPeriod({ items: { escortRequired: SET(true) } })] });
    const c = classifyDate(stay, POST);
    assert.equal(c.coverage, 'RESTRICTED');
    assert.equal(c.patientOutingAllowed, false);
    assert.equal(c.escortRequired, true);
    assert.ok(c.reasons.includes(REASON.ESCORT_REQUIRED));
  });

  test('동행 필수 모르겠음도 기본값(동행 필요)으로 같은 결과다', () => {
    const stay = makeStay({ hasCompanion: false, periods: [selfPeriod({ items: { escortRequired: UNKNOWN } })] });
    const c = classifyDate(stay, POST);
    assert.equal(c.patientOutingAllowed, false);
    assert.ok(c.warnings.includes('DEFAULTS_APPLIED'));
  });

  test('동반 보호자가 있으면 함께 외출할 수 있고 보호자 단독 외출은 없다', () => {
    const stay = makeStay({ periods: [selfPeriod({ items: { escortRequired: SET(true) } })] });
    const c = classifyDate(stay, POST);
    assert.equal(c.patientOutingAllowed, true);
    assert.equal(c.guardianSoloAllowed, false);
    assert.ok(!c.reasons.includes(REASON.ESCORT_REQUIRED));
  });
});

describe('규칙 11 — 한 병원 기간 안의 모순', () => {
  test('그 기간이 덮는 날짜를 CONFLICTING_CONDITION 으로 막는다', () => {
    const stay = makeStay({
      periods: [hospitalPeriod({ items: { escortRequired: SET(true), guardianMustStay: NONE } })],
    });
    const c = classifyDate(stay, POST);
    assert.equal(c.blocked, true);
    assert.ok(c.reasons.includes(REASON.CONFLICTING_CONDITION));
    assert.equal(c.patientOutingAllowed, false);
    assert.equal(c.guardianSoloAllowed, false);
  });

  test('서로 다른 기간끼리의 차이는 모순이 아니라 합성이다', () => {
    const stay = makeStay({
      periods: [
        hospitalPeriod({ id: 'P-H', items: { escortRequired: SET(true), guardianMustStay: SET(true) } }),
        selfPeriod({ id: 'P-S', items: { guardianMustStay: NONE } }),
      ],
    });
    const c = classifyDate(stay, POST);
    assert.equal(c.blocked, false);
    assert.ok(!c.reasons.includes(REASON.CONFLICTING_CONDITION));
  });

  test('만료된 모순 기간은 날짜를 막지 않는다', () => {
    const stay = makeStay({
      periods: [
        hospitalPeriod({ expiresAt: '2026-10-01T00:00:00+09:00', items: { escortRequired: SET(true), guardianMustStay: NONE } }),
      ],
    });
    assert.equal(classifyDate(stay, POST).blocked, false);
  });
});

describe('규칙 12 — 병원 기간의 만료·철회', () => {
  test('expiresAt 이 D의 활동 종료 시각보다 늦어야 D를 덮는다', () => {
    const period = hospitalPeriod({ expiresAt: '2026-10-05T12:00:00+09:00' });
    assert.equal(hospitalPeriodStatus(period, '2026-10-04'), 'ACTIVE');
    assert.equal(hospitalPeriodStatus(period, '2026-10-05'), 'EXPIRED', '하루 도중 만료는 그날을 덮지 않는다');
    assert.equal(hospitalPeriodStatus(hospitalPeriod({ expiresAt: '2026-10-04T21:00:00+09:00' }), '2026-10-04'), 'EXPIRED');
    assert.equal(hospitalPeriodStatus(hospitalPeriod({ expiresAt: '2026-10-04T21:01:00+09:00' }), '2026-10-04'), 'ACTIVE');
    assert.equal(hospitalPeriodStatus(hospitalPeriod({ revoked: true }), '2026-10-04'), 'REVOKED');
    assert.equal(hospitalPeriodStatus(hospitalPeriod({ expiresAt: 'not-a-date' }), '2026-10-04'), 'EXPIRED');
  });

  test('경계일 이후 만료 기간만 덮는 날짜는 HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED', () => {
    const stay = makeStay({ periods: [hospitalPeriod({ expiresAt: '2026-10-05T12:00:00+09:00' })] });
    assert.equal(classifyDate(stay, POST).coverage, 'RESTRICTED');
    const c = classifyDate(stay, '2026-10-05');
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED]);
  });

  test('이미 만료된 지침(DEMO-C)도 기간은 남고 같은 규칙이 적용된다', () => {
    const stay = makeStay({
      periods: [hospitalPeriod({ startDate: '2026-10-01', expiresAt: '2026-09-01T00:00:00+09:00' })],
    });
    assert.equal(classifyDate(stay, POST).coverage, 'NEEDS_INPUT');
    assert.deepEqual(classifyDate(stay, POST).reasons, [REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED]);
    assert.equal(classifyDate(stay, PRE).coverage, 'FREE', '경계일 전이면 FREE 다');
  });

  test('경계일 전 날짜를 덮는 병원 기간이 철회됐고 다른 기간이 없으면 FREE 다', () => {
    const stay = makeStay({ periods: [hospitalPeriod({ startDate: '2026-10-01', revoked: true })] });
    assert.equal(classifyDate(stay, PRE).coverage, 'FREE');
  });

  test('경계일 이후 철회만 덮는 날짜는 입력이 필요하고 철회 사실을 알린다', () => {
    const stay = makeStay({ periods: [hospitalPeriod({ revoked: true })] });
    const c = classifyDate(stay, POST);
    assert.equal(c.coverage, 'NEEDS_INPUT');
    assert.deepEqual(c.reasons, [REASON.CONDITION_INPUT_REQUIRED, REASON.PLAN_REVOKED]);
  });

  test('만료된 병원 기간이 있어도 유효한 본인 체크가 덮으면 그 기간으로 판정한다', () => {
    const stay = makeStay({
      periods: [hospitalPeriod({ expiresAt: '2026-10-01T00:00:00+09:00' }), selfPeriod({ items: { avoidUv: SET(true) } })],
    });
    const c = classifyDate(stay, POST);
    assert.equal(c.coverage, 'RESTRICTED');
    assert.deepEqual(c.appliedPeriodIds, ['P-SELF']);
  });

  test('병원 기간 적용은 민감정보 동의와 무관하게 유효기간·철회로만 정한다', () => {
    const period = hospitalPeriod();
    assert.equal(periodAppliesOnDate(period, POST, { consent: false }), true);
    assert.equal(periodAppliesOnDate(selfPeriod(), POST, { consent: false }), false);
    assert.equal(periodAppliesOnDate(selfPeriod(), POST, { consent: true }), true);
    assert.equal(periodAppliesOnDate(selfPeriod(), '2026-10-09', { consent: true }), false, '기간 밖');
  });
});

describe('분류 결과의 공통 성질', () => {
  test('체류 전체를 날짜별로 분류한다', () => {
    const all = classifyStay(makeStay());
    assert.deepEqual(Object.keys(all), [
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
    ]);
    assert.equal(all['2026-10-02'].date, '2026-10-02');
  });

  test('체류 밖 날짜는 분류하지 않는다', () => {
    assert.throws(() => classifyDate(makeStay(), '2026-10-09'), RangeError);
  });

  test('같은 입력이면 같은 결과이고, 기간 순서와 무관하다', () => {
    const a = selfPeriod({ id: 'P-A', items: { walkLimit: SET(30) } });
    const b = hospitalPeriod({ id: 'P-B', items: { walkLimit: SET(20) } });
    const x = classifyDate(makeStay({ periods: [a, b] }), POST);
    const y = classifyDate(makeStay({ periods: [b, a] }), POST);
    assert.deepEqual(x, y);
    assert.deepEqual(x.appliedPeriodIds, ['P-A', 'P-B']);
  });

  test('입력을 바꾸지 않는다', () => {
    const stay = deepFreeze(makeStay({ periods: [selfPeriod({ items: { escortRequired: SET(true) } })] }));
    assert.doesNotThrow(() => classifyStay(stay));
  });

  test('PlanStay 모양(동의 boolean)도 같은 분류를 낸다', () => {
    const plan = makePlanStay({ periods: [selfPeriod({ items: { outing: 'FORBIDDEN' } })] });
    assert.equal(classifyDate(plan, POST).coverage, 'REST_DAY');
    assert.equal(classifyDate({ ...plan, consent: { sensitive: false } }, POST).coverage, 'NEEDS_INPUT');
  });
});

describe('매일 확인 대상 (spec 4.6)', () => {
  test('오늘이 체류 안이고 오늘을 덮는 SELF 기간이 있으면 대상이다', () => {
    const stay = makeStay({ periods: [selfPeriod()] });
    assert.equal(isDailyCheckTarget(stay, POST), true);
  });

  test('DECLARED_FREE 날짜도 대상이다', () => {
    const stay = makeStay({ periods: [{ id: 'P-FREE', source: 'SELF', startDate: POST, endDate: POST, noRestriction: true }] });
    assert.equal(isDailyCheckTarget(stay, POST), true);
  });

  test('HOSPITAL 기간만 덮는 날은 대상이 아니다', () => {
    assert.equal(isDailyCheckTarget(makeStay({ periods: [hospitalPeriod()] }), POST), false);
  });

  test('SELF 기간이 없거나, 체류 밖이거나, 동의가 없으면 대상이 아니다', () => {
    assert.equal(isDailyCheckTarget(makeStay(), POST), false);
    assert.equal(isDailyCheckTarget(makeStay({ periods: [selfPeriod({ endDate: '2026-10-20' })] }), '2026-10-09'), false);
    assert.equal(isDailyCheckTarget(makeStay({ consent: { sensitive: null }, periods: [selfPeriod()] }), POST), false);
  });

  test('오늘 확인을 마쳤으면 대기가 아니다', () => {
    const stay = makeStay({ periods: [selfPeriod()] });
    assert.equal(isDailyCheckPending(stay, POST, {}), true);
    assert.equal(isDailyCheckPending(stay, POST, { [POST]: 'CONFIRMED' }), false);
    assert.equal(isDailyCheckPending(stay, POST, { '2026-10-03': 'CONFIRMED' }), true, '어제 확인은 오늘을 풀지 않는다');
    assert.equal(isDailyCheckPending(makeStay(), POST, {}), false, '대상이 아니면 대기도 없다');
  });
});
