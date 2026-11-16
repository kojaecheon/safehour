// 받은 일정 화면(/g)의 '앱이 닫혀 있어도 받기' 항목 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7,
// 다르게 정한 것 1·2, 정한 값 5·9·10·12·16·25·27·28)
//
//   guardianPushViewModel({ state, watchId, mainOn, writable, offline, today, loginElsewhere, lastAction })
//     → { itemState, showSwitch, switchOn, switchDisabled, switchLocked, lines, result, actions, actionsDisabled,
//         showMute, muteOn, muteDisabled, muteLocked, consentLines, safetyLines }
//   resultFitsState(lastResult, { itemState, switchOn, showMute, muteOn, lastAction })  결과 줄이 지금 상태에 맞는가(검토 I1)
//   actionForResult(record, lastResult)  지금 결과 줄을 만든 사용자 동작(PUSH_USER_ACTION) 또는 null
//   PUSH_USER_ACTION         화면이 시작한 사용자 동작: on, off, mute, renew, takeOver
//   switchControlProps({ disabled, locked })  스위치의 disabled·aria-disabled·누름 막기(포커스를 지키는 잠금)
//   pushLineSegments(lines)  아이폰 다섯 단계를 목록 하나로 묶은 줄 조각
//   PUSH_RESULT_LINE         실행기 결과(PUSH_RESULT) → 결과 줄 문구 키
//
// 정한 것
//   - 보이는 조건: 사본에 watchId 가 있고, 서버 알림 스위치가 켜졌거나(config.enabled) 이 기기에 그 watchId 의 구독이 있을 때.
//     기기 알림 스위치('복귀 마감 알림 받기')가 꺼져 있어도 보인다(아이폰 Safari 탭은 기기 스위치를 켤 수 없다). 설정을 아직 못 읽었고
//     구독이 없으면 숨는다. 서버 스위치가 꺼졌고 구독이 있으면 PAUSED 이고 끄기만 된다.
//   - 기기 알림 스위치가 꺼졌는데 구독 기록이 남아 있으면(다시 맞추기가 끄기 전) 켜진 것으로 그리지 않는다(부모를 끄면 자식도 꺼진다).
//   - 상태 표(계획 Task 7) 그대로 줄과 버튼을 고른다. HIDDEN 말고는 동의 문장, 법률 검토 줄(consentLines)과 도착 비보장, 위치 줄
//     (safetyLines, 두 언어 병기)이 늘 있다. 켜기 스위치를 누르는 것이 동의다(정한 값 28).
//   - 구독이 없을 때의 순서: 기간 끝(GONE), 켜는 중(WORKING), 지원 판별(DENIED, 아이폰 둘, UNSUPPORTED), 준비 확인 실패(SW_NOT_READY), 켤 수 있음.
//     구독이 있을 때: 서버 스위치 꺼짐(PAUSED), 다른 기기가 가져감(MOVED), 다시 켜기(RENEW_NEEDED), 받는 중(ON).
//     renewNeeded 는 계정 단위이고 다시 켜기는 moved 구독을 건너뛴다(moved 만 남으면 UNAVAILABLE). 그래서 이 지켜보기가 moved 면
//     다시 켜기 버튼 대신 '이 휴대폰에서 다시 받기'만 보인다.
//   - 실행기가 일하는 중(busy)이면 두 스위치와 버튼을 잠근다(켜기가 도는 동안의 끄기·함께 있음은 켜기 약속을 돌려받는다).
//     잠금은 포커스를 지키는 잠금(switchLocked)이다: 부품은 disabled 대신 aria-disabled 로 막는다.
//   - 보기 전용(로그인 없음, 결정 27)이면 구독·끄기를 할 수 없다: 스위치를 잠그고 로그인 줄과 로그인 버튼을 둔다. 오프라인이면
//     로그인을 권하지 않고 연결 안내만 둔다. 다시 켜기·다시 받기 버튼은 숨긴다. 바로 위 기기 알림 스위치가 로그인 버튼을 이미
//     보이면(loginElsewhere) 줄만 두고 버튼은 두지 않는다(화면에 로그인 버튼은 하나, 검토 Minor 2).
//   - 기간 끝(GONE)의 '앱이 열려 있을 때 알림은 그대로 받아요'는 기기 알림 스위치가 꺼져 있으면 말하지 않는다(검토 Minor 1).
//   - 결과 줄은 실행기 결과마다 하나다. 실패는 alert, 나머지는 status 다. 상태 줄과 같은 문구면 한 번만 보인다. 모르는 결과는 줄이 없다.
//     실행기의 lastResult 는 다시 맞추기·상태 조회·다른 탭의 변경 뒤에도 남으므로 지금 상태에 맞을 때만 보인다(resultFitsState).
//   - 실패 문구는 켜기 기준('켜지 못했어요')이다. 그래서 화면이 시작한 동작의 실패면 그 동작의 문구로 바꾼다: 받는 중(ON)에
//     함께 있음 바꾸기가 실패하면 guardian.muteFailed, 구독이 남은 채 끄기가 실패하면 guardian.pushOffFailed. 어느 동작의
//     결과인지는 화면(GuardianPushItem)이 기록한 동작이 돌려받은 결과와 지금 lastResult 가 같을 때만 안다(actionForResult).
//     다시 맞추기·상태 조회가 남긴 결과는 앞의 규칙 그대로다.
//   - 오늘 함께 있음은 ON 이고 쓰기 가능하고 config.enabled 가 참일 때만 보인다. 켜짐은 오늘(한국 시간) 상태 조회의 muted 만 따른다.
//
// React·저장소·네트워크를 쓰지 않는 순수 함수다. node --test 가 읽으므로 상대 경로로만 불러온다.

