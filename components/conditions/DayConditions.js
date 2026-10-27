'use client';

// 날짜별 적용 조건 (AX-315 · spec 4.5)
//
// 날짜 하나를 골라, 그날의 분류(coverage)·사유와 항목별 합성 값을 보여준다.
// 항목 옆에는 값의 출처를 붙인다: '병원 발행' / '본인 체크' / '기본값 적용'.
// 분류와 합성은 도메인(classifyStay)이 한 결과를 그대로 쓴다.

import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, SourceTag } from '@/components/ui/index.js';
import { todayKst } from '@/lib/store/index.js';
import CoverageTag from './CoverageTag.js';
import SafetyText from './SafetyText.js';
import { fmtDay } from './format.js';
import { effectiveRows } from './summary.js';
import { ITEM_LABEL_KEY, formatEffectiveValue } from './values.js';

/**
 * @param {object} props
 * @param {object} props.stay
 * @param {Record<string, object>} props.byDate
 * @param {boolean} props.error
 * @param {number} props.nowMs
 */
export default function DayConditions({ stay, byDate, error, nowMs }) {
  const { t, locale, reasonText } = useLang();
  const headingId = useId();
  const selectId = useId();
  const [picked, setPicked] = useState(null);
  const dates = Object.keys(byDate).sort();
  const today = todayKst(nowMs);
  const date = picked && byDate[picked] ? picked : byDate[today] ? today : dates[0];
  const day = date ? byDate[date] : null;
  const rows = effectiveRows(day?.effective);
  const hospitals = stay?.hospitals ?? [];

  return (
    <section className="ui-block conditions-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('conditions.dayTitle')}</h2>
      <p className="conditions-section-lead">{t('conditions.dayLead')}</p>
      {error || !day ? (
        <p className="conditions-hint">{t('conditions.dayUnavailable')}</p>
      ) : (
        <>
          <div className="field conditions-day-pick">
            <label htmlFor={selectId}>{t('conditions.dayPick')}</label>
            <select id={selectId} value={date} onChange={(e) => setPicked(e.target.value)}>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="conditions-day" aria-live="polite">
            <p className="conditions-day-head">
              <span className="conditions-date">{fmtDay(date, locale)}</span>
              <CoverageTag coverage={day.coverage} />
            </p>
            {day.reasons.length > 0 && (
              <ul className="conditions-reasons">
                {day.reasons.map((code) => (
                  <li key={code}>{reasonText(code)}</li>
                ))}
              </ul>
            )}
            {day.coverage === 'FREE' && <p>{t('conditions.dayFree')}</p>}
            {day.coverage === 'NEEDS_INPUT' && <p>{t('conditions.dayNoPlan')}</p>}
            {rows.length > 0 && (
              <dl className="conditions-effective">
                {rows.map((row) => (
                  <div key={row.key} className="conditions-effective-row">
                    <dt>{t(ITEM_LABEL_KEY[row.key])}</dt>
                    <dd>
                      <span className="conditions-effective-value">
                        {formatEffectiveValue(row.key, row.value, t, hospitals)}
                      </span>
                      <span className="conditions-tags">
                        {row.sources.map((source) => (
                          <SourceTag key={source} source={source === 'HOSPITAL' ? 'hospital' : 'self'} />
                        ))}
                        {row.defaulted && <Badge kind="defaulted" />}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {day.warnings?.includes('DEFAULTS_APPLIED') && <p className="conditions-hint">{t('conditions.warnDefaults')}</p>}
            {day.warnings?.includes('MEDICATION_TIMES_MISSING') && (
              <SafetyText k={'conditions.warnMedicationMissing'} className="ui-callout conditions-callout" />
            )}
          </div>
        </>
      )}
    </section>
  );
}
