// 내부 API ↔ 판정 엔진 입출력 변환
//
// 원칙 (D04·D07)
//   - 판정은 revision 단위 stateless 평가다. 서버는 세션을 저장하지 않는다.
//   - 기준 좌표는 사용자가 선택한 고정 좌표만 허용한다. 현재 GPS는 받지 않는다.
//   - 병원 안내문 원문(rawText)은 MVP에서 저장·전송하지 않는다.

// 상대 경로 사용 — Next 외부(node --test)에서도 이 모듈을 그대로 테스트하기 위함
import { createFallbackEstimator } from '../../src/adapters/travelTime.js';

/** 엔진이 산출하는 후보 수 — 화면 노출은 DISPLAY_LIMIT 로 별도 제한 */
export const ENGINE_MAX_RESULTS = 5;
/** 사용자 화면 기본 노출 수 (D07-POL006) */
export const DISPLAY_LIMIT = 3;

const EVENT_TYPES = new Set([
  'CLOSURE',
  'WEATHER',
  'TRAFFIC_SURGE',
  'APPOINTMENT',
  'PATIENT_RECALL',
  'RISK_SIGNAL',
]);

export class BadRequestError extends Error {}

function asFiniteNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestError(`${name}이(가) 올바른 숫자가 아닙니다.`);
  return n;
}

export function normalizeOrigin(origin) {
  if (!origin) throw new BadRequestError('기준점이 필요합니다.');
  const lat = asFiniteNumber(origin.lat, '기준점 위도');
  const lng = asFiniteNumber(origin.lng, '기준점 경도');

  // 범위 검사를 입력 단계에서 한다. 후보 조회까지 내려가면 외부 API 장애(502)로
  // 잘못 분류되어, 사용자는 고칠 수 있는 입력 오류를 "잠시 후 다시 시도" 로 안내받는다.
  if (lat <= 33 || lat >= 39 || lng <= 124 || lng >= 132) {
    throw new BadRequestError('대한민국 범위의 기준점 좌표가 필요합니다.');
  }

  return {
    kind: 'USER_SELECTED_FIXED',
    label: typeof origin.label === 'string' ? origin.label.slice(0, 80) : '선택한 기준점',
    lat,
    lng,
  };
}

export function normalizeCondition(condition) {
  if (!condition || typeof condition !== 'object') {
    throw new BadRequestError('병원 주의조건이 필요합니다.');
  }
  const issuedAt = new Date(condition.issuedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    throw new BadRequestError('조건 발행 시각(issuedAt)이 올바르지 않습니다.');
  }
  const normalized = {
    version: String(condition.version ?? '').slice(0, 60),
    issuedAt,
    issuedBy: condition.issuedBy === 'coordinator' ? 'coordinator' : 'medical_staff',
    fasting: Boolean(condition.fasting),
    outingAllowed: condition.outingAllowed !== false,
    escortRequired: Boolean(condition.escortRequired),
    avoidUv: Boolean(condition.avoidUv),
    indoorOnly: Boolean(condition.indoorOnly),
  };
  // 병원이 발행한 분리 허용 여부 — escortRequired 와 동시에 true 면 엔진이
  // CONFLICTING_CONDITION 으로 하드블록한다 (safetyGate.gateHospitalCondition).
  if (condition.splitAllowed === true) normalized.splitAllowed = true;
  if (!normalized.version) throw new BadRequestError('조건 버전(version)이 필요합니다.');
  if (condition.maxWalkMin != null && condition.maxWalkMin !== '') {
    normalized.maxWalkMin = Math.min(Math.max(asFiniteNumber(condition.maxWalkMin, '최대 보행시간'), 0), 240);
  }
  if (condition.maxTravelMin != null && condition.maxTravelMin !== '') {
    normalized.maxTravelMin = Math.min(Math.max(asFiniteNumber(condition.maxTravelMin, '최대 이동시간'), 0), 240);
  }
  return normalized;
}

export function normalizeRoles(roles = {}) {
  return {
    hasCompanion: Boolean(roles.hasCompanion),
    companionSeparateAllowed: Boolean(roles.companionSeparateAllowed),
    patientResting: Boolean(roles.patientResting),
  };
}

export function normalizeReturnBy(returnBy) {
  const parsed = new Date(returnBy);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError('복귀 시각(returnBy)이 올바르지 않습니다.');
  }
  return parsed;
}

/** 재계산 요청에 실려 오는 후보 목록의 기본 검증 */
export function normalizeCandidates(candidates) {
  // 후보 0건은 오류가 아니라 정상 결과(STANDBY)다. 빈 배열을 거부하면
  // 그 상태에서 환자 호출·위험신호가 들어와도 재판정이 막힌다 (D04-BR011).
  if (!Array.isArray(candidates)) {
    throw new BadRequestError('판정할 후보 목록이 올바르지 않습니다. 추천을 다시 생성해 주세요.');
  }
  if (candidates.length > 1000) {
    throw new BadRequestError('후보 목록이 허용 범위를 초과했습니다.');
  }
  return candidates;
}

