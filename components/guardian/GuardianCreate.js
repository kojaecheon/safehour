'use client';

// 보호자 링크 만들기 — /guardian (AX-320 · spec 4.11, 4.18, 4.19, 5.1, 5.4, 규칙 37·38)
//
// 흐름
//   1. 체류·전체 일정이 있어야 한다. 없으면 무엇이 없는지와 어디서 넣는지 안내한다.
//   2. 공유 동의 — **링크를 만들 때마다** 받는다. 담기는 것·담기지 않는 것, 병원 복귀는 '병원'으로만 보인다는 고지,
//      PIN 잠금이 우연한 열람을 막는 수준이라는 고지를 동의 앞에 둔다. 동의는 저장하지 않는다.
//   3. PIN 6자리 + 확인 입력.
//   4. 스냅샷(허용 목록) → 크기 재기(메신저 기준을 넘으면 안내) → PIN 암호화 → 링크(<origin>/g#<암호문>).
//      암호문은 # 뒤에만 있고, 이 화면은 서버로 아무것도 보내지 않는다(암호화는 브라우저 안에서 한다).
//   5. 복사·공유(navigator.share 가 있으면), guardianShare{보낸 시각, 일정 지문}을 저장한다.
//   6. 보낸 뒤 일정이 바뀌면 '보호자 링크 다시 보내기'를 안내한다(useGuardianResendNeeded).
//
// 보기 전용(로그인 안 함·만료·오프라인)에서는 만들기를 막는다(spec 4.18 — 공유 차단).
// PIN 은 화면 상태에만 잠시 있고, 링크를 만든 뒤 바로 지운다. 저장하거나 기록하지 않는다.

import { useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, Icon, TopBar, useStoreStatus, shouldShowReadOnly } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import {
  GUARDIAN_ERROR,
  GUARDIAN_LINK_BUDGET_CHARS,
  buildGuardianLink,
  encryptSnapshot,
  isValidPin,
  measureGuardianLink,
} from '@/src/guardian/index.js';
import { parseInstantMs } from '@/src/stay/index.js';
import { dateLabel, kstClock, kstDate } from './errorView.js';
import { ErrorText, WarningNote } from './Feedback.js';
import { useGuardianResendNeeded, useHydrated, useStoreRecord } from './hooks.js';
import SafetyNote from './SafetyNote.js';
import { buildShareSnapshot, shareRecordFor } from './share.js';

const readStay = (store) => store.readStay();
const readTripPlan = (store) => store.readTripPlan();

const INCLUDED_KEYS = ['guardian.included1', 'guardian.included2', 'guardian.included3', 'guardian.included4', 'guardian.included5'];
const EXCLUDED_KEYS = ['guardian.excluded1', 'guardian.excluded2', 'guardian.excluded3'];

/** ISO 시각 → { date: 화면 날짜, time: 'HH:MM' } (한국 시각) */
function kstLabel(iso, locale) {
  const ms = typeof iso === 'string' ? parseInstantMs(iso) : null;
  if (ms === null) return null;
  return { date: dateLabel(kstDate(ms), locale), time: kstClock(ms) };
}

const onlyDigits = (value) => value.replace(/[^0-9]/g, '').slice(0, 6);

function ResendNotice({ share, needed, locale, onNewLink }) {
  const { t } = useLang();
  const sent = kstLabel(share?.lastSentAt, locale);
  if (needed) {
    return (
      <section className="guardian-resend" aria-labelledby="guardian-resend-title">
        <h2 id="guardian-resend-title">{t('guardian.resendTitle')}</h2>
        <SafetyNote messageKey={'guardian.resendBody'} role={null} />
        {sent && <p className="guardian-meta">{t('guardian.lastSent', sent)}</p>}
        {onNewLink && (
          <Button variant="secondary" onClick={onNewLink}>
            {t('guardian.newLink')}
          </Button>
        )}
      </section>
    );
  }
  if (!sent) return null;
  return (
    <p className="guardian-meta guardian-sent">
      {t('guardian.lastSent', sent)} {t('guardian.upToDate')}
    </p>
  );
}

