// 데모용 비식별 병원 지침, 계약 v2 (AX-214 → AX-311 · docs/business-rules.md '병원 연동')
//
// **실제 병원 데이터가 아니다.** 의료진이 발행을 마친 상태를 흉내 낸 예시이며,
// 실제 병원명·주소·전화·환자 식별정보가 들어 있지 않다. 모든 지침에 `demo: true` 가 박혀 있고,
// 발행처·병원·주소에 '(데모)' 를 붙인다. 화면은 '병원 연동 데모' 배지를 상시 표시한다 (정의 §9-3).
//
// 날짜는 `now` 의 KST 날짜를 기준으로 한 상대값이다 — 언제 연결해도 오늘부터 기간이 이어진다.
//
// 문장(채널 B)은 병원이 쓴 원문을 흉내 낸 것이다. SafeHour 가 이 문장을 파싱해
// 판정에 쓰는 일은 없다 — 판정은 기간(채널 A)만 본다.

import { addDays, kstInstantMs } from '../stay/time.js';

const HOUR = 3600_000;
const KST_OFFSET_MS = 9 * HOUR;

/** 좌표는 예전 강남 시연 기준점과 같다 — 캐시·후보가 재현되게 */
const DEMO_HOSPITAL = Object.freeze({
  name: '(데모) 병원 연동 데모 의원',
  address: { roadAddress: '(데모) 서울특별시 강남구 데모로 1', lat: 37.5105, lng: 127.059 },
});

const DEMO_ISSUER = Object.freeze({ name: '(데모) 회복지침 발행 의원', role: 'medical_staff' });

function iso(offsetMs, base) {
  return new Date(base + offsetMs).toISOString();
}

/** `now` 의 KST 날짜 + n일 */
function kstDate(now, n = 0) {
  return addDays(new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10), n);
}

function kstIso(date, time) {
  return new Date(kstInstantMs(date, time)).toISOString();
}

const YES = () => ({ kind: 'SET', value: true });
const NO = () => ({ kind: 'NONE' });
const SET = (value) => ({ kind: 'SET', value });

/** 모든 항목이 '아니오'인 병원 발행 항목에서 필요한 것만 덮어쓴다 */
function items(overrides = {}) {
  const { diet, ...rest } = overrides;
  return {
    outing: 'ALLOWED',
    returnTime: { kind: 'NOT_SET' },
    walkLimit: NO(),
    travelLimit: NO(),
    avoidUv: NO(),
    avoidHeat: NO(),
    avoidWater: NO(),
    escortRequired: NO(),
    guardianMustStay: NO(),
    mealRestriction: NO(),
    diet: { spicy: NO(), alcohol: NO(), hard: NO(), hot: NO(), raw: NO(), ...(diet ?? {}) },
    medication: NO(),
    ...rest,
  };
}

function instructions(updatedAt, overrides = {}) {
  const make = (id, category, text) => ({ id, category, lang: 'ko', text: overrides[id] ?? text, updatedAt });
  return [
    make(
      'act-1',
      'activity',
      '수술 부위에 압박이 가지 않도록 고개를 숙이거나 무거운 것을 드는 동작을 피하세요. 가벼운 실내 활동은 가능합니다.',
    ),
    make('med-1', 'medication', '처방된 항생제와 소염제를 식후 30분에 복용하세요. 임의로 중단하지 마세요.'),
    make('food-1', 'food', '맵고 짠 음식, 술, 카페인은 2주간 피하세요. 부기가 심해질 수 있습니다.'),
    make(
      'life-1',
      'lifestyle',
      '세안은 내일부터 가능하며, 사우나·찜질방·수영은 2주간 피하세요. 외출 시 모자나 양산으로 햇빛을 가리세요.',
    ),
    make('esc-1', 'escort', '동행 없이 외출하셔도 되지만, 어지럼증이 있으면 즉시 보호자에게 연락하세요.'),
    make(
      'emg-1',
      'emergency',
      '출혈이 멈추지 않거나 38도 이상 발열, 갑작스러운 통증 증가가 있으면 즉시 병원으로 연락하세요.',
    ),
    make('vis-1', 'visit', '내일 오전 드레싱 예약이 있습니다. 예약 30분 전까지 도착해 주세요.'),
  ];
}

function header(planId, now, { issuedOffset = -2 * HOUR } = {}) {
  return {
    schemaVersion: 2,
    planId,
    version: 3,
    issuedAt: iso(issuedOffset, now),
    updatedAt: iso(issuedOffset, now),
    revoked: false,
    demo: true,
    issuer: { ...DEMO_ISSUER },
    hospital: { name: DEMO_HOSPITAL.name, address: { ...DEMO_HOSPITAL.address } },
  };
}

/**
 * `DEMO-A` — 외출 허용 기간을 포함한 정상 지침. 심사 시연에서 "정상 일정" 경로를 보여준다.
 * - 오늘~+2일: 외출 허용, 18:00 숙소 복귀, 보행 20분·이동 30분, 자외선·열·물 회피, 식이 3종, 복약 3회
 * - +3~+5일: 외출 허용, 17:00 **병원 복귀**(발행 병원 — 연결 병원 id 로 채워진다), 보행 30분·이동 40분
 * - +1일 10:00 내원(드레싱). 만료는 +6일 09:00 — 모든 기간이 적용된다
 */
