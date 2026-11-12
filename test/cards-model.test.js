// 한국어 안내 카드 모델 (AX-318 · docs/business-rules.md '알림과 카드', docs/platform/IA_AND_FLOWS.md '보기 전용 상태'. 테스트 이름의 spec 번호와 규칙 번호(39)는 옛 설계서 번호다)
//
// 이 파일이 고정하는 것
//   - 식이 카드: 그날 적용되는 식이 항목(합성 결과 '예')마다 한 줄. '모르겠음'은 기본값('예')으로 들어간다.
//     조건이 정해지지 않은 날(NEEDS_INPUT)은 식이 카드를 만들지 않는다 — '제한 없음'으로 읽지 않는다.
//   - 이동 카드: 오늘 정거장의 한국어 원문(Stop.ko). 원문이 없으면 표시 언어 주소 + '한국어 주소 확인 필요'.
//   - 복귀 카드: 그날 숙소 이름·주소(출국일은 전날 밤 숙소). 병원 카드: 병원 이름·주소.
//   - 카드 모델에 좌표·전화가 없다, 복귀·병원 카드는 주소 글자만 보여준다(docs/business-rules.md '알림과 카드'의 지도 링크 문단).
//   - 고정 문구만 쓴다. 이 모델은 문구를 만들지 않고 항목 키만 준다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildTodayCards, DIET_ORDER, DIET_STATUS } from '../components/cards/cardModel.js';
import { SET, UNKNOWN, deepFreeze, makeStay, selfPeriod } from './stay-fixtures.js';

const YES = SET(true);

function stop(id, overrides = {}) {
  return {
    id,
    contentId: id.split(':')[2],
    title: `Place ${id}`,
    address: `${id} Test-ro, Seoul`,
    lang: 'en',
    lat: 37.57,
    lng: 126.98,
    ko: { title: `장소 ${id}`, address: `서울특별시 테스트로 ${id}` },
    arriveAt: '10:30',
    ...overrides,
  };
}

function dayPlan(date, { outings = [], guardianOutings = [] } = {}) {
  return { date, coverage: 'RESTRICTED', dayState: 'TOGETHER', outings, guardianOutings };
}

describe('식이 카드', () => {
  test('적용되는 식이 항목만, 정해진 순서로 — 모르겠음은 기본값(예)으로 들어간다', () => {
    const stay = makeStay({ periods: [selfPeriod({ items: { diet: { raw: YES, alcohol: UNKNOWN } } })] });
    const cards = buildTodayCards({ stay, date: '2026-10-04' });
    assert.equal(cards.diet.status, DIET_STATUS.APPLIED);
    assert.deepEqual(cards.diet.items, ['alcohol', 'raw']);
  });

  test('기간이 겹치면 합성 결과(엄격한 값)를 쓴다', () => {
    const stay = makeStay({
      periods: [
        selfPeriod({ id: 'A', items: { diet: { spicy: YES } } }),
        selfPeriod({ id: 'B', items: { diet: { hot: YES, hard: YES } } }),
      ],
    });
    const cards = buildTodayCards({ stay, date: '2026-10-05' });
    assert.deepEqual(cards.diet.items, ['spicy', 'hard', 'hot']);
  });

  test('항목 순서는 spec 4.12 표의 순서다', () => {
    assert.deepEqual([...DIET_ORDER], ['spicy', 'alcohol', 'hard', 'hot', 'raw']);
  });

  test('식이 항목이 모두 아니오면 NONE — 카드 줄이 없다', () => {
    const stay = makeStay({ periods: [selfPeriod()] });
    const cards = buildTodayCards({ stay, date: '2026-10-04' });
    assert.equal(cards.diet.status, DIET_STATUS.NONE);
    assert.deepEqual(cards.diet.items, []);
  });

  test('경계일 전 빈 날짜(FREE)는 NONE', () => {
    const cards = buildTodayCards({ stay: makeStay(), date: '2026-10-02' });
    assert.equal(cards.diet.status, DIET_STATUS.NONE);
  });

  test('경계일 이후 기간이 없는 날은 NEEDS_INPUT — 제한 없음으로 읽지 않는다', () => {
    const cards = buildTodayCards({ stay: makeStay(), date: '2026-10-04' });
    assert.equal(cards.diet.status, DIET_STATUS.NEEDS_INPUT);
    assert.deepEqual(cards.diet.items, []);
  });

  test('동의가 없으면 본인 체크 기간이 적용되지 않아 NEEDS_INPUT', () => {
    const stay = makeStay({
      consent: { sensitive: null },
      periods: [selfPeriod({ items: { diet: { spicy: YES } } })],
    });
    assert.equal(buildTodayCards({ stay, date: '2026-10-04' }).diet.status, DIET_STATUS.NEEDS_INPUT);
  });

  test('체류 밖 날짜는 OUTSIDE_STAY, 체류가 없으면 NO_STAY', () => {
    assert.equal(buildTodayCards({ stay: makeStay(), date: '2026-09-20' }).diet.status, DIET_STATUS.OUTSIDE_STAY);
    assert.equal(buildTodayCards({ stay: null, date: '2026-10-04' }).diet.status, DIET_STATUS.NO_STAY);
    assert.equal(buildTodayCards({ stay: { broken: true }, date: '2026-10-04' }).diet.status, DIET_STATUS.OUTSIDE_STAY);
  });
});

