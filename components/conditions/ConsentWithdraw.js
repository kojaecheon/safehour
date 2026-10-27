'use client';

// 민감정보 동의 철회 (AX-315 · spec 4.19): 지금은 /conditions 에서만 쓴다(설정 화면은 자체 시트).
// 부품이 자기 흰 블록(ui-block)을 품고 있어, 흰 바탕 화면에 두면 좌우로 나간다.
//
//   import { ConsentWithdraw } from '@/components/conditions/index.js';
//   <ConsentWithdraw />                  // 제목 h2
//   <ConsentWithdraw headingLevel={3} />
//   <ConsentWithdraw onWithdrawn={armRefocus} />   // 철회가 성공한 직후 부른다
//
// 철회하면 저장소(withdrawSensitiveConsent)가 SELF 기간, HOSPITAL 기간, 연동 지침 사본(연결 코드 포함)을 지우고
// 병원 연결 표시를 끊는다. 그 날짜들은 NEEDS_INPUT(SENSITIVE_CONSENT_REQUIRED)이 되고,
// 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다. 이 부품은 일정 API 를 부르지 않는다.
// 철회가 성공하면 동의가 없어져 이 블록 자체가 화면에서 사라진다(조건 화면은 동의한 때만 그린다). 대화상자가 돌려줄 초점이
// 함께 사라지므로, 이 부품은 지우지 않고 onWithdrawn 으로 화면에 알린다. 초점을 옮기는 일은 살아남는 화면이 한다.
// 되돌릴 수 없으므로 확인 대화상자로 한 번 더 묻는다(확인 버튼만 긴급 빨강, 철회 버튼은 회색: 채운 강조 버튼은 화면당 하나이고 빨간 채움은 긴급 버튼 색이다). 보기 전용이면 막는다.

import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { AlertDialog, Button, Icon, useStoreStatus } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';
import SafetyText from './SafetyText.js';
import useStay from './useStay.js';

/**
 * @param {{headingLevel?: 2|3, onWithdrawn?: () => void}} props
 *   onWithdrawn: 철회가 성공한 직후(대화상자를 닫으라고 한 다음) 한 번 부른다. 실패하면 부르지 않는다
 */
export default function ConsentWithdraw({ headingLevel = 2, onWithdrawn }) {
  const { t, locale } = useLang();
  const stay = useStay();
  const status = useStoreStatus();
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const Heading = `h${headingLevel}`;
  const sensitive = stay?.consent?.sensitive ?? null;
  const readOnly = status.readOnly;

  function withdraw(requestClose) {
    const outcome = getStore().withdrawSensitiveConsent();
    requestClose();
    setResult(outcome.ok ? 'done' : 'failed');
    if (outcome.ok) onWithdrawn?.();
  }

  return (
    <section className="ui-block conditions-withdraw" aria-labelledby={headingId}>
      <Heading id={headingId}>{t('conditions.withdrawTitle')}</Heading>
      {sensitive ? (
        <>
          <p>
            {t('conditions.consentGranted', { at: fmtDateTime(sensitive.agreedAt, locale), version: sensitive.version })}
          </p>
          <SafetyText k={'conditions.withdrawEffect'} className="ui-callout conditions-callout" />
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
          {confirming && (
            <AlertDialog
              title={t('conditions.withdrawTitle')}
              description={t('conditions.withdrawQuestion')}
              cancelLabel={t('conditions.cancel')}
              confirmLabel={t('conditions.withdrawConfirm')}
              critical
              onConfirm={({ requestClose }) => withdraw(requestClose)}
              onClose={() => setConfirming(false)}
            />
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
          <Icon name="alert" size={20} />
          <span>{t('conditions.withdrawFailed')}</span>
        </p>
      )}
    </section>
  );
}
