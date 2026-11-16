// 환자 복귀 마감이 지났는지 (받은 일정 화면 표시용)
//
// 받은 사본의 마감 시각(by, 'HH:MM' KST)과 지금을 견줄 뿐이다. 환자가 돌아왔는지는 앱이 알 수 없으므로
// 'PASSED' 는 '마감 시각이 지났다'는 뜻 하나만 가진다.
//
// 서버 상태 조회의 '복귀 확인'(docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7, 정한 값 15)
//   - confirmedFor: 조회의 date 가 그 줄의 날짜와 같고 confirmed 에 그 마감 시각이 있으면 참이다. 환자가 '돌아왔어요'를 눌렀다는
//     신호를 서버가 받았다는 뜻뿐이고 판정이 아니다. 화면은 꼬리표를 늘 guardian.confirmedHelp(앱은 위치를 모른다) 와 함께 그린다.
//   - returnRowView: 받은 일정의 줄마다 꼬리표와 줄 안 안내를 고르는 규칙은 이 함수 하나다. 확인된 마감은 '마감 지남' 꼬리표·연락 안내·
//     줄 안의 전화 버튼 대신 복귀 확인 꼬리표와 안내다(마감 전 줄도 같다). serverStatus 가 없으면 예전과 같은 값을 고른다(시안 보드).
//   - serverCheckedAt: 그날 확인된 줄이 있을 때만 '{시각}에 서버에서 확인한 내용이에요.' 의 시각(조회를 받은 기기 시각)을 준다.
// 위치를 읽거나 묻지 않는다. 화면 아래 긴급 절(119, 1330)은 이 규칙과 무관하게 늘 그대로다.

import { isDateString, kstInstantMs } from '../../src/stay/time.js';
import { kstDate } from './errorView.js';

const CLOCK = /^(\d{2}):(\d{2})$/;

/** 줄의 꼬리표 */
export const RETURN_TAG = Object.freeze({ CONFIRMED: 'CONFIRMED', PASSED: 'PASSED', UPCOMING: 'UPCOMING' });

/** 줄 안의 안내: 복귀 확인 안내, 또는 마감 지남의 연락 안내와 전화 버튼 */
export const RETURN_HELP = Object.freeze({ CONFIRMED: 'CONFIRMED', OVERDUE: 'OVERDUE' });

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

/**
 * 서버 상태 조회가 이 줄의 마감을 확인으로 받았는가(조회 날짜가 줄 날짜와 같고 confirmed 에 그 시각이 있다).
 * @param {{ date: string, by: string } | null | undefined} row
 * @param {{ date: string, confirmed: string[] } | null | undefined} serverStatus
 * @returns {boolean}
 */
export function confirmedFor(row, serverStatus) {
  if (!row || typeof row !== 'object' || !serverStatus || typeof serverStatus !== 'object') return false;
  if (!isDateString(serverStatus.date) || row.date !== serverStatus.date) return false;
  if (typeof row.by !== 'string' || !Array.isArray(serverStatus.confirmed)) return false;
  return serverStatus.confirmed.includes(row.by);
}

/**
 * 받은 일정 한 줄의 꼬리표와 줄 안 안내.
 * @param {{ date: string, by: string, nowMs: number, serverStatus?: object | null }} args
 * @returns {{ tag: 'CONFIRMED'|'PASSED'|'UPCOMING'|null, help: 'CONFIRMED'|'OVERDUE'|null }}
 */
export function returnRowView({ date, by, nowMs, serverStatus = null }) {
  const status = patientReturnStatus({ date, by, nowMs });
  if (confirmedFor({ date, by }, serverStatus)) return { tag: RETURN_TAG.CONFIRMED, help: RETURN_HELP.CONFIRMED };
  return { tag: status, help: status === 'PASSED' ? RETURN_HELP.OVERDUE : null };
}

/**
 * 맨 위 '오늘 환자 복귀 마감' 카드의 꼬리표. 카드는 아래 줄의 값을 다시 보여 줄 뿐이라 같은 확인을 따른다.
 * @param {{ date: string, by: string, status: 'PASSED'|'UPCOMING'|null }} summary  todayReturnSummary 의 값
 * @param {object | null | undefined} serverStatus
 */
export function todayCardTag(summary, serverStatus) {
  if (confirmedFor(summary, serverStatus)) return RETURN_TAG.CONFIRMED;
  return summary?.status ?? null;
}

/**
 * 그날 확인된 줄이 있으면 서버에서 확인한 시각(조회를 받은 기기 시각, ms), 없으면 null.
 * @param {string} date
 * @param {Array<{ by: string }>} entries
 * @param {{ date: string, confirmed: string[], atMs: number } | null | undefined} serverStatus
 * @returns {number | null}
 */
export function serverCheckedAt(date, entries, serverStatus) {
  if (!serverStatus || typeof serverStatus.atMs !== 'number' || !Number.isFinite(serverStatus.atMs)) return null;
  if (!Array.isArray(entries)) return null;
  return entries.some((entry) => confirmedFor({ date, by: entry?.by }, serverStatus)) ? serverStatus.atMs : null;
}