export function normalizeEvent(event) {
  if (!event || !EVENT_TYPES.has(event.type)) {
    throw new BadRequestError('지원하지 않는 이벤트 유형입니다.');
  }
  switch (event.type) {
    case 'CLOSURE': {
      const ids = Array.isArray(event.closedIds) ? event.closedIds.map(String).slice(0, 20) : [];
      if (ids.length === 0) throw new BadRequestError('휴무 처리할 장소 ID가 필요합니다.');
      return { type: 'CLOSURE', closedIds: ids };
    }
    case 'WEATHER':
      return { type: 'WEATHER', weather: { outdoorUnsafe: true, summary: '기상 악화' } };
    case 'TRAFFIC_SURGE': {
      const extraMin = Math.min(Math.max(Number(event.extraMin) || 20, 5), 120);
      return { type: 'TRAFFIC_SURGE', extraMin };
    }
    case 'APPOINTMENT': {
      const deltaMin = Math.max(Math.min(Number(event.deltaMin) || -60, 240), -240);
      return { type: 'APPOINTMENT', deltaMin };
    }
    case 'PATIENT_RECALL':
      return { type: 'PATIENT_RECALL' };
    case 'RISK_SIGNAL':
      return { type: 'RISK_SIGNAL' };
    default:
      throw new BadRequestError('지원하지 않는 이벤트 유형입니다.');
  }
}

/** 재계산 payload 에 실려 오는 판정 컨텍스트 — 허용 키만 통과시킨다 */
export function normalizeCtx(ctx = {}) {
  const out = {};
  if (ctx.weather?.outdoorUnsafe) out.weather = { outdoorUnsafe: true, summary: String(ctx.weather.summary ?? '기상 악화').slice(0, 40) };
  if (Number.isFinite(Number(ctx.trafficSurgeMin)) && Number(ctx.trafficSurgeMin) > 0) {
    out.trafficSurgeMin = Math.min(Number(ctx.trafficSurgeMin), 120);
  }
  if (Number.isFinite(Number(ctx.appointmentDelayedMin)) && Number(ctx.appointmentDelayedMin) !== 0) {
    out.appointmentDelayedMin = Math.max(Math.min(Number(ctx.appointmentDelayedMin), 240), -240);
  }
  if (ctx.patientRecalled) out.patientRecalled = true;
  if (ctx.riskSignalReported) out.riskSignalReported = true;
  return out;
}

/**
 * 반복 가능한 수치 이벤트(TRAFFIC_SURGE·APPOINTMENT)를 payload 의 기존 컨텍스트에
 * 누적한 총량 이벤트로 바꾼다. 엔진 applyEvent 는 ctx 값을 "대체"하므로,
 * 판정에 쓰는 이벤트와 payload 에 저장하는 값은 반드시 같은 총량이어야 한다.
 * (normalizeCtx 와 동일한 상·하한으로 잘라 payload 재전송 시에도 값이 변하지 않게 한다)
 */
export function toCumulativeEvent(ctx, event) {
  switch (event.type) {
    case 'TRAFFIC_SURGE':
      return { type: 'TRAFFIC_SURGE', extraMin: Math.min((ctx.trafficSurgeMin ?? 0) + event.extraMin, 120) };
    case 'APPOINTMENT':
      return { type: 'APPOINTMENT', deltaMin: Math.max(Math.min((ctx.appointmentDelayedMin ?? 0) + event.deltaMin, 240), -240) };
    default:
      return event;
  }
}

/**
 * 이벤트를 payload 컨텍스트에 반영한 다음 재계산 payload 를 만든다.
 * 클라이언트가 이것을 저장했다가 다음 이벤트 때 그대로 되돌려 보내면
 * 이벤트가 누적된 상태에서 다시 판정된다 (stateless 판정 유지).
 * 수치 이벤트는 toCumulativeEvent 로 이미 총량화된 값을 받으므로 여기서는 대입한다.
 */
export function foldEventIntoPayload(payload, event) {
  const ctx = normalizeCtx(payload.ctx);
  let candidates = payload.candidates;
  switch (event.type) {
    case 'CLOSURE': {
      const ids = new Set(event.closedIds);
      candidates = candidates.map((c) => (ids.has(String(c.id)) ? { ...c, openNow: false } : c));
      break;
    }
    case 'WEATHER': ctx.weather = event.weather; break;
    case 'TRAFFIC_SURGE': ctx.trafficSurgeMin = event.extraMin; break;
    case 'APPOINTMENT': ctx.appointmentDelayedMin = event.deltaMin; break;
    case 'PATIENT_RECALL': ctx.patientRecalled = true; break;
    case 'RISK_SIGNAL': ctx.riskSignalReported = true; break;
    default: break;
  }
  return { ...payload, candidates, ctx };
}

/**
 * 엔진 입력 조립 — 기준점(병원·숙소)이 곧 복귀 목적지다.
 */
export function buildEngineInput({ origin, returnBy, condition, roles, candidates, ctx = {} }) {
  const point = { lat: origin.lat, lng: origin.lng };
  return {
    condition,
    plan: {
      now: new Date(),
      returnBy,
      origin: point,
      hospital: point,
      maxResults: ENGINE_MAX_RESULTS,
    },
    roles,
    candidates,
    travelTime: createFallbackEstimator(),
    ctx,
  };
}

/** RISK_SIGNAL 이벤트는 applyEvent 로 처리되므로 초기 판정 ctx 는 항상 비어 있다. */
export function emptyCtx() {
  return {};
}