import { PUSH_RESULT } from '../../lib/notify/guardianPush.js';
import { PUSH_SUPPORT } from '../../lib/notify/pushSupport.js';
import { WATCH_ID_RE } from '../../src/guardian/watchRequests.js';

/** 항목 상태(정한 값 5) */
export const PUSH_ITEM_STATE = Object.freeze({
  HIDDEN: 'HIDDEN',
  IOS_NEEDS_INSTALL: 'IOS_NEEDS_INSTALL',
  IOS_TOO_OLD: 'IOS_TOO_OLD',
  UNSUPPORTED: 'UNSUPPORTED',
  DENIED: 'DENIED',
  SW_NOT_READY: 'SW_NOT_READY',
  AVAILABLE: 'AVAILABLE',
  WORKING: 'WORKING',
  ON: 'ON',
  PAUSED: 'PAUSED',
  RENEW_NEEDED: 'RENEW_NEEDED',
  MOVED: 'MOVED',
  GONE: 'GONE',
});

/** 항목 버튼: 새로 고침, 다시 켜기, 이 휴대폰에서 다시 받기, 로그인 */
export const PUSH_ACTION = Object.freeze({ RELOAD: 'RELOAD', RENEW: 'RENEW', TAKE_OVER: 'TAKE_OVER', LOGIN: 'LOGIN' });

/** 아이폰 홈 화면 추가 다섯 단계(정한 값 25) */
export const IOS_STEP_KEYS = Object.freeze([
  'guardian.pushIosStep1',
  'guardian.pushIosStep2',
  'guardian.pushIosStep3',
  'guardian.pushIosStep4',
  'guardian.pushIosStep5',
]);

/** 늘 보이는 동의 줄(설계서 5.5 보호자 문구, A-2 와 같은 법률 검토 안내 줄, 배지 없음) */
export const PUSH_CONSENT_KEYS = Object.freeze(['guardian.pushConsentStored', 'conditions.consentLegalReview']);

/** 늘 보이는 안전 줄(두 언어 병기): 도착 비보장, 위치 */
export const PUSH_SAFETY_KEYS = Object.freeze(['guardian.pushNoGuarantee', 'guardian.pushLocation']);

