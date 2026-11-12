'use client';

// 날짜 칩 (AX-304 · docs/platform/IA_AND_FLOWS.md '경로'의 /trip, docs/business-rules.md '하루 일정 생성'의 날짜 상태 표)
//
//   <ul className="ui-date-strip">
//     <li><DateChip date="2026-10-03" state="TOGETHER" isToday selected href="/trip/2026-10-03" /></li>
//   </ul>
//
// - 보이는 글은 요일(오늘이면 '오늘')과 날짜 숫자, 상태 아이콘이다. 스크린리더에는 전체 날짜·오늘·상태·병원 일정을
//   한 문장으로 읽힌다(보이는 글은 aria-hidden).
// - 상태는 흰 원판 위 상태 색 아이콘 + 읽히는 상태 라벨 — 색 단독이 아니다. 선택된 칩에서도 상태 색이 남는다.
// - 오늘: 굵은 포인트 테두리 + '오늘' 글자. 선택: 포인트 면. 둘 다 색 말고도 글자·테두리로 드러난다.
// - 날짜는 한국 시각 기준으로 읽는다(체류지 시각). 60×92px 로 터치 대상 44px 이상.

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import Icon, { STATE_ICON } from './Icon.js';

function dateParts(date, locale) {
  // 정오 KST 로 만들어 어느 시간대에서도 같은 날짜가 된다
  const at = new Date(`${date}T12:00:00+09:00`);
  if (Number.isNaN(at.getTime())) return null;
  const opts = { timeZone: 'Asia/Seoul' };
  return {
    day: String(Number(date.slice(8, 10))),
    weekday: new Intl.DateTimeFormat(locale, { ...opts, weekday: 'short' }).format(at),
    full: new Intl.DateTimeFormat(locale, { ...opts, month: 'long', day: 'numeric', weekday: 'long' }).format(at),
  };
}

/**
 * @param {object} props
 * @param {string} props.date                 'YYYY-MM-DD'
 * @param {'NO_TOURISM'|'STANDBY'|'SPLIT_NEARBY'|'TOGETHER'} [props.state]
 * @param {boolean} [props.isToday]
 * @param {boolean} [props.selected]
 * @param {boolean} [props.hasAppointment]    병원 일정이 있는 날
 * @param {string} [props.href]               있으면 링크(선택이면 aria-current="page"), 없으면 버튼(aria-pressed)
 * @param {() => void} [props.onClick]
 */
export default function DateChip({ date, state, isToday = false, selected = false, hasAppointment = false, href, onClick }) {
  const { t, locale } = useLang();
  const parts = dateParts(date, locale);
  if (!parts) return null;

  const spoken = [
    parts.full,
    isToday ? t('common.today') : null,
    state ? t(`state.${state}`) : null,
    hasAppointment ? t('common.tlAppointment') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const className = ['ui-date-chip', isToday ? 'is-today' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  const body = (
    <>
      <span className="visually-hidden">{spoken}</span>
      <span className="ui-date-week" aria-hidden="true">
        {isToday ? t('common.today') : parts.weekday}
      </span>
      <span className="ui-date-day" aria-hidden="true">
        {parts.day}
      </span>
      <span className="ui-date-marks" aria-hidden="true">
        {state && (
          <span className={`ui-date-state ui-date-state-${state}`}>
            <Icon name={STATE_ICON[state]} size={16} strokeWidth={2.2} />
          </span>
        )}
        {hasAppointment && (
          <span className="ui-date-appt">
            <Icon name="hospital" size={14} strokeWidth={2.2} />
          </span>
        )}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-current={selected ? 'page' : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {body}
    </button>
  );
}
