// SafeHour 통합 추천 엔진
//
// 실행 순서 (사업계획서 6장 안전 게이트 순서와 동일)
//   1. 병원 조건 존재·최신·상충 없음        → 실패 시 NO_TOURISM
//   2. 필수동행·연락조건·현재입력 확인      → 실패 시 NO_TOURISM
//   3. 진료/복귀시간과 보수적 SLA 충족      → 실패 시 STANDBY / 축소 / 취소
//   4. 데이터 출처·갱신·좌표 신뢰 통과      → 실패 시 후보 제외
//   5. 실제 이동시간·환경·시설·선호로 순위화
//   6. 변화 감지 시 1단계부터 재실행
//
// 반환값에는 "왜 제외했는지"가 반드시 포함된다. (심사 요구사항)

import { STATE, REASON, mostConservative } from '../domain/states.js';
import { gateHospitalCondition, gateCandidate, rankCandidates } from './safetyGate.js';
import { checkSla, shrinkToFit } from './slaCalculator.js';

/**
 * @param {object} input
 * @param {object} input.condition        병원 주의조건
 * @param {object} input.plan             { now, returnBy, origin:{lat,lng}, hospital:{lat,lng} }
 * @param {object} input.roles            { hasCompanion, companionSeparateAllowed, patientResting }
 * @param {Array}  input.candidates       TourAPI 등에서 생성한 후보
 * @param {object} input.travelTime       이동시간 어댑터 { estimate(from,to) => {min, source} }
 * @param {object} [input.ctx]            { weather, riskSignalReported, appointmentDelayedMin, patientRecalled }
 */
