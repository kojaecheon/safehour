// 하루 일정 엔진 (AX-306 · spec 4.7, 4.8 판정, 5.2 DayPlan)
//
// 하루치 입력으로 spec 5.2 `DayPlan` 을 만드는 **결정적** 함수다.
//   - 같은 입력이면 같은 결과다. 시계·난수를 읽지 않는다. 후보는 contentId 순으로 다룬다.
//   - 판정은 언어와 무관하다(규칙 27). 표시 언어 제목·주소는 Stop 표시 필드에만 쓴다.
//   - 판정 경로는 하나다: 후보 게이트는 safetyGate.gateCandidate, 복귀 계산은 slaCalculator.checkOutingSla.
//   - 날짜 분류·조건 합성·하루 틀은 체류 도메인 계층(src/stay, AX-302)의 결과를 그대로 쓴다.
//   - 의료 판단을 하지 않는다. 의료 시설은 정거장이 되지 않는다. 열려 있다고 단정하지 않는다.
//
// 외출 구성
//   1. 고정 블록(병원 일정·'숙소에서 복용' 복약)과 마감 후보로 외출 창을 나눈다(dayTimeline.js).
//      45분 미만 창에는 외출을 만들지 않는다.
//   2. 창 안의 식사 칸(점심·저녁, 식사가 가능할 때)이 외출의 기준점이다. 식사 칸이 둘인 창은
//      두 식사 칸 사이의 가운데 시각에서 나눠 외출 두 개를 만든다. 앞 외출은 그 시각까지 숙소로 돌아오도록
//      짠다(복귀 계산식 포함). 앞 외출의 returnBy(안전 마감)·마감 이유는 창의 실제 마감이고,
//      계획상 복귀는 plannedReturnAt 이다.
//      병원에서 끝나는 창은 마지막 외출이 그 병원에서 끝나며 마감에 맞춰 거꾸로 짠다. 그 앞부분은
//      숙소로 돌아오는 외출(식사 칸 포함)이고, 안전 마감은 '병원 마감 − 숙소→병원 − 도착 여유'다.
//   3. 식사 칸 외출은 식당 1곳을 식사 칸 시간에 두고 남은 자리를 앞뒤로 채운다. 식당이 없으면
//      식사 칸은 NONE_AVAILABLE 이고, 그 칸 시간은 다른 정거장으로 채우지 않는다(비운 칸 CLEARED 도 같다).
//   4. 정거장 수 한도(외출·하루)는 식사 정거장을 포함한다. 뒤에 올 식사 칸 몫을 먼저 남겨 둔다.
//   5. 보호자 외출은 환자가 숙소에 있는 구간(환자 외출·병원 블록·복약 블록 밖)에서만 만든다.

import { createFallbackEstimator, createTransitEstimator } from '../adapters/travelTime.js';
import { REASON, STATE } from '../domain/states.js';
import { classifyDate } from '../stay/coverage.js';
import { dayWindow, medicationBlocks } from '../stay/dayFrame.js';
import { DEFAULTS } from '../stay/defaults.js';
import { appointmentsOnDate, lodgingForDate, pointOf } from '../stay/stay.js';
import { fromMinutes, toMinutes } from '../stay/time.js';
import { appointmentEvents, freeIntervals, patientEvents, patientWindows } from './dayTimeline.js';
import { buildForwardOuting, buildMealOuting } from './outingBuilder.js';
import { gateCandidate } from './safetyGate.js';
import { checkOutingSla } from './slaCalculator.js';
import {
  distanceFromKm,
  guardianGateCondition,
  isRegularStopType,
  isRestaurant,
  patientGateCondition,
  stopCategory,
  toGateInput,
} from './stopCandidate.js';

const MEAL_SLOTS = Object.freeze(['LUNCH', 'DINNER']);
const MIN_WINDOW = DEFAULTS.minOutingWindowMin;
const MIN_STAY = DEFAULTS.minStopStayMin;
const WARNING_ORDER = Object.freeze(['MEDICATION_TIMES_MISSING', 'DEFAULTS_APPLIED', 'TRAVEL_TIMES_ESTIMATED']);
const LABEL_ORDER = Object.freeze(['ESTIMATED', 'HOURS_UNCONFIRMED', 'NEEDS_TRANSLATION', 'DIET_ESTIMATED', 'ORDER_CARD']);
const LEG_MODE = Object.freeze({ walk: 'WALK', car: 'TAXI', transit: 'TRANSIT' });
const FREE_COVERAGE = new Set(['FREE', 'DECLARED_FREE']);

