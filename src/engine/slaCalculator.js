// SafeHour 복귀 SLA 계산기
//
// 공식:
//   현재시각 + 호출/대기 + 출발지→장소 이동 + 체류 + 장소→병원 이동
//            + 교통변동 버퍼 + 병원도착 준비 버퍼  ≤  복귀시각
//
// 원칙: 직선거리는 후보 "생성"에만 사용하고, 최종 허용 판정은 실제 이동시간으로 한다.
//
// 하루 일정(AX-306)은 같은 식을 외출 단위로 쓴다 (spec 4.7 복귀 계산식):
//   출발 + 호출·대기 5분 + Σ이동 + Σ체류 + 교통 변동 25%×Σ이동
//        + 도착 여유 10분 + (RESTRICTED 날의 환자만) 회복기 가산 10분  ≤  마감
// checkSla 는 이 식의 정거장 1곳 경우다. 식은 checkOutingSla 한곳에만 있다.

import { DEFAULTS } from '../stay/defaults.js';

/**
 * 운영 정책 버퍼 (분) — 현장 측정 후 보정 필요.
 * 값의 정본은 src/stay/defaults.js 의 DEFAULTS.buffers 다(사람 검토 전 임시값). 여기서는 기존 이름으로 읽기만 한다.
 */
export const BUFFER = Object.freeze({
  /** 차량 호출·대기 */
  hailingMin: DEFAULTS.buffers.hailingMin,
  /** 교통 변동 대비 (이동시간의 비율) */
  trafficVariancePct: DEFAULTS.buffers.trafficVariancePct,
  /** 도착 여유: 병원 도착 후 접수·엘리베이터·도보 (복귀 계산식에서 한 번만 더한다) */
  hospitalArrivalMin: DEFAULTS.buffers.arrivalMarginMin,
  /** 회복기 환자 가산 (보행 저하·휴식) — RESTRICTED 날의 환자만 */
  patientExtraMin: DEFAULTS.buffers.recoveryExtraMin,
});

/**
 * 외출 단위 복귀 계산 (spec 4.7). 시각은 모두 같은 기준의 분(예: 그날 자정부터의 분)이다.
 *
 * @param {object} p
 * @param {number}   p.departMin        출발 시각(분)
 * @param {number}   p.deadlineMin      복귀 마감(분)
 * @param {number[]} p.legsMin          모든 이동 구간(출발·정거장 사이·복귀) 추정(분)
 * @param {number[]} p.staysMin         정거장별 체류(분)
 * @param {boolean}  [p.recoveryBuffer] 회복기 가산을 더하는가 (RESTRICTED 날의 환자만)
 * @param {number}   [p.extraBufferMin] 추가 버퍼(교통 급증 등)
 * @returns {{ok: boolean, requiredMin: number, slackMin: number, latestDepartMin: number,
 *            travelMin: number, breakdown: object}}
 *   latestDepartMin = 마감 − requiredMin: 늦어도 이 시각에 외출을 시작(호출)해야 한다
 */
export function checkOutingSla({
  departMin, deadlineMin, legsMin, staysMin,
  recoveryBuffer = false, extraBufferMin = 0,
}) {
  const travelMin = legsMin.reduce((sum, m) => sum + m, 0);
  const stayTotal = staysMin.reduce((sum, m) => sum + m, 0);
  const trafficBuffer = Math.ceil(travelMin * BUFFER.trafficVariancePct);
  const recovery = recoveryBuffer ? BUFFER.patientExtraMin : 0;

  const requiredMin =
    BUFFER.hailingMin + travelMin + stayTotal + trafficBuffer +
    BUFFER.hospitalArrivalMin + recovery + extraBufferMin;
  const slackMin = deadlineMin - departMin - requiredMin;

  return {
    ok: slackMin >= 0,
    requiredMin,
    slackMin,
    latestDepartMin: deadlineMin - requiredMin,
    travelMin,
    breakdown: {
      hailing: BUFFER.hailingMin,
      travel: travelMin,
      stay: stayTotal,
      trafficBuffer,
      arrivalMargin: BUFFER.hospitalArrivalMin,
      recoveryBuffer: recovery,
      extraBuffer: extraBufferMin,
    },
  };
}

/**
 * 복귀 SLA 검증 — 정거장 1곳 외출 (checkOutingSla 의 특수한 경우)
 * @param {object} p
 * @param {Date}   p.now              현재 시각
 * @param {Date}   p.returnBy         병원 복귀 마감 시각
 * @param {number} p.outboundMin      출발지 → 장소 실제 이동시간(분)
 * @param {number} p.inboundMin       장소 → 병원 실제 이동시간(분)
 * @param {number} p.stayMin          체류시간(분)
 * @param {boolean} [p.isPatient]     환자 여정인지 (가산 버퍼 적용)
 * @param {number} [p.extraBufferMin] 추가 버퍼(교통 급증 등)
 */
export function checkSla({
  now, returnBy, outboundMin, inboundMin, stayMin,
  isPatient = false, extraBufferMin = 0,
}) {
  const availableMin = Math.floor((returnBy.getTime() - now.getTime()) / 60000);
  const outing = checkOutingSla({
    departMin: 0,
    deadlineMin: availableMin,
    legsMin: [outboundMin, inboundMin],
    staysMin: [stayMin],
    recoveryBuffer: isPatient,
    extraBufferMin,
  });
  const { requiredMin, slackMin } = outing;
  const { trafficBuffer, recoveryBuffer: patientBuffer } = outing.breakdown;

  // "몇 시까지 출발해야 하는가" — 화면에 반드시 표시할 값
  const latestDepartureAt = new Date(
    returnBy.getTime() -
      (outboundMin + stayMin + inboundMin + trafficBuffer +
        BUFFER.hospitalArrivalMin + patientBuffer + extraBufferMin) * 60000
  );

  return {
    ok: slackMin >= 0,
    availableMin,
    requiredMin,
    slackMin,
    latestDepartureAt,
    breakdown: {
      hailing: BUFFER.hailingMin,
      outbound: outboundMin,
      stay: stayMin,
      inbound: inboundMin,
      trafficBuffer,
      hospitalArrival: BUFFER.hospitalArrivalMin,
      patientBuffer,
      extraBuffer: extraBufferMin,
    },
  };
}

/**
 * 체류시간을 줄여서라도 SLA를 맞출 수 있는지 탐색 (코스 "축소" 로직)
 * @returns {{ok:boolean, stayMin:number, sla:object}|null}
 */
export function shrinkToFit(params, minStayMin = DEFAULTS.minStopStayMin) {
  let stay = params.stayMin;
  while (stay >= minStayMin) {
    const sla = checkSla({ ...params, stayMin: stay });
    if (sla.ok) return { ok: true, stayMin: stay, sla, shrunk: stay < params.stayMin };
    stay -= 5;
  }
  return null;
}

/** 지구 반경 기반 직선거리 (km) — 후보 생성 전용, 허용 판정에 쓰지 말 것 */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
