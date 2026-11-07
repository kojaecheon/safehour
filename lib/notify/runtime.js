// 알림 실행기 — 앱이 열려 있는 동안 예약한 시각에 알린다 (AX-319 · spec 4.13)
//
// 서버 없이 동작한다. 앱(또는 설치한 앱)이 열려 있거나 실행 중일 때만 확실하다 —
// 이 한계는 설정 화면이 알린다("앱이 완전히 닫혀 있으면 알림을 받지 못할 수 있습니다", T16a).
//
//   const notifier = createNotifier({ store, deliver });
//   notifier.start();              // 오늘 일정으로 예약을 만들고 저장소 알림 예약에 남긴다
//   notifier.getBanner();          // 앱 안 배너로 보여 줄 항목 (없으면 null)
//   notifier.subscribe(fn);        // 배너가 바뀌면 부른다
//
// - 예약은 저장소의 오늘(KST) 하루 일정(readTodayTomorrow)으로 만든다. 일정·로그인 상태가 바뀌면 다시 만들고,
//   날짜가 바뀌면 새 날짜로 다시 만든다. 저장은 writeNotificationSchedule — 보기 전용이면 저장은 실패해도 알린다.
// - 때가 되면 앱 안 배너를 **항상** 바꾸고, 기기 알림은 주입한 deliver 가 낸다(권한·설정 검사는 deliver 몫).
// - 브라우저가 백그라운드 타이머를 늦추므로 한 번에 최대 1분만 기다린다. 늦게 깨어나 여러 알림이 밀렸으면
//   가장 최근 것 하나만 낸다. 목표 시각(expiresAt)이 지난 알림은 내지 않는다.
// - 같은 알림은 한 번만 낸다(이 실행기 안에서 id 로 기억).
// - 보호자 기기는 가장 최근에 가져온 사본의 오늘(KST) 하루를 예약에 더한다(companionDay).
// - 마감 지남 알림(LATE_NOTIFY_KINDS)은 낸 id 를 저장소(overdueSeen)에 남겨, 앱을 새로 열어도 다시 내지 않는다.
//
// 상대 경로 사용 — Next 밖(node --test)에서도 이 모듈을 그대로 테스트한다.

import { todayKst } from '../store/store.js';
import { LATE_NOTIFY_KINDS, planNotifications } from './schedule.js';

/** 한 번에 기다리는 최대 시간 — 백그라운드 타이머 지연·잠자기 뒤에도 1분 안에 다시 확인한다 */
export const NOTIFIER_MAX_WAIT_MS = 60 * 1000;
const MIN_WAIT_MS = 1000;

/**
 * @param {object} options
 * @param {ReturnType<import('../store/store.js').createStore>} options.store
 * @param {(item: object) => unknown} [options.deliver]  기기 알림. 던지거나 실패해도 배너는 그대로다
 * @param {() => number} [options.now]
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
 * @param {object} [options.leads]  알림 시점 (기본 DEFAULTS.notifications)
 * @param {number} [options.maxWaitMs]
 */
