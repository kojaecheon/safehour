// 체류 변경 → 영향 날짜 (AX-316 · spec 4.9 변화 원천 1·2, 재계획 규칙)
//
// 날짜마다 **일정 입력 서명**을 만들고, 이전·다음 체류의 서명이 다른 날짜만 영향 날짜로 본다.
// 서명은 PlanStay(서버가 보는 값)에서만 만든다 — 이름·주소 글자·전화·연동 사본·보호자 공유·수정 시각이 바뀌어도
// 재계획하지 않는다. 날짜 D의 서명에 드는 것:
//   - D가 입국일·출국일이면 그 시각·공항(입국일 시작·출국일 마감)
//   - D의 숙소(출국일은 전날 밤 숙소) id·좌표
//   - D의 병원 일정, 그 병원과 D를 덮는 기간의 병원 복귀가 가리키는 병원 좌표
//   - D가 수술 후 경계일 이후인가(분류가 바뀐다)
//   - D를 덮는 기간(id·출처·제한 없음·항목, 병원 기간은 D 기준 적용 상태 ACTIVE/EXPIRED/REVOKED).
//     기간의 날짜 범위 자체는 넣지 않는다 — 범위를 넓혀도 원래 덮던 날짜의 판정은 같다
//   - 민감정보 동의(경계일 이후이거나 D를 덮는 기간이 있을 때만 판정에 쓰인다)
//   - 동반 보호자·관심사·강도(모든 날짜)
//
// 순수 함수다. 입력을 바꾸지 않는다.

import { canonicalJson } from '../store/fingerprint.js';
import { hospitalPeriodStatus, periodCoversDate } from '../../src/stay/coverage.js';
import { appointmentsOnDate, lodgingForDate, postProcedureBoundary } from '../../src/stay/stay.js';
import { eachDate, isDateString } from '../../src/stay/time.js';
import { toPlanStay } from './planStay.js';

/** 체류 날짜 목록 — 입국·출국 날짜가 올바르지 않으면 빈 목록 */
export function safeStayDates(stay) {
  const a = stay?.arrival?.date;
  const d = stay?.departure?.date;
  if (!isDateString(a) || !isDateString(d) || d < a) return [];
  return eachDate(a, d);
}

function byId(a, b) {
  const x = String(a?.id);
  const y = String(b?.id);
  return x === y ? 0 : x < y ? -1 : 1;
}

function hospitalPoint(ps, id) {
  const h = (ps.hospitals ?? []).find((item) => item?.id === id);
  return h ? { id, lat: h.lat, lng: h.lng } : { id, missing: true };
}

/**
 * 날짜 하나의 일정 입력 서명 (PlanStay 기준).
 * @param {object} ps  PlanStay
 * @param {string} date
 * @returns {string}
 */
export function dateInputSignature(ps, date) {
  const boundary = postProcedureBoundary(ps);
  const postBoundary = boundary === null || date >= boundary;
  const covering = (ps.periods ?? []).filter((p) => periodCoversDate(p, date)).sort(byId);
  const appointments = appointmentsOnDate(ps, date).map((a) => ({ ...a }));
  const hospitalIds = new Set(appointments.map((a) => a.hospitalId));
  for (const p of covering) {
    const rt = p?.items?.returnTime;
    if (rt?.kind === 'SET' && rt.place === 'HOSPITAL' && rt.hospitalId) hospitalIds.add(rt.hospitalId);
  }
  const lodging = lodgingForDate(ps, date);
  return canonicalJson({
    arrival: ps.arrival?.date === date ? ps.arrival : null,
    departure: ps.departure?.date === date ? ps.departure : null,
    lodging: lodging ? { id: lodging.id, lat: lodging.lat, lng: lodging.lng } : null,
    appointments,
    hospitals: [...hospitalIds].sort().map((id) => hospitalPoint(ps, id)),
    postBoundary,
    periods: covering.map((p) => ({
      id: p.id,
      source: p.source,
      noRestriction: p.noRestriction === true,
      items: p.items ?? null,
      status: p.source === 'HOSPITAL' ? hospitalPeriodStatus(p, date) : null,
    })),
    consent: postBoundary || covering.length > 0 ? ps.consent?.sensitive === true : null,
    hasCompanion: ps.hasCompanion === true,
    interests: ps.interests ?? [],
    pace: ps.pace ?? null,
  });
}

/**
 * 이전 체류와 다음 체류를 비교한다.
 * @param {object|null} prev  이전 기기 체류 (없으면 다음 체류의 모든 날짜가 영향 날짜)
 * @param {object|null} next  다음 기기 체류
 * @returns {{
 *   dates: string[],          // 다음 체류의 날짜 중 다시 판정할 날짜(오름차순)
 *   removedDates: string[],   // 체류에서 빠진 날짜 — 저장 일정·편집 기록에서 지운다
 *   companionTurnedOn: boolean,
 *   companionTurnedOff: boolean,
 *   consentWithdrawn: boolean,
 * }}
 */
export function diffStay(prev, next) {
  const a = toPlanStay(prev);
  const b = toPlanStay(next);
  const before = a ? safeStayDates(a) : [];
  const after = b ? safeStayDates(b) : [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const dates = after.filter((d) => !beforeSet.has(d) || dateInputSignature(a, d) !== dateInputSignature(b, d));
  return {
    dates,
    removedDates: before.filter((d) => !afterSet.has(d)),
    companionTurnedOn: a !== null && a.hasCompanion !== true && b?.hasCompanion === true,
    companionTurnedOff: a?.hasCompanion === true && b !== null && b.hasCompanion !== true,
    consentWithdrawn: a?.consent?.sensitive === true && b !== null && b.consent?.sensitive !== true,
  };
}
