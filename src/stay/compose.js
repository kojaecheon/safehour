// 날짜별 조건 합성 (AX-302 · spec 4.5)
//
// 순서
//   1. 각 기간의 '모르겠음'을 4.4 기본값으로 바꾸고 '기본값 적용' 표시를 붙인다
//   2. 항목마다 가장 엄격한 값을 고른다 (모든 예/아니오 항목은 '예'가 제한)
//   3. 적용된 값마다 출처(기간 id, SELF/HOSPITAL, 기본값 여부)를 남긴다
//
// 합성은 항목별이다. 앱은 값을 해석하거나 완화하지 않는다.
// 검증을 거치지 않은 값이 들어와도 느슨한 쪽으로 읽지 않는다(모르면 엄격한 기본값).

import {
  ANSWER_KEYS,
  CONDITION_SOURCE,
  DIET_KEYS,
  ITEM_KEYS,
  NO_RESTRICTION_ITEMS,
  OUTING,
  RETURN_PLACE,
  YES_NO_KEYS,
  getItem,
  isResolvedAnswer,
  isResolvedReturnTime,
  normalizeConditionPeriod,
  withItem,
} from './conditions.js';
import { UNKNOWN_DEFAULTS } from './defaults.js';
import { toMinutes } from './time.js';

/**
 * @typedef {{periodId: string, source: 'SELF'|'HOSPITAL', defaulted: boolean}} Provenance
 * @typedef {Record<string, {value: any, provenance: Provenance[]}>} EffectiveConditions
 *   `DayPlan.effective` (spec 5.2). 키는 ITEM_KEYS(점 표기). 값은 ConditionItems 의 모양에서 UNKNOWN 을 뺀 것
 */

/**
 * @typedef {object} ConditionLimits  엔진이 읽는 평탄한 값 (합성 결과를 푼 것)
 * @property {'ALLOWED'|'INDOOR_ONLY'|'FORBIDDEN'} outing
 * @property {{time: string, place: 'LODGING'|'HOSPITAL', hospitalId?: string} | null} returnTime  null = NOT_SET
 * @property {number|null} walkLimitMin   외출 1회 누적, null = 제한 없음
 * @property {number|null} travelLimitMin 구간당, null = 제한 없음
 * @property {boolean} avoidUv
 * @property {boolean} avoidHeat
 * @property {boolean} avoidWater
 * @property {boolean} escortRequired
 * @property {boolean} guardianMustStay
 * @property {{mode: 'UNTIL', until: string} | {mode: 'ALL_DAY'} | null} mealRestriction
 * @property {{spicy: boolean, alcohol: boolean, hard: boolean, hot: boolean, raw: boolean}} diet
 * @property {Array<{time: string, atLodging: boolean}>} medication  시각 순. 없으면 []
 */

export const WARNING = Object.freeze({
  MEDICATION_TIMES_MISSING: 'MEDICATION_TIMES_MISSING',
  DEFAULTS_APPLIED: 'DEFAULTS_APPLIED',
  TRAVEL_TIMES_ESTIMATED: 'TRAVEL_TIMES_ESTIMATED',
});

const OUTING_RANK = { [OUTING.ALLOWED]: 0, [OUTING.INDOOR_ONLY]: 1, [OUTING.FORBIDDEN]: 2 };
const NONE = () => ({ kind: 'NONE' });

function unknownDefault(key) {
  if (key === 'walkLimit') return { kind: 'SET', value: UNKNOWN_DEFAULTS.walkLimitMin };
  if (key === 'travelLimit') return { kind: 'SET', value: UNKNOWN_DEFAULTS.travelLimitMin };
  if (key === 'mealRestriction') return { kind: 'SET', value: { ...UNKNOWN_DEFAULTS.mealRestriction } };
  // 복약 '모르겠음'은 마감을 만들지 않고 경고만 붙인다
  if (key === 'medication') return NONE();
  if (key.startsWith('diet.')) return { kind: 'SET', value: UNKNOWN_DEFAULTS.diet[key.slice(5)] };
  return { kind: 'SET', value: UNKNOWN_DEFAULTS[key] };
}

/** 답을 비교·출력용 표준 모양으로 다시 만든다 (입력 객체를 공유하지 않는다) */
function canonicalAnswer(key, answer) {
  if (answer.kind === 'NONE') return NONE();
  if (key === 'mealRestriction') {
    const v = answer.value;
    return { kind: 'SET', value: v.mode === 'ALL_DAY' ? { mode: 'ALL_DAY' } : { mode: 'UNTIL', until: v.until } };
  }
  if (key === 'medication') {
    return { kind: 'SET', value: answer.value.map((m) => ({ time: m.time, atLodging: m.atLodging })) };
  }
  return { kind: 'SET', value: answer.value };
}

function canonicalReturnTime(rt) {
  if (rt.kind === 'NOT_SET') return { kind: 'NOT_SET' };
  const out = { kind: 'SET', time: rt.time, place: rt.place };
  if (rt.place === RETURN_PLACE.HOSPITAL) out.hospitalId = rt.hospitalId;
  return out;
}

