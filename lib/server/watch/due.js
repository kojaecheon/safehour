// 예약 처리 판정표 (ADR-0012 · 계획 작업 5 · 설계서 4.3 · 계획 '설계서와 다르게 정한 것' 11~14)
//
// 예약 하나({ watchKey, date, time })가 도착하면 그 마감의 보호자 푸시를 보낼지 정한다.
// 부를 때마다 저장소에서 새로 읽고, 아래 표를 위에서부터 보아 처음 맞는 줄이 결과다.
// '걸림 지움'은 a:<시각>(예약 메시지 id)을 지운다는 뜻이다. 아무 일도 하지 않고 끝난 예약의 표시를 지워
// 다음 업로드, 하루 1회 예약, 보호자 구독, '오늘 함께 있음' 끄기가 그 마감을 다시 걸 수 있게 한다.
// '권리 돌려놓음'은 p:<시각>을 지운다는 뜻이다. 보내지 못했으면 보냄 표시를 남기지 않는다.
// retry 의 '다시 읽음'은 걸림을 지우는 같은 exec 에서 이유(구독, 함께 있음, 마감 목록)를 다시 읽어, 이유가 그새 사라졌으면 true 다.
// 다시 걸기(구독, 함께 있음 끄기, 업로드)는 바꾼 뒤에 a: 를 읽으므로, 지우기 전의 a: 를 보고 건너뛰었다면 여기서 바뀐 값을 본다.
// 그때는 예약 업체가 같은 예약을 다시 부르게 해 마감을 잃지 않는다. 다시 걸기도 예약을 걸었으면 HSETNX 권리가 한쪽만 보내게 한다.
//
//   ctx.enabled 가 거짓                             SKIP_OFF        false
//   watchKey 형식이 틀림, 지켜보기 없음               SKIP_NO_WATCH   false
//   날짜·시각 형식이 틀림, date > 출국일              SKIP_CHANGED    false
//   날짜 기록 없음                                   SKIP_CHANGED    false
//   time 이 마감 목록에 없음                         SKIP_CHANGED    다시 읽음(목록에 time)   걸림 지움
//   now < 보낼 시각 - 30초                           SKIP_EARLY      true
//   확인됨(c:)                                      SKIP_CONFIRMED  false
//   오늘 함께 있음(m)                                SKIP_MUTED      다시 읽음(m 없음)        걸림 지움
//   now >= 늦은 한도                                 SKIP_LATE       false
//   구독 없음                                       SKIP_NO_SUB     다시 읽음(구독 키 있음)  걸림 지움
//   보낼 권리(HSETNX p: '1')를 못 얻음                SKIP_DUP        false
//   권리를 얻은 같은 exec 에서 다시 읽은 날짜 기록이
//     마감 목록에 time 이 없음                       SKIP_CHANGED    다시 읽음(목록에 time)   권리 돌려놓음, 걸림 지움
//     확인됨                                        SKIP_CONFIRMED  false                    권리 돌려놓음
//     오늘 함께 있음                                 SKIP_MUTED      다시 읽음(m 없음)        권리 돌려놓음, 걸림 지움
//   pushToGuardian → SENT                           SENT            false                    p: 를 's' 로
//                  → NO_SUB                         SKIP_NO_SUB     다시 읽음(구독 키 있음)  권리 돌려놓음, 걸림 지움
//                  → GONE                           SUB_GONE        다시 읽음(구독 키 있음)  권리 돌려놓음, 걸림 지움
//                  → RETRY                          RETRY           true                     권리 돌려놓음
//                    (보내는 사이 새 구독이 들어와 GONE 을 RETRY 로 바꾼 경우 포함, notify.js)
//                  → CAPPED                         SKIP_CAP        false                    권리 돌려놓음(걸림은 남겨 업로드가 되풀이해 걸지 않게)
//                  → REJECTED                       SEND_REJECTED   false                    권리 돌려놓음
//
// 일찍 온 예약은 확인 여부보다 먼저 본다. 확인됨으로 끝내면 걸림 표시가 남은 채 예약을 써 버려, 보낼 시각 전에 확인을
// 되돌리면 그 마감이 다시 걸리지도 나가지도 않는다. 날짜·마감 목록 확인은 그보다 앞이라, 빠진 마감은 일찍 와도 걸림을 지운다.
//
// SENT 뒤: p: 를 's' 로 쓰는 같은 exec 에서 날짜 기록을 다시 읽는다. 그 사이 확인(c:)이 들어왔으면 복귀 확인 알림을
// pushConfirmedOnce(k: 권리)로 보낸다. '돌아왔어요'는 c: 를 쓴 뒤 p: 를 읽으므로 둘 중 한쪽은 반드시 다른 쪽을 본다.
// SENT 뒤의 저장소 실패는 던지지 않고 SENT 로 끝낸다(푸시는 이미 나갔다).
//
// 판정은 '확인이 있었는가'만 본다. 의료 판단을 하지 않고, 문구는 '확인이 없다'는 사실만 쓴다(text.js).
// 저장소 장애(KvError)는 SENT 뒤가 아니면 잡지 않고 던진다(처리기가 503 으로 바꿔 예약 업체가 다시 부른다).
// 권리를 얻은 뒤 pushToGuardian 이 저장소 장애로 던지면 푸시는 나가지 않은 것이라 권리를 돌려놓고 다시 던진다.
// 결과에는 outcome·retry·statusClass 만 담는다. watchKey·날짜·시각을 담지 않는다.

