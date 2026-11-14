// 서버 알림 횟수 제한 (ADR-0012 · 계획 작업 2)
//
// 창이 있는 항목은 고정 창 계수기다. 키는 sh:<ns>:r:<rateKey>:<창 번호> 이고, rateKey 는 항목과 주체로 만든
// HMAC 이라 주체(계정 키, watchKey)가 키 이름에 그대로 남지 않는다. 계수기는 창 길이 + 60초 뒤 사라진다.
// 창이 없는 항목(maxWatchesPerOwner 등)은 서비스 함수가 개수를 직접 비교하는 상한이다.
// 대부분은 hitRate 로 먼저 센다. 보호자 푸시(push)만 보내기 전에 peekRate 로 읽어 보고, 보낸 뒤 countRate 로 센다
// (계획 '설계서와 다르게 정한 것' 15). 읽기와 세기 사이에 다른 요청이 끼면 한도를 조금 넘을 수 있다.

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

/** 항목의 규칙과 지금 창의 계수기 키. 모르는 항목은 TypeError, 주체 형식이 틀리면 rateKeyOf 가 TypeError 를 던진다 */
function windowCounter(ctx, bucket, subject) {
  const rule = Object.hasOwn(WATCH_LIMITS, bucket) ? WATCH_LIMITS[bucket] : null;
  if (!rule || typeof rule !== 'object' || !rule.windowSec) throw new TypeError('횟수 제한 항목이 올바르지 않습니다.');
  const rateKey = rateKeyOf({ bucket, subject }, ctx.secret);
  const window = Math.floor(ctx.now() / (rule.windowSec * 1000));
  return { rule, key: ctx.keys.rate(rateKey, window) };
}

function countCommands(rule, key) {
  return [
    ['INCR', key],
    ['EXPIRE', key, rule.windowSec + 60],
  ];
}

/** 한 번 센다. 이번 것이 한도 안이면 true. 모르는 항목이나 빈 주체는 TypeError, 저장소 장애는 KvError 를 그대로 던진다 */
export async function hitRate(ctx, bucket, subject) {
  // 주체 형식이 틀리면 저장소에 닿기 전에 TypeError 가 난다
  const { rule, key } = windowCounter(ctx, bucket, subject);
  const [count] = await ctx.kv.exec(countCommands(rule, key));
  return Number(count) <= rule.limit;
}

/** 세지 않고 읽기만 한다. 지금 창의 수가 한도보다 작으면(한 번 더 쓸 수 있으면) true. 오류는 hitRate 와 같다 */
export async function peekRate(ctx, bucket, subject) {
  const { rule, key } = windowCounter(ctx, bucket, subject);
  const [count] = await ctx.kv.exec([['GET', key]]);
  return Number(count ?? 0) < rule.limit;
}

/** 결과를 보지 않고 한 번 센다. 키와 만료는 hitRate 와 같다. 오류는 hitRate 와 같다 */
export async function countRate(ctx, bucket, subject) {
  const { rule, key } = windowCounter(ctx, bucket, subject);
  await ctx.kv.exec(countCommands(rule, key));
}