/**
 * '모르겠음'(또는 형식이 틀린 답)을 가장 엄격한 기본값으로 바꾼다 (spec 4.4 표, 합성 1단계).
 * outing·returnTime 은 다루지 않는다(모르겠음 불가 항목).
 * @param {import('./conditions.js').ConditionItems} items
 * @returns {{items: import('./conditions.js').ConditionItems, defaultedKeys: string[]}}
 */
export function applyUnknownDefaults(items) {
  let next = { ...(items ?? {}), diet: { ...(items?.diet ?? {}) } };
  const defaultedKeys = [];
  for (const key of ANSWER_KEYS) {
    const answer = getItem(items, key);
    if (isResolvedAnswer(key, answer)) {
      next = withItem(next, key, canonicalAnswer(key, answer));
    } else {
      next = withItem(next, key, unknownDefault(key));
      defaultedKeys.push(key);
    }
  }
  return { items: next, defaultedKeys };
}

/** a 가 b 보다 엄격하면 양수. 같은 값이면 0. 서로 다른 값은 0 이 되지 않는다(전순서) */
function compareStrictness(key, a, b) {
  if (key === 'outing') return OUTING_RANK[a] - OUTING_RANK[b];
  if (key === 'returnTime') {
    if (a.kind !== b.kind) return a.kind === 'SET' ? 1 : -1;
    if (a.kind === 'NOT_SET') return 0;
    const byTime = toMinutes(b.time) - toMinutes(a.time); // 이른 시각이 엄격
    if (byTime !== 0) return byTime;
    // 같은 시각에 장소가 다르면 사양이 우선순위를 정하지 않았다 — 결정적 순서로만 고른다
    if (a.place !== b.place) return a.place === RETURN_PLACE.LODGING ? 1 : -1;
    const ha = a.hospitalId ?? '';
    const hb = b.hospitalId ?? '';
    return ha === hb ? 0 : ha < hb ? 1 : -1;
  }
  if (a.kind !== b.kind) return a.kind === 'SET' ? 1 : -1;
  if (a.kind === 'NONE') return 0;
  if (key === 'walkLimit' || key === 'travelLimit') return b.value - a.value; // 작은 값이 엄격
  if (YES_NO_KEYS.includes(key)) return 0;
  if (key === 'mealRestriction') {
    const rank = (v) => (v.mode === 'ALL_DAY' ? Number.POSITIVE_INFINITY : toMinutes(v.until)); // 늦은 UNTIL 이 엄격
    const ra = rank(a.value);
    const rb = rank(b.value);
    return ra === rb ? 0 : ra > rb ? 1 : -1;
  }
  throw new TypeError(`비교할 수 없는 항목입니다: ${key}`);
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 기간 하나를 합성 입력으로 푼다: 정규화 → 모르겠음 치환 → outing·returnTime 확정 */
function resolvePeriod(period) {
  const normalized = normalizeConditionPeriod(period);
  const { items, defaultedKeys } = applyUnknownDefaults(normalized.items);
  const defaulted = new Set(defaultedKeys);
  const rawMedication = getItem(normalized.items, 'medication');

  // outing 이 없거나 모르겠음이면 가장 엄격한 FORBIDDEN 으로 본다
  let outing = items.outing;
  if (!Object.prototype.hasOwnProperty.call(OUTING_RANK, outing)) {
    outing = OUTING.FORBIDDEN;
    defaulted.add('outing');
  }

  let returnTime;
  if (isResolvedReturnTime(items.returnTime)) {
    returnTime = canonicalReturnTime(items.returnTime);
  } else if (outing === OUTING.FORBIDDEN) {
    // 외출 불가 기간에는 복귀 시각을 묻지 않는다
    returnTime = { kind: 'NOT_SET' };
  } else {
    throw new TypeError(
      `기간 ${String(period?.id)} 의 복귀 시각을 알 수 없어 합성할 수 없습니다 — validateConditionPeriod 를 먼저 통과해야 합니다`,
    );
  }

  return {
    periodId: normalized.id,
    source: normalized.source === CONDITION_SOURCE.HOSPITAL ? CONDITION_SOURCE.HOSPITAL : CONDITION_SOURCE.SELF,
    items: { ...items, outing, returnTime },
    defaulted,
    medicationUnknown: !isResolvedAnswer('medication', rawMedication),
  };
}

function provenanceOf(resolved, key) {
  return { periodId: resolved.periodId, source: resolved.source, defaulted: resolved.defaulted.has(key) };
}

function composeMedication(resolvedPeriods) {
  const byTime = new Map();
  const contributors = [];
  for (const r of resolvedPeriods) {
    const answer = r.items.medication;
    if (answer.kind === 'SET') {
      contributors.push(provenanceOf(r, 'medication'));
      for (const m of answer.value) byTime.set(m.time, byTime.get(m.time) === true || m.atLodging === true);
    } else if (r.medicationUnknown) {
      contributors.push(provenanceOf(r, 'medication'));
    }
  }
  if (byTime.size === 0) {
    return { value: NONE(), provenance: resolvedPeriods.map((r) => provenanceOf(r, 'medication')) };
  }
  const list = [...byTime.entries()]
    .sort(([a], [b]) => toMinutes(a) - toMinutes(b))
    .map(([time, atLodging]) => ({ time, atLodging }));
  return { value: { kind: 'SET', value: list }, provenance: contributors };
}

/**
 * 날짜 D에 **적용되는** 기간들을 합성한다 (적용 여부는 coverage.js 가 먼저 정한다).
 *
 * 엄격한 순서 (spec 4.5 표)
 * - outing: FORBIDDEN > INDOOR_ONLY > ALLOWED
 * - returnTime: 설정된 시각 중 가장 이른 것(그 시각의 장소 포함) > NOT_SET
 * - walkLimit·travelLimit: 작은 값 > 제한 없음
 * - 예/아니오: 예 > 아니오
 * - mealRestriction: ALL_DAY > 더 늦은 UNTIL > 더 이른 UNTIL > 없음
 * - medication: 모든 시각의 합집합. 같은 시각에 '숙소에서 복용'이 하나라도 예이면 예
 *
 * 출처는 이긴 값과 같은 값을 낸 기간 모두다(기간 id 순). 입력 순서와 무관하게 같은 결과를 낸다.
 *
 * @param {import('./conditions.js').ConditionPeriod[]} periods
 * @returns {{effective: EffectiveConditions, warnings: Array<'MEDICATION_TIMES_MISSING'|'DEFAULTS_APPLIED'>}}
 */
export function composeConditions(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return { effective: {}, warnings: [] };

  const resolved = periods
    .map(resolvePeriod)
    .sort((a, b) => (a.periodId === b.periodId ? 0 : String(a.periodId) < String(b.periodId) ? -1 : 1));

  const effective = {};
  for (const key of ITEM_KEYS) {
    if (key === 'medication') {
      effective.medication = composeMedication(resolved);
      continue;
    }
    let winner = getItem(resolved[0].items, key);
    for (const r of resolved.slice(1)) {
      const candidate = getItem(r.items, key);
      if (compareStrictness(key, candidate, winner) > 0) winner = candidate;
    }
    effective[key] = {
      value: structuredClone(winner),
      provenance: resolved.filter((r) => sameValue(getItem(r.items, key), winner)).map((r) => provenanceOf(r, key)),
    };
  }

  const warnings = [];
  if (resolved.some((r) => r.medicationUnknown)) warnings.push(WARNING.MEDICATION_TIMES_MISSING);
  const anyDefaulted = ITEM_KEYS.some((key) => effective[key].provenance.some((p) => p.defaulted));
  if (anyDefaulted) warnings.push(WARNING.DEFAULTS_APPLIED);

  return { effective, warnings };
}

function setOr(answer, fallback) {
  return answer.kind === 'SET' ? answer.value : fallback;
}

/**
 * 합성 결과(`effective`)를 엔진이 읽는 평탄한 값으로 푼다.
 * 항목이 하나라도 빠지면 조용히 '제한 없음'으로 읽지 않고 TypeError 를 낸다.
 * @param {EffectiveConditions} effective
 * @returns {ConditionLimits}
 */
export function flattenEffective(effective) {
  const missing = ITEM_KEYS.filter((key) => !effective?.[key] || effective[key].value === undefined);
  if (missing.length > 0) throw new TypeError(`합성 결과에 항목이 없습니다: ${missing.join(', ')}`);
  const v = (key) => effective[key].value;

  const rt = v('returnTime');
  const meal = v('mealRestriction');
  return {
    outing: v('outing'),
    returnTime:
      rt.kind === 'SET'
        ? { time: rt.time, place: rt.place, ...(rt.place === RETURN_PLACE.HOSPITAL ? { hospitalId: rt.hospitalId } : {}) }
        : null,
    walkLimitMin: setOr(v('walkLimit'), null),
    travelLimitMin: setOr(v('travelLimit'), null),
    avoidUv: v('avoidUv').kind === 'SET',
    avoidHeat: v('avoidHeat').kind === 'SET',
    avoidWater: v('avoidWater').kind === 'SET',
    escortRequired: v('escortRequired').kind === 'SET',
    guardianMustStay: v('guardianMustStay').kind === 'SET',
    mealRestriction: meal.kind === 'SET' ? { ...meal.value } : null,
    diet: Object.fromEntries(DIET_KEYS.map((d) => [d, v(`diet.${d}`).kind === 'SET'])),
    medication: v('medication').kind === 'SET' ? v('medication').value.map((m) => ({ ...m })) : [],
  };
}

/**
 * 모든 항목이 풀린 평탄한 값 — 적용 기간이 없는 `FREE` 날짜의 엔진 입력.
 * @type {Readonly<ConditionLimits>}
 */
export const NO_RESTRICTION_LIMITS = (() => {
  const effective = Object.fromEntries(
    ITEM_KEYS.map((key) => [key, { value: getItem(NO_RESTRICTION_ITEMS, key), provenance: [] }]),
  );
  const limits = flattenEffective(effective);
  Object.freeze(limits.diet);
  Object.freeze(limits.medication);
  return Object.freeze(limits);
})();
