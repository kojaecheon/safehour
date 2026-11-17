// 보호자 링크 동의 화면의 서버 알림 선택 항목 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 8, D6·D12·D14)
//
//   serverPushOptionVisible({ enabled, departureDate, today })  항목을 보이는가
//   serverPushInitialChecked(state)                           처음 체크 상태
//   serverPushSubmitPlan({ visible, checked, state, watchId }) 링크를 만들 때 지켜보기를 어떻게 할지와 스냅샷에 실을 watchId
//   serverPushResultKeys(result)                              링크를 만든 뒤 결과 줄 문구 키(등록)
//   serverPushRetireKeys(result)                              링크를 만든 뒤 결과 줄 안전 문구 키(끄기)
//   applyServerPush(plan, { stay, sync, accountKey })         계획대로 지켜보기를 켜거나 끄고 스냅샷에 실을 watchId 를 준다
//   submitWithServerPush({ option, stay, sync, makeLink, saveLink, readAccountKey })
//                                                             링크 만들기 순서(지켜보기 먼저, 그 id 로 링크, 계정을 다시 보고 기록, 그다음 비우기)
//   SERVER_PUSH_CONSENT_KEYS                                  동의 목록 문구 키(설계서 5.5)
//
// 정한 것
//   - 항목은 서버 알림 스위치가 켜져 있고(GET /api/push/config) 출국일이 오늘 이후(같은 날 포함)일 때만 보인다.
//     스위치가 꺼져 있으면 화면은 예전과 같다.
//   - 처음 체크 상태는 지켜보기가 켜져(ON) 있을 때만 켜짐이다(다르게 정한 것 20). 갈아 끼움(REPLACED)은 꺼짐에서 시작하고,
//     체크하면 같은 watchId 에 새 토큰으로 다시 등록한다(실행기 ensureRegistered, 다르게 정한 것 12).
//   - 체크를 끈 채 링크를 만들면 있는 지켜보기(ON·REPLACED)를 끈다(보호자 사본과 서버 상태가 어긋나지 않게).
//     항목이 숨어 있으면 지켜보기를 건드리지 않고, 켜진 지켜보기의 id 를 그대로 싣는다.
//   - 등록이 실패해도 링크는 만든다(D6). 결과 줄은 이유별로 하나다.
//   - 끄기가 실패해도 링크는 만들고(watchId 없음) 끄지 못했다는 줄을 보인다. 서버 삭제가 남았으면 그 전까지 보호자에게
//     알림이 갈 수 있다는 줄을, 이 기기와 서버 모두에서 껐으면 껐다는 줄을 보인다(작업 7 검토 반영, 화면 검토 M10).
//   - 순서: 지켜보기를 켜거나 끈 결과의 watchId 로 스냅샷을 만든다(등록이 스냅샷보다 먼저다). 링크를 만든 뒤에 비우기를 건다.
//   - 기다리는 동안(등록·끄기·암호화) 계정이 바뀌면 공유 기록을 쓰지 않고 링크도 보이지 않는다(일반 실패 줄). 스냅샷은 양식을 그린
//     계정의 것이라 바뀐 계정의 저장소에 쓰면 안 된다.
//   - 첫 기다림 전에 읽은 계정 키를 켜기·끄기에 넘긴다. 켜기·끄기는 앞선 올리기 뒤에 줄 서므로, 시작될 때 계정이 바뀌었으면 실행기가
//     아무것도 하지 않는다(바뀐 계정의 지켜보기를 켜거나 끄지 않는다, A-3 검토).
//
// React·저장소·네트워크를 직접 쓰지 않는다. 동기화 실행기(getWatchSync())는 부르는 쪽이 넣는다.
// node --test 가 읽으므로 상대 경로로만 불러온다.

import { isDateString } from '../../src/stay/time.js';

/** 동의 목록 문구 키(설계서 5.5 순서). 머리 문장(guardian.serverPushIntro)은 따로 둔다 */
export const SERVER_PUSH_CONSENT_KEYS = Object.freeze([
  'guardian.serverPushStored',
  'guardian.serverPushNotStored',
  'guardian.serverPushDeadlineKind',
  'guardian.serverPushRetention',
  'guardian.serverPushOffline',
  'guardian.serverPushAlertRule',
  'guardian.serverPushLocation',
]);

/** 등록 실패 이유 → 결과 줄 문구 키. 모르는 이유는 UNAVAILABLE 로 본다 */
const REASON_KEY = Object.freeze({
  LOGIN_REQUIRED: 'guardian.serverPushLogin',
  RATE_LIMITED: 'guardian.serverPushLimit',
  OFF: 'guardian.serverPushOffNow',
  UNAVAILABLE: 'guardian.serverPushUnavailable',
});

/** 링크를 만들 때 지켜보기에 할 일 */
export const SERVER_PUSH_ACTION = Object.freeze({
  /** 켠다(ON 이면 요청 없이 그 id, REPLACED 면 같은 id 에 새 토큰, 없으면 새 id) */
  REGISTER: 'REGISTER',
  /** 끈다(서버 삭제 대기로 옮긴다) */
  RETIRE: 'RETIRE',
  /** 건드리지 않는다 */
  KEEP: 'KEEP',
});

