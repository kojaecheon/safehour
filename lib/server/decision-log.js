// 판정 운영 로그 (ADR-0002 선택지 B 확장 · docs/security.md '기록' · AX-308)
//
// D07 4절이 감사 증적으로 `engine decision log` 를 요구하고, D07-POL001 은 의료 판단 경계의 위반 탐지 수단을
// "런타임 reason code 검사"로 정한다. 일정 생성·재계획·교체 후보 조회 한 번마다 이 파일이 한 줄을 남긴다.
// 사용자 행동은 기록하지 않는다.
//
// 남기는 것 (docs/security.md '기록')
//   엔진 버전, 요청 날짜 수, 상태별 날짜 수, 사유 코드 집합, 출처 종류별 개수(SELF/HOSPITAL/기본값 적용), 언어
//   + 줄을 구분하는 evt·route·outcome, 우리 오류 코드(SAFEHOUR_*), 처리 시간(ms)
//   + 관광공사 실패 분류(upstream, 닫힌 목록: SELF_LIMIT·QUOTA·AUTH·UPSTREAM_ERROR·PARSE·NETWORK)
// 남기지 않는 것
//   좌표, 날짜, 장소 이름, 주소, 조건 값, 계정 키, 병원 정보, 기간·숙소 id, 외부 오류 원문·URL·키
//
// 설계 — 허용 목록
//   호출자가 무엇을 넘기든 buildDecisionLogEntry 가 조립한 필드만 나간다. 일정에서는 dayState·reasons·
//   effective[*].provenance[*].source/defaulted 만 읽고, 사유는 닫힌 enum(REASON)을 통과한 값만 남긴다.
//   엔진이 새 필드를 반환해도, 요청 본문이 커져도 로그는 따라 커지지 않는다.
//
// 기록 위치는 stdout 한 줄이다. 파일이나 DB 를 만들지 않는 것은 의도다(서버 저장소 없음, docs/platform/PRODUCT_DEFINITION_V3.md '유지하는 것').

import { REASON, STATE } from '../../src/domain/states.js';
import { ITINERARY_ENGINE_VERSION } from '../../src/engine/tripPlan.js';
import { tourApiUpstreamClass } from '../../src/tour-api/upstream.js';

const KNOWN_REASONS = new Set(Object.values(REASON));
const DAY_STATES = Object.freeze([STATE.NO_TOURISM, STATE.STANDBY, STATE.SPLIT_NEARBY, STATE.TOGETHER]);
const LANGS = new Set(['ko', 'en', 'ja', 'zh']);

/** 로그 줄의 경로 */
export const LOG_ROUTE = Object.freeze({
  PLAN: 'itinerary.plan',
  ALTERNATIVES: 'itinerary.alternatives',
});

/**
 * 판정 결과의 성격. 미추천도 정상 결과이므로 DECIDED 다 — 판정 자체를 하지 못한 경우와 구분하기 위해 나눈다.
 */
export const OUTCOME = Object.freeze({
  /** 엔진이 판정했다 (미추천 포함) */
  DECIDED: 'DECIDED',
  /** 추천 중단 스위치로 판정 없이 응답 */
  PAUSED: 'PAUSED',
  /** 판정 입력을 확보하지 못했거나 엔진이 실패해 안전측으로 응답 */
  FAILED: 'FAILED',
});

function dayList(days) {
  if (Array.isArray(days)) return days;
  if (days && typeof days === 'object') return Object.values(days);
  return [];
}

/**
 * 로그 한 줄을 조립한다. 순수 함수이므로 테스트가 출력을 직접 검사한다.
 * @param {object} args
 * @param {'itinerary.plan'|'itinerary.alternatives'} args.route
 * @param {string} args.outcome  OUTCOME 중 하나
 * @param {Record<string, object>|object[]} [args.days]  응답(또는 교체 대상) DayPlan
 * @param {number} [args.requestedDateCount]
 * @param {string} [args.lang]
 * @param {string} [args.errorCode]  SAFEHOUR_* 만 남는다
 * @param {string} [args.upstream]  관광공사 실패 분류. 닫힌 목록 안의 값만 남는다
 * @param {number} [args.elapsedMs]
 */
export function buildDecisionLogEntry({ route, outcome, days, requestedDateCount, lang, errorCode, upstream, elapsedMs } = {}) {
  const dayStates = Object.fromEntries(DAY_STATES.map((s) => [s, 0]));
  const reasons = new Set();
  const provenance = { SELF: 0, HOSPITAL: 0, DEFAULTED: 0 };

  for (const day of dayList(days)) {
    if (!day || typeof day !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(dayStates, day.dayState)) dayStates[day.dayState] += 1;
    for (const r of Array.isArray(day.reasons) ? day.reasons : []) if (KNOWN_REASONS.has(r)) reasons.add(r);
    const effective = day.effective && typeof day.effective === 'object' ? day.effective : {};
    for (const entry of Object.values(effective)) {
      for (const p of Array.isArray(entry?.provenance) ? entry.provenance : []) {
        if (p?.defaulted === true) provenance.DEFAULTED += 1;
        else if (p?.source === 'SELF') provenance.SELF += 1;
        else if (p?.source === 'HOSPITAL') provenance.HOSPITAL += 1;
      }
    }
  }

  const entry = {
    evt: 'decision',
    route: route === LOG_ROUTE.ALTERNATIVES ? LOG_ROUTE.ALTERNATIVES : LOG_ROUTE.PLAN,
    outcome: OUTCOME[outcome] ?? OUTCOME.DECIDED,
    engine: ITINERARY_ENGINE_VERSION,
    lang: LANGS.has(lang) ? lang : 'unknown',
    dateCount: Number.isInteger(requestedDateCount) && requestedDateCount > 0 ? requestedDateCount : 0,
    dayStates,
    reasons: [...reasons].sort(),
    provenance,
  };

  // 우리가 정의한 오류코드만 남긴다. 외부 오류 원문은 인증키·URL 이 섞일 수 있어 넣지 않는다.
  if (typeof errorCode === 'string' && /^SAFEHOUR_[A-Z_]+$/.test(errorCode)) entry.errorCode = errorCode;
  // 분류는 닫힌 목록의 문자열뿐이라 키·URL 이 섞이지 않는다. 목록 밖 값은 버린다.
  const upstreamClass = tourApiUpstreamClass(upstream);
  if (upstreamClass) entry.upstream = upstreamClass;
  if (Number.isFinite(elapsedMs)) entry.ms = Math.round(elapsedMs);
  return entry;
}

/**
 * 판정 로그를 stdout 에 한 줄 남긴다. 로그 실패가 요청 처리를 막지 않는다 —
 * 관측 때문에 사용자가 일정을 못 받는 일은 없어야 한다.
 */
export function logDecision(args) {
  try {
    process.stdout.write(`${JSON.stringify(buildDecisionLogEntry(args ?? {}))}\n`);
  } catch {
    // 로그는 최선 노력이다. 여기서 throw 하면 판정 결과를 못 돌려준다.
  }
}
