// 보호자 화면의 순수 도우미 (AX-320 · spec 4.11, 4.19, 5.1 guardianShare, 규칙 37·38·41)
//
// 화면(/guardian, /g)이 쓰는 도우미만 검증한다. 암호화·스냅샷 자체는 AX-313 테스트가 고정한다.
//   - 일정 지문 내용: 만든 시각·만료 시각을 빼고, 보낸 날부터의 날짜만 담는다 → 날이 바뀌어도 지문이 그대로
//   - '보호자 링크 다시 보내기' 판단: 보낸 뒤 보호자 몫 내용이 바뀌었을 때만
//   - PIN 잠금 저장소: 키가 저장소 접두사(safehour.v2.) 아래 → '내 정보 지우기'가 함께 지운다
//   - 오류 → 사용자 문구 키 대응

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARDIAN_ERROR,
  GuardianError,
  buildGuardianSnapshot,
  encryptSnapshot,
  unlockSnapshot,
} from '../src/guardian/index.js';
import { DEFAULTS } from '../src/stay/index.js';
import { FINGERPRINT_PATTERN, STORE_PREFIX, createMemoryStorage, createStore, planFingerprint } from '../lib/store/index.js';
import {
  GUARDIAN_PIN_LOCK_PREFIX,
  createGuardianLockout,
  createLockoutStorage,
} from '../components/guardian/lockoutStorage.js';
import {
  computeShareFingerprint,
  fingerprintContent,
  isGuardianResendNeeded,
  isGuardianWindowPassed,
  shareLang,
} from '../components/guardian/share.js';
import { copyIdFor, guardianErrorView, kstClock, kstDate } from '../components/guardian/errorView.js';
import { patientReturnStatus } from '../components/guardian/returnStatus.js';
import { makeGuardianStay, makeTripPlan, guardianOuting } from './guardian-fixtures.js';

const HOUR = 60 * 60 * 1000;
const T0 = '2026-10-02T10:00:00+09:00';

function stayAndPlan() {
  return { stay: makeGuardianStay({ guardianShare: null }), tripPlan: makeTripPlan() };
}

/** 링크를 만든 순간의 guardianShare — 화면과 같은 방법으로 만든다 */
async function sentShare({ stay, tripPlan }, now = T0) {
  const snapshot = buildGuardianSnapshot({ stay, tripPlan, now, lang: shareLang(tripPlan) });
  return { lastSentAt: snapshot.createdAt, planFingerprint: await planFingerprint(fingerprintContent(snapshot)) };
}

describe('일정 지문 내용 (spec 5.1 guardianShare.planFingerprint)', () => {
  test('만든 시각·만료 시각은 빠지고, 날짜·언어·긴급 번호만 담는다', () => {
    const { stay, tripPlan } = stayAndPlan();
    const snapshot = buildGuardianSnapshot({ stay, tripPlan, now: T0 });
    const content = fingerprintContent(snapshot);
    assert.deepEqual(Object.keys(content).sort(), ['days', 'emergency', 'lang', 'v']);
    assert.equal('createdAt' in content, false);
    assert.equal('expiresAt' in content, false);
    assert.deepEqual(content.days, snapshot.days);
  });

  test('같은 내용이면 만든 시각이 달라도 지문이 같다 (같은 날 여러 번 만들어도)', async () => {
    const { stay, tripPlan } = stayAndPlan();
    const a = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-02T09:00:00+09:00' });
    const b = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-02T21:30:00+09:00' });
    assert.notEqual(a.createdAt, b.createdAt);
    assert.equal(await planFingerprint(fingerprintContent(a)), await planFingerprint(fingerprintContent(b)));
  });

  test('fromDate 를 주면 그 날짜 이후만 담는다', () => {
    const { stay, tripPlan } = stayAndPlan();
    // 09-28 에 만들면 7일 범위(09-28~10-04) 안의 체류 날짜 10-01~10-04 를 담는다
    const snapshot = buildGuardianSnapshot({ stay, tripPlan, now: '2026-09-28T09:00:00+09:00' });
    const content = fingerprintContent(snapshot, { fromDate: '2026-10-04' });
    assert.ok(content.days.length > 0);
    assert.ok(content.days.every((d) => d.date >= '2026-10-04'));
  });

  test('지문 형식은 저장소가 받는 64자 16진수다', async () => {
    const { stay, tripPlan } = stayAndPlan();
    const share = await sentShare({ stay, tripPlan });
    assert.match(share.planFingerprint, FINGERPRINT_PATTERN);
    assert.equal(await computeShareFingerprint({ stay, tripPlan, since: share.lastSentAt }), share.planFingerprint);
  });

  test('스냅샷이 아니면 TypeError', () => {
    assert.throws(() => fingerprintContent(null), TypeError);
    assert.throws(() => fingerprintContent({ days: 'x' }), TypeError);
  });

  test('언어: 일정 언어가 지원 언어면 그것, 아니면 ko', () => {
    assert.equal(shareLang({ lang: 'ja' }), 'ja');
    assert.equal(shareLang({ lang: 'fr' }), 'ko');
    assert.equal(shareLang(null), 'ko');
  });
});

