/** @type {import('next').NextConfig} */
const nextConfig = {
  // 판정 엔진·TourAPI 클라이언트는 서버에서만 실행한다.
  // API 인증키는 클라이언트 번들에 포함되지 않는다.
  env: {},
};

export default nextConfig;
