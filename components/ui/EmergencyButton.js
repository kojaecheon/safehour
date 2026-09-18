'use client';

// 긴급 연락 버튼 (AX-304 · spec 3.1 · 4.15)
//
// 모든 화면에 고정한다 — 로그인 전·로그인 만료·오프라인·보기 전용 포함. 앱 셸이 늘 그린다.
//   - /emergency 로 가는 링크다. 전화 걸기 목록(119·1330·병원)은 그 화면이 보여준다.
//   - 판정 상태 색과 겹치지 않는 긴급 빨강 + 전화 아이콘 + 문구. 높이 48px.
//   - DOM 에서는 화면 본문보다 앞에 둔다 — 키보드·스크린리더가 먼저 닿는다.

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

export default function EmergencyButton({ current = false, preview = false }) {
  const { t } = useLang();
  return (
    <Link
      href="/emergency"
      className={preview ? 'ui-emergency is-preview' : 'ui-emergency'}
      aria-current={current ? 'page' : undefined}
    >
      <span className="ui-emergency-dot">
        <Icon name="phone" size={16} strokeWidth={2.4} />
      </span>
      <span>{t('common.emergency')}</span>
    </Link>
  );
}