describe("'보호자 링크 다시 보내기' 판단", () => {
  test('보낸 적이 없으면 다시 보낼 것도 없다', async () => {
    const { stay, tripPlan } = stayAndPlan();
    assert.equal(await isGuardianResendNeeded({ stay, tripPlan, share: null }), false);
  });

  test('보낸 뒤 바뀐 것이 없으면 false — 날이 바뀌어도 그대로다(판단이 지금 시각에 기대지 않는다)', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    assert.equal(await isGuardianResendNeeded({ ...pair, share }), false);
    // 같은 데이터, 여러 날 뒤에 다시 판단해도 결과가 같다
    assert.equal(await isGuardianResendNeeded({ ...pair, share }), false);
  });

  test('보낸 날 이후 보호자 일정이 바뀌면 true', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    const changed = structuredClone(pair.tripPlan);
    changed.days['2026-10-04'].guardianOutings = [guardianOuting('2026-10-04', { returnBy: '15:00' })];
    assert.equal(await isGuardianResendNeeded({ stay: pair.stay, tripPlan: changed, share }), true);
  });

  test('환자 복귀 마감이 바뀌면 true', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    const changed = structuredClone(pair.tripPlan);
    changed.days['2026-10-06'].outings[0].returnBy = '11:30';
    assert.equal(await isGuardianResendNeeded({ stay: pair.stay, tripPlan: changed, share }), true);
  });

  test('숙소 이름이 바뀌면(복귀 장소 이름) true', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    const stay = structuredClone(pair.stay);
    stay.lodgings[1].name = '가상 숙소 셋';
    assert.equal(await isGuardianResendNeeded({ stay, tripPlan: pair.tripPlan, share }), true);
  });

  test('보낸 날보다 이른 날짜의 변화는 보호자 사본에 없으므로 무시한다', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair, '2026-10-04T08:00:00+09:00');
    const changed = structuredClone(pair.tripPlan);
    changed.days['2026-10-01'].outings[0].returnBy = '15:00';
    assert.equal(await isGuardianResendNeeded({ stay: pair.stay, tripPlan: changed, share }), false);
  });

  test('보호자 사본에 없는 값(병원 이름, 조건 세부, 마감 이유)만 바뀌면 false', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    const stay = structuredClone(pair.stay);
    stay.hospitals[0].name = 'FORBIDDEN_OTHER_HOSPITAL';
    const tripPlan = structuredClone(pair.tripPlan);
    tripPlan.days['2026-10-04'].guardianOutings[0].deadlineReason = 'MEDICATION';
    tripPlan.days['2026-10-04'].mealSlots = [];
    assert.equal(await isGuardianResendNeeded({ stay, tripPlan, share }), false);
  });

  test('저장된 기록이 깨졌으면 무엇을 보냈는지 알 수 없으므로 true', async () => {
    const pair = stayAndPlan();
    assert.equal(await isGuardianResendNeeded({ ...pair, share: { lastSentAt: 'x', planFingerprint: 'y' } }), true);
  });

  test('체류·일정이 없으면 false (링크를 만들 수도 없다)', async () => {
    const pair = stayAndPlan();
    const share = await sentShare(pair);
    assert.equal(await isGuardianResendNeeded({ stay: null, tripPlan: pair.tripPlan, share }), false);
    assert.equal(await isGuardianResendNeeded({ stay: pair.stay, tripPlan: null, share }), false);
  });
});

