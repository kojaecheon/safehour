'use client';

// 오늘의 회복 상태 — 새 홈 (AX-217 · 정의 §5)
//
// 화면 원칙
//   - **판정을 새로 만들지 않는다.** `/api/today` 가 연결 게이트 → 기존 안전 게이트를
//     같은 함수로 호출한다. 홈과 결과 화면이 다른 답을 내면 안 된다 (정의 §9-5).
//   - **액션은 사라지지 않고 성격이 바뀐다** — 가능이면 외출, 대기면 안내 확인,
//     불가면 병원 연락 (정의 §5.2).
//   - 복귀 마감은 복귀시각·복약·다음진료 중 **가장 이른 것**이며 이유를 함께 적는다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import StateBanner from '@/components/StateBanner.js';
import { useLang } from '@/components/LanguageProvider.js';
import { readPlan } from '@/lib/recovery-store.js';
import { fmtDateTime as formatDateTime, fmtTime as formatTime } from '@/lib/format.js';
import {
  effectiveDeadline,
  nextClockOccurrence,
  toDecisionPayload,
  unconfirmedAll,
} from '@/src/recovery/plan.js';

const DEADLINE_REASON_KEY = {
  returnBy: 'today.deadlineReturnBy',
  medication: 'today.deadlineMedication',
  visit: 'today.deadlineVisit',
};

export default function TodayPage() {
  const router = useRouter();
  const { t, locale } = useLang();

  const [plan, setPlan] = useState(null);
  const [today, setToday] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const saved = readPlan();
      if (cancelled) return;
      setPlan(saved);

      if (!saved) {
        setLoaded(true);
        return;
      }
      try {
        // 채널 A 만 서버로 보낸다 — 병원 안내문(채널 B)은 단말을 떠나지 않는다
        const res = await fetch('/api/today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: toDecisionPayload(saved) }),
        });
        const data = await res.json();
        if (!cancelled && data.ok) setToday(data);
      } catch {
        // 상태를 못 받으면 아래에서 안내만 보여준다
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const fmtTime = (date) => formatTime(date, locale);
  const fmtDateTime = (date) => formatDateTime(date, locale);

  if (!loaded) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">{t('today.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            {t('today.loading')}
          </div>
        </main>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">{t('today.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">{t('today.header')}</span>
            <h2>{t('today.notConnectedTitle')}</h2>
            <p>{t('today.notConnectedBody')}</p>
          </div>
          <button type="button" className="btn" onClick={() => router.push('/link')}>
            {t('today.notConnectedCta')}
          </button>
          <FooterLinks />
        </main>
      </>
    );
  }

  const deadline = effectiveDeadline(plan);
  const unconfirmed = unconfirmedAll(plan);
  const nextMed = (plan.constraints.medicationTimes ?? [])
    .map((clock) => nextClockOccurrence(clock))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  const canGoOut = today?.outingAllowed === true;

  return (
    <>
      <header className="top-bar">
        <h1 className="brand">{t('today.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        {/* 병원 확인 배지 — 상단 고정 */}
        <div className="verified-strip">
          <span className="verified-mark" aria-hidden="true">
            ✓
          </span>
          <span>{t('today.verified', { issuer: plan.issuer.name })}</span>
          {plan.demo && <span className="badge badge-demo">{t('link.demoBadge')}</span>}
        </div>

        {today && <StateBanner state={today.state} reasons={today.reasons} live />}

        <section className="card" aria-labelledby="today-outing">
          <h2 id="today-outing">{t('today.outingTitle')}</h2>
          <p style={{ fontSize: 17, color: 'var(--ink)' }}>
            <strong>{t('today.deadline', { at: fmtDateTime(deadline.at) })}</strong>
          </p>
          <p className="hint">{t(DEADLINE_REASON_KEY[deadline.source])}</p>

          <div className="meta" style={{ marginTop: 14 }}>
            {nextMed && <span>{t('today.nextMed', { at: fmtTime(nextMed) })}</span>}
            {plan.constraints.nextVisitAt && (
              <span>
                {t('today.nextVisit', { at: fmtDateTime(new Date(plan.constraints.nextVisitAt)) })}
              </span>
            )}
          </div>
        </section>

        {unconfirmed.length > 0 && (
          <section className="card" aria-labelledby="today-unconfirmed">
            <h2 id="today-unconfirmed">{t('today.unconfirmed', { count: unconfirmed.length })}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => router.push('/guide')}>
              {t('today.reviewCta')}
            </button>
          </section>
        )}

        {/* 단일 액션 — 상태에 따라 성격이 바뀐다 (정의 §5.2) */}
        {canGoOut ? (
          <button type="button" className="btn" onClick={() => router.push('/plan')}>
            {t('today.ctaOuting')}
          </button>
        ) : today?.state === 'STANDBY' ? (
          <button type="button" className="btn" onClick={() => router.push('/guide')}>
            {t('today.reviewCta')}
          </button>
        ) : (
          <div className="medical-callout" role="note">
            {t('today.ctaContact')}
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 10 }}
          onClick={() => router.push('/guide')}
        >
          {t('today.guideCta')}
        </button>

        <FooterLinks />
      </main>
    </>
  );
}
