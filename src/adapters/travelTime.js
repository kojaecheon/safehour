// 이동시간 어댑터
//
// 왜 어댑터인가
//   카카오모빌리티 Directions API 는 사용 권한 신청·승인이 필요해 리드타임 리스크가 있다.
//   지도 제공사를 나중에 갈아끼울 수 있도록 인터페이스를 고정하고,
//   기본값으로 "보수적 추정" 폴백을 항상 준비한다.
//   심사 시연 중 외부 API 장애가 나도 서비스가 죽지 않아야 한다.

import { haversineKm } from '../engine/slaCalculator.js';

/**
 * 폴백 추정기 — 외부 API 없이 동작하는 보수적 계산
 *
 * 도심 실주행 거리는 직선거리의 약 1.3~1.4배이며,
 * 회복기 환자는 신호·정차·승하차 시간이 더 걸린다고 가정한다.
 * 실제 현장 측정(9월 W7) 후 계수를 보정할 것.
 */
export function createFallbackEstimator({ detourFactor = 1.4, kmphCar = 18, kmphWalk = 3.5, walkThresholdKm = 0.8 } = {}) {
  return {
    name: 'fallback-haversine',
    estimate(from, to) {
      const straight = haversineKm(
        { lat: Number(from.lat), lng: Number(from.lng) },
        { lat: Number(to.lat), lng: Number(to.lng) }
      );
      const road = straight * detourFactor;
      const isWalk = straight <= walkThresholdKm;
      const kmph = isWalk ? kmphWalk : kmphCar;
      // 보수적으로 올림
      const min = Math.max(3, Math.ceil((road / kmph) * 60));
      return { min, source: 'fallback', mode: isWalk ? 'walk' : 'car', straightKm: Number(straight.toFixed(2)) };
    },
  };
}

/**
 * 실 지도 API를 감싸되, 실패 시 자동으로 폴백으로 강등.
 * @param {{estimate:Function, name:string}} primary
 * @param {object} [opts]
 */
export function createResilientEstimator(primary, opts = {}) {
  const fallback = createFallbackEstimator(opts.fallbackOptions);
  const cache = new Map();
  let degraded = false;

  const key = (a, b) => `${a.lat},${a.lng}>${b.lat},${b.lng}`;

  return {
    name: `resilient(${primary?.name ?? 'none'})`,
    get degraded() { return degraded; },
    estimate(from, to) {
      const k = key(from, to);
      if (cache.has(k)) return cache.get(k);

      let result;
      if (primary && !degraded) {
        try {
          result = primary.estimate(from, to);
          if (!result || typeof result.min !== 'number') throw new Error('invalid response');
        } catch {
          degraded = true;
          result = null;
        }
      }
      if (!result) {
        result = fallback.estimate(from, to);
        // 폴백일 때는 화면에 "추정값"임을 반드시 표시할 것
        result.degraded = true;
      }
      cache.set(k, result);
      return result;
    },
    reset() { degraded = false; cache.clear(); },
  };
}

/**
 * 카카오모빌리티 Directions 어댑터 (권한 승인 후 사용)
 * 주의: 좌표를 외부 서버로 전송하는 행위이므로 위치정보 검토 대상에 포함된다.
 *       MVP 단계에서는 사용자가 "선택한" 고정 좌표만 보내고, 현재 GPS는 보내지 않는다.
 */
export function createKakaoEstimator({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('KAKAO_REST_API_KEY 없음');
  return {
    name: 'kakao-directions',
    async estimateAsync(from, to) {
      const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
      url.searchParams.set('origin', `${from.lng},${from.lat}`);
      url.searchParams.set('destination', `${to.lng},${to.lat}`);
      url.searchParams.set('priority', 'RECOMMEND');
      const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
      if (!res.ok) throw new Error(`kakao ${res.status}`);
      const json = await res.json();
      const sec = json?.routes?.[0]?.summary?.duration;
      if (typeof sec !== 'number') throw new Error('duration 없음');
      return { min: Math.ceil(sec / 60), source: 'kakao', mode: 'car' };
    },
    estimate() {
      throw new Error('동기 호출 불가 — estimateAsync 사용 또는 사전 프리페치 필요');
    },
  };
}