/**
 * 서버 알림 항목을 보이는가: 스위치가 켜져 있고 출국일이 오늘(KST) 이후(같은 날 포함)일 때만.
 * @param {{ enabled: boolean, departureDate: string|null|undefined, today: string|null|undefined }} args
 * @returns {boolean}
 */
export function serverPushOptionVisible({ enabled, departureDate, today } = {}) {
  return enabled === true && isDateString(departureDate) && isDateString(today) && departureDate >= today;
}

/**
 * 처음 체크 상태: 지켜보기가 켜져(ON) 있을 때만 켜짐이다. REPLACED·NONE 은 꺼짐이다.
 * @param {'ON'|'REPLACED'|'NONE'|null|undefined} state
 * @returns {boolean}
 */
export function serverPushInitialChecked(state) {
  return state === 'ON';
}

/**
 * 링크를 만들 때 지켜보기에 할 일과, 등록하지 않을 때 스냅샷에 실을 watchId.
 *   - 항목이 보이고 체크가 켜져 있음: REGISTER(실을 id 는 등록 결과에서 온다, 여기서는 null)
 *   - 항목이 보이고 체크가 꺼져 있음: 지켜보기가 있으면(ON·REPLACED) RETIRE, 없으면 KEEP. 실을 id 는 null
 *   - 항목이 숨어 있음: KEEP. 지켜보기가 ON 이면 그 id 를 그대로 싣는다(스위치를 잠시 끈 경우 등)
 * @param {{ visible: boolean, checked: boolean, state: 'ON'|'REPLACED'|'NONE', watchId: string|null }} args
 *   watchId: 켜진(ON) 지켜보기의 id(useGuardianWatch 가 준 값)
 * @returns {{ action: 'REGISTER'|'RETIRE'|'KEEP', watchId: string|null }}
 */
export function serverPushSubmitPlan({ visible, checked, state, watchId = null } = {}) {
  if (visible === true) {
    if (checked === true) return { action: SERVER_PUSH_ACTION.REGISTER, watchId: null };
    const exists = state === 'ON' || state === 'REPLACED';
    return { action: exists ? SERVER_PUSH_ACTION.RETIRE : SERVER_PUSH_ACTION.KEEP, watchId: null };
  }
  const kept = state === 'ON' && typeof watchId === 'string' && watchId !== '' ? watchId : null;
  return { action: SERVER_PUSH_ACTION.KEEP, watchId: kept };
}

/**
 * 링크를 만든 뒤 결과 줄의 문구 키. 등록하지 않았으면(null) 줄이 없다.
 * @param {null | { ok: true } | { ok: false, reason: string }} result  ensureRegistered 결과
 * @returns {string[]}
 */
export function serverPushResultKeys(result) {
  if (!result || typeof result !== 'object') return [];
  if (result.ok === true) return ['guardian.serverPushOn'];
  return ['guardian.serverPushNotOn', REASON_KEY[result.reason] ?? REASON_KEY.UNAVAILABLE];
}

/**
 * 체크를 끈 채 링크를 만들어 지켜보기를 끈(retire) 결과 줄의 안전 문구 키(guardian safety 블록, 작업 7 검토 반영).
 *   - 끄지 않았으면(null) 줄이 없다. 이 기기와 서버 모두에서 지웠으면({ ok: true, pending: false }) 껐다는 줄(화면 검토 M10).
 *   - 이 기기에서는 껐지만 서버 삭제가 남았으면(pending: true) 그 전까지 알림이 갈 수 있다는 줄.
 *   - 끄지 못했으면(ok: false, 모양이 틀린 결과 포함) 끄지 못했다는 줄. 꺼졌다고 쓰지 않는다.
 * @param {null | { ok: true, pending: boolean } | { ok: false, reason?: string }} result  retire 결과
 * @returns {string[]}
 */
export function serverPushRetireKeys(result) {
  if (result === null || result === undefined) return [];
  if (result?.ok === true && result.pending === false) return ['guardian.serverPushTurnedOff'];
  if (result?.ok === true && result.pending === true) return ['guardian.serverPushTurnOffPending'];
  return ['guardian.serverPushTurnOffFailed'];
}

/**
 * 링크를 만들기 전에 계획대로 서버 알림 지켜보기를 켜거나 끈다. 던지지 않는다.
 *   - REGISTER: ensureRegistered. 성공하면 그 watchId 를 싣는다. 실패하거나 실행기가 없으면 id 없이 이유를 돌려준다(링크는 막지 않는다)
 *   - RETIRE: retire. 결과와 상관없이 id 를 싣지 않는다. 실행기가 없거나 던지면 끄지 못한 것({ ok: false })으로 본다
 *   - KEEP: 요청 없이 계획의 watchId(숨은 항목의 켜진 지켜보기 id, 아니면 null)를 싣는다
 * accountKey 를 받으면 켜기·끄기에 그대로 넘긴다(받지 않으면 넘기지 않는다).
 * @param {{ action: string, watchId: string|null }} plan  serverPushSubmitPlan 결과
 * @param {{ stay: object|null, sync: { ensureRegistered: Function, retire: Function } | null | undefined, accountKey?: string|null }} deps
 * @returns {Promise<{ watchId: string|null, serverPush: null | { ok: true } | { ok: false, reason: string }, serverPushRetire: null | object }>}
 *   serverPush: 등록을 시도했을 때만 그 결과(결과 줄), 아니면 null
 *   serverPushRetire: 끄기를 시도했을 때만 retire 결과(결과 줄), 아니면 null
 */
