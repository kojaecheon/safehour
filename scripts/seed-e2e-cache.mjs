// E2E 용 TourAPI 캐시 시드 (AX-322 · spec 12.3 '가짜 데이터, 외부 호출 0건')
//
// E2E 는 외부 API 에 의존하면 안 된다 — 호출 한도를 태우고, 네트워크 상태에 따라
// 결과가 달라지며, 실패 원인이 우리 코드인지 공급자인지 구분되지 않는다.
// 그래서 실제 호출 경로(callTourApi)를 그대로 쓰되 캐시를 미리 심어 외부로 나가지
// 않게 한다. 일정 엔진·정규화·API 라우트는 모두 실제 코드가 실행된다.
//
// 무엇을 심는가 (호출 모양은 src/tour-api/candidate-service.js · intro.js · detail-service.js 와 같아야 한다)
//   1. 목록 locationBasedList2 — 데모 숙소 기준점(src/adapters/demoAddresses.js 의 '숙소' 3곳)마다
//      국문·무장애·영문·일문·중문(간체) 5개 서비스. 반경은 일정 API 가 쓰는 자유일 반경(10km).
//      무장애 목록은 비워 detailWithTour2 후속 호출을 막는다.
//   2. 국문 소개정보 detailIntro2 (numOfRows '10') — 후보 보강(운영·휴무·메뉴)용. 모든 국문 항목.
//   3. 장소 상세 detailCommon2 / detailIntro2 / detailImage2 (numOfRows '20') — 국문과 외국어 항목 모두.
//      이미지는 비워 둔다. 관광공사 이미지 URL 을 넣으면 브라우저가 외부로 요청한다(외부 호출 0건 위반).
//
// 데이터는 전부 가짜다 — 이름은 '데모'로 시작하고 실존 업소가 아니다. 좌표는 기준점 둘레에 계산으로 흩었다.
// 기준점마다 3km 안에 60곳이 넘게 있고, 판정이 갈리도록 배치했다:
//   메뉴 원문이 있는 식당(매운·날음식 단서 없음) · 매운/날음식 단서 식당 · 메뉴 원문 없는 식당(MENU_UNKNOWN) ·
//   주점(FD04) · 카페(FD05) · 문화시설 · 관광지 · 쇼핑 · 찜질·스파(열) · 수영장(물) · 의원(의료 — 제외) ·
//   숙박(관광 활동 아님) · 끝난 축제(휴무) · 정기 휴관 박물관 · 3km 밖 자유일 후보.
//
// 캐시 수명은 파일을 쓴 뒤 15분이다(client.js). E2E 가 그보다 오래 돌 수 있어 refreshE2eCache() 로
// 파일 시각을 새로 고친다(e2e/fixtures.js 가 테스트마다 부른다).

import fs from 'node:fs';
import path from 'node:path';
import { searchDemoAddresses } from '../src/adapters/demoAddresses.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import { tourApiCachePath } from '../src/tour-api/client.js';
import { TOUR_API_PATHS } from '../src/tour-api/config.js';

/** 일정 API 의 후보 조회 반경 — lib/server/itinerary-service.js CANDIDATE_RADIUS_M 과 같다 */
export const E2E_RADIUS_METERS = DEFAULTS.searchRadiusM.free;
/** loadSafeHourCandidates 기본 numOfRows */
const NUM_OF_ROWS = 100;
const MODIFIED = '20260801120000';

/** 데모 숙소 기준점 — 데모 주소 검색 결과와 같은 좌표여야 캐시가 적중한다 */
export const E2E_ANCHORS = Object.freeze(
  searchDemoAddresses('숙소').map((address, index) => ({
    index,
    name: address.buildingName,
    lat: address.lat,
    lng: address.lng,
    label: ['강남', '명동', '홍대'][index] ?? `기준${index + 1}`,
  })),
);

const FOREIGN_TYPE = Object.freeze({ '12': '76', '14': '78', '15': '85', '28': '75', '32': '80', '38': '79', '39': '82' });

