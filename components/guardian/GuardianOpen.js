'use client';

// 보호자 링크 열기, /g (AX-320 · docs/business-rules.md '보호자', docs/platform/IA_AND_FLOWS.md '보기 전용 상태', docs/security.md '보호자 링크'·'기기 저장소와 계정 이름공간')
//
// 흐름
//   1. 암호문은 주소의 # 뒤에서만 읽는다(브라우저가 # 뒤를 서버로 보내지 않는다). 이 화면은 암호문을 어떤 요청에도 싣지 않는다.
//   2. 모든 사용에 로그인이 필요하다. 로그인하지 않았으면 암호문을 **탭 저장소에 임시로** 두고(최대 1시간),
//      /login?returnTo=/g 로 보낸다. 돌아오면 임시 보관에서 이어서 가져온다.
//   3. PIN 입력 — 기기 단위 잠금(5회 연속 오류 → 1시간). 잠금 기록 키는 safehour.v2. 아래라 '내 정보 지우기'가 함께 지운다.
//   4. 풀리면 사본을 기기에 저장하고, 임시 보관을 지우고, 주소에서 # 뒤를 지운다.
//   5. 저장한 사본은 로그인 만료·오프라인에서도 보기 전용으로 보여 준다. 만료된 사본은 저장소가 지우고 보여 주지 않는다.
//   6. 받은 링크 붙여넣기(PasteLink, 계획 2026-11-15 A-3 Task 6): 붙여 넣은 링크를 1의 임시 보관에 넣고 같은 흐름을 탄다.
//      사본도 여는 중인 링크도 없으면 펼치고, 그 밖에는 접어 둔다. 여는 중인 링크(로그인·PIN 단계)가 있어도 숨기지 않는다:
//      PIN 입력·로그인 안내에는 취소가 없어서, 예전 링크를 붙여 넣은 보호자가 1시간 보관이 끝나기 전에 맞는 링크로 바꿀 길이
//      이 절뿐이다. 새 링크를 받아들이면 임시 보관이 바뀌고 PIN 입력이 새 링크로 다시 시작한다(PIN 잠금은 링크마다 따로다).

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, TopBar, useStoreStatus } from '@/components/ui/index.js';
import { READ_ONLY_REASON, getStore } from '@/lib/store/index.js';
import { GUARDIAN_ERROR, GuardianError, isValidPin, unlockSnapshot } from '@/src/guardian/index.js';
import { copyIdFor, guardianErrorView } from './errorView.js';
import { MAX_TIMER_MS, guardianExpiryDelay } from './expiry.js';
import AlertsToggle from './AlertsToggle.js';
import { ErrorText, WarningNote } from './Feedback.js';
import GuardianCopyView, { kstStamp } from './GuardianCopyView.js';
import PasteLink from './PasteLink.js';
import { INCOMING_STATUS_ID, LOGIN_TITLE_ID, PIN_ENTRY_TITLE_ID, pasteDefaultOpen, pasteFocusTarget } from './pasteView.js';
import {
  guardianLockout,
  notifyIncomingLink,
  stripLinkFromAddress,
  useHydrated,
  useIncomingLink,
  useStoreRecord,
} from './hooks.js';

const LOGIN_HREF = `/login?returnTo=${encodeURIComponent('/g')}`;
const readCopies = (store) => store.readGuardianCopies();
const NO_COPIES = Object.freeze([]);
/** 더 이상 쓸 수 없는 링크 — 임시 보관을 지운다 */
const DEAD_LINK_CODES = new Set([GUARDIAN_ERROR.EXPIRED, GUARDIAN_ERROR.INVALID_LINK, GUARDIAN_ERROR.INVALID_SNAPSHOT]);
const onlyDigits = (value) => value.replace(/[^0-9]/g, '').slice(0, 6);

/**
 * 임시 보관이 이 암호문일 때만 지운다. 풀리기를 기다리는 사이 붙여 넣어 바뀐 다른 링크는 남긴다(그 링크로 이어서 연다)
 * @param {string} fragment
 */
function clearPendingIfHeld(fragment) {
  const store = getStore();
  if (store.takePendingGuardianLink() === fragment) store.clearPendingGuardianLink();
}