export async function applyServerPush(plan, { stay, sync, accountKey } = {}) {
  const scope = accountKey === undefined ? {} : { accountKey };
  if (plan?.action === SERVER_PUSH_ACTION.REGISTER) {
    let registered;
    try {
      registered = sync ? await sync.ensureRegistered({ stay, ...scope }) : null;
    } catch {
      registered = null;
    }
    if (registered?.ok === true) return { watchId: registered.watchId, serverPush: { ok: true }, serverPushRetire: null };
    return { watchId: null, serverPush: { ok: false, reason: registered?.reason ?? 'UNAVAILABLE' }, serverPushRetire: null };
  }
  if (plan?.action === SERVER_PUSH_ACTION.RETIRE) {
    let retired;
    try {
      retired = sync ? await sync.retire(scope) : null;
    } catch {
      retired = null;
    }
    // 끄지 못해도 링크는 만들고 id 는 싣지 않는다. 결과 줄이 끄지 못했다고 알린다
    return { watchId: null, serverPush: null, serverPushRetire: retired ?? { ok: false } };
  }
  return { watchId: plan?.watchId ?? null, serverPush: null, serverPushRetire: null };
}

/** 링크를 만드는 동안 계정이 바뀌어 기록도 표시도 하지 않았다(submitWithServerPush 가 던지는 오류의 code). 화면은 일반 실패 줄을 보인다 */
export const SUBMIT_ACCOUNT_CHANGED = 'GUARDIAN_SUBMIT_ACCOUNT_CHANGED';

/**
 * 보호자 링크 만들기 순서. 항목 상태로 계획을 세우고(serverPushSubmitPlan), 지켜보기를 켜거나 끈 뒤(applyServerPush) 그 결과의
 * watchId 로 링크를 만들고(makeLink), 공유 기록을 쓰고(saveLink), 비우기를 건다(kick('register')). makeLink·saveLink 가 던지면
 * 그대로 던진다(지켜보기 결과와 상관없이 링크를 만들지 못한 것이다).
 * 계정: 스냅샷은 양식을 그린 계정의 체류·일정으로 만든다. 그래서 첫 기다림 전에 계정 키(readAccountKey)를 잡아 두고 기록 직전에
 * 다시 본다. 바뀌었으면 기록하지 않고 SUBMIT_ACCOUNT_CHANGED 를 던진다(앞 계정의 사본이 바뀐 계정의 저장소에 쓰이거나
 * 화면에 보이지 않게). 다시 보는 것과 기록 사이에는 기다림이 없다. 잡아 둔 키는 켜기·끄기에도 넘긴다(줄 선 일이 시작될 때
 * 계정이 바뀌었으면 실행기가 아무것도 하지 않는다). 비우기는 이 확인을 지난 뒤에만 건다.
 * @template T, S
 * @param {object} args
 * @param {{ visible: boolean, checked: boolean, state: 'ON'|'REPLACED'|'NONE', watchId: string|null }} args.option  항목 상태
 * @param {object|null} args.stay
 * @param {{ ensureRegistered: Function, retire: Function, kick?: Function } | null | undefined} args.sync  getWatchSync()
 * @param {(watchId: string|null) => Promise<T>} args.makeLink  스냅샷·크기·암호화·링크(기기에 쓰지 않는다)
 * @param {((link: T) => S) | null} [args.saveLink]  공유 기록 쓰기(동기). 없으면 saved 는 null
 * @param {(() => string|null) | null} [args.readAccountKey]  지금 계정 키. 없으면 계정을 보지 않는다
 * @returns {Promise<{ link: T, saved: S|null, serverPush: object|null, serverPushRetire: object|null }>}
 */
export async function submitWithServerPush({ option, stay, sync, makeLink, saveLink = null, readAccountKey = null }) {
  const accountKey = readAccountKey ? readAccountKey() : undefined;
  const push = await applyServerPush(serverPushSubmitPlan(option), { stay, sync, accountKey });
  const link = await makeLink(push.watchId);
  if (readAccountKey && readAccountKey() !== accountKey) {
    throw Object.assign(new Error('submitWithServerPush: accountKey'), { code: SUBMIT_ACCOUNT_CHANGED });
  }
  const saved = saveLink ? saveLink(link) : null;
  void sync?.kick?.('register');
  return { link, saved, serverPush: push.serverPush, serverPushRetire: push.serverPushRetire };
}
