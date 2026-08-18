import './globals.css';
import LanguageProvider from '@/components/LanguageProvider.js';

export const metadata = {
  title: 'SafeHour — 안심 관광 추천 / Safe outings within hospital instructions',
  description:
    '수술·시술 후 외국인 환자와 보호자에게 병원 조건과 복귀시간 안에서 안전한 관광 활동을 추천합니다. SafeHour는 의료 판단을 하지 않습니다. — SafeHour suggests tourism only within the precautions and return time set by your hospital. It makes no medical judgements.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// lang="ko" 는 서버 렌더 기본값이다. 클라이언트에서 사용자 설정·브라우저 언어에 따라
// LanguageProvider 가 document.documentElement.lang 을 갱신한다 (WCAG 3.1.1).
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <LanguageProvider>
          <div className="app-shell">{children}</div>
        </LanguageProvider>
      </body>
    </html>
  );
}
