// 서버 알림 설정: 환경변수 읽기와 준비 상태 (ADR-0012 · docs/superpowers/plans/2026-11-14-server-push-foundation.md 작업 3)
//
// 원칙
//   - 순수 함수다. 인자로 받은 env 만 읽고 아무것도 부르지 않는다.
//   - missing 에는 없거나 형식이 틀린 환경변수의 이름만 담는다. 값은 어디에도 옮기지 않는다
//     (헬스 응답이 이 목록을 그대로 알린다).
//   - src/push/ 에 기대지 않는다. VAPID 키 모양은 여기서 base64url 을 풀어 바이트 길이로만 본다.
//   - 메모리 저장소(SAFEHOUR_STORE_MODE), 시험용 푸시 출처(SAFEHOUR_PUSH_TEST_ORIGIN), http 되부를 주소는
//     데모 로그인이면서 운영 배포가 아닐 때만 듣는다(testHooks). 데모 로그인은 운영에도 켜져 있기 때문이다.
//     서버 알림 경로가 데모 세션을 받는 것도 testHooks 일 때뿐이다(handlers.js). 모든 데모 로그인이 같은 신원이라서다.
//   - VAPID 공개키와 개인키는 같은 쌍이어야 한다. 소유 비밀은 세션 서명 키와 달라야 한다.
//
// Vercel 시스템 환경변수 (2026-11-14 공식 문서로 확인)
//   https://vercel.com/docs/environment-variables/system-environment-variables
//     VERCEL_ENV: production, preview, development 중 하나
//     VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL: 도메인 이름만 온다. https:// 는 붙지 않는다
//     VERCEL_PROJECT_PRODUCTION_URL 은 미리보기 배포에도 늘 있다. 그래서 운영일 때만 쓴다
//   https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
//     VERCEL_AUTOMATION_BYPASS_SECRET: 보호 우회 비밀. 요청에는 x-vercel-protection-bypass 헤더로 싣는다
//     켜면 운영에도 들어오지만 운영 배포는 보호 우회가 필요 없다. 운영 예약 메시지(QStash 에 보관된다)에 실리면 운영 QStash 토큰을
//     가진 사람이 미리보기 보호를 우회할 수 있으므로, 운영에서는 읽지 않는다(protectionBypass 는 null)

import { createECDH, timingSafeEqual } from 'node:crypto';

import { isServerPushKilled, isServerPushSwitchOn } from '../runtime-flags.js';

const QSTASH_DEFAULT_URL = 'https://qstash.upstash.io';
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
/** Vercel 이 주는 도메인 이름 모양. 경로나 스킴이 섞이면 쓰지 않는다 */
const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const OWNER_SECRET_MIN = 32;
const CRON_SECRET_MIN = 16;