/** 실행기 결과 → 결과 줄 문구 키. 모든 PUSH_RESULT 값이 있어야 한다(테스트가 묶는다) */
export const PUSH_RESULT_LINE = Object.freeze({
  [PUSH_RESULT.ON]: 'guardian.pushOn',
  [PUSH_RESULT.DENIED]: 'guardian.pushDenied',
  [PUSH_RESULT.UNSUPPORTED]: 'guardian.pushUnsupported',
  [PUSH_RESULT.SW_NOT_READY]: 'guardian.pushSwNotReady',
  [PUSH_RESULT.FAILED]: 'guardian.pushFailed',
  [PUSH_RESULT.LOGIN_REQUIRED]: 'guardian.pushLogin',
  [PUSH_RESULT.RATE_LIMITED]: 'guardian.pushLimit',
  [PUSH_RESULT.OFF]: 'guardian.pushPaused',
  [PUSH_RESULT.GONE]: 'guardian.pushGone',
  [PUSH_RESULT.UNAVAILABLE]: 'guardian.pushUnavailable',
  [PUSH_RESULT.NETWORK]: 'guardian.pushNetwork',
  [PUSH_RESULT.READ_ONLY]: 'settings.readOnlyNote',
  [PUSH_RESULT.OFF_DONE]: 'guardian.pushOffDone',
  [PUSH_RESULT.OFF_PENDING]: 'guardian.pushOffPending',
  [PUSH_RESULT.OFF_UNSENT]: 'guardian.pushOffUnsent',
  [PUSH_RESULT.MUTE_ON]: 'guardian.muteOn',
  [PUSH_RESULT.MUTE_OFF]: 'guardian.muteOff',
  [PUSH_RESULT.PERMISSION_LOST]: 'guardian.pushPermissionLost',
});

/** 실패나 경고라서 role="alert" 로 알리는 결과 */
const ALERT_RESULTS = new Set([
  PUSH_RESULT.DENIED,
  PUSH_RESULT.UNSUPPORTED,
  PUSH_RESULT.SW_NOT_READY,
  PUSH_RESULT.FAILED,
  PUSH_RESULT.LOGIN_REQUIRED,
  PUSH_RESULT.RATE_LIMITED,
  PUSH_RESULT.UNAVAILABLE,
  PUSH_RESULT.NETWORK,
  PUSH_RESULT.READ_ONLY,
  PUSH_RESULT.OFF_UNSENT,
  PUSH_RESULT.PERMISSION_LOST,
]);

/** 결과 줄 가운데 safety 블록의 문장(알림이 올 수 있다는 전달 상태, 두 언어 병기) */
const SAFETY_RESULT_KEYS = new Set(['guardian.pushOffPending', 'guardian.pushOffUnsent']);

const STATE_LINES = Object.freeze({
  IOS_NEEDS_INSTALL: Object.freeze(['guardian.pushIosTitle', ...IOS_STEP_KEYS, 'guardian.pushIosNote']),
  IOS_TOO_OLD: Object.freeze(['guardian.pushIosOld']),
  UNSUPPORTED: Object.freeze(['guardian.pushUnsupported']),
  DENIED: Object.freeze(['guardian.pushDenied']),
  SW_NOT_READY: Object.freeze(['guardian.pushSwNotReady']),
  AVAILABLE: Object.freeze(['guardian.pushIntro']),
  WORKING: Object.freeze(['guardian.pushWorking']),
  ON: Object.freeze(['guardian.pushOn']),
  PAUSED: Object.freeze(['guardian.pushPaused']),
  RENEW_NEEDED: Object.freeze(['guardian.pushRenew']),
  MOVED: Object.freeze(['guardian.pushMoved', 'guardian.pushMovedNote']),
  GONE: Object.freeze(['guardian.pushGone', 'guardian.pushOpenAppAlerts']),
});

const STATE_ACTIONS = Object.freeze({
  SW_NOT_READY: Object.freeze([PUSH_ACTION.RELOAD]),
  RENEW_NEEDED: Object.freeze([PUSH_ACTION.RENEW]),
  MOVED: Object.freeze([PUSH_ACTION.TAKE_OVER]),
});

/** 켜기 스위치가 있는 상태 */
const SWITCH_STATES = new Set(['AVAILABLE', 'WORKING', 'ON', 'PAUSED', 'RENEW_NEEDED', 'MOVED']);
/** 구독이 있는 상태(스위치 켜짐, 누르면 끈다) */
const SUBSCRIBED_STATES = new Set(['ON', 'PAUSED', 'RENEW_NEEDED', 'MOVED']);

const HIDDEN_MODEL = Object.freeze({
  itemState: PUSH_ITEM_STATE.HIDDEN,
  showSwitch: false,
  switchOn: false,
  switchDisabled: true,
  switchLocked: false,
  lines: Object.freeze([]),
  result: null,
  actions: Object.freeze([]),
  actionsDisabled: true,
  showMute: false,
  muteOn: false,
  muteDisabled: true,
  muteLocked: false,
  consentLines: Object.freeze([]),
  safetyLines: Object.freeze([]),
});

const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);

