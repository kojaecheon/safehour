// 조정 가능한 기본값 — 한 파일 (AX-302 · spec 11장)
//
// spec 11장의 숫자 기본값과 '모르겠음' 기본값을 모두 여기에 둔다.
// 다른 모듈은 이 파일을 **읽기만** 한다. 새 값이 필요하면 추가하지 말고 보고한다.
//
// '사람 검토 전 임시값' 표시가 붙은 값은 의료진 검토 대상이다(spec 11장 '의료진 검토' 열).
// 검토 전에 더 느슨하게 바꾸지 않는다 (handoff 3장 9번).
//
// 단서 목록(열·물·매운·날음식·주점·카페, 관심사 매핑)은 여기에 두지 않는다.
// 관광 후보 모듈의 상수 한곳이 정본이다(AX-305).

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export const DEFAULTS = deepFreeze({
  /** '모르겠음' 숫자 기본값 — 사람 검토 전 임시값 */
  unknown: {
    /** 보행 한도: 외출 1회 누적(분) — 사람 검토 전 임시값 */
    walkLimitMin: 15,
    /** 이동 한도: 구간당(분) — 사람 검토 전 임시값 */
    travelLimitMin: 20,
  },

  /** 복귀 계산 버퍼 — 사람 검토 전 임시값(기존 src/engine/slaCalculator.js BUFFER 와 같은 값) */
  buffers: {
    /** 회복기 가산: RESTRICTED 날의 환자만(분) — 사람 검토 전 임시값 */
    recoveryExtraMin: 10,
    /** 도착 여유(분) — 사람 검토 전 임시값 */
    arrivalMarginMin: 10,
    /** 호출·대기(분) — 사람 검토 전 임시값 */
    hailingMin: 5,
    /** 교통 변동: Σ이동에 곱하는 비율 — 사람 검토 전 임시값 */
    trafficVariancePct: 0.25,
  },

  /** 최소 외출 창(분) — 사람 검토 전 임시값(기존) */
  minOutingWindowMin: 45,
  /** 정거장 최소 체류(분) — 사람 검토 전 임시값(기존) */
  minStopStayMin: 15,

  /** 활동 시간 (KST) */
  activityHours: { start: '09:00', end: '21:00' },

  /** 식사 칸 (KST) */
  mealSlots: {
    LUNCH: { start: '11:30', end: '13:30' },
    DINNER: { start: '17:30', end: '19:30' },
  },

  /** 정거장 수 한도 — 식사 정거장 포함 */
  stopsPerPace: {
    RELAXED: { perOuting: 2, perDay: 3 },
    NORMAL: { perOuting: 3, perDay: 5 },
  },

  /** 검색 반경(m) — 그날 숙소 기준 */
  searchRadiusM: { restricted: 3000, free: 10000, guardian: 3000 },

  /** 대중교통 추정: 직선거리 × detourFactor ÷ speedKmh + waitTransferMin */
  transitEstimate: { detourFactor: 1.3, speedKmh: 20, waitTransferMin: 10 },

  /** 종료 시각이 없는 병원 일정의 예상 길이(분) */
  appointmentDurationMin: { PROCEDURE: 240, VISIT: 90 },

  /** '숙소에서 복용' 복약 후 다음 외출까지(분) */
  medicationGapMin: 15,

  /** 입국·출국 */
  airport: {
    /** 입국 수속(분) */
    arrivalProcessingMin: 90,
    /** 출국: 공항 도착 여유(분) */
    departureArrivalLeadMin: 180,
    /** 출국: 추가 여유(분) */
    departureSlackMin: 30,
  },

  /** 기기 알림 시점(분 전) */
  notifications: {
    returnBeforeMin: [60, 30],
    medicationAtLodgingBeforeMin: 10,
    /** '숙소 밖 복용'은 그 시각에 알린다 */
    medicationAwayBeforeMin: 0,
    /** 숙소에서 출발해야 하는 시각(일정 시작 − 이동 − 도착 여유)보다 앞선 분 */
    appointmentBeforeMin: 15,
    /** 복귀 마감이 지난 알림·시트를 마감 뒤 몇 분까지 늦게라도 내는가 (표시·알림 시점 값, 안전 판정 기준이 아니다) */
    returnPassedGraceMin: 60,
  },

  stay: {
    /** 체류 최대 길이(박) */
    maxNights: 45,
    /** 출국일로부터 며칠 뒤 첫 실행 때 삭제하는가 */
    deleteAfterDepartureDays: 7,
  },

  /** 보호자 링크 PIN 잠금 */
  guardianPin: { maxAttempts: 5, lockMin: 60 },

  /** AI 소개 문장 */
  ai: { timeoutMs: 3000, maxChars: 200 },

  /**
   * 관광공사 호출 경고·차단 기본값. 운영에서는 환경변수로 덮어쓴다.
   * 현재 src/tour-api/config.js(TOUR_API_WARNING_AT·TOUR_API_DAILY_LIMIT)가 같은 값을 쓴다.
   */
  tourApi: { warnAt: 800, dailyLimit: 1000 },
});

/**
 * '모르겠음' 답을 바꿀 가장 엄격한 기본값 (spec 4.4 표) — 사람 검토 전 임시값.
 * 모든 예/아니오 항목은 '예'가 제한이다.
 */
export const UNKNOWN_DEFAULTS = deepFreeze({
  walkLimitMin: DEFAULTS.unknown.walkLimitMin,
  travelLimitMin: DEFAULTS.unknown.travelLimitMin,
  avoidUv: true,
  avoidHeat: true,
  avoidWater: true,
  /** 동행 필요 */
  escortRequired: true,
  /** 보호자 단독 외출 불가 */
  guardianMustStay: true,
  /** 하루 종일 */
  mealRestriction: { mode: 'ALL_DAY' },
  diet: { spicy: true, alcohol: true, hard: true, hot: true, raw: true },
  /** 복약: 마감을 만들지 않고 '복약 시각 미입력' 경고(MEDICATION_TIMES_MISSING)를 붙인다 */
  medication: 'NO_DEADLINE_WITH_WARNING',
});
