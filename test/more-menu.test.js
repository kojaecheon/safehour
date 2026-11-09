// 더보기(/more) 메뉴 묶음 (usability 2026-11-08 D1)
//
// 보호자 사본이 이 기기에 있으면 도구 묶음 맨 위에 '받은 일정(보호자)' 행을 둔다. 없으면 예전 메뉴 그대로다.
// 화면(app/more/page.js)은 이 함수가 돌려준 묶음만 그린다. 사본이 있는지는 화면이 저장소를 읽기만 해서 넘긴다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { moreMenuGroups } from '../components/settings/moreMenu.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { MAX_TIMER_MS, guardianExpiryDelay, hasLiveGuardianCopy, liveGuardianCopies } from '../components/guardian/expiry.js';

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

// 리뷰 M2: '받은 일정' 행·버튼은 마지막 사본이 만료되면 화면을 연 채로도 사라져야 한다.
// 저장소는 읽을 때 만료 사본을 치우지만 알리지 않으므로, 훅이 가장 이른 만료 시각에 한 번 다시 읽는다.

describe('guardianExpiryDelay: 가장 이른 사본 만료까지 기다릴 시간', () => {
  const now = Date.parse('2026-11-09T10:00:00+09:00');

  test('가장 이른 만료 시각 + 1초', () => {
    const copies = [{ expiresAt: '2026-11-09T12:00:00+09:00' }, { expiresAt: '2026-11-09T11:00:00+09:00' }];
    assert.equal(guardianExpiryDelay(copies, now), 60 * 60 * 1000 + 1000);
  });

  test('이미 지난 만료는 1초 뒤(바로 다시 읽어 치운다)', () => {
    assert.equal(guardianExpiryDelay([{ expiresAt: '2026-11-09T09:00:00+09:00' }], now), 1000);
  });

  test('타이머 상한을 넘지 않는다', () => {
    assert.equal(guardianExpiryDelay([{ expiresAt: '2027-12-31T00:00:00+09:00' }], now), MAX_TIMER_MS);
  });

  test('사본이 없거나 만료 시각을 읽을 수 없으면 null (타이머 없음)', () => {
    assert.equal(guardianExpiryDelay([], now), null);
    assert.equal(guardianExpiryDelay(undefined, now), null);
    assert.equal(guardianExpiryDelay([{ expiresAt: 'x' }, {}], now), null);
    assert.equal(guardianExpiryDelay([{ expiresAt: '2026-11-09T11:00:00+09:00' }], NaN), null);
  });
});

describe('liveGuardianCopies / hasLiveGuardianCopy: 만료되지 않은 사본만 센다 (리뷰 M5)', () => {
  const now = Date.UTC(2026, 10, 6, 1, 0);
  test('만료 시각이 지난 사본은 빼고, 지나지 않았거나 읽을 수 없는 사본은 남긴다', () => {
    const copies = [
      { id: 'a', expiresAt: new Date(now - 1000).toISOString() },
      { id: 'b', expiresAt: new Date(now + 60_000).toISOString() },
      { id: 'c', expiresAt: 'nonsense' },
      { id: 'd' },
    ];
    assert.deepEqual(liveGuardianCopies(copies, now).map((c) => c.id), ['b', 'c', 'd']);
    assert.equal(hasLiveGuardianCopy(copies, now), true);
    assert.equal(hasLiveGuardianCopy([copies[0]], now), false, '만료 사본만 남아 있으면 없음');
    assert.deepEqual(liveGuardianCopies(null, now), []);
  });
  test('살아 있는 사본만으로 만료 지연을 재면 지난 사본 때문에 1초로 눌리지 않는다', () => {
    const copies = [{ expiresAt: new Date(now - 1000).toISOString() }, { expiresAt: new Date(now + 120_000).toISOString() }];
    assert.equal(guardianExpiryDelay(liveGuardianCopies(copies, now), now), 121_000);
  });
});
