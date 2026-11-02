'use client';

// 확인 대화상자 (SEED Alert Dialog · 설계서 5.6) — 다시 만들기·동의 철회·데이터 지우기처럼 한 번 더 묻는 자리
//
//   {open && (
//     <AlertDialog title={제목} description={설명} cancelLabel={취소 문구} confirmLabel={확인 문구}
//                  critical onConfirm={({ requestClose }) => { 지우기(); requestClose(); }}
//                  onClose={() => setOpen(false)} />
//   )}
//
// - 가운데 뜨는 272px 상자 · 모서리 20 · 제목 20/27 굵게 · 설명 16/22. 버튼은 둘(취소 · 확인)까지.
// - 되돌릴 수 없으면 critical — 확인 버튼이 긴급 빨강 채움이 된다. busy 면 확인 버튼이 처리 중 모양이 된다.
// - 바깥을 눌러도 닫히지 않는다(실수로 닫혀 확인을 건너뛰지 않게). Escape·취소·뒤로 가기는 닫는다.
// - role="alertdialog" + aria-modal. 열리면 대화상자로 포커스, Tab 가두기, 닫히면 이전 포커스로 —
//   접근성·뒤로 가기는 시트와 같은 lib/useModalSheet.js 한 경로를 쓴다(닫기는 늘 requestClose).
// - 열려 있을 때만 그린다(마운트 = 열림).

import { useId } from 'react';
import { useModalSheet } from '@/lib/useModalSheet.js';
import Button from './Button.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.titleLang]
 * @param {string} [props.description]
 * @param {string} props.cancelLabel
 * @param {string} props.confirmLabel
 * @param {boolean} [props.critical]     되돌릴 수 없는 확인 — 확인 버튼을 긴급 빨강으로
 * @param {boolean} [props.busy]         확인 처리 중
 * @param {(api: { requestClose: () => void }) => void} [props.onConfirm]
 * @param {() => void} props.onClose     실제로 닫는 함수(부모 상태 끄기)
 */
export default function AlertDialog({
  title,
  titleLang,
  description,
  cancelLabel,
  confirmLabel,
  critical = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { sheetRef, requestClose } = useModalSheet(onClose);

  return (
    <div className="ui-dialog-backdrop">
      <div
        className="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={sheetRef}
        tabIndex={-1}
      >
        <h2 id={titleId} className="ui-dialog-title" lang={titleLang}>
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="ui-dialog-desc">
            {description}
          </p>
        )}
        <div className="ui-dialog-actions">
          <Button variant="secondary" size="small" onClick={requestClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={critical ? 'critical' : 'primary'}
            size="small"
            loading={busy}
            onClick={() => onConfirm?.({ requestClose })}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
