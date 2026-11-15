// 설정의 '서버 알림' 절 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 10, D11·D13·D14)
//
//   serverPushSectionView({ enabled, checked, state, readOnly, online })
//                                       → { visible, stateKey, statePair, canTurnOff, canRemoveAll }
//   serverPushTurnOffResult(result)     → { key, pair }   끄기(retire) 결과 줄
//   serverPushRemoveResult(result)      → { key, vars }   서버 지우기(removeAll) 결과 줄
//   serverPushOpenSheet({ sheet, visible, exists, openedFor, accountKey }) → 'turnOff'|'removeAll'|null   지금도 열어 둘 수 있는 확인 시트
//   runServerPushAction(action, { sync, accountKey }) → 확인 시트의 버튼이 부르는 실행기 결과(끄기 retire, 서버 지우기 removeAll)
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
//   - 확인 시트는 연 때의 계정에서만 열어 둔다. 계정이 바뀌면(다른 탭의 로그인 등) 닫는다. 끄기·서버 지우기는 절을 그린 계정 키를
//     실행기에 넘긴다(줄 서 있다가 시작될 때 계정이 다르면 실행기가 아무것도 하지 않는다, A-3 검토).
//
// React·저장소·네트워크를 직접 쓰지 않는다. 동기화 실행기(getWatchSync())는 부르는 쪽이 넣는다.
// node --test 가 읽으므로 상대 경로로만 불러온다.

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
 * 열린 확인 시트를 지금도 열어 둘 수 있는가. 절이 숨었거나(스위치가 꺼지고 레코드가 없다) 끌 레코드가 사라졌으면(다른 탭에서
 * 끔) null 이다. 설정 화면은 열린 시트가 있는 동안 다른 절을 inert 로 막으므로, 숨은 절의 시트 상태가 남으면 화면이 막힌 채 남는다.
 * 시트를 연 때의 계정(openedFor)을 받았는데 지금 계정과 다르면 null 이다(앞 계정에서 연 확인으로 바뀐 계정의 지켜보기를 끄거나
 * 지우지 않게).
 * @param {{ sheet: 'turnOff'|'removeAll'|null, visible: boolean, exists: boolean, openedFor?: string|null, accountKey?: string|null }} args
 *   sheet: 설정 화면이 들고 있는 열린 시트 · visible: serverPushSectionView().visible · exists: 레코드가 ON·REPLACED 인가 ·
 *   openedFor: 시트를 연 때의 계정 키(받지 않으면 계정을 보지 않는다) · accountKey: 지금 계정 키
 * @returns {'turnOff'|'removeAll'|null}
 */
export function serverPushOpenSheet({ sheet, visible, exists, openedFor, accountKey } = {}) {
  if (visible !== true) return null;
  if (openedFor !== undefined && openedFor !== accountKey) return null;
  if (sheet === 'turnOff') return exists === true ? 'turnOff' : null;
  if (sheet === 'removeAll') return 'removeAll';
  return null;
}

/**
 * 확인 시트의 버튼이 실행기를 부른다: 끄기(turnOff)는 retire, 서버 지우기(removeAll)는 removeAll. 둘 다 절을 그린 계정 키를
 * 넘긴다(줄 서 있다가 시작될 때 계정이 다르면 실행기가 아무것도 하지 않는다). 키가 없으면 null 을 넘겨 그래도 계정을 보게 한다.
 * 실행기가 없거나 던지거나 결과가 없으면 null(결과 줄은 실패 줄이다).
 * @param {'turnOff'|'removeAll'} action
 * @param {{ sync: { retire: Function, removeAll: Function } | null | undefined, accountKey: string|null|undefined }} deps
 *   sync: getWatchSync() · accountKey: useStoreStatus().accountKey
 * @returns {Promise<object|null>}  retire·removeAll 결과
 */
export async function runServerPushAction(action, { sync, accountKey } = {}) {
  const scope = { accountKey: accountKey ?? null };
  try {
    if (action === 'turnOff') return (await sync?.retire(scope)) ?? null;
    if (action === 'removeAll') return (await sync?.removeAll(scope)) ?? null;
  } catch {
    // 실행기는 던지지 않는 것이 약속이다. 던지면 하지 못한 것으로 본다
  }
  return null;
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
