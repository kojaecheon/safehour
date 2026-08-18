'use client';

// SCR005 + SCR007 + SCR008 — 추천 결과 · 변화 대응 · 즉시 복귀
//
// 화면 원칙 (D03)
//   - 추천 0건(NO_TOURISM·STANDBY)은 오류 화면이 아니라 정상 결과로 표시한다.
//   - 추천은 상위 3개만 노출한다 (엔진은 최대 5개 산출).
//   - 이동시간이 추정값이면 반드시 표시한다.
//   - 변화 요약은 **구조로** 저장하고 렌더 시점에 번역한다 — 언어를 바꿔도 함께 바뀐다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StateBanner from '@/components/StateBanner.js';
import CourseCard from '@/components/CourseCard.js';
import EventPanel from '@/components/EventPanel.js';
import DeltaSheet from '@/components/DeltaSheet.js';
import ReturnSheet from '@/components/ReturnSheet.js';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { fmtDateTime, fmtTime } from '@/lib/format.js';
import { usePlanExpiry } from '@/lib/usePlanExpiry.js';
import { gateRecoveryPlan, invalidateForReturn } from '@/src/recovery/plan.js';
import { readPlan } from '@/lib/recovery-store.js';

/**
 * 재판정 결과를 화면에 남길 요약으로 압축한다.
 * 시트는 닫히지만 "무엇이 왜 바뀌었는지"는 결과 화면에 계속 보여야 한다 (AC010·AC012 증빙).
 * 문구가 아니라 키·값을 담아 언어 전환에 반응하게 한다.
 */
function summarizeChange(recalc, titles) {
  const { event, before, after, delta } = recalc;
  const nameOf = (id) => titles[String(id)] ?? String(id);
  const parts = [];
  if (delta.stateChanged) {
    parts.push({ key: 'result.sumState', states: { before: before.state, after: after.state } });
  }
  if (delta.removed.length > 0) {
    parts.push({ key: 'result.sumRemoved', vars: { names: delta.removed.map(nameOf).join(', ') } });
  }
  if (delta.added.length > 0) {
    parts.push({ key: 'result.sumAdded', vars: { names: delta.added.map(nameOf).join(', ') } });
  }
  if (delta.shortened.length > 0) {
    parts.push({
      key: 'result.sumShortened',
      vars: { names: delta.shortened.map((s) => nameOf(s.id)).join(', ') },
    });
  }
  return { eventType: event.type, parts, hasVisibleChange: delta.hasVisibleChange };
}

