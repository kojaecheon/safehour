// 서버 알림 처리기의 출력 검사용 자식 프로세스 (test/watch-routes.test.js 의 '처리기 출력' 시험이 따로 띄운다)
//
// 테스트 실행기는 같은 프로세스의 stdout 에 자기 보고를 쓴다. 그래서 처리기가 낸 출력만 남김없이 모으려면 프로세스를 나눠야 한다.
// 이 스크립트는 모든 처리기를 성공, 오류, 꺼짐, 운영의 데모 세션, 저장소 장애(KvError 와 주소·토큰이 섞인 예외) 경로로 부른다.
// stdout·stderr 에는 처리기가 낸 것(과 console.* 가 냈을 것) 말고는 아무것도 쓰지 않는다.
// 부모가 금지 값 검사에 쓸 값(실행 중에 생긴 subId, 쿠키 등)과 응답 상태 목록은 fd 3 으로만 보낸다.
// 이 파일은 `*.test.js` 가 아니라서 테스트 실행기가 직접 돌리지 않는다. 외부 호출은 없다(저장소는 메모리, 예약·푸시는 기록기).

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeSync } from 'node:fs';

import { SESSION_COOKIE, createSessionToken, deriveAccountKey } from '../src/auth/session.js';
import { createWatchHandlers } from '../lib/server/watch/handlers.js';
import { ownerHashOf, watchKeyOf } from '../lib/server/watch/keys.js';
import { KvError } from '../lib/server/watch/kv.js';
import { IDS, SECRET, subscriptionFixture, testCtx } from './watch-fixtures.js';

const SESSION_SECRET = 'child-session-secret-for-output-test-0123456789';
const CRON_SECRET = 'cron-secret-for-output-test-0123456789';
const STORE_URL = 'https://store.example.test';
const STORE_TOKEN = 'store-token-value-for-output-test';
const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const EXPIRES_ON = '2026-11-25';
const UNKNOWN_WATCH_ID = 'UNKNOWNwatchIdFixture0';
const SECOND_WATCH_ID = 'SECONDwatchIdFixture_0';

function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: privateKey.export({ format: 'jwk' }).d };
}

const VAPID = vapidPair();
const ENV = {
  SAFEHOUR_SERVER_PUSH: '1',
  SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
  SAFEHOUR_STORE_MODE: 'memory',
  SAFEHOUR_SESSION_SECRET: SESSION_SECRET,
  SAFEHOUR_VAPID_PUBLIC_KEY: VAPID.publicKey,
  SAFEHOUR_VAPID_PRIVATE_KEY: VAPID.privateKey,
  SAFEHOUR_VAPID_SUBJECT: 'mailto:ops@example.com',
  SAFEHOUR_PUSH_STORE_KEY: randomBytes(32).toString('base64url'),
  SAFEHOUR_WATCH_OWNER_SECRET: SECRET,
  CRON_SECRET,
};
const KILLED_ENV = { ...ENV, SAFEHOUR_KILL_SERVER_PUSH: '1' };
// 운영 배포: 시험 장치가 꺼져 데모 세션을 받지 않는다. 저장소는 주입한 ctx 를 쓰므로 주소는 부르지 않는다
const PROD_ENV = {
  ...ENV,
  SAFEHOUR_STORE_MODE: '',
  VERCEL_ENV: 'production',
  UPSTASH_REDIS_REST_URL: STORE_URL,
  UPSTASH_REDIS_REST_TOKEN: STORE_TOKEN,
  QSTASH_TOKEN: 'qstash-token-value-for-output-test',
  QSTASH_CURRENT_SIGNING_KEY: 'sig-current-value-for-output-test',
  QSTASH_NEXT_SIGNING_KEY: 'sig-next-value-for-output-test',
  SAFEHOUR_PUBLIC_BASE_URL: 'https://app.example.test',
};

const ctx = testCtx();
const make = (env) => createWatchHandlers({ env, now: ctx.now, ctx });
const h = make(ENV);
const killed = make(KILLED_ENV);
const prod = make(PROD_ENV);

const cookieFor = (subject) =>
  `${SESSION_COOKIE}=${createSessionToken({ provider: 'demo', subject }, SESSION_SECRET, ctx.now())}`;
const patient = cookieFor('patient-1');
const guardian = cookieFor('guardian-1');
const { subscription } = subscriptionFixture();
const bearer = { authorization: `Bearer ${CRON_SECRET}` };

function call(method, path, body, { cookie, headers = {} } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (cookie) init.headers.set('cookie', cookie);
  if (body !== undefined) {
    init.headers.set('content-type', 'application/json');
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

let calls = 0;
const statuses = [];
async function run(handler, request) {
  calls += 1;
  const res = await handler(request);
  statuses.push(res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const registerBody = (watchId = IDS.watchId) => ({ watchId, writeToken: IDS.writeToken, expiresOn: EXPIRES_ON });
const deadlinesBody = (days) => ({ watchId: IDS.watchId, writeToken: IDS.writeToken, expiresOn: EXPIRES_ON, days });
const backBody = (extra = {}) => ({ watchId: IDS.watchId, writeToken: IDS.writeToken, date: TODAY, by: '14:30', ...extra });
const subscribeBody = (endpoint = subscription.endpoint) => ({
  watchId: IDS.watchId,
  subscription: { endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
  lang: 'ko',
});
const dueBody = (time = '14:30') => ({ k: watchKeyOf(IDS.watchId, SECRET), d: TODAY, t: time });

// ── 성공 경로 ──
await run(h.pushConfig, call('GET', '/api/push/config'));
await run(h.register, call('POST', '/api/watch', registerBody(), { cookie: patient }));
await run(
  h.deadlines,
  call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30', '18:00'] }, { date: TOMORROW, deadlines: ['14:30'] }]), {
    cookie: patient,
  }),
);
const { subId } = await run(h.subscribe, call('POST', '/api/watch/subscribe', subscribeBody(), { cookie: guardian }));
await run(h.status, call('POST', '/api/watch/status', { watchId: IDS.watchId, subId }, { cookie: guardian }));
await run(h.mute, call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: true }, { cookie: guardian }));
await run(h.mute, call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: false }, { cookie: guardian }));
// 14:30 마감의 보낼 시각(14:40 KST). 18:00 은 아직 일러 503(retry)이다
ctx.clock.set('2026-11-20T05:40:00Z');
await run(h.due, call('POST', '/api/watch/due', dueBody(), { headers: bearer }));
await run(h.due, call('POST', '/api/watch/due', dueBody('18:00'), { headers: bearer }));
// 보낸 뒤의 '돌아왔어요'는 복귀 확인 푸시를 보낸다
await run(h.back, call('POST', '/api/watch/back', backBody()));
await run(h.cronArm, call('GET', '/api/cron/watch-arm', undefined, { headers: bearer }));

