// '돌아왔어요'와 되돌리기 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 9, D10)
//
//   returnedView({ phase, nowMs, undoUntilMs, lineOnly })  → { button, busy, lineKey, undo }
//   sheetShowsConfirm({ day, today })                     → 복귀 시트에 '돌아왔어요'를 둘 날인가
//   hiddenByConfig(config)                                → 서버 알림 스위치 때문에 숨기는가(서버가 꺼졌다고 답했을 때만)
//
// 단계마다 버튼·줄·되돌리기를 정한다(계획 Task 9 표).
//
//   | 단계          | 버튼          | 줄                                              | 되돌리기                    |
//   | null          | 보임          | return.backHint                                 | 없음                        |
//   | SENDING       | 숨김(busy)    | return.backSending                              | 없음                        |
//   | QUEUED        | 숨김          | return.backQueued, 되돌리기 마감부터 backQueuedLate | 보임                        |
//   | UNDO_QUEUED   | 숨김          | return.backUndoQueued, 되돌리기 마감부터 backUndoLate | 없음                        |
//   | SENT          | 숨김          | return.backSent                                 | nowMs < undoUntilMs 일 때   |
//   | FAILED        | 보임          | return.backFailed                               | 없음                        |
//   | UNDO_FAILED   | 숨김          | return.backUndoFailed                           | 없음                        |
//
// 정한 것
//   - '전달했어요'(return.backSent)는 서버가 기록했다고 답한 SENT 에서만 나온다. 앱은 환자가 돌아왔는지 판단하지 않는다.
//   - 되돌리기 마감(서버가 그 마감의 알림을 보내기 30초 전)이 지나도록 대기 중인 확인·되돌리기는 마감까지 전달되지 않은 것이다.
//     보호자에게 직접 연락하라는 줄로 바꾼다(QUEUED 의 되돌리기는 요청 없이 취소되므로 그대로 둔다).
//   - 복귀 시트의 '돌아왔어요'는 시트의 날이 오늘(KST)일 때만 둔다. 지난 날의 시트를 다시 열면 두지 않는다.
//   - lineOnly(갈아 끼움 직후, 작업 7 검토 반영 M1): FAILED·UNDO_FAILED 줄만 보이고 버튼·되돌리기는 없다.
//     다른 단계면 아무것도 보이지 않는다.
//   - 모르는 단계는 누르기 전(null)과 같이 본다(버튼과 안내 줄. 전달했다고 쓰지 않는다).
//
// 순수 모듈이다(React·저장소·시계 없음). node --test 가 읽으므로 상대 경로로만 불러온다.

import { BACK_PHASE } from '../../lib/trip/watchSync.js';
import { isDateString } from '../../src/stay/time.js';

const NONE = Object.freeze({ button: false, busy: false, lineKey: null, undo: false });

const BEFORE = Object.freeze({ button: true, busy: false, lineKey: 'return.backHint', undo: false });

/** 단계 → 표의 한 줄(SENT 의 되돌리기는 시각으로 정한다) */
const TABLE = Object.freeze({
  [BACK_PHASE.SENDING]: Object.freeze({ button: false, busy: true, lineKey: 'return.backSending', undo: false }),
  [BACK_PHASE.QUEUED]: Object.freeze({ button: false, busy: false, lineKey: 'return.backQueued', undo: true }),
  [BACK_PHASE.UNDO_QUEUED]: Object.freeze({ button: false, busy: false, lineKey: 'return.backUndoQueued', undo: false }),
  [BACK_PHASE.SENT]: Object.freeze({ button: false, busy: false, lineKey: 'return.backSent', undo: false }),
  [BACK_PHASE.FAILED]: Object.freeze({ button: true, busy: false, lineKey: 'return.backFailed', undo: false }),
  [BACK_PHASE.UNDO_FAILED]: Object.freeze({ button: false, busy: false, lineKey: 'return.backUndoFailed', undo: false }),
});

/** 되돌리기 마감이 지나도록 대기 중인 단계의 줄(마감까지 전달되지 않았다) */
const LATE_LINE = Object.freeze({
  [BACK_PHASE.QUEUED]: 'return.backQueuedLate',
  [BACK_PHASE.UNDO_QUEUED]: 'return.backUndoLate',
});

/** 갈아 끼움 직후 보이는 실패 줄 */
const LINE_ONLY = Object.freeze({
  [BACK_PHASE.FAILED]: Object.freeze({ ...NONE, lineKey: 'return.backFailed' }),
  [BACK_PHASE.UNDO_FAILED]: Object.freeze({ ...NONE, lineKey: 'return.backUndoFailed' }),
});

/**
 * @param {{ phase: string|null, nowMs?: number, undoUntilMs?: number|null, lineOnly?: boolean }} args
 * @returns {{ button: boolean, busy: boolean, lineKey: string|null, undo: boolean }}
 */
export function returnedView({ phase = null, nowMs, undoUntilMs = null, lineOnly = false } = {}) {
  if (lineOnly === true) return LINE_ONLY[phase] ?? NONE;
  const open = Number.isFinite(nowMs) && Number.isFinite(undoUntilMs) && nowMs < undoUntilMs;
  if (phase === BACK_PHASE.SENT) return open ? { ...TABLE[BACK_PHASE.SENT], undo: true } : TABLE[BACK_PHASE.SENT];
  // 마감이 지났는지 알 때만 늦은 줄로 바꾼다(시각을 모르면 예전 줄)
  const late = Number.isFinite(nowMs) && Number.isFinite(undoUntilMs) && !open;
  if (late && Object.hasOwn(LATE_LINE, phase ?? '')) return { ...TABLE[phase], lineKey: LATE_LINE[phase] };
  return Object.hasOwn(TABLE, phase ?? '') ? TABLE[phase] : BEFORE;
}

/**
 * 서버 알림 스위치 때문에 '돌아왔어요'를 숨기는가: 서버가 꺼졌다고 답했을 때(checked 이고 enabled 가 아님)만이다.
 * 읽는 중이거나 읽지 못했으면(오프라인 등) 숨기지 않는다. 서버에 그 마감이 남아 있으면 보호자 알림이 갈 수 있다(화면 검토 I1).
 * @param {{ enabled?: boolean, checked?: boolean }|null|undefined} config  useServerPushConfig() 값
 * @returns {boolean}
 */
export function hiddenByConfig(config) {
  return config?.checked === true && config.enabled !== true;
}

/**
 * 복귀 시트에 '돌아왔어요'를 둘 날인가: 시트의 날(day.date)이 오늘(KST)이다. 오늘을 모르면(하이드레이션 전) 두지 않는다.
 * @param {{ day: object|null|undefined, today: string|null|undefined }} args  today: useKstClock().date
 * @returns {boolean}
 */
export function sheetShowsConfirm({ day, today } = {}) {
  return isDateString(today) && day?.date === today;
}
