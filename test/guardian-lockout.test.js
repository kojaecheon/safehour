// 보호자 링크 PIN 잠금: 5회 연속 오류 후 1시간 (AX-313 · docs/security.md '보호자 링크', docs/platform/ITINERARY_RULES.md '조정 가능한 기본값'. 테스트 이름의 spec 번호와 규칙 번호(37)는 옛 설계서 번호다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARDIAN_ERROR,
  GuardianError,
  buildGuardianSnapshot,
  createPinLockout,
  encryptSnapshot,
  pinLockoutKey,
  unlockSnapshot,
} from '../src/guardian/index.js';
import { DEFAULTS } from '../src/stay/index.js';
import { makeGuardianStay, makeTripPlan, memoryStorage } from './guardian-fixtures.js';

const HOUR = 60 * 60 * 1000;
const PIN = '314159';
const FRAGMENT = 'Q'.repeat(120);
const OTHER = 'R'.repeat(120);
const T0 = Date.parse('2026-10-02T10:00:00+09:00');

function clock(start = T0) {
  const c = { t: start, now: () => c.t };
  return c;
}

function hasCode(code) {
  return (err) => err instanceof GuardianError && err.code === code;
}

async function failTimes(lockout, fragment, n) {
  let last;
  for (let i = 0; i < n; i += 1) last = await lockout.recordFailure(fragment);
  return last;
}

describe('잠금 기록기', () => {
  test('기본값은 spec 11장(DEFAULTS.guardianPin): 5회 · 1시간', () => {
    const lockout = createPinLockout(memoryStorage());
    assert.equal(DEFAULTS.guardianPin.maxAttempts, 5);
    assert.equal(lockout.maxAttempts, DEFAULTS.guardianPin.maxAttempts);
    assert.equal(lockout.lockMs, DEFAULTS.guardianPin.lockMin * 60 * 1000);
    assert.equal(lockout.lockMs, HOUR);
  });

  test('4회 연속 오류까지는 잠기지 않고, 5회째에 1시간 잠긴다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    assert.deepEqual(await lockout.status(FRAGMENT), { locked: false, failures: 0, remainingAttempts: 5, lockedUntil: null });
    const fourth = await failTimes(lockout, FRAGMENT, 4);
    assert.deepEqual(fourth, { locked: false, failures: 4, remainingAttempts: 1, lockedUntil: null });
    const fifth = await lockout.recordFailure(FRAGMENT);
    assert.deepEqual(fifth, { locked: true, failures: 5, remainingAttempts: 0, lockedUntil: T0 + HOUR });
  });

  test('잠긴 동안의 시도는 잠금을 늘리지 않고, 1시간이 지나면 풀려 다시 5회가 주어진다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    await failTimes(lockout, FRAGMENT, 5);
    c.t = T0 + 30 * 60 * 1000;
    const during = await lockout.recordFailure(FRAGMENT);
    assert.equal(during.locked, true);
    assert.equal(during.lockedUntil, T0 + HOUR);
    c.t = T0 + HOUR - 1;
    assert.equal((await lockout.status(FRAGMENT)).locked, true);
    c.t = T0 + HOUR;
    assert.deepEqual(await lockout.status(FRAGMENT), { locked: false, failures: 0, remainingAttempts: 5, lockedUntil: null });
    assert.equal((await lockout.recordFailure(FRAGMENT)).remainingAttempts, 4);
  });

  test('성공하면 연속 오류 횟수가 처음으로 돌아간다', async () => {
    const lockout = createPinLockout(memoryStorage(), { now: clock().now });
    await failTimes(lockout, FRAGMENT, 4);
    await lockout.recordSuccess(FRAGMENT);
    const after = await failTimes(lockout, FRAGMENT, 4);
    assert.equal(after.locked, false);
    assert.equal(after.remainingAttempts, 1);
  });

  test('링크마다 따로 센다', async () => {
    const lockout = createPinLockout(memoryStorage(), { now: clock().now });
    await failTimes(lockout, FRAGMENT, 5);
    assert.equal((await lockout.status(FRAGMENT)).locked, true);
    assert.equal((await lockout.status(OTHER)).locked, false);
  });

  test('저장소 키와 값에 암호문이 없고, 키는 암호문의 SHA-256 이다', async () => {
    const storage = memoryStorage();
    const lockout = createPinLockout(storage, { now: clock().now });
    await failTimes(lockout, FRAGMENT, 2);
    const [[key, value]] = [...storage.map.entries()];
    assert.equal(key.includes(FRAGMENT.slice(0, 16)), false);
    assert.equal(value.includes(FRAGMENT.slice(0, 16)), false);
    const expectedHash = (await import('node:crypto')).createHash('sha256').update(FRAGMENT).digest('hex');
    assert.equal(key, await pinLockoutKey(FRAGMENT));
    assert.ok(key.endsWith(expectedHash));
  });

  test('비동기 저장소(Promise 를 돌려주는 getItem·setItem·removeItem)도 쓴다', async () => {
    const lockout = createPinLockout(memoryStorage({ async: true }), { now: clock().now });
    const fifth = await failTimes(lockout, FRAGMENT, 5);
    assert.equal(fifth.locked, true);
    await lockout.recordSuccess(FRAGMENT);
    assert.equal((await lockout.status(FRAGMENT)).failures, 0);
  });

  test('횟수·시간을 조정할 수 있다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now, maxAttempts: 3, lockMs: 1000 });
    const third = await failTimes(lockout, FRAGMENT, 3);
    assert.equal(third.locked, true);
    assert.equal(third.lockedUntil, T0 + 1000);
  });

  test('저장소·설정이 틀리면 TypeError', () => {
    assert.throws(() => createPinLockout(null), TypeError);
    assert.throws(() => createPinLockout({ getItem() {} }), TypeError);
    assert.throws(() => createPinLockout(memoryStorage(), { maxAttempts: 0 }), TypeError);
    assert.throws(() => createPinLockout(memoryStorage(), { lockMs: -1 }), TypeError);
  });

  test('깨진 기록은 무시하고 처음부터 센다', async () => {
    const storage = memoryStorage();
    const lockout = createPinLockout(storage, { now: clock().now });
    storage.map.set(await pinLockoutKey(FRAGMENT), '{not json');
    assert.equal((await lockout.status(FRAGMENT)).failures, 0);
  });
});

