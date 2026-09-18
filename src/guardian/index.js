// 보호자 스냅샷과 PIN 암호화 — 공개 진입점 (AX-313 · spec 4.11, 5.4)
//
// 순수 모듈이다. 화면(AX-320)과 저장소(AX-312)가 함께 쓴다.
// 서버로 아무것도 보내지 않고, 브라우저 저장소를 직접 쓰지 않는다(잠금 저장소는 주입).

export { GUARDIAN_ERROR, GuardianError } from './errors.js';
export {
  EMERGENCY_NUMBERS,
  GUARDIAN_LANGS,
  GUARDIAN_SNAPSHOT_VERSION,
  HOSPITAL_RETURN_LABEL,
  buildGuardianSnapshot,
  isSnapshotExpired,
  normalizeGuardianSnapshot,
  toInstantMs,
} from './snapshot.js';
export {
  IV_BYTES,
  PBKDF2_ITERATIONS,
  PIN_LENGTH,
  SALT_BYTES,
  decryptSnapshot,
  encryptSnapshot,
  isGuardianFragment,
  isValidPin,
} from './crypto.js';
export { GUARDIAN_PATH, buildGuardianLink, parseGuardianLink } from './link.js';
export { PIN_LOCKOUT_KEY_PREFIX, createPinLockout, pinLockoutKey } from './lockout.js';
export { unlockSnapshot } from './unlock.js';
