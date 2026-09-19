// 스타일 등록 — 이곳 한 군데에서만 한다 (AX-304 · plan '공유 파일 쓰기 안내')
//   1) 토큰·기본 스타일 (AX-304 만 수정)
//   2) 기본 부품·앱 셸 (AX-304 만 수정)
//   3) 기능별 스타일 — 각 화면 작업이 자기 파일만 수정한다. 새 파일을 더하지 말고 보고한다.
import './globals.css';
import './styles/ui.css';
import './styles/onboarding.css';
import './styles/conditions.css';
import './styles/today.css';
import './styles/trip.css';
import './styles/place.css';
import './styles/cards.css';
import './styles/emergency.css';
import './styles/guardian.css';
import './styles/settings.css';
import './styles/privacy.css';
import './styles/designBoard.css';
import LanguageProvider from '@/components/LanguageProvider.js';
import AppShell from '@/components/ui/AppShell.js';
// 설치·오프라인·알림 (AX-319): 서비스 워커 등록(운영 빌드만)·세션 유지·앱 안 알림 배너
import PwaRuntime from '@/components/pwa/PwaRuntime.js';

export const metadata = {
  title: 'SafeHour — 안심 관광 추천 / Safe outings within hospital instructions',
  description:
    '수술·시술 후 외국인 환자와 보호자에게 병원 조건과 복귀시간 안에서 안전한 관광 활동을 추천합니다. SafeHour는 의료 판단을 하지 않습니다. — SafeHour suggests tourism only within the precautions and return time set by your hospital. It makes no medical judgements.',
  // 앱 설치 (AX-319): 매니페스트는 app/manifest.js 가 자동으로 링크한다. 아이콘은 public/icons/*
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'SafeHour', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // 브라우저 주소창 색 — 흰 바탕 앱 셸과 맞춘다 (globals.css --bg)
  themeColor: '#ffffff',
};

// lang="ko" 는 서버 렌더 기본값이다. 클라이언트에서 사용자 설정·브라우저 언어에 따라
// LanguageProvider 가 document.documentElement.lang 을 갱신한다 (WCAG 3.1.1).
//
// 앱 셸(AppShell)은 모든 화면에 긴급 연락 버튼과 보기 전용 배너 자리를 두고,
// 로그인 뒤 화면에는 하단 내비 4개(오늘·일정·조건·더보기)를 붙인다.
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <LanguageProvider>
          <AppShell>{children}</AppShell>
          <PwaRuntime />
        </LanguageProvider>
      </body>
    </html>
  );
}
