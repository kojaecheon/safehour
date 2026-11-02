// AX-306 — 하루 일정 엔진: 후보 게이트·식사 칸·순위·편집·결정성 (spec 4.7, 4.8, 4.10 엔진 입력)
//
// spec 10장 규칙 21–28, 52 와 의료 시설 제외 불변조건을 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON, STATE } from '../src/domain/states.js';
import { planStayDay } from '../src/engine/dayPlan.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import {
  AIRPORT_TRAVEL,
  SET,
  allStops,
  blankKoreanTitle,
  cafe,
  mins,
  museum,
  patientIds,
  place,
  restaurant,
  restrictedStay,
  shop,
  stay,
} from './day-plan-fixtures.js';

const plan = (s, date, opts = {}) => planStayDay(s, date, { airportTravel: AIRPORT_TRAVEL, ...opts });
const excludedReasons = (day, id) => day.excluded.find((e) => e.candidateId === id)?.reasons ?? null;
const meal = (day, slot) => day.mealSlots.find((m) => m.slot === slot);
const mealStops = (day) => day.outings.flatMap((o) => o.stops).filter((x) => x.isMeal);

function basics(o = {}) {
  return [
    museum('301', { title: '테스트 미술관', north: 1.0, ...o }),
    shop('302', { title: '테스트 상가', north: 1.2, east: 0.4, ...o }),
    museum('303', { title: '테스트 기념관', north: -1.1, ...o }),
    restaurant('101', { title: '테스트 한식당', north: 1.3, ...o }),
    restaurant('102', { title: '테스트 국수집', north: -1.3, ...o }),
    cafe('201', { title: '테스트 찻집', north: 0.9, east: 0.5, ...o }),
  ];
}

describe('규칙 21 — 술', () => {
  test('diet.alcohol=예이면 주점 유형이 일정에 없다', () => {
    const bar = place('150', {
      title: '테스트 주점',
      type: '39',
      north: 0.9,
      lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD04', lclsSystm3: 'FD040100' },
      menu: { firstmenu: '감자전' },
    });
    const day = plan(restrictedStay({ diet: { alcohol: SET(true) } }), '2026-10-05', {
      candidates: [...basics(), bar],
    });
    assert.ok(!patientIds(day).includes('150'));
    assert.deepEqual(excludedReasons(day, '150'), [REASON.DIET_RESTRICTED]);
  });
});

