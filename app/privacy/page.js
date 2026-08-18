'use client';

// 개인정보·면책 고지 (AX-211 · SIGNOFF_CHECKLIST 2.7 · 4.2)
//
// 이 화면은 판정 흐름의 일부가 아니다. `/plan` → `/result` → `/place` 계약(ADR-0001)에
// 영향을 주지 않는 정적 안내 화면이며, 어느 화면에서도 하단 링크로만 진입한다.
//
// 본문은 `src/i18n/legal.js` 가 소유한다 — 코드에서 확인 가능한 사실만 적는다.

import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import ClearSessionButton from '@/components/ClearSessionButton.js';
import { useLang } from '@/components/LanguageProvider.js';
import { LEGAL_SECTIONS } from '@/src/i18n/legal.js';

export default function PrivacyPage() {
  const router = useRouter();
  const { lang, t } = useLang();
  const pick = (entry) => entry[lang] ?? entry.ko;

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
        <div className="medical-callout" role="note">
          {t('privacy.intro')}
        </div>

        {LEGAL_SECTIONS.map((section) => (
          <section className="card" key={section.id} aria-labelledby={`legal-${section.id}`}>
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
          <p style={{ marginTop: 8 }}>{t('privacy.contactBody')}</p>
        </section>

        <ClearSessionButton />
      </main>
    </>
  );
}
