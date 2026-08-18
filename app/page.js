'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { takeClearedFlag } from '@/lib/session.js';

// SCR001 — 시작 화면
// CTA 주변에서 핵심 한계 3가지가 읽지 않아도 인지되도록 배치한다 (D03).
export default function HomePage() {
  const { t } = useLang();
  const [cleared, setCleared] = useState(false);

  // "내 정보 지우기" 는 전체 새로고침으로 이 화면에 도착한다 (AX-210).
  // 삭제가 실제로 일어났음을 한 번만 알린다.
  useEffect(() => {
    const timer = window.setTimeout(() => setCleared(takeClearedFlag()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <header className="top-bar">
        <span className="brand">SafeHour</span>
        <LanguageToggle />
      </header>
      <main className="page">
        {cleared && (
          <div className="state-banner state-TOGETHER" role="status">
            <p>{t('home.clearedNotice')}</p>
          </div>
        )}

        <section className="card" style={{ paddingTop: 24, paddingBottom: 24 }}>
          <h1>
            {t('home.titleLine1')}
            <br />
            {t('home.titleLine2')}
          </h1>
          <p style={{ marginTop: 10 }}>{t('home.lead')}</p>
        </section>

        <section className="card" aria-label={t('home.principlesAria')}>
          <h2>{t('home.principlesTitle')}</h2>
          {/* listStyle none 은 Safari/VoiceOver 에서 리스트 시맨틱을 제거하므로 role 로 복원 */}
          <ul role="list" style={{ listStyle: 'none', display: 'grid', gap: 10, marginTop: 4 }}>
            {[
              ['home.p1Title', 'home.p1Body'],
              ['home.p2Title', 'home.p2Body'],
              ['home.p3Title', 'home.p3Body'],
            ].map(([titleKey, bodyKey]) => (
              <li key={titleKey}>
                <strong>{t(titleKey)}</strong>
                <br />
                <span style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{t(bodyKey)}</span>
              </li>
            ))}
          </ul>
        </section>

        <Link href="/today" className="btn" style={{ marginTop: 4 }}>
          {t('home.cta')}
        </Link>

        <p className="source-note" style={{ marginTop: 16 }}>
          {t('home.footer')}
        </p>

        <FooterLinks />
      </main>
    </>
  );
}
