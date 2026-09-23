'use client';

// 앱 셸 (AX-304 · spec 3.1 · 4.18)
//
//   [보기 전용 배너 자리]   ← 저장소 상태로 자동 표시 (ReadOnlyBanner)
//   [긴급 연락 버튼]        ← 늘 하단에 붙어 있다. 내비가 있으면 다섯째 칸, 없으면 하단 긴급 바.
//                            떠 있게 두면 본문의 누를 수 있는 요소를 덮는다(입력 칸·'다음'·언어 칸).
//   [화면 본문]             ← 각 화면이 자기 상단 바(.top-bar / TopBar)와 main.page 를 그린다
//   [하단 내비 5개]         ← 로그인 전 흐름(/, /login, /onboarding, /g)에서는 숨긴다. 긴급이 다섯째 칸이다
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

/** 긴급을 셸이 그리지 않는 경로 — 그 화면이 자기 하단 바 안에 직접 그린다 */
export const EMERGENCY_IN_PAGE_PATHS = Object.freeze(['/']);

function matches(pathname, list) {
  return list.some((base) => (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)));
}

export default function AppShell({ children }) {
  const pathname = usePathname() ?? '/';
  const showNav = !matches(pathname, NAV_HIDDEN_PATHS);
  const showStatus = !matches(pathname, STATUS_HIDDEN_PATHS);
  const emergencyInPage = matches(pathname, EMERGENCY_IN_PAGE_PATHS);
  const showEmergencyBar = !showNav && !emergencyInPage;
  const refreshed = useRef(false);

  useEffect(() => {
    if (!showStatus || refreshed.current) return;
    refreshed.current = true;
    // 실패(네트워크 없음)는 저장소가 오프라인 보기 전용으로 바꿔 둔다
    void getStore().refreshSession();
  }, [showStatus]);

  return (
    <div className="app-shell" data-nav={showNav ? 'on' : 'off'} data-emergency-bar={showEmergencyBar ? 'on' : 'off'}>
      {showStatus && <ReadOnlyBanner />}
      {children}
      {showNav && <BottomNav pathname={pathname} />}
      {/* 긴급은 어느 화면에서든 닿아야 한다(spec 4.15).
          내비가 있으면 다섯째 칸이, 없으면 이 바가 그 역할을 한다. 떠 있게 두지 않는다. */}
      {showEmergencyBar && (
        <div className="ui-emergency-bar">
          <EmergencyButton current={pathname === '/emergency'} docked />
        </div>
      )}
    </div>
  );
}
