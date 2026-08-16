import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fmtDateTime, fmtTime } from '../lib/format.js';

/**
 * 이 앱의 모든 시각은 **한국에 있는 동안**의 시각이다 — 복귀 마감, 복약, 다음 진료,
 * 기상청 발표 시각. 단말 시간대로 렌더하면 시차가 있는 나라로 설정된 외국인 이용자의
 * 폰에서 복귀 마감이 다른 시각으로 보인다. "복귀 시간 보장" 이 화면에서 깨지는 결함이다.
 *
 * 테스트 러너의 TZ 와 무관하게 같은 문자열이 나와야 하므로 절대 시각으로 고정한다.
 */
describe('시각 표시는 KST 로 고정한다', () => {
  // 2026-08-16T21:55Z = KST 08-17 06:55
  const INSTANT = '2026-08-16T21:55:00.000Z';

  test('fmtTime 은 실행 시간대와 무관하게 KST 시각을 낸다', () => {
    assert.equal(fmtTime(INSTANT), '06:55');
    assert.equal(fmtTime(INSTANT, 'en-GB'), '06:55');
  });

  test('fmtDateTime 은 실행 시간대와 무관하게 KST 날짜·시각을 낸다', () => {
    // 로케일마다 구분자·순서가 달라 날짜 성분만 확인한다 — 날짜가 하루 밀리지 않는 것이 요점이다.
    const ko = fmtDateTime(INSTANT);
    assert.match(ko, /8\..*17\..*06:55/);

    const en = fmtDateTime(INSTANT, 'en-GB');
    assert.match(en, /17\/08.*06:55/);
  });

  test('자정 경계에서 날짜가 밀리지 않는다', () => {
    // 2026-08-16T15:00Z = KST 08-17 00:00 — UTC 로 읽으면 하루 전 15:00 이 된다.
    assert.equal(fmtTime('2026-08-16T15:00:00.000Z'), '00:00');
    assert.match(fmtDateTime('2026-08-16T15:00:00.000Z'), /8\..*17\./);
  });

  test('잘못된 값은 대시로 떨어진다', () => {
    assert.equal(fmtTime('그런 시각 없음'), '—');
    assert.equal(fmtDateTime(undefined), '—');
  });
});
