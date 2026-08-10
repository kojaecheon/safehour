// 판정 결과 운영 로그 (ADR-0002 선택지 B)
//
// D07 4절이 감사 증적으로 `engine decision log` 를 요구하고, D07-POL001 은 의료
// 판단 경계의 위반 탐지 수단을 "런타임 reason code 검사"로 정한다. 판정 사유를
// 남기지 않으면 그 통제는 문서로만 존재한다. 이 파일이 그 증적을 만든다.
//
// 사용자 행동은 기록하지 않는다. D02-EVT001–EVT007 은 2차 범위이며, 여기서
// 만드는 것은 서비스 운영·장애 대응에 필요한 로그다.
//
// 설계 — allowlist
//   호출자가 무엇을 넘기든 buildDecisionLogEntry 가 조립한 필드만 나간다.
//   엔진이 새 필드를 반환해도, 요청 본문이 커져도 로그는 따라 커지지 않는다.
//   사유 코드는 닫힌 enum(REASON)을 통과한 값만 남으므로, 나중에 자유 문자열이
//   섞이더라도 로그로 새지 않는다.
//
// 남기지 않는 것 (D07-POL008 최소수집, D07-BAN002, D02-EVT005)
//   좌표, 병원 조건 원문, 조건 발행시각 원값, 장소 이름·주소, session 식별자,
//   인증키, 외부 URL, 외부 오류 원문.
//
// 기록 위치는 stdout 한 줄이다. 파일이나 DB 를 만들지 않는 것은 의도다 —
// 저장소를 두는 순간 보존 정책(AX-104)이 선행 조건이 되고, 서버리스에서는
// 인스턴스마다 흩어져 어차피 집계되지 않는다 (docs/DEPLOYMENT.md 1.3).

import { REASON } from '../../src/domain/states.js';
import { ENGINE_VERSION } from '../../src/engine/recommend.js';
import { EVENT_TYPES } from './engine-io.js';

/** 로그에 나갈 수 있는 사유 코드 전체. 이 집합 밖의 값은 버린다. */
const KNOWN_REASONS = new Set(Object.values(REASON));

/**
 * 판정 결과의 성격. 미추천도 정상 결과이므로 DECIDED 다 —
 * 판정 자체를 하지 못한 경우와 구분하기 위해 나눈다.
 */
export const OUTCOME = {
  /** 엔진이 판정했다 (미추천 포함) */
  DECIDED: 'DECIDED',
  /** kill switch 로 판정 없이 미추천 응답 */
  PAUSED: 'PAUSED',
  /** 판정 입력을 확보하지 못했거나 엔진이 실패해 안전측으로 응답 */
  FAILED: 'FAILED',
};

/** 조건 신선도 구간. 발행시각 원값 대신 이것만 남긴다. */
const CONDITION_MAX_AGE_HOURS = 24; // src/engine/safetyGate.js 와 같은 기준

export function conditionAgeBucket(issuedAt, now = new Date()) {
  const issued = issuedAt instanceof Date ? issuedAt : new Date(issuedAt ?? NaN);
  if (Number.isNaN(issued.getTime())) return 'UNKNOWN';

  const hours = (now.getTime() - issued.getTime()) / 3_600_000;
  if (hours < 0) return 'FUTURE'; // 발행시각이 미래 — 입력 오류 신호
  if (hours <= 1) return 'FRESH';
  if (hours <= 6) return 'RECENT';
  if (hours <= CONDITION_MAX_AGE_HOURS) return 'AGING';
  return 'STALE';
}

/** 닫힌 enum 을 통과한 사유 코드만, 중복 없이, 순서를 고정해 반환한다 */
function safeReasons(values) {
  if (!Array.isArray(values)) return [];
  const kept = new Set();
  for (const v of values) {
    if (typeof v === 'string' && KNOWN_REASONS.has(v)) kept.add(v);
  }
  return [...kept].sort();
}

