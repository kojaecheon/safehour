// 화면 표시용 포맷 헬퍼 (클라이언트 전용)
//
// 분 단위 라벨은 언어별 단위 표기가 필요하므로 `src/i18n` 이 소유한다.
// 여기서는 로케일에 의존하는 날짜·시각 포맷만 다룬다 (AX-209).

// 이 앱의 모든 시각은 **한국에 있는 동안**의 시각이다 — 병원 복귀 마감, 복약,
// 다음 진료, 기상청 발표 시각 모두. 단말 시간대로 렌더하면 시차가 있는 나라로
// 설정된 외국인 이용자의 폰에서 복귀 마감이 다른 시각으로 보인다.
// 언어는 바꿔도 시간대는 바꾸지 않는다.
const DISPLAY_TIME_ZONE = 'Asia/Seoul';

export function fmtTime(value, locale = 'ko-KR') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(locale, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function fmtDateTime(value, locale = 'ko-KR') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
    timeZone: DISPLAY_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** datetime-local input 값으로 쓸 로컬 ISO 문자열 (초 제외) — 언어와 무관하다 */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
