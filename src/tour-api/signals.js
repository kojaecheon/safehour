// 관광 후보 분류 신호 (spec 4.8 / AX-305)
//
// 이 모듈은 **판정하지 않는다.** 엔진(T6a)이 게이트에 쓸 신호만 만든다.
//
//   - 신호는 SafeHour 추정값이다. 관광공사 원문(sourceMetadata)과 섞지 않고 `signals` 에 둔다.
//   - 입력은 언어와 무관한 것만 쓴다: 국문 제목, 국문 유형 코드, 분류체계 코드, 국문 메뉴 원문.
//     표시 언어의 제목을 쓰면 같은 장소가 언어마다 다르게 판정된다(spec 4.17, 규칙 27).
//   - 불확실하면 null 이다. 모르는 것을 '아님(false)'으로 바꾸지 않는다(spec 9.1).
//
// 신호 의미
//   isFoodPlace   국문 유형 39(음식점). 식이 신호는 이 값이 true 일 때만 뜻이 있다.
//   isCafe        분류체계 FD05(카페/찻집) true · 다른 음식 분류 false · 음식점인데 분류 없음 null ·
//                 음식점 아님 false
//   isBar         분류체계 FD04(주점) true · 다른 음식 분류 false · 분류 없음이면 이름 단서 true, 없으면 null ·
//                 음식점 아님 false
//   heatExposure  열 노출 단서 있음 true, 없으면 false (spec 4.8: 단서가 없으면 노출 없음)
//   waterActivity 물 활동 단서 있음 true, 없으면 false
//   spicy / raw   단서 있음 true · 카페 유형이거나 메뉴 원문에 단서가 없음 false · 판단할 근거 없음 null ·
//                 음식점 아님 null (적용 대상 아님)
//   hasMenuInfo   메뉴 원문 있음 true · 조회했으나 비어 있음 false · 조회 안 함 null · 음식점 아님 null
//   interestTags  관심사 태그(INTEREST_TAGS 순서)

import {
  BAR_CUES,
  CAFE_CUES,
  CUE_FALSE_FRIENDS,
  FOOD_LCLS_SYSTM1,
  HEAT_CUES,
  INTEREST_TAGS,
  INTEREST_TAG_RULES,
  MEDICAL_CUES,
  RAW_CUES,
  SPICY_CUES,
  WATER_CUES,
} from "./cues.js";
import { CONTENT_TYPE } from "./content-types.js";

/** 메뉴 원문 필드 — 공식 명세 detailIntro2 음식점(39/82): firstmenu 대표메뉴, treatmenu 취급메뉴 */
export const MENU_FIELDS = Object.freeze(["firstmenu", "treatmenu"]);

function plainText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutFalseFriends(text) {
  let result = text;
  for (const word of CUE_FALSE_FRIENDS) result = result.split(word).join(" ");
  return result;
}

/**
 * 텍스트에서 단서를 찾는다. 찾은 단서를 목록 순서대로 돌려준다.
 * @param {string} text
 * @param {{substrings?: readonly string[], tokens?: readonly string[], words?: readonly string[]}} cues
 * @returns {string[]}
 */
export function matchCues(text, cues) {
  const source = withoutFalseFriends(plainText(text));
  if (!source) return [];

  const found = [];
  for (const cue of cues.substrings ?? []) {
    if (source.includes(cue)) found.push(cue);
  }

  const tokenSet = new Set(source.split(/[^0-9A-Za-z가-힣ぁ-んァ-ヶ一-龥]+/).filter(Boolean));
  for (const cue of cues.tokens ?? []) {
    if (tokenSet.has(cue)) found.push(cue);
  }

  for (const cue of cues.words ?? []) {
    const pattern = new RegExp(`(^|[^A-Za-z])${escapeRegExp(cue).replace(/ /g, "\\s+")}($|[^A-Za-z])`, "i");
    if (pattern.test(source)) found.push(cue);
  }

  return [...new Set(found)];
}

function codeEvidence(classification, cues) {
  const evidence = [];
  for (const level of ["lclsSystm1", "lclsSystm2", "lclsSystm3"]) {
    const value = classification[level];
    if (value && (cues[level] ?? []).includes(value)) evidence.push({ field: level, cue: value });
  }
  return evidence;
}

function textEvidence(texts, cues) {
  const evidence = [];
  for (const [field, text] of texts) {
    for (const cue of matchCues(text, cues)) evidence.push({ field, cue });
  }
  return evidence;
}

function normalizeClassification(classification = {}) {
  const read = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  };
  return {
    lclsSystm1: read(classification?.lclsSystm1),
    lclsSystm2: read(classification?.lclsSystm2),
    lclsSystm3: read(classification?.lclsSystm3),
  };
}

/** 메뉴 원문의 상태: null(조회 안 함) · {}(조회했으나 비어 있음) · 값 있음 */
function menuTexts(menu) {
  if (!menu || typeof menu !== "object") return { fetched: false, texts: [] };
  const texts = MENU_FIELDS.map((field) => [field, plainText(menu[field])]).filter(([, text]) => text);
  return { fetched: true, texts };
}

