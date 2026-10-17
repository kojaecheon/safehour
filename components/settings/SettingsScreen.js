'use client';

// 설정 화면 본문 (AX-318 · spec 4.13 설정 UI · 4.17 · 4.19)
//
//   언어 · 알림 · 민감정보 동의 철회 · 이 기기에서 내 정보 지우기
//
// - 언어: 기기 기록(writeLang)이라 보기 전용에서도 바꿀 수 있고, 내 정보를 지워도 남는다(useLang().setLang).
// - 알림: **권한은 사용자가 여기서 켤 때만 요청한다.** 켜기 전·끄기·보기 전용에서는 요청하지 않는다.
//   권한이 없으면 켜짐을 저장하지 않는다. "앱이 완전히 닫혀 있으면 알림을 받지 못할 수 있습니다"를 늘 보여준다.
//   알림을 실제로 보내는 일은 알림 모듈(T16b)이 Prefs.notifications 를 읽어 한다.
// - 동의 철회: 확인 시트에서 효과를 먼저 알린 뒤 lib/store withdrawSensitiveConsent() 를 부른다
//   (SELF 기간·연동 지침 사본·연결 코드 삭제). 재계획은 저장소 구독자(일정 작업)가 한다.
// - 내 정보 지우기: ClearSessionButton(stayOnPage) — 결과와 로그아웃 보류 여부를 이 자리에 보여준다.
// - 보기 전용이면 알림·동의 철회를 막는다(저장소도 READ_ONLY 로 거절한다). 지우기와 언어는 된다.
// - SEED ③층(설계서 6.2 12번): 회색 바탕 위 흰 블록. 언어(Radio 행) / 알림(Switch 행 + 안내) / 민감정보 동의 / 내 정보.

import { useState } from 'react';
import Link from 'next/link';
import { getStore } from '@/lib/store/index.js';
import { LANGS, LANG_NAMES } from '@/src/i18n/index.js';
import ClearSessionButton from '../ClearSessionButton.js';
import { useLang } from '../LanguageProvider.js';
import { Button, Icon, Sheet } from '../ui/index.js';
import useStoreStatus, { shouldShowReadOnly } from '../ui/useStoreStatus.js';
import { useHydrated, usePrefs, useStay } from '../cards/useDeviceData.js';
import PairText from './PairText.js';

const NOTIFY_MESSAGE = Object.freeze({
  on: 'settings.notifyOn',
  off: 'settings.notifyOff',
  unsupported: 'settings.notifyUnsupported',
  denied: 'settings.notifyDenied',
  failed: 'settings.saveFailed',
});

const DISCLOSURE_KEY = 'settings.notifyDisclosure';
const CONSENT_EFFECT_INTRO_KEY = 'settings.consentEffectIntro';
const CONSENT_EFFECT_KEYS = Object.freeze(['settings.consentEffect1', 'settings.consentEffect2', 'settings.consentEffect3']);

