'use client';

// 체류 설정 입력 칸 (AX-314) — 라벨·보조 설명·필드별 오류를 한 모양으로 묶는다.
//
// 접근성
//   - 모든 입력에 보이는 라벨(label·legend)이 있다.
//   - 오류는 문구로 알린다(색만으로 알리지 않는다): aria-invalid + aria-describedby 로 오류 문장을 읽힌다.
//   - 오류 문장은 validateStay() 결과를 필드별로 옮긴 것이다(draft.js issueMessage).
//   - 라디오 묶음은 fieldset + legend, 칸 전체가 누를 수 있는 52px 이상 선택지다(.radio-option).

import { useLang } from '../LanguageProvider.js';
import { Icon } from '../ui/index.js';
import { fieldDomId, issueMessage, issuesFor } from './draft.js';

function joinIds(...ids) {
  const list = ids.filter(Boolean);
  return list.length > 0 ? list.join(' ') : undefined;
}

/** 필드 오류 문장 묶음 — 문장마다 앞에 20px 경고 아이콘(설계서 5.2). 문제가 없으면 그리지 않는다 */
export function FieldErrors({ id, issues }) {
  const { t } = useLang();
  if (!issues || issues.length === 0) return null;
  return (
    <div id={id} className="onboarding-field-error">
      {issues.map((issue) => {
        const { key, vars } = issueMessage(issue);
        return (
          <p key={`${issue.field}-${issue.code}`} className="ui-field-error">
            <Icon name="alert" size={20} />
            <span>{t(key, vars)}</span>
          </p>
        );
      })}
    </div>
  );
}

/** 이 필드와 함께 보여줄 문제(예: 숙소 겹침은 체크인 칸에 붙인다) */
function collect(issues, field, extraFields) {
  return [field, ...extraFields].flatMap((f) => issuesFor(issues, f));
}

/**
 * 한 줄 입력 (text·date·time·tel).
 * @param {object} props
 * @param {string} props.field       검증 필드 경로 — 입력 id 도 여기서 나온다
 * @param {Array} props.issues       지금 보여줄 문제 목록
 * @param {string} props.label
 * @param {string} [props.hint]
 * @param {React.ReactNode} [props.after]  입력 아래 보조 줄(글자 수, 예상 종료 등)
 * @param {string} [props.afterId]   after 가 설명문이면 그 id — aria-describedby 에 넣는다
 * @param {string[]} [props.extraIssueFields]
 */
export function TextField({
  field,
  issues,
  label,
  hint,
  after,
  afterId,
  extraIssueFields = [],
  type = 'text',
  value,
  onChange,
  ...inputProps
}) {
  const id = fieldDomId(field);
  const own = collect(issues, field, extraIssueFields);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = own.length > 0 ? `${id}-error` : undefined;
  return (
    <div className="field onboarding-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={own.length > 0 ? 'true' : undefined}
        aria-describedby={joinIds(hintId, afterId, errorId)}
        {...inputProps}
      />
      {hint && (
        <p className="onboarding-hint" id={hintId}>
          {hint}
        </p>
      )}
      {after}
      <FieldErrors id={errorId} issues={own} />
    </div>
  );
}

/**
 * 고르기 칸(select).
 * @param {{ field: string, issues: Array, label: string, value: string, onChange: (v: string) => void,
 *           options: Array<{ value: string, label: string }>, placeholder: string }} props
 */
export function SelectField({ field, issues, label, value, onChange, options, placeholder, disabled }) {
  const id = fieldDomId(field);
  const own = issuesFor(issues, field);
  const errorId = own.length > 0 ? `${id}-error` : undefined;
  return (
    <div className="field onboarding-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={own.length > 0 ? 'true' : undefined}
        aria-describedby={errorId}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldErrors id={errorId} issues={own} />
    </div>
  );
}

/**
 * 라디오 묶음. 첫 선택지의 id 가 필드 id 다(오류 요약 링크가 그곳으로 초점을 옮긴다).
 * 선택 상태는 테두리 + 바탕 + 라디오 점으로 보인다(색 단독 금지 — globals.css .radio-option.selected).
 *
 * @param {{ field: string, issues: Array, legend: string, name: string, value: string|null,
 *           onChange: (v: string) => void, hint?: string,
 *           options: Array<{ value: string, label: string, hint?: string, lang?: string }> }} props
 */
export function ChoiceGroup({ field, issues, legend, name, value, onChange, options, hint }) {
  const id = fieldDomId(field);
  const own = issuesFor(issues, field);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = own.length > 0 ? `${id}-error` : undefined;
  return (
    <fieldset className="onboarding-choice">
      <legend>{legend}</legend>
      {hint && (
        <p className="onboarding-hint" id={hintId}>
          {hint}
        </p>
      )}
      <div className="radio-group">
        {options.map((option, index) => {
          const selected = value === option.value;
          const inputId = index === 0 ? id : `${id}-${option.value}`;
          const subId = option.hint ? `${inputId}-sub` : undefined;
          return (
            <label key={option.value} htmlFor={inputId} className={selected ? 'radio-option selected' : 'radio-option'}>
              <input
                type="radio"
                id={inputId}
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-invalid={own.length > 0 ? 'true' : undefined}
                aria-describedby={joinIds(subId, hintId, errorId)}
              />
              <span className="onboarding-option-text">
                <span className="onboarding-option-label" lang={option.lang}>
                  {option.label}
                </span>
                {option.hint && (
                  <span className="onboarding-option-sub" id={subId}>
                    {option.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <FieldErrors id={errorId} issues={own} />
    </fieldset>
  );
}

/**
 * 안전 문구(고지) 병기: 주 언어 한 줄 + 병기 언어 한 줄 (docs/business-rules.md '언어').
 * 병기 언어는 useLang().pair() 가 정한다(ja·zh 는 검수 전이면 영어 + 한국어).
 * 앞에 20px 안내 아이콘을 둔다(SEED Callout — 설계서 5.6). 시작 화면 면책 상자도 이 부품이다.
 */
export function SafetyNote({ noticeKey, vars, className = 'onboarding-safety' }) {
  const { pair } = useLang();
  const { primary, secondary } = pair(noticeKey, vars);
  return (
    <div className={className} role="note">
      <span className="onboarding-safety-icon" aria-hidden="true">
        <Icon name="info" size={20} />
      </span>
      <div className="onboarding-safety-text">
        <p lang={primary.lang}>{primary.text}</p>
        <p className="onboarding-secondary" lang={secondary.lang}>
          {secondary.text}
        </p>
      </div>
    </div>
  );
}

/**
 * 다음 그림이 끝난 뒤 id 로 초점을 옮긴다 — 항목을 더하거나 지운 뒤 키보드 위치를 이어 준다.
 * 요소가 없으면 아무것도 하지 않는다.
 */
export function focusById(id) {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}
