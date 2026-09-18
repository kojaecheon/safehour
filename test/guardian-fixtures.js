// 보호자 스냅샷 테스트용 가짜 데이터 (AX-313)
//
// 이름·주소는 모두 가상의 자리표시자다. 실제 숙소·의료기관·사람을 가리키지 않는다.
// 스냅샷에 들어가면 안 되는 값에는 모두 `FORBIDDEN_` 표지를 붙여, 결과 JSON 에 표지가 하나도 없음을 확인한다.

import { makeStay, selfPeriod, hospitalPeriod, SET, NONE } from './stay-fixtures.js';

export const FORBIDDEN_MARK = 'FORBIDDEN_';
/** 병원 좌표 — 스냅샷 어디에도 나오면 안 된다 */
export const HOSPITAL_LAT = 37.5999;
export const HOSPITAL_LNG = 127.0999;

function lodgingAddress(road, lat, lng) {
  return { roadAddress: road, jibunAddress: `${road} 지번`, buildingName: '가상 건물', lat, lng, source: 'DEMO' };
}

/**
 * 체류 — 병원 이름·주소·전화, 병원 안내문, 조건 기간 세부를 모두 채운다.
 * 입국 10-01 10:00, 출국 10-08 18:00, 숙소 L1(10-01~10-05) · L2(10-05~10-08), 수술·시술 10-03.
 */
export function makeGuardianStay(overrides = {}) {
  return makeStay({
    lodgings: [
      { id: 'L1', name: '가상 숙소 하나', address: lodgingAddress('숙소로 1', 37.5, 127.03), checkIn: '2026-10-01', checkOut: '2026-10-05' },
      { id: 'L2', name: '가상 숙소 둘', address: lodgingAddress('숙소로 2', 37.51, 127.04), checkIn: '2026-10-05', checkOut: '2026-10-08' },
    ],
    hospitals: [
      {
        id: 'H1',
        name: 'FORBIDDEN_HOSPITAL_NAME',
        address: { roadAddress: 'FORBIDDEN_HOSPITAL_ADDRESS', jibunAddress: 'FORBIDDEN_HOSPITAL_JIBUN', lat: HOSPITAL_LAT, lng: HOSPITAL_LNG, source: 'DEMO' },
        phone: 'FORBIDDEN_HOSPITAL_PHONE',
        linkedPlanId: 'FORBIDDEN_LINKED_PLAN_ID',
      },
    ],
    appointments: [
      { id: 'FORBIDDEN_APPT_1', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-03', start: '09:30', source: 'USER' },
      { id: 'FORBIDDEN_APPT_2', hospitalId: 'H1', type: 'VISIT', date: '2026-10-04', start: '18:00', end: '18:40', source: 'HOSPITAL' },
    ],
    periods: [
      selfPeriod({
        id: 'FORBIDDEN_PERIOD_SELF',
        items: {
          walkLimit: SET(15),
          avoidUv: SET(true),
          avoidHeat: SET(true),
          avoidWater: SET(true),
          diet: { spicy: SET(true), raw: SET(true) },
          medication: SET([{ time: '13:00', atLodging: true }]),
        },
      }),
      hospitalPeriod({ id: 'FORBIDDEN_PERIOD_HOSP', planId: 'FORBIDDEN_PLAN_ID' }),
    ],
    linkedPlans: [
      {
        code: 'FORBIDDEN_LINK_CODE',
        hospitalId: 'H1',
        plan: {
          schemaVersion: 2,
          planId: 'FORBIDDEN_PLAN_ID',
          hospital: { name: 'FORBIDDEN_HOSPITAL_NAME', address: { roadAddress: 'FORBIDDEN_HOSPITAL_ADDRESS' } },
          instructions: [{ id: 'i1', category: 'CARE', text: 'FORBIDDEN_INSTRUCTION_TEXT', lang: 'ko', updatedAt: '2026-10-01T00:00:00+09:00' }],
        },
        fetchedAt: '2026-10-01T00:00:00+09:00',
        acknowledged: {},
      },
    ],
    guardianShare: { lastSentAt: 'FORBIDDEN_LAST_SENT', planFingerprint: 'FORBIDDEN_FINGERPRINT' },
    ...overrides,
  });
}

function answer(value) {
  return value === undefined ? NONE : SET(value);
}

/**
 * `DayPlan.effective` 모양(spec 5.2) — 모든 항목을 채운다.
 * 넘기지 않은 예/아니오 항목은 '아니오'(NONE)다.
 */
export function effective(overrides = {}) {
  const provenance = [{ periodId: 'FORBIDDEN_PERIOD_SELF', source: 'SELF', defaulted: false }];
  const values = {
    outing: 'ALLOWED',
    returnTime: { kind: 'SET', time: '18:00', place: 'HOSPITAL', hospitalId: 'H1' },
    walkLimit: SET(15),
    travelLimit: SET(20),
    avoidUv: SET(true),
    avoidHeat: SET(true),
    avoidWater: SET(true),
    escortRequired: answer(undefined),
    guardianMustStay: answer(undefined),
    mealRestriction: SET({ mode: 'ALL_DAY' }),
    'diet.spicy': SET(true),
    'diet.alcohol': SET(true),
    'diet.hard': SET(true),
    'diet.hot': SET(true),
    'diet.raw': SET(true),
    medication: SET([{ time: '13:00', atLodging: true }]),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, provenance }]));
}

