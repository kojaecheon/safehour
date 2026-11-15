'use client';

// '돌아왔어요'와 되돌리기 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 9, D10)
//
//   <ReturnedConfirm day={day} outing={outing} passedBy={returnBy} />
//
// - 지켜보기가 켜져(ON) 있고 그 외출의 확인할 마감(backTargetOf)이 있을 때 그린다. 갈아 끼움 직후에는 실패 줄만 그린다(lineOnly).
//   서버가 스위치가 꺼졌다고 답했을 때(GET /api/push/config 의 checked 이고 enabled 가 아님)만 숨긴다. 읽는 중이거나 읽지
//   못했으면(오프라인 등) 숨기지 않는다: 서버에는 그 마감이 남아 있어 보호자 알림이 갈 수 있다(화면 검토 I1).
//   이 기기에 지켜보기 레코드가 없으면 아무것도 그리지 않고 스위치도 묻지 않는다(스위치가 꺼진 채 쓰는 기기에서 요청이 늘지 않게).
// - 누르면 확인 신호만 보낸다. 시트를 닫지 않고 일정을 바꾸지 않는다(다르게 정한 것 11). 앱은 환자가 돌아왔는지 판단하지 않는다.
// - 표시 규칙은 returnedView.js 하나다. 줄은 안전 문구라 주 언어와 병기 언어 두 줄이고 감싸는 요소가 role="status" 다.
// - 지금 시각은 useKstClock 의 분으로 만든다. SENT·QUEUED·UNDO_QUEUED 면 되돌리기 마감에 한 번 다시 그린다. 되돌리기가 마감을
//   넘겨 남지 않고, 마감까지 전달되지 않은 대기는 그때 직접 연락 줄로 바뀐다(returnedView).
// - 버튼이 사라질 때 포커스를 잃지 않게 상태 줄로 옮긴다. 누른 뒤에는 그 렌더가 끝난 다음(효과에서) 옮겨, 바뀐 줄을 읽게 한다.
//   되돌리기 마감 타이머가 포커스가 있던 되돌리기를 없앨 때도 옮긴다.
// - watchId·쓰기 토큰·날짜·시각을 기록하지 않는다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button } from '@/components/ui/index.js';
import useKstClock from '@/components/trip/useKstClock.js';
import { useGuardianWatch, useReturnedConfirm, useServerPushConfig } from '@/lib/trip/useWatch.js';
import { BACK_PHASE } from '@/lib/trip/watchSync.js';
import { fromMinutes, kstInstantMs } from '@/src/stay/time.js';
import { hiddenByConfig, returnedView } from './returnedView.js';

/** 되돌리기 마감 뒤 다시 그릴 때까지 더 기다리는 폭 */
const UNDO_REDRAW_SLACK_MS = 50;
const MAX_TIMER_MS = 2 ** 31 - 1;
/** 되돌리기 마감에 다시 그리는 단계(SENT 는 되돌리기가 사라지고, 대기 중인 둘은 줄이 바뀐다) */
const REDRAW_AT_UNDO_DEADLINE = new Set([BACK_PHASE.SENT, BACK_PHASE.QUEUED, BACK_PHASE.UNDO_QUEUED]);

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
  const rootRef = useRef(null);
  const statusRef = useRef(null);
  // 되돌리기 마감 타이머가 다시 그릴 때 쓰는 시각(분 단위 시계보다 늦지 않게 둘 중 큰 값을 쓴다)
  const [timerNowMs, setTimerNowMs] = useState(0);
  // 상태 줄로 포커스를 옮겨 달라는 요청(늘어나는 수). 그 렌더가 끝난 뒤 효과가 옮긴다
  const [focusRequest, setFocusRequest] = useState(0);
  const clockMs = clock ? kstInstantMs(clock.date, fromMinutes(clock.minutes)) : Number.NaN;
  const nowMs = Number.isFinite(clockMs) ? Math.max(clockMs, timerNowMs) : Number.NaN;
  const back = useReturnedConfirm({ day, outing, passedBy, nowMs });
  const { phase, undoUntilMs } = back;

  useEffect(() => {
    if (!REDRAW_AT_UNDO_DEADLINE.has(phase) || !Number.isFinite(undoUntilMs)) return undefined;
    const wait = Math.min(Math.max(undoUntilMs - Date.now(), 0) + UNDO_REDRAW_SLACK_MS, MAX_TIMER_MS);
    const id = window.setTimeout(() => {
      // SENT 의 되돌리기는 이 다시 그리기에서 사라진다. 포커스가 거기 있었으면 상태 줄로 옮긴다
      const active = document.activeElement;
      if (phase === BACK_PHASE.SENT && active && active !== statusRef.current && rootRef.current?.contains(active)) {
        setFocusRequest((n) => n + 1);
      }
      setTimerNowMs(Date.now());
    }, wait);
    return () => window.clearTimeout(id);
  }, [phase, undoUntilMs]);

  useEffect(() => {
    if (focusRequest > 0) statusRef.current?.focus();
  }, [focusRequest]);

  if (hiddenByConfig(config) || !back.visible) return null;
  const view = returnedView({ phase, nowMs, undoUntilMs, lineOnly: back.lineOnly });
  const line = view.lineKey ? pair(view.lineKey) : null;

  function press() {
    back.press();
    setFocusRequest((n) => n + 1);
  }

  function undo() {
    back.undo();
    setFocusRequest((n) => n + 1);
  }

  return (
    <div ref={rootRef} className={`trip-back ${className}`.trim()}>
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
