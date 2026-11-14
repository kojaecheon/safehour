// 서버 알림 설정·스위치·오류 코드·유예 기본값 (ADR-0012 · docs/superpowers/plans/2026-11-14-server-push-foundation.md 작업 3)
//
// 이 파일이 고정하는 것
//   - 켜는 스위치 SAFEHOUR_SERVER_PUSH 는 정확히 '1' 일 때만, 끄는 스위치 SAFEHOUR_KILL_SERVER_PUSH 는 1·true·on
//   - watchConfig 는 환경변수 이름만 missing 에 담고 값은 담지 않는다
//   - 메모리 저장소와 시험용 푸시 출처는 데모 로그인일 때만 듣는다
//   - /api/health 는 준비 여부와 빠진 이름만 알린다
//   - 비밀 생성 스크립트의 출력은 watchConfig 형식 검사를 통과한다
//
// 외부 호출은 없다. 비밀 생성 스크립트의 출력은 메모리에서만 읽는다.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SERVER_PUSH_KILL_SWITCH,
  SERVER_PUSH_SWITCH,
  isServerPushKilled,
  isServerPushSwitchOn,
  runtimeFlagsSnapshot,
} from '../lib/server/runtime-flags.js';
import { watchConfig } from '../lib/server/watch/config.js';
import { ERROR_CODE, ERROR_HTTP_STATUS } from '../src/stay/errorCodes.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import { GET as healthGet } from '../app/api/health/route.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const raw = publicKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([0x04]), Buffer.from(raw.x, 'base64url'), Buffer.from(raw.y, 'base64url')]);
  return { publicKey: pub.toString('base64url'), privateKey: jwk.d };
}

const VAPID = vapidPair();

/** 모든 값이 갖춰진 운영 환경 묶음 */
const FULL = Object.freeze({
  SAFEHOUR_SERVER_PUSH: '1',
  UPSTASH_REDIS_REST_URL: 'https://example-store.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'store-token-value-for-test',
  QSTASH_TOKEN: 'qstash-token-value-for-test',
  QSTASH_CURRENT_SIGNING_KEY: 'sig-current-value-for-test',
  QSTASH_NEXT_SIGNING_KEY: 'sig-next-value-for-test',
  SAFEHOUR_VAPID_PUBLIC_KEY: VAPID.publicKey,
  SAFEHOUR_VAPID_PRIVATE_KEY: VAPID.privateKey,
  SAFEHOUR_VAPID_SUBJECT: 'mailto:ops@example.com',
  SAFEHOUR_PUSH_STORE_KEY: randomBytes(32).toString('base64url'),
  SAFEHOUR_WATCH_OWNER_SECRET: randomBytes(32).toString('base64url'),
  CRON_SECRET: randomBytes(32).toString('base64url'),
  SAFEHOUR_PUBLIC_BASE_URL: 'https://safehour.example.com',
  VERCEL_ENV: 'production',
});

const SECRET_NAMES = [
  'UPSTASH_REDIS_REST_TOKEN',
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'SAFEHOUR_VAPID_PRIVATE_KEY',
  'SAFEHOUR_PUSH_STORE_KEY',
  'SAFEHOUR_WATCH_OWNER_SECRET',
  'CRON_SECRET',
];

function without(env, ...names) {
  const copy = { ...env };
  for (const name of names) delete copy[name];
  return copy;
}

describe('스위치', () => {
  test('스위치: SAFEHOUR_SERVER_PUSH 는 정확히 "1" 일 때만 켜진다', () => {
    assert.equal(SERVER_PUSH_SWITCH, 'SAFEHOUR_SERVER_PUSH');
    assert.equal(isServerPushSwitchOn({ SAFEHOUR_SERVER_PUSH: '1' }), true);
    for (const value of ['true', 'on', ' 1', '1 ', '', 'TRUE', undefined]) {
      assert.equal(isServerPushSwitchOn({ SAFEHOUR_SERVER_PUSH: value }), false, `"${value}" 를 꺼짐으로 읽지 못했다`);
    }
    assert.equal(isServerPushSwitchOn({}), false);
  });

  test('스위치: SAFEHOUR_KILL_SERVER_PUSH 는 1·true·on 을 켜짐으로 읽는다', () => {
    assert.equal(SERVER_PUSH_KILL_SWITCH, 'SAFEHOUR_KILL_SERVER_PUSH');
    for (const value of ['1', 'true', 'on', ' ON ', 'True']) {
      assert.equal(isServerPushKilled({ SAFEHOUR_KILL_SERVER_PUSH: value }), true, `"${value}" 를 켜짐으로 읽지 못했다`);
    }
    for (const value of ['false', '0', '', 'off', undefined]) {
      assert.equal(isServerPushKilled({ SAFEHOUR_KILL_SERVER_PUSH: value }), false, `"${value}" 를 꺼짐으로 읽지 못했다`);
    }
  });

  test('runtimeFlagsSnapshot 은 세 스위치를 돌려준다', () => {
    assert.deepEqual(Object.keys(runtimeFlagsSnapshot()), ['recommendationKilled', 'serverPush', 'serverPushKilled']);
  });
});

