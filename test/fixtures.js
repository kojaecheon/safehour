// 심사 시연용 고정 데이터
// 병원 좌표는 "테스트 기준점"이며 특정 의료기관 추천이 아니다. (의료법 알선 회피)

/** 강남 지역 테스트 기준점 (실제 의료기관 아님 · 좌표 예시) */
export const TEST_ORIGIN = { name: '강남 기준점 A', lat: 37.5172, lng: 127.0286 };
export const TEST_HOSPITAL = { name: '강남 기준점 A', lat: 37.5172, lng: 127.0286 };

export function makeCondition(overrides = {}) {
  return {
    version: 'v1',
    issuedAt: new Date('2026-07-28T08:00:00+09:00'),
    issuedBy: '코디네이터',
    rawText: '수술 후 1일차: 외출 60분 이내, 자외선 회피, 격한 운동 금지',
    fasting: false,
    outingAllowed: true,
    escortRequired: false,
    avoidUv: true,
    indoorOnly: false,
    maxWalkMin: 20,
    maxTravelMin: 20,
    ...overrides,
  };
}

export function makePlan(overrides = {}) {
  return {
    now: new Date('2026-07-28T13:00:00+09:00'),
    returnBy: new Date('2026-07-28T16:00:00+09:00'),
    origin: TEST_ORIGIN,
    hospital: TEST_HOSPITAL,
    ...overrides,
  };
}

/** TourAPI 응답을 SafeHour 후보로 정규화한 형태 */
export function makeCandidates() {
  return [
    {
      id: 'c-indoor-cafe', title: '실내 카페 (도보 5분)',
      lat: 37.5185, lng: 127.0300,
      indoor: true, hasFood: true, uvExposed: false,
      walkMin: 5, stayMin: 30, congestion: 'low', openNow: true, dataFresh: true,
      source: 'TourAPI:KorService2',
    },
    {
      id: 'c-indoor-gallery', title: '실내 갤러리 (차량 8분)',
      lat: 37.5250, lng: 127.0400,
      indoor: true, hasFood: false, uvExposed: false,
      walkMin: 10, stayMin: 40, congestion: 'low', openNow: true, dataFresh: true,
      source: 'TourAPI:KorService2',
    },
    {
      id: 'c-outdoor-park', title: '야외 공원 산책로',
      lat: 37.5210, lng: 127.0350,
      indoor: false, hasFood: false, uvExposed: true,
      walkMin: 15, stayMin: 30, congestion: 'low', openNow: true, dataFresh: true,
      source: 'TourAPI:KorService2',
    },
    {
      id: 'c-far-palace', title: '먼 고궁 (차량 35분)',
      lat: 37.5760, lng: 126.9770,
      indoor: false, hasFood: false, uvExposed: true,
      walkMin: 40, stayMin: 90, congestion: 'high', openNow: true, dataFresh: true,
      source: 'TourAPI:KorService2',
    },
    {
      id: 'c-unknown-indoor', title: '실내여부 불명 시설',
      lat: 37.5190, lng: 127.0310,
      indoor: null, hasFood: false, uvExposed: false,
      walkMin: 8, stayMin: 30, congestion: 'low', openNow: true, dataFresh: true,
      source: 'TourAPI:KorService2',
    },
  ];
}

export const ROLES = {
  withCompanion: { hasCompanion: true, companionSeparateAllowed: true, patientResting: false },
  companionOnly: { hasCompanion: true, companionSeparateAllowed: true, patientResting: true },
  alone: { hasCompanion: false, companionSeparateAllowed: false, patientResting: false },
};
