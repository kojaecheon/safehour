'use client';

// SCR005 + SCR007 + SCR008 — 추천 결과 · 변화 대응 · 즉시 복귀
//
// 화면 원칙 (D03)
//   - 추천 0건(NO_TOURISM·STANDBY)은 오류 화면이 아니라 정상 결과로 표시한다.
//   - 추천은 상위 3개만 노출한다 (엔진은 최대 5개 산출).
//   - 이동시간이 추정값이면 반드시 표시한다.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StateBanner from '@/components/StateBanner.js';
import CourseCard from '@/components/CourseCard.js';
import EventPanel from '@/components/EventPanel.js';
import DeltaSheet from '@/components/DeltaSheet.js';
import ReturnSheet from '@/components/ReturnSheet.js';
import { REASON_TEXT } from '@/src/domain/states.js';
import { fmtDateTime, fmtTime } from '@/lib/format.js';

export default function ResultPage() {
  const router = useRouter();

  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState('patient');
  const [busy, setBusy] = useState(false);
  const [recalc, setRecalc] = useState(null);
  const [recalcError, setRecalcError] = useState(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnNowDismissed, setReturnNowDismissed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem('safehour.result');
        if (raw) {
          const savedSession = JSON.parse(raw);
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
          <h1 className="brand">안심 코스</h1>
        </header>
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            결과를 불러오는 중입니다…
          </div>
        </main>
      </>
    );
  }

  if (!session || !decision) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">안심 코스</h1>
        </header>
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">결과 없음</span>
            <h2>표시할 추천 결과가 없습니다</h2>
            <p>조건 입력부터 다시 시작해 주세요.</p>
          </div>
          <Link href="/plan" className="btn">
            조건 입력으로 이동
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
    setRecalcError(null);
    try {
      const res = await fetch('/api/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recalcPayload: session.recalcPayload, event }),
      });
      const data = await res.json();
      if (!data.ok) {
        setRecalcError(data.message ?? '재계산에 실패했습니다.');
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
      if (data.recalc.result.state === 'SPLIT_NEARBY') setMode('companion');
      if (data.recalc.result.returnNow) setReturnNowDismissed(false);
      try {
        sessionStorage.setItem('safehour.result', JSON.stringify(next));
      } catch {
        // 저장이 실패해도 화면에는 이미 새 판정이 적용된 상태다 (새로고침 시에만 유실)
      }
      setRecalc(data.recalc);
    } catch {
      setRecalcError('네트워크 오류로 재계산하지 못했습니다. 기존 추천을 계속 신뢰하지 마세요.');
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

  // 전체 후보의 제목 맵 — 델타 표시에서 원시 contentid 가 노출되지 않게 한다
  const candidateTitles = Object.fromEntries(
    (session.recalcPayload?.candidates ?? []).map((c) => [String(c.id), c.title]),
  );

  return (
    <>
      <header className="top-bar">
        <button type="button" className="back" aria-label="조건 입력으로 돌아가기" onClick={() => router.push('/plan')}>
          ‹
        </button>
        <h1 className="brand">안심 코스</h1>
      </header>

      <main className="page">
        {/* 즉시 복귀 — 시각적으로는 하단 고정(CSS fixed)이지만, 안전 CTA 이므로
            DOM 상 main 앞부분에 두어 탭 순서·랜드마크 탐색에서 먼저 도달하게 한다 */}
        <div className="sticky-return">
          <button type="button" className="btn btn-return" onClick={() => setShowReturn(true)}>
            즉시 복귀 안내
          </button>
        </div>

        <StateBanner state={decision.state} reasons={decision.reasons} live />

        {/* 복귀 정보 — 모든 결과 화면에서 항상 보인다 */}
        <section className="card" aria-label="복귀 정보">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <strong>복귀 마감</strong>
              <p style={{ fontSize: 15 }}>{fmtDateTime(displayReturnBy)}</p>
            </div>
            {decision.latestDepartureAt && (
              <div>
                <strong>늦어도 출발</strong>
                <p style={{ fontSize: 15 }}>{fmtTime(decision.latestDepartureAt)}</p>
              </div>
            )}
            <div>
              <strong>기준점</strong>
              <p style={{ fontSize: 15 }}>{session.origin?.label}</p>
            </div>
          </div>
          {session.weather && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 10 }}>
              {session.weather.outdoorUnsafe
                ? `기상 실황: ${session.weather.reasons.join(' · ')} — 실외 후보를 제외했습니다.`
                : session.weather.unknown
                  ? '기상 실황 확인 불가 — 기상은 이번 판정에 반영되지 않았습니다.'
                  : `기상 실황 이상 없음 (기상청 ${session.weather.observedAt} 발표)`}
            </p>
          )}
        </section>

        {/* 추천 코스 */}
        {hasAnyCourse && !returnNow && (
          <section aria-label="추천 코스">
            <div className="tabs" role="tablist" aria-label="환자·보호자 코스 전환" onKeyDown={handleTabKeyDown}>
              <button
                type="button"
                role="tab"
                id="tab-patient"
                aria-selected={mode === 'patient'}
                aria-controls="course-panel"
                tabIndex={mode === 'patient' ? 0 : -1}
                onClick={() => setMode('patient')}
              >
                환자 코스 {courses.patient.length > 0 ? `(${courses.patient.length})` : '(없음)'}
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
                보호자 코스 {courses.companion.length > 0 ? `(${courses.companion.length})` : '(없음)'}
              </button>
            </div>

            <div
              role="tabpanel"
              id="course-panel"
              tabIndex={0}
              aria-labelledby={mode === 'patient' ? 'tab-patient' : 'tab-companion'}
            >
              {decision.state === 'SPLIT_NEARBY' && mode === 'patient' && (
                <div className="medical-callout">
                  지금은 환자 휴식이 우선입니다. 환자 코스 대신 보호자 근거리 코스를 확인하세요.
                </div>
              )}

              {activeCourse.length === 0 ? (
                <div className="card">
                  <p>
                    {mode === 'patient' ? '환자' : '보호자'}에게는 지금 조건을 통과한 활동이 없습니다.
                    이것은 안전을 위한 정상 결과입니다.
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
              <summary>제외된 장소와 이유 ({excluded.length}곳)</summary>
              <div style={{ marginTop: 8 }}>
                {excluded.slice(0, 30).map((item) => (
                  <div className="excluded-item" key={item.id}>
                    <span className="name">{item.title}</span>
                    <br />
                    <span className="reasons">
                      {item.reasons.map((r) => REASON_TEXT[r]?.ko ?? r).join(' · ')}
                    </span>
                  </div>
                ))}
                {excluded.length > 30 && (
                  <p style={{ fontSize: 13, marginTop: 8 }}>외 {excluded.length - 30}곳</p>
                )}
              </div>
            </details>
          </section>
        )}

        <EventPanel topCandidateId={topCandidateId} busy={busy} onEvent={handleEvent} />

        {/* 상주형 라이브 리전 — 조건부 마운트는 일부 스크린리더가 고지를 놓친다 */}
        <div role="status" className={busy ? 'loading-block' : undefined}>
          {busy && (
            <>
              <div className="spinner" aria-hidden="true" />
              코스를 처음부터 다시 판정하고 있습니다…
            </>
          )}
        </div>

        {recalcError && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">재계산 실패</span>
            <p style={{ color: 'inherit' }}>{recalcError}</p>
          </div>
        )}

        <p className="source-note">
          관광정보 출처: 한국관광공사 TourAPI (국문·영문·무장애). 이동시간은 경로 API 연결 전까지
          보수적 추정값입니다. SafeHour는 의료진의 판단을 대체하지 않습니다.
        </p>
      </main>

      {recalc && <DeltaSheet recalc={recalc} titles={candidateTitles} onClose={() => setRecalc(null)} />}

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
