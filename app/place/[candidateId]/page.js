'use client';

// SCR006 — 장소 상세
//
// 화면 원칙 (D03-SCR006)
//   - 영문 원문 우선, 국문 폴백. 어느 원문인지 반드시 표기한다.
//   - TourAPI 원문에 SafeHour 문구를 섞지 않는다. 자체 추정값은 별도 섹션에 둔다.
//   - 운영시간 원문을 영업 여부로 해석하지 않는다 — "현재 영업 확인 필요" 로 표시한다.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { minutesLabel } from '@/lib/format.js';

/** TourAPI 저작권 구분 코드 — 표시용 라벨 */
const COPYRIGHT_LABEL = {
  Type1: '제1유형 (출처표시)',
  Type3: '제3유형 (출처표시-변경금지)',
};

/**
 * TourAPI 운영정보 필드명 → 사용자용 라벨.
 * 값(원문)은 그대로 두고 라벨만 붙인다 — 원문 자체는 가공하지 않는다.
 */
const SCHEDULE_LABEL = {
  usetime: '이용시간',
  usetimeculture: '이용시간',
  usetimeleports: '이용시간',
  opentime: '영업시간',
  opentimefood: '영업시간',
  opentimeshopping: '영업시간',
  restdate: '휴무일',
  restdateculture: '휴무일',
  restdateleports: '휴무일',
  restdatefood: '휴무일',
  restdateshopping: '휴무일',
  checkintime: '입실 시간',
  checkouttime: '퇴실 시간',
  eventstartdate: '행사 시작일',
  eventenddate: '행사 종료일',
  playtime: '공연 시간',
  starttime: '시작 시간',
  endtime: '종료 시간',
};