/** 관광 정거장 — spec 5.2 Stop 필드를 모두 채우고, 스냅샷이 버려야 할 값도 섞는다 */
export function makeStop(date, role, contentId, overrides = {}) {
  return {
    id: `${date}:${role}:${contentId}`,
    candidateId: `FORBIDDEN_CANDIDATE_${contentId}`,
    contentId: `FORBIDDEN_CONTENT_${contentId}`,
    title: `가상 장소 ${contentId}`,
    address: `가상 관광로 ${contentId}`,
    lang: 'ko',
    category: 'CAFE',
    isMeal: false,
    lat: 37.501,
    lng: 127.031,
    ko: { title: `가상 장소 ${contentId}`, address: `가상 관광로 ${contentId}` },
    sourceIds: { ko: `FORBIDDEN_SOURCE_${contentId}` },
    contentTypeIds: { canonical: 'FORBIDDEN_TYPE_39' },
    arriveAt: '13:40',
    leaveAt: '14:40',
    stayMin: 60,
    shortened: false,
    legIn: { min: 12, mode: 'TAXI', estimated: true, route: 'FORBIDDEN_ROUTE' },
    walkBurdenMin: 5,
    indoor: true,
    pinned: true,
    labels: ['ESTIMATED', 'HOURS_UNCONFIRMED', 'DIET_ESTIMATED', 'ORDER_CARD', 'FORBIDDEN_LABEL'],
    image: { url: 'https://example.invalid/FORBIDDEN_IMAGE.jpg', copyrightType: 'Type1' },
    // 허용 목록 밖 필드 — 엔진이 실수로 넣어도 스냅샷에는 들어가면 안 된다
    hospitalName: 'FORBIDDEN_HOSPITAL_NAME',
    diet: { spicy: true, note: 'FORBIDDEN_DIET' },
    ...overrides,
  };
}

/**
 * 하루 일정 (spec 5.2 DayPlan) — 스냅샷이 버려야 할 필드를 모두 채운다.
 */
