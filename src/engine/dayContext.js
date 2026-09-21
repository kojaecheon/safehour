// 하루 판정 맥락 (AX-307 · spec 4.7, 4.9, 4.10)
//
// 재계획(외출 중 외출 고치기)과 교체 후보는 planDay 와 **같은 재료**로 판정해야 한다.
// 이 모듈은 planDay 가 안에서 만드는 것(분류·하루 틀·후보 기록·역할별 게이트 결과·외출 창·검증 맥락)을
// 같은 함수로 다시 만든다. 판정 경로를 새로 만들지 않는다:
//   - 후보 게이트: dayPlan.rolePool → safetyGate.gateCandidate
//   - 외출 검증: outingBuilder.evaluateOuting → slaCalculator.checkOutingSla
//   - 순위: outingBuilder.selectBest
//   - 창·마감: dayTimeline (appointmentEvents · patientEvents · patientWindows · freeIntervals)

import { createFallbackEstimator, createTransitEstimator } from '../adapters/travelTime.js';
import { classifyDate } from '../stay/coverage.js';
import { dayWindow, medicationBlocks } from '../stay/dayFrame.js';
import { DEFAULTS } from '../stay/defaults.js';
import { appointmentsOnDate, lodgingForDate, pointOf } from '../stay/stay.js';
import { REASON } from '../domain/states.js';
import { fromMinutes, toMinutes } from '../stay/time.js';
import { cachedEstimate, mealWindow, prepareCandidates, rolePool, toOuting } from './dayPlan.js';
import { appointmentEvents, freeIntervals, patientEvents, patientWindows } from './dayTimeline.js';
import { selectBest } from './outingBuilder.js';
import { guardianGateCondition, patientGateCondition } from './stopCandidate.js';

export const MEAL_SLOT_NAMES = Object.freeze(['LUNCH', 'DINNER']);
const FREE_COVERAGE = new Set(['FREE', 'DECLARED_FREE']);
const LEG_MODE_BACK = Object.freeze({ WALK: 'walk', TAXI: 'car', TRANSIT: 'transit' });

