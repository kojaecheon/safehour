// AI 일정 소개 문장: 출력 자동 검사 (AX-309 · docs/business-rules.md 'AI 소개 문장')
//
// AI 가 만든 문장이 아래 하나라도 걸리면 템플릿 문장으로 바꾼다(lib/server/ai-intro.js).
//   1. 빈 문장
//   2. 길이 초과 — DEFAULTS.ai.maxChars(200자, 코드 포인트 기준)
//   3. 선택 언어의 문자 체계가 아님
//   4. 금지 표현 — 안전·안심 단정, 의료·회복·치료·약·수술, 영업 중·열려 있음 단정,
//      보장·순위·1위, 가격
//      의료에는 이 제품의 대상 진료과(성형외과·피부과)와 흔한 시술 이름도 들어간다 —
//      '수술'·'시술' 만 막으면 '성형 일정 뒤에', 'after your dermatology visit' 가 그대로 나간다
//
// 원칙
//   - 애매하면 막는다. 잘못 막으면 템플릿 문장이 보일 뿐이고, 잘못 통과하면 의료 경계·안전 단정 위반이다.
//     그래서 목록은 일부러 넓다(예: 'best', '최고', '免费'). 오탐은 평가 스크립트 결과로 확인한다.
//   - 문자 체계와 금지 표현은 **요청에 있던 장소 이름을 빼고** 본다. 템플릿도 같은 이름을 그대로 넣으므로,
//     이름 안의 글자(예: '안심 카페 거리', 번역이 없어 한국어로 남은 이름) 때문에 떨어뜨리지 않는다.
//   - 영어 목록과 기호(통화·No.1)는 모든 언어에 적용한다. 한국어 문장 속 'safe' 도 막는다.
//   - 이 파일은 검사만 한다. 로그를 남기지 않는다.

import { DEFAULTS } from '../../src/stay/defaults.js';

/** 길이 한도(자), docs/platform/ITINERARY_RULES.md '조정 가능한 기본값'의 'AI 제한시간 / 길이' 행 */
export const AI_INTRO_MAX_CHARS = DEFAULTS.ai.maxChars;

/** 검사 규칙 */
export const INTRO_CHECK = Object.freeze({
  EMPTY: 'EMPTY',
  TOO_LONG: 'TOO_LONG',
  WRONG_SCRIPT: 'WRONG_SCRIPT',
  BANNED: 'BANNED',
});

/** 금지 표현 분류 */
export const BANNED = Object.freeze({
  SAFETY: 'SAFETY',
  MEDICAL: 'MEDICAL',
  OPEN_NOW: 'OPEN_NOW',
  GUARANTEE_RANK: 'GUARANTEE_RANK',
  PRICE: 'PRICE',
});

// ── 금지 표현 ──
// 분류 → 정규식 목록. 대소문자는 영어 목록만 무시한다.

