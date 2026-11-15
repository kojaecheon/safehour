'use client';

// 받은 링크 붙여넣기 절, /g (계획 2026-11-15 A-3 Task 6 · docs/security.md '보호자 링크'·'기기 저장소와 계정 이름공간')
//
// 아이폰 홈 화면 앱은 Safari와 저장 공간이 따로라서, 보호자가 메신저의 링크를 다시 복사해 이 칸에 붙여 넣는다.
//   - 받는 글은 fragmentFromPasted 가 정한다(링크 전체, 메신저 문장 속 첫 http(s) 링크, '#암호문', '#' 없는 암호문).
//     글 안의 공백·줄바꿈을 건너 이어 붙이지 않는다('링크⏎PIN' 한 메시지에서 PIN 이 암호문에 붙지 않는다).
//   - 맞으면 링크를 눌러 연 것과 같은 길을 탄다: 로그인 왕복 임시 보관(탭 저장소, 1시간)에 넣고 notifyIncomingLink 로
//     /g 의 로그인·PIN 흐름을 깨운다. 여는 중이던 링크가 있으면 임시 보관을 새 링크로 바꾸고, 주소에 남은 # 뒤
//     (형식이 틀린 링크, 또는 여는 중이던 링크)는 지워 임시 보관이 읽히게 한다(지우기만 한다).
//   - 붙여 넣은 글은 서버로 보내지 않고(폼을 제출하지 않고, 입력란에 name 이 없다) 주소창에 싣지 않으며 로그에 남기지 않는다.
//     받아들이면 입력란을 비우고 절을 접는다.
//   - 화면이 펼침 기본값(defaultOpen, pasteView.js pasteDefaultOpen)을 준다: 사본도 여는 중인 링크도 없으면 펼치고,
//     그 밖에는 접는다. 펼침 규칙은 pasteView.js 의 순수 함수가 정한다. 접힌 동안 안쪽 입력란과 버튼은 접근성 트리에 없다.
//     버튼 이름은 '링크 열기'(guardian.pasteOpen)라 펼친 채 PIN 단계여도 PIN 입력의 '열기'와 겹치지 않는다.
// 저장소를 쓰는 연결 부품이다. 시안 보드는 이 부품을 그리지 않는다.

import { useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, Icon } from '@/components/ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { PASTE_MAX_CHARS, fragmentFromPasted } from '@/src/guardian/index.js';
import { ErrorText, WarningNote } from './Feedback.js';
import { notifyIncomingLink, stripLinkFromAddress } from './hooks.js';
import { initialPasteFold, pasteFoldAfterAccept, pasteFoldAfterToggle, pasteFoldOpen } from './pasteView.js';

/**
 * @param {object} props
 * @param {boolean} [props.defaultOpen]  펼쳐 둘지. 값이 바뀌면 그 값으로 다시 맞춘다(그 사이 보호자가 펼치거나 접은 것은 그대로 둔다)
 * @param {(fragment: string) => void} [props.onAccepted]  받아들인 뒤 부른다. 화면이 다음 단계로 포커스를 옮긴다
 */
export default function PasteLink({ defaultOpen = false, onAccepted }) {
  const { t } = useLang();
  const titleId = useId();
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [holdFailed, setHoldFailed] = useState(false);
  // 펼침 상태는 그때의 defaultOpen 과 함께 둔다: defaultOpen 이 바뀌면 그 값을 따르고, 아니면 보호자가 고른 값을 쓴다
  const [fold, setFold] = useState(() => initialPasteFold(defaultOpen));
  const open = pasteFoldOpen(fold, defaultOpen);

  function onSubmit(event) {
    event.preventDefault();
    const fragment = fragmentFromPasted(text);
    if (!fragment) {
      setHoldFailed(false);
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    const held = getStore().holdPendingGuardianLink(fragment);
    if (!held?.ok) {
      setInvalid(false);
      setHoldFailed(true);
      return;
    }
    setText('');
    setInvalid(false);
    setHoldFailed(false);
    setFold(pasteFoldAfterAccept(defaultOpen));
    stripLinkFromAddress();
    notifyIncomingLink();
    onAccepted?.(fragment);
  }

  return (
    <section className="guardian-section guardian-paste" aria-labelledby={titleId}>
      <details
        className="guardian-paste-fold"
        open={open}
        onToggle={(e) => setFold(pasteFoldAfterToggle(fold, defaultOpen, e.currentTarget.open))}
      >
        <summary className="guardian-paste-summary">
          <h2 id={titleId} className="guardian-paste-title">
            {t('guardian.pasteTitle')}
          </h2>
          <span className="guardian-day-chevron" aria-hidden="true">
            <Icon name="chevronDown" size={20} />
          </span>
        </summary>
        <form className="guardian-paste-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor={inputId}>{t('guardian.pasteLabel')}</label>
            <textarea
              id={inputId}
              ref={inputRef}
              className="guardian-link-field"
              rows={4}
              maxLength={PASTE_MAX_CHARS}
              value={text}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => {
                setText(e.target.value);
                if (invalid) setInvalid(false);
                if (holdFailed) setHoldFailed(false);
              }}
              aria-invalid={invalid ? 'true' : undefined}
              aria-describedby={invalid ? `${helpId} ${errorId}` : helpId}
            />
            <p id={helpId} className="guardian-hint">
              {t('guardian.pasteHelp')}
            </p>
          </div>
          <ErrorText id={errorId}>{invalid ? t('guardian.pasteInvalid') : null}</ErrorText>
          {holdFailed && <WarningNote role="alert">{t('guardian.pasteHoldFailed')}</WarningNote>}
          <Button type="submit" className="guardian-paste-open">
            {t('guardian.pasteOpen')}
          </Button>
        </form>
      </details>
    </section>
  );
}