const HANGUL_FOOD = { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' };
const BAR = { lclsSystm1: 'FD', lclsSystm2: 'FD04', lclsSystm3: 'FD040100' };
const CAFE = { lclsSystm1: 'FD', lclsSystm2: 'FD05', lclsSystm3: 'FD050100' };
const EXHIBIT = { lclsSystm1: 'VE', lclsSystm2: 'VE07', lclsSystm3: 'VE070100' };
const PARK = { lclsSystm1: 'VE', lclsSystm2: 'VE03', lclsSystm3: 'VE030100' };
const PALACE = { lclsSystm1: 'HS', lclsSystm2: 'HS01', lclsSystm3: 'HS010100' };
const SHOP = { lclsSystm1: 'SH', lclsSystm2: 'SH01', lclsSystm3: 'SH010100' };
const SAUNA = { lclsSystm1: 'EX', lclsSystm2: 'EX05', lclsSystm3: 'EX050200' };
const SWIM = { lclsSystm1: 'LS', lclsSystm2: 'LS02', lclsSystm3: 'LS020100' };
const CLINIC = { lclsSystm1: 'EX', lclsSystm2: 'EX05', lclsSystm3: 'EX050800' };
const FESTIVAL = { lclsSystm1: 'EV', lclsSystm2: 'EV01', lclsSystm3: 'EV010100' };

const FOOD_HOURS = { opentimefood: '10:00~21:00', restdatefood: '연중무휴' };
const CULTURE_HOURS = { usetimeculture: '09:00~18:00', restdateculture: '연중무휴' };
const SHOP_HOURS = { opentime: '10:00~21:00', restdateshopping: '연중무휴' };
const SPOT_HOURS = { usetime: '상시', restdate: '연중무휴' };

/**
 * 기준점 하나의 장소 목록 틀. dist 는 기준점에서의 거리(m), deg 는 방위(0=북, 시계 방향).
 * en/ja/zh 가 없으면 그 언어 목록에 넣지 않는다(국문 폴백·번역 필요 표시가 나오게).
 */
const CATALOG = Object.freeze([
  // ── 식당: 메뉴 원문이 있고 매운·날음식 단서가 없다 → 식이 제한 날에도 식사 칸에 들어갈 수 있다
  { slug: 'porridge', type: '39', cls: HANGUL_FOOD, dist: 250, deg: 20, title: '데모 전복죽집', en: 'Demo Abalone Porridge', ja: 'デモ アワビ粥', zh: '演示 鲍鱼粥', intro: { ...FOOD_HOURS, firstmenu: '전복죽', treatmenu: '전복죽, 호박죽, 야채죽' } },
  { slug: 'tofu', type: '39', cls: HANGUL_FOOD, dist: 420, deg: 80, title: '데모 두부 정식', en: 'Demo Tofu Set Meal', ja: 'デモ 豆腐定食', zh: '演示 豆腐套餐', intro: { ...FOOD_HOURS, firstmenu: '두부 정식', treatmenu: '두부 정식, 콩비지' } },
  { slug: 'gomtang', type: '39', cls: HANGUL_FOOD, dist: 600, deg: 140, title: '데모 곰탕집', en: 'Demo Beef Bone Soup', intro: { ...FOOD_HOURS, firstmenu: '곰탕', treatmenu: '곰탕, 수육' } },
  { slug: 'noodle', type: '39', cls: HANGUL_FOOD, dist: 800, deg: 200, title: '데모 칼국수', en: 'Demo Knife-cut Noodles', ja: 'デモ カルグクス', intro: { ...FOOD_HOURS, firstmenu: '바지락칼국수', treatmenu: '칼국수, 수제비' } },
  { slug: 'hanjeongsik', type: '39', cls: HANGUL_FOOD, dist: 1100, deg: 260, title: '데모 한정식', en: 'Demo Korean Course Meal', intro: { ...FOOD_HOURS, firstmenu: '한정식 코스', treatmenu: '한정식, 불고기' } },
  { slug: 'bibimbap', type: '39', cls: HANGUL_FOOD, dist: 1400, deg: 320, title: '데모 돌솥밥집', en: 'Demo Stone Pot Rice', zh: '演示 石锅饭', intro: { ...FOOD_HOURS, firstmenu: '돌솥밥', treatmenu: '돌솥밥, 된장국' } },
  { slug: 'dumpling', type: '39', cls: HANGUL_FOOD, dist: 1750, deg: 30, title: '데모 만둣국집', en: 'Demo Dumpling Soup', intro: { ...FOOD_HOURS, firstmenu: '만둣국', treatmenu: '만둣국, 찐만두' } },
  { slug: 'samgyetang', type: '39', cls: HANGUL_FOOD, dist: 2100, deg: 110, title: '데모 삼계탕집', en: 'Demo Ginseng Chicken Soup', intro: { ...FOOD_HOURS, firstmenu: '삼계탕', treatmenu: '삼계탕, 닭죽' } },
  { slug: 'gukbap', type: '39', cls: HANGUL_FOOD, dist: 500, deg: 55, title: '데모 콩나물국밥', en: 'Demo Bean Sprout Soup Rice', intro: { ...FOOD_HOURS, firstmenu: '콩나물국밥', treatmenu: '콩나물국밥, 수란' } },
  { slug: 'udon', type: '39', cls: HANGUL_FOOD, dist: 880, deg: 125, title: '데모 우동집', en: 'Demo Udon House', ja: 'デモ うどん屋', intro: { ...FOOD_HOURS, firstmenu: '가케우동', treatmenu: '우동, 유부초밥' } },
  { slug: 'naengmyeon', type: '39', cls: HANGUL_FOOD, dist: 1250, deg: 215, title: '데모 냉면집', en: 'Demo Cold Noodle House', intro: { ...FOOD_HOURS, firstmenu: '물냉면', treatmenu: '물냉면, 만두' } },
  { slug: 'galbitang', type: '39', cls: HANGUL_FOOD, dist: 1520, deg: 285, title: '데모 갈비탕집', en: 'Demo Short Rib Soup', intro: { ...FOOD_HOURS, firstmenu: '갈비탕', treatmenu: '갈비탕, 온반' } },
  { slug: 'sotbap', type: '39', cls: HANGUL_FOOD, dist: 1880, deg: 345, title: '데모 전복솥밥집', en: 'Demo Abalone Pot Rice', intro: { ...FOOD_HOURS, firstmenu: '전복솥밥', treatmenu: '솥밥, 된장국' } },
  { slug: 'sujebi', type: '39', cls: HANGUL_FOOD, dist: 2250, deg: 65, title: '데모 수제비집', en: 'Demo Hand-torn Noodle Soup', intro: { ...FOOD_HOURS, firstmenu: '수제비', treatmenu: '수제비, 감자전' } },
  { slug: 'juk', type: '39', cls: HANGUL_FOOD, dist: 2480, deg: 155, title: '데모 죽 전문점', en: 'Demo Porridge House', ja: 'デモ おかゆ専門店', intro: { ...FOOD_HOURS, firstmenu: '야채죽', treatmenu: '야채죽, 버섯죽' } },
  { slug: 'sundubu', type: '39', cls: HANGUL_FOOD, dist: 2820, deg: 235, title: '데모 순두부집', en: 'Demo Soft Tofu House', intro: { ...FOOD_HOURS, firstmenu: '순두부 백반', treatmenu: '순두부, 계란찜' } },
  // ── 식당: 매운·날음식 단서 → DIET_RESTRICTED
  { slug: 'tteokbokki', type: '39', cls: HANGUL_FOOD, dist: 350, deg: 170, title: '데모 떡볶이', en: 'Demo Tteokbokki', intro: { ...FOOD_HOURS, firstmenu: '떡볶이', treatmenu: '떡볶이, 순대' } },
  { slug: 'kimchistew', type: '39', cls: HANGUL_FOOD, dist: 950, deg: 240, title: '데모 찌개 식당', en: 'Demo Stew House', intro: { ...FOOD_HOURS, firstmenu: '김치찌개', treatmenu: '김치찌개, 제육볶음' } },
  { slug: 'sashimi', type: '39', cls: HANGUL_FOOD, dist: 1300, deg: 300, title: '데모 횟집', en: 'Demo Raw Fish House', intro: { ...FOOD_HOURS, firstmenu: '모둠회', treatmenu: '모둠회, 매운탕' } },
  // ── 식당: 메뉴 원문이 비어 있다 → 매운·날음식 제한 날 MENU_UNKNOWN
  { slug: 'eatery-a', type: '39', cls: HANGUL_FOOD, dist: 300, deg: 250, title: '데모 식당 가', en: 'Demo Eatery A', intro: { ...FOOD_HOURS } },
  { slug: 'eatery-b', type: '39', cls: HANGUL_FOOD, dist: 700, deg: 10, title: '데모 식당 나', en: 'Demo Eatery B', intro: { ...FOOD_HOURS } },
  { slug: 'eatery-c', type: '39', cls: HANGUL_FOOD, dist: 1600, deg: 190, title: '데모 식당 다', intro: { ...FOOD_HOURS } },
  // ── 주점(FD04) → 술 제한 날 DIET_RESTRICTED
  { slug: 'pub', type: '39', cls: BAR, dist: 450, deg: 300, title: '데모 호프', en: 'Demo Pub', intro: { ...FOOD_HOURS, firstmenu: '생맥주', treatmenu: '생맥주, 감자튀김' } },
  { slug: 'winebar', type: '39', cls: BAR, dist: 1200, deg: 60, title: '데모 와인바', en: 'Demo Wine Bar', intro: { ...FOOD_HOURS, firstmenu: '하우스 와인', treatmenu: '와인, 치즈' } },
  { slug: 'izakaya', type: '39', cls: BAR, dist: 1900, deg: 150, title: '데모 이자카야', en: 'Demo Izakaya', intro: { ...FOOD_HOURS, firstmenu: '꼬치구이', treatmenu: '꼬치구이, 사케' } },
  // ── 카페(FD05) — 식사 칸에는 넣지 않는다
  { slug: 'cafe-1', type: '39', cls: CAFE, dist: 200, deg: 110, title: '데모 카페 하나', en: 'Demo Cafe One', ja: 'デモ カフェ 1', zh: '演示 咖啡 1', intro: { ...FOOD_HOURS, firstmenu: '라테', treatmenu: '라테, 케이크' } },
  { slug: 'cafe-2', type: '39', cls: CAFE, dist: 520, deg: 220, title: '데모 카페 둘', en: 'Demo Cafe Two', intro: { ...FOOD_HOURS, firstmenu: '핸드드립', treatmenu: '핸드드립, 스콘' } },
  { slug: 'teahouse', type: '39', cls: CAFE, dist: 900, deg: 330, title: '데모 전통찻집', en: 'Demo Tea House', ja: 'デモ 伝統茶屋', intro: { ...FOOD_HOURS, firstmenu: '대추차', treatmenu: '대추차, 약과' } },
  { slug: 'cafe-3', type: '39', cls: CAFE, dist: 1500, deg: 70, title: '데모 카페 셋', en: 'Demo Cafe Three', intro: { ...FOOD_HOURS, firstmenu: '아메리카노' } },
  { slug: 'cafe-4', type: '39', cls: CAFE, dist: 2300, deg: 250, title: '데모 카페 넷', intro: { ...FOOD_HOURS, firstmenu: '밀크티' } },
  { slug: 'bakery', type: '39', cls: CAFE, dist: 2600, deg: 20, title: '데모 베이커리 카페', en: 'Demo Bakery Cafe', intro: { ...FOOD_HOURS, firstmenu: '식빵' } },
  // ── 문화시설(14, 실내)
  { slug: 'art-museum', type: '14', cls: EXHIBIT, dist: 380, deg: 50, title: '데모 미술관', en: 'Demo Art Museum', ja: 'デモ 美術館', zh: '演示 美术馆', intro: { ...CULTURE_HOURS } },
  { slug: 'history-museum', type: '14', cls: EXHIBIT, dist: 650, deg: 100, title: '데모 역사 박물관', en: 'Demo History Museum', ja: 'デモ 歴史博物館', zh: '演示 历史博物馆', intro: { ...CULTURE_HOURS } },
  { slug: 'gallery', type: '14', cls: EXHIBIT, dist: 850, deg: 160, title: '데모 갤러리', en: 'Demo Gallery', ja: 'デモ ギャラリー', intro: { ...CULTURE_HOURS } },
  { slug: 'science', type: '14', cls: EXHIBIT, dist: 1050, deg: 210, title: '데모 과학관', en: 'Demo Science Hall', zh: '演示 科学馆', intro: { ...CULTURE_HOURS } },
  { slug: 'craft', type: '14', cls: EXHIBIT, dist: 1250, deg: 280, title: '데모 공예 전시관', en: 'Demo Craft Exhibition', intro: { ...CULTURE_HOURS } },
  { slug: 'photo', type: '14', cls: EXHIBIT, dist: 1450, deg: 340, title: '데모 사진 갤러리', en: 'Demo Photo Gallery', intro: { ...CULTURE_HOURS } },
  { slug: 'library', type: '14', cls: EXHIBIT, dist: 1650, deg: 40, title: '데모 도서 전시관', en: 'Demo Book Exhibition', intro: { ...CULTURE_HOURS } },
  { slug: 'memorial', type: '14', cls: EXHIBIT, dist: 1850, deg: 120, title: '데모 기념관', en: 'Demo Memorial Hall', intro: { ...CULTURE_HOURS } },
  { slug: 'design', type: '14', cls: EXHIBIT, dist: 2050, deg: 200, title: '데모 디자인 전시관', en: 'Demo Design Exhibition', intro: { ...CULTURE_HOURS } },
  { slug: 'theater', type: '14', cls: EXHIBIT, dist: 2250, deg: 290, title: '데모 공연장', en: 'Demo Theater', intro: { ...CULTURE_HOURS } },
  { slug: 'media-art', type: '14', cls: EXHIBIT, dist: 2450, deg: 10, title: '데모 미디어아트관', intro: { ...CULTURE_HOURS } },
  // 정기 휴관 — 일요일·월요일 날짜에는 CLOSED
  { slug: 'closed-museum', type: '14', cls: EXHIBIT, dist: 550, deg: 350, title: '데모 휴관 박물관', en: 'Demo Closed Museum', intro: { usetimeculture: '09:00~18:00', restdateculture: '매주 일요일, 월요일 휴관' } },
  // ── 관광지(12) — 실내 여부 모름
  { slug: 'park-1', type: '12', cls: PARK, dist: 480, deg: 190, title: '데모 근린공원', en: 'Demo Neighborhood Park', ja: 'デモ 近隣公園', intro: { ...SPOT_HOURS } },
  { slug: 'park-2', type: '12', cls: PARK, dist: 980, deg: 20, title: '데모 호수공원', en: 'Demo Lake Park', intro: { ...SPOT_HOURS } },
  { slug: 'garden', type: '12', cls: PARK, dist: 1380, deg: 90, title: '데모 정원', en: 'Demo Garden', zh: '演示 花园', intro: { ...SPOT_HOURS } },
  { slug: 'palace', type: '12', cls: PALACE, dist: 1780, deg: 180, title: '데모 고궁', en: 'Demo Palace', ja: 'デモ 古宮', zh: '演示 古宫', intro: { ...SPOT_HOURS } },
  { slug: 'street', type: '12', cls: PARK, dist: 2180, deg: 270, title: '데모 산책길', en: 'Demo Walking Street', intro: { ...SPOT_HOURS } },
  { slug: 'forest', type: '12', cls: PARK, dist: 2580, deg: 330, title: '데모 도심 숲', en: 'Demo Urban Forest', intro: { ...SPOT_HOURS } },
  { slug: 'tower', type: '12', cls: PARK, dist: 2750, deg: 60, title: '데모 전망대', en: 'Demo Observatory', intro: { ...SPOT_HOURS } },
  // ── 쇼핑(38, 실내)
  { slug: 'mall', type: '38', cls: SHOP, dist: 330, deg: 130, title: '데모 쇼핑몰', en: 'Demo Shopping Mall', ja: 'デモ ショッピングモール', zh: '演示 购物中心', intro: { ...SHOP_HOURS } },
  { slug: 'cosmetics', type: '38', cls: SHOP, dist: 760, deg: 230, title: '데모 화장품 거리', en: 'Demo Cosmetics Street', ja: 'デモ 化粧品通り', intro: { ...SHOP_HOURS } },
  { slug: 'market', type: '38', cls: SHOP, dist: 1160, deg: 310, title: '데모 전통시장', en: 'Demo Traditional Market', intro: { ...SHOP_HOURS } },
  { slug: 'bookstore', type: '38', cls: SHOP, dist: 1560, deg: 350, title: '데모 서점', en: 'Demo Bookstore', intro: { ...SHOP_HOURS } },
  { slug: 'dept', type: '38', cls: SHOP, dist: 1960, deg: 80, title: '데모 백화점', en: 'Demo Department Store', intro: { ...SHOP_HOURS } },
  { slug: 'craftshop', type: '38', cls: SHOP, dist: 2360, deg: 170, title: '데모 공예품 가게', en: 'Demo Craft Shop', intro: { ...SHOP_HOURS } },
  { slug: 'underground', type: '38', cls: SHOP, dist: 2760, deg: 240, title: '데모 지하상가', intro: { ...SHOP_HOURS } },
  { slug: 'duty-free', type: '38', cls: SHOP, dist: 2900, deg: 300, title: '데모 면세점', en: 'Demo Duty Free', intro: { ...SHOP_HOURS } },
  // ── 열·물 노출 → avoidHeat / avoidWater 날 제외
  { slug: 'sauna', type: '28', cls: SAUNA, dist: 280, deg: 330, title: '데모 찜질 스파', en: 'Demo Jjimjilbang Spa', intro: { usetimeleports: '06:00~22:00', restdateleports: '연중무휴' } },
  { slug: 'pool', type: '28', cls: SWIM, dist: 620, deg: 280, title: '데모 실내 수영장', en: 'Demo Indoor Swimming Pool', intro: { usetimeleports: '06:00~22:00', restdateleports: '연중무휴' } },
  // ── 의원(의료 시설) → 관광 후보에서 제외
  { slug: 'clinic', type: '12', cls: CLINIC, dist: 150, deg: 200, title: '데모 피부과 의원', en: 'Demo Skin Clinic', intro: { ...SPOT_HOURS } },
  // ── 숙박(32) → 관광 활동 아님
  { slug: 'hotel', type: '32', cls: { lclsSystm1: 'AC', lclsSystm2: 'AC01', lclsSystm3: 'AC010100' }, dist: 180, deg: 60, title: '데모 호텔', en: 'Demo Hotel', intro: {} },
  // ── 끝난 축제(15) → 행사 기간 밖이라 CLOSED
  { slug: 'festival', type: '15', cls: FESTIVAL, dist: 720, deg: 40, title: '데모 봄 축제', en: 'Demo Spring Festival', intro: { eventstartdate: '20260301', eventenddate: '20260310' } },
  // ── 나머지 3km 안 후보(문화·쇼핑·카페) — 여러 날 일정이 겹치지 않고 채워지도록
  { slug: 'annex-1', type: '14', cls: EXHIBIT, dist: 2650, deg: 140, title: '데모 별관 전시실', en: 'Demo Annex Gallery', intro: { ...CULTURE_HOURS } },
  { slug: 'annex-2', type: '14', cls: EXHIBIT, dist: 2850, deg: 220, title: '데모 어린이 박물관', en: 'Demo Children Museum', intro: { ...CULTURE_HOURS } },
  { slug: 'annex-3', type: '38', cls: SHOP, dist: 2550, deg: 100, title: '데모 소품 가게', en: 'Demo Gift Shop', intro: { ...SHOP_HOURS } },
  { slug: 'annex-4', type: '39', cls: HANGUL_FOOD, dist: 2400, deg: 330, title: '데모 비빔국수집', en: 'Demo Cold Noodles', intro: { ...FOOD_HOURS, firstmenu: '물국수', treatmenu: '물국수, 전' } },
  { slug: 'annex-5', type: '39', cls: HANGUL_FOOD, dist: 2700, deg: 180, title: '데모 설렁탕집', en: 'Demo Ox Bone Soup', intro: { ...FOOD_HOURS, firstmenu: '설렁탕', treatmenu: '설렁탕, 수육' } },
  { slug: 'annex-6', type: '12', cls: PARK, dist: 2950, deg: 20, title: '데모 강변 쉼터', en: 'Demo Riverside Rest Area', intro: { ...SPOT_HOURS } },
  { slug: 'annex-7', type: '14', cls: EXHIBIT, dist: 2200, deg: 45, title: '데모 음악 전시관', en: 'Demo Music Exhibition', intro: { ...CULTURE_HOURS } },
  { slug: 'annex-8', type: '38', cls: SHOP, dist: 1700, deg: 260, title: '데모 문구점', en: 'Demo Stationery Shop', intro: { ...SHOP_HOURS } },
  // ── 3km 밖(자유일 10km 반경에서만 후보)
  { slug: 'far-1', type: '14', cls: EXHIBIT, dist: 4200, deg: 90, title: '데모 먼 미술관', en: 'Demo Far Art Museum', intro: { ...CULTURE_HOURS } },
  { slug: 'far-2', type: '12', cls: PALACE, dist: 5600, deg: 0, title: '데모 먼 고궁', en: 'Demo Far Palace', intro: { ...SPOT_HOURS } },
  { slug: 'far-3', type: '38', cls: SHOP, dist: 6800, deg: 200, title: '데모 먼 쇼핑거리', en: 'Demo Far Shopping Street', intro: { ...SHOP_HOURS } },
  { slug: 'far-4', type: '39', cls: HANGUL_FOOD, dist: 7500, deg: 270, title: '데모 먼 죽집', en: 'Demo Far Porridge', intro: { ...FOOD_HOURS, firstmenu: '팥죽', treatmenu: '팥죽, 호박죽' } },
]);

/** 3km 안 항목 수 — E2E 전제(60곳 이상)를 시드 자체가 지킨다 */
export const E2E_ITEMS_WITHIN_3KM = CATALOG.filter((entry) => entry.dist <= 3000).length;
if (E2E_ITEMS_WITHIN_3KM < 60) throw new Error(`E2E 시드: 3km 안 후보가 ${E2E_ITEMS_WITHIN_3KM}곳뿐이다 (60곳 이상 필요)`);

// ── 좌표·항목 만들기 ───────────────────────────────────────────────

function offset(anchor, dist, deg) {
  const rad = (deg * Math.PI) / 180;
  const dLat = (dist * Math.cos(rad)) / 111_000;
  const dLng = (dist * Math.sin(rad)) / (111_000 * Math.cos((anchor.lat * Math.PI) / 180));
  return { lat: Number((anchor.lat + dLat).toFixed(6)), lng: Number((anchor.lng + dLng).toFixed(6)) };
}

/** 기준점마다 겹치지 않는 contentid — 국문 7xNNNN, 영문 81xNNN, 일문 82xNNN, 중문 83xNNN */
function ids(anchor, index) {
  const n = String(index + 1).padStart(3, '0');
  return {
    ko: `7${anchor.index}0${n}`,
    en: `81${anchor.index}${n}`,
    ja: `82${anchor.index}${n}`,
    zh: `83${anchor.index}${n}`,
  };
}

function listItem({ contentid, contenttypeid, title, addr, point, cls }) {
  return {
    contentid,
    contenttypeid,
    title,
    addr1: addr,
    addr2: '',
    mapx: String(point.lng),
    mapy: String(point.lat),
    modifiedtime: MODIFIED,
    ...(cls ?? {}),
  };
}

/** 기준점 하나의 전체 항목 — { korean, english, japanese, chineseSimplified } 목록과 상세 원문 */
export function anchorDataset(anchor) {
  const entries = CATALOG.map((entry, index) => ({ ...entry, id: ids(anchor, index), point: offset(anchor, entry.dist, entry.deg) }))
    .sort((a, b) => a.dist - b.dist);
  const foreign = (key, lang) =>
    entries
      .filter((e) => e[key])
      .map((e) =>
        listItem({
          contentid: e.id[lang],
          contenttypeid: FOREIGN_TYPE[e.type] ?? e.type,
          title: e[key],
          addr: `${anchor.label} demo ${e.slug}, Seoul`,
          point: e.point,
        }),
      );
  return {
    entries,
    korean: entries.map((e) =>
      listItem({
        contentid: e.id.ko,
        contenttypeid: e.type,
        title: `${e.title} (${anchor.label})`,
        addr: `데모 주소 · 서울 ${anchor.label} ${e.slug}`,
        point: e.point,
        cls: e.cls,
      }),
    ),
    english: foreign('en', 'en'),
    japanese: foreign('ja', 'ja'),
    chineseSimplified: foreign('zh', 'zh'),
  };
}

// ── 캐시 파일 ───────────────────────────────────────────────────────

function tourBody(items) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: items.length > 0 ? { item: items } : '',
        numOfRows: items.length,
        pageNo: 1,
        totalCount: items.length,
      },
    },
  };
}

