// 화면 표시용 포맷 헬퍼 (클라이언트 전용)
//
// 분 단위 라벨은 언어별 단위 표기가 필요하므로 `src/i18n` 이 소유한다.
// 여기서는 로케일에 의존하는 날짜·시각 포맷만 다룬다 (AX-209).

export function fmtTime(value, locale = 'ko-KR') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDateTime(value, locale = 'ko-KR') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
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