export function recommend(input) {
  const { condition, plan, roles = {}, candidates = [], travelTime, ctx = {} } = input;
  const now = plan.now ?? new Date();
  const decisions = [];   // 감사 로그 (심사 증빙)
  const excluded = [];    // 제외 사유 (화면 표시 필수)

  const log = (step, result, detail) => decisions.push({ step, result, detail, at: new Date().toISOString() });

  // ── 0. 환자 복귀 요청은 모든 것을 무효화 ──
  if (ctx.patientRecalled) {
    log('recall', 'blocked', REASON.PATIENT_RECALLED);
    return finalize(STATE.NO_TOURISM, [], [REASON.PATIENT_RECALLED], decisions, excluded, { returnNow: true });
  }

  // ── 1~2. 병원 조건 게이트 ──
  const hg = gateHospitalCondition(condition, { now, riskSignalReported: ctx.riskSignalReported });
  log('hospitalCondition', hg.pass ? 'pass' : 'blocked', hg.reasons);
  if (!hg.pass) {
    return finalize(hg.state, [], hg.reasons, decisions, excluded);
  }

  // 필수 동행 확인
  if (condition.escortRequired && !roles.hasCompanion) {
    log('escort', 'blocked', REASON.ESCORT_REQUIRED);
    return finalize(STATE.NO_TOURISM, [], [REASON.ESCORT_REQUIRED], decisions, excluded);
  }

  // ── 3. 진료 지연 → 복귀창 재계산 ──
  let returnBy = new Date(plan.returnBy);
  const stateReasons = [];
  if (ctx.appointmentDelayedMin) {
    // 음수면 앞당겨짐 (병원 호출) — 복귀창 축소
    returnBy = new Date(returnBy.getTime() + ctx.appointmentDelayedMin * 60000);
    stateReasons.push(REASON.APPOINTMENT_DELAYED);
    log('appointment', 'changed', `${ctx.appointmentDelayedMin}min → returnBy ${returnBy.toISOString()}`);
  }

  const windowMin = Math.floor((returnBy - now) / 60000);
  if (windowMin <= 0) {
    log('window', 'blocked', REASON.SLA_INSUFFICIENT);
    return finalize(STATE.NO_TOURISM, [], [...stateReasons, REASON.SLA_INSUFFICIENT], decisions, excluded, { returnNow: true });
  }

  // 최소 활동 성립 시간(호출+왕복+최소체류+버퍼)조차 안 되면 대기
  const MIN_VIABLE_WINDOW = 45;
  if (windowMin < MIN_VIABLE_WINDOW) {
    log('window', 'standby', `${windowMin}min < ${MIN_VIABLE_WINDOW}min`);
    return finalize(STATE.STANDBY, [], [...stateReasons, REASON.DEPARTURE_WINDOW_TOO_SHORT], decisions, excluded);
  }

  // ── 4~5. 후보별 게이트 → SLA → 순위화 ──
  const extraBuffer = ctx.trafficSurgeMin ?? 0;
  const passed = [];

  for (const c of candidates) {
    const cg = gateCandidate(c, condition, { weather: ctx.weather, now });
    if (!cg.pass) {
      excluded.push({ id: c.id, title: c.title, reasons: cg.reasons });
      continue;
    }

    const out = travelTime.estimate(plan.origin, c);
    const back = travelTime.estimate(c, plan.hospital);

    // 편도 이동 허용 초과
    if (typeof condition.maxTravelMin === 'number' && out.min > condition.maxTravelMin) {
      excluded.push({ id: c.id, title: c.title, reasons: [REASON.TRAVEL_LIMIT_EXCEEDED] });
      continue;
    }

    const base = {
      now, returnBy,
      outboundMin: out.min,
      inboundMin: back.min,
      stayMin: c.stayMin ?? 30,
      extraBufferMin: extraBuffer,
    };

    // 환자 후보 판정
    const patientFit = shrinkToFit({ ...base, isPatient: true });
    // 보호자 후보 판정 (가산 버퍼 없음)
    const companionFit = shrinkToFit({ ...base, isPatient: false });

    if (!patientFit && !companionFit) {
      excluded.push({ id: c.id, title: c.title, reasons: [REASON.SLA_INSUFFICIENT] });
      continue;
    }

    passed.push({
      ...c,
      travel: { outboundMin: out.min, inboundMin: back.min, source: out.source },
      patient: patientFit ? { ok: true, stayMin: patientFit.stayMin, shrunk: patientFit.shrunk, sla: patientFit.sla } : { ok: false },
      companion: companionFit ? { ok: true, stayMin: companionFit.stayMin, shrunk: companionFit.shrunk, sla: companionFit.sla } : { ok: false },
      sla: (patientFit ?? companionFit).sla,
    });
  }

  log('candidateGate', 'done', `passed=${passed.length} excluded=${excluded.length}`);

  if (passed.length === 0) {
    // 후보 0건은 정상 결과 — 억지로 추천하지 않는다
    return finalize(STATE.STANDBY, [], [...stateReasons, REASON.NO_CANDIDATE], decisions, excluded);
  }

  const preferIndoor = Boolean(condition.indoorOnly || condition.avoidUv || ctx.weather?.outdoorUnsafe);
  const ranked = rankCandidates(passed, { preferIndoor });

  // API 후보 전체를 화면에 노출하지 않는다. 기본 5개, 요청 시 1~10개로 제한한다.
  const maxResults = Math.min(Math.max(Number(plan.maxResults ?? 5), 1), 10);
  const patientCourse = ranked.filter((c) => c.patient.ok).slice(0, maxResults);
  const companionCourse = ranked.filter((c) => c.companion.ok).slice(0, maxResults);

  // ── 상태 결정 ──
  let state;
  if (roles.patientResting || patientCourse.length === 0) {
    // 환자는 휴식 → 보호자 분리 가능한지
    const splitOk =
      roles.hasCompanion &&
      roles.companionSeparateAllowed &&
      !condition.escortRequired &&
      companionCourse.length > 0;
    state = splitOk ? STATE.SPLIT_NEARBY : STATE.STANDBY;
    if (!splitOk && condition.escortRequired) stateReasons.push(REASON.ESCORT_REQUIRED);
  } else if (roles.hasCompanion && companionCourse.length > 0) {
    state = STATE.TOGETHER;
  } else if (condition.escortRequired) {
    state = STATE.NO_TOURISM;
    stateReasons.push(REASON.ESCORT_REQUIRED);
  } else {
    state = STATE.TOGETHER;
  }

  log('state', 'decided', state);

  return finalize(state, state === STATE.SPLIT_NEARBY ? companionCourse : patientCourse,
    stateReasons, decisions, excluded, {
      patientCourse,
      companionCourse,
      returnBy,
      latestDepartureAt: ranked[0]?.sla?.latestDepartureAt ?? null,
    });
}

