'use client';

// 개인정보·면책 고지 (AX-211 → AX-318 · spec 3.1 · 4.17 · 4.18 · 4.19)
//
// 정적 안내 화면이다. 판정·일정 흐름에 영향을 주지 않고, 더보기(/more)와 화면 하단 링크로 들어온다.
// 로그인 만료·오프라인에서도 보여준다(저장소를 읽지 않는다 — 내 정보 지우기 버튼만 저장소를 쓴다).
//
// 본문은 `src/i18n/legal.js` 가 소유한다 — 코드·명세에서 확인 가능한 사실만 적는다.
// 고지는 안전 문구다 (spec 4.17 · 규칙 43): 문단마다 주 언어와 병기 언어(한국어, ko 면 영어)를 함께 보여준다.
// 두 언어는 safetyPair() 가 고른다 — ja·zh 는 검수 스위치가 켜지기 전까지 영어 + 한국어다.

import ClearSessionButton from '@/components/ClearSessionButton.js';
import { useLang } from '@/components/LanguageProvider.js';
import PairText from '@/components/settings/PairText.js';
import { Icon, TopBar } from '@/components/ui/index.js';
import { LEGAL_SECTIONS } from '@/src/i18n/legal.js';
import { pickText } from '@/src/i18n/index.js';

const INTRO_KEY = 'privacy.intro';
const CONTACT_KEY = 'privacy.contactBody';

/** 고지 문단 하나 — 주 언어 줄 + 병기 줄 */
function Pair({ entry, as: Tag = 'p', className }) {
  const { safety } = useLang();
  return (
    <Tag className={className ? `settings-pair ${className}` : 'settings-pair'}>
      <span className="settings-pair-primary" lang={safety.primary}>
        {pickText(entry, safety.primary) ?? ''}
      </span>
      <span className="settings-pair-secondary" lang={safety.secondary}>
        {pickText(entry, safety.secondary) ?? ''}
      </span>
    </Tag>
  );
}

export default function PrivacyPage() {
  const { t, safety } = useLang();

  return (
    <>
      <TopBar title={t('privacy.header')} backHref="/more" />

      <main className="page privacy-page">
        <div className="ui-callout has-icon medical-callout privacy-intro" role="note">
          <span className="ui-callout-icon medical-callout-icon" aria-hidden="true">
            <Icon name="info" size={20} />
          </span>
          <PairText k={INTRO_KEY} />
        </div>

        {LEGAL_SECTIONS.map((section) => (
          <section className="privacy-section" key={section.id} id={`legal-${section.id}`} aria-labelledby={`legal-${section.id}-title`}>
            <h2 className="privacy-title" id={`legal-${section.id}-title`}>
              <span lang={safety.primary}>{pickText(section.title, safety.primary)}</span>
              <span className="privacy-title-secondary" lang={safety.secondary}>
                {pickText(section.title, safety.secondary)}
              </span>
            </h2>
            {section.lead && <Pair entry={section.lead} className="privacy-lead" />}
            {section.items && (
              <ul className="privacy-items" role="list">
                {section.items.map((item) => (
                  <Pair key={item.ko} entry={item} as="li" />
                ))}
              </ul>
            )}
            {section.note && <Pair entry={section.note} className="privacy-note" />}
          </section>
        ))}

        <section className="privacy-section" aria-labelledby="legal-contact-title">
          <h2 className="privacy-title" id="legal-contact-title">
            {t('privacy.contactTitle')}
          </h2>
          <PairText k={CONTACT_KEY} />
        </section>

        <div className="privacy-clear">
          <ClearSessionButton />
        </div>
      </main>
    </>
  );
}
