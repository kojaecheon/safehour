'use client';

// 이 기기에서 내 정보 지우기 (AX-210 → AX-318 · spec 4.19 · 규칙 41)
//
// 기기 저장소의 deleteAllMyData() 를 부른다 — `safehour.v2.` 아래를 언어만 빼고 모두 지우고
// (모든 계정 이름공간, 보호자 사본, 알림 예약, AI 문장 캐시, 언어 외 설정, 예전 탭 저장 키), 로그아웃한다.
// 보기 전용(로그인 만료·오프라인)에서도 동작한다.
//
//   - 되돌릴 수 없으므로 한 번 확인한다. (확인 버튼은 긴급 빨강. quietConfirm 이면 회색: 시작 화면 하단 고지는
//     긴급·시작하기 두 채운 버튼이 늘 보여 빨강을 긴급에만 남긴다, 운영자 결정 2026-10-20)
//   - 로그아웃까지 끝나면(기본) **전체 새로고침**으로 시작 화면에 간다 — React 메모리 사본까지 버리고,
//     시작 화면이 삭제 안내를 한 번 띄운다(lib/session.js 의 삭제 표시).
//   - 로그아웃이 서버에 닿지 못했으면(오프라인) 이 자리에 결과를 남긴다: 기기 삭제는 끝났고,
//     로그아웃은 인터넷에 연결되면 마무리된다(저장소가 온라인이 되면 다시 보낸다). 그동안 로그인으로 보지 않는다.
//   - stayOnPage(설정 화면)면 로그아웃까지 끝나도 이동하지 않고 결과를 보여준다.

import { useState } from 'react';
import { deleteAllMyData } from '@/lib/store/index.js';
import { clearSafeHourSession } from '@/lib/session.js';
import { useLang } from './LanguageProvider.js';
import useStoreStatus from './ui/useStoreStatus.js';

/**
 * 시작 화면으로 전체 새로고침. 삭제 안내를 한 번 띄우도록 표시한다.
 * 라우터 이동이 아니라 전체 새로고침이어야 React 메모리 사본까지 버려진다. 절대 주소로 가면
 * next/no-location-assign-relative-destination 규칙(상대 경로 assign 경고)에 걸리지 않는다.
 */
function goHome() {
  clearSafeHourSession();
  window.location.assign(new URL('/', window.location.origin).href);
}

/**
 * @param {{ stayOnPage?: boolean, quietConfirm?: boolean }} props
 */
export default function ClearSessionButton({ stayOnPage = false, quietConfirm = false }) {
  const { t } = useLang();
  const status = useStoreStatus();
  /** 'idle' | 'confirm' | 'working' | 'done' */
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);

  async function handleClear() {
    setPhase('working');
    let outcome;
    try {
      outcome = await deleteAllMyData();
    } catch {
      outcome = { ok: false, removed: 0, loggedOut: false };
    }
    if (!stayOnPage && outcome.ok && outcome.loggedOut) {
      // router.push 는 클라이언트 상태를 유지하므로 쓰지 않는다
      goHome();
      return;
    }
    setResult(outcome);
    setPhase('done');
  }

  return (
    <div className={stayOnPage ? 'clear-session settings-clear' : 'clear-session'}>
      {(phase === 'idle' || (phase === 'done' && result && !result.ok)) && (
        <>
          <button
            type="button"
            className={stayOnPage ? 'btn btn-secondary' : 'link-button'}
            onClick={() => setPhase('confirm')}
          >
            {t('clear.cta')}
          </button>
          <p className="settings-clear-note">{t('clear.note')}</p>
        </>
      )}

      {(phase === 'confirm' || phase === 'working') && (
        <div role="group" aria-label={t('clear.cta')}>
          <p role="alert" className="settings-clear-question">
            {t('clear.question')}
          </p>
          <div className="settings-clear-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={phase === 'working'}
              onClick={() => setPhase('idle')}
            >
              {t('clear.cancel')}
            </button>
            <button
              type="button"
              className={quietConfirm ? 'btn btn-secondary btn-small' : 'btn btn-critical btn-small'}
              disabled={phase === 'working'}
              onClick={handleClear}
            >
              {phase === 'working' ? t('clear.working') : t('clear.confirm')}
            </button>
          </div>
        </div>
      )}

      {/* 결과 자리는 늘 DOM 에 둔다 — 바뀌면 스크린리더가 읽는다 */}
      <div role="status" className="settings-clear-result">
        {phase === 'done' && result && (
          <>
            <p>{result.ok ? t('clear.done', { count: result.removed }) : t('clear.partial')}</p>
            {result.ok && <p>{status.logoutPending ? t('clear.logoutPending') : t('clear.loggedOut')}</p>}
          </>
        )}
      </div>
      {phase === 'done' && result?.ok && (
        <button type="button" className="btn btn-secondary btn-small" onClick={goHome}>
          {t('clear.goHome')}
        </button>
      )}
    </div>
  );
}