describe('규칙 22 — 매운 음식', () => {
  const noMenu = () =>
    place('160', { title: '테스트 밥집', type: '39', north: 0.9, lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD01' } });
  const spicy = () => restaurant('161', { title: '테스트 떡볶이', north: 1.0, east: 0.3 });

  test('메뉴·이름·유형 단서가 없는 식당은 MENU_UNKNOWN 으로 제외된다', () => {
    const day = plan(restrictedStay({ diet: { spicy: SET(true) } }), '2026-10-05', {
      candidates: [...basics(), noMenu(), spicy()],
    });
    assert.deepEqual(excludedReasons(day, '160'), [REASON.MENU_UNKNOWN]);
    assert.deepEqual(excludedReasons(day, '161'), [REASON.DIET_RESTRICTED]);
    assert.ok(!patientIds(day).includes('160') && !patientIds(day).includes('161'));
  });

  test('카페 유형은 제외되지 않는다', () => {
    const day = plan(restrictedStay({ diet: { spicy: SET(true), raw: SET(true) } }), '2026-10-05', {
      candidates: basics(),
    });
    assert.equal(excludedReasons(day, '201'), null);
  });

  test('매운 음식 제한이 없으면 메뉴를 몰라도 제외하지 않는다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: [...basics(), noMenu()] });
    assert.equal(excludedReasons(day, '160'), null);
  });
});

describe('규칙 23 — 뜨거운·딱딱한 음식', () => {
  test('제외하지 않고 주문 카드를 연결한다', () => {
    const day = plan(restrictedStay({ diet: { hot: SET(true), hard: SET(true) } }), '2026-10-05', {
      candidates: basics(),
    });
    const meals = mealStops(day);
    assert.ok(meals.length > 0, '식사 정거장이 있어야 한다');
    for (const m of meals) assert.ok(m.labels.includes('ORDER_CARD'));
    assert.equal(excludedReasons(day, '101'), null);
  });

  test('식이 판단을 한 식당에는 추정 표시가 붙는다', () => {
    const day = plan(restrictedStay({ diet: { spicy: SET(true) } }), '2026-10-05', { candidates: basics() });
    for (const m of mealStops(day)) assert.ok(m.labels.includes('DIET_ESTIMATED'));
  });
});

describe('규칙 24 — 식사 칸이 비는 것은 정상 결과', () => {
  test('통과한 식당이 없으면 NONE_AVAILABLE 과 사유, 다른 정거장으로 채우지 않는다', () => {
    const day = plan(restrictedStay({ diet: { spicy: SET(true) } }), '2026-10-05', {
      candidates: [
        ...basics().filter((c) => c.signals.isFoodPlace !== true || c.signals.isCafe === true),
        place('160', { title: '테스트 밥집', type: '39', north: 0.9, lcls: { lclsSystm1: 'FD', lclsSystm2: 'FD01' } }),
      ],
    });
    const lunch = meal(day, 'LUNCH');
    assert.equal(lunch.status, 'NONE_AVAILABLE');
    assert.ok(lunch.reasons.includes(REASON.MENU_UNKNOWN));
    assert.equal(lunch.stopId, undefined);
    assert.equal(mealStops(day).length, 0);
    const slot = DEFAULTS.mealSlots.LUNCH;
    for (const stop of day.outings.flatMap((o) => o.stops)) {
      const overlaps = mins(stop.arriveAt) < mins(slot.end) && mins(stop.leaveAt) > mins(slot.start);
      assert.ok(!overlaps, `${stop.id} 가 비어 있는 점심 칸을 채웠다`);
    }
  });

  test('식당이 아예 없으면 NO_CANDIDATE 사유다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: [museum('301', { title: '테스트 미술관' })] });
    assert.equal(meal(day, 'LUNCH').status, 'NONE_AVAILABLE');
    assert.ok(meal(day, 'LUNCH').reasons.includes(REASON.NO_CANDIDATE));
  });

  test('식사가 가능하면 식사 칸 시간에 식당 1곳을 둔다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    for (const slot of ['LUNCH', 'DINNER']) {
      const m = meal(day, slot);
      assert.equal(m.status, 'FILLED', `${slot}`);
      const stop = allStops(day).find((x) => x.id === m.stopId);
      assert.ok(stop.isMeal);
      const window = DEFAULTS.mealSlots[slot];
      assert.ok(mins(stop.arriveAt) >= mins(window.start) && mins(stop.arriveAt) < mins(window.end));
    }
  });
});

describe('식사 제한(금식)', () => {
  test('하루 종일이면 식음 후보가 FASTING_REQUIRED 로 제외되고 식사 칸은 NOT_APPLICABLE', () => {
    const day = plan(restrictedStay({ mealRestriction: SET({ mode: 'ALL_DAY' }) }), '2026-10-05', {
      candidates: basics(),
    });
    assert.ok(excludedReasons(day, '101').includes(REASON.FASTING_REQUIRED));
    assert.ok(excludedReasons(day, '201').includes(REASON.FASTING_REQUIRED));
    for (const slot of ['LUNCH', 'DINNER']) {
      assert.equal(meal(day, slot).status, 'NOT_APPLICABLE');
      assert.deepEqual(meal(day, slot).reasons, [REASON.FASTING_REQUIRED]);
    }
    assert.ok(day.outings.length > 0, '식음이 아닌 장소로는 외출할 수 있다');
  });

  test('UNTIL 시각 전에는 식음 정거장이 없다', () => {
    const day = plan(restrictedStay({ mealRestriction: SET({ mode: 'UNTIL', until: '14:00' }) }), '2026-10-05', {
      candidates: basics(),
    });
    assert.equal(meal(day, 'LUNCH').status, 'NOT_APPLICABLE');
    assert.deepEqual(meal(day, 'LUNCH').reasons, [REASON.FASTING_REQUIRED]);
    assert.equal(meal(day, 'DINNER').status, 'FILLED');
    for (const stop of day.outings.flatMap((o) => o.stops)) {
      if (stop.category === 'FOOD' || stop.category === 'CAFE') assert.ok(mins(stop.arriveAt) >= mins('14:00'));
    }
  });
});