describe('이동 카드', () => {
  test('오늘 정거장의 한국어 이름·주소 — 환자 외출 먼저, 보호자 외출 다음', () => {
    const date = '2026-10-04';
    const plan = dayPlan(date, {
      outings: [
        { id: 'o1', stops: [stop(`${date}:P:1`, { arriveAt: '10:30' }), stop(`${date}:P:2`, { arriveAt: '11:40' })] },
        { id: 'o2', stops: [stop(`${date}:P:3`, { arriveAt: '15:10' })] },
      ],
      guardianOutings: [{ id: 'g1', stops: [stop(`${date}:G:4`, { arriveAt: '13:00' })] }],
    });
    const { moves } = buildTodayCards({ stay: makeStay(), dayPlan: plan, date });
    assert.deepEqual(
      moves.map((m) => [m.stopId, m.role]),
      [
        [`${date}:P:1`, 'P'],
        [`${date}:P:2`, 'P'],
        [`${date}:P:3`, 'P'],
        [`${date}:G:4`, 'G'],
      ],
    );
    assert.equal(moves[0].koTitle, `장소 ${date}:P:1`);
    assert.equal(moves[0].koAddress, `서울특별시 테스트로 ${date}:P:1`);
    assert.equal(moves[0].needsKoreanCheck, false);
    assert.equal(moves[0].arriveAt, '10:30');
  });

  test('한국어 원문이 없으면 표시 언어 이름·주소와 한국어 주소 확인 필요 표시', () => {
    const date = '2026-10-04';
    const plan = dayPlan(date, {
      outings: [
        {
          id: 'o1',
          stops: [
            stop(`${date}:P:1`, { ko: null, lang: 'en' }),
            stop(`${date}:P:2`, { ko: { title: '장소 둘', address: '' } }),
          ],
        },
      ],
    });
    const [noKo, noKoAddress] = buildTodayCards({ stay: makeStay(), dayPlan: plan, date }).moves;
    assert.equal(noKo.needsKoreanCheck, true);
    assert.equal(noKo.koTitle, null);
    assert.equal(noKo.koAddress, null);
    assert.equal(noKo.displayTitle, `Place ${date}:P:1`);
    assert.equal(noKo.displayAddress, `${date}:P:1 Test-ro, Seoul`);
    assert.equal(noKo.displayLang, 'en');
    assert.equal(noKoAddress.needsKoreanCheck, true);
    assert.equal(noKoAddress.koTitle, '장소 둘');
    assert.equal(noKoAddress.koAddress, null);
  });

  test('다른 날짜의 일정은 쓰지 않는다 · 같은 정거장은 한 번만', () => {
    const date = '2026-10-04';
    const other = dayPlan('2026-10-05', { outings: [{ id: 'o', stops: [stop('2026-10-05:P:9')] }] });
    assert.deepEqual(buildTodayCards({ stay: makeStay(), dayPlan: other, date }).moves, []);
    const dup = dayPlan(date, { outings: [{ id: 'o', stops: [stop(`${date}:P:1`), stop(`${date}:P:1`)] }] });
    assert.equal(buildTodayCards({ stay: makeStay(), dayPlan: dup, date }).moves.length, 1);
  });

  test('일정이 없으면 빈 목록', () => {
    assert.deepEqual(buildTodayCards({ stay: makeStay(), date: '2026-10-04' }).moves, []);
    assert.deepEqual(buildTodayCards({ stay: makeStay(), dayPlan: null, date: '2026-10-04' }).moves, []);
  });
});

