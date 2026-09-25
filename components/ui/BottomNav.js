'use client';

// 하단 내비 5개 (AX-304 · spec 3.1 · 4.15): 오늘 /today · 일정 /trip · 조건 /conditions · 더보기 /more · 긴급 /emergency
//
// 긴급은 내비 칸이다 — 떠 있는 버튼은 본문 위에 얹혀 누를 수 있는 요소를 덮었다(중국어 선택 칸 41% 등).
// 내비가 없는 로그인 전 흐름에서는 앱 셸이 떠 있는 버튼을 대신 그린다.
//
// - 현재 화면은 aria-current="page" + 채운 아이콘 + 진한 글자 + 굵기로 표시한다(색 단독 금지 · SEED Bottom Navigation).
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
  { href: '/emergency', key: 'common.navEmergency', icon: 'phone', also: [], emergency: true },
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
            <Link
              href={item.href}
              className={item.emergency ? 'is-emergency' : undefined}
              // 보이는 글자는 칸에 맞게 짧지만('긴급'·'SOS'), 읽히는 이름은 온전하게 둔다('긴급 연락').
              // 안전 동작이라 스크린리더에서 줄이면 안 된다. 짧은 글자가 긴 이름에 들어 있어 라벨 규칙도 지킨다.
              aria-label={item.emergency ? t('common.emergency') : undefined}
              aria-current={active === item.href ? 'page' : undefined}
            >
              {/* 현재 칸은 채운 아이콘 — 선 아이콘과 모양이 달라 색 없이도 구분된다 */}
              <span className="ui-nav-icon">
                <Icon name={active === item.href ? `${item.icon}Fill` : item.icon} size={24} />
              </span>
              <span>{t(item.key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Root>
  );
}
