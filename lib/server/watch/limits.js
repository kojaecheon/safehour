// 서버 알림 횟수 제한 (ADR-0012 · 계획 작업 2)
//
// 창이 있는 항목은 고정 창 계수기다. 키는 sh:<ns>:r:<rateKey>:<창 번호> 이고, rateKey 는 항목과 주체로 만든
// HMAC 이라 주체(계정 키, watchKey)가 키 이름에 그대로 남지 않는다. 계수기는 창 길이 + 60초 뒤 사라진다.
// 창이 없는 항목(maxWatchesPerOwner 등)은 서비스 함수가 개수를 직접 비교하는 상한이다.

import { rateKeyOf } from './keys.js';

export const WATCH_LIMITS = Object.freeze({
  create: Object.freeze({ limit: 10, windowSec: 3600 }), // 세션(계정)당
  deadlines: Object.freeze({ limit: 60, windowSec: 3600 }), // 지켜보기당
  back: Object.freeze({ limit: 50, windowSec: 86400 }),
  subscribe: Object.freeze({ limit: 10, windowSec: 3600 }),
  status: Object.freeze({ limit: 120, windowSec: 3600 }),
  mute: Object.freeze({ limit: 30, windowSec: 3600 }),
  push: Object.freeze({ limit: 20, windowSec: 86400 }),
  maxWatchesPerOwner: 3,
  maxRegistrations: 5,
  maxDays: 46,
  maxDeadlinesPerDay: 10,
});

/** 한 번 센다. 이번 것이 한도 안이면 true. 저장소 장애는 KvError 를 그대로 던진다 */
export async function hitRate(ctx, bucket, subject) {
  const rule = Object.hasOwn(WATCH_LIMITS, bucket) ? WATCH_LIMITS[bucket] : null;
  if (!rule || typeof rule !== 'object' || !rule.windowSec) throw new TypeError('횟수 제한 항목이 올바르지 않습니다.');
  const window = Math.floor(ctx.now() / (rule.windowSec * 1000));
  const key = ctx.keys.rate(rateKeyOf({ bucket, subject }, ctx.secret), window);
  const [count] = await ctx.kv.exec([
    ['INCR', key],
    ['EXPIRE', key, rule.windowSec + 60],
  ]);
  return Number(count) <= rule.limit;
}
