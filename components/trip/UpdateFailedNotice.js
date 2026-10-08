'use client';

// 일정 갱신 실패 알림 (/today · /trip · /trip/[날짜] 공용)
//
// 저장한 일정을 그대로 보여 주고 있다는 것과 다시 시도를 함께 알린다. 대기 색 알림 상자(TripNotice error, ! 아이콘).
// 보기 전용(로그인 만료·오프라인)이면 다시 시도 버튼을 숨긴다. 화면이 회색 바탕이면 부르는 쪽이 흰 블록 안에 둔다.

import { useLang } from '../LanguageProvider.js';
import { Button } from '../ui/index.js';
import TripNotice from './TripNotice.js';

/**
 * @param {object} props
 * @param {boolean} props.readOnly
 * @param {() => void} props.onRetry
 */
export default function UpdateFailedNotice({ readOnly, onRetry }) {
  const { t } = useLang();
  return (
    <TripNotice error role="alert">
      <p className="trip-notice-title">{t('today.updateFailedTitle')}</p>
      <p>{t('today.updateFailedBody')}</p>
      {!readOnly && (
        <Button variant="secondary" size="small" onClick={onRetry}>
          {t('today.retry')}
        </Button>
      )}
    </TripNotice>
  );
}
