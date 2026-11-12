// SafeHour 다국어 런타임 (AX-209 · AX-303 · ADR-0003 → ADR-0007 · docs/business-rules.md '언어')
//
// 언어는 표시 계층에서만 결정된다. 판정은 언어와 무관하다 — 판정·일정 모듈은 이 모듈을 가져오지 않는다.
// 이 모듈은 클라이언트·테스트 양쪽에서 쓰이므로 브라우저 API 에 의존하지 않는다.
//
// 화면이 문구를 얻는 길
//   - 화면 컴포넌트: `useLang()` (components/LanguageProvider.js) 의 t·pair·stateMessage·reasonText
//   - 순수 함수: 아래 translate·displayText·safetyText·stateMessage·reasonText·pickText
//   - 안전 문구 병기 규칙은 safetyPair() **하나**에만 있다.

import { UI_TEXT, SAFETY_KEYS } from './messages/index.js';
import { STATE_MESSAGE, REASON_TEXT } from '../domain/states.js';

/** 지원 언어 — zh 는 중국어 간체다 */
export const LANGS = Object.freeze(['ko', 'en', 'ja', 'zh']);

/** 서버 렌더 기본값. 클라이언트에서 기기에 저장한 선택·브라우저 언어로 교체된다. */
export const DEFAULT_LANG = 'ko';

/** 언어 전환 버튼 이름 — 번역하지 않고 항상 자기 언어로 적는다(번역하면 못 찾는다) */
export const LANG_NAMES = Object.freeze({ ko: '한국어', en: 'English', ja: '日本語', zh: '中文' });

export function isLang(value) {
  return LANGS.includes(value);
}

/**
 * `navigator.language` 같은 BCP-47 태그를 지원 언어로 좁힌다 (docs/business-rules.md '언어').
 * `ko*`→ko, `ja*`→ja, `zh*`(zh-CN·zh-TW·zh-Hans…)→zh, 그 밖→en.
 * 모르는 언어를 한국어로 떨어뜨리지 않는다 — 대상 사용자가 외국인 환자이기 때문이다.
 */
export function normalizeLang(tag) {
  if (typeof tag !== 'string' || tag.trim() === '') return DEFAULT_LANG;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'ko' || base === 'ja' || base === 'zh') return base;
  return 'en';
}

// ── 안전 문구 검수 스위치 (src/i18n/AGENTS.md '항상 지켜야 하는 것' · ADR-0007) ──

/** 검수 스위치 환경변수 이름. 빌드 시점 공개 환경변수이며 기본은 꺼짐이다. */
export const SAFETY_REVIEW_ENV = Object.freeze({
  ja: 'NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA',
  zh: 'NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_ZH',
});

/** 스위치 값 해석 — 값이 정확히 문자열 '1' 일 때만 켜진다. */
export function readSafetyReview(values) {
  return Object.freeze({ ja: values?.ja === '1', zh: values?.zh === '1' });
}

function buildTimeReviewValues() {
  // Next.js 는 `process.env.NEXT_PUBLIC_*` 를 **글자 그대로 쓴 곳만** 빌드 때 값으로 바꾼다.
  // 구조 분해·동적 키로 읽으면 브라우저 번들에서는 늘 꺼짐이 된다. 바꾸려면 다시 빌드해야 한다.
  try {
    return {
      ja: process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA,
      zh: process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_ZH,
    };
  } catch {
    // process 가 없는 실행 환경 — 꺼짐으로 둔다
    return {};
  }
}

/** 이 빌드의 검수 스위치 — { ja: boolean, zh: boolean } */
export const SAFETY_COPY_REVIEWED = readSafetyReview(buildTimeReviewValues());

/**
 * 안전 문구 병기 규칙 (docs/business-rules.md '언어'). **병기 언어는 이 함수만 정한다.**
 *
 *   ko → { primary: 'ko', secondary: 'en' }
 *   en → { primary: 'en', secondary: 'ko' }
 *   ja·zh → 검수 스위치가 켜져 있으면 { primary: 선택 언어, secondary: 'ko' },
 *           꺼져 있으면 { primary: 'en', secondary: 'ko' }
 *
 * 안전 문구 = 상태 메시지·사유·고지·복귀 안내. 일반 화면 문구에는 쓰지 않는다.
 * 지원하지 않는 값은 기본 언어(ko)로 본다.
 *
 * @param {string} lang 선택 언어
 * @param {{ ja: boolean, zh: boolean }} [reviewed] 검수 스위치 (기본: 이 빌드의 값)
 * @returns {{ primary: 'ko'|'en'|'ja'|'zh', secondary: 'ko'|'en' }}
 */
