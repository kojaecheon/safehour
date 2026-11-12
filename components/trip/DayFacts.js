'use client';

// 하루 일정의 근거: 적용한 조건(출처)과 빠진 장소(사유) (AX-317 · docs/business-rules.md '날짜별 합성'·'하루 일정 생성'·'장소 후보와 필터')
//
//   <AppliedConditions day={day} stay={stay} />   항목별 합성 값 + '병원 발행' / '본인 체크' / '기본값 적용'
//   <ExcludedList day={day} />                    게이트를 통과하지 못한 후보와 사유 (접을 수 있음)
//
// 값은 도메인이 합성한 결과(DayPlan.effective)를 그대로 옮긴다. 해석하지 않는다.
// 사유 문구는 안전 문구라 safetyPair 의 주 언어로 보인다.

import { useLang } from '../LanguageProvider.js';
import { Badge, SourceTag } from '../ui/index.js';
import CoverageTag from '../conditions/CoverageTag.js';
import { effectiveRows } from '../conditions/summary.js';
import { ITEM_LABEL_KEY, formatEffectiveValue } from '../conditions/values.js';

const WARNING_KEY = {
  MEDICATION_TIMES_MISSING: 'trip.warnMEDICATION_TIMES_MISSING',
  DEFAULTS_APPLIED: 'trip.warnDEFAULTS_APPLIED',
  TRAVEL_TIMES_ESTIMATED: 'trip.warnTRAVEL_TIMES_ESTIMATED',
};

const TRANSPORT_KEY = { TAXI: 'trip.transportTAXI', TRANSIT: 'trip.transportTRANSIT' };

export function AppliedConditions({ day, stay }) {
  const { t, lang, safety } = useLang();
  const rows = effectiveRows(day?.effective);
  const hospitals = stay?.hospitals ?? [];
  const warnings = (day?.warnings ?? []).filter((w) => WARNING_KEY[w]);
  const safetyLang = safety.primary === lang ? undefined : safety.primary;

  return (
    <details className="disclosure trip-facts">
      <summary>
        <span>{t('trip.conditionsTitle')}</span>
      </summary>
      <div className="trip-facts-body">
        <p className="trip-facts-line">
          <CoverageTag coverage={day?.coverage} />
          {day?.transportMode && TRANSPORT_KEY[day.transportMode] && (
            <span className="trip-facts-transport">
              {t(TRANSPORT_KEY[day.transportMode])} <Badge kind="estimate" />
            </span>
          )}
        </p>
        {day?.window && <p className="trip-facts-line">{t('trip.windowLine', { start: day.window.start, end: day.window.end })}</p>}
        {rows.length === 0 ? (
          <p>{t('trip.conditionsNone')}</p>
        ) : (
          <dl className="trip-facts-list">
            {rows.map((row) => (
              <div key={row.key} className="trip-facts-row">
                <dt>{t(ITEM_LABEL_KEY[row.key])}</dt>
                <dd>
                  <span>{formatEffectiveValue(row.key, row.value, t, hospitals)}</span>
                  <span className="trip-facts-tags">
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
        {warnings.length > 0 && (
          <ul className="trip-facts-warnings" lang={safetyLang}>
            {warnings.map((w) => (
              <li key={w}>{t(WARNING_KEY[w])}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function ExcludedList({ day }) {
  const { t, lang, safety, reasonText } = useLang();
  const excluded = (day?.excluded ?? []).filter((e) => e && (e.title || e.candidateId));
  if (excluded.length === 0) return null;
  const reasonLang = safety.primary === lang ? undefined : safety.primary;
  return (
    <details className="disclosure trip-facts">
      <summary>
        <span>{t('trip.excludedTitle', { n: excluded.length })}</span>
      </summary>
      <ul className="trip-excluded">
        {excluded.map((e) => (
          <li key={e.candidateId ?? e.title} className="excluded-item">
            <span className="name">{e.title ?? t('delta.unknownPlace')}</span>
            {(e.reasons ?? []).length > 0 && (
              <span className="reasons" lang={reasonLang}>
                {' — '}
                {e.reasons.map(reasonText).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