describe('규칙 25 — 열·물', () => {
  const sauna = () => place('401', { title: '테스트 찜질방', type: '28', north: 0.9, tags: { indoor: true } });
  const pool = () => place('402', { title: '테스트 수영장', type: '28', north: 1.0, east: 0.2, tags: { indoor: true } });

  test('avoidHeat=예이면 찜질·사우나 단서 장소가 없다', () => {
    const day = plan(restrictedStay({ avoidHeat: SET(true) }), '2026-10-05', { candidates: [...basics(), sauna()] });
    assert.ok(!patientIds(day).includes('401'));
    assert.deepEqual(excludedReasons(day, '401'), [REASON.HEAT_EXPOSURE]);
  });

  test('avoidWater=예이면 수영장 단서 장소가 없다', () => {
    const day = plan(restrictedStay({ avoidWater: SET(true) }), '2026-10-05', { candidates: [...basics(), pool()] });
    assert.ok(!patientIds(day).includes('402'));
    assert.deepEqual(excludedReasons(day, '402'), [REASON.WATER_ACTIVITY]);
  });
});

describe('규칙 26 — 일정 날짜 기준 휴무', () => {
  // 2026-10-05 는 월요일, 2026-10-06 은 화요일
  const mondayClosed = () =>
    museum('301', { title: '테스트 미술관', north: 1.0, schedule: { restdateculture: '매주 월요일 휴관' } });

  test('정기 휴무 요일이 그 날짜 요일과 같으면 그 날짜 일정에 없다', () => {
    const s = restrictedStay({}, { hasCompanion: false });
    const monday = plan(s, '2026-10-05', { candidates: [mondayClosed(), ...basics().slice(1)] });
    assert.ok(!patientIds(monday).includes('301'));
    assert.deepEqual(excludedReasons(monday, '301'), [REASON.CLOSED]);
    const tuesday = plan(s, '2026-10-06', { candidates: [mondayClosed(), ...basics().slice(1)] });
    assert.equal(excludedReasons(tuesday, '301'), null);
  });

  test('휴무 근거가 없는 장소는 운영 확인 필요로 표시된다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    for (const stop of allStops(day)) assert.ok(stop.labels.includes('HOURS_UNCONFIRMED'));
  });

  test('데모 휴무 사건의 장소는 닫힘으로 본다', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: basics(), closedContentIds: ['301'] });
    assert.deepEqual(excludedReasons(day, '301'), [REASON.CLOSED]);
  });
});

describe('기상·실내 전용·자외선 (기존 게이트)', () => {
  test('실외 부적합이면 실외는 WEATHER_BLOCKED, 실내 불명은 DATA_UNRELIABLE', () => {
    const park = place('501', { title: '테스트 공원', type: '12', north: 1.0, tags: { indoor: false } });
    const unknown = place('502', { title: '테스트 광장', type: '12', north: 1.1 });
    const day = plan(restrictedStay(), '2026-10-05', {
      candidates: [...basics(), park, unknown],
      weather: { outdoorUnsafe: true },
    });
    assert.ok(excludedReasons(day, '501').includes(REASON.WEATHER_BLOCKED));
    assert.ok(excludedReasons(day, '502').includes(REASON.DATA_UNRELIABLE));
  });

  test('avoidUv=예이면 실외로 알려진 장소는 UV_EXPOSURE 로 제외된다', () => {
    const park = place('501', { title: '테스트 공원', type: '12', north: 1.0, tags: { indoor: false } });
    const day = plan(restrictedStay({ avoidUv: SET(true) }), '2026-10-05', { candidates: [...basics(), park] });
    assert.deepEqual(excludedReasons(day, '501'), [REASON.UV_EXPOSURE]);
    const free = plan(restrictedStay(), '2026-10-05', { candidates: [...basics(), park] });
    assert.equal(excludedReasons(free, '501'), null);
  });

  test('실내 전용이면 실외는 INDOOR_ONLY_REQUIRED, 실내 불명은 DATA_UNRELIABLE', () => {
    const park = place('501', { title: '테스트 공원', type: '12', north: 1.0, tags: { indoor: false } });
    const unknown = place('502', { title: '테스트 광장', type: '12', north: 1.1 });
    const day = plan(restrictedStay({ outing: 'INDOOR_ONLY' }), '2026-10-05', { candidates: [...basics(), park, unknown] });
    assert.ok(excludedReasons(day, '501').includes(REASON.INDOOR_ONLY_REQUIRED));
    assert.ok(excludedReasons(day, '502').includes(REASON.DATA_UNRELIABLE));
    for (const stop of allStops(day)) assert.equal(stop.indoor, true);
  });

  test('기상을 확인할 수 없으면 판정에 반영하지 않는다', () => {
    const park = place('501', { title: '테스트 공원', type: '12', north: 1.0, tags: { indoor: false } });
    const day = plan(restrictedStay(), '2026-10-05', { candidates: [park], weather: { outdoorUnsafe: null } });
    assert.equal(excludedReasons(day, '501'), null);
  });
});

