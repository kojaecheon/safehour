// 연동 지침 → 체류 모델 변환, 연결 사본, 재확인 (AX-311 · spec 4.20, 5.1, 5.3, 규칙 11·12·56·57)
//
// 순수 함수 계층이다. 저장·네트워크·화면은 다른 작업이 맡는다
// (저장소 AX-312, 연동 화면 AX-315, 앱 열기 재확인 AX-316).
//
// - 지침의 각 기간은 `HOSPITAL` 조건 기간이 된다. **기간을 잘라내지 않는다.**
//   각 기간에 지침의 `expiresAt`·`revoked` 를 싣고, 적용 여부는 날짜별 합성(`src/stay/coverage.js`)이 정한다(규칙 12).
// - 원문 병원 복귀(`place: "HOSPITAL"`, hospitalId 없음)는 발행 병원이다. 연결 병원 id 로 채운다(규칙 57).
//   연결 병원이 정해지기 전에는 변환하지 않는다.
// - 한 기간 안의 동행 모순(`escortRequired`=예 + `guardianMustStay`=아니오)은 지침을 거부하지 않고 표시한다.
//   그 기간이 덮는 날짜는 합성이 `CONFLICTING_CONDITION` 으로 막는다(규칙 11).
// - 안내문(채널 B)은 변환 결과에 싣지 않는다. 판정에 쓰지 않는다.

import { hospitalPeriodConflict } from '../stay/conditions.js';
import { parseInstantMs } from '../stay/time.js';
import { minimizeConditionItems, normalizeLinkCode } from './gateway.js';
import { acknowledgementKey, stripAcknowledged } from './instructions.js';
import { validatePlan } from './plan.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function toMs(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

function requireValidPlan(plan, what) {
  if (!validatePlan(plan).valid) {
    // 오류 문장에 지침 값(병원 정보·안내문)을 넣지 않는다
    throw new TypeError(`형식이 올바른 v2 지침이 아니어서 ${what}하지 않습니다.`);
  }
}

/** 변환된 기간 id — 지침 id 와 순서로 정한다(결정적). 버전이 바뀌어도 같은 자리면 같은 id 다 */
function hospitalPeriodId(planId, index) {
  return `${planId}:P${index + 1}`;
}

function hospitalAppointmentId(planId, index) {
  return `${planId}:A${index + 1}`;
}

/** 항목을 계약 모양으로 새로 만들고, 병원 복귀에 연결 병원 id 를 채운다 */
function linkItems(items, linkedHospitalId) {
  const out = structuredClone(minimizeConditionItems(items));
  if (out.returnTime?.kind === 'SET' && out.returnTime.place === 'HOSPITAL') {
    out.returnTime = { ...out.returnTime, hospitalId: linkedHospitalId };
  }
  return out;
}

/**
 * v2 지침을 연결 병원 기준의 체류 모델 조각으로 바꾼다 (spec 4.20, 5.1).
 *
 * @param {object} plan  형식이 맞는 v2 지침 (`validatePlan` 통과)
 * @param {string} linkedHospitalId  사용자가 고른 기존 병원 id 또는 새로 추가할 병원 id
 * @returns {{
 *   hospital: {id: string, name: string, address: {roadAddress: string, lat: number, lng: number, source?: 'DEMO'}, phone?: string, linkedPlanId: string},
 *   appointments: Array<{id: string, hospitalId: string, type: 'PROCEDURE'|'VISIT', date: string, start: string, end?: string, source: 'HOSPITAL'}>,
 *   periods: Array<import('../stay/conditions.js').ConditionPeriod>,
 *   conflictingPeriodIds: string[],
 * }}
 *   - `hospital`: 새 병원으로 추가할 때 쓰는 모양. 기존 병원에 연결하면 `linkedPlanId` 만 옮겨 적으면 된다.
 *     주소 출처는 데모 지침이면 `DEMO` 다. 실제 연동 지침의 주소 출처 값은 계약에 아직 없다(실제 연동 병원 0곳).
 *   - `appointments`: 지침의 병원 일정. 같은 날짜·시각·유형 중복 건너뛰기는 합치는 쪽이 한다(spec 4.20).
 *   - `periods`: 잘라내지 않은 `HOSPITAL` 기간. 각 기간에 `planId`·`planVersion`·`hospitalId`·`expiresAt`·`revoked`.
 *   - `conflictingPeriodIds`: 한 기간 안의 동행 모순이 있는 기간(규칙 11). 화면 표시용이다.
 * @throws {TypeError} 연결 병원 id 가 없거나 지침 형식이 틀리면
 */
export function planToStayParts(plan, linkedHospitalId) {
  if (!isNonEmptyString(linkedHospitalId)) {
    throw new TypeError('연결 병원이 정해지기 전에는 지침을 변환하지 않습니다.');
  }
  requireValidPlan(plan, '변환');

  const { name, address, phone } = plan.hospital;
  const hospital = {
    id: linkedHospitalId,
    name,
    address: {
      roadAddress: address.roadAddress,
      lat: address.lat,
      lng: address.lng,
      ...(plan.demo === true ? { source: 'DEMO' } : {}),
    },
    ...(typeof phone === 'string' ? { phone } : {}),
    linkedPlanId: plan.planId,
  };

  const appointments = (plan.appointments ?? []).map((a, i) => ({
    id: hospitalAppointmentId(plan.planId, i),
    hospitalId: linkedHospitalId,
    type: a.type,
    date: a.date,
    start: a.start,
    ...(a.end != null ? { end: a.end } : {}),
    source: 'HOSPITAL',
  }));

  const periods = plan.periods.map((p, i) => ({
    id: hospitalPeriodId(plan.planId, i),
    source: 'HOSPITAL',
    startDate: p.startDate,
    endDate: p.endDate,
    items: linkItems(p.items, linkedHospitalId),
    planId: plan.planId,
    planVersion: plan.version,
    hospitalId: linkedHospitalId,
    expiresAt: plan.expiresAt,
    revoked: plan.revoked,
  }));

  const conflictingPeriodIds = periods.filter(hospitalPeriodConflict).map((p) => p.id);
  return { hospital, appointments, periods, conflictingPeriodIds };
}

