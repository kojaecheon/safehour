'use client';

// SCR006 — 장소 상세
//
// 화면 원칙 (D03-SCR006)
//   - 영문 원문 우선, 국문 폴백. 어느 원문인지 반드시 표기한다.
//   - 관광정보 원문에 SafeHour 문구를 섞지 않는다. 자체 추정값은 별도 섹션에 둔다.
//   - 운영시간 원문을 영업 여부로 해석하지 않는다 — "확인 필요" 로 표시한다.
//   - 원문은 번역하지 않는다. 화면 라벨만 사용자 언어로 바꾼다 (AX-209).

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle.js';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { SCHEDULE_FIELD_KEY } from '@/src/i18n/dictionary.js';

/** 저작권 구분 코드 → 사전 키 */
const COPYRIGHT_KEY = {
  Type1: 'place.copyrightType1',
  Type3: 'place.copyrightType3',
};

/** 관광을 권하지 않는 판정 — 이 상태에서는 장소 상세를 열지 않는다 */
function isBlocked(decision) {
  if (!decision) return false;
  return decision.state === 'NO_TOURISM' || Boolean(decision.returnNow);
}

export default function PlaceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const candidateId = String(params?.candidateId ?? '');
  const { t, minutesLabel } = useLang();

  const [session, setSession] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailErrorKey, setDetailErrorKey] = useState(null);
  const [detailErrorText, setDetailErrorText] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const detailError = detailErrorKey ? t(detailErrorKey) : detailErrorText;

  useEffect(() => {
    // sessionStorage 읽기는 마운트 이후에만 가능하다. 렌더 중 동기 setState 를
    // 피하기 위해 다음 틱으로 넘긴다 (결과 화면과 동일한 패턴).
    let cancelled = false;
    const timer = window.setTimeout(() => {
      let saved = null;
      try {
        const raw = sessionStorage.getItem('safehour.result');
        if (raw) saved = JSON.parse(raw);
      } catch {
        saved = null;
      }
      if (cancelled) return;

      const found = (saved?.recalcPayload?.candidates ?? []).find(
        (c) => String(c.id) === candidateId,
      );
      setSession(saved);
      setCandidate(found ?? null);
      setLoaded(true);

      // 차단 판정이면 상세를 조회하지 않는다 — 이 화면이 안전 차단의
      // 우회 경로가 되면 안 된다 (D03-NAV004, ADR-0001 보완 조건 4)
      if (!found || isBlocked(saved?.decision)) return;

      setLoadingDetails(true);
      fetch('/api/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate: found }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.ok) setDetails(data.details);
          else if (data.message) setDetailErrorText(data.message);
          else setDetailErrorKey('place.errDetail');
        })
        .catch(() => {
          if (!cancelled) setDetailErrorKey('place.errDetailNetwork');
        })
        .finally(() => {
          if (!cancelled) setLoadingDetails(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidateId]);

  const backButton = (
    <button
      type="button"
      className="back"
      aria-label={t('place.backAria')}
      onClick={() => router.push('/result')}
    >
      ‹
    </button>
  );

  if (!loaded) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">{t('place.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            {t('place.loading')}
          </div>
        </main>
      </>
    );
  }

  // 세션이 없거나(새로고침·직접 진입) 판정 결과에 없는 장소
  if (!candidate) {
    return (
      <>
        <header className="top-bar">
          {backButton}
          <h1 className="brand">{t('place.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">{t('place.notShownLabel')}</span>
            <h2>{t('place.notShownTitle')}</h2>
            <p>{t('place.notShownBody')}</p>
          </div>
          <button type="button" className="btn" onClick={() => router.push('/plan')}>
            {t('place.notShownCta')}
          </button>
        </main>
      </>
    );
  }

  // 차단 판정 상태에서 이 화면으로 들어오면 상세 대신 차단 사유와 복귀를 안내한다
  if (isBlocked(session?.decision)) {
    return (
      <>
        <header className="top-bar">
          {backButton}
          <h1 className="brand">{t('place.header')}</h1>
          <LanguageToggle />
        </header>
        <main className="page">
          <div className="state-banner state-NO_TOURISM">
            <span className="state-label">{t('state.NO_TOURISM')}</span>
            <h2>{t('place.blockedTitle')}</h2>
            <p>{t('place.blockedBody')}</p>
          </div>
          <button type="button" className="btn" onClick={() => router.push('/result')}>
            {t('place.blockedCta')}
          </button>
        </main>
      </>
    );
  }

  const schedule = details?.operatingSchedule ?? {};
  const scheduleEntries = Object.entries(schedule);
  const isEnglishOverview = details?.overviewLanguage === 'en';

  const indoorLabel =
    candidate.indoor === true
      ? t('card.indoor')
      : candidate.indoor === false
        ? t('card.outdoor')
        : t('card.indoorUnknown');

  return (
    <>
      <header className="top-bar">
        {backButton}
        <h1 className="brand">{t('place.header')}</h1>
        <LanguageToggle />
      </header>

      <main className="page">
        <section className="card" aria-labelledby="place-title">
          <div className="title-row">
            <h2 id="place-title" lang={candidate.titleLanguage === 'en' ? 'en' : 'ko'}>
              {candidate.title}
            </h2>
            <span className="badge badge-lang">
              {candidate.titleLanguage === 'en' ? t('card.langEn') : t('card.langKo')}
            </span>
            {candidate.needsTranslation && <span className="badge">{t('card.needsTranslation')}</span>}
          </div>
          {details?.address && <p style={{ marginTop: 8 }}>{details.address}</p>}
        </section>

        {loadingDetails && (
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            {t('place.loadingDetails')}
          </div>
        )}

        {detailError && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">{t('place.detailErrLabel')}</span>
            <p style={{ color: 'inherit' }}>{detailError}</p>
          </div>
        )}

        {/* ── 관광 원문 — SafeHour 문구를 섞지 않는다 (D03-SCR006 금지) ── */}
        {details?.overview && (
          <section className="card" aria-labelledby="overview-h">
            <h3 id="overview-h">
              {t('place.overviewTitle')}{' '}
              <span className="badge badge-lang">
                {isEnglishOverview ? t('place.overviewEn') : t('place.overviewKo')}
              </span>
            </h3>
            <p lang={isEnglishOverview ? 'en' : 'ko'} style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
              {details.overview}
            </p>
            <p className="source-note" style={{ padding: '10px 0 0' }}>
              {t('place.source')}
            </p>
          </section>
        )}

        {/* ── 운영·휴무 원문 — 영업 여부로 해석하지 않는다 (D04-BR012) ── */}
        <section className="card" aria-labelledby="schedule-h">
          <h3 id="schedule-h">{t('place.scheduleTitle')}</h3>
          {scheduleEntries.length > 0 ? (
            <>
              <dl style={{ marginTop: 8 }}>
                {scheduleEntries.map(([field, value]) => (
                  <div key={field} className="excluded-item">
                    <dt className="name">
                      {SCHEDULE_FIELD_KEY[field] ? t(SCHEDULE_FIELD_KEY[field]) : field}
                    </dt>
                    <dd style={{ color: 'var(--ink-soft)' }}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="medical-callout" style={{ marginTop: 10 }}>
                {t('place.scheduleNote')}
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--ink-soft)' }}>{t('place.scheduleEmpty')}</p>
          )}
        </section>

        {/* ── SafeHour 자체 추정값 — 원문과 반드시 분리 (D03-SCR006) ── */}
        <section className="card" aria-labelledby="estimate-h">
          <h3 id="estimate-h">
            {t('place.estimateTitle')}{' '}
            <span className="badge badge-estimate">{t('card.estimate')}</span>
          </h3>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>
            {t('place.estimateNote')}
          </p>
          <div className="meta" style={{ marginTop: 10 }}>
            {candidate.travel?.outboundMin != null && (
              <span>
                {t('place.estimateTravel', {
                  value: minutesLabel(candidate.travel.outboundMin),
                })}
              </span>
            )}
            {candidate.walkMin != null && (
              <span>
                {t('card.walk', { value: minutesLabel(candidate.walkMin) })}
                {candidate.walkEstimateConfidence === 'heuristic' &&
                  t('place.estimateWalkHeuristic')}
              </span>
            )}
            {candidate.stayMin != null && (
              <span>{t('place.estimateStay', { value: minutesLabel(candidate.stayMin) })}</span>
            )}
            {candidate.sla?.slackMin != null && (
              <span>{t('card.slack', { value: minutesLabel(candidate.sla.slackMin) })}</span>
            )}
            <span>{indoorLabel}</span>
          </div>
        </section>

        {/* ── 접근성 근거 ── */}
        {candidate.sourceIds?.barrierFree && (
          <section className="card" aria-labelledby="access-h">
            <h3 id="access-h">{t('place.accessTitle')}</h3>
            <p style={{ marginTop: 6 }}>{t('place.accessBody')}</p>
          </section>
        )}

        {/* ── 이미지 — URL 참조만 하고 저작권 구분을 함께 표시 (D07-POL004) ── */}
        {details?.images?.length > 0 && (
          <section className="card" aria-labelledby="images-h">
            <h3 id="images-h">{t('place.photosTitle')}</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {details.images.slice(0, 5).map((image) => (
                <figure key={image.url} style={{ margin: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 원본 URL 을 저장·가공하지 않고 참조만 한다 */}
                  <img
                    src={image.url}
                    alt={image.name ? `${candidate.title} — ${image.name}` : candidate.title}
                    loading="lazy"
                    style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }}
                  />
                  <figcaption style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {COPYRIGHT_KEY[image.copyrightDivisionCode]
                      ? t(COPYRIGHT_KEY[image.copyrightDivisionCode])
                      : image.copyrightDivisionCode
                        ? t('place.copyrightOther', { code: image.copyrightDivisionCode })
                        : t('place.copyrightUnknown')}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {details?.errors?.length > 0 && (
          <p className="source-note">
            {t('place.partialErrors', { count: details.errors.length })}
          </p>
        )}

        <p className="source-note">{t('place.footer')}</p>

        <FooterLinks />
      </main>

      <div className="sticky-return">
        <button type="button" className="btn" onClick={() => router.push('/result')}>
          {t('place.backToResult')}
        </button>
      </div>
    </>
  );
}
