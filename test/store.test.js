// 기기 저장소 (AX-312 · spec 4.1 자동 삭제, 4.11 임시 보관, 4.18, 4.19, 4.20, 5.1, 10장 규칙 40–42)
//
// 브라우저 저장소를 흉내 낸 가짜 Storage 로 저장소 모듈만 검증한다.
// 시각·네트워크는 모두 주입한다 — 실제 시계와 네트워크에 흔들리지 않는다.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  PENDING_GUARDIAN_LINK_KEY,
  PENDING_GUARDIAN_LINK_TTL_MS,
  READ_ONLY_REASON,
  SCHEMA_VERSION,
  STORE_ERROR,
  STORE_PREFIX,
  accountRecordKey,
  canonicalJson,
  createStore,
  getStore,
  holdPendingGuardianLink,
  instructionAckKey,
  isAccountKey,
  isInstructionAcknowledged,
  planFingerprint,
  takePendingGuardianLink,
  todayKst,
} from '../lib/store/index.js';
import { CLEARABLE_KEYS, LANG_KEY as LEGACY_LANG_KEY } from '../lib/session.js';
import { deriveAccountKey } from '../src/auth/session.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import { hospitalPeriod, makeStay, selfPeriod } from './stay-fixtures.js';

// ── 가짜 브라우저 저장소 ─────────────────────────────────────────────

class FakeStorage {
  #map = new Map();

  constructor({ quotaChars = Infinity } = {}) {
    this.quotaChars = quotaChars;
  }

  get length() {
    return this.#map.size;
  }

  key(index) {
    return [...this.#map.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#map.has(String(key)) ? this.#map.get(String(key)) : null;
  }

  setItem(key, value) {
    const k = String(key);
    const v = String(value);
    let used = 0;
    for (const [ek, ev] of this.#map) if (ek !== k) used += ek.length + ev.length;
    if (used + k.length + v.length > this.quotaChars) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.#map.set(k, v);
  }

  removeItem(key) {
    this.#map.delete(String(key));
  }

  clear() {
    this.#map.clear();
  }

  keys() {
    return [...this.#map.keys()];
  }

  text() {
    return JSON.stringify(Object.fromEntries(this.#map));
  }
}

// ── 공통 준비 ──────────────────────────────────────────────────────

const SECRET = 'k'.repeat(48);
const KEY_A = deriveAccountKey({ provider: 'google', subject: 'raw-sub-alpha' }, SECRET);
const KEY_B = deriveAccountKey({ provider: 'kakao', subject: 'raw-sub-bravo' }, SECRET);
const HOUR = 60 * 60 * 1000;
/** 2026-10-02 12:00 KST — 테스트 체류(10-01 ~ 10-08) 중간 */
const T0 = Date.parse('2026-10-02T03:00:00Z');

let clock;
let local;
let tab;
let fetchCalls;
let fetchImpl;

function makeStore(options = {}) {
  return createStore({ storage: local, tabStorage: tab, now: () => clock, fetchImpl, ...options });
}

function sessionFor(accountKey, { expiresInMs = 12 * HOUR } = {}) {
  return {
    ok: true,
    authenticated: true,
    provider: 'google',
    expiresAt: new Date(clock + expiresInMs).toISOString(),
    accountKey,
  };
}

function signedIn(accountKey = KEY_A) {
  const store = makeStore();
  store.setOnline(true);
  store.setSession(sessionFor(accountKey));
  return store;
}

function accountKeysInStorage() {
  return local.keys().filter((k) => k.startsWith(STORE_PREFIX) && !k.startsWith(`${STORE_PREFIX}device.`));
}

function tripPlanFixture() {
  const day = (date) => ({ date, coverage: 'FREE', dayState: 'TOGETHER', reasons: [], outings: [], guardianOutings: [] });
  return {
    engineVersion: 'test',
    generatedAt: '2026-10-01T09:00:00+09:00',
    lang: 'en',
    days: { '2026-10-02': day('2026-10-02'), '2026-10-03': day('2026-10-03'), '2026-10-04': day('2026-10-04') },
    edits: {},
  };
}

function linkedPlanFixture(overrides = {}) {
  return {
    code: 'DEMO-A',
    hospitalId: 'H1',
    fetchedAt: '2026-10-01T10:00:00+09:00',
    plan: {
      schemaVersion: 2,
      planId: 'demo-plan',
      version: 1,
      issuedAt: '2026-09-30T09:00:00+09:00',
      expiresAt: '2026-10-20T00:00:00+09:00',
      revoked: false,
      demo: true,
      issuer: { name: '데모', role: 'DEMO' },
      hospital: { name: '데모 병원', address: { roadAddress: '테스트로 1', lat: 37.5, lng: 127 } },
      periods: [],
      instructions: [
        { id: 'i1', category: 'GENERAL', text: '데모 안내 1', lang: 'ko', updatedAt: '2026-09-30T09:00:00+09:00', acknowledged: true },
        { id: 'i2', category: 'GENERAL', text: '데모 안내 2', lang: 'ko', updatedAt: '2026-09-30T09:00:00+09:00' },
      ],
    },
    ...overrides,
  };
}

function guardianCopy({ expiresAt = '2026-10-08T23:59:00+09:00' } = {}) {
  return {
    snapshot: { v: 1, createdAt: '2026-10-01T09:00:00+09:00', expiresAt, lang: 'en', days: [], emergency: ['119', '1330'] },
    importedAt: '2026-10-01T10:00:00+09:00',
    expiresAt,
  };
}

beforeEach(() => {
  clock = T0;
  local = new FakeStorage();
  tab = new FakeStorage();
  fetchCalls = [];
  fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), method: init.method ?? 'GET' });
    return { ok: true, status: 200, json: async () => ({ ok: true, authenticated: false }) };
  };
});

// ── 이름공간 ───────────────────────────────────────────────────────

describe('계정 이름공간', () => {
  test('키는 safehour.v2.<accountKey>.<항목> 이고 원래 식별자가 없다', () => {
    const store = signedIn(KEY_A);
    assert.deepEqual(store.writeStay(makeStay()), { ok: true });

    assert.ok(local.getItem(accountRecordKey(KEY_A, 'stay')));
    assert.equal(accountRecordKey(KEY_A, 'stay'), `safehour.v2.${KEY_A}.stay`);
    assert.equal(local.text().includes('raw-sub-alpha'), false, '원래 식별자가 기기에 저장됐다');
  });

  test('두 계정의 데이터가 서로 보이지 않는다', () => {
    const store = signedIn(KEY_A);
    store.writeStay(makeStay({ hasCompanion: true }));
    store.writeTripPlan(tripPlanFixture());

    store.setSession(sessionFor(KEY_B));
    assert.equal(store.readStay(), null, 'B 계정에서 A 계정의 체류가 보인다');
    assert.equal(store.readTripPlan(), null);
    store.writeStay(makeStay({ hasCompanion: false }));

    store.setSession(sessionFor(KEY_A));
    assert.equal(store.readStay().hasCompanion, true, 'B 쓰기가 A 를 덮었다');
    store.setSession(sessionFor(KEY_B));
    assert.equal(store.readStay().hasCompanion, false);
    assert.deepEqual(accountKeysInStorage().map((k) => k.split('.')[2]).sort(), [KEY_A, KEY_A, KEY_B].sort());
  });

  test('계정 키 형식이 아니면 이름공간으로 쓰지 않는다 (키 주입 차단)', () => {
    for (const bad of ['short', `${KEY_A}.stay`, 'device', '../x'.repeat(8), '', null, 42]) {
      assert.equal(isAccountKey(bad), false, String(bad));
      const store = makeStore();
      store.setOnline(true);
      store.setSession({ ok: true, authenticated: true, provider: 'google', expiresAt: new Date(clock + HOUR).toISOString(), accountKey: bad });
      assert.equal(store.getStatus().readOnly, true);
      assert.equal(store.writeStay(makeStay()).ok, false);
    }
    assert.equal(local.length, 0);
  });

  test('세션 응답에 식별자가 섞여 와도 기기에 남기지 않는다', () => {
    const store = makeStore();
    store.setOnline(true);
    store.setSession({ ...sessionFor(KEY_A), subject: 'raw-sub-alpha', sub: 'raw-sub-alpha', email: 'x@example.com' });
    store.writeStay(makeStay());
    assert.equal(local.text().includes('raw-sub-alpha'), false);
    assert.equal(local.text().includes('x@example.com'), false);
  });

  test('저장 형식에 schemaVersion 2 가 붙고, 다른 버전·깨진 값은 없는 것으로 읽는다', () => {
    const store = signedIn(KEY_A);
    store.writeStay(makeStay());
    const raw = JSON.parse(local.getItem(accountRecordKey(KEY_A, 'stay')));
    assert.equal(raw.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 2);
    assert.equal(store.readStay().schemaVersion, 2);

    local.setItem(accountRecordKey(KEY_A, 'stay'), JSON.stringify({ schemaVersion: 1, data: makeStay() }));
    assert.equal(store.readStay(), null);
    local.setItem(accountRecordKey(KEY_A, 'stay'), '{not json');
    assert.equal(store.readStay(), null);
  });

  test('체류를 저장하면 만든 시각은 유지되고 고친 시각이 갱신된다', () => {
    const store = signedIn(KEY_A);
    store.writeStay(makeStay({ createdAt: undefined, updatedAt: undefined }));
    const first = store.readStay();
    assert.equal(first.createdAt, new Date(T0).toISOString());

    clock += HOUR;
    store.writeStay({ ...first, pace: 'NORMAL' });
    const second = store.readStay();
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.updatedAt, new Date(T0 + HOUR).toISOString());
  });
});