function LinkResult({ result, onNewLink, headingRef }) {
  const { t, locale } = useLang();
  const hydrated = useHydrated();
  const fieldId = useId();
  const linkRef = useRef(null);
  const [feedback, setFeedback] = useState(null);
  const canShare = hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const expires = kstLabel(result.expiresAt, locale);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.link);
      setFeedback('guardian.copied');
      return;
    } catch {
      // 클립보드 권한이 없으면 칸을 선택해 복사를 시도한다
    }
    const field = linkRef.current;
    let copied = false;
    if (field) {
      field.focus();
      field.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
    }
    setFeedback(copied ? 'guardian.copied' : 'guardian.copyFailed');
  }

  async function shareLink() {
    try {
      // PIN 은 넣지 않는다 — 링크만 넘긴다
      await navigator.share({ title: t('guardian.shareTitle'), url: result.link });
      setFeedback(null);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setFeedback('guardian.shareFailed');
    }
  }

  return (
    <section className="guardian-result" aria-labelledby="guardian-result-title">
      <h2 id="guardian-result-title" ref={headingRef} tabIndex={-1}>
        {t('guardian.linkTitle')}
      </h2>
      <div className="field">
        <label htmlFor={fieldId}>{t('guardian.linkLabel')}</label>
        <textarea
          id={fieldId}
          ref={linkRef}
          className="guardian-link-field"
          readOnly
          rows={4}
          value={result.link}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
      <div className="guardian-actions">
        <Button icon="check" onClick={copyLink}>
          {t('guardian.copy')}
        </Button>
        {canShare && (
          <Button variant="secondary" onClick={shareLink}>
            {t('guardian.share')}
          </Button>
        )}
      </div>
      <p className="guardian-feedback" role="status">
        {feedback ? t(feedback) : ''}
      </p>
      {result.overBudget && <WarningNote>{t('guardian.longLink', { n: result.linkChars })}</WarningNote>}
      <p className="guardian-pin-reminder">{t('guardian.pinReminder')}</p>
      {expires && <p className="guardian-meta">{t('guardian.expiresNote', expires)}</p>}
      {!result.shareSaved && <WarningNote>{t('guardian.saveShareFailed')}</WarningNote>}
      <Button variant="quiet" onClick={onNewLink}>
        {t('guardian.newLink')}
      </Button>
    </section>
  );
}

