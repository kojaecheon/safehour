// 환자 쪽 동작: 지켜보기 등록, 마감 올리기, 돌아왔어요, 삭제 (ADR-0012 · 계획 작업 6)
//
// 결과는 { ok: true, ...값 } 또는 { ok: false, reason: 'NOT_FOUND' | 'RATE_LIMITED' | 'BAD_REQUEST' } 이다.
// - 찾지 못한 경우(모르는 id, 틀린 토큰, 남의 id, 만료)는 모두 같은 NOT_FOUND 하나다. 어느 경우인지 알리지 않는다.
// - 등록의 횟수 제한은 다른 판정보다 먼저 센다(주체는 계정 키).
// - 마감 올리기·돌아왔어요는 쓰기 토큰을 먼저 확인하고 그 결과에 따라 다른 항목에 센다(주체는 watchKey).
//   토큰이 맞으면 deadlines·back, 틀리거나 모르는 id·남의 세션이면 deadlinesBad·backBad 다. watchId 만 아는 사람이 틀린 토큰을
//   되풀이해도 환자의 진짜 요청은 막히지 않는다. 틀린 쪽 항목은 찾아보기 전에 미리 보지 않는다. 미리 보면 그 항목이 넘친 동안
//   진짜 토큰도 확인하지 못해 다시 막힌다. 모르는 id 와 아는 id 의 틀린 토큰은 같은 길(조회 한 번, 틀린 쪽 항목 한 번)을 지나므로
//   결과(NOT_FOUND 또는 RATE_LIMITED)로 id 가 있는지 알 수 없다.
// - 저장소 장애(KvError)는 잡지 않고 던진다(처리기가 503 으로 바꾼다). 예약 업체 실패는 ok 를 바꾸지 않고,
//   마감 올리기만 걸지 못한 수를 armFailed 로 알린다.
// - 결과·예외에 watchId·writeToken·계정 키·watchKey 를 담지 않고 기록도 남기지 않는다.
//   돌려주는 날짜는 계약에 있는 expiresOn(상한을 씌운 출국일) 하나뿐이다.
// - 판정은 '확인이 있었는가'만 다룬다. 의료 판단을 하지 않는다.
// - 삭제 두 함수는 ctx.enabled 를 보지 않는다(기능이 꺼져도 지울 수 있어야 한다).
//
// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM' KST 문자열이다. 계산은 src/stay/time.js 도우미로만, 시계는 ctx.now() 로만 읽는다.

import { addDays, eachDate, isDateString } from '../../../src/stay/time.js';
import { EARLY_TOLERANCE_MS, armPending, cancelMessages, fireAtMs } from './arm.js';
import { WATCH_ID_RE, WRITE_TOKEN_RE, idMatches, ownerHashOf, watchKeyOf, writeHashOf } from './keys.js';
import { WATCH_LIMITS, hitRate } from './limits.js';
import { pushConfirmedOnce } from './notify.js';
import {
  DAY_FIELD,
  capExpiresOn,
  clearDayField,
  deleteWatchData,
  findWritableWatch,
  kstToday,
  ownerWatchKeys,
  readDay,
  readWatch,
  replaceDays,
  setDayField,
  touchExpiry,
  writeWatch,
} from './records.js';

const NOT_FOUND = () => ({ ok: false, reason: 'NOT_FOUND' });
const RATE_LIMITED = () => ({ ok: false, reason: 'RATE_LIMITED' });
const BAD_REQUEST = () => ({ ok: false, reason: 'BAD_REQUEST' });
const recorded = (value) => ({ ok: true, recorded: value });

const isWatchId = (v) => typeof v === 'string' && WATCH_ID_RE.test(v);
const isAccountKey = (v) => typeof v === 'string' && v !== '';

/** 쓰기 토큰 확인에 실패한 요청을 틀린 쪽 항목에 센다. 그 항목이 넘쳤으면 RATE_LIMITED, 아니면 NOT_FOUND */
async function rejectUnauthorized(ctx, badBucket, watchKey) {
  return (await hitRate(ctx, badBucket, watchKey)) ? NOT_FOUND() : RATE_LIMITED();
}

