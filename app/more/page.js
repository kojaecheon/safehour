'use client';

// /more — 더보기 (AX-318 · spec 3.1)
//
// 하단 내비 네 번째 탭. 카드·보호자·조건·체류 수정·설정·고지로 가는 입구만 모은다.
// 저장소는 보호자 사본이 있는지만 읽는다(읽기 전용, 사본 내용은 꺼내지 않는다). 쓰지 않는다.
// 사본이 있으면 도구 맨 위에 '받은 일정(보호자)'를 둔다(components/settings/moreMenu.js, usability 2026-11-08 D1).
// 보기 전용·오프라인에서도 그대로 보인다. 쓰기 제한은 각 화면이 한다.
// SEED ③층(설계서 6.2 11번): 회색 바탕 위 흰 블록 두 개(도구 · 정보), 목록 행 + 화살표.

import { useHasGuardianCopies } from '@/components/cards/useDeviceData.js';
import { useLang } from '@/components/LanguageProvider.js';
import InstallCallout from '@/components/pwa/InstallCallout.js';
import { moreMenuGroups } from '@/components/settings/moreMenu.js';
import { Icon, ListGroup, ListHeader, ListItem, TopBar } from '@/components/ui/index.js';

export default function MorePage() {
  const { t } = useLang();
  const groups = moreMenuGroups({ hasGuardianCopies: useHasGuardianCopies() });
  return (
    <>
      <TopBar title={t('settings.moreHeader')} />
      <main className="page more-page is-basement">
        <nav aria-label={t('settings.moreMenuAria')}>
          {groups.map((group) => (
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
        <InstallCallout />
      </main>
    </>
  );
}
