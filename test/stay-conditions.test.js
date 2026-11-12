// 조건 기간 검증과 정규화 (AX-302 · docs/business-rules.md '숙소와 병원'·'조건 기간'·'날짜별 합성', 테스트 이름의 규칙 6·11·12·13-1 은 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEM_KEYS,
  NO_RESTRICTION_ITEMS,
  getItem,
  hospitalPeriodConflict,
  normalizeConditionPeriod,
  validateConditionPeriod,
} from '../src/stay/conditions.js';
import { VALIDATION_ISSUE } from '../src/stay/errorCodes.js';
import { NONE, SET, UNKNOWN, deepFreeze, hospitalPeriod, selfPeriod } from './stay-fixtures.js';

const HOSPITALS = [{ id: 'H1' }, { id: 'H2' }];

function fieldsOf(period, opts = { hospitals: HOSPITALS }) {
  return validateConditionPeriod(period, opts).fields;
}

describe('항목 키', () => {
  test('spec 4.4 표의 16개 키를 점 표기로 가진다', () => {
    assert.deepEqual(ITEM_KEYS, [
      'outing',
      'returnTime',
      'walkLimit',
      'travelLimit',
      'avoidUv',
      'avoidHeat',
      'avoidWater',
      'escortRequired',
      'guardianMustStay',
      'mealRestriction',
      'diet.spicy',
      'diet.alcohol',
      'diet.hard',
      'diet.hot',
      'diet.raw',
      'medication',
    ]);
    assert.equal(getItem(selfPeriod({ items: { diet: { raw: SET(true) } } }).items, 'diet.raw').kind, 'SET');
  });
});

describe('규칙 6 — 필수 항목과 모르겠음 금지', () => {
  test('모든 항목이 채워진 본인 체크 기간은 통과한다', () => {
    const result = validateConditionPeriod(selfPeriod(), { hospitals: HOSPITALS });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test('outing 이 빠진 SELF 기간은 저장되지 않는다', () => {
    const period = selfPeriod();
    delete period.items.outing;
    const result = validateConditionPeriod(period);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'SAFEHOUR_STAY_INVALID');
    assert.deepEqual(result.fields, ['items.outing']);
  });

  test('outing 에는 모르겠음을 고를 수 없다', () => {
    for (const bad of ['UNKNOWN', UNKNOWN]) {
      const result = validateConditionPeriod(selfPeriod({ items: { outing: bad } }));
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.field === 'items.outing'));
    }
    const coded = validateConditionPeriod(selfPeriod({ items: { outing: UNKNOWN } }));
    assert.equal(coded.issues[0].code, VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
  });

  test('외출 불가가 아닐 때 returnTime 이 빠지면 저장되지 않는다', () => {
    for (const outing of ['ALLOWED', 'INDOOR_ONLY']) {
      const period = selfPeriod({ items: { outing } });
      delete period.items.returnTime;
      assert.deepEqual(fieldsOf(period), ['items.returnTime']);
    }
  });

  test('returnTime 에는 모르겠음을 고를 수 없다', () => {
    const result = validateConditionPeriod(selfPeriod({ items: { returnTime: UNKNOWN } }));
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
  });

  test('외출 불가이면 returnTime 을 묻지 않는다', () => {
    const period = selfPeriod({ items: { outing: 'FORBIDDEN' } });
    delete period.items.returnTime;
    assert.equal(validateConditionPeriod(period).ok, true);
  });

  test('필수가 아닌 항목은 SELF 에서 모르겠음을 허용한다', () => {
    const period = selfPeriod({
      items: {
        walkLimit: UNKNOWN,
        travelLimit: UNKNOWN,
        avoidUv: UNKNOWN,
        avoidHeat: UNKNOWN,
        avoidWater: UNKNOWN,
        escortRequired: UNKNOWN,
        guardianMustStay: UNKNOWN,
        mealRestriction: UNKNOWN,
        medication: UNKNOWN,
        diet: { spicy: UNKNOWN, alcohol: UNKNOWN, hard: UNKNOWN, hot: UNKNOWN, raw: UNKNOWN },
      },
    });
    assert.equal(validateConditionPeriod(period).ok, true);
  });

  test('항목 키가 빠지면(답을 고르지 않음) 저장되지 않는다', () => {
    const period = selfPeriod();
    delete period.items.diet.hot;
    assert.deepEqual(fieldsOf(period), ['items.diet.hot']);
  });

  test('보행·이동 한도는 5–240분이다', () => {
    assert.deepEqual(fieldsOf(selfPeriod({ items: { walkLimit: SET(4) } })), ['items.walkLimit']);
    assert.deepEqual(fieldsOf(selfPeriod({ items: { travelLimit: SET(241) } })), ['items.travelLimit']);
    assert.deepEqual(fieldsOf(selfPeriod({ items: { walkLimit: SET(5), travelLimit: SET(240) } })), []);
  });

  test('예/아니오 항목의 값 있음은 true 뿐이다', () => {
    assert.deepEqual(fieldsOf(selfPeriod({ items: { avoidUv: SET(false) } })), ['items.avoidUv']);
  });

  test('식사 제한은 UNTIL HH:MM 또는 ALL_DAY 다', () => {
    assert.deepEqual(fieldsOf(selfPeriod({ items: { mealRestriction: SET({ mode: 'UNTIL', until: '12:00' }) } })), []);
    assert.deepEqual(fieldsOf(selfPeriod({ items: { mealRestriction: SET({ mode: 'ALL_DAY' }) } })), []);
    assert.deepEqual(fieldsOf(selfPeriod({ items: { mealRestriction: SET({ mode: 'UNTIL' }) } })), ['items.mealRestriction']);
  });

  test('복약은 시각 목록이며 시각마다 숙소에서 복용 여부를 가진다', () => {
    assert.deepEqual(
      fieldsOf(selfPeriod({ items: { medication: SET([{ time: '08:00', atLodging: true }]) } })),
      [],
    );
    assert.deepEqual(fieldsOf(selfPeriod({ items: { medication: SET([]) } })), ['items.medication']);
    assert.deepEqual(
      fieldsOf(selfPeriod({ items: { medication: SET([{ time: '8시', atLodging: true }]) } })),
      ['items.medication'],
    );
  });

  test('시작일이 종료일보다 늦으면 저장되지 않는다', () => {
    assert.ok(fieldsOf(selfPeriod({ startDate: '2026-10-05', endDate: '2026-10-04' })).includes('endDate'));
  });

  test('자유 서술 입력칸은 계약에 없다 — 알 수 없는 출처는 거부한다', () => {
    assert.ok(fieldsOf(selfPeriod({ source: 'AI' })).includes('source'));
  });
});

