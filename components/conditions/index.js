// 조건·동의·병원 연동 부품 모음 (AX-315)
//
//   import { ConsentWithdraw } from '@/components/conditions/index.js';   // /conditions 에서 동의 철회
//
// 부품은 저장소(lib/store)에만 쓴다. 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다.

export { default as ConsentPanel, LegalReviewBadge } from './ConsentPanel.js';
export { default as ConsentWithdraw } from './ConsentWithdraw.js';
export { default as PeriodEditorForm } from './PeriodEditorForm.js';
export { default as PeriodCard } from './PeriodCard.js';
export { default as DayConditions } from './DayConditions.js';
export { default as CoverageTag, COVERAGE_LABEL } from './CoverageTag.js';
export { default as ChoiceInput } from './ChoiceInput.js';
export { default as SafetyText } from './SafetyText.js';
export { default as useStay, useHydrated, useNowMs } from './useStay.js';
export { CONSENT_VERSION } from './consent.js';