describe('복귀 카드 · 병원 카드', () => {
  test('복귀 카드는 그날 밤 숙소 — 출국일은 전날 밤 숙소', () => {
    const stay = makeStay();
    assert.deepEqual(buildTodayCards({ stay, date: '2026-10-02' }).returnCard, {
      lodgingId: 'L1',
      name: '테스트 숙소 1',
      address: '테스트로 1',
    });
    assert.equal(buildTodayCards({ stay, date: '2026-10-05' }).returnCard.lodgingId, 'L2');
    assert.equal(buildTodayCards({ stay, date: '2026-10-08' }).returnCard.lodgingId, 'L2');
    assert.equal(buildTodayCards({ stay, date: '2026-09-20' }).returnCard, null);
  });

  test('병원 카드는 이름·주소 — 오늘 일정이 있는 병원이 먼저', () => {
    const stay = makeStay({
      hospitals: [
        { id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 1', lat: 37.52, lng: 127.02, source: 'DEMO' } },
        { id: 'H2', name: '둘째 병원', address: { roadAddress: '테스트로 2', lat: 37.53, lng: 127.03, source: 'DEMO' }, phone: '02-0000-0000' },
      ],
      appointments: [
        { id: 'A2', hospitalId: 'H1', type: 'PROCEDURE', date: '2026-10-03', start: '09:30', source: 'USER' },
        { id: 'A3', hospitalId: 'H2', type: 'VISIT', date: '2026-10-04', start: '14:00', source: 'USER' },
      ],
    });
    const { hospitals } = buildTodayCards({ stay, date: '2026-10-04' });
    assert.deepEqual(hospitals, [
      { hospitalId: 'H2', name: '둘째 병원', address: '테스트로 2', appointmentToday: true },
      { hospitalId: 'H1', name: '테스트 병원', address: '테스트로 1', appointmentToday: false },
    ]);
  });

  test('카드 모델 어디에도 숙소·병원 좌표와 전화가 없다 (규칙 39 — 주소 글자만)', () => {
    const stay = makeStay({
      hospitals: [
        { id: 'H1', name: '테스트 병원', address: { roadAddress: '테스트로 1', lat: 37.5213, lng: 127.0213, source: 'DEMO' }, phone: '02-0000-0000' },
      ],
    });
    const json = JSON.stringify(buildTodayCards({ stay, date: '2026-10-04' }));
    for (const leak of ['37.5213', '127.0213', '"lat"', '"lng"', '02-0000-0000', '"phone"', '127.03', '127.04']) {
      assert.ok(!json.includes(leak), `${leak} 가 카드 모델에 있다`);
    }
  });

  test('입력을 바꾸지 않는다', () => {
    const date = '2026-10-04';
    const stay = deepFreeze(makeStay({ periods: [selfPeriod({ items: { diet: { spicy: YES } } })] }));
    const plan = deepFreeze(dayPlan(date, { outings: [{ id: 'o', stops: [stop(`${date}:P:1`)] }] }));
    assert.doesNotThrow(() => buildTodayCards({ stay, dayPlan: plan, date }));
  });
});
