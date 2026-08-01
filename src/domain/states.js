// SafeHour 4상태 정의
//
// 중요: 상태는 사용자의 "회복 정도"를 의료적으로 평가한 결과가 아니다.
// 병원이 입력한 조건·일정·역할·데이터 신뢰와 복귀 SLA를 조합한 서비스 운영 결과다.

export const STATE = {
  /** 관광 추천 없음. 병원 연락/119/숙소 대기 안내만 제공. — 실패가 아니라 정상 결과 */
  NO_TOURISM: 'NO_TOURISM',
  /** 진료 대기·지연·시간창 부족·데이터 신뢰 부족 → 대기 및 짧은 후속 확인 */
  STANDBY: 'STANDBY',
  /** 환자는 휴식, 보호자만 근거리 활동 + 원터치 복귀 */
  SPLIT_NEARBY: 'SPLIT_NEARBY',
  /** 병원 허용 + 필수동행 충족 + 두 사용자 SLA 충족 → 공동 초단거리·저부담 */
  TOGETHER: 'TOGETHER',
};

/** 보수적 순서 (앞이 더 보수적) — 상태 강등 판단에 사용 */
export const STATE_ORDER = [
  STATE.NO_TOURISM,
  STATE.STANDBY,
  STATE.SPLIT_NEARBY,
  STATE.TOGETHER,
];

export function isMoreConservative(a, b) {
  return STATE_ORDER.indexOf(a) < STATE_ORDER.indexOf(b);
}

/** 두 상태 중 더 보수적인 것을 반환 */
export function mostConservative(...states) {
  return states.reduce((acc, s) => (isMoreConservative(s, acc) ? s : acc), STATE.TOGETHER);
}

/** 사용자에게 반드시 보여야 하는 상태 설명 */
export const STATE_MESSAGE = {
  [STATE.NO_TOURISM]: {
    ko: '지금은 관광을 권하지 않습니다',
    en: 'Tourism is not recommended right now',
    action: { ko: '병원 연락 또는 숙소 대기', en: 'Contact hospital or rest at accommodation' },
  },
  [STATE.STANDBY]: {
    ko: '대기가 필요합니다',
    en: 'Please stand by',
    action: { ko: '병원 인근 대기 후 재확인', en: 'Wait near hospital and re-check' },
  },
  [STATE.SPLIT_NEARBY]: {
    ko: '보호자만 근거리 활동이 가능합니다',
    en: 'Companion may take a nearby activity',
    action: { ko: '환자는 휴식, 보호자는 원터치 복귀 준비', en: 'Patient rests, companion keeps one-tap return' },
  },
  [STATE.TOGETHER]: {
    ko: '함께 짧은 활동이 가능합니다',
    en: 'A short activity together is possible',
    action: { ko: '저부담 코스 확인', en: 'Review the low-intensity course' },
  },
};

/** 상태 전이 사유 코드 — 사용자에게 "왜 바뀌었는지" 설명하기 위함 */
export const REASON = {
  NO_HOSPITAL_CONDITION: 'NO_HOSPITAL_CONDITION',
  STALE_HOSPITAL_CONDITION: 'STALE_HOSPITAL_CONDITION',
  CONFLICTING_CONDITION: 'CONFLICTING_CONDITION',
  RISK_SIGNAL: 'RISK_SIGNAL',
  FASTING_REQUIRED: 'FASTING_REQUIRED',
  OUTING_FORBIDDEN: 'OUTING_FORBIDDEN',
  ESCORT_REQUIRED: 'ESCORT_REQUIRED',
  SLA_INSUFFICIENT: 'SLA_INSUFFICIENT',
  DEPARTURE_WINDOW_TOO_SHORT: 'DEPARTURE_WINDOW_TOO_SHORT',
  APPOINTMENT_DELAYED: 'APPOINTMENT_DELAYED',
  WEATHER_BLOCKED: 'WEATHER_BLOCKED',
  UV_EXPOSURE: 'UV_EXPOSURE',
  INDOOR_ONLY_REQUIRED: 'INDOOR_ONLY_REQUIRED',
  WALK_LIMIT_EXCEEDED: 'WALK_LIMIT_EXCEEDED',
  TRAVEL_LIMIT_EXCEEDED: 'TRAVEL_LIMIT_EXCEEDED',
  CONGESTION_HIGH: 'CONGESTION_HIGH',
  CLOSED: 'CLOSED',
  DATA_UNRELIABLE: 'DATA_UNRELIABLE',
  PATIENT_RECALLED: 'PATIENT_RECALLED',
  NON_TOURISM_ACTIVITY: 'NON_TOURISM_ACTIVITY',
  NO_CANDIDATE: 'NO_CANDIDATE',
};