/** 매운 음식·날음식 3상태 신호 */
function dietSignal({ isFoodPlace, isCafe, hasMenuInfo, texts, cues, classification }) {
  if (!isFoodPlace) return { value: null, evidence: [] };

  const hits = textEvidence(texts, cues);
  if (hits.length > 0) return { value: true, evidence: hits };

  // spec 4.8: 카페·전통찻집 유형은 '매운 음식·날음식 아님' 단서로 본다.
  if (isCafe === true) {
    return { value: false, evidence: [{ field: "lclsSystm2", cue: classification.lclsSystm2 }] };
  }
  // 메뉴 원문이 있고 단서가 없으면 판단할 근거가 있는 것이다.
  if (hasMenuInfo === true) return { value: false, evidence: [{ field: "menu", cue: null }] };

  // 판단할 단서가 없다 — 엔진은 MENU_UNKNOWN 으로 제외한다.
  return { value: null, evidence: [] };
}

function foodTypeSignal({ isFoodPlace, classification, cueCodes, nameEvidence }) {
  if (!isFoodPlace) return { value: false, evidence: [] };

  // 중분류 코드(FD01…FD05)가 있으면 음식점 세부 유형이 확인된 것이다.
  const typeKnown = Boolean(classification.lclsSystm2?.startsWith(FOOD_LCLS_SYSTM1));
  if (typeKnown) {
    const matched = cueCodes.includes(classification.lclsSystm2);
    return {
      value: matched,
      evidence: matched ? [{ field: "lclsSystm2", cue: classification.lclsSystm2 }] : [],
    };
  }
  if (nameEvidence.length > 0) return { value: true, evidence: nameEvidence };
  return { value: null, evidence: [] };
}

function ruleMatches(rule, { contentTypeId, classification, title }) {
  if ((rule.contentTypes ?? []).includes(contentTypeId)) return true;
  if (codeEvidence(classification, rule).length > 0) return true;
  return matchCues(title, rule).length > 0;
}

function interestTagsOf({ contentTypeId, classification, title, isFoodPlace, isCafe, isBar }) {
  const input = { contentTypeId, classification, title };
  const medical =
    codeEvidence(classification, MEDICAL_CUES).length > 0 || matchCues(title, MEDICAL_CUES).length > 0;

  const tags = new Set();
  for (const tag of INTEREST_TAGS) {
    if (tag === "CAFE") {
      if (isCafe === true) tags.add(tag);
      continue;
    }
    if (tag === "FOOD") {
      if (isFoodPlace && isCafe !== true && isBar !== true) tags.add(tag);
      continue;
    }
    if (tag === "KBEAUTY" && medical) continue;
    const rule = INTEREST_TAG_RULES[tag];
    if (rule && ruleMatches(rule, input)) tags.add(tag);
  }
  return INTEREST_TAGS.filter((tag) => tags.has(tag));
}

/**
 * 언어와 무관한 입력으로 분류 신호를 만든다.
 *
 * @param {object} input
 * @param {string} input.title           국문 제목 (표시 언어 제목이 아니다)
 * @param {string} input.contentTypeId   국문 체계 유형 코드
 * @param {{lclsSystm1?, lclsSystm2?, lclsSystm3?}} [input.classification] 분류체계 원문 코드
 * @param {{firstmenu?, treatmenu?}|null} [input.menu] 국문 detailIntro2 메뉴 원문. null 이면 조회 안 함
 */
export function deriveSignals({ title = "", contentTypeId = "", classification = {}, menu = null } = {}) {
  const codes = normalizeClassification(classification);
  const type = String(contentTypeId ?? "");
  const isFoodPlace = type === CONTENT_TYPE.FOOD;
  const titleText = plainText(title);

  const { fetched: menuFetched, texts: menuFieldTexts } = menuTexts(menu);
  const hasMenuInfo = !isFoodPlace ? null : menuFetched ? menuFieldTexts.length > 0 : null;
  const texts = [["title", titleText], ...menuFieldTexts];

  const cafe = foodTypeSignal({
    isFoodPlace,
    classification: codes,
    cueCodes: CAFE_CUES.lclsSystm2,
    nameEvidence: [], // 카페는 이름으로 확정하지 않는다 (cues.js CAFE_CUES 주석)
  });
  const bar = foodTypeSignal({
    isFoodPlace,
    classification: codes,
    cueCodes: BAR_CUES.lclsSystm2,
    nameEvidence: textEvidence([["title", titleText]], BAR_CUES),
  });

  const heatEvidence = [...codeEvidence(codes, HEAT_CUES), ...textEvidence([["title", titleText]], HEAT_CUES)];
  const waterEvidence = [...codeEvidence(codes, WATER_CUES), ...textEvidence([["title", titleText]], WATER_CUES)];

  const common = { isFoodPlace, isCafe: cafe.value, hasMenuInfo, texts, classification: codes };
  const spicy = dietSignal({ ...common, cues: SPICY_CUES });
  const raw = dietSignal({ ...common, cues: RAW_CUES });

  return {
    estimated: true,
    isFoodPlace,
    isCafe: cafe.value,
    isBar: bar.value,
    heatExposure: heatEvidence.length > 0,
    waterActivity: waterEvidence.length > 0,
    spicy: spicy.value,
    raw: raw.value,
    hasMenuInfo,
    interestTags: interestTagsOf({
      contentTypeId: type,
      classification: codes,
      title: titleText,
      isFoodPlace,
      isCafe: cafe.value,
      isBar: bar.value,
    }),
    evidence: {
      heatExposure: heatEvidence,
      waterActivity: waterEvidence,
      isCafe: cafe.evidence,
      isBar: bar.evidence,
      spicy: spicy.evidence,
      raw: raw.evidence,
    },
  };
}
