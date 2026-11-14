// 서버 알림 네 레코드 읽기·쓰기 (ADR-0012 · 계획 '공용 모양' 저장 모양 표 · 작업 2)
//
// Redis 명령 배치를 아는 곳은 이 파일뿐이다. 서비스 함수는 아래 함수만 부른다.
// 저장하는 것은 네 레코드뿐이고 필드를 더하지 않는다.
//   sh:<ns>:w:<watchKey>         JSON { ownerHash, writeHash, expiresOn, registrations }   만료 watchExpiryUnix
//   sh:<ns>:s:<watchKey>         JSON { v: 1, subId, sealed }  sealed 는 { endpoint, p256dh, auth, lang } 봉인   지켜보기와 같다
//   sh:<ns>:d:<watchKey>:<date>  해시 dl·c:·a:·p:·k:·m                                       만료 dayExpiryUnix
//   sh:<ns>:o:<ownerHash>        집합(watchKey)                                                등록할 때마다 지금 + 60일
// 그리고 보조 키 둘: 날짜 색인 sh:<ns>:x:<date>(하루 1회 예약용), 횟수 제한 계수기(limits.js).
// p:<시각> 은 두 단계다. 권리를 얻을 때 '1'(보내는 중), 푸시 서비스가 받으면 's'(보냄). 읽을 때 's' 는 pushed,
// 그 밖의 값은 claimed 로 나눈다(계획 '설계서와 다르게 정한 것' 11).
// 구독 키의 만료는 지켜보기를 덮어쓰는 exec(writeWatch)와 구독을 쓰는 exec(writeSub)가 함께 맞춘다.
// 걸림 표시(a:)를 지우는 함수는 지운 같은 exec 에서 그 이유(구독 없음, 함께 있음, 목록에서 빠짐)를 다시 읽는다(due.js 가 쓴다).
// watchId·writeToken·계정 키·구독 원문은 여기 들어오기 전에 해시·봉인된다.
//
// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM' KST 문자열이다. 계산은 src/stay/time.js 도우미로만 한다.
// 시계는 ctx.now() 로만 읽는다.

import { addDays, eachDate, isClockTime, isDateString, kstInstantMs, KST_OFFSET_MIN } from '../../../src/stay/time.js';
import { DEFAULTS } from '../../../src/stay/defaults.js';
import { hashFromFlat } from './kv.js';
import { WATCH_ID_RE, WATCH_KEY_RE, WRITE_TOKEN_RE, idMatches, tokenMatches, watchKeyOf } from './keys.js';
import { openJson, sealJson } from './seal.js';

const OWNER_TTL_SEC = 60 * 86400;
const HASH_RE = /^[A-Za-z0-9_-]{43}$/;

// ---- 날짜와 만료 ----

/** 절대 시각(ms) → KST 날짜 */
export function kstToday(nowMs) {
  return new Date(nowMs + KST_OFFSET_MIN * 60 * 1000).toISOString().slice(0, 10);
}

/** 날짜 기록 만료: (date + 2일) 00:00 KST 의 유닉스 초. 날짜 끝 + 1일이라 자정 넘어 보내는 예약도 읽는다 */
export function dayExpiryUnix(date) {
  return kstInstantMs(addDays(date, 2), '00:00') / 1000;
}

/** 지켜보기 만료: (출국일 + 1일 + deleteAfterDepartureDays) 00:00 KST 의 유닉스 초. 출국일 끝 + 7일 */
export function watchExpiryUnix(expiresOn) {
  return kstInstantMs(addDays(expiresOn, 1 + DEFAULTS.stay.deleteAfterDepartureDays), '00:00') / 1000;
}

/** 출국일 상한: min(expiresOn, today + maxNights + 1일) */
export function capExpiresOn(expiresOn, today) {
  const cap = addDays(today, DEFAULTS.stay.maxNights + 1);
  return expiresOn < cap ? expiresOn : cap;
}

/** 날짜 해시의 필드 이름 */
export const DAY_FIELD = Object.freeze({
  deadlines: 'dl',
  muted: 'm',
  confirmed: (t) => `c:${t}`,
  armed: (t) => `a:${t}`,
  pushed: (t) => `p:${t}`,
  closed: (t) => `k:${t}`,
});

/** p: 의 '보냄' 값. 권리를 얻을 때 쓰는 '1' 과 다르다 */
const PUSH_SENT = 's';

// ---- 지켜보기 ----