export const REASON_TEXT = {
  [REASON.NO_HOSPITAL_CONDITION]: { ko: '병원 주의조건이 입력되지 않았습니다', en: 'Hospital conditions not provided' },
  [REASON.STALE_HOSPITAL_CONDITION]: { ko: '병원 주의조건이 최신이 아닙니다', en: 'Hospital conditions are outdated' },
  [REASON.CONFLICTING_CONDITION]: { ko: '병원 조건이 서로 상충합니다', en: 'Hospital conditions conflict' },
  [REASON.RISK_SIGNAL]: { ko: '주의가 필요한 상태가 입력되었습니다', en: 'A condition requiring attention was reported' },
  [REASON.FASTING_REQUIRED]: { ko: '금식 중이라 식음 활동을 제외했습니다', en: 'Fasting — food activities excluded' },
  [REASON.OUTING_FORBIDDEN]: { ko: '병원이 외출을 제한했습니다', en: 'Hospital restricted outings' },
  [REASON.ESCORT_REQUIRED]: { ko: '필수 동행 조건을 충족하지 못했습니다', en: 'Required escort not available' },
  [REASON.SLA_INSUFFICIENT]: { ko: '복귀 시간이 부족합니다', en: 'Not enough time to return' },
  [REASON.DEPARTURE_WINDOW_TOO_SHORT]: { ko: '출발 가능 시간이 부족합니다', en: 'Departure window too short' },
  [REASON.APPOINTMENT_DELAYED]: { ko: '진료 시간이 변경되었습니다', en: 'Appointment time changed' },
  [REASON.WEATHER_BLOCKED]: { ko: '기상 조건으로 실외 활동을 제외했습니다', en: 'Outdoor activities excluded due to weather' },
  [REASON.UV_EXPOSURE]: { ko: '자외선 회피 조건으로 실외 노출 장소를 제외했습니다', en: 'Excluded — UV exposure to be avoided' },
  [REASON.INDOOR_ONLY_REQUIRED]: { ko: '병원이 실내 활동만 허용했습니다', en: 'Hospital allows indoor activities only' },
  [REASON.WALK_LIMIT_EXCEEDED]: { ko: '허용된 보행 시간을 초과합니다', en: 'Exceeds allowed walking time' },
  [REASON.TRAVEL_LIMIT_EXCEEDED]: { ko: '허용된 이동 시간을 초과합니다', en: 'Exceeds allowed travel time' },
  [REASON.CONGESTION_HIGH]: { ko: '혼잡도가 높아 제외했습니다', en: 'Excluded due to high congestion' },
  [REASON.CLOSED]: { ko: '운영하지 않는 시간입니다', en: 'Currently closed' },
  [REASON.DATA_UNRELIABLE]: { ko: '정보를 확인할 수 없어 제외했습니다', en: 'Excluded — information could not be verified' },
  [REASON.PATIENT_RECALLED]: { ko: '환자 또는 병원이 복귀를 요청했습니다', en: 'Patient or hospital requested return' },
  [REASON.NON_TOURISM_ACTIVITY]: { ko: '관광 활동 장소가 아니어서 제외했습니다', en: 'Excluded because it is not a tourism activity' },
  [REASON.NO_CANDIDATE]: { ko: '조건을 통과한 후보가 없습니다', en: 'No candidate passed the conditions' },
};