/** client.js 가 쓰는 모양 그대로 — 파일 본문에는 좌표 매개변수를 가린다(client.js redactParameters 와 같다) */
function writeCache(serviceName, operation, parameters, items) {
  const file = tourApiCachePath(serviceName, operation, parameters);
  const redacted = Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, key === 'mapX' || key === 'mapY' ? 'REDACTED' : value]),
  );
  const payload = {
    serviceName,
    operation,
    parameters: redacted,
    payload: tourBody(items),
    meta: { fetchedAt: new Date().toISOString(), elapsedMs: 0, fromCache: false },
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload)}\n`, 'utf8');
  return file;
}

function locationParams(anchor) {
  return {
    mapX: String(anchor.lng),
    mapY: String(anchor.lat),
    radius: String(E2E_RADIUS_METERS),
    arrange: 'E',
    numOfRows: String(NUM_OF_ROWS),
    pageNo: '1',
  };
}

const SERVICES = Object.freeze(['english', 'japanese', 'chineseSimplified']);
const SERVICE_LANG = Object.freeze({ korean: 'ko', english: 'en', japanese: 'ja', chineseSimplified: 'zh' });
const SERVICE_TITLE_KEY = Object.freeze({ english: 'en', japanese: 'ja', chineseSimplified: 'zh' });

/** 국문 소개정보 원문 — 운영·휴무·메뉴 */
function introItem(contentid, contenttypeid, intro) {
  return { contentid, contenttypeid, ...intro };
}

function overviewOf(serviceName, title) {
  switch (serviceName) {
    case 'korean':
      return `${title} — E2E 시험용 가짜 장소입니다. 실제 업소가 아닙니다.`;
    case 'japanese':
      return `${title} — E2E テスト用の架空の場所です。`;
    case 'chineseSimplified':
      return `${title} — E2E 测试用的虚构地点。`;
    default:
      return `${title} — a fictional place for E2E tests. Not a real business.`;
  }
}

/** 장소 상세(detail-service.js fetchLocaleDetails) 세 가지 — numOfRows '20', pageNo '1' */
function seedPlaceDetail(written, serviceName, item, intro) {
  const contentId = String(item.contentid);
  const contentTypeId = String(item.contenttypeid);
  const common = {
    contentid: contentId,
    contenttypeid: contentTypeId,
    title: item.title,
    addr1: item.addr1,
    addr2: '',
    mapx: item.mapx,
    mapy: item.mapy,
    overview: overviewOf(serviceName, item.title),
  };
  written.push(writeCache(serviceName, 'detailCommon2', { contentId, numOfRows: '20', pageNo: '1' }, [common]));
  written.push(
    writeCache(serviceName, 'detailIntro2', { contentId, contentTypeId, numOfRows: '20', pageNo: '1' }, [
      introItem(contentId, contentTypeId, intro),
    ]),
  );
  written.push(writeCache(serviceName, 'detailImage2', { contentId, imageYN: 'Y', numOfRows: '20', pageNo: '1' }, []));
}

function seedAnchor(anchor, written) {
  const data = anchorDataset(anchor);
  const params = locationParams(anchor);
  written.push(writeCache('korean', 'locationBasedList2', params, data.korean));
  written.push(writeCache('barrierFree', 'locationBasedList2', params, []));
  for (const serviceName of SERVICES) written.push(writeCache(serviceName, 'locationBasedList2', params, data[serviceName]));

  data.entries.forEach((entry, index) => {
    const korean = data.korean[index];
    // 후보 보강용 국문 소개정보 (intro.js fetchKoreanIntro — numOfRows '10')
    written.push(
      writeCache(
        'korean',
        'detailIntro2',
        { contentId: korean.contentid, contentTypeId: korean.contenttypeid, numOfRows: '10', pageNo: '1' },
        [introItem(korean.contentid, korean.contenttypeid, entry.intro)],
      ),
    );
    seedPlaceDetail(written, 'korean', korean, entry.intro);
    for (const serviceName of SERVICES) {
      const key = SERVICE_TITLE_KEY[serviceName];
      if (!entry[key]) continue;
      const item = data[serviceName].find((i) => i.contentid === entry.id[SERVICE_LANG[serviceName]]);
      if (item) seedPlaceDetail(written, serviceName, item, entry.intro);
    }
  });
}

/** 캐시를 모두 심고 파일 경로 목록을 돌려준다 */
export function seedE2eCache() {
  const written = [];
  for (const anchor of E2E_ANCHORS) seedAnchor(anchor, written);
  return written;
}

/**
 * 심은 캐시 파일의 시각을 지금으로 새로 고친다 — 캐시 수명(15분)보다 오래 도는 E2E 에서도 적중하게.
 * 서버가 쓴 캐시는 없다(외부 호출 0건). 폴더가 없으면 아무것도 하지 않는다.
 * @returns {number} 새로 고친 파일 수
 */
export function refreshE2eCache() {
  let count = 0;
  let files = [];
  try {
    files = fs.readdirSync(TOUR_API_PATHS.cache);
  } catch {
    return 0;
  }
  const now = new Date();
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    try {
      fs.utimesSync(path.join(TOUR_API_PATHS.cache, name), now, now);
      count += 1;
    } catch {
      // 지워진 파일은 건너뛴다
    }
  }
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = seedE2eCache();
  console.log(`E2E 캐시 ${files.length}건을 심었습니다 (기준점 ${E2E_ANCHORS.length}곳, 3km 안 ${E2E_ITEMS_WITHIN_3KM}곳).`);
  console.log(`  위치: ${TOUR_API_PATHS.cache}`);
}
