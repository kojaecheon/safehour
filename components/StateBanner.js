'use client';

// D08-CMP006 SafetyDecisionBanner
// NO_TOURISM 은 오류 컴포넌트가 아니라 정상 결과 배너로 표시한다 (D05 7장).
//
// 안전 판정 문구는 **항상 두 언어로** 보인다. 사용자가 아직 언어를 바꾸지 않았거나
// 보호자와 환자의 언어가 다를 수 있기 때문에, 상태만은 병기를 유지한다 (AX-209).

import { useLang } from './LanguageProvider.js';
import { stateMessage } from '@/src/i18n/index.js';

export default function StateBanner({ state, reasons = [], live = false }) {
  const { lang, t, stateMessage: primaryOf, reasonText } = useLang();
  const primary = primaryOf(state);
  if (!primary) return null;

  const otherLang = lang === 'ko' ? 'en' : 'ko';
  const secondary = stateMessage(state, otherLang);

  return (
    // 본문 콘텐츠이므로 status 롤을 덮어쓰지 않고, 재판정 갱신 고지만 aria-live 로 한다
    <section className={`state-banner state-${state}`} aria-live={live ? 'polite' : undefined}>
      <span className="state-label">{t(`state.${state}`)}</span>
      <h2>{primary.message}</h2>
      {/* opacity 로 흐리게 하면 배너 배경 위에서 4.5:1 을 넘지 못한다.
          병기는 보조 정보지만 안전 문구이므로 대비를 낮추지 않는다. */}
      {secondary && (
        <p lang={otherLang} style={{ fontSize: 14 }}>
          {secondary.message}
        </p>
      )}
      <p>{primary.action}</p>
      {reasons.length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 14 }}>
          {reasons.map((code) => (
            <li key={code}>{reasonText(code)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
