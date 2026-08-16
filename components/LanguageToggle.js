'use client';

// 언어 전환 — 모든 화면의 상단 바에 상시 노출한다.
// 대상 사용자가 외국인 환자이므로, 한국어를 읽지 못하는 사람도 찾을 수 있어야 한다.
// 언어명은 항상 자기 언어로 적는다(한국어 / English) — 번역하면 못 찾는다.

import { useLang } from './LanguageProvider.js';

export default function LanguageToggle() {
  const { lang, setLang, t } = useLang();

  return (
    <div className="lang-toggle" role="group" aria-label={t('common.langToggle')}>
      <button
        type="button"
        lang="ko"
        className={lang === 'ko' ? 'selected' : undefined}
        aria-pressed={lang === 'ko'}
        onClick={() => setLang('ko')}
      >
        한국어
      </button>
      <button
        type="button"
        lang="en"
        className={lang === 'en' ? 'selected' : undefined}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        English
      </button>
    </div>
  );
}
