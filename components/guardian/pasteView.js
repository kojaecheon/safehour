// 받은 링크 붙여넣기 절의 펼침과 받아들인 뒤 포커스 순서 (순수 함수, 계획 2026-11-15 A-3 Task 6)
//
// 받은 일정 화면(GuardianOpen)과 붙여넣기 절(PasteLink)이 같은 규칙을 쓴다. DOM 없이 단위 테스트로 고정한다
// (test/guardian-paste.test.js). 화면은 여기서 고른 값을 그리기만 한다.

/** 여는 중인 링크 단계의 포커스 대상 id: PIN 입력 제목, 로그인 안내 제목, 상태 줄(오프라인 안내·로그인 확인 중) */
export const PIN_ENTRY_TITLE_ID = 'guardian-pin-entry-title';
export const LOGIN_TITLE_ID = 'guardian-login-title';
export const INCOMING_STATUS_ID = 'guardian-incoming-status';
/** 붙여 넣은 링크를 받아들인 뒤 포커스를 옮길 순서. 셋 다 없으면 사본 제목이다 */
export const PASTE_FOCUS_ORDER = Object.freeze([PIN_ENTRY_TITLE_ID, LOGIN_TITLE_ID, INCOMING_STATUS_ID]);

/**
 * 붙여넣기 절의 펼침 기본값: 사본도 여는 중인 링크도 없을 때만 펼친다.
 * 여는 중인 링크(holding)는 로그인·PIN·오프라인·확인 중 단계다. 형식이 틀린 링크 안내(invalid)는 여는 중이 아니다.
 * @param {{hasCopy: boolean, showIncoming: boolean, invalid: boolean}} state
 * @returns {boolean}
 */
export function pasteDefaultOpen({ hasCopy, showIncoming, invalid }) {
  const holding = Boolean(showIncoming) && !invalid;
  return !hasCopy && !holding;
}

/**
 * 펼침 상태는 그때의 기본값과 함께 둔다.
 * @typedef {{forDefault: boolean, open: boolean}} PasteFold
 * @param {boolean} defaultOpen
 * @returns {PasteFold}
 */
export function initialPasteFold(defaultOpen) {
  return { forDefault: defaultOpen, open: defaultOpen };
}

/**
 * 지금 펼쳐 둘지: 기본값이 그대로면 보호자가 고른 값, 기본값이 바뀌었으면 새 기본값을 따른다.
 * @param {PasteFold} fold
 * @param {boolean} defaultOpen
 */
export function pasteFoldOpen(fold, defaultOpen) {
  return fold.forDefault === defaultOpen ? fold.open : defaultOpen;
}

/**
 * 요약 줄의 toggle 뒤 상태. 지금 그린 값과 같으면(속성을 맞추며 난 toggle) 같은 객체를 돌려줘 다시 그리지 않는다.
 * @param {PasteFold} fold
 * @param {boolean} defaultOpen
 * @param {boolean} nextOpen  details 의 open
 * @returns {PasteFold}
 */
export function pasteFoldAfterToggle(fold, defaultOpen, nextOpen) {
  return nextOpen === pasteFoldOpen(fold, defaultOpen) ? fold : { forDefault: defaultOpen, open: nextOpen };
}

/**
 * 붙여 넣은 링크를 받아들인 뒤: 접는다(입력란은 비운다, 다음 단계는 화면이 위에 그린다).
 * @param {boolean} defaultOpen
 * @returns {PasteFold}
 */
export function pasteFoldAfterAccept(defaultOpen) {
  return { forDefault: defaultOpen, open: false };
}

/**
 * 받아들인 뒤 포커스를 옮길 곳: PASTE_FOCUS_ORDER 에서 처음 찾은 것, 없으면 사본 제목.
 * @template T
 * @param {(id: string) => T | null} findById  예: id => document.getElementById(id)
 * @param {T | null} copyHeading
 * @returns {T | null}
 */
export function pasteFocusTarget(findById, copyHeading) {
  for (const id of PASTE_FOCUS_ORDER) {
    const found = findById(id);
    if (found) return found;
  }
  return copyHeading ?? null;
}
