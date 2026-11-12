// 병원 연동(데모) 화면의 순수 함수: 지침을 체류에 합치기, 안내 확인 (AX-315 · docs/business-rules.md '병원 연동', docs/contracts.md '`POST /api/plan/link`')
//
// 화면은 여기서 다음 체류를 만든 뒤 저장소에 **한 번** 쓴다(updateStay). 재계획은 저장소를 구독하는
// 동기화 작업(AX-316)이 한다 — 이 파일과 화면은 일정 API 를 부르지 않는다.
//
// - 변환은 src/recovery/link.js 의 planToStayParts(지침, 연결 병원 id) 가 한다. 연결 병원이 정해진 뒤에만 부른다.
//   병원 복귀 항목의 hospitalId 가 연결 병원 id 로 채워진다(docs/contracts.md '`POST /api/plan/link`'). 기간은 잘라내지 않는다(docs/business-rules.md '병원 연동').
// - 병원 일정은 연결 병원의 일정으로 더하되, **같은 날짜·시각·유형**의 일정이 이미 있으면 중복으로 보고 건너뛴다(docs/platform/IA_AND_FLOWS.md '병원 연동(데모)').
// - 연결 사본(LinkedPlan)은 toLinkedPlan 으로 만든다 — 안내문의 acknowledged 는 버리고, 확인 기록 정본은
//   `${id}@${updatedAt}` 키 지도다. 처음 연결하면 비어 있다(docs/business-rules.md '병원 연동').
// - 안내문(채널 B) 문장은 읽지도 바꾸지도 않는다. 분류·id·updatedAt 만 본다.
//
// Next 밖(node --test)에서도 읽히도록 상대 경로만 쓴다.

import { CONDITION_SOURCE } from '../../src/stay/conditions.js';
import { ERROR_CODE } from '../../src/stay/errorCodes.js';
import { parseInstantMs } from '../../src/stay/time.js';
import { PLAN_LINK_ERROR, normalizeLinkCode } from '../../src/recovery/gateway.js';
import {
  CRITICAL_CATEGORIES,
  INSTRUCTION_CATEGORIES,
  acknowledgementKey,
} from '../../src/recovery/instructions.js';
import { planToStayParts, toLinkedPlan } from '../../src/recovery/link.js';

/** 데모 연결 코드: 화면의 예시 버튼 (docs/business-rules.md '병원 연동'). 문구 키는 conditions 이름공간 */
export const DEMO_CODES = Object.freeze([
  Object.freeze({ code: 'DEMO-A', labelKey: 'link.demoStandard' }),
  Object.freeze({ code: 'DEMO-B', labelKey: 'link.demoRestricted' }),
  Object.freeze({ code: 'DEMO-C', labelKey: 'link.demoExpired' }),
]);

/** /api/plan/link 오류 코드 → 문구 키 (모든 오류 응답은 errorCode 키, docs/contracts.md '공통') */
const ERROR_KEY = Object.freeze({
  [ERROR_CODE.AUTH_REQUIRED]: 'link.errLogin',
  [PLAN_LINK_ERROR.CODE_REQUIRED]: 'link.errRequired',
  [PLAN_LINK_ERROR.UNKNOWN_CODE]: 'link.errUnknown',
  [PLAN_LINK_ERROR.INVALID_PLAN]: 'link.errInvalid',
  [PLAN_LINK_ERROR.BAD_REQUEST]: 'link.errInvalid',
});

/** @param {string} errorCode */
export function linkErrorKey(errorCode) {
  return ERROR_KEY[errorCode] ?? 'link.errInvalid';
}

/** 로그인이 필요해서 실패했는가 — 401 또는 SAFEHOUR_AUTH_REQUIRED */
export function isAuthRequired(status, errorCode) {
  return status === 401 || errorCode === ERROR_CODE.AUTH_REQUIRED;
}

/**
 * 지침 전체의 지금 상태 — 철회 > 만료 > 유효. 읽을 수 없는 유효기간은 만료로 본다.
 * (날짜별 적용은 합성 규칙 src/stay/coverage.js 가 활동 종료 시각 기준으로 따로 정한다)
 * @returns {'ACTIVE'|'EXPIRED'|'REVOKED'}
 */
