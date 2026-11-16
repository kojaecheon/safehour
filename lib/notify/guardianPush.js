// 보호자 서버 알림 구독 실행기 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 5, 다르게 정한 것 2·3,
// 정한 값 4·5·7·8·9·10·11·12·13·14·16·27, ADR-0012)
//
//   const push = createGuardianPush({ store, fetchImpl, now, timers, win, nav, NotificationImpl, subtle });
//   push.start();                 // 저장소 주제·화면 복귀·온라인 복귀를 잇고, 다시 맞추기와 상태 조회 타이머를 건다(여러 번 불러도 한 번)
//   push.getState(watchId);       // 화면 상태(얼린 객체, 바뀐 것이 없으면 같은 객체). push.subscribe(listener) 로 바뀜을 받는다
//   push.turnOn(watchId);  push.takeOver(watchId);  push.renew();   // 사용자 동작 안에서만 부른다(구독은 이 셋에서만 만든다)
//   push.turnOff(watchId);  push.mute(watchId, on);  push.refreshStatus(watchId, { force });  push.reconcile();
//   push.prepare(watchId);  push.poll(watchId);  push.forgetBrowser({ timeoutMs });  push.idle();  push.stop();
//
// 정한 것
//   - 켜기, 끄기, 다시 켜기, 다시 받기, 함께 있음, 다시 맞추기, 상태 조회는 약속 사슬 하나에 줄 선다(겹치지 않는다).
//     다시 맞추기와 상태 조회는 겹쳐 부르면 같은 약속이다. 같은 지켜보기의 켜기·끄기·다시 받기·함께 있음이 도는 중이면(권한 창을
//     기다리는 동안 포함) 그 약속을 돌려준다: 끄기를 눌러도 도는 켜기의 결과가 온다. 그동안 getState(watchId).busy 가 참이라
//     화면은 스위치를 잠근다.
//   - 같은 기기의 여러 탭: 그 줄의 일 하나하나를 Web Locks(navigator.locks, 이름 DEVICE_LOCK_NAME) 안에서 돌려 탭 사이에서도 한 번에
//     하나다. 두 탭이 같은 지켜보기를 함께 다시 POST 하면 늦게 온 응답이 서버의 지금 subId 를 덮고, 저장소 불변식이 그 subId 를 해지
//     대기에 넣어 서버 구독이 지워진다(잘못된 MOVED). 일은 잠금을 얻은 뒤 기록, 사본, 언어, 브라우저 구독을 다시 읽어 정한다(잠금
//     전에 세운 계획으로 움직이지 않는다). 권한 창 기다림과 forgetBrowser 는 잠금 밖이다. 잠금은 DEVICE_LOCK_HOLD_MS 까지만
//     붙잡는다(요청은 sendWatchRequest 의 15초 한도가 있지만 브라우저 푸시 API 는 한도가 없다): 그 뒤에는 일이 끝나지 않았어도 다른
//     탭이 차례를 받고, 일은 이 탭의 줄에서 계속된다. 일이 던지거나 탭이 닫히면 잠금은 풀린다. Web Locks 가 없거나 잠금 요청이
//     실패하면 지금처럼 탭 안 줄로만 지킨다(남는 틈).
//   - 켜기(turnOn)는 첫 await 전에 권한 요청을 시작한다(turnOnDeviceNotifications, 기기 알림 스위치도 함께 켠다). 권한 답은
//     줄 밖에서 기다린다(열린 권한 창이 끄기, 다시 맞추기, 상태 조회를 막지 않는다). 답이 오면 줄에 서서 설정, 준비 확인(미리
//     확인한 값이 참이면 건너뜀), 브라우저 구독 고르기, POST, 기록 순서다. 다시 받기(takeOver)는 권한을 묻지 않는다.
//   - 저절로 구독하지 않는다. pushManager.subscribe 는 켜기, 다시 받기, 다시 켜기 안에서만 부른다. VAPID 키가 바뀌었거나 기록이
//     있는데 브라우저 구독이 없으면 renewNeeded, 상태 조회의 subscriptionActive 거짓은 moved 를 보일 뿐이다(결정 19, 정한 값 9).
//     moved 인 구독은 언어나 endpoint 해시가 바뀌어도 다시 맞추기가 다시 POST 하지 않고, 다시 켜기도 건너뛴다(다시 POST 하면
//     서버가 다른 휴대폰의 구독을 바꾼다). moved 는 다시 받기로만 푼다.
//   - 계정 지키기: 동작을 시작할 때 저장소의 계정 키를 잡아 두고, 모든 await 뒤와 요청을 보내기 직전에 계정이 같고 쓰기 가능한지
//     다시 본다(다른 탭이 계정을 바꿔 저장소가 메모리 세션을 버린 것도 쓰기 불가로 잡힌다). 다르면 멈춘다: 계정이 바뀌었으면
//     UNAVAILABLE, 같은 계정이 보기 전용이 됐으면 READ_ONLY. 앞 계정에서 이미 받아들여진 구독은 지금 계정 기록에 넣지 않고
//     queueServerDelete({ watchId, subId }) 로 넘긴다. 결과 줄(lastResult)은 같은 계정일 때만 남기고, 계정이 바뀌면 지운다.
//   - 기다림 뒤의 기록 쓰기는 모두 updateGuardianPush(동기 updater) 로 한다. 기다리기 전에 읽은 기록을 통째로 쓰지 않는다. 구독을
//     빼거나 subId 를 바꾸면 옛 subId 는 저장소 불변식이 해지 대기로 넣는다. 404 로 뺄 때만 gone 에 넣어 해지를 건너뛴다.
//   - 끄기는 retireGuardianPushSub 로 해지 대기를 거친다. queued 가 거짓이면(대기 상한에 밀려 버려짐) 같은 동기 구간에서 해지를
//     한 번 직접 보내고 200·404 는 OFF_DONE, 그 밖은 OFF_UNSENT 다. 해지는 로그인이 필요 없다. 이 기기 모든 계정에 구독이 없으면
//     브라우저 구독도 지운다(정한 값 7). 다시 맞추기가 끄는 구독도 같고, 직접 보낸 해지가 닿지 않으면 그 지켜보기 결과가
//     OFF_UNSENT 다(권한을 잃어 끈 것이면 PERMISSION_LOST 를 남긴다: 권한 없이는 남은 서버 구독이 알림을 띄우지 못한다).
//     기록하지 못한 구독(계정이 바뀜, 기록 쓰기 실패)을 queueServerDelete 로 넘길 때도 대기에 남았는지 보고, 상한에 밀렸으면 한 번
//     직접 보낸다.
//   - 로그인 없는 보호자(결정 27): 구독, 상태 조회, 함께 있음, 다시 맞추기는 쓰기 가능(로그인)할 때만 한다. 설정 읽기와 해지만
//     세션 없이 나간다. 계정 키는 어디에도 보내지 않는다.
//   - 설정은 10분 기억한다. 못 읽으면 기록을 바꾸지 않고 켜기만 막는다. 꺼짐이면 구독·상태 조회·함께 있음을 보내지 않는다.
//     사본에 그 watchId 가 없으면 설정도 읽지 않는다(정한 값 12).
//   - 다시 맞추기의 다시 POST 는 실행기 하나에서 (계정, 지켜보기)마다 한 번만 시도한다(429·503 에서 되풀이하지 않는다).
//   - 실행기 자신의 기록 쓰기로 온 저장소 알림은 다시 맞추기를 부르지 않는다(화면 구독자에게는 알린다).
//   - 타이머는 주입한 timers 로만 건다(AbortSignal.timeout 을 쓰지 않는다). timers 가 없으면 한도 없이 기다린다(브라우저의
//     client.js 는 늘 넘긴다). console 을 쓰지 않는다. watchId, subId, endpoint, endpoint 해시, 계정 키를 URL·오류·기록에 싣지
//     않는다(식별 값은 요청 본문으로만 간다). 실행기는 던지지 않는다.
//
// 저장소(lib/store createStore 모양), fetch, 시계, 타이머, 창, navigator, Notification, crypto.subtle, Web Locks 는 주입한다.
// 날짜·시각은 KST 도우미로만 계산한다. 서버 전용 모듈을 불러오지 않는다.

