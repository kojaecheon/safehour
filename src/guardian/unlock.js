// 잠금과 함께 풀기 — 보호자 기기 흐름의 한 단계 (AX-313 · spec 4.11, 규칙 37)
//
// 순서: PIN 형식 → 암호문 형식 → 잠금 확인 → 복호화 → (틀리면 오류 기록 / 맞으면 기록 삭제) → 만료 확인
// - PIN·링크 형식 오류는 PIN 추측이 아니므로 오류 횟수에 세지 않는다.
// - 잠긴 동안에는 올바른 PIN 이어도 풀지 않는다.
// - 만료된 스냅샷은 돌려주지 않는다(EXPIRED). 이미 저장한 사본의 삭제는 저장소 쪽 몫이다(isSnapshotExpired 로 판정).

import { decryptSnapshot, isGuardianFragment, isValidPin } from './crypto.js';
import { GUARDIAN_ERROR, GuardianError } from './errors.js';
import { isSnapshotExpired, toInstantMs } from './snapshot.js';

/**
 * @param {string} fragment  링크의 # 뒤
 * @param {string} pin
 * @param {{lockout: ReturnType<typeof import('./lockout.js').createPinLockout>, now?: Date|number|string}} options
 *   now 는 만료 판정 시각(없으면 지금)
 * @returns {Promise<import('./snapshot.js').GuardianSnapshot>}
 * @throws {GuardianError}
 *   INVALID_PIN · INVALID_LINK · LOCKED(lockedUntil) · WRONG_PIN(remainingAttempts, lockedUntil) ·
 *   INVALID_SNAPSHOT · EXPIRED · CRYPTO_UNAVAILABLE
 */
export async function unlockSnapshot(fragment, pin, { lockout, now } = {}) {
  if (!lockout || typeof lockout.status !== 'function' || typeof lockout.recordFailure !== 'function' || typeof lockout.recordSuccess !== 'function') {
    throw new TypeError('unlockSnapshot: 잠금 기록기(createPinLockout)가 필요합니다');
  }
  const nowMs = toInstantMs(now, 'now');
  if (!isValidPin(pin)) throw new GuardianError(GUARDIAN_ERROR.INVALID_PIN, 'PIN 은 6자리 숫자여야 합니다');
  if (!isGuardianFragment(fragment)) throw new GuardianError(GUARDIAN_ERROR.INVALID_LINK, '보호자 링크 형식이 올바르지 않습니다');

  const status = await lockout.status(fragment);
  if (status.locked) {
    throw new GuardianError(GUARDIAN_ERROR.LOCKED, '잠시 뒤에 다시 시도하세요', { remainingAttempts: 0, lockedUntil: status.lockedUntil });
  }

  let snapshot;
  try {
    snapshot = await decryptSnapshot(fragment, pin);
  } catch (err) {
    if (err instanceof GuardianError && err.code === GUARDIAN_ERROR.WRONG_PIN) {
      const after = await lockout.recordFailure(fragment);
      throw new GuardianError(GUARDIAN_ERROR.WRONG_PIN, err.message, {
        remainingAttempts: after.remainingAttempts,
        lockedUntil: after.lockedUntil,
      });
    }
    throw err;
  }
  await lockout.recordSuccess(fragment);

  if (isSnapshotExpired(snapshot, nowMs)) {
    throw new GuardianError(GUARDIAN_ERROR.EXPIRED, '보호자 링크가 만료되었습니다');
  }
  return snapshot;
}