/** 구독이 없을 때의 상태 */
function unsubscribedState(state, enabled) {
  if (state.gone === true) return enabled ? PUSH_ITEM_STATE.GONE : PUSH_ITEM_STATE.HIDDEN;
  if (!enabled) return PUSH_ITEM_STATE.HIDDEN;
  if (state.busy === true) return PUSH_ITEM_STATE.WORKING;
  switch (state.support) {
    case PUSH_SUPPORT.READY:
      break;
    case PUSH_SUPPORT.DENIED:
      return PUSH_ITEM_STATE.DENIED;
    case PUSH_SUPPORT.IOS_NEEDS_INSTALL:
      return PUSH_ITEM_STATE.IOS_NEEDS_INSTALL;
    case PUSH_SUPPORT.IOS_TOO_OLD:
      return PUSH_ITEM_STATE.IOS_TOO_OLD;
    default:
      return PUSH_ITEM_STATE.UNSUPPORTED;
  }
  if (state.swReady === false) return PUSH_ITEM_STATE.SW_NOT_READY;
  return PUSH_ITEM_STATE.AVAILABLE;
}

/** 구독이 있을 때의 상태 */
function subscribedState(state) {
  if (state.config?.enabled === false) return PUSH_ITEM_STATE.PAUSED;
  if (state.moved === true) return PUSH_ITEM_STATE.MOVED;
  if (state.renewNeeded === true) return PUSH_ITEM_STATE.RENEW_NEEDED;
  return PUSH_ITEM_STATE.ON;
}

/** 화면이 시작한 사용자 동작(GuardianPushItem 이 기록한다) */
export const PUSH_USER_ACTION = Object.freeze({ ON: 'on', OFF: 'off', MUTE: 'mute', RENEW: 'renew', TAKE_OVER: 'takeOver' });

/**
 * 지금 결과 줄을 만든 사용자 동작. 기록한 동작이 끝나 돌려받은 결과가 지금 lastResult 와 같을 때만 그 동작이다.
 * 끝나기 전이거나 그 뒤 다시 맞추기·상태 조회가 다른 결과를 남겼으면 null 이다.
 * @param {{ kind: string, done: boolean, result: string | null } | null | undefined} record
 * @param {string | null | undefined} lastResult
 * @returns {string | null}
 */
export function actionForResult(record, lastResult) {
  if (!record || record.done !== true) return null;
  if (typeof lastResult !== 'string' || record.result !== lastResult) return null;
  return Object.values(PUSH_USER_ACTION).includes(record.kind) ? record.kind : null;
}

/** 끄기 결과(구독이 없을 때만 맞다) */
const OFF_RESULTS = new Set([PUSH_RESULT.OFF_DONE, PUSH_RESULT.OFF_PENDING, PUSH_RESULT.OFF_UNSENT, PUSH_RESULT.PERMISSION_LOST]);
/** 켜기·다시 받기·다시 켜기의 실패와 막힘(받는 중 ON 에서는 맞지 않는다). 문구가 '켜지 못했어요' 쪽이다 */
const FAILURE_RESULTS = new Set([
  PUSH_RESULT.DENIED,
  PUSH_RESULT.UNSUPPORTED,
  PUSH_RESULT.SW_NOT_READY,
  PUSH_RESULT.FAILED,
  PUSH_RESULT.LOGIN_REQUIRED,
  PUSH_RESULT.RATE_LIMITED,
  PUSH_RESULT.UNAVAILABLE,
  PUSH_RESULT.NETWORK,
  PUSH_RESULT.READ_ONLY,
  PUSH_RESULT.OFF,
  PUSH_RESULT.GONE,
]);

/**
 * 화면이 시작한 동작의 실패에 쓸 문구. 받는 중(ON)의 함께 있음 바꾸기 실패, 구독이 남은(스위치 켜짐) 끄기 실패만이다.
 * 그 밖에는 null(앞의 규칙과 켜기 기준 문구를 쓴다).
 * @param {string | null | undefined} lastResult
 * @param {{ itemState: string, switchOn: boolean, lastAction?: string | null }} view
 * @returns {string | null}
 */
function actionFailureKey(lastResult, { itemState, switchOn, lastAction = null }) {
  if (!FAILURE_RESULTS.has(lastResult)) return null;
  if (lastAction === PUSH_USER_ACTION.MUTE && itemState === PUSH_ITEM_STATE.ON) return 'guardian.muteFailed';
  if (lastAction === PUSH_USER_ACTION.OFF && switchOn === true) return 'guardian.pushOffFailed';
  return null;
}

