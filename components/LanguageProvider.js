'use client';

// 언어 컨텍스트 (AX-209 · AX-303 · ADR-0003 → ADR-0007 · docs/business-rules.md '언어')
//
//   - 서버 렌더는 항상 기본 언어(ko)로 나간다. 하이드레이션 불일치를 만들지 않기 위해
//     언어 결정은 마운트 이후에만 수행한다 (이 저장소의 기존 패턴과 동일).
//   - 언어 결정 순서: 기기에 저장한 사용자 선택 → 브라우저 언어(docs/business-rules.md '언어') → 기본값.
//     선택은 기기 저장소(lib/store 의 readLang·writeLang, 키 `safehour.v2.device.lang`)에 남는다.
//     개인정보가 아니며 '내 정보 지우기' 뒤에도 남는다 (ADR-0009 · docs/security.md '기기 저장소와 계정 이름공간').
//   - 예전 키 `safehour.lang`(AX-209) 값은 처음 한 번 새 저장소로 옮기고 지운다 (AX-304).
//   - 다른 탭에서 언어를 바꾸면 저장소의 'prefs' 알림으로 이 탭도 따라 바뀐다.
//   - 언어는 표시 계층 전용이다. 판정에 영향을 주지 않는다.
//   - 안전 문구(상태 메시지·사유·고지·복귀 안내)는 safetyPair() 규칙으로 보인다.
//     ja·zh 는 검수 스위치가 켜지기 전까지 영어로 대체되고, 병기 줄은 한국어다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANG,
  displayText,
  intlLocale,
  isLang,
  minutesLabel as minutesLabelFor,
  normalizeLang,
  reasonText as reasonTextFor,
  safetyPair,
  safetyText,
  stateMessage as stateMessageFor,
} from '@/src/i18n/index.js';
import { getStore } from '@/lib/store/index.js';

/** AX-209 이 쓰던 언어 키 — 새 기기 저장소로 한 번 옮긴 뒤 지운다 (lib/session.js LANG_KEY 와 같은 값) */
const LEGACY_LANG_KEY = 'safehour.lang';

const LanguageContext = createContext(null);

/**
 * 화면이 받는 언어 도구.
 *   t(key, vars)          화면 문구. 안전 문구 키는 safety.primary 언어로 보인다
 *   pair(key, vars)       안전 문구 병기 두 줄 { primary: { lang, text }, secondary: { lang, text } }
 *   stateMessage(state)   상태 메시지 { message, action } — safety.primary 언어
 *   reasonText(code)      사유 문구 — safety.primary 언어
 *   safety                { primary, secondary } — 병기 언어 (safetyPair)
 */
function buildValue(lang, setLang) {
  const safety = safetyPair(lang);
  return {
    lang,
    setLang,
    safety,
    t: (key, vars) => displayText(key, lang, vars),
    pair: (key, vars) => safetyText(key, lang, vars),
    minutesLabel: (min) => minutesLabelFor(min, lang),
    stateMessage: (state) => stateMessageFor(state, safety.primary),
    reasonText: (code) => reasonTextFor(code, safety.primary),
    locale: intlLocale(lang),
  };
}

/**
 * 예전 키에 남은 언어를 새 저장소로 한 번 옮긴다.
 * 새 저장소에 이미 선택이 있으면 그 값이 이긴다. 어느 경우든 예전 키는 지운다 — 다시 옮기지 않는다.
 */
function migrateLegacyLang(store) {
  let legacy = null;
  try {
    legacy = localStorage.getItem(LEGACY_LANG_KEY);
  } catch {
    return;
  }
  if (legacy === null) return;
  if (store.readLang() === null && isLang(legacy)) {
    // 옮기지 못하면(저장 공간 부족 등) 예전 키를 남겨 다음 실행에 다시 시도한다
    if (!store.writeLang(legacy)?.ok) return;
  }
  try {
    localStorage.removeItem(LEGACY_LANG_KEY);
  } catch {
    // 지우지 못해도 새 저장소 값이 우선이므로 동작은 같다
  }
}

/** 기기에 저장한 선택 — 없으면 null */
function readSavedLang() {
  const store = getStore();
  migrateLegacyLang(store);
  const saved = store.readLang();
  return isLang(saved) ? saved : null;
}

export default function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  // 기기에 저장한 선택 → 브라우저 언어 → 기본값 순으로 결정한다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLangState(readSavedLang() ?? normalizeLang(navigator?.language));
    }, 0);
    // 다른 탭에서 바꾼 언어를 따라간다 (저장소가 storage 이벤트를 'prefs' 로 알린다)
    const unsubscribe = getStore().subscribe('prefs', () => {
      const saved = getStore().readLang();
      if (isLang(saved)) setLangState(saved);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // 스크린리더가 올바른 음성으로 읽도록 문서 언어를 실제로 바꾼다 (WCAG 3.1.1).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!isLang(next)) return;
    setLangState(next);
    // 저장 실패(저장 공간 부족·차단)는 조용히 넘긴다 — 현재 화면 언어는 이미 바뀌었다.
    // 언어는 계정 데이터가 아니라서 보기 전용에서도 저장된다.
    getStore().writeLang(next);
  }, []);

  const value = useMemo(() => buildValue(lang, setLang), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const FALLBACK_VALUE = buildValue(DEFAULT_LANG, () => {});

/**
 * 화면에서 쓰는 훅. Provider 밖에서 호출되면 기본 언어로 동작한다 —
 * 문구가 통째로 사라지는 것보다 한국어로라도 보이는 편이 안전하다.
 */
export function useLang() {
  return useContext(LanguageContext) ?? FALLBACK_VALUE;
}