/** 세션 계정이 주어졌으면 소유자와 같아야 한다. 주어지지 않았으면(null) 쓰기 토큰만 본다 */
function ownedBy(ctx, watch, accountKey) {
  if (accountKey === null || accountKey === undefined) return true;
  return idMatches(ownerHashOf(accountKey, ctx.secret), watch.ownerHash);
}

/**
 * 출국일을 줄였으면 새 출국일 다음 날부터 이전 출국일까지를 빈 마감 목록으로 돌려준다(replaceDays 가 그 날짜 기록과
 * 색인 항목을 지운다). 남겨 두면 하루 1회 예약이 색인을 보고 떠난 뒤의 마감에 예약을 걸어, 보호자에게
 * 마감 지남 알림이 갈 수 있다. 날짜 기록은 늘 저장된 출국일 안쪽에만 올라가므로 이 범위가 남은 기록을 모두 덮는다.
 */
function emptiedAfter(capped, previous) {
  if (capped >= previous) return [];
  return eachDate(addDays(capped, 1), previous).map((date) => ({ date, deadlines: [] }));
}

/**
 * 지켜보기를 만들거나, 같은 계정이면 다시 등록한다(쓰기 토큰과 출국일을 바꾼다).
 * @returns {Promise<{ ok: true, expiresOn: string } | { ok: false, reason: string }>}
 */
export async function registerWatch(ctx, { accountKey, watchId, writeToken, expiresOn } = {}) {
  if (!isAccountKey(accountKey)) return BAD_REQUEST();
  if (!(await hitRate(ctx, 'create', accountKey))) return RATE_LIMITED();
  if (!isWatchId(watchId) || typeof writeToken !== 'string' || !WRITE_TOKEN_RE.test(writeToken)) return BAD_REQUEST();
  if (!isDateString(expiresOn)) return BAD_REQUEST();
  const today = kstToday(ctx.now());
  if (expiresOn < today) return BAD_REQUEST();
  const capped = capExpiresOn(expiresOn, today);

  const watchKey = watchKeyOf(watchId, ctx.secret);
  const ownerHash = ownerHashOf(accountKey, ctx.secret);
  const writeHash = writeHashOf(writeToken);

  let existing = await readWatch(ctx, watchKey);
  if (!existing) {
    // 세어 본 뒤 만드는 사이가 원자적이지 않아, 같은 계정이 동시에 새 지켜보기를 만들면 상한을 넘을 수 있다.
    // 넘는 수는 등록 횟수 제한(create)이 막는다(docs/engineering-notes.md)
    if ((await ownerWatchKeys(ctx, ownerHash)).length >= WATCH_LIMITS.maxWatchesPerOwner) return RATE_LIMITED();
    // writeWatch 가 소유 집합에 먼저 넣고 그다음 만든다(만들기가 실패해도 삭제 경로가 찾는다). 새 지켜보기라 맞출 구독 만료가 없다
    const record = { ownerHash, writeHash, expiresOn: capped, registrations: 0 };
    if (await writeWatch(ctx, watchKey, record, { onlyIfAbsent: true })) return { ok: true, expiresOn: capped };
    // 같은 순간에 다른 요청이 만들었다. 한 번만 다시 읽어 아래 다시 등록 규칙을 적용한다.
    // 그래도 읽히지 않으면(형식이 깨진 레코드가 키를 차지함) 이 id 는 쓸 수 없다
    existing = await readWatch(ctx, watchKey);
    if (!existing) return NOT_FOUND();
  }

  // 남의 지켜보기는 바꾸지 않고, 없는 것과 같은 결과를 준다
  if (!idMatches(existing.ownerHash, ownerHash)) return NOT_FOUND();
  if (existing.registrations >= WATCH_LIMITS.maxRegistrations) return RATE_LIMITED();
  // 앞에서 읽은 레코드로 통째로 쓴다. 다시 등록 둘이 겹치면 토큰 하나만 남고 횟수가 하나만 는다(docs/engineering-notes.md).
  // 출국일이 바뀌었을 수 있어 writeWatch 가 같은 exec 에서 구독 키의 만료도 맞춘다
  await writeWatch(ctx, watchKey, { ownerHash, writeHash, expiresOn: capped, registrations: existing.registrations + 1 });
  const stale = emptiedAfter(capped, existing.expiresOn);
  if (stale.length > 0) {
    const { removedMessageIds } = await replaceDays(ctx, watchKey, stale);
    await cancelMessages(ctx, removedMessageIds);
  }
  return { ok: true, expiresOn: capped };
}

