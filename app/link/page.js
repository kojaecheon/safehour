'use client';

// 병원 연결 (AX-216 · 정의 §5)
//
// 화면 원칙
//   - 사용자가 조건을 **타이핑하지 않는다.** 병원이 발행한 것을 그대로 가져온다.
//   - 데모로 불러온 계획은 **"병원 연동 데모" 를 상시 표시**한다. 실제 연동으로
//     오인되면 공모전 요강의 허위 제출 조항에 걸린다 (정의 §9-3).
//   - 연결되지 않으면 외출 추천으로 넘어갈 수 없다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { readPlan, writePlan } from '@/lib/recovery-store.js';
import { PLAN_KEY } from '@/lib/session.js';

const ERROR_KEY = {
  CODE_REQUIRED: 'link.errRequired',
  UNKNOWN_CODE: 'link.errUnknown',
  INVALID_PLAN: 'link.errInvalid',
  UNAUTHENTICATED: 'link.errLogin',
};

const DEMO_CODES = [
  { code: 'DEMO-A', labelKey: 'link.demoStandard' },
  { code: 'DEMO-B', labelKey: 'link.demoRestricted' },
  { code: 'DEMO-C', labelKey: 'link.demoExpired' },
];

export default function LinkPage() {
  const router = useRouter();
  const { t, locale } = useLang();

  const [plan, setPlan] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setPlan(readPlan()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function connect(value) {
    setErrorKey(null);
    if (!value.trim()) {
      setErrorKey('link.errRequired');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/plan/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorKey(ERROR_KEY[data.code] ?? 'link.errInvalid');
        if (data.code === 'UNAUTHENTICATED') {
          router.push(`/login?returnTo=${encodeURIComponent('/link')}`);
        }
        return;
      }
      writePlan(data.plan);
      setPlan(data.plan);
    } catch {
      setErrorKey('link.errNetwork');
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    try {
      sessionStorage.removeItem(PLAN_KEY);
    } catch {
      // 저장소 접근이 막혀 있으면 지울 것도 없다
    }
    setPlan(null);
  }

  const fmt = (iso) =>
    new Date(iso).toLocaleString(locale, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return (
    <>
      <header className="top-bar">
        <button type="button" className="back" aria-label={t('common.back')} onClick={() => router.push('/')}>
          ‹
        </button>
        <h1 className="brand">{t('link.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        {plan ? (
          <section className="card">
            <h2>{t('link.connected', { issuer: plan.issuer.name })}</h2>
            {plan.demo && <span className="badge badge-demo">{t('link.demoBadge')}</span>}
            <p style={{ marginTop: 10 }}>{t('link.expires', { at: fmt(plan.expiresAt) })}</p>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => router.push('/today')}
            >
              {t('link.goToday')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 10 }}
              onClick={disconnect}
            >
              {t('link.disconnect')}
            </button>
          </section>
        ) : (
          <>
            <section className="card">
              <h1 style={{ whiteSpace: 'pre-line' }}>{t('link.title')}</h1>
              <p style={{ marginTop: 12 }}>{t('link.lead')}</p>
            </section>

            {errorKey && (
              <div className="state-banner state-STANDBY" role="alert">
                <span className="state-label">{t('link.errLabel')}</span>
                <p>{t(errorKey)}</p>
              </div>
            )}

            <section className="card">
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="link-code">{t('link.codeLabel')}</label>
                <input
                  id="link-code"
                  type="text"
                  value={code}
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('link.codePlaceholder')}
                />
              </div>
              <button type="button" className="btn" disabled={busy} onClick={() => connect(code)}>
                {busy ? t('link.submitting') : t('link.submit')}
              </button>
            </section>

            <section className="card">
              <h2>{t('link.demoTitle')}</h2>
              <p>{t('link.demoLead')}</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {DEMO_CODES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => connect(item.code)}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <FooterLinks />
      </main>
    </>
  );
}