export function demoPlanStandard(now = Date.now()) {
  const updatedAt = iso(-2 * HOUR, now);
  return {
    ...header('DEMO-PLAN-A', now),
    expiresAt: kstIso(kstDate(now, 6), '09:00'),
    periods: [
      {
        startDate: kstDate(now, 0),
        endDate: kstDate(now, 2),
        items: items({
          returnTime: { kind: 'SET', time: '18:00', place: 'LODGING' },
          walkLimit: SET(20),
          travelLimit: SET(30),
          avoidUv: YES(),
          avoidHeat: YES(),
          avoidWater: YES(),
          diet: { spicy: YES(), alcohol: YES(), raw: YES() },
          medication: SET([
            { time: '09:00', atLodging: true },
            { time: '15:00', atLodging: false },
            { time: '21:00', atLodging: true },
          ]),
        }),
      },
      {
        startDate: kstDate(now, 3),
        endDate: kstDate(now, 5),
        items: items({
          returnTime: { kind: 'SET', time: '17:00', place: 'HOSPITAL' },
          walkLimit: SET(30),
          travelLimit: SET(40),
          avoidUv: YES(),
          avoidHeat: YES(),
          avoidWater: YES(),
          diet: { alcohol: YES() },
          medication: SET([
            { time: '09:00', atLodging: true },
            { time: '21:00', atLodging: true },
          ]),
        }),
      },
    ],
    appointments: [{ type: 'VISIT', date: kstDate(now, 1), start: '10:00', end: '10:30' }],
    instructions: instructions(updatedAt),
  };
}

/**
 * `DEMO-B` — 외출 불가 기간을 포함한다. "외출 없는 날" 이 정상 결과임을 보여준다.
 * - 오늘~+1일: 외출 불가(복귀 시각 없음), 동행 필수·곁 지킴, 금식 종일, 식이 5종, 복약 3회(숙소)
 * - +2~+4일: 실내만, 16:00 숙소 복귀, 동행 필수·곁 지킴, 보행 10분·이동 20분
 * - 만료는 +5일 09:00
 */
export function demoPlanRestricted(now = Date.now()) {
  const updatedAt = iso(-2 * HOUR, now);
  const medication = () =>
    SET([
      { time: '09:00', atLodging: true },
      { time: '15:00', atLodging: true },
      { time: '21:00', atLodging: true },
    ]);
  const allDiet = () => ({ spicy: YES(), alcohol: YES(), hard: YES(), hot: YES(), raw: YES() });

  const periodItems = items({
    outing: 'FORBIDDEN',
    walkLimit: SET(5),
    travelLimit: SET(10),
    avoidUv: YES(),
    avoidHeat: YES(),
    avoidWater: YES(),
    escortRequired: YES(),
    guardianMustStay: YES(),
    mealRestriction: SET({ mode: 'ALL_DAY' }),
    diet: allDiet(),
    medication: medication(),
  });
  // 외출 불가 기간에는 복귀 시각을 묻지 않는다 (docs/business-rules.md '조건 기간')
  delete periodItems.returnTime;

  return {
    ...header('DEMO-PLAN-B', now),
    expiresAt: kstIso(kstDate(now, 5), '09:00'),
    periods: [
      { startDate: kstDate(now, 0), endDate: kstDate(now, 1), items: periodItems },
      {
        startDate: kstDate(now, 2),
        endDate: kstDate(now, 4),
        items: items({
          outing: 'INDOOR_ONLY',
          returnTime: { kind: 'SET', time: '16:00', place: 'LODGING' },
          walkLimit: SET(10),
          travelLimit: SET(20),
          avoidUv: YES(),
          avoidHeat: YES(),
          avoidWater: YES(),
          escortRequired: YES(),
          guardianMustStay: YES(),
          diet: allDiet(),
          medication: medication(),
        }),
      },
    ],
    appointments: [{ type: 'VISIT', date: kstDate(now, 1), start: '10:00', end: '10:30' }],
    instructions: instructions(updatedAt, {
      'act-1': '오늘은 외출하지 마시고 숙소에서 안정을 취하세요. 내일 경과를 보고 다시 안내드립니다.',
      'esc-1': '회복 기간에는 보호자가 곁에 함께 있어야 합니다. 혼자 외출하지 마세요.',
    }),
  };
}

/**
 * `DEMO-C`: 이미 만료된 지침. 기간은 그대로 저장되고, 만료 후 날짜 규칙이 적용된다(docs/business-rules.md '병원 연동'·'날짜 분류').
 * 기간·일정은 `DEMO-A` 와 같고, 사흘 전에 발행돼 한 시간 전에 만료됐다.
 */
export function demoPlanExpired(now = Date.now()) {
  const base = demoPlanStandard(now);
  const issued = iso(-72 * HOUR, now);
  return {
    ...base,
    ...header('DEMO-PLAN-C', now, { issuedOffset: -72 * HOUR }),
    expiresAt: iso(-1 * HOUR, now),
    instructions: base.instructions.map((item) => ({ ...item, updatedAt: issued })),
  };
}

/** 연결 코드 → 지침. 코드는 대문자·공백 제거 후 대조된다 */
export const DEMO_FIXTURES = Object.freeze({
  DEMO: demoPlanStandard,
  'DEMO-A': demoPlanStandard,
  'DEMO-B': demoPlanRestricted,
  'DEMO-C': demoPlanExpired,
});
