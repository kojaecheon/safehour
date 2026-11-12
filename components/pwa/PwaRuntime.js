'use client';

// 설치·오프라인·알림 실행 부품 (AX-319 · spec 4.13 · 4.18)
//
// app/layout.js 가 앱 셸 옆에 한 번 단다. 화면 데이터를 받지 않는다.
//   1. 서비스 워커 등록 — 운영 빌드에서만(public/sw.js). 오프라인 보기 전용 화면과 설치를 켠다.
//   2. 세션 유지 — 창에 초점이 오거나 화면이 다시 보이면(1분에 한 번), 다시 온라인이 되면 바로
//      저장소 refreshSession() 을 부른다. 보기 전용 배너·보류 중인 로그아웃 재전송은 저장소가 판단한다.
//      셸이 세션을 묻지 않는 경로(STATUS_HIDDEN_PATHS: 시작·로그인·시안 보드)에서는 부르지 않는다. 받은 링크 화면(/g)은
//      배너만 없고 세션은 묻는 경로라 여기서도 부른다(components/ui/shellPaths.js).
//   3. 앱 안 알림 배너(NotificationBanner) — 시안 보드에서는 달지 않는다(사용자 데이터를 읽지 않는 화면, spec 7장).

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { STATUS_HIDDEN_PATHS } from '@/components/ui/AppShell.js';
import { getStore } from '@/lib/store/index.js';
import { getNotifier } from '@/lib/notify/client.js';
import NotificationBanner from './NotificationBanner.js';
import { registerServiceWorker } from './registerServiceWorker.js';
import { attachSessionUpkeep, createSessionUpkeep } from './sessionUpkeep.js';

const DESIGN_BOARD = '/design-board';

function inPaths(pathname, list) {
  return list.some((base) => (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)));
}

export default function PwaRuntime() {
  const pathname = usePathname() ?? '/';
  const upkeepOn = !inPaths(pathname, STATUS_HIDDEN_PATHS);
  const onBoard = inPaths(pathname, [DESIGN_BOARD]);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return undefined;
    return registerServiceWorker(window);
  }, []);

  useEffect(() => {
    if (!upkeepOn) return undefined;
    // 셸이 첫 화면에서 방금 세션을 물었다 — 조절 시계는 지금부터 센다(경로가 바뀌어도 이어 간다)
    triggerRef.current ??= createSessionUpkeep({
      refresh: () => getStore().refreshSession(),
      lastRefreshAt: Date.now(),
    });
    return attachSessionUpkeep(window, triggerRef.current, () => getNotifier()?.tick());
  }, [upkeepOn]);

  if (onBoard) return null;
  return <NotificationBanner />;
}