export default function PlaceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const candidateId = String(params?.candidateId ?? '');

  const [session, setSession] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

      if (!found) return;

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
          else setDetailError(data.message ?? '상세 정보를 불러오지 못했습니다.');
        })
        .catch(() => {
          if (!cancelled) setDetailError('네트워크 오류로 상세 정보를 불러오지 못했습니다.');
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

  if (!loaded) {
    return (
      <>
        <header className="top-bar">
          <h1 className="brand">장소 상세</h1>
        </header>
        <main className="page">
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            장소 정보를 불러오는 중입니다…
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
          <button type="button" className="back" aria-label="결과로 돌아가기" onClick={() => router.push('/result')}>
            ‹
          </button>
          <h1 className="brand">장소 상세</h1>
        </header>
        <main className="page">
          <div className="state-banner state-STANDBY">
            <span className="state-label">표시할 수 없음</span>
            <h2>이 장소의 판정 결과가 없습니다</h2>
            <p>
              추천은 병원 조건과 복귀 시간을 기준으로 판정됩니다. 조건 없이 장소만 따로 보여드리지
              않습니다.
            </p>
          </div>
          <button type="button" className="btn" onClick={() => router.push('/plan')}>
            조건 입력으로 이동
          </button>
        </main>
      </>
    );
  }

  const schedule = details?.operatingSchedule ?? {};
  const scheduleEntries = Object.entries(schedule);
  const isEnglishOverview = details?.overviewLanguage === 'en';

  return (
    <>
      <header className="top-bar">
        <button type="button" className="back" aria-label="결과로 돌아가기" onClick={() => router.push('/result')}>
          ‹
        </button>
        <h1 className="brand">장소 상세</h1>
      </header>

      <main className="page">
        <section className="card" aria-labelledby="place-title">
          <div className="title-row">
            <h2 id="place-title" lang={candidate.titleLanguage === 'en' ? 'en' : undefined}>
              {candidate.title}
            </h2>
            <span className="badge badge-lang">
              {candidate.titleLanguage === 'en' ? '영문 정보' : '국문 정보'}
            </span>
            {candidate.needsTranslation && <span className="badge">번역 필요</span>}
          </div>
          {details?.address && <p style={{ marginTop: 8 }}>{details.address}</p>}
        </section>

        {loadingDetails && (
          <div className="loading-block" role="status">
            <div className="spinner" aria-hidden="true" />
            관광 원문을 불러오는 중입니다…
          </div>
        )}

        {detailError && (
          <div className="state-banner state-STANDBY" role="alert">
            <span className="state-label">상세 정보 없음</span>
            <p style={{ color: 'inherit' }}>{detailError}</p>
          </div>
        )}

        {/* ── 관광 원문 — SafeHour 문구를 섞지 않는다 (D03-SCR006 금지) ── */}
        {details?.overview && (
          <section className="card" aria-labelledby="overview-h">
            <h3 id="overview-h">
              관광정보 원문{' '}
              <span className="badge badge-lang">{isEnglishOverview ? '영문' : '국문 폴백'}</span>
            </h3>
            <p lang={isEnglishOverview ? 'en' : 'ko'} style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
              {details.overview}
            </p>
            <p className="source-note" style={{ padding: '10px 0 0' }}>
              출처: 한국관광공사 TourAPI{details.sources?.length ? ` (${details.sources.join(', ')})` : ''}
            </p>
          </section>
        )}

        {/* ── 운영·휴무 원문 — 영업 여부로 해석하지 않는다 (D04-BR012) ── */}
        <section className="card" aria-labelledby="schedule-h">
          <h3 id="schedule-h">운영·휴무 정보</h3>
          {scheduleEntries.length > 0 ? (
            <>
              <dl style={{ marginTop: 8 }}>
                {scheduleEntries.map(([field, value]) => (
                  <div key={field} className="excluded-item">
                    <dt className="name">{SCHEDULE_LABEL[field] ?? field}</dt>
                    <dd style={{ color: 'var(--ink-soft)' }}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="medical-callout" style={{ marginTop: 10 }}>
                운영시간 원문을 그대로 표시합니다. SafeHour는 현재 영업 여부를 판단하지 않으니
                방문 전에 직접 확인하세요.
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--ink-soft)' }}>
              운영시간 정보가 제공되지 않았습니다. 현재 영업 여부는 확인이 필요합니다.
            </p>
          )}
        </section>

        {/* ── SafeHour 자체 추정값 — 원문과 반드시 분리 (D03-SCR006) ── */}
        <section className="card" aria-labelledby="estimate-h">
          <h3 id="estimate-h">
            SafeHour 추정값 <span className="badge badge-estimate">추정</span>
          </h3>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>
            아래 값은 관광정보 원문이 아니라 SafeHour가 조건 판정을 위해 계산한 값입니다.
          </p>
          <div className="meta" style={{ marginTop: 10 }}>
            {candidate.travel?.outboundMin != null && (
              <span>기준점에서 편도 {minutesLabel(candidate.travel.outboundMin)}</span>
            )}
            {candidate.walkMin != null && (
              <span>
                보행 약 {minutesLabel(candidate.walkMin)}
                {candidate.walkEstimateConfidence === 'heuristic' && ' (추정)'}
              </span>
            )}
            {candidate.stayMin != null && <span>권장 체류 {minutesLabel(candidate.stayMin)}</span>}
            {candidate.sla?.slackMin != null && (
              <span>복귀 여유 {minutesLabel(candidate.sla.slackMin)}</span>
            )}
            <span>
              {candidate.indoor === true
                ? '실내'
                : candidate.indoor === false
                  ? '실외'
                  : '실내 여부 확인 불가'}
            </span>
          </div>
        </section>

        {/* ── 접근성 근거 ── */}
        {candidate.sourceIds?.barrierFree && (
          <section className="card" aria-labelledby="access-h">
            <h3 id="access-h">접근성 정보</h3>
            <p style={{ marginTop: 6 }}>
              한국관광공사 무장애 여행정보에 등록된 장소입니다. 세부 시설은 방문 전에 확인하세요.
            </p>
          </section>
        )}

        {/* ── 이미지 — URL 참조만 하고 저작권 구분을 함께 표시 (D07-POL004) ── */}
        {details?.images?.length > 0 && (
          <section className="card" aria-labelledby="images-h">
            <h3 id="images-h">사진</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {details.images.slice(0, 5).map((image) => (
                <figure key={image.url} style={{ margin: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- TourAPI 원본 URL 을 저장·가공하지 않고 참조만 한다 */}
                  <img
                    src={image.url}
                    alt={image.name ? `${candidate.title} — ${image.name}` : candidate.title}
                    loading="lazy"
                    style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }}
                  />
                  <figcaption style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {COPYRIGHT_LABEL[image.copyrightDivisionCode] ??
                      (image.copyrightDivisionCode
                        ? `저작권 구분 ${image.copyrightDivisionCode}`
                        : '저작권 구분 미제공')}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {details?.errors?.length > 0 && (
          <p className="source-note">
            일부 상세 정보를 불러오지 못했습니다 ({details.errors.length}건). 확인되지 않은 정보는
            표시하지 않습니다.
          </p>
        )}

        <p className="source-note">
          관광정보 출처: 한국관광공사 TourAPI. SafeHour는 의료진의 판단을 대체하지 않습니다.
        </p>
      </main>

      <div className="sticky-return">
        <button type="button" className="btn" onClick={() => router.push('/result')}>
          결과로 돌아가기
        </button>
      </div>
    </>
  );
}
