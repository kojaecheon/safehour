'use client';

// 아래에서 올라오는 모달 시트 — 전후 비교 시트·복귀 시트의 틀 (AX-304 · ADR-0001 보완 조건 3)
//
//   {open && (
//     <Sheet title={시트 제목} onClose={() => setOpen(false)}
//            footer={({ requestClose }) => <Button onClick={requestClose}>{확인 문구}</Button>}>
//       …내용…
//     </Sheet>
//   )}
//
// 접근성·뒤로 가기 동작은 lib/useModalSheet.js 를 그대로 쓴다.
//   - 열릴 때 시트로 포커스, 배경 스크롤 잠금, Tab 가두기, 닫히면 이전 포커스 복원
//   - Escape·닫기 버튼·확인 버튼·안드로이드 뒤로 가기 모두 requestClose → popstate 한 경로로 닫힌다
//     (직접 onClose 를 부르면 히스토리 항목이 남는다 — 닫기 동작은 늘 requestClose 를 쓴다)
// - 열려 있을 때만 그린다(마운트 = 열림). 겹친 시트는 맨 위 것만 반응한다.
// - showClose=false 는 확인을 꼭 받아야 하는 안전 지시(즉시 복귀)용이다 — 그때는 footer 에 확인 버튼을 둔다.
// - 기존 `.sheet-backdrop` · `.sheet` 클래스를 쓴다(기존 E2E 선택자와 같다).

import { useId } from 'react';
import { useModalSheet } from '@/lib/useModalSheet.js';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

function renderSlot(slot, api) {
  return typeof slot === 'function' ? slot(api) : slot;
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.titleLang]
 * @param {() => void} props.onClose           실제로 닫는 함수(부모 상태 끄기). 시트가 알맞은 때 부른다
 * @param {boolean} [props.showClose]          오른쪽 위 닫기(X) 버튼
 * @param {React.ReactNode | ((api: {requestClose: () => void}) => React.ReactNode)} [props.children]
 * @param {React.ReactNode | ((api: {requestClose: () => void}) => React.ReactNode)} [props.footer]
 */
export default function Sheet({ title, titleLang, onClose, showClose = true, children, footer }) {
  const { t } = useLang();
  const headingId = useId();
  const { sheetRef, requestClose } = useModalSheet(onClose);
  const api = { requestClose };

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className="sheet ui-sheet" ref={sheetRef} tabIndex={-1}>
        {/* 손잡이는 닫을 수 있는 시트에만 — 확인을 꼭 받는 시트(showClose=false)가 끌어 내려 닫힐 것처럼 보이지 않게 */}
        {showClose && <div className="ui-sheet-grabber" aria-hidden="true" />}
        <div className="ui-sheet-head">
          <h2 id={headingId} lang={titleLang}>
            {title}
          </h2>
          {showClose && (
            <button type="button" className="ui-sheet-close" aria-label={t('common.close')} onClick={requestClose}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="ui-sheet-body">{renderSlot(children, api)}</div>
        {footer && <div className="ui-sheet-foot">{renderSlot(footer, api)}</div>}
      </div>
    </div>
  );
}
