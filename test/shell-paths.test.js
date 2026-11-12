// 앱 셸의 경로별 표시 규칙 (components/ui/shellPaths.js)
//
// 세션 확인과 보기 전용 배너는 서로 다른 일이다. 받은 링크 화면(/g)은 배너만 두지 않고 세션은 꼭 확인한다:
// 세션 확인이 꺼지면 로그인한 보호자도 PIN 입력에 닿지 못한다(2026-11-12 사용성 점검 D2 작업에서 실제로 났던 회귀).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BANNER_HIDDEN_PATHS,
  NAV_HIDDEN_PATHS,
  STATUS_HIDDEN_PATHS,
  matchesPath,
  shellFlags,
} from '../components/ui/shellPaths.js';

describe('shellFlags: 경로별 셸 표시', () => {
  test('받은 링크 화면(/g)은 세션을 확인하고, 보기 전용 배너와 하단 내비는 두지 않고, 하단 긴급 바를 둔다', () => {
    assert.deepEqual(shellFlags('/g'), { showNav: false, checkSession: true, showBanner: false, showEmergencyBar: true });
    assert.equal(STATUS_HIDDEN_PATHS.includes('/g'), false, '/g 를 세션 확인을 건너뛰는 목록에 넣으면 PIN 입력이 열리지 않는다');
    assert.equal(BANNER_HIDDEN_PATHS.includes('/g'), true);
  });

  test('보통 화면은 세션 확인·배너·내비가 모두 켜진다', () => {
    for (const path of ['/today', '/trip', '/trip/2026-11-12', '/conditions', '/more', '/settings', '/guardian', '/guide', '/emergency', '/help']) {
      assert.deepEqual(shellFlags(path), { showNav: true, checkSession: true, showBanner: true, showEmergencyBar: false }, path);
    }
  });

  test('시작·로그인·시안 보드는 셸이 세션을 묻지 않고 배너도 없다', () => {
    for (const path of ['/', '/login', '/design-board']) {
      const flags = shellFlags(path);
      assert.equal(flags.checkSession, false, path);
      assert.equal(flags.showBanner, false, path);
    }
    // 시작 화면은 긴급을 자기 하단 바 안에 직접 그린다
    assert.equal(shellFlags('/').showEmergencyBar, false);
    assert.equal(shellFlags('/login').showEmergencyBar, true);
  });

  test('체류 설정은 내비 없이 세션 확인과 배너가 있다', () => {
    assert.deepEqual(shellFlags('/onboarding'), { showNav: false, checkSession: true, showBanner: true, showEmergencyBar: true });
  });

  test('경로 맞춤은 전체 일치나 하위 경로만이다: /g 는 /guardian·/guide 와 맞지 않는다', () => {
    assert.equal(matchesPath('/guardian', ['/g']), false);
    assert.equal(matchesPath('/guide', ['/g']), false);
    assert.equal(matchesPath('/g', ['/g']), true);
    assert.equal(matchesPath('/g/x', ['/g']), true);
    assert.equal(matchesPath('/today', ['/']), false);
    assert.equal(matchesPath('/', ['/']), true);
    assert.equal(NAV_HIDDEN_PATHS.includes('/g'), true);
  });

  test('경로가 없으면 시작 화면으로 본다', () => {
    assert.deepEqual(shellFlags(null), shellFlags('/'));
    assert.deepEqual(shellFlags(undefined), shellFlags('/'));
  });
});
