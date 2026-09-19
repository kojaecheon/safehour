// 체류 설정 (AX-314 · spec 3.1 `/onboarding`, 4.1–4.3)
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
