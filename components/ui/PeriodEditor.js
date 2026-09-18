'use client';

// 조건 기간 편집기 — 틀만 (AX-304 · spec 4.4)
//
// 배치만 정한다. 항목 목록·저장 규칙·검증은 조건 화면 작업(T14)이 children·actions 로 채운다.
//
//   <PeriodEditor title="수술 후 1주" source="SELF"
//                 startDate={s} endDate={e} onStartChange={setS} onEndChange={setE}
//                 actions={<><Button>저장</Button><Button variant="secondary">취소</Button></>}>
//     <AnswerInput legend="외출이 허용되나요?" disallowUnknown … />
//     …
//   </PeriodEditor>
//
// - source="SELF"(본인 체크)는 파선 테두리, "HOSPITAL"(병원 발행)은 실선 띠 — 출처 영역과 같은 모양 규칙.
// - 병원 발행 기간은 날짜를 고칠 수 없다(읽기 전용 입력). 시작일·종료일은 둘 다 포함한다(spec 4.4).
// - 자유 서술 입력칸은 두지 않는다(spec 4.4).

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import { SourceTag } from './SourceArea.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {'SELF'|'HOSPITAL'} [props.source]
 * @param {string} [props.startDate]     'YYYY-MM-DD'
 * @param {string} [props.endDate]
 * @param {(v: string) => void} [props.onStartChange]
 * @param {(v: string) => void} [props.onEndChange]
 * @param {string} [props.minDate]
 * @param {string} [props.maxDate]
 * @param {boolean} [props.disabled]     보기 전용
 * @param {React.ReactNode} [props.headExtra]  제목 줄 오른쪽(예: '기본값 적용' 배지)
 * @param {React.ReactNode} [props.actions]
 */
export default function PeriodEditor({
  title,
  source = 'SELF',
  startDate = '',
  endDate = '',
  onStartChange,
  onEndChange,
  minDate,
  maxDate,
  disabled = false,
  headExtra,
  actions,
  children,
}) {
  const { t } = useLang();
  const headingId = useId();
  const startId = useId();
  const endId = useId();
  const locked = source === 'HOSPITAL' || disabled;

  return (
    <section className={`ui-period ui-period-${source}`} aria-labelledby={headingId}>
      <div className="ui-period-head">
        <h3 id={headingId}>{title}</h3>
        <span className="ui-period-tags">
          <SourceTag source={source === 'HOSPITAL' ? 'hospital' : 'self'} />
          {headExtra}
        </span>
      </div>
      <div className="ui-period-dates">
        <div className="field">
          <label htmlFor={startId}>{t('common.periodStart')}</label>
          <input
            id={startId}
            type="date"
            value={startDate}
            min={minDate}
            max={endDate || maxDate}
            readOnly={locked}
            onChange={(e) => onStartChange?.(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={endId}>{t('common.periodEnd')}</label>
          <input
            id={endId}
            type="date"
            value={endDate}
            min={startDate || minDate}
            max={maxDate}
            readOnly={locked}
            onChange={(e) => onEndChange?.(e.target.value)}
          />
        </div>
      </div>
      <div className="ui-period-items">{children}</div>
      {actions && <div className="ui-period-actions">{actions}</div>}
    </section>
  );
}
