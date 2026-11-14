// 보호자에게 푸시 보내기 (ADR-0012 · 계획 작업 5)
//
// pushToGuardian: 지켜보기의 지금 구독으로 마감 지남·복귀 확인 알림을 보낸다.
//   구독이 없으면 NO_SUB. 하루 횟수 한도(push)는 보내기 전에 읽기만 해 보고(peekRate) 넘었으면 CAPPED,
//   푸시 서비스가 받았을 때(SENT)만 센다(countRate). 세기가 실패해도 SENT 다(이미 나갔다).
//   푸시 서비스가 GONE 이면 지금 구독을 다시 읽어, 보낸 그 구독일 때만 지우고 GONE 이다. 보내는 사이 새 구독이 들어왔으면
//   지우지 않고 RETRY('404/410')로 바꾼다. 예약 처리가 권리만 돌려놓고 다시 불려 새 구독으로 보내게 하려는 것이다.
//   Topic 은 마감마다 HMAC 으로 만들어 날짜·시각이 푸시 서비스에 그대로 보이지 않는다.
// pushConfirmedOnce: 마감 하나의 복귀 확인 알림을 k: 권리로 한 번만 보낸다. '돌아왔어요'(patient.js)와
//   예약 처리(due.js)가 함께 쓴다. 누가 먼저 오든 한쪽만 보낸다.
// pushToSubscription: 이미 읽어 둔 구독 하나에 기기 바뀜 알림만 보낸다(구독을 바꿀 때 이전 기기로).
//   횟수 제한·Topic 이 없고 결과로 아무것도 지우지 않는다. 지금 구독은 이미 새 기기 것이기 때문이다.
//
// 푸시 어댑터(ctx.push.send)는 약속상 던지지 않지만, 던지면 RETRY 'network' 로 본다.
// pushConfirmedOnce 는 RETRY 도 FAILED 로 끝낸다(복귀 확인 알림은 한 번만 시도한다).
// 저장소 장애(KvError)는 보내기 전이나 GONE 뒤에만 던진다. SENT 뒤에는 던지지 않는다.
// 결과에는 outcome 과 statusClass 만 담는다.

import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { DAY_FIELD, claimDayField, clearDayField, deleteSub, readSub } from './records.js';
import { idMatches, topicOf } from './keys.js';
import { countRate, peekRate } from './limits.js';
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
  if (!(await peekRate(ctx, 'push', watchKey))) return { outcome: 'CAPPED' };
  const payload = pushPayload(kind, { date, time, lang: sub.lang }, ctx.reviewed);
  if (payload === null) return REJECTED();
  const result = await sendOnce(ctx, {
    subscription: subscriptionOf(sub),
    payload,
    topic: topicOf({ watchKey, date, time }, ctx.secret),
  });
  if (result.outcome === 'SENT') {
    try {
      await countRate(ctx, 'push', watchKey);
    } catch {
      // 푸시는 이미 나갔다. 세지 못한 한 건은 한도를 조금 넘기게 할 뿐이라 결과를 바꾸지 않는다
    }
    return result;
  }
  if (result.outcome === 'GONE') {
    // 보내는 사이 보호자가 새로 구독했을 수 있다. 지금 구독이 보낸 그 구독일 때만 지운다.
    // 다른 구독이면 지우지 않고, 새 구독으로 다시 보내도록 RETRY 로 알린다(구독 다시 걸기는 보내는 중인 마감을 건너뛰었다)
    const current = await readSub(ctx, watchKey);
    if (current && !idMatches(current.subId, sub.subId)) return { outcome: 'RETRY', statusClass: '404/410' };
    if (current) await deleteSub(ctx, watchKey);
  }
  return result;
}

/**
 * 마감 하나의 복귀 확인 알림을 한 번만 보낸다. k:<time> 권리를 얻은 쪽만 보내고, 결과와 무관하게 권리는 그대로 둔다
 * (복귀 확인 알림은 한 번만 시도한다). 보내기 전 저장소 장애로 던지면 알림은 나가지 않은 것이라 권리를 돌려놓고
 * 다시 던진다. 마감 지남 푸시가 나갔는지(p: 가 's')는 부르는 쪽이 확인한다.
 * @returns {Promise<'SENT'|'SKIP'|'FAILED'>}  SKIP 은 권리를 이미 누가 썼음, FAILED 는 보냈지만 SENT 가 아님
 */
export async function pushConfirmedOnce(ctx, watchKey, date, time) {
  const closedField = DAY_FIELD.closed(time);
  if (!(await claimDayField(ctx, watchKey, date, closedField))) return 'SKIP';
  let sent;
  try {
    sent = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.CONFIRMED, date, time });
  } catch (err) {
    // 돌려놓기마저 실패하면 원래 오류만 알린다
    try {
      await clearDayField(ctx, watchKey, date, closedField);
    } catch {
      // 원래 오류를 던진다
    }
    throw err;
  }
  return sent?.outcome === 'SENT' ? 'SENT' : 'FAILED';
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
