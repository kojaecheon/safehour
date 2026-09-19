// 입국·출국 공항 이동 추정 (AX-308 · spec 4.1 입국일 시작·출국일 마감, 규칙 14·15)
//
// 공항 좌표는 고정 상수다. 사용자 위치가 아니다.
// 근거: 국토교통부 항공정보간행물(eAIP Republic of Korea) AD 2.2 'ARP coordinates and site at AD'
//   - RKSI 인천국제공항  372745N 1262621E  https://aim.koca.go.kr/eaipPub/Package/2019-12-04-AIRAC/html/eAIP/KR-AD-2.RKSI-en-GB.html
//   - RKSS 김포국제공항  373325N 1264751E  https://aim.koca.go.kr/eaipPub/Package/2019-12-04-AIRAC/html/eAIP/KR-AD-2.RKSS-en-GB.html
//   (2026-09-19 확인. 비행장 기준점(ARP)이며 여객터미널 좌표가 아니다 — 추정 오차는 이동 추정기의 보수 계수가 흡수한다)
//
// 이동 시간은 엔진이 제한일에 쓰는 기존 택시 추정기(createFallbackEstimator)로 계산한다. 외부 호출이 없고 결정적이다.
// 이 추정기는 도심 기준 보수값(직선×1.4, 18km/h)이라 공항 구간에서는 실제보다 길게 나온다 — 창이 좁아지는(안전한) 쪽이다.

import { createFallbackEstimator } from '../../src/adapters/travelTime.js';
import { lodgingForDate } from '../../src/stay/stay.js';

const dms = (d, m, s) => Number((d + m / 60 + s / 3600).toFixed(6));

/** 공항 기준점 (WGS84) */
export const AIRPORT_POINTS = Object.freeze({
  ICN: Object.freeze({ lat: dms(37, 27, 45), lng: dms(126, 26, 21) }),
  GMP: Object.freeze({ lat: dms(37, 33, 25), lng: dms(126, 47, 51) }),
});

function minutesBetween(estimator, from, to) {
  return Math.ceil(estimator.estimate({ lat: Number(from.lat), lng: Number(from.lng) }, { lat: Number(to.lat), lng: Number(to.lng) }).min);
}

/**
 * 입국일 공항→숙소, 출국일 숙소→공항 이동 추정(분). 엔진 입력 `airportTravel` 이다.
 * 그날 숙소가 없으면(숙소 구간이 비는 날) 등록된 숙소 중 가장 먼 곳으로 계산한다 — 창을 넓히는 쪽으로 틀리지 않게.
 * @param {object} stay  PlanStay (validatePlanStay 통과)
 * @param {{estimate: Function}} [estimator]
 * @returns {{airportToLodgingMin: number, lodgingToAirportMin: number}}
 */
export function airportTravelMinutes(stay, estimator = createFallbackEstimator()) {
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