describe('의료 시설은 정거장이 되지 않는다 (불변조건)', () => {
  const clinic = () => place('601', { title: '테스트피부과의원', type: '14', north: 0.9 });
  const beautyClinic = () =>
    place('602', { title: '테스트 뷰티', type: '12', north: 1.0, lcls: { lclsSystm3: 'EX050800' }, tags: { indoor: true } });

  for (const [label, s, date] of [
    ['FREE', stay(), '2026-10-02'],
    ['RESTRICTED', restrictedStay(), '2026-10-05'],
    ['REST_DAY 보호자', restrictedStay({ outing: 'FORBIDDEN' }), '2026-10-05'],
  ]) {
    test(`${label}: NON_TOURISM_ACTIVITY 로 제외된다`, () => {
      const day = plan(s, date, { candidates: [clinic(), beautyClinic(), ...basics()] });
      const ids = allStops(day).map((x) => x.contentId);
      assert.ok(!ids.includes('601') && !ids.includes('602'));
      assert.deepEqual(excludedReasons(day, '601'), [REASON.NON_TOURISM_ACTIVITY]);
      assert.deepEqual(excludedReasons(day, '602'), [REASON.NON_TOURISM_ACTIVITY]);
    });
  }

  test('고정해도 들어가지 않는다', () => {
    const day = plan(restrictedStay(), '2026-10-05', {
      candidates: [clinic(), ...basics()],
      edits: { pinned: ['601'], deleted: [], clearedMeals: [] },
    });
    assert.ok(!allStops(day).some((x) => x.contentId === '601'));
  });

  // 규칙 27 — 의료 시설 판정도 언어와 무관해야 한다.
  // 국문 제목이 비어 있으면 표시 제목이 선택 언어를 따라 달라진다(ko·en 은 영문, ja·zh 는 각 언어).
  // 판정이 표시 제목으로 새면 같은 후보가 ko·en 에서는 빠지고 ja·zh 에서는 일정에 들어간다.
  test('국문 제목이 비어 있어도 판정은 언어와 무관하다 (규칙 27)', () => {
    const foreignOnly = (lang) =>
      blankKoreanTitle('603', {
        type: '14',
        north: 0.5,
        lang,
        en: 'Test Clinic',
        ja: 'テスト美容クリニック',
        zh: '测试整形医院',
      });
    const shape = (d) => ({
      dayState: d.dayState,
      stops: allStops(d).map((x) => x.contentId),
      excluded: d.excluded.map((e) => [e.candidateId, e.reasons]),
    });
    const results = ['ko', 'en', 'ja', 'zh'].map((lang) =>
      shape(plan(restrictedStay(), '2026-10-05', { candidates: [foreignOnly(lang), ...basics()] })),
    );
    for (const r of results.slice(1)) assert.deepEqual(r, results[0]);
  });
});

describe('규칙 52 — 식사 칸과 정거장 수', () => {
  test('식사 칸에 카페가 들어가지 않는다', () => {
    const cafes = [cafe('201', { title: '카페 A', north: 0.9 }), cafe('202', { title: '카페 B', north: 1.0, east: 0.3 })];
    const day = plan(restrictedStay(), '2026-10-05', { candidates: [...cafes, museum('301', { title: '테스트 미술관' })] });
    assert.equal(mealStops(day).length, 0);
    for (const slot of ['LUNCH', 'DINNER']) assert.notEqual(meal(day, slot).status, 'FILLED');
    for (const m of mealStops(plan(restrictedStay(), '2026-10-05', { candidates: basics() }))) {
      assert.equal(m.category, 'FOOD');
    }
  });

  for (const [pace, perOuting, perDay] of [
    ['RELAXED', 2, 3],
    ['NORMAL', 3, 5],
  ]) {
    test(`${pace}: 외출당 ${perOuting}곳, 하루 ${perDay}곳 — 식사 정거장 포함`, () => {
      const many = [
        ...basics(),
        museum('311', { title: '테스트 전시관', north: 0.95, east: -0.3 }),
        shop('312', { title: '테스트 시장', north: -0.95, east: 0.3 }),
        restaurant('103', { title: '테스트 백반', north: 1.05, east: -0.2 }),
      ];
      for (const s of [restrictedStay({}, { pace }), stay({ pace })]) {
        const date = s.periods.length ? '2026-10-05' : '2026-10-02';
        const day = plan(s, date, { candidates: many });
        const total = day.outings.reduce((n, o) => n + o.stops.length, 0);
        assert.ok(total <= perDay, `${date} 하루 ${total}곳`);
        for (const o of day.outings) assert.ok(o.stops.length <= perOuting);
        assert.ok(mealStops(day).length >= 1);
        assert.equal(total, perDay, '후보가 넉넉하면 하루 한도까지 채운다');
      }
    });
  }
});

