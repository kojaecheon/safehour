// AX-307 — 체류 전체 일정 조립 (spec 4.9 생성, 4.10 다시 만들기, 6장 plan 요청)
//
// spec 10장 규칙 27(체류 전체), 28, 29, 30(지난 날짜·고정·삭제), 51(표시만 다시 쓰기)과
// 45박 입력의 처리 시간을 고정한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { REASON, STATE } from '../src/domain/states.js';
import { ITINERARY_ENGINE_VERSION, kstClock, planTrip, regenerate } from '../src/engine/tripPlan.js';
import { classifyDate, stayDates } from '../src/stay/index.js';
import {
  AIRPORT_TRAVEL,
  SET,
  at,
  byLodging,
  contentIdsOf,
  park,
  period,
  stay,
  stopsOf,
  tripPool,
  tripStay,
} from './trip-fixtures.js';

const BEFORE_TRIP = at('2026-09-30', '12:00');

function trip(s, opts = {}) {
  return planTrip({
    stay: s,
    candidatesByLodging: byLodging(tripPool(opts.lang ?? 'en')),
    airportTravel: AIRPORT_TRAVEL,
    lang: 'en',
    now: BEFORE_TRIP,
    ...opts,
  });
}

describe('kstClock — now 는 입력이다', () => {
  test('ISO8601·ms 를 KST 날짜와 분으로 읽는다', () => {
    assert.deepEqual(
      { ...kstClock('2026-10-05T23:30:00Z'), ms: undefined },
      { date: '2026-10-06', minutes: 8 * 60 + 30, ms: undefined },
    );
    assert.equal(kstClock(Date.parse('2026-10-06T00:10:00+09:00')).minutes, 10);
  });

  test('now 가 없으면 시계를 읽지 않고 TypeError', () => {
    assert.throws(() => kstClock(undefined), TypeError);
    assert.throws(() => planTrip({ stay: tripStay(), candidatesByLodging: {}, airportTravel: AIRPORT_TRAVEL }), TypeError);
  });
});

describe('체류 전체 조립 (spec 4.9 생성)', () => {
  test('모든 체류 날짜에 DayPlan 을 만들고 분류는 체류 도메인 계층과 같다', () => {
    const s = tripStay();
    const result = trip(s);
    assert.equal(result.engineVersion, ITINERARY_ENGINE_VERSION);
    assert.deepEqual(Object.keys(result.days), stayDates(s));
    for (const [date, day] of Object.entries(result.days)) {
      assert.equal(day.date, date);
      assert.equal(day.coverage, classifyDate(s, date).coverage);
      assert.equal(day.returnNow, false);
      assert.equal(day.delta, undefined, 'previous 가 없으면 전후 비교가 없다');
    }
    assert.ok(Object.values(result.days).some((d) => d.dayState === STATE.TOGETHER));
  });

  test('조건 입력 전이면 경계일 이후 날짜는 NEEDS_INPUT 이고 나머지만 만든다', () => {
    const result = trip(stay());
    assert.equal(result.days['2026-10-02'].coverage, 'FREE');
    assert.ok(result.days['2026-10-02'].outings.length > 0);
    for (const date of ['2026-10-04', '2026-10-07', '2026-10-10']) {
      assert.equal(result.days[date].coverage, 'NEEDS_INPUT');
      assert.ok(result.days[date].reasons.includes(REASON.CONDITION_INPUT_REQUIRED));
      assert.equal(stopsOf(result.days[date]).length, 0);
    }
  });

  test('dates 를 주면 그 날짜만 돌려준다(체류 밖 날짜는 무시)', () => {
    const result = trip(tripStay(), { dates: ['2026-10-06', '2026-10-02', '2026-12-25'] });
    assert.deepEqual(Object.keys(result.days).sort(), ['2026-10-02', '2026-10-06']);
  });

  test('후보 제공자는 함수도 된다 — 숙소 id 와 날짜를 받는다', () => {
    const calls = [];
    const pool = tripPool('en');
    const result = planTrip({
      stay: tripStay(),
      candidatesByLodging: (lodgingId, date) => {
        calls.push([lodgingId, date]);
        return pool;
      },
      airportTravel: AIRPORT_TRAVEL,
      lang: 'en',
      now: BEFORE_TRIP,
      dates: ['2026-10-05'],
    });
    assert.deepEqual(calls, [['L1', '2026-10-05']]);
    assert.deepEqual(result, trip(tripStay(), { dates: ['2026-10-05'] }));
  });
});

