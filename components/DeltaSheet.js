'use client';

// 전후 비교 시트: 무엇이 왜 바뀌었는지 (AX-317 · docs/business-rules.md '전체 일정 확정과 변화 대응'의 전후 비교, src/engine/dayDelta.js DayDelta)
//
// 이 시트는 **설명 전용**이다. 재계획 결과는 시트가 뜨기 전에 이미 저장 일정에 반영되어 있다.
// 알림만 띄우고 예전 일정을 유지하는 선택지는 없다(기존 '알림만 하는 재계산 금지').
//   - 줄: 대체된 곳(→) · 빠진 곳 · 들어온 곳 · 줄어든 곳 · 취소된 외출 · 새 마감, 그리고 상태 변경과 사유
//   - 장소 이름을 찾지 못하면 '이름을 알 수 없는 장소'로 쓴다(지어내지 않는다)
//   - 사유·상태는 안전 문구 — safetyPair 의 주 언어로 보인다
//   - 닫으면(확인·Escape·뒤로 가기) 화면이 markDeltaSeen 으로 '변경됨'을 지운다

import { useLang } from './LanguageProvider.js';
import { Sheet } from './ui/index.js';
import { deadlineCopyOf, deltaSummary } from './trip/viewModel.js';

const TAG = {
  replaced: { key: 'delta.tagReplaced', className: 'delta-state' },
  removed: { key: 'delta.tagRemoved', className: 'delta-removed' },
  added: { key: 'delta.tagAdded', className: 'delta-added' },
  shortened: { key: 'delta.tagShortened', className: 'delta-shortened' },
  cancelled: { key: 'delta.tagCancelled', className: 'delta-removed' },
  deadline: { key: 'delta.tagDeadline', className: 'delta-shortened' },
};

/**
 * @param {object} props
 * @param {object} props.day       변경이 기록된 DayPlan (delta 포함)
 * @param {string} [props.dateLabel]
 * @param {boolean} [props.isToday]  새 마감이 하루 활동 종료면 오늘은 '오늘 활동 종료', 다른 날은 '활동 종료' (deadlineCopyOf)
 * @param {() => void} props.onClose
 */
export default function DeltaSheet({ day, dateLabel, isToday = false, onClose }) {
  const { t, lang, safety, reasonText } = useLang();
  const summary = deltaSummary(day);
  const reasonLang = safety.primary === lang ? undefined : safety.primary;
  const nameOf = (place) => place?.title ?? t('delta.unknownPlace');
  const who = (role) => (role === 'G' ? `${t('delta.guardianPrefix')} · ` : '');

  function rowBody(row) {
    switch (row.kind) {
      case 'replaced':
        return (
          <>
            {who(row.from.role)}
            {nameOf(row.from)} → <strong>{nameOf(row.to)}</strong>
            {row.from.reasons.length > 0 && (
              <span className="trip-delta-why" lang={reasonLang}>
                {row.from.reasons.map(reasonText).join(' · ')}
              </span>
            )}
          </>
        );
      case 'removed':
        return (
          <>
            {who(row.role)}
            {nameOf(row)}
            {row.reasons.length > 0 && (
              <span className="trip-delta-why" lang={reasonLang}>
                {row.reasons.map(reasonText).join(' · ')}
              </span>
            )}
          </>
        );
      case 'added':
        return (
          <>
            {who(row.role)}
            <strong>{nameOf(row)}</strong>
          </>
        );
      case 'shortened':
        return (
          <>
            {who(row.role)}
            {nameOf(row)}
            {row.stayMin != null && <span className="trip-delta-why">{t('trip.stayMin', { n: row.stayMin })}</span>}
          </>
        );
      case 'cancelled':
        return (
          <>
            {who(row.role)}
            {t('delta.cancelledBody')}
          </>
        );
      case 'deadline':
        return (
          <>
            {who(row.role)}
            <span lang={reasonLang}>{t(deadlineCopyOf(row, { isToday }).timeKey, { time: row.returnBy })}</span>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <Sheet
      title={t('delta.title')}
      onClose={onClose}
      footer={({ requestClose }) => (
        <button type="button" className="btn" onClick={requestClose}>
          {t('common.confirm')}
        </button>
      )}
    >
      <div className="trip-delta">
        {dateLabel && <p className="trip-delta-date">{dateLabel}</p>}
        <p>{t('delta.lead')}</p>
        {summary?.state && (
          <div className="delta-row">
            <span className="delta-tag delta-state">{t('delta.state')}</span>
            <span lang={reasonLang}>
              {t(`state.${summary.state.before}`)} → <strong>{t(`state.${summary.state.after}`)}</strong>
            </span>
          </div>
        )}
        {summary?.reasons.length > 0 && (
          <div className="delta-row">
            <span className="delta-tag delta-state">{t('delta.reasons')}</span>
            <ul className="trip-delta-reasons" lang={reasonLang}>
              {summary.reasons.map((code) => (
                <li key={code}>{reasonText(code)}</li>
              ))}
            </ul>
          </div>
        )}
        {summary?.rows.map((row, i) => {
          const tag = TAG[row.kind];
          return (
            <div className="delta-row" key={`${row.kind}-${i}`}>
              <span className={`delta-tag ${tag.className}`}>{t(tag.key)}</span>
              <span className="trip-delta-body">{rowBody(row)}</span>
            </div>
          );
        })}
        {summary && summary.rows.length === 0 && <p className="trip-delta-empty">{t('delta.noRows')}</p>}
      </div>
    </Sheet>
  );
}