/**
 * 기기에 저장할 연결 사본 (spec 5.1 `LinkedPlan`).
 * - `plan`: 받은 지침 그대로이되 `instructions[].acknowledged` 는 버린다
 * - `acknowledged`: 확인 기록의 유일한 정본(`${id}@${updatedAt}` → true).
 *   이전 기록을 넘기면 **지금 지침에 그대로 있는 안내문의 확인만** 이어받는다 —
 *   내용이 바뀌어 `updatedAt` 이 달라진 안내문은 다시 확인해야 한다(규칙 56)
 *
 * @param {{code: string, hospitalId: string, plan: object, fetchedAt: string, acknowledged?: Record<string, true>}} input
 * @throws {TypeError} 코드·병원 id·받은 시각이 없거나 지침 형식이 틀리면
 */
export function toLinkedPlan({ code, hospitalId, plan, fetchedAt, acknowledged = {} }) {
  const normalizedCode = normalizeLinkCode(code);
  if (!normalizedCode) throw new TypeError('연결 코드가 없습니다.');
  if (!isNonEmptyString(hospitalId)) throw new TypeError('연결 병원이 정해지지 않았습니다.');
  if (parseInstantMs(fetchedAt) === null) throw new TypeError('받은 시각이 올바르지 않습니다.');
  requireValidPlan(plan, '저장');

  const copy = stripAcknowledged(plan);
  const current = new Set(copy.instructions.map(acknowledgementKey));
  const kept = {};
  for (const [key, value] of Object.entries(acknowledged ?? {})) {
    if (value === true && current.has(key)) kept[key] = true;
  }
  return { code: normalizedCode, hospitalId, plan: copy, fetchedAt, acknowledged: kept };
}

/** 기간의 판정 입력(날짜·항목)을 비교용 문자열로 */
function periodFingerprint(period) {
  return JSON.stringify([period.startDate, period.endDate, minimizeConditionItems(period.items)]);
}

function range(period) {
  return period ? { startDate: period.startDate, endDate: period.endDate } : null;
}

/**
 * 연동 지침 재확인 — 저장된 사본과 새로 받은 지침을 비교한다 (spec 4.6, 4.20).
 * 앱을 열 때 저장된 코드로 다시 받은 뒤 부른다. 환자 호출 필드는 없다(데모 사건으로만 다룬다).
 *
 * @param {object} previous  저장된 지침 (`LinkedPlan.plan`)
 * @param {object} next      새로 받은 지침 (게이트웨이 통과)
 * @param {{now?: Date|number}} [opts]
 * @returns {{
 *   versionChanged: boolean,
 *   revoked: boolean,
 *   expired: boolean,
 *   changedPeriods: Array<{index: number, before: {startDate: string, endDate: string} | null, after: {startDate: string, endDate: string} | null}>,
 * }}
 *   - `versionChanged`: 지침 id 또는 버전이 다르다 → 사본을 갱신한다
 *   - `revoked`·`expired`: 새 지침의 지금 상태. 외출 중이면 즉시 복귀로 전환한다(spec 4.9)
 *   - `changedPeriods`: 적용이 달라질 수 있는 기간(자리 순). 날짜·항목이 바뀌었거나, 기간이 생기거나 없어졌거나,
 *     지침 전체의 `expiresAt`·`revoked` 가 바뀌어 모든 기간의 적용이 바뀐 경우. 재계획할 날짜 범위를 준다.
 *     안내문만 바뀐 경우는 비어 있다(안내문은 판정에 쓰지 않는다)
 * @throws {TypeError} 두 지침 중 하나라도 형식이 틀리면
 */
export function recheckLinkedPlan(previous, next, { now = Date.now() } = {}) {
  requireValidPlan(previous, '재확인');
  requireValidPlan(next, '재확인');

  const nowMs = toMs(now);
  const samePlan = previous.planId === next.planId;
  const applicationChanged =
    !samePlan ||
    parseInstantMs(previous.expiresAt) !== parseInstantMs(next.expiresAt) ||
    previous.revoked !== next.revoked;

  const changedPeriods = [];
  const count = Math.max(previous.periods.length, next.periods.length);
  for (let index = 0; index < count; index += 1) {
    const before = previous.periods[index];
    const after = next.periods[index];
    const changed =
      !before || !after || applicationChanged || periodFingerprint(before) !== periodFingerprint(after);
    if (changed) changedPeriods.push({ index, before: range(before), after: range(after) });
  }

  return {
    versionChanged: !samePlan || previous.version !== next.version,
    revoked: next.revoked === true,
    expired: parseInstantMs(next.expiresAt) <= nowMs,
    changedPeriods,
  };
}
