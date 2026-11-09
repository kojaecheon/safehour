// 더보기(/more) 메뉴 묶음 (usability 2026-11-08 D1)
//
// 보호자 사본이 이 기기에 있으면 도구 묶음 맨 위에 '받은 일정(보호자)' 행을 둔다. 없으면 예전 메뉴 그대로다.
// 화면(app/more/page.js)은 이 함수가 돌려준 묶음만 그린다. 사본이 있는지는 화면이 저장소를 읽기만 해서 넘긴다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { moreMenuGroups } from '../components/settings/moreMenu.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';

describe('moreMenuGroups: 더보기 메뉴 묶음', () => {
  test('보호자 사본이 없으면 도구 5행, 정보 2행 그대로다', () => {
    const groups = moreMenuGroups({ hasGuardianCopies: false });
    assert.deepEqual(
      groups.map((g) => g.id),
      ['more-tools', 'more-info'],
    );
    assert.deepEqual(
      groups[0].items.map((i) => i.href),
      ['/cards', '/guardian', '/conditions', '/onboarding?edit=1', '/settings'],
    );
    assert.deepEqual(
      groups[1].items.map((i) => i.href),
      ['/help', '/privacy'],
    );
    assert.deepEqual(moreMenuGroups(), groups, '인자가 없으면 사본 없음으로 본다');
  });

  test('보호자 사본이 있으면 도구 맨 위에 받은 일정(/g) 행이 붙고 나머지는 그대로다', () => {
    const without = moreMenuGroups({ hasGuardianCopies: false });
    const groups = moreMenuGroups({ hasGuardianCopies: true });
    assert.equal(groups[0].items.length, 6);
    assert.deepEqual(groups[0].items[0], {
      href: '/g',
      icon: 'navTrip',
      label: 'settings.moreReceived',
      desc: 'settings.moreReceivedDesc',
    });
    assert.deepEqual(groups[0].items.slice(1), without[0].items);
    assert.deepEqual(groups[1], without[1]);
  });

  test('모든 행의 문구 키가 네 언어로 있다', () => {
    for (const group of moreMenuGroups({ hasGuardianCopies: true })) {
      for (const key of [group.label, ...group.items.flatMap((i) => [i.label, i.desc])]) {
        for (const lang of ['ko', 'en', 'ja', 'zh']) assert.ok(UI_TEXT[key]?.[lang], `${key}.${lang}`);
      }
    }
  });
});
