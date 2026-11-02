'use client';

// 보호자 링크 열기 — /g (AX-320 · spec 4.11, 4.18, 4.19, 규칙 37·38)
//
// 흐름
//   1. 암호문은 주소의 # 뒤에서만 읽는다(브라우저가 # 뒤를 서버로 보내지 않는다). 이 화면은 암호문을 어떤 요청에도 싣지 않는다.
//   2. 모든 사용에 로그인이 필요하다. 로그인하지 않았으면 암호문을 **탭 저장소에 임시로** 두고(최대 1시간),
//      /login?returnTo=/g 로 보낸다. 돌아오면 임시 보관에서 이어서 가져온다.
//   3. PIN 입력 — 기기 단위 잠금(5회 연속 오류 → 1시간). 잠금 기록 키는 safehour.v2. 아래라 '내 정보 지우기'가 함께 지운다.
//   4. 풀리면 사본을 기기에 저장하고, 임시 보관을 지우고, 주소에서 # 뒤를 지운다.
//   5. 저장한 사본은 로그인 만료·오프라인에서도 보기 전용으로 보여 준다. 만료된 사본은 저장소가 지우고 보여 주지 않는다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, TopBar, useStoreStatus } from '@/components/ui/index.js';
import { READ_ONLY_REASON, getStore } from '@/lib/store/index.js';
import { GUARDIAN_ERROR, GuardianError, isValidPin, unlockSnapshot } from '@/src/guardian/index.js';
import { parseInstantMs } from '@/src/stay/index.js';
import { copyIdFor, guardianErrorView } from './errorView.js';
import { ErrorText, WarningNote } from './Feedback.js';
import GuardianCopyView, { kstStamp } from './GuardianCopyView.js';
import {
  guardianLockout,
  notifyIncomingLink,
  stripLinkFromAddress,
  useHydrated,
  useIncomingLink,
  useStoreRecord,
} from './hooks.js';

const LOGIN_HREF = `/login?returnTo=${encodeURIComponent('/g')}`;
const MAX_TIMER_MS = 2 ** 31 - 1;
const readCopies = (store) => store.readGuardianCopies();
const NO_COPIES = Object.freeze([]);
/** 더 이상 쓸 수 없는 링크 — 임시 보관을 지운다 */
const DEAD_LINK_CODES = new Set([GUARDIAN_ERROR.EXPIRED, GUARDIAN_ERROR.INVALID_LINK, GUARDIAN_ERROR.INVALID_SNAPSHOT]);

const onlyDigits = (value) => value.replace(/[^0-9]/g, '').slice(0, 6);

/** 가장 이른 만료 시각에 다시 그려 만료된 사본을 치운다 */
function useExpiryTick(copies) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const times = (copies ?? []).map((c) => parseInstantMs(c.expiresAt)).filter((ms) => ms !== null);
    if (times.length === 0) return undefined;
    const delay = Math.min(...times) - Date.now();
    const timer = window.setTimeout(() => setTick((n) => n + 1), Math.min(Math.max(delay + 1000, 1000), MAX_TIMER_MS));
    return () => window.clearTimeout(timer);
  }, [copies]);
}

