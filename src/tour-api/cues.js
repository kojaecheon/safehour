// 관광 후보 분류 단서 목록 — 한곳에 모은 조정 가능한 상수 (spec 4.8, 11장 / AX-305)
//
// 이 파일만 고치면 열·물·매운·날음식·주점·카페 단서와 관심사 매핑이 바뀐다.
// 문서(ITINERARY_RULES.md)의 같은 표가 이 파일을 정본으로 삼는다.
//
// ⚠ 사람 검토 전 임시값 — 식이(매운·날음식·주점) 단서 목록은 '의료진 검토' 대상이다(spec 11장).
//   값을 임의로 느슨하게 바꾸지 않는다. 단서를 빼면 제외되던 장소가 일정에 들어간다.
//
// ── 분류체계 코드 근거 ─────────────────────────────────────────────────────────
// lclsSystm1/2/3 는 관광공사 신분류체계 코드다. 목록 조회 응답에 들어 있다
// (공식 명세: https://www.data.go.kr/data/15101578/openapi.do 의 locationBasedList2 응답
//  `lclsSystm1~3 : 분류체계 1~3Deth`). 코드 이름은 관광공사 콘텐츠랩의 분류체계 조회 화면
// 데이터(https://api.visitkorea.or.kr , 분류체계 선택 목록)에서 2026-09-18 에 확인했다.
//   FD 음식 — FD01 한식, FD02 외국식, FD03 간이음식, FD04 주점, FD05 카페/찻집
//     FD04: FD040100 바/펍, FD040200 생맥주전문점, FD040300 클럽, FD040400 전통주/민속주점, FD040500 기타주점
//     FD05: FD050100 카페, FD050200 찻집, FD050300 기타음료점
//   EX05 웰니스관광 — EX050100 온천/사우나/스파, EX050200 찜질방, EX050500 뷰티스파, EX050800 기타의료관광
//   LS02 수상레저스포츠(윈드서핑·카약·요트·스쿠버·수영·래프팅 등), VE020200 워터파크
//   HS 역사관광(HS010100 고궁 포함), NA 자연관광, VE03 도시공원, VE07 전시시설, SH 쇼핑, EV 축제/공연/행사
// 저장소 캐시의 실응답에서도 FD050100 항목이 카페 이름이었다.
// 구분류(cat1~3)는 공식 명세에 '미사용항목(삭제예정)'으로 표시돼 있어 쓰지 않는다.
//
// ── 이름 단서 ───────────────────────────────────────────────────────────────
// 이름 단서는 **국문 제목**과 국문 상세의 메뉴 원문에만 적용한다. 표시 언어의 제목을 쓰면
// 언어마다 판정이 달라진다(spec 4.17 '판정은 언어와 무관', 규칙 27).
//   substrings — 부분 문자열로 찾는다(한글 등)
//   tokens     — 구분자로 나눈 낱말과 정확히 같을 때만 찾는다('회' 처럼 짧아 오탐이 많은 말)
//   words      — 라틴 문자 낱말 경계로 찾는다(대소문자 무시). 국문 제목에 영문 상호가 섞인다.

/** 비슷하지만 단서가 아닌 말 — 찾기 전에 지운다 (예: 스파게티는 스파가 아니다) */
export const CUE_FALSE_FRIENDS = Object.freeze([
  "스파게티",
  "스파클링",
  "스파이",
  "스파크",
  "스파오",
  "스파르타",
]);

/** 열 노출 (avoidHeat, HEAT_EXPOSURE) — 단서가 없으면 노출 없음 */
export const HEAT_CUES = Object.freeze({
  lclsSystm3: Object.freeze(["EX050100", "EX050200", "EX050500"]),
  substrings: Object.freeze(["사우나", "찜질", "스파", "온천", "한증", "불가마", "반신욕", "족욕"]),
  tokens: Object.freeze([]),
  words: Object.freeze(["sauna", "spa", "jjimjilbang", "hot spring"]),
});

/** 물 활동 (avoidWater, WATER_ACTIVITY) — 단서가 없으면 노출 없음 */
export const WATER_CUES = Object.freeze({
  lclsSystm2: Object.freeze(["LS02"]),
  lclsSystm3: Object.freeze(["VE020200", "EX050100", "EX050200", "EX050500"]),
  substrings: Object.freeze([
    "수영장",
    "워터파크",
    "온천",
    "수상레저",
    "물놀이",
    "해수욕장",
    "스파",
    "목욕탕",
    "래프팅",
    "카약",
    "카누",
    "요트",
    "서핑",
    "스쿠버",
    "다이빙",
    "스노클링",
    "제트스키",
    "수상스키",
  ]),
  tokens: Object.freeze([]),
  words: Object.freeze([
    "swimming",
    "swimming pool",
    "water park",
    "waterpark",
    "hot spring",
    "spa",
    "rafting",
    "kayak",
    "canoe",
    "yacht",
    "surfing",
    "scuba",
    "snorkeling",
    "jet ski",
  ]),
});

/**
 * 주점 유형 (diet.alcohol) — 분류체계가 있으면 분류만 믿는다.
 * 분류가 없는 음식점에만 이름 단서를 쓴다.
 */
export const BAR_CUES = Object.freeze({
  lclsSystm2: Object.freeze(["FD04"]),
  substrings: Object.freeze([
    "주점",
    "술집",
    "포차",
    "호프",
    "이자카야",
    "선술집",
    "와인바",
    "칵테일",
    "펍",
    "맥주",
    "막걸리",
    "전통주",
  ]),
  tokens: Object.freeze([]),
  words: Object.freeze(["pub", "bar", "izakaya", "brewery", "beer"]),
});

