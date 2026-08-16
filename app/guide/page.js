'use client';

// 병원 회복 안내 — 읽기 전용 (AX-218 · 정의 §4.3)
//
// 화면 원칙
//   - 병원 원문(채널 B)을 **그대로** 출력한다. 요약·편집·재배열·번역하지 않는다.
//   - 원문 언어를 `lang` 으로 표기해 스크린리더가 잘못 읽지 않게 한다.
//   - "병원에서 제공한 안내" 배지와 발행 시각을 카드마다 붙인다.
//   - 확인해야 외출 판정의 STANDBY 강등이 풀린다 (정의 §7).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { acknowledgeAll, acknowledgeInstruction, readPlan } from '@/lib/recovery-store.js';
import { CRITICAL_CATEGORIES, INSTRUCTION_CATEGORIES } from '@/src/recovery/plan.js';

const CATEGORY_KEY = {
  activity: 'guide.catActivity',
  medication: 'guide.catMedication',
  food: 'guide.catFood',
  lifestyle: 'guide.catLifestyle',
  escort: 'guide.catEscort',
  emergency: 'guide.catEmergency',
  visit: 'guide.catVisit',
};

export default function GuidePage() {
  const router = useRouter();
  const { t, locale } = useLang();
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPlan(readPlan());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fmt = (iso) =>
    new Date(iso).toLocaleString(locale, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const instructions = plan?.instructions ?? [];
  // 병원이 준 순서를 흔들지 않되, 분류가 섞여 오면 정의된 순서로 묶는다
  const ordered = INSTRUCTION_CATEGORIES.flatMap((category) =>
    instructions.filter((item) => item.category === category),
  );
  const hasUnconfirmedCritical = ordered.some(
    (item) => CRITICAL_CATEGORIES.includes(item.category) && !item.acknowledged,
  );

  return (
    <>
      <header className="top-bar">
        <button type="button" className="back" aria-label={t('common.back')} onClick={() => router.back()}>
          ‹
        </button>
        <h1 className="brand">{t('guide.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        <div className="medical-callout" role="note">
          {t('guide.lead')}
        </div>

        {loaded && ordered.length === 0 && <p className="source-note">{t('guide.empty')}</p>}

        {hasUnconfirmedCritical && (
          <div className="state-banner state-STANDBY" role="status">
            <span className="state-label">{t('guide.critical')}</span>
            <p>{t('guide.criticalNote')}</p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => setPlan(acknowledgeAll(plan))}
            >
              {t('guide.acknowledgeAll')}
            </button>
          </div>
        )}

        {ordered.map((item) => (
          <section className="card" key={item.id} aria-labelledby={`guide-${item.id}`}>
            <h2 id={`guide-${item.id}`}>{t(CATEGORY_KEY[item.category])}</h2>

            <div className="hospital-note">
              <span className="badge badge-hospital">{t('guide.issuedBadge')}</span>
              {/* 원문 — 편집하지 않는다. 언어도 원문 언어 그대로 표기한다 */}
              <p lang={item.lang} style={{ marginTop: 10, whiteSpace: 'pre-line', color: 'var(--ink)' }}>
                {item.text}
              </p>
            </div>

            <p className="hint">{t('guide.updatedAt', { at: fmt(item.updatedAt) })}</p>

            {item.acknowledged ? (
              <p className="hint" style={{ color: 'var(--state-together-ink)', fontWeight: 600 }}>
                ✓ {t('guide.acknowledged')}
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                style={{ marginTop: 10 }}
                onClick={() => setPlan(acknowledgeInstruction(plan, item.id))}
              >
                {t('guide.acknowledge')}
                {CRITICAL_CATEGORIES.includes(item.category) && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    {t('guide.critical')}
                  </span>
                )}
              </button>
            )}
          </section>
        ))}

        <FooterLinks />
      </main>
    </>
  );
}
