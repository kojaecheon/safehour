// 채널 B: 병원 안내문 규칙과 확인 기록 (AX-311 · docs/business-rules.md '병원 연동', docs/contracts.md '`POST /api/plan/link`')
//
// 정의: `docs/PRODUCT_DEFINITION.md` §2·§4.3
//
// 안내문은 병원이 쓴 문장이다. **표시 전용**이다.
//   - 판정에 쓰지 않는다. 이 파일의 함수는 문장(`text`)을 읽지 않는다
//   - 번역·요약·편집하지 않는다
//   - 서버로 보내지 않는다
//
// 확인 기록의 정본은 기기의 `LinkedPlan.acknowledged` 다. 키는 `${id}@${updatedAt}` 이다.
// 같은 id 의 안내문이라도 내용이 바뀌어 `updatedAt` 이 달라지면 확인이 풀린다(docs/business-rules.md '병원 연동').
// 지침에 실려 온 `instructions[].acknowledged` 는 확인으로 치지 않는다.

import { parseInstantMs } from '../stay/time.js';

/** 채널 B 카드 분류 — 정의 §4.3 */
export const INSTRUCTION_CATEGORIES = Object.freeze([
  'activity',
  'medication',
  'food',
  'lifestyle',
  'escort',
  'emergency',
  'visit',
]);

/**
 * 확인하지 않으면 오늘을 STANDBY(`PLAN_UNCONFIRMED_UPDATE`)로 덧씌우는 **중요** 분류.
 * 나머지는 확인하지 않아도 외출을 막지 않는다 — 모든 변경을 막으면
 * "확인" 이 형식적 클릭이 되고, 정작 중요한 변경을 놓친다 (정의 §7 개선 2).
 */
export const CRITICAL_CATEGORIES = Object.freeze(['activity', 'escort', 'visit', 'emergency']);

/**
 * 안내문 목록의 형식 문제 (필드 경로 목록). 문장 내용은 검사하지 않는다 — 비어 있지 않은지만 본다.
 * @param {unknown} instructions
 * @returns {string[]}
 */
export function instructionErrors(instructions) {
  if (!Array.isArray(instructions)) return ['instructions'];
  const errors = [];
  const seen = new Set();
  instructions.forEach((item, i) => {
    const at = `instructions[${i}]`;
    if (!item || typeof item !== 'object') {
      errors.push(at);
      return;
    }
    if (typeof item.id !== 'string' || !item.id) errors.push(`${at}.id`);
    else if (seen.has(item.id)) errors.push(`${at}.id`); // 확인 기록 키가 섞인다
    else seen.add(item.id);
    if (!INSTRUCTION_CATEGORIES.includes(item.category)) errors.push(`${at}.category`);
    if (typeof item.text !== 'string' || !item.text.trim()) errors.push(`${at}.text`);
    if (typeof item.lang !== 'string' || !item.lang) errors.push(`${at}.lang`);
    if (parseInstantMs(item.updatedAt) === null) errors.push(`${at}.updatedAt`);
    if (item.acknowledged != null && typeof item.acknowledged !== 'boolean') errors.push(`${at}.acknowledged`);
  });
  return errors;
}

/**
 * 확인 기록 키, `${instructionId}@${updatedAt}` (LinkedPlan.acknowledged, docs/business-rules.md '병원 연동').
 * @param {{id: string, updatedAt: string}} instruction
 */
export function acknowledgementKey(instruction) {
  return `${instruction.id}@${instruction.updatedAt}`;
}

function isAcknowledged(instruction, acknowledged) {
  return acknowledged?.[acknowledgementKey(instruction)] === true;
}

/**
 * 확인하지 않은 안내 전체(중요 여부 무관).
 * @param {{instructions?: Array<object>}} plan
 * @param {Record<string, true>} [acknowledged]  `LinkedPlan.acknowledged`. 없으면 모두 미확인
 */
export function unconfirmedInstructions(plan, acknowledged = {}) {
  return (plan?.instructions ?? []).filter((item) => !isAcknowledged(item, acknowledged));
}

/**
 * 확인하지 않은 **중요** 안내. 하나라도 있으면 오늘을 STANDBY 로 덧씌운다
 * (`overlayTodayGate(day, { unconfirmedHospitalUpdate: true })`, docs/business-rules.md '매일 확인').
 * @param {{instructions?: Array<object>}} plan
 * @param {Record<string, true>} [acknowledged]  `LinkedPlan.acknowledged`. 없으면 모두 미확인
 */
export function unconfirmedCritical(plan, acknowledged = {}) {
  return unconfirmedInstructions(plan, acknowledged).filter((item) => CRITICAL_CATEGORIES.includes(item.category));
}

/**
 * 지침 사본에서 `instructions[].acknowledged` 를 뺀다 (LinkedPlan.plan, docs/business-rules.md '병원 연동').
 * 입력은 바꾸지 않고, 객체를 공유하지 않는 새 사본을 돌려준다.
 * @template T
 * @param {T} plan
 * @returns {T}
 */
export function stripAcknowledged(plan) {
  const copy = structuredClone(plan);
  if (Array.isArray(copy?.instructions)) {
    for (const item of copy.instructions) {
      if (item && typeof item === 'object') delete item.acknowledged;
    }
  }
  return copy;
}
