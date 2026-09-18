'use client';

// 언어 전환 — 모든 화면의 상단 바에 상시 노출한다.
// 대상 사용자가 외국인 환자이므로, 한국어를 읽지 못하는 사람도 찾을 수 있어야 한다.
// 언어명은 항상 자기 언어로 적는다(한국어 / English / 日本語 / 中文) — 번역하면 못 찾는다.

import { useLang } from './LanguageProvider.js';
import { LANGS, LANG_NAMES } from '@/src/i18n/index.js';

export default function LanguageToggle() {
  const { lang, setLang, t } = useLang();

  return (
    <div className="lang-toggle" role="group" aria-label={t('common.langToggle')}>
      {/* 두 글자 이름(中文)도 44px 터치 대상을 지키도록 최소 너비를 둔다 — 높이는 전역 스타일이 맞춘다 */}
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={lang === code ? 'selected' : undefined}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          style={{ minWidth: 44 }}
        >
          {LANG_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
