// 보호자 링크 동의 화면의 서버 알림 선택 항목 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 8, D6·D12·D14)
//
//   serverPushOptionVisible({ enabled, departureDate, today })  항목을 보이는가
//   serverPushInitialChecked(state)                           처음 체크 상태
//   serverPushSubmitPlan({ visible, checked, state, watchId }) 링크를 만들 때 지켜보기를 어떻게 할지와 스냅샷에 실을 watchId
//   serverPushResultKeys(result)                              링크를 만든 뒤 결과 줄 문구 키(등록)
//   serverPushRetireKeys(result)                              링크를 만든 뒤 결과 줄 안전 문구 키(끄기)
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
//     알림이 갈 수 있다는 줄을 보인다(작업 7 검토 반영).
//
// 순수 모듈이다(React·저장소·네트워크 없음). node --test 가 읽으므로 상대 경로로만 불러온다.

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
 *   - 끄지 않았으면(null) 줄이 없다. 이 기기와 서버 모두에서 지웠으면({ ok: true, pending: false }) 줄이 없다.
 *   - 이 기기에서는 껐지만 서버 삭제가 남았으면(pending: true) 그 전까지 알림이 갈 수 있다는 줄.
 *   - 끄지 못했으면(ok: false, 모양이 틀린 결과 포함) 끄지 못했다는 줄. 꺼졌다고 쓰지 않는다.
 * @param {null | { ok: true, pending: boolean } | { ok: false, reason?: string }} result  retire 결과
 * @returns {string[]}
 */
export function serverPushRetireKeys(result) {
  if (result === null || result === undefined) return [];
  if (result?.ok === true && result.pending === false) return [];
  if (result?.ok === true && result.pending === true) return ['guardian.serverPushTurnOffPending'];
  return ['guardian.serverPushTurnOffFailed'];
}
