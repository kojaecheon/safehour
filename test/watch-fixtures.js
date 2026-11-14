// 서버 알림(지켜보기) 테스트용 고정 값과 WatchCtx 조립 (계획 '공용 모양')
//
// 이 파일은 `*.test.js` 가 아니라서 테스트 실행기가 직접 돌리지 않는다. 테스트 파일이 불러 쓴다.
// 모든 값은 테스트 전용 가짜 값이다. 실제 비밀, 실제 구독 주소, 실제 계정을 담지 않는다.
// 저장소는 메모리 구현, 예약과 푸시는 호출을 쌓아 두는 기록기라 외부 호출이 0건이다.

import { createECDH, randomBytes } from 'node:crypto';
import { createMemoryKv } from '../lib/server/watch/kv.js';
import { redisKeys } from '../lib/server/watch/keys.js';

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
