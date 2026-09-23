'use client';

import { useEffect, useState } from 'react';
import FooterLinks from '@/components/FooterLinks.js';
import { useLang } from '@/components/LanguageProvider.js';
import { SafetyNote } from '@/components/onboarding/Fields.js';
import StartArt from '@/components/onboarding/StartArt.js';
import { Button, Icon, TopBar } from '@/components/ui/index.js';
import EmergencyButton from '@/components/ui/EmergencyButton.js';
import { takeClearedFlag } from '@/lib/session.js';
import { LANGS, LANG_NAMES } from '@/src/i18n/index.js';

// SCR001 — 시작 화면 (AX-314 · spec 3.1 `/`: 언어 선택, 고지 3종, 로그인 유도)
//
// - 머리글에 '안심'·'안전' 같은 보증 표현을 쓰지 않는다(spec 9.1 — 조건 통과와 안전은 다르다).
// - 고지 3종과 의료 면책은 안전 문구다. 선택 언어 + 한국어(ko 면 영어)로 두 줄씩 보인다(spec 4.17 · pair()).
// - 언어는 상단 지구본 버튼 말고도 여기서 바로 고를 수 있다 — 첫 화면에서 가장 먼저 필요한 동작이다.
// - 시작하기 → 로그인 → 체류 설정(spec 3.2 기본 흐름).
// - **시작하기는 고지 3종보다 위에 둔다.** 고지가 먼저 오면 처음 온 사람이 들어가는 문을 보기까지
//   두 화면을 넘겨야 한다(고지만 906px). 고지는 지우지 않고 자리만 아래로 옮겼다 — 같은 화면에 그대로 있다.

const NOTICES = [
  { icon: 'hospital', title: 'home.p1Title', body: 'home.p1Body' },
  { icon: 'map', title: 'home.p2Title', body: 'home.p2Body' },
  { icon: 'bed', title: 'home.p3Title', body: 'home.p3Body' },
];

const FOOTER_NOTICE = 'home.footer';
const START_HREF = '/login?returnTo=%2Fonboarding';

function Notice({ icon, titleKey, bodyKey }) {
  const { pair } = useLang();
  const title = pair(titleKey);
  const body = pair(bodyKey);
  return (
    <li className="onboarding-notice">
      <span className="onboarding-notice-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <div className="onboarding-notice-text">
        <div lang={title.primary.lang}>
          <h3 className="onboarding-notice-title">{title.primary.text}</h3>
          <p>{body.primary.text}</p>
        </div>
        <div className="onboarding-notice-secondary" lang={title.secondary.lang}>
          <p>
            <strong>{title.secondary.text}</strong> {body.secondary.text}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function HomePage() {
  const { t, lang, setLang } = useLang();
  const [cleared, setCleared] = useState(false);

  // "내 정보 지우기" 는 전체 새로고침으로 이 화면에 도착한다 (AX-210).
  // 삭제가 실제로 일어났음을 한 번만 알린다.
  useEffect(() => {
    const timer = window.setTimeout(() => setCleared(takeClearedFlag()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <TopBar title="SafeHour" as="p" />
      <main className="page onboarding-start">
        {cleared && (
          <div className="state-banner state-TOGETHER" role="status">
            <p>{t('home.clearedNotice')}</p>
          </div>
        )}

        <section className="onboarding-hero" aria-labelledby="home-title">
          <div className="onboarding-hero-art">
            <StartArt />
          </div>
          <h1 id="home-title" className="onboarding-hero-title">
            <span>{t('home.titleLine1')}</span> <span>{t('home.titleLine2')}</span>
          </h1>
          <p className="onboarding-hero-lead">{t('home.lead')}</p>
        </section>

        <section className="onboarding-section" aria-labelledby="home-lang">
          <h2 id="home-lang">{t('onboarding.langTitle')}</h2>
          <p className="onboarding-hint" id="home-lang-hint">
            {t('onboarding.langHint')}
          </p>
          <ul className="onboarding-lang-grid" role="list">
            {LANGS.map((code) => {
              const selected = lang === code;
              return (
                <li key={code}>
                  <button
                    type="button"
                    lang={code}
                    className="onboarding-lang-option"
                    aria-pressed={selected}
                    onClick={() => setLang(code)}
                  >
                    <span className="onboarding-lang-check" aria-hidden="true">
                      {selected ? <Icon name="check" size={18} strokeWidth={2.8} /> : <Icon name="globe" size={18} />}
                    </span>
                    {LANG_NAMES[code]}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 하단 고정 바 — 긴급과 시작하기를 한 줄에 둔다.
            떠 있는 긴급 버튼은 어디에 두든 본문을 덮었다(시작하기 131x31px, 언어 칸 '中文' 41%).
            바 안에 넣으면 덮는 것이 없고 둘 다 늘 닿는다. 셸은 이 경로에서 떠 있는 버튼을 그리지 않는다. */}
        <div className="onboarding-cta sticky-return">
          <div className="onboarding-cta-row">
            <EmergencyButton docked />
            <Button href={START_HREF}>{t('home.cta')}</Button>
          </div>
        </div>

        <section className="onboarding-section" aria-labelledby="home-principles">
          <h2 id="home-principles">{t('home.principlesTitle')}</h2>
          <ul className="onboarding-notices" role="list" aria-label={t('home.principlesAria')}>
            {NOTICES.map((notice) => (
              <Notice key={notice.title} icon={notice.icon} titleKey={notice.title} bodyKey={notice.body} />
            ))}
          </ul>
        </section>

        <SafetyNote noticeKey={FOOTER_NOTICE} className="onboarding-safety onboarding-footer-note" />

        <FooterLinks />
      </main>
    </>
  );
}
