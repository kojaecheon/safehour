'use client';

// 설정의 '서버 알림' 절 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 10, D11·D13·D14)
//
//   상태 줄 · 서버 알림 끄기(확인 시트) · 서버에 남은 내 정보 지우기(확인 시트) · 결과 줄(role="status")
//   상태 줄은 스위치가 꺼졌다고 서버가 답했는데 이 기기의 지켜보기가 켜져 있으면 멈춰 있다는 안전 문구(병기)다.
//
// - 보이는 조건과 버튼을 누를 수 있는지는 serverPushView.js 하나가 정한다. 스위치가 꺼져 있고 이 기기에 지켜보기 레코드가
//   없으면 아무것도 그리지 않는다. 끄거나 지운 뒤 절이 숨을 조건이 되어도 결과 줄을 보일 동안은 그 줄만 남긴다.
// - 끄기는 확인 시트 뒤 실행기 retire()(동의 철회와 같은 모양, 화면 검토 M6), 서버 지우기는 확인 시트 뒤 removeAll()(로그인 계정의
//   지켜보기를 모두 지운다). 요청은 실행기가 보낸다. 끄기는 절을 그린 계정 키를 넘긴다(앞선 요청을 기다리는 사이 계정이 바뀌면
//   실행기가 끄지 않는다, A-3 검토). 두 시트는 하나씩만 열리고, 열린 시트는 설정 화면이 sheet 로 들고 있다.
//   시트가 열린 채 절이 숨거나(스위치 꺼짐, 다른 탭에서 레코드 지움) 끌 레코드가 사라지면, 또는 이 절이 사라지면 그 상태를 비운다
//   (serverPushOpenSheet). 남기면 다른 절이 inert 로 막힌 채 남는다.
// - 처리 중에는 누른 버튼을 disabled 대신 loading 으로 막아 포커스를 지킨다(Button 계약, 화면 검토 M8).
// - 보기 전용이면 두 버튼을 막고 다른 절과 같은 안내 줄(settings.offlineNote·settings.readOnlyNote)을 보인다.
// - 누른 버튼이 사라져도 포커스를 잃지 않게 결과 줄로 옮긴다.
// - watchId·쓰기 토큰을 화면에 보이거나 기록하지 않는다.

import { useEffect, useRef, useState } from 'react';
import { getWatchSync } from '@/lib/trip/client.js';
import { useGuardianWatch, useServerPushConfig } from '@/lib/trip/useWatch.js';
import { useLang } from '../LanguageProvider.js';
import { Button, Sheet } from '../ui/index.js';
import PairText from './PairText.js';
import { serverPushOpenSheet, serverPushRemoveResult, serverPushSectionView, serverPushTurnOffResult } from './serverPushView.js';

/**
 * @param {object} props
 * @param {{ readOnly: boolean, online: boolean, accountKey: string|null }} props.status  useStoreStatus() 값
 * @param {boolean} props.showReadOnly
 * @param {string} props.noteKey
 * @param {boolean} props.inert          다른 절의 시트가 열려 있으면 누를 수 없게 한다
 * @param {'turnOff'|'removeAll'|null} props.sheet   열린 확인 시트(끄기·서버 지우기), 없으면 null
 * @param {(sheet: 'turnOff'|'removeAll'|null) => void} props.setSheet
 */
export default function ServerPushSection({ status, showReadOnly, noteKey, inert, sheet, setSheet }) {
  const { t } = useLang();
  const config = useServerPushConfig();
  const watch = useGuardianWatch();
  const statusRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const view = serverPushSectionView({
    enabled: config.enabled,
    checked: config.checked,
    state: watch.state,
    readOnly: status.readOnly,
    online: status.online,
  });
  const exists = watch.state === 'ON' || watch.state === 'REPLACED';
  const openSheet = serverPushOpenSheet({ sheet, visible: view.visible, exists });

  // 절이 숨거나 끌 레코드가 사라지면 열린 시트 상태를 비운다(다른 절의 inert 를 푼다)
  useEffect(() => {
    if (sheet !== openSheet) setSheet(openSheet);
  }, [sheet, openSheet, setSheet]);
  useEffect(() => () => setSheet(null), [setSheet]);

  if (!view.visible && !outcome) return null;

  async function turnOff(requestClose) {
    if (busy || !view.canTurnOff) return;
    requestClose();
    setBusy('turnOff');
    let result = null;
    try {
      result = (await getWatchSync()?.retire({ accountKey: status.accountKey })) ?? null;
    } catch {
      result = null;
    } finally {
      setBusy(null);
    }
    setOutcome(serverPushTurnOffResult(result));
    statusRef.current?.focus();
  }

  async function removeAll(requestClose) {
    if (busy) return;
    requestClose();
    setBusy('removeAll');
    let result = null;
    try {
      result = (await getWatchSync()?.removeAll()) ?? null;
    } catch {
      result = null;
    } finally {
      setBusy(null);
    }
    setOutcome({ ...serverPushRemoveResult(result), pair: false });
    statusRef.current?.focus();
  }

  return (
    <section className="ui-block settings-section settings-push" aria-labelledby="settings-push-title" inert={inert}>
      <h2 id="settings-push-title">{t('settings.serverPushTitle')}</h2>
      {view.visible && (view.statePair ? <PairText k={view.stateKey} className="settings-text" /> : <p className="settings-text">{t(view.stateKey)}</p>)}
      {view.visible && (
        <div className="settings-push-actions">
          {exists && (
            <Button
              variant="secondary"
              disabled={!view.canTurnOff || (busy !== null && busy !== 'turnOff')}
              loading={busy === 'turnOff'}
              onClick={() => setSheet('turnOff')}
            >
              {t('settings.serverPushTurnOff')}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!view.canRemoveAll || (busy !== null && busy !== 'removeAll')}
            loading={busy === 'removeAll'}
            onClick={() => setSheet('removeAll')}
          >
            {t('settings.serverPushRemoveAll')}
          </Button>
        </div>
      )}
      {view.visible && showReadOnly && <p className="settings-text">{t(noteKey)}</p>}
      <div role="status" className="settings-status" ref={statusRef} tabIndex={-1}>
        {outcome && (outcome.pair ? <PairText k={outcome.key} /> : <p>{t(outcome.key, outcome.vars)}</p>)}
      </div>

      {openSheet === 'turnOff' && (
        <Sheet
          title={t('settings.serverPushTurnOffTitle')}
          onClose={() => setSheet(null)}
          footer={({ requestClose }) => (
            <>
              <Button variant="critical" onClick={() => turnOff(requestClose)}>
                {t('settings.serverPushTurnOff')}
              </Button>
              <Button variant="secondary" onClick={requestClose}>
                {t('settings.cancel')}
              </Button>
            </>
          )}
        >
          <PairText k={'settings.serverPushTurnOffBody'} />
        </Sheet>
      )}

      {openSheet === 'removeAll' && (
        <Sheet
          title={t('settings.serverPushRemoveAll')}
          onClose={() => setSheet(null)}
          footer={({ requestClose }) => (
            <>
              <Button variant="critical" onClick={() => removeAll(requestClose)}>
                {t('clear.confirm')}
              </Button>
              <Button variant="secondary" onClick={requestClose}>
                {t('settings.cancel')}
              </Button>
            </>
          )}
        >
          <p className="settings-text">{t('settings.serverPushRemoveConfirm')}</p>
        </Sheet>
      )}
    </section>
  );
}
