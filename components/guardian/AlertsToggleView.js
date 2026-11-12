'use client';

// 복귀 마감 알림 스위치의 표시 부품 (docs/business-rules.md '보호자')
//
// 저장소를 읽지 않는다. 켜짐 여부·잠금·안내 문구는 모두 props 로 받는다.
//   - 실제 보호자 화면: AlertsToggle.js 가 기기 설정(prefs.notifications)을 읽어 넘긴다.
//   - 디자인 보드: 꺼짐·잠금 상태로 고정해 그린다(사용자 데이터를 읽지 않는다).
// 받은 일정 화면(/g)에는 보기 전용 배너가 없다(환자용 문구라서, 사용성 점검 D2). 그래서 스위치가 막힌 이유를 여기서 말한다:
// 오프라인이면 연결 뒤에 바꾸라고만 하고, 로그인 문제면 로그인하면 바꿀 수 있다고 하고 로그인 버튼을 둔다.

import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon } from '@/components/ui/index.js';

const NOTIFY_MESSAGE = Object.freeze({
  on: 'settings.notifyOn',
  off: 'settings.notifyOff',
  unsupported: 'settings.notifyUnsupported',
  denied: 'settings.notifyDenied',
  failed: 'settings.saveFailed',
});

/**
 * @param {object} props
 * @param {boolean} props.on                 스위치 켜짐
 * @param {boolean} [props.disabled]         누를 수 없음
 * @param {string|null} [props.message]      NOTIFY_MESSAGE 의 키(on·off·unsupported·denied·failed)
 * @param {boolean} [props.showReadOnly]     보기 전용 안내를 붙일지
 * @param {boolean} [props.offline]          보기 전용의 이유가 오프라인이다(로그인을 권하지 않는다)
 * @param {string|null} [props.loginHref]    로그인으로 가는 주소. 받은 일정 화면에는 보기 전용 배너가 없어 여기서 길을 준다(사용성 점검 D2)
 * @param {(event: Event) => void} [props.onChange]
 */
export default function AlertsToggleView({
  on,
  disabled = false,
  message = null,
  showReadOnly = false,
  offline = false,
  loginHref = null,
  onChange,
}) {
  const { t } = useLang();
  return (
    <section className="guardian-alerts" aria-label={t('guardian.alertsToggle')}>
      <label className="toggle-row guardian-alerts-row">
        <span className="label">{t('guardian.alertsToggle')}</span>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          checked={on}
          aria-checked={on}
          disabled={disabled}
          onChange={onChange ?? (() => {})}
        />
      </label>
      <div className="ui-callout has-icon guardian-alerts-note" role="note">
        <span className="ui-callout-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <p>{t('guardian.alertsNote')}</p>
      </div>
      <div role="status" className="guardian-alerts-status">
        {message && NOTIFY_MESSAGE[message] && <p>{t(NOTIFY_MESSAGE[message])}</p>}
      </div>
      {showReadOnly && offline && <p className="guardian-meta">{t('guardian.alertsOfflineNote')}</p>}
      {showReadOnly && !offline && (
        <>
          <p className="guardian-meta">{t('settings.readOnlyNote')}</p>
          {loginHref && (
            <Button href={loginHref} variant="secondary" size="small">
              {t('common.readOnlyLogin')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
