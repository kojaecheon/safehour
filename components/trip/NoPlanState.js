'use client';

// 저장 일정이 아직 없을 때의 빈 상태 (/today · /trip · /trip/[날짜] 공용, usability 2026-11-08 C1)
//
// 첫 일정을 만드는 중이면 만드는 중 문구, 보기 전용이면 로그인·연결 뒤에 만든다는 문구, 만들기가 실패했으면
// 원인별 문구 하나(noPlanBodyKey)를 보인다. 저장 일정이 없으므로 위쪽 갱신 실패 알림은 화면이 띄우지 않는다.
// 다시 시도 버튼은 이 빈 상태에 하나만 두고, 세션 만료(401)처럼 다시 보내도 같은 결과인 실패에는 두지 않는다(noPlanRetryable).
// 운영자에게 알려야 하는 실패(AUTH · SELF_LIMIT)면 그 아래에 도움말·문의 링크를 둔다(HelpContactLink, findings 16).
// 부품은 표시만 한다: 동기화 상태는 부르는 쪽이 속성으로 넘긴다.

import { useLang } from '../LanguageProvider.js';
import { Button, EmptyState } from '../ui/index.js';
import HelpContactLink from './HelpContactLink.js';
import { needsOperatorContact, noPlanBodyKey, noPlanRetryable } from './viewModel.js';

/**
 * @param {object} props
 * @param {string} [props.icon]               빈 상태 그림(Icon.js 이름)
 * @param {boolean} props.syncing             만드는 중
 * @param {boolean} props.readOnly            보기 전용(로그인 만료·오프라인)
 * @param {boolean} props.updateFailed        마지막 만들기가 실패했다
 * @param {string|null} [props.errorCode]     trip.lastErrorCode
 * @param {string|null} [props.upstream]      trip.lastUpstream (관광공사 실패 분류)
 * @param {() => void} props.onRetry
 */
export default function NoPlanState({ icon = 'navToday', syncing, readOnly, updateFailed, errorCode = null, upstream = null, onRetry }) {
  const { t } = useLang();
  const bodyKey = syncing
    ? 'today.generatingBody'
    : readOnly
      ? 'today.noPlanReadOnly'
      : updateFailed
        ? noPlanBodyKey({ errorCode, upstream })
        : 'today.noPlanBody';
  const active = !syncing && !readOnly;
  const canRetry = active && (!updateFailed || noPlanRetryable(errorCode));
  const showContact = active && updateFailed && needsOperatorContact(upstream);
  return (
    <EmptyState
      icon={icon}
      title={syncing ? t('today.generatingTitle') : t('today.noPlanTitle')}
      body={t(bodyKey)}
      action={
        canRetry || showContact ? (
          <div className="trip-empty-actions">
            {canRetry && (
              <Button variant="secondary" onClick={onRetry}>
                {t('today.retry')}
              </Button>
            )}
            {showContact && <HelpContactLink upstream={upstream} />}
          </div>
        ) : null
      }
    />
  );
}
