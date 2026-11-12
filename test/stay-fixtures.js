// 체류·조건 도메인 테스트용 가짜 데이터 (AX-302)
//
// 이름·주소는 모두 가상의 자리표시자다. 실제 숙소·의료기관·사람을 가리키지 않는다.
// 병원 안내문 원문, 연락처, 증상은 담지 않는다.

export const SET = (value) => ({ kind: 'SET', value });
export const NONE = Object.freeze({ kind: 'NONE' });
export const UNKNOWN = Object.freeze({ kind: 'UNKNOWN' });

function addr(lat, lng) {
  return { roadAddress: '테스트로 1', lat, lng, source: 'DEMO' };
}

/** 모든 항목이 '아니오'인 본인 체크 항목 — 필요한 항목만 덮어쓴다 */
export function items(overrides = {}) {
  const { diet: dietOverrides, ...rest } = overrides;
  return {
    outing: 'ALLOWED',
    returnTime: { kind: 'NOT_SET' },
    walkLimit: NONE,
    travelLimit: NONE,
    avoidUv: NONE,
    avoidHeat: NONE,
    avoidWater: NONE,
    escortRequired: NONE,
    guardianMustStay: NONE,
    mealRestriction: NONE,
    diet: { spicy: NONE, alcohol: NONE, hard: NONE, hot: NONE, raw: NONE, ...(dietOverrides ?? {}) },
    medication: NONE,
    ...rest,
  };
}

export function selfPeriod(overrides = {}) {
  const { items: itemOverrides, ...rest } = overrides;
  return {
    id: 'P-SELF',
    source: 'SELF',
    startDate: '2026-10-03',
    endDate: '2026-10-08',
    items: items(itemOverrides),
    ...rest,
  };
}

export function hospitalPeriod(overrides = {}) {
  const { items: itemOverrides, ...rest } = overrides;
  return {
    id: 'P-HOSP',
    source: 'HOSPITAL',
    startDate: '2026-10-03',
    endDate: '2026-10-08',
    items: items(itemOverrides),
    planId: 'demo-plan',
    planVersion: 1,
    hospitalId: 'H1',
    expiresAt: '2026-10-20T00:00:00+09:00',
    revoked: false,
    ...rest,
  };
}

/**
 * 입국 10-01 10:00, 출국 10-08 18:00 (7박).
 * 숙소 L1: 10-01~10-05, L2: 10-05~10-08. 수술·시술 10-03 → 경계일 10-03.
 */
export function makeStay(overrides = {}) {
  return {
    schemaVersion: 2,
    arrival: { date: '2026-10-01', time: '10:00', airport: 'ICN' },
    departure: { date: '2026-10-08', time: '18:00', airport: 'GMP' },
    hasCompanion: true,
    interests: ['CAFE', 'SHOPPING'],
    pace: 'RELAXED',
    lodgings: [
      { id: 'L1', name: '테스트 숙소 1', address: addr(37.5, 127.03), checkIn: '2026-10-01', checkOut: '2026-10-05' },
      { id: 'L2', name: '테스트 숙소 2', address: addr(37.51, 127.04), checkIn: '2026-10-05', checkOut: '2026-10-08' },
    ],
    hospitals: [{ id: 'H1', name: '테스트 병원', address: addr(37.52, 127.02) }],
    appointments: [
      { id: 'A1', hospitalId: 'H1', type: 'VISIT', date: '2026-10-02', start: '10:00', source: 'USER' },
      { id: 'A2', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-03', start: '09:30', source: 'USER' },
    ],
    periods: [],
    linkedPlans: [],
    consent: { sensitive: { version: 'consent-v1', agreedAt: '2026-09-30T09:00:00+09:00' } },
    guardianShare: null,
    createdAt: '2026-09-30T09:00:00+09:00',
    updatedAt: '2026-09-30T09:00:00+09:00',
    ...overrides,
  };
}

/** docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)'의 허용 목록 모양: 이름·주소·전화·연결 코드 없음 */
export function makePlanStay(overrides = {}) {
  const stay = makeStay();
  return {
    arrival: stay.arrival,
    departure: stay.departure,
    hasCompanion: stay.hasCompanion,
    interests: stay.interests,
    pace: stay.pace,
    lodgings: stay.lodgings.map(({ id, address, checkIn, checkOut }) => ({
      id,
      lat: address.lat,
      lng: address.lng,
      checkIn,
      checkOut,
    })),
    hospitals: stay.hospitals.map(({ id, address }) => ({ id, lat: address.lat, lng: address.lng })),
    appointments: stay.appointments.map(({ id, hospitalId, type, date, start, end }) => ({
      id,
      hospitalId,
      type,
      date,
      start,
      ...(end ? { end } : {}),
    })),
    periods: [],
    consent: { sensitive: true },
    ...overrides,
  };
}

/** 객체 전체를 얼려서 함수가 입력을 바꾸면 곧바로 드러나게 한다 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
