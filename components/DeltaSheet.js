'use client';

// 변화 재계산 결과 — 무엇이 왜 바뀌었는지 전후 비교 (D04-DB005 ChangeDelta)
//
// 이 시트는 "설명 전용"이다. 재판정 결과는 이 시트가 뜨기 전에 이미 화면과
// 세션에 적용되어 있다. 알림만 표시하고 기존 코스를 유지하는 선택지는
// 존재하지 않는다 (D07-BAN008).

import { STATE_MESSAGE, REASON_TEXT } from '@/src/domain/states.js';
import { minutesLabel } from '@/lib/format.js';
import { useModalSheet } from '@/lib/useModalSheet.js';

const EVENT_LABEL = {
  CLOSURE: '장소 휴무',
  WEATHER: '기상 악화',
  TRAFFIC_SURGE: '교통 지연',
  APPOINTMENT: '진료시간 변경',
  PATIENT_RECALL: '환자 호출',
  RISK_SIGNAL: '위험신호 입력',
};

export default function DeltaSheet({ recalc, titles = {}, onClose }) {
  const { event, before, after, delta } = recalc;
  const sheetRef = useModalSheet(onClose);

  function titleOf(id) {
    const key = String(id);
    if (titles[key]) return titles[key];
    const inAfter = recalc.result.course.find((c) => String(c.id) === key);
    if (inAfter) return inAfter.title;
    const excluded = recalc.result.excluded.find((c) => String(c.id) === key);
    return excluded?.title ?? id;
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="delta-h">
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <h2 id="delta-h" style={{ marginBottom: 4 }}>
          {EVENT_LABEL[event.type] ?? event.type} 발생
        </h2>
        <p style={{ marginBottom: 14 }}>
          코스를 처음부터 다시 판정해 아래 결과를 <strong>이미 적용했습니다</strong>.
          {delta.hasVisibleChange ? ' 변화 내용을 확인하세요.' : ' 기존 코스가 조건을 계속 충족합니다.'}
        </p>

        {delta.stateChanged && (
          <div className="delta-row">
            <span className="delta-tag delta-state">상태 변경</span>
            <span>
              {STATE_MESSAGE[before.state]?.ko ?? before.state} →{' '}
              <strong>{STATE_MESSAGE[after.state]?.ko ?? after.state}</strong>
              {after.reasons?.length > 0 && (
                <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 14 }}>
                  {after.reasons.map((r) => REASON_TEXT[r]?.ko ?? r).join(' · ')}
                </span>
              )}
            </span>
          </div>
        )}

        {delta.removed.map((id) => {
          const excludedEntry = recalc.result.excluded.find((e) => String(e.id) === String(id));
          return (
            <div className="delta-row" key={`removed-${id}`}>
              <span className="delta-tag delta-removed">제거</span>
              <span>
                {titleOf(id)}
                {excludedEntry && (
                  <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 14 }}>
                    {excludedEntry.reasons.map((r) => REASON_TEXT[r]?.ko ?? r).join(' · ')}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {delta.added.map((id) => (
          <div className="delta-row" key={`added-${id}`}>
            <span className="delta-tag delta-added">대체 투입</span>
            <span>{titleOf(id)}</span>
          </div>
        ))}

        {delta.shortened.map((s) => (
          <div className="delta-row" key={`short-${s.id}`}>
            <span className="delta-tag delta-shortened">체류 축소</span>
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
            <span className="delta-tag delta-added">유지</span>
            <span>조건과 복귀 SLA를 계속 충족해 코스가 유지됩니다.</span>
          </div>
        )}

        <button type="button" className="btn" style={{ marginTop: 16 }} onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}
