// 환자 복귀 마감이 지났는지 (받은 일정 화면 표시용)
//
// 받은 사본의 마감 시각(by, 'HH:MM' KST)과 지금을 견줄 뿐이다. 환자가 돌아왔는지는 앱이 알 수 없으므로
// 'PASSED' 는 '마감 시각이 지났다'는 뜻 하나만 가진다.

import { isDateString, kstInstantMs } from '../../src/stay/time.js';
import { kstDate } from './errorView.js';

const CLOCK = /^(\d{2}):(\d{2})$/;

/**
 * @param {{ date: string, by: string, nowMs: number }} args
 * @returns {'PASSED' | 'UPCOMING' | null}  오늘(KST) 항목이 아니거나 값이 깨졌으면 null
 */
export function patientReturnStatus({ date, by, nowMs }) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  if (typeof date !== 'string' || !isDateString(date) || date !== kstDate(nowMs)) return null;
  const m = typeof by === 'string' ? CLOCK.exec(by) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return nowMs >= kstInstantMs(date, by) ? 'PASSED' : 'UPCOMING';
}
