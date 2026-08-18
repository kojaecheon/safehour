'use client';

// 로그인 (AX-219 · ADR-0004)
//
// 화면 원칙
//   - **로그인은 본인 확인이 아니다.** 어느 환자의 계획인지는 병원 발급 코드가 확인한다.
//     이것을 화면에 명시해 사용자가 오해하지 않게 한다.
//   - 이름·이메일·프로필을 받지 않는다는 사실을 CTA 앞에 둔다.
//   - 자격증명이 없는 공급자는 숨기지 않고 "준비 중" 으로 보여준다 — 사라진 버튼은 오히려 혼란스럽다.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import LanguageToggle from '@/components/LanguageToggle.js';
import { useLang } from '@/components/LanguageProvider.js';
import { safeReturnTo } from '@/src/auth/config.js';

/** 공급자 실패 코드 → 사용자 문구. 기술 사유를 그대로 보여주지 않는다. */
const ERROR_KEY = {
  cancelled: 'login.errCancelled',
  expired: 'login.errExpired',
  state_mismatch: 'login.errRetry',
  missing_code: 'login.errRetry',
  exchange_failed: 'login.errRetry',
  not_configured: 'login.errNotConfigured',
  provider_not_configured: 'login.errNotConfigured',
  unknown_provider: 'login.errNotConfigured',
  demo_disabled: 'login.errNotConfigured',
};

/**
 * 자격증명이 없는 공급자는 **버튼**으로 렌더한다.
 * href 없는 `<a>` 는 link 롤을 잃어 보조기술에 노출되지 않는다 — 사라진 것과 같다.
 * 버튼으로 두면 초점을 받고 "사용 안 함" 으로 읽힌다.
 */
function ProviderButton({ className, label, notConfiguredLabel, configured, href }) {
  const content = (
    <>
      {label}
      {!configured && (
        <span className="badge" style={{ marginLeft: 8 }}>
          {notConfiguredLabel}
        </span>
      )}
    </>
  );

  if (!configured) {
    return (
      <button type="button" className={`btn ${className}`} aria-disabled="true" onClick={(e) => e.preventDefault()}>
        {content}
      </button>
    );
  }
  return (
    <a className={`btn ${className}`} href={href}>
      {content}
    </a>
  );
}

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLang();

  const [auth, setAuth] = useState(null);
  const returnTo = safeReturnTo(params.get('returnTo'), '/');
  const errorKey = ERROR_KEY[params.get('error')] ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAuth(data);
      })
      .catch(() => {
        if (!cancelled) setAuth({ authenticated: false, auth: { providers: [], demoLogin: false } });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const providerState = (id) =>
    auth?.auth?.providers?.find((p) => p.id === id)?.configured ?? false;

  const href = (provider) =>
    `/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
    setAuth((prev) => (prev ? { ...prev, authenticated: false, provider: null } : prev));
  }

  return (
    <>
      <header className="top-bar">
        <button
          type="button"
          className="back"
          aria-label={t('common.back')}
          onClick={() => router.push('/')}
        >
          ‹
        </button>
        <h1 className="brand">{t('login.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        {errorKey && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">{t('login.errorLabel')}</span>
            <p>{t(errorKey)}</p>
          </div>
        )}

        <section className="card">
          <h1 style={{ whiteSpace: 'pre-line' }}>{t('login.title')}</h1>
          <p style={{ marginTop: 12 }}>{t('login.lead')}</p>
        </section>

        {auth?.authenticated ? (
          <section className="card">
            <p>
              <strong>{t('login.signedIn')}</strong>
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 12 }}
              onClick={logout}
            >
              {t('login.logout')}
            </button>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {/* 환자의 주 경로는 Google 이다 — 카카오는 한국 서비스라 외국인 환자에게
                계정이 없을 가능성이 높다. 순서를 바꾸지 않는다 (ADR-0004). */}
            <ProviderButton
              provider="google"
              className="btn-google"
              label={t('login.google')}
              notConfiguredLabel={t('login.notConfigured')}
              configured={providerState('google')}
              href={href('google')}
            />
            <ProviderButton
              provider="kakao"
              className="btn-kakao"
              label={t('login.kakao')}
              notConfiguredLabel={t('login.notConfigured')}
              configured={providerState('kakao')}
              href={href('kakao')}
            />

            {auth?.auth?.demoLogin && (
              <>
                <a className="btn btn-secondary" href={href('demo')}>
                  {t('login.demo')}
                </a>
                <p className="hint" style={{ padding: '0 4px' }}>
                  {t('login.demoNote')}
                </p>
              </>
            )}
          </div>
        )}

        <div className="medical-callout" role="note" style={{ marginTop: 18 }}>
          {t('login.notIdentityCheck')}
        </div>
        <p className="source-note">{t('login.hospitalNext')}</p>
      </main>
    </>
  );
}

// useSearchParams 는 Suspense 경계를 요구한다 (Next.js App Router)
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
