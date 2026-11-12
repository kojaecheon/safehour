'use client';

// 장소 카드: 사진 중심 (AX-304 · docs/business-rules.md '장소 후보와 필터', docs/platform/DESIGN_SYSTEM.md '부품 (`components/ui/`)')
//
//   <PlaceCard title="경복궁" category="SPOT" imageUrl={stop.image?.url} time="10:25–11:20"
//              meta={['체류 55분']} badges={['estimate', 'hoursUnconfirmed']} href="/place/…" />
//
// - 사진은 관광공사가 준 URL 을 **참조만** 한다. 내려받거나 서버에서 가공하지 않는다(next/image 는 서버가
//   원본을 받아 변환하므로 쓰지 않는다). 주소가 없거나 불러오지 못하면 유형별 일러스트로 바꾼다.
// - 사진은 장식(alt="")이다 — 장소 이름은 제목이, 유형은 유형 알약 글자가 알린다.
// - 사진 위 글자는 흰 알약 위에 둬서 사진 색과 무관하게 대비를 지킨다.
// - href 가 있으면 카드 전체를 누를 수 있다(제목 링크를 카드 크기로 넓힘). children 안의 버튼은 그 위에 선다.
// - variant="compact" 는 하루 타임라인 안에서 쓰는 가로형(왼쪽 정사각 사진)이다.
// - 저작권 표시(credit)는 화면이 관광공사 저작권 구분 문구로 넘긴다.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import Badge from './Badge.js';
import CategoryArt from './CategoryArt.js';

/** Stop.category → 유형 이름 키 */
export const CATEGORY_KEY = Object.freeze({
  FOOD: 'common.categoryFood',
  CAFE: 'common.categoryCafe',
  SPOT: 'common.categorySpot',
  CULTURE: 'common.categoryCulture',
  FESTIVAL: 'common.categoryFestival',
  COURSE: 'common.categoryCourse',
  LEISURE: 'common.categoryLeisure',
  SHOPPING: 'common.categoryShopping',
  LODGING: 'common.categoryLodging',
  OTHER: 'common.categoryOther',
});

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.titleLang]          제목 언어가 화면 언어와 다를 때(예: 국문 원문만 있음)
 * @param {keyof typeof CATEGORY_KEY} [props.category]
 * @param {string} [props.imageUrl]
 * @param {string} [props.time]               '10:25–11:20' — 사진 위 오른쪽 알약
 * @param {string[]} [props.meta]             수치 줄 (16px)
 * @param {string[]} [props.badges]           Badge kind 목록
 * @param {string} [props.credit]             사진 저작권 문구
 * @param {string} [props.href]
 * @param {'feature'|'compact'} [props.variant]
 * @param {2|3|4} [props.headingLevel]
 */
export default function PlaceCard({
  title,
  titleLang,
  category = 'OTHER',
  imageUrl,
  time,
  meta = [],
  badges = [],
  credit,
  href,
  variant = 'feature',
  headingLevel = 3,
  children,
}) {
  const { t } = useLang();
  const [failedUrl, setFailedUrl] = useState(null);
  const imgRef = useRef(null);
  const Heading = `h${headingLevel}`;
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  const categoryKey = CATEGORY_KEY[category] ?? CATEGORY_KEY.OTHER;

  // 하이드레이션 전에 이미 실패한 사진은 onError 를 놓칠 수 있다 — 붙은 뒤 한 번 더 확인한다
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth > 0) return undefined;
    const timer = window.setTimeout(() => setFailedUrl(img.getAttribute('src')), 0);
    return () => window.clearTimeout(timer);
  }, [imageUrl]);

  const card = (
    <article className={variant === 'compact' ? 'ui-place is-compact' : 'ui-place'}>
      <div className="ui-place-media">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- 원본 URL 을 참조만 한다. next/image 는 서버가 이미지를 받아 가공한다(docs/business-rules.md '장소 후보와 필터': 이미지를 내려받지 않는다)
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(imageUrl)}
          />
        ) : (
          <CategoryArt category={category} />
        )}
        <span className="ui-place-pill ui-place-cat">{t(categoryKey)}</span>
        {time && <span className="ui-place-pill ui-place-time">{time}</span>}
      </div>
      <div className="ui-place-body">
        <Heading className="ui-place-title" lang={titleLang}>
          {href ? <Link href={href}>{title}</Link> : <span>{title}</span>}
        </Heading>
        {meta.length > 0 && (
          <ul className="ui-place-meta" role="list">
            {meta.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {badges.length > 0 && (
          <div className="ui-place-badges">
            {badges.map((kind) => (
              <Badge key={kind} kind={kind} />
            ))}
          </div>
        )}
        {credit && <p className="ui-place-credit">{credit}</p>}
        {children && <div className="ui-place-extra">{children}</div>}
      </div>
    </article>
  );
  // 작은 카드는 놓인 자리의 폭을 보고 배치를 바꾼다(컨테이너 쿼리) — 감싸는 틀이 그 기준이다
  return variant === 'compact' ? <div className="ui-place-frame">{card}</div> : card;
}