function parseWatch(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const { ownerHash, writeHash, expiresOn, registrations } = value;
  // 형식이 틀린 레코드는 없는 것으로 본다(만료 계산과 토큰 비교에 쓰이는 값이라 믿지 않는다)
  if (typeof ownerHash !== 'string' || !HASH_RE.test(ownerHash)) return null;
  if (typeof writeHash !== 'string' || !HASH_RE.test(writeHash)) return null;
  if (!isDateString(expiresOn)) return null;
  if (!Number.isInteger(registrations) || registrations < 0) return null;
  return { ownerHash, writeHash, expiresOn, registrations };
}

/** @returns {Promise<{ ownerHash, writeHash, expiresOn, registrations } | null>} */
export async function readWatch(ctx, watchKey) {
  const [raw] = await ctx.kv.exec([['GET', ctx.keys.watch(watchKey)]]);
  return parseWatch(raw);
}

function ownerSetCommands(ctx, ownerHash, watchKey) {
  const key = ctx.keys.owner(ownerHash);
  return [
    ['SADD', key, watchKey],
    ['EXPIREAT', key, Math.floor(ctx.now() / 1000) + OWNER_TTL_SEC],
  ];
}

/**
 * 지켜보기를 쓴다. onlyIfAbsent 이면 이미 있을 때 쓰지 않고 false.
 * - 덮어쓰기: 지켜보기 SET, 구독 키 EXPIREAT, 소유 집합 SADD·EXPIREAT 를 exec 한 번에 한다. 출국일이 바뀌어도 구독이
 *   지켜보기와 같은 때 사라진다. 구독이 아직 없으면 EXPIREAT 는 아무 일도 하지 않는다.
 * - 새로 만들기(onlyIfAbsent): 소유 집합에 먼저 넣고 그다음 SET NX 한다. 둘째 단계가 저장소 장애로 실패해도(쓰기는 됐는데
 *   응답만 잃은 경우 포함) 소유 집합에 남아 '내 정보 전체 삭제'가 그 지켜보기를 찾는다. NX 가 실패하면 같은 exec 에서 읽은
 *   레코드가 이 소유자의 것이 아닐 때만 소유 집합에서 되도록 뺀다(같은 소유자가 동시에 만든 것이면 그대로 둔다).
 *   빼지 못해도 삭제 경로는 레코드의 소유자를 다시 보므로 남의 지켜보기를 지우지 않는다. 새 지켜보기라 맞출 구독 만료가 없다.
 * 불변식: 출국일은 capExpiresOn 으로 오늘 + 46일까지라 지켜보기 만료는 늦어도 지금 + 54일 안쪽이다.
 * 같은 순간에 쓴 소유 집합 만료(지금 + 60일)가 언제나 더 늦고, 시계는 앞으로만 가므로
 * 지켜보기가 살아 있는 동안 소유 집합이 먼저 사라지지 않는다.
 */
export async function writeWatch(ctx, watchKey, record, { onlyIfAbsent = false } = {}) {
  const value = JSON.stringify({
    ownerHash: record.ownerHash,
    writeHash: record.writeHash,
    expiresOn: record.expiresOn,
    registrations: record.registrations,
  });
  const watchKeyName = ctx.keys.watch(watchKey);
  const at = watchExpiryUnix(record.expiresOn);
  if (onlyIfAbsent) {
    await ctx.kv.exec(ownerSetCommands(ctx, record.ownerHash, watchKey));
    const [result, raw] = await ctx.kv.exec([
      ['SET', watchKeyName, value, 'NX', 'EXAT', at],
      ['GET', watchKeyName],
    ]);
    if (result === 'OK') return true;
    const existing = parseWatch(raw);
    if (!existing || !idMatches(existing.ownerHash, record.ownerHash)) {
      try {
        await ctx.kv.exec([['SREM', ctx.keys.owner(record.ownerHash), watchKey]]);
      } catch {
        // 되도록 뺀다. 남은 항목은 ownerWatchKeys·deleteOwnedWatches 가 레코드를 보고 거른다
      }
    }
    return false;
  }
  const [result] = await ctx.kv.exec([
    ['SET', watchKeyName, value, 'EXAT', at],
    ['EXPIREAT', ctx.keys.sub(watchKey), at],
    ...ownerSetCommands(ctx, record.ownerHash, watchKey),
  ]);
  return result === 'OK';
}

