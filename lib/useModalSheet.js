'use client';

// 모달 시트 공통 접근성 훅 (D08 접근성 계약)
//   - 열릴 때 시트 컨테이너로 포커스 이동, 배경 스크롤 잠금
//   - Tab / Shift+Tab 포커스 트랩 (트랩 밖으로 나간 포커스는 회수)
//   - Escape 로 닫기 — 시트가 겹쳐 있으면 최상위 시트만 반응
//   - 닫힐 때 이전 포커스 복원

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// 현재 열려 있는 시트 스택 — Escape·트랩은 최상위 시트만 처리한다
const sheetStack = [];

export function useModalSheet(onClose) {
  const sheetRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = sheetRef.current;
    if (!node) return undefined;

    const previousFocus = document.activeElement;
    sheetStack.push(node);
    node.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e) {
      if (sheetStack[sheetStack.length - 1] !== node) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current?.();
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
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = sheetStack.indexOf(node);
      if (idx >= 0) sheetStack.splice(idx, 1);
      if (sheetStack.length === 0) document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  return sheetRef;
}
