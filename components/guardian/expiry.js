// 보호자 사본 만료 타이머 계산 (순수 함수)
//
// 저장소는 읽을 때 만료된 사본을 치우지만 그 일을 알리지 않는다. 화면을 연 채로 마지막 사본이 만료되면
// '받은 일정' 행·버튼이 남는다(리뷰 M2). 가장 이른 만료 시각 1초 뒤에 한 번 다시 읽게 할 지연을 여기서 정한다.
// 받은 일정 화면(GuardianOpen)과 '사본이 있는가' 훅(cards/useDeviceData)이 같은 계산을 쓴다.

import { parseInstantMs } from '../../src/stay/index.js';

/** setTimeout 이 받는 가장 긴 지연(약 24.8일). 넘기면 바로 불린다 */
export const MAX_TIMER_MS = 2 ** 31 - 1;
const GRACE_MS = 1000;

/**
 * @param {Array<{ expiresAt?: string }>} copies
 * @param {number} nowMs
 * @returns {number | null}  기다릴 ms(1초 이상, 상한 MAX_TIMER_MS). 사본이 없거나 만료 시각을 읽을 수 없으면 null
 */
export function guardianExpiryDelay(copies, nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || !Array.isArray(copies)) return null;
  const times = copies.map((c) => (typeof c?.expiresAt === 'string' ? parseInstantMs(c.expiresAt) : null)).filter((ms) => ms !== null);
  if (times.length === 0) return null;
  return Math.min(Math.max(Math.min(...times) - nowMs + GRACE_MS, GRACE_MS), MAX_TIMER_MS);
}