describe('제한 없음 기간 (noRestriction)', () => {
  test('SELF 제한 없음 기간은 항목 없이도 저장되고, 모든 항목이 아니오·NOT_SET 인 것과 같다', () => {
    const period = { id: 'P-FREE', source: 'SELF', startDate: '2026-10-04', endDate: '2026-10-05', noRestriction: true };
    assert.equal(validateConditionPeriod(period).ok, true);
    const normalized = normalizeConditionPeriod(period);
    assert.deepEqual(normalized.items, NO_RESTRICTION_ITEMS);
    assert.equal(normalized.items.outing, 'ALLOWED');
    assert.deepEqual(normalized.items.returnTime, { kind: 'NOT_SET' });
  });

  test('제한 없음 기간에 다른 항목이 있어도 제한 없음으로 취급한다', () => {
    const period = selfPeriod({ noRestriction: true, items: { outing: 'FORBIDDEN', walkLimit: SET(10) } });
    assert.deepEqual(normalizeConditionPeriod(period).items, NO_RESTRICTION_ITEMS);
  });

  test('HOSPITAL 기간은 제한 없음 기간이 될 수 없다', () => {
    assert.ok(fieldsOf(hospitalPeriod({ noRestriction: true })).includes('noRestriction'));
  });
});

describe('동행 필수와 보호자 곁 지키기', () => {
  test('SELF 에서 escortRequired=예이면 guardianMustStay 는 예로 고정된다', () => {
    for (const given of [NONE, UNKNOWN, SET(true)]) {
      const period = selfPeriod({ items: { escortRequired: SET(true), guardianMustStay: given } });
      assert.equal(validateConditionPeriod(period).ok, true);
      assert.deepEqual(normalizeConditionPeriod(period).items.guardianMustStay, SET(true));
    }
  });

  test('escortRequired 가 예가 아니면 guardianMustStay 답을 그대로 둔다', () => {
    const period = selfPeriod({ items: { escortRequired: NONE, guardianMustStay: NONE } });
    assert.deepEqual(normalizeConditionPeriod(period).items.guardianMustStay, NONE);
  });

  test('규칙 11 — 한 병원 기간 안의 동행 필수 + 분리 허용은 모순으로 판정한다', () => {
    const conflicting = hospitalPeriod({ items: { escortRequired: SET(true), guardianMustStay: NONE } });
    assert.equal(validateConditionPeriod(conflicting, { hospitals: HOSPITALS }).ok, true, '저장은 된다');
    assert.equal(hospitalPeriodConflict(conflicting), true);
    // 병원 값은 고치지 않는다 — 날짜를 막을 뿐이다
    assert.deepEqual(normalizeConditionPeriod(conflicting).items.guardianMustStay, NONE);

    assert.equal(hospitalPeriodConflict(hospitalPeriod({ items: { escortRequired: SET(true), guardianMustStay: SET(true) } })), false);
    assert.equal(hospitalPeriodConflict(selfPeriod({ items: { escortRequired: SET(true), guardianMustStay: NONE } })), false);
  });
});

