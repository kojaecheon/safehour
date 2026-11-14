// 보호자에게 푸시 보내기 (ADR-0012 · 계획 작업 5)
//
// pushToGuardian: 지켜보기의 지금 구독으로 마감 지남·복귀 확인 알림을 보낸다.
//   구독이 없으면 NO_SUB, 하루 횟수 한도(push)를 넘으면 CAPPED. 푸시 서비스가 GONE 이면 구독을 지운다.
//   Topic 은 마감마다 HMAC 으로 만들어 날짜·시각이 푸시 서비스에 그대로 보이지 않는다.
// pushToSubscription: 이미 읽어 둔 구독 하나에 기기 바뀜 알림만 보낸다(구독을 바꿀 때 이전 기기로).
//   횟수 제한·Topic 이 없고 결과로 아무것도 지우지 않는다. 지금 구독은 이미 새 기기 것이기 때문이다.
//
// 푸시 어댑터(ctx.push.send)는 약속상 던지지 않지만, 던지면 RETRY 'network' 로 본다.
// 저장소 장애(KvError)는 잡지 않고 그대로 던진다. 결과에는 outcome 과 statusClass 만 담는다.

import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { deleteSub, readSub } from './records.js';
import { idMatches, topicOf } from './keys.js';
import { hitRate } from './limits.js';
import { PUSH_KIND, pushPayload } from './text.js';

const SEND_OUTCOMES = new Set(['SENT', 'GONE', 'RETRY', 'REJECTED']);
const STATUS_CLASSES = new Set(['2xx', '404/410', '4xx', '5xx', 'network']);

const NO_SUB = () => ({ outcome: 'NO_SUB' });
const REJECTED = () => ({ outcome: 'REJECTED' });

/** 구독 원문 중 보내는 데 필요한 세 값만 넘긴다 */
function subscriptionOf(sub) {
  return { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth };
}

/** 어댑터 결과를 닫힌 값으로 좁힌다. 던지면 RETRY, 모르는 결과는 다시 부르지 않게 REJECTED */
async function sendOnce(ctx, message) {
  let res;
  try {
    res = await ctx.push.send(message);
  } catch {
    return { outcome: 'RETRY', statusClass: 'network' };
  }
  const out = { outcome: SEND_OUTCOMES.has(res?.outcome) ? res.outcome : 'REJECTED' };
  if (STATUS_CLASSES.has(res?.statusClass)) out.statusClass = res.statusClass;
  return out;
}

/**
 * @param {object} ctx  WatchCtx
 * @param {string} watchKey
 * @param {{ kind: 'OVERDUE'|'CONFIRMED', date: string, time: string }} input
 * @returns {Promise<{ outcome: 'SENT'|'GONE'|'RETRY'|'REJECTED'|'NO_SUB'|'CAPPED', statusClass?: string }>}
 */
export async function pushToGuardian(ctx, watchKey, { kind, date, time } = {}) {
  // 기기 바뀜 알림은 pushToSubscription 으로만 보낸다. 문구를 못 만드는 입력은 저장소에 닿기 전에 거른다
  if (kind !== PUSH_KIND.OVERDUE && kind !== PUSH_KIND.CONFIRMED) return REJECTED();
  if (!isDateString(date) || !isClockTime(time)) return REJECTED();
  const sub = await readSub(ctx, watchKey);
  if (!sub) return NO_SUB();
  if (!(await hitRate(ctx, 'push', watchKey))) return { outcome: 'CAPPED' };
  const payload = pushPayload(kind, { date, time, lang: sub.lang }, ctx.reviewed);
  if (payload === null) return REJECTED();
  const result = await sendOnce(ctx, {
    subscription: subscriptionOf(sub),
    payload,
    topic: topicOf({ watchKey, date, time }, ctx.secret),
  });
  if (result.outcome === 'GONE') {
    // 보내는 사이 보호자가 새로 구독했을 수 있다. 지금 구독이 보낸 그 구독일 때만 지운다
    const current = await readSub(ctx, watchKey);
    if (current && idMatches(current.subId, sub.subId)) await deleteSub(ctx, watchKey);
  }
  return result;
}

/**
 * @param {object} ctx  WatchCtx
 * @param {{ endpoint: string, p256dh: string, auth: string, lang: string } | null} sub  readSub 결과
 * @param {{ kind: 'DEVICE_CHANGED' }} input
 * @returns {Promise<{ outcome: 'SENT'|'GONE'|'RETRY'|'REJECTED'|'NO_SUB', statusClass?: string }>}
 */
export async function pushToSubscription(ctx, sub, { kind } = {}) {
  if (kind !== PUSH_KIND.DEVICE_CHANGED) return REJECTED();
  if (!sub) return NO_SUB();
  const payload = pushPayload(kind, { lang: sub.lang }, ctx.reviewed);
  if (payload === null) return REJECTED();
  return sendOnce(ctx, { subscription: subscriptionOf(sub), payload });
}
