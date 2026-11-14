// 보호자 쪽 동작 (ADR-0012 · 계획 작업 7)
//
// 보호자는 watchId 하나만 안다. 쓰기 토큰이 없고 환자의 계정과 이어지지 않는다.
// 서버는 위치를 모른다. 여기서 다루는 것은 구독, 그날의 확인된 마감 시각, 오늘 함께 있음 표시뿐이다.
//
// subscribeGuardian: 지켜보기 하나에 구독은 하나다. 새 구독이 이전 것을 갈아 끼운다.
//   이전 구독이 있고 endpoint 가 다르면 이전 기기에 '기기가 바뀌었어요'를 한 번 보낸다(결과와 무관하게 성공).
//   저장하는 endpoint 는 검사를 통과한 문자열 그대로다. 보낼 때(src/push/send.js) 같은 검사를 다시 하므로
//   그때도 같은 결과가 나온다. 정규화한 url.href 를 저장하면 퍼센트 인코딩으로 길어져 그때 길이 검사에
//   걸릴 수 있다. 같은 기기인지는 두 주소의 url.href 로 견준다(대소문자, :443 같은 표기 차이는 같은 기기).
//   구독의 만료는 지켜보기의 출국일을 따른다. 구독을 쓰는 같은 exec 에서 지켜보기를 다시 읽어(writeSub), 그 사이
//   지켜보기가 지워졌으면 쓴 구독을 지우고 NOT_FOUND, 출국일이 바뀌었으면 구독 만료를 새 출국일에 맞춘다.
//   저장한 뒤 어제·오늘(KST)의 걸리지 않은 마감을 다시 건다(armPending). 구독이 없어 SKIP_NO_SUB 로 끝난 예약은
//   걸림 표시가 지워져 있으므로, 늦은 한도 안이면 지금 나간다(계획 '설계서와 다르게 정한 것' 14).
//   순서가 중요하다: 구독을 먼저 쓰고 그 뒤에 날짜 기록(a:)을 읽는다. 예약 처리는 a: 를 지우는 같은 exec 에서 구독 키를
//   보므로, 둘 중 한쪽은 반드시 다른 쪽을 본다(예약 처리가 구독을 보면 다시 부르고, 다시 걸기가 지워진 a: 를 보면 건다).
//   다시 걸기는 덤이라 어떤 오류도 응답을 바꾸지 않는다.
// unsubscribeGuardian: subId 가 지금 구독의 것일 때만 지운다. 스위치(ctx.enabled)와 무관하게 동작한다.
// watchStatus: 오늘(KST) 날짜 기록의 확인된 마감 시각(정렬)과 함께 있음 여부만 돌려준다. 어제 기록은 보지 않는다.
//   subscriptionActive 는 받은 subId 가 지금 구독의 것일 때만 참이다.
// muteToday: 지금 구독의 subId 가 맞아야 오늘 날짜 기록의 m 을 바꾼다. 다음 날은 새 날짜 키라 저절로 풀린다.
//   마감을 다시 올려도 m 은 남는다(records.js 의 replaceDays 가 지키는 규칙).
//   끄면 오늘의 걸리지 않은 마감을 다시 건다(SKIP_MUTED 로 끝난 예약의 걸림 표시는 지워져 있다). 구독과 같이 덤이다.
//   켜져 있는 동안은 예약 걸기(arm.js)가 오늘을 건너뛴다. 끌 때도 m 을 먼저 지우고 그 뒤에 날짜 기록을 읽어 다시 건다
//   (예약 처리는 a: 를 지우는 같은 exec 에서 m 을 다시 본다. 구독과 같은 까닭이다).
//
// 찾지 못한 경우(형식이 틀린 id, 모르는 id, 만료, 구독 없음, 틀린 subId)는 모두 같은 NOT_FOUND 다.
// 결과에는 watchId·watchKey·endpoint·키를 담지 않는다. 날짜는 상태 조회의 date, 시각은 confirmed 뿐이다.
// 저장소 장애(KvError)는 잡지 않고 던진다. 응답이 정해진 뒤의 다시 걸기만 오류를 삼킨다. 시계는 ctx.now() 로만 읽는다.

