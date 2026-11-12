'use client';

// 민감정보 동의 단계 (AX-315 · docs/security.md '민감정보 동의')
//
// - 첫 본인 체크 입력 전, 또는 병원 연동 전에 받는다. 조건 화면·연결 화면이 이 부품을 먼저 보여준다.
// - 동의 문구 버전과 동의 시각을 기기에 남긴다(getStore().grantSensitiveConsent). 버전 문자열은 화면에 보이지 않는다.
// - 동의 문구는 아직 법무 검토 전이다(consent.js). 내부 표시라 화면 배지로 두지 않는다(운영자 결정 2026-11-08).
//   공개 전 법무 검토 뒤 consent.js 의 버전을 올린다.
// - 거부하면 저장하지 않는다(동의 없음 그대로). 수술·시술 전 자유일 일정만 쓸 수 있다는 안내를 보여준다.
// - 보기 전용이면 동의 버튼을 막는다. 거부는 아무것도 쓰지 않으므로 막지 않는다.

import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';
import { CONSENT_TEXT_KEYS, CONSENT_VERSION } from './consent.js';
import SafetyText from './SafetyText.js';

/**
 * @param {object} props
 * @param {{sensitive: {version: string, agreedAt: string} | null} | undefined} props.consent  stay.consent
 * @param {boolean} props.readOnly
 * @param {string} [props.lead]   동의 문구 앞에 붙는 안내(예: 연결 화면의 '먼저 동의가 필요해요')
 * @param {React.Ref<HTMLHeadingElement>} [props.headingRef]  주면 제목이 초점을 받을 수 있다(tabIndex -1).
 *   동의 철회 뒤 철회 블록이 사라지고 이 블록이 나타날 때, 화면이 초점을 이 제목으로 옮기는 데 쓴다
 */
export default function ConsentPanel({ consent, readOnly, lead, headingRef }) {
  const { t, locale } = useLang();
  const headingId = useId();
  const [refused, setRefused] = useState(false);
  const [failed, setFailed] = useState(false);
  const sensitive = consent?.sensitive ?? null;

  if (sensitive) {
    return (
      <p className="conditions-consent-status">
        <Icon name="check" size={20} strokeWidth={2.4} />
        <span>
          {t('conditions.consentGranted', { at: fmtDateTime(sensitive.agreedAt, locale) })}
        </span>
      </p>
    );
  }

  function agree() {
    setFailed(false);
    const result = getStore().grantSensitiveConsent({ version: CONSENT_VERSION });
    if (!result.ok) setFailed(true);
  }

  return (
    <section className="card conditions-consent" aria-labelledby={headingId}>
      <div className="conditions-section-head">
        <h2 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          {t('conditions.consentTitle')}
        </h2>
      </div>
      {lead && <p className="conditions-consent-lead">{lead}</p>}
      {refused ? (
        <>
          <SafetyText k={'conditions.consentRefused'} className="ui-callout conditions-callout" />
          <div className="conditions-actions">
            <Button variant="secondary" onClick={() => setRefused(false)}>
              {t('conditions.consentReopen')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="conditions-consent-list">
            {CONSENT_TEXT_KEYS.map((key) => (
              <SafetyText key={key} k={key} as="li" />
            ))}
          </ul>
          <p className="conditions-hint conditions-consent-review">{t('conditions.consentLegalReview')}</p>
          <div className="conditions-actions">
            <Button onClick={agree} disabled={readOnly}>
              {t('conditions.consentAgree')}
            </Button>
            <Button variant="secondary" onClick={() => setRefused(true)}>
              {t('conditions.consentRefuse')}
            </Button>
          </div>
          {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
        </>
      )}
      {failed && (
        <p className="ui-field-error conditions-field-error" role="alert">
          <Icon name="alert" size={20} />
          <span>{t('conditions.consentFailed')}</span>
        </p>
      )}
    </section>
  );
}
