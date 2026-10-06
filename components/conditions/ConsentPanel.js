'use client';

// 민감정보 동의 단계 (AX-315 · spec 4.19)
//
// - 첫 본인 체크 입력 전, 또는 병원 연동 전에 받는다. 조건 화면·연결 화면이 이 부품을 먼저 보여준다.
// - 동의 문구 버전과 동의 시각을 기기에 남긴다(getStore().grantSensitiveConsent).
// - '동의 문구 법무 검토 전' 배지를 늘 보여준다.
// - 거부하면 저장하지 않는다(동의 없음 그대로). 수술·시술 전 자유일 일정만 쓸 수 있다는 안내를 보여준다.
// - 보기 전용이면 동의 버튼을 막는다. 거부는 아무것도 쓰지 않으므로 막지 않는다.

import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';
import { CONSENT_TEXT_KEYS, CONSENT_VERSION } from './consent.js';
import SafetyText from './SafetyText.js';

/** '동의 문구 법무 검토 전' 배지 — 배지 5종과 뜻이 달라 이 화면 전용 모양을 쓴다 */
export function LegalReviewBadge() {
  const { t } = useLang();
  return (
    <span className="conditions-review-badge">
      <Icon name="clockQuestion" size={14} strokeWidth={2.2} />
      <span>{t('conditions.consentReviewBadge')}</span>
    </span>
  );
}

/**
 * @param {object} props
 * @param {{sensitive: {version: string, agreedAt: string} | null} | undefined} props.consent  stay.consent
 * @param {boolean} props.readOnly
 * @param {string} [props.lead]   동의 문구 앞에 붙는 안내(예: 연결 화면의 '먼저 동의가 필요해요')
 */
export default function ConsentPanel({ consent, readOnly, lead }) {
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
          {t('conditions.consentGranted', { at: fmtDateTime(sensitive.agreedAt, locale), version: sensitive.version })}
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
        <h2 id={headingId}>{t('conditions.consentTitle')}</h2>
        <LegalReviewBadge />
      </div>
      {lead && <p className="conditions-consent-lead">{lead}</p>}
      {refused ? (
        <>
          <SafetyText k={'conditions.consentRefused'} className="conditions-callout" />
          <div className="conditions-actions">
            <Button variant="secondary" onClick={() => setRefused(false)}>
              {t('conditions.consentReopen')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="conditions-consent-version">{t('conditions.consentVersion', { version: CONSENT_VERSION })}</p>
          <ul className="conditions-consent-list">
            {CONSENT_TEXT_KEYS.map((key) => (
              <SafetyText key={key} k={key} as="li" />
            ))}
          </ul>
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
        <p className="conditions-field-error" role="alert">
          {t('conditions.consentFailed')}
        </p>
      )}
    </section>
  );
}