/** 추정기를 감싸 같은 구간은 한 번만 계산한다(값은 올림한 분) */
function cachedEstimate(estimator) {
  const cache = new Map();
  return (from, to) => {
    const key = `${from.lat},${from.lng}>${to.lat},${to.lng}`;
    if (!cache.has(key)) {
      const r = estimator.estimate(from, to);
      if (!r || typeof r.min !== 'number' || !Number.isFinite(r.min)) {
        throw new TypeError('이동 추정기가 분 값을 돌려주지 않았습니다');
      }
      cache.set(key, { min: Math.ceil(r.min), mode: r.mode });
    }
    return cache.get(key);
  };
}

function compareIds(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}

function uniq(list) {
  return [...new Set(list)];
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 후보 → 엔진 내부 기록. 판정에 쓰는 값은 언어와 무관하다 */
function prepareCandidates(candidates, { date, closedContentIds, lodgingPoint, interests, pinned }) {
  const byId = new Map();
  for (const candidate of candidates ?? []) {
    const contentId = String(candidate?.stop?.contentId ?? candidate?.id ?? '');
    if (contentId && !byId.has(contentId)) byId.set(contentId, candidate);
  }
  return [...byId.keys()].sort(compareIds).map((contentId) => {
    const cand = byId.get(contentId);
    const tags = cand.signals?.interestTags ?? [];
    return {
      cand,
      contentId,
      point: { lat: Number(cand.lat), lng: Number(cand.lng) },
      distanceKm: distanceFromKm(lodgingPoint, cand),
      // 알 수 없는 보행 부담·체류는 관광 후보 모듈의 '유형 모름' 추정값(보행 30분·체류 45분)으로 본다
      walkMin: finite(cand.walkMin, 30),
      stayMin: finite(cand.stayMin, 45),
      hasFood: cand.hasFood === true || cand.signals?.isFoodPlace === true,
      category: stopCategory(cand),
      interest: interests.size > 0 && tags.some((tag) => interests.has(tag)),
      pinned: pinned.has(contentId),
      restaurant: isRestaurant(cand),
      regular: isRegularStopType(cand),
      gateInput: toGateInput(cand, { date, closedContentIds }),
    };
  });
}

/** 역할별 후보: 반경 → 게이트 → (다른 날짜 배치 제외, 고정은 예외) */
function rolePool(recs, { radiusKm, condition, weather, deleted, used }) {
  const inRadius = [];
  const outOfRadius = new Set();
  for (const rec of recs) {
    if (deleted.has(rec.contentId)) continue;
    if (rec.distanceKm !== null && rec.distanceKm > radiusKm) outOfRadius.add(rec.contentId);
    else inRadius.push(rec);
  }
  const gated = inRadius.map((rec) => {
    const gate = gateCandidate(rec.gateInput, condition, { weather });
    return { rec, pass: gate.pass, reasons: uniq(gate.reasons) };
  });
  const passed = gated.filter((g) => g.pass && (!used.has(g.rec.contentId) || g.rec.pinned)).map((g) => g.rec);
  return { gated, passed, outOfRadius };
}

/** 식사 칸의 도착 허용 범위. 식사 제한이 막으면 allowed=false */
function mealWindow(slot, mealRestriction) {
  const def = DEFAULTS.mealSlots[slot];
  const slotStart = toMinutes(def.start);
  const slotEnd = toMinutes(def.end);
  const latestMin = slotEnd - MIN_STAY;
  let startMin = slotStart;
  let allowed = true;
  if (mealRestriction?.mode === 'ALL_DAY') allowed = false;
  else if (mealRestriction?.mode === 'UNTIL') {
    const until = toMinutes(mealRestriction.until);
    if (until > latestMin) allowed = false;
    else startMin = Math.max(slotStart, until);
  }
  return { name: slot, slotStart, slotEnd, startMin, latestMin, allowed };
}

/** 창 시작에 출발해 가장 빨리 닿을 수 있는 시각 — 호출·대기 + 추정기 최소값(3분) */
const EARLIEST_ARRIVAL_OFFSET_MIN = DEFAULTS.buffers.hailingMin + 3;

/** 창 안에서 식사 칸 시간에 식당에 닿을 수 있는 식사 칸(식사 제한이 막지 않는 것) — 외출의 기준점 */
function windowAnchors(window, meals) {
  return meals.filter((m) => {
    if (!m.allowed) return false;
    const earliest = Math.max(m.startMin, window.startMin + EARLIEST_ARRIVAL_OFFSET_MIN);
    return earliest <= m.latestMin && earliest + MIN_STAY <= window.endMin;
  });
}

/**
 * 구간을 식사 칸 기준점으로 나눈다. 기준점이 둘이면 두 칸 사이 가운데 시각에서 나눈다.
 * 같은 식사 칸이 여러 창에 걸리면 채워질 때까지 뒤 창에서 다시 시도한다(엔진 본문). 한 칸에 식당은 하루 한 곳이다.
 * @returns {Array<{startMin: number, endMin: number, anchor: object|null}>}
 */
function splitByAnchors(region, anchors) {
  if (anchors.length <= 1) return [{ startMin: region.startMin, endMin: region.endMin, anchor: anchors[0] ?? null }];
  const subs = [];
  let start = region.startMin;
  anchors.forEach((anchor, i) => {
    const end =
      i === anchors.length - 1
        ? region.endMin
        : Math.min(region.endMin, Math.floor((anchor.slotEnd + anchors[i + 1].slotStart) / 2));
    subs.push({ startMin: start, endMin: end, anchor });
    start = end;
  });
  return subs;
}

function compactIds(ids) {
  return Object.fromEntries(Object.entries(ids ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

function stopLabels(rec, role, diet) {
  const labels = new Set(['HOURS_UNCONFIRMED']);
  if (rec.cand.walkEstimateConfidence !== 'verified') labels.add('ESTIMATED');
  if (rec.cand.needsTranslation === true) labels.add('NEEDS_TRANSLATION');
  if (role === 'P' && rec.cand.signals?.isFoodPlace === true && diet) {
    if (diet.spicy || diet.raw || diet.alcohol) labels.add('DIET_ESTIMATED');
    if (diet.hot || diet.hard) labels.add('ORDER_CARD');
  }
  return LABEL_ORDER.filter((label) => labels.has(label));
}

function toStop(item, { date, role, diet }) {
  const { rec } = item;
  const source = rec.cand.stop ?? {};
  const contentTypeIds = source.contentTypeIds ?? { canonical: rec.cand.sourceMetadata?.contentTypeId ?? null };
  const stop = {
    id: `${date}:${role}:${rec.contentId}`,
    candidateId: String(rec.cand.id ?? rec.contentId),
    contentId: rec.contentId,
    title: source.title ?? rec.cand.title ?? '',
    address: source.address ?? '',
    lang: source.lang ?? rec.cand.titleLanguage ?? 'ko',
    category: rec.category,
    isMeal: Boolean(item.meal),
    lat: rec.point.lat,
    lng: rec.point.lng,
    ko: source.ko ?? null,
    sourceIds: compactIds(source.sourceIds),
    contentTypeIds: { ...compactIds(contentTypeIds), canonical: contentTypeIds.canonical ?? null },
    arriveAt: fromMinutes(item.arriveMin),
    leaveAt: fromMinutes(item.leaveMin),
    stayMin: item.stayMin,
    shortened: item.stayMin < rec.stayMin,
    legIn: { min: item.leg.min, mode: LEG_MODE[item.leg.mode] ?? 'TAXI', estimated: true },
    walkBurdenMin: rec.walkMin,
    indoor: rec.cand.indoor ?? null,
    pinned: rec.pinned,
    labels: stopLabels(rec, role, diet),
  };
  if (source.image?.url) stop.image = { url: source.image.url, copyrightType: source.image.copyrightType ?? null };
  return stop;
}

/**
 * @typedef {object} Outing  spec 5.2 Outing + plannedReturnAt(추가 필드)
 * @property {string} id  `${date}:P|G:outing-N` — 역할별 출발 순 번호
 * @property {string} departAt  "HH:MM" 계획상 출발(호출 시작)
 * @property {string} returnBy  "HH:MM" **안전 마감**: 이 시각까지 returnPlace 에 닿아야 한다(복귀 계산식의 마감).
 *   한 창에 외출이 여럿이면 앞 외출도 창의 실제 마감을 그대로 가진다 — 계획상 복귀는 plannedReturnAt 이다
 * @property {'LODGING'|'HOSPITAL'} returnPlace
 * @property {'RETURN_TIME'|'MEDICATION'|'APPOINTMENT'|'DAY_END'|'DEPARTURE'|'PATIENT_SCHEDULE'} deadlineReason
 * @property {string} latestDepartureAt  "HH:MM" = returnBy − 복귀 계산식 필요 시간
 * @property {number} slackMin  returnBy 기준 복귀 여유(분, 0 이상)
 * @property {number} walkTotalMin  Σ정거장 보행 부담 + Σ도보 구간(복귀 포함)
 * @property {number} travelTotalMin  Σ모든 구간 이동 추정(복귀 포함)
 * @property {string} plannedReturnAt  "HH:MM" 계획상 복귀 도착(마지막 정거장 출발 + 복귀 구간). 버퍼는 넣지 않는다
 * @property {object[]} stops  Stop[]
 */

/** evaluateOuting 결과 → Outing. returnBy·slack 은 그 외출의 안전 마감 기준이다. id 는 호출부가 붙인다 */
function toOuting(ev, { id = null, role, date, deadlineMin, returnPlace, deadlineReason, recovery, extraBufferMin, diet }) {
  const sla = checkOutingSla({
    departMin: ev.departMin,
    deadlineMin,
    legsMin: [...ev.items.map((item) => item.leg.min), ev.back.min],
    staysMin: ev.items.map((item) => item.stayMin),
    recoveryBuffer: recovery,
    extraBufferMin,
  });
  return {
    id,
    departAt: fromMinutes(ev.departMin),
    returnBy: fromMinutes(deadlineMin),
    returnPlace,
    deadlineReason,
    latestDepartureAt: fromMinutes(sla.latestDepartMin),
    slackMin: sla.slackMin,
    walkTotalMin: ev.walkTotal,
    travelTotalMin: ev.travelTotalMin,
    plannedReturnAt: fromMinutes(ev.returnArriveMin),
    stops: ev.items.map((item) => toStop(item, { date, role, diet })),
  };
}

function mealSlotEntry(slot, { cleared, patientAllowed, meals, attempts }) {
  if (cleared.has(slot)) return { slot, status: 'CLEARED', reasons: [] };
  if (!patientAllowed) return { slot, status: 'NOT_APPLICABLE', reasons: [] };
  const meal = meals.find((m) => m.name === slot);
  if (!meal.allowed) return { slot, status: 'NOT_APPLICABLE', reasons: [REASON.FASTING_REQUIRED] };
  const attempt = attempts.get(slot);
  if (!attempt) return { slot, status: 'NOT_APPLICABLE', reasons: [] };
  if (attempt.stopId) return { slot, status: 'FILLED', stopId: attempt.stopId, reasons: [] };
  return { slot, status: 'NONE_AVAILABLE', reasons: attempt.reasons };
}

/**
 * 하루 일정을 만든다 (spec 4.7, 5.2).
 *
 * @param {object} input
 * @param {string} input.date  "YYYY-MM-DD"
 * @param {import('../stay/coverage.js').DateClassification} input.classification  classifyDate 결과
 * @param {{window: {start,end}|null, startMin: number|null, endMin: number|null,
 *          endReason: 'DAY_END'|'DEPARTURE'|null, reasons: string[]}} input.frame  dayWindow 결과
 * @param {object|null} input.lodging  그날 숙소(LodgingSegment 또는 {id, lat, lng})
 * @param {Array} [input.hospitals]      {id, lat, lng} 또는 Hospital
 * @param {Array} [input.appointments]   그날 병원 일정 (appointmentsOnDate)
 * @param {boolean} [input.hasCompanion]
 * @param {string[]} [input.interests]
 * @param {'RELAXED'|'NORMAL'} [input.pace]  모르는 값은 RELAXED
 * @param {{outdoorUnsafe: boolean|null}|null} [input.weather]  그날 기상. 모르면 null(판정에 반영하지 않음)
 * @param {{pinned?: string[], deleted?: string[], clearedMeals?: Array<'LUNCH'|'DINNER'>}} [input.edits]
 * @param {string[]} [input.usedContentIds]  다른 날짜에 이미 배치된 contentId (고정한 장소는 예외)
 * @param {object[]} [input.candidates]      관광 후보 모듈의 정규화 후보
 * @param {string[]} [input.closedContentIds] 닫힘으로 볼 contentId (데모 CLOSURE 사건)
 * @param {number} [input.extraBufferMin]    모든 외출 복귀 계산에 더할 버퍼 (데모 TRAFFIC_SURGE)
 * @param {{TAXI?: object, TRANSIT?: object}} [input.estimators]  동기 추정기 주입(기본: 폴백·대중교통 추정기)
 * @returns {object} spec 5.2 DayPlan (delta·intro 없음, returnNow=false)
 */
export function planDay(input) {
  const {
    date,
    classification,
    frame,
    lodging = null,
    hospitals = [],
    appointments = [],
    hasCompanion = false,
    interests = [],
    pace = 'RELAXED',
    weather = null,
    edits = {},
    usedContentIds = [],
    candidates = [],
    closedContentIds = [],
    extraBufferMin = 0,
    estimators = {},
  } = input;

  const coverage = classification.coverage;
  const limits = classification.limits ?? null;
  const transportMode = classification.transportMode === 'TRANSIT' ? 'TRANSIT' : 'TAXI';
  const taxiEstimate = cachedEstimate(estimators.TAXI ?? createFallbackEstimator());
  const dayEstimate =
    transportMode === 'TRANSIT' ? cachedEstimate(estimators.TRANSIT ?? createTransitEstimator()) : taxiEstimate;

  const pinned = new Set((edits.pinned ?? []).map(String));
  const deleted = new Set((edits.deleted ?? []).map(String));
  const cleared = new Set(edits.clearedMeals ?? []);
  const used = new Set((usedContentIds ?? []).map(String));
  const limitsPace = DEFAULTS.stopsPerPace[pace] ?? DEFAULTS.stopsPerPace.RELAXED;
  const lodgingPoint = lodging ? pointOf(lodging) : null;
  const freeDay = FREE_COVERAGE.has(coverage);
  const recovery = classification.recoveryBuffer === true;

  const reasons = [...(classification.reasons ?? []), ...(frame?.reasons ?? [])];
  const warnings = new Set(classification.warnings ?? []);

  const apptEvents = lodgingPoint
    ? appointmentEvents(appointments, { lodgingPoint, hospitals, estimate: dayEstimate })
    : [];
  const chained = new Set();

  const dayOpen = coverage !== 'NEEDS_INPUT' && Boolean(frame?.window) && Boolean(lodgingPoint) && Boolean(limits);
  const patientAllowed =
    dayOpen && classification.patientOutingAllowed === true && !(limits.escortRequired && hasCompanion !== true);
  const guardianAllowed = dayOpen && classification.guardianSoloAllowed === true && hasCompanion === true;

  const meals = MEAL_SLOTS.map((slot) => mealWindow(slot, limits?.mealRestriction ?? null));
  const attempts = new Map();
  const outings = [];
  const guardianOutings = [];
  const failures = new Map();
  let patientPool = null;
  let guardianPool = null;
  let patientViable = [];
  let guardianViable = [];
  let recs = [];

  if (dayOpen) {
    recs = prepareCandidates(candidates, {
      date,
      closedContentIds: new Set((closedContentIds ?? []).map(String)),
      lodgingPoint,
      interests: new Set(interests ?? []),
      pinned,
    });
  }

  // ── 환자 외출 ──
  if (patientAllowed) {
    const radiusKm = (freeDay ? DEFAULTS.searchRadiusM.free : DEFAULTS.searchRadiusM.restricted) / 1000;
    patientPool = rolePool(recs, { radiusKm, condition: patientGateCondition(limits), weather, deleted, used });
    const regularPool = patientPool.passed.filter((r) => r.regular);
    const mealPool = patientPool.passed.filter((r) => r.restaurant);
    const restaurantGateReasons = patientPool.gated.filter((g) => g.rec.restaurant && !g.pass).flatMap((g) => g.reasons);

    const ctx = {
      lodgingPoint,
      estimate: dayEstimate,
      recovery,
      extraBufferMin,
      walkLimitMin: limits.walkLimitMin ?? null,
      travelLimitMin: limits.travelLimitMin ?? null,
      fastingUntilMin: limits.mealRestriction?.mode === 'UNTIL' ? toMinutes(limits.mealRestriction.until) : null,
    };

    const windows = patientWindows(
      patientEvents({ limits, frame, appointmentEvts: apptEvents, lodging, hospitals }),
      frame.startMin,
    );
    if (windows.some((w) => w.event.kind === 'MEDICATION')) reasons.push(REASON.MEDICATION_WINDOW);
    patientViable = windows.filter((w) => w.endMin - w.startMin >= MIN_WINDOW);
    if (patientViable.length === 0) reasons.push(REASON.DEPARTURE_WINDOW_TOO_SHORT);

    const filled = (name) => Boolean(attempts.get(name)?.stopId);
    let budget = limitsPace.perDay;
    const usedToday = new Set();
    const usedCategories = new Set();

    /**
     * 외출 하나를 짠다.
     * @param {object} unit  { startMin, slaDeadlineMin, anchor, returnPoint, returnPlace, reportDeadlineMin,
     *                         deadlineReason, align: 'EARLY'|'LATE', appointmentId? }
     * @param {Array<string|undefined>} pending  이 외출 뒤에 시도할 식사 칸 — 하루 한도에서 그 몫을 먼저 남긴다
     * @returns {number|null} 만든 외출의 출발(분). 만들지 못하면 null
     */
    const planUnit = (unit, pending) => {
      if (budget <= 0 || unit.slaDeadlineMin - unit.startMin < MIN_WINDOW) return null;
      const reserved = (except = null) =>
        new Set(pending.filter((name) => name && name !== except && !cleared.has(name) && !filled(name))).size;
      // 이미 채운 식사 칸은 이 외출의 기준점이 아니다
      const openAnchor = unit.anchor && !filled(unit.anchor.name) ? unit.anchor : null;
      const common = {
        slaDeadlineMin: unit.slaDeadlineMin,
        returnPoint: unit.returnPoint,
        align: unit.align,
        usedToday,
        rank: { usedCategories },
        failures,
      };
      let ev = null;

      if (openAnchor && !cleared.has(openAnchor.name)) {
        const allowance = Math.max(0, Math.min(limitsPace.perOuting - 1, budget - 1 - reserved(openAnchor.name)));
        const built = buildMealOuting(ctx, {
          ...common,
          startMin: unit.startMin,
          meal: openAnchor,
          allowance,
          mealPool,
          pool: regularPool,
        });
        ev = built.ev;
        if (!ev) {
          // 앞에서 실패한 사유와 합친다 — 뒤 외출에서 채우면 FILLED 로 바뀐다
          const r = uniq([
            ...(attempts.get(openAnchor.name)?.reasons ?? []),
            ...restaurantGateReasons,
            ...built.mealFailures.values(),
          ])
            .filter((reason) => reason !== REASON.NO_CANDIDATE)
            .sort();
          attempts.set(openAnchor.name, { stopId: null, reasons: r.length > 0 ? r : [REASON.NO_CANDIDATE] });
        }
      }

      if (!ev) {
        const allowance = Math.min(limitsPace.perOuting, budget - reserved());
        if (allowance > 0) {
          if (openAnchor) {
            // 비었거나 비운 식사 칸 시간은 다른 정거장으로 채우지 않는다 — 칸 앞이나 칸 뒤에만 둔다
            const beforeSlot = () =>
              openAnchor.slotStart - unit.startMin >= MIN_WINDOW
                ? buildForwardOuting(ctx, {
                    ...common,
                    startMin: unit.startMin,
                    mustLeaveByMin: openAnchor.slotStart,
                    allowance,
                    pool: regularPool,
                  })
                : null;
            const afterStart = Math.max(unit.startMin, openAnchor.slotEnd);
            const afterSlot = () =>
              unit.slaDeadlineMin - afterStart >= MIN_WINDOW
                ? buildForwardOuting(ctx, { ...common, startMin: afterStart, allowance, pool: regularPool })
                : null;
            ev = unit.align === 'LATE' ? afterSlot() ?? beforeSlot() : beforeSlot() ?? afterSlot();
          } else {
            ev = buildForwardOuting(ctx, { ...common, startMin: unit.startMin, allowance, pool: regularPool });
          }
        }
      }

      if (!ev) return null;
      const outing = toOuting(ev, {
        role: 'P',
        date,
        deadlineMin: unit.reportDeadlineMin,
        returnPlace: unit.returnPlace,
        deadlineReason: unit.deadlineReason,
        recovery,
        extraBufferMin,
        diet: limits.diet,
      });
      outing._departMin = ev.departMin;
      // 환자가 숙소를 비우는 구간 — 병원에서 끝나는 외출은 그 마감(병원 일정 시작·병원 복귀 시각)까지 숙소에 없다
      outing._awayUntilMin = unit.returnPlace === 'HOSPITAL' ? unit.slaDeadlineMin : ev.returnArriveMin;
      outings.push(outing);
      budget -= outing.stops.length;
      for (const item of ev.items) {
        usedToday.add(item.rec.contentId);
        usedCategories.add(item.rec.category);
      }
      const mealStop = outing.stops.find((s) => s.isMeal);
      if (mealStop && openAnchor) attempts.set(openAnchor.name, { stopId: mealStop.id, reasons: [] });
      if (unit.appointmentId) chained.add(unit.appointmentId);
      return ev.departMin;
    };

    const lodgingUnits = (region, anchors, { reportDeadlineMin, deadlineReason }) =>
      splitByAnchors(region, anchors).map((sub) => ({
        startMin: sub.startMin,
        slaDeadlineMin: sub.endMin,
        anchor: sub.anchor,
        returnPoint: lodgingPoint,
        returnPlace: 'LODGING',
        reportDeadlineMin,
        deadlineReason,
        align: 'EARLY',
      }));
    const planInOrder = (units, later) =>
      units.forEach((unit, i) => planUnit(unit, [...units.slice(i + 1).map((u) => u.anchor?.name), ...later]));
    const names = (anchors) => anchors.map((a) => a.name);

    /**
     * 병원에서 끝나는 창(다음 병원 일정·병원 복귀 시각). spec 4.3·규칙 13-2.
     * - 마지막 외출이 그 병원에서 끝난다. 마감에 맞춰 거꾸로 짠다(LATE) — 병원에 일찍 닿아 기다리지 않게.
     *   그 앞 식사 칸이 마감에 붙어 있으면(칸 끝 뒤 45분 미만) 마지막 외출이 그 식사를 맡는다.
     * - 앞부분은 다른 창과 같이 숙소로 돌아오는 외출(식사 칸 포함)이다. 계획상 마지막 외출 출발 전까지 돌아오고,
     *   안전 마감(returnBy)은 '병원 마감 − 숙소→병원 이동 − 도착 여유'다(마감 이유는 창과 같다).
     */
    const planHospitalWindow = (window, anchors, later) => {
      const { event } = window;
      const deadline = window.endMin;
      const lodgingDeadline =
        deadline - dayEstimate(lodgingPoint, event.point).min - DEFAULTS.buffers.arrivalMarginMin;
      const last = anchors.at(-1) ?? null;
      const finalMeal = last && deadline - last.slotEnd < MIN_WINDOW ? last : null;
      const earlier = finalMeal ? anchors.slice(0, -1) : anchors;
      let finalStart = window.startMin;
      if (finalMeal && earlier.length > 0) {
        finalStart = Math.max(window.startMin, Math.floor((earlier.at(-1).slotEnd + finalMeal.slotStart) / 2));
      } else if (!finalMeal && last) {
        finalStart = Math.max(window.startMin, last.slotEnd);
      }
      const finalDepart = planUnit(
        {
          startMin: finalStart,
          slaDeadlineMin: deadline,
          anchor: finalMeal,
          returnPoint: event.point,
          returnPlace: 'HOSPITAL',
          reportDeadlineMin: deadline,
          deadlineReason: event.kind,
          align: 'LATE',
          appointmentId: event.appointmentId ?? null,
        },
        [...names(earlier), ...later],
      );

      const regionEnd = Math.min(lodgingDeadline, finalDepart ?? lodgingDeadline);
      const region = { startMin: window.startMin, endMin: regionEnd };
      // 마지막 외출이 맡았다가 채우지 못한 식사 칸도 앞부분에서 다시 시도한다(칸 시간 보호 포함)
      const retry = new Set([...names(earlier), ...(finalMeal && !filled(finalMeal.name) ? [finalMeal.name] : [])]);
      const regionAnchors = windowAnchors(region, meals.filter((m) => retry.has(m.name)));
      planInOrder(lodgingUnits(region, regionAnchors, { reportDeadlineMin: lodgingDeadline, deadlineReason: event.kind }), later);
    };

    const anchorsByWindow = patientViable.map((w) => windowAnchors(w, meals));
    patientViable.forEach((window, index) => {
      const later = anchorsByWindow.slice(index + 1).flatMap(names);
      if (window.event.place === 'HOSPITAL') {
        planHospitalWindow(window, anchorsByWindow[index], later);
      } else {
        planInOrder(
          lodgingUnits(window, anchorsByWindow[index], { reportDeadlineMin: window.endMin, deadlineReason: window.event.kind }),
          later,
        );
      }
    });

    // 병원 창은 마지막 외출을 먼저 짜므로 출발 순으로 정렬한 뒤 번호를 매긴다
    outings.sort((a, b) => a._departMin - b._departMin);
    outings.forEach((o, i) => {
      o.id = `${date}:P:outing-${i + 1}`;
    });
  }

  // ── 병원·복약 블록 (직전 외출이 병원에서 끝났으면 병원 블록은 일정 시작부터) ──
  const blocks = [
    ...apptEvents.map((e) => ({
      kind: 'APPOINTMENT',
      startMin: chained.has(e.appointmentId) ? e.chainedStartMin : e.standaloneStartMin,
      endMin: e.blockEndMin,
      appointmentId: e.appointmentId,
    })),
    ...(limits ? medicationBlocks(limits.medication) : []).map((b) => ({
      kind: 'MEDICATION',
      startMin: toMinutes(b.start),
      endMin: toMinutes(b.start) + DEFAULTS.medicationGapMin,
    })),
  ].sort((a, b) => a.startMin - b.startMin || compareIds(a.kind, b.kind));

  // ── 보호자 외출: 환자가 숙소에 있는 구간에서만 ──
  if (guardianAllowed) {
    guardianPool = rolePool(recs, {
      radiusKm: DEFAULTS.searchRadiusM.guardian / 1000,
      condition: guardianGateCondition(),
      weather,
      deleted,
      used,
    });
    const pool = guardianPool.passed.filter((r) => r.regular);
    const busy = [
      ...blocks.map((b) => [b.startMin, b.endMin]),
      ...outings.map((o) => [o._departMin, o._awayUntilMin]),
    ];
    if (limits.returnTime?.place === 'HOSPITAL') busy.push([toMinutes(limits.returnTime.time), frame.endMin]);
    guardianViable = freeIntervals([frame.startMin, frame.endMin], busy).filter(([s, e]) => e - s >= MIN_WINDOW);

    const ctx = {
      lodgingPoint,
      estimate: taxiEstimate,
      recovery: false,
      extraBufferMin,
      walkLimitMin: null,
      travelLimitMin: null,
      fastingUntilMin: null,
    };
    let budget = limitsPace.perDay;
    // 보호자는 같은 날 환자가 가는 곳과 다른 곳으로 간다(환자 배치가 먼저다)
    const usedToday = new Set(outings.flatMap((o) => o.stops.map((stop) => stop.contentId)));
    const usedCategories = new Set();
    for (const [startMin, endMin] of guardianViable) {
      if (budget <= 0) break;
      const ev = buildForwardOuting(ctx, {
        startMin,
        slaDeadlineMin: endMin,
        returnPoint: lodgingPoint,
        allowance: Math.min(limitsPace.perOuting, budget),
        pool,
        usedToday,
        rank: { usedCategories },
        failures,
      });
      if (!ev) continue;
      const outing = toOuting(ev, {
        id: `${date}:G:outing-${guardianOutings.length + 1}`,
        role: 'G',
        date,
        deadlineMin: endMin,
        returnPlace: 'LODGING',
        deadlineReason: endMin === frame.endMin ? frame.endReason : 'PATIENT_SCHEDULE',
        recovery: false,
        extraBufferMin,
        diet: null,
      });
      guardianOutings.push(outing);
      budget -= outing.stops.length;
      for (const item of ev.items) {
        usedToday.add(item.rec.contentId);
        usedCategories.add(item.rec.category);
      }
    }
  }

  // ── 날짜 상태와 사유 (spec 4.7 표) ──
  let dayState = STATE.NO_TOURISM;
  if (outings.length > 0) dayState = STATE.TOGETHER;
  else if (guardianOutings.length > 0) dayState = STATE.SPLIT_NEARBY;
  else if ((patientAllowed && patientViable.length > 0) || (guardianAllowed && guardianViable.length > 0)) {
    dayState = STATE.STANDBY;
    reasons.push(REASON.NO_CANDIDATE);
  }
  // 동행 필수라서 보호자 단독 외출이 잠긴 쉬는 날 — 잠금 이유를 남긴다
  if (coverage === 'REST_DAY' && hasCompanion === true && limits?.escortRequired === true && !classification.blocked) {
    reasons.push(REASON.ESCORT_REQUIRED);
  }

  // ── 제외 목록: 주 역할(환자, 없으면 보호자)의 게이트 결과 + 넣지 못한 고정 장소 ──
  const primary = patientPool ?? guardianPool;
  const excluded = new Map();
  if (primary) {
    for (const g of primary.gated) {
      if (!g.pass) excluded.set(g.rec.contentId, { candidateId: String(g.rec.cand.id ?? g.rec.contentId), title: g.rec.cand.title ?? '', reasons: g.reasons });
    }
    const placed = new Set([...outings, ...guardianOutings].flatMap((o) => o.stops.map((s) => s.contentId)));
    for (const rec of recs) {
      if (!rec.pinned || deleted.has(rec.contentId) || placed.has(rec.contentId) || excluded.has(rec.contentId)) continue;
      const reason = primary.outOfRadius.has(rec.contentId)
        ? REASON.TRAVEL_LIMIT_EXCEEDED
        : failures.get(rec.contentId) ?? REASON.SLA_INSUFFICIENT;
      excluded.set(rec.contentId, { candidateId: String(rec.cand.id ?? rec.contentId), title: rec.cand.title ?? '', reasons: [reason] });
    }
  }

  if (apptEvents.length > 0 || outings.length > 0 || guardianOutings.length > 0) warnings.add('TRAVEL_TIMES_ESTIMATED');

  for (const o of outings) {
    delete o._awayUntilMin;
    delete o._departMin;
  }

  return {
    date,
    coverage,
    dayState,
    reasons: uniq(reasons),
    window: frame?.window ? { ...frame.window } : null,
    lodgingId: classification.lodgingId ?? lodging?.id ?? null,
    transportMode,
    effective: structuredClone(classification.effective ?? {}),
    blocks: blocks.map((b) => ({
      kind: b.kind,
      start: fromMinutes(b.startMin),
      end: fromMinutes(b.endMin),
      ...(b.appointmentId ? { appointmentId: b.appointmentId } : {}),
    })),
    outings,
    guardianOutings,
    mealSlots: MEAL_SLOTS.map((slot) => mealSlotEntry(slot, { cleared, patientAllowed, meals, attempts })),
    excluded: [...excluded.keys()].sort(compareIds).map((id) => excluded.get(id)),
    warnings: WARNING_ORDER.filter((w) => warnings.has(w)),
    returnNow: false,
  };
}

/**
 * 체류 모델에서 날짜 하나의 일정을 만든다 — 분류(classifyDate)·하루 틀(dayWindow)·숙소·그날 병원 일정을
 * 체류 도메인 계층으로 구해 planDay 에 넘긴다.
 *
 * @param {import('../stay/stay.js').Stay} stay  Stay 또는 PlanStay
 * @param {string} date  체류 날짜 (아니면 classifyDate 가 RangeError)
 * @param {object} [opts]  planDay 입력 중 체류에서 오지 않는 것
 * @param {{airportToLodgingMin?: number, lodgingToAirportMin?: number}} [opts.airportTravel]
 *   입국일이면 airportToLodgingMin, 출국일이면 lodgingToAirportMin 이 반드시 있어야 한다(dayWindow)
 */
export function planStayDay(stay, date, { airportTravel = {}, ...opts } = {}) {
  const classification = classifyDate(stay, date);
  return planDay({
    ...opts,
    date,
    classification,
    frame: dayWindow(stay, date, airportTravel),
    lodging: lodgingForDate(stay, date),
    hospitals: stay.hospitals ?? [],
    appointments: appointmentsOnDate(stay, date),
    hasCompanion: stay.hasCompanion === true,
    interests: stay.interests ?? [],
    pace: stay.pace,
  });
}