/**
 * 카페·전통찻집 유형 — 분류체계로만 정한다.
 * 이름('카페')으로 정하면 '매운·날음식 아님' 근거가 생겨 식이 필터가 느슨해진다.
 */
export const CAFE_CUES = Object.freeze({
  lclsSystm2: Object.freeze(["FD05"]),
});

/** 음식 분류체계 대분류 — 이 아래 코드가 있으면 음식점 세부 유형이 확인된 것이다 */
export const FOOD_LCLS_SYSTM1 = "FD";

/** 매운 음식 단서 (diet.spicy) — ⚠ 의료진 검토 전 임시값 */
export const SPICY_CUES = Object.freeze({
  substrings: Object.freeze([
    "매운",
    "매콤",
    "얼큰",
    "마라",
    "떡볶이",
    "불닭",
    "짬뽕",
    "닭갈비",
    "낙지볶음",
    "쭈꾸미",
    "주꾸미",
    "아구찜",
    "아귀찜",
    "해물찜",
    "육개장",
    "부대찌개",
    "김치",
    "닭볶음탕",
    "닭도리탕",
    "제육",
    "오징어볶음",
    "쫄면",
    "비빔냉면",
    "매운탕",
    "감자탕",
    "훠궈",
    "사천",
    "쓰촨",
    "고추",
  ]),
  tokens: Object.freeze([]),
  words: Object.freeze([
    "spicy",
    "mala",
    "tteokbokki",
    "buldak",
    "jjamppong",
    "kimchi",
    "sichuan",
    "szechuan",
    "chili",
    "chilli",
    "hotpot",
    "hot pot",
  ]),
});

/** 날음식 단서 (diet.raw) — ⚠ 의료진 검토 전 임시값 */
export const RAW_CUES = Object.freeze({
  substrings: Object.freeze([
    "육회",
    "물회",
    "횟집",
    "생선회",
    "모듬회",
    "모둠회",
    "활어",
    "광어회",
    "우럭회",
    "참치회",
    "연어회",
    "회덮밥",
    "회정식",
    "회센터",
    "회무침",
    "사시미",
    "스시",
    "초밥",
    "오마카세",
    "카이센",
    "게장",
    "생굴",
    "산낙지",
    "탕탕이",
    "세비체",
    "포케",
    "타르타르",
    "카르파초",
  ]),
  // '회'는 회관·사회·회사에도 들어 있어 낱말 그대로일 때만 단서로 본다 (예: "회, 매운탕")
  tokens: Object.freeze(["회"]),
  words: Object.freeze([
    "sashimi",
    "sushi",
    "raw",
    "omakase",
    "tartare",
    "ceviche",
    "poke",
    "carpaccio",
    "yukhoe",
  ]),
});

/** 관심사 태그 집합 — 이 순서로 붙인다 (spec 4.8) */
export const INTEREST_TAGS = Object.freeze([
  "SHOPPING",
  "KBEAUTY",
  "PALACE_HISTORY",
  "CAFE",
  "EXHIBITION",
  "FOOD",
  "NATURE",
  "FESTIVAL",
]);

/**
 * 관심사 태그 매핑 — 유형(국문 체계)·분류체계·국문 이름 단서 중 하나라도 맞으면 붙인다.
 * CAFE 와 FOOD 는 음식점 신호(isCafe·isBar)로 정한다(아래 signals.js).
 */
export const INTEREST_TAG_RULES = Object.freeze({
  SHOPPING: Object.freeze({
    contentTypes: Object.freeze(["38"]),
    lclsSystm1: Object.freeze(["SH"]),
  }),
  KBEAUTY: Object.freeze({
    lclsSystm3: Object.freeze(["EX050500"]),
    substrings: Object.freeze(["화장품", "코스메틱", "뷰티", "올리브영"]),
    words: Object.freeze(["cosmetic", "cosmetics", "beauty"]),
  }),
  PALACE_HISTORY: Object.freeze({
    lclsSystm1: Object.freeze(["HS"]),
    substrings: Object.freeze([
      "경복궁",
      "창덕궁",
      "창경궁",
      "덕수궁",
      "경희궁",
      "종묘",
      "고궁",
      "궁궐",
      "왕릉",
    ]),
    words: Object.freeze(["palace"]),
  }),
  EXHIBITION: Object.freeze({
    lclsSystm2: Object.freeze(["VE07"]),
    lclsSystm3: Object.freeze(["EV030100", "EV030200"]),
    substrings: Object.freeze(["박물관", "미술관", "갤러리", "전시", "기념관", "과학관"]),
    words: Object.freeze(["museum", "gallery", "exhibition"]),
  }),
  NATURE: Object.freeze({
    lclsSystm1: Object.freeze(["NA"]),
    lclsSystm2: Object.freeze(["VE03"]),
    substrings: Object.freeze(["수목원", "정원", "공원", "숲", "계곡", "폭포", "호수"]),
    words: Object.freeze(["park", "garden", "forest"]),
  }),
  FESTIVAL: Object.freeze({
    contentTypes: Object.freeze(["15"]),
    lclsSystm1: Object.freeze(["EV"]),
  }),
});

/**
 * 의료 시설 단서 — K-뷰티 관심사에서 뺀다. 병원을 관광 관심사로 올리면 병원 알선이 된다
 * (spec 9.1 '병원 목록·순위를 두지 않는다'). 이 목록은 태그만 막는다. 후보 제외는 엔진 몫이다.
 */
export const MEDICAL_CUES = Object.freeze({
  lclsSystm3: Object.freeze(["EX050800"]),
  substrings: Object.freeze(["의원", "병원", "클리닉", "피부과", "성형", "치과", "한의원"]),
  words: Object.freeze(["clinic", "hospital"]),
});