describe('watchConfig', () => {
  test('모두 갖춰지면 ready 이고 missing 이 비어 있다', () => {
    const config = watchConfig(FULL);
    assert.deepEqual(config.missing, []);
    assert.equal(config.switchOn, true);
    assert.equal(config.killed, false);
    assert.equal(config.ready, true);
    assert.equal(config.enabled, true);
    assert.deepEqual(config.store, {
      mode: 'upstash',
      url: FULL.UPSTASH_REDIS_REST_URL,
      token: FULL.UPSTASH_REDIS_REST_TOKEN,
    });
    assert.deepEqual(config.qstash, {
      url: 'https://qstash.upstash.io',
      token: FULL.QSTASH_TOKEN,
      currentSigningKey: FULL.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: FULL.QSTASH_NEXT_SIGNING_KEY,
    });
    assert.deepEqual(config.vapid, {
      publicKey: FULL.SAFEHOUR_VAPID_PUBLIC_KEY,
      privateKey: FULL.SAFEHOUR_VAPID_PRIVATE_KEY,
      subject: FULL.SAFEHOUR_VAPID_SUBJECT,
    });
    assert.equal(config.sealKeys.length, 1);
    assert.ok(Buffer.isBuffer(config.sealKeys[0]));
    assert.equal(config.sealKeys[0].length, 32);
    assert.equal(config.ownerSecret, FULL.SAFEHOUR_WATCH_OWNER_SECRET);
    assert.equal(config.cronSecret, FULL.CRON_SECRET);
    assert.equal(config.baseUrl, 'https://safehour.example.com');
    assert.equal(config.namespace, 'prod');
    assert.equal(config.demo, false);
    assert.equal(config.testHooks, false);
    assert.equal(config.protectionBypass, null);
    assert.equal(config.guardianLoginRequired, true);
    assert.equal(config.testOrigin, null);
  });

  test('스위치가 꺼져 있으면 준비돼도 enabled 가 거짓이다', () => {
    const config = watchConfig(without(FULL, 'SAFEHOUR_SERVER_PUSH'));
    assert.equal(config.ready, true);
    assert.equal(config.switchOn, false);
    assert.equal(config.enabled, false);
  });

  test('차단 스위치가 켜지면 enabled 가 거짓이다', () => {
    const config = watchConfig({ ...FULL, SAFEHOUR_KILL_SERVER_PUSH: ' on ' });
    assert.equal(config.ready, true);
    assert.equal(config.switchOn, true);
    assert.equal(config.killed, true);
    assert.equal(config.enabled, false);
  });

  test('빠지거나 형식이 틀린 값은 이름으로 missing 에 들어간다', () => {
    const cases = [
      ['SAFEHOUR_VAPID_PUBLIC_KEY', { SAFEHOUR_VAPID_PUBLIC_KEY: randomBytes(64).toString('base64url') }],
      [
        'SAFEHOUR_VAPID_PUBLIC_KEY',
        { SAFEHOUR_VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([0x03]), randomBytes(64)]).toString('base64url') },
      ],
      ['SAFEHOUR_VAPID_PUBLIC_KEY', { SAFEHOUR_VAPID_PUBLIC_KEY: 'not base64url!' }],
      ['SAFEHOUR_VAPID_PRIVATE_KEY', { SAFEHOUR_VAPID_PRIVATE_KEY: randomBytes(31).toString('base64url') }],
      ['SAFEHOUR_VAPID_SUBJECT', { SAFEHOUR_VAPID_SUBJECT: 'someone@example.com' }],
      ['SAFEHOUR_VAPID_SUBJECT', { SAFEHOUR_VAPID_SUBJECT: 'http://example.com' }],
      ['SAFEHOUR_PUSH_STORE_KEY', { SAFEHOUR_PUSH_STORE_KEY: randomBytes(31).toString('base64url') }],
      ['SAFEHOUR_WATCH_OWNER_SECRET', { SAFEHOUR_WATCH_OWNER_SECRET: 'a'.repeat(31) }],
      ['CRON_SECRET', { CRON_SECRET: 'c'.repeat(15) }],
      ['QSTASH_NEXT_SIGNING_KEY', { QSTASH_NEXT_SIGNING_KEY: undefined }],
      ['QSTASH_CURRENT_SIGNING_KEY', { QSTASH_CURRENT_SIGNING_KEY: '' }],
      ['QSTASH_TOKEN', { QSTASH_TOKEN: undefined }],
      ['UPSTASH_REDIS_REST_URL', { UPSTASH_REDIS_REST_URL: 'http://example-store.upstash.io' }],
      ['UPSTASH_REDIS_REST_TOKEN', { UPSTASH_REDIS_REST_TOKEN: undefined }],
      ['SAFEHOUR_PUBLIC_BASE_URL', { SAFEHOUR_PUBLIC_BASE_URL: 'http://safehour.example.com' }],
    ];
    for (const [name, patch] of cases) {
      const env = { ...FULL };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
      }
      const config = watchConfig(env);
      assert.deepEqual(config.missing, [name], `${name} 를 잡지 못했다: ${JSON.stringify(config.missing)}`);
      assert.equal(config.ready, false, name);
      assert.equal(config.enabled, false, name);
    }

    // 아무것도 없으면 필요한 이름이 전부 들어간다. 값이 아니라 이름이다
    const empty = watchConfig({});
    assert.deepEqual([...empty.missing].sort(), [
      'CRON_SECRET',
      'QSTASH_CURRENT_SIGNING_KEY',
      'QSTASH_NEXT_SIGNING_KEY',
      'QSTASH_TOKEN',
      'SAFEHOUR_PUBLIC_BASE_URL',
      'SAFEHOUR_PUSH_STORE_KEY',
      'SAFEHOUR_VAPID_PRIVATE_KEY',
      'SAFEHOUR_VAPID_PUBLIC_KEY',
      'SAFEHOUR_VAPID_SUBJECT',
      'SAFEHOUR_WATCH_OWNER_SECRET',
      'UPSTASH_REDIS_REST_TOKEN',
      'UPSTASH_REDIS_REST_URL',
    ]);
    assert.equal(empty.store, null);
    assert.equal(empty.qstash, null);
    assert.equal(empty.vapid, null);
    assert.deepEqual(empty.sealKeys, []);
    assert.equal(empty.ownerSecret, null);
    assert.equal(empty.cronSecret, null);

    // missing 에 값이 섞이지 않는다
    const broken = watchConfig({ ...FULL, CRON_SECRET: 'short-secret' });
    assert.equal(JSON.stringify(broken.missing).includes('short-secret'), false);
  });

  test('이전 봉인 키는 맞으면 두 번째로 들어가고 틀리면 무시한다', () => {
    const previous = randomBytes(32);
    const both = watchConfig({ ...FULL, SAFEHOUR_PUSH_STORE_KEY_PREVIOUS: previous.toString('base64url') });
    assert.equal(both.sealKeys.length, 2);
    assert.ok(both.sealKeys[1].equals(previous));
    const bad = watchConfig({ ...FULL, SAFEHOUR_PUSH_STORE_KEY_PREVIOUS: randomBytes(16).toString('base64url') });
    assert.equal(bad.sealKeys.length, 1);
    assert.deepEqual(bad.missing, []);
  });

  test('QSTASH_URL 을 주면 그 주소를 쓴다', () => {
    const config = watchConfig({ ...FULL, QSTASH_URL: 'https://qstash-eu.example.io/' });
    assert.equal(config.qstash.url, 'https://qstash-eu.example.io');
  });

  test('저장소 환경변수는 두 이름을 모두 읽는다', () => {
    const env = without(FULL, 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
    const config = watchConfig({ ...env, KV_REST_API_URL: 'https://kv-store.upstash.io', KV_REST_API_TOKEN: 'kv-token-value' });
    assert.deepEqual(config.store, { mode: 'upstash', url: 'https://kv-store.upstash.io', token: 'kv-token-value' });
    assert.deepEqual(config.missing, []);
    assert.equal(config.ready, true);

    // 섞인 경우: UPSTASH_ 주소만 있으면 토큰도 UPSTASH_ 에서 읽고, 없으면 그 이름이 빠진 것이다
    const mixed = watchConfig({
      ...env,
      UPSTASH_REDIS_REST_URL: 'https://example-store.upstash.io',
      KV_REST_API_URL: 'https://kv-store.upstash.io',
      KV_REST_API_TOKEN: 'kv-token-value',
    });
    assert.equal(mixed.store, null);
    assert.equal(mixed.ready, false);
    assert.deepEqual(mixed.missing, ['UPSTASH_REDIS_REST_TOKEN']);

    // UPSTASH_ 이름이 먼저다
    const both = watchConfig({ ...FULL, KV_REST_API_URL: 'https://kv-store.upstash.io', KV_REST_API_TOKEN: 'kv-token-value' });
    assert.equal(both.store.url, FULL.UPSTASH_REDIS_REST_URL);
    assert.equal(both.store.token, FULL.UPSTASH_REDIS_REST_TOKEN);
  });

  test('메모리 모드는 데모 로그인일 때만 듣는다', () => {
    const bare = without(
      FULL,
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'QSTASH_TOKEN',
      'QSTASH_CURRENT_SIGNING_KEY',
      'QSTASH_NEXT_SIGNING_KEY',
      'SAFEHOUR_PUBLIC_BASE_URL',
      'VERCEL_ENV',
    );
    const demo = watchConfig({ ...bare, SAFEHOUR_STORE_MODE: 'memory', SAFEHOUR_ALLOW_DEMO_LOGIN: '1' });
    assert.equal(demo.demo, true);
    assert.equal(demo.testHooks, true);
    assert.deepEqual(demo.store, { mode: 'memory' });
    assert.equal(demo.qstash, null);
    assert.equal(demo.baseUrl, null);
    assert.deepEqual(demo.missing, []);
    assert.equal(demo.ready, true);

    // Upstash 값이 있어도 메모리가 이기고, 실제 QStash 와 짝짓지 않는다
    const withUpstash = watchConfig({
      ...FULL,
      VERCEL_ENV: 'preview',
      SAFEHOUR_STORE_MODE: 'memory',
      SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
    });
    assert.deepEqual(withUpstash.store, { mode: 'memory' });
    assert.equal(withUpstash.qstash, null);
    assert.equal(withUpstash.ready, true);

    // 데모가 아니면 memory 를 무시한다
    const notDemo = watchConfig({ ...bare, SAFEHOUR_STORE_MODE: 'memory' });
    assert.equal(notDemo.store, null);
    assert.equal(notDemo.ready, false);
    assert.ok(notDemo.missing.includes('UPSTASH_REDIS_REST_URL'));
    const demoTrue = watchConfig({ ...bare, SAFEHOUR_STORE_MODE: 'memory', SAFEHOUR_ALLOW_DEMO_LOGIN: 'true' });
    assert.equal(demoTrue.demo, false);
    assert.equal(demoTrue.testHooks, false);
    assert.equal(demoTrue.store, null);
    const notDemoUpstash = watchConfig({ ...FULL, SAFEHOUR_STORE_MODE: 'memory' });
    assert.equal(notDemoUpstash.store.mode, 'upstash');
  });

  test('testOrigin 은 데모 로그인일 때만 읽는다', () => {
    const origin = 'http://127.0.0.1:4010';
    const preview = { ...FULL, VERCEL_ENV: 'preview' };
    assert.equal(watchConfig({ ...preview, SAFEHOUR_PUSH_TEST_ORIGIN: origin }).testOrigin, null);
    assert.equal(watchConfig({ ...preview, SAFEHOUR_PUSH_TEST_ORIGIN: origin, SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).testOrigin, origin);
    assert.equal(watchConfig({ ...preview, SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).testOrigin, null);
    // 시험 장치는 미리보기에서 데모 로그인일 때 켜진다
    assert.equal(watchConfig(preview).testHooks, false);
    assert.equal(watchConfig({ ...preview, SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).testHooks, true);
  });

  test('testOrigin 은 http(s) 주소의 출처만 남긴다', () => {
    const demo = { ...FULL, VERCEL_ENV: 'preview', SAFEHOUR_ALLOW_DEMO_LOGIN: '1' };
    assert.equal(watchConfig({ ...demo, SAFEHOUR_PUSH_TEST_ORIGIN: 'http://127.0.0.1:4010/' }).testOrigin, 'http://127.0.0.1:4010');
    assert.equal(
      watchConfig({ ...demo, SAFEHOUR_PUSH_TEST_ORIGIN: 'https://push.example.test/path?q=1' }).testOrigin,
      'https://push.example.test',
    );
    assert.equal(watchConfig({ ...demo, SAFEHOUR_PUSH_TEST_ORIGIN: 'ftp://127.0.0.1' }).testOrigin, null);
    assert.equal(watchConfig({ ...demo, SAFEHOUR_PUSH_TEST_ORIGIN: 'not a url' }).testOrigin, null);
  });

  test('운영 배포에서는 데모 로그인이 켜져 있어도 시험 장치를 듣지 않는다', () => {
    const env = {
      ...FULL,
      VERCEL_ENV: 'production',
      SAFEHOUR_ALLOW_DEMO_LOGIN: '1',
      SAFEHOUR_STORE_MODE: 'memory',
      SAFEHOUR_PUSH_TEST_ORIGIN: 'http://127.0.0.1:4010',
    };
    const config = watchConfig(env);
    assert.equal(config.demo, true);
    // 시험 장치(서버 알림 경로의 데모 세션 허용 포함)는 꺼진다
    assert.equal(config.testHooks, false);
    assert.equal(config.store.mode, 'upstash');
    assert.equal(config.testOrigin, null);
    assert.equal(config.ready, true);
    // Upstash 값을 빼도 메모리로 넘어가지 않는다
    const noStore = watchConfig(without(env, 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'));
    assert.equal(noStore.store, null);
    assert.equal(noStore.ready, false);
    assert.ok(noStore.missing.includes('UPSTASH_REDIS_REST_URL'));
    // http 되부를 주소도 받지 않는다
    assert.equal(watchConfig({ ...env, SAFEHOUR_PUBLIC_BASE_URL: 'http://localhost:3000' }).baseUrl, null);
  });

  test('VAPID 공개키와 개인키는 같은 쌍이어야 한다', () => {
    const other = vapidPair();
    const mismatched = watchConfig({ ...FULL, SAFEHOUR_VAPID_PRIVATE_KEY: other.privateKey });
    assert.deepEqual(mismatched.missing, ['SAFEHOUR_VAPID_PRIVATE_KEY']);
    assert.equal(mismatched.vapid, null);
    assert.equal(mismatched.ready, false);
    const zero = watchConfig({ ...FULL, SAFEHOUR_VAPID_PRIVATE_KEY: Buffer.alloc(32).toString('base64url') });
    assert.deepEqual(zero.missing, ['SAFEHOUR_VAPID_PRIVATE_KEY']);
    assert.equal(zero.vapid, null);
  });

  test('VAPID 키는 채움 문자 없는 base64url 로 돌려준다', () => {
    const padded = (value) => Buffer.from(value, 'base64url').toString('base64');
    const toUrlPadded = (value) => padded(value).replace(/\+/g, '-').replace(/\//g, '_');
    const publicPadded = toUrlPadded(VAPID.publicKey);
    const privatePadded = toUrlPadded(VAPID.privateKey);
    assert.ok(publicPadded.endsWith('='), '시험 값에 채움 문자가 없다');
    assert.ok(privatePadded.endsWith('='), '시험 값에 채움 문자가 없다');
    const config = watchConfig({ ...FULL, SAFEHOUR_VAPID_PUBLIC_KEY: publicPadded, SAFEHOUR_VAPID_PRIVATE_KEY: privatePadded });
    assert.deepEqual(config.missing, []);
    assert.equal(config.vapid.publicKey, VAPID.publicKey);
    assert.equal(config.vapid.privateKey, VAPID.privateKey);
  });

  test('소유 비밀이 세션 서명 키와 같으면 빠진 것으로 본다', () => {
    const same = watchConfig({ ...FULL, SAFEHOUR_SESSION_SECRET: ` ${FULL.SAFEHOUR_WATCH_OWNER_SECRET} ` });
    assert.deepEqual(same.missing, ['SAFEHOUR_WATCH_OWNER_SECRET']);
    assert.equal(same.ownerSecret, null);
    const different = watchConfig({ ...FULL, SAFEHOUR_SESSION_SECRET: randomBytes(48).toString('base64url') });
    assert.deepEqual(different.missing, []);
  });

  test('namespace 는 VERCEL_ENV 를 따른다', () => {
    assert.equal(watchConfig({ ...FULL, VERCEL_ENV: 'production' }).namespace, 'prod');
    assert.equal(watchConfig({ ...FULL, VERCEL_ENV: 'preview' }).namespace, 'prev');
    assert.equal(watchConfig({ ...FULL, VERCEL_ENV: 'development' }).namespace, 'dev');
    assert.equal(watchConfig(without(FULL, 'VERCEL_ENV')).namespace, 'dev');
  });

  test('baseUrl 순서: 명시 값, 운영 주소, 미리보기 주소', () => {
    const vercel = {
      VERCEL_PROJECT_PRODUCTION_URL: 'safehour.example.com',
      VERCEL_BRANCH_URL: 'safehour-git-feature.vercel.app',
      VERCEL_URL: 'safehour-abc123.vercel.app',
    };
    // 명시 값이 먼저다. 끝 슬래시는 뗀다
    assert.equal(
      watchConfig({ ...FULL, ...vercel, SAFEHOUR_PUBLIC_BASE_URL: 'https://push.example.com/' }).baseUrl,
      'https://push.example.com',
    );
    const implicit = without(FULL, 'SAFEHOUR_PUBLIC_BASE_URL');
    // 운영이면 운영 주소
    assert.equal(watchConfig({ ...implicit, ...vercel, VERCEL_ENV: 'production' }).baseUrl, 'https://safehour.example.com');
    // 미리보기면 브랜치 주소, 없으면 배포 주소. 운영 주소는 미리보기에서도 있지만 쓰지 않는다
    assert.equal(
      watchConfig({ ...implicit, ...vercel, VERCEL_ENV: 'preview' }).baseUrl,
      'https://safehour-git-feature.vercel.app',
    );
    assert.equal(
      watchConfig({ ...implicit, ...without(vercel, 'VERCEL_BRANCH_URL'), VERCEL_ENV: 'preview' }).baseUrl,
      'https://safehour-abc123.vercel.app',
    );
    // 아무것도 없으면 null 이고 missing 에 명시 값 이름이 들어간다
    const none = watchConfig(implicit);
    assert.equal(none.baseUrl, null);
    assert.deepEqual(none.missing, ['SAFEHOUR_PUBLIC_BASE_URL']);
    // http 는 데모의 localhost·127.0.0.1 만
    const preview = { ...FULL, VERCEL_ENV: 'preview' };
    assert.equal(watchConfig({ ...preview, SAFEHOUR_PUBLIC_BASE_URL: 'http://localhost:3000' }).baseUrl, null);
    assert.equal(
      watchConfig({ ...preview, SAFEHOUR_PUBLIC_BASE_URL: 'http://localhost:3000', SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).baseUrl,
      'http://localhost:3000',
    );
    assert.equal(
      watchConfig({ ...preview, SAFEHOUR_PUBLIC_BASE_URL: 'http://127.0.0.1:3000', SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).baseUrl,
      'http://127.0.0.1:3000',
    );
    assert.equal(
      watchConfig({ ...preview, SAFEHOUR_PUBLIC_BASE_URL: 'http://example.com', SAFEHOUR_ALLOW_DEMO_LOGIN: '1' }).baseUrl,
      null,
    );
  });

  // 최종 검토(2026-11-15)에서 운영은 읽지 않게 바꿨다. 운영 예약 메시지에 미리보기 보호 우회 비밀을 싣지 않는다
  test('보호 우회 비밀은 운영 배포가 아닐 때만 VERCEL_AUTOMATION_BYPASS_SECRET 에서 읽는다', () => {
    const bypass = { VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-value' };
    for (const vercelEnv of ['preview', 'development', undefined]) {
      const env = { ...FULL, ...bypass, VERCEL_ENV: vercelEnv };
      assert.equal(watchConfig(env).protectionBypass, 'bypass-value', String(vercelEnv));
    }
    assert.equal(watchConfig({ ...FULL, VERCEL_ENV: 'preview' }).protectionBypass, null);
    // 운영 배포는 값이 있어도 null 이고, 준비 상태는 그대로다
    const prod = watchConfig({ ...FULL, ...bypass });
    assert.equal(FULL.VERCEL_ENV, 'production');
    assert.equal(prod.protectionBypass, null);
    assert.equal(prod.ready, true);
  });

  test('guardianLoginRequired 는 기본이 참이고 "1" 일 때만 거짓이다', () => {
    assert.equal(watchConfig(FULL).guardianLoginRequired, true);
    assert.equal(watchConfig({ ...FULL, SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN: '1' }).guardianLoginRequired, false);
    for (const value of ['true', 'on', ' 1', '']) {
      assert.equal(watchConfig({ ...FULL, SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN: value }).guardianLoginRequired, true, value);
    }
  });
});

describe('오류 코드와 기본값', () => {
  test('오류 코드와 상태', () => {
    assert.equal(ERROR_CODE.SERVER_PUSH_OFF, 'SAFEHOUR_SERVER_PUSH_OFF');
    assert.equal(ERROR_CODE.SERVER_PUSH_UNAVAILABLE, 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE');
    assert.equal(ERROR_CODE.WATCH_NOT_FOUND, 'SAFEHOUR_WATCH_NOT_FOUND');
    assert.equal(ERROR_CODE.RATE_LIMITED, 'SAFEHOUR_RATE_LIMITED');
    assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.SERVER_PUSH_OFF], 503);
    assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.SERVER_PUSH_UNAVAILABLE], 503);
    assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.WATCH_NOT_FOUND], 404);
    assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.RATE_LIMITED], 429);
  });

  test('서버 푸시 유예 기본값은 10분이다', () => {
    assert.equal(DEFAULTS.notifications.serverPushGraceMin, 10);
  });
});

describe('헬스와 비밀 생성 스크립트', () => {
  const touched = new Map();
  afterEach(() => {
    for (const [name, value] of touched) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    touched.clear();
  });
  function setEnv(values) {
    for (const [name, value] of Object.entries(values)) {
      if (!touched.has(name)) touched.set(name, process.env[name]);
      process.env[name] = value;
    }
  }

  test('헬스 응답은 준비 여부와 빠진 이름만 알리고 값을 담지 않는다', async () => {
    setEnv({ ...FULL, VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret-value-for-test' });
    const raw = await (await healthGet()).text();
    const data = JSON.parse(raw);
    assert.equal(data.config.serverPushReady, true);
    assert.deepEqual(data.config.serverPushMissing, []);
    assert.equal(data.flags.serverPush, true);
    assert.equal(data.flags.serverPushKilled, false);
    for (const name of [...SECRET_NAMES, 'SAFEHOUR_VAPID_PUBLIC_KEY', 'UPSTASH_REDIS_REST_URL']) {
      assert.equal(raw.includes(FULL[name]), false, `${name} 값이 헬스 응답에 나갔다`);
    }
    assert.equal(raw.includes('bypass-secret-value-for-test'), false);

    // 하나가 빠지면 이름만 알린다
    setEnv({ CRON_SECRET: 'too-short' });
    const broken = await (await healthGet()).text();
    assert.equal(JSON.parse(broken).config.serverPushReady, false);
    assert.deepEqual(JSON.parse(broken).config.serverPushMissing, ['CRON_SECRET']);
    assert.equal(broken.includes('too-short'), false);
  });

  test('generate-push-secrets 는 형식에 맞는 값을 낸다', () => {
    const out = execFileSync(process.execPath, ['scripts/generate-push-secrets.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const lines = out.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
    const generated = {};
    for (const line of lines) {
      const match = /^([A-Z_]+)=([A-Za-z0-9_-]+)$/.exec(line);
      assert.ok(match, '한 줄이 NAME=값 형식이 아니다');
      generated[match[1]] = match[2];
    }
    const names = [
      'SAFEHOUR_VAPID_PUBLIC_KEY',
      'SAFEHOUR_VAPID_PRIVATE_KEY',
      'SAFEHOUR_PUSH_STORE_KEY',
      'SAFEHOUR_WATCH_OWNER_SECRET',
      'CRON_SECRET',
    ];
    assert.deepEqual(Object.keys(generated).sort(), [...names].sort());
    const env = { ...without(FULL, ...names), ...generated };
    const config = watchConfig(env);
    for (const name of names) assert.equal(config.missing.includes(name), false, `${name} 형식이 맞지 않는다`);
    assert.deepEqual(config.missing, []);
    assert.equal(config.ready, true);
    // 실행할 때마다 새 값이다
    const again = execFileSync(process.execPath, ['scripts/generate-push-secrets.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(again, out);
  });
});
