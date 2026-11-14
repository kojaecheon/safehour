'use client';

// '돌아왔어요'와 되돌리기 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 9, D10)
//
//   <ReturnedConfirm day={day} outing={outing} passedBy={returnBy} />
//
// - 서버 알림 스위치가 켜져 있고(GET /api/push/config, 읽지 못하면 꺼짐) 지켜보기가 켜져(ON) 있으며 그 외출의 확인할
//   마감(backTargetOf)이 있을 때만 그린다. 아니면 아무것도 그리지 않는다(스위치가 꺼져 있거나 지켜보기가 없는 기기의 화면은
//   예전과 같다). 갈아 끼움 직후에는 실패 줄만 그린다(lineOnly). 이 기기에 지켜보기 레코드가 없으면 스위치도 묻지 않는다
//   (스위치가 꺼진 채 쓰는 기기에서 요청이 늘지 않게).
// - 누르면 확인 신호만 보낸다. 시트를 닫지 않고 일정을 바꾸지 않는다(다르게 정한 것 11). 앱은 환자가 돌아왔는지 판단하지 않는다.
// - 표시 규칙은 returnedView.js 하나다. 줄은 안전 문구라 주 언어와 병기 언어 두 줄이고 감싸는 요소가 role="status" 다.
// - 지금 시각은 useKstClock 의 분으로 만든다. SENT 면 되돌리기 마감에 한 번 다시 그려 되돌리기가 마감을 넘겨 남지 않게 한다.
// - 버튼이 사라질 때 포커스를 잃지 않게 누른 뒤 상태 줄로 옮긴다.
// - watchId·쓰기 토큰·날짜·시각을 기록하지 않는다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button } from '@/components/ui/index.js';
import useKstClock from '@/components/trip/useKstClock.js';
import { useGuardianWatch, useReturnedConfirm, useServerPushConfig } from '@/lib/trip/useWatch.js';
import { BACK_PHASE } from '@/lib/trip/watchSync.js';
import { fromMinutes, kstInstantMs } from '@/src/stay/time.js';
import { returnedView } from './returnedView.js';

/** 되돌리기 마감 뒤 다시 그릴 때까지 더 기다리는 폭 */
const UNDO_REDRAW_SLACK_MS = 50;
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * @param {object} props
 * @param {object|null} props.day        외출이 속한 DayPlan
 * @param {object|null} props.outing     그날의 환자 외출
 * @param {string|null} [props.passedBy] 마감 지남 시트의 지난 마감(있으면 그 마감을 확인한다)
 * @param {string} [props.className]
 */
export default function ReturnedConfirm(props) {
  const watch = useGuardianWatch();
  if (watch.state === 'NONE') return null;
  return <WatchedConfirm {...props} />;
}

function WatchedConfirm({ day, outing, passedBy = null, className = '' }) {
  const { t, pair } = useLang();
  const config = useServerPushConfig();
  const clock = useKstClock();
  const statusId = useId();
  const statusRef = useRef(null);
  // 되돌리기 마감 타이머가 다시 그릴 때 쓰는 시각(분 단위 시계보다 늦지 않게 둘 중 큰 값을 쓴다)
  const [timerNowMs, setTimerNowMs] = useState(0);
  const clockMs = clock ? kstInstantMs(clock.date, fromMinutes(clock.minutes)) : Number.NaN;
  const nowMs = Number.isFinite(clockMs) ? Math.max(clockMs, timerNowMs) : Number.NaN;
  const back = useReturnedConfirm({ day, outing, passedBy, nowMs });
  const { phase, undoUntilMs } = back;

  useEffect(() => {
    if (phase !== BACK_PHASE.SENT || !Number.isFinite(undoUntilMs)) return undefined;
    const wait = Math.min(Math.max(undoUntilMs - Date.now(), 0) + UNDO_REDRAW_SLACK_MS, MAX_TIMER_MS);
    const id = window.setTimeout(() => setTimerNowMs(Date.now()), wait);
    return () => window.clearTimeout(id);
  }, [phase, undoUntilMs]);

  if (!config.enabled || !back.visible) return null;
  const view = returnedView({ phase, nowMs, undoUntilMs, lineOnly: back.lineOnly });
  const line = view.lineKey ? pair(view.lineKey) : null;

  function press() {
    back.press();
    statusRef.current?.focus();
  }

  function undo() {
    back.undo();
    statusRef.current?.focus();
  }

  return (
    <div className={`trip-back ${className}`.trim()}>
      <div id={statusId} ref={statusRef} className="trip-back-status" role="status" aria-busy={view.busy || undefined} tabIndex={-1}>
        {line && (
          <>
            <p lang={line.primary.lang}>{line.primary.text}</p>
            <p className="trip-pair-secondary" lang={line.secondary.lang}>
              {line.secondary.text}
            </p>
          </>
        )}
      </div>
      {view.button && (
        <Button variant="secondary" icon="check" aria-describedby={statusId} onClick={press}>
          {t('return.back')}
        </Button>
      )}
      {view.undo && (
        <Button variant="quiet" onClick={undo}>
          {t('return.backUndo')}
        </Button>
      )}
    </div>
  );
}