function compareIds(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * 후보 제공자에서 그날 숙소의 후보를 꺼낸다.
 * @param {Record<string, object[]> | ((lodgingId: string, date: string) => object[]) | object[] | undefined} provider
 */
export function candidatesFrom(provider, lodgingId, date) {
  if (Array.isArray(provider)) return provider;
  if (!lodgingId) return [];
  if (typeof provider === 'function') return provider(lodgingId, date) ?? [];
  return provider?.[lodgingId] ?? [];
}

/**
 * planDay 와 같은 입력으로 하루 판정 맥락을 만든다.
 *
 * @param {object} p
 * @param {object} p.stay           Stay 또는 PlanStay (오늘 APPOINTMENT 사건이면 옮긴 사본)
 * @param {string} p.date
 * @param {object} [p.airportTravel]
 * @param {object[]} [p.candidates]
 * @param {{outdoorUnsafe: boolean|null}|null} [p.weather]
 * @param {{pinned?: string[], deleted?: string[], clearedMeals?: string[]}} [p.edits]  그 날짜 편집
 * @param {string[]} [p.usedContentIds]  다른 날짜 배치(고정은 예외)
 * @param {string[]} [p.closedContentIds]
 * @param {number} [p.extraBufferMin]
 * @param {{TAXI?: object, TRANSIT?: object}} [p.estimators]
 */
export function buildDayContext({
  stay,
  date,
  airportTravel = {},
  candidates = [],
  weather = null,
  edits = {},
  usedContentIds = [],
  closedContentIds = [],
  extraBufferMin = 0,
  estimators = {},
}) {
  const classification = classifyDate(stay, date);
  const frame = dayWindow(stay, date, airportTravel);
  const lodging = lodgingForDate(stay, date);
  const hospitals = stay.hospitals ?? [];
  const appointments = appointmentsOnDate(stay, date);
  const hasCompanion = stay.hasCompanion === true;
  const coverage = classification.coverage;
  const limits = classification.limits ?? null;
  const transportMode = classification.transportMode === 'TRANSIT' ? 'TRANSIT' : 'TAXI';
  const taxiEstimate = cachedEstimate(estimators.TAXI ?? createFallbackEstimator());
  const dayEstimate =
    transportMode === 'TRANSIT' ? cachedEstimate(estimators.TRANSIT ?? createTransitEstimator()) : taxiEstimate;
  const lodgingPoint = lodging ? pointOf(lodging) : null;
  const pinned = new Set((edits?.pinned ?? []).map(String));
  const deleted = new Set((edits?.deleted ?? []).map(String));
  const used = new Set((usedContentIds ?? []).map(String));
  const recovery = classification.recoveryBuffer === true;

  const dayOpen = coverage !== 'NEEDS_INPUT' && Boolean(frame?.window) && Boolean(lodgingPoint) && Boolean(limits);
  const patientAllowed =
    dayOpen && classification.patientOutingAllowed === true && !(limits.escortRequired && !hasCompanion);
  const guardianAllowed = dayOpen && classification.guardianSoloAllowed === true && hasCompanion;

  const recs = dayOpen
    ? prepareCandidates(candidates, {
        date,
        closedContentIds: new Set((closedContentIds ?? []).map(String)),
        lodgingPoint,
        interests: new Set(stay.interests ?? []),
        pinned,
      })
    : [];
  const radiusKm = (FREE_COVERAGE.has(coverage) ? DEFAULTS.searchRadiusM.free : DEFAULTS.searchRadiusM.restricted) / 1000;
  const pools = {
    P: patientAllowed
      ? rolePool(recs, { radiusKm, condition: patientGateCondition(limits), weather, deleted, used })
      : null,
    G: guardianAllowed
      ? rolePool(recs, {
          radiusKm: DEFAULTS.searchRadiusM.guardian / 1000,
          condition: guardianGateCondition(),
          weather,
          deleted,
          used,
        })
      : null,
  };
  const ctx = {
    P: {
      lodgingPoint,
      estimate: dayEstimate,
      recovery,
      extraBufferMin,
      walkLimitMin: limits?.walkLimitMin ?? null,
      travelLimitMin: limits?.travelLimitMin ?? null,
      fastingUntilMin: limits?.mealRestriction?.mode === 'UNTIL' ? toMinutes(limits.mealRestriction.until) : null,
    },
    G: {
      lodgingPoint,
      estimate: taxiEstimate,
      recovery: false,
      extraBufferMin,
      walkLimitMin: null,
      travelLimitMin: null,
      fastingUntilMin: null,
    },
  };
  const meals = Object.fromEntries(MEAL_SLOT_NAMES.map((slot) => [slot, mealWindow(slot, limits?.mealRestriction ?? null)]));
  const apptEvents = lodgingPoint ? appointmentEvents(appointments, { lodgingPoint, hospitals, estimate: dayEstimate }) : [];
  const windows = patientAllowed
    ? patientWindows(patientEvents({ limits, frame, appointmentEvts: apptEvents, lodging, hospitals }), frame.startMin)
    : [];

  return {
    date,
    stay,
    appointments,
    hospitals,
    paceLimits: DEFAULTS.stopsPerPace[stay.pace] ?? DEFAULTS.stopsPerPace.RELAXED,
    edits: { pinned, deleted, cleared: new Set(edits?.clearedMeals ?? []) },
    classification,
    frame,
    lodging,
    lodgingPoint,
    limits,
    recovery,
    extraBufferMin,
    dayEstimate,
    recs,
    recById: new Map(recs.map((r) => [r.contentId, r])),
    pools,
    ctx,
    meals,
    apptEvents,
    windows,
    patientAllowed,
    guardianAllowed,
  };
}

/** 역할·종류(식사 칸 식당 / 일반 정거장)별로 게이트를 통과한 후보 */
export function kindPool(context, role, isMeal) {
  const pool = context.pools[role];
  if (!pool) return [];
  if (isMeal) return role === 'P' ? pool.passed.filter((r) => r.restaurant) : [];
  return pool.passed.filter((r) => r.regular);
}

/** 그 역할·종류로 게이트를 통과하는가 (다른 날짜 배치·삭제·반경 포함) */
export function passesGate(context, role, stop) {
  return kindPool(context, role, stop.isMeal).some((r) => r.contentId === stop.contentId);
}

/** 그 정거장이 게이트에서 받은 사유 (통과했으면 빈 배열) */
export function gateReasons(context, role, contentId) {
  const g = context.pools[role]?.gated.find((x) => x.rec.contentId === contentId);
  return g && !g.pass ? g.reasons : [];
}

/** 외출이 숙소를 비우는 구간의 끝 — 병원에서 끝나는 외출은 마감(병원 일정 시작)까지 */
export function occupancyEnd(outing) {
  if (outing.returnPlace === 'HOSPITAL') return toMinutes(outing.returnBy);
  return toMinutes(outing.plannedReturnAt ?? outing.returnBy);
}

/**
 * 환자 외출의 현재 마감 — 지금 입력(옮긴 병원 일정 등)으로 다시 만든 외출 창에서 출발 시각이 든 창을 찾는다.
 * planDay 와 같은 규칙이다: 병원에서 끝나는 창의 마지막 외출은 그 병원(마감 = 창 끝),
 * 그 앞 외출은 숙소(마감 = 창 끝 − 숙소→병원 − 도착 여유).
 * @returns {{deadlineMin: number, returnPlace: 'LODGING'|'HOSPITAL', returnPoint: object, deadlineReason: string} | null}
 *   출발 시각이 어느 창에도 없으면 null
 */
export function patientDeadlineAt(context, departMin, returnPlace) {
  const w = context.windows.find((x) => x.startMin <= departMin && departMin < x.endMin);
  if (!w) return null;
  const { event } = w;
  if (event.place === 'HOSPITAL') {
    if (returnPlace === 'HOSPITAL') {
      return { deadlineMin: w.endMin, returnPlace: 'HOSPITAL', returnPoint: event.point, deadlineReason: event.kind };
    }
    const lodgingDeadline =
      w.endMin - context.dayEstimate(context.lodgingPoint, event.point).min - DEFAULTS.buffers.arrivalMarginMin;
    return { deadlineMin: lodgingDeadline, returnPlace: 'LODGING', returnPoint: context.lodgingPoint, deadlineReason: event.kind };
  }
  return { deadlineMin: w.endMin, returnPlace: 'LODGING', returnPoint: context.lodgingPoint, deadlineReason: event.kind };
}

/**
 * 병원·복약 블록 (planDay 와 같은 모양·순서). 직전 외출이 병원에서 끝난 병원 일정은 일정 시작부터다.
 * @param {Set<string>} chainedIds
 * @returns {Array<{kind: string, startMin: number, endMin: number, appointmentId?: string}>}
 */
export function computeBlocks(context, chainedIds = new Set()) {
  return [
    ...context.apptEvents.map((e) => ({
      kind: 'APPOINTMENT',
      startMin: chainedIds.has(e.appointmentId) ? e.chainedStartMin : e.standaloneStartMin,
      endMin: e.blockEndMin,
      appointmentId: e.appointmentId,
    })),
    ...(context.limits ? medicationBlocks(context.limits.medication) : []).map((b) => ({
      kind: 'MEDICATION',
      startMin: toMinutes(b.start),
      endMin: toMinutes(b.start) + DEFAULTS.medicationGapMin,
    })),
  ].sort((a, b) => a.startMin - b.startMin || compareIds(a.kind, b.kind));
}

/** 병원에서 끝난 외출이 있는 병원 일정 id (그 병원 일정 시작이 마감인 외출) */
export function chainedAppointmentIds(context, patientOutings) {
  const ids = new Set();
  for (const e of context.apptEvents) {
    const chained = patientOutings.some(
      (o) => o.returnPlace === 'HOSPITAL' && o.deadlineReason === 'APPOINTMENT' && toMinutes(o.returnBy) === e.deadlineMin,
    );
    if (chained) ids.add(e.appointmentId);
  }
  return ids;
}

export function blocksToPlan(blocks) {
  return blocks.map((b) => ({
    kind: b.kind,
    start: fromMinutes(b.startMin),
    end: fromMinutes(b.endMin),
    ...(b.appointmentId ? { appointmentId: b.appointmentId } : {}),
  }));
}

/**
 * 보호자 외출의 현재 마감 — 환자가 숙소에 있는 구간(블록·환자 외출·병원 복귀 시각 밖) 중 출발 시각이 든 구간의 끝.
 * @param {Array<[number, number]>} patientBusy  환자 외출이 숙소를 비우는 구간
 * @returns {{deadlineMin: number, returnPlace: 'LODGING', returnPoint: object, deadlineReason: string} | null}
 */
export function guardianDeadlineAt(context, departMin, patientBusy, blocks) {
  const { frame, limits } = context;
  const busy = [...blocks.map((b) => [b.startMin, b.endMin]), ...patientBusy];
  if (limits?.returnTime?.place === 'HOSPITAL') busy.push([toMinutes(limits.returnTime.time), frame.endMin]);
  const interval = freeIntervals([frame.startMin, frame.endMin], busy).find(([s, e]) => s <= departMin && departMin < e);
  if (!interval) return null;
  const end = interval[1];
  return {
    deadlineMin: end,
    returnPlace: 'LODGING',
    returnPoint: context.lodgingPoint,
    deadlineReason: end === frame.endMin ? frame.endReason : 'PATIENT_SCHEDULE',
  };
}

/**
 * 저장된 정거장 → 외출 검증용 기록. 이미 시작된 정거장처럼 후보 목록에서 다시 읽지 않을 때 쓴다.
 * 판정 값은 저장된 값 그대로다(좌표·보행 부담·체류·음식점 여부).
 */
export function recFromStop(stop) {
  const food = stop.category === 'FOOD' || stop.category === 'CAFE';
  const labels = stop.labels ?? [];
  return {
    cand: {
      id: stop.candidateId,
      title: stop.title,
      titleLanguage: stop.lang,
      indoor: stop.indoor ?? null,
      needsTranslation: labels.includes('NEEDS_TRANSLATION'),
      walkEstimateConfidence: labels.includes('ESTIMATED') ? 'heuristic' : 'verified',
      signals: { isFoodPlace: food, isCafe: stop.category === 'CAFE' },
      stop: {
        contentId: stop.contentId,
        title: stop.title,
        address: stop.address,
        lang: stop.lang,
        ko: stop.ko ?? null,
        sourceIds: stop.sourceIds ?? {},
        contentTypeIds: stop.contentTypeIds ?? { canonical: null },
        image: stop.image ?? null,
      },
    },
    contentId: stop.contentId,
    point: { lat: Number(stop.lat), lng: Number(stop.lng) },
    distanceKm: null,
    walkMin: Number.isFinite(Number(stop.walkBurdenMin)) ? Number(stop.walkBurdenMin) : 30,
    stayMin: stop.stayMin,
    hasFood: food,
    category: stop.category,
    interest: false,
    pinned: stop.pinned === true,
    restaurant: stop.category === 'FOOD',
    regular: stop.category !== 'FOOD',
    gateInput: null,
  };
}

/**
 * 저장된 정거장만으로 외출 시간표를 다시 쓴다(검증 없이). 시작된 정거장만 남은 외출의 마감을 새로 계산할 때 쓴다.
 * @returns {object} evaluateOuting 결과와 같은 모양
 */
export function manualEvaluation(context, role, outing, stops, returnPoint) {
  const items = stops.map((s) => ({
    rec: recFromStop(s),
    stayMin: s.stayMin,
    meal: null,
    arriveMin: toMinutes(s.arriveAt),
    leaveMin: toMinutes(s.leaveAt),
    leg: { min: s.legIn.min, mode: LEG_MODE_BACK[s.legIn.mode] ?? 'car' },
  }));
  const last = stops.at(-1);
  const back = context.ctx[role].estimate({ lat: Number(last.lat), lng: Number(last.lng) }, returnPoint);
  const walkTotal =
    stops.reduce((sum, s) => sum + (Number(s.walkBurdenMin) || 0) + (s.legIn.mode === 'WALK' ? s.legIn.min : 0), 0) +
    (back.mode === 'walk' ? back.min : 0);
  return {
    departMin: toMinutes(outing.departAt),
    items,
    back,
    walkTotal,
    travelTotalMin: stops.reduce((sum, s) => sum + s.legIn.min, 0) + back.min,
    returnArriveMin: toMinutes(last.leaveAt) + back.min,
  };
}

/**
 * 외출 결과 → Outing. 원래 정거장은 표시 필드를 그대로 두고 시각만 새로 쓴다.
 * exact 에 든 정거장(이미 시작된 정거장)은 저장된 그대로 둔다.
 * @param {object} ev  evaluateOuting 결과(또는 manualEvaluation)
 * @param {object} meta  toOuting 메타 (id, role, date, deadlineMin, returnPlace, deadlineReason, recovery, extraBufferMin, diet)
 * @param {{original?: Map<string, object>, exact?: Set<string>, pinnedIds?: Set<string>}} [keep]
 */
export function assembleOuting(ev, meta, { original = new Map(), exact = new Set(), pinnedIds = new Set() } = {}) {
  const outing = toOuting(ev, meta);
  outing.stops = outing.stops.map((fresh) => {
    const prior = original.get(fresh.contentId);
    if (pinnedIds.has(fresh.contentId)) fresh.pinned = true;
    if (!prior) return fresh;
    if (exact.has(fresh.contentId)) return prior;
    return {
      ...prior,
      arriveAt: fresh.arriveAt,
      leaveAt: fresh.leaveAt,
      stayMin: fresh.stayMin,
      shortened: prior.shortened === true || fresh.stayMin < prior.stayMin,
      legIn: fresh.legIn,
      pinned: prior.pinned === true || fresh.pinned === true,
    };
  });
  return outing;
}

/** toOuting 메타 */
export function outingMeta(context, role, { id, deadline }) {
  return {
    id,
    role,
    date: context.date,
    deadlineMin: deadline.deadlineMin,
    returnPlace: deadline.returnPlace,
    deadlineReason: deadline.deadlineReason,
    recovery: role === 'P' && context.recovery,
    extraBufferMin: context.extraBufferMin,
    diet: role === 'P' ? context.limits?.diet ?? null : null,
  };
}

/**
 * selectBest 를 조건(accept)과 함께 쓴다 — 가장 높은 순위 후보가 조건을 어기면 빼고 다시 고른다.
 * 외출 중 외출을 고칠 때 '시작된 정거장의 시각이 그대로'라는 조건에 쓴다.
 */
export function selectBestAccepted(ctx, plan, index, recs, meal, rank, accept, failures = new Map()) {
  let pool = recs;
  while (pool.length > 0) {
    const best = selectBest(ctx, plan, index, pool, meal, rank, failures);
    if (!best) return null;
    if (accept(best.ev)) return best;
    pool = pool.filter((r) => r.contentId !== best.rec.contentId);
  }
  return null;
}

/** 식사 칸 정거장의 식사 칸 이름 — 저장된 mealSlots 에서, 없으면 도착 시각이 든 칸 */
export function mealSlotOf(day, stop) {
  const entry = (day?.mealSlots ?? []).find((m) => m.stopId === stop.id);
  if (entry) return entry.slot;
  const arrive = toMinutes(stop.arriveAt);
  return (
    MEAL_SLOT_NAMES.find((slot) => {
      const def = DEFAULTS.mealSlots[slot];
      return arrive >= toMinutes(def.start) && arrive <= toMinutes(def.end);
    }) ?? null
  );
}

/**
 * 정거장이 지금 게이트를 통과하지 못한 사유 — 전후 비교·식사 칸 사유에 쓴다. 비지 않는다.
 * 게이트 사유 → 반경 밖(TRAVEL_LIMIT_EXCEEDED) → 금식 → 역할이 막힌 날의 분류 사유 → NO_CANDIDATE
 */
export function failReasons(context, role, stop, meal = null) {
  const id = String(stop.contentId);
  const gate = gateReasons(context, role, id);
  if (gate.length > 0) return gate;
  const pool = context.pools[role];
  if (pool?.outOfRadius.has(id)) return [REASON.TRAVEL_LIMIT_EXCEEDED];
  if (stop.isMeal && meal && !meal.allowed) return [REASON.FASTING_REQUIRED];
  if (!pool) {
    const reasons = context.classification.reasons ?? [];
    return reasons.length > 0 ? [...reasons] : [REASON.NO_CANDIDATE];
  }
  return [REASON.NO_CANDIDATE];
}

/** 병원에서 끝나는 외출의 병원 일정 id — 그 날짜 일정에서 외출 마감과 시작이 같은 병원 일정 블록 */
export function hospitalTargetId(dayRef, outing) {
  if (outing.returnPlace !== 'HOSPITAL' || outing.deadlineReason !== 'APPOINTMENT') return null;
  const block = (dayRef?.blocks ?? []).find((b) => b.kind === 'APPOINTMENT' && b.start === outing.returnBy);
  return block?.appointmentId ?? null;
}

function lodgingDeadlineOf(context, w) {
  if (w.event.place !== 'HOSPITAL') return w.endMin;
  return w.endMin - context.dayEstimate(context.lodgingPoint, w.event.point).min - DEFAULTS.buffers.arrivalMarginMin;
}

/**
 * 환자 외출의 지금 마감과 짜는 방식 (spec 4.3·4.7, 지금 입력으로 다시 만든 창 기준).
 * - 병원에서 끝나는 외출: 같은 병원 일정(또는 병원 복귀 시각)의 창 — 마감에 맞춰 거꾸로(LATE).
 * - 숙소로 돌아오는 외출: 출발 시각이 든 창, 없으면(블록이 옮겨 와 덮음) 그 뒤 첫 창 — 앞에서부터(EARLY).
 * 이미 출발한 외출(departed)은 출발 시각을 옮기지 않는다. 창을 찾지 못하면 출발 전 마지막 창의 마감이다(이미 늦음).
 * @returns {{deadline: object, startMin: number, align: 'EARLY'|'LATE'} | null}
 */
export function locatePatient(context, outing, { lower, departed, dayRef, nowMin = null }) {
  const departMin = toMinutes(outing.departAt);
  const windows = context.windows;
  if (windows.length === 0) return null;
  if (outing.returnPlace === 'HOSPITAL') {
    const targetId = hospitalTargetId(dayRef, outing);
    const w = windows.find(
      (x) =>
        x.event.place === 'HOSPITAL' &&
        (targetId ? x.event.appointmentId === targetId : x.event.kind === outing.deadlineReason && !x.event.appointmentId),
    );
    if (w) {
      const deadline = { deadlineMin: w.endMin, returnPlace: 'HOSPITAL', returnPoint: w.event.point, deadlineReason: w.event.kind };
      if (departed) return { deadline: overdueSafe(deadline, departMin, nowMin), startMin: departMin, align: 'EARLY' };
      return { deadline, startMin: Math.max(w.startMin, lower), align: 'LATE' };
    }
    if (!departed) return null;
  }
  const from = departed ? departMin : Math.max(departMin, lower);
  let w = windows.find((x) => x.startMin <= from && from < x.endMin);
  if (!w && departed) {
    // 이미 출발했는데 출발 시각을 (옮긴) 블록이 덮는다 — 이미 늦었다. 마감은 지금(출발보다 이르지 않게)이다
    const covering = context.apptEvents.find((e) => e.standaloneStartMin <= departMin && departMin < e.blockEndMin);
    const deadline = {
      deadlineMin: departMin,
      returnPlace: 'LODGING',
      returnPoint: context.lodgingPoint,
      deadlineReason: covering ? 'APPOINTMENT' : (windows.filter((x) => x.startMin <= from).at(-1) ?? windows[0]).event.kind,
    };
    return { deadline: overdueSafe(deadline, departMin, nowMin), startMin: departMin, align: 'EARLY' };
  }
  if (!w) w = windows.find((x) => x.startMin > from);
  if (!w) return null;
  const deadline = {
    deadlineMin: lodgingDeadlineOf(context, w),
    returnPlace: 'LODGING',
    returnPoint: context.lodgingPoint,
    deadlineReason: w.event.kind,
  };
  if (departed) return { deadline: overdueSafe(deadline, departMin, nowMin), startMin: departMin, align: 'EARLY' };
  return { deadline, startMin: Math.max(from, w.startMin), align: 'EARLY' };
}

/**
 * 이미 출발한 외출의 마감은 출발 시각보다 이르지 않다. 새 마감이 출발보다 이르면(블록이 옮겨 와 덮음) 이미 늦은 것이므로
 * 마감을 지금(없으면 출발 시각)으로 둔다 — 여유가 음수가 되어 '시간 부족'으로 드러난다.
 */
function overdueSafe(deadline, departMin, nowMin) {
  if (deadline.deadlineMin >= departMin) return deadline;
  return { ...deadline, deadlineMin: Math.max(departMin, nowMin ?? departMin) };
}

/**
 * 보호자 외출의 지금 마감 — 환자가 숙소에 있는 구간(블록·환자 외출·병원 복귀 시각 밖).
 * 출발 시각이 든 구간, 없으면 그 뒤 첫 구간(45분 이상). 이미 출발했으면 출발 시각을 옮기지 않는다.
 */
export function locateGuardian(context, outing, { lower, departed, patientBusy, blocks, nowMin = null }) {
  const { frame, limits } = context;
  const departMin = toMinutes(outing.departAt);
  const busy = [...blocks.map((b) => [b.startMin, b.endMin]), ...patientBusy];
  if (limits?.returnTime?.place === 'HOSPITAL') busy.push([toMinutes(limits.returnTime.time), frame.endMin]);
  const free = freeIntervals([frame.startMin, frame.endMin], busy);
  const from = departed ? departMin : Math.max(departMin, lower);
  let iv = free.find(([s, e]) => s <= from && from < e);
  if (!iv && !departed) iv = free.find(([s, e]) => s > from && e - s >= DEFAULTS.minOutingWindowMin);
  if (!iv && departed) iv = free.filter(([s]) => s <= from).at(-1) ?? [departMin, departMin];
  if (!iv) return null;
  const end = iv[1];
  const deadline = {
    deadlineMin: end,
    returnPlace: 'LODGING',
    returnPoint: context.lodgingPoint,
    deadlineReason: end === frame.endMin ? frame.endReason : 'PATIENT_SCHEDULE',
  };
  return {
    deadline: departed ? overdueSafe(deadline, departMin, nowMin) : deadline,
    startMin: departed ? departMin : Math.max(from, iv[0]),
    align: 'EARLY',
  };
}

/**
 * 저장된 외출의 복귀 좌표 — 숙소, 또는 마감과 시작이 같은 병원 일정·병원 복귀 시각의 병원 (규칙 13-1).
 * 병원은 `hospitalId` 로만 찾는다 — 찾지 못했다고 첫 번째 병원으로 추측하지 않는다.
 * 병원이 둘 이상인 것은 정상이다(사용자 병원 + 연동 지침이 더한 병원). 추측하면 다른 병원 좌표로 복귀를 계산하게 된다.
 */
export function returnPointOf(context, outing) {
  if (outing.returnPlace !== 'HOSPITAL') return context.lodgingPoint;
  const at = toMinutes(outing.returnBy);
  const appt = context.apptEvents.find((e) => e.deadlineMin === at);
  if (appt) return appt.point;
  const hospitalId = context.limits?.returnTime?.hospitalId;
  const hospital = hospitalId ? (context.hospitals ?? []).find((h) => h?.id === hospitalId) : null;
  return hospital ? pointOf(hospital) : context.lodgingPoint;
}

/**
 * 환자 외출을 고칠 때 보호자 외출을 그대로 두는 범위 — 앞 보호자 외출이 복귀 계산식을 지키며 돌아온 뒤 출발하고,
 * 다음 보호자 외출이 나가기 전에 계획상 돌아온다.
 */
export function guardianBounds(guardianOutings, outing) {
  const depart = toMinutes(outing.departAt);
  const before = guardianOutings.filter((g) => toMinutes(g.departAt) < depart);
  const after = guardianOutings.filter((g) => toMinutes(g.departAt) > depart);
  if (before.length === 0 && after.length === 0) return null;
  return {
    startMin: Math.max(-Infinity, ...before.map((g) => Math.max(occupancyEnd(g), toMinutes(g.returnBy) - Math.max(0, g.slackMin ?? 0)))),
    returnBy: Math.min(Infinity, ...after.map((g) => toMinutes(g.departAt))),
  };
}


/**
 * 다음 외출이 출발해도 되는 가장 이른 시각 — 앞 외출이 돌아온 뒤이면서, 앞 외출의 복귀 계산식(버퍼 포함)이 끝난 뒤.
 * planDay 는 창을 나눠 이것을 보장한다. 고치면서 뒤 외출을 앞당길 때도 같은 조건을 지킨다.
 */
export function settledAt(outing) {
  return Math.max(occupancyEnd(outing), toMinutes(outing.returnBy) - Math.max(0, outing.slackMin ?? 0));
}