import { parsePushEndpoint } from '../../../src/push/endpoint.js';
import { addDays } from '../../../src/stay/time.js';
import { armPending } from './arm.js';
import { WATCH_ID_RE, idMatches, newSubId, watchKeyOf } from './keys.js';
import { hitRate } from './limits.js';
import { pushToSubscription } from './notify.js';
import { DAY_FIELD, clearDayField, deleteSub, findWatch, kstToday, readDay, readSub, setDayField, writeSub } from './records.js';
import { PUSH_KIND } from './text.js';

const NOT_FOUND = () => ({ ok: false, reason: 'NOT_FOUND' });
const BAD_REQUEST = () => ({ ok: false, reason: 'BAD_REQUEST' });
const RATE_LIMITED = () => ({ ok: false, reason: 'RATE_LIMITED' });

/** 형식이 맞는 watchId 의 저장 키. 형식이 틀리면 null 이고 저장소에 묻지 않는다(횟수도 세지 않는다) */
function watchKeyFor(ctx, watchId) {
  return typeof watchId === 'string' && WATCH_ID_RE.test(watchId) ? watchKeyOf(watchId, ctx.secret) : null;
}

/** 이전 구독이 같은 기기인가. 지금 다시 검사해 통과하지 못하는 주소는 다른 기기로 본다 */
function sameDevice(ctx, previous, url) {
  const before = parsePushEndpoint(previous.endpoint, { testOrigin: ctx.testOrigin });
  return before.ok && before.url.href === url.href;
}

const nonEmpty = (v) => typeof v === 'string' && v !== '';

/** 걸리지 않은 마감을 다시 건다. 덤이라 저장소·예약 업체 오류를 모두 삼킨다(다음 업로드나 하루 1회 예약이 다시 건다) */
async function rearm(ctx, watchKey, dates) {
  try {
    await armPending(ctx, watchKey, dates);
  } catch {
    // 응답은 이미 정해졌다
  }
}

/**
 * @param {object} ctx  WatchCtx
 * @param {{ watchId: string, subscription: { endpoint: string, p256dh: string, auth: string }, lang: string }} input
 * @returns {Promise<{ ok: true, subId: string } | { ok: false, reason: 'NOT_FOUND'|'RATE_LIMITED'|'BAD_REQUEST' }>}
 */
export async function subscribeGuardian(ctx, { watchId, subscription, lang } = {}) {
  const watchKey = watchKeyFor(ctx, watchId);
  if (!watchKey) return NOT_FOUND();
  if (!(await hitRate(ctx, 'subscribe', watchKey))) return RATE_LIMITED();
  const found = await findWatch(ctx, watchId);
  if (!found) return NOT_FOUND();

  const { endpoint, p256dh, auth } = subscription ?? {};
  const parsed = parsePushEndpoint(endpoint, { testOrigin: ctx.testOrigin });
  if (!parsed.ok) return BAD_REQUEST();
  // 키 길이와 언어 목록은 처리기의 허용 목록이 본다. 여기서는 봉인을 다시 열 수 있는 값인지만 본다
  if (![p256dh, auth, lang].every(nonEmpty)) return BAD_REQUEST();

  const previous = await readSub(ctx, found.watchKey);
  const subId = newSubId();
  // 구독을 먼저 쓴다(아래 다시 걸기는 그 뒤에 날짜 기록을 읽는다). 같은 exec 에서 지켜보기를 다시 읽는다
  const watchNow = await writeSub(ctx, found.watchKey, { subId, endpoint, p256dh, auth, lang }, found.watch.expiresOn);
  if (!watchNow) {
    // 앞에서 찾은 뒤 지켜보기가 지워졌다(삭제와 겹침). 봉인한 구독을 남기지 않는다
    await deleteSub(ctx, found.watchKey);
    return NOT_FOUND();
  }
  if (previous && !sameDevice(ctx, previous, parsed.url)) {
    // 결과는 보지 않는다. 이전 기기에 닿지 않아도 새 구독은 이미 저장됐다
    await pushToSubscription(ctx, previous, { kind: PUSH_KIND.DEVICE_CHANGED });
  }
  // 자정을 넘긴 어제 늦은 마감(23:55 → 00:55 까지)도 받도록 어제부터 건다
  const today = kstToday(ctx.now());
  await rearm(ctx, found.watchKey, [addDays(today, -1), today]);
  return { ok: true, subId };
}