export function createNotifier({
  store,
  deliver = () => {},
  now = () => Date.now(),
  timers = { setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a) },
  leads,
  maxWaitMs = NOTIFIER_MAX_WAIT_MS,
} = {}) {
  let running = false;
  let items = [];
  let builtFor = null;
  let banner = null;
  let timer = null;
  let unsubscribers = [];
  const fired = new Set();
  const listeners = new Set();

  function emit() {
    for (const listener of [...listeners]) listener(banner);
  }

  function setBanner(next) {
    if (banner === next) return;
    banner = next;
    emit();
  }

  function todayPlan(nowMs) {
    const today = store.readTodayTomorrow?.().today;
    return today?.date === todayKst(nowMs) ? today.plan : null;
  }

  /** 가장 최근 보호자 사본에서 오늘(KST) 하루의 날짜와 복귀 마감 시각만 뽑는다. 없으면 null */
  function companionDayFor(date) {
    const days = store.readGuardianCopies?.()[0]?.snapshot?.days;
    const found = Array.isArray(days) ? days.find((d) => d?.date === date) : null;
    if (!found || !Array.isArray(found.patientReturn)) return null;
    return { date: found.date, patientReturn: found.patientReturn.map((r) => ({ by: r?.by ?? null })) };
  }

  function persist(next) {
    const saved = store.readNotificationSchedule?.() ?? [];
    if (JSON.stringify(saved) === JSON.stringify(next)) return;
    // 보기 전용이면 READ_ONLY 로 거절된다 — 알림은 메모리 예약으로 계속한다
    store.writeNotificationSchedule?.(next);
  }

  function rebuild() {
    const nowMs = now();
    builtFor = todayKst(nowMs);
    const seen = new Set(store.readOverdueSeen?.(builtFor)?.notified ?? []);
    const options = { nowMs, companionDay: companionDayFor(builtFor) };
    if (leads) options.leads = leads;
    items = planNotifications(todayPlan(nowMs), options).filter(
      (i) => !fired.has(i.id) && !(LATE_NOTIFY_KINDS.includes(i.kind) && seen.has(i.id)),
    );
    persist(items);
  }

  /** 때가 된 알림을 낸다 — 밀렸으면 가장 최근 것 하나만, 목표 시각이 지났으면 내지 않는다 */
  function fireDue() {
    const nowMs = now();
    const due = items.filter((i) => Date.parse(i.at) <= nowMs);
    if (due.length === 0) return;
    for (const item of due) fired.add(item.id);
    items = items.filter((i) => !fired.has(i.id));
    const live = due.filter((i) => nowMs < Date.parse(i.expiresAt));
    const latest = live.at(-1);
    if (!latest) return;
    // 기억 쓰기가 실패해도 fired 가 같은 실행 안의 두 번째 알림을 막는다
    if (LATE_NOTIFY_KINDS.includes(latest.kind)) store.markOverdueNotified?.(todayKst(nowMs), latest.id);
    setBanner(latest);
    try {
      const result = deliver(latest);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // 권한 없음·지원 안 함 — 앱 안 배너는 이미 바뀌었다
    }
  }

  function expireBanner() {
    if (banner && now() >= Date.parse(banner.expiresAt)) setBanner(null);
  }

  function arm() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (!running) return;
    const nowMs = now();
    const waits = [maxWaitMs];
    if (items.length > 0) waits.push(Date.parse(items[0].at) - nowMs);
    if (banner) waits.push(Date.parse(banner.expiresAt) - nowMs);
    const delay = Math.max(MIN_WAIT_MS, Math.min(...waits));
    timer = timers.setTimeout(() => {
      timer = null;
      tick();
    }, delay);
  }

  /** 때가 된 알림을 내고, 날짜가 바뀌었으면 다시 만든다 */
  function tick() {
    fireDue();
    if (builtFor !== todayKst(now())) rebuild();
    expireBanner();
    arm();
  }

  /** 밀린 알림을 먼저 낸 뒤 예약을 다시 만든다 (일정 변경·화면 복귀) */
  function refresh() {
    fireDue();
    rebuild();
    fireDue(); // 다시 만든 예약에 이미 시각이 지난 마감 지남 알림이 있으면 지금 낸다
    expireBanner();
    arm();
  }

  function start() {
    if (running) return;
    running = true;
    unsubscribers = ['tripPlan', 'guardianCopies', 'status'].map((topic) =>
      store.subscribe(topic, () => {
        if (running) refresh();
      }),
    );
    refresh();
  }

  function stop() {
    running = false;
    for (const off of unsubscribers) off();
    unsubscribers = [];
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }

  return Object.freeze({
    start,
    stop,
    refresh,
    tick,
    /** 아직 내지 않은 예약 (시각 순) */
    getItems: () => items,
    /** 앱 안 배너로 보여 줄 항목 — 바뀌지 않았으면 같은 객체 */
    getBanner: () => banner,
    dismiss: () => setBanner(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
