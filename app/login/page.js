'use client';

// 로그인 (AX-219 · ADR-0004 · AX-314 새 디자인)
//
// 화면 원칙
//   - **로그인은 본인 확인이 아니다.** 어느 환자의 계획인지는 병원 발급 코드가 확인한다.
//     이것을 화면에 명시해 사용자가 오해하지 않게 한다.
//   - 이름·이메일·프로필을 받지 않는다는 사실을 CTA 앞에 둔다.
//   - 로그인은 기기 저장을 계정별로 나누는 데만 쓴다(spec 4.18–4.19). 서버에 체류를 저장하지 않는다.
//   - 자격증명이 없는 공급자는 숨기지 않고 "준비 중" 으로 보여준다 — 사라진 버튼은 오히려 혼란스럽다.
//   - 기본 흐름은 로그인 → 체류 설정(/onboarding)이다(spec 3.2). returnTo 는 같은 출처 경로만 받는다.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon, TopBar } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
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

/** 로그인 뒤 기본 목적지 — 체류 설정 */
const DEFAULT_RETURN = '/onboarding';

/**
 * 자격증명이 없는 공급자는 **버튼**으로 렌더한다.
 * href 없는 `<a>` 는 link 롤을 잃어 보조기술에 노출되지 않는다 — 사라진 것과 같다.
 * 버튼으로 두면 초점을 받고 "사용 안 함" 으로 읽힌다.
 */
function ProviderButton({ className, label, notConfiguredLabel, configured, href }) {
  const content = (
    <>
      <span>{label}</span>
      {!configured && <span className="badge">{notConfiguredLabel}</span>}
    </>
  );

  if (!configured) {
    return (
      <button type="button" className={`btn ${className}`} aria-disabled="true" onClick={(e) => e.preventDefault()}>
        {content}
      </button>
    );
  }
  // API 경로로 전체 이동한다(공급자로 넘어가는 리디렉션) — next/link 를 쓰지 않는다
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
  const returnTo = safeReturnTo(params.get('returnTo'), DEFAULT_RETURN);
  const errorKey = ERROR_KEY[params.get('error')] ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
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

  const providerState = (id) => auth?.auth?.providers?.find((p) => p.id === id)?.configured ?? false;

  const href = (provider) => `/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`;

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 네트워크가 끊겨도 화면 상태는 로그아웃으로 둔다 — 저장소가 다시 세션을 묻는다
    }
    // 기기 저장소의 보기 전용 신호도 맞춘다(다른 화면으로 가도 쓰기가 막힌다)
    void getStore().refreshSession();
    router.refresh();
    setAuth((prev) => (prev ? { ...prev, authenticated: false, provider: null } : prev));
  }

  return (
    <>
      <TopBar title={t('login.header')} onBack={() => router.push('/')} />

      <main className="page onboarding-login">
        {errorKey && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">{t('login.errorLabel')}</span>
            <p>{t(errorKey)}</p>
          </div>
        )}

        <section className="onboarding-login-hero" aria-labelledby="login-title">
          <span className="onboarding-login-mark" aria-hidden="true">
            <Icon name="lock" size={28} />
          </span>
          <h2 id="login-title" className="onboarding-login-title">
            {t('login.title')}
          </h2>
          <p className="onboarding-hero-lead">{t('login.lead')}</p>
        </section>

        {auth === null ? (
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>{t('login.checking')}</p>
          </div>
        ) : auth.authenticated ? (
          <section className="onboarding-card onboarding-login-signed" aria-labelledby="login-signed">
            <p id="login-signed" className="onboarding-login-signed-title">
              <Icon name="check" size={20} strokeWidth={2.6} />
              <strong>{t('login.signedIn')}</strong>
            </p>
            <div className="onboarding-stack">
              <Button href={returnTo}>{t('login.continue')}</Button>
              <Button variant="secondary" onClick={logout}>
                {t('login.logout')}
              </Button>
            </div>
          </section>
        ) : (
          <section className="onboarding-login-methods" aria-labelledby="login-methods">
            <h2 id="login-methods" className="visually-hidden">
              {t('login.methodsTitle')}
            </h2>
            <div className="onboarding-stack">
              {/* 환자의 주 경로는 Google 이다 — 카카오는 한국 서비스라 외국인 환자에게
                  계정이 없을 가능성이 높다. 순서를 바꾸지 않는다 (ADR-0004). */}
              <ProviderButton
                className="btn-google"
                label={t('login.google')}
                notConfiguredLabel={t('login.notConfigured')}
                configured={providerState('google')}
                href={href('google')}
              />
              <ProviderButton
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
                  <p className="onboarding-hint">{t('login.demoNote')}</p>
                </>
              )}
            </div>
          </section>
        )}

        <div className="medical-callout" role="note">
          {t('login.notIdentityCheck')}
        </div>
        <p className="onboarding-note">{t('login.hospitalNext')}</p>
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
