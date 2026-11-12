// 관광공사 콘텐츠 유형 코드 — 국문 체계와 외국어 체계 (AX-305)
//
// 근거(공식 문서, 2026-09-18 확인). 공공데이터포털 각 서비스 상세 화면의 OpenAPI 명세(swagger)
// `contentTypeId` 설명을 그대로 옮겼다. 기억으로 쓰지 않는다 (docs/standards.md '외부 API 형식').
//
//   국문  https://www.data.go.kr/data/15101578/openapi.do  (B551011/KorService2)
//     "관광타입(12:관광지, 14:문화시설, 15:축제공연행사, 25:여행코스, 28:레포츠, 32:숙박, 38:쇼핑, 39:음식점) ID"
//   영문  https://www.data.go.kr/data/15101753/openapi.do  (B551011/EngService2)
//   일문  https://www.data.go.kr/data/15101760/openapi.do  (B551011/JpnService2)
//   중문간체 https://www.data.go.kr/data/15101764/openapi.do (B551011/ChsService2)
//     세 서비스 모두 같은 설명:
//     "관광타입(75:레포츠, 76:관광지, 77:교통, 78:문화시설, 79:쇼핑, 80:숙박, 82:음식점, 85:축제공연행사) ID"
//   서비스 주소 변경 공지(…Service1 → …Service2, 10종):
//     https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000004082
//
// 77(교통)은 국문 체계에 대응 유형이 없다. 예전에는 25(여행코스)로 바꿨는데 공식 설명과
// 맞지 않아 바꾸지 않고 그대로 둔다 — 국문 항목과 유형이 같다고 보지 않으므로
// 20m 좌표 매칭에서도 연결되지 않는다.

export const CONTENT_TYPE = Object.freeze({
  TOURIST_SPOT: "12",
  CULTURAL_FACILITY: "14",
  FESTIVAL: "15",
  COURSE: "25",
  LEISURE: "28",
  LODGING: "32",
  SHOPPING: "38",
  FOOD: "39",
});

/** 영문·일문·중문(간체) 공통 유형 코드 → 국문 유형 코드 */
export const FOREIGN_CONTENT_TYPE_TO_CANONICAL = Object.freeze({
  "75": CONTENT_TYPE.LEISURE,
  "76": CONTENT_TYPE.TOURIST_SPOT,
  "78": CONTENT_TYPE.CULTURAL_FACILITY,
  "79": CONTENT_TYPE.SHOPPING,
  "80": CONTENT_TYPE.LODGING,
  "82": CONTENT_TYPE.FOOD,
  "85": CONTENT_TYPE.FESTIVAL,
});

/**
 * 판정은 국문 유형 코드 체계로 한다. 외국어 코드는 국문으로 바꾸고,
 * 대응이 없는 코드(77 교통 등)와 국문 코드는 그대로 돌려준다.
 */
export function canonicalContentType(contentTypeId) {
  const value = String(contentTypeId ?? "");
  return FOREIGN_CONTENT_TYPE_TO_CANONICAL[value] ?? value;
}
