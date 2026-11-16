// 받은 일정 화면(/g)의 '앱이 닫혀 있어도 받기' 항목 표시 규칙 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7,
// 다르게 정한 것 1·2, 정한 값 5·9·10·12·16·25·27·28)
//
//   guardianPushViewModel({ state, watchId, mainOn, writable, offline, today })
//     → { itemState, showSwitch, switchOn, switchDisabled, switchLocked, lines, result, actions, actionsDisabled,
//         showMute, muteOn, muteDisabled, muteLocked, consentLines, safetyLines }
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
//     로그인을 권하지 않고 연결 안내만 둔다. 다시 켜기·다시 받기 버튼은 숨긴다.
//   - 결과 줄은 실행기 결과마다 하나다. 실패는 alert, 나머지는 status 다. 상태 줄과 같은 문구면 한 번만 보인다. 모르는 결과는 줄이 없다.
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
  GONE: Object.freeze(['guardian.pushGone']),
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
 */
export function guardianPushViewModel({ state, watchId, mainOn, writable, offline = false, today = null } = {}) {
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
  const lines = [...STATE_LINES[itemState]];
  let actions = [...(STATE_ACTIONS[itemState] ?? [])];

  if (!canWrite && showSwitch) {
    // 보기 전용: 구독·끄기·다시 켜기·다시 받기를 할 수 없다
    actions = actions.filter((action) => action !== PUSH_ACTION.RENEW && action !== PUSH_ACTION.TAKE_OVER);
    if (offline) lines.push('settings.offlineNote');
    else {
      lines.push(switchOn ? 'settings.readOnlyNote' : 'guardian.pushLogin');
      actions.push(PUSH_ACTION.LOGIN);
    }
  }

  let result = resultLine(state.lastResult, offline);
  if (result && lines.includes(result.key)) result = null;
  if (state.lastResult === PUSH_RESULT.LOGIN_REQUIRED && !offline && !actions.includes(PUSH_ACTION.LOGIN)) {
    actions.push(PUSH_ACTION.LOGIN);
  }

  const showMute = itemState === PUSH_ITEM_STATE.ON && canWrite && enabled;
  const status = state.status ?? null;
  const muteOn = showMute && status?.muted === true && (today === null || status.date === today);

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
