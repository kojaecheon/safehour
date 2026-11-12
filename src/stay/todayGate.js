// 오늘 게이트 덧씌우기 (AX-302 · docs/business-rules.md '매일 확인'·'전체 일정 확정과 변화 대응'·'사용자 편집')
//
// 매일 확인 대기(DAILY_CHECK_PENDING)와 확인하지 않은 병원 중요 안내(PLAN_UNCONFIRMED_UPDATE)는
// **저장된 확정 일정을 바꾸지 않는다.** 오늘 일정을 보여주는 시점에 이 순수 함수로 덧씌운다.
// 확인이 끝나면 덧씌우기만 사라진다. 재계획이 필요하면(조건이 바뀐 경우) 재계획을 따로 한다.

import { REASON, STATE, STATE_ORDER, mostConservative } from '../domain/states.js';

/**
 * 표시용 오늘 일정을 만든다. 입력 `dayPlan` 은 절대 바꾸지 않는다.
 *
 * 덧씌울 것이 있으면 새 객체를 돌려준다.
 * - `dayState`: STANDBY 로 **강등**한다. 이미 더 보수적인 NO_TOURISM 은 그대로 둔다
 * - `reasons`: 덧씌운 사유를 맨 앞에 둔다(중복 없음)
 * - `outings[]`·`guardianOutings[]`: 각 외출에 `actionable: false` (길찾기·장소 이동 비활성)
 * - `todayGate`: `{ reasons, actionsDisabled: true }` — 표시 전용 필드. 저장하지 않는다
 *
 * 덧씌울 것이 없으면 입력을 그대로 돌려준다(복사하지 않음 — 호출부는 결과를 바꾸지 않는다).
 *
 * @param {object|null|undefined} dayPlan  저장된 `DayPlan` (docs/contracts.md '`POST /api/itinerary/plan`')
 * @param {{dailyCheckPending?: boolean, unconfirmedHospitalUpdate?: boolean}} gates
 * @returns {object|null|undefined}
 */
export function overlayTodayGate(dayPlan, { dailyCheckPending = false, unconfirmedHospitalUpdate = false } = {}) {
  if (!dayPlan) return dayPlan;

  // 참으로 읽히는 값이면 덧씌운다 — 애매한 입력은 막는 쪽으로 틀린다
  const gateReasons = [];
  if (dailyCheckPending) gateReasons.push(REASON.DAILY_CHECK_PENDING);
  if (unconfirmedHospitalUpdate) gateReasons.push(REASON.PLAN_UNCONFIRMED_UPDATE);
  if (gateReasons.length === 0) return dayPlan;

  const stored = Array.isArray(dayPlan.reasons) ? dayPlan.reasons : [];
  const disable = (outing) => ({ ...outing, actionable: false });

  const shown = {
    ...dayPlan,
    dayState: STATE_ORDER.includes(dayPlan.dayState)
      ? mostConservative(dayPlan.dayState, STATE.STANDBY)
      : STATE.STANDBY,
    reasons: [...gateReasons, ...stored.filter((r) => !gateReasons.includes(r))],
    todayGate: { reasons: [...gateReasons], actionsDisabled: true },
  };
  if (Array.isArray(dayPlan.outings)) shown.outings = dayPlan.outings.map(disable);
  if (Array.isArray(dayPlan.guardianOutings)) shown.guardianOutings = dayPlan.guardianOutings.map(disable);
  return shown;
}
