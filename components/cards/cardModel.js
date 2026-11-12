// 한국어 안내 카드 모델, 오늘 카드에 무엇을 넣을지 정한다 (AX-318 · docs/business-rules.md '알림과 카드', docs/platform/IA_AND_FLOWS.md '보기 전용 상태')
//
// 순수 함수다(네트워크·브라우저 API 없음). 화면(app/cards)이 기기 저장소에서 읽은 체류·하루 일정을 넘긴다.
// 로그인 만료·오프라인에서도 같은 값으로 그린다 — 이 기기의 마지막 계정 사본만 읽는다.
//
//   식이 카드 — 그날 **적용되는** 식이 항목(합성 결과 '예')마다 한 줄. 날짜 분류·합성은 src/stay 가 정한다.
//               '모르겠음'은 가장 엄격한 기본값('예')으로 이미 합성돼 들어온다.
//               조건이 정해지지 않은 날(NEEDS_INPUT)은 '제한 없음'으로 읽지 않고 카드를 만들지 않는다.
//   이동 카드 — 오늘 정거장의 한국어 이름·주소(Stop.ko). 원문 주소가 없으면 표시 언어 값 + '한국어 주소 확인 필요'.
//   복귀 카드: 그날 숙소 이름·주소(출국일은 전날 밤 숙소, docs/business-rules.md '숙소와 병원').
//   병원 카드 — 등록한 병원 이름·주소. 오늘 일정이 있는 병원이 먼저.
//
// 이 모델은 문구를 만들지 않는다. 카드 문장은 고정 문구(src/i18n/messages/cards.js, 사람 검수 대상, AI 금지)다.
// 숙소·병원의 좌표와 병원 전화는 모델에 넣지 않는다, 복귀·병원 카드는 주소 글자만 보여준다(docs/business-rules.md '알림과 카드': 숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다).

import { COVERAGE, DIET_KEYS, classifyDate, isStayDate, lodgingForDate } from '../../src/stay/index.js';

/** 식이 카드 줄 순서: 옛 설계서의 예시 순서 그대로다(지금 문서에는 카드 줄 순서를 정한 곳이 없고, 조건 항목의 식이 순서와 같다) */
export const DIET_ORDER = Object.freeze(['spicy', 'alcohol', 'hard', 'hot', 'raw']);

/** 식이 카드 상태 */
export const DIET_STATUS = Object.freeze({
  /** 적용되는 식이 항목이 있다 */
  APPLIED: 'APPLIED',
  /** 조건은 정해졌고 식이 제한이 없다 */
  NONE: 'NONE',
  /** 조건이 정해지지 않았다 — 제한 없음이 아니다 */
  NEEDS_INPUT: 'NEEDS_INPUT',
  /** 체류 날짜가 아니다(또는 체류 정보가 불완전하다) */
  OUTSIDE_STAY: 'OUTSIDE_STAY',
  /** 이 기기에 체류가 없다 */
  NO_STAY: 'NO_STAY',
});

