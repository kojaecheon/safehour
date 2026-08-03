/** @type {import('next').NextConfig} */

// 보안 헤더는 vercel.json 이 아니라 여기에 둔다.
// 플랫폼 설정에만 두면 Vercel 밖(로컬·다른 호스팅·프리뷰 도구)에서 방어가 사라진다.
// 특히 geolocation 차단은 D07-BAN002 의 이중 방어이므로 실행 환경에 좌우되면 안 된다.
const SECURITY_HEADERS = [
  {
    // 현재 GPS 를 브라우저 레벨에서 차단한다 — 코드 실수로도 요구할 수 없게 한다
    key: 'Permissions-Policy',
    value: 'geolocation=(), camera=(), microphone=(), payment=()',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  // 판정 엔진·TourAPI 클라이언트는 서버에서만 실행한다.
  // API 인증키는 클라이언트 번들에 포함되지 않는다.
  env: {},

  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // 판정 결과가 중간 캐시에 남지 않게 한다
        source: '/api/:path*',
        headers: [...SECURITY_HEADERS, { key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
