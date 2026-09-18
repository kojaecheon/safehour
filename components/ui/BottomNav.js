'use client';

// 하단 내비 4개 (AX-304 · spec 3.1): 오늘 /today · 일정 /trip · 조건 /conditions · 더보기 /more
//
// - 현재 화면은 aria-current="page" + 포인트 색 + 굵기 + 알약 바탕 + 윗줄로 표시한다(색 단독 금지).
// - 하위 화면도 해당 탭을 현재로 본다(예: /trip/2026-10-03 · /place/… → 일정, /link → 조건).
// - /design-board 는 내비에 넣지 않는다(spec 7장).

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

export const NAV_ITEMS = Object.freeze([
  { href: '/today', key: 'common.navToday', icon: 'navToday', also: [] },
  { href: '/trip', key: 'common.navTrip', icon: 'navTrip', also: ['/place'] },
  { href: '/conditions', key: 'common.navConditions', icon: 'navConditions', also: ['/link', '/guide'] },
  { href: '/more', key: 'common.navMore', icon: 'navMore', also: ['/cards', '/guardian', '/settings', '/privacy'] },
]);

function under(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** 이 경로에서 현재로 표시할 탭의 href — 없으면 null */
export function activeNavHref(pathname) {
  const path = pathname || '/';
  const item = NAV_ITEMS.find((it) => under(path, it.href) || it.also.some((base) => under(path, base)));
  return item?.href ?? null;
}

/**
 * @param {{ pathname: string, preview?: boolean }} props
 */
export default function BottomNav({ pathname, preview = false }) {
  const { t } = useLang();
  const active = activeNavHref(pathname);
  // 미리보기(시안 보드)는 진짜 내비와 랜드마크가 겹치지 않게 nav 가 아닌 div 로 그린다
  const Root = preview ? 'div' : 'nav';
  return (
    <Root
      className={preview ? 'ui-bottom-nav is-preview' : 'ui-bottom-nav'}
      aria-label={preview ? undefined : t('common.navAria')}
    >
      <ul role="list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={active === item.href ? 'page' : undefined}>
              <span className="ui-nav-pill">
                <Icon name={item.icon} size={22} />
              </span>
              <span>{t(item.key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Root>
  );
}