import { kstClock } from '../../src/engine/tripPlan.js';
import { fromBase64Url, toBase64Url } from '../../src/guardian/crypto.js';
import {
  muteRequest,
  readConfigData,
  readMuteData,
  readStatusData,
  readSubscribeData,
  statusRequest,
  subscribeRequest,
  unsubscribeRequest,
} from '../../src/guardian/pushRequests.js';
import { WATCH_ID_RE, WATCH_KIND, configRequest } from '../../src/guardian/watchRequests.js';
import { sendWatchRequest } from '../../src/guardian/watchSend.js';
import { normalizeLang } from '../../src/i18n/index.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { addDays, kstInstantMs } from '../../src/stay/time.js';
import { STORE_ERROR } from '../store/keys.js';
import { liveWatchIdsOf, movedWatchIdsOf, planReconcile, statusTimes, todayDeadlinesOf } from './guardianPushPlan.js';
import { turnOnDeviceNotifications } from './permission.js';
import { PUSH_SUPPORT, readPushSupport } from './pushSupport.js';

/** 설정(GET /api/push/config)을 기억하는 시간 */
export const CONFIG_TTL_MS = 10 * 60_000;
/** /g 가 보이는 동안 상태 조회 간격 */
export const STATUS_POLL_MS = 5 * 60_000;
/** 상태 조회 최소 간격(force 가 아니면) */
export const STATUS_MIN_GAP_MS = 2 * 60_000;
/** 준비 확인 답을 기다리는 시간 */
export const SW_INFO_TIMEOUT_MS = 2_000;
/** registration.update() 와 컨트롤러 교체를 기다리는 시간 */
export const SW_UPDATE_TIMEOUT_MS = 5_000;
/** '이 기기에서 내 정보 지우기' 전 브라우저 구독 지우기 한도 */
export const FORGET_TIMEOUT_MS = 3_000;
/** 서비스 워커 준비 확인 메시지 종류(public/sw.js 와 같다) */
export const SW_INFO_TYPE = 'SAFEHOUR_SW_INFO';
/** 같은 기기의 탭 사이 차례(Web Locks) 이름. 이 기능만 쓴다 */
export const DEVICE_LOCK_NAME = 'safehour-guardian-push';
/** 탭 사이 차례를 붙잡는 최대 시간. 지나면 일이 끝나지 않았어도 다른 탭에 차례를 넘긴다 */
export const DEVICE_LOCK_HOLD_MS = 60_000;

/** 동작 결과(화면 결과 줄 하나씩, 정한 값 5) */
export const PUSH_RESULT = Object.freeze({
  ON: 'ON',
  DENIED: 'DENIED',
  UNSUPPORTED: 'UNSUPPORTED',
  SW_NOT_READY: 'SW_NOT_READY',
  /** 브라우저 구독 호출이 던졌거나 요청 모양이 틀렸거나 서버가 거절(400) */
  FAILED: 'FAILED',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  /** 서버 알림 꺼짐 */
  OFF: 'OFF',
  /** 지켜보기가 없어졌다(404) */
  GONE: 'GONE',
  UNAVAILABLE: 'UNAVAILABLE',
  NETWORK: 'NETWORK',
  READ_ONLY: 'READ_ONLY',
  OFF_DONE: 'OFF_DONE',
  /** 이 휴대폰에서는 껐고 서버 해지는 대기에 남았다 */
  OFF_PENDING: 'OFF_PENDING',
  /** 대기 상한에 밀려 직접 한 번 보낸 해지가 닿지 않았다. 다시 보낼 곳이 없다(서버 구독은 지켜보기 만료까지 남는다) */
  OFF_UNSENT: 'OFF_UNSENT',
  MUTE_ON: 'MUTE_ON',
  MUTE_OFF: 'MUTE_OFF',
  /** 알림 권한이 사라져 서버 알림도 껐다(한 번 보인다) */
  PERMISSION_LOST: 'PERMISSION_LOST',
});

/** 서버 렌더링과 실행기가 없을 때의 화면 상태 */
export const IDLE_STATE = Object.freeze({
  support: PUSH_SUPPORT.UNSUPPORTED,
  config: null,
  swReady: null,
  sub: null,
  status: null,
  gone: false,
  renewNeeded: false,
  moved: false,
  busy: false,
  lastResult: null,
});

const MAX_TIMER_MS = 2 ** 31 - 1;
/** 다시 맞추기 한 차례 안에서 도는 중에 다시 불린 만큼 더 도는 상한 */
const RECONCILE_MAX_PASSES = 3;
const WATCH_TOPICS = Object.freeze(['guardianCopies', 'guardianPush', 'prefs', 'status']);
const EMPTY_RECORD = Object.freeze({ subs: Object.freeze([]), status: Object.freeze([]), gone: Object.freeze([]) });

const noop = () => {};
const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);

