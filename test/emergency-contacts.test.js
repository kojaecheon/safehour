// 긴급 연락 번호 (AX-318 · docs/decisions/0010-map-links-emergency-notifications.md '긴급 연락', docs/platform/IA_AND_FLOWS.md '고정 요소'·'보기 전용 상태')
//
// 이 파일이 고정하는 것
//   - 119, 1330 전화 걸기 링크. 1330 은 공식 안내의 국내 형식(국번 없이 1330)과 해외 형식(+82-2-1330)
//   - 등록한 병원 전화는 병원 이름과 함께, 전화 걸기 링크로 쓸 수 있는 형식만 링크로 만든다
//   - 연락처 목록에 병원 좌표·주소가 없다 (긴급 화면은 이름과 전화만 보여준다)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EMERGENCY_LINES, hospitalContacts, telHref } from '../app/emergency/contacts.js';
import { makeStay } from './stay-fixtures.js';

describe('119 · 1330', () => {
  test('119 는 tel:119, 1330 은 국번 없이 tel:1330 + 해외 형식 tel:+82-2-1330', () => {
    const byId = Object.fromEntries(EMERGENCY_LINES.map((line) => [line.id, line]));
    assert.deepEqual(Object.keys(byId), ['119', '1330']);
    assert.equal(byId['119'].href, 'tel:119');
    assert.equal(byId['119'].number, '119');
    assert.equal(byId['1330'].href, 'tel:1330');
    assert.equal(byId['1330'].number, '1330');
    assert.deepEqual({ ...byId['1330'].intl }, { number: '+82-2-1330', href: 'tel:+82-2-1330' });
    assert.ok(Object.isFrozen(EMERGENCY_LINES));
  });
});

describe('병원 전화', () => {
  test('전화 걸기 링크 — 숫자·하이픈·앞자리 + 만 남긴다', () => {
    assert.equal(telHref('02-1234-5678'), 'tel:02-1234-5678');
    assert.equal(telHref(' (02) 1234 5678 '), 'tel:0212345678');
    assert.equal(telHref('+82 2 1234 5678'), 'tel:+82212345678');
    assert.equal(telHref('010.1234.5678'), 'tel:01012345678');
    assert.equal(telHref('1588-0000'), 'tel:1588-0000');
  });

  test('링크로 만들 수 없는 값은 null', () => {
    for (const value of [
      '',
      '   ',
      null,
      undefined,
      42,
      'abc',
      '12',
      '1234567890123456',
      'javascript:alert(1)',
      '02-1234-5678 ext 1',
      '0+2-1234',
      '--',
    ]) {
      assert.equal(telHref(value), null, String(value));
    }
  });

  test('등록한 병원마다 이름과 전화 — 전화가 없거나 형식이 틀리면 href 없이 남긴다', () => {
    const stay = makeStay({
      hospitals: [
        { id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 1', lat: 37.52, lng: 127.02, source: 'DEMO' }, phone: '02-0000-0000' },
        { id: 'H2', name: '둘째 병원', address: { roadAddress: '테스트로 2', lat: 37.53, lng: 127.03, source: 'DEMO' } },
        { id: 'H3', name: '셋째 병원', address: { roadAddress: '테스트로 3', lat: 37.54, lng: 127.04, source: 'DEMO' }, phone: 'call me' },
      ],
    });
    assert.deepEqual(hospitalContacts(stay), [
      { hospitalId: 'H1', name: '테스트 병원', phone: '02-0000-0000', href: 'tel:02-0000-0000' },
      { hospitalId: 'H2', name: '둘째 병원', phone: null, href: null },
      { hospitalId: 'H3', name: '셋째 병원', phone: null, href: null },
    ]);
  });

  test('체류가 없거나 병원이 없으면 빈 목록', () => {
    assert.deepEqual(hospitalContacts(null), []);
    assert.deepEqual(hospitalContacts({}), []);
    assert.deepEqual(hospitalContacts(makeStay({ hospitals: [] })), []);
  });

  test('연락처에 좌표·주소가 없다', () => {
    const json = JSON.stringify(hospitalContacts(makeStay()));
    for (const leak of ['"lat"', '"lng"', 'roadAddress', '37.52']) assert.ok(!json.includes(leak), leak);
  });
});