import { isClockTime, isDateString } from '../../../src/stay/time.js';
import { WATCH_KEY_RE } from './keys.js';
import {
  DAY_FIELD,
  claimAndReadDay,
  clearArmedAndReadDay,
  clearArmedAndReadSubExists,
  clearDayField,
  markSentAndReadDay,
  readDay,
  readSub,
  readWatch,
} from './records.js';
import { EARLY_TOLERANCE_MS, fireAtMs, lateLimitMs } from './arm.js';
import { pushConfirmedOnce, pushToGuardian } from './notify.js';
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

/** 보내지 못한 pushToGuardian 결과 → 판정표의 outcome 과 걸림 표시를 지울지(지우는 둘은 구독이 이유다) */
const NOT_SENT = Object.freeze({
  NO_SUB: Object.freeze({ outcome: DUE_OUTCOME.SKIP_NO_SUB, clearArmed: true }),
  GONE: Object.freeze({ outcome: DUE_OUTCOME.SUB_GONE, clearArmed: true }),
  RETRY: Object.freeze({ outcome: DUE_OUTCOME.RETRY, clearArmed: false }),
  CAPPED: Object.freeze({ outcome: DUE_OUTCOME.SKIP_CAP, clearArmed: false }),
  REJECTED: Object.freeze({ outcome: DUE_OUTCOME.SEND_REJECTED, clearArmed: false }),
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
  const watch = await readWatch(ctx, watchKey);
  if (!watch) return skip(DUE_OUTCOME.SKIP_NO_WATCH);

  if (!isDateString(date) || !isClockTime(time)) return skip(DUE_OUTCOME.SKIP_CHANGED);
  // 출국일 뒤 날짜의 예약은 건너뛴다(계획 13). 날짜 문자열은 사전 순서가 날짜 순서다
  if (date > watch.expiresOn) return skip(DUE_OUTCOME.SKIP_CHANGED);
  const day = await readDay(ctx, watchKey, date);
  if (!day) return skip(DUE_OUTCOME.SKIP_CHANGED);

  const pushedField = DAY_FIELD.pushed(time);
  // 걸림 표시를 지우는 셋. 지운 같은 exec 에서 이유를 다시 읽는다. alsoPushed 면 권리도 같은 HDEL 로 돌려놓는다
  // (권리를 먼저 따로 지우면 그 사이 다시 걸기가 '보내는 중'을 보고 건너뛸 수 있다)
  const clearChanged = async (alsoPushed) => {
    const after = await clearArmedAndReadDay(ctx, watchKey, date, time, { alsoPushed });
    return { outcome: DUE_OUTCOME.SKIP_CHANGED, retry: after !== null && after.deadlines.includes(time) };
  };
  const clearMuted = async (alsoPushed) => {
    const after = await clearArmedAndReadDay(ctx, watchKey, date, time, { alsoPushed });
    return { outcome: DUE_OUTCOME.SKIP_MUTED, retry: after !== null && !after.muted };
  };
  const clearNoSub = async (outcome, alsoPushed) => ({
    outcome,
    retry: await clearArmedAndReadSubExists(ctx, watchKey, date, time, { alsoPushed }),
  });
  const release = async (outcome) => {
    await clearDayField(ctx, watchKey, date, pushedField);
    return skip(outcome);
  };

  if (!day.deadlines.includes(time)) return clearChanged(false);

  const now = ctx.now();
  // 일찍 온 예약은 다시 부르게 한다. 걸림 표시가 남아 있어 다른 경로가 다시 걸지 않기 때문이다(계획 12)
  if (now < fireAtMs(date, time) - EARLY_TOLERANCE_MS) return { outcome: DUE_OUTCOME.SKIP_EARLY, retry: true };
  if (day.confirmed.includes(time)) return skip(DUE_OUTCOME.SKIP_CONFIRMED);
  if (day.muted) return clearMuted(false);
  if (now >= lateLimitMs(date, time)) return skip(DUE_OUTCOME.SKIP_LATE);

  if (!(await readSub(ctx, watchKey))) return clearNoSub(DUE_OUTCOME.SKIP_NO_SUB, false);

  // 권리를 얻는 같은 exec 에서 다시 읽는다. 앞에서 읽은 뒤 들어온 확인·함께 있음·마감 변경을 놓치지 않는다
  const claim = await claimAndReadDay(ctx, watchKey, date, pushedField);
  if (!claim.claimed) return skip(DUE_OUTCOME.SKIP_DUP);
  const fresh = claim.day;
  if (!fresh || !fresh.deadlines.includes(time)) return clearChanged(true);
  if (fresh.confirmed.includes(time)) return release(DUE_OUTCOME.SKIP_CONFIRMED);
  if (fresh.muted) return clearMuted(true);

  let sent;
  try {
    sent = await pushToGuardian(ctx, watchKey, { kind: PUSH_KIND.OVERDUE, date, time });
  } catch (err) {
    // 구독 읽기·횟수 보기·구독 지우기 중 저장소 장애다. 이 경우 푸시는 나가지 않았으므로 권리를 돌려놓는다.
    // 돌려놓기마저 실패하면 원래 오류만 알린다
    try {
      await clearDayField(ctx, watchKey, date, pushedField);
    } catch {
      // 원래 오류를 던진다
    }
    throw err;
  }

  const statusClass = typeof sent?.statusClass === 'string' ? { statusClass: sent.statusClass } : {};
  if (sent?.outcome === 'SENT') {
    await afterSent(ctx, watchKey, date, time);
    return { outcome: DUE_OUTCOME.SENT, retry: false, ...statusClass };
  }
  // 모르는 결과는 다시 부르지 않게 REJECTED 로 본다
  const mapped = Object.hasOwn(NOT_SENT, sent?.outcome) ? NOT_SENT[sent.outcome] : NOT_SENT.REJECTED;
  if (mapped.clearArmed) return { ...(await clearNoSub(mapped.outcome, true)), ...statusClass };
  await release(mapped.outcome);
  return { outcome: mapped.outcome, retry: mapped.outcome === DUE_OUTCOME.RETRY, ...statusClass };
}

/**
 * 보낸 뒤: p: 를 's' 로 쓰고, 그 사이 들어온 확인이 있으면 복귀 확인 알림을 보낸다.
 * 푸시는 이미 나갔으므로 여기서 생긴 오류는 모두 삼킨다. 's' 를 쓰지 못하면 p: 는 '1' 로 남아
 * '돌아왔어요'가 복귀 확인 알림을 보내지 않는다(보낸 것을 모르는 쪽으로 기운다).
 */
async function afterSent(ctx, watchKey, date, time) {
  let after;
  try {
    after = await markSentAndReadDay(ctx, watchKey, date, time);
  } catch {
    return;
  }
  if (!after || !after.confirmed.includes(time)) return;
  try {
    await pushConfirmedOnce(ctx, watchKey, date, time);
  } catch {
    // 복귀 확인 알림은 한 번만 시도한다. 저장소 장애면 k: 권리가 돌아와 '돌아왔어요'를 다시 누를 때 보낸다
  }
}
