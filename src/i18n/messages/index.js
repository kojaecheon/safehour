// 문구 이름공간 등록 파일 (AX-303 · spec 4.17)
//
// ── 쓰기 규칙 (plan "공유 파일 쓰기 안내") ──
//   - 이 등록 파일은 언어 기반 작업(AX-303)만 수정한다. 이름공간이 더 필요하면 추가하지 말고 보고한다.
//   - 화면 작업은 **자기 이름공간 파일만** 수정한다 (예: /today → today.js, /guardian·/g → guardian.js).
//   - 상태 메시지·사유 문구의 정본은 `src/domain/states.js`, 고지 본문은 `src/i18n/legal.js` 다.
//
// ── 이름공간 파일 형식 ──
//   export const messages = { '<키>': { ko, en, ja, zh } }   일반 화면 문구
//   export const safety   = { '<키>': { ko, en, ja, zh } }   안전 문구
//   - 키는 `<이름공간>.` 으로 시작한다. 기존 화면의 키만 LEGACY_PREFIXES 의 접두사를 그대로 쓴다.
//   - 4개 언어를 모두 채운다. 누락·빈 값·자리표시자 불일치는 test/i18n-languages.test.js 가 막는다.
//   - ja·zh 는 사람 검수 전이다. 파일 머리에 '검수 전 번역 — 사람 검수 필요' 를 남긴다.
//   - '안전합니다'·'安全です'·'是安全的' 처럼 안전을 단정하는 표현을 쓰지 않는다 (spec 9.1).
//
// ── 안전 문구 (spec 4.17) ──
//   상태 메시지·사유·고지·복귀 안내 **문장**은 safety 에 둔다. 라벨·제목·시각 표시는 messages 다.
//   - 화면의 t(key) 는 safety 키를 safetyPair() 의 주 언어로 보여준다.
//     ja·zh 는 검수 스위치가 켜지기 전까지 영어로 대체된다 (선택 언어가 ko·en 이면 그대로).
//   - 두 줄 병기가 필요한 곳은 useLang().pair(key) 로 주 언어 + 한국어(ko 면 영어)를 함께 그린다.

import * as common from './common.js';
import * as onboarding from './onboarding.js';
import * as conditions from './conditions.js';
import * as today from './today.js';
import * as trip from './trip.js';
import * as place from './place.js';
import * as cards from './cards.js';
import * as emergency from './emergency.js';
import * as guardian from './guardian.js';
import * as settings from './settings.js';
import * as privacy from './privacy.js';
import * as designBoard from './designBoard.js';
import * as notifications from './notifications.js';
import * as errors from './errors.js';
import * as aiIntro from './aiIntro.js';
import * as help from './help.js';

/** 등록된 이름공간 — 이름 → { messages, safety } */
export const NAMESPACES = Object.freeze({
  common,
  onboarding,
  conditions,
  today,
  trip,
  place,
  cards,
  emergency,
  guardian,
  settings,
  privacy,
  designBoard,
  notifications,
  errors,
  aiIntro,
  help,
});

export const NAMESPACE_NAMES = Object.freeze(Object.keys(NAMESPACES));

/**
 * 기존 화면이 쓰던 키 접두사 → 소속 이름공간.
 * 키를 바꾸면 화면 코드를 모두 고쳐야 하므로, 기존 키는 그대로 두고 소속만 정했다.
 * 소속은 그 화면을 다시 만들거나 퇴역시키는 작업의 이름공간이다. 새 키는 이름공간 이름으로 시작한다.
 * 키가 하나도 남지 않은 접두사(퇴역한 단일 외출 화면의 plan.·result.·card.)는 AX-321 에서 뺐다.
 */
export const LEGACY_PREFIXES = Object.freeze({
  common: Object.freeze(['state.']),
  onboarding: Object.freeze(['home.', 'login.']),
  conditions: Object.freeze(['link.', 'guide.']),
  trip: Object.freeze(['event.', 'eventPanel.', 'return.', 'delta.']),
  place: Object.freeze(['schedule.']),
  settings: Object.freeze(['clear.']),
});

function flatten() {
  const text = {};
  const safetyKeys = new Set();
  for (const ns of Object.values(NAMESPACES)) {
    Object.assign(text, ns.messages);
    for (const [key, entry] of Object.entries(ns.safety)) {
      text[key] = entry;
      safetyKeys.add(key);
    }
  }
  return { text: Object.freeze(text), safetyKeys };
}

const flat = flatten();

/** 모든 이름공간을 합친 평평한 사전 — 키 → { ko, en, ja, zh } */
export const UI_TEXT = flat.text;

/** 안전 문구 키 — 화면에서 safetyPair() 규칙으로 보인다 */
export const SAFETY_KEYS = flat.safetyKeys;