function finalize(state, course, reasons, decisions, excluded, extra = {}) {
  return {
    state,
    reasons: [...new Set(reasons)],
    course,
    excluded,
    decisions,
    ...extra,
  };
}

/**
 * 실시간 이벤트 주입 → 재계산 (과제1 증명의 핵심)
 * 기존 결과와 새 결과를 비교해 "무엇이 왜 바뀌었는지" 델타를 반환한다.
 */
export function applyEvent(input, event) {
  const before = recommend(input);
  const nextCtx = { ...(input.ctx ?? {}) };

  switch (event.type) {
    case 'WEATHER':          nextCtx.weather = event.weather; break;
    case 'TRAFFIC_SURGE':    nextCtx.trafficSurgeMin = event.extraMin; break;
    case 'APPOINTMENT':      nextCtx.appointmentDelayedMin = event.deltaMin; break;
    case 'PATIENT_RECALL':   nextCtx.patientRecalled = true; break;
    case 'RISK_SIGNAL':      nextCtx.riskSignalReported = true; break;
    case 'CONDITION_UPDATE': input = { ...input, condition: event.condition }; break;
    case 'CLOSURE': {
      const ids = new Set(event.closedIds);
      input = { ...input, candidates: input.candidates.map((c) => (ids.has(c.id) ? { ...c, openNow: false } : c)) };
      break;
    }
    default: throw new Error(`알 수 없는 이벤트: ${event.type}`);
  }

  const after = recommend({ ...input, ctx: nextCtx });

  const beforeIds = new Set(before.course.map((c) => c.id));
  const afterIds = new Set(after.course.map((c) => c.id));

  // 체류시간 축소 감지 — "축소"는 심사 필수 동작(축소·대체·취소) 중 하나이므로
  // ID가 그대로 남아도 변화를 반드시 포착해야 한다.
  const stayOf = (r, id) => {
    const c = r.course.find((x) => x.id === id);
    if (!c) return null;
    return c.patient?.ok ? c.patient.stayMin : (c.companion?.ok ? c.companion.stayMin : null);
  };
  const slackOf = (r, id) => r.course.find((x) => x.id === id)?.sla?.slackMin ?? null;

  const shortened = [...afterIds]
    .filter((id) => beforeIds.has(id))
    .map((id) => ({
      id,
      beforeStayMin: stayOf(before, id),
      afterStayMin: stayOf(after, id),
      beforeSlackMin: slackOf(before, id),
      afterSlackMin: slackOf(after, id),
    }))
    .filter((d) => d.beforeStayMin != null && d.afterStayMin != null && d.afterStayMin < d.beforeStayMin);

  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));

  return {
    event,
    before: { state: before.state, courseIds: [...beforeIds] },
    after: { state: after.state, courseIds: [...afterIds], reasons: after.reasons },
    delta: {
      stateChanged: before.state !== after.state,
      removed,
      added,
      shortened,
      newlyExcluded: after.excluded.filter((e) => beforeIds.has(e.id)),
      /** 사용자에게 보여줄 변화가 하나라도 있는가 — 알림만 띄우고 끝나면 false */
      hasVisibleChange:
        before.state !== after.state ||
        removed.length > 0 ||
        added.length > 0 ||
        shortened.length > 0,
    },
    result: after,
  };
}
