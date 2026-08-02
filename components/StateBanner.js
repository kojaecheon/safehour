'use client';

// D08-CMP006 SafetyDecisionBanner
// NO_TOURISM 은 오류 컴포넌트가 아니라 정상 결과 배너로 표시한다 (D05 7장).

import { STATE_MESSAGE, REASON_TEXT } from '@/src/domain/states.js';

const STATE_LABEL = {
  NO_TOURISM: '관광 미추천',
  STANDBY: '대기',
  SPLIT_NEARBY: '보호자 근거리',
  TOGETHER: '동행 가능',
};

export default function StateBanner({ state, reasons = [], live = false }) {
  const message = STATE_MESSAGE[state];
  if (!message) return null;
  return (
    // 본문 콘텐츠이므로 status 롤을 덮어쓰지 않고, 재판정 갱신 고지만 aria-live 로 한다
    <section
      className={`state-banner state-${state}`}
      aria-live={live ? 'polite' : undefined}
    >
      <span className="state-label">{STATE_LABEL[state] ?? state}</span>
      <h2>{message.ko}</h2>
      {/* opacity 로 흐리게 하면 배너 배경 위에서 4.5:1 을 넘지 못한다.
          영문 병기는 보조 정보지만 안전 문구이므로 대비를 낮추지 않는다. */}
      <p lang="en" style={{ fontSize: 14 }}>{message.en}</p>
      <p>{message.action.ko}</p>
      {reasons.length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 14 }}>
          {reasons.map((code) => (
            <li key={code}>{REASON_TEXT[code]?.ko ?? code}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
