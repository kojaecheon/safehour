'use client';

// 4단계 — 동반 보호자 있음 / 없음 (spec 4.1). 미리 골라 두지 않는다.

import { useLang } from '../LanguageProvider.js';
import { ChoiceGroup } from './Fields.js';

export default function CompanionStep({ draft, update, issues }) {
  const { t } = useLang();
  const value = draft.hasCompanion === true ? 'yes' : draft.hasCompanion === false ? 'no' : null;
  return (
    <ChoiceGroup
      field="hasCompanion"
      issues={issues}
      name="ob-companion"
      legend={t('onboarding.companionLegend')}
      value={value}
      onChange={(next) => update((d) => ({ ...d, hasCompanion: next === 'yes' }))}
      options={[
        { value: 'yes', label: t('onboarding.companionYes') },
        { value: 'no', label: t('onboarding.companionNo') },
      ]}
    />
  );
}
