// 서버 알림 동기화 실행기 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 7, D6·D9·D10·D11)
//
//   const watch = createWatchSync({ store, api });
//   watch.start();                       // 저장소 구독(일정·체류·상태·지켜보기), KST 자정 + 1초 타이머
//   watch.kick('open');                  // 한 번 비우기: 마감 올리기(필요할 때) 다음 '돌아왔어요' 대기열('open' 은 한 번만)
//   watch.ensureRegistered({ stay, accountKey });  // 보호자 링크를 만들 때 등록(켜져 있으면 요청 없음)
//   watch.pressBack({ date, by, departAt });  watch.undoBack({ date, by });  watch.backStatus({ date, by });
//   watch.retire({ accountKey });  watch.removeAll({ accountKey });  watch.config();   // retire 는 { ok, pending } | { ok: false, reason }, config 는 { enabled, checked }
//
// 정한 것
//   - 요청은 지켜보기 하나에 한 번에 하나다. 등록, 올리기, '돌아왔어요', 되돌리기, 끄기, 서버 지우기를 한 약속 사슬로 줄 세운다.
//     비우는 중에 kick 이 또 오면 끝난 뒤 한 번만 더 돈다. 늘 그때의 최신 전체를 보낸다(서버의 날짜 기록 바꾸기는 원자적이지
//     않다: docs/engineering-notes.md '마감 올리기 둘이 겹치면 표시를 잃는다'). 서버 삭제 대기는 저장소가 따로 보낸다(lib/store).
//   - 응답을 받으면 레코드를 다시 읽는다. watchId 나 writeToken 이 달라졌으면(지워졌거나 다시 등록됨) 결과를 쓰지 않는다.
//   - 대기열은 writeBackQueue 로만, 그 밖 필드는 writeGuardianWatch 로만 쓴다(보기 전용 예외는 대기열 하나).
//   - 보기 전용이면 마감을 올리지 않는다(계획 다르게 정한 것 9: 일정이 바뀌지 않으니 서버는 이미 마지막 상태를 갖고 있다).
//     '돌아왔어요' 대기열은 보기 전용에서도 보낸다(쓰기 토큰 권한, 결정 8).
//   - 올리기 실패(OFF, UNAVAILABLE, RATE_LIMITED, NETWORK, BAD)는 uploadPending 만 남기고 화면에 보이지 않는다(D9).
//     armFailed 가 있으면 60초 뒤 같은 전체를 다시 올린다. 같은 상태(key)로는 세 번까지(메모리).
//   - 404(갈아 끼움): state 'REPLACED' 를 쓰고 대기열의 남은 것을 모두 실패로 두고 비운다. 보기 전용이라 쓰지 못하면 메모리에
//     표시해 두었다가 다음 쓰기 가능한 비우기에서 요청 없이 쓴다.
//   - '돌아왔어요' 단계는 메모리에만 둔다(다르게 정한 것 16). 새로 고치면 대기열에서 QUEUED·UNDO_QUEUED 를 다시 만든다.
//     단계의 키는 지켜보기 id 와 쓰기 토큰까지 묶는다. 끄거나 다시 등록하면 예전 단계가 남지 않는다.
//   - 대기열 항목은 누른 시각(atMs)과 누른 외출의 출발 시각(departAt, 화면이 넘긴다. 마감 지남 시트는 없음)을 기기에만 들고 간다.
//     요청 본문은 { watchId, writeToken, date, by, undo } 그대로다. 확인이 recorded: true 로 끝나면 레코드의 confirmed 에
//     { date, by, atMs, departAt } 를 넣고, 되돌리기가 기록되면 뺀다(대기열과 한 번에 쓴다).
//   - 올리기가 받아들여지면, 보낸 날짜 목록에서 빠진 시각의 확인을 confirmed 에서 빼고 그 단계를 비운다. 서버는 목록에서 빠진
//     시각의 확인을 함께 버리므로, 같은 시각이 다시 올라가도 '전달했어요'로 남지 않게 한다.
//   - '돌아왔어요' 대기열 보내기가 UNAVAILABLE(503)이나 RATE_LIMITED(429)로 막히면 60초 뒤 다시 비운다(올리기 재시도와 같은
//     간격·횟수 상한 WATCH_ARM_RETRY_MS·WATCH_ARM_RETRY_MAX). 한 번 받아들여지면(OK) 횟수를 되돌리고, 누르거나 되돌릴 때도
//     되돌린다. 걸린 재시도는 하나뿐이고 stop() 이 지운다. 연결 없음(NETWORK)은 온라인 계기가 다시 부른다.
//   - 매 비우기에서 대기열을 보내기 전에, 같은 마감의 나중 외출을 덮는 확인을 되돌린다(undoStaleConfirms, 다르게 정한 것 25).
//     보기 전용에서도 한다(대기열 보내기와 같다). 쓰지 못하면 그대로 두고 이번에는 보내지 않는다(다음 비우기에서 다시).
//   - 등록·끄기·서버 지우기는 누른 때의 계정 키(accountKey)를 받는다. 앞선 일 뒤에 줄 서 있다가 시작될 때 저장소의 지금 계정
//     (getStatus().accountKey)이 다르면 아무것도 하지 않고 UNAVAILABLE 이다. 키를 넘기지 않으면 계정을 보지 않는다(A-3 검토).
//     같은 탭의 세션 변경을 덮는다. 다른 탭의 다른 계정 로그인은 저장소가 storage 이벤트로 받아 세션을 버리므로(보기 전용, 곧바로
//     다시 묻는다) 지금 계정이 바뀌어 함께 덮인다. 그 이벤트가 오기 전의 짧은 틈에 쿠키가 바뀐 채 나간 요청은 덮지 못한다
//     (docs/engineering-notes.md '줄 선 등록·끄기·서버 지우기가 시작될 때 계정이 바뀌어 있을 수 있다').
//   - 지켜보기 변경(guardianWatch)은 화면 구독자에게만 알린다. 비우기를 부르지 않는다(자기가 쓴 결과로 되돌아오지 않는다).
//   - watchId, writeToken, 날짜, 시각을 어디에도 기록하지 않는다(console 출력이 없다). 실행기는 던지지 않는다.
//
// 저장소(lib/store createStore 모양), 요청 함수(lib/trip/watchApi.js createWatchApi 모양), 시계, 타이머, 난수는 주입한다.
// 날짜·시각은 KST 도우미로만 계산한다.

