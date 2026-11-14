// 설정의 '서버 알림' 절 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 10, D11·D13·D14)
//
//   serverPushSectionView({ enabled, checked, state, readOnly, online })
//                                       → { visible, stateKey, statePair, canTurnOff, canRemoveAll }
//   serverPushTurnOffResult(result)     → { key, pair }   끄기(retire) 결과 줄
//   serverPushRemoveResult(result)      → { key, vars }   서버 지우기(removeAll) 결과 줄
//   clearNoteKey(state)                 → '내 정보 지우기' 아래 안내 줄 키
//
// 정한 것
//   - 절은 서버 알림 스위치가 켜져 있거나(enabled) 이 기기에 지켜보기 레코드(ON·REPLACED)가 있을 때만 보인다(다르게 정한 것 18).
//     스위치가 꺼져 있고 레코드가 없으면 설정 화면은 예전과 같다.
//   - 레코드가 ON 인데 서버가 스위치가 꺼졌다고 답했으면(checked 이고 enabled 가 아님) '켜져 있어요' 대신 멈춰 있다는 줄
//     (안전 문구, statePair)을 보인다. 읽지 못했으면(오프라인 등) 예전 줄 그대로다.
//   - '내 정보 지우기' 안내: 이 기기에 지켜보기 레코드(ON·REPLACED)가 있으면 서버 알림이 서버에 저장하는 것을 적은 줄, 없으면
//     예전 줄(clear.note) 그대로다.
//   - 끄기는 레코드가 있고(ON·REPLACED) 쓰기 가능할 때, 서버 지우기는 쓰기 가능하고 온라인일 때만 된다.
//   - 끄기 결과: { ok: true, pending: false } 일 때만 '껐어요'. 서버 삭제가 남았으면(pending) 그 전까지 보호자에게 알림이 갈 수
//     있다는 줄, 끄지 못했으면 그 줄(작업 7 검토 반영). 뒤의 두 줄은 안전 문구(settings safety 블록)라 pair 로 그린다.
//
// 순수 모듈이다(React·저장소·네트워크 없음). node --test 가 읽으므로 상대 경로로만 불러온다.

const STATE_KEY = Object.freeze({
  ON: 'settings.serverPushOn',
  REPLACED: 'settings.serverPushReplaced',
  NONE: 'settings.serverPushOff',
});
const PAUSED_KEY = 'settings.serverPushPaused';

/**
 * @param {{ enabled: boolean, checked?: boolean, state: 'ON'|'REPLACED'|'NONE', readOnly: boolean, online: boolean }} args
 *   enabled·checked: GET /api/push/config 결과(읽지 못하면 enabled false, checked false) · state: useGuardianWatch().state ·
 *   readOnly·online: 저장소 상태
 * @returns {{ visible: boolean, stateKey: string, statePair: boolean, canTurnOff: boolean, canRemoveAll: boolean }}
 *   statePair: 상태 줄이 안전 문구(주 언어 + 병기)인가
 */
export function serverPushSectionView({ enabled, checked, state, readOnly, online } = {}) {
  const exists = state === 'ON' || state === 'REPLACED';
  const writable = readOnly === false;
  const paused = state === 'ON' && checked === true && enabled !== true;
  return {
    visible: enabled === true || exists,
    stateKey: paused ? PAUSED_KEY : exists ? STATE_KEY[state] : STATE_KEY.NONE,
    statePair: paused,
    canTurnOff: exists && writable,
    canRemoveAll: writable && online !== false,
  };
}

/**
 * '내 정보 지우기' 아래 안내 줄 키. 지켜보기 레코드(ON·REPLACED)가 있으면 서버 알림이 서버에 저장하는 것을 적은 줄이다.
 * @param {'ON'|'REPLACED'|'NONE'|undefined} state  useGuardianWatch().state
 * @returns {'clear.note'|'clear.noteServerPush'}
 */
export function clearNoteKey(state) {
  return state === 'ON' || state === 'REPLACED' ? 'clear.noteServerPush' : 'clear.note';
}

/**
 * 끄기 결과 줄. pair: true 면 안전 문구(주 언어 + 병기)다.
 * @param {{ ok: true, pending: boolean } | { ok: false, reason?: string } | null | undefined} result  retire() 결과
 * @returns {{ key: string, pair: boolean }}
 */
export function serverPushTurnOffResult(result) {
  if (result?.ok === true && result.pending === false) return { key: 'settings.serverPushTurnedOff', pair: false };
  if (result?.ok === true && result.pending === true) return { key: 'settings.serverPushTurnOffPending', pair: true };
  return { key: 'settings.serverPushTurnOffFailed', pair: true };
}

/**
 * 서버 지우기 결과 줄.
 * @param {{ ok: true, deleted: number } | { ok: false, reason?: string } | null | undefined} result  removeAll() 결과
 * @returns {{ key: string, vars?: { count: number } }}
 */
export function serverPushRemoveResult(result) {
  if (result?.ok === true) {
    const count = Number.isInteger(result.deleted) && result.deleted >= 0 ? result.deleted : 0;
    return { key: 'settings.serverPushRemoved', vars: { count } };
  }
  if (result?.reason === 'LOGIN_REQUIRED') return { key: 'settings.serverPushRemoveLogin' };
  return { key: 'settings.serverPushRemoveFailed' };
}
