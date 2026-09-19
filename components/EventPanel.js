'use client';

// 데모 사건 패널 — '병원 연동 데모' 모드에서만 (AX-317 · spec 4.9 변화 원천 6 · DemoEvent · 규칙 50·55)
//
// 연결된 병원 지침이 데모일 때만 하루 일정(오늘) 화면이 단다. 데모를 실제 연동처럼 보이지 않게
// '병원 연동 데모' 배지를 늘 붙인다(spec 9.1).
//   - 사건 6종: 휴무(아직 도착하지 않은 첫 장소) · 기상 악화 · 교통 지연 +20분 · 병원 일정 1시간 앞당김 · 환자 호출 · 위험신호
//   - 사건을 넣으면 반드시 오늘을 다시 판정한다(동기화 모듈 addDemoEvent). 알림만 띄우지 않는다.
//   - 오늘 들어온 사건 목록과 '사건 초기화'(오늘을 다시 판정)를 보인다.
//   - disabled 속성 대신 aria-disabled + 클릭 가드 — 누른 버튼의 포커스가 body 로 떨어지지 않게 한다.

import { useLang } from './LanguageProvider.js';
import { Badge } from './ui/index.js';
import { DEMO_EVENT_TYPES, demoEventFor } from './trip/viewModel.js';

const LABEL = {
  CLOSURE: { title: 'eventPanel.CLOSURE', desc: 'eventPanel.CLOSUREDesc', event: 'event.CLOSURE' },
  WEATHER: { title: 'eventPanel.WEATHER', desc: 'eventPanel.WEATHERDesc', event: 'event.WEATHER' },
  TRAFFIC_SURGE: { title: 'eventPanel.TRAFFIC_SURGE', desc: 'eventPanel.TRAFFIC_SURGEDesc', event: 'event.TRAFFIC_SURGE' },
  APPOINTMENT: { title: 'eventPanel.APPOINTMENT', desc: 'eventPanel.APPOINTMENTDesc', event: 'event.APPOINTMENT' },
  PATIENT_RECALL: { title: 'eventPanel.PATIENT_RECALL', desc: 'eventPanel.PATIENT_RECALLDesc', event: 'event.PATIENT_RECALL' },
  RISK_SIGNAL: { title: 'eventPanel.RISK_SIGNAL', desc: 'eventPanel.RISK_SIGNALDesc', event: 'event.RISK_SIGNAL' },
};

/**
 * @param {object} props
 * @param {object|null} props.day          오늘 저장 일정
 * @param {number} props.nowMin            KST 분
 * @param {object[]} props.events          오늘 들어온 데모 사건
 * @param {boolean} props.busy
 * @param {boolean} props.readOnly
 * @param {(event: object) => void} props.onEvent
 * @param {() => void} props.onReset
 */
export default function EventPanel({ day, nowMin, events = [], busy = false, readOnly = false, onEvent, onReset }) {
  const { t } = useLang();
  const blocked = busy || readOnly;

  return (
    <section className="trip-demo" aria-labelledby="trip-demo-h">
      <div className="trip-demo-head">
        <h2 id="trip-demo-h">{t('eventPanel.title')}</h2>
        <Badge kind="demo" />
      </div>
      <p className="trip-demo-lead">{t('eventPanel.lead')}</p>
      <div className="trip-demo-grid">
        {DEMO_EVENT_TYPES.map((type) => {
          const event = demoEventFor(type, day, nowMin);
          const disabled = blocked || !event;
          return (
            <button
              key={type}
              type="button"
              className="btn btn-secondary trip-demo-button"
              aria-disabled={disabled ? 'true' : undefined}
              onClick={() => {
                if (!disabled) onEvent(event);
              }}
            >
              <span className="trip-demo-title">{t(LABEL[type].title)}</span>
              <span className="trip-demo-desc">{t(LABEL[type].desc)}</span>
            </button>
          );
        })}
      </div>
      <div className="trip-demo-log">
        <h3>{t('trip.demoEvents')}</h3>
        {events.length === 0 ? (
          <p>{t('common.none')}</p>
        ) : (
          <ol>
            {events.map((event, i) => (
              <li key={`${event.type}-${i}`}>{t(LABEL[event.type]?.event ?? 'trip.demoUnknown')}</li>
            ))}
          </ol>
        )}
        <button
          type="button"
          className="btn btn-quiet btn-small"
          aria-disabled={blocked || events.length === 0 ? 'true' : undefined}
          onClick={() => {
            if (!blocked && events.length > 0) onReset();
          }}
        >
          {t('trip.demoReset')}
        </button>
      </div>
    </section>
  );
}