describe('규칙 29 — 같은 장소는 체류 중 한 번만 자동 배치된다', () => {
  test('체류 전체에서 자동 배치된 contentId 가 겹치지 않는다(환자·보호자 모두)', () => {
    const result = trip(tripStay({}, { pace: 'NORMAL' }));
    const auto = Object.values(result.days).flatMap((d) => stopsOf(d).filter((s) => !s.pinned).map((s) => s.contentId));
    assert.ok(auto.length >= 20, `충분히 배치돼야 검사가 의미 있다 (${auto.length})`);
    assert.equal(new Set(auto).size, auto.length);
  });

  test('부분 재계획은 usedContentIds(요청하지 않은 날짜의 배치)를 피한다', () => {
    const full = trip(tripStay());
    const used = Object.entries(full.days)
      .filter(([date]) => date !== '2026-10-07')
      .flatMap(([, d]) => contentIdsOf(d));
    const partial = trip(tripStay(), { dates: ['2026-10-07'], usedContentIds: [...used, ...contentIdsOf(full.days['2026-10-07'])] });
    const day = partial.days['2026-10-07'];
    for (const id of contentIdsOf(day)) assert.ok(!used.includes(id), `${id} 는 다른 날짜에 있다`);
  });

  test('고정한 장소는 예외다 — 다른 날짜에 있어도 그 날짜에 들어가고, 다른 날짜의 자동 배치는 그 장소를 피한다', () => {
    const base = trip(tripStay());
    const taken = contentIdsOf(base.days['2026-10-05'])[0];
    const result = trip(tripStay(), { edits: { '2026-10-08': { pinned: [taken], deleted: [], clearedMeals: [] } } });
    const pinnedStop = stopsOf(result.days['2026-10-08']).find((s) => s.contentId === taken);
    assert.ok(pinnedStop, '고정한 장소가 그 날짜에 있다');
    assert.equal(pinnedStop.pinned, true);
    const elsewhere = Object.entries(result.days)
      .filter(([date]) => date !== '2026-10-08')
      .flatMap(([, d]) => contentIdsOf(d));
    assert.ok(!elsewhere.includes(taken), '고정 장소는 다른 날짜에 자동 배치되지 않는다');
  });
});

describe('규칙 27·28 — 체류 전체의 언어 무관성과 결정성', () => {
  test('같은 입력이면 ko/en/ja/zh 에서 날짜별 dayState 와 정거장 contentId 가 같다', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const shape = (result) =>
      Object.fromEntries(
        Object.entries(result.days).map(([date, d]) => [
          date,
          {
            dayState: d.dayState,
            patient: d.outings.map((o) => o.stops.map((x) => [x.contentId, x.arriveAt])),
            guardian: d.guardianOutings.map((o) => o.stops.map((x) => [x.contentId, x.arriveAt])),
          },
        ]),
      );
    const results = ['ko', 'en', 'ja', 'zh'].map((lang) => trip(s, { lang }));
    for (const r of results.slice(1)) assert.deepEqual(shape(r), shape(results[0]));
    const titles = results.map((r) => Object.values(r.days).flatMap((d) => stopsOf(d).map((x) => x.title)).join('|'));
    assert.equal(new Set(titles).size, 4, '표시 이름은 언어를 따른다');
  });

  test('같은 입력을 두 번 넣으면 같은 일정이 나온다', () => {
    assert.deepEqual(trip(tripStay()), trip(tripStay()));
  });

  test('후보 순서가 달라도 같은 일정이 나온다', () => {
    const a = trip(tripStay());
    const b = planTrip({
      stay: tripStay(),
      candidatesByLodging: byLodging(tripPool('en').reverse()),
      airportTravel: AIRPORT_TRAVEL,
      lang: 'en',
      now: BEFORE_TRIP,
    });
    assert.deepEqual(a, b);
  });
});

