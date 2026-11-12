// 체류 설정 (AX-314 · docs/platform/IA_AND_FLOWS.md '경로'의 `/onboarding` 행, docs/business-rules.md '체류'·'숙소와 병원')
//
// 화면 본체는 components/onboarding/OnboardingForm.js 다.
// 수정 진입: `/onboarding?edit=1` (선택: `&returnTo=/more` 같은 같은 출처 경로 — 저장 뒤 돌아갈 곳, 기본 /conditions).
// useSearchParams 는 Suspense 경계를 요구한다 (Next.js App Router).

import { Suspense } from 'react';
import OnboardingForm from '@/components/onboarding/OnboardingForm.js';

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}