import { kstClock } from '../../src/engine/tripPlan.js';
import { WATCH_KIND, newWatchIds } from '../../src/guardian/watchRequests.js';
import { addDays, isClockTime, isDateString, kstInstantMs } from '../../src/stay/time.js';
import {
  applyBackAction,
  buildUploadState,
  isSameUpload,
  pruneBackQueue,
  pruneConfirmed,
  undoStaleConfirms,
  undoUntilMs,
} from './watchPlan.js';

/** '돌아왔어요' 단계 (계획 '공용 모양'). 없으면 null = 아직 누르지 않음 */
export const BACK_PHASE = Object.freeze({
  /** 대기 중(보내는 중 아님) */
  QUEUED: 'QUEUED',
  /** 되돌리기 대기 중 */
  UNDO_QUEUED: 'UNDO_QUEUED',
  SENDING: 'SENDING',
  /** 서버가 recorded: true 로 받았다 */
  SENT: 'SENT',
  FAILED: 'FAILED',
  UNDO_FAILED: 'UNDO_FAILED',
});

/** GET /api/push/config 결과를 기억하는 시간 */
export const WATCH_CONFIG_TTL_MS = 5 * 60 * 1000;
/** armFailed 가 있을 때 같은 전체를 다시 올리기까지('돌아왔어요' 대기열이 503·429 로 막혔을 때 다시 보내기까지도 같다) */
export const WATCH_ARM_RETRY_MS = 60_000;
/** 같은 상태(key)로 armFailed 재시도를 거는 횟수 상한('돌아왔어요' 대기열 재시도의 연속 횟수 상한도 같다) */
export const WATCH_ARM_RETRY_MAX = 3;

const MAX_TIMER_MS = 2 ** 31 - 1;
const UNAVAILABLE = Object.freeze({ ok: false, reason: WATCH_KIND.UNAVAILABLE });
/** 등록 실패 중 그대로 돌려주는 이유. 나머지는 UNAVAILABLE */
const REGISTER_REASONS = new Set([WATCH_KIND.LOGIN_REQUIRED, WATCH_KIND.RATE_LIMITED, WATCH_KIND.OFF]);
/** 서버 지우기 실패 중 그대로 돌려주는 이유. 나머지는 UNAVAILABLE */
const REMOVE_ALL_REASONS = new Set([WATCH_KIND.LOGIN_REQUIRED, WATCH_KIND.RATE_LIMITED]);
const noop = () => {};

function idsOf(record) {
  return { watchId: record.watchId, writeToken: record.writeToken };
}

function sameIds(a, b) {
  return Boolean(a) && Boolean(b) && a.watchId === b.watchId && a.writeToken === b.writeToken;
}

function sameItem(a, b) {
  return a.date === b.date && a.by === b.by && a.undo === b.undo;
}

const failedPhase = (item) => (item.undo ? BACK_PHASE.UNDO_FAILED : BACK_PHASE.FAILED);
const queuedPhase = (item) => (item.undo ? BACK_PHASE.UNDO_QUEUED : BACK_PHASE.QUEUED);

/** 보기 전용이라 할 수 없을 때의 이유: 오프라인이면 UNAVAILABLE, 세션이 없거나 만료면 LOGIN_REQUIRED */
function blockedReason(status) {
  return status.online === false ? WATCH_KIND.UNAVAILABLE : WATCH_KIND.LOGIN_REQUIRED;
}

function isWritable(status) {
  return status.readOnly === false && Boolean(status.accountKey);
}

/** 누른 때의 계정 키를 받았는데 지금 계정과 다른가. 받지 않았으면(undefined) 보지 않는다 */
function accountChanged(accountKey, status) {
  return accountKey !== undefined && status.accountKey !== accountKey;
}

/**
 * @param {object} options
 * @param {ReturnType<import('../store/store.js').createStore>} options.store
 * @param {ReturnType<import('./watchApi.js').createWatchApi>} options.api
 * @param {() => number} [options.now]
 * @param {{setTimeout: Function, clearTimeout: Function} | null} [options.timers]  자정·armFailed 재시도
 * @param {(n: number) => Uint8Array} [options.randomBytes]  새 id·토큰의 난수(기본 WebCrypto)
 */