// ── 읽기 스냅샷과 구독 ───────────────────────────────────────────────

describe('읽기 스냅샷과 구독', () => {
  test('바뀌지 않았으면 같은 참조를 돌려준다 (useSyncExternalStore 호환)', () => {
    const store = signedIn();
    store.writeStay(makeStay());
    assert.equal(store.readStay(), store.readStay());
    assert.equal(store.getStatus(), store.getStatus());
  });

  test('읽은 값은 얼어 있어 저장 사본을 몰래 바꿀 수 없다', () => {
    const store = signedIn();
    store.writeStay(makeStay());
    assert.throws(() => {
      store.readStay().periods.push(selfPeriod());
    });
  });

  test('쓰기가 일어나면 해당 주제의 구독자에게 알린다', () => {
    const store = signedIn();
    const seen = [];
    const off = store.subscribe('stay', (event) => seen.push(event));
    const all = [];
    store.subscribe('*', (event) => all.push(event.topic));

    store.writeStay(makeStay());
    store.writeTripPlan(tripPlanFixture());
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { topic: 'stay', accountKey: KEY_A });
    assert.deepEqual(all, ['stay', 'tripPlan']);

    off();
    store.writeStay(makeStay({ pace: 'NORMAL' }));
    assert.equal(seen.length, 1, '구독 해제 뒤에도 알림이 왔다');
  });

  test('계정이 바뀌면 모든 데이터 주제와 상태를 다시 알린다', () => {
    const store = signedIn(KEY_A);
    const topics = new Set();
    store.subscribe('*', (event) => topics.add(event.topic));
    store.setSession(sessionFor(KEY_B));
    for (const topic of ['status', 'stay', 'tripPlan', 'todayEvents', 'prefs', 'guardianCopies', 'aiIntroCache', 'notificationSchedule']) {
      assert.ok(topics.has(topic), `${topic} 알림이 없다`);
    }
  });

  test('다른 탭의 저장 변경을 받아 다시 알린다', () => {
    const store = signedIn(KEY_A);
    const listeners = {};
    const fakeWindow = {
      navigator: { onLine: true },
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      removeEventListener: (type) => {
        delete listeners[type];
      },
    };
    const detach = store.attachWindow(fakeWindow);
    const seen = [];
    store.subscribe('tripPlan', (event) => seen.push(event.topic));

    listeners.storage({ key: accountRecordKey(KEY_A, 'tripPlan'), storageArea: local });
    assert.deepEqual(seen, ['tripPlan']);

    // 온라인 상태 변화
    fakeWindow.navigator.onLine = false;
    listeners.offline({});
    assert.equal(store.getStatus().reason, READ_ONLY_REASON.OFFLINE);
    detach();
    assert.equal(Object.keys(listeners).length, 0);
  });
});

