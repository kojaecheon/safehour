// 국문 소개정보(detailIntro2) — 운영·휴무 원문과 식당 메뉴 원문 (AX-305)
//
// 한 번의 호출로 두 가지를 받는다.
//   - 운영·휴무 원문: 날짜 기준 닫힘 판정(schedule.js)의 입력
//   - 대표메뉴·취급메뉴 원문: 매운 음식·날음식 신호(signals.js)의 입력
//
// 필드 이름은 공식 명세(detailIntro2 응답)로 확인했다(2026-09-18).
//   국문 https://www.data.go.kr/data/15101578/openapi.do
//     "firstmenu : 음식점(39) : 대표메뉴", "treatmenu : 음식점(39) : 취급메뉴",
//     "restdatefood : 음식점(39) : 쉬는날", "opentimefood : 음식점(39) : 영업시간" 등
//   영·일·중 서비스는 같은 필드를 음식점(82)으로 제공한다(15101753·15101760·15101764).
//
// 원문은 손대지 않고 부분집합만 싣는다. 해석은 schedule.js·signals.js 가 한다.
// 언어와 무관한 판정을 위해 **국문** 소개정보만 쓴다.

import { callTourApi, extractTourItems } from "./client.js";
import { MENU_FIELDS } from "./signals.js";

/** 운영·휴무 원문 필드 */
export const INTRO_SCHEDULE_FIELDS = Object.freeze([
  "usetime",
  "usetimeculture",
  "usetimeleports",
  "opentime",
  "opentimefood",
  "opentimeshopping",
  "restdate",
  "restdateculture",
  "restdateleports",
  "restdatefood",
  "restdateshopping",
  "eventstartdate",
  "eventenddate",
]);

/** 식당 메뉴 원문 필드 — 신호 계산(signals.js)과 같은 목록을 쓴다 */
export const INTRO_MENU_FIELDS = MENU_FIELDS;

function pick(item, fields) {
  const result = {};
  for (const field of fields) {
    const value = item?.[field];
    if (value !== null && value !== undefined && String(value).trim()) result[field] = value;
  }
  return result;
}

/**
 * detailIntro2 항목에서 운영·메뉴 원문을 뽑는다.
 * 항목이 없으면(조회했으나 데이터 없음) 빈 객체 두 개다 — '조회 안 함(null)'과 구분한다.
 */
export function extractIntro(item) {
  return {
    schedule: pick(item, INTRO_SCHEDULE_FIELDS),
    menu: pick(item, INTRO_MENU_FIELDS),
  };
}

/**
 * 국문 소개정보를 조회한다. 실패하면 예외를 던진다 — 호출부가 '실패'와 '없음'을 구분한다.
 * @returns {Promise<{schedule: object, menu: object}>}
 */
export async function fetchKoreanIntro({ contentId, contentTypeId, useCache = true }) {
  const result = await callTourApi({
    serviceName: "korean",
    operation: "detailIntro2",
    parameters: {
      contentId: String(contentId),
      contentTypeId: String(contentTypeId ?? ""),
      numOfRows: "10",
      pageNo: "1",
    },
    useCache,
  });
  const [item] = extractTourItems(result);
  return extractIntro(item ?? null);
}
