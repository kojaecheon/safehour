// 시안 보드 '화면 시안'의 고정 데모 데이터 (AX-321 · spec 7장 '고정 데모 데이터만 쓰고 사용자 데이터는 읽지 않는다')
//
// 여기 있는 체류·하루 일정은 **손으로 적은 고정 값**이다. 기기 저장소·세션·서버·관광공사 API 를 부르지 않는다.
// 모양은 spec 5.1 Stay · 5.2 DayPlan 그대로이고, 날짜 분류·합성 값(effective)은 도메인 함수(classifyStay)로 채운다 —
// 화면 부품이 실제 앱과 같은 입력을 받게 하려는 것이다. 판정 엔진은 돌리지 않는다(시각·장소는 예시값).
//
// 원칙
//   - 이름·주소는 모두 '데모'다. 실제 업소·병원을 가리키지 않는다(경복궁 같은 공공 명소 이름만 예외).
//     표시 이름은 designBoard 이름공간 문구(4개 언어)이고, 한국어 원문은 같은 문구의 ko 값이다.
//   - 정거장에 사진을 넣지 않는다. 사진이 있으면 화면이 'ⓒ한국관광공사' 출처를 붙이는데, 데모 그림은 관광공사 사진이
//     아니다 — 유형별 일러스트로 보인다.
//   - 병원 전화는 걸리지 않는 자리표시자 번호다. 시안은 누를 수 없게(inert) 그린다.
//
// Next 밖(node)에서도 읽히도록 상대 경로만 쓴다.

import { classifyStay } from '../../src/stay/coverage.js';
import { overlayTodayGate } from '../../src/stay/todayGate.js';
import { buildTodayCards } from '../../components/cards/cardModel.js';
import { buildGuardianSnapshot } from '../../src/guardian/snapshot.js';
import { translate } from '../../src/i18n/index.js';

/** 시안의 '지금' — 2026-10-05 09:10 (KST). 오늘 매일 확인 전, 첫 외출 전이다 */
export const DEMO_TODAY = '2026-10-05';
export const DEMO_DETAIL_DATE = '2026-10-06';
export const DEMO_NOW = `${DEMO_TODAY}T09:10:00+09:00`;
export const DEMO_NOW_MIN = 9 * 60 + 10;
/** 같은 시각의 epoch ms. 화면 부품이 시각을 숫자로 받는 자리에 쓴다 */
export const DEMO_NOW_MS = Date.parse(DEMO_NOW);

const SET = (value) => ({ kind: 'SET', value });
const NONE = Object.freeze({ kind: 'NONE' });
const UNKNOWN = Object.freeze({ kind: 'UNKNOWN' });

const LODGING_POINT = Object.freeze({ lat: 37.5609, lng: 126.986 });
const HOSPITAL_POINT = Object.freeze({ lat: 37.5163, lng: 127.0203 });

/** 본인 체크 항목 — 모두 '아니오'에서 필요한 것만 바꾼다 (spec 5.1 ConditionItems) */
function items(overrides = {}) {
  const { diet, ...rest } = overrides;
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
    diet: { spicy: NONE, alcohol: NONE, hard: NONE, hot: NONE, raw: NONE, ...(diet ?? {}) },
    medication: NONE,
    ...rest,
  };
}

/** 본인 체크 기간 3개 — 수술일(외출 불가·곁 지키기), 다음 날(외출 불가), 그 뒤(제한 항목 여럿 + 모르겠음 하나) */
export const DEMO_PERIODS = Object.freeze([
  {
    id: 'P-DEMO-1',
    source: 'SELF',
    startDate: '2026-10-03',
    endDate: '2026-10-03',
    items: items({ outing: 'FORBIDDEN', guardianMustStay: SET(true) }),
  },
  {
    id: 'P-DEMO-2',
    source: 'SELF',
    startDate: '2026-10-04',
    endDate: '2026-10-04',
    items: items({ outing: 'FORBIDDEN' }),
  },
  {
    id: 'P-DEMO-3',
    source: 'SELF',
    startDate: '2026-10-05',
    endDate: '2026-10-08',
    items: items({
      returnTime: { kind: 'SET', time: '20:00', place: 'LODGING' },
      walkLimit: UNKNOWN,
      travelLimit: SET(30),
      avoidUv: SET(true),
      avoidHeat: SET(true),
      avoidWater: SET(true),
      diet: { spicy: SET(true), alcohol: SET(true), hot: SET(true), raw: SET(true) },
      medication: SET([
        { time: '13:30', atLodging: true },
        { time: '21:00', atLodging: false },
      ]),
    }),
  },
]);