/** 앞뒤 공백을 떼고 빈 값이면 null */
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** base64url 을 풀어 정확히 length 바이트면 Buffer, 아니면 null */
function decodeBytes(value, length) {
  const raw = text(value);
  if (raw === null || !BASE64URL.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64url');
  return bytes.length === length ? bytes : null;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** 끝 슬래시를 뗀 주소. 계정 정보·쿼리·조각이 있으면 쓰지 않는다 */
function cleanUrl(url) {
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function httpsUrl(value) {
  const raw = text(value);
  if (raw === null) return null;
  const url = parseUrl(raw);
  if (!url || url.protocol !== 'https:') return null;
  return cleanUrl(url);
}

function namespaceOf(vercelEnv) {
  if (vercelEnv === 'production') return 'prod';
  if (vercelEnv === 'preview') return 'prev';
  return 'dev';
}

function readStore(env, testHooks, missing) {
  if (testHooks && env.SAFEHOUR_STORE_MODE === 'memory') return { mode: 'memory' };
  // 주소와 토큰은 같은 접두사에서 읽는다. UPSTASH_ 쪽이 하나라도 있으면 둘 다 그쪽이다
  // (서로 다른 저장소의 주소와 토큰이 섞이지 않게 한다)
  const upstash = text(env.UPSTASH_REDIS_REST_URL) !== null || text(env.UPSTASH_REDIS_REST_TOKEN) !== null;
  const prefix = upstash ? 'UPSTASH_REDIS_REST' : 'KV_REST_API';
  const url = httpsUrl(env[`${prefix}_URL`]);
  const token = text(env[`${prefix}_TOKEN`]);
  // 빠진 것은 정본 이름(UPSTASH_)으로 알린다
  if (url === null) missing.push('UPSTASH_REDIS_REST_URL');
  if (token === null) missing.push('UPSTASH_REDIS_REST_TOKEN');
  return url !== null && token !== null ? { mode: 'upstash', url, token } : null;
}

function readQstash(env) {
  const given = text(env.QSTASH_URL);
  const url = given === null ? QSTASH_DEFAULT_URL : httpsUrl(given);
  const fields = {
    QSTASH_URL: url,
    QSTASH_TOKEN: text(env.QSTASH_TOKEN),
    QSTASH_CURRENT_SIGNING_KEY: text(env.QSTASH_CURRENT_SIGNING_KEY),
    QSTASH_NEXT_SIGNING_KEY: text(env.QSTASH_NEXT_SIGNING_KEY),
  };
  const absent = Object.keys(fields).filter((name) => fields[name] === null);
  if (absent.length > 0) return { qstash: null, absent };
  return {
    qstash: {
      url,
      token: fields.QSTASH_TOKEN,
      currentSigningKey: fields.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: fields.QSTASH_NEXT_SIGNING_KEY,
    },
    absent,
  };
}

/**
 * 개인키에서 만든 공개키가 주어진 공개키와 같은가. 0 이거나 곡선 차수 밖의 개인키는 node:crypto 가 거부한다.
 * JWK(x, y, d)로 개인키를 읽는 방식은 Node 22 에서 다른 쌍을 거부하지 않아(Node 26 은 거부한다) 쓰지 않는다.
 */
function isVapidPair(publicBytes, privateBytes) {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateBytes);
    const derived = ecdh.getPublicKey();
    return derived.length === publicBytes.length && timingSafeEqual(derived, publicBytes);
  } catch {
    return false;
  }
}

function readVapid(env, missing) {
  const publicBytes = decodeBytes(env.SAFEHOUR_VAPID_PUBLIC_KEY, 65);
  // 비압축 P-256 공개키: 0x04 + x(32) + y(32)
  const publicOk = publicBytes !== null && publicBytes[0] === 0x04;
  const privateBytes = decodeBytes(env.SAFEHOUR_VAPID_PRIVATE_KEY, 32);
  // 길이가 맞으면 같은 쌍인지 본다. 아니면 개인키를 틀린 것으로 알린다
  const privateOk = privateBytes !== null && (!publicOk || isVapidPair(publicBytes, privateBytes));
  const subject = text(env.SAFEHOUR_VAPID_SUBJECT);
  const subjectUrl = subject === null ? null : parseUrl(subject);
  const subjectOk =
    subjectUrl !== null &&
    ((subjectUrl.protocol === 'mailto:' && subjectUrl.pathname.length > 0) || subjectUrl.protocol === 'https:');
  if (!publicOk) missing.push('SAFEHOUR_VAPID_PUBLIC_KEY');
  if (!privateOk) missing.push('SAFEHOUR_VAPID_PRIVATE_KEY');
  if (!subjectOk) missing.push('SAFEHOUR_VAPID_SUBJECT');
  if (!publicOk || !privateOk || !subjectOk) return null;
  // 채움 문자(=) 없는 base64url 로 다시 적어 돌려준다
  return {
    publicKey: publicBytes.toString('base64url'),
    privateKey: privateBytes.toString('base64url'),
    subject,
  };
}

function secretOf(value, minLength) {
  const raw = text(value);
  return raw !== null && raw.length >= minLength ? raw : null;
}

/** 시험 장치가 켜져 있으면 http://localhost, http://127.0.0.1 도 받는다 */
function explicitBaseUrl(value, testHooks) {
  const raw = text(value);
  if (raw === null) return { given: false, url: null };
  const url = parseUrl(raw);
  if (!url) return { given: true, url: null };
  if (url.protocol === 'https:') return { given: true, url: cleanUrl(url) };
  if (testHooks && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return { given: true, url: cleanUrl(url) };
  }
  return { given: true, url: null };
}

/** 시험용 푸시 출처는 http(s) 주소의 출처(scheme://host:port)만 남긴다 */
function testOriginOf(value) {
  const raw = text(value);
  const url = raw === null ? null : parseUrl(raw);
  return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : null;
}

function vercelBaseUrl(env) {
  const host =
    env.VERCEL_ENV === 'production'
      ? text(env.VERCEL_PROJECT_PRODUCTION_URL)
      : (text(env.VERCEL_BRANCH_URL) ?? text(env.VERCEL_URL));
  return host !== null && HOSTNAME.test(host) ? `https://${host}` : null;
}

/**
 * 서버 알림에 필요한 환경변수를 읽는다.
 * 명시한 SAFEHOUR_PUBLIC_BASE_URL 이 형식에 맞지 않으면 Vercel 주소로 넘어가지 않고 빠진 것으로 본다
 * (잘못 넣은 값을 조용히 덮지 않는다).
 * @param {Record<string, string|undefined>} [env]
 */
export function watchConfig(env = process.env) {
  const source = env ?? {};
  const missing = [];
  const demo = source.SAFEHOUR_ALLOW_DEMO_LOGIN === '1';
  const switchOn = isServerPushSwitchOn(source);
  const killed = isServerPushKilled(source);
  // 데모 로그인은 운영과 미리보기 양쪽에 켜 둔다(docs/operations.md). 그래서 데모만으로는 시험 장치를
  // 운영에서 막지 못한다. 메모리 저장소, 시험용 푸시 출처, http 되부를 주소는 운영 배포가 아닐 때만 듣는다
  const testHooks = demo && source.VERCEL_ENV !== 'production';

  const store = readStore(source, testHooks, missing);
  const memory = store?.mode === 'memory';
  const vapid = readVapid(source, missing);

  const sealKeys = [];
  const currentSeal = decodeBytes(source.SAFEHOUR_PUSH_STORE_KEY, 32);
  if (currentSeal === null) missing.push('SAFEHOUR_PUSH_STORE_KEY');
  else {
    sealKeys.push(currentSeal);
    // 이전 키는 선택이다. 형식이 틀리면 무시한다
    const previousSeal = decodeBytes(source.SAFEHOUR_PUSH_STORE_KEY_PREVIOUS, 32);
    if (previousSeal !== null) sealKeys.push(previousSeal);
  }

  // 소유 비밀은 세션 서명 키와 다른 비밀이어야 한다. 같으면 없는 것으로 본다
  const ownerCandidate = secretOf(source.SAFEHOUR_WATCH_OWNER_SECRET, OWNER_SECRET_MIN);
  const ownerSecret = ownerCandidate !== null && ownerCandidate === text(source.SAFEHOUR_SESSION_SECRET) ? null : ownerCandidate;
  if (ownerSecret === null) missing.push('SAFEHOUR_WATCH_OWNER_SECRET');
  const cronSecret = secretOf(source.CRON_SECRET, CRON_SECRET_MIN);
  if (cronSecret === null) missing.push('CRON_SECRET');

  const { qstash, absent } = readQstash(source);
  const explicit = explicitBaseUrl(source.SAFEHOUR_PUBLIC_BASE_URL, testHooks);
  const baseUrl = explicit.given ? explicit.url : vercelBaseUrl(source);
  // 메모리 모드는 예약 업체를 부르지 않으므로 QStash 와 주소가 없어도 된다
  if (!memory) {
    missing.push(...absent);
    if (baseUrl === null) missing.push('SAFEHOUR_PUBLIC_BASE_URL');
  }

  const ready = missing.length === 0;
  return {
    switchOn,
    killed,
    ready,
    enabled: switchOn && !killed && ready,
    missing,
    namespace: namespaceOf(source.VERCEL_ENV),
    demo,
    // 시험 장치(메모리 저장소, 시험용 푸시 출처, http 되부를 주소)와 서버 알림 경로의 데모 세션 허용이 모두 이 값 하나를 따른다
    testHooks,
    store,
    // 메모리 저장소와 실제 예약 업체를 짝짓지 않는다
    qstash: memory ? null : qstash,
    vapid,
    sealKeys,
    ownerSecret,
    cronSecret,
    baseUrl,
    // 운영 배포는 보호 우회가 필요 없고, 운영 예약 메시지에 비밀을 싣지 않는다(맨 위 설명)
    protectionBypass: source.VERCEL_ENV === 'production' ? null : text(source.VERCEL_AUTOMATION_BYPASS_SECRET),
    guardianLoginRequired: source.SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN !== '1',
    testOrigin: testHooks ? testOriginOf(source.SAFEHOUR_PUSH_TEST_ORIGIN) : null,
  };
}
