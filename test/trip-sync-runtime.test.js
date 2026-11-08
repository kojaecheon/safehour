// AX-316 — 일정 동기화 실행기 (spec 4.1·4.6·4.9·4.10·4.11·4.19·4.20, 규칙 13·32·49·51·55)
//
// 가짜 서버(실제 일정 API 처리기 + 가짜 관광·기상 데이터)와 메모리 저장소로 실행기를 검증한다. 실제 네트워크 호출 0건.
//   - 처음 생성·저장소 변경 → 영향 날짜만 재계획(previous·edits·usedContentIds)
//   - 앱 열기 순서: 자동 삭제 → 연동 지침 재확인 → 재계획(연동 영향 날짜 + 오늘~모레 기상) → 매일 확인 신호
//   - 외출 중 지침 철회·만료 → 즉시 복귀
//   - 매일 확인 전이, 오늘 게이트 덧씌우기가 저장값을 바꾸지 않음
//   - 교체 요청 모양, 삭제·다시 만들기, 데모 사건 전체 재전송, 언어 변경은 표시만
//   - 동의 철회 오프라인 대비, 실패 시 일정 유지, 보기 전용은 호출·쓰기 0건, 보호자 켬 안내
//   - 복귀 마감이 지난 외출의 시트 신호(overdueReturn): 저장 일정은 그대로, 외출마다 한 번, 즉시 복귀가 우선

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeShareFingerprint } from '../components/guardian/share.js';
import { acknowledgeAllMap, applyLinkedPlan } from '../components/conditions/linkPlan.js';
import { createTripApi, createTripSync } from '../lib/trip/index.js';
import { demoPlanStandard } from '../src/recovery/fixtures.js';
import {
  SET,
  contentIdsOf,
  createClock,
  createFakeServer,
  kst,
  period,
  signedInStore,
  spyStore,
  stay,
  stopsOf,
  toMin,
} from './trip-sync-fixtures.js';

const DATES = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 본인 체크 기간 P1(모든 항목 '아니오')이 10-04~10-10 을 덮는 체류 */
function selfStay(overrides = {}) {
  return stay({ periods: [period({}, { startDate: '2026-10-04', endDate: '2026-10-10' })], ...overrides });
}

/** DEMO-A 지침을 H1 에 연결한 체류 (지침 날짜는 now 기준) */
function linkedStay(nowMs, { plan = demoPlanStandard(nowMs), base = stay(), acknowledgeAll = false } = {}) {
  const merged = applyLinkedPlan(base, { code: 'DEMO-A', plan, hospital: { kind: 'EXISTING', id: 'H1' }, fetchedAt: new Date(nowMs).toISOString() }).stay;
  if (acknowledgeAll) merged.linkedPlans = merged.linkedPlans.map((lp) => ({ ...lp, acknowledged: acknowledgeAllMap(lp.plan) }));
  return { stay: merged, plan };
}

/** 가짜 타이머, advanceTo(ms) 가 그때까지 걸린 타이머를 시각 순서로 실행한다 */
function fakeTimers(clock) {
  let seq = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) {
      seq += 1;
      queue.set(seq, { fn, at: clock.now() + ms });
      return seq;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    advanceTo(target) {
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        queue.delete(due[0]);
        clock.set(Math.max(clock.now(), due[1].at));
        due[1].fn();
      }
      clock.set(target);
    },
    pending: () => [...queue.values()].map((t) => t.at),
  };
}

async function setup({ at = kst('2026-10-02', '08:00'), stayValue = null, lang = 'en', withTimers = false } = {}) {
  const clock = createClock(at);
  const timers = withTimers ? fakeTimers(clock) : null;
  const store = signedInStore(clock);
  const server = createFakeServer({ clock });
  const log = [];
  const api = createTripApi({
    fetchImpl: (url, init) => {
      log.push(`fetch ${url}`);
      return server.fetchImpl(url, init);
    },
  });
  const sync = createTripSync({ store: spyStore(store, log), api, now: clock.now, getLang: () => store.readLang() ?? lang, timers });
  sync.start();
  if (stayValue) {
    assert.equal(store.writeStay(stayValue).ok, true);
    await sync.idle();
  }
  const reset = () => {
    server.calls.length = 0;
    log.length = 0;
  };
  return { clock, store, server, sync, log, reset, timers, api, lastPlan: () => server.planCalls.at(-1)?.body };
}

// ── 처음 생성 (spec 4.9 생성) ─────────────────────────────────────────

describe('처음 생성 — 체류 설정이 끝나면 전체 일정을 한 번 만든다', () => {
  test('일정이 없으면 체류 전체를 한 번 요청하고 확정 일정으로 저장한다', async () => {
    const { server, store, sync } = await setup({ stayValue: selfStay() });
    assert.equal(server.planCalls.length, 1);
    const body = server.planCalls[0].body;
    assert.equal('dates' in body, false);
    assert.equal('previous' in body, false);
    assert.equal(body.lang, 'en');
    assert.deepEqual(body.stay.consent, { sensitive: true });
    assert.equal(server.planCalls[0].raw.includes('테스트 숙소'), false, '숙소 이름을 보냈다');
    assert.equal(server.planCalls[0].raw.includes('테스트로'), false, '주소를 보냈다');
    const plan = store.readTripPlan();
    assert.deepEqual(Object.keys(plan.days), DATES);
    assert.deepEqual(plan.edits, {});
    assert.equal(plan.lang, 'en');
    assert.equal(plan.engineVersion, '2.0.0');
    assert.equal(sync.getState().updateFailed, false);
    assert.ok(sync.getState().lastSyncAt);

    // 판정과 무관한 값만 바뀐 저장(이름)은 재계획하지 않는다
    store.updateStay((s) => ({ ...s, lodgings: s.lodgings.map((l) => ({ ...l, name: '새 이름' })) }));
    await sync.idle();
    assert.equal(server.planCalls.length, 1);
  });

  test('검증을 통과하지 못한 체류(수술·시술 일정 없음)로는 만들지 않는다', async () => {
    const { server, store } = await setup({ stayValue: stay({ appointments: [] }) });
    assert.equal(server.planCalls.length, 0);
    assert.equal(store.readTripPlan(), null);
  });
});

