'use client';

// 안전 문구 병기 (AX-315 · docs/business-rules.md '언어')
//
// 고지·사유 안내 문장은 선택 언어(ja·zh 는 검수 전 영어) + 한국어(ko 면 영어) 두 줄로 보인다.
// 병기 언어는 useLang().pair() — 곧 src/i18n safetyPair() 하나가 정한다.
//
//   <SafetyText k={'conditions.consentWhat'} as="li" />

import { useLang } from '@/components/LanguageProvider.js';

export default function SafetyText({ k, vars, as: Tag = 'p', className }) {
  const { pair } = useLang();
  const { primary, secondary } = pair(k, vars);
  return (
    <Tag className={['conditions-pair', className].filter(Boolean).join(' ')}>
      <span className="conditions-pair-primary" lang={primary.lang}>
        {primary.text}
      </span>
      <span className="conditions-pair-secondary" lang={secondary.lang}>
        {secondary.text}
      </span>
    </Tag>
  );
}
