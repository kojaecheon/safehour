// 날짜별 환자 복귀 마감: 보호자 스냅샷과 서버 알림 업로드가 함께 쓰는 공용 계산
// (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 2, D2·D8)
//
// - 환자 복귀 목록은 하루 일정의 환자 외출(`outings`)에서만 읽는다. 보호자 외출(`guardianOutings`)은 섞이지 않는다.
// - 당겨진 외출(src/domain/states.js isClampedOverdueOuting)은 표시만 해 둔다. 보호자 스냅샷은 지금처럼 담고,
//   서버 알림 업로드(patientDeadlineDays)만 뺀다. 그 마감은 엔진이 '지금'으로 당겨 놓은 값이라 실제 마감 시각이 아니다.
// - 다른 즉시 복귀 원인(환자 호출, 지침 철회·만료)의 날은 실제 마감이 남아 있으므로 그대로 담는다.
//
// 순수 함수다. 네트워크·저장소·브라우저 API·시계를 쓰지 않는다.

import { isClampedOverdueOuting } from '../domain/states.js';
import { isClockTime, isDateString, stayDates } from '../stay/index.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 하루 일정의 환자 복귀 마감 목록. 저장 순서 그대로이고, 복귀 시각이 "HH:MM"이 아닌 외출은 뺀다.
 * @param {object|null|undefined} dayPlan  DayPlan
 * @returns {Array<{ by: string, returnPlace: string|null, clamped: boolean }>}
 */
export function patientReturnsOf(dayPlan) {
  const outings = Array.isArray(dayPlan?.outings) ? dayPlan.outings : [];
  return outings
    .filter((outing) => isObject(outing) && isClockTime(outing.returnBy))
    .map((outing) => ({
      by: outing.returnBy,
      returnPlace: typeof outing.returnPlace === 'string' ? outing.returnPlace : null,
      clamped: isClampedOverdueOuting(dayPlan, outing),
    }));
}

/**
 * 서버 알림에 올릴 날짜별 환자 복귀 마감. fromDate 부터 출국일까지(입국일보다 앞이면 입국일부터) 날짜마다 하나를 만든다.
 * 당겨진 외출의 마감은 빼고, 시각은 중복 없이 정렬한다. 일정이 없는 날은 빈 목록이다.
 * 체류의 입국·출국 날짜를 읽을 수 없으면 빈 목록이다.
 * @param {object} args
 * @param {object} args.stay  Stay
 * @param {{days?: Record<string, object>}|null} args.tripPlan  TripPlan
 * @param {string} args.fromDate  YYYY-MM-DD
 * @returns {Array<{ date: string, deadlines: string[] }>}
 * @throws {TypeError} fromDate 가 날짜가 아님
 */
export function patientDeadlineDays({ stay, tripPlan, fromDate } = {}) {
  let dates;
  try {
    dates = stayDates(stay);
  } catch {
    return [];
  }
  if (!isDateString(fromDate)) throw new TypeError('patientDeadlineDays: fromDate 는 날짜여야 합니다');
  const days = isObject(tripPlan?.days) ? tripPlan.days : {};
  return dates
    .filter((date) => date >= fromDate)
    .map((date) => {
      const dayPlan = Object.hasOwn(days, date) && isObject(days[date]) ? days[date] : undefined;
      const unique = new Set(
        patientReturnsOf(dayPlan)
          .filter((entry) => !entry.clamped)
          .map((entry) => entry.by),
      );
      return { date, deadlines: [...unique].sort() };
    });
}