export function makeDayPlan(date, overrides = {}) {
  return {
    date,
    coverage: 'RESTRICTED',
    dayState: 'TOGETHER',
    reasons: ['MEDICATION_WINDOW'],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'L1',
    transportMode: 'TAXI',
    effective: effective(),
    blocks: [
      { kind: 'MEDICATION', start: '13:00', end: '13:15' },
      { kind: 'APPOINTMENT', start: '17:30', end: '19:00', appointmentId: 'FORBIDDEN_APPT_2' },
    ],
    outings: [],
    guardianOutings: [],
    mealSlots: [{ slot: 'LUNCH', status: 'NONE_AVAILABLE', reasons: ['DIET_RESTRICTED'] }],
    excluded: [{ candidateId: 'FORBIDDEN_EXCLUDED_ID', title: 'FORBIDDEN_EXCLUDED_TITLE', reasons: ['MENU_UNKNOWN'] }],
    warnings: ['MEDICATION_TIMES_MISSING', 'DEFAULTS_APPLIED'],
    returnNow: false,
    delta: { stateChanged: false, reasons: ['FORBIDDEN_DELTA'], hasVisibleChange: false, seen: true },
    intro: { text: 'FORBIDDEN_INTRO_TEXT', source: 'TEMPLATE' },
    // 허용 목록 밖 필드
    hospital: { name: 'FORBIDDEN_HOSPITAL_NAME', phone: 'FORBIDDEN_HOSPITAL_PHONE' },
    instructions: [{ text: 'FORBIDDEN_INSTRUCTION_TEXT' }],
    appointments: [{ id: 'FORBIDDEN_APPT_2' }],
    ...overrides,
  };
}

export function patientOuting(overrides = {}) {
  return {
    id: 'FORBIDDEN_OUTING_P',
    departAt: '10:00',
    returnBy: '12:30',
    returnPlace: 'LODGING',
    deadlineReason: 'MEDICATION',
    latestDepartureAt: '10:10',
    slackMin: 15,
    walkTotalMin: 10,
    travelTotalMin: 24,
    stops: [makeStop('2026-10-04', 'P', 'p1')],
    ...overrides,
  };
}

export function guardianOuting(date, overrides = {}) {
  return {
    id: `FORBIDDEN_OUTING_G_${date}`,
    departAt: '13:20',
    returnBy: '15:30',
    returnPlace: 'LODGING',
    deadlineReason: 'PATIENT_SCHEDULE',
    latestDepartureAt: '13:30',
    slackMin: 12,
    walkTotalMin: 8,
    travelTotalMin: 20,
    stops: [makeStop(date, 'G', 'g1'), makeStop(date, 'G', 'g2', { arriveAt: '14:50', leaveAt: '15:05', stayMin: 15, isMeal: true, category: 'RESTAURANT', indoor: null })],
    // 허용 목록 밖 필드
    hospitalAddress: 'FORBIDDEN_HOSPITAL_ADDRESS',
    reasons: ['FORBIDDEN_OUTING_REASON'],
    ...overrides,
  };
}

/**
 * 체류 전체 일정 (spec 5.1 TripPlan)
 * - 10-01 FREE: 기간 없음, 환자 외출 1개(숙소 복귀)
 * - 10-02 없음 (일정이 만들어지지 않은 날)
 * - 10-03 NEEDS_INPUT: 기간 없음
 * - 10-04 RESTRICTED: 환자 외출 2개(숙소 복귀·병원 복귀), 보호자 외출 1개
 * - 10-05 REST_DAY + 동행 필요: 외출 없음
 * - 10-06 RESTRICTED + 곁을 지켜야 함: 보호자 외출 없음
 * - 09-20 체류 밖 날짜 (들어가면 안 됨)
 */
