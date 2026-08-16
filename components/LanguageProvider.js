'use client';

// 언어 컨텍스트 (AX-209 · ADR-0003)
//
//   - 서버 렌더는 항상 기본 언어(ko)로 나간다. 하이드레이션 불일치를 만들지 않기 위해
//     브라우저 언어 감지는 마운트 이후에만 수행한다 (이 저장소의 기존 패턴과 동일).
//   - 언어는 sessionStorage 에만 남는다. 새 localStorage 를 만들지 않아
//     개인정보 검토 대상이 늘지 않는다.
//   - 언어는 표시 계층 전용이다. 서버로 전송하지 않으며 판정에 영향을 주지 않는다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANG,
  intlLocale,
  isLang,
  minutesLabel as minutesLabelFor,
  normalizeLang,
  reasonText as reasonTextFor,
  stateMessage as stateMessageFor,
  translate,
} from '@/src/i18n/index.js';

const LANG_KEY = 'safehour.lang';

const LanguageContext = createContext(null);

export default function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  // 저장된 선택 → 브라우저 언어 → 기본값 순으로 결정한다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let next = null;
      try {
        const saved = sessionStorage.getItem(LANG_KEY);
        if (isLang(saved)) next = saved;
      } catch {
        next = null;
      }
      if (!next) next = normalizeLang(navigator?.language);
      setLangState(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 스크린리더가 올바른 음성으로 읽도록 문서 언어를 실제로 바꾼다 (WCAG 3.1.1).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!isLang(next)) return;
    setLangState(next);
    try {
      sessionStorage.setItem(LANG_KEY, next);
    } catch {
      // 저장 실패는 조용히 넘긴다 — 현재 화면 언어는 이미 바뀌었다
    }
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(key, lang, vars),
      minutesLabel: (min) => minutesLabelFor(min, lang),
      stateMessage: (state) => stateMessageFor(state, lang),
      reasonText: (code) => reasonTextFor(code, lang),
      locale: intlLocale(lang),
    }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * 화면에서 쓰는 훅. Provider 밖에서 호출되면 기본 언어로 동작한다 —
 * 문구가 통째로 사라지는 것보다 한국어로라도 보이는 편이 안전하다.
 */
export function useLang() {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    lang: DEFAULT_LANG,
    setLang: () => {},
    t: (key, vars) => translate(key, DEFAULT_LANG, vars),
    minutesLabel: (min) => minutesLabelFor(min, DEFAULT_LANG),
    stateMessage: (state) => stateMessageFor(state, DEFAULT_LANG),
    reasonText: (code) => reasonTextFor(code, DEFAULT_LANG),
    locale: intlLocale(DEFAULT_LANG),
  };
}