/** 가장 이른 만료 시각에 다시 그려 만료된 사본을 치운다 */
function useExpiryTick(copies) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const delay = guardianExpiryDelay(copies ?? [], Date.now());
    if (delay === null) return undefined;
    const timer = window.setTimeout(() => setTick((n) => n + 1), delay);
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
      if (DEAD_LINK_CODES.has(err?.code)) clearPendingIfHeld(fragment);
      setBusy(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setPin('');
    setBusy(false);
    await onOpened(snapshot);
  }

  return (
    <section className="guardian-section guardian-pin-card" aria-labelledby={PIN_ENTRY_TITLE_ID}>
      <h2 id={PIN_ENTRY_TITLE_ID} tabIndex={-1}>
        {t('guardian.pinEntryTitle')}
      </h2>
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
    <section className="guardian-section guardian-login" aria-labelledby={LOGIN_TITLE_ID}>
      <h2 id={LOGIN_TITLE_ID} tabIndex={-1}>
        {t('guardian.loginNeededTitle')}
      </h2>
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
  /** 방금 붙여 넣어 받아들인 암호문: 이미 가져온 링크로 밝혀지면 사본 제목으로 포커스를 옮기고 비운다 */
  const pastedRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  /** 풀었지만 저장하지 못한 사본 — 이 화면에서만 보여 준다 */
  const [unsaved, setUnsaved] = useState(null);
  const [incomingId, setIncomingId] = useState({ fragment: null, id: null });

  useExpiryTick(copies);

  const fragment = incoming.fragment;
  const loggedIn = status.authenticated && !status.readOnly;
  const offline = status.reason === READ_ONLY_REASON.OFFLINE;

  // 로그인하지 않은 채 링크를 열었으면 로그인 왕복 동안 암호문을 탭 저장소에 둔다 (docs/security.md '기기 저장소와 계정 이름공간')
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
        if (!cancelled) setIncomingId({ fragment, id });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [fragment]);

  const knownId = fragment && incomingId.fragment === fragment ? incomingId.id : null;
  const alreadyImported = knownId !== null && copies.some((c) => c.id === knownId);

  // 이미 가져온 링크면 그 사본을 고른다: 아래 효과가 주소·임시 보관을 정리한 뒤에도 그 사본이 보이게 한다.
  // 그리는 중에 맞춘다(효과 안 setState 는 쓰지 않는다). 같은 링크를 다시 열거나 붙여 넣으면 사본 id 를 앞서 구한 값
  // (incomingId)으로 바로 알아 copyIdFor 효과가 끝나기 전에 정리가 끝난다. 그사이 다른 사본을 골랐어도 이 사본으로 바꾼다
  if (alreadyImported && selectedId !== knownId) setSelectedId(knownId);

  // 이미 가져온 링크면 PIN 없이 그 사본을 보여 주고, 임시 보관과 주소의 암호문을 치운다
  useEffect(() => {
    if (!alreadyImported) return;
    getStore().clearPendingGuardianLink();
    stripLinkFromAddress();
    notifyIncomingLink();
    // 붙여 넣은 링크였으면 잠깐 보였던 단계(PIN 입력 등)가 사라지므로 그 사본 제목으로 포커스를 옮긴다
    if (pastedRef.current === fragment) {
      pastedRef.current = null;
      window.requestAnimationFrame(() => copyHeadingRef.current?.focus());
    }
  }, [alreadyImported, fragment]);

  async function onOpened(snapshot) {
    const id = await copyIdFor(fragment);
    const saved = getStore().writeGuardianCopy(id, {
      snapshot,
      importedAt: new Date().toISOString(),
      expiresAt: snapshot.expiresAt,
    });
    // 가져오기가 끝났다: 임시 보관과 주소의 암호문을 지운다 (docs/security.md '기기 저장소와 계정 이름공간'·'보호자 링크').
    // 임시 보관은 방금 푼 링크일 때만 지운다
    clearPendingIfHeld(fragment);
    stripLinkFromAddress();
    setSelectedId(id);
    setUnsaved(saved?.ok ? null : { id, snapshot });
    notifyIncomingLink();
    window.requestAnimationFrame(() => copyHeadingRef.current?.focus());
  }

  // 붙여 넣은 링크를 받아들이면 붙여넣기 절이 접혀 누른 '링크 열기'가 가려진다: 이어지는 단계로 포커스를 옮긴다.
  // 순서(pasteView.js PASTE_FOCUS_ORDER): PIN 입력 제목, 로그인 안내 제목, 상태 줄(오프라인 안내·로그인 확인 중), 사본 제목.
  // 이미 가져온 링크면 그 사실을 안 뒤(위 alreadyImported 효과) 사본 제목으로 다시 옮긴다
  function onPasteAccepted(pasted) {
    pastedRef.current = pasted;
    window.requestAnimationFrame(() => {
      pasteFocusTarget((id) => document.getElementById(id), copyHeadingRef.current)?.focus();
    });
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
      incomingPart = (
        <WarningNote id={INCOMING_STATUS_ID} tabIndex={-1} role="status">
          {t('guardian.offlineImport')}
        </WarningNote>
      );
    } else if (!status.sessionChecked) {
      incomingPart = (
        <p id={INCOMING_STATUS_ID} tabIndex={-1} className="guardian-meta" role="status">
          {t('guardian.checking')}
        </p>
      );
    } else {
      incomingPart = <LoginNeeded key={fragment} fragment={fragment} />;
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
            alerts={<AlertsToggle />}
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
        <PasteLink
          defaultOpen={pasteDefaultOpen({ hasCopy: Boolean(current), showIncoming, invalid: incoming.invalid })}
          onAccepted={onPasteAccepted}
        />
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