/** watchId 로 찾는다. 형식이 틀리면 저장소에 묻지 않고 null */
export async function findWatch(ctx, watchId) {
  if (typeof watchId !== 'string' || !WATCH_ID_RE.test(watchId)) return null;
  const watchKey = watchKeyOf(watchId, ctx.secret);
  const watch = await readWatch(ctx, watchKey);
  return watch ? { watchKey, watch } : null;
}

/** watchId 와 쓰기 토큰이 모두 맞을 때만 돌려준다. 모르는 id 와 틀린 토큰은 같은 null 이다 */
export async function findWritableWatch(ctx, watchId, writeToken) {
  if (typeof writeToken !== 'string' || !WRITE_TOKEN_RE.test(writeToken)) return null;
  const found = await findWatch(ctx, watchId);
  if (!found || !tokenMatches(writeToken, found.watch.writeHash)) return null;
  return found;
}

/** 지켜보기와 구독 키의 만료를 출국일에 맞춘다 */
export async function touchExpiry(ctx, watchKey, expiresOn) {
  const at = watchExpiryUnix(expiresOn);
  await ctx.kv.exec([
    ['EXPIREAT', ctx.keys.watch(watchKey), at],
    ['EXPIREAT', ctx.keys.sub(watchKey), at],
  ]);
}

// ---- 날짜 기록 ----

function parseDeadlines(raw) {
  if (typeof raw !== 'string') return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isClockTime) : [];
  } catch {
    return [];
  }
}

function dayFromFlat(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  const hash = hashFromFlat(flat);
  const day = {
    deadlines: parseDeadlines(hash[DAY_FIELD.deadlines]),
    confirmed: [],
    armed: {},
    pushed: [],
    claimed: [],
    closed: [],
    muted: Object.hasOwn(hash, DAY_FIELD.muted),
  };
  for (const field of Object.keys(hash)) {
    const kind = field.slice(0, 2);
    const time = field.slice(2);
    if (!isClockTime(time)) continue;
    if (kind === 'c:') day.confirmed.push(time);
    else if (kind === 'a:') day.armed[time] = hash[field];
    else if (kind === 'p:') (hash[field] === PUSH_SENT ? day.pushed : day.claimed).push(time);
    else if (kind === 'k:') day.closed.push(time);
  }
  day.confirmed.sort();
  day.pushed.sort();
  day.claimed.sort();
  day.closed.sort();
  return day;
}

/**
 * 날짜 기록 하나. 시각 목록은 모두 정렬돼 있다.
 * - pushed: 마감 지남 푸시를 푸시 서비스가 받은 시각(p: 가 's')
 * - claimed: 보낼 권리만 얻고 아직 결과가 없는 시각(p: 가 's' 가 아닌 값, 보통 '1')
 * - closed: 복귀 확인 푸시의 권리를 쓴 시각(k:)
 * @returns {Promise<{ deadlines, confirmed, armed, pushed, claimed, closed, muted } | null>}
 */
export async function readDay(ctx, watchKey, date) {
  const [flat] = await ctx.kv.exec([['HGETALL', ctx.keys.day(watchKey, date)]]);
  return dayFromFlat(flat);
}

/** 여러 날짜를 exec 한 번에 읽는다 */
export async function readDays(ctx, watchKey, dates) {
  const out = new Map();
  if (dates.length === 0) return out;
  const flats = await ctx.kv.exec(dates.map((date) => ['HGETALL', ctx.keys.day(watchKey, date)]));
  dates.forEach((date, i) => out.set(date, dayFromFlat(flats[i])));
  return out;
}

