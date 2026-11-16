'use client';

// 받은 일정 화면(/g)의 '앱이 닫혀 있어도 받기' 항목 표시 부품 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7)
//
// 저장소와 실행기를 읽지 않는다. 무엇을 그릴지는 guardianPushViewModel 의 결과(model)로만 받고, 누름은 콜백으로 돌려준다.
// 실제 화면은 GuardianPushItem.js 가 실행기 상태·기기 설정·보기 전용 신호를 모아 넘긴다.
//
// 모양
//   - 스위치는 기기 알림 스위치와 같은 부품(.toggle-row 라벨 + input.ui-switch, role="switch")이다. 라벨 줄 전체가 누르는 곳(52px)이다.
//     켤 수 없는 상태(아이폰 안내, 지원 안 됨, 차단, 기간 끝)는 스위치 대신 같은 이름의 제목을 둔다.
//   - 실행기가 일하는 중(model.switchLocked)이면 disabled 대신 aria-disabled 로 막고 누름을 무시한다. 누른 스위치에 포커스가 남는다.
//   - 상태 줄은 role="status", 결과 줄은 성공·안내는 role="status", 실패는 role="alert" 에 넣는다. 두 칸은 늘 있어 바뀜을 읽어 준다.
//   - 안전 문구(도착 비보장, 위치, 끄기 대기)는 두 언어 병기다(일본어·중국어 화면은 검수 전까지 영어와 한국어). 줄마다 lang 을 단다.
//   - 동의 문장과 법률 검토 줄은 늘 보인다(정한 값 28). 켜기 스위치를 누르는 것이 동의다.

import { useId } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon } from '@/components/ui/index.js';
import { PUSH_ACTION, PUSH_ITEM_STATE, pushLineSegments } from './guardianPushView.js';

const ACTION_LABEL = Object.freeze({
  [PUSH_ACTION.RELOAD]: 'guardian.pushReload',
  [PUSH_ACTION.RENEW]: 'guardian.pushRenewButton',
  [PUSH_ACTION.TAKE_OVER]: 'guardian.pushMovedButton',
  [PUSH_ACTION.LOGIN]: 'common.readOnlyLogin',
});

/** 안전 문구 한 줄을 두 언어로 */
function SafetyPair({ messageKey }) {
  const { pair } = useLang();
  const text = pair(messageKey);
  return (
    <div className="guardian-safety-pair">
      <p lang={text.primary.lang}>{text.primary.text}</p>
      <p lang={text.secondary.lang} className="guardian-note-secondary">
        {text.secondary.text}
      </p>
    </div>
  );
}

/** 결과 줄. safety 문장이면 두 언어 병기 */
function ResultLine({ result }) {
  const { t } = useLang();
  if (result.safety) return <SafetyPair messageKey={result.key} />;
  return <p>{t(result.key)}</p>;
}

/** 스위치 하나(켜기·함께 있음 공용). locked 면 포커스를 지키며 막는다 */
function SwitchRow({ label, on, disabled, locked, describedBy, onChange }) {
  return (
    <label className="toggle-row guardian-alerts-row">
      <span className="label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="ui-switch"
        checked={on}
        aria-checked={on}
        aria-describedby={describedBy}
        disabled={disabled && !locked}
        aria-disabled={locked ? 'true' : undefined}
        onClick={(event) => {
          if (locked) event.preventDefault();
        }}
        onChange={(event) => {
          if (disabled || locked) return;
          onChange?.(event.target.checked);
        }}
      />
    </label>
  );
}

/**
 * @param {object} props
 * @param {ReturnType<typeof import('./guardianPushView.js').guardianPushViewModel>} props.model
 * @param {(on: boolean) => void} [props.onToggle]  켜기 스위치를 눌렀다(true 켜기, false 끄기)
 * @param {(on: boolean) => void} [props.onMute]    오늘 함께 있음 스위치를 눌렀다
 * @param {(action: string) => void} [props.onAction]  RELOAD, RENEW, TAKE_OVER 버튼을 눌렀다(LOGIN 은 링크다)
 * @param {string|null} [props.loginHref]  로그인으로 가는 주소(받은 일정 화면으로 돌아온다)
 */
export default function GuardianPushItemView({ model, onToggle, onMute, onAction, loginHref = null }) {
  const { t } = useLang();
  const baseId = useId();
  if (!model || model.itemState === PUSH_ITEM_STATE.HIDDEN) return null;
  const titleId = `${baseId}-title`;
  const linesId = `${baseId}-lines`;
  const muteHelpId = `${baseId}-mute`;
  const result = model.result;

  return (
    <section
      className="guardian-push-item"
      aria-labelledby={model.showSwitch ? undefined : titleId}
      aria-label={model.showSwitch ? t('guardian.pushTitle') : undefined}
    >
      {model.showSwitch ? (
        <SwitchRow
          label={t('guardian.pushTitle')}
          on={model.switchOn}
          disabled={model.switchDisabled}
          locked={model.switchLocked}
          describedBy={linesId}
          onChange={onToggle}
        />
      ) : (
        <h3 id={titleId} className="guardian-push-heading">
          {t('guardian.pushTitle')}
        </h3>
      )}

      <div id={linesId} className="guardian-push-lines" role="status">
        {pushLineSegments(model.lines).map((segment) =>
          segment.kind === 'steps' ? (
            <ol key="steps" className="guardian-push-steps">
              {segment.keys.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
          ) : (
            <p key={segment.key} className={segment.key === 'guardian.pushIosTitle' ? 'guardian-push-steps-title' : undefined}>
              {t(segment.key)}
            </p>
          ),
        )}
      </div>

      <div className="guardian-push-result" role="status">
        {result && !result.alert && <ResultLine result={result} />}
      </div>
      <div className="guardian-push-result is-alert" role="alert">
        {result && result.alert && (
          <>
            <span className="guardian-push-result-icon" aria-hidden="true">
              <Icon name="alert" size={20} />
            </span>
            <div className="guardian-push-result-text">
              <ResultLine result={result} />
            </div>
          </>
        )}
      </div>

      {model.actions.length > 0 && (
        <div className="guardian-push-actions">
          {model.actions.map((action) =>
            action === PUSH_ACTION.LOGIN ? (
              loginHref && (
                <Button key={action} href={loginHref} variant="secondary" size="small">
                  {t(ACTION_LABEL[action])}
                </Button>
              )
            ) : (
              <Button
                key={action}
                variant="secondary"
                size="small"
                loading={model.actionsDisabled}
                onClick={() => onAction?.(action)}
              >
                {t(ACTION_LABEL[action])}
              </Button>
            ),
          )}
        </div>
      )}

      {model.showMute && (
        <div className="guardian-push-mute">
          <SwitchRow
            label={t('guardian.muteTitle')}
            on={model.muteOn}
            disabled={model.muteDisabled}
            locked={model.muteLocked}
            describedBy={muteHelpId}
            onChange={onMute}
          />
          <div id={muteHelpId} className="guardian-push-mute-help">
            <p>{t('guardian.muteHelp')}</p>
            <p>{t('guardian.muteMidnight')}</p>
          </div>
        </div>
      )}

      <div className="guardian-push-consent">
        {model.consentLines.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
      </div>

      <div className="ui-callout has-icon guardian-note guardian-push-safety" role="note">
        <span className="ui-callout-icon guardian-note-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <div className="guardian-note-text">
          {model.safetyLines.map((key) => (
            <SafetyPair key={key} messageKey={key} />
          ))}
        </div>
      </div>
    </section>
  );
}
