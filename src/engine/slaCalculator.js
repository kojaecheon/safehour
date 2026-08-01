// SafeHour 복귀 SLA 계산기
//
// 공식:
//   현재시각 + 호출/대기 + 출발지→장소 이동 + 체류 + 장소→병원 이동
//            + 교통변동 버퍼 + 병원도착 준비 버퍼  ≤  복귀시각
//
// 원칙: 직선거리는 후보 "생성"에만 사용하고, 최종 허용 판정은 실제 이동시간으로 한다.

/** 운영 정책 버퍼 (분) — 현장 측정 후 보정 필요 */
export const BUFFER = {
  /** 차량 호출·대기 */
  hailingMin: 5,
  /** 교통 변동 대비 (이동시간의 비율) */
  trafficVariancePct: 0.25,
  /** 병원 도착 후 접수·엘리베이터·도보 */
  hospitalArrivalMin: 10,
  /** 회복기 환자 가산 (보행 저하·휴식) */
  patientExtraMin: 10,
};

/**
 * 복귀 SLA 검증
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
  const travel = outboundMin + inboundMin;
  const trafficBuffer = Math.ceil(travel * BUFFER.trafficVariancePct);
  const patientBuffer = isPatient ? BUFFER.patientExtraMin : 0;

  const requiredMin =
    BUFFER.hailingMin +
    outboundMin +
    stayMin +
    inboundMin +
    trafficBuffer +
    BUFFER.hospitalArrivalMin +
    patientBuffer +
    extraBufferMin;

  const availableMin = Math.floor((returnBy.getTime() - now.getTime()) / 60000);
  const slackMin = availableMin - requiredMin;

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
export function shrinkToFit(params, minStayMin = 15) {
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
