'use client';

// 서버 알림 화면 훅 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 7)
//
//   const { loaded, enabled, checked } = useServerPushConfig();   서버 알림 스위치(한 번 읽고 5분 기억, 실패는 꺼짐).
//                                                                   checked 는 서버가 답했는가(읽지 못했으면 false)
//   const { state, watchId } = useGuardianWatch();          'ON' | 'REPLACED' | 'NONE'. watchId 는 ON 일 때만
//                                                           (정본은 ./useGuardianWatch.js, 여기서는 다시 내보낸다)
//   const back = useReturnedConfirm({ day, outing, passedBy, nowMs });
//   back.visible  back.lineOnly  back.phase  back.undoUntilMs  back.press()  back.undo()
//
// - 실행기는 getWatchSync() 하나다(lib/trip/client.js). 서버 렌더링·하이드레이션 중에는 꺼진 값(NONE, 보이지 않음)을 준다.
// - '돌아왔어요'는 켜진(ON) 지켜보기에서 그 외출의 마감(backTargetOf)이 있을 때만 보인다. 단계는 실행기 메모리에서 읽는다.
//   REPLACED 로 바뀐 직후에는 그 마감의 실패 줄(FAILED·UNDO_FAILED)만 보인다(lineOnly).

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getWatchSync } from './client.js';
import { isClockTime } from '../../src/stay/time.js';
import { useWatchRecord } from './useGuardianWatch.js';
import { backTargetOf } from './watchPlan.js';
import { BACK_PHASE } from './watchSync.js';

export { useGuardianWatch } from './useGuardianWatch.js';

const CONFIG_LOADING = Object.freeze({ loaded: false, enabled: false, checked: false });
const noop = () => {};
const noopSubscribe = () => noop;
const serverNull = () => null;

/**
 * 서버 알림 스위치. 읽는 동안 loaded: false 이고, 실패하면 enabled: false 다.
 * checked 는 서버가 답했는가다. 꺼졌다고 답한 것(checked: true, enabled: false)과 읽지 못한 것(checked: false)을 가른다.
 * @returns {{ loaded: boolean, enabled: boolean, checked: boolean }}
 */
export function useServerPushConfig() {
  const [config, setConfig] = useState(CONFIG_LOADING);
  useEffect(() => {
    const sync = getWatchSync();
    if (!sync) return undefined;
    let alive = true;
    sync.config().then(
      (result) => {
        if (alive) setConfig({ loaded: true, enabled: result?.enabled === true, checked: result?.checked === true });
      },
      () => {
        if (alive) setConfig({ loaded: true, enabled: false, checked: false });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

/**
 * 외출 카드의 '돌아왔어요'.
 * visible = 지켜보기가 ON 이고 backTargetOf(...) 가 null 이 아님. press·undo 는 그 대상으로 pressBack·undoBack.
 * press 는 누른 외출의 출발 시각(outing.departAt)을 함께 넘긴다. 마감 지남 시트(passedBy 가 시각)는 외출 대신 지난 마감을
 * 확인하므로 null 을 넘긴다.
 * 갈아 끼움(404)으로 REPLACED 가 된 직후에는 그 대상의 단계가 FAILED·UNDO_FAILED 일 때만 보이고 lineOnly 다
 * (실패 줄만 보이고 버튼·되돌리기는 없다. 작업 7 검토 반영).
 * @param {{ day: object|null, outing: object|null, passedBy?: string|null, nowMs: number }} args
 * @returns {{ visible: boolean, lineOnly: boolean, phase: string|null, undoUntilMs: number|null, press: () => void, undo: () => void }}
 */
export function useReturnedConfirm({ day, outing, passedBy = null, nowMs } = {}) {
  const sync = getWatchSync();
  const record = useWatchRecord();
  const replaced = record?.state === 'REPLACED';
  const target = useMemo(() => {
    if ((record?.state !== 'ON' && record?.state !== 'REPLACED') || !Number.isFinite(nowMs)) return null;
    return backTargetOf({ day, outing, lastUploaded: record.lastUploaded, nowMs, passedBy });
  }, [record, day, outing, nowMs, passedBy]);
  const date = target?.date ?? null;
  const by = target?.by ?? null;
  const departAt = isClockTime(passedBy) || !isClockTime(outing?.departAt) ? null : outing.departAt;

  // 단계는 문자열이라 바뀌지 않으면 같은 값이다(실행기가 단계나 레코드가 바뀔 때 알린다)
  const readPhase = useCallback(() => (sync && date && by ? sync.backStatus({ date, by })?.phase ?? null : null), [sync, date, by]);
  const phase = useSyncExternalStore(sync ? sync.subscribe : noopSubscribe, readPhase, serverNull);
  const undoUntilMs = useMemo(() => (sync && phase && date && by ? sync.backStatus({ date, by })?.undoUntilMs ?? null : null), [sync, phase, date, by]);

  const press = useCallback(() => {
    if (sync && date && by) sync.pressBack({ date, by, departAt });
  }, [sync, date, by, departAt]);
  const undo = useCallback(() => {
    if (sync && date && by) sync.undoBack({ date, by });
  }, [sync, date, by]);

  const lineOnly = replaced && (phase === BACK_PHASE.FAILED || phase === BACK_PHASE.UNDO_FAILED);
  return { visible: target !== null && (!replaced || lineOnly), lineOnly, phase, undoUntilMs, press, undo };
}
