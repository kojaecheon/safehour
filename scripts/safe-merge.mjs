#!/usr/bin/env node
// CI 통과를 확인하고서만 PR 을 병합한다.
//
// 왜 스크립트인가: 비공개 저장소 + GitHub 무료 플랜에서는 branch protection 과
// auto-merge 를 쓸 수 없다(HTTP 403 / 설정 무시). 실제로 PR #4 가 CI 실패 상태로
// 병합돼 main 이 깨진 적이 있다. 플랜을 올리기 전까지 이 스크립트가 그 자리를 대신한다.
//
// 사용법: npm run merge -- <PR번호> [--wait]

import { execFileSync } from 'node:child_process';

const POLL_INTERVAL_MS = 20_000;
const MAX_WAIT_MS = 15 * 60_000;

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const [prNumber, ...flags] = process.argv.slice(2);
if (!prNumber || !/^\d+$/.test(prNumber)) {
  fail('PR 번호가 필요합니다. 예: npm run merge -- 12 [--wait]');
}
const shouldWait = flags.includes('--wait');

function readChecks() {
  try {
    return JSON.parse(gh(['pr', 'checks', prNumber, '--json', 'name,bucket,link']));
  } catch (error) {
    // 체크가 하나도 없으면 gh 가 비정상 종료한다 — 이때도 병합을 막는다
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (output.includes('no checks reported')) return [];
    throw error;
  }
}

const deadline = Date.now() + MAX_WAIT_MS;
let checks = readChecks();

while (shouldWait && checks.some((c) => c.bucket === 'pending') && Date.now() < deadline) {
  const pending = checks.filter((c) => c.bucket === 'pending').map((c) => c.name);
  console.log(`… CI 대기 중: ${pending.join(', ')}`);
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  checks = readChecks();
}

if (checks.length === 0) {
  fail('CI 체크가 하나도 보고되지 않았습니다. 워크플로가 실행됐는지 확인하세요.');
}

const pending = checks.filter((c) => c.bucket === 'pending');
if (pending.length > 0) {
  fail(
    `아직 실행 중인 체크가 있습니다: ${pending.map((c) => c.name).join(', ')}\n` +
      '  --wait 를 붙이면 완료까지 기다립니다.',
  );
}

const failed = checks.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping');
if (failed.length > 0) {
  fail(
    `CI 가 통과하지 않았습니다:\n${failed
      .map((c) => `    ${c.name}: ${c.bucket}\n      ${c.link ?? ''}`)
      .join('\n')}\n` +
      '  실패한 상태로 병합하면 main 이 깨집니다. 먼저 고치세요.',
  );
}

console.log(`✓ CI 통과 (${checks.map((c) => c.name).join(', ')}) — 병합합니다.`);
console.log(gh(['pr', 'merge', prNumber, '--squash', '--delete-branch']));
