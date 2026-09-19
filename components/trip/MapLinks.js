'use client';

// 지도 앱 길찾기 링크 2개 — 목적지만 (AX-317 · spec 4.14 · 규칙 32·39)
//
// 링크는 lib/maps.js buildMapLinks 가 정거장(Stop)의 이름·좌표만으로 만든다. 출발지·숙소·병원 좌표는 넣지 않는다.
// 매일 확인 전(오늘 게이트)에는 길찾기를 막는다 — 링크를 만들지 않고 비활성 버튼과 이유를 보인다(규칙 32).
// 좌표가 없으면 링크를 만들지 않고 이유를 보인다.

import { useLang } from '../LanguageProvider.js';
import { Icon } from '../ui/index.js';
import { buildMapLinks } from '@/lib/maps.js';

/**
 * @param {object} props
 * @param {object} props.stop
 * @param {boolean} [props.disabled]      길찾기를 막는다(매일 확인 전·확인하지 않은 병원 안내)
 * @param {string} [props.disabledKey]    막은 이유 문구 키
 * @param {boolean} [props.showNote]      '목적지만 넘긴다' 안내
 */
export default function MapLinks({ stop, disabled = false, disabledKey = 'today.gatedMaps', showNote = false }) {
  const { t } = useLang();
  const links = buildMapLinks(stop);
  const label = (key) => (
    <>
      <Icon name="map" size={20} />
      <span>{t(key)}</span>
      <span className="visually-hidden"> — {stop.title}</span>
    </>
  );

  if (!links) return <p className="trip-map-note">{t('place.mapsUnavailable')}</p>;

  return (
    <div className="trip-maps">
      <div className="trip-map-row">
        {disabled ? (
          <>
            <button type="button" className="btn btn-secondary btn-small" disabled>
              {label('place.mapGoogle')}
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled>
              {label('place.mapKakao')}
            </button>
          </>
        ) : (
          <>
            <a className="btn btn-secondary btn-small" href={links.google} target="_blank" rel="noopener noreferrer">
              {label('place.mapGoogle')}
            </a>
            <a className="btn btn-secondary btn-small" href={links.kakao} target="_blank" rel="noopener noreferrer">
              {label('place.mapKakao')}
            </a>
          </>
        )}
      </div>
      {disabled && <p className="trip-map-note">{t(disabledKey)}</p>}
      {showNote && !disabled && <p className="trip-map-note">{t('place.mapsNote')}</p>}
    </div>
  );
}