function PinForm({ fragment, onOpened }) {
  const { t } = useLang();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lock, setLock] = useState({ fragment: null, locked: false, lockedUntil: null });

  // 이 링크가 이 기기에서 잠겨 있는지 — 잠금이 끝나는 시각에 다시 확인한다
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const check = () => {
      guardianLockout()
        .status(fragment)
        .then(
          (status) => {
            if (cancelled) return;
            setLock({ fragment, locked: status.locked, lockedUntil: status.lockedUntil });
            if (status.locked && typeof status.lockedUntil === 'number') {
              timer = window.setTimeout(check, Math.min(Math.max(status.lockedUntil - Date.now() + 500, 500), MAX_TIMER_MS));
            }
          },
          () => {
            if (!cancelled) setLock({ fragment, locked: false, lockedUntil: null });
          },
        );
    };
    check();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [fragment]);

  const locked = lock.fragment === fragment && lock.locked;
  const lockedView = locked ? guardianErrorView(new GuardianError(GUARDIAN_ERROR.LOCKED, 'locked', { lockedUntil: lock.lockedUntil })) : null;
  const shown = lockedView ?? error;

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || locked) return;
    if (!isValidPin(pin)) {
      setError(guardianErrorView(new GuardianError(GUARDIAN_ERROR.INVALID_PIN, 'pin')));
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let snapshot;
    try {
      snapshot = await unlockSnapshot(fragment, pin, { lockout: guardianLockout() });
    } catch (err) {
      const view = guardianErrorView(err);
      setPin('');
      setError(view);
      if (view.locked) {
        setLock({ fragment, locked: true, lockedUntil: err?.lockedUntil ?? null });
      }
      if (DEAD_LINK_CODES.has(err?.code)) getStore().clearPendingGuardianLink();
      setBusy(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setPin('');
    setBusy(false);
    await onOpened(snapshot);
  }

  return (
    <section className="guardian-section guardian-pin-card" aria-labelledby="guardian-pin-entry-title">
      <h2 id="guardian-pin-entry-title">{t('guardian.pinEntryTitle')}</h2>
      <form onSubmit={onSubmit} noValidate aria-busy={busy}>
        <div className="field">
          <label htmlFor={inputId}>{t('guardian.pinEntryLabel')}</label>
          <input
            id={inputId}
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            className="guardian-pin"
            value={pin}
            disabled={locked}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            aria-invalid={error && !error.locked ? 'true' : undefined}
            aria-describedby={shown ? errorId : undefined}
          />
        </div>
        <ErrorText id={errorId}>{shown ? t(shown.key, shown.vars) : null}</ErrorText>
        {/* 하단 고정 바(설계서 6.1): 열기는 하단 긴급 바 바로 위에 선다. 제출 버튼이라 form 안에 둔다 */}
        <div className="guardian-bar sticky-return is-flow">
          <Button type="submit" disabled={busy || locked}>
            {busy ? t('guardian.unlocking') : t('guardian.unlockButton')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function LoginNeeded({ fragment }) {
  const { t } = useLang();
  const [holdFailed, setHoldFailed] = useState(false);

  function onLogin(event) {
    if (holdFailed) return; // 두 번째 누름은 그대로 로그인으로 간다
    const held = getStore().holdPendingGuardianLink(fragment);
    if (!held?.ok) {
      event.preventDefault();
      setHoldFailed(true);
    }
  }

  return (
    <section className="guardian-section guardian-login" aria-labelledby="guardian-login-title">
      <h2 id="guardian-login-title">{t('guardian.loginNeededTitle')}</h2>
      <p>{t('guardian.loginNeededBody')}</p>
      {holdFailed && <WarningNote role="alert">{t('guardian.holdFailed')}</WarningNote>}
      <Button href={LOGIN_HREF} onClick={onLogin}>
        {t('guardian.loginButton')}
      </Button>
    </section>
  );
}

export default function GuardianOpen() {
  const { t, locale } = useLang();
  const hydrated = useHydrated();
  const status = useStoreStatus();
  const incoming = useIncomingLink();
  const copies = useStoreRecord('guardianCopies', readCopies) ?? NO_COPIES;
  const copyHeadingRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  /** 풀었지만 저장하지 못한 사본 — 이 화면에서만 보여 준다 */
  const [unsaved, setUnsaved] = useState(null);
  const [incomingId, setIncomingId] = useState({ fragment: null, id: null });

  useExpiryTick(copies);

  const fragment = incoming.fragment;
  const loggedIn = status.authenticated && !status.readOnly;
  const offline = status.reason === READ_ONLY_REASON.OFFLINE;

  // 로그인하지 않은 채 링크를 열었으면 로그인 왕복 동안 암호문을 탭 저장소에 둔다 (spec 4.11)
  useEffect(() => {
    if (!fragment || incoming.source !== 'hash' || status.authenticated) return;
    if (!status.sessionChecked && !offline) return;
    getStore().holdPendingGuardianLink(fragment);
  }, [fragment, incoming.source, status.authenticated, status.sessionChecked, offline]);

  // 이미 가져온 링크인지 — 같은 암호문이면 같은 사본 id 다
  useEffect(() => {
    if (!fragment) return undefined;
    let cancelled = false;
    copyIdFor(fragment).then(
      (id) => {
        if (cancelled) return;
        setIncomingId({ fragment, id });
        // 이미 가져온 링크면 그 사본을 고른다 — 주소를 정리한 뒤에도 그 사본이 보이게 한다
        if (getStore().readGuardianCopies().some((c) => c.id === id)) setSelectedId(id);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [fragment]);

  const knownId = fragment && incomingId.fragment === fragment ? incomingId.id : null;
  const alreadyImported = knownId !== null && copies.some((c) => c.id === knownId);

  // 이미 가져온 링크면 PIN 없이 그 사본을 보여 주고, 임시 보관과 주소의 암호문을 치운다
  useEffect(() => {
    if (!alreadyImported) return;
    getStore().clearPendingGuardianLink();
    stripLinkFromAddress();
    notifyIncomingLink();
  }, [alreadyImported]);

  async function onOpened(snapshot) {
    const id = await copyIdFor(fragment);
    const saved = getStore().writeGuardianCopy(id, {
      snapshot,
      importedAt: new Date().toISOString(),
      expiresAt: snapshot.expiresAt,
    });
    // 가져오기가 끝났다 — 임시 보관과 주소의 암호문을 지운다 (spec 4.11 · 규칙 38)
    getStore().clearPendingGuardianLink();
    stripLinkFromAddress();
    setSelectedId(id);
    setUnsaved(saved?.ok ? null : { id, snapshot });
    notifyIncomingLink();
    window.requestAnimationFrame(() => copyHeadingRef.current?.focus());
  }

  const pickId = alreadyImported ? knownId : selectedId;
  const current = unsaved ?? copies.find((c) => c.id === pickId) ?? copies[0] ?? null;
  const others = copies.filter((c) => c.id !== current?.id);
  const showIncoming = !alreadyImported && (incoming.invalid || Boolean(fragment));

  let incomingPart = null;
  if (showIncoming) {
    if (incoming.invalid) {
      incomingPart = <ErrorText>{t('guardian.errInvalidLink')}</ErrorText>;
    } else if (loggedIn) {
      incomingPart = <PinForm key={fragment} fragment={fragment} onOpened={onOpened} />;
    } else if (offline) {
      incomingPart = <WarningNote role="status">{t('guardian.offlineImport')}</WarningNote>;
    } else if (!status.sessionChecked) {
      incomingPart = (
        <p className="guardian-meta" role="status">
          {t('guardian.checking')}
        </p>
      );
    } else {
      incomingPart = <LoginNeeded fragment={fragment} />;
    }
  }

  let body;
  if (!hydrated || !incoming.ready) {
    body = (
      <p className="guardian-meta" role="status">
        {t('guardian.loading')}
      </p>
    );
  } else {
    body = (
      <>
        {incomingPart}
        {current && (
          <GuardianCopyView
            snapshot={current.snapshot}
            headingRef={copyHeadingRef}
            notice={unsaved ? <WarningNote>{t('guardian.errSaveFailed')}</WarningNote> : null}
          />
        )}
        {others.length > 0 && (
          <section className="guardian-section guardian-others" aria-labelledby="guardian-others-title">
            <h2 id="guardian-others-title">{t('guardian.otherCopies')}</h2>
            <ul className="guardian-other-list">
              {others.map((copy) => {
                const stamp = kstStamp(copy.snapshot?.createdAt, locale);
                return (
                  <li key={copy.id}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setUnsaved(null);
                        setSelectedId(copy.id);
                        window.requestAnimationFrame(() => copyHeadingRef.current?.focus());
                      }}
                    >
                      {t('guardian.showCopy', { asOf: stamp ? t('guardian.asOf', stamp) : copy.id.slice(0, 8) })}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {!current && !showIncoming && (
          <EmptyState icon="navToday" title={t('guardian.noLinkTitle')} body={t('guardian.noLinkBody')} />
        )}
      </>
    );
  }

  return (
    <>
      <TopBar title={t('guardian.openTitle')} />
      <main className="page guardian-page">
        <p className="guardian-lead">{t('guardian.openLead')}</p>
        {body}
      </main>
    </>
  );
}