function formatDate(iso, locale) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Date(ms).toLocaleDateString(locale, { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function LanguageSection({ inert }) {
  const { t, lang, setLang } = useLang();
  return (
    <section className="ui-block settings-section" aria-labelledby="settings-lang-title" inert={inert}>
      <h2 id="settings-lang-title">{t('settings.langTitle')}</h2>
      <fieldset className="settings-fieldset">
        <legend className="visually-hidden">{t('settings.langTitle')}</legend>
        <div className="radio-group settings-radio-rows">
          {LANGS.map((code) => (
            <label key={code} className={lang === code ? 'radio-option selected' : 'radio-option'}>
              <input
                type="radio"
                name="settings-lang"
                value={code}
                checked={lang === code}
                onChange={() => setLang(code)}
              />
              <span lang={code}>{LANG_NAMES[code]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="settings-text">{t('settings.langHint')}</p>
    </section>
  );
}

function NotificationSection({ readOnly, showReadOnly, inert }) {
  const { t } = useLang();
  const prefs = usePrefs();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const on = prefs?.notifications === true;

  async function turnOn() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setMessage('unsupported');
      return;
    }
    let permission = window.Notification.permission;
    if (permission === 'default') {
      // 권한 요청은 이 한 곳 — 사용자가 켜기를 눌렀을 때만
      try {
        permission = await window.Notification.requestPermission();
      } catch {
        permission = 'denied';
      }
    }
    if (permission !== 'granted') {
      setMessage('denied');
      return;
    }
    setMessage(getStore().writePrefs({ notifications: true }).ok ? 'on' : 'failed');
  }

  async function onChange(event) {
    if (readOnly || busy) return;
    const want = event.target.checked;
    setBusy(true);
    try {
      if (want) await turnOn();
      else setMessage(getStore().writePrefs({ notifications: false }).ok ? 'off' : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-block settings-section" aria-labelledby="settings-notify-title" inert={inert}>
      <h2 id="settings-notify-title">{t('settings.notifyTitle')}</h2>
      <label className="toggle-row settings-toggle">
        <span className="label">
          {t('settings.notifyToggle')}
          <span className="settings-toggle-hint">{t('settings.notifyHint')}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          checked={on}
          disabled={readOnly || busy || prefs === null}
          onChange={onChange}
        />
      </label>
      <div role="status" className="settings-status">
        {message && <p>{t(NOTIFY_MESSAGE[message])}</p>}
      </div>
      {showReadOnly && <p className="settings-text">{t('settings.readOnlyNote')}</p>}
      <div className="settings-disclosure" role="note">
        <span className="settings-disclosure-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <PairText k={DISCLOSURE_KEY} />
      </div>
    </section>
  );
}

function ConsentSection({ readOnly, showReadOnly, sheetOpen, setSheetOpen }) {
  const { t, locale } = useLang();
  const stay = useStay();
  const hydrated = useHydrated();
  const [outcome, setOutcome] = useState(null);
  const sensitive = stay?.consent?.sensitive ?? null;
  const agreed = Boolean(sensitive?.agreedAt);

  function withdraw(requestClose) {
    const result = getStore().withdrawSensitiveConsent();
    setOutcome(
      result.ok
        ? { ok: true, periods: result.removedPeriods ?? 0, plans: result.removedLinkedPlans ?? 0 }
        : { ok: false },
    );
    requestClose();
  }

  return (
    <section className="ui-block settings-section" aria-labelledby="settings-consent-title">
      <h2 id="settings-consent-title">{t('settings.consentTitle')}</h2>
      {hydrated && (
        <p className="settings-text">
          {agreed
            ? t('settings.consentAgreed', { date: formatDate(sensitive.agreedAt, locale) })
            : t('settings.consentNone')}
        </p>
      )}
      <Button variant="secondary" disabled={!agreed || readOnly} onClick={() => setSheetOpen(true)}>
        {t('settings.consentWithdraw')}
      </Button>
      {showReadOnly && <p className="settings-text">{t('settings.readOnlyNote')}</p>}
      <div role="status" className="settings-status">
        {outcome &&
          (outcome.ok ? (
            <p>{t('settings.consentDone', { periods: outcome.periods, plans: outcome.plans })}</p>
          ) : (
            <p>{t('settings.consentFailed')}</p>
          ))}
      </div>
      {outcome?.ok && (
        <Link className="settings-link" href="/conditions">
          {t('settings.conditionsLink')}
        </Link>
      )}

      {sheetOpen && (
        <Sheet
          title={t('settings.consentSheetTitle')}
          onClose={() => setSheetOpen(false)}
          footer={({ requestClose }) => (
            <>
              <Button onClick={() => withdraw(requestClose)}>{t('settings.consentConfirm')}</Button>
              <Button variant="secondary" onClick={requestClose}>
                {t('settings.cancel')}
              </Button>
            </>
          )}
        >
          <PairText k={CONSENT_EFFECT_INTRO_KEY} />
          <ul className="settings-effects" role="list">
            {CONSENT_EFFECT_KEYS.map((key) => (
              <PairText key={key} k={key} as="li" />
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  );
}

export default function SettingsScreen() {
  const { t } = useLang();
  const status = useStoreStatus();
  const showReadOnly = shouldShowReadOnly(status);
  // 동의 철회 시트가 열려 있는 동안 다른 설정 묶음은 누를 수 없게 한다(시트 뒤 배경 — aria-modal 과 같은 뜻)
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <LanguageSection inert={sheetOpen} />
      <NotificationSection readOnly={status.readOnly} showReadOnly={showReadOnly} inert={sheetOpen} />
      <ConsentSection
        readOnly={status.readOnly}
        showReadOnly={showReadOnly}
        sheetOpen={sheetOpen}
        setSheetOpen={setSheetOpen}
      />
      <section className="ui-block settings-section" aria-labelledby="settings-data-title" inert={sheetOpen}>
        <h2 id="settings-data-title">{t('settings.dataTitle')}</h2>
        <ClearSessionButton stayOnPage />
      </section>
    </>
  );
}
