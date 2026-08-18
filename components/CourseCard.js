'use client';

// D08-CMP008 RecommendationCard
// 원천 관광정보와 SafeHour 추정값을 시각적으로 구분한다.
// 이동시간이 폴백 추정이면 반드시 "추정" 배지를 붙인다 (D06-E011).
//
// 장소명(candidate.title)은 TourAPI 원문이다 — 번역하지 않고 원문 언어를 lang 으로 표기한다.

import Link from 'next/link';
import { useLang } from './LanguageProvider.js';

export default function CourseCard({ candidate, rank, mode }) {
  const { t, minutesLabel } = useLang();
  const fit = mode === 'companion' ? candidate.companion : candidate.patient;
  const travel = candidate.travel;
  const isEstimate = travel?.source === 'fallback';

  const indoorLabel =
    candidate.indoor === true
      ? t('card.indoor')
      : candidate.indoor === false
        ? t('card.outdoor')
        : t('card.indoorUnknown');

  return (
    <article className="course-card">
      <div className="title-row">
        <span className="badge">{t('card.rank', { rank })}</span>
        <h3 lang={candidate.titleLanguage === 'en' ? 'en' : 'ko'}>{candidate.title}</h3>
        <span className="badge badge-lang">
          {candidate.titleLanguage === 'en' ? t('card.langEn') : t('card.langKo')}
        </span>
        {candidate.needsTranslation && <span className="badge">{t('card.needsTranslation')}</span>}
      </div>
      <div className="meta">
        <span>
          {t('card.travel', { value: minutesLabel(travel?.outboundMin) })}
          {isEstimate && (
            <span className="badge badge-estimate" style={{ marginLeft: 6 }}>
              {t('card.estimate')}
            </span>
          )}
        </span>
        {fit?.ok && (
          <span>
            {t('card.stay', { value: minutesLabel(fit.stayMin) })}
            {fit.shrunk ? t('card.shrunk') : ''}
          </span>
        )}
        {candidate.sla?.slackMin != null && (
          <span>{t('card.slack', { value: minutesLabel(candidate.sla.slackMin) })}</span>
        )}
        <span>{indoorLabel}</span>
        {candidate.walkMin != null && (
          <span>{t('card.walk', { value: minutesLabel(candidate.walkMin) })}</span>
        )}
      </div>
      {/* 상세 CTA (D03-SCR005 추천 카드 표시 항목 · NAV002) */}
      <Link
        href={`/place/${encodeURIComponent(candidate.id)}`}
        className="btn btn-secondary btn-small"
        style={{ marginTop: 10 }}
      >
        {t('card.detailCta')}
        <span className="visually-hidden"> — {candidate.title}</span>
      </Link>
    </article>
  );
}