describe('PIN 잠금 저장소 (spec 4.11 · 4.19 · 규칙 37·41)', () => {
  const FRAGMENT = 'Q'.repeat(120);

  function clock(t = Date.parse(T0)) {
    const c = { t, now: () => c.t };
    return c;
  }

  test('키는 저장소 접두사 safehour.v2. 아래에 있고 암호문을 담지 않는다', async () => {
    const storage = createMemoryStorage();
    const lockout = createGuardianLockout(storage);
    await lockout.recordFailure(FRAGMENT);
    const keys = [...Array(storage.length).keys()].map((i) => storage.key(i));
    assert.equal(keys.length, 1);
    assert.ok(keys[0].startsWith(STORE_PREFIX));
    assert.ok(keys[0].startsWith(GUARDIAN_PIN_LOCK_PREFIX));
    assert.equal(keys[0].includes(FRAGMENT), false);
    assert.equal(storage.getItem(keys[0]).includes(FRAGMENT), false);
  });

  test('5회 틀리면 1시간 잠기고, 새로고침(새 인스턴스)에도 잠금이 남는다', async () => {
    const storage = createMemoryStorage();
    const c = clock();
    const first = createGuardianLockout(storage, { now: c.now });
    let status;
    for (let i = 0; i < DEFAULTS.guardianPin.maxAttempts; i += 1) status = await first.recordFailure(FRAGMENT);
    assert.equal(status.locked, true);
    assert.equal(status.lockedUntil, c.t + DEFAULTS.guardianPin.lockMin * 60 * 1000);

    const reloaded = createGuardianLockout(storage, { now: c.now });
    assert.equal((await reloaded.status(FRAGMENT)).locked, true);
    c.t += HOUR;
    assert.equal((await reloaded.status(FRAGMENT)).locked, false);
  });

  test("'이 기기에서 내 정보 지우기'가 잠금 기록도 지운다", async () => {
    const storage = createMemoryStorage();
    const lockout = createGuardianLockout(storage);
    await lockout.recordFailure(FRAGMENT);
    const store = createStore({ storage, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
    const result = await store.deleteAllMyData();
    assert.equal(result.ok, true);
    assert.equal((await createGuardianLockout(storage).status(FRAGMENT)).failures, 0);
    const left = [...Array(storage.length).keys()].map((i) => storage.key(i)).filter((k) => k.startsWith(GUARDIAN_PIN_LOCK_PREFIX));
    assert.deepEqual(left, []);
  });

  test('영구 저장소가 없거나 쓰기가 막혀도 이 화면 안에서는 잠금이 동작한다', async () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    for (const storage of [null, broken]) {
      const lockout = createGuardianLockout(storage);
      let status;
      for (let i = 0; i < DEFAULTS.guardianPin.maxAttempts; i += 1) status = await lockout.recordFailure(FRAGMENT);
      assert.equal(status.locked, true);
      assert.equal((await lockout.status(FRAGMENT)).locked, true);
    }
  });

  test('영구 저장소에 쓴 뒤 다른 곳에서 지우면(내 정보 지우기) 메모리 사본이 잠금을 되살리지 않는다', async () => {
    const storage = createMemoryStorage();
    const lockout = createGuardianLockout(storage);
    await lockout.recordFailure(FRAGMENT);
    storage.clear();
    assert.equal((await lockout.status(FRAGMENT)).failures, 0);
  });

  test('접두사 밖 키는 읽거나 쓰지 않는다', () => {
    const adapter = createLockoutStorage(createMemoryStorage());
    assert.throws(() => adapter.setItem('safehour.v2.device.lang', 'ko'), TypeError);
    assert.throws(() => adapter.getItem('other'), TypeError);
    assert.throws(() => adapter.removeItem(`${STORE_PREFIX}abc`), TypeError);
  });

  test('unlockSnapshot 과 함께 쓴다: 틀린 PIN 2번 뒤 맞는 PIN → 기록이 지워진다', async () => {
    const storage = createMemoryStorage();
    const lockout = createGuardianLockout(storage);
    const { stay, tripPlan } = stayAndPlan();
    const snapshot = buildGuardianSnapshot({ stay, tripPlan, now: T0 });
    const fragment = await encryptSnapshot(snapshot, '246810');
    await assert.rejects(unlockSnapshot(fragment, '000000', { lockout, now: T0 }), (e) => e.code === GUARDIAN_ERROR.WRONG_PIN && e.remainingAttempts === 4);
    await assert.rejects(unlockSnapshot(fragment, '111111', { lockout, now: T0 }), (e) => e.remainingAttempts === 3);
    const opened = await unlockSnapshot(fragment, '246810', { lockout, now: T0 });
    assert.deepEqual(opened.days, snapshot.days);
    assert.equal(storage.length, 0);
  });
});

describe('오류 → 사용자 문구 (spec 4.11)', () => {
  const err = (code, details) => new GuardianError(code, 'x', details);

  test('틀린 PIN: 남은 횟수와 잠금 시간을 알려 준다', () => {
    const view = guardianErrorView(err(GUARDIAN_ERROR.WRONG_PIN, { remainingAttempts: 3, lockedUntil: null }));
    assert.equal(view.key, 'guardian.errWrongPin');
    assert.deepEqual(view.vars, { n: 3, minutes: DEFAULTS.guardianPin.lockMin });
    assert.equal(view.locked, false);
  });

  test('틀린 PIN 으로 잠기면 잠금 문구와 풀리는 시각(한국 시각)', () => {
    const until = Date.parse('2026-10-02T11:05:00+09:00');
    const view = guardianErrorView(err(GUARDIAN_ERROR.WRONG_PIN, { remainingAttempts: 0, lockedUntil: until }));
    assert.equal(view.key, 'guardian.errLocked');
    assert.deepEqual(view.vars, { time: '11:05' });
    assert.equal(view.locked, true);
  });

  test('잠김: 풀리는 시각, 시각을 모르면 시각 없는 문구', () => {
    const until = Date.parse('2026-10-02T23:40:00+09:00');
    assert.deepEqual(guardianErrorView(err(GUARDIAN_ERROR.LOCKED, { lockedUntil: until })), {
      key: 'guardian.errLocked',
      vars: { time: '23:40' },
      locked: true,
    });
    assert.equal(guardianErrorView(err(GUARDIAN_ERROR.LOCKED, {})).key, 'guardian.errLockedLater');
  });

  test('코드별 문구', () => {
    const cases = [
      [GUARDIAN_ERROR.EXPIRED, 'guardian.errExpired'],
      [GUARDIAN_ERROR.INVALID_LINK, 'guardian.errInvalidLink'],
      [GUARDIAN_ERROR.INVALID_SNAPSHOT, 'guardian.errInvalidLink'],
      [GUARDIAN_ERROR.UNSUPPORTED_FORMAT, 'guardian.errUnsupported'],
      [GUARDIAN_ERROR.CRYPTO_UNAVAILABLE, 'guardian.errCrypto'],
      [GUARDIAN_ERROR.INVALID_PIN, 'guardian.errPinFormat'],
    ];
    for (const [code, key] of cases) assert.equal(guardianErrorView(err(code)).key, key, code);
  });

  test('모르는 오류는 일반 문구 — 오류 내용을 화면에 옮기지 않는다', () => {
    const view = guardianErrorView(new Error('secret FRAGMENT text'));
    assert.deepEqual(view, { key: 'guardian.errUnknown', vars: undefined, locked: false });
  });

  test('한국 시각 도우미', () => {
    assert.equal(kstClock(Date.parse('2026-10-02T00:30:00Z')), '09:30');
    assert.equal(kstDate(Date.parse('2026-10-02T15:30:00Z')), '2026-10-03');
    assert.equal(kstClock(Number.NaN), null);
  });

  test('사본 id 는 암호문의 SHA-256 16진수 — 암호문 자체가 아니다', async () => {
    const id = await copyIdFor('Q'.repeat(120));
    assert.match(id, /^[0-9a-f]{64}$/);
    assert.equal(await copyIdFor('Q'.repeat(120)), id);
    assert.notEqual(await copyIdFor('R'.repeat(120)), id);
  });
});

describe('patientReturnStatus (받은 일정 마감 지남 표시)', () => {
  const now = Date.parse('2026-11-06T06:30:00Z'); // KST 2026-11-06 15:30

  test('오늘 지난 마감은 PASSED, 아직은 UPCOMING, 다른 날짜는 null', () => {
    assert.equal(patientReturnStatus({ date: '2026-11-06', by: '15:30', nowMs: now }), 'PASSED');
    assert.equal(patientReturnStatus({ date: '2026-11-06', by: '14:00', nowMs: now }), 'PASSED');
    assert.equal(patientReturnStatus({ date: '2026-11-06', by: '15:31', nowMs: now }), 'UPCOMING');
    assert.equal(patientReturnStatus({ date: '2026-11-07', by: '10:00', nowMs: now }), null);
    assert.equal(patientReturnStatus({ date: '2026-11-05', by: '10:00', nowMs: now }), null);
  });

  test('KST 기준 오늘', () => {
    const late = Date.parse('2026-11-06T15:30:00Z'); // KST 2026-11-07 00:30
    assert.equal(patientReturnStatus({ date: '2026-11-07', by: '00:10', nowMs: late }), 'PASSED');
    assert.equal(patientReturnStatus({ date: '2026-11-06', by: '23:00', nowMs: late }), null);
  });

  test('깨진 by 는 null', () => {
    for (const by of [null, undefined, '', '25:00', '9:00', '12:60', '12:3x']) {
      assert.equal(patientReturnStatus({ date: '2026-11-06', by, nowMs: now }), null);
    }
  });

  test('깨진 nowMs 나 date 는 null', () => {
    assert.equal(patientReturnStatus({ date: '2026-11-06', by: '10:00', nowMs: NaN }), null);
    assert.equal(patientReturnStatus({ date: 'x', by: '10:00', nowMs: now }), null);
  });
});

describe("'다음 7일 링크 다시 보내기' 판단 (보낸 링크의 범위가 지남)", () => {
  // 체류 10-01~10-08. 10-01 에 보내면 10-01~10-07 을 담고 10-08 은 범위 밖이다
  const SENT = '2026-10-01T09:00:00+09:00';
  const share = { lastSentAt: SENT, planFingerprint: 'a'.repeat(64) };
  const passed = (now, s = share) => isGuardianWindowPassed({ ...stayAndPlan(), share: s, now });

  test('범위 마지막 날까지는 false, 다음 날(KST)부터 true', () => {
    assert.equal(passed('2026-10-06T12:00:00+09:00'), false);
    assert.equal(passed('2026-10-07T23:59:00+09:00'), false, '마지막 날 당일');
    assert.equal(passed('2026-10-07T14:59:00Z'), false, 'KST 10-07 23:59');
    assert.equal(passed('2026-10-07T15:00:00Z'), true, 'KST 10-08 00:00');
    assert.equal(passed('2026-10-08T10:00:00+09:00'), true);
  });

  test('체류가 끝났으면(출국일 지남) false', () => {
    assert.equal(passed('2026-10-09T10:00:00+09:00'), false);
  });

  test('보낸 링크가 출국일까지 담았으면 범위가 지나도 false', () => {
    const late = { lastSentAt: '2026-10-02T09:00:00+09:00', planFingerprint: 'a'.repeat(64) };
    assert.equal(passed('2026-10-08T10:00:00+09:00', late), false);
  });

  test('입국 전에 보낸 링크는 입국일부터 7일 범위로 판단한다', () => {
    const early = { lastSentAt: '2026-09-01T09:00:00+09:00', planFingerprint: 'a'.repeat(64) };
    assert.equal(passed('2026-10-07T10:00:00+09:00', early), false);
    assert.equal(passed('2026-10-08T10:00:00+09:00', early), true);
  });

  test('보낸 적 없음, 체류·일정 없음, 깨진 기록은 false', () => {
    const { stay, tripPlan } = stayAndPlan();
    const now = '2026-10-08T10:00:00+09:00';
    assert.equal(isGuardianWindowPassed({ stay, tripPlan, share: null, now }), false);
    assert.equal(isGuardianWindowPassed({ stay: null, tripPlan, share, now }), false);
    assert.equal(isGuardianWindowPassed({ stay, tripPlan: null, share, now }), false);
    assert.equal(isGuardianWindowPassed({ stay, tripPlan, share: { lastSentAt: 'x', planFingerprint: 'a'.repeat(64) }, now }), false);
  });

  test('일정 변화 판단(isGuardianResendNeeded)은 이 판단과 따로이고 지금 시각에 기대지 않는다', async () => {
    const pair = stayAndPlan();
    const sent = await sentShare(pair, SENT);
    assert.equal(await isGuardianResendNeeded({ ...pair, share: sent }), false);
    assert.equal(isGuardianWindowPassed({ ...pair, share: sent, now: '2026-10-08T10:00:00+09:00' }), true);
  });
});