/**
 * 결과 줄이 지금 상태에 맞는가(검토 I1). 실행기의 lastResult 는 다시 맞추기, 상태 조회, 자정, 다른 탭의 변경 뒤에도 남는다.
 * 맞지 않는 줄은 상태와 어긋난 말을 읽어 주므로 숨긴다.
 *   - ON: 받는 중(ON)에서만(그 상태 줄과 같아 한 번만 보인다)
 *   - MUTE_ON: 함께 있음이 켜져 있을 때만. MUTE_OFF: 함께 있음 스위치가 보이고 꺼져 있을 때만
 *   - OFF_DONE, OFF_PENDING, OFF_UNSENT, PERMISSION_LOST: 구독이 없을 때만(스위치 꺼짐)
 *   - 실패(DENIED, UNSUPPORTED, SW_NOT_READY, FAILED, LOGIN_REQUIRED, RATE_LIMITED, UNAVAILABLE, NETWORK, READ_ONLY, OFF, GONE):
 *     받는 중(ON)이 아닐 때만
 *   - 모르는 값: 맞지 않는다
 *   - 화면이 시작한 동작의 실패(lastAction): 받는 중의 함께 있음 바꾸기, 구독이 남은 끄기는 받는 중에도 맞다(그 동작의 문구로 보인다)
 * @param {string | null | undefined} lastResult
 * @param {{ itemState: string, switchOn: boolean, showMute: boolean, muteOn: boolean, lastAction?: string | null }} view
 */
export function resultFitsState(lastResult, { itemState, switchOn, showMute, muteOn, lastAction = null }) {
  if (actionFailureKey(lastResult, { itemState, switchOn, lastAction }) !== null) return true;
  if (lastResult === PUSH_RESULT.ON) return itemState === PUSH_ITEM_STATE.ON;
  if (lastResult === PUSH_RESULT.MUTE_ON) return muteOn === true;
  if (lastResult === PUSH_RESULT.MUTE_OFF) return showMute === true && muteOn !== true;
  if (OFF_RESULTS.has(lastResult)) return switchOn !== true;
  if (FAILURE_RESULTS.has(lastResult)) return itemState !== PUSH_ITEM_STATE.ON;
  return false;
}

/**
 * 스위치의 막힘과 잠금(검토 M2·M3·M17). 잠금(실행기가 일하는 중)은 포커스를 지키려고 disabled 대신 aria-disabled 로 막고
 * 누름(click)을 막는다. 잠금이 아닌 막힘(보기 전용, 켤 수 없음)은 disabled 다. 둘 중 하나면 바뀜(change)을 무시한다.
 * @param {{ disabled?: boolean, locked?: boolean }} args
 * @returns {{ disabled: boolean, ariaDisabled: 'true' | undefined, blockClick: boolean, ignore: boolean }}
 */
export function switchControlProps({ disabled = false, locked = false } = {}) {
  const isLocked = locked === true;
  return {
    disabled: disabled === true && !isLocked,
    ariaDisabled: isLocked ? 'true' : undefined,
    blockClick: isLocked,
    ignore: disabled === true || isLocked,
  };
}

/** 결과 줄 하나. READ_ONLY 는 오프라인이면 연결 안내다 */
function resultLine(lastResult, offline) {
  const key = lastResult === PUSH_RESULT.READ_ONLY && offline ? 'settings.offlineNote' : PUSH_RESULT_LINE[lastResult];
  if (typeof key !== 'string') return null;
  return { key, safety: SAFETY_RESULT_KEYS.has(key), alert: ALERT_RESULTS.has(lastResult) };
}

/**
 * @param {object} args
 * @param {object | null | undefined} args.state  실행기 상태(useGuardianPush 의 state, 계획 '공용 모양')
 * @param {string | null | undefined} args.watchId  보이는 사본의 watchId
 * @param {boolean} args.mainOn  기기 알림 스위치(prefs.notifications)
 * @param {boolean} args.writable  쓰기 가능(로그인, 보기 전용 아님)
 * @param {boolean} [args.offline]  보기 전용의 이유가 오프라인이다
 * @param {string | null} [args.today]  오늘(KST, 'YYYY-MM-DD'). 함께 있음 켜짐을 오늘 조회로만 본다
 * @param {boolean} [args.loginElsewhere]  화면의 다른 곳(바로 위 기기 알림 스위치)이 로그인 버튼을 이미 보인다
 * @param {string | null} [args.lastAction]  지금 결과 줄을 만든 사용자 동작(actionForResult). 다시 맞추기·조회의 결과면 null
 */
