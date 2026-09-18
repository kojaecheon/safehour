'use client';

// 예 / 아니오 / 모르겠음 입력 (AX-304 · spec 4.4 본인 체크 항목)
//
//   <AnswerInput legend="자외선을 피해야 하나요?" value={v} onChange={setV} />
//   <AnswerInput legend="외출이 허용되나요?" disallowUnknown … />   ← 필수 항목은 '모르겠음'이 없다
//
// 값: 'YES' | 'NO' | 'UNKNOWN' | null(아직 고르지 않음)
//
// '아니오'와 '모르겠음'은 뜻이 다르다(handoff 4장).
//   - 아니오 = 병원이 그런 안내를 하지 않았다 → 제한 없음
//   - 모르겠음 = 가장 엄격한 기본값을 적용한다 → '기본값 적용' 배지
// 그래서 고른 뒤 그 뜻을 한 줄로 바로 보여준다(showMeaning, 기본 켜짐).
//
// 접근성: fieldset + legend + 표준 라디오(방향키로 이동). 라디오는 칸 전체를 덮는 투명 입력이라
// 칸 어디를 눌러도 고를 수 있고, 칸마다 48px 이상이다. 선택은 테두리·바탕·체크 아이콘·굵기로 보인다.

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import Badge from './Badge.js';
import Icon from './Icon.js';

const OPTIONS = [
  { value: 'YES', key: 'common.answerYes' },
  { value: 'NO', key: 'common.answerNo' },
  { value: 'UNKNOWN', key: 'common.answerUnknown' },
];

/**
 * @param {object} props
 * @param {string} props.legend
 * @param {'YES'|'NO'|'UNKNOWN'|null} props.value
 * @param {(value: 'YES'|'NO'|'UNKNOWN') => void} [props.onChange]
 * @param {boolean} [props.disallowUnknown]   필수 항목 — '모르겠음'을 보이지 않는다
 * @param {string} [props.hint]               질문 아래 보조 설명
 * @param {boolean} [props.disabled]          보기 전용·병원 발행 항목
 * @param {boolean} [props.showMeaning]       고른 뒤 '아니오'·'모르겠음'의 뜻을 보여준다
 * @param {string} [props.name]
 */
export default function AnswerInput({
  legend,
  value = null,
  onChange,
  disallowUnknown = false,
  hint,
  disabled = false,
  showMeaning = true,
  name,
}) {
  const { t } = useLang();
  const autoName = useId();
  const hintId = useId();
  const meaningId = useId();
  const options = disallowUnknown ? OPTIONS.filter((o) => o.value !== 'UNKNOWN') : OPTIONS;
  const current = options.some((o) => o.value === value) ? value : null;
  const describedBy = [hint ? hintId : null, showMeaning && current ? meaningId : null].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset className="ui-answer" disabled={disabled}>
      <legend>{legend}</legend>
      {hint && (
        <p className="ui-answer-hint" id={hintId}>
          {hint}
        </p>
      )}
      <div className="ui-answer-options">
        {options.map((option) => {
          const selected = current === option.value;
          return (
            <label key={option.value} className={selected ? 'ui-answer-option is-selected' : 'ui-answer-option'}>
              <input
                type="radio"
                name={name ?? autoName}
                value={option.value}
                checked={selected}
                aria-describedby={describedBy}
                onChange={() => onChange?.(option.value)}
              />
              <span className="ui-answer-mark">
                <Icon name="check" size={16} strokeWidth={2.8} />
              </span>
              <span>{t(option.key)}</span>
            </label>
          );
        })}
      </div>
      {showMeaning && current === 'NO' && (
        <p className="ui-answer-explain" id={meaningId}>
          {t('common.answerNoHint')}
        </p>
      )}
      {showMeaning && current === 'UNKNOWN' && (
        <p className="ui-answer-explain" id={meaningId}>
          <Badge kind="defaulted" />
          <span>{t('common.answerUnknownHint')}</span>
        </p>
      )}
    </fieldset>
  );
}