export function planState(plan, nowMs = Date.now()) {
  if (plan?.revoked === true) return 'REVOKED';
  const expiresMs = parseInstantMs(plan?.expiresAt);
  if (expiresMs === null || expiresMs <= nowMs) return 'EXPIRED';
  return 'ACTIVE';
}

/** '새 병원으로 추가'할 때의 병원 id — 지침 id 에서 정한다(다시 연결해도 같은 병원) */
export function linkHospitalId(planId) {
  return `HL-${String(planId ?? '').replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

function slotKey(appointment) {
  return `${appointment?.date}|${appointment?.start}|${appointment?.type}`;
}

/**
 * 병원 일정 합치기: 같은 날짜·시각(시작)·유형이 이미 있으면 건너뛴다(docs/platform/IA_AND_FLOWS.md '병원 연동(데모)').
 * 입력 배열은 바꾸지 않는다.
 * @template T
 * @param {T[]} existing
 * @param {T[]} incoming
 * @returns {{appointments: T[], added: T[], skipped: T[]}}
 */
export function mergeAppointments(existing = [], incoming = []) {
  const taken = new Set(existing.map(slotKey));
  const added = [];
  const skipped = [];
  for (const appointment of incoming) {
    const key = slotKey(appointment);
    if (taken.has(key)) {
      skipped.push(appointment);
      continue;
    }
    taken.add(key);
    added.push(appointment);
  }
  return { appointments: [...existing, ...added], added, skipped };
}

function withoutLink(hospital, planIds) {
  if (!hospital || !planIds.has(hospital.linkedPlanId)) return hospital;
  const { linkedPlanId: _unlinked, ...rest } = hospital;
  return rest;
}

/** 이 지침(planId)이 만든 병원 일정인가 — 변환이 `${planId}:A<n>` id 를 준다 */
function fromPlans(appointment, planIds) {
  if (appointment?.source !== 'HOSPITAL' || typeof appointment.id !== 'string') return false;
  return [...planIds].some((planId) => appointment.id.startsWith(`${planId}:`));
}

/**
 * 받은 지침을 체류에 합친다. 입력 체류는 바꾸지 않는다.
 *
 * - hospital.kind 'EXISTING': 사용자가 고른 기존 병원에 연결 표시(linkedPlanId)만 더한다(이름·주소는 사용자 값 유지).
 * - hospital.kind 'NEW': 지침의 병원을 `linkHospitalId(planId)` 로 추가한다(이미 있으면 교체).
 * - 같은 코드나 같은 지침(planId)을 다시 연결하면 이전 사본·HOSPITAL 기간·그 지침의 병원 일정·연결 표시를 교체한다.
 *   이전 확인 기록은 지금 안내문과 같은 키(id@updatedAt)만 이어받는다(docs/business-rules.md '병원 연동').
 *
 * @param {object} stay
 * @param {{code: string, plan: object, hospital: {kind: 'EXISTING', id: string} | {kind: 'NEW'}, fetchedAt: string}} input
 * @returns {{
 *   stay: object, hospitalId: string,
 *   addedAppointments: object[], skippedAppointments: object[],
 *   periodIds: string[], conflictingPeriodIds: string[],
 * }}
 * @throws {TypeError} 병원 선택이 틀렸거나 지침 형식이 틀리면
 */
export function applyLinkedPlan(stay, { code, plan, hospital, fetchedAt }) {
  const hospitals = Array.isArray(stay?.hospitals) ? stay.hospitals : [];
  let hospitalId;
  if (hospital?.kind === 'EXISTING') {
    if (!hospitals.some((h) => h?.id === hospital.id)) throw new TypeError('등록되지 않은 병원에는 연결할 수 없습니다.');
    hospitalId = hospital.id;
  } else if (hospital?.kind === 'NEW') {
    hospitalId = linkHospitalId(plan?.planId);
  } else {
    throw new TypeError('연결할 병원을 고르지 않았습니다.');
  }

  const parts = planToStayParts(plan, hospitalId);
  const normalizedCode = normalizeLinkCode(code);
  const previousLinks = (stay?.linkedPlans ?? []).filter(
    (item) => item?.code === normalizedCode || item?.plan?.planId === plan.planId,
  );
  const replacedPlanIds = new Set([plan.planId, ...previousLinks.map((item) => item?.plan?.planId).filter(Boolean)]);
  const previousAcks = Object.assign({}, ...previousLinks.map((item) => item?.acknowledged ?? {}));

  const linkedPlan = toLinkedPlan({ code: normalizedCode, hospitalId, plan, fetchedAt, acknowledged: previousAcks });

  // 병원: 이전 연결 표시를 지우고, 고른 병원에 연결한다
  let nextHospitals = hospitals.map((h) => withoutLink(h, replacedPlanIds));
  if (hospital.kind === 'EXISTING') {
    nextHospitals = nextHospitals.map((h) => (h?.id === hospitalId ? { ...h, linkedPlanId: plan.planId } : h));
  } else if (nextHospitals.some((h) => h?.id === hospitalId)) {
    nextHospitals = nextHospitals.map((h) => (h?.id === hospitalId ? structuredClone(parts.hospital) : h));
  } else {
    nextHospitals = [...nextHospitals, structuredClone(parts.hospital)];
  }

  // 병원 일정: 이 지침이 전에 더한 일정을 빼고 다시 합친다
  const keptAppointments = (stay?.appointments ?? []).filter((a) => !fromPlans(a, replacedPlanIds));
  const merged = mergeAppointments(keptAppointments, parts.appointments);

  // 조건 기간: 이 지침의 HOSPITAL 기간을 교체한다(잘라내지 않는다)
  const keptPeriods = (stay?.periods ?? []).filter(
    (p) => !(p?.source === CONDITION_SOURCE.HOSPITAL && replacedPlanIds.has(p.planId)),
  );

  const keptLinks = (stay?.linkedPlans ?? []).filter((item) => !previousLinks.includes(item));

  return {
    stay: {
      ...stay,
      hospitals: nextHospitals,
      appointments: merged.appointments,
      periods: [...keptPeriods, ...parts.periods],
      linkedPlans: [...keptLinks, linkedPlan],
    },
    hospitalId,
    addedAppointments: merged.added,
    skippedAppointments: merged.skipped,
    periodIds: parts.periods.map((p) => p.id),
    conflictingPeriodIds: parts.conflictingPeriodIds,
  };
}

/**
 * 안내문 목록(채널 B) — 분류 순서로 묶는다. 같은 분류 안에서는 병원이 준 순서를 지킨다.
 * 문장은 그대로 넘긴다(번역·요약·편집하지 않는다).
 * @param {{instructions?: object[]}} plan
 * @param {Record<string, true>} [acknowledged]  LinkedPlan.acknowledged
 * @returns {Array<{instruction: object, key: string, acknowledged: boolean, critical: boolean}>}
 */
export function guideEntries(plan, acknowledged = {}) {
  const list = Array.isArray(plan?.instructions) ? plan.instructions : [];
  const order = (category) => {
    const index = INSTRUCTION_CATEGORIES.indexOf(category);
    return index === -1 ? INSTRUCTION_CATEGORIES.length : index;
  };
  return list
    .map((instruction, position) => ({ instruction, position }))
    .sort((a, b) => order(a.instruction?.category) - order(b.instruction?.category) || a.position - b.position)
    .map(({ instruction }) => {
      const key = acknowledgementKey(instruction);
      return {
        instruction,
        key,
        acknowledged: acknowledged?.[key] === true,
        critical: CRITICAL_CATEGORIES.includes(instruction?.category),
      };
    });
}

/**
 * '전체 확인' — 지금 안내문 전부를 `${id}@${updatedAt}` 키로 확인한 새 지도.
 * 지금 지침에 없는 옛 키는 남기지 않는다.
 * @param {{instructions?: object[]}} plan
 * @returns {Record<string, true>}
 */
export function acknowledgeAllMap(plan) {
  const next = {};
  for (const instruction of plan?.instructions ?? []) next[acknowledgementKey(instruction)] = true;
  return next;
}