function sameList(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 알려진 한계: 읽기와 쓰기가 exec 두 번이라 원자적이지 않다. 같은 지켜보기에 업로드 둘이 겹치면 확인 표시를
 * 잃거나, 늦게 쓴 쪽이 빈 목록이면 날짜 하나가 통째로 빠질 수 있다. 그래서 클라이언트는 지켜보기 하나에
 * 업로드를 한 번에 하나만 보내고, 늘 가장 최근 상태 전체를 보낸다.
 *
 * 날짜별 마감 목록을 바꾼다. 같은 목록은 쓰지 않고(확인·예약·보냄 표시 유지), 빈 목록은 그 날짜 기록과
 * 색인 항목을 지운다(m 이 있었으면 m 만 다시 남긴다). 바뀐 날짜는 빠진 시각의 c:·a:·p:·k: 를 지우고 그 a: 값(예약 메시지 id)을 돌려준다.
 * m(오늘 함께 있음)은 건드리지 않는다. deadlines 는 요청 검증에서 형식 확인·중복 제거·정렬을 마친 값이다.
 */
export async function replaceDays(ctx, watchKey, days) {
  const removedMessageIds = [];
  let changed = 0;
  if (days.length === 0) return { removedMessageIds, changed };
  const current = await readDays(
    ctx,
    watchKey,
    days.map((d) => d.date),
  );
  const writes = [];
  for (const { date, deadlines } of days) {
    const before = current.get(date);
    const dayKey = ctx.keys.day(watchKey, date);
    const indexKey = ctx.keys.index(date);
    if (deadlines.length === 0) {
      if (!before) continue;
      removedMessageIds.push(...Object.values(before.armed));
      writes.push(['DEL', dayKey], ['SREM', indexKey, watchKey]);
      // 오늘 함께 있음 표시는 마감 목록과 무관하게 그날 동안 유지한다
      if (before.muted) {
        writes.push(['HSET', dayKey, DAY_FIELD.muted, '1'], ['EXPIREAT', dayKey, dayExpiryUnix(date)]);
      }
      if (before.deadlines.length > 0) changed += 1;
      continue;
    }
    if (before && sameList(before.deadlines, deadlines)) continue;
    const keep = new Set(deadlines);
    const drop = [];
    if (before) {
      const marked = new Set([
        ...before.confirmed,
        ...Object.keys(before.armed),
        ...before.pushed,
        ...before.claimed,
        ...before.closed,
      ]);
      for (const t of marked) {
        if (keep.has(t)) continue;
        drop.push(DAY_FIELD.confirmed(t), DAY_FIELD.armed(t), DAY_FIELD.pushed(t), DAY_FIELD.closed(t));
        if (before.armed[t]) removedMessageIds.push(before.armed[t]);
      }
    }
    const expireAt = dayExpiryUnix(date);
    writes.push(['HSET', dayKey, DAY_FIELD.deadlines, JSON.stringify(deadlines)]);
    if (drop.length > 0) writes.push(['HDEL', dayKey, ...drop]);
    writes.push(['EXPIREAT', dayKey, expireAt], ['SADD', indexKey, watchKey], ['EXPIREAT', indexKey, expireAt]);
    changed += 1;
  }
  if (writes.length > 0) await ctx.kv.exec(writes);
  return { removedMessageIds, changed };
}

/** 날짜 해시에 필드 하나를 쓰고 만료를 건다 */
export async function setDayField(ctx, watchKey, date, field, value) {
  const key = ctx.keys.day(watchKey, date);
  await ctx.kv.exec([
    ['HSET', key, field, value],
    ['EXPIREAT', key, dayExpiryUnix(date)],
  ]);
}

/** 필드가 없을 때만 쓴다. 이번에 쓴 쪽만 true(보낼 권리 얻기) */
export async function claimDayField(ctx, watchKey, date, field) {
  const key = ctx.keys.day(watchKey, date);
  const [claimed] = await ctx.kv.exec([
    ['HSETNX', key, field, '1'],
    ['EXPIREAT', key, dayExpiryUnix(date)],
  ]);
  return Number(claimed) === 1;
}

/**
 * 보낼 권리를 얻고 같은 exec 에서 날짜 기록을 다시 읽는다. 권리를 얻은 순간의 확인·함께 있음·마감 목록을 본다.
 * 날짜 기록이 사라진 뒤였으면 HSETNX 가 필드 하나짜리 기록을 만든다(마감 목록이 비어 보인다). 부르는 쪽이 권리를 돌려놓는다.
 * @returns {Promise<{ claimed: boolean, day: object | null }>}
 */
export async function claimAndReadDay(ctx, watchKey, date, field) {
  const key = ctx.keys.day(watchKey, date);
  const [claimed, , flat] = await ctx.kv.exec([
    ['HSETNX', key, field, '1'],
    ['EXPIREAT', key, dayExpiryUnix(date)],
    ['HGETALL', key],
  ]);
  return { claimed: Number(claimed) === 1, day: dayFromFlat(flat) };
}

/**
 * 마감 지남 푸시를 푸시 서비스가 받았다고 적고(p: = 's') 같은 exec 에서 날짜 기록을 다시 읽는다.
 * 만료를 함께 걸어, 그 사이 기록이 지워졌다 다시 생겨도 만료 없는 해시가 남지 않는다.
 * @returns {Promise<object | null>}
 */
export async function markSentAndReadDay(ctx, watchKey, date, time) {
  const key = ctx.keys.day(watchKey, date);
  const [, , flat] = await ctx.kv.exec([
    ['HSET', key, DAY_FIELD.pushed(time), PUSH_SENT],
    ['EXPIREAT', key, dayExpiryUnix(date)],
    ['HGETALL', key],
  ]);
  return dayFromFlat(flat);
}

/** 날짜 해시의 필드를 지운다. 여러 필드를 주면 HDEL 한 번에 함께 지운다 */
export async function clearDayField(ctx, watchKey, date, ...fields) {
  await ctx.kv.exec([['HDEL', ctx.keys.day(watchKey, date), ...fields]]);
}

/** 지울 필드: a:<시각>, alsoPushed 이면 p:<시각> 도(권리를 돌려놓음). 한 HDEL 로 함께 지운다 */
function armedFields(time, alsoPushed) {
  return alsoPushed ? [DAY_FIELD.pushed(time), DAY_FIELD.armed(time)] : [DAY_FIELD.armed(time)];
}

/**
 * 걸림 표시(a:<시각>)를 지우고 같은 exec 에서 구독 키가 있는지 본다. 구독 없음·구독 만료로 끝내는 예약 처리가 쓴다.
 * 보호자 구독은 구독을 쓴 뒤에 날짜 기록을 읽어 다시 건다. 그래서 이 exec 보다 먼저 구독이 들어왔으면 여기서 true 를 보고,
 * 나중에 들어왔으면 다시 걸기가 지워진 a: 를 본다. 둘 중 한쪽은 반드시 다른 쪽을 본다.
 * @returns {Promise<boolean>}  지운 순간 구독 키가 있으면 true
 */
export async function clearArmedAndReadSubExists(ctx, watchKey, date, time, { alsoPushed = false } = {}) {
  const [, exists] = await ctx.kv.exec([
    ['HDEL', ctx.keys.day(watchKey, date), ...armedFields(time, alsoPushed)],
    ['EXISTS', ctx.keys.sub(watchKey)],
  ]);
  return Number(exists) === 1;
}

/**
 * 걸림 표시(a:<시각>)를 지우고 같은 exec 에서 날짜 기록을 다시 읽는다. 함께 있음·목록에서 빠짐으로 끝내는 예약 처리가 쓴다.
 * '오늘 함께 있음' 끄기와 마감 올리기는 m 을 지우거나 목록을 쓴 뒤에 날짜 기록을 읽어 다시 건다. 그래서 이 exec 보다 먼저
 * 바뀌었으면 여기서 바뀐 기록을 보고, 나중에 바뀌었으면 다시 걸기가 지워진 a: 를 본다.
 * @returns {Promise<object | null>}  지운 뒤의 날짜 기록(readDay 와 같은 모양)
 */
export async function clearArmedAndReadDay(ctx, watchKey, date, time, { alsoPushed = false } = {}) {
  const key = ctx.keys.day(watchKey, date);
  const [, flat] = await ctx.kv.exec([
    ['HDEL', key, ...armedFields(time, alsoPushed)],
    ['HGETALL', key],
  ]);
  return dayFromFlat(flat);
}

// ---- 구독 ----

/** 봉인을 풀어 돌려준다. 없거나 못 풀면 null */
export async function readSub(ctx, watchKey) {
  const [raw] = await ctx.kv.exec([['GET', ctx.keys.sub(watchKey)]]);
  if (typeof raw !== 'string') return null;
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored || stored.v !== 1 || typeof stored.subId !== 'string') return null;
  const opened = openJson(stored.sealed, ctx.sealKeys, watchKey);
  if (!opened) return null;
  const { endpoint, p256dh, auth, lang } = opened;
  if ([endpoint, p256dh, auth, lang].some((v) => typeof v !== 'string')) return null;
  return { subId: stored.subId, endpoint, p256dh, auth, lang };
}

