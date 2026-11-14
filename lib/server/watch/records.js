// 서버 알림 네 레코드 읽기·쓰기 (ADR-0012 · 계획 '공용 모양' 저장 모양 표 · 작업 2)
//
// Redis 명령 배치를 아는 곳은 이 파일뿐이다. 서비스 함수는 아래 함수만 부른다.
// 저장하는 것은 네 레코드뿐이고 필드를 더하지 않는다.
//   sh:<ns>:w:<watchKey>         JSON { ownerHash, writeHash, expiresOn, registrations }   만료 watchExpiryUnix
//   sh:<ns>:s:<watchKey>         JSON { v: 1, subId, sealed }  sealed 는 { endpoint, p256dh, auth, lang } 봉인   지켜보기와 같다
//   sh:<ns>:d:<watchKey>:<date>  해시 dl·c:·a:·p:·k:·m                                       만료 dayExpiryUnix
//   sh:<ns>:o:<ownerHash>        집합(watchKey)                                                등록할 때마다 지금 + 60일
// 그리고 보조 키 둘: 날짜 색인 sh:<ns>:x:<date>(하루 1회 예약용), 횟수 제한 계수기(limits.js).
// watchId·writeToken·계정 키·구독 원문은 여기 들어오기 전에 해시·봉인된다.
//
// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM' KST 문자열이다. 계산은 src/stay/time.js 도우미로만 한다.
// 시계는 ctx.now() 로만 읽는다.

import { addDays, eachDate, isClockTime, kstInstantMs, KST_OFFSET_MIN } from '../../../src/stay/time.js';
import { DEFAULTS } from '../../../src/stay/defaults.js';
import { hashFromFlat } from './kv.js';
import { WATCH_ID_RE, WATCH_KEY_RE, WRITE_TOKEN_RE, tokenMatches, watchKeyOf } from './keys.js';
import { openJson, sealJson } from './seal.js';

const OWNER_TTL_SEC = 60 * 86400;

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
  if (typeof ownerHash !== 'string' || typeof writeHash !== 'string' || typeof expiresOn !== 'string') return null;
  if (!Number.isInteger(registrations) || registrations < 0) return null;
  return { ownerHash, writeHash, expiresOn, registrations };
}

/** @returns {Promise<{ ownerHash, writeHash, expiresOn, registrations } | null>} */
export async function readWatch(ctx, watchKey) {
  const [raw] = await ctx.kv.exec([['GET', ctx.keys.watch(watchKey)]]);
  return parseWatch(raw);
}

/** 지켜보기를 쓴다. onlyIfAbsent 이면 이미 있을 때 쓰지 않고 false */
export async function writeWatch(ctx, watchKey, record, { onlyIfAbsent = false } = {}) {
  const value = JSON.stringify({
    ownerHash: record.ownerHash,
    writeHash: record.writeHash,
    expiresOn: record.expiresOn,
    registrations: record.registrations,
  });
  const cmd = ['SET', ctx.keys.watch(watchKey), value];
  if (onlyIfAbsent) cmd.push('NX');
  cmd.push('EXAT', watchExpiryUnix(record.expiresOn));
  const [result] = await ctx.kv.exec([cmd]);
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
    closed: [],
    muted: Object.hasOwn(hash, DAY_FIELD.muted),
  };
  for (const field of Object.keys(hash)) {
    const kind = field.slice(0, 2);
    const time = field.slice(2);
    if (!isClockTime(time)) continue;
    if (kind === 'c:') day.confirmed.push(time);
    else if (kind === 'a:') day.armed[time] = hash[field];
    else if (kind === 'p:') day.pushed.push(time);
    else if (kind === 'k:') day.closed.push(time);
  }
  day.confirmed.sort();
  day.pushed.sort();
  day.closed.sort();
  return day;
}

/** @returns {Promise<{ deadlines, confirmed, armed, pushed, closed, muted } | null>} */
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
 * 날짜별 마감 목록을 바꾼다. 같은 목록은 쓰지 않고(확인·예약·보냄 표시 유지), 빈 목록은 그 날짜 기록과
 * 색인 항목을 지운다. 바뀐 날짜는 빠진 시각의 c:·a:·p:·k: 를 지우고 그 a: 값(예약 메시지 id)을 돌려준다.
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
      changed += 1;
      continue;
    }
    if (before && sameList(before.deadlines, deadlines)) continue;
    const keep = new Set(deadlines);
    const drop = [];
    if (before) {
      const marked = new Set([...before.confirmed, ...Object.keys(before.armed), ...before.pushed, ...before.closed]);
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

export async function clearDayField(ctx, watchKey, date, field) {
  await ctx.kv.exec([['HDEL', ctx.keys.day(watchKey, date), field]]);
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
  const opened = openJson(stored.sealed, ctx.sealKeys);
  if (!opened) return null;
  const { endpoint, p256dh, auth, lang } = opened;
  if ([endpoint, p256dh, auth, lang].some((v) => typeof v !== 'string')) return null;
  return { subId: stored.subId, endpoint, p256dh, auth, lang };
}

/** 구독을 봉인해 쓴다. 만료는 지켜보기와 같다 */
export async function writeSub(ctx, watchKey, sub, expiresOn) {
  const sealed = sealJson({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, lang: sub.lang }, ctx.sealKeys[0]);
  const value = JSON.stringify({ v: 1, subId: sub.subId, sealed });
  await ctx.kv.exec([['SET', ctx.keys.sub(watchKey), value, 'EXAT', watchExpiryUnix(expiresOn)]]);
}

export async function deleteSub(ctx, watchKey) {
  await ctx.kv.exec([['DEL', ctx.keys.sub(watchKey)]]);
}

// ---- 소유 집합 ----

export async function addOwnerWatch(ctx, ownerHash, watchKey) {
  const key = ctx.keys.owner(ownerHash);
  await ctx.kv.exec([
    ['SADD', key, watchKey],
    ['EXPIREAT', key, Math.floor(ctx.now() / 1000) + OWNER_TTL_SEC],
  ]);
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
 * 지켜보기 하나의 서버 기록을 모두 지운다. 어제(KST)부터 출국일까지의 날짜 기록에서 예약 메시지 id 를 모아
 * 돌려준다(취소는 부르는 쪽이 한다). 출국일 상한(capExpiresOn) 덕에 날짜 수는 최대 48개다.
 */
export async function deleteWatchData(ctx, watchKey, watch) {
  const from = addDays(kstToday(ctx.now()), -1);
  const dates = eachDate(from, watch.expiresOn);
  const days = await readDays(ctx, watchKey, dates);
  const messageIds = [];
  for (const day of days.values()) if (day) messageIds.push(...Object.values(day.armed));
  const writes = [['DEL', ctx.keys.watch(watchKey), ctx.keys.sub(watchKey), ...dates.map((d) => ctx.keys.day(watchKey, d))]];
  for (const date of dates) writes.push(['SREM', ctx.keys.index(date), watchKey]);
  writes.push(['SREM', ctx.keys.owner(watch.ownerHash), watchKey]);
  await ctx.kv.exec(writes);
  return { messageIds };
}
