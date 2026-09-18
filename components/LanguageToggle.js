'use client';

// 언어 선택 — 모든 화면의 상단 바에 상시 노출한다.
// 대상 사용자가 외국인 환자이므로, 한국어를 읽지 못하는 사람도 찾을 수 있어야 한다.
// 언어명은 항상 자기 언어로 적는다(한국어 / English / 日本語 / 中文) — 번역하면 못 찾는다.
//
// AX-304: 4개 언어 버튼을 한 줄에 늘어놓으면 360px 에서 화면 제목이 잘린다.
// 그래서 지구본 + 현재 언어 이름만 보이는 작은 버튼을 두고, 누르면 4개 언어 목록이 펼쳐진다.
//   - 펼침 버튼의 접근 가능한 이름은 'Language — 한국어 선택됨' 처럼 영어와 현재 언어를 섞어 적는다
//     (common.langToggle). 보이는 언어 이름이 이름 안에 들어 있다(WCAG 2.5.3).
//   - 목록은 드러내기(disclosure) 방식이다: aria-expanded, Escape·바깥 누르기로 닫힘, 닫히면 펼침 버튼으로 포커스 복귀.
//   - 각 언어 버튼은 44px 이상이고 선택된 언어는 체크 아이콘 + 굵기 + aria-pressed 로 표시한다(색 단독 금지).

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from './LanguageProvider.js';
import Icon from './ui/Icon.js';
import { LANGS, LANG_NAMES } from '@/src/i18n/index.js';

export default function LanguageToggle() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(code) {
    setLang(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="lang-toggle" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t('common.langToggle')}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="globe" size={18} />
        <span lang={lang}>{LANG_NAMES[lang]}</span>
        <Icon name="chevronDown" size={16} className="lang-chevron" />
      </button>
      <ul id={listId} className="lang-list" role="list" hidden={!open}>
        {LANGS.map((code) => (
          <li key={code}>
            <button
              type="button"
              lang={code}
              className={lang === code ? 'selected' : undefined}
              aria-pressed={lang === code}
              onClick={() => choose(code)}
            >
              <span className="lang-check">{lang === code && <Icon name="check" size={18} />}</span>
              {LANG_NAMES[code]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
