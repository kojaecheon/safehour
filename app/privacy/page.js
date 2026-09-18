'use client';

// 개인정보·면책 고지 (AX-211 · SIGNOFF_CHECKLIST 2.7 · 4.2)
//
// 이 화면은 판정 흐름의 일부가 아니다. `/plan` → `/result` → `/place` 계약(ADR-0001)에
// 영향을 주지 않는 정적 안내 화면이며, 어느 화면에서도 하단 링크로만 진입한다.
//
// 본문은 `src/i18n/legal.js` 가 소유한다 — 코드에서 확인 가능한 사실만 적는다.
// 고지는 안전 문구다. 본문은 safetyPair() 가 고른 주 언어로 보인다 (spec 4.17 · AX-303):
// ja·zh 는 검수 스위치가 켜지기 전까지 영어로 대체된다.

import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import ClearSessionButton from '@/components/ClearSessionButton.js';
import { useLang } from '@/components/LanguageProvider.js';
import { LEGAL_SECTIONS } from '@/src/i18n/legal.js';
import { pickText } from '@/src/i18n/index.js';

export default function PrivacyPage() {
  const router = useRouter();
  const { lang, safety, t } = useLang();
  const pick = (entry) => pickText(entry, safety.primary) ?? '';
  // 주 언어가 화면 언어와 다르면(ja·zh 검수 전 → en) 스크린리더가 맞는 음성으로 읽게 표시한다
  const bodyLang = safety.primary === lang ? undefined : safety.primary;

  return (
    <>
      <header className="top-bar">
        <button
          type="button"
          className="back"
          aria-label={t('common.back')}
          onClick={() => router.back()}
        >
          ‹
        </button>
        <h1 className="brand">{t('privacy.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        <div className="medical-callout" role="note" lang={bodyLang}>
          {t('privacy.intro')}
        </div>

        {LEGAL_SECTIONS.map((section) => (
          <section
            className="card"
            key={section.id}
            lang={bodyLang}
            aria-labelledby={`legal-${section.id}`}
          >
            <h2 id={`legal-${section.id}`}>{pick(section.title)}</h2>
            {section.lead && <p style={{ marginTop: 8 }}>{pick(section.lead)}</p>}
            {section.items && (
              <ul role="list" style={{ marginTop: 10, paddingLeft: 18, display: 'grid', gap: 6 }}>
                {section.items.map((item) => (
                  <li key={item.ko}>{pick(item)}</li>
                ))}
              </ul>
            )}
            {section.note && (
              <p className="hint" style={{ fontSize: 14, marginTop: 10 }}>
                {pick(section.note)}
              </p>
            )}
          </section>
        ))}

        <section className="card" aria-labelledby="legal-contact">
          <h2 id="legal-contact">{t('privacy.contactTitle')}</h2>
          <p lang={bodyLang} style={{ marginTop: 8 }}>
            {t('privacy.contactBody')}
          </p>
        </section>

        <ClearSessionButton />
      </main>
    </>
  );
}
