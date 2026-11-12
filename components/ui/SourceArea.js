'use client';

// 출처 영역 (AX-304 · docs/platform/DESIGN_SYSTEM.md '출처 영역 5종 (`SourceArea` · `SourceTag`)', docs/business-rules.md '장소 후보와 필터': 원문과 추정값을 같은 필드에 섞지 않는다)
//
//   <SourceArea source="hospital">…병원 원문…</SourceArea>
//   <SourceArea source="self">…본인 체크 값…</SourceArea>
//   <SourceArea source="estimate">…SafeHour 판정·추정…</SourceArea>
//   <SourceArea source="tourism">…관광공사 원문…</SourceArea>
//   <SourceArea source="ai" note="…">…AI 소개 문장…</SourceArea>
//
// 다섯 출처는 **머리글 문구 + 아이콘 + 테두리 모양**으로 나뉜다(실선 띠 / 파선 / 점선 / 두 줄 띠 / 말풍선).
// 한 영역 안에 두 출처를 섞지 않는다. 병원 안내문은 번역·요약하지 않은 원문 그대로 넣는다(docs/business-rules.md '병원 연동').
//
// SourceTag 는 항목 옆에 붙이는 작은 출처 표시다(docs/business-rules.md '날짜별 합성'의 출처 '병원 발행' / '본인 체크').
// '기본값 적용'은 <Badge kind="defaulted" /> 를 쓴다.

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

export const SOURCE_KINDS = Object.freeze({
  hospital: { icon: 'hospital', key: 'common.sourceHospital' },
  self: { icon: 'selfCheck', key: 'common.sourceSelf' },
  estimate: { icon: 'calculator', key: 'common.sourceEstimate' },
  tourism: { icon: 'quote', key: 'common.sourceTourism' },
  ai: { icon: 'ai', key: 'common.sourceAi' },
});

/**
 * @param {object} props
 * @param {keyof typeof SOURCE_KINDS} props.source
 * @param {string} [props.title]   머리글 뒤에 붙는 영역 제목
 * @param {string} [props.note]    영역 아래 작은 설명(예: 'AI 가 쓴 소개입니다. 판정에 쓰지 않습니다')
 * @param {string} [props.lang]    본문 언어가 화면 언어와 다를 때(병원 원문·관광공사 국문 원문)
 */
export default function SourceArea({ source, title, note, lang, children }) {
  const { t } = useLang();
  const headId = useId();
  const spec = SOURCE_KINDS[source];
  if (!spec) return null;
  return (
    <section className={`ui-source ui-source-${source}`} aria-labelledby={headId}>
      <p className="ui-source-head" id={headId}>
        <Icon name={spec.icon} size={18} />
        <span>{t(spec.key)}</span>
        {title && <span className="ui-source-title">· {title}</span>}
      </p>
      <div className="ui-source-body" lang={lang}>
        {children}
      </div>
      {note && <p className="ui-source-note">{note}</p>}
    </section>
  );
}

/** 항목 옆 작은 출처 표시 */
export function SourceTag({ source }) {
  const { t } = useLang();
  const spec = SOURCE_KINDS[source];
  if (!spec) return null;
  return (
    <span className={`ui-source-tag ui-source-tag-${source}`}>
      <Icon name={spec.icon} size={14} strokeWidth={2.2} />
      <span>{t(spec.key)}</span>
    </span>
  );
}