// DIET_KEYS(도메인)와 화면 순서가 같은 항목 집합인지 모듈을 불러올 때 확인한다
if (DIET_ORDER.length !== DIET_KEYS.length || DIET_ORDER.some((key) => !DIET_KEYS.includes(key))) {
  throw new Error('식이 카드 항목이 도메인 식이 항목과 다르다');
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stayDateOk(stay, date) {
  try {
    return isStayDate(stay, date);
  } catch {
    return false;
  }
}

function dietFor(stay, date) {
  if (!isObject(stay)) return { status: DIET_STATUS.NO_STAY, items: [] };
  if (!stayDateOk(stay, date)) return { status: DIET_STATUS.OUTSIDE_STAY, items: [] };
  let classification;
  try {
    classification = classifyDate(stay, date);
  } catch {
    return { status: DIET_STATUS.OUTSIDE_STAY, items: [] };
  }
  if (classification.coverage === COVERAGE.NEEDS_INPUT || !classification.limits) {
    return { status: DIET_STATUS.NEEDS_INPUT, items: [] };
  }
  const items = DIET_ORDER.filter((key) => classification.limits.diet?.[key] === true);
  return { status: items.length > 0 ? DIET_STATUS.APPLIED : DIET_STATUS.NONE, items };
}

function movesFor(dayPlan, date) {
  if (!isObject(dayPlan) || dayPlan.date !== date) return [];
  const moves = [];
  const seen = new Set();
  const groups = [
    ['P', dayPlan.outings],
    ['G', dayPlan.guardianOutings],
  ];
  for (const [role, outings] of groups) {
    for (const outing of Array.isArray(outings) ? outings : []) {
      for (const stop of Array.isArray(outing?.stops) ? outing.stops : []) {
        const stopId = text(stop?.id);
        if (!stopId || seen.has(stopId)) continue;
        const koTitle = text(stop.ko?.title);
        const koAddress = text(stop.ko?.address);
        const displayTitle = text(stop.title);
        const displayAddress = text(stop.address);
        if (!koTitle && !koAddress && !displayTitle && !displayAddress) continue;
        seen.add(stopId);
        moves.push({
          stopId,
          role,
          arriveAt: text(stop.arriveAt),
          koTitle,
          koAddress,
          displayTitle,
          displayAddress,
          displayLang: text(stop.lang),
          // 택시 기사에게 보여줄 한국어 주소가 없다 — 표시 언어 값 + '한국어 주소 확인 필요'
          needsKoreanCheck: koAddress === null,
        });
      }
    }
  }
  return moves;
}

function returnCardFor(stay, date) {
  if (!isObject(stay) || !stayDateOk(stay, date)) return null;
  const lodging = lodgingForDate(stay, date);
  if (!lodging) return null;
  const name = text(lodging.name);
  const address = text(lodging.address?.roadAddress);
  if (!name && !address) return null;
  return { lodgingId: String(lodging.id), name, address };
}

function hospitalsFor(stay, date) {
  if (!isObject(stay) || !Array.isArray(stay.hospitals)) return [];
  const firstStart = new Map();
  for (const appointment of Array.isArray(stay.appointments) ? stay.appointments : []) {
    if (appointment?.date !== date || typeof appointment.start !== 'string') continue;
    const prev = firstStart.get(appointment.hospitalId);
    if (prev === undefined || appointment.start < prev) firstStart.set(appointment.hospitalId, appointment.start);
  }
  const cards = stay.hospitals
    .filter((hospital) => isObject(hospital) && (text(hospital.name) || text(hospital.address?.roadAddress)))
    .map((hospital, index) => ({
      card: {
        hospitalId: String(hospital.id),
        name: text(hospital.name),
        address: text(hospital.address?.roadAddress),
        appointmentToday: firstStart.has(hospital.id),
      },
      start: firstStart.get(hospital.id) ?? null,
      index,
    }));
  cards.sort((a, b) => {
    if (a.start !== null && b.start !== null) return a.start < b.start ? -1 : a.start > b.start ? 1 : a.index - b.index;
    if (a.start !== null) return -1;
    if (b.start !== null) return 1;
    return a.index - b.index;
  });
  return cards.map(({ card }) => card);
}

/**
 * 오늘(KST) 한국어 안내 카드의 내용.
 *
 * @param {object} args
 * @param {object | null} args.stay     기기에 저장된 체류 (src/stay/stay.js @typedef Stay)
 * @param {object | null} [args.dayPlan] 그 날짜의 하루 일정 (docs/contracts.md '`POST /api/itinerary/plan`'의 DayPlan). 다른 날짜면 쓰지 않는다
 * @param {string} args.date            "YYYY-MM-DD" (KST 오늘)
 * @returns {{
 *   date: string,
 *   diet: { status: keyof typeof DIET_STATUS, items: Array<'spicy'|'alcohol'|'hard'|'hot'|'raw'> },
 *   moves: Array<{ stopId: string, role: 'P'|'G', arriveAt: string|null, koTitle: string|null, koAddress: string|null,
 *                  displayTitle: string|null, displayAddress: string|null, displayLang: string|null, needsKoreanCheck: boolean }>,
 *   returnCard: { lodgingId: string, name: string|null, address: string|null } | null,
 *   hospitals: Array<{ hospitalId: string, name: string|null, address: string|null, appointmentToday: boolean }>,
 * }}
 */
export function buildTodayCards({ stay, dayPlan = null, date }) {
  return {
    date,
    diet: dietFor(stay, date),
    moves: movesFor(dayPlan, date),
    returnCard: returnCardFor(stay, date),
    hospitals: hospitalsFor(stay, date),
  };
}
