// 설치된 앱 판별과 문의 링크 (S5)
// 화면은 읽은 값만 순수 함수에 넘긴다. 여기서는 신호 조합을 그대로 고정한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isInstalledApp, readInstalled } from '../components/pwa/installState.js';
import { contactLink } from '../components/help/contact.js';

describe('isInstalledApp', () => {
  test('두 신호가 모두 없으면 설치 안 됨', () => {
    assert.equal(isInstalledApp({ standaloneMatch: false, navigatorStandalone: false }), false);
    assert.equal(isInstalledApp({}), false);
    assert.equal(isInstalledApp(), false);
  });

  test('display-mode standalone 만 참이어도 설치됨', () => {
    assert.equal(isInstalledApp({ standaloneMatch: true, navigatorStandalone: false }), true);
  });

  test('iOS navigator.standalone 만 참이어도 설치됨', () => {
    assert.equal(isInstalledApp({ standaloneMatch: false, navigatorStandalone: true }), true);
  });

  test('참이 아닌 값(undefined·null·문자열)은 설치됨으로 읽지 않는다', () => {
    assert.equal(isInstalledApp({ standaloneMatch: undefined, navigatorStandalone: undefined }), false);
    assert.equal(isInstalledApp({ standaloneMatch: null, navigatorStandalone: 'true' }), false);
  });
});

describe('readInstalled', () => {
  test('window 가 없으면 설치 안 됨', () => {
    assert.equal(readInstalled(undefined), false);
  });

  test('matchMedia 결과와 navigator.standalone 을 합쳐 읽는다', () => {
    const asked = [];
    const win = (matches, standalone) => ({
      matchMedia: (q) => {
        asked.push(q);
        return { matches };
      },
      navigator: { standalone },
    });
    assert.equal(readInstalled(win(true, undefined)), true);
    assert.equal(readInstalled(win(false, true)), true);
    assert.equal(readInstalled(win(false, undefined)), false);
    assert.ok(asked.every((q) => q === '(display-mode: standalone)'));
  });

  test('matchMedia 가 없거나 던져도 설치 안 됨으로 본다', () => {
    assert.equal(readInstalled({ navigator: {} }), false);
    assert.equal(
      readInstalled({
        matchMedia: () => {
          throw new Error('blocked');
        },
        navigator: {},
      }),
      false,
    );
  });
});

describe('contactLink', () => {
  test('값이 없으면 null: 문의 구역을 그리지 않는다', () => {
    assert.equal(contactLink(undefined), null);
    assert.equal(contactLink(''), null);
    assert.equal(contactLink('   '), null);
  });

  test('mailto·https·이메일 주소는 링크가 된다', () => {
    assert.deepEqual(contactLink('mailto:help@example.com'), { href: 'mailto:help@example.com', label: 'help@example.com' });
    assert.deepEqual(contactLink('https://example.com/contact'), { href: 'https://example.com/contact', label: 'example.com/contact' });
    assert.deepEqual(contactLink('help@example.com'), { href: 'mailto:help@example.com', label: 'help@example.com' });
  });

  test('허용하지 않는 형태는 링크로 만들지 않고 글자로만 보여 준다', () => {
    assert.deepEqual(contactLink('javascript:alert(1)'), { href: null, label: 'javascript:alert(1)' });
    assert.deepEqual(contactLink('카카오 채널 SafeHour'), { href: null, label: '카카오 채널 SafeHour' });
  });
});
