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
// - 세션 확인과 배너 표시는 따로 정한다(shellPaths.js shellFlags). 받은 링크 화면(/g)은 세션은 묻고 배너는 두지 않는다.
// - 하단 내비가 보이면 `.app-shell[data-nav='on']` 이 되어 `--nav-offset` 이 켜지고,
//   고정 요소(.sticky-return, 긴급 버튼)가 내비 위로 올라선다.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getStore } from '@/lib/store/index.js';
import BottomNav from './BottomNav.js';
import EmergencyButton from './EmergencyButton.js';
import ReadOnlyBanner from './ReadOnlyBanner.js';
import { shellFlags } from './shellPaths.js';

// 경로별 규칙은 shellPaths.js 한곳에 있다. 다른 모듈이 쓰던 이름은 여기서 그대로 내보낸다.
export { BANNER_HIDDEN_PATHS, EMERGENCY_IN_PAGE_PATHS, NAV_HIDDEN_PATHS, STATUS_HIDDEN_PATHS } from './shellPaths.js';

export default function AppShell({ children }) {
  const pathname = usePathname() ?? '/';
  const { showNav, checkSession, showBanner, showEmergencyBar } = shellFlags(pathname);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!checkSession || refreshed.current) return;
    refreshed.current = true;
    // 실패(네트워크 없음)는 저장소가 오프라인 보기 전용으로 바꿔 둔다
    void getStore().refreshSession();
  }, [checkSession]);

  return (
    <div className="app-shell" data-nav={showNav ? 'on' : 'off'} data-emergency-bar={showEmergencyBar ? 'on' : 'off'}>
      {showBanner && <ReadOnlyBanner />}
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
