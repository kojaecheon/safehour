// TourAPI 호출 실패 분류의 닫힌 목록
//
// 서버 로그·판정 운영 로그·일정 API 오류 응답이 같은 목록을 쓴다. 외부 의존이 없는 파일로 둔 것은
// 판정 로그(lib/server/decision-log.js)가 호출 모듈(client.js, 시작 때 디렉터리를 만든다)을 읽지 않고도
// 같은 허용 목록으로 거르게 하기 위해서다.

/**
 * 호출 실패의 분류 (운영 관측용 닫힌 목록). 던지는 오류의 `upstream` 에 실린다.
 *
 *   SELF_LIMIT      우리 일일 예약 한도(operation별 카운터)에 걸려 호출하지 않았다
 *   QUOTA           공공데이터포털이 호출 한도 초과로 거절했다(resultCode 22, HTTP 429)
 *   AUTH            인증키 문제(미등록·만료·IP·서비스 미신청 등, HTTP 401·403, 키 미설정)
 *   UPSTREAM_ERROR  HTTP 5xx 나 그 밖의 0000 이 아닌 resultCode
 *   PARSE           JSON 이 아닌 응답(HTML·XML·깨진 본문)인데 원인 코드를 찾지 못했다
 *   NETWORK         요청이 닿지 않았다(연결 실패·시간 초과)
 *
 * 값은 이 목록의 문자열뿐이다. 키·URL·외부 오류 원문은 담지 않으므로 로그·응답에 실어도 된다.
 */
export const TOUR_API_UPSTREAM = Object.freeze({
  SELF_LIMIT: "SELF_LIMIT",
  QUOTA: "QUOTA",
  AUTH: "AUTH",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  PARSE: "PARSE",
  NETWORK: "NETWORK",
});

const UPSTREAM_VALUES = new Set(Object.values(TOUR_API_UPSTREAM));

/** 닫힌 목록 안의 값이면 그대로, 아니면 null. 서버가 응답·로그에 싣기 전에 거른다 */
export function tourApiUpstreamClass(value) {
  return typeof value === "string" && UPSTREAM_VALUES.has(value) ? value : null;
}
