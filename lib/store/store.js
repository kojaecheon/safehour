// 기기 저장소: 계정 이름공간 영구 저장 (AX-312 · docs/security.md '기기 저장소와 계정 이름공간', lib/store/AGENTS.md)
//
// 저장 매체: localStorage. 화면이 동기로 바로 읽어야 하고(오프라인 보기 전용, useSyncExternalStore),
// 체류 45박 일정도 수백 KB 로 기본 할당량(약 5MB) 안이라 IndexedDB 의 비동기 복잡도가 이득이 없다.
//
// 원칙
//   - 서버는 아무것도 저장하지 않는다. 계정별 데이터는 이 기기의 `safehour.v2.<accountKey>.*` 에만 있다.
//   - accountKey 는 서버가 세션에서 주는 불투명 값이다. 원래 계정 식별자는 이 모듈에 들어오지 않는다.
//   - **보기 전용**(세션 없음·만료·오프라인): 마지막으로 로그인한 계정의 이름공간을 읽을 수 있고,
//     사용자 쓰기는 모두 READ_ONLY 로 거부한다. 예외는 삭제(내 정보 지우기, 자동 삭제, 만료 정리),
//     기기 언어, 보호자 링크 임시 보관이다 — 모두 계정 데이터를 새로 만들지 않는다.
//     서버 알림의 '돌아왔어요' 대기열(writeBackQueue)도 예외다. 일정 편집이 아니라 버튼이 눌렸다는 확인 신호이고,
//     이미 있는 guardianWatch 레코드의 backQueue 와 보낸 확인(confirmed)만 바꾼다. 다른 필드는 쓰기 가능할 때만 바뀐다.
//   - 서버 삭제 대기(pendingServerDelete): 지켜보기를 지우는 길(끄기, 내 정보 지우기, 자동 삭제, 체류 삭제, 동의 철회)은
//     식별 값을 읽어 두고 레코드를 지운 뒤 대기에 넣고 DELETE /api/watch 를 이 저장소가 직접 보낸다(로그아웃 보류와 같은 방식).
//   - 읽은 값은 얼린 스냅샷이다. 바뀌지 않았으면 같은 참조를 돌려준다(useSyncExternalStore 호환).
//     고칠 때는 새 객체를 만들어 write* 로 넘긴다.
//   - 쓰기 결과는 `{ ok: true }` 또는 `{ ok: false, code: STORE_ERROR.* }` 다. 예외를 던지지 않는다.
//
// 저장소·탭 저장소·시각·네트워크는 모두 주입한다. 브라우저 기본 인스턴스는 ./index.js 의 getStore().

import { WATCH_KIND, removeRequest } from '../../src/guardian/watchRequests.js';
import { sendWatchRequest } from '../../src/guardian/watchSend.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { KST_OFFSET_MIN, diffDays, isDateString, parseInstantMs } from '../../src/stay/time.js';
import { CLEARABLE_KEYS as LEGACY_TAB_KEYS } from '../session.js';
import { FINGERPRINT_PATTERN } from './fingerprint.js';
import {
  ACCOUNT_RECORDS,
  DEVICE_KEY,
  READ_ONLY_REASON,
  RECORD,
  SCHEMA_VERSION,
  STORE_ERROR,
  STORE_PREFIX,
  TOPICS,
  accountRecordKey,
  isAccountKey,
  parseStoreKey,
} from './keys.js';
import { PENDING_DELETE_MAX, normalizeBackQueue, normalizeConfirmed, normalizeGuardianWatch, normalizePendingDelete } from './guardianWatch.js';
import { createMemoryStorage } from './memoryStorage.js';
import {
  PENDING_GUARDIAN_LINK_KEY,
  clearPendingGuardianLink,
  holdPendingGuardianLink,
  takePendingGuardianLink,
} from './pendingGuardianLink.js';

/** 지원 언어 (docs/business-rules.md '언어') */
export const SUPPORTED_LANGS = Object.freeze(['ko', 'en', 'ja', 'zh']);

/** AI 소개 문장 캐시 항목 상한 — 오래된 것부터 밀어낸다 */
export const AI_INTRO_CACHE_MAX = 100;

const SESSION_URL = '/api/auth/session';
const LOGOUT_URL = '/api/auth/logout';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/** 서버 삭제 대기 요청 하나의 시간 한도 */
const WATCH_DELETE_TIMEOUT_MS = 10_000;
/** 서버 삭제 결과 중 대기에서 빼는 것: 지웠다, 이미 없다(404), 다시 보내도 같은 거절(400). 그 밖은 남겨 다시 보낸다 */
const WATCH_DELETE_DONE = new Set([WATCH_KIND.OK, WATCH_KIND.NOT_FOUND, WATCH_KIND.BAD]);
const CACHE_KEY_RE = /^[A-Za-z0-9_:.-]{1,256}$/;

const OK = Object.freeze({ ok: true });
const EMPTY_LIST = Object.freeze([]);
const EMPTY_SEEN = Object.freeze({ notified: EMPTY_LIST, dismissed: EMPTY_LIST });
const EMPTY_MAP = Object.freeze({});
const NO_CONSENT = Object.freeze({ sensitive: null });