/** 체류 — 입국 10-02, 수술 10-03, 진료 10-05, 출국 10-08. 이름·주소는 한국어 원문(도로명주소 검색 결과 모양) */
function demoStay() {
  return {
    schemaVersion: 2,
    arrival: { date: '2026-10-02', time: '11:00', airport: 'ICN' },
    departure: { date: '2026-10-08', time: '18:00', airport: 'ICN' },
    hasCompanion: true,
    interests: ['PALACE_HISTORY', 'KBEAUTY', 'CAFE'],
    pace: 'RELAXED',
    lodgings: [
      {
        id: 'L-DEMO',
        name: translate('designBoard.demoLodging', 'ko'),
        address: { roadAddress: '데모 주소 · 서울 중구 명동 인근', ...LODGING_POINT, source: 'DEMO' },
        checkIn: '2026-10-02',
        checkOut: '2026-10-08',
      },
    ],
    hospitals: [
      {
        id: 'H-DEMO',
        name: translate('designBoard.demoHospital', 'ko'),
        address: { roadAddress: '데모 주소 · 서울 강남구 신사동 일대', ...HOSPITAL_POINT, source: 'DEMO' },
        // 걸리지 않는 자리표시자(국번 0000). 시안은 inert 라 누를 수도 없다
        phone: '02-0000-0000',
      },
    ],
    appointments: [
      { id: 'A-DEMO-PROC', hospitalId: 'H-DEMO', type: 'PROCEDURE', date: '2026-10-03', start: '10:00', source: 'USER' },
      { id: 'A-DEMO-VISIT', hospitalId: 'H-DEMO', type: 'VISIT', date: DEMO_TODAY, start: '16:00', source: 'USER' },
    ],
    periods: DEMO_PERIODS.map((p) => structuredClone(p)),
    linkedPlans: [],
    consent: { sensitive: { version: 'sensitive-2026-09-draft1', agreedAt: '2026-10-01T20:00:00+09:00' } },
    guardianShare: null,
    createdAt: '2026-10-01T20:00:00+09:00',
    updatedAt: '2026-10-04T21:00:00+09:00',
  };
}

/** 데모 장소 — contentId · 문구 키 · 유형 · 실내 여부 · 관광공사 유형 코드 */
const PLACES = Object.freeze({
  museum: { contentId: '7001', key: 'designBoard.demoMuseum', category: 'CULTURE', indoor: true, typeId: '14' },
  restaurant: { contentId: '7002', key: 'designBoard.demoRestaurant', category: 'FOOD', indoor: true, typeId: '39' },
  beauty: { contentId: '7003', key: 'designBoard.demoShop', category: 'SHOPPING', indoor: true, typeId: '38' },
  festival: { contentId: '7004', key: 'designBoard.demoFestival', category: 'FESTIVAL', indoor: false, typeId: '15' },
  craft: { contentId: '7005', key: 'designBoard.demoCraft', category: 'CULTURE', indoor: true, typeId: '14' },
  teaHouse: { contentId: '7006', key: 'designBoard.demoTeaHouse', category: 'CAFE', indoor: true, typeId: '39' },
  tofu: { contentId: '7007', key: 'designBoard.demoTofu', category: 'FOOD', indoor: true, typeId: '39' },
  palace: { contentId: '7008', key: 'designBoard.demoPalace', category: 'SPOT', indoor: false, typeId: '12' },
  sauna: { contentId: '9001', key: 'designBoard.demoSauna' },
  waterpark: { contentId: '9002', key: 'designBoard.demoWaterpark' },
  pub: { contentId: '9003', key: 'designBoard.demoPub' },
});

