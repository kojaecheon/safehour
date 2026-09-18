// 체류·조건 도메인 계약 — 공개 진입점 (AX-302)
//
// 순수 함수 계층이다. 네트워크·브라우저 API·Node 전용 API 를 쓰지 않는다.
// 일정 엔진(AX-306·307), 서버 라우트(AX-308), 화면(AX-314~317)이 함께 쓴다.

export { DEFAULTS, UNKNOWN_DEFAULTS } from './defaults.js';
export { ERROR_CODE, ERROR_HTTP_STATUS, VALIDATION_ISSUE, validationResult } from './errorCodes.js';
export {
  KST_OFFSET_MIN,
  addDays,
  diffDays,
  eachDate,
  fromMinutes,
  isClockTime,
  isDateString,
  kstInstantMs,
  parseInstantMs,
  toMinutes,
} from './time.js';
export {
  AIRPORTS,
  APPOINTMENT_SOURCES,
  APPOINTMENT_TYPES,
  INTERESTS,
  NAME_MAX_LENGTH,
  PACES,
  appointmentsOnDate,
  hasSensitiveConsent,
  isStayDate,
  lodgingForDate,
  pointOf,
  postProcedureBoundary,
  stayDates,
  stayNights,
  validateStay,
} from './stay.js';
export {
  ANSWER_KEYS,
  CONDITION_SOURCE,
  DIET_KEYS,
  ITEM_KEYS,
  NO_RESTRICTION_ITEMS,
  OUTING,
  RETURN_PLACE,
  YES_NO_KEYS,
  getItem,
  hospitalPeriodConflict,
  isResolvedAnswer,
  isResolvedReturnTime,
  normalizeConditionPeriod,
  validateConditionPeriod,
} from './conditions.js';
export {
  NO_RESTRICTION_LIMITS,
  WARNING,
  applyUnknownDefaults,
  composeConditions,
  flattenEffective,
} from './compose.js';
export {
  appointmentBlock,
  appointmentBlockMinutes,
  appointmentEnd,
  arrivalDayStartMin,
  dayWindow,
  departureDayCutoffMin,
  medicationBlocks,
  medicationDeadlines,
  resolveReturnPlace,
} from './dayFrame.js';
export {
  COVERAGE,
  HOSPITAL_PERIOD_STATUS,
  classifyDate,
  classifyStay,
  hospitalPeriodStatus,
  isDailyCheckPending,
  isDailyCheckTarget,
  periodAppliesOnDate,
  periodCoversDate,
} from './coverage.js';
export { overlayTodayGate } from './todayGate.js';