// ── 저장소 변경 → 영향 날짜만 (spec 4.9 변화 원천 1·2) ─────────────────────

describe('저장소 변경을 구독해 영향 날짜만 재계획한다', () => {
  test('병원 일정 추가 → 그 날짜만, previous·편집 기록·다른 날짜의 배치를 함께 보낸다', async () => {
    const { store, sync, reset, server, lastPlan } = await setup({ stayValue: selfStay() });
    const before = store.readTripPlan();
    reset();
    store.updateStay((s) => ({ ...s, appointments: [...s.appointments, { id: 'A-V', hospitalId: 'H1', type: 'VISIT', date: '2026-10-07', start: '14:00', source: 'USER' }] }));
    await sync.idle();
    assert.equal(server.planCalls.length, 1);
    const body = lastPlan();
    assert.deepEqual(body.dates, ['2026-10-07']);
    assert.deepEqual(Object.keys(body.previous), ['2026-10-07']);
    assert.deepEqual(body.previous['2026-10-07'], before.days['2026-10-07']);
    assert.deepEqual(body.edits, {});
    const others = DATES.filter((d) => d !== '2026-10-07').flatMap((d) => contentIdsOf(before.days[d]));
    assert.deepEqual([...body.usedContentIds].sort(), [...new Set(others)].sort());
    assert.equal('events' in body, false, '오늘이 아니면 사건을 싣지 않는다');

    const after = store.readTripPlan();
    assert.ok(after.days['2026-10-07'].blocks.some((b) => b.appointmentId === 'A-V'));
    for (const d of DATES.filter((x) => x !== '2026-10-07')) assert.deepEqual(after.days[d], before.days[d], `${d} 가 바뀌었다`);
  });

  test('출국일을 당기면 빠진 날짜를 일정·편집 기록에서 지우고 새 출국일을 다시 판정한다', async () => {
    const { store, sync, reset, lastPlan } = await setup({ stayValue: selfStay() });
    const stopId = stopsOf(store.readTripPlan().days['2026-10-10'])[0].id;
    assert.equal((await sync.deleteStop('2026-10-10', stopId)).ok, true);
    reset();
    store.updateStay((s) => ({ ...s, departure: { ...s.departure, date: '2026-10-09' }, lodgings: s.lodgings.map((l) => ({ ...l, checkOut: '2026-10-09' })) }));
    await sync.idle();
    const plan = store.readTripPlan();
    assert.equal('2026-10-10' in plan.days, false);
    assert.equal('2026-10-10' in plan.edits, false);
    assert.deepEqual(lastPlan().dates, ['2026-10-09']);
  });
});

// ── 앱 열기 순서 (spec 4.1, 4.6, 4.9 변화 원천 4·5, 4.20) ──────────────────

