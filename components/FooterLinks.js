'use client';

// 모든 판정 화면 하단에 붙는 고지·데이터 통제 묶음 (AX-210 · AX-211)
//
// 개인정보 안내와 "내 정보 지우기" 는 찾기 어려우면 없는 것과 같다.
// 화면마다 같은 자리에 둔다.

import Link from 'next/link';
import ClearSessionButton from './ClearSessionButton.js';
import { useLang } from './LanguageProvider.js';

export default function FooterLinks() {
  const { t } = useLang();
  return (
    <>
      <p style={{ padding: '0 4px' }}>
        <Link href="/privacy" className="link-button" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {t('privacy.link')}
        </Link>
      </p>
      <ClearSessionButton />
    </>
  );
}
