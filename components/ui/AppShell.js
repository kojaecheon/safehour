'use client';

// 앱 셸 (AX-304 · spec 3.1 · 4.18)
//
//   [보기 전용 배너 자리]   ← 저장소 상태로 자동 표시 (ReadOnlyBanner)
//   [긴급 연락 버튼]        ← 모든 화면 고정 (EmergencyButton, DOM 에서는 본문 앞)
//   [화면 본문]             ← 각 화면이 자기 상단 바(.top-bar / TopBar)와 main.page 를 그린다
//   [하단 내비 4개]         ← 로그인 전 흐름(/, /login, /onboarding, /g)에서는 숨긴다
//
// - 세션 확인(getStore().refreshSession())은 셸이 처음 한 번 한다. 그 전까지 저장소는 보기 전용이다.
//   화면은 useStoreStatus() 로 결과만 읽는다.
// - 하단 내비가 보이면 `.app-shell[data-nav='on']` 이 되어 `--nav-offset` 이 켜지고,
//   고정 요소(.sticky-return, 긴급 버튼)가 내비 위로 올라선다.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getStore } from '@/lib/store/index.js';
import BottomNav from './BottomNav.js';
import EmergencyButton from './EmergencyButton.js';
import ReadOnlyBanner from './ReadOnlyBanner.js';

/** 하단 내비를 숨기는 경로 — 로그인 전 흐름과 보호자 링크 열기 */
export const NAV_HIDDEN_PATHS = Object.freeze(['/', '/login', '/onboarding', '/g']);

/**
 * 보기 전용 배너를 두지 않는 경로.
 *   - `/`, `/login`: 로그인 자체를 안내하는 화면이라 배너가 겹말이 된다.
 *   - `/design-board`: 고정 데모 데이터만 쓴다 — 사용자 상태를 읽지 않는다(spec 7장).
 */
export const STATUS_HIDDEN_PATHS = Object.freeze(['/', '/login', '/design-board']);

function matches(pathname, list) {
  return list.some((base) => (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)));
}

export default function AppShell({ children }) {
  const pathname = usePathname() ?? '/';
  const showNav = !matches(pathname, NAV_HIDDEN_PATHS);
  const showStatus = !matches(pathname, STATUS_HIDDEN_PATHS);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!showStatus || refreshed.current) return;
    refreshed.current = true;
    // 실패(네트워크 없음)는 저장소가 오프라인 보기 전용으로 바꿔 둔다
    void getStore().refreshSession();
  }, [showStatus]);

  return (
    <div className="app-shell" data-nav={showNav ? 'on' : 'off'}>
      {showStatus && <ReadOnlyBanner />}
      <EmergencyButton current={pathname === '/emergency'} />
      {children}
      {showNav && <BottomNav pathname={pathname} />}
    </div>
  );
}