/** 정거장 하나 (spec 5.2 Stop). 좌표는 숙소 근처의 예시값이다 */
function stop(date, role, place, lang, o) {
  const { contentId, key, category, indoor, typeId } = PLACES[place];
  return {
    id: `${date}:${role}:${contentId}`,
    candidateId: contentId,
    contentId,
    title: translate(key, lang),
    address: translate('designBoard.demoAddress', lang),
    lang,
    category,
    isMeal: o.isMeal ?? false,
    lat: Number((LODGING_POINT.lat + (o.north ?? 0.004)).toFixed(6)),
    lng: Number((LODGING_POINT.lng + (o.east ?? 0.003)).toFixed(6)),
    ko: { title: translate(key, 'ko'), address: translate('designBoard.demoAddress', 'ko') },
    sourceIds: { ko: contentId },
    contentTypeIds: { canonical: typeId, ko: typeId },
    arriveAt: o.arriveAt,
    leaveAt: o.leaveAt,
    stayMin: o.stayMin,
    shortened: false,
    legIn: { min: o.legMin, mode: o.legMode ?? 'TAXI', estimated: true },
    walkBurdenMin: o.walkMin ?? 10,
    indoor,
    pinned: false,
    labels: o.labels ?? ['ESTIMATED'],
  };
}

function outing(date, role, n, o) {
  return {
    id: `${date}:${role}:outing-${n}`,
    departAt: o.departAt,
    returnBy: o.returnBy,
    returnPlace: o.returnPlace ?? 'LODGING',
    deadlineReason: o.deadlineReason,
    latestDepartureAt: o.latestDepartureAt ?? null,
    slackMin: o.slackMin ?? 20,
    walkTotalMin: o.walkTotalMin ?? 15,
    travelTotalMin: o.travelTotalMin ?? 25,
    plannedReturnAt: o.plannedReturnAt,
    stops: o.stops,
  };
}

function baseDay(date, byDate, o) {
  const classified = byDate[date] ?? {};
  return {
    date,
    coverage: classified.coverage ?? 'FREE',
    dayState: o.dayState,
    reasons: o.reasons ?? [],
    window: o.window ?? { start: '09:00', end: '21:00' },
    lodgingId: 'L-DEMO',
    transportMode: o.transportMode ?? 'TAXI',
    effective: classified.effective ?? {},
    blocks: o.blocks ?? [],
    outings: o.outings ?? [],
    guardianOutings: o.guardianOutings ?? [],
    mealSlots: o.mealSlots ?? [
      { slot: 'LUNCH', status: 'NOT_APPLICABLE', reasons: [] },
      { slot: 'DINNER', status: 'NOT_APPLICABLE', reasons: [] },
    ],
    excluded: o.excluded ?? [],
    warnings: o.warnings ?? [],
    returnNow: false,
    ...(o.delta ? { delta: o.delta } : {}),
  };
}

const MED_BLOCK = Object.freeze({ kind: 'MEDICATION', start: '13:30', end: '13:45' });

/**
 * 시안에 쓰는 체류·전체 일정·오늘 표시값.
 * @param {'ko'|'en'|'ja'|'zh'} lang  표시 언어 — 장소 이름(관광공사 원문 자리)을 이 언어 문구로 채운다
 */
