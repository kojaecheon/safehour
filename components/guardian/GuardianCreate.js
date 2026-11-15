'use client';

// 보호자 링크 만들기, /guardian (AX-320 · docs/business-rules.md '보호자', docs/platform/IA_AND_FLOWS.md '보기 전용 상태', docs/security.md '보호자 링크'·'민감정보 동의')
//
// 흐름
//   1. 체류·전체 일정이 있어야 한다. 없으면 무엇이 없는지와 어디서 넣는지 안내한다.
//   2. 담는 범위: 링크는 오늘(KST)과 입국일 중 늦은 날부터 7일만 담는다(출국일에서 멈춤). 범위와, 체류가 더 길면 다음 주에 새 링크가
//      필요하다는 문장을 동의 앞에 둔다.
//      공유 동의: **링크를 만들 때마다** 받는다. 담기는 것·담기지 않는 것, 병원 복귀는 '병원'으로만 보인다는 고지,
//      PIN 잠금이 우연한 열람을 막는 수준이라는 고지를 동의 앞에 둔다. 동의는 저장하지 않는다.
//   3. PIN 6자리 + 확인 입력.
//   4. 스냅샷(허용 목록) → 크기 재기(메신저 기준을 넘으면 안내) → PIN 암호화 → 링크(<origin>/g#<암호문>).
//      암호문은 # 뒤에만 있고, 이 화면은 서버로 아무것도 보내지 않는다(암호화는 브라우저 안에서 한다).
//   5. 복사·공유(navigator.share 가 있으면), guardianShare{보낸 시각, 일정 지문}을 저장한다.
//   6. 보낸 뒤 일정이 바뀌면 '보호자 링크 다시 보내기'를 안내한다(useGuardianResendNeeded).
//
// 서버 알림 선택 항목 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 8, 규칙은 ./serverPush.js)
//   - 공유 동의 체크 아래에 체크 하나와 동의 목록, 법률 검토 안내 줄(conditions.consentLegalReview)을 둔다. 배지는 없다(D12).
//   - 서버 알림 스위치가 꺼져 있거나 출국일이 지났으면 항목이 숨고 화면은 예전과 같다. 숨어 있으면 지켜보기를 건드리지 않는다.
//   - 만들기를 누르면 검증 뒤, 스냅샷을 만들기 전에 지켜보기를 켜거나(ensureRegistered) 끈다(retire). 등록이 실패해도 링크는
//     만들고(D6) 결과 줄에 이유 하나를 보인다. 스냅샷에는 켜진 지켜보기의 watchId 만 싣는다. 순서는 serverPush.js
//     submitWithServerPush 하나다.
//   - 결과 줄은 링크 결과 제목(포커스를 받는다)의 aria-describedby 로 읽힌다(이미 채워진 채 나타나 상태 알림으로는 읽히지 않는다).
//     끄기 결과 줄은 안전 문구라 주 언어와 병기 언어 두 줄이다.
//
// 보기 전용(로그인 안 함·만료·오프라인)에서는 만들기를 막는다(docs/platform/IA_AND_FLOWS.md '보기 전용 상태': 공유 차단).
// PIN 은 화면 상태에만 잠시 있고, 링크를 만든 뒤 바로 지운다. 저장하거나 기록하지 않는다.

import { useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, Icon, TopBar, useStoreStatus, shouldShowReadOnly } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { getWatchSync } from '@/lib/trip/client.js';
import { useGuardianWatch, useServerPushConfig } from '@/lib/trip/useWatch.js';
import {
  GUARDIAN_ERROR,
  GUARDIAN_LINK_BUDGET_CHARS,
  GUARDIAN_WINDOW_DAYS,
  buildGuardianLink,
  encryptSnapshot,
  guardianCoverage,
  isValidPin,
  measureGuardianLink,
} from '@/src/guardian/index.js';
import { diffDays, parseInstantMs } from '@/src/stay/index.js';
import { dateLabel, kstClock, kstDate } from './errorView.js';
import { ErrorText, WarningNote } from './Feedback.js';
import { useGuardianResendNeeded, useHydrated, useStoreRecord } from './hooks.js';
import SafetyNote from './SafetyNote.js';
import {
  SERVER_PUSH_CONSENT_KEYS,
  serverPushInitialChecked,
  serverPushOptionVisible,
  serverPushResultKeys,
  serverPushRetireKeys,
  submitWithServerPush,
} from './serverPush.js';
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

