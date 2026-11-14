// 서버 알림 비밀 만들기 (ADR-0012 · lib/server/watch/config.js)
//
//   node scripts/generate-push-secrets.mjs
//
// VAPID 키 쌍(P-256)과 무작위 비밀 셋을 만들어 표준 출력에 NAME=값 으로 한 줄씩 낸다.
// 새 의존성 없이 node:crypto 만 쓴다. 파일을 쓰지 않고 네트워크를 쓰지 않는다.
//
// 주의
//   - 운영과 미리보기에 서로 다른 값을 쓴다. 환경마다 한 번씩 따로 돌린다.
//   - 출력은 비밀번호 관리자에만 옮긴다. 파일로 저장하거나 메신저에 붙이지 않는다.
//   - 저장소에 커밋하지 않는다(.env.local 도 커밋 대상이 아니다).
//   - SAFEHOUR_WATCH_OWNER_SECRET 을 바꾸면 기존 지켜보기를 더는 찾지 못한다. 처음 한 번만 정한다.

import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

// 비압축 공개키: 0x04 + x(32) + y(32) = 65바이트. 개인키는 d(32바이트)
const rawPublic = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);

const lines = [
  ['SAFEHOUR_VAPID_PUBLIC_KEY', rawPublic.toString('base64url')],
  ['SAFEHOUR_VAPID_PRIVATE_KEY', priv.d],
  ['SAFEHOUR_PUSH_STORE_KEY', randomBytes(32).toString('base64url')],
  ['SAFEHOUR_WATCH_OWNER_SECRET', randomBytes(32).toString('base64url')],
  ['CRON_SECRET', randomBytes(32).toString('base64url')],
];

process.stdout.write(lines.map(([name, value]) => `${name}=${value}`).join('\n') + '\n');