// ── 보기 전용 (spec 4.18 · 규칙 40) ─────────────────────────────────

describe('보기 전용 모드', () => {
  function seedAccountA() {
    const store = signedIn(KEY_A);
    store.writeStay(makeStay());
    store.writeTripPlan(tripPlanFixture());
    store.writeGuardianCopy('copy1', guardianCopy());
    return store;
  }

  test('로그인 전에는 보기 전용이고 이유는 NO_SESSION 이다', () => {
    const store = makeStore();
    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.reason, READ_ONLY_REASON.NO_SESSION);
    assert.equal(status.sessionChecked, false);
    assert.equal(store.writeStay(makeStay()).code, STORE_ERROR.READ_ONLY);
    assert.equal(local.length, 0);
  });

  test('로그인·온라인이면 쓰기가 열린다', () => {
    const store = signedIn(KEY_A);
    const status = store.getStatus();
    assert.equal(status.readOnly, false);
    assert.equal(status.reason, null);
    assert.equal(status.accountKey, KEY_A);
    assert.equal(status.sessionChecked, true);
  });

  test('세션이 만료되면 마지막 계정의 오늘·내일 일정, 카드·긴급 정보, 보호자 사본을 읽을 수 있다', () => {
    seedAccountA();
    clock += 12 * HOUR; // 12시간 세션 만료 시점

    const store = makeStore(); // 앱을 다시 연다
    store.setOnline(true);
    store.setSession({ ok: true, authenticated: false, provider: null, expiresAt: null, accountKey: null });

    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.accountKey, KEY_A, '마지막으로 로그인한 계정 사본을 읽어야 한다');
    assert.equal(store.readLastAccountKey(), KEY_A);

    clock = Date.parse('2026-10-03T01:00:00Z'); // 10-03 10:00 KST
    const view = store.readTodayTomorrow();
    assert.equal(view.today.date, '2026-10-03');
    assert.equal(view.today.plan.date, '2026-10-03');
    assert.equal(view.tomorrow.date, '2026-10-04');
    assert.equal(view.tomorrow.plan.date, '2026-10-04');
    // 카드·긴급 연락에 필요한 체류(병원 이름·전화, 숙소 주소)
    assert.equal(store.readStay().hospitals[0].id, 'H1');
    assert.equal(store.readGuardianCopies().length, 1);
  });

  test('세션을 받은 뒤 만료 시각이 지나면 SESSION_EXPIRED 로 바뀌고 쓰기가 막힌다', () => {
    const store = seedAccountA();
    clock += 12 * HOUR;
    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.reason, READ_ONLY_REASON.SESSION_EXPIRED);
    assert.equal(status.accountKey, KEY_A);
    assert.ok(store.readStay());

    const before = local.text();
    const results = [
      store.writeStay(makeStay({ pace: 'NORMAL' })),
      store.writeTripPlan(tripPlanFixture()),
      store.writeEdits({ '2026-10-03': { pinned: ['c1'], deleted: [], clearedMeals: [] } }),
      store.writePeriods([selfPeriod()]),
      store.upsertLinkedPlan(linkedPlanFixture()),
      store.grantSensitiveConsent({ version: 'consent-v2' }),
      store.withdrawSensitiveConsent(),
      store.writeGuardianShare({ lastSentAt: new Date(clock).toISOString(), planFingerprint: 'a'.repeat(64) }),
      store.appendTodayEvent({ type: 'WEATHER' }),
      store.writePrefs({ notifications: true }),
      store.confirmDailyCheck('2026-10-02'),
      store.writeGuardianCopy('copy2', guardianCopy()),
      store.writeAiIntro('k1', { text: 'x', source: 'TEMPLATE' }),
      store.writeNotificationSchedule([{ id: 'n1', at: '2026-10-02T18:00:00+09:00' }]),
      store.deleteStay(),
    ];
    for (const result of results) assert.deepEqual(result, { ok: false, code: STORE_ERROR.READ_ONLY });
    assert.equal(local.text(), before, '보기 전용인데 저장소가 바뀌었다');
  });

  test('오프라인이면 세션이 유효해도 보기 전용이고 읽기는 된다', () => {
    const store = seedAccountA();
    store.setOnline(false);
    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.reason, READ_ONLY_REASON.OFFLINE);
    assert.ok(store.readTripPlan());
    assert.equal(store.writeTripPlan(tripPlanFixture()).code, STORE_ERROR.READ_ONLY);

    store.setOnline(true);
    assert.equal(store.getStatus().readOnly, false);
  });

  test('세션 확인 요청이 네트워크 오류면 오프라인 보기 전용으로 둔다', async () => {
    seedAccountA();
    const store = makeStore({
      fetchImpl: async () => {
        throw new TypeError('network');
      },
    });
    const status = await store.refreshSession();
    assert.equal(status.readOnly, true);
    assert.equal(status.reason, READ_ONLY_REASON.OFFLINE);
    assert.equal(status.accountKey, KEY_A);
  });

  test('세션 확인 요청이 성공하면 그 응답으로 상태를 정한다', async () => {
    const store = makeStore({
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url, method: init?.method ?? 'GET' });
        return { ok: true, status: 200, json: async () => sessionFor(KEY_B) };
      },
    });
    const status = await store.refreshSession();
    assert.equal(fetchCalls[0].url, '/api/auth/session');
    assert.equal(status.readOnly, false);
    assert.equal(status.accountKey, KEY_B);
    assert.equal(store.readLastAccountKey(), KEY_B);
  });

  test('상태 변화는 status 구독자에게 알린다', () => {
    const store = signedIn();
    const seen = [];
    store.subscribe('status', () => seen.push(store.getStatus().reason));
    store.setOnline(false);
    store.setOnline(true);
    assert.deepEqual(seen, [READ_ONLY_REASON.OFFLINE, null]);
  });

  test('언어는 보기 전용에서도 바꿀 수 있다 — 계정 데이터가 아니다', () => {
    const store = makeStore();
    assert.deepEqual(store.writeLang('ja'), { ok: true });
    assert.equal(store.readLang(), 'ja');
    assert.equal(store.readPrefs().lang, 'ja');
    assert.equal(store.writeLang('fr').code, STORE_ERROR.INVALID);
  });

  test('로그인한 적이 없는 기기의 보기 전용은 읽을 것이 없다', () => {
    const store = makeStore();
    assert.equal(store.getStatus().accountKey, null);
    assert.equal(store.readStay(), null);
    assert.equal(store.readTripPlan(), null);
    assert.deepEqual(store.readGuardianCopies(), []);
    assert.deepEqual(store.readTodayEvents(), []);
  });
});

