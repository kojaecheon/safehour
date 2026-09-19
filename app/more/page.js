'use client';

// /more — 더보기 (AX-318 · spec 3.1)
//
// 하단 내비 네 번째 탭. 카드·보호자·조건·체류 수정·설정·고지로 가는 입구만 모은다.
// 저장소를 읽거나 쓰지 않는다 — 보기 전용·오프라인에서도 그대로 보인다. 쓰기 제한은 각 화면이 한다.

import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider.js';
import { Icon, TopBar } from '@/components/ui/index.js';

/** 메뉴 — 이름·설명 문구 키와 아이콘 */
const MENU = Object.freeze([
  { href: '/cards', icon: 'quote', label: 'cards.header', desc: 'settings.moreCardsDesc' },
  { href: '/guardian', icon: 'stateTogether', label: 'settings.moreGuardian', desc: 'settings.moreGuardianDesc' },
  { href: '/conditions', icon: 'navConditions', label: 'common.navConditions', desc: 'settings.moreConditionsDesc' },
  { href: '/onboarding?edit=1', icon: 'navTrip', label: 'settings.moreStay', desc: 'settings.moreStayDesc' },
  { href: '/settings', icon: 'globe', label: 'settings.header', desc: 'settings.moreSettingsDesc' },
  { href: '/privacy', icon: 'lock', label: 'privacy.link', desc: 'settings.morePrivacyDesc' },
]);

export default function MorePage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('settings.moreHeader')} />
      <main className="page settings-page">
        <nav aria-label={t('settings.moreMenuAria')}>
          <ul className="settings-menu" role="list">
            {MENU.map((item) => (
              <li key={item.href}>
                <Link className="settings-menu-link" href={item.href}>
                  <span className="settings-menu-icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <span className="settings-menu-text">
                    <span className="settings-menu-label">{t(item.label)}</span>
                    <span className="settings-menu-desc">{t(item.desc)}</span>
                  </span>
                  <Icon name="chevronRight" size={20} className="settings-menu-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </>
  );
}