const BANNED_PATTERNS = Object.freeze({
  /** 모든 언어 — 기호·숫자 표기 */
  any: {
    [BANNED.GUARANTEE_RANK]: [/\bno\.?\s*1\b/iu, /#\s*1\b/u, /[1１]\s*(?:위|位)/u],
    [BANNED.PRICE]: [/[$€£¥₩￦￥]/u, /\d\s*(?:won|krw|usd|dollars?|yen|jpy|yuan|cny|rmb)\b/iu],
  },
  /** 영어 — 모든 언어에 함께 적용한다 */
  en: {
    [BANNED.SAFETY]: [
      /\b(?:safe|safely|safer|safest|safety|secure|securely|security|risk[- ]?free|no[- ]risk|without risk|riskless|worry[- ]?free|peace of mind|reassur\w*|harmless)\b/iu,
    ],
    [BANNED.MEDICAL]: [
      /\b(?:medical|medicines?|medicat\w*|meds|hospital\w*|clinic\w*|doctors?|nurs(?:e|es|ing)|surg\w*|operations?|procedures?|treatments?|therap\w*|recover\w*|recuperat\w*|heal\w*|health\w*|pains?|painful|painkillers?|prescri\w*|pills?|drugs?|drugstores?|pharmac\w*|patients?|wounds?|scars?|swell\w*|bruis\w*|rehab\w*|post[- ]?op\w*|convalesc\w*|wellness)\b/iu,
      // 성형외과·피부과와 흔한 시술 이름 — 이 제품의 대상 진료과다
      /\b(?:cosmetic\w*|plastic surger\w*|aesthetic\w*|dermatolog\w*|botox|fillers?|lasers?|lifting|liposuction|rhinoplasty|blepharoplasty)\b/iu,
    ],
    [BANNED.OPEN_NOW]: [
      /\b(?:open|opens|opened|opening|reopen\w*|24\/7|24[- ]hours?|around the clock|business hours|operating hours|never clos\w*|always available)\b/iu,
    ],
    [BANNED.GUARANTEE_RANK]: [
      /\b(?:guarantee[sd]?|guaranteeing|assured?|assurance|certain(?:ly)?|definitely|promise[sd]?|best|top[- ]?(?:rated|ranked|\d+)|rank(?:ed|ing|ings)?|number\s*one|first[- ]place|most[- ]popular|world[- ]class|finest|greatest|unbeatable|unrivall?ed)\b/iu,
    ],
    [BANNED.PRICE]: [
      /\b(?:prices?|priced|pricey|pricing|costs?|costly|fees?|free of charge|for free|free (?:entry|admission)|admission|tickets?|discount\w*|cheap\w*|expensive|affordabl[ey]|budget|won|krw|usd|dollars?|yen|yuan|rmb)\b/iu,
    ],
  },
  ko: {
    [BANNED.SAFETY]: [/안전|안심|무사히|걱정\s*(?:없|마)|위험(?:하지|이|은)?\s*없/u],
    [BANNED.MEDICAL]: [
      /의료|병원|의원|클리닉|진료|진찰|치료|회복|수술|시술|처방|복약|복용|투약|의약|약국|약물|진통|통증|붓기|부기|상처|흉터|요양|재활|환자|건강|힐링|컨디션|몸\s*상태/u,
      // 성형외과·피부과와 흔한 시술 이름
      /성형|피부과|미용\s*의료|보톡스|필러|레이저|리프팅|지방\s*흡입/u,
      // '약' 한 글자는 '예약·약간·약 30분' 과 겹치므로 약을·약은·약이·약도와 복용 동사로만 본다
      /(?<![가-힣])약(?:을|은|이|도)(?![가-힣])|약\s*(?:먹|드시|챙기)/u,
    ],
    [BANNED.OPEN_NOW]: [
      /영업\s*(?:중|하|시간)|운영\s*(?:중|하고|시간)|열려\s*있|문\s*(?:을\s*)?열|오픈\s*(?:중|했|하|시간)|24\s*시간|연중\s*무휴|휴무\s*(?:일\s*)?없/u,
    ],
    [BANNED.GUARANTEE_RANK]: [
      /보장|보증|확실|틀림없|반드시|순위|랭킹|일위|최고|최상|넘버\s*원|베스트|가장\s*(?:유명|인기|좋|큰|아름다)|제일\s*(?:유명|인기|좋)/u,
    ],
    [BANNED.PRICE]: [/가격|요금|비용|무료|유료|할인|입장료|저렴|비싸|가성비|\d[\d,]*\s*(?:원|만\s*원|천\s*원)|[천만]\s*원|달러|엔화|위안/u],
  },
  ja: {
    [BANNED.SAFETY]: [/安全|安心|無事|心配(?:な|無|いら)|危険(?:は|が)?(?:な|無)/u],
    [BANNED.MEDICAL]: [
      /医療|病院|医院|クリニック|診療|診察|治療|回復|手術|施術|処方|服薬|服用|投薬|薬|痛み|腫れ|傷|療養|リハビリ|患者|健康|体調|癒し|癒やし|ヒーリング/u,
      // 성형외과·피부과와 시술 이름
      /整形|美容|皮膚科|ボトックス|フィラー|ヒアルロン酸|レーザー|リフティング|脂肪吸引/u,
    ],
    [BANNED.OPEN_NOW]: [/営業中|営業して|営業時間|開いて(?:い|る|ま)|開店|オープン(?:中|して|時間)|24時間|年中無休|定休日(?:は)?(?:な|無)/u],
    [BANNED.GUARANTEE_RANK]: [/保証|確実|間違いな|必ず|ランキング|順位|第?[1１一]位|一番人気|ナンバーワン|最高|最上|ベスト|最も人気|最も有名/u],
    [BANNED.PRICE]: [/円|価格|料金|値段|費用|無料|有料|割引|入場料|格安|安い|高い|お得|ウォン|ドル|人民元/u],
  },
  zh: {
    [BANNED.SAFETY]: [/安全|安心|放心|无忧|無憂|无风险|平安/u],
    [BANNED.MEDICAL]: [
      /医疗|医院|诊所|门诊|诊疗|看病|治疗|康复|恢复|复原|手术|术后|处方|服药|用药|吃药|药|疼痛|肿|伤口|疗养|理疗|健康|患者|病人|疗愈|治愈|养生/u,
      // 성형외과·피부과와 시술 이름 (간체)
      /整形|美容|皮肤科|肉毒|玻尿酸|激光|提拉|吸脂/u,
      // 번체로 답한 경우
      /醫|診|療|藥|術後|康復|恢復|皮膚科|雷射/u,
    ],
    [BANNED.OPEN_NOW]: [/营业|正在营业|开门|开放|开着|24小时|全天候|全年无休|随时|營業|開門|開放/u],
    [BANNED.GUARANTEE_RANK]: [
      /保证|保障|确保|肯定会|必定|排名|排行|榜首|榜单|第[1一](?:名|位)|最好|最佳|最受欢迎|最有名|最著名|顶级|首选|必去|必游|必打卡|保證|確保/u,
    ],
    [BANNED.PRICE]: [/\d\s*元|韩元|美元|日元|人民币|块钱|价格|价钱|费用|门票|票价|免费|收费|折扣|优惠|便宜|昂贵|划算|实惠|價|費用|門票|免費|收費|優惠|韓元/u],
  },
});

const CATEGORY_ORDER = Object.freeze([
  BANNED.SAFETY,
  BANNED.MEDICAL,
  BANNED.OPEN_NOW,
  BANNED.GUARANTEE_RANK,
  BANNED.PRICE,
]);

/**
 * 금지 표현 분류 하나. 없으면 null.
 * 적용 목록: 공통 기호 + 영어 + 선택 언어.
 * @param {string} text  장소 이름을 뺀 문장
 * @param {'ko'|'en'|'ja'|'zh'} lang
 */
export function findBanned(text, lang) {
  const tables = [BANNED_PATTERNS.any, BANNED_PATTERNS.en];
  if (lang !== 'en' && BANNED_PATTERNS[lang]) tables.push(BANNED_PATTERNS[lang]);
  for (const category of CATEGORY_ORDER) {
    for (const table of tables) {
      if ((table[category] ?? []).some((pattern) => pattern.test(text))) return category;
    }
  }
  return null;
}

// ── 문자 체계 ──

const LETTER = /\p{L}/u;
const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
/** 장음 부호(ー)처럼 여러 문자 체계가 함께 쓰는 글자 — 세지 않는다 */
const SHARED = /[\p{Script=Common}\p{Script=Inherited}]/u;
/** 번체에만 있는 흔한 글자: zh 는 간체다(docs/business-rules.md '언어') */
const TRADITIONAL_ONLY = /[們這個來時會說過還點對為從]/u;

/** 글자 수 세기 — { hangul, kana, han, latin, other } (문장부호·숫자·기호는 세지 않는다) */
export function scriptProfile(text) {
  const count = { hangul: 0, kana: 0, han: 0, latin: 0, other: 0 };
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    if (HANGUL.test(ch)) count.hangul += 1;
    else if (KANA.test(ch)) count.kana += 1;
    else if (HAN.test(ch)) count.han += 1;
    else if (LATIN.test(ch)) count.latin += 1;
    else if (!SHARED.test(ch)) count.other += 1;
  }
  return count;
}

