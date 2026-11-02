// 모르겠음 치환·항목별 엄격 합성·출처 기록 (AX-302 · spec 4.5, 10장 규칙 7·8·16·17)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_RESTRICTION_LIMITS,
  applyUnknownDefaults,
  composeConditions,
  flattenEffective,
} from '../src/stay/compose.js';
import { medicationBlocks, medicationDeadlines } from '../src/stay/dayFrame.js';
import { ITEM_KEYS } from '../src/stay/conditions.js';
import { DEFAULTS, UNKNOWN_DEFAULTS } from '../src/stay/defaults.js';
import { NONE, SET, UNKNOWN, deepFreeze, hospitalPeriod, items, selfPeriod } from './stay-fixtures.js';

const allUnknown = () =>
  items({
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
  });

describe('모르겠음 → 기본값 치환 (spec 4.4 표)', () => {
  test('각 항목이 가장 엄격한 기본값으로 바뀌고 어떤 항목이 바뀌었는지 남긴다', () => {
    const { items: resolved, defaultedKeys } = applyUnknownDefaults(allUnknown());
    assert.deepEqual(resolved.walkLimit, SET(15));
    assert.deepEqual(resolved.travelLimit, SET(20));
    for (const key of ['avoidUv', 'avoidHeat', 'avoidWater', 'escortRequired', 'guardianMustStay']) {
      assert.deepEqual(resolved[key], SET(true), key);
    }
    for (const key of ['spicy', 'alcohol', 'hard', 'hot', 'raw']) {
      assert.deepEqual(resolved.diet[key], SET(true), key);
    }
    assert.deepEqual(resolved.mealRestriction, SET({ mode: 'ALL_DAY' }));
    // 복약 '모르겠음'은 마감을 만들지 않는다
    assert.deepEqual(resolved.medication, NONE);
    assert.deepEqual(
      [...defaultedKeys].sort(),
      ITEM_KEYS.filter((k) => k !== 'outing' && k !== 'returnTime').sort(),
    );
  });

  test('기본값은 설정 파일 한곳에서 온다', () => {
    assert.equal(UNKNOWN_DEFAULTS.walkLimitMin, DEFAULTS.unknown.walkLimitMin);
    assert.equal(DEFAULTS.unknown.walkLimitMin, 15);
    assert.equal(DEFAULTS.unknown.travelLimitMin, 20);
  });

  test('입력을 바꾸지 않는다', () => {
    const frozen = deepFreeze(allUnknown());
    assert.doesNotThrow(() => applyUnknownDefaults(frozen));
    assert.deepEqual(frozen.walkLimit, UNKNOWN);
  });
});

describe('규칙 7 — 보행 한도 모르겠음/아니오', () => {
  test('모르겠음이면 외출 1회 누적 15분 한도와 기본값 적용 표시가 붙는다', () => {
    const { effective, warnings } = composeConditions([selfPeriod({ items: { walkLimit: UNKNOWN } })]);
    assert.deepEqual(effective.walkLimit.value, SET(15));
    assert.deepEqual(effective.walkLimit.provenance, [{ periodId: 'P-SELF', source: 'SELF', defaulted: true }]);
    assert.ok(warnings.includes('DEFAULTS_APPLIED'));
    assert.equal(flattenEffective(effective).walkLimitMin, 15);
  });

  test('아니오이면 보행 누적 제한이 없고 기본값 표시도 없다', () => {
    const { effective, warnings } = composeConditions([selfPeriod({ items: { walkLimit: NONE } })]);
    assert.deepEqual(effective.walkLimit.value, NONE);
    assert.deepEqual(effective.walkLimit.provenance, [{ periodId: 'P-SELF', source: 'SELF', defaulted: false }]);
    assert.equal(flattenEffective(effective).walkLimitMin, null);
    assert.ok(!warnings.includes('DEFAULTS_APPLIED'));
  });
});