export function guardianPushViewModel({
  state,
  watchId,
  mainOn,
  writable,
  offline = false,
  today = null,
  loginElsewhere = false,
  lastAction = null,
} = {}) {
  if (!isWatchId(watchId) || !state || typeof state !== 'object') return HIDDEN_MODEL;
  const enabled = state.config?.enabled === true;
  const subscribed = Boolean(state.sub) && mainOn !== false;
  if (!subscribed && !enabled) return HIDDEN_MODEL;

  const itemState = subscribed ? subscribedState(state) : unsubscribedState(state, enabled);
  if (itemState === PUSH_ITEM_STATE.HIDDEN) return HIDDEN_MODEL;

  const busy = state.busy === true;
  const canWrite = writable === true;
  const showSwitch = SWITCH_STATES.has(itemState);
  const switchOn = SUBSCRIBED_STATES.has(itemState);
  let lines = [...STATE_LINES[itemState]];
  let actions = [...(STATE_ACTIONS[itemState] ?? [])];
  // 기기 알림 스위치가 꺼져 있으면 앱이 열려 있어도 알림이 오지 않는다
  if (mainOn === false) lines = lines.filter((key) => key !== 'guardian.pushOpenAppAlerts');
  const loginButton = !offline && loginElsewhere !== true;

  if (!canWrite && showSwitch) {
    // 보기 전용: 구독·끄기·다시 켜기·다시 받기를 할 수 없다
    actions = actions.filter((action) => action !== PUSH_ACTION.RENEW && action !== PUSH_ACTION.TAKE_OVER);
    if (offline) lines.push('settings.offlineNote');
    else lines.push(switchOn ? 'settings.readOnlyNote' : 'guardian.pushLogin');
    if (loginButton) actions.push(PUSH_ACTION.LOGIN);
  }

  const showMute = itemState === PUSH_ITEM_STATE.ON && canWrite && enabled;
  const status = state.status ?? null;
  const muteOn = showMute && status?.muted === true && (today === null || status.date === today);

  const fits = resultFitsState(state.lastResult, { itemState, switchOn, showMute, muteOn, lastAction });
  const actionKey = actionFailureKey(state.lastResult, { itemState, switchOn, lastAction });
  let result = null;
  if (actionKey !== null) result = { key: actionKey, safety: false, alert: true };
  else if (fits) result = resultLine(state.lastResult, offline);
  if (result && lines.includes(result.key)) result = null;
  if (result && state.lastResult === PUSH_RESULT.LOGIN_REQUIRED && loginButton && !actions.includes(PUSH_ACTION.LOGIN)) {
    actions.push(PUSH_ACTION.LOGIN);
  }

  return {
    itemState,
    showSwitch,
    switchOn,
    switchDisabled: !showSwitch || !canWrite || busy || itemState === PUSH_ITEM_STATE.WORKING || (!switchOn && !enabled),
    switchLocked: busy,
    lines,
    result,
    actions,
    actionsDisabled: busy,
    showMute,
    muteOn,
    muteDisabled: !showMute || busy,
    muteLocked: busy,
    consentLines: [...PUSH_CONSENT_KEYS],
    safetyLines: [...PUSH_SAFETY_KEYS],
  };
}

/**
 * 상태 줄을 그릴 조각으로 묶는다. 아이폰 다섯 단계는 순서 목록 하나다.
 * @param {string[] | undefined} lines
 * @returns {Array<{ kind: 'text', key: string } | { kind: 'steps', keys: string[] }>}
 */
export function pushLineSegments(lines) {
  const segments = [];
  for (const key of Array.isArray(lines) ? lines : []) {
    if (IOS_STEP_KEYS.includes(key)) {
      const last = segments[segments.length - 1];
      if (last?.kind === 'steps') last.keys.push(key);
      else segments.push({ kind: 'steps', keys: [key] });
    } else segments.push({ kind: 'text', key });
  }
  return segments;
}
