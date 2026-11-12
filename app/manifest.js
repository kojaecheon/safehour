// 웹 앱 매니페스트: 홈 화면 설치 (AX-319 · docs/platform/IA_AND_FLOWS.md '경로'·'보기 전용 상태')
//
// Next 규칙 파일이다: /manifest.webmanifest 로 제공되고, 모든 화면 <head> 에 링크가 자동으로 붙는다.
// 서비스 워커(public/sw.js)가 이 주소를 미리 받아 둔다.
//
// - 설치한 앱은 오늘 화면(/today)에서 시작한다. 로그인 만료·오프라인이면 보기 전용으로 열린다.
// - 색은 디자인 토큰(app/globals.css)과 같다: 주소창·바탕은 흰색(--bg), 아이콘 바탕은 한강 코발트(--accent).
//   test/pwa-manifest.test.js 가 토큰·아이콘 파일 크기와 맞는지 확인한다.
// - 아이콘은 scripts/generate-pwa-icons.mjs 로 만든 public/icons/* 다.

export default function manifest() {
  return {
    id: '/',
    name: 'SafeHour',
    short_name: 'SafeHour',
    lang: 'ko',
    dir: 'ltr',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
