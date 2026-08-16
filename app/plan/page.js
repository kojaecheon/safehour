'use client';

// 안전 외출 — 계획 확인 화면 (AX-221 · 정의 §5)
//
// 이 화면은 **수기 입력 화면을 대체한다.**
//
// 원칙
//   - 병원 조건은 **읽기 전용**이다. 사용자가 고칠 수 없다 — 고칠 수 있으면
//     "병원이 정한 조건" 이라는 말이 거짓이 된다.
//   - 유효한 계획이 없으면 여기서 판정하지 않고 연결 화면으로 보낸다 (정의 §9-3).
//   - 사용자가 고르는 것은 **지금 상황(동행·휴식)** 뿐이다.
//   - 병원 안내문(채널 B)은 이 화면에서도 서버로 보내지 않는다.
//
// D03-NAV004(뒤로가기 시 입력 유지)는 이 변경으로 대상이 사라졌다 —
// 조건이 사용자 입력이 아니라 병원 발행값이므로 잃을 입력이 없다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import StateBanner from '@/components/StateBanner.js';
import { useLang } from '@/components/LanguageProvider.js';
import { readPlan } from '@/lib/recovery-store.js';
import { effectiveDeadline, gateRecoveryPlan, planToCondition } from '@/src/recovery/plan.js';

const DEADLINE_REASON_KEY = {
  returnBy: 'today.deadlineReturnBy',
  medication: 'today.deadlineMedication',
  visit: 'today.deadlineVisit',
};

