// 조건 화면의 날짜 표시 (AX-315)
//
// 'YYYY-MM-DD' 는 KST 달력 날짜다. 기기 시간대와 무관하게 같은 날로 보이도록 UTC 자정으로 읽어 UTC 로 쓴다.
// 절대 시각(ISO)은 lib/format.js 의 fmtDateTime 이 한국 시각으로 쓴다.

import { isDateString } from '../../src/stay/time.js';

/** 'YYYY-MM-DD' → '9월 20일 (일)' 같은 짧은 날짜 */
export function fmtDay(date, locale = 'ko-KR') {
  if (!isDateString(date)) return typeof date === 'string' ? date : '';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}
