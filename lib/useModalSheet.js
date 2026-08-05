'use client';

// 모달 시트 공통 접근성 훅 (D08 접근성 계약, ADR-0001 보완 조건 3)
//   - 열릴 때 시트 컨테이너로 포커스 이동, 배경 스크롤 잠금
//   - Tab / Shift+Tab 포커스 트랩 (트랩 밖으로 나간 포커스는 회수)
//   - Escape·확인 버튼·뒤로가기 어느 쪽으로 닫아도 히스토리가 정확히 정리된다
//   - 닫힐 때 이전 포커스 복원
//
// 뒤로가기 처리 설계 (이전 시도가 실패한 이유와 함께)
//   시트를 열 때 히스토리 항목을 하나 쌓아, 안드로이드 뒤로가기가 페이지를 떠나는
//   대신 시트만 닫게 한다. 즉시 복귀 시트가 뒤로가기로 사라지면 안전 지시를 잃는다.
//
//   첫 시도는 cleanup 에서 history.back() 을 호출해 되돌렸는데, StrictMode 의
//   이중 마운트(마운트 → cleanup → 마운트)에서 cleanup 이 유발한 popstate 를
//   재마운트된 인스턴스가 받아 시트가 열리자마자 닫혔다.
//
//   그래서 두 가지를 바꿨다.
//   1) cleanup 은 히스토리를 건드리지 않는다.
//   2) 모든 닫기 경로가 history.back() → popstate 로 수렴한다.
//      확인 버튼·Escape 도 직접 닫지 않고 뒤로가기를 요청하며, 실제 닫기는
//      popstate 핸들러가 수행한다. 덕분에 히스토리와 화면 상태가 어긋나지 않는다.
//   3) 인스턴스 고유 id 를 history.state 에 심어, 이중 마운트에서 항목이 두 번
//      쌓이는 것을 막는다 (useRef 는 StrictMode 재마운트에서도 유지된다).

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// 현재 열려 있는 시트 스택 — Escape·트랩·popstate 는 최상위 시트만 처리한다
const sheetStack = [];
let sheetIdCounter = 0;

export function useModalSheet(onClose) {
  const sheetRef = useRef(null);
  const closeRef = useRef(onClose);
  const sheetIdRef = useRef(null);
  const pushedRef = useRef(false);

  if (sheetIdRef.current === null) {
    sheetIdRef.current = ++sheetIdCounter;
  }

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  /**
   * 닫기 요청. 히스토리 항목을 쌓아둔 상태면 뒤로가기로 되돌리고, 그 popstate 가
   * 실제 닫기를 수행한다. 닫기 경로를 하나로 모아 히스토리 어긋남을 없앤다.
   */
  const requestClose = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    closeRef.current?.();
  }, []);

  useEffect(() => {
    const node = sheetRef.current;
    if (!node) return undefined;

    const sheetId = sheetIdRef.current;
    const previousFocus = document.activeElement;
    sheetStack.push(node);
    node.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 이미 내 항목이 스택 위에 있으면(StrictMode 재마운트) 다시 쌓지 않는다
    if (window.history.state?.safehourSheetId !== sheetId) {
      try {
        window.history.pushState({ safehourSheetId: sheetId }, '');
        pushedRef.current = true;
      } catch {
        pushedRef.current = false;
      }
    } else {
      pushedRef.current = true;
    }

    function handlePopState() {
      if (sheetStack[sheetStack.length - 1] !== node) return;
      // 항목이 이미 소비됐으므로 되돌릴 것이 없다
      pushedRef.current = false;
      closeRef.current?.();
    }

    function handleKeyDown(e) {
      if (sheetStack[sheetStack.length - 1] !== node) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = node.querySelectorAll(FOCUSABLE);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      // 백드롭 클릭 등으로 포커스가 시트 밖으로 나갔으면 회수한다
      if (!node.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      // 여기서 history 를 건드리지 않는다 — StrictMode 이중 마운트에서
      // cleanup 이 유발한 popstate 가 재마운트된 인스턴스를 즉시 닫아버린다.
      const idx = sheetStack.indexOf(node);
      if (idx >= 0) sheetStack.splice(idx, 1);
      if (sheetStack.length === 0) document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [requestClose]);

  return { sheetRef, requestClose };
}
