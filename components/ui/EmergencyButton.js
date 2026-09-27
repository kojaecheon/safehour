'use client';

// 긴급 연락 버튼 (AX-304 · spec 3.1 · 4.15)
//
// 모든 화면에 고정한다 — 로그인 전·로그인 만료·오프라인·보기 전용 포함. 앱 셸이 늘 그린다.
//   - /emergency 로 가는 링크다. 전화 걸기 목록(119·1330·병원)은 그 화면이 보여준다.
//   - 판정 상태 색과 겹치지 않는 긴급 빨강 + 전화 아이콘 + 문구. 큰 CTA 모양(52px·모서리 12).
//   - DOM 에서는 화면 본문보다 앞에 둔다 — 키보드·스크린리더가 먼저 닿는다.
//   - `docked` 는 고정을 풀고 흐름 안에 놓는다. 시작 화면처럼 하단 바가 이미 있는 화면에서 쓴다 —
//     떠 있으면 언어 선택 칸 같은 누를 수 있는 요소를 덮는다.
//   - `short` 는 좁은 한 줄(시작 화면 하단 바)에서 보이는 글자를 하단 내비와 같은 짧은 이름으로 줄인다('긴급'·'SOS').
//     읽히는 이름은 온전하게 둔다. 짧은 글자가 긴 이름에 들어 있지 않은 언어(en 'SOS')는 '짧은, 긴' 으로 함께
//     읽혀 보이는 글자와 읽히는 이름이 어긋나지 않게 한다(WCAG 2.5.3).

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

/** 짧은 글자가 긴 이름에 들어 있으면 긴 이름을, 아니면 '짧은, 긴' 을 읽힌다 — 보이는 글자와 읽히는 이름을 맞춘다(WCAG 2.5.3) */
export function emergencySpokenName(visible, full) {
  return full.includes(visible) ? full : `${visible}, ${full}`;
}

export default function EmergencyButton({ current = false, preview = false, docked = false, short = false }) {
  const { t } = useLang();
  const full = t('common.emergency');
  const visible = short ? t('common.navEmergency') : full;
  const spokenName = short ? emergencySpokenName(visible, full) : undefined;
  return (
    <Link
      href="/emergency"
      className={`ui-emergency${preview ? ' is-preview' : ''}${docked ? ' is-docked' : ''}`}
      aria-current={current ? 'page' : undefined}
      aria-label={spokenName}
    >
      <Icon name="phone" size={22} strokeWidth={2.2} />
      <span>{visible}</span>
    </Link>
  );
}
