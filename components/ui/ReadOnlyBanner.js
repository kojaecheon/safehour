'use client';

// '보기 전용 — 로그인이 필요합니다' 배너 (AX-304 · spec 4.18)
//
// 앱 셸이 모든 화면(시작·로그인·시안 보드 제외) 맨 위에 자동으로 둔다. 화면은 따로 그리지 않는다.
//   - 저장소 상태(useStoreStatus)가 보기 전용이면 보인다: 로그인 안 함·만료·오프라인.
//   - 세션을 아직 묻지 않은 첫 그림에서는 그리지 않는다(깜빡임 방지). 오프라인은 바로 보인다.
//   - 자리(role=status)는 늘 DOM 에 남아 있어, 쓰는 중에 오프라인이 되면 스크린리더가 읽어 준다.
//   - 오프라인이면 로그인 링크를 두지 않는다(누를 수 없는 동작을 권하지 않는다).
//
// 시안 보드는 preview 로 이유를 고정해 그린다(사용자 상태를 읽지 않는다).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';
import useStoreStatus, { shouldShowReadOnly } from './useStoreStatus.js';

const REASON_KEY = {
  NO_SESSION: 'common.readOnlyNoSession',
  SESSION_EXPIRED: 'common.readOnlyExpired',
  OFFLINE: 'common.readOnlyOffline',
};

function Banner({ reason, returnTo, preview = false }) {
  const { t } = useLang();
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo || '/today')}`;
  return (
    <div className={preview ? 'ui-readonly is-preview' : 'ui-readonly'}>
      <span className="ui-readonly-icon">
        <Icon name="lock" size={18} />
      </span>
      <div className="ui-readonly-text">
        <strong className="ui-readonly-title">{t('common.readOnlyTitle')}</strong>
        <p className="ui-readonly-body">{t(REASON_KEY[reason] ?? REASON_KEY.NO_SESSION)}</p>
        {reason !== 'OFFLINE' && (
          <Link className="ui-readonly-login" href={loginHref}>
            {t('common.readOnlyLogin')}
          </Link>
        )}
      </div>
    </div>
  );
}

function LiveBanner() {
  const status = useStoreStatus();
  const pathname = usePathname() ?? '/';
  return (
    <div className="ui-readonly-slot" role="status">
      {shouldShowReadOnly(status) && <Banner reason={status.reason} returnTo={pathname} />}
    </div>
  );
}

/**
 * @param {{ preview?: 'NO_SESSION'|'SESSION_EXPIRED'|'OFFLINE' }} props
 *   preview — 시안 보드용. 저장소를 읽지 않고 그 이유로 고정해 그린다.
 */
export default function ReadOnlyBanner({ preview }) {
  if (preview) return <Banner reason={preview} returnTo="/today" preview />;
  return <LiveBanner />;
}
