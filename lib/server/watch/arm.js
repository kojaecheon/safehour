// 예약 걸기 (ADR-0012 · 계획 작업 5 · 설계서 4.2 '예약 걸기 규칙')
//
// 마감마다 예약 처리 경로(/api/watch/due)를 마감 + 유예(10분)에 한 번 깨우는 예약을 건다.
//   - 이미 건 시각(a:), 이미 보낸 시각(p:), 늦은 한도(마감 + 60분)가 지난 시각은 걸지 않는다.
//   - 보낼 시각이 이미 지났으면 지금으로 건다.
//   - 예약 업체가 실패하면 기록하지 않고 failed 로 센다. 다음 업로드나 하루 1회 예약이 다시 건다.
//   - 중복 제거 id 는 마감마다 같은 머리(dedupIdOf) 뒤에 예약마다 다른 무작위 꼬리를 붙인다. QStash 중복 제거는
//     취소한 메시지에도 10분 동안 걸려, 뺐다가 곧 다시 넣은 마감의 새 예약이 삼켜질 수 있기 때문이다.
//     같은 마감이 두 번 나가지 않게 하는 것은 a: 표시와 예약 처리의 HSETNX 권리(due.js)가 맡는다.
//
// 예약 어댑터는 약속상 던지지 않지만, 던지면 실패로 센다. 저장소 장애(KvError)는 그대로 던진다.
// 시각 계산은 src/stay/time.js 도우미로만, 시계는 ctx.now() 로만 읽는다.

import { randomBytes } from 'node:crypto';
import { DEFAULTS } from '../../../src/stay/defaults.js';
import { isDateString, kstInstantMs } from '../../../src/stay/time.js';
import { KvError } from './kv.js';
import { dedupIdOf } from './keys.js';
import { DAY_FIELD, dropIndexMember, indexMembers, readDay, readDays, setDayField } from './records.js';

const MIN_MS = 60 * 1000;

/** 보낼 시각: 마감 + serverPushGraceMin 분 */
export function fireAtMs(date, time) {
  return kstInstantMs(date, time) + DEFAULTS.notifications.serverPushGraceMin * MIN_MS;
}

/** 늦은 한도: 마감 + returnPassedGraceMin 분. 이 순간부터는 걸지도 보내지도 않는다 */
export function lateLimitMs(date, time) {
  return kstInstantMs(date, time) + DEFAULTS.notifications.returnPassedGraceMin * MIN_MS;
}

function uniqueDates(dates) {
  return [...new Set(Array.isArray(dates) ? dates : [])].filter(isDateString);
}

/** 날짜 기록 하나의 걸리지 않은 마감에 예약을 건다. tally 의 armed·failed 를 늘린다 */
async function armDay(ctx, watchKey, date, day, tally) {
  for (const t of day.deadlines) {
    if (Object.hasOwn(day.armed, t) || day.pushed.includes(t)) continue;
    const now = ctx.now();
    if (now >= lateLimitMs(date, t)) continue;
    let res = null;
    try {
      res = await ctx.scheduler.schedule({
        body: { k: watchKey, d: date, t },
        notBeforeMs: Math.max(fireAtMs(date, t), now),
        dedupId: `${dedupIdOf({ watchKey, date, time: t }, ctx.secret)}.${randomBytes(6).toString('base64url')}`,
      });
    } catch {
      res = null;
    }
    if (res?.ok === true && typeof res.messageId === 'string' && res.messageId !== '') {
      await setDayField(ctx, watchKey, date, DAY_FIELD.armed(t), res.messageId);
      tally.armed += 1;
    } else {
      tally.failed += 1;
    }
  }
}

/**
 * 지켜보기 하나의 주어진 날짜들에 걸리지 않은 예약을 건다.
 * @returns {Promise<{ armed: number, failed: number }>}
 */
export async function armPending(ctx, watchKey, dates) {
  const tally = { armed: 0, failed: 0 };
  const list = uniqueDates(dates);
  if (list.length === 0) return tally;
  const days = await readDays(ctx, watchKey, list);
  for (const date of list) {
    const day = days.get(date);
    if (day) await armDay(ctx, watchKey, date, day, tally);
  }
  return tally;
}

/** 예약을 취소한다. 예약 업체가 실패하거나 던져도 던지지 않는다(남은 예약은 예약 처리가 SKIP_CHANGED 로 넘긴다) */
export async function cancelMessages(ctx, messageIds) {
  const ids = [...new Set(Array.isArray(messageIds) ? messageIds : [])].filter((id) => typeof id === 'string' && id !== '');
  await Promise.allSettled(ids.map(async (id) => ctx.scheduler.cancel(id)));
}

/**
 * 하루 1회 예약: 날짜 색인의 지켜보기마다 걸리지 않은 예약을 건다. 날짜 기록이 사라진 항목은 색인에서 뺀다.
 * 한 지켜보기의 예상 못 한 오류는 failed 로 세고 다음으로 넘어간다. 저장소 장애(KvError)는 그대로 던진다.
 * watches 는 날짜 기록이 살아 있던 지켜보기의 수(서로 다른 watchKey)다.
 * @returns {Promise<{ watches: number, armed: number, failed: number }>}
 */
export async function armIndexedDates(ctx, dates) {
  const tally = { armed: 0, failed: 0 };
  const seen = new Set();
  for (const date of uniqueDates(dates)) {
    for (const watchKey of await indexMembers(ctx, date)) {
      const day = await readDay(ctx, watchKey, date);
      if (!day) {
        await dropIndexMember(ctx, date, watchKey);
        continue;
      }
      seen.add(watchKey);
      try {
        await armDay(ctx, watchKey, date, day, tally);
      } catch (err) {
        if (err instanceof KvError) throw err;
        tally.failed += 1;
      }
    }
  }
  return { watches: seen.size, armed: tally.armed, failed: tally.failed };
}