// ── 체류 안의 항목 ─────────────────────────────────────────────────

describe('체류 항목 — 기간·동의·연동 지침·보호자 공유', () => {
  test('동의 없이 조건 기간이나 연동 지침을 저장할 수 없다', () => {
    const store = signedIn();
    store.writeStay(makeStay({ consent: { sensitive: null } }));
    assert.equal(store.writePeriods([selfPeriod()]).code, STORE_ERROR.CONSENT_REQUIRED);
    assert.equal(store.upsertLinkedPlan(linkedPlanFixture()).code, STORE_ERROR.CONSENT_REQUIRED);
    assert.equal(store.writeStay(makeStay({ consent: { sensitive: null }, periods: [selfPeriod()] })).code, STORE_ERROR.CONSENT_REQUIRED);
    assert.deepEqual(store.readPeriods(), []);
  });

  test('동의를 기록하면 문구 버전과 동의 시각이 남는다', () => {
    const store = signedIn();
    store.writeStay(makeStay({ consent: { sensitive: null } }));
    assert.deepEqual(store.grantSensitiveConsent({ version: 'consent-v1' }), { ok: true });
    assert.deepEqual(store.readConsent(), { sensitive: { version: 'consent-v1', agreedAt: new Date(T0).toISOString() } });
    assert.deepEqual(store.writePeriods([selfPeriod()]), { ok: true });
    assert.equal(store.readPeriods().length, 1);
    assert.equal(store.grantSensitiveConsent({ version: '' }).code, STORE_ERROR.INVALID);
  });

  test('체류가 없으면 체류 안의 항목을 쓸 수 없다', () => {
    const store = signedIn();
    assert.equal(store.writePeriods([]).code, STORE_ERROR.NO_STAY);
    assert.equal(store.grantSensitiveConsent({ version: 'v1' }).code, STORE_ERROR.NO_STAY);
    assert.equal(store.writeGuardianShare({ lastSentAt: new Date(T0).toISOString(), planFingerprint: 'a'.repeat(64) }).code, STORE_ERROR.NO_STAY);
    assert.equal(store.writeEdits({}).code, STORE_ERROR.NO_TRIP_PLAN);
  });

  test('동의 철회 — SELF·HOSPITAL 기간, 연동 지침 사본과 연결 코드를 지운다', () => {
    const store = signedIn();
    store.writeStay(
      makeStay({
        hospitals: [{ id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 1', lat: 37.52, lng: 127.02, source: 'DEMO' }, linkedPlanId: 'demo-plan' }],
      }),
    );
    store.writePeriods([selfPeriod(), hospitalPeriod()]);
    store.upsertLinkedPlan(linkedPlanFixture());
    store.upsertLinkedPlan(linkedPlanFixture({ code: 'DEMO-B' }));
    assert.equal(store.readLinkedPlans().length, 2);

    const result = store.withdrawSensitiveConsent();
    assert.deepEqual(result, { ok: true, removedPeriods: 2, removedLinkedPlans: 2 });

    const stay = store.readStay();
    assert.deepEqual(stay.periods, []);
    assert.deepEqual(stay.linkedPlans, []);
    assert.deepEqual(stay.consent, { sensitive: null });
    assert.equal('linkedPlanId' in stay.hospitals[0], false, '지운 지침을 가리키는 병원 연결이 남았다');
    // 체류의 나머지는 그대로다
    assert.equal(stay.lodgings.length, 2);
    assert.equal(stay.appointments.length, 2);
    // 연결 코드·안내문이 저장소 어디에도 남지 않는다
    const text = local.text();
    assert.equal(text.includes('DEMO-A'), false);
    assert.equal(text.includes('DEMO-B'), false);
    assert.equal(text.includes('데모 안내 1'), false);
  });

  test('연동 지침은 받은 그대로 저장하되 안내문의 acknowledged 는 버린다', () => {
    const store = signedIn();
    store.writeStay(makeStay());
    store.upsertLinkedPlan(linkedPlanFixture());
    const [linked] = store.readLinkedPlans();
    assert.equal(linked.code, 'DEMO-A');
    assert.equal(linked.hospitalId, 'H1');
    assert.equal(linked.fetchedAt, '2026-10-01T10:00:00+09:00');
    assert.deepEqual(linked.acknowledged, {});
    for (const instruction of linked.plan.instructions) assert.equal('acknowledged' in instruction, false);
  });

  test('안내문 확인은 id@updatedAt 키로 남고, 내용이 바뀌면(updatedAt 변경) 풀린다', () => {
    const store = signedIn();
    store.writeStay(makeStay());
    store.upsertLinkedPlan(linkedPlanFixture());
    const [i1, i2] = linkedPlanFixture().plan.instructions;

    assert.deepEqual(store.acknowledgeInstruction('DEMO-A', i1), { ok: true });
    let [linked] = store.readLinkedPlans();
    assert.equal(instructionAckKey(i1), `i1@${i1.updatedAt}`);
    assert.deepEqual(linked.acknowledged, { [`i1@${i1.updatedAt}`]: true });
    assert.equal(isInstructionAcknowledged(linked, i1), true);
    assert.equal(isInstructionAcknowledged(linked, i2), false);

    // 다시 받아 온 지침 — i1 내용이 바뀌었다
    const refreshed = linkedPlanFixture();
    refreshed.plan.instructions[0] = { ...i1, text: '바뀐 안내', updatedAt: '2026-10-02T09:00:00+09:00' };
    store.upsertLinkedPlan(refreshed);
    [linked] = store.readLinkedPlans();
    assert.equal(isInstructionAcknowledged(linked, refreshed.plan.instructions[0]), false, '바뀐 안내문의 확인이 유지됐다');

    // 바뀌지 않은 안내문의 확인은 다시 받아도 유지된다
    store.acknowledgeInstruction('DEMO-A', i2);
    store.upsertLinkedPlan(refreshed);
    [linked] = store.readLinkedPlans();
    assert.equal(isInstructionAcknowledged(linked, i2), true);

    assert.equal(store.acknowledgeInstruction('NOPE', i1).code, STORE_ERROR.INVALID);
    assert.equal(store.removeLinkedPlan('DEMO-A').ok, true);
    assert.deepEqual(store.readLinkedPlans(), []);
  });

  test('보호자 공유 기록은 보낸 시각과 일정 지문만 담는다', async () => {
    const store = signedIn();
    store.writeStay(makeStay());
    const fingerprint = await planFingerprint({ days: [] });
    assert.deepEqual(store.writeGuardianShare({ lastSentAt: new Date(T0).toISOString(), planFingerprint: fingerprint, pin: '123456' }), { ok: true });
    assert.deepEqual(store.readGuardianShare(), { lastSentAt: new Date(T0).toISOString(), planFingerprint: fingerprint });
    assert.equal(local.text().includes('123456'), false, 'PIN 이 저장됐다');
    assert.equal(store.writeGuardianShare({ lastSentAt: 'x', planFingerprint: fingerprint }).code, STORE_ERROR.INVALID);
    assert.equal(store.writeGuardianShare({ lastSentAt: new Date(T0).toISOString(), planFingerprint: 'nope' }).code, STORE_ERROR.INVALID);
  });

  test('updateStay 는 현재 체류를 받아 다음 체류를 저장한다', () => {
    const store = signedIn();
    store.writeStay(makeStay());
    assert.deepEqual(store.updateStay((stay) => ({ ...stay, hasCompanion: false })), { ok: true });
    assert.equal(store.readStay().hasCompanion, false);
  });
});

// ── 일정·편집·오늘 사건·설정 ──────────────────────────────────────────

describe('일정·편집·오늘 사건·설정', () => {
  test('일정과 편집 기록을 읽고 쓴다', () => {
    const store = signedIn();
    store.writeTripPlan(tripPlanFixture());
    assert.equal(store.readDayPlan('2026-10-03').date, '2026-10-03');
    assert.equal(store.readDayPlan('2026-12-31'), null);

    const edits = { '2026-10-03': { pinned: ['c1'], deleted: ['c2'], clearedMeals: ['LUNCH'] } };
    assert.deepEqual(store.writeEdits(edits), { ok: true });
    assert.deepEqual(store.readEdits(), edits);
    assert.deepEqual(store.readTripPlan().edits, edits);
  });

  test('오늘 사건은 KST 날짜가 바뀌면 지워진다', () => {
    const store = signedIn();
    clock = Date.parse('2026-10-02T14:30:00Z'); // 10-02 23:30 KST
    store.appendTodayEvent({ type: 'CLOSURE', closedIds: ['c1'] });
    store.appendTodayEvent({ type: 'WEATHER' });
    assert.deepEqual(store.readTodayEvents().map((e) => e.type), ['CLOSURE', 'WEATHER']);

    clock = Date.parse('2026-10-02T14:59:59Z'); // 아직 10-02 KST
    assert.equal(store.readTodayEvents().length, 2);

    clock = Date.parse('2026-10-02T15:00:00Z'); // 10-03 00:00 KST
    assert.deepEqual(store.readTodayEvents(), []);
    assert.equal(local.getItem(accountRecordKey(KEY_A, 'todayEvents')), null, '지난 날짜의 사건이 저장소에 남았다');
  });

  test('날짜가 바뀐 뒤 새 사건을 더하면 어제 사건과 섞이지 않는다', () => {
    const store = signedIn();
    store.appendTodayEvent({ type: 'CLOSURE', closedIds: ['c1'] });
    clock += 24 * HOUR;
    assert.equal(store.appendTodayEvent({ type: 'WEATHER' }).code, STORE_ERROR.READ_ONLY, '12시간 세션이 지났다');
    store.setSession(sessionFor(KEY_A)); // 다시 로그인
    assert.deepEqual(store.appendTodayEvent({ type: 'WEATHER' }), { ok: true });
    assert.deepEqual(store.readTodayEvents().map((e) => e.type), ['WEATHER']);
    assert.equal(JSON.parse(local.getItem(accountRecordKey(KEY_A, 'todayEvents'))).data.date, todayKst(clock));
  });

  test('사건 초기화', () => {
    const store = signedIn();
    store.appendTodayEvent({ type: 'PATIENT_RECALL' });
    assert.deepEqual(store.clearTodayEvents(), { ok: true });
    assert.deepEqual(store.readTodayEvents(), []);
  });

  test('설정 — 알림 켜기와 매일 확인 기록', () => {
    const store = signedIn();
    assert.deepEqual(store.readPrefs(), { lang: null, notifications: false, dailyCheck: {} });
    store.writePrefs({ notifications: true });
    store.confirmDailyCheck('2026-10-02');
    store.writeLang('zh');
    assert.deepEqual(store.readPrefs(), { lang: 'zh', notifications: true, dailyCheck: { '2026-10-02': 'CONFIRMED' } });
    assert.equal(store.confirmDailyCheck('10/02').code, STORE_ERROR.INVALID);
    assert.equal(store.writePrefs({ notifications: 'yes' }).code, STORE_ERROR.INVALID);
  });

  test('todayKst 는 기기 시간대와 무관하게 KST 날짜다', () => {
    assert.equal(todayKst(Date.parse('2026-10-02T14:59:59Z')), '2026-10-02');
    assert.equal(todayKst(Date.parse('2026-10-02T15:00:00Z')), '2026-10-03');
  });
});

// ── 보호자 사본·AI 캐시·알림 예약 ─────────────────────────────────────

describe('보호자 사본·AI 문장 캐시·알림 예약', () => {
  test('만료된 보호자 사본은 보여주지 않고 지운다', () => {
    const store = signedIn();
    store.writeGuardianCopy('live', guardianCopy());
    store.writeGuardianCopy('old', guardianCopy({ expiresAt: '2026-10-02T13:00:00+09:00' }));
    assert.equal(store.readGuardianCopies().length, 2);

    clock = Date.parse('2026-10-02T04:00:00Z'); // 13:00 KST — old 만료
    const copies = store.readGuardianCopies();
    assert.deepEqual(copies.map((c) => c.id), ['live']);
    assert.equal(Object.keys(JSON.parse(local.getItem(accountRecordKey(KEY_A, 'guardianCopies'))).data).length, 1);
  });

  test('이미 만료된 사본은 저장하지 않는다', () => {
    const store = signedIn();
    assert.equal(store.writeGuardianCopy('x', guardianCopy({ expiresAt: '2026-10-01T00:00:00+09:00' })).code, STORE_ERROR.EXPIRED);
    assert.equal(store.writeGuardianCopy('bad id!', guardianCopy()).code, STORE_ERROR.INVALID);
    assert.equal(store.removeGuardianCopy('x').ok, true);
  });

  test('AI 문장 캐시는 같은 입력 키로 다시 쓰고, 개수 상한을 넘지 않는다', () => {
    const store = signedIn();
    assert.deepEqual(store.writeAiIntro('in-1', { text: '가벼운 일정이에요', source: 'AI' }), { ok: true });
    assert.deepEqual(store.readAiIntro('in-1'), { text: '가벼운 일정이에요', source: 'AI' });
    assert.equal(store.readAiIntro('none'), null);
    assert.equal(store.writeAiIntro('in-2', { text: 'x', source: 'HUMAN' }).code, STORE_ERROR.INVALID);

    for (let i = 0; i < 150; i += 1) {
      clock += 1000;
      store.writeAiIntro(`k-${i}`, { text: `t${i}`, source: 'TEMPLATE' });
    }
    const cache = JSON.parse(local.getItem(accountRecordKey(KEY_A, 'aiIntroCache'))).data;
    assert.ok(Object.keys(cache).length <= 100);
    assert.deepEqual(store.readAiIntro('k-149'), { text: 't149', source: 'TEMPLATE' });
    assert.equal(store.readAiIntro('in-1'), null, '가장 오래된 항목이 밀려나야 한다');
  });

  test('알림 예약을 읽고 쓴다', () => {
    const store = signedIn();
    assert.deepEqual(store.readNotificationSchedule(), []);
    const items = [{ id: 'n1', at: '2026-10-02T17:00:00+09:00', kind: 'RETURN_60' }];
    store.writeNotificationSchedule(items);
    assert.deepEqual(store.readNotificationSchedule(), items);
    assert.equal(store.writeNotificationSchedule('x').code, STORE_ERROR.INVALID);
  });

  test('저장 공간이 부족하면 실패를 알리고 기존 값을 지킨다', () => {
    local = new FakeStorage({ quotaChars: 9000 });
    const store = signedIn();
    assert.deepEqual(store.writeStay(makeStay()), { ok: true });
    const huge = { ...tripPlanFixture(), lang: 'x'.repeat(20000) };
    assert.deepEqual(store.writeTripPlan(huge), { ok: false, code: STORE_ERROR.STORAGE_FAILED });
    assert.equal(store.readTripPlan(), null);
    assert.ok(store.readStay());
  });
});

// ── 규칙 41: 이 기기에서 내 정보 지우기 ────────────────────────────────

describe('규칙 41 — 이 기기에서 내 정보 지우기', () => {
  function seedEverything() {
    const store = signedIn(KEY_A);
    store.writeLang('ja');
    store.writeStay(makeStay({ periods: [selfPeriod()] }));
    store.upsertLinkedPlan(linkedPlanFixture());
    store.writeTripPlan(tripPlanFixture());
    store.appendTodayEvent({ type: 'WEATHER' });
    store.writePrefs({ notifications: true });
    store.writeAiIntro('k', { text: 'x', source: 'AI' });
    store.writeNotificationSchedule([{ id: 'n1', at: '2026-10-02T17:00:00+09:00' }]);
    store.setSession(sessionFor(KEY_B)); // 같은 기기의 다른 계정 — 보호자 사본
    store.writeGuardianCopy('copy', guardianCopy());
    store.writeStay(makeStay());
    // 다른 앱 데이터, 기존 탭 저장소 키, 보호자 링크 임시 보관
    local.setItem('other-app.key', 'keep');
    for (const key of CLEARABLE_KEYS) tab.setItem(key, '{"x":1}');
    tab.setItem(LEGACY_LANG_KEY, 'en');
    store.holdPendingGuardianLink('Q2lwaGVydGV4dA');
    return store;
  }

  test('모든 이름공간·보호자 사본·알림 예약·AI 캐시·기존 탭 키를 지우고 로그아웃한다', async () => {
    const store = seedEverything();
    assert.ok(accountKeysInStorage().length > 0);

    const result = await store.deleteAllMyData();

    assert.equal(result.ok, true);
    assert.equal(result.loggedOut, true);
    assert.deepEqual(accountKeysInStorage(), [], '계정 이름공간이 남았다');
    assert.deepEqual(
      local.keys().filter((k) => k.startsWith(STORE_PREFIX)),
      [`${STORE_PREFIX}device.lang`],
      '언어 외의 기기 기록(마지막 계정 포함)이 남았다',
    );
    assert.equal(store.readLang(), 'ja', '언어는 지우지 않는다');
    assert.equal(local.getItem('other-app.key'), 'keep', '다른 데이터까지 지웠다');
    for (const key of CLEARABLE_KEYS) assert.equal(tab.getItem(key), null, `기존 탭 키 ${key} 가 남았다`);
    assert.equal(tab.getItem(LEGACY_LANG_KEY), 'en', '기존 언어 키는 삭제 대상이 아니다');
    assert.equal(tab.getItem(PENDING_GUARDIAN_LINK_KEY), null);

    // 로그아웃: 기존 POST /api/auth/logout
    assert.deepEqual(fetchCalls.at(-1), { url: '/api/auth/logout', method: 'POST' });

    // 지운 뒤에는 로그인 전 상태 — 읽을 계정도 없다
    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.reason, READ_ONLY_REASON.NO_SESSION);
    assert.equal(status.accountKey, null);
    assert.equal(store.readStay(), null);
    assert.deepEqual(store.readGuardianCopies(), []);
    assert.deepEqual(store.readNotificationSchedule(), []);
  });

  test('보기 전용(만료·오프라인)에서도 지울 수 있고, 로그아웃 요청이 실패해도 기기 삭제는 끝난다', async () => {
    const store = seedEverything();
    store.setOnline(false);
    fetchImpl = async () => {
      throw new TypeError('offline');
    };
    const offlineStore = makeStore();
    offlineStore.setOnline(false);
    const result = await offlineStore.deleteAllMyData();
    assert.equal(result.ok, true);
    assert.equal(result.loggedOut, false);
    assert.deepEqual(accountKeysInStorage(), []);
    assert.equal(store.readStay(), null, '다른 인스턴스의 읽기 사본이 남았다');
  });

  test('지운 뒤 모든 주제의 구독자에게 알린다', async () => {
    const store = seedEverything();
    const topics = new Set();
    store.subscribe('*', (event) => topics.add(event.topic));
    await store.deleteAllMyData();
    for (const topic of ['status', 'stay', 'tripPlan', 'guardianCopies', 'aiIntroCache', 'notificationSchedule', 'prefs', 'todayEvents']) {
      assert.ok(topics.has(topic), `${topic} 알림이 없다`);
    }
  });
});

// ── 규칙 42: 출국 7일 후 첫 실행 삭제 ────────────────────────────────

describe('규칙 42 — 출국일+7일이 지난 뒤 앱을 열면 그 계정 체류 데이터를 지운다', () => {
  // 테스트 체류 출국일 2026-10-08 → 기준일 2026-10-15 (KST)
  function seed() {
    const store = signedIn(KEY_A);
    store.writeStay(makeStay({ periods: [selfPeriod()] }));
    store.upsertLinkedPlan(linkedPlanFixture());
    store.writeTripPlan(tripPlanFixture());
    store.writePrefs({ notifications: true });
    store.confirmDailyCheck('2026-10-02');
    store.writeAiIntro('k', { text: 'x', source: 'AI' });
    store.writeNotificationSchedule([{ id: 'n1', at: '2026-10-02T17:00:00+09:00' }]);
    store.appendTodayEvent({ type: 'WEATHER' });
    return store;
  }

  test('기본값은 7일이다 (DEFAULTS.stay.deleteAfterDepartureDays)', () => {
    assert.equal(DEFAULTS.stay.deleteAfterDepartureDays, 7);
  });

  test('출국일+6일(KST 23:59)에는 지우지 않는다', () => {
    seed();
    clock = Date.parse('2026-10-14T14:59:00Z'); // 10-14 23:59 KST
    const store = makeStore();
    const result = store.onAppOpen();
    assert.equal(result.autoDeletedAccounts, 0);
    store.setOnline(true);
    store.setSession(sessionFor(KEY_A));
    assert.ok(store.readStay());
  });

  test('출국일+7일(KST 00:00) 첫 실행에서 체류·조건·일정·동의·알림 예약·AI 캐시를 모두 지운다', () => {
    seed();
    clock = Date.parse('2026-10-14T15:00:00Z'); // 10-15 00:00 KST
    const store = makeStore(); // 로그인 확인 전(보기 전용)에도 동작해야 한다
    const result = store.onAppOpen();
    assert.equal(result.autoDeletedAccounts, 1);
    assert.equal(result.activeAccountDeleted, true);

    for (const record of ['stay', 'tripPlan', 'todayEvents', 'aiIntroCache', 'notificationSchedule']) {
      assert.equal(local.getItem(accountRecordKey(KEY_A, record)), null, `${record} 가 남았다`);
    }
    assert.equal(local.text().includes('DEMO-A'), false, '연결 코드가 남았다');
    assert.equal(local.text().includes('consent-v1'), false, '동의 기록이 남았다');
    assert.deepEqual(store.readPrefs().dailyCheck, {}, '매일 확인 기록이 남았다');
    assert.equal(store.readPrefs().notifications, true, '알림 켜기 설정은 체류 데이터가 아니다');

    // 두 번째 실행은 할 일이 없다
    assert.equal(store.onAppOpen().autoDeletedAccounts, 0);
  });

  test('활성 계정이 아니어도 기기의 모든 이름공간을 같은 기준으로 확인한다', () => {
    seed();
    const store = signedIn(KEY_B);
    store.writeStay(makeStay({ departure: { date: '2026-10-20', time: '18:00', airport: 'ICN' } }));

    clock = Date.parse('2026-10-15T03:00:00Z');
    const result = makeStore().onAppOpen();
    assert.equal(result.autoDeletedAccounts, 1);
    assert.equal(local.getItem(accountRecordKey(KEY_A, 'stay')), null);
    assert.ok(local.getItem(accountRecordKey(KEY_B, 'stay')), '출국 전인 계정까지 지웠다');
  });

  test('앱을 열 때 만료된 보호자 사본과 지난 오늘 사건도 정리한다', () => {
    const store = signedIn(KEY_A);
    store.writeGuardianCopy('old', guardianCopy({ expiresAt: '2026-10-02T13:00:00+09:00' }));
    store.appendTodayEvent({ type: 'WEATHER' });
    clock = Date.parse('2026-10-03T03:00:00Z');
    const result = makeStore().onAppOpen();
    assert.equal(result.expiredGuardianCopies, 1);
    assert.equal(result.staleTodayEvents, 1);
    assert.equal(local.getItem(accountRecordKey(KEY_A, 'todayEvents')), null);
  });

  test('새 여행을 위해 현재 체류를 지우면 같은 범위가 지워진다', () => {
    const store = seed();
    assert.deepEqual(store.deleteStay(), { ok: true });
    assert.equal(store.readStay(), null);
    assert.equal(store.readTripPlan(), null);
    assert.deepEqual(store.readNotificationSchedule(), []);
  });
});

// ── 보호자 링크 임시 보관 (spec 4.11) ────────────────────────────────

describe('보호자 링크 로그인 왕복 임시 보관', () => {
  const FRAGMENT = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4v';

  test('탭 저장소에 암호문과 보관 시각만 둔다', () => {
    const store = makeStore();
    assert.deepEqual(store.holdPendingGuardianLink(`#${FRAGMENT}`), { ok: true });
    const raw = JSON.parse(tab.getItem(PENDING_GUARDIAN_LINK_KEY));
    assert.deepEqual(Object.keys(raw).sort(), ['fragment', 'savedAt']);
    assert.equal(raw.fragment, FRAGMENT);
    assert.equal(local.length, 0, '영구 저장소에 암호문이 들어갔다');
  });

  test('가져오기가 끝날 때까지 다시 읽을 수 있고, clear 로 지운다', () => {
    const store = makeStore();
    store.holdPendingGuardianLink(FRAGMENT);
    assert.equal(store.takePendingGuardianLink(), FRAGMENT);
    assert.equal(store.takePendingGuardianLink(), FRAGMENT, 'PIN 입력 중 새로고침하면 다시 읽을 수 있어야 한다');
    store.clearPendingGuardianLink();
    assert.equal(store.takePendingGuardianLink(), null);
    assert.equal(tab.getItem(PENDING_GUARDIAN_LINK_KEY), null);
  });

  test('1시간이 지나면 읽지 못하고 지워진다', () => {
    const store = makeStore();
    store.holdPendingGuardianLink(FRAGMENT);
    clock += PENDING_GUARDIAN_LINK_TTL_MS - 1;
    assert.equal(store.takePendingGuardianLink(), FRAGMENT);
    clock += 1;
    assert.equal(store.takePendingGuardianLink(), null);
    assert.equal(tab.getItem(PENDING_GUARDIAN_LINK_KEY), null);
    assert.equal(PENDING_GUARDIAN_LINK_TTL_MS, 60 * 60 * 1000);
  });

  test('암호문 형식(base64url)이 아니면 보관하지 않는다', () => {
    const store = makeStore();
    for (const bad of ['', '#', 'pin=123456', '{"days":[]}', 'a b', null, 42]) {
      assert.equal(store.holdPendingGuardianLink(bad).code, STORE_ERROR.INVALID, String(bad));
    }
    assert.equal(tab.length, 0);
  });

  test('보관 시각이 미래이거나 형식이 깨진 기록은 버린다', () => {
    tab.setItem(PENDING_GUARDIAN_LINK_KEY, JSON.stringify({ fragment: FRAGMENT, savedAt: clock + HOUR }));
    assert.equal(takePendingGuardianLink(tab, clock), null);
    tab.setItem(PENDING_GUARDIAN_LINK_KEY, 'garbage');
    assert.equal(takePendingGuardianLink(tab, clock), null);
    assert.equal(tab.getItem(PENDING_GUARDIAN_LINK_KEY), null);
  });

  test('모듈 함수로도 같은 규칙을 쓴다', () => {
    assert.deepEqual(holdPendingGuardianLink(tab, FRAGMENT, clock), { ok: true });
    assert.equal(takePendingGuardianLink(tab, clock + 10), FRAGMENT);
  });
});

// ── 일정 지문 ─────────────────────────────────────────────────────

describe('일정 지문 planFingerprint', () => {
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');

  test('객체 키 순서와 무관하다', async () => {
    const a = { lang: 'en', days: [{ date: '2026-10-02', escortRequired: true, patientReturn: [{ by: '18:00', placeName: '병원', placeAddress: null }] }], emergency: ['119', '1330'] };
    const b = { emergency: ['119', '1330'], days: [{ patientReturn: [{ placeAddress: null, placeName: '병원', by: '18:00' }], escortRequired: true, date: '2026-10-02' }], lang: 'en' };
    assert.equal(await planFingerprint(a), await planFingerprint(b));
  });

  test('정규화된 JSON 의 SHA-256 16진수다', async () => {
    const value = { b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } };
    assert.equal(canonicalJson(value), '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
    assert.equal(await planFingerprint(value), sha256(canonicalJson(value)));
    assert.match(await planFingerprint(value), /^[0-9a-f]{64}$/);
    assert.equal(await planFingerprint({}), sha256('{}'));
  });

  test('배열 순서와 값이 바뀌면 지문이 바뀐다', async () => {
    const base = await planFingerprint({ days: [{ date: '2026-10-02' }, { date: '2026-10-03' }] });
    assert.notEqual(await planFingerprint({ days: [{ date: '2026-10-03' }, { date: '2026-10-02' }] }), base);
    assert.notEqual(await planFingerprint({ days: [{ date: '2026-10-02' }, { date: '2026-10-04' }] }), base);
  });

  test('JSON 과 같은 규칙으로 undefined 를 다룬다', async () => {
    assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalJson([undefined, 1]), '[null,1]');
    assert.equal(canonicalJson({ n: Number.NaN }), '{"n":null}');
    assert.equal(await planFingerprint({ a: undefined, b: 1 }), await planFingerprint({ b: 1 }));
  });

  test('순환 참조는 거부한다', async () => {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    assert.throws(() => canonicalJson(cyclic), TypeError);
    await assert.rejects(planFingerprint(cyclic), TypeError);
  });
});

// ── 서버 렌더링 인스턴스 ───────────────────────────────────────────

describe('getStore — 서버 렌더링 중', () => {
  test('비어 있는 잠긴 인스턴스다 — 요청 사이에 데이터가 섞이지 않는다', () => {
    assert.equal(typeof window, 'undefined');
    const store = getStore();
    assert.equal(getStore(), store, '같은 인스턴스를 돌려준다');
    store.setSession(sessionFor(KEY_A));
    const status = store.getStatus();
    assert.equal(status.readOnly, true);
    assert.equal(status.accountKey, null);
    assert.equal(status.persistent, false);
    assert.equal(store.writeStay(makeStay()).code, STORE_ERROR.READ_ONLY);
    assert.equal(store.writeLang('ko').code, STORE_ERROR.READ_ONLY);
    assert.equal(store.holdPendingGuardianLink('abc').code, STORE_ERROR.READ_ONLY);
    assert.equal(store.readStay(), null);
    assert.equal(store.readLastAccountKey(), null);
  });
});