describe('반경', () => {
  test('RESTRICTED 3km, 자유일 10km', () => {
    const at5km = museum('701', { title: '테스트 먼 박물관', north: 5 });
    const restricted = plan(restrictedStay(), '2026-10-05', { candidates: [at5km] });
    assert.equal(restricted.outings.length, 0);
    assert.equal(excludedReasons(restricted, '701'), null, '반경 밖 후보는 판정 대상이 아니다');
    const free = plan(stay(), '2026-10-02', { candidates: [at5km] });
    assert.ok(patientIds(free).includes('701'));
  });
});

describe('순위 (관심사 → 복귀 여유 → 보행 부담 → 다양성)', () => {
  test('관심사 일치가 먼저다', () => {
    const near = shop('302', { title: '테스트 상가', north: 0.9 });
    const farther = museum('301', { title: '테스트 미술관', north: 1.8 });
    const s = restrictedStay({ walkLimit: SET(15) }, { interests: ['EXHIBITION'], hasCompanion: false });
    const day = plan(s, '2026-10-05', { candidates: [near, farther] });
    assert.equal(day.outings[0].stops[0].contentId, '301');
    const noInterest = plan(restrictedStay({ walkLimit: SET(15) }, { hasCompanion: false }), '2026-10-05', {
      candidates: [near, farther],
    });
    assert.equal(noInterest.outings[0].stops[0].contentId, '302', '관심사가 같으면 복귀 여유가 큰 쪽');
  });

  test('인기·제목은 순위에 쓰지 않는다 — 제목만 바꿔도 결과가 같다', () => {
    const a = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    const renamed = basics().map((c) => ({ ...c, title: `ZZ ${c.title}`, stop: { ...c.stop, title: `ZZ ${c.stop.title}` } }));
    const b = plan(restrictedStay(), '2026-10-05', { candidates: renamed });
    assert.deepEqual(patientIds(a), patientIds(b));
  });
});

