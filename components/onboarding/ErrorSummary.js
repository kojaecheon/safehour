'use client';

// 이 단계에서 확인이 필요한 항목 요약 (AX-314)
//
// '다음'·'저장'을 눌렀을 때 문제가 있으면 이 상자로 초점이 온다. 항목을 누르면 그 입력 칸으로 초점이 간다.
// 문구는 필드 이름 + 이유다(색만으로 알리지 않는다). 규칙 1–3 거부 사유도 여기에 그대로 나온다.

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import { Icon } from '../ui/index.js';
import { fieldDomId, fieldLabelParts, issueMessage } from './draft.js';

export default function ErrorSummary({ issues, ref }) {
  const { t } = useLang();
  const titleId = useId();
  if (issues.length === 0) return null;
  return (
    <div className="ui-error-summary onboarding-summary" role="group" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
      <p className="ui-error-summary-title onboarding-summary-title" id={titleId}>
        <Icon name="alert" size={20} />
        <span>{t('onboarding.errorsTitle', { n: issues.length })}</span>
      </p>
      <ul role="list">
        {issues.map((issue) => {
          const label = fieldLabelParts(issue.field)
            .map((part) => t(part.key, part.vars))
            .join(' · ');
          const { key, vars } = issueMessage(issue);
          const target = fieldDomId(issue.field);
          return (
            <li key={`${issue.field}-${issue.code}`}>
              <a
                href={`#${target}`}
                onClick={(event) => {
                  const element = document.getElementById(target);
                  if (!element) return;
                  event.preventDefault();
                  element.focus();
                  element.scrollIntoView?.({ block: 'center' });
                }}
              >
                {label ? <strong>{label}</strong> : null}
                <span>{t(key, vars)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
