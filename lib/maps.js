// 지도 길찾기 링크: 목적지 전용 (AX-318 · docs/business-rules.md '알림과 카드' · ADR-0010)
//
// 장소 카드·장소 상세의 '구글 지도로 열기'·'카카오맵으로 열기'가 이 함수 하나로 링크를 만든다.
//
// 원칙
//   - 링크에는 **목적지 장소의 이름과 좌표만** 넣는다. 출발지 매개변수는 넣지 않는다 —
//     길찾기의 출발지는 지도 앱이 스스로 정한다(기기 위치 또는 빈 입력칸). SafeHour 는 넘기지 않는다.
//   - **숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다.** 그래서 이 함수는 정거장(Stop) 모양
//     `{ title, lat, lng }` 만 받고, 숙소·병원·주소 객체의 표지가 보이면 링크를 만들지 않는다(null).
//     복귀 카드·병원 카드는 주소 글자만 보여준다(지도 링크 없음).
//   - 정거장 전체를 넘겨도 된다. 읽는 필드는 title·lat·lng 셋뿐이고, 나머지(주소·한국어 원문·id)는 버린다.
//   - 순수 함수다. 네트워크·브라우저 API 를 쓰지 않는다.
//
// URL 형식 (공식 문서 확인: 2026-09-19)
//   - Google Maps URLs, 길찾기 동작:
//       https://www.google.com/maps/dir/?api=1&destination=<위도>%2C<경도>
//     https://developers.google.com/maps/documentation/urls/get-started — `api=1` 은 필수 버전 값,
//     `destination` 은 장소 이름·주소·"위도,경도" 중 하나, `origin` 은 선택이며 빠지면
//     "Defaults to most relevant starting location, such as device location, if available".
//     쉼표는 %2C 로 인코딩한다(같은 문서의 인코딩 예).
//     destination 에는 **좌표**를 넣는다 — 이름은 같은 이름의 다른 곳으로 잘못 이어질 수 있다.
//     이 형식은 목적지 칸 하나라 이름과 좌표를 함께 넣을 수 없다. 이름은 카카오 링크에 싣는다.
//   - 카카오맵 바로가기 URL, 길찾기:
//       https://map.kakao.com/link/to/<이름>,<위도>,<경도>
//     https://apis.map.kakao.com/web/guide/ ('URL 로 바로가기' — /link/to/카카오판교아지트,37.39…,127.11…).
//     출발지를 넣는 /link/from/…/to/… 와 /link/by/… 는 쓰지 않는다.
//     이름은 쉼표로 좌표와 나뉘므로, 이름 안의 쉼표·빗금은 공백으로 바꾸고 나머지는 인코딩한다.
//   - 좌표는 소수 6자리(약 0.1m)로 반올림한다.

/** 링크 머리 — 테스트와 화면이 같은 값을 본다 */
export const MAP_LINK_BASE = Object.freeze({
  google: 'https://www.google.com/maps/dir/?api=1',
  kakao: 'https://map.kakao.com/link/to/',
});

/** 지도 링크 이름 최대 길이 — 정거장 이름보다 넉넉하다 */
const TITLE_MAX = 80;
const COORD_DIGITS = 6;

/**
 * 숙소 구간·병원·주소 객체에만 있는 필드 (src/stay/stay.js @typedef LodgingSegment · Hospital · Address · Appointment).
 * 하나라도 있으면 목적지 정거장이 아니라고 보고 링크를 만들지 않는다.
 */
const NON_STOP_MARKERS = Object.freeze([
  'checkIn',
  'checkOut',
  'phone',
  'linkedPlanId',
  'hospitalId',
  'roadAddress',
  'jibunAddress',
  'buildingName',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeLodgingOrHospital(place) {
  if (NON_STOP_MARKERS.some((key) => Object.prototype.hasOwnProperty.call(place, key))) return true;
  // 숙소·병원은 좌표를 주소 객체 안에 둔다. 정거장의 address 는 표시용 글자다
  if (isPlainObject(place.address)) return true;
  // 숙소·병원의 이름 필드는 name 이다. 정거장은 title 이다
  if (Object.prototype.hasOwnProperty.call(place, 'name') && !Object.prototype.hasOwnProperty.call(place, 'title')) return true;
  return false;
}

function cleanTitle(title) {
  if (typeof title !== 'string') return null;
  const text = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trim();
  return text === '' ? null : text;
}

function coordinate(value, limit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) return null;
  // -0 을 "0" 으로 쓰고, 반올림 끝자리 0 은 남겨 두지 않는다
  return String(Number(value.toFixed(COORD_DIGITS)) + 0);
}

/**
 * 목적지 전용 지도 링크 두 개를 만든다.
 *
 * @param {{ title: string, lat: number, lng: number }} place  정거장(Stop) 또는 같은 모양.
 *   숙소·병원·주소 객체는 받지 않는다(null).
 * @returns {Readonly<{ google: string, kakao: string }> | null}
 *   입력이 정거장 모양이 아니거나 이름·좌표가 올바르지 않으면 null — 화면은 지도 버튼을 그리지 않는다.
 */
export function buildMapLinks(place) {
  if (!isPlainObject(place) || looksLikeLodgingOrHospital(place)) return null;
  const title = cleanTitle(place.title);
  const lat = coordinate(place.lat, 90);
  const lng = coordinate(place.lng, 180);
  if (title === null || lat === null || lng === null) return null;

  const google = `${MAP_LINK_BASE.google}&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  const kakaoName = encodeURIComponent(title.replace(/[,/]/g, ' ').replace(/\s+/g, ' ').trim());
  const kakao = `${MAP_LINK_BASE.kakao}${kakaoName},${lat},${lng}`;
  return Object.freeze({ google, kakao });
}
