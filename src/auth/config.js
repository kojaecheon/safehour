// 소셜 로그인 공급자 정의 (AX-219 · ADR-0004)
//
// 원칙
//   - **최소 범위만 요청한다.** 이메일·이름·프로필 사진을 받지 않는다.
//     회복 지침을 다시 불러오려면 "같은 사람인가" 만 알면 되고, 그것은 안정 식별자 하나로 족하다.
//   - 토큰은 저장하지 않는다. 교환 직후 식별자만 꺼내고 버린다.
//   - redirect_uri 는 **설정값으로 조립한다.** 요청 헤더(Host)로 만들면 호스트 헤더 주입에 열린다.

export const PROVIDERS = {
  google: {
    id: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    /** openid 만 — 이메일·프로필을 요청하지 않는다 */
    scope: 'openid',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    /** id_token(JWT) 의 sub 를 식별자로 쓴다 */
    identity: 'id_token',
  },
  kakao: {
    id: 'kakao',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    /** 선택 동의 항목을 하나도 요청하지 않는다 */
    scope: '',
    clientIdEnv: 'KAKAO_CLIENT_ID',
    clientSecretEnv: 'KAKAO_CLIENT_SECRET',
    /** 회원번호만 조회한다 */
    identity: 'userinfo',
    userInfoUrl: 'https://kapi.kakao.com/v2/user/me',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function isProviderId(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/** 공급자별 자격증명이 실제로 설정돼 있는가 */
export function providerConfigured(id, env = process.env) {
  const provider = PROVIDERS[id];
  if (!provider) return false;
  return Boolean(env[provider.clientIdEnv]?.trim() && env[provider.clientSecretEnv]?.trim());
}

/** 화면에 보여줄 공급자 가용성 — 자격증명이 없으면 버튼을 비활성으로 둔다 */
export function providerAvailability(env = process.env) {
  return PROVIDER_IDS.map((id) => ({ id, configured: providerConfigured(id, env) }));
}

/**
 * 로그인 없이 전체 흐름을 볼 수 있는 데모 세션 허용 여부.
 * 공모전 심사위원이 소셜 로그인을 통과하지 못해 서비스를 못 보는 상황을 막는다.
 * 운영에서 켜면 인증이 무의미해지므로 **명시적으로 켜야만** 동작한다.
 */
export function demoLoginEnabled(env = process.env) {
  return env.SAFEHOUR_ALLOW_DEMO_LOGIN === '1';
}

/**
 * 콜백 주소. 배포 도메인을 환경변수로 고정한다 — 요청 헤더에서 만들지 않는다.
 */
export function callbackUrl(env = process.env) {
  const base = env.SAFEHOUR_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/api/auth/callback`;
}

/**
 * 로그인 후 되돌아갈 경로 검증 — 열린 리다이렉트를 막는다.
 * 같은 출처의 절대 경로만 허용하고, `//host` 형태(프로토콜 상대 URL)는 거부한다.
 */
export function safeReturnTo(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  return value;
}
