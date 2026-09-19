'use client';

// 체류 설정 단계 표시 (AX-314)
//
// - 지난 단계: 체크 아이콘(누르면 돌아간다) / 지금 단계: 채운 원 + 굵은 숫자 / 가 본 단계: 숫자(누르면 간다)
//   / 아직 안 간 단계: 옅은 파선 원. 모양이 서로 달라 색만으로 구분하지 않는다.
// - 360px 에서 5칸이 한 줄에 들어가도록 숫자만 보인다. 단계 이름은 스크린리더용 글자와 단계 제목(h2)이 알린다.
// - 칸마다 44px 이상이다.

import { useLang } from '../LanguageProvider.js';
import { Icon } from '../ui/index.js';
import { STEPS, STEP_LABEL_KEY } from './draft.js';

export default function StepIndicator({ step, furthest, onGo }) {
  const { t } = useLang();
  return (
    <nav className="onboarding-steps" aria-label={t('onboarding.stepsAria')}>
      <p className="onboarding-steps-count">{t('onboarding.stepCounter', { n: step + 1, total: STEPS.length })}</p>
      <ol role="list">
        {STEPS.map((name, index) => {
          const label = `${index + 1}. ${t(STEP_LABEL_KEY[name])}`;
          let state = 'upcoming';
          if (index === step) state = 'current';
          else if (index < step) state = 'done';
          else if (index <= furthest) state = 'visited';
          const suffix =
            state === 'current' ? t('onboarding.stepCurrent') : state === 'done' ? t('onboarding.stepDone') : null;
          const content = (
            <>
              <span className="onboarding-steps-mark" aria-hidden="true">
                {state === 'done' ? <Icon name="check" size={18} strokeWidth={2.8} /> : index + 1}
              </span>
              <span className="visually-hidden">{suffix ? `${label} (${suffix})` : label}</span>
            </>
          );
          return (
            <li key={name} className={`onboarding-steps-item is-${state}`}>
              {state === 'done' || state === 'visited' ? (
                <button type="button" onClick={() => onGo(index)}>
                  {content}
                </button>
              ) : (
                <span aria-current={state === 'current' ? 'step' : undefined}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