export default function PlanPage() {
  const router = useRouter();
  const { t, locale, minutesLabel } = useLang();

  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // 사용자가 고르는 것은 지금 상황뿐이다
  const [hasCompanion, setHasCompanion] = useState(true);
  const [patientResting, setPatientResting] = useState(false);
  const [companionSeparateAllowed, setCompanionSeparateAllowed] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [errorText, setErrorText] = useState(null);
  const error = errorKey ? t(errorKey) : errorText;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPlan(readPlan());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const gate = loaded ? gateRecoveryPlan(plan) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorKey(null);
    setErrorText(null);
    setSubmitting(true);

    const condition = planToCondition(plan);
    const deadline = effectiveDeadline(plan);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: plan.anchor,
          returnBy: deadline.at.toISOString(),
          // 병원 발행 조건 — 화면에서 고칠 수 없다
          condition: {
            ...condition,
            // 병원이 분리를 허용했더라도 보호자가 없으면 분리 활동은 성립하지 않는다
            splitAllowed: condition.splitAllowed && hasCompanion && companionSeparateAllowed,
          },
          roles: {
            hasCompanion,
            patientResting,
            companionSeparateAllowed: hasCompanion && companionSeparateAllowed,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.message) setErrorText(data.message);
        else setErrorKey('plan.errRecommend');
        return;
      }
      sessionStorage.setItem('safehour.result', JSON.stringify(data));
      router.push('/result');
    } catch {
      setErrorKey('plan.errNetwork');
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <header className="top-bar">
      <button type="button" className="back" aria-label={t('common.back')} onClick={() => router.push('/today')}>
        ‹
      </button>
      <h1 className="brand">{t('plan.header')}</h1>
      <LanguageToggle />
    </header>
  );

  if (!loaded) {
    return (
      <>
        {header}
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            {t('today.loading')}
          </div>
        </main>
      </>
    );
  }

  // 계획이 없으면 여기서 판정하지 않는다
  if (!plan) {
    return (
      <>
        {header}
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">{t('plan.header')}</span>
            <h2>{t('plan.needPlanTitle')}</h2>
            <p>{t('plan.needPlanBody')}</p>
          </div>
          <button type="button" className="btn" onClick={() => router.push('/link')}>
            {t('plan.needPlanCta')}
          </button>
          <FooterLinks />
        </main>
      </>
    );
  }

  // 만료·철회·미확인 중요 변경 — 연결 게이트가 막는다
  if (!gate.pass) {
    return (
      <>
        {header}
        <main className="page">
          <StateBanner state={gate.state} reasons={gate.reasons} />
          <h2 style={{ marginBottom: 12 }}>{t('plan.blockedTitle')}</h2>
          <button type="button" className="btn" onClick={() => router.push('/today')}>
            {t('plan.blockedCta')}
          </button>
          <FooterLinks />
        </main>
      </>
    );
  }

  const c = plan.constraints;
  const deadline = effectiveDeadline(plan);
  const fmt = (date) =>
    date.toLocaleString(locale, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  // 병원이 켠 제한만 보여준다 — 꺼진 항목을 나열하면 무엇이 제한인지 흐려진다
  const flags = [
    [c.outingAllowed, 'plan.outingAllowed'],
    [!c.outingAllowed, 'plan.outingForbidden'],
    [c.indoorOnly, 'plan.indoorOnly'],
    [c.avoidUv, 'plan.avoidUv'],
    [c.avoidHeat, 'plan.avoidHeat'],
    [c.noWater, 'plan.noWater'],
    [c.escortRequired, 'plan.escortRequired'],
    [c.foodRestricted, 'plan.foodRestricted'],
  ].filter(([on]) => on);

  return (
    <>
      {header}
      <main className="page">
        <div className="verified-strip">
          <span className="verified-mark" aria-hidden="true">
            ✓
          </span>
          <span>{t('plan.issuedBy', { issuer: plan.issuer.name })}</span>
          {plan.demo && <span className="badge badge-demo">{t('link.demoBadge')}</span>}
        </div>

        <div className="medical-callout" role="note">
          {t('plan.callout')}
        </div>

        {/* ── 병원 발행 조건 — 읽기 전용 ── */}
        <section className="card" aria-labelledby="cond-h">
          <h2 id="cond-h">{t('plan.conditionsTitle')}</h2>
          <div className="meta">
            {flags.map(([, key]) => (
              <span key={key} className="badge badge-hospital">
                {t(key)}
              </span>
            ))}
          </div>
          <div className="meta" style={{ marginTop: 12 }}>
            <span>{t('plan.walkLimit', { value: minutesLabel(c.maxWalkMin) })}</span>
            <span>{t('plan.travelLimit', { value: minutesLabel(c.maxTravelMin) })}</span>
          </div>
        </section>

        <section className="card" aria-labelledby="anchor-h">
          <h2 id="anchor-h">{t('plan.anchorTitle')}</h2>
          <p style={{ color: 'var(--ink)' }}>{plan.anchor.label}</p>
        </section>

        <section className="card" aria-labelledby="deadline-h">
          <h2 id="deadline-h">{t('plan.deadlineTitle')}</h2>
          <p style={{ fontSize: 17, color: 'var(--ink)' }}>
            <strong>{fmt(deadline.at)}</strong>
          </p>
          <p className="hint">{t(DEADLINE_REASON_KEY[deadline.source])}</p>
        </section>

        {/* ── 사용자가 고르는 것 — 지금 상황뿐 ── */}
        <form onSubmit={handleSubmit} noValidate>
          <section className="card" id="role" aria-labelledby="roles-h">
            <h2 id="roles-h">{t('plan.rolesTitle')}</h2>
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('plan.rolesHint')}
            </p>
            <label className="toggle-row">
              <span className="label">{t('plan.hasCompanion')}</span>
              <input
                type="checkbox"
                checked={hasCompanion}
                onChange={(e) => setHasCompanion(e.target.checked)}
              />
            </label>
            <label className="toggle-row">
              <span className="label">
                {t('plan.patientResting')}
                <span className="sub">{t('plan.patientRestingSub')}</span>
              </span>
              <input
                type="checkbox"
                checked={patientResting}
                onChange={(e) => setPatientResting(e.target.checked)}
              />
            </label>
            {hasCompanion && (
              <label className="toggle-row">
                <span className="label">
                  {t('plan.splitAllowed')}
                  <span className="sub">
                    {c.escortRequired ? t('plan.splitAllowedSubOff') : t('plan.splitAllowedSubOn')}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={companionSeparateAllowed && !c.escortRequired}
                  disabled={c.escortRequired}
                  onChange={(e) => setCompanionSeparateAllowed(e.target.checked)}
                />
              </label>
            )}
          </section>

          {error && (
            <div className="state-banner state-STANDBY" role="alert">
              <span className="state-label">{t('plan.errLabel')}</span>
              <p style={{ color: 'inherit' }}>{error}</p>
            </div>
          )}

          <p role="status" style={{ fontSize: 14, color: 'var(--ink-soft)', minHeight: 20 }}>
            {submitting ? t('plan.submitting') : ''}
          </p>

          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? t('plan.submitting') : t('plan.submit')}
          </button>
          <p className="source-note">{t('plan.footer')}</p>
        </form>

        <FooterLinks />
      </main>
    </>
  );
}