/**
 * @param {object} ctx  WatchCtx
 * @param {{ watchId: string, subId: string }} input
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'NOT_FOUND' }>}
 */
export async function unsubscribeGuardian(ctx, { watchId, subId } = {}) {
  const found = await findWatch(ctx, watchId);
  if (!found) return NOT_FOUND();
  const sub = await readSub(ctx, found.watchKey);
  if (!sub || !idMatches(subId, sub.subId)) return NOT_FOUND();
  await deleteSub(ctx, found.watchKey);
  return { ok: true };
}

/**
 * @param {object} ctx  WatchCtx
 * @param {{ watchId: string, subId?: string|null }} input
 * @returns {Promise<{ ok: true, date: string, confirmed: string[], muted: boolean, subscriptionActive: boolean }
 *   | { ok: false, reason: 'NOT_FOUND'|'RATE_LIMITED' }>}
 */
export async function watchStatus(ctx, { watchId, subId = null } = {}) {
  const watchKey = watchKeyFor(ctx, watchId);
  if (!watchKey) return NOT_FOUND();
  if (!(await hitRate(ctx, 'status', watchKey))) return RATE_LIMITED();
  const found = await findWatch(ctx, watchId);
  if (!found) return NOT_FOUND();

  const date = kstToday(ctx.now());
  const day = await readDay(ctx, found.watchKey, date);
  let subscriptionActive = false;
  if (subId !== null && subId !== undefined) {
    const sub = await readSub(ctx, found.watchKey);
    subscriptionActive = sub !== null && idMatches(subId, sub.subId);
  }
  return {
    ok: true,
    date,
    confirmed: day ? [...day.confirmed].sort() : [],
    muted: day ? day.muted === true : false,
    subscriptionActive,
  };
}

/**
 * @param {object} ctx  WatchCtx
 * @param {{ watchId: string, subId: string, on: boolean }} input
 * @returns {Promise<{ ok: true, muted: boolean } | { ok: false, reason: 'NOT_FOUND'|'RATE_LIMITED'|'BAD_REQUEST' }>}
 */
export async function muteToday(ctx, { watchId, subId, on } = {}) {
  const watchKey = watchKeyFor(ctx, watchId);
  if (!watchKey) return NOT_FOUND();
  if (!(await hitRate(ctx, 'mute', watchKey))) return RATE_LIMITED();
  const found = await findWatch(ctx, watchId);
  if (!found) return NOT_FOUND();
  const sub = await readSub(ctx, found.watchKey);
  if (!sub || !idMatches(subId, sub.subId)) return NOT_FOUND();
  // 끄기로 잘못 읽으면 알림이 다시 나가고, 켜기로 잘못 읽으면 알림이 멈춘다. 불리언만 받는다
  if (typeof on !== 'boolean') return BAD_REQUEST();

  const today = kstToday(ctx.now());
  if (on) {
    await setDayField(ctx, found.watchKey, today, DAY_FIELD.muted, '1');
  } else {
    // m 을 먼저 지우고 그 뒤에 다시 건다(다시 걸기가 날짜 기록을 읽는다). 순서를 바꾸지 않는다
    await clearDayField(ctx, found.watchKey, today, DAY_FIELD.muted);
    await rearm(ctx, found.watchKey, [today]);
  }
  return { ok: true, muted: on };
}
