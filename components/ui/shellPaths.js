// 앱 셸의 경로별 표시 규칙 (순수 함수, 사용성 점검 D2)
//
// 셸(AppShell)과 세션 유지(PwaRuntime)가 같은 목록을 쓴다. 화면 부품 밖에 두어 node 테스트가 직접 읽는다.
// 세션 확인과 보기 전용 배너는 서로 다른 일이다: 배너를 숨기는 경로가 세션 확인까지 끄면 안 된다.
// Next 밖(node --test)에서도 읽히도록 다른 모듈을 불러오지 않는다.

/** 하단 내비를 숨기는 경로: 로그인 전 흐름과 보호자 링크 열기 */
export const NAV_HIDDEN_PATHS = Object.freeze(['/', '/login', '/onboarding', '/g']);

/**
 * 셸이 세션을 묻지 않는 경로(보기 전용 배너도 없다).
 *   - `/`, `/login`: 로그인 자체를 안내하는 화면이라 배너가 겹말이 된다.
 *   - `/design-board`: 고정 데모 데이터만 쓴다. 사용자 상태를 읽지 않는다(docs/standards.md '안전 규칙의 구조적 강제').
 */
export const STATUS_HIDDEN_PATHS = Object.freeze(['/', '/login', '/design-board']);

/**
 * 세션은 묻되 보기 전용 배너만 두지 않는 경로.
 *   - `/g`: 보호자가 받은 링크를 여는 화면이다. 배너 문구(만들기·편집·연동·공유)는 환자용이라 보호자에게 맞지 않고,
 *     화면이 막힌 일마다 그 자리에서 이유를 말한다(링크 열기의 로그인·오프라인 안내, 알림 스위치의 안내와 로그인 버튼).
 *     세션 확인은 꼭 해야 한다: 로그인돼 있어야 PIN 입력이 열린다. 그래서 위 목록에 넣지 않는다.
 */
export const BANNER_HIDDEN_PATHS = Object.freeze(['/g']);

/** 긴급을 셸이 그리지 않는 경로: 그 화면이 자기 하단 바 안에 직접 그린다 */
export const EMERGENCY_IN_PAGE_PATHS = Object.freeze(['/']);

/**
 * 경로가 목록의 어느 항목과 맞는가: 전체 일치이거나 그 하위 경로다(`/g` 는 `/guardian` 과 맞지 않는다).
 * @param {string} pathname
 * @param {readonly string[]} list
 */
export function matchesPath(pathname, list) {
  return list.some((base) => (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)));
}

/**
 * 이 경로에서 셸이 무엇을 하는가.
 * @param {string|null|undefined} pathname  없으면 시작 화면으로 본다
 * @returns {{ showNav: boolean, checkSession: boolean, showBanner: boolean, showEmergencyBar: boolean }}
 */
export function shellFlags(pathname) {
  const path = pathname ?? '/';
  const showNav = !matchesPath(path, NAV_HIDDEN_PATHS);
  const checkSession = !matchesPath(path, STATUS_HIDDEN_PATHS);
  const showBanner = checkSession && !matchesPath(path, BANNER_HIDDEN_PATHS);
  const showEmergencyBar = !showNav && !matchesPath(path, EMERGENCY_IN_PAGE_PATHS);
  return { showNav, checkSession, showBanner, showEmergencyBar };
}
