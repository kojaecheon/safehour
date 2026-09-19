// 표시용 선택자 (AX-316 · spec 4.6, 4.9 오늘 게이트 덧씌우기, 규칙 32·49·56)
//
// 저장된 확정 일정은 바꾸지 않는다. 오늘 일정을 보여주는 시점에만 overlayTodayGate 로 덧씌운다.
//   - 매일 확인 대기(DAILY_CHECK_PENDING): 오늘이 매일 확인 대상이고 오늘 확인 기록이 없음
//   - 확인하지 않은 병원 중요 안내(PLAN_UNCONFIRMED_UPDATE): 연동 사본 중 하나라도 중요 안내가 미확인
// 확인이 끝나면 덧씌우기만 사라진다(저장된 하루 객체를 그대로 돌려준다).
//
// 순수 함수다.

import { unconfirmedCritical } from '../../src/recovery/instructions.js';
import { isDailyCheckPending, overlayTodayGate } from '../../src/stay/index.js';

/** 연동 사본 중 확인하지 않은 중요 안내가 있는가 (규칙 56 — 확인 키는 id@updatedAt) */
export function hasUnconfirmedHospitalUpdate(stay) {
  return (stay?.linkedPlans ?? []).some((lp) => unconfirmedCritical(lp?.plan, lp?.acknowledged ?? {}).length > 0);
}

/**
 * 오늘 게이트.
 * @param {{stay: object|null, prefs: {dailyCheck?: Record<string, 'CONFIRMED'>}|null, today: string}} args
 * @returns {{dailyCheckPending: boolean, unconfirmedHospitalUpdate: boolean}}
 */
export function selectTodayGates({ stay, prefs, today }) {
  if (!stay) return { dailyCheckPending: false, unconfirmedHospitalUpdate: false };
  return {
    dailyCheckPending: isDailyCheckPending(stay, today, prefs?.dailyCheck ?? {}),
    unconfirmedHospitalUpdate: hasUnconfirmedHospitalUpdate(stay),
  };
}

/**
 * 오늘 화면용 일정.
 * @returns {{date: string, stored: object|null, day: object|null, gates: {dailyCheckPending: boolean, unconfirmedHospitalUpdate: boolean}}}
 *   stored: 저장된 하루(그대로), day: 덧씌운 표시용 하루(덧씌울 것이 없으면 stored 와 같은 객체)
 */
export function selectTodayView({ tripPlan, stay, prefs, today }) {
  const stored = tripPlan?.days?.[today] ?? null;
  const gates = selectTodayGates({ stay, prefs, today });
  return { date: today, stored, day: stored ? overlayTodayGate(stored, gates) : null, gates };
}

/** 날짜 하나의 표시용 일정 — 오늘만 덧씌운다 */
export function selectDayView({ tripPlan, stay, prefs, today, date }) {
  if (date === today) return selectTodayView({ tripPlan, stay, prefs, today }).day;
  return tripPlan?.days?.[date] ?? null;
}