function fail(code) {
  return { ok: false, code };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return object !== null && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

/** 기기 시간대와 무관한 KST 날짜 "YYYY-MM-DD" */
export function todayKst(nowMs) {
  return new Date(nowMs + KST_OFFSET_MIN * 60 * 1000).toISOString().slice(0, 10);
}

/** 안내문 확인 키, `${instructionId}@${updatedAt}` (docs/business-rules.md '병원 연동': 갱신 시각이 바뀌면 확인이 풀린다) */
export function instructionAckKey(instruction) {
  return `${instruction?.id}@${instruction?.updatedAt}`;
}

/** 안내문 확인 여부 — 내용이 바뀌면(updatedAt 변경) 키가 달라져 풀린다 */
export function isInstructionAcknowledged(linkedPlan, instruction) {
  return linkedPlan?.acknowledged?.[instructionAckKey(instruction)] === true;
}

/** 받은 지침에서 instructions[].acknowledged 를 버린다 — 확인 기록의 정본은 LinkedPlan.acknowledged */
function stripInstructionAcks(plan) {
  if (!Array.isArray(plan?.instructions)) return plan;
  return {
    ...plan,
    instructions: plan.instructions.map((item) => {
      if (!isPlainObject(item)) return item;
      const { acknowledged: _dropped, ...rest } = item;
      return rest;
    }),
  };
}

/** ISO 8601 날짜·시각 + 시간대(Z 또는 ±HH:MM) — 절대 시각으로만 읽히는 값 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoInstant(value) {
  return typeof value === 'string' && ISO_INSTANT_RE.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * 기기 모델의 민감정보 동의 기록 (docs/security.md '민감정보 동의'): `{ version: 비어 있지 않은 문자열, agreedAt: ISO 시각 }`.
 * 서버 요청 모델(PlanStay)의 boolean 표현은 기기 저장소에서 동의로 인정하지 않는다.
 */
function isDeviceConsentRecord(sensitive) {
  return (
    isPlainObject(sensitive) &&
    typeof sensitive.version === 'string' &&
    sensitive.version.trim() !== '' &&
    isIsoInstant(sensitive.agreedAt)
  );
}

function hasDeviceConsent(stay) {
  return isDeviceConsentRecord(stay?.consent?.sensitive);
}

function isValidInstructionRef(instruction) {
  return typeof instruction?.id === 'string' && instruction.id !== '' && typeof instruction?.updatedAt === 'string' && instruction.updatedAt !== '';
}

/**
 * @typedef {object} StoreStatus
 * @property {boolean} sessionChecked  세션 응답을 한 번이라도 받았는가 (전에는 배너 깜빡임을 피할 수 있다)
 * @property {boolean} authenticated   유효한(만료 전) 세션이 있는가
 * @property {boolean} online
 * @property {boolean} readOnly        보기 전용: 배너 표시(오프라인이면 '인터넷 연결 없음' 제목), 생성·편집·연동·공유 차단
 * @property {null | 'NO_SESSION' | 'SESSION_EXPIRED' | 'OFFLINE'} reason
 * @property {string | null} accountKey 읽기에 쓰는 이름공간 — 세션 계정, 없으면 마지막 로그인 계정
 * @property {boolean} persistent      영구 저장소를 쓰는가 (false 면 페이지를 닫으면 사라진다)
 * @property {boolean} logoutPending   '내 정보 지우기' 뒤 로그아웃이 아직 서버에 닿지 않았다 — 그동안은 로그인으로 보지 않는다
 */

/**
 * @param {object} [options]
 * @param {Storage} [options.storage]     영구 저장소 (브라우저: localStorage). 없으면 메모리
 * @param {Storage|null} [options.tabStorage] 탭 저장소 (브라우저: sessionStorage) — 보호자 링크 임시 보관과 기존 키 삭제
 * @param {() => number} [options.now]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {boolean} [options.online]
 * @param {{setTimeout: Function, clearTimeout: Function} | null} [options.timers] 세션 만료 시각에 상태를 다시 알린다
 * @param {boolean} [options.locked]      서버 렌더링용 — 언제나 비어 있는 보기 전용, 어떤 기록도 하지 않는다
 */
export function createStore({
  storage,
  tabStorage = null,
  now = () => Date.now(),
  fetchImpl = (...args) => globalThis.fetch(...args),
  online = true,
  timers = null,
  locked = false,
} = {}) {
  const local = storage ?? createMemoryStorage();
  const persistent = Boolean(storage) && !locked;

  /** fullKey → { raw, value } — 같은 원문이면 같은 얼린 값 */
  const cache = new Map();
  /** 파생 읽기의 참조 안정화 */
  const memos = new Map();
  /** topic → Set<listener> */
  const listeners = new Map();

  /** @type {{accountKey: string, expiresAtMs: number} | null} */
  let session = null;
  let sessionChecked = false;
  let isOnline = online !== false;
  let statusSnapshot = null;
  let expiryTimer = null;
  /** 로그아웃 보류 — 저장소 기록이 막혀도 이 인스턴스에서는 지킨다 */
  let logoutPendingInMemory = false;
  /** 진행 중인 로그아웃 요청 — 동시에 두 번 보내지 않는다 */
  let logoutInFlight = null;
  /** 진행 중인 서버 삭제 대기 비우기. 지켜보기마다 요청은 하나다 */
  let deleteInFlight = null;
  /** 저장소에 쓰지 못한 서버 삭제 대기. 쓰기 토큰을 잃지 않게 이 인스턴스에서는 지킨다(로그아웃 보류와 같은 방식) */
  let pendingDeleteInMemory = EMPTY_LIST;
  /**
   * 이 인스턴스에서 끝난(200·404·400) 서버 삭제 대기 항목(pendingKeyOf). 끝난 뒤 대기를 저장소에 다시 쓰지 못하면 저장소에는
   * 예전 목록이 남는다. 읽을 때 저장소 몫에서 이 항목을 빼 끝난 삭제가 되살아나지 않게 한다. 바뀔 때마다 새 Set 이다(memo 비교)
   */
  let finishedDeletes = new Set();

  // ── 저장소 접근 (접근 차단·할당량 초과를 예외 없이 다룬다) ────────────

  function rawGet(key) {
    try {
      return local.getItem(key);
    } catch {
      return null;
    }
  }

  function rawRemove(key) {
    try {
      local.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function listKeys() {
    const keys = [];
    try {
      for (let i = 0; i < local.length; i += 1) {
        const key = local.key(i);
        if (key !== null) keys.push(key);
      }
    } catch {
      // 목록을 못 읽으면 빈 목록
    }
    return keys;
  }

  function listAccountKeys() {
    const found = new Set();
    for (const key of listKeys()) {
      const parsed = parseStoreKey(key);
      if (parsed?.kind === 'account') found.add(parsed.accountKey);
    }
    return [...found];
  }

  /** 봉투 `{ schemaVersion: 2, data }` 를 풀어 얼린 값을 돌려준다. 없거나 다른 버전·깨진 값이면 null */
  function readRecord(fullKey) {
    const raw = rawGet(fullKey);
    if (raw === null) {
      cache.delete(fullKey);
      return null;
    }
    const hit = cache.get(fullKey);
    if (hit && hit.raw === raw) return hit.value;
    let value = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion === SCHEMA_VERSION && hasOwn(parsed, 'data')) value = deepFreeze(parsed.data ?? null);
    } catch {
      value = null;
    }
    cache.set(fullKey, { raw, value });
    return value;
  }

  function writeRecord(fullKey, data) {
    let raw;
    try {
      raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION, data });
      local.setItem(fullKey, raw);
    } catch {
      return false;
    }
    cache.set(fullKey, { raw, value: deepFreeze(JSON.parse(raw).data ?? null) });
    return true;
  }

  function removeRecord(fullKey) {
    cache.delete(fullKey);
    return rawRemove(fullKey);
  }

  function memo(name, deps, compute) {
    const hit = memos.get(name);
    if (hit && hit.deps.length === deps.length && hit.deps.every((dep, i) => Object.is(dep, deps[i]))) return hit.value;
    const value = compute();
    memos.set(name, { deps, value });
    return value;
  }

  // ── 구독 ─────────────────────────────────────────────────────────

  function emit(topic, accountKey) {
    const event = { topic, accountKey };
    for (const set of [listeners.get(topic), listeners.get('*')]) {
      if (!set) continue;
      for (const listener of [...set]) listener(event);
    }
  }

  function emitAllData(accountKey) {
    for (const topic of ACCOUNT_RECORDS) emit(topic, accountKey);
  }

  /**
   * 주제를 구독한다. 리스너는 `{ topic, accountKey }` 를 받고, 값은 read* 로 다시 읽는다.
   * @param {'stay'|'tripPlan'|'todayEvents'|'prefs'|'guardianCopies'|'aiIntroCache'|'notificationSchedule'|'overdueSeen'|'guardianWatch'|'status'|'*'} topic
   * @returns {() => void} 구독 해제
   */
  function subscribe(topic, listener) {
    if (topic !== '*' && !TOPICS.includes(topic)) throw new TypeError(`알 수 없는 구독 주제: ${String(topic)}`);
    if (typeof listener !== 'function') throw new TypeError('리스너는 함수여야 합니다.');
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(listener);
    return () => {
      listeners.get(topic)?.delete(listener);
    };
  }

  // ── 상태 · 보기 전용 신호 ───────────────────────────────────────────

  function readLastAccountKey() {
    if (locked) return null;
    const record = readRecord(DEVICE_KEY.lastAccountKey);
    return isAccountKey(record?.accountKey) ? record.accountKey : null;
  }

  /** '내 정보 지우기' 뒤 로그아웃이 서버에 닿지 않았는가 — 기기 표시(다른 인스턴스·다음 실행 포함) 또는 이 인스턴스 기억 */
  function isLogoutPending() {
    if (locked) return false;
    return logoutPendingInMemory || rawGet(DEVICE_KEY.logoutPending) !== null;
  }

  /** @returns {StoreStatus} */
  function getStatus() {
    let next;
    if (locked) {
      next = { sessionChecked: false, authenticated: false, online: isOnline, readOnly: true, reason: READ_ONLY_REASON.NO_SESSION, accountKey: null, persistent, logoutPending: false };
    } else {
      const logoutPending = isLogoutPending();
      // 로그아웃 보류 중에는 어떤 세션도 로그인으로 보지 않고, 읽을 계정도 없다(모두 지웠다)
      const active = logoutPending ? null : session;
      const expired = active !== null && now() >= active.expiresAtMs;
      const authenticated = active !== null && !expired;
      let reason = null;
      if (!isOnline) reason = READ_ONLY_REASON.OFFLINE;
      else if (active === null) reason = READ_ONLY_REASON.NO_SESSION;
      else if (expired) reason = READ_ONLY_REASON.SESSION_EXPIRED;
      next = {
        sessionChecked,
        authenticated,
        online: isOnline,
        readOnly: reason !== null,
        reason,
        accountKey: logoutPending ? null : active?.accountKey ?? readLastAccountKey(),
        persistent,
        logoutPending,
      };
    }
    const prev = statusSnapshot;
    if (prev && Object.keys(next).every((key) => prev[key] === next[key])) return prev;
    statusSnapshot = Object.freeze(next);
    return statusSnapshot;
  }

  /** 상태를 바꾸는 동작을 감싸 바뀐 만큼 알린다 */
  function transition(mutate) {
    const before = getStatus();
    mutate();
    const after = getStatus();
    if (after !== before) emit('status', after.accountKey);
    if (after.accountKey !== before.accountKey) emitAllData(after.accountKey);
    return after;
  }

  function scheduleExpiry() {
    if (!timers) return;
    if (expiryTimer !== null) timers.clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!session) return;
    const delay = session.expiresAtMs - now();
    if (delay <= 0) return;
    expiryTimer = timers.setTimeout(() => {
      expiryTimer = null;
      transition(() => {});
    }, Math.min(delay, MAX_TIMER_MS));
  }

  function applySession(body) {
    sessionChecked = true;
    if (isLogoutPending()) {
      // 서버 쿠키가 아직 남아 있어도 로그인으로 보지 않는다. 마지막 계정도 기록하지 않는다.
      session = null;
      scheduleExpiry();
      return;
    }
    const accountKey = body?.authenticated === true ? body.accountKey : null;
    const expiresAtMs = typeof body?.expiresAt === 'string' ? Date.parse(body.expiresAt) : Number.NaN;
    if (isAccountKey(accountKey) && Number.isFinite(expiresAtMs)) {
      session = { accountKey, expiresAtMs };
      // 원래 식별자는 받지도 저장하지도 않는다 — 불투명 키만 남긴다
      if (readLastAccountKey() !== accountKey) writeRecord(DEVICE_KEY.lastAccountKey, { accountKey });
    } else {
      session = null;
    }
    scheduleExpiry();
  }

  /**
   * GET /api/auth/session 응답 본문을 반영한다. `accountKey`·`authenticated`·`expiresAt` 만 읽는다.
   * @param {{authenticated?: boolean, accountKey?: string|null, expiresAt?: string|null} | null} body
   */
  function setSession(body) {
    if (locked) return getStatus();
    return transition(() => applySession(body));
  }

  /** 온라인이 되면 보류 중인 로그아웃과 서버 삭제 대기를 다시 보낸다 */
  function setOnline(value) {
    const status = transition(() => {
      isOnline = value !== false;
    });
    if (isOnline && logoutInFlight === null && isLogoutPending()) void retryPendingLogout();
    if (isOnline) kickPendingServerDelete();
    return status;
  }

  // ── 로그아웃 보류 (lib/store/AGENTS.md) ─────────────────────────────

  function markLogoutPending() {
    logoutPendingInMemory = true;
    writeRecord(DEVICE_KEY.logoutPending, { since: toIso(now()) });
  }

  function clearLogoutPending() {
    logoutPendingInMemory = false;
    removeRecord(DEVICE_KEY.logoutPending);
  }

  /**
   * POST /api/auth/logout. 성공 응답을 받았을 때만 보류 표시를 지운다.
   * @returns {Promise<'ok' | 'network' | 'failed'>}
   */
  function attemptLogout() {
    if (logoutInFlight) return logoutInFlight;
    logoutInFlight = (async () => {
      let res;
      try {
        res = await fetchImpl(LOGOUT_URL, { method: 'POST', credentials: 'same-origin' });
      } catch {
        return 'network';
      }
      if (!res?.ok) return 'failed';
      transition(clearLogoutPending);
      return 'ok';
    })().finally(() => {
      logoutInFlight = null;
    });
    return logoutInFlight;
  }

  /**
   * 보류 중인 로그아웃을 다시 보낸다. 보류가 없으면 바로 true.
   * @returns {Promise<boolean>} 로그아웃이 끝났는가
   */
  async function retryPendingLogout() {
    if (locked) return false;
    if (!isLogoutPending()) return true;
    const outcome = await attemptLogout();
    if (outcome === 'network') setOnline(false);
    return !isLogoutPending();
  }

  /**
   * 세션을 서버에 묻는다. 네트워크 오류면 오프라인 보기 전용으로 둔다.
   * 로그아웃 보류 중이면 먼저 로그아웃을 다시 보낸다 — 남은 쿠키로 다시 로그인되지 않게 한다.
   */
  async function refreshSession() {
    if (locked) return getStatus();
    if (isLogoutPending() && (await attemptLogout()) === 'network') return setOnline(false);
    let res;
    try {
      res = await fetchImpl(SESSION_URL, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
    } catch {
      return setOnline(false);
    }
    let body = null;
    if (res?.ok) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    return transition(() => {
      isOnline = true;
      applySession(body);
    });
  }

  /** 쓰기 가능한 계정 키. 보기 전용이면 null */
  function writableAccount() {
    const status = getStatus();
    return status.readOnly || !status.accountKey ? null : status.accountKey;
  }

  function readAccount(record) {
    const accountKey = getStatus().accountKey;
    return accountKey ? readRecord(accountRecordKey(accountKey, record)) : null;
  }

  function commit(accountKey, record, data) {
    if (!writeRecord(accountRecordKey(accountKey, record), data)) return fail(STORE_ERROR.STORAGE_FAILED);
    emit(record, accountKey);
    return OK;
  }

  // ── 체류 (Stay) ──────────────────────────────────────────────────

  function readStay() {
    return readAccount(RECORD.stay);
  }

  /** 체류를 저장한다. 조건 기간·연동 지침이 있으면 민감정보 동의가 있어야 한다 */
  function putStay(accountKey, stay) {
    if (!isPlainObject(stay)) return fail(STORE_ERROR.INVALID);
    const periods = stay.periods ?? [];
    const linkedPlans = stay.linkedPlans ?? [];
    if (!Array.isArray(periods) || !Array.isArray(linkedPlans)) return fail(STORE_ERROR.INVALID);
    // 동의 기록은 기기 형식만 받는다: sensitive = { version, agreedAt } | null
    const rawConsent = stay.consent === undefined ? NO_CONSENT : stay.consent;
    if (!isPlainObject(rawConsent)) return fail(STORE_ERROR.INVALID);
    const sensitive = rawConsent.sensitive ?? null;
    if (sensitive !== null && !isDeviceConsentRecord(sensitive)) return fail(STORE_ERROR.INVALID);
    if ((periods.length > 0 || linkedPlans.length > 0) && sensitive === null) {
      return fail(STORE_ERROR.CONSENT_REQUIRED);
    }
    const consent = { sensitive: sensitive === null ? null : { version: sensitive.version, agreedAt: sensitive.agreedAt } };
    const prev = readRecord(accountRecordKey(accountKey, RECORD.stay));
    const nowIso = toIso(now());
    return commit(accountKey, RECORD.stay, {
      ...stay,
      schemaVersion: SCHEMA_VERSION,
      periods,
      linkedPlans,
      consent,
      guardianShare: stay.guardianShare ?? null,
      createdAt: prev?.createdAt ?? stay.createdAt ?? nowIso,
      updatedAt: nowIso,
    });
  }

  function writeStay(stay) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    return putStay(accountKey, stay);
  }

  /** 현재 체류(없으면 null)를 받아 다음 체류를 돌려주는 함수로 고친다 */
  function updateStay(updater) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (typeof updater !== 'function') return fail(STORE_ERROR.INVALID);
    return putStay(accountKey, updater(readRecord(accountRecordKey(accountKey, RECORD.stay))));
  }

  /** 체류 안의 항목을 고친다. mutator 는 다음 체류 또는 실패 결과를 돌려준다 */
  function mutateStay(accountKey, mutator) {
    const current = readRecord(accountRecordKey(accountKey, RECORD.stay));
    if (!current) return fail(STORE_ERROR.NO_STAY);
    const next = mutator(current);
    if (next?.ok === false) return next;
    return putStay(accountKey, next);
  }

  function readPeriods() {
    return readStay()?.periods ?? EMPTY_LIST;
  }

  function writePeriods(periods) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!Array.isArray(periods)) return fail(STORE_ERROR.INVALID);
    return mutateStay(accountKey, (stay) => ({ ...stay, periods }));
  }

  function readConsent() {
    return readStay()?.consent ?? NO_CONSENT;
  }

  /** 민감정보 동의 — 문구 버전과 동의 시각을 남긴다 */
  function grantSensitiveConsent({ version } = {}) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (typeof version !== 'string' || version.trim() === '') return fail(STORE_ERROR.INVALID);
    return mutateStay(accountKey, (stay) => ({
      ...stay,
      consent: { ...(stay.consent ?? {}), sensitive: { version, agreedAt: toIso(now()) } },
    }));
  }

  /**
   * 동의 철회 (docs/security.md '민감정보 동의'): SELF 기간, HOSPITAL 기간, 연동 지침 사본(연결 코드 포함)을 지운다.
   * 지운 지침을 가리키는 병원 연결(linkedPlanId)도 끊는다. 재계획은 구독자(T15a)가 한다.
   */
  function withdrawSensitiveConsent() {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    let removedPeriods = 0;
    let removedLinkedPlans = 0;
    const result = mutateStay(accountKey, (stay) => {
      removedPeriods = stay.periods?.length ?? 0;
      removedLinkedPlans = stay.linkedPlans?.length ?? 0;
      return {
        ...stay,
        periods: [],
        linkedPlans: [],
        consent: { ...(stay.consent ?? {}), sensitive: null },
        hospitals: (stay.hospitals ?? []).map((hospital) => {
          if (!hasOwn(hospital, 'linkedPlanId')) return hospital;
          const { linkedPlanId: _unlinked, ...rest } = hospital;
          return rest;
        }),
      };
    });
    if (!result.ok) return result;
    // 철회가 일어나는 곳은 여기 하나라, 서버 알림 지켜보기도 여기서 지운다(계획 다르게 정한 것 13)
    if (retireWatchOf(accountKey)) kickPendingServerDelete();
    return { ok: true, removedPeriods, removedLinkedPlans };
  }

  function readLinkedPlans() {
    return readStay()?.linkedPlans ?? EMPTY_LIST;
  }

  /**
   * 연동 지침 사본을 저장한다(연결 코드 기준으로 교체). 받은 지침은 그대로 두되
   * instructions[].acknowledged 는 버리고, 기존 확인 기록 중 지금 안내문(id@updatedAt)과 맞는 것만 남긴다.
   * @param {{code: string, hospitalId: string, plan: object, fetchedAt?: string}} linkedPlan
   */
  function upsertLinkedPlan({ code, hospitalId, plan, fetchedAt } = {}) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (typeof code !== 'string' || code.trim() === '' || code.length > 64) return fail(STORE_ERROR.INVALID);
    if (typeof hospitalId !== 'string' || hospitalId === '' || !isPlainObject(plan)) return fail(STORE_ERROR.INVALID);
    if (fetchedAt !== undefined && parseInstantMs(fetchedAt) === null) return fail(STORE_ERROR.INVALID);
    const cleanPlan = stripInstructionAcks(plan);
    const liveKeys = new Set((cleanPlan.instructions ?? []).filter(isValidInstructionRef).map(instructionAckKey));
    return mutateStay(accountKey, (stay) => {
      if (!hasDeviceConsent(stay)) return fail(STORE_ERROR.CONSENT_REQUIRED);
      const list = stay.linkedPlans ?? [];
      const existing = list.find((item) => item.code === code);
      const acknowledged = {};
      for (const key of Object.keys(existing?.acknowledged ?? {})) {
        if (liveKeys.has(key) && existing.acknowledged[key] === true) acknowledged[key] = true;
      }
      const entry = { code, hospitalId, plan: cleanPlan, fetchedAt: fetchedAt ?? toIso(now()), acknowledged };
      return {
        ...stay,
        linkedPlans: existing ? list.map((item) => (item.code === code ? entry : item)) : [...list, entry],
      };
    });
  }

  /** 안내문 확인 — 지금 지침에 같은 id·updatedAt 의 안내문이 있어야 한다 */
  function acknowledgeInstruction(code, instruction) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isValidInstructionRef(instruction)) return fail(STORE_ERROR.INVALID);
    return mutateStay(accountKey, (stay) => {
      const list = stay.linkedPlans ?? [];
      const target = list.find((item) => item.code === code);
      const present = target?.plan?.instructions?.some(
        (item) => item?.id === instruction.id && item?.updatedAt === instruction.updatedAt,
      );
      if (!target || !present) return fail(STORE_ERROR.INVALID);
      const acknowledged = { ...(target.acknowledged ?? {}), [instructionAckKey(instruction)]: true };
      return { ...stay, linkedPlans: list.map((item) => (item === target ? { ...item, acknowledged } : item)) };
    });
  }

  /** 연동 지침 사본을 지운다 — 그 지침의 HOSPITAL 기간과 병원 연결도 함께 지운다 */
  function removeLinkedPlan(code) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    return mutateStay(accountKey, (stay) => {
      const target = (stay.linkedPlans ?? []).find((item) => item.code === code);
      if (!target) return stay;
      const planId = target.plan?.planId;
      return {
        ...stay,
        linkedPlans: stay.linkedPlans.filter((item) => item !== target),
        periods: (stay.periods ?? []).filter((p) => !(p?.source === 'HOSPITAL' && planId !== undefined && p.planId === planId)),
        hospitals: (stay.hospitals ?? []).map((hospital) => {
          if (planId === undefined || hospital?.linkedPlanId !== planId) return hospital;
          const { linkedPlanId: _unlinked, ...rest } = hospital;
          return rest;
        }),
      };
    });
  }

  function readGuardianShare() {
    return readStay()?.guardianShare ?? null;
  }

  /** 보호자 링크를 보낸 시각과 그때 일정 지문만 담는다. null 이면 지운다 */
  function writeGuardianShare(share) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    let next = null;
    if (share !== null) {
      if (parseInstantMs(share?.lastSentAt) === null || !FINGERPRINT_PATTERN.test(share?.planFingerprint ?? '')) {
        return fail(STORE_ERROR.INVALID);
      }
      next = { lastSentAt: share.lastSentAt, planFingerprint: share.planFingerprint };
    }
    return mutateStay(accountKey, (stay) => ({ ...stay, guardianShare: next }));
  }

  // ── 서버 알림 (guardianWatch · 서버 삭제 대기) ──────────────────────
  // 모양은 lib/store/guardianWatch.js, 정한 것은 docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 5.

  /** 지금 읽는 계정의 지켜보기 레코드(보기 전용에서도 읽힌다). 없거나 형식이 틀리면 null */
  function readGuardianWatch() {
    const accountKey = getStatus().accountKey;
    if (!accountKey) return null;
    const raw = readRecord(accountRecordKey(accountKey, RECORD.guardianWatch));
    return memo('guardianWatch', [raw], () => {
      const record = normalizeGuardianWatch(raw);
      return record === null ? null : deepFreeze(record);
    });
  }

  /** 정규화한 레코드를 쓴다. 저장된 것과 같으면 쓰지도 알리지도 않는다 */
  function putGuardianWatch(accountKey, record) {
    const current = readRecord(accountRecordKey(accountKey, RECORD.guardianWatch));
    if (current !== null && JSON.stringify(current) === JSON.stringify(record)) return OK;
    return commit(accountKey, RECORD.guardianWatch, record);
  }

  /**
   * 지켜보기 레코드를 쓴다(쓰기 가능할 때만). null 이면 지운다. 서버 삭제 대기에는 넣지 않는다(그 길은 retireGuardianWatch).
   * 같은 watchId 의 레코드가 저장돼 있으면 저장된 backQueue 와 confirmed 를 그대로 둔다. 받은 값은 새로 만들 때(레코드가 없거나
   * watchId 가 다를 때)만 쓴다. 둘은 writeBackQueue 로만 바뀐다: 앞서 읽은 레코드로 쓰는 동안 눌린 '돌아왔어요'와 그 결과를
   * 덮지 않는다. 같은 watchId 다시 등록(REPLACED)에서 confirmed 가 남는 것은 서버가 그 날짜의 확인 기록을 지키기 때문이다.
   */
  function writeGuardianWatch(record) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    const key = accountRecordKey(accountKey, RECORD.guardianWatch);
    if (record === null) {
      if (rawGet(key) === null) return OK;
      if (!removeRecord(key)) return fail(STORE_ERROR.STORAGE_FAILED);
      emit(RECORD.guardianWatch, accountKey);
      return OK;
    }
    const next = normalizeGuardianWatch(record);
    if (next === null) return fail(STORE_ERROR.INVALID);
    const stored = normalizeGuardianWatch(readRecord(key));
    if (stored !== null && stored.watchId === next.watchId) {
      return putGuardianWatch(accountKey, { ...next, backQueue: stored.backQueue, confirmed: stored.confirmed });
    }
    return putGuardianWatch(accountKey, next);
  }

  /**
   * '돌아왔어요' 대기열(과 넘기면 보낸 확인 confirmed)만 바꾼다. 보기 전용 예외는 이것 하나다: 읽는 계정 키가 있고
   * (로그아웃 보류 중이면 없다) 그 계정에 레코드가 있으면 세션 만료·세션 없음·오프라인에서도 쓴다. 다른 필드는 저장된 값 그대로다.
   * confirmed 를 넘기지 않으면 저장된 값 그대로다. 둘을 함께 넘기면 한 번에 쓴다(확인 결과와 대기열이 어긋나지 않게).
   * @param {Array<{ date: string, by: string, undo: boolean, atMs?: number }>} queue
   * @param {{ confirmed?: Array<{ date: string, by: string, atMs: number }> }} [options]
   */
  function writeBackQueue(queue, { confirmed } = {}) {
    if (locked) return fail(STORE_ERROR.READ_ONLY);
    const accountKey = getStatus().accountKey;
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!Array.isArray(queue)) return fail(STORE_ERROR.INVALID);
    if (confirmed !== undefined && !Array.isArray(confirmed)) return fail(STORE_ERROR.INVALID);
    const stored = normalizeGuardianWatch(readRecord(accountRecordKey(accountKey, RECORD.guardianWatch)));
    if (stored === null) return fail(STORE_ERROR.NO_GUARDIAN_WATCH);
    return putGuardianWatch(accountKey, {
      ...stored,
      backQueue: normalizeBackQueue(queue),
      confirmed: confirmed === undefined ? stored.confirmed : normalizeConfirmed(confirmed),
    });
  }

  /**
   * 서버 삭제 대기 { watchId, writeToken }[] (오래된 것이 앞). 저장소에 쓰지 못해 이 인스턴스가 기억하는 것도 함께다.
   * 저장소 몫에서는 이 인스턴스에서 이미 끝난 항목(finishedDeletes)을 뺀다.
   */
  function readPendingServerDelete() {
    if (locked) return EMPTY_LIST;
    const raw = readRecord(DEVICE_KEY.pendingServerDelete);
    return memo('pendingServerDelete', [raw, pendingDeleteInMemory, finishedDeletes], () => {
      const stored = (Array.isArray(raw) ? raw : []).filter((item) => !finishedDeletes.has(pendingKeyOf(item)));
      return deepFreeze(normalizePendingDelete([...stored, ...pendingDeleteInMemory]));
    });
  }

  /**
   * 서버 삭제 대기 전체를 쓴다. 비면 기기 키를 지운다. 쓰지 못하면 목록을 메모리에 남겨 이 인스턴스가 계속 보낸다
   * (쓰기 토큰을 잃으면 서버 기록을 지울 길이 없다). 쓰면 메모리 몫은 비운다(저장소에 다 들어갔다).
   * @returns {boolean} 저장소에 썼는가
   */
  function writePendingServerDelete(list) {
    const next = normalizePendingDelete(list);
    const written = next.length === 0 ? removeRecord(DEVICE_KEY.pendingServerDelete) : writeRecord(DEVICE_KEY.pendingServerDelete, next);
    pendingDeleteInMemory = written ? EMPTY_LIST : Object.freeze(next);
    return written;
  }

  /** 지켜보기 레코드의 식별 값(대기에 넣을 모양). 없거나 틀리면 빈 목록 */
  function watchIdsOf(accountKey) {
    return normalizePendingDelete([readRecord(accountRecordKey(accountKey, RECORD.guardianWatch))]);
  }

  /**
   * 그 계정의 지켜보기 레코드를 서버 삭제 대기로 옮기고 지운다. 쓰기 가능 여부를 보지 않는다(자동 삭제는 로그인 없이 돈다).
   * 레코드의 다른 필드가 깨졌어도 식별 값이 맞으면 대기에 넣는다. 같은 watchId 는 하나, 10개를 넘으면 오래된 것부터 버린다.
   * 식별 값을 먼저 읽어 두고 레코드를 지운 뒤 대기를 쓴다: 저장 공간이 꽉 찬 기기에서도 지운 자리에 대기가 들어간다.
   * 그래도 저장소에 쓰지 못하면 메모리에 남아 삭제 요청은 나간다.
   * @returns {boolean} 지운 레코드가 있었는가
   */
  function retireWatchOf(accountKey) {
    const key = accountRecordKey(accountKey, RECORD.guardianWatch);
    if (rawGet(key) === null) return false;
    const ids = watchIdsOf(accountKey);
    removeRecord(key);
    if (ids.length > 0) writePendingServerDelete([...readPendingServerDelete(), ...ids]);
    emit(RECORD.guardianWatch, accountKey);
    return true;
  }

  /** 서버 알림 끄기(쓰기 가능할 때만): 레코드를 서버 삭제 대기로 옮기고 삭제를 보낸다 */
  function retireGuardianWatch() {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    retireWatchOf(accountKey);
    void retryPendingServerDelete();
    return OK;
  }

  /** 서버 삭제 대기가 있으면 보낸다(기다리지 않는다) */
  function kickPendingServerDelete() {
    if (readPendingServerDelete().length > 0) void retryPendingServerDelete();
  }

  /** 서버 삭제 대기 항목 하나를 가리키는 값(같은 watchId 라도 토큰이 다르면 다른 항목이다). 저장소의 틀린 항목도 받는다 */
  function pendingKeyOf(item) {
    return `${item?.watchId}:${item?.writeToken}`;
  }

  /**
   * 서버 삭제 대기 한 차례: 받은 항목마다 DELETE 를 동시에 보내고, 끝난 것을 finishedDeletes 에 적고 지금 대기(저장소 + 메모리)에서
   * 뺀다. 보낸 항목은 attempted 에 적는다. 보내는 동안 대기에 더해진 항목은 건드리지 않는다.
   */
  async function sendPendingDeletes(items, attempted) {
    for (const item of items) attempted.add(pendingKeyOf(item));
    const outcomes = await Promise.all(
      items.map(async (item) => {
        let request;
        try {
          request = removeRequest(item);
        } catch {
          return { item, done: true };
        }
        const result = await sendWatchRequest(request, { fetchImpl, timeoutMs: WATCH_DELETE_TIMEOUT_MS });
        return { item, done: WATCH_DELETE_DONE.has(result.kind) };
      }),
    );
    const finished = outcomes.filter((o) => o.done).map((o) => o.item);
    if (finished.length === 0) return;
    finishedDeletes = new Set([...finishedDeletes, ...finished.map(pendingKeyOf)]);
    // 저장소 몫은 읽을 때 finishedDeletes 로 빠진다. 메모리 몫도 빼고 쓴다
    const isFinished = (item) => finished.some((f) => f.watchId === item.watchId && f.writeToken === item.writeToken);
    writePendingServerDelete(readPendingServerDelete().filter((item) => !isFinished(item)));
  }

  /**
   * 서버 삭제 대기를 보낸다: 지켜보기마다 DELETE /api/watch { watchId, writeToken } 하나씩, 동시에, 10초 한도.
   * 지웠거나(200) 이미 없거나(404) 거절(400)이면 대기에서 빼고, 연결 실패·429·503 은 남긴다.
   * 이미 도는 중이면 같은 약속을 돌려준다. 한 차례가 끝났을 때 대기에 이 호출에서 아직 보내지 않은 항목이 있으면 그 항목만
   * 다음 차례로 보내고, 그런 항목이 없을 때 약속을 푼다(차례는 대기 상한 PENDING_DELETE_MAX 번까지). 그래서
   * retireGuardianWatch() 뒤에 이 약속을 기다린 쪽은 자기 항목의 시도를 본다. 한 번 보낸 항목은 실패해도 같은 호출에서 다시
   * 보내지 않는다(되풀이 없음). 던지지 않는다.
   * @returns {Promise<{ remaining: number }>}
   */
  function retryPendingServerDelete() {
    if (locked) return Promise.resolve({ remaining: 0 });
    if (deleteInFlight) return deleteInFlight;
    deleteInFlight = (async () => {
      const attempted = new Set();
      for (let pass = 0; pass < PENDING_DELETE_MAX; pass += 1) {
        const items = readPendingServerDelete().filter((item) => !attempted.has(pendingKeyOf(item)));
        if (items.length === 0) break;
        await sendPendingDeletes(items, attempted);
      }
      return { remaining: readPendingServerDelete().length };
    })().finally(() => {
      deleteInFlight = null;
    });
    return deleteInFlight;
  }

  // ── 일정 (TripPlan) ───────────────────────────────────────────────

  function readTripPlan() {
    return readAccount(RECORD.tripPlan);
  }

  function readDayPlan(date) {
    const days = readTripPlan()?.days;
    return hasOwn(days, date) ? days[date] : null;
  }

  function readEdits() {
    return readTripPlan()?.edits ?? EMPTY_MAP;
  }

  /** 일정을 저장한다. edits 가 없으면 기존 편집 기록을 유지한다 */
  function writeTripPlan(plan) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isPlainObject(plan) || !isPlainObject(plan.days)) return fail(STORE_ERROR.INVALID);
    if (plan.edits !== undefined && !isPlainObject(plan.edits)) return fail(STORE_ERROR.INVALID);
    const prev = readRecord(accountRecordKey(accountKey, RECORD.tripPlan));
    return commit(accountKey, RECORD.tripPlan, { ...plan, edits: plan.edits ?? prev?.edits ?? {} });
  }

  function writeEdits(edits) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isPlainObject(edits)) return fail(STORE_ERROR.INVALID);
    const plan = readRecord(accountRecordKey(accountKey, RECORD.tripPlan));
    if (!plan) return fail(STORE_ERROR.NO_TRIP_PLAN);
    return commit(accountKey, RECORD.tripPlan, { ...plan, edits });
  }

  /** 오늘·내일(KST)의 하루 일정 — 보기 전용 화면용 */
  function readTodayTomorrow() {
    const nowMs = now();
    const today = todayKst(nowMs);
    const tomorrow = todayKst(nowMs + DAY_MS);
    const plan = readTripPlan();
    return memo('todayTomorrow', [today, plan], () =>
      Object.freeze({
        today: Object.freeze({ date: today, plan: hasOwn(plan?.days, today) ? plan.days[today] : null }),
        tomorrow: Object.freeze({ date: tomorrow, plan: hasOwn(plan?.days, tomorrow) ? plan.days[tomorrow] : null }),
      }),
    );
  }

  // ── 오늘 사건 (TodayEvents) ──────────────────────────────────────

  /** 오늘(KST) 사건. 저장된 날짜가 오늘이 아니면 지우고 빈 목록 */
  function readTodayEvents() {
    const accountKey = getStatus().accountKey;
    if (!accountKey) return EMPTY_LIST;
    const key = accountRecordKey(accountKey, RECORD.todayEvents);
    const record = readRecord(key);
    if (!record) return EMPTY_LIST;
    if (record.date !== todayKst(now())) {
      removeRecord(key);
      return EMPTY_LIST;
    }
    return Array.isArray(record.events) ? record.events : EMPTY_LIST;
  }

  function appendTodayEvent(event) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isPlainObject(event) || typeof event.type !== 'string') return fail(STORE_ERROR.INVALID);
    const today = todayKst(now());
    const record = readRecord(accountRecordKey(accountKey, RECORD.todayEvents));
    const events = record?.date === today && Array.isArray(record.events) ? record.events : [];
    return commit(accountKey, RECORD.todayEvents, { date: today, events: [...events, event] });
  }

  /** 데모 패널의 '사건 초기화' */
  function clearTodayEvents() {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    removeRecord(accountRecordKey(accountKey, RECORD.todayEvents));
    emit(RECORD.todayEvents, accountKey);
    return OK;
  }

  // ── 설정 (Prefs) ─────────────────────────────────────────────────

  function readLang() {
    if (locked) return null;
    const lang = readRecord(DEVICE_KEY.lang)?.lang;
    return SUPPORTED_LANGS.includes(lang) ? lang : null;
  }

  /** 기기 언어 — 계정 데이터가 아니므로 보기 전용에서도 바꿀 수 있고 '내 정보 지우기' 뒤에도 남는다 */
  function writeLang(lang) {
    if (locked) return fail(STORE_ERROR.READ_ONLY);
    if (!SUPPORTED_LANGS.includes(lang)) return fail(STORE_ERROR.INVALID);
    if (!writeRecord(DEVICE_KEY.lang, { lang })) return fail(STORE_ERROR.STORAGE_FAILED);
    emit(RECORD.prefs, getStatus().accountKey);
    return OK;
  }

  /** @returns {{lang: string|null, notifications: boolean, dailyCheck: Record<string, 'CONFIRMED'>}} */
  function readPrefs() {
    const lang = readLang();
    const record = readAccount(RECORD.prefs);
    return memo('prefs', [lang, record], () =>
      Object.freeze({
        lang,
        notifications: record?.notifications === true,
        dailyCheck: isPlainObject(record?.dailyCheck) ? record.dailyCheck : EMPTY_MAP,
      }),
    );
  }

  function isDailyCheckMap(value) {
    return isPlainObject(value) && Object.entries(value).every(([date, mark]) => isDateString(date) && mark === 'CONFIRMED');
  }

  /** @param {{notifications?: boolean, dailyCheck?: Record<string, 'CONFIRMED'>, lang?: string}} patch */
  function writePrefs(patch) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isPlainObject(patch)) return fail(STORE_ERROR.INVALID);
    if (hasOwn(patch, 'notifications') && typeof patch.notifications !== 'boolean') return fail(STORE_ERROR.INVALID);
    if (hasOwn(patch, 'dailyCheck') && !isDailyCheckMap(patch.dailyCheck)) return fail(STORE_ERROR.INVALID);
    if (hasOwn(patch, 'lang') && !SUPPORTED_LANGS.includes(patch.lang)) return fail(STORE_ERROR.INVALID);
    if (hasOwn(patch, 'lang') && !writeRecord(DEVICE_KEY.lang, { lang: patch.lang })) return fail(STORE_ERROR.STORAGE_FAILED);
    const prev = readRecord(accountRecordKey(accountKey, RECORD.prefs)) ?? {};
    const next = {
      notifications: hasOwn(patch, 'notifications') ? patch.notifications : prev.notifications === true,
      dailyCheck: hasOwn(patch, 'dailyCheck') ? patch.dailyCheck : prev.dailyCheck ?? {},
    };
    return commit(accountKey, RECORD.prefs, next);
  }

  /** 매일 확인 '그대로예요' — 그 날짜를 확인 완료로 남긴다 */
  function confirmDailyCheck(date) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isDateString(date)) return fail(STORE_ERROR.INVALID);
    const prev = readRecord(accountRecordKey(accountKey, RECORD.prefs)) ?? {};
    return commit(accountKey, RECORD.prefs, {
      notifications: prev.notifications === true,
      dailyCheck: { ...(prev.dailyCheck ?? {}), [date]: 'CONFIRMED' },
    });
  }

  // ── 보호자 사본 (보호자 기기) ─────────────────────────────────────

  /** 만료된 사본을 지운다. 지운 개수 */
  function pruneGuardianCopies(accountKey) {
    const key = accountRecordKey(accountKey, RECORD.guardianCopies);
    const record = readRecord(key);
    if (!isPlainObject(record)) return 0;
    const nowMs = now();
    const live = {};
    let removed = 0;
    for (const [id, copy] of Object.entries(record)) {
      const expiresMs = parseInstantMs(copy?.expiresAt);
      if (expiresMs !== null && nowMs < expiresMs) live[id] = copy;
      else removed += 1;
    }
    if (removed === 0) return 0;
    if (Object.keys(live).length === 0) removeRecord(key);
    else writeRecord(key, live);
    return removed;
  }

  /** 만료 전 사본 — 가져온 시각이 늦은 것부터. 만료된 사본은 보여주지 않고 지운다 */
  function readGuardianCopies() {
    const accountKey = getStatus().accountKey;
    if (!accountKey) return EMPTY_LIST;
    pruneGuardianCopies(accountKey);
    const record = readRecord(accountRecordKey(accountKey, RECORD.guardianCopies));
    return memo('guardianCopies', [accountKey, record], () => {
      if (!isPlainObject(record)) return EMPTY_LIST;
      const list = Object.entries(record).map(([id, copy]) => Object.freeze({ id, ...copy }));
      list.sort((a, b) => (parseInstantMs(b.importedAt) ?? 0) - (parseInstantMs(a.importedAt) ?? 0) || a.id.localeCompare(b.id));
      return Object.freeze(list);
    });
  }

  /**
   * 푼 보호자 사본을 저장한다.
   * @param {string} id 링크별 식별자(base64url 1–128자) — 예: 암호문 지문
   * @param {{snapshot: object, importedAt?: string, expiresAt: string}} copy
   */
  function writeGuardianCopy(id, copy) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (typeof id !== 'string' || !ID_RE.test(id) || !isPlainObject(copy) || !isPlainObject(copy.snapshot)) {
      return fail(STORE_ERROR.INVALID);
    }
    const expiresMs = parseInstantMs(copy.expiresAt);
    if (expiresMs === null) return fail(STORE_ERROR.INVALID);
    if (copy.importedAt !== undefined && parseInstantMs(copy.importedAt) === null) return fail(STORE_ERROR.INVALID);
    if (now() >= expiresMs) return fail(STORE_ERROR.EXPIRED);
    const key = accountRecordKey(accountKey, RECORD.guardianCopies);
    const record = readRecord(key) ?? {};
    return commit(accountKey, RECORD.guardianCopies, {
      ...record,
      [id]: { snapshot: copy.snapshot, importedAt: copy.importedAt ?? toIso(now()), expiresAt: copy.expiresAt },
    });
  }

  function removeGuardianCopy(id) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    const key = accountRecordKey(accountKey, RECORD.guardianCopies);
    const record = readRecord(key);
    if (!hasOwn(record, id)) return OK;
    const { [id]: _removed, ...rest } = record;
    if (Object.keys(rest).length === 0) {
      removeRecord(key);
      emit(RECORD.guardianCopies, accountKey);
      return OK;
    }
    return commit(accountKey, RECORD.guardianCopies, rest);
  }

  // ── AI 소개 문장 캐시 ────────────────────────────────────────────

  /** 같은 입력이면 저장된 문장을 다시 쓴다 (docs/business-rules.md 'AI 소개 문장'). @returns {{text: string, source: 'AI'|'TEMPLATE'} | null} */
  function readAiIntro(cacheKey) {
    const record = readAccount(RECORD.aiIntroCache);
    return hasOwn(record, cacheKey) ? record[cacheKey]?.intro ?? null : null;
  }

  function writeAiIntro(cacheKey, intro) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (typeof cacheKey !== 'string' || !CACHE_KEY_RE.test(cacheKey)) return fail(STORE_ERROR.INVALID);
    if (typeof intro?.text !== 'string' || intro.text === '' || !['AI', 'TEMPLATE'].includes(intro.source)) {
      return fail(STORE_ERROR.INVALID);
    }
    const record = readRecord(accountRecordKey(accountKey, RECORD.aiIntroCache)) ?? {};
    const entries = Object.entries(record).filter(([key]) => key !== cacheKey);
    entries.push([cacheKey, { intro: { text: intro.text, source: intro.source }, at: now() }]);
    entries.sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0));
    return commit(accountKey, RECORD.aiIntroCache, Object.fromEntries(entries.slice(-AI_INTRO_CACHE_MAX)));
  }

  // ── 알림 예약 ────────────────────────────────────────────────────

  function readNotificationSchedule() {
    const record = readAccount(RECORD.notificationSchedule);
    return Array.isArray(record) ? record : EMPTY_LIST;
  }

  function writeNotificationSchedule(items) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!Array.isArray(items)) return fail(STORE_ERROR.INVALID);
    return commit(accountKey, RECORD.notificationSchedule, items);
  }

  // ── 마감 지남 알림 기억 ──────────────────────────────────────────

  const OVERDUE_SEEN_MAX = 50;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isSeenId = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 128;
  const isValidDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

  function seenList(value) {
    return Array.isArray(value) ? value.filter(isSeenId).slice(-OVERDUE_SEEN_MAX) : [];
  }

  /** 그 날짜에 이미 낸 마감 지남 알림 id 와 닫은 안내의 외출 id. 저장된 날짜가 다르면 둘 다 빈 목록 */
  function readOverdueSeen(date) {
    const record = readAccount(RECORD.overdueSeen);
    if (!isPlainObject(record) || record.date !== date) return EMPTY_SEEN;
    return memo('overdueSeen', [date, record], () =>
      Object.freeze({ notified: Object.freeze(seenList(record.notified)), dismissed: Object.freeze(seenList(record.dismissed)) }),
    );
  }

  function markOverdue(field, date, id) {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    if (!isValidDate(date) || !isSeenId(id)) return fail(STORE_ERROR.INVALID);
    const record = readRecord(accountRecordKey(accountKey, RECORD.overdueSeen));
    // 날짜가 바뀌었으면 이전 값을 버리고 새 날짜로 시작한다
    const base = isPlainObject(record) && record.date === date ? record : {};
    const next = { date, notified: seenList(base.notified), dismissed: seenList(base.dismissed) };
    next[field] = [...next[field].filter((v) => v !== id), id].slice(-OVERDUE_SEEN_MAX);
    return commit(accountKey, RECORD.overdueSeen, next);
  }

  function markOverdueNotified(date, id) {
    return markOverdue('notified', date, id);
  }

  function markOverdueDismissed(date, outingId) {
    return markOverdue('dismissed', date, outingId);
  }

  // ── 삭제 ────────────────────────────────────────────────────────

  /**
   * 한 계정의 체류 데이터를 지운다 (docs/business-rules.md '체류'의 출국 7일 후 삭제):
   * 체류(숙소·병원·일정·조건·연동 지침·동의·보호자 공유), 확정 일정·편집, 오늘 사건, 알림 예약, AI 문장 캐시,
   * 매일 확인 기록, 서버 알림 지켜보기(서버 삭제 대기로 옮긴다). 알림 켜기 설정과 보호자 사본(자체 만료)은 체류 데이터가 아니라 남긴다.
   */
  function purgeStayData(accountKey) {
    for (const record of [RECORD.stay, RECORD.tripPlan, RECORD.todayEvents, RECORD.notificationSchedule, RECORD.aiIntroCache, RECORD.overdueSeen]) {
      removeRecord(accountRecordKey(accountKey, record));
    }
    // 서버 알림 지켜보기는 서버 삭제 대기로 옮긴다(로그인 없이도 돈다)
    retireWatchOf(accountKey);
    const prefsKey = accountRecordKey(accountKey, RECORD.prefs);
    const prefs = readRecord(prefsKey);
    if (prefs && Object.keys(prefs.dailyCheck ?? {}).length > 0) {
      writeRecord(prefsKey, { notifications: prefs.notifications === true, dailyCheck: {} });
    }
  }

  /** 새 여행을 시작하려고 현재 체류를 지운다 (docs/business-rules.md '체류': 활성 체류는 하나) */
  function deleteStay() {
    const accountKey = writableAccount();
    if (!accountKey) return fail(STORE_ERROR.READ_ONLY);
    purgeStayData(accountKey);
    emitAllData(accountKey);
    kickPendingServerDelete();
    return OK;
  }

  /**
   * 앱을 열 때 한 번 부른다 (브라우저 기본 인스턴스는 만들 때 스스로 부른다). 로그인 여부와 무관하게 동작한다.
   *   1. 자동 삭제 (docs/business-rules.md '체류'): 이 기기의 **모든** 계정 이름공간에서
   *      오늘(KST) ≥ 출국일 + DEFAULTS.stay.deleteAfterDepartureDays 인 체류 데이터를 지운다.
   *   2. 만료된 보호자 사본을 지운다.
   *   3. 지난 날짜의 오늘 사건을 지운다.
   *   4. 탭 저장소의 보호자 링크 임시 보관이 1시간을 넘었거나 형식이 깨졌으면 지운다 (docs/security.md '기기 저장소와 계정 이름공간'):
   *      링크를 다시 읽지 않아도 암호문이 남지 않게 한다.
   *   5. 서버 삭제 대기가 있으면 다시 보낸다.
   */
  function onAppOpen() {
    if (locked) {
      return { autoDeletedAccounts: 0, activeAccountDeleted: false, expiredGuardianCopies: 0, staleTodayEvents: 0, expiredPendingGuardianLink: false };
    }
    let heldLink = false;
    try {
      heldLink = tabStorage?.getItem(PENDING_GUARDIAN_LINK_KEY) != null;
    } catch {
      heldLink = false;
    }
    const expiredPendingGuardianLink = heldLink && takePendingGuardianLink(tabStorage, now()) === null;

    const today = todayKst(now());
    const activeKey = getStatus().accountKey;
    let autoDeletedAccounts = 0;
    let activeAccountDeleted = false;
    let expiredGuardianCopies = 0;
    let staleTodayEvents = 0;
    let activeTouched = false;

    for (const accountKey of listAccountKeys()) {
      let touched = false;
      const departure = readRecord(accountRecordKey(accountKey, RECORD.stay))?.departure?.date;
      if (isDateString(departure) && diffDays(departure, today) >= DEFAULTS.stay.deleteAfterDepartureDays) {
        purgeStayData(accountKey);
        autoDeletedAccounts += 1;
        touched = true;
        if (accountKey === activeKey) activeAccountDeleted = true;
      }
      const expired = pruneGuardianCopies(accountKey);
      expiredGuardianCopies += expired;
      const eventsKey = accountRecordKey(accountKey, RECORD.todayEvents);
      const events = readRecord(eventsKey);
      if (events && events.date !== today) {
        removeRecord(eventsKey);
        staleTodayEvents += 1;
        touched = true;
      }
      if ((touched || expired > 0) && accountKey === activeKey) activeTouched = true;
    }
    if (activeTouched) emitAllData(activeKey);
    // 자동 삭제가 옮긴 것과 지난 실행에서 남은 서버 삭제 대기를 보낸다
    kickPendingServerDelete();
    return { autoDeletedAccounts, activeAccountDeleted, expiredGuardianCopies, staleTodayEvents, expiredPendingGuardianLink };
  }

  /**
   * '이 기기에서 내 정보 지우기' (docs/security.md '기기 저장소와 계정 이름공간' · ADR-0004 규칙 9).
   * 보기 전용에서도 동작한다.
   *   - 모든 계정의 서버 알림 지켜보기 식별 값을 먼저 모은다.
   *   - `safehour.v2.` 아래 영구 저장 키를 **언어, 로그아웃 보류, 서버 삭제 대기만 빼고** 모두 지운다
   *     (모든 계정 이름공간, 보호자 사본, 알림 예약, AI 문장 캐시, 언어 외 설정, 마지막 로그인 계정).
   *   - 그다음 모은 식별 값을 서버 삭제 대기에 쓴다. 지운 뒤에 써서 저장 공간이 꽉 찬 기기에서도 들어갈 자리가 있고,
   *     그래도 쓰지 못하면 메모리에 남아 이 인스턴스가 보낸다.
   *   - 탭 저장소의 기존 키(lib/session.js CLEARABLE_KEYS)와 보호자 링크 임시 보관을 지운다.
   *   - 로그아웃한다(POST /api/auth/logout — 세션 쿠키는 httpOnly 라 서버가 지워야 한다).
   *   - 그다음 서버 삭제 대기를 보내고 끝나기를 기다린다. 닿지 않은 것은 대기에 남아 다음 온라인·앱 열기에 다시 보낸다.
   * 화면은 이 뒤에 전체 새로고침으로 이동해 메모리 사본까지 버린다.
   * @returns {Promise<{ok: boolean, removed: number, loggedOut: boolean}>}
   */
  async function deleteAllMyData() {
    const before = getStatus();
    const pendingDelete = [...readPendingServerDelete(), ...listAccountKeys().flatMap((accountKey) => watchIdsOf(accountKey))];
    const kept = (key) => key === DEVICE_KEY.lang || key === DEVICE_KEY.logoutPending || key === DEVICE_KEY.pendingServerDelete;
    let removed = 0;
    for (const key of listKeys()) {
      if (key.startsWith(STORE_PREFIX) && !kept(key) && rawRemove(key)) removed += 1;
    }
    writePendingServerDelete(pendingDelete);
    for (const key of LEGACY_TAB_KEYS) {
      try {
        tabStorage?.removeItem(key);
      } catch {
        // 저장소 접근이 막혀 있으면 지울 것도 없다
      }
    }
    clearPendingGuardianLink(tabStorage);
    const remaining = listKeys().filter((key) => key.startsWith(STORE_PREFIX) && !kept(key));

    cache.clear();
    memos.clear();
    session = null;
    scheduleExpiry();
    // 로그아웃이 서버에 닿을 때까지 로그인으로 보지 않는다 — 요청 도중 앱이 닫혀도 남는다
    markLogoutPending();
    const after = getStatus();
    if (after !== before) emit('status', after.accountKey);
    emitAllData(after.accountKey);

    // 기기 삭제는 이미 끝났다. 로그아웃이 닿지 않으면 보류 표시가 남아 온라인이 될 때 다시 보낸다.
    const outcome = await attemptLogout();
    if (outcome === 'network') setOnline(false);
    await retryPendingServerDelete();
    return { ok: remaining.length === 0, removed, loggedOut: outcome === 'ok' };
  }

  // ── 보호자 링크 임시 보관 (탭 저장소) ────────────────────────────────

  function holdLink(fragment) {
    if (locked) return fail(STORE_ERROR.READ_ONLY);
    return holdPendingGuardianLink(tabStorage, fragment, now());
  }

  function takeLink() {
    if (locked) return null;
    return takePendingGuardianLink(tabStorage, now());
  }

  function clearLink() {
    clearPendingGuardianLink(tabStorage);
  }

  // ── 브라우저 연결 ────────────────────────────────────────────────

  /**
   * 다른 탭의 저장 변경(storage 이벤트)과 온라인 상태(online/offline)를 반영한다.
   * @returns {() => void} 연결 해제
   */
  function attachWindow(win) {
    const onStorage = (event) => {
      if (event?.storageArea && event.storageArea !== local) return;
      if (event?.key === null || event?.key === undefined) {
        // 다른 탭이 저장소 전체를 비웠다
        memos.clear();
        transition(() => {});
        emitAllData(getStatus().accountKey);
        return;
      }
      if (event.key === DEVICE_KEY.lastAccountKey || event.key === DEVICE_KEY.logoutPending) {
        transition(() => {});
        return;
      }
      if (event.key === DEVICE_KEY.lang) {
        emit(RECORD.prefs, getStatus().accountKey);
        return;
      }
      const parsed = parseStoreKey(event.key);
      if (parsed?.kind === 'account' && parsed.accountKey === getStatus().accountKey) emit(parsed.record, parsed.accountKey);
    };
    const onConnectivity = () => {
      setOnline(win?.navigator?.onLine !== false);
    };
    win.addEventListener('storage', onStorage);
    win.addEventListener('online', onConnectivity);
    win.addEventListener('offline', onConnectivity);
    onConnectivity();
    return () => {
      win.removeEventListener('storage', onStorage);
      win.removeEventListener('online', onConnectivity);
      win.removeEventListener('offline', onConnectivity);
    };
  }

  return Object.freeze({
    // 상태 · 보기 전용 신호
    getStatus,
    setSession,
    setOnline,
    refreshSession,
    retryPendingLogout,
    readLastAccountKey,
    subscribe,
    attachWindow,
    // 체류
    readStay,
    writeStay,
    updateStay,
    deleteStay,
    readPeriods,
    writePeriods,
    readConsent,
    grantSensitiveConsent,
    withdrawSensitiveConsent,
    readLinkedPlans,
    upsertLinkedPlan,
    acknowledgeInstruction,
    removeLinkedPlan,
    readGuardianShare,
    writeGuardianShare,
    // 서버 알림
    readGuardianWatch,
    writeGuardianWatch,
    writeBackQueue,
    retireGuardianWatch,
    readPendingServerDelete,
    retryPendingServerDelete,
    // 일정
    readTripPlan,
    writeTripPlan,
    readDayPlan,
    readEdits,
    writeEdits,
    readTodayTomorrow,
    // 오늘 사건
    readTodayEvents,
    appendTodayEvent,
    clearTodayEvents,
    // 설정
    readPrefs,
    writePrefs,
    confirmDailyCheck,
    readLang,
    writeLang,
    // 보호자 사본
    readGuardianCopies,
    writeGuardianCopy,
    removeGuardianCopy,
    // AI 캐시 · 알림 예약
    readAiIntro,
    writeAiIntro,
    readNotificationSchedule,
    writeNotificationSchedule,
    // 마감 지남 알림 기억
    readOverdueSeen,
    markOverdueNotified,
    markOverdueDismissed,
    // 삭제 · 앱 열기
    deleteAllMyData,
    onAppOpen,
    // 보호자 링크 임시 보관
    holdPendingGuardianLink: holdLink,
    takePendingGuardianLink: takeLink,
    clearPendingGuardianLink: clearLink,
  });
}

export { PENDING_GUARDIAN_LINK_KEY };
