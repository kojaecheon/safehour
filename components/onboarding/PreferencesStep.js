'use client';

// 5단계: 관심사(8개, 0개 이상) · 이동 강도(느긋하게 / 보통) (docs/business-rules.md '체류', src/stay/stay.js @typedef Stay)
//
// 관심사는 체크박스 칩이다. 선택은 테두리 + 바탕 + 체크 아이콘 + 굵기로 보인다(색 단독 금지).
// 강도의 정거장 수 설명은 기본값 파일(DEFAULTS.stopsPerPace)에서 읽는다.
// 강도는 느긋하게(덜 움직이는 쪽)가 미리 골라져 있다(운영자 결정 2026-11-08). 모르면 그대로 두라고 적는다.

import { useLang } from '../LanguageProvider.js';
import { Icon } from '../ui/index.js';
import { DEFAULTS } from '@/src/stay/defaults.js';
import { INTERESTS } from '@/src/stay/stay.js';
import { ChoiceGroup } from './Fields.js';

const INTEREST_LABEL = {
  SHOPPING: 'onboarding.interestSHOPPING',
  KBEAUTY: 'onboarding.interestKBEAUTY',
  PALACE_HISTORY: 'onboarding.interestPALACE_HISTORY',
  CAFE: 'onboarding.interestCAFE',
  EXHIBITION: 'onboarding.interestEXHIBITION',
  FOOD: 'onboarding.interestFOOD',
  NATURE: 'onboarding.interestNATURE',
  FESTIVAL: 'onboarding.interestFESTIVAL',
};

const PACE_LABEL = { RELAXED: 'onboarding.paceRELAXED', NORMAL: 'onboarding.paceNORMAL' };

export default function PreferencesStep({ draft, update, issues }) {
  const { t } = useLang();

  function toggle(tag, checked) {
    update((d) => ({
      ...d,
      interests: checked ? INTERESTS.filter((x) => x === tag || d.interests.includes(x)) : d.interests.filter((x) => x !== tag),
    }));
  }

  return (
    <>
      <fieldset className="onboarding-choice" id="ob-interests">
        <legend>{t('onboarding.interestsLegend')}</legend>
        <ul className="onboarding-chips" role="list">
          {INTERESTS.map((tag) => {
            const checked = draft.interests.includes(tag);
            const inputId = `ob-interest-${tag}`;
            return (
              <li key={tag}>
                <label htmlFor={inputId} className={checked ? 'onboarding-chip is-checked' : 'onboarding-chip'}>
                  <input
                    type="checkbox"
                    id={inputId}
                    checked={checked}
                    onChange={(event) => toggle(tag, event.target.checked)}
                  />
                  <span className="onboarding-chip-mark" aria-hidden="true">
                    {checked ? <Icon name="check" size={16} strokeWidth={2.8} /> : <Icon name="plus" size={16} />}
                  </span>
                  <span>{t(INTEREST_LABEL[tag])}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <ChoiceGroup
        field="pace"
        issues={issues}
        name="ob-pace"
        legend={t('onboarding.paceLegend')}
        hint={t('onboarding.paceDefaultHint')}
        value={draft.pace}
        onChange={(value) => update((d) => ({ ...d, pace: value }))}
        options={Object.entries(PACE_LABEL).map(([value, key]) => ({
          value,
          label: t(key),
          hint: t('onboarding.paceHint', DEFAULTS.stopsPerPace[value]),
        }))}
      />
    </>
  );
}
