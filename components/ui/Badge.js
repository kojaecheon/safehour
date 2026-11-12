'use client';

// 배지 5종 (AX-304 · docs/platform/DESIGN_SYSTEM.md '배지 5종 (`Badge`)')
//
//   <Badge kind="estimate" />          추정            — SafeHour 가 추정한 값(이동·체류 시간, 식이 판단)
//   <Badge kind="defaulted" />         기본값 적용     — '모르겠음'에 가장 엄격한 기본값을 넣었다
//   <Badge kind="hoursUnconfirmed" />  운영 확인 필요  — 열려 있다고 단정하지 않는다
//   <Badge kind="demo" />              병원 연동 데모  — 데모를 실제 연동처럼 보이지 않게 한다
//   <Badge kind="readOnly" />          보기 전용       — 로그인 만료·오프라인
//
// 배지마다 아이콘·테두리 모양·문구가 다르다. 색만으로 구분하지 않는다.
// 문구를 바꿔야 하면 label 로 덮어쓸 수 있지만, 뜻이 다른 배지를 만들지 않는다.

import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

export const BADGE_KINDS = Object.freeze({
  estimate: { icon: 'estimate', key: 'common.badgeEstimate' },
  defaulted: { icon: 'defaulted', key: 'common.badgeDefaulted' },
  hoursUnconfirmed: { icon: 'clockQuestion', key: 'common.badgeHoursUnconfirmed' },
  demo: { icon: 'demo', key: 'common.badgeDemo' },
  readOnly: { icon: 'lock', key: 'common.badgeReadOnly' },
});

/**
 * @param {{ kind: keyof typeof BADGE_KINDS, label?: string }} props
 */
export default function Badge({ kind, label }) {
  const { t } = useLang();
  const spec = BADGE_KINDS[kind];
  if (!spec) return null;
  return (
    <span className={`badge ui-badge ui-badge-${kind}`}>
      <Icon name={spec.icon} size={14} strokeWidth={2.2} />
      <span>{label ?? t(spec.key)}</span>
    </span>
  );
}