describe('규칙 30 — 지난 날짜·고정·삭제', () => {
  test('지난 날짜는 previous 그대로 돌려준다(재판정하지 않는다)', () => {
    const s = tripStay();
    const first = trip(s);
    // 지난 날짜의 저장본에 표시가 있어도 그대로다 — 다시 만들지 않았다는 증거
    const previous = structuredClone(first.days);
    previous['2026-10-02'].intro = { text: '저장된 소개', source: 'TEMPLATE' };
    const changed = tripStay({}, { interests: ['SHOPPING'], hasCompanion: false });
    const result = trip(changed, { previous, now: at('2026-10-06', '12:00') });
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
      assert.deepEqual(result.days[date], previous[date], `${date} 는 바뀌지 않는다`);
    }
    // 미래 날짜는 바뀐 입력으로 다시 판정된다
    assert.equal(result.days['2026-10-08'].guardianOutings.length, 0, '보호자 없음으로 다시 판정');
  });

  test('고정 장소는 게이트를 통과하면 유지되고, 통과하지 못하면 제외 목록에 사유와 함께 남는다', () => {
    const s = tripStay({}, { interests: [] });
    const pool = [...tripPool('en'), park('7001', { title: '테스트 공원', north: 0.6, lang: 'en', en: 'Test Park' })];
    const edits = { '2026-10-08': { pinned: ['7001'], deleted: [], clearedMeals: [] } };
    const run = (weatherByDate) =>
      planTrip({
        stay: s,
        candidatesByLodging: byLodging(pool),
        airportTravel: AIRPORT_TRAVEL,
        lang: 'en',
        now: BEFORE_TRIP,
        edits,
        weatherByDate,
      });
    const clear = run({});
    assert.ok(contentIdsOf(clear.days['2026-10-08']).includes('7001'), '통과하면 유지');
    const rainy = run({ '2026-10-08': { outdoorUnsafe: true } });
    assert.ok(!contentIdsOf(rainy.days['2026-10-08']).includes('7001'), '통과하지 못하면 넣지 않는다');
    const ex = rainy.days['2026-10-08'].excluded.find((e) => e.candidateId === '7001');
    assert.ok(ex?.reasons.includes(REASON.WEATHER_BLOCKED));
  });

  test('삭제한 장소는 재계획에서 다시 자동 배치되지 않는다', () => {
    const s = tripStay();
    const first = trip(s);
    const victim = contentIdsOf(first.days['2026-10-07'])[0];
    const edits = { '2026-10-07': { pinned: [], deleted: [victim], clearedMeals: [] } };
    const result = trip(s, { previous: first.days, edits, now: at('2026-10-06', '08:00') });
    assert.ok(!contentIdsOf(result.days['2026-10-07']).includes(victim));
    const delta = result.days['2026-10-07'].delta;
    assert.equal(delta.hasVisibleChange, true);
    const gone = [...delta.removed, ...delta.replaced.map((r) => r.from)];
    assert.ok(gone.includes(`2026-10-07:P:${victim}`) || gone.includes(`2026-10-07:G:${victim}`));
  });
});

describe('규칙 51 — 언어 변경은 표시만 다시 쓴다 (relabelOnly)', () => {
  test('오늘 이후 날짜는 contentId·시각·상태가 그대로이고 이름·주소·번역 표시만 바뀐다. 전후 비교를 만들지 않는다', () => {
    const s = tripStay({}, { pace: 'NORMAL' });
    const en = trip(s, { lang: 'en' });
    const now = at('2026-10-05', '08:00');
    const result = planTrip({
      stay: s,
      candidatesByLodging: byLodging(tripPool('ja')),
      airportTravel: AIRPORT_TRAVEL,
      lang: 'ja',
      now,
      previous: en.days,
      relabelOnly: true,
    });
    const pool = new Map(tripPool('ja').map((c) => [c.stop.contentId, c]));
    let checked = 0;
    for (const [date, before] of Object.entries(en.days)) {
      const after = result.days[date];
      if (date < '2026-10-05') {
        assert.deepEqual(after, before, `${date}: 지난 날짜는 그대로`);
        continue;
      }
      assert.equal(after.dayState, before.dayState);
      assert.equal(after.delta, undefined, '전후 비교 없음');
      const flat = (d) =>
        [...d.outings, ...d.guardianOutings].map((o) => [o.id, o.departAt, o.returnBy, o.stops.map((x) => [x.contentId, x.arriveAt, x.leaveAt, x.pinned])]);
      assert.deepEqual(flat(after), flat(before));
      const beforeStops = stopsOf(before);
      stopsOf(after).forEach((stop, i) => {
        const cand = pool.get(stop.contentId);
        assert.equal(stop.title, cand.stop.title);
        assert.equal(stop.lang, cand.stop.lang);
        assert.deepEqual(stop.ko, beforeStops[i].ko, 'ko 원문은 그대로');
        assert.equal(stop.labels.includes('NEEDS_TRANSLATION'), cand.needsTranslation === true);
        checked += 1;
      });
    }
    assert.ok(checked > 5);
    assert.ok(stopsOf(result.days['2026-10-06']).some((x) => x.lang === 'ja'), '일본어 제목이 있으면 일본어로');
  });
});

