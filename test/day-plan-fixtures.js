// AX-306 — 하루 일정 엔진 테스트용 가짜 데이터 (실제 호출 없음)
//
// 장소 후보는 관광 후보 모듈의 정규화 함수(normalizeTourCandidate)로 만든다 — 엔진이 실제로 받는 모양과 같다.
// 이름·주소·좌표는 모두 테스트용으로 지어낸 것이다. 실제 장소·의료기관을 가리키지 않는다.
// 필드 이름과 코드 체계(유형 12·14·38·39, 분류체계 FD01·FD04·FD05 등)는 src/tour-api 주석의 공식 근거를 따른다.

import { normalizeTourCandidate } from '../src/tour-api/mapper.js';
import { SET, NONE, UNKNOWN, items } from './stay-fixtures.js';

export { SET, NONE, UNKNOWN };

/** 정규화 기준 시각 — 데이터 최신성(dataFresh) 계산에만 쓰인다 */
const NORMALIZED_AT = new Date('2026-09-18T00:00:00Z');

/** 숙소 기준점 (가상) */
export const HOME = Object.freeze({ lat: 37.5, lng: 127.03 });
/** 병원 기준점 (가상, 숙소에서 북쪽 약 2.2km) */
export const CLINIC_POINT = Object.freeze({ lat: 37.52, lng: 127.03 });

const KM_PER_DEG_LAT = 111.2;
const KM_PER_DEG_LNG = 111.2 * Math.cos((37.5 * Math.PI) / 180);

/** 숙소에서 북쪽 north km, 동쪽 east km 인 좌표 */
export function around(north, east = 0, base = HOME) {
  return {
    lat: Number((base.lat + north / KM_PER_DEG_LAT).toFixed(6)),
    lng: Number((base.lng + east / KM_PER_DEG_LNG).toFixed(6)),
  };
}

const FOREIGN_TYPE = { 12: '76', 14: '78', 15: '85', 28: '75', 32: '80', 38: '79', 39: '82' };

/**
 * 정규화 후보 하나.
 * @param {string} contentId
 * @param {object} o
 * @param {string} o.title       국문 제목
 * @param {string} [o.type]      국문 유형 코드 (기본 14 문화시설 — 실내, 보행 15분, 체류 45분)
 * @param {object} [o.lcls]      분류체계 { lclsSystm1, lclsSystm2, lclsSystm3 }
 * @param {number} [o.north]     숙소 기준 북쪽 km
 * @param {number} [o.east]      숙소 기준 동쪽 km
 * @param {object} [o.menu]      국문 메뉴 원문 { firstmenu, treatmenu }
 * @param {object} [o.schedule]  국문 운영 원문 { restdate… }
 * @param {object} [o.tags]      자체 태그 (indoor 등)
 * @param {string} [o.lang]      표시 언어
 * @param {string} [o.en]        영문 제목 (있으면 영문 항목을 매칭)
 * @param {string} [o.ja]        일문 제목
 * @param {string} [o.zh]        중문 제목
 */
export function place(contentId, o = {}) {
  const { title, type = '14', lcls = {}, north = 1, east = 0, menu, schedule, tags = {}, lang = 'en' } = o;
  const { lat, lng } = around(north, east);
  const item = (id, ctype, name, addr) => ({
    contentid: String(id),
    contenttypeid: ctype,
    title: name,
    addr1: addr,
    mapx: String(lng),
    mapy: String(lat),
    modifiedtime: '20260801120000',
    ...lcls,
  });
  const korean = item(contentId, type, title, '서울특별시 테스트구 테스트로 1');
  const foreign = (suffix, name) =>
    name ? item(`${contentId}${suffix}`, FOREIGN_TYPE[type] ?? type, name, '1, Test-ro, Seoul') : undefined;
  const intro = menu || schedule ? { schedule: schedule ?? null, menu: menu ?? null } : null;
  return normalizeTourCandidate({
    korean,
    english: foreign('1', o.en),
    japanese: foreign('2', o.ja),
    chineseSimplified: foreign('3', o.zh),
    intro,
    tags,
    now: NORMALIZED_AT,
    lang,
  });
}

