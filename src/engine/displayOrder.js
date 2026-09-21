// 하루 일정의 표시 순서 (spec 5.2 DayPlan.warnings · Stop.labels)
//
// 하루 일정 엔진(dayPlan.js)이 이 순서로 만들고, 체류 조립·재계획(tripPlan.js)이 같은 순서로 다시 쓴다.
// tripPlan 쪽은 이 목록을 **거르개**로 쓴다(relabelStop · assembleDay) — 목록에 없는 값은
// 재계획·언어 다시 쓰기에서 조용히 사라진다. 그래서 목록을 두 벌로 두면 한쪽에만 더한 경고·표시가
// 소리 없이 없어진다. 한곳에서만 내보낸다 (src/stay/compose.js 의 WARNING 과 같은 방식).

import { WARNING } from '../stay/compose.js';

/** 날짜 경고 순서 (DayPlan.warnings) — 값은 조건 합성의 WARNING 과 같다 */
export const WARNING_ORDER = Object.freeze([
  WARNING.MEDICATION_TIMES_MISSING,
  WARNING.DEFAULTS_APPLIED,
  WARNING.TRAVEL_TIMES_ESTIMATED,
]);

/** 정거장 표시 순서 (Stop.labels) */
export const LABEL_ORDER = Object.freeze([
  'ESTIMATED',
  'HOURS_UNCONFIRMED',
  'NEEDS_TRANSLATION',
  'DIET_ESTIMATED',
  'ORDER_CARD',
]);
