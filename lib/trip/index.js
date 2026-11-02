// 일정 동기화와 변화 감지 — 공개 진입점 (AX-316 · spec 4.6, 4.9, 4.10, 4.11, 4.19, 4.20)
//
// 화면과 기기 저장소(lib/store), 일정 API(/api/itinerary/*, /api/plan/link) 사이의 클라이언트 조정 모듈이다.
//
//   순수 계층   toPlanStay · diffStay · build*Body · 편집 기록(with*) · 표시 선택자(select*) · 기기 변환(local)
//   실행기     createTripSync({ store, api }) — 저장소 구독·앱 열기 순서·재계획·편집·데모 사건·신호
//   API        createTripApi({ fetchImpl })
//   브라우저    getTripSync() — 기본 저장소를 쓰는 하나뿐인 실행기 (서버에서는 null)
//   React 훅    lib/trip/useTrip.js 의 useTrip() — 이 진입점에서 내보내지 않는다(서버 컴포넌트가 react 훅을 불러오지 않게)

export { toPlanStay } from './planStay.js';
export { dateInputSignature, diffStay, safeStayDates } from './affected.js';
export {
  MAX_TODAY_EVENTS,
  buildAlternativesBody,
  buildPlanBody,
  buildRelabelBody,
  dayContentIds,
  normalizeTodayEvents,
  previousFor,
  usedContentIdsOutside,
} from './requests.js';
export { MEAL_SLOTS, findStop, withClearedMeal, withDelete, withSwap, withoutDates } from './edits.js';
export {
  CONDITION_REASONS,
  immediateReturnCauseFor,
  markConsentWithdrawnLocally,
  outingInProgress,
  stripConditionData,
} from './local.js';
export { hasUnconfirmedHospitalUpdate, selectDayView, selectTodayGates, selectTodayView } from './display.js';
export { NETWORK_ERROR, TRIP_API_PATHS, TRIP_API_TIMEOUT_MS, createTripApi } from './api.js';
export { RESUME_INTERVAL_MS, TRIP_ERROR, WEATHER_DAYS_AHEAD, createTripSync } from './runtime.js';
export { getTripSync } from './client.js';
