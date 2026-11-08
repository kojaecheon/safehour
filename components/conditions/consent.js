// 민감정보 동의 문구 버전 (AX-315 · spec 4.19)
//
// 동의 문구 본문은 src/i18n/messages/conditions.js 의 safety 구역(`conditions.consent*`)에 있다.
// 문구를 바꾸면 이 버전을 올린다 — 기기에는 동의한 버전과 시각이 남는다(grantSensitiveConsent).
// 이 문구는 **법무 검토 전 초안**이다(HUMAN_ACTIONS 5번). 내부 표시라 화면 배지나 버전 문자열로 보이지 않는다
// (운영자 결정 2026-11-08). 공개 전 법무 검토를 마치면 버전을 올린다.

export const CONSENT_VERSION = 'sensitive-2026-09-draft1';

/** 동의 문구 본문 키 — 화면 표시 순서 */
export const CONSENT_TEXT_KEYS = Object.freeze([
  'conditions.consentWhat',
  'conditions.consentWhere',
  'conditions.consentKeep',
  'conditions.consentRefuseEffect',
]);
