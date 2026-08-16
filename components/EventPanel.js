'use client';

// SCR007 — 실시간 변화 시연 패널
// 이벤트를 주입하면 반드시 재판정한다. 알림만 표시하고 코스를 유지하지 않는다 (D07-BAN008).

import { useLang } from './LanguageProvider.js';

const EVENTS = [
  {
    key: 'CLOSURE',
    build: (topCandidateId) => ({ type: 'CLOSURE', closedIds: [topCandidateId] }),
    needsCourse: true,
  },
  { key: 'WEATHER', build: () => ({ type: 'WEATHER' }) },
  { key: 'TRAFFIC_SURGE', build: () => ({ type: 'TRAFFIC_SURGE', extraMin: 20 }) },
  { key: 'APPOINTMENT', build: () => ({ type: 'APPOINTMENT', deltaMin: -60 }) },
  { key: 'RISK_SIGNAL', build: () => ({ type: 'RISK_SIGNAL' }) },
  { key: 'PATIENT_RECALL', build: () => ({ type: 'PATIENT_RECALL' }) },
];

export default function EventPanel({ topCandidateId, busy, onEvent }) {
  const { t } = useLang();

  return (
    <section className="card" aria-labelledby="event-h">
      <h2 id="event-h">{t('eventPanel.title')}</h2>
      <p style={{ fontSize: 14, marginBottom: 12 }}>{t('eventPanel.lead')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {EVENTS.map((event) => {
          const disabled = busy || (event.needsCourse && !topCandidateId);
          return (
            <button
              key={event.key}
              type="button"
              className="btn btn-secondary btn-small"
              style={{ width: '100%', flexDirection: 'column', gap: 2, padding: '10px 8px' }}
              // disabled 속성은 포커스를 body 로 떨어뜨려 키보드 위치와
              // 모달 포커스 복원을 깨뜨린다 — aria-disabled + 클릭 가드로 대체
              aria-disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onEvent(event.build(topCandidateId));
              }}
            >
              <span>{t(`eventPanel.${event.key}`)}</span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  color: 'var(--ink-soft)',
                  lineHeight: 1.35,
                }}
              >
                {t(`eventPanel.${event.key}Desc`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