export function createWatchSync({ store, api, now = Date.now, timers = null, randomBytes } = {}) {
  const listeners = new Set();
  /** '돌아왔어요' 단계: `${watchId}.${writeToken}.${date}.${by}` → BACK_PHASE 값 */
  const phases = new Map();
  /** 400 으로 막힌 올리기 상태(key). 이 실행 동안 같은 상태를 다시 보내지 않는다 */
  const blockedKeys = new Set();
  /** armFailed 재시도를 건 횟수(key → 횟수) */
  const armRetries = new Map();
  const armTimers = new Set();
  /** '돌아왔어요' 대기열 재시도 타이머(하나)와 받아들여지지 않은 채 건 횟수 */
  let backRetryTimer = null;
  let backRetries = 0;
  let midnightTimer = null;
  let started = false;
  let unsubscribers = [];
  let lastStatus = null;
  /** 보기 전용이라 쓰지 못한 갈아 끼움 { watchId, writeToken }. 다음 쓰기 가능한 비우기에서 쓴다 */
  let replacedPending = null;
  let config = null;
  let configInFlight = null;

  // ── 알림 ─────────────────────────────────────────────────────────

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  /** 화면 구독: '돌아왔어요' 단계나 지켜보기 레코드가 바뀌면 부른다. 값은 backStatus 로 다시 읽는다 */
  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // ── 한 줄 사슬 ────────────────────────────────────────────────────
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task);
    chain = run.then(noop, noop);
    return run;
  }

  /** 사슬에 걸린 일이 모두 끝날 때까지 기다린다(타이머가 건 비우기 포함) */
  async function idle() {
    for (;;) {
      const current = chain;
      await current;
      if (current === chain) return;
    }
  }

  /** 요청 함수 결과. 던지거나 모양이 틀리면 실패로 본다(요청 함수는 던지지 않는 것이 약속이다) */
  async function call(send) {
    try {
      const result = await send();
      return result && typeof result.kind === 'string' ? result : { ok: false, kind: WATCH_KIND.UNAVAILABLE };
    } catch {
      return { ok: false, kind: WATCH_KIND.NETWORK };
    }
  }

  // ── '돌아왔어요' 단계 ─────────────────────────────────────────────

  function phaseKey(record, date, by) {
    return `${record.watchId}.${record.writeToken}.${date}.${by}`;
  }

  function setPhase(record, { date, by }, phase) {
    const key = phaseKey(record, date, by);
    if ((phases.get(key) ?? null) === phase) return;
    if (phase === null) phases.delete(key);
    else phases.set(key, phase);
    notify();
  }

  /** 메모리 단계, 없으면 대기열에서 다시 만든 단계(확인은 QUEUED, 되돌리기는 UNDO_QUEUED) */
  function phaseOf(record, date, by) {
    const phase = phases.get(phaseKey(record, date, by));
    if (phase) return phase;
    const item = record.backQueue.find((q) => q.date === date && q.by === by);
    return item ? queuedPhase(item) : null;
  }

  /**
   * 갈아 끼움(404): 대기열의 남은 것을 모두 실패로 두고 비운 뒤 state 'REPLACED' 를 쓴다.
   * 보기 전용이면 레코드를 쓰지 않고 메모리에 표시한다(대기열은 보기 전용에서도 비운다).
   */
  function markReplaced(record) {
    for (const item of record.backQueue) setPhase(record, item, failedPhase(item));
    if (record.backQueue.length > 0) store.writeBackQueue([]);
    const written = isWritable(store.getStatus()) && store.writeGuardianWatch({ ...record, state: 'REPLACED' }).ok;
    replacedPending = written ? null : idsOf(record);
  }

  // ── 비우기 ───────────────────────────────────────────────────────

  /**
   * 마감 올리기(쓰기 가능할 때만 부른다).
   * @returns {Promise<boolean>} 대기열 보내기로 이어 가는가
   */
  async function upload(record) {
    const state = buildUploadState({
      stay: store.readStay(),
      tripPlan: store.readTripPlan(),
      lastUploaded: record.lastUploaded,
      nowMs: now(),
    });
    if (state === null || isSameUpload(record, state) || blockedKeys.has(state.key)) return true;
    const ids = idsOf(record);
    const result = await call(() => api.deadlines({ ...ids, expiresOn: state.expiresOn, days: state.days }));
    const current = store.readGuardianWatch();
    if (!sameIds(current, ids)) return false;
    if (result.kind === WATCH_KIND.OK) {
      const armFailed = Number(result.data?.armFailed) > 0;
      store.writeGuardianWatch({ ...current, expiresOn: state.expiresOn, lastUploaded: state.nextLastUploaded, uploadPending: armFailed });
      dropUnlistedConfirms(state.days);
      if (armFailed) scheduleArmRetry(state.key);
      return true;
    }
    if (result.kind === WATCH_KIND.NOT_FOUND) {
      markReplaced(current);
      return false;
    }
    store.writeGuardianWatch({ ...current, uploadPending: true });
    if (result.kind === WATCH_KIND.BAD) blockedKeys.add(state.key);
    // 연결이 없으면 대기열도 닿지 않는다. 다음 계기에 다시
    return result.kind !== WATCH_KIND.NETWORK;
  }

  /**
   * 받아들여진 올리기 뒤: 보낸 날짜의 목록에서 빠진 시각의 확인을 confirmed 에서 빼고 메모리 단계를 비운다. 서버는 목록에서
   * 빠진 시각의 확인을 함께 버린다(같은 시각이 다시 올라가도 확인은 돌아오지 않는다). 보내지 않은 날짜(어제)는 그대로 둔다.
   * @param {Array<{ date: string, deadlines: string[] }>} days  서버가 받아들인 날짜별 목록
   */
  function dropUnlistedConfirms(days) {
    const sent = new Map(days.map(({ date, deadlines }) => [date, deadlines]));
    const record = store.readGuardianWatch();
    if (!record) return;
    const unlisted = (entry) => sent.has(entry.date) && !sent.get(entry.date).includes(entry.by);
    const dropped = record.confirmed.filter(unlisted);
    if (dropped.length === 0) return;
    if (!store.writeBackQueue(record.backQueue, { confirmed: record.confirmed.filter((entry) => !unlisted(entry)) }).ok) return;
    for (const entry of dropped) setPhase(record, entry, null);
  }

  /** 대기열에서 그 항목 하나를 뺀다. 저장소에 쓰지 못하면 false */
  function removeItem(record, item) {
    const index = record.backQueue.findIndex((q) => sameItem(q, item));
    if (index < 0) return true;
    return store.writeBackQueue(record.backQueue.filter((_, i) => i !== index)).ok;
  }

  /**
   * 서버가 recorded: true 로 받은 항목: 대기열에서 빼고 confirmed 를 함께 고친다(한 번에 쓴다). 확인이면 { date, by, atMs, departAt }
   * 를 넣고(누른 시각이 없는 예전 항목은 지금 시각, 누른 외출의 출발은 항목에 있을 때만), 되돌리기면 그 (date, by)를 뺀다.
   * 저장소에 쓰지 못하면 false.
   */
  function settleItem(record, item) {
    const nowMs = now();
    const others = record.confirmed.filter((entry) => entry.date !== item.date || entry.by !== item.by);
    const confirmed = item.undo ? others : [...others, { date: item.date, by: item.by, atMs: item.atMs ?? nowMs, departAt: item.departAt }];
    const index = record.backQueue.findIndex((q) => sameItem(q, item));
    const queue = index < 0 ? record.backQueue : record.backQueue.filter((_, i) => i !== index);
    return store.writeBackQueue(queue, { confirmed: pruneConfirmed(confirmed, nowMs) }).ok;
  }

  /**
   * 같은 마감의 나중 외출을 덮는 확인을 되돌린다(다르게 정한 것 25, watchPlan undoStaleConfirms). 대기 중인 확인은 요청 없이
   * 사라지고, 보낸 확인은 undo: true 가 대기열에 들어가 이어지는 대기열 보내기가 보낸다. 바뀐 대상의 메모리 단계는 비운다.
   * @returns {boolean} 대기열 보내기로 이어 가는가(쓰지 못하면 false: 덮는 확인을 그대로 보내지 않는다)
   */
  function undoStale(ids) {
    const record = store.readGuardianWatch();
    if (!sameIds(record, ids) || record.state !== 'ON') return false;
    const next = undoStaleConfirms({
      tripPlan: store.readTripPlan(),
      confirmed: record.confirmed,
      backQueue: record.backQueue,
      lastUploaded: record.lastUploaded,
      nowMs: now(),
    });
    if (!next.changed) return true;
    if (!store.writeBackQueue(next.backQueue, { confirmed: next.confirmed }).ok) return false;
    for (const target of next.cleared) setPhase(record, target, null);
    return true;
  }

  /** '돌아왔어요' 대기열을 오래된 것부터 하나씩 보낸다(보기 전용이어도 보낸다) */
  async function sendQueue(ids) {
    for (;;) {
      const record = store.readGuardianWatch();
      if (!sameIds(record, ids) || record.state !== 'ON') return;
      const queue = pruneBackQueue(record.backQueue, now());
      if (queue.length !== record.backQueue.length) {
        // 어제보다 앞 날짜(서버가 받지 않는다)와 상한을 넘은 것은 보낼 수 없다
        for (const item of record.backQueue) if (!queue.some((q) => sameItem(q, item))) setPhase(record, item, failedPhase(item));
        if (!store.writeBackQueue(queue).ok) return;
        continue;
      }
      const item = queue[0];
      if (!item) return;
      setPhase(record, item, BACK_PHASE.SENDING);
      const result = await call(() => api.back({ ...ids, date: item.date, by: item.by, undo: item.undo }));
      const after = store.readGuardianWatch();
      if (!sameIds(after, ids)) return;
      if (result.kind === WATCH_KIND.OK || result.kind === WATCH_KIND.BAD) {
        if (result.kind === WATCH_KIND.OK) backRetries = 0;
        const recorded = result.kind === WATCH_KIND.OK && result.data?.recorded === true;
        const removed = recorded ? settleItem(after, item) : removeItem(after, item);
        setPhase(after, item, recorded ? (item.undo ? null : BACK_PHASE.SENT) : failedPhase(item));
        if (!removed) return;
        continue;
      }
      if (result.kind === WATCH_KIND.NOT_FOUND) {
        markReplaced(after);
        return;
      }
      // 연결 없음, 꺼짐, 일시 실패, 한도: 대기에 남기고 다음 계기에 다시. 일시 실패·한도는 60초 뒤에도 다시(횟수 상한)
      setPhase(after, item, queuedPhase(item));
      if (result.kind === WATCH_KIND.UNAVAILABLE || result.kind === WATCH_KIND.RATE_LIMITED) scheduleBackRetry();
      return;
    }
  }

  /**
   * 한 번의 비우기 (계획 Task 7 '한 번의 비우기' 1~4, 다르게 정한 것 25). 올리기(쓰기 가능할 때) 다음, 대기열을 보내기 전에
   * 덮는 확인을 되돌린다. 올린 뒤의 lastUploaded 로 대상을 찾는다(묶인 외출의 원래 마감이 올린 기록에서 나온다).
   * 일정·체류가 바뀌면(kick('plan')) 이 비우기가 돈다.
   */
  async function flush() {
    const status = store.getStatus();
    const record = store.readGuardianWatch();
    if (!record || record.state !== 'ON' || status.online === false) return;
    const ids = idsOf(record);
    const writable = isWritable(status);
    if (writable && sameIds(replacedPending, ids)) {
      markReplaced(record);
      return;
    }
    if (writable && !(await upload(record))) return;
    if (!undoStale(ids)) return;
    await sendQueue(ids);
  }

  let running = null;
  let again = false;
  /** 'open' 계기를 이미 받았는가. 화면마다 useTrip 이 붙을 때 부르므로 실행기 하나에 한 번만 받는다 */
  let opened = false;

  /**
   * 비우기를 건다. 도는 중이면 끝난 뒤 한 번만 더 돈다(그 실행의 약속을 돌려준다). 던지지 않는다.
   * 'open' 은 실행기 하나에 한 번만 받는다. 두 번째부터는 아무것도 걸지 않는다.
   * @param {string} [reason]  계기 이름(open, resume, plan, online, writable, midnight, arm-retry, back-retry, register, back). 기록하지 않는다
   * @returns {Promise<void>}
   */
  function kick(reason) {
    if (reason === 'open') {
      if (opened) return running ?? Promise.resolve();
      opened = true;
    }
    // 도는 중에 온 계기는 합쳐서 끝난 뒤 한 번 더 돈다. 그래서 그 한 번이 이미 사슬에 걸린 끄기·서버 지우기·등록보다
    // 먼저 돌 수 있다. 비우기는 늘 그때의 레코드와 최신 전체를 보내므로(레코드가 없으면 아무것도 하지 않는다) 순서가
    // 바뀌어도 해가 없다.
    if (running) {
      again = true;
      return running;
    }
    const run = enqueue(async () => {
      for (;;) {
        again = false;
        try {
          await flush();
        } catch {
          // 실행기는 던지지 않는다. 다음 계기에 다시 본다
        }
        if (!again) {
          running = null;
          return;
        }
      }
    });
    running = run;
    return run;
  }

  // ── 타이머 ───────────────────────────────────────────────────────

  function scheduleArmRetry(key) {
    if (!timers || !started) return;
    const count = armRetries.get(key) ?? 0;
    if (count >= WATCH_ARM_RETRY_MAX) return;
    armRetries.set(key, count + 1);
    const id = timers.setTimeout(() => {
      armTimers.delete(id);
      void kick('arm-retry');
    }, WATCH_ARM_RETRY_MS);
    armTimers.add(id);
  }

  /** '돌아왔어요' 대기열이 503·429 로 막혔을 때 60초 뒤 다시 비운다. 이미 걸려 있거나 연속 횟수 상한이면 걸지 않는다 */
  function scheduleBackRetry() {
    if (!timers || !started || backRetryTimer !== null || backRetries >= WATCH_ARM_RETRY_MAX) return;
    backRetries += 1;
    backRetryTimer = timers.setTimeout(() => {
      backRetryTimer = null;
      void kick('back-retry');
    }, WATCH_ARM_RETRY_MS);
  }

  /** KST 자정 + 1초에 비우고 다음 자정을 다시 건다 */
  function scheduleMidnight() {
    if (!timers || !started) return;
    if (midnightTimer !== null) timers.clearTimeout(midnightTimer);
    const nowMs = now();
    const wait = kstInstantMs(addDays(kstClock(nowMs).date, 1), '00:00') + 1000 - nowMs;
    midnightTimer = timers.setTimeout(() => {
      midnightTimer = null;
      void kick('midnight');
      scheduleMidnight();
    }, Math.min(Math.max(wait, 1000), MAX_TIMER_MS));
  }

  // ── 저장소 구독 ───────────────────────────────────────────────────

  function onPlan() {
    void kick('plan');
  }

  /** 오프라인에서 온라인으로, 보기 전용에서 쓰기 가능으로 바뀔 때 비운다 */
  function onStatus() {
    const status = store.getStatus();
    const before = lastStatus;
    lastStatus = status;
    if (before?.online === false && status.online === true) void kick('online');
    else if (before?.readOnly === true && status.readOnly === false) void kick('writable');
    notify();
  }

  function start() {
    if (started) return stop;
    started = true;
    lastStatus = store.getStatus();
    unsubscribers = [
      store.subscribe('tripPlan', onPlan),
      store.subscribe('stay', onPlan),
      store.subscribe('status', onStatus),
      store.subscribe('guardianWatch', notify),
    ];
    scheduleMidnight();
    return stop;
  }

  function stop() {
    started = false;
    for (const off of unsubscribers) off();
    unsubscribers = [];
    if (timers) {
      if (midnightTimer !== null) timers.clearTimeout(midnightTimer);
      if (backRetryTimer !== null) timers.clearTimeout(backRetryTimer);
      for (const id of armTimers) timers.clearTimeout(id);
    }
    midnightTimer = null;
    backRetryTimer = null;
    armTimers.clear();
  }

  // ── 설정 ─────────────────────────────────────────────────────────

  /**
   * 서버 알림 스위치. 한 번 읽고 5분 기억한다. 실패는 { enabled: false, checked: false } 이고 기억하지 않는다. 겹쳐 불러도 요청은 하나다.
   * checked 는 서버가 답했는가다. 서버가 꺼졌다고 답한 것(checked: true, enabled: false)과 읽지 못한 것을 화면이 가른다.
   * @returns {Promise<{ enabled: boolean, checked: boolean }>}
   */
  function configOnce() {
    if (config && now() - config.atMs < WATCH_CONFIG_TTL_MS) return Promise.resolve({ enabled: config.enabled, checked: true });
    if (configInFlight) return configInFlight;
    configInFlight = (async () => {
      const result = await call(() => api.config());
      if (result.kind !== WATCH_KIND.OK) return { enabled: false, checked: false };
      const enabled = result.data?.enabled === true;
      config = { enabled, atMs: now() };
      return { enabled, checked: true };
    })().finally(() => {
      configInFlight = null;
    });
    return configInFlight;
  }

  // ── 등록 · 끄기 · 서버 지우기 ──────────────────────────────────────

  /**
   * 지켜보기를 켠다(쓰기 가능할 때만). ON 이면 요청 없이 그 id, REPLACED 면 같은 watchId 에 새 쓰기 토큰, 없으면 새 id.
   * 출국일이 오늘보다 앞이면 UNAVAILABLE. 실패하면 레코드를 쓰지 않는다(REPLACED 다시 등록이 404 면 레코드를 지운다).
   * 새 id 등록이 성공했는데 그사이 계정이 바뀌었거나 레코드를 쓰지 못했으면 그 지켜보기를 서버 삭제 대기에 넣고 UNAVAILABLE.
   * accountKey 를 넘겼는데 이 일이 시작될 때 계정이 다르면 요청·쓰기·삭제 대기·비우기 없이 UNAVAILABLE(바뀐 계정은 켜지 않았다).
   * @param {{ stay: object, accountKey?: string|null }} args  accountKey: 누른 때의 계정 키(링크 만들기가 첫 기다림 전에 읽은 값)
   * @returns {Promise<{ ok: true, watchId: string } | { ok: false, reason: 'LOGIN_REQUIRED'|'RATE_LIMITED'|'OFF'|'UNAVAILABLE' }>}
   */
  function ensureRegistered({ stay, accountKey } = {}) {
    return enqueue(async () => {
      const status = store.getStatus();
      // 앞선 일(올리기와 '돌아왔어요' 대기열, 몇 분까지)을 기다리는 사이 다른 계정이 들어왔다. 그 계정의 레코드를 보고 등록하면 동의하지 않은 계정에
      // 앞 계정의 출국일로 지켜보기가 생긴다
      if (accountChanged(accountKey, status)) return UNAVAILABLE;
      if (!isWritable(status)) return { ok: false, reason: blockedReason(status) };
      const expiresOn = stay?.departure?.date;
      if (!isDateString(expiresOn) || expiresOn < kstClock(now()).date) return UNAVAILABLE;
      const record = store.readGuardianWatch();
      if (record?.state === 'ON') return { ok: true, watchId: record.watchId };
      const replaced = record?.state === 'REPLACED' ? record : null;
      let ids;
      try {
        const fresh = newWatchIds({ randomBytes });
        ids = replaced ? { watchId: replaced.watchId, writeToken: fresh.writeToken } : fresh;
      } catch {
        return UNAVAILABLE;
      }
      const result = await call(() => api.register({ ...ids, expiresOn }));
      const current = store.readGuardianWatch();
      // 레코드가 없던 경우는 계정이 바뀌어도 null 이라 계정까지 본다(등록은 보낸 세션의 계정에 묶인다)
      const sameAccount = store.getStatus().accountKey === status.accountKey;
      const unchanged = sameAccount && (replaced ? sameIds(current, replaced) : current === null);
      if (result.kind !== WATCH_KIND.OK) {
        // 다시 등록이 404: 그 지켜보기는 서버에 없다(만료 등). 레코드를 지워 다음에는 새 id 로 만든다
        if (replaced && unchanged && result.kind === WATCH_KIND.NOT_FOUND) store.writeGuardianWatch(null);
        return { ok: false, reason: REGISTER_REASONS.has(result.kind) ? result.kind : WATCH_KIND.UNAVAILABLE };
      }
      // 기다리는 동안 다른 곳(다른 탭)이 레코드를 바꿨다: 그 결과를 덮지 않는다. 같은 계정의 켜진 지켜보기만 돌려준다
      // (계정이 바뀌었으면 그 계정의 id 를 이 링크에 싣지 않는다)
      if (!unchanged) {
        // 계정이 바뀌었으면 방금 서버에 만든 새 지켜보기는 어느 레코드·링크에도 없다. 만료까지 남기지 않고 서버 삭제 대기에
        // 넣는다(삭제는 쓰기 토큰으로 인증한다). REPLACED 다시 등록은 넣지 않는다: 그 watchId 는 앞 계정의 레코드와 이미 보낸
        // 보호자 링크가 아직 쓰고, 지우면 그 계정이 다시 등록할 때 404 로 새 id 가 되어 링크가 끊긴다
        if (!sameAccount && !replaced) store.queueServerDelete(ids);
        return sameAccount && current?.state === 'ON' ? { ok: true, watchId: current.watchId } : UNAVAILABLE;
      }
      const written = store.writeGuardianWatch({
        ...ids,
        expiresOn,
        lastUploaded: replaced ? current.lastUploaded : {},
        uploadPending: true,
        backQueue: [],
        // 같은 watchId 다시 등록(REPLACED)이면 저장소가 저장된 confirmed 를 남긴다(서버가 그 날짜 확인을 지킨다). 새 id 면 빈 목록
        confirmed: [],
        state: 'ON',
      });
      if (!written.ok) {
        // 서버에는 만들었는데 기기에 적지 못했다(기다리는 동안 세션이 만료돼 보기 전용이 되는 등). 새 지켜보기는 어느 레코드·링크에도
        // 없으니 계정 전환 분기처럼 서버 삭제 대기에 넣는다(queueServerDelete 가 곧바로 보낸다). REPLACED 다시 등록은 넣지 않는다:
        // 레코드가 그 watchId 를 그대로 들고 있어 다음 켜기가 같은 watchId 로 다시 등록한다
        if (!replaced) store.queueServerDelete(ids);
        return UNAVAILABLE;
      }
      replacedPending = null;
      void kick('register');
      return { ok: true, watchId: ids.watchId };
    });
  }

  /**
   * 서버 알림 끄기(쓰기 가능할 때만): 진행 중 요청이 끝난 뒤 레코드를 서버 삭제 대기로 옮기고(lib/store retireGuardianWatch)
   * 삭제 시도가 끝나기를 기다린다.
   * - 쓰기 가능하지 않으면 아무것도 바꾸지 않고 { ok: false, reason }. 저장소가 옮기지 못해도 { ok: false } 이고 단계를 그대로 둔다.
   * - 레코드가 없으면 { ok: true, pending: false }.
   * - accountKey 를 넘겼는데 이 일이 시작될 때 계정이 다르면 아무것도 바꾸지 않고(삭제 대기·DELETE 없음) { ok: false, reason: 'UNAVAILABLE' }.
   * - pending: 지운 레코드의 watchId 의 지켜보기 삭제(쓰기 토큰이 있는 항목)가 삭제를 시도한 뒤에도 대기에 남았는가. 남았으면
   *   서버에서 지워지기 전까지 보호자 알림이 갈 수 있다(남은 대기는 다음 온라인·앱 열기에 저장소가 다시 보낸다). 같은 watchId 의
   *   다른 항목(보호자 구독 해지 { watchId, subId })은 세지 않는다.
   * @param {{ accountKey?: string|null }} [args]  accountKey: 누른 때의 계정 키
   * @returns {Promise<{ ok: true, pending: boolean } | { ok: false, reason: 'LOGIN_REQUIRED'|'UNAVAILABLE' }>}
   */
  function retire({ accountKey } = {}) {
    return enqueue(async () => {
      const status = store.getStatus();
      // 앞선 일을 기다리는 사이 다른 계정이 들어왔다. 지금 레코드는 그 계정의 것이라 끄면 남의 지켜보기를 지운다
      if (accountChanged(accountKey, status)) return UNAVAILABLE;
      if (!isWritable(status)) return { ok: false, reason: blockedReason(status) };
      const record = store.readGuardianWatch();
      if (!record) return { ok: true, pending: false };
      const { watchId } = record;
      let retired = null;
      try {
        retired = store.retireGuardianWatch();
      } catch {
        // 저장소는 던지지 않는 것이 약속이다. 던지면 옮기지 못한 것으로 본다
      }
      if (!retired?.ok) {
        const after = store.getStatus();
        return { ok: false, reason: isWritable(after) ? WATCH_KIND.UNAVAILABLE : blockedReason(after) };
      }
      let pending = true;
      try {
        await store.retryPendingServerDelete();
        pending = store.readPendingServerDelete().some((item) => typeof item.writeToken === 'string' && item.watchId === watchId);
      } catch {
        // 확인하지 못하면 남은 것으로 본다(알림이 갈 수 있다고 알리는 쪽)
      }
      phases.clear();
      replacedPending = null;
      notify();
      return { ok: true, pending };
    });
  }

  /**
   * 서버에 남은 내 정보 지우기(쓰기 가능할 때만): 로그인 계정의 지켜보기를 모두 지우고, 성공하면 이 기기의 레코드도 지운다
   * (응답을 기다리는 동안 레코드가 그대로였을 때만).
   * accountKey 를 넘겼는데 이 일이 시작될 때 계정이 다르면 요청·쓰기 없이 UNAVAILABLE.
   * @param {{ accountKey?: string|null }} [args]  accountKey: 누른 화면의 계정 키
   * @returns {Promise<{ ok: true, deleted: number } | { ok: false, reason: 'LOGIN_REQUIRED'|'RATE_LIMITED'|'UNAVAILABLE' }>}
   */
  function removeAll({ accountKey } = {}) {
    return enqueue(async () => {
      const status = store.getStatus();
      // 앞선 일을 기다리는 사이 다른 계정이 들어왔다. 보내면 그 계정의 세션으로 그 계정의 지켜보기를 모두 지운다
      if (accountChanged(accountKey, status)) return UNAVAILABLE;
      if (!isWritable(status)) return { ok: false, reason: blockedReason(status) };
      const before = store.readGuardianWatch();
      const result = await call(() => api.removeAll());
      if (result.kind !== WATCH_KIND.OK) {
        return { ok: false, reason: REMOVE_ALL_REASONS.has(result.kind) ? result.kind : WATCH_KIND.UNAVAILABLE };
      }
      // 기다리는 동안 레코드가 바뀌었으면(다른 계정, 다른 탭의 다시 등록) 그 레코드는 지우지 않는다
      if (before && sameIds(store.readGuardianWatch(), before)) store.writeGuardianWatch(null);
      phases.clear();
      replacedPending = null;
      notify();
      const deleted = Number(result.data?.deleted);
      return { ok: true, deleted: Number.isInteger(deleted) && deleted >= 0 ? deleted : 0 };
    });
  }

  // ── '돌아왔어요' 누르기 (보기 전용에서도 된다) ─────────────────────────

  function targetOf({ date, by } = {}) {
    return isDateString(date) && isClockTime(by) ? { date, by } : null;
  }

  /**
   * '돌아왔어요': 대기열에 넣고(보기 전용 예외) QUEUED 로 둔 뒤 비운다. 보내는 중이면 받지 않는다.
   * 대기열을 저장소에 쓰지 못하면 FAILED 다(눌렀는데 아무 표시가 없지 않게).
   * departAt 은 누른 외출의 출발 시각이다(기기에만 둔다). 같은 마감의 나중 외출을 가리는 데 쓴다(watchPlan undoStaleConfirms).
   * 마감 지남 시트처럼 외출을 모르면 null 이다.
   * @param {{ date: string, by: string, departAt?: string|null }} target  backTargetOf 결과(date 는 외출이 속한 날)와 누른 외출의 출발
   */
  function pressBack(input) {
    const target = targetOf(input);
    const record = store.readGuardianWatch();
    if (!target || record?.state !== 'ON') return;
    if (phaseOf(record, target.date, target.by) === BACK_PHASE.SENDING) return;
    if (!store.writeBackQueue(applyBackAction(record.backQueue, { ...target, undo: false, atMs: now(), departAt: input.departAt })).ok) {
      setPhase(record, target, BACK_PHASE.FAILED);
      return;
    }
    setPhase(record, target, BACK_PHASE.QUEUED);
    backRetries = 0;
    void kick('back');
  }

  /**
   * 되돌리기: 대기 중인 확인이면 요청 없이 둘 다 사라지고(null), 보낸(SENT) 확인이면 undo: true 를 대기열에 넣는다.
   * 켜진(ON) 지켜보기에서, 대기 중(QUEUED)이나 보낸(SENT) 확인에만 된다. 대기열을 쓰지 못하면 UNDO_FAILED 다.
   * @param {{ date: string, by: string }} target
   */
  function undoBack(input) {
    const target = targetOf(input);
    const record = store.readGuardianWatch();
    if (!target || record?.state !== 'ON') return;
    const phase = phaseOf(record, target.date, target.by);
    if (phase !== BACK_PHASE.QUEUED && phase !== BACK_PHASE.SENT) return;
    const next = applyBackAction(record.backQueue, { ...target, undo: true, atMs: now() });
    if (!store.writeBackQueue(next).ok) {
      setPhase(record, target, BACK_PHASE.UNDO_FAILED);
      return;
    }
    const queued = next.some((item) => item.date === target.date && item.by === target.by);
    setPhase(record, target, queued ? BACK_PHASE.UNDO_QUEUED : null);
    if (queued) {
      backRetries = 0;
      void kick('back');
    }
  }

  /**
   * 그 마감의 '돌아왔어요' 단계와 되돌리기 마감. 누르지 않았으면 null.
   * @param {{ date: string, by: string }} target
   * @returns {{ phase: string, undoUntilMs: number } | null}
   */
  function backStatus(input) {
    const target = targetOf(input);
    const record = store.readGuardianWatch();
    if (!target || !record) return null;
    const phase = phaseOf(record, target.date, target.by);
    return phase === null ? null : { phase, undoUntilMs: undoUntilMs(target) };
  }

  return Object.freeze({
    start,
    stop,
    idle,
    kick,
    config: configOnce,
    ensureRegistered,
    retire,
    removeAll,
    pressBack,
    undoBack,
    backStatus,
    subscribe,
  });
}
