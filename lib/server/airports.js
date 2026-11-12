// 입국·출국 공항 이동 추정 (AX-308 · docs/business-rules.md '체류'의 입국일 시작·출국일 마감, docs/platform/ITINERARY_RULES.md '공항 이동 추정 (`lib/server/airports.js` `AIRPORT_TRANSFER`)')
//
// 공항 좌표는 고정 상수다. 사용자 위치가 아니다.
// 근거: 국토교통부 항공정보간행물(eAIP Republic of Korea) AD 2.2 'ARP coordinates and site at AD'
//   - RKSI 인천국제공항  372745N 1262621E  https://aim.koca.go.kr/eaipPub/Package/2019-12-04-AIRAC/html/eAIP/KR-AD-2.RKSI-en-GB.html
//   - RKSS 김포국제공항  373325N 1264751E  https://aim.koca.go.kr/eaipPub/Package/2019-12-04-AIRAC/html/eAIP/KR-AD-2.RKSS-en-GB.html
//   (2026-09-19 확인. 비행장 기준점(ARP)이며 여객터미널 좌표가 아니다 — 차이는 승차·터미널 시간에 흡수한다)
//
// 공항↔숙소 구간에는 공항 이동 전용 추정을 쓴다. 엔진의 도심 택시 추정기(직선×1.4, 18km/h)는 신호·정차가 많은
// 도심 구간 기준이라 고속도로가 대부분인 공항 구간에서 인천↔강남이 4시간 가까이 나와 입국일·출국일 창을 비현실적으로
// 줄였다. 도심 구간(숙소↔장소·병원)은 엔진의 기존 추정기를 그대로 쓴다. 외부 호출이 없고 결정적이다.

import { haversineKm } from '../../src/engine/slaCalculator.js';
import { lodgingForDate } from '../../src/stay/stay.js';

const dms = (d, m, s) => Number((d + m / 60 + s / 3600).toFixed(6));

/** 공항 기준점 (WGS84) */
export const AIRPORT_POINTS = Object.freeze({
  ICN: Object.freeze({ lat: dms(37, 27, 45), lng: dms(126, 26, 21) }),
  GMP: Object.freeze({ lat: dms(37, 33, 25), lng: dms(126, 47, 51) }),
});

/**
 * 공항 이동 추정 — 조정 가능한 기본값 (사람 검토 전 임시값).
 *   분 = 올림(직선거리 km × detourFactor ÷ speedKmh × 60 + terminalMin)
 * 실제 공항버스·택시 소요와 비교해 사람이 확인한 뒤 고친다. 입국 수속(90분)·공항 도착 여유(3시간)·출국 여유(30분)는
 * 별도 기본값(src/stay/defaults.js DEFAULTS.airport)이고 여기에 더하지 않는다.
 */
export const AIRPORT_TRANSFER = Object.freeze({
  /** 도로 우회 계수(직선거리에 곱함) — 조정 가능한 기본값 (사람 검토 전 임시값) */
  detourFactor: 1.3,
  /** 평균 속도(km/h, 고속도로 위주) — 조정 가능한 기본값 (사람 검토 전 임시값) */
  speedKmh: 60,
  /** 승차 대기·터미널 이동(분) — 조정 가능한 기본값 (사람 검토 전 임시값) */
  terminalMin: 15,
});

/**
 * 공항↔숙소 구간 전용 추정기. 엔진 추정기와 같은 모양({ estimate(from, to) → { min, ... } })이다.
 * @param {typeof AIRPORT_TRANSFER} [params]
 */
export function createAirportTransferEstimator({ detourFactor, speedKmh, terminalMin } = AIRPORT_TRANSFER) {
  return {
    name: 'airport-transfer',
    estimate(from, to) {
      const straightKm = haversineKm({ lat: Number(from.lat), lng: Number(from.lng) }, { lat: Number(to.lat), lng: Number(to.lng) });
      const min = Math.ceil(((straightKm * detourFactor) / speedKmh) * 60 + terminalMin);
      return { min, source: 'fallback', mode: 'car', straightKm: Number(straightKm.toFixed(2)) };
    },
  };
}

function minutesBetween(estimator, from, to) {
  return Math.ceil(estimator.estimate(from, to).min);
}

/**
 * 입국일 공항→숙소, 출국일 숙소→공항 이동 추정(분). 엔진 입력 `airportTravel` 이다.
 * 그날 숙소가 없으면(숙소 구간이 비는 날) 등록된 숙소 중 가장 먼 곳으로 계산한다 — 창을 넓히는 쪽으로 틀리지 않게.
 * @param {object} stay  PlanStay (validatePlanStay 통과)
 * @param {{estimate: Function}} [estimator]  기본: 공항 이동 전용 추정
 * @returns {{airportToLodgingMin: number, lodgingToAirportMin: number}}
 */
export function airportTravelMinutes(stay, estimator = createAirportTransferEstimator()) {
  const lodgings = (stay?.lodgings ?? []).filter((l) => Number.isFinite(l?.lat) && Number.isFinite(l?.lng));
  const leg = (airportCode, date, toAirport) => {
    const airport = AIRPORT_POINTS[airportCode];
    if (!airport || lodgings.length === 0) return 0;
    const lodging = lodgingForDate(stay, date);
    const candidates = lodging && Number.isFinite(lodging.lat) ? [lodging] : lodgings;
    return Math.max(
      ...candidates.map((l) => (toAirport ? minutesBetween(estimator, l, airport) : minutesBetween(estimator, airport, l))),
    );
  };
  return {
    airportToLodgingMin: leg(stay?.arrival?.airport, stay?.arrival?.date, false),
    lodgingToAirportMin: leg(stay?.departure?.airport, stay?.departure?.date, true),
  };
}
