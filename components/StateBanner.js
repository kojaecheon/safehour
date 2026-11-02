'use client';

// D08-CMP006 SafetyDecisionBanner
// NO_TOURISM 은 오류 컴포넌트가 아니라 정상 결과 배너로 표시한다 (D05 7장).
//
// 안전 판정 문구는 **항상 두 언어로** 보인다. 사용자가 아직 언어를 바꾸지 않았거나
// 보호자와 환자의 언어가 다를 수 있기 때문에, 상태만은 병기를 유지한다 (AX-209).
// 병기 언어는 safetyPair() 가 정한다 (spec 4.17 · AX-303): 선택 언어+한국어, ko 면 한국어+영어,
// ja·zh 는 검수 스위치가 켜지기 전까지 영어+한국어.
//
// 모양 (AX-304 · spec 7장): 상태는 **색 + 문구 + 아이콘** 세 겹으로 보인다.
//   - 아이콘 모양이 상태마다 다르다(함께 걷는 두 사람 / 한 사람과 집 / 모래시계 / 달).
//   - NO_TOURISM 은 쉬는 날의 차분한 회청색과 달 아이콘이다 — 오류 빨강·경고 삼각형을 쓰지 않는다.
//   - 배경 위 모든 글자는 4.5:1 이상이다(app/globals.css 상태 토큰 주석).

import { useLang } from './LanguageProvider.js';
import Icon, { STATE_ICON } from './ui/Icon.js';
import { stateMessage } from '@/src/i18n/index.js';

export default function StateBanner({ state, reasons = [], live = false }) {
  const { lang, safety, t, stateMessage: primaryOf, reasonText } = useLang();
  const primary = primaryOf(state);
  if (!primary) return null;

  const otherLang = safety.secondary;
  const secondary = stateMessage(state, otherLang);
  // 주 언어가 화면 언어와 다르면(ja·zh 검수 전 → en) 스크린리더가 맞는 음성으로 읽게 표시한다
  const primaryLang = safety.primary === lang ? undefined : safety.primary;

  return (
    // 본문 콘텐츠이므로 status 롤을 덮어쓰지 않고, 재판정 갱신 고지만 aria-live 로 한다
    <section className={`state-banner state-${state}`} aria-live={live ? 'polite' : undefined}>
      <span className="state-label" lang={primaryLang}>
        <span className="state-icon">
          <Icon name={STATE_ICON[state]} size={20} strokeWidth={2.2} />
        </span>
        {t(`state.${state}`)}
      </span>
      <h2 lang={primaryLang}>{primary.message}</h2>
      {/* 투명도로 흐리게 하지 않는다 — 병기는 보조 정보지만 안전 문구이므로 대비를 낮추지 않는다 */}
      {secondary && (
        <p className="state-secondary" lang={otherLang}>
          {secondary.message}
        </p>
      )}
      <p className="state-action" lang={primaryLang}>
        {primary.action}
      </p>
      {reasons.length > 0 && (
        <ul className="state-reasons" lang={primaryLang}>
          {reasons.map((code) => (
            <li key={code}>{reasonText(code)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
