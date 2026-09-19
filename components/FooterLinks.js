'use client';

// 화면 하단에 붙는 고지·데이터 통제 묶음 (AX-210 · AX-211 → AX-318)
//
// 개인정보 안내와 "이 기기에서 내 정보 지우기" 는 찾기 어려우면 없는 것과 같다.
// 화면마다 같은 자리에 둔다. 지우기는 기기 저장소 전체 삭제 + 로그아웃이다
// (ClearSessionButton → lib/store deleteAllMyData · spec 4.19 · 규칙 41).
// 같은 두 가지는 더보기(/more) → 설정·개인정보 화면에도 있다.

import Link from 'next/link';
import ClearSessionButton from './ClearSessionButton.js';
import { useLang } from './LanguageProvider.js';

export default function FooterLinks() {
  const { t } = useLang();
  return (
    <>
      <p className="settings-footer-links">
        <Link href="/privacy" className="link-button settings-footer-link">
          {t('privacy.link')}
        </Link>
      </p>
      <ClearSessionButton />
    </>
  );
}
