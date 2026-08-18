'use client';

// 내 정보 지우기 (AX-210 · SIGNOFF_CHECKLIST 2.4)
//
// 서버는 저장하지 않지만 단말에는 병원 조건이 남는다. 공용 기기나 동반자와
// 함께 쓰는 폰에서 그것을 지울 수단이 필요하다.
//
//   - 되돌릴 수 없으므로 한 번 확인한다.
//   - 삭제 후에는 **전체 새로고침**으로 이동한다 — React 메모리에 남은 조건 사본까지 버린다.

import { useState } from 'react';
import { clearSafeHourSession } from '@/lib/session.js';
import { useLang } from './LanguageProvider.js';

export default function ClearSessionButton() {
  const { t } = useLang();
  const [confirming, setConfirming] = useState(false);

  async function handleClear() {
    clearSafeHourSession();
    // 로그인 쿠키는 httpOnly 라 클라이언트가 지울 수 없다 — 서버에 지워달라고 해야
    // "내 정보를 지웠다" 가 사실이 된다 (AX-219). 실패해도 단말 삭제는 이미 끝났다.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 네트워크가 끊겨도 이동은 진행한다
    }
    // router.push 는 클라이언트 상태를 유지하므로 쓰지 않는다.
    window.location.href = '/';
  }

  if (!confirming) {
    return (
      <div className="clear-session">
        <button type="button" className="link-button" onClick={() => setConfirming(true)}>
          {t('clear.cta')}
        </button>
        <p className="hint">{t('clear.note')}</p>
      </div>
    );
  }

  return (
    <div className="clear-session" role="group" aria-label={t('clear.cta')}>
      <p role="alert" style={{ fontSize: 14 }}>
        {t('clear.question')}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          style={{ flex: 1 }}
          onClick={() => setConfirming(false)}
        >
          {t('clear.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          style={{ flex: 1 }}
          onClick={handleClear}
        >
          {t('clear.confirm')}
        </button>
      </div>
    </div>
  );
}
