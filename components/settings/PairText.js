'use client';

// 안전 문구 병기 한 덩어리 (AX-318 · docs/business-rules.md '언어')
//
//   <PairText k="settings.notifyDisclosure" />
//
// 주 언어 줄 + 병기 줄(한국어, 주 언어가 한국어면 영어)을 함께 그린다. 병기 언어는 useLang().pair()
// — 곧 safetyPair() 한 곳이 정한다. ja·zh 는 검수 스위치가 켜지기 전까지 영어 + 한국어다.
// 각 줄에 lang 을 붙여 스크린리더가 맞는 음성으로 읽게 한다. 병기 줄도 대비를 낮추지 않는다(--ink-soft 6.6:1).

import { useLang } from '../LanguageProvider.js';

/**
 * @param {object} props
 * @param {string} props.k            safety 구역의 문구 키
 * @param {object} [props.vars]       자리표시자 값
 * @param {'p'|'div'|'li'|'span'} [props.as]
 * @param {string} [props.className]
 */
export default function PairText({ k, vars, as: Tag = 'p', className }) {
  const { pair } = useLang();
  const { primary, secondary } = pair(k, vars);
  return (
    <Tag className={className ? `settings-pair ${className}` : 'settings-pair'}>
      <span className="settings-pair-primary" lang={primary.lang}>
        {primary.text}
      </span>
      <span className="settings-pair-secondary" lang={secondary.lang}>
        {secondary.text}
      </span>
    </Tag>
  );
}
