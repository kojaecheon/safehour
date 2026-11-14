// WatchCtx 조립 (ADR-0012 · 계획 '공용 모양' · 작업 8)
//
// 운영 처리기가 요청마다 watchConfig(env) 결과로 서비스 함수의 첫 인자를 만든다. 테스트는 test/watch-fixtures.js 의
// testCtx() 를 주입한다.
//   kv         upstash 면 createUpstashKv, memory 면 sharedMemoryKv(프로세스에 하나)
//   scheduler  QStash 설정이 있으면 createQstashScheduler, 메모리 모드면 sharedMemoryScheduler, 둘 다 아니면
//              늘 { ok: false } 인 빈 구현(예약을 못 건 마감은 failed 로 세어 다음에 다시 건다)
//   push       VAPID 가 있으면 src/push 의 sendPush, 없으면 늘 REJECTED
//   reviewed   넣지 않는다. 문구 모듈(text.js)이 이 빌드의 검수 스위치 기본값을 쓴다. 서버 코드가 검수 스위치를
//              직접 들이지 않는다는 i18n 테스트(test/i18n-languages.test.js)를 지킨다.
//
// 저장소나 소유 비밀이 없으면 null 이다. 소유 비밀이 없으면 저장 키를 만들 수 없어 지울 것도 찾지 못한다.
// 메모리 저장소, 시험용 푸시 출처는 watchConfig 가 정한 값(testHooks)만 따른다. 여기서 따로 켜지 않는다.
// 이 모듈은 아무것도 기록하지 않는다.

import { createVapidSigner, sendPush } from '../../../src/push/index.js';
import { redisKeys } from './keys.js';
import { createUpstashKv, sharedMemoryKv } from './kv.js';
import { createQstashScheduler, sharedMemoryScheduler } from './scheduler.js';

/** 예약 업체 설정이 없을 때. 걸지 못한 마감은 다음 업로드나 하루 1회 예약이 다시 건다 */
const NO_SCHEDULER = Object.freeze({
  schedule: async () => ({ ok: false }),
  cancel: async () => false,
});

/** VAPID 가 없을 때. 다시 부르지 않게 REJECTED 로 끝낸다 */
const NO_PUSH = Object.freeze({
  send: async () => ({ outcome: 'REJECTED', statusClass: '4xx' }),
});

// VAPID 서명기는 출처마다 JWT 를 한동안 다시 쓴다(src/push/AGENTS.md: Apple 푸시 서비스가 같은 출처의 토큰을 한 시간에
// 한 번 넘게 새로 만들지 말라고 한다). 요청마다 새로 만들면 그 재사용이 사라지므로 같은 키 묶음이면 인스턴스 안에서
// 하나를 다시 쓴다. 담는 것은 환경변수에서 온 키와 서명기뿐이고 사용자 데이터는 없다.
let cachedSigner = null;

function signerFor(vapid) {
  const { publicKey, privateKey, subject } = vapid;
  if (
    cachedSigner &&
    cachedSigner.publicKey === publicKey &&
    cachedSigner.privateKey === privateKey &&
    cachedSigner.subject === subject
  ) {
    return cachedSigner.signer;
  }
  const signer = createVapidSigner({ publicKey, privateKey, subject });
  cachedSigner = { publicKey, privateKey, subject, signer };
  return signer;
}

function pushAdapter(cfg, { now, fetchImpl }) {
  if (!cfg.vapid) return NO_PUSH;
  let signer;
  try {
    signer = signerFor(cfg.vapid);
  } catch {
    // watchConfig 가 키 쌍을 확인했으므로 생기지 않는다. 생기면 보내지 않는다
    return NO_PUSH;
  }
  return {
    send: ({ subscription, payload, topic } = {}) =>
      sendPush({ subscription, payload, topic, signer, fetchImpl, nowMs: now(), testOrigin: cfg.testOrigin }),
  };
}

function schedulerFor(cfg, { fetchImpl }) {
  if (cfg.qstash) {
    return createQstashScheduler({
      url: cfg.qstash.url,
      token: cfg.qstash.token,
      baseUrl: cfg.baseUrl,
      protectionBypass: cfg.protectionBypass,
      fetchImpl,
    });
  }
  if (cfg.store.mode === 'memory') return sharedMemoryScheduler();
  return NO_SCHEDULER;
}

/**
 * @param {ReturnType<import('./config.js').watchConfig>} cfg
 * @param {{ now?: () => number, fetchImpl?: typeof fetch }} [options]
 * @returns {object | null}  WatchCtx. 저장소나 소유 비밀이 없으면 null
 */
export function createWatchCtx(cfg, { now = Date.now, fetchImpl = globalThis.fetch } = {}) {
  if (!cfg?.store || !cfg.ownerSecret) return null;
  const kv =
    cfg.store.mode === 'memory'
      ? sharedMemoryKv({ now })
      : createUpstashKv({ url: cfg.store.url, token: cfg.store.token, fetchImpl });
  return {
    kv,
    keys: redisKeys(cfg.namespace),
    secret: cfg.ownerSecret,
    sealKeys: cfg.sealKeys,
    now,
    scheduler: schedulerFor(cfg, { fetchImpl }),
    push: pushAdapter(cfg, { now, fetchImpl }),
    enabled: cfg.enabled === true,
    testOrigin: cfg.testOrigin ?? null,
  };
}
