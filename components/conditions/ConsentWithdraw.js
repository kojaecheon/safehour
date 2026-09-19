'use client';

// 민감정보 동의 철회 (AX-315 · spec 4.19) — /settings 와 /conditions 에서 쓴다
//
//   import { ConsentWithdraw } from '@/components/conditions/index.js';
//   <ConsentWithdraw />                  // 제목 h2
//   <ConsentWithdraw headingLevel={3} />
//
// 철회하면 저장소(withdrawSensitiveConsent)가 SELF 기간, HOSPITAL 기간, 연동 지침 사본(연결 코드 포함)을 지우고
// 병원 연결 표시를 끊는다. 그 날짜들은 NEEDS_INPUT(SENSITIVE_CONSENT_REQUIRED)이 되고,
// 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다. 이 부품은 일정 API 를 부르지 않는다.
// 되돌릴 수 없으므로 한 번 더 묻는다. 보기 전용이면 막는다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, useStoreStatus } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';
import SafetyText from './SafetyText.js';
import useStay from './useStay.js';

/**
 * @param {{headingLevel?: 2|3}} props
 */
export default function ConsentWithdraw({ headingLevel = 2 }) {
  const { t, locale } = useLang();
  const stay = useStay();
  const status = useStoreStatus();
  const headingId = useId();
  const questionId = useId();
  const confirmRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const Heading = `h${headingLevel}`;
  const sensitive = stay?.consent?.sensitive ?? null;
  const readOnly = status.readOnly;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function withdraw() {
    const outcome = getStore().withdrawSensitiveConsent();
    setConfirming(false);
    setResult(outcome.ok ? 'done' : 'failed');
  }

  return (
    <section className="conditions-withdraw" aria-labelledby={headingId}>
      <Heading id={headingId}>{t('conditions.withdrawTitle')}</Heading>
      {sensitive ? (
        <>
          <p>
            {t('conditions.consentGranted', { at: fmtDateTime(sensitive.agreedAt, locale), version: sensitive.version })}
          </p>
          <SafetyText k={'conditions.withdrawEffect'} className="conditions-callout" />
          {confirming ? (
            <div className="conditions-confirm" role="group" aria-labelledby={questionId}>
              <p id={questionId} className="conditions-confirm-question">
                {t('conditions.withdrawQuestion')}
              </p>
              <div className="conditions-actions">
                <Button ref={confirmRef} onClick={withdraw} disabled={readOnly}>
                  {t('conditions.withdrawConfirm')}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {t('conditions.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="conditions-actions">
              <Button
                variant="secondary"
                disabled={readOnly}
                onClick={() => {
                  setResult(null);
                  setConfirming(true);
                }}
              >
                {t('conditions.withdrawAction')}
              </Button>
            </div>
          )}
          {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
        </>
      ) : (
        <p>{t('conditions.withdrawNone')}</p>
      )}
      <div role="status" className="conditions-notice">
        {result === 'done' && t('conditions.withdrawDone')}
      </div>
      {result === 'failed' && (
        <p className="conditions-field-error" role="alert">
          {t('conditions.withdrawFailed')}
        </p>
      )}
    </section>
  );
}
