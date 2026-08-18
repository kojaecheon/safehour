'use client';

// 변화 재계산 결과 — 무엇이 왜 바뀌었는지 전후 비교 (D04-DB005 ChangeDelta)
//
// 이 시트는 "설명 전용"이다. 재판정 결과는 이 시트가 뜨기 전에 이미 화면과
// 세션에 적용되어 있다. 알림만 표시하고 기존 코스를 유지하는 선택지는
// 존재하지 않는다 (D07-BAN008).

import { useModalSheet } from '@/lib/useModalSheet.js';
import { useLang } from './LanguageProvider.js';

export default function DeltaSheet({ recalc, titles = {}, onClose }) {
  const { t, minutesLabel, stateMessage, reasonText } = useLang();
  const { event, before, after, delta } = recalc;
  // 확인 버튼도 requestClose 를 거친다 — 뒤로가기와 같은 경로로 닫아야
  // 히스토리에 잉여 항목이 남지 않는다 (ADR-0001 보완 조건 3)
  const { sheetRef, requestClose } = useModalSheet(onClose);

  function titleOf(id) {
    const key = String(id);
    if (titles[key]) return titles[key];
    const inAfter = recalc.result.course.find((c) => String(c.id) === key);
    if (inAfter) return inAfter.title;
    const excluded = recalc.result.excluded.find((c) => String(c.id) === key);
    return excluded?.title ?? id;
  }

  function stateLabelOf(state) {
    return stateMessage(state)?.message ?? state;
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="delta-h">
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <h2 id="delta-h" style={{ marginBottom: 4 }}>
          {t('delta.title', { event: t(`event.${event.type}`) })}
        </h2>
        <p style={{ marginBottom: 14 }}>
          {t('delta.lead')}
          {delta.hasVisibleChange ? t('delta.leadChanged') : t('delta.leadKept')}
        </p>

        {delta.stateChanged && (
          <div className="delta-row">
            <span className="delta-tag delta-state">{t('delta.tagState')}</span>
            <span>
              {stateLabelOf(before.state)} → <strong>{stateLabelOf(after.state)}</strong>
              {after.reasons?.length > 0 && (
                <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 14 }}>
                  {after.reasons.map(reasonText).join(' · ')}
                </span>
              )}
            </span>
          </div>
        )}

        {delta.removed.map((id) => {
          const excludedEntry = recalc.result.excluded.find((e) => String(e.id) === String(id));
          return (
            <div className="delta-row" key={`removed-${id}`}>
              <span className="delta-tag delta-removed">{t('delta.tagRemoved')}</span>
              <span>
                {titleOf(id)}
                {excludedEntry && (
                  <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 14 }}>
                    {excludedEntry.reasons.map(reasonText).join(' · ')}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {delta.added.map((id) => (
          <div className="delta-row" key={`added-${id}`}>
            <span className="delta-tag delta-added">{t('delta.tagAdded')}</span>
            <span>{titleOf(id)}</span>
          </div>
        ))}

        {delta.shortened.map((s) => (
          <div className="delta-row" key={`short-${s.id}`}>
            <span className="delta-tag delta-shortened">{t('delta.tagShortened')}</span>
            <span>
              {titleOf(s.id)}
              <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 14 }}>
                {minutesLabel(s.beforeStayMin)} → {minutesLabel(s.afterStayMin)}
              </span>
            </span>
          </div>
        ))}

        {!delta.hasVisibleChange && (
          <div className="delta-row">
            <span className="delta-tag delta-added">{t('delta.tagKept')}</span>
            <span>{t('delta.keptBody')}</span>
          </div>
        )}

        <button type="button" className="btn" style={{ marginTop: 16 }} onClick={requestClose}>
          {t('common.confirm')}
        </button>
      </div>
    </div>
  );
}
