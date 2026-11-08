'use client';

// 일정 갱신 실패 알림 (/today · /trip · /trip/[날짜] 공용)
//
// 저장한 일정을 그대로 보여 주고 있다는 것과 다시 시도를 함께 알린다. 대기 색 알림 상자(TripNotice error, ! 아이콘).
// 보기 전용(로그인 만료·오프라인)이면 다시 시도 버튼을 숨긴다. 화면이 회색 바탕이면 부르는 쪽이 흰 블록 안에 둔다.
// 관광공사 조회 실패면 분류(upstream)에 맞는 본문을 고른다(updateFailedBodyKey). 어느 쪽이든 저장 일정은 그대로라는 것을 알린다.

import { useLang } from '../LanguageProvider.js';
import { Button } from '../ui/index.js';
import TripNotice from './TripNotice.js';
import { updateFailedBodyKey } from './viewModel.js';

/**
 * @param {object} props
 * @param {boolean} props.readOnly
 * @param {() => void} props.onRetry
 * @param {string|null} [props.upstream]  관광공사 실패 분류(trip.lastUpstream)
 */
export default function UpdateFailedNotice({ readOnly, onRetry, upstream = null }) {
  const { t } = useLang();
  return (
    <TripNotice error role="alert">
      <p className="trip-notice-title">{t('today.updateFailedTitle')}</p>
      <p>{t(updateFailedBodyKey(upstream))}</p>
      {!readOnly && (
        <Button variant="secondary" size="small" onClick={onRetry}>
          {t('today.retry')}
        </Button>
      )}
    </TripNotice>
  );
}