export default function ResultPage() {
  const router = useRouter();
  const { t, locale, stateMessage, reasonText } = useLang();

  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState('patient');
  const [busy, setBusy] = useState(false);
  const [recalc, setRecalc] = useState(null);
  const [recalcErrorKey, setRecalcErrorKey] = useState(null);
  const [recalcErrorText, setRecalcErrorText] = useState(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnNowDismissed, setReturnNowDismissed] = useState(false);
  // 시트를 닫아도 결과 화면에 남는 마지막 변화 요약 (ADR-0001 보완 조건 5)
  const [lastChange, setLastChange] = useState(null);
  // 외출 중 지침이 무효가 되면 더 이상 변화 이벤트를 받지 않는다 (AX-220)
  const [planInvalid, setPlanInvalid] = useState(false);

  const recalcError = recalcErrorKey ? t(recalcErrorKey) : recalcErrorText;

  /**
   * 외출 중 지침 만료·철회 — 추천을 비우고 즉시 복귀로 전환한다 (정의 §7 개선 1).
   * 새 판정을 만들지 않는다. 안전한 방향으로 무효화만 한다.
   */
  const handlePlanInvalid = useCallback((reasons) => {
    setPlanInvalid(true);
    setRecalc(null);
    setLastChange(null);
    // 자동 복귀 시트를 다시 띄운다 — 앞서 닫았더라도 이번엔 다른 사유다
    setReturnNowDismissed(false);
    setSession((prev) => {
      if (!prev?.decision) return prev;
      const next = { ...prev, decision: invalidateForReturn(prev.decision, reasons) };
      try {
        sessionStorage.setItem('safehour.result', JSON.stringify(next));
      } catch {
        // 저장이 실패해도 화면에는 이미 무효화가 적용됐다
      }
      return next;
    });
  }, []);

  usePlanExpiry(handlePlanInvalid);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem('safehour.result');
        if (raw) {
          let savedSession = JSON.parse(raw);

          // 진입 시점에 이미 무효인 지침이면 저장된 추천을 그대로 믿지 않는다 (AX-220).
          // 감시 훅은 "보고 있는 도중" 을 담당하고, 이 경로가 "이미 지난 뒤 열었을 때" 를
          // 담당한다. 둘 다 같은 게이트를 쓰므로 판정이 갈리지 않는다.
          const gate = gateRecoveryPlan(readPlan());
          if (gate.expired && savedSession.decision) {
            savedSession = {
              ...savedSession,
              decision: invalidateForReturn(savedSession.decision, gate.reasons),
            };
            setPlanInvalid(true);
            try {
              sessionStorage.setItem('safehour.result', JSON.stringify(savedSession));
            } catch {
              // 저장이 실패해도 화면에는 무효화가 적용된다
            }
          }

          setSession(savedSession);
          if (savedSession.decision?.state === 'SPLIT_NEARBY') setMode('companion');
        }
      } catch {
        setSession(null);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const decision = session?.decision;
  const displayLimit = session?.displayLimit ?? 3;

  // 환자·보호자 코스 (화면 노출은 상위 3개)
  const courses = useMemo(() => {
    if (!decision) return { patient: [], companion: [] };
    return {
      patient: (decision.patientCourse ?? []).slice(0, displayLimit),
      companion: (decision.companionCourse ?? []).slice(0, displayLimit),
    };
  }, [decision, displayLimit]);

  if (!loaded) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">{t('result.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            {t('result.loading')}
          </div>
        </main>
      </>
    );
  }

  if (!session || !decision) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">{t('result.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">{t('result.emptyLabel')}</span>
            <h2>{t('result.emptyTitle')}</h2>
            <p>{t('result.emptyBody')}</p>
          </div>
          <Link href="/plan" className="btn">
            {t('result.emptyCta')}
          </Link>
        </main>
      </>
    );
  }

  const activeCourse = courses[mode];
  // CLOSURE 시연은 화면에 보이는 활성 탭의 1순위 장소를 대상으로 한다
  const topCandidateId = activeCourse[0]?.id ?? decision.course?.[0]?.id ?? null;
  const hasAnyCourse = courses.patient.length > 0 || courses.companion.length > 0;
  const excluded = decision.excluded ?? [];
  const returnNow = Boolean(decision.returnNow);
  // 조기 차단 판정(NO_TOURISM 등)은 returnBy 를 결과에 포함하지 않는다.
  // 진료시간 변경이 누적된 상태에서 원본 시각을 그대로 보여주면 실제 마감보다
  // 늦은 시각이 표시되므로, ctx 의 진료 변경분을 반영해 계산한다.
  const appointmentShiftMin = session.recalcPayload?.ctx?.appointmentDelayedMin ?? 0;
  const baseReturnBy = session.recalcPayload?.returnBy ?? session.returnBy;
  const displayReturnBy =
    decision.returnBy ??
    (baseReturnBy
      ? new Date(new Date(baseReturnBy).getTime() + appointmentShiftMin * 60000).toISOString()
      : null);

  async function handleEvent(event) {
    setBusy(true);
    setRecalcErrorKey(null);
    setRecalcErrorText(null);
    try {
      const res = await fetch('/api/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recalcPayload: session.recalcPayload, event }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.message) setRecalcErrorText(data.message);
        else setRecalcErrorKey('result.recalcErrDefault');
        return;
      }
      // 재판정 결과는 즉시 적용한다 — 알림만 표시하고 기존 코스를 유지하는
      // 동작은 금지된다 (D07-BAN008). 델타 시트는 변화 설명 전용이다.
      const next = {
        ...session,
        decision: data.recalc.result,
        recalcPayload: data.nextRecalcPayload ?? session.recalcPayload,
      };
      setSession(next);
      setLastChange(summarizeChange(data.recalc, candidateTitles));
      if (data.recalc.result.state === 'SPLIT_NEARBY') setMode('companion');
      if (data.recalc.result.returnNow) setReturnNowDismissed(false);
      try {
        sessionStorage.setItem('safehour.result', JSON.stringify(next));
      } catch {
        // 저장이 실패해도 화면에는 이미 새 판정이 적용된 상태다 (새로고침 시에만 유실)
      }
      setRecalc(data.recalc);
    } catch {
      setRecalcErrorKey('result.recalcErrNetwork');
    } finally {
      setBusy(false);
    }
  }

  function handleTabKeyDown(e) {
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      next = mode === 'patient' ? 'companion' : 'patient';
    } else if (e.key === 'Home') {
      next = 'patient';
    } else if (e.key === 'End') {
      next = 'companion';
    }
    if (!next) return;
    e.preventDefault();
    setMode(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  /** 변화 요약 조각을 현재 언어로 렌더한다 */
  function renderChangeSummary(change) {
    if (change.parts.length === 0) return t('result.sumKept');
    return change.parts
      .map((part) => {
        if (part.states) {
          return t(part.key, {
            before: stateMessage(part.states.before)?.message ?? part.states.before,
            after: stateMessage(part.states.after)?.message ?? part.states.after,
          });
        }
        return t(part.key, part.vars);
      })
      .join(' · ');
  }

  // 전체 후보의 제목 맵 — 델타 표시에서 원시 contentid 가 노출되지 않게 한다
  const candidateTitles = Object.fromEntries(
    (session.recalcPayload?.candidates ?? []).map((c) => [String(c.id), c.title]),
  );

  return (
    <>
      <header className="top-bar">
        <button
          type="button"
          className="back"
          aria-label={t('result.backAria')}
          onClick={() => router.push('/plan')}
        >
          ‹
        </button>
        <h1 className="brand">{t('result.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        {/* 즉시 복귀 — 시각적으로는 하단 고정(CSS fixed)이지만, 안전 CTA 이므로
            DOM 상 main 앞부분에 두어 탭 순서·랜드마크 탐색에서 먼저 도달하게 한다 */}
        <div className="sticky-return">
          <button type="button" className="btn btn-return" onClick={() => setShowReturn(true)}>
            {t('result.returnCta')}
          </button>
        </div>

        <StateBanner state={decision.state} reasons={decision.reasons} live />

        {/* 복귀 정보 — 모든 결과 화면에서 항상 보인다 */}
        <section className="card" aria-label={t('result.returnInfoAria')}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}
          >
            <div>
              <strong>{t('result.returnDeadline')}</strong>
              <p style={{ fontSize: 15 }}>{fmtDateTime(displayReturnBy, locale)}</p>
            </div>
            {decision.latestDepartureAt && (
              <div>
                <strong>{t('result.latestDeparture')}</strong>
                <p style={{ fontSize: 15 }}>{fmtTime(decision.latestDepartureAt, locale)}</p>
              </div>
            )}
            <div>
              <strong>{t('result.anchor')}</strong>
              <p style={{ fontSize: 15 }}>{session.origin?.label}</p>
            </div>
          </div>
          {session.weather && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 10 }}>
              {session.weather.outdoorUnsafe
                ? t('result.weatherUnsafe', { reasons: session.weather.reasons.join(' · ') })
                : session.weather.unknown
                  ? t('result.weatherUnknown')
                  : t('result.weatherOk', { observedAt: session.weather.observedAt })}
            </p>
          )}
          {(session.diagnostics?.degraded?.english || session.diagnostics?.degraded?.barrierFree) && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 6 }}>
              {session.diagnostics.degraded.english && t('result.degradedEnglish')}
              {session.diagnostics.degraded.barrierFree && t('result.degradedBarrierFree')}
              {t('result.degradedTail')}
            </p>
          )}
        </section>

        {/* 추천 코스 */}
        {hasAnyCourse && !returnNow && (
          <section aria-label={t('result.courseAria')}>
            <div
              className="tabs"
              role="tablist"
              aria-label={t('result.tabsAria')}
              onKeyDown={handleTabKeyDown}
            >
              <button
                type="button"
                role="tab"
                id="tab-patient"
                aria-selected={mode === 'patient'}
                aria-controls="course-panel"
                tabIndex={mode === 'patient' ? 0 : -1}
                onClick={() => setMode('patient')}
              >
                {t('result.tabPatient')}{' '}
                {courses.patient.length > 0
                  ? `(${courses.patient.length})`
                  : `(${t('common.none')})`}
              </button>
              <button
                type="button"
                role="tab"
                id="tab-companion"
                aria-selected={mode === 'companion'}
                aria-controls="course-panel"
                tabIndex={mode === 'companion' ? 0 : -1}
                onClick={() => setMode('companion')}
              >
                {t('result.tabCompanion')}{' '}
                {courses.companion.length > 0
                  ? `(${courses.companion.length})`
                  : `(${t('common.none')})`}
              </button>
            </div>

            <div
              role="tabpanel"
              id="course-panel"
              tabIndex={0}
              aria-labelledby={mode === 'patient' ? 'tab-patient' : 'tab-companion'}
            >
              {decision.state === 'SPLIT_NEARBY' && mode === 'patient' && (
                <div className="medical-callout">{t('result.splitCallout')}</div>
              )}

              {activeCourse.length === 0 ? (
                <div className="card">
                  <p>
                    {mode === 'patient'
                      ? t('result.noCoursePatient')
                      : t('result.noCourseCompanion')}
                  </p>
                </div>
              ) : (
                activeCourse.map((candidate, i) => (
                  <CourseCard key={candidate.id} candidate={candidate} rank={i + 1} mode={mode} />
                ))
              )}
            </div>
          </section>
        )}

        {/* 제외 사유 — 왜 빠졌는지 반드시 설명 (D07-POL006) */}
        {excluded.length > 0 && (
          <section className="card">
            <details className="disclosure">
              <summary>{t('result.excludedSummary', { count: excluded.length })}</summary>
              <div style={{ marginTop: 8 }}>
                {excluded.slice(0, 30).map((item) => (
                  <div className="excluded-item" key={item.id}>
                    <span className="name">{item.title}</span>
                    <br />
                    <span className="reasons">{item.reasons.map(reasonText).join(' · ')}</span>
                  </div>
                ))}
                {excluded.length > 30 && (
                  <p style={{ fontSize: 13, marginTop: 8 }}>
                    {t('result.excludedMore', { count: excluded.length - 30 })}
                  </p>
                )}
              </div>
            </details>
          </section>
        )}

        {/* 마지막 변화 요약 — 시트를 닫아도 남는다. 변화 증빙이 스크린샷 한 장에
            의존하지 않게 한다 (ADR-0001 보완 조건 5, D09-AC010·AC012) */}
        {lastChange && (
          <section className="card" aria-labelledby="last-change-h">
            <h3 id="last-change-h">
              {t('result.lastChange', { event: t(`event.${lastChange.eventType}`) })}{' '}
              {lastChange.hasVisibleChange ? (
                <span className="badge badge-estimate">{t('result.badgeChanged')}</span>
              ) : (
                <span className="badge">{t('result.badgeKept')}</span>
              )}
            </h3>
            <p style={{ marginTop: 6 }}>{renderChangeSummary(lastChange)}</p>
          </section>
        )}

        {!planInvalid && (
          <EventPanel topCandidateId={topCandidateId} busy={busy} onEvent={handleEvent} />
        )}

        {/* 상주형 라이브 리전 — 조건부 마운트는 일부 스크린리더가 고지를 놓친다 */}
        <div role="status" className={busy ? 'loading-block' : undefined}>
          {busy && (
            <>
              <div className="spinner" aria-hidden="true" />
              {t('result.recalcBusy')}
            </>
          )}
        </div>

        {recalcError && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">{t('result.recalcErrLabel')}</span>
            <p style={{ color: 'inherit' }}>{recalcError}</p>
          </div>
        )}

        <p className="source-note">{t('result.footer')}</p>

        <FooterLinks />
      </main>

      {recalc && (
        <DeltaSheet recalc={recalc} titles={candidateTitles} onClose={() => setRecalc(null)} />
      )}

      {(showReturn || (returnNow && !returnNowDismissed)) && (
        <ReturnSheet
          origin={session.origin}
          returnBy={displayReturnBy}
          latestDepartureAt={decision.latestDepartureAt}
          onClose={() => {
            setShowReturn(false);
            // 자동 표시(returnNow) 중 닫은 경우에만 재표시를 막는다.
            // 수동으로 열어 본 경우는 이후 환자 호출 시 다시 자동 표시돼야 한다.
            if (returnNow) setReturnNowDismissed(true);
          }}
        />
      )}
    </>
  );
}
