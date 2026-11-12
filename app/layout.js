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
// 일정 동기화·즉시 복귀 시트 (AX-317): 어느 화면으로 열어도 변화 감지가 돌고, 즉시 복귀 시트가 자동으로 열린다
import TripRuntime from '@/components/trip/TripRuntime.js';

// 제목·설명은 안전을 약속하지 않는다. 조건 통과와 안전은 다르다 (docs/business-rules.md '이 제품이 하지 않는 판단': '안전합니다' 표현 금지 · AX-321)
export const metadata = {
  title: 'SafeHour — 체류 일정 동반 / Day plans for your medical stay in Korea',
  description:
    '수술·시술을 받으러 한국에 온 외국인 환자와 동반 보호자에게 입국부터 출국까지 날짜별 관광 일정을 만들어 드립니다. 일정은 병원이 정했거나 본인이 확인한 조건 안에서만 만들며, SafeHour는 의료 판단을 하지 않습니다. — SafeHour builds day-by-day sightseeing plans for international patients and their companions, from arrival to departure, only within the conditions set by the hospital or checked by the patient. It makes no medical judgements.',
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
          <TripRuntime />
        </LanguageProvider>
      </body>
    </html>
  );
}