describe('다시 만들기 (spec 4.10)', () => {
  const s = tripStay();
  const now = at('2026-10-06', '08:00');
  const base = trip(s, { now });
  const victim = contentIdsOf(base.days['2026-10-07'])[0];
  const edits = {
    '2026-10-03': { pinned: [], deleted: ['x'], clearedMeals: [] },
    '2026-10-07': { pinned: [], deleted: [victim], clearedMeals: ['LUNCH'] },
    '2026-10-09': { pinned: [], deleted: [], clearedMeals: ['DINNER'] },
  };
  const input = { stay: s, candidatesByLodging: byLodging(tripPool('en')), airportTravel: AIRPORT_TRAVEL, lang: 'en', now, edits };

  test("'이 날짜' — 그 날짜의 고정·삭제·비움 기록을 지우고 새로 만든다", () => {
    // 편집은 그 날짜만 재계획한다(T15a) — 다른 날짜의 배치는 previous 로 존중된다
    const edited = planTrip({ ...input, previous: base.days, dates: ['2026-10-07'] });
    assert.ok(!contentIdsOf(edited.days['2026-10-07']).includes(victim));
    const previous = { ...base.days, ...edited.days };
    const out = regenerate({ ...input, previous, scope: 'DAY', date: '2026-10-07' });
    assert.deepEqual(Object.keys(out.days), ['2026-10-07']);
    assert.deepEqual(Object.keys(out.edits).sort(), ['2026-10-03', '2026-10-09']);
    assert.ok(contentIdsOf(out.days['2026-10-07']).includes(victim), '삭제 기록이 지워져 다시 배치될 수 있다');
    assert.notEqual(out.days['2026-10-07'].mealSlots.find((m) => m.slot === 'LUNCH').status, 'CLEARED');
  });

  test("'오늘 이후 전체' — 오늘부터 끝까지의 기록만 지운다", () => {
    const out = regenerate({ ...input, scope: 'FROM_TODAY' });
    assert.deepEqual(Object.keys(out.edits), ['2026-10-03']);
    assert.deepEqual(Object.keys(out.days), stayDates(s).filter((d) => d >= '2026-10-06'));
  });

  test('지난 날짜는 다시 만들 수 없다', () => {
    assert.throws(() => regenerate({ ...input, scope: 'DAY', date: '2026-10-03' }), RangeError);
    assert.throws(() => regenerate({ ...input, scope: 'WEEK' }), RangeError);
  });
});

describe('45박 체류 처리 시간', () => {
  test('45박(46일)·후보 300곳을 적정 시간 안에 만든다', () => {
    const s = stay({
      departure: { date: '2026-11-15', time: '23:00', airport: 'ICN' },
      lodgings: [
        { id: 'L1', name: '테스트 숙소', address: { roadAddress: '테스트로 1', lat: 37.5, lng: 127.03, source: 'DEMO' }, checkIn: '2026-10-01', checkOut: '2026-11-15' },
      ],
      periods: [period({ walkLimit: SET(60) }, { startDate: '2026-10-04', endDate: '2026-11-15' })],
      pace: 'NORMAL',
    });
    const pool = tripPool('en', 300);
    const started = performance.now();
    const result = planTrip({ stay: s, candidatesByLodging: byLodging(pool), airportTravel: AIRPORT_TRAVEL, lang: 'en', now: BEFORE_TRIP });
    const elapsed = performance.now() - started;
    assert.equal(Object.keys(result.days).length, 46);
    const auto = Object.values(result.days).flatMap((d) => stopsOf(d).map((x) => x.contentId));
    assert.equal(new Set(auto).size, auto.length);
    console.log(`[AX-307] 45박 체류 전체 일정: ${elapsed.toFixed(0)}ms (정거장 ${auto.length}곳, 후보 300곳)`);
    assert.ok(elapsed < 5000, `45박 처리 ${elapsed.toFixed(0)}ms`);
  });
});
