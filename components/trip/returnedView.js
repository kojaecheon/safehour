// '돌아왔어요'와 되돌리기 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 9, D10)
//
//   returnedView({ phase, nowMs, undoUntilMs, lineOnly })  → { button, busy, lineKey, undo }
//
// 단계마다 버튼·줄·되돌리기를 정한다(계획 Task 9 표).
//
//   | 단계          | 버튼          | 줄                      | 되돌리기                    |
//   | null          | 보임          | return.backHint         | 없음                        |
//   | SENDING       | 숨김(busy)    | return.backSending      | 없음                        |
//   | QUEUED        | 숨김          | return.backQueued       | 보임                        |
//   | UNDO_QUEUED   | 숨김          | return.backUndoQueued   | 없음                        |
//   | SENT          | 숨김          | return.backSent         | nowMs < undoUntilMs 일 때   |
//   | FAILED        | 보임          | return.backFailed       | 없음                        |
//   | UNDO_FAILED   | 숨김          | return.backUndoFailed   | 없음                        |
//
// 정한 것
//   - '전달했어요'(return.backSent)는 서버가 기록했다고 답한 SENT 에서만 나온다. 앱은 환자가 돌아왔는지 판단하지 않는다.
//   - lineOnly(갈아 끼움 직후, 작업 7 검토 반영 M1): FAILED·UNDO_FAILED 줄만 보이고 버튼·되돌리기는 없다.
//     다른 단계면 아무것도 보이지 않는다.
//   - 모르는 단계는 누르기 전(null)과 같이 본다(버튼과 안내 줄. 전달했다고 쓰지 않는다).
//
// 순수 모듈이다(React·저장소·시계 없음). node --test 가 읽으므로 상대 경로로만 불러온다.

import { BACK_PHASE } from '../../lib/trip/watchSync.js';

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
  if (phase === BACK_PHASE.SENT) {
    const open = Number.isFinite(nowMs) && Number.isFinite(undoUntilMs) && nowMs < undoUntilMs;
    return open ? { ...TABLE[BACK_PHASE.SENT], undo: true } : TABLE[BACK_PHASE.SENT];
  }
  return Object.hasOwn(TABLE, phase ?? '') ? TABLE[phase] : BEFORE;
}
