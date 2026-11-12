'use client';

// 로그인 (AX-219 · ADR-0004 · AX-314 새 디자인)
// SEED ③층(설계서 6.2 2번): 26px 제목 → 로그인 수단 목록(데모는 회색 채움) → 안내 Callout. 자물쇠 원판은 두지 않는다.
//
// 화면 원칙
//   - **로그인은 본인 확인이 아니다.** 어느 환자의 계획인지는 병원 발급 코드가 확인한다.
//     이것을 화면에 명시해 사용자가 오해하지 않게 한다.
//   - 이름·이메일·프로필을 받지 않는다는 사실을 CTA 앞에 둔다.
//   - 로그인은 기기 저장을 계정별로 나누는 데만 쓴다(docs/security.md '인증'·'기기 저장소와 계정 이름공간'). 서버에 체류를 저장하지 않는다.
//   - 자격증명이 없는 공급자는 보여 주지 않는다(운영자 결정 2026-11-08). '준비 중' 버튼은 첫 사용자를 멈춰 세웠다.
//     공급자 사용 가능 여부는 /api/auth/session 의 auth.providers[].configured 가 정한다(인증 흐름은 그대로).
//     켜진 공급자가 없고 데모만 되면 데모 버튼이 주 버튼이 된다.
//   - 기본 흐름은 로그인 → 체류 설정(/onboarding)이다(docs/platform/IA_AND_FLOWS.md '처음 쓰는 사람'). returnTo 는 같은 출처 경로만 받는다.

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

/** 켜진 공급자 버튼. API 경로로 전체 이동한다(공급자로 넘어가는 리디렉션): next/link 를 쓰지 않는다 */
function ProviderButton({ className, label, href }) {
  return (
    <a className={`btn ${className}`} href={href}>
      <span>{label}</span>
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
  const anyProvider = providerState('google') || providerState('kakao');
  const demoLogin = auth?.auth?.demoLogin === true;
  const demoOnly = demoLogin && !anyProvider;

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
          <section className="onboarding-login-signed" aria-labelledby="login-signed">
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
              {/* 환자의 주 경로는 Google 이다. 카카오는 한국 서비스라 외국인 환자에게
                  계정이 없을 가능성이 높다. 순서를 바꾸지 않는다 (ADR-0004). 켜지지 않은 공급자는 그리지 않는다 */}
              {providerState('google') && (
                <ProviderButton className="btn-google" label={t('login.google')} href={href('google')} />
              )}
              {providerState('kakao') && (
                <ProviderButton className="btn-kakao" label={t('login.kakao')} href={href('kakao')} />
              )}
              {demoLogin && (
                // 데모 설명은 데모 버튼에 붙는다(8px): 목록 간격(12px)과 나눠 어느 버튼의 설명인지 보이게.
                // 켜진 공급자가 없으면 데모가 유일한 길이라 주 버튼(코발트)으로 둔다
                <div className="onboarding-login-demo">
                  <a className={demoOnly ? 'btn' : 'btn btn-secondary'} href={href('demo')}>
                    {t('login.demo')}
                  </a>
                  <p className="onboarding-hint">{t('login.demoNote')}</p>
                </div>
              )}
              {!demoLogin && !anyProvider && <p className="onboarding-note">{t('login.noMethods')}</p>}
            </div>
          </section>
        )}

        <div className="ui-callout has-icon medical-callout" role="note">
          <span className="ui-callout-icon medical-callout-icon" aria-hidden="true">
            <Icon name="info" size={20} />
          </span>
          <p>{t('login.notIdentityCheck')}</p>
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