/**
 * 구독을 봉인해 쓰고, 같은 exec 에서 지켜보기를 다시 읽어 돌려준다(없으면 null). watchKey 를 aad 로 묶어 다른 키 아래에서는
 * 열리지 않는다. 만료는 넘겨받은 출국일로 걸고, 다시 읽은 지켜보기의 출국일이 그와 다르면(앞에서 읽은 뒤 출국일이 바뀜) 구독
 * 만료를 지켜보기의 출국일에 다시 맞춘다. 지켜보기가 없으면 구독을 지우지 않는다. 지울지는 부르는 쪽이 정한다.
 * 다시 맞추는 EXPIREAT 는 따로 가는 요청이라 그 사이 출국일이 또 바뀌면 어긋날 수 있다. 다음 마감 올리기의 touchExpiry 가 고친다.
 * @returns {Promise<{ ownerHash, writeHash, expiresOn, registrations } | null>}
 */
export async function writeSub(ctx, watchKey, sub, expiresOn) {
  const sealed = sealJson({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, lang: sub.lang }, ctx.sealKeys[0], watchKey);
  const value = JSON.stringify({ v: 1, subId: sub.subId, sealed });
  const subKey = ctx.keys.sub(watchKey);
  const [, raw] = await ctx.kv.exec([
    ['SET', subKey, value, 'EXAT', watchExpiryUnix(expiresOn)],
    ['GET', ctx.keys.watch(watchKey)],
  ]);
  const watch = parseWatch(raw);
  if (watch && watch.expiresOn !== expiresOn) {
    await ctx.kv.exec([['EXPIREAT', subKey, watchExpiryUnix(watch.expiresOn)]]);
  }
  return watch;
}