describe('병원 발행 기간', () => {
  test('모르겠음이 들어 있으면 거부한다', () => {
    const result = validateConditionPeriod(hospitalPeriod({ items: { walkLimit: UNKNOWN } }), { hospitals: HOSPITALS });
    assert.equal(result.ok, false);
    assert.deepEqual(result.fields, ['items.walkLimit']);
    assert.equal(result.issues[0].code, VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED);
  });

  test('유효기간과 철회 여부가 있어야 한다', () => {
    const period = hospitalPeriod();
    delete period.expiresAt;
    period.revoked = 'no';
    const fields = fieldsOf(period);
    assert.ok(fields.includes('expiresAt'));
    assert.ok(fields.includes('revoked'));
  });

  test('이미 만료된 지침의 기간도 저장된다 (규칙 12, DEMO-C)', () => {
    const period = hospitalPeriod({ expiresAt: '2026-01-01T00:00:00+09:00' });
    assert.equal(validateConditionPeriod(period, { hospitals: HOSPITALS }).ok, true);
  });
});

describe('규칙 13-1 — 병원 복귀에는 hospitalId 가 반드시 있다', () => {
  test('hospitalId 가 없으면 거부한다', () => {
    const period = selfPeriod({ items: { returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL' } } });
    const result = validateConditionPeriod(period, { hospitals: HOSPITALS });
    assert.equal(result.ok, false);
    assert.deepEqual(result.fields, ['items.returnTime.hospitalId']);
    assert.equal(result.issues[0].code, VALIDATION_ISSUE.HOSPITAL_ID_REQUIRED);
  });

  test('등록된 병원 목록을 주면 그 안의 병원이어야 한다', () => {
    const period = selfPeriod({ items: { returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL', hospitalId: 'H9' } } });
    assert.deepEqual(fieldsOf(period), ['items.returnTime.hospitalId']);
  });

  test('HOSPITAL 기간도 같은 규칙을 따른다', () => {
    const period = hospitalPeriod({ items: { returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL' } } });
    assert.deepEqual(fieldsOf(period), ['items.returnTime.hospitalId']);
  });

  test('올바른 병원 복귀와 숙소 복귀는 통과한다', () => {
    assert.deepEqual(
      fieldsOf(selfPeriod({ items: { returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL', hospitalId: 'H2' } } })),
      [],
    );
    assert.deepEqual(fieldsOf(selfPeriod({ items: { returnTime: { kind: 'SET', time: '17:00', place: 'LODGING' } } })), []);
    assert.deepEqual(fieldsOf(selfPeriod({ items: { returnTime: { kind: 'SET', time: '5pm', place: 'LODGING' } } })), [
      'items.returnTime',
    ]);
  });
});

describe('정규화는 입력을 바꾸지 않는다', () => {
  test('얼린 입력에서도 새 객체를 돌려준다', () => {
    const period = deepFreeze(selfPeriod({ items: { escortRequired: SET(true), guardianMustStay: NONE } }));
    const normalized = normalizeConditionPeriod(period);
    assert.notEqual(normalized, period);
    assert.deepEqual(period.items.guardianMustStay, NONE);
  });
});