export function makeTripPlan(overrides = {}) {
  return {
    engineVersion: 'test',
    generatedAt: '2026-09-30T09:00:00+09:00',
    lang: 'ko',
    days: {
      '2026-09-20': makeDayPlan('2026-09-20', { outings: [patientOuting({ returnBy: '11:11' })] }),
      '2026-10-01': makeDayPlan('2026-10-01', {
        coverage: 'FREE',
        effective: {},
        transportMode: 'TRANSIT',
        reasons: [],
        outings: [patientOuting({ returnBy: '16:00', deadlineReason: 'DAY_END' })],
      }),
      '2026-10-03': makeDayPlan('2026-10-03', {
        coverage: 'NEEDS_INPUT',
        dayState: 'NO_TOURISM',
        effective: {},
        reasons: ['CONDITION_INPUT_REQUIRED'],
      }),
      '2026-10-04': makeDayPlan('2026-10-04', {
        outings: [
          patientOuting(),
          patientOuting({ departAt: '15:40', returnBy: '17:20', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT' }),
        ],
        guardianOutings: [guardianOuting('2026-10-04')],
      }),
      '2026-10-05': makeDayPlan('2026-10-05', {
        coverage: 'REST_DAY',
        dayState: 'NO_TOURISM',
        lodgingId: 'L2',
        effective: effective({ outing: 'FORBIDDEN', escortRequired: SET(true) }),
        reasons: ['ESCORT_REQUIRED'],
      }),
      '2026-10-06': makeDayPlan('2026-10-06', {
        lodgingId: 'L2',
        effective: effective({ guardianMustStay: SET(true) }),
        outings: [patientOuting({ returnBy: '12:00', deadlineReason: 'RETURN_TIME' })],
      }),
    },
    edits: { '2026-10-04': { pinned: ['FORBIDDEN_PINNED'], deleted: ['FORBIDDEN_DELETED'], clearedMeals: [] } },
    ...overrides,
  };
}

/** 스냅샷에 나올 수 있는 키 전체 (spec 5.4 허용 목록) */
export const ALLOWED_SNAPSHOT_KEYS = Object.freeze(
  new Set([
    // GuardianSnapshot
    'v',
    'createdAt',
    'expiresAt',
    'lang',
    'days',
    'emergency',
    // day
    'date',
    'escortRequired',
    'guardianSoloAllowed',
    'patientReturn',
    'guardianOutings',
    // patientReturn
    'by',
    'placeName',
    'placeAddress',
    // Outing (deadlineReason 제외)
    'id',
    'departAt',
    'returnBy',
    'returnPlace',
    'latestDepartureAt',
    'slackMin',
    'walkTotalMin',
    'travelTotalMin',
    'stops',
    // Stop — 보호자에게 필요한 것만 (ko 는 한국어 원문이 있을 때만)
    'title',
    'address',
    'ko',
    'lat',
    'lng',
    'arriveAt',
    'leaveAt',
    'category',
  ]),
);

/** 보호자 정거장의 키 전체 (ko 가 있을 때) */
export const GUARDIAN_STOP_KEYS = Object.freeze(['address', 'arriveAt', 'category', 'ko', 'lat', 'leaveAt', 'lng', 'title']);

// ---------------------------------------------------------------------------
// 최악 크기 일정 — 링크 길이 측정용
// ---------------------------------------------------------------------------

const SYLLABLES = [
  '가', '경', '궁', '남', '대', '동', '마', '명', '문', '민', '박', '백', '북', '사', '산', '서', '성', '송', '수', '시',
  '신', '안', '양', '연', '영', '원', '월', '은', '의', '인', '장', '전', '정', '제', '종', '주', '중', '진', '창', '천',
  '청', '초', '충', '태', '평', '포', '하', '한', '해', '현', '호', '홍', '화', '황', '효', '흥', '광', '구', '도', '미',
];
const LATIN = ['ga', 'gyeong', 'gung', 'nam', 'dae', 'dong', 'ma', 'myeong', 'mun', 'min', 'bak', 'baek', 'buk', 'sa', 'san', 'seo', 'seong', 'song', 'su', 'si'];
const CATEGORIES = ['CAFE', 'RESTAURANT', 'SHOPPING', 'PALACE_HISTORY', 'EXHIBITION', 'NATURE', 'KBEAUTY', 'FESTIVAL'];

/** 결정적 의사난수 — 압축이 잘 되지 않는 서로 다른 이름·주소를 만든다 */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

function word(next, parts, min, max) {
  const n = min + Math.floor(next() * (max - min + 1));
  let out = '';
  for (let i = 0; i < n; i += 1) out += parts[Math.floor(next() * parts.length)];
  return out;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * 최악 크기 정거장: 표시 언어(en) 이름·주소와 한국어 원문을 모두 가진, 서로 다른 긴 이름·주소, 소수점 10자리 좌표.
 * 실제 관광공사 원문 길이의 위쪽 끝(한국어 이름 10–14자, 도로명주소 30자 안팎)을 쓴다.
 */
function worstStop(date, index, next) {
  const koTitle = `${word(next, SYLLABLES, 10, 14)} ${word(next, SYLLABLES, 2, 3)}점`;
  const gu = word(next, SYLLABLES, 2, 2);
  const road = word(next, SYLLABLES, 2, 4);
  const no = 1 + Math.floor(next() * 400);
  const koAddress = `서울특별시 ${gu}구 ${road}로${1 + Math.floor(next() * 40)}길 ${no} (${word(next, SYLLABLES, 2, 3)}동)`;
  const enTitle = `${capital(word(next, LATIN, 3, 5))} ${capital(word(next, LATIN, 2, 4))} ${capital(word(next, LATIN, 2, 3))} Branch`;
  const enAddress = `${no}, ${capital(word(next, LATIN, 2, 4))}-ro ${1 + Math.floor(next() * 40)}-gil, ${capital(word(next, LATIN, 2, 3))}-gu, Seoul`;
  return makeStop(date, 'G', `w${index}`, {
    title: enTitle,
    address: enAddress,
    lang: 'en',
    category: CATEGORIES[Math.floor(next() * CATEGORIES.length)],
    lat: Number((37.45 + next() * 0.2).toFixed(10)),
    lng: Number((126.85 + next() * 0.3).toFixed(10)),
    ko: { title: koTitle, address: koAddress },
    arriveAt: `1${Math.floor(next() * 9)}:${String(Math.floor(next() * 60)).padStart(2, '0')}`,
    leaveAt: `1${Math.floor(next() * 9)}:${String(Math.floor(next() * 60)).padStart(2, '0')}`,
  });
}

/**
 * N박 최악 크기 체류·일정 — '보통' 강도의 한도를 모두 채운다.
 * - 날마다 환자 외출 3개(숙소·병원 복귀 섞음), 보호자 외출 2개(정거장 3 + 2 = 하루 한도 5곳)
 * - 모든 정거장이 서로 다른 장소, 숙소 이름은 최대 길이 40자
 * @param {number} nights
 */
export function makeWorstCase(nights) {
  const arrival = '2026-10-01';
  const departure = new Date(Date.parse(`${arrival}T00:00:00Z`) + nights * 86400000).toISOString().slice(0, 10);
  const next = rng(0x5afe + nights);
  const stay = makeGuardianStay({
    departure: { date: departure, time: '18:00', airport: 'ICN' },
    pace: 'NORMAL',
    lodgings: [
      {
        id: 'L1',
        name: '가'.repeat(40),
        address: lodgingAddress('서울특별시 가상구 가상대로12길 345 (가상동, 가상레지던스)', 37.5, 127.03),
        checkIn: arrival,
        checkOut: departure,
      },
    ],
  });
  const days = {};
  let index = 0;
  for (let t = Date.parse(`${arrival}T00:00:00Z`); t <= Date.parse(`${departure}T00:00:00Z`); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const stop = () => worstStop(date, (index += 1), next);
    days[date] = makeDayPlan(date, {
      outings: [
        patientOuting({ departAt: '09:10', returnBy: '11:40', returnPlace: 'LODGING' }),
        patientOuting({ departAt: '14:00', returnBy: '16:20', returnPlace: 'HOSPITAL' }),
        patientOuting({ departAt: '18:10', returnBy: '20:50', returnPlace: 'LODGING' }),
      ],
      guardianOutings: [
        guardianOuting(date, { departAt: '11:50', returnBy: '13:50', stops: [stop(), stop(), stop()] }),
        guardianOuting(date, { departAt: '16:30', returnBy: '18:00', stops: [stop(), stop()] }),
      ],
    });
  }
  return { stay, tripPlan: makeTripPlan({ lang: 'en', days }), now: `${arrival}T08:00:00+09:00` };
}

/** 객체 트리의 모든 키 */
export function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

/** 메모리 저장소 (Web Storage 흉내) */
export function memoryStorage({ async = false } = {}) {
  const map = new Map();
  const wrap = (v) => (async ? Promise.resolve(v) : v);
  return {
    map,
    getItem: (key) => wrap(map.has(key) ? map.get(key) : null),
    setItem: (key, value) => wrap(void map.set(key, String(value))),
    removeItem: (key) => wrap(void map.delete(key)),
  };
}
