'use client';

// 일정 속 장소 카드: 정거장(Stop) 하나 (AX-317 · docs/business-rules.md '장소 후보와 필터', docs/contracts.md '`POST /api/itinerary/plan`', docs/platform/DESIGN_SYSTEM.md '부품 (`components/ui/`)')
//
// 예전 단일 외출 추천 카드(D08-CMP008)를 새 일정 모델에 맞게 다시 썼다. 모양은 디자인 시스템의 PlaceCard 다.
//   - 제목은 관광공사 원문(표시 언어가 화면 언어와 다르면 lang 표시). 번역하지 않는다.
//   - 체류·이동 시간은 SafeHour 추정이다 — '추정' 배지를 붙인다. 운영 시간을 모르면 '운영 확인 필요'.
//   - 번역 필요·식이 추정·주문 카드 라벨은 카드 아래에 따로 보인다. 주문 카드는 /cards 의 식이 카드로 잇는다.
//   - 사진은 관광공사 URL 을 참조만 한다(PlaceCard). 출처(ⓒ한국관광공사)를 붙인다.
//   - href 를 주면 카드 전체가 장소 상세로 가는 링크다. children(편집 버튼 등)은 그 위에 선다.

import Link from 'next/link';
import { useLang } from './LanguageProvider.js';
import { Badge, PlaceCard } from './ui/index.js';
import { stopBadges } from './trip/viewModel.js';

/** 장소 상세 주소 — 정거장 id 로 정확한 날짜·역할을 찾게 한다 */
export function placeHref(stop) {
  return `/place/${encodeURIComponent(String(stop.candidateId ?? stop.contentId))}?stop=${encodeURIComponent(String(stop.id))}`;
}

const INDOOR_KEY = { true: 'trip.indoor', false: 'trip.outdoor' };

/**
 * @param {object} props
 * @param {object} props.stop                  Stop (docs/contracts.md '`POST /api/itinerary/plan`')
 * @param {boolean} [props.link]               장소 상세로 가는 링크를 만든다 (기본 true)
 * @param {'feature'|'compact'} [props.variant]
 * @param {2|3|4} [props.headingLevel]
 * @param {boolean} [props.showTime]           사진 위 시각 알약
 * @param {boolean} [props.showPinned]         '직접 고름' 표시 (교체 후보 목록에서는 끈다 — 고르기 전이다)
 */
export default function CourseCard({ stop, link = true, variant = 'compact', headingLevel = 3, showTime = true, showPinned = true, children }) {
  const { t, lang } = useLang();
  const flags = stopBadges(stop);
  const meta = [
    `${t('trip.stayMin', { n: stop.stayMin })}${stop.shortened ? ` · ${t('trip.shortened')}` : ''}`,
    t(INDOOR_KEY[String(stop.indoor)] ?? 'trip.indoorUnknown'),
  ];
  if (stop.pinned && showPinned) meta.push(t('trip.pinned'));
  const extra = flags.needsTranslation || flags.dietEstimated || flags.orderCard;

  return (
    <PlaceCard
      title={stop.title}
      titleLang={stop.lang && stop.lang !== lang ? stop.lang : undefined}
      category={stop.category}
      imageUrl={stop.image?.url}
      time={showTime ? `${stop.arriveAt}–${stop.leaveAt}` : undefined}
      meta={meta}
      badges={flags.badges}
      credit={stop.image?.url ? t('trip.photoCredit') : undefined}
      href={link ? placeHref(stop) : undefined}
      variant={variant}
      headingLevel={headingLevel}
    >
      {(extra || children) && (
        <>
          {extra && (
            <div className="trip-stop-flags">
              {flags.needsTranslation && <span className="badge">{t('trip.needsTranslation')}</span>}
              {flags.dietEstimated && <Badge kind="estimate" label={t('trip.dietEstimated')} />}
              {flags.orderCard && (
                <Link className="trip-order-link" href="/cards#cards-diet">
                  {t('trip.orderCard')}
                </Link>
              )}
            </div>
          )}
          {children}
        </>
      )}
    </PlaceCard>
  );
}