/** 한식 식당(메뉴 원문 있음, 매운·날음식 단서 없음) */
export const restaurant = (id, o = {}) =>
  place(id, {
    type: '39',
    lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' },
    menu: { firstmenu: '비빔밥', treatmenu: '된장찌개' },
    ...o,
  });

/** 카페 (분류체계 FD05) */
export const cafe = (id, o = {}) =>
  place(id, { type: '39', lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD05', lclsSystm3: 'FD050100' }, ...o });

/** 실내 문화시설(보행 15분, 체류 45분) */
export const museum = (id, o = {}) => place(id, { type: '14', ...o });

/** 쇼핑(실내, 보행 15분, 체류 40분) */
export const shop = (id, o = {}) => place(id, { type: '38', lcls: { lclsSystm1: 'SH' }, ...o });

/**
 * 국문 제목이 비어 있는 후보 (규칙 27).
 * 다른 fixture 는 모두 국문 제목을 채우므로 '국문 원문이 비었을 때' 경로가 가려진다.
 * 국문 제목이 비면 표시 제목은 선택 언어를 따라 달라진다 — 그래도 판정은 같아야 한다.
 */
export const blankKoreanTitle = (id, o = {}) => place(id, { title: '   ', ...o });

/**
 * 체류 모델 — 입국 10-01 06:00(창 09:00부터), 출국 10-10 23:00.
 * 숙소 L1 하나(10-01~10-10). 수술·시술 10-04 09:00 → 경계일 10-04. 10-01~10-03 은 기간이 없으면 FREE.
 * 동의 있음, 보호자 있음, 관심사 없음, 느긋하게.
 */
export function stay(overrides = {}) {
  return {
    schemaVersion: 2,
    arrival: { date: '2026-10-01', time: '06:00', airport: 'ICN' },
    departure: { date: '2026-10-10', time: '23:00', airport: 'ICN' },
    hasCompanion: true,
    interests: [],
    pace: 'RELAXED',
    lodgings: [
      {
        id: 'L1',
        name: '테스트 숙소',
        address: { roadAddress: '테스트로 1', lat: HOME.lat, lng: HOME.lng, source: 'DEMO' },
        checkIn: '2026-10-01',
        checkOut: '2026-10-10',
      },
    ],
    hospitals: [
      {
        id: 'H1',
        name: '테스트 병원',
        address: { roadAddress: '테스트로 2', lat: CLINIC_POINT.lat, lng: CLINIC_POINT.lng, source: 'DEMO' },
      },
    ],
    appointments: [{ id: 'A-PROC', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-04', start: '09:00', source: 'USER' }],
    periods: [],
    linkedPlans: [],
    consent: { sensitive: { version: 'consent-v1', agreedAt: '2026-09-30T09:00:00+09:00' } },
    guardianShare: null,
    createdAt: '2026-09-30T09:00:00+09:00',
    updatedAt: '2026-09-30T09:00:00+09:00',
    ...overrides,
  };
}

/** 10-05~10-09 에 적용되는 본인 체크 기간 (기본: 모든 항목 '아니오', 외출 허용, 복귀 시각 없음) */
export function period(itemOverrides = {}, overrides = {}) {
  return {
    id: 'P1',
    source: 'SELF',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    items: items(itemOverrides),
    ...overrides,
  };
}

/** 제한일(RESTRICTED) 체류 — 10-05 에 period(itemOverrides) 적용 */
export function restrictedStay(itemOverrides = {}, stayOverrides = {}) {
  return stay({ periods: [period(itemOverrides)], ...stayOverrides });
}

/** 공항 이동 추정(분) — 입국일·출국일 창 계산용 */
export const AIRPORT_TRAVEL = Object.freeze({ airportToLodgingMin: 60, lodgingToAirportMin: 60 });

/** "HH:MM" → 분 */
export const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 모든 외출(환자·보호자)의 정거장 */
export const allStops = (day) => [...day.outings, ...day.guardianOutings].flatMap((o) => o.stops);
export const patientIds = (day) => day.outings.flatMap((o) => o.stops.map((s) => s.contentId));