// ── 오류 경로 ──
await run(h.back, call('POST', '/api/watch/back', backBody({ watchId: UNKNOWN_WATCH_ID })));
await run(h.register, call('POST', '/api/watch', registerBody()));
await run(h.register, call('POST', '/api/watch', '{"watchId":', { cookie: patient }));
await run(h.deadlines, call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['24:00'] }])));
await run(h.subscribe, call('POST', '/api/watch/subscribe', subscribeBody('https://evil.example/x'), { cookie: guardian }));
await run(h.due, call('POST', '/api/watch/due', dueBody()));
await run(h.due, call('POST', '/api/watch/due', '{not json', { headers: bearer }));
await run(killed.back, call('POST', '/api/watch/back', backBody()));
await run(killed.due, call('POST', '/api/watch/due', dueBody(), { headers: bearer }));
await run(prod.register, call('POST', '/api/watch', registerBody(SECOND_WATCH_ID), { cookie: patient }));
await run(prod.remove, call('DELETE', '/api/watch', { all: true }, { cookie: patient }));
await run(prod.subscribe, call('POST', '/api/watch/subscribe', subscribeBody(), { cookie: guardian }));

// ── 삭제 ──
await run(h.unsubscribe, call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId }));
await run(h.remove, call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken }));
await run(h.register, call('POST', '/api/watch', registerBody(SECOND_WATCH_ID), { cookie: patient }));
await run(h.remove, call('DELETE', '/api/watch', { all: true }, { cookie: patient }));

// ── 저장소 장애: 저장소 오류 객체와, 메시지·속성에 주소·토큰·명령이 섞인 예상 못 한 예외 ──
const leaky = Object.assign(new Error(`${STORE_URL} token=${STORE_TOKEN} HGETALL sh:dev:d`), {
  url: STORE_URL,
  token: STORE_TOKEN,
});
for (const error of [new KvError('KV_UNAVAILABLE'), leaky]) {
  ctx.kv = {
    async exec() {
      throw error;
    },
  };
  await run(h.pushConfig, call('GET', '/api/push/config'));
  await run(h.register, call('POST', '/api/watch', registerBody(), { cookie: patient }));
  await run(h.remove, call('DELETE', '/api/watch', { watchId: IDS.watchId, writeToken: IDS.writeToken }));
  await run(h.remove, call('DELETE', '/api/watch', { all: true }, { cookie: patient }));
  await run(h.deadlines, call('PUT', '/api/watch/deadlines', deadlinesBody([{ date: TODAY, deadlines: ['14:30'] }])));
  await run(h.back, call('POST', '/api/watch/back', backBody()));
  await run(h.subscribe, call('POST', '/api/watch/subscribe', subscribeBody(), { cookie: guardian }));
  await run(h.unsubscribe, call('DELETE', '/api/watch/subscribe', { watchId: IDS.watchId, subId }));
  await run(h.status, call('POST', '/api/watch/status', { watchId: IDS.watchId, subId }, { cookie: guardian }));
  await run(h.mute, call('POST', '/api/watch/mute', { watchId: IDS.watchId, subId, on: true }, { cookie: guardian }));
  await run(h.due, call('POST', '/api/watch/due', dueBody(), { headers: bearer }));
  await run(h.cronArm, call('GET', '/api/cron/watch-arm', undefined, { headers: bearer }));
}

const accountKeys = ['patient-1', 'guardian-1'].map((subject) => deriveAccountKey({ provider: 'demo', subject }, SESSION_SECRET));
writeSync(
  3,
  JSON.stringify({
    calls,
    statuses,
    pushes: ctx.push.sent.length,
    // 출력 어디에도 없어야 하는 값
    forbidden: [
      IDS.watchId,
      IDS.writeToken,
      SECOND_WATCH_ID,
      UNKNOWN_WATCH_ID,
      subId,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      watchKeyOf(IDS.watchId, SECRET),
      ...accountKeys,
      ...accountKeys.map((key) => ownerHashOf(key, SECRET)),
      patient.split('=')[1],
      guardian.split('=')[1],
      SECRET,
      SESSION_SECRET,
      CRON_SECRET,
      VAPID.privateKey,
      ENV.SAFEHOUR_PUSH_STORE_KEY,
      STORE_URL,
      'store.example',
      STORE_TOKEN,
      'HGETALL',
      'sh:dev',
      'KV_',
      'evil.example',
      'fcm.googleapis',
      '2026-',
      '14:30',
      '18:00',
      '"ko"',
    ],
  }),
);