describe('앱 열기 — 자동 삭제 → 연동 지침 재확인 → 재계획 → 매일 확인 신호', () => {
  test('순서대로 하고, 버전이 바뀐 지침은 사본·기간을 갱신(같은 안내문 확인은 유지)하고 영향 날짜 + 오늘~모레를 한 번에 재계획한다', async () => {
    const at = kst('2026-10-05', '08:00');
    const { stay: linked, plan } = linkedStay(at, { base: selfStay(), acknowledgeAll: true });
    const { store, sync, reset, server, log, lastPlan } = await setup({ at, stayValue: linked });
    const [p1, p2] = plan.periods;
    const next = {
      ...plan,
      version: plan.version + 1,
      periods: [p1, { ...p2, items: { ...p2.items, walkLimit: SET(10) } }],
      instructions: plan.instructions.map((i) => (i.id === 'act-1' ? { ...i, updatedAt: '2026-10-05T07:00:00.000Z' } : i)),
    };
    server.links.set('DEMO-A', next);
    reset();

    const result = await sync.appOpen();
    await sync.idle();
    assert.equal(result.ok, true);
    const order = (entry) => log.indexOf(entry);
    assert.equal(log[0], 'store.onAppOpen', '자동 삭제가 먼저다');
    assert.ok(order('fetch /api/plan/link') > 0);
    assert.ok(order('store.updateStay') > order('fetch /api/plan/link'));
    assert.ok(order('fetch /api/itinerary/plan') > order('store.updateStay'));
    assert.equal(server.planCalls.length, 1, '연동 영향 날짜와 기상 날짜를 한 번에');
    assert.deepEqual(lastPlan().dates, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
    assert.equal(server.linkCalls[0].body.code, 'DEMO-A');

    const saved = store.readStay();
    assert.equal(saved.linkedPlans[0].plan.version, plan.version + 1);
    const acks = Object.keys(saved.linkedPlans[0].acknowledged);
    assert.equal(acks.some((k) => k.startsWith('act-1@')), false, '내용이 바뀐 안내문의 확인은 풀린다');
    assert.equal(acks.length, plan.instructions.length - 1);
    const hp2 = saved.periods.find((p) => p.id === 'DEMO-PLAN-A:P2');
    assert.deepEqual(hp2.items.walkLimit, SET(10));
    assert.equal(sync.getState().dailyCheckPending, true);
    assert.equal(sync.getState().unconfirmedHospitalUpdate, true, 'act-1 은 중요 안내라 다시 확인해야 한다');
    assert.ok(sync.todayView().day.reasons.includes('PLAN_UNCONFIRMED_UPDATE'));
  });

  test('바뀐 것이 없으면 체류를 쓰지 않고 오늘~모레만 다시 판정한다(기상)', async () => {
    const at = kst('2026-10-02', '08:00');
    const { stay: linked, plan } = linkedStay(at);
    const { sync, reset, server, log, lastPlan } = await setup({ at, stayValue: linked });
    server.links.set('DEMO-A', plan);
    reset();
    await sync.appOpen();
    assert.equal(log.includes('store.updateStay'), false);
    assert.deepEqual(lastPlan().dates, ['2026-10-02', '2026-10-03', '2026-10-04']);
    assert.deepEqual(lastPlan().events, [], '오늘을 재계획하면 사건 목록(빈 것 포함)을 싣는다');
    assert.equal(server.forecast.calls.length > 0, true, '서버가 예보를 반영한다');
  });

  test('실행기가 꺼져 있던 동안 바뀐 조건·병원 일정은 앱을 열 때 저장 일정과 비교해 다시 판정한다(새로고침)', async () => {
    const { store, sync, server, lastPlan } = await setup({ stayValue: selfStay() });
    sync.stop(); // 다른 화면에서 저장했고, 구독하는 실행기가 없었다
    store.writePeriods([...store.readPeriods(), period({ walkLimit: SET(30) }, { id: 'P2', startDate: '2026-10-08', endDate: '2026-10-09' })]);
    store.updateStay((s) => ({ ...s, appointments: [...s.appointments, { id: 'A-V', hospitalId: 'H1', type: 'VISIT', date: '2026-10-06', start: '14:00', source: 'USER' }] }));
    const calls = server.planCalls.length;
    const reopened = createTripSync({ store, api: createTripApi({ fetchImpl: server.fetchImpl }), now: () => kst('2026-10-02', '08:00'), getLang: () => 'en' });
    reopened.start();
    await reopened.appOpen();
    assert.equal(server.planCalls.length, calls + 1);
    // 오늘~모레(기상) + 조건이 바뀐 10-08·10-09 + 병원 일정이 생긴 10-06
    assert.deepEqual(lastPlan().dates, ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-08', '2026-10-09']);

    // 한 번 맞춘 뒤에는 오늘~모레만
    await reopened.appOpen();
    assert.deepEqual(lastPlan().dates, ['2026-10-02', '2026-10-03', '2026-10-04']);
  });

  test('출국 7일이 지난 뒤 열면 자동 삭제가 먼저 일어나고 API 를 부르지 않는다', async () => {
    const { store, sync, reset, server, clock } = await setup({ stayValue: selfStay() });
    reset();
    clock.set(kst('2026-10-17', '09:00'));
    const result = await sync.appOpen();
    assert.equal(result.autoDeleted, true);
    assert.equal(store.readStay(), null);
    assert.equal(store.readTripPlan(), null);
    assert.equal(server.calls.length, 0);
  });

  test('연동 지침을 다시 받지 못하면 사본·일정을 그대로 두고 업데이트 실패를 알린다', async () => {
    const at = kst('2026-10-02', '08:00');
    const { stay: linked } = linkedStay(at);
    const { store, sync, reset } = await setup({ at, stayValue: linked });
    const before = store.readStay();
    reset();
    await sync.appOpen(); // 가짜 서버에 코드가 없다 → 404
    assert.equal(sync.getState().updateFailed, true);
    assert.deepEqual(store.readStay().linkedPlans, before.linkedPlans);
  });
});

// ── 즉시 복귀 (spec 4.9, 규칙 13) ───────────────────────────────────────

describe('외출 중 지침 철회·만료 → 즉시 복귀', () => {
  async function onOuting(nextPlan) {
    const at = kst('2026-10-05', '08:00');
    const { stay: linked, plan } = linkedStay(at);
    const ctx = await setup({ at, stayValue: linked });
    const today = ctx.store.readTripPlan().days['2026-10-05'];
    assert.ok(today.outings.length > 0, 'fixture: 오늘 환자 외출이 있어야 한다');
    const depart = toMin(today.outings[0].departAt);
    ctx.clock.set(kst('2026-10-05', hhmm(depart + 3)));
    ctx.server.links.set('DEMO-A', nextPlan(plan));
    ctx.reset();
    await ctx.sync.appOpen();
    await ctx.sync.idle();
    return { ...ctx, nowMin: depart + 3 };
  }

  test('철회: 오늘 남은 정거장을 비우고 returnNow, 즉시 복귀 신호(PLAN_REVOKED)', async () => {
    const { store, sync, nowMin } = await onOuting((plan) => ({ ...plan, version: plan.version + 1, revoked: true }));
    const today = store.readTripPlan().days['2026-10-05'];
    assert.equal(today.returnNow, true);
    assert.ok(today.reasons.includes('PLAN_REVOKED'));
    assert.ok(stopsOf(today).every((s) => toMin(s.arriveAt) <= nowMin), '시작하지 않은 정거장이 남았다');
    assert.deepEqual(sync.getState().immediateReturn, { date: '2026-10-05', cause: 'PLAN_REVOKED' });
    assert.equal(store.readStay().periods.every((p) => p.source !== 'HOSPITAL' || p.revoked === true), true);

    sync.dismissImmediateReturn(); // 뒤로가기는 시트만 닫는다
    assert.equal(sync.getState().immediateReturn, null);
    assert.equal(store.readTripPlan().days['2026-10-05'].returnNow, true);
  });

  test('재계획 요청이 실패해도 즉시 복귀는 기기에서 먼저 반영된다', async () => {
    const at = kst('2026-10-05', '08:00');
    const { stay: linked, plan } = linkedStay(at);
    const { store, sync, server, clock } = await setup({ at, stayValue: linked });
    const depart = toMin(store.readTripPlan().days['2026-10-05'].outings[0].departAt);
    clock.set(kst('2026-10-05', hhmm(depart + 3)));
    server.links.set('DEMO-A', { ...plan, version: plan.version + 1, revoked: true });
    server.failPlan = 5;
    await sync.appOpen();
    await sync.idle();
    const today = store.readTripPlan().days['2026-10-05'];
    assert.equal(today.returnNow, true);
    assert.ok(today.reasons.includes('PLAN_REVOKED'));
    assert.ok(stopsOf(today).every((s) => toMin(s.arriveAt) <= depart + 3));
    assert.deepEqual(sync.getState().immediateReturn, { date: '2026-10-05', cause: 'PLAN_REVOKED' });
    assert.equal(sync.getState().updateFailed, true);
  });

  test('만료: PLAN_EXPIRED', async () => {
    const { store, sync } = await onOuting((plan) => ({ ...plan, version: plan.version + 1, expiresAt: new Date(kst('2026-10-05', '09:00')).toISOString() }));
    assert.equal(store.readTripPlan().days['2026-10-05'].returnNow, true);
    assert.equal(sync.getState().immediateReturn?.cause, 'PLAN_EXPIRED');
  });

  test('외출 전에 철회되면 즉시 복귀가 아니라 재계획만 한다', async () => {
    const at = kst('2026-10-05', '08:00');
    const { stay: linked, plan } = linkedStay(at);
    const { store, sync, server, reset } = await setup({ at, stayValue: linked });
    server.links.set('DEMO-A', { ...plan, version: plan.version + 1, revoked: true });
    reset();
    await sync.appOpen();
    await sync.idle();
    const today = store.readTripPlan().days['2026-10-05'];
    assert.equal(today.returnNow, false);
    assert.equal(sync.getState().immediateReturn, null);
    assert.equal(today.coverage, 'NEEDS_INPUT');
    assert.ok(today.reasons.includes('PLAN_REVOKED'));
  });
});

// ── 복귀 마감 지남 시트 신호 (마감 지남 설계서 4.2 경우 1) ─────────────────

describe('복귀 마감 지남: overdueReturn 신호(표시만)', () => {
  const TODAY = '2026-10-03';

  async function beforeDeadline() {
    const ctx = await setup({ at: kst(TODAY, '08:00'), stayValue: selfStay(), withTimers: true });
    // 기본 세션(12시간)이 마감 전에 끝나 보기 전용이 되지 않게 늘린다
    ctx.store.setSession({ authenticated: true, accountKey: ctx.store.getStatus().accountKey, expiresAt: new Date(kst(TODAY, '23:59')).toISOString() });
    const day = ctx.store.readTripPlan().days[TODAY];
    assert.ok(day.outings[0], 'fixture: 오늘 환자 외출이 있어야 한다');
    const sameDeadline = day.outings.filter((o) => o.returnBy === day.outings[0].returnBy).map((o) => o.id);
    assert.ok(sameDeadline.length >= 2, 'fixture: 마감이 같은 외출이 둘 이상이어야 한다(동순위 정렬 확인)');
    // 마감이 같으면 나중에 출발한 외출이 시트에 뜬다
    const outing = day.outings.find((o) => o.id === sameDeadline.at(-1));
    assert.notEqual(outing.id, day.outings[0].id);
    assert.equal(ctx.store.getStatus().readOnly, false);
    const deadline = kst(TODAY, outing.returnBy);
    ctx.timers.advanceTo(deadline - 60_000);
    assert.equal(ctx.sync.getState().overdueReturn, null, '마감 전에는 꺼져 있다');
    return { ...ctx, outing, deadline, sameDeadline };
  }

  test('마감이 지나면 overdueReturn 신호가 켜지고 저장 일정은 그대로다', async () => {
    const { sync, store, timers, outing, deadline } = await beforeDeadline();
    const stored = store.readTripPlan();
    timers.advanceTo(deadline + 1000);
    assert.deepEqual(sync.getState().overdueReturn, { date: TODAY, outingId: outing.id, returnBy: outing.returnBy });
    assert.equal(store.readTripPlan(), stored, '저장 일정 객체가 바뀌었다');
    assert.equal(store.readTripPlan().days[TODAY].returnNow, false);
    assert.equal(sync.getState().immediateReturn, null);

    // 60분이 지나면 꺼진다
    timers.advanceTo(deadline + 60 * 60_000);
    assert.equal(sync.getState().overdueReturn, null);
    sync.stop();
    assert.deepEqual(timers.pending(), [], 'stop() 이 타이머를 모두 지우지 않았다');
  });

  test('닫으면 기기에 기억하고 다시 시작해도 켜지지 않는다', async () => {
    const { sync, store, timers, outing, deadline, api, clock, sameDeadline } = await beforeDeadline();
    timers.advanceTo(deadline + 1000);
    assert.equal(sync.getState().overdueReturn?.outingId, outing.id);
    sync.dismissOverdueReturn();
    assert.equal(sync.getState().overdueReturn, null, '같은 마감의 다른 외출로 시트가 다시 떴다');
    // 닫은 기억은 외출 id 와 마감 시각을 함께 적는다(전체 재계획이 id 를 다시 매겨도 다른 외출을 막지 않게)
    assert.ok(store.readOverdueSeen(TODAY).dismissed.includes(`${outing.id}@${outing.returnBy}`));
    // 같은 마감(fixture 는 활동 종료 21:00)의 외출은 함께 닫는다
    assert.deepEqual([...store.readOverdueSeen(TODAY).dismissed].sort(), sameDeadline.map((id) => `${id}@${outing.returnBy}`).sort());
    timers.advanceTo(deadline + 5 * 60_000);
    assert.equal(sync.getState().overdueReturn, null);
    sync.stop();

    // 새로 고침, 같은 저장소로 새 실행기
    const again = createTripSync({ store, api, now: clock.now, timers });
    again.start();
    assert.equal(again.getState().overdueReturn, null);
    again.stop();
  });

  test('같은 외출 id 라도 마감 시각이 다른 기억(또는 예전 형식의 id 만 적은 기억)으로는 막지 않는다', async () => {
    const { sync, store, timers, outing, deadline, api, clock } = await beforeDeadline();
    // 재계획 전 같은 id 의 다른 마감 외출을 닫았던 기억, 그리고 예전 형식 기억
    assert.equal(store.markOverdueDismissed(TODAY, `${outing.id}@00:01`).ok, true);
    assert.equal(store.markOverdueDismissed(TODAY, outing.id).ok, true);
    timers.advanceTo(deadline + 1000);
    assert.equal(sync.getState().overdueReturn?.outingId, outing.id, '다른 마감의 기억이 시트를 막았다');
    sync.stop();
    // 다시 시작해도 같다
    const again = createTripSync({ store, api, now: clock.now, timers });
    again.start();
    assert.equal(again.getState().overdueReturn?.outingId, outing.id);
    again.dismissOverdueReturn();
    assert.equal(again.getState().overdueReturn, null);
    again.stop();
    // 같은 id + 같은 마감으로 닫은 기억은 다시 시작해도 유지된다
    const third = createTripSync({ store, api, now: clock.now, timers });
    third.start();
    assert.equal(third.getState().overdueReturn, null);
    third.stop();
  });

  test('기억 쓰기가 실패해도 같은 실행 안에서는 다시 켜지지 않는다', async () => {
    const { sync, store, timers, outing, deadline } = await beforeDeadline();
    timers.advanceTo(deadline + 1000);
    assert.ok(sync.getState().overdueReturn);
    store.setOnline(false); // 보기 전용
    await sync.idle();
    assert.equal(store.getStatus().readOnly, true);
    assert.equal(store.markOverdueDismissed(TODAY, outing.id).ok, false);
    assert.equal(sync.getState().overdueReturn?.outingId, outing.id, '보기 전용이어도 신호는 켜져 있다');
    sync.dismissOverdueReturn();
    assert.equal(sync.getState().overdueReturn, null);
    assert.deepEqual([...store.readOverdueSeen(TODAY).dismissed], []);
    timers.advanceTo(deadline + 10 * 60_000);
    assert.equal(sync.getState().overdueReturn, null, '같은 실행 안에서 다시 켜졌다');
    sync.stop();
  });

  test('즉시 복귀 중이면 overdueReturn 은 null', async () => {
    const { sync, store, timers, deadline } = await beforeDeadline();
    const plan = store.readTripPlan();
    const day = plan.days[TODAY];
    const written = store.writeTripPlan({ ...plan, days: { ...plan.days, [TODAY]: { ...day, returnNow: true, reasons: [...day.reasons, 'PATIENT_RECALLED'] } } });
    assert.deepEqual(written, { ok: true });
    timers.advanceTo(deadline + 1000);
    assert.equal(sync.getState().overdueReturn, null);
    assert.deepEqual(sync.getState().immediateReturn, { date: TODAY, cause: 'PATIENT_RECALLED' });
    sync.stop();
  });
});

// ── 매일 확인 (spec 4.6, 규칙 32·49) ────────────────────────────────────

describe('매일 확인', () => {
  const at = kst('2026-10-05', '08:00');

  test('확인 전에는 표시만 STANDBY + DAILY_CHECK_PENDING(저장값 그대로), 편집 불가. 그대로예요 → 덧씌우기만 사라진다', async () => {
    const { store, sync, server, reset } = await setup({ at, stayValue: selfStay() });
    await sync.appOpen();
    reset();
    const storedBefore = JSON.stringify(store.readTripPlan());
    assert.equal(sync.getState().dailyCheckPending, true);
    const view = sync.todayView();
    assert.equal(view.day.dayState, 'STANDBY');
    assert.equal(view.day.reasons[0], 'DAILY_CHECK_PENDING');
    assert.equal(view.day.todayGate.actionsDisabled, true);
    assert.equal(view.stored.dayState, 'TOGETHER');
    assert.equal(JSON.stringify(store.readTripPlan()), storedBefore, '덧씌우기가 저장값을 바꿨다');

    const stopId = stopsOf(view.stored)[0].id;
    assert.deepEqual(await sync.deleteStop('2026-10-05', stopId), { ok: false, code: 'DAILY_CHECK_PENDING' });

    assert.equal(sync.confirmDailyCheck().ok, true);
    assert.equal(sync.getState().dailyCheckPending, false);
    const after = sync.todayView();
    assert.equal(after.day, after.stored, '확인 뒤에는 저장된 하루 그대로');
    assert.equal(JSON.stringify(store.readTripPlan()), storedBefore);
    await sync.idle();
    assert.equal(server.calls.length, 0, '그대로예요는 재계획하지 않는다');
  });

  test('바뀌었어요 → 조건 저장 → 오늘과 고친 기간의 날짜를 재계획한 뒤 확인 완료', async () => {
    const { store, sync, reset, lastPlan } = await setup({ at, stayValue: selfStay() });
    reset();
    assert.equal(sync.dailyCheckChanged().ok, true);
    const periods = [...store.readPeriods(), period({ walkLimit: SET(30) }, { id: 'P2', startDate: '2026-10-08', endDate: '2026-10-09' })];
    assert.equal(store.writePeriods(periods).ok, true);
    await sync.idle();
    assert.deepEqual(lastPlan().dates, ['2026-10-05', '2026-10-08', '2026-10-09']);
    assert.equal(store.readPrefs().dailyCheck['2026-10-05'], 'CONFIRMED');
    assert.equal(sync.getState().dailyCheckPending, false);
  });

  test('바뀌었어요 뒤 재계획이 실패하면 확인 완료로 바꾸지 않는다', async () => {
    const { store, sync, server } = await setup({ at, stayValue: selfStay() });
    sync.dailyCheckChanged();
    server.failPlan = 1;
    store.writePeriods([...store.readPeriods(), period({ walkLimit: SET(30) }, { id: 'P2', startDate: '2026-10-08', endDate: '2026-10-09' })]);
    await sync.idle();
    assert.equal(store.readPrefs().dailyCheck['2026-10-05'], undefined);
    assert.equal(sync.getState().dailyCheckPending, true);
    assert.equal(sync.getState().updateFailed, true);
  });
});

// ── 편집 (spec 4.10) ────────────────────────────────────────────────────

describe('편집 — 교체·삭제·식사 칸 비움·다시 만들기', () => {
  test('교체: 후보 조회 → 교체 요청은 edits {pinned:[새], deleted:[옛]} + 교체 전 하루(previous). 새 장소는 고정, 변경됨 없음', async () => {
    const { store, sync, reset, server, lastPlan } = await setup({ stayValue: selfStay() });
    const date = '2026-10-03';
    const before = store.readTripPlan().days[date];
    const outing = before.outings[0];
    const target = outing.stops.find((s) => !s.isMeal) ?? outing.stops[0];
    reset();

    const alts = await sync.alternatives(date, outing.id, target.id);
    assert.equal(alts.ok, true);
    assert.ok(alts.alternatives.length >= 1 && alts.alternatives.length <= 5);
    const altBody = server.calls.find((c) => c.path === '/api/itinerary/alternatives').body;
    assert.equal(altBody.date, date);
    assert.equal(altBody.stopId, target.id);
    assert.equal(altBody.stay.lodgings[0].name, undefined);

    const pick = alts.alternatives[0];
    const result = await sync.applySwap(date, target.id, pick);
    assert.equal(result.ok, true);
    const body = lastPlan();
    assert.deepEqual(body.dates, [date]);
    assert.deepEqual(body.previous[date], before, 'previous 는 교체 전 하루');
    assert.deepEqual(body.edits[date], { pinned: [String(pick.stop.contentId)], deleted: [String(target.contentId)], clearedMeals: [] });
    assert.equal(body.usedContentIds.includes(String(target.contentId)), false);

    const saved = store.readTripPlan();
    assert.deepEqual(saved.edits[date], body.edits[date]);
    const placed = stopsOf(saved.days[date]).find((s) => String(s.contentId) === String(pick.stop.contentId));
    assert.ok(placed, '고른 장소가 들어가야 한다');
    assert.equal(placed.pinned, true);
    assert.equal(contentIdsOf(saved.days[date]).includes(String(target.contentId)), false);
    assert.notEqual(saved.days[date].delta?.hasVisibleChange, true, '사용자 편집만으로 변경됨을 만들지 않는다');
  });

  test('식사 정거장 삭제 → 삭제 + 그 칸 비움(CLEARED), 다시 채우지 않는다', async () => {
    const { store, sync, lastPlan } = await setup({ stayValue: selfStay() });
    const date = '2026-10-03';
    const day = store.readTripPlan().days[date];
    const lunch = day.mealSlots.find((m) => m.slot === 'LUNCH' && m.status === 'FILLED');
    assert.ok(lunch, 'fixture: 점심 칸이 차 있어야 한다');
    const meal = stopsOf(day).find((s) => s.id === lunch.stopId);
    assert.equal((await sync.deleteStop(date, meal.id)).ok, true);
    assert.deepEqual(lastPlan().edits[date], { pinned: [], deleted: [String(meal.contentId)], clearedMeals: ['LUNCH'] });
    const saved = store.readTripPlan();
    assert.equal(saved.days[date].mealSlots.find((m) => m.slot === 'LUNCH').status, 'CLEARED');
    assert.equal(contentIdsOf(saved.days[date]).includes(String(meal.contentId)), false);
  });

  test('지난 날짜는 편집할 수 없다', async () => {
    const { store, sync, server } = await setup({ stayValue: selfStay() });
    const calls = server.calls.length;
    const day = store.readTripPlan().days['2026-10-01'];
    assert.deepEqual(await sync.deleteStop('2026-10-01', stopsOf(day)[0].id), { ok: false, code: 'PAST_DATE' });
    assert.deepEqual(await sync.clearMeal('2026-10-01', 'LUNCH'), { ok: false, code: 'PAST_DATE' });
    assert.deepEqual(await sync.regenerate('DAY', '2026-10-01'), { ok: false, code: 'PAST_DATE' });
    assert.equal(server.calls.length, calls);
  });

  test('다시 만들기(이 날짜): 그 날짜의 편집 기록을 지우고 previous 없이 새로 만든다', async () => {
    const { store, sync, lastPlan } = await setup({ stayValue: selfStay() });
    const date = '2026-10-06';
    await sync.deleteStop(date, stopsOf(store.readTripPlan().days[date])[0].id);
    assert.ok(store.readTripPlan().edits[date]);
    assert.equal((await sync.regenerate('DAY', date)).ok, true);
    const body = lastPlan();
    assert.deepEqual(body.dates, [date]);
    assert.equal(body.previous?.[date], undefined);
    assert.equal(date in body.edits, false);
    assert.equal(date in store.readTripPlan().edits, false);
  });

  test('다시 만들기(오늘 이후): 외출 중인 오늘만 previous 로 보내 시작된 외출을 지킨다', async () => {
    const { store, sync, clock, lastPlan } = await setup({ stayValue: selfStay() });
    const today = store.readTripPlan().days['2026-10-02'];
    clock.set(kst('2026-10-02', hhmm(toMin(today.outings[0].departAt) + 2)));
    assert.equal((await sync.regenerate('FROM_TODAY')).ok, true);
    const body = lastPlan();
    assert.deepEqual(body.dates, DATES.slice(1));
    assert.deepEqual(Object.keys(body.previous), ['2026-10-02']);
    assert.equal(store.readTripPlan().days['2026-10-02'].outings[0].departAt, today.outings[0].departAt);
  });
});

// ── 데모 사건 (spec 4.9, 규칙 50·55) ────────────────────────────────────

describe('데모 사건 — 오늘 재계획마다 전체를 다시 보낸다', () => {
  test('사건을 더할 때마다 오늘을 재계획하며 누적 목록 전체를 싣는다. 초기화하면 빈 목록으로 재계획', async () => {
    const { store, sync, reset, server, lastPlan } = await setup({ stayValue: selfStay() });
    reset();
    assert.equal((await sync.addDemoEvent({ type: 'TRAFFIC_SURGE', extraMin: 20 })).ok, true);
    assert.deepEqual(lastPlan().dates, ['2026-10-02']);
    assert.deepEqual(lastPlan().events, [{ type: 'TRAFFIC_SURGE', extraMin: 20 }]);
    await sync.addDemoEvent({ type: 'WEATHER' });
    assert.deepEqual(lastPlan().events, [{ type: 'TRAFFIC_SURGE', extraMin: 20 }, { type: 'WEATHER' }]);

    await sync.appOpen(); // 기상 재계획(오늘 포함)에도 다시 싣는다
    assert.deepEqual(lastPlan().events, [{ type: 'TRAFFIC_SURGE', extraMin: 20 }, { type: 'WEATHER' }]);

    const calls = server.planCalls.length;
    assert.deepEqual(await sync.addDemoEvent({ type: 'BOGUS' }), { ok: false, code: 'INVALID' });
    assert.equal(server.planCalls.length, calls);

    assert.equal((await sync.resetDemoEvents()).ok, true);
    assert.deepEqual(lastPlan().events, []);
    assert.deepEqual(store.readTodayEvents(), []);
  });

  test('환자 호출 → returnNow·즉시 복귀 신호, 초기화하면 풀린다', async () => {
    const { store, sync } = await setup({ stayValue: selfStay() });
    await sync.addDemoEvent({ type: 'PATIENT_RECALL' });
    assert.equal(store.readTripPlan().days['2026-10-02'].returnNow, true);
    assert.deepEqual(sync.getState().immediateReturn, { date: '2026-10-02', cause: 'PATIENT_RECALLED' });
    await sync.resetDemoEvents();
    assert.equal(store.readTripPlan().days['2026-10-02'].returnNow, false);
    assert.equal(sync.getState().immediateReturn, null);
  });
});

// ── 언어 변경 (spec 4.9 변화 원천 7, 규칙 51) ────────────────────────────

describe('언어 변경 — 오늘 이후 표시만 다시 쓴다', () => {
  test('relabelOnly 로 오늘 이후 저장 일정만 보내고, contentId·시각·상태는 그대로, 전후 비교 없음', async () => {
    const { store, sync, reset, server, lastPlan } = await setup({ stayValue: selfStay() });
    const before = store.readTripPlan();
    reset();
    store.writeLang('ja');
    await sync.idle();
    assert.equal(server.planCalls.length, 1);
    const body = lastPlan();
    assert.equal(body.relabelOnly, true);
    assert.equal(body.lang, 'ja');
    assert.deepEqual(body.dates, DATES.slice(1));
    assert.deepEqual(Object.keys(body.previous), DATES.slice(1));
    assert.equal('edits' in body, false);
    assert.equal('events' in body, false);

    const after = store.readTripPlan();
    assert.equal(after.lang, 'ja');
    assert.deepEqual(after.days['2026-10-01'], before.days['2026-10-01'], '지난 날짜는 그대로');
    let relabeled = 0;
    for (const d of DATES.slice(1)) {
      const a = after.days[d];
      const b = before.days[d];
      assert.deepEqual(contentIdsOf(a), contentIdsOf(b));
      assert.deepEqual(stopsOf(a).map((s) => s.arriveAt), stopsOf(b).map((s) => s.arriveAt));
      assert.equal(a.dayState, b.dayState);
      assert.equal(a.delta, b.delta);
      relabeled += stopsOf(a).filter((s) => s.lang === 'ja').length;
    }
    assert.ok(relabeled > 0, '일본어 표시가 하나도 없다');
  });
});

// ── 동의 철회 (spec 4.19) ───────────────────────────────────────────────

describe('동의 철회', () => {
  const at = kst('2026-10-05', '08:00');

  test('재계획하지 못하면(오프라인) 앞으로의 날짜를 NEEDS_INPUT 으로 두고 조건에서 나온 값을 모두 지운다', async () => {
    const { store, sync, server } = await setup({ at, stayValue: selfStay() });
    sync.confirmDailyCheck();
    server.offline = true;
    assert.equal(store.withdrawSensitiveConsent().ok, true);
    await sync.idle();
    const plan = store.readTripPlan();
    for (const d of DATES.filter((x) => x >= '2026-10-05')) {
      assert.equal(plan.days[d].coverage, 'NEEDS_INPUT', d);
      assert.deepEqual(plan.days[d].reasons, ['SENSITIVE_CONSENT_REQUIRED'], d);
      assert.deepEqual(plan.days[d].outings, []);
    }
    for (const d of DATES) assert.deepEqual(plan.days[d].effective, {}, `${d} 에 적용 조건이 남았다`);
    assert.equal(JSON.stringify(plan).includes('MEDICATION_TIMES_MISSING'), false);
    assert.equal(sync.getState().updateFailed, true);

    // 다시 연결되면 남은 날짜를 정식으로 재계획한다
    server.offline = false;
    await sync.retry();
    assert.equal(sync.getState().updateFailed, false);
    assert.equal(store.readTripPlan().days['2026-10-06'].coverage, 'NEEDS_INPUT');
  });

  test('온라인이면 영향 날짜를 재계획하고, 지난 날짜에서도 조건 값을 지운다', async () => {
    const { store, sync, reset, lastPlan } = await setup({ at, stayValue: selfStay() });
    reset();
    store.withdrawSensitiveConsent();
    await sync.idle();
    assert.deepEqual(lastPlan().dates, DATES.filter((d) => d >= '2026-10-05'));
    assert.deepEqual(lastPlan().stay.consent, { sensitive: false });
    const plan = store.readTripPlan();
    assert.equal(plan.days['2026-10-07'].coverage, 'NEEDS_INPUT');
    assert.deepEqual(plan.days['2026-10-04'].effective, {});
    assert.equal(sync.getState().updateFailed, false);
  });
});

// ── 실패 시 일정 유지 ────────────────────────────────────────────────────

describe('네트워크·API 실패 — 확정 일정을 그대로 두고 업데이트 실패를 알린다', () => {
  test('재계획이 실패하면 저장 일정이 그대로이고, 다시 시도하면 그 날짜를 재계획한다', async () => {
    const { store, sync, server, lastPlan } = await setup({ stayValue: selfStay() });
    const before = store.readTripPlan();
    server.failPlan = 1;
    store.updateStay((s) => ({ ...s, appointments: [...s.appointments, { id: 'A-V', hospitalId: 'H1', type: 'VISIT', date: '2026-10-07', start: '14:00', source: 'USER' }] }));
    await sync.idle();
    assert.deepEqual(store.readTripPlan(), before);
    assert.equal(sync.getState().updateFailed, true);
    assert.equal(sync.getState().lastErrorCode, 'SAFEHOUR_EXTERNAL_API');

    await sync.retry();
    assert.deepEqual(lastPlan().dates, ['2026-10-07']);
    assert.equal(sync.getState().updateFailed, false);
    assert.ok(store.readTripPlan().days['2026-10-07'].blocks.some((b) => b.appointmentId === 'A-V'));
  });

  test('편집 요청이 실패하면 편집 기록도 저장하지 않는다', async () => {
    const { store, sync, server } = await setup({ stayValue: selfStay() });
    const before = store.readTripPlan();
    server.offline = true;
    const result = await sync.deleteStop('2026-10-03', stopsOf(before.days['2026-10-03'])[0].id);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UPDATE_FAILED');
    assert.deepEqual(store.readTripPlan(), before);
    assert.equal(sync.getState().updateFailed, true);
  });
});

// ── 보기 전용 (spec 4.18) ───────────────────────────────────────────────

describe('보기 전용 — API 호출·쓰기 0건', () => {
  test('앱 열기·편집·사건·매일 확인 모두 호출하지 않고 저장하지 않는다. 다시 쓸 수 있게 되면 앱 열기를 이어서 한다', async () => {
    const { store, sync, reset, server, log } = await setup({ stayValue: selfStay() });
    const before = store.readTripPlan();
    store.setOnline(false);
    reset();
    assert.equal(store.getStatus().readOnly, true);

    const opened = await sync.appOpen();
    assert.equal(opened.readOnly, true);
    const day = before.days['2026-10-03'];
    const stop = stopsOf(day)[0];
    for (const r of [
      await sync.alternatives('2026-10-03', day.outings[0].id, stop.id),
      await sync.applySwap('2026-10-03', stop.id, { stop: { contentId: '5999' } }),
      await sync.deleteStop('2026-10-03', stop.id),
      await sync.clearMeal('2026-10-03', 'LUNCH'),
      await sync.regenerate('FROM_TODAY'),
      await sync.addDemoEvent({ type: 'WEATHER' }),
      await sync.resetDemoEvents(),
      await sync.retry(),
      sync.confirmDailyCheck(),
    ]) {
      assert.deepEqual(r, { ok: false, code: 'READ_ONLY' });
    }
    await sync.idle();
    assert.equal(server.calls.length, 0);
    assert.deepEqual(log.filter((e) => e.startsWith('store.') && e !== 'store.onAppOpen'), []);
    assert.deepEqual(store.readTripPlan(), before);

    store.setOnline(true);
    await sync.idle();
    assert.ok(server.planCalls.length >= 1, '다시 쓸 수 있게 되면 건너뛴 재확인을 한다');
  });
});

// ── 동반 보호자 켬 (엔진 한계 — 다시 만들기 안내) ───────────────────────────

describe('동반 보호자를 켜면 다시 만들기를 안내한다', () => {
  test('환자 외출이 있는 날에는 보호자 외출이 더해지지 않으므로 신호를 켜고, 오늘 이후 다시 만들기가 끄고 보호자 외출이 생긴다', async () => {
    const { store, sync } = await setup({ stayValue: selfStay({ hasCompanion: false }) });
    assert.equal(sync.getState().companionChangeNeedsRegenerate, false);
    store.updateStay((s) => ({ ...s, hasCompanion: true }));
    await sync.idle();
    assert.equal(sync.getState().companionChangeNeedsRegenerate, true);
    assert.equal(store.readTripPlan().days['2026-10-05'].guardianOutings.length, 0, '엔진 한계를 우회해 다시 만들면 안 된다');

    await sync.regenerate('FROM_TODAY');
    assert.equal(sync.getState().companionChangeNeedsRegenerate, false);
    assert.ok(store.readTripPlan().days['2026-10-05'].guardianOutings.length > 0);
  });

  test('다시 끄면 신호도 꺼진다', async () => {
    const { store, sync } = await setup({ stayValue: selfStay({ hasCompanion: false }) });
    store.updateStay((s) => ({ ...s, hasCompanion: true }));
    await sync.idle();
    assert.equal(sync.getState().companionChangeNeedsRegenerate, true);
    store.updateStay((s) => ({ ...s, hasCompanion: false }));
    await sync.idle();
    assert.equal(sync.getState().companionChangeNeedsRegenerate, false);
  });
});

// ── 보호자 링크 다시 보내기 (spec 4.11) ──────────────────────────────────

describe('보호자 링크 다시 보내기 신호', () => {
  test('보낸 때의 지문과 지금 일정의 지문이 다르면 켜지고, 같으면 꺼진다', async () => {
    const { store, sync } = await setup({ stayValue: selfStay() });
    const sentAt = new Date(kst('2026-10-02', '07:00')).toISOString();
    store.writeGuardianShare({ lastSentAt: sentAt, planFingerprint: 'a'.repeat(64) });
    await sync.idle();
    assert.equal(sync.getState().guardianResendNeeded, true);
    const fingerprint = await computeShareFingerprint({ stay: store.readStay(), tripPlan: store.readTripPlan(), since: Date.parse(sentAt) });
    store.writeGuardianShare({ lastSentAt: sentAt, planFingerprint: fingerprint });
    await sync.idle();
    assert.equal(sync.getState().guardianResendNeeded, false);
  });

  test('보낸 링크의 7일 범위가 지나고 체류가 이어지면 guardianWindowPassed 가 켜진다(일정 변화 신호와 따로)', async () => {
    const { store, sync, clock } = await setup({ stayValue: selfStay() });
    const sentAt = new Date(kst('2026-10-02', '07:00')).toISOString();
    const fingerprint = await computeShareFingerprint({ stay: store.readStay(), tripPlan: store.readTripPlan(), since: Date.parse(sentAt) });
    store.writeGuardianShare({ lastSentAt: sentAt, planFingerprint: fingerprint });
    await sync.idle();
    assert.equal(sync.getState().guardianWindowPassed, false, '10-02 에 보낸 링크는 10-08 까지 담는다');
    clock.set(kst('2026-10-09', '09:00'));
    await sync.appOpen();
    await sync.idle();
    assert.equal(sync.getState().guardianWindowPassed, true);
  });
});