function ShareForm({ stay, tripPlan, canCreate, readOnlyShown, onCreated, consentHeadingRef }) {
  const { t } = useLang();
  const ids = {
    consent: useId(),
    consentError: useId(),
    pin: useId(),
    pinHint: useId(),
    pinError: useId(),
    pin2: useId(),
    pin2Error: useId(),
  };
  const consentRef = useRef(null);
  const pinRef = useRef(null);
  const pin2Ref = useRef(null);
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || !canCreate) return;
    const next = {};
    if (!consent) next.consent = 'guardian.consentRequired';
    if (!isValidPin(pin)) next.pin = 'guardian.pinInvalid';
    else if (pin2 !== pin) next.pin2 = 'guardian.pinMismatch';
    setErrors(next);
    if (next.consent) return consentRef.current?.focus();
    if (next.pin) return pinRef.current?.focus();
    if (next.pin2) return pin2Ref.current?.focus();

    setBusy(true);
    try {
      const origin = window.location.origin;
      const snapshot = buildShareSnapshot({ stay, tripPlan, now: Date.now() });
      const size = await measureGuardianLink(snapshot, { origin });
      const fragment = await encryptSnapshot(snapshot, pin);
      const link = buildGuardianLink(origin, fragment);
      const saved = getStore().writeGuardianShare(await shareRecordFor(snapshot));
      // PIN·동의는 이 링크로 끝난다 — 다음 링크는 다시 받는다
      setPin('');
      setPin2('');
      setConsent(false);
      onCreated({
        link,
        linkChars: size.linkChars ?? link.length,
        overBudget: (size.linkChars ?? link.length) > GUARDIAN_LINK_BUDGET_CHARS,
        expiresAt: snapshot.expiresAt,
        shareSaved: saved?.ok === true,
      });
    } catch (err) {
      const code = err?.code;
      setErrors({
        form:
          code === GUARDIAN_ERROR.CRYPTO_UNAVAILABLE
            ? 'guardian.errCrypto'
            : code === GUARDIAN_ERROR.UNSUPPORTED_FORMAT
              ? 'guardian.errUnsupported'
              : 'guardian.createFailed',
      });
    } finally {
      setBusy(false);
    }
  }

  const describedPin = [ids.pinHint, errors.pin ? ids.pinError : null].filter(Boolean).join(' ');

  return (
    <form className="guardian-form" onSubmit={onSubmit} noValidate aria-busy={busy}>
      <section className="guardian-section" aria-labelledby="guardian-consent-title">
        <h2 id="guardian-consent-title" ref={consentHeadingRef} tabIndex={-1}>
          {t('guardian.consentTitle')}
        </h2>
        <h3 className="guardian-list-title">{t('guardian.includedTitle')}</h3>
        <ul className="guardian-list guardian-list-in" role="list">
          {INCLUDED_KEYS.map((key) => (
            <li key={key}>
              <span className="guardian-list-icon" aria-hidden="true">
                <Icon name="check" size={20} />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <h3 className="guardian-list-title">{t('guardian.excludedTitle')}</h3>
        <ul className="guardian-list guardian-list-out" role="list">
          {EXCLUDED_KEYS.map((key) => (
            <li key={key}>
              <span className="guardian-list-icon" aria-hidden="true">
                <Icon name="close" size={20} />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <SafetyNote messageKey={'guardian.hospitalReturnNote'} icon="hospital" />
        <SafetyNote messageKey={'guardian.limitNote'} icon="lock" className="guardian-note-strong" />
        <div className="toggle-row guardian-consent">
          <label htmlFor={ids.consent} className="label">
            {t('guardian.consentCheck')}
          </label>
          <input
            id={ids.consent}
            ref={consentRef}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={errors.consent ? 'true' : undefined}
            aria-describedby={errors.consent ? ids.consentError : undefined}
          />
        </div>
        {errors.consent && <ErrorText id={ids.consentError}>{t(errors.consent)}</ErrorText>}
      </section>

      <section className="guardian-section" aria-labelledby="guardian-pin-title">
        <h2 id="guardian-pin-title">{t('guardian.pinTitle')}</h2>
        <div className="field">
          <label htmlFor={ids.pin}>{t('guardian.pinLabel')}</label>
          <input
            id={ids.pin}
            ref={pinRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            className="guardian-pin"
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            aria-invalid={errors.pin ? 'true' : undefined}
            aria-describedby={describedPin}
          />
          <p id={ids.pinHint} className="guardian-hint">
            {t('guardian.pinHint')}
          </p>
          {errors.pin && <ErrorText id={ids.pinError}>{t(errors.pin)}</ErrorText>}
        </div>
        <div className="field">
          <label htmlFor={ids.pin2}>{t('guardian.pinConfirmLabel')}</label>
          <input
            id={ids.pin2}
            ref={pin2Ref}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            className="guardian-pin"
            value={pin2}
            onChange={(e) => setPin2(onlyDigits(e.target.value))}
            aria-invalid={errors.pin2 ? 'true' : undefined}
            aria-describedby={errors.pin2 ? ids.pin2Error : undefined}
          />
          {errors.pin2 && <ErrorText id={ids.pin2Error}>{t(errors.pin2)}</ErrorText>}
        </div>
      </section>

      {/* 하단 고정 바(설계서 6.1): 만들 수 없는 이유(실패·보기 전용)는 버튼 곁에 보이도록 바 안 맨 앞에 둔다 */}
      <div className="guardian-bar sticky-return is-flow">
        {errors.form && <ErrorText>{t(errors.form)}</ErrorText>}
        {readOnlyShown && <p className="guardian-meta guardian-bar-note">{t('guardian.readOnlyBlocked')}</p>}
        <Button type="submit" disabled={!canCreate || busy}>
          {busy ? t('guardian.creating') : t('guardian.createButton')}
        </Button>
      </div>
    </form>
  );
}

export default function GuardianCreate() {
  const { t, locale } = useLang();
  const hydrated = useHydrated();
  const status = useStoreStatus();
  const stay = useStoreRecord('stay', readStay);
  const tripPlan = useStoreRecord('tripPlan', readTripPlan);
  const { needed, share } = useGuardianResendNeeded();
  const [result, setResult] = useState(null);
  const resultHeadingRef = useRef(null);
  const consentHeadingRef = useRef(null);

  const canCreate = status.authenticated && !status.readOnly;
  const readOnlyShown = shouldShowReadOnly(status);

  function showResult(next) {
    setResult(next);
    window.requestAnimationFrame(() => resultHeadingRef.current?.focus());
  }

  function startNewLink() {
    setResult(null);
    window.requestAnimationFrame(() => {
      const heading = consentHeadingRef.current;
      heading?.scrollIntoView({ block: 'start' });
      heading?.focus();
    });
  }

  let body;
  if (!hydrated) {
    body = (
      <p className="guardian-meta" role="status">
        {t('guardian.loading')}
      </p>
    );
  } else if (!stay) {
    body = (
      <EmptyState
        icon="bed"
        title={t('guardian.needStayTitle')}
        body={t('guardian.needStayBody')}
        action={<Button href="/onboarding">{t('guardian.needStayAction')}</Button>}
      />
    );
  } else if (!tripPlan) {
    body = (
      <EmptyState
        icon="navTrip"
        title={t('guardian.needPlanTitle')}
        body={t('guardian.needPlanBody')}
        action={<Button href="/trip">{t('guardian.needPlanAction')}</Button>}
      />
    );
  } else {
    body = (
      <>
        <ResendNotice share={share} needed={needed} locale={locale} onNewLink={result ? startNewLink : null} />
        {result ? (
          <LinkResult result={result} onNewLink={startNewLink} headingRef={resultHeadingRef} />
        ) : (
          <ShareForm
            stay={stay}
            tripPlan={tripPlan}
            canCreate={canCreate}
            readOnlyShown={readOnlyShown}
            onCreated={showResult}
            consentHeadingRef={consentHeadingRef}
          />
        )}
      </>
    );
  }

  return (
    <>
      <TopBar title={t('guardian.createTitle')} backHref="/more" />
      <main className="page guardian-page">
        <p className="guardian-lead">{t('guardian.createLead')}</p>
        {body}
      </main>
    </>
  );
}
