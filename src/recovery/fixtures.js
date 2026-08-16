// 데모용 비식별 회복 지침 (AX-214)
//
// **실제 병원 데이터가 아니다.** 의료진이 발행을 마친 상태를 흉내 낸 예시이며,
// 병원명·환자 식별정보가 들어 있지 않다. 모든 계획에 `demo: true` 가 박혀 있고
// 화면이 그것을 상시 표시한다 (정의 §9-3).
//
// 문장(채널 B)은 병원이 쓴 원문을 흉내 낸 것이다. SafeHour 가 이 문장을 파싱해
// 판정에 쓰는 일은 없다 — 판정은 constraints(채널 A)만 본다.

const HOUR = 3600_000;

/** 기준점은 강남 시연 좌표와 같다 — 캐시·후보가 재현되게 */
const GANGNAM = { lat: 37.5105, lng: 127.059, label: '병원' };

function iso(offsetMs, base) {
  return new Date(base + offsetMs).toISOString();
}

/**
 * 표준 예시 — 외출 허용, 실내 권장, 자외선 회피.
 * 심사 시연에서 "정상 추천" 경로를 보여준다.
 */
export function demoPlanStandard(now = Date.now()) {
  return {
    schemaVersion: 1,
    planId: 'DEMO-PLAN-A',
    version: 3,
    issuedAt: iso(-2 * HOUR, now),
    updatedAt: iso(-2 * HOUR, now),
    expiresAt: iso(72 * HOUR, now),
    revoked: false,
    demo: true,
    issuer: { name: '(데모) 회복지침 발행 의원', role: 'medical_staff' },
    anchor: GANGNAM,
    constraints: {
      outingAllowed: true,
      indoorOnly: false,
      maxWalkMin: 20,
      maxTravelMin: 30,
      avoidUv: true,
      avoidHeat: true,
      noWater: true,
      escortRequired: false,
      splitAllowed: true,
      foodRestricted: true,
      fastingUntil: null,
      returnBy: iso(5 * HOUR, now),
      medicationTimes: ['09:00', '15:00', '21:00'],
      nextVisitAt: iso(30 * HOUR, now),
    },
    instructions: [
      {
        id: 'act-1',
        category: 'activity',
        lang: 'ko',
        text: '수술 부위에 압박이 가지 않도록 고개를 숙이거나 무거운 것을 드는 동작을 피하세요. 가벼운 실내 활동은 가능합니다.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'med-1',
        category: 'medication',
        lang: 'ko',
        text: '처방된 항생제와 소염제를 식후 30분에 복용하세요. 임의로 중단하지 마세요.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'food-1',
        category: 'food',
        lang: 'ko',
        text: '맵고 짠 음식, 술, 카페인은 2주간 피하세요. 부기가 심해질 수 있습니다.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'life-1',
        category: 'lifestyle',
        lang: 'ko',
        text: '세안은 내일부터 가능하며, 사우나·찜질방·수영은 2주간 피하세요. 외출 시 모자나 양산으로 햇빛을 가리세요.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'esc-1',
        category: 'escort',
        lang: 'ko',
        text: '동행 없이 외출하셔도 되지만, 어지럼증이 있으면 즉시 보호자에게 연락하세요.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'emg-1',
        category: 'emergency',
        lang: 'ko',
        text: '출혈이 멈추지 않거나 38도 이상 발열, 갑작스러운 통증 증가가 있으면 즉시 병원으로 연락하세요.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
      {
        id: 'vis-1',
        category: 'visit',
        lang: 'ko',
        text: '내일 오전 드레싱 예약이 있습니다. 예약 30분 전까지 도착해 주세요.',
        updatedAt: iso(-2 * HOUR, now),
        acknowledged: false,
      },
    ],
  };
}

/** 외출 금지 예시 — "안전한 미추천" 이 정상 결과임을 보여준다 */
export function demoPlanRestricted(now = Date.now()) {
  const base = demoPlanStandard(now);
  return {
    ...base,
    planId: 'DEMO-PLAN-B',
    constraints: {
      ...base.constraints,
      outingAllowed: false,
      indoorOnly: true,
      escortRequired: true,
      splitAllowed: false,
      maxWalkMin: 5,
      maxTravelMin: 10,
    },
    instructions: base.instructions.map((item) =>
      item.category === 'activity'
        ? {
            ...item,
            text: '오늘은 외출하지 마시고 숙소에서 안정을 취하세요. 내일 경과를 보고 다시 안내드립니다.',
          }
        : item,
    ),
  };
}

/** 만료된 계획 — 만료 시 어떻게 되는지 보여준다 */
export function demoPlanExpired(now = Date.now()) {
  const base = demoPlanStandard(now);
  return { ...base, planId: 'DEMO-PLAN-C', expiresAt: iso(-1 * HOUR, now) };
}

/** 연결 코드 → 계획. 코드는 대문자·공백 제거 후 대조된다 */
export const DEMO_FIXTURES = {
  DEMO: demoPlanStandard,
  'DEMO-A': demoPlanStandard,
  'DEMO-B': demoPlanRestricted,
  'DEMO-C': demoPlanExpired,
};
