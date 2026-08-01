'use client';

// SCR007 — 실시간 변화 시연 패널
// 이벤트를 주입하면 반드시 재판정한다. 알림만 표시하고 코스를 유지하지 않는다 (D07-BAN008).

const EVENTS = [
  {
    key: 'CLOSURE',
    label: '1순위 장소 휴무',
    describe: '지금 코스의 1순위 장소가 휴무가 됩니다.',
    build: (topCandidateId) => ({ type: 'CLOSURE', closedIds: [topCandidateId] }),
    needsCourse: true,
  },
  {
    key: 'WEATHER',
    label: '기상 악화',
    describe: '실외 활동이 부적합해집니다.',
    build: () => ({ type: 'WEATHER' }),
  },
  {
    key: 'TRAFFIC_SURGE',
    label: '교통 지연 +20분',
    describe: '이동시간에 보수 버퍼가 더해집니다.',
    build: () => ({ type: 'TRAFFIC_SURGE', extraMin: 20 }),
  },
  {
    key: 'APPOINTMENT',
    label: '진료 1시간 앞당김',
    describe: '복귀 가능 시간이 줄어듭니다.',
    build: () => ({ type: 'APPOINTMENT', deltaMin: -60 }),
  },
  {
    key: 'RISK_SIGNAL',
    label: '위험신호 입력',
    describe: '해석 없이 입력 사실만으로 추천을 중단합니다.',
    build: () => ({ type: 'RISK_SIGNAL' }),
  },
  {
    key: 'PATIENT_RECALL',
    label: '환자 호출',
    describe: '모든 추천을 무효화하고 즉시 복귀로 전환합니다.',
    build: () => ({ type: 'PATIENT_RECALL' }),
  },
];

export default function EventPanel({ topCandidateId, busy, onEvent }) {
  return (
    <section className="card" aria-labelledby="event-h">
      <h2 id="event-h">실시간 변화 시연</h2>
      <p style={{ fontSize: 14, marginBottom: 12 }}>
        변화가 생기면 코스를 처음부터 다시 판정합니다. 알림만 띄우고 기존 코스를 유지하는 동작은
        하지 않습니다.
      </p>
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
              <span>{event.label}</span>
              <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--ink-soft)', lineHeight: 1.35 }}>
                {event.describe}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
