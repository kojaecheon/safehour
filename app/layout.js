import './globals.css';

export const metadata = {
  title: 'SafeHour — 안심 관광 추천',
  description:
    '수술·시술 후 외국인 환자와 보호자에게 병원 조건과 복귀시간 안에서 안전한 관광 활동을 추천합니다. SafeHour는 의료 판단을 하지 않습니다.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
