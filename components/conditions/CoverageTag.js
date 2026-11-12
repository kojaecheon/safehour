'use client';

// 날짜 분류 표시 (AX-315 · docs/business-rules.md '날짜 분류'): 색 + 아이콘 + 문구. 입력 필요는 오류 색을 쓰지 않는다.

import { useLang } from '@/components/LanguageProvider.js';
import Icon from '@/components/ui/Icon.js';

export const COVERAGE_LABEL = Object.freeze({
  FREE: { key: 'conditions.coverageFREE', icon: 'check' },
  DECLARED_FREE: { key: 'conditions.coverageDECLARED_FREE', icon: 'selfCheck' },
  RESTRICTED: { key: 'conditions.coverageRESTRICTED', icon: 'flag' },
  REST_DAY: { key: 'conditions.coverageREST_DAY', icon: 'bed' },
  NEEDS_INPUT: { key: 'conditions.coverageNEEDS_INPUT', icon: 'plus' },
});

export default function CoverageTag({ coverage, suffix }) {
  const { t } = useLang();
  const spec = COVERAGE_LABEL[coverage];
  if (!spec) return null;
  return (
    <span className={`conditions-coverage conditions-coverage-${coverage}`}>
      <Icon name={spec.icon} size={16} strokeWidth={2.2} />
      <span>
        {t(spec.key)}
        {suffix ? ` · ${suffix}` : ''}
      </span>
    </span>
  );
}
