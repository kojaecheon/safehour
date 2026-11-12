// 조건 화면의 날짜별 요약: 분류(coverage)와 합성 값의 출처 표시 (AX-315 · docs/business-rules.md '날짜 분류'·'날짜별 합성'·'조건 기간'. 테스트 이름의 spec 번호와 규칙 번호(7, 8)는 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { coverageCounts, effectiveRows, periodCoverage, safeClassifyStay } from '../components/conditions/summary.js';
import { ITEM_KEYS } from '../src/stay/conditions.js';
import { SET, UNKNOWN, hospitalPeriod, makeStay, selfPeriod } from './stay-fixtures.js';

describe('기간별 날짜 분류 요약', () => {
  test('기간이 덮는 체류 날짜마다 분류와 사유를 준다 (체류 밖 날짜는 뺀다)', () => {
    const period = selfPeriod({ id: 'S1', startDate: '2026-10-06', endDate: '2026-10-12' });
    const stay = makeStay({ periods: [period] });
    const { byDate } = safeClassifyStay(stay);
    const list = periodCoverage(stay, period, byDate);
    assert.deepEqual(list.map((d) => d.date), ['2026-10-06', '2026-10-07', '2026-10-08']);
    for (const day of list) assert.equal(day.coverage, 'RESTRICTED');
  });

  test('동의가 없으면 경계일 이후 날짜는 입력 필요 + 동의 사유다', () => {
    const stay = makeStay({ consent: { sensitive: null } });
    const { byDate } = safeClassifyStay(stay);
    assert.equal(byDate['2026-10-01'].coverage, 'FREE');
    assert.equal(byDate['2026-10-04'].coverage, 'NEEDS_INPUT');
    assert.deepEqual(byDate['2026-10-04'].reasons, ['SENSITIVE_CONSENT_REQUIRED']);
  });

  test('coverageCounts 는 분류별 날짜 수를 센다', () => {
    const counts = coverageCounts([
      { coverage: 'FREE' },
      { coverage: 'NEEDS_INPUT' },
      { coverage: 'NEEDS_INPUT' },
    ]);
    assert.deepEqual(counts, { FREE: 1, NEEDS_INPUT: 2 });
  });

  test('분류할 수 없는 체류(형식이 깨짐)는 예외 대신 오류 표시를 준다', () => {
    const result = safeClassifyStay({ arrival: null });
    assert.deepEqual(result.byDate, {});
    assert.equal(result.error, true);
  });
});

describe('합성 값과 출처 (spec 4.5 · 규칙 7·8)', () => {
  test("'모르겠음' 보행 한도는 15분 기본값이고 '기본값 적용'으로 표시된다 (규칙 7)", () => {
    const period = selfPeriod({ id: 'S1', items: { walkLimit: UNKNOWN } });
    const stay = makeStay({ periods: [period] });
    const { byDate } = safeClassifyStay(stay);
    const rows = effectiveRows(byDate['2026-10-04'].effective);
    const walk = rows.find((r) => r.key === 'walkLimit');
    assert.deepEqual(walk.value, { kind: 'SET', value: 15 });
    assert.equal(walk.defaulted, true);
    assert.deepEqual(walk.sources, ['SELF']);
    const uv = rows.find((r) => r.key === 'avoidUv');
    assert.equal(uv.defaulted, false);
  });

  test('두 기간이 겹치면 작은 보행 한도·이른 복귀가 이기고, 이긴 값의 출처가 남는다 (규칙 8)', () => {
    const mine = selfPeriod({
      id: 'S1',
      items: { walkLimit: SET(30), returnTime: { kind: 'SET', time: '19:00', place: 'LODGING' } },
    });
    const hospital = hospitalPeriod({
      id: 'P1',
      items: { walkLimit: SET(20), returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' } },
    });
    const stay = makeStay({ periods: [mine, hospital] });
    const { byDate } = safeClassifyStay(stay);
    const rows = effectiveRows(byDate['2026-10-04'].effective);
    const walk = rows.find((r) => r.key === 'walkLimit');
    assert.deepEqual(walk.value, { kind: 'SET', value: 20 });
    assert.deepEqual(walk.sources, ['HOSPITAL']);
    const back = rows.find((r) => r.key === 'returnTime');
    assert.equal(back.value.time, '18:00');
    assert.deepEqual(back.sources, ['HOSPITAL']);
    const uv = rows.find((r) => r.key === 'avoidUv');
    assert.deepEqual(uv.sources, ['HOSPITAL', 'SELF'], '같은 값이면 두 출처 모두 — 병원 발행이 먼저');
  });

  test('항목 순서는 spec 4.4 표 순서이고, 합성 결과가 없으면 빈 목록이다', () => {
    const stay = makeStay({ periods: [selfPeriod({ id: 'S1' })] });
    const { byDate } = safeClassifyStay(stay);
    assert.deepEqual(effectiveRows(byDate['2026-10-04'].effective).map((r) => r.key), [...ITEM_KEYS]);
    assert.deepEqual(effectiveRows({}), []);
    assert.deepEqual(effectiveRows(undefined), []);
  });
});
