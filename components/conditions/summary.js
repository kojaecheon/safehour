// 조건 화면의 날짜별 요약, 순수 함수 (AX-315 · docs/business-rules.md '날짜별 합성'·'날짜 분류')
//
// 날짜 분류와 합성은 도메인(src/stay/coverage.js classifyStay)이 한다. 여기서는 화면에 보여줄 모양으로만 고른다.
// 판정 규칙을 새로 만들지 않는다.
//
// Next 밖(node --test)에서도 읽히도록 상대 경로만 쓴다.

import { ITEM_KEYS } from '../../src/stay/conditions.js';
import { classifyStay } from '../../src/stay/coverage.js';
import { isStayDate } from '../../src/stay/stay.js';
import { eachDate, isDateString } from '../../src/stay/time.js';

/** 분류 표시 순서 (docs/business-rules.md '날짜 분류') */
export const COVERAGE_ORDER = Object.freeze(['FREE', 'DECLARED_FREE', 'RESTRICTED', 'REST_DAY', 'NEEDS_INPUT']);

/**
 * 체류 전체 분류. 형식이 깨진 체류·기간이 있어도 화면이 멈추지 않게 예외를 오류 표시로 바꾼다.
 * @returns {{byDate: Record<string, import('../../src/stay/coverage.js').DateClassification>, error: boolean}}
 */
export function safeClassifyStay(stay) {
  try {
    return { byDate: classifyStay(stay), error: false };
  } catch {
    return { byDate: {}, error: true };
  }
}

/**
 * 기간이 덮는 체류 날짜마다 분류와 사유 (체류 밖 날짜는 뺀다).
 * @param {object} stay
 * @param {{startDate: string, endDate: string}} period
 * @param {Record<string, {coverage: string, reasons: string[]}>} byDate  safeClassifyStay().byDate
 * @returns {Array<{date: string, coverage: string, reasons: string[]}>}
 */
export function periodCoverage(stay, period, byDate) {
  if (!isDateString(period?.startDate) || !isDateString(period?.endDate) || period.startDate > period.endDate) return [];
  return eachDate(period.startDate, period.endDate)
    .filter((date) => isStayDate(stay, date) && byDate?.[date])
    .map((date) => ({ date, coverage: byDate[date].coverage, reasons: byDate[date].reasons ?? [] }));
}

/** 분류별 날짜 수 — 0 인 분류는 넣지 않는다 */
export function coverageCounts(list) {
  const counts = {};
  for (const day of list ?? []) counts[day.coverage] = (counts[day.coverage] ?? 0) + 1;
  return counts;
}

/**
 * 합성 결과(`DayPlan.effective` 모양)를 화면 줄로. 항목 순서는 docs/business-rules.md '조건 기간'의 항목 표 순서다.
 * - sources: 이 값을 낸 출처 — 병원 발행이 먼저, 그다음 본인 체크 (중복 없음)
 * - defaulted: '모르겠음'에 기본값을 적용한 출처가 있는가 → '기본값 적용'
 * @param {Record<string, {value: any, provenance: Array<{periodId: string, source: string, defaulted: boolean}>}>} effective
 * @returns {Array<{key: string, value: any, sources: Array<'HOSPITAL'|'SELF'>, defaulted: boolean}>}
 */
export function effectiveRows(effective) {
  if (!effective || typeof effective !== 'object') return [];
  return ITEM_KEYS.filter((key) => effective[key] && effective[key].value !== undefined).map((key) => {
    const provenance = Array.isArray(effective[key].provenance) ? effective[key].provenance : [];
    const sources = ['HOSPITAL', 'SELF'].filter((source) => provenance.some((p) => p.source === source));
    return {
      key,
      value: effective[key].value,
      sources,
      defaulted: provenance.some((p) => p.defaulted === true),
    };
  });
}