describe('잠금과 함께 풀기 (unlockSnapshot)', () => {
  function snapshot() {
    return buildGuardianSnapshot({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), now: '2026-10-01T09:30:00+09:00', lang: 'ko' });
  }

  test('올바른 PIN 이면 스냅샷을 돌려주고 오류 횟수를 지운다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(unlockSnapshot(fragment, '000000', { lockout, now: c.t }), hasCode(GUARDIAN_ERROR.WRONG_PIN));
    assert.equal((await lockout.status(fragment)).failures, 1);
    assert.deepEqual(await unlockSnapshot(fragment, PIN, { lockout, now: c.t }), snapshot());
    assert.equal((await lockout.status(fragment)).failures, 0);
  });

  test('틀린 PIN 오류는 남은 횟수를 알려 준다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(
      unlockSnapshot(fragment, '000000', { lockout, now: c.t }),
      (err) => err.code === GUARDIAN_ERROR.WRONG_PIN && err.remainingAttempts === 4 && err.lockedUntil === null,
    );
  });

  test('5회 연속 오류 뒤에는 올바른 PIN 도 1시간 동안 LOCKED, 1시간 뒤에는 열린다 (규칙 37)', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    const fragment = await encryptSnapshot(snapshot(), PIN);
    for (let i = 0; i < 4; i += 1) {
      await assert.rejects(unlockSnapshot(fragment, '000000', { lockout, now: c.t }), hasCode(GUARDIAN_ERROR.WRONG_PIN));
    }
    await assert.rejects(
      unlockSnapshot(fragment, '000000', { lockout, now: c.t }),
      (err) => err.code === GUARDIAN_ERROR.WRONG_PIN && err.remainingAttempts === 0 && err.lockedUntil === T0 + HOUR,
    );
    await assert.rejects(
      unlockSnapshot(fragment, PIN, { lockout, now: c.t }),
      (err) => err.code === GUARDIAN_ERROR.LOCKED && err.lockedUntil === T0 + HOUR,
    );
    c.t = T0 + HOUR - 1;
    await assert.rejects(unlockSnapshot(fragment, PIN, { lockout, now: c.t }), hasCode(GUARDIAN_ERROR.LOCKED));
    c.t = T0 + HOUR;
    assert.deepEqual(await unlockSnapshot(fragment, PIN, { lockout, now: c.t }), snapshot());
  });

  test('PIN 형식 오류·링크 형식 오류는 오류 횟수에 세지 않는다', async () => {
    const c = clock();
    const lockout = createPinLockout(memoryStorage(), { now: c.now });
    const fragment = await encryptSnapshot(snapshot(), PIN);
    for (let i = 0; i < 6; i += 1) {
      await assert.rejects(unlockSnapshot(fragment, '12345', { lockout, now: c.t }), hasCode(GUARDIAN_ERROR.INVALID_PIN));
      await assert.rejects(unlockSnapshot('!!', PIN, { lockout, now: c.t }), hasCode(GUARDIAN_ERROR.INVALID_LINK));
    }
    assert.equal((await lockout.status(fragment)).failures, 0);
  });

  test('만료된 스냅샷은 올바른 PIN 이어도 돌려주지 않는다 (EXPIRED)', async () => {
    const lockout = createPinLockout(memoryStorage(), { now: clock().now });
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(
      unlockSnapshot(fragment, PIN, { lockout, now: '2026-10-08T23:59:00+09:00' }),
      hasCode(GUARDIAN_ERROR.EXPIRED),
    );
    const ok = await unlockSnapshot(fragment, PIN, { lockout, now: '2026-10-08T23:58:00+09:00' });
    assert.equal(ok.v, 1);
  });

  test('잠금 기록기 없이는 풀지 않는다', async () => {
    const fragment = await encryptSnapshot(snapshot(), PIN);
    await assert.rejects(unlockSnapshot(fragment, PIN, {}), TypeError);
  });
});
