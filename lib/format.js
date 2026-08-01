// 화면 표시용 포맷 헬퍼 (클라이언트 전용)

export function fmtTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** datetime-local input 값으로 쓸 로컬 ISO 문자열 (초 제외) */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minutesLabel(min) {
  if (min == null || Number.isNaN(Number(min))) return '확인 불가';
  const n = Math.round(Number(min));
  if (n < 60) return `${n}분`;
  return `${Math.floor(n / 60)}시간 ${n % 60 ? `${n % 60}분` : ''}`.trim();
}
