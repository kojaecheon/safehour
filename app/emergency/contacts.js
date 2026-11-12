// 긴급 연락 번호 (AX-318 · docs/platform/IA_AND_FLOWS.md '고정 요소' · ADR-0010)
//
// 순수 모듈이다(네트워크·브라우저 API 없음). /emergency 화면과 테스트가 함께 쓴다.
// 긴급 연락은 로그인 전·로그인 만료·오프라인·추천 중단 스위치에서도 동작해야 한다 —
// 번호는 코드에 고정하고, 병원 전화는 기기에 저장된 체류에서 읽기만 한다(저장소에 쓰지 않는다).
//
// ── 1330 발신 형식 (공식 안내 확인: 2026-09-19 · docs/platform/HUMAN_ACTIONS.md 7번은 사람 확인 대기) ──
//   - 한국관광공사 VISITKOREA '1330 Travel Helpline & Complaint Center' (2023-03-30 게시)
//     https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=140632
//     본문: "1330 (in Korea), +82-2-1330 (from Overseas)"
//   - 정부24 '관광통역안내전화 1330' (소관 한국관광공사, 최종 수정 2026-07-27)
//     https://www.gov.kr/portal/service/serviceInfo/B55101100019
//     본문: "국내 : 국번 없이 1330", 해외 "+82-2-1330"
//   → 한국 안의 휴대전화도 지역번호 없이 `1330` 으로 건다(예전의 '휴대전화는 지역번호 + 1330' 안내는 쓰지 않는다).
//     해외 형식 `+82-2-1330` 을 함께 둔다. 로밍 휴대전화의 발신 형식은 공식 안내에 따로 적혀 있지 않다 —
//     그래서 화면은 '1330 이 연결되지 않으면 +82-2-1330' 으로만 안내한다(사람 확인 항목).
//   - 전화 링크는 RFC 3966 `tel:` 형식이다. 하이픈은 시각 구분자로 허용된다.

/** 119 · 1330 — 번호는 번역하지 않는다 */
export const EMERGENCY_LINES = Object.freeze([
  Object.freeze({ id: '119', number: '119', href: 'tel:119' }),
  Object.freeze({
    id: '1330',
    number: '1330',
    href: 'tel:1330',
    intl: Object.freeze({ number: '+82-2-1330', href: 'tel:+82-2-1330' }),
  }),
]);

/** E.164 최대 15자리. 3자리 미만은 전화번호로 보지 않는다 */
const MIN_DIGITS = 3;
const MAX_DIGITS = 15;

/**
 * 사용자가 입력한 병원 전화를 `tel:` 링크로 바꾼다. 쓸 수 없는 값이면 null.
 * 공백·괄호·점은 버리고, 숫자·하이픈·맨 앞의 + 만 남긴다. 그 밖의 글자가 있으면 링크를 만들지 않는다.
 * @param {unknown} phone
 * @returns {string | null}
 */
export function telHref(phone) {
  if (typeof phone !== 'string') return null;
  const compact = phone.trim().replace(/[\s().]/g, '');
  if (!/^\+?[0-9-]+$/.test(compact)) return null;
  const digits = compact.replace(/\D/g, '').length;
  if (digits < MIN_DIGITS || digits > MAX_DIGITS) return null;
  return `tel:${compact}`;
}

/**
 * 등록한 병원의 이름과 전화 — 전화가 없거나 링크로 만들 수 없으면 phone·href 가 null 이다.
 * 좌표·주소는 담지 않는다.
 * @param {object | null} stay
 * @returns {Array<{ hospitalId: string, name: string, phone: string | null, href: string | null }>}
 */
export function hospitalContacts(stay) {
  const hospitals = Array.isArray(stay?.hospitals) ? stay.hospitals : [];
  return hospitals
    .filter((hospital) => typeof hospital?.name === 'string' && hospital.name.trim() !== '')
    .map((hospital) => {
      const href = telHref(hospital.phone);
      return {
        hospitalId: String(hospital.id),
        name: hospital.name.trim(),
        phone: href ? hospital.phone.trim() : null,
        href,
      };
    });
}
