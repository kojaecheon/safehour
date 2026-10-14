'use client';

// /more — 더보기 (AX-318 · spec 3.1)
//
// 하단 내비 네 번째 탭. 카드·보호자·조건·체류 수정·설정·고지로 가는 입구만 모은다.
// 저장소를 읽거나 쓰지 않는다 — 보기 전용·오프라인에서도 그대로 보인다. 쓰기 제한은 각 화면이 한다.
// SEED ③층(설계서 6.2 11번): 회색 바탕 위 흰 블록 두 개(도구 · 정보), 목록 행 + 화살표.

import { useLang } from '@/components/LanguageProvider.js';
import { Icon, ListGroup, ListHeader, ListItem, TopBar } from '@/components/ui/index.js';

/** 메뉴 묶음: 머리 문구 키와 항목(이름·설명 문구 키, 아이콘) */
const GROUPS = Object.freeze([
  {
    id: 'more-tools',
    label: 'settings.moreGroupTools',
    items: [
      { href: '/cards', icon: 'quote', label: 'cards.header', desc: 'settings.moreCardsDesc' },
      { href: '/guardian', icon: 'stateTogether', label: 'settings.moreGuardian', desc: 'settings.moreGuardianDesc' },
      { href: '/conditions', icon: 'navConditions', label: 'common.navConditions', desc: 'settings.moreConditionsDesc' },
      { href: '/onboarding?edit=1', icon: 'navTrip', label: 'settings.moreStay', desc: 'settings.moreStayDesc' },
      { href: '/settings', icon: 'globe', label: 'settings.header', desc: 'settings.moreSettingsDesc' },
    ],
  },
  {
    id: 'more-info',
    label: 'settings.moreGroupInfo',
    items: [{ href: '/privacy', icon: 'lock', label: 'privacy.link', desc: 'settings.morePrivacyDesc' }],
  },
]);

export default function MorePage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('settings.moreHeader')} />
      <main className="page settings-page more-page is-basement">
        <nav aria-label={t('settings.moreMenuAria')}>
          {GROUPS.map((group) => (
            <section key={group.id} className="ui-block" aria-labelledby={`${group.id}-h`}>
              <ListHeader id={`${group.id}-h`}>{t(group.label)}</ListHeader>
              <ListGroup>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <ListItem
                      title={t(item.label)}
                      description={t(item.desc)}
                      leading={<Icon name={item.icon} size={22} />}
                      trailing="chevron"
                      href={item.href}
                    />
                  </li>
                ))}
              </ListGroup>
            </section>
          ))}
        </nav>
      </main>
    </>
  );
}