/**
 * 날짜별 마감 목록을 올리고 출국일 상한을 다시 씌운다. 오늘·내일 마감만 예약을 건다.
 * days 는 요청 검증(형식 확인, 날짜 겹침 거절, 시각 중복 제거·정렬)을 마친 [{ date, deadlines }] 다.
 * armFailed 는 예약 업체 실패로 걸지 못한 마감 수다. 0보다 크면 클라이언트가 잠시 뒤 같은 전체를 다시 올린다(계획 16).
 * @returns {Promise<{ ok: true, expiresOn: string, armFailed: number } | { ok: false, reason: string }>}
 */
export async function putDeadlines(ctx, { watchId, writeToken, expiresOn, days, accountKey = null } = {}) {
  if (!isWatchId(watchId)) return NOT_FOUND();
  const found = await findWritableWatch(ctx, watchId, writeToken);
  if (!found || !ownedBy(ctx, found.watch, accountKey)) {
    return rejectUnauthorized(ctx, 'deadlinesBad', watchKeyOf(watchId, ctx.secret));
  }
  const { watchKey, watch } = found;
  if (!(await hitRate(ctx, 'deadlines', watchKey))) return RATE_LIMITED();

  if (!isDateString(expiresOn)) return BAD_REQUEST();
  const today = kstToday(ctx.now());
  if (expiresOn < today) return BAD_REQUEST();
  const capped = capExpiresOn(expiresOn, today);
  // 앞에서 읽은 레코드로 통째로 쓴다. 다시 등록과 겹치면 바뀐 토큰을 되돌릴 수 있어, 클라이언트는 지켜보기 하나에
  // 등록·출국일 변경을 한 번에 하나만 보낸다(docs/engineering-notes.md)
  if (capped !== watch.expiresOn) await writeWatch(ctx, watchKey, { ...watch, expiresOn: capped });
  // 출국일이 같아도 만료를 다시 맞춘다. 앞 업로드가 레코드만 쓰고 실패했거나, 구독이 출국일 변경과 겹쳐 옛 만료로
  // 남았어도 다음 업로드가 고친다
  await touchExpiry(ctx, watchKey, capped);

  // 오늘부터 출국일까지의 날짜만 받는다. 범위 밖 날짜는 조용히 버린다
  const accepted = (Array.isArray(days) ? days : [])
    .filter((d) => d && isDateString(d.date) && d.date >= today && d.date <= capped && Array.isArray(d.deadlines))
    .map((d) => ({ date: d.date, deadlines: d.deadlines }));
  // 출국일을 줄였으면 새 출국일 뒤에 남은 날짜 기록도 함께 비운다(받은 날짜와 겹치지 않는다)
  const { removedMessageIds } = await replaceDays(ctx, watchKey, [...accepted, ...emptiedAfter(capped, watch.expiresOn)]);
  await cancelMessages(ctx, removedMessageIds);
  // 예약 실패는 ok 를 바꾸지 않고 armFailed 로만 알린다. 다음 업로드나 하루 1회 예약이 다시 건다
  const { failed } = await armPending(
    ctx,
    watchKey,
    [today, addDays(today, 1)].filter((d) => d <= capped),
  );
  return { ok: true, expiresOn: capped, armFailed: failed };
}

/**
 * 돌아왔어요(마감 확인)와 되돌리기. 오늘이나 어제(KST) 날짜의, 그날 마감 목록에 있는 시각만 받는다.
 * @returns {Promise<{ ok: true, recorded: boolean } | { ok: false, reason: string }>}
 */