export function buildDemoTrip(lang) {
  const stay = demoStay();
  const byDate = classifyStay(stay);
  const excludedTitle = (place) => translate(PLACES[place].key, lang);

  const d02 = '2026-10-02';
  const d05 = DEMO_TODAY;
  const d06 = DEMO_DETAIL_DATE;
  const d07 = '2026-10-07';
  const d08 = '2026-10-08';

  const today = (() => {
    const lunch = stop(d05, 'P', 'restaurant', lang, {
      isMeal: true, arriveAt: '11:35', leaveAt: '12:35', stayMin: 60, legMin: 10, north: 0.002,
      labels: ['ESTIMATED', 'DIET_ESTIMATED', 'ORDER_CARD'],
    });
    return baseDay(d05, byDate, {
      dayState: 'TOGETHER',
      blocks: [MED_BLOCK, { kind: 'APPOINTMENT', start: '16:00', end: '17:30', appointmentId: 'A-DEMO-VISIT' }],
      outings: [
        outing(d05, 'P', 1, {
          departAt: '10:00', returnBy: '13:30', deadlineReason: 'MEDICATION', plannedReturnAt: '12:50', latestDepartureAt: '12:45',
          stops: [
            stop(d05, 'P', 'museum', lang, {
              arriveAt: '10:20', leaveAt: '11:15', stayMin: 55, legMin: 12, labels: ['ESTIMATED', 'HOURS_UNCONFIRMED'],
            }),
            lunch,
          ],
        }),
        outing(d05, 'P', 2, {
          departAt: '14:00', returnBy: '16:00', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT', plannedReturnAt: '15:35',
          stops: [stop(d05, 'P', 'beauty', lang, { arriveAt: '14:15', leaveAt: '15:05', stayMin: 50, legMin: 12, east: -0.004 })],
        }),
      ],
      guardianOutings: [
        outing(d05, 'G', 1, {
          departAt: '18:30', returnBy: '21:00', deadlineReason: 'DAY_END', plannedReturnAt: '19:50',
          stops: [
            stop(d05, 'G', 'festival', lang, {
              arriveAt: '18:45', leaveAt: '19:35', stayMin: 50, legMin: 12, legMode: 'WALK', north: -0.005,
              labels: ['ESTIMATED', 'HOURS_UNCONFIRMED'],
            }),
          ],
        }),
      ],
      mealSlots: [
        { slot: 'LUNCH', status: 'FILLED', stopId: lunch.id, reasons: [] },
        { slot: 'DINNER', status: 'NONE_AVAILABLE', reasons: ['MENU_UNKNOWN', 'DIET_RESTRICTED'] },
      ],
      excluded: [
        { candidateId: PLACES.sauna.contentId, title: excludedTitle('sauna'), reasons: ['HEAT_EXPOSURE'] },
        { candidateId: PLACES.waterpark.contentId, title: excludedTitle('waterpark'), reasons: ['WATER_ACTIVITY'] },
        { candidateId: PLACES.pub.contentId, title: excludedTitle('pub'), reasons: ['DIET_RESTRICTED'] },
      ],
      warnings: ['DEFAULTS_APPLIED', 'TRAVEL_TIMES_ESTIMATED'],
    });
  })();

  const detail = (() => {
    const craft = stop(d06, 'P', 'craft', lang, { arriveAt: '10:45', leaveAt: '11:40', stayMin: 55, legMin: 10, east: 0.006 });
    const tea = stop(d06, 'P', 'teaHouse', lang, {
      arriveAt: '11:50', leaveAt: '12:20', stayMin: 30, legMin: 8, legMode: 'WALK', walkMin: 8, east: 0.007,
      labels: ['ESTIMATED', 'HOURS_UNCONFIRMED'],
    });
    const dinner = stop(d06, 'P', 'tofu', lang, {
      isMeal: true, arriveAt: '18:00', leaveAt: '19:00', stayMin: 60, legMin: 10, north: -0.003,
      labels: ['ESTIMATED', 'DIET_ESTIMATED', 'ORDER_CARD'],
    });
    return baseDay(d06, byDate, {
      dayState: 'TOGETHER',
      blocks: [MED_BLOCK],
      outings: [
        outing(d06, 'P', 1, {
          departAt: '10:30', returnBy: '13:30', deadlineReason: 'MEDICATION', plannedReturnAt: '12:35', stops: [craft, tea],
        }),
        outing(d06, 'P', 2, {
          departAt: '17:45', returnBy: '20:00', deadlineReason: 'RETURN_TIME', plannedReturnAt: '19:15', stops: [dinner],
        }),
      ],
      mealSlots: [
        { slot: 'LUNCH', status: 'CLEARED', reasons: [] },
        { slot: 'DINNER', status: 'FILLED', stopId: dinner.id, reasons: [] },
      ],
      excluded: [{ candidateId: PLACES.sauna.contentId, title: excludedTitle('sauna'), reasons: ['HEAT_EXPOSURE'] }],
      warnings: ['DEFAULTS_APPLIED', 'TRAVEL_TIMES_ESTIMATED'],
      // 조건을 고쳐(열 노출 피함) 찜질방이 공예 박물관으로 바뀐 날 — '바뀐 점 보기'가 보인다
      delta: {
        stateChanged: false,
        before: 'TOGETHER',
        after: 'TOGETHER',
        removed: [],
        added: [],
        replaced: [{ from: `${d06}:P:${PLACES.sauna.contentId}`, to: craft.id }],
        shortened: [],
        cancelledOutings: [],
        newDeadlines: [],
        reasons: ['HEAT_EXPOSURE'],
        hasVisibleChange: true,
        seen: false,
      },
    });
  })();

  const days = {
    [d02]: baseDay(d02, byDate, {
      dayState: 'TOGETHER',
      transportMode: 'TRANSIT',
      // 입국 11:00 + 입국 수속 90분 + 공항→숙소 추정 80분 = 13:50 (규칙 14 · lib/server/airports.js)
      window: { start: '13:50', end: '21:00' },
      outings: [
        outing(d02, 'P', 1, {
          departAt: '15:00', returnBy: '21:00', deadlineReason: 'DAY_END', plannedReturnAt: '17:10',
          stops: [stop(d02, 'P', 'palace', lang, { arriveAt: '15:25', leaveAt: '16:40', stayMin: 75, legMin: 25, legMode: 'TRANSIT' })],
        }),
      ],
    }),
    '2026-10-03': baseDay('2026-10-03', byDate, {
      dayState: 'NO_TOURISM',
      reasons: ['OUTING_FORBIDDEN'],
      blocks: [{ kind: 'APPOINTMENT', start: '09:20', end: '14:30', appointmentId: 'A-DEMO-PROC' }],
    }),
    '2026-10-04': baseDay('2026-10-04', byDate, {
      dayState: 'SPLIT_NEARBY',
      reasons: ['OUTING_FORBIDDEN'],
      guardianOutings: [
        outing('2026-10-04', 'G', 1, {
          departAt: '14:00', returnBy: '21:00', deadlineReason: 'DAY_END', plannedReturnAt: '15:30',
          stops: [stop('2026-10-04', 'G', 'museum', lang, { arriveAt: '14:15', leaveAt: '15:15', stayMin: 60, legMin: 12, legMode: 'WALK' })],
        }),
      ],
    }),
    [d05]: today,
    [d06]: detail,
    [d07]: baseDay(d07, byDate, {
      dayState: 'TOGETHER',
      blocks: [MED_BLOCK],
      outings: [
        outing(d07, 'P', 1, {
          departAt: '10:00', returnBy: '13:30', deadlineReason: 'MEDICATION', plannedReturnAt: '12:20',
          stops: [stop(d07, 'P', 'beauty', lang, { arriveAt: '10:15', leaveAt: '11:05', stayMin: 50, legMin: 12 })],
        }),
      ],
    }),
    [d08]: baseDay(d08, byDate, {
      dayState: 'TOGETHER',
      // 출국 18:00 − 공항 도착 여유 3시간 − 숙소→공항 추정 80분 − 여유 30분 = 13:10 (규칙 15)
      window: { start: '09:00', end: '13:10' },
      outings: [
        outing(d08, 'P', 1, {
          departAt: '10:00', returnBy: '13:10', deadlineReason: 'DEPARTURE', plannedReturnAt: '12:10',
          stops: [stop(d08, 'P', 'teaHouse', lang, { arriveAt: '10:15', leaveAt: '11:00', stayMin: 45, legMin: 10 })],
        }),
      ],
    }),
  };

  const tripPlan = { engineVersion: '2.0.0', generatedAt: '2026-10-04T21:00:00+09:00', lang, days, edits: {} };
  // 오늘 표시값 — 매일 확인 전이라 STANDBY + DAILY_CHECK_PENDING 을 덧씌운다(저장 일정은 그대로, 규칙 32·49)
  const todayShown = overlayTodayGate(days[DEMO_TODAY], { dailyCheckPending: true });
  const shownDays = { ...days, [DEMO_TODAY]: todayShown };

  return {
    stay,
    byDate,
    tripPlan,
    shownDays,
    todayStored: days[DEMO_TODAY],
    todayShown,
    detail: days[DEMO_DETAIL_DATE],
    cards: buildTodayCards({ stay, dayPlan: days[DEMO_TODAY], date: DEMO_TODAY }),
    guardianSnapshot: buildGuardianSnapshot({ stay, tripPlan, now: DEMO_NOW, lang }),
  };
}
