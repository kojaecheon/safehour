'use client';

// 여러 값 중 하나 고르기 (AX-315) — 외출 허용(허용/실내만/불가), 복귀 장소, 금식 방식
//
// 예/아니오/모르겠음은 components/ui 의 AnswerInput 을 쓴다. 이 부품은 그 밖의 정해진 선택지용이며,
// 같은 모양(.ui-answer 클래스)과 같은 접근성 구조(fieldset + legend + 표준 라디오)를 쓴다.
// 부품 모양은 고치지 않고 그대로 빌려 쓴다. '모르겠음' 칸은 없다 — 필수 항목에만 쓴다.

import { useId } from 'react';
import { AnswerText } from '@/components/ui/AnswerInput.js';
import Icon from '@/components/ui/Icon.js';

/**
 * @param {object} props
 * @param {string} props.legend
 * @param {string} [props.hint]
 * @param {string|null} props.value
 * @param {Array<{value: string, label: string}>} props.options
 * @param {(value: string) => void} [props.onChange]
 * @param {boolean} [props.disabled]
 * @param {string} [props.describedBy]  오류 문구 id
 */
export default function ChoiceInput({ legend, hint, value = null, options, onChange, disabled = false, describedBy }) {
  const name = useId();
  const hintId = useId();
  const described = [hint ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined;
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
          const selected = value === option.value;
          return (
            <label key={option.value} className={selected ? 'ui-answer-option is-selected' : 'ui-answer-option'}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                aria-describedby={described}
                onChange={() => onChange?.(option.value)}
              />
              <span className="ui-answer-mark">
                <Icon name="check" size={16} strokeWidth={2.8} />
              </span>
              <AnswerText>{option.label}</AnswerText>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