function isWritable(status) {
  return status.readOnly === false && Boolean(status.accountKey);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/** 넘겨받은 Web Locks, 없으면 navigator.locks. request 가 없거나 읽다가 던지면 null(탭 안 줄만) */
function resolveLocks(locks, navigator) {
  try {
    const found = locks === undefined ? navigator?.locks : locks;
    return found && typeof found.request === 'function' ? found : null;
  } catch {
    return null;
  }
}

/** 구독 하나를 넣은 다음 기록(updateGuardianPush 의 동기 updater). 같은 watchId 는 바꾸고 gone 에서 빼며, 오늘 상태는 활성으로 둔다 */
function withSub(current, sub) {
  const base = current ?? EMPTY_RECORD;
  return {
    subs: [...base.subs.filter((item) => item.watchId !== sub.watchId), sub],
    status: base.status.map((item) => (item.watchId === sub.watchId ? { ...item, active: true } : item)),
    gone: base.gone.filter((watchId) => watchId !== sub.watchId),
  };
}

/** 지켜보기가 없어진(404) 다음 기록: 구독과 상태를 빼고 gone 에 넣는다(gone 이라 해지 대기를 건너뛴다) */
function withGone(current, watchId) {
  const base = current ?? EMPTY_RECORD;
  return {
    subs: base.subs.filter((item) => item.watchId !== watchId),
    status: base.status.filter((item) => item.watchId !== watchId),
    gone: [...base.gone.filter((id) => id !== watchId), watchId],
  };
}

/** 상태 조회 결과 하나를 넣은 다음 기록 */
function withStatus(current, entry) {
  const base = current ?? EMPTY_RECORD;
  return { subs: base.subs, status: [...base.status.filter((item) => item.watchId !== entry.watchId), entry], gone: base.gone };
}

/** 오늘 상태의 muted 를 고친 다음 기록 */
function withMuted(current, watchId, date, muted) {
  const base = current ?? EMPTY_RECORD;
  return {
    subs: base.subs,
    status: base.status.map((item) => (item.watchId === watchId && item.date === date ? { ...item, muted } : item)),
    gone: base.gone,
  };
}

/**
 * @param {object} options
 * @param {ReturnType<import('../store/store.js').createStore>} options.store
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {{ setTimeout: Function, clearTimeout: Function } | null} [options.timers]
 * @param {object | null} [options.win]  window (PushManager, MessageChannel, document, online 이벤트)
 * @param {object | null} [options.nav]  navigator (serviceWorker, language, standalone)
 * @param {object} [options.NotificationImpl]  Notification
 * @param {SubtleCrypto | null} [options.subtle]  endpoint 해시
 * @param {{ request: Function } | null} [options.locks]  탭 사이 차례(Web Locks). 넘기지 않으면 navigator.locks, 없으면 탭 안 줄만
 */
export function createGuardianPush({
  store,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = Date.now,
  timers = null,
  win = null,
  nav = null,
  NotificationImpl = undefined,
  subtle = null,
  locks = undefined,
} = {}) {
  const navigator = nav ?? win?.navigator ?? null;
  const lockManager = resolveLocks(locks, navigator);
  const listeners = new Set();
  let chain = Promise.resolve();
  let started = false;
  const detach = [];

  let configCache = null;
  let configLoading = null;
  let lastConfig = null;
  let configFailure = PUSH_RESULT.UNAVAILABLE;

  let swReady = null;
  let workerCheck = null;

  /**
   * 지켜보기별 마지막 결과(getState().lastResult). 사용자 동작(trackAction, blockedResult, renew)은 어떤 값이든 남기지만, 바탕에서
   * 도는 길(다시 맞추기, 상태 조회와 poll, prepare)은 OFF_UNSENT, PERMISSION_LOST, GONE 만 남긴다. 화면
   * (components/guardian/GuardianPushItem.js 의 lastAction 맞추기)이 여기에 기댄다: 켜진(ON) 동안 바탕 길이 NETWORK, FAILED 같은
   * 사용자 동작 실패 값을 남기면 화면이 맞지 않는 문구를 그린다.
   */
  const lastResults = new Map();
  const busy = new Set();
  const actions = new Map();
  let renewing = null;
  let renewNeeded = false;
  /** 다시 맞추기의 다시 POST 시도: `${계정 키}|${watchId}` (메모리, 실행기 하나에 한 번) */
  const repostTried = new Set();
  const statusRuns = new Map();
  /** 상태 조회를 보낸 기기 시각: `${계정 키}|${watchId}` → ms (실패한 조회도 간격을 센다) */
  const statusAttempts = new Map();
  let reconcileRun = null;
  let reconcileAgain = false;
  let selfWriting = 0;
  let statusTimer = null;
  let lastAccount = null;
  let lastWritable = false;
  const stateCache = new Map();

  // ── 공용 도우미 ────────────────────────────────────────────────────

  /** 일 하나를 탭 안 줄에 세우고, 차례가 오면 탭 사이 잠금 안에서 돌린다 */
  function enqueue(task) {
    const run = chain.then(() => withDeviceLock(task));
    chain = run.then(noop, noop);
    return run;
  }

  /**
   * 같은 기기의 탭 사이에서 한 번에 하나(Web Locks). 잠금 안에서 일을 시작하고, 일이 끝나거나 DEVICE_LOCK_HOLD_MS 가 지나면 잠금을
   * 놓는다(주입 타이머가 없으면 일이 끝날 때까지). 돌려주는 약속은 늘 일 자체의 약속이라 탭 안 줄은 일이 끝날 때까지 기다린다.
   * 잠금이 없거나 잠금 요청이 일을 시작하기 전에 실패하면 잠금 없이 돌린다(지금처럼 탭 안 줄만).
   */
  function withDeviceLock(task) {
    if (!lockManager) return task();
    let running = null;
    const hold = () => {
      running = Promise.resolve().then(task);
      if (!timers) return running;
      return new Promise((release) => {
        const timer = timers.setTimeout(release, DEVICE_LOCK_HOLD_MS);
        const done = () => {
          timers.clearTimeout(timer);
          release();
        };
        running.then(done, done);
      });
    };
    let request = null;
    try {
      request = lockManager.request(DEVICE_LOCK_NAME, hold);
    } catch {
      request = null;
    }
    const after = () => running ?? task();
    return Promise.resolve(request).then(after, after);
  }

  /** 줄에 걸린 일이 모두 끝날 때까지 기다린다 */
  async function idle() {
    for (;;) {
      const current = chain;
      await current;
      if (current === chain) return;
    }
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 화면 구독자의 예외는 실행기를 멈추지 않는다
      }
    }
  }

  /** 잡아 둔 계정과 지금 계정이 다르거나 쓸 수 없는가 */
  function stale(accountKey) {
    const status = store.getStatus();
    return status.accountKey !== accountKey || !isWritable(status);
  }

  function staleResult(accountKey) {
    return store.getStatus().accountKey !== accountKey ? PUSH_RESULT.UNAVAILABLE : PUSH_RESULT.READ_ONLY;
  }

  /** 실행기 자신의 저장소 쓰기. 그 쓰기로 온 알림은 다시 맞추기를 부르지 않는다 */
  function selfWrite(write) {
    selfWriting += 1;
    try {
      return write();
    } finally {
      selfWriting -= 1;
    }
  }

  /** 결과 줄은 동작을 시작한 계정이 지금 계정일 때만 남긴다 */
  function setResult(watchId, accountKey, result) {
    if (store.getStatus().accountKey !== accountKey) return;
    lastResults.set(watchId, result);
  }

  function readPermission() {
    try {
      return NotificationImpl?.permission ?? null;
    } catch {
      return null;
    }
  }

  function readSupport() {
    return readPushSupport({ navigator, PushManager: win?.PushManager, Notification: NotificationImpl });
  }

  function currentLang() {
    try {
      return store.readLang?.() ?? normalizeLang(navigator?.language);
    } catch {
      return normalizeLang(null);
    }
  }

  function readRecord() {
    try {
      return store.readGuardianPush();
    } catch {
      return null;
    }
  }

  function readCopies() {
    try {
      return store.readGuardianCopies();
    } catch {
      return [];
    }
  }

  function liveWatchIds() {
    return new Set(liveWatchIdsOf(readCopies()));
  }

  const subOf = (record, watchId) => record?.subs?.find((item) => item.watchId === watchId) ?? null;

  /** 이 기기(모든 계정)에 구독 기록이 하나라도 있는가 */
  function deviceHasSubs() {
    try {
      return (readRecord()?.subs?.length ?? 0) > 0 || store.guardianPushElsewhere();
    } catch {
      return true;
    }
  }

  function isVisible() {
    try {
      return win?.document?.visibilityState !== 'hidden';
    } catch {
      return true;
    }
  }

  async function send(request) {
    try {
      const result = await sendWatchRequest(request, { fetchImpl });
      return result && typeof result.kind === 'string' ? result : { ok: false, kind: WATCH_KIND.UNAVAILABLE };
    } catch {
      return { ok: false, kind: WATCH_KIND.NETWORK };
    }
  }

  function sendUnsubscribe(sub) {
    let request;
    try {
      request = unsubscribeRequest({ watchId: sub.watchId, subId: sub.subId });
    } catch {
      return Promise.resolve({ ok: false, kind: WATCH_KIND.BAD });
    }
    return send(request);
  }

  /** 해지 결과가 끝난 것인가(200, 또는 이미 없음 404) */
  const unsubscribeDone = (result) => result.ok || result.kind === WATCH_KIND.NOT_FOUND;

  /**
   * 기록하지 못한 구독 하나의 해지를 서버 삭제 대기에 넣는다. 넣지 못했거나 대기 상한에 밀려 남지 못했으면 한 번 직접 보낸다
   * (다시 보낼 곳이 없다). 대기 확인은 넣은 바로 뒤 같은 동기 구간에서 한다(보내기 재시도는 비동기라 아직 항목이 남아 있다).
   * @returns {Promise<object> | null} 직접 보냈으면 그 약속
   */
  function queueUnsubscribe(sub) {
    const ids = { watchId: sub.watchId, subId: sub.subId };
    let kept = false;
    try {
      kept =
        store.queueServerDelete(ids).ok === true &&
        store.readPendingServerDelete().some((item) => item.watchId === ids.watchId && item.subId === ids.subId);
    } catch {
      kept = false;
    }
    return kept ? null : sendUnsubscribe(ids);
  }

  /** 약속을 주입 타이머 한도 안에서 기다린다. 한도에 닿거나 실패하면 fallback. 타이머가 없으면 한도 없이 기다린다 */
  function withLimit(promise, ms, fallback) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (timer !== null) timers.clearTimeout(timer);
        resolve(value);
      };
      if (timers) {
        timer = timers.setTimeout(() => {
          timer = null;
          finish(fallback);
        }, ms);
      }
      Promise.resolve(promise).then(finish, () => finish(fallback));
    });
  }

  // ── 설정 ──────────────────────────────────────────────────────────

  function cachedConfig() {
    return configCache && now() - configCache.atMs < CONFIG_TTL_MS ? configCache.value : null;
  }

  /** 설정 읽기(10분 기억, 겹치면 한 번). 못 읽으면 null 이고 configFailure 에 이유를 둔다 */
  function loadConfig() {
    const cached = cachedConfig();
    if (cached) return Promise.resolve(cached);
    if (configLoading) return configLoading;
    configLoading = (async () => {
      const result = await send(configRequest());
      const value = result.ok ? readConfigData(result.data) : null;
      if (value) {
        const frozen = Object.freeze(value);
        configCache = { value: frozen, atMs: now() };
        lastConfig = frozen;
        notify();
        return frozen;
      }
      configFailure = result.kind === WATCH_KIND.NETWORK ? PUSH_RESULT.NETWORK : PUSH_RESULT.UNAVAILABLE;
      return null;
    })().finally(() => {
      configLoading = null;
    });
    return configLoading;
  }

  // ── 서비스 워커 준비 확인 (정한 값 4) ───────────────────────────────

  async function getRegistration() {
    try {
      return (await navigator?.serviceWorker?.getRegistration?.()) ?? null;
    } catch {
      return null;
    }
  }

  /** 활성 워커에 SAFEHOUR_SW_INFO 를 보내 { push: true } 답을 2초 기다린다 */
  function askWorker(registration) {
    const worker = registration?.active;
    const Channel = win?.MessageChannel;
    if (!worker || typeof worker.postMessage !== 'function' || typeof Channel !== 'function') return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      let channel = null;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (timer !== null) timers.clearTimeout(timer);
        try {
          channel?.port1?.close?.();
        } catch {
          // 포트 닫기 실패는 넘어간다
        }
        resolve(value);
      };
      try {
        channel = new Channel();
        channel.port1.onmessage = (event) => {
          const data = event?.data;
          if (data && data.type === SW_INFO_TYPE) finish(data.push === true);
        };
        if (timers) {
          timer = timers.setTimeout(() => {
            timer = null;
            finish(false);
          }, SW_INFO_TIMEOUT_MS);
        }
        worker.postMessage({ type: SW_INFO_TYPE }, [channel.port2]);
      } catch {
        finish(false);
      }
    });
  }

  /** 컨트롤러 교체를 ms 까지 기다리는 대기. 리스너를 먼저 달아 update() 중의 교체도 놓치지 않는다 */
  function watchControllerChange(ms) {
    const container = navigator?.serviceWorker;
    let fired = false;
    let done = false;
    let timer = null;
    let resolveWait = noop;
    const promise = new Promise((resolve) => {
      resolveWait = resolve;
    });
    const onChange = () => {
      fired = true;
      finish(true);
    };
    function finish(value) {
      if (done) return;
      done = true;
      if (timer !== null) timers.clearTimeout(timer);
      try {
        container?.removeEventListener?.('controllerchange', onChange);
      } catch {
        // 리스너 떼기 실패는 넘어간다
      }
      resolveWait(value);
    }
    try {
      container?.addEventListener?.('controllerchange', onChange);
    } catch {
      finish(false);
    }
    if (!done && timers) {
      timer = timers.setTimeout(() => {
        timer = null;
        finish(false);
      }, ms);
    }
    return { promise, fired: () => fired, cancel: () => finish(false) };
  }

  /**
   * 준비 확인: 답이 없으면 registration.update() 뒤 새 워커가 깔리면 컨트롤러 교체를 5초까지 기다리고 한 번 더 묻는다.
   * 결과는 swReady 에 둔다. 이미 참이면 묻지 않는다. 겹치면 한 번.
   */
  function ensureWorker() {
    if (swReady === true) return Promise.resolve(true);
    if (workerCheck) return workerCheck;
    workerCheck = (async () => {
      const registration = await getRegistration();
      if (!registration) return false;
      if (await askWorker(registration)) return true;
      const change = watchControllerChange(SW_UPDATE_TIMEOUT_MS);
      let update;
      try {
        update = registration.update?.();
      } catch {
        update = undefined;
      }
      await withLimit(update, SW_UPDATE_TIMEOUT_MS, undefined);
      if (change.fired() || registration.installing || registration.waiting) await change.promise;
      else change.cancel();
      return askWorker((await getRegistration()) ?? registration);
    })()
      .then(
        (ready) => ready === true,
        () => false,
      )
      .then((ready) => {
        swReady = ready;
        workerCheck = null;
        notify();
        return ready;
      });
    return workerCheck;
  }

  // ── 브라우저 구독 (정한 값 7) ───────────────────────────────────────

  function subscriptionJson(subscription) {
    try {
      const json = subscription?.toJSON?.();
      if (!json || typeof json.endpoint !== 'string' || !json.keys) return null;
      return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
    } catch {
      return null;
    }
  }

  /** 브라우저 구독의 applicationServerKey(채움 없는 base64url). 읽을 수 없으면 null */
  function subscriptionKey(subscription) {
    try {
      const raw = subscription?.options?.applicationServerKey;
      if (!raw) return null;
      let bytes = null;
      if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw);
      else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      return bytes && bytes.length > 0 ? toBase64Url(bytes) : null;
    } catch {
      return null;
    }
  }

  /** endpoint 의 SHA-256, 채움 없는 base64url. 못 만들면 null */
  async function hashEndpoint(endpoint) {
    try {
      if (!subtle || typeof endpoint !== 'string') return null;
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
      return toBase64Url(new Uint8Array(digest));
    } catch {
      return null;
    }
  }

  /**
   * 다시 맞추기용 브라우저 구독 읽기. 등록이나 구독을 읽지 못하면 null(모름), 구독이 없으면 { subscription: null }
   */
  async function readBrowser() {
    const registration = await getRegistration();
    const manager = registration?.pushManager;
    if (!manager || typeof manager.getSubscription !== 'function') return null;
    let subscription;
    try {
      subscription = (await manager.getSubscription()) ?? null;
    } catch {
      return null;
    }
    if (subscription === null) return { subscription: null };
    const json = subscriptionJson(subscription);
    const endpointHash = json ? await hashEndpoint(json.endpoint) : null;
    if (!json || !endpointHash) return null;
    return { subscription, json, endpointHash, key: subscriptionKey(subscription) };
  }

  /** 브라우저 구독을 지운다. 실패는 넘어간다(서버 구독은 해지 대기가 지운다) */
  async function unsubscribeBrowser() {
    try {
      const registration = await getRegistration();
      const subscription = await registration?.pushManager?.getSubscription?.();
      if (subscription) await subscription.unsubscribe();
    } catch {
      // 지우지 못해도 다음 켜기의 구독 고르기가 정리한다
    }
  }

  /** 방금 만든 브라우저 구독을 이 기기의 다른 구독이 쓰지 않으면 지운다 */
  async function dropIfUnused(browser) {
    if (!browser?.created || deviceHasSubs()) return;
    try {
      await browser.subscription.unsubscribe();
    } catch {
      // 지우지 못해도 다음 켜기의 구독 고르기가 정리한다
    }
  }

  /** 새 브라우저 구독. { subscription, json, endpointHash, created: true } 또는 { result } */
  async function createSubscription(accountKey, manager, configKey) {
    let subscription;
    try {
      subscription = await manager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(configKey) });
    } catch {
      return { result: PUSH_RESULT.FAILED };
    }
    const json = subscriptionJson(subscription);
    const endpointHash = json ? await hashEndpoint(json.endpoint) : null;
    const made = { subscription, json, endpointHash, created: true };
    if (stale(accountKey)) {
      await dropIfUnused(made);
      return { result: staleResult(accountKey) };
    }
    if (!json || !endpointHash) {
      await dropIfUnused(made);
      return { result: PUSH_RESULT.FAILED };
    }
    return made;
  }

  /**
   * 켜기·다시 받기의 브라우저 구독 고르기: 있는 구독이 (a) 이 계정 구독 기록 가운데 같은 해시이면서 키가 설정과 같은 것이 있거나
   * (b) 다른 계정이 구독을 쓰고 그 구독의 키가 설정과 같거나 읽을 수 없으면 다시 쓴다. 있지만 둘 다 아니면 지우고 새로 만든다.
   */
  async function chooseSubscription(accountKey, configKey) {
    const registration = await getRegistration();
    if (stale(accountKey)) return { result: staleResult(accountKey) };
    const manager = registration?.pushManager;
    if (!manager || typeof manager.subscribe !== 'function') return { result: PUSH_RESULT.UNSUPPORTED };
    let existing;
    try {
      existing = (await manager.getSubscription()) ?? null;
    } catch {
      return { result: PUSH_RESULT.FAILED };
    }
    if (stale(accountKey)) return { result: staleResult(accountKey) };
    if (existing) {
      const json = subscriptionJson(existing);
      const endpointHash = json ? await hashEndpoint(json.endpoint) : null;
      if (stale(accountKey)) return { result: staleResult(accountKey) };
      const browserKey = subscriptionKey(existing);
      const ownMatch =
        endpointHash !== null && (readRecord()?.subs ?? []).some((item) => item.endpointHash === endpointHash && item.vapidKey === configKey);
      const sharedMatch = store.guardianPushElsewhere() && (browserKey === null || browserKey === configKey);
      if (json && endpointHash && (ownMatch || sharedMatch)) return { subscription: existing, json, endpointHash, created: false };
      try {
        await existing.unsubscribe();
      } catch {
        // 지우지 못하면 아래 subscribe 가 던져 FAILED 가 된다
      }
      if (stale(accountKey)) return { result: staleResult(accountKey) };
    }
    return createSubscription(accountKey, manager, configKey);
  }

  // ── 서버 요청 ──────────────────────────────────────────────────────

  function markGone(watchId) {
    selfWrite(() => store.updateGuardianPush((current) => withGone(current, watchId)));
  }

  /** 실패한 요청 결과 → PUSH_RESULT. 404 는 gone, OFF 는 설정 기억을 버린다 */
  function failureOf(result, watchId) {
    switch (result.kind) {
      case WATCH_KIND.NOT_FOUND:
        markGone(watchId);
        return PUSH_RESULT.GONE;
      case WATCH_KIND.OFF:
        configCache = null;
        return PUSH_RESULT.OFF;
      case WATCH_KIND.LOGIN_REQUIRED:
        return PUSH_RESULT.LOGIN_REQUIRED;
      case WATCH_KIND.RATE_LIMITED:
        return PUSH_RESULT.RATE_LIMITED;
      case WATCH_KIND.NETWORK:
        return PUSH_RESULT.NETWORK;
      case WATCH_KIND.BAD:
        return PUSH_RESULT.FAILED;
      default:
        return PUSH_RESULT.UNAVAILABLE;
    }
  }

  /** POST /api/watch/subscribe 와 기록. 보내기 직전과 응답 뒤에 계정을 다시 본다 */
  async function postSubscribe(watchId, accountKey, browser, configKey, lang) {
    if (stale(accountKey)) return staleResult(accountKey);
    let request;
    try {
      request = subscribeRequest({ watchId, subscription: browser.json, lang });
    } catch {
      return PUSH_RESULT.FAILED;
    }
    const result = await send(request);
    const data = result.ok ? readSubscribeData(result.data) : null;
    if (stale(accountKey)) {
      // 앞 계정에서 받아들여진 구독은 지금 계정 기록에 넣지 않고 해지 대기로 넘긴다(상한에 밀리면 한 번 직접 보낸다)
      if (data) await queueUnsubscribe({ watchId, subId: data.subId });
      return staleResult(accountKey);
    }
    if (!result.ok) return failureOf(result, watchId);
    if (!data) return PUSH_RESULT.UNAVAILABLE;
    const sub = { watchId, subId: data.subId, lang, endpointHash: browser.endpointHash, vapidKey: configKey };
    const written = selfWrite(() => store.updateGuardianPush((current) => withSub(current, sub)));
    if (!written.ok) {
      await queueUnsubscribe({ watchId, subId: data.subId });
      return written.code === STORE_ERROR.READ_ONLY ? PUSH_RESULT.READ_ONLY : PUSH_RESULT.FAILED;
    }
    return PUSH_RESULT.ON;
  }

  /**
   * 상태 조회 한 번(줄 안에서 부른다). 보내지 않았으면 null, 보냈으면 결과 종류(WATCH_KIND). 결과 줄(lastResults)은 남기지 않는다.
   * @param {{ force?: boolean }} options  force 면 2분 간격을 보지 않는다(부른 뒤에 바뀔 수 있어 객체로 받는다)
   */
  async function statusFlow(watchId, accountKey, options) {
    if (stale(accountKey)) return null;
    if (!isWatchId(watchId) || !liveWatchIds().has(watchId)) return null;
    const record = readRecord();
    if (record?.gone?.includes(watchId)) return null;
    const attemptKey = `${accountKey}|${watchId}`;
    if (options.force !== true) {
      const previous = record?.status?.find((item) => item.watchId === watchId)?.atMs ?? Number.NEGATIVE_INFINITY;
      const last = Math.max(previous, statusAttempts.get(attemptKey) ?? Number.NEGATIVE_INFINITY);
      if (now() - last < STATUS_MIN_GAP_MS) return null;
    }
    const config = await loadConfig();
    if (stale(accountKey) || config?.enabled !== true) return null;
    const subId = subOf(readRecord(), watchId)?.subId ?? null;
    let request;
    try {
      request = statusRequest({ watchId, subId });
    } catch {
      return null;
    }
    statusAttempts.set(attemptKey, now());
    const result = await send(request);
    if (stale(accountKey)) return result.kind;
    if (result.ok) {
      const data = readStatusData(result.data);
      if (!data) return WATCH_KIND.UNAVAILABLE;
      const atMs = now();
      selfWrite(() =>
        store.updateGuardianPush((current) => {
          const sameSub = subId !== null && subOf(current, watchId)?.subId === subId;
          return withStatus(current, {
            watchId,
            date: data.date,
            confirmed: data.confirmed,
            muted: data.muted,
            active: sameSub ? data.subscriptionActive : null,
            atMs,
          });
        }),
      );
      return WATCH_KIND.OK;
    }
    if (result.kind === WATCH_KIND.NOT_FOUND) markGone(watchId);
    else if (result.kind === WATCH_KIND.OFF) configCache = null;
    return result.kind;
  }

  // ── 켜기 · 다시 받기 ────────────────────────────────────────────────

  /** 줄에 서기 전 동기 확인. 막히면 PUSH_RESULT, 아니면 null */
  function precheck(watchId, { ask }) {
    if (!isWritable(store.getStatus())) return PUSH_RESULT.READ_ONLY;
    const support = readSupport();
    if (support === PUSH_SUPPORT.DENIED) return PUSH_RESULT.DENIED;
    if (support !== PUSH_SUPPORT.READY) return PUSH_RESULT.UNSUPPORTED;
    if (!ask && readPermission() !== 'granted') return PUSH_RESULT.DENIED;
    if (!isWatchId(watchId) || !liveWatchIds().has(watchId)) return PUSH_RESULT.UNAVAILABLE;
    if (readRecord()?.gone?.includes(watchId)) return PUSH_RESULT.GONE;
    return null;
  }

  /**
   * 지켜보기 하나의 동작을 줄에 세우고 busy·결과 줄을 관리한다. gate 가 있으면(권한 답) 줄 밖에서 먼저 기다리고, 막히면
   * (PUSH_RESULT) 줄에 서지 않는다. 열린 권한 창이 다른 동작을 막지 않게 한다.
   */
  function trackAction(watchId, accountKey, flow, gate = null) {
    busy.add(watchId);
    notify();
    const queued = () =>
      enqueue(async () => {
        try {
          return await flow();
        } catch {
          return PUSH_RESULT.FAILED;
        }
      });
    const begun = gate ? gate.then((blocked) => blocked ?? queued(), () => PUSH_RESULT.FAILED) : queued();
    const run = begun.then((result) => {
      busy.delete(watchId);
      actions.delete(watchId);
      setResult(watchId, accountKey, result);
      notify();
      return result;
    });
    actions.set(watchId, run);
    return run;
  }

  function blockedResult(watchId, accountKey, result) {
    if (isWatchId(watchId)) setResult(watchId, accountKey, result);
    notify();
    return Promise.resolve(result);
  }

  /** 권한 답(turnOnDeviceNotifications) → 막히면 PUSH_RESULT, 켜졌으면 null. 기다린 뒤 계정과 쓰기 가능을 다시 본다 */
  async function permissionGate(permission, accountKey) {
    let outcome;
    try {
      outcome = await permission;
    } catch {
      outcome = 'failed';
    }
    if (stale(accountKey)) return staleResult(accountKey);
    if (outcome === 'denied') return PUSH_RESULT.DENIED;
    if (outcome === 'unsupported') return PUSH_RESULT.UNSUPPORTED;
    if (outcome !== 'on') return PUSH_RESULT.FAILED;
    return null;
  }

  async function subscribeFlow(watchId, accountKey) {
    if (stale(accountKey)) return staleResult(accountKey);
    // 줄에서 기다리는 사이 사본이나 기록이 바뀌었을 수 있다
    if (!liveWatchIds().has(watchId)) return PUSH_RESULT.UNAVAILABLE;
    if (readRecord()?.gone?.includes(watchId)) return PUSH_RESULT.GONE;
    const config = await loadConfig();
    if (stale(accountKey)) return staleResult(accountKey);
    if (!config) return configFailure;
    if (!config.enabled) return PUSH_RESULT.OFF;
    const ready = await ensureWorker();
    if (stale(accountKey)) return staleResult(accountKey);
    if (!ready) return PUSH_RESULT.SW_NOT_READY;
    const browser = await chooseSubscription(accountKey, config.vapidPublicKey);
    if (browser.result) return browser.result;
    const result = await postSubscribe(watchId, accountKey, browser, config.vapidPublicKey, currentLang());
    if (result !== PUSH_RESULT.ON) await dropIfUnused(browser);
    return result;
  }

  function startSubscribe(watchId, { ask }) {
    if (actions.has(watchId)) return actions.get(watchId);
    const accountKey = store.getStatus().accountKey;
    const blocked = precheck(watchId, { ask });
    if (blocked) return blockedResult(watchId, accountKey, blocked);
    let gate = null;
    if (ask) {
      // 첫 await 전에 권한 요청을 시작한다(Safari 는 사용자 동작 안에서만 묻는다). 기기 알림 켜짐은 같은 계정이 쓰기 가능할 때만 쓴다
      const guarded = { writePrefs: (patch) => (stale(accountKey) ? { ok: false } : selfWrite(() => store.writePrefs(patch))) };
      gate = permissionGate(turnOnDeviceNotifications({ store: guarded, NotificationImpl }), accountKey);
    }
    return trackAction(watchId, accountKey, () => subscribeFlow(watchId, accountKey), gate);
  }

  /** '앱이 닫혀 있어도 받기' 켜기(권한 요청 포함). 사용자 동작 안에서만 부른다 */
  function turnOn(watchId) {
    return startSubscribe(watchId, { ask: true });
  }

  /** '이 휴대폰에서 다시 받기'(MOVED). 권한은 이미 granted 여야 한다 */
  function takeOver(watchId) {
    return startSubscribe(watchId, { ask: false });
  }

  // ── 끄기 ──────────────────────────────────────────────────────────

  async function offFlow(watchId, accountKey) {
    if (stale(accountKey)) return staleResult(accountKey);
    const sub = subOf(readRecord(), watchId);
    const retired = selfWrite(() => store.retireGuardianPushSub(watchId));
    if (!retired.ok) return retired.code === STORE_ERROR.READ_ONLY ? PUSH_RESULT.READ_ONLY : PUSH_RESULT.FAILED;
    const lastOnDevice = !deviceHasSubs();
    // 대기 상한에 밀려 버려진 해지는 다시 보낼 곳이 없다: 같은 동기 구간에서 한 번 직접 보낸다(해지는 로그인이 필요 없다)
    const direct = sub && !retired.queued ? sendUnsubscribe(sub) : null;
    if (lastOnDevice) await unsubscribeBrowser();
    if (!sub) return PUSH_RESULT.OFF_DONE;
    if (direct) {
      const result = await direct;
      return unsubscribeDone(result) ? PUSH_RESULT.OFF_DONE : PUSH_RESULT.OFF_UNSENT;
    }
    await store.retryPendingServerDelete();
    const pending = store.readPendingServerDelete().some((item) => item.watchId === sub.watchId && item.subId === sub.subId);
    return pending ? PUSH_RESULT.OFF_PENDING : PUSH_RESULT.OFF_DONE;
  }

  /** '앱이 닫혀 있어도 받기' 끄기. 쓰기 가능할 때만(서버 알림 스위치와 무관) */
  function turnOff(watchId) {
    if (actions.has(watchId)) return actions.get(watchId);
    const accountKey = store.getStatus().accountKey;
    if (!isWritable(store.getStatus())) return blockedResult(watchId, accountKey, PUSH_RESULT.READ_ONLY);
    if (!isWatchId(watchId)) return Promise.resolve(PUSH_RESULT.FAILED);
    return trackAction(watchId, accountKey, () => offFlow(watchId, accountKey));
  }

  // ── 다시 켜기 (RENEW_NEEDED) ────────────────────────────────────────

  /** 다시 켜기가 다시 POST 할 구독: 살아 있는 사본에 있고 gone 이 아니고 moved 가 아닌 것(moved 는 다시 받기로만 푼다) */
  function renewTargets(record, live) {
    const moved = movedWatchIdsOf(record);
    const gone = record?.gone ?? [];
    return (record?.subs ?? []).filter((sub) => live.has(sub.watchId) && !gone.includes(sub.watchId) && !moved.has(sub.watchId));
  }

  async function renewFlow(accountKey, watchIds) {
    let posted = false;
    const finishAll = (result) => {
      if (!posted) for (const watchId of watchIds) setResult(watchId, accountKey, result);
      return result;
    };
    if (stale(accountKey)) return finishAll(staleResult(accountKey));
    if (renewTargets(readRecord(), liveWatchIds()).length === 0) return finishAll(PUSH_RESULT.UNAVAILABLE);
    const config = await loadConfig();
    if (stale(accountKey)) return finishAll(staleResult(accountKey));
    if (!config) return finishAll(configFailure);
    if (!config.enabled) return finishAll(PUSH_RESULT.OFF);
    const ready = await ensureWorker();
    if (stale(accountKey)) return finishAll(staleResult(accountKey));
    if (!ready) return finishAll(PUSH_RESULT.SW_NOT_READY);
    const registration = await getRegistration();
    if (stale(accountKey)) return finishAll(staleResult(accountKey));
    const manager = registration?.pushManager;
    if (!manager || typeof manager.subscribe !== 'function') return finishAll(PUSH_RESULT.UNSUPPORTED);
    let existing = null;
    try {
      existing = (await manager.getSubscription()) ?? null;
    } catch {
      existing = null;
    }
    if (stale(accountKey)) return finishAll(staleResult(accountKey));
    // 옛 브라우저 구독을 먼저 지운다: 키가 다른 구독 위에 subscribe 를 부르면 브라우저가 던지고, 옛 주소가 살아 있으면 서버가
    // 같은 기기에 '기기가 바뀌었어요'를 보낸다
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch {
        // 지우지 못하면 아래 subscribe 가 던져 FAILED 가 된다
      }
      if (stale(accountKey)) return finishAll(staleResult(accountKey));
    }
    const browser = await createSubscription(accountKey, manager, config.vapidPublicKey);
    if (browser.result) return finishAll(browser.result);
    const lang = currentLang();
    const live = liveWatchIds();
    const record = readRecord();
    const targets = renewTargets(record, live);
    let overall = PUSH_RESULT.ON;
    for (const { watchId } of targets) {
      const result = await postSubscribe(watchId, accountKey, browser, config.vapidPublicKey, lang);
      if (stale(accountKey)) return finishAll(staleResult(accountKey));
      posted = true;
      setResult(watchId, accountKey, result);
      if (result !== PUSH_RESULT.ON && overall === PUSH_RESULT.ON) overall = result;
    }
    renewNeeded = planReconcile({
      record: readRecord(),
      liveWatchIds: live,
      mainOn: true,
      permission: 'granted',
      browser: { endpointHash: browser.endpointHash, vapidKey: config.vapidPublicKey },
      configKey: config.vapidPublicKey,
      lang,
    }).renewNeeded;
    await dropIfUnused(browser);
    return finishAll(overall);
  }

  /** 다시 켜기 전 동기 확인. 막히면 PUSH_RESULT, 아니면 null */
  function renewPrecheck(status) {
    if (!isWritable(status)) return PUSH_RESULT.READ_ONLY;
    const support = readSupport();
    if (support === PUSH_SUPPORT.DENIED) return PUSH_RESULT.DENIED;
    if (support !== PUSH_SUPPORT.READY) return PUSH_RESULT.UNSUPPORTED;
    if (readPermission() !== 'granted') return PUSH_RESULT.DENIED;
    return null;
  }

  /** '다시 켜기': 옛 브라우저 구독 unsubscribe, 새 subscribe, 이 계정의 모든 구독 다시 POST. 사용자 동작 안에서만 부른다 */
  function renew() {
    if (renewing) return renewing;
    const status = store.getStatus();
    const accountKey = status.accountKey;
    const watchIds = renewTargets(readRecord(), liveWatchIds()).map((sub) => sub.watchId);
    const blocked = renewPrecheck(status);
    if (blocked) {
      // 바로 막혀도 대상마다 결과를 남긴다(blockedResult 와 같다). 화면은 누른 동작의 결과 줄을 lastResult 로 그린다
      for (const watchId of watchIds) setResult(watchId, accountKey, blocked);
      notify();
      return Promise.resolve(blocked);
    }
    renewing = enqueue(async () => {
      try {
        return await renewFlow(accountKey, watchIds);
      } catch {
        return PUSH_RESULT.FAILED;
      }
    }).then((result) => {
      renewing = null;
      notify();
      return result;
    });
    notify();
    return renewing;
  }

  // ── 오늘 함께 있음 (정한 값 16) ─────────────────────────────────────

  async function muteFlow(watchId, accountKey, on) {
    if (stale(accountKey)) return staleResult(accountKey);
    const config = await loadConfig();
    if (stale(accountKey)) return staleResult(accountKey);
    if (!config) return configFailure;
    if (!config.enabled) return PUSH_RESULT.OFF;
    const sub = subOf(readRecord(), watchId);
    if (!sub) return PUSH_RESULT.UNAVAILABLE;
    let request;
    try {
      request = muteRequest({ watchId, subId: sub.subId, on });
    } catch {
      return PUSH_RESULT.FAILED;
    }
    const result = await send(request);
    if (stale(accountKey)) return staleResult(accountKey);
    if (result.ok) {
      const data = readMuteData(result.data);
      if (!data) return PUSH_RESULT.UNAVAILABLE;
      const today = kstClock(now()).date;
      const hasToday = (readRecord()?.status ?? []).some((item) => item.watchId === watchId && item.date === today);
      if (hasToday) selfWrite(() => store.updateGuardianPush((current) => withMuted(current, watchId, today, data.muted)));
      else await statusFlow(watchId, accountKey, { force: true });
      return data.muted ? PUSH_RESULT.MUTE_ON : PUSH_RESULT.MUTE_OFF;
    }
    if (result.kind === WATCH_KIND.NOT_FOUND) {
      // 틀린 subId(다른 기기가 가져감)와 지켜보기 없음이 같은 404 다. 상태를 다시 물어 gone 과 moved 를 가린다
      await statusFlow(watchId, accountKey, { force: true });
      if (stale(accountKey)) return staleResult(accountKey);
      return readRecord()?.gone?.includes(watchId) ? PUSH_RESULT.GONE : PUSH_RESULT.FAILED;
    }
    return failureOf(result, watchId);
  }

  /** '오늘 함께 있음' 켜기·끄기. 구독이 있고 쓰기 가능할 때만 */
  function mute(watchId, on) {
    if (actions.has(watchId)) return actions.get(watchId);
    const accountKey = store.getStatus().accountKey;
    if (!isWritable(store.getStatus())) return blockedResult(watchId, accountKey, PUSH_RESULT.READ_ONLY);
    if (typeof on !== 'boolean' || !isWatchId(watchId)) return Promise.resolve(PUSH_RESULT.FAILED);
    if (!subOf(readRecord(), watchId)) return blockedResult(watchId, accountKey, PUSH_RESULT.UNAVAILABLE);
    return trackAction(watchId, accountKey, () => muteFlow(watchId, accountKey, on));
  }

  // ── 상태 조회 (정한 값 14) ──────────────────────────────────────────

  /**
   * 상태 조회. 쓰기 가능하고 사본에 그 watchId 가 있고 gone 이 아니고 설정이 켜졌을 때만 보낸다. 앞 조회(실패 포함)와 2분 미만이면
   * 건너뛴다(force 면 보낸다). 같은 watchId 를 겹쳐 부르면 같은 약속이고 force 는 기다리는 쪽에 더해진다.
   * @returns {Promise<string|null>} 보내지 않았으면 null, 보냈으면 결과 종류(WATCH_KIND)
   */
  function refreshStatus(watchId, { force = false } = {}) {
    const existing = statusRuns.get(watchId);
    if (existing) {
      if (force) existing.force = true;
      return existing.promise;
    }
    const status = store.getStatus();
    if (!isWritable(status)) return Promise.resolve(null);
    const accountKey = status.accountKey;
    const entry = { force: force === true, promise: null };
    entry.promise = enqueue(async () => {
      try {
        return await statusFlow(watchId, accountKey, entry);
      } catch {
        return null;
      }
    }).finally(() => {
      if (statusRuns.get(watchId) === entry) statusRuns.delete(watchId);
    });
    statusRuns.set(watchId, entry);
    return entry.promise;
  }

  /** 가장 최근 사본(기기 알림이 쓰는 것)과 그 watchId */
  function mostRecentWatch() {
    const copy = readCopies()[0] ?? null;
    const watchId = copy?.snapshot?.watchId;
    return isWatchId(watchId) ? { copy, watchId } : null;
  }

  function refreshMostRecent() {
    const recent = mostRecentWatch();
    if (recent) void refreshStatus(recent.watchId);
  }

  /** 가장 최근 사본의 오늘 남은 마감마다 상태 조회 타이머 하나(가장 이른 것). 남은 것이 없으면 KST 자정 + 1초에 다시 건다 */
  function scheduleStatusTimer() {
    if (!started || !timers) return;
    if (statusTimer !== null) {
      timers.clearTimeout(statusTimer);
      statusTimer = null;
    }
    const recent = mostRecentWatch();
    if (!recent) return;
    const nowMs = now();
    const today = kstClock(nowMs).date;
    const [next] = statusTimes({
      deadlines: todayDeadlinesOf(recent.copy, today),
      date: today,
      nowMs,
      graceMin: DEFAULTS.notifications.serverPushGraceMin,
    });
    const at = next ?? kstInstantMs(addDays(today, 1), '00:00') + 1_000;
    const delay = Math.min(Math.max(at - nowMs, 0), MAX_TIMER_MS);
    statusTimer = timers.setTimeout(() => {
      statusTimer = null;
      if (next !== undefined) {
        const current = mostRecentWatch();
        if (current) void refreshStatus(current.watchId, { force: true });
      }
      scheduleStatusTimer();
    }, delay);
  }

  /** /g 가 보이는 동안 5분마다 상태 조회. 멈추는 함수를 돌려준다 */
  function poll(watchId) {
    if (!timers) return noop;
    let timer = null;
    let stopped = false;
    const arm = () => {
      timer = timers.setTimeout(() => {
        timer = null;
        if (stopped) return;
        if (isVisible()) void refreshStatus(watchId);
        arm();
      }, STATUS_POLL_MS);
    };
    arm();
    return () => {
      stopped = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    };
  }

  // ── 다시 맞추기 (정한 값 8) ─────────────────────────────────────────

  function setRenewNeeded(value) {
    if (renewNeeded === value) return;
    renewNeeded = value;
    notify();
  }

  async function reconcileOnce() {
    const status = store.getStatus();
    if (!isWritable(status)) return;
    const accountKey = status.accountKey;
    const lang = currentLang();
    const mainOn = store.readPrefs().notifications === true;
    const permission = readPermission();
    const live = liveWatchIds();
    const record = readRecord();

    // 끄기는 설정과 브라우저 구독을 몰라도 정한다(서버 알림 스위치와 무관)
    const local = planReconcile({ record, liveWatchIds: live, mainOn, permission, browser: null, configKey: null, lang });
    if (local.retire.length > 0) {
      const lost = mainOn && permission !== 'granted';
      const directs = [];
      for (const watchId of local.retire) {
        const sub = subOf(record, watchId);
        const retired = selfWrite(() => store.retireGuardianPushSub(watchId));
        if (!retired.ok) continue;
        // 바탕 길이 남기는 결과는 PERMISSION_LOST, OFF_UNSENT, GONE 뿐이다(lastResults 설명)
        if (lost) lastResults.set(watchId, PUSH_RESULT.PERMISSION_LOST);
        if (sub && !retired.queued) {
          // 대기 상한에 밀린 해지는 한 번 직접 보낸다. 닿지 않으면 서버 구독이 지켜보기 만료까지 남는다(OFF_UNSENT).
          // 권한을 잃어 끈 것이면 남은 서버 구독이 알림을 띄우지 못하므로 권한 안내를 남긴다
          directs.push(
            sendUnsubscribe(sub).then((result) => {
              if (!lost && !unsubscribeDone(result)) setResult(watchId, accountKey, PUSH_RESULT.OFF_UNSENT);
            }),
          );
        }
      }
      notify();
      if (!deviceHasSubs()) await unsubscribeBrowser();
      if (directs.length > 0) {
        await Promise.all(directs);
        notify();
      }
      if (stale(accountKey)) return;
    }

    const remaining = readRecord();
    if (!remaining || remaining.subs.length === 0 || live.size === 0) {
      setRenewNeeded(false);
      return;
    }
    const config = await loadConfig();
    // 설정을 못 읽으면 기록도 다시 켜기 표시도 바꾸지 않는다
    if (stale(accountKey) || !config) return;
    if (!config.enabled) {
      setRenewNeeded(false);
      return;
    }
    const browser = await readBrowser();
    // 등록이나 구독을 읽지 못하면(앱 첫 실행에 워커 등록 전일 수 있다) 판단하지 않는다
    if (stale(accountKey) || browser === null) return;
    const plan = planReconcile({
      record: readRecord(),
      liveWatchIds: live,
      mainOn: store.readPrefs().notifications === true,
      permission: readPermission(),
      browser: browser.subscription ? { endpointHash: browser.endpointHash, ...(browser.key ? { vapidKey: browser.key } : {}) } : null,
      configKey: config.vapidPublicKey,
      lang,
    });
    setRenewNeeded(plan.renewNeeded);
    // plan.retire 는 위에서 끝났다. 그 사이 바뀐 것은 다음 다시 맞추기가 끈다
    for (const watchId of plan.repost) {
      const tryKey = `${accountKey}|${watchId}`;
      if (repostTried.has(tryKey)) continue;
      repostTried.add(tryKey);
      const result = await postSubscribe(watchId, accountKey, { ...browser, created: false }, config.vapidPublicKey, lang);
      if (stale(accountKey)) return;
      if (result === PUSH_RESULT.GONE) setResult(watchId, accountKey, result);
    }
  }

  /** 다시 맞추기. 쓰기 가능할 때만 돈다. 겹쳐 부르면 같은 약속이고, 도는 중에 불리면 끝난 뒤 한 번 더 돈다(상한 있음) */
  function reconcile() {
    if (reconcileRun) {
      reconcileAgain = true;
      return reconcileRun;
    }
    reconcileAgain = false;
    reconcileRun = enqueue(async () => {
      for (let pass = 0; ; pass += 1) {
        reconcileAgain = false;
        try {
          await reconcileOnce();
        } catch {
          // 다시 맞추기는 던지지 않는다
        }
        if (!reconcileAgain || pass + 1 >= RECONCILE_MAX_PASSES) break;
      }
      reconcileAgain = false;
    }).finally(() => {
      reconcileRun = null;
      if (reconcileAgain) void reconcile();
    });
    return reconcileRun;
  }

  // ── 미리 확인 · 지우기 ──────────────────────────────────────────────

  /** 항목을 그릴 때: 사본에 그 watchId 가 있으면 설정을 읽고, 켜져 있으면 서비스 워커 준비를 미리 확인한다. 던지지 않는다 */
  async function prepare(watchId) {
    try {
      if (!isWatchId(watchId) || !liveWatchIds().has(watchId)) return;
      const config = await loadConfig();
      if (config?.enabled !== true || readSupport() !== PUSH_SUPPORT.READY) return;
      await ensureWorker();
    } catch {
      // 미리 확인은 던지지 않는다
    }
  }

  /**
   * '이 기기에서 내 정보 지우기' 전에 브라우저 구독을 지운다(한도 안에서, 실패해도 던지지 않는다). 서버 해지는 저장소의
   * deleteAllMyData 가 모든 계정의 구독을 대기로 옮겨 보낸다.
   */
  async function forgetBrowser({ timeoutMs = FORGET_TIMEOUT_MS } = {}) {
    const work = (async () => {
      const registration = await getRegistration();
      const subscription = await registration?.pushManager?.getSubscription?.();
      if (subscription) await subscription.unsubscribe();
    })();
    try {
      await withLimit(work, timeoutMs, undefined);
    } catch {
      // 지우기는 계속한다
    }
    lastResults.clear();
    renewNeeded = false;
    notify();
  }

  // ── 시작 · 멈춤 ────────────────────────────────────────────────────

  function onStoreChange(topic) {
    const status = store.getStatus();
    const writable = isWritable(status);
    const switched = status.accountKey !== lastAccount;
    const opened = writable && !lastWritable;
    lastAccount = status.accountKey;
    lastWritable = writable;
    if (switched || opened) {
      lastResults.clear();
      renewNeeded = false;
    }
    notify();
    if (topic === 'guardianCopies' || topic === 'status') scheduleStatusTimer();
    if (selfWriting > 0) return;
    void reconcile();
    if (switched || opened) refreshMostRecent();
  }

  function start() {
    if (started) return;
    started = true;
    const status = store.getStatus();
    lastAccount = status.accountKey;
    lastWritable = isWritable(status);
    for (const topic of WATCH_TOPICS) {
      try {
        detach.push(store.subscribe(topic, () => onStoreChange(topic)));
      } catch {
        // 구독하지 못한 주제는 넘어간다
      }
    }
    const onVisible = () => {
      if (!isVisible()) return;
      void reconcile();
      refreshMostRecent();
    };
    const onOnline = () => {
      void reconcile();
      refreshMostRecent();
    };
    const doc = win?.document;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', onVisible);
      detach.push(() => doc.removeEventListener('visibilitychange', onVisible));
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', onOnline);
      detach.push(() => win.removeEventListener('online', onOnline));
    }
    void reconcile();
    refreshMostRecent();
    scheduleStatusTimer();
  }

  function stop() {
    if (!started) return;
    started = false;
    for (const fn of detach.splice(0)) {
      try {
        fn();
      } catch {
        // 떼기 실패는 넘어간다
      }
    }
    if (statusTimer !== null) timers?.clearTimeout(statusTimer);
    statusTimer = null;
  }

  // ── 화면 상태 ──────────────────────────────────────────────────────

  /** 화면 상태(계획 '공용 모양' 실행기 상태). 바뀐 것이 없으면 같은 얼린 객체다 */
  function getState(watchId) {
    const record = readRecord();
    const sub = subOf(record, watchId);
    const status = record?.status?.find((item) => item.watchId === watchId) ?? null;
    const next = {
      support: readSupport(),
      config: lastConfig,
      swReady,
      sub: sub ? { subId: sub.subId, lang: sub.lang } : null,
      status: status
        ? { date: status.date, confirmed: [...status.confirmed], muted: status.muted, active: status.active, atMs: status.atMs }
        : null,
      gone: Boolean(record?.gone?.includes(watchId)),
      renewNeeded,
      moved: Boolean(sub) && status?.active === false,
      busy: busy.has(watchId) || renewing !== null,
      lastResult: lastResults.get(watchId) ?? null,
    };
    const key = JSON.stringify(next);
    const cached = stateCache.get(watchId);
    if (cached && cached.key === key) return cached.state;
    const state = deepFreeze(next);
    stateCache.set(watchId, { key, state });
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return noop;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    start,
    stop,
    getState,
    subscribe,
    turnOn,
    turnOff,
    renew,
    takeOver,
    mute,
    refreshStatus,
    reconcile,
    prepare,
    poll,
    forgetBrowser,
    idle,
  };
}