export async function deleteSub(ctx, watchKey) {
  await ctx.kv.exec([['DEL', ctx.keys.sub(watchKey)]]);
}

// ---- 소유 집합 ----

/** 소유 집합에 넣고 만료를 지금 + 60일로 늦춘다. writeWatch 가 같은 일을 하므로 따로 부르지 않아도 된다 */
export async function addOwnerWatch(ctx, ownerHash, watchKey) {
  await ctx.kv.exec(ownerSetCommands(ctx, ownerHash, watchKey));
}

/** 그 계정의 살아 있는 watchKey 들. 지켜보기 레코드가 사라진 키는 집합에서도 뺀다 */
export async function ownerWatchKeys(ctx, ownerHash) {
  const key = ctx.keys.owner(ownerHash);
  const [members] = await ctx.kv.exec([['SMEMBERS', key]]);
  const list = (Array.isArray(members) ? members : []).map(String);
  if (list.length === 0) return [];
  const exists = await ctx.kv.exec(list.map((wk) => ['EXISTS', ctx.keys.watch(wk)]));
  const alive = [];
  const dead = [];
  list.forEach((wk, i) => {
    if (WATCH_KEY_RE.test(wk) && Number(exists[i]) === 1) alive.push(wk);
    else dead.push(wk);
  });
  if (dead.length > 0) await ctx.kv.exec([['SREM', key, ...dead]]);
  return alive;
}

// ---- 날짜 색인 ----

export async function indexMembers(ctx, date) {
  const [members] = await ctx.kv.exec([['SMEMBERS', ctx.keys.index(date)]]);
  return (Array.isArray(members) ? members : []).map(String).filter((wk) => WATCH_KEY_RE.test(wk));
}

export async function dropIndexMember(ctx, date, watchKey) {
  await ctx.kv.exec([['SREM', ctx.keys.index(date), watchKey]]);
}

// ---- 삭제 ----

/**
 * 지켜보기 하나의 서버 기록을 모두 지운다. 날짜 기록에서 예약 메시지 id 를 모아 돌려준다(취소는 부르는 쪽이 한다).
 * 훑는 범위는 저장된 출국일과 무관하게 어제(KST)부터 오늘 + maxNights + 1일까지로 고정한다. 출국일을 줄이기 전에
 * 올린 뒤쪽 날짜 기록이 남아 있을 수 있기 때문이다. 출국일은 늘 오늘 + 46일 안쪽이라 이 범위(48개)가 모두 덮는다.
 */
export async function deleteWatchData(ctx, watchKey, watch) {
  const today = kstToday(ctx.now());
  const dates = eachDate(addDays(today, -1), addDays(today, DEFAULTS.stay.maxNights + 1));
  const days = await readDays(ctx, watchKey, dates);
  const messageIds = [];
  for (const day of days.values()) if (day) messageIds.push(...Object.values(day.armed));
  const writes = [['DEL', ctx.keys.watch(watchKey), ctx.keys.sub(watchKey), ...dates.map((d) => ctx.keys.day(watchKey, d))]];
  for (const date of dates) writes.push(['SREM', ctx.keys.index(date), watchKey]);
  writes.push(['SREM', ctx.keys.owner(watch.ownerHash), watchKey]);
  await ctx.kv.exec(writes);
  return { messageIds };
}
