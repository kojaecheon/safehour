// SafeHour 다국어 런타임 (AX-209 · ADR-0003)
//
// 서버는 언어를 모른다. 판정은 언어와 무관하고, 언어는 표시 계층에서만 결정된다.
// 이 모듈은 클라이언트·테스트 양쪽에서 쓰이므로 브라우저 API 에 의존하지 않는다.

import { UI_TEXT } from './dictionary.js';
import { STATE_MESSAGE, REASON_TEXT } from '../domain/states.js';

export const LANGS = ['ko', 'en'];

/** 서버 렌더 기본값. 클라이언트에서 사용자 설정·브라우저 언어로 교체된다. */
export const DEFAULT_LANG = 'ko';

export function isLang(value) {
  return LANGS.includes(value);
}

/**
 * `navigator.language` 같은 BCP-47 태그를 지원 언어로 좁힌다.
 * 한국어가 아니면 영어로 본다 — 대상 사용자가 외국인 환자이기 때문이다.
 */
export function normalizeLang(tag) {
  if (typeof tag !== 'string' || tag.trim() === '') return DEFAULT_LANG;
  const base = tag.trim().toLowerCase().split('-')[0];
  if (base === 'ko') return 'ko';
  return 'en';
}

/** `{name}` 자리표시자를 치환한다. 값이 없으면 표시자를 그대로 남긴다. */
export function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * 화면 문구 조회.
 * 키가 없으면 개발 중 눈에 띄도록 키 자체를 반환한다 — 조용한 빈 문자열은
 * 안전 문구를 사라지게 만들 수 있어 금지한다.
 */
export function translate(key, lang = DEFAULT_LANG, vars) {
  const entry = UI_TEXT[key];
  if (!entry) return key;
  const text = entry[lang] ?? entry[DEFAULT_LANG] ?? key;
  return interpolate(text, vars);
}

/** 안전 판정 상태 문구 — 정본은 도메인 계층이다. */
export function stateMessage(state, lang = DEFAULT_LANG) {
  const entry = STATE_MESSAGE[state];
  if (!entry) return null;
  return {
    message: entry[lang] ?? entry.ko,
    action: entry.action[lang] ?? entry.action.ko,
  };
}

/** 판정 사유 문구 — 정본은 도메인 계층이다. 미정의 코드는 코드 그대로 노출한다. */
export function reasonText(code, lang = DEFAULT_LANG) {
  const entry = REASON_TEXT[code];
  if (!entry) return code;
  return entry[lang] ?? entry.ko ?? code;
}

/** 분 단위 시간 라벨 — 언어별 단위 표기를 사전에서 가져온다. */
export function minutesLabel(min, lang = DEFAULT_LANG) {
  if (min == null || Number.isNaN(Number(min))) return translate('common.minutesUnknown', lang);
  const n = Math.round(Number(min));
  if (n < 60) return translate('common.minutes', lang, { n });
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0
    ? translate('common.hours', lang, { h })
    : translate('common.hoursMinutes', lang, { h, m });
}

/** `Intl` 로케일 태그 — 날짜·시각 포맷에 쓴다. */
export function intlLocale(lang) {
  return lang === 'en' ? 'en-GB' : 'ko-KR';
}
