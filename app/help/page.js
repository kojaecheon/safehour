'use client';

// /help: 도움말 (S5)
//
// 정적 안내 화면이다. 저장소를 읽지 않고 판정·일정 흐름에 영향을 주지 않는다. 더보기(/more)에서 들어온다.
// 구성: 앱이 하는 일과 하지 않는 일 · 홈 화면에 추가하기(#install) · 알림이 오지 않을 때 · 자주 묻는 질문 · 문의.
// 문의는 NEXT_PUBLIC_SAFEHOUR_CONTACT 가 있을 때만 그린다 (docs/operations.md '환경변수').
// 문구는 help 이름공간이 갖는다. 앱이 하지 않는 일은 안전 문구라 safety 구역에 있고, t() 가 주 언어로 보여 준다.

import { useLang } from '@/components/LanguageProvider.js';
import { contactLink } from '@/components/help/contact.js';
import { TopBar } from '@/components/ui/index.js';

const ABOUT_KEYS = ['help.about1', 'help.about2', 'help.about3', 'help.about4', 'help.about5', 'help.about6'];
const IOS_KEYS = ['help.installIos1', 'help.installIos2', 'help.installIos3', 'help.installIos4'];
const ANDROID_KEYS = ['help.installAndroid1', 'help.installAndroid2', 'help.installAndroid3'];
// 설정 화면이 이미 갖고 있는 문장(settings.notifyDisclosure)은 그대로 쓴다
const NOTIFY_KEYS = ['help.notify1', 'help.notify2', 'help.notify3', 'settings.notifyDisclosure', 'help.notify5'];
const FAQ = [
  ['help.faq1Q', 'help.faq1A'],
  ['help.faq2Q', 'help.faq2A'],
  ['help.faq3Q', 'help.faq3A'],
  ['help.faq4Q', 'help.faq4A'],
  ['help.faq5Q', 'help.faq5A'],
  ['help.faq6Q', 'help.faq6A'],
  ['help.faq7Q', 'help.faq7A'],
];

const CONTACT = contactLink(process.env.NEXT_PUBLIC_SAFEHOUR_CONTACT);

export default function HelpPage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('help.header')} backHref="/more" />
      <main className="page help-page">
        <section className="help-section" aria-labelledby="help-about-h">
          <h2 className="help-title" id="help-about-h">
            {t('help.aboutTitle')}
          </h2>
          <p className="help-lead">{t('help.aboutLead')}</p>
          <ul className="help-items" role="list">
            {ABOUT_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>

        <section className="help-section" id="install" aria-labelledby="help-install-h">
          <h2 className="help-title" id="help-install-h">
            {t('help.installTitle')}
          </h2>
          <p className="help-lead">{t('help.installLead')}</p>
          <h3 className="help-subtitle">{t('help.installIosTitle')}</h3>
          <ol className="help-steps" role="list">
            {IOS_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
          <h3 className="help-subtitle">{t('help.installAndroidTitle')}</h3>
          <ol className="help-steps" role="list">
            {ANDROID_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        </section>

        <section className="help-section" id="notifications" aria-labelledby="help-notify-h">
          <h2 className="help-title" id="help-notify-h">
            {t('help.notifyTitle')}
          </h2>
          <ul className="help-items" role="list">
            {NOTIFY_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>

        <section className="help-section" id="faq" aria-labelledby="help-faq-h">
          <h2 className="help-title" id="help-faq-h">
            {t('help.faqTitle')}
          </h2>
          <div className="help-faq">
            {FAQ.map(([q, a]) => (
              <details className="help-faq-item" key={q}>
                <summary className="help-faq-q">{t(q)}</summary>
                <p className="help-faq-a">{t(a)}</p>
              </details>
            ))}
          </div>
        </section>

        {CONTACT && (
          <section className="help-section" id="contact" aria-labelledby="help-contact-h">
            <h2 className="help-title" id="help-contact-h">
              {t('help.contactTitle')}
            </h2>
            <p className="help-lead">{t('help.contactLead')}</p>
            <p className="help-contact">
              {CONTACT.href ? (
                <a className="help-contact-link" href={CONTACT.href} rel="noopener noreferrer">
                  {CONTACT.label}
                </a>
              ) : (
                CONTACT.label
              )}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
