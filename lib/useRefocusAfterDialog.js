'use client';

// 확인 대화상자(AlertDialog) 뒤에 초점이 body 로 떨어지는 것을 막는 훅
//
//   const armRefocus = useRefocusAfterDialog(() => [목록제목Ref.current, 코드입력Ref.current]);
//   ...
//   onConfirm={({ requestClose }) => {
//     requestClose();
//     if (지우기().ok) armRefocus();
//   }}
//
// AlertDialog(lib/useModalSheet.js)는 닫힐 때 열기 전 초점으로 돌려보낸다. 그런데 확인한 일이 그 초점 요소를
// 지우면(목록의 한 행을 삭제·해제) 돌려보낼 노드가 이미 DOM 에 없어 초점이 body 로 떨어지고, 화면 읽기 사용자는
// 화면 처음부터 다시 찾아야 한다.
//
// 이 훅은 그때만 돈다. 확인한 일이 성공해 armRefocus() 를 부른 뒤 화면이 다시 그려지면(대화상자는 그 안에서 사라진다)
// 초점이 body 로 떨어졌을 때에 한해 targets() 가 돌려준 첫 요소(없으면 건너뜀)로 초점을 옮긴다.
// AlertDialog 가 돌려준 초점이 이미 어딘가에 있으면 건드리지 않는다.
//
// 옮길 수 있는 요소는 tabIndex={-1} 제목이나 입력칸이다(키보드 링은 :focus-visible 일 때만 그려진다).

import { useCallback, useEffect, useRef } from 'react';

/**
 * @param {() => Array<HTMLElement | null | undefined>} getTargets 초점을 받을 후보, 앞에서부터 처음 있는 것
 * @returns {() => void} 확인한 일이 성공한 직후 부른다
 */
export function useRefocusAfterDialog(getTargets) {
  const armed = useRef(false);
  const targetsRef = useRef(getTargets);

  // 후보는 그릴 때마다 최신 ref 를 읽는 함수라 따로 의존하지 않는다
  useEffect(() => {
    targetsRef.current = getTargets;
  });

  // 의존 배열이 없다: 확인한 일이 상태·저장소를 바꾼 그 다음 그리기마다 본다.
  // 같은 그리기 안에서 AlertDialog 의 정리(이전 초점 복원)가 먼저 끝난 뒤에 돈다
  useEffect(() => {
    if (!armed.current) return;
    const active = document.activeElement;
    // 대화상자가 아직 닫히는 중이면(다른 그리기에 걸려 있으면) 다음 그리기에 다시 본다
    if (active?.closest?.('[role="alertdialog"]')) return;
    armed.current = false;
    if (active && active !== document.body) return;
    for (const target of targetsRef.current()) {
      if (target) {
        target.focus();
        return;
      }
    }
  });

  return useCallback(() => {
    armed.current = true;
  }, []);
}