describe('편집 입력과 중복', () => {
  test('같은 날 같은 역할에 같은 장소는 한 번만 들어간다', () => {
    const day = plan(restrictedStay({}, { pace: 'NORMAL' }), '2026-10-05', { candidates: basics() });
    const ids = patientIds(day);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('다른 날짜에 배치된 장소는 넣지 않는다 — 고정한 경우는 예외', () => {
    const base = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    const first = patientIds(base)[0];
    const skipped = plan(restrictedStay(), '2026-10-05', { candidates: basics(), usedContentIds: [first] });
    assert.ok(!patientIds(skipped).includes(first));
    const pinned = plan(restrictedStay(), '2026-10-05', {
      candidates: basics(),
      usedContentIds: [first],
      edits: { pinned: [first], deleted: [], clearedMeals: [] },
    });
    assert.ok(patientIds(pinned).includes(first));
    const stop = pinned.outings.flatMap((o) => o.stops).find((x) => x.contentId === first);
    assert.equal(stop.pinned, true);
  });

  test('삭제한 장소는 다시 넣지 않는다', () => {
    const base = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    const first = patientIds(base)[0];
    const day = plan(restrictedStay(), '2026-10-05', {
      candidates: basics(),
      edits: { pinned: [], deleted: [first], clearedMeals: [] },
    });
    assert.ok(!allStops(day).some((x) => x.contentId === first));
  });

  test('고정 장소는 게이트를 통과하면 먼저 들어간다', () => {
    const extra = museum('399', { title: '테스트 먼 전시관', north: 2.5 });
    const day = plan(restrictedStay(), '2026-10-05', {
      candidates: [...basics(), extra],
      edits: { pinned: ['399'], deleted: [], clearedMeals: [] },
    });
    assert.ok(patientIds(day).includes('399'));
  });

  test('비운 식사 칸은 CLEARED 이고 다시 채우지 않는다', () => {
    const day = plan(restrictedStay(), '2026-10-05', {
      candidates: basics(),
      edits: { pinned: [], deleted: [], clearedMeals: ['LUNCH'] },
    });
    assert.equal(meal(day, 'LUNCH').status, 'CLEARED');
    assert.equal(meal(day, 'DINNER').status, 'FILLED');
    const slot = DEFAULTS.mealSlots.LUNCH;
    for (const stop of day.outings.flatMap((o) => o.stops)) {
      assert.ok(!(mins(stop.arriveAt) < mins(slot.end) && mins(stop.leaveAt) > mins(slot.start)));
    }
  });
});

describe('규칙 27·28 — 언어 무관성과 결정성', () => {
  const multilingual = (lang) => [
    museum('301', { title: '테스트 미술관', north: 1.0, lang, en: 'Test Museum', ja: 'テスト美術館', zh: '测试美术馆' }),
    shop('302', { title: '테스트 상가', north: 1.2, east: 0.4, lang, en: 'Test Mall' }),
    museum('303', { title: '테스트 기념관', north: -1.1, lang, ja: 'テスト記念館' }),
    restaurant('101', { title: '테스트 한식당', north: 1.3, lang, en: 'Test Korean Diner', zh: '测试韩餐' }),
    restaurant('102', { title: '테스트 국수집', north: -1.3, lang }),
    cafe('201', { title: '테스트 찻집', north: 0.9, east: 0.5, lang, en: 'Test Tea House' }),
    place('401', { title: '테스트 찜질방', type: '28', north: 1.1, lang, en: 'Test Spa', tags: { indoor: true } }),
  ];

  for (const [label, s, date] of [
    ['RESTRICTED', restrictedStay({ avoidHeat: SET(true), diet: { spicy: SET(true) } }), '2026-10-05'],
    ['FREE', stay(), '2026-10-02'],
    ['REST_DAY', restrictedStay({ outing: 'FORBIDDEN' }), '2026-10-05'],
  ]) {
    test(`${label}: 언어가 달라도 dayState 와 정거장 contentId 가 같다`, () => {
      const results = ['ko', 'en', 'ja', 'zh'].map((lang) => plan(s, date, { candidates: multilingual(lang) }));
      const shape = (d) => ({
        dayState: d.dayState,
        patient: d.outings.map((o) => o.stops.map((x) => [x.id, x.arriveAt])),
        guardian: d.guardianOutings.map((o) => o.stops.map((x) => [x.id, x.arriveAt])),
        excluded: d.excluded.map((e) => [e.candidateId, e.reasons]),
        meals: d.mealSlots,
      });
      for (const r of results.slice(1)) assert.deepEqual(shape(r), shape(results[0]));
      assert.ok(allStops(results[0]).length > 0);
      assert.notEqual(allStops(results[2])[0].title, allStops(results[0])[0].title, '표시 이름은 언어를 따른다');
    });
  }

  test('같은 입력을 두 번 넣으면 같은 일정이 나온다', () => {
    const input = { candidates: basics() };
    assert.deepEqual(plan(restrictedStay(), '2026-10-05', input), plan(restrictedStay(), '2026-10-05', input));
  });

  test('후보 순서가 달라도 같은 일정이 나온다', () => {
    const a = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    const b = plan(restrictedStay(), '2026-10-05', { candidates: basics().reverse() });
    assert.deepEqual(a, b);
  });
});

describe('dayState 표 (spec 4.7)', () => {
  test('환자 외출이 있으면 TOGETHER', () => {
    const day = plan(restrictedStay(), '2026-10-05', { candidates: basics() });
    assert.equal(day.dayState, STATE.TOGETHER);
  });

  test('외출 가능 구간은 있는데 통과한 후보가 없으면 STANDBY + NO_CANDIDATE', () => {
    const day = plan(restrictedStay({ avoidHeat: SET(true) }, { hasCompanion: false }), '2026-10-05', {
      candidates: [place('401', { title: '테스트 찜질방', type: '28', north: 1.1, tags: { indoor: true } })],
    });
    assert.equal(day.dayState, STATE.STANDBY);
    assert.ok(day.reasons.includes(REASON.NO_CANDIDATE));
    assert.equal(day.excluded.length, 1);
  });
});
