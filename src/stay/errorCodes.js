// 새 오류 코드와 검증 문제 코드, 한곳 (AX-302 · docs/contracts.md '공통')
//
// 순수 도메인 계층에 둔다. 서버 가드(`lib/server/route-guard.js`)와 체류 검증이
// 같은 정의를 쓰도록 하기 위해서다(도메인 → 서버 방향 의존을 만들지 않는다).
// 기존 코드(SAFEHOUR_BAD_REQUEST, SAFEHOUR_EXTERNAL_API 등)는 그대로 쓴다.

export const ERROR_CODE = Object.freeze({
  AUTH_REQUIRED: 'SAFEHOUR_AUTH_REQUIRED',
  STAY_INVALID: 'SAFEHOUR_STAY_INVALID',
  ADDRESS_UNAVAILABLE: 'SAFEHOUR_ADDRESS_UNAVAILABLE',
  /** 서버 알림이 꺼져 있다(스위치 꺼짐, 차단 스위치 켜짐, 준비 안 됨) */
  SERVER_PUSH_OFF: 'SAFEHOUR_SERVER_PUSH_OFF',
  /** 서버 알림 저장소나 예약 업체의 일시 장애 */
  SERVER_PUSH_UNAVAILABLE: 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE',
  /** 지켜보기를 찾지 못했다(없거나 권한이 맞지 않거나 만료됨) */
  WATCH_NOT_FOUND: 'SAFEHOUR_WATCH_NOT_FOUND',
  RATE_LIMITED: 'SAFEHOUR_RATE_LIMITED',
});

export const ERROR_HTTP_STATUS = Object.freeze({
  [ERROR_CODE.AUTH_REQUIRED]: 401,
  [ERROR_CODE.STAY_INVALID]: 400,
  [ERROR_CODE.ADDRESS_UNAVAILABLE]: 503,
  [ERROR_CODE.SERVER_PUSH_OFF]: 503,
  [ERROR_CODE.SERVER_PUSH_UNAVAILABLE]: 503,
  [ERROR_CODE.WATCH_NOT_FOUND]: 404,
  [ERROR_CODE.RATE_LIMITED]: 429,
});

/**
 * 검증 실패 항목의 문제 종류. `issues[].code` 에 들어간다.
 * 화면이 필드 옆에 이유를 붙일 때 쓴다. 사용자 문구는 i18n 사전이 소유한다.
 */
export const VALIDATION_ISSUE = Object.freeze({
  /** 값이 없거나 형식이 틀림 */
  REQUIRED: 'REQUIRED',
  INVALID_VALUE: 'INVALID_VALUE',
  NAME_TOO_LONG: 'NAME_TOO_LONG',
  DUPLICATE_ID: 'DUPLICATE_ID',
  DEPARTURE_BEFORE_ARRIVAL: 'DEPARTURE_BEFORE_ARRIVAL',
  STAY_TOO_LONG: 'STAY_TOO_LONG',
  LODGINGS_EMPTY: 'LODGINGS_EMPTY',
  LODGING_DATES_ORDER: 'LODGING_DATES_ORDER',
  LODGING_OVERLAP: 'LODGING_OVERLAP',
  PROCEDURE_REQUIRED: 'PROCEDURE_REQUIRED',
  UNKNOWN_HOSPITAL: 'UNKNOWN_HOSPITAL',
  APPOINTMENT_END_BEFORE_START: 'APPOINTMENT_END_BEFORE_START',
  PERIOD_DATES_ORDER: 'PERIOD_DATES_ORDER',
  /** 필수 항목(outing·returnTime) 또는 병원 발행 기간에 '모르겠음' */
  UNKNOWN_NOT_ALLOWED: 'UNKNOWN_NOT_ALLOWED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  /** returnTime 장소가 병원인데 hospitalId 가 없음 (docs/business-rules.md '숙소와 병원') */
  HOSPITAL_ID_REQUIRED: 'HOSPITAL_ID_REQUIRED',
  /** noRestriction 은 SELF 기간만 */
  NO_RESTRICTION_SELF_ONLY: 'NO_RESTRICTION_SELF_ONLY',
});

/**
 * 검증 결과를 만든다. 문제가 있으면 `SAFEHOUR_STAY_INVALID` 와 필드 목록을 담는다.
 * @param {Array<{field: string, code: string}>} issues
 * @returns {{ok: boolean, errorCode?: string, fields: string[], issues: Array<{field: string, code: string}>}}
 */
export function validationResult(issues) {
  if (issues.length === 0) return { ok: true, fields: [], issues: [] };
  const fields = [];
  for (const { field } of issues) if (!fields.includes(field)) fields.push(field);
  return { ok: false, errorCode: ERROR_CODE.STAY_INVALID, fields, issues };
}
