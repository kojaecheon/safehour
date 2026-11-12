'use client';

// 조건 기간 목록의 한 줄 (AX-315 · docs/business-rules.md '조건 기간'·'날짜 분류')
//
// - 날짜 범위, 출처(병원 발행 / 본인 체크), 제한 없음 표시, 병원 연동 데모 배지(데모 지침이면 늘)
// - 병원 발행 기간: 지침 상태(유효·만료·철회)와 연결 병원. 고칠 수 없다(병원 값은 그대로 적용한다).
// - 날짜별 분류 요약: 분류별 날짜 수 + 펼치면 날짜마다 분류와 사유
// - 본인 체크 기간: 고치기 / 삭제(확인 대화상자로 한 번 더 묻는다, 확인은 긴급 빨강). 보기 전용이면 막는다.

import { useId, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { AlertDialog, Badge, Button, SourceTag } from '@/components/ui/index.js';
import { fmtDateTime } from '@/lib/format.js';
import { hospitalPeriodConflict } from '@/src/stay/conditions.js';
import CoverageTag from './CoverageTag.js';
import SafetyText from './SafetyText.js';
import { fmtDay } from './format.js';
import { planState } from './linkPlan.js';
import { COVERAGE_ORDER, coverageCounts, periodCoverage } from './summary.js';

const PLAN_STATE_KEY = {
  ACTIVE: 'conditions.planStateACTIVE',
  EXPIRED: 'conditions.planStateEXPIRED',
  REVOKED: 'conditions.planStateREVOKED',
};

/**
 * @param {object} props
 * @param {object} props.period
 * @param {object} props.stay
 * @param {Record<string, object>} props.byDate   safeClassifyStay().byDate
 * @param {number} props.nowMs
 * @param {boolean} props.readOnly
 * @param {(period: object) => void} [props.onEdit]
 * @param {(period: object) => void} [props.onDelete]
 */
export default function PeriodCard({ period, stay, byDate, nowMs, readOnly, onEdit, onDelete }) {
  const { t, locale, reasonText } = useLang();
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const isHospital = period.source === 'HOSPITAL';
  const linked = isHospital ? (stay.linkedPlans ?? []).find((lp) => lp?.plan?.planId === period.planId) : null;
  const demo = linked?.plan?.demo === true;
  const hospitalName = isHospital ? (stay.hospitals ?? []).find((h) => h?.id === period.hospitalId)?.name : null;
  const days = periodCoverage(stay, period, byDate);
  const counts = coverageCounts(days);
  const state = isHospital ? planState(period, nowMs) : null;

  return (
    <li className={`conditions-period conditions-period-${period.source}`}>
      <div className="conditions-period-head">
        <h3 id={headingId}>
          {t('conditions.dateRange', { start: fmtDay(period.startDate, locale), end: fmtDay(period.endDate, locale) })}
        </h3>
        <span className="conditions-tags">
          <SourceTag source={isHospital ? 'hospital' : 'self'} />
          {demo && <Badge kind="demo" />}
          {period.noRestriction && <span className="conditions-plain-tag">{t('conditions.noRestrictionTag')}</span>}
        </span>
      </div>

      {isHospital && (
        <div className="conditions-period-meta">
          {hospitalName && <p>{t('link.planHospital', { name: hospitalName })}</p>}
          <p>
            {t(PLAN_STATE_KEY[state], {
              at: fmtDateTime(period.expiresAt, locale),
            })}
          </p>
          {hospitalPeriodConflict(period) && <SafetyText k={'link.conflictNote'} className="ui-callout conditions-callout" />}
        </div>
      )}

      {days.length === 0 ? (
        <p className="conditions-hint">{t('conditions.coverageOutside')}</p>
      ) : (
        <>
          <ul className="conditions-counts">
            {COVERAGE_ORDER.filter((c) => counts[c]).map((c) => (
              <li key={c}>
                <CoverageTag coverage={c} suffix={t('conditions.dayCount', { n: counts[c] })} />
              </li>
            ))}
          </ul>
          <details className="disclosure conditions-dates">
            <summary>{t('conditions.coverageDetails')}</summary>
            <ul className="conditions-date-list">
              {days.map((day) => (
                <li key={day.date}>
                  <span className="conditions-date">{fmtDay(day.date, locale)}</span>
                  <CoverageTag coverage={day.coverage} />
                  {day.reasons.length > 0 && (
                    <ul className="conditions-reasons">
                      {day.reasons.map((code) => (
                        <li key={code}>{reasonText(code)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {!isHospital && (
        <div className="conditions-actions is-inline conditions-period-actions">
          <Button variant="secondary" size="small" disabled={readOnly} onClick={() => onEdit?.(period)}>
            {t('conditions.editPeriod')}
          </Button>
          <Button variant="secondary" size="small" disabled={readOnly} onClick={() => setConfirming(true)}>
            {t('conditions.deletePeriod')}
          </Button>
        </div>
      )}

      {/* 되돌릴 수 없는 확인이라 대화상자로 묻는다(설계서 5.6). 초점 가두기·Escape·초점 복귀는 AlertDialog 가 한다 */}
      {confirming && (
        <AlertDialog
          title={t('conditions.deleteQuestion')}
          description={t('conditions.dateRange', { start: fmtDay(period.startDate, locale), end: fmtDay(period.endDate, locale) })}
          cancelLabel={t('conditions.cancel')}
          confirmLabel={t('conditions.deleteConfirm')}
          critical
          onConfirm={({ requestClose }) => {
            requestClose();
            onDelete?.(period);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
