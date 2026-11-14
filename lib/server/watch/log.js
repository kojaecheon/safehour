// 서버 알림 기록 한 줄 (ADR-0012 · 설계서 5.4 · 계획 작업 8 '정한 값')
//
// 요청 하나에 stdout 한 줄: { evt: 'watch', route, outcome, errorCode?, ms?, counts? }
//   route     WATCH_ROUTE 의 값. 목록 밖은 'watch.unknown'
//   outcome   OK·REJECTED·NOT_FOUND·LIMITED·OFF·FAILED 와 예약 처리 판정(DUE_OUTCOME)의 값. 목록 밖은 FAILED
//   errorCode /^SAFEHOUR_[A-Z_]+$/ 에 맞는 우리 오류 코드만
//   ms        처리 시간(반올림한 음이 아닌 정수)
//   counts    watches·armed·failed·deleted·partial(음이 아닌 정수)와 push(푸시 서비스 응답 구간)만.
//             partial 은 하루 1회 예약이 시간 예산 때문에 중간에 멈췄을 때만 1 로 남는다
//
// 남기지 않는 것: watchId, 저장 키, ownerHash, subId, writeToken, endpoint 주소와 호스트, 날짜, 시각, 언어,
// 계정 키, 푸시 서비스 응답 원문, 저장소 주소와 토큰, 예약 메시지 id, IP, User-Agent.
// 설계: 호출자가 무엇을 넘기든 buildWatchLogEntry 가 위 필드만 새로 만든다. 받은 객체를 펼쳐 쓰지 않는다.

import { DUE_OUTCOME } from './due.js';

/** 기록의 경로 구분 (닫힌 목록) */
export const WATCH_ROUTE = Object.freeze({
  PUSH_CONFIG: 'push.config',
  REGISTER: 'watch.register',
  REMOVE: 'watch.remove',
  DEADLINES: 'watch.deadlines',
  BACK: 'watch.back',
  SUBSCRIBE: 'watch.subscribe',
  UNSUBSCRIBE: 'watch.unsubscribe',
  STATUS: 'watch.status',
  MUTE: 'watch.mute',
  DUE: 'watch.due',
  CRON: 'watch.cron',
});

/** 처리기의 결과 구분. 예약 처리는 판정표의 outcome 을 그대로 쓴다 */
export const WATCH_OUTCOME = Object.freeze({
  OK: 'OK',
  REJECTED: 'REJECTED',
  NOT_FOUND: 'NOT_FOUND',
  LIMITED: 'LIMITED',
  OFF: 'OFF',
  FAILED: 'FAILED',
});

const UNKNOWN_ROUTE = 'watch.unknown';
const ROUTES = new Set(Object.values(WATCH_ROUTE));
const OUTCOMES = new Set([...Object.values(WATCH_OUTCOME), ...Object.values(DUE_OUTCOME)]);
const COUNT_KEYS = Object.freeze(['watches', 'armed', 'failed', 'deleted', 'partial']);
const PUSH_CLASSES = new Set(['2xx', '404/410', '4xx', '5xx', 'network']);
const ERROR_CODE_RE = /^SAFEHOUR_[A-Z_]+$/;

const isCount = (value) => Number.isInteger(value) && value >= 0;

/** counts 에서 정해진 키만 옮긴다. 남는 것이 없으면 null */
function pickCounts(counts) {
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) return null;
  const out = {};
  for (const key of COUNT_KEYS) {
    if (Object.hasOwn(counts, key) && isCount(counts[key])) out[key] = counts[key];
  }
  if (Object.hasOwn(counts, 'push') && PUSH_CLASSES.has(counts.push)) out.push = counts.push;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 기록 한 줄을 조립한다. 순수 함수라 테스트가 결과를 직접 본다.
 * @param {{ route?: string, outcome?: string, errorCode?: string, elapsedMs?: number,
 *           counts?: { watches?: number, armed?: number, failed?: number, deleted?: number, partial?: number, push?: string } }} [args]
 */
export function buildWatchLogEntry({ route, outcome, errorCode, elapsedMs, counts } = {}) {
  const entry = {
    evt: 'watch',
    route: ROUTES.has(route) ? route : UNKNOWN_ROUTE,
    outcome: OUTCOMES.has(outcome) ? outcome : WATCH_OUTCOME.FAILED,
  };
  if (typeof errorCode === 'string' && ERROR_CODE_RE.test(errorCode)) entry.errorCode = errorCode;
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) entry.ms = Math.round(elapsedMs);
  const picked = pickCounts(counts);
  if (picked) entry.counts = picked;
  return entry;
}

/** stdout 에 한 줄 남긴다. 기록 실패가 요청 처리를 막지 않는다 */
export function logWatch(args) {
  try {
    process.stdout.write(`${JSON.stringify(buildWatchLogEntry(args ?? {}))}\n`);
  } catch {
    // 기록은 최선 노력이다. 여기서 던지면 응답을 못 돌려준다
  }
}
