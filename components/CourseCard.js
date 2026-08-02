'use client';

// D08-CMP008 RecommendationCard
// 원천 관광정보와 SafeHour 추정값을 시각적으로 구분한다.
// 이동시간이 폴백 추정이면 반드시 "추정" 배지를 붙인다 (D06-E011).

import Link from 'next/link';
import { minutesLabel } from '@/lib/format.js';

export default function CourseCard({ candidate, rank, mode }) {
  const fit = mode === 'companion' ? candidate.companion : candidate.patient;
  const travel = candidate.travel;
  const isEstimate = travel?.source === 'fallback';

  return (
    <article className="course-card">
      <div className="title-row">
        <span className="badge">{rank}순위</span>
        <h3 lang={candidate.titleLanguage === 'en' ? 'en' : undefined}>{candidate.title}</h3>
        {candidate.titleLanguage === 'en' ? (
          <span className="badge badge-lang">영문 정보</span>
        ) : (
          <span className="badge badge-lang">국문 정보</span>
        )}
        {candidate.needsTranslation && <span className="badge">번역 필요</span>}
      </div>
      <div className="meta">
        <span>
          이동 편도 {minutesLabel(travel?.outboundMin)}
          {isEstimate && (
            <span className="badge badge-estimate" style={{ marginLeft: 6 }}>
              추정
            </span>
          )}
        </span>
        {fit?.ok && <span>체류 {minutesLabel(fit.stayMin)}{fit.shrunk ? ' (축소됨)' : ''}</span>}
        {candidate.sla?.slackMin != null && <span>복귀 여유 {minutesLabel(candidate.sla.slackMin)}</span>}
        <span>
          {candidate.indoor === true ? '실내' : candidate.indoor === false ? '실외' : '실내 여부 확인 불가'}
        </span>
        {candidate.walkMin != null && <span>보행 약 {minutesLabel(candidate.walkMin)}</span>}
      </div>
      {/* 상세 CTA (D03-SCR005 추천 카드 표시 항목 · NAV002) */}
      <Link
        href={`/place/${encodeURIComponent(candidate.id)}`}
        className="btn btn-secondary btn-small"
        style={{ marginTop: 10 }}
      >
        추천 근거와 원문 보기
        <span className="visually-hidden"> — {candidate.title}</span>
      </Link>
    </article>
  );
}