describe('규칙 8 — 두 기간이 같은 날짜를 덮을 때', () => {
  const a = selfPeriod({
    id: 'P-A',
    items: { walkLimit: SET(30), returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' }, outing: 'ALLOWED' },
  });
  const b = hospitalPeriod({
    id: 'P-B',
    items: {
      walkLimit: SET(20),
      returnTime: { kind: 'SET', time: '16:30', place: 'HOSPITAL', hospitalId: 'H1' },
      outing: 'FORBIDDEN',
    },
  });

  test('보행 한도는 작은 값, 복귀 시각은 이른 값(장소 포함), outing 은 FORBIDDEN 이 이긴다', () => {
    const { effective } = composeConditions([a, b]);
    assert.deepEqual(effective.walkLimit.value, SET(20));
    assert.deepEqual(effective.returnTime.value, { kind: 'SET', time: '16:30', place: 'HOSPITAL', hospitalId: 'H1' });
    assert.equal(effective.outing.value, 'FORBIDDEN');
  });

  test('각 값의 출처가 기록된다', () => {
    const { effective } = composeConditions([a, b]);
    assert.deepEqual(effective.walkLimit.provenance, [{ periodId: 'P-B', source: 'HOSPITAL', defaulted: false }]);
    assert.deepEqual(effective.returnTime.provenance, [{ periodId: 'P-B', source: 'HOSPITAL', defaulted: false }]);
    assert.deepEqual(effective.outing.provenance, [{ periodId: 'P-B', source: 'HOSPITAL', defaulted: false }]);
    // 모든 항목에 값과 출처가 있다
    for (const key of ITEM_KEYS) {
      assert.ok(effective[key], key);
      assert.ok(Array.isArray(effective[key].provenance) && effective[key].provenance.length > 0, key);
    }
  });

  test('기간 순서가 달라도 결과가 같다 (결정성)', () => {
    assert.deepEqual(composeConditions([a, b]), composeConditions([b, a]));
  });

  test('같은 값을 낸 기간은 모두 출처에 남는다', () => {
    const c = selfPeriod({ id: 'P-C', items: { walkLimit: SET(20) } });
    const { effective } = composeConditions([a, b, c]);
    assert.deepEqual(
      effective.walkLimit.provenance.map((p) => p.periodId),
      ['P-B', 'P-C'],
    );
  });

  test('입력을 바꾸지 않는다', () => {
    const periods = deepFreeze([structuredClone(a), structuredClone(b)]);
    assert.doesNotThrow(() => composeConditions(periods));
  });
});

describe('항목별 엄격 순서 (spec 4.5 표)', () => {
  const pair = (x, y) =>
    composeConditions([selfPeriod({ id: 'P-1', items: x }), selfPeriod({ id: 'P-2', items: y })]).effective;

  test('outing: INDOOR_ONLY > ALLOWED', () => {
    assert.equal(pair({ outing: 'ALLOWED' }, { outing: 'INDOOR_ONLY' }).outing.value, 'INDOOR_ONLY');
  });

  test('returnTime: 설정된 시각 > NOT_SET', () => {
    const e = pair({ returnTime: { kind: 'NOT_SET' } }, { returnTime: { kind: 'SET', time: '20:00', place: 'LODGING' } });
    assert.deepEqual(e.returnTime.value, { kind: 'SET', time: '20:00', place: 'LODGING' });
    assert.deepEqual(e.returnTime.provenance.map((p) => p.periodId), ['P-2']);
  });

  test('travelLimit: 작은 값 > 제한 없음', () => {
    assert.deepEqual(pair({ travelLimit: NONE }, { travelLimit: SET(40) }).travelLimit.value, SET(40));
  });

  test('예/아니오: 예가 제한이다', () => {
    const e = pair(
      { avoidHeat: NONE, guardianMustStay: NONE, diet: { alcohol: SET(true) } },
      { avoidHeat: SET(true), guardianMustStay: SET(true), diet: { alcohol: NONE } },
    );
    assert.deepEqual(e.avoidHeat.value, SET(true));
    assert.deepEqual(e.guardianMustStay.value, SET(true));
    assert.deepEqual(e['diet.alcohol'].value, SET(true));
    assert.deepEqual(e['diet.alcohol'].provenance.map((p) => p.periodId), ['P-1']);
  });

  test('mealRestriction: ALL_DAY > 더 늦은 UNTIL > 더 이른 UNTIL > 없음', () => {
    const until = (t) => SET({ mode: 'UNTIL', until: t });
    assert.deepEqual(pair({ mealRestriction: until('10:00') }, { mealRestriction: until('12:00') }).mealRestriction.value, until('12:00'));
    assert.deepEqual(pair({ mealRestriction: until('12:00') }, { mealRestriction: SET({ mode: 'ALL_DAY' }) }).mealRestriction.value, SET({ mode: 'ALL_DAY' }));
    assert.deepEqual(pair({ mealRestriction: NONE }, { mealRestriction: until('09:00') }).mealRestriction.value, until('09:00'));
  });

  test('medication: 모든 시각의 합집합, 같은 시각에 숙소 복용이 하나라도 예이면 예', () => {
    const e = pair(
      { medication: SET([{ time: '20:00', atLodging: true }, { time: '08:00', atLodging: false }]) },
      { medication: SET([{ time: '08:00', atLodging: true }, { time: '13:00', atLodging: false }]) },
    );
    assert.deepEqual(
      e.medication.value,
      SET([
        { time: '08:00', atLodging: true },
        { time: '13:00', atLodging: false },
        { time: '20:00', atLodging: true },
      ]),
    );
    assert.deepEqual(e.medication.provenance.map((p) => p.periodId), ['P-1', 'P-2']);
  });
});

describe('규칙 16·17 — 복약 마감', () => {
  test('숙소에서 복용만 마감이 되고 MEDICATION_WINDOW 사유가 기록된다', () => {
    const limits = flattenEffective(
      composeConditions([
        selfPeriod({ items: { medication: SET([{ time: '13:00', atLodging: false }, { time: '08:00', atLodging: true }]) } }),
      ]).effective,
    );
    assert.deepEqual(medicationDeadlines(limits.medication), [
      { time: '08:00', deadlineReason: 'MEDICATION', reason: 'MEDICATION_WINDOW' },
    ]);
    assert.deepEqual(medicationBlocks(limits.medication), [{ kind: 'MEDICATION', start: '08:00', end: '08:15' }]);
  });

  test('복약이 모르겠음이면 마감이 없고 MEDICATION_TIMES_MISSING 경고가 붙는다', () => {
    const { effective, warnings } = composeConditions([selfPeriod({ items: { medication: UNKNOWN } })]);
    const limits = flattenEffective(effective);
    assert.deepEqual(limits.medication, []);
    assert.deepEqual(medicationDeadlines(limits.medication), []);
    assert.ok(warnings.includes('MEDICATION_TIMES_MISSING'));
    assert.ok(warnings.includes('DEFAULTS_APPLIED'));
    assert.deepEqual(effective.medication.provenance, [{ periodId: 'P-SELF', source: 'SELF', defaulted: true }]);
  });

  test('다른 기간에 시각이 있어도 모르겠음 기간이 있으면 경고를 남긴다', () => {
    const { effective, warnings } = composeConditions([
      selfPeriod({ id: 'P-1', items: { medication: UNKNOWN } }),
      selfPeriod({ id: 'P-2', items: { medication: SET([{ time: '09:00', atLodging: true }]) } }),
    ]);
    assert.deepEqual(effective.medication.value, SET([{ time: '09:00', atLodging: true }]));
    assert.ok(warnings.includes('MEDICATION_TIMES_MISSING'));
  });

  test('복약이 아니오이면 마감도 경고도 없다', () => {
    const { effective, warnings } = composeConditions([selfPeriod()]);
    assert.deepEqual(flattenEffective(effective).medication, []);
    assert.deepEqual(warnings, []);
  });
});

describe('평탄화 (엔진 입력)', () => {
  test('합성 결과를 엔진이 읽는 단순 값으로 바꾼다', () => {
    const { effective } = composeConditions([
      selfPeriod({
        items: {
          outing: 'INDOOR_ONLY',
          returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL', hospitalId: 'H1' },
          walkLimit: SET(25),
          avoidUv: SET(true),
          escortRequired: SET(true),
          mealRestriction: SET({ mode: 'UNTIL', until: '11:00' }),
          diet: { spicy: SET(true) },
        },
      }),
    ]);
    assert.deepEqual(flattenEffective(effective), {
      outing: 'INDOOR_ONLY',
      returnTime: { time: '17:00', place: 'HOSPITAL', hospitalId: 'H1' },
      walkLimitMin: 25,
      travelLimitMin: null,
      avoidUv: true,
      avoidHeat: false,
      avoidWater: false,
      escortRequired: true,
      guardianMustStay: true,
      mealRestriction: { mode: 'UNTIL', until: '11:00' },
      diet: { spicy: true, alcohol: false, hard: false, hot: false, raw: false },
      medication: [],
    });
  });

  test('제한 없음 한도 상수는 모든 항목이 풀린 값이다', () => {
    assert.equal(NO_RESTRICTION_LIMITS.outing, 'ALLOWED');
    assert.equal(NO_RESTRICTION_LIMITS.returnTime, null);
    assert.equal(NO_RESTRICTION_LIMITS.walkLimitMin, null);
    assert.equal(NO_RESTRICTION_LIMITS.escortRequired, false);
    assert.ok(Object.isFrozen(NO_RESTRICTION_LIMITS));
  });

  test('항목이 빠진 합성 결과는 평탄화하지 않는다 (조용히 제한 없음으로 읽지 않음)', () => {
    assert.throws(() => flattenEffective({}), TypeError);
  });

  test('기간이 없으면 합성 결과가 비어 있다', () => {
    assert.deepEqual(composeConditions([]), { effective: {}, warnings: [] });
  });
});

describe('검증을 거치지 않은 기간이 들어와도 느슨해지지 않는다', () => {
  test('outing 값이 없거나 모르겠음이면 FORBIDDEN(기본값 적용)으로 본다', () => {
    const period = selfPeriod({ items: { outing: 'UNKNOWN' } });
    const { effective } = composeConditions([period]);
    assert.equal(effective.outing.value, 'FORBIDDEN');
    assert.equal(effective.outing.provenance[0].defaulted, true);
  });

  test('병원 기간에 모르겠음이 섞여도 엄격한 기본값을 쓴다', () => {
    const { effective } = composeConditions([hospitalPeriod({ items: { avoidWater: UNKNOWN } })]);
    assert.deepEqual(effective.avoidWater.value, SET(true));
    assert.equal(effective.avoidWater.provenance[0].defaulted, true);
  });

  test('외출이 가능한데 복귀 시각을 알 수 없으면 합성을 거부한다', () => {
    const period = selfPeriod({ items: { returnTime: UNKNOWN } });
    assert.throws(() => composeConditions([period]), TypeError);
  });
});
