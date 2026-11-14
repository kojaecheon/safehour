// 예약 처리 판정표 (ADR-0012 · 계획 작업 5 · 설계서 4.3)
//
// 예약 하나({ watchKey, date, time })가 도착하면 그 마감의 보호자 푸시를 보낼지 정한다.
// 부를 때마다 저장소에서 새로 읽고, 아래 표를 위에서부터 보아 처음 맞는 줄이 결과다.
//
//   ctx.enabled 가 거짓                       SKIP_OFF        retry false
//   지켜보기 없음                             SKIP_NO_WATCH   retry false
//   날짜 기록이 없거나 time 이 마감 목록에 없음  SKIP_CHANGED    retry false
//   확인됨(c:)                                SKIP_CONFIRMED  retry false
//   오늘 함께 있음(m)                          SKIP_MUTED      retry false
//   now < 보낼 시각 − 30초                     SKIP_EARLY      retry false
//   now >= 늦은 한도                           SKIP_LATE       retry false
//   구독 없음                                 SKIP_NO_SUB     retry false
//   보낼 권리(HSETNX p:) 를 못 얻음             SKIP_DUP        retry false
//   pushToGuardian → SENT                     SENT            retry false
//                  → CAPPED                   SKIP_CAP        retry false
//                  → GONE                     SUB_GONE        retry false
//                  → NO_SUB                   SKIP_NO_SUB     retry false
//                  → RETRY                    RETRY           retry true   (그 전에 권리를 돌려놓는다)
//                  → REJECTED                 SEND_REJECTED   retry false
//
// 판정은 '확인이 있었는가'만 본다. 의료 판단을 하지 않고, 문구는 '확인이 없다'는 사실만 쓴다(text.js).
// 저장소 장애(KvError)는 잡지 않고 던진다(처리기가 503 으로 바꿔 예약 업체가 다시 부른다).
// 권리를 얻은 뒤 pushToGuardian 이 저장소 장애로 던지면 푸시는 나가지 않은 것이라 권리를 돌려놓고 다시 던진다.
// 결과에는 outcome·retry·statusClass 만 담는다. watchKey·날짜·시각을 담지 않는다.

import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { WATCH_KEY_RE } from './keys.js';
import { DAY_FIELD, claimDayField, clearDayField, readDay, readSub, readWatch } from './records.js';
import { fireAtMs, lateLimitMs } from './arm.js';
import { pushToGuardian } from './notify.js';
import { PUSH_KIND } from './text.js';

export const DUE_OUTCOME = Object.freeze({
  SENT: 'SENT',
  SKIP_OFF: 'SKIP_OFF',
  SKIP_NO_WATCH: 'SKIP_NO_WATCH',
  SKIP_CHANGED: 'SKIP_CHANGED',
  SKIP_CONFIRMED: 'SKIP_CONFIRMED',
  SKIP_MUTED: 'SKIP_MUTED',
  SKIP_EARLY: 'SKIP_EARLY',
  SKIP_LATE: 'SKIP_LATE',
  SKIP_NO_SUB: 'SKIP_NO_SUB',
  SKIP_DUP: 'SKIP_DUP',
  SKIP_CAP: 'SKIP_CAP',
  SUB_GONE: 'SUB_GONE',
  RETRY: 'RETRY',
  SEND_REJECTED: 'SEND_REJECTED',
});

/** 예약이 보낼 시각보다 이만큼 일찍 와도 받는다(예약 업체의 시계 차이) */
const EARLY_TOLERANCE_MS = 30 * 1000;

/** pushToGuardian 결과 → 판정표의 outcome */
const SEND_RESULT = Object.freeze({
  SENT: DUE_OUTCOME.SENT,
  CAPPED: DUE_OUTCOME.SKIP_CAP,
  GONE: DUE_OUTCOME.SUB_GONE,
  NO_SUB: DUE_OUTCOME.SKIP_NO_SUB,
  RETRY: DUE_OUTCOME.RETRY,
  REJECTED: DUE_OUTCOME.SEND_REJECTED,
});

const skip = (outcome) => ({ outcome, retry: false });

/**
 * @param {object} ctx  WatchCtx
 * @param {{ watchKey: string, date: string, time: string }} input  예약 본문 { k, d, t }
 * @returns {Promise<{ outcome: string, retry: boolean, statusClass?: string }>}
 */
export async function processDue(ctx, { watchKey, date, time } = {}) {
  if (ctx.enabled !== true) return skip(DUE_OUTCOME.SKIP_OFF);

  // 형식이 틀린 값은 저장소에 묻지 않고 같은 줄의 결과로 본다(처리기의 본문 검증 뒤라 보통은 생기지 않는다)
  if (typeof watchKey !== 'string' || !WATCH_KEY_RE.test(watchKey)) return skip(DUE_OUTCOME.SKIP_NO_WATCH);
  if (!(await readWatch(ctx, watchKey))) return skip(DUE_OUTCOME.SKIP_NO_WATCH);

  if (!isDateString(date) || !isClockTime(time)) return skip(DUE_OUTCOME.SKIP_CHANGED);
  const day = await readDay(ctx, watchKey, date);
  if (!day || !day.deadlines.includes(time)) return skip(DUE_OUTCOME.SKIP_CHANGED);
  if (day.confirmed.includes(time)) return skip(DUE_OUTCOME.SKIP_CONFIRMED);
  if (day.muted) return skip(DUE_OUTCOME.SKIP_MUTED);

  const now = ctx.now();
  if (now < fireAtMs(date, time) - EARLY_TOLERANCE_MS) return skip(DUE_OUTCOME.SKIP_EARLY);
  if (now >= lateLimitMs(date, time)) return skip(DUE_OUTCOME.SKIP_LATE);

  if (!(await readSub(ctx, watchKey))) return skip(DUE_OUTCOME.SKIP_NO_SUB);

  const pushedField = DAY_FIELD.pushed(time);
  if (!(await claimDayField(ctx, watchKey, date, pushedField))) return skip(DUE_OUTCOME.SKIP_DUP);

  let sent;
  try {
    sent = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date, time });
  } catch (err) {
    // 구독 읽기·횟수 세기·구독 지우기 중 저장소 장애다. 이 경우 푸시는 나가지 않았으므로 권리를 돌려놓는다.
    // 돌려놓기마저 실패하면 원래 오류만 알린다
    try {
      await clearDayField(ctx, watchKey, date, pushedField);
    } catch {
      // 원래 오류를 던진다
    }
    throw err;
  }

  const outcome = Object.hasOwn(SEND_RESULT, sent?.outcome) ? SEND_RESULT[sent.outcome] : DUE_OUTCOME.SEND_REJECTED;
  const result = { outcome, retry: outcome === DUE_OUTCOME.RETRY };
  if (outcome === DUE_OUTCOME.RETRY) await clearDayField(ctx, watchKey, date, pushedField);
  if (typeof sent?.statusClass === 'string') result.statusClass = sent.statusClass;
  return result;
}
