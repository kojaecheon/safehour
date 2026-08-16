'use client';

// SCR008 — 즉시 복귀 안내
// 경로 API 승인 전이므로 지도 연결 대신 기준점 좌표 복사 + 병원 연락 안내를 제공한다 (D04-F012 BLOCKED).
//
// 복귀 지시는 안전 문구다. 한국어 화면에서도 영문을 병기해 언어를 바꾸지 못한
// 사용자가 지시를 놓치지 않게 한다 (AX-209).

import { useState } from 'react';
import { fmtTime } from '@/lib/format.js';
import { useModalSheet } from '@/lib/useModalSheet.js';
import { useLang } from './LanguageProvider.js';
import { translate } from '@/src/i18n/index.js';

export default function ReturnSheet({ origin, returnBy, latestDepartureAt, onClose }) {
  const { lang, t, locale } = useLang();
  const [copyState, setCopyState] = useState('idle'); // idle | ok | fail
  // 즉시 복귀는 안전 지시다. 뒤로가기로 페이지를 떠나 지시를 잃지 않도록
  // 모든 닫기가 같은 경로(requestClose)를 거친다 (ADR-0001 보완 조건 3)
  const { sheetRef, requestClose } = useModalSheet(onClose);

  const otherLang = lang === 'ko' ? 'en' : 'ko';

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${origin.lat}, ${origin.lng}`);
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="return-sheet-h">
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <h2 id="return-sheet-h">{t('return.title')}</h2>
        <p lang={otherLang} style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
          {translate('return.title', otherLang)} — {translate('return.body', otherLang)}
        </p>
        <p style={{ marginTop: 6, marginBottom: 14 }}>{t('return.body')}</p>

        <div className="card" style={{ marginBottom: 10 }}>
          <h3>{origin.label}</h3>
          <p style={{ fontSize: 14 }}>{t('return.coords', { lat: origin.lat, lng: origin.lng })}</p>
          <div className="meta" style={{ marginTop: 8 }}>
            {returnBy && <span>{t('return.deadline', { time: fmtTime(returnBy, locale) })}</span>}
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={copyCoords}>
          {t('return.copyCta')}
        </button>
        <p role="status" style={{ fontSize: 14, marginTop: 6, minHeight: 20 }}>
          {copyState === 'ok' && t('return.copyOk')}
          {copyState === 'fail' && t('return.copyFail')}
        </p>

        <p className="source-note" style={{ marginTop: 8 }}>
          {t('return.note')}
        </p>

        <button type="button" className="btn" style={{ marginTop: 4 }} onClick={requestClose}>
          {t('common.confirm')}
        </button>
      </div>
    </div>
  );
}