/** 제외 후보에서 사유 코드만 모은다 — 장소 이름·식별자는 가져오지 않는다 */
function excludedReasons(excluded) {
  if (!Array.isArray(excluded)) return [];
  return safeReasons(excluded.flatMap((e) => (Array.isArray(e?.reasons) ? e.reasons : [])));
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * 로그 한 줄을 조립한다. 순수 함수이므로 테스트가 출력 문자열을 직접 검사한다.
 *
 * @param {object} args
 * @param {'recommend'|'recalculate'} args.route
 * @param {string} args.outcome                 OUTCOME 중 하나
 * @param {object} [args.decision]              엔진 판정 결과 (state·reasons·course·excluded)
 * @param {object} [args.recalc]                재계산 결과 (before·delta)
 * @param {string} [args.trigger]               재계산 트리거 종류
 * @param {number} [args.candidateCount]        판정에 들어간 후보 수
 * @param {Date|string} [args.conditionIssuedAt] 조건 발행시각 — 구간으로만 기록된다
 * @param {string} [args.errorCode]             우리가 정의한 SAFEHOUR_* 오류코드
 * @param {number} [args.elapsedMs]
 * @param {Date} [args.now]
 */
export function buildDecisionLogEntry({
  route,
  outcome,
  decision,
  recalc,
  trigger,
  candidateCount,
  conditionIssuedAt,
  errorCode,
  elapsedMs,
  now = new Date(),
}) {
  const entry = {
    evt: 'decision',
    route: route === 'recalculate' ? 'recalculate' : 'recommend',
    outcome: OUTCOME[outcome] ?? OUTCOME.DECIDED,
    engine: ENGINE_VERSION,
  };

  if (decision && typeof decision === 'object') {
    entry.state = typeof decision.state === 'string' ? decision.state : null;
    entry.reasons = safeReasons(decision.reasons);
    entry.courseCount = count(decision.course);
    entry.excludedCount = count(decision.excluded);
    entry.excludedReasons = excludedReasons(decision.excluded);
  }

  if (Number.isFinite(candidateCount)) entry.candidateCount = candidateCount;

  if (conditionIssuedAt !== undefined) {
    entry.conditionAge = conditionAgeBucket(conditionIssuedAt, now);
  }

  if (trigger !== undefined) {
    entry.trigger = EVENT_TYPES.has(trigger) ? trigger : 'UNKNOWN';
  }

  if (recalc && typeof recalc === 'object') {
    // 변화가 필요한데 보이는 변화가 없으면 D07-BAN008 위반 신호다 (D02-EVT004 Guardrail)
    entry.stateBefore = typeof recalc.before?.state === 'string' ? recalc.before.state : null;
    entry.visibleChange = Boolean(recalc.delta?.hasVisibleChange);
    entry.removedCount = count(recalc.delta?.removed);
    entry.addedCount = count(recalc.delta?.added);
    entry.shortenedCount = count(recalc.delta?.shortened);
  }

  // 우리가 정의한 오류코드만 남긴다. 외부 오류 원문은 인증키·URL 이 섞일 수 있어 넣지 않는다.
  if (typeof errorCode === 'string' && /^SAFEHOUR_[A-Z_]+$/.test(errorCode)) {
    entry.errorCode = errorCode;
  }

  if (Number.isFinite(elapsedMs)) entry.ms = Math.round(elapsedMs);

  return entry;
}

/**
 * 판정 로그를 stdout 에 한 줄 남긴다. 로그 실패가 요청 처리를 막지 않는다 —
 * 관측 때문에 사용자가 추천을 못 받는 일은 없어야 한다.
 */
export function logDecision(args) {
  try {
    process.stdout.write(`${JSON.stringify(buildDecisionLogEntry(args))}\n`);
  } catch {
    // 로그는 최선 노력이다. 여기서 throw 하면 판정 결과를 못 돌려준다.
  }
}