/**
 * 선택 언어의 문자 체계인가.
 *   ko: 한글이 있고 가나·한자가 없으며, 라틴 문자보다 한글이 많다
 *   en: 라틴 문자만 (한글·가나·한자 없음)
 *   ja: 가나가 있고 한글이 없으며, 가나+한자가 라틴 문자보다 많다
 *   zh: 한자가 있고 가나·한글·흔한 번체 글자가 없으며, 한자가 라틴 문자보다 많다
 * 그 밖의 문자 체계(키릴·태국 문자 등)가 한 글자라도 있으면 아니다.
 * @param {string} text  장소 이름을 뺀 문장
 * @param {'ko'|'en'|'ja'|'zh'} lang
 */
export function scriptMatches(text, lang) {
  const c = scriptProfile(text);
  if (c.other > 0) return false;
  switch (lang) {
    case 'ko':
      return c.hangul > 0 && c.kana === 0 && c.han === 0 && c.hangul >= c.latin;
    case 'en':
      return c.latin > 0 && c.hangul === 0 && c.kana === 0 && c.han === 0;
    case 'ja':
      return c.kana > 0 && c.hangul === 0 && c.kana + c.han >= c.latin;
    case 'zh':
      return c.han > 0 && c.kana === 0 && c.hangul === 0 && c.han >= c.latin && !TRADITIONAL_ONLY.test(text);
    default:
      return false;
  }
}

// ── 종합 ──

/** 공백을 한 칸으로 줄이고 앞뒤를 자른다 */
export function normalizeIntroText(text) {
  return typeof text === 'string' ? text.replace(/\s+/gu, ' ').trim() : '';
}

/** 글자 수 — 코드 포인트 기준(이모지·한자 한 글자 = 1) */
export function countChars(text) {
  return Array.from(text).length;
}

/** 요청에 있던 장소 이름을 문장에서 뺀다 — 긴 이름부터, 2자 이상만 */
function withoutTitles(text, titles) {
  const list = [...new Set((titles ?? []).filter((t) => typeof t === 'string' && Array.from(t).length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const title of list) out = out.split(title).join(' ');
  return out;
}

/**
 * AI 출력 검사. 통과하면 정리한 문장을 돌려준다.
 * @param {string} raw  AI 원문
 * @param {{lang: 'ko'|'en'|'ja'|'zh', titles?: string[]}} ctx  titles = 요청의 정거장 이름
 * @returns {{ok: true, text: string} | {ok: false, rule: string, category?: string}}
 */
export function checkIntroOutput(raw, { lang, titles = [] }) {
  const text = normalizeIntroText(raw);
  if (text === '') return { ok: false, rule: INTRO_CHECK.EMPTY };
  if (countChars(text) > AI_INTRO_MAX_CHARS) return { ok: false, rule: INTRO_CHECK.TOO_LONG };
  const rest = withoutTitles(text, titles);
  if (!scriptMatches(rest, lang)) return { ok: false, rule: INTRO_CHECK.WRONG_SCRIPT };
  const category = findBanned(rest, lang);
  if (category) return { ok: false, rule: INTRO_CHECK.BANNED, category };
  return { ok: true, text };
}
