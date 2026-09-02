import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SAME_PLACE_METERS, dedupeSamePlace, titleKeys } from '../src/tour-api/dedupe.js';

const c = (id, title, lat, lng, opts = {}) => ({
  id,
  title,
  lat,
  lng,
  titleLanguage: opts.lang ?? 'ko',
  attribution: { imageUrl: opts.image ?? null },
});

describe('제목에서 비교 키를 뽑는다', () => {
  test('영문 제목에 괄호로 붙은 국문을 뽑아낸다', () => {
    // 영문 관광정보는 제목에 국문을 함께 준다 — 이것이 국문 항목과의 연결고리다.
    assert.equal(titleKeys('COEX Aquarium (코엑스 아쿠아리움)').hangul, '코엑스아쿠아리움');
    assert.equal(titleKeys('코엑스 아쿠아리움').hangul, '코엑스아쿠아리움');
  });

  test('라틴 문자 키도 함께 뽑는다', () => {
    assert.equal(titleKeys('COEX Aquarium').latin, 'coexaquarium');
  });

  test('너무 짧은 조각은 키로 쓰지 않는다 — 우연한 일치를 막는다', () => {
    assert.equal(titleKeys('숲').hangul, null);
    assert.equal(titleKeys('AB').latin, null);
  });
});

describe('같은 이름·같은 위치만 합친다', () => {
  test('실제 사례 — 코엑스 아쿠아리움 중복 등록을 하나로 합친다', () => {
    const { candidates, merged } = dedupeSamePlace([
      c('229901', '한국종합무역센터(코엑스)', 37.5115, 127.0595),
      c('2507822', 'COEX Aquarium (코엑스 아쿠아리움)', 37.5126, 127.0587, { lang: 'en' }),
      c('130284', '코엑스 아쿠아리움', 37.5126, 127.0588),
    ]);

    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates.map((x) => x.id), ['229901', '2507822']);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0], {
      kept: '2507822',
      dropped: '130284',
      title: 'COEX Aquarium (코엑스 아쿠아리움)',
    });
  });

  /**
   * 이름만 보고 지우면 같은 브랜드의 다른 지점을 잃는다.
   * 위치 조건이 그것을 막는 유일한 장치다.
   */
  test('이름이 같아도 멀리 떨어져 있으면 다른 장소다', () => {
    const { candidates, merged } = dedupeSamePlace([
      c('1', '스타벅스 삼성점', 37.5100, 127.0590),
      c('2', '스타벅스 삼성점', 37.5300, 127.0900), // 약 3.5km
    ]);
    assert.equal(candidates.length, 2);
    assert.equal(merged.length, 0);
  });

  test('경계 — 100m 안쪽은 합치고 바깥은 남긴다', () => {
    const near = dedupeSamePlace([
      c('1', '같은 이름 장소', 37.5000, 127.0000),
      c('2', '같은 이름 장소', 37.50045, 127.0000), // 약 50m
    ]);
    assert.equal(near.candidates.length, 1);

    const far = dedupeSamePlace([
      c('1', '같은 이름 장소', 37.5000, 127.0000),
      c('2', '같은 이름 장소', 37.5027, 127.0000), // 약 300m
    ]);
    assert.equal(far.candidates.length, 2);
    assert.ok(SAME_PLACE_METERS === 100);
  });

  test('좌표가 없으면 판단하지 않는다 — 지우지 않는다', () => {
    const { candidates } = dedupeSamePlace([
      c('1', '같은 이름 장소', 37.5, 127.0),
      c('2', '같은 이름 장소', null, null),
    ]);
    assert.equal(candidates.length, 2);
  });

  test('이름이 다르면 같은 자리에 있어도 남긴다', () => {
    const { candidates } = dedupeSamePlace([
      c('1', '코엑스 아쿠아리움', 37.5126, 127.0587),
      c('2', '메가박스 코엑스', 37.5126, 127.0587),
    ]);
    assert.equal(candidates.length, 2);
  });
});

describe('둘 중 무엇을 남기나', () => {
  test('영문 원문이 있는 쪽을 남긴다 — 대상 사용자가 외국인 환자다', () => {
    const { candidates } = dedupeSamePlace([
      c('ko', '코엑스 아쿠아리움', 37.5126, 127.0587),
      c('en', 'COEX Aquarium (코엑스 아쿠아리움)', 37.5126, 127.0587, { lang: 'en' }),
    ]);
    assert.equal(candidates[0].id, 'en');
  });

  test('언어 조건이 같으면 사진이 있는 쪽을 남긴다', () => {
    const { candidates } = dedupeSamePlace([
      c('noimg', '같은 이름 장소', 37.5, 127.0),
      c('img', '같은 이름 장소', 37.5, 127.0, { image: 'https://example.test/a.jpg' }),
    ]);
    assert.equal(candidates[0].id, 'img');
  });

  test('둘 다 같으면 먼저 온 쪽을 남긴다 — 거리순이라 더 가깝다', () => {
    const { candidates } = dedupeSamePlace([
      c('first', '같은 이름 장소', 37.5, 127.0),
      c('second', '같은 이름 장소', 37.5, 127.0),
    ]);
    assert.equal(candidates[0].id, 'first');
  });
});

describe('빈 입력', () => {
  test('후보가 없으면 빈 결과', () => {
    const { candidates, merged } = dedupeSamePlace([]);
    assert.deepEqual(candidates, []);
    assert.deepEqual(merged, []);
  });
});
