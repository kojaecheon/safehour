// 보호자 화면 부품·도우미 모음 (AX-320 · docs/business-rules.md '보호자')
//
// 오늘 화면이 '보호자 링크 다시 보내기'를 안내할 때는 useGuardianResendNeeded() 를 쓴다
// (판단 함수 isGuardianResendNeeded 하나를 링크 만들기 화면과 함께 쓴다).

export { default as GuardianCreate } from './GuardianCreate.js';
export { default as GuardianOpen } from './GuardianOpen.js';
export { default as GuardianCopyView } from './GuardianCopyView.js';
export { useGuardianResendNeeded } from './hooks.js';
export { buildShareSnapshot, computeShareFingerprint, fingerprintContent, isGuardianResendNeeded, isGuardianWindowPassed, shareLang, shareRecordFor } from './share.js';
export { GUARDIAN_PIN_LOCK_PREFIX, createGuardianLockout, createLockoutStorage } from './lockoutStorage.js';
export { guardianErrorView } from './errorView.js';
