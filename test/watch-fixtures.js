// 서버 알림(지켜보기) 테스트용 고정 값과 WatchCtx 조립 (계획 '공용 모양')
//
// 이 파일은 `*.test.js` 가 아니라서 테스트 실행기가 직접 돌리지 않는다. 테스트 파일이 불러 쓴다.
// 모든 값은 테스트 전용 가짜 값이다. 실제 비밀, 실제 구독 주소, 실제 계정을 담지 않는다.
// 저장소는 메모리 구현, 예약과 푸시는 호출을 쌓아 두는 기록기라 외부 호출이 0건이다.

import { createECDH, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createMemoryKv } from '../lib/server/watch/kv.js';
import { redisKeys } from '../lib/server/watch/keys.js';
import { SESSION_SECRET } from './itinerary-fixtures.js';

/** 찾는 키를 만드는 비밀 (48자, 테스트 전용) */
export const SECRET = 'test-watch-owner-secret-0123456789abcdefghijklmn';
/** 구독 봉인 키 (32바이트, 테스트 전용) */
export const SEAL_KEY = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');

/** 형식에 맞는 고정 식별 값. watchId·subId 는 22자, writeToken·계정 키는 43자 base64url */
export const IDS = Object.freeze({
  watchId: 'WATCHidFixture_0123-ab',
  writeToken: 'WRITEtokenFixture_0123456789-abcdefghijklmn',
  accountKey: 'ACCOUNTkeyFixture_0123456789-abcdefghijklmn',
  otherAccountKey: 'OTHERaccountKeyFixture_0123456789-abcdefghi',
});

/** 주입용 시계. iso 는 시간대 표기(Z 등)가 있는 문자열만 쓴다 */
export function fixedClock(iso) {
  let ms = Date.parse(iso);
  return {
    now: () => ms,
    set(next) {
      ms = Date.parse(next);
    },
    advanceMin(n) {
      ms += n * 60 * 1000;
    },
  };
}

/** 실제 P-256 키 쌍으로 만든 구독. privateKey 로 푸시 본문을 풀어 볼 수 있다 */
export function subscriptionFixture() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
    privateKey: ecdh.getPrivateKey(),
  };
}

/**
 * 읽는 만큼만 만들어 내는 요청 본문 스트림('a' 바이트). 얼마나 읽혔는지(pulled)와 취소됐는지(cancelled)를 남긴다.
 * 본문 상한을 넘는 순간 읽기를 멈추는지 볼 때 쓴다. Request 에 넣을 때는 duplex: 'half' 가 필요하다.
 */
export function streamedBody(totalBytes, chunkBytes = 4096) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (state.pulled >= totalBytes) {
          controller.close();
          return;
        }
        const size = Math.min(chunkBytes, totalBytes - state.pulled);
        state.pulled += size;
        controller.enqueue(new Uint8Array(size).fill(0x61));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

const STATUS_CLASS = Object.freeze({ SENT: '2xx', GONE: '404/410', RETRY: '5xx', REJECTED: '4xx' });

function recordingScheduler() {
  let seq = 0;
  const scheduler = {
    calls: [],
    cancelled: [],
    fail: false,
    async schedule({ body, notBeforeMs, dedupId }) {
      scheduler.calls.push({ body, notBeforeMs, dedupId });
      if (scheduler.fail) return { ok: false };
      seq += 1;
      return { ok: true, messageId: `m${seq}` };
    },
    async cancel(messageId) {
      scheduler.cancelled.push(messageId);
      return true;
    },
  };
  return scheduler;
}

function recordingPush() {
  const push = {
    sent: [],
    outcome: 'SENT',
    async send({ subscription, payload, topic }) {
      push.sent.push({ subscription, payload, topic });
      return { outcome: push.outcome, statusClass: STATUS_CLASS[push.outcome] ?? '4xx' };
    },
  };
  return push;
}

/** 예약 처리 경로의 Bearer 비밀 (테스트 전용) */
export const WATCH_CRON_SECRET = 'cron-secret-for-route-tests-0123456789';

/** VAPID 한 쌍: 공개키는 비압축 점(65바이트), 비밀키는 d. 둘 다 채움 없는 base64url */
function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const priv = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: priv.d };
}

/**
 * 라우트 처리기 시험용 환경변수. test/watch-routes.test.js 의 ENV 와 같은 값이다: 켜는 스위치 '1', 데모 로그인, 메모리 저장소,
 * VAPID 한 쌍, 저장 키, 찾는 키 비밀(SECRET), CRON_SECRET. 세션 서명 키는 SAFEHOUR_SESSION_SECRET 로 읽는다.
 * 부를 때마다 VAPID 한 쌍과 저장 키를 새로 만든다.
 * @returns {Readonly<Record<string, string>>}
 */
export function watchRouteEnv() {
  const vapid = vapidPair();
  return Object.freeze({
    SAFEHOUR_SERVER_PUSH: '1',
    SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
    SAFEHOUR_STORE_MODE: 'memory',
    SAFEHOUR_SESSION_SECRET: SESSION_SECRET,
    SAFEHOUR_VAPID_PUBLIC_KEY: vapid.publicKey,
    SAFEHOUR_VAPID_PRIVATE_KEY: vapid.privateKey,
    SAFEHOUR_VAPID_SUBJECT: 'mailto:ops@example.com',
    SAFEHOUR_PUSH_STORE_KEY: randomBytes(32).toString('base64url'),
    SAFEHOUR_WATCH_OWNER_SECRET: SECRET,
    CRON_SECRET: WATCH_CRON_SECRET,
  });
}

/** 테스트용 WatchCtx. 시계는 ctx.clock 으로 움직인다 */
export function testCtx({ at = '2026-11-20T03:00:00Z' } = {}) {
  const clock = fixedClock(at);
  return {
    kv: createMemoryKv({ now: clock.now }),
    keys: redisKeys('dev'),
    secret: SECRET,
    sealKeys: [SEAL_KEY],
    now: clock.now,
    scheduler: recordingScheduler(),
    push: recordingPush(),
    reviewed: { ja: false, zh: false },
    enabled: true,
    testOrigin: null,
    clock,
  };
}