/**
 * 스냅샷이 담는 범위 → 화면 문구 재료. 날짜가 없으면 null
 * today: 범위가 오늘부터인가. 아니면 입국일부터다(입국 전에 만든 링크는 입국일부터 7일을 담는다)
 * @returns {{today: boolean, n: number, from: string, to: string, more: boolean} | null}
 */
export function coverageView(snapshot, locale, nowMs) {
  const range = guardianCoverage(snapshot);
  if (!range) return null;
  return {
    today: range.from === kstDate(nowMs),
    n: diffDays(range.from, range.to) + 1,
    from: dateLabel(range.from, locale),
    to: dateLabel(range.to, locale),
    more: range.more,
  };
}

function CoverageNote({ view }) {
  const { t } = useLang();
  if (!view) return null;
  return (
    <div className="guardian-coverage">
      <p className="guardian-meta">{t(view.today ? 'guardian.rangeToday' : 'guardian.rangeFromArrival', view)}</p>
      {view.more && <p className="guardian-meta">{t('guardian.rangeNextWeek', { n: GUARDIAN_WINDOW_DAYS })}</p>}
    </div>
  );
}

const onlyDigits = (value) => value.replace(/[^0-9]/g, '').slice(0, 6);

function ResendNotice({ share, needed, windowPassed, locale, onNewLink }) {
  const { t } = useLang();
  const sent = kstLabel(share?.lastSentAt, locale);
  if (!needed && windowPassed) {
    return (
      <section className="guardian-resend" aria-labelledby="guardian-resend-title">
        <h2 id="guardian-resend-title">{t('guardian.windowPassedTitle')}</h2>
        <p className="guardian-meta">{t('guardian.windowPassedBody', { n: GUARDIAN_WINDOW_DAYS })}</p>
        {sent && <p className="guardian-meta">{t('guardian.lastSent', sent)}</p>}
        {onNewLink && (
          <Button variant="secondary" onClick={onNewLink}>
            {t('guardian.newLink')}
          </Button>
        )}
      </section>
    );
  }
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
  const { t, pair, locale } = useLang();
  const hydrated = useHydrated();
  const fieldId = useId();
  const pushResultId = useId();
  const linkRef = useRef(null);
  const [feedback, setFeedback] = useState(null);
  const canShare = hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const expires = kstLabel(result.expiresAt, locale);
  // 서버 알림 결과 줄: 체크해 등록을 시도했을 때(pushKeys), 체크를 꺼서 끄기를 시도했을 때(retireKeys, 안전 문구)만 있다
  const pushKeys = serverPushResultKeys(result.serverPush ?? null);
  const retireKeys = serverPushRetireKeys(result.serverPushRetire ?? null);
  const hasPushResult = pushKeys.length + retireKeys.length > 0;

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
      <h2 id="guardian-result-title" ref={headingRef} tabIndex={-1} aria-describedby={hasPushResult ? pushResultId : undefined}>
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
      {/* 결과와 함께 채워진 채 나타나므로 상태 알림이 아니라 제목의 설명(aria-describedby)으로 읽힌다 */}
      {hasPushResult && (
        <div id={pushResultId} className="guardian-push-result">
          {pushKeys.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
          {retireKeys.map((key) => {
            const text = pair(key);
            return (
              <div key={key}>
                <p lang={text.primary.lang}>{text.primary.text}</p>
                <p lang={text.secondary.lang} className="guardian-note-secondary">
                  {text.secondary.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {result.overBudget && <WarningNote>{t('guardian.longLink', { n: result.linkChars })}</WarningNote>}
      <CoverageNote view={result.coverage} />
      <p className="guardian-pin-reminder">{t('guardian.pinReminder')}</p>
      {expires && <p className="guardian-meta">{t('guardian.expiresNote', expires)}</p>}
      {!result.shareSaved && <WarningNote>{t('guardian.saveShareFailed')}</WarningNote>}
      <Button variant="quiet" onClick={onNewLink}>
        {t('guardian.newLink')}
      </Button>
    </section>
  );
}

function previewCoverage(stay, tripPlan, locale) {
  try {
    const nowMs = Date.now();
    return coverageView(buildShareSnapshot({ stay, tripPlan, now: nowMs }), locale, nowMs);
  } catch {
    return null;
  }
}

/** 오늘(KST) 날짜 */
function todayKst() {
  return kstDate(Date.now());
}

function ShareForm({ stay, tripPlan, canCreate, readOnlyShown, onCreated, consentHeadingRef }) {
  const { t, locale } = useLang();
  const coverage = previewCoverage(stay, tripPlan, locale);
  const pushConfig = useServerPushConfig();
  const watch = useGuardianWatch();
  const pushVisible = serverPushOptionVisible({ enabled: pushConfig.enabled, departureDate: stay?.departure?.date, today: todayKst() });
  const ids = {
    consent: useId(),
    consentError: useId(),
    push: useId(),
    pushDetails: useId(),
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
  // 처음 체크 상태는 지켜보기가 켜져(ON) 있을 때만 켜짐(다르게 정한 것 20). 이 양식이 그려질 때 한 번 정한다
  const [pushChecked, setPushChecked] = useState(() => serverPushInitialChecked(watch.state));
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
      // 서버 알림: 항목이 보일 때만 켜거나 끈다. 등록이 실패해도 링크는 만든다(D6). 등록 결과의 id 로 스냅샷을 만든다
      const origin = window.location.origin;
      const nowMs = Date.now();
      const made = await submitWithServerPush({
        option: { visible: pushVisible, checked: pushChecked, state: watch.state, watchId: watch.watchId },
        stay,
        sync: getWatchSync(),
        makeLink: async (watchId) => {
          const snapshot = buildShareSnapshot({ stay, tripPlan, now: nowMs, watchId });
          const size = await measureGuardianLink(snapshot, { origin });
          const fragment = await encryptSnapshot(snapshot, pin);
          const link = buildGuardianLink(origin, fragment);
          const saved = getStore().writeGuardianShare(await shareRecordFor(snapshot));
          return { snapshot, size, link, saved };
        },
      });
      const { snapshot, size, link, saved } = made.link;
      // PIN·동의는 이 링크로 끝난다 — 다음 링크는 다시 받는다
      setPin('');
      setPin2('');
      setConsent(false);
      onCreated({
        link,
        linkChars: size.linkChars ?? link.length,
        overBudget: (size.linkChars ?? link.length) > GUARDIAN_LINK_BUDGET_CHARS,
        expiresAt: snapshot.expiresAt,
        coverage: coverageView(snapshot, locale, nowMs),
        shareSaved: saved?.ok === true,
        serverPush: made.serverPush,
        serverPushRetire: made.serverPushRetire,
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
        <CoverageNote view={coverage} />
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
        {pushVisible && (
          <div className="guardian-push">
            <h3 className="guardian-list-title">{t('guardian.serverPushTitle')}</h3>
            <div className="toggle-row guardian-consent guardian-push-check">
              <label htmlFor={ids.push} className="label">
                {t('guardian.serverPushCheck')}
              </label>
              <input
                id={ids.push}
                type="checkbox"
                checked={pushChecked}
                onChange={(e) => setPushChecked(e.target.checked)}
                aria-describedby={ids.pushDetails}
              />
            </div>
            <div>
              <p id={ids.pushDetails} className="guardian-hint">
                {t('guardian.serverPushIntro')}
              </p>
              <ul className="guardian-list guardian-push-list" role="list">
                {SERVER_PUSH_CONSENT_KEYS.map((key) => (
                  <li key={key}>
                    <span className="guardian-list-icon" aria-hidden="true">
                      <Icon name="info" size={20} />
                    </span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <p className="guardian-hint">{t('conditions.consentLegalReview')}</p>
            </div>
          </div>
        )}
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
        {/* 처리 중에는 disabled 대신 loading 으로 막아 포커스를 지킨다(Button 계약) */}
        <Button type="submit" disabled={!canCreate} loading={busy}>
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
  const { needed, windowPassed, share } = useGuardianResendNeeded();
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
        <ResendNotice share={share} needed={needed} windowPassed={windowPassed} locale={locale} onNewLink={result ? startNewLink : null} />
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