export async function markBack(ctx, { watchId, writeToken, date, by, undo = false } = {}) {
  if (!isWatchId(watchId)) return NOT_FOUND();
  const found = await findWritableWatch(ctx, watchId, writeToken);
  if (!found) return rejectUnauthorized(ctx, 'backBad', watchKeyOf(watchId, ctx.secret));
  const { watchKey } = found;
  if (!(await hitRate(ctx, 'back', watchKey))) return RATE_LIMITED();

  // 어제를 받는 것은 자정 넘어(00:05) 어제 늦은 마감(23:55)을 확인할 수 있게 하기 위해서다
  const today = kstToday(ctx.now());
  if (date !== today && date !== addDays(today, -1)) return recorded(false);
  // 마감 목록은 형식이 맞는 시각만 담으므로, 목록에 있으면 by 도 'HH:MM' 이다
  const day = await readDay(ctx, watchKey, date);
  if (!day || !day.deadlines.includes(by)) return recorded(false);

  if (undo === true) {
    // 예약 처리가 일찍 온 예약을 받기 시작하는 순간(보낼 시각 - 30초)부터는 되돌리지 않는다. 예약 처리가 이미
    // 확인을 보고 끝났을 수 있어, 되돌려도 그 마감이 다시 나가지 않기 때문이다
    if (ctx.now() >= fireAtMs(date, by) - EARLY_TOLERANCE_MS) return recorded(false);
    await clearDayField(ctx, watchKey, date, DAY_FIELD.confirmed(by));
    return recorded(true);
  }

  await setDayField(ctx, watchKey, date, DAY_FIELD.confirmed(by), '1');
  // 보냄 표시는 확인을 쓴 뒤에 다시 읽는다. 앞에서 읽은 값을 쓰면 그 사이 나간 마감 지남 알림을 놓친다.
  // 보내는 중(claimed)이면 여기서 보내지 않는다. 예약 처리가 's' 를 쓰는 같은 exec 에서 이 확인을 보고 보낸다
  const after = await readDay(ctx, watchKey, date);
  if (!after || !after.pushed.includes(by)) return recorded(true);
  // 복귀 확인 알림은 k: 권리로 한 번만 시도한다. 푸시 서비스 결과와 무관하게 확인은 기록됐다.
  // 저장소 장애면 권리를 돌려놓고 던진다(다시 누를 때 보낸다)
  await pushConfirmedOnce(ctx, watchKey, date, by);
  return recorded(true);
}

/**
 * 지켜보기 하나의 서버 기록을 모두 지우고 건 예약을 취소한다. 기능 스위치와 무관하게 동작한다.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'NOT_FOUND' }>}
 */
export async function deleteWatch(ctx, { watchId, writeToken } = {}) {
  const found = await findWritableWatch(ctx, watchId, writeToken);
  if (!found) return NOT_FOUND();
  const { messageIds } = await deleteWatchData(ctx, found.watchKey, found.watch);
  await cancelMessages(ctx, messageIds);
  return { ok: true };
}

/**
 * 내 정보 전체 삭제: 그 계정이 소유한 지켜보기를 모두 지운다. 기능 스위치와 무관하게 동작한다.
 * 소유 집합에 남의 지켜보기가 섞여 있을 수 있어(만료 뒤 같은 id 를 다른 계정이 등록) 레코드의 소유자를 다시 본다.
 * @returns {Promise<{ ok: true, deleted: number } | { ok: false, reason: 'BAD_REQUEST' }>}
 */
export async function deleteOwnedWatches(ctx, { accountKey } = {}) {
  if (!isAccountKey(accountKey)) return BAD_REQUEST();
  const ownerHash = ownerHashOf(accountKey, ctx.secret);
  let deleted = 0;
  for (const watchKey of await ownerWatchKeys(ctx, ownerHash)) {
    const watch = await readWatch(ctx, watchKey);
    if (!watch || !idMatches(watch.ownerHash, ownerHash)) continue;
    const { messageIds } = await deleteWatchData(ctx, watchKey, watch);
    await cancelMessages(ctx, messageIds);
    deleted += 1;
  }
  return { ok: true, deleted };
}