export function safetyPair(lang, reviewed = SAFETY_COPY_REVIEWED) {
  const selected = isLang(lang) ? lang : DEFAULT_LANG;
  if (selected === 'ko') return { primary: 'ko', secondary: 'en' };
  if (selected === 'en') return { primary: 'en', secondary: 'ko' };
  // 사람 검수 전 ja·zh 안전 문구는 보여주지 않는다 — 스위치는 readSafetyReview() 가 만든 true 만 인정한다
  const primary = reviewed?.[selected] === true ? selected : 'en';
  return { primary, secondary: 'ko' };
}

// ── 문구 조회 ──

/** 대체 순서: 요청 언어 → 영어 → 한국어. 대상 사용자가 외국인이므로 한국어보다 영어가 먼저다. */
const FALLBACK_LANGS = ['en', 'ko'];

/**
 * 언어별 문구 묶음 `{ ko, en, ja, zh }` 에서 한 언어를 고른다.
 * 빈 문자열도 누락으로 보고 대체 언어로 넘어간다. 아무것도 없으면 null.
 */
export function pickText(entry, lang) {
  if (!entry || typeof entry !== 'object') return null;
  for (const candidate of [lang, ...FALLBACK_LANGS]) {
    const value = entry[candidate];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/** `{name}` 자리표시자를 치환한다. 값이 없으면 표시자를 그대로 남긴다. */
export function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * 사전 조회 — 요청한 언어 그대로 찾는다(안전 문구 규칙을 적용하지 않는다).
 * 키가 없으면 개발 중 눈에 띄도록 키 자체를 반환한다 — 조용한 빈 문자열은
 * 안전 문구를 사라지게 만들 수 있어 금지한다.
 */
export function translate(key, lang = DEFAULT_LANG, vars) {
  const text = pickText(UI_TEXT[key], lang);
  if (text === null) return key;
  return interpolate(text, vars);
}

/** 이 키가 안전 문구인가 — 이름공간 파일의 safety 구역에 있는 키 */
export function isSafetyKey(key) {
  return SAFETY_KEYS.has(key);
}

/**
 * 화면 표시용 조회 — 화면의 t() 가 이것이다.
 * 일반 문구는 선택 언어, 안전 문구 키는 safetyPair() 의 주 언어로 보인다.
 */
export function displayText(key, lang = DEFAULT_LANG, vars, reviewed = SAFETY_COPY_REVIEWED) {
  const shown = isSafetyKey(key) ? safetyPair(lang, reviewed).primary : lang;
  return translate(key, shown, vars);
}

/**
 * 안전 문구 병기용 두 줄 — `{ primary: { lang, text }, secondary: { lang, text } }`.
 * 각 줄의 lang 은 화면 요소의 `lang` 속성에 그대로 붙인다(스크린리더 음성).
 */
export function safetyText(key, lang = DEFAULT_LANG, vars, reviewed = SAFETY_COPY_REVIEWED) {
  const { primary, secondary } = safetyPair(lang, reviewed);
  return {
    primary: { lang: primary, text: translate(key, primary, vars) },
    secondary: { lang: secondary, text: translate(key, secondary, vars) },
  };
}

/**
 * 안전 판정 상태 문구 — 정본은 도메인 계층이다. 요청한 언어 그대로 찾는다.
 * 화면은 safetyPair() 가 고른 언어로 부른다 (useLang().stateMessage 가 그렇게 한다).
 */
export function stateMessage(state, lang = DEFAULT_LANG) {
  const entry = STATE_MESSAGE[state];
  if (!entry) return null;
  return {
    message: pickText(entry, lang) ?? state,
    action: pickText(entry.action, lang) ?? '',
  };
}

/** 판정 사유 문구 — 정본은 도메인 계층이다. 미정의 코드는 코드 그대로 노출한다. */
export function reasonText(code, lang = DEFAULT_LANG) {
  return pickText(REASON_TEXT[code], lang) ?? code;
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

const INTL_LOCALE = Object.freeze({ ko: 'ko-KR', en: 'en-GB', ja: 'ja-JP', zh: 'zh-CN' });

/** `Intl` 로케일 태그 — 날짜·시각 포맷에 쓴다. 시간대는 언어와 무관하게 한국 시각이다. */
export function intlLocale(lang) {
  return INTL_LOCALE[lang] ?? INTL_LOCALE[DEFAULT_LANG];
}
