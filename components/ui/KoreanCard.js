'use client';

// 한국어 안내 카드 틀 (AX-304 · docs/business-rules.md '알림과 카드')
//
//   <KoreanCard title={식이 카드 이름}
//               korean={['매운 음식은 빼 주세요', '술은 마실 수 없어요']}
//               explanation={사용자 언어 설명} />
//
// - 큰 한국어 본문(직원이 읽는다) + 작은 사용자 언어 설명(환자가 읽는다).
// - 한국어 본문은 lang="ko" 로 표시해 스크린리더가 한국어 음성으로 읽는다.
// - 카드 문구는 **고정 문구**다(사람 검수 대상, AI 금지). 이 틀은 문구를 만들지 않는다 — 화면이 넘긴다.
// - 윗띠에는 사용자 언어로 '직원에게 이 화면을 보여 주세요'를 적는다.
// - 로그인 만료·오프라인에서도 보여야 하므로 네트워크를 쓰지 않는다.

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

/**
 * @param {object} props
 * @param {string} props.title                 카드 이름(사용자 언어)
 * @param {string | string[]} props.korean      한국어 본문 줄
 * @param {string} [props.explanation]          사용자 언어 설명
 * @param {string} [props.explanationLang]      설명 언어가 화면 언어와 다를 때
 */
export default function KoreanCard({ title, korean, explanation, explanationLang, children }) {
  const { t } = useLang();
  const headingId = useId();
  const lines = Array.isArray(korean) ? korean : [korean];
  return (
    <article className="ui-kcard" aria-labelledby={headingId}>
      <div className="ui-kcard-band">
        <h3 className="ui-kcard-title" id={headingId}>
          {title}
        </h3>
        <span>
          <Icon name="selfCheck" size={14} strokeWidth={2.4} /> {t('common.showThisCard')}
        </span>
      </div>
      <div className="ui-kcard-korean" lang="ko">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {explanation && (
        <p className="ui-kcard-explain" lang={explanationLang}>
          {explanation}
        </p>
      )}
      {children && <div className="ui-kcard-extra">{children}</div>}
    </article>
  );
}
