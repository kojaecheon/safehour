// 단말에 남는 SafeHour 데이터의 단일 정의 (AX-210)
//
// 서버는 아무것도 저장하지 않는다. 그러므로 "내 정보를 지운다" 는 곧
// **이 브라우저 탭의 sessionStorage 를 비우는 것**이고, 그 목록이 여기 있다.
// 새 저장 항목이 생기면 반드시 이 목록에 추가한다 — 지워지지 않는 데이터가
// 생기면 SIGNOFF_CHECKLIST 2.4 가 다시 열린다.

/** 병원 조건 입력 draft — 조건 값이 담긴다 */
export const DRAFT_KEY = 'safehour.planDraft';

/** 판정 결과와 재계산 payload — 후보·좌표·복귀시각이 담긴다 */
export const RESULT_KEY = 'safehour.result';

/**
 * 병원 회복 지침 (AX-214). 채널 B(병원 안내문)가 들어 있어 민감도가 가장 높다 —
 * 반드시 삭제 대상이다.
 */
export const PLAN_KEY = 'safehour.plan';

/** 표시 언어. 개인정보가 아니며 삭제 대상에서 제외한다 (지우고 나서도 읽을 수 있어야 한다) */
export const LANG_KEY = 'safehour.lang';

/** 삭제 직후 1회만 안내를 띄우기 위한 플래그 */
export const CLEARED_FLAG = 'safehour.cleared';

/** 사용자가 지울 수 있는(그리고 지워야 하는) 키 */
export const CLEARABLE_KEYS = [DRAFT_KEY, RESULT_KEY, PLAN_KEY];

/**
 * 단말에 남은 입력·결과를 지운다.
 * 화면의 React 상태에도 조건이 남아 있으므로, 호출부는 이 함수 뒤에
 * **전체 새로고침**으로 이동해 메모리 사본까지 버려야 한다.
 */
export function clearSafeHourSession() {
  let cleared = 0;
  for (const key of CLEARABLE_KEYS) {
    try {
      if (sessionStorage.getItem(key) !== null) cleared += 1;
      sessionStorage.removeItem(key);
    } catch {
      // 저장소 접근이 막혀 있으면 지울 것도 없다
    }
  }
  try {
    sessionStorage.setItem(CLEARED_FLAG, '1');
  } catch {
    // 안내를 못 띄우는 것뿐, 삭제 자체는 끝났다
  }
  return cleared;
}

/** 삭제 안내를 한 번만 읽어 간다 */
export function takeClearedFlag() {
  try {
    const flag = sessionStorage.getItem(CLEARED_FLAG);
    if (flag) sessionStorage.removeItem(CLEARED_FLAG);
    return Boolean(flag);
  } catch {
    return false;
  }
}
